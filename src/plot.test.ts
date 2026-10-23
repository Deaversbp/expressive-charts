// Observable Plot charts through expressive(), with real Plot (a pinned dev dependency, never a
// runtime one): a stacked bar and a two-series line, rendered in jsdom through Plot's document option.
// Plot binds row indices, not rows, so the page passes a datum accessor: a bar's rect holds its row's
// index, and a line's path its series' array of row indices, with -1 at a gap. The line is described
// from those rows' points through Plot's scales and sampled with samplesAlong, so threshold colours the
// goals line below xG, the keyboard goes in visual order, and Plot's next <svg> is followed through
// refresh(). After a group transform the index points into Plot's derived data, so those bars read
// their rows from the channels the mark's render option gets. The effect conformance checks run on the
// same kinds of marks in conformance.test.ts. It brings charts and effects together, so it lives beside
// src/index.ts, the only module allowed to.

import { barX, groupY, lineY, plot, type Plot } from "@observablehq/plot";
import { expressive, type ChartEnv, type ExpressiveOptions } from "./charts";
import { createMotion, describe as build, manualClock, samplesAlong, type DataEffect, type MarkData, type MarkGeometry, type MotionMode } from "./core";
import { measurePath } from "./core/testing";
import { only, threshold } from "./effects";
import { iconRegistry, presetRegistry } from "./registries";

type Metric = "goals" | "assists";
/** Plot's long form for the stack: one row per player and metric. */
interface Stat {
  name: string;
  metric: Metric;
  value: number;
}

const players = [
  { name: "Okafor", goals: 16, assists: 4 },
  { name: "Lindqvist", goals: 11, assists: 9 },
  { name: "Tanaka", goals: 7, assists: 12 }
];
const stats: Stat[] = players.flatMap((p) => [
  { name: p.name, metric: "goals" as const, value: p.goals },
  { name: p.name, metric: "assists" as const, value: p.assists }
]);

type Series = "goals" | "xg";
/** And for the line: one row per week and series. */
interface Week {
  week: number;
  series: Series;
  value: number;
}

/** Cumulative goals and xG over ten weeks: goals fall below xG in weeks 2, 4–5 and 7–8 (as in d3-line.test.ts). */
const GOALS = [1, 1, 3, 3, 4, 7, 7, 8, 10, 11];
const XG = [0.8, 1.9, 2.8, 4.2, 5.4, 6.1, 7.6, 8.6, 9.5, 10.8];
const season: Week[] = GOALS.flatMap((goals, i) => [
  { week: i + 1, series: "goals" as const, value: goals },
  { week: i + 1, series: "xg" as const, value: XG[i]! }
]);

const LABELS: Record<Series, string> = { goals: "Goals scored", xg: "Expected goals" };
const WIDTH = 2.25;
/** Plot's default margins, given so the numbers below don't depend on them. */
const MARGINS = { marginLeft: 40, marginRight: 20, marginTop: 20, marginBottom: 30 };

type PlotSvg = SVGSVGElement & Plot;

/** A stacked Plot bar: goals then assists for each player, 21.6 px a goal across a 600 px plot. */
function plotBars(rows: Stat[] = stats): PlotSvg {
  const svg = plot({
    document,
    width: 600,
    height: 180,
    ...MARGINS,
    x: { domain: [0, 25] },
    y: { domain: players.map((p) => p.name) },
    marks: [barX(rows, { x: "value", y: "name", fill: "metric" })]
  }) as PlotSvg;
  return document.body.appendChild(svg);
}

/** A two-series Plot line: 60 px a week and 20 px a goal, the plot 40 px in and 20 px down. */
function plotLine(rows: Week[] = season): PlotSvg {
  const svg = plot({
    document,
    width: 600,
    height: 290,
    ...MARGINS,
    x: { domain: [1, 10] },
    y: { domain: [0, 12] },
    marks: [lineY(rows, { x: "week", y: "value", stroke: "series", strokeWidth: WIDTH })]
  }) as PlotSvg;
  return document.body.appendChild(svg);
}

const rectsOf = (svg: SVGSVGElement): SVGRectElement[] => Array.from(svg.querySelectorAll<SVGRectElement>('g[aria-label="bar"] > rect'));
const linePaths = (svg: SVGSVGElement): SVGPathElement[] => Array.from(svg.querySelectorAll<SVGPathElement>('g[aria-label="line"] > path'));
/** What Plot binds to an element: a row's index, or a line's array of them. */
const bound = <T>(element: Element): T => (element as Element & { __data__: T }).__data__;

/** What a page passes for Plot's bars: each rect's row by its index, keyed by player, a part per metric. */
function barOptions(rows: () => Stat[] = () => stats): ExpressiveOptions<Stat> {
  return {
    datum: (el) => rows()[bound<number>(el)]!,
    key: (d) => d.name,
    segment: (d) => d.metric,
    value: (d) => d.value,
    keyboard: true,
    markLabel: (_d, mark) => `${mark.key}: ${mark.parts.map((part) => `${part.datum.value} ${part.series}`).join(", ")}`
  };
}

/**
 * What a page passes for Plot's line: each path's rows from its indices (leaving out the -1 at a gap),
 * described from those rows' points through Plot's own scales and sampled at the same points. The
 * points are in the line group's coordinates; Plot's translate(0.5,0.5) on that group stays out of
 * them, and the adapter gives the overlay the group's transform.
 */
function lineOptions(svg: PlotSvg, rows: Week[] = season): ExpressiveOptions<Week[]> {
  const x = (week: number): number => svg.scale("x")!.apply(week);
  const y = (value: number): number => svg.scale("y")!.apply(value);
  return {
    datum: (el) => bound<number[]>(el).filter((i) => i >= 0).map((i) => rows[i]!),
    key: (d) => d[0]!.series,
    geometry: (_el, d, key) => build.line({ key, series: key, points: d.map((w) => ({ x: x(w.week), y: y(w.value) })), width: WIDTH }),
    samples: (d, mark) => samplesAlong(mark, d.map((w) => ({ x: x(w.week), y: y(w.value), value: w.value, at: w.week }))),
    keyboard: true,
    markLabel: (d) => `${LABELS[d[0]!.series]}: ${d[d.length - 1]!.value} by week ${d[d.length - 1]!.week}`
  };
}

function env(mode: MotionMode = "presentation"): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

const overlayOf = (svg: SVGSVGElement): SVGGElement | null => svg.querySelector(":scope > .ec-overlay");

/** Records each mark's data, as a data effect gets it. */
function recorder<D>(seen: Map<string, MarkData<D>>): DataEffect<D> {
  return { kind: "data", run: async (mark, data) => void seen.set(mark.key, data), end: (mark, data) => void seen.set(mark.key, data), clear() {} };
}

function key(name: string): void {
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
}

function runPaths(svg: SVGSVGElement, series: Series = "goals"): SVGPathElement[] {
  return Array.from(overlayOf(svg)!.querySelectorAll<SVGPathElement>(`.ec-run[data-key="${series}"] path`));
}

/** The red runs on the goals line, as [from, to] in weeks. */
function runs(svg: SVGSVGElement): [number, number][] {
  return runPaths(svg).map((path) => {
    const { start, end } = measurePath(path.getAttribute("d")!);
    return [(start!.x - 40) / 60 + 1, (end!.x - 40) / 60 + 1];
  });
}

/** Where goals cross xG, and the runs below it: from the data, not the drawing (as in vega.test.ts). */
function expectedRuns(): [number, number][] {
  const found: [number, number][] = [];
  let from: number | undefined = GOALS[0]! < XG[0]! ? 1 : undefined;
  for (let i = 1; i < GOALS.length; i++) {
    const da = GOALS[i - 1]! - XG[i - 1]!;
    const db = GOALS[i]! - XG[i]!;
    if (Math.sign(da) === Math.sign(db) || db === 0) continue;
    const crossing = i + da / (da - db);
    if (db < 0) from = crossing;
    else if (from !== undefined) {
      found.push([from, crossing]);
      from = undefined;
    }
  }
  if (from !== undefined) found.push([from, GOALS.length]);
  return found;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("a stacked Plot bar through expressive()", () => {
  it("reads each rect's row through its index, one bar per player with its goals and assists as segments from the baseline", () => {
    const svg = plotBars();
    expect(rectsOf(svg).map((rect) => bound<number>(rect))).toEqual([0, 1, 2, 3, 4, 5]);
    const seen = new Map<string, MarkData<Stat>>();
    const fx = expressive(rectsOf(svg), { ...barOptions(), on: { decorate: recorder(seen) } }, env());
    const x = (value: number): number => svg.scale("x")!.apply(value);
    expect(fx.marks().map((mark) => mark.key)).toEqual(["Okafor", "Lindqvist", "Tanaka"]);
    for (const [i, mark] of fx.marks().entries()) {
      const { goals, assists } = players[i]!;
      // From the plot's left edge, in Plot's scale: goals first, as Plot stacks in data order.
      expect(mark.start.x).toBeCloseTo(40, 6);
      expect(mark.length).toBeCloseTo(x(goals + assists) - x(0), 6);
      expect(mark.segments!.map((s) => s.series)).toEqual(["goals", "assists"]);
      expect(mark.segments!.map((s) => s.length)).toEqual([expect.closeTo(x(goals) - x(0), 6), expect.closeTo(x(assists) - x(0), 6)]);
      // The bar chart's samples, from the values the rows give.
      const data = seen.get(mark.key)!;
      expect(data.datum).toBe(stats[2 * i]);
      expect(data.samples).toEqual([{ t: 0, value: 0 }, { t: 1, value: goals + assists }]);
      expect(data.related("assists")!.samples).toEqual([{ t: 0, value: goals }, { t: 1, value: goals + assists }]);
    }
    // Plot's bar group has no transform, so the overlay has none either.
    expect(overlayOf(svg)!.getAttribute("transform")).toBeNull();
  });

  it("is one tab stop, the arrow keys going top to bottom, each bar named once", () => {
    const svg = plotBars();
    expressive(rectsOf(svg), barOptions(), env());
    const rects = rectsOf(svg);
    expect(rects.map((rect) => rect.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1", "-1", "-1"]);
    // The goals rect, at the baseline, carries the name; the assists rect is hidden, so a stack is read once.
    expect(rects.slice(0, 2).map((rect) => [rect.getAttribute("role"), rect.getAttribute("aria-label"), rect.getAttribute("aria-hidden")])).toEqual([
      ["img", "Okafor: 16 goals, 4 assists", null],
      [null, null, "true"]
    ]);
    rects[0]!.focus();
    const visits: string[] = [];
    for (const name of ["ArrowDown", "ArrowDown", "ArrowDown", "Home", "End", "ArrowUp"]) {
      key(name);
      visits.push(stats[bound<number>(document.activeElement!)]!.name);
    }
    expect(visits).toEqual(["Lindqvist", "Tanaka", "Tanaka", "Okafor", "Tanaka", "Lindqvist"]);
  });

  it("warns once when bars are given no datum, since what Plot binds is the row's index", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const svg = plotBars();
    // D3-style options on Plot's rects: each element's row is a number, so the key reads nothing, and the warning says why.
    const asForD3: ExpressiveOptions<Stat> = { key: (d) => d.name, segment: (d) => d.metric };
    expect(() => expressive(rectsOf(svg), asForD3, env())).toThrow(/key returned undefined/);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/looks like Observable Plot's row index. Pass datum: \(el\) => rows\[el.__data__\]/);
    // Options that read the index themselves work, warned once for all six rects and a refresh().
    warn.mockClear();
    const byIndex = expressive<number>(rectsOf(svg), { key: (i) => stats[i]!.name, segment: (i) => stats[i]!.metric }, env());
    byIndex.refresh();
    expect(byIndex.marks().map((mark) => mark.key)).toEqual(["Okafor", "Lindqvist", "Tanaka"]);
    expect(warn).toHaveBeenCalledTimes(1);
    byIndex.destroy();
    // With the accessor there's nothing to warn about.
    warn.mockClear();
    expressive(rectsOf(svg), barOptions(), env());
    expect(warn).not.toHaveBeenCalled();
  });

  it("after a group transform, reads each bar's row from the channels the mark's render option gets, since rows[i] is the wrong row", () => {
    interface Total {
      name: string;
      total: number;
    }
    const derived: Total[] = [];
    const svg = document.body.appendChild(
      plot({
        document,
        width: 600,
        height: 180,
        ...MARGINS,
        x: { domain: [0, 25] },
        y: { domain: players.map((p) => p.name) },
        marks: [
          barX(
            stats,
            groupY(
              { x: "sum" },
              {
                x: "value",
                y: "name",
                // Plot gives render the index into its derived data, with that data's channels unscaled.
                render(index, scales, values, dimensions, context, next) {
                  const { x1, x2, y } = values.channels;
                  for (const i of index) derived[i] = { name: y!.value[i], total: x2!.value[i] - x1!.value[i] };
                  return next!(index, scales, values, dimensions, context);
                }
              }
            )
          )
        ]
      }) as PlotSvg
    );
    const rects = rectsOf(svg);
    // Each rect is bound to a group's index: rect 1 is Lindqvist's total, but rows[1] is Okafor's assists.
    expect(rects.map((rect) => bound<number>(rect))).toEqual([0, 1, 2]);
    expect(stats[1]).toMatchObject({ name: "Okafor", metric: "assists" });
    expect(derived[1]).toEqual({ name: "Lindqvist", total: 20 });

    const fx = expressive(rects, { datum: (el) => derived[bound<number>(el)]!, key: (d) => d.name, value: (d) => d.total }, env());
    const x = (value: number): number => svg.scale("x")!.apply(value);
    expect(fx.marks().map((mark) => [mark.key, mark.length])).toEqual(players.map((p) => [p.name, expect.closeTo(x(p.goals + p.assists) - x(0), 6)]));
  });

  it("follows Plot's next render, a new <svg>, through refresh() with its rects", () => {
    let rows = stats;
    const first = plotBars(rows);
    const fx = expressive(rectsOf(first), barOptions(() => rows), env("off"));
    const events: string[] = [];
    for (const type of ["enter", "update", "exit"] as const) fx.on(type, (event) => events.push(`${type} ${event.mark.key}`));

    // Tanaka scores twice more: Plot draws a new <svg>, which the page swaps in.
    rows = stats.map((s) => (s.name === "Tanaka" && s.metric === "goals" ? { ...s, value: 9 } : s));
    const next = plotBars(rows);
    first.replaceWith(next);
    fx.refresh(rectsOf(next));
    expect(events).toEqual(["update Tanaka"]);
    expect(overlayOf(next)).not.toBeNull();
    expect(rectsOf(next).map((rect) => rect.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1", "-1", "-1"]);
    expect(rectsOf(next)[4]!.getAttribute("aria-label")).toBe("Tanaka: 9 goals, 12 assists");
    const x = (value: number): number => next.scale("x")!.apply(value);
    expect(fx.marks()[2]!.length).toBeCloseTo(x(21) - x(0), 6);
  });
});

describe("a Plot line through expressive()", () => {
  it("reads each path's rows through its indices, described from their points in the line group's coordinates", () => {
    const svg = plotLine();
    const paths = linePaths(svg);
    // Plot groups the index by series, in order of first appearance, and offsets the group for crisp edges.
    expect(paths.map((path) => bound<number[]>(path))).toEqual([season.flatMap((w, i) => (w.series === "goals" ? [i] : [])), season.flatMap((w, i) => (w.series === "xg" ? [i] : []))]);
    expect(paths[0]!.parentElement!.getAttribute("transform")).toBe("translate(0.5,0.5)");

    const seen = new Map<string, MarkData<Week[]>>();
    const fx = expressive(paths, { ...lineOptions(svg), on: { decorate: recorder(seen) } }, env());
    expect(fx.marks().map((mark) => mark.key)).toEqual(["goals", "xg"]);
    for (const [i, mark] of fx.marks().entries()) {
      // The vertices Plot drew, unshifted: the overlay takes the group's half-pixel offset instead.
      expect(measurePath(mark.outline.d).points).toEqual(measurePath(paths[i]!.getAttribute("d")!).points);
      expect(mark.series).toBe(mark.key);
      expect(mark.thickness).toBe(WIDTH);
      const values = mark.key === "goals" ? GOALS : XG;
      const { datum, samples } = seen.get(mark.key)!;
      expect(datum).toEqual(season.filter((w) => w.series === mark.key));
      expect(samples.map((s) => s.at)).toEqual(values.map((_, week) => week + 1));
      expect(samples.map((s) => s.value)).toEqual(values);
      samples.forEach((sample, week) => {
        expect(mark.path(sample.t).x).toBeCloseTo(40 + 60 * week, 6);
        expect(mark.path(sample.t).y).toBeCloseTo(260 - 20 * values[week]!, 6);
      });
    }
    expect(seen.get("goals")!.related("xg")!.samples).toEqual(seen.get("xg")!.samples);
    expect(overlayOf(svg)!.getAttribute("transform")).toBe("matrix(1 0 0 1 0.5 0.5)");
  });

  it("colours the goals line wherever it's below xG, crossing where the lines meet", () => {
    const svg = plotLine();
    expressive(linePaths(svg), { ...lineOptions(svg), on: { decorate: only("goals", threshold({ compareTo: "xg" })) } }, env("off"));
    expect(expectedRuns()).toHaveLength(3);
    const drawn = runs(svg);
    expect(drawn).toHaveLength(3);
    drawn.forEach(([from, to], i) => {
      expect(from).toBeCloseTo(expectedRuns()[i]![0], 4);
      expect(to).toBeCloseTo(expectedRuns()[i]![1], 4);
    });
    for (const path of runPaths(svg)) expect(path.getAttribute("stroke-width")).toBe(String(WIDTH));
    expect(runPaths(svg, "xg")).toHaveLength(0);
  });

  it("is one tab stop, the arrow keys going from line to line in document order, each named", () => {
    const svg = plotLine();
    expressive(linePaths(svg), lineOptions(svg), env());
    const [goals, xg] = linePaths(svg);
    expect([goals, xg].map((path) => path!.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    expect([goals, xg].map((path) => [path!.getAttribute("role"), path!.getAttribute("aria-label")])).toEqual([
      ["img", "Goals scored: 11 by week 10"],
      ["img", "Expected goals: 10.8 by week 10"]
    ]);
    goals!.focus();
    const visits: Series[] = [];
    for (const name of ["ArrowRight", "ArrowRight", "Home", "End", "ArrowLeft"]) {
      key(name);
      visits.push(season[bound<number[]>(document.activeElement!)[0]!]!.series);
    }
    expect(visits).toEqual(["xg", "xg", "goals", "xg", "goals"]);
  });

  it("leaves out the -1 where Plot breaks a line at a missing value, reading the rows either side", () => {
    const rows = season.map((w) => (w.series === "goals" && w.week === 3 ? { ...w, value: NaN } : w));
    const svg = plotLine(rows);
    const [goals] = linePaths(svg);
    expect(bound<number[]>(goals!)).toContain(-1);
    // Plot starts a new subpath after the gap.
    expect(goals!.getAttribute("d")!.match(/M/g)).toHaveLength(2);
    const seen = new Map<string, MarkData<Week[]>>();
    const fx = expressive(linePaths(svg), { ...lineOptions(svg, rows), on: { decorate: recorder(seen) } }, env());
    expect(seen.get("goals")!.datum.map((w) => w.week)).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10]);
    expect(seen.get("goals")!.samples.every((s) => Number.isFinite(s.value))).toBe(true);
    // describe.line has no gaps (backlog), so the walk goes straight across the one Plot leaves.
    const walk: MarkGeometry = fx.marks()[0]!;
    expect(measurePath(walk.outline.d).points).toHaveLength(9);
  });
});
