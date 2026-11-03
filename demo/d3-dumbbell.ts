// "Someone else's chart", as a dumbbell: each player's goals or assists in the season's first half
// and second half, drawn the way D3 code would draw it, with a <g> a player joined by name, moved to
// its row, holding the player's name, a <line> from the first half's dot to the second's, edge to
// edge, and a <circle> at each. The rows are sorted by the gap, the biggest rise first. Like d3-slope.ts it knows
// nothing about expressive-charts; demo/charts-effects.ts attaches the effects with expressive(), which
// reads each line and circle by its tag: the lines, and each half's dots, as three attachments.
//
// It has a transition of its own, as d3-transition would give it: the dots and lines move to their new
// values, then the rows move to their new places, each over the time the page gives it, or both at
// once. Its ARIA is a careful D3 author's: the axes, names and dots are hidden, since each row's line
// says both halves, and the page gives the <svg> role="group" and its name.

import { select, type Selection } from "d3-selection";

export type Metric = "goals" | "assists";
export type Half = "first" | "second";

export interface Player {
  readonly name: string;
  readonly goals: { readonly first: number; readonly second: number };
  readonly assists: { readonly first: number; readonly second: number };
}

/** What each player's <g> and <line> carry on __data__: the player's two halves for one metric. */
export interface Row {
  readonly name: string;
  readonly metric: Metric;
  readonly first: number;
  readonly second: number;
}

/** What each <circle> carries on __data__. */
export interface Dot {
  readonly name: string;
  readonly metric: Metric;
  readonly half: Half;
  readonly value: number;
}

/** How long each stage of a change takes, in ms, and whether they run one after the other. */
export interface Timing {
  /** The dots and lines moving to their new values. */
  readonly values: number;
  /** The rows moving to their new places. */
  readonly positions: number;
  /** Values first, then positions; otherwise both at once, over the longer of the two. */
  readonly staged: boolean;
}

export interface DrawnDumbbell {
  /** The lines as a D3 selection, in the rows' order, top to bottom. */
  readonly connectors: Selection<SVGLineElement, Row, SVGGElement, unknown>;
  /** Each half's dots as a D3 selection, in the rows' order. */
  readonly dots: { readonly [H in Half]: Selection<SVGCircleElement, Dot, SVGGElement, Row> };
  /** The metric it shows. */
  readonly metric: Metric;
  /**
   * Joins the players' halves for `metric` and sorts the rows by their new gap, as d3's data() and
   * order() would: the rows' data, classes and order in the document change, and nothing moves.
   */
  set(metric: Metric): void;
  /** Moves the dots, the lines and the rows to where the data puts them; resolves once they're there, or a later move takes over. */
  move(timing: Timing): Promise<void>;
  /** Draws it again at the parent's width, everything where the data puts it. */
  resize(): void;
}

const ROW = 32;
const MARGIN = { top: 10, right: 18, bottom: 40, left: 86 };
/** The dots' radius. */
const RADIUS = 6;
/** Goals and assists share an axis, so a change of metric moves only the values. */
const TOP = 10;

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** d3.easeCubicInOut, as d3-transition eases by default. */
const cubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The players' rows for `metric`, the biggest rise first, then by name. */
export function rowsFor(players: readonly Player[], metric: Metric): Row[] {
  return players
    .map(({ name, [metric]: halves }): Row => ({ name, metric, first: halves.first, second: halves.second }))
    .sort((a, b) => b.second - b.first - (a.second - a.first) || a.name.localeCompare(b.name));
}

/** A row's two dots, the first half's first. */
const dotsOf = (row: Row): Dot[] => (["first", "second"] as const).map((half) => ({ name: row.name, metric: row.metric, half, value: row[half] }));

/** `from` moved a dot's radius toward `to`, or half way if they're closer: a line's end at its dot's edge. */
const toward = (from: number, to: number): number => from + Math.sign(to - from) * Math.min(RADIUS, Math.abs(to - from) / 2);

/** "rise" or "fall": the page colours them, and the names say which. */
const direction = (row: Row): string => (row.second >= row.first ? "rise" : "fall");

/** Where a row is drawn, in px: its values across, and its place down. */
interface Place {
  first: number;
  second: number;
  y: number;
}

/** Draws a row a player in `svgElement`, for `metric`. */
export function drawDumbbell(svgElement: SVGSVGElement, players: readonly Player[], initial: Metric): DrawnDumbbell {
  let metric = initial;
  let rows = rowsFor(players, metric);
  const height = MARGIN.top + players.length * ROW + MARGIN.bottom;
  const plotHeight = players.length * ROW;
  let plotWidth = 0;
  const x = (value: number): number => (value / TOP) * plotWidth;
  const ticks = Array.from({ length: TOP / 2 + 1 }, (_, i) => i * 2);

  const svg = select(svgElement);
  // Hidden from screen readers: the marks' names say the same.
  const axes = svg.append("g").attr("class", "axes").attr("aria-hidden", "true").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const plot = svg.append("g").attr("class", "plot").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  let groups = plot
    .selectAll<SVGGElement, Row>("g.row")
    .data(rows, (d) => d.name)
    .join((enter) => {
      const group = enter.append("g").attr("class", "row");
      // Hidden: each mark's name says whose it is.
      group.append("text").attr("class", "name").attr("aria-hidden", "true").attr("x", -12).attr("y", 4.5).attr("text-anchor", "end").text((d) => d.name);
      group.append("line").attr("class", "connector");
      return group;
    });
  groups
    .selectAll<SVGCircleElement, Dot>("circle.dot")
    .data(dotsOf, (d) => d.half)
    .join("circle")
    .attr("class", (d) => `dot dot-${d.half}`)
    // Hidden: each row's line names both halves.
    .attr("aria-hidden", "true")
    .attr("r", RADIUS);
  /** Where each row is drawn now, by name. */
  const drawn = new Map<string, Place>();
  /** Bumped by each move, so an earlier one stops. */
  let moves = 0;

  /** Where the data puts each row. */
  const targets = (): Map<string, Place> => new Map(rows.map((row, i) => [row.name, { first: x(row.first), second: x(row.second), y: i * ROW + ROW / 2 }]));

  /** Draws every row at its place. */
  function place(at: ReadonlyMap<string, Place>): void {
    for (const [name, p] of at) drawn.set(name, { ...p });
    groups.attr("transform", (d) => `translate(0,${drawn.get(d.name)!.y})`);
    groups
      .select<SVGLineElement>("line.connector")
      .attr("x1", (d) => toward(drawn.get(d.name)!.first, drawn.get(d.name)!.second))
      .attr("x2", (d) => toward(drawn.get(d.name)!.second, drawn.get(d.name)!.first))
      .attr("y1", 0)
      .attr("y2", 0);
    groups
      .selectAll<SVGCircleElement, Dot>("circle.dot")
      .attr("cx", (d) => drawn.get(d.name)![d.half])
      .attr("cy", 0);
  }

  function classes(): void {
    groups.attr("class", (d) => `row ${direction(d)}`);
  }

  function resize(): void {
    const width = Math.max(280, Math.floor(roomFor(svgElement)));
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
    plotWidth = width - MARGIN.left - MARGIN.right;
    axes
      .selectAll<SVGLineElement, number>("line.grid")
      .data(ticks)
      .join("line")
      .attr("class", (v) => (v === 0 ? "grid baseline" : "grid"))
      .attr("x1", x)
      .attr("x2", x)
      .attr("y1", 0)
      .attr("y2", plotHeight);
    axes
      .selectAll<SVGTextElement, number>("text.x-tick")
      .data(ticks)
      .join("text")
      .attr("class", "tick x-tick")
      .attr("x", x)
      .attr("y", plotHeight + 16)
      .attr("text-anchor", "middle")
      .text((v) => v);
    axes
      .selectAll<SVGTextElement, Metric>("text.axis-title")
      .data([metric])
      .join("text")
      .attr("class", "axis-title")
      .attr("x", plotWidth)
      .attr("y", plotHeight + 34)
      .attr("text-anchor", "end")
      .text((m) => (m === "goals" ? "Goals in each half" : "Assists in each half"));
    moves++;
    place(targets());
  }

  function set(next: Metric): void {
    metric = next;
    rows = rowsFor(players, metric);
    const byName = new Map(rows.map((row) => [row.name, row]));
    // The new rows on the groups and lines, the new halves on the dots, and the groups in the new order.
    groups.datum((d) => byName.get(d.name)!);
    groups.select<SVGLineElement>("line.connector");
    groups.selectAll<SVGCircleElement, Dot>("circle.dot").data(dotsOf, (d) => d.half);
    groups = groups.sort((a, b) => rows.indexOf(a) - rows.indexOf(b));
    classes();
    axes.select("text.axis-title").text(metric === "goals" ? "Goals in each half" : "Assists in each half");
  }

  function move(timing: Timing): Promise<void> {
    const id = ++moves;
    const from = new Map([...drawn].map(([name, p]) => [name, { ...p }]));
    const to = targets();
    const values = Math.max(0, timing.values);
    const positions = Math.max(0, timing.positions);
    const total = timing.staged ? values + positions : Math.max(values, positions);
    /** Each stage's progress at `elapsed` ms, eased. */
    const progress = (elapsed: number, start: number, length: number): number => (length <= 0 ? (elapsed >= start ? 1 : 0) : cubic(Math.min(1, Math.max(0, (elapsed - start) / length))));
    const frame = (elapsed: number): void => {
      const v = progress(elapsed, 0, timing.staged ? values : total);
      const p = progress(elapsed, timing.staged ? values : 0, timing.staged ? positions : total);
      const at = new Map<string, Place>();
      for (const [name, a] of from) {
        const b = to.get(name)!;
        at.set(name, { first: a.first + (b.first - a.first) * v, second: a.second + (b.second - a.second) * v, y: a.y + (b.y - a.y) * p });
      }
      place(at);
    };
    if (total <= 0) {
      frame(0);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let start: number | undefined;
      const tick = (time: number): void => {
        if (id !== moves) return resolve();
        start ??= time;
        const elapsed = time - start;
        frame(elapsed);
        if (elapsed < total) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  classes();
  resize();

  return {
    get connectors() {
      return groups.select<SVGLineElement>("line.connector");
    },
    get dots() {
      // selectAll, not select, which would give each dot its row.
      return { first: groups.selectAll<SVGCircleElement, Dot>("circle.dot-first"), second: groups.selectAll<SVGCircleElement, Dot>("circle.dot-second") };
    },
    get metric() {
      return metric;
    },
    set,
    move,
    resize
  };
}
