import type { MarkGeometry, MarkStyle } from "../core";
import { describe as build } from "../core";
import { flush, play, testContext, type TestContext } from "../core/testing";
import { flash } from "./flash";

const bar: MarkGeometry = build.bar({ key: "Okafor", series: "goals", x: 0, y: 0, width: 200, height: 20, baseline: "left", radius: 4 });

/** Every halo the run set, in order: undefined where it had none. */
const halos = (ctx: TestContext): (MarkStyle["halo"] | undefined)[] =>
  ctx.mark.calls.flatMap((call) => (call.op === "set" && "halo" in call.style ? [call.style.halo] : []));
const widthAt = (ctx: TestContext): number => ctx.mark.style.halo?.width ?? 0;

describe("flash", () => {
  it("blinks a halo once: 0 → 8 px by a quarter of the way, then back to 0, over 900 ms", async () => {
    const ctx = testContext();
    const running = flash().run(bar, ctx);
    const widths: number[] = [];
    for (let t = 15; t < 900; t += 15) {
      ctx.clock.advance(15);
      widths.push(widthAt(ctx));
    }
    // Widest at 225 ms, a quarter of 900, as in the prototype's keyframes.
    const peak = widths.indexOf(Math.max(...widths));
    expect((peak + 1) * 15).toBe(225);
    expect(widths[peak]).toBeCloseTo(8, 9);
    for (let i = 1; i <= peak; i++) expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
    for (let i = peak + 1; i < widths.length; i++) expect(widths[i]!).toBeLessThan(widths[i - 1]!);

    expect(await play(ctx.clock, running, { frame: 15 })).toBe(15);
    expect(ctx.mark.style).toEqual({});
  });

  it("eases each half out, as CSS's ease-out does", () => {
    const ctx = testContext();
    void flash().run(bar, ctx);
    // Halfway through the rise it's already 68% of the way up; halfway through the fall, 32% is left.
    ctx.clock.advance(112.5);
    expect(widthAt(ctx) / 8).toBeCloseTo(0.684, 2);
    ctx.clock.advance(225 - 112.5 + 337.5);
    expect(widthAt(ctx) / 8).toBeCloseTo(1 - 0.684, 2);
  });

  it("strokes in the mark's own colour at 35% opacity, unless told otherwise", async () => {
    const plain = testContext();
    const running = flash().run(bar, plain);
    plain.clock.advance(225);
    expect(plain.mark.style.halo).toEqual({ width: 8, opacity: 0.35 });
    await play(plain.clock, running);

    const coloured = testContext();
    void flash({ width: 12, opacity: 0.5, color: "series-3" }).run(bar, coloured);
    coloured.clock.advance(225);
    expect(coloured.mark.style.halo).toEqual({ width: 12, opacity: 0.5, color: "series-3" });
  });

  it("takes 900 ms with effect timing: 300 ms in analysis, none when motion is off", async () => {
    const presentation = testContext();
    expect(await play(presentation.clock, flash().run(bar, presentation), { frame: 10 })).toBe(900);
    // 900 × 0.35 = 315, capped at 300.
    const analysis = testContext({ mode: "analysis" });
    expect(await play(analysis.clock, flash().run(bar, analysis), { frame: 10 })).toBe(300);

    const off = testContext({ mode: "off" });
    const running = flash().run(bar, off);
    expect(off.clock.idle).toBe(true);
    await running;
    expect(halos(off).every((halo) => halo === undefined)).toBe(true);
    expect(off.mark.style).toEqual({});
  });

  it("ends with nothing: the change it points at stays on the chart", () => {
    const ctx = testContext();
    flash().end(bar, ctx);
    expect(ctx.mark.calls).toEqual([]);
    expect(ctx.layer.drawn).toEqual([]);
  });

  it("stops where it is when aborted, and the runner's cleanup removes the halo", async () => {
    const ctx = testContext();
    const running = flash().run(bar, ctx);
    ctx.clock.advance(100);
    ctx.abort();
    await running;
    await flush();
    expect(widthAt(ctx)).toBeGreaterThan(0);
    ctx.clear();
    expect(ctx.mark.style).toEqual({});
  });

  it("does nothing when the run is already aborted", async () => {
    const ctx = testContext();
    ctx.abort();
    await flash().run(bar, ctx);
    expect(ctx.mark.calls).toEqual([]);
  });

  it("works on any mark, since it reads nothing of the geometry", async () => {
    for (const mark of [build.point({ key: "p", x: 4, y: 4, r: 3 }), build.line({ key: "l", points: [{ x: 0, y: 0 }, { x: 50, y: 10 }] })]) {
      const ctx = testContext();
      const running = flash().run(mark, ctx);
      ctx.clock.advance(225);
      expect(ctx.mark.style.halo?.width).toBeCloseTo(8, 9);
      await play(ctx.clock, running);
      expect(ctx.mark.style).toEqual({});
    }
  });

  it("checks its options when it's made", () => {
    expect(() => flash({ width: 0 })).toThrow(/width must be more than 0/);
    expect(() => flash({ width: Infinity })).toThrow(RangeError);
    expect(() => flash({ opacity: 0 })).toThrow(/opacity/);
    expect(() => flash({ opacity: 1.5 })).toThrow(/opacity/);
    expect(() => flash({ color: "" })).toThrow(/color/);
    expect(() => flash({ color: 3 as unknown as string })).toThrow(/color/);
    expect(() => flash({ width: 4, opacity: 1, color: "#ff0000" })).not.toThrow();
  });
});
