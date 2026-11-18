// Text widths for layout (label margins). Measured in the chart's own SVG, so the page's font and the
// chart's CSS apply. Where there's no layout (jsdom, a hidden container), widths are estimated from
// the character count. Where the browser's own length leaves letter and word spacing out, as
// WebKit's does, they're added, so a viewer's spacing (WCAG 1.4.12) is in the layout in Safari too.

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
  /** Forget measured widths: once web fonts have loaded, or when the text changes size (shell/watch.ts). */
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
      if (width > 0 && leavesSpacingOut(svg)) width += spacingIn(probe, text);
    }
    probe.remove();
    // Only real measurements are kept: a hidden chart measures again once it's shown.
    if (!(width > 0)) return text.length * size * AVERAGE_WIDTH;
    cache.set(id, width);
    return width;
  };
  return Object.assign(measure, { clear: () => cache.clear() });
}

/** By document: whether its getComputedTextLength() leaves letter and word spacing out. */
const unspaced = new WeakMap<Document, boolean>();
/** The letter spacing the test text is given, px: far more than any rounding. */
const TEST_SPACING = 8;

/**
 * Whether the browser's getComputedTextLength() leaves letter and word spacing out, as WebKit's does
 * and Chromium's and Firefox's don't (M18 step 5): found by measuring, once a document, not by the
 * browser's name. Two characters are drawn with letter spacing, and where the second ends is compared
 * with the length: further by the spacing between them where the length leaves it out, and the same
 * where it counts it. The spacing compared with is the computed one, in case a viewer's stylesheet
 * overrides the test's. Where nothing can be told (no layout yet), it's asked again.
 */
function leavesSpacingOut(svg: SVGElement): boolean {
  const doc = svg.ownerDocument;
  let found = unspaced.get(doc);
  if (found !== undefined) return found;
  const probe = svgElement("text", { visibility: "hidden", "aria-hidden": "true" }, svg);
  if (typeof probe.getEndPositionOfChar !== "function") found = false;
  else {
    probe.style.setProperty("letter-spacing", `${TEST_SPACING}px`, "important");
    probe.textContent = "00";
    const spacing = px(styleOf(probe)?.letterSpacing);
    const length = probe.getComputedTextLength();
    if (spacing > 0 && length > 0) found = probe.getEndPositionOfChar(1).x - probe.getStartPositionOfChar(0).x - length > spacing / 2;
  }
  probe.remove();
  if (found !== undefined) unspaced.set(doc, found);
  return found ?? false;
}

/**
 * The spacing the browser draws `text` with in `probe`: its computed letter spacing between each two
 * characters, and its word spacing a space. None after the last character, where WebKit draws none,
 * so the width is the text's own box.
 */
function spacingIn(probe: SVGTextElement, text: string): number {
  const style = styleOf(probe);
  return px(style?.letterSpacing) * (Array.from(text).length - 1) + px(style?.wordSpacing) * (text.split(/[  ]/).length - 1);
}

const styleOf = (element: Element): CSSStyleDeclaration | undefined => element.ownerDocument.defaultView?.getComputedStyle(element);
/** A computed length in px; 0 for `normal`. */
const px = (value: string | undefined): number => Number.parseFloat(value ?? "") || 0;
