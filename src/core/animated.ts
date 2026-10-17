import type { Point } from "./contracts/geometry";
import { easeInOutCubic, easeOutCubic, type Easing } from "./easing";
import type { Timing } from "./motion";
import { tween, type MotionEnv, type Tween, type TweenResult } from "./tween";

/** Builds a function that blends `from` into `to` as t goes from 0 to 1. */
export type Interpolator<T> = (from: T, to: T) => (t: number) => T;

/** Exact at both ends, so a finished animation lands on its target. */
export const interpolateNumber: Interpolator<number> = (a, b) => (t) => a * (1 - t) + b * t;

export const interpolatePoint: Interpolator<Point> = (a, b) => (t) => ({
  x: a.x * (1 - t) + b.x * t,
  y: a.y * (1 - t) + b.y * t
});

/**
 * Blends every key. A key missing on one side counts as 0 there, so a series
 * that appears grows from 0, and one that disappears shrinks to 0 and is gone at t = 1.
 */
export function interpolateRecord<K extends string>(
  a: Readonly<Record<K, number>>,
  b: Readonly<Record<K, number>>
): (t: number) => Record<K, number> {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])] as K[];
  return (t) => {
    if (t === 1) return { ...b };
    const out = {} as Record<K, number>;
    for (const key of keys) out[key] = (a[key] ?? 0) * (1 - t) + (b[key] ?? 0) * t;
    return out;
  };
}

export interface AnimateOptions {
  /** Base duration in ms, scaled by the motion mode. */
  readonly duration: number;
  /** Default "transition". */
  readonly timing?: Timing;
  /** Default easeInOutCubic, or easeOutCubic when this interrupts a running animation. */
  readonly ease?: Easing;
  readonly delay?: number;
  readonly signal?: AbortSignal;
}

export interface AnimatedOptions<T> extends Partial<MotionEnv> {
  /** Called whenever the value changes, including every animation frame. */
  readonly onChange?: (value: T) => void;
}

/** A value that can be retargeted mid-flight. */
export interface Animated<T> {
  /** The current value, in between while animating. */
  readonly value: T;
  /** Where the value is heading (equal to `value` when at rest). */
  readonly target: T;
  readonly animating: boolean;
  /** Animate from the current value, cancelling any animation already running. */
  to(target: T, options: AnimateOptions): Promise<TweenResult>;
  /** Jump to a value, cancelling any running animation. */
  set(value: T): void;
  /** Stop where it is; the current value becomes the target. */
  stop(): void;
}

export function animated<T>(initial: T, interpolate: Interpolator<T>, options: AnimatedOptions<T> = {}): Animated<T> {
  const { onChange, ...env } = options;
  let value = initial;
  let target = initial;
  let running: Tween | undefined;

  const assign = (next: T): void => {
    value = next;
    onChange?.(next);
  };

  const halt = (): void => {
    const current = running;
    running = undefined;
    current?.cancel();
  };

  return {
    get value() {
      return value;
    },
    get target() {
      return target;
    },
    get animating() {
      return running?.state === "running";
    },
    to(next, animate) {
      const interrupted = running?.state === "running";
      halt();
      target = next;
      const blend = interpolate(value, next);
      const current = tween(
        {
          duration: animate.duration,
          timing: animate.timing,
          // Restarting an ease-in-out from a moving value would stall; ease out instead.
          ease: animate.ease ?? (interrupted ? easeOutCubic : easeInOutCubic),
          delay: animate.delay,
          signal: animate.signal,
          update: (progress) => assign(blend(progress))
        },
        env
      );
      if (current.state === "running") running = current;
      return current.finished;
    },
    set(next) {
      halt();
      target = next;
      assign(next);
    },
    stop() {
      halt();
      target = value;
    }
  };
}
