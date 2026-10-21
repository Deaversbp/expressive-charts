import { animated, interpolateNumber, interpolatePoint, interpolateRecord } from "./animated";
import { manualClock } from "./clock";
import { easeInOutCubic, easeOutCubic, linear } from "./easing";
import { createMotion, type MotionMode } from "./motion";

const deviceAllowsMotion = { matches: false, subscribe: () => () => {} };

function setup(mode: MotionMode = "presentation") {
  const clock = manualClock();
  const env = { clock, motion: createMotion({ mode, reducedMotion: deviceAllowsMotion }) };
  return { clock, env };
}

describe("animated", () => {
  it("animates from its current value to the target", async () => {
    const { clock, env } = setup();
    const value = animated(0, interpolateNumber, env);
    const done = value.to(100, { duration: 1000, ease: linear });
    expect(value.target).toBe(100);
    expect(value.animating).toBe(true);
    clock.advance(500);
    expect(value.value).toBe(50);
    clock.advance(500);
    expect(value.value).toBe(100);
    expect(value.animating).toBe(false);
    await expect(done).resolves.toBe("done");
  });

  it("eases in and out when starting from rest", () => {
    const { clock, env } = setup();
    const value = animated(0, interpolateNumber, env);
    value.to(100, { duration: 1000 });
    clock.advance(250);
    expect(value.value).toBeCloseTo(100 * easeInOutCubic(0.25));
  });

  it("retargets from the in-between value and eases out instead of stalling", async () => {
    const { clock, env } = setup();
    const value = animated(0, interpolateNumber, env);
    const first = value.to(100, { duration: 1000, ease: linear });
    clock.advance(500);
    expect(value.value).toBe(50);

    const second = value.to(0, { duration: 1000 });
    await expect(first).resolves.toBe("cancelled");
    expect(value.value).toBe(50);
    clock.advance(500);
    expect(value.value).toBeCloseTo(50 * (1 - easeOutCubic(0.5)));
    clock.advance(500);
    expect(value.value).toBe(0);
    await expect(second).resolves.toBe("done");
  });

  it("eases in and out when the value it interrupts hasn't started moving, or when it waits first", () => {
    const { clock, env } = setup();
    const value = animated(0, interpolateNumber, env);
    // Still waiting out its delay, so at rest.
    value.to(100, { duration: 1000, delay: 500, ease: linear });
    clock.advance(200);
    value.to(50, { duration: 1000 });
    clock.advance(250);
    expect(value.value).toBeCloseTo(50 * easeInOutCubic(0.25));
    // Moving, but the new animation starts from rest after its delay.
    value.to(0, { duration: 1000, delay: 500 });
    const from = value.value;
    clock.advance(500);
    expect(value.value).toBe(from);
    clock.advance(250);
    expect(value.value).toBeCloseTo(from * (1 - easeInOutCubic(0.25)));
  });

  it("keeps an explicitly chosen ease when retargeting", () => {
    const { clock, env } = setup();
    const value = animated(0, interpolateNumber, env);
    value.to(100, { duration: 1000, ease: linear });
    clock.advance(500);
    value.to(0, { duration: 1000, ease: linear });
    clock.advance(500);
    expect(value.value).toBe(25);
  });

  it("jumps with set(), cancelling a running animation", async () => {
    const { clock, env } = setup();
    const onChange = vi.fn();
    const value = animated(0, interpolateNumber, { ...env, onChange });
    const running = value.to(100, { duration: 1000 });
    value.set(42);
    expect(value.value).toBe(42);
    expect(value.target).toBe(42);
    expect(value.animating).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(42);
    await expect(running).resolves.toBe("cancelled");
    clock.advance(500);
    expect(value.value).toBe(42);
  });

  it("freezes at the in-between value on stop()", async () => {
    const { clock, env } = setup();
    const value = animated(0, interpolateNumber, env);
    const running = value.to(100, { duration: 1000, ease: linear });
    clock.advance(300);
    value.stop();
    expect(value.value).toBe(30);
    expect(value.target).toBe(30);
    expect(value.animating).toBe(false);
    await expect(running).resolves.toBe("cancelled");
  });

  it("lands on the target synchronously when motion is off", async () => {
    const { env } = setup("off");
    const value = animated(0, interpolateNumber, env);
    const done = value.to(100, { duration: 1000 });
    expect(value.value).toBe(100);
    expect(value.animating).toBe(false);
    await expect(done).resolves.toBe("done");
  });

  it("reports every frame's value through onChange", () => {
    const { clock, env } = setup();
    const onChange = vi.fn();
    const value = animated(0, interpolateNumber, { ...env, onChange });
    value.to(10, { duration: 100, ease: linear });
    clock.advance(50);
    clock.advance(50);
    expect(onChange.mock.calls).toEqual([[0], [5], [10]]);
  });

  it("comes to rest where it stopped when its signal aborts", async () => {
    const { clock, env } = setup();
    const controller = new AbortController();
    const value = animated(0, interpolateNumber, env);
    const running = value.to(100, { duration: 1000, ease: linear, signal: controller.signal });
    clock.advance(200);
    controller.abort();
    expect(value.animating).toBe(false);
    expect(value.value).toBe(20);
    expect(value.target).toBe(20);
    await expect(running).resolves.toBe("cancelled");
  });

  it("stays put if its signal was already aborted", async () => {
    const { env } = setup();
    const controller = new AbortController();
    controller.abort();
    const value = animated(5, interpolateNumber, env);
    const running = value.to(100, { duration: 1000, signal: controller.signal });
    expect(value.value).toBe(5);
    expect(value.target).toBe(5);
    expect(value.animating).toBe(false);
    await expect(running).resolves.toBe("cancelled");
  });

  it("keeps a later target when an earlier animation's signal aborts", () => {
    const { clock, env } = setup();
    const controller = new AbortController();
    const value = animated(0, interpolateNumber, env);
    value.to(100, { duration: 1000, signal: controller.signal });
    clock.advance(200);
    value.to(50, { duration: 1000 });
    controller.abort();
    expect(value.target).toBe(50);
    expect(value.animating).toBe(true);
  });

  it("comes to rest where it stopped if onChange throws", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const { clock, env } = setup();
    const value = animated(0, interpolateNumber, {
      ...env,
      onChange: (v) => {
        if (v > 30) throw new Error("render failed");
      }
    });
    value.to(100, { duration: 1000, ease: linear });
    clock.advance(200);
    clock.advance(200);
    expect(reportError).toHaveBeenCalledOnce();
    expect(value.animating).toBe(false);
    expect(value.target).toBe(value.value);
    vi.unstubAllGlobals();
  });
});

describe("interpolators", () => {
  it("interpolateNumber is exact at both ends", () => {
    const blend = interpolateNumber(0.1, 0.3);
    expect(blend(0)).toBe(0.1);
    expect(blend(1)).toBe(0.3);
    expect(blend(0.5)).toBeCloseTo(0.2);
  });

  it("interpolatePoint blends both coordinates", () => {
    expect(interpolatePoint({ x: 0, y: 10 }, { x: 10, y: 0 })(0.25)).toEqual({ x: 2.5, y: 7.5 });
  });

  it("interpolateRecord grows new keys from 0 and drops removed keys at the end", () => {
    const from: Record<string, number> = { goals: 10, assists: 4 };
    const to: Record<string, number> = { goals: 20 };
    const blend = interpolateRecord(from, to);
    expect(blend(0.5)).toEqual({ goals: 15, assists: 2 });
    expect(blend(1)).toEqual({ goals: 20 });

    const grow = interpolateRecord<string>({ goals: 10 }, { goals: 10, assists: 8 });
    expect(grow(0.5)).toEqual({ goals: 10, assists: 4 });
  });

  it("works as an animated value's interpolator", () => {
    const { clock, env } = setup();
    const sizes = animated({ goals: 0, assists: 0 }, interpolateRecord, env);
    sizes.to({ goals: 16, assists: 4 }, { duration: 100, ease: linear });
    clock.advance(50);
    expect(sizes.value).toEqual({ goals: 8, assists: 2 });
  });
});
