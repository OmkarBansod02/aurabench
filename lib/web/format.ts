export const duration = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
export const tokens = (n: number | null) =>
  n === null ? "Unknown" : n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;
export const timestamp = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
export const signed = (n: number) =>
  n === 0 ? "—" : `${n > 0 ? "+" : ""}${n}`;
export const percentage = (
  baseline: number | null,
  candidate: number | null,
) =>
  baseline === null || candidate === null || baseline === 0
    ? null
    : Math.round(((candidate - baseline) / baseline) * 100);
