// "Someone else's chart", with weeks missing: goals and expected goals over a season that a weekly
// data feed recorded with gaps, drawn the way D3 code draws them, with d3.line().defined(), which
// skips a row with no value and breaks the path there. Like d3-line.ts, whose look it shares, it knows
// nothing about expressive-charts; demo/line.ts describes each path by the weeks it has and where they
// break.
//
// It reveals the season as d3-line.ts does: reveal(week) draws each path up to that week, the last
// stretch interpolated between weeks that both have a value, and sets the rows on __data__ to match.
// A line revealed into a gap ends at its last value. Its ARIA is a careful D3 author's: the axes are
// hidden, and the page gives the <svg> role="group" and its name.

import { select, type Selection } from "d3-selection";
import { line } from "d3-shape";

/** A week as the feed recorded it: null where it has no value. */
export interface FeedWeek {
  readonly week: number;
  readonly goals: number | null;
  readonly xg: number | null;
}

export type Series = "goals" | "xg";

/** What each path carries on __data__: its series, and the rows drawn so far, missing values and all. */
export interface Trace {
  readonly series: Series;
  readonly rows: readonly FeedWeek[];
}

export interface DrawnGaps {
  /** The paths as a D3 selection, goals first: the order they're drawn in. */
  readonly paths: Selection<SVGPathElement, Trace, SVGGElement, unknown>;
  /** The scales, in the plot <g>'s units: px across for a week, and px down for a value. */
  x(week: number): number;
  y(value: number): number;
  /** The paths' stroke width. */
  readonly width: number;
  /** Draws the season up to `week`, between the first and the last. */
  reveal(week: number): void;
  /** Draws it again at the parent's width, up to the same week. */
  resize(): void;
}

const HEIGHT = 300;
const MARGIN = { top: 12, right: 16, bottom: 32, left: 36 };
/** As wide as the prototype's lines. */
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

/** Between two values, or null where either is missing. */
function between(a: number | null, b: number | null, f: number): number | null {
  return a === null || b === null ? null : a + f * (b - a);
}

/** Draws the season in `svgElement`, all of it until reveal() says otherwise. */
export function drawGaps(svgElement: SVGSVGElement, season: readonly FeedWeek[]): DrawnGaps {
  const first = season[0]!.week;
  const last = season[season.length - 1]!.week;
  const { step, top } = niceTop(Math.max(...season.map((w) => Math.max(w.goals ?? 0, w.xg ?? 0))));
  let plotWidth = 0;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (week: number): number => ((week - first) / (last - first)) * plotWidth;
  const y = (value: number): number => plotHeight - (value / top) * plotHeight;
  let through = last;

  /** The rows up to `week`, the last one interpolated between weeks, and missing where either week is. */
  function revealed(week: number): FeedWeek[] {
    const shown = season.filter((w) => w.week <= week);
    const before = shown[shown.length - 1]!;
    const next = season.find((w) => w.week > week);
    if (next && week > before.week) {
      const f = (week - before.week) / (next.week - before.week);
      shown.push({ week, goals: between(before.goals, next.goals, f), xg: between(before.xg, next.xg, f) });
    }
    return shown;
  }

  const svg = select(svgElement);
  // The axes are drawn under the lines, and hidden from screen readers: the lines' names say the same.
  const axes = svg.append("g").attr("class", "axes").attr("aria-hidden", "true").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg.append("g").attr("class", "plot").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  // A week with no value breaks the line: D3 starts a new subpath at the next week that has one.
  const shape = (d: Trace): string =>
    line<FeedWeek>()
      .defined((w) => w[d.series] !== null)
      .x((w) => x(w.week))
      .y((w) => y(w[d.series]!))(d.rows) ?? "";

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
    reveal(week) {
      through = Math.max(first, Math.min(last, week));
      paths = paths.datum((d): Trace => ({ series: d.series, rows: revealed(through) })).attr("d", shape);
    },
    resize
  };
}
