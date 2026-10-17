// @vitest-environment node
// The library must import cleanly where there is no DOM (server rendering, build tools, tests).

afterEach(() => {
  vi.useRealTimers();
});

describe("importing in Node", () => {
  it("runs without a DOM", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof matchMedia).toBe("undefined");
    expect(typeof requestAnimationFrame).toBe("undefined");
  });

  it("loads the public entry and reads the motion mode", async () => {
    const lib = await import("./index");
    expect(lib.motion.mode).toBe("presentation");
    expect(lib.motion.prefersReduced).toBe(false);
    expect(lib.motion.duration(600)).toBe(600);
  });

  it("builds mark geometry", async () => {
    const lib = await import("./index");
    const bar = lib.describe.bar({ key: "a", series: "goals", x: 0, y: 0, width: 100, height: 20, baseline: "left", radius: 4 });
    expect(bar.path(0.5)).toEqual({ x: 50, y: 10 });
    expect(bar.segments?.[0]?.key).toBe("a/goals");
    expect(lib.matrix.apply(lib.matrix.translate(1, 2), lib.offset({ x: 0, y: 0 }, 0, 3))).toEqual({ x: 4, y: 2 });
  });

  it("drives tweens from a timer when requestAnimationFrame is missing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const { createMotion, linear, tween } = await import("./index");
    const updates: number[] = [];
    const t = tween({ duration: 100, ease: linear, update: (p) => updates.push(p) }, { motion: createMotion() });
    vi.advanceTimersByTime(200);
    await expect(t.finished).resolves.toBe("done");
    expect(updates[0]).toBe(0);
    expect(updates[updates.length - 1]).toBe(1);
    expect(updates.length).toBeGreaterThan(3);
  });
});
