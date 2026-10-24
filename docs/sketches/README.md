# API sketches

Pages written against the library's public API, the code a user would write. They were first written in the October 2026 design session, against an API sketched as TypeScript declarations before it was built ([the development log, §11](../plan.md#11-design-session-outcomes-october-2026), has the session's findings). The API is built now, and `api.ts` re-exports it, so `npm run typecheck` checks the examples against the real thing.

| File | What it is |
| --- | --- |
| `api.ts` | The main entry, `expressive-charts`, re-exported from `src`. Its comments say where the built API differs from the first sketch; lines marked NEW came out of writing the examples. |
| `icons-sport.ts` | The optional icon pack, `expressive-charts/icons/sport`: re-exported from `src/icons/sport`. |
| `testing.ts` | The conformance suite for effect authors, `expressive-charts/testing`: re-exported from `src/testing`. |
| `examples/01-ball-and-cleat.ts` | Ball and cleat hover on the reference bar chart, with a metric switch, staged sorting and a flash on the bars that change. |
| `examples/02-goals-vs-xg.ts` | Goals against expected goals on the reference line chart, red below xG, with playback and a pause button. |
| `examples/03-donut-morph.ts` | A donut that morphs into columns and back, in a chart switch. |
| `examples/04-d3-stacked-bars.ts` | The ball-and-cleat story on a D3 stacked bar chart through `expressive()`. |
| `examples/05-d3-donut-and-line.ts` | D3 pie arcs and a D3 line with `threshold`, using the public geometry builders. |
| `examples/06-custom-effects.ts` | Two effects written outside the project, `trace` and `delta`, on a bar chart and on another library's bars, with the row-type checks and `checkEffect`. |
| `examples/effects/` | `trace.ts` and `delta.ts` themselves: the worked examples in [effects-guide.md](../effects-guide.md), which `src/effects-guide.test.ts` also runs through `checkEffect`. |
| `examples/07-presets.ts` | One-line presets and a registered house style. |

`npm run typecheck` compiles this folder (`tsc -p docs/sketches`). Every `// @ts-expect-error` line is a misuse the API must reject; if one stops failing, the API got looser.

The cards of `demo/lab.html`, the single-file prototype the library grew out of, are the first three examples' stories.
