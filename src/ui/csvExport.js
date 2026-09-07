// CSV export for design-mode results -- build rows against a column list,
// then trigger a client-side download via a Blob object URL. No server
// round-trip, matching the rest of the app.

import { ICONS } from "./icons.js";

function csvField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** @param {Array<{key: string, label: string}>} columns */
export function buildCsv(rows, columns) {
  const header = columns.map((c) => csvField(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => csvField(row[c.key])).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}

export function downloadCsv(filename, rows, columns) {
  const csv = buildCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Filesystem-safe filename fragment from a record id or label. */
export function slugify(text) {
  return (
    String(text)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sequence"
  );
}

/** One row's worth of the fields every pegRNA design shares, regardless of mode. */
export function pegrnaSideRow(extra, side, assembled) {
  const g = assembled.guide;
  return {
    ...extra,
    side,
    strand: g.strand,
    spacer: assembled.spacerSequence,
    pam: g.pam,
    nick_position: g.nickPosition,
    rtt_sequence: assembled.rttSequence,
    rtt_length_nt: assembled.rttLength,
    pbs_sequence: assembled.pbsSequence,
    pbs_length_nt: assembled.pbsLength,
    full_pegrna_sequence: assembled.fullSequence,
    full_pegrna_length_nt: assembled.fullLength,
  };
}

export const PEGRNA_BASE_COLUMNS = [
  { key: "side", label: "side" },
  { key: "strand", label: "strand" },
  { key: "spacer", label: "spacer" },
  { key: "pam", label: "pam" },
  { key: "nick_position", label: "nick_position" },
  { key: "rtt_sequence", label: "rtt_sequence" },
  { key: "rtt_length_nt", label: "rtt_length_nt" },
  { key: "pbs_sequence", label: "pbs_sequence" },
  { key: "pbs_length_nt", label: "pbs_length_nt" },
  { key: "full_pegrna_sequence", label: "full_pegrna_sequence" },
  { key: "full_pegrna_length_nt", label: "full_pegrna_length_nt" },
];

export function downloadCsvButtonHtml(id) {
  return `<button class="btn btn-ghost btn-sm" id="${id}">${ICONS.download} Download CSV</button>`;
}

/**
 * Wire a download button rendered by downloadCsvButtonHtml() inside `container`.
 * `download` is `{ filename, rows, columns }` or null/undefined (no designs to export).
 */
export function wireDownloadButton(container, download, id = "download-csv-btn") {
  if (!download) return;
  const btn = container.querySelector(`#${id}`);
  if (!btn) return;
  btn.addEventListener("click", () => downloadCsv(download.filename, download.rows, download.columns));
}
