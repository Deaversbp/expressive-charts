// Where an adapter's marks come from: a selector, elements, or a D3-style selection. And the two
// elements every mark's coordinates hang off: the root <svg> and the marks' nearest common ancestor.

import type { MarkSource } from "./types";

export interface SourceMarks<D> {
  readonly elements: readonly Element[];
  /** A selection's data(), when it lines up with its nodes(). */
  readonly data: readonly D[] | undefined;
}

export function readSource<D>(source: MarkSource<D>): SourceMarks<D> {
  if (typeof source === "string") {
    if (typeof document === "undefined") throw new TypeError("expressive: a selector needs a document.");
    return { elements: Array.from(document.querySelectorAll(source)), data: undefined };
  }
  if (isElement(source)) return { elements: [source], data: undefined };
  if (isSelection<D>(source)) {
    const elements = Array.from(source.nodes());
    const data = Array.from(source.data());
    return { elements, data: data.length === elements.length ? data : undefined };
  }
  if (source !== null && typeof source === "object" && typeof (source as ArrayLike<Element>).length === "number") {
    return { elements: Array.from(source as ArrayLike<Element>), data: undefined };
  }
  throw new TypeError("expressive needs marks: a selector, an element, a list of elements or a D3 selection.");
}

/** A selection's rows by element, when its data() lines up with its nodes(); otherwise undefined, and each element's own `__data__` is its row. */
export function boundRows<D>(source: MarkSource<D>): Map<Element, D> | undefined {
  if (!isSelection<D>(source)) return undefined;
  const { elements, data } = readSource(source);
  return data && new Map(elements.map((element, i) => [element, data[i]!]));
}

/** The outermost <svg> around the elements, which must all share it. */
export function rootOf(elements: readonly Element[]): SVGSVGElement {
  let root: SVGSVGElement | undefined;
  for (const element of elements) {
    if (!isElement(element)) throw new TypeError(`expressive: marks must be elements, got ${String(element)}.`);
    let svg = (element as SVGElement).ownerSVGElement ?? null;
    if (!svg) {
      const tag = element.localName;
      throw new TypeError(
        tag === "svg"
          ? "expressive: got an <svg>, not its marks. Pass the marks, for example svg.querySelectorAll(\"rect\")."
          : `expressive: marks must be SVG elements inside an <svg>, got <${tag}>.`
      );
    }
    while (svg.ownerSVGElement) svg = svg.ownerSVGElement;
    if (root && svg !== root) throw new TypeError("expressive: all marks must be in the same <svg>.");
    root = svg;
  }
  if (!root) throw new TypeError("expressive: no marks.");
  return root;
}

/** The deepest element containing every mark (a lone mark's parent). Geometry is in its coordinates. */
export function commonAncestor(elements: readonly Element[], root: Element): Element {
  let ancestor = elements[0]!.parentElement ?? root;
  while (ancestor !== root && !elements.every((element) => element !== ancestor && ancestor.contains(element))) {
    ancestor = ancestor.parentElement ?? root;
  }
  return ancestor;
}

function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && (value as Node).nodeType === 1;
}

function isSelection<D>(value: unknown): value is { nodes(): Element[]; data(): D[] } {
  return typeof value === "object" && value !== null && typeof (value as { nodes?: unknown }).nodes === "function" && typeof (value as { data?: unknown }).data === "function";
}
