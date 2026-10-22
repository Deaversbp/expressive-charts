// "Someone else's chart", a third time: the season as a Vega-Lite line, compiled with vega-lite and
// rendered by a vega View with the SVG renderer, as vega-embed would render it. Like d3-line.ts it
// knows nothing about expressive-charts; demo/line.ts attaches the effects with fromVegaView().
//
// Vega writes its colours as attributes, so the page's CSS maps the two it's given here to the
// theme's tokens (see line.html), and its axes and legend are styled or replaced the same way.

import { View, parse } from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import type { Week } from "./d3-line";

/** One row per week and series: Vega-Lite's long form, with the series as a colour. */
export interface Row {
  readonly week: number;
  readonly series: "goals" | "xg";
  readonly value: number;
}

export interface VegaLine {
  readonly view: View;
  /** Draws it again at the box's width. */
  resize(): Promise<void>;
}

/** The colours Vega is given; line.html's CSS maps them to the theme, light or dark. */
export const GOALS_STROKE = "#2a78d6";
export const XG_STROKE = "#75736d";
const HEIGHT = 200;
const STROKE = 2.25;

export const rowsOf = (season: readonly Week[]): Row[] =>
  season.flatMap((w) => [
    { week: w.week, series: "goals" as const, value: w.goals },
    { week: w.week, series: "xg" as const, value: w.xg }
  ]);

/** The width inside the box's padding, never under 280 px. */
function roomIn(box: HTMLElement): number {
  const style = getComputedStyle(box);
  return Math.max(280, Math.floor(box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
}

function spec(season: readonly Week[], width: number): TopLevelSpec {
  const first = season[0]!.week;
  const last = season[season.length - 1]!.week;
  const top = Math.ceil(Math.max(...season.map((w) => Math.max(w.goals, w.xg))) / 10) * 10;
  return {
    width: width - 44,
    height: HEIGHT,
    autosize: { type: "pad" },
    background: "transparent",
    data: { name: "season", values: rowsOf(season) },
    mark: { type: "line", strokeWidth: STROKE, strokeCap: "butt", strokeJoin: "round" },
    encoding: {
      x: {
        field: "week",
        type: "quantitative",
        title: null,
        scale: { domain: [first, last], nice: false, zero: false },
        axis: { values: [first, 10, 20, 30, last], grid: false, labelExpr: `datum.value == ${first} ? 'MW ${first}' : datum.label` }
      },
      y: { field: "value", type: "quantitative", title: null, scale: { domain: [0, top], nice: false }, axis: { tickCount: 4, domain: false, ticks: false } },
      color: { field: "series", type: "nominal", scale: { domain: ["goals", "xg"], range: [GOALS_STROKE, XG_STROKE] }, legend: null },
      strokeDash: { field: "series", type: "nominal", scale: { domain: ["goals", "xg"], range: [[1, 0], [6, 4]] }, legend: null }
    },
    // The page names the chart and its lines itself; Vega's own descriptions would be read beside them.
    config: { aria: false, view: { stroke: null }, axis: { labelFontSize: 11, labelPadding: 6 } }
  };
}

/** Draws the season in `box` as a Vega-Lite line, with the SVG renderer. */
export async function drawVegaLine(box: HTMLElement, season: readonly Week[]): Promise<VegaLine> {
  let width = roomIn(box);
  const view = new View(parse(compile(spec(season, width)).spec), { renderer: "svg", container: box, hover: false });
  await view.runAsync();
  return {
    view,
    async resize() {
      const next = roomIn(box);
      if (next === width) return;
      width = next;
      await view.width(width - 44).runAsync();
    }
  };
}
