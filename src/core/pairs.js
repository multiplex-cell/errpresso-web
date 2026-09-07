// Port of errpresso/pairs.py -- inward-facing guide pairing.

/**
 * @typedef {Object} GuidePairCandidate
 * @property {GuideCandidate} leftGuide
 * @property {GuideCandidate} rightGuide
 * @property {number} nickDistance
 * @property {number} betweenNicksStart
 * @property {number} betweenNicksEnd
 */

export function makePair(leftGuide, rightGuide) {
  return Object.freeze({
    leftGuide,
    rightGuide,
    nickDistance: rightGuide.nickPosition - leftGuide.nickPosition,
    betweenNicksStart: leftGuide.nickPosition,
    betweenNicksEnd: rightGuide.nickPosition,
  });
}

/**
 * Pair forward and reverse guides whose nick sites face inward.
 *
 * A valid pair has a forward-strand guide on the left, a reverse-strand
 * guide on the right, and left nick position smaller than right nick
 * position.
 */
export function findInwardFacingPairs(
  guides,
  minNickDistance = 1,
  maxNickDistance = null
) {
  if (minNickDistance < 1) {
    throw new Error("minNickDistance must be at least 1.");
  }

  if (maxNickDistance !== null && maxNickDistance < minNickDistance) {
    throw new Error(
      "maxNickDistance must be greater than or equal to minNickDistance."
    );
  }

  const guideList = [...guides];
  const pairs = [];

  const forwardGuides = guideList.filter((guide) => guide.strand === "+");
  const reverseGuides = guideList.filter((guide) => guide.strand === "-");

  for (const leftGuide of forwardGuides) {
    for (const rightGuide of reverseGuides) {
      const distance = rightGuide.nickPosition - leftGuide.nickPosition;

      if (distance < minNickDistance) continue;
      if (maxNickDistance !== null && distance > maxNickDistance) continue;

      pairs.push(makePair(leftGuide, rightGuide));
    }
  }

  pairs.sort((a, b) => {
    if (a.leftGuide.nickPosition !== b.leftGuide.nickPosition) {
      return a.leftGuide.nickPosition - b.leftGuide.nickPosition;
    }
    if (a.rightGuide.nickPosition !== b.rightGuide.nickPosition) {
      return a.rightGuide.nickPosition - b.rightGuide.nickPosition;
    }
    if (a.leftGuide.spacer !== b.leftGuide.spacer) {
      return a.leftGuide.spacer < b.leftGuide.spacer ? -1 : 1;
    }
    if (a.rightGuide.spacer !== b.rightGuide.spacer) {
      return a.rightGuide.spacer < b.rightGuide.spacer ? -1 : 1;
    }
    return 0;
  });

  return pairs;
}
