// "Someone else's chart", as columns: shots per matchweek, drawn the way D3 code would draw it, with
// d3-selection rects joined by week in a margin <g>, each rect's row on __data__. Like d3-line.ts it
// knows nothing about expressive-charts; demo/season.ts attaches the effects with expressive().
//
// It redraws from scratch on every change, with no animation of its own. Its ARIA is a careful D3
// author's: the axes are hidden, and the page gives the <svg> role="group" and its name.

import { select, type Selection } from "d3-selection";

export interface Shots {
  readonly week: number;
  readonly shots: number;
}

export interface DrawnColumns {
  /** The columns as a D3 selection, in week order. */
  readonly columns: Selection<SVGRectElement, Shots, SVGGElement, unknown>;
  /** Draws the columns again with new rows, or at the parent's new width. */
  draw(rows?: readonly Shots[]): void;
}

const HEIGHT = 170;
const MARGIN = { top: 8, right: 8, bottom: 26, left: 30 };
/** Each column's share of its week's band. */
const COLUMN = 0.7;

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

/** Draws a column per week in `svgElement`. */
export function drawColumns(svgElement: SVGSVGElement, initial: readonly Shots[]): DrawnColumns {
  let rows = initial;
  const svg = select(svgElement);
  // The axes are drawn under the columns, and hidden from screen readers: the columns' names say the same.
  const axes = svg.append("g").attr("class", "axes").attr("aria-hidden", "true").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg.append("g").attr("class", "plot").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  let columns = plot.selectAll<SVGRectElement, Shots>("rect.column");

  function draw(next: readonly Shots[] = rows): void {
    rows = next;
    const width = Math.max(280, Math.floor(roomFor(svgElement)));
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const { step, top } = niceTop(Math.max(1, ...rows.map((d) => d.shots)));
    const band = plotWidth / Math.max(1, rows.length);
    const x = (i: number): number => i * band + (band * (1 - COLUMN)) / 2;
    const y = (value: number): number => plotHeight - (value / top) * plotHeight;
    svg.attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);

    const values = Array.from({ length: top / step + 1 }, (_, i) => i * step);
    axes
      .selectAll<SVGLineElement, number>("line.grid")
      .data(values)
      .join("line")
      .attr("class", (v) => (v === 0 ? "grid baseline" : "grid"))
      .attr("x1", 0)
      .attr("x2", plotWidth)
      .attr("y1", y)
      .attr("y2", y);
    axes
      .selectAll<SVGTextElement, number>("text.y-tick")
      .data(values)
      .join("text")
      .attr("class", "tick y-tick")
      .attr("x", -8)
      .attr("y", (v) => y(v) + 4)
      .attr("text-anchor", "end")
      .text((v) => v);
    // The first week and every fifth, as an axis would: the columns' names have every week.
    const ticks = rows.flatMap((d, i) => (d.week === 1 || d.week % 5 === 0 ? [{ week: d.week, at: i * band + band / 2 }] : []));
    axes
      .selectAll<SVGTextElement, { week: number; at: number }>("text.x-tick")
      .data(ticks, (d) => d.week)
      .join("text")
      .attr("class", "tick x-tick")
      .attr("x", (d) => d.at)
      .attr("y", plotHeight + 18)
      .attr("text-anchor", "middle")
      .text((d) => (d.week === 1 ? "MW 1" : d.week));

    columns = plot
      .selectAll<SVGRectElement, Shots>("rect.column")
      .data(rows, (d) => d.week)
      .join("rect")
      .attr("class", "column")
      .attr("x", (_, i) => x(i))
      .attr("width", band * COLUMN)
      .attr("y", (d) => y(d.shots))
      .attr("height", (d) => plotHeight - y(d.shots));
  }
  draw();

  return {
    get columns() {
      return columns;
    },
    draw
  };
}
