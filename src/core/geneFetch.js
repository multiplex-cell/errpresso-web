// Port of errpresso/gene_fetch.py -- fetch a gene's exon (plus flanking
// sequence) from the UCSC Genome Browser REST API, by genomic coordinate.
//
// This hits api.genome.ucsc.edu directly from the browser -- no server, no
// reference genome ever downloaded or cached beyond the exon and flanks the
// user actually requests. UCSC's API sends `Access-Control-Allow-Origin: *`,
// so a plain client-side fetch() works with no proxy.
//
// Exon numbering is transcript-relative (exon 1 is the 5'-most exon), which
// for a '-' strand gene is the *highest*-coordinate exon on the reference,
// not the first one UCSC lists. "Upstream"/"downstream" flank lengths are
// likewise transcript-relative. Sequence for a '-' strand gene is returned
// reverse-complemented, so the result always reads 5' to 3' in the gene's
// own transcription direction.

import { reverseComplement } from "./guides.js";

const UCSC_BASE_URL = "https://api.genome.ucsc.edu";
const ASSEMBLY = "hg38";

// Gene-level bounds (from UCSC's HGNC track match) are padded before
// querying transcript tracks, because a transcript's UTRs occasionally
// extend a short distance past the HGNC gene envelope.
const TRANSCRIPT_QUERY_PADDING = 5000;

export class GeneFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = "GeneFetchError";
  }
}

// In-memory caches for the life of the page: gene structure and reference
// sequence are both static, so repeat lookups of the same gene/range never
// touch the network again.
const structureCache = new Map();
const sequenceCache = new Map();

async function fetchJson(path, params = {}) {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join(";");
  const url = query ? `${UCSC_BASE_URL}${path}?${query}` : `${UCSC_BASE_URL}${path}`;

  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new GeneFetchError("Could not reach the UCSC genome API. Check your connection and try again.");
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new GeneFetchError("The UCSC genome API returned an unexpected response.");
  }

  if (!response.ok && !body.error) {
    throw new GeneFetchError("The UCSC genome API returned an unexpected response.");
  }
  if (body.error) {
    throw new GeneFetchError(String(body.error));
  }

  return body;
}

/** UCSC's genePred-derived tracks (mane, knownGene) encode exon blocks in
 * BED12 style: block sizes and block starts relative to chromStart, rather
 * than absolute coordinates. Returns absolute [start, end] pairs, ascending. */
function parseBed12Exons(record) {
  const chromStart = Number(record.chromStart);
  const blockSizes = record.blockSizes
    .replace(/,+$/, "")
    .split(",")
    .filter(Boolean)
    .map(Number);
  const blockStarts = record.chromStarts
    .replace(/,+$/, "")
    .split(",")
    .filter(Boolean)
    .map(Number);

  return blockSizes.map((size, i) => [chromStart + blockStarts[i], chromStart + blockStarts[i] + size]);
}

function totalExonicLength(record) {
  return record.blockSizes
    .replace(/,+$/, "")
    .split(",")
    .filter(Boolean)
    .reduce((sum, v) => sum + Number(v), 0);
}

/**
 * Resolve a gene symbol to a chromosome and gene-level coordinate span.
 *
 * UCSC's /search is a fuzzy text search: querying "TP53" returns HGNC
 * matches for TP53 itself but also TP53I3, TP53RK, and unrelated genes
 * whose aliases happen to overlap the query. The first match is *not*
 * reliably the queried gene, so every candidate's own displayed symbol is
 * checked for an exact, case-insensitive match before its coordinates are
 * trusted.
 */
async function resolveGeneRegion(geneSymbol, assembly) {
  const search = await fetchJson("/search", { search: geneSymbol, genome: assembly });

  const groups = {};
  for (const group of search.positionMatches ?? []) {
    groups[group.trackName] = group;
  }

  if (!groups.hgnc) {
    throw new GeneFetchError(`No gene named '${geneSymbol}' was found in ${assembly}.`);
  }

  const exactMatches = groups.hgnc.matches.filter(
    (match) => (match.posName ?? "").toUpperCase() === geneSymbol.toUpperCase()
  );

  if (!exactMatches.length) {
    throw new GeneFetchError(`No gene named '${geneSymbol}' was found in ${assembly}.`);
  }

  const [chrom, bounds] = exactMatches[0].position.split(":");
  const [regionStart, regionEnd] = bounds.replace(/,/g, "").split("-").map(Number);

  return { chrom, regionStart, regionEnd };
}

/** Pick the MANE Select transcript, or fall back to the longest one. */
async function selectTranscript(geneSymbol, assembly, chrom, regionStart, regionEnd) {
  const queryStart = Math.max(0, regionStart - TRANSCRIPT_QUERY_PADDING);
  const queryEnd = regionEnd + TRANSCRIPT_QUERY_PADDING;

  const maneBody = await fetchJson("/getData/track", {
    genome: assembly,
    track: "mane",
    chrom,
    start: queryStart,
    end: queryEnd,
  });
  const maneRecords = maneBody.mane ?? [];

  const maneMatches = maneRecords.filter(
    (record) => (record.geneName2 ?? "").toUpperCase() === geneSymbol.toUpperCase()
  );

  if (maneMatches.length) {
    return { transcript: maneMatches[0], source: "MANE Select" };
  }

  const knownBody = await fetchJson("/getData/track", {
    genome: assembly,
    track: "knownGene",
    chrom,
    start: queryStart,
    end: queryEnd,
  });
  const knownRecords = knownBody.knownGene ?? [];

  const candidates = knownRecords.filter(
    (record) => (record.geneName2 ?? "").toUpperCase() === geneSymbol.toUpperCase()
  );

  if (!candidates.length) {
    throw new GeneFetchError(`'${geneSymbol}' was found but has no annotated transcript in ${assembly}.`);
  }

  const longest = candidates.reduce((best, r) => (totalExonicLength(r) > totalExonicLength(best) ? r : best));

  return { transcript: longest, source: "longest annotated transcript (no MANE Select available)" };
}

/**
 * Resolve a gene symbol to its transcript and exon structure. Exons are
 * numbered 1-based, 5' to 3' along the transcript. Cached per (symbol,
 * assembly) for the life of the page.
 *
 * @returns {Promise<{geneSymbol: string, assembly: string, chrom: string, strand: "+"|"-", transcriptId: string, transcriptSource: string, exons: Array<{number: number, start: number, end: number, length: number}>}>}
 */
export async function fetchGeneStructure(geneSymbol, assembly = ASSEMBLY) {
  const symbol = geneSymbol.trim();
  if (!symbol) {
    throw new GeneFetchError("Enter a gene symbol.");
  }

  const cacheKey = `${assembly}:${symbol.toUpperCase()}`;
  if (structureCache.has(cacheKey)) {
    return structureCache.get(cacheKey);
  }

  const { chrom, regionStart, regionEnd } = await resolveGeneRegion(symbol, assembly);
  const { transcript, source } = await selectTranscript(symbol, assembly, chrom, regionStart, regionEnd);

  const strand = transcript.strand;
  let exonIntervals = parseBed12Exons(transcript);

  // UCSC always lists exon blocks in ascending genomic order. For a '-'
  // strand gene, the 5'-most exon (transcript exon 1) is the last one in
  // that list, not the first.
  if (strand === "-") {
    exonIntervals = exonIntervals.slice().reverse();
  }

  const exons = exonIntervals.map(([start, end], i) => ({
    number: i + 1,
    start,
    end,
    length: end - start,
  }));

  const structure = {
    geneSymbol: transcript.geneName2 || symbol.toUpperCase(),
    assembly,
    chrom,
    strand,
    transcriptId: transcript.name,
    transcriptSource: source,
    exons,
  };

  structureCache.set(cacheKey, structure);
  return structure;
}

/** Fetch plus-strand reference sequence for one coordinate range. Cached
 * per (assembly, chrom, start, end) for the life of the page. */
export async function fetchSequence(assembly, chrom, start, end) {
  if (start < 0 || end <= start) {
    throw new GeneFetchError("Invalid genomic coordinate range.");
  }

  const cacheKey = `${assembly}:${chrom}:${start}:${end}`;
  if (sequenceCache.has(cacheKey)) {
    return sequenceCache.get(cacheKey);
  }

  const body = await fetchJson("/getData/sequence", { genome: assembly, chrom, start, end });
  const sequence = body.dna.toUpperCase();
  sequenceCache.set(cacheKey, sequence);
  return sequence;
}

/**
 * Fetch one exon plus flanking sequence, oriented 5' to 3' on the gene.
 * `upstream`/`downstream` are transcript-relative nucleotide counts (5'
 * and 3' of the exon respectively), regardless of the gene's strand.
 *
 * @returns {Promise<{sequence: string, description: string, geneSymbol: string, exonNumber: number, exonCount: number}>}
 */
export async function fetchExonWithFlanks({ geneSymbol, exonNumber, upstream, downstream, assembly = ASSEMBLY }) {
  if (upstream < 0 || downstream < 0) {
    throw new GeneFetchError("Flank lengths cannot be negative.");
  }

  const structure = await fetchGeneStructure(geneSymbol, assembly);

  if (exonNumber < 1 || exonNumber > structure.exons.length) {
    throw new GeneFetchError(
      `${structure.geneSymbol} exon ${exonNumber} does not exist (transcript ${structure.transcriptId} has ${structure.exons.length} exons).`
    );
  }

  const exon = structure.exons[exonNumber - 1];

  let windowStart;
  let windowEnd;
  if (structure.strand === "+") {
    windowStart = Math.max(0, exon.start - upstream);
    windowEnd = exon.end + downstream;
  } else {
    windowStart = Math.max(0, exon.start - downstream);
    windowEnd = exon.end + upstream;
  }

  let sequence = await fetchSequence(assembly, structure.chrom, windowStart, windowEnd);

  let exonOffsetStart;
  let exonOffsetEnd;
  if (structure.strand === "-") {
    sequence = reverseComplement(sequence);
    exonOffsetStart = windowEnd - exon.end;
    exonOffsetEnd = windowEnd - exon.start;
  } else {
    exonOffsetStart = exon.start - windowStart;
    exonOffsetEnd = exon.end - windowStart;
  }

  const description =
    `${structure.geneSymbol} exon ${exonNumber}/${structure.exons.length} ` +
    `(${structure.transcriptSource}, ${structure.transcriptId}) ${assembly} ` +
    `${structure.chrom}:${windowStart}-${windowEnd} (${structure.strand} strand, shown 5' to 3' on the gene)`;

  return {
    sequence,
    description,
    geneSymbol: structure.geneSymbol,
    strand: structure.strand,
    transcriptId: structure.transcriptId,
    transcriptSource: structure.transcriptSource,
    exonNumber,
    exonCount: structure.exons.length,
    chrom: structure.chrom,
    windowStart,
    windowEnd,
    exonOffsetStart,
    exonOffsetEnd,
  };
}
