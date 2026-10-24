// README's first example, as written there, for the capture: an arrow runs out a bar on hover, and
// the bars an update changes blink.
import { barChart, icons, travel } from "../../src/index";

interface Region {
  region: string;
  revenue: number;
}

const regions: Region[] = [
  { region: "North", revenue: 42 },
  { region: "South", revenue: 35 },
  { region: "East", revenue: 51 },
  { region: "West", revenue: 28 },
  { region: "Central", revenue: 19 }
];

barChart<Region>("#sales", {
  label: "Revenue by region",
  data: regions,
  y: "region",
  x: "revenue",
  sort: "value",
  on: {
    hover: travel(icons.arrow),
    update: "flash"
  }
});
