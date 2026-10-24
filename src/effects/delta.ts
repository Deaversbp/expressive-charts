// delta: the change since the last update ("+2"), past the end of the mark and clear of its own labels,
// for the update slot (`on: { update: delta() }`). A data effect: it compares the mark's value with its
// value before the update, and draws the change as text that rises into place and stays.

import type { Color, DataEffect, MarkData } from "../core";
import { caption } from "./caption";

export interface DeltaOptions<D = unknown> {
  /** The mark's value. Default: its last sample's, so a bar's total, a line's value at its revealed end, a slice's share. */
  readonly value?: (data: MarkData<D>) => number;
  /** Words the change. Default: the page's locale, with its sign and at most two decimals ("+2", "-0.3"). */
  readonly format?: (change: number) => string;
  /** A theme token or any CSS colour. Default "text", never the series' colour. */
  readonly color?: Color;
}

/** Base duration of the rise, with effect timing. */
const DURATION = 400;
/** A change this small, relative to the values, is float noise (0.1 + 0.2 against 0.3), not a change. */
const TIE = 1e-9;

const lastSample = (data: MarkData<unknown>): number => {
  const { samples } = data;
  return samples[samples.length - 1]?.value ?? Number.NaN;
};

let wording: Intl.NumberFormat | undefined;
const signed = (change: number): string => {
  wording ??= new Intl.NumberFormat(undefined, { signDisplay: "always", maximumFractionDigits: 2 });
  return wording.format(change);
};

/**
 * The change since the last update, `value(data) − value(data.previous)`, as text past the end of the
 * mark: 10 px past the end of its walk, or 6 px past the farthest of its own labels its heading meets.
 * It rises 8 px into place and fades in over 400 ms base, then stays until the next update clears it,
 * following the mark as it moves. Its end state is the text in place, so reduced motion shows the
 * change. With no `previous`, or no change, it draws nothing.
 *
 * The text is in the overlay, which screen readers don't read: a page that relies on it says the same
 * in its table or its announcement.
 */
export function delta<D = unknown>(options: DeltaOptions<D> = {}): DataEffect<D> {
  checkOptions(options);
  const value = options.value ?? lastSample;
  const format = options.format ?? signed;
  const color = options.color ?? "text";

  /** The change in words, or undefined for none. */
  const words = (data: MarkData<D>): string | undefined => {
    if (!data.previous) return undefined;
    const now = value(data);
    const before = value(data.previous);
    const change = now - before;
    if (!Number.isFinite(change) || Math.abs(change) <= TIE * Math.max(Math.abs(now), Math.abs(before))) return undefined;
    return format(change);
  };

  return {
    kind: "data",
    run: async (mark, data, ctx) => {
      if (ctx.signal.aborted) return;
      // Worked out once: the change is this update's, wherever the mark moves after.
      const text = words(data);
      if (text === undefined || text === "") return;
      const show = caption(mark, data, ctx, color, () => text);
      await ctx.tween({ duration: DURATION, timing: "effect", update: show }).finished;
    },
    end: (mark, data, ctx) => {
      const text = words(data);
      if (text !== undefined && text !== "") caption(mark, data, ctx, color, () => text)(1);
    },
    clear() {}
  };
}

function checkOptions<D>(options: DeltaOptions<D>): void {
  const { value, format, color } = options;
  if (value !== undefined && typeof value !== "function") throw new TypeError(`delta: value must be a function that reads the mark's value from its data, got ${typeof value}.`);
  if (format !== undefined && typeof format !== "function") throw new TypeError(`delta: format must be a function that words the change, got ${typeof format}.`);
  if (color !== undefined && (typeof color !== "string" || color === "")) {
    throw new RangeError(`delta: color must be a theme token or a CSS colour, got ${JSON.stringify(color) ?? String(color)}.`);
  }
}
