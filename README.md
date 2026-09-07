# ErrPresso (web)

**ErrPresso** is a tool for **paired prime-editing (twinPE-style) pegRNA
design**. This is the static, client-side rewrite: it takes a DNA sequence,
discovers SpCas9 NGG guide candidates on both strands, builds inward-facing
guide pairs, designs overlapping RTT and PBS extensions, and selects sets of
pegRNA designs that cover a chosen region -- entirely in your browser. No
server, no build step, no sign-in.

This is a from-scratch JavaScript port of [ErrPresso](https://github.com/multiplex-cell/ErrPresso),
which remains the Python/Streamlit original. The two are kept functionally
equivalent; this version exists because a static site never sleeps and loads
instantly.

## Design modes

- **Joint coverage set** -- greedily selects a *set* of pairs, each
  contributing the most previously uncovered target bases
- **Fixed guide, variable RTT** -- one fixed guide, partners at increasing
  distances
- **Manual pair** -- pick a left and right guide by hand from an interactive
  map
- **Single pegRNA** -- the same joint-coverage idea, but for standalone
  (non-paired) guides instead of twinPE pairs

## Running locally

No build step, no dependencies to install for the app itself. Any static
file server works, e.g.:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tests

The core design algorithm (`src/core/`) has a unit test suite using Node's
built-in test runner -- no dependencies:

```sh
npm test
```

## Project layout

```
index.html          entry point
src/core/            the design algorithm -- pure functions, no DOM
src/ui/              UI shell, controls, and the four design-mode modules
src/styles.css       design tokens and shared component styles
tests/               node:test unit tests for src/core/
```

## Status

Guide discovery, pairing, RTT/PBS design, and all four design modes are
implemented and tested against the Python original's test suite. Fetch-by-gene
(UCSC) is not yet wired up in this version -- paste or upload a sequence
directly for now.

## Scientific positioning

ErrPresso performs deterministic sequence and geometry design. Outputs are
candidate designs that require experimental validation -- editing efficiency
depends on guide activity, chromatin context, off-target activity, and
cellular context.
