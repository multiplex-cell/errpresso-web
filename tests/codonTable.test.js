import test from "node:test";
import assert from "node:assert/strict";

import { CODON_TABLE, translateCodon } from "../src/core/codonTable.js";

test("covers all 64 codons", () => {
  assert.equal(Object.keys(CODON_TABLE).length, 64);
});

test("translates well-known codons correctly", () => {
  assert.equal(translateCodon("ATG"), "M"); // start / Met, single codon
  assert.equal(translateCodon("TGG"), "W"); // Trp, single codon
  assert.equal(translateCodon("TAA"), "*");
  assert.equal(translateCodon("TAG"), "*");
  assert.equal(translateCodon("TGA"), "*");
  assert.equal(translateCodon("GGT"), "G");
  assert.equal(translateCodon("GGC"), "G");
  assert.equal(translateCodon("GGA"), "G");
  assert.equal(translateCodon("GGG"), "G"); // all 4 Gly codons
});

test("is case-insensitive", () => {
  assert.equal(translateCodon("atg"), "M");
});

test("throws on a non-codon", () => {
  assert.throws(() => translateCodon("ATN"));
  assert.throws(() => translateCodon("AT"));
});
