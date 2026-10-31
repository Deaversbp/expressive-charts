// morph: the transition effect that turns one mark's shape into another's, as the lab's donut turns
// into columns. Both outlines are sampled at the same number of points and each point moves in a
// straight line to its partner; two lines that each run one way across x pair by x instead. It reads
// only the two geometries, so it morphs any mark into any other: bars, slices and points (closed
// outlines) and lines (open ones). A line's gaps and a shape's holes come through: gaps from the
// marks' `gaps`, holes from their outlines' path data.

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
  /**
   * Points sampled on each outline, a whole multiple of 4 (a quarter on each side of a closed one).
   * Default 160, the lab's 40 a side. Two lines that pair by x are sampled at this many shares
   * evenly across, and at each vertex.
   */
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
/**
 * Two stops of lines that pair by x closer than this, in px across the wider line, are one. Path data
 * is written to 0.001 px, so two lines over the same x's in plots of two widths have their vertices,
 * and their gaps' ends, about that far apart as shares.
 */
const SAME_X = 0.01;
/**
 * The most vertices of a line that pairs by x taken as stops, so that a frame of two ten-year daily
 * lines takes well under a millisecond more than with 160 points (measured for M12 step 2).
 */
const VERTICES = 1000;
/** Points across and down the bounds where a hole with no partner may land, when its own place won't do. */
const GRID = 9;
/** Times on a hole's way to closing, or from opening, at which it's checked to be inside the shape. */
const CHECKS = 8;

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
 *   partner closes by half way, or opens after it, while its centre heads for where it lands in the
 *   other mark: its centre's place in the other's bounds, or the deepest point of its filled area
 *   where that place is outside it or near its edge. Where it would leave the shape on the way, it
 *   closes sooner, as soon as a sixteenth of the way. Each is written the other way round from the
 *   outside, so it stays a hole under either fill rule.
 * - **Two lines that each run one way across x** (every vertex's x more than the one before, or
 *   every one less, the same way for both) pair by x: the point a share of the way across one
 *   line's x span moves to the point that share across the other's. They're sampled at `points`
 *   shares evenly across, and at each vertex of either line, which is where each gap begins and
 *   ends: so the first and last frames are the lines' own polylines, corners and all, and two lines
 *   missing the same x's have their gaps in the same place.
 * - **Any other two open outlines** (lines): both strokes are sampled along their length.
 * - Either way, the stroke's width moves from one thickness to the other. Where either line has
 *   `gaps`, the stroke inside a gap of the old line fades in and inside a gap of the new line fades
 *   out, each piece at an opacity of 1 − ((1 − p) · a + p · b), with p the eased progress and a and
 *   b 1 inside the old and the new line's gap: so nothing is drawn inside a gap both have.
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
  const across = closed ? undefined : acrossX(from, to, points);
  if (across) return piecewise(from, to, layer, across.stops, across.kinds);
  const a = from.outline.sample(points);
  const b = to.outline.sample(points);
  if (!closed) return from.gaps?.length || to.gaps?.length ? gapped(from, to, layer, a, b) : stroke(from, to, layer, a, b);
  const [shiftA, shiftB] = align === "drop" ? turn(from, to, points) : [0, 0];
  const holes = holePairs(from, to, a, b, [shiftA, shiftB], points / 4);
  let path: PathHandle | undefined;
  return (p) => {
    const d = p <= 0 ? from.outline.d : p >= 1 ? to.outline.d : between(a, b, shiftA, shiftB, p, true) + holes.map((hole) => holeAt(hole, p)).join("");
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

/** A point on both lines at one t, or one share across: the samples', and where a gap begins or ends. */
interface Stop {
  readonly t: number;
  readonly from: Point;
  readonly to: Point;
}

/**
 * Two lines, one with gaps at least: sampled as `stroke` samples them, with a stop where a gap of
 * either begins or ends, and drawn in pieces between the stops.
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
  const kinds = stops.slice(1).map((stop, k) => {
    const t = (stops[k]!.t + stop.t) / 2;
    return (inGap(from, t) ? 1 : 0) + (inGap(to, t) ? 2 : 0);
  });
  return piecewise(from, to, layer, stops, kinds);
}

/**
 * Two lines drawn between stops. The stretch from stop k to the next is of kind k: 0 inside neither
 * line's gap, 1 inside the old line's, 2 inside the new line's, 3 inside both. Each of the first
 * three is drawn as one path: at full strength, fading in or fading out. The stretch inside both
 * isn't drawn. The paths go in the order their first stretches come along the walk, which is the
 * same whichever line is `from`, so a run back from 1 - p draws what the run forward drew at p.
 */
function piecewise(from: MarkGeometry, to: MarkGeometry, layer: Layer, stops: readonly Stop[], kinds: readonly number[]): Draw {
  const runs: Run[][] = [[], [], []];
  for (let k = 0; k < kinds.length; k++) {
    const kind = kinds[k]!;
    if (kind === 3) continue;
    const last = runs[kind]![runs[kind]!.length - 1];
    if (last && last[1] === k) last[1] = k + 1;
    else runs[kind]!.push([k, k + 1]);
  }
  const order = [0, 1, 2].filter((kind) => runs[kind]!.length > 0).sort((x, y) => runs[x]![0]![0] - runs[y]![0]![0]);
  const paths: PathHandle[] = [];
  return (p) => {
    const width = p <= 0 ? from.thickness : p >= 1 ? to.thickness : mix(from.thickness, to.thickness, p);
    const opacities = [undefined, p, 1 - p];
    const pieces: [string, number | undefined][] =
      p <= 0 || p >= 1
        ? [[p <= 0 ? from.outline.d : to.outline.d, undefined]]
        : order.map((kind) => [runs[kind]!.map((run) => along(stops, run, p)).join(""), opacities[kind]]);
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

/** Stretches of a line as shares of the way across its x span: [from, to]. */
type Shares = readonly (readonly [from: number, to: number])[];

/**
 * A line that runs one way across x: its vertices in the order its walk goes through them, each
 * one's share of the way from the first's x to the last's, its gaps as shares, its span, and which
 * way it runs, 1 to the right or -1 to the left.
 */
interface Course {
  readonly points: readonly Point[];
  readonly shares: readonly number[];
  readonly gaps: Shares;
  /** px from the first vertex's x to the last's. */
  readonly span: number;
  readonly way: number;
}

/**
 * Two lines that each run one way across x, the same way, paired by x: stops at `points` shares
 * evenly across, and at each vertex of either line, every gap's ends among them. Each stop's points
 * are each line's at that share of its own span, so the ends pair with the ends, and two lines over
 * the same x's pair each x with the same x. Shares within `SAME_X` of a stop's first are that stop,
 * at each line's own vertex where it has one there, so a vertex of each in the same place, as path
 * data has it, pair exactly. A stop takes one vertex of each line at most: another of the same line
 * starts a stop of its own, so no vertex is lost to a neighbour however close. Each stretch between
 * two stops is of the kind its middles are, inside either line's gaps or not. Undefined for any other
 * two lines.
 */
function acrossX(from: MarkGeometry, to: MarkGeometry, points: number): { stops: Stop[]; kinds: number[] } | undefined {
  const a = courseOf(from);
  const b = a && courseOf(to);
  if (!a || !b || a.way !== b.way) return undefined;
  // Each share, and whose it is: 0 an even share, 1 the old line's vertex, 2 the new line's.
  const all: [share: number, whose: number][] = [
    ...Array.from({ length: points }, (_, i): [number, number] => [i / (points - 1), 0]),
    ...corners(a).map((s): [number, number] => [s, 1]),
    ...corners(b).map((s): [number, number] => [s, 2])
  ].sort((x, y) => x[0] - y[0]);
  const same = SAME_X / Math.max(Math.abs(a.span), Math.abs(b.span));
  // Each stop's first share, and the old and the new line's own vertex's, where it has one.
  const merged: [first: number, a?: number, b?: number][] = [];
  for (const [s, whose] of all) {
    let stop = merged[merged.length - 1];
    if (!stop || s - stop[0] > same || (whose > 0 && stop[whose] !== undefined)) merged.push((stop = [s]));
    if (whose === 1) stop[1] ??= s;
    if (whose === 2) stop[2] ??= s;
  }
  const last = merged.length - 1;
  if (last < 1) return undefined;
  // Each line's share at each stop, the ends at its own ends.
  const shareOn = (whose: 1 | 2): number[] => merged.map((stop, k) => (k === 0 ? 0 : k === last ? 1 : (stop[whose] ?? stop[0])));
  const [onA, onB] = [shareOn(1), shareOn(2)];
  const [pointsA, pointsB] = [placed(a, onA), placed(b, onB)];
  const stops = merged.map(([t], k): Stop => ({ t, from: pointsA[k]!, to: pointsB[k]! }));
  const [inA, inB] = [inside(a.gaps), inside(b.gaps)];
  const kinds = stops.slice(1).map((_, k) => (inA((onA[k]! + onA[k + 1]!) / 2) ? 1 : 0) + (inB((onB[k]! + onB[k + 1]!) / 2) ? 2 : 0));
  return { stops, kinds };
}

/**
 * The line as it runs across x, when every vertex's x is more than the one before, or every one
 * less: its outline's vertices, and each value alone between two gaps, which the outline doesn't
 * draw, from its walk. Each stretch with data that has length is the outline's next subpath.
 * Undefined for any other line, a line with an arc, or one of a single point.
 */
function courseOf(mark: MarkGeometry): Course | undefined {
  const subpaths = flattenPath(parsePath(mark.outline.d));
  const points: Point[] = [];
  /** Where each gap starts: it runs from that vertex to the next. */
  const before: number[] = [];
  let next = 0;
  let from = 0;
  const stretch = (to: number): boolean => {
    if (!(to > from)) {
      points.push(mark.path(from));
      return true;
    }
    const subpath = subpaths[next++];
    if (!subpath) return false;
    points.push(subpath.start);
    for (const segment of subpath.segments) {
      if (segment.kind !== "line") return false;
      points.push(segment.to);
    }
    return true;
  };
  for (const [start, end] of mark.gaps ?? []) {
    if (!stretch(start)) return undefined;
    before.push(points.length - 1);
    from = end;
  }
  if (!stretch(1) || next < subpaths.length || points.length < 2) return undefined;
  const x0 = points[0]!.x;
  const span = points[points.length - 1]!.x - x0;
  const way = Math.sign(span);
  for (let i = 1; i < points.length; i++) if (!((points[i]!.x - points[i - 1]!.x) * way > 0)) return undefined;
  const shares = points.map((point) => (point.x - x0) / span);
  return { points, shares, gaps: before.map((i) => [shares[i]!, shares[i + 1]!] as const), span, way };
}

/**
 * The shares of the line's vertices that are stops: all of them, up to `VERTICES`. A line with more,
 * a dense one, keeps the first, last, highest and lowest in each of `VERTICES / 4` columns across
 * its span, so its peaks and dips stay where they are, and every gap's ends.
 */
function corners(course: Course): readonly number[] {
  const { points, shares, gaps } = course;
  if (points.length <= VERTICES) return shares;
  const columns = VERTICES / 4;
  const column = (k: number): number => Math.min(columns - 1, Math.floor(shares[k]! * columns));
  const kept: number[] = gaps.flat();
  for (let first = 0, i = 1; i <= points.length; i++) {
    if (i < points.length && column(i) === column(first)) continue;
    let [low, high] = [first, first];
    for (let k = first; k < i; k++) {
      if (points[k]!.y < points[low]!.y) low = k;
      if (points[k]!.y > points[high]!.y) high = k;
    }
    kept.push(shares[first]!, shares[low]!, shares[high]!, shares[i - 1]!);
    first = i;
  }
  // A vertex that's two of those, or a gap's end, once.
  return Array.from(new Set(kept));
}

/** The line's points at each share, in order: on the straight piece between the vertices either side. */
function placed(course: Course, shares: readonly number[]): Point[] {
  const { points, shares: at } = course;
  let i = 0;
  return shares.map((s) => {
    while (i + 2 < points.length && at[i + 1]! <= s) i++;
    const width = at[i + 1]! - at[i]!;
    return mixed(points[i]!, points[i + 1]!, width > 0 ? Math.min(1, Math.max(0, (s - at[i]!) / width)) : 0);
  });
}

/** Whether a share is inside one of the stretches, asked of shares in order. */
function inside(gaps: Shares): (s: number) => boolean {
  let k = 0;
  return (s) => {
    while (k < gaps.length && gaps[k]![1] <= s) k++;
    return k < gaps.length && gaps[k]![0] < s;
  };
}

/** A hole sampled clockwise from its upper left, then written the other way round. */
interface Hole {
  readonly points: readonly Point[];
  readonly area: number;
  /** The centre of its bounds. */
  readonly center: Point;
  /** Half the larger side of its bounds. */
  readonly size: number;
}

/**
 * A hole's points and their partners, and the share of the run it takes: a pair morphs all the way,
 * and a hole with no partner closes by `end`, or opens from `1 - end` when it's `to`'s.
 */
interface HolePair {
  readonly from: readonly Point[];
  readonly to: readonly Point[];
  readonly end?: number;
  readonly opens?: boolean;
}

/**
 * Two closed outlines' holes, paired by area, largest with largest, given each outline's samples and
 * their shifts as drawn. A hole with no partner is paired with one point, every point of it, which its
 * centre would reach on its way to where it lands in the other mark (`landing`) when it closes, or
 * opens (`closing`). So it keeps with the shape as it moves, and each point still moves in a straight
 * line. Both are worked out from the hole's own mark, whichever is `from`, so a run back retraces.
 */
function holePairs(from: MarkGeometry, to: MarkGeometry, a: readonly Point[], b: readonly Point[], [shiftA, shiftB]: readonly [number, number], count: number): HolePair[] {
  const holesA = holesOf(from.outline, count);
  const holesB = holesOf(to.outline, count);
  const both = Math.min(holesA.length, holesB.length);
  const pairs: HolePair[] = holesA.slice(0, both).map((hole, k) => ({ from: hole.points, to: holesB[k]!.points }));
  // Only one side has holes with no partner: the hole's own mark and samples first, then the other's.
  const closes = holesA.length > holesB.length;
  const [ownHoles, otherHoles, other, own, theirs, ownShift, otherShift] = closes
    ? [holesA, holesB, to, a, b, shiftA, shiftB]
    : [holesB, holesA, from, b, a, shiftB, shiftA];
  const n = own.length;
  const outside = own.map((_, i): Path => [own[(i + ownShift) % n]!, theirs[(i + otherShift) % n]!]);
  const inner = ownHoles.slice(0, both).map((hole, k) => hole.points.map((p, i): Path => [p, otherHoles[k]!.points[i]!]));
  const area = [theirs, ...otherHoles.map((hole) => hole.points)];
  for (const hole of ownHoles.slice(both)) {
    const { end, point } = closing(hole, landing(hole, (closes ? from : to).bounds, other, area), outside, inner);
    const dot = new Array<Point>(count).fill(point);
    pairs.push(closes ? { from: hole.points, to: dot, end } : { from: dot, to: hole.points, end, opens: true });
  }
  return pairs;
}

/** A point's way through a morph, from its own mark's place to its partner's. */
type Path = readonly [own: Point, other: Point];

/**
 * When a hole with no partner has closed, as a share of the run from its own mark, and the point it
 * closes to: by half way, while its centre goes from where it is toward where it lands, or a half,
 * a quarter or an eighth of that where on the way some point of it would leave the shape, which it
 * can't follow: checked at each eighth of the way. A sixteenth of the way where none of those will do.
 */
function closing(hole: Hole, there: Point, outside: readonly Path[], inner: readonly (readonly Path[])[]): { end: number; point: Point } {
  let end = 0.5;
  while (end > 1 / 16 && !stays(hole, mixed(hole.center, there, end), end, outside, inner)) end /= 2;
  return { end, point: mixed(hole.center, there, end) };
}

/** Whether every point of the hole is inside the shape at each check on its way to `point` by `end`. */
function stays(hole: Hole, point: Point, end: number, outside: readonly Path[], inner: readonly (readonly Path[])[]): boolean {
  for (let j = 1; j < CHECKS; j++) {
    const t = (end * j) / CHECKS;
    const at = (path: Path): Point => mixed(path[0], path[1], t);
    const area = [outside.map(at), ...inner.map((ring) => ring.map(at))];
    if (hole.points.some((p) => windingAt(mixed(p, point, j / CHECKS), area) === 0)) return false;
  }
  return true;
}

/** Path data for a hole at p: none once a hole with no partner has closed, or before it opens. */
function holeAt({ from, to, end, opens }: HolePair, p: number): string {
  if (end === undefined) return between(from, to, 0, 0, p, true);
  const q = opens ? (p - (1 - end)) / end : p / end;
  return (opens ? q <= 0 : q >= 1) ? "" : between(from, to, 0, 0, q, true);
}

const mixed = (a: Point, b: Point, t: number): Point => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });

/** A mark's filled area as polygons: its outside, clockwise, and its holes, the other way round. */
type Area = readonly (readonly Point[])[];

/**
 * Where a hole with no partner lands in the other mark. Its centre's place in the other's bounds, at the
 * same fractions across and down, when that's inside the other's filled area by a quarter of the hole's
 * size or more: so the hole keeps with the shape as it moves, where one that closed where it was would
 * leave it, and be drawn filled. Otherwise, as in a slice whose bounds' middle is outside it, the
 * deepest of the other's centre and a grid across its bounds.
 */
function landing(hole: Hole, own: Rect, other: MarkGeometry, area: Area): Point {
  const place = placeIn(hole.center, own, other.bounds);
  if (depth(place, area) >= hole.size / 4) return place;
  const { x, y, width, height } = other.bounds;
  let best = other.center;
  let deepest = depth(best, area);
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const point = { x: x + (width * (i + 0.5)) / GRID, y: y + (height * (j + 0.5)) / GRID };
      const d = depth(point, area);
      if (d > deepest) [best, deepest] = [point, d];
    }
  }
  return best;
}

/** How far inside the filled area a point is: its distance to the nearest edge, or 0 when it's outside. */
function depth(point: Point, area: Area): number {
  if (windingAt(point, area) === 0) return 0;
  let nearest = Infinity;
  for (const ring of area) {
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length]!;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const u = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - p.x) * dx + (point.y - p.y) * dy) / (dx * dx + dy * dy)));
      nearest = Math.min(nearest, Math.hypot(point.x - p.x - u * dx, point.y - p.y - u * dy));
    });
  }
  return nearest;
}

/** The area's winding number round a point: 0 outside it and in its holes. */
function windingAt(point: Point, area: Area): number {
  let winding = 0;
  for (const ring of area) {
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length]!;
      const side = (q.x - p.x) * (point.y - p.y) - (point.x - p.x) * (q.y - p.y);
      if (p.y <= point.y && q.y > point.y && side > 0) winding++;
      else if (p.y > point.y && q.y <= point.y && side < 0) winding--;
    });
  }
  return winding;
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
      return {
        points: [points[0]!, ...points.slice(1).reverse()],
        area: Math.abs(areaOf(round)),
        center: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        size: Math.max(box.width, box.height) / 2
      };
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
