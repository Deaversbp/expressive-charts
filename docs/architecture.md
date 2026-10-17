# Architecture

This document describes the intended design. Code that doesn't exist yet is marked as planned.

## Layers

```
          ┌──────────────┐
          │    core      │  motion clock, easing, cancellation, motion modes
          └──────▲───────┘
        ┌────────┴────────┐
 ┌──────┴──────┐   ┌──────┴──────┐
 │   charts    │   │   effects   │
 │ bar, line,  │   │ travel,     │
 │ donut, ...  │   │ wiggle, ... │
 └─────────────┘   └─────────────┘
```

Charts and effects both depend on core. They never depend on each other. They meet only through two shared contracts: the **mark geometry** and the **event stream**.

## Core (planned)

- **Clock and tweens.** One `requestAnimationFrame` loop drives every animation. Each animation can be cancelled; a new animation on the same target starts from the current in-between state, so nothing jumps.
- **Easing.** Cubic in-out for data transitions, ease-out for travel, linear for playback.
- **Motion modes.** `presentation`, `analysis` and `off`. Every duration passes through `core.duration(base)`, which scales it by mode. `off` and the `prefers-reduced-motion` setting return 0.

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
