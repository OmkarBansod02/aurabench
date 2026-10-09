import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowRight, Ban, Check, RotateCcw } from "lucide-react";
import { withStore } from "@/lib/web/server";
import { uuid } from "@/lib/web/validation.mts";
import {
  Breadcrumb,
  DatabaseError,
  Meter,
  ModelChip,
  OutcomeBadge,
  PageHeader,
  ScoreValue,
  SectionHeader,
  TextLink,
  Verdict,
  scoreTone,
} from "@/components/common";
import { ExecutionForm } from "@/components/execution-form";
import { duration, timestamp, tokens } from "@/lib/web/format";
import { cn } from "@/lib/utils";

export default async function RegressionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  try {
    uuid(id);
  } catch {
    notFound();
  }
  const data = await withStore(async (store, service) => {
    const saved = await store.getCase(id);
    if (!saved) return { saved: null, baseline: null, candidates: [] };
    const [baseline, rows] = await Promise.all([
      store.getRun(saved.baselineRunId),
      store.candidatesForCase(id),
    ]);
    // Same comparison the compare screen renders, so history and detail always agree.
    const candidates = baseline
      ? await Promise.all(
          rows.map(async (row) => ({
            ...row,
            comparison: await service.compare(saved.id, row.run.id),
          })),
        )
      : [];
    return { saved, baseline, candidates };
  }).catch(() => null);
  if (!data) return <DatabaseError />;
  if (!data.saved || !data.baseline) notFound();
  const { saved, baseline, candidates } = data;
  const b = baseline.run;
  return (
    <>
      <Breadcrumb
        items={[
          { href: "/regressions", label: "Regressions" },
          { label: saved.name },
        ]}
      />
      <PageHeader
        eyebrow={<span className="eyebrow">Regression</span>}
        title={saved.name}
        description={saved.scenario}
        meta={
          <>
            <span>Saved {timestamp(saved.createdAt)}</span>
            <span>
              {candidates.length} {candidates.length === 1 ? "replay" : "replays"}
            </span>
          </>
        }
      />
      <div className="regression-layout">
        <div className="regression-main">
          <section className="panel step-panel" aria-labelledby="baseline-heading">
            <SectionHeader
              step={1}
              id="baseline-heading"
              title="Saved baseline"
              actions={<TextLink href={`/runs/${b.id}`}>Inspect trace</TextLink>}
            />
            <div className="baseline-summary">
              <div className="baseline-score">
                <ScoreValue score={b.score} size="xl" />
                <Meter value={b.score} max={100} tone={scoreTone(b.score)} />
              </div>
              <div className="baseline-facts">
                <div className="pill-row">
                  <Verdict passed={baseline.evaluation.passed} />
                  <OutcomeBadge status={baseline.evaluation.taskOutcome.status} />
                </div>
                <div className="meta-row">
                  <ModelChip model={b.model} prompt={b.promptVersion} />
                  <span>{timestamp(b.createdAt)}</span>
                </div>
              </div>
              <dl className="mini-metrics">
                <div><dt>Calls</dt><dd>{b.toolCallCount}</dd></div>
                <div><dt>Failed</dt><dd className={b.toolFailureCount ? "text-danger" : undefined}>{b.toolFailureCount}</dd></div>
                <div><dt>Latency</dt><dd>{duration(b.latencyMs)}</dd></div>
                <div><dt>Tokens</dt><dd>{tokens(b.totalTokens)}</dd></div>
              </dl>
            </div>
            <div className="sub-section">
              <span className="control-label">Recorded tool sequence</span>
              <ol className="chip-sequence">
                {baseline.traces.map((t) => (
                  <li
                    key={t.sequence}
                    className={cn(t.blocked ? "is-blocked" : t.status !== "success" && "is-error")}
                  >
                    <span className="chip-index">{t.sequence}</span>
                    <code>{t.toolName}</code>
                  </li>
                ))}
                {!baseline.traces.length && <li className="muted">No tool calls</li>}
              </ol>
            </div>
          </section>
          <section className="panel step-panel" aria-labelledby="expectations-heading">
            <SectionHeader
              step={2}
              id="expectations-heading"
              title="Expectations"
              meta="Saved rules applied to every replay"
            />
            <dl className="expectations">
              <div className="expect-row">
                <dt>Required tools</dt>
                <dd>
                  {saved.requiredTools.length
                    ? saved.requiredTools.map((name) => (
                        <code className="tool-chip is-required" key={name}>
                          <Check size={12} aria-hidden="true" />
                          {name}
                        </code>
                      ))
                    : <span className="muted">None</span>}
                </dd>
              </div>
              {saved.requiredToolGroups.map((g) => (
                <div className="expect-row" key={g.name}>
                  <dt>
                    {g.name}
                    <span className="expect-note">one must succeed</span>
                  </dt>
                  <dd>
                    {g.tools.map((name, i) => (
                      <span key={name} className="chip-or">
                        {i > 0 && <span className="or">or</span>}
                        <code className="tool-chip is-required">{name}</code>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
              <div className="expect-row">
                <dt>Forbidden tools</dt>
                <dd>
                  {saved.forbiddenTools.length
                    ? saved.forbiddenTools.map((name) => (
                        <code className="tool-chip is-forbidden" key={name}>
                          <Ban size={12} aria-hidden="true" />
                          {name}
                        </code>
                      ))
                    : <span className="muted">None specified</span>}
                  <span className="expect-note">Write and unknown tools are always blocked</span>
                </dd>
              </div>
            </dl>
            <dl className="budget-grid">
              <div>
                <dt>Max tool calls</dt>
                <dd>{saved.maxToolCalls}</dd>
              </div>
              <div>
                <dt>Token budget</dt>
                <dd className={saved.maxTokens === null ? "muted" : undefined}>
                  {saved.maxTokens === null ? "Not set" : tokens(saved.maxTokens)}
                </dd>
              </div>
              <div>
                <dt>Latency budget</dt>
                <dd className={saved.maxLatencyMs === null ? "muted" : undefined}>
                  {saved.maxLatencyMs === null ? "Not set" : duration(saved.maxLatencyMs)}
                </dd>
              </div>
              <div>
                <dt>Successful execution</dt>
                <dd>Required</dd>
              </div>
            </dl>
          </section>
        </div>
        <aside className="regression-aside">
          <section className="panel step-panel replay-panel" aria-labelledby="replay-heading">
            <SectionHeader step={3} id="replay-heading" title="Replay a candidate" meta="Live" />
            <ExecutionForm
              regressionId={id}
              initialModel={b.model}
              defaultModel={process.env.OPENAI_MODEL?.trim() || "gpt-5"}
              baseline={{ model: b.model, promptVersion: b.promptVersion }}
            />
            <p className="panel-foot">
              Live replay reads current PingAura data. Latency and token usage
              may vary between executions.
            </p>
          </section>
        </aside>
      </div>
      <section className="history" aria-labelledby="history-heading">
        <SectionHeader
          id="history-heading"
          title="Replay history"
          meta={candidates.length ? `Latest ${candidates.length}` : undefined}
        />
        {candidates.length ? (
          <div className="data-table history-table" role="table" aria-label="Replay history">
            <div className="data-row data-head" role="row">
              <span role="columnheader">Regression</span>
              <span role="columnheader">Candidate</span>
              <span role="columnheader" className="num">Score Δ</span>
              <span role="columnheader">Agent eval</span>
              <span role="columnheader" className="num">Calls</span>
              <span role="columnheader" className="num">Latency</span>
              <span role="columnheader">Replayed</span>
              <span role="columnheader"><span className="sr-only">Open</span></span>
            </div>
            {candidates.map(({ run, passed, comparison }) => (
                <Link className="data-row" role="row" href={`/compare/${run.id}`} key={run.id}>
                  <span role="cell"><Verdict passed={comparison.result === "PASS"} label="" size="sm" /></span>
                  <span role="cell"><ModelChip model={run.model} prompt={run.promptVersion} /></span>
                  <span role="cell" className="num mono">
                    {comparison.baseline.score}→{comparison.candidate.score}{" "}
                    <span className={comparison.scoreDelta > 0 ? "text-success" : comparison.scoreDelta < 0 ? "text-danger" : "muted"}>
                      {comparison.scoreDelta === 0 ? "±0" : comparison.scoreDelta > 0 ? `+${comparison.scoreDelta}` : comparison.scoreDelta}
                    </span>
                  </span>
                  <span role="cell" className={passed ? "text-success" : "text-danger"}>{passed ? "Pass" : "Fail"}</span>
                  <span role="cell" className="num mono">{run.toolCallCount}</span>
                  <span role="cell" className="num mono">{duration(run.latencyMs)}</span>
                  <span role="cell" className="muted">{timestamp(run.createdAt)}</span>
                  <span role="cell" className="row-cta">
                    Compare
                    <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </Link>
            ))}
          </div>
        ) : (
          <div className="inline-empty">
            <RotateCcw size={16} aria-hidden="true" />
            <span>
              No replays yet. Choose a candidate prompt or model above and replay
              it against this baseline.
            </span>
          </div>
        )}
      </section>
    </>
  );
}
