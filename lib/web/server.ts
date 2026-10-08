import "server-only";
import { openDatabase } from "@/lib/db/index.mts";
import { RunStore } from "@/lib/db/queries.mts";
import { RegressionService } from "@/lib/regressions/service.mts";

/** Lazy connection: build and the static shell never require database access. */
export async function withStore<T>(
  work: (store: RunStore, service: RegressionService) => Promise<T>,
): Promise<T> {
  const database = openDatabase();
  const store = new RunStore(database.db);
  try {
    // Fail before spending provider tokens if the database or migration is unavailable.
    await database.db.execute("select id from runs limit 0");
    return await work(store, new RegressionService(store));
  } finally {
    await database.close().catch(() => {});
  }
}
