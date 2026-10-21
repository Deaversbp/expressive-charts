// The plan §8 conformance checks for the built-in effects, on real marks from four sources: bars
// from the reference barChart and from expressive() on bars drawn by other code, the slices of the
// reference donutChart, and the slices of a D3 pie through expressive(). This test brings charts and
// effects together, so it lives beside src/index.ts, the only module allowed to.

import { select } from "d3-selection";
import { arc, pie, type PieArcDatum } from "d3-shape";
import { play, testContext, type TestContextOptions } from "./core/testing";
import { barChart, describe as build, donutChart, expressive, flash, parallel, pulse, sequence, stagger, travel, wiggle, type GeometryEffect, type MarkGeometry } from "./index";
import { cleat, soccerBall } from "./icons/sport";

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

/** The reference chart's marks: stacked goals and assists, at a fixed width (jsdom has no layout). */
function chartMarks(): readonly MarkGeometry[] {
  const container = document.body.appendChild(document.createElement("div"));
  const chart = barChart<Player>(container, { label: "Goals and assists", data: players, y: "name", stack: ["goals", "assists"], width: 600 });
  return chart.marks();
}

/**
 * Marks from bars drawn by hand, the way D3 code would draw them: a translated plot group, one <g>
 * per series, and each rect's row on __data__. 20 px per goal or assist, 34 px rows.
 */
function adapterMarks(): readonly MarkGeometry[] {
  const svg = el("svg", { width: 600, height: 120 }, document.body);
  const plot = el("g", { transform: "translate(90,4)" }, svg);
  const rects: Element[] = [];
  (["goals", "assists"] as const).forEach((series, s) => {
    const group = el("g", { class: series }, plot);
    players.forEach((player, i) => {
      const before = s === 0 ? 0 : player.goals;
      const rect = el("rect", { x: before * 20, y: i * 34 + 7, width: player[series] * 20, height: 20 }, group);
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

/** The reference donut's slices: the prototype's shot outcomes, clockwise from 12 o'clock in data order. */
function donutMarks(): readonly MarkGeometry[] {
  const container = document.body.appendChild(document.createElement("div"));
  const chart = donutChart<Shot>(container, { label: "Shot outcomes", data: shots, category: "outcome", value: "shots", width: 640 });
  return chart.marks();
}

/** A real D3 donut: d3.pie() with its default sort, d3.arc() paths in a centred <g>, each slice described with describe.arc. */
function pieMarks(): readonly MarkGeometry[] {
  const plot = select(document.body).append("svg").attr("width", 640).attr("height", 300).append("g").attr("transform", "translate(320,150)");
  const slices = plot
    .selectAll<SVGPathElement, PieArcDatum<Shot>>("path")
    .data(pie<Shot>().value((d) => d.shots)(shots))
    .join("path")
    .attr("d", arc<PieArcDatum<Shot>>().innerRadius(70).outerRadius(116));
  const fx = expressive(slices, {
    key: (d) => d.data.outcome,
    value: (d) => d.value,
    geometry: (_el, d, key) => build.arc({ key, cx: 0, cy: 0, inner: 70, outer: 116, start: d.startAngle, end: d.endAngle })
  });
  return fx.marks();
}

const effects: Record<string, GeometryEffect> = {
  "ball rolling": travel(soccerBall),
  "cleat stepping": travel(cleat),
  "ball then cleat": sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" })),
  flash: flash(),
  "flash while the ball rolls": parallel(flash(), travel(soccerBall, { along: "goals" })),
  wiggle: wiggle(),
  pulse: pulse(),
  "staggered flash, third of five": stagger(flash())
};

/** The batch an effect runs in, where it matters: a staggered mark waits its turn first. */
const batches: Record<string, TestContextOptions["batch"]> = { "staggered flash, third of five": { index: 2, count: 5 } };

const bars: Record<string, () => readonly MarkGeometry[]> = { barChart: chartMarks, "expressive() bars": adapterMarks };
const sources: Record<string, () => readonly MarkGeometry[]> = { ...bars, donutChart: donutMarks, "D3 pie through expressive()": pieMarks };

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

describe.each(Object.entries(sources))("effects on marks from %s", (_source, marksOf) => {
  for (const [effectName, effect] of Object.entries(effects)) {
    describe(effectName, () => {
      const context = (options: TestContextOptions = {}): ReturnType<typeof testContext> => testContext({ batch: batches[effectName], ...options });

      it("ends a full run with the same picture and mark style as end()", async () => {
        for (const mark of marksOf()) {
          const ran = context();
          await play(ran.clock, effect.run(mark, ran));
          const ended = context();
          effect.end(mark, ended);
          expect(ran.layer.picture()).toEqual(ended.layer.picture());
          expect(ran.mark.style).toEqual(ended.mark.style);
        }
      });

      it("leaves nothing behind once cleared", async () => {
        for (const mark of marksOf()) {
          const ctx = context();
          await play(ctx.clock, effect.run(mark, ctx));
          effect.clear(ctx);
          ctx.clear();
          expect(ctx.layer.drawn).toEqual([]);
          expect(ctx.mark.style).toEqual({});
        }
      });

      it("settles when aborted mid-run, and clears to nothing", async () => {
        for (const mark of marksOf()) {
          const ctx = context();
          const running = effect.run(mark, ctx);
          ctx.clock.advance(16);
          ctx.clock.advance(16);
          ctx.abort();
          await expect(running).resolves.toBeUndefined();
          effect.clear(ctx);
          ctx.clear();
          expect(ctx.layer.drawn).toEqual([]);
          expect(ctx.mark.style).toEqual({});
          expect(ctx.clock.idle).toBe(true);
        }
      });

      it("runs no frames when motion is off, and draws the end state", async () => {
        for (const mark of marksOf()) {
          const ctx = context({ mode: "off" });
          const running = effect.run(mark, ctx);
          expect(ctx.clock.idle).toBe(true);
          await running;
          const ended = context({ mode: "off" });
          effect.end(mark, ended);
          expect(ctx.layer.picture()).toEqual(ended.layer.picture());
          expect(ctx.mark.style).toEqual(ended.mark.style);
        }
      });
    });
  }
});
