import { test } from "node:test";
import assert from "node:assert/strict";

import { computeLocalCdsRange } from "../src/core/geneFetch.js";

test("single exon holds the whole CDS, phase 0, plus strand", () => {
  const result = computeLocalCdsRange({
    exons: [{ start: 100, end: 200 }],
    exonIndex: 0,
    cdsStart: 110,
    cdsEnd: 170,
    strand: "+",
    windowStart: 90,
    windowEnd: 210,
  });
  assert.deepEqual(result, { start: 20, end: 80 });
});

test("second exon of a plus-strand CDS trims a split leading codon", () => {
  // exon0 [0,50) contributes 40 coding bases (offsets 0..39), so exon1's
  // first two bases (offset 40, 41) belong to a codon split across the
  // exon boundary and must be trimmed off before this exon's usable span.
  const result = computeLocalCdsRange({
    exons: [
      { start: 0, end: 50 },
      { start: 60, end: 120 },
    ],
    exonIndex: 1,
    cdsStart: 10,
    cdsEnd: 200,
    strand: "+",
    windowStart: 55,
    windowEnd: 125,
  });
  assert.deepEqual(result, { start: 7, end: 64 });
});

test("minus-strand mirror of the split-codon case yields the same local range", () => {
  // Exact geometric mirror (reflect every coordinate through x -> 300-x) of
  // the previous case, with the strand flipped -- since local coordinates
  // are always expressed in transcript 5'->3' terms, the result must be
  // identical to the plus-strand case above.
  const result = computeLocalCdsRange({
    exons: [
      { start: 250, end: 300 },
      { start: 180, end: 240 },
    ],
    exonIndex: 1,
    cdsStart: 100,
    cdsEnd: 290,
    strand: "-",
    windowStart: 175,
    windowEnd: 245,
  });
  assert.deepEqual(result, { start: 7, end: 64 });
});

test("an exon entirely outside the CDS (pure UTR) yields null", () => {
  const result = computeLocalCdsRange({
    exons: [{ start: 200, end: 250 }],
    exonIndex: 0,
    cdsStart: 10,
    cdsEnd: 170,
    strand: "+",
    windowStart: 190,
    windowEnd: 260,
  });
  assert.equal(result, null);
});

test("a coding sliver too short to survive frame-trimming yields null", () => {
  const result = computeLocalCdsRange({
    exons: [
      { start: 0, end: 1 },
      { start: 10, end: 12 },
    ],
    exonIndex: 1,
    cdsStart: 0,
    cdsEnd: 12,
    strand: "+",
    windowStart: 5,
    windowEnd: 15,
  });
  assert.equal(result, null);
});
