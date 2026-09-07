// Graphical joint-coverage track: numbered rows with rounded pill spans,
// a teal overlap/footprint segment, inward-pointing nick markers, a
// target band, a merged coverage bar, and a ruler with gridlines.

import { mergeIntervals } from "../../core/intervals.js";

const GUTTER = 58; // px reserved for the row-label gutter (badge + gap)

function toPercent(coordinate, sequenceLength) {
  if (sequenceLength <= 0) return 0;
  return Math.max(0, Math.min(100, (coordinate / sequenceLength) * 100));
}

function rowNumber(label) {
  const match = /(\d+)\s*$/.exec(label);
  return match ? match[1] : label;
}

// Small CSS-triangle nick marker, pointing into the pill from the given
// edge -- visual shorthand for "this is where the guide actually cuts".
function nickMarker(edge) {
  const common = "position:absolute;top:50%;transform:translateY(-50%);width:0;height:0;";
  if (edge === "left") {
    return `<div style="${common}left:-1px;border-top:3px solid transparent;border-bottom:3px solid transparent;border-left:4px solid var(--accent);"></div>`;
  }
  return `<div style="${common}right:-1px;border-top:3px solid transparent;border-bottom:3px solid transparent;border-right:4px solid var(--accent);"></div>`;
}

// Plain end-cap for a non-nick edge (e.g. where a single guide's RTT
// simply stops) -- a quiet tick, not a marker.
function endCap(edge) {
  const common = "position:absolute;top:1px;bottom:1px;width:2px;border-radius:1px;background:var(--accent-line);";
  return edge === "left"
    ? `<div style="${common}left:0;"></div>`
    : `<div style="${common}right:0;"></div>`;
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
        overlapHtml = `<div style="position:absolute;left:${overlapLeft}%;width:${overlapWidth}%;top:0;bottom:0;border-radius:999px;background:var(--teal);opacity:0.85;"></div>`;
      }

      const markers =
        (nickEdge === "left" || nickEdge === "both" ? nickMarker("left") : endCap("left")) +
        (nickEdge === "right" || nickEdge === "both" ? nickMarker("right") : endCap("right"));

      return `
        <div style="display:flex;align-items:center;gap:10px;height:14px;">
          <span class="mono" style="width:${GUTTER - 10}px;flex-shrink:0;display:flex;align-items:center;justify-content:center;height:13px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:9px;font-weight:700;">${rowNumber(row.label)}</span>
          <div style="position:relative;flex:1;height:8px;">
            <div style="position:absolute;left:${left}%;width:${width}%;top:0;bottom:0;border-radius:999px;background:var(--accent-soft);border:1px solid var(--accent-line);box-shadow:0 1px 2px oklch(0% 0 0 / 0.05);"></div>
            <div style="position:absolute;left:${left}%;width:${width}%;top:0;bottom:0;">${markers}</div>
            ${overlapHtml}
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
    .map(
      (t) =>
        `<div style="position:absolute;top:0;bottom:0;${t.align === "right" ? "right:0;" : `left:${t.position}%;`}width:1px;background:var(--border-soft);"></div>`
    )
    .join("");

  return `
    <div class="panel" style="padding:16px 22px 12px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px 10px;margin-bottom:10px;">
        <div class="label">Coverage track</div>
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
                .map(
                  (t) =>
                    `<span class="mono" style="position:absolute;${tickLabelStyle(t)}font-size:10px;color:var(--text-faint);">${t.label}</span>`
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px 20px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-soft);">
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:14px;height:8px;border-radius:3px;background:var(--accent-soft);border:1px solid var(--accent-line);display:inline-block;"></span><span style="font-size:12px;color:var(--text-muted);">nick span</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:14px;height:8px;border-radius:3px;background:var(--teal);display:inline-block;"></span><span style="font-size:12px;color:var(--text-muted);">overlap / covered</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:5px solid var(--accent);display:inline-block;"></span><span style="font-size:12px;color:var(--text-muted);">nick site</span></div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:14px;height:8px;border-radius:3px;background:var(--accent-soft);opacity:0.5;display:inline-block;"></span><span style="font-size:12px;color:var(--text-muted);">target region</span></div>
      </div>
    </div>
  `;
}
