import { manualClock } from "./clock";
import { easeInOutCubic, easeOutCubic } from "./easing";
import { createMotion, motion as pageMotion, type MotionMode, type ReducedMotionSource } from "./motion";
import { playback, type PlaybackEvent, type PlaybackOptions } from "./playback";

/** A device whose reduced-motion setting the test can flip. */
function device(initial = false): ReducedMotionSource & { set(matches: boolean): void } {
  let matches = initial;
  const listeners = new Set<() => void>();
  return {
    get matches() {
      return matches;
    },
    set(next) {
      matches = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

/** A playback from 0 to 100 over 1 s by default, on a manual clock, recording its frames and what it notifies. */
function setup(options: Partial<PlaybackOptions> & { mode?: MotionMode; reduced?: boolean } = {}) {
  const { mode, reduced: startReduced, ...rest } = options;
  const clock = manualClock();
  const reduced = device(startReduced);
  const motion = createMotion({ mode, reducedMotion: reduced });
  const frames: number[] = [];
  const events: PlaybackEvent[] = [];
  const player = playback({ from: 0, to: 100, duration: 1000, clock, motion, onFrame: (x) => frames.push(x), ...rest });
  player.subscribe((event) => events.push(event));
  return { clock, motion, reduced, player, frames, events };
}

/** The lab's season: weeks 1 to 38 in 6.5 s. */
const season = { from: 1, to: 38, duration: 6500 };

afterEach(() => {
  pageMotion.clearChoice();
  vi.unstubAllGlobals();
});

describe("playback", () => {
  it("starts at rest at `to`, and plays nothing by itself", () => {
    const { clock, player, frames, events } = setup();
    expect(player.position).toBe(100);
    expect(player.playing).toBe(false);
    clock.advance(1000);
    expect(frames).toEqual([]);
    expect(events).toEqual([]);
    expect(clock.idle).toBe(true);
  });

  it("plays from `from` when it's at the end, at constant speed over the whole duration", () => {
    const { clock, player, frames, events } = setup(season);
    player.play();
    expect(frames).toEqual([1]);
    expect(player.playing).toBe(true);
    expect(events).toEqual(["play"]);
    clock.advance(650);
    expect(player.position).toBeCloseTo(1 + 37 * 0.1);
    clock.advance(2600);
    expect(player.position).toBeCloseTo(19.5);
    clock.advance(3250);
    expect(player.position).toBe(38);
    expect(frames[frames.length - 1]).toBe(38);
    expect(player.playing).toBe(false);
    expect(events).toEqual(["play", "end"]);
    expect(clock.idle).toBe(true);
  });

  it("plays on from where it is over the remaining share of the duration", () => {
    const { clock, player, events } = setup();
    player.seek(40, { animate: false });
    player.play();
    expect(player.position).toBe(40);
    clock.advance(300); // 60 to go at 100 per second: 600 ms
    expect(player.position).toBeCloseTo(70);
    clock.advance(300);
    expect(player.position).toBe(100);
    expect(events).toEqual(["seek", "play", "end"]);
  });

  it("takes its share of the scaled duration, so the speed holds whatever the timing's rule", () => {
    // "transition" in Analysis caps the whole run at 200 ms, so half the range takes 100 ms.
    const { clock, player } = setup({ mode: "analysis", timing: "transition" });
    player.seek(50, { animate: false });
    player.play();
    clock.advance(50);
    expect(player.position).toBeCloseTo(75);
    clock.advance(50);
    expect(player.position).toBe(100);
    expect(player.playing).toBe(false);
  });

  it("scales by mode: the whole season in 6.5 s in Presentation and about 2 s (× 0.3) in Analysis", () => {
    const presentation = setup(season);
    presentation.player.play();
    presentation.clock.advance(6499);
    expect(presentation.player.playing).toBe(true);
    presentation.clock.advance(1);
    expect(presentation.player.playing).toBe(false);

    const analysis = setup({ ...season, mode: "analysis" });
    analysis.player.play();
    analysis.clock.advance(975);
    expect(analysis.player.position).toBeCloseTo(19.5);
    analysis.clock.advance(975);
    expect(analysis.player.position).toBe(38);
    expect(analysis.events).toEqual(["play", "end"]);
  });

  it("jumps to the end at once with motion off, whether the author's mode or the device asks for it", () => {
    for (const options of [{ mode: "off" as const }, { reduced: true }]) {
      const { clock, player, frames, events } = setup(options);
      // At the end, the end is already showing: nothing moves.
      player.play();
      expect(frames).toEqual([]);
      expect(events).toEqual(["play", "end"]);
      expect(player.playing).toBe(false);

      player.seek(30, { animate: false });
      player.play();
      expect(frames).toEqual([30, 100]);
      expect(events).toEqual(["play", "end", "seek", "play", "end"]);
      expect(clock.idle).toBe(true);
    }
  });

  it("jumps to the end on the next frame when motion turns off mid-play", () => {
    const { clock, reduced, player, events } = setup();
    player.play();
    clock.advance(250);
    expect(player.position).toBeCloseTo(25);
    reduced.set(true);
    clock.advance(16);
    expect(player.position).toBe(100);
    expect(player.playing).toBe(false);
    expect(events).toEqual(["play", "end"]);
    expect(clock.idle).toBe(true);

    // The viewer picking Off does the same.
    const viewer = setup();
    viewer.player.play();
    viewer.clock.advance(100);
    viewer.motion.chooseMode("off");
    viewer.clock.advance(16);
    expect(viewer.player.position).toBe(100);
    expect(viewer.events).toEqual(["play", "end"]);
  });

  it("pauses where it is, and resumes from there over what's left", () => {
    const { clock, player, events } = setup();
    player.play();
    clock.advance(300);
    player.pause();
    expect(player.position).toBeCloseTo(30);
    expect(player.playing).toBe(false);
    expect(clock.idle).toBe(true);
    clock.advance(500);
    expect(player.position).toBeCloseTo(30);

    player.play();
    clock.advance(350);
    expect(player.position).toBeCloseTo(65);
    clock.advance(350);
    expect(player.position).toBe(100);
    expect(events).toEqual(["play", "pause", "play", "end"]);
  });

  it("ignores play while playing and pause while paused", () => {
    const { clock, player, events } = setup();
    player.pause();
    player.play();
    clock.advance(500);
    player.play();
    clock.advance(250);
    expect(player.position).toBeCloseTo(75);
    player.pause();
    player.pause();
    expect(events).toEqual(["play", "pause"]);
  });

  it("plays with its own ease", () => {
    const { clock, player } = setup({ ease: easeInOutCubic });
    player.play();
    clock.advance(250);
    expect(player.position).toBeCloseTo(100 * easeInOutCubic(0.25));
  });

  it("plays backwards when `from` is above `to`", () => {
    const { clock, player } = setup({ from: 10, to: 0 });
    expect(player.position).toBe(0);
    player.play();
    expect(player.position).toBe(10);
    clock.advance(500);
    expect(player.position).toBeCloseTo(5);
    clock.advance(500);
    expect(player.position).toBe(0);
    player.seek(-3, { animate: false });
    expect(player.position).toBe(0);
    player.seek(12, { animate: false });
    expect(player.position).toBe(10);
  });

  describe("seek", () => {
    it("moves over 350 ms, easing in and out from rest", () => {
      const { clock, player, events } = setup();
      player.seek(60);
      expect(events).toEqual(["seek"]);
      expect(player.position).toBe(100);
      clock.advance(175);
      expect(player.position).toBeCloseTo(100 - 40 * easeInOutCubic(0.5));
      clock.advance(175);
      expect(player.position).toBe(60);
      expect(player.playing).toBe(false);
      expect(clock.idle).toBe(true);
    });

    it("pauses a play, and eases out from the moving position", () => {
      const { clock, player, events } = setup();
      player.play();
      clock.advance(200);
      player.seek(60);
      expect(player.playing).toBe(false);
      expect(events).toEqual(["play", "pause", "seek"]);
      clock.advance(175);
      expect(player.position).toBeCloseTo(20 + 40 * easeOutCubic(0.5));
      clock.advance(175);
      expect(player.position).toBe(60);
      expect(events).toEqual(["play", "pause", "seek"]);
    });

    it("retargets a seek on its way, from where it is", () => {
      const { clock, player, events } = setup();
      player.seek(60);
      clock.advance(175);
      const midway = player.position;
      player.seek(0);
      clock.advance(175);
      expect(player.position).toBeCloseTo(midway * (1 - easeOutCubic(0.5)));
      clock.advance(175);
      expect(player.position).toBe(0);
      expect(events).toEqual(["seek", "seek"]);
    });

    it("lands even if pause() is called on the way, as a scrubber's handler may", () => {
      const { clock, player } = setup();
      player.seek(60);
      clock.advance(100);
      player.pause();
      clock.advance(250);
      expect(player.position).toBe(60);
    });

    it("takes at most 200 ms in Analysis, jumps in Off, and jumps with { animate: false }", () => {
      const analysis = setup({ mode: "analysis" });
      analysis.player.seek(50);
      analysis.clock.advance(122);
      expect(analysis.player.position).toBeGreaterThan(50);
      analysis.clock.advance(1); // 350 × 0.35 = 122.5 ms
      expect(analysis.player.position).toBe(50);

      const off = setup({ mode: "off" });
      off.player.seek(50);
      expect(off.frames).toEqual([50]);
      expect(off.clock.idle).toBe(true);

      const jump = setup();
      jump.player.play();
      jump.clock.advance(100);
      jump.player.seek(80, { animate: false });
      expect(jump.player.position).toBe(80);
      expect(jump.player.playing).toBe(false);
      expect(jump.clock.idle).toBe(true);
      expect(jump.events).toEqual(["play", "pause", "seek"]);
    });

    it("clamps to the range", () => {
      const { player } = setup();
      player.seek(-5, { animate: false });
      expect(player.position).toBe(0);
      player.seek(500, { animate: false });
      expect(player.position).toBe(100);
    });

    it("then plays from where it landed, or from `from` if that's the end", () => {
      const { clock, player, frames } = setup();
      player.seek(100, { animate: false });
      player.play();
      expect(frames).toEqual([0]);
      clock.advance(500);
      player.seek(100, { animate: false });
      player.play();
      expect(frames[frames.length - 1]).toBe(0);
    });
  });

  describe("subscribe", () => {
    it("hears play, pause, the end and seeks, but no frames", () => {
      const { clock, player, events } = setup();
      player.play();
      for (let i = 0; i < 10; i++) clock.advance(16);
      player.pause();
      player.seek(10);
      clock.advance(400);
      player.play();
      clock.advance(1000);
      expect(events).toEqual(["play", "pause", "seek", "play", "end"]);
    });

    it("stops on unsubscribe, and lets the same listener subscribe twice", () => {
      const { player } = setup();
      const listener = vi.fn();
      const first = player.subscribe(listener);
      player.subscribe(listener);
      player.seek(10, { animate: false });
      expect(listener).toHaveBeenCalledTimes(2);
      first();
      first();
      player.seek(20, { animate: false });
      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenLastCalledWith("seek");
    });

    it("lets a listener pause or seek from inside a notification", () => {
      const { clock, player, events } = setup();
      const stop = player.subscribe((event) => {
        if (event === "play") player.pause();
      });
      player.play();
      expect(player.playing).toBe(false);
      expect(player.position).toBe(100);
      expect(clock.idle).toBe(true);
      expect(events).toEqual(["play", "pause"]);
      stop();

      player.subscribe((event) => {
        if (event === "pause") player.seek(30, { animate: false });
      });
      player.play();
      clock.advance(100);
      player.pause();
      expect(player.position).toBe(30);
      expect(clock.idle).toBe(true);
    });

    it("reports a throwing listener and still tells the rest", () => {
      const reportError = vi.fn();
      vi.stubGlobal("reportError", reportError);
      const { player, events } = setup();
      const boom = new Error("boom");
      player.subscribe(() => {
        throw boom;
      });
      const after = vi.fn();
      player.subscribe(after);
      player.seek(10);
      expect(reportError).toHaveBeenCalledWith(boom);
      expect(events).toEqual(["seek"]);
      expect(after).toHaveBeenCalledWith("seek");
    });
  });

  it("stops where it is when onFrame throws, and the clock reports it once", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const boom = new Error("boom");
    const { clock, player, events } = setup({
      onFrame: (x) => {
        if (x > 35) throw boom;
      }
    });
    player.play();
    while (!clock.idle) clock.advance(100);
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledWith(boom);
    expect(player.playing).toBe(false);
    expect(player.position).toBeCloseTo(40);
    expect(events).toEqual(["play", "pause"]);

    // A jump that throws throws to the caller.
    expect(() => player.seek(90, { animate: false })).toThrow(boom);
    expect(player.position).toBe(90);
  });

  it("uses the page-wide motion unless given one", () => {
    pageMotion.chooseMode("off");
    const frames: number[] = [];
    const player = playback({ from: 0, to: 10, duration: 1000, onFrame: (x) => frames.push(x) });
    player.seek(5);
    player.play();
    expect(frames).toEqual([5, 10]);
    player.destroy();
  });

  it("pauses on destroy, telling its listeners, and then ignores every call", () => {
    const { clock, player, frames, events } = setup();
    player.play();
    clock.advance(100);
    player.destroy();
    player.destroy();
    expect(events).toEqual(["play", "pause"]);
    expect(clock.idle).toBe(true);
    const drawn = frames.length;
    player.play();
    player.seek(50, { animate: false });
    player.pause();
    clock.advance(1000);
    expect(frames).toHaveLength(drawn);
    expect(player.playing).toBe(false);
    expect(events).toEqual(["play", "pause"]);
    const late = vi.fn();
    player.subscribe(late)();
  });

  it("checks what it's given", () => {
    const onFrame = (): void => {};
    const base = { from: 0, to: 10, duration: 100, onFrame };
    expect(() => playback(undefined as unknown as PlaybackOptions)).toThrow(TypeError);
    expect(() => playback({ ...base, from: Number.NaN })).toThrow(/from must be a finite number/);
    expect(() => playback({ ...base, to: "10" as unknown as number })).toThrow(/to must be a finite number/);
    expect(() => playback({ ...base, to: 0 })).toThrow(/from and to must differ/);
    expect(() => playback({ ...base, duration: -1 })).toThrow(/duration must be a non-negative number/);
    expect(() => playback({ ...base, duration: Infinity })).toThrow(RangeError);
    expect(() => playback({ ...base, onFrame: undefined as unknown as typeof onFrame })).toThrow(/onFrame must be a function/);
    expect(() => playback({ ...base, ease: "linear" as unknown as (t: number) => number })).toThrow(/ease must be a function/);
    expect(() => playback({ ...base, timing: "slow" as "playback" })).toThrow(/timing must be one of feedback, transition, effect, playback, stagger/);
    expect(() => playback({ ...base, clock: {} as ReturnType<typeof manualClock> })).toThrow(/clock must be a Clock/);
    expect(() => playback({ ...base, motion: {} as typeof pageMotion })).toThrow(/motion must be a Motion/);

    const { player } = setup();
    expect(() => player.seek(Number.NaN)).toThrow(/seek needs a finite number/);
    expect(() => player.seek(5, { animate: "no" as unknown as boolean })).toThrow(/animate must be true or false/);
    expect(() => player.subscribe(undefined as unknown as () => void)).toThrow(/subscribe needs a function/);
  });
});
