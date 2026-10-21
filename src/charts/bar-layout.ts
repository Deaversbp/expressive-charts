// The bar chart's layout: pure, so it's tested without a DOM. Options in, marks (described with
// describe.bar), labels, ticks and size out. Pixel sizes follow the prototype (demo/lab.html).

import { describe, type MarkData, type MarkGeometry, type Rect } from "../core";
import type { Accessor, BarChartOptions } from "./types";

export type Orientation = "horizontal" | "vertical";

export interface BarSeries<D> {
  /** The segment's name: the stacked field, or the value field. */
  readonly series: string;
  readonly value: (d: D, i: number) => unknown;
}

/** Which accessor is the category, which give the values. */
export interface BarEncoding<D> {
  readonly orientation: Orientation;
  readonly category: (d: D, i: number) => unknown;
  readonly key: (d: D, i: number) => unknown;
  readonly series: readonly BarSeries<D>[];
}

export interface TextPlacement {
  readonly x: number;
  readonly y: number;
  readonly anchor: "start" | "middle" | "end";
  readonly text: string;
}

export interface BarRow<D> {
  readonly key: string;
  readonly datum: D;
  /** The row's index in `data`. */
  readonly index: number;
  readonly values: readonly { readonly series: string; readonly value: number }[];
  readonly total: number;
  readonly geometry: MarkGeometry;
  readonly data: MarkData<D>;
  /** The category label. */
  readonly label: TextPlacement;
  /** The total, at the bar's tip. */
  readonly value: TextPlacement;
  /** The pointer target: the row's whole band. */
  readonly hit: Rect;
}

export interface Tick {
  readonly value: number;
  readonly line: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };
  readonly label: TextPlacement;
}

export interface BarLayout<D> {
  readonly width: number;
  readonly height: number;
  readonly orientation: Orientation;
  /** In visual order: top to bottom, or left to right. */
  readonly rows: readonly BarRow<D>[];
  readonly ticks: readonly Tick[];
}

export interface BarLayoutInput<D> {
  readonly data: readonly D[];
  readonly encoding: BarEncoding<D>;
  readonly sort: BarChartOptions<D>["sort"];
  readonly width: number;
  readonly height: number | undefined;
  readonly format: (value: number) => string;
  /** Text width in px, for margins. */
  readonly measure: (text: string, className: string, size: number) => number;
}

// From the prototype: 34 px rows with 20 px bars, a 2 px gap between segments, rounded tips.
const ROW = 34;
const BAR = 20;
const RADIUS = 4;
const GAP = 2;
const MAX_COLUMN = 72;
const VERTICAL_HEIGHT = 300;
const LABEL_SIZE = 12.5;
const VALUE_SIZE = 12.5;
const TICK_SIZE = 11;
/** Space under the plot for tick (or category) labels. */
const AXIS = 26;
const TOP = 4;
/** Between a label and what it labels. */
const PAD = 6;
/** Moves a text baseline down by this share of the font size to centre the text on a line. */
const CENTRE = 0.36;

/** Reads the options: which axis is the category, which fields are the values. Throws on what it can't draw. */
export function barEncoding<D>(options: BarChartOptions<D>): BarEncoding<D> {
  const { x, y, stack, data } = options;
  let orientation = options.orientation;
  if (orientation !== undefined && orientation !== "horizontal" && orientation !== "vertical") {
    throw new TypeError(`barChart: orientation must be "horizontal" or "vertical", got ${String(orientation)}.`);
  }
  if (stack !== undefined) {
    if (!Array.isArray(stack) || stack.length === 0) throw new TypeError("barChart: stack needs at least one numeric field.");
    const seen = new Set<string>();
    for (const field of stack) {
      if (seen.has(field)) throw new TypeError(`barChart: "${field}" appears twice in stack.`);
      seen.add(field);
    }
  }
  if (orientation === undefined) {
    if (x !== undefined && y !== undefined) {
      const xNumbers = numeric(data, accessor(x));
      const yNumbers = numeric(data, accessor(y));
      if (xNumbers !== yNumbers) orientation = xNumbers ? "horizontal" : "vertical";
      else if (data.length === 0) orientation = "horizontal";
      else {
        throw new RangeError(
          `barChart: ${xNumbers ? "x and y both hold numbers" : "neither x nor y holds numbers"}, so it can't tell which is the category. ` +
            `Set orientation: "horizontal" (categories along y) or "vertical" (categories along x).`
        );
      }
    } else if (stack !== undefined && (x !== undefined || y !== undefined)) {
      orientation = y !== undefined ? "horizontal" : "vertical";
    } else {
      throw new TypeError("barChart needs x and y (the axis whose values aren't numbers is the category), or one of them plus stack.");
    }
  }
  const horizontal = orientation === "horizontal";
  const categoryOption = horizontal ? y : x;
  const valueOption = horizontal ? x : y;
  if (categoryOption === undefined) throw new TypeError(`barChart: a ${orientation} chart takes its categories from ${horizontal ? "y" : "x"}.`);
  const category = accessor(categoryOption);

  let series: BarSeries<D>[];
  if (stack !== undefined) series = stack.map((field) => ({ series: field, value: accessor<D, unknown>(field) }));
  else if (valueOption !== undefined) series = [{ series: typeof valueOption === "string" ? valueOption : "value", value: accessor(valueOption) }];
  else throw new TypeError(`barChart needs values: ${horizontal ? "x" : "y"} set to a numeric field, or stack.`);

  return { orientation, category, key: options.key === undefined ? category : accessor(options.key), series };
}

export function layoutBars<D>(input: BarLayoutInput<D>): BarLayout<D> {
  const rows = sortRows(prepareRows(input), input.sort);
  const domain = niceDomain(rows.map((row) => row.total));
  return input.encoding.orientation === "horizontal" ? horizontal(input, rows, domain) : vertical(input, rows, domain);
}

interface Prepared<D> {
  readonly key: string;
  readonly category: string;
  readonly datum: D;
  readonly index: number;
  readonly values: readonly { readonly series: string; readonly value: number }[];
  readonly total: number;
}

interface Domain {
  readonly lo: number;
  readonly hi: number;
  readonly ticks: readonly number[];
}

function prepareRows<D>({ data, encoding }: BarLayoutInput<D>): Prepared<D>[] {
  const keys = new Set<string>();
  return data.map((datum, index) => {
    const key = String(encoding.key(datum, index));
    if (keys.has(key)) throw new Error(`barChart: two rows have the key "${key}". Keys must be unique; pass a key accessor if categories repeat.`);
    keys.add(key);
    const values = encoding.series.map(({ series, value }) => ({ series, value: numberOf(value(datum, index), series, key) }));
    if (values.some((v) => v.value > 0) && values.some((v) => v.value < 0)) {
      throw new RangeError(`barChart: the stack for "${key}" mixes positive and negative values, which isn't supported yet.`);
    }
    const total = values.reduce((sum, v) => sum + v.value, 0);
    return { key, category: String(encoding.category(datum, index) ?? ""), datum, index, values, total };
  });
}

function sortRows<D>(rows: Prepared<D>[], sort: BarLayoutInput<D>["sort"]): Prepared<D>[] {
  if (sort === undefined || sort === "none") return rows;
  // Array.prototype.sort is stable, so ties keep data order.
  if (sort === "value") return [...rows].sort((a, b) => b.total - a.total);
  if (sort === "key") return [...rows].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  if (typeof sort === "function") return [...rows].sort((a, b) => sort(a.datum, b.datum));
  throw new TypeError(`barChart: sort must be "value", "key", "none" or a comparator, got ${String(sort)}.`);
}

/** Zero is always in the domain; the ends are rounded out to a 1, 2 or 5 step, about four ticks apart (as in the prototype). */
export function niceDomain(values: readonly number[]): Domain {
  let lo = values.reduce((min, v) => Math.min(min, v), 0);
  let hi = values.reduce((max, v) => Math.max(max, v), 0);
  if (lo === hi) hi = 1;
  const step = niceStep((hi - lo) / 4);
  lo = clean(Math.floor(lo / step) * step);
  hi = clean(Math.ceil(hi / step) * step);
  const count = Math.round((hi - lo) / step);
  const ticks = Array.from({ length: count + 1 }, (_, i) => clean(lo + i * step));
  return { lo, hi, ticks };
}

function niceStep(span: number): number {
  const power = 10 ** Math.floor(Math.log10(span));
  const f = span / power;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
}

function horizontal<D>(input: BarLayoutInput<D>, rows: readonly Prepared<D>[], domain: Domain): BarLayout<D> {
  const { width, format, measure } = input;
  const n = rows.length;
  const values = rows.map((row) => format(row.total));
  const labelWidth = widest(rows.map((row) => row.category), "ec-label", LABEL_SIZE, measure);
  const valueWidth = widest(values, "ec-value", VALUE_SIZE, measure);
  const ticks = domain.ticks.map(format);
  const tickWidth = widest(ticks, "ec-tick", TICK_SIZE, measure);
  // Value labels sit past the tip, so negative bars need room on the left as well.
  const negativeRoom = domain.lo < 0 ? valueWidth + PAD : 0;
  const left = Math.max(labelWidth + 10 + negativeRoom, tickWidth / 2 + 2);
  const right = Math.max(valueWidth + PAD + 4, tickWidth / 2 + 2);
  const rowSize = input.height === undefined || n === 0 ? ROW : Math.max(0, input.height - TOP - AXIS) / n;
  const thickness = (rowSize * BAR) / ROW;
  const height = input.height ?? TOP + n * rowSize + AXIS;
  const plot = { x: left, y: TOP, width: Math.max(0, width - left - right), height: n * rowSize };
  const perUnit = plot.width / (domain.hi - domain.lo);
  const at = (v: number): number => plot.x + (v - domain.lo) * perUnit;
  const zero = at(0);

  return {
    width,
    height,
    orientation: "horizontal",
    rows: rows.map((row, i) => {
      const band = TOP + i * rowSize;
      const tip = at(row.total);
      const negative = row.total < 0;
      const geometry = describe.bar({
        key: row.key,
        ...(row.values.length === 1 ? { series: row.values[0]!.series } : {}),
        x: Math.min(zero, tip),
        y: band + (rowSize - thickness) / 2,
        width: Math.abs(tip - zero),
        height: thickness,
        baseline: negative ? "right" : "left",
        radius: RADIUS,
        gap: GAP,
        segments: row.values.map((v) => ({ series: v.series, size: Math.abs(v.value) * perUnit }))
      });
      const line = band + rowSize / 2 + LABEL_SIZE * CENTRE;
      return {
        ...rowFields(row, geometry),
        label: { x: left - 10 - negativeRoom, y: line, anchor: "end", text: row.category },
        value: { x: negative ? tip - PAD : tip + PAD, y: line, anchor: negative ? "end" : "start", text: values[i]! },
        hit: { x: 0, y: band, width, height: rowSize }
      };
    }),
    ticks: domain.ticks.map((value, i) => {
      const x = at(value);
      const bottom = plot.y + plot.height;
      return { value, line: { x1: x, y1: plot.y, x2: x, y2: bottom }, label: { x, y: bottom + 16, anchor: "middle", text: ticks[i]! } };
    })
  };
}

function vertical<D>(input: BarLayoutInput<D>, rows: readonly Prepared<D>[], domain: Domain): BarLayout<D> {
  const { width, format, measure } = input;
  const n = rows.length;
  const height = input.height ?? VERTICAL_HEIGHT;
  const values = rows.map((row) => format(row.total));
  const ticks = domain.ticks.map(format);
  const tickWidth = widest(ticks, "ec-tick", TICK_SIZE, measure);
  // Room above positive columns (and below negative ones) for their value labels.
  const top = domain.hi > 0 ? VALUE_SIZE + PAD + 2 : TOP;
  const bottom = AXIS + (domain.lo < 0 ? VALUE_SIZE + PAD : 0);
  const left = tickWidth + 8 + 2;
  const plot = { x: left, y: top, width: Math.max(0, width - left - 8), height: Math.max(0, height - top - bottom) };
  const band = n > 0 ? plot.width / n : 0;
  const thickness = Math.min((band * BAR) / ROW, MAX_COLUMN);
  const perUnit = plot.height / (domain.hi - domain.lo);
  const at = (v: number): number => plot.y + plot.height - (v - domain.lo) * perUnit;
  const zero = at(0);

  return {
    width,
    height,
    orientation: "vertical",
    rows: rows.map((row, i) => {
      const x0 = plot.x + i * band;
      const centre = x0 + band / 2;
      const tip = at(row.total);
      const negative = row.total < 0;
      const geometry = describe.bar({
        key: row.key,
        ...(row.values.length === 1 ? { series: row.values[0]!.series } : {}),
        x: centre - thickness / 2,
        y: Math.min(zero, tip),
        width: thickness,
        height: Math.abs(tip - zero),
        baseline: negative ? "top" : "bottom",
        radius: RADIUS,
        gap: GAP,
        segments: row.values.map((v) => ({ series: v.series, size: Math.abs(v.value) * perUnit }))
      });
      return {
        ...rowFields(row, geometry),
        label: { x: centre, y: plot.y + plot.height + 18, anchor: "middle", text: row.category },
        value: { x: centre, y: negative ? tip + PAD + VALUE_SIZE * 0.8 : tip - PAD, anchor: "middle", text: values[i]! },
        hit: { x: x0, y: 0, width: band, height }
      };
    }),
    ticks: domain.ticks.map((value, i) => {
      const y = at(value);
      return {
        value,
        line: { x1: plot.x, y1: y, x2: plot.x + plot.width, y2: y },
        label: { x: left - 8, y: y + TICK_SIZE * CENTRE, anchor: "end", text: ticks[i]! }
      };
    })
  };
}

function rowFields<D>(row: Prepared<D>, geometry: MarkGeometry): Pick<BarRow<D>, "key" | "datum" | "index" | "values" | "total" | "geometry" | "data"> {
  return { key: row.key, datum: row.datum, index: row.index, values: row.values, total: row.total, geometry, data: barData(row, geometry) };
}

/**
 * Values along the walk: from 0 at the baseline to the total at the tip. `related(series)` is that
 * series' segment in the same row, its samples running over the segment's own span.
 */
function barData<D>(row: Prepared<D>, geometry: MarkGeometry): MarkData<D> {
  const { datum, total } = row;
  const valueAt = (distance: number): number => (geometry.length > 0 ? (total * distance) / geometry.length : 0);
  const data: MarkData<D> = {
    datum,
    samples: [
      { t: 0, value: 0 },
      { t: 1, value: total }
    ],
    related(series) {
      const segment = geometry.segments?.find((s) => s.series === series);
      if (!segment) return undefined;
      const from = Math.hypot(segment.start.x - geometry.start.x, segment.start.y - geometry.start.y);
      return {
        datum,
        samples: [
          { t: 0, value: valueAt(from) },
          { t: 1, value: valueAt(from + segment.length) }
        ],
        related: data.related
      };
    }
  };
  return data;
}

function widest(texts: readonly string[], className: string, size: number, measure: BarLayoutInput<unknown>["measure"]): number {
  return texts.reduce((max, text) => Math.max(max, measure(text, className, size)), 0);
}

function accessor<D, T>(option: Accessor<D, T> | string): (d: D, i: number) => T {
  if (typeof option === "function") return option;
  return (d) => (d as Record<string, unknown>)[option] as T;
}

/** Every value is a number (or missing), and at least one is there. */
function numeric<D>(data: readonly D[], read: (d: D, i: number) => unknown): boolean {
  let found = false;
  for (let i = 0; i < data.length; i++) {
    const value = read(data[i]!, i);
    if (value === null || value === undefined) continue;
    if (typeof value !== "number") return false;
    found = true;
  }
  return found;
}

/** Missing values (null, undefined) count as 0. */
function numberOf(value: unknown, series: string, key: string): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new RangeError(`barChart: "${series}" for "${key}" must be a finite number, got ${typeof value === "string" ? JSON.stringify(value) : String(value)}.`);
}

function clean(value: number): number {
  const rounded = Number(value.toPrecision(12));
  return rounded === 0 ? 0 : rounded;
}
