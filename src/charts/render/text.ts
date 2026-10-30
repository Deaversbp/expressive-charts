// Text widths for layout (label margins). Measured in the chart's own SVG, so the page's font and the
// chart's CSS apply. Where there's no layout (jsdom, a hidden container), widths are estimated from
// the character count.

import type { Rect } from "../../core";
import { AVERAGE_WIDTH, boxAround } from "../../core/text-box";
import { setAttributes, svgElement } from "./svg";

/** Where a piece of text goes: its baseline's anchor point, and how it's anchored there. */
export interface TextPlacement {
  readonly x: number;
  readonly y: number;
  readonly anchor: "start" | "middle" | "end";
  readonly text: string;
}

/**
 * The box `placement`'s text covers, drawn with `className` at `size` px: a mark's `labelBounds`, or
 * an effect's text (`EffectContext.texts`). Chart text has tabular digits, so it's measured with its
 * digits as 0s, and text that counts through values while a change plays is measured once for each
 * shape. How far past its width and baseline the box reaches is in src/core/text-box.ts.
 */
export function textBox(placement: TextPlacement, measure: Measure, className: string, size: number): Rect {
  return boxAround(placement, placement.anchor, measure(placement.text.replace(/\d/g, "0"), className, size), size);
}

type Measure = (text: string, className: string, size: number) => number;

/** Moves a <text> to `placement` and sets its text, when it changed. */
export function placeText(element: SVGTextElement, placement: TextPlacement): void {
  setAttributes(element, { x: placement.x, y: placement.y, "text-anchor": placement.anchor });
  if (element.textContent !== placement.text) element.textContent = placement.text;
}

export interface TextMeasure {
  /** Width in px of `text` drawn with `className` at `size` px (the size is only used for estimates). */
  (text: string, className: string, size: number): number;
  /** Forget measured widths, for example once web fonts have loaded. */
  clear(): void;
}

/** Measures text drawn in `svg`, or in a group of it such as the overlay, so the CSS that applies there applies. */
export function textMeasure(svg: SVGElement): TextMeasure {
  const cache = new Map<string, number>();
  const measure = (text: string, className: string, size: number): number => {
    if (text === "") return 0;
    const id = `${className}\n${size}\n${text}`;
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    let width = 0;
    const probe = svgElement("text", { class: className, visibility: "hidden", "aria-hidden": "true" }, svg);
    if (typeof probe.getComputedTextLength === "function" && svg.isConnected) {
      probe.textContent = text;
      width = probe.getComputedTextLength();
    }
    probe.remove();
    // Only real measurements are kept: a hidden chart measures again once it's shown.
    if (!(width > 0)) return text.length * size * AVERAGE_WIDTH;
    cache.set(id, width);
    return width;
  };
  return Object.assign(measure, { clear: () => cache.clear() });
}
