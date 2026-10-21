// Reference charts. They import only from core and never name an effect: the composition root
// (src/index.ts) hands them the preset and icon registries through ChartEnv.

export { barChart, type BarChart, type ChartEnv } from "./bar";
export { expressive, type Attachment, type ExpressiveOptions, type MarkSource } from "./adapter";
export { colorAssignment, type ColorAssignment } from "./colors";
export { styleOptions, type StyleOptions } from "./render/theme";
export type { Accessor, BarChartOptions, Chart, ChartChange, ChartOptions, KeyOfType, MarkEvent, MarkEvents, NumericKey, TableColumn, TableOptions } from "./types";
