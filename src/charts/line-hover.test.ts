// lineChart({ hover: "point" }) (M10 step 2): the pointer, touch and the keys hover one point, the
// nearest, with the other lines dimmed; links still go by x; update({ hover }) changes it at once.

import { createMotion, manualClock, type EffectContext, type GeometryEffect, type MarkGeometry, type MotionMode } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { barChart } from "./bar";
import { lineChart } from "./line";
import { link } from "./link";
import type { ChartEnv } from "./shell/setup";
import type { LineChart, LineChartOptions, MarkEvents } from "./types";

interface Week {
  week: number;
  goals: number | null;
  xg: number | null;
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

function environment(mode: MotionMode = "presentation"): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  return { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: quietMotion(mode), clock: manualClock() };
}

function setup<D = Week>(options: Partial<LineChartOptions<D>> = {}, mode: MotionMode = "presentation") {
  const container = document.body.appendChild(document.createElement("div"));
  const env = environment(mode);
  const chart = lineChart<D>(
    container,
    { label: "Goals vs xG", data: weeks as unknown as D[], x: "week", series: ["goals", "xg"], width: 600, hover: "point", ...options } as LineChartOptions<D>,
    env
  );
  const svg = chart.element;
  const stop = (key: string) => svg.querySelector(`.ec-stop[data-key="${key}"]`) as SVGGElement;
  const column = (key: string) => svg.querySelector(`.ec-column[data-key="${key}"]`) as SVGGElement;
  const point = (key: string) => svg.querySelector(`.ec-point[data-key="${key}"]`) as SVGGElement;
  const line = (series: string) => svg.querySelector(`.ec-line[data-key="${series}"]`) as SVGGElement;
  /** Where a mark is drawn, in the <svg>'s units. */
  const at = (key: string) => chart.marks().find((mark) => mark.key === key)!.center;
  /** The pointer onto the plot at (x, y): jsdom's boxes are empty, so client px are the <svg>'s units. */
  const pointTo = (x: number, y: number, type = "pointermove") =>
    svg.querySelector(".ec-stops > .ec-hit")!.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse", clientX: x, clientY: y }));
  const settle = (running: Promise<unknown>) => play(env.clock, running);
  return { container, env, chart, svg, stop, column, point, line, at, pointTo, settle };
}

/** Records every hover and leave as "hover goals@3 pointer 1/1" and "leave goals@3". */
function listen<D>(chart: { on<K extends keyof MarkEvents<D>>(type: K, listener: (event: MarkEvents<D>[K]) => void): () => void }): string[] {
  const events: string[] = [];
  chart.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source} ${e.batch.index + 1}/${e.batch.count}`));
  chart.on("leave", (e) => events.push(`leave ${e.mark.key}`));
  return events;
}

/** An effect that logs its runs and ends, drawing what `draw` draws. */
function recorder(draw?: (mark: MarkGeometry, ctx: EffectContext) => void) {
  const log: string[] = [];
  const effect: GeometryEffect = {
    kind: "geometry",
    run(mark, ctx) {
      log.push(`run ${mark.key}`);
      draw?.(mark, ctx);
      return Promise.resolve();
    },
    end(mark, ctx) {
      log.push(`end ${mark.key}`);
      draw?.(mark, ctx);
    },
    clear() {}
  };
  return { effect, log };
}

/** A key press on `target`. The document hears it first, as it would in a browser. */
function press(target: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** Tab into the chart: a key press, then focus lands where Tab reaches. */
function tabTo(target: SVGElement): void {
  press(document.body, "Tab");
  target.focus();
}

const focused = () => document.activeElement?.getAttribute("data-key");
const shown = () => document.querySelector(".ec-tooltip")?.classList.contains("ec-tooltip-shown") === true;

afterEach(() => {
  document.body.textContent = "";
  vi.restoreAllMocks();
});

describe('lineChart({ hover: "point" }): the pointer', () => {
  it("hovers the revealed point nearest it, alone, across the lines", () => {
    const { chart, svg, at, pointTo, point } = setup();
    const events = listen(chart);
    const goals = at("goals@3");
    pointTo(goals.x + 3, goals.y + 4, "pointerover");
    expect(events).toEqual(["hover goals@3 pointer 1/1"]);
    expect(point("goals@3").classList.contains("ec-hot")).toBe(true);
    expect(point("xg@3").classList.contains("ec-hot")).toBe(false);
    // Moving and staying nearest to it changes nothing.
    pointTo(goals.x - 2, goals.y);
    expect(events).toHaveLength(1);
    // Nearer xG's point, at the same x and between the x's.
    const xg = at("xg@3");
    pointTo(xg.x, xg.y + 2);
    const before = at("goals@2");
    pointTo((before.x + goals.x) / 2 - 5, before.y);
    expect(events).toEqual(["hover goals@3 pointer 1/1", "leave goals@3", "hover xg@3 pointer 1/1", "leave xg@3", "hover goals@2 pointer 1/1"]);
    // Leaving the plot leaves.
    svg.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", clientX: 1, clientY: 1 }));
    expect(events.slice(5)).toEqual(["leave goals@2"]);
  });

  it("gives a point where lines cross to the series first in series", () => {
    const crossing = weeks.map((row) => (row.week === 2 ? { ...row, xg: 2 } : row));
    const first = setup({ data: crossing });
    const events = listen(first.chart);
    const shared = first.at("goals@2");
    expect(first.at("xg@2")).toEqual(shared);
    first.pointTo(shared.x, shared.y, "pointerover");
    expect(events).toEqual(["hover goals@2 pointer 1/1"]);
    const swapped = setup({ data: crossing, series: ["xg", "goals"] });
    const swappedEvents = listen(swapped.chart);
    swapped.pointTo(shared.x, shared.y, "pointerover");
    expect(swappedEvents).toEqual(["hover xg@2 pointer 1/1"]);
  });

  it("hovers by touch the same way, until a tap elsewhere", () => {
    const { chart, svg, at } = setup();
    const events = listen(chart);
    const hit = svg.querySelector(".ec-stops > .ec-hit")!;
    const tap = (x: number, y: number) => {
      hit.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
      hit.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
    };
    const xg = at("xg@4");
    tap(xg.x, xg.y - 6);
    expect(events).toEqual(["hover xg@4 touch 1/1"]);
    const goals = at("goals@1");
    tap(goals.x + 1, goals.y);
    expect(events.slice(1)).toEqual(["leave xg@4", "hover goals@1 touch 1/1"]);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    expect(events.slice(3)).toEqual(["leave goals@1"]);
  });

  it("hovers nothing past the reveal or at a missing value", () => {
    const gapped = weeks.map((row) => (row.week === 3 ? { ...row, goals: null } : row));
    const { chart, svg, at, pointTo, stop } = setup({ data: gapped });
    const events = listen(chart);
    expect(stop("goals@3")).toBeNull();
    // Where goals' point would be at 3: half way along its line from 2 to 4.
    const [two, four] = [at("goals@2"), at("goals@4")];
    pointTo((two.x + four.x) / 2, (two.y + four.y) / 2, "pointerover");
    expect(events[0]).not.toMatch(/goals@3/);
    chart.reveal(2);
    expect(stop("goals@4").getAttribute("visibility")).toBe("hidden");
    expect(Number(svg.querySelector(".ec-stops > .ec-hit")!.getAttribute("width"))).toBeGreaterThan(four.x - at("goals@1").x);
    // Where goals' point at 4 is, the nearest revealed is xG's at 2, drawn higher than goals' there.
    pointTo(four.x, four.y);
    expect(events[events.length - 1]).toBe("hover xg@2 pointer 1/1");
    pointTo(four.x, at("goals@1").y);
    expect(events[events.length - 1]).toBe("hover goals@2 pointer 1/1");
  });

  it("plays the hover effect on the point alone, and shows no crosshair", () => {
    const hover = recorder();
    const { svg, at, pointTo } = setup({ on: { hover: hover.effect } });
    const goals = at("goals@2");
    pointTo(goals.x, goals.y, "pointerover");
    expect(hover.log).toEqual(["run goals@2"]);
    expect(svg.querySelector(".ec-crosshair")!.getAttribute("visibility")).toBe("hidden");
  });

  it('keeps an x as the target with hover: "x", the default, and with undefined', () => {
    for (const hover of [undefined, "x"] as const) {
      const { chart, svg, column } = setup({ hover });
      const events = listen(chart);
      expect(svg.querySelector(".ec-stops")).toBeNull();
      column("2").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
      expect(events).toEqual(["hover goals@2 pointer 1/2", "hover xg@2 pointer 2/2"]);
      expect(svg.classList.contains("ec-hovering")).toBe(false);
    }
  });
});

describe('lineChart({ hover: "point" }): dimming', () => {
  /** What the stylesheet sets, as jsdom cascades it: "1" where no rule sets an opacity. */
  const opacity = (element: Element | null) => getComputedStyle(element!).opacity;
  const DIM = "var(--ec-dim-opacity, 0.3)";
  /** A path along each mark and a label above its end, kept until the mark goes. */
  const decorate = recorder((mark, ctx) => {
    ctx.layer.path(mark.outline.d, { stroke: "mark", width: 2 });
    ctx.layer.text("+1", { at: { x: mark.end.x, y: mark.end.y - 8 } });
  });
  const runs = (svg: SVGSVGElement, key: string) => Array.from(svg.querySelectorAll(`.ec-overlay > .ec-run[data-key="${key}"]`));

  it("dims every other line and point, and their decorations, keeping its line, the text and the hovered point", () => {
    // xG's values at 1 and 3 have gaps either side, so their points show at rest.
    const lone = weeks.map((row) => ({ ...row, xg: row.week % 2 === 1 ? row.xg : null }));
    const { svg, line, point, at, pointTo } = setup({ data: lone, on: { decorate: decorate.effect } });
    const goals = at("goals@4");
    pointTo(goals.x, goals.y, "pointerover");
    expect(svg.classList.contains("ec-hovering")).toBe(true);
    expect(line("goals").classList.contains("ec-hot-line")).toBe(true);
    expect([opacity(line("goals").querySelector(".ec-stroke")), opacity(line("goals").querySelector(".ec-end"))]).toEqual(["1", "1"]);
    expect([opacity(line("xg").querySelector(".ec-stroke")), opacity(line("xg").querySelector(".ec-end"))]).toEqual([DIM, DIM]);
    // Text keeps its contrast: the end labels, and decorations' text.
    expect([opacity(line("xg").querySelector(".ec-end-label")), opacity(line("goals").querySelector(".ec-end-label"))]).toEqual(["1", "1"]);
    expect(opacity(point("goals@4").querySelector(".ec-dot"))).toBe("1");
    expect(opacity(point("xg@3").querySelector(".ec-dot"))).toBe(DIM);
    // A point that isn't shown stays hidden, not dimmed into view.
    expect(opacity(point("goals@2").querySelector(".ec-dot"))).toBe("0");
    for (const key of ["goals", "goals@4"]) {
      for (const run of runs(svg, key)) expect([key, opacity(run.querySelector(".ec-follow"))]).toEqual([key, "1"]);
    }
    for (const key of ["xg", "xg@3", "goals@2"]) {
      const [run] = runs(svg, key);
      expect([key, opacity(run!.querySelector(".ec-follow")), opacity(run!.querySelector("text"))]).toEqual([key, DIM, "1"]);
    }
    // Leaving brings everything back.
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    expect(line("goals").classList.contains("ec-hot-line")).toBe(false);
    expect(opacity(line("xg").querySelector(".ec-stroke"))).toBe("1");
    expect(runs(svg, "goals").some((run) => run.classList.contains("ec-hot"))).toBe(false);
  });

  it("keeps a line hot while another of its points is, on xG's own point too", () => {
    const { svg, line, at, pointTo } = setup({ on: { decorate: decorate.effect } });
    const xg = at("xg@2");
    pointTo(xg.x, xg.y, "pointerover");
    expect([line("xg").classList.contains("ec-hot-line"), line("goals").classList.contains("ec-hot-line")]).toEqual([true, false]);
    const goals = at("goals@4");
    pointTo(goals.x, goals.y);
    expect([line("xg").classList.contains("ec-hot-line"), line("goals").classList.contains("ec-hot-line")]).toEqual([false, true]);
    expect(runs(svg, "xg")[0]!.classList.contains("ec-hot")).toBe(false);
  });

  it("dims nothing with dim: false, and stops or starts dimming when update() changes it", async () => {
    const { chart, svg, line, at, pointTo, settle } = setup({ dim: false });
    const goals = at("goals@3");
    pointTo(goals.x, goals.y, "pointerover");
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    expect(opacity(line("xg").querySelector(".ec-stroke"))).toBe("1");
    await settle(chart.update({ dim: true }));
    expect(svg.classList.contains("ec-hovering")).toBe(true);
    await settle(chart.update({ dim: false }));
    expect(svg.classList.contains("ec-hovering")).toBe(false);
  });
});

describe('lineChart({ hover: "point" }): the tooltip', () => {
  it("sits above the point with the x in bold and that series' value, or below it at the top", () => {
    const { at, pointTo } = setup({ seriesLabels: { xg: "xG" } });
    const top = at("goals@4");
    // A box as tall as the room above the highest point, which has to go below it.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => Math.round(top.y));
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => 80);
    const xg = at("xg@1");
    pointTo(xg.x, xg.y, "pointerover");
    const tip = document.querySelector(".ec-tooltip")!;
    expect(Array.from(tip.children, (child) => child.textContent)).toEqual(["1", "1.2 xG"]);
    expect(tip.querySelector(".ec-tooltip-title")).not.toBeNull();
    expect(tip.getAttribute("data-side")).toBe("above");
    expect(Number((tip as HTMLElement).style.top.replace("px", ""))).toBeLessThan(xg.y);
    // A bridge across to the point, as beside a bar.
    expect((document.querySelector(".ec-tooltip-bridge") as HTMLElement).hidden).toBe(false);
    pointTo(top.x, top.y);
    expect(Array.from(tip.children, (child) => child.textContent)).toEqual(["4", "5 goals"]);
    expect(tip.getAttribute("data-side")).toBe("below");
    expect(Number((tip as HTMLElement).style.top.replace("px", ""))).toBeGreaterThan(top.y);
  });

  it("gives a tooltip function the row and the point's series, and with \"x\" the row alone", () => {
    const words = vi.fn((d: Week, point?: { readonly series: string }) => `Week ${d.week}: ${point?.series ?? "every series"}`);
    const { at, pointTo, stop } = setup({ tooltip: words });
    const xg = at("xg@3");
    pointTo(xg.x, xg.y, "pointerover");
    expect(document.querySelector(".ec-tooltip")!.textContent).toBe("Week 3: xg");
    expect(words).toHaveBeenCalledWith(weeks[2], { series: "xg" });
    // Each stop's description is the function's text for its point.
    const id = stop("goals@2").getAttribute("aria-describedby")!;
    expect(document.getElementById(id)?.textContent).toBe("Week 2: goals");
    words.mockClear();
    const x = setup({ hover: "x", tooltip: words });
    x.column("2").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(words.mock.calls.length).toBeGreaterThan(0);
    for (const call of words.mock.calls) expect(call).toHaveLength(1);
    expect(document.querySelectorAll(".ec-tooltip")[1]!.textContent).toBe("Week 2: every series");
  });
});

describe('lineChart({ hover: "point" }): onto the tooltip', () => {
  /** A dot's radius, as the chart draws it. */
  const DOT = 4.5;
  /** At week 2, xG's point is drawn a little above goals', nearer than a dot's radius. */
  function close(options: Partial<LineChartOptions<Week>> = {}) {
    const chart = setup(options);
    const events = listen(chart.chart);
    const goals = chart.at("goals@2");
    const xg = chart.at("xg@2");
    expect(xg.x).toBe(goals.x);
    expect(goals.y - xg.y).toBeGreaterThan(1);
    expect(goals.y - xg.y).toBeLessThan(DOT);
    return { ...chart, events, goals, xg };
  }
  /** Nearer xG's point than goals', straight above goals'. */
  const nearerXg = (goals: { y: number }, xg: { y: number }, y: number) => Math.abs(y - xg.y) < Math.abs(y - goals.y);

  it("keeps the hovered point while the pointer is on its dot, though another is nearer, up to the bridge", () => {
    const { pointTo, events, goals, xg } = close();
    pointTo(goals.x, goals.y, "pointerover");
    expect(events).toEqual(["hover goals@2 pointer 1/1"]);
    // Straight up, a px at a time, to the dot's top edge: past half way it's nearer xG's.
    for (let up = 1; up <= DOT; up++) pointTo(goals.x, goals.y - up);
    expect(nearerXg(goals, xg, goals.y - Math.floor(DOT))).toBe(true);
    expect(events).toEqual(["hover goals@2 pointer 1/1"]);
    // The bridge starts inside the dot, so the pointer meets it before it's off the dot.
    const bridge = document.querySelector<HTMLElement>(".ec-tooltip-bridge")!;
    expect(bridge.hidden).toBe(false);
    expect(document.querySelector(".ec-tooltip")!.getAttribute("data-side")).toBe("above");
    expect(parseFloat(bridge.style.top) + parseFloat(bridge.style.height)).toBeGreaterThan(goals.y - DOT);
    // Off the dot, the nearest point is hovered, as before.
    pointTo(goals.x, goals.y - DOT - 0.5);
    expect(events).toEqual(["hover goals@2 pointer 1/1", "leave goals@2", "hover xg@2 pointer 1/1"]);
  });

  it("follows the dot as an effect moves it", () => {
    let lift = 0;
    const hover = recorder((_, ctx) => ctx.mark.set({ transform: [1, 0, 0, 1, 0, -lift] }));
    const { pointTo, events, goals, xg } = close({ on: { hover: hover.effect } });
    // Goals' dot lifted onto xG's, and the pointer above both.
    lift = goals.y - xg.y;
    pointTo(goals.x, goals.y, "pointerover");
    pointTo(goals.x, xg.y - 3);
    expect(nearerXg(goals, xg, xg.y - 3)).toBe(true);
    expect(events).toEqual(["hover goals@2 pointer 1/1"]);
  });

  it("holds nothing without a tooltip, or once the hover has ended", () => {
    const off = close({ tooltip: false });
    off.pointTo(off.goals.x, off.goals.y, "pointerover");
    off.pointTo(off.goals.x, off.goals.y - 3);
    expect(nearerXg(off.goals, off.xg, off.goals.y - 3)).toBe(true);
    expect(off.events).toEqual(["hover goals@2 pointer 1/1", "leave goals@2", "hover xg@2 pointer 1/1"]);
    document.body.textContent = "";
    const { chart, pointTo, events, goals } = close();
    pointTo(goals.x, goals.y, "pointerover");
    chart.leave();
    pointTo(goals.x, goals.y - 3);
    expect(events).toEqual(["hover goals@2 pointer 1/1", "leave goals@2", "hover xg@2 pointer 1/1"]);
  });

  it("moves the tab stop to the hovered point on a click on its dot, though another is nearer", () => {
    const { svg, pointTo, goals, xg } = close();
    pointTo(goals.x, goals.y, "pointerover");
    pointerDown();
    svg.querySelector(".ec-stops > .ec-hit")!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: goals.x, clientY: goals.y - 3 }));
    expect(nearerXg(goals, xg, goals.y - 3)).toBe(true);
    expect(focused()).toBe("goals@2");
  });
});

describe('lineChart({ hover: "point", curve: "monotone" })', () => {
  it("hovers, dims and moves between the points on curved lines, its stops following them through a change of curve", async () => {
    const { chart, svg, line, stop, at, pointTo, settle } = setup({ curve: "monotone" });
    const events = listen(chart);
    // The points sit at the rows, on the curve: the nearest is found among them, as on straight lines.
    const goals = at("goals@3");
    pointTo(goals.x + 2, goals.y - 3, "pointerover");
    expect(events).toEqual(["hover goals@3 pointer 1/1"]);
    expect([svg.classList.contains("ec-hovering"), line("goals").classList.contains("ec-hot-line"), line("xg").classList.contains("ec-hot-line")]).toEqual([true, true, false]);
    chart.leave();
    chart.focus("goals@2");
    press(document.activeElement!, "ArrowUp");
    expect(focused()).toBe("xg@2");
    press(document.activeElement!, "ArrowRight");
    expect(focused()).toBe("xg@3");
    // Straightening the lines moves no point, and keeps focus and each stop on its point.
    await settle(chart.update({ curve: "linear" }));
    expect(focused()).toBe("xg@3");
    const xg = at("xg@3");
    expect([Number(stop("xg@3").querySelector("circle")!.getAttribute("cx")), Number(stop("xg@3").querySelector("circle")!.getAttribute("cy"))]).toEqual([xg.x, xg.y]);
    expect(events.slice(-1)).toEqual(["hover xg@3 keyboard 1/1"]);
  });
});

describe('lineChart({ hover: "point" }): a tooltip function written for points', () => {
  /** A function that needs the point's series, as `(d, { series })` would. */
  const forPoints = (d: Week, point?: { readonly series: string }) => {
    if (!point) throw new Error("no series");
    return `Week ${d.week}: ${point.series}`;
  };

  it("is never given the row alone, for the hidden x's, when made or updated", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const { chart, stop, column, settle } = setup({ tooltip: forPoints });
    await settle(chart.update({ data: [...weeks, { week: 5, goals: 6, xg: 5.1 }] }));
    expect(reportError).not.toHaveBeenCalled();
    expect(column("2").hasAttribute("aria-describedby")).toBe(false);
    expect(document.getElementById(stop("xg@5").getAttribute("aria-describedby")!)?.textContent).toBe("Week 5: xg");
    vi.unstubAllGlobals();
  });

  it('describes the x\'s again once update() makes the hover "x"', async () => {
    const both = (d: Week, point?: { readonly series: string }) => `Week ${d.week}${point ? `: ${point.series}` : ""}`;
    const { chart, column, settle } = setup({ tooltip: both });
    expect(column("2").hasAttribute("aria-describedby")).toBe(false);
    await settle(chart.update({ hover: "x" }));
    expect(document.getElementById(column("2").getAttribute("aria-describedby")!)?.textContent).toBe("Week 2");
  });
});

describe('lineChart({ hover: "point" }): the keys', () => {
  interface Row {
    x: number;
    a: number | null;
    b: number | null;
    c: number | null;
  }
  // b is missing at 2 and 5. At 1, c is drawn highest, then b, then a; at 2, a above c.
  const rows: Row[] = [
    { x: 1, a: 1, b: 3, c: 5 },
    { x: 2, a: 5, b: null, c: 1 },
    { x: 3, a: 2, b: 4, c: 6 },
    { x: 4, a: 6, b: 3, c: 0 },
    { x: 5, a: 3, b: null, c: 2 },
    { x: 6, a: 1, b: 2, c: 4 }
  ];
  const three = () => setup<Row>({ label: "Three lines", data: rows, x: "x", series: ["a", "b", "c"] });
  const tabIndexes = (svg: SVGSVGElement) => Array.from(svg.querySelectorAll(".ec-stops > .ec-stop"), (g) => `${g.getAttribute("data-key")} ${g.getAttribute("tabindex")}`);
  const walk = (steps: readonly [string, string][]) => {
    for (const [key, expected] of steps) {
      const event = press(document.activeElement!, key);
      expect([key, focused(), event.defaultPrevented]).toEqual([key, expected, true]);
    }
  };

  it("is one tab stop on a point, the stops in DOM order line by line, with the x's gone", () => {
    const { svg, column } = three();
    expect(tabIndexes(svg)).toEqual(["a@1 0", ...["a@2", "a@3", "a@4", "a@5", "a@6", "b@1", "b@3", "b@4", "b@6", "c@1", "c@2", "c@3", "c@4", "c@5", "c@6"].map((key) => `${key} -1`)]);
    expect(svg.querySelector(".ec-columns")!.getAttribute("display")).toBe("none");
    expect(column("1").hasAttribute("tabindex")).toBe(false);
    expect(Array.from(svg.children, (child) => child.getAttribute("class"))).toEqual(["ec-grid", "ec-axis", "ec-crosshair", "ec-focus", "ec-marks", "ec-columns", "ec-stops", "ec-overlay"]);
  });

  it("goes along the line with Left and Right, passing over its missing values, and to its ends with Home and End", () => {
    const { chart, svg } = three();
    const events = listen(chart);
    chart.focus("b@1");
    walk([
      ["ArrowRight", "b@3"],
      ["ArrowRight", "b@4"],
      ["ArrowRight", "b@6"],
      ["ArrowRight", "b@6"],
      ["ArrowLeft", "b@4"],
      ["Home", "b@1"],
      ["ArrowLeft", "b@1"],
      ["End", "b@6"]
    ]);
    expect(events.slice(0, 3)).toEqual(["hover b@1 keyboard 1/1", "leave b@1", "hover b@3 keyboard 1/1"]);
    expect(tabIndexes(svg).filter((stop) => stop.endsWith(" 0"))).toEqual(["b@6 0"]);
  });

  it("goes to the point above or below at the x with Up and Down, by where they're drawn, passing over a missing series", () => {
    const { chart } = three();
    chart.focus("a@1");
    walk([
      ["ArrowUp", "b@1"],
      ["ArrowUp", "c@1"],
      ["ArrowUp", "c@1"],
      ["ArrowDown", "b@1"],
      ["ArrowDown", "a@1"],
      ["ArrowDown", "a@1"]
    ]);
    chart.focus("a@2");
    walk([
      ["ArrowDown", "c@2"],
      ["ArrowDown", "c@2"],
      ["ArrowUp", "a@2"]
    ]);
  });

  it("pages along the line: a tenth of its points on numbers", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ week: i + 1, goals: i, xg: i === 1 ? null : i / 2 }));
    const { chart } = setup({ data: many });
    chart.focus("goals@1");
    walk([
      ["PageDown", "goals@4"],
      ["PageUp", "goals@1"],
      ["PageUp", "goals@1"]
    ]);
    // xG has 24 points, so a page is 3 of them, passing over its missing value at 2.
    chart.focus("xg@1");
    walk([
      ["PageDown", "xg@5"],
      ["End", "xg@25"],
      ["PageDown", "xg@25"],
      ["PageUp", "xg@22"]
    ]);
  });

  it("pages along the line a calendar month on a time axis, to the first x that far where it has a value", () => {
    interface Day {
      day: Date;
      goals: number;
      xg: number | null;
    }
    // 1 January to 31 March 2026; xG is missing on 5 February.
    const days: Day[] = Array.from({ length: 90 }, (_, i) => ({ day: new Date(Date.UTC(2026, 0, 1 + i)), goals: i, xg: i === 35 ? null : i / 2 }));
    const key = (series: string, month: number, date: number) => `${series}@${new Date(Date.UTC(2026, month, date)).toISOString()}`;
    const { chart } = setup<Day>({ label: "Days", data: days, x: "day", series: ["goals", "xg"] });
    chart.focus(key("xg", 0, 5));
    walk([
      ["PageDown", key("xg", 1, 6)],
      ["PageUp", key("xg", 0, 6)],
      ["PageDown", key("xg", 1, 6)],
      ["PageDown", key("xg", 2, 6)],
      ["PageDown", key("xg", 2, 31)]
    ]);
  });

  it("ends the hover with Escape, focus and its ring staying", () => {
    const { chart, svg, stop } = setup();
    const events = listen(chart);
    tabTo(stop("goals@1"));
    expect(events).toEqual(["hover goals@1 keyboard 1/1"]);
    expect(shown()).toBe(true);
    const event = press(stop("goals@1"), "Escape");
    expect(event.defaultPrevented).toBe(true);
    expect(events.slice(1)).toEqual(["leave goals@1"]);
    expect(focused()).toBe("goals@1");
    expect(svg.querySelector(".ec-focus")!.getAttribute("visibility")).toBeNull();
    expect(shown()).toBe(false);
  });

  it("rings the focused point alone", () => {
    const { chart, svg } = setup();
    chart.focus("xg@3");
    const ring = svg.querySelector(".ec-focus")!;
    const outline = chart.marks().find((mark) => mark.key === "xg@3")!.outline.d;
    expect(Array.from(ring.children, (g) => g.querySelector(".ec-focus-ring")!.getAttribute("d"))).toEqual([outline]);
  });

  it("names each point by its x and its value, through markLabel given that series alone", () => {
    const plain = setup({ seriesLabels: { xg: "xG" } });
    expect(plain.stop("xg@3").getAttribute("aria-label")).toBe("3: 3.6 xG");
    expect(plain.stop("goals@3").getAttribute("role")).toBe("img");
    const summaries: unknown[] = [];
    const worded = setup({
      markLabel: (d, mark) => {
        summaries.push(mark);
        return mark.values.length === 1 ? `Matchweek ${d.week}, ${mark.values[0]!.label}: ${mark.format(mark.values[0]!.value)}` : "";
      }
    });
    expect(worded.stop("goals@3").getAttribute("aria-label")).toBe("Matchweek 3, goals: 3");
    expect(summaries).toContainEqual(expect.objectContaining({ key: "xg@2", category: "2", values: [{ series: "xg", label: "xg", value: 2.1 }], total: 2.1, text: "2: 2.1 xg" }));
  });

  it("takes a point's key, or an x's for its first series' point there, in focus(key)", () => {
    const gapped = weeks.map((row) => (row.week === 3 ? { ...row, goals: null } : row));
    const { chart, svg } = setup({ data: gapped });
    const events = listen(chart);
    pointerDown();
    chart.focus("xg@2");
    expect(focused()).toBe("xg@2");
    expect(svg.querySelector(".ec-focus")!.getAttribute("visibility")).toBeNull();
    chart.focus("4");
    expect(focused()).toBe("goals@4");
    chart.focus("3");
    expect(focused()).toBe("xg@3");
    expect(events).toEqual(["hover xg@2 keyboard 1/1", "leave xg@2", "hover goals@4 keyboard 1/1", "leave goals@4", "hover xg@3 keyboard 1/1"]);
    // A line, an unknown key, a missing value and a point past the reveal aren't on screen.
    chart.reveal(3);
    for (const key of ["goals", "12", "goals@3", "goals@4", "4"]) chart.focus(key);
    expect(focused()).toBe("xg@3");
  });

  it("moves the tab stop to the point a click on the plot hovers, without its ring", () => {
    const { svg, at } = setup();
    const goals = at("goals@3");
    pointerDown();
    svg.querySelector(".ec-stops > .ec-hit")!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: goals.x, clientY: goals.y }));
    expect(focused()).toBe("goals@3");
    expect(svg.querySelector(".ec-focus")!.getAttribute("visibility")).toBe("hidden");
  });

  it("moves focus along the line when the reveal hides its point", () => {
    const { chart } = setup();
    chart.focus("goals@3");
    chart.reveal(2);
    expect(focused()).toBe("goals@2");
  });
});

/** A press of the mouse, so the next focus comes from a click, not a key. */
function pointerDown(): void {
  document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
}

describe('lineChart({ hover: "point" }): links', () => {
  function season() {
    const env = environment();
    const host = () => document.body.appendChild(document.createElement("div"));
    const bars = barChart<Week>(host(), { label: "Goals per matchweek", data: weeks, x: (d) => String(d.week), y: (d) => d.goals ?? 0, orientation: "vertical", width: 400 }, env);
    const line = lineChart<Week>(host(), { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 400, hover: "point" }, env);
    const center = (key: string) => line.marks().find((mark) => mark.key === key)!.center;
    const pointTo = (key: string) => {
      const { x, y } = center(key);
      line.element.querySelector(".ec-stops > .ec-hit")!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", clientX: x, clientY: y }));
    };
    return { bars, line, pointTo };
  }

  it("hovers the others at a point's x, and shows a link's hover at every point there with nothing dimmed", () => {
    const { bars, line, pointTo } = season();
    link([bars, line]);
    const barEvents = listen(bars);
    const lineEvents = listen(line);
    pointTo("xg@3");
    expect(barEvents).toEqual(["hover 3 linked 1/1"]);
    expect(lineEvents).toEqual(["hover xg@3 pointer 1/1"]);
    line.leave();
    expect(barEvents.slice(1)).toEqual(["leave 3"]);
    bars.element.querySelector('.ec-mark[data-key="2"] .ec-segment')!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(lineEvents.slice(2)).toEqual(["hover goals@2 linked 1/2", "hover xg@2 linked 2/2"]);
    const svg = line.element;
    expect(Array.from(svg.querySelectorAll(".ec-point.ec-hot"), (point) => point.getAttribute("data-key"))).toEqual(["goals@2", "xg@2"]);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    expect(svg.querySelector(".ec-crosshair")!.getAttribute("visibility")).toBe("hidden");
    expect(line.element.parentElement!.querySelector(".ec-tooltip")!.classList.contains("ec-tooltip-shown")).toBe(false);
  });

  it("shows a link's hover again in the new targets when update() changes the hover", async () => {
    const { bars, line } = season();
    link([bars, line]);
    const lineEvents = listen(line);
    bars.element.querySelector('.ec-mark[data-key="4"] .ec-segment')!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    await line.update({ hover: "x" });
    expect(lineEvents).toEqual(["hover goals@4 linked 1/2", "hover xg@4 linked 2/2", "leave goals@4", "leave xg@4", "hover goals@4 linked 1/2", "hover xg@4 linked 2/2"]);
  });
});

describe('lineChart: update({ hover })', () => {
  const rings = (svg: SVGSVGElement) => Array.from(svg.querySelector(".ec-focus")!.children, (g) => g.querySelector(".ec-focus-ring")?.getAttribute("d"));
  const outline = (chart: LineChart<Week>, key: string) => chart.marks().find((mark) => mark.key === key)!.outline.d;

  it('goes from "x" to "point" with a pointer hover held: it ends, and the pointer hovers a point when it next moves', async () => {
    const { chart, svg, column, at, pointTo, settle } = setup({ hover: "x" });
    const events = listen(chart);
    column("3").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    await settle(chart.update({ hover: "point" }));
    expect(events).toEqual(["hover goals@3 pointer 1/2", "hover xg@3 pointer 2/2", "leave goals@3", "leave xg@3"]);
    expect(svg.querySelector(".ec-crosshair")!.getAttribute("visibility")).toBe("hidden");
    expect(shown()).toBe(false);
    expect(svg.querySelector(".ec-columns")!.getAttribute("display")).toBe("none");
    expect(svg.querySelectorAll(".ec-stops > .ec-stop")).toHaveLength(8);
    const xg = at("xg@3");
    pointTo(xg.x, xg.y);
    expect(events.slice(4)).toEqual(["hover xg@3 pointer 1/1"]);
    expect(svg.classList.contains("ec-hovering")).toBe(true);
  });

  it('goes from "x" to "point" with a keyboard hover held: focus moves to the x\'s first point, its ring with it, unhovered', async () => {
    const { chart, svg, column, settle } = setup({ hover: "x" });
    const events = listen(chart);
    tabTo(column("2"));
    await settle(chart.update({ hover: "point" }));
    expect(events).toEqual(["hover goals@2 keyboard 1/2", "hover xg@2 keyboard 2/2", "leave goals@2", "leave xg@2"]);
    expect(focused()).toBe("goals@2");
    expect(rings(svg)).toEqual([outline(chart, "goals@2")]);
    expect(svg.querySelector(".ec-focus")!.getAttribute("visibility")).toBeNull();
    expect(column("2").hasAttribute("tabindex")).toBe(false);
    expect(svg.querySelector('.ec-stop[tabindex="0"]')!.getAttribute("data-key")).toBe("goals@2");
    press(document.activeElement!, "ArrowRight");
    expect(events.slice(4)).toEqual(["hover goals@3 keyboard 1/1"]);
  });

  it('goes from "point" to "x" with a keyboard hover held: focus moves to the point\'s x, rings every point there, and the stops go', async () => {
    const { chart, svg, column, settle } = setup();
    const events = listen(chart);
    chart.focus("xg@2");
    await settle(chart.update({ hover: "x" }));
    expect(events).toEqual(["hover xg@2 keyboard 1/1", "leave xg@2"]);
    expect(document.activeElement).toBe(column("2"));
    expect(rings(svg)).toEqual([outline(chart, "goals@2"), outline(chart, "xg@2")]);
    expect(svg.querySelector(".ec-stops")).toBeNull();
    expect(svg.querySelector(".ec-columns")!.hasAttribute("display")).toBe(false);
    expect(Array.from(svg.children, (child) => child.getAttribute("class"))).toEqual(["ec-grid", "ec-axis", "ec-crosshair", "ec-focus", "ec-marks", "ec-columns", "ec-overlay"]);
    expect(column("2").getAttribute("tabindex")).toBe("0");
    press(document.activeElement!, "ArrowRight");
    expect(events.slice(2)).toEqual(["hover goals@3 keyboard 1/2", "hover xg@3 keyboard 2/2"]);
  });

  it('goes from "point" to "x" with a pointer hover held: it ends, and the pointer hovers an x again', async () => {
    const { chart, svg, column, at, pointTo, settle } = setup();
    const events = listen(chart);
    const goals = at("goals@3");
    pointTo(goals.x, goals.y, "pointerover");
    await settle(chart.update({ hover: "x" }));
    expect(events).toEqual(["hover goals@3 pointer 1/1", "leave goals@3"]);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    column("3").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(events.slice(2)).toEqual(["hover goals@3 pointer 1/2", "hover xg@3 pointer 2/2"]);
  });

  it("moves focus with it while the window is in the background, when no focus events come", async () => {
    const { chart, column, stop, settle } = setup();
    const events = listen(chart);
    // A page in the background hears no focus events, though focus moves.
    const unheard = (event: Event) => event.stopImmediatePropagation();
    for (const type of ["focusin", "focusout"]) window.addEventListener(type, unheard, true);
    try {
      stop("xg@3").focus();
      await settle(chart.update({ hover: "x" }));
      expect(document.activeElement).toBe(column("3"));
      await settle(chart.update({ hover: "point" }));
      expect(focused()).toBe("goals@3");
    } finally {
      for (const type of ["focusin", "focusout"]) window.removeEventListener(type, unheard, true);
    }
    expect(events).toEqual([]);
  });

  it("moves the tab stop with nothing focused, to the nearest x with a point when its own has none", async () => {
    const empty = weeks.map((row) => (row.week === 2 ? { ...row, goals: null, xg: null } : row));
    const { chart, svg, column, settle } = setup({ hover: "x", data: empty });
    chart.focus("2");
    column("2").blur();
    await settle(chart.update({ hover: "point" }));
    expect(svg.querySelector('.ec-stop[tabindex="0"]')!.getAttribute("data-key")).toBe("goals@3");
    expect(document.activeElement).toBe(document.body);
    await settle(chart.update({ hover: "x" }));
    expect(column("3").getAttribute("tabindex")).toBe("0");
  });

  it("changes it with data in the same update, the stops following the points", async () => {
    const { chart, svg, settle } = setup({ hover: "x" });
    const more = [...weeks.slice(1), { week: 5, goals: 6, xg: 5.1 }];
    await settle(chart.update({ hover: "point", data: more }));
    expect(Array.from(svg.querySelectorAll(".ec-stops > .ec-stop"), (stop) => stop.getAttribute("data-key"))).toEqual(["goals@2", "goals@3", "goals@4", "goals@5", "xg@2", "xg@3", "xg@4", "xg@5"]);
    expect(svg.querySelector('.ec-stop[data-key="xg@5"]')!.getAttribute("aria-label")).toBe("5: 5.1 xg");
  });

  it("works with motion off", async () => {
    const hover = recorder();
    const { chart, svg, at, pointTo } = setup({ hover: "x", on: { hover: hover.effect } }, "off");
    await chart.update({ hover: "point" });
    expect(svg.style.getPropertyValue("--ec-hover-duration")).toBe("0ms");
    const goals = at("goals@2");
    pointTo(goals.x, goals.y, "pointerover");
    expect(hover.log).toEqual(["end goals@2"]);
    expect(svg.classList.contains("ec-hovering")).toBe(true);
  });

  it("throws on any other hover, and rejects it in update(), changing nothing", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const options = { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 600 } as const;
    for (const [hover, said] of [
      ["nearest", '"nearest"'],
      [3, "3"],
      [null, "null"]
    ] as const) {
      expect(() => lineChart<Week>(container, { ...options, hover: hover as never }, environment())).toThrow(new TypeError(`lineChart: hover must be "x" or "point", got ${said}.`));
    }
    expect(container.children).toHaveLength(0);
    const { chart, svg } = setup({ hover: "x" });
    await expect(chart.update({ hover: "Point" as never })).rejects.toThrow(new TypeError('lineChart: hover must be "x" or "point", got "Point".'));
    expect(svg.querySelector(".ec-stops")).toBeNull();
    expect(svg.querySelector(".ec-columns")!.hasAttribute("display")).toBe(false);
  });
});
