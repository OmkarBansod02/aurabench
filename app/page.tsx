import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ExecutionForm } from "@/components/execution-form";
import {
  DatabaseError,
  EmptyState,
  StatusBadge,
  PageSkeleton,
} from "@/components/common";
import { withStore } from "@/lib/web/server";
import { duration, timestamp } from "@/lib/web/format";

async function RunForm() {
  await connection();
  return (
    <ExecutionForm initialModel={process.env.OPENAI_MODEL?.trim() || "gpt-5"} />
  );
}
async function RecentRuns() {
  await connection();
  const rows = await withStore((store) => store.listRuns()).catch(() => null);
  if (!rows) return <DatabaseError />;
  if (!rows.length)
    return (
      <EmptyState title="Your first execution starts here">
        Run a scenario to inspect its PingAura trace and evaluation. Save it as
        a regression, then replay to compare another prompt or model.
      </EmptyState>
    );
  return (
    <section className="recent-runs">
      <div className="section-heading">
        <h2>Recent executions</h2>
        <span className="muted">Latest {rows.length} · persisted runs</span>
      </div>
      <div className="run-rows">
        {rows.map(({ run, passed, evalCaseId }) => (
          <Link className="run-row" key={run.id} href={`/runs/${run.id}`}>
            <StatusBadge passed={passed} />
            <div className="run-row-main">
              <strong>{run.scenario}</strong>
              <span>
                {run.model} · Prompt {run.promptVersion} ·{" "}
                {timestamp(run.createdAt)}
                {evalCaseId ? " · Regression replay" : ""}
              </span>
            </div>
            <div className="run-row-metric mono">
              <strong>
                {run.score}
                <span> / 100</span>
              </strong>
              <span>
                {run.toolCallCount} calls · {duration(run.latencyMs)}
              </span>
            </div>
            <span aria-hidden="true">↗</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
export default function Home() {
  return (
    <>
      <div className="lab-heading">
        <h1>AuraBench</h1>
        <p>MCP Agent Regression Lab</p>
      </div>
      <div className="workflow-line">
        <span className="current">01 Run an agent</span>
        <span aria-hidden="true">→</span>
        <span>02 Inspect & evaluate</span>
        <span aria-hidden="true">→</span>
        <span>03 Save a regression</span>
        <span aria-hidden="true">→</span>
        <span>04 Replay & compare</span>
      </div>
      <section className="panel scenario-panel">
        <div className="section-heading">
          <h2>Test an agent workflow</h2>
          <span className="muted">PingAura MCP</span>
        </div>
        <Suspense fallback={<PageSkeleton />}>
          <RunForm />
        </Suspense>
      </section>
      <Suspense fallback={<PageSkeleton />}>
        <RecentRuns />
      </Suspense>
    </>
  );
}
