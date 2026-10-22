// The line chart's layout: pure, so it's tested without a DOM. Options in, the frame, ticks and size
// out; placeLines and placePoints then draw the marks (lines described with describe.line, points
// with describe.point) for any state of the rows and any reveal. Pixel sizes follow the prototype's
// card 2 (demo/lab.html).
//
// A layout is drawn from a few numbers: the frame (the value scale, and the box: the x range and where
// the plot sits) and each row's x and values. Transitions interpolate those numbers, and the place
// functions draw any state in between, and any reveal, the same way the layout draws its own.

import { describe, type MarkData, type MarkGeometry, type Rect, type Sample } from "../core";
import { clean, niceDomain, niceStep, type Tick } from "./bar-layout";
import type { TextPlacement } from "./render/text";
import { decimals } from "./shell/format";
import type { Accessor, LineChartOptions } from "./types";

export type { Tick } from "./bar-layout";

export interface LineSeries<D> {
  /** The series' name: its field. */
  readonly series: string;
  readonly value: (d: D, i: number) => unknown;
}

/** Which accessor gives the x, which the key, which the values. */
export interface LineEncoding<D> {
  readonly x: (d: D, i: number) => unknown;
  /** Undefined: the key is the x. */
  readonly key: ((d: D, i: number) => unknown) | undefined;
  readonly series: readonly LineSeries<D>[];
}

export interface LineValue {
  readonly series: string;
  readonly value: number;
}

export interface LineRow<D> {
  readonly key: string;
  readonly datum: D;
  /** The row's index in `data`. */
  readonly index: number;
  readonly x: number;
  /** The x as text: the tooltip's title, the table's row header and the start of the x's name. */
  readonly label: string;
  /** In series order. */
  readonly values: readonly LineValue[];
}

/** The value axis: data `lo` sits at the box's `bottom`, data `hi` at its `top`. */
export interface LineScale {
  readonly lo: number;
  readonly hi: number;
}

/**
 * The x axis and where the plot sits, in px: data `xLo` at `left`, `xHi` at `right`, the value scale
 * between `bottom` and `top`. Plus the chart's size.
 */
export interface LineBox {
  readonly xLo: number;
  readonly xHi: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/** A change animates the scale in its values stage and the box in its positions stage. */
export interface LineFrame {
  readonly scale: LineScale;
  readonly box: LineBox;
}

/** An x tick: a label under the plot, with no gridline. */
export interface XTick {
  readonly value: number;
  readonly label: TextPlacement;
}

export interface LineLayout<D> {
  readonly width: number;
  readonly height: number;
  readonly frame: LineFrame;
  /** In ascending x. */
  readonly rows: readonly LineRow<D>[];
  readonly series: readonly string[];
  /** Gridlines and labels for the values, from the bottom. */
  readonly yTicks: readonly Tick[];
  readonly xTicks: readonly XTick[];
  /** Per series, the decimals its values are given to: an end label counts rounded to these. */
  readonly decimals: Readonly<Record<string, number>>;
}

export interface LineLayoutInput<D> {
  readonly data: readonly D[];
  readonly encoding: LineEncoding<D>;
  readonly width: number;
  readonly height: number | undefined;
  readonly format: (value: number) => string;
  /** Text width in px, for margins. */
  readonly measure: (text: string, className: string, size: number) => number;
  /** A line's end label for a value, measured for the right margin; undefined with `labels: false`. */
  readonly label: ((series: string, value: number) => string) | undefined;
}

/** A row as it's drawn now, part way through a change: where it is, and its values by series. */
export interface RowState<D> {
  readonly key: string;
  readonly datum: D;
  readonly x: number;
  readonly values: Readonly<Record<string, number>>;
}

export interface PlacedLine<D> {
  readonly series: string;
  readonly geometry: MarkGeometry;
  readonly data: MarkData<D>;
  /** The line's revealed end, in px, where its end dot and label go, and its value there. */
  readonly end: { readonly x: number; readonly y: number; readonly value: number };
}

export interface PlacedPoint<D> {
  readonly key: string;
  readonly series: string;
  readonly geometry: MarkGeometry;
  readonly data: MarkData<D>;
}

// From the prototype: 2.25 px lines, dots of radius 4.5, 300 px high, labels 10 px past the end and
// 16 px apart.
export const LINE_WIDTH = 2.25;
export const DOT_RADIUS = 4.5;
const HEIGHT = 300;
const TOP = 12;
/** Space under the plot for the x labels. */
const AXIS = 32;
/** Gridlines reach this far past the last x, so the end dots sit inside the grid. */
const GRID_PAST = 8;
const TICK_SIZE = 11;
const VALUE_SIZE = 12.5;
/** Between a line's end and its label. */
const LABEL_GAP = 10;
/** Between the centres of two end labels. */
const LABEL_SPACING = 16;
/** Between two x labels. */
const TICK_GAP = 8;
/** Moves a text baseline down by this share of the font size to centre the text on a line. */
const CENTRE = 0.36;

/** Reads the options: the x, the key and the series. Throws on what it can't draw. */
export function lineEncoding<D>(options: LineChartOptions<D>): LineEncoding<D> {
  const { x, series, key } = options;
  if (typeof x !== "string" && typeof x !== "function") throw new TypeError("lineChart needs x: a numeric field or a function that returns each row's x.");
  if (!Array.isArray(series) || series.length === 0) throw new TypeError("lineChart needs series: the numeric fields to draw as lines.");
  const seen = new Set<string>();
  for (const field of series as readonly unknown[]) {
    if (typeof field !== "string" || field === "") throw new TypeError(`lineChart: each series must be a field name, got ${show(field)}.`);
    if (seen.has(field)) throw new TypeError(`lineChart: "${field}" appears twice in series.`);
    seen.add(field);
  }
  if (key !== undefined && typeof key !== "string" && typeof key !== "function") throw new TypeError("lineChart: key must be a field name or a function.");
  const labels: unknown = options.labels;
  if (labels !== undefined && labels !== false && typeof labels !== "function") throw new TypeError("lineChart: labels must be false or a function that returns a line's end label.");
  return {
    x: accessor(x),
    key: key === undefined ? undefined : accessor(key),
    series: series.map((field) => ({ series: field, value: accessor<D, unknown>(field) }))
  };
}

export function layoutLines<D>(input: LineLayoutInput<D>): LineLayout<D> {
  const { width, measure } = input;
  const height = input.height ?? HEIGHT;
  const rows = prepareRows(input);
  const series = input.encoding.series.map((s) => s.series);
  const domain = niceDomain(rows.flatMap((row) => row.values.map((v) => v.value)));
  const yTexts = domain.ticks.map(input.format);
  const xLo = rows[0]?.x ?? 0;
  const xHi = rows[rows.length - 1]?.x ?? 0;
  const xValues = rows.length > 0 ? xTickValues(xLo, xHi) : [];
  const xTexts = xValues.map(xText);
  const xWidths = xTexts.map((text) => measure(text, "ec-tick", TICK_SIZE));

  // The values' labels on the left; the end labels, or the last x label, on the right.
  const label = input.label;
  const labelWidth = label ? widest(rows.flatMap((row) => row.values.map((v) => label(v.series, v.value))), "ec-value", VALUE_SIZE, measure) : 0;
  const left = Math.max(widest(yTexts, "ec-tick", TICK_SIZE, measure) + 10, (xWidths[0] ?? 0) / 2 + 2);
  const right = Math.max(GRID_PAST + 2, (xWidths[xWidths.length - 1] ?? 0) / 2 + 2, labelWidth > 0 ? LABEL_GAP + labelWidth + 4 : 0);
  const frame: LineFrame = {
    scale: { lo: domain.lo, hi: domain.hi },
    box: { xLo, xHi, left, right: Math.max(left, width - right), top: TOP, bottom: Math.max(TOP, height - AXIS), width, height }
  };

  const decimalsBy: Record<string, number> = {};
  for (const name of series) decimalsBy[name] = 0;
  for (const row of rows) for (const v of row.values) decimalsBy[v.series] = Math.max(decimalsBy[v.series]!, decimals(v.value));

  const xTicks = xValues.map((value, i) => placeXTick(frame, value, xTexts[i]!));
  return {
    width,
    height,
    frame,
    rows,
    series,
    yTicks: domain.ticks.map((value, i) => placeYTick(frame, value, yTexts[i]!)),
    xTicks: spaced(xTicks, xWidths),
    decimals: decimalsBy
  };
}

/** Data to px. With a single x, it sits in the middle of the plot. */
export function positions(frame: LineFrame): { x(value: number): number; y(value: number): number } {
  const { scale, box } = frame;
  const xSpan = box.xHi - box.xLo;
  const ySpan = scale.hi - scale.lo;
  return {
    x: (value) => (xSpan > 0 ? box.left + ((value - box.xLo) / xSpan) * (box.right - box.left) : (box.left + box.right) / 2),
    y: (value) => (ySpan > 0 ? box.bottom - ((value - scale.lo) / ySpan) * (box.bottom - box.top) : box.bottom)
  };
}

/**
 * Draws each series' line through `rows` (in ascending x) up to `through`: a vertex per row at or
 * before it, plus the point part way to the next row when `through` falls between two. With no row
 * at or before it, a line is its first point. Each line's data has the row at its revealed end, a
 * sample per vertex (`t` by distance along the walk, `at` its x), and the other lines as `related`.
 */
export function placeLines<D>(frame: LineFrame, rows: readonly RowState<D>[], series: readonly string[], through: number): PlacedLine<D>[] {
  const first = rows[0];
  if (!first) return [];
  const at = positions(frame);
  let last = 0;
  while (last + 1 < rows.length && rows[last + 1]!.x <= through) last++;
  const end = rows[last]!;
  const next = rows[last + 1];
  const share = next && next.x > end.x && through > end.x ? (through - end.x) / (next.x - end.x) : undefined;
  const shown = rows.slice(0, last + 1);

  const datas = new Map<string, MarkData<D>>();
  const related = (own: string) => (name: string) => (name === own ? undefined : datas.get(name));
  const lines = series.map((name): PlacedLine<D> => {
    const vertices = shown.map((row) => ({ at: row.x, value: row.values[name] ?? 0 }));
    if (share !== undefined) {
      const from = end.values[name] ?? 0;
      vertices.push({ at: through, value: from + share * ((next!.values[name] ?? 0) - from) });
    }
    const points = vertices.map((v) => ({ x: at.x(v.at), y: at.y(v.value) }));
    const geometry = describe.line({ key: name, series: name, points, width: LINE_WIDTH });
    // By distance, as the walk measures it; the last is exactly 1.
    let distance = 0;
    const samples: Sample[] = vertices.map((v, j) => {
      if (j > 0) distance += Math.hypot(points[j]!.x - points[j - 1]!.x, points[j]!.y - points[j - 1]!.y);
      const t = geometry.length > 0 ? (j === vertices.length - 1 ? 1 : Math.min(1, distance / geometry.length)) : 0;
      return { t, value: v.value, at: v.at };
    });
    const data: MarkData<D> = { datum: end.datum, samples, related: related(name) };
    datas.set(name, data);
    const tip = vertices[vertices.length - 1]!;
    return { series: name, geometry, data, end: { ...points[points.length - 1]!, value: tip.value } };
  });
  return lines;
}

/** The point mark's key: "<series>@<row key>". */
export function pointKey(series: string, row: string): string {
  return `${series}@${row}`;
}

/** Each series' point at the row: a dot, with the row's value as its one sample and the other series' points as `related`. */
export function placePoints<D>(frame: LineFrame, row: RowState<D>, series: readonly string[]): PlacedPoint<D>[] {
  const at = positions(frame);
  const x = at.x(row.x);
  const datas = new Map<string, MarkData<D>>();
  return series.map((name) => {
    const value = row.values[name] ?? 0;
    const key = pointKey(name, row.key);
    const data: MarkData<D> = { datum: row.datum, samples: [{ t: 0, value, at: row.x }], related: (other) => (other === name ? undefined : datas.get(other)) };
    datas.set(name, data);
    return { key, series: name, geometry: describe.point({ key, series: name, x, y: at.y(value), r: DOT_RADIUS }), data };
  });
}

/**
 * Each revealed x's hit column, given their px in ascending order: from halfway to the x before it to
 * halfway to the x after it, the first from the chart's left edge and the last to its right edge, so
 * the pointer hovers the nearest revealed x anywhere over the chart.
 */
export function placeColumns(frame: LineFrame, xs: readonly number[]): Rect[] {
  const { width, height } = frame.box;
  return xs.map((x, i) => {
    const from = i === 0 ? 0 : (xs[i - 1]! + x) / 2;
    const to = i === xs.length - 1 ? width : (x + xs[i + 1]!) / 2;
    return { x: from, y: 0, width: Math.max(0, to - from), height };
  });
}

/** The dashed line across the plot at x px, for the hovered x. */
export function placeCrosshair(frame: LineFrame, x: number): { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } {
  return { x1: x, y1: frame.box.top, x2: x, y2: frame.box.bottom };
}

/**
 * Each line's end label, in the order given: 10 px past its end, centred on its end's y but kept at
 * least 16 px from the others (the prototype's rule) and inside the chart.
 */
export function placeEndLabels(frame: LineFrame, ends: readonly { readonly x: number; readonly y: number; readonly text: string }[]): TextPlacement[] {
  const half = VALUE_SIZE / 2;
  const ys = spread(
    ends.map((end) => end.y),
    LABEL_SPACING,
    half,
    frame.box.height - half
  );
  return ends.map((end, i) => ({ x: end.x + LABEL_GAP, y: ys[i]! + VALUE_SIZE * CENTRE, anchor: "start", text: end.text }));
}

/**
 * Moves values apart so neighbours are at least `gap` apart, keeping them within [min, max] where
 * there's room. Values that would come too close form a cluster spaced `gap` apart and centred on
 * where its members would be, so two labels too close move apart equally. In the order given.
 */
export function spread(values: readonly number[], gap: number, min: number, max: number): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const clusters: { members: { value: number; index: number }[]; start: number }[] = [];
  const place = (members: { value: number }[]): number => {
    const mean = members.reduce((sum, m) => sum + m.value, 0) / members.length;
    const span = (members.length - 1) * gap;
    return Math.max(min, Math.min(max - span, mean - span / 2));
  };
  for (const item of order) {
    clusters.push({ members: [item], start: place([item]) });
    // Merges with the cluster above while they'd overlap.
    while (clusters.length > 1) {
      const below = clusters[clusters.length - 1]!;
      const above = clusters[clusters.length - 2]!;
      if (below.start - (above.start + (above.members.length - 1) * gap) >= gap) break;
      clusters.pop();
      above.members.push(...below.members);
      above.start = place(above.members);
    }
  }
  const out = new Array<number>(values.length);
  for (const cluster of clusters) cluster.members.forEach((member, i) => (out[member.index] = cluster.start + i * gap));
  return out;
}

/** A value's gridline across the plot (and a little past the last x) and its label on the left. */
export function placeYTick(frame: LineFrame, value: number, text: string): Tick {
  const { box } = frame;
  const y = positions(frame).y(value);
  return { value, line: { x1: box.left, y1: y, x2: box.right + GRID_PAST, y2: y }, label: { x: box.left - 8, y: y + TICK_SIZE * CENTRE, anchor: "end", text } };
}

/** An x's label under the plot. */
export function placeXTick(frame: LineFrame, value: number, text: string): XTick {
  return { value, label: { x: positions(frame).x(value), y: frame.box.bottom + 18, anchor: "middle", text } };
}

/** Where x labels go: both ends of the rows' range, and round steps (1, 2 or 5 × a power of 10) between them, about four apart. */
export function xTickValues(lo: number, hi: number): number[] {
  if (!(hi > lo)) return [lo];
  const step = niceStep((hi - lo) / 4);
  const ticks = [lo];
  for (let i = Math.floor(lo / step) + 1; clean(i * step) < hi; i++) {
    const value = clean(i * step);
    if (value > lo) ticks.push(value);
  }
  ticks.push(hi);
  return ticks;
}

/** An x as text: as given, with no grouping (a year stays "2024"). */
export function xText(x: number): string {
  return String(x);
}

/** The ticks whose labels don't collide: both ends, and the steps between that clear their neighbours by 8 px. With no room for both ends, the first. */
function spaced(ticks: readonly XTick[], widths: readonly number[]): XTick[] {
  if (ticks.length <= 1) return [...ticks];
  const edges = ticks.map((tick, i) => ({ tick, from: tick.label.x - widths[i]! / 2, to: tick.label.x + widths[i]! / 2 }));
  const last = edges[edges.length - 1]!;
  const kept = [edges[0]!];
  for (const edge of edges.slice(1, -1)) {
    if (edge.from - kept[kept.length - 1]!.to >= TICK_GAP && last.from - edge.to >= TICK_GAP) kept.push(edge);
  }
  if (last.from - kept[kept.length - 1]!.to >= TICK_GAP) kept.push(last);
  return kept.map((edge) => edge.tick);
}

function prepareRows<D>({ data, encoding }: LineLayoutInput<D>): LineRow<D>[] {
  const keys = new Set<string>();
  const rows = data.map((datum, index): LineRow<D> => {
    const x = encoding.x(datum, index);
    if (typeof x !== "number" || !Number.isFinite(x)) throw new RangeError(`lineChart: x must be a finite number, got ${show(x)} in row ${index}.`);
    const key = String(encoding.key ? encoding.key(datum, index) : x);
    if (keys.has(key)) throw new Error(`lineChart: two rows have the key "${key}". Keys must be unique.`);
    keys.add(key);
    const values = encoding.series.map(({ series, value }) => ({ series, value: numberOf(value(datum, index), series, key) }));
    return { key, datum, index, x, label: xText(x), values };
  });
  // Array.prototype.sort is stable, so the error below names the rows in data order.
  rows.sort((a, b) => a.x - b.x);
  for (let i = 1; i < rows.length; i++) {
    const [a, b] = [rows[i - 1]!, rows[i]!];
    if (a.x === b.x) {
      throw new Error(`lineChart: the rows "${a.key}" and "${b.key}" have the same x, ${xText(a.x)}. Each x is one point on every line, so x values must be unique.`);
    }
  }
  return rows;
}

/** A line can't skip a value yet (gaps are backlog), nor count a missing one as 0 as a bar does. */
function numberOf(value: unknown, series: string, key: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new RangeError(`lineChart: "${series}" for "${key}" must be a finite number, got ${show(value)}. Lines can't skip a value yet.`);
}

function widest(texts: readonly string[], className: string, size: number, measure: LineLayoutInput<unknown>["measure"]): number {
  return texts.reduce((max, text) => Math.max(max, measure(text, className, size)), 0);
}

function accessor<D, T>(option: Accessor<D, T> | string): (d: D, i: number) => T {
  if (typeof option === "function") return option;
  return (d) => (d as Record<string, unknown>)[option] as T;
}

const show = (value: unknown): string => (typeof value === "string" ? JSON.stringify(value) : String(value));
