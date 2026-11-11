// "Someone else's chart", as bars in three layouts: each player's goals and assists side by side, one
// above the other; stacked, assists after goals; or as shares of 100%, every bar the same length. Drawn
// the way D3 code would draw it: a <rect> a segment joined by its series and player in a margin <g>,
// each rect's segment on __data__, the players named down the left and each segment's number at its
// end, or inside it when stacked. Like d3-outcome-columns.ts it knows nothing about expressive-charts;
// demo/layouts-effects.ts attaches the effects with expressive() and makes each layout a chart switch's
// view with hostView().
//
// Its ARIA is a careful D3 author's: the axis and the text are hidden, and the page gives the <svg>
// role="group" and its name. expressive()'s markLabel names the segments, since its keyboard focus
// lands on them.

import { select, type Selection } from "d3-selection";

export type BarLayout = "side" | "stacked" | "share";
export type BarSeries = "goals" | "assists";

/** A player's season: goals and assists. */
export interface BarPlayer {
  readonly name: string;
  readonly goals: number;
  readonly assists: number;
}

/** What each segment's <rect> carries on __data__. */
export interface BarSegment {
  readonly player: string;
  readonly series: BarSeries;
  readonly value: number;
  /** The player's goals and assists together. */
  readonly total: number;
  /** The segment's share of the player's total, a whole percentage: goals' rounded, and assists' the rest, so the two make 100. */
  readonly percent: number;
}

export interface DrawnLayoutBars {
  /** The segments as a D3 selection, a player's goals then assists, in the rows' order. */
  readonly segments: Selection<SVGRectElement, BarSegment, SVGGElement, null>;
}

const SERIES: readonly BarSeries[] = ["goals", "assists"];
const HEIGHT = 300;
/** Room on the left for the names, on the right for a number past the longest bar, and below for the ticks. */
const MARGIN = { top: 6, right: 30, bottom: 28, left: 76 };
/** Side by side: each bar's thickness and the gap between a player's two. */
const SIDE = 12;
const SIDE_GAP = 1;
/** Stacked and at 100%: each bar's thickness. */
const STACK = 20;
/** The numbers' size, and how much of it each character may take with WCAG's text spacing on top (0.12 em a letter). */
const VALUE_SIZE = 11;
const CHAR = 0.76;

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

/** Each player's two segments, goals then assists. */
export function segmentsOf(rows: readonly BarPlayer[]): BarSegment[] {
  return rows.flatMap((row) => {
    const total = row.goals + row.assists;
    const goals = total === 0 ? 0 : Math.round((row.goals / total) * 100);
    return SERIES.map((series): BarSegment => ({ player: row.name, series, value: row[series], total, percent: series === "goals" ? goals : 100 - goals }));
  });
}

/** A segment's number as the layout shows it: its count, or its share at 100%. */
export const shown = (d: BarSegment, layout: BarLayout): string => (layout === "share" ? `${d.percent}%` : String(d.value));

/** Draws the segments in `layout`, or draws them again at a new width or in another layout: each is joined by its series and player, so it keeps its element. */
export function drawLayoutBars(svgElement: SVGSVGElement, rows: readonly BarPlayer[], layout: BarLayout): DrawnLayoutBars {
  const width = Math.max(280, Math.floor(roomFor(svgElement)));
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = plotHeight / Math.max(1, rows.length);
  const segments = segmentsOf(rows);
  // Side by side and stacked share a scale, so a player's goals keep their length from one to the other.
  const { step, top } = layout === "share" ? { step: 25, top: 100 } : niceTop(Math.max(1, ...rows.map((row) => row.goals + row.assists)));
  const x = (value: number): number => (value / top) * plotWidth;
  const row = (player: string): number => rows.findIndex((r) => r.name === player);
  /** A segment's box, in the plot <g>'s units. */
  const box = (d: BarSegment): { x: number; y: number; width: number; height: number } => {
    const top = row(d.player) * band;
    if (layout === "side") {
      const first = top + (band - 2 * SIDE - SIDE_GAP) / 2;
      return { x: 0, y: d.series === "goals" ? first : first + SIDE + SIDE_GAP, width: x(d.value), height: SIDE };
    }
    const scale = layout === "share" ? 100 / Math.max(1, d.total) : 1;
    const before = d.series === "assists" ? x((d.total - d.value) * scale) : 0;
    return { x: before, y: top + (band - STACK) / 2, width: x(d.value * scale), height: STACK };
  };

  const svg = select(svgElement).attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);
  // Drawn under the bars, and hidden from screen readers: the segments' names say the same.
  const axis = svg
    .selectAll<SVGGElement, null>("g.bars-axis")
    .data([null])
    .join("g")
    .attr("class", "bars-axis")
    .attr("aria-hidden", "true")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg
    .selectAll<SVGGElement, null>("g.bars-plot")
    .data([null])
    .join("g")
    .attr("class", "bars-plot")
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
    .text((v) => (layout === "share" ? `${v}%` : v));

  const bars = plot
    .selectAll<SVGRectElement, BarSegment>("rect.segment")
    .data(segments, (d) => `${d.series}@${d.player}`)
    .join("rect")
    .attr("class", (d) => `segment segment-${d.series}`)
    .attr("x", (d) => box(d).x)
    .attr("y", (d) => box(d).y)
    .attr("width", (d) => box(d).width)
    .attr("height", (d) => box(d).height);

  // Hidden from screen readers: the segments' names say the same.
  const labels = plot
    .selectAll<SVGGElement, null>("g.bar-labels")
    .data([null])
    .join("g")
    .attr("class", "bar-labels")
    .attr("aria-hidden", "true");
  // Each player down the left, at the middle of their row.
  labels
    .selectAll<SVGTextElement, BarPlayer>("text.host-label")
    .data(rows, (d) => d.name)
    .join("text")
    .attr("class", "host-label")
    .attr("x", -8)
    .attr("y", (d) => row(d.name) * band + band / 2 + 4)
    .attr("text-anchor", "end")
    .text((d) => d.name);
  // Each segment's number: past its end side by side, and inside it stacked and at 100%, where it fits.
  const fits = (d: BarSegment): boolean => layout === "side" || shown(d, layout).length * VALUE_SIZE * CHAR + 6 <= box(d).width;
  labels
    .selectAll<SVGTextElement, BarSegment>("text.host-value")
    .data(segments.filter(fits), (d) => `${d.series}@${d.player}`)
    .join("text")
    .attr("class", (d) => `host-value host-value-${d.series}`)
    .attr("x", (d) => (layout === "side" ? box(d).x + box(d).width + 5 : box(d).x + box(d).width / 2))
    .attr("y", (d) => box(d).y + box(d).height / 2 + 4)
    .attr("text-anchor", layout === "side" ? "start" : "middle")
    .text((d) => shown(d, layout));

  return { segments: bars };
}
