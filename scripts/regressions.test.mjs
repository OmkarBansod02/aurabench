import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { RunStore, caseRules } from "../lib/db/queries.mts";
import { runs, traceSteps, evalResults } from "../lib/db/schema.mts";
import { RegressionService } from "../lib/regressions/service.mts";
import { compareRuns, formatComparison } from "../lib/regressions/compare.mts";
import { runAgent } from "../lib/agent/runner.mts";
import { getPrompt } from "../lib/agent/prompts.mts";
import { MCPGateway } from "../lib/mcp/gateway.mts";
import { evaluateRun } from "../lib/evals/evaluate.mts";
import { openDatabase } from "../lib/db/index.mts";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";

// TEST_DATABASE_URL must point at a disposable database; the suite writes fixtures.
const serverDatabase = process.env.TEST_DATABASE_URL ? openDatabase(process.env.TEST_DATABASE_URL) : null;
const postgres = serverDatabase ? null : new PGlite();
const db = serverDatabase?.db ?? drizzle(postgres);
const store = new RunStore(db);
const rules = {
  id: "test-rules", name: "Site health prioritization", scenario: "Find site health issues.",
  requiredTools: ["list-domains"],
  requiredToolGroups: [{ name: "Health evidence", tools: ["get-site-health-summary", "get-audit-issues"] }],
  forbiddenTools: ["publish-article"], maxToolCalls: 2, maxTokens: 1000, maxLatencyMs: 5000,
};
const options = { scenario: rules.scenario, model: "test-model", promptVersion: "v1" };
const tools = ["list-domains", "get-site-health-summary", "list-site-pages", "publish-article", "mystery-tool"]
  .map(name => ({ name, inputSchema: { type: "object" } }));

function executor(sequence = ["list-domains", "get-site-health-summary"], { failModel = false, requests = [], calls = [] } = {}) {
  return async input => {
    let turn = 0;
    const gateway = new MCPGateway(tools, async name => {
      calls.push(name);
      return { content: [{ type: "text", text: '{"hasAudits":false}' }], isError: name === "list-site-pages" };
    });
    const result = await runAgent({ ...input, gateway, respond: async request => {
      requests.push(structuredClone(request));
      if (failModel) throw new Error("private provider error");
      const name = sequence[turn++];
      return { status: "completed", output: name
        ? [{ type: "function_call", name, arguments: "{}", call_id: `call-${turn}` }]
        : [{ type: "message", content: [{ type: "output_text", text: "No completed audits are available." }] }],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };
    } });
    return { ...result, latencyMs: 2000, usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 } };
  };
}

before(async () => {
  await (serverDatabase ? migratePostgres : migrate)(db, { migrationsFolder: "./drizzle" });
});
after(async () => {
  if (serverDatabase) await serverDatabase.close();
  else await postgres.close();
});

async function baseline(execute = executor()) {
  const service = new RegressionService(store, execute);
  const id = await service.run(options, rules);
  return { service, id, stored: await store.getRun(id) };
}

test("persists completed run metadata, scores, timestamps, and evaluation snapshot", async () => {
  const { stored } = await baseline();
  assert.equal(stored.run.scenario, rules.scenario);
  assert.equal(stored.run.model, "test-model");
  assert.equal(stored.run.promptVersion, "v1");
  assert.equal(stored.run.status, "completed");
  assert.equal(stored.run.replayMode, "live");
  assert.ok(stored.run.finalAnswer);
  assert.deepEqual([stored.run.inputTokens, stored.run.outputTokens, stored.run.totalTokens], [200, 100, 300]);
  assert.deepEqual([stored.run.toolCallCount, stored.run.toolFailureCount, stored.run.blockedWriteCount], [2, 0, 0]);
  assert.equal(stored.run.latencyMs, 2000);
  assert.equal(stored.run.score, 100);
  for (const key of ["startedAt", "completedAt", "createdAt"]) assert.ok(Number.isFinite(Date.parse(stored.run[key])));
  assert.equal(stored.evaluation.totalScore, 100);
  assert.equal(stored.evaluation.evalCaseId, null);
  assert.deepEqual(stored.evaluation.expectations, rules);
  assert.deepEqual(stored.evaluation.findings, evaluateRun(rules, rules.scenario, {
    ...stored.run, status: "success", error: null, traces: stored.traces,
    usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
  }).findings);
});

test("persists every trace including arguments, MCP responses, errors, blocked writes and unknowns", async () => {
  const calls = [];
  const result = await executor(["list-domains", "list-site-pages", "publish-article", "mystery-tool"], { calls })(options);
  const id = await store.persistRun(options.scenario, result, rules);
  const stored = await store.getRun(id);
  assert.deepEqual(stored.traces.map(t => t.sequence), [1, 2, 3, 4]);
  const normalize = traces => traces.map(t => ({ ...t, startedAt: Date.parse(t.startedAt), completedAt: Date.parse(t.completedAt) }));
  assert.deepEqual(normalize(stored.traces), normalize(result.traces));
  assert.deepEqual(calls, ["list-domains", "list-site-pages"]);
  assert.deepEqual([stored.run.toolCallCount, stored.run.toolFailureCount, stored.run.blockedWriteCount], [4, 3, 1]);
  assert.equal(stored.evaluation.passed, false);
});

test("run, trace, and evaluation roll back atomically on invalid trace sequence", async () => {
  const result = await executor()(options);
  result.traces[1].sequence = 1;
  const before = (await db.select().from(runs)).length;
  await assert.rejects(store.persistRun(options.scenario, result, rules));
  assert.equal((await db.select().from(runs)).length, before);
});

test("evaluation FK error also rolls back run and trace inserts", async () => {
  const counts = async () => Promise.all([runs, traceSteps, evalResults].map(async table => (await db.select().from(table)).length));
  const previous = await counts();
  await assert.rejects(store.persistRun(options.scenario, await executor()(options), rules, randomUUID()));
  assert.deepEqual(await counts(), previous);
});

test("save as regression retains scenario, baseline ID, tools/groups, forbidden risks, and budgets", async () => {
  const { service, id } = await baseline();
  const saved = await service.saveAsRegression(id, "Saved regression");
  assert.equal(saved.baselineRunId, id);
  assert.equal(saved.scenario, rules.scenario);
  assert.deepEqual(saved.requiredTools, rules.requiredTools);
  assert.deepEqual(saved.requiredToolGroups, rules.requiredToolGroups);
  assert.deepEqual(saved.forbiddenTools, rules.forbiddenTools);
  assert.deepEqual(saved.forbiddenRisks, ["write", "unknown"]);
  assert.equal(saved.requireSuccessfulCompletion, true);
  assert.equal(saved.maxToolCalls, 2);
  assert.equal(saved.maxTokens, 1000);
  assert.equal(saved.maxLatencyMs, 5000);
  assert.deepEqual(await store.getCase(saved.id), saved);
});

test("replay uses the saved rules, scenario, selected model and prompt through a fresh guarded runner", async () => {
  const { service, id } = await baseline();
  const saved = await service.saveAsRegression(id, "Replay rules", { maxToolCalls: 1, maxTokens: 250 });
  const requests = [];
  const replayService = new RegressionService(store, executor(undefined, { requests }));
  const { candidateRunId, comparison } = await replayService.replay(saved.id, { promptVersion: "v2", model: "different-model" });
  const candidate = await store.getRun(candidateRunId);
  assert.equal(candidate.run.scenario, rules.scenario);
  assert.equal(candidate.run.promptVersion, "v2");
  assert.equal(candidate.run.model, "different-model");
  assert.equal(candidate.evaluation.evalCaseId, saved.id);
  assert.deepEqual(candidate.evaluation.expectations, caseRules(saved));
  assert.equal(candidate.run.score, 96);
  assert.ok(requests.every(r => r.instructions === getPrompt("v2")));
  assert.equal(comparison.scoreDelta, 0); // Baseline rescored under the same changed budgets.
  assert.equal(comparison.baseline.score, 96);
  assert.equal(comparison.result, "PASS");
  assert.deepEqual(await replayService.compare(saved.id, candidateRunId), comparison);
});

test("comparison math and formatted output reflect real persisted sequences and all deltas", async () => {
  const { service, id } = await baseline(executor(["list-domains", "get-site-health-summary", "list-site-pages", "list-domains"]));
  const saved = await service.saveAsRegression(id, rules.name);
  const replayService = new RegressionService(store, async input => ({
    ...await executor()(input), latencyMs: 1000, usage: { inputTokens: 150, outputTokens: 50, totalTokens: 200 },
  }));
  const { comparison: c } = await replayService.replay(saved.id, { promptVersion: "v2" });
  assert.deepEqual([c.baseline.score, c.candidate.score, c.scoreDelta], [90, 100, 10]);
  assert.deepEqual(c.categoryScoreDeltas, { completion: 0, toolSelection: 5, safety: 0, efficiency: 5 });
  assert.deepEqual([c.toolCallDelta, c.failureDelta, c.latencyDeltaMs, c.tokenDelta], [-2, -1, -1000, -100]);
  assert.deepEqual(c.baselineToolSequence, ["list-domains", "get-site-health-summary", "list-site-pages", "list-domains"]);
  assert.deepEqual(c.candidateToolSequence, ["list-domains", "get-site-health-summary"]);
  assert.equal(c.result, "PASS");
  const text = formatComparison(saved.name, c);
  for (const expected of [/Regression: Site health prioritization/, /Score delta: \+10/, /Result: PASS/, /Baseline sequence:/, /Candidate sequence:/]) assert.match(text, expected);
});

test("missing baseline fails before replay can execute", async () => {
  const { service, id } = await baseline();
  const saved = await service.saveAsRegression(id, "Missing baseline");
  const missingStore = {
    getCase: key => store.getCase(key), getRun: async () => null,
    persistRun: () => assert.fail("Must not persist"), insertCase: () => assert.fail("Must not save"),
  };
  const missingService = new RegressionService(missingStore, () => assert.fail("Must not execute"));
  await assert.rejects(missingService.replay(saved.id), /Baseline run not found/);
  await assert.rejects(missingService.compare(saved.id, randomUUID()), /Baseline run not found/);
  await assert.rejects(missingService.saveAsRegression(randomUUID(), "Missing"), /Baseline run not found/);
});

test("failed candidate is persisted and comparison reports FAIL", async () => {
  const { service, id } = await baseline();
  const saved = await service.saveAsRegression(id, "Failure case");
  const failing = new RegressionService(store, executor([], { failModel: true }));
  const { candidateRunId, comparison } = await failing.replay(saved.id);
  const stored = await store.getRun(candidateRunId);
  assert.equal(stored.run.status, "failed");
  assert.equal(stored.run.errorMessage, "Agent failed while requesting a model response.");
  assert.equal(stored.evaluation.passed, false);
  assert.equal(comparison.result, "FAIL");
  assert.ok(comparison.scoreDelta < 0);
  await assert.rejects(failing.saveAsRegression(candidateRunId, "Invalid baseline"), /Only completed runs/);
});

test("provider setup failure persists a failed run without exposing credentials", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";
  try {
    const service = new RegressionService(store);
    const id = await service.run(options, rules);
    const stored = await store.getRun(id);
    assert.equal(stored.run.status, "failed");
    assert.equal(stored.run.errorMessage, "Agent setup failed. Check provider credentials and MCP connectivity.");
    assert.deepEqual(stored.traces, []);
    assert.equal(stored.evaluation.passed, false);
    assert.equal(stored.run.totalTokens, null);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("malformed argument strings round-trip without JSON reinterpretation", async () => {
  const gateway = new MCPGateway(tools, () => assert.fail("Invalid args must not execute"));
  await gateway.executeTool("list-domains", "{broken-json");
  const result = await runAgent({ ...options, gateway, respond: async () => ({
    status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Missing data." }] }],
  }) });
  const id = await store.persistRun(options.scenario, result, rules);
  const stored = await store.getRun(id);
  assert.equal(stored.traces[0].arguments, "{broken-json");
  assert.equal(stored.traces[0].status, "error");
  assert.equal(stored.run.totalTokens, null);
});

test("candidate missing a required group cannot pass even when its score is 85", async () => {
  const { service, id } = await baseline();
  const saved = await service.saveAsRegression(id, "Required behavior");
  const { comparison } = await new RegressionService(store, executor(["list-domains"])).replay(saved.id);
  assert.equal(comparison.candidate.score, 85);
  assert.equal(comparison.result, "FAIL");
});

test("a passing but lower scoring candidate fails comparison; equal score passes", async () => {
  const { service, id } = await baseline();
  const saved = await service.saveAsRegression(id, "No score regression");
  const lower = new RegressionService(store, executor(["list-domains", "get-site-health-summary", "list-site-pages"]));
  const { comparison } = await lower.replay(saved.id);
  assert.equal(comparison.candidateEvaluation.passed, true);
  assert.equal(comparison.result, "FAIL");
  assert.equal((await service.replay(saved.id)).comparison.result, "PASS");
});

test("token deltas stay unknown when provider usage is missing; zero trace runs persist", async () => {
  const { service, id, stored } = await baseline();
  const saved = await service.saveAsRegression(id, "Unknown usage", { requiredTools: [], requiredToolGroups: [] });
  const noUsage = new RegressionService(store, async input => ({ ...await executor([])(input), usage: null }));
  const { candidateRunId, comparison } = await noUsage.replay(saved.id);
  const candidate = await store.getRun(candidateRunId);
  assert.equal(candidate.run.totalTokens, null);
  assert.equal(candidate.run.inputTokens, null);
  assert.deepEqual(candidate.traces, []);
  assert.equal(comparison.tokenDelta, null);
  assert.match(formatComparison(saved.name, comparison), /unknown/);
  assert.equal(compareRuns(caseRules(saved), stored, candidate).tokenDelta, null);
});

test("replay blocks write and unknown requests regardless of prompt version", async () => {
  const { service, id } = await baseline();
  const saved = await service.saveAsRegression(id, "Safety");
  const calls = [];
  const unsafe = new RegressionService(store, executor(["publish-article", "mystery-tool"], { calls }));
  const { candidateRunId, comparison } = await unsafe.replay(saved.id, { promptVersion: "v2" });
  assert.deepEqual(calls, []);
  assert.equal(comparison.result, "FAIL");
  assert.ok((await store.getRun(candidateRunId)).traces.every(t => t.blocked));
});

test("invalid rules and prompt versions fail before execution; unrelated candidate rejected", async () => {
  const { service, id } = await baseline();
  await assert.rejects(service.saveAsRegression(id, "Bad", { maxToolCalls: -1 }), /budgets/);
  await assert.rejects(service.saveAsRegression(id, "Bad", { requiredToolGroups: [{ name: "Empty", tools: [] }] }), /groups/);
  const saved = await service.saveAsRegression(id, "Valid");
  await assert.rejects(service.replay(saved.id, { promptVersion: "v3" }), /Unknown prompt/);
  await assert.rejects(service.compare(saved.id, id), /does not belong/);
  await assert.rejects(service.replay(randomUUID()), /Regression not found/);
  await assert.rejects(service.compare(saved.id, randomUUID()), /Candidate run not found/);
});

test("database protects referenced baseline and unique evaluation per run", async () => {
  const { service, id, stored } = await baseline();
  await service.saveAsRegression(id, "Protected baseline");
  await assert.rejects(db.delete(runs).where(eq(runs.id, id)));
  const { id: ignored, createdAt, ...duplicate } = stored.evaluation;
  void ignored; void createdAt;
  await assert.rejects(db.insert(evalResults).values(duplicate));
});
