import assert from "node:assert/strict";
import test from "node:test";
import { MCPGateway } from "../lib/mcp/gateway.mts";
import { MAX_AGENT_STEPS, runAgent } from "../lib/agent/runner.mts";

const tool = (name, annotations) => ({ name, annotations, inputSchema: { type: "object", properties: {} } });
const ok = { content: [{ type: "text", text: "Retrieved data" }] };

test("read tool allowed with complete trace", async () => {
  let calls = 0;
  const gateway = new MCPGateway([tool("list-domains")], async (name, args) => {
    calls++;
    assert.equal(name, "list-domains");
    assert.deepEqual(args, {});
    return ok;
  });
  const trace = await gateway.executeTool("list-domains", "{}");
  assert.equal(calls, 1);
  assert.equal(gateway.safeTools.length, 1);
  assert.deepEqual(trace.result, ok);
  assert.equal(trace.status, "success");
  assert.equal(trace.riskLevel, "read");
  assert.equal(trace.blocked, false);
  assert.equal(trace.sequence, 1);
  assert.deepEqual(trace.arguments, {});
  assert.ok(Number.isFinite(Date.parse(trace.startedAt)));
  assert.ok(Date.parse(trace.completedAt) >= Date.parse(trace.startedAt));
  assert.ok(trace.latencyMs >= 0);
});

test("write tools blocked even with read-only annotations", async () => {
  for (const name of ["publish-article", "run-site-audit", "update-issue-status"]) {
    const gateway = new MCPGateway([tool(name, { readOnlyHint: true })], async () => assert.fail("Mutation executed"));
    const trace = await gateway.executeTool(name, {});
    assert.equal(trace.status, "blocked");
    assert.equal(trace.riskLevel, "write");
    assert.equal(trace.blocked, true);
    assert.equal(gateway.safeTools.length, 0);
    assert.equal(gateway.traces.length, 1);
    assert.match(trace.error, /read-only policy/);
  }
});

test("unknown and undiscovered tools blocked regardless of annotations or prefixes", async () => {
  const gateway = new MCPGateway([tool("list-unknown", { readOnlyHint: true })], async () => assert.fail("Unknown executed"));
  for (const name of ["list-unknown", "list-domains"]) {
    const trace = await gateway.executeTool(name, {});
    assert.equal(trace.status, "blocked");
    assert.equal(trace.riskLevel, "unknown");
  }
  assert.equal(gateway.safeTools.length, 0);
  assert.deepEqual(gateway.traces.map(t => t.sequence), [1, 2]);
});

test("contradictory annotations veto reads and discovery is snapshotted", async () => {
  for (const annotations of [{ readOnlyHint: false }, { destructiveHint: true }]) {
    const original = tool("list-domains", annotations);
    const gateway = new MCPGateway([original], async () => assert.fail("Vetoed read executed"));
    original.annotations = { readOnlyHint: true };
    assert.equal(gateway.safeTools.length, 0);
    assert.equal((await gateway.executeTool("list-domains", {})).blocked, true);
  }
});

test("invalid JSON and non-object arguments recorded without execution", async () => {
  const gateway = new MCPGateway([tool("list-domains")], async () => assert.fail("Invalid arguments executed"));
  for (const args of ["{", "null", "[]", "1", undefined]) {
    assert.equal((await gateway.executeTool("list-domains", args)).status, "error");
  }
  assert.equal(gateway.traces.length, 5);
});

test("MCP errors and exceptions retain timing and trace", async () => {
  for (const call of [async () => ({ ...ok, isError: true }), async () => { throw new Error("SECRET"); }]) {
    const gateway = new MCPGateway([tool("list-domains")], call);
    const trace = await gateway.executeTool("list-domains", {});
    assert.equal(trace.status, "error");
    assert.ok(trace.completedAt);
    assert.doesNotMatch(trace.error, /SECRET/);
  }
});

const functionCall = (name, id = "call-1") => ({ type: "function_call", name, call_id: id, arguments: "{}" });
const final = { type: "message", content: [{ type: "output_text", text: "Fix critical issues first." }] };

test("agent selects tools, receives results, preserves reasoning and aggregates usage", async () => {
  let turns = 0;
  const gateway = new MCPGateway([tool("list-domains"), tool("publish-article")], async () => ok);
  const reasoning = { type: "reasoning", encrypted_content: "opaque" };
  const result = await runAgent({ scenario: "Inspect health", gateway, respond: async request => {
    turns++;
    assert.deepEqual(request.tools.map(t => t.name), ["list-domains"]);
    assert.equal(request.store, false);
    if (turns === 2) {
      assert.ok(request.input.some(item => item.encrypted_content === "opaque"));
      const output = request.input.find(item => item.type === "function_call_output");
      assert.equal(output.call_id, "call-1");
      assert.deepEqual(JSON.parse(output.output).result, ok);
    }
    return { status: "completed", output: turns === 1 ? [reasoning, functionCall("list-domains")] : [final],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
  } });
  assert.equal(result.status, "success");
  assert.equal(result.steps, 2);
  assert.equal(result.finalAnswer, "Fix critical issues first.");
  assert.deepEqual(result.usage, { inputTokens: 20, outputTokens: 10, totalTokens: 30 });
});

test("agent routes hallucinated write calls through gateway and returns denial", async () => {
  let turns = 0;
  const gateway = new MCPGateway([tool("publish-article")], async () => assert.fail("Mutation executed"));
  const result = await runAgent({ scenario: "Inspect health", gateway, respond: async request => {
    turns++;
    if (turns === 2) assert.equal(JSON.parse(request.input.at(-1).output).blocked, true);
    return { status: "completed", output: turns === 1 ? [functionCall("publish-article")] : [final] };
  } });
  assert.equal(result.traces[0].status, "blocked");
});

test("max agent steps enforced without an eleventh model request", async () => {
  let requests = 0;
  let executions = 0;
  const gateway = new MCPGateway([tool("list-domains")], async () => { executions++; return ok; });
  const result = await runAgent({ scenario: "Loop", gateway, respond: async () => {
    requests++;
    return { status: "completed", output: [functionCall("list-domains", `call-${requests}`)] };
  } });
  assert.equal(MAX_AGENT_STEPS, 10);
  assert.equal(requests, 10);
  assert.equal(executions, 10);
  assert.equal(result.steps, 10);
  assert.equal(result.status, "error");
  assert.match(result.error, /Maximum agent steps exceeded/);
  assert.equal(result.traces.length, 10);
});

test("final answer on tenth step succeeds", async () => {
  let requests = 0;
  const gateway = new MCPGateway([tool("list-domains")], async () => ok);
  const result = await runAgent({ scenario: "Inspect", gateway, respond: async () => ({
    status: "completed", output: ++requests === 10 ? [final] : [functionCall("list-domains", `call-${requests}`)],
  }) });
  assert.equal(result.status, "success");
  assert.equal(result.steps, 10);
});

test("model failure retains prior traces and redacts provider error", async () => {
  let requests = 0;
  const gateway = new MCPGateway([tool("list-domains")], async () => ok);
  const result = await runAgent({ scenario: "Inspect", gateway, respond: async () => {
    if (++requests === 2) throw new Error("SECRET");
    return { status: "completed", output: [functionCall("list-domains")] };
  } });
  assert.equal(result.status, "error");
  assert.equal(result.traces.length, 1);
  assert.doesNotMatch(result.error, /SECRET/);
});
