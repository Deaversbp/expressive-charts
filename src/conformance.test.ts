// The plan §8 conformance checks for the built-in effects, through checkEffect, on real marks from
// twenty sources: bars from the reference barChart, from expressive() on bars drawn by other code and
// from a stacked Observable Plot bar through expressive(), the slices of the reference donutChart, the
// slices of a D3 pie through expressive(), the lines and points of the reference lineChart, on a full
// season and on one with missing weeks, the lines of a D3 line chart, of a D3 line with missing
// weeks and of a Plot line through expressive(), and shapes through expressive(), each described from
// its own path data with describe.shape: a D3 curve, the same with missing weeks, a D3 area, and D3
// rings, areas with holes. And marks expressive() reads by tag, with no geometry: a D3 scatter's
// circles and Plot's dots as points, the D3 curves and area again, and a line, a polyline, a polygon,
// an ellipse, a D3 symbol and a stretched circle as shapes. Lines have samples from samplesAlong. Each source also draws its marks at another size, as a resize would,
// for the check that effects follow onChange. On lines with gaps, no effect draws inside one, on any
// frame. This test brings charts and effects together, so it lives beside src/index.ts, the only
// module allowed to.

import { barX, dot, lineY, plot, type Plot } from "@observablehq/plot";
import { select } from "d3-selection";
import { arc, area, curveMonotoneX, line, pie, symbol, symbolStar, type PieArcDatum } from "d3-shape";
import {
  barChart,
  delta,
  describe as build,
  donutChart,
  expressive,
  flash,
  label,
  lineChart,
  matrix,
  morph,
  parallel,
  pulse,
  samplesAlong,
  sequence,
  stagger,
  threshold,
  trace,
  travel,
  wiggle,
  type AnyMarkEffect,
  type MarkData,
  type MarkGeometry
} from "./index";
import { drawnInGaps, flush, type TestContext } from "./core/testing";
import { cleat, soccerBall } from "./icons/sport";
import { checkEffect, checkTransition, testContext, type CheckEffectOptions } from "./testing";

interface Player {
  name: string;
  goals: number;
  assists: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 16, assists: 4 },
  { name: "Tanaka", goals: 6, assists: 10 },
  { name: "Castillo", goals: 1, assists: 5 }
];

const SVG = "http://www.w3.org/2000/svg";

function el(tag: string, attributes: Record<string, string | number>, parent: Element): SVGElement {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  parent.appendChild(element);
  return element;
}

/** The reference chart's marks: stacked goals and assists, at a fixed width (jsdom has no layout), narrower when moved. */
function chartMarks(moved = false): readonly MarkGeometry[] {
  const container = document.body.appendChild(document.createElement("div"));
  const chart = barChart<Player>(container, { label: "Goals and assists", data: players, y: "name", stack: ["goals", "assists"], width: moved ? 480 : 600 });
  return chart.marks();
}

/**
 * Marks from bars drawn by hand, the way D3 code would draw them: a translated plot group, one <g>
 * per series, and each rect's row on __data__. 20 px per goal or assist (16 when moved), 34 px rows.
 */
function adapterMarks(moved = false): readonly MarkGeometry[] {
  const unit = moved ? 16 : 20;
  const svg = el("svg", { width: 600, height: 120 }, document.body);
  const plot = el("g", { transform: "translate(90,4)" }, svg);
  const rects: Element[] = [];
  (["goals", "assists"] as const).forEach((series, s) => {
    const group = el("g", { class: series }, plot);
    players.forEach((player, i) => {
      const before = s === 0 ? 0 : player.goals;
      const rect = el("rect", { x: before * unit, y: i * 34 + 7, width: player[series] * unit, height: 20 }, group);
      (rect as unknown as { __data__: unknown }).__data__ = { row: player, series };
      rects.push(rect);
    });
  });
  const fx = expressive<{ row: Player; series: string }>(rects, { key: (d) => d.row.name, segment: (d) => d.series });
  return fx.marks();
}

/** What Plot binds to an element: a row's index, or a line's array of them. */
const plotBound = <T>(element: Element): T => (element as Element & { __data__: T }).__data__;

/** A stacked Plot bar, goals then assists, each rect's row read by its index; narrower when moved. */
function plotBarMarks(moved = false): readonly MarkGeometry[] {
  const rows = players.flatMap((p) => (["goals", "assists"] as const).map((metric) => ({ name: p.name, metric, value: p[metric] })));
  const svg = plot({ document, width: moved ? 480 : 600, marks: [barX(rows, { x: "value", y: "name", fill: "metric" })] });
  const rects = document.body.appendChild(svg).querySelectorAll('g[aria-label="bar"] > rect');
  const fx = expressive(rects, { datum: (el) => rows[plotBound<number>(el)]!, key: (d) => d.name, segment: (d) => d.metric, value: (d) => d.value });
  return fx.marks();
}

interface Shot {
  outcome: string;
  shots: number;
}

const shots: Shot[] = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];

/** The reference donut's slices: the prototype's shot outcomes, clockwise from 12 o'clock in data order, narrower when moved. */
function donutMarks(moved = false): readonly MarkGeometry[] {
  const container = document.body.appendChild(document.createElement("div"));
  const chart = donutChart<Shot>(container, { label: "Shot outcomes", data: shots, category: "outcome", value: "shots", width: moved ? 520 : 640 });
  return chart.marks();
}

/** A real D3 donut: d3.pie() with its default sort, d3.arc() paths in a centred <g>, each slice described with describe.arc; smaller when moved. */
function pieMarks(moved = false): readonly MarkGeometry[] {
  const [inner, outer] = moved ? [60, 100] : [70, 116];
  const plot = select(document.body).append("svg").attr("width", 640).attr("height", 300).append("g").attr("transform", "translate(320,150)");
  const slices = plot
    .selectAll<SVGPathElement, PieArcDatum<Shot>>("path")
    .data(pie<Shot>().value((d) => d.shots)(shots))
    .join("path")
    .attr("d", arc<PieArcDatum<Shot>>().innerRadius(inner).outerRadius(outer));
  const fx = expressive(slices, {
    key: (d) => d.data.outcome,
    value: (d) => d.value,
    geometry: (_el, d, key) => build.arc({ key, cx: 0, cy: 0, inner, outer, start: d.startAngle, end: d.endAngle })
  });
  return fx.marks();
}

interface Week {
  week: number;
  goals: number;
  xg: number;
}

/** Goals below xG, then above it, then below again. */
const weeks: Week[] = [
  { week: 1, goals: 0, xg: 1.2 },
  { week: 2, goals: 1, xg: 2.1 },
  { week: 3, goals: 4, xg: 3.6 },
  { week: 4, goals: 6, xg: 4.4 },
  { week: 5, goals: 6, xg: 6.3 },
  { week: 6, goals: 7, xg: 7.5 }
];

/**
 * The reference line chart's marks (the lines, then the points by x), each with the data its enter
 * event gave it: drawn from no data and updated to the season, with motion off so it lands at once.
 * Narrower and shorter when moved, so every point moves too.
 */
function lineSource(moved = false): { readonly marks: readonly MarkGeometry[]; readonly data: ReadonlyMap<MarkGeometry, MarkData<Week>> } {
  const container = document.body.appendChild(document.createElement("div"));
  const chart = lineChart<Week>(container, { label: "Goals vs xG", data: [], x: "week", series: ["goals", "xg"], width: moved ? 480 : 640, height: moved ? 240 : 300, motion: "off" });
  const data = new Map<MarkGeometry, MarkData<Week>>();
  chart.on("enter", (event) => data.set(event.mark, event.data));
  void chart.update({ data: weeks });
  return { marks: chart.marks(), data };
}

const lineMarks = (moved = false): readonly MarkGeometry[] => lineSource(moved).marks;

/**
 * A real D3 line on the same season: two d3.line() paths in a margin <g>, one per series, each
 * described from the points that drew it, with samplesAlong samples, and the data a decoration gets.
 * 80 px a week and 30 px a goal (64 and 24 when moved).
 */
function d3LineSource(moved = false): { readonly marks: readonly MarkGeometry[]; readonly data: ReadonlyMap<string, MarkData> } {
  const [across, up] = moved ? [64, 24] : [80, 30];
  const x = (week: number): number => across * (week - 1);
  const y = (value: number): number => 200 - up * value;
  const plot = select(document.body).append("svg").attr("width", 520).attr("height", 240).append("g").attr("transform", "translate(40,20)");
  const paths = plot
    .selectAll<SVGPathElement, { series: "goals" | "xg"; rows: Week[] }>("path")
    .data((["goals", "xg"] as const).map((series) => ({ series, rows: weeks })))
    .join("path")
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .attr("d", (d) =>
      line<Week>()
        .x((w) => x(w.week))
        .y((w) => y(w[d.series]))(d.rows)
    );
  const data = new Map<string, MarkData>();
  const fx = expressive(paths, {
    key: (d) => d.series,
    geometry: (_el, d, key) => build.line({ key, series: d.series, points: d.rows.map((w) => ({ x: x(w.week), y: y(w[d.series]) })), width: 2 }),
    samples: (d, mark) => samplesAlong(mark, d.rows.map((w) => ({ x: x(w.week), y: y(w[d.series]), value: w[d.series], at: w.week }))),
    on: { decorate: { kind: "data", run: async (mark, markData) => void data.set(mark.key, markData), end: () => {}, clear: () => {} } }
  });
  return { marks: fx.marks(), data };
}

const d3LineMarks = (moved = false): readonly MarkGeometry[] => d3LineSource(moved).marks;

/** The season with two weeks nobody recorded: no goals in week 3, no xG in week 5. */
const patchy = weeks.map((w) => ({ week: w.week, goals: w.week === 3 ? undefined : w.goals, xg: w.week === 5 ? undefined : w.xg }));
type Patchy = (typeof patchy)[number];
type PatchySeries = { series: "goals" | "xg"; rows: Patchy[] };

/**
 * A D3 line drawn with .defined() over the patchy season, so its paths skip the missing weeks: each
 * described by its defined points and the indices where they break, with samplesAlong samples, and
 * the data a decoration gets. 80 px a week and 30 px a goal (64 and 24 when moved).
 */
function d3GappedSource(moved = false): { readonly marks: readonly MarkGeometry[]; readonly data: ReadonlyMap<string, MarkData>; readonly paths: readonly SVGPathElement[] } {
  const [across, up] = moved ? [64, 24] : [80, 30];
  const x = (week: number): number => across * (week - 1);
  const y = (value: number): number => 200 - up * value;
  const defined = (series: "goals" | "xg") => (w: Patchy): boolean => w[series] !== undefined;
  const plot = select(document.body).append("svg").attr("width", 520).attr("height", 240).append("g").attr("transform", "translate(40,20)");
  const paths = plot
    .selectAll<SVGPathElement, PatchySeries>("path")
    .data((["goals", "xg"] as const).map((series) => ({ series, rows: patchy })))
    .join("path")
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .attr("d", (d) =>
      line<Patchy>()
        .defined(defined(d.series))
        .x((w) => x(w.week))
        .y((w) => y(w[d.series]!))(d.rows)
    );
  /** The defined rows, and the indices among them that follow a missing row. */
  const runsOf = (d: PatchySeries): { rows: Patchy[]; breaks: number[] } => {
    const rows = d.rows.filter(defined(d.series));
    const breaks = rows.flatMap((row, i) => (i > 0 && d.rows.indexOf(row) !== d.rows.indexOf(rows[i - 1]!) + 1 ? [i] : []));
    return { rows, breaks };
  };
  const data = new Map<string, MarkData>();
  const fx = expressive(paths, {
    key: (d) => d.series,
    geometry: (_el, d, key) => {
      const { rows, breaks } = runsOf(d);
      return build.line({ key, series: d.series, points: rows.map((w) => ({ x: x(w.week), y: y(w[d.series]!) })), breaks, width: 2 });
    },
    samples: (d, mark) => samplesAlong(mark, runsOf(d).rows.map((w) => ({ x: x(w.week), y: y(w[d.series]!), value: w[d.series]!, at: w.week }))),
    on: { decorate: { kind: "data", run: async (mark, markData) => void data.set(mark.key, markData), end: () => {}, clear: () => {} } }
  });
  return { marks: fx.marks(), data, paths: paths.nodes() };
}

const d3GappedMarks = (moved = false): readonly MarkGeometry[] => d3GappedSource(moved).marks;

/**
 * The reference line chart on the patchy season: each line with a gap, and the points of the values
 * there are, each with the data its enter event gave it, as lineSource has them.
 */
function lineGappedSource(moved = false): { readonly marks: readonly MarkGeometry[]; readonly data: ReadonlyMap<MarkGeometry, MarkData<Patchy>> } {
  const container = document.body.appendChild(document.createElement("div"));
  const chart = lineChart<Patchy>(container, { label: "Goals vs xG", data: [], x: "week", series: ["goals", "xg"], width: moved ? 480 : 640, height: moved ? 240 : 300, motion: "off" });
  const data = new Map<MarkGeometry, MarkData<Patchy>>();
  chart.on("enter", (event) => data.set(event.mark, event.data));
  void chart.update({ data: patchy });
  return { marks: chart.marks(), data };
}

const lineGappedMarks = (moved = false): readonly MarkGeometry[] => lineGappedSource(moved).marks;

/**
 * A Plot line on the same season: each path's rows from its indices, described from their points
 * through Plot's scales, with samplesAlong samples, and the data a decoration gets. Smaller when moved.
 */
function plotLineSource(moved = false): { readonly marks: readonly MarkGeometry[]; readonly data: ReadonlyMap<string, MarkData> } {
  const rows = weeks.flatMap((w) => (["goals", "xg"] as const).map((series) => ({ week: w.week, series, value: w[series] })));
  const svg = plot({ document, width: moved ? 416 : 520, height: moved ? 192 : 240, marks: [lineY(rows, { x: "week", y: "value", stroke: "series", strokeWidth: 2 })] }) as SVGSVGElement & Plot;
  const x = (week: number): number => svg.scale("x")!.apply(week);
  const y = (value: number): number => svg.scale("y")!.apply(value);
  const data = new Map<string, MarkData>();
  const fx = expressive(document.body.appendChild(svg).querySelectorAll('g[aria-label="line"] > path'), {
    datum: (el) => plotBound<number[]>(el).filter((i) => i >= 0).map((i) => rows[i]!),
    key: (d) => d[0]!.series,
    geometry: (_el, d, key) => build.line({ key, series: key, points: d.map((r) => ({ x: x(r.week), y: y(r.value) })), width: 2 }),
    samples: (d, mark) => samplesAlong(mark, d.map((r) => ({ x: x(r.week), y: y(r.value), value: r.value, at: r.week }))),
    on: { decorate: { kind: "data", run: async (mark, markData) => void data.set(mark.key, markData), end: () => {}, clear: () => {} } }
  });
  return { marks: fx.marks(), data };
}

const plotLineMarks = (moved = false): readonly MarkGeometry[] => plotLineSource(moved).marks;

/** A path's own path data, which describe.shape reads. */
const dOf = (element: Element): string => element.getAttribute("d") ?? "";

/**
 * A D3 line drawn with curveMonotoneX on the season: two paths in a margin <g>, each described from
 * its own path data with describe.shape, with samplesAlong samples at the weeks, and the data a
 * decoration gets. 80 px a week and 30 px a goal (64 and 24 when moved).
 */
function d3CurveSource(moved = false): { readonly marks: readonly MarkGeometry[]; readonly data: ReadonlyMap<string, MarkData> } {
  const [across, up] = moved ? [64, 24] : [80, 30];
  const x = (week: number): number => across * (week - 1);
  const y = (value: number): number => 200 - up * value;
  const plot = select(document.body).append("svg").attr("width", 520).attr("height", 240).append("g").attr("transform", "translate(40,20)");
  const paths = plot
    .selectAll<SVGPathElement, { series: "goals" | "xg"; rows: Week[] }>("path")
    .data((["goals", "xg"] as const).map((series) => ({ series, rows: weeks })))
    .join("path")
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .attr("d", (d) =>
      line<Week>()
        .x((w) => x(w.week))
        .y((w) => y(w[d.series]))
        .curve(curveMonotoneX)(d.rows)
    );
  const data = new Map<string, MarkData>();
  const fx = expressive(paths, {
    key: (d) => d.series,
    geometry: (el, d, key) => build.shape({ key, series: d.series, d: dOf(el), width: 2 }),
    samples: (d, mark) => samplesAlong(mark, d.rows.map((w) => ({ x: x(w.week), y: y(w[d.series]), value: w[d.series], at: w.week }))),
    on: { decorate: { kind: "data", run: async (mark, markData) => void data.set(mark.key, markData), end: () => {}, clear: () => {} } }
  });
  return { marks: fx.marks(), data };
}

const d3CurveMarks = (moved = false): readonly MarkGeometry[] => d3CurveSource(moved).marks;

/**
 * The same curve drawn with .defined() over the patchy season, so each path has a move after each
 * missing week, which describe.shape makes a gap; with samplesAlong samples at the weeks there are.
 */
function d3CurveGappedSource(moved = false): { readonly marks: readonly MarkGeometry[]; readonly data: ReadonlyMap<string, MarkData> } {
  const [across, up] = moved ? [64, 24] : [80, 30];
  const x = (week: number): number => across * (week - 1);
  const y = (value: number): number => 200 - up * value;
  const plot = select(document.body).append("svg").attr("width", 520).attr("height", 240).append("g").attr("transform", "translate(40,20)");
  const paths = plot
    .selectAll<SVGPathElement, PatchySeries>("path")
    .data((["goals", "xg"] as const).map((series) => ({ series, rows: patchy })))
    .join("path")
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .attr("d", (d) =>
      line<Patchy>()
        .defined((w) => w[d.series] !== undefined)
        .x((w) => x(w.week))
        .y((w) => y(w[d.series]!))
        .curve(curveMonotoneX)(d.rows)
    );
  const data = new Map<string, MarkData>();
  const fx = expressive(paths, {
    key: (d) => d.series,
    geometry: (el, d, key) => build.shape({ key, series: d.series, d: dOf(el), width: 2 }),
    samples: (d, mark) =>
      samplesAlong(
        mark,
        d.rows.flatMap((w) => (w[d.series] === undefined ? [] : [{ x: x(w.week), y: y(w[d.series]!), value: w[d.series]!, at: w.week }]))
      ),
    on: { decorate: { kind: "data", run: async (mark, markData) => void data.set(mark.key, markData), end: () => {}, clear: () => {} } }
  });
  return { marks: fx.marks(), data };
}

const d3CurveGappedMarks = (moved = false): readonly MarkGeometry[] => d3CurveGappedSource(moved).marks;

/** A D3 area under each series' curve, down to 0, each described from its own path data: closed shapes. Smaller when moved. */
function d3AreaMarks(moved = false): readonly MarkGeometry[] {
  const [across, up] = moved ? [64, 24] : [80, 30];
  const plot = select(document.body).append("svg").attr("width", 520).attr("height", 240).append("g").attr("transform", "translate(40,20)");
  const areas = plot
    .selectAll<SVGPathElement, "goals" | "xg">("path")
    .data(["goals", "xg"] as const)
    .join("path")
    .attr("d", (series) =>
      area<Week>()
        .x((w) => across * (w.week - 1))
        .y0(200)
        .y1((w) => 200 - up * w[series])
        .curve(curveMonotoneX)(weeks)
    );
  return expressive(areas, { key: (series) => series, geometry: (el, series, key) => build.shape({ key, series, d: dOf(el) }) }).marks();
}

/**
 * A D3 ring for each series, a donut of one slice, side by side: areas with holes, each drawn round
 * its own centre and moved there with a transform, so it's described from its own path data with
 * that move as its matrix. Smaller, and nearer, when moved.
 */
function d3RingMarks(moved = false): readonly MarkGeometry[] {
  const plot = select(document.body).append("svg").attr("width", 640).attr("height", 300).append("g").attr("transform", "translate(320,150)");
  const scale = moved ? 0.8 : 1;
  const rings = plot
    .selectAll<SVGPathElement, { series: string; cx: number; inner: number; outer: number }>("path")
    .data([
      { series: "goals", cx: -170 * scale, inner: 40 * scale, outer: 60 * scale },
      { series: "xg", cx: 120 * scale, inner: 70 * scale, outer: 116 * scale }
    ])
    .join("path")
    .attr("transform", (d) => `translate(${d.cx},0)`)
    .attr("d", (d) => arc()({ innerRadius: d.inner, outerRadius: d.outer, startAngle: 0, endAngle: 2 * Math.PI }));
  return expressive(rings, { key: (d) => d.series, geometry: (el, d, key) => build.shape({ key, series: d.series, d: dOf(el), matrix: matrix.translate(d.cx, 0) }) }).marks();
}

/** A D3 scatter read by tag: a circle a player, at goals across and assists up, each a point with its goals as its one sample. Closer and smaller when moved. */
function d3ScatterMarks(moved = false): readonly MarkGeometry[] {
  const [unit, r] = moved ? [8, 4] : [10, 5];
  const dots = select(document.body)
    .append("svg")
    .attr("width", 400)
    .attr("height", 240)
    .append("g")
    .attr("transform", "translate(40,20)")
    .selectAll<SVGCircleElement, Player>("circle")
    .data(players)
    .join("circle")
    .attr("cx", (p) => unit * p.goals)
    .attr("cy", (p) => 200 - unit * p.assists)
    .attr("r", r);
  return expressive(dots, { key: (p) => p.name, value: (p) => p.goals }).marks();
}

/** Plot's dots read by tag, each row by its index: points where Plot's scales put them. Smaller when moved. */
function plotDotMarks(moved = false): readonly MarkGeometry[] {
  const svg = plot({ document, width: moved ? 480 : 600, height: moved ? 200 : 240, marks: [dot(players, { x: "goals", y: "assists", r: moved ? 4 : 6 })] });
  const circles = document.body.appendChild(svg).querySelectorAll('g[aria-label="dot"] > circle');
  return expressive(circles, { datum: (el) => players[plotBound<number>(el)]!, key: (d) => d.name, value: (d) => d.goals }).marks();
}

/**
 * The D3 curves drawn with curveMonotoneX, read by tag from their own path data, as wide as their
 * stroke, each path's series named by segment. With the patchy season, each has a gap at each move.
 */
function d3CurveTagMarks(rows: readonly Patchy[], moved = false): readonly MarkGeometry[] {
  const [across, up] = moved ? [64, 24] : [80, 30];
  const paths = select(document.body)
    .append("svg")
    .attr("width", 520)
    .attr("height", 240)
    .append("g")
    .attr("transform", "translate(40,20)")
    .selectAll<SVGPathElement, PatchySeries>("path")
    .data((["goals", "xg"] as const).map((series) => ({ series, rows: [...rows] })))
    .join("path")
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .attr("d", (d) =>
      line<Patchy>()
        .defined((w) => w[d.series] !== undefined)
        .x((w) => across * (w.week - 1))
        .y((w) => 200 - up * w[d.series]!)
        .curve(curveMonotoneX)(d.rows)
    );
  return expressive(paths, { key: (d) => d.series, segment: (d) => d.series }).marks();
}

/** The D3 areas read by tag: closed shapes. Smaller when moved. */
function d3AreaTagMarks(moved = false): readonly MarkGeometry[] {
  const [across, up] = moved ? [64, 24] : [80, 30];
  const areas = select(document.body)
    .append("svg")
    .attr("width", 520)
    .attr("height", 240)
    .append("g")
    .attr("transform", "translate(40,20)")
    .selectAll<SVGPathElement, "goals" | "xg">("path")
    .data(["goals", "xg"] as const)
    .join("path")
    .attr("d", (series) =>
      area<Week>()
        .x((w) => across * (w.week - 1))
        .y0(200)
        .y1((w) => 200 - up * w[series])
        .curve(curveMonotoneX)(weeks)
    );
  return expressive(areas, { key: (series) => series }).marks();
}

/**
 * The other shape elements, read by tag in a margin group stroked 2 px wide: a line, a polyline, a
 * polygon, an ellipse, a d3.symbol() star moved into place, and a circle stretched into an ellipse by
 * its transform. Smaller when moved.
 */
function shapeElementMarks(moved = false): readonly MarkGeometry[] {
  const k = moved ? 0.8 : 1;
  const at = (...values: number[]): string => values.map((value) => value * k).join(" ");
  const svg = el("svg", { width: 640, height: 300 }, document.body);
  const plotArea = el("g", { transform: "translate(20,20)", fill: "#2a78d6", stroke: "#2a78d6", "stroke-width": 2 }, svg);
  const shapes: [string, SVGElement][] = [
    ["line", el("line", { x1: 0, y1: 0, x2: 120 * k, y2: 60 * k }, plotArea)],
    ["polyline", el("polyline", { points: at(0, 100, 60, 140, 120, 100, 180, 160) }, plotArea)],
    ["polygon", el("polygon", { points: at(220, 100, 300, 100, 260, 170) }, plotArea)],
    ["ellipse", el("ellipse", { cx: 400 * k, cy: 60 * k, rx: 50 * k, ry: 30 * k }, plotArea)],
    ["star", el("path", { d: symbol(symbolStar, 400 * k * k)()!, transform: `translate(${500 * k},${200 * k})` }, plotArea)],
    ["stretched circle", el("circle", { r: 20 * k, transform: `translate(${300 * k},${230 * k}) scale(2,1)` }, plotArea)]
  ];
  for (const [name, shape] of shapes) (shape as unknown as { __data__: string }).__data__ = name;
  return expressive<string>(
    shapes.map(([, shape]) => shape),
    { key: (name) => name }
  ).marks();
}

const effects: Record<string, AnyMarkEffect> = {
  "ball rolling": travel(soccerBall),
  "cleat stepping": travel(cleat),
  "ball then cleat": sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" })),
  flash: flash(),
  "flash while the ball rolls": parallel(flash(), travel(soccerBall, { along: "goals" })),
  wiggle: wiggle(),
  pulse: pulse(),
  "staggered flash, third of five": stagger(flash()),
  trace: trace(),
  "trace while the ball rolls": parallel(trace(), travel(soccerBall)),
  // checkEffect's default data runs from 0 to 1 along each walk, so this colours the last 40%.
  "threshold past a target": threshold({ compareTo: 0.6, when: "above" }),
  "delta with a flash": parallel(flash(), delta()),
  "label from the mark's last value": label((data) => `${data.samples[data.samples.length - 1]?.value ?? ""}`)
};

/** A mark's data after an update: from 0 to 1 along the walk, up from 0.75 before. */
const updated = (): MarkData => ({
  datum: undefined,
  samples: [
    { t: 0, value: 0 },
    { t: 1, value: 1 }
  ],
  related: () => undefined,
  previous: {
    datum: undefined,
    samples: [
      { t: 0, value: 0 },
      { t: 1, value: 0.75 }
    ],
    related: () => undefined
  }
});

/** More than the defaults, where an effect needs it: a later mark of a batch, or the values before an update. */
const options: Record<string, CheckEffectOptions> = { "staggered flash, third of five": { batch: { index: 2, count: 5 } }, "delta with a flash": { data: updated } };

/** A source's marks, or with `true` the same marks moved. */
type Source = (moved?: boolean) => readonly MarkGeometry[];
const bars: Record<string, Source> = { barChart: chartMarks, "expressive() bars": adapterMarks, "Plot bars through expressive()": plotBarMarks };
/** The sources whose lines have gaps. */
const gapped: Record<string, Source> = {
  "lineChart with missing weeks": lineGappedMarks,
  "D3 line with missing weeks through expressive()": d3GappedMarks,
  "D3 curve with missing weeks through describe.shape": d3CurveGappedMarks,
  "D3 curve with missing weeks read by tag": (moved) => d3CurveTagMarks(patchy, moved)
};
/** The sources described with describe.shape. */
const shapes: Record<string, Source> = {
  "D3 curve through describe.shape": d3CurveMarks,
  "D3 curve with missing weeks through describe.shape": d3CurveGappedMarks,
  "D3 area through describe.shape": d3AreaMarks,
  "D3 rings through describe.shape": d3RingMarks
};
/** The sources expressive() reads by tag, with no geometry. */
const byTag: Record<string, Source> = {
  "D3 scatter read by tag": d3ScatterMarks,
  "Plot dots read by tag": plotDotMarks,
  "D3 curve read by tag": (moved) => d3CurveTagMarks(weeks, moved),
  "D3 curve with missing weeks read by tag": gapped["D3 curve with missing weeks read by tag"]!,
  "D3 area read by tag": d3AreaTagMarks,
  "line, polyline, polygon, ellipse, symbol and stretched circle read by tag": shapeElementMarks
};
const sources: Record<string, Source> = {
  ...bars,
  donutChart: donutMarks,
  "D3 pie through expressive()": pieMarks,
  lineChart: lineMarks,
  "D3 line through expressive()": d3LineMarks,
  ...gapped,
  "Plot line through expressive()": plotLineMarks,
  ...shapes,
  ...byTag
};

afterEach(() => {
  document.body.replaceChildren();
});

describe.each(Object.entries(bars))("bar marks from %s", (_source, marksOf) => {
  it("finds a stacked mark with goals and assists segments for every player", () => {
    const marks = marksOf();
    expect(marks.map((mark) => mark.key).sort()).toEqual(["Castillo", "Okafor", "Tanaka"]);
    for (const mark of marks) expect(mark.segments?.map((segment) => segment.series)).toEqual(["goals", "assists"]);
  });
});

describe("slices from donutChart", () => {
  it("finds a slice for every outcome, clockwise from 12 o'clock in data order, around the ring's centre", () => {
    const marks = donutMarks();
    expect(marks.map((mark) => mark.key)).toEqual(["Goal", "Saved", "Off target", "Blocked"]);
    for (const mark of marks) {
      expect(mark.segments).toBeUndefined();
      expect(mark.pivot).toEqual({ x: 320, y: 150 });
      expect(mark.series).toBe("shots");
    }
  });
});

describe("slices from a D3 pie through expressive()", () => {
  it("finds a slice for every outcome, clockwise from 12 o'clock, around the donut's centre", () => {
    const marks = pieMarks();
    expect(marks.map((mark) => mark.key)).toEqual(["Off target", "Saved", "Blocked", "Goal"]);
    for (const mark of marks) {
      expect(mark.segments).toBeUndefined();
      expect(mark.pivot).toEqual({ x: 0, y: 0 });
    }
  });
});

describe("lines and points from lineChart", () => {
  it("finds a line per series, then each series' point at each week, with the data their enter events gave them", () => {
    const { marks, data } = lineSource();
    expect(marks.map((mark) => mark.key)).toEqual(["goals", "xg", ...weeks.flatMap((w) => [`goals@${w.week}`, `xg@${w.week}`])]);
    expect(marks[0]).toMatchObject({ series: "goals", thickness: 2.25 });
    expect(marks[2]).toMatchObject({ series: "goals", length: 0 });
    for (const mark of marks) expect(data.has(mark), mark.key).toBe(true);
    expect(data.get(marks[0]!)!.related("xg")).toBe(data.get(marks[1]!));
  });

  it("threshold below xG passes the conformance checks on every line and point, with the chart's data", async () => {
    const { marks, data } = lineSource();
    const twins = lineSource(true);
    const all = new Map([...data, ...twins.data]);
    const moved = (mark: MarkGeometry) => twins.marks.find((twin) => twin.key === mark.key);
    await checkEffect(threshold({ compareTo: "xg" }), { name: "threshold below xG", marks, moved, data: (mark) => all.get(mark)! });
    // Not vacuously: goals are below xG up to week 2's crossing and again from week 4's.
    const ctx = testContext();
    threshold({ compareTo: "xg" }).end(marks[0]!, data.get(marks[0]!)!, ctx);
    expect(ctx.layer.drawn.filter((drawn) => drawn.kind === "path")).toHaveLength(2);
  });
});

describe("lines from a D3 line through expressive()", () => {
  it("finds a line for each series, in document order, in the margin group's coordinates", () => {
    const { marks, data } = d3LineSource();
    expect(marks.map((mark) => mark.key)).toEqual(["goals", "xg"]);
    for (const mark of marks) {
      expect(mark.outline.closed).toBe(false);
      expect(mark.start).toEqual({ x: 0, y: 200 - 30 * weeks[0]![mark.key as "goals" | "xg"] });
      expect(mark.end.x).toBe(400);
      expect(data.get(mark.key)!.samples.map((sample) => sample.at)).toEqual(weeks.map((w) => w.week));
    }
    expect(data.get("goals")!.related("xg")).toBe(data.get("xg"));
  });

  it("threshold below xG passes the conformance checks on both lines, with the adapter's samples", async () => {
    const { marks, data } = d3LineSource();
    const twins = d3LineSource(true);
    const of = (mark: MarkGeometry) => (marks.includes(mark) ? data : twins.data).get(mark.key)!;
    const moved = (mark: MarkGeometry) => twins.marks.find((twin) => twin.key === mark.key);
    await checkEffect(threshold({ compareTo: "xg" }), { name: "threshold below xG", marks, moved, data: of });
    // Not vacuously: goals are below xG up to week 2's crossing and again from week 4's.
    const ctx = testContext();
    threshold({ compareTo: "xg" }).end(marks[0]!, data.get("goals")!, ctx);
    expect(ctx.layer.drawn.filter((drawn) => drawn.kind === "path")).toHaveLength(2);
  });
});

describe("lines from a D3 line with missing weeks through expressive()", () => {
  it("finds a line for each series, with a gap where a week is missing, stroked as D3 drew it", () => {
    const { marks, data, paths } = d3GappedSource();
    expect(marks.map((mark) => mark.key)).toEqual(["goals", "xg"]);
    const [goals, xg] = marks as [MarkGeometry, MarkGeometry];
    // Weeks 2 to 4 for goals, and 4 to 6 for xG: along the walk, which runs straight across each.
    expect(goals.gaps).toHaveLength(1);
    expect(goals.path(goals.gaps![0]![0])).toEqual({ x: 80, y: 200 - 30 * weeks[1]!.goals });
    expect(goals.path(goals.gaps![0]![1])).toEqual({ x: 240, y: 200 - 30 * weeks[3]!.goals });
    expect(xg.gaps).toHaveLength(1);
    expect(xg.path(xg.gaps![0]![1]).x).toBe(400);
    // D3 draws xG's week 6, alone after the gap, as a closed subpath with no length; our stroke leaves it out, as a value alone has no stroke.
    expect(goals.outline.d).toBe(paths[0]!.getAttribute("d"));
    expect(`${xg.outline.d}M400,-25Z`).toBe(paths[1]!.getAttribute("d"));
    expect(data.get("goals")!.samples.map((sample) => [sample.at, sample.gapBefore === true])).toEqual([
      [1, false],
      [2, false],
      [4, true],
      [5, false],
      [6, false]
    ]);
    expect(data.get("xg")!.samples.filter((sample) => sample.gapBefore).map((sample) => sample.at)).toEqual([6]);
  });

  it("threshold below xG passes the conformance checks on both lines, with the adapter's samples, and colours nothing where either is missing", async () => {
    const { marks, data } = d3GappedSource();
    const twins = d3GappedSource(true);
    const of = (mark: MarkGeometry) => (marks.includes(mark) ? data : twins.data).get(mark.key)!;
    const moved = (mark: MarkGeometry) => twins.marks.find((twin) => twin.key === mark.key);
    await checkEffect(threshold({ compareTo: "xg" }), { name: "threshold below xG", marks, moved, data: of });
    // Goals are below xG in weeks 1 and 2, missing until week 4, where they're ahead, and xG is missing
    // from week 4 to week 6: so only the first run is coloured, though goals are behind again in week 6.
    const ctx = testContext();
    threshold({ compareTo: "xg" }).end(marks[0]!, data.get("goals")!, ctx);
    expect(ctx.layer.drawn.map((item) => (item.kind === "path" ? item.d : item.kind))).toEqual([marks[0]!.slice(0, marks[0]!.gaps![0]![0])]);
    expect(ctx.layer.drawn).toHaveLength(1);
  });
});

describe("lines and points from lineChart with missing weeks", () => {
  it("finds a line per series with a gap each, and a point for each value there is", () => {
    const { marks, data } = lineGappedSource();
    expect(marks.map((mark) => mark.key)).toEqual(["goals", "xg", "goals@1", "xg@1", "goals@2", "xg@2", "xg@3", "goals@4", "xg@4", "goals@5", "goals@6", "xg@6"]);
    expect(marks[0]!.gaps).toHaveLength(1);
    expect(marks[1]!.gaps).toHaveLength(1);
    expect(data.get(marks[0]!)!.samples.map((sample) => [sample.at, sample.gapBefore === true])).toEqual([
      [1, false],
      [2, false],
      [4, true],
      [5, false],
      [6, false]
    ]);
  });

  it("threshold below xG passes the conformance checks on every line and point, with the chart's data, and colours nothing where either is missing", async () => {
    const { marks, data } = lineGappedSource();
    const twins = lineGappedSource(true);
    const all = new Map([...data, ...twins.data]);
    const moved = (mark: MarkGeometry) => twins.marks.find((twin) => twin.key === mark.key);
    await checkEffect(threshold({ compareTo: "xg" }), { name: "threshold below xG", marks, moved, data: (mark) => all.get(mark)! });
    // As on the D3 line: only weeks 1 and 2 are coloured.
    const ctx = testContext();
    threshold({ compareTo: "xg" }).end(marks[0]!, data.get(marks[0]!)!, ctx);
    expect(ctx.layer.drawn.map((item) => (item.kind === "path" ? item.d : item.kind))).toEqual([marks[0]!.slice(0, marks[0]!.gaps![0]![0])]);
  });
});

describe("lines from a Plot line through expressive()", () => {
  it("finds a line for each series, in document order, with a sample at each week", () => {
    const { marks, data } = plotLineSource();
    expect(marks.map((mark) => mark.key)).toEqual(["goals", "xg"]);
    for (const mark of marks) {
      expect(mark.outline.closed).toBe(false);
      expect(data.get(mark.key)!.samples.map((sample) => sample.at)).toEqual(weeks.map((w) => w.week));
    }
    expect(data.get("goals")!.related("xg")).toBe(data.get("xg"));
  });

  it("threshold below xG passes the conformance checks on both lines, with the adapter's samples", async () => {
    const { marks, data } = plotLineSource();
    const twins = plotLineSource(true);
    const of = (mark: MarkGeometry) => (marks.includes(mark) ? data : twins.data).get(mark.key)!;
    const moved = (mark: MarkGeometry) => twins.marks.find((twin) => twin.key === mark.key);
    await checkEffect(threshold({ compareTo: "xg" }), { name: "threshold below xG", marks, moved, data: of });
    // Not vacuously: goals are below xG up to week 2's crossing and again from week 4's.
    const ctx = testContext();
    threshold({ compareTo: "xg" }).end(marks[0]!, data.get("goals")!, ctx);
    expect(ctx.layer.drawn.filter((drawn) => drawn.kind === "path")).toHaveLength(2);
  });
});

describe("lines from a D3 curve through describe.shape", () => {
  it("finds a curve for each series, open, through each week, with a sample on it at each week", () => {
    const { marks, data } = d3CurveSource();
    expect(marks.map((mark) => mark.key)).toEqual(["goals", "xg"]);
    for (const mark of marks) {
      const series = mark.key as "goals" | "xg";
      expect(mark.outline.closed).toBe(false);
      expect(mark.series).toBe(series);
      expect(mark.thickness).toBe(2);
      expect(mark.start).toEqual({ x: 0, y: 200 - 30 * weeks[0]![series] });
      expect(mark.end).toEqual({ x: 400, y: 200 - 30 * weeks[5]![series] });
      // The curve is flattened, so its path data has straight pieces only.
      expect(mark.outline.d).not.toMatch(/[CQ]/);
      const samples = data.get(mark.key)!.samples;
      expect(samples.map((sample) => sample.at)).toEqual(weeks.map((w) => w.week));
      samples.forEach((sample, i) => {
        const at = mark.path(sample.t);
        expect(at.x).toBeCloseTo(80 * i, 9);
        expect(at.y).toBeCloseTo(200 - 30 * weeks[i]![series], 9);
      });
    }
  });

  it("threshold below xG passes the conformance checks on both curves, with the adapter's samples", async () => {
    const { marks, data } = d3CurveSource();
    const twins = d3CurveSource(true);
    const of = (mark: MarkGeometry) => (marks.includes(mark) ? data : twins.data).get(mark.key)!;
    const moved = (mark: MarkGeometry) => twins.marks.find((twin) => twin.key === mark.key);
    await checkEffect(threshold({ compareTo: "xg" }), { name: "threshold below xG", marks, moved, data: of });
    // Not vacuously: as on the straight lines, goals are below xG twice.
    const ctx = testContext();
    threshold({ compareTo: "xg" }).end(marks[0]!, data.get("goals")!, ctx);
    expect(ctx.layer.drawn.filter((drawn) => drawn.kind === "path")).toHaveLength(2);
  });
});

describe("lines from a D3 curve with missing weeks through describe.shape", () => {
  it("finds a curve for each series, with a gap at each move, where a week is missing", () => {
    const { marks, data } = d3CurveGappedSource();
    const [goals, xg] = marks as [MarkGeometry, MarkGeometry];
    expect(goals.gaps).toHaveLength(1);
    expect(goals.path(goals.gaps![0]![0])).toEqual({ x: 80, y: 200 - 30 * weeks[1]!.goals });
    expect(goals.path(goals.gaps![0]![1])).toEqual({ x: 240, y: 200 - 30 * weeks[3]!.goals });
    expect(xg.gaps).toHaveLength(1);
    expect(xg.path(xg.gaps![0]![1])).toEqual({ x: 400, y: 200 - 30 * weeks[5]!.xg });
    expect(goals.outline.d.match(/M/g)).toHaveLength(2);
    // xG's week 6 is alone after its gap: nothing to stroke there.
    expect(xg.outline.d.match(/M/g)).toHaveLength(1);
    expect(data.get("goals")!.samples.map((sample) => [sample.at, sample.gapBefore === true])).toEqual([
      [1, false],
      [2, false],
      [4, true],
      [5, false],
      [6, false]
    ]);
  });

  it("threshold below xG passes the conformance checks on both curves, and colours nothing where either is missing", async () => {
    const { marks, data } = d3CurveGappedSource();
    const twins = d3CurveGappedSource(true);
    const of = (mark: MarkGeometry) => (marks.includes(mark) ? data : twins.data).get(mark.key)!;
    const moved = (mark: MarkGeometry) => twins.marks.find((twin) => twin.key === mark.key);
    await checkEffect(threshold({ compareTo: "xg" }), { name: "threshold below xG", marks, moved, data: of });
    // As on the straight line: only weeks 1 and 2 are coloured.
    const ctx = testContext();
    threshold({ compareTo: "xg" }).end(marks[0]!, data.get("goals")!, ctx);
    expect(ctx.layer.drawn.map((item) => (item.kind === "path" ? item.d : item.kind))).toEqual([marks[0]!.slice(0, marks[0]!.gaps![0]![0])]);
  });
});

describe("areas from a D3 area through describe.shape", () => {
  it("finds a closed area for each series, with no direction, sampled from its upper left", () => {
    for (const mark of d3AreaMarks()) {
      const series = mark.key as "goals" | "xg";
      expect(mark.outline.closed).toBe(true);
      expect(mark.length).toBe(0);
      expect(mark.bounds).toMatchObject({ x: 0, width: 400 });
      expect(mark.bounds.y + mark.bounds.height).toBe(200);
      expect(mark.start).toEqual({ x: 200, y: mark.bounds.y + mark.bounds.height / 2 });
      expect(mark.outline.sample(4)[0]).toEqual({ x: 0, y: 200 - 30 * weeks[0]![series] });
      expect(mark.outline.d).not.toMatch(/[CQ]/);
    }
  });
});

describe("rings from D3 through describe.shape", () => {
  it("finds a closed ring for each series, its hole in its outline, sampled round the outside", () => {
    const marks = d3RingMarks();
    expect(marks.map((mark) => mark.key)).toEqual(["goals", "xg"]);
    const [, xg] = marks as [MarkGeometry, MarkGeometry];
    expect(xg.outline.closed).toBe(true);
    expect(xg.center).toEqual({ x: 120, y: 0 });
    expect(xg.bounds).toEqual({ x: 4, y: -116, width: 232, height: 232 });
    expect(xg.outline.d.match(/M/g)).toHaveLength(2);
    const k = 116 * Math.SQRT1_2;
    const [corner] = xg.outline.sample(4);
    expect(corner!.x).toBeCloseTo(120 - k, 9);
    expect(corner!.y).toBeCloseTo(-k, 9);
  });
});

describe("marks read by tag through expressive()", () => {
  /** What can be compared of a mark: everything but its functions. */
  const seen = (mark: MarkGeometry) => ({ key: mark.key, d: mark.outline.d, closed: mark.outline.closed, length: mark.length, gaps: mark.gaps, thickness: mark.thickness, bounds: mark.bounds });

  it("reads the D3 curves and areas as describe.shape describes their path data through geometry", () => {
    expect(d3CurveTagMarks(weeks).map(seen)).toEqual(d3CurveMarks().map(seen));
    expect(d3CurveTagMarks(patchy).map(seen)).toEqual(d3CurveGappedMarks().map(seen));
    expect(d3CurveTagMarks(weeks).map((mark) => mark.series)).toEqual(["goals", "xg"]);
    expect(d3AreaTagMarks().map(seen)).toEqual(d3AreaMarks().map(seen));
  });

  it("reads the scatter's circles and Plot's dots as points, and the other shapes by their outlines", () => {
    const scatter = d3ScatterMarks();
    expect(scatter.map((mark) => [mark.key, mark.center, mark.thickness])).toEqual(players.map((p) => [p.name, { x: 10 * p.goals, y: 200 - 10 * p.assists }, 10]));
    for (const mark of [...scatter, ...plotDotMarks()]) expect(mark).toMatchObject({ length: 0, outline: { closed: true } });
    const shapes = shapeElementMarks();
    expect(shapes.map((mark) => [mark.key, mark.outline.closed])).toEqual([
      ["line", false],
      ["polyline", false],
      ["polygon", true],
      ["ellipse", true],
      ["star", true],
      ["stretched circle", true]
    ]);
    expect(shapes[0]).toMatchObject({ thickness: 2, start: { x: 0, y: 0 }, end: { x: 120, y: 60 } });
    // An ellipse's arcs are flattened, within 0.1 px of the curve.
    const { x, y, width, height } = shapes[5]!.bounds;
    expect([x - 260, y - 210, width - 80, height - 40].every((off) => Math.abs(off) <= 0.1)).toBe(true);
  });
});

/** Pairs of marks with a shape in each, for morph: from the sources above, and a bar and a slice. */
function shapePairs(): Record<string, readonly [MarkGeometry, MarkGeometry]> {
  const [curve, other] = d3CurveMarks() as [MarkGeometry, MarkGeometry];
  const [gapped] = d3CurveGappedMarks() as [MarkGeometry];
  const [straight] = d3LineMarks() as [MarkGeometry];
  const [area, otherArea] = d3AreaMarks() as [MarkGeometry, MarkGeometry];
  const [ring] = d3RingMarks() as [MarkGeometry];
  const [slice] = pieMarks() as [MarkGeometry];
  const [bar] = chartMarks() as [MarkGeometry];
  return {
    "two curves": [curve, other],
    "a curve and a straight line": [curve, straight],
    "a curve with a gap and one without": [gapped, curve],
    "two areas": [area, otherArea],
    "an area and a ring": [area, ring],
    "a ring and a slice": [ring, slice],
    "an area and a bar": [area, bar],
    "a curve and an area": [curve, area]
  };
}

describe("morph on shapes", () => {
  it.each([
    ["morph", morph()],
    ["morph, unrolled", morph({ align: "unroll" })],
    ["morph, dropped", morph({ align: "drop" })]
  ] as const)("%s passes the transition checks between shapes, and from a shape to a bar and a slice", async (name, effect) => {
    await checkTransition(effect, { name, pairs: shapePairs() });
  });
});

describe.each(Object.entries(sources))("effects on marks from %s", (_source, marksOf) => {
  it("draws the marks moved: the same keys, at another size", () => {
    const marks = marksOf();
    const twins = marksOf(true);
    expect(twins.map((twin) => twin.key)).toEqual(marks.map((mark) => mark.key));
    marks.forEach((mark, i) => expect(twins[i]!.slice(0, 1), mark.key).not.toBe(mark.slice(0, 1)));
  });

  it("trace draws the whole walk of every mark that has one, and nothing on a point", () => {
    for (const mark of marksOf()) {
      const ctx = testContext();
      trace().end(mark, ctx);
      expect(ctx.layer.drawn.map((drawn) => (drawn.kind === "path" ? drawn.d : drawn.kind)), mark.key).toEqual(mark.length >= 0.5 ? [mark.slice(0, 1)] : []);
    }
  });

  it("delta and label put their text outside every mark's own labels", () => {
    for (const mark of marksOf()) {
      for (const effect of [delta(), label(() => "+0.25")]) {
        const ctx = testContext();
        effect.end(mark, updated(), ctx);
        const texts = ctx.layer.drawn.filter((drawn) => drawn.kind === "text");
        expect(texts.map((text) => text.content), mark.key).toEqual(["+0.25"]);
        const { at } = texts[0]!.style;
        const inside = (mark.labelBounds ?? []).some((box) => at.x >= box.x && at.x <= box.x + box.width && at.y >= box.y && at.y <= box.y + box.height);
        expect(inside, mark.key).toBe(false);
      }
    }
  });

  it.each(Object.keys(effects))("%s passes the conformance checks on every mark", async (name) => {
    const twins = marksOf(true);
    const moved = (mark: MarkGeometry) => twins.find((twin) => twin.key === mark.key);
    await checkEffect(effects[name]!, { name, marks: marksOf(), moved, ...options[name] });
  });
});

/** checkEffect's default data: no datum, values 0 to 1 along the walk, no related series. */
const plain = (): MarkData => ({ datum: undefined, samples: [{ t: 0, value: 0 }, { t: 1, value: 1 }], related: () => undefined });

/**
 * What the effect draws inside a gap of the mark, each described with when: on every frame of a run,
 * after it, after a change() to the moved mark and the frames that follow, and after end().
 */
async function insideGaps(effect: AnyMarkEffect, mark: MarkGeometry, moved: MarkGeometry, more: CheckEffectOptions = {}): Promise<string[]> {
  const dataOf = (geometry: MarkGeometry): MarkData => (more.data ?? plain)(geometry);
  const context = (): TestContext => testContext({ batch: more.batch });
  const problems: string[] = [];
  const look = (on: MarkGeometry, ctx: TestContext, when: string): void => {
    for (const problem of drawnInGaps(on, ctx.layer.drawn)) problems.push(`on ${on.key} ${when}, ${problem}`);
  };
  const frames = async (on: MarkGeometry, ctx: TestContext, when: string, done: () => boolean): Promise<void> => {
    await flush();
    for (let ms = 0; !done() && ms < 10_000; ms += 16) {
      look(on, ctx, `${when} ${ms} ms in`);
      ctx.clock.advance(16);
      await flush();
    }
  };
  const ctx = context();
  let settled = false;
  void (effect.kind === "data" ? effect.run(mark, dataOf(mark), ctx) : effect.run(mark, ctx)).finally(() => (settled = true));
  await frames(mark, ctx, "in a run", () => settled);
  look(mark, ctx, "after the run");
  ctx.change(moved, dataOf(moved));
  await frames(moved, ctx, "after a change()", () => ctx.clock.idle);
  look(moved, ctx, "after a change() and its frames");
  const ended = context();
  if (effect.kind === "data") effect.end(mark, dataOf(mark), ended);
  else effect.end(mark, ended);
  look(mark, ended, "after end()");
  return problems;
}

describe.each(Object.entries(gapped))("effects on the gaps of lines from %s", (_source, marksOf) => {
  it.each(Object.keys(effects))("%s draws nothing inside a gap, on any frame", async (name) => {
    const twins = marksOf(true);
    const problems: string[] = [];
    const lines = marksOf().filter((mark) => mark.gaps !== undefined);
    expect(lines.length).toBeGreaterThan(0);
    for (const mark of lines) problems.push(...(await insideGaps(effects[name]!, mark, twins.find((twin) => twin.key === mark.key)!, options[name])));
    expect(problems).toEqual([]);
  });
});
