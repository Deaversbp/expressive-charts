# effects

Effect plugins and combinators. Effects read only `MarkGeometry` (plus `MarkData` for data effects), draw only through the run's context, and never check chart types or import icons (they look icons up by name through `ctx.icons`).

| File | What it holds |
| --- | --- |
| `travel.ts` | `travel(icon, { along, gait, size, orient, ride })`: carries an icon along a walk or a segment |
| `flash.ts` | `flash({ width, opacity, color })`: one halo blink along the outline, for `on: { update: "flash" }` |
| `wiggle.ts` | `wiggle({ swing })`: a short damped rotation about the pivot, the far end moving at most 3 px, for `on: { hover: "wiggle" }` |
| `pulse.ts` | `pulse({ times, width, color })`: halos that widen and fade, 1 to 6 times and always within 5 s |
| `gaits.ts` | `gaits.roll()`, `gaits.step()`, `gaits.slide()`: how an icon moves while it travels |
| `combinators.ts` | `sequence`, `parallel`, `only`, and `stagger` (never a default) |
| `define.ts` | `defineEffect` and `defineDataEffect`: effects written outside the library, from their `run` and `end` ([guide](../../docs/effects-guide.md)) |

Planned: `threshold` and `morph`.
