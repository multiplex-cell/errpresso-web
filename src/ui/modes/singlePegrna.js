// Single pegRNA mode -- pick one guide (either strand) from the same
// spatial orientation map Manual pair uses, then save it as a set and
// keep picking. Saved sets accumulate below, each frozen at save time
// so later changes to PBS/RTT length don't retroactively change a set
// you already saved.

import { designSinglePegrna, guideEditInterval } from "../../core/singlePegrna.js";
import { stepperFieldHtml, attachStepperField } from "../controls.js";
import { buildSpacerMapHtml } from "../components/spacerMap.js";
import { buildPegrnaCardHtml, buildPegrnaLegendHtml } from "../components/pegrnaCard.js";
import {
  slugify,
  pegrnaSideRow,
  PEGRNA_BASE_COLUMNS,
  downloadCsvButtonHtml,
  wireDownloadButton,
} from "../csvExport.js";

const CSV_COLUMNS = [{ key: "set", label: "set" }, ...PEGRNA_BASE_COLUMNS];

function defaults(record) {
  return {
    pbs: 13,
    rttLength: Math.min(50, Math.max(record.length, 1)),
    selectedSide: null, // "left" ('+') | "right" ('-') | null
    selectedIndex: null,
    savedSets: [], // frozen pegRNA designs, in save order
  };
}

export function renderSinglePegrnaMode({ record, guides, state, sidebarExtra, mainContent, exonRange }) {
  Object.assign(state, { ...defaults(record), ...state });

  sidebarExtra.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="label">Design parameters</div>
      ${stepperFieldHtml({ id: "pbs", label: "PBS length", value: state.pbs })}
      ${stepperFieldHtml({ id: "rttLength", label: "RTT length", value: state.rttLength })}
    </div>
    <div class="caption">Click a triangle to pick a guide, then save it as a set and pick the next one.</div>
  `;

  attachStepperField(sidebarExtra, "pbs", { min: 1, max: 30 }, (v) => {
    state.pbs = v;
    recompute();
  });
  attachStepperField(sidebarExtra, "rttLength", { min: 1, max: Math.max(record.length, 1) }, (v) => {
    state.rttLength = v;
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
        const isSame = state.selectedSide === side && state.selectedIndex === index;
        state.selectedSide = isSame ? null : side;
        state.selectedIndex = isSame ? null : index;
        recompute();
      });
    });

    const clearBtn = mainContent.querySelector("#clear-pick-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        state.selectedSide = null;
        state.selectedIndex = null;
        recompute();
      });
    }

    const saveBtn = mainContent.querySelector("#save-set-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const { design } = resolveCurrentDesign(record, leftGuides, rightGuides, state);
        if (!design) return;
        state.savedSets.push(design);
        state.selectedSide = null;
        state.selectedIndex = null;
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

/** Resolve the design for whatever guide is currently picked, exactly
 * the same computation renderMain uses for display -- shared so "Save
 * as set" saves precisely what's on screen. */
function resolveCurrentDesign(record, leftGuides, rightGuides, state) {
  if (state.selectedSide === null) return { design: null, error: null };

  const guide = (state.selectedSide === "left" ? leftGuides : rightGuides)[state.selectedIndex];

  try {
    const design = designSinglePegrna(record.sequence, guide, state.rttLength, state.pbs);
    return { design, error: null };
  } catch (e) {
    return { design: null, error: e };
  }
}

function buildMapBlock(record, leftGuides, rightGuides, state, singleReach, exonRange) {
  const mapHtml = buildSpacerMapHtml({
    sequenceLength: record.length,
    leftGuides,
    rightGuides,
    selectedLeftIndex: state.selectedSide === "left" ? state.selectedIndex : null,
    selectedRightIndex: state.selectedSide === "right" ? state.selectedIndex : null,
    overlapRange: null,
    singleReach,
    exonRange,
  });

  return `
    <div class="label">Guide map</div>
    ${mapHtml}
    <button class="btn btn-ghost btn-sm" id="clear-pick-btn" style="width:fit-content;">Clear pick</button>
  `;
}

/** One pegRNA card, shared between the live (unsaved) preview and each
 * saved set below it. */
function buildSingleCardHtml({ setNumber, design, actions }) {
  const guide = design.guide;
  return buildPegrnaCardHtml({
    setNumber,
    headerRight: [{ label: "RTT", value: `${design.rttLength} nt` }],
    actions,
    sides: [
      {
        title: "pegRNA",
        badge: guide.strand,
        stats: [
          { label: "PAM", value: guide.pam },
          { label: "Nick", value: String(guide.nickPosition) },
        ],
        spacer: design.spacerSequence,
        rtt: design.rttSequence,
        pbs: design.pbsSequence,
        lengthNt: design.fullLength,
      },
    ],
  });
}

function buildSavedSetsBlock(record, state) {
  if (!state.savedSets.length) return { html: "", download: null };

  const cardsHtml = state.savedSets
    .map((design, i) =>
      buildSingleCardHtml({
        setNumber: i + 1,
        design,
        actions: `<button class="btn btn-ghost btn-sm" data-remove-set-index="${i}">Remove</button>`,
      })
    )
    .join("");

  const rows = state.savedSets.map((design, i) => pegrnaSideRow({ set: i + 1 }, "", design));

  const html = `
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
      filename: `errpresso_single-pegrna_${slugify(record.recordId)}.csv`,
      rows,
      columns: CSV_COLUMNS,
    },
  };
}

function renderMain(record, leftGuides, rightGuides, state, exonRange) {
  const savedBlock = buildSavedSetsBlock(record, state);

  if (state.selectedSide === null) {
    const mapBlock = buildMapBlock(record, leftGuides, rightGuides, state, null, exonRange);
    return {
      html: `${mapBlock}<div class="caption">Pick one triangle above or below the line to choose a guide.</div>${savedBlock.html}`,
      download: savedBlock.download,
    };
  }

  const { design, error } = resolveCurrentDesign(record, leftGuides, rightGuides, state);

  if (!design) {
    const mapBlock = buildMapBlock(record, leftGuides, rightGuides, state, null, exonRange);
    return {
      html: `${mapBlock}<div class="warning-box">${error.message}</div>${savedBlock.html}`,
      download: savedBlock.download,
    };
  }

  const [reachStart, reachEnd] = guideEditInterval(design.guide, design.rttLength);
  const mapBlock = buildMapBlock(record, leftGuides, rightGuides, state, { start: reachStart, end: reachEnd }, exonRange);

  const resultHtml = `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
      <div class="label">Single pegRNA design</div>
      ${buildPegrnaLegendHtml()}
    </div>
    ${design.rttLength > 80 ? '<div class="warning-box">The RTT is longer than 80 nt. Long RTT designs may require additional experimental validation.</div>' : ""}
    ${buildSingleCardHtml({
      setNumber: null,
      design,
      actions: `<button class="btn btn-primary btn-sm" id="save-set-btn">Save as set</button>`,
    })}
  `;

  return {
    html: `${mapBlock}${resultHtml}${savedBlock.html}`,
    download: savedBlock.download,
  };
}
