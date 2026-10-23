import { describe as build, easeInOutCubic, type MarkGeometry, type Point } from "../core";
import { flush, measurePath, play, testContext, type TestContext, type TestContextOptions } from "../core/testing";
import { fixturePairs, fixtures } from "../testing/fixtures";
import { morph, type MorphAlign } from "./morph";

type Context = TestContext & { readonly start: number };

const context = (start = 0, options: TestContextOptions = {}): Context => ({ ...testContext(options), start });

const { slice, column, bar, line } = fixtures;
/** The fixture column: x 0 to 20, its top at y 0, its baseline at y 150. */
const TOP = 0;
const LEFT = 0;
const quarter = 160 / 4;

/** A run's picture before its first frame, as checkTransition reads it. */
async function opening(from: MarkGeometry, to: MarkGeometry, start: number, align?: MorphAlign) {
  const ctx = context(start);
  void morph({ align }).run(from, to, ctx);
  await flush();
  return ctx.layer.picture();
}

/** What end() draws. */
function ended(from: MarkGeometry, to: MarkGeometry, align?: MorphAlign) {
  const ctx = context();
  morph({ align }).end(from, to, ctx);
  return ctx.layer.picture();
}

/** The points of a closed path, without the one Z returns to. */
const corners = (d: string): readonly Point[] => measurePath(d).points.slice(0, -1);

const near = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < 0.002 && Math.abs(a.y - b.y) < 0.002;
/** Where a point halfway from `from` lands: halfway's partner. */
const partner = (from: Point, halfway: Point): Point => ({ x: 2 * halfway.x - from.x, y: 2 * halfway.y - from.y });

describe("morph", () => {
  it("is a transition effect, and checks its options", () => {
    expect(morph().kind).toBe("transition");
    expect(() => morph({ points: 4, align: "drop" })).not.toThrow();
    for (const points of [0, 6, -4, 2.5, Number.NaN, "160"]) expect(() => morph({ points: points as number })).toThrow(RangeError);
    expect(() => morph({ points: 6 })).toThrow("morph: points must be a whole multiple of 4, got 6.");
    expect(() => morph({ align: "flip" as MorphAlign })).toThrow('morph: align must be "unroll" or "drop", got "flip".');
  });

  describe("two closed outlines", () => {
    it("draws one filled path in the mark's colour, from the first outline to the second, over 950 ms", async () => {
      const ctx = context();
      const run = morph().run(slice, column, ctx);
      expect(ctx.layer.picture()).toEqual([{ kind: "path", d: slice.outline.d, paint: { fill: "mark" } }]);
      const elapsed = await play(ctx.clock, run);
      expect(elapsed).toBeGreaterThanOrEqual(950);
      expect(elapsed).toBeLessThan(950 + 16);
      expect(ctx.layer.picture()).toEqual([{ kind: "path", d: column.outline.d, paint: { fill: "mark" } }]);
      expect(ctx.layer.calls.filter((call) => call.op === "path")).toHaveLength(1);
    });

    it("moves each point in a straight line to its partner, eased in and out", async () => {
      const ctx = context();
      void morph({ points: 8 }).run(slice, column, ctx);
      const a = slice.outline.sample(8);
      const b = column.outline.sample(8);
      for (const ms of [190, 285, 475]) {
        ctx.clock.advance(ms - ctx.clock.now());
        const p = easeInOutCubic(ms / 950);
        const drawn = corners((ctx.layer.picture()[0] as { d: string }).d);
        expect(drawn).toHaveLength(8);
        drawn.forEach((point, i) => expect(near(point, { x: a[i]!.x + (b[i]!.x - a[i]!.x) * p, y: a[i]!.y + (b[i]!.y - a[i]!.y) * p })).toBe(true));
      }
    });

    it("samples each outline at `points`", async () => {
      const [picture] = await opening(slice, column, 0.5);
      expect(corners((picture as { d: string }).d)).toHaveLength(160);
      const ctx = context(0.5);
      void morph({ points: 12 }).run(slice, column, ctx);
      expect(corners((ctx.layer.picture()[0] as { d: string }).d)).toHaveLength(12);
    });

    it('"unroll" matches each side with the same side: a slice\'s outer arc goes to a column\'s left side', async () => {
      const [halfway] = await opening(slice, column, 0.5, "unroll");
      const points = corners((halfway as { d: string }).d);
      const outer = slice.outline.sample(160);
      for (let i = 0; i <= quarter; i++) expect(partner(outer[i]!, points[i]!).x).toBeCloseTo(LEFT, 2);
    });

    it('matches as "unroll" when align is left out, the default picked in the morph demo', async () => {
      const ctx = context(0.5);
      void morph().run(slice, column, ctx);
      await flush();
      expect(ctx.layer.picture()).toEqual(await opening(slice, column, 0.5, "unroll"));
      expect(ctx.layer.picture()).not.toEqual(await opening(slice, column, 0.5, "drop"));
    });

    it('"drop" turns the matching by a side: a slice\'s outer arc goes to a column\'s top', async () => {
      const [halfway] = await opening(slice, column, 0.5, "drop");
      const points = corners((halfway as { d: string }).d);
      const outer = slice.outline.sample(160);
      for (let i = 0; i <= quarter; i++) expect(partner(outer[i]!, points[i]!).y).toBeCloseTo(TOP, 2);
      // From the column's top-left corner to its top-right, as the arc runs clockwise.
      expect(near(partner(outer[0]!, points[0]!), { x: 0, y: 0 })).toBe(true);
      expect(near(partner(outer[quarter]!, points[quarter]!), { x: 20, y: 0 })).toBe(true);
    });

    it('"drop" pairs a slice\'s outer arc with a column\'s top whichever is from', async () => {
      for (const p of [0.25, 0.5, 0.75]) {
        expect(await opening(column, slice, 1 - p, "drop")).toEqual(await opening(slice, column, p, "drop"));
      }
      // Turning the other way would twist: the pairing must differ from unroll's, both ways.
      expect(await opening(column, slice, 0.5, "drop")).not.toEqual(await opening(column, slice, 0.5, "unroll"));
    });

    it('"drop" goes by geometry: a pie slice goes round its pivot, so it drops onto a column too', async () => {
      const pie = build.arc({ key: "pie", cx: 150, cy: 150, inner: 0, outer: 116, start: 0.3, end: 2.4 });
      const [halfway] = await opening(column, pie, 0.5, "drop");
      const points = corners((halfway as { d: string }).d);
      const outer = pie.outline.sample(160);
      for (let i = 0; i <= quarter; i++) expect(partner(outer[i]!, points[i]!).y).toBeCloseTo(TOP, 2);
    });

    it('"drop" pairs as "unroll" does between two marks of the same kind', async () => {
      const [a, b] = fixturePairs["two slices"];
      expect(await opening(a, b, 0.4, "drop")).toEqual(await opening(a, b, 0.4, "unroll"));
      expect(await opening(bar, column, 0.4, "drop")).toEqual(await opening(bar, column, 0.4, "unroll"));
      expect(await opening(fixtures.point, column, 0.4, "drop")).toEqual(await opening(fixtures.point, column, 0.4, "unroll"));
    });
  });

  describe("two open outlines", () => {
    const thin = build.line({ key: "goals", points: [{ x: 0, y: 100 }, { x: 80, y: 60 }, { x: 160, y: 90 }], width: 2 });
    const thick = build.line({ key: "goals", points: [{ x: 0, y: 40 }, { x: 200, y: 40 }], width: 6 });

    it("draws one stroke, sampled along both lines, its width moving between their thicknesses", async () => {
      const ctx = context();
      const run = morph({ points: 8 }).run(thin, thick, ctx);
      expect(ctx.layer.picture()).toEqual([{ kind: "path", d: thin.outline.d, paint: { stroke: "mark", width: 2 } }]);
      ctx.clock.advance(475);
      const a = thin.outline.sample(8);
      const b = thick.outline.sample(8);
      const [halfway] = ctx.layer.picture() as { d: string; paint: { width: number } }[];
      expect(halfway!.paint).toEqual({ stroke: "mark", width: 4 });
      expect(halfway!.d).not.toContain("Z");
      measurePath(halfway!.d).points.forEach((point, i) => expect(near(point, { x: (a[i]!.x + b[i]!.x) / 2, y: (a[i]!.y + b[i]!.y) / 2 })).toBe(true));
      await play(ctx.clock, run);
      expect(ctx.layer.picture()).toEqual([{ kind: "path", d: thick.outline.d, paint: { stroke: "mark", width: 6 } }]);
    });
  });

  describe("a closed and an open outline", () => {
    it("crossfade, the area below the stroke whichever is leaving", async () => {
      const area = (opacity?: number) => ({ kind: "path", d: slice.outline.d, paint: { fill: "mark", ...(opacity === undefined ? {} : { opacity }) } });
      const stroke = (opacity?: number) => ({ kind: "path", d: line.outline.d, paint: { stroke: "mark", width: 2, ...(opacity === undefined ? {} : { opacity }) } });
      expect(await opening(slice, line, 0.25)).toEqual([area(0.75), stroke(0.25)]);
      expect(await opening(line, slice, 0.75)).toEqual([area(0.75), stroke(0.25)]);

      const ctx = context();
      const run = morph().run(slice, line, ctx);
      expect(ctx.layer.picture()).toEqual([area(1), stroke(0)]);
      await play(ctx.clock, run);
      expect(ctx.layer.picture()).toEqual([stroke()]);
      expect(ended(slice, line)).toEqual([stroke()]);
      expect(ended(line, slice)).toEqual([area()]);
    });
  });

  describe("every fixture pair", () => {
    it.each(["unroll", "drop"] as const)("ends as end() draws, both ways, with %s: the target's own outline", async (align) => {
      for (const [a, b] of Object.values(fixturePairs)) {
        for (const [from, to] of [
          [a, b],
          [b, a]
        ]) {
          const ctx = context();
          await play(ctx.clock, morph({ align }).run(from!, to!, ctx));
          const end = ended(from!, to!, align);
          expect(ctx.layer.picture()).toEqual(end);
          expect(end.map((item) => (item as { d: string }).d)).toEqual([to!.outline.d]);
        }
      }
    });
  });

  describe("starting part way", () => {
    it("begins with the shapes where a full run has them at that eased progress", async () => {
      const ctx = context();
      void morph({ align: "drop" }).run(slice, column, ctx);
      ctx.clock.advance(475);
      // Half the time is half the shape: easeInOutCubic(0.5) is 0.5.
      expect(ctx.layer.picture()).toEqual(await opening(slice, column, 0.5, "drop"));
    });

    it("takes the rest of the time a full run would, and ends where a full run does", async () => {
      const duration = async (start: number, mode: TestContextOptions["mode"] = "presentation") => {
        const ctx = context(start, { mode });
        const elapsed = await play(ctx.clock, morph().run(slice, column, ctx));
        expect(ctx.layer.picture()).toEqual(ended(slice, column));
        return elapsed;
      };
      const within = (elapsed: number, ms: number) => {
        expect(elapsed).toBeGreaterThanOrEqual(ms);
        expect(elapsed).toBeLessThan(ms + 16);
      };
      within(await duration(0.5), 475);
      // 0.25 of the shape is 0.397 of the time.
      within(await duration(0.25), 950 * (1 - Math.cbrt(0.25 / 4)));
      within(await duration(0.9), 950 * (Math.cbrt(2 * 0.1) / 2));
      // Analysis caps the whole run at 200 ms, so half of it takes 100.
      within(await duration(0, "analysis"), 200);
      within(await duration(0.5, "analysis"), 100);
    });

    it("retraces: a run back from 1 - p begins where the run forward was at p, with no jump or twist", async () => {
      for (const align of ["unroll", "drop"] as const) {
        for (const [a, b] of [
          [slice, column],
          [bar, column],
          [slice, line]
        ]) {
          const ctx = context();
          void morph({ align }).run(a!, b!, ctx);
          for (let i = 0; i < 19; i++) ctx.clock.advance(16);
          const p = easeInOutCubic(ctx.clock.now() / 950);
          expect(await opening(b!, a!, 1 - p, align)).toEqual(ctx.layer.picture());
        }
      }
    });

    it("draws the end at once from start: 1", async () => {
      const ctx = context(1);
      const run = morph().run(slice, column, ctx);
      expect(ctx.clock.idle).toBe(true);
      await run;
      expect(ctx.layer.picture()).toEqual(ended(slice, column));
    });
  });

  describe("motion", () => {
    it("with motion off, nothing waits for a frame", async () => {
      const ctx = context(0.3, { mode: "off" });
      const run = morph().run(slice, column, ctx);
      expect(ctx.clock.idle).toBe(true);
      expect(ctx.layer.picture()).toEqual(ended(slice, column));
      await run;
    });

    it("jumps to the end when motion turns off mid-run", async () => {
      const ctx = context();
      const run = morph().run(slice, column, ctx);
      ctx.clock.advance(300);
      ctx.motion.setMode("off");
      ctx.clock.advance(16);
      await run;
      expect(ctx.clock.idle).toBe(true);
      expect(ctx.layer.picture()).toEqual(ended(slice, column));
    });

    it("an abort leaves nothing behind", async () => {
      const ctx = context();
      let settled = false;
      void morph().run(slice, column, ctx).then(() => (settled = true));
      ctx.clock.advance(300);
      ctx.abort();
      await flush();
      expect(settled).toBe(true);
      expect(ctx.clock.idle).toBe(true);
      const calls = ctx.layer.calls.length;
      ctx.clear();
      ctx.clock.advance(48);
      expect(ctx.layer.drawn).toEqual([]);
      expect(ctx.layer.calls).toHaveLength(calls + 1);
    });

    it("draws nothing when aborted before it starts", async () => {
      const ctx = context();
      ctx.abort();
      await morph().run(slice, column, ctx);
      expect(ctx.layer.calls).toEqual([]);
    });
  });
});
