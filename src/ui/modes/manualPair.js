// Manual pair mode -- pick one '+' guide and one '-' guide from a
// spatial orientation map to build a pair by hand, then save it as a
// set and keep picking. Saved sets accumulate below, each one frozen
// at save time so later changes to PBS/overlap don't retroactively
// change a set you already saved.

import { makePair } from "../../core/pairs.js";
import { designPairedPegrnas } from "../../core/pegrnaDesign.js";
import { intervalsLength } from "../../core/intervals.js";
import { designBlockingMutations, applyBlockingMutations } from "../../core/pamBlocking.js";
import { stepperFieldHtml, attachStepperField, toggleHtml, attachToggle } from "../controls.js";
import { buildSpacerMapHtml } from "../components/spacerMap.js";
import { buildCoverageMapHtml } from "../components/coverageMap.js";
import { buildPegrnaCardHtml, buildPegrnaLegendHtml } from "../components/pegrnaCard.js";
import { wireImageDownloadButtons } from "../imageExport.js";
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
  ...PEGRNA_BASE_COLUMNS,
  { key: "overlap_length_nt", label: "overlap_length_nt" },
  { key: "blocking_mutations", label: "blocking_mutations" },
];

const BLOCKING_REGION_LABELS = {
  none: "None",
  pam: "Destroy PAM",
  seed: "Disrupt seed (3 nt)",
  both: "Both",
};

function defaults(record) {
  return {
    pbs: 13,
    overlapLength: Math.min(20, Math.max(record.length, 1)),
    centerOverlap: true,
    leftIndex: null,
    rightIndex: null,
    overlapStart: null,
    blockingRegion: "none", // "none" | "pam" | "seed" | "both"
    savedSets: [], // frozen {pair, design, mutations} snapshots, in save order
  };
}

export function renderManualPairMode({ record, guides, state, sidebarExtra, mainContent, exonRange, cdsRange }) {
  Object.assign(state, { ...defaults(record), ...state });

  sidebarExtra.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="label">Design parameters</div>
      ${stepperFieldHtml({ id: "pbs", label: "PBS length", value: state.pbs })}
      ${stepperFieldHtml({ id: "overlapLength", label: "RTT overlap length", value: state.overlapLength })}
      ${toggleHtml({ id: "centerOverlap", label: "Center overlap", checked: state.centerOverlap })}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="label">Blocking mutation</div>
      <select id="blocking-region-select" class="field" style="width:100%;">
        ${Object.entries(BLOCKING_REGION_LABELS)
          .map(([value, label]) => `<option value="${value}" ${state.blockingRegion === value ? "selected" : ""}>${label}</option>`)
          .join("")}
      </select>
      <div class="caption">
        ${
          cdsRange
            ? "A CDS is assigned -- mutations are kept silent (same amino acid) wherever a position falls inside it."
            : "No CDS assigned on the landing page -- mutations aren't checked for silence, they just disrupt the sequence."
        }
      </div>
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
  sidebarExtra.querySelector("#blocking-region-select").addEventListener("change", (e) => {
    state.blockingRegion = e.target.value;
    recompute();
  });

  const leftGuides = guides.filter((g) => g.strand === "+").sort((a, b) => a.nickPosition - b.nickPosition);
  const rightGuides = guides.filter((g) => g.strand === "-").sort((a, b) => b.nickPosition - a.nickPosition);

  function recompute() {
    const { html, download } = renderMain(record, leftGuides, rightGuides, state, exonRange, cdsRange);
    mainContent.innerHTML = html;
    wireDownloadButton(mainContent, download);
    wireImageDownloadButtons(mainContent);
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
        const { pair, design, mutations } = resolveCurrentDesign(record, leftGuides, rightGuides, state, cdsRange);
        if (!design) return;
        state.savedSets.push({ pair, design, mutations });
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

/** A blocking mutation the intended guide's own RTT is too short to
 * actually reach never makes it into the synthesized construct -- mark
 * it blocked (rather than silently dropping it) so that's visible. */
function clampMutationsToRtt(mutations, rttStart, rttEnd) {
  return mutations.map((m) =>
    m.newBase && (m.position < rttStart || m.position >= rttEnd)
      ? { ...m, newBase: null, reason: "Outside this guide's own RTT -- lengthen the RTT overlap to reach it." }
      : m
  );
}

/** Resolve the pair + assembled design for whatever is currently picked,
 * exactly the same computation renderMain uses for display -- shared so
 * "Save as set" saves precisely what's on screen.
 *
 * When state.blockingRegion isn't "none", the design is computed twice:
 * once (wild-type) purely to learn each guide's own RTT window, then
 * again against a reference copy with the chosen blocking mutation(s)
 * baked in at the genomic positions that fall inside that window --
 * coordinates are untouched throughout (single-base substitutions
 * only), so this never risks the geometry math itself.
 */
function resolveCurrentDesign(record, leftGuides, rightGuides, state, cdsRange) {
  if (state.leftIndex === null || state.rightIndex === null) {
    return { pair: null, design: null, mutations: null, error: null };
  }

  const left = leftGuides[state.leftIndex];
  const right = rightGuides[state.rightIndex];
  if (left.nickPosition >= right.nickPosition) {
    return { pair: null, design: null, mutations: null, error: null };
  }

  const pair = makePair(left, right);
  const nickDistance = pair.nickDistance;

  let overlapStart = null;
  if (!state.centerOverlap && state.overlapLength <= nickDistance) {
    const centeredStart = pair.leftGuide.nickPosition + Math.floor((nickDistance - state.overlapLength) / 2);
    overlapStart = state.overlapStart ?? centeredStart;
  }
  const resolvedOverlapStart = state.centerOverlap ? null : overlapStart;

  try {
    const baseDesign = designPairedPegrnas(record.sequence, pair, state.pbs, state.overlapLength, resolvedOverlapStart);

    if (state.blockingRegion === "none") {
      return { pair, design: baseDesign, mutations: null, error: null };
    }

    const leftMutations = clampMutationsToRtt(
      designBlockingMutations({ referenceSequence: record.sequence, guide: pair.leftGuide, region: state.blockingRegion, cds: cdsRange }),
      baseDesign.plan.leftRttStart,
      baseDesign.plan.leftRttEnd
    );
    const rightMutations = clampMutationsToRtt(
      designBlockingMutations({ referenceSequence: record.sequence, guide: pair.rightGuide, region: state.blockingRegion, cds: cdsRange }),
      baseDesign.plan.rightRttStart,
      baseDesign.plan.rightRttEnd
    );

    const mutatedReference = applyBlockingMutations(record.sequence, [...leftMutations, ...rightMutations]);
    const design = designPairedPegrnas(mutatedReference, pair, state.pbs, state.overlapLength, resolvedOverlapStart);

    return { pair, design, mutations: { left: leftMutations, right: rightMutations }, error: null };
  } catch (e) {
    return { pair, design: null, mutations: null, error: e };
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

/** One mutation as short, readable text: "pos 21 G→A (silent, Gly)",
 * "pos 22 blocked -- no synonymous codon for Gly (GGC)", etc. */
function mutationText(m) {
  if (!m.newBase) {
    return `<span style="color:var(--danger);">pos ${m.position} blocked${m.reason ? ` — ${escapeHtml(m.reason)}` : ""}</span>`;
  }
  const tag = m.synonymous === true ? ` (silent, ${m.aminoAcid})` : m.synonymous === null ? "" : "";
  return `<span class="mono">${m.position} ${m.originalBase}→${m.newBase}</span>${tag}`;
}

/** One codon (3 chars) as HTML, with the base at `markIndex` bolded and
 * colored -- the same rendering for a reference or a mutated codon, just
 * with a different index/color, so ref and mutated line up visually. */
function codonHtml(codon, markIndex, markColor) {
  return [...codon]
    .map((ch, i) => (i === markIndex ? `<span style="color:${markColor};font-weight:700;">${escapeHtml(ch)}</span>` : escapeHtml(ch)))
    .join("");
}

/** Small ref/mutated visual for one blocking-mutation position -- a
 * codon-and-amino-acid diagram when it's CDS-constrained (so "silent"
 * is visible, not just claimed), or a bare base swap otherwise. Omitted
 * for a position with no substitution at all outside a CDS (nothing to
 * show; the free case only ever appears with a base swap in practice). */
function mutationVisualCardHtml(m) {
  const posLabel = `<div style="font-size:9.5px;color:var(--text-faint);">${m.position}</div>`;
  const cardStyle =
    "display:flex;flex-direction:column;align-items:center;gap:2px;font-size:12px;border:1px solid var(--border-soft);border-radius:6px;padding:5px 8px;background:var(--bg);min-width:52px;";

  if (m.codon === undefined) {
    if (!m.newBase) return "";
    return `
      <div style="${cardStyle}">
        ${posLabel}
        <div class="mono">${escapeHtml(m.originalBase)}→<span style="color:var(--teal);font-weight:700;">${escapeHtml(m.newBase)}</span></div>
      </div>
    `;
  }

  const blocked = !m.newBase;
  const markColor = blocked ? "var(--danger)" : "var(--teal)";
  return `
    <div style="${cardStyle}">
      ${posLabel}
      <div class="mono">${codonHtml(m.codon, m.posInCodon, markColor)}</div>
      <div class="mono" style="color:var(--text-faint);">${blocked ? "—" : codonHtml(m.mutatedCodon, m.posInCodon, markColor)}</div>
      <div style="font-size:10.5px;color:var(--text-faint);white-space:nowrap;">${blocked ? `${escapeHtml(m.aminoAcid)} · blocked` : `${escapeHtml(m.aminoAcid)} → ${escapeHtml(m.aminoAcid)}`}</div>
    </div>
  `;
}

/** Summary line(s) for whatever blocking mutations were attempted on
 * this pair -- omitted entirely when blocking mutation wasn't used. */
function mutationSummaryHtml(mutations) {
  if (!mutations) return "";

  const sideBlock = (label, list) => {
    if (!list.length) return "";
    const textLine = `<div class="caption"><strong style="color:var(--text);">${label} blocking:</strong> ${list.map(mutationText).join(" · ")}</div>`;
    const cards = list.map(mutationVisualCardHtml).join("");
    return `${textLine}<div style="display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 2px;">${cards}</div>`;
  };

  const blocks = [sideBlock("Left", mutations.left), sideBlock("Right", mutations.right)].filter(Boolean);
  if (!blocks.length) return "";

  return `<div style="border-top:1px solid var(--border-soft);padding-top:10px;margin-top:-4px;display:flex;flex-direction:column;gap:6px;">${blocks.join("")}</div>`;
}

/** One pegRNA-pair card, shared between the live (unsaved) preview and
 * each saved set below it. */
function buildPairCardHtml({ setNumber, pair, design, mutations, actions }) {
  return buildPegrnaCardHtml({
    setNumber,
    headerRight: [{ label: "Overlap", value: `${design.plan.overlapLength} nt` }],
    actions,
    extraFooter: mutationSummaryHtml(mutations),
    sides: [
      {
        title: "Left pegRNA",
        stats: [
          { label: "Spacer", value: design.left.spacerSequence },
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
          { label: "Spacer", value: design.right.spacerSequence },
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

/** Compact, CSV-friendly text for one side's mutation list, e.g.
 * "22:G>A(silent);21:blocked" -- empty string when there's nothing to say. */
function mutationsForCsv(list) {
  if (!list || !list.length) return "";
  return list
    .map((m) => (m.newBase ? `${m.position}:${m.originalBase}>${m.newBase}${m.synonymous ? "(silent)" : ""}` : `${m.position}:blocked`))
    .join(";");
}

function buildSavedSetsBlock(record, state, exonRange) {
  if (!state.savedSets.length) return { html: "", download: null };

  const cardsHtml = state.savedSets
    .map(({ pair, design, mutations }, i) =>
      buildPairCardHtml({
        setNumber: i + 1,
        pair,
        design,
        mutations,
        actions: `<button class="btn btn-ghost btn-sm" data-remove-set-index="${i}">Remove</button>`,
      })
    )
    .join("");

  const rows = state.savedSets.flatMap(({ design, mutations }, i) => {
    const extra = { set: i + 1, overlap_length_nt: design.plan.overlapLength };
    return [
      { ...pegrnaSideRow(extra, "Left", design.left), blocking_mutations: mutationsForCsv(mutations?.left) },
      { ...pegrnaSideRow(extra, "Right", design.right), blocking_mutations: mutationsForCsv(mutations?.right) },
    ];
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
    id: "coverage-track-manual",
    filename: `errpresso_manual-pair-saved-sets_${slugify(record.recordId)}.svg`,
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

function renderMain(record, leftGuides, rightGuides, state, exonRange, cdsRange) {
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

  const { design, mutations, error } = resolveCurrentDesign(record, leftGuides, rightGuides, state, cdsRange);

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
      mutations,
      actions: `<button class="btn btn-primary btn-sm" id="save-set-btn">Save as set</button>`,
    })}
  `;

  return {
    html: `${mapBlock}${overlapStartField}${resultHtml}${savedBlock.html}`,
    download: savedBlock.download,
  };
}
