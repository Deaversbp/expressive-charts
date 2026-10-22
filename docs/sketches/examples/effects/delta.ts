import { defineDataEffect, offset, type EffectContext, type MarkData, type MarkGeometry, type TextStyle } from "expressive-charts";

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
      const show = label(mark, ctx, format(change));
      await ctx.tween({ duration: 400, timing: "effect", update: show }).finished;
    },
    end(mark, data, ctx) {
      const change = finalValue(data) - finalValue(data.previous);
      if (change !== 0) label(mark, ctx, format(change))(1);
    }
  });

/**
 * Draws the label at progress p, rising into place and fading in, and keeps it beside the mark's end
 * when the mark moves. The run and end() both draw through it, so they leave the same fields.
 */
function label(mark: MarkGeometry, ctx: EffectContext, content: string): (p: number) => void {
  let current = mark;
  let progress = 0;
  const text = ctx.layer.text(content, { ...place(mark, 0), opacity: 0 });
  const draw = () => text.update({ ...place(current, progress), opacity: progress });
  ctx.onChange((next) => {
    current = next;
    draw();
  });
  return (p) => {
    progress = p;
    draw();
  };
}

/**
 * 10 px past the end of the walk, the text reading away from the mark whichever way it grows. It
 * starts 8 px towards the mark's down side and rises to its place as `rise` goes from 0 to 1.
 */
function place(mark: MarkGeometry, rise: number): Pick<TextStyle, "at" | "anchor"> {
  const heading = mark.angle(1);
  const at = offset(mark.end, heading, 10);
  return { at: offset(at, heading - Math.PI / 2, -8 * (1 - rise)), anchor: Math.abs(heading) > Math.PI / 2 ? "end" : "start" };
}
