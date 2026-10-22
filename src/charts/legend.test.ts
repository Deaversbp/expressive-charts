import { createMotion, manualClock } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { barChart, type ChartEnv } from "./bar";
import { colorAssignment } from "./colors";
import { donutChart } from "./donut";
import { chartLegend } from "./legend";
import { seriesColors } from "./render/theme";
import type { BarChartOptions } from "./types";

interface Player {
  name: string;
  goals: number;
  assists: number;
  shots: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 16, assists: 4, shots: 40 },
  { name: "Tanaka", goals: 6, assists: 10, shots: 22 }
];

function setup(options: Partial<BarChartOptions<Player>> = {}) {
  const container = document.body.appendChild(document.createElement("div"));
  const clock = manualClock();
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const chart = barChart<Player>(container, { label: "Goals and assists", data: players, y: "name", stack: ["goals", "assists"], width: 600, ...options }, env);
  const legend = () => container.querySelector<HTMLElement>(".ec-legend");
  const items = () => Array.from(legend()?.querySelectorAll<HTMLElement>(".ec-legend-item") ?? []);
  const names = () => items().map((item) => item.textContent);
  const swatches = () => items().map((item) => item.style.getPropertyValue("--ec-mark"));
  const settle = (running: Promise<unknown>) => play(clock, running);
  return { container, chart, legend, items, names, swatches, settle };
}

afterEach(() => {
  document.body.textContent = "";
});

describe("barChart: legend", () => {
  it("shows a swatch and name per series, in stack order, just before the <svg>", () => {
    const { chart, legend, items, names } = setup();
    expect(legend()!.nextElementSibling).toBe(chart.element);
    expect(names()).toEqual(["goals", "assists"]);
    expect(items().map((item) => item.getAttribute("data-series"))).toEqual(["goals", "assists"]);
    for (const item of items()) {
      expect(Array.from(item.children, (child) => child.className)).toEqual(["ec-legend-swatch", "ec-legend-label"]);
    }
  });

  it("colours the swatches through the chart's colour assignment, the same as the marks", () => {
    const { chart, swatches } = setup({ colors: { goals: 1, assists: 4 } });
    expect(swatches()).toEqual([seriesColors(1).color, seriesColors(4).color]);
    const segment = chart.element.querySelector<SVGPathElement>('.ec-mark[data-key="Okafor"] [data-series="assists"]')!;
    expect(segment.style.getPropertyValue("--ec-mark")).toBe(seriesColors(4).color);
  });

  it("keeps the names in the theme's text colour, never a series colour", () => {
    const { items } = setup();
    for (const item of items()) {
      expect(item.style.getPropertyValue("color")).toBe("");
      expect(item.querySelector<HTMLElement>(".ec-legend-label")!.getAttribute("style")).toBeNull();
    }
    const css = document.querySelector("style[data-expressive-charts]")!.textContent!;
    expect(css).toMatch(/:where\(\.ec-legend\) \{[^}]*color: var\(--ec-text,/);
    expect(css).toMatch(/:where\(\.ec-legend-swatch\) \{[^}]*background: var\(--ec-mark\)/);
  });

  it("has no legend for a single series", () => {
    expect(setup({ stack: ["goals"] }).legend()).toBeNull();
    expect(setup({ stack: undefined, x: "goals" }).legend()).toBeNull();
  });

  it("is off with legend: false", async () => {
    const { chart, legend, names, settle } = setup({ legend: false });
    expect(legend()).toBeNull();
    await settle(chart.update({ legend: true }));
    expect(names()).toEqual(["goals", "assists"]);
  });

  it("follows the stack as it changes, colours following the series", async () => {
    const colors = colorAssignment();
    const { chart, legend, names, swatches, settle } = setup({ stack: ["goals"], colors });
    expect(legend()).toBeNull();
    const ga = chart.update({ stack: ["goals", "assists"] });
    // At once, as the change starts.
    expect(names()).toEqual(["goals", "assists"]);
    await settle(ga);
    expect(swatches()).toEqual([seriesColors(colors.slot("goals")).color, seriesColors(colors.slot("assists")).color]);
    await settle(chart.update({ stack: ["shots", "assists"] }));
    expect(names()).toEqual(["shots", "assists"]);
    // Assists keeps its colour; shots takes the next free one.
    expect(swatches()).toEqual([seriesColors(3).color, seriesColors(2).color]);
    await settle(chart.update({ stack: ["assists"] }));
    expect(legend()).toBeNull();
  });

  it("follows a new colour assignment", async () => {
    const { chart, swatches, settle } = setup({ colors: { goals: 1, assists: 4 } });
    await settle(chart.update({ colors: { goals: 2, assists: 5 } }));
    expect(swatches()).toEqual([seriesColors(2).color, seriesColors(5).color]);
  });

  it("stays as it was when an update is rejected", async () => {
    const { chart, names } = setup();
    await expect(chart.update({ stack: ["goals"], data: [...players, players[0]!] })).rejects.toThrow(/two rows have the key/);
    expect(names()).toEqual(["goals", "assists"]);
  });

  it("rejects a legend option that isn't a boolean", () => {
    expect(() => setup({ legend: "top" as unknown as boolean })).toThrow(/legend must be true or false/);
  });

  it("lists categories by key, one included, for a donut", () => {
    const svg = document.body.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    const legend = chartLegend(svg);
    const colors = colorAssignment({ Saved: 3 });
    legend.categories([{ key: "Saved", label: "Saved" }], colors, true);
    const items = () => Array.from(document.querySelectorAll<HTMLElement>(".ec-legend-item"));
    expect(items().map((item) => [item.getAttribute("data-key"), item.textContent, item.style.getPropertyValue("--ec-mark")])).toEqual([["Saved", "Saved", seriesColors(3).color]]);
    expect(items()[0]!.hasAttribute("data-series")).toBe(false);
    legend.categories([{ key: "Saved", label: "Saved" }], colors, false);
    expect(document.querySelector(".ec-legend")).toBeNull();
    legend.categories([], colors, true);
    expect(document.querySelector(".ec-legend")).toBeNull();
  });

  it("adds the page's entries after the series, each in its own colour, with the name in the theme's text colour", async () => {
    const entries = [
      { label: "Below target", color: "negative" },
      { label: "Forecast", color: "#7a7a7a" }
    ];
    const { chart, items, names, swatches, settle } = setup({ legend: { entries } });
    expect(names()).toEqual(["goals", "assists", "Below target", "Forecast"]);
    expect(swatches()).toEqual([seriesColors(1).color, seriesColors(2).color, "var(--ec-negative, #d03b3b)", "#7a7a7a"]);
    // The chart's entries say what they are; the page's have no key.
    expect(items().map((item) => item.getAttribute("data-series"))).toEqual(["goals", "assists", null, null]);
    expect(items()[2]!.querySelector<HTMLElement>(".ec-legend-label")!.getAttribute("style")).toBeNull();
    // One series is listed too beside a page's entry, so its colour is named.
    await settle(chart.update({ stack: ["goals"] }));
    expect(names()).toEqual(["goals", "Below target", "Forecast"]);
    await settle(chart.update({ legend: true }));
    expect(names()).toEqual([]);
    await settle(chart.update({ legend: { entries: entries.slice(0, 1) }, stack: ["goals", "assists"] }));
    expect(names()).toEqual(["goals", "assists", "Below target"]);
    await settle(chart.update({ legend: false }));
    expect(names()).toEqual([]);
  });

  it("adds the page's entries after a donut's categories", () => {
    const svg = document.body.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    const legend = chartLegend(svg);
    const colors = colorAssignment({ Saved: 3 });
    legend.categories([{ key: "Saved", label: "Saved" }], colors, { entries: [{ label: "Target", color: "series-5" }] });
    const items = () => Array.from(document.querySelectorAll<HTMLElement>(".ec-legend-item"));
    expect(items().map((item) => [item.getAttribute("data-key"), item.textContent, item.style.getPropertyValue("--ec-mark")])).toEqual([
      ["Saved", "Saved", seriesColors(3).color],
      [null, "Target", seriesColors(5).color]
    ]);
    // With no categories there's nothing for the page's entries to sit beside.
    legend.categories([], colors, { entries: [{ label: "Target", color: "series-5" }] });
    expect(document.querySelector(".ec-legend")).toBeNull();

    // donutChart passes them on.
    const container = document.body.appendChild(document.createElement("div"));
    const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock: manualClock() };
    const data = [
      { outcome: "Saved", shots: 3 },
      { outcome: "Goal", shots: 1 }
    ];
    donutChart(container, { label: "Shots", data, category: "outcome", value: "shots", width: 400, legend: { entries: [{ label: "Target", color: "negative" }] } }, env);
    expect(Array.from(container.querySelectorAll(".ec-legend-item"), (item) => item.textContent)).toEqual(["Saved", "Goal", "Target"]);
  });

  it("rejects entries it can't draw", () => {
    expect(() => setup({ legend: [] as never })).toThrow(/legend must be true or false, or an object/);
    expect(() => setup({ legend: { entries: { label: "Below" } as never } })).toThrow(/legend\.entries must be an array/);
    expect(() => setup({ legend: { entries: [null as never] } })).toThrow(/legend\.entries\[0\] must be an object/);
    expect(() => setup({ legend: { entries: [{ label: " ", color: "negative" }] } })).toThrow(/legend\.entries\[0\]\.label must be a non-empty string/);
    expect(() => setup({ legend: { entries: [{ label: "Below", color: "" }] } })).toThrow(/legend\.entries\[0\]\.color must be a theme token or a CSS colour/);
    expect(() => setup({ legend: { entries: [{ label: "Below", color: "mark" }] } })).toThrow(/legend\.entries\[0\]\.color can't be "mark"/);
  });

  it("is removed with the chart", () => {
    const { chart, container } = setup();
    chart.destroy();
    expect(container.childElementCount).toBe(0);
  });
});
