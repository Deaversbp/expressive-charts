// Bars from rectangles someone else drew: which edge each grows from, and the segments of a stack,
// described with describe.bar. Pure: the rectangles are already in the marks' common coordinates.

import type { Baseline, MarkGeometry, Rect } from "../../core";
import { describe } from "../../core";

/** One `<rect>` of a mark, in the marks' common coordinates. */
export interface RectPart {
  readonly box: Rect;
  /** The segment's series, from the `segment` option. */
  readonly series: string | undefined;
  /** Corner radius (the rect's rx), used for the tip. */
  readonly radius: number;
}

/** Edges this close (px) count as the same line. */
const SAME = 0.5;

const BASELINES: readonly string[] = ["left", "right", "top", "bottom"];

export function isBaseline(value: unknown): value is Baseline {
  return typeof value === "string" && BASELINES.includes(value);
}

/**
 * Each mark's baseline. "auto" finds a line every mark has an edge on: a mark whose near edge
 * (left, or bottom for columns) is on it grows away from it, and one whose far edge is grows the
 * other way, like a negative bar. When both directions fit (one mark, or marks of one size), marks
 * spread down the page are bars and marks spread across are columns.
 */
export function baselines(boxes: readonly Rect[], option: Baseline | "auto"): Baseline[] {
  if (option !== "auto") return boxes.map(() => option);
  if (boxes.length === 0) return [];
  const horizontal = commonLine(boxes, (b) => b.x, (b) => b.x + b.width, "left", "right");
  const vertical = commonLine(boxes, (b) => b.y + b.height, (b) => b.y, "bottom", "top");
  if (horizontal && vertical) return rows(boxes) ? horizontal : vertical;
  const found = horizontal ?? vertical;
  if (!found) {
    throw new RangeError('expressive: baseline "auto" found no edge that every mark grows from. Pass baseline: "left", "right", "top" or "bottom".');
  }
  return found;
}

/**
 * The mark's geometry from its rects, ordered from the baseline. Each segment ends where its rect
 * ends; a gap the host left between segments becomes describe.bar's `gap`, which comes out of the
 * start of the later segment.
 */
export function describeRects(key: string, parts: readonly RectPart[], baseline: Baseline): { geometry: MarkGeometry; order: number[] } {
  const box = union(parts.map((part) => part.box));
  const span = spanFrom(box, baseline);
  const order = parts
    .map((part, index) => ({ index, ...span(part.box) }))
    .sort((a, b) => a.near - b.near || a.far - b.far || a.index - b.index);

  let reached = 0;
  let gap = Infinity;
  const segments = order.map(({ index, near, far }) => {
    // Only between parts you can see: a zero-length segment sits right where the one before ends.
    if (reached > 0 && far > near) gap = Math.min(gap, near - reached);
    const size = Math.max(0, far - reached);
    reached = Math.max(reached, far);
    return { series: parts[index]!.series, size };
  });

  const tip = parts[order[order.length - 1]!.index]!;
  const single = parts.length === 1 ? parts[0]!.series : undefined;
  const geometry = describe.bar({
    key,
    ...(single === undefined ? {} : { series: single }),
    ...box,
    baseline,
    radius: tip.radius,
    gap: Number.isFinite(gap) ? Math.max(0, round(gap)) : 0,
    // Without `segment` there's one part and no series to name: describe.bar's default segment.
    ...(segments.every((s) => s.series !== undefined) ? { segments: segments.map((s) => ({ series: s.series!, size: round(s.size) })) } : {})
  });
  return { geometry, order: order.map((o) => o.index) };
}

/** Indices in visual order: bars top to bottom, columns left to right. */
export function visualOrder(boxes: readonly Rect[], baseline: readonly Baseline[]): number[] {
  const horizontal = baseline[0] === "left" || baseline[0] === "right";
  const along = (b: Rect): number => (horizontal ? b.y : b.x);
  const across = (b: Rect): number => (horizontal ? b.x : b.y);
  return boxes.map((_, index) => index).sort((a, b) => along(boxes[a]!) - along(boxes[b]!) || across(boxes[a]!) - across(boxes[b]!) || a - b);
}

export function union(boxes: readonly Rect[]): Rect {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: round(Math.max(...boxes.map((b) => b.x + b.width)) - x), height: round(Math.max(...boxes.map((b) => b.y + b.height)) - y) };
}

function commonLine(
  boxes: readonly Rect[],
  nearEdge: (box: Rect) => number,
  farEdge: (box: Rect) => number,
  near: Baseline,
  far: Baseline
): Baseline[] | undefined {
  const first = boxes[0];
  if (!first) return [];
  for (const line of [nearEdge(first), farEdge(first)]) {
    const found: Baseline[] = [];
    for (const box of boxes) {
      if (Math.abs(nearEdge(box) - line) < SAME) found.push(near);
      else if (Math.abs(farEdge(box) - line) < SAME) found.push(far);
      else break;
    }
    if (found.length === boxes.length) return found;
  }
  return undefined;
}

/** True when the marks look like rows (bars), false for columns. */
function rows(boxes: readonly Rect[]): boolean {
  const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);
  const down = spread(boxes.map((b) => b.y + b.height / 2));
  const across = spread(boxes.map((b) => b.x + b.width / 2));
  if (down !== across) return down > across;
  // One mark, or marks on top of each other: the longer side is the bar's length.
  return boxes[0]!.width >= boxes[0]!.height;
}

/** A part's start and end along the walk, in px from the mark's baseline. */
function spanFrom(mark: Rect, baseline: Baseline): (box: Rect) => { near: number; far: number } {
  switch (baseline) {
    case "left":
      return (b) => ({ near: b.x - mark.x, far: b.x + b.width - mark.x });
    case "right":
      return (b) => ({ near: mark.x + mark.width - (b.x + b.width), far: mark.x + mark.width - b.x });
    case "top":
      return (b) => ({ near: b.y - mark.y, far: b.y + b.height - mark.y });
    case "bottom":
      return (b) => ({ near: mark.y + mark.height - (b.y + b.height), far: mark.y + mark.height - b.y });
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
