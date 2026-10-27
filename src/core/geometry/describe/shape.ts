// describe.shape: any SVG path data, as an element with that `d` draws it. An open shape is a line,
// with a gap at each later move; a closed one is an area with no direction, like a point.

import type { Matrix } from "../../contracts/drawing";
import type { MarkGeometry, Point, Rect } from "../../contracts/geometry";
import { flattenPath, type Subpath } from "../flatten";
import { loopOutline, openOutline } from "../outline";
import { parsePath, transformPath } from "../path";
import { boundsOf, extremes, line, type PathSegment } from "../segment";
import { createWalk, type Gaps } from "../walk";
import { assemble, labelBoxes } from "./mark";

export interface ShapeSpec {
  readonly key: string;
  readonly series?: string;
  /**
   * SVG path data in the shape's own px, read as SVG reads it, up to its first error. A shape is
   * closed when every subpath ends with Z, or where it started, and otherwise open, a line.
   */
  readonly d: string;
  /** Moves the shape into the marks' px, as an element's transform does, arcs too. Default none. */
  readonly matrix?: Matrix;
  /** An open shape's stroke width in px, more than 0. Default 1, SVG's default. */
  readonly width?: number;
  /** The boxes of the text drawn for the mark, in the marks' px: passed through as `labelBounds`. */
  readonly labelBounds?: readonly Rect[];
}

/**
 * Path data, flattened: straight pieces and circular arcs stay as they are, and Béziers and other
 * arcs become straight pieces within 0.1 px of the curve.
 * - An open shape is a line. Its walk runs along the path from its first point, and each later move
 *   starts a new run after a gap. Its outline is the stroke, less the gaps, and its thickness,
 *   bounds, centre and pivot are as `describe.line`'s.
 * - A closed shape has no direction: its walk is its bounds' centre, with length 0. Its outline's
 *   `d` is the whole path, holes too, and `sample(n)` goes round its longest subpath, clockwise in
 *   four quarters of equal length from its upper left. Its thickness is the smaller of its width and
 *   height.
 * A subpath that ends where it started is closed too, as d3.arc() draws a full ring's outer edge.
 * A path whose subpaths are all closed but have no length, as d3 draws a value alone, is open: a line
 * with nothing to stroke.
 */
export function describeShape(spec: ShapeSpec): MarkGeometry {
  const { key, series, d } = spec;
  const width = spec.width ?? 1;
  if (!(Number.isFinite(width) && width > 0)) throw new RangeError(`describe.shape: width must be a finite number more than 0, got ${width}.`);
  const m = checkMatrix(spec.matrix);
  if (typeof d !== "string") throw new RangeError(`describe.shape: d must be path data, a string, got ${show(d)}.`);
  const commands = parsePath(d);
  const subpaths = commands[0]?.op === "M" ? flattenPath(m ? transformPath(commands, m) : commands) : [];
  if (subpaths.length === 0) throw new RangeError(`describe.shape: d must start with a move and draw something after it, got ${show(d)}.`);

  const points: Point[] = [];
  let length = 0;
  for (const subpath of subpaths) {
    points.push(subpath.start);
    for (const segment of subpath.segments) {
      for (const point of extremes(segment)) points.push(point);
      length += segment.length;
    }
  }
  const box = boundsOf(points);
  if (![box.x, box.y, box.width, box.height, length].every(Number.isFinite)) {
    throw new RangeError(`describe.shape: d must stay finite${m ? " once moved by matrix" : ""}, got ${show(d)}.`);
  }
  const labelBounds = labelBoxes("shape", spec.labelBounds);

  if (subpaths.every(closes) && length > 0) {
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    return assemble({
      key,
      series,
      walk: createWalk([line(center, center)]),
      thickness: Math.min(box.width, box.height),
      // A subpath with no length encloses nothing.
      outline: loopOutline(subpaths.map((subpath) => subpath.segments).filter((segments) => segments.length > 0)),
      bounds: box,
      center,
      pivot: center,
      labelBounds
    });
  }

  const { segments, gaps } = joined(subpaths);
  const walk = createWalk(segments, gaps);
  const pad = width / 2;
  return assemble({
    key,
    series,
    walk,
    thickness: width,
    outline: openOutline(walk),
    bounds: { x: box.x - pad, y: box.y - pad, width: box.width + width, height: box.height + width },
    center: walk.point(0.5),
    pivot: walk.start,
    labelBounds
  });
}

/** Whether a subpath ends with Z, or back where it started. */
const closes = ({ closed, start, end }: Subpath): boolean => closed || (start.x === end.x && start.y === end.y);

/** The subpaths as one walk: a straight piece across from each to the next, which is a gap where they're apart. */
function joined(subpaths: readonly Subpath[]): { segments: PathSegment[]; gaps: Gaps } {
  const segments: PathSegment[] = [];
  const across: number[] = [];
  let pen: Point | undefined;
  for (const subpath of subpaths) {
    if (pen && (pen.x !== subpath.start.x || pen.y !== subpath.start.y)) {
      across.push(segments.length);
      segments.push(line(pen, subpath.start));
    }
    for (const segment of subpath.segments) segments.push(segment);
    pen = subpath.end;
  }
  if (segments.length === 0) segments.push(line(subpaths[0]!.start, subpaths[0]!.start));
  // The distance to each segment, summed as createWalk sums it, so the walk's end is at t = 1 exactly.
  const along = [0];
  for (const segment of segments) along.push(along[along.length - 1]! + segment.length);
  const length = along[along.length - 1]!;
  return { segments, gaps: across.map((i) => [along[i]! / length, along[i + 1]! / length]) };
}

/** `matrix`, checked: six finite numbers. */
function checkMatrix(m: Matrix | undefined): Matrix | undefined {
  if (m === undefined) return m;
  if (!(Array.isArray(m) && m.length === 6 && m.every(Number.isFinite))) {
    throw new RangeError(`describe.shape: matrix must be six finite numbers [a, b, c, d, e, f], got ${show(m)}.`);
  }
  return m;
}

/** A value for a message: strings quoted, and cut short past 40 characters. */
function show(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(show).join(", ")}]`;
  if (typeof value !== "string") return String(value);
  return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
}
