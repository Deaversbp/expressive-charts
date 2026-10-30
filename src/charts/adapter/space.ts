// Coordinates in someone else's SVG. Matrices between elements' user spaces come from the browser's
// CTMs where there's layout, and from the transform attributes where there isn't (jsdom, a chart
// that isn't rendered yet).

import type { Matrix, Point, Rect } from "../../core";
import { matrix } from "../../core";
import { invert, parseTransform } from "../../core/geometry";

/** An element's screen CTM as a matrix, or undefined where there's no layout. */
export type ScreenMatrix = (element: Element) => Matrix | undefined;

/**
 * Screen CTMs remembered per element, for one read while nothing changes: every mark of a read asks
 * for the common ancestor's and its parent's, which most marks share.
 */
export function screenMatrices(): ScreenMatrix {
  const known = new Map<Element, Matrix | undefined>();
  return (element) => {
    if (!known.has(element)) known.set(element, screenMatrix(element));
    return known.get(element);
  };
}

/**
 * Maps points in `inner`'s user space (after its own transform) into `outer`'s. Both are inside
 * `root`. Without CTMs, nested `<svg>` viewports and CSS transforms aren't seen.
 */
export function between(outer: Element, inner: Element, root: Element, screen: ScreenMatrix = screenMatrix): Matrix {
  const a = screen(outer);
  const b = a && screen(inner);
  if (a && b) return matrix.multiply(invert(a), b);
  return matrix.multiply(invert(fromRoot(outer, root)), fromRoot(inner, root));
}

/** The element's own transform attribute. */
export function ownTransform(element: Element): Matrix {
  return parseTransform(element.getAttribute("transform") ?? "");
}

/**
 * Whether the transform keeps rectangles upright: scales, flips and quarter turns, with any
 * translation. Only then is the box a rect covers exactly the rect.
 */
export function axisAligned(m: Matrix): boolean {
  const [a, b, c, d] = m;
  const tiny = 1e-9 * Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  return (Math.abs(b) <= tiny && Math.abs(c) <= tiny) || (Math.abs(a) <= tiny && Math.abs(d) <= tiny);
}

/**
 * Whether the transform keeps circles round: an even scale, turns and flips, with any translation.
 * Its columns are the same length and at right angles, to within a ten-thousandth of their length,
 * so the rounding in a browser's CTMs doesn't make a circle an ellipse.
 */
export function keepsCircles(m: Matrix): boolean {
  const [a, b, c, d] = m;
  const u = a * a + b * b;
  const v = c * c + d * d;
  const tiny = 1e-4 * Math.max(u, v);
  return Math.abs(u - v) <= tiny && Math.abs(a * c + b * d) <= tiny;
}

/** How much the transform scales lengths: exactly for an even scale, and on average for an uneven one. */
export function scaleOf(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
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
  const attribute = attributesOf(element);
  const read = (name: "x" | "y" | "width" | "height"): number => {
    const value = Number.parseFloat(attribute(name) ?? "");
    return Number.isFinite(value) ? value : 0;
  };
  return { x: read("x"), y: read("y"), width: Math.max(0, read("width")), height: Math.max(0, read("height")) };
}

/**
 * Reads an element's attributes for its geometry. A length is as the browser resolves it
 * (percentages, units), and anything else, or a length where there's no layout (jsdom), as written.
 * One that isn't there is null, though a browser gives it a length of 0: a <rect>'s missing rx takes
 * its ry.
 */
export function attributesOf(element: Element): (name: string) => string | null {
  return (name) => {
    if (!element.hasAttribute(name)) return null;
    const animated = (element as unknown as Record<string, { baseVal?: { value?: unknown } } | undefined>)[name];
    return typeof animated?.baseVal?.value === "number" ? String(animated.baseVal.value) : element.getAttribute(name);
  };
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
