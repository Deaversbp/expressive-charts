// A chart switch with the real morph() and line charts (M11 step 1): a season's goals and xG per match
// with missing weeks, as a line chart, as season-to-date lines, and as goals' columns keyed as the
// points are. Beside src/index.ts because it brings charts and an effect together, as only the
// composition root may. src/charts/switch.test.ts checks the same switches with a recording effect.

import { createMotion, describe as geometry, easeInOutCubic, manualClock, type MarkGeometry, type Point } from "./core";
import { createRegistry, type PresetFactory } from "./core/registry";
import { flush } from "./core/testing";
import { barChart, chartSwitch, colorAssignment, lineChart, type ChartEnv } from "./charts";
import { seriesColors } from "./charts/render/theme";
import { morph } from "./effects";

interface Week {
  readonly week: number;
  readonly goals: number | null;
  readonly xg: number | null;
}

/** Per match, with missing weeks: goals in weeks 4 and 6 are each alone between gaps, so their points are drawn at rest. */
const perMatch: Week[] = [
  { week: 1, goals: 1, xg: 0.8 },
  { week: 2, goals: 2, xg: 1.4 },
  { week: 3, goals: null, xg: 1.1 },
  { week: 4, goals: 1, xg: null },
  { week: 5, goals: null, xg: 2 },
  { week: 6, goals: 3, xg: 1.7 }
];

/** Season to date, with the same gaps. */
const toDate: Week[] = [
  { week: 1, goals: 1, xg: 0.8 },
  { week: 2, goals: 3, xg: 2.2 },
  { week: 3, goals: null, xg: 3.3 },
  { week: 4, goals: 4, xg: null },
  { week: 5, goals: null, xg: 5.3 },
  { week: 6, goals: 7, xg: 7 }
];

/** Goals per match as columns, for the weeks with a value, keyed as the points are. */
const played = perMatch.flatMap((d) => (d.goals === null ? [] : [{ week: d.week, goals: d.goals }]));
const PLAYED = played.map((d) => `goals@${d.week}`);
/** Alone between gaps: drawn at rest. */
const ALONE = new Set(["goals@4", "goals@6"]);
const POINTS = 160;

function setup() {
  const clock = manualClock();
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const target = document.body.appendChild(document.createElement("div"));
  const colors = colorAssignment();
  const switcher = chartSwitch(
    target,
    {
      views: {
        perMatch: (el, shared) => lineChart<Week>(el, { label: "Per match", data: perMatch, x: "week", series: ["goals", "xg"], colors: shared, width: 600 }, env),
        toDate: (el, shared) => lineChart<Week>(el, { label: "Season to date", data: toDate, x: "week", series: ["goals", "xg"], colors: shared, width: 600 }, env),
        columns: (el, shared) =>
          barChart(el, { label: "Goals per match", data: played, x: (d) => String(d.week), y: "goals", key: (d) => `goals@${d.week}`, orientation: "vertical", colors: shared, width: 600 }, env)
      },
      initial: "perMatch",
      transition: morph(),
      colors
    },
    env
  );
  const overlay = target.querySelector(".ec-switch-overlay") as SVGSVGElement;
  const land = async () => {
    clock.advance(950);
    await flush();
  };
  return { switcher, overlay, clock, colors, land, line: switcher.chart("perMatch"), season: switcher.chart("toDate"), columns: switcher.chart("columns") };
}

/** Each pair's morph as drawn now, by key. */
function shapes(overlay: SVGSVGElement): Map<string, SVGPathElement> {
  return new Map(Array.from(overlay.querySelectorAll(".ec-switch-runs > .ec-run"), (group) => [group.getAttribute("data-key")!, group.querySelector("path")!]));
}

/** The points of a sampled polygon's path data. */
function points(d: string): Point[] {
  return Array.from(d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g), ([, x, y]) => ({ x: Number(x), y: Number(y) }));
}

/** The furthest any point of the pairs' shapes moved between two pictures, px. */
function jump(before: Map<string, string>, after: Map<string, string>): number {
  expect([...after.keys()]).toEqual([...before.keys()]);
  let most = 0;
  for (const [key, d] of before) {
    const a = points(d);
    const b = points(after.get(key)!);
    expect(b).toHaveLength(a.length);
    a.forEach((p, i) => (most = Math.max(most, Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y))));
  }
  return most;
}

const drawn = (overlay: SVGSVGElement): Map<string, string> => new Map(Array.from(shapes(overlay), ([key, path]) => [key, path.getAttribute("d")!]));
const byKey = (marks: readonly MarkGeometry[]) => new Map(marks.map((mark) => [mark.key, mark]));
const mix = (a: Point, b: Point, p: number): Point => ({ x: a.x * (1 - p) + b.x * p, y: a.y * (1 - p) + b.y * p });
const near = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) <= 0.0011 && Math.abs(a.y - b.y) <= 0.0011;
const markColor = (element: Element): string => (element as SVGElement).style.getPropertyValue("--ec-mark");

afterEach(() => {
  document.body.textContent = "";
});

describe("chartSwitch with morph(): a line chart and its points' columns", () => {
  it("grows each column out of its point, from a dot of no size at its centre, while the lines fade out over the first half, all in their series' colours", async () => {
    const { switcher, overlay, line, columns, clock, colors, land } = setup();
    const points0 = byKey(line.marks());
    const bars = byKey(columns.marks());
    void switcher.show("columns");
    // The first frame: a hidden point is a dot of no size, a point alone between gaps its own dot.
    const first = shapes(overlay);
    expect([...first.keys()]).toEqual(PLAYED);
    for (const [key, path] of first) {
      const point = points0.get(key)!;
      expect(path.getAttribute("d")).toBe((ALONE.has(key) ? point : geometry.point({ key, x: point.center.x, y: point.center.y, r: 0 })).outline.d);
      expect(markColor(path.parentElement!)).toBe(seriesColors(colors.slot("goals")).color);
      expect(path.style.fill.startsWith("var(--ec-mark,")).toBe(true);
    }
    // Half way: each sample half way from its point to the column.
    clock.advance(475);
    for (const [key, path] of shapes(overlay)) {
      const point = points0.get(key)!;
      const from = ALONE.has(key) ? point.outline.sample(POINTS) : Array.from({ length: POINTS }, () => point.center);
      const to = bars.get(key)!.outline.sample(POINTS);
      const at = points(path.getAttribute("d")!);
      expect(at).toHaveLength(POINTS);
      expect(at.every((p, i) => near(p, mix(from[i]!, to[i]!, 0.5)))).toBe(true);
    }
    // The lines are gone by half way.
    const fades = Array.from(overlay.querySelectorAll(".ec-switch-fades > .ec-switch-fade"));
    expect(fades.map((fade) => [fade.getAttribute("data-key"), fade.getAttribute("opacity"), markColor(fade)])).toEqual([
      ["goals", "0", seriesColors(colors.slot("goals")).color],
      ["xg", "0", seriesColors(colors.slot("xg")).color]
    ]);
    await land();
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    expect(columns.element.classList.contains("ec-morphing")).toBe(false);
  });

  it("shrinks each column back into its point, ends on the line as it's drawn, and doesn't jump on a switch back mid-way", async () => {
    const { switcher, overlay, line, columns, clock, land } = setup();
    const points0 = byKey(line.marks());
    const bars = byKey(columns.marks());
    void switcher.show("columns");
    await land();
    void switcher.show("perMatch");
    clock.advance(475);
    for (const [key, path] of shapes(overlay)) {
      const point = points0.get(key)!;
      const to = ALONE.has(key) ? point.outline.sample(POINTS) : Array.from({ length: POINTS }, () => point.center);
      const from = bars.get(key)!.outline.sample(POINTS);
      expect(points(path.getAttribute("d")!).every((p, i) => near(p, mix(from[i]!, to[i]!, 0.5)))).toBe(true);
    }
    // Just before it lands: the hidden points' columns all but gone into their centres, the lines all but in, as drawn.
    clock.advance(474);
    const s = easeInOutCubic(949 / 950);
    for (const [key, path] of shapes(overlay)) {
      if (ALONE.has(key)) continue;
      const centre = points0.get(key)!.center;
      for (const p of points(path.getAttribute("d")!)) expect(Math.hypot(p.x - centre.x, p.y - centre.y)).toBeLessThan(0.01);
    }
    for (const fade of Array.from(overlay.querySelectorAll(".ec-switch-fades > .ec-switch-fade"))) {
      expect(fade.querySelector("path")!.getAttribute("d")).toBe(points0.get(fade.getAttribute("data-key")!)!.outline.d);
      expect(Number(fade.getAttribute("opacity"))).toBeCloseTo((s - 0.5) / 0.5, 3);
    }
    await land();

    // A switch back mid-way plays the same picture backwards from where it is.
    void switcher.show("columns");
    clock.advance(300);
    const before = drawn(overlay);
    void switcher.show("perMatch");
    expect(jump(before, drawn(overlay))).toBe(0);
    clock.advance(200);
    const again = drawn(overlay);
    void switcher.show("columns");
    expect(jump(again, drawn(overlay))).toBe(0);
  });
});

describe("chartSwitch with morph(): two line charts", () => {
  it("morphs each line into its own along its stroke, from its own outline to the other's, and plays only a value alone between gaps among the points, dot to dot", async () => {
    const { switcher, overlay, line, season, clock, colors, land } = setup();
    const from = byKey(line.marks());
    const to = byKey(season.marks());
    void switcher.show("toDate");
    const first = shapes(overlay);
    expect([...first.keys()]).toEqual(["goals", "xg", "goals@4", "goals@6"]);
    for (const [key, path] of first) {
      expect(path.getAttribute("d")).toBe(from.get(key)!.outline.d);
      const series = key.split("@")[0]!;
      expect(markColor(path.parentElement!)).toBe(seriesColors(colors.slot(series)).color);
      // A line is a stroke, a point a fill.
      const [paint, other] = key.includes("@") ? [path.style.fill, path.style.stroke] : [path.style.stroke, path.style.fill];
      expect([paint.startsWith("var(--ec-mark,"), other || "none"]).toEqual([true, "none"]);
    }
    clock.advance(475);
    for (const key of ["goals@4", "goals@6"]) {
      const a = from.get(key)!.outline.sample(POINTS);
      const b = to.get(key)!.outline.sample(POINTS);
      expect(points(shapes(overlay).get(key)!.getAttribute("d")!).every((p, i) => near(p, mix(a[i]!, b[i]!, 0.5)))).toBe(true);
    }
    // Nothing fades: every mark has its partner, and the hidden points aren't drawn.
    expect(overlay.querySelectorAll(".ec-switch-fades > *")).toHaveLength(0);
    // The last frame: each the other chart's own.
    clock.advance(474);
    await flush();
    clock.advance(1);
    for (const [key, path] of shapes(overlay)) expect(path.getAttribute("d")).toBe(to.get(key)!.outline.d);
    await land();
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
  });
});
