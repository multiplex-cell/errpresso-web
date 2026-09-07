// Port of errpresso/single_pegrna.py -- standalone (non-paired) pegRNA
// design and coverage ranking for individual guides.

import { reverseComplement } from "./guides.js";
import { SequenceParseError } from "./sequenceIo.js";
import { makePegRnaDesign } from "./pegrnaDesign.js";

const ALLOWED_BASES = new Set(["A", "C", "G", "T", "N"]);

function normalizeReference(sequence) {
  const normalized = sequence.replace(/\s+/g, "").toUpperCase();

  if (!normalized) {
    throw new SequenceParseError("The reference sequence is empty.");
  }

  const invalid = [...new Set(normalized)]
    .filter((base) => !ALLOWED_BASES.has(base))
    .sort();

  if (invalid.length > 0) {
    throw new SequenceParseError(
      `Invalid DNA character(s): ${invalid.join(", ")}. ` +
        "Only A, C, G, T, and N are allowed."
    );
  }

  return normalized;
}

/**
 * Return the reference interval one guide's RTT would cover.
 *
 * A '+' guide nicks the plus strand and synthesizes forward from the
 * nick, covering [nick, nick + rttLength). A '-' guide synthesizes
 * backward, covering [nick - rttLength, nick).
 */
export function guideEditInterval(guide, rttLength) {
  const nick = guide.nickPosition;

  if (guide.strand === "+") {
    return [nick, nick + rttLength];
  }
  return [nick - rttLength, nick];
}

/**
 * @typedef {Object} SingleGuideCoverage
 * @property {GuideCandidate} guide
 * @property {number} rttLength
 * @property {number} targetStart
 * @property {number} targetEnd
 */

export function makeSingleGuideCoverage(guide, rttLength, targetStart, targetEnd) {
  const [guideIntervalStart, guideIntervalEnd] = guideEditInterval(
    guide,
    rttLength
  );
  const targetLength = targetEnd - targetStart;
  const coveredStart = Math.max(targetStart, guideIntervalStart);
  const coveredEnd = Math.min(targetEnd, guideIntervalEnd);
  const coveredLength = Math.max(0, coveredEnd - coveredStart);
  const excessLeft = Math.max(0, targetStart - guideIntervalStart);
  const excessRight = Math.max(0, guideIntervalEnd - targetEnd);
  const guideCenter = (guideIntervalStart + guideIntervalEnd) / 2;
  const targetCenter = (targetStart + targetEnd) / 2;

  return Object.freeze({
    guide,
    rttLength,
    targetStart,
    targetEnd,
    guideIntervalStart,
    guideIntervalEnd,
    targetLength,
    coveredStart,
    coveredEnd,
    coveredLength,
    uncoveredLength: targetLength - coveredLength,
    coverageFraction: coveredLength / targetLength,
    coveragePercent: (coveredLength / targetLength) * 100.0,
    fullyCoversTarget:
      guideIntervalStart <= targetStart && guideIntervalEnd >= targetEnd,
    excessLeft,
    excessRight,
    excessLength: excessLeft + excessRight,
    centerOffset: Math.abs(guideCenter - targetCenter),
  });
}

/**
 * @typedef {Object} ConstrainedSingleDesign
 * @property {SingleGuideCoverage} coverage
 * @property {number} minimumAllowedRttLength
 * @property {number} preferredRttLength
 * @property {number} maximumAllowedRttLength
 * @property {GuideCandidate} guide
 * @property {number} rttLength
 * @property {number} preferredRttDeviation
 */

export function makeConstrainedSingleDesign({
  coverage,
  minimumAllowedRttLength,
  preferredRttLength,
  maximumAllowedRttLength,
}) {
  return Object.freeze({
    coverage,
    minimumAllowedRttLength,
    preferredRttLength,
    maximumAllowedRttLength,
    guide: coverage.guide,
    rttLength: coverage.rttLength,
    preferredRttDeviation: Math.abs(coverage.rttLength - preferredRttLength),
  });
}

/**
 * Choose the longest feasible RTT length, capped at the preferred size.
 *
 * A guide near either edge of the reference sequence may not have enough
 * reference sequence in its synthesis direction to reach the preferred
 * length -- the RTT shrinks toward minimumRttLength, and the guide is
 * infeasible only if even the minimum doesn't fit.
 */
function chooseSingleRttLength(
  guide,
  referenceLength,
  minimumRttLength,
  preferredRttLength,
  maximumRttLength
) {
  const nick = guide.nickPosition;
  const available = guide.strand === "+" ? referenceLength - nick : nick;
  const feasibleMax = Math.min(maximumRttLength, available);

  if (feasibleMax < minimumRttLength) return null;

  return Math.min(preferredRttLength, feasibleMax);
}

/**
 * Rank single guides satisfying target and RTT-size constraints.
 *
 * Target coverage remains the primary ranking criterion; RTT-size
 * preference is used only after coverage criteria.
 */
export function rankSingleGuidesWithRttConstraints({
  guides,
  targetStart,
  targetEnd,
  referenceLength,
  maximumRttLength,
  minimumRttLength = 1,
  preferredRttLength = null,
  requireFullCoverage = false,
}) {
  if (targetStart < 0) {
    throw new Error("targetStart cannot be negative.");
  }
  if (targetEnd <= targetStart) {
    throw new Error("targetEnd must be greater than targetStart.");
  }
  if (minimumRttLength < 1) {
    throw new Error("minimumRttLength must be at least 1.");
  }
  if (maximumRttLength < minimumRttLength) {
    throw new Error(
      "maximumRttLength must be greater than or equal to minimumRttLength."
    );
  }

  let preferred = preferredRttLength;
  if (preferred === null || preferred === undefined) {
    preferred = Math.floor((minimumRttLength + maximumRttLength) / 2);
  }

  if (!(minimumRttLength <= preferred && preferred <= maximumRttLength)) {
    throw new Error(
      "preferredRttLength must fall inside the allowed RTT-length range."
    );
  }

  const designs = [];

  for (const guide of guides) {
    const rttLength = chooseSingleRttLength(
      guide,
      referenceLength,
      minimumRttLength,
      preferred,
      maximumRttLength
    );

    if (rttLength === null) continue;

    const coverage = makeSingleGuideCoverage(
      guide,
      rttLength,
      targetStart,
      targetEnd
    );

    if (requireFullCoverage && !coverage.fullyCoversTarget) continue;

    designs.push(
      makeConstrainedSingleDesign({
        coverage,
        minimumAllowedRttLength: minimumRttLength,
        preferredRttLength: preferred,
        maximumAllowedRttLength: maximumRttLength,
      })
    );
  }

  designs.sort((a, b) => {
    const aKey = [
      a.coverage.fullyCoversTarget ? 0 : 1,
      -a.coverage.coverageFraction,
      a.coverage.uncoveredLength,
      a.coverage.excessLength,
      a.preferredRttDeviation,
      a.coverage.centerOffset,
      a.rttLength,
    ];
    const bKey = [
      b.coverage.fullyCoversTarget ? 0 : 1,
      -b.coverage.coverageFraction,
      b.coverage.uncoveredLength,
      b.coverage.excessLength,
      b.preferredRttDeviation,
      b.coverage.centerOffset,
      b.rttLength,
    ];

    for (let i = 0; i < aKey.length; i++) {
      if (aKey[i] !== bKey[i]) return aKey[i] - bKey[i];
    }

    if (a.guide.spacer !== b.guide.spacer) {
      return a.guide.spacer < b.guide.spacer ? -1 : 1;
    }
    return 0;
  });

  return designs;
}

/**
 * Generate a standalone (non-paired) pegRNA for one guide.
 *
 * The RTT is synthesized from the nick in the guide's own editing
 * direction; the PBS sits on the opposite side of the nick, mirroring
 * the paired design's PBS convention for a guide on the same strand.
 */
export function designSinglePegrna(referenceSequence, guide, rttLength, pbsLength) {
  const reference = normalizeReference(referenceSequence);

  if (rttLength < 1) {
    throw new Error("rttLength must be at least 1.");
  }
  if (pbsLength < 1) {
    throw new Error("pbsLength must be at least 1.");
  }

  const nick = guide.nickPosition;
  let rttSequence;
  let pbsSequence;

  if (guide.strand === "+") {
    if (nick + rttLength > reference.length) {
      throw new Error(
        "Not enough reference sequence after the nick " +
          "for the requested RTT length."
      );
    }
    if (nick - pbsLength < 0) {
      throw new Error(
        "Not enough reference sequence before the nick " +
          "for the requested PBS length."
      );
    }

    rttSequence = reverseComplement(reference.slice(nick, nick + rttLength));
    pbsSequence = reverseComplement(reference.slice(nick - pbsLength, nick));
  } else {
    if (nick - rttLength < 0) {
      throw new Error(
        "Not enough reference sequence before the nick " +
          "for the requested RTT length."
      );
    }
    if (nick + pbsLength > reference.length) {
      throw new Error(
        "Not enough reference sequence after the nick " +
          "for the requested PBS length."
      );
    }

    rttSequence = reference.slice(nick - rttLength, nick);
    pbsSequence = reference.slice(nick, nick + pbsLength);
  }

  return makePegRnaDesign(guide, rttSequence, pbsSequence);
}
