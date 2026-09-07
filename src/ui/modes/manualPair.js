// Manual pair mode -- pick one '+' guide and one '-' guide from two
// independent lists to build a pair by hand, with a live preview map.

import { makePair } from "../../core/pairs.js";
import { designPairedPegrnas } from "../../core/pegrnaDesign.js";
import { stepperFieldHtml, attachStepperField, toggleHtml, attachToggle } from "../controls.js";
import { buildCoverageMapHtml } from "../components/coverageMap.js";
import { ICONS } from "../icons.js";
import { truncateSeq } from "../domUtils.js";

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
    <div class="caption">Pick one guide on the left and one on the right to form a pair. Click a picked row again to clear it.</div>
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
    mainContent.innerHTML = renderMain(record, leftGuides, rightGuides, state);
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

function pickerListHtml(sideLabel, sideIcon, guidesList, selectedIndex, side) {
  return `
    <div class="picker-panel">
      <div class="picker-header">${side === "left" ? sideIcon : ""}${sideLabel}${side === "right" ? sideIcon : ""}</div>
      <div class="picker-list">
        ${guidesList
          .map(
            (g, i) => `
          <div class="picker-row ${i === selectedIndex ? "selected" : ""}" data-picker-row data-side="${side}" data-index="${i}">
            <span class="mono">${g.nickPosition}</span>
          </div>`
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderMain(record, leftGuides, rightGuides, state) {
  const pickersHtml = `
    <div class="label">Guide map</div>
    <div style="display:flex;gap:20px;align-items:flex-start;">
      ${pickerListHtml(`Left guides · ${leftGuides.length}`, ICONS.arrowRight, leftGuides, state.leftIndex, "left")}
      <div class="panel" id="pair-preview" style="flex:1;padding:22px 24px;display:flex;flex-direction:column;align-items:center;gap:16px;min-height:220px;justify-content:center;">
        <div style="font-size:12.5px;font-weight:600;color:var(--text-muted);align-self:flex-start;">Pair preview</div>
        <div id="pair-preview-body" style="width:100%;"></div>
      </div>
      ${pickerListHtml(`Right guides · ${rightGuides.length}`, ICONS.arrowLeft, rightGuides, state.rightIndex, "right")}
    </div>
    <button class="btn btn-ghost btn-sm" id="clear-pick-btn" style="width:fit-content;">Clear left / right pick</button>
  `;

  const fillPreview = (html) =>
    pickersHtml.replace(
      '<div id="pair-preview-body" style="width:100%;"></div>',
      `<div id="pair-preview-body" style="width:100%;">${html}</div>`
    );

  if (state.leftIndex === null || state.rightIndex === null) {
    return fillPreview('<div class="caption" style="text-align:center;">Pick one guide on the left and one on the right.</div>');
  }

  const left = leftGuides[state.leftIndex];
  const right = rightGuides[state.rightIndex];

  if (left.nickPosition >= right.nickPosition) {
    return `
      ${fillPreview('<div class="caption" style="text-align:center;color:var(--danger);">Not an inward-facing pair.</div>')}
      <div class="warning-box">The picked '+' guide isn't to the left of the picked '-' guide, so they can't form an inward-facing pair.</div>
    `;
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

  const previewHtml = design
    ? buildCoverageMapHtml({
        sequenceLength: record.length,
        targetStart: 0,
        targetEnd: record.length,
        rows: [
          {
            label: "",
            start: pair.betweenNicksStart,
            end: pair.betweenNicksEnd,
            overlapStart: design.plan.overlapStart,
            overlapEnd: design.plan.overlapEnd,
          },
        ],
        coveredIntervals: [[pair.betweenNicksStart, pair.betweenNicksEnd]],
        coveragePercent: record.length > 0 ? (nickDistance / record.length) * 100.0 : 0.0,
      })
    : `<div class="warning-box">${error.message}</div>`;

  const resultHtml = design
    ? `
      <div class="label">Paired pegRNA design</div>
      <div class="caption">Nick interval <span class="mono">${pair.leftGuide.nickPosition}</span>–<span class="mono">${pair.rightGuide.nickPosition}</span> · overlap <span class="mono">${design.plan.overlapStart}</span>–<span class="mono">${design.plan.overlapEnd}</span> (${design.plan.overlapLength} nt)</div>
      ${design.plan.overlapLength === nickDistance ? '<div class="warning-box">The overlap covers the entire interval between the nick sites.</div>' : ""}
      ${Math.max(design.left.rttLength, design.right.rttLength) > 80 ? '<div class="warning-box">At least one RTT is longer than 80 nt. Long RTT designs may require additional experimental validation.</div>' : ""}
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Left spacer</th><th>Left PAM</th><th class="num">Left Nick</th><th>Left RTT</th><th>Left PBS</th>
            <th>Right spacer</th><th>Right PAM</th><th class="num">Right Nick</th><th>Right RTT</th><th>Right PBS</th><th class="num">Overlap</th>
          </tr></thead>
          <tbody>
            <tr>
              <td class="seq">${truncateSeq(design.left.spacerSequence)}</td><td class="seq">${design.left.guide.pam}</td><td class="num">${design.left.guide.nickPosition}</td>
              <td class="seq">${truncateSeq(design.left.rttSequence)}</td><td class="seq">${truncateSeq(design.left.pbsSequence)}</td>
              <td class="seq">${truncateSeq(design.right.spacerSequence)}</td><td class="seq">${design.right.guide.pam}</td><td class="num">${design.right.guide.nickPosition}</td>
              <td class="seq">${truncateSeq(design.right.rttSequence)}</td><td class="seq">${truncateSeq(design.right.pbsSequence)}</td><td class="num">${design.plan.overlapLength}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `
    : "";

  return `
    ${fillPreview(previewHtml)}
    ${overlapStartField}
    ${resultHtml}
  `;
}
