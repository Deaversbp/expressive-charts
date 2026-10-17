// describe.point: a dot with no direction (a scatter point or a marker).

import type { MarkGeometry } from "../../contracts/geometry";
import { closedOutline } from "../outline";
import { arc, line } from "../segment";
import { createWalk } from "../walk";
import { assemble, finite, size } from "./mark";

export interface PointSpec {
  readonly key: string;
  readonly series?: string;
  readonly x: number;
  readonly y: number;
  /** Radius in px. */
  readonly r: number;
}

/**
 * Length 0, with start = end = centre, so travel does nothing while wiggle, pulse and flash still
 * work. Faces +x: the outline's sides are the quarter circles top, right, bottom and left.
 */
export function describePoint(spec: PointSpec): MarkGeometry {
  const { key, series } = spec;
  const center = { x: finite("point", "x", spec.x), y: finite("point", "y", spec.y) };
  const r = size("point", "r", spec.r);
  const quarter = Math.PI / 2;
  return assemble({
    key,
    series,
    walk: createWalk([line(center, center)]),
    thickness: 2 * r,
    outline: closedOutline([
      [arc(center, r, (-3 * quarter) / 2, quarter)],
      [arc(center, r, -quarter / 2, quarter)],
      [arc(center, r, quarter / 2, quarter)],
      [arc(center, r, (3 * quarter) / 2, quarter)]
    ]),
    bounds: { x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r },
    center,
    pivot: center
  });
}
