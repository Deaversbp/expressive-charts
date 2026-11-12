// A chart switch view of several attachments on one <svg> (M16 step 3): hostView([a, b, c]) makes one
// view of a dumbbell's three attachments (each half's dots and the connectors), switched with bars side
// by side keyed the same, with the real morph(), on hand-written hosts that copy D3's conventions (a
// <g> a player joined by name and moved to its row, each row on __data__), as the adapter's tests do.
// Beside src/index.ts because it brings charts and an effect together, as only the composition root
// may. Last, hostView(attachment), byte for byte as on main.

import { createMotion, manualClock, type MotionMode } from "./core";
import { formatPath, parsePath, transformPath } from "./core/geometry/path";
import { createRegistry, type PresetFactory } from "./core/registry";
import { flush } from "./core/testing";
import { expectTypeOf } from "vitest";
import { barChart, chartSwitch, colorAssignment, expressive, hostView, link, type Attachment, type ChartEnv, type ChartSwitch, type ChartSwitchView, type ChartSwitchViews, type ColorAssignment, type ExpressiveOptions, type HostLabel, type HostView, type Link } from "./charts";
import { flash, morph } from "./effects";

type Env = ChartEnv & { readonly clock: ReturnType<typeof manualClock> };

function env(mode: MotionMode = "presentation", reduced = false): Env {
  const motion = createMotion({ mode, reducedMotion: { matches: reduced, subscribe: () => () => {} } });
  return { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock: manualClock() };
}

// The page's CSS for its hosts' text, as a D3 page styles it: jsdom computes it, as a browser would.
const css = document.head.appendChild(document.createElement("style"));
css.textContent = [
  ".row text.name { font-family: Inter; font-size: 12px; font-weight: 600; fill: #333333; }",
  ".row text.value { font-family: Inter; font-size: 11px; font-weight: 400; fill: #555555; }"
].join("\n");
// Taken out once the file is done: the files a worker runs share its document.
afterAll(() => css.remove());

afterEach(() => {
  document.body.textContent = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Hosts ───────────────────────────────────────────────────────────────────

interface Player {
  readonly name: string;
  readonly first: number;
  readonly second: number;
}

type Half = "first" | "second";
const HALVES = ["first", "second"] as const;

/** What each dot and each bar carries on __data__. */
interface Dot {
  readonly name: string;
  readonly half: Half;
  readonly value: number;
}

const players: readonly Player[] = [
  { name: "Okafor", first: 3, second: 7 },
  { name: "Lindqvist", first: 5, second: 6 },
  { name: "Moreau", first: 6, second: 4 },
  { name: "Tanaka", first: 2, second: 2 }
];
/** What a host draws again with: Okafor's and Tanaka's second halves change, Moreau goes and Abara comes. */
const after: readonly Player[] = [
  { name: "Okafor", first: 3, second: 8 },
  { name: "Lindqvist", first: 5, second: 6 },
  { name: "Tanaka", first: 2, second: 4 },
  { name: "Abara", first: 1, second: 3 }
];

const SVG = "http://www.w3.org/2000/svg";
const ROW = 32;
const LEFT = 86;
const TOP = 10;
const WIDTH = 640;
const PLOT = WIDTH - LEFT - 18;
const RADIUS = 6;
/** Each host draws in a palette of its own, so a pair's colour says which view it came from. */
const DUMBBELL = { first: "#2a78d6", second: "#eb6834", connector: "#8a8a8a" } as const;
const BARS = { first: "#1f5fa8", second: "#b8501f" } as const;

const round = (value: number): number => Math.round(value * 1000) / 1000;
/** A value's x, 0 to 10 across the plot. */
const xOf = (value: number): number => round((value / 10) * PLOT);
const dotsOf = (player: Player): Dot[] => HALVES.map((half) => ({ name: player.name, half, value: player[half] }));
/** `from` moved a dot's radius toward `to`, or half way if they're closer: a connector's end at its dot's edge. */
const toward = (from: number, to: number): number => from + Math.sign(to - from) * Math.min(RADIUS, Math.abs(to - from) / 2);

function el<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>, parent: Element, text?: string): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
  set(element, attributes);
  if (text !== undefined) element.textContent = text;
  parent.appendChild(element);
  return element;
}

function set(element: Element, attributes: Record<string, string | number>): void {
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
}

/** Binds a row to its element as D3 does. */
const bind = <E extends Element>(element: E, row: unknown): E => Object.assign(element, { __data__: row });

/** An axis of 0 to 10 in a <g> of its own, `height` high, hidden from screen readers, as both hosts draw it. */
function drawAxis(axes: SVGGElement, height: number): void {
  axes.replaceChildren();
  for (const value of [0, 2, 4, 6, 8, 10]) {
    el("line", { class: "grid", x1: xOf(value), x2: xOf(value), y1: 0, y2: height, stroke: "#dddddd" }, axes);
    el("text", { class: "tick", x: xOf(value), y: height + 16, "text-anchor": "middle" }, axes, String(value));
  }
}

/** A player's row: a <g> moved to its place, with the player's name, and what the host draws in it. */
interface RowParts {
  readonly row: SVGGElement;
  readonly name: SVGTextElement;
}

/**
 * Joins `rows` by name into `plot` as selection.data(rows, (d) => d.name).join("g").order() does: a
 * row's <g> is kept, made with `enter`, or removed, written by `write`, moved to its place `step`
 * px apart, and put in the rows' order.
 */
function joinRows<P extends RowParts>(plot: SVGGElement, parts: Map<string, P>, rows: readonly Player[], enter: (row: SVGGElement, name: SVGTextElement) => P, write: (parts: P, player: Player, index: number) => void, step = ROW): void {
  for (const [name, each] of parts) {
    if (rows.some((player) => player.name === name)) continue;
    each.row.remove();
    parts.delete(name);
  }
  rows.forEach((player, index) => {
    let each = parts.get(player.name);
    if (!each) {
      const row = el("g", {}, plot);
      // Hidden: each mark's name says whose it is.
      each = enter(row, el("text", { class: "name", "aria-hidden": "true", x: -12, y: 4.5, "text-anchor": "end" }, row, player.name));
      parts.set(player.name, each);
    }
    bind(each.row, player);
    bind(each.name, player);
    set(each.row, { class: `row ${player.second >= player.first ? "rise" : "fall"}`, transform: `translate(0,${index * step + step / 2})` });
    write(each, player, index);
    plot.appendChild(each.row);
  });
}

interface DumbbellParts extends RowParts {
  readonly connector: SVGLineElement;
  readonly dots: Record<Half, SVGCircleElement>;
}

/**
 * What a D3 page draws for a dumbbell of each player's goals in the first half and the second, as
 * charts.html's does: a 640 px <svg role="group"> with its name, an axis, and a <g> a player moved to
 * its row, holding the player's name, a <line> from the first half's dot to the second's, edge to edge,
 * and a <circle> at each. `layered`: each half's dots in a <g> of their own instead, the second's drawn
 * at twice the size in one scaled by half, so the three attachments' marks have three ancestors.
 * draw() draws it again with new rows, and fresh() draws a new <svg> in its place.
 */
function dumbbellHost(parent: Element, rows: readonly Player[] = players, { layered = false }: { readonly layered?: boolean } = {}) {
  let svg!: SVGSVGElement;
  let axes!: SVGGElement;
  let plot!: SVGGElement;
  let layers: Record<Half, SVGGElement> | undefined;
  let parts = new Map<string, DumbbellParts>();
  let drawn: readonly Player[] = [];

  function start(): void {
    svg = el("svg", { width: WIDTH, height: TOP + rows.length * ROW + 40, viewBox: `0 0 ${WIDTH} ${TOP + rows.length * ROW + 40}`, role: "group", "aria-label": "Goals by half, a dumbbell" }, parent);
    axes = el("g", { class: "axes", "aria-hidden": "true", transform: `translate(${LEFT},${TOP})` }, svg);
    plot = el("g", { class: "plot", transform: `translate(${LEFT},${TOP})` }, svg);
    layers = layered
      ? { first: el("g", { class: "dots first", transform: `translate(${LEFT},${TOP})` }, svg), second: el("g", { class: "dots second", transform: `translate(${LEFT},${TOP}) scale(0.5)` }, svg) }
      : undefined;
    parts = new Map();
  }

  function draw(next: readonly Player[]): void {
    drawAxis(axes, next.length * ROW);
    const gone = new Map(parts);
    joinRows<DumbbellParts>(
      plot,
      parts,
      next,
      (row, name) => {
        // A line has no inside: with fill none, its colour is its stroke.
        const connector = el("line", { class: "connector", fill: "none", stroke: DUMBBELL.connector, "stroke-width": 2 }, row);
        const dots = Object.fromEntries(HALVES.map((half) => [half, el("circle", { class: `dot dot-${half}`, "aria-hidden": "true", fill: DUMBBELL[half] }, layers?.[half] ?? row)])) as Record<Half, SVGCircleElement>;
        return { row, name, connector, dots };
      },
      ({ connector, dots }, player, index) => {
        const [first, second] = [xOf(player.first), xOf(player.second)];
        bind(connector, player);
        set(connector, { x1: toward(first, second), x2: toward(second, first), y1: 0, y2: 0 });
        for (const dot of dotsOf(player)) {
          const circle = bind(dots[dot.half], dot);
          const y = index * ROW + ROW / 2;
          if (dot.half === "second" && layers) set(circle, { cx: xOf(dot.value) * 2, cy: y * 2, r: RADIUS * 2 });
          else set(circle, { cx: xOf(dot.value), cy: layers ? y : 0, r: RADIUS });
          layers?.[dot.half].appendChild(circle);
        }
      }
    );
    for (const [name, each] of gone) if (!parts.has(name)) for (const half of HALVES) each.dots[half].remove();
    drawn = next;
  }

  start();
  draw(rows);
  const inOrder = (): DumbbellParts[] => drawn.map((player) => parts.get(player.name)!);
  return {
    get svg() {
      return svg;
    },
    get plot() {
      return plot;
    },
    get layers() {
      return layers;
    },
    /** Each half's dots, as a D3 selection, in the rows' order. */
    dots: (half: Half): SVGCircleElement[] => inOrder().map((each) => each.dots[half]),
    connectors: (): SVGLineElement[] => inOrder().map((each) => each.connector),
    names: (): SVGTextElement[] => inOrder().map((each) => each.name),
    draw,
    /** Draws a new <svg> in the old one's place, as a page that draws from scratch does. */
    fresh(next: readonly Player[]): void {
      const old = svg;
      start();
      old.replaceWith(svg);
      draw(next);
    }
  };
}

interface BarsParts extends RowParts {
  readonly bars: Record<Half, SVGRectElement>;
  readonly values: Record<Half, SVGTextElement>;
}

/**
 * What a D3 page draws for the same players as bars side by side: a 640 px <svg role="group"> with its
 * name, the dumbbell's axis at its margins, and a <g> a player moved to its row, `row` px apart (the
 * dumbbell's 32 by default), holding the player's name and a <rect> for each half, the first above the
 * second, each with its count at its end.
 */
function barsHost(parent: Element, rows: readonly Player[] = players, { row = ROW }: { readonly row?: number } = {}) {
  const svg = el("svg", { width: WIDTH, height: TOP + rows.length * row + 40, viewBox: `0 0 ${WIDTH} ${TOP + rows.length * row + 40}`, role: "group", "aria-label": "Goals by half, bars" }, parent);
  const axes = el("g", { class: "axes", "aria-hidden": "true", transform: `translate(${LEFT},${TOP})` }, svg);
  const plot = el("g", { class: "plot", transform: `translate(${LEFT},${TOP})` }, svg);
  const parts = new Map<string, BarsParts>();
  let drawn: readonly Player[] = [];
  const top: Record<Half, number> = { first: -12, second: 1 };
  function draw(next: readonly Player[]): void {
    drawAxis(axes, next.length * row);
    joinRows<BarsParts>(
      plot,
      parts,
      next,
      (row, name) => ({
        row,
        name,
        bars: { first: el("rect", { class: "bar first", fill: BARS.first }, row), second: el("rect", { class: "bar second", fill: BARS.second }, row) },
        values: { first: el("text", { class: "value first", "aria-hidden": "true" }, row), second: el("text", { class: "value second", "aria-hidden": "true" }, row) }
      }),
      ({ bars, values }, player) => {
        for (const dot of dotsOf(player)) {
          set(bind(bars[dot.half], dot), { x: 0, y: top[dot.half], width: xOf(dot.value), height: 11 });
          set(bind(values[dot.half], dot), { x: xOf(dot.value) + 4, y: top[dot.half] + 8.5 });
          values[dot.half].textContent = String(dot.value);
        }
      },
      row
    );
    drawn = next;
  }
  draw(rows);
  const inOrder = (): BarsParts[] => drawn.map((player) => parts.get(player.name)!);
  return {
    svg,
    plot,
    /** Every bar, as a D3 selection: each row's first half, then its second. */
    bars: (): SVGRectElement[] => inOrder().flatMap((each) => HALVES.map((half) => each.bars[half])),
    names: (): SVGTextElement[] => inOrder().map((each) => each.name),
    values: (): SVGTextElement[] => inOrder().flatMap((each) => HALVES.map((half) => each.values[half])),
    draw
  };
}

type Dumbbell = ReturnType<typeof dumbbellHost>;
type Bars = ReturnType<typeof barsHost>;

const dotKey = (dot: Dot): string => `${dot.half}@${dot.name}`;

/** A half's dots, keyed by half and player (first@Okafor), each named, with the keyboard. */
function attachDots(host: Dumbbell, half: Half, e: ChartEnv, more: Partial<ExpressiveOptions<Dot>> = {}): Attachment<Dot> {
  return expressive<Dot>(host.dots(half), { key: dotKey, value: (d) => d.value, keyboard: true, markLabel: (d) => `${d.name}: ${d.value} in the ${d.half} half`, ...more }, e);
}

/** The connectors, keyed by player, each named, with the keyboard. */
function attachConnectors(host: Dumbbell, e: ChartEnv, more: Partial<ExpressiveOptions<Player>> = {}): Attachment<Player> {
  return expressive<Player>(host.connectors(), { key: (d) => d.name, keyboard: true, markLabel: (d) => `${d.name}: ${d.first} in the first half, ${d.second} in the second`, ...more }, e);
}

/** The bars, keyed as the dots are, each named, with the keyboard. */
function attachBars(host: Bars, e: ChartEnv, more: Partial<ExpressiveOptions<Dot>> = {}): Attachment<Dot> {
  return expressive<Dot>(host.bars(), { key: dotKey, value: (d) => d.value, keyboard: true, markLabel: (d) => `${d.name}: ${d.value} in the ${d.half} half`, ...more }, e);
}

/** The page's labels: each player's name, by its first half's key, and the bars' counts, by their own. */
const dumbbellLabels = (host: Dumbbell) => (): HostLabel[] => host.names().map((element) => ({ element, key: `first@${element.textContent}`, role: "category" }));
const barLabels = (host: Bars) => (): HostLabel[] => [
  ...host.names().map((element): HostLabel => ({ element, key: `first@${element.textContent}`, role: "category" })),
  ...host.values().map((element): HostLabel => ({ element, key: dotKey((element as unknown as { __data__: Dot }).__data__), role: "value" }))
];

/** Our own bars of the same players, a third view: each player's first half and second, keyed as the hosts' marks are. */
const ours = (e: ChartEnv) => (container: HTMLElement, colors: ColorAssignment) =>
  barChart<Dot>(container, { label: "Goals by half, our bars", data: players.flatMap(dotsOf), y: (d) => `${d.name} ${d.half}`, x: "value", key: dotKey, colors, width: 600 }, e);

// ── Helpers ─────────────────────────────────────────────────────────────────

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
}

/** A ResizeObserver that the test drives: resize(target, width) tells the observers of `target`. */
function stubResize(): (target: Element, width: number) => void {
  const observers: { callback: ResizeObserverCallback; target?: Element }[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private readonly entry: { callback: ResizeObserverCallback; target?: Element };
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      unobserve() {}
      disconnect() {
        observers.splice(observers.indexOf(this.entry), 1);
      }
    }
  );
  return (target, width) => {
    for (const observer of observers.filter((each) => each.target === target)) observer.callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
  };
}

/** A switch's announcements, in order: the text its live region said each time. */
function announcements(region: Element): () => string[] {
  const said: string[] = [];
  const heard = (records: readonly MutationRecord[]): void => {
    for (const record of records) for (const node of Array.from(record.addedNodes)) said.push((node.textContent ?? "").trim());
  };
  const observer = new MutationObserver(heard);
  observer.observe(region, { childList: true });
  return () => {
    heard(observer.takeRecords());
    return said;
  };
}

/** Markup with its numbers rounded to 1e-6 and the ids counted from the document's start without their number. */
const normal = (markup: string): string =>
  markup.replace(/-?\d+\.\d+(?:e-?\d+)?/g, (n) => String(Math.round(Number(n) * 1e6) / 1e6)).replace(/\b(ec-description|ec-focus-mask)-\d+/g, "$1-#");

/** Where an element is in a switch: its view and its mark's key, as the view finds it. */
function stopOf(switcher: ChartSwitch<ChartSwitchViews>, names: readonly string[], element: Element | null): string {
  if (!element || element === document.body) return "";
  for (const name of names) {
    const chart = switcher.chart(name) as ChartSwitchView;
    if (!chart.element.contains(element)) continue;
    return `${name}:${chart.keyOf?.(element) ?? element.closest("[data-key]")?.getAttribute("data-key") ?? "?"}`;
  }
  return element.localName;
}

/** An element as words: its tag, its class and its transform. */
const named = (element: Element): string => `${element.localName}.${element.getAttribute("class") ?? ""} ${element.getAttribute("transform") ?? ""}`.trim();

/**
 * What a host view gives a switch, in words: its <svg>, its space, its marks there (rounded), the key
 * of each of the host's elements in it, each mark's paint, and its labels as a switch draws them.
 */
function viewWords(view: HostView<unknown>, elements: readonly Element[]): string {
  const marks = view.marks();
  return [
    `element ${view.element.getAttribute("aria-label")}`,
    `space ${named(view.space)}`,
    `marks ${marks.map((mark) => `${mark.key} ${round(mark.center.x)},${round(mark.center.y)} ${round(mark.bounds.width)}x${round(mark.bounds.height)} ${round(mark.length)}`).join("; ")}`,
    `keys ${elements.map((element) => view.keyOf(element) ?? "-").join(", ")}`,
    `paints ${marks.map((mark) => JSON.stringify(view.paintOf(mark.key) ?? null)).join(" ")}`,
    `labels ${view
      .labels()
      .map((label) => `${label.role} ${label.key} ${label.text} ${round(label.x)},${round(label.y)} ${label.anchor} ${label.element.getAttribute("style") ?? ""}`)
      .join("; ")}`
  ].join("\n");
}

// ── A view of several attachments ───────────────────────────────────────────

interface SeveralOptions {
  readonly mode?: MotionMode;
  readonly reduced?: boolean;
  /** The view shown first. Default: the dumbbell. */
  readonly initial?: "dumbbell" | "bars";
  /** Each half's dots in a <g> of its own, so the three attachments' marks have three ancestors. */
  readonly layered?: boolean;
  /** The three linked by player, as charts.html's dumbbell is. Default true. */
  readonly linked?: boolean;
  /** A ResizeObserver the test drives, made before the switch. */
  readonly resize?: boolean;
  /** A third view: our own bars. */
  readonly ours?: boolean;
  /** Each host's axis named as a guide, keyed "x". */
  readonly guides?: boolean;
  /** The bars' rows' step. Default 40 px, so the names move between the views. */
  readonly barRow?: number;
}

/** The bars' rows, 40 px apart, so the names move between the views. */
const BAR_ROW = 40;

/**
 * charts.html's dumbbell, its three attachments (each half's dots and the connectors) one view, given
 * the players' names, in a switch with bars side by side keyed the same, given the names and counts.
 */
function setup(options: SeveralOptions = {}) {
  const e = env(options.mode, options.reduced);
  const resize = options.resize ? stubResize() : undefined;
  const target = document.body.appendChild(document.createElement("div"));
  let dumbbell!: Dumbbell;
  let bars!: Bars;
  let parts!: { readonly first: Attachment<Dot>; readonly second: Attachment<Dot>; readonly connectors: Attachment<Player> };
  let joined: Link | undefined;
  /** Each host's <svg> as it drew it, before it was attached. */
  const drawn = { dumbbell: "", bars: "" };
  const views = {
    dumbbell: (container: HTMLElement) => {
      dumbbell = dumbbellHost(container, players, { layered: options.layered });
      drawn.dumbbell = canonical(dumbbell.svg);
      parts = { first: attachDots(dumbbell, "first", e), second: attachDots(dumbbell, "second", e), connectors: attachConnectors(dumbbell, e) };
      if (options.linked ?? true) joined = link([parts.first, parts.second, parts.connectors], { by: ({ data }) => data.datum.name });
      return hostView([parts.first, parts.second, parts.connectors], { labels: dumbbellLabels(dumbbell), ...(options.guides ? { guides: () => [{ element: dumbbell.svg.querySelector(".axes")!, key: "x" }] } : {}) });
    },
    bars: (container: HTMLElement) => {
      bars = barsHost(container, players, { row: options.barRow ?? BAR_ROW });
      drawn.bars = bars.svg.outerHTML;
      return hostView(attachBars(bars, e), { labels: barLabels(bars), ...(options.guides ? { guides: () => [{ element: bars.svg.querySelector(".axes")!, key: "x" }] } : {}) });
    },
    ...(options.ours ? { ours: ours(e) } : {})
  } satisfies ChartSwitchViews;
  const switcher = chartSwitch(target, { views, initial: options.initial ?? "dumbbell", transition: morph(), announce: true }, e);
  const wrapper = target.querySelector(":scope > .ec-switch") as HTMLDivElement;
  resize?.(wrapper, 600);
  const overlay = wrapper.querySelector(":scope > .ec-switch-overlay") as SVGSVGElement;
  const container = (view: string) => wrapper.querySelector(`:scope > .ec-switch-view[data-view="${view}"]`) as HTMLDivElement;
  /** Each host's <svg> at rest, attached. */
  const rest = { dumbbell: dumbbell.svg.outerHTML, bars: bars.svg.outerHTML };
  const land = async (ms = 950): Promise<void> => {
    e.clock.advance(ms);
    await flush();
  };
  return { switcher, e, clock: e.clock, wrapper, overlay, container, dumbbell, bars, parts, joined, drawn, rest, land, resize, view: switcher.chart("dumbbell"), barsView: switcher.chart("bars") };
}

/** Each pair's run as drawn now, by key: its path data and the colour it's drawn in. */
function runs(overlay: SVGSVGElement): Map<string, { readonly d: string; readonly color: string }> {
  return new Map(
    Array.from(overlay.querySelectorAll<SVGGElement>(".ec-switch-runs > .ec-run"), (group) => [group.getAttribute("data-key")!, { d: group.querySelector("path")!.getAttribute("d")!, color: group.style.getPropertyValue("--ec-mark") }])
  );
}

/** The marks fading where they stand, by key: their colour and their opacity now. */
function fades(overlay: SVGSVGElement): Map<string, { readonly color: string; readonly opacity: number }> {
  return new Map(
    Array.from(overlay.querySelectorAll<SVGGElement>(".ec-switch-fades > .ec-switch-fade"), (group) => [
      group.getAttribute("data-key")!,
      { color: group.style.getPropertyValue("--ec-mark"), opacity: Number(group.getAttribute("opacity")) }
    ])
  );
}

/** The overlay's copies of the labels: their text, where they are, and whether each is drawn now. */
function copies(overlay: SVGSVGElement): { readonly text: string; readonly x: number; readonly y: number; readonly shown: boolean }[] {
  return Array.from(overlay.querySelectorAll<SVGTextElement>(".ec-switch-labels > text"), (element) => ({
    text: element.textContent ?? "",
    x: round(Number(element.getAttribute("x"))),
    y: round(Number(element.getAttribute("y"))),
    shown: element.getAttribute("visibility") !== "hidden" && element.getAttribute("opacity") !== "0"
  }));
}

/** Path data moved by a <g>'s translate, as jsdom, with no layout, puts the <svg> at the overlay's origin. */
const moved = (d: string, x: number, y: number): string => formatPath(transformPath(parsePath(d), [1, 0, 0, 1, x, y]));
/** An element's markup with each element's attributes in order of name: an attachment that takes an attribute off puts it back last. */
function canonical(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const each of [copy, ...copy.querySelectorAll("*")]) {
    const attributes = Array.from(each.attributes, ({ name, value }) => [name, value] as const).sort(([a], [b]) => (a < b ? -1 : 1));
    for (const [name] of attributes) each.removeAttribute(name);
    for (const [name, value] of attributes) each.setAttribute(name, value);
  }
  return copy.outerHTML;
}
const hidden = (element: Element): boolean => (element as SVGElement).style.getPropertyValue("visibility") === "hidden";
/** The dumbbell's marks' elements and the names the page gives. */
const dumbbellNamed = (host: Dumbbell): Element[] => [...host.dots("first"), ...host.dots("second"), ...host.connectors(), ...host.names()];
/** Each row's place down the plot, in px from its top. */
const rowY = (index: number, step = ROW): number => index * step + step / 2;
const firstKeys = players.map((player) => `first@${player.name}`);
const secondKeys = players.map((player) => `second@${player.name}`);
const playerKeys = players.map((player) => player.name);

describe("hostView([a, b, c]): a dumbbell's three attachments as one view", () => {
  it("is one view: the <svg> they share, every attachment's marks in the array's order in their common ancestor's space, and each element's key and each mark's colour from the attachment it's from", () => {
    const { view, dumbbell, parts } = setup();
    // Its rows are theirs, as a union, as a switch's views' are.
    expectTypeOf(view).toEqualTypeOf<HostView<Dot | Player>>();
    expect(view.element).toBe(dumbbell.svg);
    expect(view.space).toBe(dumbbell.plot);
    expect(view.marks().map((mark) => mark.key)).toEqual([...firstKeys, ...secondKeys, ...playerKeys]);
    expect(view.marks()).toEqual([...parts.first.marks(), ...parts.second.marks(), ...parts.connectors.marks()]);
    expect([...dumbbell.dots("first"), ...dumbbell.dots("second"), ...dumbbell.connectors()].map((element) => view.keyOf(element))).toEqual([...firstKeys, ...secondKeys, ...playerKeys]);
    expect(view.keyOf(dumbbell.names()[0]!)).toBeUndefined();
    expect(view.paintOf("first@Okafor")).toEqual({ color: "first@Okafor", drawn: true, cssColor: DUMBBELL.first });
    expect(view.paintOf("second@Tanaka")).toEqual({ color: "second@Tanaka", drawn: true, cssColor: DUMBBELL.second });
    // A line's colour is its stroke.
    expect(view.paintOf("Moreau")).toEqual({ color: "Moreau", drawn: true, cssColor: DUMBBELL.connector });
    expect(view.paintOf("Abara")).toBeUndefined();
    expect(view.labels().map((label) => `${label.role} ${label.key} ${label.text} ${label.x},${label.y} ${label.anchor}`)).toEqual(
      players.map((player, i) => `category first@${player.name} ${player.name} -12,${rowY(i) + 4.5} end`)
    );
  });

  it("pairs every attachment's marks with the bars by key, each pair in its new view's colour, and fades the connectors, which the bars haven't, in the dumbbell's", async () => {
    const { switcher, overlay, view, barsView, clock, land } = setup();
    const marks = new Map(view.marks().map((mark) => [mark.key, mark]));
    void switcher.show("bars");
    const forth = runs(overlay);
    expect([...forth.keys()]).toEqual(barsView.marks().map((mark) => mark.key));
    for (const [key, run] of forth) {
      // Each starts where the host draws its dot, through the plot's <g>, as jsdom puts the <svg> at the overlay's origin.
      expect(run.d).toBe(moved(marks.get(key)!.outline.d, LEFT, TOP));
      expect(run.color).toBe(BARS[key.startsWith("first@") ? "first" : "second"]);
    }
    expect([...fades(overlay)]).toEqual(playerKeys.map((key) => [key, { color: DUMBBELL.connector, opacity: 1 }]));
    clock.advance(300);
    for (const fade of fades(overlay).values()) expect(fade.opacity).toBeLessThan(1);
    await land(650);
    expect(switcher.current).toBe("bars");
    expect(overlay.querySelector(".ec-switch-runs > *, .ec-switch-fades > *")).toBeNull();
    // Back: each pair in the dumbbell's colours, and the connectors fading in.
    void switcher.show("dumbbell");
    const back = runs(overlay);
    expect([...back.keys()].sort()).toEqual([...firstKeys, ...secondKeys].sort());
    for (const [key, run] of back) expect(run.color).toBe(DUMBBELL[key.startsWith("first@") ? "first" : "second"]);
    expect([...fades(overlay).values()].map((fade) => fade.opacity)).toEqual([0, 0, 0, 0]);
    await land();
    expect(switcher.current).toBe("dumbbell");
  });

  it("moves the names the page gives from the dumbbell's rows to the bars' and swaps them half way, and fades in the bars' counts, which the dumbbell hasn't", async () => {
    const { switcher, overlay, clock, land } = setup();
    void switcher.show("bars");
    const names = (): ReturnType<typeof copies> => copies(overlay).filter((copy) => playerKeys.includes(copy.text));
    // Two copies a name, the dumbbell's shown and the bars' not yet, both where the dumbbell draws it.
    expect(names().filter((copy) => copy.shown).map((copy) => `${copy.text} ${copy.x},${copy.y}`)).toEqual(players.map((player, i) => `${player.name} ${LEFT - 12},${TOP + rowY(i) + 4.5}`));
    expect(copies(overlay).filter((copy) => !playerKeys.includes(copy.text) && copy.shown)).toEqual([]);
    clock.advance(600);
    // Past half way, the bars' copies, on their way to the bars' rows, and the counts coming in.
    const moving = names().filter((copy) => copy.shown);
    expect(moving.map((copy) => copy.text)).toEqual(playerKeys);
    moving.forEach((copy, i) => {
      expect(copy.y).toBeGreaterThan(TOP + rowY(i) + 4.5);
      expect(copy.y).toBeLessThan(TOP + rowY(i, BAR_ROW) + 4.5);
    });
    expect(copies(overlay).filter((copy) => !playerKeys.includes(copy.text) && copy.shown)).toHaveLength(8);
    await land(350);
    expect(copies(overlay)).toEqual([]);
  });

  it("hides each attachment's elements and the names while it plays, through a switch back too, fades the axis with its view, and gives the host's DOM back as it was once it lands", async () => {
    const { switcher, dumbbell, bars, rest, clock, land } = setup();
    void switcher.show("bars");
    expect(dumbbell.svg.classList.contains("ec-morphing")).toBe(true);
    for (const element of dumbbellNamed(dumbbell)) expect(hidden(element)).toBe(true);
    // The axis, which the page didn't name, stays as the host drew it.
    for (const element of dumbbell.svg.querySelectorAll(".axes, .axes *")) expect(element.hasAttribute("style")).toBe(false);
    await land();
    expect(dumbbell.svg.outerHTML).toBe(rest.dumbbell);
    expect(bars.svg.outerHTML).toBe(rest.bars);
    // And back, with a switch back part way: hidden until that lands.
    void switcher.show("dumbbell");
    clock.advance(300);
    void switcher.show("bars");
    clock.advance(100);
    for (const element of dumbbellNamed(dumbbell)) expect(hidden(element)).toBe(true);
    void switcher.show("dumbbell");
    await land();
    expect(switcher.current).toBe("dumbbell");
    expect(dumbbell.svg.outerHTML).toBe(rest.dumbbell);
  });

  it("hides each attachment's elements through its own edits, and the names through the first's: one destroyed mid-switch gives back its own", () => {
    const { switcher, dumbbell, parts, clock } = setup();
    void switcher.show("bars");
    clock.advance(300);
    parts.second.destroy();
    expect(dumbbell.dots("second").filter(hidden)).toEqual([]);
    expect(dumbbell.dots("first").every(hidden)).toBe(true);
    expect(dumbbell.connectors().every(hidden)).toBe(true);
    expect(dumbbell.names().every(hidden)).toBe(true);
    parts.first.destroy();
    expect(dumbbell.dots("first").filter(hidden)).toEqual([]);
    expect(dumbbell.names().filter(hidden)).toEqual([]);
    expect(dumbbell.connectors().every(hidden)).toBe(true);
    switcher.destroy();
    expect(dumbbellNamed(dumbbell).filter(hidden)).toEqual([]);
  });

  it("hides the host drawn again mid-switch as it is then, after each attachment's refresh, and gives back what it took away", async () => {
    const { switcher, dumbbell, parts, clock, land } = setup();
    void switcher.show("bars");
    clock.advance(300);
    const moreau = dumbbellNamed(dumbbell).filter((element) => element.closest(".row")?.querySelector(".name")?.textContent === "Moreau");
    dumbbell.draw(after);
    parts.first.refresh(dumbbell.dots("first"));
    // The first's new dot hides at once; the other two's new marks wait for their own refresh.
    expect(hidden(dumbbell.dots("first")[3]!)).toBe(true);
    expect(hidden(dumbbell.dots("second")[3]!)).toBe(false);
    parts.second.refresh(dumbbell.dots("second"));
    parts.connectors.refresh(dumbbell.connectors());
    for (const element of dumbbellNamed(dumbbell)) expect(hidden(element)).toBe(true);
    // Moreau's row went, and what was hidden of it is given back.
    expect(moreau).toHaveLength(4);
    expect(moreau.filter(hidden)).toEqual([]);
    await land(650);
    expect(switcher.current).toBe("bars");
    expect([...dumbbell.svg.querySelectorAll("*")].filter(hidden)).toEqual([]);
    expect(dumbbell.svg.hasAttribute("class")).toBe(false);
  });

  it("gives the whole <svg>'s guides, hidden through the first's edits, and the switch keeps the axis both views draw the same", async () => {
    const { switcher, view, dumbbell, parts, overlay, clock, land, rest } = setup({ guides: true, barRow: ROW });
    const axes = dumbbell.svg.querySelector(".axes")!;
    expect(view.guides()).toEqual([{ element: axes, key: "x" }]);
    /** Each copy of a guide in the switch's overlay, by key, with its opacity: the old view's, then the new view's. */
    const copies = (): string[] => Array.from(overlay.querySelectorAll(":scope > .ec-switch-guides > g"), (group) => `${group.getAttribute("data-key")} ${group.getAttribute("opacity")}`);
    void switcher.show("bars");
    expect(hidden(axes)).toBe(true);
    clock.advance(300);
    // Drawn the same in both: at full strength, the dumbbell's until half way, then the bars'.
    expect(copies()).toEqual(["x 1", "x 0"]);
    clock.advance(400);
    expect(copies()).toEqual(["x 0", "x 1"]);
    await land(250);
    expect(dumbbell.svg.outerHTML).toBe(rest.dumbbell);
    // Hidden through the first attachment's edits: the second's destroy() leaves it hidden, the first's gives it back.
    void switcher.show("dumbbell");
    clock.advance(300);
    parts.second.destroy();
    expect(hidden(axes)).toBe(true);
    parts.first.destroy();
    expect(hidden(axes)).toBe(false);
  });

  it("moves focus from a dot to the bar with its key once the switch lands, and back; from a connector, which no bar has, to the bars' first", async () => {
    const { switcher, view, dumbbell, bars, land } = setup();
    view.focus("second@Lindqvist");
    expect(document.activeElement).toBe(dumbbell.dots("second")[1]);
    void switcher.show("bars");
    await land();
    expect(document.activeElement).toBe(bars.bars()[3]);
    void switcher.show("dumbbell");
    await land();
    expect(document.activeElement).toBe(dumbbell.dots("second")[1]);
    view.focus("Moreau");
    expect(document.activeElement).toBe(dumbbell.connectors()[2]);
    void switcher.show("bars");
    await land();
    expect(document.activeElement).toBe(bars.bars()[0]);
  });

  it("after a switch focus wasn't in, moves the tab stop of the attachment whose mark has the key, with no focus, and the others keep theirs", async () => {
    const { switcher, barsView, dumbbell, land } = setup({ initial: "bars" });
    barsView.focus("first@Moreau");
    const button = document.body.appendChild(document.createElement("button"));
    button.focus();
    void switcher.show("dumbbell");
    await land();
    expect(document.activeElement).toBe(button);
    const stops = (elements: readonly Element[]): (string | null)[] => elements.map((element) => element.getAttribute("tabindex"));
    expect(stops(dumbbell.dots("first"))).toEqual(["-1", "-1", "0", "-1"]);
    expect(stops(dumbbell.dots("second"))).toEqual(["0", "-1", "-1", "-1"]);
    expect(stops(dumbbell.connectors())).toEqual(["0", "-1", "-1", "-1"]);
  });
});

describe("hostView([a, b, c]): links", () => {
  /** What the view hears: each hover and leave, by key. */
  function listen(view: HostView<Dot | Player>): string[] {
    const heard: string[] = [];
    view.on("hover", (event) => heard.push(`${event.mark.key} ${event.source}`));
    view.on("leave", (event) => heard.push(`leave ${event.mark.key}`));
    return heard;
  }

  it("keeps their link: a dot lights its row before a switch, a switch's start ends it, nothing lights while it plays, and a connector lights its row after a switch there and back", async () => {
    const { switcher, view, dumbbell, clock, land } = setup();
    const heard = listen(view);
    pointer("pointerover", dumbbell.dots("first")[0]!);
    expect(heard.splice(0)).toEqual(["first@Okafor pointer", "second@Okafor linked", "Okafor linked"]);
    void switcher.show("bars");
    expect(heard.splice(0).sort()).toEqual(["leave Okafor", "leave first@Okafor", "leave second@Okafor"]);
    for (let t = 0; t < 960; t += 16) {
      clock.advance(16);
      await flush();
    }
    void switcher.show("dumbbell");
    await land();
    expect(heard).toEqual([]);
    pointer("pointerover", dumbbell.connectors()[3]!);
    expect(heard.splice(0)).toEqual(["Tanaka pointer", "first@Tanaka linked", "second@Tanaka linked"]);
  });

  it("keeps their link after a switch into the view", async () => {
    const { switcher, view, dumbbell, land } = setup({ initial: "bars" });
    void switcher.show("dumbbell");
    await land();
    const heard = listen(view);
    pointer("pointerover", dumbbell.dots("second")[2]!);
    expect(heard).toEqual(["second@Moreau pointer", "first@Moreau linked", "Moreau linked"]);
  });

  it("takes no part in a link its switch is in, as it has no one hover, while the link hears the switch's other views, and their own link goes on", async () => {
    const { switcher, view, dumbbell, bars, e, land } = setup();
    const other = barChart<Dot>(document.body.appendChild(document.createElement("div")), { label: "Goals by half", data: players.flatMap(dotsOf), y: (d) => `${d.name} ${d.half}`, x: "value", key: dotKey, width: 600 }, e);
    // Not a link's source alone, and its attachments, in a link of their own, don't keep its switch out of one.
    expect(() => link([view, other])).toThrow(TypeError);
    link([switcher, other]);
    const heard: string[] = [];
    switcher.on("hover", (event) => heard.push(`switch ${event.mark.key} ${event.source}`));
    other.on("hover", (event) => heard.push(`other ${event.mark.key} ${event.source}`));
    other.focus("first@Okafor");
    pointer("pointerover", dumbbell.dots("second")[1]!);
    expect(heard.splice(0)).toEqual(["other first@Okafor keyboard", "switch second@Lindqvist pointer", "switch first@Lindqvist linked", "switch Lindqvist linked"]);
    pointer("pointerleave", dumbbell.svg);
    heard.length = 0;
    void switcher.show("bars");
    await land();
    other.focus("second@Tanaka");
    pointer("pointerover", bars.bars()[4]!);
    // Once the bars can be reached, the link's hover held from the other chart shows in them, then each new one.
    expect(heard).toEqual(["switch first@Okafor linked", "other second@Tanaka keyboard", "switch second@Tanaka linked", "switch first@Moreau pointer", "other first@Moreau linked"]);
  });
});

describe("hostView([a, b, c]): checks", () => {
  it("throws a TypeError, naming it, on attachments in two <svg>s, two marks with one key, an attachment twice, no attachments, anything but an attachment, and labels that aren't a function", () => {
    const e = env();
    const one = dumbbellHost(document.body);
    const two = dumbbellHost(document.body);
    const first = attachDots(one, "first", e);
    const connectors = attachConnectors(one, e);
    expect(() => hostView([first, attachDots(two, "second", e)])).toThrow(new TypeError("hostView: attachments[1]'s marks are in another <svg> than attachments[0]'s, and a view's attachments share one."));
    // Each half's dots keyed by player alone: the second's have the first's keys.
    const byName = expressive<Dot>(one.dots("second"), { key: (d) => d.name }, e);
    expect(() => hostView([first, connectors, byName])).toThrow(
      new TypeError('hostView: attachments[1] and attachments[2] both have a mark with the key "Okafor", and each key must be one mark\'s. Key each one\'s marks apart, such as (d) => `first@${d.name}`.')
    );
    expect(() => hostView([first, connectors, first])).toThrow(new TypeError("hostView: attachments[2] is attachments[0] again. Each attachment is in a view once."));
    expect(() => hostView([])).toThrow(new TypeError("hostView needs an attachment, or an array of attachments on one <svg>: hostView([dots, connectors])."));
    expect(() => hostView([first, {} as Attachment<Dot>])).toThrow(new TypeError("hostView needs attachments that expressive() or fromVegaView() returned, each with marks in an <svg>: attachments[1] isn't one."));
    expect(() => hostView([first, connectors], { labels: [] as never })).toThrow(/^hostView: labels must be a function/);
    // A refresh() with a source: each attachment reads its own.
    expect(() => hostView([first, connectors]).refresh(one.dots("first"))).toThrow(
      new TypeError("hostView: a view of several attachments refreshes each from what it last read, with refresh(). To read new sources, refresh each attachment with its own.")
    );
  });

  it("reports a key a refresh has made two attachments' as a switch starts, naming it, and plays on with the first's mark, each time a switch starts", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const { switcher, view, dumbbell, parts, overlay, clock, land } = setup();
    // The host binds the second half's dots as the first's, and the page refreshes them.
    for (const dot of dumbbell.dots("second")) bind(dot, { ...(dot as unknown as { __data__: Dot }).__data__, half: "first" });
    parts.second.refresh();
    expect(reportError).not.toHaveBeenCalled();
    expect(view.marks().map((mark) => mark.key)).toEqual([...firstKeys, ...playerKeys]);
    void switcher.show("bars");
    expect(reportError.mock.calls).toEqual([
      [
        new TypeError(
          'hostView: attachments[0] and attachments[1] both have a mark with the key "first@Okafor", and each key must be one mark\'s. Key each one\'s marks apart, such as (d) => `first@${d.name}`. The switch plays on, and the key stays attachments[0]\'s: attachments[1]\'s mark is left out.'
        )
      ]
    ]);
    // The first half's dots pair with the bars' first halves, and the second halves come in alone.
    expect([...runs(overlay).keys()].sort()).toEqual([...firstKeys].sort());
    // Every dot is hidden, the second's too, while the switch draws only the first's.
    for (const element of dumbbellNamed(dumbbell)) expect(hidden(element)).toBe(true);
    clock.advance(300);
    expect(reportError).toHaveBeenCalledTimes(1);
    await land(650);
    expect(switcher.current).toBe("bars");
    void switcher.show("dumbbell");
    expect(reportError).toHaveBeenCalledTimes(2);
    await land();
  });

  it("reports an attachment a refresh has left in another <svg> than the first's as a switch starts, and leaves its marks out", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const { switcher, view, dumbbell, parts, overlay, land } = setup();
    const old = dumbbell.svg;
    // The host draws a new <svg>, and the page refreshes the first half's dots and the connectors, but not the second's.
    dumbbell.fresh(players);
    parts.first.refresh(dumbbell.dots("first"));
    parts.connectors.refresh(dumbbell.connectors());
    expect(view.element).toBe(dumbbell.svg);
    expect(view.marks().map((mark) => mark.key)).toEqual([...firstKeys, ...playerKeys]);
    void switcher.show("bars");
    expect(reportError.mock.calls).toEqual([[new TypeError("hostView: attachments[1]'s marks are in another <svg> than attachments[0]'s, and a view's attachments share one. The switch plays on, and attachments[1]'s marks are left out.")]]);
    expect([...runs(overlay).keys()].sort()).toEqual([...firstKeys].sort());
    expect(dumbbell.svg.classList.contains("ec-morphing")).toBe(true);
    expect(old.classList.contains("ec-morphing")).toBe(false);
    await land();
    expect(switcher.current).toBe("bars");
  });

  it("makes an array of one that attachment's own view: linked through its hover, and refreshed from a source", () => {
    const e = env();
    const host = dumbbellHost(document.body);
    const dots = attachDots(host, "first", e);
    const view = hostView([dots]);
    expectTypeOf(view).toEqualTypeOf<HostView<Dot>>();
    const other = barChart<Dot>(document.body.appendChild(document.createElement("div")), { label: "Goals by half", data: players.flatMap(dotsOf), y: (d) => `${d.name} ${d.half}`, x: "value", key: dotKey, width: 600 }, e);
    link([view, other]);
    const heard: string[] = [];
    other.on("hover", (event) => heard.push(`${event.mark.key} ${event.source}`));
    pointer("pointerover", host.dots("first")[2]!);
    expect(heard).toEqual(["first@Moreau linked"]);
    expect(() => view.refresh(host.dots("first"))).not.toThrow();
  });
});

describe("hostView([a, b, c]): as an attachment", () => {
  it("refresh() refreshes each from what it last read, and on() hears each, its rows theirs, until its unsubscribe stops them all", () => {
    const { view, dumbbell } = setup({ linked: false });
    const heard: string[] = [];
    const stop = view.on("update", (event) => heard.push(`${event.mark.key} ${"half" in event.data.datum ? "dot" : "row"}`));
    dumbbell.draw(players.map((player) => (player.name === "Okafor" ? { ...player, second: 8 } : player)));
    view.refresh();
    expect(heard).toEqual(["second@Okafor dot", "Okafor row"]);
    stop();
    dumbbell.draw(players);
    view.refresh();
    expect(heard).toHaveLength(2);
  });

  it("update() updates each, and rejects when they do", async () => {
    const { view, parts } = setup();
    const spies = [parts.first, parts.second, parts.connectors].map((part) => vi.spyOn(part, "update"));
    const next = { on: { hover: flash() } };
    await expect(view.update(next)).resolves.toBeUndefined();
    for (const spy of spies) expect(spy).toHaveBeenCalledWith(next);
    await expect(view.update({ on: { hover: "no such preset" } })).rejects.toThrow();
  });

  it("leave() ends each one's hover, and destroy() destroys each, the last first, giving the host's DOM back as it drew it", () => {
    const { view, parts, dumbbell, drawn } = setup();
    const left: string[] = [];
    view.on("leave", (event) => left.push(event.mark.key));
    pointer("pointerover", dumbbell.dots("second")[0]!);
    const leaves = [parts.first, parts.second, parts.connectors].map((part) => vi.spyOn(part, "leave"));
    view.leave();
    expect(leaves.map((spy) => spy.mock.invocationCallOrder[0]!)).toEqual([...leaves.map((spy) => spy.mock.invocationCallOrder[0]!)].sort((a, b) => a - b));
    expect(left.sort()).toEqual(["Okafor", "first@Okafor", "second@Okafor"]);
    const destroys = [parts.first, parts.second, parts.connectors].map((part) => vi.spyOn(part, "destroy"));
    view.destroy();
    const order = destroys.map((spy) => spy.mock.invocationCallOrder[0]!);
    expect(order[2]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[0]!);
    expect(canonical(dumbbell.svg)).toBe(drawn.dumbbell);
  });

  it("maps each attachment's marks into one space when their ancestors differ: the <svg> that holds them all", async () => {
    const { view, dumbbell, switcher, overlay, land } = setup({ layered: true });
    expect(view.space).toBe(dumbbell.svg);
    const marks = new Map(view.marks().map((mark) => [mark.key, mark]));
    const at = (key: string): string => {
      const mark = marks.get(key)!;
      return `${round(mark.center.x)},${round(mark.center.y)} ${round(mark.bounds.width)}x${round(mark.bounds.height)}`;
    };
    players.forEach((player, i) => {
      const y = TOP + rowY(i);
      expect(at(`first@${player.name}`)).toBe(`${round(LEFT + xOf(player.first))},${y} 12x12`);
      // Drawn at twice the size in a <g> scaled by half: the same dot.
      expect(at(`second@${player.name}`)).toBe(`${round(LEFT + xOf(player.second))},${y} 12x12`);
      const [from, to] = [xOf(player.first), xOf(player.second)];
      // A line's bounds take its stroke's width.
      expect(at(player.name)).toBe(`${round(LEFT + (toward(from, to) + toward(to, from)) / 2)},${y} ${round(Math.abs(toward(to, from) - toward(from, to)) + 2)}x2`);
    });
    expect(view.labels().map((label) => `${label.x},${label.y}`)).toEqual(players.map((_, i) => `${LEFT - 12},${TOP + rowY(i) + 4.5}`));
    // The switch draws each pair from where the host draws it.
    void switcher.show("bars");
    for (const [key, run] of runs(overlay)) expect(run.d).toBe(marks.get(key)!.outline.d);
    await land();
    expect(switcher.current).toBe("bars");
  });
});

describe("hostView([a, b, c]): motion", () => {
  for (const [name, options] of [
    ["motion off", { mode: "off" }],
    ["reduced motion", { reduced: true }]
  ] as const) {
    it(`lands at once with ${name}: nothing hidden or drawn in the overlay, and focus by key, both ways`, () => {
      const { switcher, view, dumbbell, bars, overlay } = setup(options);
      view.focus("first@Tanaka");
      void switcher.show("bars");
      expect(switcher.current).toBe("bars");
      expect(overlay.querySelector(".ec-switch-runs > *, .ec-switch-fades > *, .ec-switch-labels > *")).toBeNull();
      expect(document.activeElement).toBe(bars.bars()[6]);
      expect([...dumbbell.svg.querySelectorAll("*")].filter(hidden)).toEqual([]);
      void switcher.show("dumbbell");
      expect(document.activeElement).toBe(dumbbell.dots("first")[3]);
      expect(dumbbell.svg.hasAttribute("class")).toBe(false);
    });
  }

  it("hides them in Analysis's shorter switch too, until it lands", async () => {
    const { switcher, dumbbell, rest, clock, land } = setup({ mode: "analysis" });
    void switcher.show("bars");
    clock.advance(150);
    for (const element of dumbbellNamed(dumbbell)) expect(hidden(element)).toBe(true);
    await land(60);
    expect(switcher.current).toBe("bars");
    expect(dumbbell.svg.outerHTML).toBe(rest.dumbbell);
  });

  it("lands at once on a resize mid-switch, with the host as it drew it", async () => {
    const { switcher, wrapper, dumbbell, overlay, rest, resize, clock } = setup({ resize: true });
    void switcher.show("bars");
    clock.advance(300);
    resize!(wrapper, 500);
    await flush();
    expect(overlay.querySelector(".ec-switch-runs > *")).toBeNull();
    expect(dumbbell.svg.outerHTML).toBe(rest.dumbbell);
    expect(switcher.current).toBe("bars");
  });

  it("is hidden for a staged jump's leg it's in alone: given back as the leg from it lands, and hidden again for the leg into it", async () => {
    const { switcher, view, dumbbell, bars, clock, land } = setup({ ours: true });
    view.focus("second@Okafor");
    void switcher.show("ours", { via: "bars" });
    clock.advance(300);
    for (const element of dumbbellNamed(dumbbell)) expect(hidden(element)).toBe(true);
    await land(700);
    // The second leg, from the bars to ours: the dumbbell as it drew it.
    expect([...dumbbell.svg.querySelectorAll("*")].filter(hidden)).toEqual([]);
    expect([...bars.bars()].every(hidden)).toBe(true);
    await land();
    expect(switcher.current).toBe("ours");
    expect(document.activeElement?.closest("[data-key]")?.getAttribute("data-key")).toBe("second@Okafor");
    // Back through the bars: the dumbbell's leg alone hides it, and focus follows into its dot.
    void switcher.show("dumbbell", { via: "bars" });
    clock.advance(300);
    // The first leg, from ours to the bars: the dumbbell as it drew it.
    expect([...dumbbell.svg.querySelectorAll("*")].filter(hidden)).toEqual([]);
    await land(650);
    // The second leg, into it, begun as the first landed: hidden again.
    for (const element of dumbbellNamed(dumbbell)) expect(hidden(element)).toBe(true);
    await land();
    expect(switcher.current).toBe("dumbbell");
    expect(document.activeElement).toBe(dumbbell.dots("second")[0]);
    expect([...dumbbell.svg.querySelectorAll("*")].filter(hidden)).toEqual([]);
    expect(dumbbell.svg.hasAttribute("class")).toBe(false);
  });

  it("leaves the host's <svg> as it drew it when the switch is destroyed mid-way", () => {
    const { switcher, dumbbell, drawn, clock } = setup();
    void switcher.show("bars");
    clock.advance(300);
    switcher.destroy();
    expect(canonical(dumbbell.svg)).toBe(drawn.dumbbell);
  });
});

// ── hostView(attachment), as on main ────────────────────────────────────────

/**
 * What each case is shown in turn, and for how long: "!" before a view focuses the old view's
 * Moreau first, "^" a button outside the switch; "draw:" draws a host again and refreshes its view,
 * "fresh:" draws a new <svg> in its place; "hover:other:" and "hover:host:" hover a key in the chart
 * outside the switch or in the view on show, and "leave" leaves both; "resize", "off" and "destroy".
 */
type Steps = readonly (readonly [step: string, ms: number])[];

interface DigestCase {
  readonly mode?: MotionMode;
  readonly reduced?: boolean;
  /** A chart outside the switch, linked with it. */
  readonly linked?: boolean;
  readonly steps: Steps;
}

interface SingleHosts {
  dots?: Dumbbell;
  bars?: Bars;
}

/** A half's dots and the bars, each one attachment's view, and our bars. */
function singleViews(e: Env, hosts: SingleHosts): ChartSwitchViews {
  return {
    dots: (container) => {
      const host = (hosts.dots = dumbbellHost(container));
      return hostView(attachDots(host, "first", e), { labels: dumbbellLabels(host) });
    },
    bars: (container) => {
      const host = (hosts.bars = barsHost(container));
      return hostView(attachBars(host, e), { labels: barLabels(host) });
    },
    ours: ours(e)
  };
}

const SINGLE: Readonly<Record<string, DigestCase>> = {
  "a half's dots, the bars and ours": {
    steps: [
      ["!bars", 960],
      ["dots", 400],
      ["bars", 304],
      ["ours", 960],
      ["^dots", 960]
    ]
  },
  "drawn again mid-switch": {
    steps: [
      ["bars", 304],
      ["draw:dots", 304],
      ["draw:bars", 400],
      ["!dots", 960]
    ]
  },
  "a new <svg> mid-switch": {
    steps: [
      ["bars", 304],
      ["fresh:dots", 304],
      ["dots", 960]
    ]
  },
  "in a link": {
    linked: true,
    steps: [
      ["hover:other:first@Okafor", 32],
      ["hover:host:first@Lindqvist", 32],
      ["leave", 32],
      ["bars", 960],
      ["hover:other:second@Tanaka", 32],
      ["hover:host:first@Moreau", 32],
      ["leave", 32],
      ["dots", 960],
      ["hover:other:first@Tanaka", 32]
    ]
  },
  "a resize, and destroyed mid-way": {
    steps: [
      ["!bars", 304],
      ["resize", 32],
      ["dots", 304],
      ["destroy", 0]
    ]
  },
  analysis: {
    mode: "analysis",
    steps: [
      ["!bars", 208],
      ["dots", 96],
      ["bars", 208]
    ]
  },
  "motion off": {
    mode: "off",
    steps: [
      ["!bars", 16],
      ["draw:bars", 0],
      ["^dots", 16]
    ]
  },
  "reduced motion": {
    reduced: true,
    steps: [
      ["!bars", 16],
      ["dots", 16]
    ]
  }
};

/** The host elements a view's words read the keys of: the dots and the names, or the bars, the names and the counts. */
function elementsOf(host: Dumbbell | Bars): Element[] {
  return "dots" in host ? [...HALVES.flatMap((half) => host.dots(half)), ...host.connectors(), ...host.names()] : [...host.bars(), ...host.names(), ...host.values()];
}

/**
 * Each case's digest: every 16 ms frame of its markup (views, overlay and live region), with numbers
 * rounded and ids' counters gone; and, apart, what it says in words: `current` after each call, where
 * focus and each view's tab stop are after each step, what each host view gives a switch, the hovers
 * the switch and the linked chart hear, what was announced, and whether each host's <svg> was given
 * back as it drew it. A browser runs promise callbacks between frames, so these do too.
 */
async function digests(cases: Readonly<Record<string, DigestCase>>, views: (e: Env, hosts: SingleHosts) => ChartSwitchViews): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, { mode, reduced, linked, steps }] of Object.entries(cases)) {
    const e = env(mode, reduced);
    const resize = stubResize();
    const hosts: SingleHosts = {};
    const target = document.body.appendChild(document.createElement("div"));
    const switcher = chartSwitch(target, { views: views(e, hosts), initial: "dots", transition: morph(), colors: colorAssignment({ "first@Okafor": 1, "first@Lindqvist": 2, "first@Moreau": 3, "first@Tanaka": 4 }), announce: true }, e);
    const names = ["dots", "bars", "ours"];
    const wrapper = target.firstElementChild!;
    const said = announcements(wrapper.querySelector('[role="status"]')!);
    const button = document.body.appendChild(document.createElement("button"));
    const other = linked ? barChart<Dot>(document.body.appendChild(document.createElement("div")), { label: "Goals by half", data: players.flatMap(dotsOf), y: (d) => `${d.name} ${d.half}`, x: "value", key: dotKey, width: 600 }, e) : undefined;
    if (other) link([switcher, other]);
    const words: string[] = [];
    switcher.on("hover", (event) => words.push(`switch hover ${event.mark.key} ${event.source}`));
    switcher.on("leave", (event) => words.push(`switch leave ${event.mark.key}`));
    other?.on("hover", (event) => words.push(`other hover ${event.mark.key} ${event.source}`));
    const drawn = { dots: hosts.dots!.svg.outerHTML, bars: hosts.bars!.svg.outerHTML };
    let width = 600;
    resize(wrapper, width);
    let frames = "";
    let destroyed = false;
    for (const [step, ms] of steps) {
      const [verb, which, key] = step.split(":") as [string, string | undefined, string | undefined];
      if (step === "off") e.motion.setMode("off");
      else if (step === "resize") resize(wrapper, (width -= 100));
      else if (step === "destroy") {
        switcher.destroy();
        destroyed = true;
      } else if (verb === "draw" || verb === "fresh") {
        const host = hosts[which as "dots" | "bars"]!;
        if (verb === "fresh") (host as Dumbbell).fresh(after);
        else host.draw(after);
        (switcher.chart(which!) as HostView<unknown>).refresh("dots" in host ? host.dots("first") : host.bars());
      } else if (verb === "hover") {
        const view = switcher.chart(switcher.current) as ChartSwitchView;
        const element = which === "other" ? other!.element.querySelector(`[data-key="${key}"]`)! : elementsOf(hosts[switcher.current as "dots" | "bars"]!).find((each) => view.keyOf?.(each) === key)!;
        pointer("pointerover", element);
      } else if (verb === "leave") {
        pointer("pointerleave", switcher.chart(switcher.current).element);
        if (other) pointer("pointerleave", other.element);
      } else {
        const view = step.replace(/^[!^]/, "");
        if (step.startsWith("!")) switcher.chart(switcher.current).focus("first@Moreau");
        if (step.startsWith("^")) button.focus();
        void switcher.show(view);
        words.push(`show ${view}: current ${switcher.current}`);
      }
      for (let t = 0; t < ms; t += 16) {
        frames += `${normal(target.innerHTML)}\n`;
        e.clock.advance(16);
        await flush();
      }
      await flush();
      if (destroyed) continue;
      const stops = names.map((each) => stopOf(switcher, names, switcher.chart(each).element.querySelector('[tabindex="0"]')));
      words.push(`after ${step}: focus ${stopOf(switcher, names, document.activeElement)}; tab stops ${stops.join(", ")}`);
      for (const each of ["dots", "bars"] as const) words.push(`${each}:\n${viewWords(switcher.chart(each) as HostView<unknown>, elementsOf(hosts[each]!))}`);
    }
    words.push(`said: ${said().join(" | ")}`);
    if (!destroyed) switcher.destroy();
    words.push(`given back: dots ${hosts.dots!.svg.outerHTML === drawn.dots}, bars ${hosts.bars!.svg.outerHTML === drawn.bars}`);
    out[name] = `${hash(frames)} ${hash(words.join("\n"))}`;
    other?.destroy();
    target.remove();
    button.remove();
    vi.unstubAllGlobals();
  }
  return out;
}

/**
 * The digests main (779118e, 0.10.0's library code on jsdom 31) gave, with this file's digests() run
 * there before views of several came in: each frames' then words'. Pinned again there once the
 * dumbbell's connectors were drawn with fill none, which moved their markup and no words. Main with
 * guides (d04ea02, M16 step 2) gives the same: a switch whose views name no guides is as before.
 */
const MAIN: Readonly<Record<string, string>> = {
  "a half's dots, the bars and ours": "58ebe5147f0e31e3 d68ed16db42e8120",
  "drawn again mid-switch": "577118a8225f4110 5ab835e539925125",
  "a new <svg> mid-switch": "f15c3fcfd693c0b7 364cb121eef0e8e1",
  "in a link": "9e5dc3c464fb1635 1be49e7e6eab13cb",
  "a resize, and destroyed mid-way": "919d353001c39997 bcef31c79e45f4b0",
  analysis: "a6fb0e5fb0901f65 dd3cbe226ecb1b34",
  "motion off": "1efa44c486bd7d33 028b9958cb419e4e",
  "reduced motion": "4c3ba605a4bc23e0 20cd85b901d9782b"
};

describe("hostView(attachment), as on main", () => {
  it("draws every frame as on main, byte for byte, and says the same in words: its <svg>, space, marks, keys, paints and labels, focus and tab stops, a redraw and a new <svg> mid-switch, a link, a resize, destroy() mid-way, Analysis, Off and reduced motion", async () => {
    expect(await digests(SINGLE, singleViews)).toEqual(MAIN);
  });
});

/** A 64-bit hash of the text (cyrb53's mixing, both halves kept), as 16 hex digits: enough to tell two drawings apart. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}
