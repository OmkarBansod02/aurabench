/** LCS anchors order; pair remaining equal names as moves, then count extras.
 * Compares tool names only, not arguments or success/retry semantics. */
export function sequenceDiff(
  baseline: readonly string[],
  candidate: readonly string[],
) {
  const lengths = Array.from({ length: baseline.length + 1 }, () =>
    Array<number>(candidate.length + 1).fill(0),
  );
  for (let i = baseline.length - 1; i >= 0; i--)
    for (let j = candidate.length - 1; j >= 0; j--) {
      lengths[i][j] =
        baseline[i] === candidate[j]
          ? 1 + lengths[i + 1][j + 1]
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  const matchedBaseline = new Set<number>();
  const matchedCandidate = new Set<number>();
  let i = 0,
    j = 0;
  while (i < baseline.length && j < candidate.length) {
    if (baseline[i] === candidate[j]) {
      matchedBaseline.add(i++);
      matchedCandidate.add(j++);
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++;
    else j++;
  }
  const movedBaseline = new Set<number>();
  const movedCandidate = new Set<number>();
  for (let b = 0; b < baseline.length; b++) {
    if (matchedBaseline.has(b)) continue;
    const c = candidate.findIndex((name, index) => name === baseline[b]
      && !matchedCandidate.has(index) && !movedCandidate.has(index));
    if (c !== -1) { movedBaseline.add(b); movedCandidate.add(c); }
  }
  const entries = (names: readonly string[], matched: Set<number>, moved: Set<number>, side: "baseline" | "candidate") =>
    names.map((name, index) => ({
      name,
      changed: !matched.has(index),
      change: matched.has(index) ? "unchanged" as const : moved.has(index) ? "reordered" as const
        : side === "baseline" ? "removed" as const : "added" as const,
      duplicate: !matched.has(index) && !moved.has(index) && (names.slice(0, index).includes(name) || names.some((n, i) => n === name && (matched.has(i) || moved.has(i)))),
    }));
  return {
    baseline: entries(baseline, matchedBaseline, movedBaseline, "baseline"),
    candidate: entries(candidate, matchedCandidate, movedCandidate, "candidate"),
  };
}
