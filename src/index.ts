// Public entry point and composition root: the only file that brings charts and effects together.
// Exports are added here as each layer is built. See docs/architecture.md for the design.

import { motion as pageMotion, type Motion } from "./core";
import {
  barChart as drawBarChart,
  expressive as attach,
  type Attachment,
  type BarChart,
  type BarChartOptions,
  type ChartEnv,
  type ExpressiveOptions,
  type MarkSource
} from "./charts";
import { motionSwitch as buildMotionSwitch, type MotionSwitch, type MotionSwitchOptions } from "./charts/controls";
import { iconRegistry, presetRegistry } from "./registries";

export const VERSION = "0.0.0";

export * from "./core";
export * from "./effects";
export * from "./icons";
export { registerIcon, registerIcons, registerPreset } from "./registries";
export { configure } from "./settings";
export { colorAssignment } from "./charts";
export type {
  Accessor,
  Attachment,
  BarChart,
  BarChartOptions,
  Chart,
  ChartOptions,
  ColorAssignment,
  ExpressiveOptions,
  KeyOfType,
  MarkEvent,
  MarkEvents,
  MarkSource,
  NumericKey,
  StyleOptions
} from "./charts";
export type { MotionSwitch, MotionSwitchOptions } from "./charts/controls";

/** Charts resolve preset and icon names through the page-wide registries and follow the page-wide motion. */
const env: ChartEnv = { presets: presetRegistry, icons: iconRegistry, motion: pageMotion };

/**
 * A bar chart in `target` (an element or a selector). The axis whose values aren't numbers is the
 * category; `stack` stacks numeric fields; `on` attaches effects by slot.
 */
export function barChart<D>(target: string | Element, options: BarChartOptions<D>): BarChart<D> {
  return drawBarChart(target, options, env);
}

/**
 * Adds effects to SVG marks drawn by other code: a selector, elements, or a D3 selection (whose data
 * types the callbacks). `key` is required; `on` attaches effects by slot, as on the charts. Call
 * `refresh()` after the host re-renders.
 */
export function expressive<D = unknown>(target: MarkSource<D>, options: ExpressiveOptions<D>): Attachment<D> {
  return attach(target, options, env);
}

/**
 * The viewer's motion control in `target` (an element or a selector): Presentation, Analysis and Off
 * as buttons with `aria-pressed`, and a note on what the mode does. A click is the viewer's own
 * choice (`motion.chooseMode()`), so it overrides the device's reduced-motion setting. Default: the
 * page-wide `motion`. `persist: "key"` saves the choice in localStorage.
 */
export function motionSwitch(target: string | Element, motion: Motion = pageMotion, options?: MotionSwitchOptions): MotionSwitch {
  return buildMotionSwitch(target, motion, options);
}
