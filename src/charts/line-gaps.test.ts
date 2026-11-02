// lineChart with missing values: a null or undefined value is a gap in its line, with no point,
// while its x stays a stop whose name, tooltip and table say the series is missing there.

import { createMotion, manualClock, type DataEffect, type MarkData, type MarkGeometry } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { measurePath, play } from "../core/testing";
import { barChart } from "./bar";
import { donutChart } from "./donut";
import { lineChart } from "./line";
import { themes } from "./render/theme";
import type { ChartEnv } from "./shell/setup";
import type { LineChart, LineChartOptions, MarkSummary } from "./types";

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
/** The same weeks with nothing counted in week 3. */
const blankWeek3: Week[] = weeks.map((w) => (w.week === 3 ? { week: 3, goals: null, xg: null } : w));

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
const press = (target: Element, key: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
/** Tab into the chart: a key press, then focus lands on the column Tab reaches. */
function tabTo(target: SVGElement): void {
  press(document.body, "Tab");
  target.focus();
}
const tooltipText = () => Array.from(document.querySelector(".ec-tooltip")!.children, (line) => line.textContent);

/** A property's colour on an element, its var() read from the custom properties the element inherits. */
function colorOf(element: Element, property: string): string {
  const style = getComputedStyle(element);
  const value = style.getPropertyValue(property).trim();
  const token = /^var\((--[\w-]+),\s*(.+)\)$/.exec(value);
  return token ? style.getPropertyValue(token[1]!).trim() || token[2]! : value;
}

/** WCAG 2 contrast between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const tableRows = (container: Element) => Array.from(container.querySelectorAll(".ec-table tbody tr"), (tr) => Array.from(tr.children, (cell) => cell.textContent));

/** A 64-bit hash of the text (cyrb53's mixing, both halves kept), as 16 hex digits, as line-curve.test.ts has it. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/**
 * What charts with missing values say, as digests, each given `more` options as well: every name,
 * description, tooltip line, table cell and announcement in the container, at rest, with an x
 * hovered, after an update that the live region announces, and with focus on an x with every value
 * missing; and `markLabel`'s default text. Words alone, which are all `missing` changes, so other
 * steps that move what the chart draws leave them be. They hold no px, so there's nothing to round.
 */
async function wording(more: Partial<LineChartOptions<Week>>): Promise<Record<string, string>> {
  const markup = (container: Element): string =>
    JSON.stringify({
      names: Array.from(container.querySelectorAll("[aria-label]"), (element) => element.getAttribute("aria-label")),
      descriptions: Array.from(container.querySelectorAll("desc"), (desc) => desc.textContent),
      tooltip: Array.from(container.querySelector(".ec-tooltip")?.children ?? [], (line) => line.textContent),
      table: Array.from(container.querySelectorAll(".ec-table summary, .ec-table caption, .ec-table tr"), (part) =>
        part instanceof HTMLTableRowElement ? Array.from(part.cells, (cell) => cell.textContent) : part.textContent
      ),
      announced: container.querySelector(".ec-announcer")?.textContent ?? null
    });
  const out: Record<string, string> = {};
  const patchy = setup({ seriesLabels: { xg: "xG" }, announce: true, tooltip: true, ...more });
  out["at rest"] = hash(markup(patchy.container));
  pointer("pointerover", patchy.column("3"));
  out["week 3 hovered"] = hash(markup(patchy.container));
  pointer("pointerover", patchy.column("5"));
  out["week 5 hovered"] = hash(markup(patchy.container));
  pointer("pointerleave", patchy.svg);
  await patchy.settle(patchy.chart.update({ data: weeks.map((w) => (w.week === 4 ? { ...w, goals: null } : w)) }));
  out["week 4 gone missing"] = hash(markup(patchy.container));
  const blank = setup({ data: blankWeek3, ...more });
  tabTo(blank.column("3"));
  out["week 3 blank, focused"] = hash(markup(blank.container));
  const texts: string[] = [];
  setup({
    data: blankWeek3,
    markLabel: (_d, mark) => {
      texts.push(mark.text);
      return "";
    },
    ...more
  });
  out["markLabel's text"] = hash(texts.join("\n"));
  return out;
}

/** The digests main (2d84d47) gave, with this file's wording() run there, before `missing` came in. */
const MAIN_WORDING: Readonly<Record<string, string>> = {
  "at rest": "11e06c969ae185ac",
  "week 3 hovered": "15a35acd18f1f17f",
  "week 5 hovered": "a1b533c76327127f",
  "week 4 gone missing": "6430504914f55933",
  "week 3 blank, focused": "f0c101c718c75a15",
  "markLabel's text": "4ea4e8c03ceccde8"
};

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
    const { svg, column, container, chart } = setup({ data: blankWeek3 });
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

  it("shows keyboard focus there with no point to ring: a 2 px line where the crosshair is, in the focus colour, at 3:1 or more in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const { svg, column, container } = setup({ data: blankWeek3 });
      container.setAttribute("data-theme", theme);
      tabTo(column("3"));
      const ring = svg.querySelector(".ec-focus")!;
      expect(ring.getAttribute("visibility")).toBeNull();
      expect(Array.from(ring.children, (child) => child.getAttribute("class"))).toEqual(["ec-focus-ring"]);
      const line = ring.querySelector("line")!;
      const crosshair = svg.querySelector(".ec-crosshair")!;
      for (const end of ["x1", "y1", "x2", "y2"]) expect(line.getAttribute(end)).toBe(crosshair.getAttribute(end));
      expect(line.getAttribute("stroke-width")).toBe("2");
      const stroke = colorOf(line, "stroke");
      expect(stroke).toBe(themes[theme].focus);
      expect(contrast(stroke, colorOf(line, "--ec-surface")), theme).toBeGreaterThanOrEqual(3);
      document.body.textContent = "";
    }
  });

  it("keeps that line after Escape hides the crosshair and tooltip, rings the points instead at an x with values, and draws nothing for the pointer", () => {
    const { svg, column } = setup({ data: blankWeek3 });
    const ring = svg.querySelector(".ec-focus")!;
    const crosshair = svg.querySelector(".ec-crosshair")!;
    const children = () => Array.from(ring.children, (child) => child.tagName);
    pointer("pointerover", column("3"));
    expect(crosshair.getAttribute("visibility")).toBeNull();
    expect(ring.getAttribute("visibility")).toBe("hidden");
    pointer("pointerleave", svg);

    tabTo(column("3"));
    expect(children()).toEqual(["line"]);
    press(column("3"), "Escape");
    expect(crosshair.getAttribute("visibility")).toBe("hidden");
    expect(document.querySelector(".ec-tooltip")!.classList.contains("ec-tooltip-shown")).toBe(false);
    expect(ring.getAttribute("visibility")).toBeNull();
    expect(children()).toEqual(["line"]);
    press(column("3"), "ArrowRight");
    expect(children()).toEqual(["g", "g"]);
    press(column("4"), "ArrowLeft");
    expect(children()).toEqual(["line"]);
    column("3").blur();
    expect(ring.getAttribute("visibility")).toBe("hidden");
  });

  it("moves the line with its x, and gives way to rings when the values come back", async () => {
    const { svg, column, chart, settle } = setup({ data: blankWeek3 });
    const line = () => svg.querySelector(".ec-focus line");
    tabTo(column("3"));
    const before = Number(line()!.getAttribute("x1"));
    await settle(chart.update({ width: 400 }));
    expect(Number(line()!.getAttribute("x1"))).toBeLessThan(before);
    expect(line()!.getAttribute("x1")).toBe(svg.querySelector(".ec-crosshair")!.getAttribute("x1"));
    await settle(chart.update({ data: weeks }));
    expect(line()).toBeNull();
    expect(svg.querySelectorAll(".ec-focus > g")).toHaveLength(1);
    await settle(chart.update({ data: blankWeek3 }));
    expect(line()).not.toBeNull();
    expect(svg.querySelectorAll(".ec-focus > g")).toHaveLength(0);
  });

  it("still throws on NaN and the infinities, and on a value that isn't a number", () => {
    expect(() => setup({ data: [{ week: 1, goals: Number.NaN }] })).toThrow(/"goals" for "1" must be a finite number, or null or undefined where it has no value, got NaN/);
    expect(() => setup({ data: [{ week: 1, goals: -Infinity }] })).toThrow(/got -Infinity/);
    expect(() => setup({ data: [{ week: 1, goals: "3" as unknown as number }] })).toThrow(/got "3"/);
  });
});

describe("lineChart with missing values: the word for one", () => {
  /** The tooltip's lines in a chart's container. */
  const tip = (container: Element) => Array.from(container.querySelector(".ec-tooltip")!.children, (line) => line.textContent);

  it("says `missing` in the table's cells, and after the series' label in the names, the tooltip and markLabel's text", () => {
    const summaries: MarkSummary[] = [];
    const { column, container } = setup({
      missing: "no data",
      seriesLabels: { xg: "xG" },
      markLabel: (_d, mark) => {
        summaries.push(mark);
        return "";
      }
    });
    expect(column("3").getAttribute("aria-label")).toBe("3: goals no data, 3.6 xG");
    expect(column("5").getAttribute("aria-label")).toBe("5: 6 goals, xG no data");
    expect(summaries.map((mark) => mark.text)).toEqual(["1: 0 goals, 1.2 xG", "2: 2 goals, 2.1 xG", "3: goals no data, 3.6 xG", "4: 5 goals, 4.4 xG", "5: 6 goals, xG no data", "6: 8 goals, 6 xG"]);
    pointer("pointerover", column("3"));
    expect(tip(container)).toEqual(["3", "goals no data · 3.6 xG"]);
    expect(tableRows(container)).toEqual([
      ["1", "0", "1.2"],
      ["2", "2", "2.1"],
      ["3", "no data", "3.6"],
      ["4", "5", "4.4"],
      ["5", "6", "no data"],
      ["6", "8", "6"]
    ]);

    const blank = setup({ data: blankWeek3, missing: "no data" });
    expect(blank.column("3").getAttribute("aria-label")).toBe("3: goals no data, xg no data");
    tabTo(blank.column("3"));
    expect(tip(blank.container)).toEqual(["3", "goals no data · xg no data"]);
    expect(tableRows(blank.container)[2]).toEqual(["3", "no data", "no data"]);
  });

  it("names in an announcement the x's an update changed, and says the word in their names, which a screen reader reads on focus", async () => {
    const { chart, column, container, settle } = setup({ missing: "no data", announce: true });
    await settle(chart.update({ data: weeks.map((w) => (w.week === 4 ? { ...w, goals: null } : w)) }));
    expect(container.querySelector(".ec-announcer")!.textContent).toBe("4 changed");
    expect(column("4").getAttribute("aria-label")).toBe("4: goals no data, 4.4 xg");
  });

  it("words them again on update({ missing }), the tooltip as it shows, and goes back to the default without one", async () => {
    const { chart, column, container, settle } = setup();
    const events = listen(chart);
    pointer("pointerover", column("3"));
    expect(tip(container)).toEqual(["3", "goals missing · 3.6 xg"]);
    await settle(chart.update({ missing: "not counted" }));
    expect(column("3").getAttribute("aria-label")).toBe("3: goals not counted, 3.6 xg");
    expect(tip(container)).toEqual(["3", "goals not counted · 3.6 xg"]);
    expect(tableRows(container)[4]).toEqual(["5", "6", "not counted"]);
    // Words alone: nothing enters, updates or leaves.
    expect(events).toEqual(["hover xg@3"]);
    await settle(chart.update({ missing: undefined }));
    expect(column("3").getAttribute("aria-label")).toBe("3: goals missing, 3.6 xg");
    expect(tip(container)).toEqual(["3", "goals missing · 3.6 xg"]);
    expect(tableRows(container)[4]).toEqual(["5", "6", "missing"]);
  });

  it("words them by default as main did, byte for byte, and the same with missing: \"missing\"", async () => {
    expect(await wording({})).toEqual(MAIN_WORDING);
    expect(await wording({ missing: "missing" })).toEqual(MAIN_WORDING);
  });

  it("throws a TypeError on a word that's empty or isn't a string, as the chart is made, and update() rejects it, changing nothing", async () => {
    for (const [missing, got] of [
      ["", '""'],
      ["  ", '"  "'],
      [0, "0"],
      [null, "null"]
    ] as const) {
      expect(() => setup({ missing: missing as string })).toThrow(new TypeError(`lineChart: missing must be a word for a missing value, such as "no data", got ${got}.`));
    }
    expect(document.querySelectorAll("svg")).toHaveLength(0);
    const { chart, column, container } = setup({ missing: "no data" });
    await expect(chart.update({ missing: " " })).rejects.toThrow(TypeError);
    await expect(chart.update({ missing: 7 as unknown as string })).rejects.toThrow(/got 7\./);
    expect(column("3").getAttribute("aria-label")).toBe("3: goals no data, 3.6 xg");
    expect(tableRows(container)[2]).toEqual(["3", "no data", "3.6"]);
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

  it("takes `missing` on lineChart, but not on barChart or donutChart, which have no missing values", () => {
    const container = document.body.appendChild(document.createElement("div"));
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: createMotion({ mode: "off" }), clock: manualClock() };
    expect(lineChart<Week>(container, { label: "Goals", data: weeks, x: "week", series: ["goals"], missing: "no data" }, env).element.isConnected).toBe(true);
    const bars = () =>
      barChart<Week>(
        container,
        {
          label: "Weeks",
          data: weeks,
          x: (d) => String(d.week),
          y: "week",
          // @ts-expect-error A bar chart has no missing values.
          missing: "no data"
        },
        env
      );
    const slices = () =>
      donutChart<Week>(
        container,
        {
          label: "Weeks",
          data: weeks,
          category: (d) => String(d.week),
          value: "week",
          // @ts-expect-error Nor has a donut.
          missing: "no data"
        },
        env
      );
    expect([bars, slices].every((make) => typeof make === "function")).toBe(true);
  });
});
