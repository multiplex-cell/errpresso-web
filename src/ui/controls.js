// Reusable sidebar control widgets (steppers, toggles, sliders) --
// HTML-string builders paired with attach functions that wire up
// listeners on the freshly-rendered DOM. Sliders update their own fill
// bar directly and only ask the caller to recompute the (separate)
// results pane on every tick, so dragging never tears down the input
// element itself.

export function stepperFieldHtml({ id, label, value }) {
  return `
    <div class="field" data-stepper="${id}">
      <div class="field-label">${label}</div>
      <div class="field-row">
        <input class="field-value" type="text" inputmode="numeric" data-role="value" value="${value}">
        <div class="field-steps">
          <div class="step" data-role="dec">–</div>
          <div class="step" data-role="inc">+</div>
        </div>
      </div>
    </div>
  `;
}

export function attachStepperField(container, id, { min, max, step = 1 }, onChange) {
  const el = container.querySelector(`[data-stepper="${id}"]`);
  if (!el) return;
  const input = el.querySelector('[data-role="value"]');

  function commit(next) {
    const clamped = Math.max(min, Math.min(max, next));
    input.value = clamped;
    onChange(clamped);
  }

  el.querySelector('[data-role="dec"]').addEventListener("click", () => {
    commit((parseInt(input.value, 10) || 0) - step);
  });
  el.querySelector('[data-role="inc"]').addEventListener("click", () => {
    commit((parseInt(input.value, 10) || 0) + step);
  });
  input.addEventListener("change", () => {
    const parsed = parseInt(input.value, 10);
    commit(Number.isFinite(parsed) ? parsed : min);
  });
}

export function toggleHtml({ id, label, checked, help, info }) {
  const labelHtml = info
    ? `<span style="display:inline-flex;align-items:center;gap:6px;">${label}<span class="info-badge" title="${info}">i</span></span>`
    : label;
  return `
    <label class="toggle-row" data-toggle-row="${id}">
      <span>${labelHtml}${help ? `<span class="caption" style="display:block;margin-top:2px;">${help}</span>` : ""}</span>
      <button type="button" class="toggle ${checked ? "on" : ""}" data-toggle="${id}"><span class="knob"></span></button>
    </label>
  `;
}

export function attachToggle(container, id, onChange) {
  const btn = container.querySelector(`[data-toggle="${id}"]`);
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = !btn.classList.contains("on");
    btn.classList.toggle("on", next);
    onChange(next);
  });
}

export function singleSliderHtml({ id, label, value, min, max, valueLabel }) {
  const fraction = ((value - min) / (max - min)) * 100;
  return `
    <div data-single-slider="${id}">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="label">${label}</div>
        <span class="mono" style="font-size:13px;font-weight:600;color:var(--accent);" data-role="readout">${valueLabel ?? value}</span>
      </div>
      <div class="slider-shell" style="margin-top:10px;">
        <div class="slider-track"></div>
        <div class="slider-fill" data-role="fill" style="left:0;width:${fraction}%;"></div>
        <input type="range" min="${min}" max="${max}" value="${value}" step="1" data-role="range">
      </div>
    </div>
  `;
}

export function attachSingleSlider(container, id, onInput) {
  const el = container.querySelector(`[data-single-slider="${id}"]`);
  if (!el) return;
  const range = el.querySelector('[data-role="range"]');
  const fill = el.querySelector('[data-role="fill"]');
  const readout = el.querySelector('[data-role="readout"]');

  range.addEventListener("input", () => {
    const min = Number(range.min);
    const max = Number(range.max);
    const value = Number(range.value);
    const fraction = ((value - min) / (max - min)) * 100;
    fill.style.width = `${fraction}%`;
    readout.textContent = value;
    onInput(value);
  });
}

export function dualSliderHtml({ id, min, max, valueStart, valueEnd }) {
  const startFraction = ((valueStart - min) / (max - min)) * 100;
  const endFraction = ((valueEnd - min) / (max - min)) * 100;
  return `
    <div data-dual-slider="${id}">
      <div class="slider-shell">
        <div class="slider-track"></div>
        <div class="slider-fill" data-role="fill" style="left:${startFraction}%;width:${endFraction - startFraction}%;"></div>
        <input type="range" min="${min}" max="${max}" value="${valueStart}" step="1" data-role="start">
        <input type="range" min="${min}" max="${max}" value="${valueEnd}" step="1" data-role="end">
      </div>
      <div class="caption" style="margin-top:8px;" data-role="readout">Target <span class="mono">${valueStart}</span>–<span class="mono">${valueEnd}</span> (${(valueEnd - valueStart).toLocaleString()} nt of ${max.toLocaleString()})</div>
    </div>
  `;
}

export function attachDualSlider(container, id, onInput) {
  const el = container.querySelector(`[data-dual-slider="${id}"]`);
  if (!el) return;
  const startInput = el.querySelector('[data-role="start"]');
  const endInput = el.querySelector('[data-role="end"]');
  const fill = el.querySelector('[data-role="fill"]');
  const readout = el.querySelector('[data-role="readout"]');
  const min = Number(startInput.min);
  const max = Number(startInput.max);

  function update() {
    let start = Number(startInput.value);
    let end = Number(endInput.value);

    // Keep start <= end by nudging the other handle, same feel as two
    // cooperating native sliders.
    if (start > end) {
      if (document.activeElement === startInput) {
        end = start;
        endInput.value = end;
      } else {
        start = end;
        startInput.value = start;
      }
    }

    const startFraction = ((start - min) / (max - min)) * 100;
    const endFraction = ((end - min) / (max - min)) * 100;
    fill.style.left = `${startFraction}%`;
    fill.style.width = `${Math.max(0, endFraction - startFraction)}%`;
    readout.innerHTML = `Target <span class="mono">${start}</span>–<span class="mono">${end}</span> (${(end - start).toLocaleString()} nt of ${max.toLocaleString()})`;

    onInput(start, end);
  }

  startInput.addEventListener("input", update);
  endInput.addEventListener("input", update);
}
