// Finds what an effect draws inside a mark's gaps, for the conformance sweeps: a path that strokes
// along a gap, or an icon or text whose nearest point on the walk is inside one. A gap is the
// straight stretch of the walk from path(from) to path(to), which the mark's own stroke leaves out.

import type { MarkGeometry, Point } from "../contracts/geometry";
import { matrix } from "../geometry/matrix";
import { samplesAlong } from "../geometry/samples";
import { measurePath } from "./path";
import type { Drawn } from "./recording";

/** Path data is written to 0.001 px: a point this close to a gap's line is on it. */
const ON_LINE = 0.01;
/** Text this close to the walk, px, counts as on it, and this far inside a gap as over it. */
const TEXT_REACH = 12;
const TEXT_INSIDE = 0.5;

/**
 * What's drawn inside the mark's gaps, each described; empty when nothing is, or the mark has none.
 * - A path counts when one of its lines or arcs (taken as the line between its ends) runs along a gap.
 * - An icon counts when the walk's nearest point to its anchor is more than the icon's size inside a
 *   gap, and the anchor is within its size plus the mark's thickness of it. So an icon resting at a
 *   gap's end, lifted or tilted by its gait, doesn't count, and one carried through the gap does.
 * - Text counts when the walk's nearest point to its place is inside a gap, within 12 px.
 */
export function drawnInGaps(mark: MarkGeometry, drawn: readonly Drawn[]): string[] {
  const gaps = mark.gaps ?? [];
  if (gaps.length === 0) return [];
  const problems: string[] = [];
  for (const item of drawn) {
    if (item.kind === "path") {
      gaps.forEach(([from, to], k) => {
        if (strokes(item.d, mark.path(from), mark.path(to))) problems.push(`the path "${item.d}" runs along gap ${k + 1}`);
      });
      continue;
    }
    const at = item.kind === "text" ? item.style.at : item.transform && matrix.apply(item.transform, item.icon.anchor);
    if (!at) continue;
    const size = item.kind === "text" ? 0 : (item.size ?? item.icon.size);
    const k = item.kind === "text" ? over(mark, at, TEXT_REACH, TEXT_INSIDE) : over(mark, at, size + mark.thickness, size);
    const what = item.kind === "text" ? `the text "${item.content}"` : `the icon ${item.icon.name}`;
    if (k !== undefined) problems.push(`${what} at ${format(at)} is over gap ${k + 1}`);
  }
  return problems;
}

/** Whether a line or arc of the path data runs along the stretch from p to q, past their ends. */
function strokes(d: string, p: Point, q: Point): boolean {
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  if (!(length > 2 * ON_LINE)) return false;
  const ux = (q.x - p.x) / length;
  const uy = (q.y - p.y) / length;
  const along = (a: Point): number => (a.x - p.x) * ux + (a.y - p.y) * uy;
  const across = (a: Point): number => Math.abs((a.x - p.x) * uy - (a.y - p.y) * ux);
  const runs = (a: Point, b: Point): boolean =>
    across(a) <= ON_LINE && across(b) <= ON_LINE && Math.max(Math.min(along(a), along(b)), ON_LINE) < Math.min(Math.max(along(a), along(b)), length - ON_LINE);

  let pen: Point | undefined;
  let start: Point | undefined;
  for (const { op, args } of measurePath(d).commands) {
    if (op === "Z") {
      if (pen && start && runs(pen, start)) return true;
      pen = start;
      continue;
    }
    const to = { x: args[args.length - 2]!, y: args[args.length - 1]! };
    if (op === "M") start = to;
    else if (pen && runs(pen, to)) return true;
    pen = to;
  }
  return false;
}

/** The index of the gap the walk's nearest point to `at` is more than `inside` px inside, if it's within `reach` px. */
function over(mark: MarkGeometry, at: Point, reach: number, inside: number): number | undefined {
  const [nearest] = samplesAlong(mark, [{ x: at.x, y: at.y, value: 0 }]);
  if (!nearest) return undefined;
  const on = mark.path(nearest.t);
  if (Math.hypot(on.x - at.x, on.y - at.y) > reach) return undefined;
  const distance = nearest.t * mark.length;
  const k = (mark.gaps ?? []).findIndex(([from, to]) => distance > from * mark.length + inside && distance < to * mark.length - inside);
  return k < 0 ? undefined : k;
}

const format = (point: Point): string => `${Math.round(point.x * 100) / 100},${Math.round(point.y * 100) / 100}`;
