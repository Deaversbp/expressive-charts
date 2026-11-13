// "Someone else's chart", as a funnel: the season's shots, those on target and the goals, drawn the
// way D3 code would draw it, with a <path> a stage joined by name, centred, top to bottom, each a
// trapezoid as wide as its count at its top and as the next stage's at its bottom, with a gap before
// the next. Each stage's name is in a column to its left and its count in a column to its right. Like
// d3-butterfly.ts it knows nothing about expressive-charts; demo/charts-effects.ts attaches the stages
// with expressive(), describing each from its path and from where this module says its text is.
//
// Its ARIA is a careful D3 author's: the names and counts are hidden, since each stage's name says
// both, and the page gives the <svg> role="group" and its name.

import { select, type Selection } from "d3-selection";

/** What each stage's <path> carries on __data__. */
export interface Stage {
  /** "On target". */
  readonly name: string;
  readonly count: number;
}

/** A box in the chart's own px. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where a stage is drawn: its top edge, and the boxes of its name and its count. */
export interface StagePlace {
  /** The stage's top edge, a box of no height. */
  readonly top: Box;
  readonly name: Box;
  readonly count: Box;
}

export interface DrawnFunnel<S extends Stage = Stage> {
  /** The stages as a D3 selection, the first at the top, each carrying its row. */
  readonly stages: Selection<SVGPathElement, S, SVGGElement, unknown>;
  /** Where a stage is drawn now, by its name. */
  place(name: string): StagePlace;
  /** Draws it again at the parent's width. */
  resize(): void;
}

const STAGE = 56;
/** Between one stage and the next: room for a line of text a page writes there. */
const GAP = 32;
/** The columns either side: the names' on the left, the counts' on the right. */
const NAMES = 70;
const COUNTS = 40;
/** Between a column's text and the funnel at its widest. */
const BESIDE = 10;
const MARGIN = { top: 8, bottom: 8 };
/** The text's size, and a line's height at it. */
const TEXT = 12.5;
const LINE = 16;

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** A text's width as drawn, or, where nothing is laid out, about what its characters take. */
function widthOf(text: SVGTextElement): number {
  let measured = 0;
  try {
    measured = text.getComputedTextLength();
  } catch {
    // Not laid out: estimated below.
  }
  return measured > 0 ? measured : (text.textContent ?? "").length * TEXT * 0.55;
}

/** Draws a stage a row in `svgElement`, the first at the top, each narrowing into the next. */
export function drawFunnel<S extends Stage>(svgElement: SVGSVGElement, rows: readonly S[]): DrawnFunnel<S> {
  const height = MARGIN.top + rows.length * STAGE + (rows.length - 1) * GAP + MARGIN.bottom;
  const most = Math.max(1, ...rows.map((row) => row.count));
  const svg = select(svgElement);
  // Hidden from screen readers: the stages' names say the same.
  const labels = svg.append("g").attr("class", "axes").attr("aria-hidden", "true");
  const stages = svg
    .append("g")
    .attr("class", "plot")
    .selectAll<SVGPathElement, S>("path.stage")
    .data([...rows], (d) => d.name)
    .join("path")
    .attr("class", "stage");
  const y = (i: number): number => MARGIN.top + i * (STAGE + GAP);
  let middle = 0;
  let reach = 0;
  const wide = (count: number): number => (count / most) * reach;

  function resize(): void {
    const width = Math.max(280, Math.floor(roomFor(svgElement)));
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
    reach = width - NAMES - COUNTS;
    middle = NAMES + reach / 2;
    stages.attr("d", (d, i) => {
      // The last stage has nothing to narrow into: it keeps its width.
      const top = wide(d.count) / 2;
      const bottom = wide((rows[i + 1] ?? d).count) / 2;
      return `M${middle - top},${y(i)}L${middle + top},${y(i)}L${middle + bottom},${y(i) + STAGE}L${middle - bottom},${y(i) + STAGE}Z`;
    });
    labels
      .selectAll<SVGTextElement, Stage>("text.name")
      .data([...rows], (d) => d.name)
      .join("text")
      .attr("class", "name")
      .attr("x", NAMES - BESIDE)
      .attr("y", (_, i) => y(i) + STAGE / 2 + 4.5)
      .attr("text-anchor", "end")
      .text((d) => d.name);
    labels
      .selectAll<SVGTextElement, Stage>("text.count")
      .data([...rows], (d) => d.name)
      .join("text")
      .attr("class", "count")
      .attr("x", width - COUNTS + BESIDE)
      .attr("y", (_, i) => y(i) + STAGE / 2 + 4.5)
      .attr("text-anchor", "start")
      .text((d) => d.count);
  }
  resize();

  function place(name: string): StagePlace {
    const i = rows.findIndex((row) => row.name === name);
    const row = rows[i];
    if (!row) throw new RangeError(`The funnel has no stage named ${JSON.stringify(name)}.`);
    const width = wide(row.count);
    const line = y(i) + STAGE / 2 - LINE / 2;
    const nameWidth = widthOf(labels.selectAll<SVGTextElement, Stage>("text.name").nodes()[i]!);
    const countWidth = widthOf(labels.selectAll<SVGTextElement, Stage>("text.count").nodes()[i]!);
    return {
      top: { x: middle - width / 2, y: y(i), width, height: 0 },
      name: { x: NAMES - BESIDE - nameWidth, y: line, width: nameWidth, height: LINE },
      count: { x: middle + reach / 2 + BESIDE, y: line, width: countWidth, height: LINE }
    };
  }

  return { stages, place, resize };
}
