// A chart switch view of several attachments on one <svg> (M16 step 3): hostView([a, b, c]) makes one
// view of a dumbbell's three attachments (each half's dots and the connectors), switched with bars side
// by side keyed the same, with the real morph(), on hand-written hosts that copy D3's conventions (a
// <g> a player joined by name and moved to its row, each row on __data__), as the adapter's tests do.
// Beside src/index.ts because it brings charts and an effect together, as only the composition root
// may. Last, hostView(attachment), byte for byte as on main.

import { createMotion, manualClock, type MotionMode } from "./core";
import { createRegistry, type PresetFactory } from "./core/registry";
import { flush } from "./core/testing";
import { barChart, chartSwitch, colorAssignment, expressive, hostView, link, type Attachment, type ChartEnv, type ChartSwitch, type ChartSwitchView, type ChartSwitchViews, type ColorAssignment, type ExpressiveOptions, type HostLabel, type HostView } from "./charts";
import { morph } from "./effects";

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

/** An axis of 0 to 10 in a <g> of its own, hidden from screen readers, as both hosts draw it. */
function drawAxis(axes: SVGGElement, rows: number): void {
  axes.replaceChildren();
  for (const value of [0, 2, 4, 6, 8, 10]) {
    el("line", { class: "grid", x1: xOf(value), x2: xOf(value), y1: 0, y2: rows * ROW, stroke: "#dddddd" }, axes);
    el("text", { class: "tick", x: xOf(value), y: rows * ROW + 16, "text-anchor": "middle" }, axes, String(value));
  }
}

/** A player's row: a <g> moved to its place, with the player's name, and what the host draws in it. */
interface RowParts {
  readonly row: SVGGElement;
  readonly name: SVGTextElement;
}

/**
 * Joins `rows` by name into `plot` as selection.data(rows, (d) => d.name).join("g").order() does: a
 * row's <g> is kept, made with `enter`, or removed, written by `write`, and put in the rows' order.
 */
function joinRows<P extends RowParts>(plot: SVGGElement, parts: Map<string, P>, rows: readonly Player[], enter: (row: SVGGElement, name: SVGTextElement) => P, write: (parts: P, player: Player, index: number) => void): void {
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
    set(each.row, { class: `row ${player.second >= player.first ? "rise" : "fall"}`, transform: `translate(0,${index * ROW + ROW / 2})` });
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
    drawAxis(axes, next.length);
    const gone = new Map(parts);
    joinRows<DumbbellParts>(
      plot,
      parts,
      next,
      (row, name) => {
        const connector = el("line", { class: "connector", stroke: DUMBBELL.connector, "stroke-width": 2 }, row);
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
 * name, the dumbbell's axis at its margins, and a <g> a player moved to its row, holding the player's
 * name and a <rect> for each half, the first above the second, each with its count at its end.
 */
function barsHost(parent: Element, rows: readonly Player[] = players) {
  const svg = el("svg", { width: WIDTH, height: TOP + rows.length * ROW + 40, viewBox: `0 0 ${WIDTH} ${TOP + rows.length * ROW + 40}`, role: "group", "aria-label": "Goals by half, bars" }, parent);
  const axes = el("g", { class: "axes", "aria-hidden": "true", transform: `translate(${LEFT},${TOP})` }, svg);
  const plot = el("g", { class: "plot", transform: `translate(${LEFT},${TOP})` }, svg);
  const parts = new Map<string, BarsParts>();
  let drawn: readonly Player[] = [];
  const top: Record<Half, number> = { first: -12, second: 1 };
  function draw(next: readonly Player[]): void {
    drawAxis(axes, next.length);
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
      }
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

/** The digests main (779118e, 0.10.0's library code on jsdom 31) gave, with this file's digests() run there before views of several came in: each frames' then words'. */
const MAIN: Readonly<Record<string, string>> = {
  "a half's dots, the bars and ours": "f9fd881741eeb61e d68ed16db42e8120",
  "drawn again mid-switch": "e5a3623a1d142f9c 5ab835e539925125",
  "a new <svg> mid-switch": "9828dbeece39872f 364cb121eef0e8e1",
  "in a link": "6a2815a2c6705af3 1be49e7e6eab13cb",
  "a resize, and destroyed mid-way": "f0d42ef1190e79b8 bcef31c79e45f4b0",
  analysis: "7a99dab91122c1b0 dd3cbe226ecb1b34",
  "motion off": "90541117e8319489 028b9958cb419e4e",
  "reduced motion": "e04b2b1d65dfff09 20cd85b901d9782b"
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
