// Loads the bundled local gene symbol index (data/genes_hg38.tsv), a port
// of errpresso/gene_index.py.
//
// This exists purely to make the "Fetch by gene" picker fast, typo-proof,
// and cheap on network calls: the user searches and selects from a known
// symbol instead of typing free text that might not resolve, or might
// resolve to the wrong gene via UCSC's fuzzy /search (see the ambiguous-
// match handling in geneFetch.js). Because each entry already carries the
// gene's chromosome and coordinate span, picking from the index also lets
// the lookup skip the live /search call entirely -- see
// fetchGeneStructureForKnownRegion() in geneFetch.js.
//
// It is purely a UI convenience: geneFetch.js never imports this module and
// always resolves sequence data from a live UCSC call for anything not
// picked from the list, so a stale or incomplete index can only make the
// picker miss a gene -- it can never cause the app to serve stale or wrong
// sequence data. Any symbol not in the index can still be typed and fetched
// directly via the free-text fallback.
//
// Fetched lazily (only once the gene-fetch tab is opened) and cached in
// memory for the life of the page.

const INDEX_URL = new URL("../../data/genes_hg38.tsv", import.meta.url);

/**
 * @typedef {Object} GeneIndexEntry
 * @property {string} symbol
 * @property {string} chrom
 * @property {number} start
 * @property {number} end
 * @property {string} maneTranscript
 * @property {string} name
 */

/** @type {Promise<GeneIndexEntry[]>|null} */
let loadPromise = null;

function parseTsv(text) {
  const entries = [];

  for (const line of text.split("\n")) {
    if (!line) continue;
    const [symbol, chrom, start, end, maneTranscript, name] = line.split("\t");
    entries.push({
      symbol,
      chrom,
      start: Number(start),
      end: Number(end),
      maneTranscript: maneTranscript || "",
      name: name || "",
    });
  }

  return entries;
}

/**
 * Fetch and parse the bundled gene index, once. Resolves to an empty list
 * (rather than rejecting) if the file can't be loaded -- the picker just
 * degrades to free-text entry only, which still works.
 *
 * @returns {Promise<GeneIndexEntry[]>}
 */
export function loadGeneIndex() {
  if (!loadPromise) {
    loadPromise = fetch(INDEX_URL)
      .then((response) => (response.ok ? response.text() : ""))
      .then(parseTsv)
      .catch(() => []);
  }
  return loadPromise;
}
