# core

The motion clock, tweens, easing, cancellation and motion modes (`presentation`, `analysis`, `off`), plus the contracts charts and effects share and the geometry behind them. Charts and effects depend on this layer; it depends on nothing else in the library and never touches the DOM at import time.

| File | What it holds |
| --- | --- |
| `clock.ts` | `createClock` (one shared frame loop), `manualClock` for tests, `defaultClock` |
| `easing.ts` | `linear`, `easeInOutCubic`, `easeOutCubic` |
| `motion.ts` | `createMotion`, the duration scaling table, reduced motion, the page-wide `motion` |
| `tween.ts` | `tween`: progress from 0 to 1, cancellable, scaled by motion |
| `animated.ts` | `animated` values that retarget from their in-between state, and interpolators |
| `contracts/` | Types only, shared by charts, adapters and effects: `MarkGeometry`, `MarkData`, the drawing API, `EffectContext`, the effect kinds, `Icon` |
| `geometry/` | Pure math: line and arc segments, walks by distance, outlines, path data, `matrix`, `offset`, and the public `describe` builders |
| `testing/` | Internal test helpers: the recording layer and mark, `testContext`, `measurePath` |
| `report.ts` | Internal: reports an error without interrupting the caller |
