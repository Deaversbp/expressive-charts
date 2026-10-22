// The chart's legend: a swatch and a name for each series (bars, when there's more than one) or each
// category (a donut's slices), above the chart, then any entries the page adds for colours its effects
// draw. Swatches take their colours from the chart's ColorAssignment, so an entry keeps its colour
// through every change, and a page's entries from their own colour; the names (the series' labels, the
// categories or the page's labels) are in the theme's text colour, never a series colour.

import type { ColorAssignment } from "./colors";
import { cssColor, markColorStyles, seriesColors } from "./render/theme";
import type { ChartOptions, LegendEntry, LegendOptions } from "./types";

/** The `legend` option. */
export type LegendOption = ChartOptions<unknown>["legend"];

export interface Legend {
  /**
   * Shows `series` in order, each named by its label, then the page's entries from `option`; or
   * removes the legend when `option` is false, or when it would list fewer than two entries in all.
   */
  update(series: readonly { readonly series: string; readonly label: string }[], colors: ColorAssignment, option: LegendOption): void;
  /**
   * Shows `categories` in order, each coloured by its key and named by its category, then the page's
   * entries; or removes the legend when there are no categories or `option` is false. One category is
   * listed too: it names the colour.
   */
  categories(categories: readonly { readonly key: string; readonly label: string }[], colors: ColorAssignment, option: LegendOption): void;
  destroy(): void;
}

/** Throws on a `legend` option that isn't true, false or an object of valid entries. `chart` names the chart in the message. */
export function checkLegendOption(option: unknown, chart: string): void {
  if (option === undefined || typeof option === "boolean") return;
  const fail = (what: string): never => {
    throw new TypeError(`${chart}: ${what}`);
  };
  if (typeof option !== "object" || option === null || Array.isArray(option)) fail("legend must be true or false, or an object with the entries the page adds.");
  const { entries } = option as LegendOptions;
  if (entries === undefined) return;
  if (!Array.isArray(entries)) fail("legend.entries must be an array of { label, color }.");
  entries.forEach((entry: Partial<LegendEntry> | null, i: number) => {
    const { label, color } = typeof entry === "object" && entry !== null ? entry : fail(`legend.entries[${i}] must be an object with a label and a color.`);
    if (typeof label !== "string" || label.trim() === "") fail(`legend.entries[${i}].label must be a non-empty string: the entry's name.`);
    if (typeof color !== "string" || color.trim() === "") fail(`legend.entries[${i}].color must be a theme token or a CSS colour.`);
    if (color === "mark" || color === "mark-strong") fail(`legend.entries[${i}].color can't be "${color}": an entry has no mark. Use a theme token or a CSS colour.`);
  });
}

/** The entries the page adds, from the option. */
const extras = (option: LegendOption): readonly LegendEntry[] => (typeof option === "object" ? (option.entries ?? []) : []);

/** The legend for a chart's <svg>: made when it's first needed, just before the <svg>. */
export function chartLegend(svg: SVGSVGElement): Legend {
  let legend: HTMLDivElement | undefined;
  /** What the legend shows: the entries, their names and their colours. */
  let drawn = "";

  const remove = (): void => {
    legend?.remove();
    legend = undefined;
    drawn = "";
  };

  /**
   * Draws the chart's entries, then the page's; `attribute` names each of the chart's entries' key on
   * its element (data-series or data-key).
   */
  const draw = (entries: readonly { readonly key: string; readonly label: string }[], colors: ColorAssignment, attribute: string, more: readonly LegendEntry[]): void => {
    const items = [
      ...entries.map(({ key, label }) => ({ key, label, styles: markColorStyles(seriesColors(colors.slot(key))) })),
      ...more.map(({ label, color }) => ({ key: undefined, label, styles: { "--ec-mark": cssColor(color) } }))
    ];
    const doc = svg.ownerDocument;
    legend ??= Object.assign(doc.createElement("div"), { className: "ec-legend" });
    if (legend.nextSibling !== svg) svg.before(legend);
    const id = JSON.stringify([attribute, items]);
    if (id === drawn) return;
    drawn = id;
    legend.replaceChildren(
      ...items.map(({ key, label: text, styles }) => {
        const item = doc.createElement("span");
        item.className = "ec-legend-item";
        if (key !== undefined) item.setAttribute(attribute, key);
        // The swatch reads --ec-mark, as a mark's segments do.
        for (const [property, value] of Object.entries(styles)) if (value !== undefined) item.style.setProperty(property, value);
        const swatch = doc.createElement("span");
        swatch.className = "ec-legend-swatch";
        const label = doc.createElement("span");
        label.className = "ec-legend-label";
        label.textContent = text;
        item.append(swatch, label);
        return item;
      })
    );
  };

  return {
    update(series, colors, option) {
      const more = extras(option);
      if (option === false || series.length + more.length < 2) remove();
      else draw(series.map(({ series: key, label }) => ({ key, label })), colors, "data-series", more);
    },
    categories(categories, colors, option) {
      if (option === false || categories.length === 0) remove();
      else draw(categories, colors, "data-key", extras(option));
    },
    destroy: remove
  };
}
