import test from "node:test";
import assert from "node:assert/strict";

import { assessSpacerQuality, filterQualityGuides } from "../src/core/guideQuality.js";

test("a clean, balanced-GC spacer passes", () => {
  // 20 nt, 50% GC, no runs.
  const flags = assessSpacerQuality("ACGTACGTACGTACGTACGT");
  assert.deepEqual(flags, { polyT: false, extremeGc: false, homopolymer: false, passes: true });
});

test("flags a TTTT run anywhere in the spacer", () => {
  assert.equal(assessSpacerQuality("ACGTACGTTTTTACGTACGT").polyT, true);
  assert.equal(assessSpacerQuality("TTTTACGTACGTACGTACGT").polyT, true);
  // TTT alone (3 T's) is not enough to trigger it.
  assert.equal(assessSpacerQuality("ACGTACGTTTACGTACGTAC").polyT, false);
});

test("flags GC% outside the 30-70 window", () => {
  const allAt = "ATATATATATATATATATAT"; // 0% GC
  const allGc = "GCGCGCGCGCGCGCGCGCGC"; // 100% GC
  assert.equal(assessSpacerQuality(allAt).extremeGc, true);
  assert.equal(assessSpacerQuality(allGc).extremeGc, true);
  // 50% GC, well inside the window (and the "clean" case above already
  // confirms extremeGc is false there).
});

test("flags a 5+ homopolymer run of A, C, or G but not T (that's the poly-T rule)", () => {
  assert.equal(assessSpacerQuality("ACGTAAAAACGTACGTACGT").homopolymer, true);
  assert.equal(assessSpacerQuality("ACGTCCCCCACGTACGTACG").homopolymer, true);
  assert.equal(assessSpacerQuality("ACGTGGGGGACGTACGTACG").homopolymer, true);
  // A 4-run doesn't trigger it.
  assert.equal(assessSpacerQuality("ACGTAAAAACGTACGTACGT".replace("AAAAA", "AAAA")).homopolymer, false);
});

test("filterQualityGuides keeps only passing guides", () => {
  const guides = [
    { id: "clean", spacer: "ACGTACGTACGTACGTACGT" },
    { id: "polyT", spacer: "ACGTACGTTTTTACGTACGT" },
    { id: "lowGc", spacer: "ATATATATATATATATATAT" },
    { id: "homopolymer", spacer: "ACGTAAAAACGTACGTACGT" },
  ];

  const kept = filterQualityGuides(guides);

  assert.deepEqual(kept.map((g) => g.id), ["clean"]);
});
