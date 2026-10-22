// A D3 line through expressive(), with real D3: goals and expected goals over a season, two
// d3.line() paths joined with d3-selection in a margin <g>, each described from the points that drew
// it and sampled with samplesAlong. This is M4's proof on someone else's line: threshold colours the
// goals line wherever it's below xG, a ball rides its leading edge, the keyboard goes from line to
// line, and a reveal the page draws frame by frame (by hand, or from playback()'s onFrame, as the
// demo does) is followed with watch, with no change to effect code. It brings charts and effects
// together, so it lives beside src/index.ts, the only module allowed to.

import { select } from "d3-selection";
import { line } from "d3-shape";
import { expressive, type ChartEnv, type ExpressiveOptions } from "./charts";
import {
  createMotion,
  describe as build,
  manualClock,
  matrix,
  playback,
  samplesAlong,
  type DataEffect,
  type MarkData,
  type MarkGeometry,
  type MotionMode,
  type Point
} from "./core";
import { parseTransform } from "./core/geometry";
import { measurePath } from "./core/testing";
import { only, parallel, threshold, travel } from "./effects";
import { soccerBall, sport } from "./icons/sport";
import { iconRegistry, presetRegistry, registerIcons } from "./registries";

interface Week {
  week: number;
  goals: number;
  xg: number;
}
type Series = "goals" | "xg";
/** A line path's datum: its series, and the rows drawn so far. */
interface Trace {
  series: Series;
  rows: Week[];
}

/** Cumulative goals and xG over ten weeks: goals fall below xG in weeks 2, 4–5 and 7–8. */
const GOALS = [1, 1, 3, 3, 4, 7, 7, 8, 10, 11];
const XG = [0.8, 1.9, 2.8, 4.2, 5.4, 6.1, 7.6, 8.6, 9.5, 10.8];
const season: Week[] = GOALS.map((goals, i) => ({ week: i + 1, goals, xg: XG[i]! }));

const LABELS: Record<Series, string> = { goals: "Goals scored", xg: "Expected goals" };
const COLORS: Record<Series, string> = { goals: "#2a78d6", xg: "#eb6834" };
/** The plot is 540 × 240 inside a 40 px left and 20 px top margin: 60 px a week, 20 px a goal. */
const x = (week: number): number => 60 * (week - 1);
const y = (value: number): number => 240 - 20 * value;
const WIDTH = 2.25;

/** The rows up to week `at`, the last one interpolated between weeks, as a playback's onFrame draws them. */
function revealed(at: number): Week[] {
  const shown = season.filter((w) => w.week <= at);
  const last = shown[shown.length - 1]!;
  const next = season.find((w) => w.week > at);
  if (next && at > last.week) {
    const f = (at - last.week) / (next.week - last.week);
    shown.push({ week: at, goals: last.goals + f * (next.goals - last.goals), xg: last.xg + f * (next.xg - last.xg) });
  }
  return shown;
}

const traces = (rows: Week[]): Trace[] => (["goals", "xg"] as const).map((series) => ({ series, rows }));

/** The page's chart: a 640 × 300 <svg>, a margin <g>, and one stroked d3.line() path per series, joined by series. */
function d3Season(rows: Week[] = season) {
  const svg = select(document.body).append("svg").attr("width", 640).attr("height", 300).attr("role", "group").attr("aria-label", "Goals and expected goals");
  const plot = svg.append("g").attr("transform", "translate(40,20)");
  const shape = (d: Trace): string =>
    line<Week>()
      .x((w) => x(w.week))
      .y((w) => y(w[d.series]))(d.rows) ?? "";
  const draw = (next: Trace[]) =>
    plot
      .selectAll<SVGPathElement, Trace>("path.line")
      .data(next, (d) => d.series)
      .join("path")
      .attr("class", (d) => `line ${d.series}`)
      .attr("fill", "none")
      .attr("stroke", (d) => COLORS[d.series])
      .attr("stroke-width", WIDTH)
      .attr("d", shape);
  let paths = draw(traces(rows));
  return {
    svg: svg.node()!,
    plot: plot.node()!,
    paths: () => paths,
    path: (series: Series): SVGPathElement => paths.filter((d) => d.series === series).node()!,
    /** Draws the season up to week `at` on the same paths: their rows and their `d`, as the demo's reveal does each frame. */
    reveal(at: number): void {
      paths = paths.datum((d) => ({ series: d.series, rows: revealed(at) })).attr("d", shape);
    }
  };
}

const points = (d: Trace): Point[] => d.rows.map((w) => ({ x: x(w.week), y: y(w[d.series]) }));

/** What the page passes: each path described from the points that drew it, sampled at the same points, and a name per line. */
const described: ExpressiveOptions<Trace> = {
  key: (d) => d.series,
  geometry: (_el, d, key) => build.line({ key, series: d.series, points: points(d), width: WIDTH }),
  samples: (d, mark) => samplesAlong(mark, d.rows.map((w) => ({ x: x(w.week), y: y(w[d.series]), value: w[d.series], at: w.week }))),
  keyboard: true,
  markLabel: (d) => `${LABELS[d.series]}: ${d.rows[d.rows.length - 1]![d.series]} by week ${d.rows[d.rows.length - 1]!.week}`
};

/** The demo's decoration: the goals line red below xG, and a ball riding its leading edge. */
const story = () => only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on" })));

registerIcons(sport);

function env(mode: MotionMode = "presentation"): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

function attach(host: ReturnType<typeof d3Season>, more: Partial<ExpressiveOptions<Trace>> = {}, mode?: MotionMode) {
  const { clock, ...rest } = env(mode);
  const fx = expressive(host.paths(), { ...described, on: { decorate: story() }, ...more }, { ...rest, clock });
  return { fx, clock };
}

const overlayOf = (svg: SVGSVGElement): SVGGElement => svg.querySelector(":scope > .ec-overlay")!;
const seriesOf = (element: Element | null): Series => (element as unknown as { __data__: Trace }).__data__.series;
const goalsOf = (fx: { marks(): readonly MarkGeometry[] }): MarkGeometry => fx.marks().find((mark) => mark.key === "goals")!;
/** The MutationObserver hands over what it noted in a microtask: this waits for it. */
const delivered = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The red runs threshold draws on the goals line, each as [from, to] in weeks along the plot's x. */
function runs(svg: SVGSVGElement): [number, number][] {
  return runPaths(svg).map((path) => {
    const { start, end } = measurePath(path.getAttribute("d")!);
    return [start!.x / 60 + 1, end!.x / 60 + 1];
  });
}

/** threshold's paths on the goals line (the ball's own paths are inside its icon). */
function runPaths(svg: SVGSVGElement, series: Series = "goals"): SVGPathElement[] {
  return Array.from(overlayOf(svg).querySelectorAll<SVGPathElement>(`.ec-run[data-key="${series}"] path`)).filter((path) => !path.closest(".ec-icon"));
}

/** Where goals cross xG up to week `at`, and the runs below it: worked out from the data, not the drawing. */
function expectedRuns(at = 10): [number, number][] {
  const rows = revealed(at);
  const found: [number, number][] = [];
  let from: number | undefined = rows[0]!.goals < rows[0]!.xg ? rows[0]!.week : undefined;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!;
    const b = rows[i]!;
    const da = a.goals - a.xg;
    const db = b.goals - b.xg;
    if (Math.sign(da) === Math.sign(db) || db === 0) continue;
    const crossing = a.week + (da / (da - db)) * (b.week - a.week);
    if (db < 0) from = crossing;
    else if (from !== undefined) {
      found.push([from, crossing]);
      from = undefined;
    }
  }
  if (from !== undefined) found.push([from, rows[rows.length - 1]!.week]);
  return found;
}

/** The ball's centre now: the soccer ball's anchor, through the transform travel placed it with. */
function ball(svg: SVGSVGElement): Point | undefined {
  const icon = overlayOf(svg).querySelector('.ec-run[data-key="goals"] .ec-icon');
  return icon ? matrix.apply(parseTransform(icon.getAttribute("transform") ?? ""), soccerBall.anchor) : undefined;
}

/**
 * Where a ball riding on the line rests: its radius back from the end along the walk, and half the
 * stroke plus its radius off the walk, on the left of the way it's heading. travel smooths the heading
 * over the ball's radius either side, so just past a corner it's the chord across the corner.
 */
function atTip(mark: MarkGeometry): Point {
  const radius = soccerBall.radius!;
  const at = (mark.length - radius) / mark.length;
  const rest = mark.path(at);
  const from = mark.path(at - radius / mark.length);
  const to = mark.path(1);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const ride = WIDTH / 2 + radius;
  return { x: rest.x + ride * Math.sin(angle), y: rest.y - ride * Math.cos(angle) };
}

/** Runs equal to within the 0.001 px path data is written to: 2e-5 of a week. */
function expectClose(actual: readonly [number, number][], expected: readonly [number, number][], digits = 4): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach(([a0, a1], i) => {
    expect(a0).toBeCloseTo(expected[i]![0], digits);
    expect(a1).toBeCloseTo(expected[i]![1], digits);
  });
}

function key(name: string): void {
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("a D3 line through expressive()", () => {
  it("describes each d3.line() path from the points that drew it, with samples at its vertices", () => {
    const host = d3Season();
    const seen = new Map<string, MarkData>();
    const recorder: DataEffect = {
      kind: "data",
      run: async (mark, data) => void seen.set(mark.key, data),
      end: (mark, data) => void seen.set(mark.key, data),
      clear() {}
    };
    const { fx } = attach(host, { on: { decorate: recorder } });
    expect(fx.marks().map((mark) => mark.key)).toEqual(["goals", "xg"]);
    for (const mark of fx.marks()) {
      // The same vertices as the path d3.line() drew, in the margin group's coordinates.
      expect(measurePath(mark.outline.d).points).toEqual(measurePath(host.path(mark.key as Series).getAttribute("d")!).points);
      expect(mark.thickness).toBe(WIDTH);
      // One sample per week, each where the path has that week's vertex.
      const { samples } = seen.get(mark.key)!;
      expect(samples.map((s) => s.at)).toEqual(season.map((w) => w.week));
      expect(samples.map((s) => s.value)).toEqual(season.map((w) => w[mark.key as Series]));
      samples.forEach((sample, i) => {
        expect(mark.path(sample.t).x).toBeCloseTo(x(season[i]!.week), 6);
        expect(mark.path(sample.t).y).toBeCloseTo(y(season[i]![mark.key as Series]), 6);
      });
    }
    expect(seen.get("goals")!.related("xg")!.samples).toEqual(seen.get("xg")!.samples);
    expect(overlayOf(host.svg).getAttribute("transform")).toBe("matrix(1 0 0 1 40 20)");
  });

  it("colours the goals line wherever it's below xG, crossing exactly where the lines meet", () => {
    const host = d3Season();
    attach(host, { on: { decorate: only("goals", threshold({ compareTo: "xg" })) } });
    expect(expectedRuns()).toHaveLength(3);
    expectClose(runs(host.svg), expectedRuns());
    for (const path of runPaths(host.svg)) {
      // At the line's own width, in the theme's negative colour, ending square at the crossings.
      expect(path.getAttribute("stroke-width")).toBe(String(WIDTH));
      expect(path.getAttribute("stroke-linecap")).toBe("butt");
      expect(path.style.getPropertyValue("stroke") || path.getAttribute("stroke")).toMatch(/--ec-negative/);
      // Each run lies on the goals line: its ends are on it at their weeks.
      const { start, end } = measurePath(path.getAttribute("d")!);
      for (const point of [start!, end!]) {
        const week = point.x / 60 + 1;
        const before = season[Math.floor(week) - 1]!;
        const after = season[Math.min(9, Math.floor(week))]!;
        expect(point.y).toBeCloseTo(y(before.goals + (week - before.week) * (after.goals - before.goals)), 2);
      }
    }
    // Nothing on xG, which only() leaves alone.
    expect(runPaths(host.svg, "xg")).toHaveLength(0);
  });

  it.each(["presentation", "off"] as const)("in %s, a ball rides the goals line to its leading edge, with the colour", async (mode) => {
    const host = d3Season();
    const { fx, clock } = attach(host, {}, mode);
    if (mode === "off") expect(clock.idle).toBe(true);
    const trail: Point[] = [];
    for (let frame = 0; frame < 400 && !clock.idle; frame++) {
      clock.advance(16);
      trail.push(ball(host.svg)!);
    }
    expect(clock.idle).toBe(true);
    if (mode === "presentation") {
      expect(trail.length).toBeGreaterThan(10);
      // Along the line, left to right.
      for (let i = 1; i < trail.length; i++) expect(trail[i]!.x).toBeGreaterThanOrEqual(trail[i - 1]!.x);
    }
    // It rests at the tip, on top of the stroke; motion off draws it there at once, with the red runs.
    const rest = ball(host.svg)!;
    const tip = atTip(goalsOf(fx));
    expect(rest.x).toBeCloseTo(tip.x, 2);
    expect(rest.y).toBeCloseTo(tip.y, 2);
    expectClose(runs(host.svg), expectedRuns());
  });

  it("is one tab stop, the arrow keys going from line to line in document order, each named", () => {
    const host = d3Season();
    const { fx } = attach(host);
    const goals = host.path("goals");
    const xg = host.path("xg");
    expect([goals, xg].map((path) => path.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    expect([goals, xg].map((path) => [path.getAttribute("role"), path.getAttribute("aria-label")])).toEqual([
      ["img", "Goals scored: 11 by week 10"],
      ["img", "Expected goals: 10.8 by week 10"]
    ]);
    goals.focus();
    const visits: Series[] = [];
    for (const name of ["ArrowRight", "ArrowRight", "Home", "End", "ArrowLeft", "ArrowDown", "ArrowUp"]) {
      key(name);
      visits.push(seriesOf(document.activeElement));
    }
    expect(visits).toEqual(["xg", "xg", "goals", "xg", "goals", "xg", "goals"]);

    // The ring goes round the focused line outside its stroke, on both sides.
    fx.focus("xg");
    const ring = overlayOf(host.svg).querySelector(".ec-focus-ring")!;
    expect(ring.getAttribute("d")).toBe(fx.marks()[1]!.outline.d);
    expect(Number(ring.getAttribute("stroke-width"))).toBeGreaterThan(WIDTH);
  });

  it("follows a reveal the page draws frame by frame, with watch: the colour and the ball keep up, with no events", async () => {
    const host = d3Season(revealed(1));
    const { fx, clock } = attach(host, { watch: true });
    const events: string[] = [];
    for (const type of ["enter", "update", "exit"] as const) fx.on(type, (e) => events.push(`${type} ${e.mark.key}`));
    // One point: nothing to colour, nothing to ride.
    expect(runs(host.svg)).toEqual([]);
    expect(ball(host.svg)).toBeUndefined();

    for (let at = 1.25; at <= 10; at += 0.25) {
      host.reveal(at);
      await delivered();
      clock.advance(16);
      expect(goalsOf(fx).end.x).toBeCloseTo(x(at), 6);
      expectClose(runs(host.svg), expectedRuns(at));
      // The ball sits at the tip from the first frame with room for it.
      if (at >= 1.5) {
        const rest = ball(host.svg)!;
        const tip = atTip(goalsOf(fx));
        expect(rest.x).toBeCloseTo(tip.x, 2);
        expect(rest.y).toBeCloseTo(tip.y, 2);
      }
    }
    expect(events).toEqual([]);
    // The end of the reveal shows what an attachment to the whole season draws.
    expectClose(runs(host.svg), expectedRuns());
  });

  it("follows a reveal that playback() drives on the chart's clock in the frame it's drawn, as the demo wires it", async () => {
    const host = d3Season(revealed(1));
    const e = env();
    const fx = expressive(host.paths(), { ...described, watch: true, on: { decorate: story() } }, e);
    const player = playback({ from: 1, to: 10, duration: 1800, clock: e.clock, motion: e.motion, onFrame: (at) => host.reveal(at) });
    player.seek(1, { animate: false });
    player.play();
    let behind = 0;
    while (player.playing) {
      e.clock.advance(16);
      // Straight after the frame, before the observer has handed anything over: playback drew the
      // line, and watch, on the same clock after it, read it in the same frame.
      const end = x(player.position);
      if (Math.abs(goalsOf(fx).end.x - end) > 1e-6) behind++;
      else expectClose(runs(host.svg), expectedRuns(player.position));
      await delivered();
    }
    // Only the first frame, before watch had heard anything.
    expect(behind).toBe(1);
    expectClose(runs(host.svg), expectedRuns());
    player.destroy();
  });

  it("without watch, the decoration stays where the line was when it was read", async () => {
    const host = d3Season(revealed(3));
    const { clock } = attach(host);
    const before = runs(host.svg);
    host.reveal(8);
    await delivered();
    clock.advance(16);
    expect(runs(host.svg)).toEqual(before);
  });
});
