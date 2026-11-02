// The line chart's layout: pure, so it's tested without a DOM. Options in, the frame, ticks and size
// out; placeLines and placePoints then draw the marks (lines described with describe.line, points
// with describe.point) for any state of the rows and any reveal. Pixel sizes follow the prototype's
// card 2 (demo/lab.html).
//
// A layout is drawn from a few numbers: the frame (the value scale, and the box: the x range and where
// the plot sits) and each row's x and values. Transitions interpolate those numbers, and the place
// functions draw any state in between, and any reveal, the same way the layout draws its own. On a
// time axis an x is its Date's time in ms, and only its ticks, its wording and the samples' `at` know.
// A missing value (null or undefined) is a gap in its line: the line runs on from the value after it.
// With `curve: "monotone"`, each line bends between its rows (curve.ts), as more vertices.

import type { MarkData, MarkGeometry, Rect, Sample } from "../core";
import { describeLine } from "../core/geometry/describe/line";
import { describePoint } from "../core/geometry/describe/point";
import { clean, niceDomain, niceStep, type Tick } from "./bar-layout";
import { CURVES, lineCurve, type Curve } from "./curve";
import { textBox, type TextPlacement } from "./render/text";
import { decimals } from "./shell/format";
import { isTimeZone, timeName, timeTicks, type TimeZone } from "./time";
import type { Accessor, LineChartOptions } from "./types";

export type { Tick } from "./bar-layout";

export interface LineSeries<D> {
  /** The series' name: its field. */
  readonly series: string;
  readonly value: (d: D, i: number) => unknown;
}

/** Which accessor gives the x, which the key, which the values; and how an x is said. */
export interface LineEncoding<D> {
  readonly x: (d: D, i: number) => unknown;
  /** Undefined: the key is the x. */
  readonly key: ((d: D, i: number) => unknown) | undefined;
  readonly series: readonly LineSeries<D>[];
  /** A time axis's zone. */
  readonly timeZone: TimeZone;
  /** Words an x for people instead of the default. */
  readonly xFormat: ((x: Date | number) => string) | undefined;
  /** How the lines run between their values. */
  readonly curve: Curve;
}

export interface LineValue {
  readonly series: string;
  /** Undefined where the series has no value (null or undefined in the data): a gap in its line. */
  readonly value: number | undefined;
}

export interface LineRow<D> {
  readonly key: string;
  readonly datum: D;
  /** The row's index in `data`. */
  readonly index: number;
  /** A number, or on a time axis its Date's time in ms. */
  readonly x: number;
  /** The x as text: the tooltip's title, the table's row header and the start of the x's name. */
  readonly label: string;
  /** In series order. */
  readonly values: readonly LineValue[];
  /** The series with no value here. */
  readonly missing: ReadonlySet<string>;
  /**
   * Each series' level here, which a change animates: its value, or for a missing one where its line
   * runs past this x (across the gap, or level with its nearest value; 0 with none), so a value that
   * comes grows out of the line.
   */
  readonly levels: Readonly<Record<string, number>>;
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
  /** Whether x is a time axis: the data gives Dates. */
  readonly time: boolean;
  readonly series: readonly string[];
  /** Gridlines and labels for the values, from the bottom. */
  readonly yTicks: readonly Tick[];
  readonly xTicks: readonly XTick[];
  /** Per series, the decimals its values are given to: an end label counts rounded to these. */
  readonly decimals: Readonly<Record<string, number>>;
  /** How the lines run between their values. */
  readonly curve: Curve;
}

export interface LineLayoutInput<D> {
  readonly data: readonly D[];
  readonly encoding: LineEncoding<D>;
  readonly width: number;
  readonly height: number | undefined;
  readonly format: (value: number) => string;
  /** Text width in px, for margins. */
  readonly measure: Measure;
  /** A line's end label for a value, measured for the right margin; undefined with `labels: false`. */
  readonly label: ((series: string, value: number) => string) | undefined;
  /** Px kept clear to the right of the end labels, or the lines' ends without them, and above the plot: a number is to the right. Default 0. */
  readonly room?: LineChartOptions<D>["room"];
}

type Measure = (text: string, className: string, size: number) => number;

/** How placeLines words the lines' end labels, and measures them for their boxes. */
export interface EndLabels {
  /** A line's end label for its value at its end; "" for none. */
  readonly text: (series: string, value: number) => string;
  readonly measure: Measure;
}

/** A row as it's drawn now, part way through a change: where it is, and its values by series. */
export interface RowState<D> {
  readonly key: string;
  readonly datum: D;
  readonly x: number;
  readonly values: Readonly<Record<string, number>>;
  /** The series with no value here: no point, and a gap in the line. Their `values` aren't drawn. */
  readonly missing?: ReadonlySet<string>;
  /**
   * Less than 1 while the row grows out of a neighbour or folds into one, where it is at 0: a curve
   * bends through it only that much, so it doesn't jump as the row comes or goes. Default 1.
   */
  readonly presence?: number;
}

export interface PlacedLine<D> {
  readonly series: string;
  readonly geometry: MarkGeometry;
  readonly data: MarkData<D>;
  /** The line's revealed end, in px, where its end dot and label go, and its value there. */
  readonly end: { readonly x: number; readonly y: number; readonly value: number };
  /** Its end label, placed with the others' (its text "" for none); undefined without `labels`. */
  readonly label: TextPlacement | undefined;
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
  if (typeof x !== "string" && typeof x !== "function") throw new TypeError("lineChart needs x: a field of numbers or Dates, or a function that returns each row's x.");
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
  const timeZone: unknown = options.timeZone ?? "UTC";
  if (!isTimeZone(timeZone)) throw new TypeError(`lineChart: timeZone must be "UTC", "local" or the name of a zone Intl knows, such as "Europe/London", got ${show(timeZone)}.`);
  const xFormat: unknown = options.xFormat;
  if (xFormat !== undefined && typeof xFormat !== "function") throw new TypeError("lineChart: xFormat must be a function that turns an x into text.");
  const curve: unknown = options.curve ?? "linear";
  if (!CURVES.includes(curve as Curve)) throw new TypeError(`lineChart: curve must be "linear" or "monotone", got ${show(curve)}.`);
  return {
    x: accessor(x),
    key: key === undefined ? undefined : accessor(key),
    series: series.map((field) => ({ series: field, value: accessor<D, unknown>(field) })),
    timeZone,
    xFormat: options.xFormat,
    curve: curve as Curve
  };
}

/** Throws a RangeError on a `room` that isn't a number of px, 0 or more, or an object whose `right` and `top` are each one or unset. */
export function checkRoom(room: unknown): void {
  const px = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (typeof room !== "object" || room === null || Array.isArray(room)) {
    if (room !== undefined && !px(room)) throw new RangeError(`lineChart: room must be a number of px, 0 or more, got ${typeof room === "object" ? JSON.stringify(room) : String(room)}.`);
    return;
  }
  for (const side of ["right", "top"] as const) {
    const value: unknown = (room as Record<string, unknown>)[side];
    if (value !== undefined && !px(value)) throw new RangeError(`lineChart: room.${side} must be a number of px, 0 or more, got ${String(value)}.`);
  }
}

export function layoutLines<D>(input: LineLayoutInput<D>): LineLayout<D> {
  const { width, measure } = input;
  const height = input.height ?? HEIGHT;
  const { rows, time } = prepareRows(input);
  const series = input.encoding.series.map((s) => s.series);
  const domain = niceDomain(rows.flatMap((row) => row.values.flatMap((v) => (v.value === undefined ? [] : [v.value]))));
  const yTexts = domain.ticks.map(input.format);
  const xLo = rows[0]?.x ?? 0;
  const xHi = rows[rows.length - 1]?.x ?? 0;
  const ticked = rows.length === 0 ? [] : time ? timeTicks(xLo, xHi, input.encoding.timeZone) : xTickValues(xLo, xHi).map((value) => ({ value, text: xText(value) }));
  const xValues = ticked.map((tick) => tick.value);
  const xTexts = ticked.map((tick) => tick.text);
  const xWidths = xTexts.map((text) => measure(text, "ec-tick", TICK_SIZE));

  // The values' labels on the left; the end labels, or the last x label, on the right, with `room` past the end labels, and above the plot.
  const room = typeof input.room === "number" ? { right: input.room } : input.room;
  const labelWidth = input.label ? widest(distinctLabels(rows, input.label), "ec-value", VALUE_SIZE, measure) : 0;
  const left = Math.max(widest(yTexts, "ec-tick", TICK_SIZE, measure) + 10, (xWidths[0] ?? 0) / 2 + 2);
  const right = Math.max(GRID_PAST + 2, (xWidths[xWidths.length - 1] ?? 0) / 2 + 2, (labelWidth > 0 ? LABEL_GAP + labelWidth + 4 : 0) + (room?.right ?? 0));
  const top = TOP + (room?.top ?? 0);
  const frame: LineFrame = {
    scale: { lo: domain.lo, hi: domain.hi },
    box: { xLo, xHi, left, right: Math.max(left, width - right), top, bottom: Math.max(top, height - AXIS), width, height }
  };

  const decimalsBy: Record<string, number> = {};
  for (const name of series) decimalsBy[name] = 0;
  for (const row of rows) for (const v of row.values) if (v.value !== undefined) decimalsBy[v.series] = Math.max(decimalsBy[v.series]!, decimals(v.value));

  const xTicks = xValues.map((value, i) => placeXTick(frame, value, xTexts[i]!));
  return {
    width,
    height,
    frame,
    rows,
    time,
    series,
    yTicks: domain.ticks.map((value, i) => placeYTick(frame, value, yTexts[i]!)),
    xTicks: spaced(xTicks, xWidths),
    decimals: decimalsBy,
    curve: input.encoding.curve
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
 * sample per vertex (`t` by distance along the walk, `at` its x: a Date on a `time` axis), and the
 * other lines as `related`. With `labels`, the end labels are placed together (placeEndLabels), and
 * each line's geometry has its own label's box as `labelBounds`, none when its text is "", and the
 * other lines' as `nearbyLabels`.
 *
 * A row missing a series is no vertex of its line: the line breaks there (`breaks`, so its geometry
 * has a gap from the value before to the value after, and the sample after it has `gapBefore`), and
 * a line revealed into a gap ends at its last value. Missing values before a line's first value or
 * after its last are no gap. A line with no value up to the reveal is empty: no length, no samples
 * and no label, at its level at the first x, and its datum the row at the reveal.
 *
 * With `bend` more than 0, each line curves between its rows, `bend` of the way from straight to
 * monotone (curve.ts): the curve goes through every row, revealed or not, so a reveal doesn't change
 * it, and each bend between two rows is a vertex too, with its sample, so the samples are exact on
 * the line as drawn. A line revealed part way between two rows ends on the curve.
 */
export function placeLines<D>(frame: LineFrame, rows: readonly RowState<D>[], series: readonly string[], through: number, time = false, labels?: EndLabels, bend = 0): PlacedLine<D>[] {
  const first = rows[0];
  if (!first) return [];
  const at = positions(frame);
  let last = 0;
  while (last + 1 < rows.length && rows[last + 1]!.x <= through) last++;
  const end = rows[last]!;
  const next = rows[last + 1];
  const share = next && next.x > end.x && through > end.x ? (through - end.x) / (next.x - end.x) : undefined;
  const shown = rows.slice(0, last + 1);
  const xs = bend > 0 ? rows.map((row) => row.x) : [];
  const presence = bend > 0 && rows.some((row) => row.presence !== undefined && row.presence < 1) ? rows.map((row) => row.presence ?? 1) : undefined;

  const datas = new Map<string, MarkData<D>>();
  const related = (own: string) => (name: string) => (name === own ? undefined : datas.get(name));
  const traced = series.map((name) => {
    const has = (row: RowState<D>): boolean => !row.missing?.has(name);
    const curve = bend > 0 ? lineCurve(xs, rows.map((row) => (has(row) ? (row.values[name] ?? 0) : undefined)), bend, at, presence) : undefined;
    const vertices: { at: number; value: number; datum: D; gapBefore: boolean }[] = [];
    let gap = false;
    /** The last row with a value, by index. */
    let before = -1;
    shown.forEach((row, i) => {
      // A gap is only between values: none before the first.
      if (!has(row)) gap = vertices.length > 0;
      else {
        if (curve && before >= 0) for (const b of curve.between(before, i)) vertices.push({ at: b.x, value: b.value, datum: rows[before]!.datum, gapBefore: false });
        vertices.push({ at: row.x, value: row.values[name] ?? 0, datum: row.datum, gapBefore: gap });
        gap = false;
        before = i;
      }
    });
    if (share !== undefined && has(end) && has(next!)) {
      if (curve) for (const b of curve.between(last, last + 1, through)) vertices.push({ at: b.x, value: b.value, datum: end.datum, gapBefore: false });
      const from = end.values[name] ?? 0;
      const value = curve ? curve.valueAt(last, last + 1, through) : from + share * ((next!.values[name] ?? 0) - from);
      vertices.push({ at: through, value, datum: end.datum, gapBefore: false });
    }
    const points = vertices.length > 0 ? vertices.map((v) => ({ x: at.x(v.at), y: at.y(v.value) })) : [{ x: at.x(first.x), y: at.y(first.values[name] ?? 0) }];
    return { name, vertices, points };
  });
  // An empty line has no label, and takes no room from the others'.
  const named = traced.filter(({ vertices }) => vertices.length > 0);
  const placed = labels
    ? placeEndLabels(
        frame,
        named.map(({ name, vertices, points }) => ({ ...points[points.length - 1]!, text: labels.text(name, vertices[vertices.length - 1]!.value) }))
      )
    : [];
  const boxes = labels ? placed.map((label) => (label.text !== "" ? textBox(label, labels.measure, "ec-value", VALUE_SIZE) : undefined)) : [];
  const lines = traced.map(({ name, vertices, points }): PlacedLine<D> => {
    const tip = points[points.length - 1]!;
    const index = named.findIndex((line) => line.name === name);
    const label = labels ? (placed[index] ?? { x: tip.x + LABEL_GAP, y: tip.y + VALUE_SIZE * CENTRE, anchor: "start", text: "" }) : undefined;
    // Its own label's box, and every other line's.
    const own = boxes[index];
    const labelBounds = labels ? (own ? [own] : []) : undefined;
    const nearbyLabels = labels ? boxes.filter((box, i): box is Rect => box !== undefined && i !== index) : undefined;
    const breaks = vertices.flatMap((v, j) => (v.gapBefore ? [j] : []));
    const geometry = describeLine({ key: name, series: name, points, width: LINE_WIDTH, ...(breaks.length > 0 ? { breaks } : {}), ...(labelBounds ? { labelBounds } : {}), ...(nearbyLabels ? { nearbyLabels } : {}) });
    // By distance, as the walk measures it, gaps and all; the last is exactly 1.
    let distance = 0;
    const samples: Sample[] = vertices.map((v, j) => {
      if (j > 0) distance += Math.hypot(points[j]!.x - points[j - 1]!.x, points[j]!.y - points[j - 1]!.y);
      const t = geometry.length > 0 ? (j === vertices.length - 1 ? 1 : Math.min(1, distance / geometry.length)) : 0;
      return { t, value: v.value, at: sampleAt(v.at, time), ...(v.gapBefore ? { gapBefore: true } : {}) };
    });
    const last = vertices[vertices.length - 1];
    const data: MarkData<D> = { datum: last ? last.datum : end.datum, samples, related: related(name) };
    datas.set(name, data);
    return { series: name, geometry, data, end: { ...tip, value: last ? last.value : (first.values[name] ?? 0) }, label };
  });
  return lines;
}

/**
 * The points that show at rest: each value next to a gap with no other value beside it, so it has
 * no stroke. Keyed as points are, from `rows` as they're drawn, in ascending x.
 */
export function loneValues<D>(rows: readonly RowState<D>[], series: readonly string[]): Set<string> {
  const lone = new Set<string>();
  // Every frame of a change asks: a chart with no gaps answers at once.
  if (!rows.some((row) => row.missing !== undefined && row.missing.size > 0)) return lone;
  const has = (row: RowState<D> | undefined, name: string): boolean => row !== undefined && !row.missing?.has(name);
  rows.forEach((row, i) => {
    for (const name of series) {
      const before = rows[i - 1];
      const after = rows[i + 1];
      if (has(row, name) && !has(before, name) && !has(after, name) && (before !== undefined || after !== undefined)) lone.add(pointKey(name, row.key));
    }
  });
  return lone;
}

/** The point mark's key: "<series>@<row key>". */
export function pointKey(series: string, row: string): string {
  return `${series}@${row}`;
}

/** Each series' point at the row, but those missing there: a dot, with the row's value as its one sample (`at` its x: a Date on a `time` axis) and the other series' points as `related`. */
export function placePoints<D>(frame: LineFrame, row: RowState<D>, series: readonly string[], time = false): PlacedPoint<D>[] {
  const at = positions(frame);
  const x = at.x(row.x);
  const datas = new Map<string, MarkData<D>>();
  return series.filter((name) => !row.missing?.has(name)).map((name) => {
    const value = row.values[name] ?? 0;
    const key = pointKey(name, row.key);
    const data: MarkData<D> = { datum: row.datum, samples: [{ t: 0, value, at: sampleAt(row.x, time) }], related: (other) => (other === name ? undefined : datas.get(other)) };
    datas.set(name, data);
    return { key, series: name, geometry: describePoint({ key, series: name, x, y: at.y(value), r: DOT_RADIUS }), data };
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

/** The rows in ascending x, and whether x is a time axis: the first row's x is a Date. */
function prepareRows<D>({ data, encoding }: LineLayoutInput<D>): { rows: LineRow<D>[]; time: boolean } {
  const keys = new Set<string>();
  let time = false;
  const read = data.map((datum, index) => {
    const raw = encoding.x(datum, index);
    if (index === 0) time = raw instanceof Date;
    const x = xOf(raw, index, time);
    // A date is keyed by its ISO string, which says the same instant the same way on every machine.
    const key = String(encoding.key ? encoding.key(datum, index) : time ? new Date(x).toISOString() : x);
    if (keys.has(key)) throw new Error(`lineChart: two rows have the key "${key}". Keys must be unique.`);
    keys.add(key);
    const values = encoding.series.map(({ series, value }) => ({ series, value: numberOf(value(datum, index), series, key) }));
    return { key, datum, index, x, values };
  });
  // Array.prototype.sort is stable, so the error below names the rows in data order.
  read.sort((a, b) => a.x - b.x);
  for (let i = 1; i < read.length; i++) {
    const [a, b] = [read[i - 1]!, read[i]!];
    if (a.x === b.x) {
      const x = time ? new Date(a.x).toISOString() : xText(a.x);
      throw new Error(`lineChart: the rows "${a.key}" and "${b.key}" have the same x, ${x}. Each x is one point on every line, so x values must be unique.`);
    }
  }
  const word = xWording(encoding, time, read.map((row) => row.x));
  const levels = levelsOf(read, encoding.series.length);
  return {
    rows: read.map((row, i) => ({ ...row, label: word(row.x), missing: new Set(row.values.flatMap((v) => (v.value === undefined ? [v.series] : []))), levels: levels[i]! })),
    time
  };
}

/**
 * Each row's level for each series, by series name: its value, or for a missing one where its line
 * runs past the row's x: across the gap, in proportion to x, or level with its nearest value before
 * its first or after its last. A series with no values is at 0.
 */
function levelsOf(rows: readonly { readonly x: number; readonly values: readonly LineValue[] }[], count: number): Record<string, number>[] {
  const levels = rows.map((): Record<string, number> => ({}));
  for (let s = 0; s < count; s++) {
    let before = -1;
    let after = -1;
    rows.forEach((row, i) => {
      const { series, value } = row.values[s]!;
      if (value !== undefined) {
        levels[i]![series] = value;
        before = i;
        return;
      }
      // The next value, found once for each run of missing ones, so a long run stays linear.
      if (after <= i) {
        after = i + 1;
        while (after < rows.length && rows[after]!.values[s]!.value === undefined) after++;
      }
      const a = rows[before]?.values[s]!.value;
      const b = rows[after]?.values[s]!.value;
      levels[i]![series] =
        a !== undefined && b !== undefined ? a + ((row.x - rows[before]!.x) / (rows[after]!.x - rows[before]!.x)) * (b - a) : (a ?? b ?? 0);
    });
  }
  return levels;
}

/** A row's x as a number: a finite number, or on a time axis a valid Date's time. Every row's x is the same kind as the first's. */
function xOf(x: unknown, index: number, time: boolean): number {
  if (x instanceof Date) {
    if (!time) throw new TypeError(`lineChart: x must be all numbers or all Dates, but row 0's is a number and row ${index}'s a Date.`);
    const t = x.getTime();
    if (Number.isNaN(t)) throw new TypeError(`lineChart: x must be a valid Date, got an invalid Date in row ${index}.`);
    return t;
  }
  if (time) {
    if (typeof x === "number") throw new TypeError(`lineChart: x must be all numbers or all Dates, but row 0's is a Date and row ${index}'s a number.`);
    throw new TypeError(`lineChart: x must be a valid Date, got ${show(x)} in row ${index}.`);
  }
  if (typeof x !== "number" || !Number.isFinite(x)) throw new RangeError(`lineChart: x must be a finite number, got ${show(x)} in row ${index}.`);
  return x;
}

/** How an x is said for people: `xFormat`'s words, given the x as the data has it; or a time axis's medium date; or a number as given. */
function xWording<D>(encoding: LineEncoding<D>, time: boolean, xs: readonly number[]): (x: number) => string {
  const { xFormat } = encoding;
  if (xFormat) return (x) => xFormat(time ? new Date(x) : x);
  return time ? timeName(xs, encoding.timeZone) : xText;
}

/** A sample's `at` for an x: on a time axis, a Date of its own, so an effect that changes it changes nothing else. */
function sampleAt(x: number, time: boolean): number | Date {
  return time ? new Date(x) : x;
}

/**
 * A value, or undefined for a missing one: null or undefined, a gap in the line. A line doesn't count
 * a missing value as 0 as a bar does, and NaN and the infinities still throw: they're usually a mistake.
 */
function numberOf(value: unknown, series: string, key: string): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return undefined;
  throw new RangeError(`lineChart: "${series}" for "${key}" must be a finite number, or null or undefined where it has no value, got ${show(value)}.`);
}

/**
 * The end labels worth measuring: one of each shape, its digits aside. Chart text has tabular digits,
 * so "23 goals" and "48 goals" are as wide, and a long series isn't measured row by row in the DOM.
 */
function distinctLabels<D>(rows: readonly LineRow<D>[], label: (series: string, value: number) => string): string[] {
  const shapes = new Map<string, string>();
  for (const row of rows) {
    for (const { series, value } of row.values) {
      if (value === undefined) continue;
      const text = label(series, value);
      const shape = text.replace(/\d/g, "0");
      if (!shapes.has(shape)) shapes.set(shape, text);
    }
  }
  return [...shapes.values()];
}

function widest(texts: readonly string[], className: string, size: number, measure: Measure): number {
  return texts.reduce((max, text) => Math.max(max, measure(text, className, size)), 0);
}

function accessor<D, T>(option: Accessor<D, T> | string): (d: D, i: number) => T {
  if (typeof option === "function") return option;
  return (d) => (d as Record<string, unknown>)[option] as T;
}

const show = (value: unknown): string => (typeof value === "string" ? JSON.stringify(value) : String(value));
