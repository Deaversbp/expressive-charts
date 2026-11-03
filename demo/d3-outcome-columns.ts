// "Someone else's chart", as columns: the shot outcomes, drawn the way D3 code would draw it, with
// d3-selection rects joined by outcome in a margin <g>, each rect's row on __data__, its outcome named
// under it and its count over it. Like d3-pie.ts it knows nothing about expressive-charts; demo/morph.ts
// attaches the effects with expressive() and puts it in a chart switch with the D3 pie.
//
// Its ARIA is a careful D3 author's: the axis and the labels are hidden, and the page gives the <svg>
// role="group" and its name. expressive()'s markLabel names the columns, since its keyboard focus
// lands on them.

import { select, type Selection } from "d3-selection";
import type { Outcome } from "./d3-pie";

export interface DrawnOutcomeColumns {
  /** The columns as a D3 selection, in data order. */
  readonly columns: Selection<SVGRectElement, Outcome, SVGGElement, null>;
}

/** As tall as the D3 pie, so the two share a switch's cell without it changing size. */
const HEIGHT = 300;
/** Room over the tallest column for its count, and under the baseline for the outcomes. */
const MARGIN = { top: 26, right: 8, bottom: 30, left: 36 };
/** Each column's share of its outcome's band. */
const COLUMN = 0.6;
/** No column wider than this, however wide the chart. */
const MAX_COLUMN = 72;

/** "Off target" → "off-target", for a class name. */
const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** A round step giving about three gridlines up to `max`, and the top it reaches. */
function niceTop(max: number): { step: number; top: number } {
  const rough = max / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find((k) => k * power >= rough) ?? 10) * power;
  return { step, top: Math.ceil(max / step) * step };
}

/** Draws a column per outcome, or redraws them at a new width: each is joined by outcome, so it keeps its element. */
export function drawOutcomeColumns(svgElement: SVGSVGElement, rows: readonly Outcome[]): DrawnOutcomeColumns {
  const width = Math.max(280, Math.floor(roomFor(svgElement)));
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const { step, top } = niceTop(Math.max(1, ...rows.map((d) => d.shots)));
  const band = plotWidth / Math.max(1, rows.length);
  const columnWidth = Math.min(MAX_COLUMN, band * COLUMN);
  const middle = (i: number): number => i * band + band / 2;
  const y = (value: number): number => plotHeight - (value / top) * plotHeight;

  const svg = select(svgElement).attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);
  // Drawn under the columns, and hidden from screen readers: the columns' names say the same.
  const axis = svg
    .selectAll<SVGGElement, null>("g.columns-axis")
    .data([null])
    .join("g")
    .attr("class", "columns-axis")
    .attr("aria-hidden", "true")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg
    .selectAll<SVGGElement, null>("g.columns-plot")
    .data([null])
    .join("g")
    .attr("class", "columns-plot")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  const values = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  axis
    .selectAll<SVGLineElement, number>("line.grid")
    .data(values)
    .join("line")
    .attr("class", (v) => (v === 0 ? "grid baseline" : "grid"))
    .attr("x1", 0)
    .attr("x2", plotWidth)
    .attr("y1", y)
    .attr("y2", y);
  axis
    .selectAll<SVGTextElement, number>("text.tick")
    .data(values)
    .join("text")
    .attr("class", "tick")
    .attr("x", -8)
    .attr("y", (v) => y(v) + 4)
    .attr("text-anchor", "end")
    .text((v) => v);

  const columns = plot
    .selectAll<SVGRectElement, Outcome>("rect.column")
    .data(rows, (d) => d.outcome)
    .join("rect")
    .attr("class", (d) => `column column-${slug(d.outcome)}`)
    .attr("x", (_, i) => middle(i) - columnWidth / 2)
    .attr("width", columnWidth)
    .attr("y", (d) => y(d.shots))
    .attr("height", (d) => plotHeight - y(d.shots));

  // Each outcome under its column and its count over it, hidden from screen readers: the columns'
  // names say the same.
  const labels = plot
    .selectAll<SVGGElement, null>("g.column-labels")
    .data([null])
    .join("g")
    .attr("class", "column-labels")
    .attr("aria-hidden", "true");
  labels
    .selectAll<SVGTextElement, Outcome>("text.host-label")
    .data(rows, (d) => d.outcome)
    .join("text")
    .attr("class", "host-label")
    .attr("x", (_, i) => middle(i))
    .attr("y", plotHeight + 20)
    .attr("text-anchor", "middle")
    .text((d) => d.outcome);
  labels
    .selectAll<SVGTextElement, Outcome>("text.host-value")
    .data(rows, (d) => d.outcome)
    .join("text")
    .attr("class", "host-value")
    .attr("x", (_, i) => middle(i))
    .attr("y", (d) => y(d.shots) - 7)
    .attr("text-anchor", "middle")
    .text((d) => d.shots);

  return { columns };
}
