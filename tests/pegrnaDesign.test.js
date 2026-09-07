// Mirrors errpresso Python tests/test_pegrna_design.py -- same reference
// sequence and expected values, cross-checking guides+pairs+rttPlan+
// rttDesign+pbsDesign+pegrnaDesign end to end against the Python port's
// source of truth.

import test from "node:test";
import assert from "node:assert/strict";

import { findSpCas9Guides } from "../src/core/guides.js";
import { findInwardFacingPairs } from "../src/core/pairs.js";
import { designPairedPegrnas, SCAFFOLD_SEQUENCE } from "../src/core/pegrnaDesign.js";

const EXAMPLE_SEQUENCE =
  "TTATATTCCACTGCTTCTCAGGGATTAACATCTGCTCGTGCAGCTGAGATCCTGGCGCGAGAT" +
  "GGTCCCAACGCCCTCACTCCCCCTCCCACTACTCCTGAATGGATCAAGTTTTGTCGGCAGCT" +
  "CTTTGGGGGGTTCTCAATGTTACTGTGGATTGGAGCGATTCTTTGTTTCTTGGCTTATAGCAT" +
  "CCAAGCTGCTACAGAAGAGGAACCTCAAAACGATAATGTGAGTTCTGTAATTCAGCATA";

function makeDesign() {
  const guides = findSpCas9Guides(EXAMPLE_SEQUENCE);
  const pairs = findInwardFacingPairs(guides);

  const pair = pairs.find(
    (p) =>
      p.leftGuide.spacer === "TTATATTCCACTGCTTCTCA" &&
      p.rightGuide.spacer === "AGTAGTGGGAGGGGGAGTGA"
  );

  return designPairedPegrnas(EXAMPLE_SEQUENCE, pair, 13, 20);
}

test("left pegRNA components", () => {
  const design = makeDesign();
  assert.equal(design.left.spacerSequence, "TTATATTCCACTGCTTCTCA");
  assert.equal(
    design.left.rttSequence,
    "GCGCCAGGATCTCAGCTGCACGAGCAGATGTTAATCCCTGA"
  );
  assert.equal(design.left.pbsSequence, "GAAGCAGTGGAAT");
});

test("right pegRNA components", () => {
  const design = makeDesign();
  assert.equal(design.right.spacerSequence, "AGTAGTGGGAGGGGGAGTGA");
  assert.equal(
    design.right.rttSequence,
    "TGCAGCTGAGATCCTGGCGCGAGATGGTCCCAACGCCCTCA"
  );
  assert.equal(design.right.pbsSequence, "CTCCCCCTCCCAC");
});

test("extension order is RTT then PBS", () => {
  const design = makeDesign();
  assert.equal(
    design.left.extensionSequence,
    design.left.rttSequence + design.left.pbsSequence
  );
  assert.equal(
    design.right.extensionSequence,
    design.right.rttSequence + design.right.pbsSequence
  );
});

test("component lengths", () => {
  const design = makeDesign();
  assert.equal(design.left.rttLength, 41);
  assert.equal(design.left.pbsLength, 13);
  assert.equal(design.left.extensionLength, 54);
  assert.equal(design.right.rttLength, 41);
  assert.equal(design.right.pbsLength, 13);
  assert.equal(design.right.extensionLength, 54);
});

test("RNA sequences replace T with U", () => {
  const design = makeDesign();
  assert.ok(!design.left.spacerRna.includes("T"));
  assert.ok(!design.left.extensionRna.includes("T"));
  assert.ok(!design.right.spacerRna.includes("T"));
  assert.ok(!design.right.extensionRna.includes("T"));
});

test("overlap information is preserved", () => {
  const design = makeDesign();
  assert.equal(design.plan.overlapStart, 38);
  assert.equal(design.plan.overlapEnd, 58);
  assert.equal(design.overlapPlusStrand, "TGCAGCTGAGATCCTGGCGC");
  assert.equal(design.overlapMinusStrand, "GCGCCAGGATCTCAGCTGCA");
});

test("full pegRNA sequence is spacer + scaffold + RTT + PBS", () => {
  const design = makeDesign();

  assert.equal(
    design.left.fullSequence,
    design.left.spacerSequence + SCAFFOLD_SEQUENCE + design.left.rttSequence + design.left.pbsSequence
  );
  assert.equal(design.left.fullLength, design.left.fullSequence.length);
  assert.ok(!design.left.fullRna.includes("T"));
  assert.equal(design.left.fullRna.length, design.left.fullSequence.length);
});
