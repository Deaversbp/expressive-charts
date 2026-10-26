// "Someone else's chart", as a slope chart: each player's goals at matchweek 1 and now, drawn the way
// D3 code would draw it, with d3-selection paths joined by player in a margin <g>, each path's row on
// __data__. Like d3-line.ts it knows nothing about expressive-charts; demo/season.ts attaches the
// effects with expressive(), describing each path from the same points.
//
// Each line runs from its value at matchweek 1 to its value now, then on a short leader to its name,
// past the right axis. Names that would overlap are spread apart, so a leader can bend; its last few
// px are level, so whatever is written past a name reads along its row. It redraws from scratch on
// every change, with no animation of its own. Its ARIA is a careful D3 author's: the axes and names
// are hidden, and the page gives the <svg> role="group" and its name.

import { select, type Selection } from "d3-selection";

export interface Slope {
  readonly name: string;
  /** Goals at matchweek 1. */
  readonly first: number;
  /** Goals now. */
  readonly now: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DrawnSlopes {
  /** The lines as a D3 selection, in the rows' order. */
  readonly paths: Selection<SVGPathElement, Slope, SVGGElement, unknown>;
  /** The points a player's line is drawn through, in the plot <g>'s units: matchweek 1, now, and its leader. */
  points(name: string): readonly Point[];
  /** The box of a player's name as drawn, in the plot <g>'s units. */
  nameBox(name: string): Box;
  /** The names' <g>: the plot leaves room for the longest, so a page draws again when it changes size. */
  readonly names: SVGGElement;
  /** The lines' stroke width. */
  readonly width: number;
  /** Draws the chart again with new rows and the matchweek they're at, or at the parent's new width. */
  draw(rows?: readonly Slope[], week?: number): void;
}

const HEIGHT = 300;
const MARGIN = { top: 14, bottom: 30, left: 30 };
/** Px past the right axis: the leader's bend, its level end, and the gap before the name. */
const BEND = 8;
const LEVEL = 6;
const GAP = 4;
/** The least distance between two names' baselines. */
const LINE = 15;
/** Room past the longest name for text the page writes there, such as a change ("+14"). */
const AFTER = 52;
/** As wide as the D3 line's strokes. */
const WIDTH = 2.25;

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

/**
 * Where each name's baseline goes: beside its line's end, or pushed down (then up, at the bottom)
 * until it's at least LINE px from the next, in the order the lines end, top to bottom.
 */
function spread(ends: readonly { name: string; y: number }[], bottom: number): Map<string, number> {
  const order = [...ends].sort((a, b) => a.y - b.y || a.name.localeCompare(b.name));
  const at = order.map((end) => end.y);
  for (let i = 1; i < at.length; i++) at[i] = Math.max(at[i]!, at[i - 1]! + LINE);
  for (let i = at.length - 1; i >= 0; i--) at[i] = Math.min(at[i]!, i === at.length - 1 ? bottom : at[i + 1]! - LINE);
  return new Map(order.map((end, i) => [end.name, at[i]!]));
}

/** Draws a line per player in `svgElement`, from matchweek 1 to `week`. */
export function drawSlopes(svgElement: SVGSVGElement, initial: readonly Slope[], initialWeek: number): DrawnSlopes {
  let rows = initial;
  let week = initialWeek;
  const svg = select(svgElement);
  // The axes and names are hidden from screen readers: the lines' names say the same.
  const axes = svg.append("g").attr("class", "axes").attr("aria-hidden", "true").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg.append("g").attr("class", "plot").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const lines = plot.append("g").attr("class", "lines");
  const names = plot.append("g").attr("class", "names").attr("aria-hidden", "true");
  let paths = lines.selectAll<SVGPathElement, Slope>("path.slope");
  let drawnPoints = new Map<string, readonly Point[]>();
  let boxes = new Map<string, Box>();

  function draw(next: readonly Slope[] = rows, nextWeek: number = week): void {
    rows = next;
    week = nextWeek;
    const width = Math.max(280, Math.floor(roomFor(svgElement)));
    svg.attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);

    // The names first, so the plot can leave room for the longest.
    const labels = names
      .selectAll<SVGTextElement, Slope>("text.name")
      .data(rows, (d) => d.name)
      .join("text")
      .attr("class", "name")
      .text((d) => d.name);
    const longest = Math.max(0, ...labels.nodes().map((text) => text.getComputedTextLength()));
    const plotWidth = Math.max(80, width - MARGIN.left - BEND - LEVEL - GAP - longest - AFTER);
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const { step, top } = niceTop(Math.max(1, ...rows.map((d) => Math.max(d.first, d.now))));
    const y = (value: number): number => plotHeight - (value / top) * plotHeight;

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
    axes
      .selectAll<SVGLineElement, number>("line.edge")
      .data([0, plotWidth])
      .join("line")
      .attr("class", "edge")
      .attr("x1", (x) => x)
      .attr("x2", (x) => x)
      .attr("y1", 0)
      .attr("y2", plotHeight);
    axes
      .selectAll<SVGTextElement, { x: number; text: string }>("text.x-tick")
      .data([
        { x: 0, text: "MW 1" },
        { x: plotWidth, text: `MW ${week}` }
      ])
      .join("text")
      .attr("class", "tick x-tick")
      .attr("x", (d) => d.x)
      .attr("y", plotHeight + 20)
      .attr("text-anchor", "middle")
      .text((d) => d.text);

    const at = spread(
      rows.map((d) => ({ name: d.name, y: y(d.now) })),
      plotHeight
    );
    drawnPoints = new Map(
      rows.map((d) => {
        const name = at.get(d.name)!;
        return [
          d.name,
          [
            { x: 0, y: y(d.first) },
            { x: plotWidth, y: y(d.now) },
            { x: plotWidth + BEND, y: name },
            { x: plotWidth + BEND + LEVEL, y: name }
          ]
        ];
      })
    );
    labels
      .attr("x", plotWidth + BEND + LEVEL + GAP)
      .attr("y", (d) => at.get(d.name)! + 4.5)
      .attr("text-anchor", "start");
    boxes = new Map();
    labels.each(function (d) {
      const { x, y, width, height } = this.getBBox();
      boxes.set(d.name, { x, y, width, height });
    });

    paths = lines
      .selectAll<SVGPathElement, Slope>("path.slope")
      .data(rows, (d) => d.name)
      .join("path")
      .attr("class", "slope")
      .attr("stroke-width", WIDTH)
      .attr("d", (d) => `M${drawnPoints.get(d.name)!.map((p) => `${p.x},${p.y}`).join("L")}`);
  }
  draw();

  return {
    get paths() {
      return paths;
    },
    points: (name) => drawnPoints.get(name) ?? [],
    nameBox: (name) => boxes.get(name) ?? { x: 0, y: 0, width: 0, height: 0 },
    names: names.node()!,
    width: WIDTH,
    draw
  };
}
