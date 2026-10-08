import { connection } from "next/server";
import { notFound } from "next/navigation";
import { withStore } from "@/lib/web/server";
import { uuid } from "@/lib/web/validation.mts";
import { DatabaseError } from "@/components/common";
import { RunDetail } from "@/components/run-detail";

export default async function RunPage({
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
  const data = await withStore(async (store) => {
    const [stored, regressions] = await Promise.all([
      store.getRun(id),
      store.casesForBaseline(id),
    ]);
    return { stored, regressions };
  }).catch(() => null);
  if (!data) return <DatabaseError />;
  if (!data.stored) notFound();
  return <RunDetail stored={data.stored} regressions={data.regressions} />;
}
