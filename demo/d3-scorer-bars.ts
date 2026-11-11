// "Someone else's chart", as bars: the season's scorers, most goals first, each bar as long as their
// goals and coloured by position, drawn the way D3 code would draw it: a <rect> a scorer joined by name
// in a margin <g>, each rect's scorer on __data__, the scorers named down the left and each one's goals
// past their bar's end. Like d3-treemap.ts it knows nothing about expressive-charts;
// demo/layouts-effects.ts attaches the effects with expressive() and puts it in a chart switch with the
// treemap.
//
// Its ARIA is a careful D3 author's: the axis and the text are hidden, and the page gives the <svg>
// role="group" and its name.

import { select, type Selection } from "d3-selection";
import { slug, type Scorer } from "./d3-treemap";

export interface DrawnScorerBars {
  /** The bars as a D3 selection, most goals first. */
  readonly bars: Selection<SVGRectElement, Scorer, SVGGElement, null>;
}

const HEIGHT = 300;
/** Room on the left for the names, on the right for the goals past the longest bar, and below for the ticks. */
const MARGIN = { top: 6, right: 30, bottom: 28, left: 76 };
/** Each bar's share of its row. */
const THICK = 0.64;

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** A round step giving about four gridlines up to `max`, and the top it reaches. */
function niceTop(max: number): { step: number; top: number } {
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find((k) => k * power >= rough) ?? 10) * power;
  return { step, top: Math.ceil(max / step) * step };
}

/** The scorers most goals first, those level in the rows' order. */
export const ranked = (scorers: readonly Scorer[]): Scorer[] => [...scorers].sort((a, b) => b.goals - a.goals);

/** Draws a bar a scorer, or draws them again at a new width: each is joined by name, so it keeps its element. */
export function drawScorerBars(svgElement: SVGSVGElement, scorers: readonly Scorer[]): DrawnScorerBars {
  const width = Math.max(280, Math.floor(roomFor(svgElement)));
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const rows = ranked(scorers);
  const band = plotHeight / Math.max(1, rows.length);
  const { step, top } = niceTop(Math.max(1, ...rows.map((s) => s.goals)));
  const x = (goals: number): number => (goals / top) * plotWidth;
  const y = (i: number): number => i * band + (band * (1 - THICK)) / 2;

  const svg = select(svgElement).attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);
  // Drawn under the bars, and hidden from screen readers: the bars' names say the same.
  const axis = svg
    .selectAll<SVGGElement, null>("g.scorers-axis")
    .data([null])
    .join("g")
    .attr("class", "scorers-axis")
    .attr("aria-hidden", "true")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg
    .selectAll<SVGGElement, null>("g.scorers-plot")
    .data([null])
    .join("g")
    .attr("class", "scorers-plot")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  axis
    .selectAll<SVGLineElement, number>("line.grid")
    .data(ticks)
    .join("line")
    .attr("class", (v) => (v === 0 ? "grid baseline" : "grid"))
    .attr("x1", x)
    .attr("x2", x)
    .attr("y1", 0)
    .attr("y2", plotHeight);
  axis
    .selectAll<SVGTextElement, number>("text.tick")
    .data(ticks)
    .join("text")
    .attr("class", "tick")
    .attr("x", x)
    .attr("y", plotHeight + 18)
    .attr("text-anchor", "middle")
    .text((v) => v);

  const bars = plot
    .selectAll<SVGRectElement, Scorer>("rect.bar")
    .data(rows, (d) => d.name)
    .join("rect")
    .attr("class", (d) => `bar bar-${slug(d.pos)}`)
    .attr("x", 0)
    .attr("y", (_, i) => y(i))
    .attr("width", (d) => x(d.goals))
    .attr("height", band * THICK);

  // Hidden from screen readers: the bars' names say the same.
  const labels = plot.selectAll<SVGGElement, null>("g.scorer-labels").data([null]).join("g").attr("class", "scorer-labels").attr("aria-hidden", "true");
  labels
    .selectAll<SVGTextElement, Scorer>("text.host-label")
    .data(rows, (d) => d.name)
    .join("text")
    .attr("class", "host-label")
    .attr("x", -8)
    .attr("y", (_, i) => i * band + band / 2 + 4)
    .attr("text-anchor", "end")
    .text((d) => d.name);
  labels
    .selectAll<SVGTextElement, Scorer>("text.host-value")
    .data(rows, (d) => d.name)
    .join("text")
    .attr("class", "host-value")
    .attr("x", (d) => x(d.goals) + 5)
    .attr("y", (_, i) => i * band + band / 2 + 4)
    .text((d) => d.goals);

  return { bars };
}
