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
import { createMotion, manualClock, matrix, type DataEffect, type GeometryEffect, type MarkData, type MarkGeometry, type MotionMode, type Point } from "./core";
import { parseTransform } from "./core/geometry";
import { drawnInGaps, measurePath, type Drawn } from "./core/testing";
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

  it("takes the unnamed image role Vega gives each line's group off it, after Vega's own renders too", async () => {
    // As demo/line.html draws it: with Vega-Lite's descriptions off, the group around each line is a
    // graphics-symbol with no name, which screen readers may read as one picture, and axe flags.
    const { view, svg } = await render({ ...lineSpec(), config: { aria: false } });
    const groups = (): (string | null)[] => linePaths(svg).map((path) => path.parentElement!.getAttribute("role"));
    expect(groups()).toEqual(["graphics-symbol", "graphics-symbol"]);
    const e = env("off");
    const fx = fromVegaView(view, lineOptions, e);
    expect(groups()).toEqual([null, null]);
    expect(linePaths(svg).map((path) => path.parentElement!.hasAttribute("aria-roledescription"))).toEqual([false, false]);

    await view.data("season", rowsUpTo(5)).runAsync();
    await delivered();
    e.clock.advance(16);
    expect(groups()).toEqual([null, null]);
    fx.destroy();
    expect(groups()).toEqual(["graphics-symbol", "graphics-symbol"]);
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

  it("follows a stroke width a signal changes alone, which redraws no path data", async () => {
    const spec = lineSpec() as TopLevelSpec & { mark: object };
    const { view, svg } = await render({ ...spec, params: [{ name: "lineWidth", value: WIDTH }], mark: { type: "line", strokeWidth: { expr: "lineWidth" } } } as TopLevelSpec);
    const e = env("off");
    const fx = fromVegaView(view, { ...lineOptions, on: { decorate: only("goals", threshold({ compareTo: "xg" })) } }, e);
    expect(goalsOf(fx).thickness).toBe(WIDTH);
    const d = linePaths(svg)[0]!.getAttribute("d");
    await view.signal("lineWidth", 4).runAsync();
    await delivered();
    e.clock.advance(16);
    expect(linePaths(svg)[0]!.getAttribute("d")).toBe(d);
    expect(linePaths(svg)[0]!.getAttribute("stroke-width")).toBe("4");
    expect(goalsOf(fx).thickness).toBe(4);
    for (const path of runPaths(svg)) expect(path.getAttribute("stroke-width")).toBe("4");
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

describe("fromVegaView: a Vega-Lite line with missing values", () => {
  /** A row whose value nobody recorded is null. */
  interface PatchyRow {
    week: number;
    series: Series;
    value: number | null;
  }
  /** Goals with weeks 3, 6 and 7 missing: three runs, weeks 1–2, 4–5 and 8–10. xG has every week. */
  const PATCHY = GOALS.map((goals, i) => ([3, 6, 7].includes(i + 1) ? null : goals));
  const rowsOf = (goals: readonly (number | null)[]): PatchyRow[] =>
    goals.flatMap((value, i) => [
      { week: i + 1, series: "goals" as const, value },
      { week: i + 1, series: "xg" as const, value: XG[i]! }
    ]);
  /**
   * Below xG within each run, worked out from the data: from where goals cross below it in week 1 to
   * the run's end in week 2, all of weeks 4–5, and from week 8 to where they cross back above it.
   */
  const BELOW: [number, number][] = [
    [1 + 0.2 / 1.1, 2],
    [4, 5],
    [8, 8 + 0.6 / 1.1]
  ];
  /** Vega-Lite's modes that break a line at a missing value: its default, and the three it names. */
  const BREAKING: readonly (readonly [name: string, invalid: string | undefined])[] = [
    ["the default", undefined],
    ...["break-paths-show-path-domains", "break-paths-show-domains", "break-paths-filter-domains"].map((mode) => [mode, mode] as const)
  ];

  function patchySpec(goals: readonly (number | null)[], invalid?: string | null, scale = 1): TopLevelSpec {
    const spec = lineSpec(scale) as TopLevelSpec & { data: object; mark: object };
    return { ...spec, data: { name: "season", values: rowsOf(goals) }, mark: { type: "line", strokeWidth: WIDTH, ...(invalid === undefined ? {} : { invalid }) } } as TopLevelSpec;
  }

  /** A sample for a recorded week only: one Vega leaves out is never read, or this throws. */
  const patchy: VegaOptions<PatchyRow> = { key: (d) => d.series, sample: (d) => ({ value: d.value as number, at: d.week }), keyboard: true };

  /** The weeks at a mark's gaps' ends. */
  const gapWeeks = (mark: MarkGeometry): number[][] => (mark.gaps ?? []).map(([from, to]) => [mark.path(from).x / 60 + 1, mark.path(to).x / 60 + 1]);

  /** What the overlay draws on the goals line, as drawnInGaps reads it: the red paths, and the ball where it's placed. */
  function drawnOnGoals(svg: SVGSVGElement): Drawn[] {
    const paths: Drawn[] = runPaths(svg).map((path, id) => ({ kind: "path", id, d: path.getAttribute("d")!, paint: {} }));
    const transform = overlayOf(svg).querySelector('.ec-run[data-key="goals"] .ec-icon')?.getAttribute("transform");
    return transform ? [...paths, { kind: "icon", id: paths.length, icon: soccerBall, size: undefined, transform: parseTransform(transform) }] : paths;
  }

  it.each(BREAKING)("in %s mode, breaks the line where a week is missing, its samples marking each gap", async (_name, invalid) => {
    const { view, svg } = await render(patchySpec(PATCHY, invalid));
    const seen = new Map<string, MarkData>();
    const fx = fromVegaView(view, { ...patchy, on: { decorate: recorder(seen) } }, env());
    const goals = goalsOf(fx);
    gapWeeks(goals).forEach((weeks, k) => weeks.forEach((week, end) => expect(week).toBeCloseTo([[2, 4], [5, 8]][k]![end]!, 6)));
    expect(goals.gaps).toHaveLength(2);
    // The vertices Vega drew, run by run.
    const path = linePaths(svg).find((p) => seriesOf(p) === "goals")!;
    expect(measurePath(goals.outline.d).points).toEqual(measurePath(path.getAttribute("d")!).points);
    const { samples } = seen.get("goals")!;
    expect(samples.map((s) => s.at)).toEqual([1, 2, 4, 5, 8, 9, 10]);
    expect(samples.map((s) => s.gapBefore === true)).toEqual([false, false, true, false, true, false, false]);
    expect(fx.marks().find((mark) => mark.key === "xg")!.gaps).toBeUndefined();
  });

  it.each(BREAKING.flatMap(([name, invalid]) => (["presentation", "off"] as const).map((mode) => [name, mode, invalid] as const)))(
    "in %s mode and %s, threshold colours goals below xG within each run, and nothing it or the riding ball draws is inside a gap",
    async (_name, mode, invalid) => {
      const { view, svg } = await render(patchySpec(PATCHY, invalid));
      const e = env(mode);
      const fx = fromVegaView(view, { ...patchy, on: { decorate: story() } }, e);
      const goals = goalsOf(fx);
      let frames = 0;
      for (; frames < 400 && !e.clock.idle; frames++) {
        expect(drawnInGaps(goals, drawnOnGoals(svg)), `frame ${frames}`).toEqual([]);
        e.clock.advance(16);
      }
      expect(e.clock.idle).toBe(true);
      if (mode === "presentation") expect(frames).toBeGreaterThan(10);
      expect(drawnInGaps(goals, drawnOnGoals(svg))).toEqual([]);
      expectClose(runs(svg), BELOW);
      // Resting at the last week, past both gaps.
      expect(goals.end.x - ball(svg)!.x).toBeLessThan(2 * soccerBall.radius!);
    }
  );

  it("with weeks missing at its start and end, draws a shorter line, with no gap", async () => {
    const { view } = await render(patchySpec(GOALS.map((goals, i) => (i === 0 || i === 9 ? null : goals))));
    const seen = new Map<string, MarkData>();
    const goals = goalsOf(fromVegaView(view, { ...patchy, on: { decorate: recorder(seen) } }, env()));
    expect(goals.gaps).toBeUndefined();
    expect(goals.start.x).toBeCloseTo(x(2), 6);
    expect(goals.end.x).toBeCloseTo(x(9), 6);
    expect(seen.get("goals")!.samples.map((s) => s.at)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seen.get("goals")!.samples.some((s) => s.gapBefore)).toBe(false);
  });

  it.each([...BREAKING, ["filter", "filter"] as const])("in %s mode, has no mark for a line with every week missing, as Vega draws none", async (_name, invalid) => {
    const { view, svg } = await render(patchySpec(GOALS.map(() => null), invalid));
    const fx = fromVegaView(view, patchy, env());
    expect(fx.marks().map((mark) => mark.key)).toEqual(["xg"]);
    // The xG line is the tab stop; whatever Vega left for goals is the host's.
    const xg = linePaths(svg).find((path) => seriesOf(path) === "xg")!;
    expect(xg.getAttribute("tabindex")).toBe("0");
    expect(linePaths(svg).filter((path) => path.hasAttribute("tabindex"))).toEqual([xg]);
  });

  it('in "filter" mode, joins the weeks either side of a gap, as Vega draws it', async () => {
    const { view, svg } = await render(patchySpec(PATCHY, "filter"));
    const seen = new Map<string, MarkData>();
    const goals = goalsOf(fromVegaView(view, { ...patchy, on: { decorate: recorder(seen) } }, env()));
    expect(goals.gaps).toBeUndefined();
    const path = linePaths(svg).find((p) => seriesOf(p) === "goals")!;
    expect(measurePath(goals.outline.d).points).toEqual(measurePath(path.getAttribute("d")!).points);
    expect(seen.get("goals")!.samples.map((s) => s.at)).toEqual([1, 2, 4, 5, 8, 9, 10]);
    expect(seen.get("goals")!.samples.some((s) => s.gapBefore)).toBe(false);
  });

  it.each([["show", "show"] as const, ["null", null] as const])("in %s mode, draws a missing week at zero, which the page's sample says too", async (_name, invalid) => {
    const { view, svg } = await render(patchySpec(PATCHY, invalid));
    // Vega shows the missing weeks, so they're read, and a sample that gives no value throws.
    expect(() => fromVegaView(view, patchy, env())).toThrow(new RangeError('fromVegaView: sample must give a finite number, or { value, at }, got {"value":null,"at":3}.'));
    const seen = new Map<string, MarkData>();
    const goals = goalsOf(fromVegaView(view, { ...patchy, sample: (d) => ({ value: d.value ?? 0, at: d.week }), on: { decorate: recorder(seen) } }, env()));
    expect(goals.gaps).toBeUndefined();
    const path = linePaths(svg).find((p) => seriesOf(p) === "goals")!;
    expect(measurePath(goals.outline.d).points).toEqual(measurePath(path.getAttribute("d")!).points);
    expect(goals.path(seen.get("goals")!.samples[2]!.t).y).toBeCloseTo(y(0), 6);
  });

  it("follows a render that opens gaps and one that closes them, each an update", async () => {
    const { view, svg } = await render(patchySpec(GOALS));
    const e = env("off");
    const fx = fromVegaView(view, { ...patchy, on: { decorate: story() } }, e);
    const events: string[] = [];
    fx.on("update", (event) => events.push(`update ${event.mark.key}`));
    expect(goalsOf(fx).gaps).toBeUndefined();
    expectClose(runs(svg), expectedRuns());

    await view.data("season", rowsOf(PATCHY)).runAsync();
    await delivered();
    e.clock.advance(16);
    expect(goalsOf(fx).gaps).toHaveLength(2);
    expectClose(runs(svg), BELOW);
    expect(drawnInGaps(goalsOf(fx), drawnOnGoals(svg))).toEqual([]);

    await view.data("season", rowsOf(GOALS)).runAsync();
    await delivered();
    e.clock.advance(16);
    expect(goalsOf(fx).gaps).toBeUndefined();
    expectClose(runs(svg), expectedRuns());
    expect(events).toEqual(["update goals", "update goals"]);
  });

  describe("every built-in effect passes checkEffect on the View's line with gaps", () => {
    const effects = {
      "ball rolling": travel(soccerBall),
      "ball riding on": travel(soccerBall, { ride: "on" }),
      "cleat stepping": travel(cleat),
      flash: flash(),
      wiggle: wiggle(),
      pulse: pulse(),
      "threshold above the middle": threshold({ compareTo: 0.5 })
    };

    async function lines(scale = 1): Promise<{ marks: readonly MarkGeometry[]; data: Map<string, MarkData> }> {
      const { view } = await render(patchySpec(PATCHY, undefined, scale));
      const data = new Map<string, MarkData>();
      const fx = fromVegaView(view, { ...patchy, on: { decorate: recorder(data) } }, env("off"));
      return { marks: fx.marks(), data };
    }

    // With checkEffect's default data, which marks the gaps.
    it.each(Object.keys(effects))("%s", async (name) => {
      const { marks } = await lines();
      const twins = await lines(0.8);
      const moved = (mark: MarkGeometry) => twins.marks.find((twin) => twin.key === mark.key);
      await checkEffect(effects[name as keyof typeof effects], { name, marks, moved });
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

describe("fromVegaView: update({ on }) and leave()", () => {
  /** An effect that logs its runs. */
  function logged() {
    const log: string[] = [];
    const effect: GeometryEffect = { kind: "geometry", run: async (mark) => void log.push(`run ${mark.key}`), end: (mark) => void log.push(`end ${mark.key}`), clear: () => void log.push("clear") };
    return { effect, log };
  }

  it("swaps the line's effects in place: threshold finds xG, focus and the tab stop stay, and Vega's renders are followed", async () => {
    const { view, svg } = await render(lineSpec());
    const e = env("off");
    const fx = fromVegaView(view, { ...lineOptions, on: { decorate: only("goals", travel("soccer-ball", { ride: "on" })) } }, e);
    expect(ball(svg)).toBeDefined();
    fx.focus("xg");
    await fx.update({ on: { decorate: only("goals", threshold({ compareTo: "xg" })) } });
    expect(ball(svg)).toBeUndefined();
    expectClose(runs(svg), expectedRuns());
    expect(seriesOf(document.activeElement)).toBe("xg");
    expect(linePaths(svg).map((path) => path.getAttribute("tabindex"))).toEqual(["-1", "0"]);

    await view.data("season", rowsUpTo(5)).runAsync();
    await delivered();
    e.clock.advance(16);
    expectClose(runs(svg), expectedRuns(5));
    expect(seriesOf(document.activeElement)).toBe("xg");

    await expect(fx.update({ on: { decorate: "nope" } })).rejects.toThrow(/Unknown preset "nope"/);
    expectClose(runs(svg), expectedRuns(5));
  });

  it("replays a hover held by the pointer or the keyboard with the new hover effect, and leave() ends either", async () => {
    const { view, svg } = await render(lineSpec());
    const hover = logged();
    const fx = fromVegaView(view, { ...lineOptions, on: { hover: hover.effect } }, env());
    const events: string[] = [];
    fx.on("hover", (event) => events.push(`hover ${event.mark.key} ${event.source}`));
    fx.on("leave", (event) => events.push(`leave ${event.mark.key}`));
    const [goals] = linePaths(svg);

    goals!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    const next = logged();
    await fx.update({ on: { hover: next.effect } });
    expect(hover.log).toEqual(["run goals", "clear"]);
    expect(next.log).toEqual(["run goals"]);
    fx.leave();
    expect(next.log).toEqual(["run goals", "clear"]);

    fx.focus("xg");
    await fx.update({ on: { hover: hover.effect } });
    expect(next.log).toEqual(["run goals", "clear", "run xg", "clear"]);
    expect(hover.log).toEqual(["run goals", "clear", "run xg"]);
    fx.leave();
    expect(seriesOf(document.activeElement)).toBe("xg");
    fx.leave();
    expect(events).toEqual(["hover goals pointer", "leave goals", "hover xg keyboard", "leave xg"]);
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

  it.each(["monotone", "basis", "step"])("refuses a line Vega draws as a curve (%s), rather than describing straight segments", async (interpolate) => {
    const { view } = await render({ ...lineSpec(), mark: { type: "line", strokeWidth: WIDTH, interpolate } } as TopLevelSpec);
    expect(() => fromVegaView(view, lineOptions, env())).toThrow(new RegExp(`interpolate "${interpolate}", but only straight lines can be read`));
  });

  it("reads a line drawn with interpolate \"linear\", the default", async () => {
    const { view } = await render({ ...lineSpec(), mark: { type: "line", strokeWidth: WIDTH, interpolate: "linear" } } as TopLevelSpec);
    expect(fromVegaView(view, lineOptions, env()).marks()).toHaveLength(2);
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
