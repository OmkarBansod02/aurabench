import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, History } from "lucide-react";
import { withStore } from "@/lib/web/server";
import { DatabaseError, EmptyState, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { timestamp } from "@/lib/web/format";

export default async function RegressionsPage() {
  await connection();
  const cases = await withStore((store) => store.listCases()).catch(() => null);
  return (
    <>
      <PageHeader
        eyebrow={<span className="eyebrow">Saved baselines</span>}
        title="Regressions"
        description="Each regression pins a baseline run and its expectations. Replay a new prompt or model to see whether it improves or regresses."
        actions={
          <Button asChild variant="outline" size="lg">
            <Link href="/">Run a new scenario</Link>
          </Button>
        }
      />
      {!cases ? (
        <DatabaseError />
      ) : !cases.length ? (
        <EmptyState
          title="No regressions yet"
          icon={<History size={18} aria-hidden="true" />}
          action={
            <Button asChild size="lg">
              <Link href="/">Go to the run lab</Link>
            </Button>
          }
        >
          <p>
            Open a completed run and choose <strong>Save as Regression</strong>.
            Its trace and evaluation become the baseline for future replays.
          </p>
        </EmptyState>
      ) : (
        <div className="data-table regressions-table" role="table" aria-label="Saved regressions">
          <div className="data-row data-head" role="row">
            <span role="columnheader">Regression</span>
            <span role="columnheader" className="num">Call budget</span>
            <span role="columnheader">Saved</span>
            <span role="columnheader"><span className="sr-only">Open</span></span>
          </div>
          {cases.map((c) => (
            <Link className="data-row" role="row" href={`/regressions/${c.id}`} key={c.id}>
              <span role="cell" className="run-cell">
                <span className="run-name">{c.name}</span>
                <span className="run-scenario is-secondary">{c.scenario}</span>
              </span>
              <span role="cell" className="num mono">≤ {c.maxToolCalls}</span>
              <span role="cell" className="muted">{timestamp(c.createdAt)}</span>
              <span role="cell" className="row-cta">
                Open
                <ArrowRight size={14} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
