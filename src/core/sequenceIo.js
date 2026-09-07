// Port of errpresso/models.py + errpresso/sequence_io.py -- sequence record
// model, and raw DNA / FASTA / FASTQ parsing.

export class SequenceParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "SequenceParseError";
  }
}

/**
 * @typedef {Object} SequenceRecord
 * @property {string} recordId
 * @property {string} sequence
 * @property {string} sourceFormat
 * @property {string|null} description
 * @property {number} length
 * @property {number} gcPercent
 * @property {number} nCount
 */

function makeRecord({ recordId, sequence, sourceFormat, description }) {
  const canonicalCount = ["A", "C", "G", "T"].reduce(
    (sum, base) => sum + countOccurrences(sequence, base),
    0
  );
  const gcCount =
    countOccurrences(sequence, "G") + countOccurrences(sequence, "C");

  return Object.freeze({
    recordId,
    sequence,
    sourceFormat,
    description: description ?? null,
    length: sequence.length,
    gcPercent: canonicalCount === 0 ? 0.0 : (gcCount / canonicalCount) * 100.0,
    nCount: countOccurrences(sequence, "N"),
  });
}

function countOccurrences(haystack, needle) {
  let count = 0;
  for (const char of haystack) {
    if (char === needle) count++;
  }
  return count;
}

const ALLOWED_BASES = new Set(["A", "C", "G", "T", "N"]);

function normalizeSequence(sequence) {
  const normalized = sequence.replace(/\s+/g, "").toUpperCase();

  if (!normalized) {
    throw new SequenceParseError("The DNA sequence is empty.");
  }

  const invalid = [...new Set(normalized)]
    .filter((base) => !ALLOWED_BASES.has(base))
    .sort();

  if (invalid.length > 0) {
    throw new SequenceParseError(
      `Invalid DNA character(s): ${invalid.join(", ")}. ` +
        "Only A, C, G, T, and N are allowed."
    );
  }

  return normalized;
}

function splitHeader(header) {
  const spaceIndex = header.search(/\s/);
  if (spaceIndex === -1) {
    return [header, null];
  }
  return [
    header.slice(0, spaceIndex),
    header.slice(spaceIndex + 1).trim() || null,
  ];
}

function parseFasta(text) {
  const records = [];
  const seenIds = new Set();

  let currentId = null;
  let currentDescription = null;
  let sequenceLines = [];

  function saveCurrentRecord() {
    if (currentId === null) return;

    if (sequenceLines.length === 0) {
      throw new SequenceParseError(
        `FASTA record '${currentId}' has an empty sequence.`
      );
    }

    records.push(
      makeRecord({
        recordId: currentId,
        sequence: normalizeSequence(sequenceLines.join("")),
        sourceFormat: "fasta",
        description: currentDescription,
      })
    );
  }

  const lines = text.split(/\r\n|\r|\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i].trim();

    if (!line) continue;

    if (line.startsWith(">")) {
      saveCurrentRecord();

      const header = line.slice(1).trim();

      if (!header) {
        throw new SequenceParseError(
          `FASTA header on line ${lineNumber} is empty.`
        );
      }

      const [id, description] = splitHeader(header);
      currentId = id;
      currentDescription = description;

      if (seenIds.has(currentId)) {
        throw new SequenceParseError(
          `Duplicate FASTA record ID: '${currentId}'.`
        );
      }

      seenIds.add(currentId);
      sequenceLines = [];
      continue;
    }

    if (currentId === null) {
      throw new SequenceParseError(
        `FASTA sequence found before the first header on line ${lineNumber}.`
      );
    }

    sequenceLines.push(line);
  }

  saveCurrentRecord();

  if (records.length === 0) {
    throw new SequenceParseError("No FASTA records were found.");
  }

  return records;
}

function parseFastq(text) {
  let lines = text.split(/\r\n|\r|\n/);

  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();

  if (lines.length === 0) {
    throw new SequenceParseError("The FASTQ input is empty.");
  }

  if (lines.length % 4 !== 0) {
    throw new SequenceParseError(
      "FASTQ input must contain complete four-line records."
    );
  }

  const records = [];
  const seenIds = new Set();

  for (let index = 0; index < lines.length; index += 4) {
    const recordNumber = index / 4 + 1;

    const headerLine = lines[index].trim();
    const sequenceLine = lines[index + 1];
    const plusLine = lines[index + 2].trim();
    const qualityLine = lines[index + 3];

    if (!headerLine.startsWith("@")) {
      throw new SequenceParseError(
        `FASTQ record ${recordNumber} has an invalid header.`
      );
    }

    const header = headerLine.slice(1).trim();

    if (!header) {
      throw new SequenceParseError(
        `FASTQ record ${recordNumber} has an empty header.`
      );
    }

    const [recordId, description] = splitHeader(header);

    if (seenIds.has(recordId)) {
      throw new SequenceParseError(
        `Duplicate FASTQ record ID: '${recordId}'.`
      );
    }

    if (!plusLine.startsWith("+")) {
      throw new SequenceParseError(
        `FASTQ record '${recordId}' has an invalid plus line.`
      );
    }

    let sequence;
    try {
      sequence = normalizeSequence(sequenceLine);
    } catch (error) {
      throw new SequenceParseError(`FASTQ record '${recordId}': ${error.message}`);
    }

    if (qualityLine.length !== sequence.length) {
      throw new SequenceParseError(
        `FASTQ record '${recordId}' has sequence length ${sequence.length} ` +
          `but quality length ${qualityLine.length}.`
      );
    }

    seenIds.add(recordId);

    records.push(
      makeRecord({
        recordId,
        sequence,
        sourceFormat: "fastq",
        description,
      })
    );
  }

  return records;
}

/** Parse raw DNA, FASTA, or four-line FASTQ text. */
export function parseSequenceText(text) {
  if (!text || !text.trim()) {
    throw new SequenceParseError("The DNA sequence is empty.");
  }

  const firstNonEmptyLine = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (firstNonEmptyLine.startsWith(">")) {
    return parseFasta(text);
  }

  if (firstNonEmptyLine.startsWith("@")) {
    return parseFastq(text);
  }

  const sequence = normalizeSequence(text);

  return [
    makeRecord({
      recordId: "raw_sequence",
      sequence,
      sourceFormat: "raw",
      description: null,
    }),
  ];
}
