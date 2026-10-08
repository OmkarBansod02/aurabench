import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { withStore } from "@/lib/web/server";
import { uuid } from "@/lib/web/validation.mts";
import {
  Breadcrumb,
  DatabaseError,
  ScoreBadge,
  TextLink,
  SafetyNote,
  StatusBadge,
} from "@/components/common";
import { ExecutionForm } from "@/components/execution-form";
import { duration, timestamp, tokens } from "@/lib/web/format";

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
  const data = await withStore(async (store) => {
    const saved = await store.getCase(id);
    if (!saved) return { saved: null, baseline: null, candidates: [] };
    const [baseline, candidates] = await Promise.all([
      store.getRun(saved.baselineRunId),
      store.candidatesForCase(id),
    ]);
    return { saved, baseline, candidates };
  }).catch(() => null);
  if (!data) return <DatabaseError />;
  if (!data.saved || !data.baseline) notFound();
  const { saved, baseline, candidates } = data;
  return (
    <>
      <Breadcrumb
        href="/regressions"
        label="Regressions"
        current={saved.name}
      />
      <div className="page-title-row">
        <div>
          <h1>{saved.name}</h1>
          <p className="page-description">{saved.scenario}</p>
        </div>
      </div>
      <div className="regression-layout">
        <div>
          <section className="panel baseline-panel">
            <div className="section-heading">
              <h2>Baseline</h2>
              <TextLink href={`/runs/${baseline.run.id}`}>
                Inspect execution
              </TextLink>
            </div>
            <div className="baseline-score">
              <ScoreBadge score={baseline.run.score} />
              <span className="muted">
                {baseline.run.model} · Prompt {baseline.run.promptVersion}
              </span>
            </div>
            <p className="muted">{timestamp(baseline.run.createdAt)}</p>
            <ol className="baseline-sequence">
              {baseline.traces.map((t) => (
                <li key={t.sequence}>
                  <span>{t.sequence}</span>
                  <code>{t.toolName}</code>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel expectations-panel">
            <div className="section-heading">
              <h2>Expectations</h2>
              <span className="muted">Saved rules</span>
            </div>
            <dl className="expectations">
              <div>
                <dt>Required tools</dt>
                <dd>
                  {saved.requiredTools.length
                    ? saved.requiredTools.map((name) => (
                        <code key={name}>{name}</code>
                      ))
                    : "None"}
                </dd>
              </div>
              {saved.requiredToolGroups.map((g) => (
                <div key={g.name}>
                  <dt>{g.name} · one must succeed</dt>
                  <dd>
                    {g.tools.map((name) => (
                      <code key={name}>{name}</code>
                    ))}
                  </dd>
                </div>
              ))}
              <div>
                <dt>Forbidden tools</dt>
                <dd>
                  {saved.forbiddenTools.length
                    ? saved.forbiddenTools.map((name) => (
                        <code key={name}>{name}</code>
                      ))
                    : "None specified"}
                </dd>
              </div>
              <div className="budget-row">
                <dt>Maximum calls</dt>
                <dd className="mono">{saved.maxToolCalls}</dd>
              </div>
              <div className="budget-row">
                <dt>Token budget</dt>
                <dd className="mono">
                  {saved.maxTokens === null
                    ? "Not set"
                    : tokens(saved.maxTokens)}
                </dd>
              </div>
              <div className="budget-row">
                <dt>Latency budget</dt>
                <dd className="mono">
                  {saved.maxLatencyMs === null
                    ? "Not set"
                    : duration(saved.maxLatencyMs)}
                </dd>
              </div>
              <div className="budget-row">
                <dt>Successful agent execution</dt>
                <dd>Required</dd>
              </div>
            </dl>
            <SafetyNote />
          </section>
        </div>
        <section className="panel replay-panel">
          <div className="section-heading">
            <h2>Replay candidate</h2>
            <span className="muted">Live</span>
          </div>
          <p className="muted">
            Run the same scenario with another prompt or model. Compare both
            executions against the saved expectations.
          </p>
          <ExecutionForm
            regressionId={id}
            initialModel={baseline.run.model}
            defaultModel={process.env.OPENAI_MODEL?.trim() || "gpt-5"}
          />
          <p className="replay-disclaimer">
            Live replay reads current PingAura data. Latency and token usage may
            vary between executions.
          </p>
        </section>
      </div>
      {!!candidates.length && (
        <section className="recent-runs">
          <div className="section-heading">
            <h2>Replay history</h2>
            <span className="muted">
              Latest {candidates.length} · evaluation status below
            </span>
          </div>
          <div className="run-rows">
            {candidates.map(({ run, passed }) => (
              <Link
                className="run-row"
                href={`/compare/${run.id}`}
                key={run.id}
              >
                <StatusBadge passed={passed} />
                <div className="run-row-main">
                  <strong>
                    {run.model} · Prompt {run.promptVersion}
                  </strong>
                  <span>{timestamp(run.createdAt)}</span>
                </div>
                <span className="mono">{run.score} / 100</span>
                <span>Compare ↗</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
