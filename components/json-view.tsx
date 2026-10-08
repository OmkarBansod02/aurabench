"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied");
    } catch {
      setMessage("Copy unavailable");
    }
    setTimeout(() => setMessage(""), 2000);
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={copy}
      aria-label={label}
    >
      {message === "Copied" ? (
        <Check data-icon="inline-start" />
      ) : (
        <Copy data-icon="inline-start" />
      )}
      <span aria-live="polite">{message || label}</span>
    </Button>
  );
}
export function JsonView({ label, value }: { label: string; value: unknown }) {
  const text = JSON.stringify(value ?? null, null, 2);
  return (
    <details className="json-view" open={text.length < 1800}>
      <summary>
        <span>{label}</span>
        <span className="muted">
          JSON · {text.length.toLocaleString()} characters
        </span>
      </summary>
      <div className="json-toolbar">
        <CopyButton text={text} label={`Copy ${label.toLowerCase()}`} />
      </div>
      <pre tabIndex={0}>{text}</pre>
    </details>
  );
}
