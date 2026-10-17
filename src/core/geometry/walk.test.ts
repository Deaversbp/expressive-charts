import type { Point } from "../contracts/geometry";
import { measurePath } from "../testing";
import { arc, line } from "./segment";
import { createWalk } from "./walk";

const expectPoint = (actual: Point | undefined, expected: Point, digits = 9): void => {
  expect(actual).toBeDefined();
  expect(actual!.x).toBeCloseTo(expected.x, digits);
  expect(actual!.y).toBeCloseTo(expected.y, digits);
};
/** Equal as directions, so PI and -PI match. */
const expectHeading = (actual: number, expected: number): void => {
  expect(Math.cos(actual - expected)).toBeCloseTo(1, 9);
};
const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

// A running track: 100 px right, half a circle clockwise down the right side, 100 px back left.
const track = () =>
  createWalk([
    line({ x: 0, y: 0 }, { x: 100, y: 0 }),
    arc({ x: 100, y: 50 }, 50, -Math.PI / 2, Math.PI),
    line({ x: 100, y: 100 }, { x: 0, y: 100 })
  ]);
const TRACK = 200 + 50 * Math.PI;

describe("createWalk", () => {
  it("needs at least one segment", () => {
    expect(() => createWalk([])).toThrow(RangeError);
  });

  it("adds up exact segment lengths", () => {
    const walk = track();
    expect(walk.length).toBeCloseTo(TRACK, 12);
    expect(walk.start).toEqual({ x: 0, y: 0 });
    expect(walk.end).toEqual({ x: 0, y: 100 });
  });

  it("is parameterised by distance", () => {
    const walk = track();
    const at = (d: number) => walk.point(d / TRACK);
    expectPoint(at(50), { x: 50, y: 0 });
    expectPoint(at(100), { x: 100, y: 0 });
    expectPoint(at(100 + 25 * Math.PI), { x: 150, y: 50 });
    expectPoint(at(100 + 50 * Math.PI), { x: 100, y: 100 });
    expectPoint(at(150 + 50 * Math.PI), { x: 50, y: 100 });
  });

  it("moves at constant speed: equal steps in t are equal distances", () => {
    const walk = track();
    const n = 1000;
    const step = TRACK / n;
    for (let i = 0; i < n; i++) {
      const chord = distance(walk.point(i / n), walk.point((i + 1) / n));
      expect(chord).toBeLessThanOrEqual(step + 1e-9);
      expect(chord).toBeGreaterThan(step * (1 - 1e-5));
    }
  });

  it("heads in the direction of travel", () => {
    const walk = track();
    expectHeading(walk.angle(0.1), 0);
    expectHeading(walk.angle((100 + 25 * Math.PI) / TRACK), Math.PI / 2);
    expectHeading(walk.angle(0.95), Math.PI);
    // Matches a finite difference everywhere.
    const h = 1e-6;
    for (let t = 0.01; t < 1; t += 0.0173) {
      const a = walk.point(t - h);
      const b = walk.point(t + h);
      expectHeading(walk.angle(t), Math.atan2(b.y - a.y, b.x - a.x));
    }
  });

  it("takes the segment ahead at a corner, and the last one at the end", () => {
    const walk = createWalk([line({ x: 0, y: 0 }, { x: 10, y: 0 }), line({ x: 10, y: 0 }, { x: 10, y: 10 })]);
    expect(walk.angle(0)).toBe(0);
    expect(walk.angle(0.5)).toBe(Math.PI / 2);
    expect(walk.angle(1)).toBe(Math.PI / 2);
  });

  it("clamps t", () => {
    const walk = track();
    expect(walk.point(-1)).toEqual(walk.start);
    expect(walk.point(2)).toEqual(walk.end);
    expect(walk.point(Number.NaN)).toEqual(walk.start);
    expect(walk.angle(5)).toBe(walk.angle(1));
    expect(walk.slice(-1, 2)).toBe(walk.slice(0, 1));
  });

  it("skips zero-length segments", () => {
    const walk = createWalk([
      line({ x: 0, y: 0 }, { x: 0, y: 0 }, 2),
      line({ x: 0, y: 0 }, { x: 10, y: 0 }),
      line({ x: 10, y: 0 }, { x: 10, y: 0 }, 2),
      line({ x: 10, y: 0 }, { x: 10, y: 10 }),
      line({ x: 10, y: 10 }, { x: 10, y: 10 }, 2)
    ]);
    expect(walk.length).toBe(20);
    expect(walk.angle(0)).toBe(0);
    expect(walk.angle(0.5)).toBe(Math.PI / 2);
    expect(walk.angle(1)).toBe(Math.PI / 2);
    expectPoint(walk.point(0.75), { x: 10, y: 5 });
    expect(walk.d).toBe("M0,0L10,0L10,10");
    expect(walk.slice(0.25, 0.75)).toBe("M5,0L10,0L10,5");
  });

  it("handles a walk with no length", () => {
    const p = { x: 3, y: 4 };
    const walk = createWalk([line(p, p, -Math.PI / 2)]);
    expect(walk.length).toBe(0);
    expect(walk.point(0.5)).toEqual(p);
    expect(walk.angle(0.5)).toBe(-Math.PI / 2);
    expect(walk.slice(0, 1)).toBe("M3,4");
    expect(walk.d).toBe("M3,4");
  });

  it("finds the right segment among many", () => {
    const points = Array.from({ length: 500 }, (_, i) => ({ x: i * 2, y: 40 * Math.sin(i / 10) }));
    const segments = points.slice(1).map((p, i) => line(points[i]!, p));
    const walk = createWalk(segments);
    let travelled = 0;
    for (const [i, s] of segments.entries()) {
      if (i % 37 === 0) {
        expectPoint(walk.point((travelled + s.length / 2) / walk.length), { x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 }, 6);
      }
      travelled += s.length;
    }
  });
});

describe("walk.slice", () => {
  it("draws the whole walk for slice(0, 1)", () => {
    const walk = track();
    const whole = measurePath(walk.slice(0, 1));
    expect(whole.length).toBeCloseTo(TRACK, 2);
    expect(walk.slice(0, 1)).toBe(walk.d);
    expect(walk.d).toBe("M0,0L100,0A50,50 0 0 1 100,100L0,100");
  });

  it("draws any part, at its own length, from path(t0) to path(t1)", () => {
    const walk = track();
    for (const [t0, t1] of [
      [0, 0.2],
      [0.2, 0.7],
      [0.35, 0.45],
      [0.6, 1]
    ] as const) {
      const part = measurePath(walk.slice(t0, t1));
      expect(part.length).toBeCloseTo((t1 - t0) * TRACK, 2);
      expectPoint(part.start, walk.point(t0), 2);
      expectPoint(part.end, walk.point(t1), 2);
    }
  });

  it("accepts its ends in either order", () => {
    const walk = track();
    expect(walk.slice(0.7, 0.2)).toBe(walk.slice(0.2, 0.7));
  });

  it("is only a move when the ends are equal", () => {
    expect(track().slice(0.5, 0.5)).toMatch(/^M[-\d.]+,[-\d.]+$/);
  });

  it("draws a full circle", () => {
    const walk = createWalk([arc({ x: 0, y: 0 }, 10, 0, 2 * Math.PI)]);
    const whole = measurePath(walk.slice(0, 1));
    expect(whole.commands.filter((c) => c.op === "A")).toHaveLength(2);
    expect(whole.length).toBeCloseTo(20 * Math.PI, 2);
    const half = measurePath(walk.slice(0.25, 0.75));
    expect(half.length).toBeCloseTo(10 * Math.PI, 2);
    expectPoint(half.end, { x: 0, y: -10 }, 3);
  });
});
