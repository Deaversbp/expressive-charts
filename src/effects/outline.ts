// outline: the mark's outline, drawn in the overlay at once, for a hover on a closed shape (a map's
// country, a treemap's tile), where the effects that draw along a mark have no direction to follow.
// It reads only the mark's outline, so it runs on any mark, and it leaves the mark itself untouched.

import type { Color, GeometryEffect } from "../core";

export interface OutlineOptions {
  /** A theme token or any CSS colour. Default "text". */
  readonly color?: Color;
  /** The stroke's width, px. Default 2. */
  readonly width?: number;
}

const COLOR = "text";
const WIDTH = 2;

/**
 * Strokes the mark's outline in the overlay, unfilled, in `color` at `width`. There's no tween: a
 * run draws what `end` draws, at once, so nothing moves or fades under the pointer, and reduced
 * motion and Off show the same picture. On an open shape, a line, it strokes the line.
 *
 * The stroke follows `onChange`, so it keeps to a mark that moves, and it's taken away when its run
 * is cleared: on leave in the hover slot, and with the mark in `decorate`, where it stays.
 */
export function outline(options: OutlineOptions = {}): GeometryEffect {
  checkOptions(options);
  const paint = { stroke: options.color ?? COLOR, width: options.width ?? WIDTH };
  const draw: GeometryEffect["end"] = (mark, ctx) => {
    const path = ctx.layer.path(mark.outline.d, paint);
    ctx.onChange((next) => path.update(next.outline.d));
  };
  return {
    kind: "geometry",
    async run(mark, ctx) {
      if (!ctx.signal.aborted) draw(mark, ctx);
    },
    end: draw,
    clear() {}
  };
}

function checkOptions(options: OutlineOptions): void {
  const { color, width } = options;
  if (color !== undefined && (typeof color !== "string" || color === "")) {
    throw new RangeError(`outline: color must be a theme token or a CSS colour, got ${JSON.stringify(color) ?? String(color)}.`);
  }
  if (width !== undefined && !(typeof width === "number" && width > 0 && Number.isFinite(width))) {
    throw new RangeError(`outline: width must be more than 0 px, got ${String(width)}.`);
  }
}
