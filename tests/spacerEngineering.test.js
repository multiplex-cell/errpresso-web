import test from "node:test";
import assert from "node:assert/strict";

import { applyG19Spacer, applyG19ToGuides } from "../src/core/spacerEngineering.js";

test("replaces the 5' (PAM-distal) base with G, keeping the PAM-proximal 19 nt", () => {
  const guide = Object.freeze({ spacer: "TCCCTTCTCAGGATTCCTAC", pam: "AGG", strand: "+", nickPosition: 22 });
  const result = applyG19Spacer(guide);

  assert.equal(result.spacer, "GCCCTTCTCAGGATTCCTAC");
  assert.equal(result.spacer.length, 20);
  // PAM-proximal 19 nt (everything but the first base) are unchanged.
  assert.equal(result.spacer.slice(1), guide.spacer.slice(1));
  // Everything else on the guide is untouched.
  assert.equal(result.pam, guide.pam);
  assert.equal(result.strand, guide.strand);
  assert.equal(result.nickPosition, guide.nickPosition);
});

test("is a no-op (same spacer, no new object needed) when already G-first", () => {
  const guide = Object.freeze({ spacer: "GTCGAGAATATCCAAGAGAC", pam: "AGG", strand: "-", nickPosition: 59 });
  const result = applyG19Spacer(guide);

  assert.equal(result.spacer, guide.spacer);
  assert.equal(result, guide); // returns the same object, doesn't manufacture an identical copy
});

test("applyG19ToGuides maps every guide, preserving order and count", () => {
  const guides = [
    Object.freeze({ spacer: "TCCCTTCTCAGGATTCCTAC", pam: "AGG", strand: "+", nickPosition: 22 }),
    Object.freeze({ spacer: "GTCGAGAATATCCAAGAGAC", pam: "AGG", strand: "-", nickPosition: 59 }),
    Object.freeze({ spacer: "CAATTTAAACCCACCTATAA", pam: "TGG", strand: "-", nickPosition: 192 }),
  ];

  const result = applyG19ToGuides(guides);

  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((g) => g.spacer),
    ["GCCCTTCTCAGGATTCCTAC", "GTCGAGAATATCCAAGAGAC", "GAATTTAAACCCACCTATAA"]
  );
});
