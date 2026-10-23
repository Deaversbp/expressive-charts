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

**Driving it in a real browser.** The screenshot tests in `tests/visual/` need frames at exact times on a real page. They use Playwright's fake clock rather than a hook in the library. `page.clock` replaces `performance.now()` and `requestAnimationFrame` before any page script runs, and `defaultClock` looks both up only when it asks for a frame, so `page.clock.runFor(ms)` drives the page-wide clock directly. That keeps the public API as it is: no `setDefaultClock()` and no flag in the demo (`expressive-charts/testing` runs effects on manual clocks of its own, never the page's). Two details make the frames repeatable. The fake clock's frames fall every 16 ms. And each test moves the clock to the same reading before it acts, because a page starts at however much real time passed while Playwright installed the clock.

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
| `stagger` | the wait before each mark of a [`stagger`](#stagger) | base | 0 | 0 |

A rule is `{ factor, min?, max? }` and gives `clamp(base × factor, min(base, min), max)`, so a floor never makes an animation longer than its base. `createMotion({ scaling })` accepts partial overrides. `motion.staged` is true only in presentation, and it tells charts to split data changes into stages: values first, then positions.

### Reduced motion

```
effective mode = viewerChoice ?? (prefersReduced ? "off" : requested)
```

- `setMode(mode)` is the page author's default. It never overrides `prefers-reduced-motion`.
- `chooseMode(mode)` is for on-page controls the viewer operates, like [`motionSwitch()`](#controls). The viewer's own choice does override the device setting. `clearChoice()` goes back to following the device.
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

For effect authors, and public (the [effects guide](effects-guide.md) covers them):

```ts
matrix.translate(x, y); matrix.rotate(radians, about?); matrix.scale(sx, sy?, about?);
matrix.multiply(a, b, c);  // like the SVG transform list "a b c": c applies first
matrix.apply(m, point);
offset(point, angle, distance); // offset(mark.end, mark.angle(1) - Math.PI / 2, 8) is 8 px to the up side of the tip
```

A `Matrix` is `[a, b, c, d, e, f]` in SVG order. Positive rotations turn clockwise on screen, like SVG's `rotate()`.

`samplesAlong(mark, points)` is public too, for pages that give host marks their samples (see [Adapters](#adapters)).

The rest of `src/core/geometry` is internal: path segments (lines and circular arcs), walks parameterised by distance, outlines with canonical sampling, path-data writing, and reading SVG transform lists (`parseTransform`, `invert`, shared by `iconFromSvg` and the adapter). Charts and effects inside the library use it directly.

## Events and effect slots

Charts and adapters emit `enter`, `update`, `exit`, `hover` and `leave` (the [bar](#bar-chart), [donut](#donut-chart) and [line](#line-chart) charts and [`expressive()`](#adapters) do), each a `MarkEvent`: the mark's geometry, its data and its position in the batch. An `update` event also carries the previous geometry (`from`), and a `hover` event its `source` (`"pointer"`, `"touch"` or `"keyboard"` for focus) and the `segment` under the pointer. Data events fire when a change starts: `enter` and `update` with the new geometry, `exit` with the geometry on screen. `hover` and `leave` carry the geometry on screen too, which is part way to the new one while a change plays. `chart.on(type, listener)` and the effect slots consume the same events. Effects attach to events through the `on` option, typed `EffectSlots<D>` (`src/core/contracts/slots.ts`); each slot takes an effect or a preset name:

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

The effect interfaces and the drawing API are built as types (`src/core/contracts/`), and the [runner](#runner) drives them. The effects [`travel`](#travel), [`flash`](#flash), [`wiggle`](#wiggle) and [`pulse`](#pulse), the data effect [`threshold`](#threshold), the transition effect [`morph`](#morph), and the combinators `sequence`, `parallel`, `only` and [`stagger`](#stagger), are in `src/effects/`.

There are three kinds, distinguished by a `kind` field:

- **Geometry effects** (`GeometryEffect`) receive a `MarkGeometry`.
- **Data effects** (`DataEffect<D>`) also receive the mark's `MarkData<D>`: values along the walk, related series and the previous values. Their `run`, `end` and `clear` are function-typed properties rather than methods, so TypeScript checks the row type strictly and an effect that needs fields a chart's rows don't have is a type error.
- **Transition effects** (`TransitionEffect`) receive two geometries, `run(from, to, ctx)` and `end(from, to, ctx)`, on a [`TransitionContext`](#transition-effects) (`morph`). They can't be used where a mark effect is expected.

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

### Transition effects

A transition effect plays between two views of the same mark: `run(from, to, ctx)` turns `from` into `to`, `end(from, to, ctx)` draws the final state at once (motion off), and `clear(ctx)` does any extra cleanup. A run resolves when it's done or aborted, leaving its end state drawn until it's cleared. Its context, `TransitionContext`, is an `EffectContext` with one more field:

- **`start`**, from 0 to 1: where the run begins, in the effect's own progress (morph's is the shapes' eased progress). 0 plays it all. A switch back mid-way plays the reverse pair from 1 minus the progress the first had reached (M5 decision 6), so an effect that honours `start` retraces; one that ignores it replays from its beginning.
- **`mark` does nothing and `onChange` never fires.** Both views' marks are hidden while a transition plays, so there's nothing to restyle, and a resize mid-switch lands it rather than moving its shapes. `previous` isn't set: `from` is the previous geometry.

The [transition player](#playing-transitions) plays them with the runner's rules. `checkTransition` in `expressive-charts/testing` checks one (see [below](#testing-effects-without-a-dom)). `TransitionEffect` and `TransitionContext` are under the 0.x promise, with the other contracts.

### Writing effects

Effects written outside the library are made with `defineEffect(spec)` and `defineDataEffect<D>(spec)` (`src/effects/define.ts`). A spec is the effect without its `kind`, with `clear` optional. Each fills in the kind and a `clear()` that does nothing, throws a `TypeError` unless `run` and `end` are functions (every effect needs an end state, for reduced motion), and freezes the result, keeping only `run`, `end`, `clear` and, for data effects, a frozen copy of `needs`. `DataEffectSpec<D>`'s functions are properties, as on `DataEffect`, so a spec that reads fields `D` doesn't have is a type error. The [effects guide](effects-guide.md) is the author's documentation: the contract, the context and drawing API, timing, end states, the data guardrails, data effects, composing, testing with `checkEffect`, transition effects and `checkTransition`, worked examples and a review checklist. A transition effect is written as a plain object of kind `"transition"`: there's no definer for it. This API, with `matrix`, `offset`, `describe.*`, the contracts and `expressive-charts/testing`, is under the 0.x promise in [CHANGELOG.md](../CHANGELOG.md).

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

### flash

```ts
flash({ width?, opacity?, color? })   // or the preset: on: { update: "flash" }
```

`flash` marks a change with one blink of a halo along the mark's outline, as the prototype's CSS flash does: the stroke grows from 0 to `width` (default 8 px, half of it outside the mark) by a quarter of the way through, then fades back to 0, each half eased like CSS's `ease-out`. It's drawn through `mark.set({ halo })` at `opacity` (default 0.35) in the mark's own colour unless `color` names a theme token or a CSS colour. The base duration is 900 ms with `effect` timing, so about 300 ms in Analysis.

- **End state: nothing.** That's deliberate. A flash is emphasis, not information: the change it points at (the bar's new length and value label) stays on the chart, so with motion off or reduced the viewer misses nothing.
- **Any mark.** It reads nothing of the geometry. The renderer strokes the halo along the outline as it is on screen, so in the `update` slot it follows the bar through the transition it runs alongside, and a stacked bar's segments each get their own halo.
- **Where it runs.** In the `update` slot it runs on the marks whose values changed, not on a re-sort or a new scale: on our charts, and on `expressive()` when the page passes `value`. Without `value` the adapter can't see values, so there an update means a mark's length changed, which a new axis maximum or a resize also does (see [Adapters](#adapters)).

### wiggle

```ts
wiggle({ swing? })   // or the preset: on: { hover: "wiggle" }
```

`wiggle` rocks the mark about its `pivot` in three half-swings, each half the last and on the other side, every one a sine arch, over 450 ms base with `effect` timing (about 160 ms in Analysis). The pivot is where the mark is attached to the chart, so a bar rocks on its baseline, a donut slice about the donut's centre and a line about its first point. It's drawn through `mark.set({ transform: matrix.rotate(angle, pivot) })`, which moves the mark's body only: its labels and pointer target stay put.

- **The guardrail.** The angle is capped so the outline point farthest from the pivot moves at most `swing` px (default 3, the most allowed). The reach is the largest distance from the pivot to `outline.sample(64)`, not the walk's length: a slice's far edge is on its outer radius, beyond the walk at mid-radius. A point at distance r turned by θ moves 2r·sin(θ/2), so the cap is `2·asin(swing / (2·reach))`. It's also never more than 15°, so a tiny mark nods rather than spins, and a mark whose outline is all within 0.5 px of its pivot doesn't move at all. The first half-swing reaches the cap.
- **End state: no transform.** The mark rests where the chart drew it, so with motion off or reduced nothing happens, and a full run ends with `transform` unset.
- **Geometry changes.** It follows `onChange`, so a wiggle running alongside a transition rocks about the pivot as it is now, with the cap for the mark as it is now.
- `swing` must be more than 0 and at most 3 px; anything else throws a `RangeError` when the effect is made.

### pulse

```ts
pulse({ times?, width?, color? })   // or the preset: on: { enter: "pulse" }
```

`pulse` draws attention with a halo that widens from 0 to `width` (default 12 px, half of it outside the mark) while it fades from 40% opacity to nothing, `times` over (default 2). The width eases out (the ring rushes out and slows) and the fade is linear. Each pulse is 600 ms base, `effect` timing, and its own tween, so Analysis shortens every pulse (to 210 ms) instead of dropping any. It's drawn through `mark.set({ halo })` in the mark's own colour unless `color` names a theme token or a CSS colour.

- **Under 5 s.** Before each pulse it asks the motion how long the pulse will take (`motion.duration(600, "effect")`), and drops it, and the rest, if the pulses so far plus this one would end at 5 s or later. So a page's `createMotion({ scaling })` can't stretch it into something that needs a pause control (WCAG 2.2.2); with effects scaled ×2, 6 pulses become 4.
- **Never a size change.** It only sets the halo, never a transform, so a value never looks bigger than it is.
- **End state: nothing**, as for `flash`: a pulse is emphasis, and what it points at stays on the chart.
- `times` is a whole number from 1 to 6, `width` a finite number more than 0, and `color` a non-empty string; anything else throws a `RangeError`.

### threshold

```ts
threshold({ compareTo, when?, color? })   // on: { decorate: only("goals", threshold({ compareTo: "xg" })) }
```

`threshold` is the first data effect. It colours the parts of the mark's walk where its values are below `compareTo`, or above it with `when: "above"`: one overlay path per run, `mark.slice(t0, t1)`, stroked in `color` (default `"negative"`) at the mark's `thickness` with butt caps. On a bar that colours the part past a target across the bar's full thickness, with a square end over a rounded tip; on a line it lies exactly over the stroke and ends at the crossing.

- **The reference.** `compareTo` is a number, compared with every sample as it is, or a series' name, read through `data.related(name)` and listed in `needs.related`, so a chart without that series throws when it's created. A series is matched by `at` when every sample of both has a number or a `Date` there: the reference is interpolated between its samples (sorted by `at`), and nothing is coloured outside its range. Otherwise it's matched by `t`. A missing related series draws nothing.
- **Crossings.** Between neighbouring samples, and at the places in between where the reference has samples of its own (where it bends), both the mark's values and the reference are taken as linear in `t`, so each crossing is where their difference reaches 0. That's exact where the walk is straight between samples: bars, `describe.line` polylines, and a host polyline sampled at its vertices. Along a curve, values aren't linear in distance, so crossings between samples are approximate; denser samples narrow the error (M4 decisions 5 and 11).
- **Edge cases.** Equal values aren't coloured, and neither are values within 1e-9 of the reference, relative to their size, so float noise in a sum colours nothing. A sample whose value isn't finite colours neither leg beside it. A walk under 0.5 px (a point) draws nothing.
- **No animation.** It's an encoding, so it draws at once, with no tween; a fade would flicker as a line extends. It redraws on every `onChange` with the latest data, after a run and after `end()`, reusing its paths, so it follows a transition, a resize or a line being revealed. `end()` draws the same picture, so the colour shows with motion off. It belongs in `on.decorate`.
- `compareTo` must be a finite number or a non-empty string, `when` `"below"` or `"above"`, and `color` a non-empty string, or it throws a `RangeError` when it's made. It reads no row fields, so its type is `DataEffect` (rows `unknown`), which fits any chart.

### morph

```ts
morph({ points?, align? })   // chartSwitch's default transition
```

`morph` is the first transition effect: it turns one mark's shape into another's, as the lab's donut turns into columns. It reads only the two geometries' outlines, walks and pivots, so it morphs any mark into any other.

- **Two closed outlines** (bars, slices, points). Both are sampled with `outline.sample(points)` (default 160, 40 a side, the lab's), and each point moves in a straight line to its partner, drawn as one filled path in `"mark"`, the key's colour. At progress 0 the path is `from`'s own `outline.d`, at 1 `to`'s; in between it's the polygon through the moving points.
- **Which point is whose partner** (`align`, M5 decisions 1 and 10). `"unroll"` pairs point i with point i, so each side meets the same side: a slice's walk becomes a column's, and it stands up, its outer arc becoming the column's left side. `"drop"` turns the pairing by a quarter of the points, as the lab does: a slice's outer arc meets a column's top, so it settles onto the baseline. The turn goes from a mark that goes round its pivot to one that doesn't, whichever is `from`: a mark goes round its pivot when its `start`, `center` and `end` are the same distance from it, give or take 0.5 px, and more than 0.5 px away, the test the adapter's ring order uses. A slice does, a bar or a point doesn't. Between two marks that both go round their pivots, or neither does, `"drop"` pairs as `"unroll"` does. The polygon starts at the round mark's first point either way, and each coordinate is weighted on both sides (`x·(1 − p) + y·p`), so a run back from `1 − p` draws exactly the picture the run forward drew at p, to the last rounded digit.
- **The default `align` is `"unroll"`,** picked by comparing the two in the morph demo (`demo/morph.html`, M5 step 4). `"drop"` stays an option.
- **Two open outlines** (lines). Both strokes are sampled at `points` along their length, point i to point i, and drawn as one stroked path whose width moves from `from`'s thickness to `to`'s.
- **A closed and an open outline** crossfade: `from`'s own outline fades out as `to`'s fades in, the area always below the stroke, so a switch back draws the same picture. The end state is `to` alone, with no opacity.
- **Timing.** 950 ms base with `transition` timing (the lab's `dur(950)`: at most 200 ms in Analysis, a jump in Off), eased with `easeInOutCubic`. A run from `ctx.start` begins with the shapes at that eased progress, and takes the rest of the time a full run would: it starts at the linear time where the ease reaches `start` and ends when a full run would, so it takes its share of the *scaled* duration, as `playback()` does, and keeps a full run's speed in Analysis too (half a switch takes 100 ms there). It plays through one `ctx.tween()` of the whole 950 ms, finished early.
- **End state:** `to`'s own outline, filled or stroked as the mark is. `chartSwitch` then clears it and shows the real mark.
- **Motion off.** A run draws the end at once and asks for no frames; motion turning off mid-run jumps there on the next frame. An abort stops it where it is, and clearing removes its path.
- `points` must be a whole multiple of 4, at least 4, and `align` `"unroll"` or `"drop"`, or it throws a `RangeError` when it's made.

### Combinators

- `sequence(...effects)` runs the parts in order, each on the geometry and data as they are when it starts: the combination follows `onChange` from the start, so a part that starts after the mark moved (a transition, a line being revealed) doesn't start where the mark was. An abort stops the chain. `end()` draws every part's end state in order, and `clear()` clears every part, passing on the first error after all have run. A part with nothing to do finishes at once, so `sequence(travel(ball, { along: "goals" }), travel(cleat, { along: "assists" }))` tells the right story whether the bar shows goals, assists or both.
- `parallel(...effects)` runs the parts together and finishes when they all have, or rejects with the first part that does. `end()` and `clear()` work as for `sequence`.
- `only(filter, effect)` runs the effect only on marks whose key or series equals `filter`, or for which `filter(mark)` is true. Elsewhere it does nothing. It keeps the effect's kind and `needs`.
- `stagger(effect, { delay })` starts each mark of a batch a little after the one before; see [below](#stagger).

The parts share the run's context: one overlay group, one mark handle (whose `set()` merges fields, so parallel parts don't undo each other) and one signal. `Combined<E>` is the type `sequence` and `parallel` return: a data effect if any part is one, needing every part's row type at once (an intersection), so a generic part like `threshold()` can't widen a typed part back to `unknown`. A data combination's `needs.related` lists every part's. A part that isn't a mark effect (a transition effect, say) is a type error, and throws a `TypeError`.

### stagger

```ts
stagger(effect, { delay? })   // enter: stagger(pulse({ times: 1 }))
```

`stagger` makes the mark at `ctx.batch.index` wait `index × delay` ms (default 50) before the effect runs. The whole spread, `(count − 1) × delay`, is capped at 500 ms base, so in a big batch the delay shrinks to `500 / (count − 1)`. The wait is a tween with `stagger` timing, never a timer, so it's the base in Presentation and nothing in Analysis or Off. A batch of one, such as a hover, never waits.

- **Never a default.** Research finds staggering helps little and can hurt, so no chart, adapter or preset staggers; it's there for a page that asks.
- **While it waits** nothing is drawn. An abort ends the wait and the effect never runs. If the mark moves meanwhile (bars growing in on enter), the effect starts on the geometry and data as they are when its turn comes.
- **End state:** the effect's own, drawn at once by `end()`. `clear()` passes through.
- It keeps the effect's kind and `needs`, like `only`: a data effect stays a data effect with the same row type. A part that isn't a mark effect throws a `TypeError`, and a `delay` that's negative or not a finite number a `RangeError`.

### Drawing API

Effects touch the screen only through the context. It's deliberately small and renderer-neutral, so Canvas can implement it later without changing any effect.

- `layer.icon(icon, { size })` draws an icon, hidden until the first `place(transform)`. **Size rule:** the icon is scaled by `size / icon.size` about its anchor, in icon space, *before* the `place()` transform. So an effect builds the transform as if the icon were its natural size, and the anchor still lands where the transform puts it; icon-space lengths (footprint, radius) scale by the same factor. Each shape is one path; an unset `fill` or `stroke` draws none, `width` is in icon units, and `clip` is path data in icon space.
- `layer.path(d, paint)` draws an overlay path, unfilled unless `paint.fill` is given; `update(d, paint?)` replaces the path data and merges the paint fields given.
- `layer.text(content, style)` draws text in the theme text colour by default, with `at` on its baseline; `update(style, content?)` merges the style fields given. Series colours are for swatches, never for words.
- `mark.set(style)` changes only the fields given, so effects running in parallel don't undo each other's transform or halo. A field given as `undefined` goes back to its default. `mark.reset()` restores the mark's own style. `transform` (chart space) and `opacity` apply to the mark's body, so its labels and pointer target stay put; `emphasis` mixes toward the strong colour; `halo` strokes the outline behind the mark, `width` being the stroke width (half of it shows outside). On a reference chart's open outline (a line), `emphasis` mixes the stroke's colour, and the halo is stroked the line's own width wider, with round caps, so as much shows on each side as round a closed mark.
- Colours are theme tokens (`"text"`, `"text-muted"`, `"negative"`, `"series-3"`, `"series-3-strong"`, and `"mark"` / `"mark-strong"` for this mark's colours) or any CSS colour.

The runner empties the layer and resets the mark when a run is cleared, so cleanup happens even if an effect forgets. The SVG implementation is in `src/charts/render/` (see [Rendering](#rendering)).

### Testing effects without a DOM

`src/core/testing` has in-memory versions for effect tests. `testContext`, `play` and the recording types are public, re-exported from `expressive-charts/testing` with the conformance suite (below); the rest is internal.

- `recordingLayer()` and `recordingMark()` record every call and keep what's drawn now. `picture()` gives that as plain data with numbers rounded, so a full run can be compared with `end()`.
- `testContext({ mode, scaling, icons, batch, previous })` is a complete `EffectContext` on a manual clock, with `abort()`, `clear()` and `change(mark)` (fires `onChange`). It's built on the same run scope the runner gives every run, so `clear()` is exactly the runner's cleanup after `effect.clear(ctx)`.
- `recordingSurface()` is a `RunnerSurface` whose groups are recording layers and whose marks are recording marks, for runner and chart tests.
- `measurePath(d)` measures the path data the geometry writes: length, start, end and commands.
- `play(clock, running)` advances a manual clock a frame at a time until a run settles, letting promise callbacks run between frames, and resolves with the ms it took.

**The conformance suite**, `expressive-charts/testing` (`src/testing/`, its own build entry), runs plan §8's checks for any effect: `checkEffect(effect, { marks, icons, data, batch, moved, name })`. On every mark it checks that:

1. a full run ends with the same picture and mark style as `end()` (pictures as `picture()` gives them; styles rounded the same way, key order and unset fields ignored);
2. clearing (`effect.clear(ctx)`, then the runner's cleanup) leaves nothing drawn and the mark's own style, and nothing comes back over the next three frames;
3. an abort two frames in settles the run without more frames, as a resolve rather than a rejection, and clears to nothing with no frames left running;
4. with motion off, the run asks for no frames and draws what `end()` draws;
5. after a full run, and after `end()` with motion off (what the runner draws instead of running), a `change()` to the mark moved somewhere else leaves the picture and mark style `end()` draws on the moved mark, once any animation the change started has finished. So an effect that should stay attached is checked to follow `onChange` (M4 decision 11).

It imports no test runner: it resolves when everything passes, and otherwise rejects with one `Error` listing each failure (the mark, the check and what differed), so it works in Vitest, Jest, `node:test` or Mocha. A test removes the runner's globals while it runs to keep it that way.

- **Marks.** `fixtures` by default: a bar, a negative bar, a column, a stack with a gap, a 6 px bar, a donut slice, a line and a point. `marks` takes named marks, or a list such as `chart.marks()`, each named by its key.
- **Moved marks.** Each fixture has a moved twin (internal, in `src/testing/fixtures.ts`): the same key and series, somewhere else and another size. The bars are a row lower and shorter, the stack's segments in another ratio, the slice turned on a smaller ring, the line rescaled with a fifth point, and the point moved. `moved(mark)` gives other marks theirs, such as the same chart drawn at another width; without it, check 5 is skipped on them. A data effect's change gets `data(moved)`.
- **Icons.** None by default, so the suite doesn't bring in `src/icons`; `icons` gives the ones an effect looks up by name.
- **Data effects** get `data(mark)`, or by default no datum, samples from 0 to 1 and no related series. An effect that `needs` related series without `data` throws a `TypeError`, and one typed for its own rows without `data` is a type error.
- **Batch.** `batch` places the mark in its event's batch, so a staggered effect waits its turn first.
- Also a failure: `run()` not returning a promise, a run that hasn't settled after 10 s, and anything that throws.

**Transition effects** have `checkTransition(effect, { pairs, icons, name })` (M5 decisions 5 and 14). On every pair, from a to b and from b to a, it runs checks 1 to 4 above, on contexts with `start: 0`, and a run from `start: 0.5`, which must end as `end()` draws. Then it checks that the effect **retraces**: at p = 0.25, 0.5 and 0.75, a run from b to a from `start: 1 − p` must begin, before its first frame, with the picture a run from a to b begins with from `start: p`, which is where a full run is at p. So a switch back mid-way doesn't jump, and a pairing that depends on which mark is `from` fails. Check 5 doesn't apply: a transition's `onChange` never fires.

- **Pairs.** `fixturePairs` by default: a slice and a column (a mark that goes round its pivot and one that doesn't), a bar and a column, two slices, two lines and two points, the second of two alike being the first's moved twin. `pairs` takes named pairs `[a, b]`, or a list, each named by its marks' keys.
- **Contexts** are `testContext()`s with `start`, so a page's own transition tests can make one the same way: `{ ...testContext(), start: 0.5 }`.
- The report names the pair, which way, the check and what differed; for long path data, the place where the two parted.

`src/effects/conformance.test.ts` runs `checkEffect` for every built-in effect (`travel` with each gait and option, and by icon name; `flash`; `wiggle`; `pulse`; a staggered `flash` on the third mark of five; `threshold` against a constant, above in a colour, against a related series, and with a riding ball; and combinations) on the fixtures, and `checkTransition` for `morph` with each `align`, and with 8 points, on the fixture pairs. `src/conformance.test.ts` runs it for the same effects on real marks: bars from `barChart` and `expressive()`, and slices from `donutChart` and a D3 pie through `expressive()`, each drawn again at another size for check 5, with no change to the effects. `src/effects-guide.test.ts` runs it on the guide's worked examples.

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
- **Changes.** `change(mark, data?)` hands every live run of the mark the new geometry and the mark's latest data: the data given, or else the last seen. An `update` run's data keeps the previous values it was given, so an effect that reads them on a change still compares with the values before the update.
- **Off.** When the effective mode is `off`, the runner calls `end()` instead of `run()`, on a fresh context. If the mode turns off mid-run (the device asks for reduced motion, or the viewer picks Off), runs still going are cleared and replaced by `end()` on a fresh context with the mark's latest geometry; finished runs keep what they drew.
- **Data transitions.** `interrupt()` clears hover runs, and a hover that arrives during the transition waits. `settle()` replays hover, in the order the marks were hovered, on the marks still hovered or focused, with their latest geometry. Other runs keep going, and decorations follow every `change()`.
- **Exit.** `exit()` clears the mark's other runs (hover too), runs `exit`, then clears that and forgets the mark. Its promise resolves when every exit is done, which is when the chart removes the elements. A leaving mark can't be hovered, and one that re-enters mid-exit cancels its exit.
- **Errors.** An effect that throws or rejects, in `run`, `end` or an `onChange` listener, is reported (with `reportError`) and its run cleared; other runs and marks carry on. An error in `clear()` is reported and the cleanup continues. A rejection caused by the run's own abort isn't reported.
- **Mark styles merge.** Every live run's `mark.set()` fields are merged into the mark's one style handle. When two runs set the same field, the one that started later wins; when it's cleared, the earlier run's value comes back. A run that `end()` replaces when the mode turns off keeps its place.

Each run's `EffectContext` has its own `signal`; the motion view; `tween()` bound to the clock, the motion and the signal (a tween given its own signal is still cancelled with the run); its own `layer` group and `mark` handle; the icon source; `batch`, the mark's position among the marks in that call; and `previous` on update runs. Data effects also get the mark's `MarkData`. On update, `previous` (geometry) and `data.previous` (values) come from the chart, or else from the last geometry and data the runner saw for that key.

The renderer implements `RunnerSurface`: `group(key, slot, order)` returns a new overlay group for one run, asked for on the run's first draw and cleared once when the run is. Groups stack by `order`, the run's start order, rather than by when they were asked for, since a decoration may first draw long after it started. `mark(key)` returns the mark's style handle. `svgSurface()` in `src/charts/render/` is the SVG one, and can also hide a key's groups, as the line chart does for points past its reveal; `recordingSurface()` in `src/core/testing` is an in-memory one.

### Playing transitions

`src/core/transition.ts` plays a [transition effect](#transition-effects) on pairs of marks (M5 decision 9). It's internal, beside the runner: [`chartSwitch`](#switching-between-charts) uses it.

```ts
const transition = playTransition(pairs, { effect: morph(), surface, start: 0, motion, clock, icons });
await transition.finished;   // every pair finished (its end state stays drawn) or was cleared
transition.clear();          // abort, effect.clear(ctx), empty every group
```

- **One run per pair**, on a context of its own built on the runner's `runScope`: `signal`, `motion`, `tween()`, a `layer` group, `icons`, `batch` (the pair's place among the pairs) and `start`. Its `mark` handle does nothing and `onChange` never fires.
- **Off.** With motion off, `end()` draws on the context instead of `run()`. If the mode turns off mid-run, runs still going are cleared and replaced by `end()` on a fresh context, in the same group order; finished runs keep what they drew. The player follows the mode only until every run has settled.
- **Clearing** aborts every run, calls `effect.clear(ctx)` and empties its group, even if the effect forgets; draws after that are ignored. `finished` resolves then too, and it never rejects.
- **Errors.** An effect that throws or rejects on one pair, in `run` or `end`, is reported and that pair cleared; the others carry on. An error in `clear()` is reported and the cleanup continues. A rejection caused by the run's own abort isn't reported.
- An effect that isn't a transition throws a `TypeError`, and a `start` outside 0–1 a `RangeError`.

The overlay implements `TransitionSurface`: `group(key, order)` returns a new group for one pair, in overlay coordinates, asked for on the run's first draw with the pair's key (`to.key`), so `"mark"` is that key's colour. Groups stack by `order`, the pair's index.

## Presets and icons by name

A slot can name a preset instead of holding an effect, `on: { hover: "wiggle" }`, and an effect can name an icon, `travel("cleat")`. Charts resolve names through registries the composition root (`src/index.ts`) hands them, so a chart never knows what a name means.

- `registerPreset(name, factory)` makes a name usable in any chart's `on`. The factory returns a fresh effect that works on any rows. The built-in presets are exactly `flash`, `wiggle` and `pulse`, each that effect with its defaults; none combines effects, draws an icon or staggers.
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

Our charts are in `src/charts`. They import only from core, and the composition root (`src/index.ts`) hands each one a `ChartEnv`: the preset and icon registries and the page-wide motion. So a chart never imports an effect or a registry. Every chart has `update(next)`, `on(type, listener)`, `marks()` (in visual order, as they are on screen now, so part way through a transition while one plays), `focus(key)`, `labels()`, `element` (the `<svg>`) and `destroy()`.

- **`focus(key)`** moves focus to the mark `key` as a key press would, whatever the last input was, as the [adapter's](#adapters) does: the focus ring shows and its hover plays (`source: "keyboard"`), even on a mark already focused from a click. On the [line chart](#line-chart) the x takes focus, for the x's key or one of its points' (`"12"` or `"goals@12"`); a line's key isn't one x's, so it does nothing. So does a key that isn't on screen: unknown, leaving, or past a line chart's reveal. It's the keyboard's own `focus(key)`, through the shell's hover.
- **`labels()`** gives each mark's labels as drawn now, in the marks' visual order (leaving marks left out): `{ key, role, text, x, y, anchor, element }` (`ChartLabel`). `role` is `"category"` (the mark's name) or `"value"`; `x`, `y` and `anchor` place the `<text>`'s baseline in the chart's `<svg>`, in its viewBox units, unrounded (its attributes are rounded to 0.001); and `element` is the `<text>` itself, so a copy keeps the stylesheet's styling. A bar has its category and its value, a slice its category and share outside the ring (the centre's total is no slice's), and a line its end label, as its value. A label that isn't shown (a slice's dropped for room, a line's with `labels: false`) or has no text is left out. Part way through a change they're where they're drawn, counting as they go. A [chart switch](#switching-between-charts) moves them from one view to the other.
- **Hiding the marks.** While the `<svg>` has the class `ec-morphing`, the shared stylesheet hides its marks and their labels ([Rendering](#rendering)), so no chart needs a method for it.

What a chart does that doesn't depend on the shape of its marks is shared, in `src/charts/shell/`, so `barChart`, the donut and the line chart behave alike. Each module is a function or a small factory that takes callbacks (no base class), and none names a chart type or an effect. `events.ts` keeps the listeners and emits events in batches. `hover.ts` is the one hover that pointer, touch and keyboard focus share, as described for bars below: the emphasis and dimming, the runner's hover and leave, the focus ring's mark and the tooltip, with the chart finding marks and drawing the ring and tooltip. What it hovers is a target, which stands for one mark or for several hovered together: a bar or a slice is its own mark (the default), and a [line chart](#line-chart)'s x stands for each series' point there. Each of the target's marks gets `ec-hot`, a hover run in one batch, and a `hover` event with its place in that batch (`batch.index` of `batch.count`); leaving ends them all, with `leave` events batched the same way. If the marks a hovered target stands for change (a series added by an update), the ones it lost are left and the new ones hovered. The keyboard still moves between targets, as one tab stop. `transitions.ts` keeps one transition in flight, draws every frame until its tweens settle, then lands, settles the runner and resolves the waiters; its `playUpdate` plays an update through the runner in the order it expects. `leaving.ts` keeps a leaving mark until it has faded out and its exit effects are done. `order.ts` puts marks in visual order in the DOM without moving the focused one. `watch.ts` follows the container's width, web fonts and the hover duration. `setup.ts` and `format.ts` hold `ChartEnv`, the container, the chart's accessible name, the check of the options every chart shares, the `needs.related` check, the default `format` and a share as a whole percent. `transitions.ts` also has the small tests a chart's retarget makes (whether a value still has to move, whether a mark's geometry changed). The layout, the marks' drawing and the staging of a change stay in each chart. Marks that touch, such as slices, have their focus ring and halos drawn above them and masked to outside the mark (`src/charts/render/outside.ts`), as the adapter's are.

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
  - **Labels.** Each mark's `aria-label` gives its category and its values in the chart's `format`, each with its series' label, "Okafor: 16 goals, 4 assists" (a lone value read by a function has no series name unless `seriesLabels` gives it one: "Okafor: 16"). It changes as soon as an update starts.
  - `markLabel(d, mark)` words it instead, so a page can say "1 goal". It's given the row and the mark as it's heading (a `MarkSummary`): its `key` and `category`, `values` (each series it shows, from the baseline, so a new stack names only the new series, with its `label`), `total`, the chart's `format`, and `text`, the default name. It's called for every mark when the chart is drawn and as each update starts, never per frame; `update()` can change it.
  - An empty or blank result keeps the default name, and so does a throw, which is reported as a tooltip function's is. A focusable image with no name fails WCAG 4.1.2, so clumsy wording beats none. (A tooltip function's empty string means no tooltip, because a mark without one loses nothing.)
  - The default keeps the field names as they are, so a value of 1 reads "1 goals". The chart can't make a singular from a field name (it may not be an English noun, or a noun at all), and naming the series first ("goals 1") would read worse in the common case. Pages that care pass `markLabel`. `seriesLabels` renames the series everywhere, but can't make "1 goal" either.
  - **Why `markLabel`.** The plan called it `describe(d)`, but `describe` is already the geometry builders' namespace, and in ARIA a description is something else: a tooltip function's text is the mark's `aria-describedby`. `markLabel` pairs with `label`, the chart's own name, and isn't tied to SVG attributes the way `ariaLabel` would be. `expressive()` takes a `markLabel` too, for host marks ([Adapters](#adapters)).
  - Focus events are heard on the document (or the shadow root the chart is in), not on the `<svg>`: Chrome makes an SVG element with focus listeners of its own a tab stop.
- **Tooltip** (`src/charts/tooltip.ts`). An HTML box beside the hovered or focused mark, so pointer, touch and keyboard hover all show it: it follows a touch tap until a tap elsewhere, and hides on leave, Escape and blur.
  - It's placed from the mark's `bounds` and `center` as they are on screen, so it follows the mark through a transition: centred on the mark and 12 px above it, or below it when there isn't room above (when neither side has room, the side with more). It's clamped to the chart's left and right edges, but never moved over the mark it describes. It moves with an effect's `transform` on the mark, as the focus ring does, but keeps the side it has at rest, so a wiggle near the edge can't flip it back and forth.
  - A chart can also show it at a point instead of beside a mark: centred on an x, above a top or, without room there, below a bottom, in the `<svg>`'s units. The [line chart](#line-chart)'s crosshair places it over the highest of the points it crosses. The default text can leave the total out, for series that don't add up.
  - It sits in `<div class="ec-tooltip-layer">`, a positioned, zero-height layer just after the `<svg>`, made the first time it shows. Its place is worked out in px from the boxes of the `<svg>` and the layer, so it lands right on a scaled `<svg>` and whatever the page's layout.
  - `tooltip` defaults to `true`: the category in bold, each series' value in `format` with its label ("16 goals · 4 assists"), and the total for a stack. A function `(d) => string` gives a row's text instead, with `\n` for line breaks. Its result is only ever set as `textContent`, never parsed as HTML. An empty string shows nothing, and a function that throws is reported and shows nothing. `false` turns it off; `update()` can change it.
  - The box is `aria-hidden`, so it isn't read twice. A tooltip function's text is also, by default, each mark's accessible description: `aria-describedby` points to a `<desc class="ec-description">` inside the mark, kept in step with updates, so whatever it adds beyond the values (a player's position, say) reaches screen readers.
  - `markDescription` decouples the two. A tooltip that repeats the values the mark's name already says would otherwise be read twice: "Okafor: 16 goals", then "Okafor · Forward, 16 goals". `markDescription: (d) => d.pos` describes with only what the name doesn't say. `false` describes nothing, and so do an empty string and a throw, which is reported. The demo uses it.
  - **Why the default stays the tooltip's text.** Without it, a custom tooltip's extra facts would be visible only, which loses information for screen-reader users. Reading something twice is the smaller harm, and `markDescription` removes it. The default text describes nothing, because the mark's `aria-label` already has its values (and the data table has the total).
  - Showing and hiding fade over `motion.duration(100, "feedback")`, so they're instant with motion off. A function is called once per row and data change, not on every frame.
  - Its styles use theme tokens: `--ec-surface`, `--ec-text`, and a hairline border in `--ec-ring`, so it follows light and dark like the chart.
- **Series labels** (`src/charts/series.ts`). A series is named after its field (a function's value is `"value"`), which is often an identifier: `xg`, `revenue_usd`. `seriesLabels` gives each a name for people, `{ goals: "Goals", xg: "Expected goals" }`, used as given wherever the chart names a series: the legend, the table's column headers, the default tooltip and mark names ("16 Goals · 4 Assists"), and the announcement of new series ("Showing Goals and Assists"). A series without one keeps its own name.
  - Keys don't change: segments' `data-series`, colours, `stack`, a hover event's `segment` and data effects' `related` all go by the series' own names. Labels for series the chart doesn't show yet are fine, so a page can name every metric up front.
  - It's used as given, with no change of case: a heading ("Goals") and a count in running text ("16 goals") want different cases in English, and the chart can't know which a language wants. The default tooltip and mark names follow the label ("16 Goals"); a page that wants "16 goals" there words them with `tooltip` or `markLabel`, whose `values` carry each label.
  - A lone value read by a function goes unnamed unless it's labelled: `seriesLabels: { value: "points" }` gives "Okafor: 16 points".
  - `update()` can change it: the legend, table and names follow as the update starts. New labels for the same series show the same view, so they aren't announced. Each label must be a non-blank string; anything else throws, and `update()` rejects.
- **Legend** (`src/charts/legend.ts`). A swatch and a name (the series' label) for each series, in stack order, in `<div class="ec-legend">` just before the `<svg>`. A single series has none. With `colorBy: "category"` it lists the categories instead, as the donut's does (see Colours below). `legend: false` turns it off.
  - The swatches take their colours from the chart's `ColorAssignment`, through `--ec-mark` as the segments do, so a series keeps its colour when the stack changes. The names are in `--ec-text`: text never takes a series colour.
  - **The page's entries.** `legend` is one of the options every chart shares. `legend: { entries: [{ label, color }] }` adds entries after the chart's own, for colours the page's effects draw, which a chart can't know about: `{ label: "Goals below xG", color: "negative" }`. `color` is a theme token (`"negative"`, `"series-3"`) or any CSS colour, set on the swatch as `--ec-mark`; `"mark"` and `"mark-strong"` throw, since an entry has no mark of its own. Each label must be a non-blank string. With entries, a single series is listed too, so its colour is named beside theirs. The page's entries have no `data-series` or `data-key`.
  - It follows `stack`, `colors` and `legend` as soon as an update starts. A rejected update leaves it as it was.
- **ARIA structure.** The `<svg>` is `role="group"`, named by `label` (`aria-label`) and described by `description` (a `<desc>`). Each mark is `role="img"`, named by its `aria-label` (the default name or `markLabel`'s) and described by `markDescription`'s text (by default a tooltip function's), and takes focus with the roving tabindex. Its text and shapes are `aria-hidden`, so its name is all that's read: "Okafor: 16 goals, 4 assists", never "Okafor" and "16" on their own. The grid, axis, focus ring and overlay are `aria-hidden`, and so is a mark while it leaves.
  - **Why `group` and `img`.** They're core ARIA, so every screen reader knows them. `img` has presentational children, so a mark is read as one item in browse mode too. Two alternatives were left out. The graphics roles (`graphics-document`, `graphics-symbol`) are mapped unevenly: browsers map `graphics-symbol` to an image, but screen readers announce `graphics-document` inconsistently, and an unsupported role falls back to nothing. With `list` and `listitem`, NVDA and JAWS often read a list item's text rather than its `aria-label`, so a bar would lose its units, and a list item isn't expected to take focus. The NVDA + Chrome check in [a11y-check.md](a11y-check.md) confirmed them; VoiceOver + Safari hasn't been run.
  - In NVDA's browse mode the arrow keys move NVDA's own cursor, which reads the next mark, rather than reaching the chart. Focus mode passes them to the chart, which moves focus and plays the story.
- **Data table** (`src/charts/table.ts`). The fallback every screen reader can read. `table` defaults to `true`: a closed `<details class="ec-table">` "Data table" after the `<svg>`, holding a `<table>` that scrolls sideways when it's too wide.
  - **Contents.** A `<caption>` from `label`, visually hidden, since the chart's own title is beside it. Column headers (`<th scope="col">`): the category, any extra columns, each series (by its label), a total when there's more than one series, then any extra columns placed after the values. The chart decides whether there's a total: one whose series don't add up, as a line chart's goals and xG won't, leaves it out. Each row's category is its header (`<th scope="row">`). Values are in the chart's `format`. Numbers are right-aligned, and so is an extra column holding only numbers. Text is set as text, never as HTML.
  - **Following the chart.** Rows are in visual order, so the table follows the sort. It changes as soon as an update starts, with the data, `stack`, `format`, `label` and `table`. Rows are kept by key and only changed cells are written, so an open table, and a screen reader's place in it, stay.
  - **Options.** `"hidden"` (or `{ hidden: true }`) keeps the table out of sight but still read: a visually hidden `<div>` instead of the `<details>`, since a closed `<details>` hides its contents from screen readers too. `false` removes it. An object adds `columns`, each `{ label, field, format?, after? }`, where `field` is a field name or `(d, i) => value`. They go after the category, as the prototype's position did, or, with `after: "values"`, last: after the series, the total and a donut's share, as the prototype's Difference column is. The donut's total row leaves their cells empty. Numbers in them use the chart's `format` unless the column has its own, and `null` or `undefined` shows nothing. It can also name the category header (`category`; default: the category's field name, or "Category" when a function reads it), the total header (`total`, default "Total", which also heads the [donut's](#donut-chart) total row), the donut's share header (`share`, default "Share"), and the summary (`summary`, default "Data table").
  - A column that throws makes `barChart()` throw, and `update()` reject, changing nothing.
  - Its styles use theme tokens: `--ec-text` for cells, `--ec-text-muted` for headers and the summary, `--ec-grid` for row rules, and `--ec-focus` for the summary's focus ring.
- **Announcements** (`src/charts/announce.ts`). `announce: true` adds a polite live region: a visually hidden `role="status"` (`aria-live="polite"`, `aria-atomic="true"`) beside the `<svg>`, which sums up each update as it starts. It's off by default.
  - **The chart's summary** is a sentence for each kind of change, joined with ". ". A new `label` is said as it is; otherwise new series are named by their labels ("Showing goals and assists"). Then the sort ("Sorted A to Z", "Sorted highest first", "In data order", "Sorted" for a comparator). Then the marks whose values changed: by name up to three ("Okafor and Tanaka changed"), counted past that ("5 of 8 changed"). That's skipped when the series changed, since every value did. Last come marks added and removed ("Added Novak. Removed 4"). An update that changes none of these says nothing.
  - **A function** `(change) => string | undefined` writes the page's own text instead. It's given the chart's summary (`text`) and the keys `changed`, `added` and `removed`, so a page can say "Matchweek 25: Okafor and Tanaka changed". It's called while `update()` runs, before it returns. An empty string or `undefined` says nothing; a function that throws is reported and says nothing.
  - The same text twice in a row is announced twice. Turning `announce` on with `update()` makes the region, and it announces from the next update, since screen readers miss text in a region that appears with it. Turning it off removes it.
- **Updates.** `update(next)` merges the options and checks them (if it can't draw the result, it rejects and changes nothing), then animates to the new state, calling the runner in its order: `interrupt()`, `exit` / `update` / `enter` as the change starts, `change()` on every frame for each mark whose geometry moved, `settle()` once it has settled. An `update` event means the mark's values changed; a re-sort or a new scale only moves it. `on` and `motion` can't be changed by `update()` yet.
  - **Presentation** (`motion.staged`) splits the change into two stages of 500 ms base each, `transition` timing. Values: bars resize, leaving bars shrink to zero and their labels fade, the scale retargets, and ticks the scale gains or loses fade in or out. Positions: rows move to their new slots, the bands and the chart's height follow, and entering bars grow in at their slots, their labels fading in, during the second half. A stage with nothing to do is skipped, so a re-sort alone takes 500 ms.
  - **Analysis** runs everything at once, as one stage as long as the stages it has to do together, which the scaling table caps at 200 ms. **Off** (including reduced motion with no viewer choice) jumps: everything lands before `update()` returns. So does a change of orientation.
  - **State.** Each mark keeps one `animated` value per property: its values by series (in data units, so a bar always reads true against the axis mid-change), its slot, and its presence (the labels' opacity as it enters or leaves). The chart keeps one each for the scale and the bands, and one opacity per tick. A stack that gains or loses a series keeps the old ones in place until they've shrunk away. In-between values are clamped where `describe.bar` can't draw them (a stack crossing zero mixes signs for a moment; values against the total's sign draw as 0). A mark that stays has its value label count between its totals; one entering or leaving shows its own value as it fades.
  - **Frames.** Every frame writes what moved, all in chart space: `d` for the segments, and positions for the labels and the pointer target. Rows move by their geometry rather than a group `transform`, because each frame needs the chart-space geometry for `change()` anyway, and an effect's own `transform` on the mark is in chart space too. When the transition settles, the chart draws exactly the layout.
  - **Interruptions.** Another `update()` mid-change retargets every value from where it is now, so nothing jumps, and stages again from there: values not yet at their targets take a values stage first. The earlier `update()`'s promise resolves at once. A resize mid-change lands it at once (resizes never animate).
  - **Leaving marks** stay, unhoverable, until they've faded out and their exit effects have finished; one that comes back meanwhile keeps its element and grows back from where it is. The promise resolves when the change has settled and the marks it removed are gone, or as soon as another `update()` supersedes it.
- **Colours** follow the series through a `ColorAssignment`: `colorAssignment(fixed?)` gives each key a palette slot (1–8), pinned or the next free one in the order keys are first seen, and never reassigns it. `colors` takes pinned slots or a shared assignment.
  - **By category.** `colorBy: "category"` (the default is `"series"`) gives each bar its own slot instead, by its key (its category unless `key` is given), as the [donut](#donut-chart) colours its slices. So one assignment shared with a donut keeps each category's colour in both: the shot outcomes' columns match their slices, whichever chart meets them first. `colors` then pins slots by key.
  - The chart then never asks the assignment for its series' slot, so the series' name (`"shots"`) can't take a slot a shared assignment would give a category.
  - The legend lists the categories in the bars' order (`data-key`), then the page's `entries`, as the donut's does; one category is listed too.
  - It needs one series. On a stack it throws (a `TypeError`), and `update()` rejects a stack with it, changing nothing: a stack's segments colour by series. `update()` can switch between the two, and every bar takes its new colour on the change's first frame.
- **Motion.** `motion` takes a `Motion`, or a mode as this chart's author default: the viewer's choice on the page-wide motion and the device's reduced-motion setting still win, as they do over `setMode()`.

### Donut chart

```ts
donutChart("#shots", { label: "Shot outcomes", data: outcomes, category: "outcome", value: "shots", sort: "value", on: { hover: travel("soccer-ball"), update: "flash" } });
```

`donutChart` (`src/charts/donut.ts`, with the pure `donut-layout.ts`) is built on the same shell as the bar chart, so hover, focus, the tooltip, transitions, leaving marks, sizing and the update order behave alike. What differs:

- **Encoding.** `category` (a field or a function) names each slice, and is its key unless `key` is given; keys are converted with `String()` and must be unique. `value` (a numeric field or a function) sizes it. A slice's `series` is the value field's name, or `"value"` for a function, as a plain bar's one segment is. A missing value counts as 0, and a negative or non-finite one throws. A total of 0 draws no slices: they're still marks, named and in the table, with no angle.
- **Shape.** Each slice is a `describe.arc`, in the `d3.pie()` convention, so effects get the same geometry from our donut and from a D3 pie: from 12 o'clock, clockwise, in data order (`sort: "none"`, the default) or largest first (`sort: "value"`, ties in data order). The inner radius is 0.6 × the outer, as in the prototype. Slices are separated by 2 px strokes in `--ec-surface` rather than `padAngle`, so the angles stay true to the data. A slice with no angle draws nothing, not even its separator.
- **Layout.** 300 px high unless `height` says otherwise, as wide as the container (or `width`), with the ring centred. The ring is as large as the room left for labels allows wherever they land (the widest category beside it, a label's height above and below it), so it keeps its size as values change. When that leaves less than half the radius the chart could have, the ring takes half, and labels that don't fit are dropped. A resize re-lays out on the next frame, without animating; the labels' room is measured again once web fonts load.
- **Labels.** Outside the ring, the category over its share as a whole percent, on slices of 15° or more, in theme text colours. A label sits 10 px out at its slice's middle angle and leans away from the ring the way the slice points (beside it at 3 and 9 o'clock, above it at 12, below it at 6, and smoothly in between), so it never jumps as its slice turns. A label that would overlap the one before it, or going round the first, is dropped; every slice is still named in the legend, the tooltip, the table and its ARIA name.
- **Centre.** `center` is the text in the hole for the total: `(total, format) => string`, with `"\n"` between lines and the first line drawn large (26 px, shrunk to fit a narrow hole), or `false` for none. The default is the total in `format` over the value's series label ("406" over "shots"; the total alone for an unlabelled value read by a function). It's `aria-hidden`, and its text is added to the chart's description, after `description`, so the total is heard on entering the chart. A function that throws is reported and shows nothing.
- **Colours** are per slice, through a `ColorAssignment` keyed by the slice's key (its category unless `key` is given): `colors` takes slots pinned by category, or a shared assignment. A [bar chart](#bar-chart) with `colorBy: "category"` colours its bars the same way, so one assignment shared with it keeps each category's colour in both.
- **Legend.** One entry per category (`data-key`), in the slices' order, then the page's `entries`. One category is listed too, since the entry names its colour. `legend: false` turns it off.
- **Hover and keyboard** are the bar chart's. A slice is its own pointer target, and its label hovers it too; hover events carry no `segment`. The arrow keys go round the ring clockwise from 12 o'clock, so they follow `sort`: Right and Down to the next slice, Left and Up to the previous, Home and End to the ends, with no wrap-around.
- **Focus ring and halos** are drawn above the slices, masked to outside the slice (`src/charts/render/outside.ts`, shared with the adapter), so they show evenly on every side; behind a slice they'd hide under the neighbour drawn after it. The ring is 2 px in `--ec-focus`, 2 px out, and takes an effect's `transform`. It can cover a 2 px band of a neighbour, which is dimmed while a slice is focused. While it runs, a halo (`flash`, `pulse`) can cover half its width of a neighbour.
- **Accessibility.** As on bars: the `<svg>` is `role="group"` named by `label`, and each slice `role="img"`, named by its category, its value in `format` with its series' label, and its share: "Saved: 112 shots, 28%". `markLabel(d, slice)` words it instead, given the bar chart's `MarkSummary` plus `share`, from 0 to 1. The tooltip is the category, then "112 shots · 28%". The data table lists the category, the value and a Share column, with a total row in `<tfoot>` whose first cell is its row header: "Total, 406, 100%".
- **Data effects** get the slice's row and samples from 0 at the start of its walk to its share at the end; `related(series)` finds only the slice's own series.
- **Updates.** `update()` merges and checks the options, and calls the runner in the same order as the bar chart. Each slice's name is worked out with the layout and the table, before anything changes, since with `table: false` and `center: false` it's the first thing to call `format`: a `format` that throws makes `donutChart()` throw, leaving nothing behind, and `update()` reject, changing nothing. Values animate in data units, so slices stay joined and every frame's angles are true shares. `update` fires only for slices whose own value changed, not for ones whose share moved because others changed.
  - **Presentation** has two stages of 500 ms base, `transition` timing. Values: slices resize, joined in the order they were in, and leaving slices shrink to nothing where they are. The turn: slices turn the shorter way round to their places in the new order (like bars passing each other when sorted, they can overlap as they go), the ring resizes, and entering slices grow in at their places in the second half. A stage with nothing to do is skipped, so a re-sort alone takes 500 ms. The total in the hole counts between totals.
  - **Analysis** runs one stage of at most 200 ms, and **Off** jumps: everything lands before `update()` returns.
  - **State.** Each slice keeps one `animated` value for its value, one for how far it has turned, and one for its presence (its label's opacity). The slices in the ring are laid end to end from their values; a slice still turning is part way from its start in the order it turns from to its start in the ring, the shorter way, chosen once so it can't flip mid-turn. So another `update()` mid-change carries on from where every slice is, and nothing jumps: slices still joined in the values stage go on from there, and slices turning turn on from where they are.
  - A donut whose total grows from 0 (or falls to it) shows its true shares from the first frame (or to the last): there are no shares to sweep through.

### Line chart

```ts
const chart = lineChart("#xg", { label: "Goals vs expected goals", data: weeks, x: "week", series: ["goals", "xg"],
  on: { decorate: only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on" }))) } });
chart.reveal(24.5); // the data up to week 24.5, as playback drives it
```

`lineChart` (`src/charts/line.ts`, with the pure `line-layout.ts`) is built on the same shell as the bar chart and the donut, so the tooltip, transitions, leaving marks, sizing and the update order behave alike. What differs:

- **Encoding.** `x` is a numeric field or a function, and `series` lists numeric fields. There's one row per x, drawn in ascending x whatever the data's order. `key` defaults to the x, is converted with `String()`, and must be unique; so must the x values, whatever the keys, since each x is one focus stop, one hit column and one place to reveal to. A missing or non-finite value throws: a line can't count it as 0 the way a bar does, and gaps are backlog. Dates on x come in M6. There's no `pointer` option: the crosshair is the line chart's hover.
- **Marks.** Each series is a line mark keyed by its field: a `describe.line` through its rows, 2.25 px wide with round joins and butt caps, so a coloured part ends exactly at its data. Each row's value is a point mark keyed `"<series>@<row key>"` (`goals@12`): a `describe.point` of radius 4.5, ringed in `--ec-surface` and hidden until its x is hovered or focused. A point is a dot, so `travel` does nothing on it and `threshold` draws nothing, while halos and `wiggle` still work: `only("goals", …)` matches the goals points too, and acts on the line alone. `marks()` gives the lines, then the revealed points by x. Series and keys that would join into the same point key throw, and so does a row's key that is also a line's or a point's (a row keyed `"goals@2"` beside a row `"2"`), since `focus(key)` takes either.
- **Data.** A line's `datum` is the row at its revealed end. Its `samples` are one per revealed row (`t` by distance along the walk, `at` the row's x), plus the end part way to the next row when the reveal falls between two. `related(series)` is the other line. A point has its row and its one value (`{ t: 0, value, at }`), and `related(series)` is the other series' point at the same x. Marks that read each other through `related` hear `change()` together: when any line's data changes, every line's runs hear it, so a threshold on the goals line follows a change to xG alone; the same goes for a row's points.
- **Layout.** 300 px high unless `height` says otherwise, and as wide as the container (or `width`). Values run from 0 (or from the lowest value, if it's negative) to a nice maximum of all the data, with gridlines and ticks on the left. x spans the rows' range, labelled at both ends and at round steps between that don't collide (the lab's 1, 10, 20, 30, 38); a single x sits in the middle. Each line ends in a dot in its own colour.
- **End labels.** In the right margin, which fits the widest label any row's value gives: each line's value in `format` with its series' label ("52 goals"), in theme text colours. Each is centred on its line's end and kept at least 16 px from the others (the prototype's rule): labels that would come closer move apart equally around where they'd sit. They count between values while a change or a reveal plays, rounded to the decimals the series' values have. `labels: false` turns them off. A function `(value, series, format) => string` words them; an empty string shows none, and a throw is reported once and keeps the default.
- **Hover.** Each revealed x is a target standing for every series' point there, so hover and leave events come in one batch per x (`goals@12` 1 of 2, `xg@12` 2 of 2), and each point turns `ec-hot`, showing in its strong colour. Each x has a hit column reaching halfway to its neighbours (the first from the chart's left edge, the last revealed one to its right edge), so the pointer hovers the nearest revealed x without reading coordinates. A dashed crosshair in `--ec-axis` marks the x, and the tooltip sits above the highest of its points: the x in bold, then each series' value with its label ("15 goals · 14.2 xg") and no total, or a tooltip function's text from the row. Nothing dims, since every series is read at once and the lines aren't hover targets, so `dim` does nothing here.
- **Keyboard and names.** The chart is one tab stop over its x's: the arrow keys go to the next or previous x (Down and Right to the next, Up and Left to the previous), and Home and End to the ends, with no wrap-around. Focus hovers every series' point there (`source: "keyboard"`), and a focus ring goes round each one: 2 px in `--ec-focus` outside a 2 px gap in `--ec-surface`, behind the marks, as on bars, moving with an effect's `transform` on the point. Each x is `role="img"`, named like a stacked bar from its x and each series' value with its label, "12: 15 goals, 14.2 xg". `markLabel(d, mark)` words it, given the bar chart's `MarkSummary`, whose `category` is the x as text (its `total` adds the values up, though a line's rarely add up). The lines, points, end labels, ticks and crosshair are `aria-hidden`.
- **Reveal.** `reveal(x)` shows the data up to x, at once. It's a view, not a data change, so it fires no `enter`, `exit` or `update`.
  - Each line ends at x, part way between rows, and its runs hear `change()`, so decorations follow every frame of a playback: the threshold's colour, a ball riding the leading edge.
  - Points past x are hidden, with whatever effects drew on them, can't be hovered or focused, and aren't in `marks()`. If the focused x is hidden, focus moves to the nearest revealed x.
  - It's clamped to the rows' range and kept across `update()`. The default, `reveal(Infinity)`, shows everything, rows added later too; after `reveal(20)`, a row added past week 20 stays hidden until it's revealed. A value that isn't a number throws a `RangeError`.
  - The scales are laid out from all the data, so nothing moves while the line plays out, and the table, the names and the announcements cover all the data.
- **Legend and table.** The legend lists the series, then the page's `entries`, such as `{ label: "Goals below xG", color: "negative" }` for the colour its threshold draws. The table has a row per x: the x (headed by its field's name, or `table.category`), one column per series and no total, then the page's columns, where one with `after: "values"` (a Difference column) goes last.
- **Colours** follow the series through a `ColorAssignment`, as on bars.
- **Updates.** `update()` merges and checks the options, and calls the runner in the shell's order. Values animate in data units, per row key. A line gets `update` when any of its values changed or its rows came, went or moved along x, and a point when its own value changed. A new row's points `enter` and a removed row's `exit`, as do a series' line and points when it's added or removed. Announcements name rows by their x; a function's `changed`, `added` and `removed` are row keys.
  - **Presentation** has two stages of 500 ms base, `transition` timing. Values: the rows' values and the value scale, ticks fading, and a series' line fading in or out. Positions: rows move along x as the x range and the plot follow; a new row grows out of the nearest row that stays (the one before it, or after it when it's first), and a leaving row folds into its own. So a season that gains a week grows its line out of the last point, and one that loses its first week folds it in while the line's start stays on the plot's edge. Lines aren't cut at the new last x while everything is revealed, so rows removed from the end fold in too. A stage with nothing to do is skipped.
  - **Analysis** runs one stage of at most 200 ms, and **Off** jumps: everything lands before `update()` returns, with the geometry the events reported. Resizes re-lay out without animating.
  - With no row in common with what's shown, new rows have nothing to grow out of and appear at once.

### Switching between charts

```ts
const shots = chartSwitch("#shots", {
  views: {
    donut: (el, colors) => donutChart(el, { label: "Shot outcomes, share of total", data, category: "outcome", value: "shots", colors }),
    columns: (el, colors) => barChart(el, { label: "Shot outcomes, counts", data, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors })
  },
  initial: "donut",
  announce: true
});
shots.show("columns"); // → Promise<void>; also shots.current, shots.chart("columns") and shots.destroy()
```

`chartSwitch(target, { views, initial, transition, colors, announce })` (`src/charts/switch.ts`, M5 step 3) shows views of the same data in one place, one at a time, and turns each mark of one view into its own mark in the next with a [transition effect](#transition-effects), as the lab's card 3 turns its donut into columns. It reads only what it uses of a chart's handle (`ChartSwitchView`: `element`, `marks()`, `labels()`, `focus(key)` and `destroy()`), so it never names a chart type, and adapters can join later. It never names an effect either: the composition root fills in `transition` with [`morph()`](#morph) when it's left out.

- **Views.** Each view is a function that draws its chart in the container it's given and returns the chart. It's also given the switch's `ColorAssignment` (`colors`, or a new one): pass it to the chart as its `colors`, so a key has one colour in every view and in the overlay. Bars colour by category (`colorBy: "category"`) to match a donut's slices. Every view is drawn when the switch is made. `chart(view)` returns a view's chart, typed as its function returns it, for `update()` and the rest. `current` is the view shown, or the one a switch is heading for.
- **Layout.** `<div class="ec-switch">` in `target` holds a `<div class="ec-switch-view" data-view>` per view, stacked in one grid cell, then the overlay, `<svg class="ec-chart ec-switch-overlay" aria-hidden="true">`, over the cell and taking no pointer events. The overlay has the charts' class, so copied labels keep the stylesheet's text sizes. The cell is as tall as the tallest view, so the page below doesn't move when the view changes.
- **The inactive view** has `ec-switch-inactive` (`visibility: hidden`), `inert` and `aria-hidden="true"`, so it can't be seen, reached or read. It keeps its layout (a container with no width would lay its chart out at the 640 px fallback), so its geometry is ready for a switch. One view is in the accessibility tree at a time, with its own table.
- **A switch,** `show(view)`:
  - **Focus is read first.** If it's in the old view, the switch remembers the key of the focused mark (the `data-key` of the focused element or its nearest ancestor with one, in the chart's `<svg>`) before anything is hidden, since a browser may move focus off a hidden element.
  - **The old view's hover ends** as the viewer's would: focus leaves its mark, and its `<svg>` hears a `pointerleave`. So the tooltip, the emphasis and the hover runs end, with their `leave` events. A chart handle has no method for it.
  - **Both views' marks hide.** Both views take `ec-switching` and `inert`, and their `<svg>`s `ec-morphing`, which hides their marks and mark labels ([Rendering](#rendering)). `ec-switching` also hides what that leaves: the focus ring, the effects' overlay and a line chart's x's. The new view shows, its other parts faded out.
  - **Overlay px.** Each view's marks and labels are mapped into the overlay's px from where its `<svg>` sits: its screen CTM against the overlay's. Where there's no layout, as in jsdom, a view's coordinates are the overlay's. A mark's path data moves through the same transform, arcs and all.
  - **Pairs.** Marks in both views are paired by key, in the new view's order, and played through the [transition player](#playing-transitions) on the overlay, each pair's group in its key's colour (`colors.slot(key)`).
  - **Labels** pair by key and role. Each pair moves in a straight line from the old label's place to the new one's. A copy of each `<text>`, with the chart's classes, goes along, and the new one's text shows from half way: "14%" becomes "58". A label with no partner fades where it is.
  - **Unmatched marks.** A key in only one view fades where it stands, drawn as its outline in its key's colour: out over the first half, or in over the second (M5 decision 7).
  - **The other parts.** The old view's axes, centre text, legend and table fade out by 40% of the way, and the new view's fade in from half way, as the lab's centre and baseline do. The view's container fades; its marks are hidden anyway.
  - **Timing.** 950 ms base with `transition` timing, in one stage: 950 ms in Presentation, 200 ms in Analysis. Everything is drawn from one number, the shapes' eased progress, which the switch works out as morph does. Its own tween has morph's timing and starts with the pairs' runs, on the same clock. A transition effect can't report its progress, so this schedule is the switch's: an effect that keeps to it (950 ms base, `easeInOutCubic`, and from `start` the rest of a full run's time, as [morph](#morph) does) stays in step with the labels and fades and reverses with no jump. One with other timing still plays, but its shapes drift from the labels and a switch back can jump ([the guide](effects-guide.md#transition-effects-and-checktransition) says so to effect authors).
  - **Landing.** Once the tween and the pairs' runs have finished, the overlay empties and both `<svg>`s lose `ec-morphing`. The new view becomes the active one and the old one inactive, and `show()` resolves. Focus that was in the old view goes to the remembered key in the new one (`focus(key)`, as a key press would: the ring shows and the hover plays). When the new view has no such mark, it goes to the new view's first mark. Focus that has moved on outside the switch meanwhile stays where it is.
- **Interrupting.**
  - **A `show()` back** to the view a switch is leaving reverses it from where the shapes are (M5 decision 6). The runs are cleared, and the pairs play back from `start: 1 − p`, where p is the shapes' eased progress, so the reverse begins with the picture the switch had drawn and takes the rest of a full switch's time. The labels, the fades and the views' opacity are drawn from where the switch is between its two views, as the lab draws its card from one `t`, so they go back the way they came, with no jump. A reverse reverses the same way.
  - **A `show()` to a third view** lands the switch first and switches from there, carrying the focus it remembered. **A resize** (the cell's width changing by half a px or more) lands it, since the shapes it began with are stale, and so does motion turning off.
  - A `show()` for the view a switch is heading for returns the same promise, and one for the view shown does nothing. An earlier `show()`'s promise resolves as soon as another replaces it.
- **Motion off** (reduced motion included, with no viewer choice). `show()` lands before it returns, without playing the transition, and focus and the announcement follow at once.
- **`announce`** is off by default. With `announce: true`, a polite live region (`role="status"`, as a chart's) after the overlay says the new view's label, its chart's `label`, after each switch.
- **Errors.** Options that aren't a switch's throw a `TypeError`: no views, a view that isn't a function, an `initial` that isn't one of them, a `transition` that isn't a transition effect, or an `announce` that isn't a boolean. So does a view's function that doesn't return the chart it drew in its container; the views drawn so far are destroyed, leaving nothing behind. `show()` rejects for a view the switch doesn't have, and `chart()` throws.
- `destroy()` ends any switch, destroys every view's chart and removes everything the switch added.
- **Not fitted yet.** A line chart can be a view, but its points don't suit a switch yet. They're marks that aren't drawn at rest (their dots show on hover), and the switch draws them. They're coloured by series but keyed `"goals@12"`, so the switch would draw them in their own keys' slots, which a shared assignment would also hand out. Adapters' attachments as views are backlog.

## Adapters

`expressive(target, options)` attaches effects to SVG marks drawn by other code (`src/charts/adapter/`, built in M1 step 10 for rects). `target` is a selector, an element, a list of elements, or anything with `nodes()` and `data()` like a D3 selection, whose data types the callbacks. (A D3 selection's `data()` is overloaded, and TypeScript infers from the last overload, so `MarkSource` also takes an optional `each`, whose callback carries the row type. The adapter never calls it.) Like a chart, it gets a `ChartEnv` from the composition root, resolves `on` through the preset registry and plays it through the runner.

```ts
const fx = expressive(d3.selectAll("#goals rect"), {
  key: (d) => d.data.name,                          // required: marks are matched by key
  segment: (_d, el) => el.parentNode.__data__.key,  // rects sharing a key are one mark's segments
  value: (d) => d[1] - d[0],                        // what each rect shows, so a resize isn't an update
  keyboard: true,
  markLabel: (d) => `${d.data.name}: ${d.data.goals} goals, ${d.data.assists} assists`, // one name per bar
  on: { hover: sequence(travel("soccer-ball", { along: "goals" }), travel("cleat", { along: "assists" })) }
});
fx.refresh(d3.selectAll("#goals rect"));             // after the host re-renders

// A D3 donut: d3.pie() angles, and the radii of the d3.arc() that drew the paths in a centred <g>.
const donut = expressive(d3.selectAll("#shots path"), {
  key: (d) => d.data.outcome,
  value: (d) => d.value,      // or one new value updates every slice: the total changes, so every arc does
  geometry: (_el, d, key) => describe.arc({ key, cx: 0, cy: 0, inner: 70, outer: 116, start: d.startAngle, end: d.endAngle }),
  keyboard: true,             // clockwise from 12 o'clock
  markLabel: (d) => `${d.data.outcome}: ${d.value} shots`,
  on: { hover: travel("soccer-ball") }
});

// Two d3.line() paths, one per series ({ series, rows }), in a margin <g>: each described from the
// points that drew it, with samples from the same points. threshold reads xG through related("xg"),
// and a ball rides the goals line's end. The page reveals the season itself, each frame giving each
// path its rows so far (paths.datum(…).attr("d", …)); watch follows it.
const season = expressive(d3.selectAll("#season path.line"), {
  key: (d) => d.series,
  geometry: (_el, d, key) => describe.line({ key, series: d.series, points: d.rows.map((r) => ({ x: x(r.week), y: y(r.value) })), width: 2 }),
  samples: (d, mark) => samplesAlong(mark, d.rows.map((r) => ({ x: x(r.week), y: y(r.value), value: r.value, at: r.week }))),
  dim: true,                  // the others fade, and the hovered line's stroke takes its strong colour
  watch: true,                // see Watch below
  on: { decorate: only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on" }))) }
});
```

- **Rows and keys.** `datum` defaults to a selection's `data()`, then to `element.__data__` (D3's convention). When `__data__` is a number and no `datum` is given, the adapter warns that it looks like Plot. Keys are converted with `String()`. Elements that share a key throw unless `segment` names each part, and a part named twice throws.
- **Values.** `value(datum, element)` returns what an element shows (a stack point's `d[1] - d[0]`, a row's field), so `refresh()` can tell a change in values from a re-layout. With it, an `update` means a part's value changed or the mark gained or lost a segment, as on the reference charts, and a resize or a new axis maximum only moves the marks. Values compare with `===`, except that NaN equals NaN, so it should return a number or a string (a date's `getTime()`, or several values joined). Without `value`, the adapter compares lengths: an `update` means a mark's length or segments changed, so a redraw at a new width or with a new axis maximum updates every bar, and with `update: "flash"` every bar flashes. On a pie, one new value changes the total and so every arc's length: without `value`, every slice updates; with `value: (d) => d.value`, only that slice does, and the others move round.
  - It compares values, not rows: Vega binds new scenegraph items on every render, a page that copies its rows makes every row new, and a row holds fields its bar doesn't show (a goals bar's row has the assists too).
  - A flag on `refresh()` saying that only the layout changed would be simpler, but it can't help when values and the axis change in the same redraw, which is just when a growing value pushes the axis out.
- **Geometry.** `<rect>` marks are described with `describe.bar`, in the coordinates of the marks' nearest common ancestor (a lone mark's parent). Each rect's box is converted through its parent's CTM (`getScreenCTM()` where there's layout, otherwise the transform attributes, as in jsdom, which can't see nested `<svg>` viewports or CSS transforms) and its own `transform` attribute. Its own CSS transform isn't read: that's where effects move it, and reading it back would feed an effect's offset into the geometry. Each read takes an element's CTM once, so marks that share a parent cost one. A mark's segments are ordered from the baseline by position, never by DOM order, since Vega-Lite stacks alphabetically. A gap the host leaves between segments becomes `describe.bar`'s `gap`, and the tip takes the tip rect's `rx`. A rect its transforms rotate or skew (anything but scales, flips and quarter turns) isn't an upright bar, so it throws. Other shapes, and such rects, need `geometry(element, datum, key)`, which is called once per mark with its first element and must return a geometry with that key. Reading circles, and `describe.shape`, are planned.
- **Order.** `marks()` and keyboard focus follow visual order. Rects go top to bottom for bars and left to right for columns. Marks described with `geometry` that go round one pivot go clockwise from 12 o'clock, by the angle of each mark's `center` about that pivot in screen coordinates, in [0, 2π). They go round it when each `pivot` is within 0.5 px of the first, and each mark's `start`, `center` and `end` are the same distance from it (give or take 0.5 px), more than 0.5 px away, as a pie's slices are. Other `geometry` marks keep document order. That includes lines that start at one point (cumulative goals and xG both at 0): a line's pivot is its first point, on its own walk, so they share a pivot without going round it. `d3.pie()` sorts slices by value, largest first, but returns its arcs in data order, so document order would make the arrow keys jump around the ring. The rule reads geometry, not a chart type. A mark's own parts (`HostMark.parts`) keep document order.
- **Baseline.** `"auto"` (the default) finds the line every mark has an edge on. A mark whose near edge (left, or bottom for columns) is on it grows away from it; one whose far edge is on it grows the other way, like a negative bar. When bars and columns both fit (one mark, or marks of one size), marks spread down the page are bars and marks spread across are columns. If no line is shared it throws: pass the edge.
- **Overlay.** Runs draw in `<g class="ec-overlay">`, the root `<svg>`'s last child, with the common ancestor's transform. So they share the marks' coordinates but never sit inside a group the host manages (Vega removes foreign children from its groups when it redraws). It holds the halos, the run groups and the focus ring, and `refresh()` moves it back to the end and recomputes its transform, as `watch` does when an ancestor at or above the common ancestor changes.
- **Events.** Pointer and touch hover and keys are listened for once, on the root `<svg>`. Focus events are heard on its document or shadow root instead, because Chrome makes an SVG element with focus listeners of its own a tab stop; `refresh()` picks that again, so an `<svg>` moved into or out of a shadow root keeps working. An event's target is mapped to its mark through a lookup that `refresh()` rebuilds, so marks the host replaces keep working. Hover events carry the segment under the pointer.
- **Keyboard.** `keyboard: true` adds the [bar chart's](#bar-chart) keyboard focus, on the host's elements: both use `src/charts/keyboard.ts`, so they behave alike. The chart is one tab stop (the first mark in visual order, as under Order above, then whichever was focused last). The arrow keys move to the next or previous mark, Home and End to the ends, and keys pressed with Alt, Ctrl or Meta are left to the browser.
  - Focus that follows a key press plays the hover effects (`source: "keyboard"`). Focus from a click or tap moves the tab stop but leaves the hover to the pointer, so a tap still reports `"touch"`. Escape stops the effects and keeps focus; blur leaves. Pointer and focus share one hover: focus arriving on the mark under the pointer holds that hover until blur, and a blur with the pointer still over the mark leaves it to the pointer.
  - A mark's first element gets its `tabindex` (`"0"` on the tab stop, `"-1"` on the others) and its other segments `"-1"`, so a click on any of them focuses the mark. Focus that lands on one of a mark's elements marked `aria-hidden="true"` (a segment `markLabel` hides) moves on to the mark's first element, which carries its name, so focus never rests where a screen reader can't follow. The adapter writes them through its edits, so `destroy()` puts back the host's own, and writes them again on every `refresh()`, for elements the host replaced.
  - `refresh()` keeps focus on its key: on the mark's new element if the host replaced the focused one (Vega does), even when the old one stays in the page for a while (a D3 exit transition), or, if the mark left, on its nearest neighbour, the next mark or else the previous one. With no marks left, focus leaves the chart. Focus that has moved elsewhere on the page meanwhile is never pulled back. Chrome fires a blur on a focused element the host removes, while it's still in the page, so a blur that leaves focus nowhere counts as the host removing the element only if the element is gone by the end of that task.
  - A ring follows the focused mark's outline in the overlay: 2 px in `--ec-focus`, 2 px out from the mark, as on the bar chart. The overlay is above the marks, so the ring is masked to outside the mark and its gap, as on the [donut](#donut-chart), which shares the code (`src/charts/render/outside.ts`). It never covers data, and it stays distinct from a bar in the focus colour. The gap is left clear rather than painted in `--ec-surface`, since a host's background may be another colour. Around an open outline (a line from `geometry`), the gap starts at the stroke's edge, on both sides. As with `:focus-visible`, it shows unless the last input on the page was a pointer (a click or tap). It stands in for the marks' own focus outline, which is turned off.
  - `focus(key)` moves focus to a mark as a key press would, whatever the last input was: the ring shows and its hover effects play.
- **Names for screen readers.** The adapter writes no ARIA unless asked: the host names its own marks (Vega and Plot have options for it). `markLabel(datum, mark)` names each mark as one item, the way `barChart` names its bars. The element that takes the mark's focus becomes `role="img"`, with the text as its `aria-label`, and loses any `aria-hidden` the host gave it; that's its first part (from the baseline for rects, the first in document order with `geometry`). The mark's other parts get `aria-hidden="true"`, so a stack is read once, not segment by segment. It's given the mark's row (its first part's, as the hover events see it) and a `HostMark`: the `key`, and each part's `series` and `datum`, from the baseline.
  - **Why the adapter does it.** `keyboard: true` makes the host's elements focusable, and a focusable element needs a role and a name (WCAG 4.1.2). Which element of a mark takes focus is the adapter's choice, so it's the one place that can put the name there. A host that names each segment ("Okafor: 4 assists") is read in pieces, and focus, which lands only on the first segment, reads "Okafor: 16 goals" without the assists. Plot can only hide a whole mark, not some of its elements, and Vega-Lite gives each segment its own description, so neither can say "name this one, hide that one". On D3 the page could, but only by mirroring the adapter's baseline order.
  - It's called for every mark on each read (`expressive()` and every `refresh()`), never per frame or on hover, so the names follow the data. It writes through the edits: a part that stops being the first, an element that leaves its mark, and `destroy()` all get back the host's own `role`, `aria-label` and `aria-hidden`. That's the host's latest: a host that reuses its elements and writes its own name again before `refresh()` gets that name back, not the one it had at first, and an empty `markLabel` then leaves it as it is. The other parts keep any names the host gave them, hidden.
  - An empty or blank result, or a throw (reported, as a tooltip function's is), leaves that mark's ARIA as the host drew it, so the adapter never writes an empty name.
  - The rest stays the host's: the `<svg>`'s role and name, and hiding its own text and axes, which would otherwise be read beside the names. The `<svg>` should be `role="group"` (or have no role), as on `barChart`, not `role="img"`: an image's children are presentational, so screen readers skip the marks inside it. With `keyboard` or `markLabel`, the adapter warns once when the root `<svg>` is `role="img"`.
- **Styling.** The host owns it, so nothing dims unless `dim: true`. The adapter still injects the shared stylesheet, for the theme tokens its overlay and focus ring draw in; its rules only match the library's own classes. Then the attachment's mark elements get `ec-attached`, and while one is hovered the others get `ec-dimmed`, which the shared stylesheet fades with `:where()`, so host CSS still wins. The classes go on the attachment's own marks only, never on the root, so two attachments on one `<svg>` leave each other alone.
  - **Hover colour.** Under `dim: true` the hovered mark also takes its strong colour, as our charts' marks take their `-strong` colours (M4 decision 7): each of its elements gets its colour stepped a quarter of the way toward the text colour in OKLab, so the hue stays (`color-mix(in oklab, <colour>, var(--ec-text) 25%)`), as an inline `fill`, or `stroke` on a line. So it's darker in the light theme and lighter in the dark, as our palette's `-strong` colours are, which sit 20% and 29% of the way. The stylesheet's `.ec-attached` rule fades `fill` and `stroke` with the hover feedback, as it does `opacity`. An effect's `emphasis` decides the colour while it's set. Without `dim`, the host's styling stays untouched.
  - **The host's colours.** A mark's colour is its fill, or its stroke when the fill is `none` (or transparent), as on a D3 line: the computed value where there's styling, else the nearest one declared on the element or above it (jsdom computes no presentation attributes). A gradient or pattern gives no colour, so emphasis and the hover colour leave it alone.

  Effects restyle marks with inline styles only:
  - `transform` becomes a CSS transform composed with the element's own transform attribute, which is never written;
  - `opacity` is the element's opacity;
  - `emphasis` mixes the host's colour (its fill, or its stroke on a line) toward its strong colour, as on our charts, and the "mark" and "mark-strong" colour tokens are the host's colours;
  - `halo` is drawn in the overlay, masked to outside the mark, so it shows only where it would behind the mark. Around an open outline (a line from `geometry`), the mask cuts out the stroke, as the focus ring's does, and the halo is stroked at the line's thickness plus its own width with round caps, so as much of it shows as round a closed mark, ends included, as behind our charts' lines.
- **Refresh.** `refresh(source?)` re-reads the marks: from `source` if given (and from then on), otherwise from the last source, running a selector again. Like a chart's update, it calls the runner in order: `interrupt()`, then `exit`, `update` and `enter` by key, `change()` for marks that moved, and `settle()`. An `update` is a change in values (see Values above); a mark that only moved (its outline, its segments, or its thickness alone, as when a line's stroke width changes), or got a new row or new samples, follows through `change()`. When a mark of a series some effect `needs` changes, moves, comes or goes, every other live mark follows through `change()` too, since its effects may read that series through `related`. A new root `<svg>` (Plot draws one each time) takes the overlay and the listeners. Marks it can't read, bad samples and missing series throw before anything changes.
- **Watch.** `watch: true` follows the host's own transitions frame by frame without `refresh()`, which would fire `update` and cut a hover short (M4 decision 14). It's opt-in (open question 13: its cost is below).
  - **What it hears.** A `MutationObserver` (`src/charts/adapter/watch.ts`) notes changes to the marks' geometry attributes (`d`, `x`, `y`, `width`, `height`, `cx`, `cy`, `r`, `points`, `transform`), and to `transform` and `style` on every ancestor from the marks up to the root `<svg>`: a host that animates a parent `<g transform>` changes none of the marks' own attributes. The marks' own `style` isn't watched, since the adapter writes it.
  - **Once a frame,** on the chart's clock, the marks whose attributes changed are read again: their rows, geometry and samples. An ancestor that changed below the marks' common ancestor has every mark inside it read again. One at or above it moves the overlay, whose transform is computed again, and nothing is read: the marks' geometry is in that ancestor's coordinates, so it can't have changed. With `baseline: "auto"`, the edge every bar shares is found again from all the bars' boxes, as a full read would, so a bar that ends a transition on the other side of the line grows from it the other way; in a frame where no edge is shared (a bar crossing the line), each keeps the one it had. The marks are put back in visual order (a sort's last frame reorders the keyboard), and the runner hears `change()` for each, with no events and no interrupt, as on our charts' frames. When a mark of a series some effect `needs` moves, every other live mark follows too, as in `refresh()`. As on any read, an element's screen CTM is read once a frame, so bars that share a parent cost one read between them.
  - **Timing.** The first change wakes the clock, and it stays on until a frame with no changes, taking the observer's pending records when its frame comes. So a host that draws in its own frame callback (a D3 timer), and asks for its next frame there, is followed in the frame it draws, from its second frame on; so is a page that draws from the clock (a reveal in `playback()`'s `onFrame`), in the same tick. If the clock is already running an animation whose callback comes before the host's each frame, the effects trail the marks by one frame.
  - **What stays.** Values (`value`), colours, names (`markLabel`) and the elements themselves stay as the last `refresh()` read them. So call `refresh()` when the host joins new data, before its transition starts: it fires `enter`, `update` and `exit`, an update comparing values with the previous `refresh()` and starting `from` the mark as it is before the transition. `watch` then follows the frames the transition draws. Elements the host adds, removes or replaces need `refresh()` too; it watches what it reads.
  - **The page's `geometry`** should read the element, or a row the host updates each frame, as a reveal does (each path's rows so far, with `selection.datum()`). One that reads a transition's target row sees only the end. Rects are read from the element, so a D3 transition on bars needs nothing more.
  - A mark it can't read in a frame (a rect a transition turns) is reported, and nothing changes. `destroy()` disconnects the observer and cancels a frame that's waiting.
  - **Cost,** measured in headless Chromium on a desktop CPU as main-thread time a frame, against the same frames without `watch` (open question 13 in the [plan](plan.md) has the table and the method). Following a D3-style transition on 20 bars adds 0.56 ms a frame, on 200 bars 2.7 ms (about 13 µs a moving bar), and a page's reveal of a two-line season with `threshold` and a riding ball 0.5 ms; that includes the effects' redraw, and is a little less than a `refresh()` every frame. With a 4× CPU slowdown it's about five times as much, and 200 moving bars miss a quarter of their frames. It keeps step with the host on every frame but a transition's first. Nothing moving costs nothing, since the observer wakes the clock only when a watched attribute changes. So it stays opt-in.
- **Destroy.** `destroy()` clears every run, removes the overlay and the listeners, and puts back every attribute, style property and class the adapter changed. When nothing else has changed them, attributes get their exact text back, so the host's markup reads as it did before. An attribute the host wrote again since the adapter last did keeps the host's value.
- **Data effects** get the mark's row (its first part's) and its samples, and find other series through `related(series)` (M4 step 4, decision 13).
  - **`samples(datum, mark)`** gives a mark's samples, `{ t, value, at? }`. It's called on every read for each mark, with its row and geometry, and for each of its named segments, with that part's row and the segment's geometry. The samples are checked when read: `t` in [0, 1] and never decreasing (equal `t` is a step), and finite values. Anything else throws a `RangeError` (or a `TypeError` for something that isn't an array) naming the mark, before anything changes. The adapter keeps a copy.
  - **`samplesAlong(mark, points)`** (public, `src/core/geometry/samples.ts`) gives a line its samples from the points that drew it: each `{ x, y, value, at? }`, in the marks' coordinates, is projected onto the nearest point of the walk, and the samples come back in `t` order (points at one `t` keep their order). It reads only the `MarkGeometry` contract: a grid of a point every px (up to 4096) finds each point's nearest stretch, and a golden-section search narrows it down, exactly for a point on the walk (a vertex lands where it is, and the ends on 0 and 1) and to well under 1e-6 px off it. On a polyline whose points sit at its vertices, values are then linear in `t` between samples, so `threshold`'s crossings are exact; on a curve they're approximate.
  - **Without `samples`,** rect marks with a numeric `value` for every part get the bar chart's samples: from 0 at the baseline to the parts' total at the tip, in proportion to distance, and each segment over its own span of it. Other marks get none.
  - **`related(series)`** is the mark's own segment of that series (a stack's part: its row, and samples over the segment), or else the first other live mark, in visual order, whose geometry has that `series`, such as two D3 line paths described with `describe.line({ key, series, … })`. That mark is looked up when an effect calls it, so it's as last read, by `refresh()` or `watch`. A mark isn't its own related series. Among grouped bars (each rect a mark of its own), that first mark needn't be the same row's.
  - **`needs.related`** is checked against the marks' series (each mark's `series`, its segments' and its parts') on creation and on every `refresh()`, and a missing one throws a `RangeError` before anything changes. With no marks yet, there's nothing to check.
  - With `watch`, a mark's samples are read again on every frame it moves.

What each library needs (from the [adapter spike](ideas/adapter-spike.md)):

- **D3** works as is: `__data__` holds the row, and a stack's series key is on the parent `<g>`. A stack point's value is `d[1] - d[0]`. A pie's slices need `geometry`: the angles are in the datum, but the radii live in the arc generator, so the page passes them to `describe.arc`, as above; a slice's value is `d.value`. A line's path needs `geometry` too, from the points its `d3.line()` drew (straight legs; a curve needs points taken from the path, M4 decision 5), with its `series`, and `samples` from `samplesAlong` on the same points. The tests run on real D3 (`d3-shape` and `d3-selection`, pinned dev dependencies, never runtime ones): `src/d3-pie.test.ts` and `src/d3-line.test.ts` (`threshold` against xG, a ball riding the goals line, keyboard order, and a reveal the page draws frame by frame, followed with `watch`), and a D3 pie source and a D3 line source in the effect conformance checks.
- **Observable Plot** binds indices, not rows, so the page passes a `datum` accessor. Pass the marks, not the `<svg>`: `refresh(newSvg.querySelectorAll('g[aria-label="bar"] > rect'))`. Which accessor depends on the mark:
  - one element per row, with no transform that derives new data (bars, dots): `datum: (el) => rows[el.__data__]`, and then `value` reads that row, `value: (d) => d.goals`;
  - a line path: `el.__data__` is that series' array of row indices, with `-1` at gaps, so `el.__data__.filter((i) => i >= 0).map((i) => rows[i])`;
  - after a group, bin or other reducing transform: the index points into the derived data, so `rows[i]` is silently the wrong row. Read the channel values through the mark's `render` option instead.

  Plot has no pie mark.
- **Vega and Vega-Lite** go through `fromVegaView()`, below. They need the SVG renderer (vega-embed's default; a bare `vega.View` uses canvas). Their bars are `<path>` elements and `__data__` is a scenegraph item, new on every render, so plain `expressive()` would need `datum` (the row is `el.__data__.datum`) and `geometry` written for Vega; the helper writes them.

Adapters follow the chart rules:

- They never know specific effects.
- They express geometry in the marks' nearest common ancestor's coordinates, and draw their overlay on the root `<svg>` with that ancestor's transform.
- They leave the host's styling, axes and tooltips alone, and undo everything they change.

### Vega and Vega-Lite: fromVegaView()

```ts
const { view } = await vegaEmbed("#season", spec);  // Vega-Lite: one row per week and series
const fx = fromVegaView(view, {
  key: (d) => d.series,                             // required, as for expressive()
  sample: (d) => ({ value: d.value, at: d.week }),  // each point's value, and its week for threshold
  keyboard: true,
  markLabel: (d) => (d.series === "goals" ? "Goals scored" : "Expected goals"),
  on: { decorate: only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on" }))) }
});
```

`fromVegaView(view, options)` (`src/charts/adapter/vega.ts`) reads the marks of a Vega or Vega-Lite chart from the View's scenegraph and attaches to the elements Vega drew for them, through `expressive()`, so effects, keyboard focus, names and dimming work as they do there. It's duck-typed on the View (`renderer()`, `scenegraph()` and `container()`), so the library imports nothing from Vega; vega and vega-lite are dev dependencies, pinned to exact versions, for the tests and the demo.

- **Which marks.** `mark` names the Vega mark to read, `"marks"` by default, the name Vega-Lite gives a chart's data mark. Every mark of that name counts, wherever it is in the scenegraph: Vega-Lite draws a line per series inside a facet group. Each item's element is the one whose `__data__` is the item (a line's one path is bound to its first item), and its row is `item.datum`. Vega-Lite derives its own rows, so `key` reads fields, never identity.
- **Geometry** comes from the items' numbers, mapped from each element's parent's coordinates into the marks' common ancestor's, as `expressive()` expects of `geometry`. Rects are bars, growing from the edge `baseline: "auto"` finds; parts that share a key and are named by `segment` are a stack's segments, ordered from the baseline whatever order Vega-Lite stacks in. Arcs are slices, with their angles put in order (Vega-Lite's can run anticlockwise). Symbols are points of radius √(size/π). Lines are lines at the item's `strokeWidth`, each its own series (its key), so `related("xg")` finds the line keyed `"xg"`. Other mark types throw a `TypeError`. So does a line Vega draws as a curve (any `interpolate` but `"linear"`, such as `"monotone"` or `"step"`), which straight segments between its points would misdescribe (M4 decision 5), and a line with a gap (`defined: false`), since lines can't have gaps yet.
- **Data.** The items say where each point is but not which field it shows, so data effects' values come from `sample(row)`: a number, or `{ value, at }`. A line gets a sample at each point (through `samplesAlong`, exact at the vertices), a bar from 0 at its baseline to its value (a stack's segments each over their own range), a slice from 0 to its value, and a point its value. Unless `value` is given, `sample` is also what each element shows (a line: all its points'), so a re-render that only moves marks, such as a resize, isn't an update. `samples` replaces it.
- **Following the View.** Vega replaces its mark elements when its data changes, and redraws them on a resize or a signal. Its data and resize listeners, and `runAfter`, run before it renders, so they'd read the old elements; instead a `MutationObserver` on the View's `<svg>` notes what Vega draws (new elements, and `d`, `transform`, `x`, `y`, `width`, `height`, and `stroke-width`, which a line's thickness is read from), ignoring the adapter's own overlay, and the View is read again on the next frame through `refresh()`, as a page would call it. A View that hasn't run yet attaches with no marks and takes them up once Vega draws. The attachment's own `refresh()` reads the View again at once, and `destroy()` stops following.
- **Errors.** A renderer other than SVG, a `mark` that isn't there (the error lists the names there are) and an unreadable mark type throw when attaching. A later read that fails is reported, changing nothing.
- **Frame by frame.** Every data change gives new elements, so a page that played a Vega chart frame by frame would have the adapter re-read it each frame (about 1.8 ms on the demo's line, beside Vega's own 0.7 ms), fire an `update` for every mark each frame, replace a focused mark's element each frame, and run a frame behind. The demo's Vega-Lite line shows the whole season instead.

The tests (`src/vega.test.ts`) run on real Vega-Lite charts rendered as SVG in jsdom: a two-series line (geometry, samples, `threshold` against xG, the riding ball, keyboard order, following new data and a resize, attaching before the first run, `destroy()`), bars, a stack, a donut and points, the errors, and `checkEffect` for every built-in effect on the View's lines, with their moved twins.

## Controls

On-page controls the viewer operates are in `src/charts/controls/`. Like the charts, they import only core, and the composition root hands them the page-wide motion by default. The `playback()` controller that the play button drives has no DOM, so it's in core (`src/core/playback.ts`).

### Motion switch

```ts
motionSwitch(target, motion?, { label?, labels?, hints?, persist? }) // → { element, destroy() }
```

`motionSwitch` builds the prototype's segmented control in `target` (an element or a selector): Presentation, Analysis and Off. It's the library's one caller of `motion.chooseMode()`, because the viewer operates it, so a click overrides the device's reduced-motion setting.

- **Structure.** A `role="group"` named by its visible label ("Motion"), with real `<button type="button">`s that carry `aria-pressed`, so Tab, Enter and Space work as they do on any button. A note beside them says what the mode does; it's the group's description and a polite live region, so a screen reader hears the new note after a click.
- **What it shows.** The pressed button is the effective mode. While the device asks for reduced motion and the viewer hasn't picked, Off is pressed and the note says so ("Your device asks for reduced motion…"); picking any mode, Off included, makes it the viewer's choice. It follows `motion.subscribe`, so it stays right when the author, the device or another control changes the mode.
- **Persisting.** `persist: "key"` is opt-in: the viewer's choice is saved in `localStorage` under the key and restored when the switch is made, so it carries across pages and visits; `clearChoice()` removes it. A stored value that isn't a mode is ignored, and storage that's blocked or full is skipped (every access is guarded).
- `label`, `labels` and `hints` replace the text, for other languages. `destroy()` removes the switch and stops following the motion; the viewer's choice stays.
- **Styles.** Its rules are in the shared stylesheet, so `expressive-charts/style.css` and `configure()` cover them as they do the charts'. They use `:where()` and theme tokens (`--ec-text`, `--ec-text-muted`, `--ec-surface`, `--ec-ring`, `--ec-focus`), so they follow light and dark, and host CSS restyles them without specificity fights.

### Playback

```ts
playback({ from, to, duration, ease?, timing?, motion?, clock?, onFrame })
// → { play(), pause(), seek(x, { animate? }?), position, playing, subscribe(listener), destroy() }
playButton(target, playback, { labels? }) // → { element, destroy() }
```

`playback()` plays a value through a range, such as a season revealed week by week, and `onFrame` draws each position. It's a controller on the clock with no DOM, so it runs in Node and, in tests, on a manual clock. It follows the page-wide motion and clock unless it's given its own (`motion`, `clock`, as on [animated values](#animated-values)). Nothing plays by itself: there's no autoplay option.

- **Where it starts.** At rest at `to`, the way a chart shows all its data until something reveals less. `onFrame` isn't called until the position changes.
- **`play()`** goes on from where it is to `to`, or starts again from `from` when it's at the end. The whole range takes `duration` scaled by `timing` (default `"playback"`: base in Presentation, × 0.3 in Analysis). A play from part way takes its share of that scaled time, so the speed is the same wherever it starts and whatever the timing's rule: the lab's season takes 6.5 s from week 1, or 1.95 s in Analysis. It moves at constant speed (`ease` defaults to `linear`). With motion off it jumps to `to`. If motion turns off mid-play, it jumps there on the next frame, as tweens do; other mode changes keep the speed it started with. `play()` while playing does nothing.
- **`pause()`** stops a play where it is, and the next `play()` carries on from there. Pause is the control WCAG 2.2.2 asks for, so there's no `stop()`: `seek(to)` shows the end. `pause()` doesn't stop a seek on its way, so a scrubber's handler can call both.
- **`seek(x)`** pauses and moves to `x`, clamped to the range, over 350 ms base `"transition"` timing (122.5 ms in Analysis, a jump in Off), as the lab's scrubber does. From rest it eases in and out. A seek while the position is moving (playing, or on its way to another seek) starts from where it is and eases out, as animated values do. `{ animate: false }` jumps.
- **`subscribe(listener)`** hears `"play"`, `"pause"`, `"end"` and `"seek"`, not frames, which go to `onFrame`. A seek during a play is heard as `"pause"` and then `"seek"`, and a play with motion off as `"play"` and then `"end"`. A listener can call the playback; whatever it starts wins. A listener that throws is reported, and the rest still hear.
- **Errors.** If `onFrame` or `ease` throws, the position stops where it is (a play is heard as paused) and the error is reported once: by the clock, or thrown to whoever caused a jump. The options are checked when it's made: `from` and `to` finite and different (`from` above `to` plays backwards), `duration` a non-negative number of ms, `timing` one of the five, and `onFrame` a function.
- `destroy()` pauses it, telling its listeners, and then every call does nothing.

`playButton(target, playback, { labels })` is the pause control a playback needs: a real `<button type="button">` in `target` (an element or a selector) whose text is Play or Pause, for what a click does. It has no `aria-pressed`, since a toggle button's name stays the same and this one's changes. `labels` gives the page's words (`{ play: "Play season" }`), which must have some text besides spaces; the defaults are "Play" and "Pause". It follows `playback.subscribe`, so it goes back to Play at the end, on a seek, or when the page pauses, and it's the same element throughout, so focus stays on it. Its `.ec-play` rules are in the shared stylesheet, which it injects as `motionSwitch` does. `destroy()` removes it and stops following the playback, which carries on.

The page wires its own `<input type="range">` to `seek()`, and its status to `onFrame`:

```js
const season = playback({
  from: 1, to: 38, duration: 6500,                           // 6.5 s in Presentation, 1.95 s in Analysis, at once in Off
  onFrame(week) {
    chart.reveal(week);                                      // lineChart: a view, with no events
    status.textContent = `Through matchweek ${Math.round(week)}`;
    if (season.playing) range.value = String(Math.round(week)); // a seek leaves the slider where the viewer put it
  }
});
playButton("#play", season, { labels: { play: "Play season" } });
range.addEventListener("input", () => season.seek(Number(range.value)));
```

## Rendering

SVG first, in `src/charts/render/`. Canvas or WebGL rendering is a later option for charts with thousands of marks; effects describe what to draw, so they should not need to change when a renderer is added.

- **Structure.** A chart's `<svg class="ec-chart" role="group">` holds the grid, the axis, the focus ring, the marks and, last, the overlay where runs draw (one `<g class="ec-run">` per run, stacked by start order, with `--ec-mark` set to the mark's colour, and set again when that colour changes). Each mark is a `<g class="ec-mark" role="img" data-key>`, which takes focus and carries the `aria-label`, with its pointer target, label, body (the segments, which effects restyle) and value label. The donut's `<svg>` holds the centre text (`.ec-center`, `aria-hidden`), the marks and the overlay, where halos (`.ec-halos`) and the focus ring come before the runs (`.ec-runs`); each slice's mark holds its pointer target, its body (the `.ec-slice` path) and its label's two lines. The line chart's `<svg>` holds the grid, the axis, the crosshair (`.ec-crosshair`), the focus rings, the marks (`.ec-marks`, `aria-hidden`: each line's `<g class="ec-line">` with its body, the `.ec-stroke` path and the `.ec-end` dot, and its end label; then each point's `<g class="ec-point">` with its `.ec-dot`), the x's (`.ec-columns`: each a `<g class="ec-column" role="img">` holding its hit column, which takes focus) and the overlay. Lines and points aren't `.ec-mark`s: they aren't hover targets, and never dim. DOM order follows visual order. Beside the `<svg>`, in the container, are HTML elements: the legend (`.ec-legend`) before it; after it, the tooltip's layer (`.ec-tooltip-layer`), the data table (`.ec-table`) and, with `announce`, the live region (`.ec-announcer`). `.ec-visually-hidden` hides an element from sight but not from screen readers.
- **Hover styles.** A hovered mark has `ec-hot` and, with `dim`, the `<svg>` has `ec-hovering`, which fades every other `.ec-mark` to `--ec-dim-opacity`. That's opacity, so it fades strokes as it does fills. A segment (`.ec-segment`) or slice (`.ec-slice`) is filled with `--ec-mark`, and `--ec-mark-strong` inside an `ec-hot` mark. A stroked part (`.ec-stroke`, for an open outline such as a line) is `fill: none` and stroked the same way, with round joins. Its width is left to the chart's `stroke-width` attribute, which is the geometry's `thickness`, because a stylesheet rule would override it. Effects' `emphasis` mixes the same two colours inline (`svgMarkHandle` in `render/mark-style.ts`): the fill, or an open part's stroke. A line chart's point (`.ec-dot`) is transparent until it's `ec-hot`, then shows in `--ec-mark-strong`, fading over the hover duration; a line's end dot (`.ec-end`) always shows, and both are ringed in `--ec-surface`. The crosshair is dashed in `--ec-axis`.
- **Morphing.** While a chart's `<svg>` has the class `ec-morphing`, its marks layer (`.ec-marks`) is `visibility: hidden`: bars and slices with their labels, lines with their end dots and labels, and points, leaving ones too. A [chart switch](#switching-between-charts) puts it on both views while their marks morph in an overlay of its own. Nothing else is hidden: the axes, the gridlines, the donut's centre text, the line chart's x's (its focus stops), the focus ring, the overlay where runs draw, the legend and the table stay. It has to be on the `<svg>` itself, not an ancestor. A hidden mark can't take the pointer, and a browser may move focus off it, so whatever moves focus across a switch reads the focused key first. A switch also puts `ec-switching` on each view's container, which hides that view's focus ring, overlay and x's (`.ec-focus`, `.ec-overlay`, `.ec-columns`); its other rules (`.ec-switch`, `.ec-switch-view`, `.ec-switch-inactive`, `.ec-switch-overlay`) lay out the views and hide the inactive one.
- **Theme.** Colours are `--ec-*` custom properties: `--ec-text`, `--ec-text-muted`, `--ec-surface`, `--ec-grid`, `--ec-axis`, `--ec-focus`, `--ec-negative`, `--ec-ring` (hairline borders on controls and the tooltip), `--ec-series-1` … `--ec-series-8` with `-strong` variants, `--ec-dim-opacity`, and `--ec-hover-duration`, which the chart sets. Text uses the text tokens, never a series colour.
  - **Light and dark.** The defaults are in `themes` in `src/charts/render/theme.ts`. The stylesheet sets light on `:root`; dark when the device prefers it, unless the root has `data-theme="light"`; and either one on any element with `data-theme="light"` or `"dark"`, for its subtree. They're on the root rather than the chart so that elements outside the `<svg>` (a host's own chart, the tooltip, controls) read the same values.
  - **Overriding.** Every default rule is in `:where()`, so any host rule wins: `.my-card { --ec-series-1: teal }`. A `data-theme` element sets every token again for its subtree, so an override meant to hold everywhere should also name `[data-theme]` elements, or sit inside them. A page with no dark theme of its own sets `data-theme="light"` on `<html>`, so the charts don't turn dark on a light page.
  - **The palette** is validated by `theme.test.ts` in both themes: every mark colour (and `--ec-negative` and `--ec-focus`) is at least 3:1 against the surface; neighbouring slots, with slot 8 next to slot 1, are at least 15 apart in OKLab ×100, and at least 8 apart under protanopia, deuteranopia and tritanopia (Machado 2009); any two slots are at least 9 apart; each `-strong` is within 5° of its colour's hue, with 1.3× its contrast; and text is at least 4.5:1. Slots 1–4 are the prototype's, except light 3 and 4, which are darkened along their hue to reach 3:1.
  - Inline styles and the rules keep light values as `var()` fallbacks, for a page that sets some tokens but has no stylesheet.
- **Styles.** One stylesheet holds the tokens and the default rules, and the first chart, adapter or control on a page injects it (`<style data-expressive-charts>`, once per document). Everything else is set through the CSSOM, which a strict CSP allows. `configure()` sets two page-wide options, which are page-wide because the stylesheet is: an option on one chart would only count if that chart came first.
  - `configure({ nonce })` puts the nonce on the injected `<style>`, for a CSP with a `style-src` nonce.
  - `configure({ injectStyles: false })` injects nothing. The page loads `expressive-charts/style.css` (`dist/expressive-charts.css`) instead, for a CSP with no inline styles at all. The build writes that file from the same constant the charts inject, so they can't drift apart.
  - Call `configure()` before creating charts. The stylesheet stays when charts are destroyed, since others may share it.

## Build outputs

- `dist/index.js` + `dist/index.d.ts`: ES module for npm and bundlers, under the `import` condition.
- `dist/index.cjs` + `dist/index.d.cts`: CommonJS, under the `require` condition. The package is `"type": "module"`, so a `.d.ts` file describes an ES module: each entry's `require` condition has its own `.d.cts`, or a CommonJS project resolving with `node16` would be given ES module types for the `.cjs` file.
- `dist/expressive-charts.global.js`: script-tag bundle exposing `window.ExpressiveCharts`.
- `dist/expressive-charts.css`: the stylesheet the charts inject, as a file, exported as `expressive-charts/style.css` for pages that use `configure({ injectStyles: false })`. `package.json` lists CSS in `sideEffects`, so bundlers keep `import "expressive-charts/style.css"`, which imports no names; webpack would otherwise drop it. `src/package.test.ts` checks the patterns as bundlers read them, since the repo's own bundlers (Vite 8, esbuild) keep the import either way.
- `dist/icons/sport.js`, `.cjs`, `.d.ts` and `.d.cts`: the optional sport icon pack, imported as `expressive-charts/icons/sport`. It's a separate entry, so the core build doesn't carry the ball and cleat. The script-tag bundle doesn't include it.
- `dist/testing.js`, `.cjs`, `.d.ts` and `.d.cts`: the conformance suite for effect authors, imported as `expressive-charts/testing`. A separate entry, like the sport pack, and not in the script-tag bundle.
- **The package** is `dist/` and `CHANGELOG.md` (`files` in `package.json`), with the README, the licence and `package.json`, which npm always adds. It's about 1.2 MB packed and 4.5 MB unpacked, most of that source maps, which stay because bundlers and debuggers use them. `scripts/pack-check.mjs` installs the packed tarball in a new project and uses it from there: every entry imported in Node as ES modules and as CommonJS with no DOM, and a consumer typechecked under `bundler`, `node16` (ES module) and `node16` (CommonJS), each reading its own declarations. CI runs it after the build.
- **Types** need TypeScript 5.4 or newer, since they use `NoInfer`. The repository builds with TypeScript 5.9.3, pinned exactly. TypeScript 7 waits until after 0.1.0, since tsup's declaration build uses TypeScript's JS API.
- **Releases** are published by `.github/workflows/release.yml` when a GitHub release whose tag is `v` and the version is published, with npm's provenance statement (`publishConfig` asks for it, with public access). It runs CI's checks first. CONTRIBUTING.md's Releasing has the steps and the authentication: a token for 0.1.0, then trusted publishing.
- **The 0.x promise** in CHANGELOG.md names every value and type it covers. `src/promise.test.ts` names them all too, so a rename or a removal fails `typecheck`, and it checks that its list and CHANGELOG's match.

### Bundle size

`npm run size` (`scripts/size.mjs`) measures the build, and fails when a size is over its budget in `scripts/size-budget.json`. CI runs it on Node 24 after the build, and puts its tables in the job's summary. Budgets are gzip sizes, set at the measured size plus about 10%, rounded up to 0.5 KB; [CONTRIBUTING.md](../CONTRIBUTING.md#bundle-size) says when to raise one. The sizes below are main's at 95a0c4b (23 October 2026). KB is 1,024 bytes, gzip is at level 9 and brotli at 11.

Each published JS file and the stylesheet:

| File | raw | gzip | brotli | gzip budget |
| --- | ---: | ---: | ---: | ---: |
| `dist/expressive-charts.css` | 9.7 KB | 2.2 KB | 1.8 KB | 2.5 KB |
| `dist/expressive-charts.global.js` | 193.1 KB | 68.5 KB | 58.7 KB | 75.5 KB |
| `dist/icons/sport.cjs` | 7.8 KB | 2.8 KB | 2.6 KB | 3.5 KB |
| `dist/icons/sport.js` + 2 chunks | 24.9 KB | 8.2 KB | 7.4 KB | 9 KB |
| `dist/index.cjs` | 363.6 KB | 90.6 KB | 71.7 KB | 100 KB |
| `dist/index.js` + 3 chunks | 362.0 KB | 91.1 KB | 73.9 KB | 100.5 KB |
| `dist/testing.cjs` | 46.0 KB | 12.6 KB | 11.2 KB | 14 KB |
| `dist/testing.js` + 2 chunks | 72.6 KB | 19.5 KB | 17.5 KB | 21.5 KB |

An ES module entry counts the chunks it imports, since loading it fetches them too, and tsup names chunks by a hash that changes with the code. The ES module files and the CommonJS ones aren't minified; the script-tag bundle is. The sport pack's chunks are shared with the main entry (`defineIcon`, and the geometry its icons are drawn with), so a page that loads both adds only `sport.js` itself, 2.7 KB (1.2 KB gzip).

What a page pays once its bundler has tree-shaken the package. Each import set is an entry that re-exports its names from `dist/index.js`, built with Vite's build API as an app is, minified, for ES2020. Not in lib mode, whose ES output keeps its whitespace.

| A page that imports | min | gzip | gzip budget |
| --- | ---: | ---: | ---: |
| `motion`, `animated` | 3.7 KB | 1.7 KB | 2 KB |
| `describe`, `matrix` | 7.3 KB | 3.1 KB | 3.5 KB |
| `expressive`, `travel` | 69.6 KB | 24.3 KB | 27 KB |
| `barChart` | 79.1 KB | 27.5 KB | 30.5 KB |
| `lineChart`, `threshold`, `playback`, `playButton` | 92.0 KB | 31.6 KB | 35 KB |
| `chartSwitch`, `donutChart`, `barChart` | 110.8 KB | 37.0 KB | 41 KB |
| everything | 189.6 KB | 62.5 KB | 69 KB |

Bundlers keep only what a page imports, because `package.json`'s `sideEffects` names only CSS and `src/package.test.ts` checks that every JS entry is free of side effects. So the package has no `/core` or `/effects` entry (M6 decision 6): neither would make a page smaller. A change that breaks tree-shaking grows the small sets and fails the check.
