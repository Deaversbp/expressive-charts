import { createMotion, manualClock, type DataEffect, type EffectContext, type GeometryEffect, type MarkData, type MarkGeometry, type MotionMode } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { lineChart } from "./line";
import type { ChartEnv } from "./shell/setup";
import type { LineChart, LineChartOptions } from "./types";

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

/** A motion whose device never asks for reduced motion. */
function quietMotion(mode: MotionMode = "presentation") {
  return createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
}

function setup(options: Partial<LineChartOptions<Week>> = {}, more: Partial<ChartEnv> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const clock = manualClock();
  const presets = createRegistry<PresetFactory>({ kind: "preset" });
  const env: ChartEnv = { presets, icons: { get: () => undefined }, motion: quietMotion(), clock, ...more };
  const chart = lineChart<Week>(container, { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 600, ...options }, env);
  const svg = chart.element;
  const line = (series: string) => svg.querySelector(`.ec-line[data-key="${series}"]`) as SVGGElement;
  const point = (key: string) => svg.querySelector(`.ec-point[data-key="${key}"]`) as SVGGElement;
  const column = (key: string) => svg.querySelector(`.ec-column[data-key="${key}"]`) as SVGGElement;
  const keys = () => chart.marks().map((mark) => mark.key);
  /** Plays the clock until the update settles. */
  const settle = (running: Promise<unknown>) => play(clock, running);
  return { container, chart, svg, clock, env, presets, line, point, column, keys, settle };
}

function pointer(type: string, target: Element, pointerType = "mouse"): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType }));
}

function tap(target: Element): void {
  pointer("pointerdown", target, "touch");
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

/** A key press on `target`. The document hears it first, as it would in a browser. */
function press(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/** Tab into the chart: a key press, then focus lands on the column Tab reaches. */
function tabTo(target: SVGElement): void {
  press(document.body, "Tab");
  target.focus();
}

/** An effect that logs what the runner does with it. */
function recorder(draw?: (mark: MarkGeometry, ctx: EffectContext) => void) {
  const log: string[] = [];
  const effect: GeometryEffect = {
    kind: "geometry",
    run(mark, ctx) {
      log.push(ctx.previous ? `run ${mark.key} from ${ctx.previous.outline.d}` : `run ${mark.key}`);
      ctx.onChange((moved) => log.push(`change ${moved.key}`));
      draw?.(mark, ctx);
      return Promise.resolve();
    },
    end(mark) {
      log.push(`end ${mark.key}`);
    },
    clear() {
      log.push("clear");
    }
  };
  return { effect, log };
}

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

/** Records every mark event as "enter goals", "hover xg@3 keyboard 1/2" and so on. */
function listen(chart: LineChart<Week>) {
  const events: string[] = [];
  chart.on("enter", (e) => events.push(`enter ${e.mark.key}`));
  chart.on("update", (e) => events.push(`update ${e.mark.key}`));
  chart.on("exit", (e) => events.push(`exit ${e.mark.key}`));
  chart.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source} ${e.batch.index + 1}/${e.batch.count}`));
  chart.on("leave", (e) => events.push(`leave ${e.mark.key}`));
  return events;
}

afterEach(() => {
  document.body.textContent = "";
  vi.restoreAllMocks();
});

describe("lineChart: drawing", () => {
  it("draws a line per series from describe.line and a point per row and series, behind the x's columns", () => {
    const { svg, chart, line, point, keys } = setup();
    expect(svg.getAttribute("class")).toBe("ec-chart ec-line-chart");
    expect(Array.from(svg.children, (child) => child.getAttribute("class"))).toEqual(["ec-grid", "ec-axis", "ec-crosshair", "ec-focus", "ec-marks", "ec-columns", "ec-overlay"]);
    expect(keys()).toEqual(["goals", "xg", "goals@1", "xg@1", "goals@2", "xg@2", "goals@3", "xg@3", "goals@4", "xg@4"]);
    const [goals] = chart.marks();
    const stroke = line("goals").querySelector(".ec-body > .ec-stroke")!;
    expect(stroke.getAttribute("d")).toBe(goals!.outline.d);
    expect(stroke.getAttribute("stroke-width")).toBe("2.25");
    // Butt caps, SVG's default, so a coloured part ends exactly at its data.
    expect(stroke.getAttribute("stroke-linecap")).toBeNull();
    expect(goals!.thickness).toBe(2.25);
    expect(goals!.outline.closed).toBe(false);
    const dot = chart.marks().find((mark) => mark.key === "goals@3")!;
    expect(dot).toMatchObject({ series: "goals", length: 0, thickness: 9 });
    expect(point("goals@3").querySelector(".ec-body > .ec-dot")!.getAttribute("d")).toBe(dot.outline.d);
  });

  it("is 300 px high, with gridlines from 0, ticks on both axes and an end dot and label per line", () => {
    const { svg, line, chart } = setup();
    expect(svg.getAttribute("viewBox")).toBe("0 0 600 300");
    expect(Array.from(svg.querySelectorAll(".ec-grid line"), (l) => l.getAttribute("class"))).toEqual(["ec-baseline", "ec-gridline", "ec-gridline", "ec-gridline"]);
    // The values' ticks, then x's.
    expect(Array.from(svg.querySelectorAll(".ec-axis .ec-tick"), (t) => t.textContent)).toEqual(["0", "2", "4", "6", "1", "2", "3", "4"]);
    const goals = chart.marks()[0]!;
    const end = line("goals").querySelector(".ec-end")!;
    // Attributes are written to 0.001 px.
    expect(Number(end.getAttribute("cx"))).toBeCloseTo(goals.end.x, 3);
    expect(Number(end.getAttribute("cy"))).toBeCloseTo(goals.end.y, 3);
    expect(end.getAttribute("r")).toBe("4.5");
    expect(line("goals").querySelector(".ec-end-label")!.textContent).toBe("5 goals");
    expect(line("xg").querySelector(".ec-end-label")!.textContent).toBe("4.4 xg");
  });

  it("keeps end labels 16 px apart, around where they'd sit", () => {
    const apart = setup();
    const y = (chart: ReturnType<typeof setup>, series: string) => Number(chart.line(series).querySelector(".ec-end-label")!.getAttribute("y"));
    const end = (chart: ReturnType<typeof setup>, series: string) => chart.chart.marks().find((mark) => mark.key === series)!.end.y;
    // 5 goals and 4.4 xG end 25.6 px apart on a 0–6 scale 256 px tall: each label is centred on its line.
    expect(y(apart, "goals")).toBeCloseTo(end(apart, "goals") + 12.5 * 0.36, 3);
    expect(y(apart, "xg")).toBeCloseTo(end(apart, "xg") + 12.5 * 0.36, 3);
    // 4.9 xG ends 4.3 px from 5 goals: they move apart equally.
    const close = setup({ data: weeks.map((w) => (w.week === 4 ? { ...w, xg: 4.9 } : w)) });
    expect(y(close, "xg") - y(close, "goals")).toBeCloseTo(16, 2);
    expect((y(close, "xg") + y(close, "goals")) / 2).toBeCloseTo((end(close, "xg") + end(close, "goals")) / 2 + 12.5 * 0.36, 2);
  });

  it("words end labels with labels, or shows none with labels: false", () => {
    const off = setup({ labels: false });
    expect(off.line("goals").querySelector(".ec-end-label")!.getAttribute("visibility")).toBe("hidden");
    const own = setup({ labels: (value, series, format) => `${format(value)} ${series === "xg" ? "xG" : "goals"}!` });
    expect(own.line("xg").querySelector(".ec-end-label")!.textContent).toBe("4.4 xG!");
  });

  it("keeps the default end label when labels throws, and reports it once", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});
    const { line, chart } = setup({
      labels: () => {
        throw new Error("no label");
      }
    });
    expect(line("goals").querySelector(".ec-end-label")!.textContent).toBe("5 goals");
    chart.reveal(2.5);
    chart.reveal(3);
    expect(reported).toHaveBeenCalledTimes(1);
  });

  it("formats values, ticks and end labels, and describes the chart", () => {
    const { svg, line } = setup({ format: (v) => `${v}!`, description: "A season" });
    expect(svg.querySelector(":scope > desc")?.textContent).toBe("A season");
    expect(svg.querySelector(".ec-axis .ec-tick")?.textContent).toBe("0!");
    expect(line("goals").querySelector(".ec-end-label")!.textContent).toBe("5! goals");
  });

  it("colours each series through its ColorAssignment, pinned or in order", () => {
    const { line, point } = setup({ colors: { xg: 2, goals: 1 } });
    expect(line("goals").style.getPropertyValue("--ec-mark")).toBe("var(--ec-series-1, #2a78d6)");
    expect(line("xg").style.getPropertyValue("--ec-mark")).toBe("var(--ec-series-2, #eb6834)");
    expect(point("xg@2").style.getPropertyValue("--ec-mark")).toBe("var(--ec-series-2, #eb6834)");
  });

  it("throws on what it can't draw, leaving nothing behind", () => {
    const container = document.body.appendChild(document.createElement("div"));
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: quietMotion(), clock: manualClock() };
    const make = (options: Partial<LineChartOptions<Week>>) => () => lineChart<Week>(container, { label: "Bad", data: weeks, x: "week", series: ["goals"], ...options }, env);
    expect(make({ data: [...weeks, { week: 2, goals: 9, xg: 9 }], key: (_d, i) => i })).toThrow(/the rows "1" and "4" have the same x, 2/);
    expect(make({ data: [{ week: 1, goals: Number.NaN, xg: 0 }] })).toThrow(/"goals" for "1" must be a finite number/);
    expect(make({ series: [] })).toThrow(/needs series/);
    expect(make({ label: "" })).toThrow(/needs a label/);
    expect(container.childElementCount).toBe(0);
  });

  it("draws nothing for no data, and no lines", () => {
    const { chart, svg } = setup({ data: [] });
    expect(chart.marks()).toEqual([]);
    expect(svg.querySelectorAll(".ec-line, .ec-point, .ec-column")).toHaveLength(0);
    expect(() => chart.reveal(3)).not.toThrow();
  });
});

describe("lineChart: reveal", () => {
  it("ends each line at x, part way between rows, with no events, and hides the x's past it", () => {
    const decorate = recorder();
    const { chart, svg, column, point } = setup({ on: { decorate: decorate.effect } });
    const events = listen(chart);
    decorate.log.length = 0;
    const full = chart.marks()[0]!.outline.d;
    chart.reveal(2.5);
    expect(events).toEqual([]);
    const goals = chart.marks()[0]!;
    expect(goals.outline.d).not.toBe(full);
    // Halfway from week 2 (2 goals) to week 3 (3 goals).
    expect(chart.element.querySelector('.ec-line[data-key="goals"] .ec-end-label')!.textContent).toBe("3 goals");
    expect(chart.marks().map((mark) => mark.key)).toEqual(["goals", "xg", "goals@1", "xg@1", "goals@2", "xg@2"]);
    expect(column("3").getAttribute("visibility")).toBe("hidden");
    expect(column("2").getAttribute("visibility")).toBeNull();
    expect(point("goals@3").getAttribute("visibility")).toBe("hidden");
    // Decorations follow the lines only: the points didn't move.
    expect(decorate.log).toEqual(["change goals", "change xg"]);
    expect(svg.querySelectorAll(".ec-column:not([visibility])")).toHaveLength(2);
  });

  it("gives each line the row at its revealed end and samples up to x", () => {
    const data = dataRecorder();
    const { chart } = setup({ on: { decorate: data.effect } });
    chart.reveal(2.5);
    const goals = data.latest.get("goals")!;
    expect(goals.datum).toBe(weeks[1]);
    expect(goals.samples.map((s) => [s.value, s.at])).toEqual([
      [0, 1],
      [2, 2],
      [2.5, 2.5]
    ]);
    expect(goals.samples[2]!.t).toBe(1);
    expect(goals.related("xg")!.samples.map((s) => s.value)).toEqual([1.2, 2.1, expect.closeTo(2.85, 9)]);
  });

  it("clamps to the rows' range: everything by default and past the end, the first point before the start", () => {
    const { chart, keys } = setup();
    const full = chart.marks()[0]!.outline.d;
    chart.reveal(-10);
    expect(keys()).toEqual(["goals", "xg", "goals@1", "xg@1"]);
    expect(chart.marks()[0]!.length).toBe(0);
    chart.reveal(100);
    expect(chart.marks()[0]!.outline.d).toBe(full);
    chart.reveal(Infinity);
    expect(keys()).toHaveLength(10);
    expect(() => chart.reveal(Number.NaN)).toThrow(/reveal\(x\) needs a number, got NaN/);
  });

  it("keeps the reveal across update(): a row added past it stays hidden until it's revealed", async () => {
    const { chart, keys, settle } = setup();
    chart.reveal(3);
    await settle(chart.update({ data: [...weeks, { week: 5, goals: 6, xg: 5 }] }));
    expect(keys()).toEqual(["goals", "xg", "goals@1", "xg@1", "goals@2", "xg@2", "goals@3", "xg@3"]);
    chart.reveal(Infinity);
    expect(keys()).toContain("xg@5");
  });

  it("moves focus to the nearest revealed x when the focused one is hidden, and ends a hover past it", () => {
    const { chart, column } = setup();
    const events = listen(chart);
    tabTo(column("4"));
    expect(events).toEqual(["hover goals@4 keyboard 1/2", "hover xg@4 keyboard 2/2"]);
    events.length = 0;
    chart.reveal(2.5);
    expect(document.activeElement).toBe(column("2"));
    expect(events).toEqual(["leave goals@4", "leave xg@4", "hover goals@2 keyboard 1/2", "hover xg@2 keyboard 2/2"]);
    expect(column("4").getAttribute("tabindex")).toBeNull();
  });

  it("hides what effects draw on the points past it", () => {
    const decorate = recorder((mark, ctx) => {
      if (mark.length === 0) ctx.layer.path(`M${mark.center.x},${mark.center.y}h1`, { stroke: "mark" });
    });
    const { chart, svg } = setup({ on: { decorate: decorate.effect } });
    chart.reveal(3);
    const hidden = Array.from(svg.querySelectorAll(".ec-overlay > .ec-run[visibility='hidden']"), (g) => g.getAttribute("data-key"));
    expect(hidden).toEqual(["goals@4", "xg@4"]);
    chart.reveal(4);
    expect(svg.querySelectorAll(".ec-overlay > .ec-run[visibility='hidden']")).toHaveLength(0);
  });

  it("shows what effects draw on a point that comes back revealed, after it went while hidden", async () => {
    const decorate = recorder((mark, ctx) => {
      if (mark.length === 0) ctx.layer.path(`M${mark.center.x},${mark.center.y}h1`, { stroke: "mark" });
    });
    const { chart, svg, settle } = setup({ on: { decorate: decorate.effect } });
    chart.reveal(3);
    // Week 4 goes while it's hidden, the reveal moves past where it was, and it comes back.
    await settle(chart.update({ data: weeks.slice(0, 3) }));
    expect(svg.querySelector('.ec-point[data-key="goals@4"]')).toBeNull();
    chart.reveal(Infinity);
    await settle(chart.update({ data: weeks }));
    expect(chart.marks().map((mark) => mark.key)).toContain("goals@4");
    expect(svg.querySelector('.ec-point[data-key="goals@4"]')!.getAttribute("visibility")).toBeNull();
    expect(Array.from(svg.querySelectorAll('.ec-overlay > .ec-run[data-key$="@4"]'), (g) => g.getAttribute("visibility"))).toEqual([null, null]);
  });
});

describe("lineChart: hover", () => {
  it("hovers every series' point at the x under the pointer, in one batch, without dimming", () => {
    const hover = recorder();
    const { chart, svg, column, point } = setup({ on: { hover: hover.effect } });
    const events = listen(chart);
    pointer("pointerover", column("3").querySelector(".ec-hit")!);
    expect(events).toEqual(["hover goals@3 pointer 1/2", "hover xg@3 pointer 2/2"]);
    expect(hover.log).toEqual(["run goals@3", "run xg@3"]);
    expect(point("goals@3").classList.contains("ec-hot")).toBe(true);
    expect(point("xg@3").classList.contains("ec-hot")).toBe(true);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    pointer("pointerleave", svg);
    expect(events.slice(2)).toEqual(["leave goals@3", "leave xg@3"]);
    expect(point("goals@3").classList.contains("ec-hot")).toBe(false);
  });

  it("draws a dashed crosshair at the x and the tooltip above its highest point", () => {
    const { chart, svg, column } = setup();
    pointer("pointerover", column("3"));
    const goals = chart.marks().find((mark) => mark.key === "goals@3")!;
    const crosshair = svg.querySelector(".ec-crosshair")!;
    expect(crosshair.getAttribute("visibility")).toBeNull();
    expect(Number(crosshair.getAttribute("x1"))).toBe(goals.center.x);
    const tip = document.querySelector(".ec-tooltip")!;
    expect(Array.from(tip.children, (line) => line.textContent)).toEqual(["3", "3 goals · 3.6 xg"]);
    expect(tip.classList.contains("ec-tooltip-shown")).toBe(true);
    pointer("pointerleave", svg);
    expect(crosshair.getAttribute("visibility")).toBe("hidden");
  });

  it("gives each revealed x a hit column halfway to its neighbours, the last reaching the right edge", () => {
    const { chart, column } = setup();
    const x = (key: string) => chart.marks().find((mark) => mark.key === `goals@${key}`)!.center.x;
    const hit = (key: string) => column(key).querySelector(".ec-hit")!;
    expect(Number(hit("1").getAttribute("x"))).toBe(0);
    expect(Number(hit("2").getAttribute("x"))).toBeCloseTo((x("1") + x("2")) / 2, 3);
    expect(Number(hit("4").getAttribute("x")) + Number(hit("4").getAttribute("width"))).toBeCloseTo(600, 3);
    chart.reveal(2);
    expect(Number(hit("2").getAttribute("x")) + Number(hit("2").getAttribute("width"))).toBeCloseTo(600, 3);
  });

  it("treats a tap as hover until a tap elsewhere", () => {
    const { chart, column } = setup();
    const events = listen(chart);
    tap(column("2"));
    expect(events).toEqual(["hover goals@2 touch 1/2", "hover xg@2 touch 2/2"]);
    tap(column("4"));
    expect(events.slice(2)).toEqual(["leave goals@2", "leave xg@2", "hover goals@4 touch 1/2", "hover xg@4 touch 2/2"]);
  });

  it("does nothing for dim, since every series is read at once", () => {
    const { svg, column } = setup({ dim: true });
    pointer("pointerover", column("2"));
    expect(svg.classList.contains("ec-hovering")).toBe(false);
  });
});

describe("lineChart: keyboard", () => {
  const tabIndexes = (svg: SVGSVGElement) => Array.from(svg.querySelectorAll(".ec-columns > .ec-column"), (g) => `${g.getAttribute("data-key")} ${g.getAttribute("tabindex")}`);
  const focused = () => document.activeElement?.getAttribute("data-key");

  it("is one tab stop: the arrows go x by x, Home and End to the ends, with no wrap-around", () => {
    const { svg, column } = setup();
    expect(tabIndexes(svg)).toEqual(["1 0", "2 -1", "3 -1", "4 -1"]);
    tabTo(column("1"));
    const steps: [string, string][] = [
      ["ArrowRight", "2"],
      ["ArrowDown", "3"],
      ["End", "4"],
      ["ArrowRight", "4"],
      ["ArrowLeft", "3"],
      ["ArrowUp", "2"],
      ["Home", "1"],
      ["ArrowLeft", "1"]
    ];
    for (const [key, expected] of steps) {
      const event = press(document.activeElement!, key);
      expect([key, focused(), event.defaultPrevented]).toEqual([key, expected, true]);
    }
  });

  it("hovers every series' point on focus, with source keyboard, and rings each one", () => {
    const { chart, svg, column } = setup();
    const events = listen(chart);
    tabTo(column("2"));
    expect(events).toEqual(["hover goals@2 keyboard 1/2", "hover xg@2 keyboard 2/2"]);
    const ring = svg.querySelector(".ec-focus")!;
    expect(ring.getAttribute("visibility")).toBeNull();
    const outlines = chart
      .marks()
      .filter((mark) => mark.key.endsWith("@2"))
      .map((mark) => mark.outline.d);
    expect(Array.from(ring.children, (g) => g.querySelector(".ec-focus-ring")!.getAttribute("d"))).toEqual(outlines);
    expect(Array.from(ring.children, (g) => g.querySelector(".ec-focus-gap")!.getAttribute("d"))).toEqual(outlines);
    column("2").blur();
    expect(ring.getAttribute("visibility")).toBe("hidden");
  });

  it("names each x like a stacked bar, and words it with markLabel given a MarkSummary", () => {
    const plain = setup({ seriesLabels: { xg: "xG" } });
    expect(plain.column("3").getAttribute("aria-label")).toBe("3: 3 goals, 3.6 xG");
    const summaries: unknown[] = [];
    const worded = setup({
      markLabel: (d, mark) => {
        summaries.push(mark);
        return `Matchweek ${d.week}: ${mark.values.map((v) => `${mark.format(v.value)} ${v.label}`).join(", ")}`;
      }
    });
    expect(worded.column("3").getAttribute("aria-label")).toBe("Matchweek 3: 3 goals, 3.6 xg");
    expect(summaries[2]).toMatchObject({
      key: "3",
      category: "3",
      values: [
        { series: "goals", label: "goals", value: 3 },
        { series: "xg", label: "xg", value: 3.6 }
      ],
      total: 6.6,
      text: "3: 3 goals, 3.6 xg"
    });
  });
});

describe("lineChart: ARIA structure", () => {
  it("is a group of x's, each an image; the lines, points, labels and crosshair are hidden", () => {
    const { svg, column } = setup();
    expect(svg.getAttribute("role")).toBe("group");
    expect(svg.getAttribute("aria-label")).toBe("Goals vs xG");
    expect(column("1").getAttribute("role")).toBe("img");
    for (const hidden of [".ec-marks", ".ec-crosshair", ".ec-focus", ".ec-grid", ".ec-axis", ".ec-overlay"]) {
      expect(svg.querySelector(hidden)!.getAttribute("aria-hidden"), hidden).toBe("true");
    }
    expect(svg.querySelectorAll(".ec-columns > .ec-column[role='img']")).toHaveLength(4);
  });

  it("keeps a tooltip function's text as each x's description", () => {
    const { column } = setup({ tooltip: (d) => `Week ${d.week}` });
    const id = column("2").getAttribute("aria-describedby")!;
    expect(document.getElementById(id)?.textContent).toBe("Week 2");
  });
});

describe("lineChart: legend and table", () => {
  it("lists the series, then the page's entries", () => {
    const { container } = setup({ seriesLabels: { goals: "Goals scored", xg: "Expected goals (xG)" }, legend: { entries: [{ label: "Goals below xG", color: "negative" }] } });
    const items = Array.from(container.querySelectorAll(".ec-legend-item"), (item) => item.textContent);
    expect(items).toEqual(["Goals scored", "Expected goals (xG)", "Goals below xG"]);
  });

  it("has a row per x: the x, each series and no total, with the page's columns after the values", () => {
    const { container } = setup({
      table: { category: "Matchweek", columns: [{ label: "Difference", field: (d) => d.goals - d.xg, format: (v) => (v as number).toFixed(1), after: "values" }] }
    });
    const headers = Array.from(container.querySelectorAll(".ec-table thead th"), (th) => th.textContent);
    expect(headers).toEqual(["Matchweek", "goals", "xg", "Difference"]);
    const first = Array.from(container.querySelectorAll(".ec-table tbody tr")[0]!.children, (cell) => cell.textContent);
    expect(first).toEqual(["1", "0", "1.2", "-1.2"]);
  });

  it("lists every row, whatever is revealed", () => {
    const { chart, container } = setup();
    chart.reveal(1);
    expect(container.querySelectorAll(".ec-table tbody tr")).toHaveLength(4);
  });
});

describe("lineChart: effects and data", () => {
  it("starts decorate and enter on the lines, then the points by x", () => {
    const decorate = recorder();
    const enter = recorder();
    setup({ on: { decorate: decorate.effect, enter: enter.effect } });
    expect(enter.log).toEqual(["run goals", "run xg", "run goals@1", "run xg@1", "run goals@2", "run xg@2", "run goals@3", "run xg@3", "run goals@4", "run xg@4"]);
    expect(decorate.log).toEqual(enter.log);
  });

  it("gives a line its last row, a sample per row by distance with its x, and the other line as related", () => {
    const data = dataRecorder();
    const { chart } = setup({ on: { decorate: data.effect } });
    const goals = data.latest.get("goals")!;
    const line = chart.marks()[0]!;
    expect(goals.datum).toBe(weeks[3]);
    expect(goals.samples.map((s) => [s.value, s.at])).toEqual(weeks.map((w) => [w.goals, w.week]));
    expect(goals.samples[0]!.t).toBe(0);
    expect(goals.samples[3]!.t).toBe(1);
    expect(line.path(goals.samples[1]!.t).x).toBeCloseTo(chart.marks().find((m) => m.key === "goals@2")!.center.x, 6);
    expect(goals.related("xg")).toBe(data.latest.get("xg"));
    expect(goals.related("goals")).toBeUndefined();
  });

  it("gives a point its row and value, and the other series' point at the same x as related", () => {
    const data = dataRecorder();
    setup({ on: { decorate: data.effect } });
    const point = data.latest.get("goals@3")!;
    expect(point.datum).toBe(weeks[2]);
    expect(point.samples).toEqual([{ t: 0, value: 3, at: 3 }]);
    expect(point.related("xg")).toBe(data.latest.get("xg@3"));
  });

  it("checks the series data effects need, when created and on update", async () => {
    const needsXg: DataEffect = { kind: "data", needs: { related: ["xg"] }, run: () => Promise.resolve(), end() {}, clear() {} };
    expect(() => setup({ series: ["goals"], on: { decorate: needsXg } })).toThrow(/on\.decorate needs the series "xg", but the chart's series are "goals"/);
    const { chart } = setup({ on: { decorate: needsXg } });
    await expect(chart.update({ series: ["goals"] })).rejects.toThrow(/needs the series "xg"/);
  });

  it("tells a line's and a point's runs when only the related series changed", async () => {
    const data = dataRecorder();
    const { chart, settle } = setup({ on: { decorate: data.effect } });
    const outline = chart.marks()[0]!.outline.d;
    const lineBefore = data.latest.get("goals")!;
    const pointBefore = data.latest.get("goals@2")!;
    // Only week 2's xG changes: the goals rows are the same objects, the scale stays 0–6, so the goals
    // line and its points don't move, but what they compare with does.
    const next = [weeks[0]!, { ...weeks[1]!, xg: 2.4 }, weeks[2]!, weeks[3]!];
    await settle(chart.update({ data: next }));
    expect(chart.marks()[0]!.outline.d).toBe(outline);
    expect(data.latest.get("goals")).not.toBe(lineBefore);
    expect(data.latest.get("goals")!.related("xg")!.samples[1]!.value).toBe(2.4);
    expect(data.latest.get("goals@2")).not.toBe(pointBefore);
    expect(data.latest.get("goals@2")!.related("xg")!.samples[0]!.value).toBe(2.4);
  });

  it("restyles a point through ctx.mark, moving its ring with it", () => {
    const hover = recorder((_mark, ctx) => ctx.mark.set({ transform: [1, 0, 0, 1, 0, -3] }));
    const { svg, column, point } = setup({ on: { hover: hover.effect } });
    tabTo(column("2"));
    expect(point("goals@2").querySelector(".ec-body")!.getAttribute("transform")).toBe("matrix(1 0 0 1 0 -3)");
    expect(svg.querySelector(".ec-focus > g")!.getAttribute("transform")).toBe("matrix(1 0 0 1 0 -3)");
  });
});

describe("lineChart: update", () => {
  /** Week 2's xG changes, week 4 goes and week 5 comes. */
  const next: Week[] = [weeks[0]!, { week: 2, goals: 2, xg: 2.5 }, weeks[2]!, { week: 5, goals: 6, xg: 5.2 }];

  it("updates a line when its values or rows change, a point when its own value does; points enter and exit with their rows", async () => {
    const { chart, settle } = setup();
    const events = listen(chart);
    await settle(chart.update({ data: next }));
    expect(events).toEqual(["exit goals@4", "exit xg@4", "update goals", "update xg", "update xg@2", "enter goals@5", "enter xg@5"]);
    events.length = 0;
    // Only xG changes, in rows that stay: the goals line and points don't update.
    await settle(chart.update({ data: next.map((w) => ({ ...w, xg: w.xg + 1 })) }));
    expect(events).toEqual(["update xg", "update xg@1", "update xg@2", "update xg@3", "update xg@5"]);
  });

  it("enters and exits a series' line and points, fading the line", async () => {
    const { chart, clock, line, settle } = setup({ series: ["goals"] });
    const events = listen(chart);
    const adding = chart.update({ series: ["goals", "xg"] });
    expect(events).toEqual(["enter xg", "enter xg@1", "enter xg@2", "enter xg@3", "enter xg@4"]);
    clock.advance(250);
    expect(Number(line("xg").getAttribute("opacity"))).toBeGreaterThan(0);
    expect(Number(line("xg").getAttribute("opacity"))).toBeLessThan(1);
    await settle(adding);
    expect(line("xg").getAttribute("opacity")).toBeNull();
    events.length = 0;
    await settle(chart.update({ series: ["xg"] }));
    expect(events).toEqual(["exit goals", "exit goals@1", "exit goals@2", "exit goals@3", "exit goals@4"]);
    expect(line("goals")).toBeNull();
    expect(chart.marks().map((m) => m.key)).toEqual(["xg", "xg@1", "xg@2", "xg@3", "xg@4"]);
  });

  it("jumps to the new state at once when motion is off, with the geometry its events reported", () => {
    const { chart, clock } = setup({}, { motion: quietMotion("off") });
    const reported = new Map<string, MarkGeometry>();
    chart.on("update", (e) => reported.set(e.mark.key, e.mark));
    chart.on("enter", (e) => reported.set(e.mark.key, e.mark));
    void chart.update({ data: next });
    expect(clock.idle).toBe(true);
    const marks = chart.marks();
    expect(marks.map((m) => m.key)).toEqual(["goals", "xg", "goals@1", "xg@1", "goals@2", "xg@2", "goals@3", "xg@3", "goals@5", "xg@5"]);
    for (const key of reported.keys()) expect(marks.find((m) => m.key === key), key).toBe(reported.get(key));
  });

  it("stages a change in presentation: values first, then positions, 500 ms each", async () => {
    const { chart, clock } = setup();
    const at = (key: string) => chart.marks().find((m) => m.key === key)!.center;
    const start = { y: at("xg@2").y, x: at("xg@3").x };
    let settled = false;
    void chart.update({ data: next }).then(() => (settled = true));
    clock.advance(250);
    // Values: xG at week 2 moves, and nothing moves along x yet.
    expect(at("xg@2").y).not.toBeCloseTo(start.y, 3);
    expect(at("xg@3").x).toBeCloseTo(start.x, 6);
    clock.advance(500);
    // Positions: week 3 moves left as the x range grows to 5.
    expect(at("xg@3").x).toBeLessThan(start.x - 1);
    clock.advance(250);
    await flush();
    expect(settled).toBe(true);
  });

  it("runs the whole change as one stage of at most 200 ms in analysis", async () => {
    const { chart, clock } = setup({}, { motion: quietMotion("analysis") });
    let settled = false;
    void chart.update({ data: next }).then(() => (settled = true));
    clock.advance(100);
    await flush();
    expect(settled).toBe(false);
    clock.advance(100);
    await flush();
    expect(settled).toBe(true);
  });

  it("skips a stage with nothing to do", async () => {
    const { chart, settle } = setup();
    // New values with the same scale: one stage.
    const nudged = weeks.map((w) => ({ ...w, xg: w.xg + 0.1 }));
    expect(await settle(chart.update({ data: nudged }))).toBeLessThan(540);
    // A row added with values inside the scale: positions only.
    expect(await settle(chart.update({ data: [...nudged, { week: 5, goals: 5, xg: 5 }] }))).toBeLessThan(540);
  });

  it("grows a new row out of the row before it, and folds a leaving row into its own", async () => {
    const { chart, clock, settle } = setup();
    const at = (key: string) => chart.marks().find((m) => m.key === key)!;
    const line = () => chart.marks()[0]!;
    const before = line().end;
    const added = chart.update({ data: [...weeks, { week: 5, goals: 5, xg: 5 }] });
    // It starts on week 4's point, so the line doesn't jump.
    expect(at("goals@5").center.x).toBeCloseTo(before.x, 6);
    expect(at("goals@5").center.y).toBeCloseTo(before.y, 6);
    expect(line().end.x).toBeCloseTo(before.x, 6);
    clock.advance(250);
    expect(line().end.x).toBeGreaterThan(at("goals@4").center.x + 1);
    await settle(added);
    expect(line().end.x).toBeCloseTo(at("goals@5").center.x, 6);

    // Week 1 goes: it folds into week 2, the nearest row that stays (after it, as none is before). As
    // the x range loses week 1 at the same pace, the line's start stays on the plot's left edge while
    // week 2 slides to it.
    const firstX = line().start.x;
    const secondX = at("goals@2").center.x;
    const folding = chart.update({ data: [...weeks.slice(1), { week: 5, goals: 5, xg: 5 }] });
    clock.advance(250);
    expect(line().start.x).toBeCloseTo(firstX, 3);
    expect(at("goals@2").center.x).toBeLessThan(secondX - 1);
    expect(at("goals@2").center.x).toBeGreaterThan(firstX + 1);
    await settle(folding);
    expect(line().start.x).toBeCloseTo(at("goals@2").center.x, 6);
    expect(at("goals@2").center.x).toBeCloseTo(firstX, 3);
    expect(chart.element.querySelector('.ec-column[data-key="1"]')).toBeNull();
  });

  it("folds rows removed from the end into the last one that stays, rather than cutting the line", async () => {
    const { chart, clock, settle } = setup();
    const line = () => chart.marks()[0]!;
    const end = line().end.x;
    // Week 4 goes: the values' scale shrinks to 0–4 first, then the x range to weeks 1–3.
    const running = chart.update({ data: weeks.slice(0, 3) });
    expect(line().end.x).toBeCloseTo(end, 6);
    clock.advance(750);
    // The x range loses week 4 at the pace week 4 folds into week 3: the line's end stays on the
    // plot's right edge while week 3 slides to it.
    expect(line().end.x).toBeCloseTo(end, 3);
    expect(chart.marks().find((m) => m.key === "goals@3")!.center.x).toBeLessThan(end - 1);
    await settle(running);
    expect(line().end.x).toBeCloseTo(chart.marks().find((m) => m.key === "goals@3")!.center.x, 6);
    expect(line().end.x).toBeCloseTo(end, 3);
  });

  it("counts end labels between values", async () => {
    const { chart, clock, line, settle } = setup();
    const label = () => line("goals").querySelector(".ec-end-label")!.textContent;
    const running = chart.update({ data: weeks.map((w) => (w.week === 4 ? { ...w, goals: 9 } : w)) });
    clock.advance(250);
    expect(label()).toMatch(/^[678] goals$/);
    await settle(running);
    expect(label()).toBe("9 goals");
  });

  it("follows a hovered x through a change, and replays its hover after", async () => {
    const hover = recorder();
    const { chart, svg, column, settle } = setup({ on: { hover: hover.effect } });
    pointer("pointerover", column("2"));
    hover.log.length = 0;
    await settle(chart.update({ data: next }));
    expect(hover.log.filter((entry) => entry.startsWith("run"))).toEqual(["run goals@2", "run xg@2"]);
    const crosshair = svg.querySelector(".ec-crosshair")!;
    expect(crosshair.getAttribute("visibility")).toBeNull();
    expect(Number(crosshair.getAttribute("x1"))).toBeCloseTo(chart.marks().find((m) => m.key === "xg@2")!.center.x, 3);
  });

  it("rejects what it can't take, leaving the chart as it was", async () => {
    const { chart, keys } = setup();
    const before = keys();
    await expect(chart.update({ data: [...weeks, weeks[0]!] })).rejects.toThrow(/two rows have the key "1"/);
    await expect(chart.update({ labels: 1 as unknown as false })).rejects.toThrow(/labels must be false or a function/);
    await expect(chart.update({ on: {} })).rejects.toThrow(/`on` can't be changed/);
    expect(keys()).toEqual(before);
  });

  it("announces what changed by x, or the page's text", async () => {
    const { chart, container, settle } = setup({ announce: true });
    const region = () => container.querySelector(".ec-announcer")!.textContent!.trim();
    await settle(chart.update({ data: next }));
    expect(region()).toBe("2 changed. Added 5. Removed 4");
    await settle(chart.update({ announce: (change) => `Matchweek ${change.added.join(", ")} in` }));
    await settle(chart.update({ data: [...next, { week: 6, goals: 7, xg: 6 }] }));
    expect(region()).toBe("Matchweek 6 in");
  });
});

describe("lineChart: size and destroy", () => {
  it("re-lays out on a resize, without data events, its decorations following", () => {
    const decorate = recorder();
    let resize: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    const { chart, clock, svg } = setup({ width: undefined, on: { decorate: decorate.effect } });
    const events = listen(chart);
    decorate.log.length = 0;
    resize!([{ contentRect: { width: 480 } } as ResizeObserverEntry], {} as ResizeObserver);
    clock.advance(16);
    expect(svg.getAttribute("viewBox")).toBe("0 0 480 300");
    expect(events).toEqual([]);
    expect(decorate.log.filter((entry) => entry === "change goals")).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("clears every effect, stops listening and removes the chart", () => {
    const decorate = recorder((mark, ctx) => ctx.layer.path(mark.slice(0, 1), { stroke: "mark" }));
    const { chart, container } = setup({ on: { decorate: decorate.effect } });
    chart.destroy();
    expect(container.childElementCount).toBe(0);
    expect(decorate.log.filter((entry) => entry === "clear")).toHaveLength(10);
    expect(() => chart.reveal(2)).not.toThrow();
    chart.destroy();
  });
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
