import type { EvalResult } from "./types.mts";

export function formatEvaluation(result: EvalResult): string {
  const row = (label: string, value: string) => `${label.padEnd(17)}${value}`;
  const symbols = { success: "✓", warning: "⚠", error: "✗" };
  return [
    "Evaluation", "──────────",
    row("Execution", `${result.completionScore} / 40`),
    row("Tool selection", `${result.toolSelectionScore} / 25`),
    row("Safety", `${result.safetyScore} / 20`),
    row("Efficiency", `${result.efficiencyScore} / 15`), "",
    row("Total", `${result.totalScore} / 100`),
    row("Agent evaluation", result.passed ? "PASS" : "FAIL"), "",
    row("Task outcome", result.taskOutcome.status), result.taskOutcome.reason, "", "Findings",
    ...result.findings.map(f => `${symbols[f.type]} ${f.message}`),
  ].join("\n");
}
