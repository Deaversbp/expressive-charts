// The donut chart's layout: pure, so it's tested without a DOM. Options in, slices (described with
// describe.arc), outside labels, the centre text and the size out. Sizes follow the prototype's card 3
// (demo/lab.html): a ring whose inner radius is 0.6 × the outer, with labels outside it.
//
// A layout is drawn from a few numbers: the frame (the chart's size, the ring's centre and radii) and
// each slice's value and angles. Transitions interpolate those, and placeSlice, placeLabels and
// placeCenter draw any state in between the same way the layout draws its own.

import { describe, type MarkData, type MarkGeometry, type Rect } from "../core";
import type { TextPlacement } from "./render/text";
import { percent } from "./shell/format";
import type { DonutChartOptions } from "./types";

export interface DonutEncoding<D> {
  /** Names each slice. */
  readonly category: (d: D, i: number) => unknown;
  /** The category unless `key` is given. */
  readonly key: (d: D, i: number) => unknown;
  /** The slices' series: the value field's name, or "value" when a function reads it. */
  readonly series: string;
  readonly value: (d: D, i: number) => unknown;
}

/** Where the ring is: the chart's size, the ring's centre and its radii, all in px. */
export interface DonutFrame {
  readonly width: number;
  readonly height: number;
  readonly cx: number;
  readonly cy: number;
  readonly inner: number;
  readonly outer: number;
}

/** What placeSlice draws a slice from: a laid-out slice, or a state in between two. */
export interface SliceState<D> {
  readonly key: string;
  readonly datum: D;
  /** The row's index in `data`. */
  readonly index: number;
  readonly category: string;
  readonly series: string;
  /** In data units, 0 or more. */
  readonly value: number;
  /** The value's share of the total, from 0 to 1. */
  readonly share: number;
  /** Radians, 0 at 12 o'clock and clockwise: d3.pie()'s convention, as describe.arc takes them. */
  readonly start: number;
  readonly end: number;
}

export interface DonutSlice<D> extends SliceState<D> {
  readonly geometry: MarkGeometry;
  readonly data: MarkData<D>;
}

/** A slice's label outside the ring: its category over its share. */
export interface SliceLabel {
  readonly category: TextPlacement;
  readonly share: TextPlacement;
  /** Both lines' box, for overlaps. */
  readonly box: Rect;
}

/** A line of the centre's text. The first is drawn large, at `size` px. */
export interface CenterLine extends TextPlacement {
  readonly size: number;
}

export interface DonutLayout<D> {
  readonly frame: DonutFrame;
  /** The values added up. */
  readonly total: number;
  /** Clockwise from 12 o'clock: the visual order. */
  readonly slices: readonly DonutSlice<D>[];
  /** Each slice's label, in the same order; undefined where none is shown. */
  readonly labels: readonly (SliceLabel | undefined)[];
  /** The centre's text, with "\n" between lines; "" for none. */
  readonly centerText: string;
  readonly center: readonly CenterLine[];
}

export interface DonutLayoutInput<D> {
  readonly data: readonly D[];
  readonly encoding: DonutEncoding<D>;
  readonly sort: DonutChartOptions<D>["sort"];
  readonly width: number;
  readonly height: number | undefined;
  /** The centre's text for a total ("\n" between lines), or "" for none. */
  readonly center: (total: number) => string;
  /** Text width in px, for the labels' room. */
  readonly measure: Measure;
}

type Measure = (text: string, className: string, size: number) => number;

const TAU = 2 * Math.PI;
const HEIGHT = 300;
/** The inner radius, as a share of the outer: the prototype's 70 / 116. */
const HOLE = 0.6;
/** Between the chart's edge and anything drawn. */
const PAD = 4;
/** Between the ring and its labels. */
const GAP = 10;
/** Slices narrower than this get no label: 15°. */
const LABEL_ANGLE = Math.PI / 12;
const LABEL_SIZE = 12.5;
const VALUE_SIZE = 12.5;
/** A label's lines: the category's baseline sits this far below the block's top, the share's a line lower. */
const ASCENT = 10;
const LINE = 15;
/** A label block's height: two lines and the share's descent. */
const BLOCK = ASCENT + LINE + 3;
/** Labels keep at least this far apart. */
const LABEL_SPACE = 2;
/** The centre's first line, in px, unless it's shrunk to fit the hole. */
export const CENTER_SIZE = 26;
const CENTER_MIN = 14;
/** Baselines below the centre's first line: 20 px to the second (as in the prototype), 16 px after that. */
const CENTER_STEP = 20;
const CENTER_LINE = 16;
/** Moves a text baseline down by this share of the font size to centre the text on a line. */
const CENTRE = 0.36;

/** Reads the options: which accessor names the slices, which sizes them. Throws on what it can't draw. */
export function donutEncoding<D>(options: DonutChartOptions<D>): DonutEncoding<D> {
  const { category, value, key } = options;
  if (typeof category !== "string" && typeof category !== "function") {
    throw new TypeError("donutChart needs a category: the field, or a function, that names each slice.");
  }
  if (typeof value !== "string" && typeof value !== "function") {
    throw new TypeError("donutChart needs a value: the numeric field, or a function, that sizes each slice.");
  }
  if (key !== undefined && typeof key !== "string" && typeof key !== "function") throw new TypeError("donutChart: key must be a field name or a function.");
  const name = accessor<D, unknown>(category);
  return {
    category: name,
    key: key === undefined ? name : accessor(key),
    series: typeof value === "string" ? value : "value",
    value: accessor(value)
  };
}

export function layoutDonut<D>(input: DonutLayoutInput<D>): DonutLayout<D> {
  const rows = sortSlices(prepareSlices(input), input.sort);
  const frame = donutFrame(input, rows);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const starts = joinedStarts(rows.map((row) => row.value));
  const slices = rows.map((row, i) => {
    const share = total > 0 ? row.value / total : 0;
    // The last slice ends exactly at 12 o'clock again.
    const end = i + 1 < rows.length && total > 0 ? starts[i + 1]! : total > 0 ? 1 : 0;
    return placeSlice(frame, { ...row, series: input.encoding.series, share, start: starts[i]! * TAU, end: end * TAU });
  });
  const centerText = input.center(total);
  return {
    frame,
    total,
    slices,
    labels: placeLabels(frame, slices, input.measure),
    centerText,
    center: placeCenter(frame, centerText, input.measure)
  };
}

/**
 * Where each slice starts, in turns from 12 o'clock, laid end to end in order: values in data units,
 * so every start is a true share of the total. All 0 when the total is.
 */
export function joinedStarts(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0);
  let before = 0;
  return values.map((value) => {
    const start = total > 0 ? before / total : 0;
    before += value;
    return start;
  });
}

/** Draws a slice in a frame: its arc, described with describe.arc, and its data. */
export function placeSlice<D>(frame: DonutFrame, state: SliceState<D>): DonutSlice<D> {
  const geometry = describe.arc({
    key: state.key,
    series: state.series,
    cx: frame.cx,
    cy: frame.cy,
    inner: frame.inner,
    outer: frame.outer,
    start: state.start,
    end: state.end
  });
  return { ...state, geometry, data: sliceData(state.datum, state.share, state.series) };
}

/**
 * The labels outside the ring, in the slices' order: each slice's category over its share, on slices
 * of 15° or more. A label sits just outside the ring at the slice's middle angle, and leans away from
 * it the way the slice points: beside the ring at 3 and 9 o'clock, above it at 12, below it at 6, and
 * smoothly in between, so a label never jumps as its slice turns. A label that would overlap the one
 * before it (or, going round, the first) or leave the chart is dropped; the legend, the tooltip, the
 * data table and the slice's name still say it.
 */
export function placeLabels<D>(frame: DonutFrame, slices: readonly SliceState<D>[], measure: Measure): (SliceLabel | undefined)[] {
  let previous: Rect | undefined;
  let first: number | undefined;
  const labels = slices.map((slice, i): SliceLabel | undefined => {
    if (slice.end - slice.start < LABEL_ANGLE - 1e-9) return undefined;
    const label = labelAt(frame, slice, measure);
    const { box } = label;
    if (box.x < 0 || box.y < 0 || box.x + box.width > frame.width || box.y + box.height > frame.height) return undefined;
    if (previous && overlaps(previous, box)) return undefined;
    previous = box;
    first ??= i;
    return label;
  });
  // Going round, the first label comes after the last: the later one gives way.
  for (let i = labels.length - 1; first !== undefined && i > first; i--) {
    const label = labels[i];
    if (!label) continue;
    if (!overlaps(labels[first]!.box, label.box)) break;
    labels[i] = undefined;
  }
  return labels;
}

/**
 * The centre's text, one line per "\n", in the hole: the first line large (shrunk to fit the hole when
 * it's wide), the others below it. The lines are centred on the ring's centre together.
 */
export function placeCenter(frame: DonutFrame, text: string, measure: Measure): CenterLine[] {
  if (text === "") return [];
  const lines = text.split("\n");
  const room = 2 * frame.inner * 0.85;
  const width = measure(lines[0]!, "ec-center-value", CENTER_SIZE);
  const size = width > room && width > 0 ? Math.max(CENTER_MIN, (CENTER_SIZE * room) / width) : CENTER_SIZE;
  const offsets = lines.map((_, i) => (i === 0 ? 0 : CENTER_STEP + (i - 1) * CENTER_LINE));
  const last = offsets[offsets.length - 1]!;
  // The first line's cap height (about 0.72 em) down to the last line's baseline, centred.
  const top = frame.cy + (2 * CENTRE * size - last) / 2;
  return lines.map((line, i) => ({ x: frame.cx, y: top + offsets[i]!, anchor: "middle", text: line, size: i === 0 ? size : LABEL_SIZE }));
}

interface Prepared<D> {
  readonly key: string;
  readonly category: string;
  readonly datum: D;
  readonly index: number;
  readonly value: number;
}

function prepareSlices<D>({ data, encoding }: DonutLayoutInput<D>): Prepared<D>[] {
  const keys = new Set<string>();
  return data.map((datum, index) => {
    const key = String(encoding.key(datum, index));
    if (keys.has(key)) throw new Error(`donutChart: two rows have the key "${key}". Keys must be unique; pass a key accessor if categories repeat.`);
    keys.add(key);
    const value = numberOf(encoding.value(datum, index), encoding.series, key);
    return { key, category: String(encoding.category(datum, index) ?? ""), datum, index, value };
  });
}

function sortSlices<D>(rows: Prepared<D>[], sort: DonutLayoutInput<D>["sort"]): Prepared<D>[] {
  if (sort === undefined || sort === "none") return rows;
  // Array.prototype.sort is stable, so ties keep data order.
  if (sort === "value") return [...rows].sort((a, b) => b.value - a.value);
  throw new TypeError(`donutChart: sort must be "value" or "none", got ${String(sort)}.`);
}

/**
 * The ring is as large as the room left for labels allows, wherever they land: the widest label beside
 * it, and a label's height above and below it. So the ring keeps its size as values change. When that
 * leaves less than half the radius the chart could have, the ring takes half, and labels that don't
 * fit are dropped.
 */
function donutFrame<D>(input: DonutLayoutInput<D>, rows: readonly Prepared<D>[]): DonutFrame {
  const { width, measure } = input;
  const height = input.height ?? HEIGHT;
  const cx = width / 2;
  const cy = height / 2;
  const share = measure("100%", "ec-value", VALUE_SIZE);
  const widest = rows.reduce((max, row) => Math.max(max, measure(row.category, "ec-label", LABEL_SIZE)), share);
  const room = Math.min(cx - PAD - GAP - widest, cy - PAD - GAP - BLOCK);
  const most = Math.max(0, Math.min(cx, cy) - PAD);
  const outer = Math.max(0, room, most / 2);
  return { width, height, cx, cy, inner: outer * HOLE, outer };
}

/** A slice's label, placed at its middle angle. */
function labelAt<D>(frame: DonutFrame, slice: SliceState<D>, measure: Measure): SliceLabel {
  const middle = (slice.start + slice.end) / 2;
  const sin = Math.sin(middle);
  const cos = Math.cos(middle);
  const r = frame.outer + GAP;
  const x = frame.cx + r * sin;
  const y = frame.cy - r * cos;
  const share = percent(slice.share);
  const widths = [measure(slice.category, "ec-label", LABEL_SIZE), measure(share, "ec-value", VALUE_SIZE)] as const;
  const width = Math.max(...widths);
  // Above the point at 12 o'clock, below it at 6, centred on it at 3 and 9.
  const top = y - (BLOCK * (cos + 1)) / 2;
  // Each line starts at the point at 3 o'clock, ends there at 9, and is centred on it at 12 and 6.
  const along = (w: number): number => x + (sin * w) / 2;
  return {
    category: { x: along(widths[0]), y: top + ASCENT, anchor: "middle", text: slice.category },
    share: { x: along(widths[1]), y: top + ASCENT + LINE, anchor: "middle", text: share },
    box: { x: along(width) - width / 2, y: top, width, height: BLOCK }
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width + LABEL_SPACE && b.x < a.x + a.width + LABEL_SPACE && a.y < b.y + b.height + LABEL_SPACE && b.y < a.y + a.height + LABEL_SPACE;
}

/** Values along the walk, from 0 at the start to the slice's share at the end. Its own series is the only one related. */
function sliceData<D>(datum: D, share: number, series: string): MarkData<D> {
  const data: MarkData<D> = {
    datum,
    samples: [
      { t: 0, value: 0 },
      { t: 1, value: share }
    ],
    related: (name) => (name === series ? data : undefined)
  };
  return data;
}

function accessor<D, T>(option: string | ((d: D, i: number) => T)): (d: D, i: number) => T {
  if (typeof option === "function") return option;
  return (d) => (d as Record<string, unknown>)[option] as T;
}

/** Missing values (null, undefined) count as 0; negative and non-finite ones throw. */
function numberOf(value: unknown, series: string, key: string): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  throw new RangeError(
    `donutChart: "${series}" for "${key}" must be a finite number of 0 or more, got ${typeof value === "string" ? JSON.stringify(value) : String(value)}.`
  );
}
