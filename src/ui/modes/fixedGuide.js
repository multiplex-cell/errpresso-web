// Fixed guide, variable RTT mode -- one fixed guide, opposite-strand
// partners found over increasing distances, spread across the range.

import { findPairsForFixedGuide, selectSpanningPairs } from "../../core/fixedAnchor.js";
import { designPairedPegrnas } from "../../core/pegrnaDesign.js";
import { SequenceParseError } from "../../core/sequenceIo.js";
import { stepperFieldHtml, attachStepperField, singleSliderHtml, attachSingleSlider } from "../controls.js";
import { buildCoverageMapHtml } from "../components/coverageMap.js";
import { escapeHtml } from "../domUtils.js";

function defaults() {
  return { fixedGuideIndex: 0, pairCount: 5, overlapLength: 30, pbs: 13 };
}

function guideLabel(guide) {
  const arrow = guide.strand === "+" ? "→" : "←";
  return `${arrow} ${guide.spacer} | strand ${guide.strand} | nick ${guide.nickPosition}`;
}

export function renderFixedGuideMode({ record, guides, state, sidebarExtra, mainContent }) {
  Object.assign(state, { ...defaults(), ...state });
  state.fixedGuideIndex = Math.min(state.fixedGuideIndex, guides.length - 1);

  sidebarExtra.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="label">Fixed guide</div>
      <select class="field" id="fixed-guide-select" style="width:100%;font-family:'IBM Plex Mono',monospace;font-size:12.5px;">
        ${guides
          .map((g, i) => `<option value="${i}" ${i === state.fixedGuideIndex ? "selected" : ""}>${escapeHtml(guideLabel(g))}</option>`)
          .join("")}
      </select>
    </div>

    <div style="display:flex;flex-direction:column;gap:14px;" id="partner-search-controls"></div>
  `;

  sidebarExtra.querySelector("#fixed-guide-select").addEventListener("change", (e) => {
    state.fixedGuideIndex = Number(e.target.value);
    renderPartnerControls();
    recompute();
  });

  function renderPartnerControls() {
    const fixedGuide = guides[state.fixedGuideIndex];
    const compatiblePairs = findPairsForFixedGuide(guides, fixedGuide);
    const controls = sidebarExtra.querySelector("#partner-search-controls");

    if (!compatiblePairs.length) {
      controls.innerHTML = "";
      return;
    }

    const maxDistance = Math.max(...compatiblePairs.map((p) => p.nickDistance));
    state.pairCount = Math.min(state.pairCount, Math.min(20, compatiblePairs.length));
    state.overlapLength = Math.min(state.overlapLength, maxDistance);

    controls.innerHTML = `
      <div class="label">Partner search</div>
      ${singleSliderHtml({
        id: "pairCount",
        label: "Number of partner pairs",
        value: state.pairCount,
        min: 1,
        max: Math.min(20, compatiblePairs.length),
      })}
      ${stepperFieldHtml({ id: "overlapLength", label: "RTT overlap length", value: state.overlapLength })}
      ${stepperFieldHtml({ id: "pbs", label: "PBS length", value: state.pbs })}
    `;

    attachSingleSlider(controls, "pairCount", (v) => {
      state.pairCount = v;
      recompute();
    });
    attachStepperField(controls, "overlapLength", { min: 1, max: maxDistance }, (v) => {
      state.overlapLength = v;
      recompute();
    });
    attachStepperField(controls, "pbs", { min: 1, max: 30 }, (v) => {
      state.pbs = v;
      recompute();
    });
  }

  renderPartnerControls();

  function recompute() {
    mainContent.innerHTML = renderMain(record, guides, state);
  }

  recompute();
}

function renderMain(record, guides, state) {
  const fixedGuide = guides[state.fixedGuideIndex];
  const compatiblePairs = findPairsForFixedGuide(guides, fixedGuide);

  if (!compatiblePairs.length) {
    return `<div class="warning-box">No inward-facing opposite-strand partner was found.</div>`;
  }

  const overlapCompatible = compatiblePairs.filter((p) => p.nickDistance >= state.overlapLength);

  if (!overlapCompatible.length) {
    return `<div class="warning-box">No partner pair is long enough for this overlap.</div>`;
  }

  const selectedPairs = selectSpanningPairs(overlapCompatible, state.pairCount);

  const designs = [];
  for (const pair of selectedPairs) {
    try {
      designs.push(designPairedPegrnas(record.sequence, pair, state.pbs, state.overlapLength));
    } catch (error) {
      if (!(error instanceof SequenceParseError)) {
        // skip infeasible pair
      }
    }
  }

  if (!designs.length) {
    return `<div class="warning-box">No selected pair supports the requested PBS and overlap.</div>`;
  }

  const rows = designs.map((d, i) => ({
    label: `Pair ${i + 1}`,
    start: d.pair.betweenNicksStart,
    end: d.pair.betweenNicksEnd,
    overlapStart: d.plan.overlapStart,
    overlapEnd: d.plan.overlapEnd,
  }));

  const coveredIntervals = designs.map((d) => [d.pair.betweenNicksStart, d.pair.betweenNicksEnd]);
  const mergedLength = coveredIntervals
    .slice()
    .sort((a, b) => a[0] - b[0])
    .reduce(
      (acc, [s, e]) => {
        if (s > acc.end) return { total: acc.total + (e - s), end: e };
        return { total: acc.total + Math.max(0, e - acc.end), end: Math.max(acc.end, e) };
      },
      { total: 0, end: -Infinity }
    ).total;
  const coveragePercent = record.length > 0 ? (mergedLength / record.length) * 100.0 : 0.0;

  const mapHtml = buildCoverageMapHtml({
    sequenceLength: record.length,
    targetStart: 0,
    targetEnd: record.length,
    rows,
    coveredIntervals,
    coveragePercent,
  });

  const rowsHtml = designs
    .map((d, i) => {
      const fixedSide = d.left.guide === fixedGuide ? "Left" : "Right";
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${fixedSide}</td>
          <td class="seq">${d.left.spacerSequence}</td>
          <td class="seq">${d.left.rttSequence}</td>
          <td class="seq">${d.left.pbsSequence}</td>
          <td class="seq">${d.left.fullSequence}</td>
          <td class="seq">${d.right.spacerSequence}</td>
          <td class="seq">${d.right.rttSequence}</td>
          <td class="seq">${d.right.pbsSequence}</td>
          <td class="seq">${d.right.fullSequence}</td>
          <td class="num">${d.pair.nickDistance}</td>
          <td class="num">${d.plan.overlapLength}</td>
        </tr>`;
    })
    .join("");

  return `
    <div class="label">Variable-reach map</div>
    ${mapHtml}
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Partner pairs shown</div><div class="stat-value">${designs.length}</div></div>
      <div class="stat-card"><div class="label">Sequence covered</div><div class="stat-value teal">${coveragePercent.toFixed(1)}%</div></div>
      <div class="stat-card"><div class="label">Compatible partners</div><div class="stat-value">${compatiblePairs.length.toLocaleString()}</div></div>
    </div>
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Order</th><th>Fixed side</th><th>Left spacer</th><th>Left RTT</th><th>Left PBS</th><th>Left pegRNA</th>
          <th>Right spacer</th><th>Right RTT</th><th>Right PBS</th><th>Right pegRNA</th><th class="num">Nick distance</th><th class="num">Overlap</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="caption">The preferred RTT-size window is ignored in this mode; every design uses exactly the chosen overlap length.</div>
  `;
}
