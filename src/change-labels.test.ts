// A change label that holds up, on real charts and attachments (M8 step 2): a `delta` goes at its
// chart's next update, even one that leaves its mark alone, and stays through what isn't an update
// (`update({ on })` alone, a re-sort, an attachment's read that finds nothing new, a Vega render for
// a signal). An update that replaces one still moving says the change from the last update's values.
// Overlay text on an attachment is sized as on our charts. This test brings charts and effects
// together, so it lives beside src/index.ts, the only module allowed to.

import { View, parse } from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import { barChart, donutChart, expressive, fromVegaView, lineChart, type ChartEnv } from "./charts";
import { createRegistry, type PresetFactory } from "./core/registry";
import { createMotion, manualClock, type MarkGeometry, type MotionMode } from "./core";
import { play } from "./core/testing";
import { delta, flash, only, parallel } from "./effects";

interface Player {
  name: string;
  goals: number;
}

interface Week {
  week: number;
  goals: number;
  xg: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 16 },
  { name: "Tanaka", goals: 6 },
  { name: "Lindqvist", goals: 10 }
];

const SVG = "http://www.w3.org/2000/svg";

function env(mode: MotionMode = "off"): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock: manualClock() };
}

function container(): HTMLDivElement {
  return document.body.appendChild(document.createElement("div"));
}

/** The change labels showing, by key: every run's text in the overlay. */
function shown(svg: Element): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const text of Array.from(svg.querySelectorAll(".ec-run[data-key] text.ec-text"))) (out[text.closest(".ec-run")!.getAttribute("data-key")!] ??= []).push(text.textContent ?? "");
  return out;
}

/** New rows, `name`'s goals changed by `by`: every other row a new object with the same values. */
const scored = (rows: readonly Player[], name: string, by = 1): Player[] => rows.map((p) => ({ ...p, goals: p.name === name ? p.goals + by : p.goals }));

describe("a delta goes at its chart's next update", () => {
  it("on bars: one that leaves its bar alone, and one with new rows and the same values (a matchweek where nobody scores)", async () => {
    const chart = barChart<Player>(container(), { label: "Goals", data: players, y: "name", x: "goals", width: 600, on: { update: delta() } }, env());
    const week25 = scored(players, "Okafor", 2);
    await chart.update({ data: week25 });
    expect(shown(chart.element)).toEqual({ Okafor: ["+2"] });
    const week26 = scored(week25, "Tanaka");
    await chart.update({ data: week26 });
    expect(shown(chart.element)).toEqual({ Tanaka: ["+1"] });
    await chart.update({ data: scored(week26, "Tanaka", 0) });
    expect(shown(chart.element)).toEqual({});
    // The same array again is an update with data too.
    const week28 = scored(week26, "Lindqvist");
    await chart.update({ data: week28 });
    expect(shown(chart.element)).toEqual({ Lindqvist: ["+1"] });
    await chart.update({ data: week28 });
    expect(shown(chart.element)).toEqual({});
  });

  it("on a donut: an update that changes another slice's value", async () => {
    interface Shots {
      outcome: string;
      shots: number;
    }
    const shots: Shots[] = [
      { outcome: "Goal", shots: 58 },
      { outcome: "Saved", shots: 112 },
      { outcome: "Blocked", shots: 87 }
    ];
    const add = (rows: readonly Shots[], outcome: string, by: number) => rows.map((row) => ({ ...row, shots: row.outcome === outcome ? row.shots + by : row.shots }));
    const chart = donutChart<Shots>(container(), { label: "Shots", data: shots, category: "outcome", value: "shots", width: 640, on: { update: delta({ value: (data) => data.datum.shots }) } }, env());
    const next = add(shots, "Goal", 2);
    await chart.update({ data: next });
    expect(shown(chart.element)).toEqual({ Goal: ["+2"] });
    // Every share changes, but only Saved's value: Goal's change goes.
    await chart.update({ data: add(next, "Saved", 3) });
    expect(shown(chart.element)).toEqual({ Saved: ["+3"] });
  });

  it("on a line: an update that changes another series", async () => {
    const weeks: Week[] = [1, 2, 3, 4].map((week) => ({ week, goals: [0, 2, 3, 5][week - 1]!, xg: [0.4, 1.5, 2.9, 4.1][week - 1]! }));
    const lines = only((mark: MarkGeometry) => mark.length > 0, delta());
    const chart = lineChart<Week>(container(), { label: "Goals", data: weeks, x: "week", series: ["goals", "xg"], width: 600, on: { update: lines } }, env());
    await chart.update({ data: weeks.map((w) => (w.week === 4 ? { ...w, goals: 7 } : w)) });
    expect(shown(chart.element)).toEqual({ goals: ["+2"] });
    await chart.update({ data: weeks.map((w) => (w.week === 4 ? { ...w, goals: 7, xg: 4.6 } : w)) });
    expect(shown(chart.element)).toEqual({ xg: ["+0.5"] });
  });

  it("on an attachment: a refresh() that finds a new value, or a new row; not one that finds nothing new, or only moves", () => {
    const svg = document.body.appendChild(document.createElementNS(SVG, "svg"));
    const rects = players.map((p, i) => {
      const rect = svg.appendChild(document.createElementNS(SVG, "rect"));
      Object.assign(rect, { __data__: p });
      for (const [name, value] of Object.entries({ x: 0, y: i * 30, width: p.goals * 10, height: 20 })) rect.setAttribute(name, String(value));
      return rect;
    });
    const bind = (rows: readonly Player[], scale = 10) =>
      rows.forEach((row, i) => {
        Object.assign(rects[i]!, { __data__: row });
        rects[i]!.setAttribute("width", String(row.goals * scale));
      });
    const fx = expressive<Player>(rects, { key: (d) => d.name, value: (d) => d.goals, on: { update: delta({ value: (data) => data.datum.goals }) } }, env());
    const week25 = scored(players, "Okafor", 3);
    bind(week25);
    fx.refresh();
    expect(shown(svg)).toEqual({ Okafor: ["+3"] });
    // Nothing new: the same rows, as the host drew them.
    fx.refresh();
    expect(shown(svg)).toEqual({ Okafor: ["+3"] });
    // A resize: every bar moves, with the same rows and values.
    bind(week25, 8);
    fx.refresh();
    expect(shown(svg)).toEqual({ Okafor: ["+3"] });
    // New rows with the same values: a matchweek where nobody scores.
    const week26 = scored(week25, "Okafor", 0);
    bind(week26, 8);
    fx.refresh();
    expect(shown(svg)).toEqual({});
    bind(scored(week26, "Tanaka", 2), 8);
    fx.refresh();
    expect(shown(svg)).toEqual({ Tanaka: ["+2"] });
    // A mark leaving is an update too.
    rects[2]!.remove();
    fx.refresh(rects.slice(0, 2));
    expect(shown(svg)).toEqual({});
  });

  it("on Vega bars: a data change, but not a render for a signal or a resize, which keep the same rows", async () => {
    // Fresh objects each time: Vega marks its rows with a symbol, which a spread would copy, making them the same rows to Vega.
    const rows = (okafor: number): Player[] => players.map((p) => ({ name: p.name, goals: p.name === "Okafor" ? okafor : p.goals }));
    const spec: TopLevelSpec = {
      width: 300,
      params: [{ name: "opacity", value: 1 }],
      data: { name: "players", values: rows(16) },
      mark: { type: "bar", opacity: { expr: "opacity" } },
      encoding: { y: { field: "name", type: "nominal", sort: null }, x: { field: "goals", type: "quantitative", scale: { domain: [0, 20], nice: false } } }
    };
    const host = container();
    const view = new View(parse(compile(spec).spec), { renderer: "svg", container: host });
    await view.runAsync();
    const svg = host.querySelector("svg")!;
    const e = env();
    fromVegaView<Player>(view, { key: (d) => d.name, sample: (d) => d.goals, on: { update: delta() } }, e);
    /** Vega draws, the adapter hears it in a microtask and reads on the next frame. */
    const render = async (run: Promise<unknown>) => {
      await run;
      await new Promise((resolve) => setTimeout(resolve, 0));
      e.clock.advance(16);
    };
    await render(view.data("players", rows(18)).runAsync());
    expect(shown(svg)).toEqual({ Okafor: ["+2"] });
    await render(view.signal("opacity", 0.8).runAsync());
    expect(svg.querySelector('path[fill-opacity="0.8"], path[opacity="0.8"]')).not.toBeNull();
    expect(shown(svg)).toEqual({ Okafor: ["+2"] });
    await render(view.width(240).runAsync());
    expect(shown(svg)).toEqual({ Okafor: ["+2"] });
    // New rows with the same values.
    await render(view.data("players", rows(18)).runAsync());
    expect(shown(svg)).toEqual({});
  });
});

describe("what isn't an update keeps it", () => {
  it("update({ on }) alone, with a slot changed or the same effect, and a re-sort", async () => {
    const changes = delta();
    const chart = barChart<Player>(container(), { label: "Goals", data: players, y: "name", x: "goals", width: 600, on: { update: changes } }, env());
    await chart.update({ data: scored(players, "Tanaka", 2) });
    expect(shown(chart.element)).toEqual({ Tanaka: ["+2"] });
    await chart.update({ on: { update: changes, hover: flash() } });
    expect(shown(chart.element)).toEqual({ Tanaka: ["+2"] });
    // A new delta draws its end state where the old one's run was.
    await chart.update({ on: { update: delta() } });
    expect(shown(chart.element)).toEqual({ Tanaka: ["+2"] });
    await chart.update({ sort: "value" });
    expect(shown(chart.element)).toEqual({ Tanaka: ["+2"] });
  });
});

describe("the values before", () => {
  it('an update that replaces one still moving says "+1", not the change from part way', async () => {
    const e = env("presentation");
    const chart = barChart<Player>(container(), { label: "Goals", data: players, y: "name", x: "goals", width: 600, on: { update: parallel(flash(), delta()) } }, e);
    const froms: number[] = [];
    chart.on("update", (event) => froms.push(event.from.length));
    const week25 = scored(players, "Okafor");
    void chart.update({ data: week25 });
    e.clock.advance(300);
    const between = chart.marks().find((mark) => mark.key === "Okafor")!.length;
    const settled = chart.update({ data: scored(week25, "Okafor") });
    await play(e.clock, settled);
    expect(shown(chart.element)).toEqual({ Okafor: ["+1"] });
    // The geometry before is still the bar on screen, part way, which the transition starts from.
    expect(froms[1]).toBeCloseTo(between, 6);
    expect(froms[1]).toBeLessThan(chart.marks().find((mark) => mark.key === "Okafor")!.length);
  });

  it("a line revealed further since its last update counts from its revealed end", async () => {
    const weeks: Week[] = [1, 2, 3, 4].map((week) => ({ week, goals: [0, 2, 3, 5][week - 1]!, xg: 0 }));
    const chart = lineChart<Week>(container(), { label: "Goals", data: weeks, x: "week", series: ["goals"], width: 600, on: { update: only((mark: MarkGeometry) => mark.length > 0, delta()) } }, env());
    chart.reveal(2);
    const week2 = weeks.map((w) => (w.week === 2 ? { ...w, goals: 3 } : w));
    await chart.update({ data: week2 });
    expect(shown(chart.element)).toEqual({ goals: ["+1"] });
    // A view, not an update: the change stays, and the line rests at week 4's 5.
    chart.reveal(4);
    expect(shown(chart.element)).toEqual({ goals: ["+1"] });
    await chart.update({ data: week2.map((w) => (w.week === 4 ? { ...w, goals: 7 } : w)) });
    expect(shown(chart.element)).toEqual({ goals: ["+2"] });
  });

  it("in every mode, Off too: each update's change, and nothing from the one before", async () => {
    for (const mode of ["off", "analysis", "presentation"] as const) {
      const e = env(mode);
      const chart = barChart<Player>(container(), { label: "Goals", data: players, y: "name", x: "goals", width: 600, on: { update: parallel(flash(), delta()) } }, e);
      const week25 = scored(players, "Okafor");
      await play(e.clock, chart.update({ data: week25 }));
      const week26 = scored(week25, "Okafor");
      await play(e.clock, chart.update({ data: week26 }));
      expect(shown(chart.element), mode).toEqual({ Okafor: ["+1"] });
      await play(e.clock, chart.update({ data: scored(week26, "Tanaka") }));
      expect(shown(chart.element), mode).toEqual({ Tanaka: ["+1"] });
      chart.destroy();
    }
  });
});

describe("overlay text on an attachment", () => {
  it("is sized as on our charts, and the page's own CSS wins", () => {
    const svg = document.body.appendChild(document.createElementNS(SVG, "svg"));
    const rect = svg.appendChild(document.createElementNS(SVG, "rect"));
    Object.assign(rect, { __data__: players[0] });
    for (const [name, value] of Object.entries({ x: 0, y: 0, width: 160, height: 20 })) rect.setAttribute(name, String(value));
    const fx = expressive<Player>([rect], { key: (d) => d.name, value: (d) => d.goals, on: { update: delta({ value: (data) => data.datum.goals }) } }, env());
    Object.assign(rect, { __data__: { ...players[0], goals: 17 } });
    rect.setAttribute("width", "170");
    fx.refresh();
    const text = svg.querySelector(".ec-overlay .ec-text")!;
    expect(text.textContent).toBe("+1");
    const style = getComputedStyle(text);
    expect([style.fontSize, style.fontWeight, style.fontVariantNumeric]).toEqual(["12.5px", "600", "tabular-nums"]);

    const page = document.head.appendChild(document.createElement("style"));
    page.textContent = "svg .ec-text { font-size: 11px; }";
    expect(getComputedStyle(text).fontSize).toBe("11px");
    page.remove();
    fx.destroy();
  });
});
