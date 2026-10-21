// Series names for people. A series is named after its field ("goals"; a value read by a function is
// "value"); `seriesLabels` gives it a name to show instead, used as given wherever the chart names it.

import type { ChartOptions } from "./types";

/** The `seriesLabels` option. */
export type SeriesLabels = ChartOptions<unknown>["seriesLabels"];

/** The series' name for people: its label, or its own name. Only the object's own keys count, so "constructor" is just a series. */
export function seriesLabel(labels: SeriesLabels, series: string): string {
  return labels !== undefined && Object.prototype.hasOwnProperty.call(labels, series) ? (labels[series] ?? series) : series;
}

/** Throws on a `seriesLabels` option that isn't an object of names. `chart` names the chart in the message. */
export function checkSeriesLabels(option: unknown, chart: string): void {
  if (option === undefined) return;
  if (typeof option !== "object" || option === null || Array.isArray(option)) throw new TypeError(`${chart}: seriesLabels must be an object of names by series, as { goals: "Goals" }.`);
  for (const [series, label] of Object.entries(option)) {
    if (typeof label !== "string" || label.trim() === "") throw new TypeError(`${chart}: seriesLabels.${series} must be a name, not ${typeof label === "string" ? "blank" : String(label)}.`);
  }
}
