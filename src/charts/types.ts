// What reference charts have in common: options, events and the chart handle.

import type { EffectSlots, MarkData, MarkGeometry, Motion, MotionMode } from "../core";
import type { ColorAssignment } from "./colors";

/** Field names of D whose values are T. */
export type KeyOfType<D, T> = { [K in keyof D]-?: D[K] extends T ? K : never }[keyof D] & string;
/** A field name whose values are T, or a function returning T. */
export type Accessor<D, T> = KeyOfType<D, T> | ((d: D, i: number) => T);
/** Field names whose values are numbers, so `stack: ["name"]` is a type error. */
export type NumericKey<D> = KeyOfType<D, number>;

export interface MarkEvent<D> {
  readonly mark: MarkGeometry;
  readonly data: MarkData<D>;
  /** The mark's position among the marks in this event, for stagger. */
  readonly batch: { readonly index: number; readonly count: number };
}

/**
 * Effect slots and `chart.on()` consume the same events. Data events fire when a change starts: enter
 * and update with the new geometry, exit with the geometry on screen. Hover and leave carry the
 * geometry on screen too, part way to the new one while a change plays.
 */
export interface MarkEvents<D> {
  enter: MarkEvent<D>;
  update: MarkEvent<D> & { readonly from: MarkGeometry };
  exit: MarkEvent<D>;
  hover: MarkEvent<D> & { readonly source: "pointer" | "keyboard" | "touch"; readonly segment?: string };
  leave: MarkEvent<D>;
}

export interface ChartOptions<D> {
  readonly data: readonly D[];
  /** Accessible name; required. */
  readonly label: string;
  readonly description?: string;
  /** A string or numeric field (numeric IDs are converted with String()), or a function. Default: the category. Duplicate keys throw. */
  readonly key?: Accessor<D, string | number>;
  /**
   * Default: the page-wide `motion`. A mode is this chart's author default: the viewer's choice on the
   * page-wide motion and the device's reduced-motion setting still win, as they do over setMode().
   */
  readonly motion?: Motion | MotionMode;
  /** NoInfer: a generic data effect such as threshold() must not widen D to unknown. */
  readonly on?: EffectSlots<NoInfer<D>>;
  /** Formats values and axis ticks. */
  readonly format?: (value: number) => string;
  /** Palette slots (1–8) by series, pinned or shared. Colours follow the entity, never its rank. */
  readonly colors?: ColorAssignment | Readonly<Record<string, number>>;
  /**
   * Names for people, by series (its field, or "value" for a value read by a function): { goals:
   * "Goals", xg: "Expected goals" }. Used as given wherever the chart names a series: the legend, the
   * table's headers, the default tooltip and mark names ("16 Goals"), and announcements. A series
   * without one goes by its own name. Labels for series the chart doesn't show are kept for when it does.
   */
  readonly seriesLabels?: Readonly<Record<string, string>>;
  /** Fixed width in px. Default: the container's width, followed with a ResizeObserver. */
  readonly width?: number;
  readonly height?: number;
  /** Dim the other marks while one is hovered (to --ec-dim-opacity). Default true. The hovered mark's emphasis stays either way. */
  readonly dim?: boolean;
  /**
   * A box beside the hovered or focused mark. Default true: the category, each series' value in
   * `format`, and the total of a stack. A function gives a row's text instead ("\n" breaks a line; an
   * empty string shows none); it's set as text, never as HTML. The box itself is aria-hidden, so it
   * isn't read twice, but a function's text also becomes the mark's accessible description
   * (aria-describedby), so what it adds beyond the values (a player's position) reaches screen readers.
   */
  readonly tooltip?: boolean | ((d: NoInfer<D>) => string);
  /**
   * Words each mark's accessible name (its aria-label), which by default is the category and each
   * series' value in `format`: "Okafor: 16 goals, 4 assists". Given the row and the mark as it's
   * heading, with the series it shows, the chart's `format` and the default `text`, so a page can say
   * "1 goal". An empty string, or a throw (reported), keeps the default: a mark is never left unnamed.
   */
  readonly markLabel?: (d: NoInfer<D>, mark: MarkSummary) => string;
  /**
   * Each mark's accessible description (aria-describedby): what its name doesn't already say. Default:
   * a tooltip function's text, so a custom tooltip's extra facts reach screen readers. When that text
   * repeats the values the name already says, give only the extra facts here ("Forward"), so nothing
   * is read twice. `false` describes nothing; so do an empty string and a throw (reported).
   */
  readonly markDescription?: false | ((d: NoInfer<D>) => string);
  /**
   * The data table: the fallback every screen reader can read. Default true: a closed <details>
   * "Data table" after the chart, listing the rows in the chart's order with the category, each series
   * and, for a stack, the total, in `format`. "hidden": visually hidden but still read. An object adds
   * columns or changes its text.
   */
  readonly table?: boolean | "hidden" | TableOptions<NoInfer<D>>;
  /**
   * A polite live region that sums up each update for screen readers ("Sorted A to Z", "Okafor and
   * Tanaka changed"). Default false. A function is given the change and returns the text to announce
   * instead; "" or undefined announces nothing.
   */
  readonly announce?: boolean | ((change: ChartChange) => string | undefined);
}

export interface TableOptions<D> {
  /** Visually hidden, but still read by screen readers, as with `table: "hidden"`. Default false. */
  readonly hidden?: boolean;
  /** Extra columns, after the category's: the prototype's player position, say. */
  readonly columns?: readonly TableColumn<D>[];
  /** The category column's header. Default: the category's field name, or "Category" when a function reads it. */
  readonly category?: string;
  /** The total column's header, shown when there's more than one series, or a donut's total row's. Default "Total". */
  readonly total?: string;
  /** A donut's share column's header. Default "Share". */
  readonly share?: string;
  /** The text of the <summary> that opens the table. Default "Data table". */
  readonly summary?: string;
}

export interface TableColumn<D> {
  /** Its header. */
  readonly label: string;
  /** A field of the row, or a function of the row and its index in `data`. */
  readonly field: Accessor<D, unknown>;
  /** Default: numbers in the chart's `format`, anything else as text, and nothing for null or undefined. */
  readonly format?: (value: unknown) => string;
}

/** What `markLabel` is given beside the row: the mark as it's heading, in the chart's terms. */
export interface MarkSummary {
  readonly key: string;
  /** The category, as the axis shows it. */
  readonly category: string;
  /**
   * Each series the mark shows, from the baseline, with its name for people (from `seriesLabels`, or
   * the series itself) and its signed value. A lone value read by a function is the series "value".
   */
  readonly values: readonly { readonly series: string; readonly label: string; readonly value: number }[];
  /** The values added up. */
  readonly total: number;
  /** The chart's `format`, or its default. */
  readonly format: (value: number) => string;
  /** The name the chart gives by default: "Okafor: 16 goals, 4 assists". */
  readonly text: string;
}

/** What `announce` is given: the chart's own summary of an update, and the marks it changed. */
export interface ChartChange {
  /** What the chart announces by default: "Sorted A to Z. Okafor and Tanaka changed". "" when it would say nothing. */
  readonly text: string;
  /** Keys of the marks whose values changed, in visual order. */
  readonly changed: readonly string[];
  /** Keys of the marks that appeared, in visual order. */
  readonly added: readonly string[];
  /** Keys of the marks that left. */
  readonly removed: readonly string[];
}

export interface BarChartOptions<D> extends ChartOptions<D> {
  /** The axis whose values aren't numbers is the category; `orientation` can force it. */
  readonly x?: Accessor<D, number | string>;
  readonly y?: Accessor<D, number | string>;
  /** Numeric fields stacked from the baseline, in order. Used instead of the value axis; each is a segment named after its field. */
  readonly stack?: readonly NumericKey<D>[];
  /** Default "none": data order. "value": the largest total first. "key": keys A–Z, with numbers in numeric order. */
  readonly sort?: "value" | "key" | "none" | ((a: D, b: D) => number);
  /** "horizontal": bars, categories along y. "vertical": columns, categories along x. */
  readonly orientation?: "horizontal" | "vertical";
  /** A swatch and name per series, above the chart, when it shows more than one series. Default true. */
  readonly legend?: boolean;
}

/** What a donut's `markLabel` is given beside the row: the slice as it's heading, as a bar's `MarkSummary` says it, and its share. */
export interface SliceSummary extends MarkSummary {
  /** The slice's share of the total, from 0 to 1. */
  readonly share: number;
}

export interface DonutChartOptions<D> extends Omit<ChartOptions<D>, "colors" | "markLabel"> {
  /** Names each slice: a field or a function. It's the slice's key too, unless `key` is given. */
  readonly category: Accessor<D, string | number>;
  /**
   * Sizes each slice: a numeric field or a function. A missing value counts as 0, and a negative or
   * non-finite one throws. The slices' series is the field's name ("shots"), or "value" for a function.
   */
  readonly value: Accessor<D, number | null | undefined>;
  /** Default "none": data order. "value": the largest first. Either way from 12 o'clock, clockwise. */
  readonly sort?: "none" | "value";
  /**
   * The text in the hole, for the total: "\n" breaks a line, and the first line is drawn large. Default
   * the total in `format` over the value's series label: "406" over "shots". `false` shows none. It's
   * aria-hidden, and its text is added to the chart's description.
   */
  readonly center?: false | ((total: number, format: (value: number) => string) => string);
  /** A swatch and name per category, above the chart, in the slices' order. Default true. */
  readonly legend?: boolean;
  /** Palette slots (1–8) by slice: its key, which is its category unless `key` is given. Pinned or shared. */
  readonly colors?: ColorAssignment | Readonly<Record<string, number>>;
  /**
   * Words each slice's accessible name, which by default is its category, its value in `format` with
   * its series' label, and its share as a whole percent: "Saved: 112 shots, 28%". Given the row and the
   * slice as it's heading, with its share. An empty string, or a throw (reported), keeps the default.
   */
  readonly markLabel?: (d: NoInfer<D>, mark: SliceSummary) => string;
}

export interface Chart<D, O> {
  /**
   * Changes options and animates to the new state, by the motion mode. Resolves when the change has
   * settled and the marks it removed are gone (their exit effects done), or as soon as another
   * update() supersedes it. Rejects, changing nothing, on options it can't draw. `on` and `motion`
   * can't change yet.
   */
  update(next: Partial<O>): Promise<void>;
  /** Listens for mark events; returns the unsubscribe. */
  on<K extends keyof MarkEvents<D>>(type: K, listener: (event: MarkEvents<D>[K]) => void): () => void;
  /** The marks now on screen, in visual order (leaving marks excluded): part way there while a change plays. */
  marks(): readonly MarkGeometry[];
  readonly element: SVGSVGElement;
  /** Clears every effect and removes the chart. */
  destroy(): void;
}
