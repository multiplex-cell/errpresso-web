// Mirrors errpresso Python tests/test_single_synergy.py.

import test from "node:test";
import assert from "node:assert/strict";

import {
  rankSingleGuidesWithRttConstraints,
  makeSingleGuideCoverage,
  makeConstrainedSingleDesign,
} from "../src/core/singlePegrna.js";
import { selectSynergisticSingleDesigns } from "../src/core/singleSynergy.js";
import { makeGuideAt } from "./helpers.js";

const REFERENCE_LENGTH = 300;

function makeDesigns(guides, targetStart, targetEnd, rttLength = 30) {
  return rankSingleGuidesWithRttConstraints({
    guides,
    targetStart,
    targetEnd,
    referenceLength: REFERENCE_LENGTH,
    minimumRttLength: rttLength,
    preferredRttLength: rttLength,
    maximumRttLength: rttLength,
  });
}

function nicks(selection) {
  const guide = selection.design.guide;
  return [guide.strand, guide.nickPosition];
}

// Direct construction with an exact RTT length -- needed for a guide whose
// coverage is a strict subset of another's, which a shared preferred/min/
// max RTT window (makeDesigns above) can't produce.
function makeDesign(guide, rttLength, targetStart, targetEnd) {
  const coverage = makeSingleGuideCoverage(
    guide,
    rttLength,
    targetStart,
    targetEnd
  );

  return makeConstrainedSingleDesign({
    coverage,
    minimumAllowedRttLength: rttLength,
    preferredRttLength: rttLength,
    maximumAllowedRttLength: rttLength,
  });
}

const GUIDE_A = makeGuideAt(0, "+", "A"); // covers [0, 30)
const GUIDE_B = makeGuideAt(100, "+", "B"); // covers [100, 130)
const GUIDE_C = makeGuideAt(200, "+", "C"); // covers [200, 230)
const GUIDE_D_REDUNDANT = makeGuideAt(10, "+", "D"); // [10, 25) -- inside A

test("default selection maximizes coverage greedily", () => {
  const designs = makeDesigns([GUIDE_A, GUIDE_B, GUIDE_C], 0, 300);

  const selections = selectSynergisticSingleDesigns({
    designs,
    targetStart: 0,
    targetEnd: 300,
    maximumDesigns: 5,
  });

  const picked = new Set(selections.map((s) => nicks(s).join(",")));
  assert.deepEqual(
    [...picked].sort(),
    ["+,0", "+,100", "+,200"].sort()
  );
  assert.equal(selections[selections.length - 1].cumulativeCoveredLength, 90);
});

test("default selection stops before maximum when no new coverage", () => {
  const designs = [
    makeDesign(GUIDE_A, 30, 0, 300),
    makeDesign(GUIDE_B, 30, 0, 300),
    makeDesign(GUIDE_C, 30, 0, 300),
    makeDesign(GUIDE_D_REDUNDANT, 15, 0, 300),
  ];

  const selections = selectSynergisticSingleDesigns({
    designs,
    targetStart: 0,
    targetEnd: 300,
    maximumDesigns: 5,
  });

  assert.equal(selections.length, 3);
  const picked = new Set(selections.map((s) => nicks(s).join(",")));
  assert.ok(!picked.has("+,10"));
});

test("force_maximum_designs includes redundant backup guide", () => {
  const designs = [
    makeDesign(GUIDE_A, 30, 0, 300),
    makeDesign(GUIDE_B, 30, 0, 300),
    makeDesign(GUIDE_C, 30, 0, 300),
    makeDesign(GUIDE_D_REDUNDANT, 15, 0, 300),
  ];

  const selections = selectSynergisticSingleDesigns({
    designs,
    targetStart: 0,
    targetEnd: 300,
    maximumDesigns: 5,
    forceMaximumDesigns: true,
  });

  assert.equal(selections.length, 4);

  const last = selections[selections.length - 1];
  const previous = selections[selections.length - 2];

  assert.deepEqual(nicks(last), ["+", 10]);
  assert.equal(last.marginalCoveredLength, 0);
  assert.equal(last.cumulativeCoveredLength, previous.cumulativeCoveredLength);
});

test("force_maximum_designs continues past full coverage", () => {
  const guideA = makeGuideAt(0, "+", "A"); // [0, 30)
  const guideB = makeGuideAt(30, "+", "B"); // [30, 60) -- full 0-60
  const guideBackup = makeGuideAt(5, "+", "C"); // [5, 15) -- nested in A

  const designs = [
    makeDesign(guideA, 30, 0, 60),
    makeDesign(guideB, 30, 0, 60),
    makeDesign(guideBackup, 10, 0, 60),
  ];

  const defaultSelections = selectSynergisticSingleDesigns({
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

  const forcedSelections = selectSynergisticSingleDesigns({
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

test("mixed-strand guides cover from both directions", () => {
  const forward = makeGuideAt(0, "+", "A"); // covers [0, 30)
  const reverse = makeGuideAt(60, "-", "B"); // covers [30, 60)

  const designs = makeDesigns([forward, reverse], 0, 60);

  const selections = selectSynergisticSingleDesigns({
    designs,
    targetStart: 0,
    targetEnd: 60,
    maximumDesigns: 5,
  });

  assert.equal(selections.length, 2);
  assert.equal(
    selections[selections.length - 1].cumulativeCoveragePercent,
    100.0
  );
});

test("invalid target raises", () => {
  const designs = makeDesigns([GUIDE_A], 0, 300);

  assert.throws(() =>
    selectSynergisticSingleDesigns({ designs, targetStart: -1, targetEnd: 100 })
  );
  assert.throws(() =>
    selectSynergisticSingleDesigns({ designs, targetStart: 50, targetEnd: 50 })
  );
});

test("invalid maximum_designs raises", () => {
  const designs = makeDesigns([GUIDE_A], 0, 300);

  assert.throws(() =>
    selectSynergisticSingleDesigns({
      designs,
      targetStart: 0,
      targetEnd: 300,
      maximumDesigns: 0,
    })
  );
});

test("no feasible designs returns empty list", () => {
  const selections = selectSynergisticSingleDesigns({
    designs: [],
    targetStart: 0,
    targetEnd: 300,
  });

  assert.deepEqual(selections, []);
});
