import {
  Check,
  TrendingUp,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { Comparison } from "@/lib/regressions/compare.mts";
import type { StoredRun } from "@/lib/db/queries.mts";
import { duration, percentage, signed, tokens } from "@/lib/web/format";
import { sequenceDiff } from "@/lib/web/sequence.mts";
import { FindingList } from "./evaluation";

export function ComparisonTable({
  comparison: c,
  baseline,
  candidate,
}: {
  comparison: Comparison;
  baseline: StoredRun["run"];
  candidate: StoredRun["run"];
}) {
  const latency = percentage(c.baseline.latencyMs, c.candidate.latencyMs);
  const tokenChange = percentage(c.baseline.tokens, c.candidate.tokens);
  const rows = [
    {
      label: "Agent quality",
      b: c.baseline.score,
      c: c.candidate.score,
      delta: c.scoreDelta,
      change: signed(c.scoreDelta),
      higher: true,
    },
    {
      label: "Tool calls",
      b: c.baseline.toolCalls,
      c: c.candidate.toolCalls,
      delta: c.toolCallDelta,
      change: signed(c.toolCallDelta),
    },
    {
      label: "Failures",
      b: c.baseline.failures,
      c: c.candidate.failures,
      delta: c.failureDelta,
      change: signed(c.failureDelta),
    },
    {
      label: "Latency",
      b: duration(c.baseline.latencyMs),
      c: duration(c.candidate.latencyMs),
      delta: c.latencyDeltaMs,
      change:
        latency === null
          ? signed(Math.round(c.latencyDeltaMs)) + "ms"
          : signed(latency) + (latency === 0 ? "" : "%"),
    },
    {
      label: "Tokens",
      b: tokens(c.baseline.tokens),
      c: tokens(c.candidate.tokens),
      delta: c.tokenDelta,
      change:
        c.tokenDelta === null
          ? "Unknown"
          : tokenChange === null
            ? signed(c.tokenDelta)
            : signed(tokenChange) + (tokenChange === 0 ? "" : "%"),
    },
  ];
  return (
    <div className="table-scroll">
      <p>Baseline agent evaluation: {c.baselineEvaluation.passed ? "PASS" : "FAIL"} · Task outcome: {c.baselineEvaluation.taskOutcome.status}</p>
      <p>Candidate agent evaluation: {c.candidateEvaluation.passed ? "PASS" : "FAIL"} · Task outcome: {c.candidateEvaluation.taskOutcome.status}</p>
      <table className="comparison-table">
        <caption className="sr-only">
          Baseline and candidate evaluated against the same saved expectations.
          Changes are candidate minus baseline.
        </caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">
              Baseline{" "}
              <span>
                Prompt {baseline.promptVersion} · {baseline.model}
              </span>
            </th>
            <th
              scope="col"
              className={c.result === "PASS" ? "candidate-cell" : ""}
            >
              Candidate{" "}
              <span>
                Prompt {candidate.promptVersion} · {candidate.model}
              </span>
            </th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.b}</td>
              <td className={c.result === "PASS" ? "candidate-cell" : ""}>
                {r.c}
              </td>
              <td
                className={
                  r.delta === null || r.delta === 0
                    ? "muted"
                    : (r.higher ? r.delta > 0 : r.delta < 0)
                      ? "improvement"
                      : "deterioration"
                }
              >
                {r.change}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ToolSequenceDiff({
  baseline,
  candidate,
}: {
  baseline: string[];
  candidate: string[];
}) {
  const diff = sequenceDiff(baseline, candidate);
  return (
    <section className="tool-sequence-section">
      <div className="section-heading">
        <h2>Tool sequences</h2>
        <span className="muted">Removed · Added · Reordered · Extra occurrence</span>
      </div>
      <p className="muted">Tool-name occurrences only; see traces for arguments, errors, and retries.</p>
      <div className="sequence-rows">
        {(["baseline", "candidate"] as const).map((side) => (
          <div className="sequence-row" key={side}>
            <strong>{side === "baseline" ? "Baseline" : "Candidate"}</strong>
            <ol>
              {diff[side].map((tool, i) => (
                <li
                  key={i}
                  className={
                    tool.change === "reordered" ? "" : tool.changed
                      ? side === "baseline"
                        ? "sequence-removed"
                        : "sequence-added"
                      : ""
                  }
                >
                  <span className="sequence-number">{i + 1}</span>
                  <code>{tool.name}</code>
                  {tool.changed && <span className="muted">{tool.change}{tool.duplicate ? " · extra occurrence" : ""}</span>}
                </li>
              ))}
              {!diff[side].length && <li className="muted">No tool calls</li>}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
export function ComparisonFindings({
  comparison: c,
}: {
  comparison: Comparison;
}) {
  const improvements: string[] = [],
    regressions: string[] = [];
  if (c.scoreDelta !== 0)
    (c.scoreDelta > 0 ? improvements : regressions).push(
      `Score ${c.scoreDelta > 0 ? "increased" : "decreased"} by ${Math.abs(c.scoreDelta)} ${Math.abs(c.scoreDelta) === 1 ? "point" : "points"}`,
    );
  if (c.toolCallDelta !== 0)
    (c.toolCallDelta < 0 ? improvements : regressions).push(
      `${Math.abs(c.toolCallDelta)} ${c.toolCallDelta < 0 ? "fewer" : "more"} MCP ${Math.abs(c.toolCallDelta) === 1 ? "call" : "calls"}`,
    );
  if (c.failureDelta !== 0)
    (c.failureDelta < 0 ? improvements : regressions).push(
      `${Math.abs(c.failureDelta)} ${c.failureDelta < 0 ? "fewer" : "more"} failed ${Math.abs(c.failureDelta) === 1 ? "call" : "calls"}`,
    );
  for (const [label, b, candidate] of [
    ["latency", c.baseline.latencyMs, c.candidate.latencyMs],
    ["tokens", c.baseline.tokens, c.candidate.tokens],
  ] as const) {
    const pct = percentage(b, candidate);
    if (pct !== null && pct !== 0)
      (pct < 0 ? improvements : regressions).push(
        `${Math.abs(pct)}% ${pct < 0 ? "lower" : "higher"} ${label}`,
      );
  }
  const fixed = c.baselineEvaluation.findings.filter(
    (f) =>
      f.type !== "success" &&
      !c.candidateEvaluation.findings.some(
        (next) => next.code === f.code && next.type !== "success",
      ),
  );
  return (
    <div className="comparison-findings">
      <section className="summary-panel">
        <h3>
          <TrendingUp size={18} />
          Improved
        </h3>
        <ul>
          {improvements.map((message) => (
            <li key={message}>
              <Check size={15} />
              {message}
            </li>
          ))}
        </ul>
        {!improvements.length && (
          <p className="muted">No metric improvements in this replay.</p>
        )}
        {!!fixed.length && (
          <>
            <h4>Resolved findings</h4>
            <ul>
              {fixed.map((f, i) => (
                <li key={i}>
                  <Check size={15} />
                  <span>{f.code.replaceAll("_", " ")} no longer reported</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="summary-panel">
        <h3>
          <ShieldCheck size={18} />
          Behavior & regressions
        </h3>
        <p
          className={
            c.candidateEvaluation.passed ? "improvement" : "deterioration"
          }
        >
          {c.candidateEvaluation.passed ? (
            <Check size={15} />
          ) : (
            <TriangleAlert size={15} />
          )}
          {c.candidateEvaluation.passed
            ? "Candidate passes required behavior"
            : "Candidate fails required behavior"}
        </p>
        <p className={c.scoreDelta >= 0 ? "muted" : "deterioration"}>
          {c.scoreDelta >= 0
            ? "Score maintained or improved against the same rules."
            : "Candidate score is lower than baseline; comparison fails."}
        </p>
        {regressions.length > 0 && (
          <ul className="regressed-metrics">
            {regressions.map((message) => (
              <li key={message}>
                <TriangleAlert size={15} />
                {message}
              </li>
            ))}
          </ul>
        )}
        {!regressions.length && (
          <p className="muted">No measured metric regressions.</p>
        )}
        {c.candidate.tokens === null || c.baseline.tokens === null ? (
          <p className="muted">
            Token usage unavailable; token change cannot be assessed.
          </p>
        ) : null}
        <FindingList
          findings={c.candidateEvaluation.findings.filter(
            (f) => f.type === "error",
          )}
        />
      </section>
    </div>
  );
}
