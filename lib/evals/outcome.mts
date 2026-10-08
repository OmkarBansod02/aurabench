import type { EvalRun, TaskOutcome } from "./types.mts";

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Only parse MCP's structured payload or JSON text; never infer facts from prose. */
function payloads(run: EvalRun, toolName: string) {
  return run.traces.filter(t => t.toolName === toolName && t.status === "success"
    && !t.blocked && t.riskLevel === "read" && !t.result?.isError).flatMap(t => {
    if (t.result?.structuredContent !== undefined) return [t.result.structuredContent];
    return (t.result?.content ?? []).flatMap(content => {
      if (content.type !== "text") return [];
      try { return [JSON.parse(content.text) as unknown]; } catch { return []; }
    });
  });
}

/** Task fulfillment is independent of agent-quality points. Conservative by design. */
export function classifyTaskOutcome(scenario: string, run: EvalRun): TaskOutcome {
  if (run.status !== "success" || run.error) return {
    status: "failed", reason: "Agent execution failed or ended with a fatal error.",
  };
  // These evidence rules apply only to site-health analysis, not arbitrary scenarios.
  if (/site[ -]health/i.test(scenario)) {
    const summaries = payloads(run, "get-site-health-summary");
    const missing = summaries.some(p => object(p) && p.hasAudits === false);
    const conflicting = summaries.some(p => object(p) && p.hasAudits === true);
    const acknowledgesMissing = /(?:no |(?:couldn['’]t find|don['’]t see) any )(?:completed )?(?:site[ -]health |site )?audits|audits? (?:are |is )?(?:not available|unavailable|missing)|can(?:not|['’]t) (?:rank|prioriti[sz]e|pull (?:your )?actual issues)/i.test(run.finalAnswer);
    if (missing && !conflicting && acknowledgesMissing) return {
      status: "insufficient_data",
      reason: "PingAura explicitly reports no completed audits, and the agent acknowledges the missing evidence. Site-health prioritization was not completed.",
    };
  }
  // Audit availability and tool success alone cannot prove that an answer fulfills
  // a free-form request. No positive fulfillment signal exists in the current contract.
  return { status: "unknown", reason: "Recorded evidence does not reliably establish task fulfillment." };
}
