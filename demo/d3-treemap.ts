// "Someone else's chart", as a treemap: the season's goals by scorer, each scorer a tile as big as
// their goals, the tiles grouped by position, drawn the way D3 code would draw one: d3.hierarchy() and
// d3.treemap() lay the tiles out, and a <rect> a scorer is joined by name, each rect's leaf node on
// __data__, with the scorer's name and goals inside their tile where they fit. Like d3-radar.ts it knows
// nothing about expressive-charts; demo/layouts-effects.ts attaches the effects with expressive() and
// puts it in a chart switch with the scorers' bars (d3-scorer-bars.ts).
//
// Its ARIA is a careful D3 author's: the text is hidden, and the page gives the <svg> role="group" and
// its name.

import { hierarchy, treemap, type HierarchyRectangularNode } from "d3-hierarchy";
import { select, type Selection } from "d3-selection";

/** A scorer's season. */
export interface Scorer {
  readonly name: string;
  readonly pos: string;
  readonly goals: number;
}

/** The tree the layout reads: the season, its positions, their scorers. */
interface Group {
  readonly pos: string;
  readonly children: readonly Scorer[];
}
type TreeNode = { readonly children: readonly Group[] } | Group | Scorer;

/** A scorer's tile: d3.treemap()'s leaf node, its scorer under `data`, its box from x0, y0 to x1, y1. */
export type Tile = HierarchyRectangularNode<TreeNode> & { readonly data: Scorer };

export interface DrawnTreemap {
  /** The tiles as a D3 selection, position by position, most goals first. */
  readonly tiles: Selection<SVGRectElement, Tile, SVGGElement, null>;
}

const HEIGHT = 300;
/** The gap between tiles, the card showing through. */
const PADDING = 2;
/** The name's and the goals' sizes, and how much of a size each character may take with WCAG's text spacing on top (0.12 em a letter). */
const NAME_SIZE = 12;
const GOALS_SIZE = 11;
const CHAR = 0.76;
/** Room round a tile's text. */
const INSET = 6;

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** A position's name as a class: "Midfielder" → "midfielder". */
export const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** "1 goal", "16 goals". */
const goalsText = (goals: number): string => `${goals} ${goals === 1 ? "goal" : "goals"}`;

export interface TreemapOptions {
  /**
   * The scorers to draw. The layout is still every scorer's, so each tile drawn is where it is among
   * them all, and the others' places are left empty. Default: every scorer.
   */
  readonly only?: (scorer: Scorer) => boolean;
}

/**
 * Draws a tile a scorer, or draws them again at a new width or for other scorers: each is joined by
 * name, so it keeps its element. The positions come in the order they first come in the rows, and each
 * one's scorers most goals first, so the same rows always give the same places.
 */
export function drawTreemap(svgElement: SVGSVGElement, scorers: readonly Scorer[], options: TreemapOptions = {}): DrawnTreemap {
  const width = Math.max(280, Math.floor(roomFor(svgElement)));
  // Positions in the order they first come in the rows.
  const positions = [...new Set(scorers.map((s) => s.pos))];
  const root = hierarchy<TreeNode>({ children: positions.map((pos): Group => ({ pos, children: scorers.filter((s) => s.pos === pos) })) }, (d) => ("children" in d ? d.children : undefined))
    .sum((d) => ("goals" in d ? d.goals : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const laidOut = treemap<TreeNode>().size([width, HEIGHT]).paddingInner(PADDING).round(true)(root).leaves() as Tile[];
  const only = options.only;
  const leaves = only ? laidOut.filter((d) => only(d.data)) : laidOut;

  const svg = select(svgElement).attr("viewBox", `0 0 ${width} ${HEIGHT}`).attr("width", width).attr("height", HEIGHT);
  const plot = svg.selectAll<SVGGElement, null>("g.treemap-tiles").data([null]).join("g").attr("class", "treemap-tiles");
  const tiles = plot
    .selectAll<SVGRectElement, Tile>("rect.tile")
    .data(leaves, (d) => d.data.name)
    .join("rect")
    .attr("class", (d) => `tile tile-${slug(d.data.pos)}`)
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("width", (d) => d.x1 - d.x0)
    .attr("height", (d) => d.y1 - d.y0);

  // Each tile's name and goals in its top left corner, both or neither: where the name, or the two
  // lines, don't fit, the tile has none. Hidden from screen readers: the tiles' names say the same.
  const fits = (d: Tile): boolean =>
    Math.max(d.data.name.length * NAME_SIZE, goalsText(d.data.goals).length * GOALS_SIZE) * CHAR + 2 * INSET <= d.x1 - d.x0 && NAME_SIZE + GOALS_SIZE + 3 * INSET <= d.y1 - d.y0;
  const named = leaves.filter(fits);
  const labels = svg.selectAll<SVGGElement, null>("g.treemap-labels").data([null]).join("g").attr("class", "treemap-labels").attr("aria-hidden", "true");
  labels
    .selectAll<SVGTextElement, Tile>("text.host-label")
    .data(named, (d) => d.data.name)
    .join("text")
    .attr("class", "host-label")
    .attr("x", (d) => d.x0 + INSET)
    .attr("y", (d) => d.y0 + INSET + NAME_SIZE)
    .text((d) => d.data.name);
  labels
    .selectAll<SVGTextElement, Tile>("text.host-value")
    .data(named, (d) => d.data.name)
    .join("text")
    .attr("class", "host-value")
    .attr("x", (d) => d.x0 + INSET)
    .attr("y", (d) => d.y0 + INSET + NAME_SIZE + INSET + GOALS_SIZE)
    .text((d) => goalsText(d.data.goals));

  return { tiles };
}
