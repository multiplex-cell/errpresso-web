// Mirrors errpresso Python tests/test_single_constrained_design.py.

import test from "node:test";
import assert from "node:assert/strict";

import { rankSingleGuidesWithRttConstraints } from "../src/core/singlePegrna.js";
import { makeGuideAt } from "./helpers.js";

const REFERENCE_LENGTH = 200;

test("preferred RTT length is used when it fits", () => {
  const guide = makeGuideAt(100, "+", "A");

  const designs = rankSingleGuidesWithRttConstraints({
    guides: [guide],
    targetStart: 0,
    targetEnd: REFERENCE_LENGTH,
    referenceLength: REFERENCE_LENGTH,
    minimumRttLength: 10,
    preferredRttLength: 30,
    maximumRttLength: 50,
  });

  assert.equal(designs.length, 1);
  assert.equal(designs[0].rttLength, 30);
});

test("RTT shrinks near the reference edge", () => {
  const guide = makeGuideAt(REFERENCE_LENGTH - 20, "+", "A");

  const designs = rankSingleGuidesWithRttConstraints({
    guides: [guide],
    targetStart: 0,
    targetEnd: REFERENCE_LENGTH,
    referenceLength: REFERENCE_LENGTH,
    minimumRttLength: 10,
    preferredRttLength: 30,
    maximumRttLength: 50,
  });

  assert.equal(designs.length, 1);
  assert.equal(designs[0].rttLength, 20);
});

test("minus strand shrinks toward reference start", () => {
  const guide = makeGuideAt(15, "-", "A");

  const designs = rankSingleGuidesWithRttConstraints({
    guides: [guide],
    targetStart: 0,
    targetEnd: REFERENCE_LENGTH,
    referenceLength: REFERENCE_LENGTH,
    minimumRttLength: 5,
    preferredRttLength: 30,
    maximumRttLength: 50,
  });

  assert.equal(designs.length, 1);
  assert.equal(designs[0].rttLength, 15);
});

test("guide excluded when even minimum RTT is infeasible", () => {
  const guide = makeGuideAt(5, "+", "A");

  const designs = rankSingleGuidesWithRttConstraints({
    guides: [guide],
    targetStart: 0,
    targetEnd: REFERENCE_LENGTH,
    referenceLength: 10,
    minimumRttLength: 10,
    preferredRttLength: 30,
    maximumRttLength: 50,
  });

  assert.deepEqual(designs, []);
});

test("full coverage ranks first", () => {
  const full = makeGuideAt(0, "+", "F");
  const partial = makeGuideAt(80, "+", "P");

  const designs = rankSingleGuidesWithRttConstraints({
    guides: [partial, full],
    targetStart: 0,
    targetEnd: 100,
    referenceLength: REFERENCE_LENGTH,
    minimumRttLength: 10,
    preferredRttLength: 100,
    maximumRttLength: 100,
  });

  assert.deepEqual(designs[0].guide, full);
  assert.ok(designs[0].coverage.fullyCoversTarget);
});

test("requireFullCoverage filters partial guides", () => {
  const full = makeGuideAt(0, "+", "F");
  const partial = makeGuideAt(80, "+", "P");

  const designs = rankSingleGuidesWithRttConstraints({
    guides: [partial, full],
    targetStart: 0,
    targetEnd: 100,
    referenceLength: REFERENCE_LENGTH,
    minimumRttLength: 10,
    preferredRttLength: 100,
    maximumRttLength: 100,
    requireFullCoverage: true,
  });

  assert.equal(designs.length, 1);
  assert.deepEqual(designs[0].guide, full);
});

test("invalid target raises", () => {
  const guide = makeGuideAt(100, "+", "A");

  assert.throws(
    () =>
      rankSingleGuidesWithRttConstraints({
        guides: [guide],
        targetStart: -1,
        targetEnd: 100,
        referenceLength: REFERENCE_LENGTH,
        maximumRttLength: 30,
      }),
    /targetStart/
  );

  assert.throws(
    () =>
      rankSingleGuidesWithRttConstraints({
        guides: [guide],
        targetStart: 50,
        targetEnd: 50,
        referenceLength: REFERENCE_LENGTH,
        maximumRttLength: 30,
      }),
    /targetEnd/
  );
});

test("invalid RTT window is rejected", () => {
  assert.throws(
    () =>
      rankSingleGuidesWithRttConstraints({
        guides: [],
        targetStart: 0,
        targetEnd: 100,
        referenceLength: REFERENCE_LENGTH,
        minimumRttLength: 60,
        maximumRttLength: 40,
      }),
    /greater than or equal/
  );
});
