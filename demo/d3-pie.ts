// "Someone else's chart", round: a donut drawn the way D3 code would draw it, with d3.pie() and
// d3.arc(), its slices joined by outcome in a centred <g>, each path's arc on __data__. Like
// host-chart.ts it knows nothing about expressive-charts; demo/donut.ts attaches effects to it with
// expressive(), passing the arc generator's radii to describe.arc.
//
// Its ARIA is a careful D3 author's: the labels are hidden, and the page gives the <svg> role="group"
// and its name. expressive()'s markLabel names the slices, since its keyboard focus lands on them.

import { select, type Selection } from "d3-selection";
import { arc, pie, type PieArcDatum } from "d3-shape";

export interface Outcome {
  readonly outcome: string;
  readonly shots: number;
}

/** What each path carries on __data__, as d3.pie() makes it. */
export type Slice = PieArcDatum<Outcome>;

export interface PieOptions {
  /** "value": d3.pie()'s default, largest first. "none": data order, with pie.sort(null). */
  readonly sort: "none" | "value";
}

export interface DrawnPie {
  /** The slices as a D3 selection, in data order: d3.pie() sorts the angles, not the arcs it returns. */
  readonly slices: Selection<SVGPathElement, Slice, SVGGElement, null>;
  /** The arc generator's radii, which expressive() needs to describe each slice. */
  readonly inner: number;
  readonly outer: number;
}

const HEIGHT = 300;
/** Room beside the ring for a label such as "Off target". */
const LABEL_ROOM = 84;
/** A label sits this far out from the ring. */
const LABEL_GAP = 12;
/** Slices narrower than this (radians, about 15°) get no label. */
const MIN_LABEL_ANGLE = 0.26;

/** "Off target" → "off-target", for a class name. */
const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** Draws the pie, or redraws it with new rows or a new width: the paths are joined by outcome, so each keeps its element. */
export function drawPie(svgElement: SVGSVGElement, rows: readonly Outcome[], options: PieOptions): DrawnPie {
  const width = Math.max(280, Math.floor(roomFor(svgElement)));
  const outer = Math.max(48, Math.min(108, width / 2 - LABEL_ROOM));
  const inner = outer * 0.6;

  const svg = select(svgElement).attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);
  const plot = svg
    .selectAll<SVGGElement, null>("g.pie-plot")
    .data([null])
    .join("g")
    .attr("class", "pie-plot")
    .attr("transform", `translate(${width / 2},${HEIGHT / 2})`);

  const layout = pie<Outcome>().value((d) => d.shots);
  if (options.sort === "none") layout.sort(null);
  const arcs = layout([...rows]);
  const shape = arc<Slice>().innerRadius(inner).outerRadius(outer);

  const slices = plot
    .selectAll<SVGPathElement, Slice>("path.slice")
    .data(arcs, (d) => d.data.outcome)
    .join("path")
    .attr("class", (d) => `slice slice-${slug(d.data.outcome)}`)
    .attr("d", shape);

  // Each label: the outcome over its count, out from the middle of its slice, leaning away from the ring.
  const labelled = arcs.filter((d) => d.endAngle - d.startAngle >= MIN_LABEL_ANGLE);
  const labels = plot
    .selectAll<SVGGElement, Slice>("g.pie-label")
    .data(labelled, (d) => d.data.outcome)
    .join((enter) => {
      // Hidden from screen readers: the slices' names say the same.
      const group = enter.append("g").attr("class", "pie-label").attr("aria-hidden", "true");
      group.append("text").attr("class", "host-label");
      group.append("text").attr("class", "host-value");
      return group;
    });
  labels.each(function (d) {
    const middle = (d.startAngle + d.endAngle) / 2;
    const x = Math.sin(middle) * (outer + LABEL_GAP);
    const y = -Math.cos(middle) * (outer + LABEL_GAP);
    const anchor = Math.sin(middle) > 0.3 ? "start" : Math.sin(middle) < -0.3 ? "end" : "middle";
    // Above the ring at 12 o'clock, beside it at 3 and 9, below it at 6.
    const top = y - 2 - 14 * Math.cos(middle);
    const group = select(this);
    group.select(".host-label").attr("x", x).attr("y", top).attr("text-anchor", anchor).text(d.data.outcome);
    group.select(".host-value").attr("x", x).attr("y", top + 15).attr("text-anchor", anchor).text(d.data.shots);
  });

  return { slices, inner, outer };
}
