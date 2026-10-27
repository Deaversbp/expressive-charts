// Transform helpers for effect authors: matrix and offset are public (docs/effects-guide.md).

import type { Matrix } from "../contracts/drawing";
import type { Point } from "../contracts/geometry";

function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

/** Positive radians turn clockwise on screen, like SVG's rotate(). */
function rotate(radians: number, about?: Point): Matrix {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return around([cos, sin, -sin, cos, 0, 0], about);
}

function scale(sx: number, sy: number = sx, about?: Point): Matrix {
  return around([sx, 0, 0, sy, 0, 0], about);
}

/** Composes like an SVG transform list: multiply(a, b) applies b first, then a. No arguments gives the identity. */
function multiply(...matrices: Matrix[]): Matrix {
  let result: Matrix = [1, 0, 0, 1, 0, 0];
  for (const m of matrices) result = product(result, m);
  return result;
}

/** Where the transform takes a point. */
function apply(m: Matrix, point: Point): Point {
  const [a, b, c, d, e, f] = m;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

function product(l: Matrix, r: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = l;
  const [a2, b2, c2, d2, e2, f2] = r;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}

/** A linear transform (no translation) moved so it keeps `about` fixed. */
function around(m: Matrix, about: Point | undefined): Matrix {
  if (!about) return m;
  const [a, b, c, d] = m;
  return [a, b, c, d, about.x - a * about.x - c * about.y, about.y - b * about.x - d * about.y];
}

/** Builds and applies 2D transforms in SVG order, for `mark.set({ transform })` and `IconHandle.place()`. */
export const matrix: {
  translate: typeof translate;
  rotate: typeof rotate;
  scale: typeof scale;
  multiply: typeof multiply;
  apply: typeof apply;
} = { translate, rotate, scale, multiply, apply };

// Internal: iconFromSvg and the adapter read SVG transforms with these.

/** The inverse transform. A singular matrix (it squashes everything onto a line) throws a RangeError. */
export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new RangeError("This transform can't be inverted: it has no area.");
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** An SVG transform list, as in the transform attribute. An unknown or malformed function is skipped. */
export function parseTransform(source: string): Matrix {
  const parts: Matrix[] = [];
  for (const [, name, rawArgs = ""] of source.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const args = rawArgs.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (!args.every(Number.isFinite)) continue;
    const [a = 0, b, c, d = 0, e = 0, f = 0] = args;
    const radians = (degrees: number): number => (degrees * Math.PI) / 180;
    switch (name) {
      case "matrix":
        if (args.length === 6) parts.push([a, b!, c!, d, e, f]);
        break;
      case "translate":
        parts.push(translate(a, b ?? 0));
        break;
      case "scale":
        parts.push(scale(a, b ?? a));
        break;
      case "rotate":
        parts.push(rotate(radians(a), b !== undefined && c !== undefined ? { x: b, y: c } : undefined));
        break;
      case "skewX":
        parts.push([1, 0, Math.tan(radians(a)), 1, 0, 0]);
        break;
      case "skewY":
        parts.push([1, Math.tan(radians(a)), 0, 1, 0, 0]);
        break;
    }
  }
  return multiply(...parts);
}

/** A point `distance` px from `point` in direction `angle` (screen radians). */
export function offset(point: Point, angle: number, distance: number): Point {
  return { x: point.x + distance * Math.cos(angle), y: point.y + distance * Math.sin(angle) };
}
