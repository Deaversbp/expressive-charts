import {
  createMotion,
  mediaReducedMotion,
  scaleDuration,
  type MotionMode,
  type ReducedMotionSource,
  type Timing
} from "./motion";

/** A reduced-motion preference the test can flip. */
function reducedSource(initial = false) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const source: ReducedMotionSource = {
    get matches() {
      return matches;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
  return {
    source,
    set(value: boolean) {
      matches = value;
      for (const listener of [...listeners]) listener();
    },
    get listeners() {
      return listeners.size;
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("duration scaling", () => {
  it.each<[MotionMode, Timing, number, number]>([
    ["presentation", "feedback", 100, 100],
    ["presentation", "transition", 500, 500],
    ["presentation", "effect", 833, 833],
    ["presentation", "playback", 6500, 6500],
    ["presentation", "stagger", 150, 150],
    ["analysis", "feedback", 100, 100],
    ["analysis", "transition", 600, 200],
    ["analysis", "transition", 350, 122.5],
    ["analysis", "effect", 1000, 300],
    ["analysis", "effect", 600, 210],
    ["analysis", "effect", 300, 140],
    ["analysis", "effect", 100, 100],
    ["analysis", "playback", 6500, 1950],
    ["analysis", "stagger", 150, 0],
    ["off", "feedback", 100, 0],
    ["off", "transition", 600, 0],
    ["off", "effect", 833, 0],
    ["off", "playback", 6500, 0],
    ["off", "stagger", 150, 0]
  ])("%s, %s: %d ms becomes %d ms", (mode, timing, base, expected) => {
    const motion = createMotion({ mode, reducedMotion: reducedSource().source });
    expect(motion.duration(base, timing)).toBeCloseTo(expected, 6);
  });

  it("treats durations as transitions by default", () => {
    const motion = createMotion({ mode: "analysis", reducedMotion: reducedSource().source });
    expect(motion.duration(600)).toBe(200);
  });

  it("turns zero, negative and non-numeric base durations into 0", () => {
    const motion = createMotion({ reducedMotion: reducedSource().source });
    expect(motion.duration(0)).toBe(0);
    expect(motion.duration(-50)).toBe(0);
    expect(motion.duration(Number.NaN)).toBe(0);
  });

  it("never lets a floor make an animation longer than its base", () => {
    expect(scaleDuration(80, { factor: 0.35, min: 140 })).toBe(80);
  });

  it("applies partial scaling overrides and keeps the other defaults", () => {
    const motion = createMotion({
      mode: "analysis",
      reducedMotion: reducedSource().source,
      scaling: { analysis: { transition: { factor: 0.5, max: 400 } } }
    });
    expect(motion.duration(600, "transition")).toBe(300);
    expect(motion.duration(1000, "effect")).toBe(300);
  });
});

describe("modes", () => {
  it("defaults to presentation, which is the only staged mode", () => {
    const motion = createMotion({ reducedMotion: reducedSource().source });
    expect(motion.mode).toBe("presentation");
    expect(motion.staged).toBe(true);
    motion.setMode("analysis");
    expect(motion.staged).toBe(false);
    motion.setMode("off");
    expect(motion.staged).toBe(false);
  });

  it("rejects unknown modes, such as the prototype's names", () => {
    const motion = createMotion({ reducedMotion: reducedSource().source });
    expect(() => motion.setMode("present" as MotionMode)).toThrow(TypeError);
    expect(() => motion.chooseMode("analyze" as MotionMode)).toThrow(TypeError);
    expect(() => createMotion({ mode: "fast" as MotionMode })).toThrow(TypeError);
  });

  it("lets a viewer choice win over the author's mode", () => {
    const motion = createMotion({ mode: "presentation", reducedMotion: reducedSource().source });
    motion.chooseMode("analysis");
    expect(motion.mode).toBe("analysis");
    motion.setMode("off");
    expect(motion.mode).toBe("analysis");
    expect(motion.requested).toBe("off");
  });
});

describe("reduced motion", () => {
  it("forces off, whatever mode the author sets", () => {
    const motion = createMotion({ mode: "presentation", reducedMotion: reducedSource(true).source });
    expect(motion.prefersReduced).toBe(true);
    expect(motion.mode).toBe("off");
    motion.setMode("analysis");
    expect(motion.mode).toBe("off");
    expect(motion.requested).toBe("analysis");
    expect(motion.duration(600)).toBe(0);
  });

  it("gives way to the viewer's on-page choice", () => {
    const motion = createMotion({ reducedMotion: reducedSource(true).source });
    motion.chooseMode("presentation");
    expect(motion.mode).toBe("presentation");
    expect(motion.duration(600)).toBe(600);
  });

  it("applies again once the viewer's choice is cleared", () => {
    const motion = createMotion({ reducedMotion: reducedSource(true).source });
    motion.chooseMode("analysis");
    motion.clearChoice();
    expect(motion.viewerChoice).toBeUndefined();
    expect(motion.mode).toBe("off");
  });

  it("follows the device setting live", () => {
    const device = reducedSource(false);
    const motion = createMotion({ reducedMotion: device.source });
    expect(motion.mode).toBe("presentation");
    device.set(true);
    expect(motion.mode).toBe("off");
    device.set(false);
    expect(motion.mode).toBe("presentation");
  });
});

describe("subscribe", () => {
  it("notifies on real changes only", () => {
    const motion = createMotion({ reducedMotion: reducedSource().source });
    const listener = vi.fn();
    motion.subscribe(listener);
    motion.setMode("presentation");
    motion.clearChoice();
    expect(listener).not.toHaveBeenCalled();
    motion.setMode("analysis");
    motion.chooseMode("off");
    motion.chooseMode("off");
    motion.clearChoice();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("watches the device setting only while someone is listening", () => {
    const device = reducedSource();
    const motion = createMotion({ reducedMotion: device.source });
    expect(device.listeners).toBe(0);
    const listener = vi.fn();
    const stopA = motion.subscribe(listener);
    const stopB = motion.subscribe(() => {});
    expect(device.listeners).toBe(1);
    device.set(true);
    expect(listener).toHaveBeenCalledOnce();
    stopA();
    expect(device.listeners).toBe(1);
    stopB();
    expect(device.listeners).toBe(0);
  });

  it("reports a throwing listener and still calls the rest", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const motion = createMotion({ reducedMotion: reducedSource().source });
    const boom = new Error("boom");
    const after = vi.fn();
    motion.subscribe(() => {
      throw boom;
    });
    motion.subscribe(after);
    motion.setMode("analysis");
    expect(reportError).toHaveBeenCalledWith(boom);
    expect(after).toHaveBeenCalledOnce();
  });
});

describe("mediaReducedMotion", () => {
  function fakeMediaList(matches: boolean, legacy = false) {
    const list = {
      matches,
      addEventListener: legacy ? undefined : vi.fn(),
      removeEventListener: legacy ? undefined : vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn()
    };
    return list;
  }

  it("reports false and ignores subscribers where matchMedia doesn't exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    const source = mediaReducedMotion();
    expect(source.matches).toBe(false);
    expect(() => source.subscribe(() => {})()).not.toThrow();
  });

  it("doesn't touch matchMedia until it's read", () => {
    const matchMedia = vi.fn(() => fakeMediaList(true));
    vi.stubGlobal("matchMedia", matchMedia);
    const source = mediaReducedMotion();
    expect(matchMedia).not.toHaveBeenCalled();
    expect(source.matches).toBe(true);
    expect(source.matches).toBe(true);
    expect(matchMedia).toHaveBeenCalledOnce();
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("listens for changes and stops listening", () => {
    const list = fakeMediaList(false);
    vi.stubGlobal("matchMedia", () => list);
    const stop = mediaReducedMotion().subscribe(() => {});
    expect(list.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    stop();
    expect(list.removeEventListener).toHaveBeenCalledWith("change", list.addEventListener?.mock.calls[0]?.[1]);
  });

  it("falls back to addListener on older Safari", () => {
    const list = fakeMediaList(false, true);
    vi.stubGlobal("matchMedia", () => list);
    const stop = mediaReducedMotion().subscribe(() => {});
    expect(list.addListener).toHaveBeenCalledOnce();
    stop();
    expect(list.removeListener).toHaveBeenCalledWith(list.addListener.mock.calls[0]?.[0]);
  });

  it("reports false if matchMedia throws", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("not supported");
    });
    expect(mediaReducedMotion().matches).toBe(false);
  });
});
