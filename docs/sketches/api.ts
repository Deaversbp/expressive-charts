/**
 * Proposed public API for expressive-charts, as declarations only.
 *
 * Design sketch from the October 2026 design session. What's built is re-exported from src/core,
 * so the sketch builds on the real thing: the motion core, the shared contracts (MarkGeometry,
 * MarkData, the drawing API, EffectContext, the effect kinds, Icon) and the geometry (describe.bar,
 * .arc, .line, .point, matrix, offset). Everything still declared here is planned. Lines marked
 * NEW were added because writing the examples in ./examples exposed a gap in docs/plan.md.
 */

export * from "../../src/core/index";
import type {
  AnyMarkEffect,
  Baseline,
  Color,
  Combined,
  DataEffect,
  describe as builders,
  Easing,
  EffectContext,
  GeometryEffect,
  Icon,
  MarkData,
  MarkEffect,
  MarkGeometry,
  Motion,
  MotionMode,
  MotionView,
  Sample,
  Timing,
  TransitionEffect
} from "../../src/core/index";

// ── Shared contracts and drawing API: built, in src/core/contracts ───────────
// MarkGeometry, Outline, Sample, MarkData (with previous), Paint, MarkStyle, MarkHandle, IconHandle,
// PathHandle, TextStyle, TextHandle, Layer, EffectContext (with previous), GeometryEffect,
// DataEffect, TransitionEffect, MarkEffect, AnyMarkEffect, Combined.

// ── Effects ──────────────────────────────────────────────────────────────────

export declare function sequence<E extends readonly AnyMarkEffect[]>(...effects: E): Combined<E>;
export declare function parallel<E extends readonly AnyMarkEffect[]>(...effects: E): Combined<E>;
/** Offsets each mark in a batch; 0 in analysis and off. Never a default. */
export declare function stagger<E extends AnyMarkEffect>(effect: E, options: { readonly delay: number }): E;
/** Runs only on matching marks: a series name, a key, or a predicate. */
export declare function only<E extends AnyMarkEffect>(filter: string | ((mark: MarkGeometry) => boolean), effect: E): E;

export interface GaitState {
  readonly distance: number;
  readonly progress: number;
  readonly length: number;
  readonly size: number;
}
export interface GaitPose {
  readonly lift: number;
  readonly spin: number;
  readonly tilt: number;
}
export type Gait = (state: GaitState) => GaitPose;
export declare const gaits: {
  roll(): Gait;
  step(options?: { readonly stride?: number; readonly lift?: number; readonly tilt?: number }): Gait;
  slide(): Gait;
};

export interface TravelOptions {
  /** A segment's series name; the whole walk if omitted. A missing or empty segment makes this a no-op. */
  readonly along?: string;
  readonly gait?: Gait | "roll" | "step" | "slide";
  readonly size?: number | "fit";
  readonly orient?: "auto" | "follow" | "level";
  readonly ride?: "center" | "on";
}

export declare function travel(icon: Icon | string, options?: TravelOptions): GeometryEffect;
export declare function wiggle(options?: { readonly swing?: number }): GeometryEffect;
export declare function pulse(options?: { readonly times?: number; readonly color?: Color }): GeometryEffect;
export declare function flash(options?: { readonly color?: Color }): GeometryEffect;
export declare function threshold(options: { readonly compareTo: string | number; readonly color?: Color }): DataEffect;
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

// Icon and IconShape are built, in src/core/contracts.

export type IconSpec = Omit<Icon, "footprint" | "pivot" | "size"> & Partial<Pick<Icon, "footprint" | "pivot" | "size">>;

export declare function defineIcon(spec: IconSpec): Icon;
export declare function iconFromSvg(markup: string, spec: Omit<IconSpec, "shapes" | "box">): Icon;
export declare function registerIcon(icon: Icon): void;
export declare function registerIcons(icons: readonly Icon[]): void;
export declare const icons: { readonly dot: Icon; readonly arrow: Icon; readonly chevron: Icon };

// ── Presets ──────────────────────────────────────────────────────────────────

/** Built-in names autocomplete; custom names are checked when the chart is created. */
export type PresetName = "wiggle" | "pulse" | "flash" | (string & {});
export declare function registerPreset(name: string, factory: () => MarkEffect): void;

// ── Events and effect slots (shared by reference charts and adapters) ───────

export type EffectOption<D> = MarkEffect<D> | PresetName;

/** NEW: slots grouped under `on`, so the `update` slot no longer collides with `chart.update()`. */
export interface EffectSlots<D> {
  readonly hover?: EffectOption<D>;
  readonly enter?: EffectOption<D>;
  readonly update?: EffectOption<D>;
  readonly exit?: EffectOption<D>;
  readonly decorate?: EffectOption<D>;
}

export interface MarkEvent<D> {
  readonly mark: MarkGeometry;
  readonly data: MarkData<D>;
  readonly batch: { readonly index: number; readonly count: number };
}

export interface MarkEvents<D> {
  enter: MarkEvent<D>;
  update: MarkEvent<D> & { readonly from: MarkGeometry };
  exit: MarkEvent<D>;
  hover: MarkEvent<D> & { readonly source: "pointer" | "keyboard" | "touch"; readonly segment?: string };
  leave: MarkEvent<D>;
}

/** What reference charts and adapters have in common. */
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

/** Field names of D whose values are T. */
export type KeyOfType<D, T> = { [K in keyof D]-?: D[K] extends T ? K : never }[keyof D] & string;
/** A field name whose values are T, or a function returning T. */
export type Accessor<D, T> = KeyOfType<D, T> | ((d: D, i: number) => T);
/** Field names whose values are numbers, so `stack: ["name"]` is a type error. */
export type NumericKey<D> = KeyOfType<D, number>;

export interface ColorAssignment {
  slot(key: string): number;
}
export declare function colorAssignment(fixed?: Readonly<Record<string, number>>): ColorAssignment;

export interface ChartOptions<D> {
  readonly data: readonly D[];
  /** Accessible name; required. */
  readonly label: string;
  readonly description?: string;
  /** A string or numeric field (numeric IDs are converted with String()), or a function. */
  readonly key?: Accessor<D, string | number>;
  readonly motion?: Motion | MotionMode;
  /** NEW NoInfer: without it, a data effect such as threshold() (D = unknown) widens D and switches off field checking. */
  readonly on?: EffectSlots<NoInfer<D>>;
  readonly tooltip?: boolean | ((d: D) => string);
  readonly table?: boolean | "hidden";
  readonly format?: (value: number) => string;
  readonly colors?: ColorAssignment | Readonly<Record<string, number>>;
  readonly width?: number;
  readonly height?: number;
  readonly dim?: boolean;
}

export interface Chart<D, O> extends MarkSourceHandle<D> {
  update(next: Partial<O>): Promise<void>;
  readonly element: SVGSVGElement;
}

export interface BarChartOptions<D> extends ChartOptions<D> {
  readonly x?: Accessor<D, number | string>;
  readonly y?: Accessor<D, number | string>;
  readonly stack?: readonly NumericKey<D>[];
  readonly sort?: "value" | "key" | "none" | ((a: D, b: D) => number);
  readonly orientation?: "horizontal" | "vertical";
}

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
