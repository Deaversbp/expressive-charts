// "Someone else's chart", as a radar: a player's six numbers per 90 minutes against the league
// average, each scaled from 0 to 100 as a percentile of the league's outfield players, drawn the way
// D3 code would draw it: hexagonal rings and a spoke an axis, a <polygon> a series joined by its name,
// and a <circle> at each value, in a <g> centred on the radar. Like d3-slope.ts it knows nothing about
// expressive-charts; demo/charts-effects.ts attaches the effects with expressive(), describing each
// outline and each value from the points this draws.
//
// Its ARIA is a careful D3 author's: the rings, spokes and axis names are hidden, and the page gives
// the <svg> role="group" and its name.

import { select, type Selection } from "d3-selection";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Series = "player" | "average";

/** A series: its numbers per 90 and their percentiles, one an axis, in the axes' order. */
export interface Profile {
  readonly series: Series;
  /** "Okafor", or "League average". */
  readonly name: string;
  readonly per90: readonly number[];
  readonly percentiles: readonly number[];
}

/** What each value's <circle> carries on __data__. */
export interface Value {
  readonly series: Series;
  readonly name: string;
  /** The axis's index, clockwise from the top, and its name. */
  readonly axis: number;
  readonly label: string;
  readonly per90: number;
  readonly percentile: number;
}

export interface DrawnRadar {
  /** The outlines as a D3 selection: the player's, then the league average's. */
  readonly outlines: Selection<SVGPolygonElement, Profile, SVGGElement, unknown>;
  /** Each series' values as a D3 selection, an axis each, clockwise from the top. */
  readonly values: { readonly [S in Series]: Selection<SVGCircleElement, Value, SVGGElement, unknown> };
  /** The centre, in the plot <g>'s units, where every spoke starts. */
  readonly center: Point;
  /** The px from the centre to 100 on an axis. */
  readonly radius: number;
  /** A series' corners, clockwise from the top, in the plot <g>'s units. */
  corners(series: Series): readonly Point[];
  /**
   * Where a series' outline crosses the ray at `axis`, an axis's index or any number between two, in
   * the plot <g>'s units: a corner at a whole number, on an edge between.
   */
  along(series: Series, axis: number): Point;
  /** The lines' stroke widths, as drawn. */
  readonly widths: { readonly outline: number };
  /** Draws it again at the parent's width. */
  resize(): void;
}

/** Room round the rings for the axes' names. */
const ROOM = { side: 64, top: 26, bottom: 26 };
/** The largest radius, so a wide card doesn't draw a tall radar. */
const LARGEST = 140;
const RINGS = [25, 50, 75, 100];
/** The rings named up the first spoke: two, so they stay clear of each other on a phone. */
const NAMED = [50, 100];
/** The values' radius. */
const RADIUS = 4;
const OUTLINE = 2.25;

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** The angle of an axis, or of a ray between two: the first straight up, then clockwise. */
const angleOf = (axis: number, count: number): number => -Math.PI / 2 + (axis * 2 * Math.PI) / count;

/** Where two lines cross: the ray from the origin at `angle`, and the line through a and b. */
function crossing(angle: number, a: Point, b: Point): Point {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denominator = dx * ey - dy * ex;
  // A ray along the edge itself only happens at a corner, where a is the answer.
  if (Math.abs(denominator) < 1e-12) return a;
  const s = (a.x * ey - a.y * ex) / denominator;
  return { x: s * dx, y: s * dy };
}

/**
 * Draws each profile's outline and values in `svgElement`, on `axes`, the player first, so a keyboard
 * reaches the player before the average, and the average's dashed outline over the player's fill.
 */
export function drawRadar(svgElement: SVGSVGElement, axes: readonly string[], profiles: readonly Profile[]): DrawnRadar {
  const count = axes.length;
  const order = [...profiles].sort((a, b) => (a.series === "player" ? -1 : 0) - (b.series === "player" ? -1 : 0));
  let radius = 0;
  /** Px from the centre at `value` along `axis`. */
  const point = (axis: number, value: number): Point => {
    const r = (value / 100) * radius;
    const a = angleOf(axis, count);
    // Rounded, as D3's path strings are, so the corners read back as drawn.
    return { x: Math.round(r * Math.cos(a) * 100) / 100, y: Math.round(r * Math.sin(a) * 100) / 100 };
  };
  const corners = (series: Series): Point[] => {
    const profile = profiles.find((p) => p.series === series)!;
    return profile.percentiles.map((value, axis) => point(axis, value));
  };
  const valuesOf = (profile: Profile): Value[] =>
    profile.percentiles.map((percentile, axis) => ({ series: profile.series, name: profile.name, axis, label: axes[axis]!, per90: profile.per90[axis]!, percentile }));

  const svg = select(svgElement);
  // Hidden from screen readers: the values' names say the same.
  const grid = svg.append("g").attr("class", "axes").attr("aria-hidden", "true");
  const plot = svg.append("g").attr("class", "plot");
  const outlines = plot
    .append("g")
    .attr("class", "outlines")
    .selectAll<SVGPolygonElement, Profile>("polygon.outline")
    .data(order, (d) => d.series)
    .join("polygon")
    .attr("class", (d) => `outline outline-${d.series}`)
    .attr("stroke-width", OUTLINE);
  const values = Object.fromEntries(
    order.map((profile) => [
      profile.series,
      plot
        .append("g")
        .attr("class", `values values-${profile.series}`)
        .selectAll<SVGCircleElement, Value>("circle.value")
        .data(valuesOf(profile), (d) => d.label)
        .join("circle")
        .attr("class", `value value-${profile.series}`)
        .attr("r", RADIUS)
    ])
  ) as unknown as DrawnRadar["values"];

  function resize(): void {
    const width = Math.max(280, Math.floor(roomFor(svgElement)));
    radius = Math.max(40, Math.min(width / 2 - ROOM.side, LARGEST));
    const height = Math.ceil(ROOM.top + 2 * radius + ROOM.bottom);
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
    const cx = Math.round(width / 2);
    const cy = Math.round(ROOM.top + radius);
    grid.attr("transform", `translate(${cx},${cy})`);
    plot.attr("transform", `translate(${cx},${cy})`);

    const ring = (value: number): string => axes.map((_, axis) => point(axis, value)).map((p) => `${p.x},${p.y}`).join(" ");
    grid
      .selectAll<SVGPolygonElement, number>("polygon.ring")
      .data(RINGS)
      .join("polygon")
      .attr("class", "ring")
      .attr("points", ring);
    grid
      .selectAll<SVGLineElement, string>("line.spoke")
      .data(axes)
      .join("line")
      .attr("class", "spoke")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", (_, axis) => point(axis, 100).x)
      .attr("y2", (_, axis) => point(axis, 100).y);
    // Two rings' values up the first spoke, just right of it.
    grid
      .selectAll<SVGTextElement, number>("text.ring-value")
      .data(NAMED)
      .join("text")
      .attr("class", "tick ring-value")
      .attr("x", 6)
      .attr("y", (v) => point(0, v).y + 11)
      .text((v) => v);
    // Each axis's name past its spoke's end, anchored away from the centre.
    grid
      .selectAll<SVGTextElement, string>("text.axis-name")
      .data(axes)
      .join("text")
      .attr("class", "axis-name")
      .attr("x", (_, axis) => point(axis, 100).x + Math.cos(angleOf(axis, count)) * 10)
      .attr("y", (_, axis) => point(axis, 100).y + Math.sin(angleOf(axis, count)) * 10 + 4)
      .attr("text-anchor", (_, axis) => {
        const x = Math.cos(angleOf(axis, count));
        return Math.abs(x) < 0.01 ? "middle" : x > 0 ? "start" : "end";
      })
      .text((d) => d);

    outlines.attr("points", (d) => corners(d.series).map((p) => `${p.x},${p.y}`).join(" "));
    for (const selection of Object.values(values)) {
      selection.attr("cx", (d) => point(d.axis, d.percentile).x).attr("cy", (d) => point(d.axis, d.percentile).y);
    }
  }
  resize();

  return {
    outlines,
    values,
    center: { x: 0, y: 0 },
    get radius() {
      return radius;
    },
    corners,
    along(series, axis) {
      const points = corners(series);
      const i = ((Math.floor(axis) % count) + count) % count;
      if (axis === Math.floor(axis)) return points[i]!;
      return crossing(angleOf(axis, count), points[i]!, points[(i + 1) % count]!);
    },
    widths: { outline: OUTLINE },
    resize
  };
}
