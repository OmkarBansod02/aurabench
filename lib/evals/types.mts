import type { runAgent } from "../agent/runner.mts";

export type EvalRun = Pick<Awaited<ReturnType<typeof runAgent>>,
  "finalAnswer" | "status" | "error" | "traces" | "usage" | "latencyMs">;

export interface EvalCase {
  id: string;
  name: string;
  scenario: string;
  requiredTools?: readonly string[];
  /** Every group must have at least one successful member. */
  requiredToolGroups?: readonly { name: string; tools: readonly string[] }[];
  forbiddenTools?: readonly string[];
  maxToolCalls: number;
  maxTokens?: number;
  maxLatencyMs?: number;
}

export interface Finding {
  type: "success" | "warning" | "error";
  code: string;
  message: string;
}

export interface EvalResult {
  evalCaseId: string;
  completionScore: number;
  toolSelectionScore: number;
  safetyScore: number;
  efficiencyScore: number;
  totalScore: number;
  passed: boolean;
  findings: Finding[];
}
