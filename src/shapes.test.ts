// Circles and shapes read by tag through expressive(), with real D3 and Observable Plot, each attached
// with a key and only what it needs: no geometry. This is M9 step 6's proof on other libraries' marks:
// a D3 scatter's dots and Plot's are points, named, dimmed and reached by the keyboard, with their
// values as samples; a D3 curve drawn with curveMonotoneX and .defined() is a line with its gaps, read
// from its own path data, so threshold colours it below xG with nothing inside a gap, through a
// transition followed with watch; and a D3 area is a closed shape. The effect conformance checks run on
// the same kinds of marks in conformance.test.ts. It brings charts and effects together, so it lives
// beside src/index.ts, the only module allowed to.

import { dot, plot, type Plot } from "@observablehq/plot";
import { select } from "d3-selection";
import { area, curveMonotoneX, line, symbol, symbolDiamond } from "d3-shape";
import { expressive, type ChartEnv, type ExpressiveOptions } from "./charts";
import { createMotion, describe as build, manualClock, samplesAlong, type DataEffect, type MarkData, type MarkGeometry } from "./core";
import { drawnInGaps, type Drawn } from "./core/testing";
import { label, only, threshold } from "./effects";
import { iconRegistry, presetRegistry } from "./registries";

interface Player {
  name: string;
  shots: number;
  goals: number;
}

const players: Player[] = [
  { name: "Okafor", shots: 64, goals: 16 },
  { name: "Tanaka", shots: 30, goals: 6 },
  { name: "Lindqvist", shots: 45, goals: 11 },
  { name: "Castillo", shots: 12, goals: 1 }
];

/** The scatter's plot is 400 × 200 inside a 40 px left and 20 px top margin: 5 px a shot, 10 px a goal. */
const sx = (shots: number): number => 5 * shots;
const sy = (goals: number): number => 200 - 10 * goals;
/** A dot's radius grows with its goals. */
const radius = (p: Player): number => 3 + p.goals / 4;

function env(): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

const overlayOf = (svg: SVGSVGElement): SVGGElement => svg.querySelector(":scope > .ec-overlay")!;
const delivered = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
}

function key(name: string): void {
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
}

/** A data effect that keeps the data each mark was last given. */
function recorder() {
  const seen = new Map<string, MarkData>();
  const effect: DataEffect = {
    kind: "data",
    run: async (mark, data, ctx) => {
      seen.set(mark.key, data);
      ctx.onChange((moved, next) => void seen.set(moved.key, next!));
    },
    end: (mark, data) => void seen.set(mark.key, data),
    clear() {}
  };
  return { effect, seen };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/**
 * A D3 scatter drawn the other common way: a group a player, moved to the dot's place, with a circle
 * at its origin and the player's name beside it. The circles inherit the group's row, as D3's append
 * gives it.
 */
function d3Scatter(rows: Player[] = players) {
  const svg = select(document.body).append("svg").attr("width", 480).attr("height", 240);
  const plotArea = svg.append("g").attr("transform", "translate(40,20)").attr("fill", "#2a78d6");
  const groups = plotArea
    .selectAll<SVGGElement, Player>("g.dot")
    .data(rows, (d) => d.name)
    .join("g")
    .attr("class", "dot")
    .attr("transform", (d) => `translate(${sx(d.shots)},${sy(d.goals)})`);
  groups.append("circle").attr("r", radius);
  groups.append("text").attr("x", 10).text((d) => d.name);
  return { svg: svg.node()!, dots: () => plotArea.selectAll<SVGCircleElement, Player>("g.dot > circle") };
}

describe("a D3 scatter through expressive(), read by tag", () => {
  it("reads each circle as a point through its group's move, with its value as its one sample", () => {
    const host = d3Scatter();
    const data = recorder();
    const fx = expressive(host.dots(), { key: (d) => d.name, value: (d) => d.goals, on: { decorate: data.effect } }, env());
    expect(fx.marks().map((mark) => mark.key)).toEqual(players.map((p) => p.name));
    fx.marks().forEach((mark, i) => {
      const p = players[i]!;
      expect(mark).toMatchObject({ length: 0, center: { x: sx(p.shots), y: sy(p.goals) }, thickness: 2 * radius(p), outline: { closed: true } });
      expect(mark.outline.d).toBe(build.point({ key: p.name, x: sx(p.shots), y: sy(p.goals), r: radius(p) }).outline.d);
      expect(data.seen.get(p.name)!.samples).toEqual([{ t: 0, value: p.goals }]);
    });
    // The overlay is in the margin group's coordinates, the dots' nearest common ancestor.
    expect(overlayOf(host.svg).getAttribute("transform")).toBe("matrix(1 0 0 1 40 20)");
  });

  it("dims the others, names each dot and takes the arrows in document order, with a label from its sample", () => {
    const host = d3Scatter();
    const fx = expressive(
      host.dots(),
      {
        key: (d) => d.name,
        value: (d) => d.goals,
        dim: true,
        keyboard: true,
        markLabel: (d) => `${d.name}: ${d.goals} goals from ${d.shots} shots`,
        on: { hover: label((data) => `${data.samples[0]?.value} goals`) }
      },
      env()
    );
    const circles = host.dots().nodes();
    expect(circles.map((circle) => circle.getAttribute("aria-label"))).toEqual(players.map((p) => `${p.name}: ${p.goals} goals from ${p.shots} shots`));
    expect(circles.map((circle) => circle.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);

    pointer("pointerover", circles[2]!);
    expect(circles.map((circle) => circle.classList.contains("ec-dimmed"))).toEqual([true, true, false, true]);
    expect(overlayOf(host.svg).querySelector(".ec-runs text")!.textContent).toBe("11 goals");
    pointer("pointerleave", host.svg);
    expect(circles.some((circle) => circle.classList.contains("ec-dimmed"))).toBe(false);

    // In document order, as the page drew them, not by where they are.
    fx.focus("Okafor");
    key("ArrowRight");
    expect(document.activeElement).toBe(circles[1]);
    key("End");
    expect(document.activeElement).toBe(circles[3]);
    expect(overlayOf(host.svg).querySelector(".ec-runs text")!.textContent).toBe("1 goals");
    expect(overlayOf(host.svg).querySelector(".ec-focus-ring")!.getAttribute("d")).toBe(fx.marks()[3]!.outline.d);
  });

  it("reads dots drawn with d3.symbol() as closed shapes, each moved into place", () => {
    const svg = select(document.body).append("svg").attr("width", 480).attr("height", 240);
    const symbols = svg
      .append("g")
      .attr("transform", "translate(40,20)")
      .selectAll<SVGPathElement, Player>("path")
      .data(players)
      .join("path")
      .attr("transform", (d) => `translate(${sx(d.shots)},${sy(d.goals)})`)
      .attr("d", symbol(symbolDiamond, 80));
    const fx = expressive(symbols, { key: (d) => d.name, keyboard: true }, env());
    fx.marks().forEach((mark, i) => {
      expect(mark.outline.closed).toBe(true);
      expect(mark.length).toBe(0);
      expect(mark.center.x).toBeCloseTo(sx(players[i]!.shots), 9);
      expect(mark.center.y).toBeCloseTo(sy(players[i]!.goals), 9);
    });
  });
});

describe("Observable Plot's dots through expressive(), read by tag", () => {
  const plotBound = (element: Element): number => (element as Element & { __data__: number }).__data__;
  const draw = (width: number) =>
    document.body.appendChild(plot({ document, width, height: 240, marks: [dot(players, { x: "shots", y: "goals", r: 6, fill: "name" })] }) as SVGSVGElement & Plot);
  const options: ExpressiveOptions<Player> = {
    datum: (element) => players[plotBound(element)]!,
    key: (d) => d.name,
    value: (d) => d.goals,
    keyboard: true,
    markLabel: (d) => `${d.name}: ${d.goals} goals`
  };

  it("reads each dot as a point where Plot's scales put it, its row by its index", () => {
    const svg = draw(480);
    const fx = expressive(svg.querySelectorAll('g[aria-label="dot"] > circle'), options, env());
    expect(fx.marks().map((mark) => mark.key)).toEqual(players.map((p) => p.name));
    fx.marks().forEach((mark, i) => {
      expect(mark.center.x).toBeCloseTo(svg.scale("x")!.apply(players[i]!.shots), 3);
      expect(mark.center.y).toBeCloseTo(svg.scale("y")!.apply(players[i]!.goals), 3);
      expect(mark.thickness).toBe(12);
    });
    expect(svg.querySelector("circle")!.getAttribute("aria-label")).toBe("Okafor: 16 goals");
  });

  it("follows Plot's next <svg> through refresh(), each dot moved and none updated", () => {
    const first = draw(480);
    const fx = expressive(first.querySelectorAll('g[aria-label="dot"] > circle'), options, env());
    const events: string[] = [];
    for (const type of ["enter", "update", "exit"] as const) fx.on(type, (e) => events.push(`${type} ${e.mark.key}`));
    const next = draw(360);
    first.remove();
    fx.refresh(next.querySelectorAll('g[aria-label="dot"] > circle'));
    expect(events).toEqual([]);
    expect(overlayOf(next)).not.toBeNull();
    expect(fx.marks()[0]!.center.x).toBeCloseTo(next.scale("x")!.apply(players[0]!.shots), 3);
  });
});

interface Week {
  week: number;
  goals: number | undefined;
  xg: number | undefined;
}
type Series = "goals" | "xg";
/** A curve's datum: its series, and the rows it's drawn from. */
interface Trace {
  series: Series;
  rows: Week[];
}

/** Goals below xG, then above it: no goals recorded in week 3, and no xG in week 5. */
const patchy: Week[] = [
  { week: 1, goals: 0, xg: 1.2 },
  { week: 2, goals: 1, xg: 2.1 },
  { week: 3, goals: undefined, xg: 3.6 },
  { week: 4, goals: 6, xg: 4.4 },
  { week: 5, goals: 6, xg: undefined },
  { week: 6, goals: 7, xg: 7.5 }
];
/** The same season a goal and half an xG better in every week but the first. */
const better: Week[] = patchy.map((w) => (w.week === 1 ? w : { ...w, goals: w.goals === undefined ? undefined : w.goals + 1, xg: w.xg === undefined ? undefined : w.xg + 0.5 }));

const SERIES: Series[] = ["goals", "xg"];
/** 80 px a week and 30 px a goal, in a margin group. */
const cx = (week: number): number => 80 * (week - 1);
const cy = (value: number): number => 220 - 30 * value;
const WIDTH = 2.5;

const curveOf = (series: Series) =>
  line<Week>()
    .defined((w) => w[series] !== undefined)
    .x((w) => cx(w.week))
    .y((w) => cy(w[series]!))
    .curve(curveMonotoneX);

/** A D3 line drawn with curveMonotoneX and .defined(): a path a series, keyed, in a margin group. */
function d3Curves(rows: Week[] = patchy) {
  const svg = select(document.body).append("svg").attr("width", 520).attr("height", 260);
  const plotArea = svg.append("g").attr("transform", "translate(40,20)");
  const paths = plotArea
    .selectAll<SVGPathElement, Trace>("path")
    .data(SERIES.map((series) => ({ series, rows })), (d) => d.series)
    .join("path")
    .attr("fill", "none")
    .attr("stroke", (d) => (d.series === "goals" ? "#2a78d6" : "#eb6834"))
    .attr("stroke-width", WIDTH)
    .attr("d", (d) => curveOf(d.series)(d.rows));
  return { svg: svg.node()!, paths };
}

/** All a curve needs: a key, its series, and samples at the weeks it has. */
const curves: ExpressiveOptions<Trace> = {
  key: (d) => d.series,
  segment: (d) => d.series,
  samples: (d, mark) =>
    samplesAlong(
      mark,
      d.rows.flatMap((w) => (w[d.series] === undefined ? [] : [{ x: cx(w.week), y: cy(w[d.series]!), value: w[d.series]!, at: w.week }]))
    )
};

/** What the effects draw on the overlay, as the recording layer would list it. */
const runsOn = (svg: SVGSVGElement): Drawn[] =>
  [...overlayOf(svg).querySelectorAll(".ec-runs path")].map((path) => ({ kind: "path", d: path.getAttribute("d")!, style: {} }) as unknown as Drawn);

describe("a D3 curve through expressive(), read by tag", () => {
  it("reads each curve from its own path data, with a gap where a week is missing, as wide as its stroke", () => {
    const host = d3Curves();
    const data = recorder();
    const fx = expressive(host.paths, { ...curves, on: { decorate: data.effect } }, env());
    const [goals, xg] = fx.marks() as [MarkGeometry, MarkGeometry];
    host.paths.each(function (d) {
      const expected = build.shape({ key: d.series, series: d.series, d: this.getAttribute("d")!, width: WIDTH });
      const mark = d.series === "goals" ? goals : xg;
      expect(mark.outline.d).toBe(expected.outline.d);
      expect(mark.gaps).toEqual(expected.gaps);
    });
    expect(goals).toMatchObject({ series: "goals", thickness: WIDTH, outline: { closed: false } });
    // Weeks 2 to 4 for goals: the gap runs straight across.
    expect(goals.gaps).toHaveLength(1);
    expect(goals.path(goals.gaps![0]![0])).toEqual({ x: cx(2), y: cy(1) });
    expect(goals.path(goals.gaps![0]![1])).toEqual({ x: cx(4), y: cy(6) });
    expect(data.seen.get("goals")!.samples.map((sample) => [sample.at, sample.gapBefore === true])).toEqual([
      [1, false],
      [2, false],
      [4, true],
      [5, false],
      [6, false]
    ]);
    expect(data.seen.get("goals")!.related("xg")).toBe(data.seen.get("xg"));
  });

  it("colours the goals curve where it's below xG, and nothing where either is missing", () => {
    const host = d3Curves();
    const fx = expressive(host.paths, { ...curves, on: { decorate: only("goals", threshold({ compareTo: "xg" })) } }, env());
    const [goals] = fx.marks() as [MarkGeometry];
    // Below xG in weeks 1 and 2; then goals are missing, and from week 4 xG is: only the first run.
    expect(runsOn(host.svg).map((drawn) => (drawn as { d: string }).d)).toEqual([goals.slice(0, goals.gaps![0]![0])]);
  });

  it("follows a transition with watch, frame by frame, as the curves are tweened, with nothing drawn inside a gap", async () => {
    const host = d3Curves();
    const e = env();
    const fx = expressive(host.paths, { ...curves, watch: true, on: { decorate: only("goals", threshold({ compareTo: "xg" })) } }, e);
    const events: string[] = [];
    for (const type of ["enter", "update", "exit"] as const) fx.on(type, (event) => events.push(`${type} ${event.mark.key}`));
    // What a D3 transition does: the join binds the new rows at once, and the path's d is tweened.
    host.paths.data(SERIES.map((series) => ({ series, rows: better })));
    const between = (k: number): Week[] =>
      patchy.map((w, i) => {
        const to = better[i]!;
        const mix = (a: number | undefined, b: number | undefined): number | undefined => (a === undefined || b === undefined ? undefined : a + (b - a) * k);
        return { week: w.week, goals: mix(w.goals, to.goals), xg: mix(w.xg, to.xg) };
      });
    for (let k = 0.1; k <= 1.0001; k += 0.1) {
      host.paths.attr("d", (d) => curveOf(d.series)(between(k)));
      await delivered();
      e.clock.advance(16);
      host.paths.each(function (d) {
        const mark = fx.marks().find((m) => m.key === d.series)!;
        expect(mark.outline.d).toBe(build.shape({ key: d.series, d: this.getAttribute("d")!, width: WIDTH }).outline.d);
        expect(drawnInGaps(mark, runsOn(host.svg))).toEqual([]);
      });
    }
    expect(events).toEqual([]);
    // It ends where an attachment to the new curves starts.
    const fresh = d3Curves(better);
    expressive(fresh.paths, { ...curves, on: { decorate: only("goals", threshold({ compareTo: "xg" })) } }, env());
    expect(runsOn(host.svg).map((drawn) => (drawn as { d: string }).d)).toEqual(runsOn(fresh.svg).map((drawn) => (drawn as { d: string }).d));
    expect(runsOn(host.svg).length).toBeGreaterThan(0);
  });
});

describe("a D3 area through expressive(), read by tag", () => {
  it("reads each area as a closed shape with no direction, ringed and haloed round its outline", () => {
    const svg = select(document.body).append("svg").attr("width", 520).attr("height", 260);
    const full = patchy.map((w) => ({ ...w, goals: w.goals ?? 3, xg: w.xg ?? 5 }));
    const areas = svg
      .append("g")
      .attr("transform", "translate(40,20)")
      .selectAll<SVGPathElement, Series>("path")
      .data(SERIES)
      .join("path")
      .attr("fill", (series) => (series === "goals" ? "#2a78d6" : "#eb6834"))
      .attr(
        "d",
        (series) =>
          area<(typeof full)[number]>()
            .x((w) => cx(w.week))
            .y0(cy(0))
            .y1((w) => cy(w[series]))
            .curve(curveMonotoneX)(full)!
      );
    const glow: DataEffect = { kind: "data", run: async (_mark, _data, ctx) => ctx.mark.set({ halo: { width: 6, opacity: 0.4 } }), end: () => {}, clear: () => {} };
    const fx = expressive(areas, { key: (series) => series, keyboard: true, dim: true, on: { hover: glow } }, env());
    for (const mark of fx.marks()) {
      expect(mark).toMatchObject({ length: 0, outline: { closed: true } });
      expect(mark.bounds).toMatchObject({ x: 0, width: cx(6) });
      expect(mark.bounds.y + mark.bounds.height).toBe(cy(0));
    }
    fx.focus("xg");
    const svgNode = svg.node()!;
    expect(overlayOf(svgNode).querySelector(".ec-focus-ring")!.getAttribute("d")).toBe(fx.marks()[1]!.outline.d);
    expect(overlayOf(svgNode).querySelector(".ec-halos > .ec-halo > path")!.getAttribute("d")).toBe(fx.marks()[1]!.outline.d);
    expect(areas.nodes()[0]!.classList.contains("ec-dimmed")).toBe(true);
  });
});
