import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { duration, tokens } from "@/lib/web/format";
import type { StoredRun } from "@/lib/db/queries.mts";
import type { TaskOutcome } from "@/lib/evals/types.mts";

export type Tone = "success" | "danger" | "warning" | "info" | "neutral";

/** PASS/FAIL is always qualified by what it judges: an agent evaluation or a regression comparison. */
export function Verdict({
  passed,
  label = "Agent eval",
  size = "md",
}: {
  passed: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn("verdict", `verdict-${size}`, passed ? "tone-success" : "tone-danger")}
    >
      {passed ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
      {label && <span className="verdict-label">{label}</span>}
      <strong>{passed ? "PASS" : "FAIL"}</strong>
    </span>
  );
}

const OUTCOMES: Record<TaskOutcome["status"], { tone: Tone; text: string }> = {
  completed: { tone: "success", text: "Completed" },
  insufficient_data: { tone: "warning", text: "Insufficient data" },
  failed: { tone: "danger", text: "Failed" },
  unknown: { tone: "neutral", text: "Unknown" },
};
export function OutcomeBadge({
  status,
  label = "Task outcome",
}: {
  status: TaskOutcome["status"];
  label?: string;
}) {
  const { tone, text } = OUTCOMES[status];
  const Icon =
    tone === "success" ? Check : tone === "danger" ? X : tone === "warning" ? TriangleAlert : CircleHelp;
  return (
    <span className={cn("verdict verdict-md", `tone-${tone}`)}>
      <Icon aria-hidden="true" />
      {label && <span className="verdict-label">{label}</span>}
      <strong>{text}</strong>
    </span>
  );
}

export function Tag({
  tone = "neutral",
  children,
  title,
}: {
  tone?: Tone;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span className={cn("tag", `tone-${tone}`)} title={title}>
      {children}
    </span>
  );
}

export function ScoreValue({
  score,
  size = "md",
}: {
  score: number;
  size?: "md" | "lg" | "xl";
}) {
  return (
    <span className={cn("score-value", `score-${size}`)}>
      {score}
      <span className="score-max">/100</span>
    </span>
  );
}

/** Thin proportional bar; `value` and `max` share the same unit. */
export function Meter({
  value,
  max,
  tone = "neutral",
  label,
}: {
  value: number;
  max: number;
  tone?: Tone | "accent";
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span
      className={cn("meter", `meter-${tone}`)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export const scoreTone = (score: number): Tone =>
  score >= 80 ? "success" : score >= 60 ? "warning" : "danger";

export function MetricStrip({ run }: { run: StoredRun["run"] }) {
  const items: { label: string; value: React.ReactNode; sub?: string; tone?: Tone }[] = [
    {
      label: "Agent score",
      value: <ScoreValue score={run.score} size="lg" />,
    },
    { label: "Tool calls", value: run.toolCallCount },
    {
      label: "Failed calls",
      value: run.toolFailureCount,
      sub: run.blockedWriteCount
        ? `incl. ${run.blockedWriteCount} blocked write${run.blockedWriteCount === 1 ? "" : "s"}`
        : undefined,
      tone: run.toolFailureCount ? "danger" : undefined,
    },
    { label: "Latency", value: duration(run.latencyMs) },
    {
      label: "Tokens",
      value: tokens(run.totalTokens),
      sub:
        run.inputTokens !== null && run.outputTokens !== null
          ? `${tokens(run.inputTokens)} in · ${tokens(run.outputTokens)} out`
          : undefined,
    },
  ];
  return (
    <dl className="metric-strip">
      {items.map(({ label, value, sub, tone }) => (
        <div key={label} className={tone ? `metric-${tone}` : undefined}>
          <dt>{label}</dt>
          <dd>
            {value}
            {label === "Agent score" && (
              <Meter value={run.score} max={100} tone={scoreTone(run.score)} />
            )}
          </dd>
          {sub && <span className="metric-sub">{sub}</span>}
        </div>
      ))}
    </dl>
  );
}

export function SafetyNote() {
  return (
    <span className="safety-note">
      <ShieldCheck size={14} aria-hidden="true" />
      Read-only · write and unknown tools are blocked
    </span>
  );
}

export function Callout({
  tone = "danger",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const Icon = tone === "danger" || tone === "warning" ? TriangleAlert : ShieldCheck;
  return (
    <div className={cn("callout", `tone-${tone}`)} role={tone === "danger" ? "alert" : "status"}>
      <Icon size={16} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {children && <div className="callout-body">{children}</div>}
        {action && <div className="callout-action">{action}</div>}
      </div>
    </div>
  );
}

export function DatabaseError() {
  return (
    <div className="state-block">
      <span className="state-icon tone-danger">
        <Database size={18} aria-hidden="true" />
      </span>
      <h2>Execution data is unavailable</h2>
      <p>
        AuraBench could not reach PostgreSQL. Check <code>DATABASE_URL</code>,
        that the database is running, and that migrations have been applied.
        Your runs and regressions will appear once the connection is restored.
      </p>
    </div>
  );
}

export function EmptyState({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="state-block state-empty">
      <span className="state-icon">{icon ?? <ShieldCheck size={18} aria-hidden="true" />}</span>
      <h2>{title}</h2>
      <div className="state-body">{children}</div>
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="page-skeleton" aria-label="Loading execution data" role="status">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-[min(520px,90%)]" />
      <Skeleton className="h-[76px] w-full" />
      <div className="page-skeleton-split">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function TextLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link className="text-link" href={href}>
      {children}
      <ArrowUpRight size={14} aria-hidden="true" />
    </Link>
  );
}

export function Breadcrumb({
  items,
}: {
  items: { href?: string; label: string }[];
}) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => (
          <li key={i}>
            {i > 0 && <ChevronRight size={13} aria-hidden="true" />}
            {item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  titleClassName,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  titleClassName?: string;
}) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {eyebrow && <div className="eyebrow-row">{eyebrow}</div>}
        <h1 className={titleClassName}>{title}</h1>
        {description && <p className="page-description">{description}</p>}
        {meta && <div className="meta-row">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function SectionHeader({
  title,
  meta,
  actions,
  step,
  id,
}: {
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  step?: number;
  id?: string;
}) {
  return (
    <div className="section-header">
      <h2 id={id}>
        {step !== undefined && <span className="step-index">{step}</span>}
        {title}
      </h2>
      {meta && <span className="section-meta">{meta}</span>}
      {actions && <div className="section-actions">{actions}</div>}
    </div>
  );
}

export function ModelChip({ model, prompt }: { model: string; prompt: string }) {
  return (
    <span className="model-chip">
      <code>{model}</code>
      <span aria-hidden="true">·</span>
      <span>Prompt {prompt}</span>
    </span>
  );
}
