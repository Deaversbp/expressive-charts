// drawIn on real marks: our bar chart's stacked bars and expressive()'s stacked rects draw in as they
// enter, each part in its own colour through Paint.part, over the mark made faint, with their labels
// as they are. This test brings charts and effects together, so it lives beside src/index.ts.

import { barChart, expressive, type ChartEnv } from "./charts";
import { seriesColors } from "./charts/render/theme";
import { createMotion, easeInOutCubic, manualClock, type MarkGeometry } from "./core";
import { createRegistry, type PresetFactory } from "./core/registry";
import { flush } from "./core/testing";
import { drawIn } from "./effects";

interface Player {
  name: string;
  goals: number;
  assists: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 16, assists: 4 },
  { name: "Tanaka", goals: 6, assists: 9 },
  { name: "Lindqvist", goals: 10, assists: 3 }
];

const SVG = "http://www.w3.org/2000/svg";

function env(): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock: manualClock() };
}

const el = (tag: string, attributes: Record<string, string | number>, parent: Element): SVGElement => {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  parent.appendChild(element);
  return element;
};

/** The paths a mark's enter run draws, from the first. */
const drawnFor = (svg: Element, key: string): SVGPathElement[] => Array.from(svg.querySelectorAll<SVGPathElement>(`.ec-run[data-key="${key}"][data-slot="enter"] path`));

/** Each segment's path data part way: the first `share`s along, eased, as drawIn draws them. */
const slices = (mark: MarkGeometry, ...shares: number[]): string[] => mark.segments!.map((segment, i) => segment.slice(0, easeInOutCubic(shares[i]!)));

afterEach(() => {
  document.body.replaceChildren();
});

describe("drawIn on barChart's stacked bars", () => {
  it("draws each bar's segments in turn, in their series' colours, over the bar made faint, its labels as they are", async () => {
    const e = env();
    const chart = barChart<Player>(
      document.body.appendChild(document.createElement("div")),
      { label: "Goals and assists", data: players, y: "name", stack: ["goals", "assists"], width: 600, on: { enter: drawIn() } },
      e
    );
    const svg = chart.element;
    const okafor = chart.marks().find((mark) => mark.key === "Okafor")!;
    const [goals, assists] = okafor.segments!;
    const paths = drawnFor(svg, "Okafor");
    expect(paths.map((path) => path.getAttribute("data-part"))).toEqual(["Okafor/goals", "Okafor/assists"]);
    expect(paths.map((path) => path.style.getPropertyValue("--ec-mark"))).toEqual([seriesColors(1).color, seriesColors(2).color]);
    expect(paths.map((path) => path.style.getPropertyValue("--ec-mark-strong"))).toEqual([seriesColors(1).strong, seriesColors(2).strong]);
    expect(paths.map((path) => [path.getAttribute("stroke-width"), path.getAttribute("stroke-linecap")])).toEqual([
      [String(goals!.thickness), "butt"],
      [String(assists!.thickness), "butt"]
    ]);
    // The run's group keeps the bar's own colours, its first segment's.
    expect(paths[0]!.closest<SVGGElement>(".ec-run")!.style.getPropertyValue("--ec-mark")).toBe(seriesColors(1).color);

    const group = svg.querySelector(`.ec-mark[data-key="Okafor"]`)!;
    const body = group.querySelector(".ec-body")!;
    const labels = Array.from(group.querySelectorAll(".ec-label, .ec-value"));
    expect(labels).toHaveLength(2);
    const share = goals!.length / (goals!.length + assists!.length);
    // Half way through goals' share of the time, then half way through assists'.
    e.clock.advance(750 * share * 0.5);
    expect(paths.map((path) => path.getAttribute("d"))).toEqual(slices(okafor, 0.5, 0));
    e.clock.advance(750 * share * 0.5 + 750 * (1 - share) * 0.5);
    expect(paths.map((path) => path.getAttribute("d"))).toEqual(slices(okafor, 1, 0.5));
    expect(body.getAttribute("opacity")).toBe("0.3");
    expect(labels.map((label) => label.getAttribute("opacity"))).toEqual([null, null]);

    e.clock.advance(400);
    await flush();
    expect(svg.querySelectorAll(".ec-run path")).toHaveLength(0);
    expect(body.hasAttribute("opacity")).toBe(false);
    expect(labels.map((label) => label.getAttribute("opacity"))).toEqual([null, null]);
    chart.destroy();
  });
});

describe("drawIn on expressive()'s stacked rects", () => {
  it("draws each bar's rects in turn, each in the colour the host drew it", async () => {
    const e = env();
    const svg = el("svg", { width: 600, height: 120 }, document.body) as SVGSVGElement;
    const plot = el("g", { transform: "translate(90,4)" }, svg);
    const rects: Element[] = [];
    (["goals", "assists"] as const).forEach((series, s) => {
      const group = el("g", { fill: s === 0 ? "#2a78d6" : "#eb6834" }, plot);
      players.forEach((player, i) => {
        const rect = el("rect", { x: (s === 0 ? 0 : player.goals) * 20, y: i * 34 + 7, width: player[series] * 20, height: 20 }, group);
        (rect as unknown as { __data__: unknown }).__data__ = { row: player, series };
        rects.push(rect);
      });
    });
    const fx = expressive<{ row: Player; series: string }>(rects, { key: (d) => d.row.name, segment: (d) => d.series, on: { enter: drawIn() } }, e);
    const tanaka = fx.marks().find((mark) => mark.key === "Tanaka")!;
    const paths = drawnFor(svg, "Tanaka");
    expect(paths.map((path) => path.getAttribute("data-part"))).toEqual(["Tanaka/goals", "Tanaka/assists"]);
    expect(paths[0]!.style.getPropertyValue("--ec-mark")).toMatch(/^(#2a78d6|rgb\(42, 120, 214\))$/);
    expect(paths[1]!.style.getPropertyValue("--ec-mark")).toMatch(/^(#eb6834|rgb\(235, 104, 52\))$/);
    // The rects are faint while they draw in. Tanaka's run is two fifths goals (120 of 300 px), then three fifths assists.
    expect(rects.filter((rect) => (rect as SVGElement).style.getPropertyValue("opacity") === "0.3")).toHaveLength(6);
    e.clock.advance(750 * 0.2);
    expect(paths.map((path) => path.getAttribute("d"))).toEqual(slices(tanaka, 0.5, 0));
    e.clock.advance(750 * 0.5);
    expect(paths.map((path) => path.getAttribute("d"))).toEqual(slices(tanaka, 1, 0.5));
    e.clock.advance(400);
    await flush();
    expect(svg.querySelectorAll(".ec-run path")).toHaveLength(0);
    expect(rects.filter((rect) => (rect as SVGElement).style.getPropertyValue("opacity") !== "")).toHaveLength(0);
    fx.destroy();
  });
});
