# Architecture

This document describes the design. Code that doesn't exist yet is marked as planned. [plan.md](plan.md) has the roadmap and the reasoning behind the decisions.

## Layers

```
          ┌──────────────┐
          │    core      │  clock, easing, tweens, motion modes, shared contracts
          └──────▲───────┘
        ┌────────┴────────┐
 ┌──────┴──────┐   ┌──────┴──────┐
 │   charts    │   │   effects   │
 │ bar, line,  │   │ travel,     │
 │ donut, ...  │   │ wiggle, ... │
 └─────────────┘   └─────────────┘
```

Charts and effects both depend on core. They never depend on each other. They meet only through two shared contracts: the **mark geometry** and the **event stream**. Because charts and effects can't import each other, the types for both contracts live in core (`src/core/contracts/`).

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

## Mark geometry (planned)

Every mark, whether it's drawn by one of our charts or by another library, is described with the same `MarkGeometry` shape. It has two parts:

- **The walk**, from where the data starts to where it ends: `start`, `end`, `length`, `path(t)`, `angle(t)` and `slice(t0, t1)`. `t` is proportional to distance, so equal steps in `t` are equal distances on screen.
- **The body**: `thickness`, `outline`, `bounds`, `center`, `pivot`, plus ordered `segments` for stacks.

For a bar, the walk is the centre line from the baseline to the tip. For a donut slice, it's the mid-radius arc. For a line, it's the line itself. That's what lets one `travel` effect roll a ball along all three.

Geometry builders (`describe.bar`, `.arc`, `.line`, `.point`, `.shape`) are public. Our charts and the adapters use the same ones. The full proposed types are in [sketches/api.ts](sketches/api.ts), and the reasoning is in [plan.md §2](plan.md#2-the-markgeometry-contract).

## Events and effect slots (planned)

Charts and adapters emit `enter`, `update`, `exit`, `hover` and `leave`, each with the mark's geometry, its data and its position in the batch. An `update` event also carries the previous geometry. Effects attach to events through the `on` option:

```ts
barChart("#goals", { data, label, y: "name", x: "goals", on: { hover: travel("soccer-ball"), update: "flash" } });
```

`decorate` is a fifth slot for persistent effects like `threshold`: they start on enter, stay until exit, and redraw whenever the mark's geometry changes.

## Effects (planned)

There are three kinds, distinguished by a `kind` field:

- **Geometry effects** receive a `MarkGeometry`.
- **Data effects** also receive the mark's data (values along the walk, related series, previous values).
- **Transition effects** receive two geometries (`morph`).

Each one has `run`, `end` (the final state, used for reduced motion) and `clear`. Effects draw only through the context's drawing API: icons, overlay paths, text, and mark styles.

First set: `travel(icon, { along })`, `wiggle()`, `pulse()`, `flash()`, `threshold({ compareTo, color })`, `morph()`. Combinators: `sequence`, `parallel`, `stagger`, `only`. Combinations keep the data kind if any part has it.

The effect-author API (`defineEffect`, `defineDataEffect`, `matrix`, `offset`) is experimental until M3.

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
