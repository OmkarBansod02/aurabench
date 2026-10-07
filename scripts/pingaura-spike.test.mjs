import assert from "node:assert/strict";
import test from "node:test";
import { selectSafeTool } from "./pingaura-spike.mts";

const read = { name: "list-domains", inputSchema: { type: "object", properties: {} } };

test("allows the documented read tool without required arguments", () => {
  assert.equal(selectSafeTool([read]), read);
});

test("blocks writes and unknown tools even when annotated read-only", () => {
  for (const name of ["publish-article", "run-site-audit", "delete-domain", "list-unknown", "list-domains-and-update"]) {
    assert.equal(selectSafeTool([{ ...read, name, annotations: { readOnlyHint: true } }]), undefined);
  }
});

test("blocks contradictory safety annotations", () => {
  for (const annotations of [{ readOnlyHint: false }, { destructiveHint: true }]) {
    assert.equal(selectSafeTool([{ ...read, annotations }]), undefined);
  }
});

test("skips tools requiring arguments instead of guessing", () => {
  assert.equal(selectSafeTool([{ ...read, inputSchema: { type: "object", required: ["domainId"] } }]), undefined);
  assert.equal(selectSafeTool([]), undefined);
});
