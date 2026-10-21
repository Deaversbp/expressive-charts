// Coordinates in someone else's SVG. Matrices between elements' user spaces come from the browser's
// CTMs where there's layout, and from the transform attributes where there isn't (jsdom, a chart
// that isn't rendered yet).

import type { Matrix, Point, Rect } from "../../core";
import { matrix } from "../../core";
import { invert, parseTransform } from "../../core/geometry";

/**
 * Maps points in `inner`'s user space (after its own transform) into `outer`'s. Both are inside
 * `root`. Without CTMs, nested `<svg>` viewports and CSS transforms aren't seen.
 */
export function between(outer: Element, inner: Element, root: Element): Matrix {
  const a = screenMatrix(outer);
  const b = a && screenMatrix(inner);
  if (a && b) return matrix.multiply(invert(a), b);
  return matrix.multiply(invert(fromRoot(outer, root)), fromRoot(inner, root));
}

/** The element's own transform attribute. */
export function ownTransform(element: Element): Matrix {
  return parseTransform(element.getAttribute("transform") ?? "");
}

/** The box a transformed rectangle covers, rounded to 0.001 px like path data. */
export function boxIn(m: Matrix, rect: Rect): Rect {
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height }
  ].map((corner) => matrix.apply(m, corner));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = round(Math.min(...xs));
  const y = round(Math.min(...ys));
  return { x, y, width: round(round(Math.max(...xs)) - x), height: round(round(Math.max(...ys)) - y) };
}

/** A `<rect>`'s rectangle in its own user space. A negative size draws nothing, so it counts as 0. */
export function rectOf(element: Element): Rect {
  const read = (name: "x" | "y" | "width" | "height"): number => {
    // Browsers resolve percentages and CSS geometry; jsdom has only the attribute.
    const animated = (element as unknown as Record<string, { baseVal?: { value?: unknown } } | undefined>)[name];
    const value = typeof animated?.baseVal?.value === "number" ? animated.baseVal.value : Number.parseFloat(element.getAttribute(name) ?? "");
    return Number.isFinite(value) ? value : 0;
  };
  return { x: read("x"), y: read("y"), width: Math.max(0, read("width")), height: Math.max(0, read("height")) };
}

function screenMatrix(element: Element): Matrix | undefined {
  const ctm = typeof (element as SVGGraphicsElement).getScreenCTM === "function" ? (element as SVGGraphicsElement).getScreenCTM() : null;
  return ctm ? [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f] : undefined;
}

/** The element's transform attributes, its own included, down from `root` (whose own is left out). */
function fromRoot(element: Element, root: Element): Matrix {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  for (let node: Element | null = element; node && node !== root; node = node.parentElement) m = matrix.multiply(ownTransform(node), m);
  return m;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
