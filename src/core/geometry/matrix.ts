// Transform helpers for effect authors (experimental until M3).

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

/** @experimental */
export const matrix = { translate, rotate, scale, multiply, apply };

/** @experimental A point `distance` px from `point` in direction `angle` (screen radians). */
export function offset(point: Point, angle: number, distance: number): Point {
  return { x: point.x + distance * Math.cos(angle), y: point.y + distance * Math.sin(angle) };
}
