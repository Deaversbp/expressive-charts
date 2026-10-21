// What a reference chart needs before it draws: the environment the composition root hands it, its
// container and width, its accessible name, and a check that data effects find the series they read.

import type { Clock, IconSource, Motion } from "../../core";
import { EFFECT_SLOTS, type PresetFactory, type Registry } from "../../core/registry";
import type { SlotEffects } from "../../core/runner";
import { svgElement } from "../render/svg";
import { checkSeriesLabels } from "../series";
import { checkTableOption } from "../table";

/** What the composition root hands every chart, so charts never import the registries or effects. */
export interface ChartEnv {
  /** Resolves preset names in `on`. */
  readonly presets: Pick<Registry<PresetFactory>, "resolve">;
  /** Resolves icon names for effects. */
  readonly icons: IconSource;
  /** The page-wide motion: the default, and what a mode given as a string follows. */
  readonly motion: Motion;
  /** Default: the page-wide clock. */
  readonly clock?: Clock;
}

/** Used when the container has no width yet (hidden, or no layout as in jsdom); the prototype's width. */
const FALLBACK_WIDTH = 640;

/** The container: the element, or the one a selector matches. `chart` names the chart in errors. */
export function resolveTarget(target: string | Element, chart: string): Element {
  if (typeof target === "string") {
    const found = typeof document === "undefined" ? null : document.querySelector(target);
    if (!found) throw new TypeError(`${chart}: no element matches "${target}".`);
    return found;
  }
  if (!target || typeof (target as Element).appendChild !== "function") throw new TypeError(`${chart} needs a container element or a selector.`);
  return target;
}

/** The container's content width in px; a fallback when it has none (hidden, or no layout). */
export function containerWidth(container: Element): number {
  const style = container.ownerDocument.defaultView?.getComputedStyle(container);
  const padding = (parseFloat(style?.paddingLeft ?? "") || 0) + (parseFloat(style?.paddingRight ?? "") || 0);
  const width = container.clientWidth - padding;
  return width > 0 ? width : FALLBACK_WIDTH;
}

/** The <svg>'s accessible name (`label`) and description (`description`, in a <desc>). */
export function describeChart(svg: SVGSVGElement, options: { readonly label: string; readonly description?: string | undefined }): void {
  svg.setAttribute("aria-label", options.label);
  let desc = svg.querySelector(":scope > desc");
  if (options.description) {
    desc ??= svg.insertBefore(svgElement("desc", {}, svg), svg.firstChild);
    desc.textContent = options.description;
  } else {
    desc?.remove();
  }
}

/**
 * Data effects name the series they read through `needs.related`. A chart without one of them
 * throws when it's created or updated, rather than the effect finding nothing when it runs.
 */
export function checkNeeds<D>(effects: SlotEffects<D>, series: readonly string[], chart: string): void {
  for (const slot of EFFECT_SLOTS) {
    const effect = effects[slot];
    if (effect?.kind !== "data") continue;
    for (const name of effect.needs?.related ?? []) {
      if (series.includes(name)) continue;
      throw new RangeError(`${chart}: on.${slot} needs the series "${name}", but the chart's series are ${series.map((s) => `"${s}"`).join(", ")}.`);
    }
  }
}

/** The options every chart takes, as checkChartOptions reads them. */
type CommonOptions = { readonly [K in "label" | "data" | "width" | "height" | "tooltip" | "markLabel" | "markDescription" | "legend" | "seriesLabels" | "table" | "announce"]?: unknown };

/** Throws on the options every chart shares when they're the wrong kind of thing. `chart` names the chart in the message. */
export function checkChartOptions(options: CommonOptions, chart: string): void {
  if (typeof options !== "object" || options === null) throw new TypeError(`${chart} needs options.`);
  if (typeof options.label !== "string" || options.label.trim() === "") throw new TypeError(`${chart} needs a label: the chart's accessible name.`);
  if (!Array.isArray(options.data)) throw new TypeError(`${chart}: data must be an array of rows.`);
  for (const field of ["width", "height"] as const) {
    const value = options[field];
    if (value !== undefined && !(typeof value === "number" && Number.isFinite(value) && value > 0)) throw new RangeError(`${chart}: ${field} must be a positive number of px, got ${String(value)}.`);
  }
  const { tooltip, markLabel, markDescription, legend, announce } = options;
  if (tooltip !== undefined && typeof tooltip !== "boolean" && typeof tooltip !== "function") throw new TypeError(`${chart}: tooltip must be true, false or a function that returns a row's text.`);
  if (markLabel !== undefined && typeof markLabel !== "function") throw new TypeError(`${chart}: markLabel must be a function that returns a mark's accessible name.`);
  if (markDescription !== undefined && markDescription !== false && typeof markDescription !== "function") {
    throw new TypeError(`${chart}: markDescription must be false or a function that returns a mark's accessible description.`);
  }
  if (legend !== undefined && typeof legend !== "boolean") throw new TypeError(`${chart}: legend must be true or false.`);
  checkSeriesLabels(options.seriesLabels, chart);
  checkTableOption(options.table, chart);
  if (announce !== undefined && typeof announce !== "boolean" && typeof announce !== "function") throw new TypeError(`${chart}: announce must be true, false or a function that returns the text to announce.`);
}
