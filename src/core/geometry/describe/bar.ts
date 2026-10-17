// describe.bar: horizontal bars and vertical columns, plain or stacked, with an optional rounded tip.

import type { MarkGeometry, Point, Rect } from "../../contracts/geometry";
import { closedOutline } from "../outline";
import { arc, boundsOf, line } from "../segment";
import { createWalk } from "../walk";
import { assemble, finite, size } from "./mark";

/** The edge a bar grows from. */
export type Baseline = "left" | "right" | "top" | "bottom";

export interface BarSegmentSpec {
  readonly series: string;
  /** Px along the walk, gap included. */
  readonly size: number;
}

export interface BarSpec {
  readonly key: string;
  readonly series?: string;
  /** The whole bar's rectangle, in chart px. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly baseline: Baseline;
  /** Corner radius at the tip. The baseline end stays square. Default 0. */
  readonly radius?: number;
  /**
   * Ordered parts, from the baseline. Default: one segment named after `series`, covering the bar.
   * Sizes normally add up to the bar's length; anything past the tip is cut off.
   */
  readonly segments?: readonly BarSegmentSpec[];
  /**
   * Px left empty between segments (the prototype uses 2). It comes out of the start of the later
   * segment, so every segment still ends at its value, and it shrinks to fit when what comes
   * before is shorter. Default 0.
   */
  readonly gap?: number;
}

const ANGLE: Readonly<Record<Baseline, number>> = { left: 0, right: Math.PI, top: Math.PI / 2, bottom: -Math.PI / 2 };

/**
 * The walk runs along the centre line from the middle of the baseline edge to the middle of the
 * tip. A plain bar has one segment, so `travel(…, { along: "goals" })` works stacked or not.
 */
export function describeBar(spec: BarSpec): MarkGeometry {
  const { key, series, baseline, x, y, width, height } = spec;
  if (!Object.prototype.hasOwnProperty.call(ANGLE, baseline)) {
    throw new RangeError(`describe.bar: baseline must be left, right, top or bottom, got ${String(baseline)}.`);
  }
  finite("bar", "x", x);
  finite("bar", "y", y);
  size("bar", "width", width);
  size("bar", "height", height);
  const radius = size("bar", "radius", spec.radius ?? 0);
  const gap = size("bar", "gap", spec.gap ?? 0);

  const horizontal = baseline === "left" || baseline === "right";
  const length = horizontal ? width : height;
  const thickness = horizontal ? height : width;
  const T = thickness;
  const angle = ANGLE[baseline];
  const at = frame(spec);

  // The bar or segment covering [p0, p1] along the walk. The tip is rounded by up to `tip` px.
  const part = (
    p0: number,
    p1: number,
    tip: number,
    rest: { key: string; series: string | undefined; bounds?: Rect; segments?: readonly MarkGeometry[] }
  ): MarkGeometry => {
    const rr = Math.max(0, Math.min(tip, p1 - p0, T / 2));
    const outline = closedOutline([
      [line(at(p0, 0), at(p1 - rr, 0), angle)],
      rr > 0
        ? [
            arc(at(p1 - rr, rr), rr, angle - Math.PI / 2, Math.PI / 2),
            line(at(p1, rr), at(p1, T - rr), angle + Math.PI / 2),
            arc(at(p1 - rr, T - rr), rr, angle, Math.PI / 2)
          ]
        : [line(at(p1, 0), at(p1, T), angle + Math.PI / 2)],
      [line(at(p1 - rr, T), at(p0, T), angle + Math.PI)],
      [line(at(p0, T), at(p0, 0), angle - Math.PI / 2)]
    ]);
    const walk = createWalk([line(at(p0, T / 2), at(p1, T / 2), angle)]);
    return assemble({
      ...rest,
      walk,
      thickness,
      outline,
      bounds: rest.bounds ?? boundsOf([at(p0, 0), at(p1, T)]),
      center: at((p0 + p1) / 2, T / 2),
      pivot: walk.start
    });
  };

  const specs: readonly { readonly series?: string | undefined; readonly size: number }[] = spec.segments ?? [{ series, size: length }];
  const seen = new Set<string>();
  let cursor = 0;
  const spans = specs.map((segment, index) => {
    size("bar", `segments[${index}].size`, segment.size);
    if (segment.series !== undefined) {
      if (seen.has(segment.series)) throw new Error(`describe.bar: series "${segment.series}" appears twice in the segments of "${key}".`);
      seen.add(segment.series);
    }
    const from = Math.min(cursor, length);
    cursor += segment.size;
    const to = Math.min(cursor, length);
    return { segment, index, p0: Math.min(from + Math.min(gap, from), to), p1: to };
  });

  const segments = spans.map(({ segment, index, p0, p1 }) =>
    // The rounding fades in as a segment nears the tip, so a growing stack never pops.
    part(p0, p1, radius - (length - p1), {
      key: segment.series === undefined ? `${key}/${index}` : `${key}/${segment.series}`,
      series: segment.series
    })
  );
  // The whole bar keeps the exact rectangle it was given.
  return part(0, length, radius, { key, series, bounds: { x, y, width, height }, segments });
}

/** Chart px at distance p along the walk and s across it, measured from the left (up) edge. */
function frame({ x, y, width: w, height: h, baseline }: BarSpec): (p: number, s: number) => Point {
  switch (baseline) {
    case "left":
      return (p, s) => ({ x: x + p, y: y + s });
    case "right":
      return (p, s) => ({ x: x + w - p, y: y + h - s });
    case "top":
      return (p, s) => ({ x: x + w - s, y: y + p });
    case "bottom":
      return (p, s) => ({ x: x + s, y: y + h - p });
  }
}
