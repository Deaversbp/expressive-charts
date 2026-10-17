// The contract every builder keeps, checked on a spread of marks, segments included.
// Effects rely on these without knowing which builder made a mark.

import type { MarkGeometry, Point } from "../../contracts/geometry";
import { measurePath } from "../../testing";
import { describe as build } from "./index";

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
  ["dot", build.point({ key: "m", x: 10, y: 10, r: 4.5 })]
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
