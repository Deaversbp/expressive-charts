/**
 * Proposed public API for expressive-charts, as declarations only.
 *
 * Design sketch from the October 2026 design session. What's built is re-exported from src, so
 * the sketch builds on the real thing: the motion core, the shared contracts (MarkGeometry,
 * MarkData, the drawing API, EffectContext, the effect kinds, Icon, the effect slots), the geometry
 * (describe.bar, .arc, .line, .point, matrix, offset), the preset and icon registries
 * (registerPreset, registerIcon, registerIcons), the thin bar chart's types (mark events, chart
 * options, accessors, colorAssignment), the icons (defineIcon, iconFromSvg, icons) and the first
 * effects (travel with its gaits, sequence, parallel, only). Everything still declared here is
 * planned. Lines marked NEW were added because writing the examples in ./examples exposed a gap in
 * docs/plan.md.
 */

export * from "../../src/index";
import type {
  Accessor,
  AnyMarkEffect,
  BarChartOptions as BuiltBarChartOptions,
  Baseline,
  Chart as BuiltChart,
  ChartOptions as BuiltChartOptions,
  Color,
  ColorAssignment,
  DataEffect,
  describe as builders,
  Easing,
  EffectContext,
  EffectSlots,
  GeometryEffect,
  MarkData,
  MarkEvents,
  MarkGeometry,
  Motion,
  MotionMode,
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

// travel (with TravelOptions), the gaits (gaits.roll, .step, .slide; Gait, GaitState, GaitPose) and
// the combinators sequence, parallel and only are built, in src/effects. Changed from the sketch: a
// gait can carry its own easing and pace (a step takes 15% longer and eases in and out, as in the
// prototype), and GaitState gives distances in the icon's own units plus its rolling radius
// (instead of its size), so a gait looks the same at any size.

/** Offsets each mark in a batch; 0 in analysis and off. Never a default. */
export declare function stagger<E extends AnyMarkEffect>(effect: E, options: { readonly delay: number }): E;

export declare function wiggle(options?: { readonly swing?: number }): GeometryEffect;
export declare function pulse(options?: { readonly times?: number; readonly color?: Color }): GeometryEffect;
export declare function flash(options?: { readonly color?: Color }): GeometryEffect;
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

// PresetName and registerPreset are built (src/core/contracts, src/registries). Built-in names
// autocomplete; custom names are checked when the chart is created. The built-in presets themselves
// (wiggle, pulse, flash) are registered when their effects land in M3.

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

/** A CSS selector, elements, or anything shaped like a D3 selection (its data types the callbacks). */
export type MarkSource<D> = string | Element | ArrayLike<Element> | { nodes(): Element[]; data(): D[] };

export interface ExpressiveOptions<D> {
  /** Marks that share a key are one mark; see `segment`. */
  key: (datum: D, element: Element) => string;
  /** Default: the D3 convention, element.__data__. */
  datum?: (element: Element) => D;
  /** Marks sharing a key become segments of one mark, ordered from the baseline. */
  segment?: (datum: D, element: Element) => string;
  /** Default by tag: rect → bar, circle → point, anything else → describe.shape. */
  geometry?: (element: Element, datum: D, key: string) => MarkGeometry;
  /** For rects. "auto" picks the edge all marks share. */
  baseline?: Baseline | "auto";
  /** For data effects. */
  samples?: (datum: D, mark: MarkGeometry) => readonly Sample[];
  motion?: Motion | MotionMode;
  /** NoInfer: a generic effect like threshold() must not widen D to unknown. */
  on?: EffectSlots<NoInfer<D>>;
  /** Make marks focusable (roving tabindex); focus plays hover effects. */
  keyboard?: boolean;
  /** Dim other marks on hover. Default false: the host chart owns its styling. */
  dim?: boolean;
  /** Re-read geometry on every attribute change, so decorations follow the host's own transitions. */
  watch?: boolean;
}

export interface Attachment<D> extends MarkSourceHandle<D> {
  /** Call after the host re-renders: re-reads marks and fires enter, update and exit by key. */
  refresh(source?: MarkSource<D>): void;
}

export declare function expressive<D = unknown>(target: MarkSource<D>, options: ExpressiveOptions<D>): Attachment<D>;

// ── Reference charts ─────────────────────────────────────────────────────────

// KeyOfType, Accessor, NumericKey, ColorAssignment and colorAssignment are built, in src/charts. So are
// the chart options and the chart handle; the sketch adds what's still planned to them.

/** Planned for M2: tooltips and the data table. */
interface PlannedChartOptions<D> {
  readonly tooltip?: boolean | ((d: D) => string);
  readonly table?: boolean | "hidden";
}

/** NEW NoInfer on `on` (built): without it, a data effect such as threshold() (D = unknown) widens D and switches off field checking. */
export interface ChartOptions<D> extends BuiltChartOptions<D>, PlannedChartOptions<D> {}

export interface Chart<D, O> extends BuiltChart<D, O>, MarkSourceHandle<D> {}

export interface BarChartOptions<D> extends BuiltBarChartOptions<D>, PlannedChartOptions<D> {}

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

/** Built in M1 step 5 (src/charts); declared here until it has focus() (step 9), tooltips and the table (M2). */
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
/** The Presentation / Analysis / Off control. Its choice is the viewer's, so it overrides reduced motion. */
export declare function motionSwitch(target: string | Element, motion?: Motion): { destroy(): void };
