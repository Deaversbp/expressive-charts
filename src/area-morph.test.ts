// Areas that morph by x (M15 step 3): two closed outlines that are each a band across the same x's,
// as d3.area() draws them, pair upper run with upper and lower with lower, by share of the span. And
// what isn't a band morphing as on main, byte for byte. Beside src/index.ts because it brings host
// path data and an effect together, as the layouts page's areas card does.

import { area, arc, curveLinear, curveMonotoneX, curveStep, type CurveFactory } from "d3-shape";
import { describe as build, easeInOutCubic, matrix, type MarkGeometry, type Point } from "./core";
import { flush, play, testContext, type TestContext } from "./core/testing";
import type { Drawn, Picture } from "./core/testing/recording";
import { morph } from "./effects";
import { checkTransition } from "./testing/check";
import { fixtures, movedFixtures } from "./testing/fixtures";

type Context = TestContext & { readonly start: number };
const context = (start = 0): Context => ({ ...testContext(), start });

// Two bands over ten weeks in a 600 × 200 px plot, shots on target below and off target above: stacked
// against a scale of 13, and as shares of 100%. The planning probe's data (M15).
const W = 600;
const H = 200;
const ON = [3, 5, 4, 6, 2, 7, 5, 4, 6, 3];
const OFF = [6, 4, 7, 5, 8, 4, 6, 7, 3, 6];
const WEEKS = ON.map((_, i) => i);
const xOf =
  (width: number, left = 0) =>
  (i: number): number =>
    left + (i / (WEEKS.length - 1)) * width;
const X = WEEKS.map(xOf(W));
const stackedY = (v: number): number => H - (v / 13) * H;
const shareY = (f: number): number => H - f * H;
const floor = WEEKS.map(() => H);
const stackedOn = ON.map(stackedY);
const stackedOff = ON.map((v, i) => stackedY(v + OFF[i]!));
const shareOn = ON.map((v, i) => shareY(v / (v + OFF[i]!)));
const shareOff = WEEKS.map(() => 0);

/** A band as d3.area() writes it: its top (y1) left to right, then its base (y0) right to left, closed. */
function bandPath(base: readonly number[], top: readonly number[], curve: CurveFactory = curveLinear, x = xOf(W), weeks: readonly number[] = WEEKS): string {
  return area<number>()
    .x((i) => x(i))
    .y0((i) => base[i]!)
    .y1((i) => top[i]!)
    .curve(curve)(weeks)!;
}
const band = (key: string, base: readonly number[], top: readonly number[], curve?: CurveFactory, x?: (i: number) => number, weeks?: readonly number[]): MarkGeometry =>
  build.shape({ key, series: key, d: bandPath(base, top, curve, x, weeks) });
/** A band with weeks missing, as d3.area().defined() draws it: a loop for each run of weeks. */
const missing = (key: string, base: readonly number[], top: readonly number[], gone: readonly number[], curve: CurveFactory = curveLinear): MarkGeometry =>
  build.shape({
    key,
    series: key,
    d: area<number>()
      .defined((i) => !gone.includes(i))
      .x(xOf(W))
      .y0((i) => base[i]!)
      .y1((i) => top[i]!)
      .curve(curve)(WEEKS)!
  });

/** A band as it is in each view, its base and its top at each week: stacked, then at 100%. */
interface Views {
  readonly stacked: { readonly base: readonly number[]; readonly top: readonly number[] };
  readonly share: { readonly base: readonly number[]; readonly top: readonly number[] };
}
const BANDS: Readonly<Record<string, Views>> = {
  "the lower band (on target)": { stacked: { base: floor, top: stackedOn }, share: { base: floor, top: shareOn } },
  "the upper band (off target)": { stacked: { base: stackedOn, top: stackedOff }, share: { base: shareOn, top: shareOff } }
};
const CURVES: Readonly<Record<string, CurveFactory>> = { straight: curveLinear, "with curveMonotoneX": curveMonotoneX };

/** Each band, straight and curved, stacked and at 100%, with its weeks' tops and bases in each view. */
const cases = Object.entries(CURVES).flatMap(([curveName, curve]) =>
  Object.entries(BANDS).map(([bandName, views]) => ({
    name: `${bandName}, ${curveName}`,
    views,
    stacked: band("b", views.stacked.base, views.stacked.top, curve),
    share: band("b", views.share.base, views.share.top, curve)
  }))
);
const bandPairs = (): Record<string, readonly [MarkGeometry, MarkGeometry]> => Object.fromEntries(cases.map(({ name, stacked, share }) => [name, [stacked, share] as const]));

/** The subpaths of path data of M, L and Z, each as its points in order, without the one Z returns to. */
function subpaths(d: string): Point[][] {
  return d
    .split("M")
    .filter((part) => part.length > 0)
    .map((part) => {
      const numbers = (part.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
      const points: Point[] = [];
      for (let i = 0; i + 1 < numbers.length; i += 2) points.push({ x: numbers[i]!, y: numbers[i + 1]! });
      return points;
    });
}

const dOf = (item: Picture | Drawn | undefined): string => (item?.kind === "path" ? item.d : "");
const mix = (a: number, b: number, p: number): number => a * (1 - p) + b * p;
const near = (a: Point, b: Point, within = 0.01): boolean => Math.abs(a.x - b.x) <= within && Math.abs(a.y - b.y) <= within;

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

/** A run's picture before its first frame. */
async function opening(from: MarkGeometry, to: MarkGeometry, start: number): Promise<readonly Picture[]> {
  const ctx = context(start);
  void morph().run(from, to, ctx);
  await flush();
  return ctx.layer.picture();
}

/** The frames strictly between the first and the last. */
const middles = <F extends { readonly p: number }>(all: readonly F[]): F[] => all.filter(({ p }) => p > 0 && p < 1);

describe("two bands across the same x's, as d3.area() draws them, stacked and at 100%", () => {
  for (const { name, views, stacked, share } of cases) {
    describe(name, () => {
      it("keeps each week's x on every frame, on both runs, within 0.01 px: its top and its base each move straight up or down", async () => {
        for (const [from, to, a, b] of [
          [stacked, share, views.stacked, views.share],
          [share, stacked, views.share, views.stacked]
        ] as const) {
          for (const { p, drawn } of middles(await frames(from, to))) {
            expect(drawn).toHaveLength(1);
            const [outside] = subpaths(dOf(drawn[0]));
            for (const i of WEEKS) {
              const top = { x: X[i]!, y: mix(a.top[i]!, b.top[i]!, p) };
              const base = { x: X[i]!, y: mix(a.base[i]!, b.base[i]!, p) };
              expect(outside!.some((point) => near(point, top)), `week ${i}'s top at ${p}`).toBe(true);
              expect(outside!.some((point) => near(point, base)), `week ${i}'s base at ${p}`).toBe(true);
            }
          }
        }
      });

      it("moves no point sideways: every frame's points have the x's the first one's have (main's paired samples slid up to 26.1 px on the lower band, 63.4 px on the upper)", async () => {
        const drawn = middles(await frames(stacked, share)).map(({ drawn }) => subpaths(dOf(drawn[0]))[0]!);
        const [first] = drawn;
        for (const points of drawn) {
          expect(points).toHaveLength(first!.length);
          expect(Math.max(...points.map((point, k) => Math.abs(point.x - first![k]!.x)))).toBeLessThan(0.01);
        }
      });

      it("pairs its corners with the corners: from the top left along the top, down the right end, back along the base and up the left end", async () => {
        const corners = (v: Views["stacked"]) => ({
          topLeft: { x: 0, y: v.top[0]! },
          topRight: { x: W, y: v.top[9]! },
          baseRight: { x: W, y: v.base[9]! },
          baseLeft: { x: 0, y: v.base[0]! }
        });
        const [a, b] = [corners(views.stacked), corners(views.share)];
        const at = (key: keyof typeof a, p: number): Point => ({ x: mix(a[key].x, b[key].x, p), y: mix(a[key].y, b[key].y, p) });
        for (const { p, drawn } of middles(await frames(stacked, share))) {
          const points = subpaths(dOf(drawn[0]))[0]!;
          expect(near(points[0]!, at("topLeft", p))).toBe(true);
          expect(near(points[points.length - 1]!, at("baseLeft", p))).toBe(true);
          // The right end: the top's last point, then the base's first.
          const right = points.findIndex((point, k) => near(point, at("topRight", p)) && near(points[k + 1] ?? point, at("baseRight", p)));
          expect(right).toBeGreaterThan(0);
          // Every point before it on the top, left to right; every one after it on the base, right to left.
          points.slice(1, right + 1).forEach((point, k) => expect(point.x).toBeGreaterThan(points[k]!.x));
          points.slice(right + 2).forEach((point, k) => expect(point.x).toBeLessThan(points[right + 1 + k]!.x));
        }
      });

      it("draws each band's own outline on its first and last frames", async () => {
        const all = await frames(stacked, share);
        expect(dOf(all[0]!.drawn[0])).toBe(stacked.outline.d);
        expect(dOf(all[all.length - 1]!.drawn[0])).toBe(share.outline.d);
        expect(all[all.length - 1]!.drawn).toHaveLength(1);
      });

      it("retraces: a switch back mid-way begins with the picture the switch there drew", async () => {
        for (const p of [0.2, 0.5, 0.83]) expect(await opening(share, stacked, 1 - p)).toEqual(await opening(stacked, share, p));
      });

      it("runs from start: the picture there, each week's x kept, and the target's own outline at the end", async () => {
        const ctx = context(0.37);
        const running = morph().run(stacked, share, ctx);
        await flush();
        const [outside] = subpaths(dOf(ctx.layer.picture()[0]));
        for (const i of WEEKS) expect(outside!.some((point) => near(point, { x: X[i]!, y: mix(views.stacked.top[i]!, views.share.top[i]!, 0.37) }))).toBe(true);
        await play(ctx.clock, running);
        expect(ctx.layer.picture()).toEqual([{ kind: "path", d: share.outline.d, paint: { fill: "mark" } }]);
      });
    });
  }
});

/** Whether a point is inside a polygon (even-odd), its edges given by its points in order. */
function inside(point: Point, polygon: readonly Point[]): boolean {
  let within = false;
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    if (p.y > point.y !== q.y > point.y && point.x < p.x + ((point.y - p.y) * (q.x - p.x)) / (q.y - p.y)) within = !within;
  });
  return within;
}

// A band with a square hole, as describe.shape reads one: its outside, then the hole the other way round.
const squareHole = (x: number, y: number, size: number): string => `M${x},${y}v${size}h${size}v${-size}Z`;
const square = (x: number, y: number, size: number): string => `M${x},${y}h${size}v${size}h${-size}Z`;
const highTop = WEEKS.map((i) => 40 + 10 * Math.sin(i));
const higherTop = WEEKS.map((i) => 20 + 10 * Math.cos(i));
const holed = build.shape({ key: "h", d: bandPath(floor, highTop) + squareHole(200, 120, 50) });
const otherHoled = build.shape({ key: "h", d: bandPath(floor, higherTop, curveMonotoneX) + squareHole(240, 90, 70) });
const unholed = build.shape({ key: "h", d: bandPath(floor, higherTop, curveMonotoneX) });

describe("a band with a hole", () => {
  it("keeps each week's x on its outside, and morphs its hole as main does, the hole's points on every frame those of the same hole in a square", async () => {
    // A square isn't a band, so its morph is main's, and a hole with a partner pairs with it alone.
    const [inBand, inSquare] = await Promise.all([
      frames(holed, otherHoled),
      frames(build.shape({ key: "h", d: square(0, 0, 600) + squareHole(200, 120, 50) }), build.shape({ key: "h", d: square(0, 0, 600) + squareHole(240, 90, 70) }))
    ]);
    expect(inBand).toHaveLength(inSquare.length);
    middles(inBand).forEach(({ p, drawn }, k) => {
      const [outside, hole, ...rest] = subpaths(dOf(drawn[0]));
      expect(rest).toEqual([]);
      expect(hole).toEqual(subpaths(dOf(middles(inSquare)[k]!.drawn[0]))[1]);
      for (const i of WEEKS) expect(outside!.some((point) => near(point, { x: X[i]!, y: mix(highTop[i]!, higherTop[i]!, p) }))).toBe(true);
    });
  });

  it("closes a hole with no partner by half way, inside the band on every frame, both ways", async () => {
    for (const [from, to] of [
      [holed, unholed],
      [unholed, holed]
    ] as const) {
      for (const { p, drawn } of middles(await frames(from, to))) {
        const [outside, hole, ...rest] = subpaths(dOf(drawn[0]));
        expect(rest).toEqual([]);
        if ((from === holed ? p : 1 - p) >= 0.5) expect(hole).toBeUndefined();
        for (const point of hole ?? []) expect(inside(point, outside!), `${point.x},${point.y} at ${p}`).toBe(true);
      }
    }
  });
});

describe("an area with weeks missing: a loop for each run of weeks", () => {
  // Week 4 missing in both views: weeks 0 to 3 and 5 to 9, the second the longer loop in each.
  const gappedStacked = missing("on", floor, stackedOn, [4]);
  const gappedShare = missing("on", floor, shareOn, [4]);

  it("pairs its longest loops by x when they span the same x's, and morphs the other loop as main does, as a hole is", async () => {
    // The other loop is morphed as a hole is: so the same loop beside a square, the outside, morphs it the same.
    const [gapped, beside] = await Promise.all([
      frames(gappedStacked, gappedShare),
      frames(
        build.shape({ key: "on", d: square(0, 300, 700) + bandPath(floor, stackedOn, curveLinear, xOf(W), [0, 1, 2, 3]) }),
        build.shape({ key: "on", d: square(0, 300, 700) + bandPath(floor, shareOn, curveLinear, xOf(W), [0, 1, 2, 3]) })
      )
    ]);
    middles(gapped).forEach(({ p, drawn }, k) => {
      const [longest, other, ...rest] = subpaths(dOf(drawn[0]));
      expect(rest).toEqual([]);
      for (const i of [5, 6, 7, 8, 9]) {
        expect(longest!.some((point) => near(point, { x: X[i]!, y: mix(stackedOn[i]!, shareOn[i]!, p) })), `week ${i}`).toBe(true);
        expect(longest!.some((point) => near(point, { x: X[i]!, y: H }))).toBe(true);
      }
      expect(other).toEqual(subpaths(dOf(middles(beside)[k]!.drawn[0]))[1]);
    });
  });
});

describe("two dense bands", () => {
  // 3,000 x's a run: more than VERTICES, so each run's stops are its first, last, highest and lowest in each of 250 columns.
  const many = Array.from({ length: 3000 }, (_, i) => i);
  const dense = (top: (i: number) => number): MarkGeometry =>
    build.shape({
      key: "d",
      d: area<number>()
        .x((i) => i / 5)
        .y0(H)
        .y1(top)(many)!
    });
  const a = dense((i) => 100 + 40 * Math.sin(i / 37));
  const b = dense((i) => 60 + 30 * Math.cos(i / 23));

  it("take at most 1,000 vertices of a run as stops, besides the even shares, and draw their own outlines first and last", async () => {
    const all = await frames(a, b);
    expect(dOf(all[0]!.drawn[0])).toBe(a.outline.d);
    expect(dOf(all[all.length - 1]!.drawn[0])).toBe(b.outline.d);
    for (const { drawn } of middles(all)) {
      const points = subpaths(dOf(drawn[0]))[0]!;
      expect(points.length).toBeLessThanOrEqual(2 * (160 + 2 * 1000));
      expect(points.length).toBeGreaterThan(160);
    }
  });
});

describe("checkTransition", () => {
  it("passes on two bands, a band with a hole, one losing it, an area with weeks missing and two dense bands, with each align and at 12 points", async () => {
    const pairs = {
      ...bandPairs(),
      "two bands with holes": [holed, otherHoled] as const,
      "a band with a hole and one without": [holed, unholed] as const,
      "two areas missing the same week": [missing("on", floor, stackedOn, [4]), missing("on", floor, shareOn, [4])] as const
    };
    for (const options of [{}, { align: "drop" }, { points: 12 }] as const) await checkTransition(morph(options), { name: "morph", pairs });
  });
});

/** A D3 ring about (cx, cy): its outer edge, then its hole, the other way round. */
const ring = (key: string, cx: number, cy: number, inner: number, outer: number): MarkGeometry =>
  build.shape({ key, d: arc()({ innerRadius: inner, outerRadius: outer, startAngle: 0, endAngle: 2 * Math.PI })!, matrix: matrix.translate(cx, cy) });

/**
 * What isn't a band, or isn't two bands across the same x's: each morphs as on main. A bar and a column; two columns over
 * the same x span, as stacked and 100% columns are (a rectangle's top and base are runs of one piece each); slices,
 * points and lines; shapes with holes; Vega's bars and columns drawn as paths; two bands over different x's; a band and
 * a bar or a line; two areas over two weeks (runs of one piece); triangles on one base; two step areas, whose runs go
 * straight up; and areas with weeks missing whose longest loops are different runs of weeks.
 */
function notBands(): Record<string, readonly [MarkGeometry, MarkGeometry]> {
  const column = (key: string, y: number, height: number): MarkGeometry => build.bar({ key, series: "goals", x: 40, y, width: 30, height, baseline: "bottom" });
  return {
    "a bar and a column": [fixtures.bar, fixtures.column],
    "two columns over the same x span, stacked and at 100%": [column("goals@A", 110, 90), column("goals@A", 80, 120)],
    "two floating columns over the same x span": [column("assists@A", 60, 50), column("assists@A", 0, 80)],
    "a slice and a column": [fixtures.slice, fixtures.column],
    "two slices": [fixtures.slice, movedFixtures.slice],
    "a point and a column": [fixtures.point, fixtures.column],
    "two points": [fixtures.point, movedFixtures.point],
    "two lines": [fixtures.line, movedFixtures.line],
    "two rings": [ring("goals", 100, 100, 40, 60), ring("xg", 300, 150, 70, 116)],
    "a shape with two holes and one with one": [
      build.shape({ key: "a", d: square(0, 0, 200) + squareHole(20, 20, 30) + squareHole(80, 80, 100) }),
      build.shape({ key: "b", d: square(0, 0, 200) + squareHole(40, 40, 120) })
    ],
    "a Vega bar drawn as a path and a column": [build.shape({ key: "v", d: "M0,122h204v36h-204Z" }), fixtures.column],
    "two Vega bars drawn as paths": [build.shape({ key: "v", d: "M0,122h204v36h-204Z" }), build.shape({ key: "v", d: "M0,122h150v36h-150Z" })],
    "two Vega columns drawn as paths over the same x span": [build.shape({ key: "v", d: "M10,50h30v100h-30Z" }), build.shape({ key: "v", d: "M10,0h30v150h-30Z" })],
    "two bands over different x's: plots of two widths": [band("on", floor, stackedOn), band("on", floor, shareOn, curveLinear, xOf(480))],
    "two bands over different x's: a left end moved": [band("on", floor, stackedOn, curveMonotoneX), band("on", floor, shareOn, curveMonotoneX, xOf(540, 60))],
    "a band and a column": [band("on", floor, stackedOn), fixtures.column],
    "a band and a line": [band("on", floor, stackedOn), fixtures.line],
    "two areas over two weeks": [band("on", floor, stackedOn, curveLinear, xOf(W), [0, 1]), band("on", floor, shareOn, curveLinear, xOf(W), [0, 1])],
    "two triangles on one base": [build.shape({ key: "t", d: "M0,200L300,40L600,200Z" }), build.shape({ key: "t", d: "M0,200L300,120L600,200Z" })],
    "two step areas": [band("on", floor, stackedOn, curveStep), band("on", floor, shareOn, curveStep)],
    "an area with a week missing and the same area whole": [missing("on", floor, stackedOn, [4]), band("on", floor, stackedOn)],
    "two areas missing different weeks, their longest runs of weeks apart": [missing("on", floor, stackedOn, [4]), missing("on", floor, shareOn, [6])]
  };
}

/**
 * Every call each run makes on its layer, frame by frame: on each pair, both ways, as it's given, dropped and at 12
 * points, from the start and part way, and what end() draws. A digest a pair. As src/effects/morph.test.ts's digests().
 */
async function digests(pairs: Readonly<Record<string, readonly [MarkGeometry, MarkGeometry]>>): Promise<Record<string, string>> {
  // Numbers rounded to 1e-9, as path data is to 0.001: the last bits of the eased progress differ between Node 22 and 24.
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
          await play(ctx.clock, morph(options).run(from, to, ctx));
          log += serial(ctx.layer.calls);
        }
        const ended = context();
        morph(options).end(from, to, ended);
        log += serial(ended.layer.calls);
      }
    }
    out[name] = hash(log);
  }
  return out;
}

/** The digests main (f5900e9, whose morph is 0.9.0's) gave, with this file's digests() run there, before bands paired by x. */
const MAIN: Readonly<Record<string, string>> = {
  "a bar and a column": "15d003d7be32b370",
  "two columns over the same x span, stacked and at 100%": "df1b6add7da66750",
  "two floating columns over the same x span": "43a0a45a40d916da",
  "a slice and a column": "4e71e24a7caab38a",
  "two slices": "e54b3a77cb79c4b9",
  "a point and a column": "3ee63627e6172962",
  "two points": "4d5c06fb489e3540",
  "two lines": "a508d8f4c4d66876",
  "two rings": "91c252aa511fc2ce",
  "a shape with two holes and one with one": "80003d36edbd3017",
  "a Vega bar drawn as a path and a column": "7f0deff58c738925",
  "two Vega bars drawn as paths": "faaa7eb1d24c452e",
  "two Vega columns drawn as paths over the same x span": "a897f2bbc553f51d",
  "two bands over different x's: plots of two widths": "8a94a14e0607ff64",
  "two bands over different x's: a left end moved": "2e2852a79919c4c9",
  "a band and a column": "ece0ad93e743c86a",
  "a band and a line": "be810d4f2ea1a186",
  "two areas over two weeks": "241f37beb3c5538e",
  "two triangles on one base": "d4d47a010378993f",
  "two step areas": "8adefabbe06506f5",
  "an area with a week missing and the same area whole": "9e533cf36b81d301",
  "two areas missing different weeks, their longest runs of weeks apart": "6c95a3c0842e10a5"
};

describe("what isn't two bands across the same x's", () => {
  it("morphs as on main, byte for byte: every frame's calls, both ways, from the start and part way, and end()", async () => {
    expect(await digests(notBands())).toEqual(MAIN);
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
