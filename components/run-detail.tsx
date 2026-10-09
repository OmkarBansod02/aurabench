import Link from "next/link";
import { GitCompareArrows } from "lucide-react";
import type { StoredRun, SavedCase } from "@/lib/db/queries.mts";
import { timestamp } from "@/lib/web/format";
import {
  Breadcrumb,
  Callout,
  MetricStrip,
  ModelChip,
  OutcomeBadge,
  PageHeader,
  Tag,
  TextLink,
  Verdict,
} from "./common";
import { Button } from "./ui/button";
import { RegressionDialog } from "./regression-dialog";
import { TraceTimeline } from "./trace-timeline";
import { EvaluationBreakdown } from "./evaluation";
import { FinalAnswer } from "./final-answer";

export function RunDetail({
  stored,
  regressions,
}: {
  stored: StoredRun;
  regressions: SavedCase[];
}) {
  const { run, evaluation } = stored;
  const attached = evaluation.evalCaseId ?? regressions[0]?.id;
  const candidate = !!evaluation.evalCaseId;
  return (
    <>
      <Breadcrumb
        items={[
          { href: "/", label: "Run lab" },
          { label: `Run ${run.id.slice(0, 8)}` },
        ]}
      />
      <PageHeader
        eyebrow={
          <>
            <span className="eyebrow">{candidate ? "Candidate replay" : "Run inspection"}</span>
            <Verdict passed={evaluation.passed} />
            <OutcomeBadge status={evaluation.taskOutcome.status} />
            {run.status === "failed" && <Tag tone="danger">Execution failed</Tag>}
          </>
        }
        title={run.scenario}
        titleClassName="scenario-title"
        meta={
          <>
            <ModelChip model={run.model} prompt={run.promptVersion} />
            <span>Live execution</span>
            <time dateTime={run.startedAt}>{timestamp(run.startedAt)}</time>
            <code className="run-id" title={run.id}>
              {run.id.slice(0, 8)}
            </code>
          </>
        }
        actions={
          candidate ? (
            <>
              <TextLink href={`/regressions/${evaluation.evalCaseId}`}>Regression</TextLink>
              <Button asChild size="lg">
                <Link href={`/compare/${run.id}`}>
                  <GitCompareArrows data-icon="inline-start" />
                  Compare with baseline
                </Link>
              </Button>
            </>
          ) : attached ? (
            <Button asChild size="lg" variant="outline">
              <Link href={`/regressions/${attached}`}>Open regression</Link>
            </Button>
          ) : run.status === "completed" ? (
            <RegressionDialog
              runId={run.id}
              scenario={run.scenario}
              sequence={stored.traces.map((t) => t.toolName)}
              expectations={evaluation.expectations}
            />
          ) : null
        }
      />
      <MetricStrip run={run} />
      {run.errorMessage && (
        <Callout title="Agent execution failed">
          {run.errorMessage} Check provider/model access and PingAura MCP
          credentials or connectivity. The recorded trace and evaluation are
          preserved.
        </Callout>
      )}
      <div className="run-layout">
        <div className="run-main">
          <TraceTimeline traces={stored.traces} hasAnswer={!!run.finalAnswer} />
          <FinalAnswer answer={run.finalAnswer} />
        </div>
        <aside className="run-aside" aria-label="Evaluation">
          <EvaluationBreakdown evaluation={evaluation} title="Original run score" />
          <p className="aside-note">
            Original scores and findings were persisted at execution. Regression scores use the current evaluator and saved expectations and may differ.
            Task outcome is derived from recorded evidence.
          </p>
        </aside>
      </div>
    </>
  );
}
