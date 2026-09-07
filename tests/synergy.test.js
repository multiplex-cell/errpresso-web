// Mirrors errpresso Python tests/test_synergy.py.

import test from "node:test";
import assert from "node:assert/strict";

import { rankPairsWithRttConstraints } from "../src/core/constrainedDesign.js";
import { selectSynergisticDesigns } from "../src/core/synergy.js";
import { makePairAt } from "./helpers.js";

function makeDesigns(pairs, targetStart, targetEnd) {
  return rankPairsWithRttConstraints({
    pairs,
    targetStart,
    targetEnd,
    overlapLength: 1,
    minimumRttLength: 1,
    maximumRttLength: 1000,
  });
}

function nicks(selection) {
  const pair = selection.design.pair;
  return [pair.leftGuide.nickPosition, pair.rightGuide.nickPosition];
}

const PAIR_A = makePairAt(0, 30, "A"); // covers [0, 30)
const PAIR_B = makePairAt(40, 70, "B"); // covers [40, 70)
const PAIR_C = makePairAt(80, 100, "C"); // covers [80, 100)
const PAIR_D_REDUNDANT = makePairAt(5, 25, "D"); // inside A's [0, 30)

test("default selection maximizes coverage greedily", () => {
  const designs = makeDesigns([PAIR_A, PAIR_B, PAIR_C], 0, 100);

  const selections = selectSynergisticDesigns({
    designs,
    targetStart: 0,
    targetEnd: 100,
    maximumDesigns: 5,
  });

  const picked = new Set(selections.map((s) => nicks(s).join(",")));
  assert.deepEqual(
    [...picked].sort(),
    ["0,30", "40,70", "80,100"].sort()
  );
  assert.equal(selections[selections.length - 1].cumulativeCoveredLength, 80);
  assert.equal(
    selections[selections.length - 1].cumulativeCoveragePercent,
    80.0
  );
});

test("default selection stops before maximum when no new coverage", () => {
  const designs = makeDesigns(
    [PAIR_A, PAIR_B, PAIR_C, PAIR_D_REDUNDANT],
    0,
    100
  );

  const selections = selectSynergisticDesigns({
    designs,
    targetStart: 0,
    targetEnd: 100,
    maximumDesigns: 5,
  });

  assert.equal(selections.length, 3);
  const picked = new Set(selections.map((s) => nicks(s).join(",")));
  assert.ok(!picked.has("5,25"));
});

test("force_maximum_designs includes redundant backup pair", () => {
  const designs = makeDesigns(
    [PAIR_A, PAIR_B, PAIR_C, PAIR_D_REDUNDANT],
    0,
    100
  );

  const selections = selectSynergisticDesigns({
    designs,
    targetStart: 0,
    targetEnd: 100,
    maximumDesigns: 5,
    forceMaximumDesigns: true,
  });

  assert.equal(selections.length, 4);

  const last = selections[selections.length - 1];
  const previous = selections[selections.length - 2];

  assert.deepEqual(nicks(last), [5, 25]);
  assert.equal(last.marginalCoveredLength, 0);
  assert.equal(last.cumulativeCoveredLength, previous.cumulativeCoveredLength);
  assert.equal(
    last.cumulativeCoveragePercent,
    previous.cumulativeCoveragePercent
  );
});

test("force_maximum_designs continues past full coverage", () => {
  const pairA = makePairAt(0, 30, "A"); // [0, 30)
  const pairB = makePairAt(30, 60, "B"); // [30, 60) -- together full 0-60
  const pairBackup = makePairAt(10, 20, "C"); // nested inside A

  const designs = makeDesigns([pairA, pairB, pairBackup], 0, 60);

  const defaultSelections = selectSynergisticDesigns({
    designs,
    targetStart: 0,
    targetEnd: 60,
    maximumDesigns: 3,
  });

  assert.equal(defaultSelections.length, 2);
  assert.equal(
    defaultSelections[defaultSelections.length - 1].cumulativeCoveragePercent,
    100.0
  );

  const forcedSelections = selectSynergisticDesigns({
    designs,
    targetStart: 0,
    targetEnd: 60,
    maximumDesigns: 3,
    forceMaximumDesigns: true,
  });

  assert.equal(forcedSelections.length, 3);
  assert.equal(
    forcedSelections[forcedSelections.length - 1].marginalCoveredLength,
    0
  );
  assert.equal(
    forcedSelections[forcedSelections.length - 1].cumulativeCoveragePercent,
    100.0
  );
});

test("force_maximum_designs still prefers new coverage first", () => {
  const designs = makeDesigns(
    [PAIR_D_REDUNDANT, PAIR_C, PAIR_B, PAIR_A],
    0,
    100
  );

  const selections = selectSynergisticDesigns({
    designs,
    targetStart: 0,
    targetEnd: 100,
    maximumDesigns: 4,
    forceMaximumDesigns: true,
  });

  const marginalGains = selections.map((s) => s.marginalCoveredLength);

  assert.equal(marginalGains[marginalGains.length - 1], 0);
  assert.ok(marginalGains.slice(0, -1).every((gain) => gain > 0));
});

test("force_maximum_designs does not exceed available designs", () => {
  const designs = makeDesigns([PAIR_A], 0, 100);

  const selections = selectSynergisticDesigns({
    designs,
    targetStart: 0,
    targetEnd: 100,
    maximumDesigns: 10,
    forceMaximumDesigns: true,
  });

  assert.equal(selections.length, 1);
});

test("invalid target raises", () => {
  const designs = makeDesigns([PAIR_A], 0, 100);

  assert.throws(() =>
    selectSynergisticDesigns({ designs, targetStart: -1, targetEnd: 100 })
  );
  assert.throws(() =>
    selectSynergisticDesigns({ designs, targetStart: 50, targetEnd: 50 })
  );
});

test("invalid maximum_designs raises", () => {
  const designs = makeDesigns([PAIR_A], 0, 100);

  assert.throws(() =>
    selectSynergisticDesigns({
      designs,
      targetStart: 0,
      targetEnd: 100,
      maximumDesigns: 0,
    })
  );
});

test("no feasible designs returns empty list", () => {
  const selections = selectSynergisticDesigns({
    designs: [],
    targetStart: 0,
    targetEnd: 100,
  });

  assert.deepEqual(selections, []);
});
