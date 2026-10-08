import { Check, TriangleAlert, X } from "lucide-react";
import type { EvalResult, Finding } from "@/lib/evals/types.mts";
import { CopyButton } from "./json-view";

export function FindingList({ findings }: { findings: Finding[] }) {
  return (
    <ul className="finding-list">
      {findings.map((f, i) => (
        <li key={`${f.code}-${i}`} className={`finding-${f.type}`}>
          {f.type === "success" ? (
            <Check size={15} />
          ) : f.type === "warning" ? (
            <TriangleAlert size={15} />
          ) : (
            <X size={15} />
          )}
          <span>{f.message}</span>
        </li>
      ))}
    </ul>
  );
}
export function EvaluationBreakdown({
  evaluation: e,
}: {
  evaluation: Omit<EvalResult, "evalCaseId">;
}) {
  return (
    <section className="panel evaluation-panel">
      <div className="section-heading">
        <h2>Agent evaluation</h2>
        <span className="muted">Deterministic</span>
      </div>
      <p>Agent evaluation: {e.passed ? "PASS" : "FAIL"}. This scores execution and tool behavior.</p>
      <p>Task outcome: <strong>{e.taskOutcome.status}</strong></p>
      <p className="muted">{e.taskOutcome.reason}</p>
      <dl className="eval-scores">
        {[
          ["Execution & requirements", e.completionScore, 40],
          ["Tool selection", e.toolSelectionScore, 25],
          ["Safety", e.safetyScore, 20],
          ["Efficiency", e.efficiencyScore, 15],
        ].map(([label, score, max]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="mono">
              {score}
              <span> / {max}</span>
            </dd>
          </div>
        ))}
        <div className="eval-total">
          <dt>Total</dt>
          <dd className="mono">
            {e.totalScore}
            <span> / 100</span>
          </dd>
        </div>
      </dl>
      <div className="findings">
        <h3>Findings</h3>
        <FindingList findings={e.findings} />
      </div>
    </section>
  );
}
export function FinalAnswer({ answer }: { answer: string }) {
  return (
    <section className="panel final-answer">
      <div className="section-heading">
        <h2>Final agent answer</h2>
        {answer && <CopyButton text={answer} label="Copy answer" />}
      </div>
      <div className="answer-content">
        {answer ||
          "The agent did not reach a final answer. See the execution error above."}
      </div>
    </section>
  );
}
