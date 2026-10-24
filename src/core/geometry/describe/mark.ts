// Shared by the builders: assembling a MarkGeometry from a walk and a body, and checking input.

import type { MarkGeometry, Outline, Point, Rect } from "../../contracts/geometry";
import type { Walk } from "../walk";

export interface MarkParts {
  readonly key: string;
  readonly series?: string | undefined;
  readonly walk: Walk;
  readonly thickness: number;
  readonly outline: Outline;
  readonly bounds: Rect;
  readonly center: Point;
  readonly pivot: Point;
  readonly labelBounds?: readonly Rect[] | undefined;
  readonly segments?: readonly MarkGeometry[];
}

export function assemble({ key, series, walk, thickness, outline, bounds, center, pivot, labelBounds, segments }: MarkParts): MarkGeometry {
  return {
    key,
    ...(series === undefined ? {} : { series }),
    start: walk.start,
    end: walk.end,
    length: walk.length,
    path: (t) => walk.point(t),
    angle: (t) => walk.angle(t),
    slice: (t0, t1) => walk.slice(t0, t1),
    thickness,
    outline,
    bounds,
    center,
    pivot,
    ...(labelBounds === undefined ? {} : { labelBounds }),
    ...(segments === undefined ? {} : { segments })
  };
}

/** Throws a RangeError naming the builder and field unless `value` is a finite number. */
export function finite(builder: string, field: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`describe.${builder}: ${field} must be a finite number, got ${value}.`);
  return value;
}

/** A spec's `labelBounds`, checked: each box's numbers finite, its sizes ≥ 0. */
export function labelBoxes(builder: string, boxes: readonly Rect[] | undefined): readonly Rect[] | undefined {
  boxes?.forEach((box, i) => {
    finite(builder, `labelBounds[${i}].x`, box.x);
    finite(builder, `labelBounds[${i}].y`, box.y);
    size(builder, `labelBounds[${i}].width`, box.width);
    size(builder, `labelBounds[${i}].height`, box.height);
  });
  return boxes;
}

/** Throws a RangeError unless `value` is a finite number ≥ 0. */
export function size(builder: string, field: string, value: number): number {
  if (!(Number.isFinite(value) && value >= 0)) {
    throw new RangeError(`describe.${builder}: ${field} must be a finite number ≥ 0, got ${value}.`);
  }
  return value;
}
