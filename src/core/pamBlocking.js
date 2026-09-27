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
 * @returns {{synonymousBases: string[], originalBase: string, codon: string, aminoAcid: string, posInCodon: number}|null}
 *   null if `pos` isn't inside the CDS. `posInCodon` (0, 1, or 2) is
 *   `pos`'s own position within `codon`, in the CDS's reading direction --
 *   what a caller needs to render or edit that specific base within it.
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

  return { synonymousBases, originalBase, codon: originalCodon, aminoAcid, posInCodon };
}

/** The two genomic positions of an NGG PAM whose identity actually
 * matters (the two G's) -- mutating the first, "N", position never
 * destroys the PAM, so it's never a candidate. */
function pamDisruptivePositions(guide) {
  return guide.strand === "+" ? [guide.pamStart + 1, guide.pamStart + 2] : [guide.pamStart, guide.pamStart + 1];
}

/** The PAM's middle base -- always genomic position pamStart+1, whichever
 * strand the guide is on (it's the middle of the 3-base PAM regardless of
 * reading direction). Mutating only this one, while the PAM's other G is
 * left untouched, is the one substitution that can leave behind "NAG" --
 * a real, if much weaker, non-canonical SpCas9 PAM -- rather than
 * something Cas9 no longer recognizes at all. */
function pamMiddlePosition(guide) {
  return guide.pamStart + 1;
}

/** The genomic base at the PAM's middle position that would leave Cas9
 * seeing "NAG" in its own reading direction (the guide reads the
 * complement strand when guide.strand is "-", so the base to avoid there
 * is T, whose complement is A). */
function pamMiddleAvoidBase(guide) {
  return guide.strand === "+" ? "A" : "T";
}

/** The PAM's other, far ("last") base -- genomic pamStart+2 for a '+'
 * guide, pamStart for a '-' guide. Whether *this* one still reads as 'G'
 * is what decides whether an 'A' at the middle position actually leaves
 * "NAG" behind, or something Cas9 no longer recognizes at all. */
function pamLastPosition(guide) {
  return guide.strand === "+" ? guide.pamStart + 2 : guide.pamStart;
}

/** The base Cas9 actually sees at a genomic position, in the guide's own
 * reading direction -- the complement of the genomic base when the guide
 * is on the '-' strand, since it reads that strand's complement. */
function guidePerceivedBase(guide, genomicBase) {
  return guide.strand === "+" ? genomicBase : reverseComplement(genomicBase);
}

/** `candidates` (bases already filtered to exclude the original), with
 * `avoidBase` moved to the end if it's present at all -- a preference,
 * never an exclusion: when it's the only option left, it's still used. */
function deprioritize(candidates, avoidBase) {
  if (avoidBase === null || !candidates.includes(avoidBase)) return candidates;
  return [...candidates.filter((base) => base !== avoidBase), avoidBase];
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
 * @property {string} [codon] -- original codon (CDS reading direction),
 *   only set when synonymous !== null
 * @property {string} [aminoAcid]
 * @property {number} [posInCodon] -- 0/1/2, `position`'s own place in
 *   `codon` -- only set alongside `codon`
 * @property {string} [mutatedCodon] -- `codon` with `posInCodon` replaced
 *   by the substitution actually made (CDS reading direction); only set
 *   when a substitution was actually made (newBase !== null) and CDS-
 *   constrained
 * @property {string} [reason] -- set only when newBase is null, explaining why
 * @property {boolean} [stillFormsNag] -- set true only on the PAM's middle-
 *   position entry when, after every mutation in this call is accounted
 *   for, the PAM still reads as "NAG" in the guide's own direction (its
 *   middle base ends up 'A' while its other G is left as 'G', usually
 *   because a CDS forced both outcomes) -- a real, if much weaker,
 *   non-canonical SpCas9 PAM, not a fully broken one
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
  const middlePosition = pamMiddlePosition(guide);

  const results = positions.map((position) => {
    const originalBase = referenceSequence[position];
    const synInfo = cds ? findSynonymousSubstitutions(referenceSequence, position, cds) : null;
    // Only the PAM's middle base risks leaving "NAG" behind, and only in
    // genomic terms -- convert to the CDS's own reading direction below
    // before comparing against synInfo's (CDS-direction) candidate bases.
    const avoidBase = position === middlePosition ? pamMiddleAvoidBase(guide) : null;

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
          posInCodon: synInfo.posInCodon,
          reason: `No synonymous codon for ${synInfo.aminoAcid} (${synInfo.codon}) differs at this position.`,
        };
      }
      const avoidBaseInCdsDir = avoidBase && (cds.strand === "+" ? avoidBase : reverseComplement(avoidBase));
      const orderedBases = deprioritize(synInfo.synonymousBases, avoidBaseInCdsDir);
      const newBaseInCdsDir = orderedBases[0];
      const newBase = cds.strand === "+" ? newBaseInCdsDir : reverseComplement(newBaseInCdsDir);
      const mutatedCodon =
        synInfo.codon.slice(0, synInfo.posInCodon) + newBaseInCdsDir + synInfo.codon.slice(synInfo.posInCodon + 1);
      return {
        position,
        originalBase,
        newBase,
        synonymous: true,
        codon: synInfo.codon,
        aminoAcid: synInfo.aminoAcid,
        posInCodon: synInfo.posInCodon,
        mutatedCodon,
      };
    }

    // No CDS assigned, or this position falls outside it: nothing
    // constrains the substitution, so any other base will do.
    const orderedBases = deprioritize(
      BASES.filter((base) => base !== originalBase),
      avoidBase
    );
    const newBase = orderedBases[0];
    return { position, originalBase, newBase, synonymous: null };
  });

  // Whether both PAM bases were even candidates depends on `region`; the
  // residual-NAG check only makes sense when both were in play.
  if (region === "pam" || region === "both") {
    const finalBaseAt = (position) => {
      const entry = results.find((m) => m.position === position);
      return entry ? entry.newBase ?? entry.originalBase : referenceSequence[position];
    };
    const middleEntry = results.find((m) => m.position === middlePosition);
    const perceivedMiddle = guidePerceivedBase(guide, finalBaseAt(middlePosition));
    const perceivedLast = guidePerceivedBase(guide, finalBaseAt(pamLastPosition(guide)));
    if (middleEntry && perceivedMiddle === "A" && perceivedLast === "G") {
      middleEntry.stillFormsNag = true;
    }
  }

  return results;
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

/** All positions of `region`, in the guide's own 5'->3' reading direction
 * (always contiguous for "both": the seed runs directly into the PAM) --
 * unlike findBlockingMutationPositions, this includes the PAM's own "N",
 * which is never a mutation candidate but still part of the region a
 * viewer would want to see. */
function regionPositionsInReadingOrder(guide, region) {
  const seedReading =
    guide.strand === "+"
      ? [guide.nickPosition, guide.nickPosition + 1, guide.nickPosition + 2]
      : [guide.nickPosition - 1, guide.nickPosition - 2, guide.nickPosition - 3];
  const pamReading =
    guide.strand === "+"
      ? [guide.pamStart, guide.pamStart + 1, guide.pamStart + 2]
      : [guide.pamStart + 2, guide.pamStart + 1, guide.pamStart];

  const withLabel = (positions, regionLabel) => positions.map((position) => ({ position, regionLabel }));
  if (region === "seed") return withLabel(seedReading, "seed");
  if (region === "pam") return withLabel(pamReading, "pam");
  return [...withLabel(seedReading, "seed"), ...withLabel(pamReading, "pam")];
}

/**
 * @typedef {Object} RegionDisplayEntry
 * @property {number} position
 * @property {"seed"|"pam"} regionLabel
 * @property {boolean} isCandidate -- false only for the PAM's own "N",
 *   which is never a mutation candidate but still shown for context
 * @property {string} originalBase
 * @property {string|null} newBase
 * @property {boolean|null} synonymous
 * @property {string} [codon] -- CDS reading direction, if a CDS applies here
 * @property {string} [aminoAcid]
 * @property {number} [posInCodon]
 * @property {string} [mutatedCodon]
 * @property {string} [reason]
 */

/**
 * The whole `region`, position by position, in the guide's own reading
 * direction -- for rendering a contiguous seed/PAM track rather than only
 * the sparse set of positions blocking-mutation design actually acts on.
 * Candidate positions carry exactly what designBlockingMutations computed
 * for them; the PAM's own "N" (never a candidate) still carries its
 * reference base and, if a CDS applies there, codon/amino-acid context --
 * purely for display continuity, never a proposed substitution.
 *
 * @param {Object} opts
 * @param {string} opts.referenceSequence
 * @param {import("./guides.js").GuideCandidate} opts.guide
 * @param {"pam"|"seed"|"both"} opts.region
 * @param {CdsRange|null} [opts.cds]
 * @returns {RegionDisplayEntry[]}
 */
export function describeRegionForDisplay({ referenceSequence, guide, region, cds }) {
  const candidatePositions = new Set(findBlockingMutationPositions(guide, region));
  const mutationsByPosition = new Map(
    designBlockingMutations({ referenceSequence, guide, region, cds }).map((m) => [m.position, m])
  );

  return regionPositionsInReadingOrder(guide, region).map(({ position, regionLabel }) => {
    if (candidatePositions.has(position)) {
      return { ...mutationsByPosition.get(position), regionLabel, isCandidate: true };
    }

    const originalBase = referenceSequence[position];
    const synInfo = cds ? findSynonymousSubstitutions(referenceSequence, position, cds) : null;
    return {
      position,
      regionLabel,
      isCandidate: false,
      originalBase,
      newBase: null,
      synonymous: null,
      ...(synInfo ? { codon: synInfo.codon, aminoAcid: synInfo.aminoAcid, posInCodon: synInfo.posInCodon } : {}),
    };
  });
}

/** Whether every position in `mutations` falls within [rttStart, rttEnd)
 * -- i.e. whether this guide's own RTT is actually long enough to reach
 * (and so actually write) the positions being mutated. A mutation the
 * RTT doesn't reach would exist in a locally-mutated reference but never
 * make it into the synthesized construct. */
export function mutationsWithinRtt(mutations, rttStart, rttEnd) {
  return mutations.every((m) => m.position >= rttStart && m.position < rttEnd);
}
