// describe.line: a straight-segment polyline, as d3.line() draws with its default curve, with gaps
// where a run of points ends and the next begins.

import type { MarkGeometry, Point, Rect } from "../../contracts/geometry";
import { openOutline } from "../outline";
import { boundsOf, line, type LineSegment } from "../segment";
import { createWalk, type Gaps } from "../walk";
import { assemble, finite, labelBoxes, size } from "./mark";

export interface LineSpec {
  readonly key: string;
  readonly series?: string;
  /** At least one point, in chart px. */
  readonly points: readonly Point[];
  /**
   * The indices of the points that start a new run, so there's a gap from `points[i - 1]` to
   * `points[i]`: each a whole number from 1 to the last index, in order, with no repeats. A line
   * drawn with d3's `.defined()` is described by its defined points and where they break. Default none.
   */
  readonly breaks?: readonly number[];
  /** Stroke width in px. Default 1, SVG's default. */
  readonly width?: number;
  /** The boxes of the text drawn for the mark, in the same px: passed through as `labelBounds`. */
  readonly labelBounds?: readonly Rect[];
  /** The boxes of other marks' text near it, in the same px: passed through as `nearbyLabels`. */
  readonly nearbyLabels?: readonly Rect[];
}

/**
 * The walk is the line itself, first point to last, running straight across each break. Its outline
 * is open: the stroke, with the breaks left out. A break between two points in the same place leaves
 * no gap, since there's nothing between them to leave out.
 */
export function describeLine(spec: LineSpec): MarkGeometry {
  const { key, series, points } = spec;
  const width = size("line", "width", spec.width ?? 1);
  const first = points[0];
  if (!first) throw new RangeError(`describe.line: "${key}" needs at least one point.`);
  points.forEach((p, i) => {
    finite("line", `points[${i}].x`, p.x);
    finite("line", `points[${i}].y`, p.y);
  });
  const breaks = checkBreaks(spec.breaks, points.length);

  const segments: LineSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    // A repeated point keeps the direction so far.
    segments.push(line(points[i - 1]!, points[i]!, segments[segments.length - 1]?.angle ?? 0));
  }
  if (segments.length === 0) segments.push(line(first, first));

  const walk = createWalk(segments, gapsAt(breaks, segments));
  const box = boundsOf(points);
  const pad = width / 2;
  return assemble({
    key,
    series,
    walk,
    thickness: width,
    outline: openOutline(walk),
    bounds: { x: box.x - pad, y: box.y - pad, width: box.width + width, height: box.height + width },
    center: walk.point(0.5),
    pivot: first,
    labelBounds: labelBoxes("line", spec.labelBounds),
    nearbyLabels: labelBoxes("line", spec.nearbyLabels, "nearbyLabels")
  });
}

/** The walk's gaps, in t: from the point before each break to the point at it, where they're apart. */
function gapsAt(breaks: readonly number[], segments: readonly LineSegment[]): Gaps {
  // The distance to each point, summed as createWalk sums it, so the last point is at t = 1 exactly.
  const along = [0];
  for (const segment of segments) along.push(along[along.length - 1]! + segment.length);
  const length = along[along.length - 1]!;
  return breaks.filter((i) => along[i]! > along[i - 1]!).map((i) => [along[i - 1]! / length, along[i]! / length]);
}

/** `breaks`, checked: whole numbers from 1 to the last index, in order, with no repeats. */
function checkBreaks(breaks: readonly number[] | undefined, count: number): readonly number[] {
  if (breaks === undefined) return [];
  if (!Array.isArray(breaks)) throw new RangeError(`describe.line: breaks must be an array of point indices, got ${show(breaks)}.`);
  let after = 0;
  breaks.forEach((index: unknown, i) => {
    if (!(Number.isInteger(index) && (index as number) > after && (index as number) < count)) {
      throw new RangeError(`describe.line: breaks[${i}] must be a whole number more than ${after} and less than ${count}, the number of points, got ${show(index)}.`);
    }
    after = index as number;
  });
  return breaks;
}

const show = (value: unknown): string => (typeof value === "string" ? JSON.stringify(value) : String(value));
