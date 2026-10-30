// A <path> read as a ring's slice (M11 step 4): one circular arc with two straight sides through its
// centre (a pie's slice), two arcs about one centre, one each way, joined along radii (a donut's), or
// a whole ring, as d3.arc() draws them. expressive() describes it with describe.arc, so effects treat
// it as our donut's slices, and a ring of them is ordered clockwise. Anything else stays a shape: a
// donut's slice with a pad angle (its sides aren't along radii), rounded corners (more arcs, about
// other centres), an elliptical arc, or a matrix that doesn't keep circles.
//
// It's read in the path's own coordinates, where a host writes its arcs' radii as it means them, and
// then moved through the matrix, so a browser's rounding in a turned group's CTM doesn't make the
// arcs ellipses. The centre comes from the points the path is written through, never from an arc's
// own centre: a host rounds its numbers, and an arc's centre, worked out from its ends and radius, is
// unsure by far more than that when the arc is a fraction of a px long, or half a turn.

import type { Matrix, Point } from "../../core";
import { matrix } from "../../core";
import { flattenPath, type Subpath } from "../../core/geometry/flatten";
import type { PathCommand } from "../../core/geometry/path";
import { normalizeAngle, pointOn, TAU, type ArcSegment, type PathSegment } from "../../core/geometry/segment";
import { keepsCircles, scaleOf } from "./space";

/** describe.arc's spec for a slice, in the marks' px: angles in d3.pie()'s convention, radians from 12 o'clock, clockwise. */
export interface SliceSpec {
  readonly cx: number;
  readonly cy: number;
  readonly inner: number;
  readonly outer: number;
  readonly start: number;
  readonly end: number;
}

/** px in the marks' coordinates: how closely the path must follow the slice it's read as. */
const NEAR = 0.5;
/**
 * The most commands a slice is read from: d3.arc() writes a whole ring in 7 and a slice in 5, so this
 * leaves room for arcs written in pieces, and a long curve isn't flattened a second time to find out.
 */
const MOST = 32;

/** A stretch of a subpath: a straight piece, or arcs one after another of one radius, the same way round. */
type Run =
  | { readonly kind: "line"; readonly from: Point; readonly to: Point }
  | {
      readonly kind: "arc";
      readonly arcs: readonly ArcSegment[];
      readonly from: Point;
      readonly to: Point;
      readonly radius: number;
      /** Signed, positive clockwise on screen: the arcs' sweeps added up. */
      readonly sweep: number;
    };
type ArcRun = Extract<Run, { kind: "arc" }>;

/**
 * The slice a path draws, through `m`, or undefined when it isn't one within 0.5 px. `commands` are
 * the path's own, as parsePath reads them.
 */
export function sliceOf(commands: readonly PathCommand[], m: Matrix): SliceSpec | undefined {
  const scale = scaleOf(m);
  // A slice's edges are arcs and straight sides: a Bézier makes it a shape.
  if (!keepsCircles(m) || !(scale > 0) || commands.length > MOST || commands.some((command) => command.op === "C" || command.op === "Q")) return undefined;
  /** NEAR in the path's own units. */
  const near = NEAR / scale;
  const subpaths = flattenPath(commands);
  if (subpaths.length === 0 || subpaths.length > 2 || !subpaths.every(closes)) return undefined;
  const runs = subpaths.map((subpath) => runsOf(subpath.segments, near));
  const own = subpaths.length === 2 ? ring(runs[0]!, runs[1]!, near) : slice(runs[0]!, near);
  return own && moved(own, m);
}

/** A slice in the path's own coordinates: its centre, radii, and the outer edge's start (a screen angle) and sweep. */
interface Own {
  readonly center: Point;
  readonly inner: number;
  readonly outer: number;
  readonly start: number;
  readonly sweep: number;
}

/** A whole ring: two whole circles about one centre, one each way. Where each starts doesn't matter. */
function ring(a: readonly Run[], b: readonly Run[], near: number): Own | undefined {
  const [first, second] = [a[0], b[0]];
  if (a.length !== 1 || b.length !== 1 || first?.kind !== "arc" || second?.kind !== "arc") return undefined;
  const [outer, inner] = first.radius >= second.radius ? [first, second] : [second, first];
  const center = centerOf(outer);
  if (!center) return undefined;
  const [r1, r0] = [distance(outer.from, center), distance(inner.from, center)];
  const [t1, t0] = [turnOf(outer, center), turnOf(inner, center)];
  const whole = (turn: number, radius: number): boolean => Math.abs(Math.abs(turn) - TAU) * radius <= near;
  const fits =
    r1 > near && r1 - r0 > near && Math.sign(t1) !== Math.sign(t0) && whole(t1, r1) && whole(t0, r0) && onCircle(outer, center, r1, near) && onCircle(inner, center, r0, near);
  return fits ? { center, inner: r0, outer: r1, start: angleOf(outer.from, center), sweep: Math.sign(t1) * TAU } : undefined;
}

/**
 * A pie's slice (an arc, then sides to its centre and back) or a donut's (an arc, a side, an arc back,
 * a side). A donut's slice so thin that its inner arc rounds away to a point has a pie's form, and
 * is read as a donut's by where that point is.
 */
function slice(runs: readonly Run[], near: number): Own | undefined {
  // From the outer arc, the one furthest out.
  let first = -1;
  runs.forEach((run, i) => {
    if (run.kind === "arc" && (first < 0 || run.radius > (runs[first] as ArcRun).radius)) first = i;
  });
  if (first < 0) return undefined;
  const cycle = [...runs.slice(first), ...runs.slice(0, first)];
  const outer = cycle[0] as ArcRun;
  const [, side, third, fourth] = cycle;
  const pie = cycle.length === 3 && side?.kind === "line" && third?.kind === "line";
  const back = cycle.length === 4 && side?.kind === "line" && third?.kind === "arc" && fourth?.kind === "line" ? third : undefined;
  if (!pie && !back) return undefined;
  /** The inner corners, at the end angle and at the start. */
  const [inEnd, inStart] = back ? [back.from, back.to] : [side!.to, side!.to];
  // Each side runs along a radius, so the centre is the outer radius on from its outer end, toward
  // its inner one, however narrow the slice.
  const toward = (from: Point, to: Point): Point | undefined => {
    const length = distance(from, to);
    return length > near ? { x: from.x + ((to.x - from.x) * outer.radius) / length, y: from.y + ((to.y - from.y) * outer.radius) / length } : undefined;
  };
  const a = toward(outer.from, inStart);
  const b = toward(outer.to, inEnd);
  if (!a || !b) return undefined;
  let center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // A pie's sides meet at its centre.
  if (pie && distance(inEnd, center) <= near) center = inEnd;
  const inner = center === inEnd ? 0 : (distance(inEnd, center) + distance(inStart, center)) / 2;
  const sweep = turnOf(outer, center);
  if (sweep === 0) return undefined;
  const own = { center, inner, outer: (distance(outer.from, center) + distance(outer.to, center)) / 2, start: angleOf(outer.from, center), sweep };
  return checked(own, outer, back, [inEnd, inStart], near) ? own : undefined;
}

/**
 * Whether the path is the slice within `near`: its outer arc runs between the slice's outer corners
 * on its circle, its inner corners are the slice's (a pie's are its centre, which `own` is from), and
 * the inner arc, if it has one, goes back between them on its circle.
 */
function checked(own: Own, outer: ArcRun, back: ArcRun | undefined, [inEnd, inStart]: readonly [Point, Point], near: number): boolean {
  const { center, start, sweep } = own;
  const at = (radius: number, angle: number): Point => ({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  return (
    own.outer > near &&
    own.outer - own.inner > near &&
    distance(outer.from, at(own.outer, start)) <= near &&
    distance(outer.to, at(own.outer, start + sweep)) <= near &&
    onCircle(outer, center, own.outer, near) &&
    distance(inEnd, at(own.inner, start + sweep)) <= near &&
    distance(inStart, at(own.inner, start)) <= near &&
    (!back || (Math.abs(turnOf(back, center) + sweep) * own.inner <= near && onCircle(back, center, own.inner, near)))
  );
}

/**
 * How far a run turns about `center`: each arc's turn there, the way round its own sweep says. So a
 * half turn's own sweep, as unsure as its centre, only picks the way.
 */
function turnOf(run: ArcRun, center: Point): number {
  let turn = 0;
  for (const arc of run.arcs) {
    const step = normalizeAngle(angleOf(pointOn(arc, 1), center) - angleOf(pointOn(arc, 0), center));
    turn += step + TAU * Math.round((arc.sweep - step) / TAU);
  }
  return turn;
}

/**
 * A whole circle's centre, from the points its arcs are written between: halfway between two, as
 * d3 writes a circle in two half turns, or through three spread round it.
 */
function centerOf(run: ArcRun): Point | undefined {
  const points = [run.from, ...run.arcs.slice(0, -1).map((arc) => pointOn(arc, 1))];
  if (points.length < 2) return undefined;
  if (points.length === 2) return { x: (points[0]!.x + points[1]!.x) / 2, y: (points[0]!.y + points[1]!.y) / 2 };
  const [p, q, r] = [points[0]!, points[Math.floor(points.length / 3)]!, points[Math.floor((2 * points.length) / 3)]!];
  const d = 2 * (p.x * (q.y - r.y) + q.x * (r.y - p.y) + r.x * (p.y - q.y));
  if (!(Math.abs(d) > 0)) return undefined;
  const [pp, qq, rr] = [p, q, r].map(({ x, y }) => x * x + y * y) as [number, number, number];
  return { x: (pp * (q.y - r.y) + qq * (r.y - p.y) + rr * (p.y - q.y)) / d, y: (pp * (r.x - q.x) + qq * (p.x - r.x) + rr * (q.x - p.x)) / d };
}

/** Whether a run's radius, and each of its arcs at its ends and its middle, is within `near` of the circle. */
const onCircle = (run: ArcRun, center: Point, radius: number, near: number): boolean =>
  Math.abs(run.radius - radius) <= near && run.arcs.every((arc) => [0, 0.5, 1].every((u) => Math.abs(distance(pointOn(arc, u), center) - radius) <= near));

/** The slice moved through `m` into the marks' px, in describe.arc's terms, its numbers rounded as a circle's are. */
function moved(own: Own, m: Matrix): SliceSpec {
  const scale = scaleOf(m);
  const center = matrix.apply(m, own.center);
  const corner = matrix.apply(m, { x: own.center.x + own.outer * Math.cos(own.start), y: own.center.y + own.outer * Math.sin(own.start) });
  // A flip turns the other way round.
  const sweep = m[0] * m[3] - m[1] * m[2] < 0 ? -own.sweep : own.sweep;
  // d3 measures from 12 o'clock, a screen angle from 3 o'clock.
  let start = (((angleOf(corner, center) + Math.PI / 2) % TAU) + TAU) % TAU;
  if (start > TAU - 1e-9) start = 0;
  return { cx: round(center.x), cy: round(center.y), inner: round(own.inner * scale), outer: round(own.outer * scale), start, end: start + sweep };
}

/**
 * The subpath's segments as runs: arcs one after another of one radius, the same way round, are one,
 * across its start too. Whether they're on one circle is checked once the centre is known.
 */
function runsOf(segments: readonly PathSegment[], near: number): Run[] {
  const runs: Run[] = [];
  const join = (run: ArcRun | undefined, arc: ArcSegment): boolean => run !== undefined && Math.sign(run.sweep) === Math.sign(arc.sweep) && Math.abs(run.radius - arc.radius) <= near;
  for (const segment of segments) {
    const last = runs[runs.length - 1];
    if (segment.kind === "line") runs.push({ kind: "line", from: segment.from, to: segment.to });
    else if (last?.kind === "arc" && join(last, segment)) runs[runs.length - 1] = { ...last, arcs: [...last.arcs, segment], to: pointOn(segment, 1), sweep: last.sweep + segment.sweep };
    else runs.push({ kind: "arc", arcs: [segment], from: pointOn(segment, 0), to: pointOn(segment, 1), radius: segment.radius, sweep: segment.sweep });
  }
  const [head] = runs;
  const tail = runs[runs.length - 1];
  if (runs.length > 1 && head?.kind === "arc" && tail?.kind === "arc" && tail.arcs.every((arc) => join(head, arc))) {
    runs[0] = { ...head, arcs: [...tail.arcs, ...head.arcs], from: tail.from, sweep: tail.sweep + head.sweep };
    runs.pop();
  }
  return runs;
}

/** Whether a subpath closes, as describe.shape reads it: with Z, or back where it started. */
const closes = ({ closed, start, end }: Subpath): boolean => closed || (start.x === end.x && start.y === end.y);

/** The screen angle of `point` about `center`: 0 along +x, clockwise on screen. */
const angleOf = (point: Point, center: Point): number => Math.atan2(point.y - center.y, point.x - center.x);

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** px, rounded to 0.001 as a circle's centre and radius are, with no -0. */
const round = (value: number): number => Math.round(value * 1000) / 1000 + 0;
