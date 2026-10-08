import { getPrompt, type PromptVersion } from "../agent/prompts.mts";
import { performance } from "node:perf_hooks";
import { runAgent } from "../agent/runner.mts";
import { createOpenAIResponder } from "../llm/client.mts";
import { connectPingAura } from "../mcp/client.mts";
import type { EvalCase } from "../evals/types.mts";
import { caseRules, type AgentResult, type RegressionStore } from "../db/queries.mts";
import { compareRuns } from "./compare.mts";

export interface RunOptions { scenario: string; model: string; promptVersion: PromptVersion }
export type ExecuteAgent = (options: RunOptions) => Promise<AgentResult>;

export const executeLiveAgent: ExecuteAgent = async options => {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  let connection: Awaited<ReturnType<typeof connectPingAura>> | undefined;
  try {
    const respond = createOpenAIResponder();
    connection = await connectPingAura();
    return await runAgent({ ...options, gateway: connection.gateway, respond });
  } catch {
    return {
      status: "error", finalAnswer: "", error: "Agent setup failed. Check provider credentials and MCP connectivity.",
      steps: 0, model: options.model, promptVersion: options.promptVersion,
      traces: connection?.gateway.traces ?? [], usage: null, startedAt,
      completedAt: new Date().toISOString(), latencyMs: Number((performance.now() - started).toFixed(2)),
    };
  } finally {
    // Cleanup must not discard a finished run and its trace.
    await connection?.close().catch(() => { console.error("MCP connection cleanup failed."); });
  }
};

function validateRules(rules: EvalCase) {
  if (!rules.name.trim() || !rules.scenario.trim()) throw new Error("Regression name and scenario are required.");
  for (const value of [rules.maxToolCalls, rules.maxTokens]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Tool/token budgets must be nonnegative integers.");
  }
  if (rules.maxLatencyMs !== undefined && (!Number.isFinite(rules.maxLatencyMs) || rules.maxLatencyMs < 0)) {
    throw new Error("Latency budget must be nonnegative.");
  }
  const names = [...(rules.requiredTools ?? []), ...(rules.forbiddenTools ?? [])];
  for (const group of rules.requiredToolGroups ?? []) {
    if (!group.name.trim() || !group.tools.length) throw new Error("Required groups must have a name and at least one tool.");
    names.push(...group.tools);
  }
  if (names.some(name => !name.trim())) throw new Error("Tool names must not be empty.");
}

export class RegressionService {
  readonly store: RegressionStore;
  readonly execute: ExecuteAgent;
  constructor(store: RegressionStore, execute: ExecuteAgent = executeLiveAgent) {
    this.store = store;
    this.execute = execute;
  }

  async run(options: RunOptions, rules: EvalCase, evalCaseId?: string) {
    getPrompt(options.promptVersion);
    validateRules(rules);
    if (!options.model.trim()) throw new Error("Model is required.");
    if (options.scenario !== rules.scenario) throw new Error("Run scenario must match eval rules.");
    const result = await this.execute(options);
    return this.store.persistRun(options.scenario, result, rules, evalCaseId);
  }

  async saveAsRegression(runId: string, name: string, overrides: Partial<Pick<EvalCase,
    "requiredTools" | "requiredToolGroups" | "forbiddenTools" | "maxToolCalls" | "maxTokens" | "maxLatencyMs">> = {}) {
    const baseline = await this.store.getRun(runId);
    if (!baseline) throw new Error("Baseline run not found.");
    if (baseline.run.status !== "completed") throw new Error("Only completed runs can be saved as regressions.");
    const rules = structuredClone({ ...baseline.evaluation.expectations, ...overrides, name, scenario: baseline.run.scenario });
    validateRules(rules);
    return this.store.insertCase(runId, rules);
  }

  async replay(evalCaseId: string, options: { model?: string; promptVersion?: PromptVersion } = {}) {
    const saved = await this.store.getCase(evalCaseId);
    if (!saved) throw new Error("Regression not found.");
    const baseline = await this.store.getRun(saved.baselineRunId);
    if (!baseline) throw new Error("Baseline run not found.");
    const rules = caseRules(saved);
    const candidateRunId = await this.run({
      scenario: saved.scenario, model: options.model ?? baseline.run.model,
      promptVersion: options.promptVersion ?? baseline.run.promptVersion,
    }, rules, saved.id);
    return { candidateRunId, comparison: await this.compare(saved.id, candidateRunId) };
  }

  async compare(evalCaseId: string, candidateRunId: string) {
    const saved = await this.store.getCase(evalCaseId);
    if (!saved) throw new Error("Regression not found.");
    const baseline = await this.store.getRun(saved.baselineRunId);
    if (!baseline) throw new Error("Baseline run not found.");
    const candidate = await this.store.getRun(candidateRunId);
    if (!candidate) throw new Error("Candidate run not found.");
    if (candidate.evaluation.evalCaseId !== saved.id) throw new Error("Candidate does not belong to this regression.");
    return compareRuns(caseRules(saved), baseline, candidate);
  }
}
