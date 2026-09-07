// Shared test fixtures, mirroring the Python test suite's make_pair/
// make_guide helpers (tests/test_constrained_design.py, tests/test_synergy.py).

import { makePair } from "../src/core/pairs.js";

export function makeGuideAt(nickPosition, strand, label) {
  const spacer = (label + "A".repeat(20)).slice(0, 20);

  if (strand === "+") {
    return Object.freeze({
      spacer,
      pam: "AGG",
      strand: "+",
      protospacerStart: nickPosition - 17,
      protospacerEnd: nickPosition + 3,
      pamStart: nickPosition + 3,
      pamEnd: nickPosition + 6,
      nickPosition,
    });
  }

  return Object.freeze({
    spacer,
    pam: "TGG",
    strand: "-",
    protospacerStart: nickPosition - 3,
    protospacerEnd: nickPosition + 17,
    pamStart: nickPosition - 6,
    pamEnd: nickPosition - 3,
    nickPosition,
  });
}

export function makePairAt(leftNick, rightNick, label) {
  return makePair(
    makeGuideAt(leftNick, "+", label),
    makeGuideAt(rightNick, "-", label)
  );
}
