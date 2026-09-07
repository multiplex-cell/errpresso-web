// Graphical joint-coverage track, matching the approved design canvas:
// rounded pill bars per selection with a teal overlap/footprint segment,
// a target bracket, a merged coverage bar, and a ruler.

import { mergeIntervals } from "../../core/intervals.js";

const TRACK_WIDTH = 900; // px, matches the design canvas's Main.dc.html

function toPx(coordinate, sequenceLength, width = TRACK_WIDTH) {
  if (sequenceLength <= 0) return 0;
  return Math.max(0, Math.min(width, (coordinate / sequenceLength) * width));
}

/**
 * @param {Object} opts
 * @param {number} opts.sequenceLength
 * @param {number} opts.targetStart
 * @param {number} opts.targetEnd
 * @param {Array<{label: string, start: number, end: number, overlapStart?: number, overlapEnd?: number, nickColumn?: "left"|"right"}>} opts.rows
 *   Each row is one selection's span. For pairs, overlapStart/overlapEnd
 *   mark the RTT-overlap segment. For single guides, pass nickColumn
 *   ("left" for '+' guides, "right" for '-') so only the true nick edge
 *   gets an arrow-ish accent; the far edge stays a plain cap.
 * @param {Array<[number, number]>} opts.coveredIntervals -- already target-clipped
 * @param {number} opts.coveragePercent
 */
export function buildCoverageMapHtml({
  sequenceLength,
  targetStart,
  targetEnd,
  rows,
  coveredIntervals,
  coveragePercent,
}) {
  const rowsHtml = rows
    .map((row) => {
      const left = toPx(row.start, sequenceLength);
      const right = toPx(row.end, sequenceLength);
      const width = Math.max(2, right - left);

      let overlapHtml = "";
      if (row.overlapStart !== undefined && row.overlapEnd !== undefined) {
        const overlapLeft = toPx(row.overlapStart, sequenceLength);
        const overlapRight = toPx(row.overlapEnd, sequenceLength);
        const overlapWidth = Math.max(2, overlapRight - overlapLeft);
        overlapHtml = `<div style="position:absolute;left:${overlapLeft}px;width:${overlapWidth}px;height:20px;border-radius:999px;background:var(--teal);opacity:0.85;"></div>`;
      }

      return `
        <div style="display:flex;align-items:center;gap:12px;height:22px;">
          <span style="width:46px;font-size:11.5px;color:var(--text-faint);flex-shrink:0;">${row.label}</span>
          <div style="position:relative;flex:1;height:20px;">
            <div style="position:absolute;left:${left}px;width:${width}px;height:20px;border-radius:999px;background:var(--accent-soft);border:1px solid var(--accent-line);"></div>
            ${overlapHtml}
          </div>
        </div>`;
    })
    .join("");

  const targetLeft = toPx(targetStart, sequenceLength);
  const targetRight = toPx(targetEnd, sequenceLength);

  const merged = mergeIntervals(coveredIntervals);
  const coveredHtml = merged
    .map(([start, end]) => {
      const left = toPx(start, sequenceLength);
      const width = Math.max(1, toPx(end, sequenceLength) - left);
      return `<div style="position:absolute;left:${left}px;width:${width}px;height:14px;border-radius:4px;background:var(--teal);"></div>`;
    })
    .join("");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    position: f * TRACK_WIDTH,
    label: Math.round(f * sequenceLength).toLocaleString(),
    align: f === 0 ? "left" : f === 1 ? "right" : "center",
  }));

  const tickStyle = (tick) => {
    if (tick.align === "left") return `left:${tick.position}px;`;
    if (tick.align === "right") return `right:0;`;
    return `left:${tick.position}px;transform:translateX(-50%);`;
  };

  return `
    <div class="panel" style="padding:22px 24px;">
      <div style="display:flex;flex-direction:column;gap:7px;">
        ${rowsHtml}
        <div style="height:1px;background:var(--border-soft);margin:6px 0 6px 58px;"></div>
        <div style="display:flex;align-items:center;gap:12px;height:16px;">
          <span style="width:46px;font-size:11.5px;color:var(--text-faint);flex-shrink:0;">Target</span>
          <div style="position:relative;flex:1;height:8px;">
            <div style="position:absolute;left:${targetLeft}px;right:${TRACK_WIDTH - targetRight}px;top:3px;height:2px;background:var(--text-faint);"></div>
            <div style="position:absolute;left:${targetLeft}px;top:0;width:2px;height:8px;background:var(--text-faint);"></div>
            <div style="position:absolute;left:${targetRight - 2}px;top:0;width:2px;height:8px;background:var(--text-faint);"></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;height:22px;">
          <span style="width:46px;font-size:11.5px;color:var(--text-faint);flex-shrink:0;">Covered</span>
          <div style="position:relative;flex:1;height:14px;border-radius:4px;background:var(--border-soft);">
            ${coveredHtml}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:2px;">
          <span style="width:46px;flex-shrink:0;"></span>
          <div style="position:relative;flex:1;height:14px;">
            ${ticks
              .map(
                (t) =>
                  `<span class="mono" style="position:absolute;${tickStyle(t)}font-size:10.5px;color:var(--text-faint);">${t.label}</span>`
              )
              .join("")}
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:18px;margin-top:18px;padding-top:14px;border-top:1px solid var(--border-soft);">
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:14px;height:8px;border-radius:3px;background:var(--accent-soft);border:1px solid var(--accent-line);display:inline-block;"></span><span style="font-size:12px;color:var(--text-muted);">nick span</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:14px;height:8px;border-radius:3px;background:var(--teal);display:inline-block;"></span><span style="font-size:12px;color:var(--text-muted);">RTT overlap</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:14px;height:8px;border-radius:3px;background:var(--teal);display:inline-block;"></span><span style="font-size:12px;color:var(--text-muted);">covered</span></div>
        <div style="margin-left:auto;font-size:12.5px;color:var(--text-muted);">Coverage <span style="font-weight:600;color:var(--teal);">${coveragePercent.toFixed(1)}%</span></div>
      </div>
    </div>
  `;
}
