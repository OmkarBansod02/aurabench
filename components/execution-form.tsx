"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Play } from "lucide-react";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "./ui/field";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import { SafetyNote } from "./common";

const DEFAULT_SCENARIO =
  "Find my highest-priority site health problems and explain what I should fix first.";
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Connection interrupted. Check recent runs before retrying: execution may have finished and been saved.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The server returned an unexpected response. Check recent runs before retrying.",
    );
  }
  if (!response.ok)
    throw new Error(data.error || "Request failed. Please try again.");
  return data as T;
}
export function ExecutionForm({
  regressionId,
  initialModel = "gpt-5",
  defaultModel = "gpt-5",
}: {
  regressionId?: string;
  initialModel?: string;
  defaultModel?: string;
}) {
  const router = useRouter();
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO);
  const [model, setModel] = useState(initialModel);
  const [customModel, setCustomModel] = useState("");
  const [promptVersion, setPromptVersion] = useState(
    regressionId ? "v2" : "v1",
  );
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const models = [
    ...new Set([initialModel, defaultModel, "gpt-5", "gpt-5-mini"]),
  ];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const result = await postJson<{ runId: string }>(
        regressionId ? `/api/regressions/${regressionId}/replay` : "/api/runs",
        {
          scenario,
          model: model === "custom" ? customModel.trim() : model,
          promptVersion,
          replayMode: "live",
        },
      );
      router.push(`${regressionId ? "/compare" : "/runs"}/${result.runId}`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed.");
      setPending(false);
      inFlight.current = false;
    }
  }
  return (
    <form
      onSubmit={submit}
      className={regressionId ? "replay-form" : "scenario-form"}
      aria-busy={pending}
    >
      <fieldset disabled={pending}>
        <FieldGroup>
          {!regressionId && (
            <Field>
              <FieldLabel htmlFor="scenario">Scenario</FieldLabel>
              <textarea
                id="scenario"
                maxLength={10000}
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                required
                placeholder="What should the agent investigate?"
              />
              <FieldDescription>
                Uses the site-health evaluation: required PingAura evidence,
                completion, safety, and efficiency.
              </FieldDescription>
            </Field>
          )}
          <div className="execution-controls">
            <div className="selector-controls">
              <Field>
                <FieldLabel htmlFor="model">
                  {regressionId ? "Candidate model" : "Model"}
                </FieldLabel>
                <Select
                  value={model}
                  onValueChange={setModel}
                  disabled={pending}
                >
                  <SelectTrigger id="model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Other GPT model…</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="prompt">
                  {regressionId ? "Candidate prompt" : "Prompt version"}
                </FieldLabel>
                <Select
                  value={promptVersion}
                  onValueChange={setPromptVersion}
                  disabled={pending}
                >
                  <SelectTrigger id="prompt">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="v1">v1 · Baseline</SelectItem>
                      <SelectItem value="v2">v2 · Tool discipline</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Button
              type="submit"
              disabled={
                pending ||
                (!regressionId && !scenario.trim()) ||
                (model === "custom" && !customModel.trim())
              }
            >
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Play data-icon="inline-start" />
              )}
              {pending
                ? regressionId
                  ? "Replaying…"
                  : "Running agent…"
                : regressionId
                  ? "Replay Regression"
                  : "Run Agent"}
              {!pending && <ArrowRight data-icon="inline-end" />}
            </Button>
          </div>
          {model === "custom" && (
            <Field>
              <FieldLabel htmlFor="custom-model">
                OpenAI GPT model ID
              </FieldLabel>
              <input
                id="custom-model"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="gpt-…"
                pattern="gpt-[a-z0-9.\-]+"
                maxLength={100}
                required
              />
              <FieldDescription>
                Uses the same configured OpenAI provider. Model availability
                depends on your account.
              </FieldDescription>
            </Field>
          )}
        </FieldGroup>
      </fieldset>
      <div className="form-footnote">
        <SafetyNote />
        {regressionId && <span className="muted">Live replay</span>}
      </div>
      {pending && (
        <div role="status" className="running-state">
          <Loader2 size={17} className="animate-spin" />
          <div>
            <strong>
              {regressionId
                ? "Replaying against live PingAura data"
                : "Agent is running against PingAura"}
            </strong>
            <p>
              Discovering tools, collecting the trace, then evaluating and
              saving the run. This can take a minute or more. Keep this page
              open.
            </p>
          </div>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Request could not complete</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
