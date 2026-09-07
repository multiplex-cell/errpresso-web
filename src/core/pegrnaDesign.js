// Port of errpresso/pegrna_design.py -- pegRNA component assembly.

import { planWildTypeOverlap } from "./rttPlan.js";
import { designWildTypeRtts } from "./rttDesign.js";
import { designPairedPbs } from "./pbsDesign.js";

/**
 * One pegRNA's components. Sequences are 5' to 3' DNA; no scaffold.
 *
 * @typedef {Object} PegRNADesign
 * @property {GuideCandidate} guide
 * @property {string} rttSequence
 * @property {string} pbsSequence
 * @property {string} spacerSequence
 * @property {string} extensionSequence
 * @property {string} spacerRna
 * @property {string} extensionRna
 * @property {number} rttLength
 * @property {number} pbsLength
 * @property {number} extensionLength
 */

export function makePegRnaDesign(guide, rttSequence, pbsSequence) {
  const extensionSequence = rttSequence + pbsSequence;

  return Object.freeze({
    guide,
    rttSequence,
    pbsSequence,
    spacerSequence: guide.spacer,
    extensionSequence,
    spacerRna: guide.spacer.replace(/T/g, "U"),
    extensionRna: extensionSequence.replace(/T/g, "U"),
    rttLength: rttSequence.length,
    pbsLength: pbsSequence.length,
    extensionLength: extensionSequence.length,
  });
}

/** Generate paired pegRNA components for a wild-type overlap. */
export function designPairedPegrnas(
  referenceSequence,
  pair,
  pbsLength,
  overlapLength,
  overlapStart = null
) {
  if (pair.leftGuide.strand !== "+") {
    throw new Error("The left guide must use the '+' strand.");
  }

  if (pair.rightGuide.strand !== "-") {
    throw new Error("The right guide must use the '-' strand.");
  }

  const plan = planWildTypeOverlap(pair, overlapLength, overlapStart);

  const rttDesign = designWildTypeRtts(referenceSequence, plan);
  const pbsDesign = designPairedPbs(referenceSequence, pair, pbsLength);

  const left = makePegRnaDesign(
    pair.leftGuide,
    rttDesign.leftRttSequence,
    pbsDesign.leftPbsSequence
  );
  const right = makePegRnaDesign(
    pair.rightGuide,
    rttDesign.rightRttSequence,
    pbsDesign.rightPbsSequence
  );

  return Object.freeze({
    referenceSequence: rttDesign.referenceSequence,
    pair,
    plan,
    left,
    right,
    overlapPlusStrand: rttDesign.overlapPlusStrand,
    overlapMinusStrand: rttDesign.overlapMinusStrand,
  });
}
