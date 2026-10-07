import { performance } from "node:perf_hooks";
import { classifyTool } from "./guard.mts";
import type { MCPTool, ToolCaller, ToolTrace } from "./types.mts";

export class MCPGateway {
  #tools: Map<string, MCPTool>;
  #call: ToolCaller;
  #traces: ToolTrace[] = [];

  constructor(tools: MCPTool[], call: ToolCaller) {
    // Snapshot discovery so external mutation cannot change permissions mid-run.
    this.#tools = new Map();
    for (const tool of structuredClone(tools)) {
      if (this.#tools.has(tool.name)) throw new Error("Duplicate MCP tool name in discovery.");
      this.#tools.set(tool.name, tool);
    }
    this.#call = call;
  }

  get traces(): ToolTrace[] { return structuredClone(this.#traces); }

  get discovery() {
    return [...this.#tools.values()].map(tool => ({ name: tool.name, riskLevel: classifyTool(tool) }));
  }

  get safeTools() {
    return [...this.#tools.values()].filter(tool => classifyTool(tool) === "read").map(tool => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description ?? "",
      parameters: structuredClone(tool.inputSchema),
      // Preserve the discovered MCP schema, including optional fields.
      strict: false as const,
    }));
  }

  async executeTool(toolName: string, rawArguments: unknown): Promise<ToolTrace> {
    const started = performance.now();
    const riskLevel = classifyTool(this.#tools.get(toolName));
    const trace: ToolTrace = {
      sequence: this.#traces.length + 1, toolName, arguments: rawArguments,
      status: "error", result: null, error: null,
      startedAt: new Date().toISOString(), completedAt: "", latencyMs: 0,
      blocked: riskLevel !== "read", riskLevel,
    };
    this.#traces.push(trace);
    try {
      if (trace.blocked) {
        trace.status = "blocked";
        trace.error = `Tool blocked by read-only policy (risk: ${riskLevel}).`;
      } else {
        const args = typeof rawArguments === "string" ? JSON.parse(rawArguments) : rawArguments;
        trace.arguments = args;
        if (!args || typeof args !== "object" || Array.isArray(args)) {
          throw new Error("Invalid arguments");
        }
        // PingAura validates schema-specific arguments; failures remain in the trace.
        trace.result = await this.#call(toolName, args as Record<string, unknown>);
        trace.status = trace.result.isError ? "error" : "success";
        if (trace.result.isError) trace.error = "MCP tool returned an error.";
      }
    } catch {
      // Raw SDK errors may include credentials or HTTP bodies.
      trace.error = "Tool request failed: invalid arguments, timeout, or MCP error.";
    } finally {
      trace.completedAt = new Date().toISOString();
      trace.latencyMs = Number((performance.now() - started).toFixed(2));
    }
    return structuredClone(trace);
  }
}
