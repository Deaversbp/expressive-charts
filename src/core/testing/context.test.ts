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
});
