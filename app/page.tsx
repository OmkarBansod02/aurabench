import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, FlaskConical } from "lucide-react";
import { ExecutionForm } from "@/components/execution-form";
import {
  DatabaseError,
  EmptyState,
  Meter,
  ModelChip,
  SectionHeader,
  Tag,
  Verdict,
  scoreTone,
} from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { withStore } from "@/lib/web/server";
import { duration, timestamp } from "@/lib/web/format";

async function RunForm() {
  await connection();
  return (
    <ExecutionForm initialModel={process.env.OPENAI_MODEL?.trim() || "gpt-5"} />
  );
}

const STEPS = [
  ["Run", "Agent executes a scenario against PingAura MCP"],
  ["Inspect", "Every tool call traced and scored"],
  ["Save", "Keep a run as a regression baseline"],
  ["Replay", "Compare a new prompt or model"],
];

async function RecentRuns() {
  await connection();
  const rows = await withStore((store) => store.listRuns()).catch(() => null);
  if (!rows) return <DatabaseError />;
  if (!rows.length)
    return (
      <EmptyState
        title="No executions yet"
        icon={<FlaskConical size={18} aria-hidden="true" />}
      >
        <p>
          Run the scenario above to record your first PingAura trace. Each run
          is scored, persisted, and can become a regression baseline.
        </p>
      </EmptyState>
    );
  return (
    <div className="data-table runs-table" role="table" aria-label="Recent executions">
      <div className="data-row data-head" role="row">
        <span role="columnheader">Agent eval</span>
        <span role="columnheader">Scenario</span>
        <span role="columnheader" className="num">Score</span>
        <span role="columnheader" className="num">Calls</span>
        <span role="columnheader" className="num">Latency</span>
        <span role="columnheader"><span className="sr-only">Open</span></span>
      </div>
      {rows.map(({ run, passed, evalCaseId }) => (
        <Link className="data-row" role="row" key={run.id} href={`/runs/${run.id}`}>
          <span role="cell">
            <Verdict passed={passed} label="" size="sm" />
          </span>
          <span role="cell" className="run-cell">
            <span className="run-scenario">{run.scenario}</span>
            <span className="run-meta">
              <ModelChip model={run.model} prompt={run.promptVersion} />
              <span>{timestamp(run.createdAt)}</span>
              {evalCaseId && <Tag tone="info">Replay</Tag>}
              {run.status === "failed" && <Tag tone="danger">Execution failed</Tag>}
            </span>
          </span>
          <span role="cell" className="num score-cell">
            <span className="mono">{run.score}</span>
            <Meter value={run.score} max={100} tone={scoreTone(run.score)} />
          </span>
          <span role="cell" className="num mono">
            {run.toolCallCount}
            {run.toolFailureCount > 0 && (
              <span className="text-danger" title="Failed calls"> · {run.toolFailureCount}✕</span>
            )}
          </span>
          <span role="cell" className="num mono">{duration(run.latencyMs)}</span>
          <span role="cell" className="row-cta">
            <ArrowRight size={14} aria-hidden="true" />
          </span>
        </Link>
      ))}
    </div>
  );
}

function RunsSkeleton() {
  return (
    <div className="data-table" role="status" aria-label="Loading recent executions">
      {[0, 1, 2].map((i) => (
        <div className="data-row skeleton-row" key={i}>
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-5 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <section className="lab-hero">
        <span className="eyebrow">AuraBench · MCP Agent Regression Lab</span>
        <h1>Test how an agent uses PingAura MCP</h1>
        <p>
          Run a scenario, trace every tool call, score it deterministically, and
          catch regressions when the prompt or model changes.
        </p>
        <ol className="workflow" aria-label="Workflow">
          {STEPS.map(([title, text], i) => (
            <li key={title} className={i === 0 ? "is-current" : undefined}>
              <span className="workflow-index">{i + 1}</span>
              <span>
                <strong>{title}</strong>
                <span className="workflow-text">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section className="lab-composer" aria-label="Run an agent">
        <Suspense fallback={<Skeleton className="h-[178px] w-full rounded-xl" />}>
          <RunForm />
        </Suspense>
      </section>
      <section className="recent-runs" aria-labelledby="recent-heading">
        <SectionHeader id="recent-heading" title="Recent executions" meta="Persisted runs · latest 20" />
        <Suspense fallback={<RunsSkeleton />}>
          <RecentRuns />
        </Suspense>
      </section>
    </>
  );
}
