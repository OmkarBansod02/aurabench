import Link from "next/link";
import { Check, ShieldCheck, X, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { duration, tokens } from "@/lib/web/format";
import type { StoredRun } from "@/lib/db/queries.mts";

export function StatusBadge({ passed, label = "Agent eval" }: { passed: boolean; label?: string }) {
  return (
    <Badge variant="outline" className={passed ? "status-pass" : "status-fail"}>
      {passed ? <Check /> : <X />}
      {label}: {passed ? "PASS" : "FAIL"}
    </Badge>
  );
}
export function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="score-number">
      {score}
      <span> / 100</span>
    </span>
  );
}
export function MetricStrip({ run }: { run: StoredRun["run"] }) {
  return (
    <dl className="metric-strip">
      {[
        ["Agent quality", `${run.score} / 100`],
        ["Tool calls", run.toolCallCount],
        ["Failures", run.toolFailureCount],
        ["Latency", duration(run.latencyMs)],
        ["Tokens", tokens(run.totalTokens)],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function SafetyNote() {
  return (
    <span className="safety-note">
      <ShieldCheck size={14} />
      Read-only · writes and unknown tools blocked
    </span>
  );
}
export function DatabaseError() {
  return (
    <Alert variant="destructive">
      <AlertTitle>Execution data is unavailable</AlertTitle>
      <AlertDescription>
        Check DATABASE_URL, PostgreSQL availability, and migrations. Your runs
        and regressions will appear here when the connection is restored.
      </AlertDescription>
    </Alert>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Empty className="empty-state">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldCheck />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
export function PageSkeleton() {
  return (
    <div
      className="page-skeleton"
      aria-label="Loading execution data"
      role="status"
    >
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
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
      <ArrowUpRight size={14} />
    </Link>
  );
}
export function Breadcrumb({
  href,
  label,
  current,
}: {
  href: string;
  label: string;
  current: string;
}) {
  return (
    <div className="breadcrumb">
      <Link href={href}>{label}</Link>
      <span>/</span>
      <span>{current}</span>
    </div>
  );
}
