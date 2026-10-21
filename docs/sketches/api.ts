/**
 * Proposed public API for expressive-charts, as declarations only.
 *
 * Design sketch from the October 2026 design session. What's built is re-exported from src, so
 * the sketch builds on the real thing: the motion core, the shared contracts (MarkGeometry,
 * MarkData, the drawing API, EffectContext, the effect kinds, Icon, the effect slots), the geometry
 * (describe.bar, .arc, .line, .point, matrix, offset), the preset and icon registries
 * (registerPreset, registerIcon, registerIcons), the thin bar chart's types (mark events, chart
 * options, accessors, colorAssignment), the icons (defineIcon, iconFromSvg, icons), the first
 * effects (travel with its gaits, flash, wiggle, pulse, sequence, parallel, only, stagger), the
 * viewer's motionSwitch and the adapter's types (MarkSource, Attachment, ExpressiveOptions).
 * Everything still declared here is planned. Lines marked NEW were
 * added because writing the examples in ./examples exposed a gap in docs/plan.md.
 */

export * from "../../src/index";
import type {
  Accessor,
  Attachment,
  BarChartOptions as BuiltBarChartOptions,
  Chart as BuiltChart,
  ChartOptions as BuiltChartOptions,
  Color,
  ColorAssignment,
  DataEffect,
  describe as builders,
  Easing,
  EffectContext,
  ExpressiveOptions as BuiltExpressiveOptions,
  GeometryEffect,
  MarkData,
  MarkEvents,
  MarkGeometry,
  MarkSource,
  MotionView,
  NumericKey,
  Sample,
  Timing,
  TransitionEffect
} from "../../src/index";

// ── Shared contracts and drawing API: built, in src/core/contracts ───────────
// MarkGeometry, Outline, Sample, MarkData (with previous), Paint, MarkStyle, MarkHandle, IconHandle,
// PathHandle, TextStyle, TextHandle, Layer, EffectContext (with previous), GeometryEffect,
// DataEffect, TransitionEffect, MarkEffect, AnyMarkEffect, Combined; and the effect slots
// (EffectSlot, EffectSlots, EffectOption, PresetName). The runner that plays slots is internal.

// ── Effects ──────────────────────────────────────────────────────────────────

// travel (with TravelOptions), the gaits (gaits.roll, .step, .slide; Gait, GaitState, GaitPose),
// flash, wiggle, pulse and the combinators sequence, parallel, only and stagger are built, in
// src/effects. Changed from the sketch: a gait can carry its own easing and pace (a step takes 15%
// longer and eases in and out, as in the prototype), and GaitState gives distances in the icon's own
// units plus its rolling radius (instead of its size), so a gait looks the same at any size. flash
// takes a width and opacity too, pulse a width; stagger's delay is optional (default 50 ms, the
// spread capped at 500 ms), and it returns an effect of the same kind rather than the same type.
/** Colours the parts of the walk where values are below the reference (default) or, with when: "above", above it. */
export declare function threshold(options: {
  readonly compareTo: string | number;
  readonly when?: "below" | "above";
  readonly color?: Color;
}): DataEffect;
export declare function morph(options?: { readonly points?: number }): TransitionEffect;

// NEW: helpers for effect authors. Experimental until M3, when the effect API goes public.
export interface GeometryEffectSpec {
  run(mark: MarkGeometry, ctx: EffectContext): Promise<void>;
  end(mark: MarkGeometry, ctx: EffectContext): void;
  clear?(ctx: EffectContext): void;
}
export interface DataEffectSpec<D> {
  readonly needs?: { readonly related?: readonly string[] };
  run(mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext): Promise<void>;
  end(mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext): void;
  clear?(ctx: EffectContext): void;
}
/** @experimental */
export declare function defineEffect(spec: GeometryEffectSpec): GeometryEffect;
/** @experimental */
export declare function defineDataEffect<D = unknown>(spec: DataEffectSpec<D>): DataEffect<D>;

// matrix (translate, rotate, scale, multiply, apply) and offset are built, in src/core/geometry.

// ── Icons: neutral core set; sports icons live in "expressive-charts/icons/sport" ─

// Icon and IconShape are built, in src/core/contracts (with linecap and linejoin on shapes, for the cleat).
// defineIcon (with IconSpec), iconFromSvg (with SvgIconSpec) and the core icons (dot, arrow,
// chevron) are built, in src/icons; registerIcon and registerIcons in src/registries.

// ── Presets ──────────────────────────────────────────────────────────────────

// PresetName and registerPreset are built (src/core/contracts, src/registries), and so are the
// built-in presets, exactly wiggle, pulse and flash. Built-in names autocomplete; custom names are
// checked when the chart is created.

// ── Events and effect slots (shared by reference charts and adapters) ───────

// EffectOption and EffectSlots are built, in src/core/contracts. NEW: slots are grouped under `on`,
// so the `update` slot no longer collides with `chart.update()`. MarkEvent and MarkEvents are built,
// in src/charts.

/** What reference charts and adapters have in common. focus() comes with keyboard support (M1 step 9). */
export interface MarkSourceHandle<D> {
  on<K extends keyof MarkEvents<D>>(type: K, listener: (event: MarkEvents<D>[K]) => void): () => void;
  marks(): readonly MarkGeometry[];
  focus(key: string): void;
  destroy(): void;
}

// ── Geometry builders: public, shared by reference charts and adapters ───────

// describe.bar, .arc, .line and .point are built, in src/core/geometry (with the Baseline type and
// NEW: an optional `gap` between bar segments). Only .shape is still planned.
export declare const describe: typeof builders & {
  /** Browser only: walks any SVG shape with getPointAtLength. */
  shape(element: SVGGeometryElement, spec: { readonly key: string; readonly series?: string; readonly thickness?: number }): MarkGeometry;
};

/** NEW: project data points (in mark coordinates) onto a mark's walk, giving data effects their samples. */
export declare function samplesAlong(
  mark: MarkGeometry,
  points: readonly { readonly x: number; readonly y: number; readonly value: number; readonly at?: string | number | Date }[]
): Sample[];

// ── Adapters: effects on charts built with other libraries ───────────────────

// MarkSource, Attachment (with refresh() and focus()) and ExpressiveOptions are built, in
// src/charts/adapter, and so is expressive() itself (M1 step 10, for rects). Changed from the sketch:
// `key` may return a number (converted with String()), `datum` defaults to a selection's data() before
// element.__data__, `geometry` is called once per mark with its first element, and `baseline: "auto"`
// also finds negative bars (a mark whose far edge is on the shared line grows the other way).

/** Planned for M4: data effects' samples, and following the host's own transitions. */
interface PlannedExpressiveOptions<D> {
  /** For data effects. */
  readonly samples?: (datum: D, mark: MarkGeometry) => readonly Sample[];
  /** Re-read geometry on every attribute change, so decorations follow the host's own transitions. */
  readonly watch?: boolean;
}

export interface ExpressiveOptions<D> extends BuiltExpressiveOptions<D>, PlannedExpressiveOptions<D> {}

/** Built in M1 step 10 (src/charts/adapter); declared here until it has `samples` and `watch` (M4). */
export declare function expressive<D = unknown>(target: MarkSource<D>, options: ExpressiveOptions<D>): Attachment<D>;

// ── Reference charts ─────────────────────────────────────────────────────────

// KeyOfType, Accessor, NumericKey, ColorAssignment and colorAssignment are built, in src/charts. So are
// the chart options (tooltips and the data table too, since M2) and the chart handle; the sketch adds
// what's still planned to the handle.

/** NEW NoInfer on `on` (built): without it, a data effect such as threshold() (D = unknown) widens D and switches off field checking. */
export interface ChartOptions<D> extends BuiltChartOptions<D> {}

export interface Chart<D, O> extends BuiltChart<D, O>, MarkSourceHandle<D> {}

export interface BarChartOptions<D> extends BuiltBarChartOptions<D> {}

export interface LineChartOptions<D> extends ChartOptions<D> {
  readonly x: Accessor<D, number | Date>;
  readonly series: readonly NumericKey<D>[];
  /** "x": hover every series at the nearest x (crosshair). */
  readonly pointer?: "x" | "nearest";
}

export interface LineChart<D> extends Chart<D, LineChartOptions<D>> {
  /** Show data up to x, instantly. Driven by playback. */
  reveal(x: number): void;
}

export interface DonutChartOptions<D> extends ChartOptions<D> {
  readonly value: NumericKey<D> | ((d: D) => number);
  readonly center?: (total: number) => string;
  readonly sort?: "value" | "none";
}

/** Built in M1 step 5 (src/charts); declared here until its handle has focus(). */
export declare function barChart<D>(target: string | Element, options: BarChartOptions<D>): Chart<D, BarChartOptions<D>>;
export declare function lineChart<D>(target: string | Element, options: LineChartOptions<D>): LineChart<D>;
export declare function donutChart<D>(target: string | Element, options: DonutChartOptions<D>): Chart<D, DonutChartOptions<D>>;

export interface ChartSwitch<V extends string> {
  show(view: V): Promise<void>;
  readonly current: V;
  destroy(): void;
}

export declare function chartSwitch<V extends string>(
  target: string | Element,
  options: {
    readonly views: { readonly [K in V]: (container: Element) => MarkSourceHandle<any> };
    readonly transition: TransitionEffect;
    readonly initial: NoInfer<V>;
    readonly colors?: ColorAssignment;
  }
): ChartSwitch<V>;

// ── Playback and on-page controls ────────────────────────────────────────────

export interface Playback {
  play(): void;
  pause(): void;
  seek(x: number): void;
  readonly playing: boolean;
  readonly position: number;
}

export declare function playback(options: {
  readonly from: number;
  readonly to: number;
  /** Base ms for the whole run; scaled with "playback" timing. */
  readonly duration: number;
  readonly ease?: Easing;
  readonly timing?: Timing;
  readonly motion?: MotionView;
  readonly onFrame: (x: number) => void;
}): Playback;

/** A Play/Pause toggle button (WCAG 2.2.2). */
export declare function playButton(target: string | Element, playback: Playback): { destroy(): void };

// motionSwitch, the Presentation / Analysis / Off control, is built (src/charts/controls). Changed
// from the sketch: it takes options ({ persist }) and returns a MotionSwitch.
