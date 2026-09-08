// Graphical joint-coverage track: numbered rows drawn the same way the
// Manual pair spacer map draws a pair -- a thin connector line between
// two strand-colored triangles (pointing the same way a '+'/'-' guide's
// triangle points on the spacer map), a teal overlap segment on top of
// it, a target band, a merged coverage bar, and a ruler with gridlines.

import { mergeIntervals } from "../../core/intervals.js";

const GUTTER = 58; // px reserved for the row-label gutter (badge + gap)
const TRI_SIZE = 12; // px, matches the spacer map's legend-icon triangle size

function toPercent(coordinate, sequenceLength) {
  if (sequenceLength <= 0) return 0;
  return Math.max(0, Math.min(100, (coordinate / sequenceLength) * 100));
}

function rowNumber(label) {
  const match = /(\d+)\s*$/.exec(label);
  return match ? match[1] : label;
}

// Small triangle nick marker at the given edge, centered on `pct` -- the
// exact same glyph and orientation convention as the spacer map's guide
// triangles: left/'+' points right (in accent), right/'-' points left
// (in teal), so a pegRNA's nick reads identically in both places.
function nickTriangle(edge, pct) {
  const points = edge === "left" ? "1,1 11,6 1,11" : "11,1 1,6 11,11";
  const color = edge === "left" ? "var(--accent)" : "var(--teal)";
  return `
    <div style="position:absolute;left:${pct}%;top:50%;transform:translate(-50%,-50%);line-height:0;">
      <svg width="${TRI_SIZE}" height="${TRI_SIZE}" viewBox="0 0 12 12"><polygon points="${points}" fill="${color}"></polygon></svg>
    </div>`;
}

// Plain end-cap for a non-nick edge (e.g. where a single guide's RTT
// simply stops) -- a quiet tick, not a marker.
function endCap(pct) {
  return `<div style="position:absolute;left:${pct}%;top:50%;transform:translate(-50%,-50%);width:2px;height:10px;border-radius:1px;background:var(--accent-line);"></div>`;
}

/**
 * @param {Object} opts
 * @param {number} opts.sequenceLength
 * @param {number} opts.targetStart
 * @param {number} opts.targetEnd
 * @param {Array<{label: string, start: number, end: number, overlapStart?: number, overlapEnd?: number, nickEdge?: "left"|"right"|"both"}>} opts.rows
 *   Each row is one selection's span. For pairs (nickEdge "both", the
 *   default), overlapStart/overlapEnd mark the RTT-overlap segment and
 *   both ends get an inward nick marker. For single guides, pass
 *   nickEdge "left" ('+' guides) or "right" ('-') so only the true nick
 *   edge gets a marker; the far edge (just where the RTT stops) gets a
 *   plain end-cap instead.
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
  const targetLeft = toPercent(targetStart, sequenceLength);
  const targetRight = toPercent(targetEnd, sequenceLength);

  const rowsHtml = rows
    .map((row) => {
      const left = toPercent(row.start, sequenceLength);
      const right = toPercent(row.end, sequenceLength);
      const width = Math.max(0.3, right - left);
      const nickEdge = row.nickEdge ?? "both";

      let overlapHtml = "";
      if (row.overlapStart !== undefined && row.overlapEnd !== undefined) {
        const overlapLeft = toPercent(row.overlapStart, sequenceLength);
        const overlapRight = toPercent(row.overlapEnd, sequenceLength);
        const overlapWidth = Math.max(0.3, overlapRight - overlapLeft);
        overlapHtml = `<div style="position:absolute;left:${overlapLeft}%;width:${overlapWidth}%;top:calc(50% - 2px);height:4px;border-radius:999px;background:var(--teal);z-index:1;"></div>`;
      }

      const markers =
        (nickEdge === "left" || nickEdge === "both" ? nickTriangle("left", left) : endCap(left)) +
        (nickEdge === "right" || nickEdge === "both" ? nickTriangle("right", right) : endCap(right));

      return `
        <div style="display:flex;align-items:center;gap:10px;height:16px;">
          <span class="mono" style="width:${GUTTER - 10}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;height:13px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:9px;font-weight:700;">${rowNumber(row.label)}</span>
          <div style="position:relative;flex:1;height:${TRI_SIZE}px;">
            <div style="position:absolute;left:${left}%;width:${width}%;top:calc(50% - 1px);height:2px;border-radius:999px;background:var(--accent-line);"></div>
            ${overlapHtml}
            ${markers}
          </div>
        </div>`;
    })
    .join("");

  const merged = mergeIntervals(coveredIntervals);
  const coveredHtml = merged
    .map(([start, end]) => {
      const left = toPercent(start, sequenceLength);
      const width = Math.max(0.2, toPercent(end, sequenceLength) - left);
      return `<div style="position:absolute;left:${left}%;width:${width}%;top:0;bottom:0;border-radius:999px;background:var(--teal);box-shadow:0 1px 2px oklch(0% 0 0 / 0.08);"></div>`;
    })
    .join("");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    position: f * 100,
    label: Math.round(f * sequenceLength).toLocaleString(),
    align: f === 0 ? "left" : f === 1 ? "right" : "center",
  }));

  const tickLabelStyle = (tick) => {
    if (tick.align === "left") return `left:${tick.position}%;`;
    if (tick.align === "right") return `right:0;`;
    return `left:${tick.position}%;transform:translateX(-50%);`;
  };

  const gridlinesHtml = ticks
    .map((t) => `<div class="spacer-map-gridline" style="${t.align === "right" ? "right:0;" : `left:${t.position}%;`}"></div>`)
    .join("");

  return `
    <div class="spacer-map">
      <div class="spacer-map-header" style="margin-bottom:10px;">
        <div class="spacer-map-label">Coverage track</div>
        <div style="display:flex;align-items:baseline;gap:6px;white-space:nowrap;">
          <span style="font-size:20px;font-weight:700;color:var(--teal);letter-spacing:-0.01em;">${coveragePercent.toFixed(1)}%</span>
          <span style="font-size:11.5px;color:var(--text-faint);">of target</span>
        </div>
      </div>

      <div style="position:relative;">
        <div style="position:absolute;left:${GUTTER}px;right:0;top:0;bottom:15px;">
          ${gridlinesHtml}
          <div style="position:absolute;top:0;bottom:0;left:${targetLeft}%;width:${Math.max(0.2, targetRight - targetLeft)}%;background:var(--accent-soft);opacity:0.35;"></div>
        </div>

        <div style="position:relative;display:flex;flex-direction:column;gap:3px;">
          ${rowsHtml}

          <div style="height:1px;background:var(--border-soft);margin:5px 0 5px ${GUTTER}px;"></div>

          <div style="display:flex;align-items:center;gap:10px;height:10px;">
            <span style="width:${GUTTER - 10}px;font-size:10px;color:var(--text-faint);flex-shrink:0;text-align:center;">Target</span>
            <div style="position:relative;flex:1;height:6px;">
              <div style="position:absolute;left:${targetLeft}%;right:${100 - targetRight}%;top:2.5px;height:1.5px;background:var(--text-muted);"></div>
              <div style="position:absolute;left:${targetLeft}%;top:0;width:2px;height:6px;background:var(--text-muted);"></div>
              <div style="position:absolute;right:${100 - targetRight}%;top:0;width:2px;height:6px;background:var(--text-muted);"></div>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:10px;height:8px;">
            <span style="width:${GUTTER - 10}px;font-size:10px;color:var(--text-faint);flex-shrink:0;text-align:center;">Covered</span>
            <div style="position:relative;flex:1;height:8px;border-radius:999px;background:var(--border-soft);">
              ${coveredHtml}
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:10px;margin-top:3px;">
            <span style="width:${GUTTER - 10}px;flex-shrink:0;"></span>
            <div style="position:relative;flex:1;height:12px;">
              ${ticks
                .map((t) => `<span class="spacer-map-tick mono" style="${tickLabelStyle(t)}">${t.label}</span>`)
                .join("")}
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px 20px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-soft);">
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:16px;height:2px;border-radius:999px;background:var(--accent-line);display:inline-block;"></span><span style="font-size:12px;color:var(--text-muted);">nick span</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:14px;height:4px;border-radius:999px;background:var(--teal);display:inline-block;"></span><span style="font-size:12px;color:var(--text-muted);">overlap / covered</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><svg width="12" height="12" viewBox="0 0 12 12" style="color:var(--accent);"><polygon points="1,1 11,6 1,11" fill="currentColor"></polygon></svg><svg width="12" height="12" viewBox="0 0 12 12" style="color:var(--teal);margin-left:-4px;"><polygon points="11,1 1,6 11,11" fill="currentColor"></polygon></svg><span style="font-size:12px;color:var(--text-muted);">nick site (+/&minus;)</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:14px;height:8px;border-radius:3px;background:var(--accent-soft);opacity:0.5;display:inline-block;"></span><span style="font-size:12px;color:var(--text-muted);">target region</span></div>
      </div>
    </div>
  `;
}
