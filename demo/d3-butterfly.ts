// "Someone else's chart", as a butterfly: goals conceded and scored in each 15-minute band of a match,
// over the season, drawn the way D3 code would draw it, with two <g>s of d3-selection rects joined by
// band, conceded to the left of the bands' names and scored to the right, each rect's half on
// __data__ and its count past its end. Like d3-columns.ts it knows nothing about expressive-charts;
// demo/charts-effects.ts attaches each half with expressive(), which reads each rect as a bar.
//
// Its ARIA is a careful D3 author's: the names, counts and headings are hidden, and the page gives the
// <svg> role="group" and its name.

import { select, type Selection } from "d3-selection";

export interface Band {
  /** "0–15", "76–90+". */
  readonly band: string;
  readonly conceded: number;
  readonly scored: number;
}

export type Side = "conceded" | "scored";

/** What each rect carries on __data__: one band's goals on one side. */
export interface Half {
  readonly band: string;
  readonly side: Side;
  readonly goals: number;
}

export interface DrawnButterfly {
  /** Each half's rects as a D3 selection, the first band at the top. */
  readonly halves: { readonly [S in Side]: Selection<SVGRectElement, Half, SVGGElement, unknown> };
  /** Draws it again at the parent's width. */
  resize(): void;
}

const ROW = 32;
const BAR = 20;
/** The bands' names, between the halves. */
const MIDDLE = 64;
/** Room past each bar's end for its count. */
const COUNT = 26;
const MARGIN = { top: 26, right: 4, bottom: 6, left: 4 };
const SIDES: readonly Side[] = ["conceded", "scored"];

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** Draws a row a band in `svgElement`, conceded growing left and scored growing right from the middle. */
export function drawButterfly(svgElement: SVGSVGElement, bands: readonly Band[]): DrawnButterfly {
  const height = MARGIN.top + bands.length * ROW + MARGIN.bottom;
  const max = Math.max(1, ...bands.flatMap((b) => [b.conceded, b.scored]));
  const svg = select(svgElement);
  // Hidden from screen readers: the bars' names say the same.
  const labels = svg.append("g").attr("class", "axes").attr("aria-hidden", "true").attr("transform", `translate(0,${MARGIN.top})`);
  const plot = svg.append("g").attr("class", "plot").attr("transform", `translate(0,${MARGIN.top})`);
  const halves = Object.fromEntries(
    SIDES.map((side) => [
      side,
      plot
        .append("g")
        .attr("class", `half half-${side}`)
        .selectAll<SVGRectElement, Half>("rect.bar")
        .data(
          bands.map((b): Half => ({ band: b.band, side, goals: b[side] })),
          (d) => d.band
        )
        .join("rect")
        .attr("class", `bar bar-${side}`)
        .attr("height", BAR)
    ])
  ) as unknown as DrawnButterfly["halves"];
  const y = (i: number): number => i * ROW + (ROW - BAR) / 2;

  function resize(): void {
    const width = Math.max(280, Math.floor(roomFor(svgElement)));
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
    const middle = width / 2;
    const reach = middle - MIDDLE / 2 - COUNT - MARGIN.left;
    const length = (goals: number): number => (goals / max) * reach;
    // Where each half starts: the edge every one of its bars shares.
    const edge = { conceded: middle - MIDDLE / 2, scored: middle + MIDDLE / 2 };

    halves.conceded.attr("x", (d) => edge.conceded - length(d.goals)).attr("y", (_, i) => y(i)).attr("width", (d) => length(d.goals));
    halves.scored.attr("x", edge.scored).attr("y", (_, i) => y(i)).attr("width", (d) => length(d.goals));

    labels
      .selectAll<SVGTextElement, Band>("text.band")
      .data(bands)
      .join("text")
      .attr("class", "band")
      .attr("x", middle)
      .attr("y", (_, i) => y(i) + BAR / 2 + 4.5)
      .attr("text-anchor", "middle")
      .text((d) => d.band);
    labels
      .selectAll<SVGTextElement, Half>("text.count")
      .data(SIDES.flatMap((side) => bands.map((b): Half => ({ band: b.band, side, goals: b[side] }))))
      .join("text")
      .attr("class", "count")
      .attr("x", (d) => (d.side === "conceded" ? edge.conceded - length(d.goals) - 6 : edge.scored + length(d.goals) + 6))
      .attr("y", (d) => y(bands.findIndex((b) => b.band === d.band)) + BAR / 2 + 4.5)
      .attr("text-anchor", (d) => (d.side === "conceded" ? "end" : "start"))
      .text((d) => d.goals);
    labels
      .selectAll<SVGTextElement, Side>("text.heading")
      .data(SIDES)
      .join("text")
      .attr("class", "heading")
      .attr("x", (side) => edge[side])
      .attr("y", -10)
      .attr("text-anchor", (side) => (side === "conceded" ? "end" : "start"))
      .text((side) => (side === "conceded" ? "Conceded" : "Scored"));
    labels
      .selectAll<SVGTextElement, string>("text.minutes")
      .data(["Minutes"])
      .join("text")
      .attr("class", "minutes")
      .attr("x", middle)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .text((d) => d);
  }
  resize();

  return { halves, resize };
}
