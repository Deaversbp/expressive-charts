// pulse: a halo that grows out from the mark's outline and fades, a few times over, for "look here"
// (`on: { enter: "pulse" }`). Like flash it reads nothing of the geometry: the renderer strokes the
// halo along the outline as it is on screen.

import { easeOutCubic, linear } from "../core";
import type { Color, EffectContext, GeometryEffect } from "../core";

export interface PulseOptions {
  /** How many pulses, a whole number from 1 to 6. Fewer play if they wouldn't finish within 5 s. Default 2. */
  readonly times?: number;
  /** The halo's widest stroke, px; half of it shows outside the mark. Default 12. */
  readonly width?: number;
  /** A theme token or any CSS colour. Default: the mark's own colour. */
  readonly color?: Color;
}

/** Base duration of each pulse, with effect timing. */
const DURATION = 600;
const TIMES = 2;
const MAX_TIMES = 6;
const WIDTH = 12;
/** The halo's opacity as it starts; it fades to 0 as it widens. */
const OPACITY = 0.4;
/** Every pulse ends before this, in ms after scaling: anything longer needs a pause control (WCAG 2.2.2). */
const LIMIT = 5000;

/**
 * Halos that widen from 0 to `width` while fading from 40% to nothing, 600 ms base each, `times`
 * over. Each pulse is its own tween, so Analysis shortens every pulse rather than dropping any; a
 * page whose scaling stretches pulses past 5 s in all gets fewer of them instead.
 *
 * It never changes the mark's size, so a value never looks bigger than it is. Its end state is
 * nothing: a pulse draws attention, and what it points at stays on the chart.
 */
export function pulse(options: PulseOptions = {}): GeometryEffect {
  checkOptions(options);
  const times = options.times ?? TIMES;
  const width = options.width ?? WIDTH;
  const { color } = options;

  // The ring rushes out and slows, while it fades steadily.
  const show = (ctx: EffectContext, t: number): void => {
    const visible = t > 0 && t < 1;
    ctx.mark.set({
      halo: visible ? { width: width * easeOutCubic(t), opacity: OPACITY * (1 - t), ...(color === undefined ? {} : { color }) } : undefined
    });
  };

  return {
    kind: "geometry",
    async run(_mark, ctx) {
      let total = 0;
      for (let i = 0; i < times; i++) {
        if (ctx.signal.aborted) return;
        // Each pulse's length as the motion scales it now; drop the ones that would end at 5 s or later.
        const length = ctx.motion.duration(DURATION, "effect");
        if (total + length >= LIMIT) return;
        total += length;
        // Linear here: show() eases the width itself.
        await ctx.tween({ duration: DURATION, timing: "effect", ease: linear, update: (t) => show(ctx, t) }).finished;
      }
    },
    end() {},
    clear() {}
  };
}

function checkOptions(options: PulseOptions): void {
  const { times, width, color } = options;
  if (times !== undefined && !(Number.isInteger(times) && times >= 1 && times <= MAX_TIMES)) {
    throw new RangeError(`pulse: times must be a whole number from 1 to ${MAX_TIMES}, got ${String(times)}.`);
  }
  if (width !== undefined && !(typeof width === "number" && width > 0 && Number.isFinite(width))) {
    throw new RangeError(`pulse: width must be more than 0 px, got ${String(width)}.`);
  }
  if (color !== undefined && (typeof color !== "string" || color === "")) {
    throw new RangeError(`pulse: color must be a theme token or a CSS colour, got ${JSON.stringify(color) ?? String(color)}.`);
  }
}
