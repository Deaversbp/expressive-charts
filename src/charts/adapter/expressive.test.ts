import {
  createClock,
  createMotion,
  describe as build,
  manualClock,
  matrix,
  samplesAlong,
  type DataEffect,
  type EffectContext,
  type GeometryEffect,
  type MarkData,
  type MarkGeometry,
  type MotionMode,
  type Sample
} from "../../core";
import { createRegistry, type PresetFactory } from "../../core/registry";
import { measurePath } from "../../core/testing";
import type { ChartEnv } from "../bar";
import { link } from "../link";
import { expressive } from "./expressive";
import type { Attachment, ExpressiveOptions, MarkSource } from "./types";

interface Player {
  name: string;
  goals: number;
  assists: number;
}

/** One rect's datum from d3.stack(): [start, end] with the row on .data. */
type StackPoint = [number, number] & { data: Player };

const SVG = "http://www.w3.org/2000/svg";
const SERIES = ["goals", "assists"] as const;

const players: Player[] = [
  { name: "Okafor", goals: 16, assists: 4 },
  { name: "Tanaka", goals: 6, assists: 10 },
  { name: "Lindqvist", goals: 10, assists: 7 }
];

function el<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  parent.appendChild(element);
  return element;
}

/**
 * What a D3 page draws for a horizontal stacked bar chart: a margin group, the host's own axis, one
 * <g> per series (its datum the series, with .key) and one <rect> per player, whose datum is a stack
 * point. 10 px per goal unless redrawn at another scale, 34 px rows with 20 px bars.
 */
function d3Stack(rows: Player[] = players, { gap = 0 } = {}) {
  const svg = el("svg", { width: 400, height: 140, viewBox: "0 0 400 140" }, document.body);
  const plot = el("g", { transform: "translate(60,10)" }, svg);
  const axis = el("g", { class: "axis" }, plot);
  el("line", { x1: 0, x2: 0, y1: 0, y2: 120, stroke: "#999" }, axis);
  const groups = SERIES.map((key, i) => {
    const g = el("g", { class: "series", fill: i === 0 ? "#2a78d6" : "#eb6834" }, plot);
    Object.assign(g, { __data__: { key } });
    return g;
  });
  draw(groups, rows, gap);
  const rects = (): SVGRectElement[] => Array.from(svg.querySelectorAll("g.series > rect"));
  const selection = (): { nodes(): Element[]; data(): StackPoint[] } => {
    const nodes = rects();
    return { nodes: () => nodes, data: () => nodes.map((node) => (node as unknown as { __data__: StackPoint }).__data__) };
  };
  const rect = (name: string, series: (typeof SERIES)[number]): SVGRectElement =>
    rects().find((r) => (r as unknown as { __data__: StackPoint }).__data__.data.name === name && (r.parentElement as Element | null) === groups[SERIES.indexOf(series)])!;
  return { svg, plot, groups, rects, selection, rect, redraw: (next: Player[], unit?: number) => draw(groups, next, gap, unit) };
}

/** A D3 join without keys would reuse elements by index; this one keys by name, as a careful page does. */
function draw(groups: SVGGElement[], rows: Player[], gap: number, unit = 10): void {
  SERIES.forEach((key, s) => {
    const group = groups[s]!;
    const existing = new Map(Array.from(group.children, (child) => [(child as unknown as { __data__: StackPoint }).__data__.data.name, child as SVGRectElement]));
    const keep = new Set<Element>();
    rows.forEach((row, i) => {
      const x0 = s === 0 ? 0 : row.goals;
      const point = Object.assign([x0, x0 + row[key]], { data: row }) as StackPoint;
      const rect = existing.get(row.name) ?? el("rect", {}, group);
      rect.setAttribute("x", String(x0 * unit + (s === 0 ? 0 : gap)));
      rect.setAttribute("y", String(i * 34 + 7));
      rect.setAttribute("width", String(Math.max(0, row[key] * unit - (s === 0 ? 0 : gap))));
      rect.setAttribute("height", "20");
      Object.assign(rect, { __data__: point });
      keep.add(rect);
    });
    for (const child of Array.from(group.children)) if (!keep.has(child)) child.remove();
  });
}

const stacked: ExpressiveOptions<StackPoint> = {
  key: (d) => d.data.name,
  segment: (_d, element) => (element.parentElement as unknown as { __data__: { key: string } }).__data__.key
};

function quietMotion(mode: MotionMode = "presentation") {
  return createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
}

function setup<D = StackPoint>(source: MarkSource<D>, options: ExpressiveOptions<D>, more: Partial<ChartEnv> = {}) {
  const clock = manualClock();
  const presets = createRegistry<PresetFactory>({ kind: "preset" });
  const env: ChartEnv = { presets, icons: { get: () => undefined }, motion: quietMotion(), clock, ...more };
  const fx = expressive<D>(source, options, env);
  return { fx, clock, env, presets };
}

/** An effect that logs what the runner does with it. */
function recorder(options: { draw?: (mark: MarkGeometry, ctx: EffectContext) => void } = {}) {
  const log: string[] = [];
  const effect: GeometryEffect = {
    kind: "geometry",
    run(mark, ctx) {
      log.push(ctx.previous ? `run ${mark.key} from ${ctx.previous.length}` : `run ${mark.key}`);
      ctx.onChange((moved) => log.push(`change ${moved.key}`));
      options.draw?.(mark, ctx);
      return Promise.resolve();
    },
    end(mark) {
      log.push(`end ${mark.key}`);
    },
    clear() {
      log.push("clear");
    }
  };
  return { effect, log };
}

function pointer(type: string, target: Element, pointerType = "mouse"): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType }));
}

function key(target: Element, name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** Replaces a rect with a copy carrying the same row, as a host that redraws does. */
function replaceRect(rect: SVGRectElement): void {
  rect.replaceWith(Object.assign(rect.cloneNode() as SVGRectElement, { __data__: (rect as unknown as { __data__: unknown }).__data__ }));
}

/** "hover Okafor keyboard", "leave Okafor": the attachment's hover and leave events as they come. */
function hoverLog<D>(fx: Attachment<D>): string[] {
  const events: string[] = [];
  fx.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source}`));
  fx.on("leave", (e) => events.push(`leave ${e.mark.key}`));
  return events;
}

const overlayOf = (svg: SVGSVGElement) => svg.querySelector(":scope > .ec-overlay") as SVGGElement;

interface Week {
  week: number;
  goals: number;
  xg: number;
}
type SeriesName = "goals" | "xg";
/** A D3 line path's datum: its series, and the rows it was drawn from. */
interface Trace {
  name: SeriesName;
  rows: Week[];
}

/** Cumulative goals and xG over five weeks: the goals fall below xG in weeks 2 and 3. */
const season: Week[] = [
  { week: 1, goals: 1, xg: 0.5 },
  { week: 2, goals: 1, xg: 1.6 },
  { week: 3, goals: 2, xg: 2.9 },
  { week: 4, goals: 5, xg: 3.7 },
  { week: 5, goals: 6, xg: 4.4 }
];
const lineX = (week: number): number => 50 * (week - 1);
const lineY = (value: number): number => 200 - 25 * value;
const vertices = (d: Trace) => d.rows.map((row) => ({ x: lineX(row.week), y: lineY(row[d.name]) }));
const datumOf = (element: Element): unknown => (element as unknown as { __data__: unknown }).__data__;

/**
 * What a D3 page draws for a line chart: a margin group and one <path> per series from d3.line()'s
 * default (straight) curve, its datum the series with its rows, stroked with no fill. `draw` redraws
 * the paths it's given, with new rows.
 */
function d3Lines(rows: Week[] = season) {
  const svg = el("svg", { width: 300, height: 240 }, document.body);
  const plot = el("g", { transform: "translate(30,20)" }, svg);
  const names: SeriesName[] = ["goals", "xg"];
  const paths = names.map((name, i) => el("path", { class: `line ${name}`, fill: "none", stroke: i === 0 ? "#2a78d6" : "#eb6834", "stroke-width": 2 }, plot));
  const draw = (next: Week[], which: readonly SVGPathElement[] = paths): void => {
    for (const path of which) {
      const trace: Trace = { name: names[paths.indexOf(path)]!, rows: next };
      path.setAttribute("d", vertices(trace).map((p, j) => `${j === 0 ? "M" : "L"}${p.x},${p.y}`).join(""));
      Object.assign(path, { __data__: trace });
    }
  };
  draw(rows);
  return { svg, plot, paths, draw };
}

/** What a D3 line page passes: each path described from the points that drew it, and its samples from the same points. */
const traced: ExpressiveOptions<Trace> = {
  key: (d) => d.name,
  geometry: (_el, d, key) => build.line({ key, series: d.name, points: vertices(d), width: 2 }),
  samples: (d, mark) => samplesAlong(mark, d.rows.map((row) => ({ x: lineX(row.week), y: lineY(row[d.name]), value: row[d.name], at: row.week })))
};

/** A data effect that records the data it's given, when it runs and on every change. */
function dataRecorder(needs?: string[]) {
  const seen: { key: string; data: MarkData }[] = [];
  const effect: DataEffect = {
    kind: "data",
    ...(needs ? { needs: { related: needs } } : {}),
    run(mark, data, ctx) {
      seen.push({ key: mark.key, data });
      ctx.onChange((moved, next) => seen.push({ key: moved.key, data: next! }));
      return Promise.resolve();
    },
    end(mark, data) {
      seen.push({ key: mark.key, data });
    },
    clear() {}
  };
  const last = (key: string): MarkData | undefined => [...seen].reverse().find((entry) => entry.key === key)?.data;
  return { effect, seen, last };
}

/**
 * The host's strong colour, as the hover colour under dim and full emphasis write it: a quarter of the way to
 * the theme's text colour, as our charts' -strong colours step, so darker in light and lighter in dark
 * (jsdom may write a hex as rgb()).
 */
const strongOf = (hex: string, rgb: string): RegExp => new RegExp(`^color-mix\\(in oklab, (${hex}|rgb\\(${rgb}\\)), var\\(--ec-text, #0b0b0b\\) 25%\\)$`);
const BLUE = strongOf("#2a78d6", "42, 120, 214");
const ORANGE = strongOf("#eb6834", "235, 104, 52");

afterEach(() => {
  document.body.textContent = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("expressive: keys and segments", () => {
  it("groups rects that share a key into one mark, its segments ordered from the baseline", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), stacked);
    const marks = fx.marks();
    expect(marks.map((m) => m.key)).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
    const okafor = marks[0]!;
    expect(okafor.bounds).toEqual({ x: 0, y: 7, width: 200, height: 20 });
    expect(okafor.segments!.map((s) => [s.key, s.length])).toEqual([
      ["Okafor/goals", 160],
      ["Okafor/assists", 40]
    ]);
    expect(okafor.start).toEqual({ x: 0, y: 17 });
  });

  it("orders segments by position, not by the order of the host's groups", () => {
    const host = d3Stack();
    // Vega-Lite stacks alphabetically: assists drawn first in the DOM, still nearer the tip here.
    host.plot.insertBefore(host.groups[1]!, host.groups[0]!);
    const { fx } = setup(host.selection(), stacked);
    expect(fx.marks()[0]!.segments!.map((s) => s.series)).toEqual(["goals", "assists"]);
  });

  it("reads __data__ by default, the selection's data(), or a datum accessor (Plot's index)", () => {
    const host = d3Stack();
    const rows = players;
    const rects = host.rects().filter((r) => (r.parentElement as Element | null) === host.groups[0]);
    // A NodeList-like array of rects whose __data__ is the row index, as Plot binds it.
    rects.forEach((rect, i) => Object.assign(rect, { __data__: i }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plot = setup<Player>(rects, { key: (d) => d.name, datum: (element) => rows[(element as unknown as { __data__: number }).__data__]! });
    expect(plot.fx.marks().map((m) => m.key)).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
    expect(warn).not.toHaveBeenCalled();
    plot.fx.destroy();

    // Without the accessor the key sees a number, and the adapter says what to do.
    const bare = setup<unknown>(rects, { key: (d) => String(d) });
    expect(bare.fx.marks().map((m) => m.key)).toEqual(["0", "1", "2"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("datum: (el) => rows[el.__data__]"));
  });

  it("re-runs a selector, and converts numeric keys with String()", () => {
    const host = d3Stack([{ name: "7", goals: 3, assists: 0 }]);
    host.rects().forEach((rect) => rect.classList.add("bar"));
    const { fx } = setup<StackPoint>("svg rect.bar", { key: (d) => Number(d.data.name), segment: stacked.segment! });
    expect(fx.marks().map((m) => m.key)).toEqual(["7"]);
  });

  it("throws on duplicate keys, duplicate segments, shapes it can't read and missing keys", () => {
    const host = d3Stack();
    expect(() => setup(host.selection(), { key: (d) => d.data.name })).toThrow(/two elements have the key "Okafor"/);
    expect(() => setup(host.selection(), { key: (d) => d.data.name, segment: () => "goals" })).toThrow(/two "goals" segments/);
    expect(() => setup(host.selection(), { key: () => undefined as unknown as string })).toThrow(/Every mark needs a key/);
    expect(() => setup(host.svg, { key: () => "x" })).toThrow(/got an <svg>, not its marks/);
    const text = el("text", { x: 0, y: 0 }, host.plot);
    expect(() => setup([text], { key: () => "label" })).toThrow(/can't read the geometry of a <text>/);
    expect(() => setup(host.selection(), { ...stacked, baseline: "middle" as "left" })).toThrow(/baseline must be/);
    expect(() => setup(host.selection(), { ...stacked, value: 3 as never })).toThrow(/value must be a function/);
    expect(() => setup(host.selection(), { ...stacked, markLabel: "Okafor" as never })).toThrow(/markLabel must be a function/);
    expect(() => setup(host.selection(), {} as ExpressiveOptions<StackPoint>)).toThrow(/needs a key function/);
  });

  it("takes geometry from the page for shapes it can't read", () => {
    const host = d3Stack();
    const slice = el("path", { d: "M0,-116A116,116,0,0,1,100,58L0,0Z" }, host.plot);
    Object.assign(slice, { __data__: { outcome: "Saved", startAngle: 0, endAngle: 2 } });
    const { fx } = setup<{ outcome: string; startAngle: number; endAngle: number }>([slice], {
      key: (d) => d.outcome,
      geometry: (_el, d, k) => build.arc({ key: k, cx: 0, cy: 0, inner: 70, outer: 116, start: d.startAngle, end: d.endAngle })
    });
    expect(fx.marks()[0]!.key).toBe("Saved");
    expect(() => setup([slice], { key: () => "a", geometry: (_el, _d) => build.point({ key: "b", x: 0, y: 0, r: 2 }) })).toThrow(/with the key "a"/);
  });

  it("orders marks around one pivot clockwise from 12 o'clock, and others in document order", () => {
    type Slice = { outcome: string; start: number; end: number; cx: number };
    const draw = (slices: Slice[]): SVGPathElement[] => {
      const svg = el("svg", {}, document.body);
      const g = el("g", { transform: "translate(320,150)" }, svg);
      return slices.map((d) => Object.assign(el("path", { d: "M0,0L1,1" }, g), { __data__: d }));
    };
    const options: ExpressiveOptions<Slice> = {
      key: (d) => d.outcome,
      keyboard: true,
      geometry: (_el, d, k) => build.arc({ key: k, cx: d.cx, cy: 0, inner: 70, outer: 116, start: d.start, end: d.end })
    };
    // In data order, as d3.pie() returns them. Off target starts at a negative angle and is centred at
    // about 10:40, so it comes last. Saved's pivot is 0.4 px off, which still counts as the same.
    const slices: Slice[] = [
      { outcome: "Blocked", start: Math.PI, end: 1.5 * Math.PI, cx: 0 },
      { outcome: "Goal", start: 0.2, end: 1, cx: 0 },
      { outcome: "Saved", start: 1, end: Math.PI, cx: 0.4 },
      { outcome: "Off target", start: -0.5 * Math.PI, end: 0.2, cx: 0 }
    ];
    const paths = draw(slices);
    const { fx } = setup<Slice>(paths, options);
    expect(fx.marks().map((m) => m.key)).toEqual(["Goal", "Saved", "Blocked", "Off target"]);
    // The tab stop is the first mark clockwise, and the arrows go round.
    expect(paths.map((p) => p.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1"]);
    fx.focus("Saved");
    key(paths[2]!, "ArrowRight");
    expect(document.activeElement).toBe(paths[0]);
    fx.destroy();

    // A pivot more than 0.5 px from the first: not one ring, so document order.
    const apart = setup<Slice>(draw(slices.map((d) => (d.outcome === "Saved" ? { ...d, cx: 0.6 } : d))), options);
    expect(apart.fx.marks().map((m) => m.key)).toEqual(["Blocked", "Goal", "Saved", "Off target"]);
  });

  it("keeps lines that start at one point in document order: they share a pivot but don't go round it", () => {
    // Cumulative goals and xG both start at 0 in week 1, so both lines' pivot, their first point, is (0, 100).
    const series: Record<string, { x: number; y: number }[]> = {
      goals: [
        { x: 0, y: 100 },
        { x: 50, y: 90 },
        { x: 100, y: 10 }
      ],
      xG: [
        { x: 0, y: 100 },
        { x: 50, y: 20 },
        { x: 100, y: 80 }
      ]
    };
    const host = d3Stack();
    const traces = Object.keys(series).map((name) => Object.assign(el("path", { d: "M0,0L1,1" }, host.plot), { __data__: { name } }));
    const { fx } = setup<{ name: string }>(traces, { key: (d) => d.name, keyboard: true, geometry: (_el, d, k) => build.line({ key: k, points: series[d.name]! }) });
    expect(fx.marks().map((m) => [m.key, m.pivot])).toEqual([
      ["goals", { x: 0, y: 100 }],
      ["xG", { x: 0, y: 100 }]
    ]);
    expect(traces.map((trace) => trace.getAttribute("tabindex"))).toEqual(["0", "-1"]);
  });
});

describe("expressive: baseline", () => {
  it("auto picks the edge every bar shares", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, baseline: "auto" });
    expect(fx.marks().map((m) => m.angle(0))).toEqual([0, 0, 0]);
  });

  it("finds columns, and negative bars that end on the shared line", () => {
    const svg = el("svg", {}, document.body);
    const g = el("g", { transform: "translate(0,200)" }, svg);
    const columns = [30, 80, -40].map((v, i) => {
      const rect = el("rect", { x: i * 34, y: v >= 0 ? -v : 0, width: 20, height: Math.abs(v) }, g);
      Object.assign(rect, { __data__: { id: `c${i}`, v } });
      return rect;
    });
    const { fx } = setup<{ id: string }>(columns, { key: (d) => d.id });
    expect(fx.marks().map((m) => [m.key, m.start.y, m.end.y])).toEqual([
      ["c0", 0, -30],
      ["c1", 0, -80],
      ["c2", 0, 40]
    ]);
  });

  it("an explicit baseline wins", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, baseline: "right" });
    expect(fx.marks()[0]!.segments!.map((s) => s.series)).toEqual(["assists", "goals"]);
  });
});

describe("expressive: coordinates", () => {
  it("describes marks in their nearest common ancestor's coordinates, through each element's transforms", () => {
    const host = d3Stack();
    // A per-series group with its own transform: the assists rects sit 2 px lower and twice as tall.
    host.groups[1]!.setAttribute("transform", "translate(0,2)");
    const { fx } = setup(host.selection(), { ...stacked, baseline: "left" });
    const [goals, assists] = fx.marks()[0]!.segments!;
    // The whole bar covers both boxes, and its segments share its thickness.
    expect(fx.marks()[0]!.bounds).toEqual({ x: 0, y: 7, width: 200, height: 22 });
    expect(goals!.end).toEqual({ x: 160, y: 18 });
    expect(assists!.end).toEqual({ x: 200, y: 18 });
  });

  it("puts the overlay last in the root <svg>, with the common ancestor's transform", () => {
    const host = d3Stack();
    setup(host.selection(), stacked);
    const overlay = overlayOf(host.svg);
    expect(host.svg.lastElementChild).toBe(overlay);
    expect(overlay.getAttribute("transform")).toBe("matrix(1 0 0 1 60 10)");
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    // Nothing went inside the host's groups.
    expect(host.plot.querySelector(".ec-overlay, .ec-run")).toBeNull();
  });

  it("reads quarter turns, and refuses rects that are rotated or skewed", () => {
    const host = d3Stack();
    // Series groups turned a quarter turn below the common ancestor: still upright bars, now columns.
    for (const group of host.groups) group.setAttribute("transform", "rotate(90)");
    const turned = setup(host.selection(), stacked).fx.marks().find((m) => m.key === "Okafor")!;
    expect(turned.bounds).toEqual({ x: -27, y: 0, width: 20, height: 200 });
    expect(turned.angle(0)).toBe(Math.PI / 2);
    document.querySelectorAll(".ec-overlay").forEach((overlay) => overlay.remove());
    host.groups[1]!.setAttribute("transform", "rotate(30)");
    expect(() => setup(host.selection(), stacked)).toThrow(/<rect> of "Okafor" is rotated or skewed/);
    host.groups[1]!.setAttribute("transform", "skewX(10)");
    expect(() => setup(host.selection(), stacked)).toThrow(/rotated or skewed/);
  });

  it("follows the browser's CTMs where there's layout", () => {
    const host = d3Stack([players[0]!]);
    // As if CSS scaled the plot group by 2: the attributes don't show it, the CTMs do.
    const ctm = (a: number, e: number, f: number) => () => ({ a, b: 0, c: 0, d: a, e, f });
    Object.assign(host.plot, { getScreenCTM: ctm(2, 120, 20) });
    for (const group of host.groups) Object.assign(group, { getScreenCTM: ctm(2, 120, 20) });
    for (const rect of host.rects()) Object.assign(rect, { getScreenCTM: ctm(2, 120, 20) });
    const realAppend = host.svg.appendChild.bind(host.svg);
    vi.spyOn(host.svg, "appendChild").mockImplementation((node) => {
      // The overlay at the root, before its transform: the root's user space.
      Object.assign(node, { getScreenCTM: ctm(1, 0, 0) });
      return realAppend(node);
    });
    const { fx } = setup(host.selection(), stacked);
    expect(fx.marks()[0]!.bounds).toEqual({ x: 0, y: 7, width: 200, height: 20 });
    expect(overlayOf(host.svg).getAttribute("transform")).toBe("matrix(2 0 0 2 120 20)");
  });

  it("reads a rect through its parent's CTM and its transform attribute, not back through an effect's CSS transform", () => {
    const host = d3Stack([players[0]!]);
    const ctm = (e: number) => () => ({ a: 2, b: 0, c: 0, d: 2, e, f: 20 });
    Object.assign(host.plot, { getScreenCTM: ctm(120) });
    for (const group of host.groups) Object.assign(group, { getScreenCTM: ctm(120) });
    // What a browser reports while an effect's CSS transform has the rects 5 px to the right.
    for (const rect of host.rects()) Object.assign(rect, { getScreenCTM: ctm(130) });
    const { fx } = setup(host.selection(), stacked);
    expect(fx.marks()[0]!.bounds).toEqual({ x: 0, y: 7, width: 200, height: 20 });
  });
});

describe("expressive: hover", () => {
  it("plays hover from pointer events delegated to the root <svg>", () => {
    const host = d3Stack();
    const story = recorder();
    const { fx } = setup(host.selection(), { ...stacked, on: { hover: story.effect } });
    const events: string[] = [];
    fx.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source} ${e.segment}`));
    fx.on("leave", (e) => events.push(`leave ${e.mark.key}`));

    pointer("pointerover", host.rect("Okafor", "goals"));
    // Moving onto the same bar's other segment doesn't replay.
    pointer("pointerover", host.rect("Okafor", "assists"));
    pointer("pointerover", host.rect("Tanaka", "assists"));
    pointer("pointerleave", host.svg);
    expect(events).toEqual(["hover Okafor pointer goals", "leave Okafor", "hover Tanaka pointer assists", "leave Tanaka"]);
    expect(story.log).toEqual(["run Okafor", "clear", "run Tanaka", "clear"]);
  });

  it("ignores the host's other elements, and keeps working on elements the host replaces", () => {
    const host = d3Stack();
    const story = recorder();
    const { fx } = setup(host.selection(), { ...stacked, on: { hover: story.effect } });
    pointer("pointerover", host.svg.querySelector(".axis line")!);
    expect(story.log).toEqual([]);

    // Vega replaces every mark element when its data is replaced.
    for (const rect of host.rects()) rect.replaceWith(Object.assign(rect.cloneNode() as SVGRectElement, { __data__: (rect as unknown as { __data__: unknown }).__data__ }));
    fx.refresh(host.selection());
    pointer("pointerover", host.rect("Lindqvist", "goals"));
    expect(story.log).toEqual(["run Lindqvist"]);
  });

  it("leaves the host's styling alone unless dim is on", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), stacked);
    pointer("pointerover", host.rect("Okafor", "goals"));
    expect(host.rect("Tanaka", "goals").getAttribute("class")).toBeNull();
    fx.destroy();

    const dimmed = setup(host.selection(), { ...stacked, dim: true });
    pointer("pointerover", host.rect("Okafor", "goals"));
    expect(host.rect("Okafor", "assists").classList.contains("ec-dimmed")).toBe(false);
    expect(host.rect("Tanaka", "goals").classList.contains("ec-dimmed")).toBe(true);
    expect(host.rect("Tanaka", "goals").classList.contains("ec-attached")).toBe(true);
    expect(host.rect("Tanaka", "goals").style.getPropertyValue("--ec-hover-duration")).toBe("100ms");
    // Nothing on the root: it may be shared.
    expect(host.svg.getAttribute("class")).toBeNull();
    pointer("pointerleave", host.svg);
    expect(host.rects().some((r) => r.classList.contains("ec-dimmed"))).toBe(false);
    dimmed.fx.destroy();
  });

  it("dims each attachment's own marks, so two on one <svg> leave each other alone", () => {
    const host = d3Stack();
    const goals = host.rects().filter((r) => (r.parentElement as Element | null) === host.groups[0]);
    const assists = host.rects().filter((r) => (r.parentElement as Element | null) === host.groups[1]);
    const name = (d: StackPoint): string => d.data.name;
    const datum = (el: Element): StackPoint => (el as unknown as { __data__: StackPoint }).__data__;
    const first = setup(goals, { key: name, datum, dim: true, keyboard: true });
    const second = setup(assists, { key: name, datum, baseline: "left", dim: true });
    const dimmed = (rects: SVGRectElement[]) => rects.map((r) => r.classList.contains("ec-dimmed"));

    first.fx.focus("Okafor");
    expect(dimmed(goals)).toEqual([false, true, true]);
    expect(dimmed(assists)).toEqual([false, false, false]);

    // The pointer plays the second one's hover while focus keeps the first one's going.
    pointer("pointerover", host.rect("Tanaka", "assists"));
    expect(dimmed(assists)).toEqual([true, false, true]);
    expect(dimmed(goals)).toEqual([false, true, true]);
    pointer("pointerleave", host.svg);
    expect(dimmed(assists)).toEqual([false, false, false]);
    expect(dimmed(goals)).toEqual([false, true, true]);
    second.fx.destroy();
    expect(dimmed(goals)).toEqual([false, true, true]);
  });

  it("styles the host's elements through the mark handle, composed with their own transforms", () => {
    const host = d3Stack();
    host.groups[1]!.setAttribute("transform", "translate(0,2)");
    const nudge: GeometryEffect = {
      kind: "geometry",
      run: async (_mark, ctx) => ctx.mark.set({ transform: [1, 0, 0, 1, 5, 0], opacity: 0.5, emphasis: 1, halo: { width: 6, opacity: 0.4 } }),
      end: () => {},
      clear: () => {}
    };
    setup(host.selection(), { ...stacked, on: { hover: nudge } });
    pointer("pointerover", host.rect("Okafor", "goals"));
    const assists = host.rect("Okafor", "assists");
    // 5 px right in the plot's space; the group's own translate stays out of it.
    expect(assists.style.getPropertyValue("transform")).toBe("matrix(1, 0, 0, 1, 5, 0)");
    expect(assists.style.getPropertyValue("transform-origin")).toBe("0 0");
    expect(assists.style.getPropertyValue("opacity")).toBe("0.5");
    // The host's strong colour, toward the text colour (jsdom writes the hex as rgb()).
    expect(assists.style.getPropertyValue("fill")).toMatch(ORANGE);
    expect(assists.getAttribute("transform")).toBeNull();
    const halo = overlayOf(host.svg).querySelector(".ec-halos > .ec-halo")!;
    expect(halo.querySelectorAll(":scope > path")).toHaveLength(2);
    expect(halo.getAttribute("transform")).toBe("matrix(1 0 0 1 5 0)");
    expect(halo.querySelector("mask")).not.toBeNull();

    pointer("pointerleave", host.svg);
    expect(assists.getAttribute("style")).toBeNull();
    expect(overlayOf(host.svg).querySelector(".ec-halo")).toBeNull();
  });
});

describe("expressive: refresh", () => {
  it("tells a mark's decorations when only its thickness changed, as a line's stroke width does", () => {
    const host = d3Lines();
    const story = dataRecorder();
    const thickness: number[] = [];
    const { fx } = setup(host.paths, {
      ...traced,
      // The page reads each line's width from its element.
      geometry: (el, d, key) => build.line({ key, series: d.name, points: vertices(d), width: Number(el.getAttribute("stroke-width")) }),
      on: {
        decorate: {
          ...story.effect,
          run(mark, data, ctx) {
            ctx.onChange((moved) => thickness.push(moved.thickness));
            return story.effect.run(mark, data, ctx);
          }
        }
      }
    });
    const events: string[] = [];
    for (const type of ["enter", "update", "exit"] as const) fx.on(type, (e) => events.push(`${type} ${e.mark.key}`));

    host.paths[0]!.setAttribute("stroke-width", "5");
    fx.refresh(host.paths);
    expect(fx.marks().find((m) => m.key === "goals")!.thickness).toBe(5);
    expect(thickness).toContain(5);
    // The same path: nothing to report as an update.
    expect(events).toEqual([]);
  });

  it("fires exit, update and enter by key, and follows marks that only moved", () => {
    const host = d3Stack();
    const story = recorder();
    const { fx } = setup(host.selection(), { ...stacked, on: { update: story.effect, decorate: recorder().effect } });
    const events: string[] = [];
    for (const type of ["enter", "update", "exit"] as const) fx.on(type, (e) => events.push(`${type} ${e.mark.key}`));
    fx.on("update", (e) => events.push(`from ${e.from.length}`));

    // Tanaka leaves, Okafor scores twice more, Lindqvist moves up a row, Silva arrives.
    host.redraw([
      { name: "Okafor", goals: 18, assists: 4 },
      { name: "Lindqvist", goals: 10, assists: 7 },
      { name: "Silva", goals: 2, assists: 1 }
    ]);
    fx.refresh(host.selection());
    expect(events).toEqual(["exit Tanaka", "update Okafor", "from 200", "enter Silva"]);
    expect(fx.marks().map((m) => m.key)).toEqual(["Okafor", "Lindqvist", "Silva"]);
    expect(story.log).toEqual(["run Okafor from 200", "change Okafor"]);
    expect(fx.marks()[0]!.segments!.map((s) => s.length)).toEqual([180, 40]);
  });

  it("re-reads the same source when called bare, and takes a new one from then on", () => {
    const host = d3Stack();
    host.rects().forEach((rect) => rect.classList.add("bar"));
    const story = recorder();
    const { fx } = setup<StackPoint>("rect.bar", { ...stacked, on: { hover: story.effect } });
    host.redraw(players.slice(0, 2));
    fx.refresh();
    expect(fx.marks().map((m) => m.key)).toEqual(["Okafor", "Tanaka"]);

    // Plot draws a new <svg> each time: the overlay and the listeners move with the marks.
    const next = d3Stack([players[2]!]);
    fx.refresh(next.selection());
    expect(fx.marks().map((m) => m.key)).toEqual(["Lindqvist"]);
    expect(overlayOf(next.svg)).not.toBeNull();
    expect(overlayOf(host.svg)).toBeNull();
    pointer("pointerover", host.rect("Okafor", "goals"));
    pointer("pointerover", next.rect("Lindqvist", "goals"));
    expect(story.log).toEqual(["run Lindqvist"]);
  });

  it("throws on marks it can't read, changing nothing", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), stacked);
    const before = fx.marks();
    const text = Object.assign(el("text", { x: 3 }, host.groups[0]!), { __data__: host.selection().data()[0] });
    expect(() => fx.refresh([text])).toThrow(/<text>/);
    expect(fx.marks()).toEqual(before);
    text.remove();
    fx.refresh();
    expect(fx.marks().map((m) => m.key)).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
  });

  it("without value, an update means a length changed, so a resize updates every mark", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), stacked);
    const updates: string[] = [];
    fx.on("update", (e) => updates.push(e.mark.key));
    host.redraw(players, 8);
    fx.refresh(host.selection());
    expect(updates).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
  });

  it("replays hover after a refresh, and leaves a hovered mark that's gone", () => {
    const host = d3Stack();
    const story = recorder();
    const { fx } = setup(host.selection(), { ...stacked, on: { hover: story.effect } });
    const events: string[] = [];
    fx.on("leave", (e) => events.push(`leave ${e.mark.key}`));
    pointer("pointerover", host.rect("Tanaka", "goals"));
    host.redraw(players.map((p) => ({ ...p, goals: p.goals + 1 })));
    fx.refresh(host.selection());
    expect(story.log).toEqual(["run Tanaka", "clear", "run Tanaka"]);
    host.redraw([players[0]!]);
    fx.refresh(host.selection());
    expect(events).toEqual(["leave Tanaka"]);
  });
});

describe("expressive: value", () => {
  /** A stack point's value: its own goals or assists. */
  const value = (d: StackPoint): number => d[1] - d[0];

  function attach() {
    const host = d3Stack();
    const story = recorder();
    const decoration = recorder();
    const { fx } = setup(host.selection(), { ...stacked, value, on: { update: story.effect, decorate: decoration.effect } });
    const updates: string[] = [];
    fx.on("update", (e) => updates.push(`${e.mark.key} from ${e.from.length}`));
    decoration.log.length = 0;
    return { host, fx, story, decoration, updates };
  }

  it("a resize only moves marks: no update, and decorations follow", () => {
    const { host, fx, story, decoration, updates } = attach();
    // The window narrows: 8 px a goal instead of 10, the same values, new stack points.
    host.redraw(players, 8);
    fx.refresh(host.selection());
    expect(updates).toEqual([]);
    expect(story.log).toEqual([]);
    expect(decoration.log).toEqual(["change Okafor", "change Tanaka", "change Lindqvist"]);
    expect(fx.marks()[0]!.segments!.map((s) => s.length)).toEqual([128, 32]);
  });

  it("a new axis maximum updates only the marks whose values changed", () => {
    const { host, fx, story, updates } = attach();
    // Okafor scores four, so the axis grows and every bar shrinks to 8 px a goal.
    host.redraw(players.map((p) => (p.name === "Okafor" ? { ...p, goals: 20 } : p)), 8);
    fx.refresh(host.selection());
    expect(updates).toEqual(["Okafor from 200"]);
    expect(story.log).toEqual(["run Okafor from 200", "change Okafor"]);
    expect(fx.marks().map((m) => m.length)).toEqual([192, 128, 136]);
  });

  it("a value that changed is an update even when no length did", () => {
    const { host, fx, updates } = attach();
    // Okafor gets to 20 and 5 as the axis grows to 8 px a goal: his segments keep their lengths, the others' shrink.
    host.redraw(players.map((p) => (p.name === "Okafor" ? { ...p, goals: 20, assists: 5 } : p)), 8);
    fx.refresh(host.selection());
    expect(updates).toEqual(["Okafor from 200"]);
    expect(fx.marks()[0]!.segments!.map((s) => s.length)).toEqual([160, 40]);
  });

  it("a segment that appears or goes is an update, as on the reference charts", () => {
    const { host, fx, updates } = attach();
    const goals = (): SVGRectElement[] => host.rects().filter((r) => (r.parentElement as Element | null) === host.groups[0]);
    fx.refresh(goals());
    expect(updates).toEqual(["Okafor from 200", "Tanaka from 160", "Lindqvist from 170"]);
    updates.length = 0;
    fx.refresh(host.selection());
    expect(updates).toEqual(["Okafor from 160", "Tanaka from 60", "Lindqvist from 100"]);
  });

  it("compares values, not rows: Plot's indices and rows that are new on every render", () => {
    // Plot binds each rect to its row's index and draws anew each time; the page keeps the rows.
    let rows = players;
    const svg = el("svg", {}, document.body);
    const plot = (unit: number): SVGRectElement[] => {
      svg.replaceChildren();
      return rows.map((row, i) => Object.assign(el("rect", { x: 0, y: i * 34, width: row.goals * unit, height: 20 }, svg), { __data__: i }));
    };
    const { fx } = setup<Player>(plot(10), { key: (d) => d.name, datum: (element) => rows[(element as unknown as { __data__: number }).__data__]!, value: (d) => d.goals });
    const updates: string[] = [];
    fx.on("update", (e) => updates.push(e.mark.key));

    rows = rows.map((p) => ({ ...p }));
    fx.refresh(plot(8));
    expect(updates).toEqual([]);
    rows = rows.map((p) => (p.name === "Tanaka" ? { ...p, goals: 7 } : p));
    fx.refresh(plot(8));
    expect(updates).toEqual(["Tanaka"]);
  });

  it("treats NaN as unchanged, so a missing value doesn't update on every refresh", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, value: () => Number.NaN });
    const updates: string[] = [];
    fx.on("update", (e) => updates.push(e.mark.key));
    host.redraw(players.map((p) => ({ ...p, goals: p.goals + 1 })));
    fx.refresh(host.selection());
    expect(updates).toEqual([]);
  });
});

describe("expressive: data on host marks", () => {
  it("gives data effects the page's samples: on a D3 line, the points that drew it, at its vertices", () => {
    const host = d3Lines();
    const decoration = dataRecorder();
    const calls: string[] = [];
    const { fx } = setup<Trace>(host.paths, {
      ...traced,
      samples: (d, mark) => {
        calls.push(`${d.name} on ${mark.key}`);
        return traced.samples!(d, mark);
      },
      on: { decorate: decoration.effect }
    });
    expect(calls).toEqual(["goals on goals", "xg on xg"]);

    const goals = decoration.last("goals")!;
    expect(goals.datum).toBe(datumOf(host.paths[0]!));
    expect(goals.samples.map((s) => [s.at, s.value])).toEqual(season.map((row) => [row.week, row.goals]));
    // Each sample is at its vertex: t is the distance along the line to it, over the line's length.
    const line = fx.marks()[0]!;
    goals.samples.forEach((sample, i) => {
      const at = line.path(sample.t);
      const vertex = vertices({ name: "goals", rows: season })[i]!;
      expect(at.x).toBeCloseTo(vertex.x, 9);
      expect(at.y).toBeCloseTo(vertex.y, 9);
    });
    expect([goals.samples[0]!.t, goals.samples[4]!.t]).toEqual([0, 1]);
  });

  it("without samples, gives rects with a numeric value the bar chart's samples, and other marks none", () => {
    const host = d3Stack();
    const decoration = dataRecorder();
    setup(host.selection(), { ...stacked, value: (d) => d[1] - d[0], on: { decorate: decoration.effect } });
    // Okafor: 16 goals and 4 assists. From 0 at the baseline to the total at the tip, as on barChart.
    const okafor = decoration.last("Okafor")!;
    expect(okafor.datum).toBe(datumOf(host.rect("Okafor", "goals")));
    expect(okafor.samples).toEqual([
      { t: 0, value: 0 },
      { t: 1, value: 20 }
    ]);
    // Each segment over its own range, with its own row: the stack point it was drawn from.
    const assists = okafor.related("assists")!;
    expect(assists.datum).toBe(datumOf(host.rect("Okafor", "assists")));
    expect(assists.samples).toEqual([
      { t: 0, value: 16 },
      { t: 1, value: 20 }
    ]);
    expect(okafor.related("goals")!.samples).toEqual([
      { t: 0, value: 0 },
      { t: 1, value: 16 }
    ]);

    // Without value there's nothing to read the values from, and a line described with geometry has
    // no samples unless the page gives them.
    const plain = dataRecorder();
    setup(d3Stack().selection(), { ...stacked, on: { decorate: plain.effect } });
    expect(plain.last("Okafor")!.samples).toEqual([]);
    const lines = dataRecorder();
    setup<Trace>(d3Lines().paths, { key: traced.key, geometry: traced.geometry!, on: { decorate: lines.effect } });
    expect(lines.last("goals")!.samples).toEqual([]);
  });

  it("checks samples when read: t in [0, 1] and never decreasing, finite values", () => {
    const attach = (samples: unknown) => () => setup<Trace>(d3Lines().paths, { ...traced, samples: () => samples as Sample[] });
    expect(attach([{ t: -0.1, value: 1 }])).toThrow(/samples for "goals": samples\[0\]\.t must be in \[0, 1\], got -0\.1\./);
    expect(attach([{ t: 0.5, value: 1 }, { t: 0.4, value: 2 }])).toThrow(/samples for "goals" must be in t order: samples\[1\]\.t is 0\.4, after 0\.5\./);
    expect(attach([{ t: 0, value: Number.NaN }])).toThrow(/samples\[0\]\.value must be a finite number, got NaN/);
    expect(attach([{ t: 0, value: "3" }])).toThrow(/got "3"/);
    expect(attach([null])).toThrow(/samples\[0\]\.t must be in \[0, 1\], got undefined/);
    expect(attach("0 to 1")).toThrow(TypeError);
    // A step, two values at one t, is fine.
    expect(attach([{ t: 0, value: 1 }, { t: 0.5, value: 1 }, { t: 0.5, value: 2 }])).not.toThrow();
    expect(attach([{ t: 0, value: 1 }, { t: 1, value: 2, gapBefore: "yes" }])).toThrow(/samples\[1\]\.gapBefore must be true or false, got "yes"/);
  });

  it("keeps gapBefore on the samples it's given, so data effects see the gaps", () => {
    const decoration = dataRecorder();
    const given: Sample[] = [{ t: 0, value: 1 }, { t: 0.4, value: 2, gapBefore: false }, { t: 0.6, value: 3, gapBefore: true, at: 4 }, { t: 1, value: 4 }];
    setup<Trace>(d3Lines().paths, { ...traced, samples: () => given, on: { decorate: decoration.effect } });
    expect(decoration.last("goals")!.samples).toEqual([{ t: 0, value: 1 }, { t: 0.4, value: 2 }, { t: 0.6, value: 3, at: 4, gapBefore: true }, { t: 1, value: 4 }]);
  });

  it("throws on bad samples in refresh() before anything changes", () => {
    const host = d3Lines();
    const decoration = dataRecorder();
    let broken = false;
    const { fx } = setup<Trace>(host.paths, { ...traced, samples: (d, mark) => (broken ? [{ t: 2, value: 0 }] : traced.samples!(d, mark)), on: { decorate: decoration.effect } });
    const events: string[] = [];
    for (const type of ["enter", "update", "exit"] as const) fx.on(type, (e) => events.push(`${type} ${e.mark.key}`));
    const before = fx.marks();
    const seen = decoration.seen.length;

    broken = true;
    host.draw(season.map((row) => ({ ...row, goals: row.goals + 1 })));
    expect(() => fx.refresh()).toThrow(/samples for "goals": samples\[0\]\.t must be in \[0, 1\], got 2/);
    expect(fx.marks()).toEqual(before);
    expect(events).toEqual([]);
    expect(decoration.seen).toHaveLength(seen);
    broken = false;
    fx.refresh();
    expect(fx.marks()[0]!.start.y).toBe(lineY(2));
    expect(decoration.last("goals")!.samples[0]!.value).toBe(2);
  });

  it("finds a related series on another mark of that series: two D3 line paths", () => {
    const host = d3Lines();
    const decoration = dataRecorder();
    setup<Trace>(host.paths, { ...traced, on: { decorate: decoration.effect } });
    const goals = decoration.last("goals")!;
    const xg = goals.related("xg")!;
    expect(xg.datum).toBe(datumOf(host.paths[1]!));
    expect(xg.samples.map((s) => [s.at, s.value])).toEqual(season.map((row) => [row.week, row.xg]));
    expect(xg.related("goals")!.datum).toBe(goals.datum);
    expect(goals.related("assists")).toBeUndefined();
  });

  it("prefers the mark's own segment of a series, then the first other mark of it in visual order", () => {
    // Grouped bars: each rect is a mark of its own, one part named by segment, so it has that series.
    const host = d3Stack();
    const seriesOf = (element: Element): string => (element.parentElement as unknown as { __data__: { key: string } }).__data__.key;
    const decoration = dataRecorder();
    setup(host.selection(), {
      key: (d, element) => `${d.data.name} ${seriesOf(element)}`,
      segment: (_d, element) => seriesOf(element),
      value: (d) => d[1] - d[0],
      baseline: "left",
      on: { decorate: decoration.effect }
    });
    // Its own segment, though every player's goals bar has the series "goals".
    expect(decoration.last("Tanaka goals")!.related("goals")!.datum).toBe(datumOf(host.rect("Tanaka", "goals")));
    // No segment of its own: the first assists bar, top to bottom, which needn't be the same player's.
    expect(decoration.last("Tanaka goals")!.related("assists")!.datum).toBe(datumOf(host.rect("Okafor", "assists")));
  });

  it("checks the series data effects need, on creation and on every refresh(), before anything changes", () => {
    const needsXg = dataRecorder(["xg"]);
    const host = d3Lines();
    const { fx } = setup<Trace>(host.paths, { ...traced, on: { decorate: needsXg.effect } });

    // Lines whose geometry names no series have none to find.
    const unnamed: ExpressiveOptions<Trace> = { ...traced, geometry: (_el, d, key) => build.line({ key, points: vertices(d) }), on: { decorate: needsXg.effect } };
    expect(() => setup<Trace>(d3Lines().paths, unnamed)).toThrow(/^expressive: on\.decorate needs the series "xg", but the marks have no series\. Name each mark's series/);
    // A stack's series are its parts'.
    expect(() => setup(d3Stack().selection(), { ...stacked, on: { hover: dataRecorder(["xg"]).effect } })).toThrow(
      /on\.hover needs the series "xg", but the marks' series are "goals", "assists"\./
    );
    // With no marks yet, there's nothing to check.
    expect(() => setup<Trace>([], { ...traced, on: { decorate: needsXg.effect } })).not.toThrow();

    // The host stops drawing xG: refresh() throws, and the attachment stays as it was.
    const events: string[] = [];
    fx.on("exit", (e) => events.push(`exit ${e.mark.key}`));
    host.paths[1]!.remove();
    expect(() => fx.refresh(host.paths.slice(0, 1))).toThrow(/needs the series "xg", but the marks' series are "goals"\./);
    expect(fx.marks().map((m) => m.key)).toEqual(["goals", "xg"]);
    expect(events).toEqual([]);
  });

  it("tells a mark that may read a related series when that series changes, though the mark didn't", () => {
    const later = season.map((row) => ({ ...row, xg: row.xg + 1 }));
    const host = d3Lines();
    const needsXg = dataRecorder(["xg"]);
    const { fx } = setup<Trace>(host.paths, { ...traced, on: { decorate: needsXg.effect } });
    needsXg.seen.length = 0;
    // The host redraws xG alone; the goals path and its row stay as they were.
    host.draw(later, [host.paths[1]!]);
    fx.refresh();
    expect(needsXg.seen.map((entry) => entry.key)).toEqual(["xg", "goals"]);
    expect(needsXg.last("goals")!.related("xg")!.samples.map((s) => s.value)).toEqual(later.map((row) => row.xg));

    // With no effect that needs xG, the goals line isn't told.
    const other = d3Lines();
    const plain = dataRecorder();
    const second = setup<Trace>(other.paths, { ...traced, on: { decorate: plain.effect } });
    plain.seen.length = 0;
    other.draw(later, [other.paths[1]!]);
    second.fx.refresh();
    expect(plain.seen.map((entry) => entry.key)).toEqual(["xg"]);
  });

  it("sees samples that changed though the geometry and the row didn't", () => {
    const host = d3Lines();
    const decoration = dataRecorder();
    let scale = 1;
    const { fx } = setup<Trace>(host.paths, {
      ...traced,
      samples: (d, mark) => traced.samples!(d, mark).map((s) => ({ ...s, value: s.value * scale })),
      on: { decorate: decoration.effect }
    });
    decoration.seen.length = 0;
    fx.refresh();
    expect(decoration.seen).toEqual([]);
    scale = 2;
    fx.refresh();
    expect(decoration.seen.map((entry) => [entry.key, entry.data.samples[4]!.value])).toEqual([
      ["goals", 12],
      ["xg", 8.8]
    ]);
  });
});

describe("expressive: stroked marks", () => {
  /** Full emphasis and a 6 px halo while hovered, and a trace of the walk in the mark's colour. */
  const glowAt = (mark: MarkGeometry, ctx: EffectContext): void => {
    ctx.mark.set({ emphasis: 1, halo: { width: 6, opacity: 0.4 } });
    ctx.layer.path(mark.slice(0, 1), { stroke: "mark", width: 1 });
  };
  const glow: GeometryEffect = { kind: "geometry", run: async (mark, ctx) => glowAt(mark, ctx), end: glowAt, clear: () => {} };

  it("takes a line's colours from its stroke when the fill is none: emphasis, halos and the mark colour", () => {
    const host = d3Lines();
    const { fx } = setup<Trace>(host.paths, { ...traced, on: { hover: glow } });
    const [goals] = host.paths;
    pointer("pointerover", goals!);
    // Emphasis colours the stroke and leaves the fill alone.
    expect(goals!.style.getPropertyValue("stroke")).toMatch(BLUE);
    expect(goals!.style.getPropertyValue("fill")).toBe("");
    // Runs draw in the line's colour.
    expect(overlayOf(host.svg).querySelector<SVGGElement>(".ec-run")!.style.getPropertyValue("--ec-mark")).toMatch(/^(#2a78d6|rgb\(42, 120, 214\))$/);
    // The halo is in the line's colour too, and goes round its stroke: cut out of the mask without a
    // fill, which would close the line into a polygon, and as wide as the stroke plus the halo.
    const halo = overlayOf(host.svg).querySelector(".ec-halos > .ec-halo")!;
    const cut = halo.querySelector("mask path")!;
    expect(["fill", "stroke", "stroke-width"].map((name) => cut.getAttribute(name))).toEqual(["none", "black", "2"]);
    const stroke = halo.querySelector<SVGPathElement>(":scope > path")!;
    expect(stroke.getAttribute("d")).toBe(fx.marks()[0]!.outline.d);
    expect(stroke.getAttribute("stroke-width")).toBe("8");
    expect(stroke.style.getPropertyValue("stroke")).toMatch(/^(#2a78d6|rgb\(42, 120, 214\))$/);

    pointer("pointerleave", host.svg);
    expect(goals!.getAttribute("style")).toBeNull();
    expect(overlayOf(host.svg).querySelector(".ec-halo")).toBeNull();
  });

  it("rings an open outline outside its stroke, on both sides", () => {
    const host = d3Lines();
    const { fx } = setup<Trace>(host.paths, { ...traced, keyboard: true });
    fx.focus("xg");
    const ring = overlayOf(host.svg).querySelector(".ec-focus-ring")!;
    const hole = overlayOf(host.svg).querySelector(":scope > mask path")!;
    expect(ring.getAttribute("d")).toBe(fx.marks()[1]!.outline.d);
    expect(["fill", "stroke-width"].map((name) => hole.getAttribute(name))).toEqual(["none", "6"]);
    expect(ring.getAttribute("stroke-width")).toBe("10");
  });

  it("reads strokes set in CSS as well as attributes, and finds no colour in a gradient", () => {
    const host = d3Lines();
    const [goals, xg] = host.paths;
    for (const name of ["fill", "stroke"]) goals!.removeAttribute(name);
    goals!.setAttribute("style", "fill: none; stroke: rgb(42, 120, 214)");
    xg!.setAttribute("stroke", "url(#fade)");
    setup<Trace>(host.paths, { ...traced, on: { hover: glow } });
    pointer("pointerover", goals!);
    expect(goals!.style.getPropertyValue("stroke")).toMatch(BLUE);
    // No colour to start from: emphasis leaves a gradient as it is.
    pointer("pointerover", xg!);
    expect(xg!.style.getPropertyValue("stroke")).toBe("");
    expect(xg!.style.getPropertyValue("fill")).toBe("");
  });
});

describe("expressive: hover colour", () => {
  it("under dim, gives the hovered mark its strong colour, as our charts do: each segment's fill on a bar", () => {
    const host = d3Stack();
    setup(host.selection(), { ...stacked, dim: true });
    pointer("pointerover", host.rect("Okafor", "goals"));
    expect(host.rect("Okafor", "goals").style.getPropertyValue("fill")).toMatch(BLUE);
    expect(host.rect("Okafor", "assists").style.getPropertyValue("fill")).toMatch(ORANGE);
    // The others dim and keep their colours; the strong colour fades in with the stylesheet's transition.
    expect(host.rect("Tanaka", "goals").style.getPropertyValue("fill")).toBe("");
    expect(host.rect("Okafor", "goals").style.getPropertyValue("transition")).toBe("");
    expect(document.querySelector("style[data-expressive-charts]")!.textContent).toContain(
      ":where(.ec-attached) { transition: opacity var(--ec-hover-duration, 100ms) ease-out, fill var(--ec-hover-duration, 100ms) ease-out, stroke var(--ec-hover-duration, 100ms) ease-out; }"
    );

    pointer("pointerover", host.rect("Tanaka", "assists"));
    expect(host.rect("Okafor", "goals").style.getPropertyValue("fill")).toBe("");
    expect(host.rect("Tanaka", "goals").style.getPropertyValue("fill")).toMatch(BLUE);
    pointer("pointerleave", host.svg);
    expect(host.rects().map((rect) => rect.style.getPropertyValue("fill"))).toEqual(host.rects().map(() => ""));
  });

  it("gives a line's stroke its strong colour, for keyboard focus too, and gives way to an effect's emphasis", () => {
    const host = d3Lines();
    const soften: GeometryEffect = { kind: "geometry", run: async (_mark, ctx) => ctx.mark.set({ emphasis: 0 }), end: () => {}, clear: () => {} };
    const { fx } = setup<Trace>(host.paths, { ...traced, dim: true, keyboard: true });
    const [goals, xg] = host.paths;
    pointer("pointerover", goals!);
    expect(goals!.style.getPropertyValue("stroke")).toMatch(BLUE);
    expect(goals!.style.getPropertyValue("fill")).toBe("");
    expect(xg!.classList.contains("ec-dimmed")).toBe(true);
    pointer("pointerleave", host.svg);
    fx.focus("xg");
    expect(xg!.style.getPropertyValue("stroke")).toMatch(ORANGE);
    expect(goals!.style.getPropertyValue("stroke")).toBe("");
    fx.destroy();
    expect(host.paths.map((path) => path.getAttribute("style"))).toEqual([null, null]);

    // An effect that sets emphasis decides the colour while it's set.
    setup<Trace>(host.paths, { ...traced, dim: true, on: { hover: soften } });
    pointer("pointerover", goals!);
    expect(goals!.style.getPropertyValue("stroke")).toMatch(/^(#2a78d6|rgb\(42, 120, 214\))$/);
  });

  it("follows the hovered mark onto the elements the host redraws, and leaves the old ones as they were", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, dim: true });
    pointer("pointerover", host.rect("Okafor", "goals"));
    // A host that redraws makes a new element from the row, without the old one's inline style.
    const old = host.rect("Okafor", "goals");
    const fresh = old.cloneNode() as SVGRectElement;
    for (const name of ["style", "class"]) fresh.removeAttribute(name);
    old.replaceWith(Object.assign(fresh, { __data__: datumOf(old) }));
    fx.refresh(host.selection());
    expect(host.rect("Okafor", "goals").style.getPropertyValue("fill")).toMatch(BLUE);
    expect(old.getAttribute("style")).toBeNull();
  });

  it("leaves the host's colours alone without dim", () => {
    const bars = d3Stack();
    setup(bars.selection(), stacked);
    pointer("pointerover", bars.rect("Okafor", "goals"));
    expect(bars.rects().map((rect) => rect.getAttribute("style"))).toEqual(bars.rects().map(() => null));
    const lines = d3Lines();
    setup<Trace>(lines.paths, traced);
    pointer("pointerover", lines.paths[0]!);
    expect(lines.paths.map((path) => path.getAttribute("style"))).toEqual([null, null]);
  });
});

describe("expressive: keyboard", () => {
  it("adds a roving tabindex in visual order, re-applied on every refresh", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const tabindex = () => host.rects().map((r) => `${(r as unknown as { __data__: StackPoint }).__data__.data.name}:${r.getAttribute("tabindex")}`);
    expect(tabindex()).toEqual(["Okafor:0", "Tanaka:-1", "Lindqvist:-1", "Okafor:-1", "Tanaka:-1", "Lindqvist:-1"]);
    // New elements (as Vega draws) get it again.
    for (const rect of host.rects()) rect.replaceWith(Object.assign(rect.cloneNode() as SVGRectElement, { __data__: (rect as unknown as { __data__: unknown }).__data__ }));
    for (const rect of host.rects()) rect.removeAttribute("tabindex");
    fx.refresh(host.selection());
    expect(tabindex()).toEqual(["Okafor:0", "Tanaka:-1", "Lindqvist:-1", "Okafor:-1", "Tanaka:-1", "Lindqvist:-1"]);
  });

  it("focus plays the hover story; arrows, Home and End move; Escape and blur leave", () => {
    const host = d3Stack();
    const story = recorder();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true, on: { hover: story.effect } });
    const events: string[] = [];
    fx.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source}`));
    fx.on("leave", (e) => events.push(`leave ${e.mark.key}`));
    const ring = overlayOf(host.svg).querySelector(".ec-focus-ring")!;

    fx.focus("Okafor");
    expect(document.activeElement).toBe(host.rect("Okafor", "goals"));
    expect(ring.getAttribute("visibility")).toBeNull();
    expect(ring.getAttribute("d")).toBe(fx.marks()[0]!.outline.d);
    expect(host.rect("Okafor", "goals").style.getPropertyValue("outline")).toBe("none");

    expect(key(host.rect("Okafor", "goals"), "ArrowDown").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(host.rect("Tanaka", "goals"));
    expect(host.rect("Tanaka", "goals").getAttribute("tabindex")).toBe("0");
    expect(host.rect("Okafor", "goals").getAttribute("tabindex")).toBe("-1");
    key(host.rect("Tanaka", "goals"), "End");
    expect(document.activeElement).toBe(host.rect("Lindqvist", "goals"));
    key(host.rect("Lindqvist", "goals"), "Home");
    expect(document.activeElement).toBe(host.rect("Okafor", "goals"));
    key(host.rect("Okafor", "goals"), "ArrowUp");
    expect(document.activeElement).toBe(host.rect("Okafor", "goals"));

    key(host.rect("Okafor", "goals"), "Escape");
    expect(document.activeElement).toBe(host.rect("Okafor", "goals"));
    // A key the adapter doesn't use passes through.
    expect(key(host.rect("Okafor", "goals"), "a").defaultPrevented).toBe(false);

    key(host.rect("Okafor", "goals"), "ArrowRight");
    (document.activeElement as SVGElement).blur();
    expect(ring.getAttribute("visibility")).toBe("hidden");
    expect(events).toEqual([
      "hover Okafor keyboard",
      "leave Okafor",
      "hover Tanaka keyboard",
      "leave Tanaka",
      "hover Lindqvist keyboard",
      "leave Lindqvist",
      "hover Okafor keyboard",
      "leave Okafor",
      "hover Tanaka keyboard",
      "leave Tanaka"
    ]);
    expect(story.log.filter((line) => line.startsWith("run"))).toHaveLength(5);
  });

  it("draws the ring outside the mark and a clear gap, so it shows on a bar in the focus colour", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const overlay = overlayOf(host.svg);
    const ring = overlay.querySelector(".ec-focus-ring")!;
    fx.focus("Okafor");
    const outline = fx.marks().find((mark) => mark.key === "Okafor")!.outline.d;

    // An 8 px stroke on the outline, masked to more than 2 px outside it: a 2 px ring past a 2 px gap.
    expect(ring.getAttribute("d")).toBe(outline);
    expect(ring.getAttribute("stroke-width")).toBe("8");
    const id = /^url\(#(.+)\)$/.exec(ring.getAttribute("mask") ?? "")?.[1];
    const mask = overlay.querySelector(`mask#${id}`)!;
    expect(mask.querySelector("rect")?.getAttribute("fill")).toBe("white");
    const hole = mask.querySelector("path")!;
    expect(["d", "fill", "stroke", "stroke-width"].map((name) => hole.getAttribute(name))).toEqual([outline, "black", "black", "4"]);

    fx.focus("Tanaka");
    expect(hole.getAttribute("d")).toBe(fx.marks().find((mark) => mark.key === "Tanaka")!.outline.d);

    // Another attachment's mask has its own id.
    const other = d3Stack();
    setup(other.selection(), { ...stacked, keyboard: true });
    expect(overlayOf(other.svg).querySelector(".ec-focus-ring")?.getAttribute("mask")).not.toBe(ring.getAttribute("mask"));
  });

  it("rings an open outline from geometry on both sides, outside its stroke", () => {
    const host = d3Stack();
    const points = [
      { x: 0, y: 100 },
      { x: 50, y: 20 },
      { x: 100, y: 80 }
    ];
    const trace = el("path", { d: "M0,100L50,20L100,80" }, host.plot);
    Object.assign(trace, { __data__: { name: "xG" } });
    const { fx } = setup<{ name: string }>([trace], {
      key: (d) => d.name,
      keyboard: true,
      geometry: (_el, _d, k) => build.line({ key: k, points, width: 3 })
    });
    fx.focus("xG");
    const ring = overlayOf(host.svg).querySelector(".ec-focus-ring")!;
    const hole = overlayOf(host.svg).querySelector("mask path")!;
    expect(ring.getAttribute("visibility")).toBeNull();
    // Unfilled: a fill would close the line into a triangle and mask the ring along its inside. The
    // gap and ring start at the 3 px stroke's edge.
    expect(["fill", "stroke-width"].map((name) => hole.getAttribute(name))).toEqual(["none", "7"]);
    expect(ring.getAttribute("stroke-width")).toBe("11");
  });

  it("shows the ring for a Tab after a click on the chart's background", () => {
    const host = d3Stack();
    setup(host.selection(), { ...stacked, keyboard: true });
    const ring = overlayOf(host.svg).querySelector(".ec-focus-ring")!;
    // A click on something that takes no focus, then Tab from outside the chart.
    pointer("pointerdown", host.svg.querySelector(".axis line")!);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    host.rect("Okafor", "goals").focus();
    expect(ring.getAttribute("visibility")).toBeNull();
  });

  it("a click focuses without the ring, and keeps focus on a mark the host redraws", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const ring = overlayOf(host.svg).querySelector(".ec-focus-ring")!;
    pointer("pointerdown", host.rect("Tanaka", "assists"));
    host.rect("Tanaka", "assists").focus();
    expect(ring.getAttribute("visibility")).toBe("hidden");

    fx.focus("Lindqvist");
    const replaced = host.rect("Lindqvist", "goals");
    replaced.replaceWith(Object.assign(replaced.cloneNode() as SVGRectElement, { __data__: (replaced as unknown as { __data__: unknown }).__data__ }));
    fx.refresh(host.selection());
    expect(document.activeElement).toBe(host.rect("Lindqvist", "goals"));
  });

  it("leaves the hover to the pointer when focus comes from a tap or click, so a tap reports touch", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const events = hoverLog(fx);
    const ring = overlayOf(host.svg).querySelector(".ec-focus-ring")!;
    // A tap: the browser focuses the rect between pointerdown and click.
    const tapped = host.rect("Tanaka", "assists");
    pointer("pointerdown", tapped, "touch");
    tapped.focus();
    tapped.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(events).toEqual(["hover Tanaka touch"]);
    expect(ring.getAttribute("visibility")).toBe("hidden");
    // The tab stop moved to the tapped mark, and a key from there plays the keyboard hover.
    expect(host.rect("Tanaka", "goals").getAttribute("tabindex")).toBe("0");
    key(tapped, "ArrowDown");
    expect(events).toEqual(["hover Tanaka touch", "leave Tanaka", "hover Lindqvist keyboard"]);

    // A click on the mark the mouse is over: its hover goes on.
    events.length = 0;
    pointer("pointerover", host.rect("Okafor", "goals"));
    pointer("pointerdown", host.rect("Okafor", "goals"));
    host.rect("Okafor", "goals").focus();
    expect(events).toEqual(["leave Lindqvist", "hover Okafor pointer"]);
  });

  it("focus(key) plays the hover with the ring after a click too, on another mark or the clicked one", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const events = hoverLog(fx);
    const ring = overlayOf(host.svg).querySelector(".ec-focus-ring")!;
    pointer("pointerdown", host.rect("Tanaka", "assists"));
    host.rect("Tanaka", "assists").focus();
    expect(events).toEqual([]);
    fx.focus("Tanaka");
    expect(document.activeElement).toBe(host.rect("Tanaka", "assists"));
    expect(ring.getAttribute("visibility")).toBeNull();
    pointer("pointerdown", host.rect("Tanaka", "assists"));
    fx.focus("Lindqvist");
    expect(document.activeElement).toBe(host.rect("Lindqvist", "goals"));
    expect(ring.getAttribute("visibility")).toBeNull();
    expect(events).toEqual(["hover Tanaka keyboard", "leave Tanaka", "hover Lindqvist keyboard"]);
  });

  it("moves focus to a mark's new element when the host keeps the old one in the page", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const events = hoverLog(fx);
    const datum = (rect: Element) => (rect as unknown as { __data__: StackPoint }).__data__;
    fx.focus("Tanaka");
    // The old rect stays while it exits (a D3 transition); a new one takes its place in the mark.
    const old = host.rect("Tanaka", "goals");
    const fresh = Object.assign(old.cloneNode() as SVGRectElement, { __data__: datum(old) });
    old.after(fresh);
    const nodes = host.rects().filter((rect) => rect !== old);
    fx.refresh({ nodes: () => nodes, data: () => nodes.map(datum) });
    expect(document.activeElement).toBe(fresh);
    expect(fresh.getAttribute("tabindex")).toBe("0");
    key(fresh, "ArrowDown");
    expect(document.activeElement).toBe(host.rect("Lindqvist", "goals"));
    expect(events).toEqual(["hover Tanaka keyboard", "leave Tanaka", "hover Lindqvist keyboard"]);
  });

  it("holds a hover while focus is on its mark, and hands it back to a pointer still over it on blur", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const events = hoverLog(fx);
    pointer("pointerover", host.rect("Okafor", "goals"));
    // Focus from Tab arrives on the hovered mark and holds its hover, so the pointer leaving doesn't end it.
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    host.rect("Okafor", "goals").focus();
    pointer("pointerleave", host.svg);
    pointer("pointerover", host.rect("Okafor", "goals"));
    host.rect("Okafor", "goals").blur();
    expect(events).toEqual(["hover Okafor pointer"]);
    pointer("pointerleave", host.svg);
    expect(events).toEqual(["hover Okafor pointer", "leave Okafor"]);
  });

  it("moves focus from a mark that leaves to the next one, or else the previous", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const events = hoverLog(fx);
    const datum = (rect: Element) => (rect as unknown as { __data__: StackPoint }).__data__;
    fx.focus("Tanaka");
    // Leaving the selection while the host keeps its elements, as for an exit transition.
    const rest = host.rects().filter((rect) => datum(rect).data.name !== "Tanaka");
    fx.refresh({ nodes: () => rest, data: () => rest.map(datum) });
    expect(document.activeElement).toBe(host.rect("Lindqvist", "goals"));
    expect(host.rect("Lindqvist", "goals").getAttribute("tabindex")).toBe("0");
    expect(host.rect("Tanaka", "goals").hasAttribute("tabindex")).toBe(false);

    // The host removes the focused element: the last mark's goes, so the previous one takes focus.
    host.redraw([players[0]!, players[2]!]);
    fx.refresh(host.selection());
    expect(document.activeElement).toBe(host.rect("Lindqvist", "goals"));
    host.redraw([players[0]!]);
    fx.refresh(host.selection());
    expect(document.activeElement).toBe(host.rect("Okafor", "goals"));
    // No marks left: focus leaves the chart.
    host.redraw([]);
    fx.refresh(host.selection());
    expect(document.activeElement).toBe(document.body);
    expect(events).toEqual(["hover Tanaka keyboard", "leave Tanaka", "hover Lindqvist keyboard", "leave Lindqvist", "hover Okafor keyboard", "leave Okafor"]);
  });

  it("brings focus back to a redrawn mark when the browser tells the removal as a blur, as Chrome does", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const events = hoverLog(fx);
    const ring = overlayOf(host.svg).querySelector(".ec-focus-ring")!;
    fx.focus("Tanaka");
    // Chrome fires focusout, going nowhere, on a focused element the host removes, while it's still in the page.
    const removed = host.rect("Tanaka", "goals");
    removed.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    replaceRect(removed);
    fx.refresh(host.selection());
    expect(document.activeElement).toBe(host.rect("Tanaka", "goals"));
    expect(ring.getAttribute("visibility")).toBeNull();
    expect(events).toEqual(["hover Tanaka keyboard", "leave Tanaka", "hover Tanaka keyboard"]);
  });

  it("doesn't pull focus back to a redrawn mark once focus has moved on", async () => {
    const host = d3Stack();
    const button = document.body.appendChild(document.createElement("button"));
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const events = hoverLog(fx);
    // The host removes the focused element, and focus moves elsewhere before refresh().
    fx.focus("Okafor");
    replaceRect(host.rect("Okafor", "goals"));
    button.focus();
    expect(events).toEqual(["hover Okafor keyboard", "leave Okafor"]);
    fx.refresh(host.selection());
    expect(document.activeElement).toBe(button);

    // A blur to nowhere, then a redraw in a later task.
    fx.focus("Tanaka");
    host.rect("Tanaka", "goals").blur();
    await Promise.resolve();
    replaceRect(host.rect("Tanaka", "goals"));
    fx.refresh(host.selection());
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves keys with Alt, Ctrl or Meta to the browser", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    fx.focus("Okafor");
    for (const modifier of ["altKey", "ctrlKey", "metaKey"]) {
      const event = new KeyboardEvent("keydown", { key: "ArrowDown", [modifier]: true, bubbles: true, cancelable: true });
      host.rect("Okafor", "goals").dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(document.activeElement).toBe(host.rect("Okafor", "goals"));
  });

  it("hears focus without focus listeners on its SVG elements, which Chrome would make tab stops", () => {
    const add = vi.spyOn(EventTarget.prototype, "addEventListener");
    const remove = vi.spyOn(EventTarget.prototype, "removeEventListener");
    const focusCalls = (spy: { mock: { calls: unknown[][]; contexts: unknown[] } }) =>
      spy.mock.contexts.map((target, i) => ({ target, call: spy.mock.calls[i]! })).filter(({ call }) => /^(focus|blur)/.test(String(call[0])));
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    // Plot draws a new <svg> each time: the listeners move with the marks, and still not onto it.
    const next = d3Stack();
    fx.refresh(next.selection());
    document.body.appendChild(document.createElement("div")).attachShadow({ mode: "open" }).appendChild(next.svg);
    fx.refresh();
    expect(focusCalls(add).length).toBeGreaterThan(0);
    expect(focusCalls(add).filter(({ target }) => target instanceof SVGElement)).toEqual([]);
    fx.destroy();
    expect(focusCalls(remove)).toEqual(focusCalls(add));
  });

  it("works inside a shadow root", () => {
    const host = d3Stack();
    document.body.appendChild(document.createElement("div")).attachShadow({ mode: "open" }).appendChild(host.svg);
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const events: string[] = [];
    fx.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source}`));
    fx.on("leave", (e) => events.push(`leave ${e.mark.key}`));
    host.rect("Okafor", "goals").focus();
    key(host.rect("Okafor", "goals"), "ArrowDown");
    host.rect("Tanaka", "goals").blur();
    expect(events).toEqual(["hover Okafor keyboard", "leave Okafor", "hover Tanaka keyboard", "leave Tanaka"]);
  });

  it("follows the <svg> into a shadow root on refresh()", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    const events: string[] = [];
    fx.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source}`));
    document.body.appendChild(document.createElement("div")).attachShadow({ mode: "open" }).appendChild(host.svg);
    fx.refresh();
    host.rect("Okafor", "goals").focus();
    // And back out into the document.
    document.body.appendChild(host.svg);
    fx.refresh();
    host.rect("Tanaka", "goals").focus();
    expect(events).toEqual(["hover Okafor keyboard", "hover Tanaka keyboard"]);
  });

  it("without keyboard, marks aren't focusable", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), stacked);
    expect(host.rects().some((r) => r.hasAttribute("tabindex"))).toBe(false);
    fx.focus("Okafor");
    expect(document.activeElement).not.toBe(host.rect("Okafor", "goals"));
  });
});

describe("expressive: markLabel", () => {
  /** "Okafor: 16 goals, 4 assists", from the parts the adapter passes, from the baseline. */
  const label: ExpressiveOptions<StackPoint>["markLabel"] = (d, mark) =>
    `${d.data.name}: ${mark.parts.map((part) => `${part.datum[1] - part.datum[0]} ${part.series}`).join(", ")}`;
  const aria = (element: Element): string =>
    ["role", "aria-label", "aria-hidden"].map((name) => `${name}=${element.getAttribute(name) ?? "-"}`).join(" ");

  it("makes the element that takes a mark's focus an image named by it, and hides the mark's other parts", () => {
    const host = d3Stack();
    const seen: string[] = [];
    setup(host.selection(), {
      ...stacked,
      keyboard: true,
      markLabel: (d, mark) => {
        seen.push(`${mark.key}: ${mark.parts.map((part) => part.series).join(" ")}`);
        return label!(d, mark);
      }
    });
    expect(seen).toEqual(["Okafor: goals assists", "Tanaka: goals assists", "Lindqvist: goals assists"]);
    expect(aria(host.rect("Okafor", "goals"))).toBe("role=img aria-label=Okafor: 16 goals, 4 assists aria-hidden=-");
    expect(aria(host.rect("Okafor", "assists"))).toBe("role=- aria-label=- aria-hidden=true");
    // The named element is the one keyboard focus uses.
    expect(host.rect("Okafor", "goals").getAttribute("tabindex")).toBe("0");
    // Nothing else is touched: the host's groups and the <svg> keep their own.
    expect(host.groups.some((g) => g.hasAttribute("role") || g.hasAttribute("aria-hidden"))).toBe(false);
    expect(host.svg.hasAttribute("role")).toBe(false);
  });

  it("names marks again on every refresh, as their values and parts change", () => {
    const host = d3Stack();
    // Left: once Okafor's goals rect goes, the assists rect no longer touches the shared edge.
    const { fx } = setup(host.selection(), { ...stacked, baseline: "left", markLabel: label });
    host.redraw([{ name: "Okafor", goals: 17, assists: 4 }, ...players.slice(1)]);
    fx.refresh(host.selection());
    expect(host.rect("Okafor", "goals").getAttribute("aria-label")).toBe("Okafor: 17 goals, 4 assists");

    // Okafor loses the goals segment: the assists rect takes the mark's focus and its name.
    const goals = host.rect("Okafor", "goals");
    goals.remove();
    fx.refresh(host.selection());
    expect(aria(host.rect("Okafor", "assists"))).toBe("role=img aria-label=Okafor: 4 assists aria-hidden=-");
    // The rect that left gets back what the host had: nothing.
    expect(aria(goals)).toBe("role=- aria-label=- aria-hidden=-");
  });

  it("names the first element in document order of a mark described with geometry", () => {
    const host = d3Stack();
    const slices = ["Saved", "Scored"].map((outcome, i) =>
      Object.assign(el("path", { d: "M0,0L1,1" }, host.plot), { __data__: { outcome, start: i, end: i + 1 } })
    );
    setup<{ outcome: string; start: number; end: number }>(slices, {
      key: (d) => d.outcome,
      geometry: (_el, d, k) => build.arc({ key: k, cx: 0, cy: 0, inner: 70, outer: 116, start: d.start, end: d.end }),
      markLabel: (d) => `${d.outcome}: 4 shots`
    });
    expect(slices.map(aria)).toEqual(["role=img aria-label=Saved: 4 shots aria-hidden=-", "role=img aria-label=Scored: 4 shots aria-hidden=-"]);
  });

  it("leaves a mark's ARIA as the host drew it for an empty name or a throw, which is reported", () => {
    const host = d3Stack();
    host.rect("Tanaka", "goals").setAttribute("aria-label", "Tanaka: 6 goals");
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    setup(host.selection(), {
      ...stacked,
      markLabel: (d, mark) => {
        if (d.data.name === "Tanaka") return " ";
        if (d.data.name === "Lindqvist") throw new Error("label");
        return label!(d, mark);
      }
    });
    expect(aria(host.rect("Okafor", "goals"))).toBe("role=img aria-label=Okafor: 16 goals, 4 assists aria-hidden=-");
    expect(aria(host.rect("Tanaka", "goals"))).toBe("role=- aria-label=Tanaka: 6 goals aria-hidden=-");
    expect(aria(host.rect("Tanaka", "assists"))).toBe("role=- aria-label=- aria-hidden=-");
    expect(aria(host.rect("Lindqvist", "assists"))).toBe("role=- aria-label=- aria-hidden=-");
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "label" }));
  });

  it("writes no ARIA without it, and puts back the host's own on destroy", () => {
    const host = d3Stack();
    const plain = setup(host.selection(), { ...stacked, keyboard: true });
    expect(host.rects().some((r) => r.hasAttribute("role") || r.hasAttribute("aria-label") || r.hasAttribute("aria-hidden"))).toBe(false);
    plain.fx.destroy();

    // A careful host names each segment itself; the attachment names the mark, and destroy() undoes it.
    for (const rect of host.rects()) {
      const d = (rect as unknown as { __data__: StackPoint }).__data__;
      const series = (rect.parentElement as Element | null) === host.groups[0] ? "goals" : "assists";
      rect.setAttribute("role", "img");
      rect.setAttribute("aria-label", `${d.data.name}: ${d[1] - d[0]} ${series}`);
    }
    const before = host.svg.outerHTML;
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true, markLabel: label });
    expect(aria(host.rect("Okafor", "goals"))).toBe("role=img aria-label=Okafor: 16 goals, 4 assists aria-hidden=-");
    // The other part keeps the host's name, hidden.
    expect(aria(host.rect("Okafor", "assists"))).toBe("role=img aria-label=Okafor: 4 assists aria-hidden=true");
    fx.destroy();
    expect(host.svg.outerHTML).toBe(before);
  });

  it("shows the element it names even if the host hid it, and hides it again on destroy", () => {
    const host = d3Stack();
    host.rect("Okafor", "goals").setAttribute("aria-hidden", "true");
    const { fx } = setup(host.selection(), { ...stacked, markLabel: label });
    expect(aria(host.rect("Okafor", "goals"))).toBe("role=img aria-label=Okafor: 16 goals, 4 assists aria-hidden=-");
    fx.destroy();
    expect(aria(host.rect("Okafor", "goals"))).toBe("role=- aria-label=- aria-hidden=true");
  });

  it("keeps what the host writes between refreshes, and puts that back rather than what it had at first", () => {
    const host = d3Stack();
    const rect = host.rect("Okafor", "goals");
    rect.setAttribute("aria-label", "Okafor: 16 goals");
    let quiet = false;
    const { fx } = setup(host.selection(), { ...stacked, markLabel: (d, mark) => (quiet ? "" : label!(d, mark)) });
    // The host reuses the rect and writes its own name again, as a D3 join's update does.
    rect.setAttribute("aria-label", "Okafor: 17 goals");
    fx.refresh();
    expect(rect.getAttribute("aria-label")).toBe("Okafor: 16 goals, 4 assists");
    fx.destroy();
    expect(aria(rect)).toBe("role=- aria-label=Okafor: 17 goals aria-hidden=-");

    // An empty name after the host's write leaves the host's, too.
    rect.setAttribute("aria-label", "Okafor: 16 goals");
    const again = setup(host.selection(), { ...stacked, markLabel: (d, mark) => (quiet ? "" : label!(d, mark)) });
    rect.setAttribute("aria-label", "Okafor: 18 goals");
    quiet = true;
    again.fx.refresh();
    expect(aria(rect)).toBe("role=- aria-label=Okafor: 18 goals aria-hidden=-");
  });

  it("moves focus from a hidden segment to the element that carries the mark's name", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true, markLabel: label });
    const events = hoverLog(fx);
    const ring = overlayOf(host.svg).querySelector(".ec-focus-ring")!;
    // A click on Tanaka's assists rect, which is hidden: focus lands on the goals rect, named for both.
    pointer("pointerdown", host.rect("Tanaka", "assists"));
    host.rect("Tanaka", "assists").focus();
    expect(document.activeElement).toBe(host.rect("Tanaka", "goals"));
    expect(host.rect("Tanaka", "goals").getAttribute("tabindex")).toBe("0");
    expect(ring.getAttribute("visibility")).toBe("hidden");
    expect(events).toEqual([]);
    key(host.rect("Tanaka", "goals"), "ArrowDown");
    expect(document.activeElement).toBe(host.rect("Lindqvist", "goals"));
    expect(events).toEqual(["hover Lindqvist keyboard"]);
  });

  it("takes unnamed image and graphics-object roles off the host's elements around named marks, on every read, and puts them back", () => {
    const host = d3Stack();
    const roles = (): string[] =>
      [...host.groups, host.plot].map((g) => `${g.getAttribute("role") ?? "-"} ${g.getAttribute("aria-roledescription") ?? "-"}`);
    // As Vega draws its marks: an image with no name around each series, in a graphics-object.
    for (const g of host.groups) {
      g.setAttribute("role", "graphics-symbol");
      g.setAttribute("aria-roledescription", "rect mark container");
    }
    host.plot.setAttribute("role", "graphics-object");
    const before = host.svg.outerHTML;

    const plain = setup(host.selection(), { ...stacked, keyboard: true });
    expect(roles()).toEqual(["graphics-symbol rect mark container", "graphics-symbol rect mark container", "graphics-object -"]);
    plain.fx.destroy();

    const { fx } = setup(host.selection(), { ...stacked, markLabel: label });
    // The goals group holds the named parts, the assists group the hidden ones: neither keeps its role.
    expect(roles()).toEqual(["- -", "- -", "- -"]);
    // A redraw writes the role again, as Vega does, and the next read takes it off.
    host.groups[0]!.setAttribute("role", "graphics-symbol");
    fx.refresh(host.selection());
    expect(roles()).toEqual(["- -", "- -", "- -"]);

    // The assists rects go: their group holds no mark now, and gets its role back.
    const assists = host.groups[1]!.querySelectorAll("rect");
    assists.forEach((rect) => rect.remove());
    fx.refresh(host.selection());
    expect(roles()).toEqual(["- -", "graphics-symbol rect mark container", "- -"]);
    host.groups[1]!.append(...assists);
    fx.destroy();
    expect(host.svg.outerHTML).toBe(before);
  });

  it("leaves a named wrapper's role, and the host's other roles, as they are", () => {
    const host = d3Stack();
    host.groups[0]!.setAttribute("role", "group");
    host.groups[1]!.setAttribute("role", "img");
    host.groups[1]!.setAttribute("aria-label", "Assists");
    host.plot.setAttribute("role", "graphics-object");
    host.plot.setAttribute("aria-labelledby", "title");
    setup(host.selection(), { ...stacked, markLabel: label });
    expect([...host.groups, host.plot].map((g) => g.getAttribute("role"))).toEqual(["group", "img", "graphics-object"]);
  });

  it('warns once when the <svg> is role="img", which hides the marks keyboard focus reaches', () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = d3Stack();
    host.svg.setAttribute("role", "img");
    setup(host.selection(), stacked).fx.destroy();
    expect(warn).not.toHaveBeenCalled();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true });
    fx.refresh();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Make it role="group"'));
    fx.destroy();

    host.svg.setAttribute("role", "group");
    setup(host.selection(), { ...stacked, keyboard: true, markLabel: label });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("expressive: watch", () => {
  /** The MutationObserver hands over what it noted in a microtask: this waits for it. */
  const delivered = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  /** A decoration that draws the mark's walk in its layer and redraws it on every change. */
  function tracer() {
    const log: string[] = [];
    const effect: GeometryEffect = {
      kind: "geometry",
      run: async (mark, ctx) => {
        const path = ctx.layer.path(mark.slice(0, 1), { stroke: "mark", width: 1 });
        ctx.onChange((moved) => {
          log.push(`change ${moved.key}`);
          path.update(moved.slice(0, 1), { stroke: "mark", width: 1 });
        });
      },
      end: () => {},
      clear: () => {}
    };
    return { effect, log };
  }

  const line = (d: Trace) => build.line({ key: d.name, series: d.name, points: vertices(d), width: 2 });

  it("hands the host's changes on once a frame, on the chart's clock", async () => {
    const host = d3Lines();
    const decoration = tracer();
    const { fx, clock } = setup<Trace>(host.paths, { ...traced, watch: true, on: { decorate: decoration.effect } });
    const [goals, xg] = host.paths as [SVGPathElement, SVGPathElement];

    // Between two frames, the host draws the goals line three times and xG once.
    host.draw(season.slice(0, 2), [goals]);
    host.draw(season.slice(0, 3), [goals]);
    host.draw(season.slice(0, 4), [goals]);
    host.draw(season.slice(0, 3), [xg]);
    await delivered();
    expect(decoration.log).toEqual([]);
    clock.advance(16);
    expect(decoration.log).toEqual(["change goals", "change xg"]);
    expect(fx.marks().map((m) => m.outline.d)).toEqual([
      line({ name: "goals", rows: season.slice(0, 4) }).outline.d,
      line({ name: "xg", rows: season.slice(0, 3) }).outline.d
    ]);
    // The decoration redrew on the new walk.
    expect(overlayOf(host.svg).querySelector(".ec-runs path")!.getAttribute("d")).toBe(fx.marks()[0]!.slice(0, 1));

    // Nothing more until the host changes something again; then the next frame follows it.
    clock.advance(16);
    expect(clock.idle).toBe(true);
    host.draw(season, [goals]);
    await delivered();
    expect(clock.idle).toBe(false);
    clock.advance(16);
    expect(decoration.log).toEqual(["change goals", "change xg", "change goals"]);
  });

  it("on a browser's frame loop, follows each frame a host draws in its own frame callback in that frame", async () => {
    // As in a browser: callbacks asked for during a frame run in the next one, in the order asked,
    // each followed by its microtasks (the MutationObserver's among them).
    let next = 1;
    let asked = new Map<number, FrameRequestCallback>();
    let running = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => (asked.set(next, callback), next++));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => asked.delete(id) || running.delete(id));
    let time = 0;
    const frame = async (): Promise<void> => {
      time += 16;
      running = asked;
      asked = new Map();
      for (const [id, callback] of running) {
        if (!running.has(id)) continue;
        callback(time);
        await delivered();
      }
    };

    const host = d3Stack([players[0]!]);
    const decoration = tracer();
    setup(host.selection(), { ...stacked, watch: true, on: { decorate: decoration.effect } }, { clock: createClock() });
    // A D3 timer's frame: it writes the transition's attributes, then asks for its next frame.
    let width = 160;
    const draw = (): void => {
      width += 10;
      host.rect("Okafor", "goals").setAttribute("width", String(width));
      host.rect("Okafor", "assists").setAttribute("x", String(width));
      if (width < 260) requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);

    // What each frame paints: the bar's length, and the length of the walk the decoration drew.
    const painted: [number, number][] = [];
    for (let i = 0; i < 12; i++) {
      await frame();
      const drawn = measurePath(overlayOf(host.svg).querySelector(".ec-runs path")!.getAttribute("d")!).end!.x;
      painted.push([width + 40, drawn]);
    }
    // The first frame is heard after it's drawn; from then on, each frame is followed in the frame
    // it's drawn in. Once the host stops, a quiet frame lets the clock go.
    expect(painted[0]).toEqual([210, 200]);
    for (const [bar, walk] of painted.slice(1)) expect(walk).toBe(bar);
    expect(asked.size).toBe(0);
  });

  it("reads only the marks that changed, fires no events and doesn't interrupt a hover", async () => {
    const host = d3Lines();
    const [goals, xg] = host.paths as [SVGPathElement, SVGPathElement];
    const reads: string[] = [];
    const story = recorder();
    const { fx, clock } = setup<Trace>(host.paths, {
      key: traced.key,
      geometry: (element, d, key) => {
        reads.push(`geometry ${key}`);
        return traced.geometry!(element, d, key);
      },
      samples: (d, mark) => {
        reads.push(`samples ${mark.key}`);
        return traced.samples!(d, mark);
      },
      value: (d) => {
        reads.push(`value ${d.name}`);
        return d.rows.length;
      },
      markLabel: (d) => {
        reads.push(`label ${d.name}`);
        return d.name;
      },
      watch: true,
      on: { hover: story.effect }
    });
    const events: string[] = [];
    for (const type of ["enter", "update", "exit", "hover", "leave"] as const) fx.on(type, (e) => events.push(`${type} ${e.mark.key}`));
    pointer("pointerover", xg);
    expect(events).toEqual(["hover xg"]);
    reads.length = 0;

    host.draw(season.slice(0, 3), [goals]);
    await delivered();
    clock.advance(16);
    // Its row, geometry and samples: values and names are refresh()'s.
    expect(reads).toEqual(["geometry goals", "samples goals"]);
    expect(events).toEqual(["hover xg"]);
    // The hover on xG goes on, and follows xG when it moves.
    host.draw(season.slice(0, 3), [xg]);
    await delivered();
    clock.advance(16);
    expect(story.log).toEqual(["run xg", "change xg"]);
    expect(events).toEqual(["hover xg"]);
  });

  it("gives data effects the rows the host binds each frame, and tells marks that read a needed series", async () => {
    const host = d3Lines();
    const [goals, xg] = host.paths as [SVGPathElement, SVGPathElement];
    const needsXg = dataRecorder(["xg"]);
    const { clock } = setup<Trace>(host.paths, { ...traced, watch: true, on: { decorate: needsXg.effect } });
    needsXg.seen.length = 0;

    // xG alone is redrawn: goals reads it through related("xg"), so it follows too.
    host.draw(season.slice(0, 3), [xg]);
    await delivered();
    clock.advance(16);
    expect(needsXg.seen.map((entry) => entry.key)).toEqual(["xg", "goals"]);
    expect(needsXg.last("xg")!.samples.map((s) => s.at)).toEqual([1, 2, 3]);
    expect(needsXg.last("goals")!.related("xg")!.samples.map((s) => s.at)).toEqual([1, 2, 3]);

    // Nothing needs the goals line, so it moves alone, with its new row.
    needsXg.seen.length = 0;
    host.draw(season.slice(0, 2), [goals]);
    await delivered();
    clock.advance(16);
    expect(needsXg.seen.map((entry) => entry.key)).toEqual(["goals"]);
    expect((needsXg.last("goals")!.datum as Trace).rows).toEqual(season.slice(0, 2));
  });

  it("moves the overlay with a common ancestor the host animates, and reads nothing again", async () => {
    const host = d3Lines();
    const decoration = tracer();
    const { fx, clock } = setup<Trace>(host.paths, { ...traced, watch: true, keyboard: true, on: { decorate: decoration.effect } });
    fx.focus("goals");
    const overlay = overlayOf(host.svg);
    const ring = overlay.querySelector(".ec-focus-ring")!;
    const before = { marks: fx.marks(), runs: overlay.querySelector(".ec-runs")!.innerHTML, ring: ring.getAttribute("d") };
    expect(ring.getAttribute("visibility")).not.toBe("hidden");
    expect(before.ring).toBeTruthy();
    expect(overlay.getAttribute("transform")).toBe("matrix(1 0 0 1 30 20)");

    // The host slides its plot group right over two frames.
    for (const x of [40, 50]) {
      host.plot.setAttribute("transform", `translate(${x},20)`);
      await delivered();
      clock.advance(16);
      expect(overlay.getAttribute("transform")).toBe(`matrix(1 0 0 1 ${x} 20)`);
    }
    // The marks' geometry is in the plot's coordinates, so it didn't change: the decorations and the
    // ring moved with the overlay.
    expect(fx.marks()).toEqual(before.marks);
    expect(decoration.log).toEqual([]);
    expect(overlay.querySelector(".ec-runs")!.innerHTML).toBe(before.runs);
    expect(ring.getAttribute("d")).toBe(before.ring);
  });

  it("reads again every mark inside a group the host animates below the common ancestor", async () => {
    const host = d3Stack();
    const decoration = tracer();
    const { fx, clock } = setup(host.selection(), { ...stacked, watch: true, on: { decorate: decoration.effect } });
    // The host slides the assists group 5 px right, as a transition's last frame would leave it.
    host.groups[1]!.setAttribute("transform", "translate(5,0)");
    await delivered();
    clock.advance(16);
    expect(decoration.log).toEqual(["change Okafor", "change Tanaka", "change Lindqvist"]);
    const okafor = fx.marks()[0]!;
    expect(okafor.segments!.map((s) => s.end.x)).toEqual([160, 205]);
    // The decoration redrew on the new walk.
    expect(overlayOf(host.svg).querySelector(".ec-runs path")!.getAttribute("d")).toBe(okafor.slice(0, 1));
  });

  it("hears style on an ancestor too, and reads only the marks inside it", async () => {
    const host = d3Lines();
    const [goals, xg] = host.paths as [SVGPathElement, SVGPathElement];
    // xG drawn in a group of its own.
    const group = el("g", { class: "xg" }, host.plot);
    group.appendChild(xg);
    const decoration = tracer();
    const { clock } = setup<Trace>([goals, xg], { ...traced, watch: true, on: { decorate: decoration.effect } });
    group.style.setProperty("opacity", "0.5");
    await delivered();
    clock.advance(16);
    expect(decoration.log).toEqual(["change xg"]);
  });

  it("puts the marks in visual order again as the host moves them", async () => {
    const host = d3Stack();
    const { fx, clock } = setup(host.selection(), { ...stacked, watch: true, keyboard: true });
    // A sort's last frame: Tanaka's row and Okafor's swap places.
    for (const series of SERIES) {
      host.rect("Okafor", series).setAttribute("y", "41");
      host.rect("Tanaka", series).setAttribute("y", "7");
    }
    await delivered();
    clock.advance(16);
    expect(fx.marks().map((m) => m.key)).toEqual(["Tanaka", "Okafor", "Lindqvist"]);
    fx.focus("Tanaka");
    key(host.rect("Tanaka", "goals"), "ArrowDown");
    expect(document.activeElement).toBe(host.rect("Okafor", "goals"));
  });

  it("finds the shared baseline again, so a bar that ends a transition on the other side of it grows the other way", async () => {
    // Three bars from a zero line at x = 100; the first is on its way from +60 to -40.
    const svg = el("svg", { width: 300, height: 120 }, document.body);
    const plot = el("g", { transform: "translate(20,10)" }, svg);
    const bars = [60, 30, 40].map((width, i) => Object.assign(el("rect", { x: 100, y: i * 30, width, height: 20 }, plot), { __data__: { name: `p${i}` } }));
    const decoration = tracer();
    const { fx, clock } = setup<{ name: string }>(bars, { key: (d) => d.name, watch: true, on: { decorate: decoration.effect } });
    const first = () => fx.marks().find((mark) => mark.key === "p0")!;
    const frame = async (x: number, width: number): Promise<void> => {
      bars[0]!.setAttribute("x", String(x));
      bars[0]!.setAttribute("width", String(width));
      await delivered();
      clock.advance(16);
    };
    // Mid-transition no edge is on the line, so the bar keeps growing from the left.
    await frame(80, 50);
    expect([first().start.x, first().end.x]).toEqual([80, 130]);
    // At the end its right edge is on the line: it grows from there, leftwards, as a full read finds.
    await frame(60, 40);
    expect([first().start.x, first().end.x]).toEqual([100, 60]);
    expect(fx.marks().slice(1).map((mark) => mark.start.x)).toEqual([100, 100]);
    expect(overlayOf(svg).querySelector('.ec-run[data-key="p0"] path')!.getAttribute("d")).toBe(first().slice(0, 1));
    fx.refresh();
    expect([first().start.x, first().end.x]).toEqual([100, 60]);
  });

  it("leaves events to refresh(), called when the host joins new data, and keeps values and names until then", async () => {
    const host = d3Stack();
    const story = recorder();
    const label = vi.fn((d: StackPoint) => `${d.data.name}: ${d.data.goals} goals`);
    const value = (d: StackPoint): number => d[1] - d[0];
    const { fx, clock } = setup(host.selection(), { ...stacked, value, markLabel: label, watch: true, on: { update: story.effect } });
    const updates: string[] = [];
    fx.on("update", (e) => updates.push(`${e.mark.key} from ${e.from.length}`));
    label.mockClear();

    // The host joins Okafor's 18 goals and calls refresh() before its transition starts...
    const next = players.map((p) => (p.name === "Okafor" ? { ...p, goals: 18 } : p));
    for (const series of SERIES) {
      for (const row of next) {
        const rect = host.rect(row.name, series);
        const x0 = series === "goals" ? 0 : row.goals;
        Object.assign(rect, { __data__: Object.assign([x0, x0 + row[series]], { data: row }) });
      }
    }
    fx.refresh();
    expect(updates).toEqual(["Okafor from 200"]);
    expect(label).toHaveBeenCalledTimes(3);
    expect(host.rect("Okafor", "goals").getAttribute("aria-label")).toBe("Okafor: 18 goals");

    // ...then draws its frames, which watch follows without an event or a name.
    for (const width of [168, 176, 180]) {
      host.rect("Okafor", "goals").setAttribute("width", String(width));
      host.rect("Okafor", "assists").setAttribute("x", String(width));
      await delivered();
      clock.advance(16);
    }
    expect(fx.marks()[0]!.length).toBe(220);
    expect(updates).toEqual(["Okafor from 200"]);
    expect(label).toHaveBeenCalledTimes(3);
    // refresh() follows the update with a change, as it always does; then one change a frame.
    expect(story.log).toEqual(["run Okafor from 200", "change Okafor", "change Okafor", "change Okafor", "change Okafor"]);
    // With the values unchanged since that refresh(), a refresh() at the end is no update.
    fx.refresh();
    expect(updates).toEqual(["Okafor from 200"]);
  });

  it("reports a mark it can't read in a frame and changes nothing", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const host = d3Stack();
    const decoration = tracer();
    const { fx, clock } = setup(host.selection(), { ...stacked, watch: true, on: { decorate: decoration.effect } });
    const before = fx.marks();
    host.groups[1]!.setAttribute("transform", "rotate(30)");
    await delivered();
    clock.advance(16);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/rotated or skewed/) }));
    expect(fx.marks()).toEqual(before);
    expect(decoration.log).toEqual([]);
  });

  it("watches what refresh() reads, and drops changes it has already read", async () => {
    const host = d3Stack();
    const decoration = tracer();
    const { fx, clock } = setup(host.selection(), { ...stacked, watch: true, on: { decorate: decoration.effect } });
    host.redraw(players, 8);
    await delivered();
    expect(clock.idle).toBe(false);
    fx.refresh();
    expect(decoration.log).toEqual(["change Okafor", "change Tanaka", "change Lindqvist"]);
    expect(clock.idle).toBe(true);

    // The host replaces Tanaka's rects (as Vega does): refresh() watches the new ones, not the old.
    const old = host.rect("Tanaka", "goals");
    for (const series of SERIES) replaceRect(host.rect("Tanaka", series));
    fx.refresh(host.selection());
    decoration.log.length = 0;
    old.setAttribute("width", "10");
    await delivered();
    expect(clock.idle).toBe(true);
    host.rect("Tanaka", "goals").setAttribute("width", "40");
    await delivered();
    clock.advance(16);
    expect(decoration.log).toEqual(["change Tanaka"]);
  });

  it("destroy() disconnects it", async () => {
    const host = d3Lines();
    const decoration = tracer();
    const { fx, clock } = setup<Trace>(host.paths, { ...traced, watch: true, on: { decorate: decoration.effect } });
    // A frame is waiting when it's destroyed: it's cancelled.
    host.draw(season.slice(0, 3));
    await delivered();
    expect(clock.idle).toBe(false);
    fx.destroy();
    expect(clock.idle).toBe(true);
    host.draw(season.slice(0, 2));
    host.plot.setAttribute("transform", "translate(0,0)");
    await delivered();
    expect(clock.idle).toBe(true);
    expect(decoration.log).toEqual([]);
  });
});

describe("expressive: update({ on })", () => {
  const runs = (log: readonly string[]) => log.filter((entry) => !entry.startsWith("change"));
  /** An effect whose runs go on until they're cleared. */
  const held = (log: string[]): GeometryEffect => ({
    kind: "geometry",
    run(mark) {
      log.push(`run ${mark.key}`);
      return new Promise(() => {});
    },
    end: (mark) => void log.push(`end ${mark.key}`),
    clear: () => void log.push("clear")
  });
  const tabStops = (elements: readonly Element[]) => elements.map((element) => element.getAttribute("tabindex"));

  it.each(["pointer", "keyboard"] as const)(
    "swaps the effects with a mark hovered by the %s: decorate starts again on every mark, the hover replays with the new effect, and nothing enters",
    async (by) => {
      const host = d3Stack();
      const decorate = recorder();
      const hover = recorder();
      const enter = recorder();
      const { fx } = setup(host.selection(), { ...stacked, keyboard: true, dim: true, on: { decorate: decorate.effect, hover: hover.effect, enter: enter.effect } });
      if (by === "pointer") pointer("pointerover", host.rect("Tanaka", "assists"));
      else fx.focus("Tanaka");
      const stops = tabStops(host.rects());
      const ring = overlayOf(host.svg).querySelector(".ec-focus-ring")!.getAttribute("visibility");
      const events: string[] = [];
      for (const type of ["enter", "update", "exit", "hover", "leave"] as const) fx.on(type, (event) => events.push(`${type} ${event.mark.key}`));
      for (const each of [decorate, hover, enter]) each.log.length = 0;

      const nextDecorate = recorder();
      const nextHover = recorder();
      const done = fx.update({ on: { decorate: nextDecorate.effect, hover: nextHover.effect, enter: enter.effect } });
      // At once: an attachment has no change to settle.
      expect(runs(nextDecorate.log)).toEqual(["run Okafor", "run Tanaka", "run Lindqvist"]);
      await expect(done).resolves.toBeUndefined();
      expect(runs(decorate.log)).toEqual(["clear", "clear", "clear"]);
      expect(runs(hover.log)).toEqual(["clear"]);
      expect(runs(nextHover.log)).toEqual(["run Tanaka"]);
      // The same enter effect keeps its runs.
      expect(enter.log).toEqual([]);
      expect(events).toEqual([]);
      // Still hovered, with focus and the tab stop where they were.
      expect(host.rect("Okafor", "goals").classList.contains("ec-dimmed")).toBe(true);
      expect(host.rect("Tanaka", "goals").classList.contains("ec-dimmed")).toBe(false);
      expect(document.activeElement).toBe(by === "keyboard" ? host.rect("Tanaka", "goals") : document.body);
      expect(tabStops(host.rects())).toEqual(stops);
      expect(overlayOf(host.svg).querySelector(".ec-focus-ring")!.getAttribute("visibility")).toBe(ring);

      // The new hover plays from then on, and leaves as the old one did.
      if (by === "pointer") pointer("pointerleave", host.svg);
      else key(host.rect("Tanaka", "goals"), "Escape");
      expect(runs(nextHover.log)).toEqual(["run Tanaka", "clear"]);
      expect(events).toEqual(["leave Tanaka"]);
      if (by === "pointer") pointer("pointerover", host.rect("Lindqvist", "goals"));
      else key(host.rect("Tanaka", "goals"), "ArrowDown");
      expect(runs(nextHover.log)).toEqual(["run Tanaka", "clear", "run Lindqvist"]);
      expect(hover.log).toEqual(["clear"]);
    }
  );

  it("draws a new enter, update or exit effect's end state where the old one's runs were, and an exit still ends", async () => {
    const host = d3Stack();
    const log: string[] = [];
    const enter = recorder();
    const { fx } = setup(host.selection(), { ...stacked, value: (d) => d[1] - d[0], on: { enter: enter.effect, update: held(log), exit: held(log) } });
    // Tanaka's goals change and Lindqvist leaves: an update run and an exit run, both still going.
    host.redraw([players[0]!, { ...players[1]!, goals: 8 }]);
    fx.refresh(host.selection());
    expect(log).toEqual(["run Lindqvist", "run Tanaka"]);
    const exits: string[] = [];
    fx.on("exit", (e) => exits.push(e.mark.key));
    // Lindqvist's enter run ended with its exit.
    expect(runs(enter.log)).toEqual(["run Okafor", "run Tanaka", "run Lindqvist", "clear"]);
    enter.log.length = 0;

    const nextEnter = recorder();
    const nextUpdate = recorder();
    const nextExit = recorder();
    await fx.update({ on: { enter: nextEnter.effect, update: nextUpdate.effect, exit: nextExit.effect } });
    expect(runs(enter.log)).toEqual(["clear", "clear"]);
    expect(nextEnter.log).toEqual(["end Okafor", "end Tanaka"]);
    expect(runs(nextUpdate.log)).toEqual(["end Tanaka"]);
    // Its exit ends with the new effect's end state, and the mark is gone.
    expect(runs(nextExit.log)).toEqual(["end Lindqvist", "clear"]);
    expect(log).toEqual(["run Lindqvist", "run Tanaka", "clear", "clear"]);
    expect(exits).toEqual([]);
    expect(fx.marks().map((mark) => mark.key)).toEqual(["Okafor", "Tanaka"]);
    // Lindqvist's exit is done: back mid-way, it would keep its record and enter again.
    host.redraw(players);
    fx.refresh(host.selection());
    expect(nextEnter.log).toEqual(["end Okafor", "end Tanaka", "run Lindqvist"]);
  });

  it("keeps a slot given the same effect or preset name, clears a slot left out, and does nothing with no on", async () => {
    const presets = createRegistry<PresetFactory>({ kind: "preset" });
    let made = 0;
    presets.register("probe", () => {
      made++;
      return recorder().effect;
    });
    const host = d3Stack();
    const decorate = recorder();
    const { fx } = setup(host.selection(), { ...stacked, on: { hover: "probe", decorate: decorate.effect } }, { presets });
    await fx.update({ on: { hover: "probe", decorate: decorate.effect } });
    expect(made).toBe(1);
    expect(runs(decorate.log)).toEqual(["run Okafor", "run Tanaka", "run Lindqvist"]);
    await fx.update({});
    expect(runs(decorate.log)).toEqual(["run Okafor", "run Tanaka", "run Lindqvist"]);
    await fx.update({ on: { hover: "probe" } });
    expect(runs(decorate.log)).toEqual(["run Okafor", "run Tanaka", "run Lindqvist", "clear", "clear", "clear"]);
    expect(made).toBe(1);
  });

  it("rejects an unknown preset name, a series the marks don't have, or another option, changing nothing", async () => {
    const host = d3Stack();
    const hover = recorder();
    const { fx } = setup(host.selection(), { ...stacked, on: { hover: hover.effect } });
    const next = recorder();
    await expect(fx.update({ on: { hover: "nope" } })).rejects.toThrow(/Unknown preset "nope"/);
    await expect(fx.update({ on: { hover: next.effect, decorate: dataRecorder(["xg"]).effect } })).rejects.toThrow(
      /^expressive: on\.decorate needs the series "xg", but the marks' series are "goals", "assists"\./
    );
    // @ts-expect-error only `on` can change.
    await expect(fx.update({ on: { hover: next.effect }, dim: true })).rejects.toThrow(new TypeError("expressive: `dim` can't be changed by update() yet. Only `on` can."));
    // @ts-expect-error update() takes options.
    await expect(fx.update(null)).rejects.toThrow(/update\(\) needs options/);
    pointer("pointerover", host.rect("Okafor", "goals"));
    expect(hover.log).toEqual(["run Okafor"]);
    expect(next.log).toEqual([]);
  });

  it("with motion off, draws the new effects' end state, with no frames", async () => {
    const host = d3Stack();
    const { fx, clock } = setup(host.selection(), { ...stacked, keyboard: true, on: { decorate: recorder().effect } }, { motion: quietMotion("off") });
    fx.focus("Okafor");
    const decorate = recorder();
    const hover = recorder();
    await fx.update({ on: { decorate: decorate.effect, hover: hover.effect } });
    expect(runs(decorate.log)).toEqual(["end Okafor", "end Tanaka", "end Lindqvist"]);
    expect(runs(hover.log)).toEqual(["end Okafor"]);
    expect(clock.idle).toBe(true);
  });

  it("finds the series a new data effect reads, and follows it, and stops when the effect goes", async () => {
    const later = season.map((row) => ({ ...row, xg: row.xg + 1 }));
    const host = d3Lines();
    const plain = dataRecorder();
    const { fx } = setup<Trace>(host.paths, { ...traced, on: { decorate: plain.effect } });
    const needsXg = dataRecorder(["xg"]);
    await fx.update({ on: { decorate: needsXg.effect } });
    expect(needsXg.seen.map((entry) => entry.key)).toEqual(["goals", "xg"]);
    expect(needsXg.last("goals")!.related("xg")!.samples.map((s) => s.value)).toEqual(season.map((row) => row.xg));
    // The host redraws xG alone: the goals line is told too, with data that sees it.
    needsXg.seen.length = 0;
    host.draw(later, [host.paths[1]!]);
    fx.refresh();
    expect(needsXg.seen.map((entry) => entry.key)).toEqual(["xg", "goals"]);
    expect(needsXg.last("goals")!.related("xg")!.samples.map((s) => s.value)).toEqual(later.map((row) => row.xg));

    // Swapped back: the goals line isn't told when xG alone changes.
    await fx.update({ on: { decorate: plain.effect } });
    plain.seen.length = 0;
    host.draw(season, [host.paths[1]!]);
    fx.refresh();
    expect(plain.seen.map((entry) => entry.key)).toEqual(["xg"]);
  });

  it("swaps a D3 pie's effects in place: the slice in focus keeps it, and the tab stop stays", async () => {
    type Slice = { outcome: string; start: number; end: number };
    const svg = el("svg", {}, document.body);
    const g = el("g", { transform: "translate(120,120)" }, svg);
    const slices: Slice[] = [
      { outcome: "Goal", start: 0, end: 0.9 },
      { outcome: "Saved", start: 0.9, end: 2.6 },
      { outcome: "Off target", start: 2.6, end: 4.9 },
      { outcome: "Blocked", start: 4.9, end: 2 * Math.PI }
    ];
    const paths = slices.map((d) => Object.assign(el("path", { d: "M0,0L1,1", fill: "#2a78d6" }, g), { __data__: d }));
    const hover = recorder();
    const { fx } = setup<Slice>(paths, {
      key: (d) => d.outcome,
      keyboard: true,
      geometry: (_el, d, k) => build.arc({ key: k, cx: 0, cy: 0, inner: 70, outer: 116, start: d.start, end: d.end }),
      on: { hover: hover.effect }
    });
    fx.focus("Off target");
    expect(tabStops(paths)).toEqual(["-1", "-1", "0", "-1"]);
    const next = recorder();
    await fx.update({ on: { hover: next.effect } });
    expect(document.activeElement).toBe(paths[2]);
    expect(tabStops(paths)).toEqual(["-1", "-1", "0", "-1"]);
    expect(runs(hover.log)).toEqual(["run Off target", "clear"]);
    expect(runs(next.log)).toEqual(["run Off target"]);
    key(paths[2]!, "ArrowRight");
    expect(document.activeElement).toBe(paths[3]);
    expect(runs(next.log)).toEqual(["run Off target", "clear", "run Blocked"]);
  });

  it("swaps the hover effect of an attachment showing a link's hover, which replays with it", async () => {
    const first = d3Stack();
    const second = d3Stack();
    const a = setup(first.selection(), stacked).fx;
    const hover = recorder();
    const b = setup(second.selection(), { ...stacked, on: { hover: hover.effect } }).fx;
    link([a, b]);
    const events = hoverLog(b);
    pointer("pointerover", first.rect("Tanaka", "goals"));
    expect(events).toEqual(["hover Tanaka linked"]);
    const next = recorder();
    await b.update({ on: { hover: next.effect } });
    expect(runs(hover.log)).toEqual(["run Tanaka", "clear"]);
    expect(runs(next.log)).toEqual(["run Tanaka"]);
    pointer("pointerleave", first.svg);
    expect(events).toEqual(["hover Tanaka linked", "leave Tanaka"]);
    expect(runs(next.log)).toEqual(["run Tanaka", "clear"]);
    // Its own hover tells the link as before.
    const aEvents = hoverLog(a);
    pointer("pointerover", second.rect("Okafor", "goals"));
    expect(aEvents).toEqual(["hover Okafor linked"]);
  });

  it("resolves, changing nothing, once destroyed", async () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), stacked);
    fx.destroy();
    const before = host.svg.outerHTML;
    await expect(fx.update({ on: { hover: "nope" } })).resolves.toBeUndefined();
    expect(host.svg.outerHTML).toBe(before);
  });
});

describe("expressive: leave()", () => {
  it("ends a pointer hover as the pointer leaving would: emphasis, dimming, hover effects and their leave events", () => {
    const host = d3Stack();
    const hover = recorder();
    const { fx } = setup(host.selection(), { ...stacked, dim: true, on: { hover: hover.effect } });
    const events = hoverLog(fx);
    pointer("pointerover", host.rect("Tanaka", "goals"));
    expect(host.rect("Tanaka", "goals").style.getPropertyValue("fill")).toMatch(BLUE);
    fx.leave();
    expect(events).toEqual(["hover Tanaka pointer", "leave Tanaka"]);
    expect(hover.log).toEqual(["run Tanaka", "clear"]);
    expect(host.rects().some((rect) => rect.classList.contains("ec-dimmed"))).toBe(false);
    expect(host.rect("Tanaka", "goals").style.getPropertyValue("fill")).toBe("");
    // The pointer hovers again when it next moves onto a mark, the same one too.
    pointer("pointerover", host.rect("Tanaka", "goals"));
    expect(hover.log).toEqual(["run Tanaka", "clear", "run Tanaka"]);
  });

  it("ends a keyboard hover, with focus and its ring kept, as after Escape", () => {
    const host = d3Stack();
    const hover = recorder();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true, dim: true, on: { hover: hover.effect } });
    const events = hoverLog(fx);
    fx.focus("Tanaka");
    fx.leave();
    expect(events).toEqual(["hover Tanaka keyboard", "leave Tanaka"]);
    expect(hover.log).toEqual(["run Tanaka", "clear"]);
    expect(host.rect("Okafor", "goals").classList.contains("ec-dimmed")).toBe(false);
    expect(document.activeElement).toBe(host.rect("Tanaka", "goals"));
    expect(overlayOf(host.svg).querySelector(".ec-focus-ring")!.getAttribute("visibility")).toBeNull();
    // The arrows hover again.
    key(host.rect("Tanaka", "goals"), "ArrowDown");
    expect(events.slice(2)).toEqual(["hover Lindqvist keyboard"]);
  });

  it("ends a link's hover shown on it, and tells the link when it ends its own", () => {
    const first = d3Stack();
    const second = d3Stack();
    const a = setup(first.selection(), { ...stacked, dim: true }).fx;
    const b = setup(second.selection(), { ...stacked, dim: true }).fx;
    link([a, b]);
    const aEvents = hoverLog(a);
    const bEvents = hoverLog(b);
    pointer("pointerover", first.rect("Tanaka", "goals"));
    // b shows the link's hover: leave() ends it there, and a's own goes on.
    b.leave();
    expect(bEvents).toEqual(["hover Tanaka linked", "leave Tanaka"]);
    expect(second.rect("Okafor", "goals").classList.contains("ec-dimmed")).toBe(false);
    expect(aEvents).toEqual(["hover Tanaka pointer"]);
    expect(first.rect("Okafor", "goals").classList.contains("ec-dimmed")).toBe(true);
    // a ends its own: the link hears it.
    pointer("pointerover", first.rect("Okafor", "goals"));
    expect(bEvents.slice(2)).toEqual(["hover Okafor linked"]);
    a.leave();
    expect(aEvents.slice(1)).toEqual(["leave Tanaka", "hover Okafor pointer", "leave Okafor"]);
    expect(bEvents.slice(3)).toEqual(["leave Okafor"]);
  });

  it("does nothing with nothing hovered, or once destroyed", () => {
    const host = d3Stack();
    const hover = recorder();
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true, on: { hover: hover.effect } });
    const events = hoverLog(fx);
    fx.leave();
    expect(events).toEqual([]);
    pointer("pointerover", host.rect("Okafor", "goals"));
    fx.destroy();
    expect(() => fx.leave()).not.toThrow();
    expect(events).toEqual(["hover Okafor pointer"]);
    expect(hover.log).toEqual(["run Okafor", "clear"]);
  });
});

describe("expressive: circles and shapes", () => {
  interface Dot {
    name: string;
    x: number;
    y: number;
    r: number;
    goals: number;
  }
  const dots: Dot[] = [
    { name: "Okafor", x: 160, y: 40, r: 6, goals: 16 },
    { name: "Tanaka", x: 60, y: 100, r: 4, goals: 6 },
    { name: "Lindqvist", x: 100, y: 70, r: 5, goals: 10 }
  ];
  const byName: ExpressiveOptions<Dot> = { key: (d) => d.name };
  const named: ExpressiveOptions<string> = { key: (d) => d };

  /** A margin group, and the elements `draw` puts in it, each with its row on __data__. */
  function host<T>(draw: (plot: SVGGElement) => [T, SVGElement][]) {
    const svg = el("svg", { width: 400, height: 240 }, document.body);
    const plot = el("g", { transform: "translate(40,20)", fill: "#2a78d6", stroke: "#2a78d6", "stroke-width": 2 }, svg);
    const elements = draw(plot).map(([datum, element]) => Object.assign(element, { __data__: datum }));
    return { svg, plot, elements };
  }

  /** A D3 scatter: one circle a row, at its x and y, in the margin group. */
  const scatter = (rows: Dot[] = dots) => host((plot) => rows.map((d) => [d, el("circle", { cx: d.x, cy: d.y, r: d.r }, plot)]));

  /** What can be compared of a mark: everything but its functions. */
  const seen = (mark: MarkGeometry) => ({
    key: mark.key,
    series: mark.series,
    d: mark.outline.d,
    closed: mark.outline.closed,
    length: mark.length,
    thickness: mark.thickness,
    bounds: mark.bounds,
    center: mark.center,
    start: mark.start,
    end: mark.end
  });

  it("reads a <circle> as a point at its centre with its radius, in document order", () => {
    const { elements } = scatter();
    const { fx } = setup<Dot>(elements, byName);
    expect(fx.marks().map(seen)).toEqual(dots.map((d) => seen(build.point({ key: d.name, x: d.x, y: d.y, r: d.r }))));
  });

  it("reads a circle through its transforms, turned and evenly scaled, and as a shape, an ellipse, under an uneven scale or a skew", () => {
    // D3's other way to place a dot: a group a row, moved there, with the circle at its origin.
    const { elements } = host((plot) =>
      ["translate(100,50) rotate(30) scale(1.5)", "translate(200,50) scale(2,1)", "translate(300,50) skewX(20)"].map((transform, i) => [
        `dot ${i}`,
        el("circle", { cx: 0, cy: 0, r: 10 }, el("g", { transform }, plot))
      ])
    );
    const { fx } = setup<string>(elements, named);
    const [turned, wide, skewed] = fx.marks() as [MarkGeometry, MarkGeometry, MarkGeometry];
    expect(seen(turned)).toEqual(seen(build.point({ key: "dot 0", x: 100, y: 50, r: 15 })));
    expect(seen(wide)).toEqual(seen(build.shape({ key: "dot 1", d: "M10,0A10,10 0 0 1 -10,0A10,10 0 0 1 10,0Z", matrix: [2, 0, 0, 1, 200, 50] })));
    expect(wide).toMatchObject({ length: 0, center: { x: 200, y: 50 }, outline: { closed: true } });
    expect(wide.bounds).toEqual({ x: 180, y: 40, width: 40, height: 20 });
    expect(seen(skewed)).toEqual(seen(build.shape({ key: "dot 2", d: "M10,0A10,10 0 0 1 -10,0A10,10 0 0 1 10,0Z", matrix: matrix.multiply(matrix.translate(300, 50), [1, 0, Math.tan(Math.PI / 9), 1, 0, 0]) })));
  });

  it("reads a circle with no radius as a dot, which a host may grow from 0", () => {
    const { elements } = host((plot) => [
      ["new", el("circle", { cx: 50, cy: 60, r: 0 }, plot)],
      ["stretched", el("circle", { cx: 10, cy: 10, r: 0, transform: "scale(3,1)" }, plot)]
    ]);
    const { fx } = setup<string>(elements, named);
    expect(fx.marks().map(seen)).toEqual([seen(build.point({ key: "new", x: 50, y: 60, r: 0 })), seen(build.point({ key: "stretched", x: 30, y: 10, r: 0 }))]);
  });

  it("reads <path>, <line>, <polyline>, <polygon> and <ellipse> through describe.shape, from their outlines as path data", () => {
    const shapes: [string, string, Record<string, string | number>, string][] = [
      ["curve", "path", { d: "M0,100C40,0 80,0 120,100" }, "M0,100C40,0 80,0 120,100"],
      ["area", "path", { d: "M0,100L60,20L120,100Z" }, "M0,100L60,20L120,100Z"],
      ["line", "line", { x1: 0, y1: 0, x2: 100, y2: 50 }, "M0,0L100,50"],
      ["polyline", "polyline", { points: "0,0 50,20 100,0" }, "M0,0L50,20L100,0"],
      ["polygon", "polygon", { points: "0,0 50,20 100,0" }, "M0,0L50,20L100,0Z"],
      ["ellipse", "ellipse", { cx: 60, cy: 40, rx: 30, ry: 20 }, "M90,40A30,20 0 0 1 30,40A30,20 0 0 1 90,40Z"]
    ];
    const { elements } = host((plot) => shapes.map(([key, tag, attributes]) => [key, el(tag as "path", attributes, plot)]));
    const { fx } = setup<string>(elements, named);
    // An open shape is as wide as its stroke: 2 px, from the margin group.
    expect(fx.marks().map(seen)).toEqual(shapes.map(([key, , , d]) => seen(build.shape({ key, d, width: 2 }))));
    expect(fx.marks().map((mark) => mark.outline.closed)).toEqual([false, true, false, false, true, true]);
  });

  it("moves a shape through its transforms, arcs too", () => {
    const { elements } = host((plot) => [
      ["ring", el("ellipse", { cx: 0, cy: 0, rx: 30, ry: 20, transform: "rotate(90)" }, el("g", { transform: "translate(100,80)" }, plot))],
      ["tick", el("line", { x1: 0, y1: 0, x2: 10, y2: 0, transform: "translate(5,5) scale(3)" }, plot)]
    ]);
    const { fx } = setup<string>(elements, named);
    const [ring, tick] = fx.marks() as [MarkGeometry, MarkGeometry];
    expect(seen(ring)).toEqual(seen(build.shape({ key: "ring", d: "M30,0A30,20 0 0 1 -30,0A30,20 0 0 1 30,0Z", matrix: matrix.multiply(matrix.translate(100, 80), matrix.rotate(Math.PI / 2)) })));
    expect(ring.bounds).toEqual({ x: 80, y: 50, width: 40, height: 60 });
    expect(tick.start).toEqual({ x: 5, y: 5 });
    expect(tick.end).toEqual({ x: 35, y: 5 });
  });

  it("takes an open shape's width from its stroke as drawn, scaled by its transforms, and a width of 0 as 1 px", () => {
    const { svg, elements } = host((plot) => [
      ["own", el("path", { d: "M0,0L100,0", "stroke-width": 3, transform: "scale(2)" }, plot)],
      ["group's", el("path", { d: "M0,10L100,10" }, el("g", { transform: "scale(2)", "stroke-width": 1.5 }, plot))],
      ["margin's", el("path", { d: "M0,20L100,20" }, plot)],
      ["inline", el("path", { d: "M0,30L100,30", style: "stroke-width: 4px" }, plot)],
      ["sheet", el("path", { class: "thick", d: "M0,40L100,40" }, plot)],
      ["uneven", el("path", { d: "M0,50L100,50", "stroke-width": 1, transform: "scale(4,1)" }, plot)],
      ["unstroked", el("path", { d: "M0,60L100,60", "stroke-width": 0 }, plot)],
      ["junk", el("path", { d: "M0,70L100,70", "stroke-width": `${"9".repeat(50_000)}x` }, plot)]
    ]);
    // A style sheet's, as a browser computes it: jsdom computes no stroke-width.
    const sheet = svg.querySelector(".thick")!;
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const style = computed(element, pseudo);
      return element === sheet ? Object.assign(Object.create(style) as CSSStyleDeclaration, { getPropertyValue: (name: string) => (name === "stroke-width" ? "5px" : style.getPropertyValue(name)) }) : style;
    });
    const started = performance.now();
    const { fx } = setup<string>(elements, named);
    expect(performance.now() - started).toBeLessThan(1000);
    // The junk isn't a length, so the margin's 2 px is inherited, as SVG would.
    expect(fx.marks().map((mark) => [mark.key, mark.thickness])).toEqual([
      ["own", 6],
      ["group's", 3],
      ["margin's", 2],
      ["inline", 4],
      ["sheet", 5],
      ["uneven", 2],
      ["unstroked", 1],
      ["junk", 2]
    ]);
  });

  it("keeps a computed width of 1 px where the page's CSS sets it, over an attribute a browser has read", () => {
    const { elements } = host((plot) => {
      const group = el("g", { "stroke-width": 6 }, plot);
      return [
        ["thin", el("path", { class: "thin", d: "M0,0L100,0" }, group)],
        ["plain", el("path", { d: "M0,10L100,10" }, group)],
        ["inline", el("path", { d: "M0,20L100,20", "stroke-width": 5, style: "stroke-width: 1px" }, plot)]
      ];
    });
    const [thin, plain] = elements as SVGElement[] as [SVGElement, SVGElement];
    const group = thin.parentElement!;
    // jsdom reads no presentation attribute: the group's 6 px and the inline style's 1 px.
    expect(setup<string>(elements, named).fx.marks().map((mark) => mark.thickness)).toEqual([6, 6, 1]);
    // A browser reads them: a style sheet's 1 px on the thin path, and the group's 6 px inherited by the plain one.
    const computed = window.getComputedStyle.bind(window);
    const browser = new Map<Element, string>([
      [group, "6px"],
      [thin, "1px"],
      [plain, "6px"]
    ]);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const style = computed(element, pseudo);
      const width = browser.get(element);
      return width === undefined ? style : Object.assign(Object.create(style) as CSSStyleDeclaration, { getPropertyValue: (name: string) => (name === "stroke-width" ? width : style.getPropertyValue(name)) });
    });
    document.querySelectorAll(".ec-overlay").forEach((overlay) => overlay.remove());
    expect(setup<string>(elements, named).fx.marks().map((mark) => mark.thickness)).toEqual([1, 6, 1]);
  });

  it("names a circle's or a shape's series with segment, so a data effect can read it", () => {
    const { elements } = host((plot) => [
      [{ name: "goals" }, el("path", { d: "M0,100L50,60L100,40" }, plot)],
      [{ name: "xg" }, el("path", { d: "M0,90L50,70L100,50" }, plot)],
      [{ name: "target" }, el("circle", { cx: 100, cy: 30, r: 4 }, plot)]
    ]);
    const decoration = dataRecorder(["xg"]);
    const { fx } = setup<{ name: string }>(elements, { key: (d) => d.name, segment: (d) => d.name, on: { decorate: decoration.effect } });
    expect(fx.marks().map((mark) => mark.series)).toEqual(["goals", "xg", "target"]);
    expect(decoration.last("goals")!.related("xg")).toBe(decoration.last("xg"));
    expect(decoration.last("goals")!.related("goals")!.datum).toEqual({ name: "goals" });
  });

  it("gives a circle with a numeric value its one sample, as a Vega symbol has it, and shapes none", () => {
    const { elements } = host((plot) => [
      ...dots.map((d): [Dot, SVGElement] => [d, el("circle", { cx: d.x, cy: d.y, r: d.r }, plot)]),
      [{ ...dots[0]!, name: "trend" }, el("path", { d: "M0,100L160,40" }, plot)]
    ]);
    const decoration = dataRecorder();
    setup<Dot>(elements, { ...byName, value: (d) => (d.name === "Tanaka" ? "six" : d.goals), on: { decorate: decoration.effect } });
    expect(decoration.last("Okafor")!.samples).toEqual([{ t: 0, value: 16 }]);
    expect(decoration.last("Lindqvist")!.samples).toEqual([{ t: 0, value: 10 }]);
    // A value that isn't a number, and a shape, have none; the page gives a curve's.
    expect(decoration.last("Tanaka")!.samples).toEqual([]);
    expect(decoration.last("trend")!.samples).toEqual([]);
    // Without value, none either.
    const plain = dataRecorder();
    setup<Dot>(scatter().elements, { ...byName, on: { decorate: plain.effect } });
    expect(plain.last("Okafor")!.samples).toEqual([]);
  });

  it("keeps circles and shapes in document order, bars among them too, and dots on one pivot", () => {
    const { elements } = host((plot) => [
      ["right", el("circle", { cx: 300, cy: 50, r: 4 }, plot)],
      ["bar", el("rect", { x: 0, y: 100, width: 50, height: 20 }, plot)],
      ["left", el("circle", { cx: 10, cy: 10, r: 4 }, plot)],
      ["axis", el("line", { x1: 0, y1: 200, x2: 300, y2: 200 }, plot)]
    ]);
    const { fx } = setup<string>(elements, { ...named, keyboard: true });
    expect(fx.marks().map((mark) => mark.key)).toEqual(["right", "bar", "left", "axis"]);
    // The bar is still a bar.
    expect(fx.marks()[1]).toMatchObject({ start: { x: 0, y: 110 }, end: { x: 50, y: 110 } });
    fx.focus("right");
    key(elements[0]!, "ArrowRight");
    expect(document.activeElement).toBe(elements[1]);
    // Bars alone keep their visual order: top to bottom.
    const bars = host((plot) => [
      ["low", el("rect", { x: 0, y: 100, width: 50, height: 20 }, plot)],
      ["high", el("rect", { x: 0, y: 10, width: 80, height: 20 }, plot)]
    ]);
    expect(setup<string>(bars.elements, named).fx.marks().map((mark) => mark.key)).toEqual(["high", "low"]);
  });

  it("leaves out a shape that draws nothing, and reads it once it does", () => {
    const { elements } = host((plot) => [
      ["dot", el("circle", { cx: 10, cy: 10, r: 3 }, plot)],
      ["empty line", el("path", {}, plot)],
      ["moves only", el("path", { d: "M0,0M10,10" }, plot)],
      ["flat ellipse", el("ellipse", { cx: 10, cy: 10, rx: 0, ry: 5 }, plot)],
      ["one point", el("polyline", { points: "5,5" }, plot)]
    ]);
    const story = recorder();
    const { fx } = setup<string>(elements, { ...named, keyboard: true, on: { enter: story.effect } });
    expect(fx.marks().map((mark) => mark.key)).toEqual(["dot"]);
    expect(elements.map((element) => element.getAttribute("tabindex"))).toEqual(["0", null, null, null, null]);
    story.log.length = 0;
    elements[1]!.setAttribute("d", "M0,50L100,50");
    fx.refresh();
    expect(fx.marks().map((mark) => mark.key)).toEqual(["dot", "empty line"]);
    expect(story.log).toEqual(["run empty line"]);
  });

  it("throws a TypeError naming the key a circle or a shape shares with another element", () => {
    const { plot } = host(() => []);
    const shared = (tags: ("rect" | "circle" | "path")[], options: Partial<ExpressiveOptions<string>> = {}) => () =>
      setup<string>(
        tags.map((tag, i) => Object.assign(el(tag, tag === "path" ? { d: "M0,0L10,0" } : { x: 0, y: i * 30, width: 20, height: 20, r: 5 }, plot), { __data__: "Okafor" })),
        { ...named, segment: (_d, element) => element.localName, ...options }
      );
    expect(shared(["rect", "circle"])).toThrow(new TypeError('expressive: two elements have the key "Okafor", and one is a <circle>. A circle or a shape is a mark of its own: give each its own key.'));
    expect(shared(["path", "rect"])).toThrow(/key "Okafor", and one is a <path>/);
    expect(shared(["circle", "path"])).toThrow(TypeError);
    expect(shared(["circle", "circle"], { segment: undefined })).toThrow(/key "Okafor", and one is a <circle>/);
    // Rects still group into segments.
    expect(shared(["rect", "rect"], { segment: (_d, element) => element.getAttribute("y")! })).not.toThrow();
  });

  it("throws on any other element, naming its tag", () => {
    const { plot } = host(() => []);
    for (const tag of ["text", "g", "use", "image"]) {
      const element = Object.assign(el(tag as "g", {}, plot), { __data__: "Okafor" });
      expect(() => setup<string>([element], named)).toThrow(
        new TypeError(
          `expressive: can't read the geometry of a <${tag}> (mark "Okafor"). <rect>, <circle>, <ellipse>, <line>, <path>, <polygon> and <polyline> are read; describe others with the geometry option.`
        )
      );
    }
  });

  it("still takes geometry from the page, over every element", () => {
    const { elements } = host((plot) => [
      ["dot", el("circle", { cx: 10, cy: 10, r: 3 }, plot)],
      ["name", el("text", { x: 50, y: 50 }, plot)],
      ["bar", el("rect", { x: 0, y: 100, width: 50, height: 20 }, plot)]
    ]);
    const { fx } = setup<string>(elements, { ...named, geometry: (_el, _d, key) => build.point({ key, x: 1, y: 2, r: 3 }) });
    expect(fx.marks().map(seen)).toEqual(["dot", "name", "bar"].map((key) => seen(build.point({ key, x: 1, y: 2, r: 3 }))));
  });

  it("dims, names and focuses dots and shapes as any mark", () => {
    const { svg, elements } = scatter();
    const { fx } = setup<Dot>(elements, { ...byName, dim: true, keyboard: true, markLabel: (d) => `${d.name}: ${d.goals} goals` });
    expect(elements.map((element) => element.getAttribute("aria-label"))).toEqual(["Okafor: 16 goals", "Tanaka: 6 goals", "Lindqvist: 10 goals"]);
    expect(elements.map((element) => element.getAttribute("role"))).toEqual(["img", "img", "img"]);
    expect(elements.map((element) => element.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    pointer("pointerover", elements[1]!);
    expect(elements.map((element) => element.classList.contains("ec-dimmed"))).toEqual([true, false, true]);
    expect(elements[1]!.style.getPropertyValue("fill")).toMatch(BLUE);
    pointer("pointerleave", svg);
    fx.focus("Lindqvist");
    expect(document.activeElement).toBe(elements[2]);
    expect(overlayOf(svg).querySelector(".ec-focus-ring")!.getAttribute("d")).toBe(fx.marks()[2]!.outline.d);
  });

  describe("with watch", () => {
    const delivered = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

    it("follows x1, y1, x2, y2, rx and ry, and every other shape attribute", async () => {
      const { elements } = host((plot) => [
        ["line", el("line", { x1: 0, y1: 0, x2: 100, y2: 0 }, plot)],
        ["ellipse", el("ellipse", { cx: 50, cy: 50, rx: 20, ry: 10 }, plot)],
        ["polygon", el("polygon", { points: "0,0 10,0 10,10" }, plot)],
        ["dot", el("circle", { cx: 5, cy: 5, r: 2 }, plot)]
      ]);
      const story = recorder();
      const { fx, clock } = setup<string>(elements, { ...named, watch: true, on: { decorate: story.effect } });
      story.log.length = 0;
      const [line, ellipse, polygon, dot] = elements as SVGElement[] as [SVGElement, SVGElement, SVGElement, SVGElement];
      const steps: [SVGElement, string, string, (mark: MarkGeometry) => unknown, unknown][] = [
        [line, "x1", "10", (mark) => mark.start, { x: 10, y: 0 }],
        [line, "y1", "20", (mark) => mark.start, { x: 10, y: 20 }],
        [line, "x2", "90", (mark) => mark.end.x, 90],
        [line, "y2", "40", (mark) => mark.end.y, 40],
        [ellipse, "rx", "30", (mark) => mark.bounds.width, 60],
        [ellipse, "ry", "15", (mark) => mark.bounds.height, 30],
        [polygon, "points", "0,0 20,0 20,20", (mark) => mark.bounds.width, 20],
        [dot, "r", "4", (mark) => mark.thickness, 8]
      ];
      for (const [element, name, value, read, expected] of steps) {
        element.setAttribute(name, value);
        await delivered();
        clock.advance(16);
        expect(read(fx.marks().find((mark) => mark.key === (element as unknown as { __data__: string }).__data__)!), name).toEqual(expected);
      }
      expect(story.log).toEqual(["change line", "change line", "change line", "change line", "change ellipse", "change ellipse", "change polygon", "change dot"]);
    });

    it("keeps a shape that draws nothing in a frame as it was, and its stroke width from the last full read", async () => {
      const { elements } = host((plot) => [["line", el("path", { d: "M0,0L100,0", "stroke-width": 3 }, plot)]]);
      const story = recorder();
      const { fx, clock } = setup<string>(elements, { ...named, watch: true, on: { decorate: story.effect } });
      const before = fx.marks();
      story.log.length = 0;
      elements[0]!.setAttribute("d", "");
      await delivered();
      clock.advance(16);
      expect(fx.marks()).toEqual(before);
      expect(story.log).toEqual([]);
      // A new stroke width waits for refresh(), as colours do; a transform scales the one it has.
      elements[0]!.setAttribute("stroke-width", "5");
      elements[0]!.setAttribute("transform", "scale(2)");
      elements[0]!.setAttribute("d", "M0,0L50,0");
      await delivered();
      clock.advance(16);
      expect(fx.marks()[0]).toMatchObject({ thickness: 6, end: { x: 100, y: 0 } });
      fx.refresh();
      expect(fx.marks()[0]!.thickness).toBe(10);
    });
  });
});

describe("expressive: destroy", () => {
  it("removes everything it added and leaves the host's DOM as it was", () => {
    const host = d3Stack();
    host.rect("Okafor", "goals").setAttribute("style", "stroke: white");
    host.rect("Tanaka", "goals").setAttribute("tabindex", "3");
    const before = host.svg.outerHTML;
    const draw: GeometryEffect = {
      kind: "geometry",
      run: async (mark, ctx) => {
        ctx.mark.set({ transform: [1, 0, 0, 1, 2, 0], opacity: 0.8, emphasis: 0.5, halo: { width: 4, opacity: 0.5 } });
        ctx.layer.path(mark.slice(0, 1), { stroke: "mark", width: 2 });
      },
      end: () => {},
      clear: () => {}
    };
    const { fx } = setup(host.selection(), {
      ...stacked,
      keyboard: true,
      dim: true,
      markLabel: (d) => d.data.name,
      on: { hover: draw, decorate: draw }
    });
    pointer("pointerover", host.rect("Okafor", "goals"));
    fx.focus("Tanaka");
    expect(host.svg.outerHTML).not.toBe(before);

    fx.destroy();
    expect(host.svg.outerHTML).toBe(before);
    // Events after destroy do nothing.
    pointer("pointerover", host.rect("Okafor", "goals"));
    fx.refresh();
    expect(host.svg.outerHTML).toBe(before);
  });
});
