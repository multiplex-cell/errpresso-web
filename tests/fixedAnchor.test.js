// Mirrors errpresso Python tests/test_fixed_anchor.py.

import test from "node:test";
import assert from "node:assert/strict";

import {
  findPairsForFixedGuide,
  selectSpanningPairs,
} from "../src/core/fixedAnchor.js";
import { makeGuideAt } from "./helpers.js";

test("finds compatible partners to the right of a '+' fixed guide", () => {
  const fixed = makeGuideAt(50, "+", "F");
  const near = makeGuideAt(80, "-", "N");
  const far = makeGuideAt(150, "-", "R");
  const behind = makeGuideAt(20, "-", "B"); // wrong side, excluded

  const pairs = findPairsForFixedGuide([near, far, behind], fixed);

  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].nickDistance, 30); // sorted by increasing distance
  assert.equal(pairs[1].nickDistance, 100);
  assert.ok(pairs.every((p) => p.leftGuide === fixed));
});

test("finds compatible partners to the left of a '-' fixed guide", () => {
  const fixed = makeGuideAt(150, "-", "F");
  const near = makeGuideAt(120, "+", "N");
  const ahead = makeGuideAt(200, "+", "A"); // wrong side, excluded

  const pairs = findPairsForFixedGuide([near, ahead], fixed);

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].rightGuide, fixed);
  assert.equal(pairs[0].leftGuide, near);
});

test("selectSpanningPairs keeps shortest and longest", () => {
  const pairs = [10, 20, 30, 40, 50].map((distance, i) =>
    ({ nickDistance: distance, id: i })
  );

  const selected = selectSpanningPairs(pairs, 3);

  assert.equal(selected.length, 3);
  assert.equal(selected[0].nickDistance, 10);
  assert.equal(selected[selected.length - 1].nickDistance, 50);
});

test("selectSpanningPairs returns everything when under the limit", () => {
  const pairs = [10, 20].map((distance) => ({ nickDistance: distance }));
  const selected = selectSpanningPairs(pairs, 5);
  assert.equal(selected.length, 2);
});

test("selectSpanningPairs with maximumPairs=1 returns the longest", () => {
  const pairs = [10, 20, 30].map((distance) => ({ nickDistance: distance }));
  const selected = selectSpanningPairs(pairs, 1);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].nickDistance, 30);
});

test("selectSpanningPairs rejects maximumPairs < 1", () => {
  assert.throws(() => selectSpanningPairs([], 0), /at least 1/);
});
