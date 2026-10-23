// Whether a mark goes round a centre, read from its geometry alone: a slice does, a bar doesn't. The
// adapter orders a ring of marks with it, and morph's "drop" turns its pairing by it.

import type { MarkGeometry, Point } from "../contracts/geometry";

/** px: the same distance from the pivot give or take this much, and further from it than this. */
const ROUND = 0.5;

/**
 * Whether the mark's walk goes round its pivot: its start, centre and end all the same distance from
 * the pivot, give or take 0.5 px, and more than 0.5 px away. An arc's pivot is the donut's centre; a
 * line's, a bar's and a point's is on its own walk, so lines that start at one point aren't a ring.
 */
export function goesRound(mark: Pick<MarkGeometry, "start" | "center" | "end" | "pivot">): boolean {
  const radius = distance(mark.start, mark.pivot);
  return radius > ROUND && Math.abs(distance(mark.center, mark.pivot) - radius) <= ROUND && Math.abs(distance(mark.end, mark.pivot) - radius) <= ROUND;
}

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
