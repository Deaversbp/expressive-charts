// The chart's legend: a swatch and a name for each series, above the chart, when it shows more than
// one. Swatches take their colours from the chart's ColorAssignment, so a series keeps its colour
// through every change; the names (the series' labels) are in the theme's text colour, never a series colour.

import type { ColorAssignment } from "./colors";
import { markColorStyles, seriesColors } from "./render/theme";

export interface Legend {
  /** Shows `series` in order, each named by its label, or removes the legend when there are fewer than two or `show` is false. */
  update(series: readonly { readonly series: string; readonly label: string }[], colors: ColorAssignment, show: boolean): void;
  destroy(): void;
}

/** The legend for a chart's <svg>: made when it's first needed, just before the <svg>. */
export function chartLegend(svg: SVGSVGElement): Legend {
  let legend: HTMLDivElement | undefined;
  /** What the legend shows: the series, their labels and their colours. */
  let drawn = "";

  const remove = (): void => {
    legend?.remove();
    legend = undefined;
    drawn = "";
  };

  return {
    update(series, colors, show) {
      if (!show || series.length < 2) {
        remove();
        return;
      }
      const items = series.map(({ series: name, label }) => ({ name, label, colors: seriesColors(colors.slot(name)) }));
      const doc = svg.ownerDocument;
      legend ??= Object.assign(doc.createElement("div"), { className: "ec-legend" });
      if (legend.nextSibling !== svg) svg.before(legend);
      const key = JSON.stringify(items);
      if (key === drawn) return;
      drawn = key;
      legend.replaceChildren(
        ...items.map(({ name, label: text, colors: itemColors }) => {
          const item = doc.createElement("span");
          item.className = "ec-legend-item";
          item.setAttribute("data-series", name);
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
    },
    destroy: remove
  };
}
