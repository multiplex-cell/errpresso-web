// Port of errpresso/single_synergy.py -- joint coverage set selection for
// standalone single guides.

import { mergeIntervals, intervalsLength } from "./intervals.js";
import { guideEditInterval } from "./singlePegrna.js";

function targetInterval(design, targetStart, targetEnd) {
  const [start, end] = guideEditInterval(design.guide, design.rttLength);
  return [Math.max(targetStart, start), Math.min(targetEnd, end)];
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
 * Select single guides that jointly maximize target coverage.
 *
 * Single-pegRNA counterpart of synergy.selectSynergisticDesigns -- same
 * greedy, marginal-gain algorithm and forceMaximumDesigns behavior,
 * applied to individual guide RTT footprints instead of paired nick
 * intervals.
 */
export function selectSynergisticSingleDesigns({
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
        design.rttLength,
        design.coverage.centerOffset,
        design.guide.spacer,
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
