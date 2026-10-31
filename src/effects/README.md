# effects

Effect plugins and combinators. Effects read only `MarkGeometry` (plus `MarkData` for data effects), draw only through the run's context, and never check chart types or import icons (they look icons up by name through `ctx.icons`).

| File | What it holds |
| --- | --- |
| `travel.ts` | `travel(icon, { along, gait, size, orient, ride })`: carries an icon along a walk or a segment, jumping across a line's gaps |
| `flash.ts` | `flash({ width, opacity, color })`: one halo blink along the outline, for `on: { update: "flash" }` |
| `wiggle.ts` | `wiggle({ swing })`: a short damped rotation about the pivot, the far end moving at most 3 px, for `on: { hover: "wiggle" }` |
| `pulse.ts` | `pulse({ times, width, color })`: halos that widen and fade, 1 to 6 times and always within 5 s |
| `trace.ts` | `trace({ color, width, opacity, duration })`: a highlighter stroke drawn along the walk, which stays; the mark itself is untouched |
| `threshold.ts` | `threshold({ compareTo, when, color })`: a data effect that colours the parts of the walk below (or above) a constant or a related series, at once, following every change, and nothing where either has a gap |
| `delta.ts` | `delta({ value, format, color })`: a data effect for the update slot, the change since the last update ("+2") past the mark's own labels, rising into place and staying |
| `label.ts` | `label(text, { color })`: a data effect, usually for decorate, text worked out from the mark's data, placed and risen as `delta`'s is, worded again on every change |
| `caption.ts` | Internal: where `delta`'s and `label`'s text goes (past the end, or past the mark's `labelBounds`, then clear of `nearbyLabels` and other effects' text held in `ctx.texts`, by its own box), what it holds, and its rise |
| `morph.ts` | `morph({ points, align })`: a transition effect that turns one mark's outline into another's, point by point (areas, holes too), by x or along the stroke (lines, gaps kept), or by a crossfade |
| `gaits.ts` | `gaits.roll()`, `gaits.step()`, `gaits.slide()`: how an icon moves while it travels |
| `combinators.ts` | `sequence`, `parallel`, `only`, and `stagger` (never a default) |
| `define.ts` | `defineEffect` and `defineDataEffect`: effects written outside the library, from their `run` and `end` ([guide](../../docs/effects-guide.md)) |

