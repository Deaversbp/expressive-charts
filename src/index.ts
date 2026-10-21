// Public entry point and composition root: the only file that brings charts and effects together.
// Exports are added here as each layer is built. See docs/architecture.md for the design.

import { motion } from "./core";
import { barChart as drawBarChart, type BarChart, type BarChartOptions, type ChartEnv } from "./charts";
import { iconRegistry, presetRegistry } from "./registries";

export const VERSION = "0.0.0";

export * from "./core";
export * from "./effects";
export * from "./icons";
export { registerIcon, registerIcons, registerPreset } from "./registries";
export { colorAssignment } from "./charts";
export type { Accessor, BarChart, BarChartOptions, Chart, ChartOptions, ColorAssignment, KeyOfType, MarkEvent, MarkEvents, NumericKey } from "./charts";

/** Charts resolve preset and icon names through the page-wide registries and follow the page-wide motion. */
const env: ChartEnv = { presets: presetRegistry, icons: iconRegistry, motion };

/**
 * A bar chart in `target` (an element or a selector). The axis whose values aren't numbers is the
 * category; `stack` stacks numeric fields; `on` attaches effects by slot.
 */
export function barChart<D>(target: string | Element, options: BarChartOptions<D>): BarChart<D> {
  return drawBarChart(target, options, env);
}
