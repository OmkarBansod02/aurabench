import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronDown, RotateCcw } from "lucide-react";
import { withStore } from "@/lib/web/server";
import { uuid } from "@/lib/web/validation.mts";
import { timestamp } from "@/lib/web/format";
import {
  Breadcrumb,
  DatabaseError,
  PageHeader,
  PageSkeleton,
  TextLink,
} from "@/components/common";
import {
  ComparisonTable,
  ComparisonFindings,
  ScoreBreakdown,
  ToolSequenceDiff,
  VerdictBanner,
} from "@/components/comparison";
import { EvaluationBreakdown } from "@/components/evaluation";
import { Button } from "@/components/ui/button";

export default function ComparePage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CompareContent {...props} />
    </Suspense>
  );
}

async function CompareContent({
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
    const candidate = await store.getRun(id);
    if (!candidate?.evaluation.evalCaseId) return null;
    const saved = await store.getCase(candidate.evaluation.evalCaseId);
    if (!saved) return null;
    const [baseline, comparison] = await Promise.all([
      store.getRun(saved.baselineRunId),
      service.compare(saved.id, id),
    ]);
    return baseline ? { baseline, candidate, comparison, saved } : null;
  }).catch(() => undefined);
  if (data === undefined) return <DatabaseError />;
  if (!data) notFound();
  const { saved, baseline, candidate, comparison } = data;
  return (
    <>
      <Breadcrumb
        items={[
          { href: "/regressions", label: "Regressions" },
          { href: `/regressions/${saved.id}`, label: saved.name },
          { label: "Comparison" },
        ]}
      />
      <PageHeader
        eyebrow={<span className="eyebrow">Baseline vs candidate</span>}
        title={saved.name}
        description={saved.scenario}
        meta={
          <span>
            Candidate replayed{" "}
            <time dateTime={candidate.run.createdAt}>{timestamp(candidate.run.createdAt)}</time>
          </span>
        }
        actions={
          <>
            <TextLink href={`/runs/${baseline.run.id}`}>Baseline trace</TextLink>
            <TextLink href={`/runs/${candidate.run.id}`}>Candidate trace</TextLink>
            <Button asChild variant="outline" size="lg">
              <Link href={`/regressions/${saved.id}`}>
                <RotateCcw data-icon="inline-start" />
                Replay again
              </Link>
            </Button>
          </>
        }
      />
      <div className="compare-stack">
        <VerdictBanner comparison={comparison} candidate={candidate.run} />
        <ComparisonTable
          comparison={comparison}
          baseline={baseline.run}
          candidate={candidate.run}
        />
        <ToolSequenceDiff
          baseline={comparison.baselineToolSequence}
          candidate={comparison.candidateToolSequence}
          baselineTraces={baseline.traces}
          candidateTraces={candidate.traces}
        />
        <div className="compare-split">
          <ScoreBreakdown comparison={comparison} />
          <ComparisonFindings comparison={comparison} />
        </div>
        <details className="disclosure-panel">
          <summary>
            <ChevronDown size={15} aria-hidden="true" />
            Full evaluations & findings
            <span className="panel-count">Both runs rescored with the current evaluator</span>
          </summary>
          <div className="compare-evaluations">
            <EvaluationBreakdown
              evaluation={comparison.baselineEvaluation}
              title="Baseline · Regression score"
            />
            <EvaluationBreakdown
              evaluation={comparison.candidateEvaluation}
              title="Candidate · Regression score"
            />
          </div>
        </details>
        <p className="page-footnote">
          Both executions are rescored with the current evaluator against the
          same saved expectations; original run scores remain unchanged and may differ. A regression PASS requires the candidate to
          complete, pass its agent evaluation, and maintain or improve the total
          score. Live data, latency and token usage may vary between runs.
        </p>
      </div>
    </>
  );
}
