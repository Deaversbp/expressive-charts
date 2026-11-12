// "Someone else's chart", as bars side by side: each player's goals or assists in the season's first
// half and second half, the first half's bar above the second's, on the dumbbell's rows and axis.
// Drawn the way D3 code would draw it: a <rect> a half joined by its half and player in a margin <g>,
// each rect's half on __data__ as d3-dumbbell.ts gives its dots, the players named down the left as the
// dumbbell names them, and each bar's number past its end. Like d3-dumbbell.ts it knows nothing about
// expressive-charts; demo/layouts-effects.ts attaches the effects with expressive() and makes it a chart
// switch's view with hostView(), beside the dumbbell.
//
// Its axis is drawn as drawDumbbell() draws its own, at the same margins and on the same scale, 0 to
// 10, and its rows are the dumbbell's, in its order, the biggest rise first. Its ARIA is a careful D3
// author's: the axis and the text are hidden, and the page gives the <svg> role="group" and its name.

import { select, type Selection } from "d3-selection";
import { rowsFor, type Dot, type Half, type Metric, type Player, type Row } from "./d3-dumbbell";

export interface DrawnDumbbellBars {
  /** The bars as a D3 selection, a player's first half then second, in the rows' order. */
  readonly bars: Selection<SVGRectElement, Dot, SVGGElement, null>;
}

/** The dumbbell's: a row's height, the margins, and the axis's top. */
const ROW = 32;
const MARGIN = { top: 10, right: 18, bottom: 40, left: 86 };
const TOP = 10;
/** Each bar's thickness, and the gap between a row's two. */
const BAR = 12;
const GAP = 1;
const HALVES: readonly Half[] = ["first", "second"];

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** Draws a row a player in `svgElement`, for `metric`, or draws it again at a new width: each bar is joined by its half and player, so it keeps its element. */
export function drawDumbbellBars(svgElement: SVGSVGElement, players: readonly Player[], metric: Metric): DrawnDumbbellBars {
  const rows = rowsFor(players, metric);
  const height = MARGIN.top + players.length * ROW + MARGIN.bottom;
  const plotHeight = players.length * ROW;
  const width = Math.max(280, Math.floor(roomFor(svgElement)));
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const x = (value: number): number => (value / TOP) * plotWidth;
  const ticks = Array.from({ length: TOP / 2 + 1 }, (_, i) => i * 2);
  const halves = rows.flatMap((row) => HALVES.map((half): Dot => ({ name: row.name, metric, half, value: row[half] })));
  /** A row's middle, down the plot. */
  const middle = (name: string): number => rows.findIndex((row) => row.name === name) * ROW + ROW / 2;
  /** A bar's top: the first half's above the row's middle, the second's below it. */
  const top = (d: Dot): number => middle(d.name) + (d.half === "first" ? -BAR - GAP / 2 : GAP / 2);
  const key = (d: Dot): string => `${d.half}@${d.name}`;

  const svg = select(svgElement).attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
  // Drawn under the bars, and hidden from screen readers: the bars' names say the same.
  const axes = svg
    .selectAll<SVGGElement, null>("g.axes")
    .data([null])
    .join("g")
    .attr("class", "axes")
    .attr("aria-hidden", "true")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg
    .selectAll<SVGGElement, null>("g.plot")
    .data([null])
    .join("g")
    .attr("class", "plot")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // The dumbbell's axis, as drawDumbbell() draws it.
  axes
    .selectAll<SVGLineElement, number>("line.grid")
    .data(ticks)
    .join("line")
    .attr("class", (v) => (v === 0 ? "grid baseline" : "grid"))
    .attr("x1", x)
    .attr("x2", x)
    .attr("y1", 0)
    .attr("y2", plotHeight);
  axes
    .selectAll<SVGTextElement, number>("text.x-tick")
    .data(ticks)
    .join("text")
    .attr("class", "tick x-tick")
    .attr("x", x)
    .attr("y", plotHeight + 16)
    .attr("text-anchor", "middle")
    .text((v) => v);
  axes
    .selectAll<SVGTextElement, Metric>("text.axis-title")
    .data([metric])
    .join("text")
    .attr("class", "axis-title")
    .attr("x", plotWidth)
    .attr("y", plotHeight + 34)
    .attr("text-anchor", "end")
    .text((m) => (m === "goals" ? "Goals in each half" : "Assists in each half"));

  const bars = plot
    .selectAll<SVGRectElement, Dot>("rect.bar")
    .data(halves, key)
    .join("rect")
    .attr("class", (d) => `bar bar-${d.half}`)
    .attr("x", 0)
    .attr("y", top)
    .attr("width", (d) => x(d.value))
    .attr("height", BAR);

  // Hidden from screen readers: the bars' names say the same.
  const labels = plot
    .selectAll<SVGGElement, null>("g.bar-labels")
    .data([null])
    .join("g")
    .attr("class", "bar-labels")
    .attr("aria-hidden", "true");
  // Each player down the left, at the middle of their row, where the dumbbell names them.
  labels
    .selectAll<SVGTextElement, Row>("text.name")
    .data(rows, (d) => d.name)
    .join("text")
    .attr("class", "name")
    .attr("x", -12)
    .attr("y", (d) => middle(d.name) + 4.5)
    .attr("text-anchor", "end")
    .text((d) => d.name);
  // Each bar's number past its end, so a half with none shows its 0.
  labels
    .selectAll<SVGTextElement, Dot>("text.value")
    .data(halves, key)
    .join("text")
    .attr("class", (d) => `value value-${d.half}`)
    .attr("x", (d) => x(d.value) + 5)
    .attr("y", (d) => top(d) + BAR / 2 + 4)
    .attr("text-anchor", "start")
    .text((d) => d.value);

  return { bars };
}
