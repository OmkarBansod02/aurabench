import { boolean, customType, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { EvalCase, Finding } from "../evals/types.mts";
import type { PromptVersion } from "../agent/prompts.mts";
import type { ToolTrace } from "../mcp/types.mts";

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
// pg and PGlite already decode JSONB. Do not parse a decoded JSON string again:
// malformed/blocked model arguments must round-trip as strings, not objects.
const traceArguments = customType<{ data: unknown; driverData: unknown }>({
  dataType: () => "jsonb",
  toDriver: value => JSON.stringify(value),
  fromDriver: value => value,
});

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  scenario: text("scenario").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").$type<PromptVersion>().notNull(),
  status: text("status", { enum: ["completed", "failed"] }).notNull(),
  replayMode: text("replay_mode", { enum: ["live"] }).notNull().default("live"),
  finalAnswer: text("final_answer").notNull(),
  errorMessage: text("error_message"),
  startedAt: time("started_at").notNull(),
  completedAt: time("completed_at").notNull(),
  latencyMs: doublePrecision("latency_ms").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  toolCallCount: integer("tool_call_count").notNull(),
  toolFailureCount: integer("tool_failure_count").notNull(),
  blockedWriteCount: integer("blocked_write_count").notNull(),
  score: integer("score").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
});

export const traceSteps = pgTable("trace_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id),
  sequence: integer("sequence").notNull(),
  toolName: text("tool_name").notNull(),
  argumentsJson: traceArguments("arguments_json"),
  resultJson: jsonb("result_json").$type<ToolTrace["result"]>(),
  status: text("status", { enum: ["success", "error", "blocked"] }).notNull(),
  startedAt: time("started_at").notNull(),
  completedAt: time("completed_at").notNull(),
  latencyMs: doublePrecision("latency_ms").notNull(),
  errorMessage: text("error_message"),
  blocked: boolean("blocked").notNull(),
  riskLevel: text("risk_level", { enum: ["read", "write", "unknown"] }).notNull(),
}, table => [uniqueIndex("trace_steps_run_sequence_idx").on(table.runId, table.sequence)]);

export const evalCases = pgTable("eval_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  scenario: text("scenario").notNull(),
  baselineRunId: uuid("baseline_run_id").notNull().references(() => runs.id),
  requiredTools: jsonb("required_tools_json").$type<NonNullable<EvalCase["requiredTools"]>>().notNull(),
  requiredToolGroups: jsonb("required_tool_groups_json").$type<NonNullable<EvalCase["requiredToolGroups"]>>().notNull(),
  forbiddenTools: jsonb("forbidden_tools_json").$type<NonNullable<EvalCase["forbiddenTools"]>>().notNull(),
  // Immutable policy: no regression can authorize a write or unknown tool.
  forbiddenRisks: jsonb("forbidden_risks_json").$type<readonly ["write", "unknown"]>().notNull(),
  maxToolCalls: integer("max_tool_calls").notNull(),
  maxTokens: integer("max_tokens"),
  maxLatencyMs: doublePrecision("max_latency_ms"),
  requireSuccessfulCompletion: boolean("require_successful_completion").notNull().default(true),
  createdAt: time("created_at").notNull().defaultNow(),
}, table => [index("eval_cases_baseline_idx").on(table.baselineRunId)]);

export const evalResults = pgTable("eval_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id),
  evalCaseId: uuid("eval_case_id").references(() => evalCases.id),
  // Snapshot preserves the exact rules used, including for unsaved initial runs.
  expectations: jsonb("expectations_json").$type<EvalCase>().notNull(),
  totalScore: integer("total_score").notNull(),
  completionScore: integer("completion_score").notNull(),
  toolSelectionScore: integer("tool_selection_score").notNull(),
  safetyScore: integer("safety_score").notNull(),
  efficiencyScore: integer("efficiency_score").notNull(),
  passed: boolean("passed").notNull(),
  findings: jsonb("findings_json").$type<Finding[]>().notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
}, table => [uniqueIndex("eval_results_run_idx").on(table.runId), index("eval_results_case_idx").on(table.evalCaseId)]);
