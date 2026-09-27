import test from "node:test";
import assert from "node:assert/strict";

import {
  findSynonymousSubstitutions,
  findBlockingMutationPositions,
  designBlockingMutations,
  applyBlockingMutations,
  mutationsWithinRtt,
} from "../src/core/pamBlocking.js";

// --- findSynonymousSubstitutions -----------------------------------

test("finds the 4-fold-degenerate 3rd-position synonymous set (+ strand CDS)", () => {
  // codon0 = ATG (Met), codon1 = GGC (Gly), codon2 = TAA (stop)
  const reference = "ATGGGCTAA";
  const cds = { start: 0, end: 9, strand: "+" };

  // 3rd base of GGC (Gly) -- 4-fold degenerate, any of the other 3 works.
  const third = findSynonymousSubstitutions(reference, 5, cds);
  assert.equal(third.originalBase, "C");
  assert.equal(third.codon, "GGC");
  assert.equal(third.aminoAcid, "G");
  assert.deepEqual([...third.synonymousBases].sort(), ["A", "G", "T"]);

  // 1st base of GGC -- no synonymous alternative exists.
  const first = findSynonymousSubstitutions(reference, 3, cds);
  assert.deepEqual(first.synonymousBases, []);

  // 2nd base of GGC -- no synonymous alternative exists either.
  const second = findSynonymousSubstitutions(reference, 4, cds);
  assert.deepEqual(second.synonymousBases, []);
});

test("reads a '-' strand CDS in its own direction and gets the same answer", () => {
  // Reverse complement of "ATGGGCTAA" -- reading this reference from the
  // last base backward, complementing each, reconstructs "ATGGGCTAA".
  const reference = "TTAGCCCAT";
  const cds = { start: 0, end: 9, strand: "-" };

  // Genomic position 3 is the 3rd transcript base of the Gly codon here
  // (mirrors reference position 5 in the '+' strand case above).
  const result = findSynonymousSubstitutions(reference, 3, cds);
  assert.equal(result.codon, "GGC");
  assert.equal(result.aminoAcid, "G");
  assert.deepEqual([...result.synonymousBases].sort(), ["A", "G", "T"]);
});

test("returns null outside the CDS", () => {
  const cds = { start: 10, end: 20, strand: "+" };
  assert.equal(findSynonymousSubstitutions("A".repeat(30), 5, cds), null);
  assert.equal(findSynonymousSubstitutions("A".repeat(30), 25, cds), null);
});

// --- findBlockingMutationPositions ----------------------------------

test("PAM region only targets the 2 bases that matter (not the 'N')", () => {
  const plus = { pamStart: 20, pamEnd: 23, nickPosition: 17, strand: "+" };
  assert.deepEqual(findBlockingMutationPositions(plus, "pam"), [21, 22]);

  const minus = { pamStart: 50, pamEnd: 53, nickPosition: 56, strand: "-" };
  assert.deepEqual(findBlockingMutationPositions(minus, "pam"), [50, 51]);
});

test("seed region is the 3 nt immediately upstream of the PAM", () => {
  const plus = { pamStart: 20, pamEnd: 23, nickPosition: 17, strand: "+" };
  assert.deepEqual(findBlockingMutationPositions(plus, "seed"), [17, 18, 19]);

  const minus = { pamStart: 50, pamEnd: 53, nickPosition: 56, strand: "-" };
  assert.deepEqual(findBlockingMutationPositions(minus, "seed"), [53, 54, 55]);
});

test("'both' combines PAM and seed positions, sorted", () => {
  const plus = { pamStart: 20, pamEnd: 23, nickPosition: 17, strand: "+" };
  assert.deepEqual(findBlockingMutationPositions(plus, "both"), [17, 18, 19, 21, 22]);
});

// --- designBlockingMutations / applyBlockingMutations ----------------

// Reference laid out so the PAM's 2 disruptive bases sit at 1st/2nd
// codon positions (never synonymous for a real amino acid) while the
// seed's first base sits at a 4-fold-degenerate 3rd position:
//   codon0 [15,18) = "GGA" (Gly, seed[0]=pos17 is its 3rd base)
//   codon1 [18,21) = "CAT" (His, seed[1..2]=pos18,19 are 1st/2nd)
//   codon2 [21,24) = "GGC" (Gly, pam-disruptive pos21,22 are 1st/2nd)
const REFERENCE = "A".repeat(15) + "GGA" + "CAT" + "GGC" + "TTTT";
const CDS = { start: 15, end: 24, strand: "+" };
const GUIDE = { pamStart: 20, pamEnd: 23, nickPosition: 17, strand: "+" };

test("without a CDS, every position gets a free (unconstrained) substitution", () => {
  const mutations = designBlockingMutations({ referenceSequence: REFERENCE, guide: GUIDE, region: "both" });
  assert.equal(mutations.length, 5);
  for (const m of mutations) {
    assert.equal(m.synonymous, null);
    assert.ok(m.newBase && m.newBase !== m.originalBase);
  }
});

test("with a CDS, the seed's degenerate position gets a silent mutation and the others are blocked", () => {
  const mutations = designBlockingMutations({ referenceSequence: REFERENCE, guide: GUIDE, region: "both", cds: CDS });
  const byPos = Object.fromEntries(mutations.map((m) => [m.position, m]));

  // Seed position 17 (3rd base of Gly GGA) -- silent mutation available.
  assert.equal(byPos[17].synonymous, true);
  assert.ok(byPos[17].newBase);
  assert.notEqual(byPos[17].newBase, "A"); // must actually differ from the original
  assert.equal(byPos[17].codon, "GGA");
  assert.equal(byPos[17].posInCodon, 2);
  assert.equal(byPos[17].mutatedCodon, "GG" + byPos[17].newBase);

  // Seed positions 18/19 (1st/2nd of His CAT) -- no silent option.
  assert.equal(byPos[18].newBase, null);
  assert.ok(byPos[18].reason);
  assert.equal(byPos[19].newBase, null);
  assert.ok(byPos[19].reason);

  // PAM positions 21/22 (1st/2nd of Gly GGC) -- no silent option either,
  // i.e. this PAM genuinely can't be silently destroyed here.
  assert.equal(byPos[21].newBase, null);
  assert.equal(byPos[22].newBase, null);
  assert.equal(byPos[21].codon, "GGC");
  assert.equal(byPos[21].posInCodon, 0);
  assert.equal(byPos[21].mutatedCodon, undefined); // nothing to show -- no substitution was made
});

test("applyBlockingMutations only touches positions with a real newBase", () => {
  const mutations = designBlockingMutations({ referenceSequence: REFERENCE, guide: GUIDE, region: "both", cds: CDS });
  const mutated = applyBlockingMutations(REFERENCE, mutations);

  assert.equal(mutated.length, REFERENCE.length);
  // Only position 17 actually changed; 18/19/21/22 were left alone.
  for (let i = 0; i < REFERENCE.length; i++) {
    if (i === 17) assert.notEqual(mutated[i], REFERENCE[i]);
    else assert.equal(mutated[i], REFERENCE[i]);
  }
});

// --- mutationsWithinRtt ----------------------------------------------

test("mutationsWithinRtt checks every position falls inside the RTT window", () => {
  const mutations = [{ position: 17 }, { position: 19 }, { position: 22 }];
  assert.equal(mutationsWithinRtt(mutations, 17, 23), true);
  assert.equal(mutationsWithinRtt(mutations, 18, 23), false); // 17 now outside
  assert.equal(mutationsWithinRtt(mutations, 17, 22), false); // 22 now outside (exclusive end)
});
