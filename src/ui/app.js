// ErrPresso -- top-level app shell: sequence input, top bar, mode nav,
// and delegation to the active design-mode module. Runs entirely
// client-side; no server, no build step.

import { parseSequenceText, SequenceParseError } from "../core/sequenceIo.js";
import { findSpCas9Guides } from "../core/guides.js";
import { findInwardFacingPairs } from "../core/pairs.js";
import { ICONS, logoMarkSvg } from "./icons.js";
import { escapeHtml } from "./domUtils.js";
import { renderJointCoverageMode } from "./modes/jointCoverage.js";
import { renderFixedGuideMode } from "./modes/fixedGuide.js";
import { renderManualPairMode } from "./modes/manualPair.js";
import { renderSinglePegrnaMode } from "./modes/singlePegrna.js";
import { renderGeneFetchPanel, defaultGeneState } from "./geneFetchPanel.js";

const EXAMPLE_FASTA =
  ">KRAS_exon2 ErrPresso demo sequence\n" +
  "GTTTCTCCCTTCTCAGGATTCCTACAGGAAGCAAGTAGTAATTGATGGAGAAACCTGTCT\n" +
  "CTTGGATATTCTCGACACAGCAGGTCAAGAGGAGTACAGTGCAATGAGGGACCAGTACAT\n" +
  "GAGGACTGGGGAGGGCTTTCTTTGTGTATTTGCCATAAATAATACTAAATCATTTGAAGA\n" +
  "TATTCACCATTATAGGTGGGTTTAAATTG\n";

const MODES = [
  { id: "joint", label: "Joint coverage set", icon: "jointCoverage", render: renderJointCoverageMode },
  { id: "fixed", label: "Fixed guide, variable RTT", icon: "fixedGuide", render: renderFixedGuideMode },
  { id: "manual", label: "Manual pair", icon: "manualPair", render: renderManualPairMode },
  { id: "single", label: "Single pegRNA", icon: "singlePegrna", render: renderSinglePegrnaMode },
];

/** @type {{records: object[]|null, selectedRecordId: string|null, mode: string, modeState: Record<string, any>, inputTab: string, inputText: string}} */
const appState = {
  records: null,
  selectedRecordId: null,
  mode: "joint",
  modeState: {}, // per-mode persisted params, keyed by mode id
  inputTab: "paste",
  inputText: "",
  geneState: defaultGeneState(),
};

const root = document.getElementById("app");

function currentRecord() {
  if (!appState.records) return null;
  return (
    appState.records.find((r) => r.recordId === appState.selectedRecordId) ||
    appState.records[0]
  );
}

function renderLanding() {
  root.innerHTML = `
    <div class="app-shell" style="position:relative;overflow:hidden;">
      <div style="position:absolute;top:26px;left:50%;transform:translateX(-50%);width:min(1040px, 92vw);display:flex;flex-direction:column;gap:8px;pointer-events:none;">
        <div style="position:relative;height:8px;"><div style="position:absolute;left:6%;width:15%;height:8px;border-radius:999px;background:var(--accent-soft);"></div></div>
        <div style="position:relative;height:8px;"><div style="position:absolute;right:8%;width:19%;height:8px;border-radius:999px;background:var(--accent-soft);"></div></div>
      </div>

      <div class="landing-wrap" style="position:relative;padding-top:88px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:28px;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${logoMarkSvg(26)}
            <span style="font-size:17px;font-weight:700;letter-spacing:-0.01em;">ErrPresso</span>
          </div>
          <div style="text-align:center;display:flex;flex-direction:column;gap:14px;">
            <div style="font-size:clamp(28px, 8vw, 40px);font-weight:700;letter-spacing:-0.02em;line-height:1.15;">Err2 prime-editing design</div>
            <div style="font-size:15px;color:var(--text-muted);">Paste a sequence. Get pegRNA pairs, ranked by coverage, in your browser.</div>
          </div>
        </div>

        <div class="landing-card">
          <div class="tab-row" id="input-tabs">
            <button class="tab-item ${appState.inputTab === "paste" ? "active" : ""}" data-tab="paste">${ICONS.paste} Paste sequence</button>
            <button class="tab-item ${appState.inputTab === "upload" ? "active" : ""}" data-tab="upload">${ICONS.upload} Upload file</button>
            <button class="tab-item ${appState.inputTab === "gene" ? "active" : ""}" data-tab="gene">${ICONS.gene} Fetch by gene</button>
          </div>

          <div id="input-body"></div>

          <div id="parse-error"></div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" id="design-btn" style="flex:1 1 200px;">Design pegRNAs ${ICONS.arrowRight}</button>
            <button class="btn btn-ghost" id="load-example-btn" style="flex:0 0 auto;">Load example</button>
          </div>
        </div>
      </div>
    </div>
  `;

  renderInputBody();

  root.querySelectorAll("#input-tabs .tab-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.inputTab = btn.dataset.tab;
      renderLanding();
    });
  });

  root.querySelector("#load-example-btn").addEventListener("click", () => {
    appState.inputTab = "paste";
    appState.inputText = EXAMPLE_FASTA;
    renderLanding();
  });

  root.querySelector("#design-btn").addEventListener("click", handleDesignClick);
}

function renderInputBody() {
  const body = document.getElementById("input-body");
  if (!body) return;

  if (appState.inputTab === "paste") {
    body.innerHTML = `<textarea class="seq-input" id="seq-textarea" placeholder=">my_locus&#10;ACGTACGTACGTACGTACGT...&#10;&#10;Raw DNA, FASTA, or FASTQ. Multi-record input is supported.">${escapeHtml(appState.inputText)}</textarea>`;
    body.querySelector("#seq-textarea").addEventListener("input", (e) => {
      appState.inputText = e.target.value;
    });
  } else if (appState.inputTab === "upload") {
    body.innerHTML = `
      <div style="border:1px dashed var(--border);border-radius:10px;padding:28px;text-align:center;color:var(--text-muted);font-size:13.5px;">
        <input type="file" id="file-input" accept=".fa,.fasta,.fq,.fastq,.txt" style="margin-bottom:8px;">
        <div>Accepts FASTA, FASTQ, or raw-text DNA files.</div>
      </div>`;
    body.querySelector("#file-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      appState.inputText = await file.text();
      appState.inputTab = "paste";
      renderLanding();
    });
  } else {
    renderGeneFetchPanel(body, appState.geneState, renderLanding, (fastaText) => {
      appState.geneState = defaultGeneState();
      appState.inputTab = "paste";
      appState.inputText = fastaText;
      renderLanding();
    });
  }
}

function handleDesignClick() {
  const errorBox = document.getElementById("parse-error");
  errorBox.innerHTML = "";

  try {
    const records = parseSequenceText(appState.inputText);
    appState.records = records;
    appState.selectedRecordId = records[0].recordId;
    appState.mode = "joint";
    appState.modeState = {};
    renderWorkspace();
  } catch (error) {
    if (error instanceof SequenceParseError || error.name === "SequenceParseError") {
      errorBox.innerHTML = `<div class="warning-box" style="margin-top:-8px;">${escapeHtml(error.message)}</div>`;
    } else {
      throw error;
    }
  }
}

function renderTopBar(record) {
  return `
    <div class="topbar">
      <div class="brand">${logoMarkSvg(26)}<span>ErrPresso</span></div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="chip-row">
          <span class="chip">${record.length.toLocaleString()} bp</span>
          <span class="chip">${record.gcPercent.toFixed(1)}% GC</span>
          <span class="chip">${record.sourceFormat.toUpperCase()}</span>
          ${record.nCount ? `<span class="chip">${record.nCount.toLocaleString()} N</span>` : ""}
        </div>
        <button class="btn btn-ghost btn-sm" id="new-sequence-btn">New sequence</button>
      </div>
    </div>
  `;
}

function renderModeNav() {
  return `
    <div class="mode-nav">
      ${MODES.map(
        (m) => `
        <button class="mode-item ${appState.mode === m.id ? "active" : ""}" data-mode="${m.id}">
          ${ICONS[m.icon]}<span>${m.label}</span>
        </button>`
      ).join("")}
    </div>
  `;
}

function renderGuideDetails(guides, pairs) {
  return `
    <details class="guide-details">
      <summary>Guide and pair details -- ${guides.length} guides, ${pairs.length} inward-facing pairs</summary>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Guide</th><th>Spacer</th><th>PAM</th><th>Strand</th>
            <th class="num">Protospacer start</th><th class="num">Protospacer end</th>
            <th class="num">PAM start</th><th class="num">PAM end</th><th class="num">Nick</th>
          </tr></thead>
          <tbody>
            ${guides
              .map(
                (g, i) => `
              <tr>
                <td>${i + 1}</td><td class="seq">${g.spacer}</td><td class="seq">${g.pam}</td><td>${g.strand}</td>
                <td class="num">${g.protospacerStart}</td><td class="num">${g.protospacerEnd}</td>
                <td class="num">${g.pamStart}</td><td class="num">${g.pamEnd}</td><td class="num">${g.nickPosition}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="caption" style="margin-top:10px;">Coordinates are zero-based and half-open. Nick positions are reference-sequence boundaries.</div>
    </details>
  `;
}

function renderWorkspace() {
  const record = currentRecord();
  if (!record) {
    renderLanding();
    return;
  }

  const guides = findSpCas9Guides(record.sequence);

  const showRecordSelector = appState.records.length > 1;

  root.innerHTML = `
    <div class="app-shell">
      ${renderTopBar(record)}
      ${
        showRecordSelector
          ? `<div style="padding:10px 32px 0;">
              <select class="field" id="record-select" style="font-family:'IBM Plex Mono',monospace;font-size:12.5px;">
                ${appState.records
                  .map(
                    (r) =>
                      `<option value="${r.recordId}" ${r.recordId === record.recordId ? "selected" : ""}>${r.recordId} (${r.length.toLocaleString()} bp)</option>`
                  )
                  .join("")}
              </select>
            </div>`
          : ""
      }
      <div class="workspace">
        <div class="sidebar" id="sidebar">
          ${renderModeNav()}
          <div id="mode-sidebar-extra"></div>
        </div>
        <div class="main-content" id="main-content"></div>
      </div>
    </div>
  `;

  root.querySelector("#new-sequence-btn").addEventListener("click", () => {
    appState.records = null;
    renderLanding();
  });

  if (showRecordSelector) {
    root.querySelector("#record-select").addEventListener("change", (e) => {
      appState.selectedRecordId = e.target.value;
      appState.mode = "joint";
      appState.modeState = {};
      renderWorkspace();
    });
  }

  root.querySelectorAll(".mode-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      appState.mode = btn.dataset.mode;
      renderWorkspace();
    });
  });

  if (!guides.length) {
    document.getElementById("mode-sidebar-extra").innerHTML = "";
    document.getElementById("main-content").innerHTML =
      '<div class="warning-box">No 20-nt guide candidates with an NGG PAM were found in this sequence.</div>';
    return;
  }

  const pairs = findInwardFacingPairs(guides);
  const activeMode = MODES.find((m) => m.id === appState.mode);

  const sidebarExtra = document.getElementById("mode-sidebar-extra");
  const mainContent = document.getElementById("main-content");

  if (!appState.modeState[appState.mode]) {
    appState.modeState[appState.mode] = {};
  }

  activeMode.render({
    record,
    guides,
    pairs,
    state: appState.modeState[appState.mode],
    sidebarExtra,
    mainContent,
  });

  // Guide/pair details go at the bottom of the main content, below
  // whatever the mode itself rendered.
  const detailsWrap = document.createElement("div");
  detailsWrap.innerHTML = renderGuideDetails(guides, pairs);
  mainContent.appendChild(detailsWrap.firstElementChild);

  const disclaimer = document.createElement("div");
  disclaimer.className = "disclaimer";
  disclaimer.textContent =
    "ErrPresso performs deterministic sequence and geometry design. Outputs are " +
    "candidate designs that require experimental validation -- editing efficiency " +
    "depends on guide activity, chromatin context, off-target activity, and cellular context.";
  mainContent.appendChild(disclaimer);
}

renderLanding();
