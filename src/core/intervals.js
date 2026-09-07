// Port of errpresso/intervals.py -- shared interval-merging helpers.

/** Merge overlapping or adjacent half-open [start, end) intervals. */
export function mergeIntervals(intervals) {
  const sorted = [...intervals]
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  if (sorted.length === 0) return [];

  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    const last = merged[merged.length - 1];

    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}

/** Return the union length of a collection of intervals. */
export function intervalsLength(intervals) {
  return mergeIntervals(intervals).reduce(
    (sum, [start, end]) => sum + (end - start),
    0
  );
}
