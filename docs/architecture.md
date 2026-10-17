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

Every chart describes each of its marks with the same shape:

```ts
interface MarkGeometry {
  key: string;                 // stable identity across updates
  start: Point;                // where the data begins (a bar's baseline end)
  end: Point;                  // where the data ends (a bar's tip)
  path: (t: number) => Point;  // walk the mark from start (t=0) to end (t=1)
  angle: (t: number) => number;// direction of travel at t, for orienting icons
  outline: string;             // SVG path data of the mark's shape
  segments?: Record<string, MarkGeometry>; // e.g. "goals" and "assists" in a stacked bar
}
```

For a bar, `path` is a straight line. For a donut slice, it's the arc. For a line chart, it's the line up to the mark. This is what lets one `travel` effect roll a ball along all three.

## Events (planned)

Charts emit `enter`, `update`, `exit`, `hover` and `leave`, each with the mark's geometry and datum. Effects subscribe to an event through the chart's options (`hover: effect`).

## Effects (planned)

```ts
interface Effect {
  run(mark: MarkGeometry, ctx: EffectContext): Promise<void>; // animates; resolves when done or cancelled
  end(mark: MarkGeometry, ctx: EffectContext): void;          // jump to final state (reduced motion)
  clear(ctx: EffectContext): void;                            // remove anything the effect drew
}
```

First set: `travel(icon, { along })`, `wiggle()`, `pulse()`, `flash()`, `threshold({ compareTo, color })`, `morph()`.

Combinators: `sequence(...effects)`, `parallel(...effects)`, `stagger(effect, delay)`.

## Rendering

SVG first. Canvas or WebGL rendering is a later option for charts with thousands of marks; effects describe what to draw, so they should not need to change when a renderer is added.

## Build outputs

- `dist/index.js` + `dist/index.d.ts`: ES module for npm and bundlers.
- `dist/expressive-charts.global.js`: script-tag bundle exposing `window.ExpressiveCharts`.
