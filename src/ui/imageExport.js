// Image export for a rendered map/track -- clones the live DOM node,
// wraps it in a standalone SVG (a <foreignObject> carrying the page's
// own stylesheet rules so its classes and var(--x) tokens still
// resolve), and downloads that as a .svg file. No server, no library,
// matching the rest of the app.
//
// This deliberately stops at SVG rather than rasterizing to PNG: a
// canvas drawImage()'d from an SVG <foreignObject> is flagged "tainted"
// by Chromium's canvas security model even for same-origin blob
// content, so canvas.toBlob()/toDataURL() throws a SecurityError --
// there's no workaround for that short of manually redrawing every
// shape with the Canvas 2D API in parallel with the HTML/CSS version,
// which isn't worth the upkeep for what's meant to be a small export
// button. An SVG opens directly in any browser or image viewer, is
// lossless, and most of them offer "export/save as PNG" from there in
// one step if a raster file is what's actually needed.
//
// The app has a single fixed light theme with no external @font-face
// dependency needed for legibility, so the export doesn't try to embed
// the Google Fonts webfont -- it falls back to the system sans-serif
// stack instead, which reads fine at the sizes these tracks use.

function collectStylesheetText() {
  let text = "";
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        text += rule.cssText + "\n";
      }
    } catch {
      // Cross-origin stylesheet (Google Fonts) -- can't read its rules.
      // Not needed: see the file-level note on fonts above.
    }
  }
  return text;
}

// A nested <svg> inside a <foreignObject> doesn't render at all once
// the exported document's own root element is SVG (confirmed: it
// renders fine when the root is HTML, so this is specific to an
// SVG-rooted document, not foreignObject/nested-SVG in general -- a
// narrow, real Chromium limitation, not a var()/currentColor issue).
// The app's small triangle glyphs (nick markers, legend swatches) are
// exactly this shape, so swap each one for a plain CSS border-triangle
// in the export only -- the live, on-screen markup is untouched, and
// callers only need to mark a triangle's <svg> with data-tri-dir
// ("left" | "right", which way it points) for this to find it.
function replaceTriangleIcons(root) {
  root.querySelectorAll("svg[data-tri-dir]").forEach((svg) => {
    const dir = svg.dataset.triDir;
    const polygon = svg.querySelector("polygon");
    const fill = (polygon && polygon.getAttribute("fill")) || "currentColor";
    const color = fill === "currentColor" ? svg.style.color || "currentColor" : fill;
    const size = Number(svg.getAttribute("width")) || 12;
    const half = Math.round(size * 0.42);
    const full = Math.round(size * 0.75);

    const div = document.createElement("div");
    div.style.cssText =
      `display:inline-block;width:0;height:0;vertical-align:middle;` +
      `border-top:${half}px solid transparent;border-bottom:${half}px solid transparent;` +
      (dir === "right" ? `border-left:${full}px solid ${color};` : `border-right:${full}px solid ${color};`);
    if (svg.getAttribute("style")) div.style.cssText += svg.getAttribute("style");
    svg.replaceWith(div);
  });
}

function exportElementAsSvg(element, filename) {
  const cssText = collectStylesheetText();
  const clone = element.cloneNode(true);
  clone.querySelectorAll("[data-export-exclude]").forEach((el) => el.remove());
  clone.removeAttribute("id");
  replaceTriangleIcons(clone);

  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));

  const svgMarkup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#fff;">` +
    `<style>${cssText}</style>${clone.outerHTML}` +
    `</div></foreignObject></svg>`;

  const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Wire every image-download button rendered inside `container` -- each
 * button carries its own `data-image-target` (the id of the element to
 * export) and `data-image-filename`, set by whatever built the button
 * (see coverageMap.js's `id`/`filename` options), so one call here
 * wires all of them regardless of how many maps are on the page.
 */
export function wireImageDownloadButtons(container) {
  container.querySelectorAll("[data-image-download]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = container.querySelector(`#${CSS.escape(btn.dataset.imageTarget)}`);
      if (!target) return;
      exportElementAsSvg(target, btn.dataset.imageFilename || "errpresso-coverage-track.svg");
    });
  });
}
