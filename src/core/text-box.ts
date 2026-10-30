// The box a piece of text covers, from its width: the charts' labels (src/charts/render/text.ts) and
// effects' text (EffectContext.texts) are boxed the same way. Internal.

import type { TextStyle } from "./contracts/drawing";
import type { Point, Rect } from "./contracts/geometry";

/** The overlay's text size, in px: the theme's `.ec-overlay .ec-text`. */
export const TEXT_SIZE = 12.5;

/** An estimate of the average glyph width, in em, where there's no layout to measure text in. */
export const AVERAGE_WIDTH = 0.6;

/**
 * How far text reaches, as shares of its size: above its baseline (an accented capital's top), below
 * it (a descender's foot), and past its measured width at either side (a W's lean, an f's hook). So a
 * box holds the text's getBBox() in Chrome with Segoe UI, Arial, Georgia, Verdana and Consolas; a
 * Times New Roman "ff" reaches 0.8 px past it.
 */
const ASCENT = 1.05;
const DESCENT = 0.25;
const SIDE = 0.16;

/** The box text `width` px wide covers at `size` px, its baseline's anchor point at `at`, anchored by `anchor` (default "start"). */
export function boxAround(at: Point, anchor: TextStyle["anchor"], width: number, size: number): Rect {
  const start = anchor === "end" ? at.x - width : anchor === "middle" ? at.x - width / 2 : at.x;
  return { x: start - SIDE * size, y: at.y - ASCENT * size, width: width + 2 * SIDE * size, height: (ASCENT + DESCENT) * size };
}

/** The box `content` takes drawn with `style` in the overlay, estimated from its length: where a surface can't measure text. */
export function estimatedBox(content: string, style: TextStyle): Rect {
  return boxAround(style.at, style.anchor, content.length * TEXT_SIZE * AVERAGE_WIDTH, TEXT_SIZE);
}
