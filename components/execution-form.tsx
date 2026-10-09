"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, Loader2, Play, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Callout, SafetyNote } from "./common";

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

const PROMPTS = [
  { value: "v1", label: "v1 · Baseline" },
  { value: "v2", label: "v2 · Tool discipline" },
];

function useElapsed(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(id);
      setSeconds(0);
    };
  }, [active]);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function RunningState({ replay, elapsed }: { replay: boolean; elapsed: string }) {
  return (
    <div role="status" className="running-state">
      <div className="running-head">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        <strong>
          {replay ? "Replaying candidate against live PingAura data" : "Agent is running against PingAura MCP"}
        </strong>
        <span className="running-clock" aria-label={`Elapsed ${elapsed}`}>
          {elapsed}
        </span>
      </div>
      <div className="running-bar" aria-hidden="true">
        <span />
      </div>
      <ol className="running-steps">
        <li>Discover tools</li>
        <li>Agent calls MCP</li>
        <li>Evaluate trace</li>
        <li>Save run</li>
      </ol>
      <p>
        Live executions often take a minute or more. Keep this page open. You
        will be taken to the {replay ? "comparison" : "run"} when it is saved.
      </p>
    </div>
  );
}

function SelectControl({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled: boolean;
}) {
  return (
    <div className="control">
      <label htmlFor={id} className="control-label">
        {label}
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="control-trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={6} className="select-menu">
          <SelectGroup>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function ExecutionForm({
  regressionId,
  initialModel = "gpt-5",
  defaultModel = "gpt-5",
  baseline,
}: {
  regressionId?: string;
  initialModel?: string;
  defaultModel?: string;
  baseline?: { model: string; promptVersion: string };
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO);
  const [model, setModel] = useState(initialModel);
  const [customModel, setCustomModel] = useState("");
  const [promptVersion, setPromptVersion] = useState(
    regressionId ? "v2" : "v1",
  );
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const elapsed = useElapsed(pending);
  const replay = !!regressionId;
  const models = [
    ...new Set([initialModel, defaultModel, "gpt-5", "gpt-5-mini"]),
  ];
  const modelOptions = [
    ...models.map((m) => ({ value: m, label: m })),
    { value: "custom", label: "Other GPT model…" },
  ];
  const invalid =
    (!replay && !scenario.trim()) || (model === "custom" && !customModel.trim());
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const result = await postJson<{ runId: string }>(
        replay ? `/api/regressions/${regressionId}/replay` : "/api/runs",
        {
          scenario,
          model: model === "custom" ? customModel.trim() : model,
          promptVersion,
          replayMode: "live",
        },
      );
      router.push(`${replay ? "/compare" : "/runs"}/${result.runId}`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed.");
      setPending(false);
      inFlight.current = false;
    }
  }
  const selects = (
    <>
      <SelectControl
        id="model"
        label={replay ? "Candidate model" : "Model"}
        value={model}
        onChange={setModel}
        options={modelOptions}
        disabled={pending}
      />
      <SelectControl
        id="prompt"
        label={replay ? "Candidate prompt" : "Prompt"}
        value={promptVersion}
        onChange={setPromptVersion}
        options={PROMPTS}
        disabled={pending}
      />
    </>
  );
  const customField = model === "custom" && (
    <div className="custom-model">
      <label htmlFor="custom-model" className="control-label">
        OpenAI GPT model ID
      </label>
      <input
        id="custom-model"
        className="input"
        value={customModel}
        onChange={(e) => setCustomModel(e.target.value)}
        placeholder="gpt-…"
        pattern="gpt-[a-z0-9.\-]+"
        maxLength={100}
        required
        autoFocus
      />
      <p className="hint">
        Uses the configured OpenAI provider. Availability depends on your account.
      </p>
    </div>
  );
  const submitButton = (
    <Button type="submit" size="lg" className="run-button" disabled={pending || invalid}>
      {pending ? (
        <Loader2 className="animate-spin" data-icon="inline-start" />
      ) : replay ? (
        <RotateCcw data-icon="inline-start" />
      ) : (
        <Play data-icon="inline-start" />
      )}
      {pending ? (replay ? "Replaying…" : "Running…") : replay ? "Replay regression" : "Run agent"}
      {!pending && !replay && <kbd className="kbd" aria-hidden="true">⌘↵</kbd>}
      {!pending && replay && <ArrowRight data-icon="inline-end" />}
    </Button>
  );
  const feedback = (
    <>
      {pending && <RunningState replay={replay} elapsed={elapsed} />}
      {error && (
        <Callout title={replay ? "Replay could not complete" : "Run could not complete"}>
          {error}
        </Callout>
      )}
    </>
  );

  if (replay)
    return (
      <form onSubmit={submit} className="replay-form" aria-busy={pending}>
        <fieldset disabled={pending}>
          {baseline && (
            <div className="replay-from">
              <span className="control-label">Baseline</span>
              <div className="replay-from-value">
                <code>{baseline.model}</code>
                <span>Prompt {baseline.promptVersion}</span>
              </div>
              <ArrowDown size={14} className="replay-arrow" aria-hidden="true" />
            </div>
          )}
          <div className="replay-controls">{selects}</div>
          {customField}
          {submitButton}
        </fieldset>
        <div className="form-foot">
          <SafetyNote />
        </div>
        {feedback}
      </form>
    );

  return (
    <form ref={formRef} onSubmit={submit} className="composer-form" aria-busy={pending}>
      <fieldset disabled={pending}>
        <div className="composer">
          <label htmlFor="scenario" className="composer-label">
            Scenario
          </label>
          <textarea
            id="scenario"
            maxLength={10000}
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            required
            rows={3}
            placeholder="What should the agent investigate in PingAura?"
            aria-describedby="scenario-hint"
          />
          <div className="composer-bar">
            <div className="composer-controls">{selects}</div>
            {submitButton}
          </div>
        </div>
        {customField}
      </fieldset>
      <div className="form-foot">
        <SafetyNote />
        <span id="scenario-hint" className="hint">
          Scored on evidence, completion, safety and efficiency · ⌘/Ctrl + Enter to run
        </span>
      </div>
      {feedback}
    </form>
  );
}
