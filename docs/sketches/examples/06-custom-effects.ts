// Effects written by someone outside the project, against the experimental author API.
import { barChart, defineDataEffect, defineEffect, expressive, offset, sequence, threshold, type DataEffect, type MarkData } from "expressive-charts";

/**
 * A highlighter stroke that draws itself along the walk, then stays.
 * Ends where end() starts, so reduced motion shows the finished stroke.
 */
export const trace = (color = "mark") =>
  defineEffect({
    async run(mark, ctx) {
      const stroke = ctx.layer.path(mark.slice(0, 0), { stroke: color, width: 3, opacity: 0.5, linecap: "round" });
      await ctx.tween({ duration: 500, timing: "effect", update: (p) => stroke.update(mark.slice(0, p)) }).finished;
    },
    end(mark, ctx) {
      ctx.layer.path(mark.slice(0, 1), { stroke: color, width: 3, opacity: 0.5, linecap: "round" });
    }
  });

const finalValue = (data: MarkData | undefined): number => {
  const samples = data?.samples ?? [];
  return samples[samples.length - 1]?.value ?? 0;
};

/**
 * "+2" beside a bar whose value just changed. It rises into place and stays until the next
 * update clears it. It doesn't fade away: then reduced motion (end state only) would never
 * show the change at all.
 */
export const delta = (format = (n: number) => (n > 0 ? `+${n}` : `${n}`)) =>
  defineDataEffect({
    async run(mark, data, ctx) {
      const change = finalValue(data) - finalValue(data.previous);
      if (change === 0) return;
      const rest = offset(mark.end, mark.angle(1), 10);
      const label = ctx.layer.text(format(change), { at: offset(rest, mark.angle(1) - Math.PI / 2, -8), anchor: "start", opacity: 0 });
      await ctx.tween({
        duration: 400,
        timing: "effect",
        update: (p) => label.update({ opacity: p, at: offset(rest, mark.angle(1) - Math.PI / 2, -8 * (1 - p)) })
      }).finished;
    },
    end(mark, data, ctx) {
      const change = finalValue(data) - finalValue(data.previous);
      if (change !== 0) ctx.layer.text(format(change), { at: offset(mark.end, mark.angle(1), 10), anchor: "start" });
    }
  });

interface Region {
  region: string;
  revenue: number;
}
declare const sales: Region[];
declare const otherLibraryBars: NodeListOf<SVGRectElement>;

// The same custom effects on a reference chart...
barChart("#sales", { label: "Revenue by region", data: sales, y: "region", x: "revenue", on: { hover: trace(), update: delta() } });

// ...and on another library's bars.
expressive<Region>(otherLibraryBars, {
  key: (d) => d.region,
  baseline: "auto",
  on: { hover: trace("text-muted"), update: delta() }
});

// A data effect written for one kind of row can't be used on a chart of another.
const revenueOnly = defineDataEffect<Region>({
  async run(_mark, data) {
    console.debug(data.datum.revenue);
  },
  end() {}
});
interface Team {
  team: string;
  points: number;
}
declare const teams: Team[];
// @ts-expect-error Region effect on a chart of Team rows.
barChart("#bad", { label: "Bad", data: teams, y: "team", x: "points", on: { update: revenueOnly } });

// Combining doesn't launder a requirement: a generic effect alongside a Region effect still needs Region rows.
export const regionStory = sequence(revenueOnly, threshold({ compareTo: 0 }));
barChart("#ok", { label: "OK", data: sales, y: "region", x: "revenue", on: { update: regionStory } });
// @ts-expect-error the combination still reads datum.revenue.
barChart("#bad", { label: "Bad", data: teams, y: "team", x: "points", on: { update: regionStory } });

// An effect that needs more fields than the rows have is rejected too.
declare const needsMore: DataEffect<Region & { target: number }>;
// @ts-expect-error Region rows have no target field.
barChart("#bad", { label: "Bad", data: sales, y: "region", x: "revenue", on: { update: needsMore } });
