# core

The motion clock, tweens, easing, cancellation and motion modes (`presentation`, `analysis`, `off`), plus the contracts charts and effects share. Charts and effects depend on this layer; it depends on nothing else in the library and never touches the DOM at import time.

| File | What it holds |
| --- | --- |
| `clock.ts` | `createClock` (one shared frame loop), `manualClock` for tests, `defaultClock` |
| `easing.ts` | `linear`, `easeInOutCubic`, `easeOutCubic` |
| `motion.ts` | `createMotion`, the duration scaling table, reduced motion, the page-wide `motion` |
| `tween.ts` | `tween`: progress from 0 to 1, cancellable, scaled by motion |
| `animated.ts` | `animated` values that retarget from their in-between state, and interpolators |
| `contracts/` | Types shared by charts and effects (`Point`, `Rect`; `MarkGeometry` and the effect interfaces come next) |
| `report.ts` | Internal: reports an error without interrupting the caller |
