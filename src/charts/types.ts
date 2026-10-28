// What reference charts have in common: options, events and the chart handle.

import type { Color, EffectSlots, MarkData, MarkGeometry, Motion, MotionMode } from "../core";
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
  /** `source` "linked": hovered by `link()`, because a mark in another chart with its linking value was. */
  hover: MarkEvent<D> & { readonly source: "pointer" | "keyboard" | "touch" | "linked"; readonly segment?: string };
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
   * A swatch and a name for each series or, on a donut, each category, above the chart. Default true.
   * Bars list their series when more than one shows. An object's `entries` come after the chart's
   * own, for colours its effects draw, which the chart can't know: { label: "Goals below xG", color:
   * "negative" }. With entries, a single series is listed too, so its colour is named beside theirs.
   */
  readonly legend?: boolean | LegendOptions;
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

export interface LegendOptions {
  /** Entries after the chart's own, in order. */
  readonly entries?: readonly LegendEntry[];
}

/** A legend entry the page adds: a swatch in `color`, named by `label` in the theme's text colour. */
export interface LegendEntry {
  readonly label: string;
  /** A theme token ("negative", "series-3") or a CSS colour. Not "mark" or "mark-strong": an entry has no mark. */
  readonly color: Color;
}

export interface TableOptions<D> {
  /** Visually hidden, but still read by screen readers, as with `table: "hidden"`. Default false. */
  readonly hidden?: boolean;
  /** Extra columns, after the category's (the prototype's player position, say) or, with `after: "values"`, after the chart's values. */
  readonly columns?: readonly TableColumn<D>[];
  /** The category column's header. Default: the category's field name, or "Category" when a function reads it. */
  readonly category?: string;
  /** The header of a stack's total column, or of a donut's total row. Default "Total". */
  readonly total?: string;
  /** A donut's share column's header. Default "Share". */
  readonly share?: string;
  /**
   * Each series' column header, by series (its field, or "value" for a value read by a function):
   * { shots: "Shots" }. Default: its `seriesLabels` name, or the series itself. Only the table's
   * headers change; the legend, names and tooltip keep `seriesLabels`.
   */
  readonly series?: Readonly<Record<string, string>>;
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
  /**
   * Where it goes. Default "category": just after the category, before the values. "values": last,
   * after every column of the chart's own (the series, a total, a share), as a Difference column is.
   */
  readonly after?: "category" | "values";
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
  /**
   * Default "series": each segment takes its series' slot through `colors`, and the legend lists the
   * series. "category": each bar takes its own slot, by its key (its category unless `key` is given),
   * as a donut's slice does, so one `colors` assignment shared with a donut keeps each category's
   * colour in both; the legend lists the categories. It needs one series: on a stack it throws.
   */
  readonly colorBy?: "series" | "category";
  /**
   * Px the layout keeps clear past the labels at each end of the value axis that bars reach, for text
   * an effect draws there: a `delta` past a bar's value label, or past a negative bar's name. Default
   * 0. At 320 px, 28 keeps a `delta` inside the chart.
   */
  readonly room?: number;
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
  /** Palette slots (1–8) by slice: its key, which is its category unless `key` is given. Pinned or shared. */
  readonly colors?: ColorAssignment | Readonly<Record<string, number>>;
  /**
   * Words each slice's accessible name, which by default is its category, its value in `format` with
   * its series' label, and its share as a whole percent: "Saved: 112 shots, 28%". Given the row and the
   * slice as it's heading, with its share. An empty string, or a throw (reported), keeps the default.
   */
  readonly markLabel?: (d: NoInfer<D>, mark: SliceSummary) => string;
}

export interface LineChartOptions<D> extends ChartOptions<D> {
  /**
   * Each row's x: a field or a function giving a number or a Date. Dates make a time axis, in
   * `timeZone`. Every row's x must be the same kind: numbers and Dates together throw a TypeError,
   * and so does an invalid Date. There's one row per x, drawn in ascending x, and x values must be
   * unique (Dates by their time) whatever the keys, since each x is one focus stop, one hit column
   * and one place to reveal to. `key` defaults to x: a number with String(), a Date's toISOString().
   */
  readonly x: Accessor<D, number | Date>;
  /**
   * A time axis's zone: "UTC" (the default) or "local", the viewer's clock. Ticks fall on day, month
   * and year boundaries in it, and the names, the tooltip and the table say times in it. A date-only
   * value such as new Date("2026-01-05") is UTC midnight, so in UTC it's 5 January on every machine.
   */
  readonly timeZone?: "UTC" | "local";
  /**
   * Words an x for people instead of the default: in each x's name, the tooltip's title, the table's
   * row headers and the announcements, and as `markLabel`'s `category`. Given the x as the data has it,
   * a Date on a time axis or a number. Default: a time axis's medium date in the page's locale ("Jan 5,
   * 2026"), with the time when any x has one; a number as given. The ticks keep their own wording. A
   * throw makes the chart throw and update() reject, as `format`'s does.
   */
  readonly xFormat?: (x: Date | number) => string;
  /**
   * The numeric fields drawn as lines, in order. Each is a line mark keyed by its field, plus a point
   * mark per row keyed "<series>@<row key>" ("goals@12"). A missing value, null or undefined, is a gap
   * in its line, with no point; the x is still a stop, whose name, tooltip and table row say the
   * series is missing there. NaN and the infinities throw.
   */
  readonly series: readonly KeyOfType<D, number | null | undefined>[];
  /**
   * The label at each line's end, in the right margin: by default its value in `format` with its
   * series' label ("52 goals"), counting between values while a change or a reveal plays. `false`
   * turns them off. A function words them, given the value (rounded as it counts), the series and
   * the chart's `format`; an empty string shows none, and a throw (reported) keeps the default.
   */
  readonly labels?: false | ((value: number, series: string, format: (value: number) => string) => string);
  /**
   * What the pointer, touch and the keys hover. "x", the default: every series' point at the nearest
   * x, with a crosshair, nothing dimmed, and the x's as focus stops. "point": the revealed point nearest
   * the pointer, by distance, anywhere over the plot (of two as near, the series first in `series`),
   * alone. Its line stays at full strength and every other line and point dims, unless `dim` is false;
   * there's no crosshair, and the tooltip sits above the point. The points are the focus stops: Left
   * and Right go along the line, Up and Down to the point above or below. Links still go by x. Anything
   * else throws a TypeError. update({ hover }) changes it at once: a held hover ends, and focus moves
   * to the nearest stop of the new kind.
   */
  readonly hover?: "x" | "point";
  /**
   * A box beside the hovered or focused x or point, as on every chart. A function is given the row
   * and, with `hover: "point"`, the point's series as a second argument: (d, { series }) => text. With
   * "x" it's given the row alone.
   */
  readonly tooltip?: boolean | ((d: NoInfer<D>, point?: { readonly series: string }) => string);
}

export interface LineChart<D> extends Chart<D, LineChartOptions<D>> {
  /**
   * Shows the data up to `x`, at once: a view, not a data change, so it fires no events. Each line
   * ends at x (part way between two rows when x falls between them) and its decorations follow it, as
   * playback drives it frame by frame. Points past x are hidden, can't be hovered or focused, and
   * aren't in `marks()`; focus on one moves to the nearest revealed x. The scales, the table, the
   * names and the announcements cover all the data. Clamped to the rows' range, and kept across
   * `update()`: the default, `reveal(Infinity)`, shows everything, rows added later included. On a
   * time axis, x is a Date or its time in ms, which is what playback() plays.
   */
  reveal(x: number | Date): void;
}

/** A mark's label as the chart draws it now: what a chart's `labels()` gives. */
export interface ChartLabel {
  /** The mark's key. */
  readonly key: string;
  /** "category": the mark's name (a bar's category, a slice's outside label). "value": its value (a bar's total, a slice's share, a line's end label). */
  readonly role: "category" | "value";
  readonly text: string;
  /** Where its baseline's anchor point sits, in the chart's <svg> units (its viewBox), and how it's anchored there. */
  readonly x: number;
  readonly y: number;
  readonly anchor: "start" | "middle" | "end";
  /** The <text> as drawn, with the chart's classes, so a copy keeps the stylesheet's styling. */
  readonly element: SVGTextElement;
}

export interface Chart<D, O> {
  /**
   * Changes options and animates to the new state, by the motion mode. Resolves when the change has
   * settled and the marks it removed are gone (their exit effects done), or as soon as another
   * update() supersedes it. Rejects, changing nothing, on options it can't draw, or an `on` it can't
   * resolve (an unknown preset name). `motion` can't change yet.
   *
   * A new `on` swaps the effects of the slots it changes; a slot given the same effect or preset name
   * keeps its runs. A changed slot's runs are cleared and the new effect starts where they were:
   * `decorate` again on every mark, and a held hover replays with the new hover effect once the
   * change settles. `enter`, `update` and `exit` draw the new effect's end state where theirs were,
   * so nothing enters again. Focus stays on its mark.
   */
  update(next: Partial<O>): Promise<void>;
  /** Listens for mark events; returns the unsubscribe. */
  on<K extends keyof MarkEvents<D>>(type: K, listener: (event: MarkEvents<D>[K]) => void): () => void;
  /** The marks now on screen, in visual order (leaving marks excluded): part way there while a change plays. */
  marks(): readonly MarkGeometry[];
  /**
   * Moves focus to the mark `key` as a key press would, whatever the last input was: the focus ring
   * shows and its hover plays. On a line chart it's the x's focus stop: `key` is the x's key, or one
   * of its points'. With `hover: "point"` it's the point's: its own key, or an x's, for its first
   * series' point there. A key that isn't on screen (unknown, leaving, or past a line's reveal) does nothing.
   */
  focus(key: string): void;
  /**
   * Ends the hover, pointer or keyboard, as the viewer moving away would: the emphasis, the dimming,
   * the tooltip and the hover effects end, and `leave` fires for each mark that was hovered. Focus
   * stays where it is, with its ring, as after Escape. Does nothing when nothing is hovered.
   */
  leave(): void;
  /**
   * Each mark's labels as drawn now, in the marks' visual order (leaving marks excluded): a bar's
   * category and value, a slice's category and share outside the ring, a line's end label as its value.
   * Labels that aren't shown (a slice's label dropped for room, a line's with `labels: false`) and empty
   * ones are left out.
   */
  labels(): readonly ChartLabel[];
  readonly element: SVGSVGElement;
  /** Clears every effect and removes the chart. */
  destroy(): void;
}
