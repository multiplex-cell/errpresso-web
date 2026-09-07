// Port of errpresso/pbs_design.py -- primer-binding site design for a pair.

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

/** Generate PBS sequences for both guides in a pair. */
export function designPairedPbs(referenceSequence, pair, pbsLength) {
  const reference = normalizeReference(referenceSequence);

  if (pbsLength < 1) {
    throw new Error("pbsLength must be at least 1.");
  }

  const leftNick = pair.leftGuide.nickPosition;
  const rightNick = pair.rightGuide.nickPosition;

  if (leftNick - pbsLength < 0) {
    throw new Error(
      "Not enough reference sequence before the left nick " +
        "for the requested PBS length."
    );
  }

  if (rightNick + pbsLength > reference.length) {
    throw new Error(
      "Not enough reference sequence after the right nick " +
        "for the requested PBS length."
    );
  }

  const leftReferenceSegment = reference.slice(leftNick - pbsLength, leftNick);
  const rightReferenceSegment = reference.slice(rightNick, rightNick + pbsLength);

  return Object.freeze({
    referenceSequence: reference,
    pair,
    pbsLength,
    leftPbsSequence: reverseComplement(leftReferenceSegment),
    rightPbsSequence: rightReferenceSegment,
  });
}
