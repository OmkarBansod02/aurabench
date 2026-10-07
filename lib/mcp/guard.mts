import type { MCPTool, ToolRisk } from "./types.mts";

// Reviewed against https://www.pingaura.ai/docs/mcp/mcp-server#available-tools
// on 2026-10-07. Discovery supplies schemas, never permission. New names fail closed.
const READ_TOOLS = new Set([
  "list-domains", "get-domain", "list-competitors", "list-visibility-runs",
  "get-visibility-summary", "get-prompt-scores", "list-prompt-filters",
  "list-site-audits", "get-audit-issues", "list-articles", "get-article",
  "list-site-pages", "get-account-info", "get-quota-usage", "get-site-health-summary",
]);
const WRITE_TOOLS = new Set([
  "create-prompt", "archive-prompt", "restore-prompt", "move-prompt-to-topic",
  "create-prompt-topic", "update-prompt-topic", "delete-prompt-topic",
  "update-article", "publish-article", "archive-article", "run-site-audit",
  "update-issue-status", "add-competitor", "update-competitor", "delete-competitor",
]);

export function classifyTool(tool: MCPTool | undefined): ToolRisk {
  if (!tool) return "unknown";
  if (WRITE_TOOLS.has(tool.name)) return "write";
  if (!READ_TOOLS.has(tool.name)) return "unknown";
  if (tool.annotations?.readOnlyHint === false || tool.annotations?.destructiveHint === true) {
    return "unknown";
  }
  return tool.inputSchema.type === "object" ? "read" : "unknown";
}
