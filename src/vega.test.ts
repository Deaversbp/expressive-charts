// Vega-Lite charts through fromVegaView(), with real Vega (pinned dev dependencies, never runtime
// ones): a two-series line, bars, a stack, a donut and points, rendered as SVG in jsdom. This is M4's
// proof on a third library's marks: threshold colours the goals line below xG, a ball rides its
// leading edge, the keyboard goes from line to line, and every built-in effect passes checkEffect on
// the View's own marks. The View's re-renders (new data, a resize) are followed with no refresh(), no
// change to effect code, and nothing imported from Vega in src/ outside the tests. It brings charts and
// effects together, so it lives beside src/index.ts, the only module allowed to.

import { View, parse } from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import { fromVegaView, type ChartEnv, type VegaOptions } from "./charts";
import { createMotion, manualClock, matrix, type DataEffect, type MarkData, type MarkGeometry, type MotionMode, type Point } from "./core";
import { parseTransform } from "./core/geometry";
import { measurePath } from "./core/testing";
import { flash, only, parallel, pulse, stagger, threshold, travel, wiggle } from "./effects";
import { cleat, soccerBall, sport } from "./icons/sport";
import { iconRegistry, presetRegistry, registerIcons } from "./registries";
import { checkEffect } from "./testing";

type Series = "goals" | "xg";
/** Vega-Lite's long form: one row per week and series. */
interface Row {
  week: number;
  series: Series;
  value: number;
}

/** Cumulative goals and xG over ten weeks: goals fall below xG in weeks 2, 4–5 and 7–8 (as in d3-line.test.ts). */
const GOALS = [1, 1, 3, 3, 4, 7, 7, 8, 10, 11];
const XG = [0.8, 1.9, 2.8, 4.2, 5.4, 6.1, 7.6, 8.6, 9.5, 10.8];
const rowsUpTo = (weeks: number): Row[] =>
  GOALS.slice(0, weeks).flatMap((goals, i) => [
    { week: i + 1, series: "goals" as const, value: goals },
    { week: i + 1, series: "xg" as const, value: XG[i]! }
  ]);

/** 540 × 240 plot with fixed domains: 60 px a week and 20 px a goal, in the line group's coordinates. */
const x = (week: number): number => 60 * (week - 1);
const y = (value: number): number => 240 - 20 * value;
const WIDTH = 2.25;

function lineSpec(scale = 1): TopLevelSpec {
  return {
    width: 540 * scale,
    height: 240 * scale,
    data: { name: "season", values: rowsUpTo(10) },
    mark: { type: "line", strokeWidth: WIDTH },
    encoding: {
      x: { field: "week", type: "quantitative", scale: { domain: [1, 10], nice: false, zero: false } },
      y: { field: "value", type: "quantitative", scale: { domain: [0, 12], nice: false } },
      color: { field: "series", type: "nominal" }
    }
  };
}

async function render(spec: TopLevelSpec, run = true): Promise<{ view: View; svg: SVGSVGElement }> {
  const host = document.body.appendChild(document.createElement("div"));
  const view = new View(parse(compile(spec).spec), { renderer: "svg", container: host });
  if (run) await view.runAsync();
  return { view, svg: host.querySelector("svg")! };
}

registerIcons(sport);

function env(mode: MotionMode = "presentation"): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

/** What a page passes for the line: keys and names by series, and each point's value at its week. */
const lineOptions: VegaOptions<Row> = {
  key: (d) => d.series,
  sample: (d) => ({ value: d.value, at: d.week }),
  keyboard: true,
  markLabel: (d) => (d.series === "goals" ? "Goals scored" : "Expected goals")
};

/** The demo's decoration: the goals line red below xG, and a ball riding its leading edge. */
const story = () => only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on" })));

const overlayOf = (svg: SVGSVGElement): SVGGElement => svg.querySelector(":scope > .ec-overlay")!;
const linePaths = (svg: SVGSVGElement): SVGPathElement[] => Array.from(svg.querySelectorAll<SVGPathElement>(".mark-line.role-mark path"));
const seriesOf = (element: Element | null): Series => (element as unknown as { __data__: { datum: Row } }).__data__.datum.series;
const goalsOf = (fx: { marks(): readonly MarkGeometry[] }): MarkGeometry => fx.marks().find((mark) => mark.key === "goals")!;
/** The MutationObserver hands over what Vega drew in a microtask: this waits for it. */
const delivered = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function runPaths(svg: SVGSVGElement, series: Series = "goals"): SVGPathElement[] {
  return Array.from(overlayOf(svg).querySelectorAll<SVGPathElement>(`.ec-run[data-key="${series}"] path`)).filter((path) => !path.closest(".ec-icon"));
}

/** The red runs on the goals line, as [from, to] in weeks. */
function runs(svg: SVGSVGElement): [number, number][] {
  return runPaths(svg).map((path) => {
    const { start, end } = measurePath(path.getAttribute("d")!);
    return [start!.x / 60 + 1, end!.x / 60 + 1];
  });
}

/** Where goals cross xG up to week `weeks`, and the runs below it: from the data, not the drawing. */
function expectedRuns(weeks = 10): [number, number][] {
  const found: [number, number][] = [];
  let from: number | undefined = GOALS[0]! < XG[0]! ? 1 : undefined;
  for (let i = 1; i < weeks; i++) {
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
  if (from !== undefined) found.push([from, weeks]);
  return found;
}

function expectClose(actual: readonly [number, number][], expected: readonly [number, number][], digits = 4): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach(([a0, a1], i) => {
    expect(a0).toBeCloseTo(expected[i]![0], digits);
    expect(a1).toBeCloseTo(expected[i]![1], digits);
  });
}

/** The ball's centre: the soccer ball's anchor, through the transform travel placed it with. */
function ball(svg: SVGSVGElement): Point | undefined {
  const icon = overlayOf(svg).querySelector('.ec-run[data-key="goals"] .ec-icon');
  return icon ? matrix.apply(parseTransform(icon.getAttribute("transform") ?? ""), soccerBall.anchor) : undefined;
}

function key(name: string): void {
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
}

/** Records each mark's data, as a data effect gets it. */
function recorder(seen: Map<string, MarkData>): DataEffect {
  return { kind: "data", run: async (mark, data) => void seen.set(mark.key, data), end: (mark, data) => void seen.set(mark.key, data), clear() {} };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("fromVegaView: a Vega-Lite line", () => {
  it("describes each series' path from its items, with a sample at each point", async () => {
    const { view, svg } = await render(lineSpec());
    const seen = new Map<string, MarkData>();
    const fx = fromVegaView(view, { ...lineOptions, on: { decorate: recorder(seen) } }, env());
    expect(fx.marks().map((mark) => mark.key)).toEqual(["goals", "xg"]);
    const paths = linePaths(svg);
    for (const mark of fx.marks()) {
      // The vertices Vega drew, in the line groups' coordinates (their translate is 0 here).
      const path = paths.find((p) => seriesOf(p) === mark.key)!;
      expect(measurePath(mark.outline.d).points).toEqual(measurePath(path.getAttribute("d")!).points);
      expect(mark.series).toBe(mark.key);
      expect(mark.thickness).toBe(WIDTH);
      const values = mark.key === "goals" ? GOALS : XG;
      const { samples } = seen.get(mark.key)!;
      expect(samples.map((s) => s.at)).toEqual(values.map((_, i) => i + 1));
      expect(samples.map((s) => s.value)).toEqual(values);
      samples.forEach((sample, i) => {
        expect(mark.path(sample.t).x).toBeCloseTo(x(i + 1), 6);
        expect(mark.path(sample.t).y).toBeCloseTo(y(values[i]!), 6);
      });
    }
    expect(seen.get("goals")!.related("xg")!.samples).toEqual(seen.get("xg")!.samples);
    // The rows are Vega's: Vega-Lite derives its own tuples, so a key reads fields, never identity.
    expect((seen.get("goals")!.datum as Row).series).toBe("goals");
  });

  it("colours the goals line wherever it's below xG, crossing where the lines meet", async () => {
    const { view, svg } = await render(lineSpec());
    fromVegaView(view, { ...lineOptions, on: { decorate: only("goals", threshold({ compareTo: "xg" })) } }, env());
    expect(expectedRuns()).toHaveLength(3);
    expectClose(runs(svg), expectedRuns());
    for (const path of runPaths(svg)) expect(path.getAttribute("stroke-width")).toBe(String(WIDTH));
    expect(runPaths(svg, "xg")).toHaveLength(0);
  });

  it.each(["presentation", "off"] as const)("in %s, a ball rides the goals line to its leading edge", async (mode) => {
    const { view, svg } = await render(lineSpec());
    const e = env(mode);
    const fx = fromVegaView(view, { ...lineOptions, on: { decorate: story() } }, e);
    for (let frame = 0; frame < 400 && !e.clock.idle; frame++) e.clock.advance(16);
    expect(e.clock.idle).toBe(true);
    // Resting just behind the tip, above the stroke (y is up the page).
    const rest = ball(svg)!;
    const tip = goalsOf(fx).end;
    expect(tip.x - rest.x).toBeGreaterThan(0);
    expect(tip.x - rest.x).toBeLessThan(2 * soccerBall.radius!);
    expect(rest.y).toBeLessThan(tip.y);
    expectClose(runs(svg), expectedRuns());
  });

  it("is one tab stop, the arrow keys going from line to line, each named", async () => {
    const { view, svg } = await render(lineSpec());
    fromVegaView(view, lineOptions, env());
    const [goals, xg] = linePaths(svg);
    expect([goals, xg].map((path) => path!.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    expect([goals, xg].map((path) => [path!.getAttribute("role"), path!.getAttribute("aria-label")])).toEqual([
      ["img", "Goals scored"],
      ["img", "Expected goals"]
    ]);
    goals!.focus();
    const visits: Series[] = [];
    for (const name of ["ArrowRight", "ArrowRight", "Home", "End", "ArrowLeft"]) {
      key(name);
      visits.push(seriesOf(document.activeElement));
    }
    expect(visits).toEqual(["xg", "xg", "goals", "xg", "goals"]);
  });

  it("follows the View's own renders, new data and a resize, with no refresh() and the elements Vega makes", async () => {
    const { view, svg } = await render(lineSpec());
    const e = env("off");
    const fx = fromVegaView(view, { ...lineOptions, on: { decorate: story() } }, e);
    const events: string[] = [];
    for (const type of ["enter", "update", "exit"] as const) fx.on(type, (event) => events.push(`${type} ${event.mark.key}`));

    // Five weeks: Vega draws new paths, which the adapter attaches to on the next frame.
    const before = linePaths(svg);
    await view.data("season", rowsUpTo(5)).runAsync();
    await delivered();
    e.clock.advance(16);
    const after = linePaths(svg);
    expect(after.some((path) => before.includes(path))).toBe(false);
    expect(goalsOf(fx).end.x).toBeCloseTo(x(5), 6);
    expectClose(runs(svg), expectedRuns(5));
    expect(after.map((path) => path.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    expect(ball(svg)).toBeDefined();

    // Half the width: the same weeks, half as far apart.
    await view.width(270).runAsync();
    await delivered();
    e.clock.advance(16);
    expect(goalsOf(fx).end.x).toBeCloseTo(x(5) / 2, 6);
    expect(runPaths(svg)).toHaveLength(expectedRuns(5).length);
    expect(events).toEqual(["update goals", "update xg"]);
  });

  it("attaches before the View first runs, and to its marks once Vega draws them", async () => {
    const { view, svg } = await render(lineSpec(), false);
    const e = env("off");
    const fx = fromVegaView(view, { ...lineOptions, on: { decorate: story() } }, e);
    expect(fx.marks()).toEqual([]);
    await view.runAsync();
    await delivered();
    e.clock.advance(16);
    expect(fx.marks().map((mark) => mark.key)).toEqual(["goals", "xg"]);
    expectClose(runs(svg), expectedRuns());
  });

  it("stops following on destroy() and leaves the View's SVG as it was", async () => {
    const { view, svg } = await render(lineSpec());
    const e = env("off");
    const fx = fromVegaView(view, { ...lineOptions, on: { decorate: story() } }, e);
    expect(overlayOf(svg)).not.toBeNull();
    fx.destroy();
    expect(overlayOf(svg)).toBeNull();
    expect(linePaths(svg).map((path) => path.getAttribute("tabindex"))).toEqual([null, null]);
    await view.data("season", rowsUpTo(5)).runAsync();
    await delivered();
    e.clock.advance(16);
    expect(overlayOf(svg)).toBeNull();
    expect(e.clock.idle).toBe(true);
  });

  describe("every built-in effect passes checkEffect on the View's lines", () => {
    const effects = {
      "ball rolling": travel(soccerBall),
      "ball riding on": travel(soccerBall, { ride: "on" }),
      "cleat stepping": travel(cleat),
      flash: flash(),
      wiggle: wiggle(),
      pulse: pulse(),
      "staggered flash": stagger(flash())
    };

    async function lines(scale = 1): Promise<{ marks: readonly MarkGeometry[]; data: Map<string, MarkData> }> {
      const { view } = await render(lineSpec(scale));
      const data = new Map<string, MarkData>();
      const fx = fromVegaView(view, { ...lineOptions, on: { decorate: recorder(data) } }, env("off"));
      return { marks: fx.marks(), data };
    }

    it.each(Object.keys(effects))("%s", async (name) => {
      const { marks } = await lines();
      const twins = await lines(0.8);
      const moved = (mark: MarkGeometry) => twins.marks.find((twin) => twin.key === mark.key);
      await checkEffect(effects[name as keyof typeof effects], { name, marks, moved, ...(name === "staggered flash" ? { batch: { index: 1, count: 2 } } : {}) });
    });

    it("threshold below xG, with the View's own samples", async () => {
      const { marks, data } = await lines();
      const twins = await lines(0.8);
      const moved = (mark: MarkGeometry) => twins.marks.find((twin) => twin.key === mark.key);
      const all = new Map<MarkGeometry, MarkData>([...marks, ...twins.marks].map((mark) => [mark, (marks.includes(mark) ? data : twins.data).get(mark.key)!]));
      await checkEffect(threshold({ compareTo: "xg" }), { name: "threshold below xG", marks, moved, data: (mark) => all.get(mark)! });
    });
  });
});

describe("fromVegaView: bars, a stack, slices and points", () => {
  const players = [
    { name: "Okafor", goals: 16, assists: 4 },
    { name: "Lindqvist", goals: 11, assists: 9 },
    { name: "Tanaka", goals: 7, assists: 12 }
  ];

  it("reads bars, top to bottom, growing from the left, with bar samples from `sample`", async () => {
    const { view, svg } = await render({
      width: 300,
      data: { values: players },
      mark: "bar",
      encoding: { y: { field: "name", type: "nominal", sort: null }, x: { field: "goals", type: "quantitative", scale: { domain: [0, 20], nice: false } } }
    });
    const seen = new Map<string, MarkData>();
    const fx = fromVegaView<(typeof players)[number]>(
      view,
      { key: (d) => d.name, sample: (d) => d.goals, on: { decorate: parallel(recorder(seen), threshold({ compareTo: 10, when: "above" })) } },
      env()
    );
    const marks = fx.marks();
    expect(marks.map((mark) => mark.key)).toEqual(["Okafor", "Lindqvist", "Tanaka"]);
    for (const [i, mark] of marks.entries()) {
      // From x = 0, 15 px a goal, the walk left to right.
      expect(mark.start.x).toBeCloseTo(0, 6);
      expect(mark.length).toBeCloseTo(15 * players[i]!.goals, 3);
      expect(mark.angle(0.5)).toBeCloseTo(0, 6);
      expect(seen.get(mark.key)!.samples).toEqual([{ t: 0, value: 0 }, { t: 1, value: players[i]!.goals }]);
    }
    // Past 10 goals: Okafor and Lindqvist, not Tanaka.
    const coloured = ["Okafor", "Lindqvist", "Tanaka"].map((name) => overlayOf(svg).querySelectorAll(`.ec-run[data-key="${name}"] path`).length);
    expect(coloured).toEqual([1, 1, 0]);
  });

  it("reads a stack's parts as one bar's segments, ordered from the baseline, whatever order Vega-Lite stacks in", async () => {
    const long = players.flatMap((p) => [
      { name: p.name, metric: "goals", value: p.goals },
      { name: p.name, metric: "assists", value: p.assists }
    ]);
    const { view } = await render({
      width: 300,
      data: { values: long },
      mark: "bar",
      encoding: {
        y: { field: "name", type: "nominal", sort: null },
        x: { field: "value", type: "quantitative", aggregate: "sum", scale: { domain: [0, 25], nice: false } },
        color: { field: "metric", type: "nominal" }
      }
    });
    const seen = new Map<string, MarkData>();
    const fx = fromVegaView<{ name: string; metric: string; sum_value: number }>(
      view,
      { key: (d) => d.name, segment: (d) => d.metric, sample: (d) => d.sum_value, on: { decorate: recorder(seen) } },
      env()
    );
    const okafor = fx.marks()[0]!;
    // Vega-Lite stacks alphabetically: assists sit at the baseline, then goals.
    expect(okafor.segments!.map((s) => s.series)).toEqual(["assists", "goals"]);
    expect(okafor.segments!.map((s) => Math.round(s.length))).toEqual([48, 192]);
    expect(seen.get("Okafor")!.samples).toEqual([{ t: 0, value: 0 }, { t: 1, value: 20 }]);
    expect(seen.get("Okafor")!.related("goals")!.samples).toEqual([{ t: 0, value: 4 }, { t: 1, value: 20 }]);
  });

  it("reads a donut's slices with their angles in order, clockwise round the ring", async () => {
    const shots = [
      { outcome: "Goal", shots: 58 },
      { outcome: "Saved", shots: 112 },
      { outcome: "Off target", shots: 149 },
      { outcome: "Blocked", shots: 87 }
    ];
    const { view } = await render({
      width: 240,
      height: 240,
      data: { values: shots },
      mark: { type: "arc", innerRadius: 60, outerRadius: 100 },
      encoding: { theta: { field: "shots", type: "quantitative" }, color: { field: "outcome", type: "nominal", sort: null } }
    });
    const fx = fromVegaView<(typeof shots)[number]>(view, { key: (d) => d.outcome }, env());
    const marks = fx.marks();
    expect(marks).toHaveLength(4);
    for (const mark of marks) {
      // A clockwise walk at mid-radius, 80 px from the centre.
      const angle = Math.atan2(mark.end.y - mark.start.y, mark.end.x - mark.start.x);
      expect(Number.isFinite(angle)).toBe(true);
      expect(Math.hypot(mark.start.x - mark.pivot.x, mark.start.y - mark.pivot.y)).toBeCloseTo(80, 3);
      expect(mark.thickness).toBeCloseTo(40, 6);
    }
    // In ring order from 12 o'clock, each slice starting where the one before ended.
    for (let i = 1; i < marks.length; i++) {
      expect(marks[i]!.start.x).toBeCloseTo(marks[i - 1]!.end.x, 3);
      expect(marks[i]!.start.y).toBeCloseTo(marks[i - 1]!.end.y, 3);
    }
    const total = shots.reduce((sum, s) => sum + s.shots, 0);
    expect(marks.map((m) => Math.round((m.length / (Math.PI * 160)) * total))).toEqual(
      marks.map((m) => shots.find((s) => s.outcome === m.key)!.shots)
    );
  });

  it("reads points as dots of Vega's symbol area", async () => {
    const { view } = await render({
      width: 200,
      height: 100,
      data: { values: players },
      mark: { type: "point", size: 100 },
      encoding: { x: { field: "goals", type: "quantitative" }, y: { field: "assists", type: "quantitative" } }
    });
    const fx = fromVegaView<(typeof players)[number]>(view, { key: (d) => d.name }, env());
    for (const mark of fx.marks()) {
      expect(mark.length).toBe(0);
      expect(mark.thickness).toBeCloseTo(2 * Math.sqrt(100 / Math.PI), 6);
    }
  });
});

describe("fromVegaView: what it can't read", () => {
  it("needs the SVG renderer", async () => {
    const view = new View(parse(compile(lineSpec()).spec), { renderer: "none" });
    await view.runAsync();
    expect(() => fromVegaView(view, lineOptions, env())).toThrow(/renders with "none".*renderer: "svg"/);
  });

  it("names the marks it has when the one asked for isn't there", async () => {
    const { view } = await render(lineSpec());
    expect(() => fromVegaView(view, { ...lineOptions, mark: "lines" }, env())).toThrow(/no mark named "lines". Its named marks: "marks"/);
  });

  it("reads only rects, arcs, symbols and lines", async () => {
    const { view } = await render({ ...lineSpec(), mark: { type: "area" } } as TopLevelSpec);
    expect(() => fromVegaView(view, lineOptions, env())).toThrow(/is a area mark. Rects, arcs, symbols and lines/);
  });

  it("needs a key", async () => {
    const { view } = await render(lineSpec());
    expect(() => fromVegaView(view, {} as VegaOptions<Row>, env())).toThrow(/needs options with a key/);
  });
});
