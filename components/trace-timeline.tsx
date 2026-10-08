import { Check, ChevronDown, ShieldX, X } from "lucide-react";
import type { ToolTrace } from "@/lib/mcp/types.mts";
import { duration, timestamp } from "@/lib/web/format";
import { JsonView } from "./json-view";
import { Badge } from "./ui/badge";

export function TraceTimeline({ traces }: { traces: ToolTrace[] }) {
  return (
    <section className="panel trace-panel">
      <div className="section-heading">
        <h2>Agent trace</h2>
        <span className="muted mono">
          {traces.length} MCP {traces.length === 1 ? "call" : "calls"}
        </span>
      </div>
      {!traces.length ? (
        <p className="empty-inline">
          No MCP calls were recorded. Check the execution error and evaluation
          findings.
        </p>
      ) : (
        <ol className="trace-list">
          {traces.map((trace) => (
            <TraceStep key={trace.sequence} trace={trace} />
          ))}
        </ol>
      )}
    </section>
  );
}
function TraceStep({ trace: t }: { trace: ToolTrace }) {
  return (
    <li className={`trace-step trace-${t.status}`}>
      <details>
        <summary>
          <span className="trace-index">{t.sequence}</span>
          <span className="trace-name mono">{t.toolName}</span>
          <span className="trace-status">
            {t.blocked ? (
              <ShieldX size={15} />
            ) : t.status === "success" ? (
              <Check size={15} />
            ) : (
              <X size={15} />
            )}
            <span>{t.blocked ? "Blocked" : t.status}</span>
          </span>
          <span className="trace-latency mono">{duration(t.latencyMs)}</span>
          <ChevronDown size={14} className="disclosure" />
        </summary>
        <div className="trace-detail">
          <div className="trace-properties">
            <Badge variant="outline">{t.riskLevel} risk</Badge>
            <span>
              {t.blocked
                ? "Intercepted · no MCP request sent"
                : "Live MCP request"}
            </span>
            <span>{timestamp(t.startedAt)}</span>
          </div>
          {t.error && (
            <p role="alert" className="trace-error">
              {t.error}
            </p>
          )}
          <JsonView label="Arguments" value={t.arguments} />
          <JsonView label="Returned result" value={t.result} />
        </div>
      </details>
    </li>
  );
}
