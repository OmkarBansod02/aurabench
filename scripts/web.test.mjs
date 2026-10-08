import assert from "node:assert/strict";
import test from "node:test";
import { sequenceDiff } from "../lib/web/sequence.mts";
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
