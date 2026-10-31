// drawIn: a mark draws itself in along its walk as it enters, a stack part by part, each in its own
// colour, over the mark made faint. It reads only each part's walk and thickness, so it runs on any
// mark. It's for enter: in the hover slot it would make the mark being read faint, so trace stays the
// highlighter.

import { easeInOutCubic, linear } from "../core";
import type { GeometryEffect, MarkGeometry, Paint, PathHandle } from "../core";

export interface DrawInOptions {
  /** Base ms to draw the whole walk, before the motion mode scales it, with effect timing. Default 750. */
  readonly duration?: number;
  /** The mark's opacity while it draws in, from 0 to 1. Default 0.3, as hover dims the other marks. */
  readonly faint?: number;
}

const DURATION = 750;
const FAINT = 0.3;
/** A walk shorter than this has nothing to draw along: the run finishes at once. */
const MIN_WALK = 0.5;

/**
 * Draws the mark in along its walk, for `enter`. Its body goes to `faint`, and the overlay draws it
 * from its start to its end at its own width and colour, with butt caps, eased in and out over
 * `duration`. Then the mark is back at full strength, with nothing drawn. Its labels stay as they are.
 *
 * So a line draws along its stroke, its gaps left out; a bar from its baseline to its tip, a
 * rectangle at its width; a slice round its mid-radius arc, at its ring's width. A stack draws each
 * segment in turn, in its own colour (`Paint.part`), each eased in and out over its share of the time,
 * its share of the length. A walk under 0.5 px (a point, a closed shape) finishes at once.
 *
 * It follows `onChange`, drawing again at the same progress, so it keeps to a mark that grows or
 * moves while it plays. Its end state is the mark as it is, so reduced motion shows it at once.
 */
export function drawIn(options: DrawInOptions = {}): GeometryEffect {
  checkOptions(options);
  const duration = options.duration ?? DURATION;
  const faint = options.faint ?? FAINT;

  return {
    kind: "geometry",
    async run(mark, ctx) {
      if (ctx.signal.aborted || !(walk(mark) >= MIN_WALK)) return;
      let current = mark;
      let progress = 0;
      let done = false;
      const paths: PathHandle[] = [];
      /** Each part as far as the progress has reached it; with `repaint`, its width and colour again too. */
      const draw = (repaint: boolean): void => {
        const { segments } = current;
        const parts = segments ?? [current];
        const reached = progress * walk(current);
        let from = 0;
        parts.forEach((piece, i) => {
          const share = piece.length > 0 ? Math.min(1, Math.max(0, (reached - from) / piece.length)) : 0;
          from += piece.length;
          // Before its turn, a lone moveto, which SVG doesn't stroke.
          const d = piece.slice(0, easeInOutCubic(share));
          const paint: Paint = { stroke: "mark", width: piece.thickness, linecap: "butt", ...(segments && { part: piece.key }) };
          const path = paths[i];
          if (!path) paths[i] = ctx.layer.path(d, paint);
          // Given as undefined, a part goes, should the mark lose its segments.
          else path.update(d, repaint ? { part: undefined, ...paint } : undefined);
        });
        for (const path of paths.splice(parts.length)) path.remove();
      };
      ctx.onChange((next) => {
        current = next;
        if (!done) draw(true);
      });
      ctx.mark.set({ opacity: faint });
      draw(false);
      // Linear: draw() eases each part in and out over its own share.
      await ctx.tween({
        duration,
        timing: "effect",
        ease: linear,
        update: (p) => {
          progress = p;
          draw(false);
        }
      }).finished;
      // Drawn, or aborted: the mark at full strength, with nothing over it.
      done = true;
      for (const path of paths) path.remove();
      ctx.mark.set({ opacity: undefined });
    },
    end() {},
    clear() {}
  };
}

/** The length drawn along: its parts', so a stack's gaps between segments take no time. */
const walk = (mark: MarkGeometry): number => (mark.segments ?? [mark]).reduce((sum, part) => sum + part.length, 0);

function checkOptions(options: DrawInOptions): void {
  const { duration, faint } = options;
  if (duration !== undefined && !(typeof duration === "number" && duration >= 0 && Number.isFinite(duration))) {
    throw new RangeError(`drawIn: duration must be 0 ms or more, got ${String(duration)}.`);
  }
  if (faint !== undefined && !(typeof faint === "number" && faint >= 0 && faint <= 1)) {
    throw new RangeError(`drawIn: faint must be from 0 to 1, got ${String(faint)}.`);
  }
}
