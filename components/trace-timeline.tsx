"use client";
import { useState } from "react";
import {
  Check,
  ChevronDown,
  CornerDownRight,
  MessageSquareText,
  RotateCcw,
  ShieldX,
  X,
} from "lucide-react";
import type { ToolTrace } from "@/lib/mcp/types.mts";
import { duration, timestamp } from "@/lib/web/format";
import { cn } from "@/lib/utils";
import { JsonBlock } from "./json-view";
import { Tag } from "./common";

type Kind = "success" | "error" | "blocked";
const kindOf = (t: ToolTrace): Kind =>
  t.blocked || t.status === "blocked" ? "blocked" : t.status === "success" ? "success" : "error";
const STATUS_TEXT: Record<Kind, string> = {
  success: "Success",
  error: "Failed",
  blocked: "Blocked",
};
const RISK_TONE = { read: "neutral", write: "danger", unknown: "warning" } as const;

/** Display-only: a call to a tool that previously failed in the same run. */
const isRetry = (traces: ToolTrace[], index: number) =>
  traces
    .slice(0, index)
    .some((p) => p.toolName === traces[index].toolName && kindOf(p) === "error");

export function TraceTimeline({
  traces,
  hasAnswer,
}: {
  traces: ToolTrace[];
  hasAnswer: boolean;
}) {
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const maxLatency = Math.max(1, ...traces.map((t) => t.latencyMs));
  const counts = traces.reduce(
    (acc, t) => ({ ...acc, [kindOf(t)]: acc[kindOf(t)] + 1 }),
    { success: 0, error: 0, blocked: 0 } as Record<Kind, number>,
  );
  const allOpen = traces.length > 0 && open.size === traces.length;
  const toggle = (seq: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  return (
    <section className="panel trace-panel" aria-labelledby="trace-heading">
      <div className="panel-header">
        <div className="panel-title">
          <h2 id="trace-heading">Agent trace</h2>
          <span className="panel-count">
            {traces.length} MCP {traces.length === 1 ? "call" : "calls"}
          </span>
        </div>
        <div className="trace-summary">
          {counts.success > 0 && (
            <span className="legend-item">
              <span className="legend-dot tone-success" /> {counts.success} ok
            </span>
          )}
          {counts.error > 0 && (
            <span className="legend-item">
              <span className="legend-dot tone-danger" /> {counts.error} failed
            </span>
          )}
          {counts.blocked > 0 && (
            <span className="legend-item">
              <span className="legend-dot tone-warning" /> {counts.blocked} blocked
            </span>
          )}
          {traces.length > 0 && (
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                setOpen(allOpen ? new Set() : new Set(traces.map((t) => t.sequence)))
              }
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
        </div>
      </div>
      {!traces.length ? (
        <p className="panel-empty">
          No MCP calls were recorded. Check the execution error and evaluation
          findings.
        </p>
      ) : (
        <ol className="trace-list">
          {traces.map((trace, i) => (
            <TraceStep
              key={trace.sequence}
              trace={trace}
              retry={isRetry(traces, i)}
              maxLatency={maxLatency}
              open={open.has(trace.sequence)}
              onToggle={() => toggle(trace.sequence)}
            />
          ))}
          <li className={cn("trace-step trace-final", !hasAnswer && "is-missing")}>
            <span className="trace-node" aria-hidden="true">
              <MessageSquareText size={12} />
            </span>
            <a className="trace-final-link" href="#final-answer">
              <span>{hasAnswer ? "Final answer" : "No final answer"}</span>
              <CornerDownRight size={13} aria-hidden="true" />
            </a>
          </li>
        </ol>
      )}
    </section>
  );
}

function TraceStep({
  trace: t,
  retry,
  maxLatency,
  open,
  onToggle,
}: {
  trace: ToolTrace;
  retry: boolean;
  maxLatency: number;
  open: boolean;
  onToggle: () => void;
}) {
  const kind = kindOf(t);
  const detailId = `trace-detail-${t.sequence}`;
  const Icon = kind === "success" ? Check : kind === "blocked" ? ShieldX : X;
  return (
    <li className={cn("trace-step", `is-${kind}`, retry && "is-retry", open && "is-open")}>
      <span className="trace-node" aria-hidden="true">
        <Icon size={12} strokeWidth={2.5} />
      </span>
      <button
        type="button"
        className="trace-row"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className="trace-seq">{String(t.sequence).padStart(2, "0")}</span>
        <span className="trace-name">
          <code>{t.toolName}</code>
          {retry && (
            <Tag tone="info" title="Same tool called again after an earlier failure">
              <RotateCcw size={11} aria-hidden="true" />
              Retry
            </Tag>
          )}
          {t.riskLevel !== "read" && (
            <Tag tone={RISK_TONE[t.riskLevel]}>{t.riskLevel} risk</Tag>
          )}
        </span>
        <span className="trace-latency">
          <span className="latency-track" aria-hidden="true">
            <span style={{ width: `${Math.max(3, (t.latencyMs / maxLatency) * 100)}%` }} />
          </span>
          <span className="latency-value">{duration(t.latencyMs)}</span>
        </span>
        <span className={cn("trace-status", `tone-${kind === "success" ? "success" : kind === "error" ? "danger" : "warning"}`)}>
          {STATUS_TEXT[kind]}
        </span>
        <ChevronDown size={15} className="trace-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="trace-detail" id={detailId}>
          <dl className="trace-props">
            <div>
              <dt>Status</dt>
              <dd>{STATUS_TEXT[kind]}{retry ? " · retry" : ""}</dd>
            </div>
            <div>
              <dt>Risk</dt>
              <dd className="cap">{t.riskLevel}</dd>
            </div>
            <div>
              <dt>Latency</dt>
              <dd className="mono">{duration(t.latencyMs)}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>
                <time dateTime={t.startedAt}>{timestamp(t.startedAt)}</time>
              </dd>
            </div>
            <div>
              <dt>Request</dt>
              <dd>{t.blocked ? "Intercepted · not sent" : "Live MCP"}</dd>
            </div>
          </dl>
          {t.blocked && (
            <p className="trace-note tone-warning">
              <ShieldX size={14} aria-hidden="true" />
              Blocked by read-only evaluation mode. No request reached PingAura.
            </p>
          )}
          {t.error && (
            <p role="alert" className="trace-note tone-danger">
              <X size={14} aria-hidden="true" />
              <span>{t.error}</span>
            </p>
          )}
          <JsonBlock label="Arguments" value={t.arguments} emptyText="No arguments" />
          {(!t.blocked || t.result !== null) && (
            <JsonBlock
              label="Response"
              value={t.result}
              emptyText="No response recorded"
              mcpResult
            />
          )}
        </div>
      )}
    </li>
  );
}
