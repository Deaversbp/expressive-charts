// Reference charts. They import only from core and never name an effect: the composition root
// (src/index.ts) hands them the preset and icon registries through ChartEnv.

export { barChart, type BarChart } from "./bar";
export { donutChart, type DonutChart } from "./donut";
export type { ChartEnv } from "./shell/setup";
export { expressive, type Attachment, type ExpressiveOptions, type HostMark, type MarkSource } from "./adapter";
export { colorAssignment, type ColorAssignment } from "./colors";
export { styleOptions, type StyleOptions } from "./render/theme";
export type {
  Accessor,
  BarChartOptions,
  Chart,
  ChartChange,
  ChartOptions,
  DonutChartOptions,
  KeyOfType,
  LegendEntry,
  LegendOptions,
  MarkEvent,
  MarkEvents,
  MarkSummary,
  NumericKey,
  SliceSummary,
  TableColumn,
  TableOptions
} from "./types";
