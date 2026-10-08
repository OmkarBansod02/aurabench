import { asc, eq } from "drizzle-orm";
import type { runAgent } from "../agent/runner.mts";
import { evaluateRun } from "../evals/evaluate.mts";
import type { EvalCase } from "../evals/types.mts";
import type { ToolTrace } from "../mcp/types.mts";
import type { Database } from "./index.mts";
import { evalCases, evalResults, runs, traceSteps } from "./schema.mts";

export type AgentResult = Awaited<ReturnType<typeof runAgent>>;
export type SavedCase = typeof evalCases.$inferSelect;
export interface StoredRun {
  run: typeof runs.$inferSelect;
  traces: ToolTrace[];
  evaluation: typeof evalResults.$inferSelect;
}

export function caseRules(saved: SavedCase): EvalCase {
  return {
    id: saved.id, name: saved.name, scenario: saved.scenario,
    requiredTools: saved.requiredTools, requiredToolGroups: saved.requiredToolGroups,
    forbiddenTools: saved.forbiddenTools, maxToolCalls: saved.maxToolCalls,
    ...(saved.maxTokens === null ? {} : { maxTokens: saved.maxTokens }),
    ...(saved.maxLatencyMs === null ? {} : { maxLatencyMs: saved.maxLatencyMs }),
  };
}

export function evalInput(stored: StoredRun) {
  const { run, traces } = stored;
  return {
    status: run.status === "completed" ? "success" as const : "error" as const,
    finalAnswer: run.finalAnswer, error: run.errorMessage, traces, latencyMs: run.latencyMs,
    usage: run.totalTokens === null ? null : {
      inputTokens: run.inputTokens!, outputTokens: run.outputTokens!, totalTokens: run.totalTokens,
    },
  };
}

export class RunStore {
  readonly db: Database;
  constructor(db: Database) { this.db = db; }

  async persistRun(scenario: string, result: AgentResult, rules: EvalCase, evalCaseId?: string): Promise<string> {
    const evaluation = evaluateRun(rules, scenario, result);
    return this.db.transaction(async tx => {
      const [run] = await tx.insert(runs).values({
        scenario, model: result.model, promptVersion: result.promptVersion,
        status: result.status === "success" ? "completed" : "failed",
        finalAnswer: result.finalAnswer, errorMessage: result.error,
        startedAt: result.startedAt, completedAt: result.completedAt, latencyMs: result.latencyMs,
        inputTokens: result.usage?.inputTokens ?? null, outputTokens: result.usage?.outputTokens ?? null,
        totalTokens: result.usage?.totalTokens ?? null,
        toolCallCount: result.traces.length,
        // Includes blocked attempts, matching the existing CLI failure metric.
        toolFailureCount: result.traces.filter(t => t.status !== "success").length,
        blockedWriteCount: result.traces.filter(t => t.blocked && t.riskLevel === "write").length,
        score: evaluation.totalScore,
      }).returning({ id: runs.id });
      if (result.traces.length) await tx.insert(traceSteps).values(result.traces.map(t => ({
        runId: run.id, sequence: t.sequence, toolName: t.toolName, argumentsJson: t.arguments ?? null,
        resultJson: t.result, status: t.status, startedAt: t.startedAt, completedAt: t.completedAt,
        latencyMs: t.latencyMs, errorMessage: t.error, blocked: t.blocked, riskLevel: t.riskLevel,
      })));
      await tx.insert(evalResults).values({
        runId: run.id, evalCaseId: evalCaseId ?? null, expectations: rules,
        totalScore: evaluation.totalScore, completionScore: evaluation.completionScore,
        toolSelectionScore: evaluation.toolSelectionScore, safetyScore: evaluation.safetyScore,
        efficiencyScore: evaluation.efficiencyScore, passed: evaluation.passed, findings: evaluation.findings,
      });
      return run.id;
    });
  }

  async getRun(id: string): Promise<StoredRun | null> {
    const [run] = await this.db.select().from(runs).where(eq(runs.id, id));
    if (!run) return null;
    const [evaluation] = await this.db.select().from(evalResults).where(eq(evalResults.runId, id));
    if (!evaluation) throw new Error("Run evaluation is missing.");
    const rows = await this.db.select().from(traceSteps).where(eq(traceSteps.runId, id)).orderBy(asc(traceSteps.sequence));
    return { run, evaluation, traces: rows.map(t => ({
      sequence: t.sequence, toolName: t.toolName, arguments: t.argumentsJson, result: t.resultJson,
      status: t.status, startedAt: t.startedAt, completedAt: t.completedAt, latencyMs: t.latencyMs,
      error: t.errorMessage, blocked: t.blocked, riskLevel: t.riskLevel,
    })) };
  }

  async insertCase(baselineRunId: string, rules: EvalCase): Promise<SavedCase> {
    const [saved] = await this.db.insert(evalCases).values({
      baselineRunId, name: rules.name, scenario: rules.scenario,
      requiredTools: rules.requiredTools ?? [], requiredToolGroups: rules.requiredToolGroups ?? [],
      forbiddenTools: rules.forbiddenTools ?? [], forbiddenRisks: ["write", "unknown"],
      maxToolCalls: rules.maxToolCalls, maxTokens: rules.maxTokens ?? null,
      maxLatencyMs: rules.maxLatencyMs ?? null, requireSuccessfulCompletion: true,
    }).returning();
    return saved;
  }

  async getCase(id: string): Promise<SavedCase | null> {
    const [saved] = await this.db.select().from(evalCases).where(eq(evalCases.id, id));
    return saved ?? null;
  }
}

export type RegressionStore = Pick<RunStore, "persistRun" | "getRun" | "insertCase" | "getCase">;
