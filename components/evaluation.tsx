import { Check, TriangleAlert, X } from "lucide-react";
import type { EvalResult, Finding } from "@/lib/evals/types.mts";
import { cn } from "@/lib/utils";
import { Meter, OutcomeBadge, ScoreValue, Verdict, scoreTone } from "./common";

export const CATEGORIES = [
  { key: "completionScore", label: "Execution & requirements", max: 40 },
  { key: "toolSelectionScore", label: "Tool selection", max: 25 },
  { key: "safetyScore", label: "Safety", max: 20 },
  { key: "efficiencyScore", label: "Efficiency", max: 15 },
] as const;

const FINDING_ORDER: Finding["type"][] = ["error", "warning", "success"];

export function FindingList({ findings }: { findings: Finding[] }) {
  const sorted = [...findings].sort(
    (a, b) => FINDING_ORDER.indexOf(a.type) - FINDING_ORDER.indexOf(b.type),
  );
  return (
    <ul className="finding-list">
      {sorted.map((f, i) => (
        <li key={`${f.code}-${i}`} className={`finding finding-${f.type}`}>
          <span className="finding-icon" aria-hidden="true">
            {f.type === "success" ? (
              <Check size={12} strokeWidth={2.5} />
            ) : f.type === "warning" ? (
              <TriangleAlert size={12} strokeWidth={2.5} />
            ) : (
              <X size={12} strokeWidth={2.5} />
            )}
          </span>
          <span className="sr-only">{f.type}: </span>
          <span>{f.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function EvaluationBreakdown({
  evaluation: e,
  title = "Agent evaluation",
  className,
}: {
  evaluation: Omit<EvalResult, "evalCaseId">;
  title?: string;
  className?: string;
}) {
  const issues = e.findings.filter((f) => f.type !== "success").length;
  return (
    <section className={cn("panel eval-panel", className)} aria-label={title}>
      <div className="eval-section">
        <div className="eval-head">
          <span className="eyebrow">{title}</span>
          <Verdict passed={e.passed} label="" size="sm" />
        </div>
        <div className="eval-score">
          <ScoreValue score={e.totalScore} size="xl" />
          <span className="eval-score-note">Deterministic · tool behavior</span>
        </div>
        <Meter
          value={e.totalScore}
          max={100}
          tone={scoreTone(e.totalScore)}
          label={`Agent score ${e.totalScore} of 100`}
        />
        <dl className="eval-categories">
          {CATEGORIES.map(({ key, label, max }) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>
                <span className="mono">
                  {e[key]}
                  <span className="of">/{max}</span>
                </span>
                <Meter value={e[key]} max={max} tone={e[key] === max ? "success" : e[key] / max >= 0.6 ? "warning" : "danger"} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="eval-section eval-outcome">
        <div className="eval-head">
          <span className="eyebrow">Task outcome</span>
          <span className="eval-aside">Independent of score</span>
        </div>
        <OutcomeBadge status={e.taskOutcome.status} label="" />
        <p>{e.taskOutcome.reason}</p>
      </div>
      <div className="eval-section">
        <div className="eval-head">
          <span className="eyebrow">Findings</span>
          <span className="eval-aside">
            {issues ? `${issues} to review` : "No issues"}
          </span>
        </div>
        <FindingList findings={e.findings} />
      </div>
    </section>
  );
}
