// Port of errpresso/guides.py -- SpCas9 NGG guide discovery.
//
// Coordinates are zero-based, half-open intervals relative to the supplied
// reference sequence, matching the Python implementation exactly.

import { SequenceParseError } from "./sequenceIo.js";

const DNA_BASES = new Set(["A", "C", "G", "T", "N"]);
const CANONICAL_BASES = new Set(["A", "C", "G", "T"]);

const COMPLEMENT = { A: "T", C: "G", G: "C", T: "A", N: "N" };

/**
 * One SpCas9 guide candidate mapped to the reference sequence.
 *
 * @typedef {Object} GuideCandidate
 * @property {string} spacer
 * @property {string} pam
 * @property {"+"|"-"} strand
 * @property {number} protospacerStart
 * @property {number} protospacerEnd
 * @property {number} pamStart
 * @property {number} pamEnd
 * @property {number} nickPosition -- zero-based nick boundary
 */

/** Return the reverse complement of a DNA sequence. */
export function reverseComplement(sequence) {
  let result = "";
  const upper = sequence.toUpperCase();
  for (let i = upper.length - 1; i >= 0; i--) {
    result += COMPLEMENT[upper[i]] ?? "N";
  }
  return result;
}

/** Return the zero-based nick boundary for a guide candidate. */
function nickPosition(guide) {
  if (guide.strand === "+") {
    return guide.pamStart - 3;
  }
  return guide.pamEnd + 3;
}

function makeGuide(fields) {
  const guide = { ...fields };
  guide.nickPosition = nickPosition(guide);
  return Object.freeze(guide);
}

function normalizeDna(sequence) {
  const normalized = sequence.replace(/\s+/g, "").toUpperCase();

  if (!normalized) {
    throw new SequenceParseError("The DNA sequence is empty.");
  }

  const invalid = [...new Set(normalized)]
    .filter((base) => !DNA_BASES.has(base))
    .sort();

  if (invalid.length > 0) {
    throw new SequenceParseError(
      `Invalid DNA character(s): ${invalid.join(", ")}. ` +
        "Only A, C, G, T, and N are allowed."
    );
  }

  return normalized;
}

function isCanonical(text) {
  for (const base of text) {
    if (!CANONICAL_BASES.has(base)) return false;
  }
  return true;
}

/**
 * Find 20-nt SpCas9 guide candidates with NGG PAMs on both strands.
 *
 * Forward-strand pattern:  5'-[20-nt spacer][NGG]-3'
 * Reverse-strand pattern on the reference: 5'-[CCN][20-nt protospacer]-3'
 *
 * Candidates containing ambiguous N bases are skipped.
 */
export function findSpCas9Guides(sequence) {
  const reference = normalizeDna(sequence);
  const candidates = [];

  if (reference.length < 23) {
    return candidates;
  }

  for (let start = 0; start <= reference.length - 23; start++) {
    const window = reference.slice(start, start + 23);

    const forwardSpacer = window.slice(0, 20);
    const forwardPam = window.slice(20, 23);

    if (
      isCanonical(forwardSpacer) &&
      CANONICAL_BASES.has(forwardPam[0]) &&
      forwardPam.slice(1) === "GG"
    ) {
      candidates.push(
        makeGuide({
          spacer: forwardSpacer,
          pam: forwardPam,
          strand: "+",
          protospacerStart: start,
          protospacerEnd: start + 20,
          pamStart: start + 20,
          pamEnd: start + 23,
        })
      );
    }

    const reversePamReference = window.slice(0, 3);
    const reverseProtospacerReference = window.slice(3, 23);

    if (
      reversePamReference.slice(0, 2) === "CC" &&
      CANONICAL_BASES.has(reversePamReference[2]) &&
      isCanonical(reverseProtospacerReference)
    ) {
      candidates.push(
        makeGuide({
          spacer: reverseComplement(reverseProtospacerReference),
          pam: reverseComplement(reversePamReference),
          strand: "-",
          protospacerStart: start + 3,
          protospacerEnd: start + 23,
          pamStart: start,
          pamEnd: start + 3,
        })
      );
    }
  }

  candidates.sort((a, b) => {
    if (a.protospacerStart !== b.protospacerStart) {
      return a.protospacerStart - b.protospacerStart;
    }
    // '+' sorts before '-', matching the Python `strand != "+"` key.
    const aRank = a.strand === "+" ? 0 : 1;
    const bRank = b.strand === "+" ? 0 : 1;
    return aRank - bRank;
  });

  return candidates;
}
