import { defineDataEffect, offset, type MarkData, type MarkGeometry, type TextStyle } from "expressive-charts";

const finalValue = (data: MarkData | undefined): number => {
  const samples = data?.samples ?? [];
  return samples[samples.length - 1]?.value ?? 0;
};

/**
 * "+2" just beyond the end of a mark whose value changed. It rises into place and stays until the
 * next update clears it. It doesn't fade away: reduced motion shows only the end state, which would
 * then never show the change at all.
 */
export const delta = (format = (n: number) => (n > 0 ? `+${n}` : `${n}`)) =>
  defineDataEffect({
    async run(mark, data, ctx) {
      const change = finalValue(data) - finalValue(data.previous);
      if (change === 0) return;
      const { at, anchor } = place(mark);
      const up = mark.angle(1) - Math.PI / 2;
      const label = ctx.layer.text(format(change), { at: offset(at, up, -8), anchor, opacity: 0 });
      await ctx.tween({
        duration: 400,
        timing: "effect",
        update: (p) => label.update({ opacity: p, at: offset(at, up, -8 * (1 - p)) })
      }).finished;
    },
    end(mark, data, ctx) {
      const change = finalValue(data) - finalValue(data.previous);
      // The same fields the run's last frame leaves, opacity included, so the two compare equal.
      if (change !== 0) ctx.layer.text(format(change), { ...place(mark), opacity: 1 });
    }
  });

/** 10 px past the end of the walk, the text reading away from the mark whichever way it grows. */
function place(mark: MarkGeometry): Pick<TextStyle, "at" | "anchor"> {
  const heading = mark.angle(1);
  return { at: offset(mark.end, heading, 10), anchor: Math.abs(heading) > Math.PI / 2 ? "end" : "start" };
}
