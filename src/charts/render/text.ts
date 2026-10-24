// Text widths for layout (label margins). Measured in the chart's own SVG, so the page's font and the
// chart's CSS apply. Where there's no layout (jsdom, a hidden container), widths are estimated from
// the character count.

import type { Rect } from "../../core";
import { setAttributes, svgElement } from "./svg";

/** Where a piece of text goes: its baseline's anchor point, and how it's anchored there. */
export interface TextPlacement {
  readonly x: number;
  readonly y: number;
  readonly anchor: "start" | "middle" | "end";
  readonly text: string;
}

/**
 * How far text reaches, as shares of its size: above its baseline (an accented capital's top), below
 * it (a descender's foot), and past its measured width at either side (a W's lean, an f's hook). So a
 * box holds the text's getBBox() in Chrome with Segoe UI, Arial, Georgia, Verdana and Consolas; a
 * Times New Roman "ff" reaches 0.8 px past it.
 */
const ASCENT = 1.05;
const DESCENT = 0.25;
const SIDE = 0.16;

/**
 * The box `placement`'s text covers, drawn with `className` at `size` px: a mark's `labelBounds`.
 * Chart text has tabular digits, so it's measured with its digits as 0s, and text that counts
 * through values while a change plays is measured once for each shape.
 */
export function textBox(placement: TextPlacement, measure: Measure, className: string, size: number): Rect {
  const width = measure(placement.text.replace(/\d/g, "0"), className, size);
  const start = placement.anchor === "start" ? placement.x : placement.anchor === "end" ? placement.x - width : placement.x - width / 2;
  return { x: start - SIDE * size, y: placement.y - ASCENT * size, width: width + 2 * SIDE * size, height: (ASCENT + DESCENT) * size };
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

/** An estimate of the average glyph width, in em. */
const AVERAGE_WIDTH = 0.6;

export function textMeasure(svg: SVGSVGElement): TextMeasure {
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
