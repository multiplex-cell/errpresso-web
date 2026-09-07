// Card-list results renderer ("Option A" from the table/landing design
// review): one card per design/pair, every sequence wrapped in full
// (spacer/scaffold/RTT/PBS color-coded) instead of a wide scrollable
// table. Shared by all four design modes.

import { SCAFFOLD_SEQUENCE } from "../../core/pegrnaDesign.js";

/**
 * @param {{spacer: string, rtt: string, pbs: string}} parts
 */
function fullSequenceBlockHtml({ spacer, rtt, pbs }) {
  return `
    <div class="mono" style="font-size: 11.5px; line-height: 1.6; color: var(--text-muted); background: var(--bg); border-radius: 8px; padding: 10px 12px; word-break: break-all;">
      <span style="color: var(--text);">${spacer}</span><span style="color: var(--text-faint);">${SCAFFOLD_SEQUENCE}</span><span style="color: var(--teal);">${rtt}</span><span style="color: var(--text);">${pbs}</span>
    </div>
  `;
}

/**
 * @param {Object} opts
 * @param {string|number|null} opts.setNumber -- badge number, or null to hide it
 * @param {Array<{label: string, value: string, teal?: boolean}>} opts.headerRight
 * @param {Array<{
 *   title: string,
 *   badge?: string,
 *   stats: Array<{label: string, value: string}>,
 *   spacer: string, rtt: string, pbs: string, lengthNt: number,
 * }>} opts.sides -- one entry for a single pegRNA, two for a pair (Left/Right)
 * @param {string} [opts.footnote]
 */
export function buildPegrnaCardHtml({ setNumber, headerRight = [], sides, footnote }) {
  const sidesHtml = sides
    .map(
      (side, index) => `
        <div style="display: flex; flex-direction: column; gap: 8px; ${index < sides.length - 1 ? "padding-right: 20px; border-right: 1px solid var(--border-soft);" : ""}">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="label">${side.title}</span>
            ${side.badge ? `<span style="font-size: 10.5px; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 1px 8px;">${side.badge}</span>` : ""}
            <span class="mono" style="font-size: 11px; color: var(--text-faint); margin-left: auto;">${side.lengthNt} nt</span>
          </div>
          <div style="display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--text-muted);">
            ${side.stats
              .map((s) => `<span>${s.label} <span class="mono" style="color: var(--text);">${s.value}</span></span>`)
              .join("")}
          </div>
          ${fullSequenceBlockHtml(side)}
        </div>`
    )
    .join("");

  return `
    <div class="panel" style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 10px;">
          ${
            setNumber !== null && setNumber !== undefined
              ? `<span style="width: 26px; height: 26px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${setNumber}</span>`
              : ""
          }
          <span style="font-size: 14px; font-weight: 600;">${setNumber !== null && setNumber !== undefined ? `Set ${setNumber}` : "Design"}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 18px;">
          ${headerRight
            .map(
              (h) =>
                `<div style="font-size: 12.5px; color: var(--text-muted);">${h.label} <span style="color: ${h.teal ? "var(--teal)" : "var(--text)"}; font-weight: ${h.teal ? "700" : "600"};">${h.value}</span></div>`
            )
            .join("")}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(${sides.length}, 1fr); gap: 20px;">
        ${sidesHtml}
      </div>

      ${footnote ? `<div class="caption" style="border-top: 1px solid var(--border-soft); padding-top: 12px; margin-top: -2px;">${footnote}</div>` : ""}
    </div>
  `;
}

/** One shared legend for a list of pegRNA cards -- render it once, not per card. */
export function buildPegrnaLegendHtml() {
  return `
    <div style="display: flex; gap: 18px;">
      <div style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-faint);"><span style="width: 10px; height: 10px; border-radius: 3px; background: var(--text); display: inline-block;"></span>spacer</div>
      <div style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-faint);"><span style="width: 10px; height: 10px; border-radius: 3px; background: var(--text-faint); display: inline-block;"></span>scaffold</div>
      <div style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-faint);"><span style="width: 10px; height: 10px; border-radius: 3px; background: var(--teal); display: inline-block;"></span>RTT</div>
      <div style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-faint);"><span style="width: 10px; height: 10px; border-radius: 3px; background: var(--text); display: inline-block;"></span>PBS</div>
    </div>
  `;
}
