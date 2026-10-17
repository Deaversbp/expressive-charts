import type { Point } from "../../contracts/geometry";
import { measurePath } from "../../testing";
import { describe as build } from "./index";

const expectPoint = (actual: Point | undefined, expected: Point): void => {
  expect(actual).toBeDefined();
  expect(actual!.x).toBeCloseTo(expected.x, 9);
  expect(actual!.y).toBeCloseTo(expected.y, 9);
};

// Two legs: 50 px down-right, then 60 px straight down.
const points = [
  { x: 0, y: 0 },
  { x: 30, y: 40 },
  { x: 30, y: 100 }
];

describe("describe.line", () => {
  it("walks the polyline by distance", () => {
    const m = build.line({ key: "goals", series: "goals", points });
    expect(m.key).toBe("goals");
    expect(m.series).toBe("goals");
    expect(m.length).toBe(110);
    expect(m.start).toEqual(points[0]);
    expect(m.end).toEqual(points[2]);
    expectPoint(m.path(50 / 110), { x: 30, y: 40 });
    expectPoint(m.path(25 / 110), { x: 15, y: 20 });
    expectPoint(m.path(80 / 110), { x: 30, y: 70 });
  });

  it("heads along each leg", () => {
    const m = build.line({ key: "goals", points });
    expect(m.angle(0.2)).toBe(Math.atan2(40, 30));
    expect(m.angle(0.8)).toBe(Math.PI / 2);
  });

  it("slices along the line", () => {
    const m = build.line({ key: "goals", points });
    expect(m.slice(0, 1)).toBe("M0,0L30,40L30,100");
    expect(m.slice(25 / 110, 80 / 110)).toBe("M15,20L30,40L30,70");
    expect(measurePath(m.slice(0.1, 0.9)).length).toBeCloseTo(88, 6);
  });

  it("has an open outline: the stroke", () => {
    const m = build.line({ key: "goals", points });
    expect(m.outline.closed).toBe(false);
    expect(m.outline.d).toBe("M0,0L30,40L30,100");
    const samples = m.outline.sample(12);
    expect(samples).toHaveLength(12);
    expect(samples[0]).toEqual(points[0]);
    expect(samples[11]).toEqual(points[2]);
    expectPoint(samples[5], m.path(5 / 11));
  });

  it("uses the stroke width as thickness and pads its bounds by half of it", () => {
    const thin = build.line({ key: "goals", points });
    expect(thin.thickness).toBe(1);
    expect(thin.bounds).toEqual({ x: -0.5, y: -0.5, width: 31, height: 101 });
    const thick = build.line({ key: "goals", points, width: 4 });
    expect(thick.thickness).toBe(4);
    expect(thick.bounds).toEqual({ x: -2, y: -2, width: 34, height: 104 });
  });

  it("is attached at its first point, with its centre halfway along", () => {
    const m = build.line({ key: "goals", points });
    expect(m.pivot).toEqual(points[0]);
    expectPoint(m.center, { x: 30, y: 45 });
    expect(m.segments).toBeUndefined();
  });

  it("keeps its direction through a repeated point", () => {
    const m = build.line({
      key: "goals",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      ]
    });
    expect(m.length).toBe(20);
    expect(m.angle(0.25)).toBe(0);
    expect(m.angle(0.5)).toBe(Math.PI / 2);
    expect(m.slice(0, 1)).toBe("M0,0L10,0L10,10");
  });

  it("describes a single point as a line with no length", () => {
    const m = build.line({ key: "goals", points: [{ x: 5, y: 6 }] });
    expect(m.length).toBe(0);
    expect(m.start).toEqual({ x: 5, y: 6 });
    expect(m.end).toEqual({ x: 5, y: 6 });
    expect(m.angle(0.5)).toBe(0);
    expect(m.outline.sample(3)).toEqual([
      { x: 5, y: 6 },
      { x: 5, y: 6 },
      { x: 5, y: 6 }
    ]);
  });

  it("rejects bad input", () => {
    expect(() => build.line({ key: "goals", points: [] })).toThrow(/at least one point/);
    expect(() => build.line({ key: "goals", points: [{ x: 0, y: Number.NaN }] })).toThrow(/points\[0\]\.y/);
    expect(() => build.line({ key: "goals", points, width: -1 })).toThrow(/width/);
  });
});
