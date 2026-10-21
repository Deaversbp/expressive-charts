// Text widths for layout (label margins). Measured in the chart's own SVG, so the page's font and the
// chart's CSS apply. Where there's no layout (jsdom, a hidden container), widths are estimated from
// the character count.

import { svgElement } from "./svg";

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
