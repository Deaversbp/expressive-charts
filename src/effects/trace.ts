// trace: a highlighter stroke that draws itself along the mark's walk and stays (the effects guide's
// sketch, grown). It reads only the walk, so it runs on any mark, and it leaves the mark itself
// untouched, so it's safe in any slot.

import { easeInOutCubic } from "../core";
import type { Color, EffectContext, GeometryEffect, MarkGeometry, Paint, PathHandle } from "../core";

export interface TraceOptions {
  /** A theme token or any CSS colour. Default "mark", the mark's own colour (a stack's first segment's). */
  readonly color?: Color;
  /** The stroke's width, px. Default 3. */
  readonly width?: number;
  /** From 0 to 1. Default 0.5. */
  readonly opacity?: number;
  /** Base ms to draw the stroke, before the motion mode scales it, with effect timing. Default 500. */
  readonly duration?: number;
}

const DURATION = 500;
const WIDTH = 3;
const OPACITY = 0.5;
/** A walk shorter than this draws nothing. */
const MIN_WALK = 0.5;

/**
 * Draws an overlay stroke along the mark's walk, from its start to its end, eased in and out over
 * `duration`, with round caps. On a stack it runs the whole walk, across every segment. A walk under
 * 0.5 px (a point) draws nothing, and a run on one finishes at once.
 *
 * The stroke stays, and follows `onChange`, so it keeps to the mark through a transition or a
 * resize. Its end state is the whole stroke, so reduced motion shows what a full run ends with.
 */
export function trace(options: TraceOptions = {}): GeometryEffect {
  checkOptions(options);
  const duration = options.duration ?? DURATION;
  const paint: Paint = { stroke: options.color ?? "mark", width: options.width ?? WIDTH, opacity: options.opacity ?? OPACITY, linecap: "round" };

  /** Draws the stroke up to progress p along the walk, and keeps it on the mark when the mark moves. */
  const stroke = (mark: MarkGeometry, ctx: EffectContext): ((p: number) => void) => {
    let current = mark;
    let progress = 0;
    let path: PathHandle | undefined;
    const draw = (): void => {
      if (!(current.length >= MIN_WALK)) {
        path?.remove();
        path = undefined;
        return;
      }
      // At progress 0 this is a lone moveto, which SVG doesn't stroke, even with round caps.
      const d = current.slice(0, progress);
      if (path) path.update(d);
      else path = ctx.layer.path(d, paint);
    };
    ctx.onChange((next) => {
      current = next;
      draw();
    });
    // Drawn now, so a run stacks the stroke where end() does among the other parts of a combination.
    draw();
    return (p) => {
      progress = p;
      draw();
    };
  };

  return {
    kind: "geometry",
    async run(mark, ctx) {
      if (ctx.signal.aborted) return;
      const show = stroke(mark, ctx);
      // No walk to draw along: the end state at once, so the stroke is whole if the mark grows one.
      if (!(mark.length >= MIN_WALK)) {
        show(1);
        return;
      }
      await ctx.tween({ duration, timing: "effect", ease: easeInOutCubic, update: show }).finished;
    },
    end(mark, ctx) {
      stroke(mark, ctx)(1);
    },
    clear() {}
  };
}

function checkOptions(options: TraceOptions): void {
  const { color, width, opacity, duration } = options;
  if (color !== undefined && (typeof color !== "string" || color === "")) {
    throw new RangeError(`trace: color must be a theme token or a CSS colour, got ${JSON.stringify(color) ?? String(color)}.`);
  }
  if (width !== undefined && !(typeof width === "number" && width >= 0 && Number.isFinite(width))) {
    throw new RangeError(`trace: width must be 0 px or more, got ${String(width)}.`);
  }
  if (opacity !== undefined && !(typeof opacity === "number" && opacity >= 0 && opacity <= 1)) {
    throw new RangeError(`trace: opacity must be from 0 to 1, got ${String(opacity)}.`);
  }
  if (duration !== undefined && !(typeof duration === "number" && duration >= 0 && Number.isFinite(duration))) {
    throw new RangeError(`trace: duration must be 0 ms or more, got ${String(duration)}.`);
  }
}
