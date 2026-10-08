import type { PromptVersion } from "../agent/prompts.mts";

export class RequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RequestError("Expected a JSON object.");
  return value as Record<string, unknown>;
}
export async function readBody(request: Request) {
  // Bound local input before parsing; trace outputs are not subject to this limit.
  const text = await request.text();
  if (text.length > 32_000)
    throw new RequestError("Request is too large.", 413);
  try {
    return record(JSON.parse(text));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("Invalid JSON request.");
  }
}
export function textField(value: unknown, label: string, max = 10_000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new RequestError(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
export function uuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new RequestError("Invalid record ID.");
  return value;
}
export function executionOptions(body: Record<string, unknown>): {
  model: string;
  promptVersion: PromptVersion;
} {
  const model = textField(body.model, "Model", 100);
  if (!/^gpt-[a-z0-9.-]+$/.test(model))
    throw new RequestError("Choose an OpenAI GPT model ID.");
  if (body.promptVersion !== "v1" && body.promptVersion !== "v2")
    throw new RequestError("Unknown prompt version.");
  if (body.replayMode !== undefined && body.replayMode !== "live")
    throw new RequestError("Only live replay is supported.");
  return { model, promptVersion: body.promptVersion };
}
export function toolNames(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((v) => typeof v !== "string" || !v.trim() || v.length > 200)
  )
    throw new RequestError("Tools must be a list of non-empty names.");
  return [...new Set(value.map((v) => v.trim()))];
}
export function callBudget(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 100
  )
    throw new RequestError("Maximum calls must be an integer from 0 to 100.");
  return value;
}
export function apiError(error: unknown): Response {
  if (error instanceof RequestError)
    return Response.json({ error: error.message }, { status: error.status });
  // Never return database connection strings, SDK errors, or raw provider responses.
  return Response.json(
    {
      error:
        "Unable to read or save execution data. Check DATABASE_URL, PostgreSQL availability, and migrations before retrying.",
    },
    { status: 503 },
  );
}
