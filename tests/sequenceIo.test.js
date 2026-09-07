// Mirrors key cases from errpresso Python tests/test_sequence_io.py.

import test from "node:test";
import assert from "node:assert/strict";

import { parseSequenceText, SequenceParseError } from "../src/core/sequenceIo.js";

test("parses raw sequence", () => {
  const [record] = parseSequenceText("acgt ACGT\nNNNN");
  assert.equal(record.recordId, "raw_sequence");
  assert.equal(record.sequence, "ACGTACGTNNNN");
  assert.equal(record.sourceFormat, "raw");
  assert.equal(record.length, 12);
});

test("parses single FASTA record with description", () => {
  const [record] = parseSequenceText(">seq1 a description\nACGT\nACGT\n");
  assert.equal(record.recordId, "seq1");
  assert.equal(record.description, "a description");
  assert.equal(record.sequence, "ACGTACGT");
  assert.equal(record.sourceFormat, "fasta");
});

test("parses multi-record FASTA", () => {
  const records = parseSequenceText(">a\nACGT\n>b desc\nTTTT\n");
  assert.equal(records.length, 2);
  assert.equal(records[0].recordId, "a");
  assert.equal(records[1].recordId, "b");
  assert.equal(records[1].sequence, "TTTT");
});

test("rejects duplicate FASTA record IDs", () => {
  assert.throws(
    () => parseSequenceText(">a\nACGT\n>a\nTTTT\n"),
    SequenceParseError
  );
});

test("rejects FASTA sequence before first header", () => {
  assert.throws(() => parseSequenceText("ACGT\n>a\nACGT\n"), SequenceParseError);
});

test("parses FASTQ record", () => {
  const [record] = parseSequenceText("@read1\nACGT\n+\nIIII\n");
  assert.equal(record.recordId, "read1");
  assert.equal(record.sequence, "ACGT");
  assert.equal(record.sourceFormat, "fastq");
});

test("rejects FASTQ with mismatched quality length", () => {
  assert.throws(
    () => parseSequenceText("@read1\nACGT\n+\nII\n"),
    SequenceParseError
  );
});

test("rejects invalid DNA characters", () => {
  assert.throws(() => parseSequenceText("ACGTX"), SequenceParseError);
});

test("rejects empty input", () => {
  assert.throws(() => parseSequenceText(""), SequenceParseError);
  assert.throws(() => parseSequenceText("   \n  "), SequenceParseError);
});

test("gcPercent and nCount are computed correctly", () => {
  const [record] = parseSequenceText("GGCCAATT");
  assert.equal(record.gcPercent, 50.0);
  assert.equal(record.nCount, 0);

  const [withN] = parseSequenceText("GGCCNN");
  assert.equal(withN.nCount, 2);
  assert.equal(withN.gcPercent, 100.0);
});
