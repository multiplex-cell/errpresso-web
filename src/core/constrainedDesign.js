// Port of errpresso/constrained_design.py -- pairs ranked under RTT-size
// constraints, for a chosen target interval.

import { makePairCoverage } from "./coverage.js";
import { planWildTypeOverlap } from "./rttPlan.js";

/**
 * @typedef {Object} ConstrainedPairDesign
 * @property {PairCoverage} coverage
 * @property {RTTOverlapPlan} plan
 * @property {number} minimumAllowedRttLength
 * @property {number} preferredRttLength
 * @property {number} maximumAllowedRttLength
 * @property {number} overlapBias
 * @property {GuidePairCandidate} pair
 * @property {number} minimumRttLength
 * @property {number} maximumRttLength
 * @property {number} rttLengthDifference
 * @property {number} preferredRttDeviation
 */

function makeConstrainedDesign({
  coverage,
  plan,
  minimumAllowedRttLength,
  preferredRttLength,
  maximumAllowedRttLength,
  overlapBias,
}) {
  return Object.freeze({
    coverage,
    plan,
    minimumAllowedRttLength,
    preferredRttLength,
    maximumAllowedRttLength,
    overlapBias,
    pair: coverage.pair,
    minimumRttLength: Math.min(plan.leftRttLength, plan.rightRttLength),
    maximumRttLength: Math.max(plan.leftRttLength, plan.rightRttLength),
    rttLengthDifference: Math.abs(plan.leftRttLength - plan.rightRttLength),
    preferredRttDeviation:
      Math.abs(plan.leftRttLength - preferredRttLength) +
      Math.abs(plan.rightRttLength - preferredRttLength),
  });
}

/**
 * Choose an overlap position satisfying both RTT-length bounds.
 *
 * overlapBias: -1.0 shortest feasible left RTT, 0.0 balanced,
 * +1.0 shortest feasible right RTT.
 */
function chooseOverlapStart(
  pair,
  overlapLength,
  minimumRttLength,
  maximumRttLength,
  overlapBias
) {
  const leftNick = pair.leftGuide.nickPosition;
  const rightNick = pair.rightGuide.nickPosition;

  if (overlapLength > pair.nickDistance) {
    return null;
  }

  const earliestStart = Math.max(
    leftNick,
    leftNick + minimumRttLength - overlapLength,
    rightNick - maximumRttLength
  );

  const latestStart = Math.min(
    rightNick - overlapLength,
    leftNick + maximumRttLength - overlapLength,
    rightNick - minimumRttLength
  );

  if (earliestStart > latestStart) {
    return null;
  }

  const fraction = (overlapBias + 1.0) / 2.0;
  const chosenStart = Math.round(
    earliestStart + fraction * (latestStart - earliestStart)
  );

  return chosenStart;
}

/**
 * Rank pairs satisfying target and RTT-size constraints.
 *
 * Target coverage remains the primary ranking criterion; RTT-size
 * preference is used only after coverage criteria.
 */
export function rankPairsWithRttConstraints({
  pairs,
  targetStart,
  targetEnd,
  overlapLength,
  maximumRttLength,
  minimumRttLength = 1,
  preferredRttLength = null,
  overlapBias = 0.0,
  requireFullCoverage = false,
}) {
  if (targetStart < 0) {
    throw new Error("targetStart cannot be negative.");
  }
  if (targetEnd <= targetStart) {
    throw new Error("targetEnd must be greater than targetStart.");
  }
  if (overlapLength < 1) {
    throw new Error("overlapLength must be at least 1.");
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

  if (!(overlapBias >= -1.0 && overlapBias <= 1.0)) {
    throw new Error("overlapBias must be between -1.0 and 1.0.");
  }

  const designs = [];

  for (const pair of pairs) {
    const overlapStart = chooseOverlapStart(
      pair,
      overlapLength,
      minimumRttLength,
      maximumRttLength,
      overlapBias
    );

    if (overlapStart === null) continue;

    const plan = planWildTypeOverlap(pair, overlapLength, overlapStart);

    if (
      plan.leftRttLength < minimumRttLength ||
      plan.rightRttLength < minimumRttLength ||
      plan.leftRttLength > maximumRttLength ||
      plan.rightRttLength > maximumRttLength
    ) {
      continue;
    }

    const coverage = makePairCoverage(pair, targetStart, targetEnd);

    if (requireFullCoverage && !coverage.fullyCoversTarget) continue;

    designs.push(
      makeConstrainedDesign({
        coverage,
        plan,
        minimumAllowedRttLength: minimumRttLength,
        preferredRttLength: preferred,
        maximumAllowedRttLength: maximumRttLength,
        overlapBias,
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
      a.rttLengthDifference,
      a.coverage.centerOffset,
      a.pair.nickDistance,
    ];
    const bKey = [
      b.coverage.fullyCoversTarget ? 0 : 1,
      -b.coverage.coverageFraction,
      b.coverage.uncoveredLength,
      b.coverage.excessLength,
      b.preferredRttDeviation,
      b.rttLengthDifference,
      b.coverage.centerOffset,
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

  return designs;
}
