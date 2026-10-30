// morph: the transition effect that turns one mark's shape into another's, as the lab's donut turns
// into columns. Both outlines are sampled at the same number of points and each point moves in a
// straight line to its partner. It reads only the two geometries, so it morphs any mark into any
// other: bars, slices and points (closed outlines) and lines (open ones). A line's gaps and a shape's
// holes come through: gaps from the marks' `gaps`, holes from their outlines' path data.

import { easeInOutCubic, linear } from "../core";
import type { Layer, MarkGeometry, Outline, Paint, PathHandle, Point, Rect, TransitionEffect, Tween } from "../core";
import { unease } from "../core/easing";
import { boundsOf, extremes, formatNumber } from "../core/geometry";
import { flattenPath } from "../core/geometry/flatten";
import { loopOutline } from "../core/geometry/outline";
import { parsePath } from "../core/geometry/path";
import { goesRound } from "../core/geometry/ring";

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
   * Default "unroll", picked over "drop" by comparing the two in the morph demo (demo/morph.html).
   */
  readonly align?: MorphAlign;
}

/** The lab's morph: 950 ms base, with transition timing. */
const DURATION = 950;
const POINTS = 160;
const ALIGNS: readonly string[] = ["unroll", "drop"];
/** Two values of t closer than this are one stop on a line. */
const SAME_T = 1e-9;

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
 *   Holes (the subpaths of an outline's `d` other than the longest) morph too: they pair by area,
 *   largest with largest, each sampled at a quarter of `points` from its upper left. One with no
 *   partner shrinks to a point, or grows from one, which moves from its centre to the same place in
 *   the other mark's bounds, so it keeps with the shape. Each is written the other way round from
 *   the outside, so it stays a hole under either fill rule.
 * - **Two open outlines** (lines): both strokes are sampled along their length, and the stroke's
 *   width moves from one thickness to the other. Where either line has `gaps`, the stroke inside a
 *   gap of the old line fades in and inside a gap of the new line fades out, each piece at an
 *   opacity of 1 − ((1 − p) · a + p · b), with p the eased progress and a and b 1 inside the old and
 *   the new line's gap: so nothing is drawn inside a gap both have.
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
  if (!closed) return from.gaps?.length || to.gaps?.length ? gapped(from, to, layer, a, b) : stroke(from, to, layer, a, b);
  const [shiftA, shiftB] = align === "drop" ? turn(from, to, points) : [0, 0];
  const holes = holePairs(from, to, points / 4);
  let path: PathHandle | undefined;
  return (p) => {
    const d = p <= 0 ? from.outline.d : p >= 1 ? to.outline.d : between(a, b, shiftA, shiftB, p, true) + holes.map(([x, y]) => between(x, y, 0, 0, p, true)).join("");
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

/** Where a line's stroke is drawn between two stops: [first stop, last stop]. */
type Run = [first: number, last: number];

/** A point on both lines at one t: the samples', and where a gap begins or ends. */
interface Stop {
  readonly t: number;
  readonly from: Point;
  readonly to: Point;
}

/**
 * Two lines, one with gaps at least: sampled as `stroke` samples them, with a stop where a gap of
 * either begins or ends. The stretch between two stops is inside the old line's gap, the new
 * line's, both or neither, and each of the first three is drawn as one path: fading in, fading out,
 * or at full strength. The stretch inside both isn't drawn. The paths go in the order their first
 * stretches come along the walk, which is the same whichever line is `from`, so a run back from
 * 1 - p draws what the run forward drew at p.
 */
function gapped(from: MarkGeometry, to: MarkGeometry, layer: Layer, a: readonly Point[], b: readonly Point[]): Draw {
  const n = a.length;
  const stops: Stop[] = a.map((point, i) => ({ t: i / (n - 1), from: point, to: b[i]! }));
  for (const gap of [...(from.gaps ?? []), ...(to.gaps ?? [])]) {
    for (const t of gap) {
      if (t > 0 && t < 1 && stops.every((stop) => Math.abs(stop.t - t) > SAME_T)) stops.push({ t, from: from.path(t), to: to.path(t) });
    }
  }
  stops.sort((x, y) => x.t - y.t);
  // By kind: 0 inside neither gap, 1 inside the old line's, 2 inside the new line's. Inside both isn't drawn.
  const runs: Run[][] = [[], [], []];
  for (let k = 0; k + 1 < stops.length; k++) {
    const t = (stops[k]!.t + stops[k + 1]!.t) / 2;
    const kind = (inGap(from, t) ? 1 : 0) + (inGap(to, t) ? 2 : 0);
    if (kind === 3) continue;
    const last = runs[kind]![runs[kind]!.length - 1];
    if (last && last[1] === k) last[1] = k + 1;
    else runs[kind]!.push([k, k + 1]);
  }
  const kinds = [0, 1, 2].filter((kind) => runs[kind]!.length > 0).sort((x, y) => runs[x]![0]![0] - runs[y]![0]![0]);
  const paths: PathHandle[] = [];
  return (p) => {
    const width = p <= 0 ? from.thickness : p >= 1 ? to.thickness : mix(from.thickness, to.thickness, p);
    const opacities = [undefined, p, 1 - p];
    const pieces: [string, number | undefined][] =
      p <= 0 || p >= 1
        ? [[p <= 0 ? from.outline.d : to.outline.d, undefined]]
        : kinds.map((kind) => [runs[kind]!.map((run) => along(stops, run, p)).join(""), opacities[kind]]);
    pieces.forEach(([d, opacity], i) => {
      if (paths[i]) paths[i]!.update(d, { width, opacity });
      else paths[i] = layer.path(d, { stroke: "mark", width, ...(opacity === undefined ? {} : { opacity }) });
    });
    for (const path of paths.splice(pieces.length)) path.remove();
  };
}

/** Whether t is inside one of the mark's gaps. */
const inGap = (mark: MarkGeometry, t: number): boolean => (mark.gaps ?? []).some(([x, y]) => x < t && t < y);

/** Path data for the stops of a run at p. */
function along(stops: readonly Stop[], [first, last]: Run, p: number): string {
  let d = "";
  for (let k = first; k <= last; k++) d += `${k === first ? "M" : "L"}${at(stops[k]!.from, stops[k]!.to, p)}`;
  return d;
}

/** A hole sampled clockwise from its upper left, then written the other way round. */
interface Hole {
  readonly points: readonly Point[];
  readonly area: number;
  /** The centre of its bounds. */
  readonly center: Point;
}

/**
 * Two closed outlines' holes, paired by area, largest with largest. A hole with no partner is paired
 * with one point, every point of it: its centre's place in the other mark's bounds, at the same
 * fractions across and down. So it shrinks to that point or grows from it, and moves as the shape
 * does: a hole that shrank where it was would leave a shape that moves, and be drawn filled.
 */
function holePairs(from: MarkGeometry, to: MarkGeometry, count: number): (readonly [readonly Point[], readonly Point[]])[] {
  const a = holesOf(from.outline, count);
  const b = holesOf(to.outline, count);
  const dot = (hole: Hole, own: Rect, other: Rect): Point[] => new Array<Point>(count).fill(placeIn(hole.center, own, other));
  return Array.from({ length: Math.max(a.length, b.length) }, (_, k) => [a[k]?.points ?? dot(b[k]!, to.bounds, from.bounds), b[k]?.points ?? dot(a[k]!, from.bounds, to.bounds)] as const);
}

/** Where `point` would be in `other`, at the same fractions across and down as it is in `own`: half way along a side `own` has no size along. */
function placeIn(point: Point, own: Rect, other: Rect): Point {
  const fraction = (value: number, start: number, size: number): number => (size > 0 ? (value - start) / size : 0.5);
  return { x: other.x + fraction(point.x, own.x, own.width) * other.width, y: other.y + fraction(point.y, own.y, own.height) * other.height };
}

/**
 * The outline's holes, largest first: the subpaths of its `d` other than the longest, which
 * `sample` goes round. Each is sampled at `count` points from its upper left, as a shape's outline
 * is, and written anticlockwise, the other way round from the outside, as describe.shape writes a
 * D3 ring's: so it stays a hole under either fill rule.
 */
function holesOf(outline: Outline, count: number): Hole[] {
  const loops = flattenPath(parsePath(outline.d))
    .map((subpath) => subpath.segments)
    .filter((segments) => segments.length > 0);
  if (loops.length < 2) return [];
  const lengths = loops.map((loop) => loop.reduce((sum, segment) => sum + segment.length, 0));
  // Of two as long, give or take the path data's rounding, the first: describe.shape writes the longest first.
  let longest = 0;
  lengths.forEach((length, i) => {
    if (length > lengths[longest]! + Math.max(0.01, lengths[longest]! / 1000)) longest = i;
  });
  return loops
    .filter((_, i) => i !== longest)
    .map((loop): Hole => {
      // Four times as many, so every fourth is at k / count along the loop, whatever count is.
      const round = loopOutline([loop]).sample(4 * count);
      const points = round.filter((_, i) => i % 4 === 0);
      const box = boundsOf(loop.flatMap(extremes));
      return { points: [points[0]!, ...points.slice(1).reverse()], area: Math.abs(areaOf(round)), center: { x: box.x + box.width / 2, y: box.y + box.height / 2 } };
    })
    .sort((x, y) => y.area - x.area);
}

/** The area a polygon encloses, signed: more than 0 when it runs clockwise on screen. */
function areaOf(points: readonly Point[]): number {
  let sum = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    sum += p.x * q.y - q.x * p.y;
  });
  return sum / 2;
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
    d += `${i === 0 ? "M" : "L"}${at(a[(i + shiftA) % n]!, b[(i + shiftB) % n]!, p)}`;
  }
  return closed ? `${d}Z` : d;
}

/** A point moved from `from` toward `to` by p, for path data. */
const at = (from: Point, to: Point, p: number): string => `${formatNumber(mix(from.x, to.x, p))},${formatNumber(mix(from.y, to.y, p))}`;

/**
 * x moved toward y by p, weighted on both sides so that mix(y, x, 1 - p) is the same number: a run
 * back rounds every coordinate as the run forward did, even on a half (36.5625 at 0.001).
 */
const mix = (x: number, y: number, p: number): number => x * (1 - p) + y * p;

/**
 * "drop"'s quarter turn, as [shift into from's samples, shift into to's]: the round mark's point i
 * pairs with the other's point i + n/4, so its first side (a slice's outer arc) meets the other's
 * end side (a column's top). Fixed by the marks' geometry, never by which one is `from`: whether a
 * walk goes round its pivot (a slice's does, a bar's doesn't), the test the adapter orders a ring by.
 */
function turn(from: MarkGeometry, to: MarkGeometry, points: number): [number, number] {
  const quarter = points / 4;
  const roundFrom = goesRound(from);
  if (roundFrom === goesRound(to)) return [0, 0];
  return roundFrom ? [0, quarter] : [quarter, 0];
}

/** `ctx.start` clamped to 0–1; anything else is 0, so a context without one plays it all. */
function startOf(start: unknown): number {
  return typeof start === "number" && start > 0 ? Math.min(1, start) : 0;
}

function checkOptions(options: MorphOptions): void {
  const { points, align } = (options ?? {}) as MorphOptions;
  if (points !== undefined && !(Number.isInteger(points) && points >= 4 && points % 4 === 0)) {
    throw new RangeError(`morph: points must be a whole multiple of 4, got ${String(points)}.`);
  }
  if (align !== undefined && !ALIGNS.includes(align)) throw new RangeError(`morph: align must be "unroll" or "drop", got ${typeof align === "string" ? JSON.stringify(align) : String(align)}.`);
}
