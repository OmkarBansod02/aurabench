"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Loader2 } from "lucide-react";
import type { EvalCase } from "@/lib/evals/types.mts";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "./ui/field";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import { postJson } from "./execution-form";

export function RegressionDialog({
  runId,
  scenario,
  sequence,
  expectations,
}: {
  runId: string;
  scenario: string;
  sequence: string[];
  expectations: EvalCase;
}) {
  const router = useRouter();
  const [name, setName] = useState(expectations.name);
  const [required, setRequired] = useState(
    (expectations.requiredTools ?? []).join(", "),
  );
  const [forbidden, setForbidden] = useState(
    (expectations.forbiddenTools ?? []).join(", "),
  );
  const [maxCalls, setMaxCalls] = useState(expectations.maxToolCalls);
  const [pending, setPending] = useState(false);
  const guard = useRef(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const names = (text: string) =>
    text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setPending(true);
    setError("");
    try {
      const saved = await postJson<{ evalCaseId: string }>("/api/regressions", {
        runId,
        name,
        requiredTools: names(required),
        forbiddenTools: names(forbidden),
        maxToolCalls: maxCalls,
      });
      setOpen(false);
      router.push(`/regressions/${saved.evalCaseId}`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setPending(false);
      guard.current = false;
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <BookmarkPlus data-icon="inline-start" />
          Save as Regression
        </Button>
      </DialogTrigger>
      <DialogContent className="regression-dialog">
        <DialogHeader>
          <DialogTitle>Save as Regression</DialogTitle>
          <DialogDescription>
            Keep this run as a baseline. Replay another prompt or model against
            the same expectations.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save}>
          <fieldset disabled={pending}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="regression-name">
                  Regression name
                </FieldLabel>
                <input
                  id="regression-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={160}
                  required
                />
              </Field>
              <div className="dialog-context">
                <span className="label">Scenario</span>
                <p>{scenario}</p>
                <details>
                  <summary>
                    Observed tool sequence · {sequence.length} calls
                  </summary>
                  <p className="mono">{sequence.join(" → ") || "No calls"}</p>
                </details>
              </div>
              <Field>
                <FieldLabel htmlFor="required-tools">Required tools</FieldLabel>
                <input
                  id="required-tools"
                  value={required}
                  onChange={(e) => setRequired(e.target.value)}
                />
                <FieldDescription>
                  Comma-separated names; each must succeed.
                </FieldDescription>
              </Field>
              {!!expectations.requiredToolGroups?.length && (
                <p className="muted">
                  Required groups are preserved:{" "}
                  {expectations.requiredToolGroups
                    .map((g) => `${g.name} (${g.tools.join(" or ")})`)
                    .join("; ")}
                  .
                </p>
              )}
              <Field>
                <FieldLabel htmlFor="forbidden-tools">
                  Forbidden tools
                </FieldLabel>
                <input
                  id="forbidden-tools"
                  value={forbidden}
                  onChange={(e) => setForbidden(e.target.value)}
                />
                <FieldDescription>
                  Write and unknown tools always remain blocked.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="max-calls">Maximum tool calls</FieldLabel>
                <input
                  id="max-calls"
                  type="number"
                  min={0}
                  max={100}
                  value={maxCalls}
                  onChange={(e) => setMaxCalls(Number(e.target.value))}
                  required
                />
                <FieldDescription>
                  Existing token and latency budgets are preserved.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </fieldset>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Could not save regression</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              )}
              {pending ? "Saving…" : "Save Regression"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
