import { INITIAL_SCENARIO } from "../agent/runner.mts";
import type { EvalCase } from "./types.mts";

// Based on live discovery and the Phase 2 workflow, verified 2026-10-07.
// The account has no completed audits: summary returns { hasAudits: false }.
// Requiring get-audit-issues would demand an audit ID that does not exist.
export const SITE_HEALTH_EVAL: EvalCase = {
  id: "site-health-v1",
  name: "Site health inspection (current account)",
  scenario: INITIAL_SCENARIO,
  requiredTools: ["list-domains", "get-site-health-summary"],
  forbiddenTools: ["run-site-audit", "update-issue-status", "publish-article"],
  maxToolCalls: 5,
  maxTokens: 12_000,
  maxLatencyMs: 60_000,
};
