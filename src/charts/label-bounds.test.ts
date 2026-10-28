// Each chart's marks say where their own labels are (labelBounds), and where other marks' labels near
// them are (nearbyLabels), as drawn: at rest, part way through a change, and after a resize. Effects
// that place text past them read nothing else.

import { createMotion, describe as build, manualClock, type EffectContext, type GeometryEffect, type MarkGeometry, type Rect } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { expressive } from "./adapter/expressive";
import { barChart } from "./bar";
import { donutChart } from "./donut";
import { lineChart } from "./line";
import type { ChartEnv } from "./shell/setup";
import { geometryChanged } from "./shell/transitions";
import type { BarChartOptions, ChartLabel, DonutChartOptions, LineChartOptions } from "./types";

interface Player {
  name: string;
  goals: number;
  assists: number;
}

interface Shot {
  outcome: string;
  shots: number;
}

interface Week {
  week: number;
  goals: number;
  xg: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 16, assists: 4 },
  { name: "Tanaka", goals: 6, assists: 10 },
  { name: "Lindqvist", goals: 10, assists: 7 }
];

const shots: Shot[] = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];

const weeks: Week[] = [
  { week: 1, goals: 0, xg: 1.2 },
  { week: 2, goals: 2, xg: 2.1 },
  { week: 3, goals: 3, xg: 3.6 },
  { week: 4, goals: 5, xg: 4.4 }
];

function environment(): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock: manualClock() };
}

function container(): HTMLDivElement {
  return document.body.appendChild(document.createElement("div"));
}

/** A geometry effect that keeps the mark it's given and every mark it hears about after. */
function watcher() {
  const seen: MarkGeometry[] = [];
  const effect: GeometryEffect = {
    kind: "geometry",
    run(mark: MarkGeometry, ctx: EffectContext) {
      seen.push(mark);
      ctx.onChange((moved) => seen.push(moved));
      return Promise.resolve();
    },
    end() {},
    clear() {}
  };
  return { effect, seen };
}

const SIZE = 12.5;

/**
 * Where a label's glyphs are as drawn: its <text>'s place, anchor and text, as wide as jsdom's
 * estimate of chart text (0.6 em a character), from 0.75 em above its baseline (ascenders) to
 * 0.2 em below it (descenders).
 */
function inked({ element }: ChartLabel): Rect {
  const width = (element.textContent ?? "").length * SIZE * 0.6;
  const x = Number(element.getAttribute("x"));
  const anchor = element.getAttribute("text-anchor");
  return { x: anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x, y: Number(element.getAttribute("y")) - 0.75 * SIZE, width, height: 0.95 * SIZE };
}

const holds = (box: Rect, text: Rect): boolean =>
  box.x <= text.x + 0.01 && box.y <= text.y + 0.01 && box.x + box.width >= text.x + text.width - 0.01 && box.y + box.height >= text.y + text.height - 0.01;

/** Each mark's labels, as labels() gives them, are held by its labelBounds: a box each, in the order they're listed. */
function expectHeld(marks: readonly MarkGeometry[], labels: readonly ChartLabel[]): void {
  for (const mark of marks) {
    const own = labels.filter((label) => label.key === mark.key);
    expect(mark.labelBounds, mark.key).toHaveLength(own.length);
    own.forEach((label, i) => expect(holds(mark.labelBounds![i]!, inked(label)), `${mark.key} ${label.role} "${label.text}"`).toBe(true));
  }
}

function stubResizeObserver(): (width: number) => void {
  const callbacks: ResizeObserverCallback[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  return (width) => callbacks.forEach((callback) => callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("barChart: labelBounds", () => {
  function setup(options: Partial<BarChartOptions<Player>> = {}) {
    const env = environment();
    const chart = barChart<Player>(container(), { label: "Goals by player", data: players, y: "name", x: "goals", width: 600, ...options }, env);
    return { chart, clock: env.clock, settle: (running: Promise<unknown>) => play(env.clock, running) };
  }

  it("holds each bar's category and value labels, for bars, negative bars and columns either way", () => {
    const negative = players.map((p, i) => ({ ...p, goals: i === 1 ? -p.goals : p.goals }));
    for (const options of [{}, { data: negative }, { x: "name", y: "goals" }, { x: "name", y: "goals", data: negative }] as Partial<BarChartOptions<Player>>[]) {
      const { chart } = setup(options);
      expectHeld(chart.marks(), chart.labels());
      expect(chart.marks().every((mark) => mark.labelBounds!.length === 2)).toBe(true);
    }
  });

  it("gives a stack's segments none, and leaves out a label with no text", () => {
    const { chart } = setup({ x: undefined, stack: ["goals", "assists"] });
    expectHeld(chart.marks(), chart.labels());
    expect(chart.marks().flatMap((mark) => mark.segments!.map((segment) => segment.labelBounds))).toEqual(Array(6).fill(undefined));
    const blank = setup({ format: () => "" }).chart;
    expect(blank.marks().map((mark) => mark.labelBounds!.length)).toEqual([1, 1, 1]);
    expectHeld(blank.marks(), blank.labels());
  });

  it("holds the labels part way through a change, as they count, and once it settles", async () => {
    const { chart, clock, settle } = setup();
    const decorate = watcher();
    const watched = setup({ on: { decorate: decorate.effect } });
    const next = players.map((p) => ({ ...p, goals: p.goals * 12 }));
    const updating = chart.update({ data: next });
    const following = watched.chart.update({ data: next });
    for (let i = 0; i < 6; i++) {
      clock.advance(120);
      expectHeld(chart.marks(), chart.labels());
    }
    await settle(updating);
    expectHeld(chart.marks(), chart.labels());
    // The decoration heard each move, its labels' boxes with it.
    await watched.settle(following);
    const last = decorate.seen.filter((mark) => mark.key === "Okafor").pop()!;
    expect(last.labelBounds).toEqual(watched.chart.marks()[0]!.labelBounds);
  });

  it("holds them after a resize, and tells the mark's effects", () => {
    const resize = stubResizeObserver();
    const decorate = watcher();
    const { chart, clock } = setup({ width: undefined, on: { decorate: decorate.effect } });
    decorate.seen.length = 0;
    resize(360);
    clock.advance(16);
    expectHeld(chart.marks(), chart.labels());
    expect(decorate.seen.map((mark) => mark.labelBounds)).toEqual(chart.marks().map((mark) => mark.labelBounds));
  });
});

describe("donutChart: labelBounds", () => {
  function setup(options: Partial<DonutChartOptions<Shot>> = {}) {
    const env = environment();
    const chart = donutChart<Shot>(container(), { label: "Shot outcomes", data: shots, category: "outcome", value: "shots", width: 640, ...options }, env);
    return { chart, clock: env.clock, settle: (running: Promise<unknown>) => play(env.clock, running) };
  }

  it("holds each slice's label outside the ring, both its lines", () => {
    const { chart } = setup();
    expectHeld(chart.marks(), chart.labels());
    expect(chart.marks().map((mark) => mark.labelBounds!.length)).toEqual([2, 2, 2, 2]);
  });

  it("gives a slice whose label is dropped none", () => {
    const { chart } = setup({ data: [...shots, { outcome: "Woodwork", shots: 4 }] });
    const woodwork = chart.marks().find((mark) => mark.key === "Woodwork")!;
    expect(woodwork.labelBounds).toEqual([]);
    expectHeld(chart.marks(), chart.labels());
  });

  it("holds the labels part way through a change, and after a resize", async () => {
    const { chart, clock, settle } = setup();
    const updating = chart.update({ data: shots.map((shot, i) => ({ ...shot, shots: i === 0 ? 300 : shot.shots })) });
    for (let i = 0; i < 8; i++) {
      clock.advance(120);
      expectHeld(chart.marks(), chart.labels());
    }
    await settle(updating);
    expectHeld(chart.marks(), chart.labels());

    const resize = stubResizeObserver();
    const resized = setup({ width: undefined });
    resize(320);
    resized.clock.advance(16);
    expectHeld(resized.chart.marks(), resized.chart.labels());
  });
});

describe("lineChart: labelBounds", () => {
  function setup(options: Partial<LineChartOptions<Week>> = {}) {
    const env = environment();
    const chart = lineChart<Week>(container(), { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 600, ...options }, env);
    const lines = () => chart.marks().filter((mark) => mark.series === mark.key);
    const points = () => chart.marks().filter((mark) => mark.series !== mark.key);
    return { chart, lines, points, clock: env.clock, settle: (running: Promise<unknown>) => play(env.clock, running) };
  }

  it("holds each line's end label, and gives its points none", () => {
    const { chart, lines, points } = setup();
    expect(lines().map((mark) => mark.labelBounds!.length)).toEqual([1, 1]);
    expectHeld(lines(), chart.labels());
    expect(points().length).toBeGreaterThan(0);
    expect(points().every((mark) => !("labelBounds" in mark))).toBe(true);
  });

  it("gives a line whose label is empty none, and leaves it unset with labels: false", () => {
    const quiet = setup({ labels: (value, series) => (series === "goals" ? "" : `${value} ${series}`) });
    expect(quiet.lines().map((mark) => mark.labelBounds!.length)).toEqual([0, 1]);
    expectHeld(quiet.lines(), quiet.chart.labels());
    expect(setup({ labels: false }).lines().map((mark) => "labelBounds" in mark)).toEqual([false, false]);
  });

  it("holds the labels as a change plays, as a reveal moves them, and after a resize", async () => {
    const { chart, lines, clock, settle } = setup();
    const updating = chart.update({ data: weeks.map((w) => ({ ...w, goals: w.goals * 3, xg: w.xg * 2 })) });
    for (let i = 0; i < 8; i++) {
      clock.advance(150);
      expectHeld(lines(), chart.labels());
    }
    await settle(updating);
    expectHeld(lines(), chart.labels());
    chart.reveal(2.5);
    expectHeld(lines(), chart.labels());

    const resize = stubResizeObserver();
    const resized = setup({ width: undefined });
    resize(320);
    resized.clock.advance(16);
    expectHeld(resized.lines(), resized.chart.labels());
  });

  it("words a part-way reveal's end labels the same at rest, after a resize, as when it was revealed", () => {
    const resize = stubResizeObserver();
    const { chart, lines, clock } = setup({ width: undefined });
    // Half way from week 2 to 3: goals 2.5, in whole goals as its values are; xG 2.85, in tenths.
    chart.reveal(2.5);
    const revealed = chart.labels().map((label) => label.text);
    expect(revealed).toEqual([`${Math.round(2.5)} goals`, `${(2.85).toFixed(1)} xg`]);
    resize(400);
    clock.advance(16);
    expect(chart.labels().map((label) => label.text)).toEqual(revealed);
    expectHeld(lines(), chart.labels());
  });

  it("tells a line's effects when only its label moved", async () => {
    // xg's label stays the widest, so the plot keeps its size when goals' label goes.
    const wide = (value: number, series: string) => (series === "xg" ? `${value} expected goals` : `${value} g`);
    const decorate = watcher();
    const { chart, lines, settle } = setup({ labels: wide, on: { decorate: decorate.effect } });
    const goals = lines()[0]!;
    decorate.seen.length = 0;
    await settle(chart.update({ labels: (value, series) => (series === "goals" ? "" : wide(value, series)) }));
    expect(lines()[0]!.outline.d).toBe(goals.outline.d);
    expect(decorate.seen.filter((mark) => mark.key === "goals").map((mark) => mark.labelBounds)).toEqual([[]]);
  });
});

describe("expressive(): labelBounds", () => {
  const SVG = "http://www.w3.org/2000/svg";

  it("keeps the boxes a page's geometry gives, follows them on refresh(), and gives marks it reads none", () => {
    const svg = document.body.appendChild(document.createElementNS(SVG, "svg"));
    const path = svg.appendChild(document.createElementNS(SVG, "path"));
    let box: Rect = { x: 120, y: -6, width: 30, height: 14 };
    Object.assign(path, { __data__: { outcome: "Saved" } });
    const decorate = watcher();
    const fx = expressive<{ outcome: string }>(
      [path],
      {
        key: (d) => d.outcome,
        geometry: (_el, _d, key) => build.arc({ key, cx: 0, cy: 0, inner: 70, outer: 116, start: 0, end: 1, labelBounds: [box] }),
        on: { decorate: decorate.effect }
      },
      environment()
    );
    expect(fx.marks()[0]!.labelBounds).toEqual([box]);
    expect(decorate.seen[0]!.labelBounds).toEqual([box]);
    box = { ...box, x: 130 };
    fx.refresh();
    expect(decorate.seen.map((mark) => mark.labelBounds)).toEqual([[{ ...box, x: 120 }], [box]]);

    const rect = svg.appendChild(document.createElementNS(SVG, "rect"));
    for (const [name, value] of Object.entries({ x: 0, y: 0, width: 50, height: 20 })) rect.setAttribute(name, String(value));
    Object.assign(rect, { __data__: { outcome: "Goal" } });
    const read = expressive<{ outcome: string }>([rect], { key: (d) => d.outcome }, environment());
    expect("labelBounds" in read.marks()[0]!).toBe(false);
  });
});

describe("geometryChanged: labelBounds", () => {
  it("counts a mark whose labels' boxes moved as changed, and the same boxes as not", () => {
    const bar = (labelBounds?: Rect[]) => build.bar({ key: "a", x: 0, y: 0, width: 50, height: 20, baseline: "left", ...(labelBounds ? { labelBounds } : {}) });
    const box = { x: 54, y: 4, width: 12, height: 14 };
    expect(geometryChanged(bar([box]), bar([{ ...box }]))).toBe(false);
    expect(geometryChanged(bar(), bar())).toBe(false);
    expect(geometryChanged(bar([box]), bar([{ ...box, width: 13 }]))).toBe(true);
    expect(geometryChanged(bar([box]), bar([]))).toBe(true);
    expect(geometryChanged(bar(), bar([box]))).toBe(true);
  });
});

/** Every mark's nearbyLabels are the boxes `neighbours(mark)` name, as their own labelBounds, in that order. */
function expectNearby(marks: readonly MarkGeometry[], neighbours: (mark: MarkGeometry, i: number) => readonly MarkGeometry[]): void {
  marks.forEach((mark, i) => expect(mark.nearbyLabels, mark.key).toEqual(neighbours(mark, i).flatMap((other) => other.labelBounds ?? [])));
}

describe("lineChart: nearbyLabels", () => {
  interface Season {
    week: number;
    goals: number;
    xg: number;
    assists: number;
  }
  const season: Season[] = weeks.map((w) => ({ ...w, assists: w.week }));
  function setup(options: Partial<LineChartOptions<Season>> = {}) {
    const env = environment();
    const chart = lineChart<Season>(container(), { label: "Season", data: season, x: "week", series: ["goals", "xg", "assists"], width: 600, ...options }, env);
    const lines = () => chart.marks().filter((mark) => mark.series === mark.key);
    const points = () => chart.marks().filter((mark) => mark.series !== mark.key);
    return { chart, lines, points, clock: env.clock, settle: (running: Promise<unknown>) => play(env.clock, running) };
  }
  const others = (lines: readonly MarkGeometry[]) => (mark: MarkGeometry) => lines.filter((other) => other !== mark);

  it("gives each line every other line's end label, and its points none", () => {
    const { lines, points } = setup();
    expect(lines().map((mark) => mark.nearbyLabels!.length)).toEqual([2, 2, 2]);
    expectNearby(lines(), others(lines()));
    expect(points().every((mark) => !("nearbyLabels" in mark))).toBe(true);
  });

  it("leaves out an empty label, gives a line alone none, and leaves it unset with labels: false", () => {
    const quiet = setup({ labels: (value, series) => (series === "goals" ? "" : `${value} ${series}`) });
    expect(quiet.lines().map((mark) => mark.nearbyLabels!.length)).toEqual([2, 1, 1]);
    expectNearby(quiet.lines(), others(quiet.lines()));
    expect(setup({ series: ["goals"] }).lines()[0]!.nearbyLabels).toEqual([]);
    expect(setup({ labels: false }).lines().map((mark) => "nearbyLabels" in mark)).toEqual([false, false, false]);
  });

  it("follows the others' labels as a change plays, as a reveal moves them, and after a resize", async () => {
    const { chart, lines, clock, settle } = setup();
    const updating = chart.update({ data: season.map((w) => ({ ...w, goals: w.goals * 3, xg: w.xg * 2 })) });
    for (let i = 0; i < 8; i++) {
      clock.advance(150);
      expectNearby(lines(), others(lines()));
    }
    await settle(updating);
    expectNearby(lines(), others(lines()));
    chart.reveal(2.5);
    expectNearby(lines(), others(lines()));

    const resize = stubResizeObserver();
    const resized = setup({ width: undefined });
    resize(320);
    resized.clock.advance(16);
    expectNearby(resized.lines(), others(resized.lines()));
  });

  it("tells a line's effects when only another line's label moved", async () => {
    // xg's label stays the widest, so the plot keeps its size when goals' label goes.
    const wide = (value: number, series: string) => (series === "xg" ? `${value} expected goals` : `${value} g`);
    const decorate = watcher();
    const { chart, lines, settle } = setup({ series: ["goals", "xg"], labels: wide, on: { decorate: decorate.effect } });
    const xg = lines()[1]!;
    decorate.seen.length = 0;
    await settle(chart.update({ labels: (value, series) => (series === "goals" ? "" : wide(value, series)) }));
    expect(lines()[1]!.outline.d).toBe(xg.outline.d);
    expect(lines()[1]!.labelBounds).toEqual(xg.labelBounds);
    expect(decorate.seen.filter((mark) => mark.key === "xg").map((mark) => mark.nearbyLabels)).toEqual([[]]);
  });
});

describe("donutChart: nearbyLabels", () => {
  function setup(options: Partial<DonutChartOptions<Shot>> = {}) {
    const env = environment();
    const chart = donutChart<Shot>(container(), { label: "Shot outcomes", data: shots, category: "outcome", value: "shots", width: 640, ...options }, env);
    return { chart, clock: env.clock, settle: (running: Promise<unknown>) => play(env.clock, running) };
  }
  /** The slices either side, going round. */
  const either = (marks: readonly MarkGeometry[]) => (_mark: MarkGeometry, i: number) => [marks[(i + marks.length - 1) % marks.length]!, marks[(i + 1) % marks.length]!];

  it("gives each slice its neighbours' labels, either side, going round", () => {
    const marks = setup().chart.marks();
    expect(marks.map((mark) => mark.nearbyLabels!.length)).toEqual([4, 4, 4, 4]);
    expectNearby(marks, either(marks));
  });

  it("passes over a slice whose label is dropped, to the nearest label that way", () => {
    // Woodwork, last, has no label: Blocked's neighbour after it is Goal, and Goal's before it is Blocked.
    const marks = setup({ data: [...shots, { outcome: "Woodwork", shots: 4 }] }).chart.marks();
    const [goal, saved, offTarget, blocked, woodwork] = marks as [MarkGeometry, MarkGeometry, MarkGeometry, MarkGeometry, MarkGeometry];
    expect(woodwork.labelBounds).toEqual([]);
    const sides: Record<string, MarkGeometry[]> = {
      Goal: [blocked, saved],
      Saved: [goal, offTarget],
      "Off target": [saved, blocked],
      Blocked: [offTarget, goal],
      Woodwork: [blocked, goal]
    };
    expectNearby(marks, (mark) => sides[mark.key]!);
  });

  it("gives one label once when it's the nearest both ways, and a slice alone none", () => {
    const two = setup({ data: shots.slice(0, 2) }).chart.marks();
    expectNearby(two, (_mark, i) => [two[1 - i]!]);
    expect(setup({ data: shots.slice(0, 1) }).chart.marks()[0]!.nearbyLabels).toEqual([]);
  });

  it("follows the labels part way through a change, and after a resize", async () => {
    const { chart, clock, settle } = setup();
    const updating = chart.update({ data: shots.map((shot, i) => ({ ...shot, shots: i === 0 ? 300 : shot.shots })) });
    for (let i = 0; i < 8; i++) {
      clock.advance(120);
      expectNearby(chart.marks(), either(chart.marks()));
    }
    await settle(updating);
    expectNearby(chart.marks(), either(chart.marks()));

    const resize = stubResizeObserver();
    const resized = setup({ width: undefined });
    resize(320);
    resized.clock.advance(16);
    expectNearby(resized.chart.marks(), either(resized.chart.marks()));
  });
});

describe("barChart and expressive(): nearbyLabels", () => {
  it("bars give none: a bar's text goes past its own end, where no other bar's label is", () => {
    for (const options of [{ y: "name", x: "goals" }, { x: "name", y: "goals" }, { y: "name", stack: ["goals", "assists"] }] as Partial<BarChartOptions<Player>>[]) {
      const chart = barChart<Player>(container(), { label: "Goals by player", data: players, width: 600, ...options }, environment());
      expect(chart.marks().every((mark) => !("nearbyLabels" in mark) && (mark.segments ?? []).every((segment) => !("nearbyLabels" in segment)))).toBe(true);
    }
  });

  it("expressive() keeps the boxes a page's geometry gives, and gives marks it reads none", () => {
    const SVG = "http://www.w3.org/2000/svg";
    const svg = document.body.appendChild(document.createElementNS(SVG, "svg"));
    const path = svg.appendChild(document.createElementNS(SVG, "path"));
    Object.assign(path, { __data__: { outcome: "Saved" } });
    const nearby: Rect = { x: 120, y: -40, width: 30, height: 14 };
    const fx = expressive<{ outcome: string }>(
      [path],
      { key: (d) => d.outcome, geometry: (_el, _d, key) => build.arc({ key, cx: 0, cy: 0, inner: 70, outer: 116, start: 0, end: 1, nearbyLabels: [nearby] }) },
      environment()
    );
    expect(fx.marks()[0]!.nearbyLabels).toEqual([nearby]);
    const rect = svg.appendChild(document.createElementNS(SVG, "rect"));
    for (const [name, value] of Object.entries({ x: 0, y: 0, width: 50, height: 20 })) rect.setAttribute(name, String(value));
    Object.assign(rect, { __data__: { outcome: "Goal" } });
    expect("nearbyLabels" in expressive<{ outcome: string }>([rect], { key: (d) => d.outcome }, environment()).marks()[0]!).toBe(false);
  });
});

describe("geometryChanged: nearbyLabels", () => {
  it("counts a mark whose neighbours' boxes moved as changed, and the same boxes as not", () => {
    const line = (nearbyLabels?: Rect[]) => build.line({ key: "goals", points: [{ x: 0, y: 0 }, { x: 10, y: 5 }], labelBounds: [], ...(nearbyLabels ? { nearbyLabels } : {}) });
    const box = { x: 20, y: 0, width: 30, height: 16 };
    expect(geometryChanged(line([box]), line([{ ...box }]))).toBe(false);
    expect(geometryChanged(line(), line())).toBe(false);
    expect(geometryChanged(line([box]), line([{ ...box, y: 1 }]))).toBe(true);
    expect(geometryChanged(line([box]), line([]))).toBe(true);
    expect(geometryChanged(line(), line([box]))).toBe(true);
    expect(geometryChanged(line([box]), line([box, box]))).toBe(true);
  });
});
