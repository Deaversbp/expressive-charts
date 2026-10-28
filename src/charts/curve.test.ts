// The line chart's curve (curve.ts) on its own: through every value, never above or below the values
// either side, flat between equal ones, within 0.1 px of d3's curveMonotoneX at several scales and
// on a time axis, eased from the exact polyline to the curve without overshooting, each run between
// gaps curved alone, and a row coming or going bending it only as much as it shows.

import { curveMonotoneX, line } from "d3-shape";
import type { Point } from "../core";
import { FLAT } from "../core/geometry/flatten";
import { bendOf, CURVES, lineCurve, type Scales } from "./curve";

/** A piece of d3's path in px: a cubic Bézier's four points, or a straight piece's two. */
type D3Piece = readonly Point[];

/**
 * d3's curveMonotoneX through `points`, as the calls it makes on a canvas context, in full precision
 * (a path string rounds): one list of pieces per run between undefined points.
 */
function d3Curve(points: readonly (Point | undefined)[]): D3Piece[][] {
  const runs: D3Piece[][] = [];
  let pen: Point = { x: 0, y: 0 };
  const to = (piece: D3Piece): void => {
    runs[runs.length - 1]!.push(piece);
    pen = piece[piece.length - 1]!;
  };
  const context = {
    moveTo(x: number, y: number) {
      pen = { x, y };
      runs.push([]);
    },
    lineTo: (x: number, y: number) => to([pen, { x, y }]),
    bezierCurveTo: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => to([pen, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y }]),
    closePath() {}
  };
  line<Point | undefined>()
    .defined((p) => p !== undefined)
    .x((p) => p!.x)
    .y((p) => p!.y)
    .curve(curveMonotoneX)
    .context(context as unknown as CanvasRenderingContext2D)(points);
  return runs;
}

/** A d3 piece's point at u: d3's control points are a third of the way apart in x, so x runs evenly with u. */
function onPiece(piece: D3Piece, u: number): Point {
  const s = 1 - u;
  if (piece.length === 2) return { x: s * piece[0]!.x + u * piece[1]!.x, y: s * piece[0]!.y + u * piece[1]!.y };
  const [a, b, c, d] = [s * s * s, 3 * s * s * u, 3 * s * u * u, u * u * u];
  return { x: a * piece[0]!.x + b * piece[1]!.x + c * piece[2]!.x + d * piece[3]!.x, y: a * piece[0]!.y + b * piece[1]!.y + c * piece[2]!.y + d * piece[3]!.y };
}

/** Our curve's polyline in px, through the rows with values and the bends between them: a list per run between gaps. */
function polylines(xs: readonly number[], values: readonly (number | undefined)[], amount: number, scales: Scales, presence?: readonly number[]): Point[][] {
  const curve = lineCurve(xs, values, amount, scales, presence);
  const runs: Point[][] = [];
  let before = -1;
  values.forEach((value, i) => {
    if (value === undefined) {
      before = -1;
      return;
    }
    if (before < 0) runs.push([]);
    const run = runs[runs.length - 1]!;
    if (before >= 0) for (const bend of curve.between(before, i)) run.push({ x: scales.x(bend.x), y: scales.y(bend.value) });
    run.push({ x: scales.x(xs[i]!), y: scales.y(value) });
    before = i;
  });
  return runs;
}

function distanceTo(p: Point, polyline: readonly Point[]): number {
  if (polyline.length === 1) return Math.hypot(p.x - polyline[0]!.x, p.y - polyline[0]!.y);
  let best = Infinity;
  for (let i = 1; i < polyline.length; i++) {
    const from = polyline[i - 1]!;
    const to = polyline[i]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = dx * dx + dy * dy;
    const u = length > 0 ? Math.max(0, Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(from.x + u * dx - p.x, from.y + u * dy - p.y));
  }
  return best;
}

/** Our curve, flattened, against d3's: every point of d3's within FLAT of ours, and each of our vertices on d3's. */
function expectLikeD3(xs: readonly number[], values: readonly (number | undefined)[], scales: Scales): void {
  const px = values.map((value, i) => (value === undefined ? undefined : { x: scales.x(xs[i]!), y: scales.y(value) }));
  const theirs = d3Curve(px);
  const mine = polylines(xs, values, 1, scales);
  expect(mine).toHaveLength(theirs.length);
  theirs.forEach((pieces, r) => {
    const polyline = mine[r]!;
    for (const piece of pieces) for (let k = 0; k <= 64; k++) expect(distanceTo(onPiece(piece, k / 64), polyline)).toBeLessThanOrEqual(FLAT + 1e-9);
    for (const vertex of polyline) {
      const piece = pieces.find((p) => p[0]!.x <= vertex.x && vertex.x <= p[p.length - 1]!.x);
      if (!piece) {
        // A value alone: d3 moves there and draws nothing.
        expect(pieces).toEqual([]);
        continue;
      }
      const span = piece[piece.length - 1]!.x - piece[0]!.x;
      expect(Math.abs(onPiece(piece, span > 0 ? (vertex.x - piece[0]!.x) / span : 0).y - vertex.y)).toBeLessThan(1e-6);
    }
  });
}

/** The prototype's season: seed 42, 38 matchweeks, cumulative goals and xG. */
function season(): { week: number; goals: number; xg: number }[] {
  let seed = 42;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const poisson = (lambda: number) => {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= random();
    } while (p > limit);
    return k - 1;
  };
  const weeks: { week: number; goals: number; xg: number }[] = [];
  let goals = 0;
  let xg = 0;
  for (let i = 0; i < 38; i++) {
    const chance = 0.6 + random() * 1.9;
    const form = i < 12 ? 0.72 : i < 26 ? 1.32 : 0.7;
    xg += chance;
    goals += poisson(chance * form);
    weeks.push({ week: i + 1, goals, xg: Math.round(xg * 10) / 10 });
  }
  return weeks;
}

/** A random walk with flat stretches, seeded. */
function walk(count: number, seed: number): number[] {
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const values = [10];
  for (let i = 1; i < count; i++) values.push(random() < 0.2 ? values[i - 1]! : values[i - 1]! + Math.round((random() - 0.5) * 80) / 10);
  return values;
}

const weeks = season();
const xs = weeks.map((w) => w.week);
const goals = weeks.map((w) => w.goals);
const xg = weeks.map((w) => w.xg);
/** Goals in each match: spiky, so the curve turns at nearly every value. */
const perMatch = goals.map((g, i) => g - (goals[i - 1] ?? 0));

/** Data to px, as the chart's positions(): x from lo..hi onto left..right, values from 0..top onto bottom..12. */
function scales(lo: number, hi: number, left: number, right: number, top: number, bottom: number): Scales {
  return { x: (v) => left + ((v - lo) / (hi - lo)) * (right - left), y: (v) => bottom - (v / top) * (bottom - 12) };
}

const SCALES: readonly [string, Scales][] = [
  ["the line page's plot", scales(1, 38, 40, 900, 80, 268)],
  ["a narrow plot", scales(1, 38, 0, 200, 80, 268)],
  ["a tall, wide one", scales(1, 38, 0, 4000, 80, 3000)],
  ["one with y upward", { x: (v) => 3 * v, y: (v) => 10 + 2 * v }]
];

describe("lineCurve", () => {
  it("names two curves, the first straight", () => {
    expect(CURVES).toEqual(["linear", "monotone"]);
    expect(CURVES.map(bendOf)).toEqual([0, 1]);
  });

  it.each(SCALES)("is d3's curveMonotoneX within 0.1 px, on %s", (_, s) => {
    for (const values of [goals, xg, perMatch, walk(38, 7)]) expectLikeD3(xs, values, s);
  });

  it("is d3's curveMonotoneX within 0.1 px on a time axis", () => {
    const start = Date.UTC(2025, 0, 1);
    const days = Array.from({ length: 90 }, (_, i) => start + i * 86_400_000);
    // A few days an hour late, so the steps aren't all the same.
    days[10]! += 3_600_000;
    days[40]! += 7_200_000;
    for (const values of [walk(90, 3), walk(90, 11)]) expectLikeD3(days, values, scales(days[0]!, days[89]!, 30, 900, 80, 268));
  });

  it("goes through every value, and never above or below the two values either side", () => {
    for (const [, s] of SCALES) {
      for (const values of [goals, xg, perMatch, walk(38, 5), walk(38, 9)]) {
        const curve = lineCurve(xs, values, 1, s);
        for (let i = 0; i + 1 < xs.length; i++) {
          const [a, b] = [values[i]!, values[i + 1]!];
          expect(curve.valueAt(i, i + 1, xs[i]!)).toBe(a);
          expect(curve.valueAt(i, i + 1, xs[i + 1]!)).toBe(b);
          const inside = (value: number) => expect(value >= Math.min(a, b) - 1e-9 && value <= Math.max(a, b) + 1e-9).toBe(true);
          for (const bend of curve.between(i, i + 1)) inside(bend.value);
          for (let k = 1; k < 50; k++) inside(curve.valueAt(i, i + 1, xs[i]! + k / 50));
        }
      }
    }
  });

  it("is flat between two equal values", () => {
    const values = [1, 4, 4, 2, 2, 2, 5, 5];
    const curve = lineCurve([0, 1, 2, 3, 4, 5, 6, 7], values, 1, SCALES[0]![1]);
    for (const i of [1, 3, 4, 6]) {
      expect(curve.between(i, i + 1)).toEqual([]);
      for (let k = 1; k < 10; k++) expect(curve.valueAt(i, i + 1, i + k / 10)).toBeCloseTo(values[i]!, 12);
    }
    // And bends elsewhere.
    expect(curve.between(0, 1).length).toBeGreaterThan(0);
  });

  it("eases from the exact polyline to the curve, never above or below the values either side on the way", () => {
    const s = SCALES[0]![1];
    for (const values of [goals, perMatch, walk(38, 13)]) {
      // Straight: no bends, and the line's own values between rows.
      const straight = lineCurve(xs, values, 0, s);
      for (let i = 0; i + 1 < xs.length; i++) {
        expect(straight.between(i, i + 1)).toEqual([]);
        expect(straight.valueAt(i, i + 1, xs[i]! + 0.25)).toBeCloseTo(values[i]! + 0.25 * (values[i + 1]! - values[i]!), 12);
      }
      for (const amount of [0.001, 0.2, 0.5, 0.8, 0.999]) {
        const curve = lineCurve(xs, values, amount, s);
        for (let i = 0; i + 1 < xs.length; i++) {
          const [a, b] = [values[i]!, values[i + 1]!];
          for (let k = 1; k < 20; k++) {
            const value = curve.valueAt(i, i + 1, xs[i]! + k / 20);
            expect(value >= Math.min(a, b) - 1e-9 && value <= Math.max(a, b) + 1e-9).toBe(true);
          }
        }
      }
      // And it moves steadily: nearly curved is nearly the curve.
      const near = lineCurve(xs, values, 1 - 1e-9, s);
      const curved = lineCurve(xs, values, 1, s);
      for (let i = 0; i + 1 < xs.length; i++) expect(near.valueAt(i, i + 1, xs[i]! + 0.5)).toBeCloseTo(curved.valueAt(i, i + 1, xs[i]! + 0.5), 6);
    }
  });

  it("curves each run between gaps on its own, as d3's .defined() draws them: a run of two straight, a value alone a point", () => {
    const values: (number | undefined)[] = [...walk(38, 17)];
    for (const i of [3, 4, 9, 12, 14, 20, 21, 22, 30]) values[i] = undefined;
    for (const [, s] of SCALES) expectLikeD3(xs, values, s);
    const curve = lineCurve(xs, values, 1, SCALES[0]![1]);
    // Rows 10 and 11 make a run of two, and row 13 is alone between gaps: no bends, and none across a gap.
    expect(curve.between(5, 6).length).toBeGreaterThan(0);
    expect(curve.between(10, 11)).toEqual([]);
    expect(curve.between(2, 5)).toEqual([]);
    expect(curve.between(13, 15)).toEqual([]);
    const runs = polylines(xs, values, 1, SCALES[0]![1]);
    expect(runs.map((run) => run.length).filter((length) => length <= 2)).toEqual([2, 1]);
  });

  it("takes two rows at the same x and value as one, and goes straight between two at the same x with different values", () => {
    const s = SCALES[0]![1];
    const repeated = polylines([1, 2, 2, 3, 4, 5], [1, 3, 3, 2, 5, 4], 1, s)[0]!;
    const once = polylines([1, 2, 3, 4, 5], [1, 3, 2, 5, 4], 1, s)[0]!;
    // The same polyline, with the repeated point twice.
    expect(repeated.filter((p, i) => i === 0 || p.x !== repeated[i - 1]!.x || p.y !== repeated[i - 1]!.y)).toEqual(once);
    // A jump: the curve before it and the curve after it, each its own run, joined straight.
    const jump = polylines([1, 2, 3, 3, 4, 5, 6], [1, 3, 2, 6, 5, 7, 6], 1, s)[0]!;
    const before = polylines([1, 2, 3], [1, 3, 2], 1, s)[0]!;
    const after = polylines([3, 4, 5, 6], [6, 5, 7, 6], 1, s)[0]!;
    expect(jump).toEqual([...before, ...after]);
  });

  it("bends through a row coming or going only as much as it shows, so the curve doesn't jump", () => {
    const s = SCALES[0]![1];
    const values = goals.slice(0, 12);
    const at = xs.slice(0, 12);
    // A row growing out of the last one, toward x 13 and the 13th value.
    const grown = (p: number) => {
      const presence = [...at.map(() => 1), p];
      return lineCurve([...at, 12 + p], [...values, values[11]! + p * (goals[12]! - values[11]!)], 1, s, presence);
    };
    const without = lineCurve(at, values, 1, s);
    const full = lineCurve([...at, 13], [...values, goals[12]!], 1, s);
    for (let i = 0; i < 11; i++) {
      const x = at[i]! + 0.5;
      // At 0 it's where the row it grows from is: one knot, and the curve without it.
      expect(grown(0).valueAt(i, i + 1, x)).toBe(without.valueAt(i, i + 1, x));
      expect(grown(1e-9).valueAt(i, i + 1, x)).toBeCloseTo(without.valueAt(i, i + 1, x), 6);
      expect(grown(1).valueAt(i, i + 1, x)).toBe(full.valueAt(i, i + 1, x));
    }
    // A row growing out of the first, before it: at 0, one knot with it, there in full.
    const before = (p: number) => lineCurve([1 - p, ...at], [values[0]! - p, ...values], 1, s, [p, ...at.map(() => 1)]);
    for (let i = 0; i < 11; i++) expect(before(0).valueAt(i + 1, i + 2, at[i]! + 0.5)).toBe(without.valueAt(i, i + 1, at[i]! + 0.5));
    // With every row there, presence changes nothing.
    expect(polylines(at, values, 1, s, at.map(() => 1))).toEqual(polylines(at, values, 1, s));
  });
});
