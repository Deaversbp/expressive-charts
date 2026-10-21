import { createMotion, describe as build, manualClock, type EffectContext, type GeometryEffect, type MarkGeometry, type MotionMode } from "../../core";
import { createRegistry, type PresetFactory } from "../../core/registry";
import type { ChartEnv } from "../bar";
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
    const path = el("path", { d: "M0,0L10,0" }, host.plot);
    expect(() => setup([path], { key: () => "line" })).toThrow(/can't read the geometry of a <path>/);
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
    // The host's colour, mixed toward black (jsdom writes the hex as rgb()).
    expect(assists.style.getPropertyValue("fill")).toMatch(/^color-mix\(in srgb, (#eb6834|rgb\(235, 104, 52\)) 75%, black\)$/);
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
    const circle = Object.assign(el("circle", { r: 3 }, host.groups[0]!), { __data__: host.selection().data()[0] });
    expect(() => fx.refresh([circle])).toThrow(/<circle>/);
    expect(fx.marks()).toEqual(before);
    circle.remove();
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
