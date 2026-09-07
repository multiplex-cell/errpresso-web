// Port of errpresso/synergy.py -- joint coverage set selection for pairs.

import { mergeIntervals, intervalsLength } from "./intervals.js";

/**
 * @typedef {Object} SynergisticPairSelection
 * @property {ConstrainedPairDesign} design
 * @property {number} marginalCoveredLength
 * @property {number} cumulativeCoveredLength
 * @property {number} cumulativeCoveragePercent
 */

function targetInterval(design, targetStart, targetEnd) {
  return [
    Math.max(targetStart, design.pair.betweenNicksStart),
    Math.min(targetEnd, design.pair.betweenNicksEnd),
  ];
}

function compareScores(a, b) {
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) continue;
    if (typeof av === "string") return av < bv ? -1 : 1;
    return av - bv;
  }
  return 0;
}

/**
 * Select designs that jointly maximize target coverage.
 *
 * At every step, choose the design adding the greatest number of
 * previously uncovered target bases. Tie-breaking: greater individual
 * coverage, less excess sequence, shorter maximum RTT, better RTT-length
 * balance, better centering.
 *
 * By default, selection stops as soon as a design would add no new
 * target coverage (or once the target is fully covered). forceMaximumDesigns
 * disables both early stops, filling remaining slots with the best
 * available backup designs by the same tie-break order.
 */
export function selectSynergisticDesigns({
  designs,
  targetStart,
  targetEnd,
  maximumDesigns = 5,
  forceMaximumDesigns = false,
}) {
  if (targetStart < 0) {
    throw new Error("targetStart cannot be negative.");
  }
  if (targetEnd <= targetStart) {
    throw new Error("targetEnd must be greater than targetStart.");
  }
  if (maximumDesigns < 1) {
    throw new Error("maximumDesigns must be at least 1.");
  }

  const available = [...designs];
  const selected = [];
  let coveredIntervals = [];

  const targetLength = targetEnd - targetStart;
  let currentCoveredLength = 0;

  while (available.length > 0 && selected.length < maximumDesigns) {
    let best = null;

    for (let index = 0; index < available.length; index++) {
      const design = available[index];
      const candidateInterval = targetInterval(design, targetStart, targetEnd);

      const newCoveredLength = intervalsLength([
        ...coveredIntervals,
        candidateInterval,
      ]);
      const marginalCoveredLength = newCoveredLength - currentCoveredLength;

      const score = [
        -marginalCoveredLength,
        -design.coverage.coveredLength,
        design.coverage.excessLength,
        design.maximumRttLength,
        design.rttLengthDifference,
        design.coverage.centerOffset,
        design.pair.leftGuide.spacer,
        design.pair.rightGuide.spacer,
      ];

      if (best === null || compareScores(score, best.score) < 0) {
        best = { score, index, candidateInterval, marginalCoveredLength };
      }
    }

    const { index: selectedIndex, candidateInterval: selectedInterval, marginalCoveredLength } =
      best;

    if (marginalCoveredLength <= 0 && !forceMaximumDesigns) {
      break;
    }

    const [design] = available.splice(selectedIndex, 1);
    coveredIntervals = mergeIntervals([...coveredIntervals, selectedInterval]);
    currentCoveredLength += marginalCoveredLength;

    selected.push(
      Object.freeze({
        design,
        marginalCoveredLength,
        cumulativeCoveredLength: currentCoveredLength,
        cumulativeCoveragePercent: (currentCoveredLength / targetLength) * 100.0,
      })
    );

    if (currentCoveredLength === targetLength && !forceMaximumDesigns) {
      break;
    }
  }

  return selected;
}
