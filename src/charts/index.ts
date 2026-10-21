// Reference charts. They import only from core and never name an effect: the composition root
// (src/index.ts) hands them the preset and icon registries through ChartEnv.

export { barChart, type BarChart, type ChartEnv } from "./bar";
export { expressive, type Attachment, type ExpressiveOptions, type MarkSource } from "./adapter";
export { colorAssignment, type ColorAssignment } from "./colors";
export type { Accessor, BarChartOptions, Chart, ChartOptions, KeyOfType, MarkEvent, MarkEvents, NumericKey } from "./types";
