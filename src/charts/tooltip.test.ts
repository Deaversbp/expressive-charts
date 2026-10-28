import { createMotion, manualClock, matrix, type GeometryEffect, type MarkGeometry, type Matrix, type MotionMode } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { barChart, type ChartEnv } from "./bar";
import { donutChart } from "./donut";
import { lineChart } from "./line";
import { link } from "./link";
import { svgElement } from "./render/svg";
import { chartSwitch } from "./switch";
import { chartTooltip, placeTooltip, summaryContent, type TooltipOption } from "./tooltip";
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

/** The size jsdom can't measure, given to every box. */
const TIP = { width: 120, height: 50 };

function quietMotion(mode: MotionMode = "presentation") {
  return createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
}

function setup(options: Partial<BarChartOptions<Player>> = {}, mode: MotionMode = "presentation") {
  const container = document.body.appendChild(document.createElement("div"));
  const clock = manualClock();
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: quietMotion(mode), clock };
  const chart = barChart<Player>(container, { label: "Goals by player", data: players, y: "name", x: "goals", width: 600, ...options }, env);
  const svg = chart.element;
  const mark = (key: string) => svg.querySelector(`.ec-mark[data-key="${key}"]`) as SVGGElement;
  const hit = (key: string) => mark(key).querySelector(".ec-hit")!;
  const geometry = (key: string) => chart.marks().find((m) => m.key === key)!;
  const tip = () => container.querySelector<HTMLElement>(".ec-tooltip");
  const shown = () => tip()?.classList.contains("ec-tooltip-shown") ?? false;
  const lines = () => Array.from(tip()?.children ?? [], (line) => line.textContent);
  const settle = (running: Promise<unknown>) => play(clock, running);
  return { container, chart, svg, clock, mark, hit, geometry, tip, shown, lines, settle };
}

function pointer(type: string, target: Element, pointerType = "mouse"): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType }));
}

function tap(target: Element): void {
  pointer("pointerdown", target, "touch");
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function tabTo(target: SVGElement): void {
  press(document.body, "Tab");
  target.focus();
}

const px = (value: number) => `${Math.round(value)}px`;

/** A hover effect that moves the mark by `transform` and holds it there until it's cleared. */
function moving(transform: Matrix | ((mark: MarkGeometry) => Matrix)): GeometryEffect {
  return {
    kind: "geometry",
    run(mark, ctx) {
      ctx.mark.set({ transform: typeof transform === "function" ? transform(mark) : transform });
      return new Promise<void>((resolve) => ctx.signal.addEventListener("abort", () => resolve()));
    },
    end() {},
    clear() {}
  };
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => TIP.width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => TIP.height);
});

afterEach(() => {
  document.body.textContent = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("placeTooltip", () => {
  const box = { width: 600, height: 300 };

  it("centres the box above the mark, 12 px off it", () => {
    expect(placeTooltip({ x: 300, top: 150, bottom: 170 }, TIP, box)).toEqual({ x: 240, y: 88, side: "above" });
  });

  it("flips below the mark when there's no room above", () => {
    expect(placeTooltip({ x: 300, top: 40, bottom: 60 }, TIP, box)).toEqual({ x: 240, y: 72, side: "below" });
  });

  it("takes the side with more room when neither has enough, and never covers the mark", () => {
    const short = { width: 600, height: 120 };
    expect(placeTooltip({ x: 300, top: 40, bottom: 60 }, TIP, short)).toEqual({ x: 240, y: 72, side: "below" });
    expect(placeTooltip({ x: 300, top: 60, bottom: 80 }, TIP, short)).toEqual({ x: 240, y: -2, side: "above" });
  });

  it("clamps to the left and right edges, and to the left edge when it's wider than the box", () => {
    expect(placeTooltip({ x: 20, top: 150, bottom: 170 }, TIP, box).x).toBe(0);
    expect(placeTooltip({ x: 590, top: 150, bottom: 170 }, TIP, box).x).toBe(480);
    expect(placeTooltip({ x: 300, top: 150, bottom: 170 }, { width: 700, height: 50 }, box).x).toBe(0);
  });
});

describe("summaryContent", () => {
  const format = (value: number) => value.toFixed(1);

  it("gives the category, each series' value in the format and, for a stack, the total", () => {
    const values = [
      { series: "goals", value: 16 },
      { series: "assists", value: 4 }
    ];
    expect(summaryContent("Okafor", values, format)).toEqual({ title: "Okafor", lines: ["16.0 goals · 4.0 assists", "20.0 total"] });
    expect(summaryContent("Okafor", values.slice(0, 1), format)).toEqual({ title: "Okafor", lines: ["16.0 goals"] });
  });

  it("leaves a lone value read by a function unnamed, unless it's labelled", () => {
    expect(summaryContent("Okafor", [{ series: "value", value: 16 }], format)).toEqual({ title: "Okafor", lines: ["16.0"] });
    expect(summaryContent("Okafor", [{ series: "value", label: "points", value: 16 }], format)).toEqual({ title: "Okafor", lines: ["16.0 points"] });
  });

  it("leaves the total out with total: false, for series that don't add up", () => {
    const values = [
      { series: "goals", value: 15 },
      { series: "xg", value: 14.2 }
    ];
    expect(summaryContent("12", values, format, { total: false })).toEqual({ title: "12", lines: ["15.0 goals · 14.2 xg"] });
    expect(summaryContent("12", values, format, { total: true })).toEqual({ title: "12", lines: ["15.0 goals · 14.2 xg", "29.2 total"] });
  });

  it("says each series by its label when it has one", () => {
    const values = [
      { series: "goals", label: "Goals", value: 16 },
      { series: "assists", value: 4 }
    ];
    expect(summaryContent("Okafor", values, format)).toEqual({ title: "Okafor", lines: ["16.0 Goals · 4.0 assists", "20.0 total"] });
  });
});

describe("chartTooltip: at a point", () => {
  interface Week {
    week: number;
    goals: number;
  }

  /** A tooltip for a 600 × 300 viewBox, which jsdom draws at that size from the page's top left. */
  function atPoint(option: TooltipOption<Week> = true) {
    const container = document.body.appendChild(document.createElement("div"));
    const svg = svgElement("svg", { viewBox: "0 0 600 300" }, container);
    const tooltip = chartTooltip<Week>(svg, { motion: { duration: (ms) => ms }, option: () => option });
    const tip = () => container.querySelector<HTMLElement>(".ec-tooltip");
    const summary = () => ({ title: "12", lines: ["15 goals · 14.2 xg"] });
    return { svg, tooltip, tip, summary };
  }

  it("centres on the point's x, above its top, or below its bottom when there's no room above", () => {
    const { svg, tooltip, tip, summary } = atPoint();
    const row = { datum: { week: 12, goals: 15 } };
    tooltip.showAt({ x: 300, top: 150, bottom: 200 }, row, summary);
    expect(tip()!.parentElement!.previousElementSibling).toBe(svg);
    expect(tip()!.classList.contains("ec-tooltip-shown")).toBe(true);
    expect(Array.from(tip()!.children, (line) => line.textContent)).toEqual(["12", "15 goals · 14.2 xg"]);
    expect(tip()!.style.left).toBe(px(300 - TIP.width / 2));
    expect(tip()!.style.top).toBe(px(150 - 12 - TIP.height));
    expect(tip()!.getAttribute("data-side")).toBe("above");
    // Near the top: below the lowest point, clear of every point the crosshair crosses.
    tooltip.showAt({ x: 590, top: 40, bottom: 90 }, row, summary);
    expect(tip()!.style.left).toBe(px(600 - TIP.width));
    expect(tip()!.style.top).toBe(px(90 + 12));
    expect(tip()!.getAttribute("data-side")).toBe("below");
    tooltip.hide();
    expect(tip()!.classList.contains("ec-tooltip-shown")).toBe(false);
  });

  it("follows the <svg>'s scale and its viewBox's origin", () => {
    const { svg, tooltip, tip, summary } = atPoint();
    svg.setAttribute("viewBox", "-20 -10 600 300");
    const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height }) as DOMRect;
    svg.getBoundingClientRect = () => rect(0, 0, 300, 150);
    tooltip.showAt({ x: 280, top: 140, bottom: 190 }, { datum: { week: 12, goals: 15 } }, summary);
    // At half size: x 280 is 150 px in, and the top 140 is 75 px down.
    expect(tip()!.style.left).toBe(px(150 - TIP.width / 2));
    expect(tip()!.style.top).toBe(px(75 - 12 - TIP.height));
  });

  it("shows a tooltip function's text from the row, and nothing for an empty string or tooltip: false", () => {
    const point = { x: 300, top: 150, bottom: 200 };
    const custom = atPoint((d) => (d.goals > 0 ? `Week ${d.week}: ${d.goals}` : ""));
    custom.tooltip.showAt(point, { datum: { week: 12, goals: 15 } }, custom.summary);
    expect(custom.tip()!.textContent).toBe("Week 12: 15");
    custom.tooltip.showAt(point, { datum: { week: 13, goals: 0 } }, custom.summary);
    expect(custom.tip()!.classList.contains("ec-tooltip-shown")).toBe(false);
    const off = atPoint(false);
    off.tooltip.showAt(point, { datum: { week: 12, goals: 15 } }, off.summary);
    expect(off.tip()).toBeNull();
  });
});

describe("barChart: tooltip", () => {
  it("shows the hovered mark's text, aria-hidden, in a layer just after the <svg>", () => {
    const { svg, hit, tip, shown, lines } = setup({ stack: ["goals", "assists"], x: undefined });
    expect(tip()).toBeNull();
    pointer("pointerover", hit("Okafor"));
    expect(shown()).toBe(true);
    expect(tip()!.getAttribute("aria-hidden")).toBe("true");
    expect(tip()!.parentElement!.className).toBe("ec-tooltip-layer");
    expect(svg.nextElementSibling).toBe(tip()!.parentElement);
    expect(lines()).toEqual(["Okafor", "16 goals · 4 assists", "20 total"]);
    expect(tip()!.firstElementChild!.className).toBe("ec-tooltip-title");
  });

  it("formats values with the chart's format", () => {
    const { hit, lines } = setup({ format: (value) => `${value} g` });
    pointer("pointerover", hit("Tanaka"));
    expect(lines()).toEqual(["Tanaka", "6 g goals"]);
  });

  it("sits above the mark, or below it near the top, centred on it", () => {
    const { hit, geometry, tip } = setup();
    // Rows are 34 px with 20 px bars, from 4 px down: the first bar's top is at 11, the third's at 79.
    pointer("pointerover", hit("Lindqvist"));
    expect(tip()!.style.top).toBe(px(79 - 12 - TIP.height));
    expect(tip()!.style.left).toBe(px(geometry("Lindqvist").center.x - TIP.width / 2));
    expect(tip()!.getAttribute("data-side")).toBe("above");
    pointer("pointerover", hit("Okafor"));
    expect(tip()!.style.top).toBe(px(11 + 20 + 12));
    expect(tip()!.getAttribute("data-side")).toBe("below");
  });

  it("is clamped to the chart's edges", () => {
    const { hit, tip, geometry } = setup({ data: [{ name: "A", goals: 20, assists: 0 }, { name: "B", goals: 1, assists: 0 }] });
    pointer("pointerover", hit("B"));
    expect(geometry("B").center.x).toBeLessThan(TIP.width / 2);
    expect(tip()!.style.left).toBe("0px");
    // Columns: the last one is near the right edge.
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(() => 300);
    const columns = setup({ x: "name", y: "goals" });
    pointer("pointerover", columns.hit("Lindqvist"));
    expect(columns.geometry("Lindqvist").center.x + 150).toBeGreaterThan(600);
    expect(columns.tip()!.style.left).toBe("300px");
  });

  it("follows the <svg>'s scale and place on the page", () => {
    const { svg, hit, geometry, tip } = setup();
    const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height }) as DOMRect;
    pointer("pointerover", hit("Tanaka"));
    // Drawn at half size (the viewBox is 600 × 132), 20 px in from the layer, which sits below it.
    svg.getBoundingClientRect = () => rect(20, 100.5, 300, 66);
    tip()!.parentElement!.getBoundingClientRect = () => rect(0, 166, 340, 0);
    pointer("pointerover", hit("Okafor"));
    // The first bar spans 11–31 in the viewBox: 5.5–15.5 on screen. No room above, so below.
    expect(tip()!.style.top).toBe(px(100.5 - 166 + 15.5 + 12));
    expect(tip()!.style.left).toBe(px(20 + geometry("Okafor").center.x / 2 - TIP.width / 2));
  });

  it("moves with an effect that moves the mark", () => {
    const { svg, hit, geometry, tip, shown } = setup({ on: { hover: moving([1, 0, 0, 1, 40, 6]) } });
    pointer("pointerover", hit("Okafor"));
    // Below the first bar, as at rest, but 40 px right and 6 px down with it.
    expect(tip()!.style.left).toBe(px(geometry("Okafor").center.x + 40 - TIP.width / 2));
    expect(tip()!.style.top).toBe(px(11 + 20 + 6 + 12));
    // Leaving clears the effect, which resets the mark; the tooltip stays hidden.
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(shown()).toBe(false);
  });

  it("keeps the side it has at rest while an effect moves the mark", () => {
    // Lifted 40 px, the third bar's top is at 39: too close to the top for the box to fit above. It
    // stays above, so a wiggle near the edge can't flip it back and forth.
    const { hit, tip } = setup({ on: { hover: moving([1, 0, 0, 1, 0, -40]) } });
    pointer("pointerover", hit("Lindqvist"));
    expect(tip()!.getAttribute("data-side")).toBe("above");
    expect(tip()!.style.top).toBe(px(79 - 40 - 12 - TIP.height));
  });

  it("stays clear of a mark an effect scales up", () => {
    // A scale: 1.5× about the bar's centre (y 89), so its top rises from 79 to 74.
    const { hit, geometry, tip } = setup({ on: { hover: moving((mark) => matrix.scale(1.5, 1.5, mark.center)) } });
    pointer("pointerover", hit("Lindqvist"));
    expect(tip()!.style.top).toBe(px(74 - 12 - TIP.height));
    expect(tip()!.style.left).toBe(px(geometry("Lindqvist").center.x - TIP.width / 2));
  });

  it("sets a function's text as text, never as HTML", () => {
    const { hit, tip, lines } = setup({ tooltip: (d) => `<img src=x onerror="alert(1)">${d.name}\n${d.goals} scored` });
    pointer("pointerover", hit("Okafor"));
    expect(tip()!.textContent).toBe(`<img src=x onerror="alert(1)">Okafor\n16 scored`);
    expect(tip()!.children).toHaveLength(0);
    expect(tip()!.querySelector("img")).toBeNull();
    expect(lines()).toEqual([]);
  });

  it("makes a function's text each mark's accessible description, as text", () => {
    const { container, mark } = setup({ tooltip: (d) => `${d.name}, <b>forward</b>` });
    const ids = ["Okafor", "Tanaka", "Lindqvist"].map((key) => {
      const id = mark(key).getAttribute("aria-describedby")!;
      const desc = document.getElementById(id)!;
      expect(desc.tagName).toBe("desc");
      expect(desc.parentElement).toBe(mark(key));
      expect(desc.textContent).toBe(`${key}, <b>forward</b>`);
      return id;
    });
    expect(new Set(ids).size).toBe(3);
    expect(container.querySelector("b")).toBeNull();
  });

  it("describes nothing with the default text, which the marks' labels already say", () => {
    const { svg } = setup({ stack: ["goals", "assists"], x: undefined });
    expect(svg.querySelector("[aria-describedby]")).toBeNull();
    expect(svg.querySelector("desc")).toBeNull();
  });

  it("keeps the descriptions in step with updates", async () => {
    const { chart, mark, settle } = setup({ tooltip: (d) => (d.goals > 8 ? `${d.name} is a top scorer` : "") });
    const description = (key: string) => {
      const id = mark(key).getAttribute("aria-describedby");
      return id === null ? undefined : document.getElementById(id)?.textContent;
    };
    expect(description("Okafor")).toBe("Okafor is a top scorer");
    // An empty string describes nothing.
    expect(description("Tanaka")).toBeUndefined();
    expect(mark("Tanaka").querySelector("desc")).toBeNull();
    await settle(chart.update({ data: players.map((p) => (p.name === "Tanaka" ? { ...p, goals: 12 } : p)) }));
    expect(description("Tanaka")).toBe("Tanaka is a top scorer");
    await settle(chart.update({ tooltip: true }));
    expect(chart.element.querySelector("[aria-describedby], desc")).toBeNull();
  });

  it("shows nothing for an empty string, and reports a function that throws", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const { hit, shown } = setup({
      tooltip: (d) => {
        if (d.name === "Tanaka") throw new Error("no text");
        return d.name === "Lindqvist" ? "" : d.name;
      }
    });
    pointer("pointerover", hit("Okafor"));
    expect(shown()).toBe(true);
    pointer("pointerover", hit("Lindqvist"));
    expect(shown()).toBe(false);
    pointer("pointerover", hit("Tanaka"));
    expect(shown()).toBe(false);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("is off with tooltip: false, and can be turned off and on by update()", async () => {
    const { chart, hit, tip, shown, settle } = setup({ tooltip: false });
    pointer("pointerover", hit("Okafor"));
    expect(tip()).toBeNull();
    await settle(chart.update({ tooltip: true }));
    expect(shown()).toBe(true);
    await settle(chart.update({ tooltip: false }));
    expect(shown()).toBe(false);
  });

  it("rejects a tooltip option that isn't a boolean or a function", () => {
    expect(() => setup({ tooltip: "name" as unknown as boolean })).toThrow(/tooltip must be true, false or a function/);
  });

  it("hides when the pointer leaves, fading over feedback timing", () => {
    const { svg, hit, tip, shown } = setup();
    pointer("pointerover", hit("Okafor"));
    expect(tip()!.style.getPropertyValue("--ec-hover-duration")).toBe("100ms");
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(shown()).toBe(false);
    expect(tip()!.style.getPropertyValue("--ec-hover-duration")).toBe("100ms");
  });

  it("shows and hides at once when motion is off", () => {
    const { hit, tip } = setup({}, "off");
    pointer("pointerover", hit("Okafor"));
    expect(tip()!.style.getPropertyValue("--ec-hover-duration")).toBe("0ms");
  });

  it("follows keyboard focus, and hides on Escape and blur", () => {
    const { mark, shown, lines } = setup();
    tabTo(mark("Okafor"));
    expect(shown()).toBe(true);
    expect(lines()).toEqual(["Okafor", "16 goals"]);
    press(mark("Okafor"), "ArrowDown");
    expect(lines()).toEqual(["Tanaka", "6 goals"]);
    press(mark("Tanaka"), "Escape");
    expect(shown()).toBe(false);
    press(mark("Tanaka"), "ArrowDown");
    expect(lines()).toEqual(["Lindqvist", "10 goals"]);
    expect(shown()).toBe(true);
    mark("Lindqvist").blur();
    expect(shown()).toBe(false);
  });

  it("follows a touch tap until a tap somewhere else", () => {
    const { hit, shown, lines } = setup();
    // Touch fires pointerover around a tap; the tap itself is what counts.
    pointer("pointerover", hit("Okafor"), "touch");
    expect(shown()).toBe(false);
    tap(hit("Okafor"));
    expect(lines()).toEqual(["Okafor", "16 goals"]);
    tap(hit("Tanaka"));
    expect(lines()).toEqual(["Tanaka", "6 goals"]);
    pointer("pointerdown", document.body, "touch");
    expect(shown()).toBe(false);
  });

  it("follows its mark through an update, with the new values", async () => {
    const { chart, clock, hit, tip, lines, settle } = setup();
    pointer("pointerover", hit("Okafor"));
    expect(tip()!.style.top).toBe(px(43));
    // A–Z puts Okafor second: its bar's top moves from 11 to 45, and it still flips below.
    const sorted = chart.update({ sort: "key", data: players.map((p) => (p.name === "Okafor" ? { ...p, goals: 17 } : p)) });
    clock.advance(16);
    expect(lines()).toEqual(["Okafor", "17 goals"]);
    // Part way through the positions stage, which starts at 500 ms.
    for (let i = 0; i < 40; i++) clock.advance(16);
    const mid = parseFloat(tip()!.style.top);
    expect(mid).toBeGreaterThan(43);
    expect(mid).toBeLessThan(77);
    await settle(sorted);
    expect(tip()!.style.top).toBe(px(45 + 20 + 12));
  });

  it("hides when its mark leaves", async () => {
    const { chart, hit, shown, settle } = setup();
    pointer("pointerover", hit("Tanaka"));
    await settle(chart.update({ data: players.filter((p) => p.name !== "Tanaka") }));
    expect(shown()).toBe(false);
  });

  it("is removed with the chart", () => {
    const { chart, container, hit } = setup();
    pointer("pointerover", hit("Okafor"));
    chart.destroy();
    expect(container.childElementCount).toBe(0);
  });
});

describe("chartTooltip: the bridge to the mark", () => {
  const bridge = (container: HTMLElement) => container.querySelector<HTMLElement>(".ec-tooltip-bridge")!;

  it("comes after the box, aria-hidden, and is the tooltip's element with it while it shows", () => {
    const { container, svg, hit, tip, chart } = setup();
    expect(container.querySelector(".ec-tooltip-bridge")).toBeNull();
    pointer("pointerover", hit("Okafor"));
    const layer = svg.nextElementSibling!;
    expect(Array.from(layer.children)).toEqual([tip(), bridge(container)]);
    expect(bridge(container).getAttribute("aria-hidden")).toBe("true");
    expect(bridge(container).textContent).toBe("");
    chart.leave();
    expect(Array.from(layer.children)).toEqual([tip(), bridge(container)]);
  });

  it("spans the gap from the box down to the mark below it, as a trapezoid from one's edge to the other's", () => {
    const { container, hit, geometry, tip } = setup();
    // The third bar: its top at 79, the box's bottom 12 px above it.
    pointer("pointerover", hit("Lindqvist"));
    const box = { left: parseFloat(tip()!.style.left), top: parseFloat(tip()!.style.top) };
    const { x, width } = geometry("Lindqvist").bounds;
    const left = Math.round(Math.min(box.left, x));
    const right = Math.round(Math.max(box.left + TIP.width, x + width));
    expect(bridge(container).hidden).toBe(false);
    // A px into the box, and a px into the bar.
    expect(bridge(container).style.top).toBe(px(box.top + TIP.height - 1));
    expect(bridge(container).style.height).toBe(px(79 + 1 - (box.top + TIP.height - 1)));
    expect(bridge(container).style.left).toBe(px(left));
    expect(bridge(container).style.width).toBe(px(right - left));
    const at = (value: number) => px(Math.round(value) - left);
    expect(bridge(container).style.getPropertyValue("clip-path")).toBe(`polygon(${at(box.left)} 0px, ${at(box.left + TIP.width)} 0px, ${at(x + width)} 14px, ${at(x)} 14px)`);
  });

  it("spans the gap from the mark down to the box below it", () => {
    const { container, hit, geometry, tip } = setup();
    // The first bar: 11–31, with the box below it from 43.
    pointer("pointerover", hit("Okafor"));
    const box = { left: parseFloat(tip()!.style.left), top: parseFloat(tip()!.style.top) };
    expect(box.top).toBe(43);
    const { x, width } = geometry("Okafor").bounds;
    const left = Math.round(Math.min(box.left, x));
    const at = (value: number) => px(Math.round(value) - left);
    // A px into the bar, and a px into the box.
    expect(bridge(container).style.top).toBe(px(30));
    expect(bridge(container).style.height).toBe(px(14));
    expect(bridge(container).style.getPropertyValue("clip-path")).toBe(`polygon(${at(x)} 0px, ${at(x + width)} 0px, ${at(box.left + TIP.width)} 14px, ${at(box.left)} 14px)`);
  });

  it("follows an effect that moves the mark", () => {
    const { container, hit, geometry } = setup({ on: { hover: moving([1, 0, 0, 1, 40, 6]) } });
    pointer("pointerover", hit("Okafor"));
    const { x } = geometry("Okafor").bounds;
    // Moved 6 px down with the mark, and its edge on the mark 40 px right.
    expect(bridge(container).style.top).toBe(px(36));
    expect(bridge(container).style.getPropertyValue("clip-path")).toContain(`${px(Math.round(x + 40) - parseFloat(bridge(container).style.left))} 0px`);
  });

  it("isn't there at a point, where a crosshair's column reaches the box", () => {
    const container = document.body.appendChild(document.createElement("div"));
    const svg = svgElement("svg", { viewBox: "0 0 600 300" }, container);
    const tooltip = chartTooltip<{ week: number }>(svg, { motion: { duration: (ms) => ms }, option: () => true });
    expect(tooltip.element()).toBeUndefined();
    tooltip.showAt({ x: 300, top: 150, bottom: 200 }, { datum: { week: 12 } }, () => "12");
    expect(tooltip.element()).toBe(svg.nextElementSibling);
    expect(bridge(container).hidden).toBe(true);
    tooltip.hide();
    expect(tooltip.element()).toBeUndefined();
  });
});

describe("chartTooltip: under a pointer that didn't move onto it", () => {
  /** jsdom lays nothing out: the box's client rect is where its style puts it, at TIP's size, from the page's top left. */
  function laidOut() {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains("ec-tooltip")) return new DOMRect(0, 0, 0, 0);
      return new DOMRect(parseFloat(this.style.left) || 0, parseFloat(this.style.top) || 0, TIP.width, TIP.height);
    });
  }
  const at = (type: string, target: EventTarget, x: number, y: number) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse", clientX: x, clientY: y }));

  it("lets the pointer through while it's under the pointer, and takes it again once the pointer has been off it", () => {
    laidOut();
    const { hit, geometry, tip } = setup();
    // The third bar's box: 17 to 67 down, centred on the bar.
    const x = geometry("Lindqvist").center.x;
    at("pointerover", hit("Lindqvist"), x, 40);
    const layer = tip()!.parentElement!;
    expect(layer.classList.contains("ec-tooltip-through")).toBe(true);
    at("pointermove", document, x + 10, 50);
    expect(layer.classList.contains("ec-tooltip-through")).toBe(true);
    at("pointermove", document, x, 100);
    expect(layer.classList.contains("ec-tooltip-through")).toBe(false);
    // Moving onto it now, it takes the pointer.
    at("pointermove", document, x, 40);
    expect(layer.classList.contains("ec-tooltip-through")).toBe(false);
  });

  it("counts the bridge as its own, by its trapezoid", () => {
    laidOut();
    const { hit, geometry, tip } = setup();
    const { center } = geometry("Lindqvist");
    // Under the box's middle, in the gap above the bar (79): the bridge.
    at("pointerover", hit("Lindqvist"), center.x, 74);
    expect(tip()!.parentElement!.classList.contains("ec-tooltip-through")).toBe(true);
  });

  it("leaves no sliver between the box and the bridge, though the box is a fraction of a px shorter than offsetHeight says", () => {
    // offsetHeight is a whole number of px: the box is drawn 49.6 px tall, its bottom 0.4 px above where 50 puts it.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains("ec-tooltip")) return new DOMRect(0, 0, 0, 0);
      return new DOMRect(parseFloat(this.style.left) || 0, parseFloat(this.style.top) || 0, TIP.width, TIP.height - 0.4);
    });
    const { hit, geometry, tip } = setup();
    // The third bar's box: 17 down to 66.6, over the bar's top at 79. Below 66.6 and above 67, the bridge.
    at("pointerover", hit("Lindqvist"), geometry("Lindqvist").center.x, 66.8);
    expect(tip()!.parentElement!.classList.contains("ec-tooltip-through")).toBe(true);
  });

  it("keeps the pointer that moved onto it as it moves, and lets go of none when it hides", async () => {
    laidOut();
    const { chart, hit, geometry, tip, settle } = setup();
    const x = geometry("Okafor").center.x;
    // Okafor's box is below its bar, from 43 down.
    at("pointerover", hit("Okafor"), x, 20);
    const layer = tip()!.parentElement!;
    at("pointermove", document, x, 60);
    expect(layer.classList.contains("ec-tooltip-through")).toBe(false);
    // An update that changes its text: it's placed again, under the pointer still, which stays on it.
    await settle(chart.update({ data: players.map((p) => (p.name === "Okafor" ? { ...p, goals: 17 } : p)) }));
    expect(tip()!.textContent).toContain("17 goals");
    expect(layer.classList.contains("ec-tooltip-through")).toBe(false);
    chart.leave();
    expect(layer.classList.contains("ec-tooltip-through")).toBe(false);
  });

  it("ignores touch, which has no pointer resting anywhere", () => {
    laidOut();
    const { hit, geometry, tip } = setup();
    const x = geometry("Lindqvist").center.x;
    at("pointermove", document, x, 40);
    hit("Lindqvist").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: x, clientY: 40 }));
    at("pointermove", document, 0, 0);
    document.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", clientX: x, clientY: 40 }));
    tap(hit("Lindqvist"));
    expect(tip()!.parentElement!.classList.contains("ec-tooltip-through")).toBe(false);
  });
});

describe("the pointer on the tooltip", () => {
  interface Shot {
    outcome: string;
    shots: number;
  }
  interface Week {
    week: number;
    goals: number;
    xg: number;
  }
  const shots: Shot[] = [
    { outcome: "Goal", shots: 58 },
    { outcome: "Saved", shots: 112 },
    { outcome: "Off target", shots: 149 }
  ];
  const weeks: Week[] = [
    { week: 1, goals: 0, xg: 1.2 },
    { week: 2, goals: 2, xg: 2.1 },
    { week: 3, goals: 3, xg: 3.6 }
  ];
  const env = (): ChartEnv & { clock: ReturnType<typeof manualClock> } => ({
    presets: createRegistry<PresetFactory>({ kind: "preset" }),
    icons: { get: () => undefined },
    motion: quietMotion(),
    clock: manualClock()
  });
  const host = () => document.body.appendChild(document.createElement("div"));

  /** A chart's <svg>, the element the pointer is over at each of two targets, and its leave(). */
  interface Case {
    readonly svg: SVGSVGElement;
    readonly target: (key: string) => Element;
    readonly keys: readonly [string, string];
    leave(): void;
  }
  const cases: Record<string, () => Case> = {
    bars() {
      const chart = barChart<Player>(host(), { label: "Goals", data: players, y: "name", x: "goals", width: 600 }, env());
      return { svg: chart.element, target: (key) => chart.element.querySelector(`.ec-mark[data-key="${key}"] .ec-hit`)!, keys: ["Okafor", "Tanaka"], leave: () => chart.leave() };
    },
    donut() {
      const chart = donutChart<Shot>(host(), { label: "Shots", data: shots, category: "outcome", value: "shots", width: 600 }, env());
      return { svg: chart.element, target: (key) => chart.element.querySelector(`.ec-mark[data-key="${key}"] .ec-slice`)!, keys: ["Saved", "Goal"], leave: () => chart.leave() };
    },
    "a line's crosshair"() {
      const chart = lineChart<Week>(host(), { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 600 }, env());
      return { svg: chart.element, target: (key) => chart.element.querySelector(`.ec-column[data-key="${key}"] .ec-hit`)!, keys: ["2", "3"], leave: () => chart.leave() };
    },
    "a chart switch's view"() {
      const e = env();
      const switcher = chartSwitch(
        host(),
        {
          views: {
            donut: (container, colors) => donutChart(container, { label: "Shots", data: shots, category: "outcome", value: "shots", colors, width: 600 }, e),
            columns: (container, colors) => barChart(container, { label: "Shots", data: shots, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors, width: 600 }, e)
          },
          initial: "donut",
          // Ends at once: the switch's own timing is beside the point here.
          transition: { kind: "transition", run: () => Promise.resolve(), end() {}, clear() {} }
        },
        e
      );
      const chart = switcher.chart("donut");
      return { svg: chart.element, target: (key) => chart.element.querySelector(`.ec-mark[data-key="${key}"] .ec-slice`)!, keys: ["Saved", "Goal"], leave: () => chart.leave() };
    }
  };

  /** The chart's tooltip parts, and what it shows as hovered. */
  function parts(svg: SVGSVGElement) {
    const container = svg.parentElement!;
    const box = () => container.querySelector<HTMLElement>(".ec-tooltip")!;
    const bridge = () => container.querySelector<HTMLElement>(".ec-tooltip-bridge")!;
    const layer = () => box().parentElement!;
    const hovered = () => ({
      text: box()?.classList.contains("ec-tooltip-shown") ? box().textContent : undefined,
      hot: Array.from(svg.querySelectorAll(".ec-hot"), (element) => element.getAttribute("data-key"))
    });
    return { box, bridge, layer, hovered };
  }

  /** A pointer event from or to `related`, as a browser fires it. */
  /** A pointer event from or to `related`, as a browser fires it, at 5, 5 unless `at` says. */
  function move(type: string, target: Element, related: Element | null = null, pointerType = "mouse", at = { x: 5, y: 5 }): void {
    const bubbles = type !== "pointerleave" && type !== "pointerenter";
    target.dispatchEvent(new PointerEvent(type, { bubbles, pointerType, relatedTarget: related, clientX: at.x, clientY: at.y }));
  }

  /** The pointer from an element in the <svg> onto `onto`, outside it. */
  const offSvg = (svg: SVGSVGElement, onto: Element) => move("pointerleave", svg, onto);
  /** The pointer from the tooltip onto `onto`, and over it if it's in the <svg>. */
  function offTooltip(svg: SVGSVGElement, layer: Element, onto: Element): void {
    move("pointerleave", layer, onto);
    if (svg.contains(onto)) move("pointerover", onto);
  }

  /** Lets a MutationObserver's callback run. */
  const mutations = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  afterEach(() => {
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });

  for (const [name, make] of Object.entries(cases)) {
    describe(name, () => {
      it("keeps the hover and its text from a mark onto the tooltip and across it", () => {
        const { svg, target, keys } = make();
        const { box, bridge, layer, hovered } = parts(svg);
        move("pointerover", target(keys[0]));
        const start = hovered();
        expect(start.text).toBeTruthy();
        expect(start.hot.length).toBeGreaterThan(0);
        // Beside a mark across the bridge; at a crosshair's point straight onto the box.
        offSvg(svg, bridge().hidden ? box() : bridge());
        expect(hovered()).toEqual(start);
        move("pointermove", bridge().hidden ? box() : bridge());
        move("pointerleave", bridge(), box());
        move("pointerover", box(), bridge());
        move("pointermove", box());
        expect(hovered()).toEqual(start);
        expect(layer().contains(box())).toBe(true);
      });

      it("hovers the mark the pointer leaves it for", () => {
        const { svg, target, keys } = make();
        const { box, layer, hovered } = parts(svg);
        move("pointerover", target(keys[0]));
        const start = hovered();
        offSvg(svg, box());
        offTooltip(svg, layer(), target(keys[1]));
        const next = hovered();
        expect(next.text).toBeTruthy();
        expect(next.text).not.toBe(start.text);
        expect(next.hot).not.toEqual(start.hot);
      });

      it("ends the hover when the pointer leaves it for anything else", () => {
        const { svg, target, keys } = make();
        const { box, layer, hovered } = parts(svg);
        const nothing = { text: undefined, hot: [] };
        move("pointerover", target(keys[0]));
        offSvg(svg, box());
        offTooltip(svg, layer(), document.body);
        expect(hovered()).toEqual(nothing);
        // Onto the <svg> where there's no mark.
        move("pointerover", target(keys[0]));
        offSvg(svg, box());
        offTooltip(svg, layer(), svg);
        expect(hovered()).toEqual(nothing);
      });

      it("ends on Escape and leave() as before, and hovers again only once the pointer moves", () => {
        const { svg, target, keys, leave } = make();
        const { box, layer, hovered } = parts(svg);
        const nothing = { text: undefined, hot: [] };
        for (const end of [() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), leave]) {
          move("pointerover", target(keys[0]));
          offSvg(svg, box());
          end();
          expect(hovered()).toEqual(nothing);
          // With the tooltip gone, the browser hit-tests the mark under the still pointer: that isn't a move.
          move("pointerleave", layer(), target(keys[0]));
          move("pointerover", target(keys[0]), box());
          expect(hovered()).toEqual(nothing);
          // The pointer hovers again when it next moves onto a mark, as it does on the mark itself.
          move("pointerover", target(keys[0]), null, "mouse", { x: 9, y: 5 });
          expect(hovered()).not.toEqual(nothing);
          offTooltip(svg, layer(), document.body);
          move("pointerleave", svg, document.body);
        }
      });

      it("stays through a touch tap on it, until a tap somewhere else", () => {
        const { svg, target, keys } = make();
        const { box, hovered } = parts(svg);
        move("pointerdown", target(keys[0]), null, "touch");
        target(keys[0]).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        const start = hovered();
        expect(start.text).toBeTruthy();
        move("pointerdown", box(), null, "touch");
        box().dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(hovered()).toEqual(start);
        move("pointerdown", document.body, null, "touch");
        expect(hovered()).toEqual({ text: undefined, hot: [] });
      });
    });
  }

  it("holds a keyboard hover for the pointer on its tooltip, past blur", () => {
    const { svg, mark, tip, shown } = setup();
    tabTo(mark("Okafor"));
    expect(shown()).toBe(true);
    // The pointer comes over the <svg> where there's no mark, then onto the tooltip.
    move("pointerover", svg);
    offSvg(svg, tip()!);
    mark("Okafor").blur();
    expect(shown()).toBe(true);
    offTooltip(svg, tip()!.parentElement!, document.body);
    expect(shown()).toBe(false);
  });

  it("hovers what the pointer is over when a change moves the tooltip from under it: bars", async () => {
    const { svg, chart, hit, tip, lines, settle } = setup();
    pointer("pointerover", hit("Okafor"));
    offSvg(svg, tip()!);
    const top = tip()!.style.top;
    // Hit-testing, as a browser would: the box while it's where it was, then the bar that's there.
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => (tip()!.style.top === top ? tip() : hit("Tanaka")) });
    await settle(chart.update({ sort: "key" }));
    await mutations();
    expect(lines()).toEqual(["Tanaka", "6 goals"]);
    expect(Array.from(svg.querySelectorAll(".ec-hot"), (element) => element.getAttribute("data-key"))).toEqual(["Tanaka"]);
  });

  it("hovers what the pointer is over when a change moves the tooltip from under it: a line's crosshair", async () => {
    const container = host();
    const e = env();
    const chart = lineChart<Week>(container, { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 600 }, e);
    const column = (key: string) => chart.element.querySelector(`.ec-column[data-key="${key}"] .ec-hit`)!;
    const { box, hovered } = parts(chart.element);
    move("pointerover", column("2"));
    offSvg(chart.element, box());
    const top = box().style.top;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => (box().style.top === top ? box() : column("3")) });
    // Week 2's xG rises, so the tooltip above its highest point rises with it.
    await play(e.clock, chart.update({ data: weeks.map((w) => (w.week === 2 ? { ...w, xg: 3.4 } : w)) }));
    await mutations();
    expect(hovered().hot).toEqual(["goals@3", "xg@3"]);
  });

  it("leaves links as they are: the linked chart keeps its hover while the pointer is on the tooltip, and shows none of its own", () => {
    const e = env();
    const barHost = host();
    const lineHost = host();
    const bars = barChart<Week>(barHost, { label: "Goals", data: weeks, x: (d) => String(d.week), y: "goals", orientation: "vertical", width: 400 }, e);
    const line = lineChart<Week>(lineHost, { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 400 }, e);
    link([bars, line]);
    const hot = (svg: SVGSVGElement) => Array.from(svg.querySelectorAll(".ec-hot"), (element) => element.getAttribute("data-key"));
    const { box, layer } = parts(bars.element);
    move("pointerover", bars.element.querySelector('.ec-mark[data-key="2"] .ec-hit')!);
    expect(hot(line.element)).toEqual(["goals@2", "xg@2"]);
    offSvg(bars.element, box());
    expect(hot(bars.element)).toEqual(["2"]);
    expect(hot(line.element)).toEqual(["goals@2", "xg@2"]);
    expect(lineHost.querySelector(".ec-tooltip-shown")).toBeNull();
    offTooltip(bars.element, layer(), document.body);
    expect(hot(bars.element)).toEqual([]);
    expect(hot(line.element)).toEqual([]);
  });
});
