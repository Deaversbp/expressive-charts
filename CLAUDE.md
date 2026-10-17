# CLAUDE.md

Instructions for Claude when working in this repository. Read this before changing code.

## What this project is

expressive-charts is a TypeScript library of composable motion and expressive effects for interactive web charts. It grew out of `demo/lab.html`, a single-file prototype. The goal is a library where any effect works on any chart without special cases. Effects come first: they run on our reference charts and, through small adapters, on SVG charts built with other libraries (D3 and Observable Plot directly; Vega and Vega-Lite through a small view helper, with the SVG renderer). See the Principles in `docs/plan.md`.

## Architecture rules (do not break these)

1. **Three layers, one direction of dependency.** `src/core` (motion clock, easing, modes) ← `src/charts` and `src/effects`. Charts and effects may import from core. Core imports from neither.
2. **Charts never know about specific effects.** The same goes for adapters, which describe marks drawn by other libraries. A chart renders marks, describes each mark with the shared `MarkGeometry` shape, and emits events (`enter`, `update`, `exit`, `hover`, `leave`). It never imports or references a named effect.
3. **Effects never know chart types.** An effect receives a `MarkGeometry` (and, for data effects, the mark's datum) and animates against it. No `if (chart === "bar")` branches, ever. If an effect needs that, the `MarkGeometry` description is missing something; extend it instead.
4. **Every mark keeps a stable identity (a key).** Transitions, morphs and effects all depend on matching old marks to new marks by key, not by index.
5. **Timing is relative.** Effects and charts express durations as base values; `core` scales them by motion mode. Never hard-code a duration that bypasses the motion mode.
6. **Reduced motion is not optional.** When the effective mode is `off` (the mode is `off`, or the user prefers reduced motion and hasn't picked a mode in an on-page control), every animation jumps to its end state. A mode the page author sets in code never overrides the reduced-motion setting; only the viewer's own choice on the page does. Every effect must define a sensible end state.
7. **Effects compose.** `sequence`, `parallel` and `stagger` combine effects. New effects should be small and combinable rather than large and configurable.
8. **Data effects are a separate kind.** Effects that compare values (for example `threshold`, which colors a line below a reference series) read data, not just geometry. Keep that distinction explicit in their types.

## Motion defaults (from perception research)

- Hover feedback: about 100 ms, color or emphasis change, with other marks dimmed. Nothing should move under the cursor in a way that hides data.
- Presentation mode: data transitions around 1 s, staged (values first, then positions).
- Analysis mode: transitions capped near 200 ms, no staging.
- Avoid staggering items as a default; research shows little benefit and it can hurt.
- Effects never distort data. They may add personality or explain a change, but never move, resize or hide data while it's being read. Decorations go in an overlay; changes to the marks themselves stay small and bounded.
- An effect that conveys information (a delta label, a threshold colour) must leave it visible in its end state, because reduced motion shows only end states.
- Any auto-updating or auto-playing chart needs a pause or stop control (WCAG 2.2.2).

## Visual defaults

- Chart text uses theme text colors, never the series color.
- Categorical colors are assigned in a fixed order and follow the entity, not its rank.
- Support light and dark themes through CSS custom properties.
- Icons are swappable SVG assets in `src/icons`, never hard-coded inside an effect. The core set is neutral; domain icons (soccer ball, cleat) live in optional packs such as `src/icons/sport`.

## Conventions

- TypeScript, strict mode, ES modules. No runtime dependencies unless discussed first.
- Tests live next to code as `*.test.ts` and run with Vitest (jsdom environment).
- Run `npm run typecheck && npm test && npm run build` before committing.
- Keep public API changes reflected in `README.md` and `docs/architecture.md`.
