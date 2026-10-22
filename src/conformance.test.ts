// The plan §8 conformance checks for the built-in effects, through checkEffect, on real marks from
// these sources: bars from the reference barChart and from expressive() on bars drawn by other code,
// the slices of the reference donutChart, the slices of a D3 pie through expressive(), and the
// lines of a D3 line chart through expressive(), with samples from samplesAlong. Each
// source also draws its marks at another size, as a resize would, for the check that effects follow
// onChange. This test brings charts and effects together, so it lives beside src/index.ts, the only
// module allowed to.

import { select } from "d3-selection";
import { arc, line, pie, type PieArcDatum } from "d3-shape";
import {
  barChart,
  describe as build,
  donutChart,
  expressive,
  flash,
  parallel,
  pulse,
  samplesAlong,
  sequence,
  stagger,
  threshold,
  travel,
  wiggle,
  type AnyMarkEffect,
  type MarkGeometry
} from "./index";
import { cleat, soccerBall } from "./icons/sport";
import { checkEffect, type CheckEffectOptions } from "./testing";

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

/** Cumulative goals and xG over six weeks, crossing twice. */
const weeks: Week[] = [
  { week: 1, goals: 1, xg: 0.6 },
  { week: 2, goals: 1, xg: 1.5 },
  { week: 3, goals: 3, xg: 2.4 },
  { week: 4, goals: 3, xg: 3.6 },
  { week: 5, goals: 5, xg: 4.1 },
  { week: 6, goals: 6, xg: 5.2 }
];

/**
 * A real D3 line: two d3.line() paths in a margin <g>, one per series, each described from the
 * points that drew it, with samplesAlong samples. 80 px a week and 30 px a goal (64 and 24 when moved).
 */
function lineMarks(moved = false): readonly MarkGeometry[] {
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
  const fx = expressive(paths, {
    key: (d) => d.series,
    geometry: (_el, d, key) => build.line({ key, series: d.series, points: d.rows.map((w) => ({ x: x(w.week), y: y(w[d.series]) })), width: 2 }),
    samples: (d, mark) => samplesAlong(mark, d.rows.map((w) => ({ x: x(w.week), y: y(w[d.series]), value: w[d.series], at: w.week })))
  });
  return fx.marks();
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
  // checkEffect's default data runs from 0 to 1 along each walk, so this colours the last 40%.
  "threshold past a target": threshold({ compareTo: 0.6, when: "above" })
};

/** More than the defaults, where an effect needs it: a later mark of a batch. */
const options: Record<string, CheckEffectOptions> = { "staggered flash, third of five": { batch: { index: 2, count: 5 } } };

/** A source's marks, or with `true` the same marks moved. */
type Source = (moved?: boolean) => readonly MarkGeometry[];
const bars: Record<string, Source> = { barChart: chartMarks, "expressive() bars": adapterMarks };
const sources: Record<string, Source> = { ...bars, donutChart: donutMarks, "D3 pie through expressive()": pieMarks, "D3 line through expressive()": lineMarks };

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

describe("lines from a D3 line through expressive()", () => {
  it("finds a line for each series, in document order, in the margin group's coordinates", () => {
    const marks = lineMarks();
    expect(marks.map((mark) => mark.key)).toEqual(["goals", "xg"]);
    for (const mark of marks) {
      expect(mark.outline.closed).toBe(false);
      expect(mark.start).toEqual({ x: 0, y: 200 - 30 * weeks[0]![mark.key as "goals" | "xg"] });
      expect(mark.end.x).toBe(400);
    }
  });
});

describe.each(Object.entries(sources))("effects on marks from %s", (_source, marksOf) => {
  it("draws the marks moved: the same keys, at another size", () => {
    const marks = marksOf();
    const twins = marksOf(true);
    expect(twins.map((twin) => twin.key)).toEqual(marks.map((mark) => mark.key));
    marks.forEach((mark, i) => expect(twins[i]!.slice(0, 1), mark.key).not.toBe(mark.slice(0, 1)));
  });

  it.each(Object.keys(effects))("%s passes the conformance checks on every mark", async (name) => {
    const twins = marksOf(true);
    const moved = (mark: MarkGeometry) => twins.find((twin) => twin.key === mark.key);
    await checkEffect(effects[name]!, { name, marks: marksOf(), moved, ...options[name] });
  });
});
