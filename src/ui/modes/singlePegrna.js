// Single pegRNA mode -- greedily selects standalone (non-paired) guides
// that jointly maximize target coverage under RTT-size constraints.

import { rankSingleGuidesWithRttConstraints, designSinglePegrna } from "../../core/singlePegrna.js";
import { selectSynergisticSingleDesigns } from "../../core/singleSynergy.js";
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
import { buildPegrnaCardHtml, buildPegrnaLegendHtml } from "../components/pegrnaCard.js";

function defaults(record) {
  return {
    targetStart: 0,
    targetEnd: record.length,
    preferredRtt: Math.min(50, record.length || 1),
    wiggle: Math.min(20, record.length || 1),
    pbs: 13,
    maxDesigns: 5,
    forceMax: false,
  };
}

export function renderSinglePegrnaMode({ record, guides, state, sidebarExtra, mainContent }) {
  Object.assign(state, { ...defaults(record), ...state });

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
      </div>
      ${stepperFieldHtml({ id: "pbs", label: "PBS", value: state.pbs })}
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;">
      ${singleSliderHtml({
        id: "maxDesigns",
        label: "Maximum guides",
        value: state.maxDesigns,
        min: 1,
        max: 20,
      })}
    </div>

    <div style="display:flex;flex-direction:column;gap:14px;">
      ${toggleHtml({
        id: "forceMax",
        label: "Always fill to the maximum guide count",
        checked: state.forceMax,
        help: "Adds backup guides once coverage stops improving.",
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
    mainContent.innerHTML = renderMain(record, guides, state);
  }

  recompute();
}

function renderMain(record, guides, state) {
  if (state.targetEnd <= state.targetStart) {
    return `<div class="label">Joint coverage map</div><div class="warning-box">The target interval must contain at least one base.</div>`;
  }

  const minimumRttLength = Math.max(1, state.preferredRtt - state.wiggle);
  const maximumRttLength = state.preferredRtt + state.wiggle;

  const feasibleDesigns = rankSingleGuidesWithRttConstraints({
    guides,
    targetStart: state.targetStart,
    targetEnd: state.targetEnd,
    referenceLength: record.length,
    minimumRttLength,
    preferredRttLength: state.preferredRtt,
    maximumRttLength,
  });

  const assembledByDesign = new Map();
  const pbsFeasibleDesigns = [];

  for (const candidate of feasibleDesigns) {
    try {
      const assembled = designSinglePegrna(record.sequence, candidate.guide, candidate.rttLength, state.pbs);
      pbsFeasibleDesigns.push(candidate);
      assembledByDesign.set(candidate, assembled);
    } catch (error) {
      if (!(error instanceof SequenceParseError)) {
        // infeasible for this guide only
      }
    }
  }

  const caption = `<div class="caption">Each RTT must fall within ${minimumRttLength}–${maximumRttLength} nt, shrinking automatically for guides too close to either end of the sequence to reach the preferred length.</div>`;

  if (!pbsFeasibleDesigns.length) {
    return `${caption}<div class="warning-box">No guide satisfies the selected RTT and PBS constraints. Try widening the wiggle room or shortening the PBS.</div>`;
  }

  const selections = selectSynergisticSingleDesigns({
    designs: pbsFeasibleDesigns,
    targetStart: state.targetStart,
    targetEnd: state.targetEnd,
    maximumDesigns: state.maxDesigns,
    forceMaximumDesigns: state.forceMax,
  });

  if (!selections.length) {
    return `${caption}<div class="warning-box">No feasible guide contributes coverage to the target.</div>`;
  }

  const cumulativeCoverage = selections[selections.length - 1].cumulativeCoveragePercent;

  const rows = selections.map((selection, i) => ({
    label: `Guide ${i + 1}`,
    start: selection.design.coverage.guideIntervalStart,
    end: selection.design.coverage.guideIntervalEnd,
    // Only one edge is a true nick site -- the '+' strand's guide nicks
    // at its left edge and synthesizes rightward; '-' is the mirror.
    nickEdge: selection.design.guide.strand === "+" ? "left" : "right",
  }));

  const coveredIntervals = selections.map((s) => [
    s.design.coverage.coveredStart,
    s.design.coverage.coveredEnd,
  ]);

  const mapHtml = buildCoverageMapHtml({
    sequenceLength: record.length,
    targetStart: state.targetStart,
    targetEnd: state.targetEnd,
    rows,
    coveredIntervals,
    coveragePercent: cumulativeCoverage,
  });

  const cardsHtml = selections
    .map((selection, i) => {
      const assembled = assembledByDesign.get(selection.design);
      const guide = selection.design.guide;
      return buildPegrnaCardHtml({
        setNumber: i + 1,
        headerRight: [
          { label: "New bases", value: String(selection.marginalCoveredLength) },
          { label: "Cumulative", value: `${selection.cumulativeCoveragePercent.toFixed(1)}%`, teal: true },
        ],
        sides: [
          {
            title: "pegRNA",
            badge: guide.strand,
            stats: [
              { label: "Spacer", value: assembled.spacerSequence },
              { label: "PAM", value: guide.pam },
              { label: "Nick", value: String(guide.nickPosition) },
              { label: "PBS", value: assembled.pbsSequence },
            ],
            spacer: assembled.spacerSequence,
            rtt: assembled.rttSequence,
            pbs: assembled.pbsSequence,
            lengthNt: assembled.fullLength,
          },
        ],
      });
    })
    .join("");

  return `
    <div class="label">Joint coverage map</div>
    ${mapHtml}

    <div class="stat-grid">
      <div class="stat-card"><div class="label">Guides selected</div><div class="stat-value">${selections.length}</div></div>
      <div class="stat-card"><div class="label">Target covered</div><div class="stat-value teal">${cumulativeCoverage.toFixed(1)}%</div></div>
      <div class="stat-card"><div class="label">Candidate guides</div><div class="stat-value">${pbsFeasibleDesigns.length.toLocaleString()}</div></div>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div class="label">Designs</div>
      ${buildPegrnaLegendHtml()}
    </div>

    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${cardsHtml}
    </div>

    <div class="caption">All displayed designs use a ${state.pbs}-nt PBS.</div>
  `;
}
