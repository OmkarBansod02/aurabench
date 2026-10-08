import type { StoredRun, SavedCase } from "@/lib/db/queries.mts";
import { timestamp } from "@/lib/web/format";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import { Breadcrumb, MetricStrip, StatusBadge, TextLink } from "./common";
import { RegressionDialog } from "./regression-dialog";
import { TraceTimeline } from "./trace-timeline";
import { EvaluationBreakdown, FinalAnswer } from "./evaluation";

export function RunDetail({
  stored,
  regressions,
}: {
  stored: StoredRun;
  regressions: SavedCase[];
}) {
  const { run, evaluation } = stored;
  const attached = evaluation.evalCaseId ?? regressions[0]?.id;
  return (
    <>
      <Breadcrumb
        href="/"
        label="Run lab"
        current={`Execution ${run.id.slice(0, 8)}`}
      />
      <div className="page-title-row">
        <div>
          <h1>Run inspection</h1>
          <p className="page-description">{run.scenario}</p>
        </div>
        <div className="title-actions">
          <StatusBadge passed={evaluation.passed} />
          {attached ? (
            <TextLink href={`/regressions/${attached}`}>
              View regression
            </TextLink>
          ) : run.status === "completed" ? (
            <RegressionDialog
              runId={run.id}
              scenario={run.scenario}
              sequence={stored.traces.map((t) => t.toolName)}
              expectations={evaluation.expectations}
            />
          ) : null}
        </div>
      </div>
      <div className="execution-meta">
        <span className="mono">{run.model}</span>
        <span>Prompt {run.promptVersion}</span>
        <span>Live execution</span>
        <time dateTime={run.startedAt}>{timestamp(run.startedAt)}</time>
      </div>
      <MetricStrip run={run} />
      <p className="muted">Scores and findings below are the original persisted evaluation. Task outcome is derived from recorded evidence; historical evaluations are unchanged.</p>
      {run.errorMessage && (
        <Alert variant="destructive">
          <AlertTitle>Agent execution failed</AlertTitle>
          <AlertDescription>
            {run.errorMessage} Check provider/model access and PingAura MCP
            credentials or connectivity. The recorded trace and evaluation are
            preserved.
          </AlertDescription>
        </Alert>
      )}
      {evaluation.evalCaseId && (
        <div className="comparison-shortcut">
          <TextLink href={`/compare/${run.id}`}>
            View baseline vs candidate comparison
          </TextLink>
        </div>
      )}
      <div className="run-layout">
        <div className="run-main">
          <TraceTimeline traces={stored.traces} />
          <FinalAnswer answer={run.finalAnswer} />
        </div>
        <EvaluationBreakdown evaluation={evaluation} />
      </div>
    </>
  );
}
