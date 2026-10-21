# Plan: expressive-charts v0.1

Status: proposal, October 2026. M1 steps 1–6 are built (§9); the sections they cover say so and point to [architecture.md](architecture.md). When a section turns into code, move what's final into architecture.md and the README, and mark the section here as done.

The goal for v0.1 is expressive motion that works on any SVG chart. We prove it two ways: by rebuilding everything in [`demo/lab.html`](../demo/lab.html) on our reference charts (ball-and-cleat bars, the goals vs xG line, the donut-to-bars morph), and by running the same effects on a chart we didn't build. All of it runs through one motion core, one mark contract and one effect interface. The first milestone is the bar chart and a plain-SVG bar adapter, both with the `travel` effect.

## Decisions made while planning

| Topic | Decision |
| --- | --- |
| Toolchain | Upgraded to vitest 5, vite 8, jsdom 29 and tsup 9. Node 20 is dropped (end of life since April 2026). CI tests Node 22 and 24. TypeScript stays on 5.9. |
| Reduced motion | The OS setting forces `off` unless the **viewer** explicitly picks a mode in an on-page control. A mode the **author** sets in code never overrides it. CLAUDE.md rule 6 needs a matching wording change in M1 (see §3.5). |
| Layout | Charts measure their container and lay out in real pixels, so text stays readable at every width. The prototype instead scales a fixed viewBox. |
| Drawing | Effects draw through a small, renderer-neutral context: place an icon, restyle a mark, draw an overlay path. SVG implements it now, and Canvas can implement it later without changing any effect. Icons are stored as path data plus paint, not as raw SVG markup. |
| Product | **Effects first.** Effects plus small adapters are the core, so they also work on SVG marks from D3 and Plot, and on Vega views rendered as SVG (through a small helper; see [ideas/adapter-spike.md](ideas/adapter-spike.md)). Our bar, line and donut charts are reference implementations: complete enough for the demos and everyday use, not a full chart library. (Design session, §11.) |
| Guardrail | **Never distort data.** Effects may add personality or explain a change, but never move, resize or hide data while it's being read. |
| Effect authors | The effect-author API becomes public after M3, once three chart types have proven it. Until then it's marked experimental. |
| Domain | A neutral core (generic icons and gaits). The ball and cleat move to an optional pack, `expressive-charts/icons/sport`, which the demos use. |

## Principles

These come from the design session (§11). Use them to settle disagreements about scope and to review new effects and presets.

1. **Effects first.** The product is expressive motion that works on any SVG chart. Our charts exist to show the effects off and to cover everyday use; we don't compete on chart breadth.
2. **Never distort data.** An effect may add personality or explain a change. It never moves, resizes or hides data while someone is reading it. Decorations go in an overlay. Changes to the marks themselves are small and bounded, for example a wiggle that moves the far end ≤ 3 px.
3. **Information survives reduced motion.** An effect that tells the viewer something (a delta label, a threshold colour) must leave it visible in its end state, because reduced motion shows only end states.
4. **The viewer controls motion.** Every duration goes through `motion`. Reduced motion is honoured unless the viewer picks a mode on the page.
5. **Small pieces, typed seams.** Effects are small and composable. Their kind (geometry, data, transition) and the row type they read are checked at compile time.
6. **Neutral core, optional packs.** Nothing domain-specific (soccer, finance, weather) ships in the core.

---

## 1. Housekeeping (done in this session)

| Commit | What |
| --- | --- |
| `14876e9` | Added `package-lock.json`. CI now runs `npm ci` with `cache: npm`. `actions/checkout@v7` and `actions/setup-node@v7` both run on Node 24, so the Node 20 deprecation warning is gone. |
| `704a6fb` | Dev toolchain upgrade that clears all 6 `npm audit` findings (2 critical: tinypool via vitest 2, esbuild via vite 5). CI matrix is now `[22, 24]`, `engines` is `>=22`, `.nvmrc` is `24`, and README and CONTRIBUTING are updated to match. |

I checked it locally with `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `vite demo`, which serves `lab.html`. CI itself hasn't run yet; it runs on the first push.

---

## 2. The `MarkGeometry` contract

> **Built in M1 step 3**, with the §11 changes. [architecture.md](architecture.md#mark-geometry) is now the reference. Additions to the sketch below:
>
> - `describe.bar` takes an optional `gap`. It comes out of the start of the later segment, so each segment still ends at its value, and it shrinks when the segment before is shorter. The tip rounding fades in as a segment nears the tip, so a growing stack never pops.
> - `describe.line` and `describe.point` are built too (a line's `width` defaults to 1); only `describe.shape` is left.
> - `angle(t)` is normalised to (−π, π], `t` is clamped, and `slice` takes its ends in either order.
> - `sample(n)` throws a `RangeError` unless n is a multiple of 4 (closed) or a whole number (open). The builders throw a `RangeError` naming the field on bad input, and an error on a series listed twice.
> - Segments with no series are keyed `"<mark key>/<index>"`.
> - Path data is absolute `M`, `L`, `A`, `Z` with numbers rounded to 0.001 px; arcs are split into pieces of at most half a turn.

### 2.1 Where the shared contracts live

Charts and effects can't import each other, so every type they share has to live in `core`: `MarkGeometry`, `MarkData`, the effect interfaces, `EffectContext`, the drawing API, events, and `Icon`. The draft architecture names the two contracts but doesn't say where they live. They go in `src/core/contracts/` as types only. Shared geometry math (paths, arcs, arc-length sampling, matrices) goes in `src/core/geometry/`. It's pure math with no DOM, and charts use it to *build* geometry while effects use it to *draw*.

### 2.2 Proposed types

```ts
// src/core/contracts/geometry.ts
export interface Point { readonly x: number; readonly y: number }
export interface Rect  { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface MarkGeometry {
  /** Stable identity across updates. Segments are keyed "<mark key>/<series>". */
  readonly key: string;
  /** The series this mark or segment belongs to, if any ("goals", "xg"). */
  readonly series?: string;

  // The walk: the route from where the data starts to where it ends.
  readonly start: Point;                  // equals path(0)
  readonly end: Point;                    // equals path(1)
  readonly length: number;                // px; 0 for marks with no direction (a scatter dot)
  path(t: number): Point;                 // t in [0, 1], proportional to distance along the walk
  angle(t: number): number;               // direction of travel in radians; the mark's "up" side is angle - PI/2
  slice(t0: number, t1: number): string;  // SVG path data for part of the walk

  // The body: what the mark looks like.
  readonly thickness: number;             // px across the walk: bar height, ring width, stroke width
  readonly outline: Outline;
  readonly bounds: Rect;
  readonly center: Point;                 // visual centre: tooltip, focus ring, labels
  readonly pivot: Point;                  // where the mark is attached to the chart (see table)

  /** Ordered parts (goals, then assists). Every bar has at least one. */
  readonly segments?: readonly MarkGeometry[];
}

export interface Outline {
  readonly d: string;       // SVG path data
  readonly closed: boolean; // true for areas (bars, slices, markers), false for strokes (lines)
  /**
   * n points (n divisible by 4), walking clockwise on screen from the start-left corner:
   * n/4 points along each side, in the order left, end, right, start.
   * Open outlines return n points along the stroke instead. Morph depends on this.
   */
  sample(n: number): readonly Point[];
}
```

```ts
// src/core/contracts/data.ts — only data effects receive this
export interface Sample { readonly t: number; readonly value: number; readonly at?: string | number }

export interface MarkData<D = unknown> {
  readonly datum: D;                      // the row behind the mark (a line series gets all its rows)
  readonly samples: readonly Sample[];    // data values along the walk, t ascending
  related(series: string): MarkData<D> | undefined; // another series in the same chart
}
```

### 2.3 Conventions

- **Space.** Chart pixels: the origin is the chart's top-left corner, y points down, and units are CSS px after layout. The overlay layer effects draw into uses the same space.
- **Arc-length parameter.** `path(t)` is uniform in distance: `t = 0.5` is halfway *along the walk*, not halfway through the data. This gives constant-speed travel, pixel insets, and correct roll rotation.
- **Up side.** "Up" is the left of the direction of travel (`angle - PI/2`). For a bar growing right, up is screen-up. For a donut slice walked clockwise, up is outward. For a column growing up, up is screen-left (see `orient` in §4.6).
- **Missing vs zero.** If a series isn't in the stack, it has no segment. A zero value gives a segment with `length` 0. Effects treat both the same way: a walk shorter than 0.5 px finishes at once and draws nothing.
- **Gaps.** A segment's walk covers only its own drawn span. The 2 px gap between goals and assists belongs to neither segment.
- **One segment minimum for bars.** A plain bar (`x: "goals"`) has one segment named `goals`, so `travel(…, { along: "goals" })` works whether or not the chart is stacked.

### 2.4 How each chart fills it in

| Field | Bar | Stacked bar row | Line series | Line point | Donut slice |
| --- | --- | --- | --- | --- | --- |
| `key` | category (`Okafor`) | `Okafor`; segments `Okafor/goals` | series (`goals`) | `goals@12` | category (`Saved`) |
| walk | baseline → tip along the centre line | whole stack; each segment its own span | first point → last *revealed* point | first point → this point | start angle → end angle on the mid-radius arc, clockwise |
| `angle` | 0 (π if negative, −π/2 for columns) | same | per polyline segment | same | arc tangent |
| `thickness` | bar height | bar height | stroke width | marker diameter | R − r |
| `outline` | rounded rect, closed | union of segments, closed | the line, open | marker circle, closed | annular sector, closed |
| `pivot` | middle of the baseline edge | same | first point | the point | donut centre |
| `center` | middle of the bar | middle of the stack | `path(0.5)` | the point | mid-angle, mid-radius |
| `segments` | one, named after the value field | one per stacked series, in stack order | none | none | none |
| `samples` | `[0 → v]` | `[0 → total]`; each segment covers its own range | one per vertex | one per vertex, up to the point | `[0 → share]` |

Marks with no direction (future scatter dots) have `length` 0 and `start = end = center`. Travel does nothing on them; wiggle, pulse and flash still work.

### 2.5 Paper test: every effect against every mark

| Effect | Reads | Bar | Stacked | Line series | Line point | Slice | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `travel` | walk, `length`, `thickness`, `segments` | ✓ | ✓ via `along` | ✓ rides the stroke | ✓ rides up to the point | ✓ rolls around the ring | Insets need `length`, rolling needs distance, sizing needs `thickness`. Polyline corners need angle smoothing. |
| `wiggle` | `pivot`, `length` | ✓ rotates about the baseline | ✓ whole row | ✓ (barely visible on long marks, by design) | ✓ | ✓ rotates about the donut centre | The swing is capped so the far end moves ≤ 3 px and data stays readable. |
| `pulse` | `outline`, `thickness` | ✓ halo | ✓ | ✓ glow along the stroke | ✓ | ✓ | Uses a halo, never a scale change, so values don't look bigger. |
| `flash` | `outline` | ✓ | ✓ | ✓ | ✓ | ✓ | A single halo blink, as in the prototype. |
| `threshold` | `slice`, `samples`, `related` | ✓ against a constant (colours the part below a target, or past it with `when: "above"`) | ✓ | ✓ against another series | n/a (series level) | allowed but meaningless | Data effect. |
| `morph` | `outline.sample` | ✓ | ✓ | open ↔ open only | ✓ | ✓ | Transition effect: it takes two geometries. |

Every cell is filled with no chart-type branch. The two cells marked "meaningless" are valid but not useful; that's a documentation issue, not a contract gap.

### 2.6 What the draft in architecture.md is missing

1. **Arc-length parameterisation and `length`.** Without them, travel speed varies with data density, the ball's roll can't be computed, and you can't inset an icon by its own size.
2. **`thickness`.** Icon sizing, halo width, and threshold stroke width all need it.
3. **`slice(t0, t1)`.** Threshold needs it, and so do travel trails and the line's progressive reveal.
4. **An orientation convention.** The units of `angle`, which side is "up", and what happens with negative bars and columns.
5. **`pivot`, `center`, `bounds`.** Wiggle, tooltips, focus rings and culling all need these.
6. **`outline.closed` and canonical sampling.** Morph needs matched corners and winding, not just path data.
7. **Ordered segments with a `series` name.** A `Record` can't express stack order or the missing-vs-zero distinction.
8. **A separate data channel (`MarkData`).** Data effects need values along the walk and access to related series. The draft only says "geometry and datum".
9. **Live geometry.** Geometry changes during transitions, resizes and line reveals, and persistent effects like `threshold` must follow. The draft treats geometry as a one-off snapshot; see `ctx.onChange` in §4.2.
10. **Where per-run state lives.** One `flash` effect object runs on 8 bars at once, so effects must be stateless, with per-run state on the context (§4.3).
11. **How effects touch the screen.** The draft says effects "describe what to draw" but defines no API for it (§4.2).
12. **Where the contracts live** (core, §2.1), and the **event payload**: an update needs the `from` geometry, and stagger needs the mark's position in a batch.

---

## 3. Motion core

> **Built in M1 step 2.** [architecture.md](architecture.md#core) is now the reference. Additions to the sketch below: `Tween.state`; `delay` on tweens; `Animated.target`, `animating` and `stop()`; an `onChange` option on `animated`; `Motion.clearChoice()`; and an injectable `ReducedMotionSource`.

Everything in this section is in `src/core` with no DOM dependency except `matchMedia` and `requestAnimationFrame`. Both are injected, so tests and Node imports don't touch them.

### 3.1 Clock

```ts
export interface Clock {
  now(): number;
  onFrame(callback: (now: number) => void): () => void; // unsubscribe
}
export function createClock(source?: FrameSource): Clock; // one shared rAF loop; idle when nothing is subscribed
export function manualClock(): Clock & { advance(ms: number): void }; // for tests
```

A single `requestAnimationFrame` loop drives every tween on the page and stops when nothing is animating. When a background tab returns, the large time step simply finishes any tweens that were running.

### 3.2 Tweens, animated values and cancellation

```ts
export interface TweenOptions {
  readonly duration: number;               // base ms; scaled by motion
  readonly timing?: Timing;                // default "transition"
  readonly ease?: Easing;
  readonly update: (progress: number) => void; // eased 0–1
  readonly signal?: AbortSignal;
}
export interface Tween {
  readonly finished: Promise<"done" | "cancelled">; // never rejects, so hover spam can't cause unhandled rejections
  cancel(): void;
  finish(): void;                          // jump to the end now
}

/** A value that can be retargeted mid-flight. */
export interface Animated<T> {
  readonly value: T;
  to(target: T, options: { duration: number; timing?: Timing; ease?: Easing; delay?: number }): Promise<"done" | "cancelled">;
  set(value: T): void;                     // jump, cancelling any running animation
}
export function animated<T>(initial: T, interpolate: Interpolator<T>, env?: MotionEnv): Animated<T>;
```

- **Starting from the in-between state.** `animated.to()` cancels whatever is running on that value and starts from `value` as it is right now. Charts keep one `Animated` per mark property (segment sizes, row slot) plus one for the scale domain, so a sort during a resize just bends the motion toward the new target.
- **No stall on retarget.** If a tween is interrupted mid-flight, the new one uses ease-out instead of ease-in-out. Otherwise the motion visibly pauses where the new ease-in starts at zero speed.
- **Zero duration is synchronous.** `update(1)` is called immediately and the promise resolves without waiting for a frame. This keeps reduced motion and tests deterministic.
- The interpolators provided are number, point and numeric record. Path interpolation belongs to `morph`.

### 3.3 Easing

`easeInOutCubic` for data transitions, `easeOutCubic` for travel and retargets, `linear` for playback. An easing is a plain function `(t: number) => number`, so users can pass their own.

### 3.4 Modes and duration scaling

```ts
export type MotionMode = "presentation" | "analysis" | "off";
export type Timing = "feedback" | "transition" | "effect" | "playback";

export interface MotionView {               // what charts and effects see
  readonly mode: MotionMode;                // effective mode, after the reduced-motion rule
  readonly staged: boolean;                 // true only in presentation
  duration(base: number, timing?: Timing): number; // 0 means "jump to the end"
}

export interface Motion extends MotionView {
  readonly requested: MotionMode;           // what the author asked for
  readonly viewerChoice?: MotionMode;       // what the viewer picked on the page, if anything
  readonly prefersReduced: boolean;         // live value of the media query
  setMode(mode: MotionMode): void;          // author default; never overrides reduced motion
  chooseMode(mode: MotionMode): void;       // viewer choice from an on-page control
  subscribe(listener: () => void): () => void;
}

export function createMotion(options?: { mode?: MotionMode; scaling?: Partial<ScalingTable> }): Motion;
export const motion: Motion;                // page-wide default that every chart follows unless given its own
```

Every duration in the library goes through `duration(base, timing)`. Nothing calls `setTimeout` or sets a CSS duration directly. CSS hover transitions read `--ec-hover-duration`, which the chart sets from `duration(100, "feedback")`.

Starting values, taken from the prototype and tuned in the demo:

| Timing | Used for | Presentation | Analysis | Off |
| --- | --- | --- | --- | --- |
| `feedback` | hover colour and dimming | base (≈100 ms) | base (≈100 ms) | 0 |
| `transition` | data changes | base, staged (≈500 + 500 ms) | base × 0.35, max 200 ms, not staged | 0 |
| `effect` | travel, wiggle, flash, pulse | base | base × 0.35, min 140, max 300 ms | 0, so `end()` is used |
| `playback` | "Play season" | base | base × 0.3 | 0: jumps to the end |

A rule is `{ factor, min?, max? }`, and the result is `clamp(base × factor, min(base, min), max)`. A floor never makes an animation longer than its base.

### 3.5 Reduced motion

```
effective mode = viewerChoice ?? (prefersReduced ? "off" : requested)
```

- `prefers-reduced-motion` is read live and re-evaluated when it changes.
- `chooseMode()` is only called by on-page controls the viewer operates. The library ships `motionSwitch(element, motion)`, the prototype's segmented control, which calls it. While the OS asks for reduced motion and no viewer choice has been made, the switch shows Off as selected along with a short note explaining why.
- An author's `motion: "presentation"` in code is a `setMode()` call, so it never beats the OS setting.
- The viewer's choice lasts for the page session. Persisting it is an open question (§10).
- **CLAUDE.md rule 6 changes in M1 to:** "When the effective mode is `off` (the mode is off, or the user prefers reduced motion and hasn't picked a mode on the page), every animation jumps to its end state."

### 3.6 Staging

`motion.staged` tells charts to split a data change into stages, skipping any stage with nothing to do. The prototype runs both stages even when only the order changes. Stage order is in §5.5. Staging is presentation-only; analysis runs everything as a single ≤ 200 ms stage.

---

## 4. Effects

> Updated by the design session: `ctx.previous`, `data.previous`, `Layer.text()` and the author helpers are in [`sketches/api.ts`](sketches/api.ts) (§11).
>
> **The contracts in §4.1 and §4.2 are built in M1 step 3** (`src/core/contracts/`), along with `matrix`, `offset` and the recording layer in `src/core/testing/`. [architecture.md](architecture.md#effects) is now the reference. Additions: `AnyMarkEffect` is exported for combinator signatures; the icon resolver is named `IconSource`; `mark.set()` merges the fields given (undefined resets one), so parallel effects don't undo each other; an icon is hidden until first placed; `matrix.apply(m, point)`; and `testContext()`, a ready-made `EffectContext` on a manual clock. The runner (§4.3) is built in M1 step 4. `travel` with its gaits and the combinators `sequence`, `parallel` and `only` are built in M1 step 6 (§4.4–§4.6); the other effects and `stagger` are still to come.

### 4.1 Interfaces

```ts
// src/core/contracts/effect.ts
export interface GeometryEffect {
  readonly kind: "geometry";
  run(mark: MarkGeometry, ctx: EffectContext): Promise<void>; // resolves when done or cancelled
  end(mark: MarkGeometry, ctx: EffectContext): void;          // draw the final state immediately
  clear(ctx: EffectContext): void;                            // extra cleanup beyond what the runner does
}

export interface DataEffect<D = unknown> {
  readonly kind: "data";
  readonly needs?: { readonly related?: readonly string[] };  // checked when the chart is created
  run(mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext): Promise<void>;
  end(mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext): void;
  clear(ctx: EffectContext): void;
}

/** Morph and future chart-to-chart transitions: from one geometry to another. */
export interface TransitionEffect {
  readonly kind: "transition";
  run(from: MarkGeometry, to: MarkGeometry, ctx: EffectContext): Promise<void>;
  end(from: MarkGeometry, to: MarkGeometry, ctx: EffectContext): void;
  clear(ctx: EffectContext): void;
}

export type MarkEffect<D = unknown> = GeometryEffect | DataEffect<D>;
```

**Geometry effects vs data effects.** The `kind` discriminator and the extra `data` argument keep the difference explicit (CLAUDE.md rule 8):

- A geometry effect *can't* read values; it only has the `MarkGeometry`.
- A data effect declares what it needs (`needs.related: ["xg"]`). The chart checks this when it's created and throws a clear error if, say, there's no `xg` series. This avoids drawing nothing silently.
- Charts always compute `MarkData`. It's cheap and only passed to data effects.
- Combinators carry the kind through (§4.4), so `sequence(travel(...), threshold(...))` is typed as a data effect.

### 4.2 Effect context and drawing API

```ts
export interface EffectContext {
  readonly signal: AbortSignal;            // aborted on leave, re-trigger, data update or destroy
  readonly motion: MotionView;
  tween(options: TweenOptions): Tween;     // clock, motion and signal already bound
  readonly mark: MarkHandle;               // restyle the mark itself; reset by the runner on clear
  readonly layer: Layer;                   // this run's own overlay group, above the marks; emptied on clear
  readonly icons: IconSource;              // resolves icon names
  readonly batch: { readonly index: number; readonly count: number }; // position in a multi-mark event
  onChange(listener: (mark: MarkGeometry, data?: MarkData) => void): void; // geometry moved; unsubscribed on clear
}

export interface MarkHandle { set(style: MarkStyle): void; reset(): void }
export interface MarkStyle {
  readonly transform?: Matrix;
  readonly opacity?: number;
  readonly emphasis?: number;              // 0–1 toward the series' strong colour
  readonly halo?: { readonly width: number; readonly opacity: number; readonly color?: Color };
}

export interface Layer {
  icon(icon: Icon, options?: { size?: number }): IconHandle;
  path(d: string, paint: Paint): PathHandle;
}
export interface IconHandle { place(transform: Matrix): void; remove(): void }
export interface PathHandle { update(d: string, paint?: Partial<Paint>): void; remove(): void }
export interface Paint { readonly fill?: Color; readonly stroke?: Color; readonly width?: number; readonly opacity?: number }
export type Color = string;  // a theme token ("negative", "series-3", "mark" = this mark's colour) or any CSS colour
export type Matrix = readonly [number, number, number, number, number, number];
```

This is the entire surface effects draw through. It's deliberately small and covers all six planned effects. SVG implements it in `src/charts/render/` (built in M1 step 5, which also settled how an icon's `size` combines with `place()`: see [architecture.md](architecture.md#drawing-api)). An in-memory recording version in `src/core/testing/` lets effects be unit-tested with no DOM at all.

### 4.3 Lifecycle rules (owned by the runner, not by each effect)

> **Built in M1 step 4** (`src/core/runner.ts`, internal). [architecture.md](architecture.md#runner) is now the reference. Additions to the rules below:
>
> - A hover that arrives during a data transition waits until the chart calls `settle()`, so nothing starts on a mark that's still moving. Replays go in the order the marks were hovered, with their latest geometry.
> - If the mode turns off mid-run, runs still going are cleared and replaced by `end()` on a fresh context. Runs that already finished keep what they drew.
> - Finished runs stay drawn, styled and subscribed to `onChange` until they're cleared.
> - Exit clears the mark's other runs, including hover; a leaving mark can't be hovered; a re-enter cancels the exit. `exit()` resolves when every exit is done.
> - Each run's mark style is its own; the runner merges all live runs' styles into the mark's one handle, and a later run wins a shared field. Overlay groups stack in the same start order, and a run replaced by `end()` keeps its place.
> - Draws and styles after a run is cleared are ignored, and a rejection caused by the run's own abort isn't reported.
> - On update, `ctx.previous` and `data.previous` default to the last geometry and data seen for the key.
> - The renderer implements `RunnerSurface` (`group(key, slot, order)`, `mark(key)`); `testContext()` is built on the runner's own run scope.

`src/core/runner.ts` connects chart events to effects, so each effect doesn't have to reimplement this:

- **Effects are stateless.** A factory like `travel("cleat")` returns an immutable object that can run on many marks at once. Per-run state lives on the context: each run gets its own `layer` group and `mark` handle.
- **One run per (mark, slot).** Re-triggering aborts the previous run, clears it, then starts again.
- **Effective mode `off`.** The runner calls `end()` on a fresh context instead of `run()`. `end()` is always called on a fresh context, so it never has to undo a half-finished run.
- **Leave and destroy.** Abort, call `effect.clear(ctx)`, then empty `layer` and reset `mark`. This cleanup happens even if the effect forgets.
- **Data updates.** Hover runs are aborted and cleared when a transition starts. Once it settles, they replay on the mark that's still hovered or focused (the prototype does this). Decorations keep running and get `onChange` on every frame.
- **Errors.** A throwing effect is logged and cleared. It never breaks the chart.

### 4.4 Combinators

> **Built in M1 step 6** (`sequence`, `parallel`, `only`, in `src/effects/combinators.ts`); `stagger` comes in M3. [architecture.md](architecture.md#combinators) is now the reference. Additions: the parts share the run's context; `clear()` clears every part and passes on the first error after all have run; `parallel` rejects with the first part that rejects; a data combination's `needs.related` lists every part's; `only` matches a mark's key or series and keeps the effect's kind and `needs`; a part that isn't a mark effect throws a `TypeError`.

```ts
sequence(...effects)            // run in order; abort stops the chain; end() = every child's end() in order
parallel(...effects)            // run together; resolves when all finish
stagger(effect, { delay })      // offset each mark's start by batch.index × delay; total spread capped;
                                // 0 in analysis and off; never a default (research: little benefit)
only(filter, effect)            // run only on matching marks: a series name, a key, or a predicate
```

All of them preserve the kind: if any child is a `DataEffect`, the result is a `DataEffect`. This is computed with a conditional type and checked with `expectTypeOf` tests. Transition effects can't be mixed with mark effects, and that's a type error.

`sequence` is what makes the Goals + assists story work. In Goals view the assists segment doesn't exist, so the cleat step finishes at once. In Assists view the goals step does. In Goals + assists view, the ball rolls, stops and stays, then the cleat walks on. Neither the effect nor the chart needs a special case.

### 4.5 The first effects

| Effect | Kind | What it does | End state |
| --- | --- | --- | --- |
| `travel(icon, { along?, gait?, size?, orient?, ride? })` | geometry | Moves an icon along the walk (or along a named segment), inset by the icon's footprint so it stays inside the mark. The duration's base is `max(260 ms, length ÷ 360 px/s)` with `effect` timing. | The icon rests at the end. |
| `wiggle({ swing? })` | geometry | A short damped rotation about `pivot`, with the angle capped so the far end moves ≤ 3 px. | No transform. |
| `pulse({ times = 2 })` | geometry | A halo along the outline that grows and fades. Repeats are bounded, and `times` is capped so it finishes in under 5 s. | Nothing. |
| `flash()` | geometry | One halo blink (the prototype's `stroke-width` 0 → 8 → 0). | Nothing. |
| `threshold({ compareTo, when = "below", color = "negative" })` | data | Finds where `samples` fall below (or, with `when: "above"`, above) the reference (a series or a constant), interpolates the crossings, and draws `slice()` overlays. Redraws on `onChange`. | The overlays drawn. |
| `morph({ points = 160 })` | transition | Interpolates `outline.sample(n)` side by side between two geometries. | The target outline. |

### 4.6 Travel options

> **Built in M1 step 6** (`src/effects/travel.ts`, `src/effects/gaits.ts`). [architecture.md](architecture.md#travel) is now the reference. Decisions and additions:
>
> - **Icon size and `place()`.** The drawing layer scales an icon by `size / icon.size` about its anchor, then applies `place()`, so travel builds `place()` for the icon's natural size and rotates about the pivot as the scale moves it. Icon units are px at the natural size.
> - **Duration** is measured on the distance the icon actually travels (the walk minus the footprint), as the prototype does, times the gait's `pace`.
> - **Gaits** can carry their own `ease` and `pace`: `step` eases in and out and takes 15% longer, as the prototype's cleat does. `GaitState` gives distances in the icon's own units and its rolling `radius` (instead of the sketch's `size`), so a gait looks the same at any size. The pose's `spin` and `tilt` are radians; `step`'s `tilt` option is degrees.
> - **`along`** also matches a mark with no segments whose series is the name (a line series).
> - **Too short.** On a walk shorter than the footprint, the icon rests at the inset start; on one shorter than the inset itself, it carries on past the end along the end's heading, as the prototype's ball sits clear of the baseline.
> - **`"fit"`** scales the icon so its box is 85% of the thickness *across* the walk, so a long icon (the cleat) isn't shrunk to fit its length into the bar's height.
> - **`ride: "on"`** offsets by half the thickness plus the anchor's height above the icon's bottom, towards the icon's own up side (after mirroring).
> - **`orient: "auto"`** decides mirroring on every frame from the smoothed heading. **Smoothing** uses the chord across half the icon's length either side, which is exact on straight legs and arcs.
> - **Geometry changes.** The icon follows `onChange` at its current progress, so a resize keeps a resting ball at the bar's end.

- **`gait`** controls how the icon moves: `roll` (spin = distance ÷ radius, about the icon's pivot), `step({ stride: 42, lift: 3.2, tilt: 9 })` (the prototype's cleat), or `slide`. Gaits are small functions in `src/effects/gaits.ts`, chosen by `options.gait`, then the icon's default, then `slide`. Gaits never name icons, and icons never name effects.
- **`size`** is a number in px, `"fit"` (85% of `thickness`), or by default the icon's own size.
- **`orient`** is `"follow"` (rotate with `angle`), `"level"` (never rotate), or the default `"auto"`: follow, but mirror instead of turning upside down if the icon is marked `upright` (the cleat). That fixes negative bars and keeps the cleat's sole down.
- **`ride`** is `"center"` (default: the icon is centred on the walk, as on the bars) or `"on"` (sits on top of the walk, offset to the up side; for a ball riding a line).
- At polyline corners, the angle is smoothed over a short window so the icon doesn't snap.
- If a walk is shorter than the icon's footprint, the icon is placed at the start and doesn't move. If the walk is shorter than 0.5 px, nothing is drawn.

---

## 5. Chart API

> Updated by the design session: effect slots now live under `on: { … }` and use `NoInfer`, and adapters (`expressive()`) share these events and slots. See [`sketches/api.ts`](sketches/api.ts) and §11.
>
> **A thin `barChart` is built in M1 step 5** (`src/charts`); [architecture.md](architecture.md#reference-charts) is now the reference for it. Differences from the sketch below and decisions made there:
>
> - `focus()` (step 9), `tooltip` and `table` (M2) aren't built, so `barChart` is still declared in the sketch, extending the built option and chart types.
> - `update()` jumps to the new state (staged transitions are step 8) and can't change `on` or `motion` yet. It rejects, changing nothing, on data it can't draw.
> - `sort` defaults to `"none"` (data order). `"key"` sorts keys with numbers in numeric order.
> - Bars are coloured by series through a `ColorAssignment` (`colorAssignment()` is built). Colouring each category, as the morph example needs, is open until M5.
> - `motion: "analysis"` is this chart's author default, like `setMode()`: the viewer's choice on the page-wide motion and reduced motion still win.
> - `dim: false` stops the other marks dimming; the hovered mark still takes its strong colour.
> - Missing values count as 0; negative bars grow the other way from zero; a stack that mixes signs throws.
> - A data effect's `needs.related` is checked against the chart's series when it's created and on every update.
> - Charts get the registries and the page-wide motion from the composition root as a `ChartEnv`, so they import nothing outside core.

### 5.1 Shared shape

```ts
type Accessor<D, T> = (keyof D & string) | ((d: D, i: number) => T);
type EffectOption<D> = MarkEffect<D> | PresetName;      // "wiggle" | "pulse" | "flash" | custom registered names

interface ChartOptions<D> {
  data: readonly D[];
  key?: Accessor<D, string>;           // default: the category accessor; duplicate keys throw
  motion?: Motion | MotionMode;        // default: the page-wide `motion`
  label: string;                       // accessible name; required (README examples gain one in M1)
  description?: string;
  hover?: EffectOption<D>;             // runs on hover/focus; cleared on leave
  enter?: EffectOption<D>;             // when a mark appears
  update?: EffectOption<D>;            // when a mark's values change (not on re-sort)
  exit?: EffectOption<D>;              // before a mark is removed; removal waits for it
  decorate?: EffectOption<D>;          // from enter until exit; follows geometry changes
  tooltip?: boolean | ((d: D) => string);
  table?: boolean | "hidden";          // data-table fallback, default true
  format?: (value: number) => string;
  colors?: ColorAssignment | Record<string, number>;
  width?: number; height?: number;     // fixed size; default measures the container
}

interface Chart<D, O extends ChartOptions<D>> {
  update(next: Partial<O>): Promise<void>;          // resolves when settled, or early if superseded
  on<K extends keyof ChartEvents<D>>(type: K, listener: (e: ChartEvents<D>[K]) => void): () => void;
  marks(): readonly MarkGeometry[];
  focus(key: string): void;
  readonly element: SVGSVGElement;
  destroy(): void;
}
```

### 5.2 The three charts

```ts
// Bars. The axis whose values aren't numbers is the category; `orientation` can force it.
barChart<Player>("#goals", {
  label: "Goals and assists by player",
  data: players,
  y: "name",
  stack: ["goals", "assists"],        // or x: "goals" for a single series (still one segment named "goals")
  sort: "value",                      // "value" | "key" | "none" | comparator
  hover: effects.sequence(
    effects.travel("soccer-ball", { along: "goals" }),
    effects.travel("cleat", { along: "assists" })
  ),
  colors: { goals: 1, assists: 4 }    // fixed palette slots, as in the prototype
});
chart.update({ stack: ["assists"] }); // metric switch; the goals segments exit
chart.update({ sort: "key" });

// Lines. One row per x; each listed field becomes a series mark plus point marks.
lineChart<Week>("#xg", {
  label: "Goals vs expected goals",
  data: weeks, x: "week", series: ["goals", "xg"],
  decorate: effects.only("goals", effects.threshold({ compareTo: "xg" })),
  pointer: "x"                        // pointer snaps to the nearest x; hover fires for every series' point there
});
chart.reveal(24.5);                   // show data up to x, instantly; used by playback

// Donut
donutChart<Outcome>("#shots", { label: "Shot outcomes", data: outcomes, key: "outcome", value: "shots", center: (total) => `${total} shots` });
```

### 5.3 Events

```ts
interface MarkEvent<D> { mark: MarkGeometry; data: MarkData<D>; batch: { index: number; count: number } }
interface ChartEvents<D> {
  enter: MarkEvent<D>;
  update: MarkEvent<D> & { from: MarkGeometry };
  exit: MarkEvent<D>;
  hover: MarkEvent<D> & { source: "pointer" | "keyboard" | "touch"; segment?: string };
  leave: MarkEvent<D>;
}
```

Effect slots and `chart.on()` both consume the same event stream. Data events fire when a transition *starts*, carrying the target geometry. Touch taps act as hover until the viewer taps somewhere else.

### 5.4 Presets

Charts resolve a string like `hover: "wiggle"` through a `PresetRegistry` that's handed to them. The interface is in `core`, so the chart never knows what the name means. The registry is filled in **`src/index.ts`, the composition root**, the only file that imports both charts and effects:

```ts
// src/index.ts (sketch)
const presets = createRegistry<() => MarkEffect>({ wiggle: () => wiggle(), pulse: () => pulse(), flash: () => flash() });
const icons   = createRegistry<Icon>({ "soccer-ball": soccerBall, cleat });
export const barChart = withDefaults(charts.barChart, { presets, icons, motion });
export { registerPreset, registerIcon };
```

An unknown preset name throws when the chart is created. `PresetName` is a union of the built-in names plus `(string & {})`, so editors autocomplete the built-ins.

> **Built in M1 step 4.** `createRegistry({ kind, entries, hint })` and `resolveEffects(on, presets)` are in `src/core/registry.ts`. The page-wide registries and `registerPreset`, `registerIcon` and `registerIcons` are in `src/registries.ts`, re-exported by `src/index.ts`. A later registration replaces an earlier one. The built-in presets are registered in M3, with their effects. See [architecture.md](architecture.md#presets-and-icons-by-name).

The basic hover feedback (100 ms emphasis, other marks dimmed to 0.3) isn't an effect. It's built into every chart through a shared helper, because it touches *other* marks, which effects never do. You can turn it off with `dim: false`.

### 5.5 How charts update when data changes

1. Merge the options and compute the target layout: scales, slots, segments, and target geometry per key.
2. Diff by key into four groups: **enter**, **exit**, **value change**, and **move only** (a re-sort).
3. Interrupt hover runs (§4.3).
4. Animate each mark's `Animated` properties toward the target:
   - **Presentation:** stage 1 (values): existing marks resize, exiting marks shrink to zero, and the scale and axis ticks retarget. Stage 2 (positions): rows move to their new slots, and entering marks grow in at their new slots during the second half. Empty stages are skipped, and the base is about 500 + 500 ms.
   - **Analysis:** everything at once, ≤ 200 ms.
   - **Off:** jump.
5. On each frame: write attributes (transforms for movement, `d` for resizing), fire `onChange` for decorations, and update value labels.
6. When settled: update the data table and ARIA labels, then replay hover.
7. If another `update()` arrives mid-flight, it retargets from the current in-between values.

Resizes (from the ResizeObserver) re-lay out immediately without animating, and do fire `onChange`.

### 5.6 Layout and sizing

The chart reads its container's width (ResizeObserver, batched to one per frame) and lays out in px. A bar chart's height comes from its content (rows × row height + axis). Line and donut charts take `height` or an aspect ratio. Label widths are measured with a canvas `measureText` using the computed font, with a character-width estimate where there's no canvas (jsdom). Fonts are inherited from the page; the library never loads web fonts.

### 5.7 Switching between charts (morph)

```ts
const view = chartSwitch("#shots", {
  views: { donut: (el) => donutChart(el, {...}), bars: (el) => barChart(el, {...}) },
  transition: effects.morph(),
  colors: sharedColors                // so "Goal" is the same colour in both
});
view.show("bars");
```

`chartSwitch` only relies on the `Chart` interface. It matches marks by key, hides both charts' marks, runs the transition effect for each pair in the overlay, and then reveals the target. Labels are matched by mark key too: they tween position and swap text at the midpoint, as in the prototype.

---

## 6. Icons

> Updated by the design session: the core ships neutral icons (`dot`, `arrow`, `chevron`); the ball and cleat move to `expressive-charts/icons/sport`.
>
> **Built in M1 step 6** (`src/icons/`, `src/icons/sport/`). [architecture.md](architecture.md#icons) is now the reference. Additions: shapes are in px at the icon's natural size (`size` defaults to the box's width); `IconShape` gains `linecap` and `linejoin` (the cleat needs them), and an unset fill or stroke draws none; `defineIcon` also defaults `radius` and freezes the icon; `iconFromSvg` applies transforms, inherits paint from groups and `style`, rewrites path data from its numbers, keeps only plain colours, and scales the icon to `size` (its spec is in the SVG's units). The core icons are drawn in theme colours. The cleat's box is (0, −14.5, 26, 17.5) with `size` 26. The sport pack is a second build entry and a package `exports` entry; the script-tag bundle doesn't include it.

```ts
// src/core/contracts/icon.ts
export interface IconShape { readonly d: string; readonly fill?: Color; readonly stroke?: Color; readonly width?: number; readonly clip?: string }
export interface Icon {
  readonly name: string;
  readonly shapes: readonly IconShape[];  // drawn facing +x, in icon units
  readonly box: Rect;                     // icon-space bounds
  readonly size: number;                  // default rendered length along the walk, px
  readonly anchor: Point;                 // the icon-space point that sits on the walk
  readonly pivot: Point;                  // what it spins or tilts around
  readonly footprint: readonly [behind: number, ahead: number]; // extent along +x from the anchor
  readonly gait?: "roll" | "step" | "slide";
  readonly radius?: number;               // rolling radius; default box height / 2
  readonly upright?: boolean;             // mirror instead of turning upside down
}
export function defineIcon(spec: IconSpec): Icon; // fills defaults, validates
```

The two built-ins, converted from the prototype:

| Icon | `anchor` | `pivot` | `footprint` | `gait` | Notes |
| --- | --- | --- | --- | --- | --- |
| `soccer-ball` | centre | centre | 8.5 / 8.5 | `roll` | The panel pattern uses `clip`. |
| `cleat` | (0, −6): heel, raised so the boot sits centred in the bar | (13, −4), the ball of the foot | 0 / 26 | `step` | `upright: true` |

- **Registering and swapping.** `registerIcon(defineIcon({...}))` adds or replaces an icon by name, so re-registering `"soccer-ball"` swaps it everywhere. `travel()` also accepts an `Icon` object directly, which tree-shakes better.
- **Getting SVG in.** `iconFromSvg(markup, spec)` converts `path`, `circle`, `rect`, `ellipse`, `line` and `polygon` elements into shapes and drops everything else (scripts, event handlers, `<use>`). It's safe for untrusted input, and Canvas can draw the result as `Path2D`.
- Effects never import `src/icons`. They resolve names through `ctx.icons`, which the composition root fills in.
- Icon colours are fixed hex values (a white ball is white in any theme) or theme tokens such as `"surface"`.

---

## 7. Theming and accessibility

### 7.1 Theme tokens

> **Partly built in M1 step 5:** the tokens below are read with the prototype's light palette as fallbacks (eight series slots, the last four provisional), through one injected stylesheet using `:where()`. Dark-mode defaults, `data-theme`, the validated eight colours and the `nonce` option are still to come (M2).

The prefix is `--ec-`. Defaults come from the prototype palette:

| Token | Use |
| --- | --- |
| `--ec-surface` | chart background; slice separators; marker rings |
| `--ec-text`, `--ec-text-muted` | values and labels; ticks and secondary text. **Text never uses a series colour.** |
| `--ec-grid`, `--ec-axis` | gridlines, baselines |
| `--ec-focus` | focus ring |
| `--ec-series-1` … `--ec-series-8`, each with a `-strong` variant | marks; `-strong` for hover emphasis |
| `--ec-negative` | below-threshold (the prototype's `--under`) |
| `--ec-dim-opacity` | opacity of other marks on hover (0.3) |
| `--ec-hover-duration` | set by the chart from `motion` |

- **Light and dark.** Dark mode follows `prefers-color-scheme` and can be overridden with `data-theme="light"|"dark"` on any ancestor, which generalises the prototype's `:root` rule. Default rules use `:where()` so host CSS overrides them without specificity fights.
- **Delivery.** By default the chart injects one small `<style>` once, with a `nonce` option. `dist/expressive-charts.css` is also shipped with `injectStyles: false` for strict CSP sites (open question, §10).
- **Categorical colours follow the entity.** A `ColorAssignment` maps series or category keys to palette slots in the order they're first seen and never reassigns them. Sorting, filtering and updates can't change a colour. It can be shared between charts (needed for morph) or pinned (`{ goals: 1, assists: 4 }`). The prototype's four colours expand to eight in M2, each checked for ≥ 3:1 contrast against both surfaces.

### 7.2 Accessibility

- **Structure.** Each mark gets an `aria-label` built from `describe(d)`, defaulting to "Okafor: 16 goals, 4 assists". The SVG gets the chart's `label` and `description`. The exact ARIA roles (`group`/`list`/`listitem` vs `graphics-*`) are picked in M2 after testing with NVDA + Chrome and VoiceOver + Safari.
- **Keyboard.** Each chart is one tab stop (roving `tabindex`). Arrow keys move between marks in visual order, following the current sort, and Home/End jump to the ends. Focus fires `hover` (`source: "keyboard"`), so effects play. Escape or blur fires `leave`. The focus ring is drawn from `mark.outline` in `--ec-focus`, because browser focus outlines on SVG are inconsistent.
- **Data table.** On by default: a `<details>` "Data table" after the chart, as in the prototype. It follows the current sort and updates with the data. `"hidden"` makes it visually hidden but readable by screen readers.
- **Pause controls (WCAG 2.2.2).** Nothing auto-plays by default. The `playback()` controller (play, pause, seek, stop) comes with a `playButton()` helper whose label switches between Play and Pause. Effects can't loop forever in v0.1: `pulse` repeats are capped below 5 s. If looping is ever added, the chart must render a pause control.
- **Tooltips** are `aria-hidden`, since the same text is in the mark's label and the table. On touch they follow the tap.
- **Updates.** An optional polite live region announces summaries like "Sorted A–Z". It's off by default (open question).

---

## 8. Testing strategy

**Unit tests in jsdom, or with no DOM at all.** These are the bulk of the tests:

- **Geometry.** The walk is arc-length uniform (`|path(t+dt) − path(t)| ≈ length·dt`), `angle` matches a finite difference, `slice(0, 1)` has the full length, and `sample(n)` puts corners at multiples of n/4. This is checked for bar, stacked, line, point and slice builders, including zero, negative and missing values.
- **Core.** On a `manualClock`: tween progress at given times, easing values, the mode × timing scaling table, retargeting mid-flight from the in-between value, zero duration being synchronous, and reduced motion (a stubbed `matchMedia`) with viewer override vs author mode.
- **Runner.** Off calls `end()` instead of `run()`. One run per (mark, slot). Leave clears everything. Data updates interrupt hover and replay it. A throwing effect is contained.
- **Effect conformance suite.** For every built-in chart fixture × every effect, using the recording `Layer`:
  1. A full run produces the same final picture as `end()`.
  2. `clear()` leaves the layer empty and the mark style reset.
  3. Aborting mid-run settles the promise and leaves nothing behind.
  4. With mode off, no frames are scheduled.

  This suite is how CONTRIBUTING's "check the effect against every built-in chart" becomes automatic.
- **Charts.** Diffing by key (keys stay stable across sorts), ARIA attributes, roving focus with keyboard events, table contents, pointer events → hover/leave, and fixed `width` (jsdom has no layout).
- **Types.** `expectTypeOf` for kind propagation through combinators, accessor keys checked against `D`, and transition effects rejected in mark slots.
- **Importing in Node** with no DOM must not throw (no top-level DOM access).

**What jsdom can't check** (no layout, `getBBox`, `getTotalLength`, real frames, media queries or rendering) is exactly why geometry is computed analytically and the clock and media are injected.

**Visual checks in `demo/`.** Each milestone's demo page has a short checklist:

- Feel and timing per mode, side by side with `lab.html`.
- Icon alignment (ball not clipped, cleat sole down) on bars, slices and lines.
- Staging is readable.
- Dark theme and focus ring.
- Reduced motion via DevTools emulation, plus the viewer override.
- Keyboard walk-through and a screen reader spot check.
- Phone widths and touch.
- No dropped frames in the Performance panel.

Automated visual regression (Playwright screenshots on a manual clock) is worth adding in M2 but needs a new dev dependency (§10).

---

## 9. Milestones

Each milestone ends with a page in `demo/` and is split into small PRs that keep `typecheck`, `test` and `build` green. `lab.html` stays untouched as the reference.

### M1: Ball and cleat on real bars

1. ✅ **Docs.** Update CLAUDE.md rule 6 (§3.5) and architecture.md, including the contract sections.
2. ✅ **Core motion.** Clock, manual clock, easing, tween, `animated`, `createMotion` with the scaling table, reduced motion, viewer choice.
3. ✅ **Contracts and geometry.** All of §2 and §4.2 as types, with the §11 changes. Line and arc path math with arc-length sampling, `slice`, `sample`, matrices. The public `describe.bar` builder, plus `describe.arc`, `.line` and `.point`. The recording layer. The sketch re-exports all of it from `src`.
4. ✅ **Runner and registries.** The rules in §4.3, plus the preset and icon registries, `resolveEffects` and the `EffectSlots` types. Manual-clock tests script the races (hover during an update, re-hover mid-run, the mode turning off mid-run).
5. ✅ **A thin `barChart`.** Horizontal and vertical, single and stacked. Keyed marks, measured layout, axis and grid in theme colours, built-in hover dimming, and pointer hover events. For now, `update()` jumps straight to the new state with no transition.
6. ✅ **Icons, `travel` and combinators.** The neutral core icons; the `expressive-charts/icons/sport` pack with `soccer-ball` and `cleat` (a second build entry and a subpath export); `travel` with gaits; `sequence`, `parallel`, `only`. An icon's `size` scales it about its anchor, in icon space, before `place()` (settled with step 5: see `Layer.icon` in `src/core/contracts/drawing.ts`, and §4.6). Tested with the manual clock and the recording layer: the ball-and-cleat story in all three views, and the §8 conformance checks on bars, a slice, a line and a point.
7. ✅ **First look: `demo/bars.html`.** The ball-and-cleat hover on the thin chart, with the motion switch. The metric switch jumps between views for now. `tsconfig.json` now includes `demo/`, so demos keep compiling against the real API.
   - ✅ **Checkpoint:** judge the feel in a browser in all three modes: travel speed, easing, icon size and placement, hover timing. Tune the scaling table and the `travel` defaults before going on. **Passed with no tuning (October 2026):** the defaults stay as built (travel at 360 px/s with a 260 ms minimum; Analysis ×0.35, 140–300 ms for effects).
8. ✅ **Updates.** `update()` with staged, interruptible transitions (values first, then positions): sorting and the metric switch animate, and hover replays after an update. Built as §5.5 describes, with these decisions (details in [architecture.md](architecture.md#bar-chart)):
   - Values are animated in data units against an animated scale, so a bar reads true against the axis at every frame; slots are animated in bands. The layout is drawn from a frame (scale and bands) plus each row's values and slot, so `placeRow` draws laid-out rows and in-between ones the same way.
   - Rows move by their chart-space geometry (`d` and label positions), not a group `transform` (§5.5 step 5): each frame needs that geometry for `change()` anyway, and effects' own `transform` on a mark is in chart space.
   - Stage 2 is scheduled with a `delay` on the same clock, so a retarget during stage 1 just reschedules it. `animated` now eases in and out when the value it interrupts is still waiting out a delay, or when the new animation has one: only a value that's moving and keeps moving eases out.
   - Analysis takes as long as the stages it runs together (500 or 1000 ms base), which the 200 ms cap shortens. A change of orientation jumps (morph is M5); a resize mid-change lands it at once.
   - Entering and leaving marks fade their labels and keep their own value text; marks that stay count theirs. Ticks fade in and out by value.
9. **Keyboard.** Roving focus. Focus plays the hover story, Escape or blur leaves, and the focus ring is drawn from the mark's outline.
10. ✅ **`expressive()` for rect marks.** The adapter for bars drawn by other code: keys, `segment` grouping, `baseline: "auto"`, pointer and keyboard events, `refresh()`.
    - **Read first:** [ideas/adapter-spike.md](ideas/adapter-spike.md), which tested what D3, Plot and Vega expose on their SVG elements. Build to its recommendation 1: the overlay on the root `<svg>`, events delegated from the root, and `tabindex` re-applied on every `refresh()`.
    - **Built** in `src/charts/adapter/` to that recommendation (see [architecture.md](architecture.md#adapters)). Beyond the plan: `baseline: "auto"` also finds negative bars; keyboard focus draws a ring from the mark's outline and survives a host replacing the focused element; and `destroy()` restores every attribute, style and class it touched. Tested in jsdom on hand-built D3-style SVG, including the ball-and-cleat story. Still to come: `samples` and `watch` (M4), circles and `describe.shape`, and the Vega helper (M3).
11. ✅ **Finish `demo/bars.html`.** Animated metric switch and sort, keyboard support, and the same hover story on a hand-written SVG bar chart beside the reference one.
    - The hand-written chart (`demo/host-chart.ts`) is drawn the way D3 code would draw it: a translated plot group, one `<g>` per series, each rect's row on `__data__`. It redraws from scratch on every change, and `refresh()` follows. The shared controls drive both charts.
    - `src/conformance.test.ts` runs the §8 conformance checks for `travel` on real bar marks from both sources, `barChart` and `expressive()`.

Steps 5–7 come first so the motion can be judged in a browser before staged updates, keyboard support and the adapter are built around it.

**Done when:** all three hover stories match the prototype, on our chart and on the hand-written one; sorting is staged in presentation, fast in analysis, and instant in off and under reduced motion; keyboard focus plays the same stories; and the conformance suite passes for `travel` on bar marks from both sources.

**Status after step 11 (October 2026):**
- **Met:** the hover stories on both charts, checked in a browser; staging order in Presentation; Off showing end states; keyboard focus playing the stories on the hand-written chart; and the conformance suite on both sources.
- **Still open:** keyboard focus on the reference chart, which is step 9, in progress.
- **Not checked in a browser:** reduced motion, because the browser pane can't emulate `prefers-reduced-motion`. It's covered by the motion core's tests and by Off, which takes the same path. The smoothness of staged transitions also needs a visible pane, since a hidden one throttles frames.

### M2: Bars at prototype parity

`flash` via `on.update`. "Play next matchweek". Tooltip, legend and data table. Theme tokens with dark mode and the eight validated colours. The `motionSwitch` helper. ARIA roles settled after screen reader testing. Optionally, Playwright visual tests.

**Demo:** the full card 1 of the lab.

### M3: Donut, plus the proof that effects are chart-agnostic

`donutChart` (slice geometry from `describe.arc`, built in M1, and a centre label). The same `travel`, now rolling around slices, with **no change to effect code**, on our donut and on D3-style pie paths through `expressive({ geometry })`. `wiggle`, `pulse`, `stagger` and string presets, shown on both bars and donut (`on: { hover: "wiggle" }`).

**Then the effect API goes public:** drop `@experimental` from `defineEffect`, `defineDataEffect`, `matrix` and `offset`, export the conformance suite, and write the effect-authoring guide.

**Demo:** `demo/donut.html`.

### M4: Line chart and data effects

`lineChart` with series and point marks and crosshair hover across series. `MarkData` samples, plus `samplesAlong` and `watch` for adapters. `threshold` in `on.decorate`, following `onChange`. The `playback()` controller with `playButton()` (WCAG 2.2.2) and `reveal()`. A ball riding the line (`ride: "on"`).

**Demo:** card 2 of the lab.

### M5: Morph

The `TransitionEffect` kind, `chartSwitch`, side-matched outline sampling, label tweening, and shared colour assignment.

**Demo:** card 3 of the lab.

### M6: Hardening and 0.1.0

- A stress demo to set documented SVG limits (§10).
- A full accessibility audit.
- A bundle-size check in CI, done with a Node script and no new dependency.
- README API docs.
- Decide whether to add more subpath exports, then publish 0.1.0.

The donut comes *before* the line on purpose. The architecture's central bet is that one effect works on any chart, and a second chart type tests that more cheaply than the line chart, which also brings in data effects and playback.

### Backlog (after 0.1)

These came out of [ideas/effects-by-chart.md](ideas/effects-by-chart.md), a brainstorm across BI chart types (bar to map, plus radar and comparison charts).

- **Linked hover.** Hovering a mark fires a hover for the marks in linked charts or series that share its *linking value*, and their ordinary effects run. It's needed for combo charts (column and line point together), butterflies (both halves), small multiples, and radar axes.
  - It isn't an effect. Effects only touch their own mark; linking touches other marks, so it lives with the charts and adapters, like hover dimming.
  - It links by a shared value, not by key. Keys are identities and differ across marks on purpose: a line point is `goals@12`, a column is `12`. By default, link by each mark's position on the category or x axis (`at`). Allow an accessor per source for anything else, for example `link([columns, line], { by: (event) => event.data.datum.month })`.
  - It generalises the line chart's `pointer: "x"`, which is the same thing inside one chart.
  - Decide before it's built whether linked marks get `source: "linked"` on their hover event, so effects can tone themselves down.
- **`trace` as a built-in.** It draws a mark's path in. It's a custom effect in the sketch now, and the brainstorm uses it on slopes, waterfalls, annotations, sparklines and scatter trails.
- **Change labels as built-ins, in two kinds:**
  - `delta`: the change since the last update, as in the sketch's custom effect. For tables, live KPIs and "Play next matchweek".
  - `label((data) => text)`: text computed from the mark's own data, such as last sample minus first (slopes) or a step's own signed value (waterfalls).
  - Comparisons between neighbouring marks (funnel conversion) are computed into the rows by the chart or the page, because effects only see their own mark and related series.
- **"Pour" (maybe).** Decorative droplets for funnels. Only after measuring its rendering cost, and never without a reduced-motion end state.

---

## 10. Open questions and risks

### Open questions (each has a recommendation; none blocks M1)

1. **Morph correspondence.** Side-matched sampling (§2.2) *unrolls* a slice: its arc becomes the bar's height. The prototype instead *drops* the slice, so the outer arc becomes the bar's top. *Recommendation:* build the generic unroll in M5, compare it in the demo, and add a `morph({ align })` option only if the prototype's version reads better.
2. **CSS delivery.** Auto-injected `<style>` vs a CSS file. *Recommendation:* both, with injection on by default (§7.1).
3. **Persisting the viewer's motion choice** across pages (`localStorage`). *Recommendation:* opt-in `motionSwitch(el, motion, { persist: "key" })`.
4. **Live-region announcements** on update, on or off by default. *Recommendation:* off by default, with a one-line option.
5. **Playwright for visual regression** needs a new dev dependency plus browsers in CI. *Recommendation:* decide at M2.
6. **More subpath exports** (`expressive-charts/core`, `/effects`) for smaller bundles. The first one (`/icons/sport`) is needed in M1. *Recommendation:* decide the rest in M6 using real bundle numbers.
7. **TypeScript 7** (the native compiler) is a separate upgrade. *Recommendation:* after M1, once there's real code to typecheck.
8. **Framework wrappers** (React, Vue, Svelte) are out of scope for 0.1. The imperative `update()` API is designed to be easy to wrap.
9. **Line smoothing.** v0.1 lines are straight polylines, which keeps `threshold` crossings exact and arc length cheap. Curves would mean sampled arc-length tables and approximate crossings.
10. **Naming.** Keep the draft's `path` and `angle`, or rename them to `walk` and `heading` to avoid confusion with `outline`? *Recommendation:* keep them; the doc comments carry the meaning.
11. **Releasing.** Check that the npm name is available, and publish from CI with provenance.
12. **D3 in demos and tests.** Adapter demos and tests are most convincing against real D3, but D3 would be a new dev dependency (never a runtime one). *Recommendation:* M1 uses a hand-written SVG chart; decide on D3 as a dev dependency in M3, when pie paths need it.
13. **Cost of `watch`.** Following a host's transition through attribute changes means re-reading geometry on every frame. *Recommendation:* measure it in M4 before making it more than opt-in.

### Risks

- **SVG performance.** Hover effects touch only a handful of nodes, so they're cheap at any chart size. The cost is whole-chart transitions, which write attributes for every mark on every frame. Rough guide, to be confirmed by the M6 stress demo:
  - Smooth up to about 1,000 animated marks on a laptop and a few hundred on a mid-range phone.
  - Several thousand static marks are fine.

  **Canvas becomes necessary** for dense scatter plots (10k+ points), many long lines revealed or re-thresholded every frame, or particle-style effects. Canvas also loses per-mark DOM, so focus and ARIA would need a parallel hidden structure; it's a real cost and the reason to wait until a chart needs it. Mitigations:
  - Animate transforms rather than `d` where possible.
  - Batch writes once per frame.
  - Never read layout during animation (the prototype's `getBBox()` restart trick goes).
- **Contract churn.** If `MarkGeometry` is wrong it ripples everywhere. Mitigations: the paper test above, the conformance suite, three chart types before 0.1, and no API stability promise until then.
- **Over-building the drawing API.** Keep it to the operations in §4.2 until an effect actually needs more.
- **Interruption races** (hover during an update during a resize). Mitigation: the runner owns the lifecycle, and manual-clock tests script these sequences.
- **Reduced-motion override confusing viewers.** Mitigation: the motion switch says when the device prefers reduced motion and that picking a mode overrides it.
- **Screen reader support for ARIA in SVG is uneven.** Mitigations: test in M2, and keep the data table as the dependable fallback.
- **Text measurement** differs between the browser and jsdom. Mitigations: measurement is injectable, and tests use fixed widths.
- **Host charts we don't control.** Adapters run inside other libraries' SVG: transforms on parent groups, marks re-created on every render, and the host's own CSS. Mitigations: geometry in the marks' nearest common ancestor's coordinates (converted with each element's CTM), an overlay on the root `<svg>` with that ancestor's transform (Vega removes foreign children from its own groups when it redraws), keys rather than elements as identity, and never writing a host element's `transform` without composing it with the host's own.

---

## 11. Design session outcomes (October 2026)

The session settled the four product questions (now the last four rows of the decisions table and the Principles above). Then it tested the proposed API by writing what users would write, before any of it is built.

**The sketch.** [`docs/sketches/`](sketches/) holds the proposed public API as TypeScript declarations (`api.ts`, which re-exports the real motion core) and seven example programs written against it:

- the three lab cards on the reference charts;
- the ball-and-cleat story on a D3 stacked bar chart;
- D3 pie arcs and a D3 line with `threshold`;
- two custom effects written outside the project;
- presets.

`npm run typecheck` compiles them, so the sketch stays honest as the real API lands: replace a declaration with a re-export of the real thing once it's built. Each `@ts-expect-error` line is a misuse that the types must reject, and each one was checked to fail for the intended reason.

**What writing the examples changed.** Where `api.ts` differs from §2–§6, `api.ts` wins.

1. **Type bug: generic effects erased the row type.** A data effect such as `threshold()` (typed for any row) in a chart's options made TypeScript infer the chart's row type as `unknown`, which silently switched off field-name checking. The effect slots now use `NoInfer`, and an effect written for one row type is rejected on a chart of another.
2. **Effect slots move under `on: { hover, enter, update, exit, decorate }`.** A top-level `update` slot collided with the `chart.update()` method. The group also reads naturally: *on hover, travel*.
3. **Update effects need the previous state.** Showing a change (a "+2" label, a ghost of the old bar) needs what came before: `ctx.previous` (geometry) and `data.previous` (values).
4. **The drawing API needs `text()`.** It draws in theme text colours by default, never series colours.
5. **Effect authors need small helpers:** `defineEffect`, `defineDataEffect`, `matrix` and `offset`. They're experimental until M3.
6. **"A run ends where `end()` starts" is the right rule for informational effects.** The delta label rises into place and *stays*; if it faded out, reduced motion (end states only) would never show the change. This is now Principle 3.
7. **Geometry builders are public.** `describe.bar`, `.arc`, `.line`, `.point` and `.shape` are the same builders our charts use, so adapters and reference charts share one implementation. Arc angles follow `d3.pie()` (radians, 0 at 12 o'clock, clockwise), so pie output plugs straight in.
8. **Adapter coordinate space.** Marks often sit in transformed groups, and stacked bars sit in one `<g>` per series. Geometry is expressed in the marks' nearest common ancestor's coordinates. The overlay is the root `<svg>`'s last child, with that ancestor's transform, because Vega removes foreign children from its own groups (corrected by the [adapter spike](ideas/adapter-spike.md); the session had said to draw it in the ancestor).
9. **Data effects on adapters need samples.** `samplesAlong(mark, points)` projects data points onto the walk, which makes `threshold` a few lines on a D3 line.
10. **Typing adapters.** D3 selections supply the row type; plain elements need `expressive<Row>(…)` or a `datum` accessor.
11. **Host transitions.** The host can scale its own animations with `motion.duration(600)`, which is the simplest integration. `watch: true` follows a host transition frame by frame, at a cost to measure (open question 13).
12. **What the types catch:**
    - stacking a non-numeric field;
    - a field of the wrong type used as an encoding (`x: "label"` on a line chart);
    - a missing accessible name;
    - a transition effect in a mark slot;
    - a data effect where a geometry effect is required;
    - an unknown series or initial view;
    - a data effect written for other rows;
    - an effect that needs fields the rows don't have;
    - a combination that hides a typed part behind a generic one.

    **What they don't catch:** misspelled preset names. Custom names are allowed, so those are only caught when the chart is created.
13. **Typing rules from the PR #2 review:**
    - A combination needs *all* its parts' row types at once (an intersection, not a union). Otherwise `sequence(typed, threshold())` widens to `unknown` and fits any chart.
    - `DataEffect`'s `run` and `end` are function-typed properties, not methods, so they're checked strictly (contravariantly) instead of loosely in both directions.
    - Field-name accessors only accept fields of the declared value type.
    - Keys accept string or numeric fields; numeric IDs are converted with `String()`.

---

## Appendix: How the plan keeps the CLAUDE.md rules

| Rule | Where it's enforced |
| --- | --- |
| 1. Three layers, one direction | Shared contracts and geometry are in `core`. The only file that imports both charts and effects is `src/index.ts`. |
| 2. Charts don't know effects | Charts take effect objects or preset names resolved through an injected registry. Hover dimming is chart behaviour, not an effect. |
| 3. Effects don't know chart types | Effects receive `MarkGeometry` and `MarkData` only. The paper test (§2.5) fills every cell with no branches. |
| 4. Stable keys | Keys are required (they default to the category). Duplicates throw. Diffing and morph go by key. |
| 5. Relative timing | Every duration goes through `motion.duration(base, timing)`, CSS included, via `--ec-hover-duration`. |
| 6. Reduced motion | The runner calls `end()` when the effective mode is off. Every effect defines an end state (§4.5). The rule's wording is updated for the viewer override. |
| 7. Effects compose | Small factories plus `sequence`, `parallel`, `stagger` and `only`. Kinds carry through the types. |
| 8. Data effects are separate | A `kind: "data"` discriminator, an explicit `MarkData` argument, and declared `needs`. |
