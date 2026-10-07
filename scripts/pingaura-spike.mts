import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

type Tool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];
const TIMEOUT_MS = 20_000;

// PingAura explicitly classifies this exact tool as read-only:
// https://www.pingaura.ai/docs/mcp/mcp-server#available-tools
// Never infer safety from name prefixes or server annotations alone.
export function selectSafeTool(tools: Tool[]): Tool | undefined {
  return tools.find((tool) =>
    tool.name === "list-domains" &&
    tool.annotations?.readOnlyHint !== false &&
    tool.annotations?.destructiveHint !== true &&
    tool.inputSchema.type === "object" &&
    (tool.inputSchema.required?.length ?? 0) === 0
  );
}

async function main() {
  const key = process.env.PINGAURA_API_KEY?.trim();
  const endpoint = process.env.PINGAURA_MCP_URL?.trim();
  if (!key || !endpoint) {
    console.error("Set PINGAURA_MCP_URL and PINGAURA_API_KEY in .env.local or the environment.");
    process.exitCode = 1;
    return;
  }

  let url: URL;
  try {
    url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("Invalid endpoint");
    }
  } catch {
    console.error("PINGAURA_MCP_URL must be an HTTPS URL without credentials, query or fragment.");
    process.exitCode = 1;
    return;
  }

  // Redact credentials even if remote metadata happens to echo them.
  const print = (value: unknown) => console.log(
    JSON.stringify(value, null, 2).split(key).join("[REDACTED]").split(endpoint).join("[ENDPOINT]"),
  );
  let stage = "connect";
  let httpStatus: number | undefined;
  const client = new Client({ name: "aurabench-connectivity-spike", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Key ${key}` }, redirect: "error" },
    fetch: async (input, init) => {
      const response = await fetch(input, {
        ...init,
        redirect: "error",
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(TIMEOUT_MS)])
          : AbortSignal.timeout(TIMEOUT_MS),
      });
      httpStatus = response.status;
      return response;
    },
  });

  try {
    await client.connect(transport, { timeout: TIMEOUT_MS });
    print({ connected: true });
    stage = "list tools";
    // SDK v2 aggregates all pages and caches schemas for call validation.
    const { tools } = await client.listTools(undefined, { timeout: TIMEOUT_MS });
    for (const tool of tools) {
      print({ name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema });
    }
    print({ toolCount: tools.length });

    const tool = selectSafeTool(tools);
    if (!tool) {
      print({ skipped: true, reason: "No eligible, documented read-only list-domains tool. No tools were called." });
      return;
    }

    stage = "call list-domains";
    const started = performance.now();
    // The only tools/call in this spike. No retries or alternate tools.
    try {
      const result = await client.callTool(
        { name: "list-domains", arguments: {} },
        { timeout: TIMEOUT_MS },
      );
      // Account data is deliberately omitted; success and timing verify connectivity.
      print({ tool: tool.name, status: result.isError ? "tool_error" : "success", latencyMs: Number((performance.now() - started).toFixed(2)) });
      if (result.isError) process.exitCode = 1;
    } catch {
      print({ tool: tool.name, status: "request_error", latencyMs: Number((performance.now() - started).toFixed(2)) });
      throw new Error("Tool request failed");
    }
  } catch {
    // Do not print raw SDK errors, HTTP bodies, headers or endpoint URLs.
    print({ failedAt: stage, httpStatus, message: "MCP request failed. Check credentials, endpoint and network access." });
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => {
      console.error("MCP connection cleanup failed.");
      process.exitCode = 1;
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
