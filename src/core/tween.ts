import { defaultClock, type Clock } from "./clock";
import { easeInOutCubic, type Easing } from "./easing";
import { motion, type MotionView, type Timing } from "./motion";

/** The clock and motion settings an animation runs against. */
export interface MotionEnv {
  readonly clock: Clock;
  readonly motion: MotionView;
}

export interface TweenOptions {
  /** Base duration in ms, scaled by the motion mode. */
  readonly duration: number;
  /** Default "transition". */
  readonly timing?: Timing;
  /** Default easeInOutCubic. */
  readonly ease?: Easing;
  /** Base delay in ms before progress starts, scaled like the duration. */
  readonly delay?: number;
  /** Called with eased progress: once with ease(0) at the start, then every frame, then with ease(1) at the end. */
  readonly update: (progress: number) => void;
  readonly signal?: AbortSignal;
}

export type TweenResult = "done" | "cancelled";

export interface Tween {
  /** Resolves when the tween ends. Never rejects. */
  readonly finished: Promise<TweenResult>;
  readonly state: "running" | TweenResult;
  /** Stop where it is. */
  cancel(): void;
  /** Jump to the end now. */
  finish(): void;
}

/**
 * Animate progress from 0 to 1. If the motion mode scales the duration to 0,
 * `update(ease(1))` runs synchronously, before `tween` returns. If the mode
 * turns off while the tween runs, it jumps to the end on the next frame.
 */
export function tween(options: TweenOptions, env: Partial<MotionEnv> = {}): Tween {
  const clock = env.clock ?? defaultClock;
  const view = env.motion ?? motion;
  const timing = options.timing ?? "transition";
  const ease = options.ease ?? easeInOutCubic;
  const duration = view.duration(options.duration, timing);
  const delay = options.delay ? view.duration(options.delay, timing) : 0;
  const { update, signal } = options;
  const start = clock.now();

  let state: Tween["state"] = "running";
  let unsubscribe: (() => void) | undefined;
  let resolve!: (result: TweenResult) => void;
  const finished = new Promise<TweenResult>((r) => {
    resolve = r;
  });

  const settle = (result: TweenResult): void => {
    state = result;
    unsubscribe?.();
    unsubscribe = undefined;
    signal?.removeEventListener("abort", cancel);
    resolve(result);
  };

  function cancel(): void {
    if (state === "running") settle("cancelled");
  }

  // True while the final update runs, so an update that calls finish() can't recurse.
  let finishing = false;

  function finish(): void {
    if (state !== "running" || finishing) return;
    finishing = true;
    step(1);
    // `update` may have cancelled the tween itself.
    if (state === "running") settle("done");
  }

  // Runs `update` and cancels the tween if it throws: a broken callback is reported once instead of
  // every frame, and `finished` never says "done" when the last update failed.
  function step(progress: number): void {
    try {
      update(ease(progress));
    } catch (error) {
      cancel();
      throw error;
    }
  }

  const onFrame = (now: number): void => {
    // The effective mode can turn off mid-flight (the device switches to reduced motion, or the
    // viewer picks Off). Every animation then jumps to its end state.
    if (view.mode === "off") {
      finish();
      return;
    }
    const elapsed = now - start - delay;
    if (elapsed >= duration) finish();
    else if (elapsed > 0) step(elapsed / duration);
  };

  const handle: Tween = {
    finished,
    get state() {
      return state;
    },
    cancel,
    finish
  };

  if (signal?.aborted) {
    settle("cancelled");
    return handle;
  }
  signal?.addEventListener("abort", cancel, { once: true });

  if (duration <= 0 && delay <= 0) {
    finish();
    return handle;
  }
  step(0);
  if (state === "running") unsubscribe = clock.onFrame(onFrame);
  return handle;
}
