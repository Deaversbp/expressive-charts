// "Someone else's chart", as lines: goals and expected goals over a season, drawn the way D3 code
// would draw it, with d3.line() paths joined by series in a margin <g>, each path's series and rows
// on __data__. Like d3-pie.ts it knows nothing about expressive-charts; demo/line.ts attaches the
// effects with expressive(), describing each path from the same points and scales.
//
// It reveals the season itself: reveal(week) draws each path up to that week, the last stretch
// interpolated between weeks, and sets the rows on __data__ to match, so a page can drive it frame
// by frame. Its ARIA is a careful D3 author's: the axes are hidden, and the page gives the <svg>
// role="group" and its name.

import { select, type Selection } from "d3-selection";
import { line } from "d3-shape";

export interface Week {
  readonly week: number;
  readonly goals: number;
  readonly xg: number;
}

export type Series = "goals" | "xg";

/** What each path carries on __data__: its series, and the rows drawn so far. */
export interface Trace {
  readonly series: Series;
  readonly rows: readonly Week[];
}

export interface DrawnLine {
  /** The paths as a D3 selection, goals first: the order they're drawn in. */
  readonly paths: Selection<SVGPathElement, Trace, SVGGElement, unknown>;
  /** The scales, in the plot <g>'s units: px across for a week, and px down for a value. */
  x(week: number): number;
  y(value: number): number;
  /** The paths' stroke width. */
  readonly width: number;
  /** The week drawn up to. */
  readonly through: number;
  /** Draws the season up to `week`, between the first and the last. */
  reveal(week: number): void;
  /** Draws it again at the parent's width, up to the same week. */
  resize(): void;
}

const HEIGHT = 300;
const MARGIN = { top: 12, right: 16, bottom: 32, left: 36 };
/** As wide as the lab's lines. */
const WIDTH = 2.25;
const SERIES: readonly Series[] = ["goals", "xg"];

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

/** Draws the season in `svgElement`, all of it until reveal() says otherwise. */
export function drawLine(svgElement: SVGSVGElement, season: readonly Week[]): DrawnLine {
  const first = season[0]!.week;
  const last = season[season.length - 1]!.week;
  const { step, top } = niceTop(Math.max(...season.map((w) => Math.max(w.goals, w.xg))));
  let plotWidth = 0;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (week: number): number => ((week - first) / (last - first)) * plotWidth;
  const y = (value: number): number => plotHeight - (value / top) * plotHeight;
  let through = last;

  /** The rows up to `week`, the last one interpolated between weeks. */
  function revealed(week: number): Week[] {
    const shown = season.filter((w) => w.week <= week);
    const before = shown[shown.length - 1]!;
    const next = season.find((w) => w.week > week);
    if (next && week > before.week) {
      const f = (week - before.week) / (next.week - before.week);
      shown.push({ week, goals: before.goals + f * (next.goals - before.goals), xg: before.xg + f * (next.xg - before.xg) });
    }
    return shown;
  }

  const svg = select(svgElement);
  // The axes are drawn under the lines, and hidden from screen readers: the lines' names and the
  // page's table say the same.
  const axes = svg.append("g").attr("class", "axes").attr("aria-hidden", "true").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg.append("g").attr("class", "plot").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const shape = (d: Trace): string =>
    line<Week>()
      .x((w) => x(w.week))
      .y((w) => y(w[d.series]))(d.rows) ?? "";

  let paths = plot
    .selectAll<SVGPathElement, Trace>("path.line")
    .data(SERIES.map((series): Trace => ({ series, rows: revealed(through) })), (d) => d.series)
    .join("path")
    .attr("class", (d) => `line line-${d.series}`)
    .attr("stroke-width", WIDTH);

  function drawAxes(): void {
    const values = Array.from({ length: top / step + 1 }, (_, i) => i * step);
    axes
      .selectAll<SVGLineElement, number>("line.grid")
      .data(values)
      .join("line")
      .attr("class", (v) => (v === 0 ? "grid baseline" : "grid"))
      .attr("x1", 0)
      .attr("x2", plotWidth)
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
    const weeks = [first, 10, 20, 30, last].filter((week) => week >= first && week <= last);
    axes
      .selectAll<SVGTextElement, number>("text.x-tick")
      .data(weeks)
      .join("text")
      .attr("class", "tick x-tick")
      .attr("x", (week) => x(week))
      .attr("y", plotHeight + 18)
      .attr("text-anchor", "middle")
      .text((week) => (week === first ? `MW ${week}` : week));
  }

  function resize(): void {
    const width = Math.max(280, Math.floor(roomFor(svgElement)));
    plotWidth = width - MARGIN.left - MARGIN.right;
    svg.attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);
    drawAxes();
    paths = paths.attr("d", shape);
  }
  resize();

  return {
    get paths() {
      return paths;
    },
    x,
    y,
    width: WIDTH,
    get through() {
      return through;
    },
    reveal(week) {
      through = Math.max(first, Math.min(last, week));
      paths = paths.datum((d): Trace => ({ series: d.series, rows: revealed(through) })).attr("d", shape);
    },
    resize
  };
}
