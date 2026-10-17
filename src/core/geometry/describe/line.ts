// describe.line: a straight-segment polyline, as d3.line() draws with its default curve.

import type { MarkGeometry, Point } from "../../contracts/geometry";
import { openOutline } from "../outline";
import { boundsOf, line, type LineSegment } from "../segment";
import { createWalk } from "../walk";
import { assemble, finite, size } from "./mark";

export interface LineSpec {
  readonly key: string;
  readonly series?: string;
  /** At least one point, in chart px. */
  readonly points: readonly Point[];
  /** Stroke width in px. Default 1, SVG's default. */
  readonly width?: number;
}

/** The walk is the line itself, first point to last. Its outline is open: the stroke. */
export function describeLine(spec: LineSpec): MarkGeometry {
  const { key, series, points } = spec;
  const width = size("line", "width", spec.width ?? 1);
  const first = points[0];
  if (!first) throw new RangeError(`describe.line: "${key}" needs at least one point.`);
  points.forEach((p, i) => {
    finite("line", `points[${i}].x`, p.x);
    finite("line", `points[${i}].y`, p.y);
  });

  const segments: LineSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    // A repeated point keeps the direction so far.
    segments.push(line(points[i - 1]!, points[i]!, segments[segments.length - 1]?.angle ?? 0));
  }
  if (segments.length === 0) segments.push(line(first, first));

  const walk = createWalk(segments);
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
    pivot: first
  });
}
