// Outlines with canonical sampling, so morph can match corners and winding between any two marks.

import type { Outline, Point } from "../contracts/geometry";
import { pathData } from "./path-data";
import { arc, line, pointOn, TAU, type PathSegment } from "./segment";
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

/**
 * A closed outline round loops of connected segments, each a subpath, holes too. It's sampled round
 * the longest loop, clockwise on screen from its upper left (the point with the least x + y, the
 * higher of two), in four quarters of equal length, so a circle samples as a point's outline does.
 * Its path data starts there too: the longest loop first, from that point. If the longest runs
 * anticlockwise, every loop is written the other way round, which fills the same.
 */
export function loopOutline(loops: readonly (readonly PathSegment[])[]): Outline {
  const lengths = loops.map((loop) => loop.reduce((sum, segment) => sum + segment.length, 0));
  let longest = 0;
  lengths.forEach((length, i) => {
    if (length > lengths[longest]!) longest = i;
  });
  const turn = area(loops[longest]!) < 0;
  const clockwise = loops.map((loop) => (turn ? reversed(loop) : loop));
  const ring = fromUpperLeft(clockwise[longest]!);
  const walk = createWalk(ring);
  return {
    d: [ring, ...clockwise.filter((_, i) => i !== longest)].map((loop) => pathData(loop, true)).join(""),
    closed: true,
    sample(n) {
      checkCount(n, 4);
      const perSide = n / 4;
      const points: Point[] = [];
      // Each quarter from its own corner, so the corners are the same points whatever n is.
      for (let side = 0; side < 4; side++) {
        for (let j = 0; j < perSide; j++) points.push(walk.point(side / 4 + j / perSide / 4));
      }
      return points;
    }
  };
}

/** The loop's signed area: more than 0 when it runs clockwise on screen. */
function area(loop: readonly PathSegment[]): number {
  let sum = 0;
  for (const segment of loop) {
    if (segment.kind === "line") {
      sum += segment.from.x * segment.to.y - segment.to.x * segment.from.y;
      continue;
    }
    const { center, radius, start, sweep } = segment;
    const end = start + sweep;
    sum += radius * (center.x * (Math.sin(end) - Math.sin(start)) - center.y * (Math.cos(end) - Math.cos(start))) + radius * radius * sweep;
  }
  return sum / 2;
}

/** The loop walked the other way. */
function reversed(loop: readonly PathSegment[]): PathSegment[] {
  return loop.map((segment) => (segment.kind === "line" ? line(segment.to, segment.from) : arc(segment.center, segment.radius, segment.start + segment.sweep, -segment.sweep))).reverse();
}

/** The loop from its upper left: the least x + y, at a segment's start or inside an arc, and of two, the higher. */
function fromUpperLeft(loop: readonly PathSegment[]): PathSegment[] {
  let index = 0;
  let u = 0;
  let key = Infinity;
  let top = Infinity;
  const consider = (point: Point, i: number, at: number): void => {
    const k = point.x + point.y;
    if (k < key - 1e-9 || (k <= key + 1e-9 && point.y < top)) [index, u, key, top] = [i, at, k, point.y];
  };
  loop.forEach((segment, i) => {
    consider(pointOn(segment, 0), i, 0);
    if (segment.kind === "arc") {
      // On a circle, x + y is least at the upper left, 3π/4 anticlockwise from +x.
      const turned = segment.sweep >= 0 ? UPPER_LEFT - segment.start : segment.start - UPPER_LEFT;
      const at = (((turned % TAU) + TAU) % TAU) / Math.abs(segment.sweep);
      if (at < 1) consider(pointOn(segment, at), i, at);
    }
  });
  const [before, after] = split(loop[index]!, u);
  return [after, ...loop.slice(index + 1), ...loop.slice(0, index), before].filter((segment) => segment.length > 0);
}

/** A segment in two, at fraction u of its length. */
function split(segment: PathSegment, u: number): [PathSegment, PathSegment] {
  if (segment.kind === "line") {
    const at = pointOn(segment, u);
    return [line(segment.from, at), line(at, segment.to)];
  }
  const { center, radius, start, sweep } = segment;
  return [arc(center, radius, start, sweep * u), arc(center, radius, start + sweep * u, sweep * (1 - u))];
}

const UPPER_LEFT = (-3 * Math.PI) / 4;

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
