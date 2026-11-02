// A line chart's layers: every run's drawing (threshold's runs, travel's icon, trace's stroke, label's
// text) is above the lines, their end dots and end labels, and below the points, so a decoration never
// covers a point being read. What reached each layer still does: `.ec-morphing` hides the lines and
// the points, a switch hides the runs while it switches, and the runs take no pointer. Beside
// src/index.ts because it brings a chart and effects together.

import { barChart, chartSwitch, lineChart, type ChartEnv, type LineChartOptions } from "./charts";
import { createMotion, manualClock } from "./core";
import { flush } from "./core/testing";
import { label, morph, only, parallel, threshold, trace, travel } from "./effects";
import { soccerBall } from "./icons/sport";
import { presetRegistry } from "./registries";

interface Week {
  week: number;
  goals: number;
  xg: number;
}

/** Goals below xG from early in week 1 to late in week 4, so the red run crosses weeks 2 to 4's goals points. */
const weeks: Week[] = [
  { week: 1, goals: 1, xg: 0.8 },
  { week: 2, goals: 1, xg: 1.9 },
  { week: 3, goals: 2, xg: 3.1 },
  { week: 4, goals: 3, xg: 3.9 },
  { week: 5, goals: 5, xg: 4.6 },
  { week: 6, goals: 7, xg: 5.4 }
];

function env(): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: { get: (name) => (name === soccerBall.name ? soccerBall : undefined) }, motion, clock: manualClock() };
}

/** The line page's decoration on goals, a trace along xG, and a label on the hovered marks. */
const on: LineChartOptions<Week>["on"] = {
  decorate: parallel(only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on" }))), only("xg", trace())),
  hover: label(() => "here")
};

function setup(options: Partial<LineChartOptions<Week>> = {}) {
  const e = env();
  const chart = lineChart<Week>(document.body.appendChild(document.createElement("div")), { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 640, on, ...options }, e);
  const svg = chart.element;
  return { chart, svg, clock: e.clock, point: (key: string) => svg.querySelector(`.ec-point[data-key="${key}"]`)! };
}

/** The elements matching `selector` by where they come in the <svg>, which is the order they paint in. */
function places(svg: Element, selector: string): number[] {
  const all = Array.from(svg.querySelectorAll("*"));
  return Array.from(svg.querySelectorAll(selector), (element) => all.indexOf(element));
}

/** Whether every run's drawing paints after every part of every line and before every part of every point. */
function between(svg: Element): boolean {
  const lines = places(svg, ".ec-line *");
  const drawn = places(svg, ".ec-run *");
  const points = places(svg, ".ec-point *");
  return Math.max(...lines) < Math.min(...drawn) && Math.max(...drawn) < Math.min(...points);
}

/** What each run draws, by kind. */
function kinds(svg: Element): Record<string, number> {
  const count = (selector: string) => svg.querySelectorAll(`.ec-overlay .ec-run ${selector}`).length;
  return { paths: count("path"), icons: count(".ec-icon"), texts: count("text") };
}

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
}

const visibility = (element: Element): string => getComputedStyle(element).visibility;
const visibilities = (svg: Element, selector: string): string[] => [...new Set(Array.from(svg.querySelectorAll(selector), visibility))];

afterEach(() => {
  document.body.replaceChildren();
});

describe("lineChart's layers", () => {
  it("draws every run between the lines and the points: above every line, end dot and end label, below every point", () => {
    const { svg, clock } = setup();
    clock.advance(400);
    pointer("pointerover", svg.querySelector('.ec-column[data-key="3"]')!);
    clock.advance(400);
    const drawn = kinds(svg);
    expect(drawn.paths).toBeGreaterThanOrEqual(2);
    expect(drawn.icons).toBe(1);
    expect(drawn.texts).toBeGreaterThanOrEqual(1);
    expect(svg.querySelectorAll(".ec-line .ec-end, .ec-line .ec-end-label")).toHaveLength(4);
    expect(between(svg)).toBe(true);
  });

  it('draws every run between the lines and the points with `hover: "point"`, the stops on top', () => {
    const { chart, svg, clock } = setup({ hover: "point" });
    chart.focus("goals@3");
    clock.advance(400);
    expect(kinds(svg).texts).toBe(1);
    expect(between(svg)).toBe(true);
    expect(svg.lastElementChild!.getAttribute("class")).toBe("ec-stops");
  });

  it("shows the hovered point above the threshold run that crosses it", () => {
    for (const hover of ["x", "point"] as const) {
      const { chart, svg, clock, point } = setup({ hover });
      if (hover === "x") pointer("pointerover", svg.querySelector('.ec-column[data-key="3"]')!);
      else chart.focus("goals@3");
      clock.advance(400);
      const hot = point("goals@3");
      expect(hot.classList.contains("ec-hot"), hover).toBe(true);
      expect(getComputedStyle(hot.querySelector(".ec-dot")!).opacity, hover).toBe("1");
      // The red run passes through the point, and paints before it.
      const centre = chart.marks().find((mark) => mark.key === "goals@3")!.center.x;
      const red = Array.from(svg.querySelectorAll<SVGPathElement>('.ec-run[data-key="goals"] path.ec-path')).find((path) => {
        const xs = (path.getAttribute("d")!.match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((pair) => Number(pair.split(",")[0]));
        return xs[0]! < centre && centre < xs[xs.length - 1]!;
      });
      expect(red, hover).toBeDefined();
      const all = Array.from(svg.querySelectorAll("*"));
      expect(all.indexOf(red!) < all.indexOf(hot), hover).toBe(true);
      chart.destroy();
    }
  });

  it("hides the lines and the points with `.ec-morphing`, and not the runs", () => {
    const { svg, clock } = setup();
    clock.advance(400);
    expect(visibilities(svg, ".ec-run *")).toEqual(["visible"]);
    svg.classList.add("ec-morphing");
    expect(visibilities(svg, ".ec-line, .ec-line *, .ec-point, .ec-point *")).toEqual(["hidden"]);
    expect(visibilities(svg, ".ec-run *")).toEqual(["visible"]);
    svg.classList.remove("ec-morphing");
    expect(visibilities(svg, ".ec-line, .ec-line *, .ec-point *")).toEqual(["visible"]);
  });

  it("hides the runs, the lines and the points while a switch switches, and shows them again after", async () => {
    const e = env();
    const switcher = chartSwitch(
      document.body.appendChild(document.createElement("div")),
      {
        views: {
          line: (el) => lineChart<Week>(el, { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 640, on }, e),
          columns: (el) => barChart(el, { label: "Goals per match", data: weeks, x: (d) => String(d.week), y: "goals", key: (d) => `goals@${d.week}`, orientation: "vertical", width: 640 }, e)
        },
        initial: "line",
        transition: morph()
      },
      e
    );
    const svg = switcher.chart("line").element;
    const land = async () => {
      e.clock.advance(950);
      await flush();
    };
    e.clock.advance(400);
    expect(kinds(svg).paths).toBeGreaterThanOrEqual(2);
    void switcher.show("columns");
    expect(visibilities(svg, ".ec-run *")).toEqual(["hidden"]);
    expect(visibilities(svg, ".ec-line *, .ec-point *")).toEqual(["hidden"]);
    await land();
    void switcher.show("line");
    await land();
    expect(visibilities(svg, ".ec-run *")).toEqual(["visible"]);
    expect(visibilities(svg, ".ec-line *")).toEqual(["visible"]);
    expect(between(svg)).toBe(true);
  });

  it("gives the runs no pointer: the x's and the stops stay above everything", () => {
    for (const hover of ["x", "point"] as const) {
      const { chart, svg } = setup({ hover });
      for (const layer of [".ec-overlay", ".ec-lines", ".ec-points"]) expect(getComputedStyle(svg.querySelector(layer)!).pointerEvents, layer).toBe("none");
      const children = Array.from(svg.children, (child) => child.getAttribute("class"));
      expect(children.slice(children.indexOf("ec-overlay")), hover).toEqual(hover === "x" ? ["ec-overlay", "ec-marks", "ec-columns"] : ["ec-overlay", "ec-marks", "ec-columns", "ec-stops"]);
      chart.destroy();
    }
  });
});
