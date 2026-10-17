import type { Point } from "../contracts/geometry";
import { angleOn, arc, boundsOf, extremes, line, normalizeAngle, pointOn, TAU } from "./segment";

const expectPoint = (actual: Point, expected: Point): void => {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
};

describe("line", () => {
  it("measures length and direction", () => {
    const s = line({ x: 1, y: 2 }, { x: 4, y: 6 });
    expect(s.length).toBe(5);
    expect(s.angle).toBe(Math.atan2(4, 3));
    expect(angleOn(s, 0.3)).toBe(s.angle);
  });

  it("uses the fallback direction when its ends coincide", () => {
    expect(line({ x: 1, y: 1 }, { x: 1, y: 1 }, Math.PI / 2).angle).toBe(Math.PI / 2);
    expect(line({ x: 1, y: 1 }, { x: 1, y: 1 }).angle).toBe(0);
    expect(line({ x: 1, y: 1 }, { x: 1, y: 1 }, 3 * Math.PI).angle).toBeCloseTo(Math.PI, 12);
  });

  it("is exact at both ends and linear in between", () => {
    const from = { x: 0.1, y: 0.7 };
    const to = { x: 0.3, y: 1.9 };
    const s = line(from, to);
    expect(pointOn(s, 0)).toEqual(from);
    expect(pointOn(s, 1)).toEqual(to);
    expectPoint(pointOn(s, 0.25), { x: 0.15, y: 1 });
  });
});

describe("arc", () => {
  it("has the exact length radius × |sweep|", () => {
    expect(arc({ x: 0, y: 0 }, 10, 0, Math.PI).length).toBe(10 * Math.PI);
    expect(arc({ x: 0, y: 0 }, 10, 1, -Math.PI / 3).length).toBe(10 * (Math.PI / 3));
    expect(arc({ x: 0, y: 0 }, 0, 0, Math.PI).length).toBe(0);
  });

  it("turns clockwise on screen for a positive sweep", () => {
    // From 12 o'clock, a quarter turn clockwise reaches 3 o'clock.
    const s = arc({ x: 50, y: 50 }, 10, -Math.PI / 2, Math.PI / 2);
    expectPoint(pointOn(s, 0), { x: 50, y: 40 });
    expectPoint(pointOn(s, 1), { x: 60, y: 50 });
    expectPoint(pointOn(s, 0.5), { x: 50 + 10 * Math.SQRT1_2, y: 50 - 10 * Math.SQRT1_2 });
  });

  it("heads along the tangent in the direction of travel", () => {
    const clockwise = arc({ x: 0, y: 0 }, 10, -Math.PI / 2, Math.PI);
    expect(angleOn(clockwise, 0)).toBeCloseTo(0, 12); // at 12 o'clock heading right
    expect(angleOn(clockwise, 0.5)).toBeCloseTo(Math.PI / 2, 12); // at 3 o'clock heading down
    const anticlockwise = arc({ x: 0, y: 0 }, 10, -Math.PI / 2, -Math.PI);
    expect(angleOn(anticlockwise, 0)).toBeCloseTo(Math.PI, 12); // at 12 o'clock heading left
    expect(angleOn(anticlockwise, 0.5)).toBeCloseTo(Math.PI / 2, 12); // at 9 o'clock heading down
  });
});

describe("normalizeAngle", () => {
  it("maps any angle into (-PI, PI]", () => {
    expect(normalizeAngle(Math.PI)).toBe(Math.PI);
    expect(normalizeAngle(-Math.PI)).toBe(Math.PI);
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle((3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2, 12);
    expect(normalizeAngle((-3 * Math.PI) / 2)).toBeCloseTo(Math.PI / 2, 12);
    for (let a = -20; a <= 20; a += 0.37) {
      const n = normalizeAngle(a);
      expect(n).toBeGreaterThan(-Math.PI);
      expect(n).toBeLessThanOrEqual(Math.PI);
      expect(Math.cos(n - a)).toBeCloseTo(1, 9);
    }
  });
});

describe("extremes and boundsOf", () => {
  it("include the points where an arc passes 3, 6, 9 or 12 o'clock", () => {
    // 1:30 to 4:30, clockwise: passes 3 o'clock only.
    const s = arc({ x: 0, y: 0 }, 10, -Math.PI / 4, Math.PI / 2);
    const box = boundsOf(extremes(s));
    expect(box.x).toBeCloseTo(10 * Math.SQRT1_2, 9);
    expect(box.width).toBeCloseTo(10 - 10 * Math.SQRT1_2, 9);
    expect(box.y).toBeCloseTo(-10 * Math.SQRT1_2, 9);
    expect(box.height).toBeCloseTo(20 * Math.SQRT1_2, 9);
  });

  it("follow the direction of travel", () => {
    // 1:30 back to 4:30 the long way round, anticlockwise: passes 12, 9 and 6 but not 3.
    const s = arc({ x: 0, y: 0 }, 10, -Math.PI / 4, -(3 * Math.PI) / 2);
    const box = boundsOf(extremes(s));
    expect(box.x).toBeCloseTo(-10, 9);
    expect(box.x + box.width).toBeCloseTo(10 * Math.SQRT1_2, 9);
    expect(box.y).toBeCloseTo(-10, 9);
    expect(box.y + box.height).toBeCloseTo(10, 9);
  });

  it("cover the whole circle for a full turn", () => {
    const box = boundsOf(extremes(arc({ x: 5, y: 5 }, 2, 0.3, TAU)));
    expect(box.x).toBeCloseTo(3, 9);
    expect(box.y).toBeCloseTo(3, 9);
    expect(box.width).toBeCloseTo(4, 9);
    expect(box.height).toBeCloseTo(4, 9);
  });

  it("bound straight segments by their ends", () => {
    expect(boundsOf(extremes(line({ x: 4, y: 1 }, { x: 1, y: 3 })))).toEqual({ x: 1, y: 1, width: 3, height: 2 });
  });
});
