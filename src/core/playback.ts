// playback: a clock-driven controller for anything that plays through a range of values, such as a season
// revealed week by week. It owns a position and moves it; the page draws each position in onFrame. It has
// no DOM: playButton() (src/charts/controls) and the page's own scrubber drive it.

import { defaultClock } from "./clock";
import { easeInOutCubic, easeOutCubic, linear, type Easing } from "./easing";
import { motion as pageMotion, TIMINGS, type Timing } from "./motion";
import { report } from "./report";
import type { MotionEnv } from "./tween";

export interface PlaybackOptions extends Partial<MotionEnv> {
  /** Where a play starts again once it's at the end. */
  readonly from: number;
  /** Where a play ends. The playback starts here, at rest, as a chart shows all its data until something reveals less. */
  readonly to: number;
  /** Base ms for a play from `from` to `to`, scaled by `timing`. A play from part way takes its share, so the speed stays the same. */
  readonly duration: number;
  /** How a play moves. Default linear: constant speed. Seeks ease on their own. */
  readonly ease?: Easing;
  /** Default "playback": ×1 in Presentation, ×0.3 in Analysis, a jump in Off. */
  readonly timing?: Timing;
  /** Draws a position. Called whenever the position changes: every frame of a play or a seek, and every jump. */
  readonly onFrame: (position: number) => void;
}

/** What `subscribe` hears. Frames go to `onFrame` instead. */
export type PlaybackEvent = "play" | "pause" | "end" | "seek";

export interface SeekOptions {
  /** Default true: move over 350 ms base transition timing (at most 200 ms in Analysis, a jump in Off). false jumps. */
  readonly animate?: boolean;
}

export interface Playback {
  /** Plays on from where it is to `to`, or from `from` when it's at the end. Does nothing while playing. */
  play(): void;
  /** Stops a play where it is. Does nothing unless it's playing, so a seek on its way still lands. */
  pause(): void;
  /** Pauses, and moves to `x`, clamped to the range. A seek while it's moving starts from where it is. */
  seek(x: number, options?: SeekOptions): void;
  /** Where it is now, in between while it moves. */
  readonly position: number;
  /** True from `play()` until a pause, a seek or the end. */
  readonly playing: boolean;
  /** Hears play, pause, the end and seeks, not every frame. Returns a function that stops listening. */
  subscribe(listener: (event: PlaybackEvent) => void): () => void;
  /** Pauses it, if it's playing, and stops it for good: later calls do nothing. */
  destroy(): void;
}

/** The lab's scrubber: a seek takes 350 ms base, with "transition" timing. */
const SEEK_MS = 350;

/** A move under way: a play or a seek. `moved` once a frame has moved it, so a retarget eases out. */
interface Move {
  moved: boolean;
  readonly stop: () => void;
}

/**
 * A playback through `from`…`to`. `play()` moves the position at constant speed (with the default
 * `linear`), over `duration` scaled by the motion mode, and `onFrame` draws each position. With motion
 * off, a play jumps to the end, and motion turning off mid-play jumps there too, as tweens do. Nothing
 * plays by itself. Uses the page-wide motion and clock unless given its own.
 */
export function playback(options: PlaybackOptions): Playback {
  checkOptions(options);
  const { from, to, duration, onFrame } = options;
  const ease = options.ease ?? linear;
  const timing = options.timing ?? "playback";
  const clock = options.clock ?? defaultClock;
  const view = options.motion ?? pageMotion;
  const low = Math.min(from, to);
  const high = Math.max(from, to);

  let position = to;
  let playing = false;
  let destroyed = false;
  let move: Move | undefined;
  // Bumped by every play, pause, seek and destroy. Anything that calls out (to onFrame or a listener)
  // checks it afterwards, so it stops if that call started something else.
  let generation = 0;
  const listeners = new Set<(event: PlaybackEvent) => void>();

  const notify = (event: PlaybackEvent): void => {
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try {
        listener(event);
      } catch (error) {
        report(error);
      }
    }
  };

  /** Stops the move under way, where it is. True if it had moved. */
  const halt = (): boolean => {
    const current = move;
    move = undefined;
    current?.stop();
    return current?.moved ?? false;
  };

  /** Ends a play that didn't reach the end: halted by a pause, a seek, destroy(), or a failing onFrame or ease. */
  const stopPlaying = (): void => {
    if (!playing) return;
    playing = false;
    notify("pause");
  };

  // When the page's onFrame or ease throws, everything stops where it is and the error goes on to the
  // caller (or to the clock, which reports it), so a broken callback is reported once rather than every frame.
  const fail = (error: unknown): never => {
    generation++;
    halt();
    stopPlaying();
    throw error;
  };

  /** Draws a new position. */
  const assign = (x: number): void => {
    if (x === position) return;
    position = x;
    try {
      onFrame(x);
    } catch (error) {
      fail(error);
    }
  };

  /** Moves to `target` over `ms`, eased, then calls `landed`. 0 ms jumps, before it returns. */
  const glide = (target: number, ms: number, curve: Easing, landed: () => void): void => {
    const mine = generation;
    if (!(ms > 0)) {
      assign(target);
      if (generation === mine) landed();
      return;
    }
    const origin = position;
    const start = clock.now();
    const current: Move = {
      moved: false,
      stop: clock.onFrame((now) => {
        // The effective mode can turn off mid-move (the device switches to reduced motion, or the
        // viewer picks Off). The move then jumps to its end, as tweens do.
        const t = view.mode === "off" ? 1 : (now - start) / ms;
        if (t < 1) {
          current.moved = true;
          let progress: number;
          try {
            progress = curve(t);
          } catch (error) {
            return fail(error);
          }
          assign(origin + (target - origin) * progress);
          return;
        }
        halt();
        assign(target);
        if (generation === mine) landed();
      })
    };
    move = current;
  };

  const landedAtEnd = (): void => {
    playing = false;
    notify("end");
  };

  return {
    get position() {
      return position;
    },
    get playing() {
      return playing;
    },
    play() {
      if (destroyed || playing) return;
      const mine = ++generation;
      halt();
      playing = true;
      notify("play");
      if (generation !== mine) return;
      // Scaled once for the whole range, then shared out, so a play from part way keeps the same speed.
      const whole = view.duration(duration, timing);
      // At the end, a play starts again from `from`. With motion off it just shows the end, which is already there.
      if (whole > 0 && position === to) {
        assign(from);
        if (generation !== mine) return;
      }
      glide(to, (whole * Math.abs(to - position)) / Math.abs(to - from), ease, landedAtEnd);
    },
    pause() {
      if (destroyed || !playing) return;
      generation++;
      halt();
      stopPlaying();
    },
    seek(x, seekOptions = {}) {
      checkSeek(x, seekOptions);
      if (destroyed) return;
      const mine = ++generation;
      const moving = halt();
      stopPlaying();
      if (generation !== mine) return;
      notify("seek");
      if (generation !== mine) return;
      const ms = seekOptions.animate === false ? 0 : view.duration(SEEK_MS, "transition");
      // Retargeting a moving position eases out, so the motion doesn't stall; from rest it eases in and
      // out. The same rule as animated values.
      glide(Math.min(Math.max(x, low), high), ms, moving ? easeOutCubic : easeInOutCubic, () => {});
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError(`playback.subscribe needs a function, got ${typeof listener}.`);
      if (destroyed) return () => {};
      // Wrapped so the same function can be subscribed twice and unsubscribed independently.
      const entry = (event: PlaybackEvent): void => listener(event);
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      halt();
      // Heard before the listeners go, so a play button still on the page goes back to Play.
      stopPlaying();
      listeners.clear();
    }
  };
}

function checkOptions(options: PlaybackOptions): void {
  if (typeof options !== "object" || options === null) {
    throw new TypeError("playback needs options: { from, to, duration, onFrame }.");
  }
  const { from, to, duration, ease, timing, onFrame, clock, motion } = options;
  for (const [name, value] of [["from", from], ["to", to]] as const) {
    if (!isFiniteNumber(value)) throw new RangeError(`playback: ${name} must be a finite number, got ${String(value)}.`);
  }
  if (from === to) throw new RangeError(`playback: from and to must differ, got ${from} for both.`);
  if (!isFiniteNumber(duration) || duration < 0) {
    throw new RangeError(`playback: duration must be a non-negative number of ms, got ${String(duration)}.`);
  }
  if (typeof onFrame !== "function") throw new TypeError(`playback: onFrame must be a function, got ${typeof onFrame}.`);
  if (ease !== undefined && typeof ease !== "function") throw new TypeError(`playback: ease must be a function, got ${typeof ease}.`);
  if (timing !== undefined && !TIMINGS.includes(timing)) {
    throw new RangeError(`playback: timing must be one of ${TIMINGS.join(", ")}, got ${JSON.stringify(timing) ?? String(timing)}.`);
  }
  if (clock !== undefined && (typeof clock?.now !== "function" || typeof clock.onFrame !== "function")) {
    throw new TypeError("playback: clock must be a Clock, such as one from createClock() or manualClock().");
  }
  if (motion !== undefined && typeof motion?.duration !== "function") {
    throw new TypeError("playback: motion must be a Motion, such as the page-wide `motion` or one from createMotion().");
  }
}

function checkSeek(x: number, options: SeekOptions): void {
  if (!isFiniteNumber(x)) throw new RangeError(`playback.seek needs a finite number, got ${String(x)}.`);
  if (typeof options !== "object" || options === null) throw new TypeError("playback.seek's options must be an object, such as { animate: false }.");
  if (options.animate !== undefined && typeof options.animate !== "boolean") {
    throw new TypeError(`playback.seek: animate must be true or false, got ${String(options.animate)}.`);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
