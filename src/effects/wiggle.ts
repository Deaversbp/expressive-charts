// wiggle: a short damped rotation of the mark about its pivot, for hover (`on: { hover: "wiggle" }`).
// It reads only the pivot and the outline, so a bar rocks on its baseline and a donut slice about the
// donut's centre, and the angle is capped so no part of the mark moves more than a few px.

import { linear, matrix } from "../core";
import type { EffectContext, GeometryEffect, MarkGeometry } from "../core";

export interface WiggleOptions {
  /** How far the point of the mark farthest from its pivot may move, px: more than 0, at most 3. Default 3. */
  readonly swing?: number;
}

/** Base duration, with effect timing. */
const DURATION = 450;
/** Each half-swing's share of the cap, alternating sides: three, each smaller than the last. */
const SWINGS = [1, -0.5, 0.25];
const SWING = 3;
/** A mark whose outline is all within this of its pivot doesn't move. */
const MIN_REACH = 0.5;
/** Outline points measured to find the reach. */
const SAMPLES = 64;
/** Never more than 15°, so a tiny mark nods instead of spinning, however little it moves. */
const MAX_ANGLE = Math.PI / 12;

/**
 * Rocks the mark about `mark.pivot` in three decaying half-swings over a 450 ms base. The angle is
 * capped so the outline point farthest from the pivot moves at most `swing` px: effects never
 * distort data, and a few px of movement reads as emphasis, not as a change of value.
 *
 * Its end state is no transform: the mark rests where the chart drew it.
 */
export function wiggle(options: WiggleOptions = {}): GeometryEffect {
  checkOptions(options);
  const swing = options.swing ?? SWING;

  return {
    kind: "geometry",
    async run(mark, ctx) {
      if (ctx.signal.aborted) return;
      // Follow the geometry, so a wiggle running alongside a transition rocks about the pivot as it is now.
      let current = mark;
      let cap = limit(mark, swing);
      let progress = 0;
      const show = (): void => {
        const angle = cap * rock(progress);
        ctx.mark.set({ transform: angle === 0 ? undefined : matrix.rotate(angle, current.pivot) });
      };
      ctx.onChange((next) => {
        current = next;
        cap = limit(next, swing);
        show();
      });
      // Linear here: each half-swing eases itself.
      await ctx.tween({
        duration: DURATION,
        timing: "effect",
        ease: linear,
        update: (p) => {
          progress = p;
          show();
        }
      }).finished;
    },
    end() {},
    clear() {}
  };
}

/**
 * The largest angle, in radians, that moves no outline point more than `swing` px. A point at
 * distance r from the pivot, turned by θ, moves along a chord of 2r·sin(θ/2).
 */
function limit(mark: MarkGeometry, swing: number): number {
  const { pivot } = mark;
  let reach = 0;
  for (const point of mark.outline.sample(SAMPLES)) reach = Math.max(reach, Math.hypot(point.x - pivot.x, point.y - pivot.y));
  if (!(reach >= MIN_REACH)) return 0;
  return Math.min(MAX_ANGLE, 2 * Math.asin(Math.min(1, swing / (2 * reach))));
}

/** The share of the cap at linear progress t, 0–1: each half-swing a sine arch, 0 at both ends. */
function rock(t: number): number {
  if (!(t > 0) || t >= 1) return 0;
  const position = t * SWINGS.length;
  const index = Math.floor(position);
  return SWINGS[index]! * Math.sin(Math.PI * (position - index));
}

function checkOptions(options: WiggleOptions): void {
  const { swing } = options;
  if (swing !== undefined && !(typeof swing === "number" && swing > 0 && swing <= SWING)) {
    throw new RangeError(`wiggle: swing must be more than 0 and at most ${SWING} px, got ${String(swing)}.`);
  }
}
