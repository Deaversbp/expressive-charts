import { createClock, manualClock, type FrameSource } from "./clock";

/** A frame source that records requests and only fires when told to. */
function fakeFrames() {
  let time = 0;
  let requests = 0;
  let cancels = 0;
  const queue: Array<(now: number) => void> = [];
  const source: FrameSource = {
    now: () => time,
    request(callback) {
      requests++;
      queue.push(callback);
      return () => {
        cancels++;
        const index = queue.indexOf(callback);
        if (index >= 0) queue.splice(index, 1);
      };
    }
  };
  return {
    source,
    get requests() {
      return requests;
    },
    get cancels() {
      return cancels;
    },
    get pending() {
      return queue.length;
    },
    frame(ms = 16) {
      time += ms;
      for (const callback of queue.splice(0)) callback(time);
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createClock", () => {
  it("uses requestAnimationFrame by default when the browser has it", () => {
    // Only rAF is faked: if the clock fell back to setTimeout, no frame would arrive.
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const clock = createClock();
    const callback = vi.fn();
    const stop = clock.onFrame(callback);
    vi.advanceTimersByTime(50);
    expect(callback.mock.calls.length).toBeGreaterThanOrEqual(2);
    stop();
    const calls = callback.mock.calls.length;
    vi.advanceTimersByTime(50);
    expect(callback.mock.calls.length).toBe(calls);
  });

  it("requests no frames until something subscribes", () => {
    const frames = fakeFrames();
    createClock(frames.source);
    expect(frames.requests).toBe(0);
  });

  it("calls every subscriber once per frame with the frame time", () => {
    const frames = fakeFrames();
    const clock = createClock(frames.source);
    const a = vi.fn();
    const b = vi.fn();
    clock.onFrame(a);
    clock.onFrame(b);
    frames.frame(16);
    frames.frame(16);
    expect(a.mock.calls).toEqual([[16], [32]]);
    expect(b.mock.calls).toEqual([[16], [32]]);
  });

  it("keeps exactly one frame request in flight", () => {
    const frames = fakeFrames();
    const clock = createClock(frames.source);
    clock.onFrame(() => {});
    clock.onFrame(() => {});
    clock.onFrame(() => {});
    expect(frames.requests).toBe(1);
    frames.frame();
    expect(frames.requests).toBe(2);
    expect(frames.pending).toBe(1);
  });

  it("stops requesting frames when the last subscriber leaves", () => {
    const frames = fakeFrames();
    const clock = createClock(frames.source);
    const callback = vi.fn();
    const stop = clock.onFrame(callback);
    stop();
    expect(frames.cancels).toBe(1);
    expect(frames.pending).toBe(0);
    frames.frame();
    expect(callback).not.toHaveBeenCalled();
  });

  it("stops after a frame in which every subscriber left", () => {
    const frames = fakeFrames();
    const clock = createClock(frames.source);
    const stop = clock.onFrame(() => stop());
    frames.frame();
    expect(frames.pending).toBe(0);
  });

  it("skips a subscriber removed earlier in the same frame", () => {
    const frames = fakeFrames();
    const clock = createClock(frames.source);
    const second = vi.fn();
    let stopSecond = (): void => {};
    clock.onFrame(() => stopSecond());
    stopSecond = clock.onFrame(second);
    frames.frame();
    expect(second).not.toHaveBeenCalled();
  });

  it("calls a subscriber added during a frame from the next frame, without a second request", () => {
    const frames = fakeFrames();
    const clock = createClock(frames.source);
    const late = vi.fn();
    let added = false;
    clock.onFrame(() => {
      if (!added) clock.onFrame(late);
      added = true;
    });
    frames.frame(16);
    expect(late).not.toHaveBeenCalled();
    expect(frames.pending).toBe(1);
    frames.frame(16);
    expect(late).toHaveBeenCalledWith(32);
  });

  it("reports an error from one subscriber and keeps calling the others", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const frames = fakeFrames();
    const clock = createClock(frames.source);
    const boom = new Error("boom");
    const after = vi.fn();
    clock.onFrame(() => {
      throw boom;
    });
    clock.onFrame(after);
    frames.frame();
    expect(reportError).toHaveBeenCalledWith(boom);
    expect(after).toHaveBeenCalledOnce();
    expect(frames.pending).toBe(1);
  });

  it("lets the same function subscribe twice and leave independently", () => {
    const frames = fakeFrames();
    const clock = createClock(frames.source);
    const callback = vi.fn();
    const first = clock.onFrame(callback);
    clock.onFrame(callback);
    first();
    first();
    frames.frame();
    expect(callback).toHaveBeenCalledOnce();
  });
});

describe("manualClock", () => {
  it("starts at the given time and only moves on advance", () => {
    const clock = manualClock(100);
    expect(clock.now()).toBe(100);
    clock.advance(50);
    expect(clock.now()).toBe(150);
  });

  it("runs one frame per advance, at the new time", () => {
    const clock = manualClock();
    const callback = vi.fn();
    clock.onFrame(callback);
    clock.advance(10);
    clock.advance(0);
    expect(callback.mock.calls).toEqual([[10], [10]]);
  });

  it("is idle exactly when nothing is subscribed", () => {
    const clock = manualClock();
    expect(clock.idle).toBe(true);
    const stop = clock.onFrame(() => {});
    expect(clock.idle).toBe(false);
    stop();
    expect(clock.idle).toBe(true);
  });

  it("rejects negative or missing steps", () => {
    const clock = manualClock();
    expect(() => clock.advance(-1)).toThrow(RangeError);
    expect(() => clock.advance(Number.NaN)).toThrow(RangeError);
  });
});
