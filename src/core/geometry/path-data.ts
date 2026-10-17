// SVG path data for segments: M, L, A and Z only, with numbers rounded to 0.001 px.

import type { Point } from "../contracts/geometry";
import { pointOn, polar, type PathSegment } from "./segment";

/** A coordinate for path data: rounded to 0.001, with no "-0". */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? "0" : String(rounded);
}

export function moveTo(point: Point): string {
  return `M${formatNumber(point.x)},${formatNumber(point.y)}`;
}

/**
 * Commands that draw a segment from fraction `u0` to `u1` of its length, assuming the pen is already
 * at the `u0` point. Arcs are split into pieces of at most half a turn, so the large-arc flag is
 * always 0 and a full circle still draws.
 */
export function drawTo(segment: PathSegment, u0 = 0, u1 = 1): string {
  if (segment.kind === "line") {
    const p = u1 === 1 ? segment.to : pointOn(segment, u1);
    return `L${formatNumber(p.x)},${formatNumber(p.y)}`;
  }
  const from = segment.start + segment.sweep * u0;
  const turn = segment.sweep * (u1 - u0);
  const pieces = Math.max(1, Math.ceil(Math.abs(turn) / Math.PI - 1e-9));
  const r = formatNumber(segment.radius);
  const clockwise = turn >= 0 ? 1 : 0;
  let d = "";
  for (let i = 1; i <= pieces; i++) {
    const p = polar(segment.center, segment.radius, from + (turn * i) / pieces);
    d += `A${r},${r} 0 0 ${clockwise} ${formatNumber(p.x)},${formatNumber(p.y)}`;
  }
  return d;
}

/**
 * Path data for a run of connected segments. Zero-length segments draw nothing. A closed run ends
 * with Z, which also replaces a final straight segment back to the start.
 */
export function pathData(segments: readonly PathSegment[], closed = false): string {
  const first = segments[0];
  if (!first) return "";
  let count = segments.length;
  if (closed) {
    while (count > 0 && segments[count - 1]!.length <= 0) count--;
    if (count > 0 && segments[count - 1]!.kind === "line") count--;
  }
  let d = moveTo(pointOn(first, 0));
  for (let i = 0; i < count; i++) {
    const segment = segments[i]!;
    if (segment.length > 0) d += drawTo(segment);
  }
  return closed ? `${d}Z` : d;
}
