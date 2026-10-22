// samplesAlong: data points placed on a mark's walk, as data effects' samples. A page gives a host's
// line its values this way: the points that drew it, projected onto the walk that describes it.
// It reads only the MarkGeometry contract (path and length), so it works on any mark.

import type { Sample } from "../contracts/data";
import type { MarkGeometry, Point } from "../contracts/geometry";

/** A data point in the mark's coordinates, with its value and, optionally, the x value behind it. */
export interface SamplePoint {
  readonly x: number;
  readonly y: number;
  readonly value: number;
  readonly at?: string | number | Date;
}

/** The grid that finds each point's nearest stretch of the walk: a point every px, up to this many. */
const MAX_GRID = 4096;
/**
 * Golden-section steps that narrow a stretch of 2 grid steps down: to about 1e-12 px for a point on
 * the walk, and to well under 1e-6 px for one off it, where the nearest point is a flat minimum.
 */
const REFINE = 48;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/**
 * Projects each point onto the nearest point of the mark's walk and returns the samples in `t` order
 * (points at the same `t` keep their order). A point on the walk, such as a vertex of the polyline it
 * drew, lands exactly where it is. Throws a RangeError on a point whose x, y or value isn't finite.
 */
export function samplesAlong(mark: MarkGeometry, points: readonly SamplePoint[]): Sample[] {
  if (typeof mark !== "object" || mark === null || typeof mark.path !== "function" || !Number.isFinite(mark.length)) {
    throw new TypeError("samplesAlong needs a MarkGeometry, as describe builds it.");
  }
  if (!Array.isArray(points)) throw new TypeError("samplesAlong needs an array of points { x, y, value, at? }.");
  points.forEach((p, i) => {
    for (const field of ["x", "y", "value"] as const) {
      const value: unknown = (p as Partial<SamplePoint> | null)?.[field];
      if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`samplesAlong: points[${i}].${field} must be a finite number, got ${String(value)}.`);
    }
  });

  const n = mark.length > 0 ? Math.min(MAX_GRID, Math.ceil(mark.length) + 1) : 1;
  const grid = Array.from({ length: n }, (_, i): Point => mark.path(n === 1 ? 0 : i / (n - 1)));
  return points
    .map((p, index) => ({ index, sample: { t: nearest(mark, grid, p), value: p.value, ...(p.at === undefined ? {} : { at: p.at }) } }))
    .sort((a, b) => a.sample.t - b.sample.t || a.index - b.index)
    .map(({ sample }) => sample);
}

/** The t of the walk's nearest point to `p`: the nearest grid point, then a golden-section search on the stretch either side of it. */
function nearest(mark: MarkGeometry, grid: readonly Point[], p: Point): number {
  const n = grid.length;
  if (n === 1) return 0;
  let best = 0;
  let bestDistance = Infinity;
  grid.forEach((q, i) => {
    const d = squared(q, p);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  const f = (t: number): number => squared(mark.path(t), p);
  let lo = Math.max(0, best - 1) / (n - 1);
  let hi = Math.min(n - 1, best + 1) / (n - 1);
  let a = hi - GOLDEN * (hi - lo);
  let b = lo + GOLDEN * (hi - lo);
  let fa = f(a);
  let fb = f(b);
  for (let step = 0; step < REFINE; step++) {
    if (fa <= fb) {
      hi = b;
      b = a;
      fb = fa;
      a = hi - GOLDEN * (hi - lo);
      fa = f(a);
    } else {
      lo = a;
      a = b;
      fa = fb;
      b = lo + GOLDEN * (hi - lo);
      fb = f(b);
    }
  }
  const t = (lo + hi) / 2;
  // The grid point itself unless the search found somewhere nearer, so a point at either end lands
  // on exactly 0 or 1, and a stretch that isn't one dip can't make it worse.
  const found = f(t) < bestDistance ? t : best / (n - 1);
  return found > 0 ? (found < 1 ? found : 1) : 0;
}

function squared(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
