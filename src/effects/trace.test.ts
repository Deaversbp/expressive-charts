import type { MarkGeometry } from "../core";
import { describe as build, easeInOutCubic } from "../core";
import { play, testContext, type DrawnPath, type TestContext } from "../core/testing";
import { fixtures, movedFixtures, type FixtureName } from "../testing/fixtures";
import { trace, type TraceOptions } from "./trace";

const bar: MarkGeometry = build.bar({ key: "Okafor", series: "goals", x: 0, y: 0, width: 200, height: 20, baseline: "left", radius: 4 });

const paths = (ctx: TestContext): DrawnPath[] => ctx.layer.drawn.filter((d): d is DrawnPath => d.kind === "path");
const only = (ctx: TestContext): DrawnPath => {
  const drawn = paths(ctx);
  expect(drawn).toHaveLength(1);
  return drawn[0]!;
};

describe("trace", () => {
  it("draws a stroke along the walk from its start, eased in and out over 500 ms, and it stays", async () => {
    const ctx = testContext();
    const running = trace().run(bar, ctx);
    // Before the first frame, a lone moveto at the start, which SVG doesn't stroke.
    expect(only(ctx).d).toBe("M0,10");
    ctx.clock.advance(125);
    expect(only(ctx).d).toBe(bar.slice(0, easeInOutCubic(0.25)));
    ctx.clock.advance(125);
    expect(only(ctx).d).toBe(bar.slice(0, 0.5));
    ctx.clock.advance(125);
    expect(only(ctx).d).toBe(bar.slice(0, easeInOutCubic(0.75)));
    expect(await play(ctx.clock, running, { frame: 125 })).toBe(125);
    expect(only(ctx)).toMatchObject({ d: bar.slice(0, 1), paint: { stroke: "mark", width: 3, opacity: 0.5, linecap: "round" } });
    // One path, updated in place, and the mark itself untouched.
    expect(ctx.layer.calls.filter((call) => call.op === "path")).toHaveLength(1);
    expect(ctx.mark.calls).toEqual([]);
  });

  it("ends with the picture end() draws: the whole stroke", async () => {
    const ran = testContext();
    await play(ran.clock, trace().run(bar, ran));
    const ended = testContext();
    trace().end(bar, ended);
    expect(ran.layer.picture()).toEqual(ended.layer.picture());
    expect(only(ended).d).toBe(bar.slice(0, 1));
  });

  it("takes its colour, width, opacity and duration from its options", async () => {
    const ctx = testContext();
    const elapsed = await play(ctx.clock, trace({ color: "series-3", width: 6, opacity: 1, duration: 800 }).run(bar, ctx), { frame: 10 });
    expect(elapsed).toBe(800);
    expect(only(ctx).paint).toEqual({ stroke: "series-3", width: 6, opacity: 1, linecap: "round" });
  });

  it("scales its duration by the motion mode with effect timing", async () => {
    // Analysis: 500 × 0.35 = 175 ms, inside the 140–300 ms clamp.
    const analysis = testContext({ mode: "analysis" });
    expect(await play(analysis.clock, trace().run(bar, analysis), { frame: 5 })).toBe(175);
    // Effects scaled ×2 by the page.
    const slower = testContext({ scaling: { presentation: { effect: { factor: 2 } } } });
    expect(await play(slower.clock, trace().run(bar, slower), { frame: 10 })).toBe(1000);
  });

  it.each([
    ["motion is off", { mode: "off" }, {}],
    ["its duration is 0", {}, { duration: 0 }]
  ] as const)("draws the whole stroke at once, with no frames, when %s", async (_case, context, options: TraceOptions) => {
    const ctx = testContext(context);
    const running = trace(options).run(bar, ctx);
    expect(ctx.clock.idle).toBe(true);
    await running;
    expect(only(ctx).d).toBe(bar.slice(0, 1));
  });

  it.each(Object.keys(fixtures).filter((name) => name !== "point") as FixtureName[])("runs the whole walk of a %s", async (name) => {
    const mark = fixtures[name];
    const ctx = testContext();
    await play(ctx.clock, trace().run(mark, ctx));
    expect(only(ctx).d).toBe(mark.slice(0, 1));
  });

  it("runs a stack's whole walk, across every segment, as one stroke", async () => {
    const stacked = fixtures.stacked;
    const ctx = testContext();
    await play(ctx.clock, trace().run(stacked, ctx));
    expect(only(ctx).d).toBe(stacked.slice(0, 1));
    expect(stacked.start).toEqual(stacked.segments![0]!.start);
    expect(stacked.end).toEqual(stacked.segments![1]!.end);
  });

  it("draws nothing on a point, and a run on one finishes at once", async () => {
    const ctx = testContext();
    const running = trace().run(fixtures.point, ctx);
    expect(ctx.clock.idle).toBe(true);
    await running;
    expect(ctx.layer.calls).toEqual([]);
    trace().end(fixtures.point, ctx);
    expect(ctx.layer.calls).toEqual([]);
  });

  it("follows the mark when it moves, mid-run and after", async () => {
    const ctx = testContext();
    const running = trace().run(bar, ctx);
    ctx.clock.advance(250);
    ctx.change(movedFixtures.bar);
    expect(only(ctx).d).toBe(movedFixtures.bar.slice(0, 0.5));
    await play(ctx.clock, running);
    expect(only(ctx).d).toBe(movedFixtures.bar.slice(0, 1));
    ctx.change(bar);
    expect(only(ctx).d).toBe(bar.slice(0, 1));

    const ended = testContext();
    trace().end(fixtures.line, ended);
    ended.change(movedFixtures.line);
    expect(only(ended).d).toBe(movedFixtures.line.slice(0, 1));
  });

  it("removes the stroke while the walk is under 0.5 px, and draws it whole when the mark grows one", async () => {
    const ctx = testContext();
    // A line revealed from its first point: no walk yet, so the run finishes at once at its end state.
    const first = build.line({ key: "goals", series: "goals", points: [{ x: 0, y: 100 }], width: 2 });
    await trace().run(first, ctx);
    expect(ctx.layer.drawn).toEqual([]);
    ctx.change(fixtures.line);
    expect(only(ctx).d).toBe(fixtures.line.slice(0, 1));
    ctx.change(first);
    expect(ctx.layer.drawn).toEqual([]);
  });

  it("stops where it is when aborted, and clearing removes the stroke", async () => {
    const ctx = testContext();
    const running = trace().run(bar, ctx);
    ctx.clock.advance(250);
    ctx.abort();
    await running;
    expect(only(ctx).d).toBe(bar.slice(0, 0.5));
    ctx.clear();
    expect(ctx.layer.drawn).toEqual([]);

    // Aborted before it starts: nothing is drawn.
    const early = testContext();
    early.abort();
    await trace().run(bar, early);
    expect(early.layer.calls).toEqual([]);
  });

  it("accepts 0 for its width, opacity and duration, and 1 for its opacity", () => {
    expect(() => trace({ width: 0, opacity: 0, duration: 0 })).not.toThrow();
    expect(() => trace({ opacity: 1 })).not.toThrow();
  });

  it.each([
    [{ duration: -1 }, /trace: duration must be 0 ms or more, got -1/],
    [{ duration: Number.NaN }, /duration must be 0 ms or more, got NaN/],
    [{ duration: Infinity }, /duration must be 0 ms or more, got Infinity/],
    [{ duration: "500" }, /duration must be 0 ms or more, got 500/],
    [{ width: -2 }, /trace: width must be 0 px or more, got -2/],
    [{ width: Number.NaN }, /width must be 0 px or more, got NaN/],
    [{ width: Infinity }, /width must be 0 px or more, got Infinity/],
    [{ opacity: -0.1 }, /trace: opacity must be from 0 to 1, got -0.1/],
    [{ opacity: 1.5 }, /opacity must be from 0 to 1, got 1.5/],
    [{ opacity: Number.NaN }, /opacity must be from 0 to 1, got NaN/],
    [{ color: "" }, /trace: color must be a theme token or a CSS colour, got ""/],
    [{ color: 3 }, /color must be a theme token or a CSS colour, got 3/]
  ])("throws a RangeError for %o", (options, message) => {
    expect(() => trace(options as unknown as TraceOptions)).toThrow(RangeError);
    expect(() => trace(options as unknown as TraceOptions)).toThrow(message);
  });
});
