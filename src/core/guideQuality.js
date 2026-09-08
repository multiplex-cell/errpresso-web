// Cheap, deterministic spacer quality filters -- not a predictive
// on-target score (that's what Rule Set 2/3 are for), just hard rules
// that flag guides with a well known, structural reason to fail:
// premature Pol III termination, extreme GC content, or a homopolymer
// run. All three are simple string/composition checks on the 20-nt
// spacer, so they run in negligible time even over hundreds of guides.

const MIN_GC_PERCENT = 30;
const MAX_GC_PERCENT = 70;
const HOMOPOLYMER_RUN_LENGTH = 5; // AAAAA / CCCCC / GGGGG
const POLY_T_RUN_LENGTH = 4; // TTTT+ -- Pol III (U6) terminator signal

function gcPercent(spacer) {
  const gc = [...spacer].filter((base) => base === "G" || base === "C").length;
  return (gc / spacer.length) * 100;
}

function hasRun(spacer, base, length) {
  return spacer.includes(base.repeat(length));
}

/**
 * @typedef {Object} GuideQualityFlags
 * @property {boolean} polyT -- contains a TTTT+ run
 * @property {boolean} extremeGc -- GC% outside [30, 70]
 * @property {boolean} homopolymer -- contains a 5+ run of A, C, or G
 * @property {boolean} passes -- true only when none of the above are set
 */

/** @returns {GuideQualityFlags} */
export function assessSpacerQuality(spacer) {
  const polyT = hasRun(spacer, "T", POLY_T_RUN_LENGTH);
  const gc = gcPercent(spacer);
  const extremeGc = gc < MIN_GC_PERCENT || gc > MAX_GC_PERCENT;
  const homopolymer = ["A", "C", "G"].some((base) => hasRun(spacer, base, HOMOPOLYMER_RUN_LENGTH));

  return { polyT, extremeGc, homopolymer, passes: !polyT && !extremeGc && !homopolymer };
}

/** Filter a list of GuideCandidate objects down to ones that pass. */
export function filterQualityGuides(guides) {
  return guides.filter((guide) => assessSpacerQuality(guide.spacer).passes);
}
