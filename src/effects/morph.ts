// morph: the transition effect that turns one mark's shape into another's, as the lab's donut turns
// into columns. Both outlines are sampled at the same number of points and each point moves in a
// straight line to its partner. It reads only the two geometries, so it morphs any mark into any
// other: bars, slices and points (closed outlines) and lines (open ones).

import { easeInOutCubic, linear } from "../core";
import type { Layer, MarkGeometry, Paint, PathHandle, Point, TransitionEffect, Tween } from "../core";
import { formatNumber } from "../core/geometry";

/** How two closed outlines' sides are matched. */
export type MorphAlign = "unroll" | "drop";

export interface MorphOptions {
  /** Points sampled on each outline, a whole multiple of 4 (a quarter on each side of a closed one). Default 160, the lab's 40 a side. */
  readonly points?: number;
  /**
   * How two closed outlines' sides are matched:
   * - "unroll" matches each side with the same side. A slice's walk becomes a column's, so the slice
   *   stands up: its outer arc becomes the column's left side, and the angle it spans its height.
   * - "drop" turns the matching by one side, as the lab does: a slice's outer arc becomes a column's
   *   top, so it settles onto the baseline.
   *
   * Default "unroll", for now: the default is chosen in the morph demo (M5 step 4).
   */
  readonly align?: MorphAlign;
}

/** The lab's morph: 950 ms base, with transition timing. */
const DURATION = 950;
const POINTS = 160;
const ALIGNS: readonly string[] = ["unroll", "drop"];
/** The adapter's ring-order tolerance, px. */
const ROUND = 0.5;

/** Draws the morph at eased progress p, from 0 (`from`) to 1 (`to`), creating or updating its paths. */
type Draw = (p: number) => void;

/**
 * Morphs `from` into `to` over 950 ms base (`transition` timing: at most 200 ms in Analysis, a jump
 * in Off), eased in and out.
 *
 * - **Two closed outlines** (bars, slices, points): both are sampled at `points`, and each point
 *   moves in a straight line to its partner, drawn as one filled path in the mark's colour. With
 *   `align: "drop"` the pairing is turned by a quarter, from a mark that goes round its pivot (a
 *   slice) to one that doesn't (a bar), whichever is `from`: so a switch back retraces the same
 *   pairing instead of twisting. Between two marks of the same kind, "drop" pairs as "unroll" does.
 * - **Two open outlines** (lines): both strokes are sampled along their length, and the stroke's
 *   width moves from one thickness to the other.
 * - **A closed and an open outline** crossfade: the first fades out as the second fades in.
 *
 * A run from `ctx.start` begins with the shapes there, in their eased progress, and takes the rest
 * of the time a full run would. The end state is the target's own outline.
 */
export function morph(options: MorphOptions = {}): TransitionEffect {
  checkOptions(options);
  const points = options?.points ?? POINTS;
  const align = options?.align ?? "unroll";

  return {
    kind: "transition",
    async run(from, to, ctx) {
      if (ctx.signal.aborted) return;
      const draw = drawing(from, to, ctx.layer, points, align);
      const start = startOf(ctx.start);
      if (start >= 1) {
        draw(1);
        return;
      }
      // When a full run's shapes are at `start`: the run plays from there, so it takes the rest of
      // the full run's time, whatever the motion mode scales that to.
      const begun = unease(start);
      let running: Tween | undefined;
      running = ctx.tween({
        duration: DURATION,
        timing: "transition",
        ease: linear,
        update: (k) => {
          const u = Math.min(1, begun + k);
          draw(k === 0 ? start : easeInOutCubic(u));
          if (u >= 1 && k < 1) running?.finish();
        }
      });
      await running.finished;
    },
    end(from, to, ctx) {
      drawing(from, to, ctx.layer, points, align)(1);
    },
    clear() {}
  };
}

function drawing(from: MarkGeometry, to: MarkGeometry, layer: Layer, points: number, align: MorphAlign): Draw {
  const closed = from.outline.closed;
  if (closed !== to.outline.closed) return crossfade(from, to, layer);
  const a = from.outline.sample(points);
  const b = to.outline.sample(points);
  if (!closed) return stroke(from, to, layer, a, b);
  const [shiftA, shiftB] = align === "drop" ? turn(from, to, points) : [0, 0];
  let path: PathHandle | undefined;
  return (p) => {
    const d = p <= 0 ? from.outline.d : p >= 1 ? to.outline.d : between(a, b, shiftA, shiftB, p, true);
    if (path) path.update(d);
    else path = layer.path(d, { fill: "mark" });
  };
}

/** One stroke whose points and width move between the two lines'. */
function stroke(from: MarkGeometry, to: MarkGeometry, layer: Layer, a: readonly Point[], b: readonly Point[]): Draw {
  let path: PathHandle | undefined;
  return (p) => {
    const d = p <= 0 ? from.outline.d : p >= 1 ? to.outline.d : between(a, b, 0, 0, p, false);
    const width = p <= 0 ? from.thickness : p >= 1 ? to.thickness : mix(from.thickness, to.thickness, p);
    if (path) path.update(d, { width });
    else path = layer.path(d, { stroke: "mark", width });
  };
}

/** The two outlines as they are, the closed one below the open one, whichever is leaving: so a switch back draws the same picture. */
function crossfade(from: MarkGeometry, to: MarkGeometry, layer: Layer): Draw {
  const paint = (mark: MarkGeometry, opacity?: number): Paint => ({
    ...(mark.outline.closed ? { fill: "mark" } : { stroke: "mark", width: mark.thickness }),
    ...(opacity === undefined ? {} : { opacity })
  });
  let leaving: PathHandle | undefined;
  let coming: PathHandle | undefined;
  return (p) => {
    if (p >= 1) {
      leaving?.remove();
      leaving = undefined;
      if (coming) coming.update(to.outline.d, { opacity: undefined });
      else coming = layer.path(to.outline.d, paint(to));
      return;
    }
    if (coming) {
      leaving?.update(from.outline.d, { opacity: 1 - p });
      coming.update(to.outline.d, { opacity: p });
    } else if (from.outline.closed) {
      leaving = layer.path(from.outline.d, paint(from, 1 - p));
      coming = layer.path(to.outline.d, paint(to, p));
    } else {
      coming = layer.path(to.outline.d, paint(to, p));
      leaving = layer.path(from.outline.d, paint(from, 1 - p));
    }
  };
}

/**
 * Path data for the shape at p: point i is a[i + shiftA] moved toward b[i + shiftB] (indices wrap).
 * The shifts start the path at the same pair whichever mark is `from`, so a run back from 1 - p
 * draws exactly what the run forward drew at p.
 */
function between(a: readonly Point[], b: readonly Point[], shiftA: number, shiftB: number, p: number, closed: boolean): string {
  const n = a.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const from = a[(i + shiftA) % n]!;
    const to = b[(i + shiftB) % n]!;
    d += `${i === 0 ? "M" : "L"}${formatNumber(mix(from.x, to.x, p))},${formatNumber(mix(from.y, to.y, p))}`;
  }
  return closed ? `${d}Z` : d;
}

/**
 * x moved toward y by p, weighted on both sides so that mix(y, x, 1 - p) is the same number: a run
 * back rounds every coordinate as the run forward did, even on a half (36.5625 at 0.001).
 */
const mix = (x: number, y: number, p: number): number => x * (1 - p) + y * p;

/**
 * "drop"'s quarter turn, as [shift into from's samples, shift into to's]: the round mark's point i
 * pairs with the other's point i + n/4, so its first side (a slice's outer arc) meets the other's
 * end side (a column's top). Fixed by the marks' geometry, never by which one is `from`.
 */
function turn(from: MarkGeometry, to: MarkGeometry, points: number): [number, number] {
  const quarter = points / 4;
  const roundFrom = goesRound(from);
  if (roundFrom === goesRound(to)) return [0, 0];
  return roundFrom ? [0, quarter] : [quarter, 0];
}

/**
 * Whether the mark's walk goes round its pivot (a slice does, a bar doesn't): its start, centre and
 * end the same distance from the pivot, give or take 0.5 px, and more than 0.5 px away. The adapter
 * orders a ring of marks with the same test; it reads geometry, not a chart type.
 */
function goesRound(mark: MarkGeometry): boolean {
  const radius = distance(mark.start, mark.pivot);
  return radius > ROUND && Math.abs(distance(mark.center, mark.pivot) - radius) <= ROUND && Math.abs(distance(mark.end, mark.pivot) - radius) <= ROUND;
}

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** `ctx.start` clamped to 0–1; anything else is 0, so a context without one plays it all. */
function startOf(start: unknown): number {
  return typeof start === "number" && start > 0 ? Math.min(1, start) : 0;
}

/** The linear progress at which easeInOutCubic reaches s. */
function unease(s: number): number {
  return s < 0.5 ? Math.cbrt(s / 4) : 1 - Math.cbrt(2 * (1 - s)) / 2;
}

function checkOptions(options: MorphOptions): void {
  const { points, align } = (options ?? {}) as MorphOptions;
  if (points !== undefined && !(Number.isInteger(points) && points >= 4 && points % 4 === 0)) {
    throw new RangeError(`morph: points must be a whole multiple of 4, got ${String(points)}.`);
  }
  if (align !== undefined && !ALIGNS.includes(align)) throw new RangeError(`morph: align must be "unroll" or "drop", got ${typeof align === "string" ? JSON.stringify(align) : String(align)}.`);
}
