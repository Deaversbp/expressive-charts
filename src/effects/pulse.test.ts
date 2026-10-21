import type { MarkGeometry } from "../core";
import { describe as build } from "../core";
import { flush, play, testContext, type TestContext, type TestContextOptions } from "../core/testing";
import { pulse, type PulseOptions } from "./pulse";

const bar: MarkGeometry = build.bar({ key: "Okafor", series: "goals", x: 0, y: 0, width: 200, height: 20, baseline: "left", radius: 4 });

/** When each pulse started, in ms: every frame where a halo appears after a frame with none. */
async function starts(options: PulseOptions = {}, context: TestContextOptions = {}, frame = 10): Promise<{ starts: number[]; elapsed: number; ctx: TestContext }> {
  const ctx = testContext(context);
  const running = pulse(options).run(bar, ctx);
  const found: number[] = [];
  let shown = false;
  let elapsed = 0;
  let settled = false;
  void running.then(() => (settled = true));
  await flush();
  while (!settled) {
    ctx.clock.advance(frame);
    elapsed += frame;
    await flush();
    const now = ctx.mark.style.halo !== undefined;
    if (now && !shown) found.push(elapsed - frame);
    shown = now;
    if (elapsed > 10_000) throw new Error("pulse still running after 10 s");
  }
  return { starts: found, elapsed, ctx };
}

describe("pulse", () => {
  it("widens a halo from 0 to 12 px while it fades from 40% to nothing, over 600 ms", async () => {
    const ctx = testContext();
    const running = pulse({ times: 1 }).run(bar, ctx);
    const widths: number[] = [];
    const opacities: number[] = [];
    for (let t = 15; t < 600; t += 15) {
      ctx.clock.advance(15);
      widths.push(ctx.mark.style.halo!.width);
      opacities.push(ctx.mark.style.halo!.opacity);
    }
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
      expect(opacities[i]!).toBeLessThan(opacities[i - 1]!);
    }
    expect(widths[widths.length - 1]!).toBeGreaterThan(11.9);
    expect(widths[widths.length - 1]!).toBeLessThan(12);
    // Halfway through, the ring is most of the way out and half faded.
    expect(widths[300 / 15 - 1]).toBeCloseTo(12 * (1 - 0.5 ** 3), 9);
    expect(opacities[300 / 15 - 1]).toBeCloseTo(0.2, 9);
    expect(await play(ctx.clock, running, { frame: 15 })).toBe(15);
    expect(ctx.mark.style).toEqual({});
  });

  it("strokes in the mark's own colour unless told otherwise", () => {
    const plain = testContext();
    void pulse().run(bar, plain);
    plain.clock.advance(300);
    expect(plain.mark.style.halo).not.toHaveProperty("color");

    const coloured = testContext();
    void pulse({ width: 20, color: "series-3" }).run(bar, coloured);
    coloured.clock.advance(300);
    expect(coloured.mark.style.halo).toEqual({ width: 20 * (1 - 0.5 ** 3), opacity: 0.2, color: "series-3" });
  });

  it("pulses twice by default, 600 ms each, back to back", async () => {
    const run = await starts();
    expect(run.starts).toEqual([0, 600]);
    expect(run.elapsed).toBe(1200);
    expect(run.ctx.mark.style).toEqual({});
  });

  it("plays every pulse in analysis, each shortened to 210 ms", async () => {
    // 600 × 0.35 = 210, inside the 140–300 ms clamp.
    const run = await starts({ times: 3 }, { mode: "analysis" });
    expect(run.starts).toEqual([0, 210, 420]);
    expect(run.elapsed).toBe(630);
  });

  it("runs no frames when motion is off, and draws nothing", async () => {
    const ctx = testContext({ mode: "off" });
    const running = pulse({ times: 6 }).run(bar, ctx);
    expect(ctx.clock.idle).toBe(true);
    await running;
    expect(ctx.mark.style).toEqual({});
  });

  it("plays up to 6 times", async () => {
    const run = await starts({ times: 6 });
    expect(run.starts).toEqual([0, 600, 1200, 1800, 2400, 3000]);
    expect(run.elapsed).toBe(3600);
  });

  describe("always finishes in under 5 s, whatever the page's scaling", () => {
    it("with effects scaled ×2, plays 4 of 6 pulses, the last ending before 5 s", async () => {
      const run = await starts({ times: 6 }, { scaling: { presentation: { effect: { factor: 2 } } } });
      expect(run.starts).toEqual([0, 1200, 2400, 3600]);
      expect(run.elapsed).toBe(4800);
      expect(run.elapsed).toBeLessThan(5000);
    });

    it("drops a pulse that would end at exactly 5 s", async () => {
      const run = await starts({ times: 6 }, { scaling: { presentation: { effect: { factor: 3, max: 1250 } } } });
      expect(run.starts).toEqual([0, 1250, 2500]);
      expect(run.elapsed).toBe(3750);
    });

    it("draws nothing when a single pulse would take 5 s", async () => {
      const ctx = testContext({ scaling: { presentation: { effect: { factor: 10 } } } });
      await pulse().run(bar, ctx);
      expect(ctx.mark.calls).toEqual([]);
      expect(ctx.clock.idle).toBe(true);
    });
  });

  it("never sets a transform, so the mark never looks bigger", async () => {
    const ctx = testContext();
    await play(ctx.clock, pulse({ times: 3 }).run(bar, ctx));
    expect(ctx.mark.calls.length).toBeGreaterThan(0);
    for (const call of ctx.mark.calls) {
      expect(call.op).toBe("set");
      if (call.op === "set") expect(Object.keys(call.style)).toEqual(["halo"]);
    }
  });

  it("ends with nothing", () => {
    const ctx = testContext();
    pulse().end(bar, ctx);
    expect(ctx.mark.calls).toEqual([]);
    expect(ctx.layer.drawn).toEqual([]);
  });

  it("stops when aborted, starting no more pulses", async () => {
    const ctx = testContext();
    const running = pulse({ times: 4 }).run(bar, ctx);
    ctx.clock.advance(100);
    ctx.abort();
    await running;
    const calls = ctx.mark.calls.length;
    ctx.clock.advance(1000);
    await flush();
    expect(ctx.mark.calls.length).toBe(calls);
    expect(ctx.clock.idle).toBe(true);
    ctx.clear();
    expect(ctx.mark.style).toEqual({});
  });

  it("does nothing when the run is already aborted", async () => {
    const ctx = testContext();
    ctx.abort();
    await pulse().run(bar, ctx);
    expect(ctx.mark.calls).toEqual([]);
  });

  it("checks its options when it's made", () => {
    for (const times of [0, 7, 1.5, -1, Number.NaN, Infinity, "2" as unknown as number]) {
      expect(() => pulse({ times })).toThrow(RangeError);
    }
    expect(() => pulse({ times: 7 })).toThrow(/pulse: times must be a whole number from 1 to 6, got 7/);
    expect(() => pulse({ width: 0 })).toThrow(/width must be more than 0/);
    expect(() => pulse({ width: Infinity })).toThrow(RangeError);
    expect(() => pulse({ color: "" })).toThrow(/color/);
    expect(() => pulse({ color: 3 as unknown as string })).toThrow(/color/);
    expect(() => pulse({ times: 1, width: 4, color: "#ff0000" })).not.toThrow();
    expect(() => pulse({ times: 6 })).not.toThrow();
  });
});
