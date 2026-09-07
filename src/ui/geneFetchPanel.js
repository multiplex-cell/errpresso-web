// "Fetch by gene" input-tab panel -- pick a gene from the bundled local
// index (fast path, no live search) or type one free-text (falls back to
// a live UCSC lookup), then resolve an exon + flanks to a sequence via
// src/core/geneFetch.js, and hand the result up to the caller as FASTA text.

import {
  fetchGeneStructure,
  fetchGeneStructureForKnownRegion,
  fetchExonWithFlanks,
  GeneFetchError,
} from "../core/geneFetch.js";
import { loadGeneIndex } from "../core/geneIndex.js";
import { escapeHtml } from "./domUtils.js";

const MAX_SUGGESTIONS = 8;

// Module-level, not per-panel-instance: the index is the same for the life
// of the page, and this lets suggestions appear instantly on every render
// after the first (loadGeneIndex() itself is also memoized, so this is
// just a synchronous read of an already-resolved value).
let cachedIndexEntries = null;
loadGeneIndex().then((entries) => {
  cachedIndexEntries = entries;
});

export function defaultGeneState() {
  return {
    symbol: "",
    lookupLoading: false,
    lookupError: null,
    structure: null,
    exonNumber: 1,
    upstream: 60,
    downstream: 60,
    fetchLoading: false,
    fetchError: null,
  };
}

/**
 * Render the gene-fetch tab body into `container` and wire its controls.
 * `state` is a mutable object (defaultGeneState()) the caller persists
 * across re-renders. `rerender` re-renders the panel (and whatever else
 * the caller's landing page needs) after a state change. `onFetched(fastaText)`
 * is called once a sequence has been fetched successfully.
 */
export function renderGeneFetchPanel(container, state, rerender, onFetched) {
  const structure = state.structure;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;padding:2px 0 4px;">
      <div class="caption">Pick a gene from the list, or type one and look it up directly. Fetches only the exon and flanking sequence you request from the UCSC Genome Browser (hg38).</div>
      <div style="position:relative;display:flex;gap:10px;">
        <input type="text" id="gene-symbol-input" class="field" style="flex:1;font-family:'IBM Plex Mono',monospace;font-size:13px;" placeholder="Gene symbol, e.g. BRCA2" value="${escapeHtml(state.symbol)}" autocomplete="off">
        <button class="btn btn-primary" id="gene-lookup-btn" ${state.lookupLoading ? "disabled" : ""}>${state.lookupLoading ? "Looking up…" : "Look up gene"}</button>
        <div id="gene-suggestions" class="gene-suggest-panel" hidden></div>
      </div>
      ${state.lookupError ? `<div class="warning-box">${escapeHtml(state.lookupError)}</div>` : ""}
      ${structure ? structureStageHtml(state) : ""}
    </div>
  `;

  const symbolInput = container.querySelector("#gene-symbol-input");
  const suggestBox = container.querySelector("#gene-suggestions");

  symbolInput.focus();
  symbolInput.selectionStart = symbolInput.selectionEnd = symbolInput.value.length;

  symbolInput.addEventListener("input", (e) => {
    state.symbol = e.target.value;
    renderSuggestions(e.target.value);
  });
  symbolInput.addEventListener("blur", () => {
    suggestBox.hidden = true;
  });
  symbolInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const firstRow = !suggestBox.hidden && suggestBox.querySelector(".gene-suggest-row");
      if (firstRow) {
        selectGene(firstRow.dataset.symbol);
      } else {
        lookUpGene();
      }
    } else if (e.key === "Escape") {
      suggestBox.hidden = true;
    }
  });

  container.querySelector("#gene-lookup-btn").addEventListener("click", () => lookUpGene());

  function renderSuggestions(query) {
    const trimmed = query.trim().toUpperCase();

    if (!trimmed || !cachedIndexEntries) {
      suggestBox.hidden = true;
      suggestBox.innerHTML = "";
      return;
    }

    const matches = cachedIndexEntries.filter((entry) => entry.symbol.startsWith(trimmed)).slice(0, MAX_SUGGESTIONS);

    if (!matches.length) {
      suggestBox.hidden = true;
      suggestBox.innerHTML = "";
      return;
    }

    suggestBox.innerHTML = matches
      .map(
        (entry) => `
          <div class="gene-suggest-row" data-symbol="${escapeHtml(entry.symbol)}">
            <span class="mono" style="font-weight:600;flex-shrink:0;">${escapeHtml(entry.symbol)}</span>
            ${entry.name ? `<span class="gene-suggest-desc">${escapeHtml(entry.name)}</span>` : ""}
          </div>`
      )
      .join("");
    suggestBox.hidden = false;

    suggestBox.querySelectorAll(".gene-suggest-row").forEach((row) => {
      // mousedown (not click) fires before the input's blur, so the pick
      // registers before the dropdown-hiding blur handler runs.
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectGene(row.dataset.symbol);
      });
    });
  }

  function selectGene(symbol) {
    state.symbol = symbol;
    suggestBox.hidden = true;
    suggestBox.innerHTML = "";
    const entry = cachedIndexEntries && cachedIndexEntries.find((e) => e.symbol === symbol);
    lookUpGene(entry);
  }

  async function lookUpGene(knownEntry) {
    const symbol = (knownEntry ? knownEntry.symbol : state.symbol).trim();

    if (!symbol) {
      state.lookupError = "Enter a gene symbol first.";
      state.structure = null;
      rerender();
      return;
    }

    state.symbol = symbol;
    state.lookupLoading = true;
    state.lookupError = null;
    state.structure = null;
    rerender();

    try {
      // Picked from the index -> its chrom/start/end are already known, so
      // skip the live /search call and go straight to the transcript.
      state.structure = knownEntry
        ? await fetchGeneStructureForKnownRegion(knownEntry)
        : await fetchGeneStructure(symbol);
      state.exonNumber = 1;
      state.fetchError = null;
    } catch (error) {
      if (error instanceof GeneFetchError) {
        state.lookupError = error.message;
      } else {
        throw error;
      }
    } finally {
      state.lookupLoading = false;
      rerender();
    }
  }

  if (!structure) return;

  container.querySelector("#gene-exon-select").addEventListener("change", (e) => {
    state.exonNumber = Number(e.target.value);
  });
  container.querySelector("#gene-upstream-input").addEventListener("input", (e) => {
    state.upstream = Math.max(0, Number(e.target.value) || 0);
  });
  container.querySelector("#gene-downstream-input").addEventListener("input", (e) => {
    state.downstream = Math.max(0, Number(e.target.value) || 0);
  });

  container.querySelector("#gene-fetch-btn").addEventListener("click", async () => {
    state.fetchLoading = true;
    state.fetchError = null;
    rerender();

    try {
      const result = await fetchExonWithFlanks({
        geneSymbol: structure.geneSymbol,
        exonNumber: state.exonNumber,
        upstream: state.upstream,
        downstream: state.downstream,
      });
      const fasta = `>${result.geneSymbol}_exon${result.exonNumber} ${result.description}\n${result.sequence}\n`;
      onFetched(fasta);
    } catch (error) {
      if (error instanceof GeneFetchError) {
        state.fetchError = error.message;
        state.fetchLoading = false;
        rerender();
      } else {
        throw error;
      }
    }
  });
}

function structureStageHtml(state) {
  const structure = state.structure;
  const exonOptions = structure.exons
    .map(
      (e) =>
        `<option value="${e.number}" ${e.number === state.exonNumber ? "selected" : ""}>Exon ${e.number} (${e.length.toLocaleString()} nt)</option>`
    )
    .join("");

  return `
    <div style="border-top:1px solid var(--border-soft);padding-top:14px;display:flex;flex-direction:column;gap:14px;">
      <div class="caption"><strong style="color:var(--text);">${escapeHtml(structure.geneSymbol)}</strong> — ${escapeHtml(structure.chrom)} (${structure.strand} strand) · ${escapeHtml(structure.transcriptId)} · ${escapeHtml(structure.transcriptSource)} · ${structure.exons.length} exon${structure.exons.length === 1 ? "" : "s"}</div>

      <div style="display:flex;gap:10px;">
        <div style="flex:1;">
          <div class="field-label">Exon</div>
          <select id="gene-exon-select" class="field" style="width:100%;">${exonOptions}</select>
        </div>
        <div style="flex:1;">
          <div class="field-label">Upstream flank (nt)</div>
          <input type="number" id="gene-upstream-input" class="field" style="width:100%;" min="0" max="5000" step="10" value="${state.upstream}">
        </div>
        <div style="flex:1;">
          <div class="field-label">Downstream flank (nt)</div>
          <input type="number" id="gene-downstream-input" class="field" style="width:100%;" min="0" max="5000" step="10" value="${state.downstream}">
        </div>
      </div>

      <button class="btn btn-primary" id="gene-fetch-btn" ${state.fetchLoading ? "disabled" : ""} style="width:100%;">${state.fetchLoading ? "Fetching…" : "Fetch sequence"}</button>
      ${state.fetchError ? `<div class="warning-box">${escapeHtml(state.fetchError)}</div>` : ""}
    </div>
  `;
}
