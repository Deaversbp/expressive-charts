import type { Icon } from "../contracts/icon";
import { linear } from "../easing";
import { describe as build } from "../geometry";
import { testContext } from "./context";

const bar = build.bar({ key: "Okafor", series: "goals", x: 0, y: 0, width: 100, height: 20, baseline: "left" });

describe("testContext", () => {
  it("runs tweens on its own manual clock and motion", async () => {
    const ctx = testContext();
    const updates: number[] = [];
    const t = ctx.tween({ duration: 100, timing: "effect", ease: linear, update: (p) => updates.push(p) });
    ctx.clock.advance(50);
    expect(updates).toEqual([0, 0.5]);
    ctx.clock.advance(50);
    await expect(t.finished).resolves.toBe("done");
    expect(ctx.clock.idle).toBe(true);
  });

  it("takes scaling overrides, as a page's motion does", () => {
    const ctx = testContext({ scaling: { presentation: { effect: { factor: 2 } } } });
    expect(ctx.motion.duration(600, "effect")).toBe(1200);
    expect(ctx.motion.duration(600, "transition")).toBe(600);
  });

  it("jumps to the end when the mode is off, with no frames", async () => {
    const ctx = testContext({ mode: "off" });
    const updates: number[] = [];
    const t = ctx.tween({ duration: 400, update: (p) => updates.push(p) });
    expect(updates).toEqual([1]);
    expect(ctx.clock.idle).toBe(true);
    await expect(t.finished).resolves.toBe("done");
  });

  it("cancels its tweens on abort, including ones given their own signal", async () => {
    const ctx = testContext();
    const plain = ctx.tween({ duration: 100, update: () => {} });
    const own = ctx.tween({ duration: 100, signal: new AbortController().signal, update: () => {} });
    ctx.abort();
    expect(ctx.signal.aborted).toBe(true);
    await expect(plain.finished).resolves.toBe("cancelled");
    await expect(own.finished).resolves.toBe("cancelled");
  });

  it("resolves icons by name and carries batch and previous geometry", () => {
    const dot = { name: "dot" } as Icon;
    const ctx = testContext({ icons: [dot], batch: { index: 2, count: 8 }, previous: bar });
    expect(ctx.icons.get("dot")).toBe(dot);
    expect(ctx.icons.get("cleat")).toBeUndefined();
    expect(ctx.batch).toEqual({ index: 2, count: 8 });
    expect(ctx.previous).toBe(bar);
    expect(testContext()).not.toHaveProperty("previous");
  });

  it("calls onChange listeners on change(), until cleared", () => {
    const ctx = testContext();
    const listener = vi.fn();
    ctx.onChange(listener);
    ctx.change(bar);
    expect(listener).toHaveBeenCalledWith(bar, undefined);
    ctx.layer.path(bar.slice(0, 1), { stroke: "mark" });
    ctx.mark.set({ opacity: 0.5 });
    ctx.clear();
    ctx.change(bar);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(ctx.layer.drawn).toEqual([]);
    expect(ctx.mark.style).toEqual({});
    expect(ctx.signal.aborted).toBe(true);
  });

  it("gives a text space as a chart's runner does: boxes estimated as in jsdom, the boxes held before it, and what it holds until cleared", () => {
    const ctx = testContext();
    // 0.6 em a character at the overlay's 12.5 px, and past the text at either side and above and below its baseline.
    expect(ctx.texts.box("+12", { at: { x: 100, y: 50 }, anchor: "middle" })).toEqual({ x: 100 - 11.25 - 2, y: 50 - 1.05 * 12.5, width: 22.5 + 4, height: 1.3 * 12.5 });
    expect(ctx.texts.held()).toEqual([]);
    expect(ctx.texts.holding).toBeUndefined();
    const box = { x: 1, y: 2, width: 3, height: 4 };
    ctx.texts.hold(box);
    expect(ctx.texts.holding).toEqual(box);
    ctx.texts.hold(undefined);
    expect(ctx.texts.holding).toBeUndefined();
    ctx.texts.hold(box);
    ctx.clear();
    expect(ctx.texts.holding).toBeUndefined();

    const before = [{ x: 10, y: 20, width: 30, height: 16 }];
    expect(testContext({ held: before }).texts.held()).toEqual(before);
  });
});
