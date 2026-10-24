// A caption: text past the end of a mark's walk, or past its own labels (`labelBounds`), rising into
// place. delta and label draw through it, so they place and rise the same way. Internal:
// it reads only the geometry, and draws only through the context's layer.

import { offset } from "../core";
import type { Color, EffectContext, MarkData, MarkGeometry, Point, Rect, TextHandle } from "../core";

/** Past the end of the walk, with no label in the way. */
const PAST_END = 10;
/** Past the farthest of the mark's labels in the way; a label is in the way when the line it's placed along passes within this of it, since the text has height. */
const PAST_LABEL = 6;
/** How far it rises into place, across the way it's placed. */
const RISE = 8;
/** The overlay's text size (the theme's `.ec-text`), for where the baseline goes. */
const TEXT = 12.5;
/** Shares of the text size from the anchor point down to the baseline: text read sideways is centred on the walk's line, as the charts' labels are; text read downwards hangs from it. */
const CENTRE = 0.36;
const HANG = 0.8;

export type CaptionAnchor = "start" | "middle" | "end";

export interface CaptionPlace {
  /** The text's anchor point, on its baseline. */
  readonly at: Point;
  readonly anchor: CaptionAnchor;
  /** The way it was placed, in radians: the walk's heading, or the mark's up side. */
  readonly toward: number;
}

/**
 * Where a caption goes on `mark`.
 *
 * - **Along the heading,** from the end of the walk: 10 px past the end, or 6 px past the farthest of
 *   its `labelBounds` the heading meets, whichever is further. The heading meets a box when it passes
 *   within 6 px of it: the text has height, and a heading that just misses a label would put the
 *   text on it.
 * - **Up from its centre,** when the heading meets none of its labels but its up side does: 6 px past
 *   the farthest of them. A slice's heading runs along the ring, and its up side goes out through its
 *   label outside it.
 *
 * It's anchored by the way it was placed: at its start reading rightwards, its end leftwards, and its
 * middle within 45° of vertical, so a column's sits centred above its value. Its baseline is a little
 * below the point: read sideways, the text is centred on the line it was placed along, as the
 * charts' labels are; read upwards, it stands on it; read downwards, it hangs from it.
 */
export function captionPlace(mark: MarkGeometry): CaptionPlace {
  const boxes = mark.labelBounds ?? [];
  const heading = mark.angle(1);
  const along = farthest(mark.end, heading, boxes);
  if (along === undefined && boxes.length > 0) {
    const up = mark.angle(0.5) - Math.PI / 2;
    const out = farthest(mark.center, up, boxes);
    if (out !== undefined) return placed(mark.center, up, out);
  }
  return placed(mark.end, heading, Math.max(PAST_END, along ?? -Infinity));
}

/** The caption `distance` px from `from` towards `toward`, anchored and dropped to its baseline by that direction. */
function placed(from: Point, toward: number, distance: number): CaptionPlace {
  const cos = Math.cos(toward);
  const sin = Math.sin(toward);
  const point = offset(from, toward, distance);
  const drop = TEXT * (sin < 0 ? CENTRE * (1 + sin) : CENTRE + (HANG - CENTRE) * sin);
  const anchor: CaptionAnchor = Math.abs(cos) <= Math.SQRT1_2 + 1e-9 ? "middle" : cos > 0 ? "start" : "end";
  return { at: { x: point.x, y: point.y + drop }, anchor, toward };
}

/**
 * How far from `from` towards `toward` the ray leaves the farthest of `boxes` it meets, each grown by
 * 6 px on every side, so it's 6 px past the box itself; or undefined when it meets none.
 */
function farthest(from: Point, toward: number, boxes: readonly Rect[]): number | undefined {
  const cos = Math.cos(toward);
  const sin = Math.sin(toward);
  let exit: number | undefined;
  for (const { x, y, width, height } of boxes) {
    const grown = { x: x - PAST_LABEL, y: y - PAST_LABEL, width: width + 2 * PAST_LABEL, height: height + 2 * PAST_LABEL };
    const leaving = leaves(from, cos, sin, grown);
    if (leaving !== undefined) exit = Math.max(exit ?? leaving, leaving);
  }
  return exit;
}

/** How far along the ray from `from` (direction cos, sin) it leaves `box`, or undefined when it never meets it. */
function leaves(from: Point, cos: number, sin: number, box: Rect): number | undefined {
  let near = 0;
  let far = Infinity;
  for (const [origin, step, lo, hi] of [
    [from.x, cos, box.x, box.x + box.width],
    [from.y, sin, box.y, box.y + box.height]
  ] as const) {
    if (Math.abs(step) < 1e-12) {
      if (origin < lo || origin > hi) return undefined;
      continue;
    }
    const a = (lo - origin) / step;
    const b = (hi - origin) / step;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  return far >= near ? far : undefined;
}

/**
 * Draws a caption on the mark now, at rise 0, and returns how to draw it at rise p: from 0 (8 px
 * across the way it was placed, on that way's down side, unseen) to 1 (in place, at full strength). It keeps to the mark
 * through `onChange`, its text worded again by `words` from the moved mark and its latest data. No
 * text (undefined or "") draws nothing.
 */
export function caption<D>(
  mark: MarkGeometry,
  data: MarkData<D>,
  ctx: EffectContext,
  color: Color,
  words: (mark: MarkGeometry, data: MarkData<D>) => string | undefined
): (p: number) => void {
  let current = mark;
  let content = words(mark, data) ?? "";
  let latest = data;
  let progress = 0;
  let handle: TextHandle | undefined;
  const draw = (): void => {
    if (content === "") {
      handle?.remove();
      handle = undefined;
      return;
    }
    const { at, anchor, toward } = captionPlace(current);
    // Rising across the way it was placed, towards that way's up side, so it never crosses the labels it's placed past.
    const style = { at: offset(at, toward - Math.PI / 2, -RISE * (1 - progress)), anchor, color, opacity: progress };
    if (handle) handle.update(style, content);
    else handle = ctx.layer.text(content, style);
  };
  ctx.onChange((next, nextData) => {
    current = next;
    // The runner tells a run its own mark's data, so it has the run's rows.
    latest = (nextData as MarkData<D> | undefined) ?? latest;
    content = words(current, latest) ?? "";
    draw();
  });
  draw();
  return (p) => {
    progress = p;
    draw();
  };
}
