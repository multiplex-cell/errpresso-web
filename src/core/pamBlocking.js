// "Blocking mutation" design -- after a successful edit, an unchanged
// PAM (or an unchanged seed region right next to it) can still be
// re-bound and re-cut by the very same pegRNA, causing indels or
// repeated editing at the same site. The standard fix is to write a
// point mutation into the RTT that destroys the PAM (only its 2nd and
// 3rd bases matter for SpCas9 -- the first, "N", is irrelevant) and/or
// disrupts the seed (the 3 nt immediately upstream of the PAM, which
// matter most for Cas9 re-binding) -- silently, i.e. without changing
// the encoded amino acid, when the position falls inside a
// user-assigned CDS.
//
// Everything here works in genomic (reference, '+' strand) coordinates
// and only ever proposes single-base substitutions -- no length change,
// so every existing guide/RTT/PBS coordinate stays valid. The actual
// "write it into this design" step is a separate, deliberate call
// (applyBlockingMutations) so the caller can build a temporary, locally
// -mutated copy of the reference to feed into the existing RTT/PBS
// math, without ever touching the app's real reference sequence.

import { reverseComplement } from "./guides.js";
import { translateCodon } from "./codonTable.js";

const BASES = ["A", "C", "G", "T"];

/**
 * @typedef {Object} CdsRange
 * @property {number} start -- 0-based, inclusive, reference coordinates
 * @property {number} end -- 0-based, exclusive
 * @property {"+"|"-"} strand -- reading direction; "-" reads from `end-1`
 *   down to `start`, each base complemented
 */

/** Reference position -> its 0-based offset in the CDS's own reading
 * direction (0 is the first base of the start codon), or null if `pos`
 * falls outside [cds.start, cds.end). */
function cdsOffset(pos, cds) {
  if (pos < cds.start || pos >= cds.end) return null;
  return cds.strand === "+" ? pos - cds.start : cds.end - 1 - pos;
}

/** The inverse of cdsOffset. */
function cdsPosition(offset, cds) {
  return cds.strand === "+" ? cds.start + offset : cds.end - 1 - offset;
}

/**
 * Every synonymous alternative for one reference position that falls
 * inside a CDS -- i.e. every other base that, substituted there, still
 * translates the surrounding codon to the same amino acid.
 *
 * @param {string} referenceSequence
 * @param {number} pos -- 0-based reference position to consider mutating
 * @param {CdsRange} cds
 * @returns {{synonymousBases: string[], originalBase: string, codon: string, aminoAcid: string}|null}
 *   null if `pos` isn't inside the CDS.
 */
export function findSynonymousSubstitutions(referenceSequence, pos, cds) {
  const offset = cdsOffset(pos, cds);
  if (offset === null) return null;

  const codonStartOffset = Math.floor(offset / 3) * 3;
  const posInCodon = offset - codonStartOffset;

  // These 3 reference positions are already in the CDS's own 5'->3'
  // reading order for either strand, since cdsPosition is monotonic.
  const genomicPositions = [0, 1, 2].map((i) => cdsPosition(codonStartOffset + i, cds));
  const rawBases = genomicPositions.map((p) => referenceSequence[p]);
  const codonBases = cds.strand === "+" ? rawBases : rawBases.map((b) => reverseComplement(b));

  const originalCodon = codonBases.join("");
  const aminoAcid = translateCodon(originalCodon);
  const originalBase = codonBases[posInCodon];

  const synonymousBases = BASES.filter((base) => {
    if (base === originalBase) return false;
    const trial = codonBases.slice();
    trial[posInCodon] = base;
    return translateCodon(trial.join("")) === aminoAcid;
  });

  return { synonymousBases, originalBase, codon: originalCodon, aminoAcid };
}

/** The two genomic positions of an NGG PAM whose identity actually
 * matters (the two G's) -- mutating the first, "N", position never
 * destroys the PAM, so it's never a candidate. */
function pamDisruptivePositions(guide) {
  return guide.strand === "+" ? [guide.pamStart + 1, guide.pamStart + 2] : [guide.pamStart, guide.pamStart + 1];
}

/** The 3 genomic positions immediately upstream of the PAM (the seed),
 * in the guide's own reading direction -- always exactly [nick, nick+3)
 * for a '+' guide or [nick-3, nick) for a '-' guide. */
function seedPositions(guide) {
  return guide.strand === "+"
    ? [guide.nickPosition, guide.nickPosition + 1, guide.nickPosition + 2]
    : [guide.nickPosition - 3, guide.nickPosition - 2, guide.nickPosition - 1];
}

/**
 * @param {import("./guides.js").GuideCandidate} guide
 * @param {"pam"|"seed"|"both"} region
 * @returns {number[]} reference positions to try mutating, ascending
 */
export function findBlockingMutationPositions(guide, region) {
  const positions = [];
  if (region === "pam" || region === "both") positions.push(...pamDisruptivePositions(guide));
  if (region === "seed" || region === "both") positions.push(...seedPositions(guide));
  return positions.sort((a, b) => a - b);
}

/**
 * @typedef {Object} BlockingMutation
 * @property {number} position -- 0-based reference position
 * @property {string} originalBase
 * @property {string|null} newBase -- null if no mutation could be made here
 * @property {boolean|null} synonymous -- true (silent, CDS-constrained),
 *   null (no CDS constraint applies, freely substitutable)
 * @property {string} [codon] -- original codon, only set when synonymous !== null
 * @property {string} [aminoAcid]
 * @property {string} [reason] -- set only when newBase is null, explaining why
 */

/**
 * Design a blocking mutation at every candidate position for `region`.
 * Positions inside `cds` (when given) are constrained to a synonymous
 * substitution -- and skipped (newBase: null) if none exists; positions
 * outside any CDS (or when no `cds` is given at all) are freely
 * substitutable, since there's no coding-sequence constraint to honor.
 *
 * @param {Object} opts
 * @param {string} opts.referenceSequence
 * @param {import("./guides.js").GuideCandidate} opts.guide
 * @param {"pam"|"seed"|"both"} opts.region
 * @param {CdsRange|null} [opts.cds]
 * @returns {BlockingMutation[]}
 */
export function designBlockingMutations({ referenceSequence, guide, region, cds }) {
  const positions = findBlockingMutationPositions(guide, region);

  return positions.map((position) => {
    const originalBase = referenceSequence[position];
    const synInfo = cds ? findSynonymousSubstitutions(referenceSequence, position, cds) : null;

    if (cds && synInfo) {
      // Inside the assigned CDS: constrained to a synonymous substitution.
      if (synInfo.synonymousBases.length === 0) {
        return {
          position,
          originalBase,
          newBase: null,
          synonymous: true,
          codon: synInfo.codon,
          aminoAcid: synInfo.aminoAcid,
          reason: `No synonymous codon for ${synInfo.aminoAcid} (${synInfo.codon}) differs at this position.`,
        };
      }
      const newBaseInCdsDir = synInfo.synonymousBases[0];
      const newBase = cds.strand === "+" ? newBaseInCdsDir : reverseComplement(newBaseInCdsDir);
      return {
        position,
        originalBase,
        newBase,
        synonymous: true,
        codon: synInfo.codon,
        aminoAcid: synInfo.aminoAcid,
      };
    }

    // No CDS assigned, or this position falls outside it: nothing
    // constrains the substitution, so any other base will do.
    const newBase = BASES.find((base) => base !== originalBase);
    return { position, originalBase, newBase, synonymous: null };
  });
}

/** Apply a list of BlockingMutations to a reference sequence, returning
 * a new string -- entries with newBase: null are left untouched. */
export function applyBlockingMutations(referenceSequence, mutations) {
  const chars = referenceSequence.split("");
  for (const mutation of mutations) {
    if (mutation.newBase) chars[mutation.position] = mutation.newBase;
  }
  return chars.join("");
}

/** Whether every position in `mutations` falls within [rttStart, rttEnd)
 * -- i.e. whether this guide's own RTT is actually long enough to reach
 * (and so actually write) the positions being mutated. A mutation the
 * RTT doesn't reach would exist in a locally-mutated reference but never
 * make it into the synthesized construct. */
export function mutationsWithinRtt(mutations, rttStart, rttEnd) {
  return mutations.every((m) => m.position >= rttStart && m.position < rttEnd);
}
