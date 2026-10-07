import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { MCPGateway } from "./gateway.mts";

const TIMEOUT_MS = 20_000;

// Reuses the verified Phase 1 transport pattern; the isolated spike stays unchanged.
// Keep the raw client private so consumers can only execute through the gateway.
export async function connectPingAura(env = process.env) {
  const key = env.PINGAURA_API_KEY?.trim();
  const endpoint = env.PINGAURA_MCP_URL?.trim();
  if (!key || !endpoint) throw new Error("Set PINGAURA_MCP_URL and PINGAURA_API_KEY.");
  let url: URL;
  try {
    url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error();
    }
  } catch {
    throw new Error("PINGAURA_MCP_URL must be HTTPS without credentials, query or fragment.");
  }
  const client = new Client({ name: "aurabench-agent-spike", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Key ${key}` }, redirect: "error" },
    fetch: (input, init) => fetch(input, {
      ...init,
      redirect: "error",
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    }),
  });
  try {
    await client.connect(transport, { timeout: TIMEOUT_MS });
    // SDK v2 aggregates pages and caches the discovered tool definitions.
    const { tools } = await client.listTools(undefined, { timeout: TIMEOUT_MS });
    const gateway = new MCPGateway(tools, (name, args) => client.callTool(
      { name, arguments: args }, { timeout: TIMEOUT_MS },
    ));
    return { gateway, close: () => client.close() };
  } catch {
    await client.close().catch(() => undefined);
    throw new Error("MCP connection or discovery failed. Check credentials, endpoint and network access.");
  }
}
