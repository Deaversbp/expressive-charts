// flash: one halo blink along the mark's outline, for "this changed" (`on: { update: "flash" }`). It
// reads nothing of the geometry: the halo is a mark style, which the renderer strokes along the outline
// as it is on screen, so it follows the mark through the transition it runs alongside.

import { linear } from "../core";
import type { Color, EffectContext, GeometryEffect } from "../core";

export interface FlashOptions {
  /** The halo's widest stroke, px; half of it shows outside the mark. Default 8, as in the prototype. */
  readonly width?: number;
  /** Default 0.35. */
  readonly opacity?: number;
  /** A theme token or any CSS colour. Default: the mark's own colour. */
  readonly color?: Color;
}

/** Base duration, with effect timing. */
const DURATION = 900;
/** The prototype's keyframes: the stroke is widest a quarter of the way through. */
const PEAK = 0.25;
const WIDTH = 8;
const OPACITY = 0.35;

/**
 * One blink of a halo along the mark's outline: the stroke grows from 0 to `width` and back over a
 * 900 ms base, as the prototype's CSS flash does.
 *
 * Its end state is nothing, on purpose. A flash is emphasis, not information: the change it points
 * at (the bar's new length, its new value label) stays on the chart, so with motion off or reduced
 * the viewer still sees everything the flash would have drawn attention to.
 */
export function flash(options: FlashOptions = {}): GeometryEffect {
  checkOptions(options);
  const width = options.width ?? WIDTH;
  const opacity = options.opacity ?? OPACITY;
  const { color } = options;

  const show = (ctx: EffectContext, progress: number): void => {
    const stroke = width * blink(progress);
    ctx.mark.set({ halo: stroke > 0 ? { width: stroke, opacity, ...(color === undefined ? {} : { color }) } : undefined });
  };

  return {
    kind: "geometry",
    async run(_mark, ctx) {
      if (ctx.signal.aborted) return;
      // Linear here: the keyframes ease each half themselves.
      await ctx.tween({ duration: DURATION, timing: "effect", ease: linear, update: (p) => show(ctx, p) }).finished;
    },
    end() {},
    clear() {}
  };
}

/** The halo's width at linear progress t, 0–1: up to 1 by PEAK, back to 0 at the end, each half eased out. */
function blink(t: number): number {
  if (!(t > 0) || t >= 1) return 0;
  return t < PEAK ? easeOut(t / PEAK) : 1 - easeOut((t - PEAK) / (1 - PEAK));
}

/** CSS's `ease-out`, cubic-bezier(0, 0, 0.58, 1), which the prototype's keyframes use. */
function easeOut(x: number): number {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  // x(s) = 1.74·s²(1 − s) + s³ rises with s, so bisection finds the curve's parameter.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const s = (lo + hi) / 2;
    if (1.74 * s * s * (1 - s) + s * s * s < x) lo = s;
    else hi = s;
  }
  const s = (lo + hi) / 2;
  return 3 * s * s - 2 * s * s * s;
}

function checkOptions(options: FlashOptions): void {
  const { width, opacity, color } = options;
  if (width !== undefined && !(typeof width === "number" && width > 0 && Number.isFinite(width))) {
    throw new RangeError(`flash: width must be more than 0 px, got ${String(width)}.`);
  }
  if (opacity !== undefined && !(typeof opacity === "number" && opacity > 0 && opacity <= 1)) {
    throw new RangeError(`flash: opacity must be more than 0 and at most 1, got ${String(opacity)}.`);
  }
  if (color !== undefined && (typeof color !== "string" || color === "")) {
    throw new RangeError(`flash: color must be a theme token or a CSS colour, got ${JSON.stringify(color) ?? String(color)}.`);
  }
}
