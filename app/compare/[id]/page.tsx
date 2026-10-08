import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { withStore } from "@/lib/web/server";
import { uuid } from "@/lib/web/validation.mts";
import {
  Breadcrumb,
  DatabaseError,
  StatusBadge,
  TextLink,
} from "@/components/common";
import {
  ComparisonTable,
  ToolSequenceDiff,
  ComparisonFindings,
} from "@/components/comparison";
import { EvaluationBreakdown } from "@/components/evaluation";
import { buttonVariants } from "@/components/ui/button";

export default async function ComparePage({
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
        href={`/regressions/${saved.id}`}
        label="Regressions"
        current={saved.name}
      />
      <article className="panel comparison-surface">
        <div className="page-title-row">
          <div>
            <h1>Regression comparison</h1>
            <p className="page-description">{saved.scenario}</p>
          </div>
          <StatusBadge label="Comparison" passed={comparison.result === "PASS"} />
        </div>
        <ComparisonTable
          comparison={comparison}
          baseline={baseline.run}
          candidate={candidate.run}
        />
        <ToolSequenceDiff
          baseline={comparison.baselineToolSequence}
          candidate={comparison.candidateToolSequence}
        />
        <ComparisonFindings comparison={comparison} />
        <div className="comparison-actions">
          <div>
            <TextLink href={`/runs/${baseline.run.id}`}>
              Inspect baseline
            </TextLink>
            <TextLink href={`/runs/${candidate.run.id}`}>
              Inspect candidate
            </TextLink>
          </div>
          <Link href={`/regressions/${saved.id}`} className={buttonVariants()}>
            Replay again →
          </Link>
        </div>
      </article>
      <p className="comparison-note">
        Both executions rescored with the current evaluator against the same saved expectations. PASS
        requires the candidate to pass and maintain or improve the total score.
        Live data, latency, and token usage may vary.
      </p>
      <details className="comparison-details">
        <summary>Evaluation breakdowns & findings</summary>
        <div className="comparison-evaluations">
          <div>
            <h2>Baseline · rescored</h2>
            <EvaluationBreakdown evaluation={comparison.baselineEvaluation} />
          </div>
          <div>
            <h2>Candidate · rescored</h2>
            <EvaluationBreakdown evaluation={comparison.candidateEvaluation} />
          </div>
        </div>
      </details>
    </>
  );
}
