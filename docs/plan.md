# Plan: expressive-charts v0.1

> **This is the project's development log.** It's the plan the library was built from, milestone by milestone, with each decision and the reasons for it, written to the maintainer as the work went along. To use the library, start with [the README](../README.md) and [the API reference](api.md); [architecture.md](architecture.md) explains how it works.

Status: M1 to M10 are complete (§9). M10 built curved lines and a hover on one point on the line chart, change labels that keep clear of other marks' labels, curved Vega lines, smaller pages for the motion core and `describe`, and a build on stable releases. M11, for 0.6.0, is planned in §9: a line chart as a chart switch's view, change text that keeps clear of other marks' change text, more host marks read by tag, a tidier hover on one point, `morph` that keeps gaps and holes, and a toolchain tidy. **0.5.0 is on npm**, published from CI through npm's trusted publishing with provenance on 29 October 2026 ([npm](https://www.npmjs.com/package/expressive-charts), [the release](https://github.com/Deaversbp/expressive-charts/releases/tag/v0.5.0)), after 0.4.0 and 0.3.0 on 27 October, 0.2.0 on 26 October and 0.1.0 on 24 October. Its demo pages are at [deaversbp.github.io/expressive-charts](https://deaversbp.github.io/expressive-charts/). Every section of [a11y-check.md](a11y-check.md) has passed with NVDA + Chrome; VoiceOver + Safari, and what comes next, are in the backlog at the end of §9. Sections that are built say so and point to [architecture.md](architecture.md). When a section turns into code, move what's final into architecture.md and the README, and mark the section here as done.

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
| `samples` | `[0 → v]` | `[0 → total]`; each segment covers its own range | one per revealed vertex, with `at`, plus the end part way to the next | one: its value | `[0 → share]` |

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
> **The contracts in §4.1 and §4.2 are built in M1 step 3** (`src/core/contracts/`), along with `matrix`, `offset` and the recording layer in `src/core/testing/`. [architecture.md](architecture.md#effects) is now the reference. Additions: `AnyMarkEffect` is exported for combinator signatures; the icon resolver is named `IconSource`; `mark.set()` merges the fields given (undefined resets one), so parallel effects don't undo each other; an icon is hidden until first placed; `matrix.apply(m, point)`; and `testContext()`, a ready-made `EffectContext` on a manual clock. The runner (§4.3) is built in M1 step 4. `travel` with its gaits and the combinators `sequence`, `parallel` and `only` are built in M1 step 6 (§4.4–§4.6), `flash` in M2 step 2, and `wiggle`, `pulse` and `stagger` in M3 step 2. `defineEffect` and `defineDataEffect` are built in M3 step 5, `threshold` in M4 step 2 and `morph` in M5 step 1.

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
| `morph({ points = 160, align })` | transition | Interpolates `outline.sample(n)` side by side between two geometries; `align` picks "unroll" or the lab's "drop" (M5 decision 1). | The target outline. |

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
> - `barChart`'s handle has no `focus()` yet, so `barChart` is still declared in the sketch, extending the built chart type. `tooltip`, `table` and `announce` are built (M2), and so is a `legend` option for stacks. (M5 step 2 added `focus(key)` and `labels()` to every chart's handle, and the sketch no longer declares the charts.)
> - `update()` jumps to the new state (staged transitions are step 8) and can't change `on` or `motion` yet. It rejects, changing nothing, on data it can't draw.
> - `sort` defaults to `"none"` (data order). `"key"` sorts keys with numbers in numeric order.
> - Bars are coloured by series through a `ColorAssignment` (`colorAssignment()` is built). Colouring each category, as the morph example needs, is open until M5. (M5 step 2 built it: `colorBy: "category"`.)
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

> **Built in M5 step 3** (§9), with each view's function given the switch's colours beside its container, and `morph()` as the default `transition`. See [architecture.md](architecture.md#switching-between-charts).

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

  This suite is how CONTRIBUTING's "check the effect against every built-in chart" becomes automatic. M3 step 5 exports it as `checkEffect` from `expressive-charts/testing`, for effects written outside the project too. Transition effects have `checkTransition` (M5 step 1): checks 1–4 on pairs of fixture marks, both ways, a run from `start: 0.5`, and the retrace check (M5 decision 14).
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

The donut comes *before* the line on purpose. The architecture's central bet is that one effect works on any chart, and a second chart type tests that more cheaply than the line chart, which also brings in data effects and playback.

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
    - **Built** in `src/charts/adapter/` to that recommendation (see [architecture.md](architecture.md#adapters)). Beyond the plan: `baseline: "auto"` also finds negative bars; keyboard focus draws a ring from the mark's outline and survives a host replacing the focused element; and `destroy()` restores every attribute, style and class it touched. Tested in jsdom on hand-built D3-style SVG, including the ball-and-cleat story. Still to come: circles and `describe.shape`, and the Vega helper (M4, moved in M3 planning). `samples` was built in M4 step 4, and `watch` in M4 step 6.
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

### M2: Bars at prototype parity ✅

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

**Status: complete (October 2026).** Everything on the list is met. The last item, a short screen-reader re-check of the new bar descriptions (the position), passed on 22 October 2026 ([a11y-check: Re-check after M2 step 7](a11y-check.md#re-check-after-m2-step-7)):
- **Card 1 parity, in the browser.** The tooltip ("Okafor · Forward", both numbers) doubles as each bar's description. The legend appears only for Goals + assists. The table has Player, Position, Goals, Assists and Total. "Play next matchweek" announces "Matchweek 25: Okafor and Lindqvist changed", and exactly those bars changed.
- **Themes.** Both come from the library's stylesheet, and the page sets no `--ec-*` tokens. The palette's contrast is enforced by `theme.test.ts`.
- **Strict CSP, in Chromium,** with the built package served as plain files:
  - `style-src 'self'` with the CSS file and `injectStyles: false`;
  - `style-src 'nonce-…'` with `configure({ nonce })`.

  Charts, hover stories, dimming, the tooltip and the keyboard focus ring all work in both, with no violations. A control showed that violations do reach the console.
- **Screen reader.** Passed with NVDA + Chrome before step 7. The "1 goal" wording was also confirmed with VoiceOver + Safari. Step 7 then added each bar's description (its position), and its re-check passed with NVDA + Chrome (22 October 2026): each bar's position was read after its name, and nothing was read twice. VoiceOver + Safari hasn't been run on the descriptions.
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

M2's re-check of the bar descriptions, separate from M3, passed with NVDA + Chrome on 22 October 2026, so M2 is complete too.

### M4: Line chart and data effects ✅

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
7. **The adapter gives the hovered mark its strong colour under `dim: true`**, toward the text colour, as our charts do: the stroke of a line, the fill of a bar or slice. Without `dim`, the host's styling stays untouched. (Step 4 built it as a mix toward black in both themes; at your request step 6 changed it to our charts' rule, so a hovered host mark gets lighter in the dark theme, as ours do.) The host-chart hover screenshots on `bars.html` and `donut.html` change once, in step 4.
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
    - **Stroked marks.** When the fill is `none`, a mark's colours come from its stroke, so halos are in the line's own colour and emphasis colours the stroke. On an open outline, the masked halo cuts out the stroke, as the ring does, and is stroked at the line's thickness plus its own width, so as much of it shows as round a closed mark.
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
     - A fill that's transparent counts as `none`, and a gradient or pattern gives no colours, so emphasis and the hover colour leave it alone.
     - The darkening is an inline `fill` or `stroke` written through the adapter's edits, the same mix `emphasis: 1` gives (75% with black here; step 6 made it the strong colour toward the text colour, decision 7); an effect's `emphasis` wins while it's set. It fades with the hover feedback because the shared stylesheet's `.ec-attached` rule now transitions `fill` and `stroke` as well as `opacity` (a one-line change to `theme.ts`). That rule only applies under `dim`, but there it also fades a host's own colour changes over the 100 ms.
     - The open-outline halo's cut has round joins and butt caps, like the focus ring's, and the halo itself has round caps, as step 1's halo behind a line does, so it goes round the line's ends. After merging main, `svgMarkHandle`'s masked halos (`halos` option) pass an open part's width through too, which step 1 left for this step (one line in `mark-style.ts`, with a test).
     - **Where the plan and the code differ:** decision 7 says "as our charts do", but our charts' `-strong` colours step toward the text colour, so in the dark theme a hovered bar or slice gets lighter. The adapter mixes toward black in both themes, as the plan's "darker shade" says (and as `emphasis` on host marks already did). Mixing toward `var(--ec-text)` would match our charts in both themes; that's your call. *You decided to match our charts; step 6 did it.*

**Wave 2** (after wave 1 lands):

5. ✅ **`lineChart`.** Owns `src/charts/line.ts` and `src/charts/line-layout.ts` (pure, like `bar-layout.ts`) with their tests, `LineChartOptions` and `LineChart` in `src/charts/types.ts`, the line chart's rules in `theme.ts`, the line source in `src/conformance.test.ts`, and `src/xg.test.ts` (new).
   - As decisions 1–4, 9 and 10, built on step 1's shell. `reveal(x)` as decision 2: it's clamped to the rows' range, and the default, `reveal(Infinity)`, shows everything.
   - **The proof:**
     - `checkEffect` passes for every built-in effect on real marks from `lineChart` (lines and points), with no change to `src/effects/`. `threshold` gets each line's data from the chart's `enter` events.
     - `src/xg.test.ts` sits beside `src/index.ts`, like `matchweek.test.ts`, and plays the card's story: `threshold` and a riding ball as one decoration, through a reveal from week 1 to week 38. It checks the red runs and the ball at each step, and that Off shows both at once.
   - Docs: a Line chart section in architecture.md, README, the `MarkData` comment, and §2.4 if anything else differs. Replace the sketch's `LineChartOptions`. `lineChart` stays declared, like `barChart` and `donutChart`, until chart handles have `focus()`. Example 02 uses the real options.
   - Suggested as two PRs: the drawn, interactive chart with `reveal`, then animated updates.
   - **Built** (October 2026) as decisions 1–4, 9 and 10 describe ([architecture.md](architecture.md#line-chart)), on one branch, in a commit per part, rather than two PRs, since the update code shares the drawing's state. `checkEffect` passes for every built-in effect on its lines and points with no change to `src/effects/`, and `src/xg.test.ts` plays the card's story through every half week of a reveal. 91 new tests (1281 in all); no visual baseline changed (there's no line demo yet). Decisions beyond the plan:
     - **Options.** `labels` is `false` or `(value, series, format) => string`: an empty string shows none, and a throw keeps the default and is reported once, since labels are worded on every frame. An x is shown as `String(x)`, with no grouping, so a year stays "2024": in the tooltip's title, the table's row header and the names. Rows are drawn in ascending x whatever the data's order. A duplicate x throws an `Error` naming both rows, as a duplicate key does, and series and keys that would join into the same point key (`"a@b"` and `"c"`, `"a"` and `"b@c"`) throw a `RangeError`.
     - **Reveal.** The chart keeps the x it was given and clamps it when it draws, so `reveal(Infinity)` shows rows added later, and after `reveal(20)` a row added past week 20 stays hidden until it's revealed. `NaN` throws a `RangeError`. What effects draw on a point past the reveal is hidden with it, so a decoration can't show data ahead of the reveal: `svgSurface` gained `hide(key, hidden)`, a small addition to `render/surface.ts`. A reveal redraws only the lines, their labels and the columns, since nothing else moves.
     - **Data.** Between rows, a line's `datum` is the last row at or before the reveal. When any line's data changes, every line's runs hear `change()`, as do a row's points when any of theirs does, since they read each other through `related` (fixed after Codex's review on PR #44: a threshold on goals didn't follow a change to xG alone). A line isn't its own related series, as on the adapter. Before the first row, a line is its first point alone.
     - **Layout.** The left margin fits the value ticks (and half the first x label); the right one fits the widest end label any row's value gives, measured once per shape since chart digits are tabular ("23 goals" is as wide as "48 goals"), or without labels the gridlines' 8 px past the last x. 12 px above the plot and 32 px below it, as in the lab. x is labelled at both ends and at round steps of about a quarter of the range between them, dropping a step that comes within 8 px of its neighbour. The value scale is the bar chart's `niceDomain`, and `bar-layout.ts` now exports `niceStep` and `clean` for the x labels.
     - **End labels.** Labels that would come within 16 px form a cluster spaced 16 px apart and centred where its members would sit, kept inside the chart. They count rounded to the decimals their series' values have (the larger of before and after while a change plays).
     - **Hover.** The hit columns are the chart's full height, and the last revealed one reaches its right edge, end labels included. A point fades in over the hover duration (opacity, not visibility), and only the columns take the pointer. The tooltip follows an effect's `transform` on the points, and the focus ring is a ring and gap per point behind the marks, as on bars, each moved with its point.
     - **Updates.** A new row grows out of the nearest row that stays before it, or after it when there's none before; with no row in common, rows appear and go at once. Growing and folding are in the positions stage, with the x range, so a sliding window keeps the line's ends on the plot's edges. A series' line fades in or out in the values stage while its values grow from 0 or shrink to it. Lines aren't cut at the new last x while everything is revealed, so rows removed from the end fold in rather than vanish. A line also gets `update` when a row's x changed under a page's key. At rest, `marks()` gives the geometry the events reported, unless the reveal has moved since. Announcements name rows by their x, and a function's `changed`, `added` and `removed` are row keys.
     - **Where the plan and the code differed:** nowhere that needed a choice beyond these. `dim` is accepted and does nothing, as decision 9 says; a `MarkSummary`'s `total` still adds the series up, since the type has it, though a line's rarely add up. CHANGELOG is unchanged: its Unreleased section lists the effect-author API, and the `MarkData.datum` comment only says what a line's row is.
6. ✅ **`watch`, and the proof on a real D3 line.** Owns `src/charts/adapter/` (after step 4), `src/d3-line.test.ts` (new) and the D3 line source in `src/conformance.test.ts`.
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
   - **Built** as decision 14, in `src/charts/adapter/watch.ts` (the observer and the frame) and `expressive.ts` (reading the marks that changed), with 35 new tests (1316 in all after merging step 5): 14 in `expressive.test.ts` (13 for `watch`, 1 for how rects are read); 8 in `src/d3-line.test.ts`, one of them driving the reveal from `playback()`'s `onFrame`, as the demo will; 12 for the D3 line source in `src/conformance.test.ts`, on step 5's season, where every built-in effect passes all five checks with its moved twin, and so does `threshold({ compareTo: "xg" })` with the adapter's own samples; and 1 in `space.test.ts`. Two visual baselines changed, both from the hover colour below: `focus-host-dark` and `donut-focus-pie-dark`, remade in Docker; the eight light host hover and focus baselines step 4 made still pass. Measured in headless Chromium; the numbers are in open question 13, and `watch` stays opt-in. Details in [architecture.md](architecture.md#adapters). Beyond the plan:
     - **What a frame reads, and what it keeps.** A frame reads the rows (through `datum`, a selection's `data()` or `__data__`, as a full read does), the geometry and the samples of the marks that changed. Values, colours (`getComputedStyle`), names (`markLabel` is never called per frame) and the elements stay as the last `refresh()` found them. So `refresh()` belongs right after the host's join, before its transition: an update compares values with the previous `refresh()` and starts `from` the mark as it is before the transition, and `watch` follows the frames. Without `value`, an update means a length changed between reads, and `watch` takes lengths in frame by frame, so a page that watches should pass `value`.
     - **Visual order follows the frames.** After a frame the marks are put back in visual order, so a sort's last frame reorders `marks()`, the arrow keys and `related` without a `refresh()`.
     - **So does the baseline** (fixed after Codex's review on PR #45). With `baseline: "auto"`, a frame finds the shared edge again from every bar's box, the new ones for bars that moved, and reads again any bar whose edge changed, so a bar that a transition takes from positive to negative grows from the line leftwards at the end, as `refresh()` would describe it. In a frame where no edge is shared (the bar crossing the line), each bar keeps the edge it had.
     - **`related(series)` is looked up when an effect calls it**, among the live marks in visual order, instead of being fixed when the mark was read. A goals line read again alone still sees xG as the last frame drew it. After a `refresh()` it finds the same mark as before.
     - **It stays on the clock until a quiet frame,** and takes the observer's pending records when its frame comes. A host that draws in its own frame callback asks for the next one there; staying on the clock keeps the clock's request after the host's, so each frame the host draws is followed in that frame. A host that draws from the clock itself (a reveal in `playback()`'s `onFrame`) is followed in the same tick, since `watch` joined the clock after it. Leaving after every frame put the request too late every other frame, and the effects trailed the marks by a frame on alternate frames (a jsdom test drives a browser-like frame loop to keep this, and the Chromium run checks it). If the clock is already running an animation and its callback comes first in each frame, the effects trail by one frame throughout: following is on the clock, as decided, not in the observer's microtask.
     - **Fewer screen CTMs.** Profiling showed `getScreenCTM` as the largest single cost: each rect asked for the common ancestor's, its parent's and its own twice over, 800 calls a frame on 200 bars. A read now takes each element's once (`screenMatrices()` in `space.ts`), and a rect is read through its parent's CTM and its own `transform` attribute, so bars that share a group cost two calls between them. That also fixes a rect being read back through the CSS transform an effect gives it (a hover `wiggle` during a host's transition would have fed its offset into the geometry, in browsers; jsdom has no CTMs). It speeds up `refresh()` too.
     - **Errors.** A mark it can't read in a frame (a rect a transition turns, a `geometry` that throws) is reported through the clock, and nothing changes; the next change tries again. A DOM without `MutationObserver` throws a `TypeError` when `watch` is asked for.
     - **Where the plan and the code differ:** decision 14 has an ancestor change at or above the common ancestor read every mark below it again, as well as moving the overlay. It only moves the overlay: the marks' geometry is in that ancestor's coordinates, so it can't have changed, and reading it again would only tell the effects of a change that isn't one. One below the common ancestor (a series group) has every mark inside it read again, as planned.
     - **The hover colour now matches our charts** (your decision on step 4's open point, decision 7). Under `dim: true` the hovered host mark takes its strong colour: `color-mix(in oklab, <colour>, var(--ec-text) 25%)`, so it's lighter in the dark theme, where step 4's 75%-black mix made it darker. Our palette's `-strong` colours sit 20% (light) and 29% (dark) of the way to the text colour in OKLab lightness, raising contrast with the surface about 1.45×; a fixed 25% gives 1.56–1.67× in light and 1.31–1.43× in dark, and keeps the hue, since the text colour is near-neutral. A host's colour has no palette slot, so there's no `-strong` to look up, and a per-theme amount would need a new token. **`emphasis` follows the same rule:** our charts' emphasis mixes toward `-strong`, and the adapter's toward the same strong colour, which is also its `"mark-strong"` token.
     - **Fixed while here:** the sketch's example 04 had `watch` with `update: "flash"` and no `refresh()`, so its flash could never fire. It now calls `refresh()` after the join and passes `value`.
     - The D3 transition in the measurement is written by hand (each bar's `width` set once a frame from `requestAnimationFrame`, with d3-transition's default cubic easing), since d3-transition isn't a dev dependency. The scratch page isn't in the repository; the hand-over note describes it.

**Wave 3:**

7. ✅ **`demo/line.html`, its screenshots and the listening script.** Owns `demo/line.html`, `demo/line.ts`, a hand-written D3 line in `demo/`, the link in `demo/index.html`, `tests/visual/line.spec.ts` with its `line-` baselines, and section E of `docs/a11y-check.md`.
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
   - **Built** (October 2026) as decision 8 and this step describe, with nothing in `src/` changed: `demo/line.html` and `demo/line.ts`, the D3 line in `demo/d3-line.ts`, 12 tests in `tests/visual/line.spec.ts` with nine `line-` baselines made in Docker (the suite passes 44/44, with no other baseline changed), and section E of [a11y-check.md](a11y-check.md#e-the-line-page-linechart-and-a-d3-line). The page records the deliberate differences above under "Differences from the lab's card". Decisions beyond the plan:
     - **Layout.** The two charts sit side by side from 860 px, under one bar with "Play season", the scrubber and its status, so a viewer sees both play at once. Their cards share rows (CSS subgrid), so the charts start at the same height. At 1000 px wide the page is about 1,650 px tall.
     - **The scrubber** is named "Matchweek", and its `aria-valuetext` is "Through matchweek N", so a screen reader hears the week as it moves. The status beside it isn't a live region. Both name the last whole week drawn, where the lab rounds. As step 3 asked, `onFrame` sets the slider only while the season plays.
     - **Names.** Each week is named "Matchweek 12: 18 goals, 19.0 xG" (`markLabel`, with "1 goal" in the singular) and described as "-1.0 vs expected" (`markDescription`), and the chart has a `description`. The D3 lines are named for the whole season ("Goals scored: 56 goals by matchweek 38"), whatever is revealed, as the line chart's names are (decision 2); `watch` never calls `markLabel` per frame anyway.
     - **xG is a dashed grey, and the ball is 11 px** (your choice after the first walk). The lab's orange xG sat too close to the red below it: an OKLab difference of 11 in light and 7 in dark, where goals and xG differ by over 30, and under simulated colour-blindness every palette slot came within 10 of the red or the blue. So the page sets xG's slot (`--ec-series-2` and `-strong`) to `--ec-text-muted` and the page's `--ink-2` on both charts, dashes the line chart's xG stroke (`.ec-line[data-key="xg"] .ec-stroke`) and the D3 path, and draws both legends' swatches as short lines, xG's dashed. The ball is `travel(…, { size: 11 })`, down from its own 17 px, so it doesn't hide the last weeks or crowd the end labels.
     - **Tooltip.** A tooltip function's text is plain, so the page's CSS makes its first line, the week, bold (`::first-line`). The lab's grey "vs expected" line is the same colour as the rest.
     - **The D3 line** is drawn by hand with d3-selection and d3-shape (d3-scale and d3-axis aren't dev dependencies): gridlines, ticks, and two paths with butt caps, so a red run ends where its data does, as on `lineChart`. Its HTML legend copies the line chart's. It reveals itself (`reveal(week)` sets each path's rows and `d`), and `resize()` draws it again at its parent's width, followed by `refresh()`. Its `value` is the line's value at its revealed end, so that refresh isn't taken for an update.
     - **Screenshots:** `line-page-light` and `-dark`; `line-play-week-20` (the controls and both charts at the first frame past week 20, with the button reading Pause); `line-tooltip` (week 12); `line-focus-chart-` and `line-focus-d3-` in both themes; `line-d3-hover`. **DOM checks:** Play takes 6.5 s in Presentation and 1.95 s in Analysis, and Pause holds both charts; the scrubber glides and hides the weeks after it; the names, legend and table; and with reduced motion, Play ends at once with three red runs and the ball where it rests at load (on the D3 line one frame later, when `watch` reads it).
     - **Checked at real frame rates** in headless Chromium, since the browser pane was hidden: Play took 6,516 ms in Presentation and 1,963 ms in Analysis with every frame at 16.7 ms, and ended at once in Off. The scrubber, hover, the keyboard and both themes behaved as in the tests, with no console errors.
     - **Where the plan and the code differ:** the table's headers are the series' labels, "Goals scored" and "Expected goals (xG)", not the lab's "Goals" and "xG", since `seriesLabels` names a series everywhere and the legend needs the long names. Its values share the chart's one `format`, so an xG of 20.0 reads "20" (weeks 5, 7, 9, 12, 13 and 30). Either would need a per-series option; the page lists both among its differences.
     - **Your checklist walk** (22 October 2026), on the page after the xG and ball change. The page's items 1–3 pass: the line chart, the red below xG on both charts (with motion off too), and Play, Pause and the scrubber in each mode. Staged updates aren't on the page, which never changes the data; step 5's tests cover them. Items 4–6 and 9 hold from the tests and git: `travel.ts` and `gaits.ts` haven't changed during M4, every effect passes `checkEffect` on every source, and there are no runtime dependencies. CI on PR #47 is green, the visual job included (item 7), and the only other baselines M4 changed are step 4's ten host ones. Still open: step 8, or its move to M6 (item 10).
     - **Your screen-reader check** (item 8) passed with NVDA + Chrome on 22 October 2026: all 12 steps of [section E](a11y-check.md#e-the-line-page-linechart-and-a-d3-line) read as expected, so the names, descriptions and roles stay as built.
     - **Noticed, for you to decide:** decorations draw above the points, so the red run crosses the hovered goals dot where goals are below xG. And the palette's slot 2 orange is close to `--ec-negative`, so any chart that pairs it with `threshold`'s default colour has this page's problem; a per-series dash option (with a dashed legend swatch) or a palette check against `negative` would let a page fix it without reaching into the chart's classes. Both are the library's, not the page's.

**Wave 4** (if it fits; otherwise it moves to M6):

8. ✅ **`fromVegaView(view, mark = "marks")`.** Owns `src/charts/adapter/vega.ts` and its tests, vega and vega-lite in `package.json` and `package-lock.json`, and the Vega-Lite line on `demo/line.html` with its `line-vega-` baselines.
   - Built to the adapter spike's recommendation 3:
     - it checks that `view.renderer()` is `"svg"`;
     - it reads the named mark's items from `view.scenegraph()`: each item's element is the one whose `__data__` is the item, and its row is `item.datum`;
     - it describes rects as bars, arcs as slices (with their angles ordered), and symbols as points;
     - it describes lines from the items' x and y, with samples straight from the items (no `samplesAlong`);
     - it refreshes itself through the View's data and resize listeners (the exact hook still needs checking);
     - keys come from the page.
   - Tests on a real Vega-Lite line chart and bar chart with the SVG renderer, including `threshold` on the line: in jsdom, or in Playwright if jsdom can't render them.
   - Docs: Adapters in architecture.md (what each library needs) and README.
   - **Built** (22 October 2026), in this planning session at your request, in `src/charts/adapter/vega.ts` and exported as `fromVegaView` ([architecture.md](architecture.md#vega-and-vega-lite-fromvegaview)). vega 6.4.0 and vega-lite 6.5.0, the versions the adapter spike tested, are dev dependencies pinned to exact versions; `npm ls --omit=dev` is still empty, and nothing in `src/` outside the tests imports Vega. 24 new tests in `src/vega.test.ts` on real Vega-Lite charts, which Vega renders as SVG in jsdom (1,340 tests in all). Decisions:
     - **Signature.** `fromVegaView(view, options)`: `expressive()`'s options without `datum`, `geometry` and `watch`, plus `mark` (default `"marks"`) and `sample`. It returns the attachment rather than, as the spike sketched, a mark source for `expressive()`, because it has to own refreshing: Vega replaces its elements. Its `refresh()` takes no source. Duck-typed on the View (`VegaViewLike`: `renderer()`, `scenegraph()`, `container()`). vega-typings declare `scenegraph()` as the root mark, but Vega returns `{ root }`, so both are read.
     - **The hook the plan left open.** Vega's data and resize listeners, and `runAfter`, run inside the dataflow, before the View renders, so they'd read the old elements. A `MutationObserver` on the View's `<svg>` notes what Vega draws instead: new elements, and changes to `d`, `transform`, `x`, `y`, `width` and `height`, ignoring the adapter's own overlay. The View is read again on the next frame, through `expressive()`'s `refresh()`. That covers new data, resizes and signals with no dataset names, and a View that hasn't run yet attaches with no marks and takes them up once Vega draws.
     - **Reading.** Every mark of that name in the scenegraph counts (Vega-Lite draws a line per series in a facet group). Each element is found by its `__data__` (a line's one path is bound to its first item), and items' coordinates are mapped from the element's parent's into the marks' common ancestor's.
     - **Mark types.**
       - Rects become bars through the adapter's own `baseline: "auto"` and stack reading: `segment` names a stack's parts, ordered from the baseline whatever order Vega-Lite stacks in.
       - Arcs become slices, with their angles put in order and their radii scaled.
       - Symbols become points of radius √(size/π).
       - Lines become lines at the item's `strokeWidth`, with `series` set to the key.
       - Other types throw a `TypeError`, and so does a line with a gap (`defined: false`).
     - **Samples need `sample(row)`**, a value or `{ value, at }`. The plan said samples come straight from the items, but the items say where each point is, not which field it shows.
       - A line gets a sample at each point, through `samplesAlong`, which is exact at the vertices.
       - Bars go from 0 to their value, and a stack's segments each over their own range. Slices go from 0 to their value, and points get their value.
       - Unless `value` is given, `sample` is also what each element shows (a line: every point's), so a resize isn't an update.
     - **The demo** draws a Vega-Lite line of the same season (`demo/vega-line.ts`), beside "Differences from the lab's card", with the same decoration, `keyboard`, `markLabel` and `dim`.
       - Vega writes the colours it's given as attributes, so the page's CSS maps them to the theme and styles the axes; the legend is the page's.
       - `config.aria: false` keeps Vega's own descriptions off. Its axes are hidden.
       - The page is 1,904 px tall at 1000 px wide; the lede is unchanged, so nothing above the charts moves.
     - **It shows the whole season rather than playing.** Measured in Chromium over a 391-frame reveal, a frame-by-frame reveal would be affordable: Vega's redraw takes 0.7 ms a frame (median; p95 1.9) and the adapter's re-read 1.8 ms (p95 4.5). But every data change gives Vega new elements, so:
       - a focused line would be replaced every frame;
       - an `update` would fire for both lines every frame (686 in the run);
       - the decoration would trail by a frame.

       A page that plays a Vega chart frame by frame would want a lighter path than `refresh()`; none is built.
     - **Conformance.** Every built-in effect, and `threshold` against xG with the View's own samples, passes `checkEffect` (five checks, with moved twins) on the View's lines. The checks are in `src/vega.test.ts`: the shared conformance file's sources are synchronous, and a View renders asynchronously.
     - **Screenshots.** Five new: `line-vega-light`, `line-vega-dark`, `line-vega-focus-light`, `line-vega-focus-dark` and `line-vega-hover`. `line-page-light` and `line-page-dark` were remade, since the page has a new card. No other baseline changed. Docker passed 50 of 50 twice.
     - **Screen reader.** Section E gains steps 13 and 14 for the Vega-Lite line, not run yet. Vega still gives the groups round its lines roles of its own (`graphics-object`, `graphics-symbol`), so step 13 listens for anything unnamed.
     - **Fixed after Codex's review on PR #48:**
       - A line Vega draws as a curve (any `interpolate` but `"linear"`) now throws, instead of being described as straight segments the effects would draw off the curve (decision 5).
       - A change to a line's `stroke-width` alone is now followed. The helper watches that attribute too, and `expressive()`'s `refresh()` now counts a mark whose thickness changed as moved, so its decorations hear `change()`. Before, only an outline or segment change did, so a D3 line whose width changed kept its old decorations as well. Six new tests (1,346 in all).

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

**Status: complete (24 October 2026).** Everything on the "Done when" list is met, the last two checks in M6:
- **The line chart.** `lineChart` draws the lab's card 2 (step 5), and `demo/line.html` passed your checklist walk (step 7).
- **`threshold`** colours the goals line below xG on `lineChart`, on a D3 line and on a Vega-Lite line. It follows every frame of a reveal and shows with motion off (steps 2, 5, 6 and 8).
- **Playback.** `playback()` and `playButton()` play and pause the season in each mode, and the scrubber seeks (steps 3 and 7).
- **The riding ball** rides the goals line's leading edge on all three charts. `src/effects/travel.ts` and `gaits.ts` haven't changed since M4 was planned.
- **`checkEffect`**, with its fifth check, passes for every built-in effect on every fixture, and on real marks from `barChart`, `donutChart`, `lineChart`, `expressive()` bars, D3 pies, D3 lines and Vega-Lite lines.
- **`expressive()`** has `samples`, `samplesAlong`, the `needs` check, stroke colours, open-outline halos, hover emphasis under `dim: true` and opt-in `watch`, measured (open question 13). `fromVegaView()` reads Vega and Vega-Lite charts (step 8).
- **Screenshots.** The line screenshots pass in Docker.
  - Beyond step 4's host hover baselines, two other kinds changed. Step 6 remade two dark host focus baselines, for your hover-colour decision. Step 8 remade the two full-page line baselines, since the page has a new card.
  - CI runs on step 8's pull request.
- **Screen reader.** Your NVDA + Chrome check of section E passed: steps 1–12 on 22 October 2026, and steps 13 and 14, for the Vega-Lite line, on 24 October 2026 (M6 step 7).
- **The Vega-Lite card** looked fine in the browser, in M6 step 6's walk (23 October 2026).
- **Packaging.** No runtime dependencies, and `typecheck`, `test` (1,346 tests) and `build` are green.

### M5: Morph ✅

The `TransitionEffect` kind played for real, `morph()`, `chartSwitch`, label tweening, and shared colour assignment. That includes colouring bars by category: today `barChart` colours by series, so the lab's columns would all be one colour. With category colours, one `ColorAssignment` keeps each outcome's colour from slice to column (found in the PR #30 review). Transition effects become part of the effect-author API, with a checker of their own.

**Demo:** `demo/morph.html`, the lab's card 3 with its morph: the shot outcomes as a donut that morphs into columns and back.

**Where M5 starts** (checked against main while planning, 22 October 2026):

- **Already built.**
  - **Canonical outline sampling.** A closed outline's `sample(n)` takes n/4 points per side, in the order left, end, right, start, clockwise from the start-left corner, with corners at 0, n/4, n/2 and 3n/4 for every kind of mark. Tests pin it.
    - A slice's sides are its outer arc, its end edge, its inner arc and its start edge.
    - A column's sides are its left edge (going up), its top, its right edge and its baseline.
    - So matching side to side is decision 1's "unroll", and the lab's "drop" turns the column's samples by a quarter.
    - A bar's rounded tip is part of its end side. A point is four quarter arcs.
  - **The type.** `TransitionEffect` exists as a type (`run(from, to, ctx)`, `end`, `clear`), and every mark slot, `sequence` and `stagger` reject it with a clear `TypeError`.
  - **Pieces to build on.** The runner exports `runScope`, which builds a run's context. `testContext()` can already be passed to a transition's `run`.
  - **Colours.** `colorAssignment()` is shared by passing the same object; the donut colours by key; and the legend lists categories (`categories()`).
  - **Focus.** The keyboard has `focus(key)`, and the adapter's handle exposes one.
  - **Timing.** `"transition"` timing scales a 950 ms base exactly as the lab's `dur(950)` does: 950 ms in Presentation, 200 in Analysis.
  - **The labels to tween.** The donut's category and share labels (`ec-label`, `ec-value`), its centre text, and the columns' category and value labels.
- **Assumed by the plan but not built.** `morph()`, `chartSwitch` and a way to check a transition effect exist only as the sketch's declarations (`morph` without `align`; `ChartSwitch` without `chart(view)`).
- **Gaps.**
  - Nothing plays a `TransitionEffect`. The runner plays mark slots only, and its surface's groups are typed by mark slot.
  - `checkEffect` takes mark effects only, and throws on a transition.
  - **Chart handles** have no `focus(key)`, no way to hide their marks, and no way to read their labels; labels exist only as `<text>` in the DOM.
  - **Bars colour by series:** every column takes `colors.slot("shots")`, one colour for all. A single series has no legend.
  - **Overlay styling.** The stylesheet's text sizes are scoped to `.ec-chart`, so a separate overlay `<svg>` needs that class.
  - **Hidden containers.** A chart in a container with no width lays out at 640 px and its `ResizeObserver` ignores the 0.
  - **The public list.** `TransitionEffect` isn't in the 0.x promise's list, and its context has no way to start part way.
- **Out of date** (each fixed by a step below or by this plan):
  - M5's own first line listed "side-matched outline sampling", which M1 built.
  - §4.5's `morph({ points = 160 })` has no `align`.
  - architecture.md says "Planned: `morph()`", and that bars can't colour by category "until M5's morph".
  - The sketch declares `barChart`, `donutChart` and `lineChart` only until handles have `focus()`.

**Decided while planning M5 (October 2026):** decisions 1–8 are yours, and 9–14 follow from them and the code.

1. **Correspondence: both, picked in the demo** (open question 1). `morph()` matches two closed outlines side by side, with an `align` option for the two mappings:
   - **"unroll"** maps each side to the same side. A slice's walk becomes the column's walk, so the slice stands up: its outer arc becomes the column's side, and the angle it spans becomes the column's height.
   - **"drop"** turns the mapping by one side, as the lab does. The slice's outer arc becomes the column's top, so it settles onto the baseline.

   The demo shows both (step 4), and you choose the default in the browser; the other stays an option. **You kept "unroll"** (step 4, 23 October 2026).
2. **Labels tween, as the lab's do.** Each chart's handle reports its labels by key and role, with their text and where they sit (`labels()`). `chartSwitch` moves each label from its place in the old view to its place in the new one, and swaps its text half way ("28%" becomes "112"). A label with no partner fades.
3. **The demo is a new page,** `demo/morph.html`. `donut.html`, its 13 baselines and listening script D stay as they are.
4. **Reference charts only.** `chartSwitch` morphs between `barChart`, `donutChart` and `lineChart`, which step 2 lets hide their marks, report their labels and take focus by key. Its views are typed by what it uses, so adapters can join later (backlog).
5. **Transition effects are public.** `TransitionEffect` joins the 0.x promise's list in CHANGELOG, and `checkTransition(effect, { pairs })` joins `expressive-charts/testing`: the four checks `checkEffect` runs, on pairs of fixture marks. `morph()` is the first transition effect written against it.
6. **A switch back mid-way reverses from where the shapes are,** as the lab's card does. A transition run's context gets `start`, from 0 to 1, so a run can begin part way: `chartSwitch` plays the reverse pair from 1 minus the progress the first had reached.
7. **Unmatched marks fade.** A key in only one view fades out over the first half, or in over the second, where it stands, while the matched marks morph.
8. **`colorBy: "category"`** is a new `barChart` option. With one series, each bar takes its category's slot through `colors`, which can be shared with a donut, and the legend lists the categories, as the donut's does. The chart then never asks the assignment for its series' slot, so "shots" can't take a slot that a shared assignment would give an outcome. A stack still colours by series, and `colorBy: "category"` on a stack throws.
9. **Playing a transition.** A small player in core (`src/core/transition.ts`, internal, beside the runner, and built on its `runScope`) plays a `TransitionEffect` on pairs of marks, with the runner's rules:
   - Each pair gets a context of its own: `signal`, `motion`, `tween()`, a `layer` group, `icons` and `batch`, plus `start`.
   - The context's `mark` handle does nothing, since both views' marks are hidden while a transition plays, and `onChange` never fires: a resize mid-switch lands it (decision 11).
   - With motion off, `end()` runs on a fresh context instead of `run()`.
   - Clearing aborts, calls `clear()` and empties the group. An effect that throws is reported and cleared, and the switch carries on.
   - `TransitionEffect.run` and `end` take a `TransitionContext`, an `EffectContext` with `start`.
10. **`morph({ points = 160, align })`.**
    - `points` is a whole multiple of 4, or it throws a `RangeError`.
    - **Two closed outlines** (bars, slices, points): both are sampled at `points`, and each point moves in a straight line to its partner. They're drawn as one filled path in the mark's colour.
    - **Which point is whose partner.** `"unroll"` pairs point i with point i. `"drop"` turns the pairing by a quarter of the points, and it's fixed by the marks' geometry, never by which one comes first:
      - The turn goes from a mark that goes round its pivot to one that doesn't. A mark goes round its pivot when its `start`, `center` and `end` are the same distance from it, more than 0.5 px away: a slice does, a bar doesn't. This is the test the adapter's ring order uses, and it reads geometry, not a chart type.
      - The round mark's side along its walk (a slice's outer arc) meets the other's end side (a column's top), whichever is `from`. Swapping the operands inverts the turn, so a switch back retraces the same pairing instead of twisting.
      - Between two marks that both go round their pivots, or neither does, `"drop"` pairs as `"unroll"` does.
    - **A run that starts part way** starts from `start` in the shapes' progress, after easing, so a reverse run from `start: 1 - p` begins exactly where the forward run had drawn the shapes.
    - **Two open outlines** (lines): the strokes are sampled along their length and drawn stroked, their width moving from one thickness to the other.
    - **A closed and an open outline:** the first fades out as the second fades in.
    - **Timing.** 950 ms base, the lab's, with `transition` timing (≤ 200 ms in Analysis, a jump in Off) and `easeInOutCubic`. A run that starts part way takes the rest of the time.
    - **End state:** the target outline. `chartSwitch` then clears it and shows the real mark.
11. **`chartSwitch(target, { views, initial, transition, colors, announce })`** returns `{ show(view), current, chart(view), destroy() }`.
    - **Layout.** One container per view, stacked in one grid cell, and an overlay `<svg>` over them, `aria-hidden` and taking no pointer events. The overlay has the charts' `ec-chart` class, so tweened labels keep the stylesheet's text sizes. Each view's marks are mapped into the overlay from their own `<svg>`'s place in the cell, since each chart lays out in its own px.
    - **The inactive view** is `visibility: hidden`, `inert` and `aria-hidden`. It keeps its layout (a container with no width would lay its chart out at the 640 px fallback), so its geometry is ready for a morph, but it can't be seen, reached or read.
    - **A switch.**
      - The active chart's hover ends.
      - Both views' marks and mark labels are hidden.
      - The old view's other parts (axes, the centre total, the legend, the table) fade out by 40% of the way, and the new view's fade in from half way, as the lab's centre and baseline do.
      - Each pair morphs in the overlay, and each label tweens.
      - Then the overlay is cleared, the new view's marks show, and the old view goes inactive.
      - Focus on a mark of the old view moves to the same key in the new one, or to its first mark.
    - **Interrupting.** A `show()` back to the old view mid-switch reverses (decision 6); one to a third view lands the switch first. A resize mid-switch lands it. With motion off, `show()` resolves before it returns.
    - **Colours.** One `ColorAssignment` for every view (`colors`, or a new one), so a key keeps its colour. Each pair's run draws in that key's slot.
    - **`announce`** is off by default, as on the charts. When it's on, a polite live region says the new view's label after a switch.
    - **The default transition.** `transition` is filled in with `morph()` by the composition root when it's left out, since charts never import effects.
12. **What chart handles gain.**
    - `focus(key)`, as the adapter's: it moves focus to a mark as a key press would.
    - `labels()`: each mark's labels by key and role (category or value), with their text, where they sit in the chart's `<svg>`, and their element. `chartSwitch` clones each element into its overlay, so a moving label keeps the chart's styling.
    - The shared stylesheet hides each chart's marks and mark labels while its `<svg>` has the class `ec-morphing` (bars' and slices' marks, lines and points), so no chart needs a method for it.
    - The sketch stops declaring `barChart`, `donutChart` and `lineChart`, which were declared only until handles had `focus()`.
13. **Accessibility of a switch.** One view is in the accessibility tree at a time, each with its own table. The page's button names the other view ("Show as columns"). The demo turns `announce` on. You run a short listening script (section F) with NVDA + Chrome.
14. **A smooth reverse** needs `start` on the context only, and `morph()` honours it; a transition effect that ignores `start` just replays from its beginning. `checkTransition` checks that a run from `start: 0.5` ends as `end()` draws, and that it **retraces**: on each pair, the picture a run from `b` to `a` draws at its start, from `start: 1 - p`, is the one a run from `a` to `b` draws at progress `p`. So a pairing that depends on operand order fails it.

Each step names the files it owns, so steps in the same wave can run in parallel sessions. Files shared by several steps get small edits only, and whichever step lands second merges main first: `src/index.ts`, `src/core/index.ts`, `src/effects/index.ts`, `src/charts/index.ts`, `src/charts/types.ts`, `src/charts/render/theme.ts`, `src/registries.ts`, the two conformance test files, `docs/architecture.md`, `README.md`, `CHANGELOG.md`, `docs/effects-guide.md`, `docs/sketches/api.ts` and this plan.

**Wave 1** (parallel):

1. ✅ **Transition effects: the player, `morph()` and `checkTransition`.** Owns `src/core/transition.ts` (new) and its tests, `TransitionEffect` and `TransitionContext` in `src/core/contracts/effect.ts`, `src/effects/morph.ts` and its tests, `checkTransition` in `src/testing/check.ts` with the fixture pairs in `src/testing/fixtures.ts`, and the transition entries in `src/effects/conformance.test.ts`.
   - As decisions 5, 6, 9, 10 and 14, tested on the manual clock with the recording layer:
     - `morph()` between every fixture pair, both ways, with each `align`, ends as `end()` draws;
     - `"drop"` pairs a slice's outer arc with a column's top whichever is `from`, and a run back from `start: 1 - p` begins where the run forward was at `p`, with no jump or twist;
     - a closed and an open outline crossfade;
     - a run from `start` takes the rest of the time and ends where a full run does;
     - with motion off, nothing waits for a frame;
     - an abort leaves nothing behind.
   - `checkTransition(effect, { pairs, name })` runs the four checks on each pair, a run from `start: 0.5`, and the retrace check (decision 14). Its default pairs are fixture marks: a slice and a column, a bar and a column, two slices, two lines and two points.
   - Docs: a `morph` section and the transition contract in architecture.md's Effects, README, the guide (transition effects and `checkTransition`), and CHANGELOG (`TransitionEffect` in the promise's list, `checkTransition`). Replace the sketch's `morph` declaration.
   - **Built** (22 October 2026) as decisions 1, 5, 6, 9, 10 and 14 describe ([architecture.md](architecture.md#transition-effects)): `playTransition` in `src/core/transition.ts` (17 tests), `morph()` (21 tests), `checkTransition` with `fixturePairs` (8 tests), and `morph` with each `align`, and with 8 points, through `checkTransition` in the effects conformance file. 1415 tests in all after merging step 2 (50 new); no visual baseline changed (no demo, chart or stylesheet was touched). Decisions beyond the plan:
     - **The player's API.** `playTransition(pairs, { effect, surface, start, motion, clock, icons })` returns `{ finished, clear() }`. `pairs` are `{ from, to }`; the surface is a `TransitionSurface`, `group(key, order)`, asked for on a run's first draw with `to.key` (so `"mark"` resolves to that key's colour) and stacked by the pair's index. `finished` resolves once every run has finished or been cleared, and never rejects. Like the runner, it follows the motion mode while runs are going: turning Off mid-run replaces them with `end()` on fresh contexts, in their group order. It throws a `TypeError` for an effect that isn't a transition (`isTransitionEffect`, exported internally for `chartSwitch`'s option check) and a `RangeError` for a `start` outside 0–1.
     - **`clear(ctx)`** takes a `TransitionContext` too, like `run` and `end`.
     - **Morph's draws.** At progress 0 and 1 it draws the marks' own `outline.d`, so the hand-over to and from the real marks is exact (arcs and rounded tips included); in between, the polygon through the samples. A crossfade's end state has no opacity, and the area is always below the stroke, so the picture doesn't depend on which mark is `from`.
     - **Exact retracing.** "drop"'s polygon starts at the round mark's first sample whichever is `from`, and every coordinate is `x·(1 − p) + y·p`, weighted on both sides. The first version used `x + (y − x)·p`, and the retrace check found the bar and column differing at 0.001: with integer corners, p = 0.25 lands on halves (36.5625), which rounded one way forward and the other back.
     - **"Takes the rest of the time"** is the share of the *scaled* duration, as `playback()` does, so a run from part way keeps a full run's speed in Analysis too: morph plays one 950 ms tween with a linear ease from the time where `easeInOutCubic` reaches `start`, and finishes it early when a full run would end. Half a switch takes 475 ms in Presentation and 100 ms in Analysis (a base-share rule would give 166 there). The first frame draws at `start` exactly, rather than at the eased inverse, so a reverse begins on the forward picture to the last digit.
     - **The ring test is morph's own copy** of the adapter's (`goesRound` in `src/charts/adapter/expressive.ts`): effects can't import from charts, and the adapter isn't this step's file. Moving it into `src/core/geometry` for both is a small follow-up.
     - **`points`** must also be at least 4. A context without a number for `start` (`testContext()` alone) plays from 0, and one above 1 draws the end at once.
     - **`checkTransition`.** Retracing is checked at p = 0.25, 0.5 and 0.75 on each pair, comparing the picture each run draws before its first frame: a checker can't know an effect's easing, so "the picture a run from a to b draws at p" is the one it begins with from `start: p`, which `morph`'s own tests check against a full run's frames. `pairs` takes named pairs or a list, like `marks`; a long path's difference is shown where the two part. `checkEffect` on a transition (and `checkTransition` on a mark effect) says which checker to use. `fixturePairs` is exported with `checkTransition`, as `fixtures` is with `checkEffect`, so `package.test.ts`'s export list gains both. `testContext` has no `start` option: a transition's test context is `{ ...testContext(), start }`.
     - **The default `align` is `"unroll"`**, provisional until step 4, and documented as such. Step 4 kept it: you picked "unroll" in the demo.
2. ✅ **Charts ready to switch.** Owns `colorBy` in `src/charts/bar.ts` and `BarChartOptions`; `focus()` and `labels()` on the handles in `src/charts/bar.ts`, `donut.ts` and `line.ts`, and on `Chart` in `src/charts/types.ts`; the shell's `focus` in `src/charts/shell/hover.ts`; and the `.ec-morphing` rules in `src/charts/render/theme.ts`.
   - As decisions 8 and 12.
   - **Done when** every existing test and visual baseline passes with none changed, and the new paths have tests of their own: category colours shared with a donut, a category legend, `colorBy` on a stack throwing, `focus(key)` on each chart, each chart's `labels()`, and `.ec-morphing` hiding marks and their labels and nothing else.
   - Docs: architecture.md (bar colours, the chart handle), README. The sketch stops declaring `barChart`, `donutChart` and `lineChart`.
   - **Built** (22 October 2026) as decisions 8 and 12 ([architecture.md](architecture.md#reference-charts)), with no change in behaviour for existing options: the 1346 existing tests pass with their expectations unchanged, beside 19 new ones, and the Docker visual suite passes with no baseline changed. Decisions beyond the plan:
     - **A bar's slot is its key's** (its category unless `key` is given), as a donut's slice's is, so the two views of a chart switch match colours by the key they match marks by, and `colors` pins slots by key. The chart never calls `colors.slot()` with a series' name then: not for the segments, and not for the legend, which lists the categories through `legend.categories()` in the bars' visual order, then the page's `entries`, one category listed too.
     - **Checks.** `colorBy` that isn't `"series"` or `"category"` throws a `TypeError`, and `"category"` with any `stack`, even of one field, throws one too, at creation (leaving nothing behind) and in `update()`, which rejects before anything changes. `update()` can switch between the two; every bar, leaving ones too, takes its new colour on the change's first frame, rather than bar by bar as each moves, and the legend changes as the update starts.
     - **`focus(key)`** is `chartHover.focus(key)`, which calls the keyboard's `focus(key)` for a live target only, so a key that is unknown or leaving does nothing; a handle does nothing after `destroy()`. On the line chart it takes the x's key or one of its points' (`"12"`, `"goals@12"`), since its marks are points but its focus stops are x's, and chartSwitch will read the focused key off the focused element, which on a line chart is the x's column. A line's key, and an x past the reveal, do nothing. So that a key means one thing, a row's key that is also a line's or a point's (a custom `key` giving `"goals@2"` beside a row `"2"`) throws a `RangeError` when the chart is drawn, and `update()` rejects it (after Codex's review on PR #50).
     - **`labels()`** returns `ChartLabel`s (`{ key, role, text, x, y, anchor, element }`, a type exported beside `Chart`), each mark's category before its value, in the marks' visual order, live marks only, as `marks()` does. `x` and `y` are the placement the chart drew from, unrounded, where the attributes are rounded to 0.001. Part way through a change they're as drawn, a bar's value counting. A label that's hidden, or has no text, is left out: a slice's dropped for room, a line's with `labels: false` or worded `""`. The donut's centre text is no slice's. Each chart keeps the placement it last drew each label at, and `shell/labels.ts` (new) builds the entries.
     - **`.ec-morphing` is one rule on the marks layer:** `:where(.ec-chart.ec-morphing .ec-marks) { visibility: hidden; }`. That's bars and slices with their labels, lines with their end dots and labels, and points, in every chart, leaving marks included. `visibility` rather than `opacity`: `.ec-mark` has an opacity transition (the dimming), and a hidden mark takes no pointer events. It's on the `<svg>` itself, not an ancestor.
     - **Where the plan and the code differ, for step 3.** Hiding "the marks and mark labels, nothing else" leaves some things showing that step 3 has to handle, with its own rules in `theme.ts` or by ending focus and effects. These are the focus ring (`.ec-focus`, and the donut's masked ring inside `.ec-overlay`), the effects' overlay (`.ec-overlay`, with the donut's halos and any `decorate` run), and the line chart's x's (`.ec-columns`, its pointer targets and focus stops). Also, a browser can drop focus from an element that turns `visibility: hidden`, so chartSwitch should read the focused key (the focused element's `data-key`) before it adds the class.
     - **The sketch** no longer declares `barChart`, `donutChart` and `lineChart`, and drops its `Chart`, `BarChartOptions` and `LineChart` re-declarations, which only added `focus()`. `MarkSourceHandle` stays for the `chartSwitch` declaration, which step 3 replaces. Example 03 doesn't pass `colorBy` yet: step 3 rewrites it on the real API.

**Wave 2** (after wave 1 lands):

3. ✅ **`chartSwitch`.** Owns `src/charts/switch.ts` and its tests, its rules in `theme.ts`, its exports, and `src/morph.test.ts` (new, beside `src/index.ts`, since it brings a chart switch and `morph()` together).
   - As decisions 4, 6, 7, 11 and 13. jsdom tests on a donut and columns:
     - switching both ways, marks matched by key;
     - an unmatched key fading;
     - a switch back mid-way reversing from the progress it reached;
     - focus following its key;
     - the inactive view inert and hidden from screen readers;
     - `announce`;
     - Off landing at once, and a resize landing a switch;
     - `destroy()` putting everything back.
   - `src/morph.test.ts` switches a real `donutChart` and `barChart` with the real `morph()`, both ways and with each `align`, and checks the halfway shapes and labels.
   - Docs: a Switching between charts section in architecture.md (the plan's §5.7 is its sketch), README. Replace the sketch's `chartSwitch` declaration; example 03 uses the real API, with `colorBy`.
   - **Built** (23 October 2026) as decisions 2, 4, 6, 7, 11 and 13 describe ([architecture.md](architecture.md#switching-between-charts)): `chartSwitch` in `src/charts/switch.ts` (32 tests on a donut and category columns with a recording transition), the composition root's `chartSwitch` filling in `morph()`, and `src/morph.test.ts` (5 tests: the real charts and `morph()`, both ways with each `align`, the halfway shapes and labels, "drop" putting each slice's outer arc on its column's top, a reverse with no jump, and the default transition). 1452 tests in all; the Docker visual suite passes with no baseline changed; a Chromium check put the overlay's first frame exactly on the slices on screen. Decisions beyond the plan:
     - **Each view's function is given the switch's colours,** `(container, colors) => chart`, so a switch that makes its own assignment ("or a new one") still shares it with every view. `colors` also takes pinned slots, as a chart's does.
     - **Types.** `ChartSwitch<T>` is typed by the views record, so `chart(view)` returns that view's chart as its function returns it, for `update()`. The views' type is what the switch uses, `ChartSwitchView`: `element`, `marks()`, `labels()`, `focus(key)` and `destroy()`. Also exported: `ChartSwitchOptions`, `ChartSwitchViewFactory`, `ChartSwitchViews` and `ChartSwitchViewName`. `initial` is required, as in the sketch, and `current` is the view shown or the one a switch is heading for.
     - **One progress.** The labels, the unmatched marks and the views' opacity are drawn from s, where the switch is between the view it began in (0) and the one it went to (1), as the lab draws its card from one `t`. So a reverse goes back the way it came with no jump, but its fades are the forward ones played backwards (the columns' parts out over the first half back, the donut's in over the last 40%), not those of a fresh switch the other way.
     - **Timing.** The switch drives a tween of its own with morph's timing (950 ms base, linear from where `easeInOutCubic` reaches `start`, finished early), started with the pairs' runs on the same clock, so its eased progress is the one morph draws the shapes at, and a reverse begins from `1 − p` of it. It lands once both its tween and the player's runs have finished, so a transition slower than 950 ms isn't cut short. A transition effect can't report how far its shapes have got, so that schedule is the switch's, and an effect keeps in step with the labels and reverses smoothly only by keeping to it, as morph does. The `transition` option's docs, architecture.md and the effects guide say so; one with other timing (the guide's 600 ms `slide`) still plays, but its shapes drift from the labels and a switch back can jump (after Codex's review on PR #52). `unease` is copied from `morph.ts` (effects and charts can't share it): a follow-up could move it into core with the ring test. A reverse before the first frame (p = 0) lands at once. In a run back, the progress adds up to a hair under 1 at the exact time, so the landing comes on the frame after, as morph's own end does.
     - **Both views are inert during a switch,** not only the inactive one, so nothing in either can take focus or the pointer until it lands. The new view keeps `aria-hidden` until then, so neither view is in the accessibility tree for that second, and the announcement comes after the landing.
     - **Ending the hover.** A chart handle has no method to end its hover, so the switch does what the viewer would: it blurs focus that's in the old view and sends its `<svg>` a `pointerleave`. A handle method could replace that later.
     - **`ec-switching`** on each view's container hides what `ec-morphing` leaves showing (step 2's list): the focus ring (`.ec-focus`), the effects' overlay (`.ec-overlay`, the donut's ring included) and a line chart's x's (`.ec-columns`). `ec-morphing`'s own rule is unchanged, so it still hides the marks and nothing else.
     - **Focus.** Focus anywhere in the old view counts (on a mark, its key; elsewhere, none), read before anything is hidden. At the landing it goes to that key in the new view, or else to the first of the new view's marks that takes focus (a line chart's first mark is a line, which `focus()` ignores). Focus that has moved on outside the switch stays. When a third view interrupts, the remembered focus goes on to the next switch instead of landing on the middle view first.
     - **Overlay coordinates** come from the screen CTMs of each view's `<svg>` and the overlay (the adapter's `between()`); in jsdom they're the identity. A mark's path data moves through the transform with the icons' `parsePath`, `transformPath` and `formatPath`, a first import from charts into `src/icons` (a follow-up could move them into `src/core/geometry`). A copied label isn't scaled with a scaled `<svg>`: it keeps the stylesheet's size, as decision 11 says.
     - **Drawing.** Pairs are in the new view's order and keep it in a reverse, so the stacking doesn't flip. Unmatched marks are drawn as their outline (filled, or stroked at their thickness) in their key's slot, below the pairs; labels are above both. A matched label is two copies of the `<text>`s (classes kept; `id`, `opacity`, `visibility` and `aria-hidden` dropped) at one moving anchor point, mixed on both sides as morph mixes; the anchor (`text-anchor`) swaps with the text.
     - **Interruptions.** The cell's width is watched with a `ResizeObserver` (its first observation is the width to compare with; half a px or more lands a switch). Motion turning off lands a switch at once, rather than on the next frame, and with motion off `show()` doesn't play the transition at all. `show()` for the view a switch is heading for returns its promise; for the view shown it does nothing; for an unknown view it rejects with a `TypeError` (`chart()` throws one). A replaced `show()`'s promise resolves.
     - **Layout and `announce`.** The switch adds one `<div class="ec-switch">` to `target` (removed by `destroy()`), with `grid-template-columns: minmax(0, 1fr)`; the cell is as tall as the tallest view. The live region is a chart's (`chartAnnouncer`), after the overlay, made with the switch.
     - **Where the plan and the code differ.** Decision 4 lets a line chart be a view, but its points don't fit a switch yet: they're marks that aren't drawn at rest (their dots show on hover), which the switch draws, and they're keyed `"goals@12"` but coloured by series, so the switch would draw them in their own keys' slots and hand those slots out of a shared assignment. Fixing that needs a chart to say which marks a switch should draw, or each mark's colour: a follow-up. Decision 11's fades put both views' legends and tables at 0 between 40% and 50% of the way, so identical legends (the donut's and the category columns') blink: step 4 judges it in the browser.

**Wave 3:**

4. ✅ **`demo/morph.html`, its screenshots and the listening script.** Owns `demo/morph.html` and `demo/morph.ts`, the link in `demo/index.html`, `tests/visual/morph.spec.ts` with its `morph-` baselines, section F of `docs/a11y-check.md`, and, once you've chosen it, the default `align` in `src/effects/morph.ts`.
   - **The page**, as decision 3, with the lab's card 3:
     - the lab's shot outcomes (Goal 58, Saved 112, Off target 149, Blocked 87) as a donut and as columns (`colorBy: "category"`);
     - a toggle button ("Show as columns", "Show as donut"), and a control for the two `align` mappings, so they can be compared;
     - the legend, the table, the motion switch, and a checklist that is the "Done when" list below.
   - **Screenshots,** all `morph-`:
     - light and dark in each view;
     - half way, with each `align`;
     - the focus ring after a switch.

     Reduced motion and Analysis are checked in the DOM, and a switch back mid-way is checked to reverse. The page fits 1000 × 2000, and the baselines are made in Docker.
   - A listening script, section F. **You run it** with NVDA + Chrome.
   - Then check the "Done when" list in the browser with you. You pick the default `align` there.
   - **Built** (23 October 2026) as decisions 1, 3 and 13 describe: `demo/morph.html` and `demo/morph.ts`, `tests/visual/morph.spec.ts` with seven `morph-` baselines, and section F of [a11y-check.md](a11y-check.md#f-the-morph-page-a-chart-switch). The Docker visual suite passes, 63 tests, with no other baseline changed, and there are 1453 unit tests (one new: `morph()` with no `align` matches as `"unroll"`). You walked the checklist in the browser and kept `"unroll"`, so `morph.ts` keeps its default and only the docs that called it provisional changed (its own, README, architecture.md and CHANGELOG). Your screen-reader check, section F with NVDA + Chrome, passed afterwards (23 October 2026). Decisions beyond the plan:
     - **The page.** One `chartSwitch` with `announce: true`: the donut ("Shot outcomes, share of total") and category columns ("Shot outcomes, counts"), each given the switch's colours. The switch makes its own assignment, which gives the outcomes slots 1 to 4 in data order, as `donut.html` pins them. The toggle's name is set from `current` right after `show()`. The Morph control (Drop, Unroll) destroys the switch and builds it again with `initial: current`, so a pick mid-switch lands where it was heading, and focus stays on the control.
     - **V on a focused slice or column switches.** The plan has only the button, but a click moves focus to it, and focus that has left the switch stays put, so without a key on the marks focus could never follow its key on the page. V reaches the page in NVDA's focus mode. Raised with you in the walk, and kept.
     - **Screenshots,** all through `openDemo(page, morphDemo)` (the page fits 1000 × 2000): the whole page in the donut view and the switch's card in the columns view, light and dark; `#shots` 475 ms after `show()` with each mapping; and the card after V on Saved, with the ring and the tooltip on its column. Frames fall every 16 ms of fake time, so "475 ms" draws the 472 ms frame, just short of half way: the labels still show the shares, and neither view's legend, centre or axes shows. The test checks that, and that one frame later the labels show the counts.
     - **Only the view shown can be read** is checked in Chrome's own accessibility tree (`Accessibility.getFullAXTree` over CDP). Playwright's `getByRole` doesn't model `inert`, so it still found the old view mid-switch, where Chrome's tree has neither view.
     - **At real frame rates** (headless Chromium, since the browser pane was hidden): a switch took 960 ms in Presentation at a steady 60 fps, 211 ms in Analysis and none in Off; a switch back at 380 ms landed 380 ms later; V moved focus to the same outcome both ways, with the announcement; dark mode looked right.
     - **The blink.** Between 40% and 50% of the way, neither view's legend, centre, axes or table shows, from decision 11's fade timings. Raised with you in the walk, and left as built.
     - **Where the plan and the code differ.**
       - At real speed, a switch back can jump by up to about 0.17 px, where decision 14 asks for none. The switch's own tween is made after the pairs' runs have sampled their outlines and drawn their first picture, so on the live `performance.now()` clock it starts about 0.2 ms later, and the progress a reverse starts from lags the shapes by that much. The labels follow that progress, so they don't jump. On the visual suite's stopped clock the reverse is exact. The fix belongs in `switch.ts`: a follow-up.
       - Decision 4's line charts can't be switch views yet (step 3's finding): a follow-up.
   - **Follow-ups from M5** (none blocks it):
     - Line charts as chart-switch views (decision 4). A chart needs to say which marks a switch draws (a line's points aren't drawn at rest), or each mark's colour (points are keyed `"goals@12"` but coloured by series).
     - One start time for the switch's tween and the pairs' runs, so a reverse at real speed starts exactly where the shapes are.
     - A chart handle method to end its hover, replacing the switch's blur and synthetic `pointerleave` (step 3).
     - Move `unease` (switch.ts, morph.ts) and `goesRound` (morph.ts, the adapter) into core, and the path transforms from `src/icons/path.ts` into `src/core/geometry` (steps 1 and 3).
     - Let a transition effect report its progress, so a switch can keep a transition with other timing in step (step 3, after Codex's review on PR #52).

**Done when:**
- `demo/morph.html` reproduces the lab's card 3 on the library:
  - the shot outcomes as a donut and as columns, each outcome in the same colour in both;
  - a toggle that morphs every slice into its column and back, the labels moving with their shapes and swapping their text half way;
  - the centre total fading out and the axes fading in;
  - a legend, a table and the motion switch;
  - light and dark from the library's defaults.
- **Timing.** A switch takes about 950 ms in Presentation, 200 ms in Analysis, and none in Off or under reduced motion, and a switch back mid-way reverses from where the shapes are.
- **`morph()`** passes `checkTransition` on every fixture pair, both ways and with each `align`. `checkTransition` is exported from `expressive-charts/testing`, and CHANGELOG lists `TransitionEffect` in the 0.x promise.
- **Focus and the screen reader.** Keyboard focus follows its key across a switch, and only the active view can be reached or read.
- **Charts.** `barChart` takes `colorBy: "category"`, and every chart handle has `focus(key)` and `labels()`. No existing baseline has changed.
- **Your choices.** You've picked the default `align` in the browser, and your morph screen-reader check passes.
- **Packaging.** The package still has no runtime dependencies, and `typecheck`, `test` and `build` are green.

### M6: Hardening and 0.1.0 ✅

Hardening the library for its first release, then publishing it: a stress demo that sets the SVG limits, dates on `lineChart`'s x, a bundle-size check in CI, an accessibility audit, the API reference, the follow-ups from M4 and M5 that belong before 0.1.0, packaging, and last, 0.1.0 on npm.

**Demo:** `demo/stress.html`, the stress page: each case at sizes up to past its limit, with a frame readout, and a year of daily values on a date axis.

**Where M6 starts** (checked against main at 9f5f752 while planning, 23 October 2026):

- **Already built.**
  - **Packaging.** Three JS entries (`.`, `./icons/sport`, `./testing`), each ES module and CommonJS with types, plus `./style.css` and the script-tag bundle. `package.test.ts` checks that every JS entry is free of side effects and that there are no runtime dependencies; `index.node.test.ts` imports the package in Node with no DOM.
  - **Tree-shaking works.** Measured on main's build with Vite 8, minified, a page pays only for what it imports:

    | A page that imports | min | gzip |
    | --- | --- | --- |
    | `motion`, `animated` | 5.4 KB | 2.1 KB |
    | `describe`, `matrix` | 10.2 KB | 3.8 KB |
    | `expressive`, `travel` | 90.2 KB | 27.3 KB |
    | `barChart` | 102.7 KB | 30.9 KB |
    | `lineChart`, `threshold`, `playback`, `playButton` | 119.7 KB | 35.8 KB |
    | `chartSwitch` with `donutChart` and `barChart` | 145.1 KB | 41.9 KB |
    | everything | 247.6 KB | 70.5 KB |

    *Step 2 found this table 11–19% too big in gzip, since the planning script left whitespace in (step 2's Built list). [architecture.md](architecture.md#bundle-size) has the size check's numbers.*

    The script-tag bundle is 198 KB minified (70.2 KB gzip), the stylesheet 9.9 KB (2.3 KB), the sport pack 2.8 KB (1.2 KB) and the testing entry 21.8 KB (6.2 KB). `npm pack` makes a 1.19 MB tarball, 4.5 MB unpacked, of which 2.9 MB is source maps.
  - **The name.** `expressive-charts` is free on npm, and so are `expressivecharts`, `expressive.charts` and `expressive_charts`, which npm's look-alike rule would also block.
  - **The 0.x promise.** Every name in CHANGELOG's lists is exported, and no `@experimental` marker is left in `src/` or the sketch.
  - **Dates, partly.** `Sample.at` already takes a `Date`, and `threshold` matches by `at` when both series have numbers or `Date`s there. The visual suite pins `en-US` and UTC.
  - **`watch`** was measured in M4 step 6 (open question 13), with a page in that session's scratchpad, not in the repository.
  - **Accessibility record.** Sections A, D, E (steps 1–12) and F passed with NVDA + Chrome. VoiceOver + Safari has heard only the "1 goal" wording (section B, in part). Section C hasn't been run with either.
  - **The sketch** declares only `describe.shape`; everything else in it is the real API.
- **Assumed by the plan but not built.**
  - The stress demo and a script that measures it.
  - Dates on x: `x` is numeric only, and `format` takes numbers only.
  - The size check, a release workflow and the API reference.
  - `update({ on })` (open question 14): each chart throws "`on` can't be changed by update() yet".
  - A header for a donut's value column (open question 17).
  - M5's follow-ups (step 4's list).
- **Gaps.**
  - **The repository is private.** npm makes no provenance for a private repository, even for a public package, and README's links into `docs/` would be dead for npm's readers.
  - **The first publish.** npm's trusted publishing (OIDC, no token) can only be set up for a package that already exists, so 0.1.0 itself goes out with a token or from your terminal.
  - **Types for `require`.** Each entry's `require` condition points at `index.d.ts`, though the build writes `index.d.cts`. The package is `"type": "module"`, so a CommonJS project under `node16` resolution would be given ES module types.
  - **`VERSION`** in `src/index.ts` is a hand-written `"0.0.0"`, and its test only checks its shape, so it can drift from `package.json`.
  - **The package leaves out CHANGELOG.md**, where the promise is.
  - **The promise's list** names the contracts but not the types they use (`Point`, `Rect`, `Icon`, `MotionView`, `Tween`, `TweenOptions`, `Timing`, `Easing`, the `describe` specs, the testing entry's option and recording types). The motion core (`motion`, `createMotion`, the clocks, `tween`, `animated`, `playback`) is in neither of its lists.
  - **Observable Plot** is in README's first line and in CLAUDE.md, but only the adapter spike tried it (Plot 0.6.17, on a page that wasn't committed). No test uses real Plot.
  - **Browsers.** Every test runs in Chromium or jsdom, and README names no browsers.
  - **Forced colours** (Windows contrast themes): only the legend's swatches opt out. Nothing else has been checked.
  - **TypeScript.** 7.0.2 is npm's `latest`; the repository builds with 5.9.3 (`^5.6.3`). The published types use `NoInfer`, so they need TypeScript 5.4 or newer, which nothing says.
- **Out of date** (each fixed by a step below or by this plan):
  - Open question 7's recommendation ("after M1") and question 11.
  - architecture.md's "Dates on x come in M6" and the sketch's comment on x.
  - "The donut comes *before* the line on purpose", which sits under M6 but is about M3 and M4: it moves to §9's opening.
  - CHANGELOG's "Nothing is published yet" and README's status (step 9).
  - `src/charts/README.md` has no rows for `donut.ts`, `donut-layout.ts` or `controls/` (M4 step 5's note).
  - README's "all type-checked against the proposed API": the sketch is the real API now.
  - **M4 isn't marked ✅:** a look at the Vega-Lite card on `demo/line.html` (step 6's walk), and section E's steps 13 and 14 (step 7).

**What's carried into M6, and where it goes:**

| Item | Goes to |
| --- | --- |
| Q6, more subpath exports | Decision 6: none, with the numbers above |
| Q7, TypeScript 7 | Decision 8: after 0.1.0 |
| Q10, `path` and `angle` | Decision 8: kept, settled before 0.1.0 since `MarkGeometry` is in the promise |
| Q11, releasing | Decision 4, step 9 |
| Q13, `watch`'s default | Step 6 |
| Q14, `update({ on })` | Decision 3, step 4 |
| Q17, the donut's value header | Decision 3, step 4 |
| Q15, donut labels at narrow widths; Q16, a Vitest flavour of `checkEffect` | Stay open: no page and no author needs them yet |
| §10's SVG performance risk, and "Runs on every point" | Step 6 |
| M4's two leftovers | Step 6's walk (the Vega-Lite card), step 7 (E 13–14) |
| The accessibility record | Decision 2, step 7 |
| M5: line charts as switch views | Backlog (decision 3) |
| M5: one start time, a handle method to end hover, helpers into core | Decision 3, step 4 |
| M5: a transition effect reporting its progress | Backlog: an addition to the author API, which can come in any 0.x release |
| M4 step 7's notes: decorations draw above the points; slot 2's orange is close to `--ec-negative` | Backlog: the first changes baselines, the second the palette |
| M5 step 2's note: a new `colors` in `update()` recolours bars only as each is next drawn | Backlog |
| `describe.shape`, and the adapter reading circles | Backlog: additions |
| The promise matches the API | Decision 8, step 3 |

**Decided while planning M6 (23 October 2026):** decisions 1–8 are yours, and 9–16 follow from them and the code.

1. **Dates are in UTC by default, with local time as an option** (M4 decision 3). Ticks fall on day, month and year boundaries in UTC, and the names, the tooltip and the table say the dates in UTC, as Observable Plot does. So a date-only value such as `new Date("2026-01-05")`, which JavaScript reads as UTC midnight, is labelled 5 January on every machine, and screenshots match everywhere. `timeZone: "local"` follows the viewer's clock. Other zones by name (`"Europe/London"`) go to the backlog.
2. **The audit: NVDA, plus a written WCAG pass.** You run what NVDA hasn't heard yet: section C, section E's steps 13 and 14, and the stress page's script G (step 6). The sessions write a WCAG 2.2 AA pass of every page, with `axe-core` as a pinned dev dependency in the visual suite, and manual checks for what it can't see (decision 12). VoiceOver + Safari is recorded as not run for 0.1, and goes to the backlog.
3. **M6 builds three of the carried items:**
   - **`update({ on })`** (Q14, "by M6 at the latest"): a page changes a chart's effects without recreating it, so `donut.html`'s picker keeps focus and doesn't replay the enter effects.
   - **M5's switch fixes:** one start time for the switch's tween and the pairs' runs (the 0.17 px jump), a handle method that ends a chart's hover (replacing the blur and synthetic `pointerleave`), and `unease`, `goesRound` and the path transforms moved into `src/core`.
   - **Table headers per series** (`table.series: { shots: "Shots" }`), defaulting to `seriesLabels`. That names the donut's value column (Q17), and would let the line page head its columns "Goals" and "xG", as the lab does.

   Line charts as switch views (the gap against M5 decision 4) go to the backlog: no page needs them, and they're an addition.
4. **0.1.0 is published from CI with provenance, from a public repository** (Q11).
   - You make the repository public before step 9.
   - A release workflow publishes 0.1.0 with `--provenance`, using a granular token with a short expiry that you add as a secret.
   - Once 0.1.0 is out, you delete the token. You set up trusted publishing on npmjs.com just before the next release, with direct `npm publish` allowed, so later releases need no token. *Changed after step 3:* a new trusted publisher expires unless a publish uses it within 2 days, and one made since 3 September 2026 allows only `npm stage publish` unless direct publishing is ticked, so it can't be set up straight after 0.1.0 and left waiting ([CONTRIBUTING.md](../CONTRIBUTING.md#releasing)).
5. **The API reference: README plus `docs/api.md`.** README becomes npm's landing page: install, a quick start, the entries, browser and TypeScript support, the limits, and links. `docs/api.md` documents every export of every entry, and a test fails when an export is missing from it.
6. **No more subpath exports for 0.1.0** (Q6). Bundlers already keep only what a page imports (the table above), so `/core` or `/effects` wouldn't make any page smaller. The size check measures those import sets, so a change that breaks tree-shaking fails CI.
7. **Observable Plot becomes a pinned dev dependency, with tests,** as D3 and Vega are: a stacked Plot bar and a Plot line rendered in jsdom, through `expressive()`, with `checkEffect` on their marks.
8. **Settled before the API is frozen:**
   - **`path` and `angle` keep their names** (Q10). After 0.1.0, renaming them would need a minor release and a migration note.
   - **TypeScript stays on 5.9 for 0.1.0** (Q7), pinned exactly. TypeScript 7 goes to the backlog as its own PR, since tsup's declaration build uses the TypeScript JS API. README says the types need TypeScript 5.4 or newer, for `NoInfer`.
   - **The promise names every type its contracts use,** and says that the motion core is outside it, with the charts, adapters, built-in effects and controls (decision 14).
   - **Firefox and WebKit too:** the visual suite's DOM checks run in both, without screenshots, so README can name the browsers it supports.
9. **Dates on x** (decision 1).
   - **What makes a time axis.** An `x` that gives `Date`s. Every row's x must be the same kind: numbers and dates together throw a `TypeError`, and so does an invalid date. Numbers stay a number axis.
   - **Keys.** A date's default key is its `toISOString()`, so `goals@2026-01-05T00:00:00.000Z` is a point's. x values must still be unique, by time.
   - **`timeZone`** is `"UTC"` (the default, decision 1) or `"local"`. It's named as `Intl`'s option is, so IANA names can join it later without a rename.
   - **Ticks.** Like the number axis: both ends labelled, and round steps of about a quarter of the range between them that don't come within 8 px of a neighbour. The steps are 1, 5, 15 and 30 seconds and minutes; 1, 3, 6 and 12 hours; 1 and 2 days; a week; 1 and 3 months; then years, in the number axis's nice steps. A tick falls on its boundary in the chart's zone (a day at midnight, a month on its first). Each is worded for its own level, in the page's locale through `Intl.DateTimeFormat`: the year on a year, the month on a month ("Feb"), the day on a day ("Feb 8", or "8 Feb" in `en-GB`), the time within a day.
   - **Wording for people.** The names, the tooltip's title, the table's row headers and the announcements all say an x one way: a medium date ("Jan 5, 2026"), with the time when any x has one. `xFormat(x)` words it instead, as `format` words values. `markLabel`'s summary has it as `category`.
   - **`reveal(x)`** takes a `Date` or its time in ms, since `playback()` plays numbers: `playback({ from: +first, to: +last, … })`.
   - **No dependency.** Ticks are built with `Date`'s own UTC or local setters, which handle daylight saving, and worded with `Intl`.
   - **Only the line chart.** A bar chart's category stays text, so columns over time are labelled by the page.
10. **The size check.** `scripts/size.mjs`, Node built-ins plus Vite's build API (already a dev dependency).
    - It measures raw, gzip and brotli for each published JS file and the stylesheet, and min + gzip for the import sets in the table above.
    - Budgets are in `scripts/size-budget.json`, at today's sizes plus about 10%, rounded up to 0.5 KB. Over a budget, it fails. A PR that raises a budget says why.
    - It runs in CI's check job on Node 24, after the build, prints a table, and writes it to the job summary.
11. **The stress demo.**
    - **Cases,** each a card, with a picker for its size. Each chart keeps its defaults (table, legend, names), since that's what pages get.
      - Bars that update: a `barChart` of 100 to 5,000 bars, every value changing in one staged update, with and without `flash` on each.
      - Hover on a large chart: the hover feedback and the dimming of every other bar, on 100 to 5,000 bars.
      - A line on dates, playing: a year to ten years of daily values in one to four series, with `threshold` and a riding icon in `on.decorate`, played through `playback()`. It counts the runs that start and the runs that draw ("Runs on every point").
      - Host bars with `watch`: 20 to 2,000 D3 bars in a hand-written transition, with and without `watch` (Q13).
      - A switch with many pairs: `chartSwitch` between 20 to 1,000 horizontal bars and columns, through `morph()`.
      - The first draw of 1,000 to 10,000 static bars.
    - **Nothing plays by itself.** Each case has a start button, and whatever plays has a pause (WCAG 2.2.2).
    - **A frame readout** as text: the last run's frames, its 95th-percentile frame interval, its longest frame and its long tasks.
    - **Smooth** means a 95th-percentile frame interval of at most 20 ms and no frame over 50 ms. Hover feedback must start within 100 ms.
    - **Measuring.** `scripts/bench.mjs` (committed, not in CI, since timings are noisy) drives headless Chromium through Playwright against `npm run dev`, on the real clock: every case at every size, unthrottled ("a laptop") and with CDP's 4× CPU slowdown ("a mid-range phone", Lighthouse's mobile setting). Five repetitions on fresh pages, the median reported, with ms of main-thread work per frame as in M4 step 6. It also creates and destroys each chart 50 times, and checks that DOM nodes and event listeners come back to where they started. A real phone over the network (`npm run dev -- --host`) is optional in the walk.
    - **The limits** are the largest size of each case that's smooth, at 1× and at 4×. They replace §10's rough guide, and go in README and architecture.md with the machine they came from.
    - **Fixes.** M6 documents the limits. A hot spot with a contained fix (one place, no API change, no baseline change) gets its own commit in step 6, with its numbers before and after. Anything bigger goes to the backlog with its numbers.
12. **The audit's method** (decision 2). `docs/a11y-audit.md`, one table per page, a row per WCAG 2.2 AA criterion that applies, each pass, fail or not applicable, with its evidence: a test, a tool's result, or your screen-reader run. It covers at least:
    - names, roles and values (4.1.2), info and relationships (1.3.1), status messages (4.1.3);
    - use of colour (1.4.1: the threshold's red is in the legend, and the Difference column says it), contrast of text and of marks and the focus ring (1.4.3, 1.4.11);
    - reflow at 320 px and zoom to 400% (1.4.10), text spacing (1.4.12);
    - content on hover or focus (1.4.13): whether the tooltip can be dismissed, hovered and kept;
    - keyboard, focus order and visible focus (2.1.1, 2.1.2, 2.4.3, 2.4.7), focus not hidden by the tooltip (2.4.11), target size (2.5.8);
    - pause, stop, hide (2.2.2) and reduced motion;
    - forced colours, which WCAG doesn't require but Windows users rely on.

    A small fix goes in step 7, each in its own commit; a baseline it changes is shown to you. Anything bigger goes to the backlog with what was found.
13. **Packaging.**
    - Each entry's `require` condition gets its own types (`.d.cts`), and `import` keeps `.d.ts`.
    - `files` adds CHANGELOG.md. Source maps stay: they're most of the unpacked size, but bundlers and debuggers use them, and the tarball is 1.2 MB.
    - `homepage` and `bugs`, and `publishConfig` with `access: "public"` and `provenance: true` (decision 4).
    - A test checks that `VERSION` equals `package.json`'s version.
    - `scripts/pack-check.mjs` packs the tarball, installs it in a temporary project, imports every entry in Node as ESM and as CommonJS, and typechecks a small consumer against it under `bundler`, `node16` (ESM) and `node16` (CommonJS) resolution. It runs in CI.
    - `.github/workflows/release.yml` runs on a published GitHub release whose tag is `v` and the package's version. It runs `typecheck`, `test`, `build`, the size check and `pack-check`, then `npm publish` on Node 24 (npm 11.5 or newer, which trusted publishing needs), with `id-token: write`. It does nothing until a release is published.
14. **The promise** (decision 8). CHANGELOG's list names the types its contracts use, and says that the motion core is outside it with the rest. `src/promise.test.ts` imports every promised name, values and types, so a rename or a removal fails `typecheck`. 0.1.0's CHANGELOG entry summarises everything in the release, not only what Unreleased lists today.
15. **The carried items** (decision 3).
    - **`update({ on })`** swaps a chart's effects. The runner clears the changed slots' runs and starts the new effects where the old ones were: a `decorate` run starts again on every live mark, and a hover that's held replays with the new hover effect. Nothing enters again, and focus stays. An `on` with a missing preset name rejects before anything changes.
    - **`leave()`** on every chart handle ends its hover, pointer or keyboard, as the viewer moving away would, and fires `leave`. Focus stays where it is.
    - **One start time.** The switch's tween and the pairs' runs start from one frame time, so a reverse at real speed begins exactly where the shapes are. It's checked in headless Chromium on the real clock.
    - **Into core,** with no change in behaviour: `unease` into `src/core/easing.ts`, `goesRound` into `src/core/geometry`, and `parsePath`, `transformPath` and `formatPath` from `src/icons/path.ts` into `src/core/geometry`, all internal.
    - **`table.series`** gives a header per series, defaulting to its `seriesLabels` name.
16. **Publishing** (decision 4, step 9).
    - A dry run comes first: `npm pack` (its file list and sizes shown to you), `pack-check`, `npm publish --dry-run`, and `npm view` for the name and its look-alikes.
    - You do everything that needs your npm account, a token or GitHub's settings.
    - Nothing is published, tagged or released without your go-ahead in that session.

Each step names the files it owns, so steps in the same wave can run in parallel sessions. Files shared by several steps get small edits only, and whichever step lands second merges main first: `package.json`, `package-lock.json`, `src/index.ts`, `src/charts/index.ts`, `src/charts/types.ts`, `src/core/index.ts`, `src/core/geometry/index.ts`, `src/charts/render/theme.ts`, `.github/workflows/ci.yml`, `playwright.config.ts`, `tests/visual/demo.ts`, `demo/index.html`, `docs/architecture.md`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/effects-guide.md`, `docs/sketches/api.ts`, `docs/a11y-check.md` and this plan.

Each step's session reads its siblings' hand-over notes first, and writes its own in M6's shared notes folder: commits, files, decisions beyond the brief, where the plan and the code differ, and follow-ups.

**Wave 1** (parallel):

1. ✅ **Dates on the line chart's x.** Owns `src/charts/time.ts` (new, pure: time steps, ticks and their wording) with its tests; the date paths in `src/charts/line.ts` and `line-layout.ts`; `x`, `timeZone` and `xFormat` in `LineChartOptions`; and the sketch's x.
   - As decisions 1 and 9. Tests:
     - ticks across ranges from seconds to decades, at month ends, on leap days, and across daylight-saving changes in local time (with the zone pinned in the test);
     - names, the tooltip, the table and announcements in `en-US` and `en-GB`;
     - default keys, `reveal` by `Date` and by ms, and numbers mixed with dates throwing;
     - an update that grows a new day out of the last;
     - `threshold` matching a reference series by `Date`, and `checkEffect` on a dated line's marks.
   - **Done when** every existing test and baseline passes unchanged, and a number axis behaves exactly as before.
   - Docs: architecture.md's Line chart, README, CHANGELOG. The sketch's x widens to `number | Date`.
   - **Built** (23 October 2026) as decisions 1 and 9 describe ([architecture.md](architecture.md#line-chart)): `src/charts/time.ts` (18 tests), the date paths in `line-layout.ts` (5 new tests) and `line.ts`, the chart on a time axis in `src/charts/line-time.test.ts` (15 tests), and `threshold` by `Date` with `checkEffect` on a dated line's marks in `src/dates.test.ts` (7 tests). 1502 tests in all after merging steps 2 and 3 (45 new); every existing test and all 63 visual tests pass unchanged, in Docker, and a number axis lays out and draws as before. architecture.md's "Dates on x come in M6" and the sketch's comment on x, both in the list above of what's out of date, are updated. With main merged, step 2's size check passes: the `lineChart`, `threshold`, `playback`, `playButton` set grows 1.8 KB gzip, to 33.4 KB of its 35 KB budget, and everything to 64.3 KB of 69. Decisions beyond the plan:
     - **A step's length.** The step is the smallest that can be a quarter of the range, as `niceStep` rounds up, with each unit taken at its longest: a day of 25 hours, a month of 31 days, a year of 366. With average lengths, a leap year of days (91.5 days a quarter) got one step of a year rather than quarters, and eight years from a leap day got steps of five.
     - **What the ends say.** An end needn't be on a boundary, so it says its own level plus the levels up to the step's and up to the coarsest the axis crosses. A narrow year of days reads "Jan 5, 2026 … Jul … Jan 4, 2027", with "Apr", "Oct" and "2027" dropped for room; "its own level" alone gave "Jan 5 … Jul … Jan 4". A lone x says everything up to its year. The ticks between say only their own level.
     - **Boundaries.** Weeks start on Monday (ISO 8601), and every other day counts from each month's 1st. Hours, minutes and seconds are found by stepping through elapsed time (hours a quarter of an hour at a time, since clocks change by whole quarter hours) and kept where the zone's clock shows a whole unit that's a multiple of the step, so an hour the clocks repeat has two ticks ("1:00 AM" twice), one they skip has none, and hours stay on the hour after Lord Howe Island's half-hour change (found in review); days and longer are built from their fields with `Date`'s setters.
     - **The names' time** is `dateStyle: "medium"` with `timeStyle: "short"` when any x has a time, and `"medium"` (seconds) when any has seconds. When any has milliseconds, it's said field by field with `fractionalSecondDigits`, which the styles can't take, so times a fraction of a second apart are said differently (found in review).
     - **`xFormat`** is typed `(x: Date | number) => string` and works on a number axis too, given the number. It never words the ticks. A throw makes the chart throw and `update()` reject, as `format`'s does.
     - **The kind of axis** is the first row's x: a `Date` makes a time axis. Mixed rows throw `TypeError`s naming both rows ("row 0's is a Date and row 3's a number"); a string on a time axis is a `TypeError` too ("x must be a valid Date"). A number axis's messages are as before, and the duplicate-x message gives a date as its ISO string.
     - **`reveal()`** takes a `Date` on either axis, as its time; an invalid `Date` throws "needs a valid Date", and other values the message they had.
     - **Samples' `at`** is a new `Date` for each sample, so an effect that changes one changes nothing else, and the chart compares `at` by time: new `Date` objects for the same instants are no change.
     - **The page's locale** is `Intl`'s default, as the default `format` uses for numbers. Tests pin it by stubbing `Intl.DateTimeFormat`, and the zone with `TZ` (America/New_York, through both 2026 clock changes).
     - **An x tick keeps its text** on its record, since a time's depends on the step; a number's is still `String(value)`.
2. ✅ **The bundle-size check.** Owns `scripts/size.mjs` and `scripts/size-budget.json` (new), the `size` script in `package.json`, and its step in `ci.yml`.
   - As decisions 6 and 10. The PR shows a run with a lowered budget failing.
   - Docs: architecture.md's Build outputs (the numbers), CONTRIBUTING (raising a budget), and open question 6 answered with the numbers.
   - **Built** (23 October 2026), with nothing in `src/` changed and no new dependency ([architecture.md](architecture.md#bundle-size), [CONTRIBUTING.md](../CONTRIBUTING.md#bundle-size)):
     - `npm run size` measures the build in about 3 s. It fails when a gzip size is over its budget, when something it measures has no budget, and when a budget names something it doesn't measure. CI runs it in the check job on Node 24, after the build, and it writes its tables to the job summary. A run with two budgets lowered fails, naming both and the budget each would need.
     - **The files** are found by walking `dist/`, so a new entry fails until it has a budget. Each gets raw, gzip (level 9) and brotli (11). An ES module entry counts the chunks it imports, since loading it fetches them too and tsup names them by a hash. So `sport.js` is 24.9 KB with its two chunks, which the main entry shares. "Where M6 starts" measured each file alone, in kB of 1,000 bytes; the check uses 1,024, as tsup's output does.
     - **The import sets** are the table's in "Where M6 starts". Each is an entry that re-exports its names from `dist/index.js`, built with Vite's `build()` as an app is, minified, for ES2020. A set's budget key is its names, so the switch's set is `chartSwitch, donutChart, barChart`.
     - **The table in "Where M6 starts" is too big.** The planning script built in Vite's lib mode, which minifies ES output but keeps its whitespace (Vite does this to keep pure annotations), and a page's build doesn't. Built as an app, every set is 11–19% smaller in gzip: `motion` and `animated` are 1.7 KB, not 2.1, `barChart` 27.5 KB, not 30.9, and everything 62.5 KB, not 70.5. The conclusion (decision 6) stands. architecture.md has the new numbers.
     - **Budgets** are gzip sizes only; the other columns are for reading. Each is the size measured on 95a0c4b plus 10%, rounded up to 0.5 KB.
3. ✅ **Packaging and the API freeze.** Owns `package.json`'s `exports`, `files`, `publishConfig` and metadata; the `VERSION` test; `scripts/pack-check.mjs` (new) and its CI step; `.github/workflows/release.yml` (new); `src/promise.test.ts` (new); and the promise in CHANGELOG.
   - As decisions 4, 8, 13 and 14. The release workflow isn't run.
   - Pins TypeScript to 5.9.3 (decision 8).
   - **Done when** `pack-check` passes locally and in CI, and the promise test passes.
   - Docs: CONTRIBUTING (releasing), architecture.md's Build outputs, CHANGELOG, README (TypeScript 5.4 or newer).
   - **Built** (23 October 2026) as decisions 4, 8, 13 and 14 describe ([architecture.md](architecture.md#build-outputs), CONTRIBUTING's Releasing):
     - **`package.json`.** Each entry's `import` and `require` conditions have their own `types`, `.d.ts` and `.d.cts`. `files` adds CHANGELOG.md. `homepage`, `bugs`, and `publishConfig` with `access: "public"` and `provenance: true`. TypeScript is pinned at 5.9.3, in the lockfile too. `package.test.ts` checks the conditions, `files`, and that `VERSION` equals the version (replacing `index.test.ts`'s check of its shape).
     - **`scripts/pack-check.mjs`**, Node built-ins only, about 7 s. It packs the tarball and checks its files (everything `package.json` points at, CHANGELOG.md, nothing else outside `dist/`), installs it in a new project in the system's temporary folder, imports every entry in Node as ES modules and as CommonJS with no DOM (the same names both ways, `VERSION`, a few calls), and typechecks a small consumer with the repository's TypeScript and `skipLibCheck: false` under `bundler`, `node16` (ES module) and `node16` (CommonJS). Each must read its own condition's declarations, and a `@ts-expect-error` shows the types aren't `any`. It runs in CI's check job after the build, on Node 22 and 24. On main's `exports` and `files` it fails twice, as the gaps above said: no CHANGELOG.md in the tarball, and TS1479 for the CommonJS consumer, which was given ES module types.
     - **`.github/workflows/release.yml`** runs on a published release only. It checks that the tag is `v` and the version and that npm is 11.5.1 or newer, runs `typecheck`, `test`, `build`, step 2's size check and `pack-check`, then `npm publish --provenance --access public` on Node 24 with `id-token: write` and `NODE_AUTH_TOKEN` from the `NPM_TOKEN` secret. It hasn't run.
     - **The promise.** CHANGELOG names every type its names use, and says the motion core is outside it with the charts, adapters, built-in effects and controls. `src/promise.test.ts` names every promised value and type (`matrix`'s and `describe`'s members too), so a rename or a removal fails `typecheck`, and checks that its list and CHANGELOG's match.
     - 1457 tests in all, 4 more than main; no visual baseline could change, since nothing a page draws was touched.
   - **Decisions beyond the plan:**
     - **Nine more types are promised than the plan listed,** found by walking the declarations with TypeScript's compiler API: `MotionMode` and `TweenResult` (through `MotionView` and `Tween`), `IconShape` and `IconSource` (through `Icon` and the context's `icons`), and `Motion`, `Clock`, `ManualClock`, `ScalingOverrides` and `ScalingRule`, through the testing entry's `TestContext`, `TestContextOptions` and `play`. So the motion core's functions are outside the promise, but those of its types are in.
     - **Trusted publishing, as npm's docs have it now.** A trusted publisher's configuration expires unless a publish uses it within 2 days, and one made since 3 September 2026 allows only `npm stage publish` unless direct `npm publish` is ticked. So CONTRIBUTING has the token deleted once 0.1.0 is out, and trusted publishing set up just before the next release, with `npm publish` allowed. Step 9's "After" changes to match.
     - **An empty token is ignored.** With the secret deleted, `NODE_AUTH_TOKEN` is empty, and npm treats that as no token (checked locally), so the workflow needs no change for trusted publishing. Left unset, npm would send the text `${NODE_AUTH_TOKEN}`, so the publish step always sets it.
     - `npm publish --dry-run` works locally with `provenance: true` in `publishConfig`, for step 9's dry run.
4. ✅ **The carried items** (decision 3). Owns the runner's effect swap in `src/core/runner.ts`; `leave()` in `src/charts/shell/hover.ts` and on `Chart`; the `on` paths in `bar.ts`, `donut.ts` and `line.ts` (small edits, since step 1 owns the rest of `line.ts`); `src/charts/table.ts` and `TableOptions`; the start time and `leave()` in `src/charts/switch.ts`; the helpers moved into `src/core`; and `demo/donut.ts`'s picker.
   - As decision 15. Suggested as two PRs: the moves and the start time, then the chart API.
   - Tests: an effect swapped on each chart (decorate restarted, a held hover replaying, focus kept, nothing entering), `leave()` on each chart and in a switch, `table.series` on each chart, and the moved helpers' existing tests unchanged in their new home.
   - **Done when** every existing test and baseline passes unchanged, `donut.html`'s picker keeps focus, and a reverse at real speed starts with no jump.
   - Docs: architecture.md (the chart handle, Runner, Switching), README, CHANGELOG, open questions 14 and 17 answered.
   - **Built** (23 October 2026) as decision 15 describes, in two PRs ([architecture.md](architecture.md#reference-charts)). Every existing visual baseline passes unchanged; the Docker visual suite has 64 tests (one new DOM check on `donut.html`'s picker), and there are 1565 unit tests with steps 1, 2, 3 and 5 merged (31 of them new). Step 2's size check passes: against main with the first PR merged, the chart API adds 0.5 KB gzip to the bar and line sets, 0.4 KB to the switch's and to everything, and 0.2 KB to `expressive`'s.
     - **The moves and the start time** (the first PR). `unease` is in `src/core/easing.ts`, `goesRound` in `src/core/geometry/ring.ts`, and `parsePath`, `transformPath` and `formatPath` in `src/core/geometry/path.ts`, all internal: none is exported from `src/core/index.ts`, so none reaches the package. `path.ts` and `ring.ts` are imported from their own files, not through `src/core/geometry/index.ts`: the sport pack imports `formatNumber` through that file, so tsup puts everything it re-exports in the chunk the pack loads, and through it `dist/icons/sport.js` grew from 8.2 to 9.7 KB gzip, over step 2's budget. `path.test.ts` moved with them, only its imports changed, and `unease` and `goesRound` have new tests. A switch's own tween and the pairs' runs start from one reading of the clock: the switch holds its clock's time while it starts them, then lets go, so a tween an effect starts later starts when it does.
     - **The reverse, at real speed.** Headless Chromium on the real clock, against `npm run dev`: on `demo/morph.html`, a switch reversed at 60, 150, 300, 450, 600 and 800 ms, each way and with each `align`, comparing the pairs' shapes just before the reverse with its first picture. Before the fix they jumped by up to 0.58 px (the labels by 0); after it, by 0 every time. A unit test does the same on a clock that moves each time it's read, as `performance.now()` does.
     - **The chart API** (the second PR). The runner's `swap(effects, marks)`; `update({ on })` on the bar, donut and line charts, with `nextEffects` in `src/charts/shell/setup.ts`; `leave()` in `shell/hover.ts`, on `Chart` and on `ChartSwitchView`; `table.series` in `table.ts` and `TableOptions`; and `donut.html`'s picker on `update({ on })`.
   - Decisions beyond the plan:
     - **`enter`, `update` and `exit` draw the new effect's end state** on the marks whose runs they replace, rather than nothing. So nothing enters again, an update effect that explains a change (a delta label) still shows it, and an exit swapped mid-way still ends and lets its mark go. A replaced run's place (its start order, so its style precedence and stacking) goes to the new one, as when motion turns off mid-run.
     - **Which slots change.** A slot given the same effect, or the same preset name, keeps its effect and its runs, and an unchanged name isn't made again. An `update()` without `on` keeps the effects; `on: {}` empties every slot, as `undefined` resets other options.
     - **Order.** The swap comes inside the update, once its new layout is matched to the marks and before the runner hears the change, so a held hover replays once, when the change settles, and `update({ on, data })` plays the data change with the new effects. A new `decorate` starts on the marks staying, with their new rows, in visual order and with `enter()`'s batches; the marks entering start theirs as they enter. So a data effect finds a series the same update adds (after Codex's review on PR #61: swapped before the layout was matched, it read the old rows). The runner starts those runs on the rows it's given without taking them as the marks' own, so an update run still gets the values from before.
     - **`leave()` keeps the focus ring,** as Escape does: focus is still on the mark. The pointer lets go too, so its next move onto a mark hovers again.
     - **A view needs `leave()`.** `ChartSwitchView` has it, and a view's function that returns a chart without it throws, as for the other methods.
   - **Where the plan and the code differ.**
     - **Four existing assertions changed,** each one testing what decision 15 replaces: three asserted the "`on` can't be changed by update() yet" rejection (`bar.test.ts`, `donut.test.ts`, `line.test.ts`), and now assert the rejection of an unknown preset name; and one asserted that a switch moves focus off the old view at once (`switch.test.ts`), which was the blur. Now focus stays until the view turns inert, so in jsdom it stays on the old mark until the landing. In Chromium the view turning inert takes focus off it on the next rendering update, with a blur, as before; the landing then puts it on the same key in the new view, ring and all (checked at real speed). The donut page's visual test of the picker passes unchanged, its title and two comments reworded.
     - **The D3 pie keeps being rebuilt.** An attachment (`expressive()`) can't change its effects, so the picker attaches the pie's effects again, and the pie's tab stop goes back to its first slice. The donut and the columns keep theirs. A way to change an attachment's `on` is in the backlog.
     - **The jump was larger than measured in M5:** up to 0.58 px here, against about 0.17 px.
5. ✅ **Observable Plot** (decision 7). Owns `@observablehq/plot` in `package.json` and `package-lock.json` (pinned), `src/plot.test.ts` (new) and the Plot sources in `src/conformance.test.ts`.
   - A stacked Plot bar and a Plot line, rendered in jsdom, through `expressive()` with the accessor architecture.md's Adapters gives for each kind of mark:
     - the bar's rects, each bound to its row's index: `datum: (el) => rows[el.__data__]`;
     - the line's path, bound to its series' array of row indices, with `-1` at a gap: `datum: (el) => el.__data__.filter((i) => i >= 0).map((i) => rows[i])`, and a `geometry` from those rows' points.
   - Then every built-in effect through `checkEffect` on both, `threshold` on the line through `samplesAlong`, keyboard order, and the adapter's warning on a bar given no `datum`.
   - Docs: Adapters in architecture.md, whose Plot accessors and caveat about transforms that derive new data come from the spike, now with the tests behind them; README.
   - **Built** (23 October 2026) on Plot 0.6.17, still npm's latest and the version the spike tried, pinned exactly as a dev dependency. It brings 14 packages into the dev tree (`d3` 7.9.0 and the ten of its modules that Vega hadn't already brought, `isoformat`, `interval-tree-1d` and `binary-search-bounds`); `npm ls --omit=dev` is still empty. No library code changed: the adapter read Plot's marks as the spike said it would. 32 new tests (1489 in all after merging steps 2 and 3):
     - **`src/plot.test.ts`, 9 tests.** A stacked `barX` (each rect's row by its index, goals and assists as segments from the baseline with the bar chart's samples, keyboard order and one name per bar, a new `<svg>` followed through `refresh()`), and the adapter's warning when the bars are given no `datum`. A two-series `lineY` (each path's rows from its indices, its geometry from those rows' points through Plot's own scales, `samplesAlong` samples, `threshold` against xG crossing where the lines meet, keyboard order). Both rendered in jsdom through Plot's `document` option.
     - **Conformance, 23 tests.** A Plot bar source and a Plot line source in `src/conformance.test.ts`: every built-in effect there passes all five checks on both, each with its moved twin, and `threshold({ compareTo: "xg" })` does on the line with the adapter's samples. So the effect sweep lives there, as for the D3 sources, and isn't repeated in `plot.test.ts`.
     - **The half-pixel offset.** Plot puts `translate(0.5,0.5)` on the line's group when there's a `window` whose device pixel ratio is 1, as in jsdom (in Node with no `window` it doesn't). The points from Plot's scales are already in that group's coordinates, so the page adds nothing, and the overlay takes the group's transform. A test pins both.
     - **The caveat, tested too.** After `groupY`, rect 1 is Lindqvist's total but `rows[1]` is Okafor's assists. A test reads each bar's row from the channels Plot gives the mark's `render` option instead (`values.channels`, unscaled, by the derived index), as architecture.md says.
     - **A gap.** Where a value is missing, Plot binds `-1` and starts a new subpath. The accessor leaves the `-1` out, so the rows on either side are read, but `describe.line` has no gaps, so the described line goes straight across the one Plot leaves. A test pins that, and Adapters and README say so; gaps in lines stay backlog, as for `lineChart`.
     - **Docs.** Adapters' Plot paragraph (the stack's `segment`, the line's `geometry` and `samples`, the offset, the gap, the `render` route, and the tests), the list of conformance sources in Testing, which also lacked `lineChart` and the D3 line, and README's adapter section.

**Wave 2** (after wave 1 lands):

6. ✅ **`demo/stress.html`, the limits, its screenshots and listening script G.** Owns `demo/stress.html`, `demo/stress.ts`, `scripts/bench.mjs`, the link in `demo/index.html`, `tests/visual/stress.spec.ts` with its `stress-` baselines, section G of `docs/a11y-check.md`, §10's SVG performance risk and "Runs on every point", open question 13, and the limits in architecture.md and README.
   - **The page,** as decision 11, with the motion switch and a checklist that is the "Done when" list below. The date line is seeded: a daily series and its 28-day average, red below the average, the core arrow riding its leading edge.
   - **Screenshots,** all `stress-`: the page at small sizes in light and dark, the date line at rest and part way through its play, and its tooltip. Reduced motion and Off are checked in the DOM, and nothing plays by itself. The page fits 1000 × 2000, and the baselines are made in Docker.
   - **Run `bench.mjs`** and record the limits, the `watch` numbers (Q13: does it stay opt-in?) and the run counts.
   - A listening script, section G, for the date line: each day read once with its date and values, the arrow keys going a day at a time, the table's rows named by date. **You run it** with NVDA + Chrome.
   - Then check the "Done when" list in the browser with you, at real frame rates if the pane is hidden, and look at the Vega-Lite card on `demo/line.html` (M4's leftover).
   - **Built** (23 October 2026) as decision 11 describes ([architecture.md](architecture.md#limits) has the limits). No library code changed.
     - **The page.** Six cards, each with a size picker (segmented buttons), a start button and a readout that's a polite live region, written once a run ends: its frames, the 95th-percentile interval, the longest frame and the long tasks, with a verdict, and the same as data attributes for the bench. The date line is a year to ten years of daily visits to 31 December 2025, seeded, with their 28-day average and the same two a year earlier as series 3 and 4; `only("visits", parallel(threshold({ compareTo: "average" }), travel("arrow", { ride: "on" })))`, wrapped to count its runs, played over 8 s base. The hover case's button hovers a bar every 50 ms (a `pointerover` on each, 60 in all) and is Stop while it sweeps; the date line's Play is Pause while it plays. Everything else ends within 2 s. `stress.html?case=host` draws one case alone. The page fits 1000 × 2000.
     - **`scripts/bench.mjs`** (`npm run bench`, about 47 minutes for everything): each case at every size and option, alone on a fresh page, unthrottled and at 4×, five times, on the real clock, with the main thread's work per frame (`TaskDuration`) beside the page's numbers; `--affinity` pins it to some CPUs on Windows; then 50 create-and-destroy cycles per case, checking DOM nodes and listeners after garbage collection. Markdown tables, and JSON with `--json`.
     - **The limits**, in architecture.md and README, replace §10's rough guide, which was 2 to 10 times too generous. Unthrottled / at 4×: a staged update of every bar, 100 / under 100 bars; hover, 1,000 / 500; the date line, 5 years (1–2 series) or 2 (3–4) / a year (1 series); D3 columns with `watch`, 500 / 20, with `refresh()` at the end, 1,000 / 100; a switch, 200 / 20 pairs. A first draw is one long task: 86 ms for 1,000 columns, 1.0 s for 10,000.
     - **Open question 13 and "Runs on every point"** have their numbers (below). `watch` stays opt-in.
     - **No leaks:** after 50 cycles, every case's chart left no DOM node and no listener behind.
     - **Screenshots:** five `stress-` baselines made in Docker (the page in light and dark, and the date line at rest, mid-play and with its tooltip), with the readouts masked. `stress.spec.ts` has 15 tests: nothing plays by itself, each button runs its case and reports, reduced motion and Off jump every case to its end, and the date line's names, arrow keys and table rows by date. Step 7 landed first, so the DOM checks run in Firefox and WebKit too, and the page joined `a11y.spec.ts`'s list (axe, tab order, tooltips, 320 px, forced colours), its chrome given step 7's colour fixes.
     - **Script G**, 11 steps in `docs/a11y-check.md`, is yours to run with NVDA + Chrome. *It passed on 24 October 2026.*
   - **Decisions beyond the plan:**
     - **Each case is measured alone.** With all six on the page, about 22,500 DOM nodes at their smallest sizes, every case paid about 5 ms more a frame, and at 4× not even 20 columns were smooth: a number about the page, not the chart.
     - **The arrow rides the tip from the start.** `travel`'s trip lasts the distance ÷ 360 px/s, and the visits line is 9,373 px long for a year (26 s) and 60,242 px for ten (167 s), far past the 5 s WCAG 2.2.2 allows motion that starts by itself. The page's `riding(effect)` draws the end state at once and follows the line. The backlog has the cap.
     - **A first draw** isn't judged smooth or not: its readout gives the time until the frame that shows it.
     - **The bench checks the machine.** Each repetition first times a fixed loop. Runs taken while step 7's Docker suite was busy drifted by 2× and were thrown away; the header flags a run whose loop times are over 1.25× apart.
     - The bars are 150 px tall, the switch 180 and the line 200, so the page fits the screenshot's 1000 × 2000.
   - **Where the plan and the code differ:**
     - **No contained fix.** In a 1,000-bar update, 77% of attribute writes set the value already there, and in a ten-year play 98.8% (every day's hit column and `tabindex`, on every frame). Skipping them in `setAttributes` and the keyboard's `tabindex` was tried, but no gain could be shown above the drift of a shared machine, and one comparison made a bar update slower, so it's in the backlog. The date axis's `Date` per vertex costs 0.09 ms a frame on ten years (1% of the play's script), so it has no cache.
     - Bar charts draw every label, so past about 40 bars they overlap; `a11y.spec.ts`'s text-spacing check skips this page.
     - **The walk** (23 October 2026): you looked at the stress page and at the Vega-Lite card on `demo/line.html` (M4's leftover) in the browser, and both look fine. M4's ✅ waited for section E's steps 13 and 14, which passed on 24 October 2026.
7. ✅ **The accessibility audit** (decisions 2 and 12). Owns `docs/a11y-audit.md` (new), the Results in `docs/a11y-check.md`, `tests/visual/a11y.spec.ts` (new: `axe-core` on every demo page in both themes, at 320 px, under forced colours and mid-switch), `axe-core` in `package.json` (pinned), Firefox and WebKit in `playwright.config.ts` (decision 8), and the small fixes it finds.
   - **You run** section C and section E's steps 13 and 14 with NVDA + Chrome. When E 13–14 pass, M4 gets its ✅.
   - The stress page joins the axe list once step 6 has landed, whichever lands second.
   - **Done when** every criterion has a result, every failure is fixed or in the backlog with what was found, and your runs are recorded.
   - **Built** (23 October 2026) as decisions 2 and 12 describe. [a11y-audit.md](a11y-audit.md) has a table for each of the four pages, with a result and its evidence for every WCAG 2.2 AA criterion that applies, and what found what:
     - **`tests/visual/a11y.spec.ts`**, 50 tests a browser. `axe-core` 4.14.0, pinned exactly as a dev dependency, runs its WCAG 2.0, 2.1 and 2.2 A and AA rules (70 of its 105) on each page at rest in light and dark, under forced colours in each, at 320 px wide (with no sideways scroll), and on `morph.html` mid-switch. Beside it, DOM checks for what axe can't see: every tab stop in order with a visible focus, and Shift+Tab back; the tooltip clear of the focus ring at every mark; the tooltip kept while the pointer stays and dismissed by Escape; text spacing; nothing moving 5 s after load; and legends and pressed toggles under forced colours.
     - **Firefox and WebKit** run every DOM check in the visual suite, without screenshots (`playwright.config.ts` projects, `ignoreSnapshots`), in CI's visual job, whose image already has them. 114 tests a browser; Chromium's CDP check of the switch's accessibility tree, and the forced-colours checks, run in Chromium only.
     - **Five fixes**, each its own commit. The first darkens the light pages' muted text, under the screenshots' threshold, and 11 light baselines are made again to match it exactly ([a11y-audit.md](a11y-audit.md#screenshots)); no other baseline changed. They are: the demo pages' light muted text and links, and the motion switch's hint on the page, to 4.5:1 (1.4.3); Vega's unnamed `graphics-symbol` and `graphics-object` roles taken off the groups round named marks (1.1.1, 4.1.2); Escape dismissing a pointer's hover and tooltip (1.4.13); the line page's own legends keeping their colours under forced colours; and pressed toggles in `Highlight` under forced colours.
     - **Two backlog items**: a tooltip that can be hovered (1.4.13), and dimming that keeps text readable (a judgement call on 1.4.3).
   - **Decisions beyond the plan:**
     - **axe-core alone**, injected with `addScriptTag`, not `@axe-core/playwright`, whose default path opens a blank page that the stopped clock trips on. axe waits on timers, so the suite moves the clock a millisecond at a time until it's done, about 40 ms, which changes nothing at rest and leaves a switch mid-way.
     - **Forced colours in Chromium only.** Firefox's and WebKit's emulation only matches the media query and forces no colours, so the checks there would test nothing (and axe then measured the unforced `Highlight` pair).
     - **The fixes are in the demo pages where the library's defaults pass.** `--ec-text-muted` is 4.62:1 on `--ec-surface`; the motion switch's hint failed only on the pages' darker background. Changing the token would change every tick in every screenshot, so architecture.md says a page sets it darker on a darker background, as the demos now do.
     - **Firefox and WebKit found test problems, not library ones**: Firefox's `getBoundingClientRect()` includes a stroke (a flash's halo, the ring's miter allowance), its pointer lands on whole pixels, and past the last tab stop it keeps focus where Chromium leaves the page. The checks now measure fill boxes plus half the stroke, aim at whole pixels, and stop at a repeated stop. No browser needed a library change.
   - **Your NVDA runs.** Section C and section E's steps 13 and 14 couldn't be run on 23 October 2026. You ran them on 24 October 2026, with step 6's section G, and all three passed ([a11y-check.md](a11y-check.md#results)). So the audit's rows that cite them rest on your runs, and the step and M4 have their ✅.

**Wave 3** (after wave 2 lands):

8. ✅ **README and the API reference** (decision 5). Owns `README.md` (rewritten as npm's landing page), `docs/api.md` (new) and `src/api-docs.test.ts` (new), `src/charts/README.md`'s rows, and README's links, which become absolute where npm can't follow a relative one.
   - README covers: install (npm and a script tag), a quick start, the four entries, the browsers (decision 8) and TypeScript 5.4 or newer, CSP, accessibility (from step 7), the limits (from step 6), the 0.x promise, and links.
   - `docs/api.md` documents every export of every entry: what it is, its options with their defaults, and what it returns. `src/api-docs.test.ts` fails when an export has no entry, or an entry no export.
   - **Done when** the test passes, and every example in README is type-checked (as the sketch's are) or run.
   - **Built** (23 October 2026) as decision 5 describes ([api.md](api.md), [architecture.md](architecture.md#build-outputs)). No library code changed. 1580 tests in all (9 new); typecheck, build and the size check pass.
     - **`docs/api.md`**: an entry for every export, 199 in all (174 of the main entry, 3 of the sport pack and 22 of the testing entry), values and types, and a section for the stylesheet with its custom properties. Each entry gives the signature, what it is, its options with their defaults, what it throws and what it returns, linking to architecture.md for the design. It's grouped by entry, then by layer: core, contracts, geometry, effects, icons, presets and settings, charts, adapters and controls. The 74 names under the 0.x promise say so, and 21 examples show the main calls.
     - **`src/api-docs.test.ts`**, 9 tests, modelled on `src/promise.test.ts`. One TypeScript program, with the repository's own compiler options, reads each entry's exports (values and types) and type-checks the examples. It fails when an export has no entry or an entry names no export, when an entry of `package.json`'s `exports` has no section, or when the entries marked as promised aren't CHANGELOG's names. It type-checks every code example in README (the scripts in its HTML too, against the `ExpressiveCharts` global) and every example in api.md that imports the package. It fails on a relative link in README, and on a link in either file whose file or heading isn't there. It takes about a second.
     - **README**, npm's landing page: install (npm, and the script tag from jsDelivr), a quick start (bars, the same story on D3 bars, a line with `threshold` and a playback), what's in it, writing effects, the four entries, the browsers and TypeScript, CSP, accessibility, the limits, the 0.x promise, links and Development. Every link is absolute. The status still says it isn't published (step 9). Step 1's dates, step 4's `update({ on })`, `leave()` and `table.series`, step 5's Plot sentences and step 6's limits are kept in short; their detail is in api.md.
     - **The rows.** `src/charts/README.md` has `donut.ts`, `donut-layout.ts`, `time.ts` and `controls/`, `table.series` in `table.ts`'s, `leave()` in `shell/`'s and `outside.ts` in `render/`'s. `src/core/README.md`'s runner row names `swap()`, and its `testing/` row says which helpers the testing entry makes public.
     - CONTRIBUTING's pull-request list says when to update api.md, and architecture.md links to it and has a Build outputs bullet on the test.
   - **Decisions beyond the plan:**
     - **README's examples are type-checked by the test, not by `npm run typecheck`.** Putting them in `docs/sketches` would have meant showing each file whole, with the declarations of the page's data. Instead the test declares the page's own names once (`PAGE`: its rows, its D3 selections, its Vega view), as globals in a module of their own so they're checked too, and compiles each block as written.
     - **api.md's examples are checked too:** a block that imports the package is an example; the others are signatures.
     - **Anchors.** A type whose name differs from a function's only in case (`Tween`, `tween()`) has "(type)" in its heading, so each has its own anchor.
     - **Two reviews against the source** (subagents, read-only) found 14 mistakes in api.md before it was committed, all corrected: how errors in `tween()` and `playback()` are passed on, how the clock looks up its frames, what Analysis caps, how `flash` and a step move, that a new `on` replaces the old one (so the donut example dropped its `flash`), that a stock `d3.stack()` point has no series key (README's D3 example now says to copy it on), and what `--ec-surface` colours.
   - **Where the plan and the code differ:**
     - **The old README's examples didn't type-check:** the new test found 56 errors in them (missing imports, rows of the wrong type, D3 code that isn't type-safe, and `Array.prototype.at`, which ES2020 hasn't).
     - **`docs/a11y-audit.md` still says `stress.html` "joins once M6 step 6 has landed".** Step 6 has landed and the page runs axe's rules, but the written audit has no table for it, so README says the written audit covers the pages with the library's charts on them.
     - **`moduleResolution: "node10"`** can't find the subpath entries' types (step 3's follow-up), so README says so, beside TypeScript 5.4.

**Wave 4:**

9. ✅ **Publish 0.1.0.** Owns the version (`package.json`, `VERSION`), CHANGELOG's 0.1.0 entry, README's status, and this plan's status line and M6's ✅.
   - **The dry run,** as decision 16: `typecheck`, `test`, `build`, the size check, `pack-check`, `npm pack` (its list and sizes shown to you), `npm publish --dry-run`, and `npm view` for the name and its look-alikes. The PR has its results.
   - **You:** make the repository public, create the npm token and add it as the repository's secret (decision 4).
   - **Then, on your go-ahead in that session:** the `v0.1.0` release is created, and the release workflow publishes it.
   - **After:** check the npm page (the version, README, the provenance badge) and install 0.1.0 in a fresh project. Then you delete the token and the `NPM_TOKEN` secret. Trusted publishing waits until just before the next release, with direct `npm publish` allowed (decision 4, as changed after step 3).
   - **Done when** 0.1.0 is on npm and every item of the "Done when" list below holds.
   - **Built** (24 October 2026): [0.1.0 is on npm](https://www.npmjs.com/package/expressive-charts) with provenance, and [its release](https://github.com/Deaversbp/expressive-charts/releases/tag/v0.1.0) is on GitHub.
     - **The release PR** (#65): 0.1.0 in `package.json`, the lockfile and `VERSION`; CHANGELOG's 0.1.0 entry, a summary of everything in the release (decision 14), then the earlier entries as plain facts; README's status; and decision 4's order of token and trusted publishing. Its dry run passed: every check, `npm pack` (35 files, 1.2 MB packed, 4.7 MB unpacked, most of it source maps), `npm publish --dry-run`, and `npm view` for the name and its three look-alikes, all still free.
     - **The release went on hold for polish** before the repository went public. A read-through as a visitor found the package clean, but the demo pages and docs read as this log, and nothing showed the effects moving. Four pull requests followed:
       - #66, icons from icon sets: `iconFromSvg` reads `<polyline>` and takes `currentColor` as the theme's `text`, api.md has a recipe for icons from Lucide or Heroicons, and README's quick start leads with `icons.arrow`, the ball and boot second;
       - #67, the demo pages and docs for a first-time visitor: "Things to try" in place of the milestone checklists, no milestone, review or commit tags, no "you", and 38 baselines made again;
       - #68, npm keywords (`d3`, `vega`, `observable-plot`, `accessibility`) and this log's banner; the five stale `claude/*` branches were deleted;
       - #69, four GIFs at the top of README, made by `npm run media` from scripted scenes in Docker, each playing once and stopping within 5 s on its effect's end state (a test checks it), and the demo pages on GitHub Pages.
     - **Your decisions while it was on hold:** 0.1.0's content is enough, since additions can come in any release; icons stay bring-your-own, with no emoji library and no large set of our own; and the existing commits keep your email, with GitHub's private address from now on.
     - **You** made the repository public, turned on Pages, added a 7-day granular token as `NPM_TOKEN`, and ran sections C, E 13–14 and G with NVDA + Chrome. All three passed.
     - **The release.** Main's CI was green on `718fadb`, and the dry run passed there again (1,584 tests). On your go-ahead, `v0.1.0` was created on `718fadb` at 18:56 UTC, and the release workflow passed every step and published with provenance ([Sigstore's log](https://search.sigstore.dev/?logIndex=3441694308)).
     - **After.** npm shows 0.1.0 as `latest`, with README, its four GIFs, and "Built and signed on GitHub Actions" from `718fadb` and `release.yml`. A fresh project installs it with no dependencies, `npm audit signatures` verifies its registry signature and its attestation, and all three entries load as ES modules and as CommonJS, with the stylesheet. jsDelivr serves the script tag at `expressive-charts@0.1`.
   - **Where the plan and npm differ:**
     - **A placeholder version.** For a new package, npm first published `0.0.0-stage`, "Temporary package placeholder for staged publishing" (18:57 UTC), then 0.1.0 (18:59 UTC). `latest` is 0.1.0, but `0.0.0-stage` stays in the list of versions.
     - **Tokens lose direct publishing.** npm's token form warns that a granular token that bypasses 2FA can't publish directly from January 2027. 0.1.0 wasn't affected. Later releases use trusted publishing, or staged publishing (`npm stage publish`, then approved with 2FA), as CONTRIBUTING says.
   - **Left for you:** delete the token on npmjs.com and the `NPM_TOKEN` secret, and set up trusted publishing only just before the next release.

**Done when:**
- **Limits.** `demo/stress.html` runs every case at sizes up to past its limit, with a frame readout and nothing playing by itself. `scripts/bench.mjs` has measured each case on a laptop and at 4× slowdown, and the limits replace §10's rough guide in README, architecture.md and this plan. Open question 13 and "Runs on every point" have their numbers.
- **Dates.** `lineChart` takes dates on x, with time ticks and `Intl` wording in the names, the tooltip, the table and announcements, in the zone of decision 1, and no dependency. The stress page's date line shows it in light and dark.
- **Size.** CI checks the bundle sizes, the import sets included, against their budgets, with a Node script and no new dependency. Open question 6 is answered with the numbers.
- **Accessibility.** The audit is written up with every WCAG 2.2 AA criterion that applies, sections C, E 13–14 and G have passed with NVDA + Chrome, and M4 has its ✅.
- **Docs.** README is npm's landing page, and the API reference is checked by a test.
- **The API.** It matches the 0.x promise, which names every type it covers, and a test fails if a promised name goes. No `@experimental` is left.
- **The carried items** of decision 3 are built: `update({ on })`, `leave()`, the switch's one start time, the helpers in core and `table.series`, with no existing baseline changed.
- **Plot.** A stacked Plot bar and a Plot line pass `checkEffect` through `expressive()`, with Plot a pinned dev dependency.
- **Packaging.** `pack-check` passes for ESM and CommonJS and their types; the package has no runtime dependencies; `typecheck`, `test`, `build` and the size check are green.
- **0.1.0 is on npm,** with provenance, its CHANGELOG entry, and its release on GitHub. This plan's status line says M6 is done.

**Status: complete (24 October 2026).** Every item on the list holds. The last two came on release day: your NVDA runs of sections C, E 13–14 and G passed, so M4 has its ✅, and 0.1.0 is on npm with provenance, with its release on GitHub (step 9).

### M7: Effects that explain, and linked hover (0.2.0) ✅

Built-in effects that draw a path and label a change, a way for their text to keep clear of the charts' own labels, linked hover across charts, two fixes from the backlog, and last, 0.2.0 on npm.

**Demo:** `demo/season.html`, the season so far: weekly columns, the goals vs xG line and D3 columns linked by matchweek; the players' bars with each change since the last matchweek; and a slope chart with each player's change labelled.

**Where M7 starts** (checked against main at 56915e9 while planning, 24 October 2026):

- **Already built.**
  - **Effects.** `travel`, `flash`, `wiggle`, `pulse`, `threshold` and `morph`, with `sequence`, `parallel`, `only` and `stagger`. The presets are exactly `flash`, `wiggle` and `pulse`.
  - **`trace` and `delta`** are the effects guide's worked examples, in `docs/sketches/examples/effects/` (32 and 54 lines). They're written against the public API, and `src/effects-guide.test.ts` passes both through `checkEffect`, `delta` whether its value changed or not. Sketch 06 uses them on `barChart` and on `expressive()`.
  - **Text.** The drawing API already draws text: `layer.text(content, { at, anchor, color, opacity })`, in the theme's text colour by default. The SVG layer implements it, but no built-in effect uses it yet. Every chart's and attachment's overlay is `aria-hidden`.
  - **What data effects get.** A bar's samples run from 0 at the baseline to its total at the tip, and a slice's from 0 to its share (0 to 1); neither has an `at`. A line's are its vertices, and a line point's is its one value, both with `at` (its x). An `update` event's data has `previous`.
  - **Hover.** `src/charts/shell/hover.ts` is shared by the bar, donut and line charts: targets (a line chart's x stands for every series' point there, the crosshair), emphasis (`ec-hot`), dimming, the tooltip, Escape and `leave()`. `expressive()` has its own hover, on `pointerHover` in `src/charts/interaction.ts`, and dims the host's mark elements with `ec-dimmed`. Charts and attachments both fire `hover` and `leave` to `on()`, with `source` `"pointer"`, `"keyboard"` or `"touch"`. Attachments have `focus(key)` but no `leave()`.
  - **`travel`'s trip** lasts `max(260 ms, distance ÷ 360 px/s)` base, times the gait's pace, with no limit.
  - **Sizes** (0.1.0, gzip, against their budgets): everything 65.2 KB of 69, `barChart` 28.2 of 30.5, the line page's four imports 34.1 of 35, and the script-tag bundle 71.4 of 75.5.
  - **Tests.** 1,584 unit tests (M6 step 9's dry run). The visual suite runs its DOM checks in Chromium, Firefox and WebKit.
  - **Releasing.** `release.yml` publishes when a GitHub release is published, with `--provenance`, `NODE_AUTH_TOKEN` from `NPM_TOKEN`, and a check for npm 11.5.1 or newer. The token and the secret are deleted, and no trusted publisher is set up yet. npm lists `0.0.0-stage` and `0.1.0`, which is `latest`.
  - **TypeScript** is pinned at 5.9.3. npm's `latest` is 7.0.2, with 7.1 in beta.
- **Gaps.**
  - **Where the text would go.** The sketch's `delta` puts "+2" 10 px past the end of the walk. That's where a bar's value label is, past its tip, and a line's end label, past its end; a slice's label is outside the ring. `MarkGeometry` says nothing about a mark's labels, and `labels()` gives their anchor points, not their boxes.
  - **The sketch's numbers.** `delta` words a change with a template string, so 0.1 + 0.2 reads "+0.30000000000000004". On a slice it would show the change in share, as a fraction.
  - **Hearing the change.** Overlay text isn't read by screen readers, and the default announcement names the marks that changed, not by how much ("Okafor and Tanaka changed").
  - **No hover without focus.** A chart is hovered only by the pointer, touch or `focus(key)`, which moves focus. A linked chart mustn't take focus.
  - **Dimming takes the labels with it.** `.ec-mark:not(.ec-hot)` dims the whole mark group to `--ec-dim-opacity` (0.3), its category and value labels too, so names fall to 2.0:1 in light and 2.5:1 in dark (M6 step 7).
- **Out of date** (each fixed by the step named):
  - The backlog says linked hover "generalises the line chart's `pointer: "x"`". There's no such option: the crosshair is how every line chart hovers (step 4).
  - [ideas/effects-by-chart.md](ideas/effects-by-chart.md) says `delta` and `trace` are in sketch 06. They're in `sketches/examples/effects/`, which sketch 06 imports (step 1).
  - `release.yml`'s comment and CONTRIBUTING's Releasing speak of 0.1.0's token as still to come (step 6).

**What M7 takes from the backlog, and what stays:**

| Item | Goes to |
| --- | --- |
| Linked hover, and whether linked marks get `source: "linked"` | Decisions 3 and 13, step 4 |
| `trace` as a built-in | Decisions 5 and 9, step 2 |
| Change labels: `delta` and `label` | Decisions 4 and 10–12, step 1 |
| Comparisons between neighbouring marks | Stay with the page, computed into the rows, as the backlog says |
| A cap on `travel`'s trip | Decisions 2 and 14, step 2 |
| Dimming that keeps text readable | Decisions 2 and 15, step 3 |
| A tooltip that can be hovered, thinning bar labels, Page Up and Page Down, the icon sets' fills, TypeScript 7, line charts as switch views, and the rest | Stay in the backlog |
| New: drawing a mark itself in | Backlog (decision 5) |
| New: a chart switch in a link | Backlog (decision 13) |

When a step lands, it marks its backlog item as built in M7.

**Decided while planning M7 (24 October 2026):** decisions 1–7 are yours, and 8–16 follow from them and the code.

1. **M7 builds four things, in this order of priority:** `trace` and `delta` as built-ins, then `label`, then linked hover. Linked hover is the largest, so it starts in wave 1 beside the effects.
2. **Two backlog items join it:** a cap on `travel`'s trip, and dimming that keeps text readable, since linked hover spreads dimming to more charts. The others stay in the backlog.
3. **Linked marks get a full hover, marked as linked.** Emphasis, the dimming of the other marks in their chart, and their chart's own hover effect, with `source: "linked"` on the `hover` event. They get no tooltip, no focus ring and no focus, and nothing is announced. `link(sources, { effects: false })` keeps them to emphasis and dimming. Effects can't tell a linked hover from any other, so the effect contract doesn't change.
4. **A mark says where its own labels are.** `MarkGeometry` gets an optional field, `labelBounds`: the boxes of the text the chart draws for the mark. `delta` and `label` put their text past them. Our charts fill it in. Marks the library didn't draw have none, so the text sits 10 px past the end, as in the sketch.
5. **`trace` is a highlighter.** It's the sketch, grown: a stroke drawn along the mark's walk, which stays. The mark itself is untouched, so it's safe in any slot. Drawing a mark itself in (a faint copy, then the mark at its own width and colour) goes to the backlog: in the hover slot it would hide data, and a stack would draw in one colour.
6. **One release, 0.2.0, when M7 is done.** Trusted publishing is set up once, just before it.
7. **Trusted publishing, with direct `npm publish`.** You add the trusted publisher within 2 days before the release, then set the package to require 2FA and disallow tokens. The workflow doesn't change. Staging stays the fallback (CONTRIBUTING's Releasing).
8. **What's an addition and what isn't** (the 0.x promise). 0.2.0 breaks nothing in the effect-author API. It's a minor release because three changes outside the promise need one.

   | Change | Under the promise? | Kind |
   | --- | --- | --- |
   | `trace`, `delta` and `label` | No: built-in effects | New exports: additions |
   | `labelBounds` on `MarkGeometry` and on the `describe` specs | Yes | An optional field: an addition. Code that builds a `MarkGeometry` needs no change, and an effect that ignores the field works as before |
   | `link()` and its types | No: a chart feature | New exports: additions |
   | `"linked"` in a hover event's `source` | No: `MarkEvents` is a chart type | A change: a page that switches on `source` exhaustively gets a type error. Listed under Changed, with what to write |
   | The trip cap | No: `travel`'s behaviour | A change: a trip along more than 1,440 px is shorter |
   | Dimming only the bodies | No: the charts' look | A change: labels stay at full strength while another mark is hovered |

   For later: the icon sets' fill rule and opacity would be optional `IconShape` fields, so additions. `"square"` caps and `"bevel"` joins would widen unions on `IconShape` and `Paint`, which code that reads them may not handle, so they'd be breaking: a minor release with a migration note. TypeScript 7 is an addition if the published types still work on TypeScript 5.4, and breaking if they don't, which `pack-check` would need to test.
9. **`trace({ color, width, opacity, duration })`**, a geometry effect.
   - It draws an overlay path along the walk, from its start to its end, in `"mark"` at 3 px and 50% opacity with round caps, over 500 ms base with `effect` timing, eased in and out. The stroke stays, and follows `onChange`.
   - **End state:** the whole stroke.
   - A mark with no length (a point) gets nothing. On a stack, it runs the whole walk.
   - A `duration`, `width` or `opacity` that isn't a finite number, or is negative, throws a `RangeError`, as `stagger`'s `delay` does, and so does an `opacity` over 1.
   - It isn't a preset.
10. **`delta({ value, format, color })`**, a data effect for the `update` slot.
    - The change is `value(data) − value(data.previous)`. `value` defaults to the last sample's value: a bar's total, a line's value at its revealed end, a slice's share. With no `previous`, or no change, it draws nothing.
    - **`format`** words the change. By default it's `Intl.NumberFormat` in the page's locale, with the sign shown and at most two decimals (`+2`, `-0.3`). A page with its own units passes its own, such as a donut's share as `+5%`.
    - The text is in the theme's `"text"`, never the series' colour. `color` takes another token.
    - It rises 8 px into place and fades in over 400 ms base, with `effect` timing, and stays until the next update clears it, following the mark.
    - **End state:** the text in place, so reduced motion shows the change.
11. **`label(text, { color })`**, a data effect, usually for `decorate`.
    - `text(data, mark)` returns the text, or `undefined` or `""` for none: last value minus first on a slope, a step's own signed value, or a field such as `vsLastMonth`. It's typed by the rows it reads, as `defineDataEffect<D>` is, so a `label` for one kind of row is a type error on a chart of another.
    - It rises into place as `delta` does, then follows every change, with its text worked out again from the new data.
    - **End state:** the text in place.
    - On a line chart, `decorate` runs on the points too, so a label meant for the line goes in `only()` with a filter on the mark's length or key. api.md's example shows it.
    - `delta` and `label` share one internal helper for placing and rising, `src/effects/caption.ts`.
12. **`labelBounds`** (decision 4).
    - `readonly labelBounds?: readonly Rect[]`: the boxes of the text the chart draws for this mark, in the mark's coordinates. A bar's are its category and value labels, a slice's its label outside the ring, and a line's its end label. Points and segments have none.
    - The `describe` specs take it and pass it through, so a page that describes host marks can give it. `expressive()` keeps it from a `geometry` the page gives, and otherwise leaves it unset.
    - **Placing text past them.** From `end`, along the walk's heading: 10 px past the end, or 6 px past the farthest box the heading meets, whichever is further. The anchor is `"start"` or `"end"` by the heading, as in the sketch, and `"middle"` within 45° of vertical, so a column's text sits centred above its value.
    - **The chart's edge.** Text isn't measured (the drawing API is renderer-neutral), so it can pass the chart's edge. The `<svg>` is `overflow: visible`, so it's drawn, but at 320 px it could make the page scroll sideways. Step 1 measures that on our charts, and step 5's 320 px check covers the demo.
13. **`link(sources, { by, effects })`** (decision 3).
    - `sources` are chart handles (bar, donut and line) and attachments (`expressive()`, `fromVegaView()`). It returns `{ destroy() }`, and lives in `src/charts/link.ts`, exported from the main entry.
    - **The linking value.** By default, a mark's last sample's `at` if it has one (a line point's x), else its key (a bar's or a slice's category, unless the page keys it otherwise). Values are compared as strings, a `Date` by its ISO string, as keys are. `by(event)` gives it instead, for example `(event) => event.data.datum.week`, typed by the sources' rows.
    - **What happens.** When a source is hovered by the pointer, touch or the keyboard, every other source hovers its targets with that value: a line chart its x, a bar chart its bar. They fire `hover` with `source: "linked"`, and `leave` when the origin leaves. A source with no match does nothing.
    - **One hover a link.** The newest hover anywhere in it is the one shown. Escape or `leave()` on the origin ends them all. A source mid-change holds its linked hover and replays it, as for any hover.
    - **Its limits.** A source can be in one link at a time: a second throws a `TypeError`. A destroyed source drops out. A chart switch can't be linked yet (backlog).
    - **Inside.** Each chart and attachment registers its hover with the link module when it's made, in a `WeakMap` keyed by its handle, so `link()` can hover given keys without focus. Nothing new is public on the handles.
14. **The trip cap.** A trip lasts at most 4 s base, after the gait's pace, so past 1,440 px at pace 1 the icon goes faster, not longer. With `stagger`'s longest spread (500 ms) in front, it still ends within WCAG 2.2.2's 5 s. Analysis and Off scale it as before. The stress page keeps its `riding()`.
15. **Readable dimming.** Hover dims the other marks' bodies, not their labels, so every label keeps 4.5:1. `--ec-dim-opacity` keeps its default, 0.3. `expressive()`'s `dim` already dims only the host's mark elements, so it doesn't change. An effect's `opacity` on a dimmed body still multiplies with the dimming. Every hover baseline is made again in Docker and shown to you, and the audit's 1.4.3 judgement call becomes a pass.
16. **The rest.**
    - **The guide's examples stay.** `trace` and `delta` in `docs/sketches/examples/effects/` stay the effects guide's worked examples, and the guide says they're smaller versions of the built-ins. `src/effects-guide.test.ts` keeps checking them.
    - **Accessibility.** `delta` and `label` draw in the overlay, which screen readers don't read, so a page that relies on them says the same in its table or its announcement. api.md says so, and the demo does both. Linked hover is visual only.
    - **Docs.** Each step adds its exports to api.md (`src/api-docs.test.ts` fails otherwise), its sections to architecture.md, and its entries to CHANGELOG, under a new `## Unreleased` above 0.1.0 with Added and Changed lists. Each Changed entry says what to write instead, as a migration note would.
    - **Sizes.** A step that takes a set past its budget raises the budget in the same PR and says why (CONTRIBUTING's Bundle size). The line page's set has 0.9 KB of room.
    - **The release** goes as CONTRIBUTING's Releasing says, through trusted publishing. Nothing is published, tagged or released without your go-ahead in that session.

Each step names the files it owns, so steps in the same wave can run in parallel sessions. Files shared by several steps get small edits only, and whichever step lands second merges main first: `package.json`, `src/index.ts`, `src/effects/index.ts`, `src/charts/index.ts`, `src/charts/types.ts`, `src/effects/conformance.test.ts`, `src/conformance.test.ts`, `scripts/size-budget.json`, `src/charts/README.md`, `src/effects/README.md`, `docs/architecture.md`, `docs/api.md`, `docs/effects-guide.md`, `README.md`, `CHANGELOG.md` and this plan. The first step to land adds CHANGELOG's Unreleased.

Each step's session reads the hand-over notes in its notes folder first, `plan-0-2.md` from planning among them, and writes its own there: commits, files, decisions beyond the brief, where the plan and the code differ, and follow-ups.

**Wave 1** (parallel):

1. ✅ **Text clear of the marks' own labels: `labelBounds`, `delta` and `label`** (decisions 4 and 10–12). In two PRs.
   - **The contract and the charts** (the first PR). Owns `labelBounds` in `src/core/contracts/geometry.ts` and the `describe` specs (`src/core/geometry/describe/`); the boxes in `bar-layout.ts`, `donut-layout.ts` and `line-layout.ts`, with small edits in `bar.ts`, `donut.ts` and `line.ts`; and `expressive()` keeping a `geometry`'s field.
     - Tests: each chart's marks have boxes that hold their labels' text as drawn, after a transition and a resize too; a stack's segments and a line's points have none; `checkEffect` on every source passes unchanged.
     - **Done when** every existing test and baseline passes unchanged.
     - **Built** (24 October 2026) as decisions 4 and 12 describe ([architecture.md](architecture.md#the-marks-own-labels)):
       - **The contract.** `MarkGeometry.labelBounds?: readonly Rect[]`. All four `describe` specs take it and pass it through as given; a bar's segments get none. A box with a coordinate that isn't finite, or a negative size, throws a `RangeError` that names the builder and the field.
       - **The boxes.** `textBox()` in `src/charts/render/text.ts` boxes a label as its layout places it: its measured width and 0.16 em more at either side, from 1.05 em above its baseline to 0.25 em below. In Chrome a box then holds the label's `getBBox()` with Segoe UI, Arial, Georgia, Verdana and Consolas (156 labels checked); a Times New Roman "ff" reaches 0.8 px past. Digits are measured as 0s (chart text has tabular digits), so a label that counts while a change plays is measured once per shape: no frame of a change reads layout.
       - **The charts.** `placeRow` gives a bar its category and value labels' boxes. `placeLabels` now runs before `placeSlice`, which gives a slice its label's two lines, or none when the label is dropped. `placeLines` now places the end labels itself and gives each line its own, or none for an empty one; with `labels: false` a line has no field. So each mark's runs get its boxes before they hear of a change. Points and segments have none.
       - **Following.** A mark whose boxes moved counts as changed, in the charts and in `expressive()`, which keeps the boxes a page's `geometry` gives. So an effect hears `onChange` when only a mark's labels move.
       - **Tests.** `src/charts/label-bounds.test.ts` (13): every chart's boxes hold its labels as drawn (bars, negative bars and columns either way, a stack, slices, a dropped label, lines, an empty end label, `labels: false`) at rest, in every frame of a change, after a reveal and after a resize; a decoration hears the boxes move, and a line's when only its label went; `expressive()` keeps a page's boxes and follows them on `refresh()`. `describe/label-bounds.test.ts` (3) checks the builders. Every existing test passes unchanged, `checkEffect` on every source too, and so does every visual test in Docker against the baselines (run in parts: Docker, shared with other runs, ran out of memory, so the failures were run again with 3 workers).
       - **Cost.** Boxing a bar's two labels takes about 0.4 µs each a frame in Chrome, and checking them four comparisons; the first version built four error messages per box every frame, which showed in a 100-bar update.
       - **Sizes** (gzip): `barChart` 28.5 KB of 30.5 and the line page's set 34.4 of 35, 0.3 more each, before steps 2 and 4 merged.
   - **The effects** (the second PR). Owns `src/effects/delta.ts`, `label.ts` and `caption.ts` (new), with their tests, exports and rows in both conformance sweeps.
     - Tests: text past each kind of label (bars, negative bars, columns, slices, a line's end), and 10 px past the end on host marks; the rise, the end state and Off; `value` and `format`; no change, no `previous`, and a stack; `label` following a change with new text; `label`'s row type checked; and how far past the chart's edge the text reaches at 320 px.
     - **Built** (24 October 2026) as decisions 10–12 describe, with the placement below ([architecture.md](architecture.md#delta-and-label)):
       - **`delta({ value, format, color })`** and **`label(text, { color })`** in `src/effects/delta.ts` and `label.ts`, exported from the main entry with `DeltaOptions` and `LabelOptions`. Both draw through `src/effects/caption.ts`: one overlay text, in `"text"` by default, rising 8 px into place and fading in over 400 ms base with `effect` timing, then following `onChange`. `delta` words its change once; `label` calls `text(data, mark)` again on each change, not each frame. Their end state is the text in place.
       - **`delta`'s defaults.** The last sample's value; `Intl.NumberFormat` in the page's locale with `signDisplay: "always"` and at most two decimals. No `previous`, a change that isn't finite, or one within 1e-9 of the values (float noise) draws nothing, and so does a `format` that gives `""`.
       - **Tests.** `caption.test.ts` (8): placement past the end and past labels, the 6 px band, slanted walks, every anchor, a slice with and without labels. `delta.test.ts` and `label.test.ts`: the rise, the end state, Off, Analysis, `value`, `format`, `color`, no change, no `previous`, float noise, a stack, following each fixture as it moves, `label`'s new text on a change and its row type (a `@ts-expect-error`), `checkEffect`, and their errors. `src/captions.test.ts` (9), on real marks: text past a bar's value label, a negative bar's name, a column's and a negative column's labels, outside a slice's label, past a line's end label, with `only()` keeping it off the points; 10 px past the end on host marks; and how far past the chart's edge it reaches at 320 px. Both conformance sweeps have rows for `delta` (with values before an update) and `label`, and every source checks that their text lands outside each mark's labels. 1,765 tests in all, 74 more than the first PR.
       - **At 320 px** (Chrome, a bar at the end of its scale): a bar's text reaches 19.7 px past the right edge, the tallest column's 17.6 px above the top, a negative bar's 20 px past the left; negative columns, lines and slices stay inside. architecture.md says so, and that a page leaves that room.
       - **Sizes** (gzip): everything 68.1 KB of 69 (1.0 more) and the script-tag bundle 74.4 of 75.5; the sets that don't import them are unchanged. No budget changes.
     - **Decisions beyond the plan:**
       - **Slices go past their label** (your decision, 24 October 2026). A slice's heading at its end runs along the ring, so decision 12's rule put its text on the ring, over the next slice. When the heading meets none of a mark's labels but it has some, the text goes up from the mark's centre, 6 px past the farthest of them that way meets: outward, past a slice's label. Bars, columns, lines and host marks don't change.
       - **"Meets" means within 6 px.** A line whose last leg climbed just past its end label put the text on the label: the heading's ray has no height, the text does. So the heading meets a label it passes within 6 px of, and the text goes 6 px past it, the same as before head-on.
       - **The baseline** drops below the placed point by 0.36 em read sideways (so "20 +2" share a baseline), none read upwards, and 0.8 em read downwards, so a negative column's text hangs below its name instead of standing on it. The rise goes across the way the text was placed, as the sketch's did, so it never crosses the labels it's placed past.
       - **Negative bars** keep decision 12's rule: their heading meets the value label and then the name, so the text goes past the name, past the chart's left edge. No spot along the heading has room.
     - **From review** (Codex, on #74 and #75):
       - **A part-way reveal's end labels** were worded unrounded at rest ("2.5 goals" after a resize, "3 goals" before it), since the first PR placed the resting labels with each value as it is. They're rounded to the layout's decimals again, as before the first PR.
       - **A row that changed alone.** A bar or a slice told its runs only when its geometry moved, so a `label` from a field the chart doesn't plot kept its old text. Now a new row counts as a change too, as it already did on a line.
   - Docs: architecture.md (Mark geometry, Effects), the effects guide (The mark, and the worked examples), api.md, README's list, CHANGELOG, and the ideas doc's pointer to the sketches.
2. ✅ **`trace`, and `travel`'s trip cap** (decisions 5, 9 and 14). Owns `src/effects/trace.ts` (new) with its tests, export and conformance rows, and the trip's duration in `src/effects/travel.ts` with its tests.
   - Tests: `trace` on every kind of mark and source, following a change, and its options and their `RangeError`s; trips of 1,000, 1,440 and 10,000 px, with each gait's pace.
   - **Done when** every existing test and baseline passes unchanged. No demo walk should be longer than 1,440 px; the step checks.
   - Docs: architecture.md (trace, and travel's "How long"), api.md, the effects guide's worked examples, README, CHANGELOG (`trace` under Added, the cap under Changed).
   - **Built** (24 October 2026) as decisions 5, 9 and 14 describe ([architecture.md](architecture.md#trace)):
     - **`trace({ color, width, opacity, duration })`** in `src/effects/trace.ts`, exported from the main entry. One overlay path, `mark.slice(0, p)`, in `"mark"` at 3 px and 50% with round caps, drawn in over 500 ms base with `effect` timing and `easeInOutCubic`. It follows `onChange` and keeps its progress, and never touches `ctx.mark`. Its end state is the whole stroke.
     - **The cap** in `src/effects/travel.ts`: `min(4 s, max(260 ms, distance ÷ 360 px/s) × pace)`. A step reaches it at about 1,250 px.
     - **Tests.** `trace.test.ts` (31): the stroke's progress, paint and end, each fixture, a stack's whole walk, a point, following a change mid-run and after, a walk that vanishes and comes back, abort and clear, Analysis, Off, a page's scaling, and every option's `RangeError`. `travel.test.ts` adds 13: trips of 1,000, 1,440 and 10,000 px rolling, sliding, stepping and at paces 0.5 and 2, each still ending at the walk's end; Analysis (300 ms) and Off; and a trip behind `stagger`'s 500 ms spread ending at 4.5 s. Both conformance sweeps have `trace` rows (with options, and beside a rolling ball), and `src/conformance.test.ts` checks that `trace` draws the whole walk on every source's marks and nothing on a line chart's points. 1,655 tests in all, 71 more than "Where M7 starts" gives.
     - **The demo walks.** Every page sizes its charts to a capped column, so a walk can't grow with the window. Measured in the browser at 1,920 px and at 859 px, just under the pages' two-column breakpoint, where a chart is widest: the longest is the D3 line on `line.html`, 780 px. Bars reach 482 px, and a slice's walk is under 680 px. `stress.html` keeps `riding()`. So the cap changes no demo trip, and no baseline could change: no page draws `trace`.
     - **Sizes** (gzip): everything 65.5 KB of 69 (0.3 more) and the script-tag bundle 71.7 of 75.5 (0.3 more). The sets that don't import `trace` are unchanged: `barChart` 28.2 and the line page's 34.1. No budget changes.
   - **Decisions beyond the plan:**
     - **`color` is checked too:** a non-empty string, as `flash`, `pulse` and `threshold` check theirs. Width, opacity and duration may be 0; a duration of 0 draws at once.
     - **"No length" means under 0.5 px,** as for `travel` and `threshold`. A run on such a mark finishes at once at its end state, so a line revealed from one point gets the whole stroke when it grows a walk. A walk that shrinks under 0.5 px loses its path.
     - **The path is made when the run starts,** as `slice(0, 0)`, a lone moveto that SVG doesn't stroke, even with round caps. Made on the first frame, it stacked above a ball that `parallel(trace(), travel(ball))` made first, while `end()` stacked it below, and `checkEffect` failed.
     - **`demo/stress.ts`'s comment on `riding()`** gave the uncapped 26 s and 167 s and said the backlog had it. It now gives the capped reason; the code is unchanged.
3. ✅ **Readable dimming** (decision 15). Owns the dimming rule in `src/charts/render/theme.ts` with `mark-style.test.ts`, the hover baselines it changes, a check in `tests/visual/a11y.spec.ts` that labels keep 4.5:1 while another mark is hovered, and the audit's 1.4.3 rows in `docs/a11y-audit.md`.
   - The baselines are made again in Docker, and you see each one before it's committed.
   - Docs: architecture.md (hover dimming), api.md (`--ec-dim-opacity`), CHANGELOG (Changed).
   - **Built** (24 October 2026) as decision 15 describes ([architecture.md](architecture.md#rendering)). Only the stylesheet changed in `src`:
     - **The rule.** Hover dims the parts in each other mark's body (`.ec-mark:not(.ec-hot) > .ec-body > *`: its segments or slice, and a halo), not the mark. Not the body itself either: an effect's `opacity` is an attribute there, which a stylesheet rule would override. On the parts, the two multiply. Each part fades on its own, so a halo behind a dimmed bar shows faintly through it. The parts' transitions fade opacity over the hover duration, as the mark's did.
     - **Tests.** `mark-style.test.ts` hovers a stacked bar chart and a donut in jsdom and reads the opacity the stylesheet gives each part, label and body, with an effect's opacity on a dimmed body (3 new tests). The visual suite's new check, "contrast on hover", hovers each library chart on every demo page, in light and dark, and measures every text in it against its card, at the opacity it's drawn with. On the old rule it failed on four pages at 2.52:1 in dark; now it passes in the three browsers.
     - **Baselines.** 19 made again in Docker and shown to you before they were committed: `story-chart-rolling`, `-walking` and `-rest`, `mode-presentation-chart`, `mode-analysis-chart`, `mode-off-chart`, `reduced-story-chart`, `focus-chart-light` and `-dark`, `tooltip-legend-light` and `-dark`, `donut-ball-donut-rolling` and `-rest`, `donut-wiggle-peak`, `donut-pulse-half`, `donut-tooltip`, `donut-focus-donut-light` and `-dark`, and `morph-focus-columns`. Every other baseline is unchanged.
     - **Sizes** (gzip): the longer rules add 0.1 KB at most, measured on main with steps 2 and 4, to `barChart`. After steps 1, 2 and 4, `barChart` is 28.8 of 30.5, the line page's set 34.7 of 35, and everything 67.2 of 69. No budget changes.
4. ✅ **Linked hover** (decisions 3 and 13). Owns `src/charts/link.ts` (new) with its tests, the linked paths in `src/charts/shell/hover.ts` and in `expressive()`'s hover, the registering in each chart and attachment (small edits), `"linked"` in `MarkEvents`, and `link`'s export.
   - Tests: bars and a line linked by matchweek, both ways; a D3 attachment and a Vega one; the keyboard, Escape and `leave()`; `by` and `effects: false`; a source mid-update; a destroyed source; a second link throwing; and no tooltip, focus or announcement on a linked chart.
   - Docs: architecture.md (a Linked hover section), api.md, README, CHANGELOG (`link` under Added, the `source` under Changed), and the backlog's stale `pointer: "x"`.
   - **Built** (24 October 2026) as decisions 3 and 13 describe ([architecture.md](architecture.md#linked-hover)):
     - **`link(sources, { by, effects })`** in `src/charts/link.ts`, exported from the main entry with `Link`, `LinkOptions` and `LinkSource`. It returns `{ destroy() }`. `link()` infers the sources' rows, so `by`'s event is typed by them, a union when they differ.
     - **The register.** A `WeakMap` from each handle to a port: the source's live targets with their marks, hovering given targets as linked, ending a linked hover, and the source's own `leave()`. The port tells its link when the source's own hover starts and ends, when Escape ends a linked one, and when it's destroyed. `bar.ts`, `donut.ts` and `line.ts` register `chartHover`'s port, `expressive()` its own, and `fromVegaView()`'s handle shares its attachment's.
     - **The linked paths.** `shell/hover.ts` and `expressive()` hover a list of targets as `"linked"`: the emphasis, the dimming and, unless `effects: false`, the runner's hover, with batched events, but no tooltip, Escape listener, ring or focus. The shell's `key` is the chart's own hover's only, so the charts draw no tooltip or crosshair for a link's without changing where they read it. The pointer's leave, focus and blur leave a linked hover alone, and the pointer or a key press on a linked target starts the chart's own.
     - **`"linked"`** in `MarkEvents`' hover `source`. `expressive()` reads its hover sources from there now.
     - **Tests.** `src/charts/link.test.ts` (20), with real D3 and Vega: columns and a line by matchweek both ways, with their hover effects; no tooltip, crosshair, ring, focus or announcement on the linked chart; the keyboard, Escape on the origin and anywhere, and the origin's `leave()`; the newest hover winning over a held focus, and Escape on the linked chart ending it at the origin; a linked chart's own `leave()`; a hover listener that ends the hover it hears, or starts another; no match past a line's reveal; `by` (keys that don't match, several targets in one batch, the rows' type) and a time axis by ISO string; `effects: false`; a chart mid-update; a destroyed source and a destroyed origin; the `TypeError`s (a second link, the same source twice, a `chartSwitch`, bad options); `destroy()`; a throwing `by`; a donut's slices; D3 columns both ways, with `dim`, the keyboard and Escape; an attachment's refresh dropping a linked mark; and a Vega chart both ways. 1,675 tests in all, 20 more than after step 2.
     - **Sizes** (gzip, with step 2 merged): the line page's set 34.4 KB of 35 (0.3 more), `barChart` 28.4 of 30.5 (0.2 more), everything 66.6 of 69 (1.1 more, `link()` itself only here) and the script-tag bundle 72.8 of 75.5 (1.1 more). No budget changes.
   - **Decisions beyond the plan:**
     - **A value several targets share hovers them all,** in one batch in each source, so `by` can link a team's slice with its players' bars. Decision 13 says "its targets", and nothing limits it to one.
     - **A source with no match ends what it showed,** its own hover or an older linked one, since a link shows one hover. It hovers nothing new.
     - **Escape with focus on a source that shows a linked hover** ends the link's hover where it started, so the origin's tooltip goes too (WCAG 1.4.13). `leave()` on a linked source ends only its own.
     - **`effects: false` still fires the linked marks' `hover` and `leave` events.** Only the hover effect doesn't play.
     - **A linked line chart draws no crosshair.** Its points' emphasis shows the x, and a link can hover several x's.
     - **`by(event)` is given the mark and its data**, `Pick<MarkEvent<D>, "mark" | "data">`, not a whole hover event: it's called on the other sources' marks too, which have no event. A throw is reported and links nothing, as `markLabel`'s is; `undefined`, `null` and an invalid `Date` link nothing.
     - **A hover already playing when `link()` is made** isn't shown in the others; the link starts with the next one.

**Wave 2** (after wave 1 lands):

5. ✅ **`demo/season.html`, its screenshots and listening script H.** Owns `demo/season.html` and `demo/season.ts`, the link in `demo/index.html`, `tests/visual/season.spec.ts` with its `season-` baselines, the page in `a11y.spec.ts`'s list, a table for it in `docs/a11y-audit.md`, and section H of `docs/a11y-check.md`.
   - **The page,** with the motion switch and "Things to try", in the voice of the other demo pages:
     - **Linked by matchweek:** a `barChart` of goals per matchweek, the goals vs xG `lineChart`, and D3 columns of shots through `expressive()`, in one `link()`, with a toggle for `effects: false`.
     - **Since the last matchweek:** the players' bars with `update: parallel(flash(), delta())`, Play next matchweek, a Change column in the table, and an announcement that says each change.
     - **The season so far:** a D3 slope chart of each player's goals at matchweek 1 and now, with `decorate: label(...)` giving the change and `hover: trace()`.
     - Nothing plays by itself.
   - **Screenshots,** all `season-`, made in Docker: the page in light and dark, a linked hover, the bars after a matchweek, and the slope chart mid-trace. Reduced motion and Off are checked in the DOM: the deltas and labels show at once, and the trace is whole.
   - **Script H**, for NVDA + Chrome: a linked hover says nothing and moves no focus, and the changes are in the table and the announcement. You run it.
   - **The walk:** you look at the page in the browser, at 320 px too. A fifth GIF for README (`npm run media`) is optional.
   - **Built** (26 October 2026), on main after wave 1 (`da8c458`). No library code changed:
     - **The page,** `demo/season.html` and `demo/season.ts`, with its D3 charts in `demo/d3-columns.ts` and `demo/d3-slope.ts` (new, beside the step's files, as `d3-line.ts` is the line page's). A seeded season of 38 matchweeks for Harbor City FC's eight scorers: the page opens after matchweek 24, and Play next matchweek moves every chart on a week, up to 38.
       - **Linked by matchweek:** goals per matchweek on `barChart`, with `hover: travel(soccerBall)`; shots per matchweek on D3 columns through `expressive()`, with `hover: "pulse"`; and goals vs xG on `lineChart`, with `hover: "pulse"`. One `link()` with no `by`: the columns are keyed by their week, and the line's points have it as their x. The Linked marks toggle (Full hover, Emphasis only) links them again with `effects: false`.
       - **Since the last matchweek:** the players' bars with `flash()` and `delta()` in the `update` slot, Change and Since matchweek 1 columns in the table, and an announcement with each player's change and total ("Matchweek 25: Okafor +1, 15 goals; Lindqvist +1, 7 goals.").
       - **The season so far:** the D3 slope chart, each line from matchweek 1 to now and then on a short leader to the player's name, with `decorate: label(...)` giving the change since matchweek 1, and `hover: trace(...)`. The page gives each line its name's box as `labelBounds`, through `describe.line`, so the change sits past the name.
     - **Room at 320 px.** The players' chart leaves 28 px beside itself, where a bar at the end of its scale puts its change; at 320 px Okafor's "+1" reaches 20 px past the chart's edge. The slope chart leaves room past its longest name.
     - **Tests.** `tests/visual/season.spec.ts` (13): the five `season-` screenshots, made in Docker (the page in light and dark, a linked hover from the line, the bars after a matchweek, the slope chart mid-trace), and DOM checks of what a linked chart shows and doesn't (no tooltip, crosshair, ring or focus, and labels at full strength while its columns dim), Emphasis only, the keyboard and Escape across the link, each matchweek's changes in the overlay, the table and the announcement, a matchweek played mid-change, the last matchweek, reduced motion and Off, and the changes inside their cards at 320 px. The page is in `a11y.spec.ts`'s list, with its tab stops and its three library charts. In Docker, the whole visual suite passes in the three browsers (487 tests, 53 skipped, none failed; Chromium 179, Firefox and WebKit 154 each), and no other baseline changed. 1,771 unit tests, the build and the size check pass, with every set's size unchanged.
     - **Docs.** Section H in [a11y-check.md](a11y-check.md#h-the-season-page-linked-hover-and-change-labels), a table for the page in [a11y-audit.md](a11y-audit.md#seasonhtml), the demo index's link, and the page in README's and CONTRIBUTING's lists.
     - **Script H passed** with NVDA + Chrome (26 October 2026): linked hover said nothing and moved no focus, and the changes were heard in the announcement, the table and the slope lines' names ([Results](a11y-check.md#results)).
     - **The walk** (26 October 2026): you looked at the page in the browser, at full width and at 320 px, and at the five `season-` screenshots, and found nothing to change. No fifth GIF for now, and `arrow-on-hover.gif` stays as it is.
   - **Decisions beyond the plan:**
     - **Each matchweek shows only its own changes.** A `delta` stays until its mark's next update (decision 10), so a player who didn't score kept the last matchweek's "+1", while the table said 0. The page empties the `update` slot before each matchweek (`update({ on: {} })`), then updates the data with the slot filled again. In the backlog.
     - **`delta` reads the rows** (`value: (data) => data.datum.goals`). With the default, the last sample, a matchweek played while the last one's bars were still moving counted from where they were: "+1.88". In the backlog.
     - **The trace is 8 px wide.** Its default 3 px barely shows over a 2.25 px line.
     - **The slope chart's names are its own labels.** Each line's end label is the player's name alone, so the change past it is the one number there. Two players scored at matchweek 1, so most lines start at 0 and their change is their total: the plan's "goals at matchweek 1 and now", as written.
     - **The page sizes the slope chart's overlay text** (12.5 px, 600, as our charts'): the stylesheet sizes `.ec-text` only inside our charts, so on a host chart it took the page's 15 px. In the backlog.
     - **Text spacing.** The slope chart measures its longest name when it's drawn, and a viewer's own spacing makes the names longer, so the page draws it again when the names' `<g>` changes size (a `ResizeObserver`). Without it, the spacing check found each change on its name.
     - **The goals chart's labels.** The page shows the week under the first column and every fifth, and below 600 px wide no values above them: past about 30 columns they'd overlap (the backlog's thinning).
     - **The Change column at load** has matchweek 24's changes. The overlay draws them only once a matchweek is played, since `delta` draws on updates.

**Wave 3:**

6. ✅ **Publish 0.2.0** (decisions 6 and 7). Owns the version (`package.json`, the lockfile, `VERSION`), CHANGELOG's 0.2.0 entry, README's status, `release.yml`'s comment, CONTRIBUTING's Releasing, and this plan's status line and M7's ✅.
   - **The dry run:** `typecheck`, `test`, `build`, the size check, `pack-check`, `npm pack` (its list and sizes shown to you) and `npm publish --dry-run`. The PR has its results.
   - **You,** within 2 days before the release, add the trusted publisher on npmjs.com: GitHub Actions, user `Deaversbp`, repository `expressive-charts`, workflow `release.yml`, with direct `npm publish` allowed.
   - **Then, on your go-ahead in that session:** the `v0.2.0` release is created, and the workflow publishes it with provenance, through trusted publishing.
   - **After:** check npm (the version, README, provenance), install 0.2.0 in a fresh project, and check jsDelivr. You set the package's publishing access to require 2FA and disallow tokens. Deprecating `0.0.0-stage` is optional, with your npm account.
   - **If npm refuses a direct publish,** the fallback is staging, as CONTRIBUTING says: the workflow's last step changed in its own PR, with a check for npm 11.15 or newer, and your approval with 2FA.
   - **Built** (26 October 2026): [0.2.0 is on npm](https://www.npmjs.com/package/expressive-charts/v/0.2.0) through trusted publishing with provenance, and [its release](https://github.com/Deaversbp/expressive-charts/releases/tag/v0.2.0) is on GitHub. The fallback wasn't needed.
     - **The release PR** (#79): 0.2.0 in `package.json`, the lockfile and `VERSION`; CHANGELOG's 0.2.0 entry, the Unreleased lists under a short summary, each Changed entry keeping what to write instead; README's status; `release.yml`'s comments; and CONTRIBUTING's Releasing for trusted publishing, with 0.1.0's token in the past tense.
     - **Two more lines in README,** since npm's copy is fixed at publish: the script tag at `expressive-charts@0.2` (api.md's too), since `@0.1` keeps serving 0.1.x, which has none of M7; and the sizes as measured, a bar chart about 29 KB gzipped and everything 68 KB.
     - **The dry run** passed on `0e81dd7` with the PR: `typecheck`, 1,771 tests, the build, every size within its budget (`barChart` 28.9 KB, the line page's set 34.7, everything 68.1 and the script-tag bundle 74.5), `pack-check`, `npm pack` (35 files, the same as 0.1.0's, 1.3 MB packed and 4.9 MB unpacked, most of it source maps) and `npm publish --dry-run`.
     - **The workflow didn't change** (decision 7). Read in npm's own code (11.7 here, 11.19 in CI): npm trades GitHub's OIDC token for one of its own before it looks for credentials, and the publish step's empty `NODE_AUTH_TOKEN` counts as none. So with no secret, a publish that trusted publishing doesn't allow stops with `ENEEDAUTH` and publishes nothing.
     - **You** set up two-factor authentication on npm, with a security key, which npm asked for before it would save the trusted publisher. Then you added it: GitHub Actions, `Deaversbp/expressive-charts`, `release.yml`, no environment, with `npm publish` allowed.
     - **The release.** Main's CI was green on `21a24a1`. On your go-ahead, `v0.2.0` was created there at 20:23 UTC. Its first run passed every check, then stopped at the publish with `ENEEDAUTH`, publishing nothing: the trusted publisher was saved at 20:27, after the two-factor set-up, three minutes after the run tried it. Its failed job was run again on the same release, and published with provenance at 20:29 ([Sigstore's log](https://search.sigstore.dev/?logIndex=3496166767)).
     - **After.** npm shows 0.2.0 as `latest`, with README, its four GIFs, and "Built and signed on GitHub Actions" from `21a24a1` and `release.yml`. Its provenance is SLSA v1, from `refs/tags/v0.2.0`. A fresh project installs it with no dependencies, `npm audit signatures` verifies its registry signature and its attestation, and all three entries load as ES modules and as CommonJS, with the same names both ways, `VERSION` 0.2.0 and the stylesheet. jsDelivr serves the script tag at `expressive-charts@0.2`. No placeholder version came this time.
   - **Where the plan and npm differ:**
     - **Two-factor authentication first.** npm wouldn't save a trusted publisher until the account had two-factor authentication. It offered only a security key, which can be the computer's own sign-in, such as Windows Hello.
     - **The connection must be saved before the release's run.** One saved later doesn't help that run, which fails with `ENEEDAUTH`; running the failed job again publishes. CONTRIBUTING says so now.
     - **npm's form** has an optional label, and its allowed actions are "npm publish" and "npm dist-tag", both unticked to start with; `npm stage publish` is always allowed. The connection shows "Pending validation" until a publish uses it, with the time it expires.
   - **Then you** set the package's publishing access to "Require two-factor authentication and disallow bypass 2fa tokens", so no token can publish it. Deprecating `0.0.0-stage` is optional, and left for you.

**Done when:**
- **Effects.** `trace`, `delta` and `label` are built-ins, each passing `checkEffect` on every kind of mark and every conformance source, with end states that keep their information.
- **Labels.** Our charts' marks give `labelBounds`, and `delta` and `label` put their text past them.
- **Linked hover.** `link()` links our charts and attachments by a shared value, with `source: "linked"`, and no tooltip or focus on the linked charts.
- **The backlog's two.** `travel`'s trip lasts at most 4 s base, and hover dims bodies, not labels.
- **The demo.** `demo/season.html` shows all of it, with its screenshots, its place in the axe checks and the written audit, and script H passed with NVDA + Chrome.
- **Docs.** api.md, architecture.md, the effects guide, README and CHANGELOG cover every addition and change. The promise is unchanged except for `labelBounds`.
- **0.2.0 is on npm,** published through trusted publishing with provenance, with its CHANGELOG entry and its release on GitHub. This plan's status line says M7 is done.

**Status: complete (26 October 2026).** Every item on the list holds. Steps 1 to 5 built and checked the first six, and 0.2.0 is on npm through trusted publishing with provenance, with its release on GitHub (step 6).

### M8: A tooltip that can be hovered, change labels that hold up, and gaps in lines (0.3.0) ✅

The audit's one failing criterion fixed, the season page's workarounds made the library's own, lines that skip missing values, long axes, the icon sets' fills, TypeScript 7, and last, 0.3.0 on npm.

**Demo:** no new page. The line page gets a card with missing values, the season page loses its workarounds, the stress page shows its labels thinned and Page Up and Page Down, and every page's tooltip can be hovered.

**Where M8 starts** (checked against main at c3786fb while planning, 26 October 2026):

- **Already built.**
  - **0.2.0** is npm's `latest`, published through trusted publishing with provenance. 0.2.0's publish used the trusted publisher, so it doesn't expire, and the package requires two-factor authentication and disallows tokens. npm lists `0.0.0-stage`, `0.1.0` and `0.2.0`.
  - **Effects.** `travel`, `flash`, `wiggle`, `pulse`, `trace`, `threshold`, `delta`, `label` and `morph`, with `sequence`, `parallel`, `only` and `stagger`; and `link()` across charts and attachments.
  - **The tooltip** (`src/charts/tooltip.ts`) is an HTML box beside the hovered mark or the crosshair, never over the mark, with `pointer-events: none`. Pointer hover is `pointerHover` in `src/charts/interaction.ts`, shared by the charts and `expressive()`: `pointerover` and `pointerleave` on the `<svg>`. Escape anywhere ends a hover (the audit's fix 3). `expressive()` draws no tooltip, and a linked chart shows none. `tests/visual/a11y.spec.ts` has a "content on hover" check.
  - **The update slot** runs "until it re-triggers, or the mark exits" (architecture.md's slot table). An update starts runs only on the marks it changes. An update run's `data.previous` is the last data the runner saw for the key, which while a change plays is the values part way (`src/core/runner.ts`).
  - **Overlay text** is sized by `:where(.ec-chart .ec-value, .ec-chart .ec-text)` in `theme.ts`, so only inside our charts. An attachment's overlay is a `.ec-overlay` group on the host's `<svg>`.
  - **The keyboard** (`src/charts/keyboard.ts`, shared by the charts and `expressive()`): the arrows, Home, End and Escape.
  - **Bar labels.** Every bar draws its category and value labels, whatever its size. The line chart's axis and the donut's labels already make room: ticks are spaced, and a slice's label that would overlap is dropped.
  - **Lines.** `lineChart`'s `series` are fields of numbers (`NumericKey<D>`), and a value that isn't a finite number throws ("Lines can't skip a value yet"). A bar counts a missing value as 0, and a donut's `value` already takes `number | null | undefined`. `describe.line` takes at least one point, every one finite. `MarkGeometry`'s walk is continuous, and an open outline's `d` is the whole stroke. `expressive()` reads only `<rect>`s, so a page describes a D3 line with `describe.line`.
  - **Data.** A `Sample` has `t`, `value` and `at`. `threshold` interpolates a reference series between its samples.
  - **Testing.** `FixtureName` is `"bar" | "negative bar" | "column" | "stacked" | "short bar" | "slice" | "line" | "point"`, under the promise, and `checkEffect` runs an effect on every one.
  - **Icons.** `IconShape` has `d`, `fill`, `stroke`, `width`, `linecap` (`"butt"` or `"round"`), `linejoin` (`"miter"` or `"round"`) and `clip`. `iconFromSvg` drops fill rules, so an even-odd hole fills in, and opacity, square caps and bevel joins.
  - **TypeScript** is pinned at 5.9.3. npm's `latest` is 7.0.2, with 7.1 in beta.
    - 7.0.2's package has a native `tsc` but no compiler API: its main export is its version, and its API is under `unstable/`.
    - tsup 9 builds the declarations with its bundled rollup-plugin-dts, which needs the compiler API. When `typescript` has none, it loads `@typescript/typescript6` instead (6.0.2 on npm).
    - `pack-check` checks the packed types with the repository's TypeScript only, so README's "TypeScript 5.4 or newer" isn't tested.
  - **Sizes** (gzip, against their budgets, on `c3786fb`, the same code as 0.2.0): everything 68.1 KB of 69, `barChart` 28.9 of 30.5, the line page's set 34.7 of 35, the switch's set 38.5 of 41, `expressive` and `travel` 25.4 of 27, the script-tag bundle 74.5 of 75.5, and the stylesheet 2.3 of 2.5.
  - **Tests.** 1,771 unit tests in 96 files. The visual suite ran 487 tests in Docker at M7 step 5, in Chromium, Firefox and WebKit.
- **Gaps.**
  - **The tooltip can't be hovered** (WCAG 1.4.13): the audit's one fail, on every page with a library chart (finding 6). Moving the pointer onto it hovers whatever is under it, or nothing.
  - **The season page's workarounds** (M7 step 5):
    - it empties the `update` slot before each matchweek, since a `delta` stays until its own mark's next update;
    - it reads its rows for `delta`'s value, since the default counted from where a moving bar was ("+1.88");
    - it sizes the slope chart's overlay text itself;
    - it leaves 28 px beside the players' chart, since a bar's change reaches about 20 px past the chart at 320 px;
    - and it thins its goals chart's labels with CSS.
  - **Long axes.** Past about 40 bars, a bar chart's labels overlap. Ten years of days on the stress page is 3,653 presses of an arrow key.
  - **Missing values** throw on a line.
- **Out of date** (each fixed by the step named):
  - README's `arrow-on-hover.gif` shows hover before M7 step 3, with the other bars' labels dimmed (step 7).
  - a11y-audit.md's Browsers paragraph says "114 tests in each", an older count (step 7).
  - §10's open question 7 says TypeScript 7 comes after 0.1.0 (step 5).

**What M8 takes from the backlog, and what stays:**

| Item | Goes to |
| --- | --- |
| A tooltip that can be hovered | Decisions 4 and 9, step 1 |
| A change that outlives its update, `delta`'s default value mid-change, overlay text on host charts, and room for change labels | Decisions 6 and 10, step 2 |
| Line chart extras: gaps for missing values | Decisions 5 and 11–13, step 3 |
| More of the icon sets' SVG: the fill rule and opacity | Decision 14, step 4 |
| TypeScript 7 | Decisions 7 and 15, step 5 |
| Thinning a bar chart's labels, and larger steps on a long axis | Decision 16, step 6 |
| The icon sets' square caps and bevel joins | Stay: they'd widen unions under the promise |
| Change labels on a neighbour's label, a negative column's value label on its name, a line's `curve` and nearest-point hover, a written audit table for `stress.html`, VoiceOver + Safari, and the rest | Stay in the backlog |

When a step lands, it marks its backlog item as built in M8.

**Decided while planning M8 (26 October 2026):** decisions 1–7 are yours, and 8–17 follow from them and the code.

1. **M8 builds two things first:** a tooltip that can be hovered, then change labels that hold up, with the season page's workarounds made the library's own.
2. **Four backlog items join them:** gaps for missing values on a line, long axes (thinning a bar chart's labels, and Page Up and Page Down), the icon sets' fill rule and opacity, and TypeScript 7. Gaps are the largest, so they start in wave 1.
3. **One release, 0.3.0, when M8 is done.** Trusted publishing is set up, so it needs only your go-ahead.
4. **The tooltip holds while the pointer is on it.** It takes the pointer, and the hover stays while the pointer is on it; leaving it for a mark hovers that mark. It looks the same. The marks it covers are reached round it, since a mark's target is its whole row or column, or by keyboard.
5. **A line's gaps are on one walk.** One mark per series, as now. `MarkGeometry` gets an optional field, `gaps`. The walk runs straight across each gap, so `path` and `angle` work as before, and `slice()` and the stroke leave the gaps out. `travel` jumps across.
6. **A `delta` goes at its chart's next update.** An update ends the `update` runs of the marks it leaves alone.
7. **TypeScript 7 checks, TypeScript 6 builds the declarations.** `typescript` 7 runs `typecheck`, `@typescript/typescript6` is a dev dependency for tsup's declaration build, and `pack-check` also checks the packed types on TypeScript 5.4.
8. **What's an addition and what isn't** (the 0.x promise). 0.3.0 is a minor release. In the effect-author API, four changes are additions and one is a change, with a migration note.

   | Change | Under the promise? | Kind |
   | --- | --- | --- |
   | `gaps` on `MarkGeometry`, with `slice()` and an open outline's `d` leaving them out | Yes | An optional field: an addition. Code that builds a `MarkGeometry` needs no change, and no mark has gaps until a line skips a value. An effect that draws its own path from `path(t)` would draw across a gap, so the effects guide says to draw along a walk with `slice()` |
   | `gapBefore` on `Sample` | Yes | An optional field: an addition |
   | `breaks` on `LineSpec` | Yes | An optional field: an addition |
   | `fillRule` and `opacity` on `IconShape` | Yes | Optional fields: additions. `iconFromSvg` now keeps them, so an icon from an SVG with an even-odd hole or opacity draws as its SVG does: listed under Fixed |
   | `"gapped line"` in `FixtureName` and `fixtures` | Yes | A change: `checkEffect` runs every effect on it too, and code that maps every name (a `Record<FixtureName, …>`) needs one more entry. Listed under Changed, with what to write |
   | The tooltip held while the pointer is on it | No: the charts' behaviour | A fix: the pointer on the tooltip no longer hovers the mark under it |
   | `update` runs ending at the chart's next update | No: the runner's lifecycle | A change: an update effect that stays, a `delta` or one of your own, goes when its chart next updates. Listed under Changed: to keep something past that, put it in `decorate` |
   | `data.previous` from the last update's values | Its type is; the values the runner gives it aren't | A fix: when an update replaces one still moving, `previous` holds the values the last update gave, not the values part way |
   | Overlay text sized on attachments | No: the stylesheet | A change: `delta`'s and `label`'s text on an attachment is the charts' 12.5 px, not the page's size. Listed under Changed, with the CSS for the page's own |
   | `room` on `barChart` | No: a chart option | A new option: an addition |
   | Missing values on `lineChart` | No: a chart | Wider types: an addition. A missing value no longer throws |
   | Thinned bar labels | No: the charts' look | A change: labels that would overlap are thinned |
   | Page Up and Page Down | No: the keyboard | An addition |
   | TypeScript 7 | The published types | Nothing changes while the packed types still check on TypeScript 5.4, which `pack-check` now tests. A type that doesn't is fixed before the release |

   For later: square caps and bevel joins would widen unions on `IconShape` and `Paint`, so they'd be breaking.
9. **The tooltip** (decision 4).
   - It takes the pointer (`pointer-events: auto`) while it shows. `pointerHover` counts the pointer on the tooltip as on the hovered target: leaving the `<svg>` for the tooltip keeps the hover, leaving the tooltip for a mark hovers that mark, and leaving it for anything else ends the hover, as leaving the chart does now.
   - A line chart's crosshair keeps its x the same way. A touch tap on the tooltip keeps the hover: it isn't a tap elsewhere.
   - Escape and `leave()` end it as now. Its text can be selected. A linked chart shows no tooltip, so links don't change.
   - If a change moves the tooltip from under the pointer, the pointer hovers whatever it's on then.
   - It looks the same, so no screenshot should change. The audit's finding 6 is fixed, and its 1.4.13 rows pass.
10. **Change labels that hold up** (decision 6, and the season page's other workarounds).
    - **The update slot.** When an update starts, the runner ends the `update` runs of the marks it doesn't change, as a re-trigger would, before it starts the changed marks' runs.
      - An update is a chart's `update()` with `data`, or an attachment's `refresh()` that finds a new row, a new value, or a mark entering or leaving. So a Vega render that changes nothing keeps them. An `update({ on })` alone isn't one.
      - A `flash` still playing from the update before, on a mark this one leaves alone, stops there.
      - The slot table's "Until" becomes "it re-triggers, the chart's next update, or the mark exits".
    - **The values before.** The runner keeps, for each key, the data its last `enter` or `update` gave, beside the latest frame's, and an update run's `data.previous` is that. So an update that replaces one still moving says "+1" with `delta`'s default `value`, not "+1.88". The `previous` geometry, and an `update` event's `from`, stay the geometry on screen, which a transition starts from.
    - **Overlay text on attachments.** The stylesheet sizes `.ec-overlay .ec-text` as it sizes `.ec-chart .ec-text`: 12.5 px, 600, with tabular digits, in the theme's text colour, which is the size `caption.ts` places for. It stays in `:where()`, so a page's own CSS wins.
    - **Room.** `barChart({ room })`: px the layout keeps clear past the value labels at each end of the value axis that bars reach, for text an effect draws there.
      - Default 0, so nothing moves and no screenshot changes. The chart doesn't know which effect it's for (CLAUDE.md rule 2).
      - At 320 px a bar's `delta` reached 19.7 px past the chart's right edge, a column's 17.6 px above its top, and a negative bar's 20 px past its left edge (M7 step 1). The season page leaves 28 px, so `room: 28` keeps it inside.
      - Lines and slices stayed inside, so they get none for now.
11. **Gaps in the contract** (decision 5).
    - `readonly gaps?: readonly (readonly [from: number, to: number])[]`: the stretches of the walk with no data, as values of t, in order, apart and inside (0, 1). Unset means none.
    - The walk runs straight across each gap, from the last value before it to the first after, so `start`, `end`, `length`, `path(t)` and `angle(t)` work as on any walk. `slice(t0, t1)` leaves the gaps out, with a moveto across each, and so does an open outline's `d`. `outline.sample(n)` still runs along the whole walk.
    - Gaps are only between values. A missing value before a line's first or after its last isn't on its walk.
    - **`describe.line({ breaks })`:** the indices of the points that start a new run, so there's a gap from `points[i - 1]` to `points[i]`. Each is a whole number from 1 to the last index, in order, with no repeats; anything else throws a `RangeError` naming the field. A page describes a D3 line drawn with `.defined()` by its defined points and where they break.
    - **`Sample.gapBefore`:** `true` on the first sample after a gap, so a data effect doesn't join it to the one before. `samplesAlong()` sets it from the mark's `gaps`.
    - **The fixture.** `"gapped line"`, the line fixture with a gap, in `fixtures` and `movedFixtures`, so `checkEffect` runs every effect on it.
12. **Effects on a gap.**
    - `trace`, `pulse`, `flash` and `wiggle` draw with `slice()` or the outline, so they skip gaps unchanged.
    - `threshold` draws with `slice()` too, and doesn't interpolate across a `gapBefore`, in the mark's samples or the reference's. Where either has no value, nothing is coloured.
    - `travel` jumps: its icon isn't drawn inside a gap, and goes from the gap's start to its end at once. The trip's time counts only the walk it's drawn on. Riding a revealed tip, it rests at the last value until the next one comes.
    - `delta` and `label` read `end` and `angle(1)`, the last value's, so they don't change.
    - No built-in effect draws inside a gap, and both conformance sweeps check it.
13. **Gaps on the line chart.**
    - `series` take fields of `number | null | undefined`. `null` and `undefined` are missing. `NaN` and the infinities still throw, since they're usually a mistake.
    - A missing value is a gap in its line, with no point. The x stays a target, since it's a row: the crosshair stops there, and the tooltip, the x's name and the table say the series has no value there.
    - A value alone between two gaps has no stroke, so its point shows at rest.
    - A line revealed into a gap ends at its last value, with its end label there. A line with no values is empty, as one revealed before its first x is.
    - A line's samples are its values, the missing ones left out, with `gapBefore` after each gap.
14. **The icon sets' fills** (decision 2).
    - `IconShape.fillRule?: "nonzero" | "evenodd"`, default `"nonzero"`, and `opacity?: number`, from 0 to 1, default 1, for the whole shape. `defineIcon` checks them, with a `RangeError` naming the shape and the field.
    - `iconFromSvg` keeps `fill-rule` and `opacity`, from attributes and inline styles, inherited through groups, with the groups' opacities multiplied in. `fill-opacity` and `stroke-opacity` are still dropped.
    - The SVG layer draws them. Square caps and bevel joins stay in the backlog.
15. **TypeScript 7** (decision 7).
    - Exact versions, as dev dependencies only: `typescript` 7.0.x; `@typescript/typescript6` 6.0.2 for tsup's declaration build; and TypeScript 5.4 under another name for `pack-check` (`"typescript-5.4": "npm:typescript@5.4.5"`).
    - `typecheck` runs TypeScript 7's `tsc` on its four projects. Vitest and Vite don't use `tsc`, so the tests and the demo build don't change.
    - **The declarations** are built by TypeScript 6. The step compares `dist`'s `.d.ts` files before and after, and explains any difference.
    - **`pack-check`** checks the packed types on TypeScript 5.4 and on the repository's, under each resolution it checks now. So README's "5.4 or newer" is tested.
    - A type error that TypeScript 7 finds and 5.9 didn't is fixed in the code. A fix that would change a public type stops the step to ask you.
    - If tsup can't build the declarations with `@typescript/typescript6`, the step stops and reports, and the 5.4 check lands on its own.
16. **Long axes** (decision 2).
    - **Thinning.** When a bar chart's category labels would overlap, it draws every nth, from the first, with n the smallest of 1, 2, 5, 10, 20, 50 and so on that leaves none overlapping. When its value labels would overlap, it draws none of them.
      - The tooltip, the marks' names and the table keep every name and value, and `labelBounds` has only the labels drawn.
      - There's no option: overlapping labels help nobody.
      - Only charts whose labels overlapped change: of the demos' bars, the stress page's.
    - **Page Up and Page Down** move focus by a page, and stop at the ends, as the arrows do.
      - On a line's time axis a page is a month, in the axis's time zone: focus goes to the first x a calendar month or more on, or back. The line chart gives the keyboard that x.
      - Elsewhere a page is a tenth of the marks, rounded up. `expressive()` gets it too.
17. **The rest.**
    - **Accessibility.** A gapped line's names, its table and the crosshair at a missing value, and Page Up and Page Down, are heard in a new script, I, for NVDA + Chrome. You run it. The tooltip is visual.
    - **Docs.** Each step adds its exports to api.md (`src/api-docs.test.ts` fails otherwise), its sections to architecture.md, and its entries to CHANGELOG, under a new `## Unreleased` above 0.2.0 with Added, Changed and Fixed lists. Each Changed entry says what to write instead, as a migration note would. The effects guide says how to draw along a walk with gaps.
    - **Sizes.** The line page's set has 0.3 KB of room, and steps 1, 3 and 6 add to it. A step that takes a set past its budget raises the budget in the same PR and says why (CONTRIBUTING's Bundle size).
    - **The release** goes as CONTRIBUTING's Releasing says, through trusted publishing. Nothing is published, tagged or released without your go-ahead in that session.

Each step names the files it owns, so steps in the same wave can run in parallel sessions. Files shared by several steps get small edits only, and whichever step lands second merges main first: `package.json`, `src/index.ts`, `src/effects/index.ts`, `src/charts/index.ts`, `src/charts/types.ts`, `src/core/contracts/index.ts`, `src/charts/render/theme.ts`, `src/charts/bar.ts`, `src/charts/donut.ts`, `src/charts/line.ts`, `src/charts/adapter/expressive.ts`, `src/effects/conformance.test.ts`, `src/conformance.test.ts`, `scripts/size-budget.json`, `src/core/README.md`, `src/charts/README.md`, `src/effects/README.md`, `docs/architecture.md`, `docs/api.md`, `docs/effects-guide.md`, `README.md`, `CHANGELOG.md` and this plan. Step 3's second PR owns the line chart's missing values in `line.ts`; steps 2 and 6 make small edits there. The first step to land adds CHANGELOG's Unreleased.

Each step's session reads the hand-over notes in its notes folder first, `plan-0-3.md` from planning among them, and writes its own there: commits, files, decisions beyond the brief, where the plan and the code differ, and follow-ups.

**Wave 1** (parallel):

1. ✅ **A tooltip that can be hovered** (decisions 4 and 9). Owns `src/charts/tooltip.ts`, `src/charts/interaction.ts`, the tooltip's paths in `src/charts/shell/hover.ts`, `.ec-tooltip`'s rule in `theme.ts`, their tests, the "content on hover" check in `tests/visual/a11y.spec.ts`, and the audit's finding 6 and 1.4.13 rows in `docs/a11y-audit.md`.
   - Tests: on bars, a donut, a line's crosshair and a chart switch's views, the pointer from a mark onto the tooltip and across it keeps the hover and its text; off it onto another mark hovers that one; off it onto nothing ends the hover. A touch tap on it, Escape and `leave()`, a change that moves it from under the pointer, and a linked chart, unchanged. The visual check moves a real pointer onto the tooltip on every demo page, in the three browsers.
   - **Done when** every existing test and baseline passes unchanged, and the audit's 1.4.13 rows pass.
   - Docs: architecture.md (hover and the tooltip), api.md, a11y-audit.md, CHANGELOG (Fixed).
   - **Built** (27 October 2026) as decisions 4 and 9 describe, with a bridge and a pass-through they didn't foresee (below) ([architecture.md](architecture.md#reference-charts)):
     - **The tooltip** (`src/charts/tooltip.ts`) takes the pointer while it shows (`pointer-events: auto` on `.ec-tooltip-shown`), and gives its layer as `element()`. Beside a mark it spans a clear bridge to it, `.ec-tooltip-bridge`. One that comes up under a resting pointer lets the pointer through (`.ec-tooltip-through` on the layer) until the pointer is off it: it hears the pointer on the document, before the chart does.
     - **`pointerHover`** (`src/charts/interaction.ts`) takes the chart's own hover and its tooltip as `tooltip()`. Leaving the `<svg>` for the tooltip holds the target; leaving the tooltip goes where the pointer lands (the event's `relatedTarget`, or `elementFromPoint`); and a `MutationObserver` on the tooltip it holds hovers what's under the pointer when a change moves the tooltip away. A tap on the tooltip isn't a tap elsewhere.
     - **The shell** (`shell/hover.ts`) gives `pointerHover` its own hover's key and its tooltip's element, and `bar.ts`, `donut.ts` and `line.ts` pass the element (a line each). The stylesheet gains the bridge's rules and the pass-through's.
     - **Tests** (50 new): `interaction.test.ts` 17, on `pointerHover` alone; `tooltip.test.ts` 33: the bridge's place and shape (5), the pass-through (4), bars, a donut, a line's crosshair and a switch's view (5 each: onto the tooltip and across it, off onto a mark, off onto nothing, Escape and `leave()`, a touch tap), a keyboard hover held past blur, a change that moves it on bars and on the crosshair, and a link. 1,854 tests pass. In the visual suite, `a11y.spec.ts`'s "content on hover" moves a real pointer from a mark onto its tooltip 2 px at a time on every library chart of every demo page, across it, then off it onto another mark or away, and checks the bridge's hit-testing against its trapezoid; Escape with the pointer on a tooltip hides it until the pointer moves; on the line page, a tooltip that comes up under the pointer lets it through. In Chromium, Firefox and WebKit, in Docker. No baseline changed.
     - **Sizes** (gzip, against main with steps 2 and 4): the line page's set 36.1 KB (1.1 more), `barChart` 30.3 of 30.5 (1.1), `expressive` and `travel` 26.0 (0.4, for `pointerHover`), the switch's set 40.0 of 41 (1.2), everything 69.8 (1.2), the script-tag bundle 76.2 (1.2), and `dist/index.js` 101.7 (1.6). Raised to the size plus 10%, as CONTRIBUTING says: the line page's set 35 → 39.5 KB, everything 69 → 76.5, the script-tag bundle 75.5 → 83.5, `dist/index.cjs` 100 → 110.5 and `dist/index.js` 100.5 → 111. Step 3, landing first, raised the same four to the same values and the line page's set to 39, which holds both (37.5 KB with step 3 merged). With step 3, `barChart` came to 30.7 KB of 30.5, so it's raised to 34.
   - **Decisions beyond the plan:**
     - **A bridge across the gap.** Decision 9 alone didn't reach the tooltip on bars or a donut. Measured on the demo pages, the straight way from a horizontal bar to its tooltip crossed 4 or 5 px of the next row, and from a slice 10 to 13 px of nothing, so the hover went before the pointer got there. Columns and the crosshair reached already, since their target is the whole column. Beside a mark, a clear trapezoid spans the gap from the box's edge to the mark's, 1 px into it. Not a delay while the pointer heads for the tooltip (the audit's other option), which would slow every hover near one.
     - **No bridge at a point.** A crosshair's column reaches the box, and a bridge there would catch a pointer running along a falling line.
     - **A tooltip under a pointer that didn't move onto it lets it through** until the pointer is off it. The first Docker run found it: a crosshair's tooltip often comes up over the pointer, since its column is the plot's height, and holding then froze the crosshair, and Playwright's `hover()` on the line and stress pages.
     - **The pointer on a keyboard hover's tooltip is on its target,** so that hover stays past blur, as on the mark. When focus moves the hover while the pointer is on the tooltip, the pointer hovers nothing until it next moves onto a mark, so a resting pointer never takes the hover from the keyboard.
     - **Escape with the pointer on the tooltip** (from Codex's review on PR #88). Hiding the tooltip uncovers the mark under the pointer, and Chromium sends that mark a `pointerover` at once, which hovered it again and brought the tooltip back. Where a hover ends with the pointer on its tooltip (Escape, `leave()`, its mark leaving, or focus moving the hover away), a `pointerover` there doesn't hover until the pointer has moved. A browser test presses Escape on every demo page's tooltips.
     - **Taps** are read from the event's composed path, so a tap inside a chart in an open shadow root, or on its tooltip, isn't a tap elsewhere.
     - **README**'s known gaps no longer name the tooltip.
2. ✅ **Change labels that hold up** (decisions 6 and 10). Owns the update slot's end and the values before in `src/core/runner.ts`, with `runner.test.ts`; how `bar.ts`, `donut.ts`, `line.ts` and `expressive()` tell it an update started (small edits); the `.ec-overlay .ec-text` rule in `theme.ts`; and `room` in `bar-layout.ts` and `bar.ts`.
   - Tests: a `delta` on bars, a donut, a line and an attachment going at the next update that leaves its mark alone, and staying through an attachment's `refresh()` that changes nothing (a Vega render); "+1" from an update that replaces one still moving; `update({ on })` alone keeping it; Off; the overlay text's size on an attachment; and `room` at each end, with negative bars and columns, and a `delta` inside the card at 320 px with `room: 28`.
   - **Done when** every existing test and baseline passes, except tests that pinned the old lifetime, each named in the PR with why it changed.
   - Docs: architecture.md (the slot table, the runner, `delta` and `label`, the bar chart), api.md, CHANGELOG (the update slot and overlay text under Changed, `previous` under Fixed, `room` under Added).
   - **Built** (26 October 2026) as decision 10 describes ([architecture.md](architecture.md#events-and-effect-slots)):
     - **The update slot's end.** The runner's `update(changed)` first clears the `update` runs of every mark not in `changed`, finished or still playing, as a re-trigger would, then starts the changed marks' runs. A chart or adapter calls it only for an update, now even one that changes no mark. The charts call it from `playUpdate` (`src/charts/shell/transitions.ts`), which each chart tells whether `update()` had `data`; `expressive()` from `refresh()`, when its read finds a new row (a datum that's another object), a new value, or a mark entering or leaving.
     - **The values before.** Each key keeps the data it last rested at beside the latest frame's: from its last `enter()` or `update()`, a `change()` outside a transition, or `settle()`. An update run's `data.previous` is that, so "+1", not "+1.88". The `previous` geometry and an `update` event's `from` are still the mark on screen.
     - **Overlay text.** `:where(.ec-overlay .ec-text)` in `theme.ts`: 12.5 px, 600, tabular digits, `--ec-text`. The season page's `#slope .ec-text` sets the same, so its pictures don't change.
     - **`room`** on `BarChartOptions`, passed to `layoutBars`: px added to the margin at each end bars reach, outermost. On a horizontal chart, the right if a total is above 0, the left (past the names) if one is below; on columns, the top, and the bottom under the names. A `RangeError` for anything but a number of px, 0 or more.
     - **Tests** (22 new; no existing test changed, since none pinned the old lifetime): `runner.test.ts` 6 (the runs an update leaves alone cleared as a re-trigger clears them, a `flash` still playing stopped, every mark's for an update that changes none, other slots kept, Off, the values from the last update and from a rest since, the geometry still on screen); `src/change-labels.test.ts` 10, on real charts and attachments (a `delta` going at the next update on bars, a donut, a line, D3-style rects and Vega bars, and staying through a `refresh()` that finds nothing new, a resize, a Vega signal's render and a Vega resize; `update({ on })` alone and a re-sort keeping it; "+1" from an update that replaces one still moving, with `from` still part way; a line revealed further counting from its revealed end; each mode, Off too; and the overlay text's computed size on an attachment, which a page's rule beats); `bar-layout.test.ts` 4 (`room` at each end, with negative bars and columns, and none at an end no bar reaches); `bar.test.ts` 1 (an update with `room`, and its `RangeError`s); and `captions.test.ts` 1 (with `room: 28`, a bar's, a negative bar's, a column's and a negative column's `delta` inside the chart at 320 px). 1,803 tests pass, and the whole visual suite in Docker against the baselines (487 passed, 53 skipped, in the three browsers, with 4 workers): no picture changed.
     - **Sizes** (gzip, against main with step 4): the line page's set 35.0 KB of 35 (102 B more, 51 B left), `barChart` 29.2 of 30.5, `expressive` and `travel` 25.6 of 27, the switch's set 38.8 of 41, everything 68.6 of 69, the script-tag bundle 75.0 of 75.5, and `dist/index.js` 100.1 of 100.5. No budget changes; steps 1, 3 and 6 will need the line page's raised.
   - **Decisions beyond the plan:**
     - **An update without `data` counts when it changes something.** The plan made an update a chart's `update()` with `data`. One without it that changes a value or adds or removes a mark (new `series`, say) starts update runs on the marks it changes anyway, so it ends the others' too, as an attachment's read with a new value does. `update({ on })` alone, a re-sort and other options change no value, so they keep them.
     - **The values before follow a rest, not only an update.** The plan said the data from a key's last `enter` or `update`. Then a line revealed further between updates would count from its old end: "+4" where the change was "+2". So the runner also takes the data a `change()` gives outside a transition (a reveal, a resize) and the frame a change settles on.
     - **`room` is the outermost space.** On a negative bar's side, `delta`'s text goes past the name (M7 step 1), so the room is past the names, not between the value labels and the names; under negative columns it's under the names. An end no bar reaches gets none, so a chart of positive bars only keeps its left margin.
     - **Vega and spread rows.** Vega marks each row it takes with a symbol, so rows a page spreads from Vega's rows (`{ ...row }`) are the same rows to Vega, which draws nothing new. The tests give Vega fresh objects, and architecture.md says so.
3. ✅ **Gaps in lines** (decisions 5 and 11–13). In two PRs.
   - **The contract and the effects** (the first PR). Owns `gaps` in `src/core/contracts/geometry.ts` and `gapBefore` in `data.ts`; `slice()` and the open outline across gaps in `src/core/geometry/`; `breaks` in `describe/line.ts`; `samplesAlong()`; the `"gapped line"` fixture in `src/testing/fixtures.ts`; `travel`'s jump in `travel.ts`; and `threshold`'s gaps in `threshold.ts`.
     - Tests: `slice()` and the outline across one gap and several, with ends at and inside them; `breaks`' `RangeError`s; `gapBefore` from `samplesAlong()`; every built-in effect on the fixture through `checkEffect`, with nothing drawn inside a gap; `travel`'s jump, rolling and riding, and its trip's time; and `threshold` with a gap in the mark and in the reference.
     - **Done when** every existing test passes unchanged, and every built-in effect passes `checkEffect` on the new fixture.
     - **Built** (26 October 2026) as decisions 11 and 12 describe ([architecture.md](architecture.md#gaps)):
       - **The contract.** `MarkGeometry.gaps?: readonly (readonly [from: number, to: number])[]` and `Sample.gapBefore?: boolean`. A walk (`src/core/geometry/walk.ts`) takes its gaps: `slice()` writes each part between them from its own move, and leaves out a part with no length, so a value alone has no stroke; a slice all in a gap is a move where it starts. An open outline's `d` is `slice(0, 1)`, and `assemble` passes `gaps` on only when there are some, so no mark built before has the field.
       - **`describe.line({ breaks })`** gives the walk a gap from `points[i - 1]` to `points[i]` for each break, in `t` by the walk's own sums, so the last point is at exactly 1. A break that isn't a whole number from 1 to the last index, in order and with no repeats, throws `describe.line: breaks[1] must be a whole number more than 2 and less than 4, the number of points, got 2.`
       - **`samplesAlong()`** puts `gapBefore` on the first sample past each gap's middle, and **`expressive()`** keeps it on a page's samples: its check rebuilt each sample as `{ t, value, at }`, which dropped it (a small edit in a shared file). It throws a `RangeError` for a `gapBefore` that isn't `true` or `false`.
       - **The fixture.** `"gapped line"`: the line fixture's points with `breaks: [2]`, a run, a gap and a run; its moved twin is the moved line, broken the same way.
       - **`travel`** plans its trip along the walk's parts between the gaps, each inset by the footprint as the walk's ends are. Its time and a roll's spin count only those parts, its heading is smoothed within the part it's on, and a part shorter than the icon is passed at once unless it's the last, where the icon rests. A walk whose parts add up to less than 0.5 px draws nothing.
       - **`threshold`** puts no stations across a mark's `gapBefore`, and marks the stations after one as not joined. A reference's gaps are worked out from its samples in `t` order, merged and searched by halves, so a long series with many gaps stays cheap in a reveal; between two stations the reference doesn't bend, so it's in a gap there if it is halfway.
       - **Tests** (119 new): the walk across one gap and several, ends at and inside them, touching gaps and arcs (`walk.test.ts`, `outline.test.ts`); `breaks`, its gaps and each `RangeError` (`describe/line.test.ts`), and three gapped lines in the geometry invariants; `gapBefore` from `samplesAlong()`, points in any order and between gaps (`samples.test.ts`); `travel`'s jump frame by frame, its time, its roll, its heading at a gap that turns, a short part, a value alone, a rest at the last value, riding a revealed tip, and a line of values all alone (`travel.test.ts`, 8, each failing on the old `travel`); `threshold` with gaps in the mark, the reference, and both, and no stations across a mark's gap (`threshold.test.ts`, 7, five failing on the old code); `expressive()` keeping `gapBefore`. Both sweeps play every built-in effect frame by frame on lines with gaps, through a run, a `change()` and `end()`, and check that nothing is drawn inside a gap (`drawnInGaps`, internal, in `src/core/testing/gaps.ts`, with its own tests): the effects sweep on the fixture, and `src/conformance.test.ts` on a new source, a D3 line drawn with `.defined()` over a season with missing weeks and described with `breaks`, whose stroke is D3's own. The sweep caught the old `travel` on all nine effects that use it. 1,900 tests pass (with step 4 merged); every existing test passes unchanged but three in `src/testing/check.test.ts`, which count or list the fixtures (27 problems where there were 24, 9 where there were 8, and the names), the change the plan makes.
       - **Sizes** (gzip, with step 4 merged): the line page's set 35.3 KB, `describe` and `matrix` 3.6, `expressive` and `travel` 26.0, everything 69.2, the script-tag bundle 75.5, `dist/index.js` 101.0. Seven budgets raised to the new size plus about 10%, as CONTRIBUTING says, since the growth is the feature and `describe` is one object that every page importing it carries: `dist/index.cjs` 100 to 110.5, `dist/index.js` 100.5 to 111, `describe` and `matrix` 3.5 to 4, the line page's set 35 to 39 (steps 1 and 6 add to it too), and, over only with step 4 merged, the script-tag bundle 75.5 to 83.5, the sport pack's ES entry 9 to 10 (its chunks, shared with the main entry, carry the geometry) and everything 69 to 76.5.
     - **Decisions beyond the plan:**
       - **"Apart and inside (0, 1)" is of the gaps as open stretches:** each `0 ≤ from < to ≤ 1`, ending at or before the next starts. So the gaps either side of a value alone touch, and a gap starts at 0 or ends at 1 where a line's first or last value is alone.
       - **A break between two points in the same place leaves no gap,** since there's nothing between them to leave out.
       - **`gapBefore` goes by a gap's middle,** not its ends: samples at a gap's ends land within float noise of them, either side.
       - **`travel` keeps its whole footprint off a gap,** inset from each part's ends, rather than only its anchor, so a ball never hangs over one mid-trip.
       - **The gap check isn't in `checkEffect`,** which is unchanged but for running on the new fixture: it's in both sweeps. Paths are checked exactly; an icon counts as over a gap when its anchor's nearest point on the walk is more than its size inside one, since a boot's heel resting at a gap's end, lifted at a valley, came nearer the gap's line than its own leg's.
       - **`morph`** samples the whole walk, as decision 11 says, so between two lines with gaps it joins them part way; its first and last frames are their outlines'. No fixture pair has gaps.
       - **A lone value in D3:** `d3.line().defined()` draws one as `M x,y Z`, a dot with round caps. Our stroke leaves it out, and the line chart shows its point instead.
   - **The line chart** (the second PR). Owns missing values in `line-layout.ts` and `line.ts`, `series`' type in `src/charts/types.ts`, and the words for a missing value in the tooltip, the names and `src/charts/table.ts`.
     - Tests: a missing value inside a line, at its start and at its end; two in a row; a value alone between gaps; a line with no values; a reveal into a gap and past it; a transition that opens a gap and one that closes it; the crosshair, the names, the tooltip and the table at a missing x; `threshold`, `travel` and `delta` on a gapped line; a time axis; `link()` at a missing x; and the types, with a field of `number | null` accepted.
     - **Done when** every existing test and baseline passes unchanged.
     - **Built** (26 October 2026) as decision 13 describes ([architecture.md](architecture.md#missing-values)):
       - **The layout** (`line-layout.ts`). A value is `undefined` where it's `null` or `undefined` in the data, and each row has its `missing` series and a `levels` record: its values, and for a missing one where its line runs past that x (in proportion to x across the gap, level with its nearest value before the first or after the last, 0 with none). The scale, the decimals and the end labels' widths count only values. `placeLines` skips a missing value with `breaks`, so the line's geometry has its gaps, and puts `gapBefore` on the sample after each; a line revealed into a gap ends at its last value, and one with no value up to the reveal is empty, its label taking no room. `placePoints` gives a missing value no point, and `loneValues` finds the values next to a gap with no other beside them.
       - **The chart** (`line.ts`). The rows' animated values go to their `levels`, and each frame draws them with the rows' `missing` as they're heading, so a gap opens or closes as a change starts and a value that comes grows out of the line. A value that goes missing exits its point and one that comes enters it. An empty line hides its end dot. A value alone gets `ec-alone`, which a rule in the stylesheet shows (a small edit in `theme.ts`). The crosshair at an x with no point stands at the x's own px, with the tooltip at its top.
       - **The words.** The x's name and the tooltip say "goals missing" for a missing value ("3: goals missing, 3.6 xg"), and the table's cell "missing", through a `missing` set on its rows. `markLabel`'s summary lists only the values the x has.
       - **The type.** `series: readonly KeyOfType<D, number | null | undefined>[]`, so a field of `number | null`, or an optional number, is a series, and a field of strings still isn't.
       - **Tests** (61 new): `src/charts/line-gaps.test.ts` (17): a gap inside a line, at its start and end, two in a row, values alone, a line with no values and a chart with none, samples and the datum, a reveal into a gap and past it, and before a line's first value, a change that opens a gap and one that closes it (the value starting on the line across the gap), the crosshair, names, tooltip and table at a missing x and at one with every value missing, the errors, and the types, with a `@ts-expect-error`. `line-layout.test.ts` (7): the levels, the breaks and samples, a reveal into a gap, an empty line and its label, the points and `loneValues`. `src/gaps.test.ts` (6): `threshold` on a season with missing weeks, red only where both lines have values, in Presentation and Off; a ball riding the tip, resting at the last value while the line is revealed into a gap and jumping when the next comes; `delta`; a time axis; and `link()` at a missing week. The top-level sweep has a lineChart source with missing weeks, every effect drawing nothing inside a gap. 1,961 tests pass; every existing test passes unchanged but one, `line-layout.test.ts`'s "throws on … a missing one included", which pinned the throw this PR removes. Every visual test passes in Docker against the baselines, none changed: 472 in the first run, and the 15 that failed there, out of memory or a timeout on the stress page with another suite running beside it, on a second run with 2 workers.
       - **Sizes** (gzip): the line page's set 36.1 KB of 39 (0.8 more than the first PR), everything 69.9 of 76.5, the script-tag bundle 76.3 of 83.5, `dist/index.js` 102.0 of 111. No budget changes.
     - **Decisions beyond the plan:**
       - **"missing", not "no":** "no goals" reads as none scored, so a missing value is "goals missing" in names and the tooltip, and "missing" in the table, where a blank cell is read as empty.
       - **A gap opens or closes as the change starts,** rather than at its end: there's no value to animate to or from, and the walk is straight across the gap either way. A value that comes starts at its level, so it rises out of the line in the values stage.
       - **An x with every value missing** keeps its stop, crosshair and tooltip, but has no mark, so `link()` has no linking value to read and linked charts don't follow it, and a focus ring has nothing to go round: its crosshair shows the focus.
       - **A line with no values is empty: no end dot or label.** Decision 13 compares it with a line revealed before its first x, which still shows its first point with its dot and label; one revealed before its first value is empty, as there's no value to show.
       - **A line's datum is its last value's row,** the row its end label is at, so a line revealed into a gap gives the row before the gap.
       - **A value alone shows its point only next to a gap,** so a line of one row, which has none, looks as it did.
       - **The table's rows say what's missing in a `missing` set,** rather than widening their values' type, so the table's own code and tests for bars and slices don't change.
     - **From review** (Codex, on #87): **a long run of missing values** made the layout quadratic, since each missing row looked for the next value again: 50,000 rows with no values took seconds before anything drew. The next value is now found once for each run. A test lays out 50,000 rows in under a second; it took 22 s before.
   - Docs: architecture.md (Mark geometry, the line chart, `travel` and `threshold`), the effects guide (drawing along a walk with gaps, and the new fixture), api.md, README, CHANGELOG (gaps, `breaks`, `gapBefore` and missing values under Added; the fixture under Changed).
4. ✅ **The icon sets' fills** (decision 14). Owns `fillRule` and `opacity` in `src/core/contracts/icon.ts`, `src/icons/define.ts`, `src/icons/svg.ts`, the icons in `src/charts/render/layer.ts`, and their tests.
   - Tests: an icon with an even-odd hole and a duotone pair, both written for the tests rather than copied from a set, through `iconFromSvg` and `defineIcon`; inheritance through groups; the `RangeError`s; and the SVG as drawn.
   - **Done when** every existing test and baseline passes unchanged.
   - Docs: architecture.md (Icons), api.md, `src/icons/README.md`, CHANGELOG (the fields under Added, `iconFromSvg` under Fixed).
   - **Built** (26 October 2026) as decision 14 describes ([architecture.md](architecture.md#icons)):
     - **The fields.** `fillRule?: "nonzero" | "evenodd"` and `opacity?: number` on `IconShape` (`src/core/contracts/icon.ts`). `defineIcon` checks and copies them: a fill rule that isn't one of the two, or an opacity that isn't a finite number from 0 to 1, throws a `RangeError` such as `defineIcon: "flag" shapes[1].opacity must be from 0 to 1, got 1.5.`
     - **`iconFromSvg`** reads `fill-rule` and `opacity` from attributes and `style`, on the root, groups and shapes. The fill rule is inherited, as in SVG, and opacities multiply down the groups, rounded to 0.001. An opacity is a number or a percentage, one past 0 or 1 counts as 0 or 1, and one it can't read counts as 1. A shape gets `fillRule` only when it's filled even-odd, and `opacity` only under 1, so every icon it made before comes out the same.
     - **The SVG layer** sets `fill-rule` and `opacity` as attributes on the shape's `<path>`, as it sets caps and joins, and neither where the shape has none. The recording layer records an icon by its name, so it needed nothing.
     - **Tests** (10 new, every icon in them written for them): `define.test.ts` 2 (an even-odd frame and a duotone pair kept as given, and the `RangeError`s), `svg.test.ts` 6 (a frame in Heroicons' solid style; the fill rule from attributes, `style` and groups; a duotone pair; opacities multiplied through groups; shapes at 0 dropped, and `fill-opacity` and `stroke-opacity` ignored; a long opacity read quickly), `surface.test.ts` 2 (the SVG as drawn, and nothing set for shapes without them). 1,781 tests pass. No baseline could change: no icon in the demos or the library has either field.
     - **Sizes** (gzip, measured in bytes against main): the line page's set 34.9 KB of 35 (109 B more, 153 B left), `barChart` 29.0 of 30.5 (132 B), `expressive` and `travel` 25.5 of 27 (101 B), the switch's set 38.6 of 41 (126 B), everything 68.4 of 69 (251 B), the script-tag bundle 74.7 of 75.5 (258 B), and `dist/index.js` 99.8 of 100.5 (404 B, comments included, since it isn't minified). No budget changes.
   - **Decisions beyond the plan:**
     - **A shape with an opacity of 0 is dropped,** as one with no fill or stroke is, so an SVG that's all faded out has nothing to draw, and says so.
     - **Defaults aren't written by `iconFromSvg`:** a nonzero rule, an opacity of 1, and a fill rule on a shape with no fill are left out. `defineIcon` keeps what it's given, defaults too, as it does for caps and joins.
     - **Percentages** (`opacity="40%"`, CSS's other form) are read as well as numbers, and `fill-rule`'s keywords in any case, as CSS reads them. Caps and joins are still read as written.
     - **A group's opacity is multiplied into its shapes',** as decision 14 says. It differs from SVG only where the group's shapes overlap, since SVG fades the group as one picture. architecture.md says so.
5. ✅ **TypeScript 7** (decisions 7 and 15). Owns the dev dependencies in `package.json` and the lockfile, the tsconfigs, `scripts/pack-check.mjs`, README's TypeScript line, CONTRIBUTING's toolchain lines, and §10's open question 7.
   - Checks: `typecheck`, timed before and after; the build; the `.d.ts` comparison; `pack-check` on 5.4 and 7; and CI on Node 22 and 24.
   - **Done when** `npm run typecheck && npm test && npm run build`, `npm run size` and `npm run pack-check` pass with TypeScript 7, and the packed types check on 5.4.
   - Docs: architecture.md (Build outputs), README, CONTRIBUTING, and CHANGELOG only if the published types change.
   - **Built** (26 October 2026), with TypeScript 6 as `typescript` rather than `@typescript/typescript6`, on your word, since tsup couldn't build the declarations as planned ([architecture.md](architecture.md#build-outputs)):
     - **The versions,** dev dependencies pinned exactly: `typescript-7` (`npm:typescript@7.0.2`) for `typecheck`; `typescript` 6.0.3 for tsup's declaration build and `src/api-docs.test.ts`; and `typescript-5.4` (`npm:typescript@5.4.5`) for `pack-check`.
     - **Why not as planned.** With `typescript` 7.0.2 and `@typescript/typescript6`, the build stopped at the declarations. tsup 9.0.0, the latest, calls `typescript`'s API itself (`parseJsonConfigFileContent` and `ScriptTarget`, in `dist/rollup.js`); only its bundled rollup-plugin-dts falls back to `@typescript/typescript6`. tsup's TypeScript 7 issues (egoist/tsup#1405 and #1408) are open, and the PR that would fix it (#1409) was closed unmerged. `src/api-docs.test.ts` uses the compiler API too, so it needs a `typescript` that has one.
     - **`typecheck`** runs TypeScript 7 by its path (`node node_modules/typescript-7/bin/tsc`) on its four projects. It found nothing 5.9 didn't, so no code changed. Timed in three runs each, alternating, on a busy machine: 1.1 s for the four, against 6.8 s with 5.9.3 (the main project 0.50 s against 3.4).
     - **The declarations.** TypeScript 6.0.3 built every file in `dist` byte for byte as 5.9.3 did, declarations included. The stylesheet's types (below) add two files. With a new entry, rollup renamed the two shared declaration chunks and re-lettered the aliases between them; the types and the names each entry exports are the same.
     - **`pack-check`** checks the packed types with each TypeScript in `devDependencies` (`typescript` and `typescript-*`), from the oldest: 5.4.5, 6.0.3 and 7.0.2, each under `bundler`, `node16` (ES module) and `node16` (CommonJS), reading its own declarations. TypeScript 7's `exports` have no `bin/tsc`, so each `tsc` is found through its package's `bin`. The consumer imports the stylesheet too.
     - **The stylesheet's types** (found here, fixed on your word). TypeScript 6 turns `noUncheckedSideEffectImports` on by default, and 7 keeps it, so `import "expressive-charts/style.css"` was error TS2882 for a page on either, with 0.2.0 too, and README's and api.md's examples failed `api-docs.test.ts` on TypeScript 6. The export now has `import` and `require` branches, each with types: `dist/expressive-charts.css.d.ts` and `.d.cts`, an empty module, built from `src/style.css.ts` as a declarations entry of its own. It ends with a plain `default` to the CSS, since css-loader's `@import` resolves with `style` only and Sass with `sass` and `style`, which match neither branch (the PR's review found it). Node still resolves the CSS. CHANGELOG lists it under Fixed.
     - **Tests.** `src/package.test.ts` (the stylesheet's export, and which exports are JavaScript entries) and `src/api-docs.test.ts` (its examples find the stylesheet's types through `paths`) changed, and `src/package.test.ts` has one new test: the stylesheet resolves under `import`, `require`, `style`, `sass` and `style`, and no conditions, and its types under `types`. Every test passes, every size is unchanged by this step, and `pack-check` passes.
   - **Decisions beyond the plan:**
     - **`typescript` is 6.0.3, with no `@typescript/typescript6`** (above). `@typescript/typescript6` 6.0.2 is a wrapper whose dependency, `npm:typescript@^6`, installed 6.0.3, and that package's `tsc` took `node_modules/.bin/tsc` from TypeScript 7, so `npm run typecheck` ran TypeScript 6. Three packages still have a `tsc`, so `typecheck` names its path, and CONTRIBUTING says `npx tsc` could run any of them.
     - **The stylesheet's types are a declarations entry** (`dts.entry`), not written in `onSuccess` as the CSS is: tsup's declaration build deletes every `.d.ts` in `dist/` as it starts, at the same time as `onSuccess`.
     - **`pack-check` checks TypeScript 6 as well,** since it's `typescript` and builds the declarations. It adds a few seconds.
     - **The tsconfigs didn't change:** TypeScript 7 and 6 accept them as they are.
   - **Left for later:** `typescript` itself goes to 7, and the split ends, once tsup (or what replaces it) builds declarations without TypeScript's JS API, and `api-docs.test.ts` can read the exports with TypeScript 7's.

**Wave 2** (after steps 2 and 3 land):

6. ✅ **Long axes** (decision 16). Owns thinning in `bar-layout.ts` and `bar.ts`, Page Up and Page Down in `src/charts/keyboard.ts`, a month on a time axis in `line.ts` (a small edit), their tests, and the baselines it changes.
   - Tests: 10 to 1,000 bars and columns, at 320 px and wide, with no two labels overlapping; the steps of n, the first label kept, and value labels all or none; `labelBounds` without the labels not drawn; the names, the tooltip and the table keeping every value; and Page Up and Page Down on bars, a line on numbers, a line on dates (across a month's end, and in each time zone) and an attachment, stopping at the ends.
   - The baselines it changes are made again in Docker, and you see each one before it's committed.
   - Docs: architecture.md (the bar chart, the keyboard), api.md (the keys), CHANGELOG (Page Up and Page Down under Added, thinning under Changed).
   - **Built** (27 October 2026) as decision 16 describes ([architecture.md](architecture.md#bar-chart)):
     - **Thinning** (`bar-layout.ts`). Each layout places every row's labels, then chooses which to draw: the value labels unless any two would overlap, and every nth category label from the first, n the first of 1, 2, 5, 10, 20, 50 and so on whose labels don't. Two labels overlap when their boxes do, the boxes `labelBounds` gives (touching isn't overlapping), found in one sweep along the category axis. `BarLayout.labels` is `{ every, values }`. Each row has its `category`, the name, and `drawn`; a label that isn't drawn has empty text, so `labelBounds` and `labels()` leave it out. `placeRow` takes `drawn` on the state, both by default.
     - **The chart** (`bar.ts`). The tooltip, the marks' names, `markLabel`'s summary, the legend, the table and the announcements read the row's `category`, not its label's text. Every frame of a change draws the labels its new layout draws.
     - **Page Up and Page Down** (`keyboard.ts`). A page is a tenth of the order, rounded up, and stops at the ends, as the arrows do; the keyboard takes a chart's own `page(key, by)`, which `shell/hover.ts` passes on (a small edit). The line chart's (`line.ts`, a small edit): on a time axis, the first revealed x at or past `monthsOn(x, 1)` in its zone, or the last at or before `monthsOn(x, -1)`, or the end that way. `monthsOn` is in `time.ts`. `expressive()` and the donut take the default.
     - **Tests** (21 new): `bar-layout.test.ts` 6 (10 to 1,000 bars and columns, positive and both signs, at 320 and 1,200 px, at their own height and squeezed, each with no two drawn boxes overlapping, the first label kept, every nth with no smaller step that fits, and values all or none; the steps of n on exact bands, with touching boxes apart; values none when two far apart in the order meet; the names and data kept, and `labelBounds` with only the drawn labels; `placeRow` with `drawn`; and `room` at each end with the labels thinned); `time.test.ts` 5 (`monthsOn`: a shorter month, a leap year, back, across a year, before year 100, and in New York and Auckland, across daylight saving and where the zone's month ends on another day than UTC's); `src/long-axes.test.ts` 10 (on a real bar chart, every name and value in the marks' names, the tooltip and the table, and only the drawn labels in `labels()` and `labelBounds`; an update thinning again, its labels those of the bars heading for every nth place, and no value drawn while they count; Page Up and Page Down on bars, a line on numbers and revealed, a line on dates across a month's end and a leap year, at the ends, on weekly x's and at a missing value, in New York and Auckland, and on an attachment). 2,056 tests pass, and every existing test unchanged.
     - **Baselines,** made again in Docker and shown to you before they were committed: five changed, all for thinned labels, and the rest of the suite passed unchanged (521 passed, 53 skipped, in the three browsers, with 4 workers). `stress-page-light` and `-dark`: the stress page's bar charts draw every 20th name on its two charts of 100 columns, every 5th on the switch's 20 bars and every 200th on the first draw's 1,000 columns, and no values. `season-page-light`, `-dark` and `season-linked-hover`: the goals chart's 24 columns are 17.8 px apart and a week's name box is 18 px across, so it draws every 2nd week; with the page's own CSS still thinning to 1, 5, 10, 15 and 20, only 1, 5 and 15 show until step 7 drops it.
     - **Sizes** (gzip, against main): `barChart` 31.1 KB of 34 (0.4 more), the line page's set 37.7 of 39 (0.2), the switch's set 40.8 of 41 (0.5), `expressive` and `travel` 26.7 of 27 (0.1), everything 72.1 of 76.5, the script-tag bundle 78.5 of 83.5 (0.6), `dist/index.js` 105.0 of 111. No budget changes.
   - **Decisions beyond the plan:**
     - **Overlap is by `labelBounds`' boxes**, the boxes effects keep clear of, rather than the glyphs: a box is a little larger than its text, so labels a box apart count as overlapping.
     - **A category label and a value label aren't compared.** Within a row they sit apart, but a negative column's value label can touch its own name (in the backlog), which would otherwise hide every value on such a chart.
     - **The frame keeps room for every label**, the value labels' margin too, so thinning moves nothing: a re-sort that draws other names doesn't shift the bars, and `room` stays past where the value labels would be.
     - **A change draws its new layout's labels from its first frame**: the names of the bars heading for every nth place, as they move, and, when the new layout has none, no values even while they count.
     - **A month on is Temporal's**: the same day and time of day, or a shorter month's last day (31 January to 28 February), so a page back from there goes to 28 January, not the 31st.
     - **A page with no x a month away goes to the last x that way**, as "stop at the ends" says, so Page Down near the end lands on the last x, and again does nothing.
     - **`monthsOn` is in `time.ts`**, beside the axis's other calendar arithmetic, rather than in `line.ts`, which only uses it.
     - **The stress page's text check runs again.** `a11y.spec.ts` skipped its "no chart's text overlaps" check on the stress page for want of thinning. It now runs there, and passes in the three browsers with WCAG 1.4.12's spacing (one line, in a shared spec).
     - **Every chart gets Page Up and Page Down**, the donut and a chart switch's views too, since they share `keyboard.ts`. A line on numbers pages by a tenth of its revealed x's.

**Wave 3** (after the other steps land):

7. ✅ **The demos, their screenshots, the audit and script I.** Owns `demo/line.*`, `demo/season.*` and `demo/stress.*`, their visual specs and baselines, README's `arrow-on-hover.gif`, `docs/a11y-audit.md`, and section I of `docs/a11y-check.md`.
   - **The line page** gets a card with missing values: our `lineChart`, and a D3 line drawn with `.defined()` and described with `breaks`, both with `threshold` and a riding `travel`, so the uncoloured gap and the jump show.
   - **The season page** drops its workarounds: emptying the `update` slot, `delta`'s `value`, the slope chart's overlay CSS, the players' padding (for `room: 28`), and its goals chart's label CSS (for the chart's own thinning).
   - **The stress page** says to try Page Up and Page Down, and its bars show their labels thinned.
   - **README's `arrow-on-hover.gif`** is made again (`npm run media`), with M7's dimming.
   - **Screenshots,** made in Docker: the line page's new card, and every page whose picture changed. Reduced motion and Off are checked in the DOM: a gap stays a gap.
   - **Script I,** for NVDA + Chrome: a gapped line's names, the crosshair at a missing value and its table; Page Up and Page Down on the stress page; and the season page heard as before. You run it.
   - **The walk:** you look at the pages in the browser, at 320 px too.
   - Docs: a11y-audit.md (the line page's new card, the Browsers count), a11y-check.md (section I and its results).
   - **Built** (27 October 2026), as the plan says, in two PRs: the pages, their tests and baselines, the audit and script I first ([#90](https://github.com/Deaversbp/expressive-charts/pull/90)), then script I's results and the walk ([a11y-audit.md](a11y-audit.md#with-missing-weeks-m8)):
     - **The line page** has a second pair of cards under the first, "With missing weeks": the page's season as a weekly data feed recorded it, with `null` for goals and xG in matchweeks 9 and 10 and for xG in 4 and 5, on `lineChart` (`#gaps`) and on a D3 line drawn with `line().defined()` (`demo/d3-gaps.ts`, new beside `d3-line.ts`). The page describes the D3 line with `describe.line({ breaks })`, working out the breaks from the weeks each path has, as `src/conformance.test.ts`'s `d3GappedSource` does. Both carry the page's decoration, `threshold` and a riding `travel`, and Play season and the scrubber drive the four charts that play. The names, the tooltip and the table say "missing", and the D3 lines' names say which weeks each is missing. Design notes say why a missing week isn't a 0, and why goals below xG aren't red in matchweeks 3 to 6.
     - **The season page** has none of its workarounds: no `update({ on: {} })` before a matchweek, `delta()` with its default value, no `#slope .ec-text`, `room: 28` for `#players`' padding, and neither of the goals chart's label rules, its week names' and its values' under 600 px. Its pictures change only in the goals chart's week names, now every 2nd.
     - **The stress page**'s Things to try says where the bars' names are thinned, and to try Page Up and Page Down (120 presses for ten years of days).
     - **README's `arrow-on-hover.gif`** is made again with `npm run media` (its test alone): 60 frames, 2.44 s, 59 KB. The other bars dim, and their labels don't.
     - **Tests.** `line.spec.ts`, 5 new: at rest, a gap in each line and no red in any; mid-play, each line ending at matchweek 8 with its ball waiting there, then past the gap; the crosshair and tooltip at a missing week; the names, the keys (Page Up and Page Down too) and the table at one; and with reduced motion and with Off, a gap staying a gap. `stress.spec.ts`, 2 new: Page Up and Page Down a month at a time on the date line, and a tenth of the bars at a time, with the bars' names thinned. `a11y.spec.ts`: the line page's tab stops.
     - **Baselines,** made in Docker and approved by you before they were committed: 2 new (`line-gaps-wait`, `line-gaps-tooltip`) and 12 changed. `line-page-light` and `-dark` have the new cards. `season-page-light`, `-dark` and `season-linked-hover` change only in the goals chart's week names; the players' bars with `room` and the slope chart's labels came out pixel for pixel the same. `stress-page-light` and `-dark` change only in Things to try. The five `line-vega-` pictures are the same pictures half a pixel lower on the page (below).
     - **The visual suite** in Docker, in Chromium, Firefox and WebKit with 4 workers, in 9.6 min: 553 passed and 50 skipped (forced colours and the switch's accessibility tree, 25 each in Firefox and WebKit), none failed. 201 tests in each browser; the audit's Browsers paragraph says so.
     - **Docs:** a11y-audit.md (the line page's cards with missing weeks, the season page's 1.4.10, a third judgement call, the Browsers count), a11y-check.md (section I, and section G's line on Page Up and Page Down), and CONTRIBUTING's visual tests (the line page's new pictures and checks, and the viewport rule).
     - **Script I passed** with NVDA + Chrome (27 October 2026), after #91 below: missing weeks were read by what's missing, never as a 0, the keys stopped at them, the table read "missing", Page Up and Page Down went a page at a time and stopped at the ends, and the season page read as in section H ([Results](a11y-check.md#results)).
     - **The walk** (27 October 2026): you looked at the three pages in the browser, at full width and at 320 px, and at the changed screenshots, and found nothing to change.
   - **Decisions beyond the plan:**
     - **A taller viewport for the line page alone.** The line page is about 2,460 px at 1,000 px wide, past the suite's 2,000. A taller config would have changed every shorter page's full-page picture, so `Demo` has an optional `height` (`tests/visual/demo.ts`), which `openDemo` grows the viewport to: the line page's is 2,600. The media capture's viewport went from 4,000 to 5,000 px, since the line page is about 4,670 px at 440.
     - **The goals chart's value rule went too.** Thinning leaves the values out where they'd overlap (at 320 px) and draws them where they fit (at 520 px), where the page's rule hid them below 600.
     - **The first line chart's pictures didn't change.** The lede kept its length ("drive the first four"): a longer one moved everything under it by part of a pixel. `line-play-week-20` is clipped to the scrubber and the first pair, since `#season` now holds the second pair too.
     - **The Vega-Lite card moved half a pixel.** It's under the new pair, whose height has a half pixel in it, so its five pictures anti-alias a little differently, with nothing in them changed.
     - **`#gaps` isn't in `a11y.spec.ts`'s tooltip charts.** Their ring check expects the tooltip clear of the focus at every mark, and at a week with no values the tooltip sits at the top of its focus; `line.spec.ts` checks that week's focus, tooltip, names and keys instead.
     - **Found: focus at a week with no values.** There was no point to ring, so the focus showed only as the crosshair, in the axis colour (1.8:1), and the tooltip. The audit counted it as a pass, as a judgement call, and a library follow-up started in its own session on your word fixed it before script I was run: [#91](https://github.com/Deaversbp/expressive-charts/pull/91) draws a 2 px line in the focus colour there (4.3:1 in light, 4.8:1 in dark), and made the judgement call a pass.

**Wave 4:**

8. ✅ **Publish 0.3.0** (decision 3). Owns the version (`package.json`, the lockfile, `VERSION`), CHANGELOG's 0.3.0 entry, README's status, its script tag (`@0.3`, and api.md's) and its sizes, and this plan's status line and M8's ✅.
   - **The dry run:** `typecheck`, `test`, `build`, the size check, `pack-check`, `npm pack` (its list and sizes shown to you) and `npm publish --dry-run`. The PR has its results.
   - **Before the go-ahead,** you check that the trusted publisher is still on npmjs.com. Nothing else needs setting up.
   - **Then, on your go-ahead in that session:** the `v0.3.0` release is created, and the workflow publishes it with provenance, through trusted publishing.
   - **After:** check npm (the version, README, provenance), install 0.3.0 in a fresh project, and check jsDelivr's `@0.3`.
   - **Built** (27 October 2026): [0.3.0 is on npm](https://www.npmjs.com/package/expressive-charts/v/0.3.0) through trusted publishing with provenance, and [its release](https://github.com/Deaversbp/expressive-charts/releases/tag/v0.3.0) is on GitHub.
     - **The release PR** ([#93](https://github.com/Deaversbp/expressive-charts/pull/93)): 0.3.0 in `package.json`, the lockfile and `VERSION`; CHANGELOG's 0.3.0 entry, the Unreleased lists under a short summary; README's status, its script tag at `expressive-charts@0.3` (api.md's too), since `@0.2` keeps serving 0.2.x, and its sizes as measured, a bar chart about 31 KB gzipped and everything 72 KB. `release.yml` and CONTRIBUTING didn't change: the workflow runs CI's checks on Node 24, TypeScript 7 among them.
     - **The dry run** passed on `1284aa6` with the PR: `typecheck`, 2,059 tests, the build, every size within its budget (`barChart` 31.1 KB, the line page's set 37.8, everything 72.2 and the script-tag bundle 78.6), `pack-check` on TypeScript 5.4, 6 and 7, `npm pack` (37 files, 0.2.0's 35 and the stylesheet's two type files from step 5, 1.4 MB packed and 5.2 MB unpacked) and `npm publish --dry-run`.
     - **You** checked that the trusted publisher was still on npmjs.com.
     - **The release.** Main's CI was green on `945dab1`. On your go-ahead, `v0.3.0` was created there at 17:48 UTC, and its run published with provenance at 17:49 ([Sigstore's log](https://search.sigstore.dev/?logIndex=3522114495)), first time, with no `ENEEDAUTH`.
     - **After.** npm shows 0.3.0 as `latest`, with README, its four GIFs, and "Built and signed on GitHub Actions" from `945dab1` and `release.yml`. Its provenance is SLSA v1, from `refs/tags/v0.3.0`. A fresh project installs it with no dependencies, `npm audit signatures` verifies its registry signature and its attestation, and all three entries load as ES modules and as CommonJS, with the same names both ways, `VERSION` 0.3.0 and the stylesheet. jsDelivr serves the script tag at `expressive-charts@0.3`, and the demo pages load. No placeholder version came.

**Done when:**
- **The tooltip.** Every library chart's tooltip can be hovered, and the audit's 1.4.13 rows pass.
- **Change labels.** A `delta` goes at its chart's next update and says the change from the last update's values; overlay text is sized on attachments; and `barChart({ room })` keeps a change inside the chart at 320 px. The season page has none of its workarounds.
- **Gaps.** `lineChart` skips missing values. `MarkGeometry.gaps`, `Sample.gapBefore` and `describe.line`'s `breaks` describe them; every built-in effect passes `checkEffect` on the `"gapped line"` fixture, and none draws inside a gap.
- **Long axes.** A bar chart's labels never overlap, and Page Up and Page Down move by a page.
- **Icons.** `iconFromSvg` keeps even-odd fills and opacity.
- **TypeScript 7** checks the code, TypeScript 6 builds the declarations, and `pack-check` checks the packed types on 5.4 and 7.
- **The demos** show all of it, with their screenshots and the audit, and script I passed with NVDA + Chrome.
- **Docs.** api.md, architecture.md, the effects guide, README and CHANGELOG cover every addition and change. The promise changes only by `gaps`, `gapBefore`, `breaks` and the icon fields, which are additions, and by the new fixture, with its migration note.
- **0.3.0 is on npm,** published through trusted publishing with provenance, with its CHANGELOG entry and its release on GitHub. This plan's status line says M8 is done.

**Status: complete (27 October 2026).** Every item on the list holds. Steps 1 to 7 built and checked the first eight, and 0.3.0 is on npm through trusted publishing with provenance, with its release on GitHub (step 8).

### M9: Attachments on a par with charts, and circles and shapes (0.4.0) ✅

Effects on more of what other libraries draw: attachments that change their effects and end their hover as charts do, a chart switch in a link, circles and any SVG shape read by `expressive()`, Vega lines with gaps, the icon sets' faded parts, TypeScript 7 building the declarations, and last, 0.4.0 on npm.

**Demo:** a new page, `shapes.html`, with a D3 scatter, an Observable Plot dot chart, a D3 curved line and a D3 area, each attached with only a key, and a picker that swaps their effects in place. The donut page's D3 pie swaps its effects without being attached again, and the morph page's switch is linked with a chart beside it.

**Where M9 starts** (checked against main at `2a54df3` while planning, 27 October 2026):

- **Already built.**
  - **0.3.0** is npm's `latest`, published through trusted publishing with provenance. npm lists `0.0.0-stage`, `0.1.0`, `0.2.0` and `0.3.0`. GitHub has no open issues or pull requests.
  - **Attachments.** `expressive()` and `fromVegaView()` return `refresh()`, `on()`, `marks()`, `focus()` and `destroy()`. A chart's handle also has `update()`, `leave()` and `labels()`, and `update({ on })` swaps its effects in place through the runner's `swap()`.
    - An attachment's effects are fixed when it's made, so `donut.html` attaches its D3 pie again when the picker changes, and the pie's tab stop goes back to its first slice.
    - A page can't end an attachment's hover: the port each attachment registers for links (`src/charts/link.ts`) has a `leave()`, but the handle has none.
  - **Links.** `link()` finds each source's port by its handle. It throws on a `chartSwitch` ("A chartSwitch can't be linked yet"). A switch's handle has `current`, `show()`, `chart(view)` and `destroy()`, but no `marks()` or `on()`, which `LinkSource` needs. Its views' charts can each be linked, but the hidden one would hover unseen.
  - **What `expressive()` reads.** Only `<rect>`s. Any other element throws, and a page describes it with the `geometry` option. The design session's sketch read `<rect>` as a bar, `<circle>` as a point and anything else with `describe.shape`. `watch` notes `d`, `x`, `y`, `width`, `height`, `cx`, `cy`, `r`, `points` and `transform`.
  - **`describe`** has `bar`, `arc`, `line` and `point`, all under the promise. architecture.md lists `describe.shape(element, spec)` as planned, walking a shape with the browser's `getPointAtLength`, which jsdom doesn't have.
    - The core already reads any path data, every command and arcs too: `parsePath`, `transformPath` and `formatPath` in `src/core/geometry/path.ts`, which `iconFromSvg` and the chart switch use.
    - `iconFromSvg` turns `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>` and `<rect>` into path commands (`outline()` in `src/icons/svg.ts`).
    - A walk is made of straight pieces and circular arcs (`src/core/geometry/segment.ts`).
  - **`fromVegaView()`** reads rects as bars, arcs as slices, symbols as points, and lines. A line throws on a curve (an `interpolate` other than `"linear"`) and on a point Vega leaves out (`defined: false`): "Lines with gaps can't be read yet". Vega-Lite 6.5.0 breaks a line at a missing value by default: compiled, a line's default `invalid` gives the mark a `defined` encoding. So any Vega-Lite line with a `null` throws today, not only one with `invalid: null`, as M8 step 3's note thought.
  - **Testing.** `checkEffect`'s default data is two samples, 0 at the start and 1 at the end, on every fixture, the `"gapped line"` too, so a data effect never sees its gap. 2,059 unit tests in 102 files pass. The visual suite ran 553 tests at M8 step 7, with 50 skipped, in Chromium, Firefox and WebKit (201 in each).
  - **Icons.** `IconShape` has `fillRule` and `opacity`. `iconFromSvg` drops `fill-opacity` and `stroke-opacity`. Its `pixels()` reads a root's `width` and `height` with `\d*\.?\d+`, which backtracks on a long run of digits followed by junk.
  - **The build.** tsup 9.0.0, still the latest, builds the JavaScript with esbuild and the declarations with TypeScript 6.0.3, through TypeScript's JS API, which TypeScript 7.0 doesn't have. TypeScript 7.0.2 runs `typecheck` (as `typescript-7`); 7.1 is in beta.
    - tsdown 0.23.2, on Rolldown, builds declarations three ways, through rolldown-plugin-dts 0.29.0-beta.2: with TypeScript 5 or 6's API, with TypeScript 7.1's, or with Rolldown's oxc. oxc needs no TypeScript, but the code must pass `isolatedDeclarations`.
    - On main, `isolatedDeclarations` finds 18 errors: seven exports in six files whose types are inferred (`describe`, `matrix`, `gaits`, `TAU`, `stylesheet`, `presetRegistry` and `iconRegistry`), and the default exports of `tsup.config.ts` and `vitest.config.ts`.
    - The size check bundles its import sets from `dist/index.js`, so another bundler moves every size.
  - **Sizes** (gzip, against their budgets, on `2a54df3`, the same code as 0.3.0): everything 72.2 KB of 76.5, `barChart` 31.1 of 34, the line page's set 37.8 of 39, the switch's set 40.8 of 41, `expressive` and `travel` 26.7 of 27, `describe` and `matrix` 3.6 of 4, the script-tag bundle 78.6 of 83.5, the stylesheet 2.4 of 2.5, and `dist/index.js` 105.1 of 111.
- **Gaps.**
  - An attachment can't change its effects, and a page can't end its hover.
  - A chart switch can't be in a link.
  - Scatter plots, curves and areas from D3 and Plot need the `geometry` option, and a curve can only be described roughly, by points the page takes from it.
  - A Vega-Lite line with a missing value throws.
  - An icon whose SVG fades a part with `fill-opacity` or `stroke-opacity` draws it at full strength.
  - TypeScript 7 can't build the declarations.
- **Out of date** (each fixed by the step named):
  - README's `ball-and-boot.gif` was made on the morning of 24 October, before M7 step 3's dimming merged that afternoon. `threshold-line.gif` and `donut-to-columns.gif` are as old (step 7).
  - architecture.md's sizes are 0.2.0's (step 5, then step 8 for 0.4.0's).
  - architecture.md's Builders, and the sketch, plan `describe.shape` from an element with `getPointAtLength` (step 3).
  - `vega.ts` says lines can't have gaps yet, and §10's open question 14 says attachments can't change their effects (step 1).
  - `demo/donut.ts` says an attachment's effects can't change (step 7).

**What M9 takes from the backlog, and what stays:**

| Item | Goes to |
| --- | --- |
| Changing an attachment's effects, as `update({ on })` changes a chart's | Decisions 1 and 9, step 1 |
| A chart switch in a link | Decisions 1 and 10, step 2 |
| `describe.shape`, and the adapter reading circles | Decisions 1, 4, 5, 11 and 12, steps 3 and 6 |
| `fill-opacity` and `stroke-opacity` in `iconFromSvg`, with `pixels()` (M8 step 4) | Decisions 2 and 14, step 4 |
| TypeScript 7 for the declarations | Decisions 2, 6 and 15, step 5 |
| `fromVegaView()` reading lines with gaps, and `checkEffect`'s default data on a gap (M8 step 3's notes) | Decisions 2 and 13, step 1 |
| The API docs test's link check timing out under load, architecture.md's sizes, and README's other three GIFs (M8's notes) | Decisions 2 and 15, steps 5 and 7 |
| A curved Vega line read through `describe.shape` | Stays: new, and an addition for later. *Built in M10 step 4* |
| Lines as switch views, `morph` across gaps, a line's `curve` and nearest-point hover, change labels on a neighbour's label, a negative column's value label on its name, square caps and bevel joins, VoiceOver + Safari, a written audit table for `stress.html`, the other follow-ups in M8's notes (linking an x with every value missing, a `table.missing` wording, a fade when a change thins labels, the hidden value labels' margin), and the rest | Stay: in the backlog, or in M8's notes |

When a step lands, it marks its backlog item as built in M9.

**Decided while planning M9 (27 October 2026):** decisions 1–7 are yours, and 8–16 follow from them and the code.

1. **M9 builds two things:** attachments on a par with charts (`update({ on })` and `leave()` on `expressive()` and `fromVegaView()`, and a chart switch in a link), and circles and shapes (`expressive()` reading `<circle>` and other shapes, and `describe.shape`).
2. **Four smaller items join them:** Vega lines with gaps, with `checkEffect`'s default data marking a gap; the icon sets' faded parts, with `pixels()`; TypeScript 7 building the declarations; and a tidy: the API docs test's link check, architecture.md's sizes measured again, and README's other three GIFs.
3. **One release, 0.4.0, when M9 is done.**
4. **`describe.shape` reads path data,** `describe.shape({ key, d })`, not an element. The library follows the path itself, so it works in Vitest and Node, and the same in every browser.
5. **`expressive()` reads circles and every shape by itself:** `<rect>` as a bar, as now, `<circle>` as a point, and `<path>`, `<line>`, `<polyline>`, `<polygon>` and `<ellipse>` through `describe.shape`. `geometry` still wins.
6. **TypeScript 7 builds through tsdown, with isolated declarations.** Rolldown's oxc writes the declarations with no TypeScript, the code gives its exports explicit types, and `typescript` goes to 7. It starts as a spike, which stops if a published type differs.
7. **A new demo page, `shapes.html`.** `donut.html`'s D3 pie swaps its effects in place, and `morph.html`'s switch joins a link.
8. **What's an addition and what isn't** (the 0.x promise). 0.4.0 is a minor release. In the effect-author API, `describe.shape`, `ShapeSpec` and the icon fields are additions, and `checkEffect`'s data on a gap is a fix.

   | Change | Under the promise? | Kind |
   | --- | --- | --- |
   | `describe.shape` and `ShapeSpec` | Yes | Additions: new names in the promise's list, which its test imports |
   | `fillOpacity` and `strokeOpacity` on `IconShape` | Yes | Optional fields: additions. `iconFromSvg` now keeps them, so an icon whose SVG fades a part with them draws as its SVG does: listed under Fixed |
   | `checkEffect`'s default data marking a gap | Yes | A fix: on the `"gapped line"` fixture, a data effect now gets `gapBefore` after the gap, as on a line chart. An effect that leaves the gap alone passes as before; one that joins across it can now fail, as it should |
   | `update({ on })` and `leave()` on attachments | No: the adapters | Additions |
   | A chart switch's `marks()`, `on()` and `leave()`, and `link()` taking one | No: the charts | Additions. `link()` no longer throws on a switch |
   | `expressive()` reading circles and shapes | No: the adapters | An addition: elements that threw are read. A page's `geometry` still wins, so no page changes |
   | Vega lines with gaps | No: the adapters | An addition: a line that threw is read |
   | tsdown and oxc for the build | The published types | Nothing changes while every exported name has the same type, which the spike checks and `pack-check` tests on TypeScript 5.4, 6 and 7. A difference stops the step |
   | `isolatedDeclarations` | No: the repository | New exports need explicit types. CONTRIBUTING says so |

9. **Attachments' `update()` and `leave()`** (decision 1).
   - **`update({ on })`** on `expressive()`'s attachment and `fromVegaView()`'s swaps the effects of the slots it changes, as a chart's does, through the runner's `swap()`.
     - A slot given the same effect or preset name keeps its runs. A changed slot's runs are cleared and the new effect starts where they were: `decorate` again on every mark, and a held hover replayed with the new hover effect. `enter`, `update` and `exit` draw the new effect's end state where theirs were, so nothing enters again.
     - Focus stays on its mark, and the tab stop where it was.
     - The series the new effects read (`needs`) are found again, so a data effect that reads another series follows it.
     - It returns a promise, as a chart's does, which resolves once the swap is done: at once, since an attachment has no change to settle. It rejects, changing nothing, on an `on` it can't resolve (an unknown preset name), and on any other option, which can't change yet.
   - **`leave()`** ends the hover, pointer or keyboard, as a chart's does: the emphasis, the dimming and the hover effects end, `leave` fires for each mark that was hovered, and focus stays. It ends a link's hover too. It does nothing when nothing is hovered.
   - `refresh()`, `watch` and links work as before.
10. **A chart switch in a link** (decision 1).
    - `link()` takes a `chartSwitch` as a source. It links the view on show: hovering it hovers the others, and their hovers hover it.
    - While a switch plays, both views' marks are hidden and can't be reached, as now, so it neither starts a link's hover nor shows one. When it lands, the link's hover, if there is one, shows in the new view. A hover in the view it leaves ends as the switch starts, as now, and the link hears it end.
    - The switch gets `marks()`, `on()` and `leave()`, each the view on show's, so it's a `LinkSource` and a page can call them as on a chart. `on()` hears only the view on show. `link()`'s types read a switch's rows from its views' charts.
    - A source is in one link at a time: a switch whose view's chart is in a link throws, as a source in two links does, and so does a view's chart whose switch is in one.
11. **`describe.shape`** (decision 4).
    - **The spec:** `describe.shape({ key, series, d, matrix, width, labelBounds })`.
      - `d` is SVG path data in the shape's own px, read as SVG reads it, up to its first error, by the core's `parsePath`.
      - `matrix` moves it into the marks' px, as an element's transform does, arcs too. Default none.
      - `width` is an open shape's stroke width. Default 1, as `describe.line`'s.
    - **Open or closed.** A shape is closed when every subpath ends with `Z`; otherwise it's open.
    - **An open shape is a line.** Its walk runs along the path from its first point.
      - Each move after the first starts a new run after a gap, so a D3 line drawn with `.defined()` comes with its gaps, with no `breaks`.
      - Straight pieces stay straight, and a circular arc (an `A` whose radii are equal after `matrix`) stays an arc. Béziers and other arcs become straight pieces within 0.1 px of the curve.
      - Its outline is open: the stroke, with the gaps left out. Its `thickness`, `bounds`, `center` and `pivot` are as `describe.line`'s.
    - **A closed shape has no direction,** like a point. Its walk is its centre, with length 0, so `travel` and `trace` do nothing on it, and `flash`, `pulse`, `wiggle` and `morph` work on its outline.
      - The outline's `d` is the whole path, holes too. Its `sample(n)` goes round the longest subpath, clockwise on screen, in four quarters of equal length from its upper left, so a circle samples as `describe.point`'s does.
      - Its centre and pivot are its bounds' centre, and its `thickness` is the smaller of its width and height.
    - **Errors.** Path data with nothing to draw throws a `RangeError` naming `d`. So does a `matrix` that isn't six finite numbers, and a `width` that isn't a number of px more than 0, each naming its field, as the other builders do.
    - **The promise.** `describe.shape` and `ShapeSpec` join the effect-author API, as additions. No fixture is added, so `FixtureName` doesn't change: shapes are checked through `checkEffect` in the tests and in the top-level sweep (step 3).
    - **No effect changes.** An open shape is a walk like a line's, gaps included, and a closed one is like a point.
12. **What `expressive()` reads** (decision 5).
    - **A `<circle>`** is a point: `describe.point` at its centre with its radius, through its transforms. Under a transform that stretches it unevenly or skews it, it's read as a shape, an ellipse.
    - **A `<path>`, `<line>`, `<polyline>`, `<polygon>` or `<ellipse>`** is read through `describe.shape`, from its outline as path data, through its transforms.
      - `iconFromSvg`'s conversion of these elements to path commands moves into the core (`src/core/geometry/path.ts`), so the two share it.
      - An open shape's width is its stroke width as drawn, scaled by its transform.
    - **One element a mark.** A key that a circle or a shape shares with another element throws a `TypeError` naming the key. Rects still group into segments by key.
    - Anything else (`<text>`, `<g>`, `<use>`, `<image>`) throws, naming its tag, as now. `geometry` still wins over all of it.
    - **Samples.** A circle with a numeric `value` gets one sample, `{ t: 0, value }`, as a Vega symbol does. Shapes get none: a page gives a curve's with `samples` and `samplesAlong()`.
    - **Order.** Circles and shapes keep document order, as marks described with `geometry` do, and marks round one pivot still go clockwise.
    - **`watch`** notes `x1`, `y1`, `x2`, `y2`, `rx` and `ry` too.
    - `dim`, `keyboard` and `markLabel` work on them as on any mark: a dot takes focus and is named.
13. **Vega lines with gaps, and `checkEffect`'s data** (decision 2).
    - A Vega line's items with `defined: false` are left out, and the next defined item starts a new run: the line is described with `breaks`, and its samples have `gapBefore` after each gap. Vega-Lite 6 breaks a line at a `null` by default, so such a line is now read; the step tests the other `invalid` modes too. A line with no defined item has no mark, as Vega draws nothing.
    - A curve still throws.
    - **`checkEffect`'s default data** on a mark with gaps has a sample at each end of each gap, with its `t` as its value and `gapBefore` on the one after, so a data effect sees the gap as on a line chart. On a mark without gaps it's as now.
14. **The icon sets' faded parts** (decision 2).
    - `IconShape.fillOpacity?: number` and `strokeOpacity?: number`, from 0 to 1, default 1: the fill's and the stroke's own opacity, inside the shape's `opacity`. `defineIcon` checks them, with a `RangeError` naming the shape and the field.
    - `iconFromSvg` keeps `fill-opacity` and `stroke-opacity`, from attributes and inline styles.
      - They're inherited as SVG inherits them: a shape's own value replaces its group's, and they don't multiply, as `opacity` does.
      - Percentages are read, as for `opacity`.
      - A shape gets each only under 1, so every icon it made before comes out the same.
    - The SVG layer sets them as attributes on the shape's `<path>`.
    - `pixels()` takes the unambiguous number pattern `alpha()` uses, so a long run of digits can't make it slow.
15. **The build** (decision 6).
    - **tsdown,** at an exact version, as a dev dependency, replaces tsup. Rolldown's oxc writes the declarations, so the build needs no TypeScript.
    - **`isolatedDeclarations`** goes on in `tsconfig.json`, so TypeScript 7's typecheck requires explicit types on exports. The 18 errors on main are fixed by writing those types out; no published type changes. CONTRIBUTING says new exports need them.
    - **The versions.** `typescript` goes to 7.0.2 and runs `typecheck`. TypeScript 6.0.3 stays as `typescript-6`, for `src/api-docs.test.ts`, which needs TypeScript's JS API, and for `pack-check`. 5.4.5 stays as `typescript-5.4`.
    - **The outputs keep their names,** and `exports` doesn't change: ES modules and CommonJS for the three entries, their declarations (`.d.ts` and `.d.cts`), the stylesheet and its types, and the minified script-tag bundle that sets `ExpressiveCharts`, each with source maps.
    - **The spike comes first.** The step builds with tsdown beside main's build and compares them: the file list, the names each entry exports as an ES module and as CommonJS, each exported name's type (read with TypeScript 6's API), and the sizes. If a published type or an entry's names differ, the step stops and reports to you.
    - **Sizes.** Rolldown bundles and minifies differently from esbuild, so every size moves. A size that grows by more than 1 KB gzip stops the step to ask you. Smaller moves change the budgets, each explained.
    - **The tidy.** Before the switch, architecture.md's size tables are measured again on main, the same code as 0.3.0, so they're 0.3.0's, and the switch is compared with them. The API docs test reads each linked file's anchors once, so its link check stops timing out under load.
16. **The rest.**
    - **Accessibility.** A new script, J, for NVDA + Chrome: the shapes page's dots and shapes heard by name and reached by the arrows, its picker swapping effects with focus kept, the D3 pie's picker on `donut.html` keeping its tab stop, and `morph.html`'s link across a switch. You run it.
    - **Docs.** Each step adds its exports to api.md (`src/api-docs.test.ts` fails otherwise), its sections to architecture.md, and its entries to CHANGELOG, under a new `## Unreleased` above 0.3.0 with Added, Changed and Fixed lists. Each Changed entry says what to write instead. The effects guide says how to check an effect on a curve or an area with `describe.shape`.
    - **Sizes.** `expressive` and `travel` have 0.3 KB of room, the switch's set 0.2, and `describe` and `matrix` 0.4. Steps 1, 2, 3 and 6 add to them. A step that takes a set past its budget raises the budget in the same PR and says why (CONTRIBUTING's Bundle size).
    - **The release** goes as CONTRIBUTING's Releasing says, through trusted publishing. Nothing is published, tagged or released without your go-ahead in that session.

Each step names the files it owns, so steps in the same wave can run in parallel sessions. Files shared by several steps get small edits only, and whichever step lands second merges main first: `package.json`, `src/index.ts`, `src/core/index.ts`, `src/core/geometry/index.ts`, `src/core/geometry/describe/index.ts`, `src/charts/index.ts`, `src/charts/adapter/expressive.ts`, `src/charts/adapter/types.ts`, `src/icons/svg.ts`, `src/charts/render/theme.ts`, `src/conformance.test.ts`, `src/promise.test.ts`, `scripts/size-budget.json`, `src/core/README.md`, `src/charts/README.md`, `src/icons/README.md`, `docs/architecture.md`, `docs/api.md`, `docs/effects-guide.md`, `docs/sketches/api.ts`, `README.md`, `CHANGELOG.md` and this plan. Step 1 owns the attachment's handle in `expressive.ts`, and step 6 its reading. Step 5's explicit types are small edits in files other steps own. Once step 5 lands, `typecheck` requires an explicit type on every new export. The first step to land adds CHANGELOG's Unreleased.

Each step's session reads the hand-over notes in its notes folder first, `plan-0-4.md` from planning among them, and writes its own there: commits, files, decisions beyond the brief, where the plan and the code differ, and follow-ups.

**Wave 1** (parallel):

1. ✅ **Attachments on a par, and Vega lines with gaps** (decisions 9 and 13). Owns `update()` and `leave()` on the handle in `src/charts/adapter/expressive.ts`, `Attachment` in `src/charts/adapter/types.ts`, `src/charts/adapter/vega.ts`, the default data in `src/testing/check.ts`, their tests, and §10's open question 14.
   - Tests:
     - `update({ on })` on D3-style rects, a D3 pie and a Vega view: a hover slot swapped while a mark is hovered by the pointer and by the keyboard; `decorate` started again on every mark; `enter`, `update` and `exit` in their end state; an unchanged slot keeping its runs; focus and the tab stop kept; an unknown preset name, and another option, rejecting with nothing changed; Off; a data effect that reads another series, after a swap; and an attachment in a link.
     - `leave()` after a pointer hover, a keyboard hover and a link's, and with nothing hovered.
     - A Vega-Lite line with `null`s inside it, at its start and end, and all through, in each `invalid` mode, with `threshold` and a riding `travel` drawing nothing inside a gap.
     - `checkEffect`'s default data on the `"gapped line"` fixture, and on a fixture without gaps.
   - **Done when** every existing test passes unchanged, but any that pinned `checkEffect`'s old data on the gapped fixture, each named in the PR.
   - **Built** (27 October 2026) as decisions 9 and 13 describe ([architecture.md](architecture.md#adapters)):
     - **`update({ on })`** on `expressive()`'s attachment, `update(next: { readonly on?: EffectSlots<D> }): Promise<void>` on `Attachment`, and so on `fromVegaView()`'s, which passes on its attachment's. The new `on` goes through the charts' own `nextEffects` (`src/charts/shell/setup.ts`), so a slot given the same effect or preset name keeps its effect and its runs, and the attachment's `needs` check runs against the live marks; then the runner's `swap()` takes the new effects with every live mark. The series data effects read (`needed`, which `refresh()` and `watch` use to make the other marks follow) are found again from the new effects. An attachment's runner is never mid-transition outside `refresh()`, so a held hover replays at once. The method is `async`, so each throw is a rejection, before anything changes: an unknown preset name, a missing series, any key but `on` ("expressive: \`dim\` can't be changed by update() yet. Only \`on\` can."), and `next` that isn't an object.
     - **`leave()`** is the `leave()` the attachment's link port already had: the pointer lets go, so it hovers again when it next moves onto a mark, and the hover ends, the pointer's, the keyboard's or a link's, with its `leave` events, focus and its ring staying. Its own hover ending tells its link, as before.
     - **Vega lines with gaps** (`src/charts/adapter/vega.ts`). `pointsOf` leaves out the items with `defined: false` and marks the next one drawn `gapBefore`, unless none was drawn before it; `lineOf` gives `describe.line` those indices as `breaks` (none on a line without gaps, so its geometry is as before), and `samplesAlong` puts `gapBefore` on the samples. A line whose items are all left out isn't read, so its element isn't attached. What a line's element shows, for telling an update from a move, lists every item, one left out as empty, so a value that goes missing or comes back is an update. The comment that lines can't have gaps is gone, and `pointsOf`'s throw with it.
     - **`checkEffect`'s default data** (`src/testing/check.ts`) is made from the mark: 0 at the start and 1 at the end, as before, and on a mark with gaps a sample at each end of each gap, its `t` as its value and `gapBefore` on the one after.
     - **Tests** (47 new):
       - `src/charts/adapter/expressive.test.ts` (14). `update({ on })` with a hover held by the pointer and by the keyboard: `decorate` started again on every mark, the hover replayed with the new effect, nothing entering, no events, and the dimming, focus, ring and tab stops kept, the new hover playing from then on. Enter, update and exit runs swapped to the new effect's end state, the exit still ending. A slot kept for the same effect and the same preset name, a slot left out emptied, and `update({})`. An unknown preset name, a missing series, another option and `null`, each rejecting with nothing changed. Off. A data effect that `update()` adds reading xG and following it when xG alone is redrawn, and not once it's swapped away. A D3 pie keeping focus and its tab stop. An attachment showing a link's hover. After `destroy()`. And `leave()` after a pointer hover, a keyboard hover and a link's (on the attachment showing it, and on the one it started on), with nothing hovered and after `destroy()`.
       - `src/vega.test.ts` (32). A Vega-Lite line with weeks 3, 6 and 7 missing, in each of the modes that break a line (the default, `"break-paths-show-path-domains"`, `"break-paths-show-domains"` and `"break-paths-filter-domains"`): its gaps where the weeks are missing, its vertices Vega's, and its samples with `gapBefore` after each gap, the page's `sample` never called on a missing week; `threshold` against xG and a riding ball, in Presentation and Off, drawing nothing inside a gap on any frame (`drawnInGaps`), with the red runs worked out from the data. Weeks missing at the line's start and end; every week missing, in those modes and `"filter"`, giving no mark; `"filter"` joining the weeks across; `"show"` and `null` drawing the missing weeks at zero, and the page's `sample` throwing on a `null` there. Renders that open the gaps and close them, each an update. Every built-in effect through `checkEffect` on the View's line with gaps, with the default data and with the View's own samples. `update({ on })` on the View's line (`threshold` added with focus and the tab stop kept, following new data, an unknown name rejecting), and a hover held by the pointer and by the keyboard replayed, with `leave()` ending each.
       - `src/testing/check.test.ts` (1): the default data on the `"gapped line"` fixture and its moved twin, on a line of values alone (a gap from 0, two that touch and one to 1), and on lines without gaps.
       - 26 of the Vega tests fail on main's `vega.ts`. 2,106 tests pass, and 2,115 with step 4 merged; every existing test passes unchanged. None pinned `checkEffect`'s old data on the gapped fixture: the effects sweep and the conformance tests pass with the new data. `src/api-docs.test.ts`'s link check and `src/charts/bar-layout.test.ts`'s "leaves none overlapping" each timed out once under load (5 s) and passed when run again.
     - **Sizes** (gzip, with step 4 merged): `expressive` and `travel` 27.0 KB of 27 (27,632 bytes of 27,648; 26.7 on `135bb31`), everything 72.5 of 76.5, the script-tag bundle 78.9 of 83.5, `dist/index.js` 105.7 of 111. No budget changes, since none is over, but `expressive` and `travel` have 16 bytes of room, and steps 3 and 6 add to that set.
   - **Decisions beyond the plan:**
     - **`update()` takes only `on` in its type,** `{ readonly on?: EffectSlots<D> }`, rather than every option. Another option is a type error, and rejects at run time for JavaScript. An option that can change later widens the type, which is an addition.
     - **A series a new data effect needs and the marks don't have rejects too,** as on creation and in `refresh()`, and as a chart's `update({ on })` does. Decision 9 names only an unknown preset name and other options.
     - **`update({})` changes nothing, and `update({ on: undefined })` empties every slot,** as on a chart. After `destroy()`, `update()` resolves, changing nothing, as a chart's does.
     - **`leave()` on an attachment showing a link's hover ends it there only,** as a chart's `leave()` does: the link's other sources keep theirs, and the link isn't told.
     - **A line's datum is still its first item's row,** which may be a missing week's: the path Vega draws is bound to that item. `key` reads fields, so it's the same for every item.
     - **In `"show"` and `null` modes,** Vega draws a missing value at zero (or the scale's minimum), so it's a point like any other, and the page's `sample` gives its value there; a `sample` that gives `null` throws, as before. The test gives `value ?? 0`. `"filter"` leaves the rows out, so the line is joined across them, as Vega draws it.
     - **The default data's samples at one `t`** (a gap from 0, or the touching gaps either side of a value alone) are one sample, with `gapBefore` if either had it, so `t` never repeats.
   - Docs: architecture.md (Adapters, and Vega and Vega-Lite), api.md (`Attachment`, `VegaAttachment`, `checkEffect`), README's Adapters line, CHANGELOG (the methods and Vega's gaps under Added, `checkEffect`'s data under Fixed).
2. ✅ **A chart switch in a link** (decision 10). Owns `src/charts/switch.ts`, `src/charts/link.ts`, and their tests.
   - Tests: a switch linked with a bar chart, and with an attachment: hovering the view on show hovers the others and the other way round, by pointer and by keyboard; a switch started while it's hovered, and while a link's hover shows in it; a link's hover that comes mid-switch, shown when it lands; a switch back; `effects: false`; `marks()`, `on()` and `leave()` on the view on show; the hidden view never hovered; a switch and its view's chart in two links, throwing; the switch destroyed; and the types (`by` given the views' rows).
   - **Done when** every existing test passes unchanged, but `link.test.ts`'s that pinned the throw on a switch, named in the PR.
   - Docs: architecture.md (Linked hover, Switching between charts), api.md (`link()`, `ChartSwitch`), README's Charts line, CHANGELOG (Added).
   - **Built** (27 October 2026) as decision 10 describes ([architecture.md](architecture.md#linked-hover)):
     - **The switch's port** (`src/charts/switch.ts`), registered with `linkable()` for its handle, is made of its views' charts' ports (`portOf`). While the switch rests, its targets and hovers are the view on show's, and it passes on that view's own hovers, their ends and Escape. Mid-switch it has no targets, and it remembers whether the link has a hover for it from another source; `unlink()` and the switch's `leave()` forget it. When the switch lands (with motion off, at once), after focus has moved, it tells its link, which shows that hover in the new view.
     - **`link()`** (`src/charts/link.ts`) keeps the hovered marks' linking values, so a source that says it can be reached again (`shown()`, new on the internal `LinkListener`) gets the link's hover in its targets as they are now. A port's `parts`, a switch's views' charts' ports, go into a link with it: a switch whose view's chart is in a link throws, and so does a view's chart whose switch is in one, or the two in one link. The messages name chart switches, and "A chartSwitch can't be linked yet" is gone.
     - **The handle:** `on()`, `marks()` and `leave()` on `ChartSwitch`, the view on show's (`current`'s). `on()` listens to every view's chart and passes on the events of the view that's `current`. Its rows are the views' charts' (`RowsOf` over what the views' functions return, a view that may be left out counting when it's there), so a switch is a `LinkSource` and `link()`'s `by` reads them.
     - **Tests** (19 new; 1 changed): `link.test.ts` 14, in "link: a chart switch", with a donut and columns of shots per matchweek: the view on show with bars both ways, by the pointer and the keyboard, and the hidden view never hovered or linked; the new view after a switch; D3 columns through `expressive()`, both ways, before and after a switch; a switch started while its view is hovered (the link and `on()` hear the leave) and while it shows a link's hover (hidden, then shown when it lands); a link's hover that comes mid-switch, the latest shown, and one that ends mid-switch; a switch back; motion off; focus carried into the new view hovering the bars again; `effects: false`; `leave()`, at rest and mid-switch; a switch and its views' charts in two links, every way round; the switch destroyed, at rest and mid-switch, freeing its views' charts; and `by` and `on()` typed by the views' rows. `switch.test.ts` 3, in "chartSwitch: the view on show": `marks()` before, during and after a switch; `on()` hearing only the view on show, the old view's leave at the start, and its unsubscribe; and `leave()`. And 2 in "chartSwitch: hover and focus": a `leave` listener calling `show()` for the view a switch is heading for (one switch, both promises settled), for the view it's leaving (it lands back at once), and calling `destroy()` (nothing starts); both fail on the switch without the guard. **The test changed:** `link.test.ts`'s "can't put a source in two links, or link what isn't a chart or attachment" pinned the throw on a switch, with its `@ts-expect-error`; it now links the switch. 2,076 tests in 102 files pass, and 2,134 with steps 1, 4 and 5 merged. Each of four mutations (no landing call, the hidden view's hovers passed on, the old order in `show()`, `leave()` keeping a held hover) fails the new tests.
     - **Sizes** (gzip, against main `135bb31`): the switch's set 42,102 B, 41.1 KB of 41 (316 B more), raised to 45.5, the size plus 10%, as CONTRIBUTING says. `expressive` and `travel` (26.7 KB), `barChart` (31.1) and the line page's set (37.8) are unchanged; everything 72.6 of 76.5, the script-tag bundle 79.1 of 83.5, and `dist/index.js` 105.8 of 111. With steps 1, 4 and 5 merged, built by tsdown: the switch's set 42,104 B against main's 41,713 (391 B more, the guard below included), 41.1 KB of 41, so still raised to 45.5. The other sets are the same as main's. Main's `expressive` and `travel` was 27,684 B, 36 B over its 27 KB with steps 1 and 5 together (each fitted alone), so this PR raises it to 30, the size plus 10%.
   - **Decisions beyond the plan:**
     - **The old view's hover ends before `current` changes.** `show()` set `current` first, then ended the old view's hover, so the switch's `on()`, which hears the view that's `current`, would have missed that `leave`, and a page's hover panel would stay up. Now the hover ends while the old view is still `current`, and its `leave` listeners read the view being left. CHANGELOG lists it under Changed.
     - **A `show()` from a `leave` listener waits** (from Codex's review on PR #98). With the hover ending before `current` changes, a listener that called `show()` started a second switch over the first, whose promise never settled. Now a `show()` called while the old view's hover ends runs once the switch has begun, through the usual paths: the same promise for the view it's heading for, a switch back for the view it's leaving, a landing first for a third. A `destroy()` there stops the switch from starting.
     - **While a switch plays, `marks()` and `on()` are the view it's heading for's,** as `current` is: neither view can be reached, and the new view's marks are what will show.
     - **A held hover goes by linking values, not keys.** The link keeps the values of the hovered marks and hovers the new view's targets with them when the switch lands, so a switch back or to a third view shows the latest hover, read with `by` from the new view's rows.
     - **Focus first.** As a switch lands, focus carried into the new view hovers its mark, as a key press would, before the link's hover shows; that's the newer hover, so the link shows it, as for any source.
     - **`leave()` on the switch forgets a held hover,** mid-switch too, until the link's next hover, as `leave()` on a linked chart ends the link's hover there.
     - **`ChartSwitchView` doesn't change.** The switch reads a view's chart's `on()` and its link port where it has them, so a page's own view without them still works, unheard and unlinked. The reference charts have both.
     - **README:** "the Charts line" is read as the Switching and Linked hover lines of What's in it, since the Charts line names only the three charts.
     - **CHANGELOG:** `## Unreleased`, with Added, Changed and an empty Fixed, as step 4's branch has them, so whichever lands second merges little.
3. ✅ **`describe.shape`** (decision 11). Owns `src/core/geometry/describe/shape.ts` (new), the flattening of curves in `src/core/geometry/`, `shape` in `describe/index.ts`, `ShapeSpec`'s exports, `describe.shape` in the promise's list and `src/promise.test.ts`, the shape sources in `src/conformance.test.ts`, and the sketch's `describe.shape`.
   - Tests:
     - Every path command, relative and absolute; Béziers within 0.1 px of the true curve; circular arcs kept, and elliptical, rotated or skewed ones flattened; `matrix`; and each `RangeError`.
     - A path with several moves, as d3's `.defined()` draws it, giving gaps.
     - Open and closed shapes' walks, outlines, `sample(n)` in quarters, bounds, centres and thickness; a closed shape with a hole; and a path of 10,000 points, in good time.
     - The geometry invariants on shapes.
     - Every built-in effect through `checkEffect` on an open curve, a closed area and an area with a hole, and the top-level sweep's new sources: a D3 line drawn with `curveMonotoneX`, the same with `.defined()`, and a D3 area, each described with `geometry` and `describe.shape`, with nothing drawn inside a gap.
   - **Done when** every existing test passes unchanged, and every built-in effect passes `checkEffect` on shapes.
   - Docs: architecture.md (Mark geometry and its Builders), api.md (`describe.shape`, `ShapeSpec`), the effects guide (checking an effect on a curve), the sketch, CHANGELOG (Added, and the promise's list).
   - **Built** (27 October 2026) as decision 11 describes ([architecture.md](architecture.md#shapes)):
     - **The builder** (`src/core/geometry/describe/shape.ts`). `describe.shape(spec: ShapeSpec): MarkGeometry`, on `describe` beside the others, with `ShapeSpec` exported from the core and so from the package. It reads `d` with `parsePath`, moves it with `transformPath` when there's a `matrix`, and flattens it. An open shape's walk joins its subpaths with a straight piece across from each to the next, a gap in `t` by the walk's own sums, so the walk ends at exactly 1. A closed shape's walk is its bounds' centre, as a point's is.
     - **The flattening** (`src/core/geometry/flatten.ts`, internal). `flattenPath(commands)` gives each subpath's start, end, segments and whether it ends with Z. A Bézier becomes straight pieces at equal steps of its parameter, as many as h²/8 times its largest second derivative needs to stay within 0.1 px: a gentle D3 curve is one or two pieces between its points. An arc is centred by SVG 1.1's F.6.5, its radii scaled up as F.6.6 says. It's a circular arc when its radii are equal to within a billionth of the larger, and otherwise straight pieces at equal steps of its angle, by the same bound with its larger radius. One curve makes at most 10,000 pieces.
     - **The closed outline** (`loopOutline`, internal, in `src/core/geometry/outline.ts`). The longest subpath is turned clockwise by its signed area, arcs counted exactly, and started at its upper left, split there when that's inside an arc. It's sampled a quarter at a time from each quarter's own start, so the corners are the same points for any n. Its `d` is that subpath first, then the others, every one turned with it.
     - **Errors.** `describe.shape: d must start with a move and draw something after it, got "M0,0".`, with long path data cut short at 40 characters; `d must be path data, a string`; `d must stay finite once moved by matrix`; `matrix must be six finite numbers [a, b, c, d, e, f]`; and `width must be a finite number more than 0`. `labelBounds` is checked as the other builders check it.
     - **Tests** (168 new). `flatten.test.ts` (12): every command, relative and absolute; Béziers and elliptical arcs within 0.1 px of the true curve, both ways, rotated, stretched and skewed; circular arcs kept, by each flag, through a turn and an even scale; radii scaled up, a radius of 0 and an arc to its own start; subpaths after Z and lone moves. `describe/shape.test.ts` (23): open and closed shapes' walks, outlines, quarters, bounds, centres and thickness; a straight D3 line with `.defined()` the same mark as `describe.line` with its breaks; a D3 curve with gaps; a rectangle written five ways; a circle sampled as `describe.point`'s, either way round; holes, either way round; a D3 area and a full D3 ring; each `RangeError`; and three paths of 10,000 points, a curve, a curve with 100 gaps and an area, described and walked in under 2 s (about 0.15 s here). The geometry invariants on six shapes and a curve with gaps (47). `src/conformance.test.ts` (86): four sources described from their path data with `describe.shape` through `expressive()`'s `geometry`: a D3 curve with `curveMonotoneX`, the same with `.defined()` over the season with missing weeks, D3 areas, and two full D3 rings moved into place with `matrix`. Each runs through the sweep, drawn again for check 5, with the curve with gaps in the gap sweep, `threshold` with the adapter's samples on the curves, and `morph` with each `align` between shapes and from a shape to a bar and a slice. 2,227 tests in 104 files pass, and every existing test passes unchanged. Two tests elsewhere, in `long-axes.test.ts` and `bar-layout.test.ts`, timed out once with other sessions' suites running (5.5 and 5.1 s against 5 s), and passed run again.
     - **Sizes** (gzip, built by tsdown with steps 1, 4 and 5 merged; main at `5d48699` in brackets): `describe` and `matrix` 7.2 KB (4.3), `expressive` and `travel` 29.9 (27.0), `barChart` 33.9 of 34 (31.1), the line page's set 40.7 (37.8), the switch's set 42.6 (40.7), everything 74.2 (72.4), `dist/index.js` 107.2 (104.5), the script-tag bundle 74.1 (72.3), `dist/testing.js` 21.9 (17.6) and `dist/testing.cjs` 16.9 (12.9). `describe` is one object, so every page that imports it carries `describe.shape`'s path reading and flattening, about 3 KB: the reader 1.2, the flattening 1.2, and the builder and closed outline the rest. That's the charts too, which build their marks with `describe`, and the testing entry, whose fixtures do. Six budgets are raised to the size plus about 10%, as CONTRIBUTING says: `describe` and `matrix` 5 to 8, `expressive` and `travel` 27 to 33, the line page's set 39 to 45, the switch's set 41 to 47, `dist/testing.cjs` 14 to 19 and `dist/testing.js` 19.5 to 24.5. On main, `expressive` and `travel` was already a few bytes over its 27. The sport pack takes `formatNumber` from `path-data.ts` rather than the geometry's index: under tsup it would otherwise have grown 3.6 KB, to 13.6, and under tsdown it stays at 4.0 either way, so the edit keeps it from depending on how the chunks split.
   - **Decisions beyond the plan:**
     - **A subpath that ends where it started is closed,** as well as one that ends with Z. `d3.arc()` draws a full ring's outer edge with no Z, so by Z alone a donut of one slice was an open line.
     - **A path whose subpaths are all closed but have no length is open.** d3 draws a value alone as `M x,y Z`, so a line of values alone is a line with nothing to stroke, as `describe.line` gives it, not an area of no size.
     - **A move with nothing after it is left out,** as SVG draws nothing for it. Path data with only moves, or that doesn't start with one, has nothing to draw, so it throws.
     - **A closed shape's outline starts at its first corner and runs clockwise,** as every other closed outline's does, so shapes keep the geometry invariants unchanged. If the longest subpath ran anticlockwise, every subpath is written the other way round, which fills the same with either fill rule. A subpath with no length is left out of it.
     - **The outline's `d` is flattened too,** so path data keeps to `M`, `L`, `A` and `Z`, which architecture.md's conventions, `measurePath` and `drawnInGaps` expect.
     - **The upper left** is the point with the least x + y, and of two within 1e-9 px, the higher.
     - **A gap only where the pen moves:** a later move to where the pen already is leaves none, as a break between two points in one place does.
     - **Bounds hold every point of the path,** a closed shape's points alone too. An open shape's are padded by half its width, as a line's are; a closed shape's aren't.
     - **Coordinates past the largest number throw,** naming `d`, whether a matrix or huge radii take them there, rather than giving a mark with `NaN` in it.
     - **The sport pack takes `formatNumber` from `path-data.ts`,** a one-line edit outside the step's files, so it doesn't carry the builders through the geometry's index. The fixtures stay on `describe`: taking the builders one by one shrank the testing entry, but moved `motion` and `animated` over their budget, by how esbuild split the chunks.
     - **The invariants' open shapes join smoothly.** The arc-length check sums 400 chords, which cut each sharp corner by up to 0.1 px, so the shapes there are curves whose pieces join without corners. Corners are tested in `shape.test.ts`.
4. ✅ **The icon sets' faded parts** (decision 14). Owns `fillOpacity` and `strokeOpacity` in `src/core/contracts/icon.ts`, `src/icons/define.ts`, `src/icons/svg.ts`, the icons in `src/charts/render/layer.ts`, and their tests.
   - Tests: a shape with each, through `defineIcon` and `iconFromSvg`, in icons written for the tests; inheritance through groups, with a shape's own value replacing its group's; percentages; the `RangeError`s; the SVG as drawn; and `pixels()` given a long run of digits followed by junk, in good time.
   - **Done when** every existing test and baseline passes unchanged.
   - Docs: architecture.md (Icons), api.md, `src/icons/README.md`, CHANGELOG (the fields under Added, `iconFromSvg` under Fixed).
   - **Built** (27 October 2026) as decision 14 describes ([architecture.md](architecture.md#icons)):
     - **The fields.** `fillOpacity?: number` and `strokeOpacity?: number` on `IconShape` (`src/core/contracts/icon.ts`). `defineIcon` checks them as it checks `opacity`, in one loop, and copies them: one that isn't a finite number from 0 to 1 throws a `RangeError` such as `defineIcon: "flag" shapes[1].fillOpacity must be from 0 to 1, got 1.5.`
     - **`iconFromSvg`** reads `fill-opacity` and `stroke-opacity` from attributes and `style`, on the root, groups and shapes, with `alpha()`, as it reads `opacity`. Each is inherited: a shape's own replaces its group's, an inner group's replaces an outer one's, and one that can't be read (`inherit`, `half`, an empty value) leaves the one above. They're rounded to 0.001. A shape gets `fillOpacity` only when it's filled and `strokeOpacity` only when it's stroked, each only under 1, so every icon it made before comes out the same.
     - **The SVG layer** sets `fill-opacity` and `stroke-opacity` as attributes on the shape's `<path>`, beside `opacity`, so SVG multiplies them as it draws, and neither where the shape has none. The recording layer records an icon by its name, so it needed nothing.
     - **`pixels()`** reads its number with `alpha()`'s pattern, and its unit as `\s*(?:px\s*)?$`, so neither the digits nor the spaces after them can be matched two ways. The old pattern took 23 s to refuse a `width` of 100,000 digits followed by a letter, and the spaces before a letter were slow too; both are refused at once now.
     - **Tests** (9 new, every icon in them written for them): `define.test.ts` 2 (a tag whose fill is faded inside its outline, kept as given, and the `RangeError`s), `svg.test.ts` 6 (the tag in Lucide's stroked style; inheritance through groups, with a shape's own replacing its group's, `style` beating attributes, and `inherit` and unreadable values leaving the group's; percentages, clamping and rounding; each written only on a filled or stroked shape; a fill or stroke at 0 dropped, and a shape with neither; a long fill opacity, stroke opacity, width and height read quickly), `surface.test.ts` 1 (the SVG as drawn, and nothing set for shapes without them). 2,068 tests pass. One existing test changed (below). No baseline could change: no icon in the demos or the library has either field, and no demo uses `iconFromSvg`.
     - **Sizes** (gzip, measured in bytes against main): `expressive` and `travel` 26.7 KB of 27 (19 B more, 287 B left), the switch's set 40.8 of 41 (19 B, 179 B left), the line page's set 37.8 of 39 (18 B), `barChart` 31.2 of 34 (16 B), everything 72.3 of 76.5 (88 B), the script-tag bundle 78.7 of 83.5 (104 B), and `dist/index.js` 105.3 of 111 (178 B, comments included, since it isn't minified). No budget changes.
   - **Decisions beyond the plan:**
     - **A fill or stroke faded to 0 is dropped,** as `fill="none"` is, and a shape with neither left is dropped, as one with an opacity of 0 is. So an SVG whose parts are all faded out has nothing to draw, and says so. `defineIcon` keeps a 0 it's given, as it does an `opacity` of 0.
     - **One that can't be read leaves the group's,** since these are inherited, where an `opacity` that can't be read counts as 1. `alpha()` now gives `undefined` for a value it can't read, and each caller picks its fallback.
     - **Rounded to 0.001,** as opacities and stroke widths are, though there's no product to round.
     - **`pixels()` takes `alpha()`'s number whole,** sign and all, so a root's `width="+32"` or `width="32."` is now read as 32 px; before, the root had no size and the SVG threw "needs a viewBox". A width of 0 or less is still refused.
     - **One existing test changed,** which the plan's "unchanged" didn't foresee: `svg.test.ts`'s "drops shapes with an opacity of 0, and fill-opacity and stroke-opacity" pinned the old drop. It's now "…, but keeps fill-opacity and stroke-opacity", and its last shape has `fillOpacity: 0.5` and `strokeOpacity: 0.5`, from the same SVG.
5. ✅ **TypeScript 7 builds the declarations, and the tidy** (decisions 6 and 15). Owns the dev dependencies in `package.json` and the lockfile, `tsup.config.ts` (replaced by tsdown's config), `tsconfig.json`, the explicit types (small edits in `describe/index.ts`, `matrix.ts`, `segment.ts`, `gaits.ts`, `theme.ts` and `src/registries.ts`), `scripts/size.mjs` and `scripts/pack-check.mjs` as they need it, `src/api-docs.test.ts`, `src/package.test.ts`, architecture.md's Build outputs and Bundle size, and CONTRIBUTING's toolchain lines.
   - Checks: architecture.md's sizes measured on main first; the spike's comparison; `typecheck`, timed; `build:site`; `pack-check` on 5.4, 6 and 7; and CI on Node 22 and 24.
   - **Done when** `npm run typecheck && npm test && npm run build`, `npm run size` and `npm run pack-check` pass with tsdown, `typescript` is 7, and the published types are the same.
   - Docs: architecture.md (Build outputs, Bundle size), CONTRIBUTING, README only if its TypeScript line changes, and CHANGELOG only if the published package changes.
   - **Built** (27 October 2026) as decisions 6 and 15 describe, the tidy and the spike first ([architecture.md](architecture.md#build-outputs)):
     - **The tidy, on main's code.** architecture.md's size tables and the package's size are 0.3.0's, measured again on main (`135bb31`, the same code): everything 72.2 KB gzip, `barChart` 31.1, the script-tag bundle 78.6, and the tarball 37 files, 1.4 MB packed and 5.2 MB unpacked. The API docs test finds each linked Markdown file's anchors once (`anchorsIn`), not once a link: api.md's link check takes 38 ms, not 671, and README's 7, not 117.
     - **tsdown 0.23.2** (`tsdown.config.ts`), a dev dependency pinned exactly, replaces tsup. It runs Rolldown 1.2.15, the one Vite 8 has, and rolldown-plugin-dts 0.29.0-beta.2, whose oxc writes the declarations from each file alone. The build needs no TypeScript: it builds the same with `typescript` 7, which has no JS API.
     - **`isolatedDeclarations`** is on in `tsconfig.json`. The seven exports it found in `src` have their types written out as the declarations already printed them: `describe`, `matrix` and `gaits` as objects of `typeof` their functions, `TAU` and `stylesheet` as `number` and `string`, and the registries as `Registry<PresetFactory>` and `Registry<Icon>`. `vitest.config.ts`'s default export is a `ViteUserConfig`, and `tsup.config.ts` is gone.
     - **The config** builds what tsup did: ES modules with shared chunks, and their declarations; each CommonJS entry, and its `.d.cts` declarations in shared chunks; the stylesheet's types, from `src/style.css.ts`; and the minified script-tag bundle, `expressive-charts.global.js`, setting `ExpressiveCharts`. All have source maps, for ES2020. JSDoc is left out of the scripts, since the declarations carry it, and the CommonJS files and the script-tag bundle are in strict mode and set `__esModule`, as esbuild's were. `onSuccess` writes the stylesheet's text.
     - **The comparison** of tsdown's build with main's, before anything else changed (the scripts are in the step's notes):
       - **The files:** the same 33 in `dist/` but the hashed chunks' names. The three ES module chunks are named by their first module (`define-…`, `path-data-…`, `transition-…`), not `chunk-…`, and the two declaration chunks have new hashes. The stylesheet is byte for byte the same; its types are `export {}`, as before.
       - **The names:** each entry's names as an ES module and as CommonJS (55, 3 and 6) are the same, with each value's kind, an object's keys and a function's arity, and so are `ExpressiveCharts`'s 55.
       - **The types,** read with TypeScript 6.0.3's API, in the `.d.ts` and the `.d.cts` files: all 227 declarations print the same, by name, type and documentation. Every export of the four entries has the same name, kind and type, identical by TypeScript's identity relation; `link`, `only`, `parallel`, `sequence` and `stagger` are assignable both ways instead, since a generic function whose result is a conditional type isn't identical even to a copy of itself (main against a copy of main says the same). A field changed in a copy of the build was caught.
       - **The target:** every script parses as ES2020.
       - **The sizes** (gzip, against main): the script-tag bundle 72.0 KB, 6.6 less; `sport.js` with its chunks 4.0, 5.0 less; `testing.js` 17.5, 3.2 less; `index.js` 104.0, 1.1 less; the CommonJS entries 0.4 to 2.2 less; `expressive` and `travel`, and the line page's set, 0.05 more; the other large sets a little less. `motion` and `animated` grew by 0.74, to 2.4, and `describe` and `matrix` by 0.71, to 4.3: under the 1 KB that would have stopped the step, but past their budgets.
       - Nothing published differed and no size grew by 1 KB, so the step went on.
     - **The versions:** `typescript` 7.0.2 runs `typecheck`, still by its path (`node node_modules/typescript/bin/tsc`); `typescript-6` (`npm:typescript@6.0.3`) runs `src/api-docs.test.ts`; `typescript-5.4` stays. `typescript-7` and tsup are gone. The four projects took 1.4 s in three runs, on a machine shared with other sessions.
     - **Budgets:** `motion, animated` from 2 to 3 KB and `describe, matrix` from 4 to 5, for the growth above. The script-tag bundle's from 83.5 to 79.5, `sport.js`'s from 10 to 4.5 and `testing.js`'s from 21.5 to 19.5, their sizes plus 10%, as CONTRIBUTING allows after a change that makes something much smaller.
     - **Checks:** `typecheck` (TypeScript 7), 2,059 tests in 102 files, the build, the size check, `pack-check` on 5.4.5, 6.0.3 and 7.0.2 (37 files, 1.36 MB packed and 5.07 MB unpacked), and `build:site` pass. CI on Node 22 and 24 runs with the PR.
     - **Docs:** architecture.md (Build outputs, Bundle size), CONTRIBUTING (the TypeScripts, explicit types on new exports, the Node versions the build needs), CHANGELOG (Changed). README's TypeScript line didn't change.
   - **Decisions beyond the plan:**
     - **Each CommonJS entry is a file of its own.** Rolldown shares chunks between CommonJS entries too, which made `testing.cjs` with its chunks 4.5 KB bigger than tsup's and `sport.cjs` 1.3 KB, past the 1 KB that stops the step. Built one entry at a time, as tsup built them, each is a little smaller than before. Shared, CommonJS would have one copy of the runtime across its entries, as ES modules have; tsup's never did, so nothing changes.
     - **The scripts match esbuild's where it shows:** no JSDoc (Rolldown kept it, and `dist/index.js` was 26 KB bigger gzipped), strict mode, `__esModule`, and no `Symbol.toStringTag` on the CommonJS exports.
     - **The small sets' growth stays, with their budgets raised.** Rolldown puts code that only `index` uses in `index.js` itself, `animated` and `matrix` among it, so a page that imports them keeps `index.js`'s top-level tables: the stylesheet's text and the theme's tokens (`theme.ts`), the time axis's steps (`time.ts`) and the gaits' still pose (`gaits.ts`). A Rolldown chunk group for the core fixed it, but named chunks after the entries that share them (`core~index~icons/sport~testing-…`, a folder among them) and moved the declarations into them. The fix belongs in those files.
     - **The sketches, the visual tests and the media scripts turn `isolatedDeclarations` off** in their tsconfigs, which extend the root's. Planning counted the main project's 18 errors; those three projects had 9 more, in the effects guide's worked examples, the API sketches and the two Playwright configs, none of them built. The examples stay as an author would write them.
     - **The stylesheet's types have a build of their own** that keeps only declarations: tsdown writes a CommonJS script for any entry, so a small plugin in the config drops it.
     - **`onSuccess` imports `theme.ts` with its extension,** through a cast, since tsdown loads the config with Node, which needs one.
     - **Three budgets came down,** so their room isn't spent by accident, and architecture.md's tables show tsdown's sizes beside 0.3.0's until step 8 measures 0.4.0's.

**Wave 2** (after steps 1, 3 and 4 land):

6. ✅ **`expressive()` reads circles and shapes** (decision 12). Owns reading in `src/charts/adapter/expressive.ts`, the shapes' outlines moved from `src/icons/svg.ts` into `src/core/geometry/path.ts`, the attributes in `src/charts/adapter/watch.ts`, the `geometry` option's words in `types.ts`, and their tests.
   - Tests:
     - D3 scatters: `<circle>`s in a group with a transform, with `value`, `markLabel`, `keyboard` and `dim`; Observable Plot's dot mark; and a circle under an uneven scale.
     - A D3 line drawn with `curveMonotoneX`, with `.defined()`, and followed by `watch` through a transition; a D3 area; `<line>`, `<polyline>`, `<polygon>` and `<ellipse>`; and a stroke width scaled.
     - A key shared by a circle and another element; other tags throwing; and `geometry` still winning.
     - The top-level sweep's sources read by tag, with no `geometry`. `iconFromSvg`'s tests pass unchanged with the conversion moved.
   - **Done when** every existing test passes unchanged, but `expressive.test.ts`'s that pinned the throw on a `<path>`, named in the PR.
   - Docs: architecture.md (Adapters), api.md (`expressive()` and its `geometry`), README's Adapters line, CHANGELOG (Added).
   - **Built** (27 October 2026) as decision 12 describes ([architecture.md](architecture.md#adapters)):
     - **Reading** (`src/charts/adapter/expressive.ts`). Without `geometry`, each element's tag is checked as it's read: a `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<path>`, `<polygon>` or `<polyline>` is read, and any other throws a `TypeError` naming the tag ("<rect>, <circle>, <ellipse>, <line>, <path>, <polygon> and <polyline> are read; describe others with the geometry option."). A key that a circle or a shape shares with another element throws a `TypeError` naming the key and the shape's tag. Rects group into bars as before. Each circle or shape is read by `shapeMark`, through the same matrix as a rect (`transformOf`: its parent's CTM, then its own `transform` attribute, never an effect's CSS transform).
       - **A circle** under a matrix that keeps circles round (`keepsCircles`, new in `space.ts`: its columns the same length and at right angles, to within 1e-4 of their squared length) is `describePoint` at its centre, its radius scaled by `scaleOf` (the square root of the determinant), each rounded to 0.001 px as a rect's box is. Otherwise it's read as the other tags are.
       - **The other tags** go through `describeShape`, with the matrix as its `matrix`: a path's own `d`, unrounded, and the others' outlines from `shapeOutline`, written out with `formatPath`. Both builders are imported by name from `src/core/geometry/describe/`, as #101 did for the others.
       - **An open shape's width** is `strokeWidthOf` (new in `host-style.ts`): the computed `stroke-width`, as a browser computes it. Where computed styles don't read presentation attributes (jsdom), a computed 1, the initial value, gives way to the nearest `stroke-width` attribute on the element or above it, passing over one that isn't a length in px and stopping at an inline style, which jsdom computes. It's scaled by `scaleOf` and rounded to 0.001; 0 or none reads as 1 px. The part keeps it in its own units, so `watch` reads no styles a frame.
       - **Lengths** come through `attributesOf` (new in `space.ts`, which `rectOf` now uses too): `baseVal.value` where the browser has it, so percentages and units resolve, else the attribute as written.
       - **Order.** Bars alone keep their visual order. With any circle or shape among the marks, every mark is sorted by its first element's place in the source, then put through `ringOrder`, as `geometry` marks are. `visual()`, which `watch` uses, does the same, and `edgesNow` and `reread` find baselines among the bars' records only.
       - **Samples.** A circle with a numeric, finite `value` gets `[{ t: 0, value }]` without `samples`.
       - **`segment`** names a circle's or a shape's `series`, passed to `describePoint` or `describeShape`.
       - **A browser's computed styles** (`attributesComputed` in `host-style.ts`, from Codex's review). Whether computed styles read presentation attributes is found once a root `<svg>`, with a probe: a `<g stroke-miterlimit="7">` put in the root, its computed value read, and taken out at once. Where they do, a browser, the computed width and colours are taken as they are; jsdom keeps the fallback to the attributes. `paintOf`, which reads the host's colours, takes it too, so a fill the page's CSS sets to black over a `fill` attribute now reads as black in a browser, not as the attribute's colour (a fix to 0.3.0's adapter, under CHANGELOG's Fixed).
       - **`watch`** notes `rx`, `ry`, `x1`, `y1`, `x2` and `y2` too (`src/charts/adapter/watch.ts`). `reread` reads changed circles and shapes again, with the stroke widths the last full read found.
     - **The outlines** (`src/core/geometry/path.ts`). `iconFromSvg`'s `outline()`, with `ellipse()` and `rect()`, moved into the core as `shapeOutline(tag, attribute)`, internal, with `ShapeAttribute`, a getter: `iconFromSvg` passes its attribute map's `get`, and the adapter `attributesOf(element)`. `iconFromSvg`'s tests pass unchanged, and `iconFromSvg` alone bundles to 6,043 bytes gzip, 3 fewer.
     - **Types** (`src/charts/adapter/types.ts`): the words of `key`, `segment`, `geometry`, `samples`, `watch` and `marks()`. No type changed.
     - **Tests** (143 new; 2 changed):
       - `src/charts/adapter/expressive.test.ts` (18), in "expressive: circles and shapes": circles as points in document order; through a group's move, a turn and an even scale, and as ellipses under `scale(2,1)` and a skew; a radius of 0, under an uneven scale too; a `<path>` (open and closed), `<line>`, `<polyline>`, `<polygon>` and `<ellipse>`, each the same mark as `describe.shape` gives their path data; a shape moved through its transforms, arcs too; the stroke width from the element, its group, its margin group, an inline style and a style sheet (a browser's computed value, which jsdom lacks, stubbed), scaled evenly and unevenly, 0 as 1 px, and 50,000 digits of junk passed over at once; a 1 px that a browser computes from a style sheet kept over a group's 6 and over the element's own 6, and an inline 1 px over the element's own attribute; and, in "expressive: hover colour", a black a browser computes from a style sheet kept over the series group's fill; `segment` naming series that a data effect reads; a circle's one sample, none for a value that isn't a number, a shape or no `value`; document order with a bar among circles and a line, the arrow keys following it, and bars alone top to bottom; shapes that draw nothing left out and entering once they draw; the shared key (rect and circle, path and rect, circle and path, two circles without `segment`) and two rects still a bar's segments; `<text>`, `<g>`, `<use>` and `<image>` throwing with the message; `geometry` winning over a circle, a `<text>` and a rect; `dim`, `markLabel` and `keyboard` on dots, the ring on the focused one; and with `watch`, each of `x1`, `y1`, `x2`, `y2`, `rx`, `ry`, `points` and `r` followed, a shape that draws nothing in a frame kept, and its stroke width kept until `refresh()`, a new transform scaling it.
       - `src/shapes.test.ts` (9, new), on real D3 and Plot, with only a key and what each needs: a D3 scatter of groups moved into place, each dot a point with its value as its sample, the overlay in the margin's coordinates; the scatter dimmed, named and reached by the arrows in document order, with a `label` from the sample; `d3.symbol()` diamonds as closed shapes, centred where they're moved; Plot's dots as points where its scales put them, named, and its next `<svg>` followed by `refresh()` with no events; a D3 curve with `curveMonotoneX` and `.defined()`, the same mark as `describe.shape` gives its `d` at its stroke width, with its gap and samples; `threshold` colouring it only where both series are drawn; the curves followed through a D3-style transition (rows bound once, `d` tweened) with `watch`, each frame's mark the path's `d`, nothing drawn inside a gap on any frame, no events, ending as a fresh attachment does; and a D3 area, closed, with its ring and halo round its outline and the other area dimmed.
       - `src/conformance.test.ts` (111): six sources read by tag, through the sweep (96): a D3 scatter, Plot's dots, the D3 curve with and without the missing weeks, the D3 area, and a line, a polyline, a polygon, an ellipse, a `d3.symbol()` star and a circle stretched into an ellipse. The curve with missing weeks is in the gap sweep too (13). And 2 tests: the curves and areas read by tag are step 3's `geometry` sources' marks exactly, and the dots are points and the other shapes open or closed as drawn.
       - `src/core/geometry/path.test.ts` (2): `shapeOutline` from an element's attributes and from a map, and nothing for shapes SVG wouldn't draw. `src/charts/adapter/space.test.ts` (3): `keepsCircles` past a browser's rounding, `scaleOf`, and `attributesOf`.
       - **The tests changed:** `expressive.test.ts`'s "throws on duplicate keys, duplicate segments, shapes it can't read and missing keys" pinned the throw on a `<path>`, and "throws on marks it can't read, changing nothing" the throw on a `<circle>` in a `refresh()`. Both now pin it on a `<text>`, with the same assertions.
       - 2,445 tests in 105 files pass (2,302 in 104 on main), and every other existing test passes unchanged. The new api.md example type-checks, and a typo put in it fails the API docs test.
     - **Sizes** (gzip, against main `532da70`, in bytes from the same bundling as the size check): `expressive` and `travel` 31,491 (30.8 KB), from 26,782 (26.2), over its 29 KB budget, so raised to 34, the size plus 10%, as CONTRIBUTING says. About 3.2 KB of the 4.7 is `describeShape`, with its path reading, flattening and closed outline, and `describePoint`, which the adapter now carries: `describe` added to the set costs 3,851 bytes on main and 617 here. The rest is the reading. Everything grew 898 bytes, to 75.6 KB of 76.5. `barChart` (30.3), the line page's set (36.8), the switch's set (40.5) and `describe` and `matrix` (7.2) are byte for byte the same. `dist/index.js` 109.3 of 111, the script-tag bundle 75.4 of 79.5, `sport.js` 4.0 of 4.5. With the review's fixes (the probe), `expressive` and `travel` is 30.9 KB and everything 75.7.
   - **Decisions beyond the plan:**
     - **A shape SVG wouldn't draw isn't a mark:** a path with no path data or only moves, an ellipse with a radius of 0, a polyline of one point. `describe.shape` would throw on it, and a D3 line with no defined point gets no `d`, so throwing would stop a whole chart's `refresh()`. It's left out, as step 1 left out a Vega line with no point drawn, and enters once it draws something. With `watch`, a shape that draws nothing in a frame keeps its mark until `refresh()`, since a frame fires no events.
     - **A circle with a radius of 0 is a dot of size 0,** under any transform, not left out: D3 pages grow dots from 0 as they enter.
     - **A stroke width of 0, or none in px, reads as 1 px** in the marks' coordinates, `describe.shape`'s default, which step 3's note asked for. `describe.shape` keeps "more than 0": nothing is stroked, but the shape is still a line to walk and ring.
     - **The stroke width as drawn is the computed one,** so CSS and a group's width count (Plot puts it on the group). One that can't be read is passed over, as SVG ignores it. At first a computed 1 gave way to any declared width, as colours did, so a 1 px from the page's CSS read as the attribute's width. Codex's review on PR #102 found it; checking the attribute's own element wasn't enough (an attribute on the mark itself), so a probe now finds whether computed styles read presentation attributes, and in a browser the computed value stands.
     - **A probe in the host's `<svg>`,** once a root: a `<g>` appended and removed in the same task, so nothing draws it, and `watch` doesn't hear it (it notes attributes only). Its property, `stroke-miterlimit`, is one pages don't style, so no rule of theirs answers for the attribute. A root not in a document isn't remembered. User-agent sniffing for jsdom was the other way; the probe tests what's needed in any environment.
     - **Colours fixed in the same way,** beyond step 6's files, at your word on PR #102: `paintOf` took a declared colour over a computed black (or `none`), as `strokeWidthOf` did over 1 px. `watch` keeps it, as it keeps colours, and a new transform still scales it. `vector-effect: non-scaling-stroke` isn't read.
     - **`segment` names a circle's or a shape's series.** Decision 12 doesn't say how such a mark gets one. Without it, `threshold({ compareTo: "xg" })` couldn't find the xG curve read by tag, and `segment` already names a part's series.
     - **Round to within 1e-4.** A circle stays a point when its matrix's columns agree to within 1e-4 of their squared length, so a browser's CTM rounding doesn't make every circle an ellipse; an exact test would.
     - **Bars among circles or shapes keep document order,** and are still bars, with their baselines found among the bars alone.
     - **The new checks come first.** The tag is checked before keys group, so a `<text>` sharing a rect's key throws for its tag; and two circles with one key throw the new `TypeError` with `segment` or without, not the `RangeError` ("two elements have the key") that rects still get.
     - **A pie read by tag isn't ordered round its centre:** each slice is a closed shape with its own centre, so the slices keep document order. `geometry` with `describe.arc` still gives the clockwise order, as the donut page uses. The docs say so.
     - **A path's own `d` goes to `describe.shape` unrounded;** the other tags' outlines are written with `formatPath`, to 0.001 in their own units.
     - **Docs beyond the step's list,** each a line: the effects guide's samples table, the API sketch's comment, and `src/charts/README.md` and `src/core/README.md`.

**Wave 3** (after the other steps land):

7. ✅ **The demos, their screenshots, the audit and script J.** Owns `demo/shapes.*` (new), its link in `demo/index.html`, `demo/donut.*`, `demo/morph.*`, their visual specs and baselines, README's GIFs, `docs/a11y-audit.md`, and section J of `docs/a11y-check.md`.
   - **The shapes page:** a D3 scatter, an Observable Plot dot chart, a D3 curved line and a D3 area, each attached with a key and only what it needs (`value`, `samples`, `markLabel`, `keyboard`). A picker swaps their hover effects with `update({ on })`. The curved line has `threshold` and a riding `travel`. Design notes say what a closed shape does with `travel`.
   - **The donut page:** the D3 pie's picker uses `update({ on })`, so the pie isn't attached again and its tab stop stays.
   - **The morph page:** beside the switch, a second chart of the same shot outcomes, linked by outcome: hovering a slice or a column hovers its partner, in either view and after a switch.
   - **README's GIFs:** `ball-and-boot.gif` made again (`npm run media`), with M7's dimming. `threshold-line.gif` and `donut-to-columns.gif` are compared with their pages, and made again if they differ.
   - **Screenshots,** made in Docker: the shapes page, and every page whose picture changed. Reduced motion and Off are checked in the DOM.
   - **Script J,** for NVDA + Chrome (decision 16). You run it.
   - **The walk:** you look at the pages in the browser, at 320 px too.
   - Docs: a11y-audit.md (a table for the shapes page, the morph page's link, the donut page's picker, the Browsers count), a11y-check.md (section J and its results), CONTRIBUTING's visual tests.
   - **Built** (27 October 2026), as the plan says, in two PRs: the pages, their tests and baselines, the audit and script J first ([#103](https://github.com/Deaversbp/expressive-charts/pull/103)), then script J's results and the walk ([a11y-audit.md](a11y-audit.md#shapeshtml)):
     - **The shapes page** (`demo/shapes.html` and `demo/shapes.ts`, with the three D3 charts in `demo/d3-shapes.ts`, all new). A D3 scatter of the bar page's squad, goals against shots, drawn the other common way: a `<g>` for each player, moved into place, with a `<circle>` and the player's name. An Observable Plot dot chart of goals against assists. A D3 curved line of goals and xG per match, each a five-match average of the line page's season, drawn with `curveMonotoneX`, with the line page's decoration, `threshold` and a riding ball. And a D3 area of shots on and off target per match, the one stacked on the other. Each is attached with a key and only what it needs, with no `geometry`: the scatter with `value`, `markLabel`, `keyboard` and `dim`; Plot's dots with `datum` too, for the row each circle's index stands for; the curves with `segment` and `samples` from `samplesAlong`; the areas with `value` and `markLabel`. A picker, Pulse, Flash or Wiggle, swaps the four charts' hover effect with `update({ on })`; the curves' decoration is the same effect each time, so it keeps running. Design notes say what a closed shape does with `travel` and `trace` (nothing: it has no direction, and any start the library chose would be made up), why a wiggle shows nothing on a dot, and what the picker keeps. `index.html` links it, after the season page.
     - **The donut page**'s D3 pie is attached once: its picker calls `update({ on })` on it, as on the donut and the columns, so its tab stop stays. The comment that an attachment's effects can't change is gone.
     - **The morph page** has a bar chart beside the switch, "Linked, largest first", in one `link()` with it, by outcome. The switch and the bars share one `colorAssignment`, pinned to the slots the switch gave before. A new Morph pick destroys the link with the switch, builds the switch again and links the new one. The two cards share a row at 860 px and wider.
     - **README's GIFs.** `ball-and-boot.gif` is made again with `npm run media` (its test alone): 72 frames, 2.76 s, 102 KB, the other bars dimmed. `threshold-line.gif` came out byte for byte the same, so it stays. `donut-to-columns.gif` differed only in anti-aliasing (about 8,500 edge pixels of 880,000 a frame, nothing moved), since the card sits a fraction of a pixel lower under the morph page's longer lede, so it stays too, on your word.
     - **Tests** (30 new in each browser):
       - `shapes.spec.ts` (16, new): the page at rest in light and dark; each chart a named group of named marks in document order, one tab stop each, Plot's "dot" name gone and its axes and names hidden; the curve's red, and the ball at its tip; each chart with a mark 300 ms into its pulse, the others dimmed, every text at full strength, and nothing left at rest; each chart's focus, the arrows in document order, End and Home with no wrap-around; the picker swapping every chart's effect in place (each overlay the same, each tab stop where it was, focus on the picker, the curve's ball and red as they were, a flash on all four); a hover held by the pointer replaying with a wiggle and then a pulse; and reduced motion (the ball at the tip and the red at load, a hover's end state at once, until the viewer picks a mode) and Off.
       - `donut.spec.ts` (1): the D3 pie's effect swapped in place, its overlay the same, its tab stop kept on Off target, and Tab from the picker landing there.
       - `morph.spec.ts` (2; 1 changed): a slice hovering its bar and a bar its slice, by the pointer and the keyboard, never in the hidden view, with no tooltip in the linked chart; and the link following the switch, a hover held in the bars shown when the switch lands, the columns linking back, and a rebuilt switch linked again. **The test changed:** "only the view shown can be read" reads the bars too, and compares what can be read in any order, since Chrome lists the two charts' nodes by when they were made.
       - `a11y.spec.ts` (11): the shapes page in every list but the tooltip checks, with its tab stops; the morph page's two new stops, and the bars as a chart with a tooltip.
       - `demo.ts`: `shapesDemo`, with a `height` of 2,200 (the page is about 2,080 px at 1,000 px wide), and `morphDemo` waits for the bars.
     - **Baselines,** made in Docker and approved by you before they were committed: 10 new (`shapes-page-light` and `-dark`, `shapes-hover-` and `shapes-focus-` for the scatter, Plot's chart, the curve and the area) and 7 changed (`morph-page-light` and `-dark`, `morph-columns-light` and `-dark`, `morph-half-drop` and `-unroll`, and `morph-focus-columns`: the bars beside the switch, and the switch's card half as wide). The donut page's pictures didn't change.
     - **The visual suite** in Docker, in Chromium, Firefox and WebKit with 4 workers, in 10.4 min: 641 passed and 58 skipped (forced colours and the switch's accessibility tree, 29 each in Firefox and WebKit), none failed. 233 tests in each browser; the audit's Browsers paragraph says so.
     - **Checks:** `typecheck`, 2,445 unit tests in 105 files, the build, the size check (no size moved: no library code changed) and `build:site`.
     - **Docs:** a11y-audit.md (a table for `shapes.html`; the morph page's link and the donut page's picker in their rows; the intro, the NVDA line and the Browsers count), a11y-check.md (section J, 19 steps in three tables: the shapes page 1–10, the donut page 11–14, the morph page 15–19), and CONTRIBUTING's visual tests (the shapes page's pictures and checks, the donut and morph pages' new checks, the tooltip checks' pages, and the shapes page's height).
     - **Script J passed** with NVDA + Chrome (27 October 2026): each dot, curve and area was read once, by its name, with nothing hidden read; the arrow keys went in the order the page drew the marks and stopped at the ends; a pick kept focus on the picker and each chart's tab stop, the D3 pie's too; and the morph page's link never moved focus, or read anything, in the other chart, before or after a switch ([Results](a11y-check.md#results)).
     - **The walk** (27 October 2026): you looked at the shapes, donut and morph pages in the browser, at full width and at 320 px, and found nothing to change.
   - **Decisions beyond the plan:**
     - **The D3 charts in a file of their own,** `demo/d3-shapes.ts`, outside `demo/shapes.*`, as the other pages keep someone else's charts in files that know nothing about the library. Plot's chart is a call, so it's drawn in `shapes.ts`.
     - **Pulse, Flash and Wiggle** in the picker, the built-in presets. A ball isn't offered: it would do nothing on the dots and the areas. A wiggle shows nothing on a dot, a circle turned about its centre, and the design notes say so.
     - **The goals curve's name says where it's red** ("below xG in matchweeks 1 to 6, 9 to 12, 20 to 23, 31 and 33 to 38"), worked out from the data, since attachments have no table and the red is otherwise only seen. The curves and areas are named for the season.
     - **A line between the areas,** 1.5 px in the card's colour, as between the donut's slices: their blue and orange are about 1.3:1 against each other.
     - **Plot's chart, as a careful author would leave it:** the page hides its axes and names (`aria-hidden` on every group but the dots'), and takes Plot's name for the dots' group, "dot", off it.
     - **The picker has a visible label,** Hover effect, which names its group, as the morph page's Morph toggles do.
     - **The bars on the morph page are horizontal and largest first,** so they can't be taken for the switch's columns, and the link goes by outcome, never by place. Sharing the row with them made the switch's card narrower, which changed its pictures.
     - **The tooltip checks run only on pages with the library's charts** (`withTooltips` in `a11y.spec.ts`), so the shapes page has none that check nothing. `shapes.spec.ts` checks instead that a hover dims no text.
     - **The ball's first trip on the curve takes about 3 s** at load (1,070 px at 360 px/s), not the line page's 1.4 s: still under 5 s, which the 5 s check holds.
     - **Found, for you to decide on:** a wiggle on the curve turns the path but not the red and the ball drawn for it in the overlay, so they come apart by up to 3 px for under half a second; and a dimmed curve's red and ball stay at full strength while the path dims, as on the line page's D3 line. Neither is changed here.

**Wave 4:**

8. ✅ **Publish 0.4.0** (decision 3). Owns the version (`package.json`, the lockfile, `VERSION`), CHANGELOG's 0.4.0 entry, README's status, its script tag (`@0.4`, and api.md's) and its sizes, architecture.md's sizes, measured again on 0.4.0's code, and this plan's status line and M9's ✅.
   - **The dry run:** `typecheck`, `test`, `build`, the size check, `pack-check`, `npm pack` (its list and sizes shown to you, compared with 0.3.0's, since tsdown builds it) and `npm publish --dry-run`. The PR has its results.
   - **Before the go-ahead,** you check that the trusted publisher is still on npmjs.com.
   - **Then, on your go-ahead in that session:** the `v0.4.0` release is created, and the workflow publishes it with provenance, through trusted publishing.
   - **After:** check npm (the version, README, provenance), install 0.4.0 in a fresh project and load each entry as an ES module and as CommonJS, and check jsDelivr's `@0.4`.
   - **Built** (27 October 2026): [0.4.0 is on npm](https://www.npmjs.com/package/expressive-charts/v/0.4.0) through trusted publishing with provenance, and [its release](https://github.com/Deaversbp/expressive-charts/releases/tag/v0.4.0) is on GitHub.
     - **The release PR** ([#106](https://github.com/Deaversbp/expressive-charts/pull/106)): 0.4.0 in `package.json`, the lockfile and `VERSION`; CHANGELOG's 0.4.0 entry, the Unreleased lists under a short summary; README's status, its script tag at `expressive-charts@0.4` (api.md's too), since `@0.3` keeps serving 0.3.x, and its sizes as measured, a bar chart about 30 KB gzipped and everything 76 KB; and architecture.md's size tables, measured again on 0.4.0's code, without the 0.3.0 column step 5 put beside them. `release.yml` and CONTRIBUTING didn't change: the workflow runs CI's checks on Node 24, the tsdown build among them.
     - **CHANGELOG's lists,** which seven steps and #105 wrote, needed two edits: `expressive()` reading circles and shapes moved up in Added, beside `describe.shape`, and the tsdown entry gives its saving on the same code, 6.6 KB gzipped, not step 5's size for the script-tag bundle, 72 KB, since it's 75.8 on 0.4.0's code.
     - **The dry run** passed on `322cded` with the PR: `typecheck`, 2,452 tests, the build, every size within its budget, so none changed (`barChart` 30.5 KB, the line page's set 37.1, `expressive` and `travel` 31.1, everything 76.0 of 76.5 and the script-tag bundle 75.8), `pack-check` on TypeScript 5.4, 6 and 7, `npm pack` and `npm publish --dry-run`.
     - **The first tarball tsdown built** has 37 files, as 0.3.0's: the same files but the hashed chunks, named by their first module (`define-…`, `path-data-…` and `transition-…`, not `chunk-…`), and every path that `exports`, `main`, `module` and `types` name. Built on Windows it's 1.5 MB packed and 5.4 MB unpacked, since the checkout's CRLF goes into the source maps. Built from an LF copy, as CI builds it, it's 1.44 and 5.29 MB, and npm's is 5,288,569 bytes unpacked, the same.
     - **You** checked that the trusted publisher was still on npmjs.com, and approved the release notes.
     - **The release.** Main's CI was green on `5254690`. On your go-ahead, `v0.4.0` was created there at 06:21 UTC on 28 October (23:21 on the 27th, Pacific time), and its run published with provenance at 06:23 ([Sigstore's log](https://search.sigstore.dev/?logIndex=3533951497)), first time, with no `ENEEDAUTH`.
     - **After.** npm shows 0.4.0 as `latest`, with README, its four GIFs, and "Built and signed on GitHub Actions" from `5254690` and `release.yml`. Its provenance is SLSA v1, from `refs/tags/v0.4.0`. A fresh project installs it with no dependencies, `npm audit signatures` verifies its registry signature and its attestation, and all three entries load as ES modules and as CommonJS, with the same names both ways, `VERSION` 0.4.0 and the stylesheet. jsDelivr serves the script tag at `expressive-charts@0.4` at once, the same bytes as the build, and the demo pages load. No placeholder version came.

**Done when:**
- **Attachments.** `expressive()` and `fromVegaView()` have `update({ on })` and `leave()`, and `donut.html`'s D3 pie swaps its effects without being attached again.
- **Links.** A chart switch can be in a link, and its view on show hovers with the others.
- **Circles and shapes.** `describe.shape` describes any path data. `expressive()` reads `<circle>` as a point, and `<path>`, `<line>`, `<polyline>`, `<polygon>` and `<ellipse>` as shapes. Every built-in effect passes `checkEffect` on shapes, and the sweep on D3 scatters, curves and areas.
- **Vega.** `fromVegaView()` reads a Vega-Lite line with missing values, with its gaps, and `checkEffect`'s default data marks a gap.
- **Icons.** `iconFromSvg` keeps `fill-opacity` and `stroke-opacity`.
- **The build.** tsdown builds the package with no TypeScript, TypeScript 7 checks the code with `isolatedDeclarations`, `typescript` is 7, and `pack-check` checks the packed types on 5.4, 6 and 7.
- **The tidy.** The API docs test's link check holds up under load, and architecture.md's sizes and README's GIFs are current.
- **The demos** show all of it, with their screenshots and the audit, and script J passed with NVDA + Chrome.
- **Docs.** api.md, architecture.md, the effects guide, README and CHANGELOG cover every addition and change. The promise changes only by `describe.shape`, `ShapeSpec` and the icon fields, which are additions, and by `checkEffect`'s data on a gap, a fix.
- **0.4.0 is on npm,** published through trusted publishing with provenance, with its CHANGELOG entry and its release on GitHub. This plan's status line says M9 is done.

**Status: complete (27 October 2026).** Every item on the list holds. Steps 1 to 7 built and checked the first nine, and 0.4.0 is on npm through trusted publishing with provenance, with its release on GitHub (step 8).

### M10: Curved lines, a hover on one point, and labels that keep clear (0.5.0) ✅

Line charts that curve and hover the nearest point, change labels that keep off other marks' labels, curved Vega lines, smaller pages for the motion core and `describe`, a build on stable releases, and last, 0.5.0 on npm.

**Demo:** the line page gets two toggles, Straight or Curved and Each week or Nearest point, and its Vega-Lite line follows the first. On the season page, the goals and xG lines show each matchweek's change past their end labels, clear of each other's.

**Where M10 starts** (checked against main at `77803a7` while planning, 28 October 2026):

- **Already built.**
  - **0.4.0** is npm's `latest`, published through trusted publishing with provenance. npm lists `0.0.0-stage` and `0.1.0` to `0.4.0`. GitHub has no open issues or pull requests. Main is 0.4.0's code, with this plan's last edits.
  - **The line chart** draws straight lines only. `placeLines` (`src/charts/line-layout.ts`) gives `describe.line` a vertex at each row's value, with a sample there, and a reveal between two rows ends each line part way, its value straight between them.
    - Its hover is an x: a hit column for each x, a dashed crosshair, and every series' point there in its strong colour. Nothing dims, and the chart gives `chartHover` no `hot`, which #105 added to dim decorations. The one tab stop goes from x to x.
    - A tooltip function is given the row alone.
  - **Curves elsewhere.** `describe.shape` flattens Béziers into straight pieces within 0.1 px (`src/core/geometry/flatten.ts`), and `expressive()` reads a D3 curve by its tag. Its samples are at the points the page drew it from, and between them `threshold` takes values as linear in `t`, so on a curve its crossings are approximate. Measured while planning, with d3's `curveMonotoneX` on a 900 × 250 px plot: on the line page's season, the colour changes up to 2.4 px from where the drawn lines cross (1.5 px typically); on the shapes page's five-match averages, up to 4.8 px; on values per match, up to 6.8 px.
  - **`fromVegaView()`** throws on a line drawn with any `interpolate` but `"linear"`, in `pointsOf` (`src/charts/adapter/vega.ts`): "only straight lines can be read".
  - **Change labels.** `captionPlace` (`src/effects/caption.ts`) puts `delta`'s and `label`'s text past the mark's `labelBounds`, "the boxes of the text the chart draws for this mark", and picks its way from them too: along the walk's heading, or out from a slice's centre through its label. A line's are its own end label alone, so when two lines end close together, with their labels pushed apart, one line's text can land on the other's label.
  - **A negative column.** `verticalFrame` (`src/charts/bar-layout.ts`) keeps 18.5 px below the plot for the lowest value label, but draws the names 18 px below the plot, inside that room, and a negative column's value label hangs 16 px below its tip. So a column whose tip is at the plot's bottom has its value label on its name. No demo draws a negative column.
  - **The build.** tsdown 0.23.2 asks for rolldown-plugin-dts 0.29.0-beta.2. tsdown 0.23.3, out on 28 October, asks for `^0.28.8`, the latest stable, which has the same `oxc` generator. TypeScript 7.0.2 is `latest` and 7.1 is in beta (7.1.0-beta, 20 October), so `api-docs.test.ts` still needs TypeScript 6's API.
  - **The small sets.** A page that imports `motion` and `animated` is 2.4 KB (1.7 before tsdown), and one that imports `describe` and `matrix` 7.2. Rolldown puts code that only `index` uses in `index.js` itself, so those pages keep its top-level tables: the theme's tokens and the stylesheet's text (`theme.ts`), the time axis's steps (`time.ts`), the gaits' still pose (`gaits.ts`) and a walk's empty gaps (`walk.ts`) (M9 step 5).
  - **Testing.** 2,452 unit tests in 105 files pass, and `typecheck` takes 2.7 s. Vitest's timeout is its default, 5 s: during M9, `bar-layout.test.ts`'s 1,000 bars, `api-docs.test.ts`'s link check, `d3-line.test.ts` and `long-axes.test.ts` each timed out under load and passed run again. The visual suite ran 641 tests, with 58 skipped, at M9 step 7 (233 in each browser).
  - **Sizes** (gzip, against their budgets, on `77803a7`, 0.4.0's code): everything 76.0 KB of 76.5 (77,775 bytes: 561 left), `barChart` 30.5 of 34, the line page's set 37.1 of 41, the switch's set 40.8 of 45, `expressive` and `travel` 31.1 of 34, `describe` and `matrix` 7.2 of 8, `motion` and `animated` 2.4 of 3, the script-tag bundle 75.8 of 79.5, `dist/index.js` 109.9 of 111, and the stylesheet 2.4 of 2.5.
- **Gaps.**
  - A line chart draws only straight lines, and its hover is always every series at once.
  - A change label can land on another mark's label, and a negative column's value label on its name.
  - A Vega line drawn as a curve throws.
  - A page that imports only the motion core or `describe` carries `index.js`'s tables.
  - The build rests on a beta, and four test files time out under load.
- **Out of date** (each fixed by the step named):
  - §10's open question 9 says a host's curve is described "with points taken from the path"; since M9 it's read from its path data with `describe.shape` (step 1).
  - The backlog's line chart extras say a `curve` option "needs sampled arc-length tables"; `describe.shape`'s flattening is that now (step 1).

**What M10 takes from the backlog, and what stays:**

| Item | Goes to |
| --- | --- |
| Line chart extras: a `curve` option, and hovering only the nearest point instead of the crosshair (M4) | Decisions 1, 4, 5, 9 and 10, steps 1 and 2 |
| Change labels on a neighbour's label (M7 step 1) | Decisions 1, 6 and 11, step 3 |
| A negative column's value label on its name (M7 step 1) | Decisions 1 and 11, step 3 |
| A curved Vega line read through `describe.shape` (M9's "stays" row) | Decisions 2 and 12, step 4 |
| The top-level tables marked pure, rolldown-plugin-dts still a beta, and the tests that time out under load (M9 step 5's and step 8's notes) | Decisions 2 and 13, step 5 |
| `api-docs.test.ts` on TypeScript 7's API, ending `typescript-6` | Stays: TypeScript 7.1 is still in beta |
| Lines as switch views and `morph` across gaps, recolouring at once on `update({ colors })`, decorations below a line chart's points, a rotated `<rect>` read as a closed shape, a clockwise order for a pie's slices read by tag, `vector-effect: non-scaling-stroke` widths, VoiceOver + Safari, a written audit table for `stress.html`, square caps and bevel joins, the other follow-ups in M8's and M9's notes, and the rest | Stay: in the backlog, or in the notes |

When a step lands, it marks its backlog item as built in M10.

**Decided while planning M10 (28 October 2026):** decisions 1–7 are yours, and 8–14 follow from them and the code.

1. **M10 builds two things:** line chart extras (a `curve` option, and a hover on the nearest point beside the crosshair), and labels that keep clear (a change label off another mark's label, and a negative column's value label off its name).
2. **Three smaller items join them:** curved Vega lines; smaller small sets, with the top-level tables marked pure; and a stable tsdown, with tests that hold up under load.
3. **One release, 0.5.0, when M10 is done.**
4. **Two curves: `"linear"`, the default, and `"monotone"`.** A monotone curve passes through every value and never overshoots, so a line never shows a value the data doesn't have. Not step, nor a curve factory: step's corners jolt a riding icon, and basis, cardinal and natural curves overshoot or miss the values.
5. **`hover: "point"` hovers the nearest point, and the other lines dim.** The tooltip shows its one value. The arrow keys go along its line, and Up and Down to the line above or below at the same x. Links still go by x. The default stays `"x"`, the crosshair.
6. **A new optional field for other marks' labels nearby.** `labelBounds` stays the mark's own, and `delta` and `label` still pick their way from it, then go past any label in the way.
7. **The demos are controls on today's pages:** the line page's toggles, its Vega-Lite line following the curve, and the season page's lines with `delta`.
8. **What's an addition and what isn't** (the 0.x promise). 0.5.0 is a minor release. In the effect-author API, `nearbyLabels` is an addition; nothing in it changes or goes.

   | Change | Under the promise? | Kind |
   | --- | --- | --- |
   | `nearbyLabels` on `MarkGeometry` and on each builder's spec | Yes | Optional fields: additions. An effect that doesn't read them works as before |
   | `delta` and `label` going past other marks' labels | No: the built-in effects | A fix: text that landed on a neighbour's label now goes past it. Listed under Fixed |
   | A curved line's samples between its rows | No: the charts (`MarkData`'s type doesn't change) | An addition: only with `curve: "monotone"`, which is new. A line without it has the samples it had |
   | `curve` and `hover` on `lineChart`, and a tooltip function's second argument | No: the charts | Additions. Their defaults draw and hover as before, and a function that takes the row alone still fits |
   | A chart with a negative column drawing its names below its value labels' room | No: the charts | A fix: only a chart with a negative column changes |
   | `fromVegaView()` reading curved lines | No: the adapters | An addition: a line that threw is read |
   | The tables marked pure | No: the internals | Smaller import sets; nothing else changes |
   | tsdown 0.23.3, with rolldown-plugin-dts 0.28.8 | The published types | Nothing changes while every exported name has the same type, which the comparison checks. A difference stops the step |
   | Vitest's timeout | No: the repository | Tests only |

9. **The curve** (decision 4).
   - **The option:** `curve?: "linear" | "monotone"` on `LineChartOptions`. `"linear"`, the default, draws as now, the same marks byte for byte. `"monotone"` is d3's `curveMonotoneX`: through every value, flat where two neighbours are equal, and never above or below the values either side between two rows. Anything else throws a `TypeError` naming it, and `update()` rejects it, changing nothing.
   - **How it's drawn.**
     - Each run of values between gaps is curved on its own, as d3's `.defined()` draws it. A run of two values is straight, and a value alone is its point.
     - The curve is worked out in the data's own units (x and value) and drawn through the scales, a time axis too. Each piece is flattened into straight pieces within 0.1 px, by the bound `describe.shape` uses (`flatten.ts`), not by its path reader, and the line is `describe.line` through them.
     - So its walk, outline, gaps, `slice()` and reveal work as a straight line's, with more vertices, and its points sit at its rows, on the curve. No effect changes.
   - **Samples.** Each row has its sample, as now, and each bend between rows has one too, with its `at` and `value` read off the curve, so `threshold`'s crossings are exact on the drawn line, as on a straight one. A data effect that counts samples sees more than the rows on a curved line; api.md says so. `delta` and `label` read the ends, which are rows or the reveal.
   - **The reveal.** A reveal between two rows ends the line where the curve is at that x, with its value read off the curve, so playback draws the curve in.
   - **A change.** The rows' values ease as now, and the curve follows them on every frame. `update({ curve })` plays as a change: each piece eases from straight to curved or back, its tangents moving between the straight piece's slope and the curve's, so it never overshoots on the way. Off jumps.
   - **The crosshair** and its columns are as now: an x is still an x.
10. **A hover on the nearest point** (decision 5).
    - **The option:** `hover?: "x" | "point"` on `LineChartOptions`. `"x"`, the default, hovers as now. Anything else throws a `TypeError`, and `update()` rejects it. `update({ hover })` changes it at once: a hover held ends, and focus moves to the stop of the new kind nearest it.
    - **What's hovered.** With `"point"`, the pointer hovers the revealed point nearest it, by distance in px, anywhere over the plot; leaving the plot leaves. Touch does the same. Of two points as near, the series first in `series` wins. It fires `hover` for that point alone, and its hover effects run on it. The lines themselves still take no hover.
    - **Dimming.** The hovered point shows in its strong colour, and its line and their decorations stay at full strength. Every other line and point dims to `--ec-dim-opacity`, their decorations with them, as on bars since #105, and text keeps its contrast. `dim: false` keeps them. With `"x"` nothing dims, as now.
    - **No crosshair.** The tooltip sits above the point, or below it without room: the x in bold, then that series' value with its label. A tooltip function is given the row and, as a second argument, `{ series }`; with `"x"` it's given the row alone.
    - **Keys.** One tab stop, on a point. Left and Right go along its line to the next or previous x where it has a value. Up and Down go to the point above or below at the same x, by where they're drawn, passing over series missing there. Home and End go to the line's first and last value, and Page Up and Page Down as now (a calendar month on a time axis, otherwise a tenth of the x's), along the line. Escape ends the hover and focus stays.
    - **Names.** The focus stops are the points, each named by its x and its one value, through `markLabel` with that series alone in `values`. The x stops go while `hover` is `"point"`.
    - **Links** go by x, as now. A point hovered hovers the link's other sources at its x. A link's hover shows as an x hover does: every series' point there, with the crosshair, and nothing dims.
    - **`focus(key)`** takes a point's key, or an x's, which focuses the first series' point there.
    - Points past the reveal, and missing values, have no point to hover or focus.
11. **Labels that keep clear** (decisions 1 and 6).
    - **`MarkGeometry.nearbyLabels?: readonly Rect[]`:** the boxes of other marks' text near this one, which an effect's text should keep clear of. `labelBounds` stays the boxes of the mark's own. Unset means none is known.
    - **The builders** take it on each mark's spec (`BarSpec`, `ArcSpec`, `LineSpec`, `PointSpec` and `ShapeSpec`), check it as they check `labelBounds`, with a `RangeError` naming the field, and pass it on.
    - **Who gives it.** The line chart gives each line every other line's end label, and the donut each slice its neighbours' labels, either side. Bars give none: a bar's text goes past its own end, where no other bar's label is. Adapters give none, as they give no `labelBounds`.
    - **`delta` and `label`,** through `captionPlace`, pick their way from `labelBounds` as now, then go 6 px past the farthest box of either list that way meets. So a slice's text still goes out through its own label, and a line's goes past its neighbour's.
    - **A negative column.** With a negative column, the names go below the room the layout keeps for its value labels, so the two never meet, and the plot keeps its height. A chart with no negative column draws as before.
    - **The promise.** `nearbyLabels` is an addition. No fixture gets it, so `FixtureName` doesn't change; `src/captions.test.ts` and the sweep check it on real marks.
12. **Curved Vega lines** (decision 2).
    - `fromVegaView()` reads a line drawn with any `interpolate` but `"linear"` through `describe.shape`, from the path Vega draws (its element's `d`), moved by the element's matrix, at the item's stroke width. Its gaps come with it, one at each move, as on a D3 curve read by tag. A path Vega closes on itself (the `-closed` interpolations) is a closed shape, as `describe.shape` reads any.
    - Its samples are at the items drawn, projected onto the curve with `samplesAlong`, as now. So `threshold`'s crossings between items are approximate on a curve, as on a D3 curve; architecture.md says so.
    - A straight line is read as now, through `describe.line` from the items, the same mark byte for byte. The throw goes, and its comment.
13. **Smaller sets, a stable tsdown, and sturdy tests** (decision 2).
    - **The tables.** The top-level values built at import in `theme.ts`, `time.ts`, `gaits.ts` and `walk.ts` are marked pure (`/* @__PURE__ */`), or built when first used, whichever Rolldown drops, so a page that imports only `motion` and `animated`, or `describe` and `matrix`, keeps none of them. They cost those pages 0.74 and 0.71 KB when tsdown came in (M9 step 5). Those two budgets come down to the new size plus 10%, and no other size may grow.
    - **tsdown** goes to 0.23.3, or the latest 0.23 patch, pinned exactly, which takes rolldown-plugin-dts 0.28.8, a stable release, in place of 0.29.0-beta.2. M9 step 5's comparison runs again: the files, each entry's names as an ES module and as CommonJS, each exported name's type read with TypeScript 6's API, and the sizes. A published type or name that differs, or a size that grows by more than 1 KB, stops the step to ask you.
    - **The tests.** Vitest's timeout goes from 5 s to 15 s a test, in `vitest.config.ts`: four files timed out under load during M9, each taking about a second alone. Tests that time themselves (10,000 points in under 2 s) keep their own limits. *Done with this plan's PR (#108),* whose CI failed when `bar-layout.test.ts`'s 1,000 bars took 5.6 s on the slower runner (that file took 4.4 to 5.1 s there on main's recent runs), so the wave 1 sessions start with it.
    - **`api-docs.test.ts` stays on TypeScript 6's API** until TypeScript 7.1 is out; then it and `typescript-6` can go.
14. **The rest.**
    - **Accessibility.** A new script, K, for NVDA + Chrome: the line page's toggles, keeping focus; the nearest point reached by the keys, Up and Down between lines, each point read by name; and the season page's lines after a matchweek, with the announcement saying the change. You run it.
    - **Docs.** Each step adds its exports to api.md (`src/api-docs.test.ts` fails otherwise), its sections to architecture.md, and its entries to CHANGELOG, under a new `## Unreleased` above 0.4.0 with Added, Changed and Fixed lists. The effects guide says how an effect's text keeps clear of `nearbyLabels`.
    - **Sizes.** `everything` has 561 bytes of room, `dist/index.js` 1.1 KB and the line page's set 3.9 KB. Steps 1, 2 and 3 add to them, and step 4 to everything. A step that takes a set past its budget raises the budget in the same PR and says why (CONTRIBUTING's Bundle size). Step 5 lowers two.
    - **The release** goes as CONTRIBUTING's Releasing says, through trusted publishing. Nothing is published, tagged or released without your go-ahead in that session.

Each step names the files it owns, so steps in the same wave can run in parallel sessions. Files shared by several steps get small edits only, and whichever step lands second merges main first: `package.json`, `src/index.ts`, `src/core/index.ts`, `src/charts/index.ts`, `src/charts/types.ts`, `src/charts/line.ts`, `src/charts/line-layout.ts`, `src/charts/render/theme.ts`, `src/conformance.test.ts`, `src/promise.test.ts`, `scripts/size-budget.json`, `src/core/README.md`, `src/charts/README.md`, `docs/architecture.md`, `docs/api.md`, `docs/effects-guide.md`, `docs/sketches/api.ts`, `README.md`, `CHANGELOG.md` and this plan. Steps 1 and 2 both work in `line.ts`: step 1 owns its layout, animated state and `retarget`, and step 2 its Hover section, its columns and its focus stops. Step 1 owns `line-layout.ts`'s lines, and step 3 the boxes it gives them. `typecheck` requires an explicit type on every new export. The first step to land adds CHANGELOG's Unreleased.

Each step's session reads the hand-over notes in its notes folder first, `plan-0-5.md` from planning among them, and writes its own there: commits, files, decisions beyond the brief, where the plan and the code differ, and follow-ups.

**Wave 1** (parallel):

1. ✅ **A line's `curve`** (decision 9). Owns `src/charts/curve.ts` (new: the monotone curve, eased from straight, and its flattening), the curve in `src/charts/line-layout.ts` (its vertices and samples) and in `line.ts` (its layout, animated state and `retarget`), `curve` on `LineChartOptions`, the cubic flattening `flatten.ts` exports for it (internal), §10's open question 9, and their tests.
   - Tests:
     - The curve: through every value; never above or below the values either side between two rows; flat between two equal values; within 0.1 px of d3's `curveMonotoneX` on the same points, at several scales and on a time axis; and eased, the polyline exactly at the start and the curve at the end, never overshooting between.
     - `curve: "monotone"` on a line chart: the points on the curve; gaps (each run curved alone, a run of two straight, a value alone a point); a reveal part way along it; the samples, each row's and one at each bend, with `at` and `value` on the curve and `t` ascending; `threshold` against xG changing colour where the drawn lines cross, on the line page's season; `travel` riding it; `delta` and `label`; a change while curved; `update({ curve })` both ways, in Presentation and Off, with nothing entering and focus kept; an unknown curve throwing and rejecting; and ten years of days in four series, curved, laid out in good time.
     - `curve: "linear"`, and no `curve`, giving main's marks byte for byte.
     - The sweep on the curved chart's lines and points.
   - **Done when** every existing test passes unchanged, and a chart without `curve` draws as before.
   - Docs: architecture.md (Line chart, and `threshold`'s crossings), api.md (`curve`, and what a curved line's samples hold), README's Charts line, the backlog's line chart extras, §10's open question 9, CHANGELOG (Added).
   - **Built** (28 October 2026) as decision 9 describes ([architecture.md](architecture.md#curves)):
     - **The curve** (`src/charts/curve.ts`, new and pure). `lineCurve(xs, values, amount, scales, presence?)` curves each run of values between gaps on its own, in the data's units, and gives each piece's bends (`between(from, to, through?)`) and its value at an x (`valueAt`). `monotoneTangents` is d3's `slope3` inside a run and `slope2` at its ends (Steffen's), and a piece is d3's Bézier, its control values `v0 + h·a / 3` and `v1 − h·b / 3`. `amount` eases each piece's two tangents from its own slope, `s + amount·(m − s)`, so 0 is the polyline and 1 the curve. `bendOf` and `CURVES` name the two curves.
     - **The flattening.** `flatten.ts` exports `cubicPieces(p0, p1, p2, p3)` (internal), the bound `bezier()` uses, which now calls it. Each piece goes through the scales into px, and its bends are at equal steps of x, which runs evenly with the Bézier's parameter.
     - **The layout.** `lineEncoding` reads `curve` and throws `lineChart: curve must be "linear" or "monotone", got "basis".`; `LineEncoding` and `LineLayout` carry it. `placeLines` takes `bend` last (default 0). More than 0, it curves each series through every row, revealed or not, pushes each piece's bends before the row that ends it, and for a reveal between two rows the bends before it and the end on the curve. At 0 it's the code it was. `RowState.presence` is new (below).
     - **The chart.** An animated `curved`, 0 to 1, beside the scale and the box: `retarget` moves it in the values stage, `placedFor` lays out at the layout's curve, each frame draws at `curved.value`, and `destroy()` stops it. `currentRows` gives a row growing in or folding away its presence.
     - **Tests** (75 new; with step 4 merged, 2,600 in 108 files pass, every existing test unchanged). `src/charts/curve.test.ts` (13): d3's `curveMonotoneX` within 0.1 px at four scales and on a time axis (each point of d3's within 0.1 px of ours, each of our vertices on d3's within 1e-6 px), through every value, never past the values either side, flat between equal ones, eased from the exact polyline without going past them, runs between gaps as d3's `.defined()` draws them, rows at the same x, and rows coming and going, never past the values either side. `flatten.test.ts` (2): `cubicPieces` as `flattenPath` counts, and within 0.1 px. `src/charts/line-curve.test.ts` (10): `"linear"` and no `curve` against main's digests, of the markup and every mark's samples at rest, revealed part way, with missing weeks, on every frame of a change and on a time axis laid out (main's from the same function run at `819d714`); the points on the curve, and the samples at rows and bends on d3's, `t` and `at` ascending; runs between gaps; a reveal part way; a change, through every point on every frame; a week growing in without a jump; `update({ curve })` both ways in Presentation and Off, with nothing entering and focus kept; the `TypeError` and the rejection; and ten years of days in four series laid out curved. `src/curved-lines.test.ts` (3): on the line page's season, curved, `threshold` against xG changing colour within 0.002 px of where the drawn lines cross at every half week of a reveal, with the ball riding the curve, and with motion off; `delta` and `label` reading rows. `src/conformance.test.ts` (47): the curved chart and the curved chart with missing weeks as sources, through the sweep and the gap sweep, and `threshold`'s checks with the curved chart's data.
     - **Sizes** (gzip; main at `819d714` in brackets, measured on the same machine): the line page's set 38.4 KB of 41 (37.1), everything 77.8 (76.0), `dist/index.js` 111.9 (109.9), `dist/index.cjs` 110.1 of 110.5 (108.0), the script-tag bundle 77.6 (75.8). The curve is about 3.2 KB minified. Two budgets were over and went to their sizes plus 10%: everything 76.5 to 86, and `dist/index.js` 111 to 123.5. `dist/index.cjs` has 0.4 KB left, which steps 2 and 3 may need to raise.
   - **Decisions beyond the plan:**
     - **A row coming or going bends the curve only as much as it shows.** A new value changes the tangents beside it, so a week growing out of the last made the curve before it jump by up to 2.7 px as it started (the line page's season, adding each week in turn). `RowState.presence` carries a growing or folding row's presence, and each tangent within two rows of it eases toward the curve without it by that presence (`fade()`), so the curve moves no more on any frame than a straight line does. At presence 0 the row is one knot with the row it grows from, which keeps the larger presence, so the curve is the one without it, rows growing in before the first too. Each piece's two tangents are then kept between 0 and 3 times its slope (Fritsch and Carlson's square), so no piece goes past its values on the way. That changes nothing at rest or between straight and curved, whose tangents are inside it already; a piece beside a row coming in has a corner at that end until the row is there in full, and it shrinks to nothing as the row's presence goes to 0, so the curve still doesn't jump.
     - **A monotone piece takes no more pieces than its width in tenths of a px.** The flattening bound counts the curve's distance from a straight piece at the same parameter, which is vertical here, and on a steep piece much larger than the real distance. Every piece is monotone, its tangents kept to Fritsch and Carlson's square (above), so the chord of any part of it passes every value that part does, within that part's width. So no part strays further than its width, and a piece narrower than 0.1 px is straight. Ten years of days at 960 px went from 12,762 vertices a line to 9,647, and at 320 px to none beyond the rows.
     - **Rows at the same x,** only part way through a change: the same value is one knot, as d3 skips a repeated point; different values are joined straight, and the curve starts again after them.
     - **`update({ curve })` eases in the values stage,** with the rows' values, so a curve change alone takes one stage.
     - **`curve: null` is the default,** as `timeZone: null` is; anything else that isn't `"linear"` or `"monotone"` throws.
     - **Main's marks byte for byte** are checked by digests: a 64-bit hash (cyrb53's mixing) of the markup and every mark's samples, since the tests have no Node types for `node:crypto`.
     - **Ten years is timed at the layout,** as `placeLines` runs every frame of a change: about 25 ms straight and 55 curved here. jsdom takes 4 s to build that chart's 14,600 points, curved or not.
     - **From review** (Codex on #110): fading alone let a piece beside a row coming in go past its values, as low as -0.36 between two zeros when a flat row grew out of a valley after a peak, so each piece's tangents are now held to Fritsch and Carlson's square, as the first bullet says. A test grows, prepends and folds rows at every 5% of their presence and checks every piece stays between its values.
     - **The effects on a curved line are checked in `src/curved-lines.test.ts`,** beside `src/index.ts`, since only tests there bring charts and effects together.
2. ✅ **A hover on the nearest point** (decision 10). Owns `hover` in `src/charts/line.ts` (its Hover section, its columns and focus stops), `src/charts/keyboard.ts` as it needs, the line chart's `hot` in `src/charts/shell/hover.ts`, the stylesheet's rules for a line chart's dimming if it needs any, `hover` and the tooltip function's second argument on `LineChartOptions`, `src/charts/tooltip.ts` as it needs, and their tests.
   - Tests:
     - `hover: "point"`: the pointer hovering the nearest point, across lines and where they cross, and touch; nothing past the reveal or at a missing value; the hover effect on the point alone; its line and their decorations at full strength and the others dimmed, decorations too, with every text at full strength; `dim: false`; no crosshair; the tooltip above the point, and below it at the top; a tooltip function given the row and `{ series }`.
     - The keys: Left and Right along the line, passing over missing values; Up and Down between lines at an x, by where they're drawn, passing over series missing there; Home, End, Page Up, Page Down and Escape; one tab stop; each point's name, and `markLabel` given its one series; `focus(key)` with a point's key and an x's.
     - A link: a point hovered hovering the others by x, and a link's hover shown at every point there with nothing dimmed.
     - `update({ hover })` both ways with a hover held, by the pointer and the keyboard; with `curve: "monotone"`; Off; and an unknown value throwing and rejecting.
     - The default, `"x"`, unchanged: every existing line chart test.
   - **Done when** every existing test passes unchanged, and a chart without `hover` hovers as before.
   - **Built** (28 October 2026) as decision 10 describes ([architecture.md](architecture.md#line-chart)):
     - **The option.** `hover?: "x" | "point"` on `LineChartOptions`, read by `hoverOf` in `line.ts` before anything is drawn, and in `update()` before anything changes: anything else throws a `TypeError` naming it ("lineChart: hover must be \"x\" or \"point\", got \"nearest\"."), and `update()` rejects it. With `"x"` nothing new is made, so the default's DOM, events and keys are main's.
     - **The pointer** (`src/charts/interaction.ts`). `find` is given where the pointer is, in client px, and a new `moves()` makes every `pointermove` find the target again: it hovers once that's another target, as moving onto another element does. The line chart turns client px into the `<svg>`'s units by its box and viewBox, so a scaled chart reads true, and gives the revealed point nearest it by distance (of two as near, the series first in `series`, then the first x). Its hit area is one `<rect class="ec-hit">` over the plot, a dot's radius past it all round, in `<g class="ec-stops">`; anywhere else in the `<svg>` leaves. A tap hovers the nearest point as touch.
     - **Dimming.** The chart gives `chartHover` `hot` (`heat`): a hot point's runs get `ec-hot` through the surface, and its line `ec-hot-line` and `ec-hot` on its runs, kept while any of its points is hot. One stylesheet rule fades every `.ec-line` without `ec-hot-line` and every `.ec-alone` point without `ec-hot` inside `ec-hovering`, as `.ec-mark`s fade; #105's rule fades the other runs' `.ec-follow` groups. `dim()` is true only for the chart's own hover of a point, so a link's dims nothing. `.ec-end` fades over the hover duration as the stroke does. `update({ dim })` takes effect at once (`hover.syncDim()`, as on bars).
     - **The tooltip** (`src/charts/tooltip.ts`): `show()` beside the point, as beside a bar, with its bridge, above it or below. Its row is a `TooltipRow`, `{ datum, series? }`: with a series, a tooltip function is called `(d, { series })`, otherwise `(d)` as before. The line chart keeps one such object per row and series, by which the tooltip keeps each point's text.
     - **Keys** (`src/charts/keyboard.ts`): `move(key, press)`, where an arrow key, Home or End goes, with the order's next, previous and ends as the default. The line chart's: along the point's line (Left, Right, Home, End), and at its x, top to bottom by the centres drawn (Up, Down). Its `page` goes along the line too, a tenth of the line's points on numbers, a month on a time axis.
     - **Stops and names.** Each live point has a `<g class="ec-stop" role="img">` holding an unfilled circle the size of its focus ring, line by line in the DOM and the keyboard's order (`orderElements`), hidden past the reveal; `.ec-columns` gets `display="none"`. Names come from `pointNamesFor`, with `markLabel` given that series alone, the point's key and its value as `total`; `namesFor` shares its `markLabel` call (`worded`). The hidden columns aren't described (from Codex's review on #111: a tooltip function written as `(d, { series })` was given each row alone for them, and threw). `focus(key)` takes a point's key, or an x's for its first series' point.
     - **`update({ hover })`** (`rehover`). The hover ends (`hover.leave()`), the new stops show, then `ChartHover.retarget(to)` moves the tab stop to the nearest of the new kind and focus with it without hovering (`KeyboardFocus.retarget`: the new stops get their tabindex first, and focus moves as if it had been there, so no focus callback runs), keeps the ring, and asks the link to show a hover from another source again (`shown()`). Then the old stops go.
     - **Tests** (36 new, in `src/charts/line-hover.test.ts`): the pointer across lines, between x's and off the plot; a crossing given to the series first in `series`, both ways round; touch; nothing at a missing value or past the reveal; the hover effect on the point alone and no crosshair; `"x"` and no `hover` as before, with no stops. Dimming through the injected stylesheet: the other line's stroke and end dot and a point shown at rest dimmed, the hovered line, point and their decorations not, every text at full strength, a hidden point still hidden, and everything back on leaving; a line hot while its point is; `dim: false`, and `update({ dim })` both ways. The tooltip above a low point and below the highest, with the bridge; a tooltip function given `{ series }`, its text describing each stop, and with `"x"` called with the row alone; one that needs the series never called without it, when made or updated, and the x's described again on `update({ hover: "x" })`; and on curved lines, with step 1 merged. The keys on three lines with a missing series: Left and Right passing over missing values, Home, End, Up and Down by drawn order, Page Up and Down on numbers and on a time axis (a month, past a missing day), Escape; one tab stop, the DOM order and the columns gone; the ring; each point's name and `markLabel`'s summary; `focus(key)` with a point's key and an x's, and keys that do nothing; a click moving the tab stop; focus following the reveal along its line. A link both ways with a bar chart, and a link's hover shown again after `update({ hover })`. `update({ hover })` both ways with a hover held by the pointer and by the keyboard, with nothing focused (to an x's neighbour when it has no point), with data in the same update, in the background with no focus events, and with motion off. An unknown value throwing, leaving nothing, and rejecting. 2,485 tests in 106 files pass; every existing test passes unchanged, and none changed. Each of eight mutations (no `moves`, no `hot`, the tie the other way, a focus callback on retarget, the columns left shown, the series not passed to a tooltip function, no `shown()`, and before that, `retarget` reading only focus events) fails the new tests.
     - **In Chromium** (the browser pane, on a scratch page served by `vite demo`, removed after): `elementFromPoint` over a point finds the plot's hit area, and the pointer there hovers the nearest point on a chart at its width and on one at 900 px scaled to 450; the axis area below the plot leaves; with goals hovered, xG's stroke and end dot are at 0.3 and goals' line and its red runs and ball at 1, the end labels at 1. The keys went along xG past its missing week, between lines, to the ends and a page on, and `update({ hover })` moved focus both ways. The pane was in the background, so focus events didn't come, which showed `retarget` reading only focus events: it now reads the active element too, as `sync()` does.
     - **Sizes** (gzip, against main `819d714` built in a scratch copy): the line page's set 38.7 KB of 41 (37.1 on main), everything 78.3 (76.0), `dist/index.js` 112.4 (109.9), `dist/index.cjs` 110.5 (108.0), the script-tag bundle 78.2 of 79.5 (75.8), `barChart` 30.8 (30.5) and `expressive` and `travel` 31.3 (31.1), from the shared hover and keyboard code, and the stylesheet 2.4. The feature is 5.3 KB minified on a line chart page. Step 1 landed first and raised everything to 86 and `dist/index.js` to 123.5, so with it merged (main `e46e278`) only `dist/index.cjs` was over, 112.6 KB of 110.5, and is raised to 124, the size plus 10%, as CONTRIBUTING says. With both steps: the line page's set 40.1 of 41, everything 79.6 of 86, `dist/index.js` 114.5 of 123.5, and the script-tag bundle 79.5 of 79.5, so steps 3 and 5 have no room there.
   - **Decisions beyond the plan:**
     - **A link's hover shows no crosshair.** Decision 10 says a link's hover shows as an x hover does, "with the crosshair", but on an `"x"` chart a link's hover has none (M7 step 4: the points' emphasis shows the x, and a link can hover several x's), and every existing test keeps that. So a link's hover on a `"point"` chart is as on an `"x"` one: every series' point at the x, nothing dimmed, no tooltip or crosshair.
     - **The plot's hit area reaches a dot's radius past the plot,** so a point at its edge can be hovered all round. The end labels and axes are outside it.
     - **After Escape or `leave()`, the same point isn't hovered again until the pointer finds another,** as on an `"x"` chart the pointer has to move onto another column.
     - **A click or tap on the plot moves the tab stop to the point it hovers,** without the ring, as one on an x's column does by the browser's own focus.
     - **`update({ hover })` moves focus without hovering,** keeping the ring: decision 10's "a hover held ends". The tab stop moves too when nothing is focused, and an x with no point goes to the nearest x with one. A link's hover from another source shows again in the new targets.
     - **A page along a line on numbers is a tenth of that line's points,** rounded up, where decision 10 says "a tenth of the x's": the same on a line with no missing values, and steps along the line's own stops otherwise.
     - **Up and Down at one height go in series order,** and every key stops at the ends, with no wrap-around, as on x's.
     - **`markLabel` for a point** is given the point's key as `key` and its value as `total`. The x's names are still worked out, for their hidden columns, so `markLabel` is called for both.
     - **The hovered point's line keeps its colour:** it gets `ec-hot-line`, not `ec-hot`, which would stroke it in the strong colour.
     - **`"x"` makes nothing new,** and `"point"` hides the x's columns rather than removing them, so switching back is at once. `.ec-stops` is made the first time the hover is `"point"`, and goes when it's `"x"` again.
     - **Files beyond the brief's list:** `src/charts/interaction.ts` (the pointer's position and `moves`), and `src/charts/README.md`'s rows for it and `keyboard.ts`. `KeyboardFocusOptions.move`, `KeyboardFocus.retarget`, `ChartHoverOptions.moves` and `move`, and `ChartHover.retarget` are additions to internal modules; bar, donut and `expressive()` don't use them.
     - **`curve: "monotone"`** was tested once step 1 landed and was merged here: the pointer, the dimming and the keys on curved lines, and `update({ curve: "linear" })` with a point focused, which keeps focus and its stop on the point. Nothing in the hover reads the line's shape; the points are at the rows, on the curve.
   - Docs: architecture.md (Line chart: hover, focus and its ARIA structure), api.md (`hover`, the tooltip function's second argument), README's Charts line, the backlog's line chart extras, CHANGELOG (Added).
3. ✅ **Labels that keep clear** (decision 11). Owns `nearbyLabels` in `src/core/contracts/geometry.ts` and in the builders (`src/core/geometry/describe/`), `src/effects/caption.ts`, the boxes the charts give (each line's other end labels in `line-layout.ts`, and `src/charts/donut-layout.ts`), the names of a chart with a negative column in `src/charts/bar-layout.ts`, and their tests.
   - Tests:
     - `captionPlace`: past a nearby box along a heading and out from a centre; the way picked from `labelBounds` alone, so a nearby box never turns it.
     - The builders taking `nearbyLabels`, each `RangeError`, and the geometry invariants.
     - On real marks (`src/captions.test.ts`): two lines ending close together, each `delta` past the other's end label, at 320 px and wide; a slice's text clear of its neighbours' labels; a negative column's value label clear of its name, with `room` too; and a chart with no negative column as before.
     - The sweep: every source's text outside each mark's labels and its nearby ones.
   - **Done when** every existing test passes unchanged, but any that pinned the names' place on a chart with a negative column, each named in the PR.
   - Docs: architecture.md (Mark geometry, Change labels, the bar chart's layout), api.md (`nearbyLabels`, the specs), the effects guide (keeping text clear of other marks' labels), the sketch, the backlog's two items, CHANGELOG (the field under Added, the text's place and the names under Fixed).
   - **Built** (28 October 2026) as decision 11 describes ([architecture.md](architecture.md#other-marks-labels-nearby)):
     - **The field.** `MarkGeometry.nearbyLabels?: readonly Rect[]` (`src/core/contracts/geometry.ts`), after `labelBounds`. All five specs take it, and `assemble` passes it through as given; a bar's segments get none. `labelBoxes(builder, boxes, field)` in `describe/mark.ts` checks it as it checks `labelBounds`, four comparisons a good box, naming the field: `describe.arc: nearbyLabels[1].width must be a finite number ≥ 0, got -1.`
     - **The line chart** (`placeLines`, beside `labelBounds`) boxes each drawn end label once, then gives each line its own as `labelBounds` and the others', in series order, as `nearbyLabels`. A label whose text is `""` is left out, a line alone gets `[]`, and with `labels: false` both are unset. Points get none.
     - **The donut.** `placeSlices` (new, in `donut-layout.ts`) gives each slice the nearest label each way round, passing over slices with none, and once when it's the same both ways, so a slice alone gets `[]`. `layoutDonut` and `donut.ts`'s frames call it; `placeSlice` takes the boxes as a fifth argument.
     - **They follow.** `labelsMoved` (`src/charts/shell/transitions.ts`) compares `nearbyLabels` as well as `labelBounds`, so a line's runs hear when another line's end label moves or goes, and so do an attachment's, whose comparison calls it.
     - **`captionPlace`** picks its way from `labelBounds` alone, as before, then goes 6 px past the farthest box of either list that way meets: along the heading, 10 px past the end at least; out from the centre, past its own label at least. Text centred on its point (within 45° of vertical) goes past a box's top or bottom, not its side (below).
     - **A negative column.** `verticalFrame` puts the names at `base + values + 18`, where `values` is the 18.5 px it keeps under the plot for the value labels when `domain.lo < 0`, and 0 otherwise. The plot's height is the same: the room was kept already, below the names. Measured in Chrome at 320 px: the deepest column's value label ends 4.5 px above its name; its `delta`, past the name, reaches 14.1 px below the chart's bottom (17.6 above the top for a column), and `room: 28` keeps it inside.
     - **Tests** (31 new): `caption.test.ts` 4 (past a nearby box along a heading, beside or past its own, and out from a slice's centre; the way picked from `labelBounds` alone, a nearby box on the heading or the up side never turning it; centred text past a box's top though the heading leaves through its side), `describe/label-bounds.test.ts` 3 (every builder passing `nearbyLabels` through, beside `labelBounds` or alone; unset, and none on segments; each `RangeError`), `invariants.test.ts` 6 (the boxes change nothing else about a mark from each builder), `charts/label-bounds.test.ts` 11 (each line every other's end label, an empty one left out, a line alone, `labels: false`, following a change, a reveal and a resize, and a line's runs told when only another's label moved; each slice its neighbours' either side, passing over a dropped label, one label once, following a change and a resize; bars none; `expressive()` keeping a page's boxes and giving none itself; `geometryChanged`), `bar-layout.test.ts` 2 (the names below the value labels' room with each mix of signs, with `room` too, no name meeting its value; the plot's height kept, and a chart with no negative column as before), `src/captions.test.ts` 5 (two lines ending 3 px apart, each `delta` past both end labels, at 320 and 600 px; a slice's text clear of its neighbours' labels, and a slice with no label past Goal's share along the ring; a negative column at the plot's bottom with its value label off its name and its `delta` past both, with `room` too; a chart with no negative column as before). All but three fail on main's code: bars giving none, and the two that pin a chart with no negative column as before. The sweep's per-source check now counts each mark's `nearbyLabels` too ("delta and label put their text outside every mark's own labels, and other marks' near it"); its line chart's lines end half a goal apart.
     - **One existing test changed,** as "Done when" allowed: `src/captions.test.ts`'s "columns: above the top edge; negative columns stay inside" is now "columns: above the top edge; negative columns, past their names, below the bottom edge", 13.6 px by jsdom's estimate. It pinned the names' place: a `delta` past a name at `base + 18` stayed inside.
     - **Sizes** (gzip, in bytes against main `819d714`): everything 78,135 of 78,336 (360 B more, 201 B left), `dist/index.js` 113,025 of 111 KB (528 B more, comments included), the script-tag bundle 78,008 (344 B), the switch's set 41,976 (225 B), the line page's set 38,045 (105 B), `expressive` and `travel` 31,946 (89 B), `barChart` 31,289 (71 B), `describe` and `matrix` 7,463 (69 B). No budget raised.
   - **Decisions beyond the plan:**
     - **Centred text goes past a label's top or bottom.** Text within 45° of vertical is centred on its point and reaches out to either side, so leaving a box through its side, as the heading may, left it on the box. Measured on 1,500 random donuts in jsdom (8,322 slices, a 6-character change): labelled slices put no text on a neighbour's label before or after, but 40 of 7,730 put it on their own label, and none now; slices whose label is dropped, whose text runs along the ring, put it on another's label 86 times in 592 on main, 88 with the plan's rule alone, and 63 with this. No existing test or demo changed: the demos' `delta` and `label` run on level or straight ways.
     - **A slice's neighbours are the nearest labels each way,** passing over slices whose label is dropped, rather than the slices next to it: a dropped label leaves the next one nearer.
     - **`[]` and unset,** as with `labelBounds`: the line chart with labels and the donut always set it, `[]` when no other label is drawn; bars, points, segments, `labels: false` and host marks leave it unset.
     - **Two files outside the brief's list,** one change each: `labelsMoved` in `shell/transitions.ts`, so effects hear a neighbour's label move, and `placeSlices` called from `donut.ts`.
     - **Two lines' changes can still meet each other.** An effect sees only its own mark, so two lines ending close together put their changes past the same end labels, where they can meet (in the 320 px test, "+1" and "+0.9" do). A slice with no label of its own can still have its text beside a label its heading misses by more than 6 px. Both are in architecture.md.
4. ✅ **Curved Vega lines** (decision 12). Owns reading lines in `src/charts/adapter/vega.ts`, and `src/vega.test.ts`.
   - Tests: Vega-Lite lines drawn with `"monotone"`, `"basis"`, `"step"` and `"natural"`, each the same mark as `describe.shape` gives its path's `d`; one closed on itself; one with missing values, its gaps at each move; the samples at the items; `threshold` against xG and a riding ball, with nothing inside a gap on any frame; a render that changes the curve, followed; `update({ on })`; the sweep on the View's curved lines; and a straight line the same mark as on main.
   - **Done when** every existing test passes unchanged, but any that pinned the throw on a curve, each named in the PR.
   - Docs: architecture.md (Vega and Vega-Lite), api.md (`fromVegaView()`), README's Adapters line, CHANGELOG (Added).
   - **Built** (28 October 2026) as decision 12 describes ([architecture.md](architecture.md#vega-and-vega-lite-fromvegaview)):
     - **Reading** (`src/charts/adapter/vega.ts`). `straight(first)` (new) says whether Vega draws a line straight: its first item's `interpolate`, which is the one Vega reads, is `"linear"` or unset. `lineOf` gives a straight line to `describeLine` from its items, as before, and any other to `describeShape`, imported by name from `src/core/geometry/describe/shape`: the element's own `d`, unrounded; as `matrix`, the matrix the items' numbers go through, from the element's parent into the marks' common ancestor; and as `width`, the item's `strokeWidth` (or the element's `stroke-width`) scaled by it. `series` is the key, as on a straight line. The samples are `lineSamples`' as before: the items drawn, through the same matrix, projected with `samplesAlong`, which puts `gapBefore` after the curve's gaps. The throw in `pointsOf` is gone, with the comment above it, and `VegaItem.interpolate`'s doc comment says what's read; no type changed. What an element shows, the items left out and the lines with none drawn are as before.
     - **Tests** (73 more: 76 new, 3 gone):
       - `src/vega.test.ts` (30 new). In "a Vega-Lite line drawn as a curve" (18): `"monotone"`, `"basis"`, `"step"` and `"natural"`, each the same mark as `describe.shape` gives the path's `d` (its fields, its outline's samples, and its walk, heading and slices at eleven points), open, flattened, from the first item to the last; their samples at the weeks, each at its item's point on the curves through them, and at the nearest point of the basis curve; `threshold` against xG and the riding ball on the monotone curve, in Presentation and Off, each colour change where `threshold` puts it (between the weeks, linear in `t`) and within 10 px of where the drawn lines cross (7.9 px at most on this season, at 60 px a week); `"basis-closed"` and `"linear-closed"` as closed shapes, their samples all at the start; a Vega spec with each line in a group of its own, at `translate(30,10)` and `translate(30,310)`, each the mark `describe.shape` gives with that matrix, its samples moved with it; a curve with a stroke width of 0 as 1 px; a straight line, with no `interpolate` and with `"linear"`, the same mark as `describe.line` gives Vega's items' points; a signal that changes `interpolate` from `"linear"` to `"monotone"`, `"step"` and back, each followed with `threshold` and the ball, back to the first mark exactly, with no events (a move, not an update); and `update({ on })` on the curved line, with focus and the tab stop kept, then new data followed. In "a Vega-Lite line with missing values", "drawn as a monotone curve" (12): in each of the four modes that break a line, the path's `d` with three moves, the mark `describe.shape` gives it, its two gaps at weeks 2–4 and 5–8, and its samples with `gapBefore` after each, at their points; and `threshold` with the riding ball in Presentation and Off, nothing drawn inside a gap on any frame (`drawnInGaps`), the crossings on the straight runs of two exact and week 8's placed on the curve.
       - `src/conformance.test.ts` (46): the View's monotone curves, on the season and the patchy one, read once in a `beforeAll` (Vega renders in a promise), as two sources through the sweep (32), the patchy one in the gap sweep too (13), and a test that they're open, 2 px wide, with a gap where a week is missing.
       - **The tests changed:** `vega.test.ts`'s "refuses a line Vega draws as a curve (%s), rather than describing straight segments", three tests (`"monotone"`, `"basis"` and `"step"`), pinned the throw. They're gone; "reads a line drawn %s from the path Vega draws…" reads those curves instead.
       - 28 of the new Vega tests fail on main's `vega.ts`; the two on straight lines pass on both. 2,525 tests in 105 files pass (2,452 on main), and every other existing test passes unchanged.
     - **Sizes** (gzip, in bytes from the size check's bundling, against main `819d714` built the same way): everything 77,759 (75.9 KB of 76.5), 16 fewer than main: the throw's message goes, and `describe.shape` was already in that set. `dist/index.js` with its chunks 112,516 (109.9 KB of 111), 19 more. `expressive` and `travel` 31,857, the same. The other sets are as on main, to 0.1 KB. No budget changes.
   - **Decisions beyond the plan:**
     - **`"linear-closed"` is read as a curve.** It's straight, but Vega closes it on itself, so it's read from its path as a closed shape, as decision 12 says of the `-closed` interpolations. Only `"linear"`, or none, is read from the items.
     - **A curve's stroke width that isn't more than 0 reads as 1 px,** as `expressive()` reads a shape by its tag (M9 step 6), since `describe.shape` needs more than 0. A straight line keeps its width, 0 too, as before.
     - **A closed curve's samples are all at `t` 0,** in item order: it has no walk to project them onto, as with any closed shape. So `threshold` colours nothing on it.
     - **The matrix is the items':** from the element's parent into the marks' common ancestor. Vega draws a line's path in its group's coordinates, with no `transform` of its own, so its `d` and its items' numbers share them.
     - **The sweep's sources are synchronous, and Vega renders in a promise,** so `src/conformance.test.ts` reads the View's curves in a `beforeAll` and keeps their marks.
     - **Docs beyond the step's list,** each a line: architecture.md's Shapes and Gaps, api.md's `VegaItem`, and the sketch's adapter note.
5. ✅ **Smaller sets, a stable tsdown, and sturdy tests** (decision 13). Owns tsdown's version in `package.json` and the lockfile, `tsdown.config.ts` as it needs, the pure marks (small edits in `theme.ts`, `src/charts/time.ts`, `src/effects/gaits.ts` and `src/core/geometry/walk.ts`), the two budgets it lowers, architecture.md's Build outputs and Bundle size, and CONTRIBUTING's toolchain lines.
   - Checks: the small sets measured before and after; the comparison of tsdown 0.23.3's build with main's; `npm ls rolldown-plugin-dts` naming no beta; `typecheck`; the suite, run while another suite runs, with no timeout; `pack-check` on 5.4, 6 and 7; `build:site`; and CI on Node 22 and 24.
   - **Done when** `npm run typecheck && npm test && npm run build`, `npm run size` and `npm run pack-check` pass, the two small sets are smaller with no other size grown, the build needs no beta, and the published types are the same.
   - Docs: architecture.md (Build outputs, Bundle size), CONTRIBUTING (tsdown's version, the tests' timeout), CHANGELOG (Changed: smaller pages that import only the motion core or `describe`).
   - **Built** (28 October 2026) as decision 13 describes, the comparison first ([architecture.md](architecture.md#bundle-size)):
     - **tsdown 0.23.3,** pinned exactly, with rolldown-plugin-dts 0.28.8, a stable release, in place of 0.29.0-beta.2. `npm ls rolldown-plugin-dts` names no beta. npm puts the plugin under tsdown (`node_modules/tsdown/node_modules`), since nothing else needs it.
     - **The comparison** of its build with main's (`819d714`), before anything else changed (the scripts are in the step's notes):
       - **The files:** the same 33 in `dist/`, each byte for byte the same, the chunks' names too.
       - **The names:** each entry's names as an ES module and as CommonJS (55, 3 and 6), with each value's kind, an object's keys and a function's arity, and `ExpressiveCharts`'s 55, are the same. Every script parses as ES2020.
       - **The types,** read with TypeScript 6.0.3's API, in the `.d.ts` and `.d.cts` files: all 462 top-level declarations print the same, by name, type, members and documentation, and so do the four entries' 420 exports. 408 are identical by TypeScript's identity relation; `link`, `only`, `parallel`, `sequence`, `stagger` and `chartSwitch`, in each kind of file, are assignable both ways instead, as they are between main and a copy of main. A field changed in a copy of the build was caught.
       - **The sizes:** all the same, to the byte.
       - Nothing differed, so the step went on.
     - **The tables marked pure.** The gaits' still pose (`gaits.ts`) and a walk's empty gaps (`walk.ts`) are `/* @__PURE__ */ Object.freeze(...)`, and the theme's tokens (`theme.ts`) are `Object.fromEntries` and `map`, each marked. Rolldown keeps a template with values in it, and a spread, even when the calls inside are marked, so the token rules and the stylesheet's text (`theme.ts`) and the time axis's steps (`time.ts`) are each built by an arrow function called at once, the call marked pure. A page that uses them builds the same values: the stylesheet and the declarations are byte for byte main's. The theme's header and the steps' doc comment say why.
     - **Sizes** (gzip, against main's): `motion` and `animated` 1.67 KB (1,709 bytes), 0.74 less, as before tsdown; `describe` and `matrix` 6.48 KB (6,634 bytes), 0.74 less; `barChart`, the switch's set, and `expressive` and `travel` 0.06 to 0.09 KB less; the line page's set 0.03 less; `everything` the same to the byte. The script-tag bundle is 0.18 KB smaller (185 bytes). `index.js` is 49 bytes bigger and `index.cjs` 47, the marks themselves, and `testing.cjs` 1. Neither small set keeps anything it doesn't use. Measured again with steps 1 to 4 merged (main `5742713`): the small sets 756 and 754 bytes smaller than main, the other sets 34 to 91 less, `everything` the same to the byte, the script-tag bundle 207 less, and `index.js` 44 and `index.cjs` 46 more, with the same names and types. `describe` and `matrix` is 6.6 KB there, with step 3's `nearbyLabels` checks, under its new 7.5.
     - **Budgets:** `motion, animated` from 3 to 2 KB, and `describe, matrix` from 8 to 7.5, their sizes plus 10%, rounded up to 0.5 KB.
     - **The tests under load:** two full runs at once, twice, while the other wave 1 sessions worked: all 2,452 tests in 105 files passed in each, and none timed out. The slowest were the 1,000-bar test at 8.4 s, `d3-line.test.ts`'s reveal that `playback()` drives at 7.2 s and `long-axes.test.ts`'s thinning on each update at 6.2 s, each past the old 5 s and inside 15. The suite takes 47 s alone and 75 s two at once.
     - **Checks:** `typecheck` (2.6 s), 2,452 tests in 105 files, the build, the size check, `pack-check` on 5.4.5, 6.0.3 and 7.0.2 (37 files, 1.45 MB packed and 5.41 MB unpacked), and `build:site` pass. CI on Node 22 and 24 runs with the PR.
     - **Docs:** architecture.md (Build outputs; Bundle size: today's sizes beside 0.4.0's, and the values built at import), CONTRIBUTING (tsdown's version, the tests' 15 s, and building a top-level value in a call marked pure), CHANGELOG (`## Unreleased`, with Added, Changed and Fixed: the smaller pages under Changed).
   - **Decisions beyond the plan:**
     - **The script-tag bundle leaves out the pure marks** (`annotation: false` in its build's comments). They'd have made it 18 bytes bigger gzipped, and nothing tree-shakes a script-tag bundle. Without them, Rolldown's own 131 too, it's main's bundle less its marks, byte for byte.
     - **`samples.ts`'s golden section is marked too,** outside the four files the plan names: `(Math.sqrt(5) - 1) / 2` stayed in both small sets. Written out as a number, it made `everything` 11 bytes bigger gzipped, so it's built in a call marked pure.
     - **`index.js` and `index.cjs` are about 50 bytes bigger gzipped,** and `testing.cjs` 1 byte: the marks are comments that the unminified files keep for a page's bundler. No page and no minified file grows, but the plan's "no other size may grow" doesn't hold for those three files to the byte; the size check shows `index.cjs` at 108.1 KB, not 108.0.
     - **architecture.md's tables** show today's sizes beside 0.4.0's, as M9 step 5's did, until step 8 measures 0.5.0's.
     - **CONTRIBUTING's Bundle size** says to build a value at a module's top level in a call marked pure, so the small sets don't grow again.

**Wave 2** (after steps 1 to 4 land):

6. ✅ **The demos, their screenshots, the audit and script K.** Owns `demo/line.*`, `demo/vega-line.ts`, `demo/season.*`, their visual specs and baselines, README's GIFs if they differ, `docs/a11y-audit.md`, and section K of `docs/a11y-check.md`.
   - **The line page:** two toggles above its first chart, Straight or Curved (`update({ curve })`) and Each week or Nearest point (`update({ hover })`), each keeping focus. The Vega-Lite line follows the first, drawn with `"monotone"` or `"linear"`. Design notes say why a curve never overshoots, and what the nearest point dims.
   - **The season page:** the goals and xG lines show each matchweek's change with `delta`, past their end labels and clear of each other's.
   - **README's GIFs** are compared with their pages, and made again if they differ.
   - **Screenshots,** made in Docker: the curved line, a point hovered and focused, the curved Vega-Lite line, the season page's lines after a matchweek, and every page whose picture changed. Reduced motion and Off are checked in the DOM.
   - **Script K,** for NVDA + Chrome (decision 14). You run it.
   - **The walk:** you look at the pages in the browser, at 320 px too.
   - Docs: a11y-audit.md (the line page's toggles and its hover on a point, the season page's lines, the Browsers count), a11y-check.md (section K and its results), CONTRIBUTING's visual tests.
   - **Built** (28 October 2026), as the plan says, in two PRs: the pages, their tests and baselines, the audit and script K first ([#114](https://github.com/Deaversbp/expressive-charts/pull/114)), then script K's results and the walk:
     - **The line page** (`demo/line.html`, `demo/line.ts`). Two groups of toggle buttons in the first card, between its note and the chart, each with a visible label that names it, as the shapes page's picker has: Line, Straight or Curved, and Hover, Each week or Nearest point. They drive both `lineChart`s, the one with missing weeks too (`update({ curve })` and `update({ hover })`), and focus stays on the toggle. The tooltips and names are given the point's series with Nearest point: "Matchweek 12: 18 goals" and its gap, and on the chart with missing weeks "Matchweek 4: 4 goals" with none. The first card's toggles take a row of the pair's subgrid that the D3 card leaves empty, so the two charts still start at the same height. Four design notes: why a monotone curve never overshoots, where the red goes on a curve (exact on the chart, a few px off between the weeks on the Vega-Lite line), what Nearest point dims and what it doesn't, and what the toggles do on the chart with missing weeks. Two things to try.
     - **The Vega-Lite line** (`demo/vega-line.ts`) is drawn with `interpolate: { expr: "curve" }` and a `curve` param, `"linear"` to start. `VegaLine.curve()` sets the signal and runs the View; `fromVegaView()` follows the new path as a move, with no `refresh()`.
     - **The season page** (`demo/season.html`, `demo/season.ts`). The goals line has `delta()` in its `update` slot, kept to the line with `only()`, past its end label and clear of xG's. The announcement ends with the season to date: "Matchweek 25: Okafor +1, 15 goals; Lindqvist +1, 7 goals. Season to date: 43 goals +2, 39.7 xG +1.8." The linked card's note says why only the goals line has a change.
     - **README's GIFs.** `threshold-line.gif` is made again, on your word (`npm run media -- --grep "a season plays"`, 336 KB): the recording takes in the first card, which has the toggles now. `arrow-on-hover.gif` and `ball-and-boot.gif` come out byte for byte the same, and `donut-to-columns.gif` differs from main's only in anti-aliasing, as M9 found, so it stays. The recorder's viewport (`scripts/media/playwright.config.ts`) is 440 × 6,000, from 5,000: the line page is about 5,300 px at that width.
     - **Tests** (15 new in each browser):
       - `line.spec.ts` (12, new): the toggles (each in a named group, a pick pressed with focus kept on it, the chart still one tab stop at its week, moved to a point at it and back); Curved (through every week's value and never past the values either side, easing, the red and the ball, five red runs, back to the straight lines exactly), with a picture; the Vega-Lite line following (Béziers in the same element, its red, the ball at the tip, its names and tab stop kept, and back), with a picture; Nearest point hovered (the tooltip's point and words, above the point, no crosshair, the other line, its end dot and its decorations dimmed and no text), with a picture; the pointer from a point onto its tooltip over the bridge, and Escape; the keys along and between the lines, the ends, Page Down and Escape, with a picture in light and dark; the tooltip clear of the ring at all 76 points; reduced motion and Off (the curve at once, with the red and the ball, and a point's hover at once, with no fade); and on the chart with missing weeks, Curved (each run curved alone, the gaps where they were, no red in them) and Nearest point (Left and Right over the missing weeks, Up and Down doing nothing where the other line is missing, the points named by their one value).
       - `season.spec.ts` (1 new, 3 changed): the goals line's change rising past its end label, clear of every text, and only its own matchweek's, with a picture. **The tests changed:** "adds a week to every chart…" (the announcement's text, now with the season to date, three times, and its overlap check moved into `textsMet`), "without motion" (the goals line's change at once too) and "at 320 px, the changes fit…" (the goals line's change clear of the labels). `textsMet` compares the middle 60% of each text's box, as the text-spacing check does, since Firefox's boxes are 17 px tall for 12.5 px text and a change just above a label touches it there.
       - `a11y.spec.ts` (2 new, 2 changed): axe on the line page with Curved and Nearest point picked and a point focused, in light and dark. **The tests changed:** the line page's tab stops, with the four toggles after the scrubber, and the 320 px check's viewport, 7,000 px high (from 6,000), for every page: the line page is about 6,200 px at that width.
       - `demo.ts`: `lineDemo`'s `height` is 3,100 (from 2,600), and `seasonDemo` has one, 2,200: the season page is about 1,980 px at 1,000 px, close enough to 2,000 that another browser's text could pass it.
     - **Baselines,** made in Docker and approved by you before they were committed: 6 new (`line-curved`, `line-point-hover`, `line-point-focus-light` and `-dark`, `line-vega-curved`, `season-line-matchweek`) and 6 changed (`line-page-light` and `-dark`, `line-play-week-20`: the toggles; `season-page-light` and `-dark`, `season-linked-hover`: the linked card's note). Every other baseline is the same, the line page's element pictures too.
     - **The visual suite** in Docker, in Chromium, Firefox and WebKit with 4 workers, in 17.9 min: 685 passed, 58 skipped (forced colours and the switch's accessibility tree, 29 each in Firefox and WebKit), and 1 failed: the stress page's date line in WebKit ("part way through its play"), whose readout came after the test's 30 s wait. That page and the library are as on main, and the test passed alone 3 times of 3, in 32 to 37 s each. 248 tests in each browser; the audit's Browsers paragraph says so.
     - **Checks:** `typecheck`, 2,667 unit tests in 109 files, the build, the size check (no size moved: no library code changed; the line page's set 40.2 KB of 41, everything 79.9 of 86) and `build:site`.
     - **Docs:** a11y-audit.md (a table for the toggles and the hover on one point under the line page, the season page's rows, finding 7, axe's new run, the intro, the NVDA line and the Browsers count), a11y-check.md (section K, 24 steps in two tables: the line page 1–21, the season page 22–24), and CONTRIBUTING's visual tests (the new pictures and checks, and the pages' heights).
     - **Script K passed** with NVDA + Chrome (28 October 2026): each toggle was read with its state and its group's name, a press kept focus on it, and Tab back into a chart landed where focus was; Straight or Curved changed nothing that was read; with Nearest point, each point was read once, with its week and its one value, and the keys went along and between the lines as the steps say, over the missing weeks too; and on the season page, each announcement ended with the season to date, and "+2" was never read on its own ([Results](a11y-check.md#results)).
     - **The walk** (28 October 2026): you looked at the line and season pages in the browser, at full width and at 320 px, and found nothing to change.
   - **Decisions beyond the plan:**
     - **The toggles drive both `lineChart`s,** the one with missing weeks too, not the first alone: script K's Left and Right passing over a missing week need a chart with missing weeks, and decision 10's keys show best there. The D3 lines don't follow: they're someone else's charts, drawn straight.
     - **The season page's change is on the goals line only,** on your word, after the stop and show: with both lines' `delta()`, the two changes met in 5 of the 9 matchweeks where both change at 1,000 px (26, 29, 31, 32 and 35) and in 8 of 9 at 320 px, since both go past the same two end labels (step 3's limit). At full width they also ran past the chart into the card's padding in 10 of the 14 matchweeks. The goals line's alone lands on no label at either width, and stays inside its card.
     - **The announcement ends with the season to date,** on your word: "Season to date: 43 goals +2, 39.7 xG +1.8." The text before it is as it was, so sections H and I still match how it starts.
     - **The toggles' row is a whole number of px high** (each button's line is 20 px), and neither page's lede changed, so the charts below keep their place on the pixel grid: a row 47.5 px high, and a lede a line longer, moved them by half a pixel, which changed more than a dozen other pictures by anti-aliasing alone.
     - **The toggles' row has its own class,** `.toggles`, so `#season .bar` is still the scrubber's alone, which `line-play-week-20` measures.
     - **A point's name** on the first chart comes from `markLabel`'s `values`, which hold one series for a point; on the chart with missing weeks, from the key (`goals@12`), since a week with a value missing has one series too.
     - **Found, and fixed in step 7** ([#115](https://github.com/Deaversbp/expressive-charts/pull/115), [finding 7](a11y-audit.md#what-it-found)): with Nearest point, a point's tooltip couldn't always be hovered (1.4.13). The bridge started about 3 px above the point's centre, so where the other line's point at that week was less than about 6 px above, it took the hover first (14 of the 76 points); and the tooltip's box ended 0.36 px above its bridge, so at 320 px a whole pixel fell between them and the point nearest it there took the hover (37 more). Both were in `src/charts/tooltip.ts` or the line chart's hover, not the demos. You chose a library fix before 0.5.0, in a step of its own: step 7 made the audit's 1.4.13 row for Nearest point a pass.
     - **The brief's "the page empties the bars' `update` slot before each matchweek"** is from M7: since M8 the runner ends the update runs of the marks an update leaves alone, and the page passes the same effect each time, so the players' changes and the goals line's both go at their chart's next update.

7. ✅ **A point's tooltip that can be hovered** (finding 7, found in step 6). Owns the bridge in `src/charts/tooltip.ts`, the held point in the line chart's hover (`src/charts/line.ts`), their tests, and finding 7 and its 1.4.13 row in `docs/a11y-audit.md`.
   - **Why.** With Nearest point, a point's tooltip couldn't always be hovered (WCAG 1.4.13). The bridge started about 3 px above the point's centre, so where the other line's point at that week was less than about 6 px above, it took the hover first: 14 of the 76 points at 1,000 px. At 320 px a whole pixel fell between the tooltip's box and its bridge, and the point nearest it there took the hover: 37 more. You chose a library fix before 0.5.0, in a step of its own.
   - **Built** (28 October 2026, merged on the 29th as [#115](https://github.com/Deaversbp/expressive-charts/pull/115)), in a session step 6 started:
     - **The bridge reaches a px into the box** (`span()` in `src/charts/tooltip.ts`), above and below. `offsetHeight` is a whole number of px, and the box's real edge can fall up to a px short of it: 0.36 px on the line page at 320 px. The bridge is clear, so nothing looks different. Bars and slices get it too, and nothing changes for them.
     - **The hovered point keeps the pointer on its dot** (`heldPoint()` and `pointAt()` in `src/charts/line.ts`). While its tooltip shows and the pointer is within the dot's radius (4.5 px) of its centre, through its effect's transform, the hover stays on it, though another point is nearer. The bridge starts a px inside the dot, so the pointer going straight up or down meets the bridge before it leaves the dot. A click on the held dot focuses the point hovered.
     - **Tests:** `line-hover.test.ts` 4 new ("onto the tooltip"), and `tooltip.test.ts` 1 new and 2 changed, in their numbers only (the bridge a px taller, 14 not 13). Each of six mutations fails one. `line.spec.ts` has 2 new in each browser: at 1,000 and 320 px, the pointer goes from every point straight onto its tooltip, above or below, and keeps the hover.
     - **Measured** in Docker Chromium on the line page: before, 14 points lost the hover on the way at 1,000 px and 51 at 320 px; after, none.
     - **Checks:** `typecheck`, 2,672 unit tests in 109 files, the build, the size check (the line page's set 40.3 KB of 41, everything 80.0 of 86, no budget raised), `build:site`, and the visual suite in Docker in Chromium, Firefox and WebKit: 692 passed, 58 skipped, none failed, 250 tests in each browser. No baseline changed.
     - **Docs:** CHANGELOG (Fixed), architecture.md (the tooltip's bridge, and the point hover's tooltip), api.md (`hover`), a11y-audit.md (finding 7 fixed, its 1.4.13 row a pass, the Browsers count), CONTRIBUTING (`line.spec.ts`).
   - **Decisions beyond the plan:**
     - **The hover is held on the dot,** rather than given a bridge from its centre. A tooltip that comes up under the pointer lets it through until it's off it, so a bridge to the centre would let the pointer through to the plot, where the nearer point would take the hover anyway.
     - **Only while the tooltip shows:** not with `tooltip: false`, after Escape or `leave()`, or for a link's hover. Without a tooltip the nearest point wins, as before.
     - **The whole dot holds,** as if the hovered dot were on top. So a point drawn within 4.5 px of the hovered one can't be hovered by moving onto it through the hovered dot, only from another side. Touch keeps the same rule.
     - **Points that coincide** (goals equal to xG, or within a px of it) still can't be hovered by the pointer from their centre: of two as near, the series first in `series` wins. The keyboard reaches them.

**Wave 3:**

8. ✅ **Publish 0.5.0** (decision 3). Owns the version (`package.json`, the lockfile, `VERSION`), CHANGELOG's 0.5.0 entry, README's status, its script tag (`@0.5`, and api.md's) and its sizes, architecture.md's sizes, measured again on 0.5.0's code, and this plan's status line and M10's ✅.
   - **The dry run:** `typecheck`, `test`, `build`, the size check, `pack-check`, `npm pack` (its list and sizes shown to you, compared with 0.4.0's) and `npm publish --dry-run`. The PR has their results.
   - **Before the go-ahead,** you check that the trusted publisher is still on npmjs.com.
   - **Then, on your go-ahead in that session:** the `v0.5.0` release is created, and the workflow publishes it with provenance, through trusted publishing.
   - **After:** check npm (the version, README, provenance), install 0.5.0 in a fresh project and load each entry as an ES module and as CommonJS, and check jsDelivr's `@0.5`.
   - **Built** (29 October 2026): [0.5.0 is on npm](https://www.npmjs.com/package/expressive-charts/v/0.5.0) through trusted publishing with provenance, and [its release](https://github.com/Deaversbp/expressive-charts/releases/tag/v0.5.0) is on GitHub.
     - **The release PR** ([#118](https://github.com/Deaversbp/expressive-charts/pull/118)): 0.5.0 in `package.json`, the lockfile and `VERSION`; CHANGELOG's 0.5.0 entry, the Unreleased lists under a short summary; README's status, its script tag at `expressive-charts@0.5` (api.md's too), since `@0.4` keeps serving 0.4.x, and its sizes as measured, a bar chart about 31 KB gzipped and everything 80 KB; and architecture.md's size tables, measured again on 0.5.0's code, without the 0.4.0 column step 5 put beside them, with a sentence for step 3's raise of the script-tag bundle's budget to 88 KB, which its history didn't say. `release.yml` and CONTRIBUTING didn't change. The PR was made late on 28 October and pushed on the 29th, so its date went to the 29th, the day of the release, before the push.
     - **CHANGELOG's lists,** which seven steps wrote, needed two edits: `nearbyLabels`, the item under the promise, moved first in Added, and step 7's fix, a point's tooltip that can be hovered, became a line of the point hover's entry in Added, since that hover is new in 0.5.0 and had nothing released to fix.
     - **The dry run** passed on `056ca12` with the PR: `typecheck`, 2,672 tests, the build, every size within its budget, so none changed (`barChart` 30.8 KB, the line page's set 40.3 of 41, `expressive` and `travel` 31.4, everything 80.0 of 86 and the script-tag bundle 79.7 of 88), `pack-check` on TypeScript 5.4, 6 and 7, `npm pack` and `npm publish --dry-run`.
     - **The tarball** has 37 files, as 0.4.0's: the same files but three hashed chunks, `drawing-…`, `effect-…` and `transition-…`, whose hashes changed with the code. Built on Windows it's 1.5 MB packed and 5.7 MB unpacked, since the checkout's CRLF goes into the source maps. Built from an LF copy, as CI builds it, it's 1.5 and 5.5 MB, and npm's is 5,530,850 bytes unpacked, the same.
     - **You** approved the release notes, merged the PR and gave the go-ahead. The trusted publisher was still on npmjs.com, as the publish showed.
     - **The release.** Main's CI was green on `5c7eaf2`. On your go-ahead, `v0.5.0` was created there at 19:32 UTC on 29 October (12:32, Pacific time), and its run published with provenance at 19:33 ([Sigstore's log](https://search.sigstore.dev/?logIndex=3574807073)), first time, with no `ENEEDAUTH`.
     - **After.** npm shows 0.5.0 as `latest`, with README, its four GIFs, and "Built and signed on GitHub Actions" from `5c7eaf2` and `release.yml`. Its provenance is SLSA v1, from `refs/tags/v0.5.0`. A fresh project installs it with no dependencies, `npm audit signatures` verifies its registry signature and its attestation, and all three entries load as ES modules and as CommonJS, with the same names both ways, `VERSION` 0.5.0 and the stylesheet. jsDelivr serves the script tag at `expressive-charts@0.5`, the same bytes as the build, once npm had processed the package (it gave a 404 for about a minute before), and the demo pages load. No placeholder version came.

**Done when:**
- **Curves.** `lineChart` draws `curve: "monotone"` through every value without overshooting, with its gaps, its reveal and `update({ curve })`, and `threshold` changes colour where the drawn lines cross. A chart without `curve` draws as before.
- **A hover on one point.** `lineChart({ hover: "point" })` hovers the nearest point with the other lines dimmed, by the pointer, touch and the keys, Up and Down between lines, and links by x. Its tooltip can be hovered from every point (step 7). A chart without `hover` hovers as before.
- **Labels.** `delta` and `label` keep off other marks' labels through `MarkGeometry.nearbyLabels`, two lines ending close together among them, and a negative column's value label keeps off its name.
- **Vega.** `fromVegaView()` reads a Vega-Lite line drawn as a curve.
- **The build.** A page that imports only `motion` and `animated`, or `describe` and `matrix`, is smaller; tsdown builds on rolldown-plugin-dts's stable release, with the same published types; and the tests hold up under load.
- **The demos** show all of it, with their screenshots and the audit, and script K passed with NVDA + Chrome.
- **Docs.** api.md, architecture.md, the effects guide, README and CHANGELOG cover every addition and change. The promise changes only by `nearbyLabels`, an addition.
- **0.5.0 is on npm,** published through trusted publishing with provenance, with its CHANGELOG entry and its release on GitHub. This plan's status line says M10 is done.

**Status: complete (29 October 2026).** Every item on the list holds. Steps 1 to 7 built and checked the first seven, and 0.5.0 is on npm through trusted publishing with provenance, with its release on GitHub (step 8).

### M11: Lines in a switch, and changes that keep clear of each other (0.6.0)

A line chart as a chart switch's view, its points growing into columns and its gaps kept through the morph; change text that keeps clear of other marks' change text; more host marks read by tag; a tidier hover on one point; `morph` that keeps a shape's holes; a toolchain tidy; and last, 0.6.0 on npm.

**Demo:** the morph page gets a second card: a season's goals and xG with missing weeks, switching between Per match and Season to date as lines and Per match as columns. On the season page, both lines show each matchweek's change again, clear of each other. The donut page's D3 pie is read by tag.

**Where M11 starts** (checked against main at `b646d0f` while planning, 29 October 2026):

- **Already built.**
  - **0.5.0** is npm's `latest`, published through trusted publishing with provenance. npm lists `0.0.0-stage` and `0.1.0` to `0.5.0`. GitHub has no open issues or pull requests. Main is 0.5.0's code, with this plan's last edits.
  - **The switch** takes bar, donut and line charts as views, but a line's points don't suit it yet (architecture.md's "Not fitted yet"). Points aren't drawn at rest, so the overlay would draw dots that weren't there. They're keyed `goals@12` and coloured by series, but the overlay draws each pair, and each mark that fades, in its key's colour (`colors.slot(key)` in `src/charts/switch.ts`), which would give each point a colour of its own. Marks pair by key, and one with no partner fades where it stands.
  - **`morph`** (`src/effects/morph.ts`) samples a line's outline along its whole walk, so between two lines with gaps it joins them part way; its first and last frames are the lines' own. Between closed outlines it samples the longest subpath, so a shape's holes show only at the ends, in the outlines' own `d`.
  - **A switch back doesn't jump.** M5 step 4 measured up to 0.17 px at real speed. M6 step 4 started the switch's tween and the pairs' runs at one time, and `src/morph.test.ts` checks a reverse on a clock that moves while it's read.
  - **Change labels.** `captionPlace` (`src/effects/caption.ts`, internal) goes past the mark's `labelBounds` and `nearbyLabels`.
    - An effect sees only its own mark, so two lines ending close together put their changes past the same end labels, where they can meet. On the season page they met in 5 of the 9 matchweeks where both change at 1,000 px, and in 8 of 9 at 320 px, so it shows only the goals line's change (M10 step 6).
    - A box is in the way when the line the text is placed along passes within 6 px of it. Text centred along a slice's ring reaches further to each side, so in M10 step 3's probe, 63 of 592 slices whose label was dropped put their text on another slice's label.
    - Effects can't measure text: a `TextHandle` has only `update` and `remove`.
    - The line chart has no `room`, and at full width the season page's changes ran past the chart into the card's padding in 10 of 14 matchweeks.
  - **The adapter.** `expressive()` throws on a rotated or skewed `<rect>` ("isn't an upright bar"). It reads a `<path>` as a closed shape with its own centre, so a D3 pie read by tag keeps document order and its slices aren't slices; the donut page gives `geometry` with `describe.arc` instead. A stroke's width is scaled by the element's transform, and `vector-effect: non-scaling-stroke` isn't read (M9 step 6).
  - **The hover on one point.** Of two points as near the pointer, the series first in `series` wins (`nearestPoint` in `src/charts/line.ts`). So a point drawn on another can't be hovered by the pointer from its centre; the keyboard reaches it (M10 step 7). With `hover: "point"`, the x's names are still worked out for their hidden columns, so `markLabel` is called for every x as well as every point.
  - **The build.** tsdown 0.23.3, pinned, with rolldown-plugin-dts 0.28.8 and rolldown 1.2.15. TypeScript 7.0.2 runs `typecheck` (2.5 s), and 6.0.3, as `typescript-6`, the API docs test. TypeScript 7.1 is still in beta (7.1.0-beta, and nightly 7.1.0-dev builds), so that test stays on TypeScript 6's API. vite 8.3.5 and jsdom 30.1.3 are out (main has 8.3.4 and 29.1.1); neither is part of M11.
  - **Testing.** 2,672 unit tests in 109 files pass. The visual suite ran 692 tests, with 58 skipped, at M10 step 7 (250 in each browser). In M10 step 6, WebKit's stress-page date line ("part way through its play") once went past its 30 s wait under 4 workers; alone it takes 32 to 37 s.
  - **Sizes** (gzip, against their budgets, on `b646d0f`, 0.5.0's code): everything 80.0 KB of 86 (81,943 bytes: 6.0 KB left), `barChart` 30.8 of 34, the line page's set 40.3 of 41 (41,313 bytes: 671 left), the switch's set 41.2 of 45, `expressive` and `travel` 31.4 of 34, `describe` and `matrix` 6.6 of 7.5, `motion` and `animated` 1.7 of 2, the script-tag bundle 79.7 of 88, `dist/index.js` 115.2 of 123.5, `dist/index.cjs` 113.3 of 124, `dist/testing.js` 22.8 of 24.5, and the stylesheet 2.4 of 2.5.
- **Gaps.**
  - A line chart can't be a switch view in practice, and `morph` joins a line's gaps and shows a shape's holes only at its ends.
  - Two marks' change text can meet, and a slice's, with its label dropped, can sit on a neighbour's label. The line chart keeps no room for that text.
  - A rotated `<rect>` throws, a D3 pie read by tag isn't read as slices, and a non-scaling stroke's width is read wrong.
  - A point drawn on another can't be hovered by the pointer from its centre, and `markLabel` is called for hidden x's.
- **Out of date** (each fixed by the step named):
  - tsdown 0.23.4 is out (29 October). It still asks for rolldown-plugin-dts `^0.28.8`, so 0.29.0, stable the same day, isn't taken; both pin `get-tsconfig 5.0.0-beta.6`. `npm dedupe` would hoist `magic-string` and `commander` (step 6).
  - `docs/a11y-audit.md`'s link to M8 misses GitHub's anchor, which ends in a hyphen for a heading that ends in ✅ (step 6).
  - architecture.md's chart switch says a line's points don't suit it yet, and so does api.md's `ChartSwitchView` (step 1). architecture.md's Gaps says `morph` joins two lines' gaps part way (step 2).

**What M11 takes from the backlog and the notes, and what stays:**

| Item | Goes to |
| --- | --- |
| Line charts as switch views (M6 decision 3), with `morph` across gaps (M8 step 3) | Decisions 1, 4, 8, 10 and 11, steps 1 and 2 |
| Two lines' changes meeting each other, and a slice with its label dropped beside a neighbour's label (M10 step 3's notes), and a line chart's room for them (M10 step 6's notes) | Decisions 1, 5 and 12, step 3 |
| A rotated `<rect>` read as a closed shape, a pie's slices read by tag, and `vector-effect: non-scaling-stroke` widths (M9 step 6's notes) | Decisions 2, 7 and 13, step 4 |
| Points drawn on each other, and `markLabel` called for x's and points (M10 steps 2 and 7's notes) | Decisions 2, 6 and 14, step 5 |
| `morph` between shapes with holes (M9 step 3's notes) | Decisions 2 and 11, step 2 |
| tsdown 0.23.4, `npm dedupe`, WebKit's wait on the stress page, and the audit's link to M8 (M10's notes) | Decisions 2 and 15, step 6 |
| A switch back's 0.17 px jump (M5 step 4's notes) | Done in M6 step 4 (above) |
| `api-docs.test.ts` on TypeScript 7's API, rolldown-plugin-dts 0.29.0, and a stable `get-tsconfig` | Stay: TypeScript 7.1 is in beta, tsdown asks for 0.28.8, and both plugin releases pin the beta |
| Switching between host charts, a transition effect reporting its progress, time zones by name, drawing a mark itself in, recolouring at once on `update({ colors })`, decorations below a line chart's points, `threshold` exact on curved Vega lines, a lighter path than `refresh()` for Vega, a bar's per-frame cost, VoiceOver + Safari, a written audit table for `stress.html`, square caps and bevel joins, a curved line's fade beside a row coming or going, a mark's `opacity` reaching its decorations, and M8's notes | Stay: in the backlog, or in the notes |

When step 1 lands, it marks the backlog's line charts as switch views as built in M11. The other items come from the notes.

**Decided while planning M11 (29 October 2026):** decisions 1–8 are yours, and 9–16 follow from them and the code.

1. **M11 builds two things:** lines in a switch (a line chart as a chart switch's view, to and from columns and other line charts, with `morph` keeping a line's gaps), and changes that keep clear of each other (one mark's change text off another's, and a slice's off a neighbour's label when its own is dropped).
2. **Four smaller items join them:** more host marks read by tag (a rotated `<rect>`, a pie's slices and non-scaling strokes); a tidier hover on one point (points drawn on each other, and `markLabel` once a stop); `morph` between shapes with holes; and a toolchain and test tidy.
3. **One release, 0.6.0, when M11 is done.**
4. **A line's points grow into columns.** From a line chart to columns, each point pairs with its column by key and grows out of the line where it sits, and the line fades out over the first half; back, they shrink into it. The page keys its columns as the points are keyed (`goals@12`). Not a crossfade, which would show nothing of which value became which column.
5. **Effects share where their text is.** The effect context tells an effect where other effects' text sits on the same chart, and `delta` and `label` go past it, as they go past `nearbyLabels`. The mark first in the chart's order keeps its place. Lines get `room`, as bars have. Not a line's change beside its own end label, which would help lines only.
6. **Of points drawn on each other, the nearer line wins.** The pointer hovers the one whose line passes nearer it; exactly on the centre, the series first in `series` wins, as now. One point a hover, as now, not both at once.
7. **A pie's path is read as a slice:** `describe.arc`, from its centre, radii and angles, so it's ordered clockwise and every effect treats it as our donut's slices. Anything else stays a shape. Not the order alone.
8. **The demos:** a new card on the morph page, a season's goals and xG with missing weeks as Per match and Season to date lines and Per match columns; the season page's xG line with its change again; and the donut page's D3 pie read by tag.
9. **What's an addition and what isn't** (the 0.x promise). 0.6.0 is a minor release. In the effect-author API, `texts` on `EffectContext` is an addition; nothing in it changes or goes.

   | Change | Under the promise? | Kind |
   | --- | --- | --- |
   | `texts` on `EffectContext`, and its type, `TextSpace` | Yes | An optional field: an addition. An effect that doesn't read it works as before, and a context without it is still one |
   | `delta` and `label` going past other effects' text, and checking their text's own box | No: the built-in effects | A fix: text that landed on another mark's change, or a slice's on a neighbour's label, now goes past it. Listed under Fixed |
   | `morph` keeping a line's gaps and a shape's holes | No: the built-in effects | A fix: lines without gaps and outlines without holes morph as before, byte for byte. Listed under Fixed |
   | A line chart as a switch view, and the switch drawing each mark in its view's colour | No: the charts | Additions: optional methods on `ChartSwitchView`, which the three charts' handles have. A switch whose views colour their marks by key draws as before |
   | `room` on `lineChart` | No: the charts | An addition: its default, 0, lays out as before |
   | The nearer line winning, and `markLabel` called once a stop | No: the charts | A fix, and a change: a page that counts `markLabel`'s calls with `hover: "point"` sees fewer. Listed under Changed |
   | `expressive()` reading a rotated `<rect>`, a slice's path as a slice, and a non-scaling stroke | No: the adapters | The `<rect>` is an addition (it threw), and the stroke a fix. A D3 pie read by tag gets slices where it had shapes, so its effects act as on our donut: a change, listed under Changed, with `geometry` to keep the shapes |
   | tsdown 0.23.4, and `npm dedupe` | The published types | Nothing changes while every exported name has the same type, which the comparison checks. A difference stops the step |
   | WebKit's wait, and the audit's link | No: the repository | Tests and docs only |

10. **Lines in a switch** (decisions 1 and 4).
    - **Pairs** go by key, as now. A line chart's lines pair with another line chart's by series, and morph along their strokes, gaps kept (decision 11). Its points pair with the other view's marks of the same key: another line chart's points, or columns keyed as the points are, which a page gives with the bar chart's `key` (`key: (d) => \`goals@${d.week}\``). A mark with no partner fades, as now: the line, going to columns, fades out over the first half.
    - **What each view draws.** `ChartSwitchView` gets an optional method, `paintOf(key)`, which gives the name a mark's colour comes from in the shared assignment, and whether its chart draws it at rest. The bar, donut and line charts' handles have it. A line and its points take their series' colour, and of the points only a value alone between gaps is drawn at rest. A bar takes the colour `colorBy` gives it (its key, or its first part's series), and a slice its key.
    - **The overlay** draws each pair, and each mark that fades, in the colour its view gives it. A pair whose two colours differ is drawn in the new view's; pages keep them the same, as `colors` and `colorBy` do now. A view without `paintOf` is drawn by key, as now, so the morph page's donut and columns, which colour by key, draw as before.
    - **A mark its view doesn't draw at rest** starts or ends as a dot of no size at its centre, so a column grows out of its point and shrinks back into it. A pair that neither view draws isn't played, so two line charts' points stay hidden.
    - **Labels** pair by key and role, as now. A line's end label has no partner among columns and fades, and the columns' names and value labels fade in.
    - **Focus** follows the x. A view's chart can say which keys its focused stop stands for, with a second optional method on `ChartSwitchView`: a line chart's x stands for its points, in series order, then itself. The switch lands on the first of them the new view has, through `focus(key)`, as now, and otherwise on the first mark. So focus goes from an x to its first series' point's column, and from a column back to its point, or its x with `hover: "x"`.
    - **A link** to the switch works as now: the view on show takes part, a line chart by x.
    - api.md's `ChartSwitchView` and architecture.md's "Not fitted yet" say what's fitted now.
11. **`morph` keeps gaps and holes** (decisions 1 and 2).
    - **Between two lines,** the stroke inside a gap of the old line fades in as the morph goes, and the stroke inside a gap of the new line fades out. Each piece is drawn at an opacity of 1 − ((1 − p) · a + p · b), where p is the eased progress, and a and b are 1 inside the old and the new line's gap and 0 outside. So the first and last frames are the lines' own, nothing is drawn inside a gap both lines have, and nothing jumps. The gaps come from `MarkGeometry.gaps`, at the samples' `t`.
    - **Between two closed outlines with holes,** each hole morphs as the outside does. Holes pair by area, largest with largest, each sampled at a quarter of `points` from its upper left, and each point moves in a straight line to its partner. A hole with no partner shrinks to a point at its centre, or grows from one. Holes are written the other way round from the outside, as `describe.shape` writes them, so a hole stays a hole under either fill rule. They come from the outline's `d`: its subpaths other than the longest.
    - A line without gaps, and an outline without holes, morph as now, byte for byte. A closed outline and an open one still crossfade.
    - The contract doesn't change: `morph` reads `gaps` and the outline's `d`.
12. **Change text that keeps clear** (decisions 1 and 5).
    - **`EffectContext.texts?: TextSpace`:** where effects' text sits on this chart or attachment. Every run on one runner shares one space. Unset means no other text is known, as with `nearbyLabels`. The charts' and attachments' runners always give it, and so do the testing entry's contexts (`testContext()`, and `checkEffect` through it). Its methods:
      - `box(content, style)`: the box `content` takes, drawn with `style`, measured as the chart measures its own text (estimated where there's no layout), at the overlay's text size.
      - `held()`: the boxes held by the runs on this runner that started before this one.
      - `hold(box)`: this run's text is at `box` from now on, until it holds another, holds `undefined`, or the run is cleared.
    - **Earlier text keeps its place.** At an update, runs start in the chart's mark order, so the first mark's change keeps its place and the next goes past it. Earlier runs never move for later ones. When marks move, their runs hear it in mark order too, so text placed again keeps the same rule; the step checks that the runner tells them so.
    - **`delta` and `label`** (through `caption`) go 6 px past the farthest held box their way meets, as past `nearbyLabels`, and hold the box where their text ends, risen into place.
    - **Their text's own box.** With `box()`, `captionPlace` moves the text along its way until its own box meets none of the boxes in the way, 6 px clear, rather than checking a 6 px band along the way. So text centred along a slice's ring keeps off a label beside it. Without `texts`, it uses the band, as now.
    - **`room` on `lineChart`:** px the layout keeps clear to the right of the end labels, for text an effect draws past them. Its default, 0, lays out as now. It's checked as `barChart`'s is (a `RangeError` for anything but a number of px, 0 or more), and `update({ room })` lays the chart out again.
    - **The promise.** `texts` and `TextSpace` are additions. The conformance sweep checks every source's text outside every other run's.
13. **More host marks read by tag** (decisions 2 and 7).
    - **A rotated or skewed `<rect>`** is a closed shape, read through `describe.shape` from its outline, with its rounded corners, moved by its matrix, as a `<polygon>` is, instead of throwing. An upright one is a bar, as now. With one among bars, every mark keeps document order, as with a circle or a shape among them.
    - **A slice.** A `<path>` whose data is a ring's slice is read with `describe.arc`. That's one circular arc with two straight sides through its centre (a pie's slice), two arcs about one centre, one each way, joined along radii (a donut's), or a whole ring.
      - Its centre, radii and angles, in `d3.pie()`'s convention, come from the path through its matrix, and the path must match them within 0.5 px.
      - A path with a pad angle, rounded corners or an elliptical arc stays a shape, as now, and so does one under a matrix that doesn't keep circles.
      - Slices round one centre are ordered clockwise from 12 o'clock (`ringOrder`), as with `geometry`.
    - **`vector-effect: non-scaling-stroke`,** as an attribute or a computed style, means the stroke's width is in screen px. It isn't scaled by the element's transform. Where there's layout, it's turned into the marks' common units by the common ancestor's screen scale; where there isn't, as in jsdom, it's kept as given. `watch` follows it, as it follows the width.
    - **The donut page's D3 pie** is read by tag, with no `geometry` (step 7), and its marks are the ones `describe.arc` gave it, within 0.5 px.
14. **A tidier hover on one point** (decisions 2 and 6).
    - **Points drawn on each other.** When the nearest revealed points are within a px of each other, the pointer hovers the one whose line passes nearest it. That's the distance from the pointer to each line's stroke, as drawn, within a dot's radius of the point; a value alone between gaps counts as its dot. Of two as near, the series first in `series` wins, as now. The hover held on the dot (M10 step 7) and touch keep the rule. The keys are as now.
    - **`markLabel`** is called for the stops shown. With `hover: "point"`, the x's names aren't worked out while their columns are hidden, and `update({ hover: "x" })` works them out. So with `"point"`, `markLabel` is called once for each point, with the same arguments as now.
15. **The toolchain and the tests** (decision 2).
    - **tsdown** goes to 0.23.4, pinned exactly. It takes rolldown-plugin-dts 0.28.8, as 0.23.3 does, and rolldown `~1.2.15`. M10 step 5's comparison runs again: the files byte for byte, and, where any differ, each entry's names as an ES module and as CommonJS, each exported name's type read with TypeScript 6's API, and the sizes. A published type or name that differs, or a size that grows by more than 1 KB, stops the step to ask you.
    - **rolldown-plugin-dts 0.29.0** waits for a tsdown that asks for it, and `get-tsconfig` for a stable release: 0.28.8 and 0.29.0 both pin its 5.0.0 beta.
    - **`npm dedupe`** tidies the lockfile (its dry run hoists `magic-string` and `commander`). The build stays the same byte for byte, and `npm ls` reports no problems.
    - **WebKit's wait.** The stress page's date line waits up to 60 s for its readout, from 30, and its test's timeout goes up to match.
    - **The audit's link** to M8 gets GitHub's anchor, ending in a hyphen.
    - **`api-docs.test.ts` stays on TypeScript 6's API** until TypeScript 7.1 is out; then it and `typescript-6` can go.
16. **The rest.**
    - **Accessibility.** A new script, L, for NVDA + Chrome. It covers the morph page's new card: its three views, each switch announced, focus following the week from a line's x to its column and back, and a point's name in the line views. It covers the season page's two changes after a matchweek, with the announcement as now, and the donut page's D3 pie read by tag, its slices in clockwise order with their names as before. You run it.
    - **Docs.** Each step adds its exports to api.md (`src/api-docs.test.ts` fails otherwise), its sections to architecture.md, and its entries to CHANGELOG, under a new `## Unreleased` above 0.5.0 with Added, Changed and Fixed lists. The effects guide says how an effect's text keeps clear of other effects' text with `texts`.
    - **Sizes.**
      - The line page's set has 671 bytes of room, everything 6.0 KB, the switch's set 3.8, and `expressive` and `travel` 2.6.
      - Steps 1, 3 and 5 add to the line page's set. Step 3's space is in every chart's runner and its `room` in the line chart's layout, so it can expect to take that set past its budget.
      - Steps 1 and 2 add to the switch's set, step 4 to `expressive` and `travel`'s, and step 3 to every chart's set and the testing entry. Every step but 6 adds to everything, `dist/index.js`, `dist/index.cjs` and the script-tag bundle.
      - A step that takes a size past its budget raises it in the same PR, to its size plus 10%, and says why (CONTRIBUTING's Bundle size). A step that lands later merges main first and keeps the raised budget.
    - **A step the demos find.** If step 7's pages or audit find a problem in the library, you choose whether it's fixed before 0.6.0. If it is, it's a step of its own, in a session step 7 starts, and the planning session places it in this plan before the release, as M10's step 7 was.
    - **The release** goes as CONTRIBUTING's Releasing says, through trusted publishing. Nothing is published, tagged or released without your go-ahead in that session.

Each step names the files it owns, so steps in the same wave can run in parallel sessions. Files shared by several steps get small edits only, and whichever step lands second merges main first: `package.json`, `src/index.ts`, `src/core/index.ts`, `src/charts/index.ts`, `src/effects/index.ts`, `src/charts/types.ts`, `src/charts/line.ts`, `src/charts/adapter/expressive.ts`, `src/conformance.test.ts`, `src/promise.test.ts`, `scripts/size-budget.json`, `src/core/README.md`, `src/charts/README.md`, `src/effects/README.md`, `docs/architecture.md`, `docs/api.md`, `docs/effects-guide.md`, `docs/sketches/api.ts`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md` and this plan.

- **`line.ts`** has three owners. Step 1 owns what its handle gives the switch (`paintOf` and the keys a focused stop stands for). Step 3 owns `room`: read and checked with the other options, and passed to the layout. Step 5 owns its Hover section's nearest point and the names (`nearestPoint`, `namesFor` and `pointNamesFor`).
- **`expressive.ts`:** step 4 owns its reading, and step 3 the text measure its surface is given, if it needs one.
- **Step 3 alone** changes the contracts, the runner and `caption.ts`; step 2 alone `morph.ts`; step 1 alone `switch.ts`.
- `typecheck` requires an explicit type on every new export. The first step to land adds CHANGELOG's Unreleased.

Each step's session reads the hand-over notes in its notes folder first, `plan-0-6.md` from planning among them, and writes its own there: commits, files, decisions beyond the brief, where the plan and the code differ, and follow-ups.

**Wave 1** (parallel):

1. ✅ **Lines in a switch** (decision 10). Owns `src/charts/switch.ts` (the pairs' colours, marks not drawn at rest, and focus across a switch), the optional methods on `ChartSwitchView`, what the charts' handles give the switch (small edits in `bar.ts`, `donut.ts` and `line.ts`), `src/charts/switch.test.ts`, and `src/line-switch.test.ts` (new: the real charts and `morph()`).
   - Tests:
     - A line chart and columns keyed as its points: each point paired with its column, grown from a dot of no size at its centre; the line fading out over the first half; every pair in its series' colour; and back the same way, with no jump on a switch back.
     - Two line charts of the same series: lines paired by series and morphed, points not played, the end labels moved, and a value alone between gaps drawn as its dot.
     - Colours: each pair, and each mark that fades, in its view's colour; a pair whose colours differ in the new view's; a view without `paintOf` by key; and the morph page's donut and columns, which colour by key, as on main.
     - Focus: from an x to its first series' point's column and back, from a point with `hover: "point"`, and to the first mark when nothing matches. A link through a line view.
     - Motion off, a resize, and a third view landing, as now.
     - With step 2 merged, two lines with gaps through `morph()`: nothing drawn inside a gap both have, on any frame.
   - **Done when** every existing test passes unchanged, but any that pinned a pair's colour by key where its view colours it otherwise, each named in the PR, and a switch between a donut and columns draws as before.
   - Docs: architecture.md (Switching between charts, with "Not fitted yet" gone), api.md (`ChartSwitchView`, `chartSwitch`'s views, and columns keyed as a line's points), README's Charts line, the backlog's line charts as switch views, CHANGELOG (Added).
   - Budgets it may raise: the switch's set, and the line page's set if its part of `line.ts` takes it past its room.
   - **Built** (29 October 2026) as decision 10 describes ([architecture.md](architecture.md#switching-between-charts)):
     - **The methods.** `ChartSwitchView` has an optional `paintOf(key): ChartSwitchPaint | undefined` and `standsFor(key): readonly string[]`. `ChartSwitchPaint` is `{ color, drawn }`, exported from the main entry. The bar chart's handle gives a bar its key with `colorBy: "category"`, and otherwise its first segment's series, as `drawMark` paints it; the donut's gives a slice its key; the line chart's gives a line and its points their series, a point drawn when it has `ec-alone`. The line chart's `standsFor(x)` gives each series' point key at that x, in series order, then the x; any other key stands for itself.
     - **The pairs** (`prepare` in `switch.ts`). Each side's paint comes from its view's `paintOf`, or else its key, drawn. A pair neither side draws is left out. A side that isn't drawn becomes `dot(mark)`: `describe.point` with `r: 0` at the mark's centre, whose outline is `M x,yZ` and whose every sample is the centre, so `morph` grows the partner out of it. Each pair is drawn in its new view's colour, kept by the pair's place in the session's own surface (`surfaceFor`), so a reverse redraws the same colours.
     - **Fades.** A mark with no partner fades in its own view's colour, and one its view doesn't draw doesn't fade at all.
     - **Focus.** The switch remembers the keys the focused stop stands for (`standsFor`, or its own key), read before anything hides, and on landing tries them with `focus(key)`, then each mark's key, until focus is in the new view. A switch landed for a third view hands them on.
     - **Gaps in the overlay.** `mapMark` keeps a mark's `gaps`, at the same t, when it maps a view's marks into the overlay's px: it dropped them, so `morph` would see none once two line views sat at different places or scales. The step 2 session found it.
     - **Tests** (20 new). `src/charts/switch.test.ts` has 17, with the recording effect:
       - A line chart to columns keyed as its points: each pair, a hidden point a dot of no size at its centre and a value alone between gaps its own dot; every pair in goals' colour; the lines fading out over the first half in their colours; xG's points not drawn; and the assignment never asked for a point's key. Back: each column to its point, the lines fading in. The labels fading.
       - Two line charts: only the lines and the values alone between gaps played, in their series' colours, with nothing fading and the end labels moving. Each line's gaps kept with one view drawn at half size.
       - Colours: a donut and columns coloured by series, each pair in the columns' colour both ways through a reverse, and in the slices' on a new switch to the donut; views without `paintOf`, by key; and each chart's `paintOf`, category columns and a stack too.
       - Focus: from an x to its column and back; an x whose first series is missing there, to that series' column; a point with `hover: "point"`, there and back; the first mark when the columns have none of the keys; another line chart; and motion off.
       - A link through the line view by x, before and after a switch; motion off; a resize; and a third view, with focus handed on.
     - `src/line-switch.test.ts` has 3, with `morph()`. Each column grows from its point, half way from the centre (or the lone dot) at half way, with the lines gone. Back, the columns are all but in their points' centres and the lines all but in, one frame before landing, and a switch back mid-way doesn't jump either way. Two line charts start on the first's outlines and end on the second's, the lone dots half way at half way.
     - **No existing test changed.** None pinned a pair's colour by key where its view colours it otherwise: the switch's tests and `src/morph.test.ts` use a donut and category columns, which draw as on main, and `link.test.ts`'s switch with series-coloured columns doesn't check colours. 2,692 tests in 110 files pass.
     - **Sizes** (gzip, in bytes against main `1fdc9e3`): the switch's set 42,557 of 45 KB (372 B more), the line page's set 41,381 of 41 (68 B more, 603 B left), everything 82,257 (314 B), `barChart` 31,540 (43 B), `dist/index.js` 118,311 (377 B), `dist/index.cjs` 116,427 (391 B) and the script-tag bundle 81,917 (308 B). No budget changed.
   - **Decisions beyond the plan:**
     - **The second method is `standsFor(key)`,** given the focused stop's key, which the switch reads from its `data-key` as before. The plan left it unnamed. `paintOf` keeps its name, and its type is `ChartSwitchPaint`.
     - **An x stands for every series' point key there, a missing value's too,** where the plan says "its points". So focus on a week whose first series is missing goes to that series' column when the columns have one (a page may draw a missing week as 0), and otherwise to the next series', the x, or the first mark.
     - **A pair keeps its new view's colour through a reverse,** so a switch back mid-way plays the same picture backwards. A new switch takes its own new view's.
     - **A mark with no partner that its view doesn't draw doesn't fade,** as xG's points going to goals' columns: fading them would draw dots that weren't there. Marks drawn at rest fade as before.
     - **The charts' types don't declare the methods.** `BarChart`, `DonutChart` and `LineChart` are as before; the handles have the methods, typed through a type-only import of `ChartSwitchPaint` in `bar.ts`, `donut.ts` and `line.ts`, and api.md says so under `ChartSwitchView`.
     - **A switch whose views colour by series now draws in their colour,** where it drew each key in its own (the stress page's bars and columns), and it no longer asks the shared assignment for a slot for every key. It's under CHANGELOG's Fixed.
     - **README's Switching line,** beside the Charts line, is the one that says what a switch does, so it's the one changed.
     - **`morph` across gaps** (step 2) hadn't landed when this step finished. Whichever of steps 1 and 2 lands second adds two lines with gaps through `morph()` to `src/line-switch.test.ts`, with nothing drawn inside a gap both have on any frame.
2. ✅ **`morph` keeps gaps and holes** (decision 11). Owns `src/effects/morph.ts`, `src/effects/morph.test.ts`, and `morph`'s sources in `src/conformance.test.ts`.
   - Tests:
     - Two lines with the same gaps and with different ones, and a line with gaps to one without: the first and last frames the lines' own, nothing drawn inside a gap both have, each gap fading in or out, and no jump on any frame (`checkTransition`).
     - Two D3 rings, and a ring to a disc: each hole morphing to its partner, one with no partner shrinking to its centre, and a hole a hole under either fill rule on every frame.
     - Lines without gaps, and outlines without holes, byte for byte as on main.
     - A reverse from part way.
   - **Done when** every existing test passes unchanged.
   - Docs: architecture.md (morph, and Gaps), api.md (`morph`), CHANGELOG (Fixed).
   - Budgets it may raise: the switch's set, which carries `morph`, and everything.
   - **Built** (29 October 2026) as decision 11 describes ([architecture.md](architecture.md#morph)), in `src/effects/morph.ts` alone:
     - **Lines with gaps** (`gapped`). When either line has `gaps`, the samples get a stop at each gap's ends too, at both lines' `path(t)`, with a stop within 1e-9 of a sample's `t` taken as the sample. Each stretch between two stops is inside the old line's gap, the new line's, both or neither, judged at its middle. The stretches of each of the first three kinds are one path, at opacity p, 1 − p or none, and the fourth isn't drawn. The paths go in the order their first stretches come along the walk. At 0 and 1 it's one path, the line's own `d`, so `end()` and the last frame are as before. Two lines without gaps go through `stroke`, as on main.
     - **Holes** (`holesOf` and `holePairs`). An outline's holes are the subpaths of its `d`, read with `parsePath` and `flattenPath`, other than the longest. Each is sampled through `loopOutline([loop]).sample(4 × count)`, every fourth point, so it starts at its upper left and runs clockwise whatever `count` is, then turned to run anticlockwise from there. They pair largest first by the area of those samples. Each pair is written after the outside with `between`, in the same path, so an outline with no holes writes exactly what it did. A hole with no partner (`landing`, `closing`) lands at its centre's place in the other's bounds, or the deepest point of the other's filled area (`depth`, over the other's centre and a 9 × 9 grid) where that place isn't at least a quarter of the hole's size inside it. It closes by the first of a half, a quarter and an eighth of the run at which every point of it stays inside the shape at each eighth of its way (`stays`, by the winding number of the mixed outside and holes), or else by a sixteenth, heading for the point its centre reaches by then.
     - **`at(from, to, p)`** writes a moved point for path data. `between` and the gaps' runs share it, and `between` writes what it did.
     - **Tests** (22 new; with step 1 merged, 2,714 in 110 files pass, every existing test unchanged). `src/effects/morph.test.ts` (14):
       - Holes (7): two D3 rings, each hole to its partner point by point, written anticlockwise from its upper left; a ring to a disc, the hole closing by half way, half way from the ring's centre to the disc's, gone from there on, and the run back retracing it; a ring to three quarters of it, the hole closing sooner than half way and landing inside the slice, not in its bounds' middle; a square with two holes, the smaller written first, to one with one hole, the larger paired and the smaller closing toward its place in the other square; a quarter of `points` (12 gives 12 and 3); on every frame of a full run, both ways, on all four pairs, each hole's winding number 0 where the shape without it is ±1, so a hole is a hole under either fill rule, inside the shape; and `checkTransition` with each `align`.
       - Gaps (5), on four pairs: the same gap at the same `t` (a line and the same smaller), gaps that overlap, gaps apart, and a line with a gap and one without. Each line's own stroke on the first and last frames, as `end()` draws it. Nothing inside a gap both have on any frame (`drawnInGaps` on the line part way, each `t`'s point mixed), where main's one stroke ran through it. Each piece's ends and opacity part way: apart, overlapping, and to and from a line without gaps. No jump: at p = 0.0001 and 0.9999, what's drawn at more than half strength is that end's line, every point of it where it has data; between frames, each point moves no further than p's step times the farthest any point goes, and each opacity no more than p's step. And `checkTransition`.
       - A reverse from part way (1): on the gap and hole pairs, both ways and with each `align`, a run back from 1 − p after 1, 7, 19, 40 and 58 frames begins with the picture the run forward had.
       - Byte for byte (1): a digest of every call on the layer, frame by frame, on 11 pairs with no gap or hole (the fixture pairs, a slice and a line, a point and a column, a pie slice and a column, a shape with Béziers and an arc and a bar, a curve and a line, a stack and a short bar), both ways, as given, dropped and at 12 points, from 0 and from 0.37, and `end()`'s, against the digests the same function gave on main (`1fdc9e3`). The paint's numbers are rounded to 1e-9 first, as path data is to 0.001: a crossfade's opacity is the eased progress itself, and the last bits of `Math.pow` and `Math.cbrt` differ between Node 22 and Node 24, which CI's Node 22 job found.
     - `src/conformance.test.ts` (7): `checkTransition` between two D3 rings and from a ring to a D3 scatter's dot, with each `align`; `checkTransition` on four pairs of real lines with gaps (the line chart's two lines missing different weeks, one of them and the full season, a D3 line and itself smaller, and the line chart's line and a D3 curve missing the same week); and on each of those, both ways, nothing drawn inside a gap both have on any frame.
     - `src/line-switch.test.ts` (1), since step 1 landed first ([#121](https://github.com/Deaversbp/expressive-charts/pull/121)): the real switch between the per-match and season-to-date line charts, with `morph()`, both ways. On every 16 ms frame, nothing is drawn inside a gap both lines have (`drawnInGaps` on the line part way), and the parts of a gap only one line has fade.
     - **Against main's `morph`,** 13 of them fail: the holes' six checks of their own, the gaps' three, the conformance gap check on the three pairs that share a gap, and the switch's. The rest pass there, as they should: main drew the lines' own strokes at the ends and retraced, the transition checks don't look for holes or gaps, the digests are main's, and a line and the full season share no gap.
     - **Sizes** (gzip; with step 1 merged, against main `492d4dc` measured on the same machine, in brackets): the switch's set 44.3 KB of 45 (41.6), everything 81.8 of 86 (80.3), `dist/index.js` 117.7 of 123.5 (115.5), `dist/index.cjs` 115.8 of 124 (113.7), the script-tag bundle 81.4 of 88 (80.0); the rest as on main. No budget raised. Of the switch's 2.7 KB, 2.1 is reading and flattening path data (`flattenPath`) and `loopOutline`, which it didn't carry before, and 0.6 where a hole with no partner lands and closes; it has 0.7 KB left.
   - **Decisions beyond the plan:**
     - **A hole with no partner closes inside the shape, with it.** The plan had it shrink to its centre where it was, over the whole run.
       - That leaves a shape that moves: a square with two holes going to one with one, 300 px to the right, had its smaller hole outside the square a seventh of the way through, drawn filled. So its centre heads for its place in the other mark's bounds.
       - That place can be outside the other shape (Codex on #122): a ring to three quarters of it, whose bounds' middle is the ring's, drew the closing hole as a filled island 0.9 of the way. So where the place isn't well inside, it lands on the deepest point of the other shape.
       - And a shape part way between two can be far from both: on the same pair, a hole heading straight for the slice was outside the shape between them at 0.6, and one closing by half way at 0.47. So it closes by half way, as a line with no partner fades in a switch, or sooner where some point of it would leave the shape, checked when the run starts.
       - Each point still moves in a straight line, and a run back retraces. Mid-way shapes that a hole can't follow are why a check, not a rule, decides when it closes.
     - **A gap's ends are stops of their own,** at the lines' `path(t)`, rather than the nearest samples, so a piece ends where the line's own stroke does, and the first frame after the start doesn't jump.
     - **Gaps meet by `t`,** as the plan says and the samples do. Two lines missing the same value have their gaps at about the same `t`, not exactly, so the part inside one and not the other fades.
     - **One path a kind,** three at most, rather than one a piece.
     - **The outside is the longest subpath, of two within 0.1% (or 0.01 px) the first,** since `describe.shape` writes the longest first and path data is rounded to 0.001 px. Taking the other would write the outside again as a hole.
     - **A hole's samples are every fourth of `4 × count`,** since `loopOutline` takes only multiples of 4, and a quarter of `points` needn't be one.
     - **Where the plan and the code differ:** the chart switch dropped `gaps`. `mapMark` in `src/charts/switch.ts` (step 1's file) built the moved mark without them whenever two views aren't at the same place and scale, so `morph` in a switch saw none. Step 1 keeps them there now, with a test that fails without them (`2703081`, in #121): `t` doesn't change under a move that keeps angles. Holes need nothing: they come from `outline.d`, which `mapMark` moves.
     - **A known limit:** a shape whose hole runs the same way as its outside is filled there under nonzero, the overlay's rule, at the ends, where the outline's own `d` is drawn, but a hole part way. D3's rings, and every shape `describe.shape` reads from d3-shape, write holes the other way round, so none of the tests' or demos' shapes does this.
3. ✅ **Change text that keeps clear** (decision 12). Owns `texts` and `TextSpace` in `src/core/contracts/effect.ts`, one space per runner in `src/core/runner.ts`, the testing entry's contexts (`src/core/testing/context.ts`), the surfaces' text measure in `src/charts/render/surface.ts`, `src/effects/caption.ts` (with `delta.ts` and `label.ts` as they need), `room` on `LineChartOptions` (`src/charts/types.ts`), read and checked in `line.ts` and laid out in `src/charts/line-layout.ts`, and their tests.
   - Tests:
     - The space: `box` as the chart measures text, and estimated in jsdom; `held` giving the boxes of runs started before, not after; `hold` replacing and letting go; boxes let go when a run is cleared, ended or swapped; and one space a runner, so two charts' text doesn't count against each other.
     - `captionPlace`: past a held box along a heading and out from a centre; the text's own box against each box in the way; centred text along a ring off a label beside it; and without `texts`, as now.
     - On real marks (`src/captions.test.ts`): two lines ending close together, each with `delta`, the second past the first's text and both past both end labels, at 320 px and wide, through a change and a resize. The season page's goals and xG lines, with `room`, inside the chart at 320 and 1,000 px. On 1,500 random donuts, as M10 step 3's probe ran, no slice with its label dropped puts its text on another's label (63 of 592 on main).
     - `room`: the plot narrower by it, with the end labels beside the plot as now; `update({ room })`; the `RangeError`; and 0 laying out as main does, byte for byte.
     - The sweep: every source's text outside every other run's.
   - **Done when** every existing test passes unchanged, but any that pinned a caption's place where its own box now meets a box the band missed, each named in the PR.
   - Docs: architecture.md (Change labels, the effect context, the line chart's layout), api.md (`texts`, `TextSpace`, `room`), the effects guide (keeping text clear of other effects' text), the sketch, CHANGELOG (`texts` and `room` under Added, the text's place under Fixed).
   - Budgets it may raise: the line page's set (likely: 671 bytes of room), and every chart's set, the testing entry, everything, `dist/index.js`, `dist/index.cjs` and the script-tag bundle if they go past.
   - **Built** (29 October 2026) as decision 12 describes ([architecture.md](architecture.md#where-effects-text-sits)):
     - **The space.** `EffectContext.texts?: TextSpace`, with `box(content, style)`, `held()` and `hold(box)`, exported from the main entry and under the promise. `createRunner` keeps one space a runner: each run's box and when it was placed, `held()` the boxes of live runs with a lower start order. `clearRun` lets go of a run's box, so a leave, a re-trigger, the next update, motion turning off (the old run cleared, its `end()` in its place holding its own), a swap, an exit and destroy all do. A finished run keeps its box.
     - **Measuring.** `RunnerSurface.box?(content, style)`; without it the runner estimates (`estimatedBox`, 0.6 em a character). `svgSurface` boxes text with `textBox` and the chart's own measure (bar, donut and line pass theirs, one word each), or one measuring in the overlay (`expressive()`, unchanged). The box's shape (0.16 em at the sides, 1.05 em above the baseline, 0.25 below) moved from `render/text.ts` to `src/core/text-box.ts`, so the charts' labels and the core's estimate share it; `textBox` gives the same boxes as before.
     - **The order.** `change()` tells a mark's runs in start order (it told them in the slots' map order, which a run replaced in its place breaks). A chart tells marks in its own order, but a run's start order needn't be its mark's, and a mark that didn't move isn't told, so `hold()` notes a box that moved and a microtask (`flush`) tells again, in start order, each run placed before text held before it moved or went.
     - **The testing entry.** `testContext()` gives `texts`, estimating boxes, with `held` in its options and `texts.holding` for what the run holds; `clear()` lets go. `checkEffect` gets it through `testContext()`.
     - **`caption.ts`.** `captionPlace(mark, text?)`. Without `text`, as before. With it: the way and the mark's own labels as before (10 px past the end, or 6 px past the farthest own label the way meets, or out from the centre), then on along the way until the text's own box (`text.box`) is clear of every box: its own labels, `nearbyLabels` and `held`. It meets a box from where its box comes within 6 px of it; it leaves one the way meets 6 px past it along the way (as before) or where its box is clear of it, if further, and one the way misses where its box is 6 px clear. `caption()` passes `ctx.texts`, and holds the box where its text ends, risen into place, on every draw, or `undefined` for no text. `delta.ts` and `label.ts` are unchanged.
     - **`room`** on `LineChartOptions`, checked in `line.ts`'s `layout()` with `barChart`'s `RangeError` and passed to `layoutLines`, which adds it to the right margin past the end labels (or the lines' ends with `labels: false`). 0 lays out as before.
     - **Tests** (48 new): `runner.test.ts` 7 (the box measured and estimated, `held` before not after, `hold` replacing and letting go, letting go when cleared, ended or swapped and keeping it once finished, one space a runner, a mark's runs told in start order, and text told again once the chart is done, in start order, when text before it moved or went, but not when it didn't, and never an earlier run for a later one); `testing/context.test.ts` 1; `caption.test.ts` 7 (past a held box along a heading and out from a centre, a box beside the way met by the text's own box, a box the way leaves through its top while the text hangs on it, a box only met further along not passed, centred text along a ring off a label beside it, and the fixtures and bars as without `texts`); `captions.test.ts` 7 (two lines' changes at 320 and 1,000 px through a change and a resize; the season page's two changes with `room: 60` at 320 and 1,000 px; 1,500 random donuts in three tests); `line-layout.test.ts` 1 and `line.test.ts` 1 (`room`); `conformance.test.ts` 24 (each source's text outside every other run's, holding where it is). Each of the new real-mark and sweep tests fails with `caption` ignoring `texts`.
     - **Tests changed** (named in the PR): `captions.test.ts`'s "puts a line's change past its end label…" now has the `delta` past the `label`'s text, which it sat on ("puts a line's label past its end label, its change past that label's text…"); and "keeps a slice's change clear of its neighbours' labels…", whose Woodwork text went past Goal's share by the band, now goes past Goal's name, which the band missed and its box meets (renamed "…clear of the other slices' labels, and one whose label is dropped past the labels its text meets along the ring"), with every other label as its `nearbyLabels`. `charts/label-bounds.test.ts`'s donut tests: "gives each slice its neighbours' labels…" and "passes over a slice whose label is dropped…" now give every other slice's labels, and the two-slice test is renamed. 2,740 tests in 110 files pass, with step 1 merged.
     - **Measured** (jsdom's estimate). On 1,500 random donuts with a 6-character change on every slice (2 to 9 slices of 1 to 100, 240 to 800 px), main put 61 of the 963 slices whose label was dropped on another slice's label (M10 step 3's probe: 63 of 592) and 275 changes on another's change; now none, and a dropped slice's text is nearer its slice (half within 13 px of its end, from 19; 95% within 103, from 135). The season page's two changes meet in none of the 9 matchweeks where both change, at 320 or 1,000 px. With them side by side past the end labels, they need `room: 60` at 1,000 px (20 at 320) to stay inside the chart's width.
     - **Sizes** (gzip, in bytes, against main `492d4dc` with step 1): the line page's set 41,848 of 41 KB (467 B more, 136 B left), everything 82,974 (717 B), the switch's set 42,824 (267 B), `barChart` 31,915 (375 B), `expressive` and `travel` 32,729 (619 B), `dist/testing.js` 24,050 (744 B), `dist/index.js` 119,360 (1,049 B, comments included), `dist/index.cjs` 117,390 (963 B) and the script-tag bundle 82,599 (682 B). No budget changed; step 5's 396 B will take the line page's set past its budget, so whichever of steps 3 and 5 lands second raises it.
   - **Decisions beyond the plan:**
     - **The names** are the plan's: `texts`, `TextSpace`, `box`, `held` and `hold`. The testing entry's additions, `held` on `TestContextOptions` and `texts.holding` on `TestContext` (typed `TextSpace & { readonly holding: Rect | undefined }`, so no new name joins the promise), aren't in the plan.
     - **Passing the mark's own labels as before, then moving on until the text's own box is clear**, rather than replacing the band. Text that kept clear before stays where it was, and only the tests that pinned text on another's text, or by a box the band missed, changed. A box the way meets is left 6 px past it along the way as before, or where the text's box is clear of it if further (the line leaving it through its top, the text's foot still on it); one the way misses, where the text's box is 6 px clear.
     - **A box the text would only meet further along isn't passed.** "6 px past the farthest held box their way meets" would send text past one met far along, and the text's own box meets far more of them than the band did: on the donuts, a dropped slice's text went a median 76 px from its slice, from 19, past labels it wasn't near. Now it's 13. The mark's own labels are still passed wherever the way meets them, as they pick the way. Without `texts`, as before.
     - **A slice's `nearbyLabels` are every other slice's labels** (M10 decision 11 gave the nearest each way round). With the nearest alone, 9 of the 963 dropped slices still put their text on a label two or more slices round, which they didn't know. Every label takes it to 0, with the text as near its slice. It's in `donut-layout.ts`'s `placeSlices` (smaller than before) and CHANGELOG's Changed; architecture.md, api.md and the guide say so.
     - **The runner tells a mark's runs in start order, and tells a run again once the chart is done** (the smallest fix the brief asked for). The charts tell marks in their order (bars and slices in visual order, then those leaving; lines in series order, then points by x), and `update()` starts runs in the order given, so within one slot the start order is the mark order. But a decoration started at enter and a change started at the update cross, `expressive()` tells changed marks before the rest, and a mark that didn't move isn't told, so a microtask places again each run placed before earlier text moved. `onChange`'s doc says so: it's called when text held before the run's moved, too. CHANGELOG's Changed.
     - **The season page's text above the chart.** A line that ends at the top of its plot heading up puts its change above the top, which `room` (to the right, as decided) doesn't keep clear: there, the goals change alone rose up to 11.7 px above the chart at 320 px on main, and with xG's past it, up to 31 (17 at 1,000). The test checks the chart's width, and pins the rise. Step 7's page needs room above the chart for it, or a later step room above the plot.
     - **`delta.ts` and `label.ts` needed no change:** both draw through `caption()`, which reads `ctx.texts`.
4. ✅ **More host marks read by tag** (decision 13). Owns reading in `src/charts/adapter/expressive.ts` (`rectPiece`, `shapeMark`, and a slice reader, which may be a new file), `strokeWidthOf` in `src/charts/adapter/host-style.ts`, `src/charts/adapter/space.ts` as it needs, `src/charts/adapter/expressive.test.ts`, `src/d3-pie.test.ts`, and the new sources in `src/conformance.test.ts`.
   - Tests:
     - A rotated and a skewed `<rect>`, rounded too, each read as the shape `describe.shape` gives its outline moved; among bars, document order.
     - A D3 pie and a D3 donut read by tag: each slice the mark `describe.arc` gives, within 0.5 px, in clockwise order, sorted by value too; a whole ring; and a pie in a rotated or scaled group.
     - Paths with a pad angle, rounded corners, an elliptical arc or a non-uniform scale read as shapes, as on main.
     - `vector-effect: non-scaling-stroke` on a scaled line and path, by attribute and by style, with `watch`.
     - Every effect through the sweep on the pie read by tag and on the rotated rects.
   - **Done when** every existing test passes unchanged, but any that pinned the throw on a rotated `<rect>`, or a pie's slice read by tag as a shape, each named in the PR.
   - Docs: architecture.md (Adapters: shapes, slices by tag, stroke widths), api.md (`expressive()`), README's Adapters line, CHANGELOG (the `<rect>` under Added, the slices under Changed, the stroke under Fixed).
   - Budgets it may raise: `expressive` and `travel`'s set (2.6 KB of room), and everything.
   - **Built** (29 October 2026) as decision 13 describes ([architecture.md](architecture.md#adapters)):
     - **Turned rects** (`src/charts/adapter/expressive.ts`). A `<rect>` of its own whose matrix isn't upright (`turned`, by `axisAligned`) goes to `shapeMark`, which reads it through `describe.shape` from `shapeOutline`'s outline, rounded corners too, moved by its matrix, as a `<polygon>`. Rects that share a key go to `rectPiece`, which still throws a `TypeError` on one that's turned, now saying that a rect turned on its own is a shape. With one among bars, every mark keeps document order, as with a circle or a shape.
     - **Slices** (`src/charts/adapter/slice.ts`, new). `sliceOf(commands, matrix)` reads a path's commands in its own coordinates, flattened by `flattenPath`, with arcs one after another on one circle the same way round joined into runs, across the path's start too. A pie's slice is an arc, then sides to its centre and back; a donut's an arc, a side, an arc back and a side; a whole ring two subpaths, each a whole circle, one each way. The centre comes from the points the path is written through: a pie's is where its sides meet, a donut's the outer radius on from each side's outer end along it, averaged, and a whole ring's halfway between the points its outer circle's half turns are written between, or through three of them (`centerOf`), or else its first arc's own centre, for a circle in two arcs that aren't half turns. A donut's slice whose inner arc rounds away to a point has a pie's form, and is read as a donut's by where that point is. It's checked within 0.5 px (the corners, the arcs' radii, each arc at its ends and middle, and how far each arc turns about the centre, `turnOf`), then moved through the matrix, which must keep circles (`keepsCircles`), into `describe.arc`'s spec in `d3.pie()`'s convention, a flip turning it the other way round. The centre and radii are rounded to 0.001 px, as a circle's are. `shapeMark` tries a `<path>` as a slice before reading it as a shape.
     - **Non-scaling strokes** (`src/charts/adapter/host-style.ts`). `strokeWidthOf` gives a `StrokeWidth`, `{ width, screen }`. `screen` is `vector-effect: non-scaling-stroke`: a browser's computed value, or in jsdom a computed `none` giving way to the element's own attribute, unless an inline style sets it. `widthOf` in `expressive.ts` divides a screen width by the common ancestor's screen scale where it has a CTM, and keeps it where it hasn't. A part keeps the whole `StrokeWidth`, so `watch` keeps it.
     - **`watch`.** `follow` reads a non-scaling stroke's mark again when the common ancestor moves, and it follows if its width changed. `reread` reads a bar of one rect that turns in a frame as a shape, and finds the other bars' baseline without it (`edgesNow` is given the frame's shapes). A turned rect stays a shape through frames that bring it upright, until `refresh()`.
     - **Lengths.** `attributesOf` (`space.ts`) gives null for an attribute that isn't there, where a browser's `baseVal` gives 0, so a turned rect's missing `rx` takes its `ry`, as SVG does.
     - **Tests** (85 new; none changed):
       - `src/charts/adapter/expressive.test.ts` (14): turned, skewed and rounded rects (`ry` alone, and `rx` capped at half the side), each the shape `describe.shape` gives its outline moved; a turned rect among bars in document order, the arrow keys following it; a turned rect that shares its key throwing; a rect read again on `refresh()` as it turns and comes back, an update each way; slices from hand-written paths (a pie's, a donut's, from the centre, from the inner arc, anticlockwise, three quarters in relative commands, and a whole ring), turned, scaled and flipped, and ordered clockwise round one centre; a disc, a lens, a padded slice, rounded corners, an elliptical arc, an open slice, two rings one way, and slices stretched or skewed, each the shape `describe.shape` gives, as on main; a non-scaling stroke by attribute and by style, `none` inline over the attribute, on a group (not inherited), a browser's computed value from a style sheet, and through a common ancestor's screen scale; and with `watch`, a bar turning in a frame, a non-scaling stroke through a frame that scales it, and one read again when the common ancestor's screen scale changes, but not when it only moves.
       - `src/d3-pie.test.ts` (11), on real D3, read by tag with only a key: a donut's slices the marks `describe.arc` gives within 0.5 px, clockwise, sorted by value and in data order; the ring's order kept with a sliver whose inner arc rounds away, and with a slice of half the ring from 72°; a pie's, and a padded pie's as slices of the padded angles; a whole ring, and a disc as a circle; slices in groups turned 30° and scaled 1.5 times, through a browser's CTMs rounded to single precision too; small multiples turned, scaled and flipped, and one stretched as shapes; a padded donut and rounded corners as shapes; the donut page's pie at 640 and 320 px, sorted either way, before and after a match, as its `geometry` gives it; keyboard order, the focus ring and `travel` round a slice; and a D3 transition followed with `watch`, every frame's slices, with no events.
       - `src/charts/adapter/slice.test.ts` (9, new): a slice of one shot in ten thousand, its centre within 0.01 px; an arc split in two, and a path starting part way along it; padded slices at 0.01 rad (slices) and 0.04 (none); a donut's sliver whose inner arc rounds to a point, and a pie's; whole rings and half turns from 212 starts round the circle; a whole ring in two unequal arcs, and in three; a turn, a scale and a flip, and nothing through a stretch or a skew; paths that aren't slices; and `d3.pie()`'s angles.
       - `src/charts/adapter/space.test.ts` (1): `attributesOf` gives null for a missing `rx`.
       - `src/conformance.test.ts` (50): three sources read by tag through the sweep (48), the D3 donut, a D3 pie and turned rects with a bar among them, and 2 tests: the donut read by tag is the `geometry` source's marks within 0.5 px, in the same order, and the rects are closed shapes, with the bar still a bar.
       - **No test changed.** The two that pinned the throw on a turned `<rect>` (`expressive.test.ts`'s "reads quarter turns, and refuses rects that are rotated or skewed", and `watch`'s "reports a mark it can't read in a frame and changes nothing") turn a stack's series, whose rects share their keys, so they still throw, and the message keeps their words. No test read a pie's slice by tag.
       - With step 1 merged, 2,775 tests in 111 files pass (2,692 in 110 on main `492d4dc`). With steps 2 and 3 merged too (main `6b356c2`), 2,850 pass, step 3's sweep check on this step's three sources among them.
     - **Checked in a browser** (the donut page in the app's Chromium, at its width there): the page's D3 pie read by tag is its `geometry` marks within 0.0012 px, in the same order; a pie in groups turned and scaled, through the browser's own CTMs, within 0.0015 px, clockwise; and a 3 px non-scaling stroke on an `<svg>` drawn at half size, 6 units.
     - **Sizes** (gzip, in bytes from the size check's own bundling, with step 1 merged, against main `492d4dc`): `expressive` and `travel` 34,028 (33.2 KB of 34), from 32,110 (31.4), +1,918. About 230 of it is `describeArc`, which the adapter now carries, and the rest the reading, most of it `slice.ts`. Everything 84,024 (82.1 of 86), from 82,269; the script-tag bundle 83,673, from 81,928; `dist/index.js` 120,781, from 118,323; `dist/index.cjs` 118,846, from 116,438; `dist/testing.js` 23,316, from 23,306. `barChart`, the line page's set, the switch's set, and `describe` and `matrix` are byte for byte the same. No budget raised: 788 bytes were left in `expressive` and `travel`'s, which step 3's text space, in every runner, adds to as well. With steps 2 and 3 merged (main `6b356c2`), `expressive` and `travel` is 34,729 (33.9 KB of 34, 87 bytes left) and everything 86,281 (84.3 of 86), with Codex's two fixes, and every budget holds.
   - **Decisions beyond the plan:**
     - **A turned rect that shares its key throws, as before.** It would be a shape, a mark of its own, and a shape that shares a key throws; a bar's segments are upright. So the two tests that pinned the throw, on a stack's turned series, pass unchanged.
     - **A disc isn't a slice.** One whole circle alone, which `d3.arc()` draws for a pie of one value, stays a circle, a closed shape, as on main: "a whole ring" is two circles. A lone circle drawn as a path (`d3.symbol()`'s) is more often a dot than a pie.
     - **A pad angle goes by the 0.5 px.** The plan says a path with a pad angle stays a shape, and that the path must match the slice within 0.5 px; the code follows the 0.5 px. A donut's padded sides are off radii by about its inner radius times the difference between the inner and outer arcs' padding: at the page's sizes, 0.01 rad reads as slices, 0.04 as shapes, and near 0.02 one donut can have both. A pie's padded slice has its sides through its centre, since `d3.arc()` pads only its arc, so it's a slice of the padded angles: nothing in its path tells it apart.
     - **Read in the path's own coordinates, then moved.** A browser's CTMs are single precision, so a turned group's arcs, moved first, are ellipses by parts in 10⁸, which `flattenPath`, at 1e-9, would make straight pieces.
     - **The centre from the points written, never an arc's own** (two bugs the review found, fixed before the PR). An arc's own centre, from its ends and its radius, is off by its ends' rounding times its radius over its length, so a slice of one in ten thousand, with arcs 0.07 px long, would be a px off; and for a half turn, whose ends are as far apart as its radius allows, `d3.arc()`'s 3 decimals put it up to a third of a px out. At first a whole ring took its outer circle's own centre, and joined arcs and checked their turns by their own centres and sweeps, so 242 of 360 whole rings and 184 of 720 half-turn slices, each started 1° on from the last, were shapes; now none is. And a donut's sliver whose inner arc rounded to a point was read as a pie's slice about that point, which put the ring in document order; now it's a donut's.
     - **A slice of no angle is a shape.** `d3.arc()` draws one as a line there and back, with no arc, so nothing in it says which end is the centre, and a pie with a zero value keeps document order.
     - **At most 32 commands, and no Béziers,** before a path is flattened to find out whether it's a slice, so a long D3 curve read by tag isn't flattened twice, on every frame with `watch`.
     - **A bar that turns in a frame** is read as a shape, as a full read would, rather than throwing; a turned rect that comes upright in a frame stays a shape until `refresh()`, since a bar's baseline is found among every bar.
     - **The stroke width is kept for a slice too,** since in a later frame its path may be another shape.
     - **Codex's review on PR #126** found two more, fixed in it: with `watch`, a frame that changed the common ancestor's screen scale left a non-scaling stroke's width as it was, and a whole ring whose circles are each written in two unequal arcs was a shape.
     - **Docs beyond the step's list,** each a line or two: the `geometry` option's words in `types.ts`, `src/charts/README.md`'s adapter row, and the conformance test's list of sources.
5. **A tidier hover on one point** (decision 14). Owns the line chart's Hover section in `src/charts/line.ts` (its nearest point and the names: `nearestPoint`, `namesFor` and `pointNamesFor`) and `src/charts/line-hover.test.ts`.
   - Tests: two points at one place (goals equal to xG), the pointer just off it along each line hovering that line's point, and at the centre the first series, with the hover held on the dot and by touch; three lines through one point; a value alone between gaps where another line passes; `markLabel` called once for each point with `"point"` and once for each x with `"x"`; and `update({ hover })` both ways naming every stop.
   - **Done when** every existing test passes unchanged, but any that counted `markLabel`'s calls with `"point"`, each named in the PR.
   - Docs: architecture.md (Line chart: the hover on one point), api.md (`hover`, `markLabel`), CHANGELOG (the points under Fixed, `markLabel`'s calls under Changed).
   - Budgets it may raise: the line page's set.
6. **The toolchain and the tests** (decision 15). Owns tsdown's version in `package.json` and the lockfile, the wait in `tests/visual/stress.spec.ts`, the link to M8 in `docs/a11y-audit.md`, and CONTRIBUTING's toolchain lines.
   - Checks: the comparison of tsdown 0.23.4's build with main's; `npm ls rolldown-plugin-dts` naming 0.28.8; `npm dedupe`, with the build the same; `typecheck`; the suite; `pack-check` on 5.4, 6 and 7; `build:site`; the stress page in WebKit, in Docker with 4 workers; and CI on Node 22 and 24.
   - **Done when** `npm run typecheck && npm test && npm run build`, `npm run size` and `npm run pack-check` pass, the build is the same, and the audit's link reaches M8.
   - Docs: CONTRIBUTING (tsdown's version), and CHANGELOG only if what's published changes.

**Wave 2** (after steps 1 to 5 land):

7. **The demos, their screenshots, the audit and script L.** Owns `demo/morph.*`, `demo/season.*`, `demo/donut.*` and `demo/d3-pie.ts`, their visual specs and baselines, README's GIFs if they differ, `docs/a11y-audit.md` (but step 6's link), and section L of `docs/a11y-check.md`.
   - **The morph page:** a second card, a season's goals and xG with missing weeks, in a switch of three views. A group of three toggle buttons with a visible label picks them, as the line page's toggles do: Per match and Season to date as `lineChart`s, and Per match as goals' columns, keyed as its points. `announce: true`. Design notes say why the points grow into columns while the line fades, and what the gaps do through a morph.
   - **The season page:** xG's line gets `delta()` again, beside the goals line's, with `room`, each clear of the other and of every label at 1,000 and 320 px. The announcement is as now.
   - **The donut page:** its D3 pie is read by tag, with no `geometry`, and its effects work as before. Its design note says so.
   - **README's GIFs** are compared with their pages, and made again if they differ.
   - **Screenshots,** made in Docker: the new card in each view, and half way from a line to columns and between the two lines; the season page after a matchweek with both changes; and every page whose picture changed. Reduced motion and Off are checked in the DOM.
   - **Script L,** for NVDA + Chrome (decision 16). You run it.
   - **The walk:** you look at the pages in the browser, at 320 px too.
   - In two PRs, as M10 step 6: the pages, their tests and baselines, the audit and script L first; then script L's results and the walk.
   - Docs: a11y-audit.md (the morph page's new card, the season page's rows, the donut page's pie, the Browsers count), a11y-check.md (section L and its results), CONTRIBUTING's visual tests.

**Wave 3:**

8. **Publish 0.6.0** (decision 3). Owns the version (`package.json`, the lockfile, `VERSION`), CHANGELOG's 0.6.0 entry, README's status, its script tag (`@0.6`, and api.md's) and its sizes, architecture.md's sizes, measured again on 0.6.0's code, and this plan's status line and M11's ✅.
   - **The dry run:** `typecheck`, `test`, `build`, the size check, `pack-check`, `npm pack` (its list and sizes shown to you, compared with 0.5.0's) and `npm publish --dry-run`. The PR has their results.
   - **Before the go-ahead,** you check that the trusted publisher is still on npmjs.com.
   - **Then, on your go-ahead in that session:** the `v0.6.0` release is created, and the workflow publishes it with provenance, through trusted publishing.
   - **After:** check npm (the version, README, provenance), install 0.6.0 in a fresh project and load each entry as an ES module and as CommonJS, and check jsDelivr's `@0.6`.

**Done when:**
- **Lines in a switch.** A line chart is a chart switch's view. Its points grow into columns keyed as they are, and back; two line charts' lines morph with their gaps kept; each mark is drawn in its view's colour; and focus follows the x. A switch between a donut and columns draws as before.
- **`morph`** keeps a line's gaps and a shape's holes on every frame.
- **Changes keep clear.** `delta` and `label` keep off other effects' text through `EffectContext.texts`, and a slice's text keeps off its neighbours' labels with its own dropped. `lineChart` has `room`.
- **Host marks.** `expressive()` reads a rotated `<rect>` as a shape, a pie's paths as slices in clockwise order, and a non-scaling stroke's width.
- **The point hover.** A point drawn on another can be hovered by the pointer, and `markLabel` is called once a stop.
- **The build.** tsdown 0.23.4 builds the same published types, the lockfile is deduped, and WebKit's stress-page check holds up under load.
- **The demos** show all of it, with their screenshots and the audit, and script L passed with NVDA + Chrome.
- **Docs.** api.md, architecture.md, the effects guide, README and CHANGELOG cover every addition and change. The promise changes only by `texts`, an addition.
- **0.6.0 is on npm,** published through trusted publishing with provenance, with its CHANGELOG entry and its release on GitHub. This plan's status line says M11 is done.

### Backlog (after 0.1)

These came out of [ideas/effects-by-chart.md](ideas/effects-by-chart.md), a brainstorm across BI chart types (bar to map, plus radar and comparison charts). The items after the line chart extras were left by M4 and M5, or deferred in M6 planning.

- **Linked hover.** *Built in M7 step 4*, as `link(sources, { by, effects })` (M7 decisions 3 and 13). Hovering a mark fires a hover for the marks in linked charts or series that share its *linking value*, and their ordinary effects run. It's needed for combo charts (column and line point together), butterflies (both halves), small multiples, and radar axes.
  - It isn't an effect. Effects only touch their own mark; linking touches other marks, so it lives with the charts and adapters, like hover dimming.
  - It links by a shared value, not by key. Keys are identities and differ across marks on purpose: a line point is `goals@12`, a column is `12`. By default, link by each mark's position on the category or x axis (`at`). Allow an accessor per source for anything else, for example `link([columns, line], { by: (event) => event.data.datum.month })`.
  - It does across charts what the line chart's crosshair does inside one: there, an x stands for every series' point. The line chart has no `pointer: "x"` option; the crosshair is how every line chart hovers.
  - Linked marks get `source: "linked"` on their hover event (M7 decision 3). Effects can't tell a linked hover from any other, so the effect contract doesn't change; `effects: false` keeps a link's marks to emphasis and dimming instead.
- **A chart switch in a link** (M7 decision 13). *Built in M9 step 2*, as `link()` taking a switch through its view on show, with `on()`, `marks()` and `leave()` on the switch (M9 decision 10). `link()` threw on a `chartSwitch`. Its views' charts (`switch.chart(view)`) could each be linked, but the hidden view would hover unseen, and a switch needed to hand its link from view to view as it switched.
- **`trace` as a built-in.** *Built in M7 step 2*, as a highlighter (M7 decisions 5 and 9). It draws a mark's path in. It's a custom effect in the sketch now, and the brainstorm uses it on slopes, waterfalls, annotations, sparklines and scatter trails.
- **Drawing a mark itself in** (M7 decision 5). A faint copy of the mark, then the mark drawn along its walk at its own width and colour. `trace` stays a highlighter: in the hover slot this would hide data, and a stack would draw in one colour.
- **Change labels as built-ins, in two kinds:** *Built in M7 step 1*, as `delta` and `label`, with `labelBounds` so their text keeps clear of the marks' own labels (M7 decisions 4 and 10–12).
  - `delta`: the change since the last update, as in the sketch's custom effect. For tables, live KPIs and "Play next matchweek".
  - `label((data) => text)`: text computed from the mark's own data, such as last sample minus first (slopes) or a step's own signed value (waterfalls).
  - Comparisons between neighbouring marks (funnel conversion) are computed into the rows by the chart or the page, because effects only see their own mark and related series.
- **"Pour" (maybe).** Decorative droplets for funnels. Only after measuring its rendering cost, and never without a reduced-motion end state.
- **Switching between host charts** (deferred in M5 planning, decision 4): `chartSwitch` views that are `expressive()` attachments, so a D3 pie can morph into D3 bars. It needs a way to hide a host's marks while the morph plays, and labels would crossfade, since a host's labels can't be read.
- **Line chart extras** (deferred in M4 planning):
  - a `curve` option (M4 decision 5). *Built in M10 step 1*, as `curve: "linear" | "monotone"` on `lineChart` (M10 decisions 4 and 9). M4 expected it to need sampled arc-length tables and approximate threshold crossings; `describe.shape`'s flattening (M9) makes the curve a polyline within 0.1 px instead, with a sample at each bend, so its walk is a straight line's and its crossings are exact;
  - gaps for missing values: M4's line throws on them (decision 9). *Built in M8 step 3*, as `MarkGeometry.gaps`, `describe.line({ breaks })` and `Sample.gapBefore`, with `null` and `undefined` as missing values on `lineChart` (M8 decisions 5 and 11–13);
  - hovering only the nearest point, instead of the crosshair. *Built in M10 step 2*, as `lineChart({ hover: "point" })`, beside the crosshair, which stays the default (M10 decisions 5 and 10).
- A transition effect reporting its progress, so a switch can keep a transition with other timing in step (M5).
- Line charts as switch views (M6 decision 3). *Built in M11 step 1*, as `paintOf(key)` and `standsFor(key)` on `ChartSwitchView`, which the charts' handles have (M11 decisions 4 and 10): a line chart's points grow into columns keyed as they are, two line charts' lines morph by series, each mark is drawn in its view's colour, and focus follows the x.
- Time zones by name on a date axis (M6 decision 1).
- TypeScript 7 (M6 decision 8). *Built in M8 step 5* (M8 decisions 7 and 15): TypeScript 7 runs `typecheck`, TypeScript 6 builds the declarations, and `pack-check` checks the packed types on 5.4, 6 and 7. Left: `typescript` itself goes to 7 once tsup builds declarations without TypeScript's JS API. *Built in M9 step 5* (M9 decisions 6 and 15): tsdown builds the package, with oxc's declarations and no TypeScript, and `typescript` is 7. Left: `src/api-docs.test.ts` reads the entries with TypeScript 6's API, as `typescript-6`, until it can with TypeScript 7's.
- VoiceOver + Safari on every section (M6 decision 2).
- `describe.shape`, and the adapter reading circles. *Built in M9 steps 3 and 6* (M9 decisions 4, 5, 11 and 12): `describe.shape` from path data rather than an element (step 3), and `expressive()` reading `<circle>` as a point and `<path>`, `<line>`, `<polyline>`, `<polygon>` and `<ellipse>` through `describe.shape` (step 6).
- Decorations drawing below a line chart's points, and a palette check against `--ec-negative` (M4 step 7).
- Recolouring at once when `update()` changes `colors` (M5 step 2).
- A lighter path than `refresh()` for a Vega chart played frame by frame (M4 step 8).
- Changing an attachment's effects, as `update({ on })` changes a chart's (M6 step 4). *Built in M9 step 1*, as `update({ on })` on `expressive()`'s and `fromVegaView()`'s attachments, with `leave()` (M9 decision 9). Before, `expressive()` had no way to, so `donut.html` attaches the D3 pie's effects again when the picker changes, until M9 step 7.
- **A tooltip that can be hovered** (WCAG 1.4.13, M6 step 7). *Built in M8 step 1*: it takes the pointer while it shows, with a bridge to its mark, and the audit's 1.4.13 rows pass (M8 decisions 4 and 9). Before, it was `pointer-events: none`, so moving the pointer onto it hovered whatever was under it. Making it hoverable would block the marks it covers. The options were: hold it while the pointer crosses onto it, and let it go once the pointer settles on another mark; or show its text in a line beside the chart, where it covers nothing ([a11y-audit.md](a11y-audit.md#what-it-found)).
- **Dimming that keeps text readable** (M6 step 7). *Built in M7 step 3*: hover dims the other marks' bodies, not their labels, so the text keeps 4.5:1 (M7 decision 15). Before, it dimmed every other mark to 30%, its labels with it: names fell to 2.0:1 in light and 2.5:1 in dark, which the audit counted as a judgement call, since leaving restores them and the values are in the tooltip, the names and the table. Bars still dim to 1.5:1.
- **A cap on `travel`'s trip** (M6 step 6). *Built in M7 step 2*: a trip lasts at most 4 s base (M7 decision 14). Before, it lasted the distance ÷ 360 px/s, with no limit, so a decoration's first trip along a year of daily values lasted 26 s, and along ten years 167 s, starting by itself. The stress page draws the end state instead, and still does.
- **Fewer attribute writes per frame** (M6 step 6). 77% of a 1,000-bar update's attribute writes, and 98.8% of a ten-year line's play, set the value already there. Skipping them showed no gain that could be told from a shared machine's drift; measure it again on a quiet one, with the two orders interleaved.
- **A bar's per-frame cost** (M6 step 6): about 30 µs of script a bar, most of it building its `describe.bar` walk and outline every frame. Lazy walks, or transforms for a bar that only moves, would raise the limit of 100 updating bars.
- **Thinning a bar chart's labels** (M6 step 6). *Built in M8 step 6*: labels that would overlap are thinned, every nth category label from the first and the value labels all or none (M8 decision 16). Before, every bar had its category and value label, so past about 40 bars they overlapped.
- **Larger steps on a long axis** (M6 step 6). *Built in M8 step 6*: Page Up and Page Down go a calendar month on a line's time axis, and a tenth of the marks elsewhere (M8 decision 16), so ten years of days is 120 presses. Before, it was 3,653 presses of an arrow key.
- Whatever M6's stress demo and audit find that's bigger than a contained fix.
- **A written audit table for `stress.html`** (M6 step 8). axe and the DOM checks already run on it, and section G passed, but [a11y-audit.md](a11y-audit.md) has no table for it.
- **Room for change labels** (M7 step 1). *Built in M8 step 2*, as `barChart({ room })` (M8 decision 10): `room: 28` keeps a `delta` inside the chart at 320 px. Lines and slices stayed inside, so they have none. The layouts leave room for their own labels, not for `delta`'s or `label`'s text past them, so at 320 px it reaches about 20 px past the chart's edge (a bar's right, a column's top, a negative bar's left, past its name). A layout option could reserve that room, at the cost of a narrower plot and new baselines.
- **Change labels on a neighbour's label** (M7 step 1). *Built in M10 step 3*, as `MarkGeometry.nearbyLabels`, which `delta` and `label` go past too (M10 decision 11). A mark's `labelBounds` are its own labels only, so when two lines end close together, one line's `delta` can land on the other's end label. A chart could give each mark its neighbours' boxes too, or a chart-wide list of them.
- **A change that outlives its update** (M7 step 5). *Built in M8 step 2*: the runner ends the `update` runs of the marks an update leaves alone (M8 decisions 6 and 10), so a `delta` goes at its chart's next update. `delta`'s text stays until its mark's next update, so after an update that leaves the mark alone, it still says the change before. The season page empties the `update` slot before each matchweek. `delta` could clear on any update of its chart, or the runner could end the update runs of marks an update leaves alone.
- **`delta`'s default value mid-change** (M7 step 5). *Built in M8 step 2*: an update run's `data.previous` is the data the mark last rested at (M8 decision 10), so it says "+1". It reads the last sample, which counts during a transition, so an update that replaces one still moving says the change from where the bar was ("+1.88"). Comparing with the last update's values would say "+1". The season page reads its rows instead.
- **Overlay text on host charts** (M7 step 5). *Built in M8 step 2*: `.ec-overlay .ec-text` is sized as on our charts (M8 decision 10). The stylesheet sizes `.ec-text` only inside our charts, so `delta`'s and `label`'s text on an `expressive()` attachment takes the page's font size (15 px on the demo pages), though `caption.ts` places it for 12.5 px. The season page sizes it itself.
- **A negative column's value label on its name** (seen in M7 step 1). *Built in M10 step 3*: with a negative column, the names go below the value labels' room (M10 decision 11). The most negative column's value label hangs below its tip, at the plot's bottom, and overlaps its category label under the axis.
- **More of the icon sets' SVG** (M6 step 9's polish). *Built in M8 step 4* for the fill rule and opacity: `IconShape` has `fillRule` and `opacity`, and `iconFromSvg` keeps them (M8 decision 14). Before, it drew `fill-rule="evenodd"` as nonzero, so a hole in a solid icon (Heroicons' solid set) filled in, and it dropped opacity (duotone sets). Left: square caps and bevel joins, which would widen unions on `IconShape` and `Paint`, so they'd be breaking (M8 decision 8).
- **`fill-opacity` and `stroke-opacity` in `iconFromSvg`** (M8 step 4). *Built in M9 step 4*: `IconShape` has `fillOpacity` and `strokeOpacity`, `iconFromSvg` keeps them, inherited as SVG inherits them, and the SVG layer sets them on the shape's `<path>` (M9 decision 14). Before, they were dropped, so a set that faded a part with them, not with `opacity`, drew it at full strength. `pixels()` reads a long number quickly too.

---

## 10. Open questions and risks

### Open questions (each has a recommendation; none blocks M1)

1. **Morph correspondence.** Side-matched sampling (§2.2) *unrolls* a slice: its arc becomes the bar's height. The prototype instead *drops* the slice, so the outer arc becomes the bar's top. *Recommendation:* build the generic unroll in M5, compare it in the demo, and add a `morph({ align })` option only if the prototype's version reads better. *Decided in M5 planning: both* (M5 decision 1). `morph({ align })` offers "unroll" and "drop", the demo shows both, and you pick the default in the browser in M5 step 4. *Picked in M5 step 4: "unroll".*
2. **CSS delivery.** *Decided in M2 planning: both* (M2 step 1). Auto-injected `<style>` vs a CSS file. *Recommendation:* both, with injection on by default (§7.1).
3. **Persisting the viewer's motion choice** across pages (`localStorage`). *Decided: opt-in `persist`* (M2 step 4). *Recommendation:* opt-in `motionSwitch(el, motion, { persist: "key" })`.
4. **Live-region announcements** on update, on or off by default. *Decided: off by default, with an `announce` option* (M2 step 5). *Recommendation:* off by default, with a one-line option.
5. **Playwright for visual regression** needs a new dev dependency plus browsers in CI. *Decided in M2 planning: yes, Chromium only; built in M2 step 6.* *Recommendation:* decide at M2.
6. **More subpath exports** (`expressive-charts/core`, `/effects`) for smaller bundles. The first one (`/icons/sport`) is needed in M1. *Recommendation:* decide the rest in M6 using real bundle numbers. *Decided in M6 planning: none for 0.1.0* (M6 decision 6). On main's build, bundlers keep only what a page imports (`motion` alone is 2.1 KB gzip, everything 70.5 KB), so more entries wouldn't make any page smaller. The size check (M6 step 2) measures those import sets instead, so a change that breaks tree-shaking fails CI. *Answered with the numbers in M6 step 2* ([architecture.md](architecture.md#bundle-size)): bundled and minified, a page that imports `motion` and `animated` pays 1.7 KB gzip, `describe` and `matrix` 3.1 KB, `barChart` 27.5 KB, the line page's four imports 31.6 KB, and everything 62.5 KB (planning's script left whitespace in, hence its larger numbers). A `/core` entry would give a bundled page the same 1.7 KB, so it would save nothing. `npm run size` checks every set against its budget on each PR.
7. **TypeScript 7** (the native compiler) is a separate upgrade. *Recommendation:* after M1, once there's real code to typecheck. *Decided in M6 planning: after 0.1.0* (M6 decision 8). TypeScript 7.0.2 is out; 0.1.0 builds with 5.9.3, pinned, and README says its types need 5.4 or newer. *Built in M8 step 5* (M8 decisions 7 and 15): TypeScript 7.0.2 runs `typecheck`; 6.0.3 builds the declarations and runs the API docs test, since tsup and the test need TypeScript's JS API, which 7.0 doesn't have; and `pack-check` checks the packed types on 5.4, 6 and 7. *Built in M9 step 5* (M9 decisions 6 and 15): tsdown builds the package without TypeScript, `typescript` is 7.0.2, and 6.0.3 stays as `typescript-6` for the API docs test only.
8. **Framework wrappers** (React, Vue, Svelte) are out of scope for 0.1. The imperative `update()` API is designed to be easy to wrap.
9. **Line smoothing.** v0.1 lines are straight polylines, which keeps `threshold` crossings exact and arc length cheap. Curves would mean sampled arc-length tables and approximate crossings. *Decided in M4 planning: straight lines only in v0.1* (M4 decision 5). A `curve` option is in the backlog. Host charts drawn with curves work only approximately: the page describes the curve with points taken from the path (since M9, `describe.shape` reads it from its path data), and `threshold`'s crossings between samples are approximate. *Built in M10 step 1* (M10 decisions 4 and 9): `lineChart({ curve: "monotone" })` draws d3's `curveMonotoneX`, flattened within 0.1 px as `describe.shape` flattens a Bézier, so a curved line is a polyline and its arc length is the walk's own, with no tables. It has a sample at each bend, so `threshold`'s crossings stay exact. A host's curve keeps its samples where the page puts them, so its crossings between them are still approximate.
10. **Naming.** Keep the draft's `path` and `angle`, or rename them to `walk` and `heading` to avoid confusion with `outline`? *Recommendation:* keep them; the doc comments carry the meaning. *Decided in M6 planning: kept* (M6 decision 8), before the 0.x promise freezes `MarkGeometry`.
11. **Releasing.** Check that the npm name is available, and publish from CI with provenance. *Decided in M6 planning* (M6 decision 4): the name is free (23 October 2026). npm makes no provenance for a private repository, so you make this one public. 0.1.0 is published from CI with `--provenance` and a short-lived token, since trusted publishing can only be set up for a package that exists (M6 step 9). The token is deleted once 0.1.0 is out, and trusted publishing is set up just before the next release, since a new trusted publisher expires unless a publish uses it within 2 days (found in M6 step 3).
12. **D3 in demos and tests.** Adapter demos and tests are most convincing against real D3, but D3 would be a new dev dependency (never a runtime one). *Decided in M3 planning: yes, `d3-shape` and `d3-selection` only, pinned, as dev dependencies* (M3 decision 1). *Recommendation:* M1 uses a hand-written SVG chart; decide on D3 as a dev dependency in M3, when pie paths need it.
13. **Cost of `watch`.** Following a host's transition through attribute changes means re-reading geometry on every frame. *Recommendation:* measure it in M4 before making it more than opt-in. *Planned in M4* (decision 14, step 6): `watch: true` is opt-in. It re-reads only the marks whose attributes changed, once a frame. Step 6 measures it on a D3 transition and a D3 line's reveal, records the numbers here, and says whether it stays opt-in.

    *Measured in M4 step 6:* main-thread time per frame (Chrome's `TaskDuration` over the frames, divided by them) in headless Chromium 156 on an i7-12700KF, pinned to its performance cores, unthrottled and with a 4× CPU slowdown. Each case is the median of five repetitions, each running the four variants back to back on fresh pages. The hosts are real D3 (`d3-selection`, `d3-shape`):
    - **20 or 200 bars** in one group, with four transitions of 45 frames each. Each transition joins new values, calls `refresh()` once, then writes every bar's `width` once a frame from `requestAnimationFrame`, eased as d3-transition does (it isn't a dev dependency). The decoration is `threshold({ compareTo: 50, when: "above" })`.
    - **The line**: two `d3.line()` paths over 38 weeks, revealed by the page over 390 frames (the lab's 6.5 s), each frame setting the paths' rows and `d`. The decoration is `only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on" })))`.

    "Attached" is `expressive()` without `watch`, so its decoration stays put; "`refresh()`" calls it every frame instead of watching. "In step" is the share of the host's frames that the attachment had caught up with by the end of the same frame (a separate, untimed run).

    | ms per frame | host alone | attached | `watch` | `refresh()` each frame | `watch` adds | in step |
    |---|---|---|---|---|---|---|
    | 20 bars | 0.43 | 0.47 | 1.00 | 1.12 | 0.56 | 97.8% (attached: 2.8%) |
    | 200 bars | 1.31 | 1.50 | 4.18 | 4.53 | 2.66 | 96.7% (1.7%) |
    | Line reveal | 0.38 | 0.38 | 0.88 | 0.95 | 0.50 | 99.5% (0%) |
    | 20 bars, 4× slower | 1.60 | 1.91 | 4.54 | 4.93 | 2.66 | |
    | 200 bars, 4× slower | 5.49 | 6.88 | 21.0 | 24.4 | 13.6 | |
    | Line reveal, 4× slower | 1.66 | 1.73 | 4.35 | 4.38 | 2.52 | |

    "`watch` adds" is the median of each repetition's difference from "attached". It includes the effects' redraw on every frame (`threshold` on every bar, the red runs and the ball on the line), which any way of following the host pays. Only the first frame of each transition is late: the observer hears it after it's drawn. With the 4× slowdown, 26% of the 200-bar frames took over 20 ms with `watch` (44% with `refresh()` each frame, 2% attached); every other case kept its frames.

    So following costs about half a millisecond a frame on a typical chart, and about 13 µs a frame for each of 200 moving bars (68 µs at 4× slower). That's a little less than calling `refresh()` every frame, which also fires `update` and cuts hover short. Nothing moving costs nothing: the observer only wakes the clock when a watched attribute changes. **`watch` stays opt-in:**
    - its cost grows with the marks that move each frame, so a page with hundreds of animated marks on a slow device should choose it;
    - it only helps a page whose `geometry` reads the element or a row it updates each frame, and one that reads a transition's target row would see its decorations jump to the end;
    - turning it on by default would change what existing attachments do between refreshes.

    A page that animates its marks should turn it on; the line demo does. Revisit a default with the M6 stress demo, which sets the SVG limits. *Planned in M6 step 6.*

    *Measured again in M6 step 6*, on `demo/stress.html` (D3 columns in a hand-written transition of 750 ms base, with `threshold({ compareTo: 50, when: "above" })`), each size alone, with the same machine and method, five fresh pages:

    | ms per frame | `refresh()` at the end | `watch` | `refresh()`, 4× slower | `watch`, 4× slower |
    |---|---|---|---|---|
    | 20 columns | 0.93 | 1.85 | 4.37 | 9.06 |
    | 100 | 2.05 | 4.38 | 11.0 | 24.9 |
    | 200 | 3.80 | 6.95 | 20.6 | 36.8 |
    | 500 | 5.77 | 14.4 | 33.0 | 80.3 |
    | 1,000 | 11.2 | 29.8 | 66.9 | 163 |
    | 2,000 | 22.3 | 57.6 | 187 | 318 |

    From 500 columns up, `watch` adds 17–19 µs a moving column a frame (about 95 µs at 4×), a little more than M4's 13 µs at 200. It halves the largest number that stays smooth: 1,000 columns with `refresh()` at the end, 500 with `watch`, and at 4× 100 and 20. **It stays opt-in**, for M4's reasons.
14. **Changing effects with `update({ on })`.** Charts can't change `on` after they're created, so M3's demo recreates its charts when the viewer picks another effect. A page that switches effects loses focus and replays its enter effects. *Recommendation:* add it when a page needs it, by M6 at the latest. The runner would clear the slots' runs and resolve the new ones. *M4 planning:* the line demo has no effect picker, so M4 doesn't need it either. *M6 planning:* built in M6 step 4 (decision 3), and `donut.html`'s picker uses it. *Built in M6 step 4:* the runner's `swap()` clears a changed slot's runs and starts the new effect where they were: `decorate` again on every mark, a held hover replayed once the change settles, and `enter`, `update` and `exit` in their end state, so nothing enters again. Focus stays. *Built for attachments in M9 step 1:* `expressive()`'s and `fromVegaView()`'s attachments have `update({ on })` too, through the same `swap()`, so `donut.html`'s D3 pie needn't be attached again (M9 step 7 makes it so).
15. **Donut labels at narrow widths.** M3 drops a label that would overlap the one before it, and every slice stays named in the legend, the tooltip, the table and its ARIA name. Leader lines, or labels inside large slices, would keep more of them. *Recommendation:* look at the demo at phone width in M3 step 6 and decide then. Don't add a label-placement engine before a page needs one. *Looked at in M3 step 6:* with the lab's four outcomes, every label stays at 375 and 320 px wide, because the ring shrinks first (to an outer radius of about 92 px at 320). Nothing is dropped, so the demo needs neither. Revisit with a page of many small slices.
16. **A test-runner flavour of `checkEffect`.** M3 exports one runner-agnostic function that throws. A Vitest helper that makes one test per fixture would report failures more readably, but it would tie the package to one runner. *Recommendation:* wait until effect authors ask for it.
17. **Naming a donut's value column.** The donut's table heads its value column with the field's name ("shots"). Only `seriesLabels` renames it, and that also changes the slices' names and the centre text (noticed in M3 step 6). *Recommendation:* a `table.value` header, beside `table.share` and `table.total`. M4 step 1 owns `table.ts`, so it could add it there if you want it in M4; otherwise in M6. *M6 planning:* `table.series`, a header per series that defaults to its `seriesLabels` name, in M6 step 4 (decision 3). *Built in M6 step 4:* `table: { series: { shots: "Shots" } }` heads the donut's value column, and only the table changes.

### Risks

- **SVG performance.** Hover effects touch only a handful of nodes, so they're cheap at any chart size. The cost is whole-chart transitions, which write attributes for every mark on every frame. *Measured in M6 step 6* ([architecture.md](architecture.md#limits) has the method and the table), each case alone, unthrottled and at 4× CPU slowdown:
  - a staged update of every bar is smooth up to 100 bars, and under 100 at 4×: each bar costs about 30 µs of script a frame, then style, layout and paint;
  - hover, with the other bars dimmed, up to 1,000 bars (500 at 4×);
  - a line on dates, played with `threshold` and a riding icon, up to 5 years of days in 1 or 2 series and 2 years in 3 or 4 (a year at 4×, in one series);
  - D3 columns followed by `watch` up to 500 (20 at 4×), or 1,000 with `refresh()` at the end (100);
  - a switch up to 200 pairs (20 at 4×);
  - a first draw is one long task: 86 ms for 1,000 static columns, a second for 10,000.

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
  - the M6 stress demo counts it. *Counted in M6 step 6:* on the date line, `only("visits", …)` starts a run on every line and point, 732 for a year in two series and 14,616 for ten years in four; 366 and 3,654 are on the visits line and its points, and 1 draws. They cost nothing per frame (a reveal tells only the lines' runs), and their share of the chart's first draw is with the points': 57 ms for a year in two series, 629 ms for ten years in four.
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
11. **Host transitions.** The host can scale its own animations with `motion.duration(600)`, which is the simplest integration. `watch: true` follows a host transition frame by frame, at a cost to measure (open question 13). *Built in M4 step 6, and measured there.*
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
