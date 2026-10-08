import Link from "next/link";
import { connection } from "next/server";
import { withStore } from "@/lib/web/server";
import { DatabaseError, EmptyState, TextLink } from "@/components/common";
import { timestamp } from "@/lib/web/format";

export default async function RegressionsPage() {
  await connection();
  const cases = await withStore((store) => store.listCases()).catch(() => null);
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Regressions</h1>
          <p className="page-description">
            Saved baselines. Repeatable expectations. Better agents.
          </p>
        </div>
        <TextLink href="/">Run a new scenario</TextLink>
      </div>
      {!cases ? (
        <DatabaseError />
      ) : !cases.length ? (
        <EmptyState title="No regressions yet">
          Open a completed run and choose Save as Regression. Its trace and
          evaluation become your baseline for future replays.
        </EmptyState>
      ) : (
        <section className="panel regression-list">
          {cases.map((c) => (
            <Link
              className="regression-list-row"
              href={`/regressions/${c.id}`}
              key={c.id}
            >
              <div>
                <h2>{c.name}</h2>
                <p>{c.scenario}</p>
                <span className="muted">
                  {timestamp(c.createdAt)} · {c.maxToolCalls} call budget
                </span>
              </div>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
