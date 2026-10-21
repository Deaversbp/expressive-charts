import { createMotion, describe as build, manualClock, type EffectContext, type GeometryEffect, type MarkGeometry, type MotionMode } from "../../core";
import { createRegistry, type PresetFactory } from "../../core/registry";
import type { ChartEnv } from "../bar";
import { expressive } from "./expressive";
import type { ExpressiveOptions, MarkSource } from "./types";

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
 * point. 10 px per goal, 34 px rows with 20 px bars.
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
  return { svg, plot, groups, rects, selection, rect, redraw: (next: Player[]) => draw(groups, next, gap) };
}

/** A D3 join without keys would reuse elements by index; this one keys by name, as a careful page does. */
function draw(groups: SVGGElement[], rows: Player[], gap: number): void {
  SERIES.forEach((key, s) => {
    const group = groups[s]!;
    const existing = new Map(Array.from(group.children, (child) => [(child as unknown as { __data__: StackPoint }).__data__.data.name, child as SVGRectElement]));
    const keep = new Set<Element>();
    rows.forEach((row, i) => {
      const x0 = s === 0 ? 0 : row.goals;
      const point = Object.assign([x0, x0 + row[key]], { data: row }) as StackPoint;
      const rect = existing.get(row.name) ?? el("rect", {}, group);
      rect.setAttribute("x", String(x0 * 10 + (s === 0 ? 0 : gap)));
      rect.setAttribute("y", String(i * 34 + 7));
      rect.setAttribute("width", String(Math.max(0, row[key] * 10 - (s === 0 ? 0 : gap))));
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

const overlayOf = (svg: SVGSVGElement) => svg.querySelector(":scope > .ec-overlay") as SVGGElement;

afterEach(() => {
  document.body.textContent = "";
  vi.restoreAllMocks();
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
    expect(host.svg.classList.contains("ec-dimming")).toBe(false);
    expect(host.rect("Tanaka", "goals").getAttribute("class")).toBeNull();
    fx.destroy();

    const dimmed = setup(host.selection(), { ...stacked, dim: true });
    pointer("pointerover", host.rect("Okafor", "goals"));
    expect(host.svg.classList.contains("ec-dimming")).toBe(true);
    expect(host.rect("Okafor", "assists").classList.contains("ec-hot")).toBe(true);
    expect(host.rect("Tanaka", "goals").classList.contains("ec-hot")).toBe(false);
    expect(host.rect("Tanaka", "goals").classList.contains("ec-attached")).toBe(true);
    expect(host.svg.style.getPropertyValue("--ec-hover-duration")).toBe("100ms");
    pointer("pointerleave", host.svg);
    expect(host.svg.classList.contains("ec-dimming")).toBe(false);
    dimmed.fx.destroy();
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

  it("without keyboard, marks aren't focusable", () => {
    const host = d3Stack();
    const { fx } = setup(host.selection(), stacked);
    expect(host.rects().some((r) => r.hasAttribute("tabindex"))).toBe(false);
    fx.focus("Okafor");
    expect(document.activeElement).not.toBe(host.rect("Okafor", "goals"));
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
    const { fx } = setup(host.selection(), { ...stacked, keyboard: true, dim: true, on: { hover: draw, decorate: draw } });
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
