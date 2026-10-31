// A chart switch with the real morph() and line charts (M11 step 1): a season's goals and xG per match
// with missing weeks, as a line chart, as season-to-date lines, and as goals' columns keyed as the
// points are. Beside src/index.ts because it brings charts and an effect together, as only the
// composition root may. src/charts/switch.test.ts checks the same switches with a recording effect.

import { createMotion, describe as geometry, easeInOutCubic, manualClock, type MarkGeometry, type Point } from "./core";
import { createRegistry, type PresetFactory } from "./core/registry";
import { flush, measurePath } from "./core/testing";
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

describe("chartSwitch with morph(): the morph page's season, per match and to date, paired by x (M12 step 2)", () => {
  /** The morph page's season (demo/morph.ts): seed 42, 38 matchweeks, cumulative goals and xG. */
  function season(): { week: number; goals: number; xg: number }[] {
    let seed = 42;
    const random = (): number => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    const poisson = (lambda: number): number => {
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= random();
      } while (p > limit);
      return k - 1;
    };
    const weeks: { week: number; goals: number; xg: number }[] = [];
    let [goals, xg] = [0, 0];
    for (let i = 0; i < 38; i++) {
      const chance = 0.6 + random() * 1.9;
      xg += chance;
      goals += poisson(chance * (i < 12 ? 0.72 : i < 26 ? 1.32 : 0.7));
      weeks.push({ week: i + 1, goals, xg: Math.round(xg * 10) / 10 });
    }
    return weeks;
  }
  // As on the morph page: no values for weeks 9 and 10, and no xG for weeks 4 and 5.
  const full = season();
  const gone = (week: number, xg: boolean): boolean => [9, 10].includes(week) || (xg && [4, 5].includes(week));
  const toDateSeason: Week[] = full.map((w) => ({ week: w.week, goals: gone(w.week, false) ? null : w.goals, xg: gone(w.week, true) ? null : w.xg }));
  const perMatchSeason: Week[] = full.map((w, i) => {
    const before = full[i - 1] ?? { goals: 0, xg: 0 };
    return { week: w.week, goals: gone(w.week, false) ? null : w.goals - before.goals, xg: gone(w.week, true) ? null : Math.round((w.xg - before.xg) * 10) / 10 };
  });

  function seasonSwitch() {
    const clock = manualClock();
    const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
    const target = document.body.appendChild(document.createElement("div"));
    const switcher = chartSwitch(
      target,
      {
        views: {
          perMatch: (el, shared) => lineChart<Week>(el, { label: "Per match", data: perMatchSeason, x: "week", series: ["goals", "xg"], colors: shared, width: 600, height: 300 }, env),
          toDate: (el, shared) => lineChart<Week>(el, { label: "Season to date", data: toDateSeason, x: "week", series: ["goals", "xg"], colors: shared, width: 600, height: 300 }, env)
        },
        initial: "perMatch",
        // morph()'s default points.
        transition: morph(),
        colors: colorAssignment()
      },
      env
    );
    const overlay = target.querySelector(".ec-switch-overlay") as SVGSVGElement;
    return { switcher, overlay, clock, perMatch: switcher.chart("perMatch"), toDate: switcher.chart("toDate") };
  }

  /** The x's of a line's walk across the weeks both lines miss, at eased progress p: each share of the way across moved from one line's x toward the other's. */
  function bothMiss(a: MarkGeometry, b: MarkGeometry, p: number): [number, number][] {
    const shares = (mark: MarkGeometry): [number, number][] => (mark.gaps ?? []).map(([t0, t1]) => [t0, t1].map((t) => (mark.path(t).x - mark.start.x) / (mark.end.x - mark.start.x)) as [number, number]);
    const x = (s: number): number => (a.start.x + s * (a.end.x - a.start.x)) * (1 - p) + (b.start.x + s * (b.end.x - b.start.x)) * p;
    return shares(a).flatMap(([a0, a1]) => shares(b).flatMap(([b0, b1]): [number, number][] => (Math.min(a1, b1) > Math.max(a0, b0) ? [[x(Math.max(a0, b0)), x(Math.min(a1, b1))]] : [])));
  }

  /** The lines of path data, as [from, to]. */
  const linesOf = (d: string): [Point, Point][] => {
    const out: [Point, Point][] = [];
    let pen: Point | undefined;
    for (const { op, args } of measurePath(d).commands) {
      const point = { x: args[args.length - 2]!, y: args[args.length - 1]! };
      if (op === "L" && pen) out.push([pen, point]);
      pen = point;
    }
    return out;
  };

  /** How far a point is from the nearest of the lines. */
  const offLines = (point: Point, lines: readonly [Point, Point][]): number =>
    Math.min(
      ...lines.map(([a, b]) => {
        const [dx, dy] = [b.x - a.x, b.y - a.y];
        const u = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(point.x - a.x - u * dx, point.y - a.y - u * dy);
      })
    );

  it("draws nothing in the weeks both lines miss on any 16 ms frame, both ways, fades nothing, and draws each line's own polyline next to each end, through every vertex within 0.01 px", async () => {
    const { switcher, overlay, clock, perMatch, toDate } = seasonSwitch();
    for (const [view, fromChart, toChart] of [
      ["toDate", perMatch, toDate],
      ["perMatch", toDate, perMatch]
    ] as const) {
      const from = byKey(fromChart.marks());
      const to = byKey(toChart.marks());
      void switcher.show(view);
      for (let ms = 0; ms < 950; ms += 16) {
        const p = easeInOutCubic(ms / 950);
        for (const key of ["goals", "xg"]) {
          const [a, b] = [from.get(key)!, to.get(key)!];
          // By t, the lines' gaps don't meet: one line per match is longer than the same to date.
          expect(a.gaps).not.toEqual(b.gaps);
          const paths = Array.from(overlay.querySelectorAll(`.ec-switch-runs > .ec-run[data-key="${key}"] path`));
          // One path at full strength: the two miss the same weeks, so no part of either's gaps fades.
          expect(paths.map((path) => path.getAttribute("opacity")), `${key} at ${p}`).toEqual([null]);
          const drawn = linesOf(paths[0]!.getAttribute("d")!);
          const missed = bothMiss(a, b, p);
          expect(missed.length, key).toBe(key === "goals" ? 1 : 2);
          for (const [x0, x1] of missed) {
            const [lo, hi] = [Math.min(x0, x1), Math.max(x0, x1)];
            const across = drawn.filter(([m, n]) => Math.max(m.x, n.x) > lo + 0.01 && Math.min(m.x, n.x) < hi - 0.01);
            expect(across, `${key} to ${view} at ${p}`).toEqual([]);
          }
          // Next to each end, the stroke runs through every vertex of that end's line.
          const end = ms === 16 ? a : ms === 944 ? b : undefined;
          for (const vertex of end ? measurePath(end.outline.d).points : []) expect(offLines(vertex, drawn), `${key} to ${view} at ${p}: ${vertex.x},${vertex.y}`).toBeLessThan(0.01);
        }
        clock.advance(16);
      }
      clock.advance(950);
      await flush();
      for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    }
  });
});
