import { parseArgs } from "node:util";
import { openDatabase } from "../lib/db/index.mts";
import { RunStore } from "../lib/db/queries.mts";
import { RegressionService } from "../lib/regressions/service.mts";
import { formatComparison } from "../lib/regressions/compare.mts";
import { SITE_HEALTH_EVAL } from "../lib/evals/site-health.mts";

const secrets = [process.env.DATABASE_URL, process.env.OPENAI_API_KEY, process.env.PINGAURA_API_KEY, process.env.PINGAURA_MCP_URL]
  .filter((value): value is string => Boolean(value));
const print = (value: string) => console.log(secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), value));
let database: ReturnType<typeof openDatabase> | undefined;
try {
  const { values } = parseArgs({ options: {
    "baseline-model": { type: "string" }, "candidate-model": { type: "string" },
  } });
  database = openDatabase();
  // Fail before spending model tokens if migrations/database access are missing.
  await database.db.execute("select id from runs limit 0");
  const service = new RegressionService(new RunStore(database.db));
  const model = values["baseline-model"] ?? process.env.OPENAI_MODEL?.trim() ?? "gpt-5";
  print("Running live baseline with prompt v1…");
  const baselineRunId = await service.run({ scenario: SITE_HEALTH_EVAL.scenario, model, promptVersion: "v1" }, SITE_HEALTH_EVAL);
  print(`Baseline run: ${baselineRunId}`);
  const saved = await service.saveAsRegression(baselineRunId, "Site health prioritization");
  print(`Saved regression: ${saved.id}\nReplaying live with prompt v2…`);
  const { candidateRunId, comparison } = await service.replay(saved.id, {
    promptVersion: "v2", model: values["candidate-model"] ?? model,
  });
  print(`Candidate run: ${candidateRunId}\n\n${formatComparison(saved.name, comparison)}`);
  if (comparison.result === "FAIL") process.exitCode = 1;
} catch {
  print("Regression demo failed. Check database migrations, provider credentials/access, and baseline completion. Finished runs remain persisted.");
  process.exitCode = 1;
} finally {
  await database?.close();
}
