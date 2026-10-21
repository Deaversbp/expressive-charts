// The plan §8 conformance checks for travel, on real bar marks from both sources: the reference
// barChart, and expressive() on bars drawn by other code. This test brings charts and effects
// together, so it lives beside src/index.ts, the only module allowed to.

import { play, testContext } from "./core/testing";
import { barChart, expressive, sequence, travel, type GeometryEffect, type MarkGeometry } from "./index";
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

const effects: Record<string, GeometryEffect> = {
  "ball rolling": travel(soccerBall),
  "cleat stepping": travel(cleat),
  "ball then cleat": sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" }))
};

const sources: Record<string, () => readonly MarkGeometry[]> = { barChart: chartMarks, "expressive()": adapterMarks };

afterEach(() => {
  document.body.replaceChildren();
});

describe.each(Object.entries(sources))("travel on bar marks from %s", (_source, marksOf) => {
  it("finds a stacked mark with goals and assists segments for every player", () => {
    const marks = marksOf();
    expect(marks.map((mark) => mark.key).sort()).toEqual(["Castillo", "Okafor", "Tanaka"]);
    for (const mark of marks) expect(mark.segments?.map((segment) => segment.series)).toEqual(["goals", "assists"]);
  });

  for (const [effectName, effect] of Object.entries(effects)) {
    describe(effectName, () => {
      it("ends a full run with the same picture as end()", async () => {
        for (const mark of marksOf()) {
          const ran = testContext();
          await play(ran.clock, effect.run(mark, ran));
          const ended = testContext();
          effect.end(mark, ended);
          expect(ran.layer.picture()).toEqual(ended.layer.picture());
        }
      });

      it("leaves nothing behind once cleared", async () => {
        for (const mark of marksOf()) {
          const ctx = testContext();
          await play(ctx.clock, effect.run(mark, ctx));
          effect.clear(ctx);
          ctx.clear();
          expect(ctx.layer.drawn).toEqual([]);
          expect(ctx.mark.style).toEqual({});
        }
      });

      it("settles when aborted mid-run, and clears to nothing", async () => {
        for (const mark of marksOf()) {
          const ctx = testContext();
          const running = effect.run(mark, ctx);
          ctx.clock.advance(16);
          ctx.clock.advance(16);
          ctx.abort();
          await expect(running).resolves.toBeUndefined();
          effect.clear(ctx);
          ctx.clear();
          expect(ctx.layer.drawn).toEqual([]);
          expect(ctx.clock.idle).toBe(true);
        }
      });

      it("runs no frames when motion is off, and draws the end state", async () => {
        for (const mark of marksOf()) {
          const ctx = testContext({ mode: "off" });
          const running = effect.run(mark, ctx);
          expect(ctx.clock.idle).toBe(true);
          await running;
          const ended = testContext({ mode: "off" });
          effect.end(mark, ended);
          expect(ctx.layer.picture()).toEqual(ended.layer.picture());
        }
      });
    });
  }
});
