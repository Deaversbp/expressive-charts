// Reference charts. They import only from core and never name an effect: the composition root
// (src/index.ts) hands them the preset and icon registries through ChartEnv.

export { barChart, type BarChart } from "./bar";
export { donutChart, type DonutChart } from "./donut";
export { lineChart } from "./line";
export type { ChartEnv } from "./shell/setup";
export {
  expressive,
  fromVegaView,
  type Attachment,
  type ExpressiveOptions,
  type HostMark,
  type MarkSource,
  type VegaAttachment,
  type VegaItem,
  type VegaMark,
  type VegaOptions,
  type VegaSample,
  type VegaViewLike
} from "./adapter";
export { colorAssignment, type ColorAssignment } from "./colors";
export {
  chartSwitch,
  type ChartSwitch,
  type ChartSwitchOptions,
  type ChartSwitchView,
  type ChartSwitchViewFactory,
  type ChartSwitchViewName,
  type ChartSwitchViews
} from "./switch";
export { styleOptions, type StyleOptions } from "./render/theme";
export type {
  Accessor,
  BarChartOptions,
  Chart,
  ChartChange,
  ChartLabel,
  ChartOptions,
  DonutChartOptions,
  KeyOfType,
  LegendEntry,
  LegendOptions,
  LineChart,
  LineChartOptions,
  MarkEvent,
  MarkEvents,
  MarkSummary,
  NumericKey,
  SliceSummary,
  TableColumn,
  TableOptions
} from "./types";
