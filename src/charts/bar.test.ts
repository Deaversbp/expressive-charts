import { createMotion, manualClock, type DataEffect, type EffectContext, type GeometryEffect, type MarkGeometry, type MotionMode } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { barChart, type BarChart, type ChartEnv } from "./bar";
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

/** A motion whose device never asks for reduced motion. */
function quietMotion(mode: MotionMode = "presentation") {
  return createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
}

function setup(options: Partial<BarChartOptions<Player>> = {}, more: Partial<ChartEnv> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const clock = manualClock();
  const presets = createRegistry<PresetFactory>({ kind: "preset" });
  const env: ChartEnv = { presets, icons: { get: () => undefined }, motion: quietMotion(), clock, ...more };
  const chart = barChart<Player>(container, { label: "Goals by player", data: players, y: "name", x: "goals", width: 600, ...options }, env);
  const svg = chart.element;
  const mark = (key: string) => svg.querySelector(`.ec-mark[data-key="${key}"]`) as SVGGElement;
  const keys = () => Array.from(svg.querySelectorAll(".ec-marks > .ec-mark"), (g) => g.getAttribute("data-key"));
  /** Plays the clock until the update settles. */
  const settle = (running: Promise<unknown>) => play(clock, running);
  return { container, chart, svg, clock, env, presets, mark, keys, settle };
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

/** Tab into the chart: a key press, then focus lands on the mark Tab reaches. */
function tabTo(target: SVGElement): void {
  press(document.body, "Tab");
  target.focus();
}

/** An effect that logs what the runner does with it. `hold` keeps run() pending until released or aborted. */
function recorder(options: { hold?: boolean; draw?: (mark: MarkGeometry, ctx: EffectContext) => void } = {}) {
  const log: string[] = [];
  const releases: (() => void)[] = [];
  const effect: GeometryEffect = {
    kind: "geometry",
    run(mark, ctx) {
      log.push(ctx.previous ? `run ${mark.key} from ${Math.round(ctx.previous.bounds.width)}` : `run ${mark.key}`);
      ctx.onChange((moved) => log.push(`change ${moved.key}`));
      options.draw?.(mark, ctx);
      if (!options.hold) return Promise.resolve();
      return new Promise<void>((resolve) => {
        releases.push(resolve);
        ctx.signal.addEventListener("abort", () => resolve());
      });
    },
    end(mark) {
      log.push(`end ${mark.key}`);
    },
    clear() {
      log.push("clear");
    }
  };
  return { effect, log, release: () => releases.splice(0).forEach((resolve) => resolve()) };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.textContent = "";
  vi.unstubAllGlobals();
});

describe("barChart: drawing", () => {
  it("draws keyed marks from describe.bar, with labels and values", () => {
    const { svg, chart, mark, keys } = setup();
    expect(svg.getAttribute("class")).toBe("ec-chart ec-bar-chart");
    expect(svg.getAttribute("aria-label")).toBe("Goals by player");
    expect(svg.getAttribute("viewBox")).toBe(`0 0 600 ${4 + 3 * 34 + 26}`);
    expect(keys()).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
    const okafor = mark("Okafor");
    expect(Array.from(okafor.children, (child) => child.getAttribute("class"))).toEqual(["ec-hit", "ec-label", "ec-body", "ec-value"]);
    expect(okafor.querySelector(".ec-label")?.textContent).toBe("Okafor");
    expect(okafor.querySelector(".ec-value")?.textContent).toBe("16");
    const segments = okafor.querySelectorAll(".ec-body > .ec-segment");
    expect(segments).toHaveLength(1);
    expect(segments[0]!.getAttribute("data-series")).toBe("goals");
    const geometry = chart.marks()[0]!;
    expect(geometry.key).toBe("Okafor");
    expect(segments[0]!.getAttribute("d")).toBe(geometry.segments![0]!.outline.d);
  });

  it("draws gridlines, the baseline and ticks with theme classes, below the marks", () => {
    const { svg } = setup();
    expect(Array.from(svg.children, (child) => child.getAttribute("class"))).toEqual(["ec-grid", "ec-axis", "ec-focus", "ec-marks", "ec-overlay"]);
    const lines = Array.from(svg.querySelectorAll(".ec-grid line"), (line) => line.getAttribute("class"));
    expect(lines).toEqual(["ec-baseline", "ec-gridline", "ec-gridline", "ec-gridline", "ec-gridline"]);
    expect(Array.from(svg.querySelectorAll(".ec-axis .ec-tick"), (t) => t.textContent)).toEqual(["0", "5", "10", "15", "20"]);
  });

  it("draws one path per stacked series, from the baseline", () => {
    const { mark, chart } = setup({ stack: ["goals", "assists"] });
    const paths = Array.from(mark("Tanaka").querySelectorAll(".ec-segment"));
    expect(paths.map((p) => p.getAttribute("data-series"))).toEqual(["goals", "assists"]);
    expect(paths[1]!.getAttribute("d")).toBe(chart.marks()[1]!.segments![1]!.outline.d);
    expect(mark("Tanaka").querySelector(".ec-value")?.textContent).toBe("16");
  });

  it("draws columns when the category is on x", () => {
    const { svg, chart } = setup({ x: "name", y: "goals" });
    expect(svg.getAttribute("viewBox")).toBe("0 0 600 300");
    expect(chart.marks()[0]!.angle(0)).toBeCloseTo(-Math.PI / 2);
  });

  it("formats values and ticks, and describes the chart", () => {
    const { svg, mark } = setup({ format: (v) => `${v} g`, description: "Season to date" });
    expect(mark("Okafor").querySelector(".ec-value")?.textContent).toBe("16 g");
    expect(svg.querySelector(".ec-tick")?.textContent).toBe("0 g");
    expect(svg.firstElementChild?.tagName).toBe("desc");
    expect(svg.querySelector("desc")?.textContent).toBe("Season to date");
  });

  it("injects the shared stylesheet once", () => {
    setup();
    setup();
    expect(document.querySelectorAll("style[data-expressive-charts]")).toHaveLength(1);
  });

  it("takes a selector, and checks its options", () => {
    const host = document.createElement("section");
    host.id = "goals";
    document.body.appendChild(host);
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: quietMotion() };
    const chart = barChart("#goals", { label: "Goals", data: players, y: "name", x: "goals", width: 400 }, env);
    expect(host.querySelector("svg")).toBe(chart.element);
    expect(() => barChart("#nothing", { label: "Goals", data: players, y: "name", x: "goals" }, env)).toThrow(/no element matches/);
    expect(() => barChart(host, { label: " ", data: players, y: "name", x: "goals" }, env)).toThrow(/needs a label/);
    expect(() => barChart(host, { label: "Goals", data: players, y: "name", x: "goals", width: -5 }, env)).toThrow(/width must be/);
    expect(() => barChart(host, { label: "Goals", data: players, y: "name", x: "goals", format: "0.0" as unknown as () => string }, env)).toThrow(/barChart: format must be a function/);
  });

  it("leaves nothing behind when its first layout throws", () => {
    const observe = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        unobserve() {}
        disconnect() {}
      }
    );
    const motion = quietMotion();
    const subscribe = vi.spyOn(motion, "subscribe");
    const container = document.body.appendChild(document.createElement("div"));
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion };
    expect(() => barChart(container, { label: "Goals", data: [...players, players[0]!], y: "name", x: "goals" }, env)).toThrow(/two rows have the key/);
    expect(container.childElementCount).toBe(0);
    expect(observe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("falls back to 640 px when the container has no width", () => {
    const { svg } = setup({ width: undefined });
    expect(svg.getAttribute("width")).toBe("640");
  });
});

describe("barChart: keys and colours", () => {
  it("keeps each mark's element and key across sorts", async () => {
    const { chart, mark, keys, settle } = setup();
    const okafor = mark("Okafor");
    await settle(chart.update({ sort: "value" }));
    expect(keys()).toEqual(["Okafor", "Lindqvist", "Tanaka"]);
    await settle(chart.update({ sort: "key" }));
    expect(keys()).toEqual(["Lindqvist", "Okafor", "Tanaka"]);
    expect(chart.marks().map((m) => m.key)).toEqual(["Lindqvist", "Okafor", "Tanaka"]);
    expect(mark("Okafor")).toBe(okafor);
  });

  it("colours follow the series, never the rank or the view", async () => {
    const { chart, mark, settle } = setup({ stack: ["goals", "assists"] });
    const color = (key: string, series: string) =>
      (mark(key).querySelector(`.ec-segment[data-series="${series}"]`) as SVGPathElement | null)?.style.getPropertyValue("--ec-mark");
    expect(color("Okafor", "goals")).toBe("var(--ec-series-1, #2a78d6)");
    expect(color("Okafor", "assists")).toBe("var(--ec-series-2, #eb6834)");
    await settle(chart.update({ sort: "value" }));
    expect(color("Tanaka", "assists")).toBe("var(--ec-series-2, #eb6834)");
    await settle(chart.update({ stack: ["assists"] }));
    expect(color("Tanaka", "goals")).toBeUndefined();
    expect(color("Tanaka", "assists")).toBe("var(--ec-series-2, #eb6834)");
  });

  it("uses pinned palette slots", () => {
    const { mark } = setup({ stack: ["goals", "assists"], colors: { goals: 1, assists: 4 } });
    const assists = mark("Okafor").querySelector('[data-series="assists"]') as SVGPathElement;
    expect(assists.style.getPropertyValue("--ec-mark")).toBe("var(--ec-series-4, #c28409)");
    expect(assists.style.getPropertyValue("--ec-mark-strong")).toBe("var(--ec-series-4-strong, #9d6a07)");
  });
});

describe("barChart: hover", () => {
  it("emphasises the hovered mark and dims the others", () => {
    const { chart, svg, mark } = setup({ stack: ["goals", "assists"] });
    const events: string[] = [];
    chart.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source} ${e.segment ?? "-"}`));
    chart.on("leave", (e) => events.push(`leave ${e.mark.key}`));
    pointer("pointerover", mark("Okafor").querySelector('[data-series="assists"]')!);
    expect(svg.classList.contains("ec-hovering")).toBe(true);
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(true);
    expect(mark("Tanaka").classList.contains("ec-hot")).toBe(false);
    pointer("pointerover", mark("Okafor").querySelector(".ec-label")!);
    pointer("pointerover", mark("Tanaka").querySelector(".ec-hit")!);
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(false);
    expect(mark("Tanaka").classList.contains("ec-hot")).toBe(true);
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    expect(mark("Tanaka").classList.contains("ec-hot")).toBe(false);
    expect(events).toEqual(["hover Okafor pointer assists", "leave Okafor", "hover Tanaka pointer -", "leave Tanaka"]);
  });

  it("leaves when the pointer moves off the marks", () => {
    const { svg, mark } = setup();
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    pointer("pointerover", svg.querySelector(".ec-tick")!);
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(false);
  });

  it("keeps the others at full opacity with dim: false", async () => {
    const { chart, svg, mark } = setup({ dim: false });
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(true);
    await chart.update({ dim: true });
    expect(svg.classList.contains("ec-hovering")).toBe(true);
  });

  it("times the CSS feedback with motion", () => {
    const motion = quietMotion();
    const { svg } = setup({}, { motion });
    expect(svg.style.getPropertyValue("--ec-hover-duration")).toBe("100ms");
    motion.chooseMode("off");
    expect(svg.style.getPropertyValue("--ec-hover-duration")).toBe("0ms");
  });

  it("treats a mode as the author's default: the viewer's choice and reduced motion still win", () => {
    const page = quietMotion();
    const { svg } = setup({ motion: "off" }, { motion: page });
    expect(svg.style.getPropertyValue("--ec-hover-duration")).toBe("0ms");
    page.chooseMode("presentation");
    expect(svg.style.getPropertyValue("--ec-hover-duration")).toBe("100ms");
    const reduced = createMotion({ reducedMotion: { matches: true, subscribe: () => () => {} } });
    expect(setup({ motion: "presentation" }, { motion: reduced }).svg.style.getPropertyValue("--ec-hover-duration")).toBe("0ms");
  });

  it("treats a tap as hover until a tap elsewhere", () => {
    const { chart, svg, mark } = setup();
    const events: string[] = [];
    chart.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source}`));
    chart.on("leave", (e) => events.push(`leave ${e.mark.key}`));
    // Touch fires pointerover and pointerleave around a tap; they don't count.
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!, "touch");
    expect(events).toEqual([]);
    tap(mark("Okafor").querySelector(".ec-hit")!);
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "touch" }));
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(true);
    tap(mark("Okafor").querySelector(".ec-segment")!);
    tap(mark("Tanaka").querySelector(".ec-label")!);
    pointer("pointerdown", document.body, "touch");
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    expect(events).toEqual(["hover Okafor touch", "leave Okafor", "hover Tanaka touch", "leave Tanaka"]);
  });
});

describe("barChart: keyboard", () => {
  const tabIndexes = (svg: SVGSVGElement) => Array.from(svg.querySelectorAll(".ec-marks > .ec-mark:not(.ec-leaving)"), (g) => `${g.getAttribute("data-key")} ${g.getAttribute("tabindex")}`);
  const focused = () => document.activeElement?.getAttribute("data-key");
  /** Records hover and leave events as "hover Okafor keyboard" and "leave Okafor". */
  const listen = (chart: BarChart<Player>) => {
    const events: string[] = [];
    chart.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source}`));
    chart.on("leave", (e) => events.push(`leave ${e.mark.key}`));
    return events;
  };

  it("is one tab stop, with a roving tabindex", () => {
    const { svg, mark } = setup();
    expect(tabIndexes(svg)).toEqual(["Okafor 0", "Tanaka -1", "Lindqvist -1"]);
    tabTo(mark("Okafor"));
    press(mark("Okafor"), "ArrowDown");
    expect(focused()).toBe("Tanaka");
    expect(tabIndexes(svg)).toEqual(["Okafor -1", "Tanaka 0", "Lindqvist -1"]);
    // Leaving the chart and coming back lands on the mark focused last.
    mark("Tanaka").blur();
    expect(tabIndexes(svg)).toEqual(["Okafor -1", "Tanaka 0", "Lindqvist -1"]);
  });

  it("moves in visual order with the arrow keys, Home and End, following a re-sort", async () => {
    const { chart, svg, mark, settle } = setup();
    tabTo(mark("Okafor"));
    const steps: [string, string][] = [
      ["ArrowDown", "Tanaka"],
      ["ArrowRight", "Lindqvist"],
      ["ArrowDown", "Lindqvist"],
      ["Home", "Okafor"],
      ["ArrowUp", "Okafor"],
      ["End", "Lindqvist"],
      ["ArrowLeft", "Tanaka"],
      ["ArrowUp", "Okafor"]
    ];
    for (const [key, expected] of steps) {
      const event = press(document.activeElement!, key);
      expect([key, focused(), event.defaultPrevented]).toEqual([key, expected, true]);
    }
    // Keys it doesn't use, and browser shortcuts, go through.
    expect(press(mark("Okafor"), "a").defaultPrevented).toBe(false);
    expect(press(mark("Okafor"), "ArrowDown", { altKey: true }).defaultPrevented).toBe(false);
    expect(focused()).toBe("Okafor");

    await settle(chart.update({ sort: "key" }));
    expect(chart.marks().map((m) => m.key)).toEqual(["Lindqvist", "Okafor", "Tanaka"]);
    expect(focused()).toBe("Okafor");
    press(mark("Okafor"), "ArrowDown");
    expect(focused()).toBe("Tanaka");
    press(mark("Tanaka"), "Home");
    expect(focused()).toBe("Lindqvist");
    expect(tabIndexes(svg)).toEqual(["Lindqvist 0", "Okafor -1", "Tanaka -1"]);
  });

  it("takes both pairs of arrows on columns", () => {
    const { mark } = setup({ x: "name", y: "goals" });
    tabTo(mark("Okafor"));
    press(mark("Okafor"), "ArrowRight");
    expect(focused()).toBe("Tanaka");
    press(mark("Tanaka"), "ArrowDown");
    expect(focused()).toBe("Lindqvist");
    press(mark("Lindqvist"), "ArrowLeft");
    press(mark("Tanaka"), "ArrowUp");
    expect(focused()).toBe("Okafor");
  });

  it("plays the hover story on focus, with source keyboard, and dims the others", () => {
    const hover = recorder();
    const { chart, svg, mark } = setup({ on: { hover: hover.effect } });
    const events = listen(chart);
    tabTo(mark("Okafor"));
    expect(events).toEqual(["hover Okafor keyboard"]);
    expect(hover.log).toEqual(["run Okafor"]);
    expect(svg.classList.contains("ec-hovering")).toBe(true);
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(true);
    press(mark("Okafor"), "ArrowDown");
    expect(events).toEqual(["hover Okafor keyboard", "leave Okafor", "hover Tanaka keyboard"]);
    expect(hover.log).toEqual(["run Okafor", "clear", "run Tanaka"]);
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(false);
    expect(mark("Tanaka").classList.contains("ec-hot")).toBe(true);
  });

  it("leaves on Escape, keeping focus, and on blur", () => {
    const hover = recorder();
    const { chart, svg, mark } = setup({ on: { hover: hover.effect } });
    const events = listen(chart);
    const button = document.body.appendChild(document.createElement("button"));
    tabTo(mark("Okafor"));
    expect(press(mark("Okafor"), "Escape").defaultPrevented).toBe(true);
    expect(events).toEqual(["hover Okafor keyboard", "leave Okafor"]);
    expect(hover.log).toEqual(["run Okafor", "clear"]);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    expect(focused()).toBe("Okafor");
    // Nothing left to leave.
    expect(press(mark("Okafor"), "Escape").defaultPrevented).toBe(false);
    press(mark("Okafor"), "ArrowDown");
    press(mark("Tanaka"), "Tab");
    button.focus();
    expect(events).toEqual(["hover Okafor keyboard", "leave Okafor", "hover Tanaka keyboard", "leave Tanaka"]);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
  });

  it("leaves focus from a click to the pointer's hover, without the ring", () => {
    const { chart, svg, mark } = setup();
    const events = listen(chart);
    const ring = svg.querySelector(".ec-focus")!;
    const target = mark("Okafor").querySelector(".ec-hit")!;
    pointer("pointerover", target);
    pointer("pointerdown", target);
    mark("Okafor").focus();
    expect(ring.getAttribute("visibility")).toBe("hidden");
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(events).toEqual(["hover Okafor pointer", "leave Okafor"]);
    // A key press makes the next focus a keyboard one.
    press(mark("Okafor"), "ArrowDown");
    expect(ring.getAttribute("visibility")).toBeNull();
    expect(events).toEqual(["hover Okafor pointer", "leave Okafor", "hover Tanaka keyboard"]);
  });

  it("shares one hover between the pointer and focus", () => {
    const { chart, svg, mark } = setup();
    const events = listen(chart);
    const hit = (key: string) => mark(key).querySelector(".ec-hit")!;
    const pointerLeaves = () => svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    tabTo(mark("Okafor"));
    // The pointer takes over, and when it leaves, focus stays without a hover.
    pointer("pointerover", hit("Tanaka"));
    pointerLeaves();
    expect(events).toEqual(["hover Okafor keyboard", "leave Okafor", "hover Tanaka pointer", "leave Tanaka"]);
    expect(focused()).toBe("Okafor");
    events.length = 0;
    // Focus arriving on the mark the pointer is over holds its hover; the pointer leaving doesn't end it.
    pointer("pointerover", hit("Tanaka"));
    press(mark("Okafor"), "ArrowDown");
    pointerLeaves();
    expect(mark("Tanaka").classList.contains("ec-hot")).toBe(true);
    pointer("pointerover", hit("Tanaka"));
    // Blur with the pointer still over it: the hover goes on, held by the pointer.
    mark("Tanaka").blur();
    expect(mark("Tanaka").classList.contains("ec-hot")).toBe(true);
    pointerLeaves();
    expect(events).toEqual(["hover Tanaka pointer", "leave Tanaka"]);
  });

  it("keeps focus on its key across an update, and replays the story after", async () => {
    const hover = recorder();
    const { chart, svg, mark, settle } = setup({ on: { hover: hover.effect } });
    const outs: string[] = [];
    svg.addEventListener("focusout", (e) => outs.push((e.target as Element).getAttribute("data-key")!));
    tabTo(mark("Tanaka"));
    await settle(chart.update({ sort: "key" }));
    expect(chart.marks().map((m) => m.key)).toEqual(["Lindqvist", "Okafor", "Tanaka"]);
    expect(focused()).toBe("Tanaka");
    expect(outs).toEqual([]);
    expect(hover.log).toEqual(["run Tanaka", "clear", "run Tanaka"]);
    expect(tabIndexes(svg)).toEqual(["Lindqvist -1", "Okafor -1", "Tanaka 0"]);
  });

  it("moves focus to the nearest mark when the focused one exits", async () => {
    const hover = recorder();
    const { chart, svg, mark, settle } = setup({ on: { hover: hover.effect } });
    const events = listen(chart);
    tabTo(mark("Tanaka"));
    // The one after it first.
    const leaving = mark("Tanaka");
    const updated = chart.update({ data: players.filter((p) => p.name !== "Tanaka") });
    expect(focused()).toBe("Lindqvist");
    expect(leaving.hasAttribute("tabindex")).toBe(false);
    expect(tabIndexes(svg)).toEqual(["Okafor -1", "Lindqvist 0"]);
    expect(events).toEqual(["hover Tanaka keyboard", "leave Tanaka", "hover Lindqvist keyboard"]);
    // The runner holds the new hover until the change settles.
    expect(hover.log).toEqual(["run Tanaka", "clear"]);
    await settle(updated);
    expect(hover.log).toEqual(["run Tanaka", "clear", "run Lindqvist"]);
    // At the end, the one before it.
    await settle(chart.update({ data: players.filter((p) => p.name === "Okafor") }));
    expect(focused()).toBe("Okafor");
    // With no marks left, focus leaves the chart.
    await settle(chart.update({ data: [] }));
    expect(document.activeElement).toBe(document.body);
    expect(events.slice(-2)).toEqual(["hover Okafor keyboard", "leave Okafor"]);
    expect(svg.querySelector(".ec-focus")?.getAttribute("visibility")).toBe("hidden");
    // Marks coming back bring the tab stop back.
    await settle(chart.update({ data: players }));
    expect(tabIndexes(svg)).toEqual(["Okafor 0", "Tanaka -1", "Lindqvist -1"]);
  });

  it("keeps focus on its mark while the window is in the background", async () => {
    const { chart, mark, settle } = setup();
    tabTo(mark("Tanaka"));
    // The window loses focus: the mark hears focusout, but it's still the document's active element.
    mark("Tanaka").dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await settle(chart.update({ sort: "key" }));
    expect(focused()).toBe("Tanaka");
    await settle(chart.update({ data: players.filter((p) => p.name !== "Tanaka") }));
    expect(focused()).toBe("Okafor");
  });

  it("draws the focus ring from the mark's outline, behind the marks, and follows it", async () => {
    const { chart, svg, mark, clock } = setup({ stack: ["goals", "assists"], sort: "value" });
    const ring = svg.querySelector(".ec-focus")!;
    const paths = Array.from(ring.querySelectorAll("path"));
    const outline = (key: string) => chart.marks().find((m) => m.key === key)!.outline.d;
    expect(ring.nextElementSibling?.getAttribute("class")).toBe("ec-marks");
    expect(ring.getAttribute("aria-hidden")).toBe("true");
    expect(ring.getAttribute("visibility")).toBe("hidden");
    tabTo(mark("Okafor"));
    expect(ring.getAttribute("visibility")).toBeNull();
    // A 2 px ring outside a 2 px gap: the marks are drawn over the rest.
    expect(paths.map((p) => [p.getAttribute("class"), p.getAttribute("d"), p.getAttribute("stroke-width")])).toEqual([
      ["ec-focus-ring", outline("Okafor"), "8"],
      ["ec-focus-gap", outline("Okafor"), "4"]
    ]);
    // Sorted by total: Okafor, Lindqvist, Tanaka.
    press(mark("Okafor"), "End");
    expect(paths[0]!.getAttribute("d")).toBe(outline("Tanaka"));
    // Part way through a change, it's where the mark is.
    const updated = chart.update({ data: players.map((p) => ({ ...p, goals: p.goals * 2 })) });
    clock.advance(250);
    expect(paths[0]!.getAttribute("d")).toBe(outline("Tanaka"));
    expect(paths[1]!.getAttribute("d")).toBe(outline("Tanaka"));
    clock.advance(1000);
    await updated;
    expect(paths[0]!.getAttribute("d")).toBe(outline("Tanaka"));
    // Escape leaves the story but not focus, so the ring stays.
    press(mark("Tanaka"), "Escape");
    expect(ring.getAttribute("visibility")).toBeNull();
    mark("Tanaka").blur();
    expect(ring.getAttribute("visibility")).toBe("hidden");
  });

  it("moves the focus ring with an effect that moves the mark", () => {
    const hover = recorder({ draw: (_mark, ctx) => ctx.mark.set({ transform: [1, 0, 0, 1, 5, -2] }) });
    const { svg, mark } = setup({ on: { hover: hover.effect } });
    const ring = svg.querySelector(".ec-focus")!;
    tabTo(mark("Okafor"));
    const body = mark("Okafor").querySelector(".ec-body")!;
    expect(body.getAttribute("transform")).toBe("matrix(1 0 0 1 5 -2)");
    expect(ring.getAttribute("transform")).toBe(body.getAttribute("transform"));
    // The next mark's ring starts where that mark is, and moves with its own effect.
    press(mark("Okafor"), "ArrowDown");
    expect(mark("Okafor").querySelector(".ec-body")!.getAttribute("transform")).toBeNull();
    expect(ring.getAttribute("transform")).toBe(mark("Tanaka").querySelector(".ec-body")!.getAttribute("transform"));
    // Escape clears the effect, and the ring, still showing, goes back with the mark.
    press(mark("Tanaka"), "Escape");
    expect(ring.getAttribute("transform")).toBeNull();
    expect(ring.getAttribute("visibility")).toBeNull();
  });

  it("labels each mark with its values, in the chart's format", async () => {
    const { chart, mark } = setup({ stack: ["goals", "assists"], format: (v) => v.toFixed(1) });
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: 16.0 goals, 4.0 assists");
    // The label says where the mark is heading as soon as a change starts.
    void chart.update({ data: players.map((p) => ({ ...p, assists: p.assists + 1 })) });
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: 16.0 goals, 5.0 assists");
    expect(setup({ x: "goals" }).mark("Tanaka").getAttribute("aria-label")).toBe("Tanaka: 6 goals");
    expect(setup({ x: (d) => d.goals + d.assists }).mark("Tanaka").getAttribute("aria-label")).toBe("Tanaka: 16");
  });

  it("jumps the story to its end state when motion is off", () => {
    const hover = recorder();
    const { mark } = setup({ on: { hover: hover.effect } }, { motion: quietMotion("off") });
    tabTo(mark("Okafor"));
    expect(hover.log).toEqual(["end Okafor"]);
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(true);
  });

  it("hears focus without focus listeners on its SVG elements, which Chrome would make tab stops", () => {
    const add = vi.spyOn(EventTarget.prototype, "addEventListener");
    setup();
    const onSvg = add.mock.contexts.filter((context, i) => context instanceof SVGElement && /^(focus|blur)/.test(String(add.mock.calls[i]![0])));
    expect(onSvg).toEqual([]);
    add.mockRestore();
  });

  it("works inside a shadow root", () => {
    const host = document.body.appendChild(document.createElement("div"));
    const container = host.attachShadow({ mode: "open" }).appendChild(document.createElement("div"));
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: quietMotion(), clock: manualClock() };
    const chart = barChart<Player>(container, { label: "Goals by player", data: players, y: "name", x: "goals", width: 600 }, env);
    const events = listen(chart);
    const okafor = chart.element.querySelector<SVGGElement>('.ec-mark[data-key="Okafor"]')!;
    tabTo(okafor);
    press(okafor, "ArrowDown");
    expect(events).toEqual(["hover Okafor keyboard", "leave Okafor", "hover Tanaka keyboard"]);
  });

  it("stops listening on destroy", () => {
    const hover = recorder();
    const { chart, mark } = setup({ on: { hover: hover.effect } });
    const okafor = mark("Okafor");
    chart.destroy();
    document.body.appendChild(okafor);
    okafor.focus();
    press(okafor, "ArrowDown");
    expect(hover.log).toEqual([]);
  });
});

describe("barChart: ARIA structure", () => {
  it("is a group named by the chart's label, its marks images named by their values", () => {
    const { svg, mark, keys } = setup({ stack: ["goals", "assists"], x: undefined, description: "Season to date" });
    expect(svg.getAttribute("role")).toBe("group");
    expect(svg.getAttribute("aria-label")).toBe("Goals by player");
    expect(svg.querySelector(":scope > desc")?.textContent).toBe("Season to date");
    for (const key of keys()) {
      const group = mark(key!);
      expect(group.getAttribute("role")).toBe("img");
      expect(group.getAttribute("aria-label")).toMatch(new RegExp(`^${key}: \\d+ goals, \\d+ assists$`));
    }
    // One tab stop: the roving tabindex is on the images themselves.
    expect(keys().map((key) => mark(key!).getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("reads nothing but the marks' names: text and decoration are hidden", () => {
    const { svg, mark } = setup();
    for (const text of svg.querySelectorAll("text")) expect(text.closest('[aria-hidden="true"]')).not.toBeNull();
    for (const name of ["ec-grid", "ec-axis", "ec-focus", "ec-overlay"]) expect(svg.querySelector(`.${name}`)!.getAttribute("aria-hidden")).toBe("true");
    expect(mark("Okafor").querySelector(".ec-label")!.getAttribute("aria-hidden")).toBe("true");
    expect(mark("Okafor").querySelector(".ec-value")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps a tooltip function's text as the image's description", () => {
    const { mark } = setup({ tooltip: (d) => `${d.name} plays up front` });
    const okafor = mark("Okafor");
    expect(okafor.getAttribute("role")).toBe("img");
    expect(okafor.getAttribute("aria-label")).toBe("Okafor: 16 goals");
    expect(document.getElementById(okafor.getAttribute("aria-describedby")!)!.textContent).toBe("Okafor plays up front");
  });

  describe("markDescription", () => {
    type WithPos = Player & { pos?: string };
    const description = (element: Element): string | null => {
      const id = element.getAttribute("aria-describedby");
      return id === null ? null : (document.getElementById(id)?.textContent ?? null);
    };

    it("describes with only the extra facts, so a tooltip that repeats the values isn't read twice", () => {
      const pos: Record<string, string> = { Okafor: "Forward", Tanaka: "Midfielder", Lindqvist: "Forward" };
      const { mark } = setup({
        tooltip: (d) => `${d.name} · ${pos[d.name]}\n${d.goals} goals`,
        markDescription: (d: WithPos) => pos[d.name] ?? ""
      });
      expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: 16 goals");
      expect(description(mark("Okafor"))).toBe("Forward");
      expect(mark("Okafor").querySelectorAll("desc.ec-description")).toHaveLength(1);
    });

    it("describes nothing when false, even with a tooltip function", () => {
      const { mark } = setup({ tooltip: (d) => `${d.name} plays up front`, markDescription: false });
      expect(mark("Okafor").hasAttribute("aria-describedby")).toBe(false);
      expect(mark("Okafor").querySelector("desc.ec-description")).toBeNull();
    });

    it("describes nothing for an empty string, and reports a throw without leaving the mark described", () => {
      const reportError = vi.fn();
      vi.stubGlobal("reportError", reportError);
      const boom = new Error("no position");
      const { mark } = setup({ markDescription: (d) => (d.name === "Okafor" ? "" : d.name === "Tanaka" ? (() => { throw boom; })() : "Forward") });
      expect(mark("Okafor").hasAttribute("aria-describedby")).toBe(false);
      expect(mark("Tanaka").hasAttribute("aria-describedby")).toBe(false);
      expect(description(mark("Lindqvist"))).toBe("Forward");
      expect(reportError).toHaveBeenCalledWith(boom);
      vi.unstubAllGlobals();
    });

    it("follows update(): set, changed and turned off", async () => {
      const { chart, mark, settle } = setup({ tooltip: (d) => `${d.name} plays up front` });
      expect(description(mark("Okafor"))).toBe("Okafor plays up front");
      await settle(chart.update({ markDescription: () => "Forward" }));
      expect(description(mark("Okafor"))).toBe("Forward");
      await settle(chart.update({ markDescription: false }));
      expect(mark("Okafor").hasAttribute("aria-describedby")).toBe(false);
    });

    it("rejects anything but false or a function", () => {
      const { container } = setup();
      expect(() =>
        barChart<Player>(container, { label: "Goals", data: players, y: "name", x: "goals", markDescription: true as unknown as false }, {
          presets: createRegistry<PresetFactory>({ kind: "preset" }),
          icons: { get: () => undefined },
          motion: quietMotion()
        })
      ).toThrow(/markDescription must be false or a function/);
    });
  });

  it("words each image's name with markLabel, given the row and the mark as it's heading", () => {
    const calls: unknown[][] = [];
    const format = (v: number) => v.toFixed(1);
    const { mark } = setup({
      stack: ["goals", "assists"],
      x: undefined,
      format,
      markLabel: (...args) => {
        calls.push(args);
        const [d, m] = args;
        return `${m.category} (${d.name}): ${m.values.map((v) => `${m.format(v.value)} ${v.series === "goals" ? "goal" : "assist"}${v.value === 1 ? "" : "s"}`).join(", ")}`;
      }
    });
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor (Okafor): 16.0 goals, 4.0 assists");
    expect(calls.map(([d]) => d)).toEqual(players);
    expect(calls[0]![1]).toEqual({
      key: "Okafor",
      category: "Okafor",
      values: [
        { series: "goals", label: "goals", value: 16 },
        { series: "assists", label: "assists", value: 4 }
      ],
      total: 20,
      format,
      text: "Okafor: 16.0 goals, 4.0 assists"
    });
    // A lone value read by a function is the series "value", as in the default name.
    const lone = setup({ x: (d) => d.goals + d.assists, markLabel: (d, m) => `${m.text} (${m.values[0]!.series})` });
    expect(lone.mark("Tanaka").getAttribute("aria-label")).toBe("Tanaka: 16 (value)");
  });

  it("renames as soon as an update starts: new data, a new stack, or a new markLabel", async () => {
    const calls: string[] = [];
    const markLabel = (d: Player, m: { readonly key: string; readonly values: readonly { readonly series: string; readonly value: number }[] }) => {
      calls.push(m.key);
      return `${d.name}: ${m.values.map((v) => `${v.series} ${v.value}`).join(" and ")}`;
    };
    const { chart, mark, settle } = setup({ markLabel });
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: goals 16");
    calls.length = 0;
    // Once per mark for the update, not once per frame.
    const more = chart.update({ data: players.map((p) => (p.name === "Okafor" ? { ...p, goals: 1 } : p)) });
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: goals 1");
    await settle(more);
    expect(calls.sort()).toEqual(["Lindqvist", "Okafor", "Tanaka"]);
    // Only the series the mark is heading for, while the one leaving the stack still shrinks.
    void chart.update({ x: undefined, stack: ["goals", "assists"] });
    expect(mark("Tanaka").getAttribute("aria-label")).toBe("Tanaka: goals 6 and assists 10");
    const stack = chart.update({ stack: ["assists"] });
    expect(mark("Tanaka").getAttribute("aria-label")).toBe("Tanaka: assists 10");
    await settle(stack);
    void chart.update({ markLabel: (d) => `${d.name}, assisted ${d.assists}` });
    expect(mark("Tanaka").getAttribute("aria-label")).toBe("Tanaka, assisted 10");
    void chart.update({ markLabel: undefined });
    expect(mark("Tanaka").getAttribute("aria-label")).toBe("Tanaka: 10 assists");
  });

  it("keeps the default name when markLabel gives none or throws, reporting the throw", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const named: Record<string, () => string> = {
      Okafor: () => "",
      Tanaka: () => "  ",
      Lindqvist: () => undefined as unknown as string
    };
    const { chart, mark } = setup({ markLabel: (d) => named[d.name]!() });
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: 16 goals");
    expect(mark("Tanaka").getAttribute("aria-label")).toBe("Tanaka: 6 goals");
    expect(mark("Lindqvist").getAttribute("aria-label")).toBe("Lindqvist: 10 goals");
    expect(reportError).not.toHaveBeenCalled();
    // A throw on one mark leaves the others named by the page.
    void chart.update({
      markLabel: (d) => {
        if (d.name === "Tanaka") throw new Error("no name");
        return `${d.name} scored ${d.goals}`;
      }
    });
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor scored 16");
    expect(mark("Tanaka").getAttribute("aria-label")).toBe("Tanaka: 6 goals");
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "no name" }));
  });

  it("rejects a markLabel that isn't a function", async () => {
    expect(() => setup({ markLabel: "name" as never })).toThrow(/markLabel must be a function/);
    const { chart, mark } = setup();
    await expect(chart.update({ markLabel: true as never })).rejects.toThrow(/markLabel must be a function/);
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: 16 goals");
  });

  it("hides a mark while it leaves, and shows one that comes back", async () => {
    const { chart, mark, settle } = setup();
    const leaving = chart.update({ data: players.filter((p) => p.name !== "Tanaka") });
    const tanaka = mark("Tanaka");
    expect(tanaka.getAttribute("aria-hidden")).toBe("true");
    expect(tanaka.hasAttribute("tabindex")).toBe(false);
    const back = chart.update({ data: players });
    expect(mark("Tanaka")).toBe(tanaka);
    expect(tanaka.hasAttribute("aria-hidden")).toBe(false);
    expect(tanaka.getAttribute("role")).toBe("img");
    await settle(Promise.all([leaving, back]));
  });
});

describe("barChart: series labels", () => {
  const labels = { goals: "Goals", assists: "Assists" };
  const stacked = { x: undefined, stack: ["goals", "assists"] } as const;
  const legend = (container: Element) => Array.from(container.querySelectorAll(".ec-legend-item"), (item) => [item.getAttribute("data-series"), item.textContent]);
  const headers = (container: Element) => Array.from(container.querySelectorAll(".ec-table thead th"), (th) => th.textContent);
  const tooltip = (container: Element) => Array.from(container.querySelector(".ec-tooltip")?.children ?? [], (line) => line.textContent);

  it("names each series by its label in the legend, the table's headers, the tooltip and the marks' names", () => {
    const { container, mark } = setup({ ...stacked, seriesLabels: labels });
    expect(legend(container)).toEqual([
      ["goals", "Goals"],
      ["assists", "Assists"]
    ]);
    expect(headers(container)).toEqual(["name", "Goals", "Assists", "Total"]);
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: 16 Goals, 4 Assists");
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    expect(tooltip(container)).toEqual(["Okafor", "16 Goals · 4 Assists", "20 total"]);
    // Segments, colours and effects still go by the series' own names.
    expect(Array.from(mark("Okafor").querySelectorAll(".ec-segment"), (path) => path.getAttribute("data-series"))).toEqual(["goals", "assists"]);
  });

  it("leaves a series without a label its own name, and gives markLabel each value's label", () => {
    const seen: string[][] = [];
    const { mark } = setup({
      ...stacked,
      seriesLabels: { goals: "Goals", shots: "Shots" },
      markLabel: (d, m) => {
        seen.push(m.values.map((v) => `${v.series}: ${v.label}`));
        return m.text;
      }
    });
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: 16 Goals, 4 assists");
    expect(seen[0]).toEqual(["goals: Goals", "assists: assists"]);
  });

  it("names a lone value read by a function only when it's labelled", () => {
    const sum = (d: Player) => d.goals + d.assists;
    expect(setup({ x: sum }).mark("Tanaka").getAttribute("aria-label")).toBe("Tanaka: 16");
    const { container, mark } = setup({ x: sum, seriesLabels: { value: "goals and assists" } });
    expect(mark("Tanaka").getAttribute("aria-label")).toBe("Tanaka: 16 goals and assists");
    expect(headers(container)).toEqual(["name", "goals and assists"]);
    pointer("pointerover", mark("Tanaka").querySelector(".ec-hit")!);
    expect(tooltip(container)).toEqual(["Tanaka", "16 goals and assists"]);
  });

  it("renames as soon as an update starts, and announces new series by their labels", async () => {
    const { container, chart, mark, settle } = setup({ ...stacked, announce: true });
    const said = () => container.querySelector(".ec-announcer")!.textContent!.trim();
    const renaming = chart.update({ seriesLabels: labels });
    expect(legend(container).map(([, name]) => name)).toEqual(["Goals", "Assists"]);
    expect(headers(container).slice(1, 3)).toEqual(["Goals", "Assists"]);
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: 16 Goals, 4 Assists");
    // The same view, newly named: nothing to say.
    expect(said()).toBe("");
    await settle(renaming);
    await settle(chart.update({ stack: ["assists"] }));
    expect(said()).toBe("Showing Assists");
    void chart.update({ seriesLabels: undefined });
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: 4 assists");
  });

  it("rejects labels that aren't names", async () => {
    expect(() => setup({ seriesLabels: ["Goals"] as never })).toThrow(/seriesLabels must be an object/);
    expect(() => setup({ seriesLabels: { goals: " " } })).toThrow(/seriesLabels\.goals must be a name, not blank/);
    expect(() => setup({ seriesLabels: { goals: 3 } as never })).toThrow(/seriesLabels\.goals must be a name, not 3/);
    const { chart, mark } = setup();
    await expect(chart.update({ seriesLabels: null as never })).rejects.toThrow(/seriesLabels must be an object/);
    expect(mark("Okafor").getAttribute("aria-label")).toBe("Okafor: 16 goals");
  });
});

describe("barChart: effects", () => {
  it("starts decorate and enter on every mark, in order", () => {
    const enter = recorder();
    const decorate = recorder();
    setup({ on: { enter: enter.effect, decorate: decorate.effect } });
    expect(enter.log).toEqual(["run Okafor", "run Tanaka", "run Lindqvist"]);
    expect(decorate.log).toEqual(["run Okafor", "run Tanaka", "run Lindqvist"]);
  });

  it("plays hover on the hovered mark and clears it on leave", () => {
    const hover = recorder();
    const { mark, svg } = setup({ on: { hover: hover.effect } });
    pointer("pointerover", mark("Tanaka").querySelector(".ec-hit")!);
    expect(hover.log).toEqual(["run Tanaka"]);
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(hover.log).toEqual(["run Tanaka", "clear"]);
  });

  it("resolves preset names through the presets it's handed", () => {
    const hover = recorder();
    const presets = createRegistry<PresetFactory>({ kind: "preset" });
    presets.register("nudge", () => hover.effect);
    const { mark } = setup({ on: { hover: "nudge" } }, { presets });
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    expect(hover.log).toEqual(["run Okafor"]);
    expect(() => setup({ on: { hover: "wigle" } })).toThrow(/Unknown preset "wigle"/);
  });

  it("draws runs in the overlay, above the marks, in the mark's colour", () => {
    const hover = recorder({ draw: (mark, ctx) => ctx.layer.path(mark.outline.d, { stroke: "mark", width: 2 }) });
    const { svg, mark } = setup({ on: { hover: hover.effect }, colors: { goals: 3 } });
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    const run = svg.querySelector(".ec-overlay > .ec-run") as SVGGElement;
    expect(run.getAttribute("data-key")).toBe("Okafor");
    expect(run.getAttribute("data-slot")).toBe("hover");
    expect(run.style.getPropertyValue("--ec-mark")).toBe("var(--ec-series-3, #02a471)");
    expect(run.querySelector("path")?.getAttribute("d")).toBe(mark("Okafor").querySelector(".ec-segment")?.getAttribute("d"));
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(svg.querySelector(".ec-overlay")?.childElementCount).toBe(0);
  });

  it("restyles the mark's body through ctx.mark, and resets it when the run is cleared", () => {
    const hover = recorder({ draw: (_mark, ctx) => ctx.mark.set({ opacity: 0.5, halo: { width: 8, opacity: 0.35 } }) });
    const { svg, mark } = setup({ on: { hover: hover.effect } });
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    const body = mark("Okafor").querySelector(".ec-body")!;
    expect(body.getAttribute("opacity")).toBe("0.5");
    expect(body.querySelectorAll(".ec-halo path")).toHaveLength(1);
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(body.getAttribute("opacity")).toBeNull();
    expect(body.querySelector(".ec-halo")).toBeNull();
  });

  it("runs update effects only where values changed, with the previous geometry; moved marks get change()", async () => {
    const update = recorder();
    const decorate = recorder();
    const { chart, settle } = setup({ on: { update: update.effect, decorate: decorate.effect } });
    const events: string[] = [];
    chart.on("update", (e) => events.push(`update ${e.mark.key} ${e.batch.index}/${e.batch.count} from ${Math.round(e.from.bounds.width)}`));
    const before = Math.round(chart.marks()[1]!.bounds.width);
    decorate.log.length = 0;
    await settle(chart.update({ data: players.map((p) => (p.name === "Tanaka" ? { ...p, goals: 7 } : p)) }));
    // The update run starts as the transition does, then hears every frame of it.
    expect(update.log[0]).toBe(`run Tanaka from ${before}`);
    expect(new Set(update.log.slice(1))).toEqual(new Set(["change Tanaka"]));
    expect(events).toEqual([`update Tanaka 0/1 from ${before}`]);
    // Nothing else changed value or place, so only Tanaka's decoration hears about it.
    expect(new Set(decorate.log)).toEqual(new Set(["change Tanaka"]));
    decorate.log.length = 0;
    await settle(chart.update({ sort: "value" }));
    expect(update.log.filter((entry) => entry.startsWith("run"))).toHaveLength(1);
    expect(new Set(decorate.log)).toEqual(new Set(["change Lindqvist", "change Tanaka"]));
  });

  it("replays hover after an update", async () => {
    const hover = recorder();
    const { chart, mark, settle } = setup({ on: { hover: hover.effect } });
    pointer("pointerover", mark("Tanaka").querySelector(".ec-hit")!);
    await settle(chart.update({ sort: "key" }));
    expect(hover.log).toEqual(["run Tanaka", "clear", "run Tanaka"]);
    expect(mark("Tanaka").classList.contains("ec-hot")).toBe(true);
  });

  it("removes a mark once its exit effect is done", async () => {
    const exit = recorder({ hold: true });
    const { chart, mark, keys, clock } = setup({ on: { exit: exit.effect } });
    const events: string[] = [];
    chart.on("exit", (e) => events.push(`exit ${e.mark.key}`));
    const updated = chart.update({ data: players.filter((p) => p.name !== "Tanaka") });
    expect(exit.log).toEqual(["run Tanaka"]);
    expect(events).toEqual(["exit Tanaka"]);
    expect(mark("Tanaka").classList.contains("ec-leaving")).toBe(true);
    expect(chart.marks().map((m) => m.key)).toEqual(["Okafor", "Lindqvist"]);
    // The transition settles with it faded out, but its exit effect is still running.
    clock.advance(1000);
    await flush();
    expect(keys()).toContain("Tanaka");
    expect(mark("Tanaka").querySelector(".ec-label")?.getAttribute("opacity")).toBe("0");
    exit.release();
    await updated;
    expect(keys()).toEqual(["Okafor", "Lindqvist"]);
  });

  it("keeps the element of a mark that comes back mid-exit", async () => {
    const exit = recorder({ hold: true });
    const enter = recorder();
    const { chart, mark, settle } = setup({ on: { exit: exit.effect, enter: enter.effect } });
    const tanaka = mark("Tanaka");
    const leaving = chart.update({ data: players.filter((p) => p.name !== "Tanaka") });
    const back = chart.update({ data: players });
    await settle(Promise.all([leaving, back]));
    expect(mark("Tanaka")).toBe(tanaka);
    expect(tanaka.classList.contains("ec-leaving")).toBe(false);
    expect(enter.log.filter((entry) => entry.startsWith("run"))).toEqual(["run Okafor", "run Tanaka", "run Lindqvist", "run Tanaka"]);
  });

  it("emits enter events with their batch", async () => {
    const { chart, settle } = setup();
    const events: string[] = [];
    chart.on("enter", (e) => events.push(`${e.mark.key} ${e.batch.index}/${e.batch.count} ${e.data.datum.name}`));
    await settle(chart.update({ data: [...players, { name: "Moreau", goals: 8, assists: 3 }, { name: "Reyes", goals: 5, assists: 4 }] }));
    expect(events).toEqual(["Moreau 0/2 Moreau", "Reyes 1/2 Reyes"]);
  });

  it("leaves a hovered mark that exits", async () => {
    const { chart, svg, mark, settle } = setup();
    const events: string[] = [];
    chart.on("leave", (e) => events.push(`leave ${e.mark.key}`));
    pointer("pointerover", mark("Tanaka").querySelector(".ec-hit")!);
    await settle(chart.update({ data: players.filter((p) => p.name !== "Tanaka") }));
    expect(events).toEqual(["leave Tanaka"]);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
  });

  it("contains a listener that throws", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const { chart, mark } = setup();
    const after = vi.fn();
    chart.on("hover", () => {
      throw new Error("listener");
    });
    chart.on("hover", after);
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "listener" }));
    expect(after).toHaveBeenCalledOnce();
  });

  it("checks the series data effects need, when created and on update", async () => {
    const seen: (number | undefined)[] = [];
    const needsAssists: DataEffect<Player> = {
      kind: "data",
      needs: { related: ["assists"] },
      run: async (_mark, data) => {
        seen.push(data.related("assists")?.samples[1]?.value);
      },
      end: () => {},
      clear: () => {}
    };
    expect(() => setup({ on: { decorate: needsAssists } })).toThrow(/on\.decorate needs the series "assists", but the chart's series are "goals"/);
    const { chart, mark } = setup({ stack: ["goals", "assists"], on: { decorate: needsAssists } });
    expect(seen[0]).toBeCloseTo(20);
    await expect(chart.update({ stack: ["goals"] })).rejects.toThrow(/needs the series "assists"/);
    expect(mark("Okafor").querySelectorAll(".ec-segment")).toHaveLength(2);
  });

  it("recolours overlays drawn in the mark's colour when that colour changes", async () => {
    const decorate = recorder({ draw: (mark, ctx) => ctx.layer.path(mark.outline.d, { stroke: "mark" }) });
    const { chart, svg, settle } = setup({ on: { decorate: decorate.effect } });
    const run = () => (svg.querySelector('.ec-run[data-key="Okafor"]') as SVGGElement).style.getPropertyValue("--ec-mark");
    expect(run()).toBe("var(--ec-series-1, #2a78d6)");
    await chart.update({ colors: { goals: 3 } });
    expect(run()).toBe("var(--ec-series-3, #02a471)");
    // A different first series: assists takes the first free slot.
    await settle(chart.update({ stack: ["assists"] }));
    expect(run()).toBe("var(--ec-series-1, #2a78d6)");
  });
});

describe("barChart: update", () => {
  it("jumps to the new state at once when motion is off", () => {
    const { chart, mark, clock } = setup({}, { motion: quietMotion("off") });
    void chart.update({ stack: ["goals", "assists"], label: "Goals and assists" });
    expect(mark("Okafor").querySelectorAll(".ec-segment")).toHaveLength(2);
    expect(mark("Okafor").querySelector(".ec-value")?.textContent).toBe("20");
    expect(chart.element.getAttribute("aria-label")).toBe("Goals and assists");
    expect(clock.idle).toBe(true);
  });

  it("rejects what it can't take, leaving the chart as it was", async () => {
    const { chart, keys } = setup();
    await expect(chart.update({ data: [...players, players[0]!] })).rejects.toThrow(/two rows have the key "Okafor"/);
    await expect(chart.update({ on: { hover: "wiggle" } })).rejects.toThrow(/`on` can't be changed/);
    await expect(chart.update({ motion: "off" })).rejects.toThrow(/`motion` can't be changed/);
    expect(keys()).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
  });

  it("unsubscribes listeners and rejects unknown events", () => {
    const { chart, mark } = setup();
    const listener = vi.fn();
    const off = chart.on("hover", listener);
    off();
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    expect(listener).not.toHaveBeenCalled();
    expect(() => chart.on("click" as never, () => {})).toThrow(/unknown event "click"/);
  });
});

describe("barChart: transitions", () => {
  /** Where a mark is on screen now. */
  const at = (chart: BarChart<Player>, key: string) => chart.marks().find((m) => m.key === key)!.bounds;
  // Goals and assists swapped: 4, 10 and 7 goals. The scale halves (0–20 becomes 0–10), and sorted by
  // value Okafor goes from the top to the bottom.
  const swapped = players.map((p) => ({ ...p, goals: p.assists }));
  const tanakaScores = (goals: number) => players.map((p) => (p.name === "Tanaka" ? { ...p, goals } : p));

  it("stages a change in presentation: values first, then positions, about 500 ms each", async () => {
    const { chart, clock, svg, mark } = setup({ sort: "value" });
    const ticks = () => Array.from(svg.querySelectorAll(".ec-axis .ec-tick"), (t) => [t.textContent, t.getAttribute("opacity")]);
    const start = at(chart, "Okafor");
    const updated = chart.update({ data: swapped });
    expect(at(chart, "Okafor")).toEqual(start);

    // Values: the bar resizes in place, its label counts, and the ticks the scale loses fade out.
    clock.advance(250);
    const resizing = at(chart, "Okafor");
    expect(resizing.y).toBe(start.y);
    expect(resizing.width).toBeLessThan(start.width);
    expect(mark("Okafor").querySelector(".ec-value")?.textContent).toBe("10");
    expect(ticks().filter(([text]) => text === "15" || text === "20")).toEqual([
      ["15", "0.5"],
      ["20", "0.5"]
    ]);
    clock.advance(250);
    const resized = at(chart, "Okafor");
    expect(resized.y).toBe(start.y);

    // Positions: Okafor moves to the bottom, at its new size.
    clock.advance(250);
    const moving = at(chart, "Okafor");
    expect(moving.width).toBeCloseTo(resized.width, 6);
    expect(moving.y).toBeGreaterThan(start.y);
    clock.advance(250);
    await updated;
    expect(at(chart, "Okafor").width).toBeCloseTo(resized.width, 6);
    expect(at(chart, "Okafor").y).toBeGreaterThan(moving.y);
    expect(chart.marks().map((m) => m.key)).toEqual(["Tanaka", "Lindqvist", "Okafor"]);
    expect(ticks()).toEqual([
      ["0", null],
      ["5", null],
      ["10", null]
    ]);
  });

  it("runs the whole change as one short stage in analysis", async () => {
    const { chart, clock } = setup({ sort: "value" }, { motion: quietMotion("analysis") });
    const start = at(chart, "Okafor");
    let settled = false;
    void chart.update({ data: swapped }).then(() => (settled = true));
    clock.advance(100);
    await flush();
    // Resizing and moving at once.
    expect(at(chart, "Okafor").width).toBeLessThan(start.width);
    expect(at(chart, "Okafor").y).toBeGreaterThan(start.y);
    expect(settled).toBe(false);
    clock.advance(100);
    await flush();
    expect(settled).toBe(true);
  });

  it("jumps under reduced motion until the viewer picks a mode", async () => {
    const motion = createMotion({ reducedMotion: { matches: true, subscribe: () => () => {} } });
    const { chart, clock, settle } = setup({ sort: "value" }, { motion });
    void chart.update({ data: swapped });
    expect(clock.idle).toBe(true);
    expect(at(chart, "Okafor").y).toBeGreaterThan(at(chart, "Tanaka").y);
    motion.chooseMode("presentation");
    const back = chart.update({ data: players });
    expect(clock.idle).toBe(false);
    expect(await settle(back)).toBeGreaterThanOrEqual(1000);
  });

  it("skips a stage with nothing to do", async () => {
    const { chart, clock, settle } = setup();
    // A re-sort only moves rows, so they start at once.
    const start = at(chart, "Okafor").y;
    const sorted = chart.update({ sort: "key" });
    clock.advance(100);
    expect(at(chart, "Okafor").y).toBeGreaterThan(start);
    expect(100 + (await settle(sorted))).toBeLessThan(540);
    // A new value that keeps the order and the scale only resizes.
    expect(await settle(chart.update({ data: tanakaScores(7) }))).toBeLessThan(540);
    // Both: the full second.
    expect(await settle(chart.update({ data: swapped, sort: "value" }))).toBeGreaterThanOrEqual(1000);
    // Nothing at all settles at once.
    let settled = false;
    void chart.update({ label: "Assists by player" }).then(() => (settled = true));
    expect(clock.idle).toBe(true);
    await flush();
    expect(settled).toBe(true);
  });

  it("retargets values from where they are when another update arrives mid-flight", async () => {
    const { chart, clock, settle } = setup();
    const start = at(chart, "Tanaka").width;
    let superseded = false;
    void chart.update({ data: tanakaScores(2) }).then(() => (superseded = true));
    clock.advance(250);
    const mid = at(chart, "Tanaka").width;
    expect(mid).toBeLessThan(start);
    const back = chart.update({ data: players });
    // Nothing jumps, and the first update resolves now that it's been superseded.
    expect(at(chart, "Tanaka").width).toBe(mid);
    await flush();
    expect(superseded).toBe(true);
    // It heads back at once, easing out rather than stalling.
    clock.advance(16);
    expect(at(chart, "Tanaka").width - mid).toBeGreaterThan(0.05 * (start - mid));
    await settle(back);
    expect(at(chart, "Tanaka").width).toBeCloseTo(start, 6);
  });

  it("retargets rows mid-move", async () => {
    const { chart, clock, settle } = setup();
    const start = at(chart, "Okafor").y;
    void chart.update({ sort: "key" });
    clock.advance(250);
    const mid = at(chart, "Okafor").y;
    expect(mid).toBeGreaterThan(start);
    const back = chart.update({ sort: "none" });
    expect(at(chart, "Okafor").y).toBe(mid);
    clock.advance(16);
    expect(at(chart, "Okafor").y).toBeLessThan(mid);
    await settle(back);
    expect(at(chart, "Okafor").y).toBe(start);
  });

  it("grows entering bars in at their slots in the second half of the positions stage", async () => {
    const { chart, clock, svg, mark } = setup();
    const height = Number(svg.getAttribute("height"));
    const updated = chart.update({ data: [...players, { name: "Moreau", goals: 8, assists: 3 }] });
    const label = () => mark("Moreau").querySelector(".ec-label")?.getAttribute("opacity");
    expect(label()).toBe("0");
    expect(at(chart, "Moreau").width).toBe(0);
    // No value changes, so positions start at once: the chart grows to make room.
    clock.advance(125);
    expect(Number(svg.getAttribute("height"))).toBeGreaterThan(height);
    expect(at(chart, "Moreau").width).toBe(0);
    clock.advance(250);
    expect(at(chart, "Moreau").width).toBeGreaterThan(0);
    expect(Number(label())).toBeGreaterThan(0);
    expect(Number(label())).toBeLessThan(1);
    expect(mark("Moreau").querySelector(".ec-value")?.textContent).toBe("8");
    clock.advance(125);
    await updated;
    expect(label()).toBeNull();
    expect(at(chart, "Moreau").y).toBeGreaterThan(at(chart, "Lindqvist").y);
    expect(Number(svg.getAttribute("height"))).toBe(height + 34);
  });

  it("shrinks and fades leaving bars first, then closes the gap", async () => {
    const { chart, clock, mark, keys } = setup();
    const tanaka = mark("Tanaka");
    const tip = () => Number(tanaka.querySelector(".ec-value")?.getAttribute("x"));
    const opacity = () => tanaka.querySelector(".ec-label")?.getAttribute("opacity");
    const start = { tip: tip(), tanaka: at(chart, "Tanaka").y, lindqvist: at(chart, "Lindqvist").y };
    const updated = chart.update({ data: players.filter((p) => p.name !== "Tanaka") });
    clock.advance(250);
    expect(tanaka.classList.contains("ec-leaving")).toBe(true);
    expect(tip()).toBeLessThan(start.tip);
    expect(opacity()).toBe("0.5");
    // Its value label keeps its value rather than counting down.
    expect(tanaka.querySelector(".ec-value")?.textContent).toBe("6");
    expect(at(chart, "Lindqvist").y).toBe(start.lindqvist);
    clock.advance(250);
    expect(opacity()).toBe("0");
    expect(at(chart, "Lindqvist").y).toBe(start.lindqvist);
    clock.advance(250);
    expect(at(chart, "Lindqvist").y).toBeLessThan(start.lindqvist);
    expect(keys()).toContain("Tanaka");
    clock.advance(250);
    await updated;
    expect(keys()).toEqual(["Okafor", "Lindqvist"]);
    expect(at(chart, "Lindqvist").y).toBe(start.tanaka);
  });

  it("clears hover while a change plays and replays it after, with the final geometry", async () => {
    const ys: number[] = [];
    const hover = recorder({ draw: (mark) => ys.push(mark.bounds.y) });
    const { chart, clock, mark, settle } = setup({ on: { hover: hover.effect } });
    pointer("pointerover", mark("Tanaka").querySelector(".ec-hit")!);
    const updated = chart.update({ sort: "value" });
    expect(hover.log).toEqual(["run Tanaka", "clear"]);
    clock.advance(250);
    // A mark hovered mid-change waits for it to settle.
    pointer("pointerover", mark("Lindqvist").querySelector(".ec-hit")!);
    expect(hover.log).toEqual(["run Tanaka", "clear"]);
    await settle(updated);
    expect(hover.log).toEqual(["run Tanaka", "clear", "run Lindqvist"]);
    expect(ys[ys.length - 1]).toBe(at(chart, "Lindqvist").y);
  });

  it("reports hover with the geometry on screen while a change plays", async () => {
    const { chart, clock, mark, settle } = setup();
    const hovers: number[] = [];
    chart.on("hover", (e) => hovers.push(e.mark.bounds.y));
    const start = at(chart, "Okafor").y;
    const sorted = chart.update({ sort: "key" });
    clock.advance(250);
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    const mid = at(chart, "Okafor").y;
    expect(mid).toBeGreaterThan(start);
    expect(hovers).toEqual([mid]);
    await settle(sorted);
    expect(at(chart, "Okafor").y).toBeGreaterThan(mid);
  });

  it("starts exit effects from the shape on screen when a change is interrupted", async () => {
    const widths: number[] = [];
    const exit = recorder({ draw: (mark) => widths.push(mark.bounds.width) });
    const { chart, clock, settle } = setup({ on: { exit: exit.effect } });
    const events: number[] = [];
    chart.on("exit", (e) => events.push(e.mark.bounds.width));
    const start = at(chart, "Tanaka").width;
    void chart.update({ data: tanakaScores(2) });
    clock.advance(250);
    const mid = at(chart, "Tanaka").width;
    expect(mid).toBeLessThan(start);
    await settle(chart.update({ data: players.filter((p) => p.name !== "Tanaka") }));
    expect(widths).toEqual([mid]);
    expect(events).toEqual([mid]);
  });

  it("fires update effects only when values change, never for a re-sort alone", async () => {
    const update = recorder();
    const { chart, clock, settle } = setup({ on: { update: update.effect } });
    const events = vi.fn();
    chart.on("update", events);
    await settle(chart.update({ sort: "key" }));
    expect(update.log).toEqual([]);
    void chart.update({ data: tanakaScores(7) });
    clock.advance(100);
    // A re-sort mid-change carries the change on without firing update again.
    await settle(chart.update({ sort: "value" }));
    expect(update.log.filter((entry) => entry.startsWith("run"))).toEqual([expect.stringMatching(/^run Tanaka/)]);
    expect(events).toHaveBeenCalledOnce();
  });

  it("clamps in-between values, so a stack can turn negative without an undrawable frame", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const rows = [
      { name: "Okafor", goals: 3, assists: 2 },
      { name: "Tanaka", goals: 1, assists: 1 }
    ];
    const { chart, clock, settle } = setup({ data: rows, stack: ["goals", "assists"] });
    const updated = chart.update({ data: [{ name: "Okafor", goals: -1, assists: -4 }, rows[1]!] });
    const sizes: number[] = [];
    for (let t = 0; t < 1000; t += 20) {
      clock.advance(20);
      sizes.push(...chart.marks()[0]!.segments!.map((segment) => segment.length));
    }
    await settle(updated);
    expect(reportError).not.toHaveBeenCalled();
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0);
    // It grows to the left of zero now.
    expect(chart.marks()[0]!.angle(0)).toBeCloseTo(Math.PI);
  });

  it("animates columns the same way", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const { chart, clock, settle } = setup({ x: "name", y: "goals", sort: "value" });
    const start = at(chart, "Okafor");
    const updated = chart.update({ data: swapped });
    clock.advance(250);
    expect(at(chart, "Okafor").height).toBeLessThan(start.height);
    expect(at(chart, "Okafor").x).toBe(start.x);
    clock.advance(500);
    expect(at(chart, "Okafor").x).toBeGreaterThan(start.x);
    await settle(updated);
    expect(chart.marks().map((m) => m.key)).toEqual(["Tanaka", "Lindqvist", "Okafor"]);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("lands at once when the viewer turns motion off mid-change", async () => {
    const motion = quietMotion();
    const { chart, clock } = setup({ sort: "value" }, { motion });
    const updated = chart.update({ data: swapped });
    clock.advance(250);
    motion.chooseMode("off");
    clock.advance(16);
    await updated;
    expect(at(chart, "Okafor").y).toBeGreaterThan(at(chart, "Tanaka").y);
    expect(clock.idle).toBe(true);
  });
});

describe("barChart: size", () => {
  function stubResizeObserver() {
    const observers: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];
    class FakeResizeObserver {
      readonly disconnect = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        observers.push({ callback, disconnect: this.disconnect });
      }
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const resize = (width: number) =>
      observers.forEach(({ callback }) => callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver));
    return { observers, resize };
  }

  it("follows the container's width on the next frame, without data events", () => {
    const { resize } = stubResizeObserver();
    const decorate = recorder();
    const { chart, svg, clock } = setup({ width: undefined, on: { decorate: decorate.effect } });
    const updates = vi.fn();
    chart.on("update", updates);
    decorate.log.length = 0;
    resize(400);
    resize(420);
    expect(svg.getAttribute("width")).toBe("640");
    clock.advance(16);
    expect(svg.getAttribute("width")).toBe("420");
    expect(svg.getAttribute("viewBox")).toMatch(/^0 0 420 /);
    expect(decorate.log).toEqual(["change Okafor", "change Tanaka", "change Lindqvist"]);
    expect(updates).not.toHaveBeenCalled();
  });

  it("lands a change in flight when the width changes", async () => {
    const { resize } = stubResizeObserver();
    const { chart, svg, clock } = setup({ width: undefined });
    let settled = false;
    void chart.update({ sort: "key" }).then(() => (settled = true));
    clock.advance(100);
    resize(420);
    clock.advance(16);
    await flush();
    expect(settled).toBe(true);
    expect(svg.getAttribute("width")).toBe("420");
    expect(clock.idle).toBe(true);
    expect(chart.marks()[0]!.key).toBe("Lindqvist");
    expect(chart.marks()[0]!.bounds.y).toBe(11);
  });

  it("keeps a fixed width", () => {
    const { resize } = stubResizeObserver();
    const { svg, clock } = setup({ width: 500 });
    resize(300);
    clock.advance(16);
    expect(svg.getAttribute("width")).toBe("500");
  });

  it("stops observing on destroy", () => {
    const { observers } = stubResizeObserver();
    setup({ width: undefined }).chart.destroy();
    expect(observers[0]!.disconnect).toHaveBeenCalled();
  });
});

describe("barChart: destroy", () => {
  it("clears every effect, stops listening and removes the chart", () => {
    const hover = recorder();
    const decorate = recorder();
    const motion = quietMotion();
    const { chart, svg, container, mark } = setup({ on: { hover: hover.effect, decorate: decorate.effect } }, { motion });
    const target = mark("Okafor").querySelector(".ec-hit")!;
    pointer("pointerover", target);
    const listener = vi.fn();
    chart.on("leave", listener);
    chart.destroy();
    expect(hover.log).toEqual(["run Okafor", "clear"]);
    expect(decorate.log.filter((entry) => entry === "clear")).toHaveLength(3);
    expect(container.contains(svg)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    pointer("pointerover", target);
    motion.chooseMode("off");
    expect(hover.log).toEqual(["run Okafor", "clear"]);
    expect(() => chart.destroy()).not.toThrow();
    return expect(chart.update({ sort: "key" })).resolves.toBeUndefined();
  });
});
