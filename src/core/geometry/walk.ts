// A walk: connected segments parameterised by distance, so t = 0.5 is halfway along on screen.

import type { Point } from "../contracts/geometry";
import { drawTo, moveTo, pathData } from "./path-data";
import { angleOn, pointOn, type PathSegment } from "./segment";

export interface Walk {
  readonly segments: readonly PathSegment[];
  readonly length: number;
  readonly start: Point;
  readonly end: Point;
  /** t in [0, 1], proportional to distance. Values outside are clamped. */
  point(t: number): Point;
  /** Direction of travel in (-PI, PI]. At a joint, the segment ahead wins, except at t = 1. */
  angle(t: number): number;
  /** Path data from t0 to t1, in either order. Just a move when they're equal. */
  slice(t0: number, t1: number): string;
  /** Path data for the whole walk. */
  readonly d: string;
}

const clamp01 = (t: number): number => (t > 0 ? (t < 1 ? t : 1) : 0);

/** The segments must connect: each starts where the one before ends. */
export function createWalk(segments: readonly PathSegment[]): Walk {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) throw new RangeError("A walk needs at least one segment.");

  // cumulative[i] is the distance to the start of segment i.
  const cumulative = [0];
  for (const segment of segments) cumulative.push(cumulative[cumulative.length - 1]! + segment.length);
  const length = cumulative[segments.length]!;
  const start = pointOn(first, 0);
  const end = pointOn(last, 1);

  // The segment at distance d, and the fraction along it. Zero-length segments are never picked
  // unless the whole walk has zero length.
  const locate = (d: number): { readonly index: number; readonly u: number } => {
    if (!(length > 0)) return { index: 0, u: 0 };
    if (d >= length) {
      let index = segments.length - 1;
      while (index > 0 && !(segments[index]!.length > 0)) index--;
      return { index, u: 1 };
    }
    // The first segment that ends beyond d.
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid + 1]! > d) hi = mid;
      else lo = mid + 1;
    }
    return { index: lo, u: Math.min(1, (d - cumulative[lo]!) / segments[lo]!.length) };
  };

  const point = (t: number): Point => {
    const at = clamp01(t);
    if (at === 0) return start;
    if (at === 1) return end;
    const { index, u } = locate(at * length);
    return pointOn(segments[index]!, u);
  };

  return {
    segments,
    length,
    start,
    end,
    point,
    angle(t) {
      const { index, u } = locate(clamp01(t) * length);
      return angleOn(segments[index]!, u);
    },
    slice(t0, t1) {
      const from = clamp01(Math.min(t0, t1));
      const to = clamp01(Math.max(t0, t1));
      let d = moveTo(point(from));
      const a = from * length;
      const b = to * length;
      if (!(b > a)) return d;
      const first = locate(a);
      for (let i = first.index; i < segments.length && cumulative[i]! < b; i++) {
        const segment = segments[i]!;
        if (!(segment.length > 0)) continue;
        const u0 = i === first.index ? first.u : 0;
        const u1 = cumulative[i + 1]! > b ? Math.min(1, (b - cumulative[i]!) / segment.length) : 1;
        if (u1 > u0) d += drawTo(segment, u0, u1);
      }
      return d;
    },
    d: pathData(segments)
  };
}
