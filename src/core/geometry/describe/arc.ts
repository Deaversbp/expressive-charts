// describe.arc: donut and pie slices, in d3.pie()'s angle convention.

import type { MarkGeometry, Rect } from "../../contracts/geometry";
import { closedOutline } from "../outline";
import { arc, boundsOf, extremes, line, polar, TAU } from "../segment";
import { createWalk } from "../walk";
import { assemble, finite, labelBoxes, size } from "./mark";

export interface ArcSpec {
  readonly key: string;
  readonly series?: string;
  /** The donut's centre. */
  readonly cx: number;
  readonly cy: number;
  /** Radii in px; 0 inner makes a pie slice. They're swapped if inner > outer, as d3.arc() does. */
  readonly inner: number;
  readonly outer: number;
  /** Radians, 0 at 12 o'clock, clockwise: the d3.pie() convention. end < start walks anticlockwise. */
  readonly start: number;
  readonly end: number;
  /** The boxes of the text drawn for the mark, in the same px: passed through as `labelBounds`. */
  readonly labelBounds?: readonly Rect[];
  /** The boxes of other marks' text near it, in the same px: passed through as `nearbyLabels`. */
  readonly nearbyLabels?: readonly Rect[];
}

/**
 * The walk runs along the mid-radius arc from the start angle to the end angle, so for a slice
 * walked clockwise "up" is outward. The angle of travel equals the d3 angle (normalised).
 */
export function describeArc(spec: ArcSpec): MarkGeometry {
  const { key, series } = spec;
  const center = { x: finite("arc", "cx", spec.cx), y: finite("arc", "cy", spec.cy) };
  const r0 = Math.min(size("arc", "inner", spec.inner), size("arc", "outer", spec.outer));
  const r1 = Math.max(spec.inner, spec.outer);
  finite("arc", "start", spec.start);
  finite("arc", "end", spec.end);
  // More than a full turn draws the same ring, as with d3.arc().
  const sweep = Math.max(-TAU, Math.min(TAU, spec.end - spec.start));
  // d3 measures from 12 o'clock; screen angles from 3 o'clock.
  const from = spec.start - Math.PI / 2;
  const to = from + sweep;

  // The up side is outward when walking clockwise, inward when walking anticlockwise.
  const [left, right] = sweep >= 0 ? [r1, r0] : [r0, r1];
  const sides = [
    [arc(center, left, from, sweep)],
    [line(polar(center, left, to), polar(center, right, to), to + (left > right ? Math.PI : 0))],
    [arc(center, right, to, -sweep)],
    [line(polar(center, right, from), polar(center, left, from), from + (left > right ? 0 : Math.PI))]
  ] as const;

  const walk = createWalk([arc(center, (r0 + r1) / 2, from, sweep)]);
  return assemble({
    key,
    series,
    walk,
    thickness: r1 - r0,
    outline: closedOutline(sides),
    bounds: boundsOf(sides.flat().flatMap(extremes)),
    center: walk.point(0.5),
    pivot: center,
    labelBounds: labelBoxes("arc", spec.labelBounds),
    nearbyLabels: labelBoxes("arc", spec.nearbyLabels, "nearbyLabels")
  });
}
