// Port of errpresso/pegrna_design.py -- pegRNA component assembly.

import { planWildTypeOverlap } from "./rttPlan.js";
import { designWildTypeRtts } from "./rttDesign.js";
import { designPairedPbs } from "./pbsDesign.js";

// Standard SpCas9 sgRNA scaffold (5' to 3' DNA), constant across every
// design -- there's no per-guide variation, so it lives here once.
export const SCAFFOLD_SEQUENCE =
  "GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC";

/**
 * One pegRNA's components. Sequences are 5' to 3' DNA.
 *
 * @typedef {Object} PegRNADesign
 * @property {GuideCandidate} guide
 * @property {string} rttSequence
 * @property {string} pbsSequence
 * @property {string} spacerSequence
 * @property {string} extensionSequence
 * @property {string} fullSequence -- spacer + scaffold + RTT + PBS
 * @property {string} spacerRna
 * @property {string} extensionRna
 * @property {string} fullRna
 * @property {number} rttLength
 * @property {number} pbsLength
 * @property {number} extensionLength
 * @property {number} fullLength
 */

export function makePegRnaDesign(guide, rttSequence, pbsSequence) {
  const extensionSequence = rttSequence + pbsSequence;
  const fullSequence = guide.spacer + SCAFFOLD_SEQUENCE + extensionSequence;

  return Object.freeze({
    guide,
    rttSequence,
    pbsSequence,
    spacerSequence: guide.spacer,
    extensionSequence,
    fullSequence,
    spacerRna: guide.spacer.replace(/T/g, "U"),
    extensionRna: extensionSequence.replace(/T/g, "U"),
    fullRna: fullSequence.replace(/T/g, "U"),
    rttLength: rttSequence.length,
    pbsLength: pbsSequence.length,
    extensionLength: extensionSequence.length,
    fullLength: fullSequence.length,
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
