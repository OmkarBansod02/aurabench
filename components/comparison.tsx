import {
  ArrowRight,
  ArrowUpDown,
  Check,
  Equal,
  Minus,
  Plus,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Comparison } from "@/lib/regressions/compare.mts";
import type { StoredRun } from "@/lib/db/queries.mts";
import type { ToolTrace } from "@/lib/mcp/types.mts";
import { duration, percentage, signed, tokens } from "@/lib/web/format";
import { retryIndexes, sequenceDiff } from "@/lib/web/sequence.mts";
import { cn } from "@/lib/utils";
import { FindingList, CATEGORIES } from "./evaluation";
import { ModelChip, OutcomeBadge, ScoreValue, Tag, Verdict, type Tone } from "./common";

type Run = StoredRun["run"];
const deltaTone = (delta: number | null, higherIsBetter = false): Tone =>
  delta === null || delta === 0
    ? "neutral"
    : (higherIsBetter ? delta > 0 : delta < 0)
      ? "success"
      : "danger";

/** Sign carries direction; color carries better/worse (lower is better except for scores). */
function DeltaChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("delta", `tone-${tone}`)}>
      {children}
      {tone !== "neutral" && (
        <span className="sr-only">{tone === "success" ? " (better)" : " (worse)"}</span>
      )}
    </span>
  );
}

/** Mirrors the comparison's PASS rule so a FAIL is never ambiguous. */
export function VerdictBanner({
  comparison: c,
  candidate,
}: {
  comparison: Comparison;
  candidate: Run;
}) {
  const pass = c.result === "PASS";
  const criteria = [
    {
      ok: candidate.status === "completed",
      text: "Candidate execution completed",
    },
    {
      ok: c.candidateEvaluation.passed,
      text: `Candidate agent evaluation ${c.candidateEvaluation.passed ? "passes" : "fails"}`,
    },
    {
      ok: c.scoreDelta >= 0,
      text:
        c.scoreDelta >= 0
          ? `Score ${c.scoreDelta > 0 ? `improved by ${c.scoreDelta}` : "maintained"} vs. baseline`
          : `Score dropped by ${Math.abs(c.scoreDelta)} vs. baseline`,
    },
  ];
  const headline = pass
    ? c.scoreDelta > 0
      ? "Candidate improves on the baseline"
      : "Candidate holds the baseline"
    : c.scoreDelta < 0
      ? "Candidate regressed against the baseline"
      : "Candidate does not meet the regression bar";
  return (
    <section
      className={cn("verdict-banner", pass ? "is-pass" : "is-fail")}
      aria-label={`Regression result ${c.result}`}
    >
      <div className="verdict-main">
        <div className="verdict-kicker">
          <span className="verdict-icon" aria-hidden="true">
            {pass ? <Check size={16} strokeWidth={2.75} /> : <X size={16} strokeWidth={2.75} />}
          </span>
          Regression result
          <strong>{c.result}</strong>
        </div>
        <p className="verdict-headline">{headline}</p>
        <ul className="verdict-criteria" aria-label="Regression criteria">
          {criteria.map((item) => (
            <li key={item.text} className={item.ok ? "is-ok" : "is-bad"}>
              {item.ok ? <Check size={13} strokeWidth={2.5} aria-hidden="true" /> : <X size={13} strokeWidth={2.5} aria-hidden="true" />}
              <span className="sr-only">{item.ok ? "Met: " : "Not met: "}</span>
              {item.text}
            </li>
          ))}
        </ul>
      </div>
      <div className="verdict-scores" aria-label="Regression score, baseline to candidate">
        <div>
          <span className="verdict-score-label">Baseline · Regression score</span>
          <ScoreValue score={c.baseline.score} size="xl" />
        </div>
        <ArrowRight size={20} className="verdict-arrow" aria-hidden="true" />
        <div>
          <span className="verdict-score-label">Candidate · Regression score</span>
          <ScoreValue score={c.candidate.score} size="xl" />
        </div>
        <DeltaChip tone={deltaTone(c.scoreDelta, true)}>
          {c.scoreDelta === 0 ? "±0" : signed(c.scoreDelta)} pts
        </DeltaChip>
      </div>
    </section>
  );
}

function PairedValue({
  display,
  value,
  max,
  tone,
}: {
  display: React.ReactNode;
  value: number | null;
  max: number;
  tone: "base" | "cand";
}) {
  return (
    <div className="paired">
      <span className="paired-value">{display}</span>
      {value !== null && (
        <span className={cn("paired-bar", `is-${tone}`)} aria-hidden="true">
          <span style={{ width: `${max > 0 && value > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
        </span>
      )}
    </div>
  );
}

export function ComparisonTable({
  comparison: c,
  baseline,
  candidate,
}: {
  comparison: Comparison;
  baseline: Run;
  candidate: Run;
}) {
  const latency = percentage(c.baseline.latencyMs, c.candidate.latencyMs);
  const tokenChange = percentage(c.baseline.tokens, c.candidate.tokens);
  const be = c.baselineEvaluation;
  const ce = c.candidateEvaluation;
  const numeric = [
    {
      label: "Regression score",
      b: c.baseline.score, c: c.candidate.score,
      bd: <>{c.baseline.score}<span className="of">/100</span></>,
      cd: <>{c.candidate.score}<span className="of">/100</span></>,
      max: 100,
      tone: deltaTone(c.scoreDelta, true),
      change: c.scoreDelta === 0 ? "No change" : `${signed(c.scoreDelta)} pts`,
    },
    {
      label: "Tool calls",
      b: c.baseline.toolCalls, c: c.candidate.toolCalls,
      bd: c.baseline.toolCalls, cd: c.candidate.toolCalls,
      max: Math.max(c.baseline.toolCalls, c.candidate.toolCalls),
      tone: deltaTone(c.toolCallDelta),
      change: c.toolCallDelta === 0 ? "No change" : signed(c.toolCallDelta),
    },
    {
      label: "Failed calls",
      b: c.baseline.failures, c: c.candidate.failures,
      bd: c.baseline.failures, cd: c.candidate.failures,
      max: Math.max(c.baseline.failures, c.candidate.failures),
      tone: deltaTone(c.failureDelta),
      change: c.failureDelta === 0 ? "No change" : signed(c.failureDelta),
    },
    {
      label: "Latency",
      b: c.baseline.latencyMs, c: c.candidate.latencyMs,
      bd: duration(c.baseline.latencyMs), cd: duration(c.candidate.latencyMs),
      max: Math.max(c.baseline.latencyMs, c.candidate.latencyMs),
      tone: deltaTone(c.latencyDeltaMs),
      change:
        latency === null
          ? signed(Math.round(c.latencyDeltaMs)) + "ms"
          : latency === 0 ? "No change" : signed(latency) + "%",
    },
    {
      label: "Tokens",
      b: c.baseline.tokens, c: c.candidate.tokens,
      bd: tokens(c.baseline.tokens), cd: tokens(c.candidate.tokens),
      max: Math.max(c.baseline.tokens ?? 0, c.candidate.tokens ?? 0),
      tone: deltaTone(c.tokenDelta),
      change:
        c.tokenDelta === null
          ? "Unknown"
          : tokenChange === null
            ? signed(c.tokenDelta)
            : tokenChange === 0 ? "No change" : signed(tokenChange) + "%",
    },
  ];
  const evalChange =
    be.passed === ce.passed ? (
      <DeltaChip tone="neutral">Unchanged</DeltaChip>
    ) : ce.passed ? (
      <DeltaChip tone="success">Now passes</DeltaChip>
    ) : (
      <DeltaChip tone="danger">Now fails</DeltaChip>
    );
  return (
    <section className="panel compare-panel" aria-labelledby="metrics-heading">
      <div className="panel-header">
        <div className="panel-title">
          <h2 id="metrics-heading">Head to head</h2>
          <span className="panel-count">Current evaluator · saved rules · candidate − baseline</span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="compare-table">
          <caption className="sr-only">
            Baseline and candidate evaluated against the same saved expectations.
            Changes are candidate minus baseline.
          </caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">
                <span className="col-label"><span className="swatch is-base" />Baseline</span>
                <ModelChip model={baseline.model} prompt={baseline.promptVersion} />
              </th>
              <th scope="col">
                <span className="col-label"><span className="swatch is-cand" />Candidate</span>
                <ModelChip model={candidate.model} prompt={candidate.promptVersion} />
              </th>
              <th scope="col" className="col-change">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-verdict">
              <th scope="row">Agent evaluation</th>
              <td><Verdict passed={be.passed} label="" size="sm" /></td>
              <td><Verdict passed={ce.passed} label="" size="sm" /></td>
              <td className="col-change">{evalChange}</td>
            </tr>
            <tr className="row-verdict">
              <th scope="row">Task outcome</th>
              <td><OutcomeBadge status={be.taskOutcome.status} label="" /></td>
              <td><OutcomeBadge status={ce.taskOutcome.status} label="" /></td>
              <td className="col-change">
                <DeltaChip tone="neutral">
                  {be.taskOutcome.status === ce.taskOutcome.status ? "Unchanged" : "Changed"}
                </DeltaChip>
              </td>
            </tr>
            {numeric.map((r, i) => (
              <tr key={r.label} className={i === 0 ? "row-score" : undefined}>
                <th scope="row">{r.label}</th>
                <td>
                  <PairedValue display={r.bd} value={r.b} max={r.max} tone="base" />
                </td>
                <td>
                  <PairedValue display={r.cd} value={r.c} max={r.max} tone="cand" />
                </td>
                <td className="col-change">
                  <DeltaChip tone={r.tone}>{r.change}</DeltaChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ScoreBreakdown({ comparison: c }: { comparison: Comparison }) {
  const deltas = {
    completionScore: c.categoryScoreDeltas.completion,
    toolSelectionScore: c.categoryScoreDeltas.toolSelection,
    safetyScore: c.categoryScoreDeltas.safety,
    efficiencyScore: c.categoryScoreDeltas.efficiency,
  };
  return (
    <section className="panel breakdown-panel" aria-labelledby="breakdown-heading">
      <div className="panel-header">
        <div className="panel-title">
          <h2 id="breakdown-heading">Score breakdown</h2>
        </div>
        <span className="legend">
          <span className="legend-item"><span className="swatch is-base" />Baseline</span>
          <span className="legend-item"><span className="swatch is-cand" />Candidate</span>
        </span>
      </div>
      <dl className="breakdown-list">
        {CATEGORIES.map(({ key, label, max }) => (
          <div key={key}>
            <dt>
              {label}
              <span className="of">/{max}</span>
            </dt>
            <dd>
              <span className="breakdown-bars" aria-hidden="true">
                <span className="paired-bar is-base">
                  <span style={{ width: `${(c.baselineEvaluation[key] / max) * 100}%` }} />
                </span>
                <span className="paired-bar is-cand">
                  <span style={{ width: `${(c.candidateEvaluation[key] / max) * 100}%` }} />
                </span>
              </span>
              <span className="breakdown-values mono">
                {c.baselineEvaluation[key]}
                <ArrowRight size={11} aria-label="to" />
                {c.candidateEvaluation[key]}
              </span>
              <DeltaChip tone={deltaTone(deltas[key], true)}>
                {deltas[key] === 0 ? "±0" : signed(deltas[key])}
              </DeltaChip>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type Entry = ReturnType<typeof sequenceDiff>["baseline"][number] & { index: number };
type Row = { left?: Entry; right?: Entry; shared: boolean };

/** Lays the diff out side by side: shared (LCS) calls anchor rows; changes fill between them. */
function alignRows(diff: ReturnType<typeof sequenceDiff>): Row[] {
  const rows: Row[] = [];
  const b = diff.baseline;
  const c = diff.candidate;
  let i = 0;
  let j = 0;
  while (i < b.length || j < c.length) {
    const start = i + j;
    const left: Entry[] = [];
    const right: Entry[] = [];
    while (i < b.length && b[i].changed) left.push({ ...b[i], index: i++ });
    while (j < c.length && c[j].changed) right.push({ ...c[j], index: j++ });
    for (let k = 0; k < Math.max(left.length, right.length); k++)
      rows.push({ left: left[k], right: right[k], shared: false });
    if (i < b.length && j < c.length) {
      rows.push({ left: { ...b[i], index: i++ }, right: { ...c[j], index: j++ }, shared: true });
    } else if (i + j === start) break;
  }
  return rows;
}

const category = (e: Entry) =>
  e.change === "reordered"
    ? "reordered"
    : e.duplicate
      ? "extra"
      : e.change;

function SequenceCell({
  entry,
  side,
  trace,
  retry = false,
}: {
  entry?: Entry;
  side: "baseline" | "candidate";
  trace?: ToolTrace;
  retry?: boolean;
}) {
  if (!entry) return <div className="seq-cell is-empty" aria-hidden="true" />;
  const kind = category(entry);
  const status = trace ? (trace.blocked ? "blocked" : trace.status) : undefined;
  return (
    <div className={cn("seq-cell", `is-${kind}`)}>
      <span className="seq-index">{String(entry.index + 1).padStart(2, "0")}</span>
      <span className="seq-marker" aria-hidden="true">
        {kind === "removed" ? <Minus size={11} strokeWidth={2.5} /> : kind === "added" ? <Plus size={11} strokeWidth={2.5} /> : kind === "reordered" ? <ArrowUpDown size={11} strokeWidth={2.5} /> : kind === "extra" ? <span>×</span> : null}
      </span>
      <code className="seq-name" title={entry.name}>{entry.name}</code>
      {(kind !== "unchanged" || retry) && (
        <span className="seq-tag">
          {retry
            ? "Retry after failure"
            : kind === "removed"
            ? "Removed"
            : kind === "added"
              ? "Added"
              : kind === "reordered"
                ? "Reordered"
                : side === "baseline"
                  ? "Extra · dropped"
                  : "Extra · new"}
        </span>
      )}
      {status && status !== "success" && (
        <Tag tone={status === "blocked" ? "warning" : "danger"}>
          {status === "blocked" ? "Blocked" : "Failed"}
        </Tag>
      )}
    </div>
  );
}

export function ToolSequenceDiff({
  baseline,
  candidate,
  baselineTraces,
  candidateTraces,
}: {
  baseline: string[];
  candidate: string[];
  baselineTraces: ToolTrace[];
  candidateTraces: ToolTrace[];
}) {
  const diff = sequenceDiff(baseline, candidate);
  const rows = alignRows(diff);
  const baselineRetries = retryIndexes(baselineTraces);
  const candidateRetries = retryIndexes(candidateTraces);
  const all = [...diff.baseline, ...diff.candidate];
  const counts = {
    shared: diff.baseline.filter((e) => e.change === "unchanged").length,
    added: diff.candidate.filter((e) => e.change === "added" && !e.duplicate).length,
    removed: diff.baseline.filter((e) => e.change === "removed" && !e.duplicate).length,
    reordered: diff.baseline.filter((e) => e.change === "reordered").length,
    extra: all.filter((e) => e.duplicate).length,
  };
  const summary = [
    { key: "shared", label: "Shared", icon: <Equal size={12} aria-hidden="true" /> },
    { key: "added", label: "Added", icon: <Plus size={12} aria-hidden="true" /> },
    { key: "removed", label: "Removed", icon: <Minus size={12} aria-hidden="true" /> },
    { key: "reordered", label: "Reordered", icon: <ArrowUpDown size={12} aria-hidden="true" /> },
    { key: "extra", label: "Extra occurrences", icon: <span aria-hidden="true">×</span> },
  ] as const;
  return (
    <section className="panel sequence-panel" aria-labelledby="sequence-heading">
      <div className="panel-header">
        <div className="panel-title">
          <h2 id="sequence-heading">Tool sequence</h2>
          <span className="panel-count">
            {baseline.length} → {candidate.length} calls
          </span>
        </div>
        <ul className="seq-summary" aria-label="Sequence change counts">
          {summary.map((s) => (
            <li key={s.key} className={cn(`is-${s.key}`, !counts[s.key] && "is-zero")}>
              {s.icon}
              <strong>{counts[s.key]}</strong>
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="seq-grid" role="table" aria-label="Baseline and candidate tool sequences, aligned">
        <div className="seq-head" role="row">
          <span role="columnheader"><span className="swatch is-base" />Baseline</span>
          <span aria-hidden="true" />
          <span role="columnheader"><span className="swatch is-cand" />Candidate</span>
        </div>
        {rows.map((row, i) => (
          <div className={cn("seq-row", row.shared && "is-shared")} role="row" key={i}>
            <div role="cell">
              <SequenceCell entry={row.left} side="baseline" retry={!!row.left && baselineRetries.has(row.left.index)} trace={row.left && baselineTraces[row.left.index]} />
            </div>
            <span className="seq-gutter" aria-hidden="true">
              {row.shared ? <Equal size={12} /> : null}
            </span>
            <div role="cell">
              <SequenceCell entry={row.right} side="candidate" retry={!!row.right && candidateRetries.has(row.right.index)} trace={row.right && candidateTraces[row.right.index]} />
            </div>
          </div>
        ))}
        {!rows.length && <p className="panel-empty">Neither run made tool calls.</p>}
      </div>
      <p className="panel-foot">
        Counts compare tool-name occurrences. Retry labels mark equivalent arguments
        following an unblocked error; retries still count as extra occurrences when unmatched.
        Other extra occurrences do not establish unnecessary duplication.
      </p>
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
  const candidateErrors = c.candidateEvaluation.findings.filter((f) => f.type === "error");
  return (
    <div className="changes-grid">
      <section className="panel changes-panel is-improved" aria-labelledby="improved-heading">
        <h2 id="improved-heading">
          <TrendingUp size={16} aria-hidden="true" />
          Improved
          <span className="panel-count">{improvements.length + fixed.length}</span>
        </h2>
        {improvements.length || fixed.length ? (
          <ul className="change-list">
            {improvements.map((message) => (
              <li key={message}>
                <Check size={14} aria-hidden="true" />
                {message}
              </li>
            ))}
            {fixed.map((f, i) => (
              <li key={`fixed-${i}`}>
                <Check size={14} aria-hidden="true" />
                <span>
                  Resolved: <span className="code-label">{f.code.replaceAll("_", " ")}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-empty">No metric improvements in this replay.</p>
        )}
      </section>
      <section className="panel changes-panel is-regressed" aria-labelledby="regressed-heading">
        <h2 id="regressed-heading">
          <ShieldCheck size={16} aria-hidden="true" />
          Regressions & behavior
          <span className="panel-count">{regressions.length + candidateErrors.length}</span>
        </h2>
        <ul className="change-list">
          <li className={c.candidateEvaluation.passed ? "is-ok" : "is-bad"}>
            {c.candidateEvaluation.passed ? <Check size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}
            {c.candidateEvaluation.passed
              ? "Candidate passes required behavior"
              : "Candidate fails required behavior"}
          </li>
          {regressions.map((message) => (
            <li key={message} className="is-bad">
              <TriangleAlert size={14} aria-hidden="true" />
              {message}
            </li>
          ))}
          {!regressions.length && (
            <li className="is-muted">
              <Check size={14} aria-hidden="true" />
              No measured metric regressions
            </li>
          )}
          {(c.candidate.tokens === null || c.baseline.tokens === null) && (
            <li className="is-muted">
              <Minus size={14} aria-hidden="true" />
              Token usage unavailable; token change cannot be assessed
            </li>
          )}
        </ul>
        {candidateErrors.length > 0 && <FindingList findings={candidateErrors} />}
      </section>
    </div>
  );
}
