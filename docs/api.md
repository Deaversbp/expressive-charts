# API reference

Every export of every entry of `expressive-charts`, values and types: what each is, its options with their defaults, and what it returns. [architecture.md](architecture.md) explains the design behind them, and [the effects guide](effects-guide.md) is the guide to writing effects. [README](../README.md) has the overview.

- **Entries.** The package has four: [`expressive-charts`](#expressive-charts), [`expressive-charts/icons/sport`](#expressive-chartsiconssport), [`expressive-charts/testing`](#expressive-chartstesting) and [`expressive-charts/style.css`](#expressive-chartsstylecss). The main entry is also a script-tag bundle (below).
- **Layers.** Within the main entry, the names are grouped by layer, as the code is: the [core](#core) (motion, clocks, tweens and playback) and the [contracts](#contracts) charts and effects share, [geometry](#geometry), [effects](#effects), [icons](#icons), [presets and settings](#presets-icons-by-name-and-settings), [charts](#charts), [adapters](#adapters), [linked hover](#linked-hover) and [controls](#controls).
- **Durations** are base values in ms, which the motion mode scales: a 500 ms base is 500 ms in Presentation, 175 ms in Analysis, and nothing with motion off ([`Timing`](#timing)).
- **`D`** is the type of a chart's rows: `barChart<Player>` reads `Player` objects.
- **The 0.x promise.** An entry marked *Under the 0.x promise.* is part of the effect-author API: from 0.1.0 it breaks only in a minor release, with a migration note, and a deprecated name keeps working for one minor release. Everything else may still change in a minor release while the library is 0.x. [CHANGELOG.md](../CHANGELOG.md#the-0x-promise) has the promise.
- **Checked.** `src/api-docs.test.ts` fails when an export has no entry here or an entry names no export, and type-checks every example below that imports the package.

## `expressive-charts`

The main entry: the charts, adapters, effects, controls, icons, geometry and the motion core.

```ts
import { barChart, travel } from "expressive-charts";
```

It's an ES module and CommonJS (`require("expressive-charts")`), each with its own types (`.d.ts` for `import`, `.d.cts` for `require`), which need TypeScript 5.4 or newer. The entry has no side effects, so a bundler keeps only what a page imports, and it can be imported in Node with no DOM: nothing touches the browser until a chart, an adapter or a control is made.

### The script tag

`dist/expressive-charts.global.js` is this entry as one minified script, for a page with no bundler. It defines `window.ExpressiveCharts`, holding every value below:

```html
<script src="https://cdn.jsdelivr.net/npm/expressive-charts@0.2/dist/expressive-charts.global.js"></script>
<script>
  const { barChart } = ExpressiveCharts;
</script>
```

It doesn't hold the sport icons or the testing entry.

#### `VERSION`

```ts
const VERSION: string
```

The package's version, the same as its `package.json`'s.

### Core

The motion core runs every animation: one clock, tweens and values that can be retargeted, the motion modes, and reduced motion ([architecture.md](architecture.md#core)). Charts, adapters, effects, tweens and playbacks follow the page-wide [`motion`](#motion) and [`defaultClock`](#defaultclock) unless they're given their own.

```ts
import { animated, createMotion, interpolateNumber, motion } from "expressive-charts";

motion.setMode("analysis");                                          // the author's default: never overrides reduced motion
button.addEventListener("click", () => motion.chooseMode("presentation")); // the viewer's choice: overrides it

const width = animated(0, interpolateNumber, { onChange: (w) => svg.setAttribute("width", String(w)) });
await width.to(320, { duration: 500 });      // 500 ms in Presentation, 175 ms in Analysis, at once with motion off

const slow = createMotion({ scaling: { presentation: { effect: { factor: 1.5 } } } });
slow.duration(600, "effect");                // 900 in Presentation
```

#### `motion`

```ts
const motion: Motion
```

The page-wide motion, made by `createMotion()` with its defaults: Presentation, following the device's `prefers-reduced-motion`. Every chart, adapter, control, tween and playback follows it unless it's given its own. Set the author's mode with `motion.setMode()`; an on-page control the viewer operates calls `motion.chooseMode()`, as [`motionSwitch()`](#motionswitch) does.

#### `Motion` (type)

*Under the 0.x promise.*

```ts
interface Motion extends MotionView
```

A motion: a [`MotionView`](#motionview), plus who asked for what. The effective mode is the viewer's choice if they made one, else Off when the device asks for reduced motion, else the author's mode.

- `requested`: `MotionMode`. The author's mode.
- `viewerChoice`: `MotionMode | undefined`. The mode the viewer picked on the page, if any.
- `prefersReduced`: `boolean`. Whether the device asks for reduced motion, read live.
- `setMode(mode)`: sets the author's mode. It never overrides reduced motion.
- `chooseMode(mode)`: sets the viewer's choice, from a control the viewer operates. It does override reduced motion.
- `clearChoice()`: forgets the viewer's choice.
- `subscribe(listener)`: calls `listener()` whenever the mode, the viewer's choice or the device's setting changes, and returns a function that stops it. The media query is watched only while someone listens.

`setMode()` and `chooseMode()` throw a `TypeError` for a mode that isn't one.

#### `MotionView`

*Under the 0.x promise.*

```ts
interface MotionView {
  readonly mode: MotionMode;
  readonly staged: boolean;
  duration(base: number, timing?: Timing): number;
}
```

What charts and effects read of a motion. `mode` is the effective mode. `staged` is true only in Presentation, where a chart splits a data change into stages: values first, then positions. `duration(base, timing)` scales a base duration in ms by the effective mode and the [`Timing`](#timing) (default `"transition"`); 0 means jump to the end, and it's always 0 with motion off.

#### `MotionMode`

*Under the 0.x promise.*

```ts
type MotionMode = "presentation" | "analysis" | "off"
```

Presentation is staged and unhurried, around a second for a data change. Analysis is quick, with no staging: a data change takes at most 200 ms. Off jumps every animation to its end state.

#### `createMotion()`

```ts
createMotion(options?: MotionOptions): Motion
```

A motion of its own, for a chart, an adapter, a tween or a test that shouldn't follow the page-wide one. Options: [`MotionOptions`](#motionoptions). An unknown `mode` throws a `TypeError`.

#### `MotionOptions`

```ts
interface MotionOptions
```

- `mode`: `MotionMode`. Default `"presentation"`. The author's mode.
- `scaling`: `ScalingOverrides`. Rules that replace the defaults, by mode and timing. Default none: [`defaultScaling`](#defaultscaling).
- `reducedMotion`: `ReducedMotionSource`. Default `mediaReducedMotion()`, the device's `prefers-reduced-motion`.

#### `Timing`

*Under the 0.x promise.*

```ts
type Timing = "feedback" | "transition" | "effect" | "playback" | "stagger"
```

What a duration is for, which decides how each mode scales it ([`defaultScaling`](#defaultscaling)):

| Timing | For | Presentation | Analysis | Off |
| --- | --- | --- | --- | --- |
| `feedback` | hover colour and dimming | base | base | 0 |
| `transition` | data changes (the default) | base | base × 0.35, at most 200 ms | 0 |
| `effect` | `travel`, `wiggle`, `flash`, `pulse`, `trace` | base | base × 0.35, from 140 to 300 ms | 0 |
| `playback` | a play, such as a season's | base | base × 0.3 | 0 |
| `stagger` | the wait before each mark of a `stagger` | base | 0 | 0 |

#### `ScalingRule`

*Under the 0.x promise.*

```ts
interface ScalingRule {
  readonly factor: number;
  readonly min?: number;
  readonly max?: number;
}
```

How one mode scales one timing: base × `factor`, at least `min` (but never more than the base) and at most `max`. So a floor never makes an animation longer than its base.

#### `ScalingTable`

```ts
type ScalingTable = { readonly [M in "presentation" | "analysis"]: { readonly [T in Timing]: ScalingRule } }
```

A rule for every timing in Presentation and in Analysis, as [`defaultScaling`](#defaultscaling) is. Off is always 0.

#### `ScalingOverrides`

*Under the 0.x promise.*

```ts
type ScalingOverrides = { readonly [M in "presentation" | "analysis"]?: { readonly [T in Timing]?: ScalingRule } }
```

Some of a `ScalingTable`'s rules, for `createMotion({ scaling })` and `testContext({ scaling })`. Each rule given replaces the default for its mode and timing.

#### `defaultScaling`

```ts
const defaultScaling: ScalingTable
```

The rules every motion starts from, as the [`Timing`](#timing) table gives them: in Presentation every factor is 1; in Analysis `feedback` is 1, `transition` 0.35 with `max: 200`, `effect` 0.35 with `min: 140` and `max: 300`, `playback` 0.3, and `stagger` 0.

#### `scaleDuration()`

```ts
scaleDuration(base: number, rule: ScalingRule): number
```

Applies a rule to a base duration in ms, as `duration()` does: `min(max(base × factor, min(base, rule.min)), rule.max)`. A base that isn't more than 0 gives 0.

#### `mediaReducedMotion()`

```ts
mediaReducedMotion(query?: string): ReducedMotionSource
```

The device's reduced-motion setting, through `matchMedia(query)` (default `"(prefers-reduced-motion: reduce)"`), followed live. It looks the media query up only when it's first read or subscribed to, and where there's no `matchMedia` (in Node) it never matches.

#### `ReducedMotionSource`

```ts
interface ReducedMotionSource {
  readonly matches: boolean;
  subscribe(listener: () => void): () => void;
}
```

A reduced-motion preference for `createMotion({ reducedMotion })`: whether it asks for reduced motion now, and a way to hear it change, which returns a function that stops listening. A test can pass `{ matches: true, subscribe: () => () => {} }`.

#### `defaultClock`

```ts
const defaultClock: Clock
```

The page-wide clock: `requestAnimationFrame` (a 16 ms timer where there is none) and `performance.now()` (`Date.now()` where there is none), looked up each time it asks for a frame, never on import. It asks for frames only while something is subscribed, so an idle page costs nothing.

#### `createClock()`

```ts
createClock(source?: FrameSource): Clock
```

A clock that runs one frame loop over its `source` (default: the browser's frames, as `defaultClock` has them). A frame callback that throws is reported (with `reportError` where there is one, else `console.error`), and the others still run.

#### `manualClock()`

```ts
manualClock(start?: number): ManualClock
```

A clock that moves only when it's told to, for tests: it reads `start` (default 0) until `advance(ms)` moves it. `advance()` with a negative or non-numeric `ms` throws a `RangeError`.

#### `Clock`

*Under the 0.x promise.*

```ts
interface Clock {
  now(): number;
  onFrame(callback: (now: number) => void): () => void;
}
```

`now()` is the time in ms. `onFrame(callback)` calls `callback(now)` on every frame until the function it returns is called.

#### `ManualClock`

*Under the 0.x promise.*

```ts
interface ManualClock extends Clock {
  advance(ms: number): void;
  readonly idle: boolean;
}
```

A [`Clock`](#clock) for tests. `advance(ms)` moves time forward by `ms` and runs one frame at the new time. `idle` is true when nothing is waiting for a frame.

#### `FrameSource`

```ts
interface FrameSource {
  now(): number;
  request(callback: (now: number) => void): () => void;
}
```

Where a clock's frames come from: the time, and one callback on the next frame, cancelled by the function `request()` returns.

#### `tween()`

```ts
tween(options: TweenOptions, env?: Partial<MotionEnv>): Tween
```

Animates progress from 0 to 1 over a base duration scaled by the motion mode, calling `options.update` with the eased progress: once with `ease(0)` at once, then every frame, then with `ease(1)` at the end. `env` gives the clock and the motion (default `defaultClock` and `motion`). When the mode scales the duration to 0, the last update runs before `tween()` returns, and when the mode turns off mid-way it jumps to the end on the next frame. If `update` throws, the tween cancels itself and the error goes on once: thrown from `tween()` or `finish()` when the update ran there, otherwise reported by the clock. Returns a [`Tween`](#tween-type). In an effect, use `ctx.tween()`, which is bound to the run's clock, motion and signal.

#### `Tween` (type)

*Under the 0.x promise.*

```ts
interface Tween {
  readonly finished: Promise<TweenResult>;
  readonly state: "running" | TweenResult;
  cancel(): void;
  finish(): void;
}
```

A running tween. `finished` resolves to `"done"` or `"cancelled"` and never rejects, so rapid hovering can't leave unhandled rejections. `cancel()` stops where it is, and `finish()` jumps to the end.

#### `TweenOptions`

*Under the 0.x promise.*

```ts
interface TweenOptions
```

- `duration`: `number`, required. Base ms.
- `timing`: `Timing`. Default `"transition"`.
- `ease`: `Easing`. Default `easeInOutCubic`.
- `delay`: `number`. Base ms before progress starts, scaled like the duration. Default 0.
- `update`: `(progress: number) => void`, required. Called with the eased progress.
- `signal`: `AbortSignal`. Aborting it cancels the tween.

#### `TweenResult`

*Under the 0.x promise.*

```ts
type TweenResult = "done" | "cancelled"
```

How a tween ended.

#### `MotionEnv`

```ts
interface MotionEnv {
  readonly clock: Clock;
  readonly motion: MotionView;
}
```

The clock and motion an animation runs against. `tween()`, `animated()` and `playback()` take either or both.

#### `animated()`

```ts
animated<T>(initial: T, interpolate: Interpolator<T>, options?: AnimatedOptions<T>): Animated<T>
```

A value that can be retargeted mid-flight, starting at `initial`. `interpolate` blends one value into another, as [`interpolateNumber`](#interpolatenumber) does for numbers. Returns an [`Animated<T>`](#animatedt).

#### `Animated<T>`

```ts
interface Animated<T>
```

- `value`: `T`. The value now, in between while it animates.
- `target`: `T`. Where it's heading; equal to `value` at rest, including after a cancellation from outside.
- `animating`: `boolean`.
- `to(target, options)`: animates from the value now to `target`, cancelling whatever was running, so nothing jumps. Options: [`AnimateOptions`](#animateoptions). Returns `Promise<TweenResult>`.
- `set(value)`: jumps there, cancelling any animation.
- `stop()`: stops where it is; the value now becomes the target.

#### `AnimatedOptions<T>`

```ts
interface AnimatedOptions<T> extends Partial<MotionEnv>
```

- `onChange`: `(value: T) => void`. Called whenever the value changes, every frame of an animation included.
- `clock`, `motion`: default `defaultClock` and `motion`.

#### `AnimateOptions`

```ts
interface AnimateOptions
```

As [`TweenOptions`](#tweenoptions) without `update`: `duration` (required), `timing` (default `"transition"`), `delay` and `signal`. `ease` defaults to `easeInOutCubic`, or to `easeOutCubic` when it interrupts a value that's moving and starts at once, since restarting an ease-in from a moving value makes it stall.

#### `Interpolator<T>`

```ts
type Interpolator<T> = (from: T, to: T) => (t: number) => T
```

Builds a function that blends `from` into `to` as `t` goes from 0 to 1. It should give `to` exactly at 1, so a finished animation lands on its target.

#### `interpolateNumber`

```ts
const interpolateNumber: Interpolator<number>
```

Blends two numbers, exactly at both ends.

#### `interpolatePoint`

```ts
const interpolatePoint: Interpolator<Point>
```

Blends two `{ x, y }` points.

#### `interpolateRecord()`

```ts
interpolateRecord<K extends string>(a: Readonly<Record<K, number>>, b: Readonly<Record<K, number>>): (t: number) => Record<K, number>
```

Blends every key of two records of numbers. A key missing on one side counts as 0 there, so a series that appears grows from 0, and one that disappears shrinks to 0 and is gone at 1: what stacked segments need. It's an `Interpolator` for records.

#### `Easing`

*Under the 0.x promise.*

```ts
type Easing = (t: number) => number
```

Maps linear progress from 0 to 1 to eased progress. Any function of this shape works.

#### `linear`

```ts
const linear: Easing
```

No easing, for playback, whose speed should stay constant.

#### `easeInOutCubic`

```ts
const easeInOutCubic: Easing
```

Starts and ends gently: data transitions, and tweens by default.

#### `easeOutCubic`

```ts
const easeOutCubic: Easing
```

Starts at speed and settles gently: `travel`, and animations retargeted mid-flight.

#### `playback()`

```ts
playback(options: PlaybackOptions): Playback
```

Plays a value through a range on the clock, such as a season revealed week by week, and calls `onFrame` with each position ([architecture.md](architecture.md#playback)). It has no DOM: [`playButton()`](#playbutton) is its Play/Pause button, and a page's own scrubber calls `seek()`. It starts at rest at `to`, the way a chart shows all its data until something reveals less, and nothing plays by itself. A play takes its share of the scaled `duration` from wherever it starts, at constant speed; with motion off it jumps to the end. Bad options throw: a `RangeError` for `from`, `to`, `duration` or `timing`, and a `TypeError` for the rest. Returns a [`Playback`](#playback-type).

```ts
import { lineChart, playButton, playback } from "expressive-charts";

const chart = lineChart("#xg", { label: "Goals vs expected goals", data: weeks, x: "week", series: ["goals", "xg"] });
const season = playback({ from: 1, to: 38, duration: 6500, onFrame: (week) => chart.reveal(week) }); // 6.5 s; 1.95 s in Analysis
playButton("#play", season, { labels: { play: "Play season" } });
range.addEventListener("input", () => season.seek(Number(range.value)));
```

#### `Playback` (type)

```ts
interface Playback
```

- `play()`: plays on from where it is to `to`, or again from `from` when it's at the end. Does nothing while playing.
- `pause()`: stops a play where it is. A seek on its way still lands.
- `seek(x, options?)`: pauses and moves to `x`, clamped to the range: over 350 ms base with `"transition"` timing, or at once with `{ animate: false }` ([`SeekOptions`](#seekoptions)).
- `position`: `number`. Where it is now.
- `playing`: `boolean`. True from `play()` until a pause, a seek or the end.
- `subscribe(listener)`: hears `"play"`, `"pause"`, `"end"` and `"seek"` ([`PlaybackEvent`](#playbackevent)), not frames, and returns a function that stops it. A listener that throws is reported, and the others still hear.
- `destroy()`: pauses it, telling its listeners, and from then on `play()`, `pause()` and `seek()` do nothing (bad arguments still throw).

If `onFrame` or `ease` throws, the position stops where it is, and the error goes on once: reported by the clock, or thrown to whoever caused a jump (a play with motion off, `seek(x, { animate: false })`).

#### `PlaybackOptions`

```ts
interface PlaybackOptions extends Partial<MotionEnv>
```

- `from`: `number`, required. Where a play starts again once it's at the end.
- `to`: `number`, required. Where a play ends, and where it starts at rest. `from` above `to` plays backwards; they must differ.
- `duration`: `number`, required. Base ms from `from` to `to`, 0 or more.
- `onFrame`: `(position: number) => void`, required. Draws a position, whenever it changes.
- `ease`: `Easing`. Default `linear`. Seeks ease on their own.
- `timing`: `Timing`. Default `"playback"`: base in Presentation, × 0.3 in Analysis.
- `clock`, `motion`: default `defaultClock` and `motion`.

#### `PlaybackEvent`

```ts
type PlaybackEvent = "play" | "pause" | "end" | "seek"
```

What a playback's `subscribe()` hears. A seek during a play is heard as `"pause"` then `"seek"`, and a play with motion off as `"play"` then `"end"`.

#### `SeekOptions`

```ts
interface SeekOptions {
  readonly animate?: boolean;
}
```

`animate`: default true, a move over 350 ms base with `"transition"` timing (122.5 ms in Analysis, a jump with motion off). `false` jumps.

### Contracts

Types only: how charts and adapters describe a mark, what effects are, and how an effect draws ([architecture.md](architecture.md#mark-geometry)). An effect reads a mark only through [`MarkGeometry`](#markgeometry) (and a data effect its [`MarkData`](#markdatad) too), and draws only through its [`EffectContext`](#effectcontext), so one effect works on every chart. The effects guide covers [the mark](effects-guide.md#the-mark-markgeometry) and [the context and drawing API](effects-guide.md#the-context-and-drawing-api) for authors.

#### `MarkGeometry`

*Under the 0.x promise.*

```ts
interface MarkGeometry
```

One mark, described the same way whoever drew it. In chart pixels, with y pointing down ([conventions](architecture.md#conventions)).

- `key`: `string`. Its identity across updates. A segment's is `"<mark key>/<series>"`.
- `series`: `string | undefined`. The series it belongs to, if any (`"goals"`).
- **The walk**, from where the data starts to where it ends: the centre line of a bar from its baseline to its tip, the mid-radius arc of a slice, a line itself.
  - `start`, `end`: `Point`. `path(0)` and `path(1)`.
  - `length`: `number`. In px; 0 for a point.
  - `path(t)`: `Point`. The point at `t` from 0 to 1, by distance along the walk; `t` outside is clamped.
  - `angle(t)`: `number`. The direction of travel in radians, in (−π, π], clockwise on screen. The mark's up side is `angle − π/2`.
  - `slice(t0, t1)`: `string`. SVG path data for the walk between `t0` and `t1`, in either order, less its gaps: each part between them starts with its own move.
  - `gaps`: `readonly (readonly [from: number, to: number])[] | undefined`. The stretches of the walk with no data, as values of `t`, in order and apart: each with `0 ≤ from < to ≤ 1`, ending at or before the next starts. A line that skips a value has one, from the value before to the value after. The walk runs straight across a gap, so `path`, `angle` and `outline.sample` work as on any walk; `slice()` and an open outline's `d` leave it out. Unset means none ([architecture.md](architecture.md#gaps)).
- **The body.**
  - `thickness`: `number`. Px across the walk: a bar's height, a ring's width, a stroke's width, a point's diameter.
  - `outline`: [`Outline`](#outline).
  - `bounds`: [`Rect`](#rect).
  - `center`: `Point`. Its visual centre, for tooltips, rings and labels.
  - `pivot`: `Point`. Where it's attached to the chart: a bar's baseline, a donut's centre, a line's first point.
  - `labelBounds`: `readonly Rect[] | undefined`. The boxes of the text the chart draws for the mark, so an effect's own text can keep clear of them: a bar's category and value labels, the two lines of a slice's label outside the ring, a line's end label. An empty list when the mark has none drawn now. Unset on segments, points, a line with `labels: false`, and marks the library didn't draw unless the page's `geometry` gives them ([architecture.md](architecture.md#the-marks-own-labels)).
  - `segments`: `readonly MarkGeometry[] | undefined`. A bar's parts, from the baseline; every bar has at least one.

Build one with [`describe`](#describe).

#### `Outline`

*Under the 0.x promise.*

```ts
interface Outline {
  readonly d: string;
  readonly closed: boolean;
  sample(n: number): readonly Point[];
}
```

A mark's shape: `d` is its SVG path data, which for a stroke leaves out the walk's gaps; `closed` is true for areas (bars, slices, points) and false for strokes (lines). A closed outline's `sample(n)`, with `n` a multiple of 4, gives `n / 4` points a side, clockwise on screen from the start-left corner: the left side, the end, the right side, then the start, so corners land at 0, n/4, n/2 and 3n/4. An open outline's gives `n` points along the stroke, both ends included, across any gaps.

#### `Point`

*Under the 0.x promise.*

```ts
interface Point {
  readonly x: number;
  readonly y: number;
}
```

#### `Rect`

*Under the 0.x promise.*

```ts
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
```

#### `MarkData<D>`

*Under the 0.x promise.*

```ts
interface MarkData<D = unknown> {
  readonly datum: D;
  readonly samples: readonly Sample[];
  related(series: string): MarkData<D> | undefined;
  readonly previous?: MarkData<D>;
}
```

What a data effect reads beside the geometry. `datum` is the row behind the mark (a line's is the row at its revealed end). `samples` are its values along the walk, by `t`. `related(series)` is another series' data in the same chart, if it's there: a bar's other segment, a line's other line. `previous` is the data before an update, for effects that show a change: the values the mark's last update gave, or where it has rested since (a resize, a reveal), never values part way through a change.

#### `Sample`

*Under the 0.x promise.*

```ts
interface Sample {
  readonly t: number;
  readonly value: number;
  readonly at?: string | number | Date;
  readonly gapBefore?: boolean;
}
```

A value at `t` along the walk, from 0 to 1. `at` is the x behind it (a week, a date), which [`threshold`](#threshold) matches a related series by. `gapBefore` is `true` on the first sample after a gap in the data, so a data effect doesn't join it to the one before; [`samplesAlong()`](#samplesalong) sets it from the mark's `gaps`.

#### `GeometryEffect`

*Under the 0.x promise.*

```ts
interface GeometryEffect {
  readonly kind: "geometry";
  run(mark: MarkGeometry, ctx: EffectContext): Promise<void>;
  end(mark: MarkGeometry, ctx: EffectContext): void;
  clear(ctx: EffectContext): void;
}
```

An effect that reads only the mark's geometry. `run()` animates and resolves when it's done or aborted. `end()` draws, at once, the state a full run ends in, which is all reduced motion shows. `clear()` does any cleanup beyond the runner's, which empties the run's layer and resets the mark anyway. Effects are stateless: one object runs on many marks at once, and each run's state lives on its context. Make one with [`defineEffect()`](#defineeffect).

#### `DataEffect<D>`

*Under the 0.x promise.*

```ts
interface DataEffect<D = unknown> {
  readonly kind: "data";
  readonly needs?: { readonly related?: readonly string[] };
  readonly run: (mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext) => Promise<void>;
  readonly end: (mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext) => void;
  readonly clear: (ctx: EffectContext) => void;
}
```

An effect that reads the mark's data too, as [`threshold`](#threshold) does. `needs.related` lists the series it reads through `data.related()`, so a chart without one throws when it's made. Its functions are properties, not methods, so TypeScript checks the row type strictly: an effect that needs fields a chart's rows don't have is a type error there. `DataEffect` with no type argument reads no row fields and fits any chart. Make one with [`defineDataEffect()`](#definedataeffect).

#### `TransitionEffect`

*Under the 0.x promise.*

```ts
interface TransitionEffect {
  readonly kind: "transition";
  run(from: MarkGeometry, to: MarkGeometry, ctx: TransitionContext): Promise<void>;
  end(from: MarkGeometry, to: MarkGeometry, ctx: TransitionContext): void;
  clear(ctx: TransitionContext): void;
}
```

An effect that plays between two views of a mark, as [`morph()`](#morph) does in a [`chartSwitch`](#chartswitch). `run()` turns `from` into `to` and leaves `to`'s end state drawn until it's cleared; `end()` draws that at once. It isn't a mark effect, so it can't go in `on`. There's no definer: write it as an object of kind `"transition"` ([the guide](effects-guide.md#transition-effects-and-checktransition)).

#### `MarkEffect<D>`

*Under the 0.x promise.*

```ts
type MarkEffect<D = unknown> = GeometryEffect | DataEffect<D>
```

An effect that plays on one mark: what an effect slot takes, and what a preset's factory returns.

#### `AnyMarkEffect`

*Under the 0.x promise.*

```ts
type AnyMarkEffect = GeometryEffect | DataEffect<any>
```

What the combinators take: any mark effect, whatever rows it reads.

#### `Combined<E>`

*Under the 0.x promise.*

```ts
type Combined<E extends readonly AnyMarkEffect[]>
```

What [`sequence()`](#sequence) and [`parallel()`](#parallel) return for the parts `E`: a `GeometryEffect` if every part is one, otherwise a `DataEffect` that needs every data part's rows at once (an intersection), so a generic part such as `threshold()` can't widen a typed part back to `unknown`.

#### `EffectContext`

*Under the 0.x promise.*

```ts
interface EffectContext
```

One run's context: the only way an effect touches the screen or the clock.

- `signal`: `AbortSignal`. Aborted on leave, a re-trigger, a data update or destroy.
- `motion`: `MotionView`.
- `tween(options)`: `Tween`. A [`tween()`](#tween) bound to the run's clock, motion and signal.
- `mark`: [`MarkHandle`](#markhandle). Restyles the mark itself.
- `layer`: [`Layer`](#layer). The run's own overlay group, above the marks.
- `icons`: [`IconSource`](#iconsource). Finds icons by name.
- `batch`: `{ index, count }`. The mark's place among the marks of its event, for staggering.
- `onChange(listener)`: calls `listener(mark, data?)` when the mark's geometry moves (a transition's frames, a resize, a line's reveal), until the run is cleared.
- `previous`: `MarkGeometry | undefined`. The geometry before this update, on update runs.

#### `TransitionContext`

*Under the 0.x promise.*

```ts
interface TransitionContext extends EffectContext {
  readonly start: number;
}
```

A transition run's context. `start`, from 0 to 1, is where the run begins in the effect's own progress: 0 plays it all, and a switch back mid-way plays the reverse from 1 minus the progress the first had reached, so an effect that honours it retraces. Both views' marks are hidden while a transition plays, so `mark` does nothing and `onChange` never fires.

#### `Layer`

*Under the 0.x promise.*

```ts
interface Layer {
  icon(icon: Icon, options?: { readonly size?: number }): IconHandle;
  path(d: string, paint: Paint): PathHandle;
  text(content: string, style: TextStyle): TextHandle;
}
```

A run's own overlay group, in chart coordinates, which the runner empties when the run is cleared.

- `icon(icon, { size })` draws an icon, hidden until its first `place()`. With `size`, the icon is scaled by `size / icon.size` about its anchor, in icon space, before the `place()` transform, so an effect builds that transform as if the icon were its natural size. A negative size throws.
- `path(d, paint)` draws a path, unfilled unless `paint.fill` is given.
- `text(content, style)` draws text, in the theme's text colour unless `style.color` says otherwise.

#### `MarkHandle`

*Under the 0.x promise.*

```ts
interface MarkHandle {
  set(style: MarkStyle): void;
  reset(): void;
}
```

Restyles the mark itself. `set()` changes only the fields given, so effects running together don't undo each other; a field given as `undefined` goes back to its default. `reset()` goes back to the mark's own style. The runner resets it when the run is cleared.

#### `MarkStyle`

*Under the 0.x promise.*

```ts
interface MarkStyle {
  readonly transform?: Matrix;
  readonly opacity?: number;
  readonly emphasis?: number;
  readonly halo?: { readonly width: number; readonly opacity: number; readonly color?: Color };
}
```

- `transform`: moves the mark's body, in chart space. Its labels and pointer target stay put.
- `opacity`: of the mark's body.
- `emphasis`: from 0 to 1, toward the series' strong colour.
- `halo`: a stroke along the outline, behind the mark: `width` is the stroke's, so half of it shows outside. Its colour defaults to the mark's own.

#### `Paint`

*Under the 0.x promise.*

```ts
interface Paint {
  readonly fill?: Color;
  readonly stroke?: Color;
  readonly width?: number;
  readonly opacity?: number;
  readonly linecap?: "butt" | "round";
}
```

How a layer's path is drawn.

#### `TextStyle`

*Under the 0.x promise.*

```ts
interface TextStyle {
  readonly at: Point;
  readonly anchor?: "start" | "middle" | "end";
  readonly color?: Color;
  readonly opacity?: number;
}
```

`at` is the anchor point, on the text's baseline. `color` defaults to `"text"`: series colours are for swatches, never for words.

#### `Color`

*Under the 0.x promise.*

```ts
type Color = string
```

A theme token or any CSS colour. The tokens are `"text"`, `"text-muted"`, `"surface"`, `"grid"`, `"axis"`, `"focus"`, `"negative"`, `"series-1"` to `"series-8"` and their `-strong` variants, and `"mark"` and `"mark-strong"`, the colours of the mark a run belongs to. Tokens follow the light and dark themes ([`style.css`](#expressive-chartsstylecss)).

#### `IconHandle`

*Under the 0.x promise.*

```ts
interface IconHandle {
  place(transform: Matrix): void;
  remove(): void;
}
```

An icon a layer drew. `place()` moves it, with a transform from icon space into chart space; it's hidden until first placed.

#### `PathHandle`

*Under the 0.x promise.*

```ts
interface PathHandle {
  update(d: string, paint?: Partial<Paint>): void;
  remove(): void;
}
```

A path a layer drew. `update()` replaces its path data and merges the paint fields given.

#### `TextHandle`

*Under the 0.x promise.*

```ts
interface TextHandle {
  update(style: Partial<TextStyle>, content?: string): void;
  remove(): void;
}
```

Text a layer drew. `update()` merges the style fields given, and replaces the text if `content` is given.

#### `Matrix` (type)

*Under the 0.x promise.*

```ts
type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number]
```

A 2D transform in SVG order: x′ = a·x + c·y + e, y′ = b·x + d·y + f. Build one with [`matrix`](#matrix).

#### `EffectSlots<D>`

```ts
interface EffectSlots<D> {
  readonly hover?: EffectOption<D>;
  readonly enter?: EffectOption<D>;
  readonly update?: EffectOption<D>;
  readonly exit?: EffectOption<D>;
  readonly decorate?: EffectOption<D>;
}
```

The `on` option of the charts and adapters: an effect, or a preset's name, for each slot ([architecture.md](architecture.md#events-and-effect-slots)).

| Slot | Runs | Until |
| --- | --- | --- |
| `hover` | on pointer hover or keyboard focus | leave; cleared during a data change and replayed after it |
| `enter` | when a mark appears | it's triggered again, or the mark exits |
| `update` | when a mark's values change (not on a re-sort alone) | it's triggered again, the chart's next update, or the mark exits |
| `exit` | before a mark is removed, which waits for it | it finishes |
| `decorate` | from enter, for lasting effects such as `threshold` | the mark exits; it follows every change |

The chart's next update ends the `update` runs of the marks it leaves alone too, so a `delta` goes with it. An update is a chart's `update()` with `data`, even if no value changed, or one that changes a value or adds or removes a mark; or an attachment's `refresh()` that finds a new row, a new value, or a mark entering or leaving. `update({ on })` alone, a re-sort, a resize, `reveal()`, and a `refresh()` that finds nothing new keep them. To keep something past the next update, put it in `decorate`.

An unknown preset name, a transition effect in a slot, or a slot that doesn't exist throws when the chart is made, and makes `update({ on })` reject.

#### `EffectSlot`

```ts
type EffectSlot = "hover" | "enter" | "update" | "exit" | "decorate"
```

#### `EffectOption<D>`

```ts
type EffectOption<D> = MarkEffect<D> | PresetName
```

What a slot takes.

#### `PresetName`

```ts
type PresetName = "wiggle" | "pulse" | "flash" | (string & {})
```

A registered preset's name. The built-in names autocomplete, and other names are allowed, for [`registerPreset()`](#registerpreset), so a misspelled one isn't a type error: the chart throws when it's made.

### Geometry

The builders that describe a mark, and the helpers effects draw with ([architecture.md](architecture.md#builders)). Our charts and the adapters use the same builders, so a bar is described the same way whoever drew it. Bad input, such as a negative width or a `NaN`, throws a `RangeError` that names the builder and the field.

```ts
import { describe, matrix, offset } from "expressive-charts";

const bar = describe.bar({
  key: "Okafor", x: 0, y: 0, width: 220, height: 22, baseline: "left", radius: 4, gap: 2,
  segments: [{ series: "goals", size: 160 }, { series: "assists", size: 60 }]
});
bar.path(0.5);                                    // halfway along the bar, on screen
bar.segments?.[1]?.slice(0, 1);                   // path data along the assists segment
offset(bar.end, bar.angle(1) - Math.PI / 2, 8);   // 8 px to the up side of the tip
matrix.rotate(Math.PI / 12, bar.pivot);           // 15° clockwise about the baseline

const slice = describe.arc({ key: "Saved", cx: 0, cy: 0, inner: 70, outer: 116, start: 0, end: Math.PI / 2 }); // d3.pie() angles
```

#### `describe`

*Under the 0.x promise.*

```ts
const describe: {
  bar(spec: BarSpec): MarkGeometry;
  arc(spec: ArcSpec): MarkGeometry;
  line(spec: LineSpec): MarkGeometry;
  point(spec: PointSpec): MarkGeometry;
}
```

Each builder returns a [`MarkGeometry`](#markgeometry):

| | `describe.bar` | `describe.arc` | `describe.line` | `describe.point` |
| --- | --- | --- | --- | --- |
| Walk | the middle of the baseline edge to the middle of the tip | the start angle to the end angle, on the mid-radius arc | the first point to the last | none: length 0 at the point |
| `thickness` | across the bar | `outer − inner` | `width` | `2r` |
| `outline` | the rectangle, its tip rounded | the annular sector | the stroke, open, less its gaps | the circle |
| `pivot` | the middle of the baseline edge | the centre | the first point | the point |
| `segments` | at least one | none | none | none |

Path data uses absolute `M`, `L`, `A` and `Z` only, with numbers rounded to 0.001 px.

#### `BarSpec`

*Under the 0.x promise.*

```ts
interface BarSpec
```

- `key`: `string`, required.
- `series`: `string`. The series of a bar with one segment.
- `x`, `y`, `width`, `height`: `number`, required. The whole bar's rectangle, in chart px.
- `baseline`: `Baseline`, required. The edge it grows from.
- `radius`: `number`. Default 0. Rounds the two tip corners; the baseline end stays square.
- `segments`: `readonly BarSegmentSpec[]`. Its parts, from the baseline. Default: one segment named after `series`, the whole bar. Sizes past the tip are cut off, and a series named twice throws an `Error`.
- `gap`: `number`. Default 0. Px left empty between segments, out of the start of the later one, so each still ends at its value; it shrinks when the part before it is shorter.
- `labelBounds`: `readonly Rect[]`. The boxes of the bar's own labels, in chart px, passed through as the geometry's `labelBounds`. Its segments have none.

#### `BarSegmentSpec`

*Under the 0.x promise.*

```ts
interface BarSegmentSpec {
  readonly series: string;
  readonly size: number;
}
```

One segment of a bar: its series, and its length along the walk in px, gap included.

#### `Baseline`

*Under the 0.x promise.*

```ts
type Baseline = "left" | "right" | "top" | "bottom"
```

The edge a bar grows from: `"left"` and `"right"` for horizontal bars (`"right"` for a negative one), `"bottom"` and `"top"` for columns.

#### `ArcSpec`

*Under the 0.x promise.*

```ts
interface ArcSpec
```

- `key`: `string`, required. `series`: `string`.
- `cx`, `cy`: `number`, required. The centre.
- `inner`, `outer`: `number`, required. Radii in px; an inner of 0 makes a pie slice. Given the wrong way round, they're swapped, as `d3.arc()` does.
- `start`, `end`: `number`, required. Radians from 12 o'clock, clockwise: the `d3.pie()` convention, so its output plugs straight in. An `end` before `start` walks anticlockwise; more than a full turn draws one ring.
- `labelBounds`: `readonly Rect[]`. The boxes of the slice's own labels, passed through as the geometry's `labelBounds`.

#### `LineSpec`

*Under the 0.x promise.*

```ts
interface LineSpec {
  readonly key: string;
  readonly series?: string;
  readonly points: readonly Point[];
  readonly breaks?: readonly number[];
  readonly width?: number;
  readonly labelBounds?: readonly Rect[];
}
```

A polyline through `points` (at least one), in chart px, with straight legs. `breaks` are the indices of the points that start a new run, so there's a gap in the geometry's [`gaps`](#markgeometry) from `points[i - 1]` to `points[i]`, and the stroke leaves it out: each a whole number from 1 to the last index, in order, with no repeats, or it throws a `RangeError` naming it. A line drawn with d3's `.defined()` is described by its defined points and the indices where they break. Default none. `width` is its stroke width, default 1. `labelBounds`, the boxes of its own labels (an end label), is passed through as the geometry's.

#### `PointSpec`

*Under the 0.x promise.*

```ts
interface PointSpec {
  readonly key: string;
  readonly series?: string;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly labelBounds?: readonly Rect[];
}
```

A dot of radius `r`. Its walk has length 0, so `travel` and `trace` do nothing on it, while `wiggle`, `pulse` and `flash` still work. `labelBounds`, the boxes of its own labels, is passed through as the geometry's.

#### `matrix`

*Under the 0.x promise.*

```ts
const matrix: {
  translate(x: number, y: number): Matrix;
  rotate(radians: number, about?: Point): Matrix;
  scale(sx: number, sy?: number, about?: Point): Matrix;
  multiply(...matrices: Matrix[]): Matrix;
  apply(m: Matrix, point: Point): Point;
}
```

Builds and applies [`Matrix`](#matrix-type) transforms, for `mark.set({ transform })` and `IconHandle.place()`. Positive rotations turn clockwise on screen, as SVG's `rotate()` does. `scale` takes `sy` equal to `sx` when it's left out, and `rotate` and `scale` keep `about` fixed (default the origin). `multiply(a, b, c)` composes like the SVG transform list `"a b c"`: `c` applies first. With no arguments it's the identity.

#### `offset()`

*Under the 0.x promise.*

```ts
offset(point: Point, angle: number, distance: number): Point
```

The point `distance` px from `point` in the direction `angle`, in screen radians. `offset(mark.end, mark.angle(1) - Math.PI / 2, 8)` is 8 px to the up side of a mark's end.

#### `samplesAlong()`

```ts
samplesAlong(mark: MarkGeometry, points: readonly SamplePoint[]): Sample[]
```

Data effects' samples for a mark the library didn't draw: each point, in the mark's coordinates, is projected onto the nearest point of the mark's walk, and the samples come back in `t` order. A point on the walk, such as a vertex of the polyline the page drew, lands exactly where it is, so [`threshold`](#threshold)'s crossings are exact on a line described from the points that drew it. On a mark with `gaps`, the first sample past each gap's middle has `gapBefore`. It's for [`expressive()`](#expressive)'s `samples`. Throws a `TypeError` if `mark` isn't a geometry or `points` isn't an array, and a `RangeError` for a point whose `x`, `y` or `value` isn't finite.

#### `SamplePoint`

```ts
interface SamplePoint {
  readonly x: number;
  readonly y: number;
  readonly value: number;
  readonly at?: string | number | Date;
}
```

A data point where the page drew it, with its value and, optionally, the x behind it.

### Effects

The built-in effects and the combinators that put effects together ([architecture.md](architecture.md#effects)). Each is a function that returns an effect, for an effect slot (`on`) of a chart or an adapter; `morph()` is for a [`chartSwitch`](#chartswitch). Each checks its options when it's made, and throws a `RangeError` for a bad one. Every effect has an end state, which is what reduced motion shows.

```ts
import { barChart, lineChart, only, parallel, sequence, stagger, pulse, threshold, travel } from "expressive-charts";
import { cleat, soccerBall } from "expressive-charts/icons/sport";

barChart("#goals", {
  label: "Goals and assists by player", data: players, y: "name", stack: ["goals", "assists"],
  on: {
    hover: sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" })), // the ball, then the boot
    update: "flash",                                                                              // a preset, by name
    enter: stagger(pulse({ times: 1 }))                                                           // each bar a little after the last
  }
});
lineChart("#xg", {
  label: "Goals vs expected goals", data: weeks, x: "week", series: ["goals", "xg"],
  on: { decorate: only("goals", parallel(threshold({ compareTo: "xg" }), travel(soccerBall, { ride: "on" }))) }
});
```

#### `travel()`

```ts
travel(icon: Icon | string, options?: TravelOptions): GeometryEffect
```

Carries an icon along the mark's walk, or along one segment, and leaves it resting at the end: a ball rolling out a bar, round a donut slice or along a line ([architecture.md](architecture.md#travel)). `icon` is an [`Icon`](#icon) or a registered icon's name, looked up each time the effect runs; an unknown name throws then, and the chart reports it. The icon is inset by its footprint, so it stays inside the mark. A trip takes `max(260 ms, distance ÷ 360 px/s)` base, with `"effect"` timing, times its gait's pace, and at most 4 s, eased by the gait or `easeOutCubic`. So past 1,440 px at pace 1 the icon goes faster, not longer, and a trip ends within 5 s even behind `stagger`. A missing segment, or a walk under 0.5 px, makes it a no-op that finishes at once. Across a gap in the walk it jumps, never drawn over the gap, and its trip's time counts only the walk it's drawn on. Its end state is the icon resting at the end, at the last value, and it follows the mark when the mark moves. Options: [`TravelOptions`](#traveloptions). A non-icon throws a `TypeError`.

#### `TravelOptions`

```ts
interface TravelOptions
```

- `along`: `string`. A segment's series (`"goals"`). Default: the whole walk. A mark with no segments counts as its own one segment.
- `gait`: `Gait | GaitName`. How the icon moves. Default: the icon's own gait, else `"slide"`.
- `size`: `number | "fit"`. The icon's length along the walk in px, or `"fit"`: 85% of the mark's thickness across. Default: the icon's own size.
- `orient`: `"auto" | "follow" | "level"`. Default `"auto"`: turns with the walk, but mirrors an `upright` icon instead of turning it upside down. `"follow"` always turns, `"level"` never does.
- `ride`: `"center" | "on"`. Default `"center"`: the icon's anchor on the walk. `"on"` sits the icon on top of it, as a ball rides a line.

#### `gaits`

```ts
const gaits: {
  roll(): Gait;
  step(options?: StepOptions): Gait;
  slide(): Gait;
}
```

How an icon moves as it travels. `roll()` spins it by the distance over its radius. `step()` takes a whole number of steps, at least one, each lifting it the same height and raising its front a little less as the trip goes on, eased in and out and 15% slower, as a boot walks. `slide()` keeps it still. `gaits.step()` throws a `RangeError` for a bad option.

#### `Gait`

```ts
interface Gait {
  (state: GaitState): GaitPose;
  readonly ease?: Easing;
  readonly pace?: number;
}
```

A function from the trip so far to the icon's pose, with the trip's easing (default `easeOutCubic`) and a factor on its duration (default 1). Distances are in the icon's own units, so a gait looks the same at any size.

#### `GaitName`

```ts
type GaitName = "roll" | "step" | "slide"
```

The gaits by name, as an icon's `gait` and `travel`'s `gait` option name them.

#### `GaitState`

```ts
interface GaitState {
  readonly distance: number;
  readonly length: number;
  readonly progress: number;
  readonly radius: number;
}
```

Where the icon is on its trip: how far it has gone, the whole trip (0 when it doesn't move), `distance ÷ length` from 0 to 1, and the icon's rolling radius.

#### `GaitPose`

```ts
interface GaitPose {
  readonly lift: number;
  readonly spin: number;
  readonly tilt: number;
}
```

How the icon is held: raised `lift` towards its up side, in icon units; `spin` about its pivot in radians, positive rolling forward; and `tilt` about its pivot in radians, positive raising its front.

#### `StepOptions`

```ts
interface StepOptions
```

- `stride`: `number`. Default 42. Distance per step, in icon units; more than 0.
- `lift`: `number`. Default 3.2. Height of each step, in icon units; 0 or more.
- `tilt`: `number`. Default 9. The most the front is raised, in degrees.

#### `flash()`

```ts
flash(options?: FlashOptions): GeometryEffect
```

Marks a change with one blink of a halo along the mark's outline: the stroke grows to `width` a quarter of the way through, then narrows back to nothing, over 900 ms base with `"effect"` timing ([architecture.md](architecture.md#flash)). It's the `"flash"` preset, for the `update` slot, where it runs on the marks whose values changed. Its end state is nothing: what it points at stays on the chart.

#### `FlashOptions`

```ts
interface FlashOptions
```

- `width`: `number`. Default 8. The halo's widest stroke in px; half of it shows outside the mark.
- `opacity`: `number`. Default 0.35. More than 0, at most 1.
- `color`: `Color`. Default: the mark's own colour.

#### `wiggle()`

```ts
wiggle(options?: WiggleOptions): GeometryEffect
```

Rocks the mark about its pivot (a bar on its baseline, a slice about the centre) in three dying half-swings over 450 ms base, with `"effect"` timing ([architecture.md](architecture.md#wiggle)). No part of it moves more than `swing` px, so it can't misstate a value. It's the `"wiggle"` preset, for `hover`. Its end state is no transform: the mark as the chart drew it.

#### `WiggleOptions`

```ts
interface WiggleOptions {
  readonly swing?: number;
}
```

`swing`: how far the point of the mark farthest from its pivot may move, in px. Default 3, the most allowed; more than 0.

#### `pulse()`

```ts
pulse(options?: PulseOptions): GeometryEffect
```

Draws attention with halos that widen from the outline while they fade, 600 ms base each with `"effect"` timing ([architecture.md](architecture.md#pulse)). It never changes the mark's size, and it ends within 5 s however a page scales its motion: pulses that wouldn't are dropped. It's the `"pulse"` preset. Its end state is nothing.

#### `PulseOptions`

```ts
interface PulseOptions
```

- `times`: `number`. Default 2. A whole number from 1 to 6.
- `width`: `number`. Default 12. The halo's widest stroke in px.
- `color`: `Color`. Default: the mark's own colour.

#### `trace()`

```ts
trace(options?: TraceOptions): GeometryEffect
```

A highlighter: a stroke drawn along the mark's walk, from its start to its end, which stays ([architecture.md](architecture.md#trace)). It's drawn in over 500 ms base with `"effect"` timing, eased in and out, in the overlay, so the mark itself is untouched and it's safe in any slot. On a stack it runs the whole walk; on a point, whose walk has no length, it draws nothing and finishes at once. It follows the mark when the mark moves. Its end state is the whole stroke. It isn't a preset.

```ts
import { barChart, trace } from "expressive-charts";

barChart("#goals", { label: "Goals by player", data: players, y: "name", x: "goals", on: { hover: trace({ width: 4 }) } });
```

#### `TraceOptions`

```ts
interface TraceOptions
```

- `color`: `Color`. Default `"mark"`, the mark's own colour (a stack's first segment's).
- `width`: `number`. Default 3. The stroke's width in px; 0 or more.
- `opacity`: `number`. Default 0.5. From 0 to 1.
- `duration`: `number`. Default 500. Base ms to draw the stroke, before the motion mode scales it; 0 or more.

#### `delta()`

```ts
delta<D = unknown>(options?: DeltaOptions<D>): DataEffect<D>
```

A data effect for the `update` slot: the change since the last update, as text past the end of the mark ([architecture.md](architecture.md#delta-and-label)). The change is `value(data) − value(data.previous)`, worded by `format`: "+2" past a bar's value label, centred above a column's, past a line's end label, outside a slice's label. It rises 8 px into place and fades in over 400 ms base with `"effect"` timing, then stays until its chart's next update clears it, whether or not that update changes its mark, following the mark as it moves. `data.previous` is the values the last update gave, so an update that replaces one still moving says "+1", not the change from part way. Its end state is the text in place, so reduced motion shows the change. With no `previous`, or no change (float noise counts as none), it draws nothing. The text is in the theme's `"text"` colour, never the series'.

The text goes in the overlay, which screen readers don't read: a page that relies on it says the same in its table or its announcement. On a line chart, `update` runs on the points whose values changed too, so a change meant for the line goes in [`only()`](#only) with a filter on the mark's length:

```ts
import { barChart, delta, flash, lineChart, only, parallel } from "expressive-charts";

barChart("#goals", { label: "Goals by player", data: players, y: "name", x: "goals", on: { update: parallel(flash(), delta()) } });
lineChart("#xg", {
  label: "Goals vs expected goals", data: weeks, x: "week", series: ["goals", "xg"],
  on: { update: only((mark) => mark.length > 0, delta()) } // the lines, not their points
});
```

#### `DeltaOptions<D>`

```ts
interface DeltaOptions<D = unknown>
```

- `value`: `(data: MarkData<D>) => number`. The mark's value. Default: its last sample's, so a bar's total, a line's value at its revealed end, and a slice's share (from 0 to 1). Typed by the rows it reads, so `delta({ value: (data) => data.datum.goals })` fits a chart of rows with `goals`.
- `format`: `(change: number) => string`. Words the change. Default: the page's locale, with its sign and at most two decimals (`+2`, `-0.3`). A page with its own units passes its own, such as a slice's share as `+5%`; `""` draws nothing.
- `color`: `Color`. Default `"text"`.

A `value` or `format` that isn't a function throws a `TypeError`, and a bad `color` a `RangeError`.

#### `label()`

```ts
label<D = unknown>(text: (data: MarkData<D>, mark: MarkGeometry) => string | undefined, options?: LabelOptions): DataEffect<D>
```

A data effect, usually for `decorate`: text worked out from the mark's own data, past the end of the mark, as `delta` places it ([architecture.md](architecture.md#delta-and-label)). `text` returns the words, or `undefined` or `""` for none: the last value minus the first on a slope, a step's own signed value, or a field such as `vsLastMonth`. It's typed by the rows it reads, as [`defineDataEffect<D>`](#definedataeffect) is, so a `label` for one kind of row is a type error on a chart of another. It rises into place as `delta` does, then follows every change, its text worked out again from the new data. Its end state is the text in place.

As with `delta`, the text isn't read by screen readers, and on a line chart `decorate` runs on the points too, so a label meant for the line goes in [`only()`](#only):

```ts
import { label, lineChart, only } from "expressive-charts";

lineChart("#xg", {
  label: "Goals vs expected goals", data: weeks, x: "week", series: ["goals", "xg"],
  on: { decorate: only((mark) => mark.length > 0, label((data) => `${data.samples.length} weeks`)) }
});
```

#### `LabelOptions`

```ts
interface LabelOptions {
  readonly color?: Color;
}
```

`color` defaults to `"text"`. A `text` that isn't a function throws a `TypeError`, and a bad `color` a `RangeError`.

#### `threshold()`

```ts
threshold(options: ThresholdOptions): DataEffect
```

A data effect that colours the parts of a mark's walk where its values are below a reference (or above it), at the mark's full thickness, each part ending exactly where the values cross ([architecture.md](architecture.md#threshold)). The reference is a number or a related series' name, which goes in `needs.related`, so a chart without that series throws when it's made. A series is matched by each sample's `at` when every sample of both has a number or a `Date` there, and by `t` otherwise. Nothing is interpolated across a sample with `gapBefore`, the mark's or the reference's, so where either has no value nothing is coloured. It's an encoding rather than motion: it draws at once, redraws on every change, and shows the same with motion off, so it belongs in `on.decorate`. It reads no row fields, so it fits any chart.

#### `ThresholdOptions`

```ts
interface ThresholdOptions
```

- `compareTo`: `number | string`, required. A finite number, or a related series' name (`"xg"`).
- `when`: `"below" | "above"`. Default `"below"`. Equal values aren't coloured.
- `color`: `Color`. Default `"negative"`.

#### `morph()`

```ts
morph(options?: MorphOptions): TransitionEffect
```

A transition effect that turns one mark's shape into another's: the default transition of a [`chartSwitch`](#chartswitch) ([architecture.md](architecture.md#morph)). Two closed outlines (bars, slices, points) are sampled at `points`, and each point moves in a straight line to its partner, as one filled path in the mark's colour; two lines morph along their strokes, their width too; an area and a line crossfade. It takes 950 ms base with `"transition"` timing, eased in and out, and a run from `ctx.start` takes the rest of a full run's time, so a switch back retraces. Its end state is the target's own outline.

#### `MorphOptions`

```ts
interface MorphOptions {
  readonly points?: number;
  readonly align?: MorphAlign;
}
```

- `points`: default 160 (40 a side). A whole multiple of 4.
- `align`: default `"unroll"`. How two closed outlines' sides are matched ([`MorphAlign`](#morphalign)).

#### `MorphAlign`

```ts
type MorphAlign = "unroll" | "drop"
```

`"unroll"` matches each side with the same side: a slice stands up, its outer arc becoming a column's side. `"drop"` turns the matching by a side: a slice's outer arc becomes the column's top, so it settles onto the baseline. Between two marks of the same kind (two bars, two slices) they match alike.

#### `sequence()`

```ts
sequence<E extends readonly AnyMarkEffect[]>(...effects: E): Combined<E>
```

Runs the effects one after another, each starting on the mark's geometry and data as they are when its turn comes. An abort stops the chain, `end()` draws every part's end state in order, and a part with nothing to do finishes at once, so `sequence(travel(ball, { along: "goals" }), travel(cleat, { along: "assists" }))` tells the right story whichever segments a bar shows. A part that isn't a mark effect throws a `TypeError`. Returns a data effect if any part is one ([`Combined`](#combinede)).

#### `parallel()`

```ts
parallel<E extends readonly AnyMarkEffect[]>(...effects: E): Combined<E>
```

Runs the effects together, and finishes when they all have, or rejects with the first part that does. `end()` draws every part's end state, in order. The parts share the run's layer, mark handle and signal, and `mark.set()` merges fields, so they don't undo each other.

#### `only()`

```ts
only<E extends AnyMarkEffect>(filter: string | ((mark: MarkGeometry) => boolean), effect: E): E extends DataEffect<infer D> ? DataEffect<D> : GeometryEffect
```

Runs `effect` only on the marks whose key or series equals `filter`, or for which `filter(mark)` is true, and does nothing on the others. It keeps the effect's kind and `needs`. On a line chart, `only("goals", …)` matches the goals line and its points, and an effect meant for a line does nothing on a point. A `filter` that's neither throws a `TypeError`.

#### `stagger()`

```ts
stagger<E extends AnyMarkEffect>(effect: E, options?: StaggerOptions): E extends DataEffect<infer D> ? DataEffect<D> : GeometryEffect
```

Starts each mark of a batch a little after the one before: the mark at `ctx.batch.index` waits `index × delay` base ms, with `"stagger"` timing, so only in Presentation. The whole spread is at most 500 ms base, so a big batch's delay shrinks, and a batch of one (a hover) never waits. No chart or preset staggers by default, since research finds it rarely helps. It keeps the effect's kind and `needs`, and its end state is the effect's.

#### `StaggerOptions`

```ts
interface StaggerOptions {
  readonly delay?: number;
}
```

`delay`: base ms between one mark's start and the next's. Default 50; 0 or more.

#### `defineEffect()`

*Under the 0.x promise.*

```ts
defineEffect(spec: GeometryEffectSpec): GeometryEffect
```

An effect of your own, from its `run` and `end` ([the guide](effects-guide.md)). It fills in the kind and a `clear()` that does nothing, keeps only `run`, `end` and `clear`, and freezes the effect. A spec without `run` or `end` functions throws a `TypeError`: every effect needs an end state, since reduced motion shows only that. Effects of your own work everywhere the built-in ones do, and `checkEffect()` checks them ([`expressive-charts/testing`](#expressive-chartstesting)).

```ts
import { barChart, defineEffect } from "expressive-charts";

const underline = defineEffect({
  async run(mark, ctx) {
    const line = ctx.layer.path(mark.slice(0, 0), { stroke: "text-muted", width: 2 });
    let drawn = 0;
    ctx.onChange((next) => line.update((mark = next).slice(0, drawn)));
    await ctx.tween({ duration: 300, timing: "effect", update: (p) => line.update(mark.slice(0, (drawn = p))) }).finished;
  },
  end(mark, ctx) {
    const line = ctx.layer.path(mark.slice(0, 1), { stroke: "text-muted", width: 2 });
    ctx.onChange((next) => line.update(next.slice(0, 1)));
  }
});
barChart("#sales", { label: "Revenue by region", data: regions, y: "region", x: "revenue", on: { hover: underline } });
```

#### `GeometryEffectSpec`

*Under the 0.x promise.*

```ts
interface GeometryEffectSpec {
  run(mark: MarkGeometry, ctx: EffectContext): Promise<void>;
  end(mark: MarkGeometry, ctx: EffectContext): void;
  clear?(ctx: EffectContext): void;
}
```

A [`GeometryEffect`](#geometryeffect) without its `kind`, with `clear` optional.

#### `defineDataEffect()`

*Under the 0.x promise.*

```ts
defineDataEffect<D = unknown>(spec: DataEffectSpec<D>): DataEffect<D>
```

A data effect of your own, whose `run` and `end` also get the mark's [`MarkData<D>`](#markdatad). Otherwise as `defineEffect()`; a `needs` that isn't `{ related: [names] }` throws a `TypeError` too. A data effect typed for its rows fits only charts whose rows have its fields.

```ts
import { barChart, defineDataEffect, type EffectContext, type MarkData, type MarkGeometry } from "expressive-charts";

// The player's position at the end of the bar: it reads the rows, so it's typed for them.
function position(mark: MarkGeometry, data: MarkData<Player>, ctx: EffectContext): void {
  const text = ctx.layer.text(data.datum.pos, { at: mark.end, anchor: "start", color: "text-muted" });
  ctx.onChange((next) => text.update({ at: next.end }));
}
const pos = defineDataEffect<Player>({ run: async (mark, data, ctx) => position(mark, data, ctx), end: position });
barChart("#goals", { label: "Goals by player", data: players, y: "name", x: "goals", on: { decorate: pos } });
```

#### `DataEffectSpec<D>`

*Under the 0.x promise.*

```ts
interface DataEffectSpec<D> {
  readonly needs?: { readonly related?: readonly string[] };
  readonly run: (mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext) => Promise<void>;
  readonly end: (mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext) => void;
  readonly clear?: (ctx: EffectContext) => void;
}
```

A [`DataEffect<D>`](#dataeffectd) without its `kind`, with `clear` optional. Its functions are properties, so the row type is checked strictly.

### Icons

Icons are path data plus paint, never raw markup, so any renderer can draw them ([architecture.md](architecture.md#icons)). Shapes face +x with their up side towards −y, in px at the icon's natural size. The sport icons are their own entry, [`expressive-charts/icons/sport`](#expressive-chartsiconssport).

```ts
import { barChart, defineIcon, iconFromSvg, icons, registerIcon, travel } from "expressive-charts";

const pin = iconFromSvg(svgMarkup, { name: "pin", size: 16, anchor: { x: 12, y: 22 } }); // keeps only plain shapes
const tick = defineIcon({ name: "tick", shapes: [{ d: "M-4,0L-1,3L4,-3", stroke: "text", width: 1.5 }], box: { x: -5, y: -4, width: 10, height: 8 }, anchor: { x: 0, y: 0 } });
registerIcon(tick); // now travel("tick") anywhere
barChart("#sales", { label: "Revenue by region", data: regions, y: "region", x: "revenue", on: { hover: travel(icons.arrow, { size: "fit" }) } });
```

#### An icon from an icon set

Icon sets such as Lucide, Heroicons and Tabler give each icon as SVG markup. Copy an icon's SVG from the set's site and pass it to `iconFromSvg()` with a name, a size and an anchor:

```ts
import { barChart, iconFromSvg, registerIcon, travel } from "expressive-charts";

// An icon's SVG as these sets give it: a 24×24 viewBox, stroked in currentColor.
const rising = iconFromSvg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 18 9 12 13 15 20 7"/>
    <polyline points="15 7 20 7 20 12"/>
  </svg>`,
  { name: "rising", size: 18, anchor: { x: 12, y: 12 } }
);
barChart("#sales", { label: "Revenue by region", data: regions, y: "region", x: "revenue", on: { hover: travel(rising) } });
registerIcon(rising); // or by name, in any chart: travel("rising")

// A round icon rolls: its centre on the walk, and the radius of its outer edge, half the stroke included.
const coin = iconFromSvg(svgMarkup, { name: "coin", size: 16, anchor: { x: 12, y: 12 }, radius: 11, gait: "roll" });
```

- **Colour.** `currentColor` becomes the theme's `text` colour, so the icon follows the chart in the light and dark themes, not the page's `color`. To colour it yourself, replace `currentColor` with a colour or a theme token such as `text-muted` or `series-2`. An SVG with no fill draws black, as it would in a page, so give such an icon `fill="currentColor"`. The core icons have a halo in `surface`, so they show on any bar; for one like it, draw the shapes twice, the first with `stroke="surface"` and a wider stroke.
- **`size`** is the icon's length along the walk in px. Its viewBox is scaled to fit, strokes too. `travel(icon, { size: "fit" })` sizes it to each mark instead.
- **`anchor`** is the point that sits on the walk, in the viewBox's units: usually the centre, (12, 12) in a 24×24 viewBox, so the icon runs along the middle of the mark. A pin's anchor is its tip. `travel` keeps the icon inside the mark by its `footprint`, which reaches from the anchor to the box's edges unless it's given.
- **Rolling.** `gait: "roll"` spins the icon by the distance over its `radius`, so set `radius` to the round part's outer edge, in the viewBox's units: 11 for a circle of radius 10 with a stroke 2 wide. Then it turns as a wheel would. The default is half the box's height, 12 in a 24×24 viewBox.
- **What's kept.** Outline icons come through as they look on the set's site, and so do solid ones with a hole (`fill-rule="evenodd"`, as Heroicons' solid style uses) and duotone ones whose lighter part is faded with `opacity`. A set that fades it with `fill-opacity`, `stroke-opacity` or a CSS class loses the fade, so its lighter part draws at full strength: use the set's outline style. Copy one icon's `<svg>`, not a sprite's `<use>`, which is dropped.
- **Licences.** Lucide's licence is ISC, and Heroicons' and Tabler's are MIT. Both let you use the icons in your own work, and both ask for the licence notice to go with copies of them. Check the licence of any set before shipping its icons.

#### `icons`

```ts
const icons: { readonly dot: Icon; readonly arrow: Icon; readonly chevron: Icon }
```

The core icons: a dot, an arrow pointing the way it travels, and a chevron. They're neutral and drawn in theme colours (`surface` and `text`), so they read in light and dark themes and on any series colour. They're registered by name (`travel("arrow")`).

#### `defineIcon()`

```ts
defineIcon(spec: IconSpec): Icon
```

An icon from its parts. It fills the defaults (`pivot` is the anchor, `footprint` reaches from the anchor to the box's edges, `size` is the box's width, `radius` half its height), checks every field, and freezes the icon, since one icon is shared by every run. A missing name throws a `TypeError`, and a bad field a `RangeError` naming it; path data must start with a move and hold only path characters.

#### `IconSpec`

```ts
type IconSpec = Omit<Icon, "footprint" | "pivot" | "size"> & Partial<Pick<Icon, "footprint" | "pivot" | "size">>
```

What `defineIcon()` takes: an [`Icon`](#icon) whose `pivot`, `footprint` and `size` may be left out.

#### `iconFromSvg()`

```ts
iconFromSvg(markup: string, spec: SvgIconSpec): Icon
```

An icon from SVG markup, read as text with no DOM. It keeps only `path`, `circle`, `rect`, `ellipse`, `line`, `polyline` and `polygon`, with their fill, stroke, stroke width, caps and joins, fill rule and opacity (as attributes or in `style`, inherited from groups, whose opacity is multiplied into their shapes'), and applies their transforms. A shape with an opacity of 0 is dropped, and `fill-opacity` and `stroke-opacity` aren't kept. `currentColor`, in any case, becomes the `text` token. Everything else is dropped: scripts, event handlers, `<use>`, text, images, and the contents of `<defs>` and `<clipPath>`. Colours must be plain colours or theme tokens, and path data is written again from its numbers, so nothing from the markup passes through. Markup that isn't a string throws a `TypeError`, and a bad field a `RangeError`. [An icon from an icon set](#an-icon-from-an-icon-set) shows how to pick its spec.

#### `SvgIconSpec`

```ts
type SvgIconSpec = Omit<IconSpec, "shapes" | "box">
```

What `iconFromSvg()` takes besides the markup: the name, and `anchor`, `pivot`, `footprint` and `radius` in the SVG's own units (its viewBox). `size` is the natural length in px: the icon is scaled so its box is that wide. Default: the viewBox's width, unscaled.

#### `Icon`

*Under the 0.x promise.*

```ts
interface Icon
```

- `name`: `string`. What `travel("name")` finds it by, once it's registered.
- `shapes`: `readonly IconShape[]`. Drawn in order, the first at the bottom.
- `box`: `Rect`. Its bounds, in icon space.
- `size`: `number`. Its natural length along the walk, in px.
- `anchor`: `Point`. The point that sits on the walk.
- `pivot`: `Point`. What it spins or tilts around.
- `footprint`: `[behind, ahead]`. How far it reaches along +x from the anchor, which `travel` keeps inside the mark.
- `gait`: `"roll" | "step" | "slide" | undefined`. The gait `travel` uses unless it's given one.
- `radius`: `number | undefined`. Its rolling radius.
- `upright`: `boolean | undefined`. Mirrored instead of turned upside down, as a boot keeps its sole down.

#### `IconShape`

*Under the 0.x promise.*

```ts
interface IconShape
```

One path of an icon. `d`: path data in icon units. `fill`, `stroke`: `Color`; unset draws none (unlike SVG, where an unset fill is black). `width`: the stroke's width in icon units, default 1, so it scales with the icon. `linecap`: `"butt"` (default) or `"round"`. `linejoin`: `"miter"` (default) or `"round"`. `clip`: path data in icon units that clips the shape. `fillRule`: `"nonzero"` (default) or `"evenodd"`, which leaves a hole where the path's parts overlap, as solid icon sets draw them. `opacity`: from 0 to 1, default 1, for the whole shape, its fill and stroke together, as a duotone set fades its lighter part.

#### `IconSource`

*Under the 0.x promise.*

```ts
interface IconSource {
  get(name: string): Icon | undefined;
}
```

Finds icons by name: an effect's `ctx.icons`, filled from the registered icons.

### Presets, icons by name, and settings

A slot can name a preset instead of holding an effect (`on: { hover: "wiggle" }`), and an effect can name an icon (`travel("cleat")`). Both come from page-wide registries: a chart resolves its preset names when it's made, and an effect looks an icon name up each time it runs ([architecture.md](architecture.md#presets-and-icons-by-name)). A later registration replaces an earlier one with the same name.

```ts
import { configure, registerIcons, registerPreset, threshold, wiggle } from "expressive-charts";
import { sport } from "expressive-charts/icons/sport";

configure({ nonce: cspNonce });                        // before any chart: the injected <style> takes it
registerIcons(sport);                                   // travel("soccer-ball"), travel("cleat")
registerPreset("nudge", () => wiggle({ swing: 2 }));    // on: { hover: "nudge" } in any chart
registerPreset("below-target", () => threshold({ compareTo: 10 }));
```

#### `registerPreset()`

```ts
registerPreset(name: string, factory: () => MarkEffect): void
```

Makes `name` usable in any chart's or adapter's `on`. The factory returns a fresh effect, which must work on any rows. The built-in presets are `"flash"`, `"wiggle"` and `"pulse"`, each that effect with its defaults. A factory that isn't a function throws a `TypeError`.

#### `registerIcon()`

```ts
registerIcon(icon: Icon): void
```

Makes an icon usable by its name. The core icons are registered from the start. Anything without a name throws a `TypeError`.

#### `registerIcons()`

```ts
registerIcons(icons: readonly Icon[]): void
```

Registers each icon, as `registerIcons(sport)` does for the sport pack.

#### `configure()`

```ts
configure(options: StyleOptions): void
```

Sets how charts, adapters and controls get their stylesheet, page-wide, since the first one made injects it once per document (`<style data-expressive-charts>`). Call it before creating any. Options left out keep their value. Anything else is set through the CSSOM, which a strict Content-Security-Policy allows ([architecture.md](architecture.md#rendering)). Options that aren't [`StyleOptions`](#styleoptions) throw a `TypeError`.

#### `StyleOptions`

```ts
interface StyleOptions {
  readonly nonce?: string | undefined;
  readonly injectStyles?: boolean | undefined;
}
```

- `nonce`: set on the injected `<style>`, for a policy with a `style-src` nonce. A non-empty string.
- `injectStyles`: default true. `false` injects nothing, and the page loads [`expressive-charts/style.css`](#expressive-chartsstylecss) itself, for a policy that allows no inline styles.

### Charts

The reference charts: bars, a donut and a line, and a switch between views ([architecture.md](architecture.md#reference-charts)). Each draws an `<svg>` in its container, sized to it, with theme colours, a legend, a tooltip, keyboard focus and a data table, and gives every mark a key, so effects and transitions follow the mark, not its place. Each animates its updates by the motion mode: in Presentation the values change first and then the positions, about half a second each; Analysis does both at once in at most 200 ms; Off jumps.

The charts behave alike, so their options and handle are shared: [`ChartOptions<D>`](#chartoptionsd) and [`Chart<D, O>`](#chartd-o).

#### `barChart()`

```ts
barChart<D>(target: string | Element, options: BarChartOptions<D>): BarChart<D>
```

A bar chart in `target`, an element or a selector: horizontal bars or columns, plain or stacked ([architecture.md](architecture.md#bar-chart)). The axis whose values aren't numbers is the category. Options: [`BarChartOptions<D>`](#barchartoptionsd). Returns its handle, [`BarChart<D>`](#barchartd). Options it can't draw throw: a missing value counts as 0, but one that isn't a finite number throws, and so do duplicate keys and a stack that mixes signs.

```ts
import { barChart } from "expressive-charts";

const singular: Record<string, string> = { goals: "goal", assists: "assist" };
const chart = barChart("#goals", {
  label: "Goals by player",                          // the accessible name, required
  data: players,
  y: "name",                                         // not numbers, so it's the category
  stack: ["goals"],
  sort: "value",                                     // the largest total first
  colors: { goals: 1, assists: 4 },                  // palette slots that follow the series, never the rank
  seriesLabels: { goals: "Goals", assists: "Assists" },
  tooltip: (d) => `${d.name}\n${d.goals} goals`,     // text, never HTML
  markLabel: (d, mark) =>                            // each bar's accessible name, so it can say "1 goal"
    `${d.name}: ${mark.values.map((v) => `${mark.format(v.value)} ${v.value === 1 ? singular[v.series] : v.series}`).join(", ")}`,
  markDescription: (d) => d.pos,                     // what the name doesn't say
  table: { columns: [{ label: "Position", field: "pos" }] },
  announce: true,                                    // after an update: "Okafor and Tanaka changed"
  on: { hover: "wiggle", update: "flash" }
});
chart.on("hover", (event) => console.log(event.mark.key, event.data.datum.goals));
await chart.update({ stack: ["goals", "assists"] }); // resolves once the change has settled
await chart.update({ data: afterMatchweek });
```

#### `BarChart<D>`

```ts
type BarChart<D> = Chart<D, BarChartOptions<D>>
```

A bar chart's handle: [`Chart<D, O>`](#chartd-o), whose `update()` takes `BarChartOptions`.

#### `BarChartOptions<D>`

```ts
interface BarChartOptions<D> extends ChartOptions<D>
```

The [shared options](#chartoptionsd), and:

- `x`, `y`: `Accessor<D, number | string>`. A field or a function for each axis. The one whose values aren't numbers is the category: `y: "name", x: "goals"` draws bars, `x: "name", y: "goals"` columns. With `stack`, give only the category. A value read by a function is the series `"value"`.
- `stack`: `readonly NumericKey<D>[]`. Numeric fields stacked from the baseline, in order, each a segment named after its field.
- `sort`: `"none" | "value" | "key" | ((a: D, b: D) => number)`. Default `"none"`, data order. `"value"` puts the largest total first, `"key"` the keys A to Z (numbers in numeric order). Sorting never changes a key or a colour.
- `orientation`: `"horizontal" | "vertical"`. Forces bars or columns; needed when both axes hold numbers.
- `colorBy`: `"series" | "category"`. Default `"series"`. `"category"` gives each bar its own palette slot by its key, as a donut's slices have, so one `colorAssignment()` shared with a donut keeps each category's colour in both. It needs one series: on a stack it throws.
- `room`: `number`. Default 0. Px kept clear past the labels at each end of the value axis that bars reach, for text an effect draws there: a [`delta`](#delta) past a bar's value label, above a column's, or past a negative bar's name. At 320 px, `room: 28` keeps a `delta` inside the chart. Anything but a number of px, 0 or more, throws a `RangeError`.

Bars are 20 px thick in rows of 34 px, so a horizontal chart's height follows its rows unless `height` is given; columns are 300 px high.

#### `donutChart()`

```ts
donutChart<D>(target: string | Element, options: DonutChartOptions<D>): DonutChart<D>
```

A donut chart in `target`: slices of a total, clockwise from 12 o'clock, each labelled outside the ring with its share, and the total in the hole ([architecture.md](architecture.md#donut-chart)). It works as the bar chart does: the arrow keys go round the ring, the table has each share and a total row, and each slice is read as "Saved: 112 shots, 28%". Its slices are `describe.arc` geometry, so effects that run on bars run on them unchanged. Options: [`DonutChartOptions<D>`](#donutchartoptionsd). Returns [`DonutChart<D>`](#donutchartd). A negative or non-finite value throws.

```ts
import { donutChart, travel } from "expressive-charts";
import { soccerBall } from "expressive-charts/icons/sport";

const shots = donutChart("#shots", {
  label: "Shot outcomes",
  data: outcomes,                                    // [{ outcome: "Goal", shots: 58 }, …]
  category: "outcome",                               // names each slice, and is its key
  value: "shots",
  sort: "value",                                     // the largest first
  center: (total, format) => `${format(total)}\nshots`,
  table: { series: { shots: "Shots" } },             // the value column's header
  on: { hover: travel(soccerBall), update: "flash" } // the ball rolls round the slice
});
await shots.update({ data: nextMatch });
await shots.update({ on: { hover: "pulse", update: "flash" } }); // a new hover effect, in place
```

#### `DonutChart<D>`

```ts
type DonutChart<D> = Chart<D, DonutChartOptions<D>>
```

A donut's handle: [`Chart<D, O>`](#chartd-o), whose `update()` takes `DonutChartOptions`.

#### `DonutChartOptions<D>`

```ts
interface DonutChartOptions<D> extends Omit<ChartOptions<D>, "colors" | "markLabel">
```

The [shared options](#chartoptionsd), and:

- `category`: `Accessor<D, string | number>`, required. Names each slice, and is its key unless `key` is given.
- `value`: `Accessor<D, number | null | undefined>`, required. Sizes each slice. A missing value counts as 0. The slices' series is the field's name (`"shots"`), or `"value"` for a function.
- `sort`: `"none" | "value"`. Default `"none"`, data order. `"value"` puts the largest first.
- `center`: `false | ((total, format) => string)`. The text in the hole. Default: the total in `format` over the value's series label ("406" over "shots"). `"\n"` breaks a line, and the first line is drawn large. It's `aria-hidden`, and its text is added to the chart's description.
- `colors`: `ColorAssignment | Readonly<Record<string, number>>`. Palette slots by slice key.
- `markLabel`: `(d: D, slice: SliceSummary) => string`. Words each slice's accessible name, given its share too ([`SliceSummary`](#slicesummary)).

The donut is 300 px high, and as large as the room its labels leave.

#### `lineChart()`

```ts
lineChart<D>(target: string | Element, options: LineChartOptions<D>): LineChart<D>
```

A line chart in `target`: a line per series through one row per x, each ending in a dot and a label that counts as the line moves ([architecture.md](architecture.md#line-chart)). The pointer anywhere over it hovers every series at the nearest x, with a crosshair and a tooltip, and nothing dimmed. It's one tab stop whose arrow keys go x by x, each x read as one image ("12: 15 goals, 14.2 xg"). Each line is a line mark keyed by its series, and each row's value a point mark keyed `"<series>@<row key>"` (`goals@12`), so `only("goals", …)` matches both; an effect meant for a line does nothing on a point. `reveal(x)` shows the data up to x, which is how [`playback()`](#playback) plays it. An `x` that gives `Date`s makes a time axis. Options: [`LineChartOptions<D>`](#linechartoptionsd). Returns [`LineChart<D>`](#linechartd). A missing or non-finite value throws, and so do repeated x values and numbers mixed with dates.

```ts
import { lineChart, only, parallel, threshold, travel } from "expressive-charts";
import { soccerBall } from "expressive-charts/icons/sport";

const xg = lineChart("#xg", {
  label: "Goals vs expected goals, season to date",
  data: weeks,                                       // [{ week: 1, goals: 0, xg: 1.2 }, …]: one row per x
  x: "week",
  series: ["goals", "xg"],
  seriesLabels: { goals: "Goals scored", xg: "Expected goals (xG)" },
  labels: (value, series) => (series === "xg" ? `${value.toFixed(1)} xG` : `${value} goals`),
  legend: { entries: [{ label: "Goals below xG", color: "negative" }] },
  table: { category: "Matchweek", columns: [{ label: "Difference", field: (d) => d.goals - d.xg, after: "values" }] },
  on: { decorate: only("goals", parallel(threshold({ compareTo: "xg" }), travel(soccerBall, { ride: "on" }))) }
});
await xg.update({ data: [...weeks, nextWeek] });     // the new week grows out of the last
xg.reveal(20);                                       // through matchweek 20

// Dates make a time axis: [{ date: new Date("2025-01-01"), visits: 412, average: 398 }, …]
const daily = lineChart("#daily", { label: "Visits per day", data: days, x: "date", series: ["visits", "average"], timeZone: "local" });
daily.reveal(new Date("2025-07-01"));
```

#### `LineChart<D>`

```ts
interface LineChart<D> extends Chart<D, LineChartOptions<D>> {
  reveal(x: number | Date): void;
}
```

A line chart's handle: [`Chart<D, O>`](#chartd-o), and `reveal(x)`, which shows the data up to `x` at once. It's a view, not a data change, so it fires no events: each line ends at `x`, part way between rows, and its decorations follow it, while points past `x` are hidden, can't be hovered or focused, and aren't in `marks()`. The scales, names, table and announcements cover all the data. It's clamped to the rows' range and kept across `update()`; the default, `reveal(Infinity)`, shows everything, rows added later too. On a time axis `x` is a `Date` or its time in ms. NaN or an invalid `Date` throws a `RangeError`.

#### `LineChartOptions<D>`

```ts
interface LineChartOptions<D> extends ChartOptions<D>
```

The [shared options](#chartoptionsd), and:

- `x`: `Accessor<D, number | Date>`, required. Each row's x. Rows are drawn in ascending x, and x values must be unique. `key` defaults to it, a `Date` by its `toISOString()`.
- `series`: `readonly NumericKey<D>[]`, required. The numeric fields drawn as lines, in order.
- `labels`: `false | ((value, series, format) => string)`. The label at each line's end. Default: its value in `format` with its series' label ("52 goals"). `false` turns them off; an empty string shows none.
- `timeZone`: `"UTC" | "local"`. Default `"UTC"`. A time axis's zone: ticks fall on its boundaries, and names, the tooltip and the table say times in it. A date-only value such as `new Date("2026-01-05")` is UTC midnight, so in UTC it's 5 January on every machine. `"local"` follows the viewer's clock.
- `xFormat`: `(x: Date | number) => string`. Words an x for people: in its name, the tooltip's title, the table's row headers and announcements. Default: a medium date in the page's locale ("Jan 5, 2026"), with the time when any x has one; a number as it is. The ticks keep their own wording.

A time axis has ticks on second, minute, hour, day, week, month and year boundaries, each worded for its level in the page's locale ("2026", "Apr", "Feb 8", "3:00 PM"). The chart is 300 px high. `dim` does nothing here.

#### `Chart<D, O>`

```ts
interface Chart<D, O>
```

What every chart's handle has. `O` is its options.

- `update(next)`: `Promise<void>`. Merges `next` into the options and animates to the new state, by the motion mode. It resolves when the change has settled and the marks it removed are gone, or as soon as another `update()` replaces it, carrying on from where everything is. It rejects, changing nothing, on options the chart can't draw or an `on` it can't resolve. `motion` can't change yet.
  - **A new `on`** swaps the effects of the slots it changes, in place: `decorate` starts again on every mark, a held hover replays with the new hover effect once the change settles, and `enter`, `update` and `exit` draw the new effect's end state, so nothing enters again. Focus stays, nothing fires, and a slot given the same effect or preset name keeps playing. The new `on` replaces the old one, so a slot it leaves out is emptied: give every slot you want to keep. An `update()` without `on` keeps the effects; `on: {}` empties every slot.
- `on(type, listener)`: listens for [`MarkEvents`](#markeventsd), and returns a function that stops it.
- `marks()`: `readonly MarkGeometry[]`. The marks on screen, in visual order, part way there while a change plays. Leaving marks are left out.
- `focus(key)`: moves keyboard focus to the mark `key` as a key press would, whatever the last input was: the focus ring shows and its hover plays. On a line chart it's the x's focus stop, for the x's key or one of its points'. A key that isn't on screen does nothing.
- `leave()`: ends the hover, pointer or keyboard, as the viewer moving away would: the emphasis, the dimming, the tooltip and the hover effects end, and `leave` fires for each mark that was hovered. Focus stays where it is, with its ring, as after Escape.
- `labels()`: `readonly ChartLabel[]`. Each mark's labels as drawn now, in the marks' visual order ([`ChartLabel`](#chartlabel)).
- `element`: `SVGSVGElement`. The chart's `<svg>`.
- `destroy()`: clears every effect and removes the chart.

#### `ChartOptions<D>`

```ts
interface ChartOptions<D>
```

What every chart takes. The bar, donut and line charts add their own.

- `data`: `readonly D[]`, required. The rows.
- `label`: `string`, required. The chart's accessible name: the `<svg>` is a `role="group"` named by it, and the data table's caption says it.
- `description`: `string`. The chart's accessible description.
- `key`: `Accessor<D, string | number>`. Each mark's identity, which effects and transitions follow. Default: the category (a line chart's x). Numbers are converted with `String()`; duplicates throw.
- `motion`: `Motion | MotionMode`. Default: the page-wide `motion`. A mode is this chart's author default: the viewer's choice on the page-wide motion and the device's reduced-motion setting still win.
- `on`: `EffectSlots<D>`. Effects or preset names by slot ([`EffectSlots`](#effectslotsd)).
- `format`: `(value: number) => string`. Words values and the value axis's ticks. Default: the page's locale, to at most two decimals.
- `colors`: `ColorAssignment | Readonly<Record<string, number>>`. Palette slots (1 to 8) by series, pinned (`{ goals: 1, assists: 4 }`) or shared ([`colorAssignment()`](#colorassignment)). Colours follow the entity, never its rank. Default: slots in the order series are first seen.
- `seriesLabels`: `Record<string, string>`. Names for people, by series: `{ xg: "Expected goals" }`, used as given wherever the chart names a series (the legend, the table's headers, the default tooltip and names, announcements). A series without one goes by its field's name, and a value read by a function is the series `"value"`.
- `width`, `height`: `number`. Fixed size in px. Default: the container's width, followed as it changes, and each chart's own height.
- `dim`: `boolean`. Default true. Dims the other marks' bodies while one is hovered (to `--ec-dim-opacity`), not their labels, which keep their contrast. The hovered mark's emphasis stays either way.
- `legend`: `boolean | LegendOptions`. Default true: a swatch and a name for each series above the chart, when there are two entries or more. A donut, or bars with `colorBy: "category"`, list their categories instead, even one. `{ entries }` adds the page's own ([`LegendOptions`](#legendoptions)); `false` turns it off.
- `tooltip`: `boolean | ((d: D) => string)`. Default true: the category, each value in `format` with its label, and a stack's total, beside the hovered or focused mark. A function gives a row's text instead, with `"\n"` for line breaks, set as text and never as HTML; an empty string shows none. Escape hides it.
- `markLabel`: `(d: D, mark: MarkSummary) => string`. Words each mark's accessible name, which by default is the category and each value: "Okafor: 16 goals, 4 assists" ([`MarkSummary`](#marksummary)). An empty result, or a throw (reported), keeps the default, so a mark is never unnamed.
- `markDescription`: `false | ((d: D) => string)`. Each mark's accessible description: what its name doesn't say. Default: a tooltip function's text. `false` describes nothing.
- `table`: `boolean | "hidden" | TableOptions<D>`. Default true: a closed "Data table" after the chart, the fallback every screen reader can read, with the rows in the chart's order. `"hidden"` keeps it out of sight but still read; `false` removes it ([`TableOptions`](#tableoptionsd)).
- `announce`: `boolean | ((change: ChartChange) => string | undefined)`. Default false. A polite live region that sums up each update ("Sorted A to Z. Okafor and Tanaka changed"). A function words it instead ([`ChartChange`](#chartchange)); an empty string or `undefined` says nothing.

The type parameter `D` is taken from `data`; the functions in `on`, `tooltip`, `markLabel`, `markDescription` and `table` don't widen it.

#### `ChartLabel`

```ts
interface ChartLabel
```

A mark's label as a chart draws it, from `labels()`.

- `key`: `string`. The mark's key.
- `role`: `"category" | "value"`. A bar's category or its value, a slice's category or its share, a line's end label (a value).
- `text`: `string`.
- `x`, `y`: `number`. Where its baseline's anchor sits, in the `<svg>`'s viewBox units.
- `anchor`: `"start" | "middle" | "end"`.
- `element`: `SVGTextElement`. The `<text>` itself, so a copy keeps the stylesheet's styling.

Labels that aren't shown, such as a slice's dropped for room, are left out.

#### `ChartChange`

```ts
interface ChartChange {
  readonly text: string;
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly removed: readonly string[];
}
```

What an `announce` function is given as an update starts: `text`, what the chart would say ("" for nothing), and the keys of the marks whose values changed, that appeared and that left. So a page can say "Matchweek 25: Okafor and Tanaka changed".

#### `MarkSummary`

```ts
interface MarkSummary
```

What `markLabel` is given beside the row: the mark as it's heading.

- `key`: `string`.
- `category`: `string`. The category as the axis shows it (a line chart's x, worded).
- `values`: `readonly { series, label, value }[]`. Each series the mark shows, from the baseline, with its name for people and its signed value.
- `total`: `number`. The values added up.
- `format`: `(value: number) => string`. The chart's `format`.
- `text`: `string`. The name the chart gives by default.

#### `SliceSummary`

```ts
interface SliceSummary extends MarkSummary {
  readonly share: number;
}
```

What a donut's `markLabel` is given: a [`MarkSummary`](#marksummary), and the slice's share of the total, from 0 to 1.

#### `MarkEvent<D>`

```ts
interface MarkEvent<D> {
  readonly mark: MarkGeometry;
  readonly data: MarkData<D>;
  readonly batch: { readonly index: number; readonly count: number };
}
```

A mark's event: its geometry, its data, and its place among the marks of the event.

#### `MarkEvents<D>`

```ts
interface MarkEvents<D> {
  enter: MarkEvent<D>;
  update: MarkEvent<D> & { readonly from: MarkGeometry };
  exit: MarkEvent<D>;
  hover: MarkEvent<D> & { readonly source: "pointer" | "keyboard" | "touch" | "linked"; readonly segment?: string };
  leave: MarkEvent<D>;
}
```

The events charts and adapters emit, by type, which `on()` and the effect slots hear alike. Data events fire as a change starts: `enter` and `update` with the new geometry (`update` also with the geometry it starts `from`), `exit` with the geometry on screen. `update` means a mark's values changed, not that it moved. `hover` and `leave` carry the geometry on screen; `hover` says what hovered (`"keyboard"` for focus, `"linked"` for a mark [`link()`](#link) hovered because a mark in another chart was) and which segment is under the pointer.

#### `LegendOptions`

```ts
interface LegendOptions {
  readonly entries?: readonly LegendEntry[];
}
```

`entries` come after the chart's own, for colours the page's effects draw, which a chart can't know about. With entries, a single series is listed too, so its colour is named beside theirs.

#### `LegendEntry`

```ts
interface LegendEntry {
  readonly label: string;
  readonly color: Color;
}
```

A swatch in `color`, a theme token or a CSS colour, named by `label` in the theme's text colour: `{ label: "Goals below xG", color: "negative" }`. `"mark"` and `"mark-strong"` throw, since an entry has no mark.

#### `TableOptions<D>`

```ts
interface TableOptions<D>
```

- `hidden`: `boolean`. Default false. Visually hidden, but still read, as with `table: "hidden"`.
- `columns`: `readonly TableColumn<D>[]`. The page's own columns ([`TableColumn`](#tablecolumnd)).
- `category`: `string`. The category column's header. Default: the category's field name, or "Category" when a function reads it.
- `series`: `Record<string, string>`. Each series' column header, by series: `{ shots: "Shots" }`. Default: its `seriesLabels` name, or the series itself. Only the table changes, so a donut's value column can be named without renaming its slices or its centre.
- `total`: `string`. Default "Total". The header of a stack's total column, or of a donut's total row.
- `share`: `string`. Default "Share". A donut's share column's header.
- `summary`: `string`. Default "Data table". The text that opens the table.

#### `TableColumn<D>`

```ts
interface TableColumn<D> {
  readonly label: string;
  readonly field: Accessor<D, unknown>;
  readonly format?: (value: unknown) => string;
  readonly after?: "category" | "values";
}
```

One of the page's columns: its header, and a field or a function of the row and its index. `format` defaults to numbers in the chart's `format`, anything else as text, and nothing for `null` or `undefined`. `after` defaults to `"category"`, just after the category; `"values"` puts it last, after the series, a total and a share, as a Difference column. A column that throws makes the chart throw, and `update()` reject.

#### `Accessor<D, T>`

```ts
type Accessor<D, T> = KeyOfType<D, T> | ((d: D, i: number) => T)
```

A field of the row whose values are `T`, or a function of the row and its index that returns one.

#### `KeyOfType<D, T>`

```ts
type KeyOfType<D, T> = { [K in keyof D]-?: D[K] extends T ? K : never }[keyof D] & string
```

The field names of `D` whose values are `T`.

#### `NumericKey<D>`

```ts
type NumericKey<D> = KeyOfType<D, number>
```

The field names of `D` whose values are numbers, so `stack: ["name"]` is a type error.

#### `colorAssignment()`

```ts
colorAssignment(fixed?: Record<string, number>): ColorAssignment
```

Palette slots that follow the entity: each key keeps its slot, from 1 to 8, through sorts, filters and updates. `fixed` pins slots by key, and other keys take free ones in the order they're first seen. Charts given the same assignment as their `colors` give an entity one colour in all of them. A pinned slot that isn't a whole number from 1 to 8 throws a `RangeError`.

```ts
import { barChart, colorAssignment, donutChart } from "expressive-charts";

const colors = colorAssignment({ Goal: 1 });         // "Goal" is the same colour as a slice and as a column
donutChart("#share", { label: "Shot outcomes", data: outcomes, category: "outcome", value: "shots", colors });
barChart("#counts", { label: "Shot outcomes", data: outcomes, x: "outcome", y: "shots", colorBy: "category", colors });
```

#### `ColorAssignment` (type)

```ts
interface ColorAssignment {
  slot(key: string): number;
}
```

`slot(key)` is the key's palette slot: its pinned one, or the next free one the first time it's seen, never reassigned. Once every slot is taken, they're used again in turn.

#### `chartSwitch()`

```ts
chartSwitch<T extends ChartSwitchViews>(target: string | Element, options: ChartSwitchOptions<T>): ChartSwitch<T>
```

Views of the same data in one place, one shown at a time, which turns each mark into the mark with its key in the next view: a donut turning into columns ([architecture.md](architecture.md#switching-between-charts)). Each view is a function that draws its chart in the container it's given. Labels move with their shapes and swap their text half way, a key in only one view fades, and the old view's axes, legend and table fade out as the new one's fade in. Only the view shown can be seen, reached or read; focus on a mark moves to its key in the new view; and a switch back mid-way reverses from where the shapes are. A switch takes 950 ms in Presentation and 200 ms in Analysis, and jumps with motion off. Options that aren't a switch's throw a `TypeError`. Returns [`ChartSwitch<T>`](#chartswitcht).

```ts
import { barChart, chartSwitch, donutChart } from "expressive-charts";

const shots = chartSwitch("#shots", {
  views: {
    donut: (el, colors) => donutChart(el, { label: "Shot outcomes, share of total", data: outcomes, category: "outcome", value: "shots", colors }),
    columns: (el, colors) => barChart(el, { label: "Shot outcomes, counts", data: outcomes, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors })
  },
  initial: "donut",
  announce: true                                     // "Shot outcomes, counts" after a switch
});
button.addEventListener("click", () => void shots.show(shots.current === "donut" ? "columns" : "donut"));
await shots.chart("columns").update({ data: nextMatch }); // the bar chart itself
```

#### `ChartSwitch<T>`

```ts
interface ChartSwitch<T extends ChartSwitchViews>
```

- `current`: the view shown, or the one a switch is heading for.
- `show(view)`: `Promise<void>`. Switches to `view`, by the motion mode. It resolves when the switch has landed, or as soon as another `show()` replaces it. A `show()` back to the view a switch is leaving reverses it; one to a third view lands the switch first. It rejects for a view the switch doesn't have.
- `chart(view)`: the chart a view's function returned, typed as it returned it, for `update()` and the rest.
- `destroy()`: ends any switch, destroys every view's chart and removes everything the switch added.

#### `ChartSwitchOptions<T>`

```ts
interface ChartSwitchOptions<T extends ChartSwitchViews>
```

- `views`: `T`, required. The views by name, each drawn once, when the switch is made.
- `initial`: a view's name, required. The view shown first.
- `transition`: `TransitionEffect`. Plays each pair of marks with the same key. Default [`morph()`](#morph). The switch draws the labels and fades on morph's schedule, so one with other timing still plays, but its shapes drift from the labels.
- `colors`: `ColorAssignment | Readonly<Record<string, number>>`. Palette slots by key, given to every view's function. Default: a new assignment.
- `announce`: `boolean`. Default false. A polite live region that says the new view's label after each switch.

#### `ChartSwitchView`

```ts
interface ChartSwitchView {
  readonly element: SVGSVGElement;
  marks(): readonly MarkGeometry[];
  labels(): readonly ChartLabel[];
  focus(key: string): void;
  leave(): void;
  destroy(): void;
}
```

What a switch uses of each view's chart. The bar, donut and line charts' handles have all of it, though a line chart's points don't suit a switch yet. A view's function that returns something without these throws.

#### `ChartSwitchViewFactory`

```ts
type ChartSwitchViewFactory = (container: HTMLElement, colors: ColorAssignment) => ChartSwitchView
```

Draws one view's chart in `container` and returns it. Pass the chart `colors` as its `colors`, so a key has one colour in every view and in the switch's overlay.

#### `ChartSwitchViews`

```ts
type ChartSwitchViews = Readonly<Record<string, ChartSwitchViewFactory>>
```

The views by name.

#### `ChartSwitchViewName<T>`

```ts
type ChartSwitchViewName<T extends ChartSwitchViews> = keyof T & string
```

A view's name.

### Adapters

The same effects on SVG charts drawn by other code: D3, Observable Plot, a hand-written chart, and Vega or Vega-Lite rendered as SVG ([architecture.md](architecture.md#adapters)). An adapter reads keys, rows and geometry from the host's elements, draws on an overlay at the end of its `<svg>`, leaves the host's styling alone unless asked, and puts back everything it changed on `destroy()`.

#### `expressive()`

```ts
expressive<D = unknown>(target: MarkSource<D>, options: ExpressiveOptions<D>): Attachment<D>
```

Attaches effects to SVG marks drawn by other code. `target` is a selector, an element, a list of elements or a D3 selection, whose data types the callbacks ([`MarkSource`](#marksourced)). `<rect>`s are read as bars, stacks included; other shapes take a `geometry` built with [`describe`](#describe). Call `refresh()` after the host redraws, which fires `enter`, `update` and `exit` by key, or pass `watch: true` to follow the host's own transitions frame by frame. Marks it can't read, bad samples and missing series throw before anything changes. Options: [`ExpressiveOptions<D>`](#expressiveoptionsd). Returns [`Attachment<D>`](#attachmentd).

D3 stacked bars, a D3 pie and a D3 line:

```ts
import { describe, expressive, only, samplesAlong, sequence, threshold, travel } from "expressive-charts";
import { cleat, soccerBall } from "expressive-charts/icons/sport";

// bars: the page's selection of its stacked <rect>s. d3.stack() keeps a series' key on its <g>, so the page copies it onto each point:
// .data((series) => series.map((d) => Object.assign(d, { key: series.key }))).
const fx = expressive(bars, {
  key: (d) => d.data.name,                           // required: a player's rects are one mark...
  segment: (d) => d.key,                             // ...whose parts are its series
  value: (d) => d[1] - d[0],                         // what each rect shows, so a resize isn't an update
  keyboard: true,                                    // focusable bars; focus plays the hover effects
  markLabel: (d) => `${d.data.name}: ${d.data.goals} goals, ${d.data.assists} assists`, // each bar read once
  on: { hover: sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" })), update: "flash" }
});
fx.refresh(bars);                                    // after the page redraws: enter, update and exit by key

// slices: <path>s drawn with d3.pie() and d3.arc().innerRadius(70).outerRadius(116), in a <g> at the centre.
expressive(slices, {
  key: (d) => d.data.outcome,
  value: (d) => d.value,                             // or one new value updates every slice
  geometry: (_el, d, key) => describe.arc({ key, cx: 0, cy: 0, inner: 70, outer: 116, start: d.startAngle, end: d.endAngle }),
  keyboard: true,                                    // clockwise from 12 o'clock
  on: { hover: travel(soccerBall) }
});

// lines: a <path> per series, its datum { series, rows }, drawn with the page's x(week) and y(value).
const points = (d: SeriesRows) => d.rows.map((r) => ({ x: x(r.week), y: y(r.value), value: r.value, at: r.week }));
expressive(lines, {
  key: (d) => d.series,
  geometry: (_el, d, key) => describe.line({ key, series: d.series, points: points(d), width: 2 }),
  samples: (d, mark) => samplesAlong(mark, points(d)), // values along the line, for threshold
  dim: true,                                         // the other line fades
  watch: true,                                       // follows a reveal that gives each path its rows every frame
  on: { decorate: only("goals", threshold({ compareTo: "xg" })) } // red wherever goals are below xG
});
```

This line's `geometry` and `samples` are built from the rows bound to each path, so `watch` follows the line only while the page updates those rows every frame, as a reveal does (`paths.datum(…).attr("d", …)` on each frame). A D3 transition that binds the new rows once and interpolates the path's `d` would show only its end: the overlay jumps to the final line. There, describe the line from the element's own path (`describe.line` from points read off it each frame), or call `refresh()` when the transition ends. Rects need nothing: they're read from the element.

**Observable Plot** binds each rect to its row's index, so pass `datum`. Plot draws a new `<svg>` each time, so pass `refresh()` the new one's rects. After a transform that derives new data (`groupY`, `binX`), the index is into Plot's derived rows, not yours: read them through the mark's `render` option instead. A Plot line's path is bound to its series' row indices, with `-1` where Plot breaks the line at a missing value: pass `datum: (el) => el.__data__.filter((i) => i >= 0).map((i) => rows[i])`, a `geometry` from those rows' points through Plot's own scales (`plot.scale("x").apply(r.week)`), and `samples` from `samplesAlong` on the same points. Where Plot leaves a gap, give `describe.line` the `breaks`: the indices, among those rows, of the ones after each `-1`. The accessors are tested against Plot 0.6.17.

```ts
import { expressive } from "expressive-charts";

/** The row index Plot bound to a rect. */
const index = (el: Element) => (el as Element & { __data__: number }).__data__;
const fx = expressive<Player>(plot.querySelectorAll('g[aria-label="bar"] > rect'), {
  datum: (el) => rows[index(el)]!,
  key: (d) => d.name,
  value: (d) => d.goals,
  on: { update: "flash" }
});
fx.refresh(nextPlot.querySelectorAll('g[aria-label="bar"] > rect')); // Plot's next <svg>
```

#### `ExpressiveOptions<D>`

```ts
interface ExpressiveOptions<D>
```

- `key`: `(datum: D, element: Element) => string | number`, required. The mark's identity, which effects and `refresh()` follow. Elements that share a key are one mark's parts, named by `segment`.
- `datum`: `(element: Element) => D`. The element's row. Default: a selection's `data()`, else `element.__data__`, D3's convention.
- `segment`: `(datum: D, element: Element) => string`. Names the parts of a mark that share a key: a stack's series. They're ordered from the baseline.
- `value`: `(datum: D, element: Element) => number | string | boolean | null | undefined`. What an element shows, so `refresh()` can tell a change in values from a new layout: given, an update means a value changed, as on our charts; without it, a length changed, so a resize updates every bar. Return a number or a string.
- `geometry`: `(element: Element, datum: D, key: string) => MarkGeometry`. Describes a mark the adapter can't read (anything but a `<rect>`), with `describe`, in the coordinates of the marks' nearest common ancestor. Called once per mark with its first element.
- `samples`: `(datum: D, mark: MarkGeometry) => readonly Sample[]`. Data effects' values along the mark. Default: rects with a numeric `value` get the bar chart's samples; other marks get none. Bad samples throw.
- `baseline`: `Baseline | "auto"`. Default `"auto"`: the line every rect has an edge on. A rect whose other edge is on it grows the other way, as a negative bar.
- `motion`: `Motion | MotionMode`. As on a chart.
- `on`: `EffectSlots<D>`. As on a chart.
- `keyboard`: `boolean`. Default false. Makes marks focusable as one tab stop: the arrow keys, Home and End move between them in visual order (round a pie, clockwise from 12 o'clock), focus plays the hover effects, and a ring shows.
- `dim`: `boolean`. Default false: the host owns its styling. True dims the other marks while one is hovered, and gives the hovered one its strong colour.
- `markLabel`: `(datum: D, mark: HostMark<D>) => string`. Names each mark for screen readers as one item: its first part becomes `role="img"` with the text as its name, and its other parts are hidden, so a stack isn't read in pieces. Default: the adapter writes no ARIA. With `keyboard`, give it, since a focusable element needs a name. Make the `<svg>` `role="group"`, not `role="img"`.
- `watch`: `boolean`. Default false. Follows the host's own transitions frame by frame, without `refresh()`: once a frame, the marks whose geometry attributes (or whose ancestors' `transform` or `style`) changed are read again, and their effects follow, with no events. Call `refresh()` when the host joins new data, before its transition starts. A `geometry` or `samples` callback should read the element, or rows the host updates every frame: one that reads rows bound once, as a transition's targets, sees only the end. Its cost grows with the marks that move: about 17–19 µs a moving column a frame at 500 columns, which halves the most that stay smooth ([Limits](architecture.md#limits)).

#### `MarkSource<D>`

```ts
type MarkSource<D> = string | Element | ArrayLike<Element> | { nodes(): Element[]; data(): D[]; each?(callback: (datum: D) => void): unknown }
```

What `expressive()` reads marks from: a selector, an element, a list of elements (a `NodeList`, an array), or anything shaped like a D3 selection. `each` is only there for the types, so a D3 selection's row type reaches the callbacks; the adapter never calls it.

#### `Attachment<D>`

```ts
interface Attachment<D>
```

- `refresh(source?)`: reads the marks again, from `source` if it's given and from then on, and fires `enter`, `update` and `exit` by key. A mark that only moved follows without an event. A read that finds a new row, a new value, or a mark entering or leaving is an update, which ends the last one's `update` effects (a `delta`) on the marks it leaves alone; one that finds none keeps them. It throws, changing nothing, on marks it can't read.
- `on(type, listener)`: listens for [`MarkEvents`](#markeventsd), and returns a function that stops it.
- `marks()`: `readonly MarkGeometry[]`. The marks in visual order: bars top to bottom, columns left to right, a pie's slices clockwise from 12 o'clock, other marks described with `geometry` in document order.
- `focus(key)`: with `keyboard`, moves focus to the mark, which plays its hover effects.
- `destroy()`: clears every effect and puts back everything the adapter changed.

#### `HostMark<D>`

```ts
interface HostMark<D> {
  readonly key: string;
  readonly parts: readonly { readonly series: string | undefined; readonly datum: D }[];
}
```

What `markLabel` is given beside the row: the mark's key, and its parts from the baseline (in document order for marks described with `geometry`), each with its `segment` name and row.

#### `fromVegaView()`

```ts
fromVegaView<D = Record<string, unknown>>(view: VegaViewLike, options: VegaOptions<D>): VegaAttachment<D>
```

Attaches effects to a Vega or Vega-Lite chart rendered as SVG, which is vega-embed's default ([architecture.md](architecture.md#vega-and-vega-lite-fromvegaview)). It reads the marks from the View's scenegraph rather than the DOM: rects are bars (stacks included), arcs slices, symbols points and lines lines. It follows the View's own renders, new data or a resize, so there's no `refresh()` to call. The library imports nothing from Vega. A renderer other than SVG, a mark that isn't there, an unreadable mark type, a curved line and a line with a gap throw when attaching. Options: [`VegaOptions<D>`](#vegaoptionsd). Returns [`VegaAttachment<D>`](#vegaattachmentd).

```ts
import { fromVegaView, only, parallel, threshold, travel } from "expressive-charts";
import { soccerBall } from "expressive-charts/icons/sport";

interface SeasonRow { week: number; series: string; value: number }
// view: from await vegaEmbed("#season", spec), a Vega-Lite line with one row per week and series.
fromVegaView<SeasonRow>(view, {
  key: (d) => d.series,                              // required, as for expressive()
  sample: (d) => ({ value: d.value, at: d.week }),   // each point's value, and its week for threshold
  keyboard: true,
  markLabel: (d) => (d.series === "goals" ? "Goals scored" : "Expected goals"),
  on: { decorate: only("goals", parallel(threshold({ compareTo: "xg" }), travel(soccerBall, { ride: "on" }))) }
});
```

#### `VegaOptions<D>`

```ts
interface VegaOptions<D> extends Omit<ExpressiveOptions<D>, "datum" | "geometry" | "watch">
```

[`ExpressiveOptions`](#expressiveoptionsd) without `datum`, `geometry` and `watch`, which the View gives, and:

- `mark`: `string`. Default `"marks"`, the name Vega-Lite gives a chart's data mark. The Vega mark to read, by name.
- `sample`: `(row: D) => VegaSample`. Data effects' values: a line gets a sample at each point, a bar from 0 at its baseline to its value, a slice from 0 to its value, a point its value. Unless `value` is given, it's also what each element shows, so a resize isn't an update. `samples` replaces it.

`key` reads the row's fields: Vega-Lite derives its own rows, so they're new objects on every render.

#### `VegaAttachment<D>`

```ts
interface VegaAttachment<D> extends Omit<Attachment<D>, "refresh"> {
  refresh(): void;
}
```

An [`Attachment`](#attachmentd) whose `refresh()` reads the View again at once. It refreshes itself after each of the View's renders anyway.

#### `VegaViewLike`

```ts
interface VegaViewLike {
  renderer(): string;
  scenegraph(): object;
  container(): Element | null;
}
```

What `fromVegaView()` uses of a Vega `View`: its renderer, its scenegraph and the element it renders into. A View from `vega` or `vega-embed` fits.

#### `VegaMark`

```ts
interface VegaMark {
  readonly marktype?: string;
  readonly name?: string;
  readonly items?: readonly VegaItem[];
}
```

A mark in Vega's scenegraph: its type, its name and its items.

#### `VegaItem`

```ts
interface VegaItem
```

An item of a Vega mark, as its encoders left it: `mark`, `datum` (the row), and the numbers the adapter reads (`x`, `y`, `width`, `height`, `startAngle`, `endAngle`, `innerRadius`, `outerRadius`, `size`, `strokeWidth`, `cornerRadius`, `defined`, `interpolate`). A group's `items` hold the marks inside it.

#### `VegaSample`

```ts
type VegaSample = number | { readonly value: number; readonly at?: string | number | Date }
```

A value for data effects, alone or with where it is along x (`at`), which `threshold` matches series by.

### Linked hover

Hover across charts and attachments, by a value their marks share ([architecture.md](architecture.md#linked-hover)): a column and the line's point at its matchweek, both halves of a butterfly, small multiples.

```ts
import { barChart, expressive, lineChart, link } from "expressive-charts";

const goals = barChart("#goals", { label: "Goals per matchweek", data: weeks, x: (d) => String(d.week), y: "goals", orientation: "vertical" });
const xg = lineChart("#xg", { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"] });
const shots = expressive<Week>("#shots rect", { key: (d) => d.week, dim: true }); // a D3 chart's columns
const linked = link([goals, xg, shots]);             // by matchweek: each column's key, and the line's x
linked.destroy();
link([goals, xg], { by: (event) => event.data.datum.week, effects: false }); // emphasis and dimming only
```

#### `link()`

```ts
link<S extends LinkSource<unknown>>(sources: readonly S[], options?: LinkOptions<D>): Link
```

Links hover across `sources`, charts and attachments whose rows are `D` (a union when they differ). When one is hovered by the pointer, touch or the keyboard, every other one hovers its targets that share a hovered mark's linking value: a line chart its x, a bar chart its bar, a donut its slice, an attachment its mark. They leave when it leaves. Options: [`LinkOptions<D>`](#linkoptionsd). Returns [`Link`](#link-type).

- **A linked mark's hover** is its chart's own: the emphasis, the dimming of the chart's other marks, and its hover effect, with `source: "linked"` on the `hover` event. It gets no tooltip, focus ring or focus, and nothing is announced, so linked hover is visual only: a page that relies on it says the same in its table.
- **One hover a link.** The newest hover anywhere in the link is the one shown, so a chart's own hover ends when another source is hovered. Escape or `leave()` on the hovered source ends every one, and so does Escape with focus on a source that shows a linked hover. `leave()` on a linked source ends only its own.
- **A source mid-change** holds its linked hover and plays it once the change settles, as for any hover. A source with no target for the value hovers nothing.
- **Its limits.** A source can be in one link at a time. A second link, the same source twice, or anything that isn't a chart or an attachment throws a `TypeError`, linking nothing. A [`chartSwitch`](#chartswitch) can't be linked yet. A destroyed source drops out.

#### `LinkOptions<D>`

```ts
interface LinkOptions<D>
```

- `by`: `(event: { mark: MarkGeometry; data: MarkData<D> }) => unknown`. A mark's linking value, read from the hovered marks and from every target's marks in the other sources. Default: its last sample's `at` if it has one (a line point's x), else its key (a bar's or a slice's category, unless the page keys it otherwise). Values are compared as strings, a `Date` by its ISO string, as keys are. `undefined` or `null` links nothing, and so does a throw, which is reported. A value several targets share hovers them all, in one batch.
- `effects`: `boolean`. Default true. False keeps linked marks to emphasis and dimming: their hover effect doesn't play, though their `hover` and `leave` events still fire.

#### `LinkSource<D>`

```ts
interface LinkSource<D> {
  on(type: "hover", listener: (event: MarkEvents<D>["hover"]) => void): () => void;
  marks(): readonly MarkGeometry[];
}
```

What `link()` takes, typed by its rows: a chart ([`barChart()`](#barchart), [`donutChart()`](#donutchart), [`lineChart()`](#linechart)) or an attachment ([`expressive()`](#expressive), [`fromVegaView()`](#fromvegaview)). `link()` checks at run time that each is one of these.

#### `Link` (type)

```ts
interface Link {
  destroy(): void;
}
```

`destroy()` ends the link: linked hovers end, and each source can be linked again. The hovered source's own hover goes on.

### Controls

On-page controls the viewer operates ([architecture.md](architecture.md#controls)). Their styles are in the shared stylesheet, so `configure()` and `style.css` cover them.

```ts
import { motion, motionSwitch } from "expressive-charts";

const control = motionSwitch("#motion", motion, { persist: "site:motion" }); // the viewer's choice, kept across pages
control.destroy();                                                            // removes it; the choice stays
```

#### `motionSwitch()`

```ts
motionSwitch(target: string | Element, motion?: Motion, options?: MotionSwitchOptions): MotionSwitch
```

The viewer's motion control in `target`: Presentation, Analysis and Off as real buttons with `aria-pressed`, in a `role="group"` named by its visible label, and a note on what the mode does, which a screen reader hears after a click ([architecture.md](architecture.md#motion-switch)). A click is the viewer's own choice (`motion.chooseMode()`), so it overrides the device's reduced-motion setting; until then, Off is pressed while the device asks for reduced motion, and the note says why. It follows `motion` (default: the page-wide one), so it stays right whoever changes the mode. A target that isn't an element, or options of the wrong type, throw a `TypeError`. Returns [`MotionSwitch`](#motionswitch-type).

#### `MotionSwitch` (type)

```ts
interface MotionSwitch {
  readonly element: HTMLElement;
  destroy(): void;
}
```

`element` is the switch's `role="group"` root. `destroy()` removes it and stops following the motion; the viewer's choice stays.

#### `MotionSwitchOptions`

```ts
interface MotionSwitchOptions
```

- `label`: `string`. Default "Motion". The group's visible label and accessible name.
- `labels`: `Partial<Readonly<Record<MotionMode, string>>>`. Each button's text. Default "Presentation", "Analysis" and "Off".
- `hints`: `Partial<Readonly<Record<MotionMode | "reduced", string>>>`. The note for each effective mode, and `reduced` for while the device asks for reduced motion and the viewer hasn't picked. The defaults are in English.
- `persist`: `string`. A `localStorage` key, opt-in: the viewer's choice is saved under it and restored when the switch is made, so it carries across pages and visits. `clearChoice()` removes it, and storage that's blocked or full is skipped.

#### `playButton()`

```ts
playButton(target: string | Element, playback: Playback, options?: PlayButtonOptions): PlayButton
```

The pause control a [`playback()`](#playback) needs (WCAG 2.2.2): a real `<button type="button">` in `target` whose text is Play or Pause, for what a click does. It follows `playback.subscribe`, so it goes back to Play at the end, on a seek, or when the page pauses, and it's the same element throughout, so focus stays on it. A target that isn't an element, or a label with no text, throws a `TypeError`. Returns [`PlayButton`](#playbutton-type).

#### `PlayButton` (type)

```ts
interface PlayButton {
  readonly element: HTMLButtonElement;
  destroy(): void;
}
```

`element` is the button. `destroy()` removes it and stops following the playback, which carries on.

#### `PlayButtonOptions`

```ts
interface PlayButtonOptions {
  readonly labels?: Partial<Readonly<Record<"play" | "pause", string>>>;
}
```

`labels`: the button's text, which is its accessible name, by what a click does. Default "Play" and "Pause".

## `expressive-charts/icons/sport`

An optional icon pack, its own entry so the main one doesn't carry it: a ball and a boot, drawn in fixed colours (a white ball is white in any theme). Pass them to `travel()`, or register them to use by name. The script-tag bundle doesn't include them.

```ts
import { barChart, registerIcons, sequence, travel } from "expressive-charts";
import { cleat, soccerBall, sport } from "expressive-charts/icons/sport";

const ballThenBoot = sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" }));
barChart("#goals", { label: "Goals and assists", data: players, y: "name", stack: ["goals", "assists"], on: { hover: ballThenBoot } });
registerIcons(sport); // or by name: travel("soccer-ball"), travel("cleat")
```

#### `soccerBall`

```ts
const soccerBall: Icon
```

A ball named `"soccer-ball"`, 17 px across, centred on the walk. Its gait is `roll`, so it spins as it goes.

#### `cleat`

```ts
const cleat: Icon
```

A boot named `"cleat"`, 26 px long, toe first, its heel at the start of the walk and raised 6 px so it sits in the middle of a bar. Its gait is `step`, and it's `upright`: on a walk heading left it's mirrored, so its sole stays down.

#### `sport`

```ts
const sport: readonly Icon[]
```

Both, for `registerIcons(sport)`.

## `expressive-charts/testing`

The conformance suite the built-in effects pass, for effects of your own, with the helpers it's built on ([architecture.md](architecture.md#testing-effects-without-a-dom), [the guide](effects-guide.md#testing-with-checkeffect)). It imports no test runner, so it works in Vitest, Jest, `node:test` or Mocha, and needs no DOM: effects run on manual clocks and recording layers. Its own entry, not in the script-tag bundle.

```ts
import { defineEffect } from "expressive-charts";
import { checkEffect, fixtures, play, testContext } from "expressive-charts/testing";

const underline = defineEffect({
  async run(mark, ctx) {
    const line = ctx.layer.path(mark.slice(0, 0), { stroke: "text-muted", width: 2 });
    let drawn = 0;
    ctx.onChange((next) => line.update((mark = next).slice(0, drawn)));
    await ctx.tween({ duration: 300, timing: "effect", update: (p) => line.update(mark.slice(0, (drawn = p))) }).finished;
  },
  end(mark, ctx) {
    const line = ctx.layer.path(mark.slice(0, 1), { stroke: "text-muted", width: 2 });
    ctx.onChange((next) => line.update(next.slice(0, 1)));
  }
});
await checkEffect(underline, { name: "underline" }); // rejects with one Error listing every check that failed

const ctx = testContext({ mode: "analysis" });
const ms = await play(ctx.clock, underline.run(fixtures.column, ctx)); // the ms it took, a frame at a time
ctx.layer.picture();                                                   // what's drawn now, as plain data
```

#### `checkEffect()`

*Under the 0.x promise.*

```ts
checkEffect(effect: GeometryEffect | DataEffect<unknown>, options?: CheckEffectOptions<unknown>): Promise<void>
checkEffect<D>(effect: GeometryEffect | DataEffect<D>, options: CheckEffectOptions<D> & { readonly data: (mark: MarkGeometry) => MarkData<D> }): Promise<void>
```

Runs five checks on every mark, the fixtures by default:

1. a full run ends with the same picture and mark style as `end()`;
2. clearing leaves nothing drawn and the mark's own style, with no frames running;
3. an abort part way settles the run, as a resolve, and clears to nothing;
4. with motion off, the run asks for no frames and draws what `end()` draws;
5. after a full run, and after `end()`, a change to the mark moved somewhere else leaves what `end()` draws on the moved mark, so an effect that should stay attached follows `onChange`.

It resolves when every check passes, and otherwise rejects with one `Error` listing every failure: the mark, the check and what differed. A run that throws, doesn't return a promise, or hasn't settled after 10 s fails too. A data effect typed for its own rows needs `data`, and so does one that `needs` related series. Options: [`CheckEffectOptions`](#checkeffectoptionsd).

#### `CheckEffectOptions<D>`

*Under the 0.x promise.*

```ts
interface CheckEffectOptions<D = unknown>
```

- `marks`: `Record<string, MarkGeometry> | readonly MarkGeometry[]`. The marks to check on, named, or a list such as a chart's `marks()`, each named by its key. Default: [`fixtures`](#fixtures).
- `icons`: `readonly Icon[]`. The icons the effect looks up by name. Default: none.
- `data`: `(mark: MarkGeometry) => MarkData<D>`. A data effect's data for each mark. Default: no datum, values from 0 to 1 along the walk, and no related series.
- `moved`: `(mark: MarkGeometry) => MarkGeometry | undefined`. The same mark moved, for check 5; `undefined` skips it. Default: each fixture's moved twin, and nothing for other marks, so a page's own marks pass this or skip the check.
- `batch`: `{ index, count }`. The mark's place in its event, for a staggered effect. Default: the only one.
- `name`: `string`. What the report calls the effect. Default "the effect".

#### `checkTransition()`

*Under the 0.x promise.*

```ts
checkTransition(effect: TransitionEffect, options?: CheckTransitionOptions): Promise<void>
```

The checks for a transition effect, on every pair (the fixture pairs by default), from a to b and from b to a: checks 1 to 4 of `checkEffect()`, a run from `start: 0.5` that ends as `end()` draws, and a retrace: at 0.25, 0.5 and 0.75, a run back from `start: 1 − p` must begin with the picture a run forward from `start: p` begins with, so a switch back mid-way doesn't jump. It resolves or rejects as `checkEffect()` does, naming the pair and the way.

#### `CheckTransitionOptions`

*Under the 0.x promise.*

```ts
interface CheckTransitionOptions
```

- `pairs`: `Record<string, readonly [MarkGeometry, MarkGeometry]> | readonly (readonly [MarkGeometry, MarkGeometry])[]`. Default: [`fixturePairs`](#fixturepairs).
- `icons`: `readonly Icon[]`. Default: none.
- `name`: `string`. Default "the effect".

#### `fixtures`

*Under the 0.x promise.*

```ts
const fixtures: Readonly<Record<FixtureName, MarkGeometry>>
```

One of each kind of mark an effect meets: a bar, a negative bar, a column, a stack with a gap, a 6 px bar, a donut slice, a line, the line with a gap after its second point, and a point. Each has a moved twin for check 5.

#### `FixtureName`

*Under the 0.x promise.*

```ts
type FixtureName = "bar" | "negative bar" | "column" | "stacked" | "short bar" | "slice" | "line" | "gapped line" | "point"
```

#### `fixturePairs`

*Under the 0.x promise.*

```ts
const fixturePairs: Readonly<Record<FixturePairName, readonly [MarkGeometry, MarkGeometry]>>
```

The pairs `checkTransition()` runs on by default: a slice and a column (a mark that goes round its pivot and one that doesn't), a bar and a column, two slices, two lines and two points, the second of two alike being the first's moved twin.

#### `FixturePairName`

*Under the 0.x promise.*

```ts
type FixturePairName = "slice and column" | "bar and column" | "two slices" | "two lines" | "two points"
```

#### `testContext()`

*Under the 0.x promise.*

```ts
testContext(options?: TestContextOptions): TestContext
```

A complete [`EffectContext`](#effectcontext) on a manual clock, recording what the effect draws, for an effect's own tests. It's built on the same run scope the runner gives every run, so its `clear()` is the runner's cleanup. For a transition effect, add `start`: `{ ...testContext(), start: 0.5 }`.

#### `TestContextOptions`

*Under the 0.x promise.*

```ts
interface TestContextOptions
```

- `mode`: `MotionMode`. Default `"presentation"`. The device never asks for reduced motion here.
- `scaling`: `ScalingOverrides`. As a page's `createMotion({ scaling })` gives.
- `icons`: `readonly Icon[]`. What `ctx.icons` finds.
- `batch`: `{ index, count }`. Default: the only one.
- `previous`: `MarkGeometry`. The geometry before an update.

#### `TestContext`

*Under the 0.x promise.*

```ts
interface TestContext extends EffectContext
```

An [`EffectContext`](#effectcontext) whose `motion` is a [`Motion`](#motion-type), `clock` a [`ManualClock`](#manualclock), `layer` a [`RecordingLayer`](#recordinglayer) and `mark` a [`RecordingMark`](#recordingmark), and:

- `abort()`: aborts the run, as the runner does on leave or a re-trigger.
- `clear()`: the runner's cleanup after `effect.clear(ctx)`: aborts, empties the layer, resets the mark and drops `onChange` listeners.
- `change(mark, data?)`: tells `onChange` listeners the mark moved, as the runner does on every frame of a transition.

#### `play()`

*Under the 0.x promise.*

```ts
play(clock: ManualClock, running: Promise<unknown>, options?: PlayOptions): Promise<number>
```

Advances a manual clock a frame at a time until `running` settles, letting promise callbacks run between frames, so a sequence's next part starts on time. Resolves with the ms it advanced, and throws if `running` hasn't settled within the limit.

#### `PlayOptions`

*Under the 0.x promise.*

```ts
interface PlayOptions {
  readonly frame?: number;
  readonly limit?: number;
}
```

`frame`: ms per frame, default 16. `limit`: ms before it gives up, default 10,000.

#### `RecordingLayer`

*Under the 0.x promise.*

```ts
interface RecordingLayer extends Layer
```

A [`Layer`](#layer) that keeps what's drawn: `drawn`, what's there now in creation order, which is also stacking order; `calls`, every call made on it or its handles ([`LayerCall`](#layercall)); `picture(decimals?)`, what's drawn as plain data with numbers rounded (default 3 decimals), to compare a full run with `end()`; and `clear()`, which removes everything.

#### `RecordingMark`

*Under the 0.x promise.*

```ts
interface RecordingMark extends MarkHandle
```

A [`MarkHandle`](#markhandle) that keeps its `style`, after every `set()` and `reset()` (empty means the mark's own), and its `calls` ([`MarkCall`](#markcall)).

#### `Drawn`

*Under the 0.x promise.*

```ts
type Drawn = DrawnIcon | DrawnPath | DrawnText
```

One thing a recording layer holds.

#### `DrawnIcon`

*Under the 0.x promise.*

```ts
interface DrawnIcon {
  readonly kind: "icon";
  readonly id: number;
  readonly icon: Icon;
  readonly size: number | undefined;
  readonly transform: Matrix | undefined;
}
```

An icon, with the size it was drawn at and its last `place()`, `undefined` while it's hidden.

#### `DrawnPath`

*Under the 0.x promise.*

```ts
interface DrawnPath {
  readonly kind: "path";
  readonly id: number;
  readonly d: string;
  readonly paint: Paint;
}
```

#### `DrawnText`

*Under the 0.x promise.*

```ts
interface DrawnText {
  readonly kind: "text";
  readonly id: number;
  readonly content: string;
  readonly style: TextStyle;
}
```

#### `LayerCall`

*Under the 0.x promise.*

```ts
type LayerCall =
  | { readonly op: "icon"; readonly id: number; readonly icon: string; readonly size: number | undefined }
  | { readonly op: "place"; readonly id: number; readonly transform: Matrix }
  | { readonly op: "path"; readonly id: number; readonly d: string; readonly paint: Paint }
  | { readonly op: "update-path"; readonly id: number; readonly d: string; readonly paint: Partial<Paint> | undefined }
  | { readonly op: "text"; readonly id: number; readonly content: string; readonly style: TextStyle }
  | { readonly op: "update-text"; readonly id: number; readonly style: Partial<TextStyle>; readonly content: string | undefined }
  | { readonly op: "remove"; readonly id: number }
  | { readonly op: "clear" }
```

A call on a recording layer or its handles, in order. Calls on removed handles are logged and ignored.

#### `MarkCall`

*Under the 0.x promise.*

```ts
type MarkCall = { readonly op: "set"; readonly style: MarkStyle } | { readonly op: "reset" }
```

A call on a recording mark.

#### `Picture`

*Under the 0.x promise.*

```ts
type Picture =
  | { readonly kind: "icon"; readonly icon: string; readonly size: number | undefined; readonly transform: readonly number[] | undefined }
  | { readonly kind: "path"; readonly d: string; readonly paint: Paint }
  | { readonly kind: "text"; readonly content: string; readonly style: TextStyle }
```

One thing drawn, as `picture()` gives it: without ids, its numbers rounded, an icon by its name.

## `expressive-charts/style.css`

The stylesheet the charts, adapters and controls inject, as a file: the theme tokens and the default rules. A page whose Content-Security-Policy allows no inline styles loads it itself and turns injection off. Bundlers keep the import, since `package.json` lists CSS under `sideEffects`.

```ts
import { configure } from "expressive-charts";
import "expressive-charts/style.css";   // or <link rel="stylesheet" href="…/dist/expressive-charts.css">

configure({ injectStyles: false });     // before any chart: nothing injected
```

Every rule is inside `:where()`, so any rule of the page's wins. The colours are custom properties, set for light on `:root`, for dark when the device prefers it (unless the root has `data-theme="light"`), and for either on any element with `data-theme="light"` or `"dark"`, for its subtree ([architecture.md](architecture.md#rendering)):

| Property | What it colours |
| --- | --- |
| `--ec-text`, `--ec-text-muted` | labels, values, ticks, the tooltip and table text |
| `--ec-surface` | the colour behind the chart, which the library assumes but doesn't paint: the focus ring's gap, the gaps between slices and round a line's dots, and the tooltip's and controls' backgrounds. Set it to match the page |
| `--ec-grid`, `--ec-axis` | gridlines, the axis and the line chart's crosshair |
| `--ec-focus` | the focus ring |
| `--ec-negative` | `threshold`'s default colour |
| `--ec-ring` | hairline borders on the tooltip and controls |
| `--ec-series-1` … `--ec-series-8`, each with `-strong` | the palette slots, and a hovered mark's stronger colour |
| `--ec-dim-opacity` | the opacity of the other marks' bodies while one is hovered (0.3). Their labels keep theirs |

`--ec-hover-duration` is set by each chart from its motion, so hover feedback is instant with motion off. The text effects draw (`delta`, `label`) is `.ec-text` in an `.ec-overlay`: 12.5 px, weight 600, with tabular digits, in `--ec-text`, on our charts and on attachments alike; a page's own rule, such as `#slope .ec-text { font-size: 11px }`, wins. The eight series colours are checked for 3:1 contrast and for colour-vision deficiencies in both themes. A page that puts a chart on a darker background than `--ec-surface` should set `--ec-text-muted` darker there too, since it's 4.6:1 on the light surface.
