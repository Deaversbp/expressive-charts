import { defineEffect, type Color } from "expressive-charts";

/**
 * A highlighter stroke that draws itself along the mark's walk, then stays. Its end state is the
 * finished stroke, so reduced motion shows the same thing a full run ends with.
 */
export const trace = (color: Color = "mark") =>
  defineEffect({
    async run(mark, ctx) {
      const stroke = ctx.layer.path(mark.slice(0, 0), { stroke: color, width: 3, opacity: 0.5, linecap: "round" });
      await ctx.tween({ duration: 500, timing: "effect", update: (p) => stroke.update(mark.slice(0, p)) }).finished;
    },
    end(mark, ctx) {
      ctx.layer.path(mark.slice(0, 1), { stroke: color, width: 3, opacity: 0.5, linecap: "round" });
    }
  });
