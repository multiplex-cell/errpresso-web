// Manual pair mode -- pick one '+' guide and one '-' guide from a
// spatial orientation map to build a pair by hand, then save it as a
// set and keep picking. Saved sets accumulate below, each one frozen
// at save time so later changes to PBS/overlap don't retroactively
// change a set you already saved.

import { makePair } from "../../core/pairs.js";
import { designPairedPegrnas } from "../../core/pegrnaDesign.js";
import { intervalsLength } from "../../core/intervals.js";
import { stepperFieldHtml, attachStepperField, toggleHtml, attachToggle } from "../controls.js";
import { buildSpacerMapHtml } from "../components/spacerMap.js";
import { buildCoverageMapHtml } from "../components/coverageMap.js";
import { buildPegrnaCardHtml, buildPegrnaLegendHtml } from "../components/pegrnaCard.js";
import {
  slugify,
  pegrnaSideRow,
  PEGRNA_BASE_COLUMNS,
  downloadCsvButtonHtml,
  wireDownloadButton,
} from "../csvExport.js";

const CSV_COLUMNS = [{ key: "set", label: "set" }, ...PEGRNA_BASE_COLUMNS, { key: "overlap_length_nt", label: "overlap_length_nt" }];

function defaults(record) {
  return {
    pbs: 13,
    overlapLength: Math.min(20, Math.max(record.length, 1)),
    centerOverlap: true,
    leftIndex: null,
    rightIndex: null,
    overlapStart: null,
    savedSets: [], // frozen {pair, design} snapshots, in save order
  };
}

export function renderManualPairMode({ record, guides, state, sidebarExtra, mainContent, exonRange }) {
  Object.assign(state, { ...defaults(record), ...state });

  sidebarExtra.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="label">Design parameters</div>
      ${stepperFieldHtml({ id: "pbs", label: "PBS length", value: state.pbs })}
      ${stepperFieldHtml({ id: "overlapLength", label: "RTT overlap length", value: state.overlapLength })}
      ${toggleHtml({ id: "centerOverlap", label: "Center overlap", checked: state.centerOverlap })}
    </div>
    <div class="caption">Click a triangle above the line ('+' strand) and one below ('-' strand) to form a pair, then save it as a set and pick the next one.</div>
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
    const { html, download } = renderMain(record, leftGuides, rightGuides, state, exonRange);
    mainContent.innerHTML = html;
    wireDownloadButton(mainContent, download);
    attachListeners();
  }

  function attachListeners() {
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

    const saveBtn = mainContent.querySelector("#save-set-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const { pair, design } = resolveCurrentDesign(record, leftGuides, rightGuides, state);
        if (!design) return;
        state.savedSets.push({ pair, design });
        state.leftIndex = null;
        state.rightIndex = null;
        state.overlapStart = null;
        recompute();
      });
    }

    mainContent.querySelectorAll("[data-remove-set-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.savedSets.splice(Number(btn.dataset.removeSetIndex), 1);
        recompute();
      });
    });
  }

  recompute();
}

/** Resolve the pair + assembled design for whatever is currently picked,
 * exactly the same computation renderMain uses for display -- shared so
 * "Save as set" saves precisely what's on screen. */
function resolveCurrentDesign(record, leftGuides, rightGuides, state) {
  if (state.leftIndex === null || state.rightIndex === null) return { pair: null, design: null, error: null };

  const left = leftGuides[state.leftIndex];
  const right = rightGuides[state.rightIndex];
  if (left.nickPosition >= right.nickPosition) return { pair: null, design: null, error: null };

  const pair = makePair(left, right);
  const nickDistance = pair.nickDistance;

  let overlapStart = null;
  if (!state.centerOverlap && state.overlapLength <= nickDistance) {
    const centeredStart = pair.leftGuide.nickPosition + Math.floor((nickDistance - state.overlapLength) / 2);
    overlapStart = state.overlapStart ?? centeredStart;
  }

  try {
    const design = designPairedPegrnas(
      record.sequence,
      pair,
      state.pbs,
      state.overlapLength,
      state.centerOverlap ? null : overlapStart
    );
    return { pair, design, error: null };
  } catch (e) {
    return { pair, design: null, error: e };
  }
}

function buildMapBlock(record, leftGuides, rightGuides, state, overlapRange, exonRange) {
  const mapHtml = buildSpacerMapHtml({
    sequenceLength: record.length,
    leftGuides,
    rightGuides,
    selectedLeftIndex: state.leftIndex,
    selectedRightIndex: state.rightIndex,
    overlapRange,
    exonRange,
  });

  return `
    <div class="label">Guide map</div>
    ${mapHtml}
    <button class="btn btn-ghost btn-sm" id="clear-pick-btn" style="width:fit-content;">Clear left / right pick</button>
  `;
}

/** One pegRNA-pair card, shared between the live (unsaved) preview and
 * each saved set below it. */
function buildPairCardHtml({ setNumber, pair, design, actions }) {
  return buildPegrnaCardHtml({
    setNumber,
    headerRight: [{ label: "Overlap", value: `${design.plan.overlapLength} nt` }],
    actions,
    sides: [
      {
        title: "Left pegRNA",
        stats: [
          { label: "PAM", value: design.left.guide.pam },
          { label: "Nick", value: String(design.left.guide.nickPosition) },
          { label: "RTT", value: `${design.left.rttLength} nt` },
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
          { label: "RTT", value: `${design.right.rttLength} nt` },
        ],
        spacer: design.right.spacerSequence,
        rtt: design.right.rttSequence,
        pbs: design.right.pbsSequence,
        lengthNt: design.right.fullLength,
      },
    ],
    footnote: `Nick interval ${pair.leftGuide.nickPosition}–${pair.rightGuide.nickPosition} · overlap ${design.plan.overlapStart}–${design.plan.overlapEnd}`,
  });
}

function buildSavedSetsBlock(record, state, exonRange) {
  if (!state.savedSets.length) return { html: "", download: null };

  const cardsHtml = state.savedSets
    .map(({ pair, design }, i) =>
      buildPairCardHtml({
        setNumber: i + 1,
        pair,
        design,
        actions: `<button class="btn btn-ghost btn-sm" data-remove-set-index="${i}">Remove</button>`,
      })
    )
    .join("");

  const rows = state.savedSets.flatMap(({ design }, i) => {
    const extra = { set: i + 1, overlap_length_nt: design.plan.overlapLength };
    return [pegrnaSideRow(extra, "Left", design.left), pegrnaSideRow(extra, "Right", design.right)];
  });

  // What's actually been picked so far, at a glance -- same coverage
  // track the algorithmic modes use, just fed from the sets saved here
  // by hand instead of a ranking pass.
  const coverageRows = state.savedSets.map(({ pair, design }, i) => ({
    label: `Set ${i + 1}`,
    start: pair.leftGuide.nickPosition,
    end: pair.rightGuide.nickPosition,
    overlapStart: design.plan.overlapStart,
    overlapEnd: design.plan.overlapEnd,
  }));
  const coveredIntervals = state.savedSets.map(({ pair }) => [pair.leftGuide.nickPosition, pair.rightGuide.nickPosition]);
  const coveragePercent = record.length > 0 ? (intervalsLength(coveredIntervals) / record.length) * 100.0 : 0.0;

  const coverageMapHtml = buildCoverageMapHtml({
    sequenceLength: record.length,
    targetStart: 0,
    targetEnd: record.length,
    rows: coverageRows,
    coveredIntervals,
    coveragePercent,
    exonRange,
  });

  const html = `
    <div class="label">Saved sets coverage</div>
    ${coverageMapHtml}

    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
      <div class="label">Saved sets · ${state.savedSets.length}</div>
      <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
        ${buildPegrnaLegendHtml()}
        ${downloadCsvButtonHtml("download-csv-btn")}
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${cardsHtml}
    </div>
  `;

  return {
    html,
    download: {
      filename: `errpresso_manual-pair_${slugify(record.recordId)}.csv`,
      rows,
      columns: CSV_COLUMNS,
    },
  };
}

function renderMain(record, leftGuides, rightGuides, state, exonRange) {
  const savedBlock = buildSavedSetsBlock(record, state, exonRange);

  if (state.leftIndex === null || state.rightIndex === null) {
    return {
      html: `${buildMapBlock(record, leftGuides, rightGuides, state, null, exonRange)}<div class="caption">Pick one triangle above the line and one below to form a pair.</div>${savedBlock.html}`,
      download: savedBlock.download,
    };
  }

  const left = leftGuides[state.leftIndex];
  const right = rightGuides[state.rightIndex];

  if (left.nickPosition >= right.nickPosition) {
    return {
      html: `${buildMapBlock(record, leftGuides, rightGuides, state, null, exonRange)}<div class="warning-box">The picked '+' guide isn't to the left of the picked '-' guide, so they can't form an inward-facing pair.</div>${savedBlock.html}`,
      download: savedBlock.download,
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
      html: `${buildMapBlock(record, leftGuides, rightGuides, state, null, exonRange)}${overlapStartField}<div class="warning-box">${error.message}</div>${savedBlock.html}`,
      download: savedBlock.download,
    };
  }

  const mapBlock = buildMapBlock(
    record,
    leftGuides,
    rightGuides,
    state,
    { start: design.plan.overlapStart, end: design.plan.overlapEnd },
    exonRange
  );

  const resultHtml = `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
      <div class="label">Paired pegRNA design</div>
      ${buildPegrnaLegendHtml()}
    </div>
    ${design.plan.overlapLength === nickDistance ? '<div class="warning-box">The overlap covers the entire interval between the nick sites.</div>' : ""}
    ${Math.max(design.left.rttLength, design.right.rttLength) > 80 ? '<div class="warning-box">At least one RTT is longer than 80 nt. Long RTT designs may require additional experimental validation.</div>' : ""}
    ${buildPairCardHtml({
      setNumber: null,
      pair,
      design,
      actions: `<button class="btn btn-primary btn-sm" id="save-set-btn">Save as set</button>`,
    })}
  `;

  return {
    html: `${mapBlock}${overlapStartField}${resultHtml}${savedBlock.html}`,
    download: savedBlock.download,
  };
}
