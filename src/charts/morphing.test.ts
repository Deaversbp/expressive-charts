// The shared stylesheet's `ec-morphing` class, which a chart switch puts on a chart's <svg> while its
// marks morph somewhere else: each chart's marks and mark labels are hidden, and nothing else is.

import { createMotion, manualClock } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { barChart } from "./bar";
import { donutChart } from "./donut";
import { lineChart } from "./line";
import type { ChartEnv } from "./shell/setup";

const env = (): ChartEnv => ({
  presets: createRegistry<PresetFactory>({ kind: "preset" }),
  icons: { get: () => undefined },
  motion: createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } }),
  clock: manualClock()
});

const place = () => document.body.appendChild(document.createElement("div"));

/** Every element in the container (the chart, its legend and its table), with its computed visibility. */
function visibility(container: Element): { readonly element: Element; readonly visibility: string }[] {
  return Array.from(container.querySelectorAll("*"), (element) => ({ element, visibility: getComputedStyle(element).visibility }));
}

/**
 * Puts `ec-morphing` on a chart's <svg> and takes it off again. Returns what it hid, checking that
 * nothing else changed and that everything came back.
 */
function morph(svg: SVGSVGElement, container: Element): Element[] {
  const before = visibility(container);
  svg.classList.add("ec-morphing");
  const during = visibility(container);
  svg.classList.remove("ec-morphing");
  expect(visibility(container)).toEqual(before);
  return before.flatMap(({ element, visibility: was }, i) => {
    const now = during[i]!;
    expect(now.element).toBe(element);
    if (now.visibility === was) return [];
    expect([was, now.visibility]).toEqual(["visible", "hidden"]);
    return [element];
  });
}

/** The marks layer and everything in it. */
const marksLayer = (svg: SVGSVGElement) => Array.from(svg.querySelectorAll(".ec-marks, .ec-marks *"));

const shown = (element: Element | null) => getComputedStyle(element!).visibility === "visible";

afterEach(() => {
  document.body.textContent = "";
});

describe("ec-morphing", () => {
  it("hides a bar chart's marks and their labels, and nothing else", () => {
    const container = place();
    const data = [
      { name: "Okafor", goals: 16, assists: 4 },
      { name: "Tanaka", goals: 6, assists: 10 }
    ];
    const chart = barChart(container, { label: "Goals by player", data, y: "name", stack: ["goals", "assists"], width: 600 }, env());
    const hidden = morph(chart.element, container);
    expect(hidden).toEqual(marksLayer(chart.element));
    for (const part of [".ec-mark", ".ec-segment", ".ec-hit"]) expect(hidden).toEqual(expect.arrayContaining(Array.from(chart.element.querySelectorAll(part))));
    expect(chart.labels()).toHaveLength(4);
    for (const label of chart.labels()) expect(hidden).toContain(label.element);
    // The axis, the grid, the legend and the table stay.
    chart.element.classList.add("ec-morphing");
    for (const kept of [".ec-axis .ec-tick", ".ec-grid .ec-baseline", ".ec-legend-item", ".ec-table summary"]) expect([kept, shown(container.querySelector(kept))]).toEqual([kept, true]);
  });

  it("hides a donut's slices and their labels, and nothing else: the centre's total stays", () => {
    const container = place();
    const data = [
      { outcome: "Goal", shots: 58 },
      { outcome: "Saved", shots: 112 },
      { outcome: "Off target", shots: 149 },
      { outcome: "Blocked", shots: 87 }
    ];
    const chart = donutChart(container, { label: "Shot outcomes", data, category: "outcome", value: "shots", width: 600 }, env());
    const hidden = morph(chart.element, container);
    expect(hidden).toEqual(marksLayer(chart.element));
    expect(hidden).toEqual(expect.arrayContaining(Array.from(chart.element.querySelectorAll(".ec-slice"))));
    expect(chart.labels()).toHaveLength(8);
    for (const label of chart.labels()) expect(hidden).toContain(label.element);
    chart.element.classList.add("ec-morphing");
    for (const kept of [".ec-center .ec-center-value", ".ec-center .ec-center-label", ".ec-legend-item", ".ec-table summary"]) expect([kept, shown(container.querySelector(kept))]).toEqual([kept, true]);
  });

  it("hides a line chart's lines, points and end labels, and nothing else: the axes and each x's focus stop stay", () => {
    const container = place();
    const data = [
      { week: 1, goals: 0, xg: 1.2 },
      { week: 2, goals: 2, xg: 2.1 },
      { week: 3, goals: 3, xg: 3.6 }
    ];
    const chart = lineChart(container, { label: "Goals vs xG", data, x: "week", series: ["goals", "xg"], width: 600 }, env());
    const hidden = morph(chart.element, container);
    expect(hidden).toEqual(marksLayer(chart.element));
    for (const part of [".ec-line", ".ec-stroke", ".ec-end", ".ec-point"]) expect(hidden).toEqual(expect.arrayContaining(Array.from(chart.element.querySelectorAll(part))));
    expect(chart.labels()).toHaveLength(2);
    for (const label of chart.labels()) expect(hidden).toContain(label.element);
    chart.element.classList.add("ec-morphing");
    for (const kept of [".ec-axis .ec-tick", ".ec-grid .ec-gridline", ".ec-columns .ec-column", ".ec-legend-item", ".ec-table summary"]) expect([kept, shown(container.querySelector(kept))]).toEqual([kept, true]);
  });

  it("only works on the chart's own <svg>", () => {
    const container = place();
    const chart = barChart(container, { label: "Goals", data: [{ name: "Okafor", goals: 16 }], y: "name", x: "goals", width: 600 }, env());
    container.classList.add("ec-morphing");
    expect(shown(chart.element.querySelector(".ec-mark"))).toBe(true);
  });
});
