// A chart measures its text again when it changes size after the chart drew (shell/watch.ts's
// watchText): spacing added by a viewer's stylesheet, say. jsdom has no layout, so text widths come
// from a stand-in for getComputedTextLength, and the probe's width from a stand-in ResizeObserver.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMotion, manualClock, type GeometryEffect, type MarkGeometry } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { barChart } from "./bar";
import { donutChart } from "./donut";
import { lineChart } from "./line";
import type { ChartEnv } from "./shell/setup";

/** How much of WCAG 1.4.12's spacing is on, 0 to 1: at 1, 0.12 em more after each character, and 0.16 em more after each word. */
let spacing = 0;

/** The theme's size for each class the charts measure: 12.5 px for the rest. */
const SIZES: Readonly<Record<string, number>> = { "ec-tick": 11, "ec-center-value": 26 };

/** A text's width as a browser would give it: half an em a character, and the spacing. */
function textLength(this: SVGElement): number {
  const text = this.textContent ?? "";
  const size = SIZES[this.getAttribute("class") ?? ""] ?? 12.5;
  const spaces = text.split(" ").length - 1;
  return size * (text.length * (0.5 + 0.12 * spacing) + spaces * 0.16 * spacing);
}

/** A ResizeObserver that reports only when told: `tell` gives the probe's observer its width. */
function stubResizeObserver() {
  const observers: { callback: ResizeObserverCallback; targets: Element[]; disconnected: boolean }[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private readonly entry: (typeof observers)[number];
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, targets: [], disconnected: false };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.targets.push(target);
      }
      unobserve() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    }
  );
  const tell = (width: number) => {
    for (const { callback, targets } of observers) {
      for (const target of targets.filter((element) => element.localName === "text")) callback([{ target, contentRect: { width } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    }
  };
  return { observers, tell };
}

/** An effect that logs each time a mark moves under it. */
function recorder() {
  const log: string[] = [];
  const effect: GeometryEffect = {
    kind: "geometry",
    run(mark, ctx) {
      ctx.onChange((moved) => log.push(`change ${moved.key}`));
      return Promise.resolve();
    },
    end() {},
    clear() {}
  };
  return { log, effect };
}

interface Chart {
  readonly element: SVGSVGElement;
  marks(): readonly MarkGeometry[];
  on(type: "leave" | "update", listener: () => void): () => void;
  destroy(): void;
}

/** One of the charts to try, drawn into `container`, with what to hover and a change to make. */
interface Case {
  readonly name: string;
  draw(container: HTMLElement, env: ChartEnv, on: { decorate: GeometryEffect }): Chart;
  /** What a pointer goes over to hover a mark, and whether it's hovered, drawn where the mark is now. */
  hover(svg: SVGSVGElement): Element;
  hot(svg: SVGSVGElement, chart: Chart): boolean;
  change(chart: Chart): Promise<void>;
}

const players = Array.from({ length: 40 }, (_, i) => ({ name: `Player ${i + 1}`, goals: ((i * 7) % 23) + 1 }));
const shots = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];
const weeks = [1, 2, 3, 4, 5, 6].map((week) => ({ week, goals: week * 3, xg: week * 2.5 + 1 }));

const columns: Case = {
  name: "a bar chart's columns",
  draw: (container, env, on) => barChart(container, { label: "Goals by player", data: players, x: "name", y: "goals", width: 600, on }, env) as unknown as Chart,
  hover: (svg) => svg.querySelector('.ec-mark[data-key="Player 1"] .ec-hit')!,
  hot: (svg) => svg.classList.contains("ec-hovering") && svg.querySelector('.ec-mark[data-key="Player 1"]')!.classList.contains("ec-hot"),
  change: (chart) => (chart as unknown as ReturnType<typeof barChart<(typeof players)[number]>>).update({ sort: "value" })
};

const bars: Case = {
  name: "a bar chart's bars",
  draw: (container, env, on) => barChart(container, { label: "Goals by player", data: players.slice(0, 3), y: "name", x: "goals", width: 600, on }, env) as unknown as Chart,
  hover: (svg) => svg.querySelector('.ec-mark[data-key="Player 1"] .ec-hit')!,
  hot: (svg) => svg.classList.contains("ec-hovering") && svg.querySelector('.ec-mark[data-key="Player 1"]')!.classList.contains("ec-hot"),
  change: (chart) => (chart as unknown as ReturnType<typeof barChart<(typeof players)[number]>>).update({ sort: "value" })
};

const donut: Case = {
  name: "a donut chart",
  draw: (container, env, on) => donutChart(container, { label: "Shot outcomes", data: shots, category: "outcome", value: "shots", width: 400, on }, env) as unknown as Chart,
  hover: (svg) => svg.querySelector('.ec-mark[data-key="Saved"] .ec-hit')!,
  hot: (svg) => svg.classList.contains("ec-hovering") && svg.querySelector('.ec-mark[data-key="Saved"]')!.classList.contains("ec-hot"),
  change: (chart) => (chart as unknown as ReturnType<typeof donutChart<(typeof shots)[number]>>).update({ sort: "value" })
};

const line: Case = {
  name: "a line chart",
  draw: (container, env, on) => lineChart(container, { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 600, on }, env) as unknown as Chart,
  hover: (svg) => svg.querySelector('.ec-column[data-key="2"]')!,
  // The crosshair at week 2's point, where it is now, and the tooltip shown.
  hot: (svg, chart) => {
    const crosshair = svg.querySelector(".ec-crosshair")!;
    const x = chart.marks().find((mark) => mark.key === "goals@2")!.center.x;
    const shown = document.querySelector(".ec-tooltip")?.classList.contains("ec-tooltip-shown") === true;
    return shown && crosshair.getAttribute("visibility") === null && Math.abs(Number(crosshair.getAttribute("x1")) - x) < 0.001;
  },
  change: (chart) =>
    (chart as unknown as ReturnType<typeof lineChart<(typeof weeks)[number]>>).update({ data: weeks.map((row) => ({ ...row, goals: row.goals * 10 })) })
};

/** Draws `which` at rest, with a decoration that logs each move. */
function setup(which: Case) {
  const container = document.body.appendChild(document.createElement("div"));
  const clock = manualClock();
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const decorate = recorder();
  const chart = which.draw(container, env, { decorate: decorate.effect });
  const svg = chart.element;
  rest(clock);
  decorate.log.length = 0;
  return { container, clock, chart, svg, decorate };
}

/** Plays the clock until nothing waits for a frame. */
function rest(clock: ReturnType<typeof manualClock>): void {
  for (let i = 0; i < 1000 && !clock.idle; i++) clock.advance(16);
}

/** The probe: the only text in the <svg> with no class. */
const probeOf = (svg: SVGSVGElement): Element | null => svg.querySelector(":scope > text:not([class])");

/** What the chart draws, without its probe, and with the donut's mask named as one chart alone would name it. */
function drawn(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  probeOf(copy)?.remove();
  return copy.outerHTML.replace(/ec-focus-mask-\d+/g, "ec-focus-mask");
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  spacing = 0;
  Object.defineProperty(SVGElement.prototype, "getComputedTextLength", { configurable: true, value: textLength });
});

afterEach(() => {
  delete (SVGElement.prototype as { getComputedTextLength?: unknown }).getComputedTextLength;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe.each([columns, bars, donut, line])("text that changes size: $name", (which) => {
  it("measures again and lays out at once, as the same text draws from the start, its effects following", () => {
    const { tell } = stubResizeObserver();
    const { clock, chart, svg, decorate } = setup(which);
    const updates = vi.fn();
    chart.on("update", updates);
    tell(150);
    clock.advance(16);
    const before = drawn(svg);
    spacing = 1;
    tell(180);
    expect(drawn(svg)).toBe(before);
    clock.advance(16);
    expect(drawn(svg)).not.toBe(before);
    expect(decorate.log).toEqual(chart.marks().map((mark) => `change ${mark.key}`));
    expect(updates).not.toHaveBeenCalled();
    const fresh = setup(which);
    expect(drawn(svg)).toBe(drawn(fresh.svg));
  });

  it("does nothing for a change of less than half a px", () => {
    const { tell } = stubResizeObserver();
    const { clock, svg, decorate } = setup(which);
    tell(150);
    const before = drawn(svg);
    spacing = 1;
    tell(150.4);
    rest(clock);
    expect(drawn(svg)).toBe(before);
    expect(decorate.log).toEqual([]);
  });

  it("lays out once for two changes in a frame, with the text as the second left it", () => {
    const { tell } = stubResizeObserver();
    const { clock, chart, svg, decorate } = setup(which);
    tell(150);
    spacing = 0.5;
    tell(165);
    spacing = 1;
    tell(180);
    clock.advance(16);
    rest(clock);
    expect(decorate.log).toEqual(chart.marks().map((mark) => `change ${mark.key}`));
    expect(drawn(svg)).toBe(drawn(setup(which).svg));
  });

  it("ignores its probe with no width, as in display: none", () => {
    const { tell } = stubResizeObserver();
    const { clock, svg, decorate } = setup(which);
    tell(150);
    const before = drawn(svg);
    tell(0);
    tell(150);
    rest(clock);
    expect(drawn(svg)).toBe(before);
    expect(decorate.log).toEqual([]);
  });

  it("lands a change in flight", async () => {
    const { tell } = stubResizeObserver();
    const { clock, chart, svg } = setup(which);
    tell(150);
    let settled = false;
    void which.change(chart).then(() => (settled = true));
    clock.advance(100);
    spacing = 1;
    tell(180);
    clock.advance(16);
    await flush();
    expect(settled).toBe(true);
    expect(clock.idle).toBe(true);
    const fresh = setup(which);
    await play(fresh.clock, which.change(fresh.chart));
    expect(drawn(svg)).toBe(drawn(fresh.svg));
  });

  it("holds a hover through it", () => {
    const { tell } = stubResizeObserver();
    const { clock, chart, svg } = setup(which);
    const left = vi.fn();
    chart.on("leave", left);
    tell(150);
    which.hover(svg).dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(which.hot(svg, chart)).toBe(true);
    const before = drawn(svg);
    spacing = 1;
    tell(180);
    clock.advance(16);
    expect(drawn(svg)).not.toBe(before);
    expect(which.hot(svg, chart)).toBe(true);
    expect(left).not.toHaveBeenCalled();
  });

  it("draws byte for byte as with no ResizeObserver, where it keeps no probe, until its text changes size", () => {
    const without = setup(which);
    expect(probeOf(without.svg)).toBeNull();
    const { tell } = stubResizeObserver();
    const { container, clock, svg } = setup(which);
    tell(150);
    tell(150.4);
    rest(clock);
    expect(drawn(svg)).toBe(drawn(without.svg));
    expect(container.childElementCount).toBe(without.container.childElementCount);
  });

  it("keeps a probe hidden from sight, the pointer, focus and assistive tech, which leaves its size as it was", () => {
    const without = setup(which);
    stubResizeObserver();
    const { svg } = setup(which);
    const probe = probeOf(svg) as SVGTextElement;
    expect(probe.getAttribute("aria-hidden")).toBe("true");
    expect(probe.getAttribute("visibility")).toBe("hidden");
    expect(probe.getAttribute("pointer-events")).toBe("none");
    expect(probe.hasAttribute("tabindex")).toBe(false);
    probe.focus();
    expect(document.activeElement).not.toBe(probe);
    for (const name of ["width", "height", "viewBox"]) expect(svg.getAttribute(name)).toBe(without.svg.getAttribute(name));
  });

  it("stops watching on destroy()", () => {
    const { observers, tell } = stubResizeObserver();
    const { clock, chart } = setup(which);
    tell(150);
    spacing = 1;
    tell(180);
    chart.destroy();
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
    expect(() => rest(clock)).not.toThrow();
    expect(clock.idle).toBe(true);
  });
});

describe("text that changes size: what moves", () => {
  it("thins a bar chart's names again", () => {
    const { tell } = stubResizeObserver();
    const { clock, svg } = setup(columns);
    const names = () => Array.from(svg.querySelectorAll(".ec-mark .ec-label"), (label) => label.textContent).filter(Boolean);
    tell(150);
    const before = names();
    spacing = 1;
    tell(180);
    clock.advance(16);
    expect(names().length).toBeLessThan(before.length);
    expect(names().every((name) => before.includes(name))).toBe(true);
  });

  it("widens a bar chart's margin for its names, and a line chart's for its ticks and end labels", () => {
    const { tell } = stubResizeObserver();
    const bar = setup(bars);
    const lines = setup(line);
    const span = (chart: Chart) => {
      const marks = chart.marks();
      return { left: Math.min(...marks.map((mark) => mark.bounds.x)), right: Math.max(...marks.map((mark) => mark.bounds.x + mark.bounds.width)) };
    };
    tell(150);
    const before = [span(bar.chart), span(lines.chart)];
    spacing = 1;
    tell(180);
    bar.clock.advance(16);
    lines.clock.advance(16);
    const after = [span(bar.chart), span(lines.chart)];
    expect(after[0]!.left).toBeGreaterThan(before[0]!.left);
    expect(after[1]!.left).toBeGreaterThan(before[1]!.left);
    expect(after[1]!.right).toBeLessThan(before[1]!.right);
  });

  it("gives a donut's labels more room", () => {
    const { tell } = stubResizeObserver();
    const { clock, chart } = setup(donut);
    const radius = () => Math.max(...chart.marks().map((mark) => mark.bounds.width));
    tell(150);
    const before = radius();
    spacing = 1;
    tell(180);
    clock.advance(16);
    expect(radius()).toBeLessThan(before);
  });
});
