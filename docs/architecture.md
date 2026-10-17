# Architecture

This document describes the design. Code that doesn't exist yet is marked as planned. [plan.md](plan.md) has the roadmap and the reasoning behind the decisions.

## Layers

```
          ┌──────────────┐
          │    core      │  clock, easing, tweens, motion modes, shared contracts, geometry, runner
          └──────▲───────┘
        ┌────────┴────────┐
 ┌──────┴──────┐   ┌──────┴──────┐
 │   charts    │   │   effects   │
 │ bar, line,  │   │ travel,     │
 │ donut, ...  │   │ wiggle, ... │
 └─────────────┘   └─────────────┘
```

Charts and effects both depend on core. They never depend on each other. They meet only through two shared contracts: the **mark geometry** and the **event stream**. Because charts and effects can't import each other, the types for both contracts live in core (`src/core/contracts/`), and so does the geometry math that charts use to build marks and effects use to draw (`src/core/geometry/`).

## Core

`src/core` depends on nothing else in the library and doesn't touch the DOM at import time, so the package can be imported in Node. Browser APIs (`requestAnimationFrame`, `matchMedia`) are looked up only when first used, and both can be injected.

### Clock

`createClock(source?)` runs one shared frame loop for the whole page. It requests a frame only while something is subscribed, so an idle page costs nothing. Outside the browser it falls back to a 16 ms timer. `defaultClock` is the page-wide instance. `manualClock()` only moves when a test calls `advance(ms)`, which makes every timing test deterministic.

### Easing

An easing is any `(t: number) => number`. Built in: `easeInOutCubic` for data transitions, `easeOutCubic` for travel and for retargeted animations, and `linear` for playback.

### Tweens

```ts
tween({ duration, timing?, ease?, delay?, update, signal? }, env?) // → { finished, state, cancel(), finish() }
```

- `update` gets eased progress: once with `ease(0)` straight away, then on every frame, then once with `ease(1)` at the end.
- `finished` resolves to `"done"` or `"cancelled"` and never rejects, so rapid hovering can't cause unhandled rejections.
- `cancel()` stops where it is. `finish()` jumps to the end. Aborting `signal` cancels.
- If the motion mode scales the duration to 0, `update(ease(1))` runs synchronously, before `tween` returns.
- If the effective mode turns off while a tween runs (the device switches to reduced motion, or the viewer picks Off), the tween jumps to its end on the next frame.
- If `update` throws, including on the final update, the tween cancels itself and the error is reported once. `finished` never says `"done"` when the last update failed.

### Animated values

```ts
const length = animated(0, interpolateNumber, { onChange });
length.to(16, { duration: 500 });      // → Promise<"done" | "cancelled">
```

An `Animated<T>` is a value that can be retargeted mid-flight. `to()` cancels whatever is running and starts from the current in-between value, so nothing jumps. When it interrupts a running animation, the default ease is ease-out rather than ease-in-out, because restarting an ease-in from a moving value makes the motion stall. `set()` jumps, and `stop()` freezes in place. `target` equals `value` whenever it's at rest, including after a cancellation from outside (an aborted `signal`, or an `onChange` that throws). The interpolators provided are `interpolateNumber`, `interpolatePoint` and `interpolateRecord`. `interpolateRecord` grows keys that appear from 0 and shrinks keys that disappear to 0, which suits stacked segments.

### Motion modes and duration scaling

The modes are `presentation`, `analysis` and `off`. Every duration in the library passes through `motion.duration(base, timing)`, which scales it by the effective mode and by what the duration is for:

| Timing | Used for | Presentation | Analysis | Off |
| --- | --- | --- | --- | --- |
| `feedback` | hover colour and dimming | base | base | 0 |
| `transition` (default) | data changes | base, staged | base × 0.35, max 200 ms | 0 |
| `effect` | travel, wiggle, flash, pulse | base | base × 0.35, min 140 ms, max 300 ms | 0 |
| `playback` | auto-play such as "Play season" | base | base × 0.3 | 0 |

A rule is `{ factor, min?, max? }` and gives `clamp(base × factor, min(base, min), max)`, so a floor never makes an animation longer than its base. `createMotion({ scaling })` accepts partial overrides. `motion.staged` is true only in presentation, and it tells charts to split data changes into stages: values first, then positions.

### Reduced motion

```
effective mode = viewerChoice ?? (prefersReduced ? "off" : requested)
```

- `setMode(mode)` is the page author's default. It never overrides `prefers-reduced-motion`.
- `chooseMode(mode)` is for on-page controls the viewer operates, like the demo's motion switch. The viewer's own choice does override the device setting. `clearChoice()` goes back to following the device.
- `prefers-reduced-motion` is followed live. `subscribe()` notifies on any change and watches the media query only while someone is listening.

`motion` is the page-wide instance every chart follows unless it's given its own.

## Mark geometry

Every mark, whether it's drawn by one of our charts or by another library, is described with the same `MarkGeometry` shape (`src/core/contracts/geometry.ts`). It has two parts:

- **The walk**, from where the data starts to where it ends: `start`, `end`, `length`, `path(t)`, `angle(t)` and `slice(t0, t1)`.
- **The body**: `thickness`, `outline`, `bounds`, `center`, `pivot`, plus ordered `segments` for stacks.

For a bar, the walk is the centre line from the baseline to the tip. For a donut slice, it's the mid-radius arc. For a line, it's the line itself. That's what lets one `travel` effect roll a ball along all three.

### Conventions

- **Space.** Chart pixels: the origin is the chart's top-left corner and y points down. Effects draw their overlay in the same space.
- **Angles** are screen angles: radians, 0 along +x, positive turning clockwise on screen, as `Math.atan2` gives in chart pixels. `angle(t)` is the direction of travel, in (−π, π].
- **Arc length.** `path(t)` is uniform in distance: `t = 0.5` is halfway along the walk on screen, not halfway through the data. Values of `t` outside [0, 1] are clamped. `length` is exact, for arcs too.
- **Up side.** "Up" is the left of the direction of travel, `angle − π/2`. For a bar growing right that's screen up; for a column, screen left; for a negative bar, screen down; for a donut slice walked clockwise, outward.
- **Outline sampling.** A closed outline's `sample(n)` takes n a multiple of 4 and returns n/4 points per side, evenly spaced along each side, clockwise on screen from the start-left corner: the left side (walked in the direction of travel), the end, the right side, then the start. Corners land at indices 0, n/4, n/2 and 3n/4 for any n, so morph can match marks corner to corner. An open outline (a line) returns n points along the stroke, from start to end inclusive.
- **Slices.** `slice(t0, t1)` is SVG path data for that part of the walk, with its ends in either order; equal ends give a bare move that draws nothing.
- **Path data** uses absolute `M`, `L`, `A` and `Z` only, with numbers rounded to 0.001 px. Arcs are split into pieces of at most half a turn, so a full ring still draws.
- **Missing vs zero.** A series that isn't in the stack has no segment. A zero value gives a segment with `length` 0. Effects treat both the same: a walk shorter than 0.5 px finishes at once and draws nothing.
- **Keys.** Segments are keyed `"<mark key>/<series>"`, or `"<mark key>/<index>"` when they have no series.

### Builders

The builders are public. Our charts and the adapters use the same ones, so a bar is described the same way whoever drew it. Bad input (a negative width, a `NaN`) throws a `RangeError` that names the builder and the field.

| | `describe.bar` | `describe.arc` | `describe.line` | `describe.point` |
| --- | --- | --- | --- | --- |
| Input | rectangle, `baseline`, `radius`, `segments`, `gap` | `cx`, `cy`, `inner`, `outer`, `start`, `end` | `points`, `width` | `x`, `y`, `r` |
| Walk | middle of the baseline edge → middle of the tip | start angle → end angle on the mid-radius arc | first point → last point | none: length 0 at the point |
| `angle` | 0, π, −π/2 or π/2 by baseline | the d3 angle (the arc's tangent) | per leg | 0 |
| `thickness` | across the bar | `outer − inner` | `width` (default 1, SVG's default) | `2r` |
| `outline` | rectangle with a rounded tip | annular sector | the stroke, open | circle |
| `pivot` | middle of the baseline edge | the donut centre | first point | the point |
| `segments` | at least one | none | none | none |

```ts
describe.bar({ key: "Okafor", x: 0, y: 0, width: 220, height: 22, baseline: "left", radius: 4, gap: 2,
  segments: [{ series: "goals", size: 160 }, { series: "assists", size: 60 }] });
describe.arc({ key: "Saved", cx: 0, cy: 0, inner: 70, outer: 116, start: d.startAngle, end: d.endAngle });
```

- **Bars.** `baseline` is the edge the bar grows from: `left` and `right` for horizontal bars (`right` for negative values), `bottom` and `top` for columns. `radius` rounds the two tip corners only; the baseline end stays square. `segments` are ordered from the baseline, each `size` px along the walk. A plain bar gets one segment named after its `series`, so `travel(…, { along: "goals" })` works whether or not the chart is stacked.
- **Gaps between segments.** The `gap` comes out of the start of the later segment, so every segment still ends at its value. It shrinks when the segment before it is shorter, and the tip rounding fades in as a segment nears the tip, so a stack that grows or shrinks never jumps. The whole bar's outline is the full rounded rectangle, gaps included.
- **Slices** use the `d3.pie()` convention: radians, 0 at 12 o'clock, clockwise. So pie output plugs straight in, and `angle(t)` equals the d3 angle. As with `d3.arc()`, radii given the wrong way round are swapped and more than a full turn draws one ring. If `end < start`, the walk runs anticlockwise and its up side is inward; the outline is still clockwise.
- **Planned:** `describe.shape(element, spec)`, which walks any SVG shape with `getPointAtLength` in the browser.

### Geometry helpers

For effect authors, experimental until M3:

```ts
matrix.translate(x, y); matrix.rotate(radians, about?); matrix.scale(sx, sy?, about?);
matrix.multiply(a, b, c);  // like the SVG transform list "a b c": c applies first
matrix.apply(m, point);
offset(point, angle, distance); // offset(mark.end, mark.angle(1) - Math.PI / 2, 8) is 8 px to the up side of the tip
```

A `Matrix` is `[a, b, c, d, e, f]` in SVG order. Positive rotations turn clockwise on screen, like SVG's `rotate()`.

The rest of `src/core/geometry` is internal: path segments (lines and circular arcs), walks parameterised by distance, outlines with canonical sampling, and path-data writing. Charts and effects inside the library use it directly.

## Events and effect slots

Charts and adapters emit `enter`, `update`, `exit`, `hover` and `leave` (planned, M1 step 5), each with the mark's geometry, its data and its position in the batch. An `update` event also carries the previous geometry. Effects attach to events through the `on` option, typed `EffectSlots<D>` (`src/core/contracts/slots.ts`); each slot takes an effect or a preset name:

```ts
barChart("#goals", { data, label, y: "name", x: "goals", on: { hover: travel("soccer-ball"), update: "flash" } });
```

| Slot | Runs | Until |
| --- | --- | --- |
| `hover` | on pointer hover or keyboard focus | leave; cleared during a data transition and replayed after it |
| `enter` | when a mark appears | it re-triggers, or the mark exits |
| `update` | when a mark's values change, as the transition starts (not on a re-sort alone) | it re-triggers, or the mark exits |
| `exit` | before a mark is removed; removal waits for it | it finishes, and the mark goes |
| `decorate` | from enter, for persistent effects like `threshold` | the mark exits; it redraws on every geometry change |

## Effects

The effect interfaces and the drawing API are built as types (`src/core/contracts/`), and the [runner](#runner) drives them. The first effects follow in M1 step 6.

There are three kinds, distinguished by a `kind` field:

- **Geometry effects** (`GeometryEffect`) receive a `MarkGeometry`.
- **Data effects** (`DataEffect<D>`) also receive the mark's `MarkData<D>`: values along the walk, related series and the previous values. Their `run`, `end` and `clear` are function-typed properties rather than methods, so TypeScript checks the row type strictly and an effect that needs fields a chart's rows don't have is a type error.
- **Transition effects** (`TransitionEffect`) receive two geometries (`morph`). They can't be used where a mark effect is expected.

Each one has `run`, `end` (the final state, used for reduced motion) and `clear`. Effects are stateless: one effect object can run on many marks at once, and per-run state lives on the `EffectContext`:

| Field | What it is |
| --- | --- |
| `signal` | Aborted on leave, re-trigger, data update or destroy |
| `motion`, `tween()` | The motion view, and tweens with the clock, motion and signal already bound |
| `mark` | Restyles the mark itself |
| `layer` | This run's own overlay group, above the marks |
| `icons` | Resolves icon names |
| `batch` | The mark's position in a multi-mark event, for stagger |
| `onChange()` | Called when the geometry moves |
| `previous` | The geometry before this update, on update events |

`Combined<E>` is the type `sequence` and `parallel` return: a data effect if any part is one, needing every part's row type at once (an intersection), so a generic part like `threshold()` can't widen a typed part back to `unknown`.

Planned: `travel(icon, { along })`, `wiggle()`, `pulse()`, `flash()`, `threshold({ compareTo, color })`, `morph()`; the combinators `sequence`, `parallel`, `stagger` and `only`; and the experimental author helpers `defineEffect` and `defineDataEffect`.

### Drawing API

Effects touch the screen only through the context. It's deliberately small and renderer-neutral, so Canvas can implement it later without changing any effect.

- `layer.icon(icon, { size })` draws an icon, hidden until the first `place(transform)`.
- `layer.path(d, paint)` draws an overlay path; `update(d, paint?)` replaces the path data and merges the paint fields given.
- `layer.text(content, style)` draws text in the theme text colour by default; `update(style, content?)` merges the style fields given. Series colours are for swatches, never for words.
- `mark.set(style)` changes only the fields given, so effects running in parallel don't undo each other's transform or halo. A field given as `undefined` goes back to its default. `mark.reset()` restores the mark's own style.
- Colours are theme tokens (`"text"`, `"negative"`, `"series-3"`, `"mark"` for this mark's colour) or any CSS colour.

The runner empties the layer and resets the mark when a run is cleared, so cleanup happens even if an effect forgets.

### Testing effects without a DOM

`src/core/testing` has in-memory versions for effect tests. It's internal until the conformance suite is exported after M3.

- `recordingLayer()` and `recordingMark()` record every call and keep what's drawn now. `picture()` gives that as plain data with numbers rounded, so a full run can be compared with `end()`.
- `testContext({ mode, icons, batch, previous })` is a complete `EffectContext` on a manual clock, with `abort()`, `clear()` and `change(mark)` (fires `onChange`). It's built on the same run scope the runner gives every run, so `clear()` is exactly the runner's cleanup after `effect.clear(ctx)`.
- `recordingSurface()` is a `RunnerSurface` whose groups are recording layers and whose marks are recording marks, for runner and chart tests.
- `measurePath(d)` measures the path data the geometry writes: length, start, end and commands.

## Runner

`src/core/runner.ts` plays a chart's slots. It's internal: each reference chart and adapter creates one and calls it as things happen, and the runner owns every run's lifecycle, so effects stay small and stateless. A *run* is one effect playing on one mark for one slot.

```ts
const runner = createRunner({ effects: resolveEffects(options.on, presets), surface, motion, icons });
runner.enter(marks);         // decorate, then enter
runner.interrupt();          // a data transition starts: hover runs are cleared
runner.update(changed);      // update runs, given the previous geometry and data
runner.change(mark);         // every frame of the transition: onChange for that mark's runs
runner.settle();             // the transition settled: hover replays on marks still hovered
await runner.exit(leaving);  // then remove their elements
runner.hover([mark]); runner.leave(); runner.destroy();
```

- **One run per mark and slot.** Re-triggering clears the previous run, then starts the new one. Marks are matched by key.
- **Clearing** a run aborts its `signal`, calls `effect.clear(ctx)`, empties its layer group, resets its mark style and drops its `onChange` listeners. This happens even if the effect forgets, and anything it draws or styles afterwards is ignored.
- **Finished runs stay.** When `run()` resolves, what it drew and styled stays, and it keeps getting `onChange`, until it's cleared: by leave, a re-trigger, exit or destroy. So a ball that rolled to the end rests there while the pointer stays.
- **Off.** When the effective mode is `off`, the runner calls `end()` instead of `run()`, on a fresh context. If the mode turns off mid-run (the device asks for reduced motion, or the viewer picks Off), runs still going are cleared and replaced by `end()` on a fresh context with the mark's latest geometry; finished runs keep what they drew.
- **Data transitions.** `interrupt()` clears hover runs, and a hover that arrives during the transition waits. `settle()` replays hover, in the order the marks were hovered, on the marks still hovered or focused, with their latest geometry. Other runs keep going, and decorations follow every `change()`.
- **Exit.** `exit()` clears the mark's other runs (hover too), runs `exit`, then clears that and forgets the mark. Its promise resolves when every exit is done, which is when the chart removes the elements. A leaving mark can't be hovered, and one that re-enters mid-exit cancels its exit.
- **Errors.** An effect that throws or rejects, in `run`, `end` or an `onChange` listener, is reported (with `reportError`) and its run cleared; other runs and marks carry on. An error in `clear()` is reported and the cleanup continues. A rejection caused by the run's own abort isn't reported.
- **Mark styles merge.** Every live run's `mark.set()` fields are merged into the mark's one style handle. When two runs set the same field, the one that started later wins; when it's cleared, the earlier run's value comes back. A run that `end()` replaces when the mode turns off keeps its place.

Each run's `EffectContext` has its own `signal`; the motion view; `tween()` bound to the clock, the motion and the signal (a tween given its own signal is still cancelled with the run); its own `layer` group and `mark` handle; the icon source; `batch`, the mark's position among the marks in that call; and `previous` on update runs. Data effects also get the mark's `MarkData`. On update, `previous` (geometry) and `data.previous` (values) come from the chart, or else from the last geometry and data the runner saw for that key.

The renderer implements `RunnerSurface`: `group(key, slot, order)` returns a new overlay group for one run, asked for on the run's first draw and cleared once when the run is. Groups stack by `order`, the run's start order, rather than by when they were asked for, since a decoration may first draw long after it started. `mark(key)` returns the mark's style handle. `recordingSurface()` in `src/core/testing` is an in-memory one.

## Presets and icons by name

A slot can name a preset instead of holding an effect, `on: { hover: "wiggle" }`, and an effect can name an icon, `travel("cleat")`. Charts resolve names through registries the composition root (`src/index.ts`) hands them, so a chart never knows what a name means.

- `registerPreset(name, factory)` makes a name usable in any chart's `on`. The factory returns a fresh effect that works on any rows. The built-in presets (`wiggle`, `pulse`, `flash`) are registered when their effects land in M3.
- `registerIcon(icon)` and `registerIcons(icons)` make icons usable by their `name`, through each run's `ctx.icons`.
- A later registration replaces an earlier one with the same name.
- Charts call `resolveEffects(on, presets)` when they're created. An unknown preset name throws a `RangeError` that lists the registered names. A transition effect in a mark slot, or a slot that doesn't exist, throws a `TypeError` naming the slot. Misspelled names aren't type errors (custom names are allowed), so this is where they're caught.

Internally both are a `createRegistry({ kind, entries, hint })` (`src/core/registry.ts`) with `get`, `resolve`, `register` and `names`; a `Registry<Icon>` is an `IconSource`.

## Adapters (planned)

`expressive(marks, options)` attaches effects to SVG marks drawn by another library, such as a D3 selection, a NodeList or a selector:

- It reads geometry from rects and circles itself. For other shapes, you describe the geometry with the public builders.
- Marks that share a key become one mark, and `segment` orders them as segments.
- `refresh()` re-reads the marks after the host re-renders, then fires enter, update and exit by key.

Adapters follow the chart rules:

- They never know specific effects.
- They express geometry in the marks' nearest common ancestor's coordinates, and draw their overlay there.
- They leave the host's styling, axes and tooltips alone.

## Rendering

SVG first. Canvas or WebGL rendering is a later option for charts with thousands of marks; effects describe what to draw, so they should not need to change when a renderer is added.

## Build outputs

- `dist/index.js` + `dist/index.d.ts`: ES module for npm and bundlers.
- `dist/expressive-charts.global.js`: script-tag bundle exposing `window.ExpressiveCharts`.
- Planned: `expressive-charts/icons/sport`, an optional icon pack (ball, cleat) as a separate entry point, so the core stays neutral.
