// A caption: text past the end of a mark's walk, or past its own labels (`labelBounds`), other marks'
// near it (`nearbyLabels`) and other effects' text before it (`texts`), rising into place. delta and
// label draw through it, so they place and rise the same way. Internal: it reads only the geometry and
// the context's text space, and draws only through the context's layer.

import { offset } from "../core";
import type { Color, EffectContext, MarkData, MarkGeometry, Point, Rect, TextHandle, TextStyle } from "../core";

/** Past the end of the walk, with no label in the way. */
const PAST_END = 10;
/** Past the farthest label in the way; a label is in the way when the line it's placed along passes within this of it, since the text has height. */
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

/** What a caption knows of its text, from the context's `texts`: the boxes other effects' text before it holds, and the box its own text takes drawn with a style. */
export interface CaptionText {
  readonly held: readonly Rect[];
  box(style: TextStyle): Rect;
}

/**
 * Where a caption goes on `mark`.
 *
 * - **Along the heading,** from the end of the walk: 10 px past the end, or 6 px past the farthest
 *   box the heading meets, whichever is further. The heading meets a box when it passes within 6 px
 *   of it: the text has height, and a heading that just misses a label would put the text on it.
 *   Text centred on its point reaches out to either side, so it goes 6 px past a label's top or bottom,
 *   though the heading leaves it through a side.
 * - **Up from its centre,** when the heading meets none of its own labels but its up side does: 6 px
 *   past the farthest box that way meets. A slice's heading runs along the ring, and its up side
 *   goes out through its label outside it.
 *
 * The way is picked by the mark's own labels (`labelBounds`) alone. The boxes it goes past are those,
 * other marks' labels near it (`nearbyLabels`) and, with `text`, other effects' text before it
 * (`held`), so another mark's label or text never turns it, and only takes it further: a line's text
 * goes past a neighbour's end label beside its own, and past the change already placed there.
 *
 * With `text`, the text's own box counts too. From there, the text moves along its way until its box
 * meets none of the boxes: 6 px clear of a label the way misses, which the text would still meet,
 * reaching out to one side, clear of other effects' text the way misses, and clear of a box the way
 * meets. So text that kept clear before stays where it was, text centred along a slice's ring keeps
 * off a label beside it, without going past a label it would only meet far along, and changes on
 * rows a line apart, as past a slope chart's names, stay beside their own.
 *
 * It's anchored by the way it was placed: at its start reading rightwards, its end leftwards, and its
 * middle within 45° of vertical, so a column's sits centred above its value. Its baseline is a little
 * below the point: read sideways, the text is centred on the line it was placed along, as the
 * charts' labels are; read upwards, it stands on it; read downwards, it hangs from it.
 */
export function captionPlace(mark: MarkGeometry, text?: CaptionText): CaptionPlace {
  const own = mark.labelBounds ?? [];
  const boxes = [...own, ...(mark.nearbyLabels ?? []), ...(text?.held ?? [])];
  const heading = mark.angle(1);
  if (farthest(mark.end, heading, own) === undefined) {
    const up = mark.angle(0.5) - Math.PI / 2;
    if (farthest(mark.center, up, own) !== undefined) return past(mark.center, up, 0, own, boxes, text);
  }
  return past(mark.end, heading, PAST_END, own, boxes, text);
}

/**
 * The caption at least `least` px from `from` towards `toward`, past the farthest of `boxes` that way
 * meets. With `text`, past the farthest of its own labels, `own`, and on until it's clear of `boxes`.
 */
function past(from: Point, toward: number, least: number, own: readonly Rect[], boxes: readonly Rect[], text: CaptionText | undefined): CaptionPlace {
  if (!text) return placed(from, toward, Math.max(least, farthest(from, toward, boxes) ?? -Infinity));
  // The text's own box placed at `from`, from `from`: as the text moves along, so does its box.
  const { x, y, width, height } = text.box(placed(from, toward, 0));
  return placed(from, toward, clearOf(from, toward, Math.max(least, farthest(from, toward, own) ?? -Infinity), boxes, { x: x - from.x, y: y - from.y, width, height }, new Set(text.held)));
}

/**
 * The least distance from `distance` on at which the text, its box `reach` from its point, meets none
 * of `boxes`. It meets a box from where its box comes within 6 px of it. It leaves a box the ray
 * passes within 6 px of 6 px past it along the ray, as without its box, or where its box is clear of
 * it, if that's further; and a box the ray misses where its box is 6 px clear of it. Other effects'
 * text, `held`, the ray misses meets the text only where their boxes overlap: a box already holds
 * the text's ascent and descent, so text a row above or below is a line apart, not in its way.
 */
function clearOf(from: Point, toward: number, distance: number, boxes: readonly Rect[], reach: Rect, held: ReadonlySet<Rect>): number {
  const cos = Math.cos(toward);
  const sin = Math.sin(toward);
  const across = centred(cos);
  // Where along the ray the text's box meets `box`: while its point is in it, grown again by the text's box, the other way.
  const meets = (box: Rect): [number, number] | undefined =>
    span(from, cos, sin, { x: box.x - reach.x - reach.width, y: box.y - reach.y - reach.height, width: box.width + reach.width, height: box.height + reach.height });
  const spans = boxes.map((box) => {
    const near = grow(box, PAST_LABEL);
    const band = span(from, cos, sin, near);
    if (!band && held.has(box)) return meets(box);
    const within = meets(near);
    if (!band || !within) return within;
    // Centred text is past a box once it's past its top or bottom, as farthest() has it.
    const leaving = across ? Math.max(band[1], ((sin > 0 ? near.y + near.height : near.y) - from.y) / sin) : band[1];
    return [within[0], Math.max(leaving, meets(box)?.[1] ?? -Infinity)] as const;
  });
  let at = distance;
  for (let moved = true; moved; ) {
    moved = false;
    for (const meets of spans) {
      if (meets && at > meets[0] + 1e-6 && at < meets[1] - 1e-6) {
        at = meets[1];
        moved = true;
      }
    }
  }
  return at;
}

const grow = ({ x, y, width, height }: Rect, by: number): Rect => ({ x: x - by, y: y - by, width: width + 2 * by, height: height + 2 * by });

/** The caption `distance` px from `from` towards `toward`, anchored and dropped to its baseline by that direction. */
function placed(from: Point, toward: number, distance: number): CaptionPlace {
  const cos = Math.cos(toward);
  const sin = Math.sin(toward);
  const point = offset(from, toward, distance);
  const drop = TEXT * (sin < 0 ? CENTRE * (1 + sin) : CENTRE + (HANG - CENTRE) * sin);
  const anchor: CaptionAnchor = centred(cos) ? "middle" : cos > 0 ? "start" : "end";
  return { at: { x: point.x, y: point.y + drop }, anchor, toward };
}

/** Whether text placed this way (its cosine) is centred on its point: within 45° of vertical. */
function centred(cos: number): boolean {
  return Math.abs(cos) <= Math.SQRT1_2 + 1e-9;
}

/**
 * How far from `from` towards `toward` the ray leaves the farthest of `boxes` it meets, each grown by
 * 6 px on every side, so it's 6 px past the box itself; or undefined when it meets none. Within 45° of
 * vertical, where the text is centred, it leaves a box past its top or bottom.
 */
function farthest(from: Point, toward: number, boxes: readonly Rect[]): number | undefined {
  const cos = Math.cos(toward);
  const sin = Math.sin(toward);
  const across = centred(cos);
  let exit: number | undefined;
  for (const box of boxes) {
    const grown = grow(box, PAST_LABEL);
    let leaving = leaves(from, cos, sin, grown);
    // Centred text reaches out to either side, so it's past a box once it's past its top or bottom.
    if (leaving !== undefined && across) leaving = Math.max(leaving, ((sin > 0 ? grown.y + grown.height : grown.y) - from.y) / sin);
    if (leaving !== undefined) exit = Math.max(exit ?? leaving, leaving);
  }
  return exit;
}

/** How far along the ray from `from` (direction cos, sin) it leaves `box`, or undefined when it never meets it. */
function leaves(from: Point, cos: number, sin: number, box: Rect): number | undefined {
  return span(from, cos, sin, box)?.[1];
}

/** Where along the ray from `from` (direction cos, sin) it's in `box`, from 0 on: as far as it enters it and leaves it, or undefined when it never meets it. */
function span(from: Point, cos: number, sin: number, box: Rect): [number, number] | undefined {
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
  return far >= near ? [near, far] : undefined;
}

/**
 * Draws a caption on the mark now, at rise 0, and returns how to draw it at rise p: from 0 (8 px
 * across the way it was placed, on that way's down side, unseen) to 1 (in place, at full strength). It keeps to the mark
 * through `onChange`, its text worded again by `words` from the moved mark and its latest data. No
 * text (undefined or "") draws nothing. With the context's `texts`, it goes past the text held before
 * it, and holds the box where its own text ends, risen into place, from its first draw.
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
  const { texts } = ctx;
  const draw = (): void => {
    if (content === "") {
      handle?.remove();
      handle = undefined;
      texts?.hold(undefined);
      return;
    }
    const { at, anchor, toward } = captionPlace(current, texts && { held: texts.held(), box: (style) => texts.box(content, style) });
    texts?.hold(texts.box(content, { at, anchor }));
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
