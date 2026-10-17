import type { Point } from "../../contracts/geometry";
import { measurePath } from "../../testing";
import { offset } from "../matrix";
import { describe as build } from "./index";

const expectPoint = (actual: Point | undefined, expected: Point, digits = 9): void => {
  expect(actual).toBeDefined();
  expect(actual!.x).toBeCloseTo(expected.x, digits);
  expect(actual!.y).toBeCloseTo(expected.y, digits);
};
const expectHeading = (actual: number, expected: number): void => {
  expect(Math.cos(actual - expected)).toBeCloseTo(1, 9);
};
const signedArea = (points: readonly Point[]): number =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + (p.x * q.y - q.x * p.y) / 2;
  }, 0);
/** Where d3.arc() puts angle `a` at radius `r`: 0 at 12 o'clock, clockwise. */
const d3Point = (r: number, a: number): Point => ({ x: 100 + r * Math.sin(a), y: 100 - r * Math.cos(a) });

// A quarter of a donut, from 12 o'clock to 3 o'clock.
const quarter = () => build.arc({ key: "Saved", cx: 100, cy: 100, inner: 40, outer: 60, start: 0, end: Math.PI / 2 });

describe("describe.arc", () => {
  it("uses the d3.pie() convention: radians, 0 at 12 o'clock, clockwise", () => {
    const m = quarter();
    expectPoint(m.start, { x: 100, y: 50 });
    expectPoint(m.end, { x: 150, y: 100 });
    for (const t of [0, 0.3, 0.5, 0.8, 1]) expectPoint(m.path(t), d3Point(50, (t * Math.PI) / 2));
  });

  it("walks the mid-radius arc at constant speed", () => {
    const m = quarter();
    expect(m.length).toBeCloseTo(25 * Math.PI, 12);
    expect(measurePath(m.slice(0, 1)).length).toBeCloseTo(25 * Math.PI, 2);
    expect(measurePath(m.slice(0.2, 0.6)).length).toBeCloseTo(10 * Math.PI, 2);
  });

  it("heads along the ring, with angle equal to the d3 angle", () => {
    const m = quarter();
    for (const t of [0, 0.25, 0.5, 1]) expectHeading(m.angle(t), (t * Math.PI) / 2);
  });

  it("puts the up side outward", () => {
    const m = quarter();
    for (const t of [0, 0.4, 1]) expectPoint(offset(m.path(t), m.angle(t) - Math.PI / 2, m.thickness / 2), d3Point(60, (t * Math.PI) / 2));
  });

  it("has the ring width as thickness, the donut centre as pivot, and its middle as centre", () => {
    const m = quarter();
    expect(m.thickness).toBe(20);
    expect(m.pivot).toEqual({ x: 100, y: 100 });
    expectPoint(m.center, d3Point(50, Math.PI / 4));
    expect(m.segments).toBeUndefined();
  });

  it("is bounded by its corners and any 3, 6, 9 or 12 o'clock extremes", () => {
    const b = quarter().bounds;
    expect(b.x).toBeCloseTo(100, 9);
    expect(b.y).toBeCloseTo(40, 9);
    expect(b.width).toBeCloseTo(60, 9);
    expect(b.height).toBeCloseTo(60, 9);
    // 1:30 to 4:30 passes 3 o'clock on the outer ring.
    const across = build.arc({ key: "a", cx: 100, cy: 100, inner: 40, outer: 60, start: Math.PI / 4, end: (3 * Math.PI) / 4 }).bounds;
    expect(across.x + across.width).toBeCloseTo(160, 9);
    expect(across.x).toBeCloseTo(100 + 40 * Math.SQRT1_2, 9);
  });

  it("outlines the slice clockwise from the outer start corner: outer arc, end edge, inner arc, start edge", () => {
    const m = quarter();
    expect(m.outline.closed).toBe(true);
    expect(m.outline.d).toBe("M100,40A60,60 0 0 1 160,100L140,100A40,40 0 0 0 100,60Z");
    const [outerStart, outerEnd, innerEnd, innerStart] = m.outline.sample(4);
    expectPoint(outerStart, { x: 100, y: 40 });
    expectPoint(outerEnd, { x: 160, y: 100 });
    expectPoint(innerEnd, { x: 140, y: 100 });
    expectPoint(innerStart, { x: 100, y: 60 });
    // Annular sector area: sweep / 2 × (R² - r²).
    expect(signedArea(m.outline.sample(4000))).toBeCloseTo((Math.PI / 4) * (60 * 60 - 40 * 40), 0);
  });

  it("samples evenly along each side", () => {
    const points = quarter().outline.sample(8);
    expectPoint(points[1], d3Point(60, Math.PI / 4));
    expectPoint(points[3], { x: 150, y: 100 });
    expectPoint(points[5], d3Point(40, Math.PI / 4));
    expectPoint(points[7], { x: 100, y: 50 });
  });

  it("describes a full ring", () => {
    const m = build.arc({ key: "All", cx: 100, cy: 100, inner: 40, outer: 60, start: 0, end: 2 * Math.PI });
    expect(m.length).toBeCloseTo(100 * Math.PI, 12);
    expectPoint(m.path(1), m.path(0));
    expectPoint(m.path(0.5), { x: 100, y: 150 });
    const outline = measurePath(m.outline.d);
    expect(outline.commands.filter((c) => c.op === "A")).toHaveLength(4);
    expect(outline.length).toBeCloseTo(2 * Math.PI * 100 + 40, 1);
    expect(m.bounds).toEqual({ x: 40, y: 40, width: 120, height: 120 });
  });

  it("treats more than a full turn as a full turn, as d3.arc() does", () => {
    const m = build.arc({ key: "All", cx: 0, cy: 0, inner: 0, outer: 10, start: 1, end: 1 + 10 * Math.PI });
    expect(m.length).toBeCloseTo(10 * Math.PI, 12);
  });

  it("describes a pie slice, whose inner side sits at the centre", () => {
    const m = build.arc({ key: "Pie", cx: 100, cy: 100, inner: 0, outer: 60, start: 0, end: Math.PI / 2 });
    expect(m.thickness).toBe(60);
    expectPoint(m.start, { x: 100, y: 70 });
    expect(m.outline.d).toBe("M100,40A60,60 0 0 1 160,100L100,100Z");
    const points = m.outline.sample(8);
    expectPoint(points[4], { x: 100, y: 100 });
    expectPoint(points[5], { x: 100, y: 100 });
  });

  it("swaps radii given the wrong way round, as d3.arc() does", () => {
    const m = build.arc({ key: "a", cx: 100, cy: 100, inner: 60, outer: 40, start: 0, end: Math.PI / 2 });
    expect(m.outline.d).toBe(quarter().outline.d);
    expect(m.thickness).toBe(20);
  });

  it("walks anticlockwise when end < start, with the up side inward and the outline still clockwise", () => {
    const m = build.arc({ key: "a", cx: 100, cy: 100, inner: 40, outer: 60, start: Math.PI / 2, end: 0 });
    expectPoint(m.start, { x: 150, y: 100 });
    expectPoint(m.end, { x: 100, y: 50 });
    expectHeading(m.angle(0), -Math.PI / 2); // at 3 o'clock heading up the screen
    expectPoint(offset(m.path(0), m.angle(0) - Math.PI / 2, 10), { x: 140, y: 100 });
    expect(signedArea(m.outline.sample(400))).toBeGreaterThan(0);
    expectPoint(m.outline.sample(4)[0], { x: 140, y: 100 });
  });

  it("describes an empty slice", () => {
    const m = build.arc({ key: "None", cx: 100, cy: 100, inner: 40, outer: 60, start: 1, end: 1 });
    expect(m.length).toBe(0);
    expectHeading(m.angle(0.5), 1);
    expectPoint(m.path(0.5), d3Point(50, 1));
    expect(m.outline.sample(4)).toHaveLength(4);
  });

  it("rejects bad input", () => {
    const ok = { key: "a", cx: 0, cy: 0, inner: 1, outer: 2, start: 0, end: 1 };
    expect(() => build.arc({ ...ok, inner: -1 })).toThrow(/inner/);
    expect(() => build.arc({ ...ok, outer: Number.NaN })).toThrow(/outer/);
    expect(() => build.arc({ ...ok, end: Infinity })).toThrow(/end/);
    expect(() => build.arc({ ...ok, cx: Number.NaN })).toThrow(/cx/);
  });
});
