// "Someone else's charts", drawn with circles and curves: a scatter of players, two curved lines and a
// stacked area over a season, the way D3 code would draw them, each joined by its key in a margin <g>,
// its row on __data__. Like d3-line.ts they know nothing about expressive-charts; demo/shapes.ts
// attaches the effects with expressive(), which reads each <circle> and <path> by its tag, so the page
// describes none of them.
//
// The scatter is drawn the other common way: a group a player, moved to the dot's place, with a circle
// at its origin and the player's name beside it. The lines and the areas are curves, with
// curveMonotoneX, so their paths are Béziers. Their ARIA is a careful D3 author's: the axes and the
// names are hidden, and the page gives each <svg> role="group" and its name.

import { select, type Selection } from "d3-selection";
import { area, curveMonotoneX, line } from "d3-shape";

export interface Shooter {
  readonly name: string;
  readonly shots: number;
  readonly goals: number;
}

/** A matchweek's goals and expected goals, each a five-match average. */
export interface FormWeek {
  readonly week: number;
  readonly goals: number;
  readonly xg: number;
}

export type FormSeries = "goals" | "xg";

/** What each curve carries on __data__: its series, and the weeks it's drawn through. */
export interface Form {
  readonly series: FormSeries;
  readonly rows: readonly FormWeek[];
}

/** A matchweek's shots on target and off it, each a five-match average. */
export interface ShotWeek {
  readonly week: number;
  readonly onTarget: number;
  readonly offTarget: number;
}

export type ShotSeries = "onTarget" | "offTarget";

/** What each area carries on __data__: its series, and the weeks it's drawn through. */
export interface Band {
  readonly series: ShotSeries;
  readonly rows: readonly ShotWeek[];
}

export interface DrawnScatter {
  /** The dots as a D3 selection, in the rows' order, each with its row from its group. */
  readonly dots: Selection<SVGCircleElement, Shooter, SVGGElement, unknown>;
  /** Draws it again at the parent's width. */
  resize(): void;
}

export interface DrawnCurves {
  /** The curves as a D3 selection, goals first: the order they're drawn in. */
  readonly paths: Selection<SVGPathElement, Form, SVGGElement, unknown>;
  /** The scales, in the plot <g>'s units: px across for a week, and px down for a value. */
  x(week: number): number;
  y(value: number): number;
  /** Draws it again at the parent's width. */
  resize(): void;
}

export interface DrawnAreas {
  /** The areas as a D3 selection, the one on the axis first: the order they're drawn in. */
  readonly paths: Selection<SVGPathElement, Band, SVGGElement, unknown>;
  /** Draws it again at the parent's width. */
  resize(): void;
}

const HEIGHT = 300;
/** The scatter keeps room on its right for the names beside its dots. */
const SCATTER_MARGIN = { top: 16, right: 76, bottom: 40, left: 40 };
const WEEKS_MARGIN = { top: 16, right: 16, bottom: 32, left: 36 };
/** The dots' radius. */
const RADIUS = 6;
/** As wide as the line page's lines. */
const WIDTH = 2.25;
const FORM: readonly FormSeries[] = ["goals", "xg"];
const SHOTS: readonly ShotSeries[] = ["onTarget", "offTarget"];

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

type Axes = Selection<SVGGElement, unknown, null, undefined>;

/** Gridlines and their values up the left, the one at 0 the baseline. */
function drawValues(axes: Axes, values: readonly number[], y: (value: number) => number, width: number): void {
  axes
    .selectAll<SVGLineElement, number>("line.grid")
    .data(values)
    .join("line")
    .attr("class", (v) => (v === 0 ? "grid baseline" : "grid"))
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", (v) => y(v))
    .attr("y2", (v) => y(v));
  axes
    .selectAll<SVGTextElement, number>("text.y-tick")
    .data(values)
    .join("text")
    .attr("class", "tick y-tick")
    .attr("x", -8)
    .attr("y", (v) => y(v) + 4)
    .attr("text-anchor", "end")
    .text((v) => v);
}

/** Ticks along the bottom, `name` naming the first. */
function drawAcross(axes: Axes, ticks: readonly number[], x: (value: number) => number, height: number, name: (value: number) => string | number): void {
  axes
    .selectAll<SVGTextElement, number>("text.x-tick")
    .data(ticks)
    .join("text")
    .attr("class", "tick x-tick")
    .attr("x", (v) => x(v))
    .attr("y", height + 18)
    .attr("text-anchor", "middle")
    .text(name);
}

/** The svg and its two groups, hidden axes under the marks, both inside the margin. */
function frame(svgElement: SVGSVGElement, margin: typeof WEEKS_MARGIN): { svg: Selection<SVGSVGElement, unknown, null, undefined>; axes: Axes; plot: Axes } {
  const svg = select(svgElement);
  // Hidden from screen readers: the marks' names say the same.
  const axes = svg.append("g").attr("class", "axes").attr("aria-hidden", "true").attr("transform", `translate(${margin.left},${margin.top})`);
  const plot = svg.append("g").attr("class", "plot").attr("transform", `translate(${margin.left},${margin.top})`);
  return { svg, axes, plot };
}

/** Sizes the svg to its parent, at least 280 px across, and returns the plot's width. */
function fit(svg: Selection<SVGSVGElement, unknown, null, undefined>, margin: typeof WEEKS_MARGIN): number {
  const width = Math.max(280, Math.floor(roomFor(svg.node()!)));
  svg.attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);
  return width - margin.left - margin.right;
}

/** Draws players as dots, goals up and shots across, each named beside its dot. */
export function drawScatter(svgElement: SVGSVGElement, rows: readonly Shooter[]): DrawnScatter {
  const margin = SCATTER_MARGIN;
  const xs = niceTop(Math.max(...rows.map((r) => r.shots)));
  const ys = niceTop(Math.max(...rows.map((r) => r.goals)));
  const plotHeight = HEIGHT - margin.top - margin.bottom;
  let plotWidth = 0;
  const x = (shots: number): number => (shots / xs.top) * plotWidth;
  const y = (goals: number): number => plotHeight - (goals / ys.top) * plotHeight;

  const { svg, axes, plot } = frame(svgElement, margin);
  const titles = axes.append("g").attr("class", "titles");
  const groups = plot
    .selectAll<SVGGElement, Shooter>("g.dot")
    .data(rows, (d) => d.name)
    .join((enter) => {
      const group = enter.append("g").attr("class", "dot");
      group.append("circle").attr("r", RADIUS);
      // Hidden: each dot's name says who it is.
      group.append("text").attr("class", "name").attr("aria-hidden", "true").attr("x", RADIUS + 5).attr("y", 4).text((d) => d.name);
      return group;
    });

  function resize(): void {
    plotWidth = fit(svg, margin);
    drawValues(axes, Array.from({ length: ys.top / ys.step + 1 }, (_, i) => i * ys.step), y, plotWidth);
    drawAcross(axes, Array.from({ length: xs.top / xs.step + 1 }, (_, i) => i * xs.step), x, plotHeight, (v) => v);
    titles
      .selectAll<SVGTextElement, string>("text")
      .data(["Goals", "Shots"])
      .join("text")
      .attr("class", "axis-title")
      // Goals above the plot, clear of the top value; Shots under the right end of the axis.
      .attr("x", (t) => (t === "Goals" ? 0 : plotWidth))
      .attr("y", (t) => (t === "Goals" ? -6 : plotHeight + 34))
      .attr("text-anchor", (t) => (t === "Goals" ? "start" : "end"))
      .text((t) => t);
    groups.attr("transform", (d) => `translate(${x(d.shots)},${y(d.goals)})`);
  }
  resize();

  return { dots: groups.select<SVGCircleElement>("circle"), resize };
}

/** The x across a season's weeks, the first named "MW 1". */
function weeksAcross(first: number, last: number): { ticks: number[]; name: (week: number) => string | number } {
  return { ticks: [first, 10, 20, 30, last].filter((week) => week >= first && week <= last), name: (week) => (week === first ? `MW ${week}` : week) };
}

/** Draws goals and expected goals per match as two curves through their weeks. */
export function drawCurves(svgElement: SVGSVGElement, rows: readonly FormWeek[]): DrawnCurves {
  const margin = WEEKS_MARGIN;
  const first = rows[0]!.week;
  const last = rows[rows.length - 1]!.week;
  const { step, top } = niceTop(Math.max(...rows.map((w) => Math.max(w.goals, w.xg))));
  const plotHeight = HEIGHT - margin.top - margin.bottom;
  let plotWidth = 0;
  const x = (week: number): number => ((week - first) / (last - first)) * plotWidth;
  const y = (value: number): number => plotHeight - (value / top) * plotHeight;
  const across = weeksAcross(first, last);

  const { svg, axes, plot } = frame(svgElement, margin);
  const shape = (d: Form): string =>
    line<FormWeek>()
      .x((w) => x(w.week))
      .y((w) => y(w[d.series]))
      .curve(curveMonotoneX)(d.rows) ?? "";
  const paths = plot
    .selectAll<SVGPathElement, Form>("path.line")
    .data(FORM.map((series): Form => ({ series, rows })), (d) => d.series)
    .join("path")
    .attr("class", (d) => `line line-${d.series}`)
    .attr("stroke-width", WIDTH);

  function resize(): void {
    plotWidth = fit(svg, margin);
    drawValues(axes, Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 10) / 10), y, plotWidth);
    drawAcross(axes, across.ticks, x, plotHeight, across.name);
    paths.attr("d", shape);
  }
  resize();

  return { paths, x, y, resize };
}

/** Draws shots on target and off it per match as two areas, one stacked on the other. */
export function drawAreas(svgElement: SVGSVGElement, rows: readonly ShotWeek[]): DrawnAreas {
  const margin = WEEKS_MARGIN;
  const first = rows[0]!.week;
  const last = rows[rows.length - 1]!.week;
  const { step, top } = niceTop(Math.max(...rows.map((w) => w.onTarget + w.offTarget)));
  const plotHeight = HEIGHT - margin.top - margin.bottom;
  let plotWidth = 0;
  const x = (week: number): number => ((week - first) / (last - first)) * plotWidth;
  const y = (value: number): number => plotHeight - (value / top) * plotHeight;
  const across = weeksAcross(first, last);

  const { svg, axes, plot } = frame(svgElement, margin);
  // Off target sits on top of on target.
  const below = (d: Band, w: ShotWeek): number => (d.series === "onTarget" ? 0 : w.onTarget);
  const shape = (d: Band): string =>
    area<ShotWeek>()
      .x((w) => x(w.week))
      .y0((w) => y(below(d, w)))
      .y1((w) => y(below(d, w) + w[d.series]))
      .curve(curveMonotoneX)(d.rows) ?? "";
  const paths = plot
    .selectAll<SVGPathElement, Band>("path.area")
    .data(SHOTS.map((series): Band => ({ series, rows })), (d) => d.series)
    .join("path")
    .attr("class", (d) => `area area-${d.series}`);

  function resize(): void {
    plotWidth = fit(svg, margin);
    drawValues(axes, Array.from({ length: top / step + 1 }, (_, i) => i * step), y, plotWidth);
    drawAcross(axes, across.ticks, x, plotHeight, across.name);
    paths.attr("d", shape);
  }
  resize();

  return { paths, resize };
}
