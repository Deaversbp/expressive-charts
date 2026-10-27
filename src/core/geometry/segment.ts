// Path segments: straight lines and circular arcs, with exact lengths.
//
// Angles are screen angles: radians, 0 along +x, increasing clockwise on screen (y points down).
// That is the convention of Math.atan2 in chart pixels, and of the walk's `angle(t)`.

import type { Point, Rect } from "../contracts/geometry";

export const TAU: number = 2 * Math.PI;

export interface LineSegment {
  readonly kind: "line";
  readonly from: Point;
  readonly to: Point;
  readonly length: number;
  /** Direction from `from` to `to`, or the fallback given to `line()` when they coincide. */
  readonly angle: number;
}

export interface ArcSegment {
  readonly kind: "arc";
  readonly center: Point;
  readonly radius: number;
  /** Screen angle of the first point. */
  readonly start: number;
  /** Signed: positive is clockwise on screen. */
  readonly sweep: number;
  /** Exact: radius × |sweep|. */
  readonly length: number;
}

export type PathSegment = LineSegment | ArcSegment;

/** A straight segment. `fallbackAngle` is its direction if `from` and `to` coincide. */
export function line(from: Point, to: Point, fallbackAngle = 0): LineSegment {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return { kind: "line", from, to, length, angle: length > 0 ? Math.atan2(dy, dx) : normalizeAngle(fallbackAngle) };
}

/** A circular arc from screen angle `start`, turning `sweep` radians (positive = clockwise on screen). */
export function arc(center: Point, radius: number, start: number, sweep: number): ArcSegment {
  return { kind: "arc", center, radius, start, sweep, length: radius * Math.abs(sweep) };
}

/** The point a fraction `u` (0–1) of the way along the segment, by distance. Exact at both ends of a line. */
export function pointOn(segment: PathSegment, u: number): Point {
  if (segment.kind === "line") {
    const { from, to } = segment;
    return { x: from.x * (1 - u) + to.x * u, y: from.y * (1 - u) + to.y * u };
  }
  return polar(segment.center, segment.radius, segment.start + segment.sweep * u);
}

/** Direction of travel at fraction `u`, in (-PI, PI]. */
export function angleOn(segment: PathSegment, u: number): number {
  if (segment.kind === "line") return segment.angle;
  const quarter = segment.sweep < 0 ? -Math.PI / 2 : Math.PI / 2;
  return normalizeAngle(segment.start + segment.sweep * u + quarter);
}

export function polar(center: Point, radius: number, angle: number): Point {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

/** The same angle in (-PI, PI]. */
export function normalizeAngle(angle: number): number {
  return angle - TAU * Math.ceil((angle - Math.PI) / TAU);
}

/** The points that bound a segment: its ends, plus an arc's extremes in x and y. */
export function extremes(segment: PathSegment): Point[] {
  if (segment.kind === "line") return [segment.from, segment.to];
  const points = [pointOn(segment, 0), pointOn(segment, 1)];
  for (let k = 0; k < 4; k++) {
    const angle = (k * Math.PI) / 2;
    if (sweeps(segment, angle)) points.push(polar(segment.center, segment.radius, angle));
  }
  return points;
}

export function boundsOf(points: readonly Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** True if the arc passes through screen angle `angle`. */
function sweeps(segment: ArcSegment, angle: number): boolean {
  const extent = Math.abs(segment.sweep);
  if (extent >= TAU) return true;
  const turned = segment.sweep >= 0 ? angle - segment.start : segment.start - angle;
  return ((turned % TAU) + TAU) % TAU <= extent;
}
