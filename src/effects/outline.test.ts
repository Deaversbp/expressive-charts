import type { MarkGeometry } from "../core";
import { describe as build } from "../core";
import { play, testContext, type DrawnPath, type TestContext } from "../core/testing";
import { fixtures, movedFixtures, type FixtureName } from "../testing/fixtures";
import { outline } from "./outline";

/** A closed shape with no direction: a country, a tile. */
const tile: MarkGeometry = build.shape({ key: "North", d: "M0,0L80,0L80,40L0,40Z" });

const paths = (ctx: TestContext): DrawnPath[] => ctx.layer.drawn.filter((d): d is DrawnPath => d.kind === "path");
const only = (ctx: TestContext): DrawnPath => {
  const drawn = paths(ctx);
  expect(drawn).toHaveLength(1);
  return drawn[0]!;
};

describe("outline", () => {
  it("draws the mark's outline at once, unfilled, in the text colour at 2 px, with no frames", async () => {
    const ctx = testContext();
    const running = outline().run(tile, ctx);
    // Drawn before the run resolves, and with nothing on the clock: there's no tween.
    expect(only(ctx)).toMatchObject({ d: tile.outline.d, paint: { stroke: "text", width: 2 } });
    expect(only(ctx).paint.fill).toBeUndefined();
    expect(ctx.clock.idle).toBe(true);
    expect(await play(ctx.clock, running)).toBe(0);
    expect(only(ctx).d).toBe(tile.outline.d);
  });

  it("draws nothing on the mark itself", async () => {
    const ctx = testContext();
    await outline().run(tile, ctx);
    expect(ctx.mark.calls).toEqual([]);
    expect(ctx.layer.calls.filter((call) => call.op === "path")).toHaveLength(1);
  });

  it("ends with the picture end() draws, in every motion mode", async () => {
    const ended = testContext();
    outline().end(tile, ended);
    for (const mode of ["presentation", "analysis", "off"] as const) {
      const ran = testContext({ mode });
      await outline().run(tile, ran);
      expect(ran.layer.picture()).toEqual(ended.layer.picture());
    }
  });

  it("takes its colour and width from its options", () => {
    const ctx = testContext();
    outline({ color: "series-3", width: 1.5 }).end(tile, ctx);
    expect(only(ctx).paint).toEqual({ stroke: "series-3", width: 1.5 });
    const css = testContext();
    outline({ color: "#c2410c" }).end(tile, css);
    expect(only(css).paint).toEqual({ stroke: "#c2410c", width: 2 });
  });

  it.each(Object.keys(fixtures) as FixtureName[])("follows the %s fixture to its moved twin, after a run and after end()", async (name) => {
    const ran = testContext();
    await outline().run(fixtures[name], ran);
    expect(only(ran).d).toBe(fixtures[name].outline.d);
    ran.change(movedFixtures[name]);
    expect(only(ran).d).toBe(movedFixtures[name].outline.d);
    const ended = testContext();
    outline().end(fixtures[name], ended);
    ended.change(movedFixtures[name]);
    expect(ended.layer.picture()).toEqual(ran.layer.picture());
  });

  it("strokes an open shape's line", () => {
    const line = build.line({ key: "trend", points: [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }], width: 2 });
    const ctx = testContext();
    outline().end(line, ctx);
    expect(only(ctx).d).toBe(line.outline.d);
  });

  it("draws nothing on a run that's already aborted", async () => {
    const ctx = testContext();
    ctx.abort();
    await outline().run(tile, ctx);
    expect(paths(ctx)).toEqual([]);
  });

  it("is one effect on many marks: each run has its own path", () => {
    const effect = outline();
    const a = testContext();
    const b = testContext();
    effect.end(tile, a);
    effect.end(fixtures.bar, b);
    a.change(movedFixtures.bar);
    expect(only(b).d).toBe(fixtures.bar.outline.d);
  });

  it.each([
    [{ width: 0 }, "outline: width must be more than 0 px, got 0."],
    [{ width: -1 }, "outline: width must be more than 0 px, got -1."],
    [{ width: Infinity }, "outline: width must be more than 0 px, got Infinity."],
    [{ width: "2" as unknown as number }, "outline: width must be more than 0 px, got 2."],
    [{ color: "" }, 'outline: color must be a theme token or a CSS colour, got "".'],
    [{ color: 3 as unknown as string }, "outline: color must be a theme token or a CSS colour, got 3."]
  ])("refuses %j", (options, message) => {
    expect(() => outline(options)).toThrow(new RangeError(message));
  });
});
