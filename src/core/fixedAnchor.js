// Port of errpresso/fixed_anchor.py -- Fixed guide, variable RTT mode.

import { makePair } from "./pairs.js";

/**
 * Find every inward-facing pair containing one fixed guide.
 *
 * For a '+' fixed guide, compatible '-' guides must lie to its right.
 * For a '-' fixed guide, compatible '+' guides must lie to its left.
 * Results are sorted by increasing nick distance.
 */
export function findPairsForFixedGuide(guides, fixedGuide) {
  const guideList = [...guides];
  const pairs = [];

  if (fixedGuide.strand === "+") {
    for (const partner of guideList) {
      if (partner.strand !== "-") continue;
      if (partner.nickPosition <= fixedGuide.nickPosition) continue;
      pairs.push(makePair(fixedGuide, partner));
    }
  } else {
    for (const partner of guideList) {
      if (partner.strand !== "+") continue;
      if (partner.nickPosition >= fixedGuide.nickPosition) continue;
      pairs.push(makePair(partner, fixedGuide));
    }
  }

  pairs.sort((a, b) => {
    if (a.nickDistance !== b.nickDistance) return a.nickDistance - b.nickDistance;
    if (a.leftGuide.nickPosition !== b.leftGuide.nickPosition) {
      return a.leftGuide.nickPosition - b.leftGuide.nickPosition;
    }
    return a.rightGuide.nickPosition - b.rightGuide.nickPosition;
  });

  return pairs;
}

/**
 * Select pairs spread across the complete available distance range.
 *
 * The shortest and longest compatible pairs are retained when at least
 * two pairs are requested.
 */
export function selectSpanningPairs(pairs, maximumPairs) {
  if (maximumPairs < 1) {
    throw new Error("maximumPairs must be at least 1.");
  }

  const pairList = [...pairs].sort((a, b) => a.nickDistance - b.nickDistance);

  if (pairList.length <= maximumPairs) {
    return pairList;
  }

  if (maximumPairs === 1) {
    return [pairList[pairList.length - 1]];
  }

  const selectedIndices = new Set();
  for (let index = 0; index < maximumPairs; index++) {
    selectedIndices.add(
      Math.round((index * (pairList.length - 1)) / (maximumPairs - 1))
    );
  }

  return [...selectedIndices].sort((a, b) => a - b).map((i) => pairList[i]);
}
