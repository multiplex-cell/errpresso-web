// Manual pair mode -- pick one '+' guide and one '-' guide from a
// spatial orientation map to build a pair by hand.

import { makePair } from "../../core/pairs.js";
import { designPairedPegrnas } from "../../core/pegrnaDesign.js";
import { stepperFieldHtml, attachStepperField, toggleHtml, attachToggle } from "../controls.js";
import { buildSpacerMapHtml } from "../components/spacerMap.js";
import { buildPegrnaCardHtml, buildPegrnaLegendHtml } from "../components/pegrnaCard.js";
import {
  slugify,
  pegrnaSideRow,
  PEGRNA_BASE_COLUMNS,
  downloadCsvButtonHtml,
  wireDownloadButton,
} from "../csvExport.js";

const CSV_COLUMNS = [...PEGRNA_BASE_COLUMNS, { key: "overlap_length_nt", label: "overlap_length_nt" }];

function defaults(record) {
  return {
    pbs: 13,
    overlapLength: Math.min(20, Math.max(record.length, 1)),
    centerOverlap: true,
    leftIndex: null,
    rightIndex: null,
    overlapStart: null,
  };
}

export function renderManualPairMode({ record, guides, state, sidebarExtra, mainContent }) {
  Object.assign(state, { ...defaults(record), ...state });

  sidebarExtra.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="label">Design parameters</div>
      ${stepperFieldHtml({ id: "pbs", label: "PBS length", value: state.pbs })}
      ${stepperFieldHtml({ id: "overlapLength", label: "RTT overlap length", value: state.overlapLength })}
      ${toggleHtml({ id: "centerOverlap", label: "Center overlap", checked: state.centerOverlap })}
    </div>
    <div class="caption">Click a triangle above the line ('+' strand) and one below ('-' strand) to form a pair. Click a picked triangle again to clear it.</div>
  `;

  attachStepperField(sidebarExtra, "pbs", { min: 1, max: 30 }, (v) => {
    state.pbs = v;
    recompute();
  });
  attachStepperField(sidebarExtra, "overlapLength", { min: 1, max: Math.max(record.length, 1) }, (v) => {
    state.overlapLength = v;
    state.overlapStart = null;
    recompute();
  });
  attachToggle(sidebarExtra, "centerOverlap", (v) => {
    state.centerOverlap = v;
    state.overlapStart = null;
    recompute();
  });

  const leftGuides = guides.filter((g) => g.strand === "+").sort((a, b) => a.nickPosition - b.nickPosition);
  const rightGuides = guides.filter((g) => g.strand === "-").sort((a, b) => b.nickPosition - a.nickPosition);

  function recompute() {
    const { html, download } = renderMain(record, leftGuides, rightGuides, state);
    mainContent.innerHTML = html;
    wireDownloadButton(mainContent, download);
    attachPickerListeners();
  }

  function attachPickerListeners() {
    mainContent.querySelectorAll("[data-picker-row]").forEach((row) => {
      row.addEventListener("click", () => {
        const side = row.dataset.side;
        const index = Number(row.dataset.index);
        const key = side === "left" ? "leftIndex" : "rightIndex";
        state[key] = state[key] === index ? null : index;
        recompute();
      });
    });

    const clearBtn = mainContent.querySelector("#clear-pick-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        state.leftIndex = null;
        state.rightIndex = null;
        state.overlapStart = null;
        recompute();
      });
    }

    const overlapStartField = mainContent.querySelector('[data-stepper="overlapStart"]');
    if (overlapStartField) {
      const pair = makePair(leftGuides[state.leftIndex], rightGuides[state.rightIndex]);
      attachStepperField(
        mainContent,
        "overlapStart",
        { min: pair.leftGuide.nickPosition, max: pair.rightGuide.nickPosition - state.overlapLength },
        (v) => {
          state.overlapStart = v;
          recompute();
        }
      );
    }
  }

  recompute();
}

function buildMapBlock(record, leftGuides, rightGuides, state, overlapRange) {
  const mapHtml = buildSpacerMapHtml({
    sequenceLength: record.length,
    leftGuides,
    rightGuides,
    selectedLeftIndex: state.leftIndex,
    selectedRightIndex: state.rightIndex,
    overlapRange,
  });

  return `
    <div class="label">Guide map</div>
    ${mapHtml}
    <button class="btn btn-ghost btn-sm" id="clear-pick-btn" style="width:fit-content;">Clear left / right pick</button>
  `;
}

function renderMain(record, leftGuides, rightGuides, state) {
  if (state.leftIndex === null || state.rightIndex === null) {
    return {
      html: `${buildMapBlock(record, leftGuides, rightGuides, state, null)}<div class="caption">Pick one triangle above the line and one below to form a pair.</div>`,
      download: null,
    };
  }

  const left = leftGuides[state.leftIndex];
  const right = rightGuides[state.rightIndex];

  if (left.nickPosition >= right.nickPosition) {
    return {
      html: `${buildMapBlock(record, leftGuides, rightGuides, state, null)}<div class="warning-box">The picked '+' guide isn't to the left of the picked '-' guide, so they can't form an inward-facing pair.</div>`,
      download: null,
    };
  }

  const pair = makePair(left, right);
  const nickDistance = pair.nickDistance;

  let overlapStartField = "";
  let overlapStart = null;

  if (!state.centerOverlap) {
    if (state.overlapLength <= nickDistance) {
      const centeredStart = pair.leftGuide.nickPosition + Math.floor((nickDistance - state.overlapLength) / 2);
      overlapStart = state.overlapStart ?? centeredStart;
      overlapStartField = `
        <div style="max-width:280px;">
          ${stepperFieldHtml({ id: "overlapStart", label: "Overlap start coordinate", value: overlapStart })}
        </div>`;
    } else {
      overlapStartField = `<div class="caption">RTT overlap length exceeds this pair's nick distance; reduce it above to set an exact overlap start.</div>`;
    }
  }

  let design;
  let error = null;
  try {
    design = designPairedPegrnas(
      record.sequence,
      pair,
      state.pbs,
      state.overlapLength,
      state.centerOverlap ? null : overlapStart
    );
  } catch (e) {
    error = e;
  }

  if (!design) {
    return {
      html: `${buildMapBlock(record, leftGuides, rightGuides, state, null)}${overlapStartField}<div class="warning-box">${error.message}</div>`,
      download: null,
    };
  }

  const mapBlock = buildMapBlock(record, leftGuides, rightGuides, state, {
    start: design.plan.overlapStart,
    end: design.plan.overlapEnd,
  });

  const extra = { overlap_length_nt: design.plan.overlapLength };
  const download = {
    filename: `errpresso_manual-pair_${slugify(record.recordId)}.csv`,
    rows: [pegrnaSideRow(extra, "Left", design.left), pegrnaSideRow(extra, "Right", design.right)],
    columns: CSV_COLUMNS,
  };

  const resultHtml = `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
      <div class="label">Paired pegRNA design</div>
      <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
        ${buildPegrnaLegendHtml()}
        ${downloadCsvButtonHtml("download-csv-btn")}
      </div>
    </div>
    ${design.plan.overlapLength === nickDistance ? '<div class="warning-box">The overlap covers the entire interval between the nick sites.</div>' : ""}
    ${Math.max(design.left.rttLength, design.right.rttLength) > 80 ? '<div class="warning-box">At least one RTT is longer than 80 nt. Long RTT designs may require additional experimental validation.</div>' : ""}
    ${buildPegrnaCardHtml({
      setNumber: null,
      headerRight: [{ label: "Overlap", value: `${design.plan.overlapLength} nt` }],
      sides: [
        {
          title: "Left pegRNA",
          stats: [
            { label: "PAM", value: design.left.guide.pam },
            { label: "Nick", value: String(design.left.guide.nickPosition) },
          ],
          spacer: design.left.spacerSequence,
          rtt: design.left.rttSequence,
          pbs: design.left.pbsSequence,
          lengthNt: design.left.fullLength,
        },
        {
          title: "Right pegRNA",
          stats: [
            { label: "PAM", value: design.right.guide.pam },
            { label: "Nick", value: String(design.right.guide.nickPosition) },
          ],
          spacer: design.right.spacerSequence,
          rtt: design.right.rttSequence,
          pbs: design.right.pbsSequence,
          lengthNt: design.right.fullLength,
        },
      ],
      footnote: `Nick interval ${pair.leftGuide.nickPosition}–${pair.rightGuide.nickPosition} · overlap ${design.plan.overlapStart}–${design.plan.overlapEnd}`,
    })}
  `;

  return {
    html: `${mapBlock}${overlapStartField}${resultHtml}`,
    download,
  };
}
