# core

The motion clock, tweens, easing, cancellation and motion modes (`presentation`, `analysis`, `off`), plus the contracts charts and effects share, the geometry behind them, and the runner that plays effects on marks. Charts and effects depend on this layer; it depends on nothing else in the library and never touches the DOM at import time.

| File | What it holds |
| --- | --- |
| `clock.ts` | `createClock` (one shared frame loop), `manualClock` for tests, `defaultClock` |
| `easing.ts` | `linear`, `easeInOutCubic`, `easeOutCubic` |
| `motion.ts` | `createMotion`, the duration scaling table, reduced motion, the page-wide `motion` |
| `tween.ts` | `tween`: progress from 0 to 1, cancellable, scaled by motion |
| `animated.ts` | `animated` values that retarget from their in-between state, and interpolators |
| `playback.ts` | `playback`: plays a position through a range on the clock, with play, pause, seek and notifications, and no DOM |
| `contracts/` | Types only, shared by charts, adapters and effects: `MarkGeometry`, `MarkData`, the drawing API, `EffectContext`, the effect kinds, `Icon`, the effect slots |
| `geometry/` | Pure math: line and arc segments, walks by distance, outlines, path data, `matrix`, `offset`, and the public `describe` builders |
| `runner.ts` | Internal: `createRunner`, which connects a chart's mark events to its effects and owns every run's lifecycle |
| `registry.ts` | Internal: `createRegistry` for presets and icons, and `resolveEffects` for a chart's `on` option |
| `testing/` | Internal test helpers: the recording layer, mark and surface, `testContext`, `measurePath`, `play` |
| `merge.ts` | Internal: the field merge behind `mark.set()` and the handles' `update()` |
| `report.ts` | Internal: reports an error without interrupting the caller |
