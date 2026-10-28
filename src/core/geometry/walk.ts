// A walk: connected segments parameterised by distance, so t = 0.5 is halfway along on screen. It can
// have gaps, stretches with no data that its path data leaves out.

import type { Point } from "../contracts/geometry";
import { drawTo, moveTo, pathData } from "./path-data";
import { angleOn, pointOn, type PathSegment } from "./segment";

/** Stretches of a walk with no data, as [from, to] values of t: in order, apart, each with 0 ≤ from < to ≤ 1. */
export type Gaps = readonly (readonly [from: number, to: number])[];

export interface Walk {
  readonly segments: readonly PathSegment[];
  readonly length: number;
  readonly start: Point;
  readonly end: Point;
  /** The stretches slice() and d leave out; empty when there are none. */
  readonly gaps: Gaps;
  /** t in [0, 1], proportional to distance. Values outside are clamped. */
  point(t: number): Point;
  /** Direction of travel in (-PI, PI]. At a joint, the segment ahead wins, except at t = 1. */
  angle(t: number): number;
  /**
   * Path data from t0 to t1, in either order. Just a move when they're equal. It leaves out the gaps:
   * each part between them starts with its own move, and a part with no length isn't written.
   */
  slice(t0: number, t1: number): string;
  /** Path data for the whole walk, less its gaps. */
  readonly d: string;
}

const clamp01 = (t: number): number => (t > 0 ? (t < 1 ? t : 1) : 0);
const NONE: Gaps = /* @__PURE__ */ Object.freeze([]);

/** The segments must connect: each starts where the one before ends. The gaps are taken as given. */
export function createWalk(segments: readonly PathSegment[], gaps: Gaps = NONE): Walk {
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

  /** Path data from t `from` to `to` (from ≤ to, both in [0, 1]), gaps and all. */
  const draw = (from: number, to: number): string => {
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
  };

  const slice = (t0: number, t1: number): string => {
    const from = clamp01(Math.min(t0, t1));
    const to = clamp01(Math.max(t0, t1));
    if (gaps.length === 0) return draw(from, to);
    // The parts between the gaps, each drawn from its own move. All in a gap: a move where it starts.
    let d = "";
    let at = from;
    for (const [a, b] of gaps) {
      if (a >= to) break;
      if (a > at) d += draw(at, a);
      if (b > at) at = b;
    }
    if (to > at) d += draw(at, to);
    return d === "" ? moveTo(point(from)) : d;
  };

  return {
    segments,
    length,
    start,
    end,
    gaps,
    point,
    angle(t) {
      const { index, u } = locate(clamp01(t) * length);
      return angleOn(segments[index]!, u);
    },
    slice,
    d: gaps.length === 0 ? pathData(segments) : slice(0, 1)
  };
}
