// "Someone else's chart", as a waterfall: a club's goal difference month by month and the season's
// total, drawn the way D3 code would draw it, with d3-selection rects joined by month in a margin <g>,
// each rect's step on __data__. Like d3-slope.ts it knows nothing about expressive-charts;
// demo/charts-effects.ts attaches the effects with expressive(), describing each step from its rect.
//
// Each month is a floating step from the running total before it to the one after: a rise from its
// bottom, a fall from its top. The season's total stands on the axis. A thin connector joins each
// step's end to the next step's start, and an unstroked staircase runs over the tops of the steps,
// from August's start to the total's end, for a page to carry something along. Its ARIA is a careful
// D3 author's: the axes, the connectors and the staircase are hidden, and the page gives the <svg>
// role="group" and its name.

import { select, type Selection } from "d3-selection";

export interface Month {
  /** "August". */
  readonly month: string;
  /** The month's goal difference. */
  readonly change: number;
}

export type StepKind = "rise" | "fall" | "total";

/** What each step's rect carries on __data__. */
export interface Step {
  /** The month's name, or "Season" for the total. */
  readonly name: string;
  /** Under the step: "Aug", or "Total". */
  readonly short: string;
  readonly kind: StepKind;
  /** The month's goal difference, or the season's for the total. */
  readonly value: number;
  /** The running total before the step (0 for the total) and after it. */
  readonly from: number;
  readonly to: number;
}

/** What each connector carries on __data__: the step it leaves, the step it reaches, and the running total between. */
export interface Connector {
  readonly from: string;
  readonly to: string;
  readonly level: number;
}

export interface DrawnWaterfall {
  /** The steps as a D3 selection, August first and the total last. */
  readonly steps: Selection<SVGRectElement, Step, SVGGElement, unknown>;
  /** The connectors as a D3 selection, in the steps' order. */
  readonly connectors: Selection<SVGLineElement, Connector, SVGGElement, unknown>;
  /** The staircase, one open path, as a D3 selection. Its row is the steps. */
  readonly staircase: Selection<SVGPathElement, Step[], SVGGElement, unknown>;
  /** Draws it again at the parent's width. */
  resize(): void;
}

const HEIGHT = 300;
/** Room above for the labels a page writes over the highest step, and below for the months. */
const MARGIN = { top: 34, right: 8, bottom: 30, left: 32 };
/** A step's share of its band; the rest is the gap a connector crosses. */
const STEP = 0.62;
/** Bands narrower than this get one letter under them. */
const NARROW = 30;

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** Each month as a step from the running total before it, and the season's total last. */
export function stepsOf(months: readonly Month[]): Step[] {
  let total = 0;
  const steps: Step[] = months.map(({ month, change }) => {
    const from = total;
    total += change;
    return { name: month, short: month.slice(0, 3), kind: change < 0 ? "fall" : "rise", value: change, from, to: total };
  });
  steps.push({ name: "Season", short: "Total", kind: "total", value: total, from: 0, to: total });
  return steps;
}

/** Draws the steps in `svgElement`, a band each, with the total last. */
export function drawWaterfall(svgElement: SVGSVGElement, months: readonly Month[]): DrawnWaterfall {
  const steps = stepsOf(months);
  const levels = steps.flatMap((s) => [s.from, s.to]);
  // A round range in fives, with room for a label under the lowest fall.
  const low = Math.floor((Math.min(0, ...levels) - 2) / 5) * 5;
  const high = Math.ceil(Math.max(0, ...levels) / 5) * 5;
  const ticks = Array.from({ length: (high - low) / 5 + 1 }, (_, i) => low + i * 5);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const y = (value: number): number => ((high - value) / (high - low)) * plotHeight;

  const svg = select(svgElement);
  // Hidden from screen readers: the steps' names say the same.
  const axes = svg.append("g").attr("class", "axes").attr("aria-hidden", "true").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg.append("g").attr("class", "plot").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  // The connectors and the staircase are decoration: the steps' names have the running totals.
  const connectors = plot
    .append("g")
    .attr("class", "connectors")
    .attr("aria-hidden", "true")
    .selectAll<SVGLineElement, Connector>("line.connector")
    .data(
      steps.slice(1).map((step, i): Connector => ({ from: steps[i]!.name, to: step.name, level: steps[i]!.to })),
      (d) => d.from
    )
    .join("line")
    .attr("class", "connector");
  const rects = plot
    .append("g")
    .attr("class", "steps")
    .selectAll<SVGRectElement, Step>("rect.step")
    .data(steps, (d) => d.name)
    .join("rect")
    .attr("class", (d) => `step step-${d.kind}`);
  const staircase = plot
    .append("g")
    .attr("class", "staircase")
    .attr("aria-hidden", "true")
    .selectAll<SVGPathElement, Step[]>("path")
    .data([steps])
    .join("path")
    .attr("fill", "none")
    .attr("stroke", "none");

  function resize(): void {
    const width = Math.max(280, Math.floor(roomFor(svgElement)));
    svg.attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const band = plotWidth / steps.length;
    const left = (i: number): number => i * band + (band * (1 - STEP)) / 2;
    const stepWidth = band * STEP;
    const top = (s: Step): number => y(Math.max(s.from, s.to));

    axes
      .selectAll<SVGLineElement, number>("line.grid")
      .data(ticks)
      .join("line")
      .attr("class", (v) => (v === 0 ? "grid baseline" : "grid"))
      .attr("x1", 0)
      .attr("x2", plotWidth)
      .attr("y1", y)
      .attr("y2", y);
    axes
      .selectAll<SVGTextElement, number>("text.y-tick")
      .data(ticks)
      .join("text")
      .attr("class", "tick y-tick")
      .attr("x", -8)
      .attr("y", (v) => y(v) + 4)
      .attr("text-anchor", "end")
      // A true minus sign, as the steps' labels have.
      .text((v) => (v < 0 ? `−${-v}` : v > 0 ? `+${v}` : "0"));
    axes
      .selectAll<SVGTextElement, Step>("text.x-tick")
      .data(steps)
      .join("text")
      .attr("class", "tick x-tick")
      .attr("x", (_, i) => left(i) + stepWidth / 2)
      .attr("y", plotHeight + 20)
      .attr("text-anchor", "middle")
      .text((d) => (band < NARROW ? d.short[0]! : d.short));

    rects
      .attr("x", (_, i) => left(i))
      .attr("y", top)
      .attr("width", stepWidth)
      .attr("height", (d) => Math.abs(y(d.from) - y(d.to)));
    connectors
      .attr("x1", (_, i) => left(i) + stepWidth)
      .attr("x2", (_, i) => left(i + 1))
      .attr("y1", (d) => y(d.level))
      .attr("y2", (d) => y(d.level));

    // Over the tops: up a rise's left side and across, across a fall's top and down its right side,
    // along each connector, and across the total to its end.
    const corners: [number, number][] = [];
    steps.forEach((s, i) => {
      const x0 = left(i);
      const x1 = x0 + stepWidth;
      // The total stands on the axis, but the staircase reaches it at the last step's level.
      if (s.kind === "total") corners.push([x0, y(s.to)], [x1, y(s.to)]);
      else if (s.kind === "fall") corners.push([x0, y(s.from)], [x1, y(s.from)], [x1, y(s.to)]);
      else corners.push([x0, y(s.from)], [x0, y(s.to)], [x1, y(s.to)]);
    });
    // Each connector's end is the next step's first corner.
    const path = corners.filter(([x, cy], i) => !(corners[i - 1]?.[0] === x && corners[i - 1]?.[1] === cy));
    staircase.attr("d", `M${path.map(([x, cy]) => `${x},${cy}`).join("L")}`);
  }
  resize();

  return { steps: rects, connectors, staircase, resize };
}
