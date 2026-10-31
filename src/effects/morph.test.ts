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

// Lines with gaps, each over x 0 to 320, so they pair by x. `early` skips after its second value, from
// x 80 to 160, and `smaller` is it drawn smaller, so its gap is the same share of the way across.
// `other` skips from x 120 to 200, so the two overlap. `late` skips after its third value, from 160
// to 240, so its gap is apart from early's, and `whole` is late with nothing missing.
const season = [{ x: 0, y: 100 }, { x: 80, y: 60 }, { x: 160, y: 90 }, { x: 240, y: 20 }, { x: 320, y: 50 }];
const another = [{ x: 0, y: 40 }, { x: 80, y: 80 }, { x: 160, y: 30 }, { x: 240, y: 70 }, { x: 320, y: 60 }];
const early = build.line({ key: "goals", series: "goals", points: season, breaks: [2], width: 2 });
const smaller = build.line({ key: "goals", series: "goals", points: season.map(({ x, y }) => ({ x: 0.8 * x + 20, y: 0.8 * y + 10 })), breaks: [2], width: 3 });
const other = build.line({ key: "goals", series: "goals", points: [{ x: 0, y: 40 }, { x: 40, y: 70 }, { x: 120, y: 80 }, { x: 200, y: 30 }, { x: 240, y: 70 }, { x: 320, y: 60 }], breaks: [3], width: 2 });
const late = build.line({ key: "goals", series: "goals", points: another, breaks: [3], width: 2 });
const whole = build.line({ key: "goals", series: "goals", points: another, width: 2 });
const gappedPairs: Readonly<Record<string, readonly [MarkGeometry, MarkGeometry]>> = {
  "two lines with the same gap": [early, smaller],
  "two lines whose gaps overlap": [early, other],
  "two lines with different gaps": [early, late],
  "a line with a gap and one without": [early, whole]
};

/** A line's vertices, as its path data has them, in order: its walk, where no value is alone between gaps. */
const vertices = (mark: MarkGeometry): readonly Point[] => measurePath(mark.outline.d).points;
/** The share of the way across a line's x span, from its walk's start to its end, that x is. */
const shareOf = (mark: MarkGeometry, x: number): number => (x - mark.start.x) / (mark.end.x - mark.start.x);

/** The point a share s of the way across a line that runs one way: on its walk, through `points`, between the vertices either side. */
function onShare(mark: MarkGeometry, s: number, points: readonly Point[] = vertices(mark)): Point {
  const x = mark.start.x + s * (mark.end.x - mark.start.x);
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1]!, points[i]!];
    if ((x - a.x) * (x - b.x) <= 0) return mix(a, b, b.x === a.x ? 0 : (x - a.x) / (b.x - a.x));
  }
  throw new Error(`share ${s} is off the line`);
}

/**
 * The stops two lines that pair by x are drawn at, through their vertices, as each line's share of the
 * way across: `points` evenly across and each vertex's, in order. Shares within 0.01 px of a stop's
 * first, across the wider line, are that stop, each line at its own vertex there if it has one, but
 * one vertex of each line at most, and the ends are at 0 and 1.
 */
function stopsOf(a: readonly Point[], b: readonly Point[], points = 160): [number, number][] {
  const span = (line: readonly Point[]): number => line[line.length - 1]!.x - line[0]!.x;
  const shares = (line: readonly Point[], whose: number): [number, number][] => line.map((p) => [(p.x - line[0]!.x) / span(line), whose]);
  const same = 0.01 / Math.max(Math.abs(span(a)), Math.abs(span(b)));
  const stops: { first: number; own: (number | undefined)[] }[] = [];
  for (const [s, whose] of [...Array.from({ length: points }, (_, i): [number, number] => [i / (points - 1), 0]), ...shares(a, 1), ...shares(b, 2)].sort((x, y) => x[0] - y[0])) {
    const last = stops[stops.length - 1];
    if (!last || s - last.first > same || (whose > 0 && last.own[whose] !== undefined)) stops.push({ first: s, own: [] });
    const own = stops[stops.length - 1]!.own;
    if (whose > 0 && own[whose] === undefined) own[whose] = s;
  }
  return stops.map(({ first, own }, k): [number, number] => (k === 0 ? [0, 0] : k === stops.length - 1 ? [1, 1] : [own[1] ?? first, own[2] ?? first]));
}

/** Where both lines have a gap, as shares of the way across their x spans. */
function bothMiss(a: MarkGeometry, b: MarkGeometry): [number, number][] {
  const shares = (mark: MarkGeometry): [number, number][] => (mark.gaps ?? []).map(([t0, t1]) => [shareOf(mark, mark.path(t0).x), shareOf(mark, mark.path(t1).x)]);
  return shares(a).flatMap(([a0, a1]) => shares(b).flatMap(([b0, b1]): [number, number][] => (Math.min(a1, b1) > Math.max(a0, b0) ? [[Math.max(a0, b0), Math.min(a1, b1)]] : [])));
}

/**
 * What's drawn where both lines miss at p, as two lines paired by x have it: every line of a path
 * across the x's inside a gap both have, each share's x moved from `from`'s toward `to`'s.
 */
function drawnWhereBothMiss(drawn: readonly (Picture | Drawn)[], from: MarkGeometry, to: MarkGeometry, p: number): string[] {
  const x = (s: number): number => (from.start.x + s * (from.end.x - from.start.x)) * (1 - p) + (to.start.x + s * (to.end.x - to.start.x)) * p;
  const problems: string[] = [];
  for (const [s0, s1] of bothMiss(from, to)) {
    const [lo, hi] = [x(s0), x(s1)].sort((m, n) => m - n) as [number, number];
    for (const item of drawn) {
      let pen: Point | undefined;
      for (const { op, args } of measurePath(dOf(item)).commands) {
        const point = { x: args[args.length - 2]!, y: args[args.length - 1]! };
        if (op === "L" && pen && Math.max(pen.x, point.x) > lo + 0.01 && Math.min(pen.x, point.x) < hi - 0.01) problems.push(`at ${p}, a line from ${pen.x},${pen.y} to ${point.x},${point.y} crosses x ${lo} to ${hi}`);
        pen = point;
      }
    }
  }
  return problems;
}

/** How far a point is from the nearest line of path data. */
function offPath(point: Point, d: string): number {
  let nearest = Infinity;
  let pen: Point | undefined;
  for (const { op, args } of measurePath(d).commands) {
    const to = { x: args[args.length - 2]!, y: args[args.length - 1]! };
    const [from, dx, dy] = [pen ?? to, to.x - (pen ?? to).x, to.y - (pen ?? to).y];
    const u = op === "L" && (dx !== 0 || dy !== 0) ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy))) : 0;
    nearest = Math.min(nearest, Math.hypot(point.x - (op === "L" ? from.x + u * dx : to.x), point.y - (op === "L" ? from.y + u * dy : to.y)));
    pen = to;
  }
  return nearest;
}

/**
 * Whether what's drawn at full strength, at p next to 0 (or 1), is `mark`'s own stroke, the line at
 * that end, within 0.01 px: it runs through every vertex of the line's path data, and every point of
 * every path at more than half strength is on that path data, where the line has data.
 */
function drawsAsLine(picture: readonly Picture[], mark: MarkGeometry): void {
  const shown = picture.filter((item) => opacityOf(item) > 0.5);
  expect(shown.length).toBeGreaterThan(0);
  for (const vertex of vertices(mark)) expect(Math.min(...shown.map((item) => offPath(vertex, dOf(item)))), `${vertex.x},${vertex.y}`).toBeLessThan(0.01);
  for (const point of shown.flatMap((item) => measurePath(dOf(item)).points)) expect(offPath(point, mark.outline.d), `${point.x},${point.y}`).toBeLessThan(0.01);
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

// Lines that don't each run one way across x, which pair by length: a spiral, a scatter trail, a line
// with a step straight up, one of a single point, one with an arc, and a line from right to left.
const spiral = build.line({ key: "goals", series: "goals", points: Array.from({ length: 25 }, (_, i) => ({ x: 150 + (4 + 3 * (i / 2)) * Math.cos(i / 2), y: 100 + (4 + 3 * (i / 2)) * Math.sin(i / 2) })), width: 2 });
const trail = [{ x: 40, y: 80 }, { x: 120, y: 30 }, { x: 70, y: 140 }, { x: 200, y: 90 }, { x: 150, y: 20 }, { x: 260, y: 60 }];
const scatterTrail = build.line({ key: "goals", series: "goals", points: trail, width: 2 });
const step = build.line({ key: "goals", series: "goals", points: [{ x: 0, y: 100 }, { x: 80, y: 100 }, { x: 80, y: 40 }, { x: 160, y: 40 }, { x: 240, y: 80 }], width: 2 });
const single = build.line({ key: "goals", series: "goals", points: [{ x: 60, y: 50 }], width: 2 });
const arched = build.shape({ key: "goals", d: "M0,100A80,80 0 0 1 160,100L240,60", width: 2 });
const leftward = build.line({ key: "goals", series: "goals", points: [...season].reverse(), width: 3 });
/** Pairs whose lines pair by length, as on main, with gaps or none, and closed outlines with holes. */
const byLength: Readonly<Record<string, readonly [MarkGeometry, MarkGeometry]>> = {
  "a spiral and a line": [spiral, line],
  "a scatter trail and a line": [scatterTrail, line],
  "a line with a step straight up and a line": [step, line],
  "a line of one point and a line": [single, line],
  "a line with an arc and a line": [arched, line],
  "two lines that run opposite ways": [line, leftward],
  "a scatter trail with a gap and a line with one": [build.line({ key: "goals", series: "goals", points: trail, breaks: [2], width: 2 }), early],
  "two lines with gaps that run opposite ways": [early, build.line({ key: "goals", series: "goals", points: [...another].reverse(), breaks: [2], width: 2 })],
  "a line with a gap and a slice": [early, slice]
};

// Lines that each run one way across x, which pair by x. `jagged` and `smooth` are over the same x's,
// 0 to 320; `wide` is jagged's in a plot 1.2 times as wide, 5 px further right; `narrow` spans x 40
// to 280, with more vertices; and `jaggedBack` and `smoothBack` run from right to left.
const XS = [0, 40, 80, 120, 160, 200, 240, 280, 320];
const zigzag = XS.map((x, i) => ({ x, y: i % 2 === 0 ? 100 - 4 * i : 40 + 2 * i }));
const rising = XS.map((x, i) => ({ x, y: 110 - 9 * i }));
const jagged = build.line({ key: "goals", series: "goals", points: zigzag, width: 2 });
const smooth = build.line({ key: "goals", series: "goals", points: rising, width: 3 });
const wide = build.line({ key: "goals", series: "goals", points: zigzag.map(({ x, y }) => ({ x: 1.2 * x + 5, y: y + 10 })), width: 2 });
const narrow = build.line({ key: "goals", series: "goals", points: Array.from({ length: 13 }, (_, i) => ({ x: 40 + 20 * i, y: 70 + 25 * Math.sin(i) })), width: 2 });
const byX: Readonly<Record<string, readonly [MarkGeometry, MarkGeometry]>> = {
  "two lines over the same x's": [jagged, smooth],
  "two lines over the same x's in plots of two widths": [jagged, wide],
  "two lines over different spans": [jagged, narrow],
  "two lines from right to left": [build.line({ key: "goals", series: "goals", points: [...zigzag].reverse(), width: 2 }), build.line({ key: "goals", series: "goals", points: [...rising].reverse(), width: 3 })],
  "the fixtures' two lines": fixturePairs["two lines"],
  "a curve and a line": [build.shape({ key: "c", d: "M0,100C40,20 120,180 160,90S240,20 280,60", width: 3 }), line]
};

/** A line through `points` without the values at the x's in `gone`: a gap from the value before each run of them to the value after. */
function missing(points: readonly Point[], gone: readonly number[], width = 2): MarkGeometry {
  const kept = points.filter((point) => !gone.includes(point.x));
  const breaks = kept.flatMap((point, i) => (i > 0 && points.indexOf(point) - points.indexOf(kept[i - 1]!) > 1 ? [i] : []));
  return build.line({ key: "goals", series: "goals", points: kept, breaks, width });
}
// Missing x 160; missing x 120 and 200, so the value at 160 is alone between two gaps; and missing x
// 40, so the first value is alone.
const jaggedMissing = missing(zigzag, [160]);
const smoothMissing = missing(rising, [160], 3);
const jaggedAlone = missing(zigzag, [120, 200]);
const smoothAlone = missing(rising, [120, 200], 3);
const startsAlone = missing(zigzag, [40]);
const byXGapped: Readonly<Record<string, readonly [MarkGeometry, MarkGeometry]>> = {
  "two lines missing the same x, one jagged and one smooth": [jaggedMissing, smoothMissing],
  "a line missing an x and one without": [jaggedMissing, smooth],
  "two lines with the same value alone between gaps": [jaggedAlone, smoothAlone],
  "a line with a value alone and one without": [jaggedAlone, smooth],
  "a line whose first value is alone and one with a gap elsewhere": [startsAlone, smoothMissing]
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

  describe("two open outlines that don't each run one way across x", () => {
    const thin = build.line({ key: "goals", points: [{ x: 0, y: 100 }, { x: 80, y: 60 }, { x: 160, y: 90 }], width: 2 });
    // From right to left, the other way from thin's, so the two pair by length.
    const thick = build.line({ key: "goals", points: [{ x: 200, y: 40 }, { x: 0, y: 40 }], width: 6 });

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

    it("passes the transition checks: a spiral, a scatter trail, a step, a point, an arc and lines that run opposite ways, with gaps and without", async () => {
      await checkTransition(morph(), { name: "morph", pairs: byLength });
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
          expect(bothMiss(from, to)).toHaveLength(1);
          const samples = [from.outline.sample(160), to.outline.sample(160)] as const;
          for (const { p, drawn } of await frames(from, to)) {
            expect(drawnWhereBothMiss(drawn, from, to, p)).toEqual([]);
            if (p <= 0 || p >= 1) continue;
            // As 0.5.0 drew it: one stroke through every sample.
            const joined = samples[0].map((point, i) => mix(point, samples[1][i]!, p)).map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x},${y}`).join("");
            expect(drawnWhereBothMiss([{ kind: "path", id: 0, d: joined, paint: {} }], from, to, p), `at ${p}`).not.toEqual([]);
          }
        }
      }
    });

    it("fades the stroke inside the old line's gap in, and inside the new line's out, at 1 − ((1 − p) · a + p · b)", async () => {
      // As shares across: early's gap from 0.25 to 0.5, other's from 0.375 to 0.625, late's from 0.5 to 0.75.
      expect(bothMiss(early, late)).toEqual([]);
      expect(bothMiss(early, other)).toEqual([[0.375, 0.5]]);
      for (const p of [0.2, 0.7]) {
        /** A path in one piece, from share s0 to s1 on the line part way, at opacity. */
        const piece = (item: Picture | undefined, from: MarkGeometry, to: MarkGeometry, s0: number, s1: number, opacity: number): void => {
          const points = measurePath(dOf(item!)).points;
          expect(dOf(item!).match(/M/g)).toHaveLength(1);
          expect(near(points[0]!, mix(onShare(from, s0), onShare(to, s0), p))).toBe(true);
          expect(near(points[points.length - 1]!, mix(onShare(from, s1), onShare(to, s1), p))).toBe(true);
          expect(opacityOf(item!)).toBeCloseTo(opacity, 3);
        };
        // Apart: at full strength, then the old line's gap fading in, then the new line's fading out, in order along the walk.
        const apart = await opening(early, late, p);
        expect(apart.map(opacityOf).map((o) => Math.round(o * 1000) / 1000)).toEqual([1, Math.round(p * 1000) / 1000, Math.round((1 - p) * 1000) / 1000]);
        piece(apart[1], early, late, 0.25, 0.5, p);
        piece(apart[2], early, late, 0.5, 0.75, 1 - p);
        // Overlapping: only the ends of the gaps that aren't both lines'.
        const overlapping = await opening(early, other, p);
        expect(overlapping).toHaveLength(3);
        piece(overlapping[1], early, other, 0.25, 0.375, p);
        piece(overlapping[2], early, other, 0.5, 0.625, 1 - p);
        // To a line with no gaps, and from one.
        const filling = await opening(early, whole, p);
        expect(filling).toHaveLength(2);
        piece(filling[1], early, whole, 0.25, 0.5, p);
        const opening2 = await opening(whole, early, p);
        expect(opening2).toHaveLength(2);
        piece(opening2[1], whole, early, 0.25, 0.5, 1 - p);
      }
    });

    it("doesn't jump: next to each end, what's drawn at full strength is that end's line, and each frame moves a little from the last", async () => {
      for (const [a, b] of Object.values(gappedPairs)) {
        for (const [from, to] of [
          [a, b],
          [b, a]
        ] as const) {
          drawsAsLine(await opening(from, to, 1e-4), from);
          drawsAsLine(await opening(from, to, 1 - 1e-4), to);
          // Between the end frames, each point moves no faster than p times the farthest any point goes, and each opacity no faster than p.
          const gone = ([s, t]: [number, number]): number => Math.hypot(onShare(from, s).x - onShare(to, t).x, onShare(from, s).y - onShare(to, t).y);
          const farthest = Math.max(...stopsOf(vertices(from), vertices(to)).map(gone));
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

  describe("two lines that each run one way across x (M12 step 2)", () => {
    it("pairs each stop with the point the same share across the other line's x span: `points` shares evenly, and every vertex of either", async () => {
      for (const [name, [a, b]] of Object.entries(byX)) {
        for (const [from, to] of [
          [a, b],
          [b, a]
        ] as const) {
          for (const points of [8, 160]) {
            for (const p of [0.3, 0.7]) {
              const ctx = context(p);
              void morph({ points }).run(from, to, ctx);
              await flush();
              const [drawn, ...more] = ctx.layer.picture();
              expect(more).toEqual([]);
              expect((drawn as { paint: unknown }).paint).toEqual({ stroke: "mark", width: Math.round((from.thickness * (1 - p) + to.thickness * p) * 1000) / 1000 });
              const expected = stopsOf(vertices(from), vertices(to), points).map(([s, t]) => mix(onShare(from, s), onShare(to, t), p));
              const got = measurePath(dOf(drawn!)).points;
              expect(got).toHaveLength(expected.length);
              got.forEach((point, i) => expect(near(point, expected[i]!), `${name}, ${points} points, at ${p}, point ${i}`).toBe(true));
            }
          }
        }
      }
    });

    it("moves each value straight up or down between lines over the same x's, and to its own in a plot of another width", async () => {
      const middle = (from: MarkGeometry, to: MarkGeometry) => opening(from, to, 0.5).then(([drawn]) => measurePath(dOf(drawn!)).points);
      const [onSmooth, onWide] = [await middle(jagged, smooth), await middle(jagged, wide)];
      zigzag.forEach((point, k) => {
        expect(onSmooth.some((at) => near(at, mix(point, rising[k]!, 0.5))), `x ${point.x}`).toBe(true);
        expect(onWide.some((at) => near(at, mix(point, vertices(wide)[k]!, 0.5))), `x ${point.x}`).toBe(true);
      });
      // Between the values, every point is where both lines are at the same x.
      for (const at of onSmooth) expect(near(at, mix(onShare(jagged, shareOf(jagged, at.x)), onShare(smooth, shareOf(smooth, at.x)), 0.5))).toBe(true);
    });

    it("keeps every vertex of a line however close its neighbours: a peak 0.005 px from the vertices either side, and next to either end", async () => {
      // Codex on #134: with one stop for a line's vertices within 0.01 px, the first of these drew flat part way.
      const peaks: [Point[], number][] = [
        [[{ x: 0, y: 0 }, { x: 0.005, y: 100 }, { x: 0.009, y: 0 }, { x: 100, y: 0 }], 1],
        [[{ x: 0, y: 0 }, { x: 0.004, y: 100 }, { x: 50, y: 0 }, { x: 100, y: 0 }], 1],
        [[{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 99.996, y: 100 }, { x: 100, y: 0 }], 2]
      ];
      for (const [points, k] of peaks) {
        const peak = build.line({ key: "goals", series: "goals", points, width: 2 });
        const lower = build.line({ key: "goals", series: "goals", points: points.map(({ x, y }) => ({ x, y: y / 2 + 10 })), width: 2 });
        for (const [from, to] of [
          [peak, peak],
          [peak, lower],
          [lower, peak]
        ] as const) {
          const [drawn] = await opening(from, to, 0.5);
          const highest = Math.max(...measurePath(dOf(drawn!)).points.map((point) => point.y));
          expect(highest, `peak at ${points[k]!.x}`).toBeCloseTo((vertices(from)[k]!.y + vertices(to)[k]!.y) / 2, 3);
          drawsAsLine(await opening(from, to, 1e-4), from);
          drawsAsLine(await opening(from, to, 1 - 1e-4), to);
        }
      }
    });

    it("draws each line's own path data on its first and last frames, and its own polyline next to them, through every vertex within 0.01 px", async () => {
      for (const [a, b] of [...Object.values(byX), ...Object.values(byXGapped)]) {
        for (const [from, to] of [
          [a, b],
          [b, a]
        ] as const) {
          const run = await frames(from, to);
          const paths = (i: number) => run[i]!.drawn.map((item) => (item.kind === "path" ? { d: item.d, paint: item.paint } : item));
          expect(paths(0)).toEqual([{ d: from.outline.d, paint: { stroke: "mark", width: from.thickness } }]);
          expect(paths(run.length - 1)).toEqual([{ d: to.outline.d, paint: { stroke: "mark", width: to.thickness } }]);
          drawsAsLine(await opening(from, to, 1e-4), from);
          drawsAsLine(await opening(from, to, 1 - 1e-4), to);
        }
      }
    });

    it("draws nothing where both lines miss, on any frame, both ways: two lines missing the same x's, one jagged and one smooth", async () => {
      // By t their gaps don't meet, the lines being of other lengths; by x they're the same.
      expect(jaggedMissing.gaps).not.toEqual(smoothMissing.gaps);
      expect(bothMiss(jaggedMissing, smoothMissing)).toEqual([[0.375, 0.625]]);
      for (const [a, b] of [
        [jaggedMissing, smoothMissing],
        [jaggedAlone, smoothAlone]
      ] as const) {
        for (const [from, to] of [
          [a, b],
          [b, a]
        ] as const) {
          for (const { p, drawn } of await frames(from, to)) {
            expect(drawnWhereBothMiss(drawn, from, to, p)).toEqual([]);
            // Nothing fades: what one misses, the other does too.
            expect(drawn.map(opacityOf), `at ${p}`).toEqual([1]);
          }
        }
      }
    });

    it("fades a gap only one line has, in where the old line has it and out where the new one does, from the same share across both to the same share", async () => {
      for (const p of [0.2, 0.7]) {
        const [full, fading, ...more] = await opening(jaggedMissing, smooth, p);
        expect(more).toEqual([]);
        expect(opacityOf(full!)).toBe(1);
        expect(opacityOf(fading!)).toBeCloseTo(p, 3);
        // From x 120 to x 200 on both, through smooth's vertex at x 160 and the even shares between.
        const points = measurePath(dOf(fading!)).points;
        expect(dOf(fading!).match(/M/g)).toHaveLength(1);
        expect(near(points[0]!, mix(zigzag[3]!, rising[3]!, p))).toBe(true);
        expect(near(points[points.length - 1]!, mix(zigzag[5]!, rising[5]!, p))).toBe(true);
        expect(points.some((point) => near(point, mix(onShare(jaggedMissing, 0.5), rising[4]!, p)))).toBe(true);
        expect(points.every((point) => point.x >= 120 - 0.001 && point.x <= 200 + 0.001)).toBe(true);
        // Back, it fades out.
        expect(await opening(smooth, jaggedMissing, 1 - p)).toEqual(await opening(jaggedMissing, smooth, p));
      }
    });

    it("takes a value alone between gaps as a vertex, from the line's walk, and spans a line from a value alone at its start", async () => {
      // jaggedAlone's stroke leaves out x 160: its value there is alone, between gaps from x 80 and to x 240.
      expect(vertices(jaggedAlone).some((vertex) => vertex.x === 160)).toBe(false);
      const p = 0.4;
      const [, fading] = await opening(jaggedAlone, smooth, p);
      const points = measurePath(dOf(fading!)).points;
      expect(near(points[0]!, mix(zigzag[2]!, rising[2]!, p))).toBe(true);
      expect(points.some((point) => near(point, mix(zigzag[4]!, rising[4]!, p)))).toBe(true);
      expect(near(points[points.length - 1]!, mix(zigzag[6]!, rising[6]!, p))).toBe(true);
      // startsAlone's stroke starts at x 80, after its first value, alone, but it spans x 0 to 320 as its walk does.
      expect(vertices(startsAlone)[0]).toEqual(zigzag[2]);
      const [fadingIn, rest] = await opening(startsAlone, smooth, p);
      expect(opacityOf(fadingIn!)).toBeCloseTo(p, 3);
      expect(near(measurePath(dOf(fadingIn!)).points[0]!, mix(zigzag[0]!, rising[0]!, p))).toBe(true);
      expect(near(measurePath(dOf(rest!)).points[0]!, mix(zigzag[2]!, rising[2]!, p))).toBe(true);
    });

    it("passes the transition checks", async () => {
      await checkTransition(morph(), { name: "morph", pairs: { ...byX, ...byXGapped } });
    });

    it("retraces from any frame, both ways", async () => {
      for (const [a, b] of [...Object.values(byX), ...Object.values(byXGapped)]) {
        for (const [from, to] of [
          [a, b],
          [b, a]
        ] as const) {
          for (const count of [1, 7, 19, 40, 58]) {
            const ctx = context();
            void morph().run(from, to, ctx);
            for (let i = 0; i < count; i++) ctx.clock.advance(16);
            const p = easeInOutCubic(ctx.clock.now() / 950);
            expect(await opening(to, from, 1 - p), `${count} frames in`).toEqual(ctx.layer.picture());
          }
        }
      }
    });

    it("takes up to 1,000 of a line's vertices as stops, and of a denser one the first, last, highest and lowest in each of 250 columns, and its gaps' ends", async () => {
      // Ten years of days across 1,000 px, with a spike on one day, and the same upside down with a day missing.
      const days = Array.from({ length: 3652 }, (_, i) => ({ x: (i * 1000) / 3651, y: i === 1234 ? 10 : 150 + 60 * Math.sin(i / 37) + 20 * Math.sin(i * 1.7) }));
      const flipped = days.map(({ x, y }) => ({ x, y: 300 - y }));
      const daily = build.line({ key: "price", points: days, width: 2 });
      const missingDay = build.line({ key: "price", points: [...flipped.slice(0, 2000), ...flipped.slice(2001)], breaks: [2000], width: 2 });
      const p = 0.5;
      const [full, fading, ...more] = await opening(daily, missingDay, p);
      expect(more).toEqual([]);
      const points = [...measurePath(dOf(full!)).points, ...measurePath(dOf(fading!)).points];
      // 160 even shares, and 1,000 of each line give or take a column's vertices that are both its highest and lowest, its first or last.
      expect(points.length).toBeLessThanOrEqual(160 + 2 * 1000 + 4);
      expect(points.length).toBeGreaterThan(1000);
      // The spike is its column's highest, and the gap's ends are kept.
      expect(points.some((point) => near(point, mix(days[1234]!, flipped[1234]!, p)))).toBe(true);
      expect(points.some((point) => near(point, mix(days[1999]!, flipped[1999]!, p)))).toBe(true);
      expect(points.some((point) => near(point, mix(days[2001]!, flipped[2001]!, p)))).toBe(true);
      // A line of 1,000 takes every one.
      const thousand = build.line({ key: "price", points: days.slice(0, 1000), width: 2 });
      const [all] = await opening(thousand, build.line({ key: "price", points: flipped.slice(0, 1000), width: 2 }), p);
      expect(measurePath(dOf(all!)).points).toHaveLength(stopsOf(days.slice(0, 1000), flipped.slice(0, 1000)).length);
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

/**
 * Pairs with no gap in a line and no hole in a shape: the fixture pairs, a crossfade, and shapes from path data. Not the
 * fixtures' two lines, or a curve and a line, which each run one way across x, and pair by x since M12 step 2.
 */
function plainPairs(): Record<string, readonly [MarkGeometry, MarkGeometry]> {
  const { "two lines": _byX, ...pairs } = fixturePairs;
  return {
    ...pairs,
    "a slice and a line": [slice, line],
    "a point and a column": [fixtures.point, column],
    "a pie slice and a column": [build.arc({ key: "pie", cx: 150, cy: 150, inner: 0, outer: 116, start: 0.3, end: 2.4 }), column],
    "a shape and a bar": [build.shape({ key: "s", d: "M0,0C40,-20 80,20 120,0L120,80A40,40 0 0 1 0,80Z" }), bar],
    "a stack and a short bar": [fixtures.stacked, fixtures["short bar"]]
  };
}

/**
 * Every call each run makes on its layer, frame by frame: on each pair, both ways, as it's given,
 * dropped and at 12 points, from the start and part way, and what end() draws. A digest a pair.
 */
async function digests(pairs: Readonly<Record<string, readonly [MarkGeometry, MarkGeometry]>> = plainPairs()): Promise<Record<string, string>> {
  // Numbers rounded to 1e-9, as path data is to 0.001: a crossfade's opacity is the eased progress itself, whose last
  // bits come from Math.pow and Math.cbrt, and those differ between Node 22's V8 and Node 24's.
  const serial = (calls: unknown): string => JSON.stringify(calls, (_, value: unknown) => (typeof value === "number" ? Math.round(value * 1e9) / 1e9 : value));
  const out: Record<string, string> = {};
  for (const [name, [a, b]] of Object.entries(pairs)) {
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
  "two points": "4d5c06fb489e3540",
  "a slice and a line": "18dfa79ee5c881e3",
  "a point and a column": "3ee63627e6172962",
  "a pie slice and a column": "dedb7c7675fd1df8",
  "a shape and a bar": "52e2efdb98c642fe",
  "a stack and a short bar": "3598f21fa89d5b1a"
};

describe("lines without gaps and outlines without holes", () => {
  it("morph as on main, byte for byte: every frame's calls, both ways, from the start and part way, and end()", async () => {
    expect(await digests()).toEqual(MAIN);
  });
});

/**
 * The digests main (3547035, whose morph is 0.6.0's) gave, with this file's digests() run there, for lines that
 * pair by length, with gaps and without, a crossfade with gaps, and closed outlines with holes.
 */
const MAIN_BY_LENGTH: Readonly<Record<string, string>> = {
  "a spiral and a line": "367682f7901e8b61",
  "a scatter trail and a line": "2a88db2c80fef5df",
  "a line with a step straight up and a line": "587f3f521f77b89f",
  "a line of one point and a line": "b1b7f52d66fe03cb",
  "a line with an arc and a line": "96bcdb57a5f4b8e9",
  "two lines that run opposite ways": "de99af2bba94e47f",
  "a scatter trail with a gap and a line with one": "5e0b918569ccee8e",
  "two lines with gaps that run opposite ways": "7afc17d60d672257",
  "a line with a gap and a slice": "43e6cfa441d797b2",
  "two rings": "91c252aa511fc2ce",
  "a ring and a disc": "1418adf9616faacb",
  "a shape with two holes and one with one": "2daff7e135e7df04",
  "a ring and three quarters of it": "e6fdb5b8f751bbfe"
};

describe("lines that don't each run one way across x, with gaps and without, and outlines with holes", () => {
  it("morph as on main, byte for byte: every frame's calls, both ways, from the start and part way, and end()", async () => {
    expect(await digests({ ...byLength, ...holedPairs })).toEqual(MAIN_BY_LENGTH);
  });
});
