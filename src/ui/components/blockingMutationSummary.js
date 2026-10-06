// Shared rendering for "blocking mutation" results (src/core/pamBlocking.js)
// -- a text summary plus a per-nucleotide seed/PAM track -- used by every
// mode that offers the feature (Manual pair's two sides, Single pegRNA's
// one). Takes already-computed BlockingMutation / RegionDisplayEntry data;
// never touches pamBlocking.js itself.

import { escapeHtml } from "../domUtils.js";

export const BLOCKING_REGION_LABELS = {
  none: "None",
  pam: "Destroy PAM",
  seed: "Disrupt seed (3 nt)",
  both: "Both",
};

/** One mutation as short, readable text: "pos 21 G→A (silent, Gly)",
 * "pos 22 blocked -- no synonymous codon for Gly (GGC)", etc. */
function mutationText(m) {
  if (!m.newBase) {
    return `<span style="color:var(--danger);">pos ${m.position} blocked${m.reason ? ` — ${escapeHtml(m.reason)}` : ""}</span>`;
  }
  const tag = m.synonymous === true ? ` (silent, ${m.aminoAcid})` : m.synonymous === null ? "" : "";
  const nagNote = m.stillFormsNag
    ? ` <span style="color:var(--danger);">— still forms NAG, a weaker but real PAM</span>`
    : "";
  return `<span class="mono">${m.position} ${m.originalBase}→${m.newBase}</span>${tag}${nagNote}`;
}

/** Group consecutive display entries that share the same in-CDS codon into
 * one run (capped at 3 -- a codon is never more than 3 bases, so a 4th
 * entry with a matching string is always a *different* codon that just
 * happens to read the same) so the amino acid can be labeled once per
 * codon instead of once per base. Entries with no CDS context here each
 * get their own (unlabeled) group of 1, to keep column bookkeeping simple. */
function groupByCodon(entries) {
  const groups = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && entry.codon !== undefined && entry.codon === last.codon && last.entries.length < 3) {
      last.entries.push(entry);
    } else {
      groups.push({ codon: entry.codon, entries: [entry] });
    }
  }
  return groups;
}

/** A contiguous, position-by-position (1 nt per column) track for one
 * guide's whole seed/PAM region -- not just the positions a mutation was
 * attempted at, so the untouched PAM "N" still appears in context. Each
 * column shows the position, its reference base, and what happened to it
 * (the substituted base in teal, a red "x" if blocked, or a faint dot for
 * the "N", which is never a candidate); a second row underneath labels
 * each in-CDS codon's amino acid once, spanning exactly the columns that
 * belong to it. */
function regionTrackHtml(entries) {
  if (!entries.length) return "";

  const columnHtml = (e) => {
    const isN = !e.isCandidate;
    const blocked = e.isCandidate && !e.newBase;
    const baseColor = isN ? "var(--text-faint)" : blocked ? "var(--danger)" : "var(--teal)";
    const outcome = isN
      ? `<span style="color:var(--text-faint);">·</span>`
      : blocked
        ? `<span style="color:var(--danger);">✕</span>`
        : `<span style="color:${e.stillFormsNag ? "var(--danger)" : "var(--teal)"};font-weight:700;">${escapeHtml(e.newBase)}${e.stillFormsNag ? "⚠" : ""}</span>`;
    const background = e.regionLabel === "seed" ? "var(--accent-soft)" : "var(--bg)";
    const border = e.stillFormsNag ? "1px dashed var(--danger)" : "1px solid transparent";

    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:1px;padding:3px 2px;border-radius:4px;background:${background};border:${border};">
        <div style="font-size:8.5px;color:var(--text-faint);">${e.position}</div>
        <div class="mono" style="font-size:12px;font-weight:700;color:${baseColor};">${escapeHtml(e.originalBase)}</div>
        <div class="mono" style="font-size:11px;">${outcome}</div>
      </div>
    `;
  };

  const groupLabelHtml = (group) => {
    const label = group.codon !== undefined ? escapeHtml(group.entries[0].aminoAcid) : "";
    return `<div style="grid-column: span ${group.entries.length};text-align:center;font-size:9.5px;color:var(--text-faint);border-top:1px solid var(--border-soft);padding-top:3px;">${label}</div>`;
  };

  return `
    <div style="display:grid;grid-template-columns:repeat(${entries.length}, minmax(28px, 1fr));gap:2px 4px;max-width:fit-content;">
      ${entries.map(columnHtml).join("")}
      ${groupByCodon(entries).map(groupLabelHtml).join("")}
    </div>
  `;
}

/**
 * Full blocking-mutation summary block -- a text line of what changed (or
 * why not) plus a per-nucleotide seed/PAM track, repeated once per guide.
 * Returns "" (nothing to show) when every section is either absent or has
 * no attempted mutations -- e.g. blocking mutation is off, or the region
 * resolved to zero candidate positions.
 *
 * @param {Array<{label: string, mutations: import("../../core/pamBlocking.js").BlockingMutation[]|null|undefined, entries: import("../../core/pamBlocking.js").RegionDisplayEntry[]|null|undefined}>} sections
 *   `label` is the full lead-in text before the colon, e.g. "Left blocking"
 *   or just "Blocking" for a single guide.
 */
export function blockingSummaryHtml(sections) {
  const blocks = sections
    .filter((s) => s.mutations && s.mutations.length)
    .map(({ label, mutations, entries }) => {
      const textLine = `<div class="caption"><strong style="color:var(--text);">${label}:</strong> ${mutations.map(mutationText).join(" · ")}</div>`;
      return `${textLine}${regionTrackHtml(entries || [])}`;
    });

  if (!blocks.length) return "";

  return `<div style="border-top:1px solid var(--border-soft);padding-top:10px;margin-top:-4px;display:flex;flex-direction:column;gap:8px;">${blocks.join("")}</div>`;
}

/** Compact, CSV-friendly text for one guide's mutation list, e.g.
 * "22:G>A(silent);21:blocked" -- empty string when there's nothing to say. */
export function mutationsForCsv(list) {
  if (!list || !list.length) return "";
  return list
    .map((m) => (m.newBase ? `${m.position}:${m.originalBase}>${m.newBase}${m.synonymous ? "(silent)" : ""}` : `${m.position}:blocked`))
    .join(";");
}
