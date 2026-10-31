import type { MarkData, MarkGeometry } from "../core";
import { createMotion, describe as build, easeInOutCubic, manualClock } from "../core";
import { createRunner } from "../core/runner";
import { drawnInGaps, play, recordingSurface, testContext, type DrawnPath, type TestContext } from "../core/testing";
import { fixtures, movedFixtures } from "../testing/fixtures";
import { drawIn, type DrawInOptions } from "./draw-in";

const paths = (ctx: TestContext): DrawnPath[] => ctx.layer.drawn.filter((d): d is DrawnPath => d.kind === "path");
/** Each part's path data, from the first. */
const ds = (ctx: TestContext): string[] => paths(ctx).map((path) => path.d);

/** A stack of three, from the baseline: 150, 90 and 60 px drawn, the 2 px gaps between them coming out of the later two. */
const stack = build.bar({
  key: "Okafor",
  x: 0,
  y: 0,
  width: 304,
  height: 20,
  baseline: "left",
  radius: 4,
  gap: 2,
  segments: [
    { series: "goals", size: 150 },
    { series: "assists", size: 92 },
    { series: "xg", size: 62 }
  ]
});
const curve = build.shape({ key: "xg", series: "xg", d: "M0,100C40,0 80,0 120,100S200,180 240,60", width: 3 });
const area = build.shape({ key: "area", d: "M0,0L100,0L100,50L0,50Z" });

const marks: Record<string, MarkGeometry> = {
  line: fixtures.line,
  "line with a gap": fixtures["gapped line"],
  curve,
  bar: fixtures.bar,
  column: fixtures.column,
  "negative bar": fixtures["negative bar"],
  slice: fixtures.slice
};

describe("drawIn", () => {
  it.each(Object.keys(marks))(
    "draws a %s in along its walk at its width, eased in and out over 750 ms over its body at 0.3, then gives it back at full strength with nothing drawn",
    async (name) => {
      const mark = marks[name]!;
      const [part, ...more] = mark.segments ?? [mark];
      expect(more).toEqual([]);
      const ctx = testContext();
      const running = drawIn().run(mark, ctx);
      expect(ctx.mark.style).toEqual({ opacity: 0.3 });
      // Before the first frame, a lone moveto at the start, which SVG doesn't stroke.
      expect(ds(ctx)).toEqual([part!.slice(0, 0)]);
      for (const t of [0.25, 0.5, 0.75]) {
        ctx.clock.advance(187.5);
        expect(ds(ctx)).toEqual([part!.slice(0, easeInOutCubic(t))]);
        expect(ctx.mark.style).toEqual({ opacity: 0.3 });
      }
      expect(paths(ctx)[0]!.paint).toEqual({ stroke: "mark", width: part!.thickness, linecap: "butt", ...(mark.segments ? { part: part!.key } : {}) });
      // One path, updated in place.
      expect(ctx.layer.calls.filter((call) => call.op === "path")).toHaveLength(1);
      expect(await play(ctx.clock, running, { frame: 187.5 })).toBe(187.5);
      expect(ctx.layer.drawn).toEqual([]);
      expect(ctx.mark.style).toEqual({});
      expect(ctx.mark.calls).toEqual([
        { op: "set", style: { opacity: 0.3 } },
        { op: "set", style: { opacity: undefined } }
      ]);
    }
  );

  it("draws each segment of a stack in turn, each in its own colour, each taking its share of the time by its share of the length", async () => {
    const segments = stack.segments!;
    expect(segments.map((segment) => segment.length)).toEqual([150, 90, 60]);
    const ctx = testContext();
    const running = drawIn().run(stack, ctx);
    expect(paths(ctx).map((path) => path.paint)).toEqual(segments.map((segment) => ({ stroke: "mark", width: 20, linecap: "butt", part: segment.key })));
    expect(paths(ctx).map((path) => path.paint.part)).toEqual(["Okafor/goals", "Okafor/assists", "Okafor/xg"]);
    const at = (...shares: number[]): string[] => segments.map((segment, i) => segment.slice(0, easeInOutCubic(shares[i]!)));
    // Goals takes half the time (150 of 300 px), assists 30% and xG 20%: 375, 225 and 150 ms.
    const frames: [ms: number, shares: number[]][] = [
      [187.5, [0.5, 0, 0]],
      [375, [1, 0, 0]],
      [487.5, [1, 0.5, 0]],
      [600, [1, 1, 0]],
      [675, [1, 1, 0.5]]
    ];
    let now = 0;
    for (const [ms, shares] of frames) {
      ctx.clock.advance(ms - now);
      now = ms;
      expect(ds(ctx), `at ${ms} ms`).toEqual(at(...shares));
      expect(ctx.mark.style).toEqual({ opacity: 0.3 });
    }
    await play(ctx.clock, running, { frame: 75 });
    expect(ctx.layer.drawn).toEqual([]);
    expect(ctx.mark.style).toEqual({});
  });

  it.each([
    ["a point", fixtures.point],
    ["a closed shape", area]
  ])("finishes at once on %s, with nothing drawn and the mark untouched", async (_name, mark) => {
    expect(mark.length).toBeLessThan(0.5);
    const ctx = testContext();
    const running = drawIn().run(mark, ctx);
    expect(ctx.clock.idle).toBe(true);
    await running;
    expect(ctx.layer.calls).toEqual([]);
    expect(ctx.mark.calls).toEqual([]);
  });

  it("follows the mark when it moves or grows part way, at the same progress, and draws nothing once it's done", async () => {
    const ctx = testContext();
    const running = drawIn().run(fixtures.slice, ctx);
    ctx.clock.advance(375);
    // The slice turned, and its ring 40 px wide from 46.
    ctx.change(movedFixtures.slice);
    expect(paths(ctx).map((path) => [path.d, path.paint.width])).toEqual([[movedFixtures.slice.slice(0, 0.5), 40]]);
    ctx.clock.advance(187.5);
    expect(ds(ctx)).toEqual([movedFixtures.slice.slice(0, easeInOutCubic(0.75))]);
    await play(ctx.clock, running);
    ctx.change(fixtures.slice);
    expect(ctx.layer.drawn).toEqual([]);
    expect(ctx.mark.style).toEqual({});

    // A stack in another ratio: the time is shared again by the new lengths, 120 and 80 px.
    const stacked = testContext();
    void drawIn().run(fixtures.stacked, stacked);
    stacked.clock.advance(375);
    stacked.change(movedFixtures.stacked);
    const [goals, assists] = movedFixtures.stacked.segments!;
    expect([goals!.length, assists!.length]).toEqual([120, 80]);
    expect(ds(stacked)).toEqual([goals!.slice(0, easeInOutCubic(100 / 120)), assists!.slice(0, 0)]);

    // A bar growing in as a chart draws it, from nothing: drawn on it as it is, at the progress.
    const grown = (width: number): MarkGeometry => build.bar({ key: "Okafor", series: "goals", x: 0, y: 0, width, height: 20, baseline: "left" });
    const growing = testContext();
    void drawIn().run(grown(200), growing);
    growing.change(grown(0));
    growing.clock.advance(375);
    expect(ds(growing)).toEqual([grown(0).segments![0]!.slice(0, 0)]);
    growing.change(grown(100));
    expect(ds(growing)).toEqual([grown(100).segments![0]!.slice(0, 0.5)]);
  });

  it("draws nothing in a line's gap, on any frame", async () => {
    const mark = fixtures["gapped line"];
    const ctx = testContext();
    const running = drawIn().run(mark, ctx);
    for (let ms = 0; ms <= 750; ms += 10) {
      expect(drawnInGaps(mark, ctx.layer.drawn), `${ms} ms in`).toEqual([]);
      ctx.clock.advance(10);
    }
    await running;
  });

  it("takes its duration and how faint the mark goes from its options", async () => {
    const ctx = testContext();
    const running = drawIn({ duration: 400, faint: 0.5 }).run(fixtures.line, ctx);
    expect(ctx.mark.style).toEqual({ opacity: 0.5 });
    ctx.clock.advance(200);
    expect(ds(ctx)).toEqual([fixtures.line.slice(0, 0.5)]);
    expect(await play(ctx.clock, running, { frame: 10 })).toBe(200);
  });

  it("scales its duration by the motion mode with effect timing, capped in Analysis", async () => {
    // Analysis: 750 × 0.35 = 262.5 ms, inside the 140–300 ms clamp; 2,000 × 0.35 is capped at 300.
    const analysis = testContext({ mode: "analysis" });
    expect(await play(analysis.clock, drawIn().run(fixtures.bar, analysis), { frame: 0.5 })).toBe(262.5);
    const longer = testContext({ mode: "analysis" });
    expect(await play(longer.clock, drawIn({ duration: 2000 }).run(fixtures.bar, longer), { frame: 5 })).toBe(300);
    // Effects scaled ×2 by the page.
    const slower = testContext({ scaling: { presentation: { effect: { factor: 2 } } } });
    expect(await play(slower.clock, drawIn().run(fixtures.bar, slower), { frame: 10 })).toBe(1500);
  });

  it.each([
    ["motion is off", { mode: "off" }, {}],
    ["its duration is 0", {}, { duration: 0 }]
  ] as const)("ends at once, with no frames, when %s: the mark as it is, with nothing drawn", async (_case, context, options: DrawInOptions) => {
    const ctx = testContext(context);
    const running = drawIn(options).run(stack, ctx);
    expect(ctx.clock.idle).toBe(true);
    await running;
    expect(ctx.layer.drawn).toEqual([]);
    expect(ctx.mark.style).toEqual({});
  });

  it("leaves the mark as it is in end(), so motion off and reduced motion show it at once", () => {
    for (const mark of [stack, ...Object.values(marks), fixtures.point]) {
      const ctx = testContext();
      drawIn().end(mark, ctx);
      ctx.change(movedFixtures.bar);
      expect(ctx.layer.calls).toEqual([]);
      expect(ctx.mark.calls).toEqual([]);
    }

    // Through a runner, as a chart's first draw starts enter: reduced motion ends it at once.
    const data: MarkData = { datum: undefined, samples: [], related: () => undefined };
    const surface = recordingSurface();
    const motion = createMotion({ reducedMotion: { matches: true, subscribe: () => () => {} } });
    const clock = manualClock();
    createRunner({ effects: { enter: drawIn() }, surface, motion, clock }).enter([{ mark: stack, data }]);
    expect(clock.idle).toBe(true);
    expect(surface.groups).toEqual([]);
    expect(surface.mark("Okafor").calls).toEqual([]);
  });

  it("gives the mark back its style, with nothing drawn, when aborted or cleared part way", async () => {
    const aborted = testContext();
    const running = drawIn().run(stack, aborted);
    aborted.clock.advance(375);
    aborted.abort();
    await running;
    expect(aborted.layer.drawn).toEqual([]);
    expect(aborted.mark.style).toEqual({});
    expect(aborted.clock.idle).toBe(true);

    const cleared = testContext();
    const clearing = drawIn().run(stack, cleared);
    cleared.clock.advance(375);
    cleared.clear();
    await clearing;
    expect(cleared.layer.drawn).toEqual([]);
    expect(cleared.mark.style).toEqual({});
    expect(cleared.clock.idle).toBe(true);

    // Aborted before it starts: nothing at all.
    const early = testContext();
    early.abort();
    await drawIn().run(stack, early);
    expect(early.layer.calls).toEqual([]);
    expect(early.mark.calls).toEqual([]);
  });

  it("accepts 0 for its duration, and 0 and 1 for how faint", () => {
    expect(() => drawIn({ duration: 0, faint: 0 })).not.toThrow();
    expect(() => drawIn({ faint: 1 })).not.toThrow();
  });

  it.each([
    [{ duration: -1 }, /drawIn: duration must be 0 ms or more, got -1/],
    [{ duration: Number.NaN }, /duration must be 0 ms or more, got NaN/],
    [{ duration: Infinity }, /duration must be 0 ms or more, got Infinity/],
    [{ duration: "750" }, /duration must be 0 ms or more, got 750/],
    [{ faint: -0.1 }, /drawIn: faint must be from 0 to 1, got -0.1/],
    [{ faint: 1.5 }, /faint must be from 0 to 1, got 1.5/],
    [{ faint: Number.NaN }, /faint must be from 0 to 1, got NaN/],
    [{ faint: "0.3" }, /faint must be from 0 to 1, got 0.3/]
  ])("throws a RangeError for %o", (options, message) => {
    expect(() => drawIn(options as unknown as DrawInOptions)).toThrow(RangeError);
    expect(() => drawIn(options as unknown as DrawInOptions)).toThrow(message);
  });
});
