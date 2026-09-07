// Port of errpresso/rtt_plan.py -- reference-coordinate plan for two
// overlapping RTT products.

/**
 * @typedef {Object} RTTOverlapPlan
 * @property {GuidePairCandidate} pair
 * @property {number} overlapStart
 * @property {number} overlapEnd
 * @property {number} leftRttStart
 * @property {number} leftRttEnd
 * @property {number} rightRttStart
 * @property {number} rightRttEnd
 * @property {number} overlapLength
 * @property {number} leftRttLength
 * @property {number} rightRttLength
 */

function makePlan(pair, overlapStart, overlapEnd) {
  const leftRttStart = pair.leftGuide.nickPosition;
  const leftRttEnd = overlapEnd;
  const rightRttStart = overlapStart;
  const rightRttEnd = pair.rightGuide.nickPosition;

  return Object.freeze({
    pair,
    overlapStart,
    overlapEnd,
    leftRttStart,
    leftRttEnd,
    rightRttStart,
    rightRttEnd,
    overlapLength: overlapEnd - overlapStart,
    leftRttLength: leftRttEnd - leftRttStart,
    rightRttLength: rightRttEnd - rightRttStart,
  });
}

/**
 * Plan two inward-growing RTT reference intervals.
 *
 * The left RTT covers: left nick -> overlap end
 * The right RTT covers: overlap start -> right nick
 *
 * When overlapStart is omitted, the overlap is centered between the two
 * nick sites.
 */
export function planWildTypeOverlap(pair, overlapLength, overlapStart = null) {
  const leftNick = pair.leftGuide.nickPosition;
  const rightNick = pair.rightGuide.nickPosition;
  const nickDistance = rightNick - leftNick;

  if (nickDistance < 1) {
    throw new Error(
      "The guide pair must have the left nick before the right nick."
    );
  }

  if (overlapLength < 1) {
    throw new Error("overlapLength must be at least 1.");
  }

  if (overlapLength > nickDistance) {
    throw new Error(
      "overlap_length cannot exceed the distance between nick sites."
    );
  }

  let start = overlapStart;

  if (start === null || start === undefined) {
    const unusedLength = nickDistance - overlapLength;
    start = leftNick + Math.floor(unusedLength / 2);
  }

  const end = start + overlapLength;

  if (start < leftNick) {
    throw new Error("overlapStart cannot be before the left nick site.");
  }

  if (end > rightNick) {
    throw new Error("The overlap cannot extend beyond the right nick site.");
  }

  return makePlan(pair, start, end);
}
