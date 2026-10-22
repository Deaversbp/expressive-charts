# API sketches

The proposed public API, written down as TypeScript before it's built, plus the code users would write against it. It comes from the October 2026 design session; [plan.md §11](../plan.md#11-design-session-outcomes-october-2026) has the findings.

| File | What it is |
| --- | --- |
| `api.ts` | The proposed API as declarations. The motion core, the shared contracts and effect slots, the geometry (`describe.bar`, `.arc`, `.line`, `.point`, `matrix`, `offset`), the registries (`registerPreset`, `registerIcon`, `registerIcons`), the icons (`defineIcon`, `iconFromSvg`, `icons`), the first effects (`travel` and its gaits, `sequence`, `parallel`, `only`), the effect-author helpers (`defineEffect`, `defineDataEffect`) and the adapter's types (`MarkSource`, `Attachment`, `ExpressiveOptions`) are real and re-exported from `src`; everything else is `declare`. Lines marked NEW came out of writing the examples. |
| `icons-sport.ts` | The optional icon pack, `expressive-charts/icons/sport`: re-exported from `src/icons/sport`. |
| `testing.ts` | The conformance suite for effect authors, `expressive-charts/testing`: re-exported from `src/testing`. |
| `examples/01-ball-and-cleat.ts` | Lab card 1 on the reference bar chart. |
| `examples/02-goals-vs-xg.ts` | Lab card 2 on the reference line chart, with playback and a pause button. |
| `examples/03-donut-morph.ts` | Lab card 3: donut to bars and back. |
| `examples/04-d3-stacked-bars.ts` | The ball-and-cleat story on a D3 stacked bar chart through `expressive()`. |
| `examples/05-d3-donut-and-line.ts` | D3 pie arcs and a D3 line with `threshold`, using the public geometry builders. |
| `examples/06-custom-effects.ts` | Two effects written outside the project, `trace` and `delta`, on a bar chart and on another library's bars, with the row-type checks and `checkEffect`. |
| `examples/effects/` | `trace.ts` and `delta.ts` themselves: the worked examples in [effects-guide.md](../effects-guide.md), which `src/effects-guide.test.ts` also runs through `checkEffect`. |
| `examples/07-presets.ts` | One-line presets and a registered house style. |

`npm run typecheck` compiles this folder (`tsc -p docs/sketches`). Every `// @ts-expect-error` line is a misuse the API must reject; if one stops failing, the API got looser.

As each piece is built, replace its `declare` in `api.ts` with a re-export from `src`, so the examples run against the real thing. When nothing is declared any more, the examples move into the docs.
