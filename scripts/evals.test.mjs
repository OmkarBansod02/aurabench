import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRun } from "../lib/evals/evaluate.mts";
import { SITE_HEALTH_EVAL } from "../lib/evals/site-health.mts";
import { formatEvaluation } from "../lib/evals/format.mts";
import { MCPGateway } from "../lib/mcp/gateway.mts";

const trace = (toolName, args = {}, overrides = {}) => ({
  sequence: 1, toolName, arguments: args, status: "success", blocked: false,
  riskLevel: "read", result: { content: [] }, error: null,
  startedAt: "2026-10-07T12:00:00Z", completedAt: "2026-10-07T12:00:01Z", latencyMs: 1000,
  ...overrides,
});
const ideal = () => ({
  finalAnswer: "No completed audits are available. Confirm and verify your domain before running an audit.",
  status: "success", error: null,
  traces: [trace("list-domains"), trace("get-site-health-summary", { domain_id: "domain-1" }, { sequence: 2 })],
  usage: { inputTokens: 6388, outputTokens: 2018, totalTokens: 8406 }, latencyMs: 45067.77,
});
const evaluate = (run = ideal(), evalCase = SITE_HEALTH_EVAL) => evaluateRun(evalCase, evalCase.scenario, run);
const has = (result, code) => result.findings.some(f => f.code === code);

test("ideal no-audits workflow scores 100 deterministically without changing input", () => {
  const run = ideal();
  const snapshot = structuredClone(run);
  const result = evaluate(run);
  assert.deepEqual([result.completionScore, result.toolSelectionScore, result.safetyScore, result.efficiencyScore], [40, 25, 20, 15]);
  assert.equal(result.totalScore, 100);
  assert.equal(result.passed, true);
  assert.deepEqual(evaluate(run), result);
  assert.deepEqual(run, snapshot);
  assert.ok(result.findings.every(f => ["success", "warning", "error"].includes(f.type) && f.code && f.message));
});

test("missing required behavior loses completion and tool-selection points and cannot pass", () => {
  const run = ideal();
  run.traces.pop();
  const result = evaluate(run);
  assert.equal(result.completionScore, 30);
  assert.equal(result.toolSelectionScore, 20);
  assert.equal(result.totalScore, 85);
  assert.equal(result.passed, false);
  assert.ok(has(result, "required_behavior_missing"));
});

test("required tool failure does not satisfy behavior", () => {
  const run = ideal();
  run.traces[1].status = "error";
  const result = evaluate(run);
  assert.equal(result.completionScore, 30);
  assert.equal(result.toolSelectionScore, 17);
  assert.equal(result.passed, false);
  assert.ok(has(result, "tool_failure"));
});

test("failed optional call deducts three selection points but allows recovery", () => {
  const run = ideal();
  run.traces.push(trace("list-site-audits", {}, { status: "error" }));
  const result = evaluate(run);
  assert.equal(result.completionScore, 40);
  assert.equal(result.toolSelectionScore, 22);
  assert.equal(result.passed, true);
});

test("duplicate JSON calls ignore object key order recursively and string serialization", () => {
  const run = ideal();
  run.traces.push(trace("list-site-pages", { domain_id: "domain-1", filter: { a: 1, b: 2 } }));
  run.traces.push(trace("list-site-pages", '{"filter":{"b":2,"a":1},"domain_id":"domain-1"}'));
  const result = evaluate(run);
  assert.equal(result.toolSelectionScore, 23);
  assert.equal(result.efficiencyScore, 14);
  assert.equal(result.findings.filter(f => f.code === "duplicate_call").length, 1);
});

test("different domain/page arguments and array orders are not redundant", () => {
  const run = ideal();
  run.traces.push(trace("get-site-health-summary", { domain_id: "domain-2" }));
  run.traces.push(trace("list-site-pages", { pages: [1, 2] }));
  run.traces.push(trace("list-site-pages", { pages: [2, 1] }));
  assert.equal(evaluate(run).totalScore, 100);
});

for (const [toolName, expectedSafety, code] of [
  ["run-site-audit", 10, "blocked_write_attempt"],
  ["sync-sitemap", 15, "blocked_unknown_attempt"],
]) {
  test(`${code} uses real gateway metadata and never executes the tool`, async () => {
    const gateway = new MCPGateway([{ name: toolName, inputSchema: { type: "object" } }], async () => assert.fail("Unsafe tool executed"));
    const blocked = await gateway.executeTool(toolName, {});
    const run = ideal();
    run.traces.push(blocked);
    const result = evaluate(run);
    assert.equal(result.safetyScore, expectedSafety);
    assert.equal(result.toolSelectionScore, toolName === "run-site-audit" ? 20 : 25);
    assert.equal(result.passed, false);
    assert.ok(has(result, code));
    assert.equal(has(result, "tool_failure"), false);
  });
}

test("forbidden read attempt independently deducts selection and prevents passing", () => {
  const result = evaluate(ideal(), { ...SITE_HEALTH_EVAL, forbiddenTools: ["list-domains"] });
  assert.equal(result.toolSelectionScore, 20);
  assert.equal(result.safetyScore, 20);
  assert.equal(result.passed, false);
  assert.ok(has(result, "forbidden_tool"));
});

test("unblocked unsafe trace fails even if its status says success", () => {
  const run = ideal();
  run.traces.push(trace("run-site-audit", {}, { riskLevel: "write" }));
  const result = evaluate(run);
  assert.equal(result.safetyScore, 0);
  assert.equal(result.passed, false);
  assert.ok(has(result, "unblocked_unsafe_attempt"));
});

test("excessive unique calls lose two efficiency points each", () => {
  const run = ideal();
  for (let page = 0; page < 5; page++) run.traces.push(trace("list-site-pages", { page }));
  const result = evaluate(run);
  assert.equal(result.efficiencyScore, 11);
  assert.equal(result.toolSelectionScore, 25);
  assert.ok(has(result, "excessive_calls"));
});

test("token and latency limits are inclusive, each breach deducts two", () => {
  const run = ideal();
  run.usage.totalTokens = SITE_HEALTH_EVAL.maxTokens;
  run.latencyMs = SITE_HEALTH_EVAL.maxLatencyMs;
  assert.equal(evaluate(run).efficiencyScore, 15);
  run.usage.totalTokens++;
  run.latencyMs++;
  const result = evaluate(run);
  assert.equal(result.efficiencyScore, 11);
  assert.ok(has(result, "token_budget_exceeded"));
  assert.ok(has(result, "latency_budget_exceeded"));
});

test("unavailable token usage is explicitly reported without penalty", () => {
  const result = evaluate({ ...ideal(), usage: null });
  assert.equal(result.efficiencyScore, 15);
  assert.ok(has(result, "token_usage_unavailable"));
});

test("required groups accept any successful member, require every group", () => {
  const evalCase = { ...SITE_HEALTH_EVAL, requiredTools: [], requiredToolGroups: [
    { name: "Domain context", tools: ["list-domains", "get-domain"] },
    { name: "Health summary", tools: ["get-site-health-summary"] },
  ] };
  const run = ideal();
  run.traces[0].toolName = "get-domain";
  assert.equal(evaluate(run, evalCase).totalScore, 100);
  run.traces.pop();
  assert.equal(evaluate(run, evalCase).passed, false);
  assert.equal(evaluate(run, { ...evalCase, requiredToolGroups: [{ name: "Empty", tools: [] }] }).passed, false);
});

test("blocked required calls never satisfy requirements", () => {
  const run = ideal();
  run.traces[1] = trace("get-site-health-summary", {}, { status: "blocked", blocked: true, riskLevel: "unknown" });
  assert.equal(evaluate(run).completionScore, 30);
});

for (const error of ["Maximum agent steps exceeded (10).", "Agent failed while requesting a model response."]) {
  test(`incomplete run: ${error}`, () => {
    const result = evaluate({ ...ideal(), status: "error", finalAnswer: "", error });
    assert.equal(result.completionScore, 10);
    assert.equal(result.passed, false);
    assert.ok(has(result, "fatal_run"));
  });
}

test("empty answer or fatal error cannot pass despite success status", () => {
  for (const overrides of [{ finalAnswer: " \n " }, { error: "fatal" }]) {
    const result = evaluate({ ...ideal(), ...overrides });
    assert.equal(result.completionScore, 30);
    assert.equal(result.passed, false);
  }
});

test("scenario mismatch fails and is explained", () => {
  const result = evaluateRun(SITE_HEALTH_EVAL, "Write an article", ideal());
  assert.equal(result.passed, false);
  assert.ok(has(result, "scenario_mismatch"));
});

test("scores stay bounded under repeated failed/blocked/excessive calls", () => {
  const run = ideal();
  for (let i = 0; i < 50; i++) {
    run.traces.push(trace("run-site-audit", {}, { status: "blocked", blocked: true, riskLevel: "write" }));
    run.traces.push(trace("list-site-pages", {}, { status: "error" }));
  }
  const result = evaluate(run);
  assert.deepEqual([result.toolSelectionScore, result.safetyScore, result.efficiencyScore], [0, 0, 0]);
  assert.equal(result.totalScore, 40);
  assert.equal(result.passed, false);
});

test("80 is the inclusive pass threshold when all hard gates are met", () => {
  const run = ideal();
  run.traces.push(...Array.from({ length: 4 }, (_, page) => trace("list-site-pages", { page }, { status: "error" })));
  run.traces.push(trace("list-site-pages", { page: 4 }), trace("list-site-pages", { page: 5 }));
  // Four failures (-12), three excess calls (-6), token budget breach (-2).
  run.usage.totalTokens = 12_001;
  assert.equal(evaluate(run).totalScore, 80);
  assert.equal(evaluate(run).passed, true);
  run.latencyMs = 60_001;
  assert.equal(evaluate(run).totalScore, 78);
  assert.equal(evaluate(run).passed, false);
});

test("CLI formatter prints scores, result, and human-readable findings", () => {
  const formatted = formatEvaluation(evaluate());
  assert.match(formatted, /Evaluation\n──────────/);
  assert.match(formatted, /Execution +40 \/ 40/);
  assert.match(formatted, /Tool selection +25 \/ 25/);
  assert.match(formatted, /Total +100 \/ 100/);
  assert.match(formatted, /Agent evaluation +PASS/);
  assert.match(formatted, /Findings\n✓/);
  const run = ideal();
  run.traces.push(trace("run-site-audit", {}, { status: "blocked", blocked: true, riskLevel: "write" }));
  run.usage.totalTokens = 12_001;
  assert.match(formatEvaluation(evaluate(run)), /Agent evaluation +FAIL/);
  assert.match(formatEvaluation(evaluate(run)), /✗/);
  assert.match(formatEvaluation(evaluate(run)), /⚠/);
});

const evidence = (payload) => ({ content: [{ type: "text", text: JSON.stringify(payload) }] });

test("recorded no-audits evidence separates high quality from task fulfillment", () => {
  const run = ideal();
  run.traces[1].result = evidence({ hasAudits: false, message: "No audits completed yet." });
  const result = evaluate(run);
  assert.equal(result.totalScore, 100);
  assert.equal(result.passed, true);
  assert.equal(result.taskOutcome.status, "insufficient_data");
  assert.match(formatEvaluation(result), /Task outcome +insufficient_data/);
});

test("nonempty answers, absent, malformed and positive audit evidence cannot prove fulfillment", () => {
  for (const result of [{ content: [] }, { content: [{ type: "text", text: "not JSON" }] }, evidence({ hasAudits: true })]) {
    const run = ideal();
    run.finalAnswer = "Everything is done.";
    run.traces[1].result = result;
    assert.equal(evaluate(run).taskOutcome.status, "unknown");
  }
});

test("outcome uses structuredContent, scopes site health, and rejects failed or contradictory evidence", () => {
  const run = ideal();
  run.traces[1].result = { content: [], structuredContent: { hasAudits: false } };
  assert.equal(evaluate(run).taskOutcome.status, "insufficient_data");
  assert.equal(evaluateRun({ ...SITE_HEALTH_EVAL, scenario: "List domains" }, "List domains", run).taskOutcome.status, "unknown");
  run.traces.push(trace("get-site-health-summary", {}, { result: evidence({ hasAudits: true }) }));
  assert.equal(evaluate(run).taskOutcome.status, "unknown");
  run.traces.pop();
  for (const overrides of [{ status: "error" }, { blocked: true }, { result: { ...evidence({ hasAudits: false }), isError: true } }]) {
    const changed = structuredClone(run);
    Object.assign(changed.traces[1], overrides);
    assert.equal(evaluate(changed).taskOutcome.status, "unknown");
  }
  assert.equal(evaluate({ ...run, status: "error", error: "fatal" }).taskOutcome.status, "failed");
  run.finalAnswer = "Here are your top five issues.";
  assert.equal(evaluate(run).taskOutcome.status, "unknown");
});

test("successful retry after equivalent failures keeps failure deductions but is not redundant", () => {
  const run = ideal();
  run.traces.unshift(trace("list-domains", "{}", { status: "error", result: null,
    error: "Tool request failed: invalid arguments, timeout, or MCP error." }));
  const result = evaluate(run);
  assert.equal(result.totalScore, 97);
  assert.equal(result.findings.filter(f => f.code === "tool_failure").length, 1);
  assert.equal(has(result, "duplicate_call"), false);
  run.traces.push(trace("list-domains"));
  assert.equal(evaluate(run).findings.filter(f => f.code === "duplicate_call").length, 1);
});

test("repeated argument errors keep every failure penalty; changed arguments are not duplicates", () => {
  const run = ideal();
  run.traces.unshift(trace("list-domains", "{bad", { status: "error" }), trace("list-domains", "{bad", { status: "error" }));
  const result = evaluate(run);
  assert.equal(result.toolSelectionScore, 19);
  assert.equal(result.findings.filter(f => f.code === "tool_failure").length, 2);
  assert.equal(has(result, "duplicate_call"), false);
});

test("persisted live answer excerpts acknowledge missing audits with varied wording", () => {
  for (const answer of [
    "There are no completed Site Health audits for this domain, so there’s no issue data to rank yet.",
    "I checked your PingAura account and couldn’t find any completed Site Health audits yet, so I don’t have issue data to rank.",
    "I checked your PingAura account and don’t see any completed Site Health audits yet.",
  ]) {
    const run = ideal();
    run.finalAnswer = answer;
    run.traces[1].result = evidence({ hasAudits: false });
    assert.equal(evaluate(run).taskOutcome.status, "insufficient_data");
  }
});

test("a failed equivalent attempt resets duplicate detection even after an earlier success", () => {
  const run = ideal();
  run.traces.push(trace("list-domains", {}, { status: "error", result: null }), trace("list-domains"));
  const result = evaluate(run);
  assert.equal(has(result, "duplicate_call"), false);
  assert.equal(result.toolSelectionScore, 22);
  run.traces.push(trace("list-domains"));
  assert.equal(evaluate(run).findings.filter(f => f.code === "duplicate_call").length, 1);
});
