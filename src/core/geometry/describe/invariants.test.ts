// The contract every builder keeps, checked on a spread of marks, segments included.
// Effects rely on these without knowing which builder made a mark.

import { area, curveMonotoneX, line } from "d3-shape";
import type { MarkGeometry, Point } from "../../contracts/geometry";
import { measurePath } from "../../testing";
import { matrix } from "../matrix";
import { describe as build } from "./index";

/** A season's values, with three missing, drawn as d3 draws them: a curve, gaps and all, and an area. */
const values = [3, 4, null, 6, 6.5, 8, null, 9, null, 9.5, 11];
const curved = line<number | null>()
  .defined((v) => v !== null)
  .x((_, i) => 40 * i)
  .y((v) => 200 - 10 * v!)
  .curve(curveMonotoneX);
const filled = area<number>()
  .x((_, i) => 40 * i)
  .y0(200)
  .y1((v) => 200 - 10 * v)
  .curve(curveMonotoneX);

const fixtures: [string, MarkGeometry][] = [
  ["bar", build.bar({ key: "a", series: "goals", x: 10, y: 20, width: 180, height: 22, baseline: "left", radius: 4 })],
  ["negative bar", build.bar({ key: "b", x: 0, y: 0, width: 75, height: 18, baseline: "right", radius: 4 })],
  ["column", build.bar({ key: "c", x: 50, y: 10, width: 30, height: 140, baseline: "bottom", radius: 6 })],
  ["hanging column", build.bar({ key: "d", x: 5, y: 5, width: 12, height: 40, baseline: "top" })],
  [
    "stacked bar",
    build.bar({
      key: "e",
      x: 0,
      y: 0,
      width: 120,
      height: 20,
      baseline: "left",
      radius: 4,
      gap: 2,
      segments: [
        { series: "goals", size: 70 },
        { series: "assists", size: 50 }
      ]
    })
  ],
  ["zero bar", build.bar({ key: "f", x: 0, y: 0, width: 0, height: 20, baseline: "left", radius: 4 })],
  ["donut slice", build.arc({ key: "g", cx: 100, cy: 100, inner: 70, outer: 116, start: 0.4, end: 2.1 })],
  ["large slice", build.arc({ key: "h", cx: 0, cy: 0, inner: 30, outer: 50, start: -1, end: 4 })],
  ["pie slice", build.arc({ key: "i", cx: 0, cy: 0, inner: 0, outer: 50, start: 3, end: 3.5 })],
  ["anticlockwise slice", build.arc({ key: "j", cx: 0, cy: 0, inner: 20, outer: 40, start: 2, end: 0.5 })],
  ["full ring", build.arc({ key: "k", cx: 0, cy: 0, inner: 20, outer: 40, start: 0, end: 2 * Math.PI })],
  [
    "line",
    build.line({
      key: "l",
      points: [
        { x: 0, y: 50 },
        { x: 40, y: 20 },
        { x: 80, y: 35 },
        { x: 120, y: 5 }
      ],
      width: 2.25
    })
  ],
  ["dot", build.point({ key: "m", x: 10, y: 10, r: 4.5 })],
  ["curve", build.shape({ key: "q", d: curved(values.filter((v) => v !== null))!, width: 2 })],
  // Each piece leaves in the direction the one before arrives: a circle's arc, a Bézier and half an ellipse's.
  ["open shape with arcs, turned", build.shape({ key: "r", d: "M0,0L20,0A10,10 0 0 1 30,10L30,30Q30,50 50,50A20,10 0 0 1 70,60", matrix: matrix.rotate(0.3, { x: 20, y: 0 }), width: 3 })],
  ["area", build.shape({ key: "s", d: filled([3, 5, 9, 8, 12])! })],
  ["area with a hole", build.shape({ key: "t", d: "M0,0V100H100V0ZM30,30H70V70H30Z" })],
  ["circle, anticlockwise", build.shape({ key: "u", d: "M40,10A30,30 0 0 0 40,70A30,30 0 0 0 40,10Z" })],
  ["ellipse, skewed", build.shape({ key: "v", d: "M0,-20A30,20 0 0 1 0,20A30,20 0 0 1 0,-20Z", matrix: [1, 0, 0.4, 1, 50, 50] })]
];

const everyMark = fixtures.flatMap(([name, mark]): [string, MarkGeometry][] => [
  [name, mark],
  ...(mark.segments ?? []).map((segment): [string, MarkGeometry] => [`${name} › ${segment.key}`, segment])
]);

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
const inside = (p: Point, b: MarkGeometry["bounds"]): boolean =>
  p.x >= b.x - 1e-9 && p.x <= b.x + b.width + 1e-9 && p.y >= b.y - 1e-9 && p.y <= b.y + b.height + 1e-9;
const signedArea = (points: readonly Point[]): number =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + (p.x * q.y - q.x * p.y) / 2;
  }, 0);

describe.each(everyMark)("%s", (_name, mark) => {
  it("starts at path(0) and ends at path(1)", () => {
    expect(mark.path(0)).toEqual(mark.start);
    expect(mark.path(1)).toEqual(mark.end);
  });

  it("is arc-length uniform: |path(t + dt) - path(t)| ≈ length · dt", () => {
    const n = 400;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const chord = distance(mark.path(i / n), mark.path((i + 1) / n));
      expect(chord).toBeLessThanOrEqual(mark.length / n + 1e-9);
      total += chord;
    }
    expect(total).toBeCloseTo(mark.length, 1);
  });

  it("heads where a finite difference says", () => {
    if (mark.length < 0.5) return;
    const h = 1e-7;
    for (let t = 0.013; t < 1; t += 0.051) {
      const a = mark.path(t - h);
      const b = mark.path(t + h);
      // Skip polyline corners, where the direction jumps.
      if (Math.abs(distance(a, b) - 2 * h * mark.length) > 1e-9 * mark.length) continue;
      expect(Math.cos(mark.angle(t) - Math.atan2(b.y - a.y, b.x - a.x))).toBeCloseTo(1, 6);
    }
  });

  it("draws slice(0, 1) at the full length, and part of it at its share", () => {
    expect(measurePath(mark.slice(0, 1)).length).toBeCloseTo(mark.length, 1);
    expect(measurePath(mark.slice(0.25, 0.75)).length).toBeCloseTo(mark.length / 2, 1);
  });

  it("keeps its walk, centre and outline inside its bounds", () => {
    const b = mark.bounds;
    for (let t = 0; t <= 1; t += 0.05) expect(inside(mark.path(t), b)).toBe(true);
    expect(inside(mark.center, b)).toBe(true);
    for (const p of mark.outline.sample(mark.outline.closed ? 200 : 50)) expect(inside(p, b)).toBe(true);
  });

  it("samples its outline canonically", () => {
    const { outline } = mark;
    if (!outline.closed) {
      const points = outline.sample(10);
      expect(points[0]).toEqual(mark.start);
      expect(points[9]).toEqual(mark.end);
      return;
    }
    const corners = outline.sample(4);
    const fine = outline.sample(80);
    expect(fine).toHaveLength(80);
    // Corners at multiples of n/4, whatever n is.
    corners.forEach((corner, i) => expect(fine[i * 20]).toEqual(corner));
    // Clockwise on screen.
    expect(signedArea(outline.sample(400))).toBeGreaterThanOrEqual(0);
    expect(() => outline.sample(10)).toThrow(RangeError);
  });

  it("writes outline path data that starts at the first corner", () => {
    const measured = measurePath(mark.outline.d);
    const first = mark.outline.sample(mark.outline.closed ? 4 : 1)[0]!;
    expect(measured.start!.x).toBeCloseTo(first.x, 2);
    expect(measured.start!.y).toBeCloseTo(first.y, 2);
  });
});

// Lines with gaps keep the same contract, with slice() and the stroke leaving the gaps out.
const zigzag = [
  { x: 0, y: 50 },
  { x: 40, y: 20 },
  { x: 80, y: 35 },
  { x: 120, y: 5 },
  { x: 160, y: 40 },
  { x: 200, y: 10 }
];
const gappedMarks: [string, MarkGeometry][] = [
  ["line with a gap", build.line({ key: "n", points: zigzag, breaks: [2], width: 2.25 })],
  ["line with two gaps", build.line({ key: "o", points: zigzag, breaks: [2, 4], width: 2.25 })],
  ["line with a value alone at each end and between gaps", build.line({ key: "p", points: zigzag, breaks: [1, 3, 4, 5], width: 2.25 })],
  ["curve with gaps", build.shape({ key: "w", d: curved(values)!, width: 2 })]
];

/** The px of the gaps between t0 and t1. */
const gapped = (mark: MarkGeometry, t0: number, t1: number): number =>
  (mark.gaps ?? []).reduce((sum, [from, to]) => sum + Math.max(0, Math.min(to, t1) - Math.max(from, t0)) * mark.length, 0);

describe.each(gappedMarks)("%s", (_name, mark) => {
  it("has gaps in order and apart, inside [0, 1]", () => {
    const gaps = mark.gaps ?? [];
    expect(gaps.length).toBeGreaterThan(0);
    gaps.forEach(([from, to], i) => {
      expect(from).toBeGreaterThanOrEqual(i === 0 ? 0 : gaps[i - 1]![1]);
      expect(to).toBeGreaterThan(from);
      expect(to).toBeLessThanOrEqual(1);
    });
  });

  it("starts at path(0), ends at path(1), and is arc-length uniform across its gaps", () => {
    expect(mark.path(0)).toEqual(mark.start);
    expect(mark.path(1)).toEqual(mark.end);
    let total = 0;
    for (let i = 0; i < 4000; i++) total += distance(mark.path(i / 4000), mark.path((i + 1) / 4000));
    expect(total).toBeCloseTo(mark.length, 1);
  });

  it("draws slice(0, 1) at its length less its gaps, and part of it at its share less theirs", () => {
    expect(measurePath(mark.slice(0, 1)).length).toBeCloseTo(mark.length - gapped(mark, 0, 1), 1);
    expect(measurePath(mark.slice(0.25, 0.75)).length).toBeCloseTo(mark.length / 2 - gapped(mark, 0.25, 0.75), 1);
    expect(mark.outline.d).toBe(mark.slice(0, 1));
  });

  it("starts each part of its stroke where a gap ends, and ends one where a gap starts", () => {
    const moves = measurePath(mark.outline.d).commands.filter((c) => c.op === "M");
    const starts = [0, ...(mark.gaps ?? []).map(([, to]) => to)].filter((t, i, all) => t < 1 && !(mark.gaps ?? []).some(([from]) => from === t) && all.indexOf(t) === i);
    expect(moves).toHaveLength(Math.max(1, starts.length));
    starts.forEach((t, i) => {
      expect(moves[i]!.args[0]).toBeCloseTo(mark.path(t).x, 2);
      expect(moves[i]!.args[1]).toBeCloseTo(mark.path(t).y, 2);
    });
  });

  it("samples its outline along the whole walk, gaps and all, inside its bounds", () => {
    const points = mark.outline.sample(50);
    expect(points[0]).toEqual(mark.start);
    expect(points[49]).toEqual(mark.end);
    for (const p of points) expect(inside(p, mark.bounds)).toBe(true);
  });
});
