import type { Point } from "../../contracts/geometry";
import { offset } from "../matrix";
import { describe as build, type Baseline } from "./index";

const expectPoint = (actual: Point | undefined, expected: Point): void => {
  expect(actual).toBeDefined();
  expect(actual!.x).toBeCloseTo(expected.x, 9);
  expect(actual!.y).toBeCloseTo(expected.y, 9);
};
/** Shoelace sum: positive means clockwise on screen, where y points down. */
const signedArea = (points: readonly Point[]): number =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + (p.x * q.y - q.x * p.y) / 2;
  }, 0);

const bar = { key: "Okafor", x: 10, y: 20, width: 100, height: 20 };
const column = { key: "Saved", x: 10, y: 20, width: 20, height: 100 };

describe("describe.bar", () => {
  const cases: {
    baseline: Baseline;
    rect: typeof bar;
    start: Point;
    end: Point;
    angle: number;
    up: Point;
    corners: Point[];
    d: string;
  }[] = [
    {
      baseline: "left",
      rect: bar,
      start: { x: 10, y: 30 },
      end: { x: 110, y: 30 },
      angle: 0,
      up: { x: 60, y: 20 }, // screen up
      corners: [
        { x: 10, y: 20 },
        { x: 110, y: 20 },
        { x: 110, y: 40 },
        { x: 10, y: 40 }
      ],
      d: "M10,20L110,20L110,40L10,40Z"
    },
    {
      baseline: "right",
      rect: bar,
      start: { x: 110, y: 30 },
      end: { x: 10, y: 30 },
      angle: Math.PI,
      up: { x: 60, y: 40 }, // a negative bar's up side is screen down
      corners: [
        { x: 110, y: 40 },
        { x: 10, y: 40 },
        { x: 10, y: 20 },
        { x: 110, y: 20 }
      ],
      d: "M110,40L10,40L10,20L110,20Z"
    },
    {
      baseline: "bottom",
      rect: column,
      start: { x: 20, y: 120 },
      end: { x: 20, y: 20 },
      angle: -Math.PI / 2,
      up: { x: 10, y: 70 }, // a column's up side is screen left
      corners: [
        { x: 10, y: 120 },
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 120 }
      ],
      d: "M10,120L10,20L30,20L30,120Z"
    },
    {
      baseline: "top",
      rect: column,
      start: { x: 20, y: 20 },
      end: { x: 20, y: 120 },
      angle: Math.PI / 2,
      up: { x: 30, y: 70 },
      corners: [
        { x: 30, y: 20 },
        { x: 30, y: 120 },
        { x: 10, y: 120 },
        { x: 10, y: 20 }
      ],
      d: "M30,20L30,120L10,120L10,20Z"
    }
  ];

  for (const c of cases) {
    describe(`from the ${c.baseline}`, () => {
      const mark = () => build.bar({ ...c.rect, baseline: c.baseline });

      it("walks the centre line from the baseline to the tip", () => {
        const m = mark();
        expect(m.start).toEqual(c.start);
        expect(m.end).toEqual(c.end);
        expect(m.length).toBe(100);
        expect(m.thickness).toBe(20);
        expectPoint(m.path(0.25), { x: c.start.x * 0.75 + c.end.x * 0.25, y: c.start.y * 0.75 + c.end.y * 0.25 });
        expect(m.angle(0)).toBe(c.angle);
        expect(m.angle(1)).toBe(c.angle);
        expect(m.slice(0, 1)).toBe(`M${c.start.x},${c.start.y}L${c.end.x},${c.end.y}`);
      });

      it("puts the up side at angle - PI/2", () => {
        const m = mark();
        expectPoint(offset(m.center, m.angle(0.5) - Math.PI / 2, m.thickness / 2), c.up);
      });

      it("has its pivot on the baseline and its bounds and centre on the rectangle", () => {
        const m = mark();
        expect(m.pivot).toEqual(c.start);
        expectPoint(m.center, { x: c.rect.x + c.rect.width / 2, y: c.rect.y + c.rect.height / 2 });
        expect(m.bounds).toEqual({ x: c.rect.x, y: c.rect.y, width: c.rect.width, height: c.rect.height });
      });

      it("outlines the rectangle clockwise from the start-left corner", () => {
        const m = mark();
        expect(m.outline.closed).toBe(true);
        expect(m.outline.d).toBe(c.d);
        expect(m.outline.sample(4)).toEqual(c.corners);
        expect(signedArea(m.outline.sample(40))).toBeCloseTo(2000, 6);
      });

      it("keeps clockwise winding with a rounded tip", () => {
        const points = build.bar({ ...c.rect, baseline: c.baseline, radius: 6 }).outline.sample(400);
        expect(signedArea(points)).toBeGreaterThan(0);
      });
    });
  }

  describe("rounded tip", () => {
    it("rounds only the tip corners", () => {
      const m = build.bar({ ...bar, baseline: "left", radius: 4 });
      expect(m.outline.d).toBe("M10,20L106,20A4,4 0 0 1 110,24L110,36A4,4 0 0 1 106,40L10,40Z");
      // The end side is the whole tip, rounding included.
      expect(m.outline.sample(4)).toEqual([
        { x: 10, y: 20 },
        { x: 106, y: 20 },
        { x: 106, y: 40 },
        { x: 10, y: 40 }
      ]);
    });

    it("rounds a column's tip the same way", () => {
      const m = build.bar({ ...column, baseline: "bottom", radius: 4 });
      expect(m.outline.d).toBe("M10,120L10,24A4,4 0 0 1 14,20L26,20A4,4 0 0 1 30,24L30,120Z");
    });

    it("caps the radius at half the thickness and at the length", () => {
      expect(build.bar({ ...bar, baseline: "left", radius: 50 }).outline.d).toBe("M10,20L100,20A10,10 0 0 1 110,30A10,10 0 0 1 100,40L10,40Z");
      expect(build.bar({ ...bar, width: 3, baseline: "left", radius: 4 }).outline.d).toBe("M10,20A3,3 0 0 1 13,23L13,37A3,3 0 0 1 10,40Z");
    });
  });

  describe("segments", () => {
    const stacked = (sizes: Record<string, number>, extra: { width?: number; radius?: number; gap?: number } = {}) =>
      build.bar({
        key: "Okafor",
        x: 0,
        y: 0,
        width: extra.width ?? Object.values(sizes).reduce((a, b) => a + b, 0),
        height: 20,
        baseline: "left",
        radius: extra.radius ?? 4,
        gap: extra.gap ?? 2,
        segments: Object.entries(sizes).map(([series, size]) => ({ series, size }))
      });

    it("gives a plain bar one segment named after its series", () => {
      const m = build.bar({ ...bar, series: "goals", baseline: "left", radius: 4 });
      expect(m.series).toBe("goals");
      expect(m.segments).toHaveLength(1);
      const [only] = m.segments!;
      expect(only!.key).toBe("Okafor/goals");
      expect(only!.series).toBe("goals");
      expect(only!.start).toEqual(m.start);
      expect(only!.end).toEqual(m.end);
      expect(only!.outline.d).toBe(m.outline.d);
    });

    it("keys an unnamed segment by its index", () => {
      const m = build.bar({ ...bar, baseline: "left" });
      expect(m).not.toHaveProperty("series");
      expect(m.segments!.map((s) => s.key)).toEqual(["Okafor/0"]);
      expect(m.segments![0]).not.toHaveProperty("series");
    });

    it("orders segments from the baseline, with the gap taken from the later one", () => {
      const m = stacked({ goals: 60, assists: 40 });
      const [goals, assists] = m.segments!;
      expect(m.segments!.map((s) => [s.key, s.series])).toEqual([
        ["Okafor/goals", "goals"],
        ["Okafor/assists", "assists"]
      ]);
      expect(goals!.start).toEqual({ x: 0, y: 10 });
      expect(goals!.end).toEqual({ x: 60, y: 10 });
      expect(goals!.length).toBe(60);
      expect(goals!.outline.d).toBe("M0,0L60,0L60,20L0,20Z");
      expect(goals!.bounds).toEqual({ x: 0, y: 0, width: 60, height: 20 });
      expect(goals!.pivot).toEqual(goals!.start);
      expect(assists!.start).toEqual({ x: 62, y: 10 });
      expect(assists!.end).toEqual({ x: 100, y: 10 });
      expect(assists!.length).toBe(38);
      expect(assists!.outline.d).toBe("M62,0L96,0A4,4 0 0 1 100,4L100,16A4,4 0 0 1 96,20L62,20Z");
      expect(assists!.thickness).toBe(20);
      expect(assists!.segments).toBeUndefined();
    });

    it("outlines the whole bar as one shape, gap included", () => {
      const m = stacked({ goals: 60, assists: 40 });
      expect(m.length).toBe(100);
      expect(m.outline.d).toBe("M0,0L96,0A4,4 0 0 1 100,4L100,16A4,4 0 0 1 96,20L0,20Z");
      expect(m.bounds).toEqual({ x: 0, y: 0, width: 100, height: 20 });
    });

    it("gives a zero value a segment with no length, and the tip rounding to the segment before", () => {
      const m = stacked({ goals: 60, assists: 0 });
      const [goals, assists] = m.segments!;
      expect(assists!.length).toBe(0);
      expect(assists!.start).toEqual({ x: 60, y: 10 });
      expect(assists!.end).toEqual({ x: 60, y: 10 });
      expect(goals!.outline.d).toBe("M0,0L56,0A4,4 0 0 1 60,4L60,16A4,4 0 0 1 56,20L0,20Z");
    });

    it("fades the tip rounding as a later segment grows, so nothing pops", () => {
      const radii = [0, 1, 2, 3, 4, 5].map((assists) => {
        const [goals] = stacked({ goals: 60, assists }).segments!;
        return 60 - goals!.outline.sample(4)[1]!.x;
      });
      radii.forEach((r, i) => expect(r).toBeCloseTo([4, 3, 2, 1, 0, 0][i]!, 9));
    });

    it("never puts a gap before the first drawn segment, and shrinks it after a short one", () => {
      expect(stacked({ goals: 0, assists: 50 }).segments![1]!.start).toEqual({ x: 0, y: 10 });
      expect(stacked({ goals: 1, assists: 50 }).segments![1]!.start).toEqual({ x: 2, y: 10 });
      expect(stacked({ goals: 1, assists: 50 }).segments![1]!.length).toBe(49);
      expect(stacked({ goals: 10, assists: 1 }).segments![1]!.length).toBe(0);
    });

    it("cuts off segments past the tip", () => {
      const [goals, assists] = stacked({ goals: 30, assists: 40 }, { width: 50 }).segments!;
      expect(goals!.length).toBe(30);
      expect(assists!.end).toEqual({ x: 50, y: 10 });
      expect(assists!.length).toBe(18);
    });

    it("stacks columns upward from a bottom baseline", () => {
      const m = build.bar({
        key: "Okafor",
        x: 0,
        y: 0,
        width: 20,
        height: 100,
        baseline: "bottom",
        gap: 2,
        segments: [
          { series: "goals", size: 60 },
          { series: "assists", size: 40 }
        ]
      });
      const [goals, assists] = m.segments!;
      expect(goals!.start).toEqual({ x: 10, y: 100 });
      expect(goals!.end).toEqual({ x: 10, y: 40 });
      expect(goals!.bounds).toEqual({ x: 0, y: 40, width: 20, height: 60 });
      expect(assists!.start).toEqual({ x: 10, y: 38 });
      expect(assists!.end).toEqual({ x: 10, y: 0 });
    });

    it("accepts an empty stack", () => {
      expect(build.bar({ ...bar, baseline: "left", segments: [] }).segments).toEqual([]);
    });

    it("rejects a series listed twice", () => {
      expect(() =>
        build.bar({
          ...bar,
          baseline: "left",
          segments: [
            { series: "goals", size: 50 },
            { series: "goals", size: 50 }
          ]
        })
      ).toThrow(/"goals" appears twice/);
    });
  });

  describe("edge cases", () => {
    it("describes a zero-length bar", () => {
      const m = build.bar({ ...bar, width: 0, baseline: "left", radius: 4 });
      expect(m.length).toBe(0);
      expect(m.start).toEqual({ x: 10, y: 30 });
      expect(m.end).toEqual(m.start);
      expect(m.angle(0.5)).toBe(0);
      expect(m.slice(0, 1)).toBe("M10,30");
      expect(m.outline.d).toBe("M10,20L10,40Z");
      expect(m.outline.sample(4)).toEqual([
        { x: 10, y: 20 },
        { x: 10, y: 20 },
        { x: 10, y: 40 },
        { x: 10, y: 40 }
      ]);
    });

    it("keeps the exact rectangle it was given as its bounds", () => {
      const m = build.bar({ key: "a", x: 0.1, y: 0.7, width: 0.2, height: 0.3, baseline: "right" });
      expect(m.bounds).toEqual({ x: 0.1, y: 0.7, width: 0.2, height: 0.3 });
    });

    it("rejects bad input with a RangeError that names the field", () => {
      const ok = { ...bar, baseline: "left" as const };
      expect(() => build.bar({ ...ok, width: -1 })).toThrow(/width/);
      expect(() => build.bar({ ...ok, height: Number.NaN })).toThrow(/height/);
      expect(() => build.bar({ ...ok, x: Infinity })).toThrow(/x must be/);
      expect(() => build.bar({ ...ok, radius: -2 })).toThrow(/radius/);
      expect(() => build.bar({ ...ok, gap: -2 })).toThrow(/gap/);
      expect(() => build.bar({ ...ok, segments: [{ series: "goals", size: -5 }] })).toThrow(/segments\[0\]\.size/);
      expect(() => build.bar({ ...ok, baseline: "middle" as Baseline })).toThrow(RangeError);
      expect(() => build.bar({ ...ok, baseline: "constructor" as Baseline })).toThrow(RangeError);
    });
  });
});
