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
import { buildPegrnaCardHtml, buildPegrnaLegendHtml } from "../components/pegrnaCard.js";
import {
  slugify,
  pegrnaSideRow,
  PEGRNA_BASE_COLUMNS,
  downloadCsvButtonHtml,
  wireDownloadButton,
} from "../csvExport.js";

const CSV_COLUMNS = [
  { key: "set", label: "set" },
  ...PEGRNA_BASE_COLUMNS,
  { key: "new_bases", label: "new_bases" },
  { key: "cumulative_coverage_percent", label: "cumulative_coverage_percent" },
  { key: "overlap_length_nt", label: "overlap_length_nt" },
];

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
    const { html, download } = renderMain(record, pairs, state);
    mainContent.innerHTML = html;
    wireDownloadButton(mainContent, download);
  }

  recompute();
}

function renderMain(record, pairs, state) {
  if (state.targetEnd <= state.targetStart) {
    return { html: `<div class="label">Joint coverage map</div><div class="warning-box">The target interval must contain at least one base.</div>`, download: null };
  }

  if (!pairs.length) {
    return { html: `<div class="warning-box">No inward-facing forward/reverse guide pairs were found, so twinPE modes aren't available for this sequence. Try Single pegRNA instead.</div>`, download: null };
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
    return { html: `${caption}<div class="warning-box">No guide pair satisfies the selected RTT, overlap, and PBS constraints. Try widening the wiggle room or shortening the overlap.</div>`, download: null };
  }

  const selections = selectSynergisticDesigns({
    designs: pbsFeasibleDesigns,
    targetStart: state.targetStart,
    targetEnd: state.targetEnd,
    maximumDesigns: state.maxDesigns,
    forceMaximumDesigns: state.forceMax,
  });

  if (!selections.length) {
    return { html: `${caption}<div class="warning-box">No feasible pair contributes coverage to the target.</div>`, download: null };
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

  const csvRows = [];

  const cardsHtml = selections
    .map((selection, i) => {
      const assembled = assembledByDesign.get(selection.design);
      const setNumber = i + 1;
      const extra = {
        set: setNumber,
        new_bases: selection.marginalCoveredLength,
        cumulative_coverage_percent: selection.cumulativeCoveragePercent.toFixed(1),
        overlap_length_nt: selection.design.plan.overlapLength,
      };
      csvRows.push(pegrnaSideRow(extra, "Left", assembled.left));
      csvRows.push(pegrnaSideRow(extra, "Right", assembled.right));

      return buildPegrnaCardHtml({
        setNumber,
        headerRight: [
          { label: "New bases", value: String(selection.marginalCoveredLength) },
          { label: "Cumulative", value: `${selection.cumulativeCoveragePercent.toFixed(1)}%`, teal: true },
        ],
        sides: [
          {
            title: "Left pegRNA",
            stats: [
              { label: "Spacer", value: assembled.left.spacerSequence },
              { label: "PBS", value: assembled.left.pbsSequence },
            ],
            spacer: assembled.left.spacerSequence,
            rtt: assembled.left.rttSequence,
            pbs: assembled.left.pbsSequence,
            lengthNt: assembled.left.fullLength,
          },
          {
            title: "Right pegRNA",
            stats: [
              { label: "Spacer", value: assembled.right.spacerSequence },
              { label: "PBS", value: assembled.right.pbsSequence },
            ],
            spacer: assembled.right.spacerSequence,
            rtt: assembled.right.rttSequence,
            pbs: assembled.right.pbsSequence,
            lengthNt: assembled.right.fullLength,
          },
        ],
        footnote: `Overlap ${selection.design.plan.overlapLength} nt, all designs use a ${state.pbs}-nt PBS.`,
      });
    })
    .join("");

  const download = {
    filename: `errpresso_joint-coverage_${slugify(record.recordId)}.csv`,
    rows: csvRows,
    columns: CSV_COLUMNS,
  };

  const html = `
    <div class="label">Joint coverage map</div>
    ${mapHtml}

    <div class="stat-grid">
      <div class="stat-card"><div class="label">Paired designs</div><div class="stat-value">${selections.length}</div></div>
      <div class="stat-card"><div class="label">Target covered</div><div class="stat-value teal">${cumulativeCoverage.toFixed(1)}%</div></div>
      <div class="stat-card"><div class="label">Candidate pairs</div><div class="stat-value">${pbsFeasibleDesigns.length.toLocaleString()}</div></div>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
      <div class="label">Designs</div>
      <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
        ${buildPegrnaLegendHtml()}
        ${downloadCsvButtonHtml("download-csv-btn")}
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${cardsHtml}
    </div>
  `;

  return { html, download };
}
