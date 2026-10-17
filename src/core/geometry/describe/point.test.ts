import type { Point } from "../../contracts/geometry";
import { measurePath } from "../../testing";
import { describe as build } from "./index";

const expectPoint = (actual: Point | undefined, expected: Point): void => {
  expect(actual).toBeDefined();
  expect(actual!.x).toBeCloseTo(expected.x, 9);
  expect(actual!.y).toBeCloseTo(expected.y, 9);
};

describe("describe.point", () => {
  const dot = () => build.point({ key: "goals@12", series: "goals", x: 40, y: 30, r: 5 });

  it("has no direction: length 0, with start, end, centre and pivot all at the point", () => {
    const m = dot();
    expect(m.length).toBe(0);
    for (const p of [m.start, m.end, m.center, m.pivot, m.path(0.5)]) expect(p).toEqual({ x: 40, y: 30 });
    expect(m.angle(0.5)).toBe(0);
    expect(m.slice(0, 1)).toBe("M40,30");
    expect(m.segments).toBeUndefined();
  });

  it("uses the diameter as thickness and bounds the circle", () => {
    const m = dot();
    expect(m.thickness).toBe(10);
    expect(m.bounds).toEqual({ x: 35, y: 25, width: 10, height: 10 });
  });

  it("outlines the circle clockwise, with corners where a square's would be", () => {
    const m = dot();
    expect(m.outline.closed).toBe(true);
    // Path data is rounded to 0.001 px, so the measured length is only that good.
    expect(measurePath(m.outline.d).length).toBeCloseTo(10 * Math.PI, 1);
    const k = 5 * Math.SQRT1_2;
    const [startLeft, endLeft, endRight, startRight] = m.outline.sample(4);
    expectPoint(startLeft, { x: 40 - k, y: 30 - k });
    expectPoint(endLeft, { x: 40 + k, y: 30 - k });
    expectPoint(endRight, { x: 40 + k, y: 30 + k });
    expectPoint(startRight, { x: 40 - k, y: 30 + k });
    expectPoint(m.outline.sample(8)[1], { x: 40, y: 25 });
  });

  it("rejects a negative radius", () => {
    expect(() => build.point({ key: "a", x: 0, y: 0, r: -1 })).toThrow(/r must be/);
  });
});
