// Mirrors errpresso Python tests/test_constrained_design.py.

import test from "node:test";
import assert from "node:assert/strict";

import { rankPairsWithRttConstraints } from "../src/core/constrainedDesign.js";
import { makePairAt } from "./helpers.js";

test("balanced overlap plan", () => {
  const designs = rankPairsWithRttConstraints({
    pairs: [makePairAt(17, 73, "A")],
    targetStart: 30,
    targetEnd: 60,
    overlapLength: 20,
    maximumRttLength: 38,
    overlapBias: 0.0,
  });

  assert.equal(designs.length, 1);
  const design = designs[0];
  assert.equal(design.plan.overlapStart, 35);
  assert.equal(design.plan.overlapEnd, 55);
  assert.equal(design.plan.leftRttLength, 38);
  assert.equal(design.plan.rightRttLength, 38);
});

test("pair is removed when RTTs are too long", () => {
  const designs = rankPairsWithRttConstraints({
    pairs: [makePairAt(17, 73, "A")],
    targetStart: 30,
    targetEnd: 60,
    overlapLength: 20,
    maximumRttLength: 37,
  });

  assert.deepEqual(designs, []);
});

test("negative bias shortens left RTT", () => {
  const design = rankPairsWithRttConstraints({
    pairs: [makePairAt(17, 73, "A")],
    targetStart: 30,
    targetEnd: 60,
    overlapLength: 10,
    maximumRttLength: 50,
    overlapBias: -1.0,
  })[0];

  assert.equal(design.plan.overlapStart, 23);
  assert.equal(design.plan.leftRttLength, 16);
  assert.equal(design.plan.rightRttLength, 50);
});

test("positive bias shortens right RTT", () => {
  const design = rankPairsWithRttConstraints({
    pairs: [makePairAt(17, 73, "A")],
    targetStart: 30,
    targetEnd: 60,
    overlapLength: 10,
    maximumRttLength: 50,
    overlapBias: 1.0,
  })[0];

  assert.equal(design.plan.overlapStart, 57);
  assert.equal(design.plan.leftRttLength, 50);
  assert.equal(design.plan.rightRttLength, 16);
});

test("shorter feasible RTTs rank first", () => {
  const shorter = makePairAt(30, 70, "A");
  const longer = makePairAt(20, 80, "B");

  const designs = rankPairsWithRttConstraints({
    pairs: [longer, shorter],
    targetStart: 35,
    targetEnd: 65,
    overlapLength: 20,
    maximumRttLength: 50,
  });

  assert.deepEqual(designs[0].pair, shorter);
  assert.equal(designs[0].maximumRttLength, 30);
});

test("full coverage requirement", () => {
  const full = makePairAt(30, 70, "A");
  const partial = makePairAt(40, 70, "B");

  const designs = rankPairsWithRttConstraints({
    pairs: [partial, full],
    targetStart: 35,
    targetEnd: 65,
    overlapLength: 10,
    maximumRttLength: 40,
    requireFullCoverage: true,
  });

  assert.equal(designs.length, 1);
  assert.deepEqual(designs[0].pair, full);
});

test("invalid parameters", () => {
  const pair = makePairAt(20, 60, "A");

  assert.throws(
    () =>
      rankPairsWithRttConstraints({
        pairs: [pair],
        targetStart: 20,
        targetEnd: 50,
        overlapLength: 0,
        maximumRttLength: 40,
      }),
    /overlapLength/
  );

  assert.throws(
    () =>
      rankPairsWithRttConstraints({
        pairs: [pair],
        targetStart: 20,
        targetEnd: 50,
        overlapLength: 10,
        maximumRttLength: 0,
      }),
    /maximumRttLength/
  );

  assert.throws(
    () =>
      rankPairsWithRttConstraints({
        pairs: [pair],
        targetStart: 20,
        targetEnd: 50,
        overlapLength: 10,
        maximumRttLength: 40,
        overlapBias: 2.0,
      }),
    /overlapBias/
  );
});

test("greater target coverage beats shorter RTTs", () => {
  const higherCoverage = makePairAt(10, 70, "C");
  const shorterLowerCoverage = makePairAt(30, 60, "D");

  const designs = rankPairsWithRttConstraints({
    pairs: [shorterLowerCoverage, higherCoverage],
    targetStart: 20,
    targetEnd: 80,
    overlapLength: 10,
    maximumRttLength: 45,
  });

  assert.deepEqual(designs[0].pair, higherCoverage);
  assert.equal(designs[0].coverage.coveredLength, 50);
  assert.equal(designs[1].coverage.coveredLength, 30);
});

test("RTTs must fit inside allowed window", () => {
  const designs = rankPairsWithRttConstraints({
    pairs: [makePairAt(17, 73, "W")],
    targetStart: 30,
    targetEnd: 60,
    overlapLength: 20,
    minimumRttLength: 30,
    preferredRttLength: 35,
    maximumRttLength: 40,
  });

  assert.equal(designs.length, 1);
  assert.equal(designs[0].plan.leftRttLength, 38);
  assert.equal(designs[0].plan.rightRttLength, 38);
});

test("pair is rejected below minimum RTT length", () => {
  const designs = rankPairsWithRttConstraints({
    pairs: [makePairAt(17, 73, "Z")],
    targetStart: 30,
    targetEnd: 60,
    overlapLength: 20,
    minimumRttLength: 39,
    preferredRttLength: 44,
    maximumRttLength: 50,
  });

  assert.deepEqual(designs, []);
});

test("invalid RTT window is rejected", () => {
  assert.throws(
    () =>
      rankPairsWithRttConstraints({
        pairs: [],
        targetStart: 10,
        targetEnd: 20,
        overlapLength: 10,
        minimumRttLength: 60,
        maximumRttLength: 40,
      }),
    /greater than or equal/
  );
});
