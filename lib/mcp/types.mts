import type { Client } from "@modelcontextprotocol/client";

export type MCPTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];
export type MCPResult = Awaited<ReturnType<Client["callTool"]>>;
export type ToolRisk = "read" | "write" | "unknown";
export type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<MCPResult>;

export interface ToolTrace {
  sequence: number;
  toolName: string;
  arguments: unknown;
  status: "success" | "error" | "blocked";
  result: MCPResult | null;
  error: string | null;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  blocked: boolean;
  riskLevel: ToolRisk;
}
