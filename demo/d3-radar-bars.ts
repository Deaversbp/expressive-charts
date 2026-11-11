// "Someone else's chart": the radar's numbers as bars, each axis down the left with the player's bar
// above the league average's, each as long as its percentile, drawn the way D3 code would draw it: a
// <rect> a value joined by its series and axis in a margin <g>, each rect's value on __data__ (the same
// rows as d3-radar.ts's circles), the axes named down the left and each percentile past its bar's end.
// Like d3-radar.ts it knows nothing about expressive-charts; demo/layouts-effects.ts attaches the
// effects with expressive() and puts it in a chart switch with the radar.
//
// Its ARIA is a careful D3 author's: the axis and the text are hidden, and the page gives the <svg>
// role="group" and its name.

import { select, type Selection } from "d3-selection";
import type { Profile, Value } from "./d3-radar";

export interface DrawnRadarBars {
  /** The bars as a D3 selection: on each axis, clockwise from the radar's top, the player's then the league average's. */
  readonly bars: Selection<SVGRectElement, Value, SVGGElement, null>;
}

const HEIGHT = 300;
/** Room on the left for the axes' names, on the right for the last percentile, and below for the ticks and their title. */
const MARGIN = { top: 6, right: 30, bottom: 40, left: 84 };
/** Each bar's thickness, and the gap between an axis's two. */
const THICK = 14;
const GAP = 2;
const TICKS = [0, 25, 50, 75, 100];

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** The values as the radar's circles carry them: each axis's player's, then its league average's. */
export function valuesOf(axes: readonly string[], profiles: readonly Profile[]): Value[] {
  const order = [...profiles].sort((a, b) => (a.series === "player" ? -1 : 0) - (b.series === "player" ? -1 : 0));
  return axes.flatMap((label, axis) => order.map((p): Value => ({ series: p.series, name: p.name, axis, label, per90: p.per90[axis]!, percentile: p.percentiles[axis]! })));
}

/** Draws a bar a value, or draws them again at a new width: each is joined by its series and axis, so it keeps its element. */
export function drawRadarBars(svgElement: SVGSVGElement, axes: readonly string[], profiles: readonly Profile[]): DrawnRadarBars {
  const width = Math.max(280, Math.floor(roomFor(svgElement)));
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = plotHeight / Math.max(1, axes.length);
  const x = (percentile: number): number => (percentile / 100) * plotWidth;
  const y = (d: Value): number => d.axis * band + (band - 2 * THICK - GAP) / 2 + (d.series === "player" ? 0 : THICK + GAP);
  const values = valuesOf(axes, profiles);

  const svg = select(svgElement).attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);
  // Drawn under the bars, and hidden from screen readers: the bars' names say the same.
  const axis = svg
    .selectAll<SVGGElement, null>("g.radar-bars-axis")
    .data([null])
    .join("g")
    .attr("class", "radar-bars-axis")
    .attr("aria-hidden", "true")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg
    .selectAll<SVGGElement, null>("g.radar-bars-plot")
    .data([null])
    .join("g")
    .attr("class", "radar-bars-plot")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  axis
    .selectAll<SVGLineElement, number>("line.grid")
    .data(TICKS)
    .join("line")
    .attr("class", (v) => (v === 0 ? "grid baseline" : "grid"))
    .attr("x1", x)
    .attr("x2", x)
    .attr("y1", 0)
    .attr("y2", plotHeight);
  axis
    .selectAll<SVGTextElement, number>("text.tick")
    .data(TICKS)
    .join("text")
    .attr("class", "tick")
    .attr("x", x)
    .attr("y", plotHeight + 18)
    .attr("text-anchor", "middle")
    .text((v) => v);
  axis
    .selectAll<SVGTextElement, string>("text.axis-title")
    .data(["Percentile in the league"])
    .join("text")
    .attr("class", "axis-title")
    .attr("x", plotWidth)
    .attr("y", plotHeight + 34)
    .attr("text-anchor", "end")
    .text((t) => t);

  const bars = plot
    .selectAll<SVGRectElement, Value>("rect.bar")
    .data(values, (d) => `${d.series}@${d.label}`)
    .join("rect")
    .attr("class", (d) => `bar bar-${d.series}`)
    .attr("x", 0)
    .attr("y", y)
    .attr("width", (d) => x(d.percentile))
    .attr("height", THICK);

  // Hidden from screen readers: the bars' names say the same.
  const labels = plot
    .selectAll<SVGGElement, null>("g.radar-bars-labels")
    .data([null])
    .join("g")
    .attr("class", "radar-bars-labels")
    .attr("aria-hidden", "true");
  // Each axis's name down the left, at the middle of its two bars.
  labels
    .selectAll<SVGTextElement, string>("text.host-label")
    .data(axes, (label) => label)
    .join("text")
    .attr("class", "host-label")
    .attr("x", -8)
    .attr("y", (_, axis) => axis * band + band / 2 + 4)
    .attr("text-anchor", "end")
    .text((label) => label);
  // Each percentile past its bar's end.
  labels
    .selectAll<SVGTextElement, Value>("text.host-value")
    .data(values, (d) => `${d.series}@${d.label}`)
    .join("text")
    .attr("class", (d) => `host-value host-value-${d.series}`)
    .attr("x", (d) => x(d.percentile) + 5)
    .attr("y", (d) => y(d) + THICK / 2 + 4)
    .text((d) => d.percentile);

  return { bars };
}
