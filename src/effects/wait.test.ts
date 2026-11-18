import type { MarkGeometry } from "../core";
import { describe as build } from "../core";
import { flush, play, testContext } from "../core/testing";
import { sequence } from "./combinators";
import { flash } from "./flash";
import { wait } from "./wait";

const bar: MarkGeometry = build.bar({ key: "North", x: 0, y: 0, width: 200, height: 20, baseline: "left" });

describe("wait", () => {
  it("draws nothing, on the layer or the mark, for its duration, and then resolves", async () => {
    const ctx = testContext();
    const running = wait(750).run(bar, ctx);
    let done = false;
    void running.then(() => (done = true));
    ctx.clock.advance(740);
    await flush();
    expect(done).toBe(false);
    expect(await play(ctx.clock, running, { frame: 10 })).toBe(10);
    expect(ctx.layer.calls).toEqual([]);
    expect(ctx.mark.calls).toEqual([]);
  });

  it("scales its time by the motion mode with effect timing, as drawIn's is", async () => {
    const presentation = testContext();
    expect(await play(presentation.clock, wait(750).run(bar, presentation), { frame: 10 })).toBe(750);
    // Analysis: 750 × 0.35 = 262.5 ms, inside the 140–300 ms clamp.
    const analysis = testContext({ mode: "analysis" });
    expect(await play(analysis.clock, wait(750).run(bar, analysis), { frame: 2.5 })).toBeCloseTo(262.5, 5);
    const slower = testContext({ scaling: { presentation: { effect: { factor: 2 } } } });
    expect(await play(slower.clock, wait(300).run(bar, slower), { frame: 10 })).toBe(600);
  });

  it.each([
    ["motion is off", { mode: "off" }, 750],
    ["its duration is 0", {}, 0]
  ] as const)("takes no time when %s", async (_case, context, duration) => {
    const ctx = testContext(context);
    const running = wait(duration).run(bar, ctx);
    expect(ctx.clock.idle).toBe(true);
    await running;
    expect(ctx.layer.calls).toEqual([]);
  });

  it("has an end state of nothing drawn", () => {
    const ctx = testContext();
    wait(750).end(bar, ctx);
    expect(ctx.layer.calls).toEqual([]);
    expect(ctx.mark.calls).toEqual([]);
    expect(ctx.clock.idle).toBe(true);
  });

  it("holds the next part of a sequence back until it's done", async () => {
    const ctx = testContext();
    const running = sequence(wait(750), flash()).run(bar, ctx);
    ctx.clock.advance(740);
    await flush();
    // Still waiting: the flash hasn't touched the mark.
    expect(ctx.mark.calls).toEqual([]);
    ctx.clock.advance(10);
    await flush();
    ctx.clock.advance(225);
    await flush();
    // A quarter of the way through flash's 900 ms: the halo at its widest.
    expect(ctx.mark.style.halo).toMatchObject({ width: 8 });
    await play(ctx.clock, running);
    expect(ctx.mark.style.halo).toBeUndefined();
  });

  it("with motion off, a sequence that starts with it is the next part's end state", () => {
    const waited = testContext({ mode: "off" });
    sequence(wait(750), flash()).end(bar, waited);
    const alone = testContext({ mode: "off" });
    flash().end(bar, alone);
    expect(waited.layer.picture()).toEqual(alone.layer.picture());
    expect(waited.mark.style).toEqual(alone.mark.style);
  });

  it("cancelled part way, resolves at once, and the sequence stops there", async () => {
    const ctx = testContext();
    const running = sequence(wait(750), flash()).run(bar, ctx);
    ctx.clock.advance(300);
    await flush();
    ctx.abort();
    await running;
    expect(ctx.mark.calls).toEqual([]);
    expect(ctx.layer.calls).toEqual([]);
  });

  it("resolves at once on a run that's already aborted", async () => {
    const ctx = testContext();
    ctx.abort();
    await wait(750).run(bar, ctx);
    expect(ctx.clock.idle).toBe(true);
  });

  it.each([[-1], [NaN], [Infinity], ["750"], [undefined], [null]])("refuses a duration of %s", (duration) => {
    expect(() => wait(duration as number)).toThrow(new RangeError(`wait: duration must be 0 ms or more, got ${String(duration)}.`));
  });
});
