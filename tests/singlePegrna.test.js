// Mirrors errpresso Python tests/test_single_pegrna.py.

import test from "node:test";
import assert from "node:assert/strict";

import { findSpCas9Guides } from "../src/core/guides.js";
import { findInwardFacingPairs } from "../src/core/pairs.js";
import { designPairedPegrnas } from "../src/core/pegrnaDesign.js";
import {
  designSinglePegrna,
  guideEditInterval,
} from "../src/core/singlePegrna.js";

const EXAMPLE_SEQUENCE =
  "TTATATTCCACTGCTTCTCAGGGATTAACATCTGCTCGTGCAGCTGAGATCCTGGCGCGAGAT" +
  "GGTCCCAACGCCCTCACTCCCCCTCCCACTACTCCTGAATGGATCAAGTTTTGTCGGCAGCT" +
  "CTTTGGGGGGTTCTCAATGTTACTGTGGATTGGAGCGATTCTTTGTTTCTTGGCTTATAGCAT" +
  "CCAAGCTGCTACAGAAGAGGAACCTCAAAACGATAATGTGAGTTCTGTAATTCAGCATA";

function pairedReference() {
  const guides = findSpCas9Guides(EXAMPLE_SEQUENCE);
  const pairs = findInwardFacingPairs(guides);
  return pairs.find(
    (p) =>
      p.leftGuide.spacer === "TTATATTCCACTGCTTCTCA" &&
      p.rightGuide.spacer === "AGTAGTGGGAGGGGGAGTGA"
  );
}

test("'+' guide matches paired-left-guide RTT/PBS", () => {
  const pair = pairedReference();
  const paired = designPairedPegrnas(EXAMPLE_SEQUENCE, pair, 13, 20);

  const single = designSinglePegrna(
    EXAMPLE_SEQUENCE,
    pair.leftGuide,
    paired.left.rttLength,
    13
  );

  assert.equal(single.spacerSequence, paired.left.spacerSequence);
  assert.equal(single.rttSequence, paired.left.rttSequence);
  assert.equal(single.pbsSequence, paired.left.pbsSequence);
});

test("'-' guide matches paired-right-guide RTT/PBS", () => {
  const pair = pairedReference();
  const paired = designPairedPegrnas(EXAMPLE_SEQUENCE, pair, 13, 20);

  const single = designSinglePegrna(
    EXAMPLE_SEQUENCE,
    pair.rightGuide,
    paired.right.rttLength,
    13
  );

  assert.equal(single.spacerSequence, paired.right.spacerSequence);
  assert.equal(single.rttSequence, paired.right.rttSequence);
  assert.equal(single.pbsSequence, paired.right.pbsSequence);
});

test("guide edit interval directions", () => {
  const pair = pairedReference();

  assert.deepEqual(guideEditInterval(pair.leftGuide, 25), [
    pair.leftGuide.nickPosition,
    pair.leftGuide.nickPosition + 25,
  ]);
  assert.deepEqual(guideEditInterval(pair.rightGuide, 25), [
    pair.rightGuide.nickPosition - 25,
    pair.rightGuide.nickPosition,
  ]);
});

test("RTT beyond reference bounds raises", () => {
  const pair = pairedReference();
  assert.throws(
    () =>
      designSinglePegrna(
        EXAMPLE_SEQUENCE,
        pair.rightGuide,
        EXAMPLE_SEQUENCE.length,
        13
      ),
    /RTT length/
  );
});

test("PBS beyond reference bounds raises", () => {
  const pair = pairedReference();
  assert.throws(
    () =>
      designSinglePegrna(
        EXAMPLE_SEQUENCE,
        pair.leftGuide,
        10,
        EXAMPLE_SEQUENCE.length
      ),
    /PBS length/
  );
});

test("invalid lengths raise", () => {
  const pair = pairedReference();
  assert.throws(
    () => designSinglePegrna(EXAMPLE_SEQUENCE, pair.leftGuide, 0, 13),
    /rttLength/
  );
  assert.throws(
    () => designSinglePegrna(EXAMPLE_SEQUENCE, pair.leftGuide, 10, 0),
    /pbsLength/
  );
});
