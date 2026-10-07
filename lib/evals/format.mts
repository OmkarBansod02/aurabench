import type { EvalResult } from "./types.mts";

export function formatEvaluation(result: EvalResult): string {
  const row = (label: string, value: string) => `${label.padEnd(17)}${value}`;
  const symbols = { success: "✓", warning: "⚠", error: "✗" };
  return [
    "Evaluation", "──────────",
    row("Completion", `${result.completionScore} / 40`),
    row("Tool selection", `${result.toolSelectionScore} / 25`),
    row("Safety", `${result.safetyScore} / 20`),
    row("Efficiency", `${result.efficiencyScore} / 15`), "",
    row("Total", `${result.totalScore} / 100`),
    row("Result", result.passed ? "PASS" : "FAIL"), "", "Findings",
    ...result.findings.map(f => `${symbols[f.type]} ${f.message}`),
  ].join("\n");
}
