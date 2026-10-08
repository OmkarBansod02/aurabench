import { connectPingAura } from "../lib/mcp/client.mts";
import { createOpenAIResponder } from "../lib/llm/client.mts";
import { INITIAL_SCENARIO, runAgent } from "../lib/agent/runner.mts";
import { evaluateRun } from "../lib/evals/evaluate.mts";
import { SITE_HEALTH_EVAL } from "../lib/evals/site-health.mts";
import { formatEvaluation } from "../lib/evals/format.mts";
import { openDatabase } from "../lib/db/index.mts";
import { RunStore } from "../lib/db/queries.mts";

const secrets = [process.env.PINGAURA_API_KEY, process.env.OPENAI_API_KEY, process.env.PINGAURA_MCP_URL, process.env.DATABASE_URL]
  .map(value => value?.trim()).filter((value): value is string => Boolean(value));
const print = (value: string) => console.log(secrets.reduce(
  (text, secret) => text.split(secret).join("[REDACTED]"), value,
));

let connection: Awaited<ReturnType<typeof connectPingAura>> | undefined;
let database: ReturnType<typeof openDatabase> | undefined;
try {
  database = openDatabase();
  await database.db.execute("select id from runs limit 0");
  const respond = createOpenAIResponder();
  connection = await connectPingAura();
  const { gateway } = connection;
  const counts = { read: 0, write: 0, unknown: 0 };
  for (const tool of gateway.discovery) counts[tool.riskLevel]++;
  print(`Discovered ${gateway.discovery.length} tools: ${counts.read} read, ${counts.write} write, ${counts.unknown} unknown.`);
  const scenario = process.argv.slice(2).join(" ").trim() || INITIAL_SCENARIO;
  const result = await runAgent({
    scenario,
    gateway, respond, model: process.env.OPENAI_MODEL?.trim() || "gpt-5",
  });
  print(`\nFinal answer\n${result.finalAnswer || "(none)"}`);
  if (result.error) print(`Run error: ${result.error}`);
  print(`\nTool sequence\n${result.traces.map(t => `${t.sequence}. ${t.toolName} — ${t.status} (${t.riskLevel})`).join("\n") || "(none)"}`);
  const successes = result.traces.filter(t => t.status === "success").length;
  print(`\nTool-call count: ${result.traces.length}\nSuccess/failure count: ${successes}/${result.traces.length - successes} (includes blocked calls)`);
  print(`Per-tool latency:\n${result.traces.map(t => `${t.sequence}. ${t.toolName}: ${t.latencyMs} ms`).join("\n") || "(none)"}`);
  print(`Total latency: ${result.latencyMs} ms (agent loop, including model calls)\nAgent steps: ${result.steps}`);
  print(`Token usage: ${result.usage ? JSON.stringify(result.usage) : "unavailable"}`);
  // Custom scenarios get generic run/safety/budget checks, not site-health requirements.
  const evalCase = scenario === INITIAL_SCENARIO ? SITE_HEALTH_EVAL : {
    ...SITE_HEALTH_EVAL, id: "custom-run-v1", name: "Custom run checks", scenario,
    requiredTools: [], forbiddenTools: [],
  };
  if (scenario !== INITIAL_SCENARIO) print("\nCustom scenario: no required tool behavior configured; evaluating run, safety, and efficiency only.");
  print(`\n${formatEvaluation(evaluateRun(evalCase, scenario, result))}`);
  const runId = await new RunStore(database.db).persistRun(scenario, result, evalCase);
  print(`Persisted run: ${runId}`);
  if (result.status === "error") process.exitCode = 1;
} catch {
  print("Agent spike failed. Check DATABASE_URL/migrations, PingAura and OpenAI credentials, model access and network availability.");
  process.exitCode = 1;
} finally {
  await connection?.close().catch(() => {
    print("MCP connection cleanup failed.");
    process.exitCode = 1;
  });
  await database?.close();
}
