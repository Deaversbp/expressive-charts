// Outlines with canonical sampling, so morph can match corners and winding between any two marks.

import type { Outline, Point } from "../contracts/geometry";
import { pathData } from "./path-data";
import type { PathSegment } from "./segment";
import { createWalk, type Walk } from "./walk";

/** The four sides of a closed outline, in order. Each must start where the one before ends. */
export type Sides = readonly [
  left: readonly PathSegment[],
  end: readonly PathSegment[],
  right: readonly PathSegment[],
  start: readonly PathSegment[]
];

/**
 * A closed outline from its sides: left (the up side, walked in the direction of travel), end,
 * right (walked back) and start. That order runs clockwise on screen from the start-left corner.
 */
export function closedOutline(sides: Sides): Outline {
  const walks = sides.map((side) => createWalk(side));
  return {
    d: pathData(sides.flat(), true),
    closed: true,
    sample(n) {
      checkCount(n, 4);
      const perSide = n / 4;
      const points: Point[] = [];
      for (const walk of walks) {
        for (let j = 0; j < perSide; j++) points.push(walk.point(j / perSide));
      }
      return points;
    }
  };
}

/** An open outline: the stroke along a walk, less its gaps. Its samples run along the whole walk, gaps and all. */
export function openOutline(walk: Walk): Outline {
  return {
    d: walk.d,
    closed: false,
    sample(n) {
      checkCount(n, 1);
      if (n === 1) return [walk.start];
      const points: Point[] = [];
      for (let j = 0; j < n; j++) points.push(walk.point(j / (n - 1)));
      return points;
    }
  };
}

function checkCount(n: number, multiple: number): void {
  if (!Number.isInteger(n) || n < 0 || n % multiple !== 0) {
    const what = multiple === 1 ? "a whole number ≥ 0" : `a whole multiple of ${multiple}`;
    throw new RangeError(`outline.sample(n): n must be ${what}, got ${n}.`);
  }
}
