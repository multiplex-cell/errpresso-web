// "G+19" spacer engineering. U6 (Pol III) promoters strongly prefer to
// initiate transcription with a G; when a guide's natural spacer
// doesn't already start with one, the standard fix is to drop its
// PAM-distal base (the 5' end, which matters least for targeting) and
// prepend a synthetic G instead -- keeping the PAM-proximal 19 nt
// (which matter most) untouched. Net effect: still a 20-nt spacer, now
// guaranteed to start with G.
//
// This only ever changes GuideCandidate.spacer. Nick position, RTT,
// and PBS are all derived from genomic coordinates elsewhere, never
// from the spacer string's content, so this is safe to apply (or not)
// independently of everything else in the design pipeline.

/** @param {import("./guides.js").GuideCandidate} guide */
export function applyG19Spacer(guide) {
  const spacer = "G" + guide.spacer.slice(1);
  if (spacer === guide.spacer) return guide; // already starts with G
  return Object.freeze({ ...guide, spacer });
}

/** Apply applyG19Spacer to every guide in a list. */
export function applyG19ToGuides(guides) {
  return guides.map(applyG19Spacer);
}
