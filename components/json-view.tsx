"use client";
import { useState } from "react";
import { Copy, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({
  text,
  label = "Copy",
  compact = false,
}: {
  text: string;
  label?: string;
  compact?: boolean;
}) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied");
    } catch {
      setMessage("Copy unavailable");
    }
    setTimeout(() => setMessage(""), 1800);
  }
  return (
    <button
      type="button"
      className={cn("copy-button", message === "Copied" && "is-copied")}
      onClick={copy}
      aria-label={label}
      title={label}
    >
      {message === "Copied" ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      <span aria-live="polite" className={compact && !message ? "sr-only" : undefined}>
        {message || (compact ? label : "Copy")}
      </span>
    </button>
  );
}

const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function highlight(line: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const index = m.index ?? 0;
    if (index > last) parts.push(line.slice(last, index));
    if (m[1] !== undefined) {
      parts.push(
        <span key={index} className={m[2] ? "j-key" : "j-str"}>
          {m[1]}
        </span>,
      );
      if (m[2]) parts.push(m[2]);
    } else if (m[3] !== undefined) {
      parts.push(<span key={index} className="j-lit">{m[3]}</span>);
    } else {
      parts.push(<span key={index} className="j-num">{m[4]}</span>);
    }
    last = index + m[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

/** MCP tool results usually wrap JSON in text content; expose it parsed without altering the record. */
function parsedPayload(value: unknown): unknown | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result = value as { structuredContent?: unknown; content?: unknown };
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (!Array.isArray(result.content)) return undefined;
  const texts = result.content.flatMap((c) => {
    if (!c || typeof c !== "object" || (c as { type?: unknown }).type !== "text") return [];
    const text = (c as { text?: unknown }).text;
    if (typeof text !== "string") return [];
    try {
      return [JSON.parse(text) as unknown];
    } catch {
      return [text];
    }
  });
  if (!texts.length) return undefined;
  return texts.length === 1 ? texts[0] : texts;
}

const COLLAPSED_LINES = 18;

export function JsonBlock({
  label,
  value,
  emptyText = "None",
  mcpResult = false,
}: {
  label: string;
  value: unknown;
  emptyText?: string;
  mcpResult?: boolean;
}) {
  const parsed = mcpResult ? parsedPayload(value) : undefined;
  const [view, setView] = useState<"parsed" | "raw">(parsed === undefined ? "raw" : "parsed");
  const [expanded, setExpanded] = useState(false);
  const shown = view === "parsed" && parsed !== undefined ? parsed : value;
  const text =
    typeof shown === "string" ? shown : JSON.stringify(shown ?? null, null, 2);
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === "object" && Object.keys(value as object).length === 0);
  const lines = text.split("\n");
  const collapsible = lines.length > COLLAPSED_LINES + 4;
  const visible = collapsible && !expanded ? lines.slice(0, COLLAPSED_LINES) : lines;
  return (
    <div className="json-block">
      <div className="json-head">
        <span className="json-label">{label}</span>
        {parsed !== undefined && (
          <div className="segmented" role="group" aria-label={`${label} view`}>
            {(["parsed", "raw"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                  setExpanded(false);
                }}
              >
                {v === "parsed" ? "Parsed" : "Raw MCP"}
              </button>
            ))}
          </div>
        )}
        <span className="json-meta">
          {isEmpty ? "" : `${lines.length.toLocaleString()} ${lines.length === 1 ? "line" : "lines"}`}
        </span>
        {!isEmpty && <CopyButton text={text} label={`Copy ${label.toLowerCase()}`} compact />}
      </div>
      {isEmpty ? (
        <p className="json-empty">{emptyText}</p>
      ) : (
        <div className={cn("json-body", collapsible && !expanded && "is-collapsed")}>
          <pre tabIndex={0} aria-label={`${label} JSON`}>
            <code>
              {visible.map((line, i) => (
                <span className="j-line" key={i}>
                  {typeof shown === "string" ? line : highlight(line)}
                  {"\n"}
                </span>
              ))}
            </code>
          </pre>
          {collapsible && (
            <button
              type="button"
              className="json-expand"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronDown size={14} aria-hidden="true" />
              {expanded
                ? "Collapse"
                : `Show all ${lines.length.toLocaleString()} lines`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
