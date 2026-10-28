// Path commands as walk segments: straight pieces and circular arcs. Béziers and arcs that aren't
// circular become straight pieces within 0.1 px of the curve, so any path data can be walked.

import type { Point } from "../contracts/geometry";
import type { PathCommand } from "./path";
import { arc, line, TAU, type PathSegment } from "./segment";

/** px: the most a straight piece strays from the curve it stands for. */
export const FLAT = 0.1;
/** Pieces one curve can become, so a curve millions of px across can't make millions of them. */
const MAX_PIECES = 10_000;

/**
 * One subpath: where it starts and ends, as written, its segments in order (none with no length),
 * and whether it ends with Z, which ends it where it started.
 */
export interface Subpath {
  readonly start: Point;
  readonly end: Point;
  readonly segments: readonly PathSegment[];
  readonly closed: boolean;
}

/**
 * The subpaths of absolute path commands, as `parsePath` gives them. A new subpath starts at each
 * move, and at a command after a Z, from where the Z closed. A move with nothing after it before the
 * next move, or the end, draws nothing and is left out.
 */
export function flattenPath(commands: readonly PathCommand[]): Subpath[] {
  const subpaths: Subpath[] = [];
  let start: Point | undefined;
  let pen: Point = { x: 0, y: 0 };
  let segments: PathSegment[] = [];
  let open = false;
  const finish = (closed: boolean): void => {
    if (open) subpaths.push({ start: start!, end: pen, segments, closed });
    segments = [];
    open = false;
  };
  const to = (point: Point): void => {
    if (!open) {
      start = pen;
      open = true;
    }
    pen = point;
  };
  // A piece with no length draws nothing. One that isn't finite is kept, for describe.shape to find.
  const push = (segment: PathSegment): void => {
    if (segment.length !== 0) segments.push(segment);
  };
  const straight = (a: Point, b: Point): void => push(line(a, b));
  const through = (points: readonly Point[]): void => {
    for (let k = 1; k < points.length; k++) straight(points[k - 1]!, points[k]!);
  };

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i]!;
    const from = pen;
    switch (command.op) {
      case "M":
        finish(false);
        pen = command.to;
        // A move followed by a drawing command starts a subpath there.
        if (commands[i + 1] && commands[i + 1]!.op !== "M") {
          start = pen;
          open = true;
        }
        break;
      case "Z":
        to(start ?? pen);
        straight(from, pen);
        finish(true);
        break;
      case "L":
        to(command.to);
        straight(from, pen);
        break;
      case "C":
        to(command.to);
        through(bezier(from, command.c1, command.c2, command.to));
        break;
      case "Q":
        to(command.to);
        through(bezier(from, command.c, command.to));
        break;
      case "A":
        to(command.to);
        for (const segment of arcSegments(from, command)) push(segment);
        break;
    }
  }
  finish(false);
  return subpaths;
}

/**
 * The points of a quadratic or cubic Bézier at equal steps of its parameter, ends included, enough
 * that the straight pieces between them stay within FLAT of it. Between steps h apart, a piece strays
 * at most h²/8 times the curve's largest second derivative, which is 2|P0 − 2P1 + P2| for a quadratic
 * and 6 times the larger of |P0 − 2P1 + P2| and |P1 − 2P2 + P3| for a cubic.
 */
function bezier(...p: Point[]): Point[] {
  const cubic = p.length === 4;
  const n = cubic ? cubicPieces(p[0]!, p[1]!, p[2]!, p[3]!) : pieces(1, 2 * bend(p[0]!, p[1]!, p[2]!));
  const points = [p[0]!];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const s = 1 - t;
    const [a, b, c, d] = cubic ? [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t] : [s * s, 2 * s * t, t * t, 0];
    points.push({
      x: a * p[0]!.x + b * p[1]!.x + c * p[2]!.x + (cubic ? d * p[3]!.x : 0),
      y: a * p[0]!.y + b * p[1]!.y + c * p[2]!.y + (cubic ? d * p[3]!.y : 0)
    });
  }
  points.push(p[p.length - 1]!);
  return points;
}

/**
 * How many equal steps of its parameter a cubic Bézier takes for the straight pieces between them to
 * stay within FLAT of it: at least 1, as bezier() flattens it. Internal: the line chart's curve
 * flattens its pieces by it too (src/charts/curve.ts).
 */
export function cubicPieces(p0: Point, p1: Point, p2: Point, p3: Point): number {
  return pieces(1, 6 * Math.max(bend(p0, p1, p2), bend(p1, p2, p3)));
}

/** |a − 2b + c|: how far b is from halfway between a and c, twice over. */
function bend(a: Point, b: Point, c: Point): number {
  return Math.hypot(a.x - 2 * b.x + c.x, a.y - 2 * b.y + c.y);
}

/** Pieces for a parameter that runs `span`, with the curve's second derivative at most `second`: see bezier(). */
function pieces(span: number, second: number): number {
  const n = Math.ceil(span * Math.sqrt(second / (8 * FLAT)));
  return Number.isFinite(n) ? Math.min(MAX_PIECES, Math.max(1, n)) : MAX_PIECES;
}

/** Radii this close, relative to the larger, are equal: a circle moved through a matrix comes out so. */
const ROUND = 1e-9;

/**
 * An SVG arc from `from` (SVG 1.1, F.6.5 and F.6.6): no segment when its ends are the same point, a
 * straight piece when a radius is 0, one circular arc when its radii are equal, and otherwise
 * straight pieces within FLAT of the ellipse.
 */
function arcSegments(from: Point, command: Extract<PathCommand, { op: "A" }>): PathSegment[] {
  const { to, large, sweep } = command;
  if (from.x === to.x && from.y === to.y) return [];
  let { rx, ry } = command;
  if (!(rx > 0 && ry > 0)) return [line(from, to)];
  const circle = Math.abs(rx - ry) <= ROUND * Math.max(rx, ry);
  const phi = circle ? 0 : (command.rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  // The start, relative to the chord's middle, in the ellipse's own axes.
  const hx = (from.x - to.x) / 2;
  const hy = (from.y - to.y) / 2;
  const x1 = cos * hx + sin * hy;
  const y1 = -sin * hx + cos * hy;
  // Radii too small to reach are scaled up until they just do.
  const reach = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (reach > 1) {
    rx *= Math.sqrt(reach);
    ry *= Math.sqrt(reach);
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const spread = rx2 * y1 * y1 + ry2 * x1 * x1;
  const k = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, (rx2 * ry2 - spread) / spread));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const center = { x: cos * cx1 - sin * cy1 + (from.x + to.x) / 2, y: sin * cx1 + cos * cy1 + (from.y + to.y) / 2 };
  const theta = Math.atan2((y1 - cy1) / ry, (x1 - cx1) / rx);
  let turn = Math.atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx) - theta;
  // Positive turns clockwise on screen, as SVG's sweep flag 1 does with y down.
  if (sweep && turn < 0) turn += TAU;
  else if (!sweep && turn > 0) turn -= TAU;

  if (circle) return [arc(center, rx, theta, turn)];
  const n = pieces(Math.abs(turn), Math.max(rx, ry));
  const at = (angle: number): Point => {
    const ex = rx * Math.cos(angle);
    const ey = ry * Math.sin(angle);
    return { x: center.x + cos * ex - sin * ey, y: center.y + sin * ex + cos * ey };
  };
  const segments: PathSegment[] = [];
  let previous = from;
  for (let j = 1; j <= n; j++) {
    const next = j === n ? to : at(theta + (turn * j) / n);
    segments.push(line(previous, next));
    previous = next;
  }
  return segments;
}
