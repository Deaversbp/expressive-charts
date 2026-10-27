// lineChart with missing values: a null or undefined value is a gap in its line, with no point,
// while its x stays a stop whose name, tooltip and table say the series is missing there.

import { createMotion, manualClock, type DataEffect, type MarkData, type MarkGeometry } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { measurePath, play } from "../core/testing";
import { lineChart } from "./line";
import type { ChartEnv } from "./shell/setup";
import type { LineChart, LineChartOptions } from "./types";

interface Week {
  week: number;
  goals: number | null;
  xg?: number | null;
}

/** No goals counted in week 3, no xG in week 5. */
const weeks: Week[] = [
  { week: 1, goals: 0, xg: 1.2 },
  { week: 2, goals: 2, xg: 2.1 },
  { week: 3, goals: null, xg: 3.6 },
  { week: 4, goals: 5, xg: 4.4 },
  { week: 5, goals: 6 },
  { week: 6, goals: 8, xg: 6 }
];

function setup(options: Partial<LineChartOptions<Week>> = {}) {
  const container = document.body.appendChild(document.createElement("div"));
  const clock = manualClock();
  const presets = createRegistry<PresetFactory>({ kind: "preset" });
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets, icons: { get: () => undefined }, motion, clock };
  const chart = lineChart<Week>(container, { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 600, ...options }, env);
  const svg = chart.element;
  const line = (series: string) => svg.querySelector(`.ec-line[data-key="${series}"]`) as SVGGElement;
  const point = (key: string) => svg.querySelector(`.ec-point[data-key="${key}"]`) as SVGGElement | null;
  const column = (key: string) => svg.querySelector(`.ec-column[data-key="${key}"]`) as SVGGElement;
  const mark = (key: string): MarkGeometry | undefined => chart.marks().find((m) => m.key === key);
  const keys = () => chart.marks().map((m) => m.key);
  const settle = (running: Promise<unknown>) => play(clock, running);
  return { container, chart, svg, clock, line, point, column, mark, keys, settle };
}

/** The points a line's stroke moves to, as "x,y" pairs, a new run starting with "M". */
const runs = (d: string): string[][] => d.split("M").filter(Boolean).map((run) => run.split("L"));

/** A data effect that keeps the data each mark was last given, by key. */
function dataRecorder() {
  const latest = new Map<string, MarkData<Week>>();
  const effect: DataEffect<Week> = {
    kind: "data",
    run(mark, data, ctx) {
      latest.set(mark.key, data);
      ctx.onChange((moved, next) => {
        if (next) latest.set(moved.key, next as MarkData<Week>);
      });
      return Promise.resolve();
    },
    end(mark, data) {
      latest.set(mark.key, data);
    },
    clear() {}
  };
  return { effect, latest };
}

function listen(chart: LineChart<Week>) {
  const events: string[] = [];
  for (const type of ["enter", "update", "exit"] as const) chart.on(type, (e) => events.push(`${type} ${e.mark.key}`));
  chart.on("hover", (e) => events.push(`hover ${e.mark.key}`));
  return events;
}

const pointer = (type: string, target: Element) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
const tooltipText = () => Array.from(document.querySelector(".ec-tooltip")!.children, (line) => line.textContent);
const tableRows = (container: Element) => Array.from(container.querySelectorAll(".ec-table tbody tr"), (tr) => Array.from(tr.children, (cell) => cell.textContent));

afterEach(() => {
  document.body.textContent = "";
});

describe("lineChart with missing values: lines", () => {
  it("leaves a gap where a value is missing, with no point there, and the walk runs straight across it", () => {
    const { chart, line, point, mark, keys } = setup();
    const goals = mark("goals")!;
    expect(runs(goals.outline.d)).toHaveLength(2);
    expect(line("goals").querySelector(".ec-stroke")!.getAttribute("d")).toBe(goals.outline.d);
    expect(goals.gaps).toHaveLength(1);
    const [from, to] = goals.gaps![0]!;
    const near = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
      expect(actual.x).toBeCloseTo(expected.x, 9);
      expect(actual.y).toBeCloseTo(expected.y, 9);
    };
    near(goals.path(from), mark("goals@2")!.center);
    near(goals.path(to), mark("goals@4")!.center);
    expect(keys()).not.toContain("goals@3");
    expect(keys()).toContain("xg@3");
    expect(point("goals@3")).toBeNull();
    // xG is missing at week 5, so its line has a gap from week 4 to week 6.
    expect(mark("xg")!.gaps).toHaveLength(1);
    expect(keys()).not.toContain("xg@5");
    expect(chart.marks().filter((m) => m.key.startsWith("goals@"))).toHaveLength(5);
  });

  it("starts at the first value, and ends at the last, with its end dot and label there: no gap before or after", () => {
    const { mark, line, keys } = setup({ data: [{ week: 1, goals: null, xg: 1 }, { week: 2, goals: 2, xg: 2 }, { week: 3, goals: 3, xg: 3 }, { week: 4, goals: null, xg: 4 }] });
    const goals = mark("goals")!;
    expect(goals.gaps).toBeUndefined();
    expect(goals.start).toEqual(mark("goals@2")!.center);
    expect(goals.end).toEqual(mark("goals@3")!.center);
    const end = line("goals").querySelector(".ec-end")!;
    expect([Number(end.getAttribute("cx")), Number(end.getAttribute("cy"))]).toEqual([goals.end.x, goals.end.y]);
    expect(line("goals").querySelector(".ec-end-label")!.textContent).toBe("3 goals");
    expect(keys().filter((key) => key.startsWith("goals@"))).toEqual(["goals@2", "goals@3"]);
  });

  it("makes one gap of two missing values in a row", () => {
    const { mark } = setup({ data: weeks.map((w) => (w.week === 4 ? { ...w, goals: null } : w)) });
    const goals = mark("goals")!;
    expect(goals.gaps).toHaveLength(1);
    expect(goals.path(goals.gaps![0]![1]).x).toBeCloseTo(mark("goals@5")!.center.x, 9);
  });

  it("shows the point of a value alone between gaps at rest, since it has no stroke, and no other", () => {
    const { mark, point } = setup({ data: weeks.map((w) => (w.week === 2 || w.week === 4 ? { ...w, goals: null } : w.week === 3 ? { ...w, goals: 3 } : w)) });
    // Goals at weeks 1 and 3 are alone; 5 and 6 make the one run.
    expect(runs(mark("goals")!.outline.d)).toHaveLength(1);
    expect(runs(mark("goals")!.outline.d)[0]).toHaveLength(2);
    expect(point("goals@1")!.classList.contains("ec-alone")).toBe(true);
    expect(point("goals@3")!.classList.contains("ec-alone")).toBe(true);
    expect(point("goals@5")!.classList.contains("ec-alone")).toBe(false);
    expect(point("xg@3")!.classList.contains("ec-alone")).toBe(false);
    expect(measurePath(mark("goals")!.outline.d).length).toBeCloseTo(Math.hypot(mark("goals@6")!.center.x - mark("goals@5")!.center.x, mark("goals@6")!.center.y - mark("goals@5")!.center.y), 2);
    // A line with no gaps has none alone, even with one row.
    const single = setup({ data: [{ week: 1, goals: 1, xg: 1 }] });
    expect(single.point("goals@1")!.classList.contains("ec-alone")).toBe(false);
  });

  it("draws an empty line for a series with no values: no stroke, end dot or label, and no samples", () => {
    const data = dataRecorder();
    const { mark, line, keys, chart } = setup({ data: weeks.map((w) => ({ ...w, goals: null })), on: { decorate: data.effect } });
    const goals = mark("goals")!;
    expect(goals.length).toBe(0);
    expect(line("goals").querySelector(".ec-end")!.getAttribute("visibility")).toBe("hidden");
    expect(line("goals").querySelector(".ec-end-label")!.getAttribute("visibility")).toBe("hidden");
    expect(data.latest.get("goals")!.samples).toEqual([]);
    expect(keys().filter((key) => key.startsWith("goals@"))).toEqual([]);
    expect(chart.labels().map((label) => label.key)).toEqual(["xg"]);
    // The xG line keeps its own label, where it would be without goals beside it.
    expect(line("xg").querySelector(".ec-end-label")!.getAttribute("visibility")).toBeNull();
    // With no values at all, the scale is 0 to 1 and every x is still a stop.
    const none = setup({ data: weeks.map((w) => ({ week: w.week, goals: null, xg: null })) });
    expect(none.chart.marks().map((m) => m.key)).toEqual(["goals", "xg"]);
    expect(none.svg.querySelectorAll(".ec-column:not([visibility])")).toHaveLength(6);
  });

  it("gives a line its values as samples, the missing ones left out, with gapBefore after each gap, and the row of its last value", () => {
    const data = dataRecorder();
    setup({ on: { decorate: data.effect } });
    const goals = data.latest.get("goals")!;
    expect(goals.samples.map((s) => [s.at, s.value, s.gapBefore === true])).toEqual([
      [1, 0, false],
      [2, 2, false],
      [4, 5, true],
      [5, 6, false],
      [6, 8, false]
    ]);
    expect(goals.datum).toBe(weeks[5]);
    const xg = data.latest.get("xg")!;
    expect(xg.samples.filter((s) => s.gapBefore).map((s) => s.at)).toEqual([6]);
  });
});

describe("lineChart with missing values: the reveal", () => {
  it("ends a line revealed into a gap at its last value, with its end label there, and goes on past it", () => {
    const data = dataRecorder();
    const { chart, line, mark } = setup({ on: { decorate: data.effect } });
    chart.reveal(2.5);
    expect(mark("goals")!.end).toEqual(mark("goals@2")!.center);
    expect(line("goals").querySelector(".ec-end-label")!.textContent).toBe("2 goals");
    expect(data.latest.get("goals")!.samples.map((s) => s.at)).toEqual([1, 2]);
    expect(data.latest.get("goals")!.datum).toBe(weeks[1]);
    // xG goes on part way to week 3.
    expect(data.latest.get("xg")!.samples.map((s) => s.at)).toEqual([1, 2, 2.5]);
    chart.reveal(3.5);
    expect(mark("goals")!.end).toEqual(mark("goals@2")!.center);
    // Past the gap's end the line goes on from the next value: a gap, then the new run's start.
    chart.reveal(4);
    expect(mark("goals")!.gaps).toHaveLength(1);
    expect(mark("goals")!.end).toEqual(mark("goals@4")!.center);
    expect(line("goals").querySelector(".ec-end-label")!.textContent).toBe("5 goals");
    chart.reveal(4.5);
    expect(runs(mark("goals")!.outline.d)[1]).toHaveLength(2);
    expect(data.latest.get("goals")!.samples.map((s) => [s.at, s.gapBefore === true])).toEqual([
      [1, false],
      [2, false],
      [4, true],
      [4.5, false]
    ]);
  });

  it("is empty when revealed before a line's first value", () => {
    const { chart, line, mark } = setup({ data: weeks.map((w) => (w.week <= 2 ? { ...w, goals: null } : w)) });
    chart.reveal(2.5);
    expect(mark("goals")!.length).toBe(0);
    expect(line("goals").querySelector(".ec-end")!.getAttribute("visibility")).toBe("hidden");
    chart.reveal(4);
    expect(line("goals").querySelector(".ec-end")!.getAttribute("visibility")).toBeNull();
    expect(mark("goals")!.start).toEqual(mark("goals@4")!.center);
  });
});

describe("lineChart with missing values: changes", () => {
  it("opens a gap as the change starts: the point leaves, and the stroke leaves it out from the first frame", async () => {
    const full = weeks.map((w) => ({ ...w, goals: w.goals ?? 3 }));
    const { chart, clock, mark, keys, settle } = setup({ data: full });
    expect(mark("goals")!.gaps).toBeUndefined();
    const events = listen(chart);
    const running = chart.update({ data: weeks });
    expect(events).toContain("exit goals@3");
    expect(events).toContain("update goals");
    clock.advance(16);
    expect(mark("goals")!.gaps).toHaveLength(1);
    await settle(running);
    expect(keys()).not.toContain("goals@3");
    expect(runs(mark("goals")!.outline.d)).toHaveLength(2);
  });

  it("closes a gap as the change starts: the point enters on the line across the gap, and moves to its value", async () => {
    const { chart, clock, mark, keys, settle } = setup();
    const events = listen(chart);
    const across = mark("goals")!;
    const [from, to] = across.gaps![0]!;
    const onTheLine = across.path((from + to) / 2);
    const running = chart.update({ data: weeks.map((w) => (w.week === 3 ? { ...w, goals: 6 } : w)) });
    expect(events).toContain("enter goals@3");
    clock.advance(16);
    expect(mark("goals")!.gaps).toBeUndefined();
    // Where the walk ran across the gap, at week 3's x, before it rises to 6.
    const start = mark("goals@3")!.center;
    expect(start.x).toBeCloseTo(onTheLine.x, 6);
    expect(start.y).toBeCloseTo(onTheLine.y, 0);
    await settle(running);
    expect(keys()).toContain("goals@3");
    expect(mark("goals@3")!.center.y).toBeLessThan(start.y);
    expect(runs(mark("goals")!.outline.d)).toHaveLength(1);
  });

  it("keeps a value's point as it moves, and a gap where the value stays missing", async () => {
    const { chart, mark, settle } = setup();
    await settle(chart.update({ data: weeks.map((w) => (w.week === 4 ? { ...w, goals: 7 } : w)) }));
    expect(mark("goals")!.gaps).toHaveLength(1);
    expect(mark("goals@4")).toBeDefined();
  });
});

describe("lineChart with missing values: a missing x", () => {
  it("stops the crosshair there, and the tooltip says which series is missing", () => {
    const { svg, column, mark } = setup();
    pointer("pointerover", column("3"));
    const crosshair = svg.querySelector(".ec-crosshair")!;
    expect(crosshair.getAttribute("visibility")).toBeNull();
    expect(Number(crosshair.getAttribute("x1"))).toBeCloseTo(mark("xg@3")!.center.x, 2);
    expect(tooltipText()).toEqual(["3", "goals missing · 3.6 xg"]);
  });

  it("names the x with each value, saying which is missing, and gives markLabel only the values it has", () => {
    const summaries: unknown[] = [];
    const plain = setup({ seriesLabels: { xg: "xG" } });
    expect(plain.column("3").getAttribute("aria-label")).toBe("3: goals missing, 3.6 xG");
    expect(plain.column("5").getAttribute("aria-label")).toBe("5: 6 goals, xG missing");
    expect(plain.column("4").getAttribute("aria-label")).toBe("4: 5 goals, 4.4 xG");
    const worded = setup({
      markLabel: (d, m) => {
        summaries.push(m);
        return `Week ${d.week}`;
      }
    });
    expect(worded.column("3").getAttribute("aria-label")).toBe("Week 3");
    expect(summaries[2]).toMatchObject({ key: "3", category: "3", values: [{ series: "xg", label: "xg", value: 3.6 }], total: 3.6, text: "3: goals missing, 3.6 xg" });
  });

  it("says missing in the table", () => {
    const { container } = setup();
    expect(tableRows(container)).toEqual([
      ["1", "0", "1.2"],
      ["2", "2", "2.1"],
      ["3", "missing", "3.6"],
      ["4", "5", "4.4"],
      ["5", "6", "missing"],
      ["6", "8", "6"]
    ]);
  });

  it("keeps an x with every value missing a stop: the crosshair, its name, the tooltip at the crosshair's top, and the table", () => {
    const { svg, column, container, chart } = setup({ data: weeks.map((w) => (w.week === 3 ? { week: 3, goals: null, xg: null } : w)) });
    const events = listen(chart);
    expect(column("3").getAttribute("aria-label")).toBe("3: goals missing, xg missing");
    pointer("pointerover", column("3"));
    expect(events).toEqual([]);
    const crosshair = svg.querySelector(".ec-crosshair")!;
    expect(crosshair.getAttribute("visibility")).toBeNull();
    const hit = column("3").querySelector(".ec-hit")!;
    const two = Number(column("2").querySelector(".ec-hit")!.getAttribute("x")) + Number(column("2").querySelector(".ec-hit")!.getAttribute("width"));
    expect(Number(hit.getAttribute("x"))).toBeCloseTo(two, 6);
    expect(Number(crosshair.getAttribute("x1"))).toBeGreaterThan(Number(hit.getAttribute("x")));
    expect(tooltipText()).toEqual(["3", "goals missing · xg missing"]);
    expect(tableRows(container)[2]).toEqual(["3", "missing", "missing"]);
  });

  it("still throws on NaN and the infinities, and on a value that isn't a number", () => {
    expect(() => setup({ data: [{ week: 1, goals: Number.NaN }] })).toThrow(/"goals" for "1" must be a finite number, or null or undefined where it has no value, got NaN/);
    expect(() => setup({ data: [{ week: 1, goals: -Infinity }] })).toThrow(/got -Infinity/);
    expect(() => setup({ data: [{ week: 1, goals: "3" as unknown as number }] })).toThrow(/got "3"/);
  });
});

describe("lineChart with missing values: types", () => {
  it("takes a field of number | null, or an optional number, as a series", () => {
    interface Day {
      day: Date;
      visits: number | null;
      average?: number;
      note: string;
    }
    const container = document.body.appendChild(document.createElement("div"));
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: createMotion({ mode: "off" }), clock: manualClock() };
    const days: Day[] = [
      { day: new Date(Date.UTC(2026, 0, 1)), visits: 3, average: 3, note: "" },
      { day: new Date(Date.UTC(2026, 0, 2)), visits: null, note: "" },
      { day: new Date(Date.UTC(2026, 0, 3)), visits: 5, average: 4, note: "" }
    ];
    const chart = lineChart<Day>(container, { label: "Visits", data: days, x: "day", series: ["visits", "average"], width: 600 }, env);
    expect(chart.marks()[0]!.gaps).toHaveLength(1);
    // @ts-expect-error A field of strings isn't a series.
    expect(() => lineChart<Day>(container, { label: "Visits", data: days, x: "day", series: ["note"], width: 600 }, env)).toThrow(RangeError);
  });
});
