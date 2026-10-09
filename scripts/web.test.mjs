import assert from "node:assert/strict";
import test from "node:test";
import { retryIndexes, sequenceDiff } from "../lib/web/sequence.mts";
import {
  executionOptions,
  uuid,
  readBody,
  toolNames,
  callBudget,
  apiError,
} from "../lib/web/validation.mts";

test("sequence diff removes an extra duplicate occurrence, preserving order", () => {
  const result = sequenceDiff(["a", "b", "b", "c"], ["a", "b", "c"]);
  assert.equal(result.baseline.filter((t) => t.changed).length, 1);
  assert.equal(result.baseline.find((t) => t.changed).name, "b");
  assert.equal(
    result.candidate.some((t) => t.changed),
    false,
  );
});
test("sequence diff makes a reordered call visible on both sides", () => {
  const diff = sequenceDiff(["a", "b"], ["b", "a"]);
  assert.equal(diff.baseline.filter((t) => t.changed).length, 1);
  assert.equal(diff.candidate.filter((t) => t.changed).length, 1);
  assert.deepEqual(sequenceDiff([], []).baseline, []);
});
test("execution input rejects frozen mode, unsupported prompts, providers and empty models", () => {
  const good = { model: "gpt-5", promptVersion: "v2", replayMode: "live" };
  assert.deepEqual(executionOptions(good), {
    model: "gpt-5",
    promptVersion: "v2",
  });
  for (const change of [
    { replayMode: "frozen" },
    { promptVersion: "v3" },
    { model: "" },
    { model: "other-provider" },
  ]) {
    assert.throws(() => executionOptions({ ...good, ...change }));
  }
});
test("request validation bounds IDs, tool names and call budgets", () => {
  assert.throws(() => uuid("not-an-id"));
  assert.throws(() => toolNames(["ok", 3]));
  assert.throws(() => toolNames([""]));
  assert.deepEqual(toolNames(["read", "read"]), ["read"]);
  for (const value of [-1, 0.5, null, Infinity, 101])
    assert.throws(() => callBudget(value));
  assert.equal(callBudget(0), 0);
});
test("malformed JSON, arrays and oversized requests fail before any service execution", async () => {
  for (const body of ["{", "[]", "null", "x".repeat(32_001)]) {
    await assert.rejects(
      readBody(
        new Request("http://localhost/api/runs", { method: "POST", body }),
      ),
    );
  }
});
test("unexpected infrastructure errors never expose connection strings or secrets", async () => {
  const response = apiError(new Error("postgres://user:secret@host/db"));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret|user:|postgres:\/\//);
});

test("sequence diff pairs moves before labeling genuine additions/removals and extra occurrences", () => {
  const diff = sequenceDiff(["a", "b", "b", "c", "removed"], ["c", "a", "b", "added", "added"]);
  assert.equal(diff.baseline.filter(t => t.change === "reordered").length, 1);
  assert.equal(diff.candidate.filter(t => t.change === "reordered").length, 1);
  assert.equal(diff.baseline.find(t => t.name === "removed").change, "removed");
  assert.equal(diff.baseline.filter(t => t.name === "b" && t.duplicate).length, 1);
  assert.ok(diff.candidate.filter(t => t.name === "added").every(t => t.change === "added"));
  assert.equal(diff.candidate.filter(t => t.name === "added" && t.duplicate).length, 1);
  assert.deepEqual(sequenceDiff(["a", "a"], []).baseline.map(t => t.change), ["removed", "removed"]);
  assert.deepEqual(sequenceDiff([], ["a"]).candidate.map(t => t.change), ["added"]);
  assert.deepEqual(sequenceDiff(["a", "b"], ["b", "a"]), sequenceDiff(["a", "b"], ["b", "a"]));
});

const attempt = (toolName, status, args = {}, blocked = false) => ({ toolName, status, arguments: args, blocked });

test("retry evidence uses equivalent arguments and latest status without changing sequence counts", () => {
  const traces = [attempt("list-domains", "error"), attempt("list-domains", "success", "{}"),
    attempt("get-site-health-summary", "success"), attempt("list-site-audits", "success")];
  const names = traces.map(t => t.toolName);
  const before = sequenceDiff(names.slice(1), names);
  assert.deepEqual([...retryIndexes(traces)], [1]);
  assert.equal(before.candidate.filter(t => t.duplicate).length, 1);
  assert.deepEqual(sequenceDiff(names.slice(1), names), before);
  assert.deepEqual([...retryIndexes([...traces, attempt("list-domains", "success")])], [1]);
});

test("retry evidence normalizes nested key order, preserves array order, and allows repeated failures", () => {
  const args = { filter: { a: 1, b: 2 }, ids: [1, 2] };
  const reordered = '{"ids":[1,2],"filter":{"b":2,"a":1}}';
  assert.deepEqual([...retryIndexes([attempt("a", "error", args), attempt("b", "success"),
    attempt("a", "error", reordered), attempt("a", "success", args)])], [2, 3]);
  assert.equal(retryIndexes([attempt("a", "error", args), attempt("a", "success", { ...args, ids: [2, 1] })]).size, 0);
});

test("tool names, successes, blocked calls, changed or missing arguments alone never establish retries", () => {
  for (const traces of [
    [attempt("a", "success"), attempt("a", "success")],
    [attempt("a", "error"), attempt("b", "success")],
    [attempt("a", "error", { id: 1 }), attempt("a", "success", { id: 2 })],
    [attempt("a", "blocked", {}, true), attempt("a", "success")],
    [attempt("a", "error", {}, true), attempt("a", "success")],
    [attempt("a", "error"), attempt("a", "blocked", {}, true)],
    [{ ...attempt("a", "error"), arguments: undefined }, { ...attempt("a", "success"), arguments: undefined }],
  ]) assert.equal(retryIndexes(traces).size, 0);
  for (const args of [null, "{", "null", [], "[]"])
    assert.equal(retryIndexes([attempt("a", "error", args), attempt("a", "success", args)]).size, 0);
});
