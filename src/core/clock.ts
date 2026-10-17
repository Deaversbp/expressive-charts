import { report } from "./report";

/** Where frames come from. The default uses requestAnimationFrame, or a 16 ms timer outside the browser. */
export interface FrameSource {
  now(): number;
  /** Ask for one callback on the next frame. Returns a function that cancels it. */
  request(callback: (now: number) => void): () => void;
}

export interface Clock {
  now(): number;
  /** Call `callback` on every frame until the returned function is called. */
  onFrame(callback: (now: number) => void): () => void;
}

/** A clock that only moves when told to. For tests. */
export interface ManualClock extends Clock {
  /** Move time forward by `ms` and run one frame at the new time. */
  advance(ms: number): void;
  /** True when nothing is waiting for a frame. */
  readonly idle: boolean;
}

/**
 * One shared frame loop. It requests a frame only while something is
 * subscribed, so an idle page costs nothing.
 */
export function createClock(source: FrameSource = browserFrames()): Clock {
  const callbacks = new Set<(now: number) => void>();
  let cancelFrame: (() => void) | undefined;

  const schedule = (): void => {
    if (!cancelFrame && callbacks.size > 0) cancelFrame = source.request(tick);
  };

  const tick = (now: number): void => {
    cancelFrame = undefined;
    // Copy so callbacks can subscribe or unsubscribe while we iterate.
    for (const callback of [...callbacks]) {
      if (!callbacks.has(callback)) continue;
      try {
        callback(now);
      } catch (error) {
        report(error);
      }
    }
    schedule();
  };

  return {
    now: () => source.now(),
    onFrame(callback) {
      // Wrap so the same function can be subscribed twice and unsubscribed independently.
      const entry = (now: number): void => callback(now);
      callbacks.add(entry);
      schedule();
      return () => {
        if (!callbacks.delete(entry)) return;
        if (callbacks.size === 0 && cancelFrame) {
          cancelFrame();
          cancelFrame = undefined;
        }
      };
    }
  };
}

export function manualClock(start = 0): ManualClock {
  let time = start;
  let pending: ((now: number) => void) | undefined;

  const clock = createClock({
    now: () => time,
    request(callback) {
      pending = callback;
      return () => {
        if (pending === callback) pending = undefined;
      };
    }
  });

  return {
    now: clock.now,
    onFrame: clock.onFrame,
    get idle() {
      return pending === undefined;
    },
    advance(ms) {
      if (!(ms >= 0)) throw new RangeError(`manualClock.advance needs a non-negative number of ms, got ${ms}`);
      time += ms;
      const callback = pending;
      pending = undefined;
      callback?.(time);
    }
  };
}

// Looks up browser APIs when a frame is requested, never at import time, so Node can import the library.
function browserFrames(): FrameSource {
  const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
  return {
    now,
    request(callback) {
      if (typeof requestAnimationFrame === "function") {
        const id = requestAnimationFrame(callback);
        return () => cancelAnimationFrame(id);
      }
      const id = setTimeout(() => callback(now()), 16);
      return () => clearTimeout(id);
    }
  };
}

/** The page-wide clock every tween uses unless given another. */
export const defaultClock: Clock = /* @__PURE__ */ createClock();
