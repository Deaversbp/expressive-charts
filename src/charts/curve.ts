// A line's curve. "monotone" is d3's curveMonotoneX (Steffen, 1990): a cubic between each two values,
// with tangents that keep it between them, so it passes through every value, is flat between two
// equal ones, and never shows a value the data doesn't have. It's worked out in the data's own units,
// x and value, which a scale with x increasing maps to the same curve as d3 draws in px, and each
// piece is flattened into straight pieces within FLAT px through the chart's scales, so a curved line
// is a polyline with more vertices. Between straight and curved, each piece's tangents ease from its
// own slope to the curve's, which keeps it between its two values all the way.

import { cubicPieces, FLAT } from "../core/geometry/flatten";

/** How a line runs between its values: straight, or d3's curveMonotoneX. */
export type Curve = "linear" | "monotone";

export const CURVES: readonly Curve[] = ["linear", "monotone"];

/** How far a curve is from straight: 0 for "linear", 1 for "monotone". */
export function bendOf(curve: Curve): number {
  return curve === "monotone" ? 1 : 0;
}

/** Data to px: the chart's scales. */
export interface Scales {
  x(value: number): number;
  y(value: number): number;
}

/** A vertex inside a piece of the curve, in data units: its x and the curve's value there. */
export interface Bend {
  readonly x: number;
  readonly value: number;
}

/** A line's curve through its rows, piece by piece. */
export interface LineCurve {
  /**
   * The vertices strictly inside the piece from row `from` to row `to`, the next row with a value, at
   * equal steps of x, enough that the straight pieces between them stay within FLAT px of the curve;
   * only those before `through`. None across a gap, between two rows that are one knot, or with no
   * bend at all.
   */
  between(from: number, to: number, through?: number): Bend[];
  /** The curve's value at x, on the piece from row `from` to row `to`. */
  valueAt(from: number, to: number, x: number): number;
}

/**
 * The curve through `values` at `xs` (ascending), bent `amount` of the way from straight (0) to
 * monotone (1), drawn through `scales`. A value that's undefined is missing, a gap: each run of
 * values between gaps is curved alone, as d3's `.defined()` draws it, so a run of two is straight. Two
 * rows at the same x with the same value are one knot, as d3 skips a repeated point; at the same x
 * with different values (only part way through a change) the line goes straight from one to the
 * other, and a curve starts again from there.
 *
 * `presence`, by row, is less than 1 for a row growing out of a neighbour or folding into one, which
 * it meets at 0: the curve bends through it only that much (fade()), so it neither comes nor goes at
 * once.
 */
export function lineCurve(xs: readonly number[], values: readonly (number | undefined)[], amount: number, scales: Scales, presence?: readonly number[]): LineCurve {
  // Each row's knot, or -1 for a missing value; and each knot's x, value, run, presence and tangent.
  const knotOf = new Int32Array(xs.length).fill(-1);
  const kx: number[] = [];
  const kv: number[] = [];
  const run: number[] = [];
  const kp: number[] = [];
  let runs = 0;
  let joined = false;
  for (let i = 0; i < xs.length; i++) {
    const value = values[i];
    if (value === undefined) {
      joined = false;
      continue;
    }
    const k = kx.length - 1;
    if (joined && xs[i] === kx[k] && value === kv[k]) {
      // A row growing out of the one it's at, or folding into it, which is there in full.
      knotOf[i] = k;
      kp[k] = Math.max(kp[k]!, presence?.[i] ?? 1);
      continue;
    }
    if (!joined || xs[i] === kx[k]) runs++;
    kx.push(xs[i]!);
    kv.push(value);
    run.push(runs);
    kp.push(presence?.[i] ?? 1);
    knotOf[i] = k + 1;
    joined = true;
  }
  const tangents = amount > 0 ? new Float64Array(kx.length) : undefined;
  if (tangents) {
    for (let start = 0; start < kx.length; ) {
      let end = start + 1;
      while (end < kx.length && run[end] === run[start]) end++;
      monotoneTangents(kx, kv, start, end, tangents);
      if (presence) fade(kx, kv, kp, start, end, tangents);
      start = end;
    }
  }

  /**
   * The piece's control values, as d3's Bézier has them, or undefined when there's no piece. Each end's
   * tangent is kept between 0 and 3 times the piece's slope (Fritsch and Carlson's square), so the
   * piece is monotone, between its two values. Steffen's tangents, and their ease from straight, are
   * inside it already; a tangent faded for a row coming or going may not be, on the piece beside it,
   * which then has a corner at that end until the row is there in full.
   */
  const piece = (from: number, to: number): [number, number, number, number, number] | undefined => {
    const k = knotOf[from]!;
    if (k < 0 || knotOf[to] !== k + 1 || run[k + 1] !== run[k]) return undefined;
    const h = kx[k + 1]! - kx[k]!;
    const v0 = kv[k]!;
    const v1 = kv[k + 1]!;
    const slope = (v1 - v0) / h;
    const [lo, hi] = slope < 0 ? [3 * slope, 0] : [0, 3 * slope];
    const ease = (tangent: number): number => Math.min(hi, Math.max(lo, amount === 1 ? tangent : slope + amount * (tangent - slope)));
    const a = tangents ? ease(tangents[k]!) : slope;
    const b = tangents ? ease(tangents[k + 1]!) : slope;
    return [v0, v0 + (h * a) / 3, v1 - (h * b) / 3, v1, k];
  };

  return {
    between(from, to, through = Infinity) {
      const p = piece(from, to);
      if (!p || !tangents) return [];
      const [v0, c1, c2, v1, k] = p;
      const x0 = kx[k]!;
      const h = kx[k + 1]! - x0;
      const left = scales.x(x0);
      const right = scales.x(kx[k + 1]!);
      // The piece is monotone (piece()), so the chord of any part of it passes every value that part
      // does within that part's width: it never strays further. So it needs no more pieces than its
      // width in tenths of a px, and one narrower than FLAT is straight.
      const n = Math.min(
        cubicPieces(
          { x: left, y: scales.y(v0) },
          { x: left + (right - left) / 3, y: scales.y(c1) },
          { x: right - (right - left) / 3, y: scales.y(c2) },
          { x: right, y: scales.y(v1) }
        ),
        Math.max(1, Math.ceil(Math.abs(right - left) / FLAT))
      );
      const bends: Bend[] = [];
      for (let j = 1; j < n; j++) {
        // The curve's x runs evenly with its parameter: its control points are a third of the way apart.
        const x = x0 + (j / n) * h;
        if (!(x < through)) break;
        bends.push({ x, value: cubic(v0, c1, c2, v1, j / n) });
      }
      return bends;
    },
    valueAt(from, to, x) {
      const p = piece(from, to);
      if (!p) return values[from] ?? 0;
      const [v0, c1, c2, v1, k] = p;
      return cubic(v0, c1, c2, v1, (x - kx[k]!) / (kx[k + 1]! - kx[k]!));
    }
  };
}

/**
 * The tangents of a monotone curve through knots `start` to `end` (exclusive) of `xs` and `values`,
 * written into `out`, in value per x: Steffen's, as d3's curveMonotoneX works them out. Inside, each
 * is no steeper than either slope beside it allows, and 0 where they differ in sign; at each end, the
 * end slope eased by its neighbour's tangent. Two knots are a straight piece; one has no tangent.
 */
export function monotoneTangents(xs: ArrayLike<number>, values: ArrayLike<number>, start: number, end: number, out: { [index: number]: number }): void {
  const count = end - start;
  if (count < 2) {
    if (count === 1) out[start] = 0;
    return;
  }
  const slope = (k: number): number => (values[k + 1]! - values[k]!) / (xs[k + 1]! - xs[k]!);
  if (count === 2) {
    out[start] = out[start + 1] = slope(start);
    return;
  }
  for (let k = start + 1; k < end - 1; k++) {
    const h0 = xs[k]! - xs[k - 1]!;
    const h1 = xs[k + 1]! - xs[k]!;
    const s0 = slope(k - 1);
    const s1 = slope(k);
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    out[k] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  out[start] = (3 * slope(start) - out[start + 1]!) / 2;
  out[end - 1] = (3 * slope(end - 2) - out[end - 2]!) / 2;
}

/**
 * Eases the tangents of knots `start` to `end` near a knot whose presence is less than 1 toward the
 * curve without such knots, by that presence, so the curve doesn't jump as a knot comes or goes. A
 * tangent depends on the knots up to two away (an end's, on its neighbour's), so each eases by the
 * least presence among them. A knot that's coming or going eases toward the slope of the curve
 * without it where it is, or at that curve's end beyond it.
 */
function fade(xs: readonly number[], values: readonly number[], presence: readonly number[], start: number, end: number, tangents: Float64Array): void {
  const kept: number[] = [];
  for (let k = start; k < end; k++) if (presence[k]! >= 1) kept.push(k);
  // A run of two is straight, faded or not.
  if (kept.length === end - start || kept.length < 2) return;
  const kx = kept.map((k) => xs[k]!);
  const kv = kept.map((k) => values[k]!);
  const without = new Float64Array(kept.length);
  monotoneTangents(kx, kv, 0, kept.length, without);
  const eased = new Float64Array(end - start);
  // The piece of the curve without them that each knot is on, in ascending x: from j to j + 1.
  let j = 0;
  let i = 0;
  for (let k = start; k < end; k++) {
    while (j < kx.length - 2 && kx[j + 1]! <= xs[k]!) j++;
    const own = kept[i] === k ? i++ : -1;
    let least = 1;
    for (let n = Math.max(start, k - 2); n < Math.min(end, k + 3); n++) least = Math.min(least, presence[n]!);
    if (least >= 1) {
      eased[k - start] = tangents[k]!;
      continue;
    }
    let slope: number;
    if (own >= 0) slope = without[own]!;
    else {
      // A cubic Hermite's slope at x, from its basis functions' derivatives, or at its nearer end.
      const h = kx[j + 1]! - kx[j]!;
      const u = Math.min(1, Math.max(0, (xs[k]! - kx[j]!) / h));
      slope = ((6 * u * u - 6 * u) * (kv[j]! - kv[j + 1]!)) / h + (3 * u * u - 4 * u + 1) * without[j]! + (3 * u * u - 2 * u) * without[j + 1]!;
    }
    eased[k - start] = least * tangents[k]! + (1 - least) * slope;
  }
  tangents.set(eased, start);
}

/** d3's sign: 0 counts as positive. */
const sign = (x: number): number => (x < 0 ? -1 : 1);

/** A cubic Bézier's value at u, from its four control values. */
function cubic(v0: number, c1: number, c2: number, v1: number, u: number): number {
  const s = 1 - u;
  return s * s * s * v0 + 3 * s * s * u * c1 + 3 * s * u * u * c2 + u * u * u * v1;
}
