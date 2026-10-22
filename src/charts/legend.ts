// The chart's legend: a swatch and a name for each series (bars, when there's more than one) or each
// category (a donut's slices), above the chart. Swatches take their colours from the chart's
// ColorAssignment, so an entry keeps its colour through every change; the names (the series' labels,
// or the categories) are in the theme's text colour, never a series colour.

import type { ColorAssignment } from "./colors";
import { markColorStyles, seriesColors } from "./render/theme";

export interface Legend {
  /** Shows `series` in order, each named by its label, or removes the legend when there are fewer than two or `show` is false. */
  update(series: readonly { readonly series: string; readonly label: string }[], colors: ColorAssignment, show: boolean): void;
  /**
   * Shows `categories` in order, each coloured by its key and named by its category, or removes the
   * legend when there are none or `show` is false. One category is listed too: it names the colour.
   */
  categories(categories: readonly { readonly key: string; readonly label: string }[], colors: ColorAssignment, show: boolean): void;
  destroy(): void;
}

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

  /** Draws the entries; `attribute` names each one's key on its element (data-series or data-key). */
  const draw = (entries: readonly { readonly key: string; readonly label: string }[], colors: ColorAssignment, attribute: string): void => {
    const items = entries.map(({ key, label }) => ({ key, label, colors: seriesColors(colors.slot(key)) }));
    const doc = svg.ownerDocument;
    legend ??= Object.assign(doc.createElement("div"), { className: "ec-legend" });
    if (legend.nextSibling !== svg) svg.before(legend);
    const id = JSON.stringify([attribute, items]);
    if (id === drawn) return;
    drawn = id;
    legend.replaceChildren(
      ...items.map(({ key, label: text, colors: itemColors }) => {
        const item = doc.createElement("span");
        item.className = "ec-legend-item";
        item.setAttribute(attribute, key);
        // The swatch reads --ec-mark, as a mark's segments do.
        for (const [property, value] of Object.entries(markColorStyles(itemColors))) if (value !== undefined) item.style.setProperty(property, value);
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
    update(series, colors, show) {
      if (!show || series.length < 2) remove();
      else draw(series.map(({ series: key, label }) => ({ key, label })), colors, "data-series");
    },
    categories(categories, colors, show) {
      if (!show || categories.length === 0) remove();
      else draw(categories, colors, "data-key");
    },
    destroy: remove
  };
}
