import { evaluateRun } from "../evals/evaluate.mts";
import type { EvalCase } from "../evals/types.mts";
import { evalInput, type StoredRun } from "../db/queries.mts";

/** Both sides are evaluated against the same saved rules; all deltas are candidate - baseline. */
export function compareRuns(rules: EvalCase, baseline: StoredRun, candidate: StoredRun) {
  const baselineEvaluation = evaluateRun(rules, baseline.run.scenario, evalInput(baseline));
  const candidateEvaluation = evaluateRun(rules, candidate.run.scenario, evalInput(candidate));
  const scoreDelta = candidateEvaluation.totalScore - baselineEvaluation.totalScore;
  const metrics = (stored: StoredRun, score: number) => ({
    score, toolCalls: stored.run.toolCallCount, failures: stored.run.toolFailureCount,
    latencyMs: stored.run.latencyMs, tokens: stored.run.totalTokens,
  });
  return {
    baselineRunId: baseline.run.id, candidateRunId: candidate.run.id,
    baseline: metrics(baseline, baselineEvaluation.totalScore),
    candidate: metrics(candidate, candidateEvaluation.totalScore),
    scoreDelta,
    categoryScoreDeltas: {
      completion: candidateEvaluation.completionScore - baselineEvaluation.completionScore,
      toolSelection: candidateEvaluation.toolSelectionScore - baselineEvaluation.toolSelectionScore,
      safety: candidateEvaluation.safetyScore - baselineEvaluation.safetyScore,
      efficiency: candidateEvaluation.efficiencyScore - baselineEvaluation.efficiencyScore,
    },
    toolCallDelta: candidate.run.toolCallCount - baseline.run.toolCallCount,
    failureDelta: candidate.run.toolFailureCount - baseline.run.toolFailureCount,
    latencyDeltaMs: candidate.run.latencyMs - baseline.run.latencyMs,
    tokenDelta: candidate.run.totalTokens === null || baseline.run.totalTokens === null
      ? null : candidate.run.totalTokens - baseline.run.totalTokens,
    baselineToolSequence: baseline.traces.map(t => t.toolName),
    candidateToolSequence: candidate.traces.map(t => t.toolName),
    baselineEvaluation, candidateEvaluation,
    result: candidate.run.status === "completed" && candidateEvaluation.passed && scoreDelta >= 0
      ? "PASS" as const : "FAIL" as const,
  };
}

export type Comparison = ReturnType<typeof compareRuns>;

export function formatComparison(name: string, comparison: Comparison): string {
  const { baseline: b, candidate: c } = comparison;
  const tokens = (value: number | null) => value === null ? "unknown" : `${(value / 1000).toFixed(1)}k`;
  const row = (label: string, baseline: string | number, candidate: string | number) =>
    `${label.padEnd(16)}${String(baseline).padStart(12)}${String(candidate).padStart(12)}`;
  return [
    `Regression: ${name}`, "", row("", "Baseline", "Candidate"),
    row("Score", b.score, c.score), row("Tool calls", b.toolCalls, c.toolCalls),
    row("Failures", b.failures, c.failures), row("Latency", `${(b.latencyMs / 1000).toFixed(1)}s`, `${(c.latencyMs / 1000).toFixed(1)}s`),
    row("Tokens", tokens(b.tokens), tokens(c.tokens)), "",
    `Score delta: ${comparison.scoreDelta >= 0 ? "+" : ""}${comparison.scoreDelta}`,
    `Result: ${comparison.result}`, "", "Baseline sequence:", comparison.baselineToolSequence.join(" → ") || "(none)",
    "", "Candidate sequence:", comparison.candidateToolSequence.join(" → ") || "(none)",
  ].join("\n");
}
