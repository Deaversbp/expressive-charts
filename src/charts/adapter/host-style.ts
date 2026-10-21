// The drawing API's MarkHandle on elements someone else drew. Every change goes through HostEdits, so
// a reset (or destroy) puts back exactly what the host had, and the host's own attributes are never
// written: the transform is an inline style composed with the element's own transform attribute.

import type { MarkHandle, MarkStyle, Matrix } from "../../core";
import { matrix } from "../../core";
import { mergeFields } from "../../core/merge";
import { setAttributes, setStyles, svgElement, transformAttribute } from "../render/svg";
import { cssColor, type SeriesColors } from "../render/theme";
import type { HostEdits } from "./edits";
import { ownTransform } from "./space";

/** One element of a mark, as the style handle needs it. */
export interface HostPart {
  readonly element: Element;
  /** From the element's parent's user space into the marks' common ancestor's, and back. */
  readonly parent: Matrix;
  readonly parentInverse: Matrix | undefined;
  /** The host's colour for the element, which `emphasis` and the "mark" token start from. */
  readonly colors: SeriesColors | undefined;
  /** The part's outline in the common ancestor's space, for the halo; undefined when it's too short to see. */
  readonly outline: string | undefined;
}

export interface HostMarkHandle extends MarkHandle {
  readonly style: MarkStyle;
  /** Applies the current style again, after a refresh (new elements or outlines). */
  repaint(): void;
}

let maskIds = 0;

/**
 * - `transform` is in the common ancestor's space. Each element gets an inline CSS transform that
 *   moves it by that much, composed with its own transform attribute, with origin 0 0 in its user space.
 * - `opacity` and `emphasis` are inline styles; emphasis mixes the host's colour toward a darker one.
 * - `halo` strokes each visible part's outline in the overlay, masked to outside the mark, so it
 *   shows only where it would behind the mark.
 */
export function hostMarkHandle(parts: () => readonly HostPart[], edits: HostEdits, halos: () => SVGGElement | undefined): HostMarkHandle {
  let style: MarkStyle = {};
  let halo: SVGGElement | undefined;

  const repaint = (): void => {
    const { transform, opacity, emphasis } = style;
    for (const part of parts()) {
      const { element } = part;
      const moved = transform && part.parentInverse ? matrix.multiply(part.parentInverse, transform, part.parent, ownTransform(element)) : undefined;
      edits.style(element, "transform", moved && cssMatrix(moved));
      edits.style(element, "transform-origin", moved && "0 0");
      edits.style(element, "transform-box", moved && "view-box");
      edits.style(element, "opacity", opacity === undefined ? undefined : String(opacity));
      edits.style(element, "fill", emphasis === undefined || !part.colors ? undefined : mix(part.colors, emphasis));
      // The effect animates emphasis itself; a host transition on fill would smear it.
      edits.style(element, "transition", emphasis === undefined || !part.colors ? undefined : "none");
    }
    paintHalo();
  };

  const paintHalo = (): void => {
    const spec = style.halo;
    const container = halos();
    const visible = parts().filter((part) => part.outline !== undefined);
    if (!spec || !container || visible.length === 0) {
      halo?.remove();
      halo = undefined;
      return;
    }
    if (!halo || halo.parentNode !== container) {
      halo?.remove();
      halo = svgElement("g", { class: "ec-halo" }, container);
    }
    halo.textContent = "";
    const id = `ec-halo-mask-${++maskIds}`;
    const reach = spec.width;
    const mask = svgElement("mask", { id, maskUnits: "userSpaceOnUse", x: -1e5, y: -1e5, width: 2e5, height: 2e5 }, halo);
    svgElement("rect", { x: -1e5, y: -1e5, width: 2e5, height: 2e5, fill: "white" }, mask);
    for (const part of visible) svgElement("path", { d: part.outline, fill: "black" }, mask);
    setAttributes(halo, { transform: style.transform && transformAttribute(style.transform) });
    for (const part of visible) {
      const path = svgElement("path", { d: part.outline, "stroke-width": reach, "stroke-opacity": spec.opacity, "stroke-linejoin": "round", mask: `url(#${id})` }, halo);
      setStyles(path, { fill: "none", stroke: spec.color === undefined ? (part.colors?.color ?? cssColor("mark")) : cssColor(spec.color) });
    }
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
    repaint
  };
}

/**
 * The host's fill for an element: the computed fill where there's styling. jsdom computes no
 * presentation attributes (every fill is black), so a black computed fill gives way to the nearest
 * fill declared on the element or above it.
 */
export function hostColors(element: Element, root: Element): SeriesColors | undefined {
  const usable = (value: string | null | undefined): value is string => {
    const v = value?.trim().toLowerCase();
    return !!v && v !== "none" && v !== "inherit" && !v.startsWith("url(");
  };
  let declared: string | undefined;
  for (let node: Element | null = element; node && declared === undefined; node = node === root ? null : node.parentElement) {
    const value = (node as SVGElement).style?.getPropertyValue("fill") || node.getAttribute("fill");
    if (value) declared = value;
  }
  const computed = element.ownerDocument.defaultView?.getComputedStyle?.(element).fill;
  const black = computed?.replace(/\s/g, "") === "rgb(0,0,0)";
  const fill = usable(computed) && !(black && declared !== undefined) ? computed : declared;
  if (!usable(fill)) return undefined;
  const color = fill.trim();
  return { color, strong: `color-mix(in srgb, ${color} 75%, black)` };
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
