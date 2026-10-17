import { manualClock } from "./clock";
import { easeInOutCubic, linear } from "./easing";
import { createMotion, type MotionMode } from "./motion";
import { tween } from "./tween";

const deviceAllowsMotion = { matches: false, subscribe: () => () => {} };

function setup(mode: MotionMode = "presentation") {
  const clock = manualClock();
  const env = { clock, motion: createMotion({ mode, reducedMotion: deviceAllowsMotion }) };
  return { clock, env };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tween", () => {
  it("calls update with progress every frame and ends exactly at 1", async () => {
    const { clock, env } = setup();
    const update = vi.fn();
    const t = tween({ duration: 1000, ease: linear, update }, env);
    clock.advance(250);
    expect(update).toHaveBeenLastCalledWith(0.25);
    clock.advance(250);
    expect(update).toHaveBeenLastCalledWith(0.5);
    clock.advance(600);
    expect(update).toHaveBeenLastCalledWith(1);
    expect(t.state).toBe("done");
    await expect(t.finished).resolves.toBe("done");
    expect(clock.idle).toBe(true);
  });

  it("applies the starting progress synchronously", () => {
    const { env } = setup();
    const update = vi.fn();
    tween({ duration: 1000, update }, env);
    expect(update.mock.calls).toEqual([[0]]);
  });

  it("eases in and out by default", () => {
    const { clock, env } = setup();
    const update = vi.fn();
    tween({ duration: 1000, update }, env);
    clock.advance(250);
    expect(update).toHaveBeenLastCalledWith(easeInOutCubic(0.25));
  });

  it("scales the duration by mode and timing", () => {
    const { clock, env } = setup("analysis");
    const update = vi.fn();
    const t = tween({ duration: 600, ease: linear, update }, env); // transition: capped at 200 ms
    clock.advance(100);
    expect(update).toHaveBeenLastCalledWith(0.5);
    clock.advance(100);
    expect(t.state).toBe("done");

    const effect = tween({ duration: 1000, timing: "effect", ease: linear, update }, env); // effect: capped at 300 ms
    clock.advance(150);
    expect(update).toHaveBeenLastCalledWith(0.5);
    clock.advance(150);
    expect(effect.state).toBe("done");
  });

  it("jumps to the end synchronously when motion is off", async () => {
    const { clock, env } = setup("off");
    const update = vi.fn();
    const t = tween({ duration: 1000, update }, env);
    expect(update.mock.calls).toEqual([[1]]);
    expect(t.state).toBe("done");
    expect(clock.idle).toBe(true);
    await expect(t.finished).resolves.toBe("done");
  });

  it("passes the easing's own end value, so there-and-back easings land where they should", () => {
    const { env } = setup("off");
    const update = vi.fn();
    tween({ duration: 500, ease: (t) => Math.sin(Math.PI * t), update }, env);
    expect(update.mock.calls[0]?.[0]).toBeCloseTo(0);
  });

  it("stays where it is when cancelled", async () => {
    const { clock, env } = setup();
    const update = vi.fn();
    const t = tween({ duration: 1000, ease: linear, update }, env);
    clock.advance(300);
    t.cancel();
    clock.advance(300);
    expect(update).toHaveBeenLastCalledWith(0.3);
    await expect(t.finished).resolves.toBe("cancelled");
    expect(clock.idle).toBe(true);
  });

  it("jumps to the end on finish()", async () => {
    const { clock, env } = setup();
    const update = vi.fn();
    const t = tween({ duration: 1000, ease: linear, update }, env);
    clock.advance(100);
    t.finish();
    expect(update).toHaveBeenLastCalledWith(1);
    await expect(t.finished).resolves.toBe("done");
  });

  it("ignores cancel() and finish() once it has ended", async () => {
    const { clock, env } = setup();
    const update = vi.fn();
    const t = tween({ duration: 100, ease: linear, update }, env);
    clock.advance(100);
    const calls = update.mock.calls.length;
    t.cancel();
    t.finish();
    expect(update.mock.calls.length).toBe(calls);
    await expect(t.finished).resolves.toBe("done");
  });

  it("never starts if the signal is already aborted", async () => {
    const { clock, env } = setup();
    const update = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const t = tween({ duration: 1000, update, signal: controller.signal }, env);
    expect(update).not.toHaveBeenCalled();
    expect(clock.idle).toBe(true);
    await expect(t.finished).resolves.toBe("cancelled");
  });

  it("is cancelled when its signal aborts", async () => {
    const { clock, env } = setup();
    const controller = new AbortController();
    const t = tween({ duration: 1000, update: () => {}, signal: controller.signal }, env);
    clock.advance(100);
    controller.abort();
    expect(t.state).toBe("cancelled");
    expect(clock.idle).toBe(true);
    await expect(t.finished).resolves.toBe("cancelled");
  });

  it("holds the starting progress through a delay", () => {
    const { clock, env } = setup();
    const update = vi.fn();
    const t = tween({ duration: 100, delay: 100, ease: linear, update }, env);
    clock.advance(50);
    clock.advance(50);
    expect(update.mock.calls).toEqual([[0]]);
    clock.advance(50);
    expect(update).toHaveBeenLastCalledWith(0.5);
    clock.advance(50);
    expect(t.state).toBe("done");
  });

  it("scales the delay like the duration", () => {
    const { clock, env } = setup("analysis");
    const update = vi.fn();
    tween({ duration: 400, delay: 400, ease: linear, update }, env); // both become 140 ms
    clock.advance(140);
    expect(update.mock.calls).toEqual([[0]]);
    clock.advance(70);
    expect(update).toHaveBeenLastCalledWith(0.5);
  });

  it("jumps to the end on the next frame if the device switches to reduced motion mid-flight", async () => {
    let reduced = false;
    const listeners = new Set<() => void>();
    const device = {
      get matches() {
        return reduced;
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
    const clock = manualClock();
    const update = vi.fn();
    const t = tween({ duration: 1000, ease: linear, update }, { clock, motion: createMotion({ reducedMotion: device }) });
    clock.advance(200);
    reduced = true;
    clock.advance(16);
    expect(update).toHaveBeenLastCalledWith(1);
    expect(t.state).toBe("done");
    expect(clock.idle).toBe(true);
    await expect(t.finished).resolves.toBe("done");
  });

  it("jumps to the end if the viewer picks Off mid-flight, even during a delay", () => {
    const clock = manualClock();
    const motion = createMotion({ reducedMotion: deviceAllowsMotion });
    const update = vi.fn();
    const t = tween({ duration: 1000, delay: 500, update }, { clock, motion });
    clock.advance(100);
    motion.chooseMode("off");
    clock.advance(16);
    expect(update.mock.calls).toEqual([[0], [1]]);
    expect(t.state).toBe("done");
  });

  it("cancels and reports, rather than finishing, if the final update throws", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const { clock, env } = setup();
    const boom = new Error("boom");
    const t = tween(
      {
        duration: 100,
        update: (progress) => {
          if (progress === 1) throw boom;
        }
      },
      env
    );
    clock.advance(100);
    expect(reportError).toHaveBeenCalledWith(boom);
    expect(t.state).toBe("cancelled");
    expect(clock.idle).toBe(true);
    await expect(t.finished).resolves.toBe("cancelled");
  });

  it("throws to the caller of finish() and cancels if the final update throws", async () => {
    const { env } = setup();
    const boom = new Error("boom");
    const t = tween(
      {
        duration: 100,
        update: (progress) => {
          if (progress === 1) throw boom;
        }
      },
      env
    );
    expect(() => t.finish()).toThrow(boom);
    await expect(t.finished).resolves.toBe("cancelled");
  });

  it("doesn't recurse when the final update calls finish() or cancel()", async () => {
    const { clock, env } = setup();
    const update = vi.fn((progress: number) => {
      if (progress === 1) handle.finish();
    });
    const handle = tween({ duration: 100, ease: linear, update }, env);
    clock.advance(100);
    expect(update).toHaveBeenCalledTimes(2);
    await expect(handle.finished).resolves.toBe("done");

    const cancelling = tween(
      {
        duration: 100,
        update: (progress) => {
          if (progress === 1) cancelling.cancel();
        }
      },
      env
    );
    clock.advance(100);
    await expect(cancelling.finished).resolves.toBe("cancelled");
  });

  it("cancels itself and reports the error if update throws mid-flight", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const { clock, env } = setup();
    const boom = new Error("boom");
    let calls = 0;
    const t = tween(
      {
        duration: 1000,
        update: () => {
          if (++calls === 2) throw boom;
        }
      },
      env
    );
    clock.advance(100);
    expect(reportError).toHaveBeenCalledWith(boom);
    expect(t.state).toBe("cancelled");
    expect(clock.idle).toBe(true);
    await expect(t.finished).resolves.toBe("cancelled");
  });
});
