// Guides that stay put in a chart switch (M16 step 2): a guide (an axis, a grid, a tick) the page
// names in each view, through hostView()'s `guides`, stays on screen at full strength, where it is,
// while a switch plays, when both views draw it the same; every other part of each view fades as
// before. With the real morph() on a manual clock, on host views drawn as src/host-switch.test.ts
// draws its hosts (a D3 pie, D3 columns with a y axis and a grid, D3 bars with an x axis). Beside
// src/index.ts because it brings charts and an effect together, as only the composition root may.
// Last, every switch whose views have no guides as on main, byte for byte.

import { createMotion, describe as build, manualClock, type MarkGeometry, type MotionMode } from "./core";
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
  const axis = el("g", { class: "axis", transform: "translate(40,20)", fill: "none", "font-size": 10, "font-family": "sans-serif", "text-anchor": "end", "aria-hidden": "true" }, frame);
  el("path", { class: "domain", stroke: "currentColor", d: "M-6,240.5H0.5V0.5H-6" }, axis);
  for (const value of ticks) {
    const tick = el("g", { class: "tick", opacity: 1, transform: `translate(0,${240.5 - value})` }, axis);
    el("line", { stroke: "currentColor", x2: -6 }, tick);
    el("text", { fill: "currentColor", x: -9, dy: "0.32em" }, tick, String(value));
  }
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
