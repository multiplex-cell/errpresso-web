// Joint coverage set mode -- greedily selects a set of guide pairs that
// jointly maximize target coverage under RTT-size constraints.

import { rankPairsWithRttConstraints } from "../../core/constrainedDesign.js";
import { designPairedPegrnas } from "../../core/pegrnaDesign.js";
import { selectSynergisticDesigns } from "../../core/synergy.js";
import { SequenceParseError } from "../../core/sequenceIo.js";
import {
  stepperFieldHtml,
  attachStepperField,
  toggleHtml,
  attachToggle,
  singleSliderHtml,
  attachSingleSlider,
  dualSliderHtml,
  attachDualSlider,
} from "../controls.js";
import { buildCoverageMapHtml } from "../components/coverageMap.js";
import { truncateSeq } from "../domUtils.js";

function defaults(record) {
  return {
    targetStart: 0,
    targetEnd: record.length,
    preferredRtt: Math.min(50, record.length || 1),
    wiggle: Math.min(20, record.length || 1),
    rttOverlap: 30,
    pbs: 13,
    maxDesigns: 5,
    forceMax: false,
  };
}

export function renderJointCoverageMode({ record, pairs, state, sidebarExtra, mainContent }) {
  Object.assign(state, { ...defaults(record), ...state });

  const maxPairDistance = pairs.length
    ? Math.max(...pairs.map((p) => p.nickDistance))
    : 1;
  state.rttOverlap = Math.min(state.rttOverlap || 30, maxPairDistance);

  sidebarExtra.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="label">Target region</div>
      ${dualSliderHtml({
        id: "target",
        min: 0,
        max: record.length,
        valueStart: state.targetStart,
        valueEnd: state.targetEnd,
      })}
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="label">Design constraints</div>
      <div class="constraints-grid">
        ${stepperFieldHtml({ id: "preferredRtt", label: "Preferred RTT", value: state.preferredRtt })}
        ${stepperFieldHtml({ id: "wiggle", label: "Wiggle (± nt)", value: state.wiggle })}
        ${stepperFieldHtml({ id: "rttOverlap", label: "RTT overlap", value: state.rttOverlap })}
        ${stepperFieldHtml({ id: "pbs", label: "PBS", value: state.pbs })}
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;">
      ${singleSliderHtml({
        id: "maxDesigns",
        label: "Maximum paired designs",
        value: state.maxDesigns,
        min: 1,
        max: 10,
      })}
    </div>

    <div style="display:flex;flex-direction:column;gap:14px;">
      ${toggleHtml({
        id: "forceMax",
        label: "Always fill to the maximum pair count",
        checked: state.forceMax,
        help: "Adds backup pairs once coverage stops improving.",
      })}
    </div>
  `;

  attachDualSlider(sidebarExtra, "target", (start, end) => {
    state.targetStart = start;
    state.targetEnd = end;
    recompute();
  });
  attachStepperField(sidebarExtra, "preferredRtt", { min: 1, max: Math.max(record.length, 1) }, (v) => {
    state.preferredRtt = v;
    recompute();
  });
  attachStepperField(sidebarExtra, "wiggle", { min: 0, max: Math.max(record.length, 1) }, (v) => {
    state.wiggle = v;
    recompute();
  });
  attachStepperField(sidebarExtra, "rttOverlap", { min: 1, max: maxPairDistance }, (v) => {
    state.rttOverlap = v;
    recompute();
  });
  attachStepperField(sidebarExtra, "pbs", { min: 1, max: 30 }, (v) => {
    state.pbs = v;
    recompute();
  });
  attachSingleSlider(sidebarExtra, "maxDesigns", (v) => {
    state.maxDesigns = v;
    recompute();
  });
  attachToggle(sidebarExtra, "forceMax", (v) => {
    state.forceMax = v;
    recompute();
  });

  function recompute() {
    mainContent.innerHTML = renderMain(record, pairs, state);
  }

  recompute();
}

function renderMain(record, pairs, state) {
  if (state.targetEnd <= state.targetStart) {
    return `<div class="label">Joint coverage map</div><div class="warning-box">The target interval must contain at least one base.</div>`;
  }

  if (!pairs.length) {
    return `<div class="warning-box">No inward-facing forward/reverse guide pairs were found, so twinPE modes aren't available for this sequence. Try Single pegRNA instead.</div>`;
  }

  const minimumRttLength = Math.max(1, state.preferredRtt - state.wiggle);
  const maximumRttLength = state.preferredRtt + state.wiggle;

  let feasibleDesigns;
  try {
    feasibleDesigns = rankPairsWithRttConstraints({
      pairs,
      targetStart: state.targetStart,
      targetEnd: state.targetEnd,
      overlapLength: state.rttOverlap,
      minimumRttLength,
      preferredRttLength: state.preferredRtt,
      maximumRttLength,
      overlapBias: 0.0,
    });
  } catch {
    feasibleDesigns = [];
  }

  const assembledByDesign = new Map();
  const pbsFeasibleDesigns = [];

  for (const candidate of feasibleDesigns) {
    try {
      const assembled = designPairedPegrnas(
        record.sequence,
        candidate.pair,
        state.pbs,
        candidate.plan.overlapLength,
        candidate.plan.overlapStart
      );
      pbsFeasibleDesigns.push(candidate);
      assembledByDesign.set(candidate, assembled);
    } catch (error) {
      if (!(error instanceof SequenceParseError)) {
        // keep going -- infeasible for this pair only
      }
    }
  }

  const caption = `<div class="caption">Each RTT must fall within ${minimumRttLength}–${maximumRttLength} nt. The overlap is placed automatically to balance the two RTT lengths.</div>`;

  if (!pbsFeasibleDesigns.length) {
    return `${caption}<div class="warning-box">No guide pair satisfies the selected RTT, overlap, and PBS constraints. Try widening the wiggle room or shortening the overlap.</div>`;
  }

  const selections = selectSynergisticDesigns({
    designs: pbsFeasibleDesigns,
    targetStart: state.targetStart,
    targetEnd: state.targetEnd,
    maximumDesigns: state.maxDesigns,
    forceMaximumDesigns: state.forceMax,
  });

  if (!selections.length) {
    return `${caption}<div class="warning-box">No feasible pair contributes coverage to the target.</div>`;
  }

  const cumulativeCoverage = selections[selections.length - 1].cumulativeCoveragePercent;

  const rows = selections.map((selection, i) => ({
    label: `Pair ${i + 1}`,
    start: selection.design.pair.betweenNicksStart,
    end: selection.design.pair.betweenNicksEnd,
    overlapStart: selection.design.plan.overlapStart,
    overlapEnd: selection.design.plan.overlapEnd,
  }));

  const coveredIntervals = selections.map((s) => [
    Math.max(state.targetStart, s.design.pair.betweenNicksStart),
    Math.min(state.targetEnd, s.design.pair.betweenNicksEnd),
  ]);

  const mapHtml = buildCoverageMapHtml({
    sequenceLength: record.length,
    targetStart: state.targetStart,
    targetEnd: state.targetEnd,
    rows,
    coveredIntervals,
    coveragePercent: cumulativeCoverage,
  });

  const rowsHtml = selections
    .map((selection, i) => {
      const assembled = assembledByDesign.get(selection.design);
      return `
        <tr>
          <td>${i + 1}</td>
          <td class="seq">${truncateSeq(assembled.left.spacerSequence)}</td>
          <td class="seq">${truncateSeq(assembled.left.rttSequence)}</td>
          <td class="seq">${truncateSeq(assembled.left.pbsSequence)}</td>
          <td class="seq">${truncateSeq(assembled.right.spacerSequence)}</td>
          <td class="seq">${truncateSeq(assembled.right.rttSequence)}</td>
          <td class="seq">${truncateSeq(assembled.right.pbsSequence)}</td>
          <td class="num">${selection.marginalCoveredLength}</td>
          <td class="num cumulative">${selection.cumulativeCoveragePercent.toFixed(1)}%</td>
          <td class="num">${selection.design.plan.overlapLength}</td>
        </tr>`;
    })
    .join("");

  return `
    <div class="label">Joint coverage map</div>
    ${mapHtml}

    <div class="stat-grid">
      <div class="stat-card"><div class="label">Paired designs</div><div class="stat-value">${selections.length}</div></div>
      <div class="stat-card"><div class="label">Target covered</div><div class="stat-value teal">${cumulativeCoverage.toFixed(1)}%</div></div>
      <div class="stat-card"><div class="label">Candidate pairs</div><div class="stat-value">${pbsFeasibleDesigns.length.toLocaleString()}</div></div>
    </div>

    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Set</th><th>Left spacer</th><th>Left RTT</th><th>Left PBS</th>
          <th>Right spacer</th><th>Right RTT</th><th>Right PBS</th>
          <th class="num">New bases</th><th class="num">Cumulative</th><th class="num">Overlap</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <div class="caption">All displayed designs use a ${state.pbs}-nt PBS. Scroll horizontally to inspect complete sequences.</div>
  `;
}
