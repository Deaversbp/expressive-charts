// The drawing API's MarkHandle on elements someone else drew. Every change goes through HostEdits, so
// a reset (or destroy) puts back exactly what the host had, and the host's own attributes are never
// written: the transform is an inline style composed with the element's own transform attribute.

import type { MarkHandle, MarkStyle, Matrix } from "../../core";
import { matrix } from "../../core";
import { mergeFields } from "../../core/merge";
import { maskedHalo, type HaloPart } from "../render/outside";
import { cssColor, type SeriesColors } from "../render/theme";
import type { HostEdits } from "./edits";
import { ownTransform } from "./space";

/** The host's colours for an element, and the property they're from, which emphasis and the hover colour write. */
export interface HostColors extends SeriesColors {
  /** "stroke" when the fill is none, as on a line. */
  readonly paint: "fill" | "stroke";
}

/** One element of a mark, as the style handle needs it. */
export interface HostPart {
  readonly element: Element;
  /** From the element's parent's user space into the marks' common ancestor's, and back. */
  readonly parent: Matrix;
  readonly parentInverse: Matrix | undefined;
  /** The host's colour for the element, which `emphasis`, the hover colour and the "mark" token start from. */
  readonly colors: HostColors | undefined;
  /**
   * The part's outline in the common ancestor's space, for the halo, with an open outline's stroke
   * width; undefined when it's too short to see.
   */
  readonly outline: Omit<HaloPart, "color"> | undefined;
}

export interface HostMarkHandle extends MarkHandle {
  readonly style: MarkStyle;
  /** Applies the current style again, after a refresh (new elements or outlines). */
  repaint(): void;
  /** Gives the mark its strong colour while it's hovered, under `dim`, as our charts do. */
  hot(on: boolean): void;
}

/**
 * - `transform` is in the common ancestor's space. Each element gets an inline CSS transform that
 *   moves it by that much, composed with its own transform attribute, with origin 0 0 in its user space.
 * - `opacity` and `emphasis` are inline styles; emphasis mixes the host's colour (its fill, or its
 *   stroke on a line) toward its strong colour. A hot mark takes the strong one, unless an effect sets emphasis.
 * - `halo` strokes each visible part's outline in the overlay, masked to outside the mark, so it
 *   shows only where it would behind the mark.
 */
export function hostMarkHandle(parts: () => readonly HostPart[], edits: HostEdits, halos: () => SVGGElement | undefined): HostMarkHandle {
  let style: MarkStyle = {};
  let hot = false;
  const halo = maskedHalo();

  const repaint = (): void => {
    const { transform, opacity, emphasis } = style;
    for (const part of parts()) {
      const { element, colors } = part;
      const moved = transform && part.parentInverse ? matrix.multiply(part.parentInverse, transform, part.parent, ownTransform(element)) : undefined;
      edits.style(element, "transform", moved && cssMatrix(moved));
      edits.style(element, "transform-origin", moved && "0 0");
      edits.style(element, "transform-box", moved && "view-box");
      edits.style(element, "opacity", opacity === undefined ? undefined : String(opacity));
      const shade = !colors ? undefined : emphasis !== undefined ? mix(colors, emphasis) : hot ? colors.strong : undefined;
      edits.style(element, "fill", colors?.paint === "fill" ? shade : undefined);
      edits.style(element, "stroke", colors?.paint === "stroke" ? shade : undefined);
      // The effect animates emphasis itself; a host transition on the colour would smear it.
      edits.style(element, "transition", emphasis === undefined || !colors ? undefined : "none");
    }
    paintHalo();
  };

  const paintHalo = (): void => {
    const visible = parts().flatMap((part) => (part.outline === undefined ? [] : [{ ...part.outline, color: part.colors?.color }]));
    halo.paint(halos(), visible, style.halo, style.transform);
  };

  return {
    get style() {
      return style;
    },
    set(next) {
      style = mergeFields(style, next);
      repaint();
    },
    reset() {
      style = {};
      repaint();
    },
    repaint,
    hot(on) {
      if (on === hot) return;
      hot = on;
      repaint();
    }
  };
}

/**
 * The host's colours for an element: its fill, or its stroke when the fill is none (a line). Each is
 * the computed value where there's styling. jsdom computes no presentation attributes (every fill is
 * black and every stroke none), so a computed value that's the property's initial one gives way to
 * the nearest value declared on the element or above it. A gradient or pattern gives no colours.
 *
 * The strong colour is our charts' kind of -strong: the colour stepped toward the text colour, in
 * OKLab so the hue stays, so a hovered mark gets darker in the light theme and lighter in the dark.
 * Our palette's -strong colours sit 20% of the way in light and 29% in dark; a host's colour goes 25%.
 */
export function hostColors(element: Element, root: Element): HostColors | undefined {
  const fill = paintOf(element, root, "fill");
  const paint = fill === NONE ? "stroke" : "fill";
  const color = paint === "fill" ? fill : paintOf(element, root, "stroke");
  if (color === undefined || color === NONE) return undefined;
  return { color, strong: `color-mix(in oklab, ${color}, ${cssColor("text")} ${STRONG})`, paint };
}

/** How far a host's colour steps toward the text colour for its strong colour. */
const STRONG = "25%";

const NONE = "none";

/** A paint property's colour, NONE for no paint (or a transparent one), or undefined when it isn't a colour. */
function paintOf(element: Element, root: Element, property: "fill" | "stroke"): string | undefined {
  let declared: string | undefined;
  for (let node: Element | null = element; node && declared === undefined; node = node === root ? null : node.parentElement) {
    const value = (node as SVGElement).style?.getPropertyValue(property) || node.getAttribute(property);
    if (value) declared = value;
  }
  const computed = kind(element.ownerDocument.defaultView?.getComputedStyle?.(element).getPropertyValue(property));
  const initial = property === "fill" ? computed?.replace(/\s/g, "") === "rgb(0,0,0)" : computed === NONE;
  return computed !== undefined && !(initial && declared !== undefined) ? computed : kind(declared);
}

/**
 * An element's stroke width in its own user units, as drawn: the computed value where there's
 * styling. As for colours, a computed value that's the initial 1 gives way to the nearest width
 * declared on the element or above it, since jsdom computes no presentation attributes. One that
 * can't be read is passed over, as SVG ignores it. Undefined when there's none in px.
 */
export function strokeWidthOf(element: Element, root: Element): number | undefined {
  let declared: number | undefined;
  for (let node: Element | null = element; node && declared === undefined; node = node === root ? null : node.parentElement) {
    declared = pixels((node as SVGElement).style?.getPropertyValue("stroke-width") || node.getAttribute("stroke-width"));
  }
  const computed = pixels(element.ownerDocument.defaultView?.getComputedStyle?.(element).getPropertyValue("stroke-width"));
  return computed !== undefined && !(computed === 1 && declared !== undefined) ? computed : declared;
}

/** A length of 0 or more, in px or with no unit; undefined for anything else (a percentage, inherit). */
function pixels(value: string | null | undefined): number | undefined {
  // One way to match any digits, so a long run of them followed by junk is refused at once.
  const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(?:px\s*)?$/i.exec(value ?? "");
  const number = match ? Number(match[1]) : NaN;
  return number >= 0 && Number.isFinite(number) ? number : undefined;
}

/** NONE for no paint or a transparent one, the colour as given, or undefined for anything else (a url(), inherit). */
function kind(value: string | null | undefined): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v || v === "inherit" || v.startsWith("url(")) return undefined;
  if (v === NONE || v === "transparent" || /^rgba\((?:[^,]+,){3}\s*0(?:\.0*)?\s*\)$/.test(v)) return NONE;
  return value!.trim();
}

function mix(colors: SeriesColors, emphasis: number): string {
  const amount = Math.min(1, Math.max(0, emphasis));
  if (amount === 0) return colors.color;
  if (amount === 1) return colors.strong;
  return `color-mix(in srgb, ${colors.strong} ${Math.round(amount * 1000) / 10}%, ${colors.color})`;
}

/** CSS needs commas in matrix(); the SVG attribute doesn't mind them. */
function cssMatrix(m: Matrix): string {
  return `matrix(${m.map((v, i) => (i < 4 ? Math.round(v * 1e6) / 1e6 : Math.round(v * 1000) / 1000)).join(", ")})`;
}
