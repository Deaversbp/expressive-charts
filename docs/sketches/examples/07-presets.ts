// One-liners for people who don't want to compose anything.
import { barChart, donutChart, pulse, registerPreset, sequence, wiggle } from "expressive-charts";

interface Region {
  region: string;
  revenue: number;
}
declare const sales: Region[];

barChart("#sales", { label: "Revenue by region", data: sales, y: "region", x: "revenue", on: { hover: "wiggle" } });

// A team's house style, registered once and used by name.
registerPreset("nudge", () => sequence(wiggle({ swing: 2 }), pulse({ times: 1 })));
donutChart("#share", { label: "Revenue share", data: sales, category: "region", value: "revenue", on: { hover: "nudge" } });

// Typos in preset names are not type errors (custom names are allowed); the chart throws when created.
barChart("#typo", { label: "Typo", data: sales, y: "region", x: "revenue", on: { hover: "wigle" } });
