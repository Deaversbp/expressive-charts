// Small helpers for building SVG. Nothing here runs at import time, so the package still loads in Node.

import type { Matrix } from "../../core";
import { formatNumber } from "../../core/geometry";

export const SVG_NS = "http://www.w3.org/2000/svg";

export type Attributes = Readonly<Record<string, string | number | undefined>>;

/** Creates an SVG element in `parent`'s document (or the global one), sets its attributes and appends it to `parent` if given. */
export function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Attributes = {}, parent?: Element): SVGElementTagNameMap[K] {
  const doc = parent?.ownerDocument ?? document;
  const element = doc.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  setAttributes(element, attributes);
  parent?.appendChild(element);
  return element;
}

/** Sets attributes; a value of undefined removes the attribute. Numbers are rounded to 0.001. */
export function setAttributes(element: Element, attributes: Attributes): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) element.removeAttribute(name);
    else element.setAttribute(name, typeof value === "number" ? formatNumber(value) : value);
  }
}

/** Sets CSS properties through the CSSOM (allowed under a strict CSP); undefined removes one. */
export function setStyles(element: SVGElement, styles: Readonly<Record<string, string | undefined>>): void {
  for (const [name, value] of Object.entries(styles)) {
    if (value === undefined) element.style.removeProperty(name);
    else element.style.setProperty(name, value);
  }
}

/** A chart's <svg> size and viewBox, in px. */
export function sizeAttributes({ width, height }: { readonly width: number; readonly height: number }): Record<string, string | number> {
  return { width, height, viewBox: `0 0 ${formatNumber(width)} ${formatNumber(height)}` };
}

/**
 * A Matrix as an SVG transform attribute. The linear part keeps 6 decimals, so a small rotation of a
 * long bar stays exact at its far end; the translation is rounded to 0.001 px like path data.
 */
export function transformAttribute(m: Matrix): string {
  const [a, b, c, d, e, f] = m;
  return `matrix(${[a, b, c, d].map(linear).join(" ")} ${formatNumber(e)} ${formatNumber(f)})`;
}

function linear(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? "0" : String(rounded);
}
