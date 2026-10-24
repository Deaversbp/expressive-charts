// label: text worked out from the mark's own data, past the end of the mark and clear of its own
// labels, usually for the decorate slot: a slope's change from first to last, a step's signed value, a
// field such as `vsLastMonth`. A data effect: it reads the mark's data, and words it again on every change.

import type { Color, DataEffect, MarkData, MarkGeometry } from "../core";
import { caption } from "./caption";

export interface LabelOptions {
  /** A theme token or any CSS colour. Default "text", never the series' colour. */
  readonly color?: Color;
}

/** Base duration of the rise, with effect timing, as delta's. */
const DURATION = 400;

/**
 * Text from `text(data, mark)` past the end of the mark: 10 px past the end of its walk, or 6 px
 * past the farthest of its own labels its heading meets. `text` returns the words, or undefined or
 * "" for none. It's typed by the rows it reads, so a label written for one kind of row is a type
 * error on a chart of another.
 *
 * It rises 8 px into place and fades in over 400 ms base, as delta does, then follows every change,
 * its text worked out again from the new data. Its end state is the text in place. The text is in
 * the overlay, which screen readers don't read: a page that relies on it says the same in its table
 * or its announcement.
 */
export function label<D = unknown>(text: (data: MarkData<D>, mark: MarkGeometry) => string | undefined, options: LabelOptions = {}): DataEffect<D> {
  if (typeof text !== "function") throw new TypeError(`label needs a function that returns the text from the mark's data, got ${typeof text}.`);
  const { color = "text" } = options;
  if (typeof color !== "string" || color === "") throw new RangeError(`label: color must be a theme token or a CSS colour, got ${JSON.stringify(color) ?? String(color)}.`);
  const words = (mark: MarkGeometry, data: MarkData<D>): string | undefined => {
    const said: unknown = text(data, mark);
    return said === undefined || said === null ? undefined : String(said);
  };

  return {
    kind: "data",
    run: async (mark, data, ctx) => {
      if (ctx.signal.aborted) return;
      const show = caption(mark, data, ctx, color, words);
      await ctx.tween({ duration: DURATION, timing: "effect", update: show }).finished;
    },
    end: (mark, data, ctx) => caption(mark, data, ctx, color, words)(1),
    clear() {}
  };
}
