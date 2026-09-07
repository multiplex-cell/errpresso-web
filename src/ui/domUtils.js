// Small shared DOM/formatting helpers used across mode modules.

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Truncate a sequence for compact table display, matching the app's
 * "…" horizontal-scroll convention loosely (full value in a title attr). */
export function truncateSeq(sequence, maxLength = 24) {
  if (sequence.length <= maxLength) return escapeHtml(sequence);
  return `${escapeHtml(sequence.slice(0, maxLength))}&hellip;`;
}
