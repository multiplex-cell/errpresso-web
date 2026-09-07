// Port of errpresso/rtt_design.py -- wild-type RTT sequence derivation.

import { reverseComplement } from "./guides.js";
import { SequenceParseError } from "./sequenceIo.js";

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
 * Generate strand-oriented RTT sequences from an overlap plan.
 *
 * @returns {{referenceSequence: string, plan: RTTOverlapPlan,
 *   leftRttSequence: string, rightRttSequence: string,
 *   leftSynthesizedDna: string, rightSynthesizedDna: string,
 *   overlapPlusStrand: string, overlapMinusStrand: string}}
 */
export function designWildTypeRtts(referenceSequence, plan) {
  const reference = normalizeReference(referenceSequence);

  const coordinates = [
    plan.leftRttStart,
    plan.leftRttEnd,
    plan.rightRttStart,
    plan.rightRttEnd,
    plan.overlapStart,
    plan.overlapEnd,
  ];

  if (coordinates.some((c) => c < 0)) {
    throw new Error("RTT coordinates cannot be negative.");
  }

  if (Math.max(...coordinates) > reference.length) {
    throw new Error("RTT coordinates extend beyond the reference sequence.");
  }

  const leftReferenceSegment = reference.slice(
    plan.leftRttStart,
    plan.leftRttEnd
  );
  const rightReferenceSegment = reference.slice(
    plan.rightRttStart,
    plan.rightRttEnd
  );

  // The left guide nicks the reference-plus strand, so its RNA template
  // is the reverse complement of the plus-strand reference interval.
  const leftRttSequence = reverseComplement(leftReferenceSegment);
  // The right guide nicks the reference-minus strand, so its RNA
  // template is represented directly by the plus-strand interval.
  const rightRttSequence = rightReferenceSegment;

  const overlapPlusStrand = reference.slice(plan.overlapStart, plan.overlapEnd);

  return Object.freeze({
    referenceSequence: reference,
    plan,
    leftRttSequence,
    rightRttSequence,
    leftSynthesizedDna: reverseComplement(leftRttSequence),
    rightSynthesizedDna: reverseComplement(rightRttSequence),
    overlapPlusStrand,
    overlapMinusStrand: reverseComplement(overlapPlusStrand),
  });
}
