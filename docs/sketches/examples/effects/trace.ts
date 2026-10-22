import { defineEffect, type Color, type EffectContext, type MarkGeometry } from "expressive-charts";

/**
 * A highlighter stroke that draws itself along the mark's walk, then stays. Its end state is the
 * finished stroke, so reduced motion shows the same thing a full run ends with.
 */
export const trace = (color: Color = "mark") =>
  defineEffect({
    async run(mark, ctx) {
      const show = stroke(mark, ctx, color);
      await ctx.tween({ duration: 500, timing: "effect", update: show }).finished;
    },
    end(mark, ctx) {
      stroke(mark, ctx, color)(1);
    }
  });

/** Draws the stroke along the walk up to progress p, and keeps it on the mark when the mark moves. */
function stroke(mark: MarkGeometry, ctx: EffectContext, color: Color): (p: number) => void {
  let current = mark;
  let progress = 0;
  const path = ctx.layer.path(mark.slice(0, 0), { stroke: color, width: 3, opacity: 0.5, linecap: "round" });
  const draw = () => path.update(current.slice(0, progress));
  ctx.onChange((next) => {
    current = next;
    draw();
  });
  return (p) => {
    progress = p;
    draw();
  };
}
