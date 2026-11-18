// wait: draws nothing for a while, so the next part of a sequence starts later:
// sequence(wait(750), flash()). It reads nothing of the mark, so it runs on any mark.

import type { GeometryEffect } from "../core";

/**
 * Draws nothing for `duration` base ms, with effect timing, which the motion mode scales as it
 * scales `drawIn`'s, and then resolves. Cancelled, it resolves at once. Its end state is nothing
 * drawn, so with motion off it takes no time, and `sequence(wait(750), flash())` is `flash()`'s end
 * state. A `duration` that isn't a number of 0 or more throws a RangeError.
 */
export function wait(duration: number): GeometryEffect {
  if (!(typeof duration === "number" && duration >= 0 && Number.isFinite(duration))) {
    throw new RangeError(`wait: duration must be 0 ms or more, got ${String(duration)}.`);
  }
  return {
    kind: "geometry",
    async run(_mark, ctx) {
      if (ctx.signal.aborted) return;
      await ctx.tween({ duration, timing: "effect", update() {} }).finished;
    },
    end() {},
    clear() {}
  };
}
