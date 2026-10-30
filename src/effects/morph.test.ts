import { arc } from "d3-shape";
import { describe as build, easeInOutCubic, matrix, type MarkGeometry, type Point } from "../core";
import { boundsOf, extremes } from "../core/geometry";
import { flattenPath } from "../core/geometry/flatten";
import { parsePath } from "../core/geometry/path";
import { pointOn } from "../core/geometry/segment";
import { drawnInGaps, flush, measurePath, play, testContext, type TestContext, type TestContextOptions } from "../core/testing";
import type { Drawn, Picture } from "../core/testing/recording";
import { checkTransition } from "../testing/check";
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
const mix = (a: Point, b: Point, p: number): Point => ({ x: a.x * (1 - p) + b.x * p, y: a.y * (1 - p) + b.y * p });

/** Every frame of a full run, as drawn, with the eased progress it was drawn at. */
async function frames(from: MarkGeometry, to: MarkGeometry): Promise<{ readonly p: number; readonly drawn: readonly Drawn[] }[]> {
  const ctx = context();
  let settled = false;
  void morph()
    .run(from, to, ctx)
    .then(() => (settled = true));
  const out: { p: number; drawn: readonly Drawn[] }[] = [];
  await flush();
  for (let ms = 0; !settled; ms += 16) {
    out.push({ p: easeInOutCubic(Math.min(1, ms / 950)), drawn: ctx.layer.drawn });
    ctx.clock.advance(16);
    await flush();
  }
  out.push({ p: 1, drawn: ctx.layer.drawn });
  return out;
}

/** A path's opacity, 1 when it has none. */
const opacityOf = (item: Picture | Drawn): number => (item.kind === "path" ? (item.paint.opacity ?? 1) : 1);
const dOf = (item: Picture | Drawn): string => (item.kind === "path" ? item.d : "");

// Lines with gaps. `early` skips after its second value, and `smaller` is it drawn smaller, so its gap
// is at the same t. `other` skips after its second value too, in another season, so its gap is at
// about the same t, and the two overlap. `late` skips after its third value, so its gap is apart
// from early's, and `whole` is late with nothing missing.
const season = [{ x: 0, y: 100 }, { x: 80, y: 60 }, { x: 160, y: 90 }, { x: 240, y: 20 }, { x: 320, y: 50 }];
const another = [{ x: 0, y: 40 }, { x: 80, y: 80 }, { x: 160, y: 30 }, { x: 240, y: 70 }, { x: 320, y: 60 }];
const early = build.line({ key: "goals", series: "goals", points: season, breaks: [2], width: 2 });
const smaller = build.line({ key: "goals", series: "goals", points: season.map(({ x, y }) => ({ x: 0.8 * x + 20, y: 0.8 * y + 10 })), breaks: [2], width: 3 });
const other = build.line({ key: "goals", series: "goals", points: another, breaks: [2], width: 2 });
const late = build.line({ key: "goals", series: "goals", points: another, breaks: [3], width: 2 });
const whole = build.line({ key: "goals", series: "goals", points: another, width: 2 });
const gappedPairs: Readonly<Record<string, readonly [MarkGeometry, MarkGeometry]>> = {
  "two lines with the same gap": [early, smaller],
  "two lines whose gaps overlap": [early, other],
  "two lines with different gaps": [early, late],
  "a line with a gap and one without": [early, whole]
};

/** Where both marks have a gap, as [from, to] values of t. */
const sharedGaps = (a: MarkGeometry, b: MarkGeometry): [number, number][] =>
  (a.gaps ?? []).flatMap(([a0, a1]) => (b.gaps ?? []).flatMap(([b0, b1]): [number, number][] => (Math.min(a1, b1) > Math.max(a0, b0) ? [[Math.max(a0, b0), Math.min(a1, b1)]] : [])));

/**
 * The line part way, as far as drawnInGaps reads it: each t's point moved from `from`'s toward
 * `to`'s by p, with the gaps both have. Both walks run straight across those, so it does too.
 */
const partWay = (from: MarkGeometry, to: MarkGeometry, p: number): MarkGeometry =>
  ({ key: from.key, gaps: sharedGaps(from, to), path: (t: number) => mix(from.path(t), to.path(t), p) }) as unknown as MarkGeometry;

/**
 * Whether what's drawn at full strength, at p next to 0 (or 1), is `mark`, the line at that end: the
 * points of every path at more than half strength are on it where it has data, at a sample's t or
 * either line's gap's end, and every sample where it has data is one of them.
 */
function drawsAsLine(picture: readonly Picture[], mark: MarkGeometry, other: MarkGeometry): void {
  const inside = (t: number): boolean => (mark.gaps ?? []).some(([x, y]) => x < t && t < y);
  const ends = [...(mark.gaps ?? []), ...(other.gaps ?? [])].flat();
  const ts = [...Array.from({ length: 160 }, (_, i) => i / 159), ...ends].filter((t) => !inside(t));
  const close = (a: Point, b: Point): boolean => Math.hypot(a.x - b.x, a.y - b.y) < 0.05;
  const shown = picture.filter((item) => opacityOf(item) > 0.5).flatMap((item) => measurePath(dOf(item)).points);
  expect(shown.length).toBeGreaterThan(0);
  for (const point of shown) expect(ts.some((t) => close(point, mark.path(t))), `${point.x},${point.y}`).toBe(true);
  for (const t of ts) expect(shown.some((point) => close(point, mark.path(t))), `t ${t}`).toBe(true);
}

/** A D3 ring about (cx, cy): its outer edge, then its hole, the other way round. */
const ring = (key: string, cx: number, cy: number, inner: number, outer: number): MarkGeometry =>
  build.shape({ key, d: arc()({ innerRadius: inner, outerRadius: outer, startAngle: 0, endAngle: 2 * Math.PI })!, matrix: matrix.translate(cx, cy) });
const small = ring("goals", 100, 100, 40, 60);
const large = ring("xg", 300, 150, 70, 116);
/** A D3 arc with no inner radius: a disc, with no hole. */
const disc = ring("disc", 120, 110, 0, 60);
/** A square, clockwise on screen from its top left, and a square hole, the other way round. */
const square = (x: number, y: number, size: number): string => `M${x},${y}h${size}v${size}h${-size}Z`;
const squareHole = (x: number, y: number, size: number): string => `M${x},${y}v${size}h${size}v${-size}Z`;
/** A square with two holes, the smaller written first, and one with a hole between their sizes. */
const twoHoles = build.shape({ key: "a", d: square(0, 0, 200) + squareHole(20, 20, 30) + squareHole(80, 80, 100) });
const oneHole = build.shape({ key: "b", d: square(300, 0, 200) + squareHole(340, 40, 120) });
/** A ring and a slice of three quarters of it, whose bounds' middle is outside it (Codex on #122). */
const fullRing = ring("full", 0, 0, 60, 100);
const threeQuarters = build.arc({ key: "most", cx: 0, cy: 0, inner: 60, outer: 100, start: 0, end: 1.5 * Math.PI });
const holedPairs: Readonly<Record<string, readonly [MarkGeometry, MarkGeometry]>> = {
  "two rings": [small, large],
  "a ring and a disc": [small, disc],
  "a shape with two holes and one with one": [twoHoles, oneHole],
  "a ring and three quarters of it": [fullRing, threeQuarters]
};

/** Point k of `count` round a circle, clockwise on screen from its upper left. */
const round = (cx: number, cy: number, r: number, k: number, count: number): Point => {
  const angle = (-3 * Math.PI) / 4 + (2 * Math.PI * k) / count;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
};
/** The point at fraction u round a square's edge, clockwise on screen from its top left. */
const around = (x: number, y: number, size: number, u: number): Point => {
  const along = 4 * size * u;
  const side = Math.min(3, Math.floor(along / size));
  const s = along - side * size;
  return [{ x: x + s, y }, { x: x + size, y: y + s }, { x: x + size - s, y: y + size }, { x, y: y + size - s }][side]!;
};
/** The subpaths of path data, each as the points it moves through, without the one Z returns to. */
const subpaths = (d: string): Point[][] => (d.match(/M[^M]*/g) ?? []).map(corners).map((points) => [...points]);
/** Index k of a hole's written points: the hole is written the other way round from its upper left. */
const written = (j: number, count: number): number => (count - j) % count;

/**
 * The winding number of path data round a point, each arc taken in 32 straight pieces. A hole is
 * unfilled under both fill rules when it's 0, and filled area is filled under both when it's 1 or -1.
 */
function winding(d: string, at: Point): number {
  let w = 0;
  for (const subpath of flattenPath(parsePath(d))) {
    const loop: Point[] = [subpath.start];
    for (const segment of subpath.segments) for (let i = 1; i <= 32; i++) loop.push(pointOn(segment, i / 32));
    loop.forEach((a, i) => {
      const b = loop[(i + 1) % loop.length]!;
      const side = (b.x - a.x) * (at.y - a.y) - (at.x - a.x) * (b.y - a.y);
      if (a.y <= at.y && b.y > at.y && side > 0) w++;
      else if (a.y > at.y && b.y <= at.y && side < 0) w--;
    });
  }
  return w;
}

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

  describe("two closed outlines with holes", () => {
    const close = (a: Point, b: Point): boolean => Math.hypot(a.x - b.x, a.y - b.y) < 0.005;

    it("morphs each hole to its partner, each point in a straight line, written the other way round from the outside", async () => {
      for (const p of [0.3, 0.75]) {
        const [outside, hole, ...more] = subpaths(dOf((await opening(small, large, p))[0]!));
        expect(more).toEqual([]);
        const a = small.outline.sample(160);
        const b = large.outline.sample(160);
        outside!.forEach((point, i) => expect(near(point, mix(a[i]!, b[i]!, p))).toBe(true));
        // A quarter of the outside's points, from the upper left, anticlockwise.
        expect(hole).toHaveLength(40);
        hole!.forEach((point, j) => {
          const k = written(j, 40);
          expect(close(point, mix(round(100, 100, 40, k, 40), round(300, 150, 70, k, 40), p)), `point ${j}`).toBe(true);
        });
      }
    });

    it("closes a hole with no partner by half way, or opens it after, half way from its centre to its place in the other mark's bounds", async () => {
      // The ring's centre is the middle of its bounds, and so is the disc's: (100, 100) lands on (120, 110).
      expect(disc.bounds).toEqual({ x: 60, y: 50, width: 120, height: 120 });
      for (const p of [0.15, 0.3, 0.45]) {
        const [, hole, ...more] = subpaths(dOf((await opening(small, disc, p))[0]!));
        expect(more).toEqual([]);
        expect(hole).toHaveLength(40);
        hole!.forEach((point, j) => expect(close(point, mix(round(100, 100, 40, written(j, 40), 40), { x: 110, y: 105 }, 2 * p)), `point ${j}`).toBe(true));
        expect(await opening(disc, small, 1 - p)).toEqual(await opening(small, disc, p));
      }
      // From half way on it's gone, and before half way back it isn't there yet.
      for (const p of [0.5, 0.75]) {
        expect(subpaths(dOf((await opening(small, disc, p))[0]!))).toHaveLength(1);
        expect(await opening(disc, small, 1 - p)).toEqual(await opening(small, disc, p));
      }
    });

    it("lands a hole with no partner inside the other shape when its place in the bounds isn't, and closes it sooner where it would leave the shape on the way", async () => {
      // A ring to three quarters of it: the ring's centre is the middle of both bounds, outside the slice.
      const hole = async (p: number) => subpaths(dOf((await opening(fullRing, threeQuarters, p))[0]!))[1];
      // It closes at a half, a quarter, an eighth or a sixteenth of the run; here not by half way, where the shape in between has left the ring's middle.
      let shut = 0;
      for (const e of [1 / 2, 1 / 4, 1 / 8, 1 / 16]) if ((await hole(e - 0.001)) && !(await hole(e))) shut = e;
      expect([1 / 4, 1 / 8, 1 / 16]).toContain(shut);
      // Each point moves in a straight line, so two frames give the point it closes to, and that's where its centre, the ring's, is by then on its way to where it lands.
      const [early, later] = [(await hole(shut / 4))![0]!, (await hole(shut / 2))![0]!];
      const closesAt = mix(early, later, 3);
      const there = { x: closesAt.x / shut, y: closesAt.y / shut };
      const radius = Math.hypot(there.x, there.y);
      expect(radius).toBeGreaterThan(70);
      expect(radius).toBeLessThan(90);
      // Inside the slice's quarters: anywhere but the upper left.
      expect(there.x > 0 || there.y > 0).toBe(true);
    });

    it("pairs holes by area, largest with largest, whatever order they're written in", async () => {
      const p = 0.4;
      const [outside, larger, smaller, ...more] = subpaths(dOf((await opening(twoHoles, oneHole, p))[0]!));
      expect(more).toEqual([]);
      expect(outside).toHaveLength(160);
      larger!.forEach((point, j) => {
        const u = written(j, 40) / 40;
        expect(close(point, mix(around(80, 80, 100, u), around(340, 40, 120, u), p)), `point ${j}`).toBe(true);
      });
      // The smaller has no partner: it closes by half way, half way to its centre's place in the other square, 35 px in from its top left.
      smaller!.forEach((point, j) => expect(close(point, mix(around(20, 20, 30, written(j, 40) / 40), { x: 185, y: 35 }, 2 * p)), `point ${j}`).toBe(true));
    });

    it("samples each hole at a quarter of `points`", async () => {
      const ctx = context(0.5);
      void morph({ points: 12 }).run(small, large, ctx);
      expect(subpaths(dOf(ctx.layer.picture()[0]!)).map((points) => points.length)).toEqual([12, 3]);
    });

    it("keeps a hole a hole under either fill rule on every frame, both ways, inside the shape", async () => {
      /** A point of filled area at progress q from the pair's first mark to its second, where one is known all the way. */
      const filled: Record<string, (q: number) => Point> = {
        "two rings": (q) => mix(round(100, 100, 50, 0, 4), round(300, 150, 93, 0, 4), q),
        "a ring and a disc": (q) => round(100 + 20 * q, 100 + 10 * q, 55, 0, 4),
        "a shape with two holes and one with one": (q) => mix({ x: 10, y: 10 }, { x: 310, y: 10 }, q)
      };
      let holes = 0;
      for (const [name, [a, b]] of Object.entries(holedPairs)) {
        for (const [from, to, back] of [
          [a, b, false],
          [b, a, true]
        ] as const) {
          for (const { p, drawn } of await frames(from!, to!)) {
            const where = `${name}, ${back ? "back" : "forward"}, at ${p}`;
            const d = dOf(drawn[0]!);
            const [outside, ...rest] = d.match(/M[^M]*/g)!;
            for (const hole of rest) {
              const box = boundsOf(flattenPath(parsePath(hole)).flatMap((subpath) => subpath.segments.flatMap(extremes)));
              // Less than 0.04 px across is more than path data's 0.001 px can draw.
              if (Math.max(box.width, box.height) < 0.04) continue;
              const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
              // Unfilled under either rule, where the shape without it is filled: a hole, not a filled island.
              expect(winding(d, middle), where).toBe(0);
              expect(Math.abs(winding(outside!, middle)), where).toBe(1);
              holes++;
            }
            const point = filled[name]?.(back ? 1 - p : p);
            if (point) expect(Math.abs(winding(d, point)), where).toBe(1);
          }
        }
      }
      expect(holes).toBeGreaterThan(400);
    });

    it("passes the transition checks, aligned either way", async () => {
      for (const align of ["unroll", "drop"] as const) await checkTransition(morph({ align }), { name: `morph, ${align}`, pairs: holedPairs });
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

  describe("two lines with gaps", () => {
    it("draws each line's own stroke on its first and last frames, as end() does", async () => {
      for (const [a, b] of Object.values(gappedPairs)) {
        for (const [from, to] of [
          [a, b],
          [b, a]
        ] as const) {
          const drawn = await frames(from, to);
          const paths = (i: number) => drawn[i]!.drawn.map((item) => (item.kind === "path" ? { d: item.d, paint: item.paint } : item));
          expect(paths(0)).toEqual([{ d: from.outline.d, paint: { stroke: "mark", width: from.thickness } }]);
          expect(paths(drawn.length - 1)).toEqual([{ d: to.outline.d, paint: { stroke: "mark", width: to.thickness } }]);
          expect(ended(from, to)).toEqual([{ kind: "path", d: to.outline.d, paint: { stroke: "mark", width: to.thickness } }]);
        }
      }
    });

    it("draws nothing inside a gap both lines have, on any frame, where one stroke along both ran through it", async () => {
      for (const [a, b] of [gappedPairs["two lines with the same gap"]!, gappedPairs["two lines whose gaps overlap"]!]) {
        for (const [from, to] of [
          [a, b],
          [b, a]
        ] as const) {
          expect(sharedGaps(from, to)).toHaveLength(1);
          const samples = [from.outline.sample(160), to.outline.sample(160)] as const;
          for (const { p, drawn } of await frames(from, to)) {
            const mark = p <= 0 ? from : p >= 1 ? to : partWay(from, to, p);
            expect(drawnInGaps(mark, drawn), `at ${p}`).toEqual([]);
            if (p <= 0 || p >= 1) continue;
            // As main drew it: one stroke through every sample.
            const joined = samples[0].map((point, i) => mix(point, samples[1][i]!, p)).map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x},${y}`).join("");
            expect(drawnInGaps(mark, [{ kind: "path", id: 0, d: joined, paint: {} }]), `at ${p}`).not.toEqual([]);
          }
        }
      }
    });

    it("fades the stroke inside the old line's gap in, and inside the new line's out, at 1 − ((1 − p) · a + p · b)", async () => {
      const [[e0, e1]] = early.gaps as [[number, number]];
      const [[o0, o1]] = other.gaps as [[number, number]];
      const [[l0, l1]] = late.gaps as [[number, number]];
      expect(e1 < l0 && e0 < o0 && e1 < o1).toBe(true);
      for (const p of [0.2, 0.7]) {
        /** A path in one piece, from t0 to t1 on the line part way, at opacity. */
        const piece = (item: Picture | undefined, from: MarkGeometry, to: MarkGeometry, t0: number, t1: number, opacity: number): void => {
          const points = measurePath(dOf(item!)).points;
          expect(dOf(item!).match(/M/g)).toHaveLength(1);
          expect(near(points[0]!, mix(from.path(t0), to.path(t0), p))).toBe(true);
          expect(near(points[points.length - 1]!, mix(from.path(t1), to.path(t1), p))).toBe(true);
          expect(opacityOf(item!)).toBeCloseTo(opacity, 3);
        };
        // Apart: at full strength, then the old line's gap fading in, then the new line's fading out, in order along the walk.
        const apart = await opening(early, late, p);
        expect(apart.map(opacityOf).map((o) => Math.round(o * 1000) / 1000)).toEqual([1, Math.round(p * 1000) / 1000, Math.round((1 - p) * 1000) / 1000]);
        piece(apart[1], early, late, e0, e1, p);
        piece(apart[2], early, late, l0, l1, 1 - p);
        // Overlapping: only the ends of the gaps that aren't both lines'.
        const overlapping = await opening(early, other, p);
        expect(overlapping).toHaveLength(3);
        piece(overlapping[1], early, other, e0, o0, p);
        piece(overlapping[2], early, other, e1, o1, 1 - p);
        // To a line with no gaps, and from one.
        const filling = await opening(early, whole, p);
        expect(filling).toHaveLength(2);
        piece(filling[1], early, whole, e0, e1, p);
        const opening2 = await opening(whole, early, p);
        expect(opening2).toHaveLength(2);
        piece(opening2[1], whole, early, e0, e1, 1 - p);
      }
    });

    it("doesn't jump: next to each end, what's drawn at full strength is that end's line, and each frame moves a little from the last", async () => {
      for (const [a, b] of Object.values(gappedPairs)) {
        for (const [from, to] of [
          [a, b],
          [b, a]
        ] as const) {
          drawsAsLine(await opening(from, to, 1e-4), from, to);
          drawsAsLine(await opening(from, to, 1 - 1e-4), to, from);
          // Between the end frames, each point moves no faster than p times the farthest any point goes, and each opacity no faster than p.
          const ends = [...(from.gaps ?? []), ...(to.gaps ?? [])].flat();
          const farthest = Math.max(...[...Array.from({ length: 160 }, (_, i) => i / 159), ...ends].map((t) => Math.hypot(from.path(t).x - to.path(t).x, from.path(t).y - to.path(t).y)));
          const run = await frames(from, to);
          for (let i = 2; i < run.length - 1; i++) {
            const [before, now] = [run[i - 1]!, run[i]!];
            const step = now.p - before.p;
            expect(now.drawn.map((item) => measurePath(dOf(item)).points.length)).toEqual(before.drawn.map((item) => measurePath(dOf(item)).points.length));
            now.drawn.forEach((item, k) => {
              expect(Math.abs(opacityOf(item) - opacityOf(before.drawn[k]!))).toBeLessThanOrEqual(step + 1e-9);
              const points = measurePath(dOf(before.drawn[k]!)).points;
              measurePath(dOf(item)).points.forEach((point, j) => expect(Math.hypot(point.x - points[j]!.x, point.y - points[j]!.y)).toBeLessThanOrEqual(step * farthest + 0.002));
            });
          }
        }
      }
    });

    it("passes the transition checks", async () => {
      await checkTransition(morph(), { name: "morph", pairs: gappedPairs });
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

    it("retraces between lines with gaps and shapes with holes, from any frame, both ways", async () => {
      for (const align of ["unroll", "drop"] as const) {
        for (const [a, b] of [...Object.values(gappedPairs), ...Object.values(holedPairs)]) {
          for (const [from, to] of [
            [a, b],
            [b, a]
          ] as const) {
            for (const frames of [1, 7, 19, 40, 58]) {
              const ctx = context();
              void morph({ align }).run(from!, to!, ctx);
              for (let i = 0; i < frames; i++) ctx.clock.advance(16);
              const p = easeInOutCubic(ctx.clock.now() / 950);
              expect(await opening(to!, from!, 1 - p, align), `${frames} frames in`).toEqual(ctx.layer.picture());
            }
          }
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

/** A 64-bit hash of the text (cyrb53's mixing, both halves kept), as 16 hex digits: enough to tell two drawings apart. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/** Pairs with no gap in a line and no hole in a shape: the fixture pairs, a crossfade, and shapes and curves from path data. */
function plainPairs(): Record<string, readonly [MarkGeometry, MarkGeometry]> {
  return {
    ...fixturePairs,
    "a slice and a line": [slice, line],
    "a point and a column": [fixtures.point, column],
    "a pie slice and a column": [build.arc({ key: "pie", cx: 150, cy: 150, inner: 0, outer: 116, start: 0.3, end: 2.4 }), column],
    "a shape and a bar": [build.shape({ key: "s", d: "M0,0C40,-20 80,20 120,0L120,80A40,40 0 0 1 0,80Z" }), bar],
    "a curve and a line": [build.shape({ key: "c", d: "M0,100C40,20 120,180 160,90S240,20 280,60", width: 3 }), line],
    "a stack and a short bar": [fixtures.stacked, fixtures["short bar"]]
  };
}

/**
 * Every call each run makes on its layer, frame by frame: on each pair, both ways, as it's given,
 * dropped and at 12 points, from the start and part way, and what end() draws. A digest a pair.
 */
async function digests(): Promise<Record<string, string>> {
  // Numbers rounded to 1e-9, as path data is to 0.001: a crossfade's opacity is the eased progress itself, whose last
  // bits come from Math.pow and Math.cbrt, and those differ between Node 22's V8 and Node 24's.
  const serial = (calls: unknown): string => JSON.stringify(calls, (_, value: unknown) => (typeof value === "number" ? Math.round(value * 1e9) / 1e9 : value));
  const out: Record<string, string> = {};
  for (const [name, [a, b]] of Object.entries(plainPairs())) {
    let log = "";
    for (const [from, to] of [
      [a, b],
      [b, a]
    ] as const) {
      for (const options of [{}, { align: "drop" }, { points: 12 }] as const) {
        for (const start of [0, 0.37]) {
          const ctx = context(start);
          await play(ctx.clock, morph(options).run(from!, to!, ctx));
          log += serial(ctx.layer.calls);
        }
        const ended = context();
        morph(options).end(from!, to!, ended);
        log += serial(ended.layer.calls);
      }
    }
    out[name] = hash(log);
  }
  return out;
}

/** The digests main (492d4dc, whose morph is 1fdc9e3's) gave, with this file's digests() run there, before morph kept gaps and holes. */
const MAIN: Readonly<Record<string, string>> = {
  "slice and column": "4e71e24a7caab38a",
  "bar and column": "15d003d7be32b370",
  "two slices": "e54b3a77cb79c4b9",
  "two lines": "cba394617b15d178",
  "two points": "4d5c06fb489e3540",
  "a slice and a line": "18dfa79ee5c881e3",
  "a point and a column": "3ee63627e6172962",
  "a pie slice and a column": "dedb7c7675fd1df8",
  "a shape and a bar": "52e2efdb98c642fe",
  "a curve and a line": "68ed996ec5ca6976",
  "a stack and a short bar": "3598f21fa89d5b1a"
};

describe("lines without gaps and outlines without holes", () => {
  it("morph as on main, byte for byte: every frame's calls, both ways, from the start and part way, and end()", async () => {
    expect(await digests()).toEqual(MAIN);
  });
});
