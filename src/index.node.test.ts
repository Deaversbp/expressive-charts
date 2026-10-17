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
