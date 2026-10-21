import { createMotion, manualClock, matrix, type GeometryEffect, type MarkGeometry, type Matrix, type MotionMode } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { barChart, type ChartEnv } from "./bar";
import { placeTooltip, summaryContent } from "./tooltip";
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

  it("leaves a lone value read by a function unnamed", () => {
    expect(summaryContent("Okafor", [{ series: "value", value: 16 }], format)).toEqual({ title: "Okafor", lines: ["16.0"] });
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
    // A pulse: 1.5× about the bar's centre (y 89), so its top rises from 79 to 74.
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
