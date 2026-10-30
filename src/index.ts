// Public entry point and composition root: the only file that brings charts and effects together.
// Exports are added here as each layer is built. See docs/architecture.md for the design.

import { motion as pageMotion, type Motion, type TransitionEffect } from "./core";
import {
  barChart as drawBarChart,
  chartSwitch as buildChartSwitch,
  donutChart as drawDonutChart,
  expressive as attach,
  fromVegaView as attachVega,
  lineChart as drawLineChart,
  type Attachment,
  type BarChart,
  type BarChartOptions,
  type ChartEnv,
  type ChartSwitch,
  type ChartSwitchOptions,
  type ChartSwitchViews,
  type DonutChart,
  type DonutChartOptions,
  type ExpressiveOptions,
  type LineChart,
  type LineChartOptions,
  type MarkSource,
  type VegaAttachment,
  type VegaOptions,
  type VegaViewLike
} from "./charts";
import { motionSwitch as buildMotionSwitch, type MotionSwitch, type MotionSwitchOptions } from "./charts/controls";
import { morph } from "./effects";
import { iconRegistry, presetRegistry } from "./registries";

export const VERSION = "0.5.0";

export * from "./core";
export * from "./effects";
export * from "./icons";
export { registerIcon, registerIcons, registerPreset } from "./registries";
export { configure } from "./settings";
export { colorAssignment, link } from "./charts";
export type {
  Accessor,
  Attachment,
  BarChart,
  BarChartOptions,
  Chart,
  ChartChange,
  ChartLabel,
  ChartOptions,
  ChartSwitch,
  ChartSwitchOptions,
  ChartSwitchPaint,
  ChartSwitchView,
  ChartSwitchViewFactory,
  ChartSwitchViewName,
  ChartSwitchViews,
  ColorAssignment,
  DonutChart,
  DonutChartOptions,
  ExpressiveOptions,
  HostMark,
  KeyOfType,
  LegendEntry,
  LegendOptions,
  LineChart,
  Link,
  LinkOptions,
  LinkSource,
  LineChartOptions,
  MarkEvent,
  MarkEvents,
  MarkSource,
  MarkSummary,
  NumericKey,
  SliceSummary,
  StyleOptions,
  TableColumn,
  TableOptions,
  VegaAttachment,
  VegaItem,
  VegaMark,
  VegaOptions,
  VegaSample,
  VegaViewLike
} from "./charts";
export { playButton } from "./charts/controls";
export type { MotionSwitch, MotionSwitchOptions, PlayButton, PlayButtonOptions } from "./charts/controls";

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
 * A donut chart in `target` (an element or a selector). `category` names each slice and `value` sizes
 * it; slices go clockwise from 12 o'clock, in data order or largest first with `sort: "value"`; `on`
 * attaches effects by slot.
 */
export function donutChart<D>(target: string | Element, options: DonutChartOptions<D>): DonutChart<D> {
  return drawDonutChart(target, options, env);
}

/**
 * A line chart in `target` (an element or a selector): one row per `x`, a number or a Date, a line
 * per field in `series`, with a point per row and series that shows where its x is hovered or
 * focused. `reveal(x)` shows the data up to x, as `playback()` drives it; `on` attaches effects by slot.
 */
export function lineChart<D>(target: string | Element, options: LineChartOptions<D>): LineChart<D> {
  return drawLineChart(target, options, env);
}

/**
 * Views of the same data in `target` (an element or a selector), one shown at a time: `show(view)`
 * turns each mark into the mark with its key in the other view with `transition`, morph() by default,
 * while the labels move and swap their text. Each view's function draws its chart in the container
 * it's given; pass it the `colors` it's given too, so a key keeps its colour from view to view.
 */
export function chartSwitch<T extends ChartSwitchViews>(target: string | Element, options: ChartSwitchOptions<T>): ChartSwitch<T> {
  // Charts never import effects: the default transition is filled in here.
  const filled = typeof options === "object" && options !== null && options.transition === undefined ? { ...options, transition: morph() } : options;
  return buildChartSwitch(target, filled as ChartSwitchOptions<T> & { readonly transition: TransitionEffect }, env);
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
 * Adds effects to a Vega or Vega-Lite chart rendered as SVG (vega-embed's default): the View's mark
 * named `mark` ("marks", Vega-Lite's data mark, by default), read from its scenegraph. Rects are bars,
 * arcs slices, symbols points and lines lines; `sample` gives data effects their values. It follows
 * the View's own renders, so there's no refresh() to call. `key` is required, as for expressive().
 */
export function fromVegaView<D = Record<string, unknown>>(view: VegaViewLike, options: VegaOptions<D>): VegaAttachment<D> {
  return attachVega(view, options, env);
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
