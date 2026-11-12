// Guides that stay put in a chart switch (M16 step 2): a guide (an axis, a grid, a tick) the page
// names in each view, through hostView()'s `guides`, stays on screen at full strength, where it is,
// while a switch plays, when both views draw it the same; every other part of each view fades as
// before. With the real morph() on a manual clock, on host views drawn as src/host-switch.test.ts
// draws its hosts (a D3 pie, D3 columns with a y axis and a grid, D3 bars with an x axis). Beside
// src/index.ts because it brings charts and an effect together, as only the composition root may.
// Last, every switch whose views have no guides as on main, byte for byte.

import { createMotion, describe as build, easeInOutCubic, manualClock, type MarkGeometry, type MotionMode } from "./core";
import { unease } from "./core/easing";
import { createRegistry, type PresetFactory } from "./core/registry";
import { flush } from "./core/testing";
import {
  barChart,
  chartSwitch,
  colorAssignment,
  donutChart,
  expressive,
  hostView,
  type Attachment,
  type ChartEnv,
  type ChartSwitch,
  type ChartSwitchView,
  type ChartSwitchViews,
  type HostGuide,
  type HostLabel
} from "./charts";
import { morph } from "./effects";

interface Outcome {
  readonly outcome: string;
  readonly shots: number;
}

const outcomes: Outcome[] = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];

type Env = ChartEnv & { readonly clock: ReturnType<typeof manualClock> };

function env(mode: MotionMode = "presentation", reduced = false): Env {
  const motion = createMotion({ mode, reducedMotion: { matches: reduced, subscribe: () => () => {} } });
  return { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock: manualClock() };
}

// The page's CSS for its hosts, as a D3 page styles its text, its grid and its axes: jsdom computes
// it, as a browser would.
const css = document.head.appendChild(document.createElement("style"));
css.textContent = [
  ".labels text, .names text { font-family: Inter; font-size: 12px; font-weight: 600; fill: #333333; }",
  ".values text { font-family: Inter; font-size: 11px; font-weight: 400; fill: #555555; }",
  ".grid line { stroke: #e1e0d9; stroke-dasharray: 2 2; }",
  ".axis { color: #7d7b75; }",
  ".axis .domain { display: none; }"
].join("\n");
// Taken out once the file is done: the files a worker runs share its document.
afterAll(() => css.remove());

afterEach(() => {
  document.body.textContent = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Hosts ───────────────────────────────────────────────────────────────────

const SVG = "http://www.w3.org/2000/svg";
const TURN = 2 * Math.PI;
/** Each host draws in a palette of its own, so a pair's colour says which view it came from. */
const PIE: Readonly<Record<string, string>> = { Goal: "#2a78d6", Saved: "#eb6834", "Off target": "#1baa7c", Blocked: "#9a6bd6" };
const COLUMNS: Readonly<Record<string, string>> = { Goal: "#1f5fa8", Saved: "#b8501f", "Off target": "#137a59", Blocked: "#6e48a3" };
const BARS: Readonly<Record<string, string>> = { Goal: "#174a82", Saved: "#8f3e18", "Off target": "#0f5e45", Blocked: "#553880" };

/** d3.pie()'s datum for a slice: its row, its value and its angles, clockwise from 12 o'clock. */
interface Slice {
  readonly data: Outcome;
  readonly value: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>, parent: Element, text?: string): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text !== undefined) element.textContent = text;
  parent.appendChild(element);
  return element;
}

/** Binds a row to its element as D3 does. */
const bind = <E extends Element>(element: E, row: unknown): E => Object.assign(element, { __data__: row });
const arcOf = (key: string, slice: Slice): MarkGeometry => build.arc({ key, cx: 0, cy: 0, inner: 70, outer: 116, start: slice.startAngle, end: slice.endAngle });
const round = (value: number): number => Math.round(value * 1000) / 1000;

/** A D3 donut of shots, as host-switch.test.ts draws it: a title, a <path> per outcome in a <g> centred at (320, 150), each name outside its slice. */
function drawPie(parent: Element) {
  const svg = el("svg", { width: 640, height: 300, viewBox: "0 0 640 300", role: "group", "aria-label": "Shot outcomes, a pie" }, parent);
  const title = el("text", { class: "title", x: 12, y: 20 }, svg, "Shots by outcome");
  const plot = el("g", { transform: "translate(320,150)" }, svg);
  const total = outcomes.reduce((sum, row) => sum + row.shots, 0);
  let angle = 0;
  const marks = outcomes.map((row) => {
    const slice: Slice = { data: row, value: row.shots, startAngle: angle, endAngle: (angle += (row.shots / total) * TURN) };
    return bind(el("path", { d: arcOf(row.outcome, slice).outline.d, fill: PIE[row.outcome]! }, plot), slice);
  });
  const labels = el("g", { class: "labels", "text-anchor": "middle" }, plot);
  const names = marks.map((path) => {
    const { data, startAngle, endAngle } = (path as unknown as { __data__: Slice }).__data__;
    const mid = (startAngle + endAngle) / 2;
    return el("text", { transform: `translate(${round(140 * Math.sin(mid))},${round(-140 * Math.cos(mid))})`, dy: "0.35em" }, labels, data.outcome);
  });
  return { kind: "pie" as const, svg, plot, title, marks, names, values: [] as SVGTextElement[] };
}

interface ColumnsOptions {
  /** The order the columns stand in, left to right: by outcome, or most shots first. Their elements stay in outcome order. */
  readonly ranked?: boolean;
  /** The y axis's ticks and the grid's lines, in shots: 1 px a shot, from 0 at the plot's foot. */
  readonly ticks?: readonly number[];
  /** How far to the right the whole drawing sits, in px: a <g> around it. */
  readonly nudge?: number;
  readonly label?: string;
}

/**
 * D3 columns, as host-switch.test.ts draws them, with a grid and a y axis as d3.axisLeft() draws one
 * (its font and anchor on its <g>, a hidden domain, and a tick <g> each with a <line> and a <text>),
 * each in a margin <g> at (40, 20) beside the plot's, under it: a <rect> per outcome with its row
 * on __data__, 1 px a shot, each column's name under it and its count above it.
 */
function drawColumns(parent: Element, { ranked = false, ticks = [0, 50, 100, 150], nudge = 0, label = "Shot outcomes, columns" }: ColumnsOptions = {}) {
  const svg = el("svg", { width: 640, height: 300, viewBox: "0 0 640 300", role: "group", "aria-label": label }, parent);
  const frame = nudge === 0 ? svg : el("g", { transform: `translate(${nudge},0)` }, svg);
  const grid = el("g", { class: "grid", transform: "translate(40,20)" }, frame);
  const gridlines = ticks.map((value) => el("line", { x2: 560, y1: 240 - value, y2: 240 - value }, grid));
  const axis = drawAxis(frame, ticks);
  const plot = el("g", { transform: "translate(40,20)" }, frame);
  const order = ranked ? [...outcomes].sort((a, b) => b.shots - a.shots) : outcomes;
  const at = (row: Outcome): number => order.indexOf(row) * 140;
  const marks = outcomes.map((row) => bind(el("rect", { x: at(row) + 20, y: 240 - row.shots, width: 100, height: row.shots, fill: COLUMNS[row.outcome]! }, plot), row));
  const names = el("g", { class: "names", "text-anchor": "middle" }, plot);
  const values = el("g", { class: "values", "text-anchor": "middle" }, plot);
  return {
    kind: "columns" as const,
    svg,
    plot,
    grid,
    gridlines,
    axis,
    ticks,
    marks,
    names: outcomes.map((row) => el("text", { x: at(row) + 70, y: 258 }, names, row.outcome)),
    values: outcomes.map((row) => el("text", { x: at(row) + 70, y: 234 - row.shots }, values, String(row.shots)))
  };
}

/** The columns' y axis, as d3.axisLeft() draws one, in a margin <g> at (40, 20). */
function drawAxis(parent: Element, ticks: readonly number[]): SVGGElement {
  const axis = el("g", { class: "axis", transform: "translate(40,20)", fill: "none", "font-size": 10, "font-family": "sans-serif", "text-anchor": "end", "aria-hidden": "true" }, parent);
  el("path", { class: "domain", stroke: "currentColor", d: "M-6,240.5H0.5V0.5H-6" }, axis);
  for (const value of ticks) {
    const tick = el("g", { class: "tick", opacity: 1, transform: `translate(0,${240.5 - value})` }, axis);
    el("line", { stroke: "currentColor", x2: -6 }, tick);
    el("text", { fill: "currentColor", x: -9, dy: "0.32em" }, tick, String(value));
  }
  return axis;
}

/** D3 bars: a <rect> per outcome in a margin <g> at (100, 20), from x 0, 3 px a shot, each name left of it and its count at its end, over an x axis as d3.axisBottom() draws one. */
function drawBars(parent: Element) {
  const svg = el("svg", { width: 640, height: 300, viewBox: "0 0 640 300", role: "group", "aria-label": "Shot outcomes, bars" }, parent);
  const axis = el("g", { class: "axis", transform: "translate(100,276)", fill: "none", "font-size": 10, "font-family": "sans-serif", "text-anchor": "middle", "aria-hidden": "true" }, svg);
  el("path", { class: "domain", stroke: "currentColor", d: "M0.5,6V0.5H450.5V6" }, axis);
  for (const value of [0, 50, 100, 150]) {
    const tick = el("g", { class: "tick", opacity: 1, transform: `translate(${value * 3 + 0.5},0)` }, axis);
    el("line", { stroke: "currentColor", y2: 6 }, tick);
    el("text", { fill: "currentColor", y: 9, dy: "0.71em" }, tick, String(value));
  }
  const plot = el("g", { transform: "translate(100,20)" }, svg);
  const marks = outcomes.map((row, i) => bind(el("rect", { x: 0, y: i * 64 + 8, width: row.shots * 3, height: 44, fill: BARS[row.outcome]! }, plot), row));
  const names = el("g", { class: "names", "text-anchor": "end" }, plot);
  const values = el("g", { class: "values", "text-anchor": "start" }, plot);
  return {
    kind: "bars" as const,
    svg,
    plot,
    axis,
    marks,
    names: outcomes.map((row, i) => el("text", { x: -8, y: i * 64 + 34 }, names, row.outcome)),
    values: outcomes.map((row, i) => el("text", { x: row.shots * 3 + 6, y: i * 64 + 34 }, values, String(row.shots)))
  };
}

type Pie = ReturnType<typeof drawPie>;
type Columns = ReturnType<typeof drawColumns>;
type Bars = ReturnType<typeof drawBars>;
type Host = Pie | Columns | Bars;

/** The page's labels: each host's names, and its counts, each by its outcome. */
const labelsOf = (host: Host) => (): HostLabel[] => [
  ...host.names.map((element): HostLabel => ({ element, key: element.textContent!, role: "category" })),
  ...host.values.map((element, i): HostLabel => ({ element, key: host.names[i]!.textContent!, role: "value" }))
];

/** Each host as the page attaches it: by outcome, with keyboard and a name per mark; the pie's slices described with describe.arc. */
function attach(host: Host, e: ChartEnv): Attachment<unknown> {
  if (host.kind === "pie") {
    return expressive<Slice>(host.marks, { key: (d) => d.data.outcome, geometry: (_el, d, key) => arcOf(key, d), keyboard: true, markLabel: (d) => `${d.data.outcome}: ${d.value} shots` }, e) as Attachment<unknown>;
  }
  return expressive<Outcome>(host.marks, { key: (d) => d.outcome, value: (d) => d.shots, keyboard: true, markLabel: (d) => `${d.outcome}: ${d.shots} shots` }, e) as Attachment<unknown>;
}

/**
 * The guides a page names that hostView() leaves out, whatever its views draw: an element in
 * another <svg>, the host's own <svg>, one with no key, and things that aren't guides at all.
 */
function leftOut(host: Host): () => Iterable<unknown> {
  const elsewhere = document.createElementNS(SVG, "svg");
  const line = el("line", { x2: 10 }, elsewhere);
  return () => [{ element: line, key: "y" }, { element: host.svg, key: "root" }, { element: "axis" in host ? host.axis : host.title }, { key: "x" }, null, 3];
}

/** Three host views: a D3 pie, D3 columns and D3 bars, each attached and given to hostView() with its labels, and with `guides` when it's given. */
function hostViews(e: ChartEnv, guides?: (host: Host) => () => Iterable<unknown>) {
  const view = (draw: (parent: Element) => Host) => (container: HTMLElement) => {
    const host = draw(container);
    return hostView(attach(host, e), { labels: labelsOf(host), ...(guides ? { guides: guides(host) as never } : {}) });
  };
  return { pie: view(drawPie), columns: view(drawColumns), bars: view(drawBars) } satisfies ChartSwitchViews;
}

/** Our charts: a donut, its columns and its bars. */
function ourViews(e: ChartEnv) {
  return {
    donut: (el: HTMLElement, colors: ReturnType<typeof colorAssignment>) => donutChart(el, { label: "Shot outcomes, share of total", data: outcomes, category: "outcome", value: "shots", colors, width: 600 }, e),
    columns: (el: HTMLElement, colors: ReturnType<typeof colorAssignment>) =>
      barChart(el, { label: "Shot outcomes, counts", data: outcomes, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors, width: 600 }, e),
    bars: (el: HTMLElement, colors: ReturnType<typeof colorAssignment>) => barChart(el, { label: "Shot outcomes, bars", data: outcomes, y: "outcome", x: "shots", colorBy: "category", colors, width: 600 }, e)
  } satisfies ChartSwitchViews;
}

/** A D3 pie and our columns and bars. */
function mixedViews(e: ChartEnv) {
  const ours = ourViews(e);
  return {
    pie: (container: HTMLElement) => {
      const host = drawPie(container);
      return hostView(attach(host, e), { labels: labelsOf(host) });
    },
    columns: ours.columns,
    bars: ours.bars
  } satisfies ChartSwitchViews;
}

// ── What a switch shows ─────────────────────────────────────────────────────

/** The key of the focus stop or tab stop `element` is, as `view:key`; "button" for one outside the switch, "" for none. */
function stopOf(switcher: ChartSwitch<ChartSwitchViews>, names: readonly string[], element: Element | null): string {
  if (!element || element === document.body) return "";
  for (const name of names) {
    const chart = switcher.chart(name) as ChartSwitchView;
    if (!chart.element.contains(element)) continue;
    return `${name}:${chart.keyOf?.(element) ?? element.closest("[data-key]")?.getAttribute("data-key") ?? "?"}`;
  }
  return element.localName;
}

/** Markup with its numbers rounded to 1e-6 and the ids counted from the document's start without their number. */
const normal = (markup: string): string =>
  markup.replace(/-?\d+\.\d+(?:e-?\d+)?/g, (n) => String(Math.round(Number(n) * 1e6) / 1e6)).replace(/\b(ec-description|ec-focus-mask)-\d+/g, "$1-#");

/** A ResizeObserver stand-in: each one made, with what it observes, so a test can resize the switch's cell. */
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

// ── Guides ──────────────────────────────────────────────────────────────────

/**
 * The guides a page names, read from the host's <svg> each time, as a page that draws again would:
 * the columns' y axis, and each gridline by its value; the bars' x axis; and the pie's title, by a
 * mark's key.
 */
function namedGuides(host: Host): () => HostGuide[] {
  return () => {
    const axis = host.svg.querySelector(".axis");
    if (host.kind === "pie") return [{ element: host.title, key: "Goal" }];
    if (host.kind === "bars") return [{ element: axis!, key: "x" }];
    const lines = Array.from(host.svg.querySelectorAll(".grid line"), (line): HostGuide => ({ element: line, key: `grid ${240 - Number(line.getAttribute("y1"))}` }));
    return [{ element: axis!, key: "y" }, ...lines];
  };
}

const COLUMN_VIEWS = {
  columns: (parent: Element) => drawColumns(parent),
  ranked: (parent: Element) => drawColumns(parent, { ranked: true, label: "Shot outcomes, most first" }),
  taller: (parent: Element) => drawColumns(parent, { ticks: [0, 50, 100, 150, 200], label: "Shot outcomes, up to 200" })
};

/** The columns' guides' keys, in the order the page names them. */
const KEPT = ["y", "grid 0", "grid 50", "grid 100", "grid 150"];
/** Where their copies are put, in jsdom, which has no layout: through the transforms of each one's parent, the axis's the <svg> and the gridlines' the grid's <g>. */
const PLACES = [null, ...KEPT.slice(1).map(() => "matrix(1 0 0 1 40 20)")];

interface GuideSetupOptions {
  readonly mode?: MotionMode;
  readonly reduced?: boolean;
  /** The view shown first. Default: the first. */
  readonly initial?: string;
  /** A ResizeObserver stand-in, the cell 600 px wide at first. */
  readonly resizable?: boolean;
  /** Each host's guides. Default: namedGuides. */
  readonly guides?: (host: Host) => () => Iterable<HostGuide>;
}

/** Host views in a switch, each drawn by its function, attached and given to hostView() with its labels and its guides. */
function guideSetup(draws: Readonly<Record<string, (parent: Element) => Host>>, options: GuideSetupOptions = {}) {
  const e = env(options.mode, options.reduced);
  const resize = options.resizable ? stubResize() : undefined;
  const target = document.body.appendChild(document.createElement("div"));
  const hosts: Record<string, Host> = {};
  /** Each host's <svg> as it drew it, before it was attached. */
  const drawn: Record<string, string> = {};
  const views = Object.fromEntries(
    Object.entries(draws).map(([name, draw]) => [
      name,
      (container: HTMLElement) => {
        const host = (hosts[name] = draw(container));
        drawn[name] = host.svg.outerHTML;
        return hostView(attach(host, e), { labels: labelsOf(host), guides: (options.guides ?? namedGuides)(host) });
      }
    ])
  ) satisfies ChartSwitchViews;
  const names = Object.keys(views);
  const switcher = chartSwitch(target, { views, initial: options.initial ?? names[0]!, transition: morph(), colors: colorAssignment({ Goal: 1, Saved: 2, "Off target": 3, Blocked: 4 }) }, e);
  const wrapper = target.firstElementChild as HTMLDivElement;
  resize?.(wrapper, 600);
  const overlay = wrapper.querySelector(":scope > .ec-switch-overlay") as SVGSVGElement;
  /** Each host's <svg> at rest, attached. */
  const rest = Object.fromEntries(names.map((name) => [name, hosts[name]!.svg.outerHTML]));
  return {
    switcher,
    e,
    clock: e.clock,
    hosts,
    drawn,
    rest,
    wrapper,
    overlay,
    container: (view: string) => wrapper.querySelector(`:scope > [data-view="${view}"]`) as HTMLDivElement,
    resize: (width: number) => resize?.(wrapper, width),
    /** Each copy of a guide in the overlay, in its layer's order: the old view's, then the new view's. */
    copies: () =>
      Array.from(overlay.querySelectorAll<SVGGElement>(":scope > .ec-switch-guides > g"), (group) => ({
        key: group.getAttribute("data-key")!,
        opacity: group.getAttribute("opacity"),
        transform: group.getAttribute("transform"),
        copy: group.firstElementChild as SVGElement
      })),
    async advance(ms: number) {
      e.clock.advance(ms);
      await flush();
    }
  };
}

type GuideSetup = ReturnType<typeof guideSetup>;

/** The switch's s after `ms` of a switch from its start. */
const at = (ms: number): number => easeInOutCubic(ms / 950);

/** Each key's copies' opacities, in the layer's order: the old view's, then the new one's. */
function opacities(s: GuideSetup): Map<string, (string | null)[]> {
  const out = new Map<string, (string | null)[]>();
  for (const { key, opacity } of s.copies()) out.set(key, [...(out.get(key) ?? []), opacity]);
  return out;
}

/** The element's markup and everything in it, with no style or id: what the host drew, without what's written inline. */
function bare(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const each of [copy, ...copy.querySelectorAll("*")]) {
    each.removeAttribute("style");
    each.removeAttribute("id");
  }
  return copy.outerHTML;
}

/** A host's markup with its tab stop left out, which a switch moves to the key focus or the tab stop had. */
const untabbed = (markup: string): string => markup.replace(/ tabindex="-?\d+"/g, "");
const asDrawn = (svg: Element): string => untabbed(svg.outerHTML);

const hidden = (element: Element): boolean => (element as SVGElement).style.getPropertyValue("visibility") === "hidden";

/** A host's guides as namedGuides names them. */
const guideElements = (host: Host): Element[] => namedGuides(host)().map((guide) => guide.element);

/**
 * Checks the frame: each kept key drawn once at full strength, the old view's until half way and the
 * new view's from there, and each copy that fades with its view as that view's other parts do.
 */
function expectFrame(s: GuideSetup, from: string, to: string, at: number, kept: readonly string[], fading: { readonly from: readonly string[]; readonly to: readonly string[] }): void {
  const byKey = opacities(s);
  for (const key of kept) expect(byKey.get(key), `${key} at s ${at}`).toEqual(at < 0.5 ? ["1", "0"] : ["0", "1"]);
  const copies = s.copies();
  const [first, second] = [copies.slice(0, copies.length - (kept.length + fading.to.length)), copies.slice(copies.length - (kept.length + fading.to.length))];
  for (const copy of first) if (fading.from.includes(copy.key)) expect(copy.opacity, `${from}'s ${copy.key}`).toBe(s.container(from).style.opacity);
  for (const copy of second) if (fading.to.includes(copy.key)) expect(copy.opacity, `${to}'s ${copy.key}`).toBe(s.container(to).style.opacity);
  expect(first.map((copy) => copy.key).sort()).toEqual([...kept, ...fading.from].sort());
  expect(second.map((copy) => copy.key).sort()).toEqual([...kept, ...fading.to].sort());
}

describe("guides: kept when both views draw them the same", () => {
  it("keeps a guide both views draw the same on screen at full strength on every frame, where it is: the old view's until half way, the new view's from there, both ways", async () => {
    const s = guideSetup(COLUMN_VIEWS);
    for (const [from, to] of [
      ["columns", "ranked"],
      ["ranked", "columns"]
    ] as const) {
      void s.switcher.show(to);
      // Each copy as its host draws its guide, its paint written inline, where it is: a <g> from its
      // parent's space into the overlay's, which jsdom, with no layout, puts at the <svg>'s origin.
      const copies = s.copies();
      expect(copies.map((copy) => bare(copy.copy))).toEqual([...guideElements(s.hosts[from]!), ...guideElements(s.hosts[to]!)].map(bare));
      expect(copies.map((copy) => copy.transform)).toEqual([...PLACES, ...PLACES]);
      // The host's own guides hidden while it plays, with its marks.
      for (const host of [s.hosts[from]!, s.hosts[to]!]) for (const element of guideElements(host)) expect(hidden(element)).toBe(true);
      for (let t = 0; t < 960; t += 16) {
        expectFrame(s, from, to, at(t), KEPT, { from: [], to: [] });
        // The views' other parts fade as they always have.
        expect(s.container(from).style.opacity).toBe(String(Math.round(Math.max(0, 1 - at(t) / 0.4) * 1000) / 1000));
        await s.advance(16);
      }
      expect(s.switcher.current).toBe(to);
      expect(s.copies()).toEqual([]);
      expect(s.overlay.querySelector(".ec-switch-guides")).toBeNull();
      for (const name of [from, to]) expect(asDrawn(s.hosts[name]!.svg)).toBe(untabbed(s.rest[name]!));
    }
  });

  it("draws the guides below the pairs, the fades and the labels, each copy in its host's computed paint, with no ids", () => {
    const s = guideSetup(COLUMN_VIEWS);
    s.hosts.columns!.svg.querySelector(".axis")!.setAttribute("id", "y-axis");
    s.hosts.ranked!.svg.querySelector(".axis")!.setAttribute("id", "y-axis-ranked");
    void s.switcher.show("ranked");
    expect(Array.from(s.overlay.children, (child) => child.getAttribute("class"))).toEqual(["ec-switch-guides", "ec-switch-fades", "ec-switch-runs", "ec-switch-labels"]);
    // Ids left out: the two axes are still drawn the same.
    expect(opacities(s).get("y")).toEqual(["1", "0"]);
    const [axis, grid] = s.copies().map((copy) => copy.copy);
    expect(axis!.hasAttribute("id")).toBe(false);
    // The page's CSS, which may not reach the overlay, written inline: the grid's stroke and dashes, and the axis's hidden domain.
    expect([grid!.style.getPropertyValue("stroke"), grid!.style.getPropertyValue("stroke-dasharray")]).toEqual(["rgb(225, 224, 217)", "2 2"]);
    expect(axis!.querySelector(".domain")!.getAttribute("style")).toContain("display: none");
    // An attribute stands where it isn't overridden: the ticks' opacity, the axis's anchor.
    expect(axis!.querySelector(".tick")!.getAttribute("opacity")).toBe("1");
    expect(axis!.style.getPropertyValue("text-anchor")).toBe("end");
  });

  it("keeps one at the same place within 0.5 px, and fades one 1 px away", async () => {
    for (const [nudge, kept] of [
      [0.4, true],
      [0.5, true],
      [0.6, false],
      [1, false]
    ] as const) {
      const s = guideSetup({ columns: (parent) => drawColumns(parent), nudged: (parent) => drawColumns(parent, { nudge, label: "Shot outcomes, nudged" }) });
      void s.switcher.show("nudged");
      const copies = s.copies();
      // The nudged view's copies are mapped through its <g>, as its marks are.
      expect(copies.map((copy) => copy.transform)).toEqual([...PLACES, `matrix(1 0 0 1 ${nudge} 0)`, ...KEPT.slice(1).map(() => `matrix(1 0 0 1 ${40 + nudge} 20)`)]);
      for (let t = 0; t < 960; t += 64) {
        if (kept) expectFrame(s, "columns", "nudged", at(t), KEPT, { from: [], to: [] });
        else expectFrame(s, "columns", "nudged", at(t), [], { from: KEPT, to: KEPT });
        await s.advance(64);
      }
      s.switcher.destroy();
    }
  });

  it("fades a gridline whose parent stretches it, though its markup and its box's corners are the same: its stroke is drawn thicker", async () => {
    // A rule across the plot, its box of no height, in a <g> that's stretched in the second view (Codex's review of M16 step 2).
    const ruled = (stretch: number, ranked: boolean) => (parent: Element) => {
      const host = drawColumns(parent, { ranked, label: ranked ? "Shot outcomes, most first" : "Shot outcomes, columns" });
      el("line", { class: "rule", x2: 560 }, el("g", { transform: `translate(40,110)${stretch === 1 ? "" : ` scale(1,${stretch})`}` }, host.svg));
      return host;
    };
    const guides = (host: Host) => () => [...namedGuides(host)(), { element: host.svg.querySelector(".rule")!, key: "rule" }];
    for (const [stretch, kept] of [
      [2, false],
      [1, true]
    ] as const) {
      const s = guideSetup({ columns: ruled(1, false), ranked: ruled(stretch, true) }, { guides });
      void s.switcher.show("ranked");
      for (let t = 0; t < 960; t += 64) {
        if (kept) expectFrame(s, "columns", "ranked", at(t), [...KEPT, "rule"], { from: [], to: [] });
        else expectFrame(s, "columns", "ranked", at(t), KEPT, { from: ["rule"], to: ["rule"] });
        await s.advance(64);
      }
      s.switcher.destroy();
    }
  });

  it("keeps each guide its two views draw the same, and fades the rest: an axis with another tick, a gridline with no partner", async () => {
    const s = guideSetup(COLUMN_VIEWS);
    const grid = KEPT.slice(1);
    void s.switcher.show("taller");
    for (let t = 0; t < 960; t += 16) {
      expectFrame(s, "columns", "taller", at(t), grid, { from: ["y"], to: ["y", "grid 200"] });
      await s.advance(16);
    }
    void s.switcher.show("columns");
    for (let t = 0; t < 960; t += 16) {
      expectFrame(s, "taller", "columns", at(t), grid, { from: ["y", "grid 200"], to: ["y"] });
      await s.advance(16);
    }
  });

  it("pairs a guide with a guide alone: one keyed as a mark is, and guides with no partner, fade with their views while the marks pair", async () => {
    const s = guideSetup({ pie: drawPie, columns: (parent) => drawColumns(parent), bars: drawBars });
    void s.switcher.show("columns");
    for (let t = 0; t < 960; t += 16) {
      expectFrame(s, "pie", "columns", at(t), [], { from: ["Goal"], to: KEPT });
      // The pie's title, keyed as the Goal slice is, fades, and the slice morphs into its column.
      expect(s.overlay.querySelector('.ec-switch-runs > .ec-run[data-key="Goal"]')).not.toBeNull();
      await s.advance(16);
    }
    void s.switcher.show("bars");
    for (let t = 0; t < 960; t += 16) {
      expectFrame(s, "columns", "bars", at(t), [], { from: KEPT, to: ["x"] });
      await s.advance(16);
    }
  });

  it("keeps each key once: a second guide with a key fades with its view", () => {
    const twice = (host: Host) => () => [...namedGuides(host)(), ...namedGuides(host)().slice(0, 1)];
    const s = guideSetup(COLUMN_VIEWS, { guides: twice });
    void s.switcher.show("ranked");
    expect(opacities(s).get("y")).toEqual(["1", "1", "0", "0"]);
    s.clock.advance(304);
    expect(opacities(s).get("y")).toEqual(["1", s.container("columns").style.opacity, "0", "0"]);
  });
});

describe("guides: a switch back, a staged jump and a third view", () => {
  for (const p of [0.2, 0.5, 0.8]) {
    it(`keeps a guide through a switch back at ${p}, playing the same picture backwards, and gives the host back what it had once that lands`, async () => {
      const s = guideSetup(COLUMN_VIEWS);
      // The frame nearest p of the way.
      const back = 16 * Math.round((950 * unease(p)) / 16);
      void s.switcher.show("ranked");
      for (let t = 0; t < back; t += 16) await s.advance(16);
      void s.switcher.show("columns");
      // Back from where it is: the same s, frame by frame, as it went.
      for (let t = back; t > 0; t -= 16) {
        expectFrame(s, "columns", "ranked", at(t), KEPT, { from: [], to: [] });
        await s.advance(16);
      }
      await s.advance(16);
      expect(s.switcher.current).toBe("columns");
      expect(s.copies()).toEqual([]);
      for (const name of ["columns", "ranked"]) expect(asDrawn(s.hosts[name]!.svg)).toBe(untabbed(s.rest[name]!));
    });
  }

  it("keeps the guides each leg's two views share through a staged jump, on every frame of both legs", async () => {
    const s = guideSetup(COLUMN_VIEWS);
    const grid = KEPT.slice(1);
    void s.switcher.show("ranked", { via: "taller" });
    for (let t = 0; t < 960; t += 16) {
      expectFrame(s, "columns", "taller", at(t), grid, { from: ["y"], to: ["y", "grid 200"] });
      await s.advance(16);
    }
    // The second leg begins with the via view's own guides, where the first left them.
    for (let t = 0; t < 960; t += 16) {
      expectFrame(s, "taller", "ranked", at(t), grid, { from: ["y", "grid 200"], to: ["y"] });
      await s.advance(16);
    }
    expect(s.switcher.current).toBe("ranked");
    expect(s.copies()).toEqual([]);
    for (const name of Object.keys(COLUMN_VIEWS)) expect(asDrawn(s.hosts[name]!.svg)).toBe(untabbed(s.rest[name]!));
  });

  it("keeps them when a third view lands the switch: the guides of the view it lands on, from there", async () => {
    const s = guideSetup(COLUMN_VIEWS);
    void s.switcher.show("ranked");
    await s.advance(304);
    void s.switcher.show("taller");
    // Landed on ranked, and on from there: ranked's guides, each grid line at full strength.
    expect(asDrawn(s.hosts.columns!.svg)).toBe(untabbed(s.rest.columns!));
    expect(s.copies().slice(0, KEPT.length).map((copy) => bare(copy.copy))).toEqual(guideElements(s.hosts.ranked!).map(bare));
    for (let t = 0; t < 960; t += 16) {
      expectFrame(s, "ranked", "taller", at(t), KEPT.slice(1), { from: ["y"], to: ["y", "grid 200"] });
      await s.advance(16);
    }
    expect(s.switcher.current).toBe("taller");
    for (const name of Object.keys(COLUMN_VIEWS)) expect(asDrawn(s.hosts[name]!.svg)).toBe(untabbed(s.rest[name]!));
  });
});

describe("guides: the host's DOM", () => {
  it("is given back as it was when the switch is landed by a resize or by motion turning off, and as drawn when it's destroyed mid-way", async () => {
    for (const end of ["resize", "off", "destroy"] as const) {
      const s = guideSetup(COLUMN_VIEWS, { resizable: true });
      void s.switcher.show("ranked");
      await s.advance(304);
      expect(guideElements(s.hosts.ranked!).every(hidden)).toBe(true);
      if (end === "resize") s.resize(500);
      else if (end === "off") s.e.motion.setMode("off");
      else s.switcher.destroy();
      if (end === "destroy") {
        expect(s.wrapper.isConnected).toBe(false);
        for (const name of ["columns", "ranked"]) expect(s.hosts[name]!.svg.outerHTML).toBe(s.drawn[name]);
      } else {
        expect(s.switcher.current).toBe("ranked");
        expect(s.copies()).toEqual([]);
        for (const name of ["columns", "ranked"]) expect(asDrawn(s.hosts[name]!.svg)).toBe(untabbed(s.rest[name]!));
        s.switcher.destroy();
      }
    }
  });

  it("hides the guides a host draws anew mid-switch, read again after its refresh: one drawn the same stays put, its copy as it was", async () => {
    const s = guideSetup(COLUMN_VIEWS);
    void s.switcher.show("ranked");
    await s.advance(304);
    const before = s.overlay.innerHTML;
    // The host draws its axis again, a new element drawn the same, and refreshes.
    const host = s.hosts.ranked as Columns;
    const old = host.svg.querySelector(".axis")!;
    const anew = drawAxis(host.svg, host.ticks);
    old.replaceWith(anew);
    s.switcher.chart("ranked").refresh();
    expect(hidden(anew)).toBe(true);
    expect(s.overlay.innerHTML).toBe(before);
    for (let t = 304; t < 960; t += 16) {
      expectFrame(s, "columns", "ranked", at(t), KEPT, { from: [], to: [] });
      await s.advance(16);
    }
    expect(s.switcher.current).toBe("ranked");
    expect(asDrawn(s.hosts.ranked!.svg)).toBe(untabbed(s.rest.ranked!));
    expect(old.hasAttribute("style")).toBe(false);
  });

  it("hides one drawn anew that isn't drawn the same too: the switch plays on with the copy it began with, as with labels, and the host's new drawing shows once it lands", async () => {
    const s = guideSetup(COLUMN_VIEWS);
    void s.switcher.show("ranked");
    await s.advance(304);
    const before = s.overlay.innerHTML;
    const host = s.hosts.ranked as Columns;
    const anew = drawAxis(host.svg, [0, 50, 100, 150, 200]);
    host.svg.querySelector(".axis")!.replaceWith(anew);
    const drawnAnew = anew.outerHTML;
    s.switcher.chart("ranked").refresh();
    expect(hidden(anew)).toBe(true);
    expect(s.overlay.innerHTML).toBe(before);
    await s.advance(656);
    expect(s.switcher.current).toBe("ranked");
    // The axis as the host drew it anew, and nothing of the switch's left in its <svg>.
    expect(anew.outerHTML).toBe(drawnAnew);
    expect(host.svg.outerHTML).not.toMatch(/visibility: hidden|ec-morphing/);
  });
});

describe("guides: what hostView() takes", () => {
  it("gives the page's guides, leaving out one that isn't in the host's <svg>, the <svg> itself, one with no key, and every guide when guides throws (reported)", () => {
    const e = env();
    const host = drawColumns(document.body);
    const view = hostView(attach(host, e), { guides: leftOut(host) as () => Iterable<HostGuide> });
    expect(view.guides()).toEqual([]);
    const named = namedGuides(host);
    const other = drawColumns(document.body);
    const both = hostView(attach(other, e), { guides: () => [...(leftOut(other)() as HostGuide[]), ...namedGuides(other)()] });
    expect(both.guides()).toEqual(namedGuides(other)());
    // Hidden while it morphs, as its marks are; the ones left out aren't.
    view.morphing(true);
    expect(hidden(host.axis)).toBe(false);
    view.morphing(false);
    const mine = hostView(attach(host, e), { guides: named });
    mine.morphing(true);
    expect(guideElements(host).every(hidden)).toBe(true);
    expect(mine.guides().map((guide) => guide.element)).toEqual(guideElements(host));
    mine.morphing(false);
    expect(guideElements(host).some(hidden)).toBe(false);

    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    const failing = hostView(attach(drawColumns(document.body), e), {
      guides: () => {
        throw new Error("no guides");
      }
    });
    expect(failing.guides()).toEqual([]);
    expect(reported).toHaveBeenCalledWith(new Error("no guides"));
  });

  it("switches with guides that throw as with none: nothing copied, and their parts fade with their views", async () => {
    vi.stubGlobal("reportError", vi.fn());
    const s = guideSetup(COLUMN_VIEWS, {
      guides: () => () => {
        throw new Error("no guides");
      }
    });
    void s.switcher.show("ranked");
    expect(s.overlay.querySelector(".ec-switch-guides")).toBeNull();
    expect(hidden(s.hosts.columns!.svg.querySelector(".axis")!)).toBe(false);
    await s.advance(960);
    expect(asDrawn(s.hosts.columns!.svg)).toBe(untabbed(s.rest.columns!));
  });

  it("takes a view's own guides as it takes hostView()'s: one in the view's <svg> with a key, and none that isn't", () => {
    const e = env();
    const target = document.body.appendChild(document.createElement("div"));
    // A view of the page's own, made from a host view, whose guides() gives what it likes.
    const own = (ranked: boolean) => (container: HTMLElement): ChartSwitchView => {
      const host = drawColumns(container, { ranked });
      const view = hostView(attach(host, e));
      const outside = el("line", {}, document.createElementNS(SVG, "svg"));
      return {
        element: view.element,
        space: view.space,
        marks: () => view.marks(),
        labels: () => view.labels(),
        focus: (key) => view.focus(key),
        leave: () => view.leave(),
        destroy: () => view.destroy(),
        morphing: (on) => view.morphing(on),
        guides: () => [null, { element: outside, key: "y" }, { element: host.svg, key: "y" }, { element: host.axis }, { key: "y" }, { element: host.axis, key: "y" }] as never
      };
    };
    const switcher = chartSwitch(target, { views: { columns: own(false), ranked: own(true) }, initial: "columns", transition: morph() }, e);
    void switcher.show("ranked");
    const groups = Array.from(target.querySelectorAll(".ec-switch-overlay > .ec-switch-guides > g"), (group) => [group.getAttribute("data-key"), group.getAttribute("opacity")]);
    expect(groups).toEqual([
      ["y", "1"],
      ["y", "0"]
    ]);
    switcher.destroy();
  });

  it("throws a TypeError on guides that aren't a function", () => {
    const e = env();
    const host = drawColumns(document.body);
    expect(() => hostView(attach(host, e), { guides: [] as never })).toThrow(
      new TypeError('hostView: guides must be a function that returns the host\'s guides, such as () => [{ element: svg.querySelector("g.axis"), key: "y" }].')
    );
  });
});

describe("guides: motion", () => {
  it("keeps them in Analysis, on every frame of its shorter switch", async () => {
    const s = guideSetup(COLUMN_VIEWS, { mode: "analysis" });
    const landed = vi.fn();
    void s.switcher.show("ranked").then(landed);
    let frames = 0;
    while (!landed.mock.calls.length && frames < 30) {
      // Each kept key drawn once at full strength, the old view's first.
      const byKey = opacities(s);
      expect([...byKey.keys()]).toEqual(KEPT);
      for (const key of KEPT) expect(byKey.get(key)!.filter((opacity) => opacity === "1")).toHaveLength(1);
      frames++;
      await s.advance(16);
    }
    expect(landed).toHaveBeenCalled();
    expect(frames).toBeLessThan(15);
    expect(s.copies()).toEqual([]);
    expect(asDrawn(s.hosts.ranked!.svg)).toBe(untabbed(s.rest.ranked!));
  });

  for (const [name, options] of [
    ["motion off", { mode: "off" }],
    ["reduced motion", { reduced: true }]
  ] as const) {
    it(`goes straight there with ${name}: no guide read, copied or hidden`, async () => {
      const read = vi.fn(namedGuides);
      const s = guideSetup(COLUMN_VIEWS, { ...options, guides: (host) => () => read(host)() });
      read.mockClear();
      const shown = s.switcher.show("ranked");
      expect(s.switcher.current).toBe("ranked");
      expect(read).not.toHaveBeenCalled();
      expect(s.overlay.querySelector(".ec-switch-guides")).toBeNull();
      for (const host of Object.values(s.hosts)) expect(guideElements(host).some(hidden)).toBe(false);
      await shown;
    });
  }
});

// ── Switches with no guides, as on main ─────────────────────────────────────

/**
 * What each switch is shown, in turn, and for how long. A view's name shows it, and "view/via" shows
 * it staged through `via`: "!" first focuses "Off target" in the view on show, and "^" a button outside
 * the switch. "off" turns motion off and "on" back to the case's mode; "resize" makes the cell 100 px
 * narrower; "destroy" destroys the switch.
 */
type Steps = readonly (readonly [step: string, ms: number])[];

interface Case {
  /** Our charts, host views (as drawn, or given guides hostView() leaves out), or a host pie with our columns and bars. */
  readonly views?: "ours" | "hosts" | "left out" | "mixed";
  readonly mode?: MotionMode;
  readonly reduced?: boolean;
  readonly initial: string;
  readonly steps: Steps;
}

const HOST_STEPS: Steps = [
  ["!columns", 960],
  ["pie", 400],
  ["columns", 300],
  ["bars", 960],
  ["^pie/columns", 1920],
  ["bars/columns", 304],
  ["pie", 640],
  ["columns", 960]
];

/** The switches pinned on main: views with no guides, through every way a switch goes. */
const CASES: Readonly<Record<string, Case>> = {
  "our three views": {
    initial: "donut",
    steps: [
      ["!columns", 960],
      ["donut", 400],
      ["columns", 300],
      ["bars", 960],
      ["^donut/columns", 1920],
      ["bars/columns", 304],
      ["donut", 640],
      ["columns", 960]
    ]
  },
  "three host views": { views: "hosts", initial: "pie", steps: HOST_STEPS },
  "host views given guides they leave out": { views: "left out", initial: "pie", steps: HOST_STEPS },
  "a host pie and our columns": {
    views: "mixed",
    initial: "pie",
    steps: [
      ["!columns", 960],
      ["pie", 400],
      ["bars/columns", 1920]
    ]
  },
  "host views in Analysis": {
    views: "hosts",
    mode: "analysis",
    initial: "pie",
    steps: [
      ["!columns", 208],
      ["pie", 96],
      ["bars/columns", 112],
      ["columns", 208]
    ]
  },
  "host views landed early": {
    views: "hosts",
    initial: "pie",
    steps: [
      ["!bars", 304],
      ["off", 32],
      ["on", 0],
      ["columns", 304],
      ["resize", 32],
      ["pie/bars", 304],
      ["destroy", 32]
    ]
  },
  "host views with reduced motion": {
    views: "hosts",
    reduced: true,
    initial: "pie",
    steps: [
      ["!columns", 32],
      ["bars/pie", 32],
      ["^pie", 32]
    ]
  },
  "our views with motion off": {
    mode: "off",
    initial: "donut",
    steps: [
      ["!columns", 32],
      ["bars/donut", 32],
      ["^donut", 32]
    ]
  }
};

/**
 * Each case's digest: every 16 ms frame of its markup (views, overlay and live region), with numbers
 * rounded and ids' counters gone; and, apart, what it says in words: each show()'s promise (new, or
 * the same as the last) and when it resolved, `current` after each call, where focus and each view's
 * tab stop are after each step, and what was announced. A browser runs promise callbacks between
 * frames, so these do too.
 */
async function digests(cases: Readonly<Record<string, Case>>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, { views: kind = "ours", mode, reduced, initial, steps }] of Object.entries(cases)) {
    const e = env(mode, reduced);
    const resize = stubResize();
    const target = document.body.appendChild(document.createElement("div"));
    const views: ChartSwitchViews = kind === "ours" ? ourViews(e) : kind === "mixed" ? mixedViews(e) : hostViews(e, kind === "left out" ? leftOut : undefined);
    const names = Object.keys(views);
    const switcher = chartSwitch(target, { views, initial, transition: morph(), colors: colorAssignment({ Goal: 1, Saved: 2, "Off target": 3, Blocked: 4 }), announce: true }, e);
    const wrapper = target.firstElementChild!;
    const said = announcements(wrapper.querySelector('[role="status"]')!);
    const button = document.body.appendChild(document.createElement("button"));
    let width = 600;
    resize(wrapper, width);
    let frames = "";
    const words: string[] = [];
    let last: Promise<void> | undefined;
    let calls = 0;
    for (const [step, ms] of steps) {
      if (step === "off") e.motion.setMode("off");
      else if (step === "on") e.motion.setMode(mode ?? "presentation");
      else if (step === "resize") resize(wrapper, (width -= 100));
      else if (step === "destroy") switcher.destroy();
      else {
        const [view, via] = step.replace(/^[!^]/, "").split("/") as [string, string | undefined];
        if (step.startsWith("!")) switcher.chart(switcher.current).focus("Off target");
        if (step.startsWith("^")) button.focus();
        const call = ++calls;
        const promise = via === undefined ? switcher.show(view) : switcher.show(view, { via });
        words.push(`#${call} ${step}: ${promise === last ? "same" : "new"}, current ${switcher.current}`);
        last = promise;
        void promise.then(() => words.push(`#${call} resolved at ${e.clock.now()}`));
      }
      for (let t = 0; t < ms; t += 16) {
        frames += `${normal(target.innerHTML)}\n`;
        e.clock.advance(16);
        await flush();
      }
      await flush();
      const stops = names.map((each) => stopOf(switcher, names, switcher.chart(each).element.querySelector('[tabindex="0"]')));
      words.push(`after ${step}: focus ${stopOf(switcher, names, document.activeElement)}; tab stops ${stops.join(", ")}`);
    }
    words.push(`said: ${said().join(" | ")}`);
    out[name] = `${hash(frames)} ${hash(words.join("\n"))}`;
    switcher.destroy();
    target.remove();
    button.remove();
    vi.unstubAllGlobals();
  }
  return out;
}

/** The digests main (779118e, 0.10.0's code on jsdom 31) gave, with this file's digests() run there before guides came in: each frames' then words'. */
const MAIN: Readonly<Record<string, string>> = {
  "our three views": "e070f98c616355a4 dc79e87260aad68d",
  "three host views": "a4d7485a870aa851 ad62f55d3b75a3f0",
  "host views given guides they leave out": "a4d7485a870aa851 ad62f55d3b75a3f0",
  "a host pie and our columns": "5e3de8869f96fe84 9d291a18505c2337",
  "host views in Analysis": "d256befd5519f2c4 ca0921cb5a3a3e5e",
  "host views landed early": "0a57998bb0ac11cb f369d83914a64a53",
  "host views with reduced motion": "f36ca2baefc421f3 9babe0bc1a399da5",
  "our views with motion off": "dda2885bd4b8c4a9 d3c937bb3e2040df"
};

describe("every switch whose views have no guides, as on main", () => {
  it("draws every frame as on main, byte for byte, and says the same in words: ours, host views, host views given guides they leave out, a host and ours, in Presentation and Analysis, staged, landed early, with reduced motion and motion off", async () => {
    expect(await digests(CASES)).toEqual(MAIN);
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
