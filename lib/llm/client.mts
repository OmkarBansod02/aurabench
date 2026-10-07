export interface ModelResponse {
  status: string;
  output: Array<{
    type: string;
    name?: string;
    arguments?: string;
    call_id?: string;
    content?: Array<{ type: string; text?: string }>;
    [key: string]: unknown;
  }>;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
}

export interface ModelRequest {
  model: string;
  instructions: string;
  input: unknown[];
  tools: unknown[];
  parallel_tool_calls: false;
  store: false;
  include: string[];
}

export type Respond = (request: ModelRequest) => Promise<ModelResponse>;

export function createOpenAIResponder(apiKey = process.env.OPENAI_API_KEY): Respond {
  const key = apiKey?.trim();
  if (!key) throw new Error("Set OPENAI_API_KEY.");
  return async request => {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error();
      const body = await response.json() as ModelResponse;
      if (!Array.isArray(body.output)) throw new Error();
      return body;
    } catch {
      throw new Error("OpenAI request failed. Check API key, model access and network availability.");
    }
  };
}
