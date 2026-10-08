CREATE TABLE "eval_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"scenario" text NOT NULL,
	"baseline_run_id" uuid NOT NULL,
	"required_tools_json" jsonb NOT NULL,
	"required_tool_groups_json" jsonb NOT NULL,
	"forbidden_tools_json" jsonb NOT NULL,
	"forbidden_risks_json" jsonb NOT NULL,
	"max_tool_calls" integer NOT NULL,
	"max_tokens" integer,
	"max_latency_ms" double precision,
	"require_successful_completion" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"eval_case_id" uuid,
	"expectations_json" jsonb NOT NULL,
	"total_score" integer NOT NULL,
	"completion_score" integer NOT NULL,
	"tool_selection_score" integer NOT NULL,
	"safety_score" integer NOT NULL,
	"efficiency_score" integer NOT NULL,
	"passed" boolean NOT NULL,
	"findings_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text NOT NULL,
	"replay_mode" text DEFAULT 'live' NOT NULL,
	"final_answer" text NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"latency_ms" double precision NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"tool_call_count" integer NOT NULL,
	"tool_failure_count" integer NOT NULL,
	"blocked_write_count" integer NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trace_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"tool_name" text NOT NULL,
	"arguments_json" jsonb,
	"result_json" jsonb,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"latency_ms" double precision NOT NULL,
	"error_message" text,
	"blocked" boolean NOT NULL,
	"risk_level" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_baseline_run_id_runs_id_fk" FOREIGN KEY ("baseline_run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_eval_case_id_eval_cases_id_fk" FOREIGN KEY ("eval_case_id") REFERENCES "public"."eval_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_steps" ADD CONSTRAINT "trace_steps_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_cases_baseline_idx" ON "eval_cases" USING btree ("baseline_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_results_run_idx" ON "eval_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "eval_results_case_idx" ON "eval_results" USING btree ("eval_case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trace_steps_run_sequence_idx" ON "trace_steps" USING btree ("run_id","sequence");