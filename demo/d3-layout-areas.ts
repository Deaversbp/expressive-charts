// "Someone else's chart", as two areas in two layouts: shots on target and off it per match, the one on
// the other, as counts or as shares of 100%. Drawn the way D3 code would draw it: a d3.area() <path> a
// band, with curveMonotoneX, joined by its series in a margin <g>, each path's band on __data__, and
// each band named at its right end. Like d3-shapes.ts it knows nothing about expressive-charts;
// demo/layouts-effects.ts attaches the effects with expressive() and makes each layout a chart switch's
// view with hostView().
//
// Both layouts keep the same margins, whatever their value axes' labels, so the two bands span the
// same x's in each: a morph between them pairs each week with itself.
//
// Its ARIA is a careful D3 author's: the axes and the names are hidden, and the page gives the <svg>
// role="group" and its name.

import { select, type Selection } from "d3-selection";
import { area, curveMonotoneX } from "d3-shape";
import type { Band, ShotSeries, ShotWeek } from "./d3-shapes";

export type AreaLayout = "stacked" | "share";

export interface DrawnLayoutAreas {
  /** The bands as a D3 selection, the one on the axis first: the order they're drawn in. */
  readonly bands: Selection<SVGPathElement, Band, SVGGElement, null>;
}

const HEIGHT = 300;
/** The left fits "100%", and the right each band's name. The same in both layouts. */
const MARGIN = { top: 16, right: 80, bottom: 32, left: 40 };
const SHOTS: readonly ShotSeries[] = ["onTarget", "offTarget"];
const NAMES: Readonly<Record<ShotSeries, string>> = { onTarget: "On target", offTarget: "Off target" };
/** The least distance between the two names' baselines, so they never touch. */
const APART = 15;

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

/** Draws the two bands in `layout`, or draws them again at a new width: each is joined by its series, so it keeps its element. */
export function drawLayoutAreas(svgElement: SVGSVGElement, rows: readonly ShotWeek[], layout: AreaLayout): DrawnLayoutAreas {
  const width = Math.max(280, Math.floor(roomFor(svgElement)));
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const first = rows[0]!.week;
  const last = rows[rows.length - 1]!.week;
  const x = (week: number): number => ((week - first) / (last - first)) * plotWidth;
  /** A week's values as drawn: counts, or each a share of the week's shots. */
  const value = (w: ShotWeek, series: ShotSeries): number => (layout === "share" ? w[series] / (w.onTarget + w.offTarget || 1) : w[series]);
  const { step, top } = layout === "share" ? { step: 0.25, top: 1 } : niceTop(Math.max(...rows.map((w) => w.onTarget + w.offTarget)));
  const y = (v: number): number => plotHeight - (v / top) * plotHeight;
  // Off target sits on top of on target.
  const below = (series: ShotSeries, w: ShotWeek): number => (series === "onTarget" ? 0 : value(w, "onTarget"));
  const shape = (d: Band): string =>
    area<ShotWeek>()
      .x((w) => x(w.week))
      .y0((w) => y(below(d.series, w)))
      .y1((w) => y(below(d.series, w) + value(w, d.series)))
      .curve(curveMonotoneX)(d.rows) ?? "";

  const svg = select(svgElement).attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);
  // Drawn under the bands, and hidden from screen readers: the bands' names say the same.
  const axes = svg
    .selectAll<SVGGElement, null>("g.areas-axes")
    .data([null])
    .join("g")
    .attr("class", "areas-axes")
    .attr("aria-hidden", "true")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg
    .selectAll<SVGGElement, null>("g.areas-plot")
    .data([null])
    .join("g")
    .attr("class", "areas-plot")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  const values = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 100) / 100);
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
    .text((v) => (layout === "share" ? `${Math.round(v * 100)}%` : v));
  const weeks = [first, 10, 20, 30, last].filter((week) => week >= first && week <= last);
  axes
    .selectAll<SVGTextElement, number>("text.x-tick")
    .data(weeks)
    .join("text")
    .attr("class", "tick x-tick")
    .attr("x", x)
    .attr("y", plotHeight + 18)
    .attr("text-anchor", "middle")
    .text((week) => (week === first ? `MW ${week}` : week));

  const bands = plot
    .selectAll<SVGPathElement, Band>("path.band")
    .data(SHOTS.map((series): Band => ({ series, rows })), (d) => d.series)
    .join("path")
    .attr("class", (d) => `band band-${d.series}`)
    .attr("d", shape);

  // Each band's name past its right end, level with the band's middle there, kept apart from the other's.
  const end = rows[rows.length - 1]!;
  const middle = (series: ShotSeries): number => y(below(series, end) + value(end, series) / 2) + 4;
  const [low, high] = [middle("onTarget"), middle("offTarget")];
  const gap = APART - (low - high);
  const at: Record<ShotSeries, number> = gap > 0 ? { onTarget: low + gap / 2, offTarget: high - gap / 2 } : { onTarget: low, offTarget: high };
  // Hidden from screen readers: the bands' names say the same.
  plot
    .selectAll<SVGGElement, null>("g.band-names")
    .data([null])
    .join("g")
    .attr("class", "band-names")
    .attr("aria-hidden", "true")
    .selectAll<SVGTextElement, ShotSeries>("text.host-label")
    .data(SHOTS, (series) => series)
    .join("text")
    .attr("class", (series) => `host-label host-label-${series}`)
    .attr("x", plotWidth + 8)
    .attr("y", (series) => at[series])
    .text((series) => NAMES[series]);

  return { bands };
}
