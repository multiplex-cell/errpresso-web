// Fixed guide, variable RTT mode -- one fixed guide, opposite-strand
// partners found over increasing distances, spread across the range.

import { findPairsForFixedGuide, selectSpanningPairs } from "../../core/fixedAnchor.js";
import { designPairedPegrnas } from "../../core/pegrnaDesign.js";
import { SequenceParseError } from "../../core/sequenceIo.js";
import { stepperFieldHtml, attachStepperField, singleSliderHtml, attachSingleSlider } from "../controls.js";
import { buildCoverageMapHtml } from "../components/coverageMap.js";
import { buildPegrnaCardHtml, buildPegrnaLegendHtml } from "../components/pegrnaCard.js";
import { escapeHtml } from "../domUtils.js";
import {
  slugify,
  pegrnaSideRow,
  PEGRNA_BASE_COLUMNS,
  downloadCsvButtonHtml,
  wireDownloadButton,
} from "../csvExport.js";

const CSV_COLUMNS = [
  { key: "set", label: "set" },
  { key: "fixed", label: "fixed" },
  ...PEGRNA_BASE_COLUMNS,
  { key: "nick_distance", label: "nick_distance" },
  { key: "overlap_length_nt", label: "overlap_length_nt" },
];

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
    const { html, download } = renderMain(record, guides, state);
    mainContent.innerHTML = html;
    wireDownloadButton(mainContent, download);
  }

  recompute();
}

function renderMain(record, guides, state) {
  const fixedGuide = guides[state.fixedGuideIndex];
  const compatiblePairs = findPairsForFixedGuide(guides, fixedGuide);

  if (!compatiblePairs.length) {
    return { html: `<div class="warning-box">No inward-facing opposite-strand partner was found.</div>`, download: null };
  }

  const overlapCompatible = compatiblePairs.filter((p) => p.nickDistance >= state.overlapLength);

  if (!overlapCompatible.length) {
    return { html: `<div class="warning-box">No partner pair is long enough for this overlap.</div>`, download: null };
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
    return { html: `<div class="warning-box">No selected pair supports the requested PBS and overlap.</div>`, download: null };
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

  const csvRows = [];

  const cardsHtml = designs
    .map((d, i) => {
      const fixedSide = d.left.guide === fixedGuide ? "Left" : "Right";
      const setNumber = i + 1;
      const extra = {
        set: setNumber,
        nick_distance: d.pair.nickDistance,
        overlap_length_nt: d.plan.overlapLength,
      };
      csvRows.push(pegrnaSideRow({ ...extra, fixed: fixedSide === "Left" ? "yes" : "no" }, "Left", d.left));
      csvRows.push(pegrnaSideRow({ ...extra, fixed: fixedSide === "Right" ? "yes" : "no" }, "Right", d.right));

      return buildPegrnaCardHtml({
        setNumber,
        headerRight: [
          { label: "Nick distance", value: String(d.pair.nickDistance) },
          { label: "Overlap", value: `${d.plan.overlapLength} nt` },
        ],
        sides: [
          {
            title: "Left pegRNA",
            badge: fixedSide === "Left" ? "Fixed" : undefined,
            stats: [
              { label: "Spacer", value: d.left.spacerSequence },
              { label: "PBS", value: d.left.pbsSequence },
            ],
            spacer: d.left.spacerSequence,
            rtt: d.left.rttSequence,
            pbs: d.left.pbsSequence,
            lengthNt: d.left.fullLength,
          },
          {
            title: "Right pegRNA",
            badge: fixedSide === "Right" ? "Fixed" : undefined,
            stats: [
              { label: "Spacer", value: d.right.spacerSequence },
              { label: "PBS", value: d.right.pbsSequence },
            ],
            spacer: d.right.spacerSequence,
            rtt: d.right.rttSequence,
            pbs: d.right.pbsSequence,
            lengthNt: d.right.fullLength,
          },
        ],
      });
    })
    .join("");

  const download = {
    filename: `errpresso_fixed-guide_${slugify(record.recordId)}.csv`,
    rows: csvRows,
    columns: CSV_COLUMNS,
  };

  const html = `
    <div class="label">Variable-reach map</div>
    ${mapHtml}
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Partner pairs shown</div><div class="stat-value">${designs.length}</div></div>
      <div class="stat-card"><div class="label">Sequence covered</div><div class="stat-value teal">${coveragePercent.toFixed(1)}%</div></div>
      <div class="stat-card"><div class="label">Compatible partners</div><div class="stat-value">${compatiblePairs.length.toLocaleString()}</div></div>
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

    <div class="caption">The preferred RTT-size window is ignored in this mode; every design uses exactly the chosen overlap length.</div>
  `;

  return { html, download };
}
