# Plan: expressive-charts v0.1

Status: M1 and M3 are complete, and M2 is complete apart from a short screen-reader re-check (October 2026, §9). M4 is planned step by step in §9 and is next. Sections that are built say so and point to [architecture.md](architecture.md). When a section turns into code, move what's final into architecture.md and the README, and mark the section here as done.

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
| Effect authors | The effect-author API becomes public in M3's last wave, once the same effects have run unchanged on bars, the donut, D3 pies and the line and point fixtures. From 0.1.0 it keeps the 0.x promise (M3 decision 10): breaking changes only in a minor release, with a migration note. Until then it's marked experimental. |
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
| walk | baseline → tip along the centre line | whole stack; each segment its own span | first point → last *revealed* point | none: length 0 at the point | start angle → end angle on the mid-radius arc, clockwise |
| `angle` | 0 (π if negative, −π/2 for columns) | same | per polyline segment | 0 | arc tangent |
| `thickness` | bar height | bar height | stroke width | marker diameter | R − r |
| `outline` | rounded rect, closed | union of segments, closed | the line, open | marker circle, closed | annular sector, closed |
| `pivot` | middle of the baseline edge | same | first point | the point | donut centre |
| `center` | middle of the bar | middle of the stack | `path(0.5)` | the point | mid-angle, mid-radius |
| `segments` | one, named after the value field | one per stacked series, in stack order | none | none | none |
| `samples` | `[0 → v]` | `[0 → total]`; each segment covers its own range | one per revealed vertex, with `at` | one: its value | `[0 → share]` |

Marks with no direction (line points, future scatter dots) have `length` 0 and `start = end = center`. Travel does nothing on them; wiggle, pulse and flash still work. A line point was first planned with a walk along the line up to it. M4 planning made it a dot (M4 decision 4), so effects meant for the line, which `only("goals", …)` also matches on every goals point, act on the line alone.

### 2.5 Paper test: every effect against every mark

| Effect | Reads | Bar | Stacked | Line series | Line point | Slice | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `travel` | walk, `length`, `thickness`, `segments` | ✓ | ✓ via `along` | ✓ rides the stroke | does nothing (length 0; M4 decision 4) | ✓ rolls around the ring | Insets need `length`, rolling needs distance, sizing needs `thickness`. Polyline corners need angle smoothing. |
| `wiggle` | `pivot`, `outline` | ✓ rotates about the baseline | ✓ whole row | ✓ (barely visible on long marks, by design) | ✓ | ✓ rotates about the donut centre | The swing is capped so the far end moves ≤ 3 px and data stays readable. The far end is the outline point farthest from `pivot` (from `outline.sample()`), not `length`: on a slice it's on the outer radius, which the mid-radius walk doesn't reach (corrected in M3 planning). |
| `pulse` | `outline`, `thickness` | ✓ halo | ✓ | ✓ glow along the stroke | ✓ | ✓ | Uses a halo, never a scale change, so values don't look bigger. |
| `flash` | `outline` | ✓ | ✓ | ✓ | ✓ | ✓ | A single halo blink, as in the prototype. |
| `threshold` | `slice`, `samples`, `related` | ✓ against a constant (colours the part below a target, or past it with `when: "above"`) | ✓ | ✓ against another series | draws nothing (length 0) | allowed but meaningless | Data effect. |
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
| `stagger` | `stagger`'s delays between marks (built in M3 step 2) | base | 0 | 0 |

A rule is `{ factor, min?, max? }`, and the result is `clamp(base × factor, min(base, min), max)`. A floor never makes an animation longer than its base.

### 3.5 Reduced motion

```
effective mode = viewerChoice ?? (prefersReduced ? "off" : requested)
```

- `prefers-reduced-motion` is read live and re-evaluated when it changes.
- `chooseMode()` is only called by on-page controls the viewer operates. The library ships `motionSwitch(element, motion)`, the prototype's segmented control, which calls it. While the OS asks for reduced motion and no viewer choice has been made, the switch shows Off as selected along with a short note explaining why.
- An author's `motion: "presentation"` in code is a `setMode()` call, so it never beats the OS setting.
- The viewer's choice lasts for the page session, unless the page opts in to keeping it with `motionSwitch`'s `persist` (built in M2 step 4).
- **CLAUDE.md rule 6 changes in M1 to:** "When the effective mode is `off` (the mode is off, or the user prefers reduced motion and hasn't picked a mode on the page), every animation jumps to its end state."

### 3.6 Staging

`motion.staged` tells charts to split a data change into stages, skipping any stage with nothing to do. The prototype runs both stages even when only the order changes. Stage order is in §5.5. Staging is presentation-only; analysis runs everything as a single ≤ 200 ms stage.

---

## 4. Effects

> Updated by the design session: `ctx.previous`, `data.previous`, `Layer.text()` and the author helpers are in [`sketches/api.ts`](sketches/api.ts) (§11).
>
> **The contracts in §4.1 and §4.2 are built in M1 step 3** (`src/core/contracts/`), along with `matrix`, `offset` and the recording layer in `src/core/testing/`. [architecture.md](architecture.md#effects) is now the reference. Additions: `AnyMarkEffect` is exported for combinator signatures; the icon resolver is named `IconSource`; `mark.set()` merges the fields given (undefined resets one), so parallel effects don't undo each other; an icon is hidden until first placed; `matrix.apply(m, point)`; and `testContext()`, a ready-made `EffectContext` on a manual clock. The runner (§4.3) is built in M1 step 4. `travel` with its gaits and the combinators `sequence`, `parallel` and `only` are built in M1 step 6 (§4.4–§4.6), `flash` in M2 step 2, and `wiggle`, `pulse` and `stagger` in M3 step 2. `defineEffect` and `defineDataEffect` are planned in M3 (§9); `threshold` and `morph` come later.

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

> **Built in M1 step 6** (`sequence`, `parallel`, `only`, in `src/effects/combinators.ts`); `stagger` is built in M3 step 2. [architecture.md](architecture.md#combinators) is now the reference. Additions: the parts share the run's context; `clear()` clears every part and passes on the first error after all have run; `parallel` rejects with the first part that rejects; a data combination's `needs.related` lists every part's; `only` matches a mark's key or series and keeps the effect's kind and `needs`; a part that isn't a mark effect throws a `TypeError`.

```ts
sequence(...effects)            // run in order; abort stops the chain; end() = every child's end() in order
parallel(...effects)            // run together; resolves when all finish
stagger(effect, { delay = 50 }) // offset each mark's start by batch.index × delay; total spread capped at 500 ms;
                                // "stagger" timing: 0 in analysis and off; never a default (research: little benefit)
only(filter, effect)            // run only on matching marks: a series name, a key, or a predicate
```

All of them preserve the kind: if any child is a `DataEffect`, the result is a `DataEffect`. This is computed with a conditional type and checked with `expectTypeOf` tests. Transition effects can't be mixed with mark effects, and that's a type error.

`sequence` is what makes the Goals + assists story work. In Goals view the assists segment doesn't exist, so the cleat step finishes at once. In Assists view the goals step does. In Goals + assists view, the ball rolls, stops and stays, then the cleat walks on. Neither the effect nor the chart needs a special case.

### 4.5 The first effects

| Effect | Kind | What it does | End state |
| --- | --- | --- | --- |
| `travel(icon, { along?, gait?, size?, orient?, ride? })` | geometry | Moves an icon along the walk (or along a named segment), inset by the icon's footprint so it stays inside the mark. The duration's base is `max(260 ms, length ÷ 360 px/s)` with `effect` timing. | The icon rests at the end. |
| `wiggle({ swing = 3 })` | geometry | A short damped rotation about `pivot` (about 450 ms base), with the angle capped so the outline point farthest from the pivot moves at most `swing` px. `swing` is more than 0 and at most 3, or it throws. | No transform. |
| `pulse({ times = 2, width, color })` | geometry | A halo along the outline that widens to 12 px while fading from 0.4 to 0, 600 ms base each. `times` is a whole number from 1 to 6, and repeats that would end after 5 s (after the motion's scaling) are dropped. | Nothing. |
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
> - `barChart`'s handle has no `focus()` yet, so `barChart` is still declared in the sketch, extending the built chart type. `tooltip`, `table` and `announce` are built (M2), and so is a `legend` option for stacks.
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
// The pointer and focus snap to the nearest x, and hover fires for every series' point there (M4 decisions 1 and 9).
lineChart<Week>("#xg", {
  label: "Goals vs expected goals",
  data: weeks, x: "week", series: ["goals", "xg"],
  on: { decorate: effects.only("goals", effects.threshold({ compareTo: "xg" })) }
});
chart.reveal(24.5);                   // show data up to x, instantly, with no events; used by playback (M4 decision 2)

// Donut. `category` names each slice and is its key, as on bars (M3 decision 5; the first sketch said `key`).
donutChart<Outcome>("#shots", { label: "Shot outcomes", data: outcomes, category: "outcome", value: "shots", center: (total) => `${total}\nshots` });
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

> **Built in M1 step 5 and M2 step 1.** [architecture.md](architecture.md#rendering) is now the reference. Every token has a light and a dark default, set on the root and on `data-theme` elements by the shared stylesheet, and the eight series colours are validated by a test (`src/charts/render/theme.test.ts`). `configure({ nonce, injectStyles })` is page-wide, because the stylesheet is one per document. M2 adds `--ec-ring`.

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
| `--ec-ring` | hairline borders on controls and the tooltip |
| `--ec-hover-duration` | set by the chart from `motion` |

- **Light and dark.** Dark mode follows `prefers-color-scheme` and can be overridden with `data-theme="light"|"dark"` on any ancestor, which generalises the prototype's `:root` rule. Default rules use `:where()` so host CSS overrides them without specificity fights.
- **Delivery.** By default the first chart, adapter or control on a page injects one small `<style>`, with the nonce from `configure({ nonce })`. `dist/expressive-charts.css` (`expressive-charts/style.css`) has the same text, for strict-CSP sites that use `configure({ injectStyles: false })`.
- **Categorical colours follow the entity.** A `ColorAssignment` maps series or category keys to palette slots in the order they're first seen and never reassigns them. Sorting, filtering and updates can't change a colour. It can be shared between charts (needed for morph) or pinned (`{ goals: 1, assists: 4 }`). The prototype's four colours expand to eight (M2 step 1), each at least 3:1 against both surfaces, with neighbouring slots apart under the common colour-vision deficiencies.

### 7.2 Accessibility

- **Structure.** Each mark gets an `aria-label`, defaulting to "Okafor: 16 goals, 4 assists", that a page can word with `markLabel(d, mark)` (planned as `describe(d)`; built after M2 step 5, with the name changed because `describe` is the geometry builders' namespace). The SVG gets the chart's `label` and `description`. The exact ARIA roles (`group`/`list`/`listitem` vs `graphics-*`) are picked in M2 after testing with NVDA + Chrome and VoiceOver + Safari. M2 step 5 picked `group` on the SVG and `img` on each mark, and the NVDA + Chrome check confirmed them ([a11y-check.md](a11y-check.md)).
- **Keyboard.** Each chart is one tab stop (roving `tabindex`). Arrow keys move between marks in visual order, following the current sort, and Home/End jump to the ends. Focus fires `hover` (`source: "keyboard"`), so effects play. Escape or blur fires `leave`. The focus ring is drawn from `mark.outline` in `--ec-focus`, because browser focus outlines on SVG are inconsistent.
- **Host charts.** `expressive()` writes no ARIA unless asked. `markLabel(datum, mark)` names each host mark as one item, as `barChart` does: the element that takes the mark's focus becomes `role="img"` with the name, and the mark's other parts are hidden. The `<svg>`'s role (`group`, not `img`) and the host's own text stay the host's; the adapter warns about a `role="img"` root.
- **Data table.** On by default: a `<details>` "Data table" after the chart, as in the prototype. It follows the current sort and updates with the data. `"hidden"` makes it visually hidden but readable by screen readers.
- **Pause controls (WCAG 2.2.2).** Nothing auto-plays: `playback()` has no autoplay option. The controller (play, pause, seek) comes with `playButton()`, a real button whose text, and so its name, switches between Play and Pause, with no `aria-pressed` (built in M4 step 3). Pause is the control 2.2.2 asks for, so there's no separate stop (M4 decision 12). Effects can't loop forever in v0.1: `pulse` repeats are capped below 5 s. If looping is ever added, the chart must render a pause control.
- **Tooltips** are `aria-hidden`, since the same text is in the mark's label and the table. On touch they follow the tap. A tooltip function's text is also the mark's description (M2 step 3, built).
- **Updates.** An optional polite live region announces summaries like "Sorted A to Z": `announce`, off by default (M2 step 5).

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
  5. After a full run, and after `end()`, a `change()` to the mark moved elsewhere leaves what `end()` draws there (added in M4, decision 11).

  This suite is how CONTRIBUTING's "check the effect against every built-in chart" becomes automatic. M3 step 5 exports it as `checkEffect` from `expressive-charts/testing`, for effects written outside the project too.
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

Automated visual regression (Playwright screenshots on a manual clock) is worth adding in M2 but needs a new dev dependency (§10). *Built in M2 step 6* (`tests/visual/`, on Playwright's fake clock).

---

## 9. Milestones

Each milestone ends with a page in `demo/` and is split into small PRs that keep `typecheck`, `test` and `build` green. `lab.html` stays untouched as the reference.

### M1: Ball and cleat on real bars ✅

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
9. ✅ **Keyboard.** Roving focus. Focus plays the hover story, Escape or blur leaves, and the focus ring is drawn from the mark's outline.
   - **Built** in `src/charts/keyboard.ts` and wired into `barChart` (details in [architecture.md](architecture.md#bar-chart)), matching the `expressive()` adapter's behaviour where they overlap: the same keys, the same `:focus-visible` rule for the ring, and the same sharing of one hover between pointer and focus. Decisions:
     - Focus follows its key across `update()`: the focused mark's element stays put in the DOM while the others move around it. If the mark leaves, focus moves to its nearest neighbour.
     - The ring sits behind the marks, a 2 px ring in `--ec-focus` outside a 2 px gap in `--ec-surface`, so it can't cover data or merge with a bar of the same colour.
     - Focus from a click or tap moves the tab stop without starting a keyboard hover, so a tap still reports `source: "touch"`.
     - Focus listeners go on the document, not the `<svg>`: Chrome made the `<svg>` an extra tab stop when it had focus listeners of its own (found in the browser check).
     - Each mark's `aria-label` is "Okafor: 16 goals, 4 assists", from its category and values in the chart's `format`. Roles and a `describe` option wait for M2's screen-reader testing.
10. ✅ **`expressive()` for rect marks.** The adapter for bars drawn by other code: keys, `segment` grouping, `baseline: "auto"`, pointer and keyboard events, `refresh()`.
    - **Read first:** [ideas/adapter-spike.md](ideas/adapter-spike.md), which tested what D3, Plot and Vega expose on their SVG elements. Build to its recommendation 1: the overlay on the root `<svg>`, events delegated from the root, and `tabindex` re-applied on every `refresh()`.
    - **Built** in `src/charts/adapter/` to that recommendation (see [architecture.md](architecture.md#adapters)). Beyond the plan: `baseline: "auto"` also finds negative bars; keyboard focus draws a ring from the mark's outline and survives a host replacing the focused element; and `destroy()` restores every attribute, style and class it touched. Tested in jsdom on hand-built D3-style SVG, including the ball-and-cleat story. Still to come: `watch` (M4; `samples` was built in M4 step 4), circles and `describe.shape`, and the Vega helper (M4, moved in M3 planning).
11. ✅ **Finish `demo/bars.html`.** Animated metric switch and sort, keyboard support, and the same hover story on a hand-written SVG bar chart beside the reference one.
    - The hand-written chart (`demo/host-chart.ts`) is drawn the way D3 code would draw it: a translated plot group, one `<g>` per series, each rect's row on `__data__`. It redraws from scratch on every change, and `refresh()` follows. The shared controls drive both charts.
    - `src/conformance.test.ts` runs the §8 conformance checks for `travel` on real bar marks from both sources, `barChart` and `expressive()`.

Steps 5–7 come first so the motion can be judged in a browser before staged updates, keyboard support and the adapter are built around it.

**Done when:** all three hover stories match the prototype, on our chart and on the hand-written one; sorting is staged in presentation, fast in analysis, and instant in off and under reduced motion; keyboard focus plays the same stories; and the conformance suite passes for `travel` on bar marks from both sources.

**Status: complete (October 2026).** Everything on the "Done when" list is met:
- the hover stories on both charts, checked in a browser;
- staging in Presentation, and Off showing end states;
- keyboard focus playing the stories on both charts: steps 9 and 10, then PR #16 (no extra tab stop on the host's `<svg>`) and PR #17 (the adapter shares barChart's keyboard code);
- the conformance suite on bar marks from both sources.

Two things haven't been checked in a browser:
- **Reduced motion.** The browser pane can't emulate `prefers-reduced-motion`. It's covered by the motion core's tests and by Off, which takes the same path. *Now checked in Chromium by M2 step 6:* the switch shows Off with its note and follows the setting live, hovering shows the icons at their end positions on both charts, a metric switch jumps, and picking a mode on the page overrides it.
- **The smoothness of staged transitions.** That needs a visible pane, because a hidden one throttles frames. *M2 step 6 checks staged frames at fixed times* (values first, then positions), *but not smoothness at real frame rates.*

### M2: Bars at prototype parity ✅ (pending one screen-reader re-check)

**Decided while planning M2 (October 2026):** Playwright screenshot tests, Chromium only. CSS is both injected and shipped as a file. You run the screen-reader check that settles the ARIA roles.

Each step names the files it owns, so steps in the same wave can run in parallel sessions. Files shared by several steps (`src/index.ts`, `src/registries.ts`, `docs/architecture.md`, `README.md`, this plan, `demo/bars.*`) get small edits only, and whichever step lands second merges main first.

**Wave 1** (parallel):

1. ✅ **Theme: dark mode, the validated palette, and CSS delivery.** Owns `src/charts/render/theme.ts`, the CSS build, and the package's style export.
   - **Built** ([architecture.md](architecture.md#rendering), §7.1). Decisions:
     - The tokens are set on the root, not on the chart, so host elements (a hand-drawn chart, the tooltip, the motion switch) read the same values, and host CSS on any ancestor still wins. A `data-theme` element resets the tokens for its subtree, so page overrides of a token need to cover `[data-theme]` too.
     - Light slots 3 and 4 were under 3:1 (2.7 and 2.1), so they're darkened along their own hue until they pass (`#02a471`, `#c28409`). Dark slots 1–4 are the prototype's. Slots 5–8 are new: violet, cyan, olive and pink. The provisional brown read as grey, and pink beside it merged under deuteranopia. There's no red, which would be confused with `--ec-negative`.
     - Thresholds, from the dataviz palette method: neighbours (8 wraps to 1) at least 15 apart in OKLab ×100 for normal vision and 8 under protanopia, deuteranopia and tritanopia (Machado 2009); any two slots at least 9 apart; `-strong` within 5° of hue, 1.3× the contrast, and 8 apart. Light `--ec-text-muted` moved to `#75736d` to reach 4.5:1 for 11 px ticks. Dark `--ec-dim-opacity` stays 0.3, since dimmed marks keep about the contrast they have in light.
     - `nonce` and `injectStyles` are page-wide (`configure()`), not chart options: one chart's option would only count if it came first, and controls inject too.
     - `tsup.config.ts` writes the file from the same constant the charts inject. A test checks that a page with the file and `injectStyles: false` gets the same rules and the same markup, and the demo's computed styles matched in the browser in both themes.
   - Dark-mode defaults that follow `prefers-color-scheme`, overridable with `data-theme="light"|"dark"` on any ancestor. Default rules use `:where()`.
   - Validate the eight series colours and their `-strong` variants: each mark at least 3:1 against the surface in both themes, distinguishable from its neighbours, and slots 1–4 kept as in the prototype.
   - CSS delivery: charts inject one `<style>` by default, with a `nonce` option; `injectStyles: false` turns injection off; `dist/expressive-charts.css` is generated from the same source in `theme.ts` and exported as `expressive-charts/style.css`. `package.json` must list CSS in `sideEffects` (for example `["*.css"]`) instead of `false`; otherwise bundlers can drop `import "expressive-charts/style.css"`, which is a side-effect import, and the strict-CSP path silently loses its styles.
   - The demo drops the dark tokens it sets itself.
2. ✅ **`flash` and "Play next matchweek".** Owns `src/effects/flash.ts` and the `flash` preset in `src/registries.ts`.
   - `flash()` is one halo blink along the outline, the prototype's `stroke-width` 0 → 8 → 0 at 35% opacity, with `effect` timing.
   - Its end state is nothing. That's deliberate: a flash is emphasis, and the change it points at (the new length and value label) stays visible anyway.
   - The demo gets "Play next matchweek": seeded updates as in the prototype, with `on: { update: "flash" }` on both charts, and the button stopping after matchweek 38.
   - **Built** as planned ([architecture.md](architecture.md#flash)). Additions: the 900 ms base peaks a quarter of the way through, each half eased like CSS's `ease-out`, as the prototype's keyframes are; `flash({ width, opacity, color })` takes the halo's peak width, opacity and colour. The §8 conformance checks moved to `src/effects/conformance.test.ts` for every built-in effect and now compare mark styles as well as pictures. Checked in a browser over matchweeks 25–38: on `barChart` exactly the bars whose values changed flash, and a re-sort flashes nothing.
   - **Differs from the prototype:** a metric switch flashes every bar, since every value changes (the prototype flashed only on a matchweek). And `expressive()` saw lengths, not values, so on the hand-written chart every bar flashed when the axis grew (once per view over the season, now that its axis takes the prototype's nice maximum) or when the window was resized.
   - **Follow-up:** `expressive()` takes `value(datum, element)`, what each element shows, and compares values instead of lengths when it's given ([architecture.md](architecture.md#adapters)). The demo passes it, so the hand-written chart flashes the same bars as `barChart`.
3. ✅ **Tooltip and legend.** Owns `src/charts/tooltip.ts`, `src/charts/legend.ts`, and their hooks in `bar.ts`.
   - Tooltip: an HTML box near the hovered or focused mark that flips at the edges and follows a touch tap. The box is `aria-hidden`, so it isn't read twice. Its text also becomes the mark's accessible description (`aria-describedby`), so anything a custom tooltip adds beyond the series values (the prototype shows the player's position) still reaches screen readers. `tooltip: boolean | ((d) => string)` takes plain text, never HTML. Show and hide use `feedback` timing.
   - Legend: series swatches for stacked charts, coloured through the chart's `ColorAssignment`, with the text in theme text colours. A single series has no legend.
   - **Built** (details in [architecture.md](architecture.md#bar-chart)). Decisions:
     - The tooltip sits above the mark and flips below when there's no room. It's clamped to the chart's left and right edges, but never moved over the mark it describes.
     - Only a tooltip function's text becomes the description. The default text would repeat the mark's `aria-label`.
     - The legend shows series names as given ("goals"). A shared option for display names, used by the legend, tooltip, labels and table, would suit step 5.
     - The tooltip's border is `--ec-ring`, step 1's hairline token.
4. ✅ **`motionSwitch` helper.** Owns `src/charts/controls/`.
   - It builds the Presentation / Analysis / Off segmented control: buttons with `aria-pressed`, calling `motion.chooseMode()`, with the reduced-motion hint.
   - `persist: "key"` is an opt-in that remembers the viewer's choice in `localStorage` (open question 3).
   - The demo replaces its own switch with this one.
   - **Built** as planned ([architecture.md](architecture.md#controls)): `motionSwitch(target, motion?, { label, labels, hints, persist })` returns `{ element, destroy() }`. The group is named by its visible label; the note is its description and a polite live region. `clearChoice()` also clears the stored choice. Its few `.ec-motion-*` rules are in the shared stylesheet in `theme.ts` (step 1's file), so they're in `expressive-charts/style.css` too, and it injects the stylesheet as charts do, so `configure({ nonce, injectStyles })` covers it.

**Wave 2** (after wave 1 lands):

5. ✅ **Data table and ARIA roles, with your screen-reader check.** Owns `src/charts/table.ts`, the ARIA structure in `bar.ts`, and `docs/a11y-check.md`.
   - Table: `table: boolean | "hidden"`, default on, a `<details>` "Data table" after the chart. It follows the current sort and updates with the data. Columns are the category, each series, and a total, plus any extra fields the page lists in a `columns` option (the prototype's table includes the position).
   - ARIA roles: pick the structure, then write a short listening script in `docs/a11y-check.md`. **You run it** with NVDA + Chrome or VoiceOver + Safari, and the roles are adjusted to what you hear.
   - An optional polite live region (`announce`) is off by default (open question 4).
   - **Built, and your screen-reader check passed with NVDA + Chrome (October 2026)**: all 13 steps read as expected, so the roles stay as built. VoiceOver + Safari hasn't been run. [a11y-check.md](a11y-check.md) has the script and the results; details are in [architecture.md](architecture.md#bar-chart). Decisions:
     - **Roles.** The `<svg>` is `role="group"`, named by `label`. Each focusable mark is `role="img"`, named by its `aria-label`, with its text and shapes `aria-hidden`, so it's read as one item. The graphics roles were left out, because screen readers announce `graphics-document` inconsistently and an unsupported role falls back to nothing. `list`/`listitem` were left out too: NVDA and JAWS often read a list item's text instead of its `aria-label`. A leaving mark is `aria-hidden`.
     - **`table`** also takes an object: `columns` (`{ label, field, format? }`, `field` being a field name or `(d, i) => value`), the `category` and `total` headers, the `summary` text, and `hidden`. `columns` sits there rather than at the top level, where it could be taken for vertical bars. Extra columns go after the category, as the prototype's position did.
     - The total column shows only for a stack, as the tooltip's total does. The caption (the chart's label) is visually hidden, since the chart's title is beside it. `"hidden"` is a visually hidden `<div>`, not a `<details>`, because a closed `<details>` hides its contents from screen readers.
     - The table changes as soon as an update starts, like the labels and the legend, rather than once it settles (§5.5 step 6). Rows are kept by key, so an open table and a screen reader's place in it stay.
     - **`announce`** is `boolean | (change) => string | undefined`. The chart's summary names a new label or new series, the sort, and the marks that changed (by name up to three, then "5 of 8 changed"), were added or were removed. A function gets that text and the keys and returns the page's own text; it's called before `update()` returns, so the demo adds the matchweek. Turned on by `update()`, it announces from the next update.
     - **Follow-up: the demo's second chart.** Its `<svg>` was `role="img"` around focusable rects with no names. Now the page makes it `role="group"`, and the hand-drawn chart names each rect by what it shows ("Okafor: 4 assists") and hides its name and value texts, as a careful D3 page would. `expressive()` takes `markLabel(datum, mark)`, which names the element that takes each mark's focus and hides the mark's other parts, so a player is read once ("Okafor: 16 goals, 4 assists"). It's in the adapter because the adapter picks which element takes focus, and Plot and Vega-Lite can't name one segment and hide another ([architecture.md](architecture.md#adapters)). It warns once about a `role="img"` root. [a11y-check.md](a11y-check.md) section C is its listening script, not run yet.
     - The demo's table has a "Player" header and a Position column. Its "After matchweek N" status is no longer a live region, since the chart announces each matchweek.
     - **Built after the check:** `barChart`'s `markLabel(d, mark)` words the marks' names, so the demo says "1 goal" where the default says "1 goals". It's `describe(d)` in §7.2's first draft, renamed because `describe` is the geometry builders' namespace and, in ARIA, a description is the tooltip function's job; `expressive()` has the same name. `mark` is a `MarkSummary` (`key`, `category`, the `values` shown, `total`, the chart's `format`, and the default `text`). An empty result or a throw (reported) keeps the default name, since a focusable mark must have one. The default wording stays: the chart can't make a singular from a field name. "Castillo: 1 goal" was heard as such with NVDA + Chrome and with VoiceOver + Safari.
     - **Built after that: `seriesLabels`**, names for people by series (`{ goals: "Goals" }`), used as given by the legend, the table's headers, the default tooltip and mark names, and announcements. Keys, colours and effects still go by the series' own names. Labels aren't recased, so the default tooltip says "16 Goals"; a page that wants "16 goals" there words it with `tooltip` or `markLabel`, whose values carry each label. The demo's legend and table say "Goals" and "Assists", as the lab's card 1 does.
6. ✅ **Playwright screenshot tests.** Owns the Playwright dev dependency, `playwright.config.ts`, `tests/visual/`, a CI job, and a small hook that lets tests drive the page-wide clock.
   - Screenshots of the demo in light and dark, at rest and mid-travel at fixed clock times, in each motion mode, plus focus rings on both charts.
   - Chromium only, with the browser cached in CI. A documented command updates the baselines.
   - Baselines are captured once steps 1–3 have landed, so they don't churn.
   - **Built** ([CONTRIBUTING.md](../CONTRIBUTING.md#visual-tests), [architecture.md](architecture.md#clock)): `tests/visual/` has 18 tests and 27 baselines. They cover the list above, plus the tooltip and legend, a staged metric switch, and reduced motion in a real browser, with DOM checks beside the screenshots. Decisions:
     - **No hook in the library.** Playwright's `page.clock` fakes `performance.now()` and `requestAnimationFrame`, which `defaultClock` looks up only when it asks for a frame, so tests drive the page-wide clock with `runFor(ms)`. Each test first moves the clock to the same reading, so frames (every 16 ms) fall at the same times on every machine.
     - **CI runs in the official Playwright image**, pinned to the `@playwright/test` version (1.64.1). The image comes with Chromium and its fonts, so nothing is downloaded per run, which does the job of a browser cache. It also means baselines made locally in the same image (`npm run test:visual:update`, through Docker) match CI's exactly. The **Update visual baselines** workflow (`workflow_dispatch`) does the same on GitHub and uploads the screenshots as an artifact.
     - Baselines have no platform suffix and are compared only on Linux. Elsewhere `npm run test:visual` runs just the DOM checks.
     - Tolerance: a per-pixel threshold of 0.1 (the default is 0.2) and at most 10 differing pixels; an icon one pixel off changes dozens. Three repeated runs all passed. Renders aren't always bit-identical: a few anti-aliased pixels at a focus ring's corner vary between runs, which the slack covers. There are no retries, so a flaky picture shows up.
     - The viewport (1000 × 2000) is taller than the page, so an element screenshot never scrolls. A scroll moved the page under the resting pointer, which then hovered the next bar.
     - Reduced motion is checked in the DOM against the same story animated: the icons end at identical transforms, and nothing runs after the jump. Pictures are shared between the two only where the page above the chart is the same: the reduced-motion note is a line longer, which moves the charts by half a pixel and changes every anti-aliased edge.
   - **Found and fixed:** on the hand-written chart, the focus ring couldn't be seen on a goals bar. `expressive()` stroked a 2 px ring in `--ec-focus` centred on the outline, with no gap, and `--ec-series-1` is the same blue. Its ring now matches barChart's, 2 px past a 2 px gap, masked to outside the mark, since the adapter's overlay is above the marks. The gap is left clear rather than painted in `--ec-surface` ([architecture.md](architecture.md#adapters)). The focus screenshots now cover light and dark.

**Wave 3:**

7. ✅ **Finish the demo: card 1 parity.** Put it all together in `demo/bars.html` and compare it with the lab's first card, then check the "Done when" list in the browser with you.
   - The tooltip now names the player's position and both numbers, as the lab's does.
   - New option `markDescription` (from the PR #29 review). By default a tooltip function's text is also each bar's description, which would make a screen reader repeat the name and numbers, so the demo describes each bar with just the position. `false` describes nothing.
   - The page's checklist is M1 and M2's "Done when" list.
   - One deliberate difference from the lab: the data table follows the chart's series (Goals; Assists; or Goals, Assists and Total), where the lab's table always lists all three.

**Done when:**
- `demo/bars.html` reproduces the lab's first card on the library: the ball and cleat, staged sorting, the metric switch, "Play next matchweek" with a flash on changed bars, a tooltip, a legend for Goals + assists, a data table, and the motion switch.
- Light and dark themes come from the library's defaults, not page CSS, and the palette meets 3:1 in both.
- CSS works injected and as a file, including under a strict CSP.
- Your screen-reader check passes.
- The Playwright suite is green in CI.

**Status: complete apart from one re-check (October 2026).** Everything on the list is met, except that the new bar descriptions (the position) still need a short screen-reader re-check ([a11y-check: Re-check after M2 step 7](a11y-check.md#re-check-after-m2-step-7)):
- **Card 1 parity, in the browser.** The tooltip ("Okafor · Forward", both numbers) doubles as each bar's description. The legend appears only for Goals + assists. The table has Player, Position, Goals, Assists and Total. "Play next matchweek" announces "Matchweek 25: Okafor and Lindqvist changed", and exactly those bars changed.
- **Themes.** Both come from the library's stylesheet, and the page sets no `--ec-*` tokens. The palette's contrast is enforced by `theme.test.ts`.
- **Strict CSP, in Chromium,** with the built package served as plain files:
  - `style-src 'self'` with the CSS file and `injectStyles: false`;
  - `style-src 'nonce-…'` with `configure({ nonce })`.

  Charts, hover stories, dimming, the tooltip and the keyboard focus ring all work in both, with no violations. A control showed that violations do reach the console.
- **Screen reader.** Passed with NVDA + Chrome before step 7. The "1 goal" wording was also confirmed with VoiceOver + Safari. Step 7 then added each bar's description (its position), which needs the short re-check above before this item counts as met again.
- **CI.** The Playwright suite and the unit and conformance tests are green on main.

The flash is checked by tests, not by eye: `src/matchweek.test.ts` (only changed bars flash, on both charts), the flash unit tests, and the visual suite's mid-change screenshots. A hidden browser pane throttles frames past the 900 ms blink, so it can't be watched there.

### M3: Donut, plus the proof that effects are chart-agnostic ✅

`donutChart` (slice geometry from `describe.arc`, built in M1, and a centre label). The same `travel`, now rolling around slices, with **no change to effect code**, on our donut and on D3 pie paths through `expressive({ geometry })`. `wiggle`, `pulse`, `stagger` and string presets, shown on bars and on the donut (`on: { hover: "wiggle" }`).

**Then the effect API goes public:** `defineEffect` and `defineDataEffect` are built, `@experimental` comes off them and off `matrix` and `offset`, the conformance suite is exported as `expressive-charts/testing`, and the effect-authoring guide is written.

**Demo:** `demo/donut.html`.

**Where M3 starts** (checked against main while planning, October 2026):

- **Already built.**
  - `describe.arc`, in the `d3.pie()` angle convention. `src/effects/conformance.test.ts` already runs `travel` and `flash` on a slice, so "no change to effect code" holds in unit tests; M3 proves it on real donut and D3 pie marks.
  - `expressive({ geometry })` accepts any shape, arcs included (M1 step 10).
  - `matrix` and `offset`, marked `@experimental` in `src/core/geometry/matrix.ts`. `PresetName` already lists `wiggle` and `pulse`, and the runner already gives each run its `batch`.
- **Assumed by the plan but not built.**
  - `defineEffect` and `defineDataEffect` exist only as declarations in `docs/sketches/api.ts`, so they're built before they can lose `@experimental`.
  - There's no conformance suite to export. The §8 checks are a loop copied into `src/effects/conformance.test.ts` and `src/conformance.test.ts`, for geometry effects only, and `src/core/testing` is internal.
  - `stagger` has no way to reach 0 in Analysis: a tween's `delay` is scaled like its duration, and `effect` timing's 140 ms floor leaves a short delay whole.
- **Gaps.**
  - §2.5 had `wiggle` reading `length`; it reads `outline` instead (corrected there). `MarkGeometry` needs no change for M3.
  - `barChart` is one ~790-line function. Its helpers (tooltip, legend, table, announcer, keyboard, pointer, render) are separate modules, but the legend is per series (a donut's is per category), the table has no total row or share, and `MarkSummary` has no share.
  - The bar chart draws its focus ring and halos behind each mark. On slices that touch, the next slice covers their straight edges, unevenly by DOM order. The adapter's ring and halo, drawn above the marks and masked to outside the mark, suit marks that touch.
  - The adapter orders marks described with `geometry` as they are in the document. `d3.pie()` sorts by value by default, so the document order isn't the order around the ring, and the arrow keys would jump.
  - Without `value`, the adapter reports every slice as updated when one value changes, since every arc's length changes.
  - `update()` can't change `on`, so the demo's effect picker recreates its charts.
- **Out of date** (each fixed by a step below): architecture.md says the Vega helper comes "with arcs (M3)"; the sketch still declares `flash` and `motionSwitch`, which hides the real ones from the examples; `src/charts/tooltip.test.ts` calls a 1.5× scale "a pulse"; `src/core/testing/index.ts` says the suite is exported "after M3".

**Decided while planning M3 (October 2026):**

1. **D3 is a dev dependency** (open question 12): `d3-shape` and `d3-selection` only, with their `@types`, pinned to exact versions, never a runtime dependency. The adapter's tests and `demo/donut.html` use them. Real `d3.pie()` catches conventions a hand-written fixture misses, such as its default sort.
2. **The Vega helper moves to M4.** `fromVegaView()` pays off with lines, whose items give samples for free, and the adapter gets `samples` in M4. It needs vega and vega-lite as dev dependencies and reads Vega internals, and D3 pies already prove arcs through `geometry`.
3. **Shared chart code comes first.** Wave 1 moves the parts of `barChart` that don't know about bars into small modules, with no change in behaviour, and the donut is built on them. The alternative, copying them into the donut and extracting with the line chart in M4, would fix every transition and focus bug twice in the meantime.
4. **Donut accessibility.**
   - Roles as on bars: the `<svg>` is `role="group"`, named by `label`. Each slice is `role="img"`, named "Saved: 112 shots, 28%": the category, the value in `format` with its series' label, and the share as a whole percent. `markLabel` gets the bar chart's `MarkSummary` plus `share`.
   - Keyboard order is clockwise from 12 o'clock, so it follows `sort`, with the bar chart's keys (Right and Down to the next slice, Left and Up to the previous, Home and End) and no wrap-around. The adapter does the same for marks that share a pivot.
   - Data table: the category, the value and a Share column, with a total row ("Total, 406, 100%"), as in the lab.
   - The centre label is `aria-hidden`, and its text is added to the chart's description, so the total is heard on entering the chart. The table's total row has it too.
   - The focus ring is drawn above the slices, masked to outside the focused one (the adapter's ring), so it shows on every side. It can cover a 2 px band of a neighbour, 2 px out, and the neighbours are dimmed while a slice is focused.
   - You run a short donut listening script with NVDA + Chrome, as in M2.
5. **Donut drawing and updates.**
   - The inner radius is 0.6 × the outer, as in the lab. Slices are separated by 2 px strokes in `--ec-surface` rather than `padAngle`, so the angles stay true to the data.
   - A legend with one entry per category, plus labels outside the ring (the category and the share) on slices of 15° or more; a label that would overlap the one before it is dropped. Every slice is still named in the legend, the tooltip, the table and its ARIA name.
   - `sort: "none"` (data order, the default) or `"value"` (largest first), starting at 12 o'clock and going clockwise. Colours are per category, through a `ColorAssignment` keyed by category. Bars still colour by series (`colors.slot(series)` in `bar.ts`), so sharing one assignment with a bar chart won't match colours until bars can colour by category, which M5 adds for its morph. A slice's `series` is the value field (`"shots"`, or `"value"` for a function), as a plain bar's one segment is.
   - A slice is named by `category` (a field or a function), which is also its key unless `key` is given, as on bars. The sketch's `key: "outcome"` becomes `category: "outcome"`.
   - Halos (`flash`, `pulse`) are drawn in the overlay, masked to outside the slice, so they show evenly on every side. While it runs, a halo can cover half its width of a neighbour.
   - Updates animate the values in data units, so slices stay joined and every frame's angles are true shares. Presentation stages them: values for 500 ms, while leaving slices shrink to nothing; then a re-order for 500 ms, in which slices rotate the shorter way to their new places (as bars pass each other when sorted) and entering slices grow in at their places in the second half. Analysis runs one stage of at most 200 ms, and Off jumps. `update` fires only for slices whose own value changed, not for ones whose share moved.
6. **`wiggle({ swing = 3 })`.** A damped rotation about `pivot`, about 450 ms base with `effect` timing. The angle is capped so the outline point farthest from the pivot (from `outline.sample(64)`) moves at most `swing` px. `swing` must be more than 0 and at most 3, or it throws a `RangeError`, as `flash` does for its options. A mark whose farthest point is under 0.5 px from its pivot doesn't move. End state: no transform.
7. **`pulse({ times = 2, width = 12, color })`.** Each pulse is a halo that widens from 0 to `width` while its opacity falls from 0.4 to 0, 600 ms base with `effect` timing. Each repeat is its own tween, so Analysis still plays every repeat, shorter. `times` must be a whole number from 1 to 6, or it throws. Repeats that would end after 5 s, after the motion's scaling, are dropped, so it stays within WCAG 2.2.2 under an author's own scaling too. End state: nothing (it's emphasis, like `flash`).
8. **Presets.** The built-ins are exactly `flash`, `wiggle` and `pulse`, each with its defaults. There are no combined or icon presets in the core (`travel` needs an icon, which would bring a domain in), and no preset staggers.
9. **`stagger(effect, { delay = 50 })`.** Each mark starts `batch.index × delay` ms after the first, and the whole spread is capped at 500 ms base (the delay shrinks for a big batch). The wait goes through a new `"stagger"` timing (§3.4): ×1 in Presentation, 0 in Analysis and Off, so authors can tune it with `createMotion({ scaling })`. It's never on by default: no chart, adapter or preset staggers. A single-mark event (a hover) isn't delayed, and `end()` doesn't wait. It returns an effect of the same kind and needs, as `only` does.
10. **What "public" means.**
    - The surface: `defineEffect` and `defineDataEffect` (built in M3), `matrix`, `offset`, `describe.*`, the effect, context and drawing contracts, and `expressive-charts/testing`.
    - The promise is 0.x semver. From 0.1.0, a breaking change to that surface comes only in a minor release (0.1 → 0.2), listed in a new `CHANGELOG.md` with a migration note, and a deprecated name stays for one minor release.
    - The conformance suite is exported from `expressive-charts/testing`, a third build entry like `icons/sport`, and isn't in the script-tag bundle. `checkEffect(effect, { marks, icons, data })` imports no test runner: it runs the four §8 checks on the fixture marks (bars, a slice, a line, a point) and throws one error listing every failure, so it works in Vitest, Jest, `node:test` or Mocha. `testContext`, `play` and the fixtures come with it, and our own conformance tests switch to it.
    - The guide is `docs/effects-guide.md`: the contract, the context and drawing API, timing through `ctx.tween`, end states (Principle 3), the data guardrails (Principle 2), data effects and `needs`, composing, testing with `checkEffect`, `trace` and `delta` (sketch 06) as type-checked worked examples, and a review checklist.
    - It goes public in M3's last wave. M4's line chart can still force a 0.2.
11. **Demo and baselines.**
    - `demo/donut.html` is the lab's card 3 without the morph: the shot outcomes as a donut and as columns, plus a D3 pie through `expressive()`. The columns are one colour, since a single-series bar chart colours by series; matching each outcome's colour across the donut and the columns waits for M5 (decision 5). One effect picker (Ball, Wiggle, Pulse) and a "Next match" button (`update: stagger(flash())`) drive all three.
    - `demo/bars.html` doesn't change, so its 27 baselines don't either.
    - New screenshots in `tests/visual/donut.spec.ts`, with names starting `donut-` because names are shared across files: light and dark at rest; the ball mid-roll and at rest on both donuts; a wiggle at its peak and a pulse half-way; the focus ring in both themes; the tooltip. Reduced motion is checked in the DOM, as in M2. The baselines are made in Docker.

Each step names the files it owns, so steps in the same wave can run in parallel sessions. Files shared by several steps get small edits only, and whichever step lands second merges main first: `src/index.ts`, `src/registries.ts`, `src/effects/index.ts`, `src/charts/index.ts`, `package.json`, the two conformance test files, `docs/architecture.md`, `README.md`, `docs/sketches/api.ts` and this plan.

**Wave 1** (parallel):

1. ✅ **Shared chart code.** Owns `src/charts/bar.ts` and new modules in `src/charts/shell/`.
   - **Built** (October 2026), with no existing test or baseline changed. [architecture.md](architecture.md#reference-charts) names the modules, and `bar.ts` went from about 1,090 lines to about 800. Decisions:
     - Eight modules, each a function or small factory that takes callbacks: `events.ts`, `hover.ts`, `transitions.ts` (with `playUpdate`, the runner's order for an update), `leaving.ts`, `order.ts`, `watch.ts`, `setup.ts` and `format.ts`. A chart passes its name for error messages ("donutChart: unknown event …").
     - The chart supplies, beside finding a mark and its element, the mark as it is on screen, drawing the ring and showing the tooltip. Drawing the ring stays in `bar.ts`, since step 4 moves the adapter's masked ring into `src/charts/render/` for both charts.
     - Events are still made as each is sent (`emitEach(type, marks, read)`), so a listener that calls `update()` mid-batch sees what it did before.
     - `bar.ts` still re-exports `ChartEnv`, because the adapter and several tests import it from there; `src/charts/index.ts` exports it from `shell/setup.ts`.
     - The shell has unit tests of its own, so step 4 can lean on them without going through bars.
   - Move what doesn't know about bars out of `barChart`, with no change in behaviour:
     - **events:** the listener sets, `emit`, `emitEach` and the handle's `on()`;
     - **hover:** the hovered mark and its source; starting and ending a hover (emphasis, dimming, tooltip, runner, event); the wiring of `pointerHover` and `keyboardFocus` (pointer and focus share one hover; Escape, blur and focus from a click); the mark that shows the focus ring; and keeping the ring and tooltip with an effect's `transform`. The chart supplies how to find a mark from an event target, its element, and how to draw its ring;
     - **transitions:** one transition in flight, earlier `update()` promises taken over (`supersede`), `settle()` calling `runner.settle()`, leaving marks (`leave()`, `sweep()`), and the runner's order for an update (interrupt; exit, update and enter with their events; the announcement; `keyboard.sync()`);
     - **DOM order:** moving mark elements into visual order while the focused one stays put;
     - **size and motion:** the once-a-frame `ResizeObserver`, fonts' `loadingdone`, and `--ec-hover-duration` from `motion`;
     - **helpers:** `resolveTarget`, `containerWidth`, `describeChart`, `checkNeeds`, the default `format`, and `ChartEnv` (still exported from `src/charts/index.ts`).
   - Layout, drawing, ticks and `retarget` stay in `bar.ts`. Write the modules for one more chart (the donut, step 4), not for every chart that might come.
   - Fix the comment in `src/charts/tooltip.test.ts` that calls a 1.5× scale "a pulse": a pulse never scales a mark.
   - **Done when** `bar.test.ts`, the conformance, matchweek and adapter tests, and every visual baseline pass, with no test or baseline changed.
2. ✅ **`wiggle`, `pulse`, `stagger` and the built-in presets.** Owns `src/effects/wiggle.ts`, `src/effects/pulse.ts` and their tests, `stagger` in `src/effects/combinators.ts`, the `"stagger"` timing in `src/core/motion.ts`, and the `wiggle` and `pulse` presets in `src/registries.ts`.
   - The effects as decisions 6, 7 and 9 describe, and the presets as decision 8.
   - Tests on the manual clock with the recording layer, including the guardrails on every conformance fixture: no outline point moves more than `swing` px at any frame; a pulse's last frame comes before 5 s even with `effect` timing scaled ×2 in Presentation; stagger's waits are 0 in Analysis and Off, and the spread never passes 500 ms; and `expectTypeOf` checks that `stagger` keeps the kind and the row needs. The new effects join the record in `src/effects/conformance.test.ts`.
   - Docs: architecture.md (Effects, the timing table, presets), README and `src/effects/README.md`. Delete the sketch's declarations of `wiggle`, `pulse` and `stagger`, and the stale ones of `flash` and `motionSwitch`, so the examples use the real exports.
   - **Built** as planned ([architecture.md](architecture.md#wiggle)). Decisions:
     - `wiggle` is three half-swings, each a sine arch half the size of the one before and on the other side, so the first reaches the cap exactly. The cap is `2·asin(swing / (2·reach))`, and never more than 15°, so a tiny mark nods instead of spinning (3 px of movement would let a 3 px dot turn 60°). It follows `onChange`, so in the `update` slot it rocks about the pivot as it is now.
     - `pulse` asks `motion.duration(600, "effect")` before each pulse and stops at the first that would end at 5 s or later; if a single pulse would take that long, it draws nothing. The width eases out and the fade is linear.
     - While `stagger` waits, it follows `onChange`, so the effect starts on the geometry and data as they are when its turn comes (bars growing in on enter).
     - `testContext` takes `scaling` overrides, for the 5 s test.
3. ✅ **D3 as a dev dependency, and pies through `expressive()`.** Owns the devDependencies in `package.json`, `package-lock.json`, `src/charts/adapter/`, and the D3 pie source in `src/conformance.test.ts`.
   - Add `d3-shape`, `d3-selection`, `@types/d3-shape` and `@types/d3-selection`, pinned to exact versions. `src/package.test.ts` gains a check that `package.json` has no `dependencies`.
   - Order of marks described with `geometry`: when they all share one pivot (within 0.5 px), keyboard focus and `marks()` go clockwise by the angle of each mark's `center` about the pivot, from 12 o'clock. Otherwise they keep document order, as now.
   - jsdom tests on a real `d3.pie()` (default sort, so data order isn't ring order) with `d3.arc()` paths in a centred `<g>`: hover, keyboard order around the ring, `markLabel`, `refresh()` with new data (with `value`, only slices whose value changed update), `travel` rolling around a slice, and `destroy()` putting everything back.
   - The D3 pie joins the sources in `src/conformance.test.ts`.
   - Docs: a D3 pie example in README and in architecture.md's Adapters. The page passes the arc generator's radii to `describe.arc`, plus `value: (d) => d.value`; without `value`, every slice updates when one value changes. Also record the Vega helper's move to M4. The sketch keeps its `d3-shim.ts`.
   - **Built** ([architecture.md](architecture.md#adapters)), with no change to `src/effects/`. Decisions:
     - Pinned: `d3-shape` 3.2.0, `d3-selection` 3.0.0, `@types/d3-shape` 3.2.0 and `@types/d3-selection` 3.0.12, dev only (`npm ls --omit=dev` lists nothing). `src/package.test.ts` checks that `package.json` has no `dependencies`, or an empty one.
     - The ring order is tighter than planned (Codex's review, bf5ad8d): it applies only to marks that go round one pivot, meaning each pivot is within 0.5 px of the first, and each mark's `start`, `center` and `end` are the same distance from it (within 0.5 px), more than 0.5 px away. A line's pivot is its first point, on its own walk, so lines that share a starting point (cumulative goals and xG at 0) keep document order. Angles are in [0, 2π), and ties keep document order.
     - The pie tests are in `src/d3-pie.test.ts`, beside `src/index.ts` rather than in `src/charts/adapter/`, since they import `travel` and `flash`. Beyond the list above, they cover Home and End, the order read again on `refresh()`, `refresh()` without `value` (every slice updates), and the focus ring and a `flash` halo on a slice's outline.
     - `MarkSource` takes an optional `each`, which the adapter never calls: with `@types/d3-selection`, TypeScript inferred the row type from the last overload of `data()`, which left a real selection's callbacks typed `unknown`.
     - In `src/conformance.test.ts`, the goals-and-assists assertion is its own `describe.each` over the two bar sources, and the effect checks run over all three.

**Wave 2** (after wave 1 lands):

4. ✅ **`donutChart`.** Owns `src/charts/donut.ts`, `src/charts/donut-layout.ts` (pure, like `bar-layout.ts`) and their tests, `DonutChartOptions` in `src/charts/types.ts`, category entries in `src/charts/legend.ts` if it needs any change, the total row in `src/charts/table.ts`, a shared masked focus ring and halo in `src/charts/render/` (moved out of `src/charts/adapter/expressive.ts`, a small edit there), and the donut source in `src/conformance.test.ts`.
   - **Built** (October 2026), with nothing in `src/effects/` changed and no existing test's expectations changed. [architecture.md](architecture.md#donut-chart) describes it. Decisions:
     - **Shared code.** The masked ring and halo are `src/charts/render/outside.ts` (`maskedRing`, `maskedHalo`); the adapter uses them unchanged, and `svgMarkHandle` takes a `halos` group to draw its halo there. The ring now takes an effect's `transform`. What the donut needed from `bar.ts` moved out with no change in behaviour, and `bar.ts` imports it: the check of the options every chart shares (`checkChartOptions`, `shell/setup.ts`), `busy`, `same`, `sameFields` and `geometryChanged` (`shell/transitions.ts`), `sizeAttributes` (`render/svg.ts`), and `placeText` with `TextPlacement` (`render/text.ts`). `percent` is in `shell/format.ts`. The legend gained `categories()` beside `update()`, so `barChart`'s call didn't change.
     - **Colours** are keyed by the slice's key, which is its category unless `key` is given, so they follow the entity even when two categories read the same.
     - **Size.** The ring leaves room for a label wherever one could land (the widest category beside it, a label's height above and below), so it keeps its size as values change and labels move. When that would leave less than half the radius the chart could have, the ring takes half and labels that don't fit are dropped. At 640 × 300 with the lab's outcomes the outer radius is 108 px (the lab's is 116).
     - **Labels** lean continuously with their slice's middle angle (beside the ring at 3 and 9 o'clock, above it at 12, below at 6), so a label never jumps while its slice turns. The overlap check also compares the last label with the first, since they meet at 12 o'clock.
     - **Turning.** Each slice keeps how far it has turned from the order it was joined in to its place in the new one. The shorter way is chosen once, at the target values, so it can't flip as values change mid-turn. Leaving slices stay in the ring where they were, after the slice they followed, as a stack keeps a series on its way out. An update during the values stage carries on from the order the slices are joined in; one mid-turn turns each slice on from where it is.
     - **Edge cases.** A slice with no angle draws nothing, not even its separator. With a total of 0 the slices are still marks (named "Goal: 0 shots, 0%", in the table and the keyboard order) with no angle. A donut whose total grows from 0 shows its shares from the first frame, since they're true from the start. A `center` function that throws is reported and shows nothing, the first line shrinks to fit the hole, and the total counts between totals while a change plays. The slices' names are worked out before anything changes, since with no table and no centre text they're the first to call `format`, so a `format` that throws rejects cleanly (found in review); every chart's options check now also rejects a `format` that isn't a function.
     - **Legend and table.** The legend lists one category too, since its entry names the colour. `table.share` names the Share column, and `table.total` the total row as well as a stack's total column.
     - **Conformance.** `wiggle`, `pulse` and a staggered `flash` joined the effects in `src/conformance.test.ts`, so they run on bars, our donut and the D3 pie.
     - **Sketch.** `docs/sketches/api.ts` uses the real `DonutChartOptions`, but still declares `donutChart`, as it does `barChart`, until the handle has `focus()`, which example 03's `chartSwitch` needs.
     - Built on one branch in four commits (shared code, the donut with its updates, conformance, docs) rather than two PRs: the updates share the drawing's state, and splitting them would have meant writing `update()` twice.
   - `donutChart(target, { label, data, category, value, key?, sort?, center?, legend?, … })`, with the shared chart options (`on`, `tooltip`, `markLabel`, `markDescription`, `table`, `announce`, `format`, `colors`, `seriesLabels`, `dim`, `width`, `height`, `motion`), exported from `src/index.ts`. The layout and drawing are decision 5, and the accessibility is decision 4.
   - `center` is `false` or `(total, format) => string`, with `"\n"` breaking lines and the first line drawn large. By default it's the total in `format`, then the value's series label: "406" over "shots", as in the lab.
   - Values: a missing value counts as 0, a negative or non-finite one throws, and a total of 0 draws no slices. The default height is 300 px, and the ring is as large as the room left for labels allows. Resizes re-lay out without animating.
   - Each slice is a `describe.arc`. Data effects get its row and samples from 0 to its share (§2.4).
   - The default tooltip is the category, then "112 shots · 28%".
   - Hover, focus, the tooltip, transitions, sizing and the update order come from step 1's modules, shared with bars.
   - **The proof:** the conformance checks pass for `travel`, `flash`, `wiggle`, `pulse` and `stagger` on real slices from `donutChart`, and this step changes nothing in `src/effects/`.
   - Docs: a Donut chart section in architecture.md, and the README. Replace the sketch's `donutChart` declaration with the real export, and use `category` in examples 03 and 07.
   - Suggested as two PRs: the drawn, interactive donut first, then animated updates.
5. ✅ **The effect API goes public.** Owns `src/effects/define.ts` (new), a new `src/testing/` entry, `tsup.config.ts`, the `exports` in `package.json`, `src/package.test.ts`, `docs/effects-guide.md`, `CHANGELOG.md` (new), and switching both conformance test files to `checkEffect`. It merges after step 4, since it states what the donut proved.
   - `defineEffect(spec)` and `defineDataEffect<D>(spec)` fill in `kind` and a no-op `clear`, throw a `TypeError` unless `run` and `end` are functions (every effect needs an end state), and freeze the result. `expectTypeOf` tests keep the sketch's row-type checks.
   - `expressive-charts/testing` as decision 10. `checkEffect` takes data effects too: `data(mark)` gives each fixture's `MarkData`. Without it the suite makes one (no datum, samples from 0 to 1, no related series), so a data effect with `needs.related` must pass `data`. `src/package.test.ts` checks the new export.
   - Remove `@experimental` from `matrix` and `offset`, and the "experimental until M3" and "internal for now" notes in architecture.md and `src/core/testing/index.ts`.
   - The guide; `CHANGELOG.md` with the 0.x promise; and a README section on writing effects. Replace the sketch's `defineEffect` and `defineDataEffect` declarations with the real exports, so sketch 06 compiles against them.
   - **Built** ([architecture.md](architecture.md#writing-effects), [the guide](effects-guide.md), [CHANGELOG.md](../CHANGELOG.md)). Decisions:
     - **The definers** keep only `run`, `end`, `clear` (and a frozen copy of `needs`), so `this` in a spec's method is the frozen effect. They don't wrap `run`; `checkEffect` reports a `run()` that returns no promise instead. `DataEffectSpec<D>`'s functions are properties, not the sketch's methods, so a spec that reads fields `D` lacks is a type error; sketch 06's three `@ts-expect-error` lines fail with the same diagnostics as before.
     - **`checkEffect` options** add `batch` (a staggered effect waits its turn, as the old loop's third-of-five mark did) and `name` (for the report) to the planned `marks`, `icons` and `data`. `marks` takes named marks or a list such as `chart.marks()`, named by key. `icons` defaults to none rather than the core icons, so the suite and the effect tests don't bring in `src/icons`.
     - **Overloads:** a data effect typed for its own rows needs `data` at the type level; a geometry or generic data effect doesn't.
     - **The checks**, as §8, with three refinements: mark styles are compared rounded to 0.001 like pictures, ignoring key order and unset fields; after clearing, three more frames run and nothing may come back (a detached task drawing after its tween is cancelled); and an aborted run must resolve, as `GeometryEffect.run`'s contract says, though the runner tolerates an `AbortError` rejection. Every check runs on every mark before the one `Error` is thrown.
     - **The entry** exports `checkEffect`, `fixtures`, `testContext`, `play` and the recording types. `recordingSurface`, the recording factories, `measurePath` and `flush` stay internal. `fixtures` is the old loop's eight marks, now also used by `wiggle.test.ts`. A test runs `checkEffect` with the runner's globals removed, since the repo's tsconfig types them everywhere.
     - **Our conformance tests** went from one test per effect, mark and check to one `checkEffect` per effect (and per source), so a failure lists every mark at once. `src/conformance.test.ts` gained `wiggle`, `pulse` and a staggered `flash`; the effects file gained `travel` by icon name.
     - **The worked examples** moved from sketch 06 into `docs/sketches/examples/effects/` (`trace.ts`, `delta.ts`), which sketch 06 imports. `src/effects-guide.test.ts` runs them through `checkEffect` (`vitest.config.ts` resolves `"expressive-charts"` to `src/index.ts`) and checks that the guide shows them verbatim. **Found:** the sketch's `delta` failed `checkEffect`: its `end()` drew the label without the `opacity: 1` its run ended at. It also anchored the text at its start on a bar growing left, so the label covered the bar's tip. Both are fixed.
     - The build checked from outside: the built `dist/testing.js` passes and reports failures under `node:test`, and `dist/testing.cjs` loads with `require`.
     - **What the donut proved,** merged after step 4: `checkEffect` passes for every built-in effect (`travel` with the ball and the cleat, the ball-then-cleat `sequence`, `flash`, `flash` with a rolling ball, `wiggle`, `pulse`, a staggered `flash`) on real slices from `donutChart`, as on `barChart`, `expressive()` bars and the D3 pie. Nothing in `src/effects/` or `src/core/` changed for the donut.

**Wave 3:**

6. ✅ **`demo/donut.html`, its screenshots and the listening script.** Owns `demo/donut.html`, `demo/donut.ts`, a hand-written D3 pie in `demo/`, the link in `demo/index.html`, `tests/visual/donut.spec.ts` with its `donut-` baselines, a small edit to `tests/visual/demo.ts` (opening a given page), the donut section of `docs/a11y-check.md`, and the visual-tests paragraph in CONTRIBUTING.md.
   - The page as decision 11, with the lab's shot outcomes (Goal 58, Saved 112, Off target 149, Blocked 87), the motion switch, and a checklist that is the "Done when" list below. "Next match" adds a seeded match's shots, announced, and stops after a fixed number of matches.
   - The screenshots as decision 11, made in Docker (`npm run test:visual:update`).
   - A donut listening script in `docs/a11y-check.md`. **You run it** with NVDA + Chrome, and the names and roles are adjusted to what you hear.
   - Then check the "Done when" list in the browser with you.
   - **Built** (October 2026), with nothing in `src/` changed. **Your screen-reader check passed** with NVDA + Chrome (22 October 2026): all 13 steps of [a11y-check section D](a11y-check.md#d-the-donut-page-donutchart-and-a-d3-pie) read as expected, so the names and roles stay as built. Decisions:
     - **Layout.** On one column the page was 2,415 px tall, past the visual suite's 2,000 px viewport. From 860 px wide, the donut and the D3 pie sit side by side, so the same effect can be compared on both, with the columns below; narrower, it's one column. The page ends at 1,819 px at 1000 px wide.
     - **An order control (Data order, Largest first), beyond decision 11.** "Next match" never changes the order with these numbers (the gaps of 25 to 37 shots widen over the matches), so without it the donut's second stage, the turn, couldn't be seen. It drives all three: the donut's and the columns' `sort`, and `pie.sort(null)` or `d3.pie()`'s default on the D3 pie.
     - **The effect picker** destroys and rebuilds the donut, the columns and the attachment with the data and order as they are (open question 14). The motion is page-wide and the donut's colours are pinned by outcome (`colors`), with the D3 pie given the same slots in the page's CSS, so both survive a rebuild, and focus stays on the picker, which isn't rebuilt. A test checks all four.
     - **Matches** are seeded (seed 11, the bars demo's generator): each adds from none to twice an outcome's average (Goal 1.5, Saved 3.5, Off target 4.5, Blocked 2.5), so some slices don't change and don't flash. After ten, the total is 505. Only the donut announces ("Match 1: Saved and Off target changed"), so a screen reader hears each match once; the status line beside the button isn't a live region.
     - **The D3 pie** (`demo/d3-pie.ts`) is drawn as D3 code would draw it: `d3.pie()` and `d3.arc()` (outer radius up to 108 px, inner 0.6 × that), paths joined by outcome so each keeps its element, labels (the outcome over its count) `aria-hidden`, and fills from classes the page maps to `--ec-series-N`. `expressive()` gets `value: (d) => d.value`, `describe.arc` with the radii read at each refresh, `keyboard`, `dim`, and a `markLabel` that names slices as the donut does ("Saved: 112 shots, 28%"). It's refreshed after every redraw, and on resize.
     - **Screenshots.** 13 baselines, all `donut-…`, from 14 tests; `openDemo(page, demo)` takes the page and its readiness check, bars by default. The mid-roll frame is 80 ms in, since `travel` eases out and is 86% of the way round at 200 ms. Hovers aim at the point inside the slice farthest from its edge: a large slice's bounding-box centre is in the hole. Docker passed all 32 tests twice, and no bars baseline changed.
     - **Checked at real frame rates** in headless Chromium, since the browser pane was hidden (a hidden pane throttles frames). Hover, on all three charts: in Presentation the ball takes 400–500 ms, a wiggle 450 ms and two pulses 1.2 s; in Analysis the ball and the wiggle end within 200 ms and the pulses take about 420 ms; Off shows the ball at its end at once, and wiggle and pulse draw nothing. "Next match": in Presentation the slices resize over 470 ms and the changed ones flash about 50 ms apart; Analysis is one stage under 200 ms, with the flashes together; Off jumps, with no flash. A re-order alone turns for 500 ms, and a match with a re-order runs both stages, about 980 ms. The keys walked the listening script's tab order and ring order, before and after a re-order.
     - **Phone width** (open question 15): at 375 and 320 px wide all four labels fit, because the ring shrinks (an outer radius of about 107 px at 375, 92 at 320) before any label is dropped. No horizontal scroll.
     - **Noticed, not changed:** the donut's table heads its value column "shots", the field's name, beside "Share". Only `seriesLabels` renames it, and that also changes the slices' names and the centre ("406 Shots"), so the page leaves it. And on hover the donut darkens the slice (its built-in emphasis) while the D3 pie only dims the others, since the adapter leaves styling to the host.

**Done when:**
- `donutChart` draws the lab's card 3 donut on the library: slices with separators, outside labels, the centre total, a legend, the tooltip, a data table with share and total, ARIA names, keyboard order around the ring, and staged updates. Light and dark come from the library's defaults.
- The same `travel` rolls around slices on `donutChart` and on a real `d3.pie()` through `expressive({ geometry })`, with no change to `src/effects/travel.ts` or `src/effects/gaits.ts` during M3.
- `wiggle`, `pulse` and `stagger` are built, and `on: { hover: "wiggle" }` and `"pulse"` work on bars, the donut and the D3 pie. Tests enforce the guardrails: 3 px, under 5 s, and no stagger in Analysis or Off.
- `checkEffect` passes for every built-in effect on every fixture, and on real marks from `barChart`, `donutChart`, `expressive()` bars and D3 pies.
- `defineEffect`, `defineDataEffect`, `matrix` and `offset` aren't experimental; `expressive-charts/testing` is exported; the guide's examples are type-checked; and `CHANGELOG.md` states the 0.x promise.
- `demo/donut.html` passes its checklist in the browser. The donut screenshots are green in CI, and the bar baselines haven't changed.
- Your donut screen-reader check passes.
- The package still has no runtime dependencies, and `typecheck`, `test` and `build` are green.

**Status: complete (October 2026).** Everything on the "Done when" list is met:
- **The donut** draws the lab's card 3 on `demo/donut.html`: separators, outside labels, the centre total, a legend, the tooltip, a table with Share and a total row, ARIA names, keyboard order round the ring, and staged updates (step 6's frame timings). Both themes come from the library's stylesheet; the page sets no `--ec-*` tokens.
- **The same `travel`** rolls round slices on `donutChart` and on a real `d3.pie()` through `expressive({ geometry })`. `src/effects/travel.ts` and `gaits.ts` last changed in M1 step 6, before M3 began.
- **`wiggle`, `pulse` and `stagger`** are built (step 2), with tests for the 3 px, 5 s and no-stagger-in-Analysis-or-Off guardrails. The `"wiggle"` and `"pulse"` presets play on the donut, the columns and the D3 pie, checked at real frame rates in each mode.
- **`checkEffect`** passes for every built-in effect on every fixture and on real marks from `barChart`, `donutChart`, `expressive()` bars and D3 pies (step 5). The effect API is public, `expressive-charts/testing` is exported, the guide's examples are type-checked, and `CHANGELOG.md` states the 0.x promise.
- **The demo's checklist** passed in the browser with you: the hover stories on all three charts, the effect picker, "Next match" and the order in each mode, keyboard focus, and dark mode. The donut screenshots pass in Docker, in the image CI runs, and the bar baselines haven't changed; CI runs them on the pull request.
- **Screen reader.** Your donut check passed with NVDA + Chrome (22 October 2026): all 13 steps of [a11y-check section D](a11y-check.md#d-the-donut-page-donutchart-and-a-d3-pie) read as expected. VoiceOver + Safari hasn't been run on the donut.
- **No runtime dependencies** (`npm ls --omit=dev` is empty), and `typecheck`, `test` and `build` are green.

M2's re-check of the bar descriptions is still open; it's separate from M3.

### M4: Line chart and data effects

`lineChart`, with series lines, point marks and a crosshair that hovers every series at the nearest x. `MarkData` samples along a line, plus `samples`, `samplesAlong` and `watch` for adapters. `threshold` in `on.decorate`, following `onChange`. The `playback()` controller, with `playButton()` (WCAG 2.2.2) and the chart's `reveal()`. A ball riding the line's leading edge (`ride: "on"`). Last, and free to slip to M6: the Vega helper `fromVegaView()` ([adapter spike](ideas/adapter-spike.md), recommendation 3), moved here in M3 planning (M3 decision 2). Vega's line items carry every vertex with its row, so they give `samples` without `samplesAlong`.

**Demo:** `demo/line.html`, the lab's card 2: goals vs expected goals over a season, with the goals line red wherever it's below xG, "Play season" with a pause button, and a scrubber. Beside it, the same story on a D3 line through `expressive()`.

**Where M4 starts** (checked against main while planning, 22 October 2026):

- **Already built.**
  - `describe.line` and `describe.point`. A line of one point has length 0, a repeated point keeps the direction so far, and `slice(t0, t1)` interpolates part of a leg. So a line revealed part way through a week is a `describe.line` of the vertices so far plus the interpolated end. A point is a dot: length 0, with `start`, `end` and `center` at the point.
  - The runner's `decorate` slot. It starts on enter and stays until exit, and `change()` hands every live run, finished or not, the new geometry and the mark's latest data. `runner.hover()` takes several marks and gives each its place in the batch, though every caller passes one today.
  - `travel`'s `ride: "on"`. On `onChange` it keeps its progress and plans the trip again, so a ball resting at the end of a growing line moves to the new end and turns (a roll's spin is distance ÷ radius). The ball comes back when a walk that shrank under 0.5 px grows again. So a ball riding the leading edge during playback needs no change to `travel`.
  - `"playback"` timing (×1 in Presentation, ×0.3 in Analysis, 0 in Off) and `linear`, both public.
  - `Paint` has `width` and `linecap` (`"butt"` or `"round"`), and the SVG layer joins strokes round.
  - `Sample.at` (the x value behind a sample). The conformance fixtures include a line (four points, 2 px wide) and a point, and `testContext().change(mark)` exists for effect tests.
  - `placeTooltip(anchor, …)` is pure, and its anchor is just an x with a top and a bottom, so a crosshair can give one. The adapter's masked focus ring already goes round an open outline.
  - `d3-shape`, `line()` included, is already a dev dependency.
- **Assumed by the plan but not built.** `lineChart`, `reveal`, `threshold`, `playback`, `playButton`, `samplesAlong`, the adapter's `samples` and `watch`, and `fromVegaView` exist only as declarations in `docs/sketches/api.ts`.
- **Gaps.**
  - **One mark at a time.** The shell hovers one mark: `chartHover` keeps one key, marks one element `ec-hot`, shows one tooltip and passes one mark to the runner. The keyboard is a flat list with one key per element. That's enough if a line chart's focus targets are its x positions (decision 1).
  - **Pointer hover** maps an element to a mark and reads no coordinates. That's enough if each x has its own hit column, as each bar has its band.
  - **The tooltip.** `chartTooltip.show()` takes a `MarkGeometry`, not a point.
  - **The table** adds a Total column whenever there's more than one series. A line chart mustn't: goals plus xG means nothing. Extra columns can only go after the category, but the lab's Difference column is last.
  - **The legend** lists series or categories, in palette colours only, so a page can't add "Goals below xG" in `--ec-negative`. And `legend` is only a bar and donut option.
  - **Hover styling assumes filled marks.**
    - Dimming fades every `.ec-mark` that isn't hovered.
    - Emphasis is a `fill` rule for `.ec-segment` and `.ec-slice`.
    - `svgMarkHandle`'s halo and emphasis don't handle open outlines.
  - **`MarkData.datum`** is typed `D`, one row, but its comment says a line series gets all its rows.
  - **The adapter:**
    - Data effects get `samples: []`, and `needs.related` is never checked.
    - A mark's colours are read from `fill` only, so a stroked line has none: emphasis does nothing, and the `"mark"` colour falls back to series 1.
    - `maskedHalo` fills each part's path in its mask, which closes an open line into a polygon.
    - Nothing watches attributes, and `refresh()` re-reads every mark.
    - Without `value`, a growing line fires `update`.
    - On hover it dims the other marks but doesn't darken the hovered one (noticed in M3).
  - **`checkEffect` never calls `change()`.** So following `onChange`, which is `threshold`'s whole job, isn't checked. Neither conformance file runs a data effect.
- **Out of date.** Each item is fixed by a step below or by this plan:
  - §2.4 and §2.5 give a line point a walk from the first point to it, but `describe.point` is a dot (decision 4).
  - §5.2's line example puts `decorate` at the top level instead of under `on`, and has a `pointer` option that decision 9 drops.
  - §7.2 lists a `stop()` the sketch never had.
  - The sketch types `x` as `number | Date` (decision 3).
  - The `MarkData` comment above.
  - architecture.md's planned `threshold({ compareTo, color })` has no `when`.
  - The effects guide says `expressive()` gives no samples "yet (planned for M4)".

**Decided while planning M4 (October 2026):** decisions 1–8 are yours, and 9–14 follow from them and the code.

1. **Line focus: one stop per x.**
   - The `<svg>` is `role="group"`, named by `label`.
   - Each x is one focus target, `role="img"`. It's named like a stacked bar, from its x and each series' value with its label: "12: 15 goals, 14.2 xg" by default, or "Matchweek 12: 15 goals, 14.2 xG" through `markLabel(d, row)`, which gets the bar chart's `MarkSummary`.
   - The chart is one tab stop. The arrow keys go to the next or previous x (Down and Right to the next, Up and Left to the previous, as on bars), and Home and End to the ends, with no wrap-around.
   - Focus hovers every series' point at that x, as the pointer's crosshair does (`source: "keyboard"`).
   - The lines, markers, end labels and crosshair are `aria-hidden`.
   - You run a short listening script with NVDA + Chrome, as for bars and the donut.
2. **`reveal(x)` is a view, not a data change.**
   - It fires no `enter`, `exit` or `update`.
   - Each line's walk ends at x, interpolated between vertices, so playback is smooth. The chart calls `change()` for the lines on every reveal, so decorations (the threshold colour, the riding ball) follow.
   - Points past x are hidden, can't be hovered or focused, and aren't in `marks()`. If the focused x is hidden, focus moves to the nearest revealed x.
   - The scales are laid out from all the data, so nothing moves while the line plays out.
   - The table, the names and the announcements cover all the data, whatever is revealed.
3. **Numbers only on x for now.** `x` is a numeric field or function. Dates come by M6, as an addition: time ticks and `Intl` formatting, written without a dependency. The sketch's `number | Date` narrows to `number` until then.
4. **A point is a dot.**
   - A line's point marks (`goals@12`) are `describe.point`s, with length 0. `travel` does nothing on them and `threshold` draws nothing, while halos and `wiggle` still work.
   - This matters because `only("goals", …)` matches each goals point by its series as well as the line by its key. With dots, it acts on the line alone.
   - §2.4 and §2.5 are corrected; no builder changes.
5. **Straight lines only in v0.1** (open question 9). Lines are polylines, so arc length and `threshold`'s crossings stay exact. A `curve` option goes to the backlog. Host lines drawn with curves work only approximately:
   - the page has to describe the curve with enough points taken from the path itself (`describe.shape` is planned for that);
   - `threshold`'s crossings between samples are then approximate (decision 11).
6. **The Vega helper is the last step, and can slip to M6.** vega and vega-lite become dev dependencies pinned to exact versions, as D3 is (M3 decision 1). The helper is duck-typed on the View, so the library imports nothing from Vega and gains no runtime dependency.
7. **The adapter darkens the hovered mark under `dim: true`**, as our charts do: the stroke of a line, the fill of a bar or slice. Without `dim`, the host's styling stays untouched. The host-chart hover screenshots on `bars.html` and `donut.html` change once, in step 4.
8. **The demo** is `demo/line.html`: the lab's card 2 on `lineChart`, beside the same story on a D3 line through `expressive()` (`samples`, `samplesAlong`, `watch`). One Play button, one scrubber and the motion switch drive both. A Vega-Lite line joins them if step 8 lands.
9. **Drawing the line chart.**
   - **Options.** `lineChart(target, { label, data, x, series, key?, labels?, legend?, … })`, plus the shared chart options (`on`, `tooltip`, `markLabel`, `markDescription`, `table`, `announce`, `format`, `colors`, `seriesLabels`, `dim`, `width`, `height`, `motion`).
     - There's one row per x, drawn in ascending x. `key` defaults to x, is converted with `String()`, and must be unique.
     - x values must be unique too, whatever the keys: a duplicate x throws, since each x is one focus target, one hit column and one place to reveal to (decision 1). This holds even when a page's own `key` keeps the rows apart.
     - `series` lists numeric fields.
     - A missing or non-finite value throws for now. A line can't count it as 0, the way a bar does, and gaps are backlog.
     - There's no `pointer` option: the crosshair is the line chart's hover, and hovering the nearest point alone is backlog.
   - **Marks.**
     - Each series is a line mark, its `key` and `series` its field: a `describe.line`, drawn 2.25 px wide (the lab's width) with round joins and butt caps, so a coloured part ends exactly at its data.
     - Each row's value is a point mark keyed `"<series>@<row key>"` (`goals@12`): a dot of radius 4.5 px, ringed in `--ec-surface`, hidden until its x is hovered or focused.
     - `marks()` gives the lines, then the revealed points by x.
   - **Data.**
     - A line's `MarkData` has the row at its revealed end as `datum`. It has one sample per revealed vertex (`t` by distance along the walk, `at` its x), plus the interpolated end when the reveal falls between rows.
     - A point's data has its row and its one value.
     - `related(series)` gives the other line or, for a point, the other series' point at the same x.
     - The `MarkData` comment changes to say so.
   - **Layout.**
     - 300 px high unless `height` says otherwise.
     - y runs from 0 (or from the lowest value, if it's negative) to a nice maximum of all the data, with gridlines and ticks in theme colours. x spans the rows' range.
     - Each line ends in a dot in its own colour.
     - The right margin fits each line's end label: its value in `format` and its series' label ("52 goals"), in theme text colours. Labels are kept 16 px apart (the lab's rule), and they count between values while a change or a reveal plays. `labels: false` turns them off, and a function words them.
   - **Hover.**
     - Each x has a hit column reaching halfway to its neighbours, so the pointer hovers the nearest revealed x without reading coordinates.
     - A dashed crosshair in `--ec-axis` marks the x, and the points there show in their strong colours.
     - The tooltip sits above the highest of those points: the x in bold, then each series' value with its label ("15 goals · 14.2 xg"), or a tooltip function's text from the row.
     - Nothing dims, since every series is read at once and the lines aren't hover targets. So `dim` does nothing here.
     - The focus ring goes round each focused point.
   - **Legend and table.**
     - The legend lists the series, plus entries the page adds for colours its effects draw, such as `{ label: "Goals below xG", color: "negative" }`. Charts can't know effects, so the page names them.
     - The table has a row per x: the x column, one column per series and no Total, plus the page's own columns, which can go after the values.
   - **Colours** follow the series through a `ColorAssignment`, as on bars.
10. **Updating the line chart.**
    - `update()` merges and checks the options, and calls the runner in the shell's order. Values animate in data units, per row key.
    - Presentation stages a change, 500 ms base for each stage:
      1. values (the y values and the y scale);
      2. positions (the x scale). New rows grow out of the row before them, and leaving rows fold into theirs.
    - Analysis runs one stage of at most 200 ms, and Off jumps.
    - A line gets `update` when any of its values or rows changed, and a point when its own value changed. A new row's points `enter`, and a removed row's `exit`.
    - Resizes re-lay out without animating.
11. **`threshold({ compareTo, when = "below", color = "negative" })`.**
    - **Kind.** A data effect. `compareTo` is a number or a series name. A name goes in `needs.related`, so creating a chart without that series throws.
    - **Comparing.** It compares the mark's samples with the reference:
      - a constant, as it is;
      - a series, by `at` where both have it, with the reference interpolated between its samples and no colour outside its range;
      - otherwise by `t`.

      Crossings are found by interpolating linearly in `t` between neighbouring samples. That's exact only where the walk is straight between them: on our lines, and on a host polyline whose samples sit at its vertices (`samplesAlong` on the points that drew it). Along a curve, values aren't linear in distance, so a crossing between two samples is approximate. A page with curved lines can pass denser samples to narrow the error.
    - **Drawing.** It draws one overlay path per run of samples below the reference (or above it, with `when: "above"`): `mark.slice(t0, t1)`, stroked in `color` at the mark's `thickness` with butt caps.
      - On a bar, that colours the part past a target across the bar's full thickness, with a square end over a rounded tip.
      - A walk shorter than 0.5 px draws nothing.
    - **No animation.** It draws at once (it's an encoding, and a fade would flicker as a line extends), and redraws on every `onChange`. Its end state is the same picture, so the colour shows with motion off (Principle 3).
    - **Edge cases.** Equal values aren't coloured. `compareTo` must be a finite number or a non-empty string, `when` one of the two values, and `color` a non-empty string, or it throws a `RangeError`, as `flash` does.
    - **`checkEffect` gains a fifth check.**
      - After a full run, `change()` to another geometry of the same mark must leave the picture that `end()` draws on it. So an effect that should stay attached is checked to follow `onChange`, which the guide already asks for.
      - The fixtures each get a moved twin; a page's own marks pass `moved(mark)` or skip the check.
      - Nothing is published yet, so this goes in CHANGELOG's Unreleased section; it doesn't need a 0.2.
12. **`playback()` and `playButton()`.**
    - **The controller.** `playback({ from, to, duration, ease = linear, timing = "playback", motion?, onFrame })` returns `{ play(), pause(), seek(x, options?), position, playing, subscribe(listener), destroy() }`. It's in core, as a clock-driven controller with no DOM, and uses the page-wide motion unless it's given one.
    - **`play()`** goes on from where it is, or from `from` if it's at the end, over the remaining share of `duration`. The lab plays a whole season in 6.5 s and scales that by what's left.
      - It plays at `linear` speed, and Analysis takes ×0.3.
      - Off jumps to `to` at once. Motion turning off mid-play also jumps to the end, as tweens do.
    - **`seek(x)`** pauses and moves to x over 350 ms base `transition` timing (≤ 200 ms in Analysis, a jump in Off), retargeting if it's already moving, as the lab's scrubber does. `{ animate: false }` jumps.
    - **No `stop()`.** `pause()` meets WCAG 2.2.2, and `seek(to)` shows the end.
    - **`subscribe`** hears play, pause, the end and seeks, not every frame (that's `onFrame`).
    - **The button.** `playButton(target, playback, { labels })` is a `<button type="button">` whose text is Play or Pause.
      - It has no `aria-pressed`, since its name changes.
      - `labels` gives the page's words ("Play season"). The button goes back to Play at the end.
      - It's in `src/charts/controls/`, and injects the shared stylesheet like `motionSwitch`.
    - **Nothing plays by itself:** there's no autoplay option.
    - The page wires its own `<input type="range">` to `seek()`, and to `subscribe` and `onFrame`.
13. **Data on host marks.**
    - **`samples(datum, mark)`** gives a mark's samples. They're checked when read: t in [0, 1] and ascending, and finite values.
    - **`samplesAlong(mark, points)`** (public, in `src/core/geometry`) projects data points, in the marks' coordinates, onto the nearest point of the walk, and returns the samples in `t` order.
    - **Without `samples`,** rect marks with a numeric `value` get the bar chart's samples (0 to their total, and each segment its own range), so `threshold` against a constant works on host bars.
    - **`related(series)`** finds the mark's own segment of that series, or else another mark whose series has that name (two D3 line paths).
    - **`needs.related`** is checked against the series on creation and on every `refresh()`, and throws before anything changes.
    - **Stroked marks.** When the fill is `none`, a mark's colours come from its stroke, so halos are in the line's own colour and emphasis darkens the stroke. On an open outline, the masked halo cuts out the stroke, as the ring does, and is stroked at the line's thickness plus its own width, so as much of it shows as round a closed mark.
14. **`watch: true` is opt-in** (open question 13).
    - A `MutationObserver` on the attachment's elements notes changes to geometry attributes (`d`, `x`, `y`, `width`, `height`, `cx`, `cy`, `r`, `points`, `transform`).
    - It also watches `transform` and `style` on every ancestor from the marks up to the root `<svg>`. A host that animates a parent `<g transform>` changes none of the marks' own attributes, but the marks' geometry and the overlay's transform both depend on that chain.
    - Once a frame, on the chart's clock, the adapter re-reads only the marks that changed (their datum, geometry and samples) and calls `runner.change()`, with no events and no interrupt, as our charts' frames do. A change on an ancestor re-reads every mark below it. A change at or above the marks' common ancestor also recomputes the overlay's transform.
    - So a decoration follows a host's own transition, or a page's per-frame redraw, without `refresh()`. `refresh()` would fire `update` and cut hover short.
    - The page's `geometry` should read the element, or a datum the host updates each frame (as the demo's reveal does). One that reads the transition's target datum only sees the end.
    - Step 6 measures the cost and says whether `watch` stays opt-in.

Each step names the files it owns, so steps in the same wave can run in parallel sessions. Files shared by several steps get small edits only, and whichever step lands second merges main first: `src/index.ts`, `src/core/index.ts`, `src/effects/index.ts`, `src/charts/index.ts`, `src/charts/controls/index.ts`, `src/charts/types.ts`, `src/charts/render/theme.ts`, `package.json`, the two conformance test files, `docs/architecture.md`, `README.md`, `CHANGELOG.md`, `docs/effects-guide.md`, `docs/sketches/api.ts` and this plan.

**Wave 1** (parallel):

1. ✅ **Shared code for marks hovered together.** Owns `src/charts/shell/hover.ts`, `src/charts/tooltip.ts`, `src/charts/table.ts`, `src/charts/legend.ts` and `src/charts/render/mark-style.ts`, with their tests; `src/charts/keyboard.ts`, if it needs any change; and the `legend` option's type in `src/charts/types.ts`.
   - `chartHover` hovers a target that stands for several marks. The chart maps a target key to its marks' keys, and each mark gets `ec-hot`, a runner hover in one batch, and a `hover` event with its place in the batch. Leaving ends them all. Bars and the donut map each key to itself. The keyboard stays a flat list of targets.
   - The tooltip shows at a point (the crosshair), as well as at a mark.
   - The table:
     - lets the chart say whether there's a Total column;
     - lets a page column go after the values.
   - The legend:
     - takes extra entries `{ label, color }`, a theme token or a CSS colour, after the series;
     - `legend` moves to the shared chart options.
   - `svgMarkHandle`: on an open outline, emphasis mixes the stroke colour, and the halo is stroked behind the line at its thickness plus the halo's width. Hover dimming and emphasis get rules for strokes, for the line step to use.
   - **Done when** the tests and visual baselines for bars, the donut and the adapter pass with none changed, and the new code paths have tests of their own.
   - **Built** (October 2026), with no change in behaviour for bars, the donut or the adapter: the 1076 existing tests pass with their expectations unchanged, beside 20 new ones, and the Docker visual suite passes with no baseline changed. [architecture.md](architecture.md#reference-charts) describes it. Decisions beyond the plan:
     - **Hover.** `chartHover` takes `marks(key)` (default: the target alone) and `markElement(key)` (default: `element`), so bars and the donut map each key to itself through the defaults and their calls didn't change. `element` is the target's, which takes focus; `markElement` is each mark's, which takes `ec-hot`; `onScreen` is asked for marks. Each `hover` and `leave` event carries the batch the runner gave that mark's run, so the two agree. If a hovered target's marks change, `dropGone()` (called after every update) leaves the marks it lost and hovers the new ones, so a series added under a held keyboard hover shows too. The runner hears the target's whole new batch, and a new mark's event has its place in it, so it matches the run the runner replays when the change settles (Codex's review). `restyled(key)` redraws the ring and the tooltip when the restyled mark is one of the target's. `keyboard.ts` didn't change.
     - **Tooltip.** `showAt({ x, top, bottom }, row, summary)` takes the point in the `<svg>`'s units and no `transform`: the chart places the points as it wants them. `summaryContent(…, { total: false })` drops the total line, for the line chart's "15 goals · 14.2 xg".
     - **Table.** The chart says `total` (default: more than one series), and a page's column takes `after: "category" | "values"` (default `"category"`). A column after the values also follows the total and a donut's share, with an empty cell in the total row. `table.total`'s comment no longer says when the column shows.
     - **Legend.** `legend?: boolean | { entries?: { label, color }[] }` is in `ChartOptions`, with `LegendOptions` and `LegendEntry` exported. `Legend.update()` and `categories()` take the option instead of a show flag, so `bar.ts` and `donut.ts` pass `current.legend`, a one-line change in each, outside this step's files. `checkLegendOption` in `legend.ts` replaces the boolean check in `shell/setup.ts`, also outside them; its first message still starts "legend must be true or false". With entries, one series is listed too, since there are then two colours to name. A donut with no categories shows none, entries or not. `"mark"` and `"mark-strong"` are rejected as an entry's colour, and labels must be non-blank, as `seriesLabels` are.
     - **Mark style.** `StyledPart.open: { width }` marks an open outline. Its halo is `width` plus the halo's width, with round caps (the plan didn't say which), so it shows round the ends too. With the `halos` option, an open part went to `maskedHalo` as before, which filled the path in its mask (step 4's `outside.ts`); step 4 now passes it the part's width, so the mask cuts out the stroke. The line chart draws halos behind its lines.
     - **CSS.** Two rules: `.ec-stroke` (`fill: none`, stroked in `--ec-mark`, round joins, a stroke transition) and `.ec-hot .ec-stroke` (`--ec-mark-strong`). Neither sets a width, so the chart's attribute (the geometry's `thickness`) wins. **Where the plan and the code differed:** the plan asked for dimming rules for strokes too, but none was needed. Dimming is the other marks' opacity, which already fades strokes. The gap noted above, that dimming fades every `.ec-mark` that isn't hovered, is settled by decision 9 (the line chart doesn't dim) and by each hovered point being `ec-hot`.
2. ✅ **`threshold`.** Owns `src/effects/threshold.ts` and its tests, the fifth check in `src/testing/check.ts` (with the fixtures' moved twins in `src/testing/fixtures.ts`), `threshold`'s entries in `src/effects/conformance.test.ts`, and the guide's threshold section.
   - As decision 11, tested on the manual clock with the recording layer:
     - crossings on the line fixture against a constant, and against a related series both by `at` and by `t`;
     - `when: "above"` on a bar;
     - a reference with fewer samples, or more;
     - redrawing on `change()`, and nothing drawn on a point;
     - `expectTypeOf` checks for the kind and `needs`.
   - The fifth check, with a test that an effect which draws once and ignores `onChange` fails it. If the guide's `trace` or `delta` fails it, fix the example and the guide together.
   - Docs: a `threshold` section in architecture.md's Effects, README, `src/effects/README.md`, the guide (`threshold` as the built-in data effect, and samples on each chart) and CHANGELOG. Delete the sketch's `threshold` declaration.
   - **Built** as decision 11 describes ([architecture.md](architecture.md#threshold)), with no change to the other effects. Decisions beyond the plan:
     - **Matching by `at`** needs every sample of both series to have a number or a `Date` there; string labels, or `at` on one side only, fall back to `t`.
     - **The reference's own samples count.** Between two of the mark's samples, the comparison is split wherever the reference has a sample (where it bends), so a reference with more samples than the mark is followed exactly, not cut across.
     - **Equal within 1e-9**, relative to the values' size, counts as equal, so float noise in a cumulative sum colours nothing. A sample whose value isn't finite colours neither leg beside it, and a missing related series draws nothing.
     - It keeps its paths across changes, updating them in place, and takes the data that `onChange` passes, keeping the last when none comes.
     - **The fifth check also runs after `end()`.** With motion off the runner draws `end()` instead of running, and the mark still moves, so `checkEffect` changes the mark after a full run and after `end()`, and compares both with `end()` on the moved mark. It waits for any animation a change starts (up to 10 s). `moved: (mark) => MarkGeometry | undefined` gives a page's own marks theirs. The fixtures' twins stay internal (`src/testing/fixtures.ts`), so the testing entry's exports don't change.
     - **The guide's `trace` and `delta` failed it**, as did its first example (`underline`, also in the README), which drew once. All three now redraw from `onChange` in `run()` and in `end()`; `trace` and `delta` draw through one helper each, so a run's last frame and `end()` can't differ.
     - **Real marks too.** `src/conformance.test.ts` draws each of its four sources again at another size, for the fifth check, and runs `threshold` against a constant there with `checkEffect`'s default data. Every built-in effect passes on the fixtures and on those marks.
     - The guide shows what `threshold` compares on each chart in a table of its own, so step 4 still owns the `samples` row of the `MarkData` table.
     - **Fixed while here:** `sequence` started every part on the geometry and data from when it started, so in sketch 02's `sequence(travel(…), threshold(…))` the colour started where the line had been before the travel, and stayed there until the next change. It now follows `onChange` from the start, as `stagger` does while it waits. The runner's `change()` also keeps an `update` run's previous values in the data it hands on (as its swap to `end()` already did), so neither combinator drops them.
3. ✅ **`playback()` and `playButton()`.** Owns `src/core/playback.ts` and `src/charts/controls/play-button.ts`, with their tests, and the `.ec-play` rules in `src/charts/render/theme.ts`.
   - As decision 12, tested on the manual clock:
     - playing over the remaining share of the duration;
     - each mode's scaling, Off jumping, and motion turning off mid-play;
     - pause and resume;
     - `seek` animating and retargeting;
     - `subscribe`'s notifications;
     - the button's text and focus across play, pause and the end.
   - Docs: a Playback section under Controls in architecture.md, README, and §7.2. Replace the sketch's `playback` and `playButton` declarations.
   - **Built** as decision 12 ([architecture.md](architecture.md#playback)), with no visual baseline changed. Decisions beyond the plan:
     - **Where it starts.** At rest at `to`, the way a chart shows all its data until something reveals less, so the first `play()` starts from `from`, as the lab's does. `onFrame` is called only when the position changes, so nothing is drawn at creation.
     - **Speed.** A play from part way takes its share of the *scaled* duration rather than scaling its share, so the speed holds under any timing rule, even one with a floor or a cap (`timing: "transition"` caps the whole run at 200 ms in Analysis, and half of it takes 100 ms). With `"playback"`'s plain factors the two are the same. A mode change mid-play, other than to Off, keeps the speed it started with, as tweens do.
     - **Its own frame loop** on the clock, not a tween, so it knows the end the moment it lands and says `"end"` synchronously. It takes a `clock` as well as a `motion` (as `animated` values do), both defaulting to the page-wide ones.
     - **Off at the end.** `play()` doesn't jump back to `from` first: the end is already showing, so nothing moves, and it's heard as `"play"` then `"end"`.
     - **Seeking.** `seek(x)` clamps to the range. `ease` is only for plays: a seek eases in and out from rest, and out when it interrupts a moving position (a play, or another seek), the rule `animated` values use. `pause()` leaves a seek on its way alone, so a scrubber handler that calls `pause()` and then `seek()`, as example 02 does, still glides.
     - **Notifications.** A listener gets the event's name (`PlaybackEvent`: `"play" | "pause" | "end" | "seek"`). A seek during a play is heard as `"pause"` then `"seek"`. A listener can call the playback, and whatever it starts wins; one that throws is reported, and the rest still hear.
     - **Errors.** If `onFrame` or `ease` throws, the position stops where it is, a play is heard as paused, and the error is reported once (by the clock, or thrown to whoever caused a jump). Options are checked when it's made: a `RangeError` for `from` or `to` that aren't finite or are equal, a negative `duration` or an unknown `timing`, and a `TypeError` for a missing `onFrame` or a wrong `ease`, `clock` or `motion`. `from` above `to` plays backwards. `motion.ts` exports its list of timings (internally, not from core's index) for the check.
     - **`destroy()`** pauses, and listeners hear it, so a button still on the page goes back to Play. After that, every call does nothing.
     - **The button.** `labels` takes `play` and `pause` (default "Play" and "Pause"), and a label of only spaces throws, since it would leave the button with no name. `playButton()` returns `{ element, destroy() }` like `motionSwitch`. Its text is only rewritten when it changes. `destroy()` doesn't pause the playback. The `.ec-play` rules follow the lab's `.btn` in theme tokens, with the same focus outline as the motion switch. The composition root re-exports it as it is: there's nothing to default.
     - **Docs:** Playback under Controls in architecture.md, README, §7.2. The sketch's declarations are replaced by a note. CHANGELOG is unchanged, since its Unreleased section lists only the effect-author API.
4. ✅ **Data on host marks.** Owns `src/charts/adapter/`, `src/core/geometry/samples.ts` (`samplesAlong`) and its tests, the open-outline halo in `src/charts/render/outside.ts`, and the host-chart hover baselines on `bars.html` and `donut.html`.
   - As decisions 7 and 13, tested in jsdom on hand-built D3-style lines:
     - samples given and missing;
     - `samplesAlong` on the line's own vertices and between them;
     - `related` across marks;
     - `needs` throwing on creation and on `refresh()`;
     - a stroked line's colours, and the halo and ring round an open outline;
     - hover darkening under `dim: true` only.

     The data effect in these tests is a recording one; the real `threshold` on a real D3 line comes in step 6.
   - Remake the host hover baselines in Docker. No other baseline changes.
   - Docs: Adapters in architecture.md, README, the guide's samples row, and CHANGELOG (`samplesAlong`). Replace the sketch's `samplesAlong` declaration, and `samples` in `PlannedExpressiveOptions`.
   - **Built** in `src/charts/adapter/` and `src/core/geometry/samples.ts` (details in [architecture.md](architecture.md#adapters)), with 25 new tests. The ten host hover and focus baselines changed (`story-host-` ×3, `reduced-story-host`, `focus-host-` ×2, `donut-ball-pie-` ×2, `donut-focus-pie-` ×2: focus plays the hover), and no other. Beyond the plan:
     - `samples` is also called for each of a mark's named segments, with that part's row and the segment's geometry, so `related(series)` on a stack has samples too. Equal `t`s are allowed (a step); a decreasing `t`, a `t` outside [0, 1] or a value that isn't finite throws a `RangeError` naming the mark, and something that isn't an array a `TypeError`. The adapter keeps a copy.
     - `samplesAlong` reads only the `MarkGeometry` contract: a grid of a point every px (at most 4096) finds each point's nearest stretch, and a golden-section search narrows it down. A point on the walk lands exactly (the ends on 0 and 1), one off it to well under 1e-6 px. Points at one `t` keep their order, every point on a dot gets `t = 0`, and a non-finite x, y or value throws. Its point type is exported as `SamplePoint`.
     - The default bar samples need every part's `value` to be a finite number, and run in proportion to distance, as `barChart`'s do, so a gap the host leaves between segments starts the later one a little past the earlier one's end.
     - `related(series)` looks at the mark's own segments and parts first, then at the first other mark in visual order whose geometry has that `series`. A mark isn't its own related series. A segment's data shares the mark's `related`.
     - `needs` is checked against every mark's `series`, its segments' and its parts'. It's skipped while there are no marks, so a page can attach before it draws. The error says how to name a series.
     - In `refresh()`, a mark whose samples changed, though its geometry and row didn't, follows through `change()`. When a mark of a series some effect `needs` changes, moves, comes or goes, every other live mark follows through `change()` too, so a decoration that reads xG through `related` hears a redraw of xG alone.
     - A fill that's transparent counts as `none`, and a gradient or pattern gives no colours, so emphasis and darkening leave it alone.
     - The darkening is an inline `fill` or `stroke` written through the adapter's edits, the same 75%-black mix `emphasis: 1` gives; an effect's `emphasis` wins while it's set. It fades with the hover feedback because the shared stylesheet's `.ec-attached` rule now transitions `fill` and `stroke` as well as `opacity` (a one-line change to `theme.ts`). That rule only applies under `dim`, but there it also fades a host's own colour changes over the 100 ms.
     - The open-outline halo's cut has round joins and butt caps, like the focus ring's, and the halo itself has round caps, as step 1's halo behind a line does, so it goes round the line's ends. After merging main, `svgMarkHandle`'s masked halos (`halos` option) pass an open part's width through too, which step 1 left for this step (one line in `mark-style.ts`, with a test).
     - **Where the plan and the code differ:** decision 7 says "as our charts do", but our charts' `-strong` colours step toward the text colour, so in the dark theme a hovered bar or slice gets lighter. The adapter mixes toward black in both themes, as the plan's "darker shade" says (and as `emphasis` on host marks already did). Mixing toward `var(--ec-text)` would match our charts in both themes; that's your call.

**Wave 2** (after wave 1 lands):

5. **`lineChart`.** Owns `src/charts/line.ts` and `src/charts/line-layout.ts` (pure, like `bar-layout.ts`) with their tests, `LineChartOptions` and `LineChart` in `src/charts/types.ts`, the line chart's rules in `theme.ts`, the line source in `src/conformance.test.ts`, and `src/xg.test.ts` (new).
   - As decisions 1–4, 9 and 10, built on step 1's shell. `reveal(x)` as decision 2: it's clamped to the rows' range, and the default, `reveal(Infinity)`, shows everything.
   - **The proof:**
     - `checkEffect` passes for every built-in effect on real marks from `lineChart` (lines and points), with no change to `src/effects/`. `threshold` gets each line's data from the chart's `enter` events.
     - `src/xg.test.ts` sits beside `src/index.ts`, like `matchweek.test.ts`, and plays the card's story: `threshold` and a riding ball as one decoration, through a reveal from week 1 to week 38. It checks the red runs and the ball at each step, and that Off shows both at once.
   - Docs: a Line chart section in architecture.md, README, the `MarkData` comment, and §2.4 if anything else differs. Replace the sketch's `LineChartOptions`. `lineChart` stays declared, like `barChart` and `donutChart`, until chart handles have `focus()`. Example 02 uses the real options.
   - Suggested as two PRs: the drawn, interactive chart with `reveal`, then animated updates.
6. **`watch`, and the proof on a real D3 line.** Owns `src/charts/adapter/` (after step 4), `src/d3-line.test.ts` (new) and the D3 line source in `src/conformance.test.ts`.
   - `watch` as decision 14, with jsdom tests:
     - the `MutationObserver` batched to one change a frame;
     - only changed marks re-read, with no events;
     - a parent `<g transform>` animated by the host, which moves the decorations and the overlay with the marks;
     - `destroy()` disconnecting it.
   - `src/d3-line.test.ts` on real `d3.line()` paths: `threshold` through `samples` and `samplesAlong`, the riding ball, keyboard order, and a page-driven reveal followed with `watch`.
   - **Measure** `watch` in headless Chromium, against the same frames without it:
     - the cost per frame of a D3 transition on a host bar chart;
     - the cost per frame of the reveal on a D3 line.

     Record the numbers in open question 13, and say whether `watch` stays opt-in.
   - Docs: Adapters, README and CHANGELOG. Replace the sketch's `expressive` declaration, which then has nothing planned left.

**Wave 3:**

7. **`demo/line.html`, its screenshots and the listening script.** Owns `demo/line.html`, `demo/line.ts`, a hand-written D3 line in `demo/`, the link in `demo/index.html`, `tests/visual/line.spec.ts` with its `line-` baselines, and section E of `docs/a11y-check.md`.
   - **The page**, as decision 8, with the lab's card 2:
     - the lab's season: seed 42, 38 matchweeks, cumulative goals and xG;
     - its legend's three entries ("Goals scored", "Expected goals (xG)", "Goals below xG") and its table (Matchweek, Goals, xG, Difference);
     - "Play season", and the scrubber with its "Through matchweek N" status;
     - the motion switch, and a checklist that is the "Done when" list below.

     On both charts the decoration is `only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on" })))`.
   - **Deliberate differences from the lab:**
     - The ball riding the goals line is new; the lab has none.
     - The lab turns the goals line's end dot and hover dot red below xG. Here the dots keep their series colour, since `threshold` draws nothing on a dot (decision 4). The tooltip's "vs expected" line and the table's Difference still say it.
     - "Goals below xG" comes after the series in the legend, since a page's entries follow them; the lab puts it between the two.
   - **Screenshots,** all named `line-…`:
     - light and dark at rest;
     - both charts mid-play, at week 20, with the red runs and the ball at the tip;
     - the crosshair with its tooltip;
     - the focus ring in both themes;
     - the D3 line hovered.

     Reduced motion and Analysis are checked in the DOM: Play ends at once with the colour and the ball drawn, and Analysis plays in about 2 s. The page fits 1000 × 2000, and the baselines are made in Docker.
   - A listening script for the line chart and the D3 line. **You run it** with NVDA + Chrome, and the names and roles are adjusted to what you hear.
   - Then check the "Done when" list in the browser with you, at real frame rates if the pane is hidden.

**Wave 4** (if it fits; otherwise it moves to M6):

8. **`fromVegaView(view, mark = "marks")`.** Owns `src/charts/adapter/vega.ts` and its tests, vega and vega-lite in `package.json` and `package-lock.json`, and the Vega-Lite line on `demo/line.html` with its `line-vega-` baselines.
   - Built to the adapter spike's recommendation 3:
     - it checks that `view.renderer()` is `"svg"`;
     - it reads the named mark's items from `view.scenegraph()`: each item's element is the one whose `__data__` is the item, and its row is `item.datum`;
     - it describes rects as bars, arcs as slices (with their angles ordered), and symbols as points;
     - it describes lines from the items' x and y, with samples straight from the items (no `samplesAlong`);
     - it refreshes itself through the View's data and resize listeners (the exact hook still needs checking);
     - keys come from the page.
   - Tests on a real Vega-Lite line chart and bar chart with the SVG renderer, including `threshold` on the line: in jsdom, or in Playwright if jsdom can't render them.
   - Docs: Adapters in architecture.md (what each library needs) and README.

**Done when:**
- `lineChart` draws the lab's card 2 on the library: two lines with end labels, a crosshair across both with the tooltip, a legend with the page's "Goals below xG", a table with a Difference column, a name for each matchweek, one tab stop whose arrow keys go week by week, and staged updates. Light and dark come from the library's defaults.
- `threshold({ compareTo: "xg" })` in `on.decorate` colours the goals line below xG on `lineChart` and on a D3 line through `expressive()` (with `samples` from `samplesAlong`). It follows every frame of a reveal, and shows with motion off.
- `playback()` and `playButton()` play the season (about 6.5 s in Presentation, 2 s in Analysis, at once in Off) and pause it; the scrubber seeks; and `reveal()` fires no events.
- The ball rides the goals line's leading edge on both charts, with no change to `src/effects/travel.ts` or `src/effects/gaits.ts` during M4.
- `checkEffect`, with its fifth check, passes for every built-in effect, `threshold` included, on every fixture, and on real marks from `barChart`, `donutChart`, `lineChart`, `expressive()` bars, D3 pies and D3 lines.
- `expressive()` has:
  - `samples` and `samplesAlong`;
  - the `needs` check;
  - stroke colours and open-outline halos;
  - hover emphasis under `dim: true`;
  - opt-in `watch`, with its cost measured and open question 13 answered.
- `demo/line.html` passes its checklist in the browser. The line screenshots are green in CI, and no other baseline has changed apart from step 4's host hover ones.
- Your line-chart screen-reader check passes.
- The package still has no runtime dependencies, and `typecheck`, `test` and `build` are green.
- `fromVegaView()` reads a Vega-Lite line on the demo, or has moved to M6 with a note saying why.

### M5: Morph

The `TransitionEffect` kind, `chartSwitch`, side-matched outline sampling, label tweening, and shared colour assignment. That includes colouring bars by category: today `barChart` colours by series, so the lab's columns would all be one colour. With category colours, one `ColorAssignment` keeps each outcome's colour from slice to column (found in the PR #30 review).

**Demo:** card 3 of the lab.

### M6: Hardening and 0.1.0

- A stress demo to set documented SVG limits (§10).
- Dates on `lineChart`'s x axis: time ticks and `Intl` formatting, with no dependency (M4 decision 3).
- `fromVegaView()`, if it slipped from M4 (step 8).
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
- **Line chart extras** (deferred in M4 planning):
  - a `curve` option, which needs sampled arc-length tables and approximate threshold crossings (M4 decision 5);
  - gaps for missing values: M4's line throws on them (decision 9);
  - hovering only the nearest point, instead of the crosshair.

---

## 10. Open questions and risks

### Open questions (each has a recommendation; none blocks M1)

1. **Morph correspondence.** Side-matched sampling (§2.2) *unrolls* a slice: its arc becomes the bar's height. The prototype instead *drops* the slice, so the outer arc becomes the bar's top. *Recommendation:* build the generic unroll in M5, compare it in the demo, and add a `morph({ align })` option only if the prototype's version reads better.
2. **CSS delivery.** *Decided in M2 planning: both* (M2 step 1). Auto-injected `<style>` vs a CSS file. *Recommendation:* both, with injection on by default (§7.1).
3. **Persisting the viewer's motion choice** across pages (`localStorage`). *Decided: opt-in `persist`* (M2 step 4). *Recommendation:* opt-in `motionSwitch(el, motion, { persist: "key" })`.
4. **Live-region announcements** on update, on or off by default. *Decided: off by default, with an `announce` option* (M2 step 5). *Recommendation:* off by default, with a one-line option.
5. **Playwright for visual regression** needs a new dev dependency plus browsers in CI. *Decided in M2 planning: yes, Chromium only; built in M2 step 6.* *Recommendation:* decide at M2.
6. **More subpath exports** (`expressive-charts/core`, `/effects`) for smaller bundles. The first one (`/icons/sport`) is needed in M1. *Recommendation:* decide the rest in M6 using real bundle numbers.
7. **TypeScript 7** (the native compiler) is a separate upgrade. *Recommendation:* after M1, once there's real code to typecheck.
8. **Framework wrappers** (React, Vue, Svelte) are out of scope for 0.1. The imperative `update()` API is designed to be easy to wrap.
9. **Line smoothing.** v0.1 lines are straight polylines, which keeps `threshold` crossings exact and arc length cheap. Curves would mean sampled arc-length tables and approximate crossings. *Decided in M4 planning: straight lines only in v0.1* (M4 decision 5). A `curve` option is in the backlog. Host charts drawn with curves work only approximately: the page describes the curve with points taken from the path, and `threshold`'s crossings between samples are approximate.
10. **Naming.** Keep the draft's `path` and `angle`, or rename them to `walk` and `heading` to avoid confusion with `outline`? *Recommendation:* keep them; the doc comments carry the meaning.
11. **Releasing.** Check that the npm name is available, and publish from CI with provenance.
12. **D3 in demos and tests.** Adapter demos and tests are most convincing against real D3, but D3 would be a new dev dependency (never a runtime one). *Decided in M3 planning: yes, `d3-shape` and `d3-selection` only, pinned, as dev dependencies* (M3 decision 1). *Recommendation:* M1 uses a hand-written SVG chart; decide on D3 as a dev dependency in M3, when pie paths need it.
13. **Cost of `watch`.** Following a host's transition through attribute changes means re-reading geometry on every frame. *Recommendation:* measure it in M4 before making it more than opt-in. *Planned in M4* (decision 14, step 6): `watch: true` is opt-in. It re-reads only the marks whose attributes changed, once a frame. Step 6 measures it on a D3 transition and a D3 line's reveal, records the numbers here, and says whether it stays opt-in.
14. **Changing effects with `update({ on })`.** Charts can't change `on` after they're created, so M3's demo recreates its charts when the viewer picks another effect. A page that switches effects loses focus and replays its enter effects. *Recommendation:* add it when a page needs it, by M6 at the latest. The runner would clear the slots' runs and resolve the new ones. *M4 planning:* the line demo has no effect picker, so M4 doesn't need it either.
15. **Donut labels at narrow widths.** M3 drops a label that would overlap the one before it, and every slice stays named in the legend, the tooltip, the table and its ARIA name. Leader lines, or labels inside large slices, would keep more of them. *Recommendation:* look at the demo at phone width in M3 step 6 and decide then. Don't add a label-placement engine before a page needs one. *Looked at in M3 step 6:* with the lab's four outcomes, every label stays at 375 and 320 px wide, because the ring shrinks first (to an outer radius of about 92 px at 320). Nothing is dropped, so the demo needs neither. Revisit with a page of many small slices.
16. **A test-runner flavour of `checkEffect`.** M3 exports one runner-agnostic function that throws. A Vitest helper that makes one test per fixture would report failures more readably, but it would tie the package to one runner. *Recommendation:* wait until effect authors ask for it.
17. **Naming a donut's value column.** The donut's table heads its value column with the field's name ("shots"). Only `seriesLabels` renames it, and that also changes the slices' names and the centre text (noticed in M3 step 6). *Recommendation:* a `table.value` header, beside `table.share` and `table.total`. M4 step 1 owns `table.ts`, so it could add it there if you want it in M4; otherwise in M6.

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
- **Refactoring `barChart` for the donut** (M3 step 1) can break what M1 and M2 tuned: staging, focus that follows its key, and a hover that waits out a transition. Mitigation: the step changes no test and no baseline, and it extracts only what the donut needs.
- **Marks that touch.** On a donut, effects and focus can reach a neighbour. A wiggle moves a slice's rim by at most 3 px, a masked halo covers at most half its width, and the focus ring covers a 2 px band. Each is bounded, brief or deliberate, and the neighbours are dimmed while a slice is hovered or focused. Mitigation: the donut screenshots show each case.
- **Going public too early.** The effect API is public before the line chart, its hardest test, is built. Mitigation: the 0.x promise allows a break in 0.2 with a migration note; the conformance fixtures already include a line and a point; and M4 runs `checkEffect` on the real line chart's marks, as M3 does on the donut's.
- **Real D3 in tests** can change under us. Mitigation: exact versions, dev dependencies only, and a test that the package has no runtime dependencies.
- **Runs on every point.** `only("goals", …)` matches every goals point by its series, as well as the line by its key, so a decoration on a 38-week line starts 39 runs, 38 of which draw nothing. Mitigations:
  - runs make their overlay group only when they first draw, so the empty runs cost objects, not DOM;
  - points are dots (M4 decision 4), so line effects don't misfire on them;
  - `only` takes a predicate for a page that wants the line alone;
  - the M6 stress demo counts it.
- **Vega internals.** `fromVegaView()` reads `__data__` and the scenegraph, which Vega doesn't document. Mitigations: exact versions, the helper duck-typed so the library never imports Vega, and the step free to slip to M6.
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
