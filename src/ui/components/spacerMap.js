// "Spacer orientation map" -- Manual pair's guide-picker visualization.
// Every selectable SpCas9 guide on both strands is drawn as a small
// triangle at its nick position, pointing in its strand's synthesis
// direction ('+' guides point right, '-' guides point left) -- a
// genome-browser-style track instead of two plain scrollable lists.
//
// Each triangle carries the exact same data-picker-row/data-side/
// data-index attributes the old two-list picker used, so manualPair.js's
// existing click handling (attachPickerListeners) works completely
// unchanged -- this module only changes how the pickable guides are
// drawn, not how picking them works.

function toPercent(coordinate, sequenceLength) {
  if (sequenceLength <= 0) return 0;
  return Math.max(0, Math.min(100, (coordinate / sequenceLength) * 100));
}

function triangleMarker({ guide, side, index, selected, sequenceLength }) {
  const pct = toPercent(guide.nickPosition, sequenceLength);
  const points = side === "left" ? "2,2 14,8 2,14" : "14,2 2,8 14,14";
  const title = `${side === "left" ? "+" : "-"} strand · nick ${guide.nickPosition} · ${guide.spacer} · PAM ${guide.pam}`;

  return `
    <div
      class="spacer-tri-hit ${side === "left" ? "plus" : "minus"} ${selected ? "selected" : ""}"
      data-picker-row data-side="${side}" data-index="${index}"
      style="left:${pct}%;"
      title="${title}"
    >
      <svg width="16" height="16" viewBox="0 0 16 16"><polygon points="${points}" fill="currentColor"></polygon></svg>
    </div>
  `;
}

/**
 * @param {Object} opts
 * @param {number} opts.sequenceLength
 * @param {Array} opts.leftGuides -- '+' strand guides, any order (index is the picker key)
 * @param {Array} opts.rightGuides -- '-' strand guides, any order (index is the picker key)
 * @param {number|null} opts.selectedLeftIndex
 * @param {number|null} opts.selectedRightIndex
 */
export function buildSpacerMapHtml({ sequenceLength, leftGuides, rightGuides, selectedLeftIndex, selectedRightIndex }) {
  const leftMarkers = leftGuides
    .map((g, i) => triangleMarker({ guide: g, side: "left", index: i, selected: i === selectedLeftIndex, sequenceLength }))
    .join("");
  const rightMarkers = rightGuides
    .map((g, i) => triangleMarker({ guide: g, side: "right", index: i, selected: i === selectedRightIndex, sequenceLength }))
    .join("");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    position: f * 100,
    label: Math.round(f * sequenceLength).toLocaleString(),
    align: f === 0 ? "left" : f === 1 ? "right" : "center",
  }));
  const gridlinesHtml = ticks
    .map((t) => `<div class="spacer-map-gridline" style="${t.align === "right" ? "right:0;" : `left:${t.position}%;`}"></div>`)
    .join("");
  const tickLabelsHtml = ticks
    .map((t) => {
      const style =
        t.align === "left"
          ? `left:0;`
          : t.align === "right"
            ? `right:0;`
            : `left:${t.position}%;transform:translateX(-50%);`;
      return `<span class="spacer-map-tick mono" style="${style}">${t.label}</span>`;
    })
    .join("");

  let connectorHtml = "";
  const left = selectedLeftIndex !== null ? leftGuides[selectedLeftIndex] : null;
  const right = selectedRightIndex !== null ? rightGuides[selectedRightIndex] : null;
  if (left && right) {
    const lp = toPercent(left.nickPosition, sequenceLength);
    const rp = toPercent(right.nickPosition, sequenceLength);
    const inward = left.nickPosition < right.nickPosition;
    connectorHtml = `<div class="spacer-map-connector ${inward ? "" : "invalid"}" style="left:${Math.min(lp, rp)}%;width:${Math.abs(rp - lp)}%;"></div>`;
  }

  return `
    <div class="spacer-map">
      <div class="spacer-map-header">
        <div class="spacer-map-label">Spacer orientation map</div>
        <div class="spacer-map-legend">
          <span class="spacer-map-legend-item"><svg width="12" height="12" viewBox="0 0 16 16"><polygon points="2,2 14,8 2,14" fill="currentColor"></polygon></svg>+ strand</span>
          <span class="spacer-map-legend-item minus"><svg width="12" height="12" viewBox="0 0 16 16"><polygon points="14,2 2,8 14,14" fill="currentColor"></polygon></svg>&minus; strand</span>
        </div>
      </div>
      <div class="spacer-map-track">
        <div class="spacer-map-gridlines">${gridlinesHtml}</div>
        <div class="spacer-map-baseline"></div>
        ${connectorHtml}
        <div class="spacer-map-row plus">${leftMarkers}</div>
        <div class="spacer-map-row minus">${rightMarkers}</div>
      </div>
      <div class="spacer-map-ruler">${tickLabelsHtml}</div>
    </div>
  `;
}
