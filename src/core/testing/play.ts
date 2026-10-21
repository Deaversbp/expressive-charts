// Plays a run to its end on a manual clock, for effect tests.

import type { ManualClock } from "../clock";

export interface PlayOptions {
  /** Ms per frame. Default 16. */
  readonly frame?: number;
  /** Gives up after this many ms. Default 10 000. */
  readonly limit?: number;
}

/**
 * Advances the clock a frame at a time until `running` settles, letting promise callbacks run
 * between frames (so a sequence's next part starts on time). Resolves with the ms it advanced; throws
 * if `running` hasn't settled within the limit.
 */
export async function play(clock: ManualClock, running: Promise<unknown>, options: PlayOptions = {}): Promise<number> {
  const frame = options.frame ?? 16;
  const limit = options.limit ?? 10_000;
  let settled = false;
  running.then(
    () => (settled = true),
    () => (settled = true)
  );
  let elapsed = 0;
  await flush();
  while (!settled) {
    if (elapsed >= limit) throw new Error(`play: still running after ${limit} ms.`);
    clock.advance(frame);
    elapsed += frame;
    await flush();
  }
  return elapsed;
}

/** Lets pending promise callbacks run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
