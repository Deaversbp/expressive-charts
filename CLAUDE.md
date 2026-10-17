# CLAUDE.md

Instructions for Claude when working in this repository. Read this before changing code.

## What this project is

expressive-charts is a TypeScript library of composable motion and expressive effects for interactive web charts. It grew out of `demo/lab.html`, a single-file prototype. The goal is a library where any effect works on any chart without special cases.

## Architecture rules (do not break these)

1. **Three layers, one direction of dependency.** `src/core` (motion clock, easing, modes) ← `src/charts` and `src/effects`. Charts and effects may import from core. Core imports from neither.
2. **Charts never know about specific effects.** A chart renders marks, describes each mark with the shared `MarkGeometry` shape, and emits events (`enter`, `update`, `exit`, `hover`, `leave`). It never imports or references a named effect.
3. **Effects never know chart types.** An effect receives a `MarkGeometry` (and, for data effects, the mark's datum) and animates against it. No `if (chart === "bar")` branches, ever. If an effect needs that, the `MarkGeometry` description is missing something; extend it instead.
4. **Every mark keeps a stable identity (a key).** Transitions, morphs and effects all depend on matching old marks to new marks by key, not by index.
5. **Timing is relative.** Effects and charts express durations as base values; `core` scales them by motion mode. Never hard-code a duration that bypasses the motion mode.
6. **Reduced motion is not optional.** When the mode is `off` or the user prefers reduced motion, every animation jumps to its end state. Every effect must define a sensible end state.
7. **Effects compose.** `sequence`, `parallel` and `stagger` combine effects. New effects should be small and combinable rather than large and configurable.
8. **Data effects are a separate kind.** Effects that compare values (for example `threshold`, which colors a line below a reference series) read data, not just geometry. Keep that distinction explicit in their types.

## Motion defaults (from perception research)

- Hover feedback: about 100 ms, color or emphasis change, with other marks dimmed. Nothing should move under the cursor in a way that hides data.
- Presentation mode: data transitions around 1 s, staged (values first, then positions).
- Analysis mode: transitions capped near 200 ms, no staging.
- Avoid staggering items as a default; research shows little benefit and it can hurt.
- Any auto-updating or auto-playing chart needs a pause or stop control (WCAG 2.2.2).

## Visual defaults

- Chart text uses theme text colors, never the series color.
- Categorical colors are assigned in a fixed order and follow the entity, not its rank.
- Support light and dark themes through CSS custom properties.
- Icons (soccer ball, cleat, and so on) are swappable SVG assets in `src/icons`, never hard-coded inside an effect.

## Conventions

- TypeScript, strict mode, ES modules. No runtime dependencies unless discussed first.
- Tests live next to code as `*.test.ts` and run with Vitest (jsdom environment).
- Run `npm run typecheck && npm test && npm run build` before committing.
- Keep public API changes reflected in `README.md` and `docs/architecture.md`.
