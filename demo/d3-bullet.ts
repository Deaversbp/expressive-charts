// "Someone else's chart", as a bullet chart: each player's goals or assists for the season against a
// target, drawn the way D3 code would draw it, with a <g> a player joined by name, holding the
// player's name, a <rect> for the value and a <line> across it at the target, over three shaded bands
// that are the same for every row, on one axis. Like d3-dumbbell.ts it knows nothing about
// expressive-charts; demo/charts-effects.ts attaches the effects with expressive(), which reads each
// rect as a bar and each line by its tag: the bars, and the markers, as two attachments.
//
// Its ARIA is a careful D3 author's: the axis, the bands, the names and the markers are hidden, since
// each bar's name says its value, its target and whether it's met, and the page gives the <svg>
// role="group" and its name.

import { select, type Selection } from "d3-selection";

export type Measure = "goals" | "assists";

/** What each player's <g>, <rect> and <line> carry on __data__: one player's season for one measure. */
export interface BulletRow {
  readonly name: string;
  readonly measure: Measure;
  readonly value: number;
  readonly target: number;
}

/** A shaded range behind every bar, from one value up to another. */
export interface Range {
  readonly from: number;
  readonly to: number;
}

export interface DrawnBullet {
  /** The value bars as a D3 selection, in the rows' order, top to bottom. */
  readonly bars: Selection<SVGRectElement, BulletRow, SVGGElement, unknown>;
  /** The target markers as a D3 selection, in the rows' order. */
  readonly markers: Selection<SVGLineElement, BulletRow, SVGGElement, unknown>;
  /** The rows it shows now, in their order. */
  readonly rows: readonly BulletRow[];
  /** Joins new rows by name, as d3's data() would, and draws them at once: the bars' lengths and the markers' places change, and no row moves. */
  set(rows: readonly BulletRow[]): void;
  /** Draws it again at the parent's width. */
  resize(): void;
}

const ROW = 32;
/** A band's height, a bar's, and a marker's, each centred on its row. */
const BAND = 20;
const BAR = 8;
const MARKER = 16;
const MARGIN = { top: 10, right: 18, bottom: 40, left: 86 };

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** What the axis says under itself. */
const title = (measure: Measure | undefined): string => (measure === "assists" ? "Assists this season" : "Goals this season");

/**
 * Draws a row a player in `svgElement`: `ranges` shaded behind each, lowest first, on an axis from 0
 * to the last range's end, with a tick at each of `ticks`.
 */
export function drawBullet(svgElement: SVGSVGElement, initial: readonly BulletRow[], ranges: readonly Range[], ticks: readonly number[]): DrawnBullet {
  let rows = initial;
  const top = Math.max(1, ...ranges.map((range) => range.to));
  const height = MARGIN.top + rows.length * ROW + MARGIN.bottom;
  const plotHeight = rows.length * ROW;
  let plotWidth = 0;
  const x = (value: number): number => (Math.min(top, Math.max(0, value)) / top) * plotWidth;

  const svg = select(svgElement);
  // Hidden from screen readers: the bars' names say the same.
  const axes = svg.append("g").attr("class", "axes").attr("aria-hidden", "true").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  // The bands are context: hidden, and drawn under the rows, in a group of their own.
  const bands = svg.append("g").attr("class", "bands").attr("aria-hidden", "true").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg.append("g").attr("class", "plot").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const groups = plot
    .selectAll<SVGGElement, BulletRow>("g.row")
    .data([...rows], (d) => d.name)
    .join((enter) => {
      const group = enter.append("g").attr("class", "row");
      // Hidden: each bar's name says whose it is.
      group.append("text").attr("class", "name").attr("aria-hidden", "true").attr("x", -12).attr("y", 4.5).attr("text-anchor", "end").text((d) => d.name);
      group.append("rect").attr("class", "value");
      // Hidden: each bar's name says its target, and whether it's met.
      group.append("line").attr("class", "target").attr("aria-hidden", "true");
      return group;
    })
    .attr("transform", (_, i) => `translate(0,${i * ROW + ROW / 2})`);

  /** Every bar and marker where its row puts it. */
  function place(): void {
    groups
      .select<SVGRectElement>("rect.value")
      .attr("x", 0)
      .attr("y", -BAR / 2)
      .attr("width", (d) => x(d.value))
      .attr("height", BAR);
    groups
      .select<SVGLineElement>("line.target")
      .attr("x1", (d) => x(d.target))
      .attr("x2", (d) => x(d.target))
      .attr("y1", -MARKER / 2)
      .attr("y2", MARKER / 2);
  }

  function resize(): void {
    const width = Math.max(280, Math.floor(roomFor(svgElement)));
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
    plotWidth = width - MARGIN.left - MARGIN.right;
    bands
      .selectAll<SVGGElement, BulletRow>("g.band-row")
      .data([...rows], (d) => d.name)
      .join("g")
      .attr("class", "band-row")
      .attr("transform", (_, i) => `translate(0,${i * ROW + ROW / 2})`)
      .selectAll<SVGRectElement, Range>("rect.band")
      .data([...ranges])
      .join("rect")
      .attr("class", (_, i) => `band band-${i + 1}`)
      .attr("x", (d) => x(d.from))
      .attr("y", -BAND / 2)
      .attr("width", (d) => x(d.to) - x(d.from))
      .attr("height", BAND);
    axes
      .selectAll<SVGTextElement, number>("text.x-tick")
      .data([...ticks])
      .join("text")
      .attr("class", "tick x-tick")
      .attr("x", x)
      .attr("y", plotHeight + 16)
      .attr("text-anchor", "middle")
      .text((v) => v);
    axes
      .selectAll<SVGTextElement, Measure | undefined>("text.axis-title")
      .data([rows[0]?.measure])
      .join("text")
      .attr("class", "axis-title")
      .attr("x", plotWidth)
      .attr("y", plotHeight + 34)
      .attr("text-anchor", "end")
      .text(title);
    place();
  }

  function set(next: readonly BulletRow[]): void {
    rows = next;
    const byName = new Map(rows.map((row) => [row.name, row]));
    // The new rows on the groups, and through select() on each one's bar and marker.
    groups.datum((d) => byName.get(d.name) ?? d);
    axes.select<SVGTextElement>("text.axis-title").text(title(rows[0]?.measure));
    place();
  }

  resize();

  return {
    get bars() {
      return groups.select<SVGRectElement>("rect.value");
    },
    get markers() {
      return groups.select<SVGLineElement>("line.target");
    },
    get rows() {
      return rows;
    },
    set,
    resize
  };
}
