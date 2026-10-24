import type { MarkData, MarkGeometry, TextStyle } from "../core";
import { describe as build, easeInOutCubic, offset } from "../core";
import { play, testContext, type DrawnText, type TestContext } from "../core/testing";
import { checkEffect } from "../testing";
import { fixtures, movedFixtures, type FixtureName } from "../testing/fixtures";
import { captionPlace } from "./caption";
import { delta } from "./delta";

const bar: MarkGeometry = build.bar({ key: "Okafor", series: "goals", x: 60, y: 10, width: 200, height: 20, baseline: "left", radius: 4 });

/** A mark's data with one value at its end, and `previous` with another. */
function values(value: number, previous?: number, datum: unknown = undefined): MarkData {
  return {
    datum,
    samples: [
      { t: 0, value: 0 },
      { t: 1, value }
    ],
    related: () => undefined,
    ...(previous === undefined ? {} : { previous: values(previous, undefined, datum) })
  };
}

const texts = (ctx: TestContext): DrawnText[] => ctx.layer.drawn.filter((d): d is DrawnText => d.kind === "text");
const only = (ctx: TestContext): DrawnText => {
  const drawn = texts(ctx);
  expect(drawn).toHaveLength(1);
  return drawn[0]!;
};

/** Where the text is at rise p: towards the mark's down side by 8 px × (1 − p). */
function risen(mark: MarkGeometry, p: number): TextStyle["at"] {
  return offset(captionPlace(mark).at, mark.angle(1) - Math.PI / 2, -8 * (1 - p));
}

const signed = (n: number) => new Intl.NumberFormat(undefined, { signDisplay: "always", maximumFractionDigits: 2 }).format(n);

describe("delta", () => {
  it("draws the change past the end of the mark, rising 8 px into place and fading in over 400 ms, and it stays", async () => {
    const ctx = testContext();
    const running = delta().run(bar, values(16, 14), ctx);
    // Before the first frame: in the theme's text colour, unseen, 8 px towards the mark's down side.
    expect(only(ctx)).toMatchObject({ content: signed(2), style: { at: risen(bar, 0), anchor: "start", color: "text", opacity: 0 } });
    expect(risen(bar, 0).y - captionPlace(bar).at.y).toBeCloseTo(8, 9);
    ctx.clock.advance(100);
    expect(only(ctx).style.opacity).toBeCloseTo(easeInOutCubic(0.25), 9);
    expect(only(ctx).style.at.y).toBeCloseTo(risen(bar, easeInOutCubic(0.25)).y, 9);
    expect(await play(ctx.clock, running, { frame: 100 })).toBe(300);
    expect(only(ctx)).toMatchObject({ content: "+2", style: { at: captionPlace(bar).at, anchor: "start", color: "text", opacity: 1 } });
    // One text, updated in place, and the mark itself untouched.
    expect(ctx.layer.calls.filter((call) => call.op === "text")).toHaveLength(1);
    expect(ctx.mark.calls).toEqual([]);
  });

  it("ends with the picture end() draws: the text in place", async () => {
    const ran = testContext();
    await play(ran.clock, delta().run(bar, values(16, 14), ran));
    const ended = testContext();
    delta().end(bar, values(16, 14), ended);
    expect(ran.layer.picture()).toEqual(ended.layer.picture());
    expect(only(ended).style).toMatchObject({ at: captionPlace(bar).at, opacity: 1 });
  });

  it("draws the text in place at once, with no frames, when motion is off", async () => {
    const ctx = testContext({ mode: "off" });
    const running = delta().run(bar, values(16, 14), ctx);
    expect(ctx.clock.idle).toBe(true);
    await running;
    expect(only(ctx).style).toMatchObject({ at: captionPlace(bar).at, opacity: 1 });
  });

  it("scales the rise by the motion mode, with effect timing", async () => {
    // Analysis: 400 × 0.35 = 140 ms, the clamp's floor.
    const analysis = testContext({ mode: "analysis" });
    expect(await play(analysis.clock, delta().run(bar, values(3, 1), analysis), { frame: 5 })).toBe(140);
  });

  it("words the change by default in the page's locale, with its sign and at most two decimals", async () => {
    const said = async (now: number, before: number) => {
      const ctx = testContext({ mode: "off" });
      await delta().run(bar, values(now, before), ctx);
      return texts(ctx).map((text) => text.content);
    };
    expect(await said(16, 14)).toEqual(["+2"]);
    expect(await said(1.2, 1.5)).toEqual([signed(-0.3)]);
    // Not 0.30000000000000004.
    expect(await said(0.1 + 0.2, 0)).toEqual([signed(0.3)]);
    expect(await said(1, 0)).toEqual([signed(1)]);
    expect(await said(10 / 3, 0)).toEqual([signed(3.33)]);
  });

  it("draws nothing with no previous values, no change, float noise or a value that isn't a number", async () => {
    for (const data of [values(16), values(16, 16), values(0.3, 0.1 + 0.2), values(Number.NaN, 2), values(4, Infinity)]) {
      const ctx = testContext();
      const running = delta().run(bar, data, ctx);
      expect(ctx.clock.idle).toBe(true);
      await running;
      delta().end(bar, data, ctx);
      expect(ctx.layer.calls).toEqual([]);
    }
  });

  it("takes the value, the wording and the colour from its options", async () => {
    type Row = { readonly share: number };
    const ctx = testContext({ mode: "off" });
    const effect = delta<Row>({ value: (data) => data.datum.share * 100, format: (change) => `${change > 0 ? "+" : ""}${Math.round(change)}%`, color: "text-muted" });
    await effect.run(bar, values(0.4, 0.35, { share: 0.4 }) as MarkData<Row>, ctx);
    // The datum is the same before and after here, so the value it reads is: no change.
    expect(ctx.layer.calls).toEqual([]);
    const shares: MarkData<Row> = { ...(values(1, 1, { share: 0.4 }) as MarkData<Row>), previous: values(1, undefined, { share: 0.35 }) as MarkData<Row> };
    await effect.run(bar, shares, ctx);
    expect(only(ctx)).toMatchObject({ content: "+5%", style: { color: "text-muted" } });
    // A wording of "" draws nothing.
    const quiet = testContext({ mode: "off" });
    await delta({ format: () => "" }).run(bar, values(2, 1), quiet);
    expect(quiet.layer.calls).toEqual([]);
  });

  it("labels a stack's total, past the end of its last segment", async () => {
    const stacked = fixtures.stacked;
    const ctx = testContext({ mode: "off" });
    await delta().run(stacked, values(222, 200), ctx);
    expect(only(ctx)).toMatchObject({ content: "+22", style: { at: captionPlace(stacked).at } });
    expect(captionPlace(stacked).at.x).toBe(stacked.segments![1]!.end.x + 10);
  });

  it.each(Object.keys(fixtures) as FixtureName[])("follows a %s when it moves, mid-rise and after, keeping its text", async (name) => {
    const mark = fixtures[name];
    const moved = movedFixtures[name];
    const ctx = testContext();
    const running = delta().run(mark, values(5, 3), ctx);
    ctx.clock.advance(200);
    ctx.change(moved, values(9, 3));
    expect(only(ctx)).toMatchObject({ content: "+2", style: { anchor: captionPlace(moved).anchor } });
    await play(ctx.clock, running);
    expect(only(ctx).style.at).toEqual(captionPlace(moved).at);
    ctx.change(mark);
    expect(only(ctx).style.at).toEqual(captionPlace(mark).at);
  });

  it("passes the conformance checks, whether the value changed or not", async () => {
    await checkEffect(delta(), { name: "delta" });
    await checkEffect(delta(), { name: "delta, 14 → 16", data: () => values(16, 14) });
    await checkEffect(delta(), { name: "delta, unchanged", data: () => values(16, 16) });
    await checkEffect(delta({ color: "negative", format: (n) => `${n} goals` }), { name: "delta in a colour", data: () => values(1, 3) });
  });

  it("throws for options it can't use", () => {
    expect(() => delta({ value: 3 as never })).toThrow(new TypeError("delta: value must be a function that reads the mark's value from its data, got number."));
    expect(() => delta({ format: "+0" as never })).toThrow(TypeError);
    expect(() => delta({ color: "" })).toThrow(RangeError);
  });
});
