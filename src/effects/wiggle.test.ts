import type { MarkGeometry, Matrix, Point } from "../core";
import { describe as build, matrix } from "../core";
import { play, testContext, type TestContext } from "../core/testing";
import { wiggle } from "./wiggle";

const bar = (width: number, more: Partial<Parameters<typeof build.bar>[0]> = {}): MarkGeometry =>
  build.bar({ key: "Okafor", series: "goals", x: 0, y: 0, width, height: 20, baseline: "left", ...more });

// The marks from conformance.test.ts.
const marks: Record<string, MarkGeometry> = {
  bar: bar(200, { radius: 4 }),
  "negative bar": build.bar({ key: "n", series: "goals", x: 0, y: 0, width: 120, height: 20, baseline: "right" }),
  column: build.bar({ key: "c", series: "goals", x: 0, y: 0, width: 20, height: 150, baseline: "bottom" }),
  stacked: bar(222, { series: undefined, gap: 2, segments: [{ series: "goals", size: 160 }, { series: "assists", size: 62 }] }),
  "short bar": bar(6),
  slice: build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0.3, end: 2.4 }),
  line: build.line({ key: "goals", series: "goals", points: [{ x: 0, y: 100 }, { x: 80, y: 60 }, { x: 160, y: 90 }, { x: 240, y: 20 }], width: 2 }),
  point: build.point({ key: "p", x: 10, y: 10, r: 3 })
};

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The farthest any outline point is from where the chart drew it, under the mark's current transform. */
function moved(ctx: TestContext, mark: MarkGeometry): number {
  const transform = ctx.mark.style.transform ?? IDENTITY;
  return Math.max(...mark.outline.sample(64).map((point) => distance(matrix.apply(transform, point), point)));
}

/** Runs a wiggle to the end a frame at a time, returning how far the outline moved at each frame. */
function frames(mark: MarkGeometry, swing?: number, frame = 5): { ctx: TestContext; moves: number[] } {
  const ctx = testContext();
  void wiggle(swing === undefined ? {} : { swing }).run(mark, ctx);
  const moves = [moved(ctx, mark)];
  for (let t = 0; t < 450; t += frame) {
    ctx.clock.advance(frame);
    moves.push(moved(ctx, mark));
  }
  return { ctx, moves };
}

/** The angle a transform turns by, in radians. */
const angleOf = (m: Matrix): number => Math.atan2(m[1], m[0]);

describe("wiggle", () => {
  describe("never moves any part of the mark more than swing px", () => {
    for (const [name, mark] of Object.entries(marks)) {
      for (const swing of [3, 1]) {
        it(`on a ${name}, swing ${swing}`, () => {
          const { moves } = frames(mark, swing);
          for (const move of moves) expect(move).toBeLessThanOrEqual(swing + 0.01);
          expect(Math.max(...moves)).toBeGreaterThan(0);
        });
      }
    }
  });

  it("moves the far end the whole swing at the first peak, a sixth of the way through", () => {
    for (const name of ["bar", "negative bar", "column", "stacked", "short bar", "slice", "line"]) {
      const { moves } = frames(marks[name]!, 3);
      const peak = moves.indexOf(Math.max(...moves));
      expect(peak * 5).toBe(75);
      expect(moves[peak]).toBeCloseTo(3, 6);
    }
  });

  it("rocks in three half-swings, each smaller than the last, alternating sides", () => {
    const ctx = testContext();
    void wiggle().run(marks.bar!, ctx);
    const angles: number[] = [];
    for (let t = 0; t < 450; t += 5) {
      ctx.clock.advance(5);
      angles.push(ctx.mark.style.transform ? angleOf(ctx.mark.style.transform) : 0);
    }
    // Peaks at 75, 225 and 375 ms: the middle of each 150 ms half-swing.
    const first = angles[75 / 5 - 1]!;
    const second = angles[225 / 5 - 1]!;
    const third = angles[375 / 5 - 1]!;
    expect(first).toBeGreaterThan(0);
    expect(second).toBeCloseTo(-first / 2, 9);
    expect(third).toBeCloseTo(first / 4, 9);
    // The exact cap for a 3 px swing at the bar's far corner.
    const reach = Math.max(...marks.bar!.outline.sample(64).map((point) => distance(point, marks.bar!.pivot)));
    expect(first).toBeCloseTo(2 * Math.asin(3 / (2 * reach)), 9);
  });

  it("rotates a donut slice about the donut's centre, capped by its outer radius", () => {
    const slice = marks.slice!;
    const ctx = testContext();
    void wiggle().run(slice, ctx);
    ctx.clock.advance(75);
    const transform = ctx.mark.style.transform!;
    expect(transform).toBeDefined();
    const centre = matrix.apply(transform, { x: 150, y: 150 });
    expect(centre.x).toBeCloseTo(150, 9);
    expect(centre.y).toBeCloseTo(150, 9);
    // The outer edge moves the full 3 px; the walk, at mid-radius, moves less.
    expect(2 * 116 * Math.sin(angleOf(transform) / 2)).toBeCloseTo(3, 6);
    const middle = slice.path(0.5);
    expect(distance(matrix.apply(transform, middle), middle)).toBeLessThan(2.5);
  });

  it("follows the geometry, rocking about the pivot as it is now", () => {
    const ctx = testContext();
    void wiggle().run(marks.bar!, ctx);
    ctx.clock.advance(50);
    const moved = bar(200, { y: 40, radius: 4 });
    ctx.change(moved);
    const pivot = matrix.apply(ctx.mark.style.transform!, moved.pivot);
    expect(pivot.x).toBeCloseTo(moved.pivot.x, 9);
    expect(pivot.y).toBeCloseTo(moved.pivot.y, 9);
  });

  it("leaves a mark with no reach alone", async () => {
    const ctx = testContext();
    const running = wiggle().run(build.point({ key: "tiny", x: 5, y: 5, r: 0.2 }), ctx);
    for (let t = 0; t < 450; t += 15) {
      ctx.clock.advance(15);
      expect(ctx.mark.style.transform).toBeUndefined();
    }
    await play(ctx.clock, running);
  });

  it("never turns more than 15°, so a small mark nods rather than spins", () => {
    // A 3 px dot about its centre: 3 px of movement would allow 60°.
    const ctx = testContext();
    void wiggle().run(build.point({ key: "dot", x: 0, y: 0, r: 3 }), ctx);
    ctx.clock.advance(75);
    expect(angleOf(ctx.mark.style.transform!)).toBeCloseTo(Math.PI / 12, 9);
  });

  it("takes 450 ms with effect timing: 157.5 ms in analysis, none when motion is off", async () => {
    const presentation = testContext();
    expect(await play(presentation.clock, wiggle().run(marks.bar!, presentation), { frame: 10 })).toBe(450);
    const analysis = testContext({ mode: "analysis" });
    expect(await play(analysis.clock, wiggle().run(marks.bar!, analysis), { frame: 2.5 })).toBe(157.5);

    const off = testContext({ mode: "off" });
    const running = wiggle().run(marks.bar!, off);
    expect(off.clock.idle).toBe(true);
    await running;
    expect(off.mark.style).toEqual({});
  });

  it("ends with no transform, after a full run and as its end state", async () => {
    const ctx = testContext();
    await play(ctx.clock, wiggle().run(marks.column!, ctx));
    expect(ctx.mark.style).toEqual({});
    const ended = testContext();
    wiggle().end(marks.column!, ended);
    expect(ended.mark.calls).toEqual([]);
    expect(ended.layer.drawn).toEqual([]);
  });

  it("does nothing when the run is already aborted", async () => {
    const ctx = testContext();
    ctx.abort();
    await wiggle().run(marks.bar!, ctx);
    expect(ctx.mark.calls).toEqual([]);
  });

  it("checks its options when it's made", () => {
    for (const swing of [0, -1, 3.5, Number.NaN, Infinity]) {
      expect(() => wiggle({ swing })).toThrow(RangeError);
    }
    expect(() => wiggle({ swing: 4 })).toThrow(/wiggle: swing must be more than 0 and at most 3 px, got 4/);
    expect(() => wiggle({ swing: "2" as unknown as number })).toThrow(RangeError);
    expect(() => wiggle({ swing: 3 })).not.toThrow();
    expect(() => wiggle({ swing: 0.1 })).not.toThrow();
  });
});
