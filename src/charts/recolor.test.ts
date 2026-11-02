// update({ colors }) on each chart: every mark is in its new colour on the change's first frame, mid-change
// too, not only once the change lands, with motion off and with `colors` alone at once. Overlays drawn in
// a mark's colour or in one of its parts' follow, on our bar chart and on expressive()'s host marks.

import { createMotion, manualClock, type GeometryEffect, type MotionMode } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { expressive } from "./adapter/expressive";
import { barChart } from "./bar";
import { donutChart } from "./donut";
import { lineChart } from "./line";
import { seriesColors } from "./render/theme";
import type { ChartEnv } from "./shell/setup";
import type { BarChartOptions } from "./types";

interface Player {
  name: string;
  goals: number;
  assists: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 16, assists: 4 },
  { name: "Tanaka", goals: 6, assists: 10 },
  { name: "Lindqvist", goals: 10, assists: 7 }
];

/** Lindqvist scores two fewer: the axis stays as it is, so only Lindqvist's bar moves. */
const fewer = players.map((p) => (p.name === "Lindqvist" ? { ...p, goals: p.goals - 2 } : p));

const SVG = "http://www.w3.org/2000/svg";

function env(mode: MotionMode = "presentation"): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock: manualClock() };
}

const place = (): HTMLElement => document.body.appendChild(document.createElement("div"));
const mark = (element: Element): string => (element as SVGElement).style.getPropertyValue("--ec-mark");

/** Each element's key and "mark" colour, in document order. */
const colorsOf = (svg: Element, selector: string, key: (element: Element) => string): string[] =>
  Array.from(svg.querySelectorAll(selector), (element) => `${key(element)} ${mark(element)}`);

function bars(options: Partial<BarChartOptions<Player>> = {}, mode: MotionMode = "presentation") {
  const e = env(mode);
  const chart = barChart<Player>(place(), { label: "Goals by player", data: players, y: "name", x: "goals", width: 600, ...options }, e);
  const segment = (element: Element) => `${element.closest(".ec-mark")!.getAttribute("data-key")}/${element.getAttribute("data-series")}`;
  const colors = () => colorsOf(chart.element, ".ec-mark .ec-segment", segment);
  return { chart, clock: e.clock, colors, settle: (running: Promise<unknown>) => play(e.clock, running) };
}

/** A decoration that draws each of a mark's segments in its own colour (Paint.part), as drawIn does, and keeps them. */
const parts: GeometryEffect = {
  kind: "geometry",
  run(geometry, ctx) {
    for (const segment of geometry.segments ?? []) ctx.layer.path(segment.outline.d, { fill: "mark", part: segment.key });
    return Promise.resolve();
  },
  end() {},
  clear() {}
};

/** Each run's part paths, as the key of the part and its "mark" colour. */
const partColors = (svg: Element): string[] => colorsOf(svg, ".ec-run [data-part]", (path) => path.getAttribute("data-part")!);

afterEach(() => {
  document.body.replaceChildren();
});

describe("barChart: update({ colors })", () => {
  it("recolours every bar on a staged change's first frame, the bars it leaves in place too", async () => {
    const { chart, clock, colors, settle } = bars({ stack: ["goals", "assists"] });
    const before = colors();
    const updated = chart.update({ data: fewer, colors: { goals: 3, assists: 4 } });
    const first = colors();
    expect(first).toEqual(players.flatMap((p) => [`${p.name}/goals ${seriesColors(3).color}`, `${p.name}/assists ${seriesColors(4).color}`]));
    first.forEach((color, i) => expect(color).not.toBe(before[i]));
    // Through the change and as it lands, the same.
    clock.advance(500);
    expect(colors()).toEqual(first);
    await settle(updated);
    expect(colors()).toEqual(first);
  });

  it("recolours every bar on its first frame when it comes mid-change, with `colors` alone", async () => {
    const { chart, clock, colors, settle } = bars();
    const changing = chart.update({ data: fewer });
    clock.advance(300);
    expect(clock.idle).toBe(false);
    const recoloured = chart.update({ colors: { goals: 5 } });
    expect(colors()).toEqual(players.map((p) => `${p.name}/goals ${seriesColors(5).color}`));
    await settle(Promise.all([changing, recoloured]));
    expect(colors()).toEqual(players.map((p) => `${p.name}/goals ${seriesColors(5).color}`));
  });

  it("recolours every bar at once with `colors` alone, and with motion off", async () => {
    const alone = bars();
    void alone.chart.update({ colors: { goals: 2 } });
    expect(alone.colors()).toEqual(players.map((p) => `${p.name}/goals ${seriesColors(2).color}`));
    expect(alone.clock.idle).toBe(true);

    const off = bars({ stack: ["goals", "assists"] }, "off");
    void off.chart.update({ data: fewer, colors: { assists: 6 } });
    expect(off.colors()).toEqual(players.flatMap((p) => [`${p.name}/goals ${seriesColors(1).color}`, `${p.name}/assists ${seriesColors(6).color}`]));
    expect(off.clock.idle).toBe(true);
  });

  it("recolours every bar on the first frame when coloured by category", async () => {
    const { chart, colors, settle } = bars({ colorBy: "category" });
    const before = colors();
    const updated = chart.update({ data: fewer, colors: { Okafor: 6, Tanaka: 7, Lindqvist: 8 } });
    const first = colors();
    expect(first).toEqual([`Okafor/goals ${seriesColors(6).color}`, `Tanaka/goals ${seriesColors(7).color}`, `Lindqvist/goals ${seriesColors(8).color}`]);
    first.forEach((color, i) => expect(color).not.toBe(before[i]));
    await settle(updated);
    expect(colors()).toEqual(first);
  });

  it("recolours the overlays drawn in a stack's later part's colour, its first part's staying", async () => {
    const { chart, settle } = bars({ stack: ["goals", "assists"], on: { decorate: parts } });
    const svg = chart.element;
    const run = () => mark(svg.querySelector('.ec-run[data-key="Okafor"]')!);
    expect(partColors(svg)).toEqual(players.flatMap((p) => [`${p.name}/goals ${seriesColors(1).color}`, `${p.name}/assists ${seriesColors(2).color}`]));
    // Only assists' colour changes: the first part's, and the run's, stay.
    const updated = chart.update({ colors: { goals: 1, assists: 4 } });
    expect(partColors(svg)).toEqual(players.flatMap((p) => [`${p.name}/goals ${seriesColors(1).color}`, `${p.name}/assists ${seriesColors(4).color}`]));
    expect(run()).toBe(seriesColors(1).color);
    await settle(updated);
    // Stacked the other way: the run takes its new first part's colour, and each part's path keeps its own.
    await settle(chart.update({ stack: ["assists", "goals"] }));
    expect(partColors(svg)).toEqual(players.flatMap((p) => [`${p.name}/goals ${seriesColors(1).color}`, `${p.name}/assists ${seriesColors(4).color}`]));
    expect(run()).toBe(seriesColors(4).color);
  });
});

describe("expressive(): a host mark's parts recoloured", () => {
  it("recolours the overlays drawn in a later part's colour when a read finds it changed", () => {
    const svg = document.body.appendChild(document.createElementNS(SVG, "svg")) as SVGSVGElement;
    svg.setAttribute("width", "600");
    const groups = (["goals", "assists"] as const).map((series, s) => {
      const group = svg.appendChild(document.createElementNS(SVG, "g"));
      group.setAttribute("fill", s === 0 ? "#2a78d6" : "#eb6834");
      players.forEach((player, i) => {
        const rect = group.appendChild(document.createElementNS(SVG, "rect"));
        for (const [name, value] of Object.entries({ x: (s === 0 ? 0 : player.goals) * 20, y: i * 34, width: player[series] * 20, height: 20 })) rect.setAttribute(name, String(value));
        (rect as unknown as { __data__: unknown }).__data__ = { row: player, series };
      });
      return group;
    });
    const rects = () => Array.from(svg.querySelectorAll("rect"));
    const fx = expressive<{ row: Player; series: string }>(rects(), { key: (d) => d.row.name, segment: (d) => d.series, on: { decorate: parts } }, env());
    const tanaka = () => partColors(svg).filter((part) => part.startsWith("Tanaka/"));
    const color = (part: string) => part.split(" ")[1]!.toLowerCase();
    expect(tanaka().map(color)).toEqual([expect.stringMatching(/^(#2a78d6|rgb\(42, 120, 214\))$/), expect.stringMatching(/^(#eb6834|rgb\(235, 104, 52\))$/)]);
    // The host draws assists in another colour: read again, the second part's overlay follows, the first's stays.
    groups[1]!.setAttribute("fill", "#7a5af8");
    fx.refresh();
    expect(tanaka().map(color)).toEqual([expect.stringMatching(/^(#2a78d6|rgb\(42, 120, 214\))$/), expect.stringMatching(/^(#7a5af8|rgb\(122, 90, 248\))$/)]);
    fx.destroy();
  });
});

describe("donutChart and lineChart: update({ colors })", () => {
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

  it("recolours every slice on the first frame, mid-change too", async () => {
    const e = env();
    const chart = donutChart<Shot>(place(), { label: "Shot outcomes", data: shots, category: "outcome", value: "shots", width: 640 }, e);
    const slices = () => colorsOf(chart.element, ".ec-mark .ec-slice", (slice) => slice.closest(".ec-mark")!.getAttribute("data-key")!);
    const changing = chart.update({ data: shots.map((s) => (s.outcome === "Goal" ? { ...s, shots: 70 } : s)) });
    e.clock.advance(300);
    const recoloured = chart.update({ colors: { Goal: 5, Saved: 6, "Off target": 7, Blocked: 8 } });
    const first = slices();
    expect(first).toEqual([`Goal ${seriesColors(5).color}`, `Saved ${seriesColors(6).color}`, `Off target ${seriesColors(7).color}`, `Blocked ${seriesColors(8).color}`]);
    await play(e.clock, Promise.all([changing, recoloured]));
    expect(slices()).toEqual(first);
  });

  it("recolours every line and point on the first frame, mid-change too", async () => {
    interface Week {
      week: number;
      goals: number;
      xg: number;
    }
    const weeks: Week[] = [
      { week: 1, goals: 0, xg: 1.2 },
      { week: 2, goals: 2, xg: 2.1 },
      { week: 3, goals: 3, xg: 3.6 },
      { week: 4, goals: 5, xg: 4.4 }
    ];
    const e = env();
    const chart = lineChart<Week>(place(), { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 600 }, e);
    const marks = () => colorsOf(chart.element, ".ec-line, .ec-point", (group) => group.getAttribute("data-key")!);
    const changing = chart.update({ data: weeks.map((w) => (w.week === 4 ? { ...w, goals: 6 } : w)) });
    e.clock.advance(300);
    const recoloured = chart.update({ colors: { goals: 3, xg: 4 } });
    const first = marks();
    const slot = (key: string) => (key.startsWith("goals") ? 3 : 4);
    expect(first).toEqual(["goals", "xg", ...weeks.flatMap((w) => [`goals@${w.week}`, `xg@${w.week}`])].map((key) => `${key} ${seriesColors(slot(key)).color}`));
    await play(e.clock, Promise.all([changing, recoloured]));
    expect(marks()).toEqual(first);
  });
});
