// Effects written by someone outside the project, against the public author API. They're the worked
// examples in docs/effects-guide.md: ./effects/trace.ts and ./effects/delta.ts.
import { barChart, defineDataEffect, expressive, sequence, threshold, type DataEffect } from "expressive-charts";
import { checkEffect } from "expressive-charts/testing";
import { delta } from "./effects/delta";
import { trace } from "./effects/trace";

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

// The conformance suite checks an effect on every kind of mark, in any test runner: it throws one
// Error listing every failure.
await checkEffect(trace());
await checkEffect(delta());
// An effect typed for its own rows is checked on those rows: data(mark) gives each mark's.
// @ts-expect-error revenueOnly reads Region rows, so the suite needs data(mark) to give them.
await checkEffect(revenueOnly);
await checkEffect(revenueOnly, { data: (mark) => ({ datum: sales.find((d) => d.region === mark.key)!, samples: [], related: () => undefined }) });
