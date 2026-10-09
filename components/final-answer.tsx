"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./json-view";

/** Renders a small, safe markdown subset as React elements; never injects HTML. */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const token = m[0];
    if (token.startsWith("**")) out.push(<strong key={i}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={i}>{token.slice(1, -1)}</code>);
    else {
      const label = token.slice(1, token.indexOf("]("));
      out.push(
        <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      );
    }
    last = i + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { type: "h"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "hr" };

function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "h", level: heading[1].length, text: heading[2] });
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      blocks.push({ type: "hr" });
    } else if (bullet || ordered) {
      flush();
      const type = bullet ? "ul" : "ol";
      const prev = blocks[blocks.length - 1];
      const item = (bullet ?? ordered)![1];
      if (prev && prev.type === type) prev.items.push(item);
      else blocks.push({ type, items: [item] });
    } else if (line.startsWith("|") && line.endsWith("|")) {
      flush();
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === "table") prev.rows.push(cells);
      else blocks.push({ type: "table", rows: [cells] });
    } else {
      // Indented continuation of a list item stays with that item.
      const prev = blocks[blocks.length - 1];
      if (!para.length && prev && (prev.type === "ul" || prev.type === "ol") && /^\s+/.test(lines[i]))
        prev.items[prev.items.length - 1] += " " + line;
      else para.push(line);
    }
  }
  flush();
  return blocks;
}

function Markdown({ text }: { text: string }) {
  return (
    <>
      {parse(text).map((b, i) => {
        switch (b.type) {
          case "h":
            return b.level <= 2 ? <h3 key={i}>{inline(b.text)}</h3> : <h4 key={i}>{inline(b.text)}</h4>;
          case "p":
            return <p key={i}>{inline(b.text)}</p>;
          case "hr":
            return <hr key={i} />;
          case "ul":
          case "ol": {
            const List = b.type;
            return (
              <List key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </List>
            );
          }
          case "table":
            return (
              <div className="md-table" key={i}>
                <table>
                  <thead>
                    <tr>
                      {b.rows[0].map((c, j) => (
                        <th key={j}>{inline(c)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.slice(1).map((row, r) => (
                      <tr key={r}>
                        {row.map((c, j) => (
                          <td key={j}>{inline(c)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}

const LONG_ANSWER = 1400;

export function FinalAnswer({ answer }: { answer: string }) {
  const long = answer.length > LONG_ANSWER;
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="panel answer-panel" id="final-answer" aria-labelledby="answer-heading">
      <div className="panel-header">
        <div className="panel-title">
          <h2 id="answer-heading">Final answer</h2>
          {answer && (
            <span className="panel-count">
              {answer.trim().split(/\s+/).length.toLocaleString()} words
            </span>
          )}
        </div>
        {answer && <CopyButton text={answer} label="Copy answer" />}
      </div>
      {answer ? (
        <div className={cn("answer-body", long && !expanded && "is-collapsed")}>
          <div className="prose">
            <Markdown text={answer} />
          </div>
          {long && (
            <button
              type="button"
              className="json-expand"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronDown size={14} aria-hidden="true" />
              {expanded ? "Show less" : "Show full answer"}
            </button>
          )}
        </div>
      ) : (
        <p className="panel-empty">
          The agent did not reach a final answer. See the execution error above.
        </p>
      )}
    </section>
  );
}
