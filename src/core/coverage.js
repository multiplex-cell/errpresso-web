// Port of errpresso/coverage.py -- target coverage by a guide pair.

/**
 * @typedef {Object} PairCoverage
 * @property {GuidePairCandidate} pair
 * @property {number} targetStart
 * @property {number} targetEnd
 */

export function makePairCoverage(pair, targetStart, targetEnd) {
  const targetLength = targetEnd - targetStart;
  const coveredStart = Math.max(targetStart, pair.betweenNicksStart);
  const coveredEnd = Math.min(targetEnd, pair.betweenNicksEnd);
  const coveredLength = Math.max(0, coveredEnd - coveredStart);
  const excessLeft = Math.max(0, targetStart - pair.betweenNicksStart);
  const excessRight = Math.max(0, pair.betweenNicksEnd - targetEnd);
  const pairCenter = (pair.betweenNicksStart + pair.betweenNicksEnd) / 2;
  const targetCenter = (targetStart + targetEnd) / 2;

  return Object.freeze({
    pair,
    targetStart,
    targetEnd,
    targetLength,
    coveredStart,
    coveredEnd,
    coveredLength,
    uncoveredLength: targetLength - coveredLength,
    coverageFraction: coveredLength / targetLength,
    coveragePercent: (coveredLength / targetLength) * 100.0,
    fullyCoversTarget:
      pair.betweenNicksStart <= targetStart &&
      pair.betweenNicksEnd >= targetEnd,
    excessLeft,
    excessRight,
    excessLength: excessLeft + excessRight,
    centerOffset: Math.abs(pairCenter - targetCenter),
  });
}

/**
 * Rank guide pairs for coverage of a target reference interval.
 *
 * Ranking priorities: full coverage, greater coverage fraction, less
 * uncovered sequence, less excess sequence, better centering, shorter
 * nick distance.
 */
export function rankPairsForRegion(
  pairs,
  targetStart,
  targetEnd,
  requireFullCoverage = false
) {
  if (targetStart < 0) {
    throw new Error("targetStart cannot be negative.");
  }
  if (targetEnd <= targetStart) {
    throw new Error("targetEnd must be greater than targetStart.");
  }

  let evaluations = [...pairs].map((pair) =>
    makePairCoverage(pair, targetStart, targetEnd)
  );

  if (requireFullCoverage) {
    evaluations = evaluations.filter((e) => e.fullyCoversTarget);
  }

  evaluations.sort((a, b) => {
    const aKey = [
      a.fullyCoversTarget ? 0 : 1,
      -a.coverageFraction,
      a.uncoveredLength,
      a.excessLength,
      a.centerOffset,
      a.pair.nickDistance,
    ];
    const bKey = [
      b.fullyCoversTarget ? 0 : 1,
      -b.coverageFraction,
      b.uncoveredLength,
      b.excessLength,
      b.centerOffset,
      b.pair.nickDistance,
    ];

    for (let i = 0; i < aKey.length; i++) {
      if (aKey[i] !== bKey[i]) return aKey[i] - bKey[i];
    }

    if (a.pair.leftGuide.spacer !== b.pair.leftGuide.spacer) {
      return a.pair.leftGuide.spacer < b.pair.leftGuide.spacer ? -1 : 1;
    }
    if (a.pair.rightGuide.spacer !== b.pair.rightGuide.spacer) {
      return a.pair.rightGuide.spacer < b.pair.rightGuide.spacer ? -1 : 1;
    }
    return 0;
  });

  return evaluations;
}
