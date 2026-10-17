import { closedOutline, openOutline } from "./outline";
import { line } from "./segment";
import { createWalk } from "./walk";

// A 100 × 20 rectangle walked clockwise from its top-left corner.
const rectangle = () =>
  closedOutline([
    [line({ x: 0, y: 0 }, { x: 100, y: 0 })],
    [line({ x: 100, y: 0 }, { x: 100, y: 20 })],
    [line({ x: 100, y: 20 }, { x: 0, y: 20 })],
    [line({ x: 0, y: 20 }, { x: 0, y: 0 })]
  ]);

describe("closedOutline", () => {
  it("writes closed path data", () => {
    const outline = rectangle();
    expect(outline.closed).toBe(true);
    expect(outline.d).toBe("M0,0L100,0L100,20L0,20Z");
  });

  it("samples n/4 points per side, evenly along each side, corners first", () => {
    const points = rectangle().sample(16);
    expect(points).toHaveLength(16);
    expect(points.slice(0, 4)).toEqual([
      { x: 0, y: 0 },
      { x: 25, y: 0 },
      { x: 50, y: 0 },
      { x: 75, y: 0 }
    ]);
    expect(points.slice(4, 8)).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 5 },
      { x: 100, y: 10 },
      { x: 100, y: 15 }
    ]);
    expect(points[8]).toEqual({ x: 100, y: 20 });
    expect(points[12]).toEqual({ x: 0, y: 20 });
    expect(points[15]).toEqual({ x: 0, y: 5 });
  });

  it("returns nothing for n = 0", () => {
    expect(rectangle().sample(0)).toEqual([]);
  });

  it("rejects counts that aren't whole multiples of 4", () => {
    const outline = rectangle();
    for (const n of [6, -4, 2.5, Number.NaN, Infinity]) expect(() => outline.sample(n)).toThrow(RangeError);
  });
});

describe("openOutline", () => {
  const walk = createWalk([line({ x: 0, y: 0 }, { x: 10, y: 0 }), line({ x: 10, y: 0 }, { x: 10, y: 30 })]);

  it("is the stroke along the walk", () => {
    const outline = openOutline(walk);
    expect(outline.closed).toBe(false);
    expect(outline.d).toBe("M0,0L10,0L10,30");
  });

  it("samples n points from start to end inclusive, evenly by distance", () => {
    const outline = openOutline(walk);
    expect(outline.sample(5)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 10, y: 30 }
    ]);
    expect(outline.sample(1)).toEqual([{ x: 0, y: 0 }]);
    expect(outline.sample(0)).toEqual([]);
    expect(() => outline.sample(1.5)).toThrow(RangeError);
    expect(() => outline.sample(-1)).toThrow(RangeError);
  });
});
