# effects

Effect plugins and combinators. Effects read only `MarkGeometry` (plus `MarkData` for data effects), draw only through the run's context, and never check chart types or import icons (they look icons up by name through `ctx.icons`).

| File | What it holds |
| --- | --- |
| `travel.ts` | `travel(icon, { along, gait, size, orient, ride })`: carries an icon along a walk or a segment |
| `gaits.ts` | `gaits.roll()`, `gaits.step()`, `gaits.slide()`: how an icon moves while it travels |
| `combinators.ts` | `sequence`, `parallel`, `only` |

Planned: `wiggle`, `pulse`, `flash`, `threshold`, `morph` and `stagger`.
