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

Charts and effects both depend on core. They never depend on each other. Icons (`src/icons`) depend only on core too, and effects never import them: they look icons up by name through the run's context. They meet only through two shared contracts: the **mark geometry** and the **event stream**. Because charts and effects can't import each other, the types for both contracts live in core (`src/core/contracts/`), and so does the geometry math that charts use to build marks and effects use to draw (`src/core/geometry/`).

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

An `Animated<T>` is a value that can be retargeted mid-flight. `to()` cancels whatever is running and starts from the current in-between value, so nothing jumps. When it interrupts a moving value and starts at once, the default ease is ease-out rather than ease-in-out, because restarting an ease-in from a moving value makes the motion stall. A value still waiting out a `delay` isn't moving, and a new animation with a `delay` starts from rest after it, so both of those ease in and out. `set()` jumps, and `stop()` freezes in place. `target` equals `value` whenever it's at rest, including after a cancellation from outside (an aborted `signal`, or an `onChange` that throws). The interpolators provided are `interpolateNumber`, `interpolatePoint` and `interpolateRecord`. `interpolateRecord` grows keys that appear from 0 and shrinks keys that disappear to 0, which suits stacked segments.

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

The rest of `src/core/geometry` is internal: path segments (lines and circular arcs), walks parameterised by distance, outlines with canonical sampling, path-data writing, and reading SVG transform lists (`parseTransform`, `invert`, shared by `iconFromSvg` and the adapter). Charts and effects inside the library use it directly.

## Events and effect slots

Charts and adapters emit `enter`, `update`, `exit`, `hover` and `leave` (the [bar chart](#reference-charts) and [`expressive()`](#adapters) do), each a `MarkEvent`: the mark's geometry, its data and its position in the batch. An `update` event also carries the previous geometry (`from`), and a `hover` event its `source` (`"pointer"`, `"touch"` or `"keyboard"` for focus) and the `segment` under the pointer. Data events fire when a change starts: `enter` and `update` with the new geometry, `exit` with the geometry on screen. `hover` and `leave` carry the geometry on screen too, which is part way to the new one while a change plays. `chart.on(type, listener)` and the effect slots consume the same events. Effects attach to events through the `on` option, typed `EffectSlots<D>` (`src/core/contracts/slots.ts`); each slot takes an effect or a preset name:

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

The effect interfaces and the drawing API are built as types (`src/core/contracts/`), and the [runner](#runner) drives them. The first effect, [`travel`](#travel), and the combinators `sequence`, `parallel` and `only` are in `src/effects/`.

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

Planned: `wiggle()`, `pulse()`, `flash()`, `threshold({ compareTo, color })`, `morph()`; the combinator `stagger`; and the experimental author helpers `defineEffect` and `defineDataEffect`.

### travel

```ts
travel(icon, { along?, gait?, size?, orient?, ride? }) // icon: an Icon, or a registered icon's name
sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" }))
```

`travel` carries an icon along the mark's walk, or along one segment, and leaves it resting at the end. It reads only the walk, `thickness` and `segments`, so the same effect rolls a ball out a bar, around a donut slice and along a line.

- **Where.** `along` names a segment's series; a mark with no segments counts as its own one segment. A missing segment, or a walk shorter than 0.5 px, makes it a no-op: nothing is drawn and it finishes at once. The icon is inset by its footprint so it stays inside the mark. If the walk is shorter than the footprint, the icon rests at the start without moving; on a very short walk it carries on past the end rather than covering the baseline.
- **How long.** The base duration is `max(260 ms, distance ÷ 360 px/s)`, with `effect` timing, times the gait's `pace`. The easing is the gait's, or `easeOutCubic`.
- **`size`** is the icon's length along the walk in px, or `"fit"`: scaled so the icon's box is 85% of the mark's thickness across the walk. Default: the icon's own size.
- **`orient`.** `"follow"` turns the icon with the walk, `"level"` never turns it, and the default `"auto"` follows but mirrors an icon marked `upright` when the walk heads left, so a boot on a negative bar keeps its sole down.
- **`ride`.** `"center"` (default) puts the icon's anchor on the walk; `"on"` sits the icon on top of it: half the mark's thickness plus the anchor's height above the icon's bottom, towards the icon's up side.
- **Corners.** The heading is smoothed over half the icon's length either side: it's the chord between the window's ends, which is exactly the tangent on straight legs and arcs and turns gradually across a polyline corner.
- **Geometry changes.** The icon follows `onChange` and keeps its progress, so on a resize a ball resting at the end of a bar stays at the new end. It's removed while its segment is missing and drawn again when the segment is back.
- An icon given by name is looked up in `ctx.icons` each time the effect runs or ends. An unknown name throws there, so the runner reports it.

**Gaits** (`gaits.roll()`, `gaits.step({ stride, lift, tilt })`, `gaits.slide()`) decide how the icon moves: `options.gait`, then the icon's own `gait`, then `slide`. A gait is a function from the trip so far (`distance`, `length`, `progress` and the icon's `radius`) to a pose: `lift` towards the icon's up side, and `spin` and `tilt` about its pivot. Distances are in the icon's own units, so a gait looks the same at any size. A gait can carry its own `ease` and `pace`.

| Gait | Pose | Trip |
| --- | --- | --- |
| `roll()` | spin = distance ÷ radius | default |
| `step({ stride: 42, lift: 3.2, tilt: 9 })` | a whole number of steps, at least one; each lifts by `lift` and raises the front by `tilt` degrees, easing off to 70% over the trip; flat at every landing | eased in and out, 15% longer (the prototype's cleat) |
| `slide()` | still | default |

### Combinators

- `sequence(...effects)` runs the parts in order. An abort stops the chain. `end()` draws every part's end state in order, and `clear()` clears every part, passing on the first error after all have run. A part with nothing to do finishes at once, so `sequence(travel(ball, { along: "goals" }), travel(cleat, { along: "assists" }))` tells the right story whether the bar shows goals, assists or both.
- `parallel(...effects)` runs the parts together and finishes when they all have, or rejects with the first part that does. `end()` and `clear()` work as for `sequence`.
- `only(filter, effect)` runs the effect only on marks whose key or series equals `filter`, or for which `filter(mark)` is true. Elsewhere it does nothing. It keeps the effect's kind and `needs`.

The parts share the run's context: one overlay group, one mark handle (whose `set()` merges fields, so parallel parts don't undo each other) and one signal. `Combined<E>` is the type `sequence` and `parallel` return: a data effect if any part is one, needing every part's row type at once (an intersection), so a generic part like `threshold()` can't widen a typed part back to `unknown`. A data combination's `needs.related` lists every part's. A part that isn't a mark effect (a transition effect, say) is a type error, and throws a `TypeError`.

### Drawing API

Effects touch the screen only through the context. It's deliberately small and renderer-neutral, so Canvas can implement it later without changing any effect.

- `layer.icon(icon, { size })` draws an icon, hidden until the first `place(transform)`. **Size rule:** the icon is scaled by `size / icon.size` about its anchor, in icon space, *before* the `place()` transform. So an effect builds the transform as if the icon were its natural size, and the anchor still lands where the transform puts it; icon-space lengths (footprint, radius) scale by the same factor. Each shape is one path; an unset `fill` or `stroke` draws none, `width` is in icon units, and `clip` is path data in icon space.
- `layer.path(d, paint)` draws an overlay path, unfilled unless `paint.fill` is given; `update(d, paint?)` replaces the path data and merges the paint fields given.
- `layer.text(content, style)` draws text in the theme text colour by default, with `at` on its baseline; `update(style, content?)` merges the style fields given. Series colours are for swatches, never for words.
- `mark.set(style)` changes only the fields given, so effects running in parallel don't undo each other's transform or halo. A field given as `undefined` goes back to its default. `mark.reset()` restores the mark's own style. `transform` (chart space) and `opacity` apply to the mark's body, so its labels and pointer target stay put; `emphasis` mixes toward the strong colour; `halo` strokes the outline behind the mark, `width` being the stroke width (half of it shows outside).
- Colours are theme tokens (`"text"`, `"text-muted"`, `"negative"`, `"series-3"`, `"series-3-strong"`, and `"mark"` / `"mark-strong"` for this mark's colours) or any CSS colour.

The runner empties the layer and resets the mark when a run is cleared, so cleanup happens even if an effect forgets. The SVG implementation is in `src/charts/render/` (see [Rendering](#rendering)).

### Testing effects without a DOM

`src/core/testing` has in-memory versions for effect tests. It's internal until the conformance suite is exported after M3.

- `recordingLayer()` and `recordingMark()` record every call and keep what's drawn now. `picture()` gives that as plain data with numbers rounded, so a full run can be compared with `end()`.
- `testContext({ mode, icons, batch, previous })` is a complete `EffectContext` on a manual clock, with `abort()`, `clear()` and `change(mark)` (fires `onChange`). It's built on the same run scope the runner gives every run, so `clear()` is exactly the runner's cleanup after `effect.clear(ctx)`.
- `recordingSurface()` is a `RunnerSurface` whose groups are recording layers and whose marks are recording marks, for runner and chart tests.
- `measurePath(d)` measures the path data the geometry writes: length, start, end and commands.
- `play(clock, running)` advances a manual clock a frame at a time until a run settles, letting promise callbacks run between frames, and resolves with the ms it took.

The `travel` tests run the conformance checks from plan §8 on bars (positive, negative, columns, stacked, too short), a donut slice, a line and a point: a full run ends with the same picture as `end()`, clearing leaves nothing, an abort mid-run settles, and with motion off no frames run.

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

The renderer implements `RunnerSurface`: `group(key, slot, order)` returns a new overlay group for one run, asked for on the run's first draw and cleared once when the run is. Groups stack by `order`, the run's start order, rather than by when they were asked for, since a decoration may first draw long after it started. `mark(key)` returns the mark's style handle. `svgSurface()` in `src/charts/render/` is the SVG one; `recordingSurface()` in `src/core/testing` is an in-memory one.

## Presets and icons by name

A slot can name a preset instead of holding an effect, `on: { hover: "wiggle" }`, and an effect can name an icon, `travel("cleat")`. Charts resolve names through registries the composition root (`src/index.ts`) hands them, so a chart never knows what a name means.

- `registerPreset(name, factory)` makes a name usable in any chart's `on`. The factory returns a fresh effect that works on any rows. The built-in presets (`wiggle`, `pulse`, `flash`) are registered when their effects land in M3.
- `registerIcon(icon)` and `registerIcons(icons)` make icons usable by their `name`, through each run's `ctx.icons`. The core icons (`dot`, `arrow`, `chevron`) are registered from the start; the sport pack is opt-in, with `registerIcons(sport)`.
- A later registration replaces an earlier one with the same name.
- Charts call `resolveEffects(on, presets)` when they're created. An unknown preset name throws a `RangeError` that lists the registered names. A transition effect in a mark slot, or a slot that doesn't exist, throws a `TypeError` naming the slot. Misspelled names aren't type errors (custom names are allowed), so this is where they're caught.

Internally both are a `createRegistry({ kind, entries, hint })` (`src/core/registry.ts`) with `get`, `resolve`, `register` and `names`; a `Registry<Icon>` is an `IconSource`.

## Icons

An icon is path data plus paint (`src/core/contracts/icon.ts`), never raw SVG markup, so any renderer can draw it and Canvas can draw each shape as a `Path2D`. Shapes are drawn facing +x with their up side towards −y, in px at the icon's natural size, `icon.size`.

| Field | What it is | Default |
| --- | --- | --- |
| `shapes` | paths drawn in order, each with `fill`, `stroke`, `width`, `linecap`, `linejoin` and an optional `clip` path; an unset fill or stroke draws none | |
| `box` | icon-space bounds | |
| `size` | the natural length along the walk, px | the box's width |
| `anchor` | the point that sits on the walk | |
| `pivot` | what it spins or tilts around | the anchor |
| `footprint` | `[behind, ahead]`: its extent along +x from the anchor | from the anchor to the box's edges |
| `gait` | `"roll"`, `"step"` or `"slide"` | none, so travel slides |
| `radius` | rolling radius | half the box's height |
| `upright` | mirror instead of turning upside down | false |

- `defineIcon(spec)` fills the defaults, checks every field (a `RangeError` names the bad one; path data must start with a move and contain only path characters) and freezes the icon, since one icon is shared by every run.
- `iconFromSvg(markup, spec)` reads SVG markup as text, with no DOM. It keeps only `path`, `circle`, `rect`, `ellipse`, `line` and `polygon`, with their fill, stroke, stroke width, caps and joins (as attributes or in `style`, inherited from groups), and applies their transforms. Everything else is dropped: scripts, event handlers, `<use>`, text, images, and the contents of `<defs>`, `<clipPath>` and the like. Path data is rewritten from the numbers it contains, and colours must be plain colours or theme tokens, so nothing from the markup passes through. Gradients, patterns and CSS classes aren't kept. `size` scales the whole icon so its box is that many px wide; the spec's anchor, pivot, footprint and radius are in the SVG's own units.
- **Core icons** (`icons.dot`, `.arrow`, `.chevron`) are neutral and drawn in theme colours (`surface`, `text`), so they read in light and dark themes and on any series colour.
- **The sport pack** is a separate entry point, `expressive-charts/icons/sport`, with `soccerBall`, `cleat` and `sport` (both, for `registerIcons`). They're converted from the prototype and drawn in fixed colours:

| Icon | `anchor` | `pivot` | `footprint` | `gait` | Notes |
| --- | --- | --- | --- | --- | --- |
| `soccer-ball` | centre | centre | 8.5 / 8.5 | `roll` | The panels are clipped to the ball. |
| `cleat` | (0, −6): the heel, raised so the boot sits centred in a bar | (13, −4), the ball of the foot | 0 / 26 | `step` | `upright` |

## Reference charts

Our charts are in `src/charts`. They import only from core, and the composition root (`src/index.ts`) hands each one a `ChartEnv`: the preset and icon registries and the page-wide motion. So a chart never imports an effect or a registry. Every chart has `update(next)`, `on(type, listener)`, `marks()` (in visual order, as they are on screen now, so part way through a transition while one plays), `element` (the `<svg>`) and `destroy()`.

### Bar chart

```ts
barChart("#goals", { label: "Goals by player", data: players, y: "name", stack: ["goals"], sort: "value", colors: { goals: 1, assists: 4 }, on: { hover: ballThenCleat } });
```

- **Encoding.** The axis whose values aren't numbers is the category: `y: "name", x: "goals"` draws horizontal bars, `x: "name", y: "goals"` columns. With `stack`, the one axis given is the category. `orientation` forces it, and is needed when both axes hold numbers. Each value field is a segment named after it (a function's is `"value"`), so a plain bar has one segment, as `describe.bar` gives it (`gap: 2`, `radius: 4`).
- **Keys** default to the category, are converted with `String()`, and must be unique. `sort` is `"none"` (data order, the default), `"value"` (largest total first), `"key"` (A–Z, numbers in numeric order) or a comparator; sorting never changes a key or a colour.
- **Values.** Missing values (`null`, `undefined`) count as 0; anything else that isn't a finite number throws. Negative bars grow from zero the other way (baseline `right` or `top`). A stack that mixes signs throws for now.
- **Data effects** read other series through `data.related(series)`, which on a bar is that series' segment in the same row. The series an effect lists in `needs.related` must be among the chart's (the stacked fields, or the value field), or creating the chart throws and `update()` rejects.
- **Layout.** The chart measures its container (or takes `width`) and lays out in px; a `ResizeObserver` re-lays it out on the next frame, without animating, calling `change()` for the marks that moved. Horizontal rows are 34 px with 20 px bars, so the height follows the rows unless `height` is given; columns default to 300 px high. Label margins are measured in the chart's own SVG (estimated from the character count where there's no layout, as in jsdom) and measured again once web fonts load. The layout (`bar-layout.ts`, pure) is drawn from a few numbers: a frame, which is the value scale (`lo`, `hi`, where they sit in px, and the category labels' place) and the category bands (start, band size, bar thickness, plot span, chart size), plus each row's values and slot. `placeRow` and `placeTick` draw a laid-out row or any state in between, which is how transitions draw their frames.
- **Hover.** Pointer hover is delegated from the `<svg>`: each mark's whole row (or column) band is its target. A touch tap acts as hover until a tap elsewhere. The hovered mark turns its strong colour and the others dim to `--ec-dim-opacity` (0.3); `dim: false` keeps the others as they are. Both are CSS transitions timed by `--ec-hover-duration`, which the chart sets from `motion.duration(100, "feedback")`, so they're instant when motion is off.
- **Keyboard.** The chart is one tab stop: one mark has `tabindex="0"` (the first in visual order, then whichever was focused last) and the others `-1`. The arrow keys move to the next or previous mark in visual order, following the current sort: Down and Right go to the next, Up and Left to the previous, whatever the orientation. Home and End jump to the ends. Keys pressed with Alt, Ctrl or Meta are left to the browser.
  - Focus that follows a key press plays the hover story (`source: "keyboard"`), with the same emphasis and dimming as the pointer, and jumps to its end state when motion is off, as hover does. Escape stops it and keeps focus; blur leaves. Focus from a click or tap moves the tab stop but leaves the hover to the pointer.
  - Pointer and focus share one hover. The pointer moving onto another mark takes it over; focus arriving on the mark under the pointer holds that hover until blur, and a blur with the pointer still over the mark leaves it to the pointer.
  - Focus stays on its key across `update()`, and the story replays once the change settles. The focused mark's element never moves in the DOM (the others move around it), because moving a focused element blurs it. If the focused mark leaves, focus moves to its nearest neighbour, the next mark or else the previous one; with no marks left, it leaves the chart.
  - **Focus ring.** It's drawn from the focused mark's `outline.d` as it is on screen, so it follows the mark through a transition, and takes the mark's `transform` when an effect moves it. It's in `<g class="ec-focus">` behind the marks: a 2 px ring in `--ec-focus` outside a 2 px gap in `--ec-surface`. So it never covers data, and stays distinct from a bar of the same colour. As with `:focus-visible`, it shows unless the last input on the page was a pointer. The mark's own outline is turned off.
  - **Labels.** Each mark's `aria-label` gives its category and its values in the chart's `format`, "Okafor: 16 goals, 4 assists" (a lone value read by a function has no series name: "Okafor: 16"). It changes as soon as an update starts. ARIA roles, a `describe` option and the live region come in M2.
  - Focus events are heard on the document (or the shadow root the chart is in), not on the `<svg>`: Chrome makes an SVG element with focus listeners of its own a tab stop.
- **Updates.** `update(next)` merges the options and checks them (if it can't draw the result, it rejects and changes nothing), then animates to the new state, calling the runner in its order: `interrupt()`, `exit` / `update` / `enter` as the change starts, `change()` on every frame for each mark whose geometry moved, `settle()` once it has settled. An `update` event means the mark's values changed; a re-sort or a new scale only moves it. `on` and `motion` can't be changed by `update()` yet.
  - **Presentation** (`motion.staged`) splits the change into two stages of 500 ms base each, `transition` timing. Values: bars resize, leaving bars shrink to zero and their labels fade, the scale retargets, and ticks the scale gains or loses fade in or out. Positions: rows move to their new slots, the bands and the chart's height follow, and entering bars grow in at their slots, their labels fading in, during the second half. A stage with nothing to do is skipped, so a re-sort alone takes 500 ms.
  - **Analysis** runs everything at once, as one stage as long as the stages it has to do together, which the scaling table caps at 200 ms. **Off** (including reduced motion with no viewer choice) jumps: everything lands before `update()` returns. So does a change of orientation.
  - **State.** Each mark keeps one `animated` value per property: its values by series (in data units, so a bar always reads true against the axis mid-change), its slot, and its presence (the labels' opacity as it enters or leaves). The chart keeps one each for the scale and the bands, and one opacity per tick. A stack that gains or loses a series keeps the old ones in place until they've shrunk away. In-between values are clamped where `describe.bar` can't draw them (a stack crossing zero mixes signs for a moment; values against the total's sign draw as 0). A mark that stays has its value label count between its totals; one entering or leaving shows its own value as it fades.
  - **Frames.** Every frame writes what moved, all in chart space: `d` for the segments, and positions for the labels and the pointer target. Rows move by their geometry rather than a group `transform`, because each frame needs the chart-space geometry for `change()` anyway, and an effect's own `transform` on the mark is in chart space too. When the transition settles, the chart draws exactly the layout.
  - **Interruptions.** Another `update()` mid-change retargets every value from where it is now, so nothing jumps, and stages again from there: values not yet at their targets take a values stage first. The earlier `update()`'s promise resolves at once. A resize mid-change lands it at once (resizes never animate).
  - **Leaving marks** stay, unhoverable, until they've faded out and their exit effects have finished; one that comes back meanwhile keeps its element and grows back from where it is. The promise resolves when the change has settled and the marks it removed are gone, or as soon as another `update()` supersedes it.
- **Colours** follow the series through a `ColorAssignment`: `colorAssignment(fixed?)` gives each key a palette slot (1–8), pinned or the next free one in the order keys are first seen, and never reassigns it. `colors` takes pinned slots or a shared assignment.
- **Motion.** `motion` takes a `Motion`, or a mode as this chart's author default: the viewer's choice on the page-wide motion and the device's reduced-motion setting still win, as they do over `setMode()`.

## Adapters

`expressive(target, options)` attaches effects to SVG marks drawn by other code (`src/charts/adapter/`, built in M1 step 10 for rects). `target` is a selector, an element, a list of elements, or anything with `nodes()` and `data()` like a D3 selection, whose data types the callbacks. Like a chart, it gets a `ChartEnv` from the composition root, resolves `on` through the preset registry and plays it through the runner.

```ts
const fx = expressive(d3.selectAll("#goals rect"), {
  key: (d) => d.data.name,                          // required: marks are matched by key
  segment: (_d, el) => el.parentNode.__data__.key,  // rects sharing a key are one mark's segments
  keyboard: true,
  on: { hover: sequence(travel("soccer-ball", { along: "goals" }), travel("cleat", { along: "assists" })) }
});
fx.refresh(d3.selectAll("#goals rect"));             // after the host re-renders
```

- **Rows and keys.** `datum` defaults to a selection's `data()`, then to `element.__data__` (D3's convention). When `__data__` is a number and no `datum` is given, the adapter warns that it looks like Plot. Keys are converted with `String()`. Elements that share a key throw unless `segment` names each part, and a part named twice throws.
- **Geometry.** `<rect>` marks are described with `describe.bar`, in the coordinates of the marks' nearest common ancestor (a lone mark's parent). Each rect's box is converted with its CTM: `getScreenCTM()` where there's layout, otherwise the transform attributes, as in jsdom, which can't see nested `<svg>` viewports or CSS transforms. A mark's segments are ordered from the baseline by position, never by DOM order, since Vega-Lite stacks alphabetically. A gap the host leaves between segments becomes `describe.bar`'s `gap`, and the tip takes the tip rect's `rx`. A rect its transforms rotate or skew (anything but scales, flips and quarter turns) isn't an upright bar, so it throws. Other shapes, and such rects, need `geometry(element, datum, key)`, which is called once per mark with its first element and must return a geometry with that key. Reading circles, and `describe.shape`, are planned.
- **Baseline.** `"auto"` (the default) finds the line every mark has an edge on. A mark whose near edge (left, or bottom for columns) is on it grows away from it; one whose far edge is on it grows the other way, like a negative bar. When bars and columns both fit (one mark, or marks of one size), marks spread down the page are bars and marks spread across are columns. If no line is shared it throws: pass the edge.
- **Overlay.** Runs draw in `<g class="ec-overlay">`, the root `<svg>`'s last child, with the common ancestor's transform. So they share the marks' coordinates but never sit inside a group the host manages (Vega removes foreign children from its groups when it redraws). It holds the halos, the run groups and the focus ring, and `refresh()` moves it back to the end and recomputes its transform.
- **Events.** Pointer and touch hover, focus and keys are listened for once, on the root `<svg>`. An event's target is mapped to its mark through a lookup that `refresh()` rebuilds, so marks the host replaces keep working. Hover events carry the segment under the pointer.
- **Keyboard.** `keyboard: true` gives one mark `tabindex="0"` (the first in visual order: bars top to bottom, columns left to right) and the others `-1`, re-applied on every `refresh()`.
  - Focus plays the hover effects (`source: "keyboard"`). The arrow keys move to the next or previous mark, Home and End to the ends. Escape stops the effects; blur leaves.
  - A ring follows the focused mark's outline in the overlay, in `--ec-focus`. As with `:focus-visible`, it shows unless the last input on the page was a pointer (a click or tap), and the element's own outline is turned off while it's focused.
  - `focus(key)` moves focus to a mark. If the host replaces the focused element, `refresh()` focuses the new one.
- **Styling.** The host owns it, so nothing dims unless `dim: true`. Then the attachment's mark elements get `ec-attached`, and while one is hovered the others get `ec-dimmed`, which the shared stylesheet fades with `:where()`, so host CSS still wins. The classes go on the attachment's own marks only, never on the root, so two attachments on one `<svg>` leave each other alone. Effects restyle marks with inline styles only:
  - `transform` becomes a CSS transform composed with the element's own transform attribute, which is never written;
  - `opacity` is the element's opacity;
  - `emphasis` mixes the host's fill toward a darker shade, and the "mark" colour token is the host's fill;
  - `halo` is drawn in the overlay, masked to outside the mark, so it shows only where it would behind the mark.
- **Refresh.** `refresh(source?)` re-reads the marks: from `source` if given (and from then on), otherwise from the last source, running a selector again. Like a chart's update, it calls the runner in order: `interrupt()`, then `exit`, `update` and `enter` by key, `change()` for marks that moved, and `settle()`. The adapter can't see values, so an `update` means a mark's length or segments changed; a mark that only moved, or got a new row, follows through `change()`. A new root `<svg>` (Plot draws one each time) takes the overlay and the listeners. Marks it can't read throw before anything changes.
- **Destroy.** `destroy()` clears every run, removes the overlay and the listeners, and puts back every attribute, style property and class the adapter changed. When nothing else has changed them, attributes get their exact text back, so the host's markup reads as it did before.
- **Data effects** get the mark's row (its first segment's, with the other segments through `related(series)`), but no samples until the `samples` option lands in M4, with `watch`.

What each library needs (from the [adapter spike](ideas/adapter-spike.md)):

- **D3** works as is: `__data__` holds the row, and a stack's series key is on the parent `<g>`.
- **Observable Plot** binds indices, not rows, so the page passes a `datum` accessor. Pass the marks, not the `<svg>`: `refresh(newSvg.querySelectorAll('g[aria-label="bar"] > rect'))`. Which accessor depends on the mark:
  - one element per row, with no transform that derives new data (bars, dots): `datum: (el) => rows[el.__data__]`;
  - a line path: `el.__data__` is that series' array of row indices, with `-1` at gaps, so `el.__data__.filter((i) => i >= 0).map((i) => rows[i])`;
  - after a group, bin or other reducing transform: the index points into the derived data, so `rows[i]` is silently the wrong row. Read the channel values through the mark's `render` option instead.

  Plot has no pie mark.
- **Vega and Vega-Lite** need the SVG renderer (vega-embed's default; a bare `vega.View` uses canvas). Their bars are `<path>` elements and `__data__` is a scenegraph item, so for now they need `datum` and `geometry`; a small helper that reads the View is planned with arcs (M3).

Adapters follow the chart rules:

- They never know specific effects.
- They express geometry in the marks' nearest common ancestor's coordinates, and draw their overlay on the root `<svg>` with that ancestor's transform.
- They leave the host's styling, axes and tooltips alone, and undo everything they change.

## Rendering

SVG first, in `src/charts/render/`. Canvas or WebGL rendering is a later option for charts with thousands of marks; effects describe what to draw, so they should not need to change when a renderer is added.

- **Structure.** A chart's `<svg class="ec-chart">` holds the grid, the axis, the focus ring, the marks and, last, the overlay where runs draw (one `<g class="ec-run">` per run, stacked by start order, with `--ec-mark` set to the mark's colour, and set again when that colour changes). Each mark is a `<g class="ec-mark" data-key>`, which takes focus and carries the `aria-label`, with its pointer target, label, body (the segments, which effects restyle) and value label. DOM order follows visual order.
- **Theme.** Colours are `--ec-*` custom properties with the prototype's light palette as fallbacks: `--ec-text`, `--ec-text-muted`, `--ec-surface`, `--ec-grid`, `--ec-axis`, `--ec-focus`, `--ec-negative`, `--ec-series-1` … `--ec-series-8` with `-strong` variants, `--ec-dim-opacity` and `--ec-hover-duration`. Text uses the text tokens, never a series colour. Dark-mode defaults and the eight validated colours come in M2.
- **Styles.** One small stylesheet is injected once per document (`<style data-expressive-charts>`). Its rules use `:where()`, so host CSS overrides them without specificity fights. Everything else is set through the CSSOM, which a strict CSP allows; a `nonce` option or a shipped CSS file for strict-CSP pages is still open (plan §10).

## Build outputs

- `dist/index.js` + `dist/index.d.ts`: ES module for npm and bundlers.
- `dist/expressive-charts.global.js`: script-tag bundle exposing `window.ExpressiveCharts`.
- `dist/icons/sport.js`, `.cjs` and `.d.ts`: the optional sport icon pack, imported as `expressive-charts/icons/sport`. It's a separate entry, so the core build doesn't carry the ball and cleat. The script-tag bundle doesn't include it.
