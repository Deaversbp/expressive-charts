// The plan §8 conformance checks for the built-in effects, through checkEffect, on real marks from
// eight sources: bars from the reference barChart, from expressive() on bars drawn by other code and
// from a stacked Observable Plot bar through expressive(), the slices of the reference donutChart, the
// slices of a D3 pie through expressive(), the lines and points of the reference lineChart, and the
// lines of a D3 line chart and of a Plot line through expressive(), with samples from samplesAlong.
// Each source also draws its marks at another size, as a resize would, for the check that effects
// follow onChange. This test brings charts and effects together, so it lives beside src/index.ts, the
// only module allowed to.

import { barX, lineY, plot, type Plot } from "@observablehq/plot";
import { select } from "d3-selection";
import { arc, line, pie, type PieArcDatum } from "d3-shape";
import {
  barChart,
  delta,
  describe as build,
  donutChart,
  expressive,
  flash,
  label,
  lineChart,
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
import { cleat, soccerBall } from "./icons/sport";
import { checkEffect, testContext, type CheckEffectOptions } from "./testing";

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
const sources: Record<string, Source> = {
  ...bars,
  donutChart: donutMarks,
  "D3 pie through expressive()": pieMarks,
  lineChart: lineMarks,
  "D3 line through expressive()": d3LineMarks,
  "Plot line through expressive()": plotLineMarks
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
