// A chart switch that stages a jump through a third view (M15 step 1): show(view, { via }), with the
// real morph() on a manual clock, on three views of our charts (a donut, its columns and its bars) and
// on three host views drawn as D3 draws them (a pie, columns and bars), as src/host-switch.test.ts
// draws its hosts. Beside src/index.ts because it brings charts and an effect together, as only the
// composition root may. Last, every show() without via as on main, byte for byte.

import { createMotion, describe as build, manualClock, type MarkGeometry, type MotionMode } from "./core";
import { formatPath, parsePath, transformPath } from "./core/geometry/path";
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
import type { ChartSwitchShowOptions } from "./index";

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

// The page's CSS for its hosts' labels, as a D3 page styles its text: jsdom computes it, as a browser would.
const css = document.head.appendChild(document.createElement("style"));
css.textContent = [
  ".labels text, .names text { font-family: Inter; font-size: 12px; font-weight: 600; fill: #333333; }",
  ".values text { font-family: Inter; font-size: 11px; font-weight: 400; fill: #555555; }"
].join("\n");
// Taken out once the file is done: the files a worker runs share its document.
afterAll(() => css.remove());

afterEach(() => {
  document.body.textContent = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Views ───────────────────────────────────────────────────────────────────

/** Our charts: a donut, its columns and its bars, and a fourth view, the donut largest first. */
function ourViews(e: ChartEnv, fourth = false) {
  return {
    donut: (el: HTMLElement, colors: ReturnType<typeof colorAssignment>) => donutChart(el, { label: "Shot outcomes, share of total", data: outcomes, category: "outcome", value: "shots", colors, width: 600 }, e),
    columns: (el: HTMLElement, colors: ReturnType<typeof colorAssignment>) =>
      barChart(el, { label: "Shot outcomes, counts", data: outcomes, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors, width: 600 }, e),
    bars: (el: HTMLElement, colors: ReturnType<typeof colorAssignment>) => barChart(el, { label: "Shot outcomes, bars", data: outcomes, y: "outcome", x: "shots", colorBy: "category", colors, width: 600 }, e),
    ...(fourth
      ? { ranked: (el: HTMLElement, colors: ReturnType<typeof colorAssignment>) => donutChart(el, { label: "Shot outcomes, largest first", data: outcomes, category: "outcome", value: "shots", sort: "value", colors, width: 600 }, e) }
      : {})
  } satisfies ChartSwitchViews;
}

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

/** A D3 donut of shots, as host-switch.test.ts draws it: a <path> per outcome in a <g> centred at (320, 150), each name outside its slice. */
function drawPie(parent: Element) {
  const svg = el("svg", { width: 640, height: 300, viewBox: "0 0 640 300", role: "group", "aria-label": "Shot outcomes, a pie" }, parent);
  const plot = el("g", { transform: "translate(320,150)" }, svg);
  const total = outcomes.reduce((sum, row) => sum + row.shots, 0);
  let angle = 0;
  const slices = outcomes.map((row) => {
    const slice: Slice = { data: row, value: row.shots, startAngle: angle, endAngle: (angle += (row.shots / total) * TURN) };
    return bind(el("path", { d: arcOf(row.outcome, slice).outline.d, fill: PIE[row.outcome]! }, plot), slice);
  });
  const labels = el("g", { class: "labels", "text-anchor": "middle" }, plot);
  const names = slices.map((path) => {
    const { data, startAngle, endAngle } = (path as unknown as { __data__: Slice }).__data__;
    const mid = (startAngle + endAngle) / 2;
    return el("text", { transform: `translate(${round(140 * Math.sin(mid))},${round(-140 * Math.cos(mid))})`, dy: "0.35em" }, labels, data.outcome);
  });
  return { svg, plot, marks: slices, names, values: [] as SVGTextElement[] };
}

/** D3 columns, as host-switch.test.ts draws them: a <rect> per outcome in a margin <g> at (40, 20), 1 px a shot, each name under it and its count above it. */
function drawColumns(parent: Element) {
  const svg = el("svg", { width: 640, height: 300, viewBox: "0 0 640 300", role: "group", "aria-label": "Shot outcomes, columns" }, parent);
  const plot = el("g", { transform: "translate(40,20)" }, svg);
  const columns = outcomes.map((row, i) => bind(el("rect", { x: i * 140 + 20, y: 240 - row.shots, width: 100, height: row.shots, fill: COLUMNS[row.outcome]! }, plot), row));
  const names = el("g", { class: "names", "text-anchor": "middle" }, plot);
  const values = el("g", { class: "values", "text-anchor": "middle" }, plot);
  return {
    svg,
    plot,
    marks: columns,
    names: outcomes.map((row, i) => el("text", { x: i * 140 + 70, y: 258 }, names, row.outcome)),
    values: outcomes.map((row, i) => el("text", { x: i * 140 + 70, y: 234 - row.shots }, values, String(row.shots)))
  };
}

/** D3 bars: a <rect> per outcome in a margin <g> at (100, 20), from x 0, 3 px a shot, each name left of it and its count at its end. */
function drawBars(parent: Element) {
  const svg = el("svg", { width: 640, height: 300, viewBox: "0 0 640 300", role: "group", "aria-label": "Shot outcomes, bars" }, parent);
  const plot = el("g", { transform: "translate(100,20)" }, svg);
  const bars = outcomes.map((row, i) => bind(el("rect", { x: 0, y: i * 64 + 8, width: row.shots * 3, height: 44, fill: BARS[row.outcome]! }, plot), row));
  const names = el("g", { class: "names", "text-anchor": "end" }, plot);
  const values = el("g", { class: "values", "text-anchor": "start" }, plot);
  return {
    svg,
    plot,
    marks: bars,
    names: outcomes.map((row, i) => el("text", { x: -8, y: i * 64 + 34 }, names, row.outcome)),
    values: outcomes.map((row, i) => el("text", { x: row.shots * 3 + 6, y: i * 64 + 34 }, values, String(row.shots)))
  };
}

type Host = ReturnType<typeof drawPie> | ReturnType<typeof drawColumns>;

/** The page's labels: each host's names, and its counts, each by its outcome. */
const labelsOf = (host: Host) => (): HostLabel[] => [
  ...host.names.map((element): HostLabel => ({ element, key: element.textContent!, role: "category" })),
  ...host.values.map((element, i): HostLabel => ({ element, key: host.names[i]!.textContent!, role: "value" }))
];

/** Each host as the page attaches it: by outcome, with keyboard and a name per mark; the pie's slices described with describe.arc. */
function attach(host: Host, e: ChartEnv): Attachment<unknown> {
  if (host.svg.getAttribute("aria-label") === "Shot outcomes, a pie") {
    return expressive<Slice>(host.marks, { key: (d) => d.data.outcome, geometry: (_el, d, key) => arcOf(key, d), keyboard: true, markLabel: (d) => `${d.data.outcome}: ${d.value} shots` }, e) as Attachment<unknown>;
  }
  return expressive<Outcome>(host.marks, { key: (d) => d.outcome, value: (d) => d.shots, keyboard: true, markLabel: (d) => `${d.outcome}: ${d.shots} shots` }, e) as Attachment<unknown>;
}

/** Three host views: a D3 pie, D3 columns and D3 bars, each attached and given to hostView() with its labels. `drawn` gets each host as it's drawn. */
function hostViews(e: ChartEnv, drawn: Record<string, Host> = {}) {
  const view = (draw: (parent: Element) => Host, name: string) => (container: HTMLElement) => {
    const host = (drawn[name] = draw(container));
    return hostView(attach(host, e), { labels: labelsOf(host) });
  };
  return { pie: view(drawPie, "pie"), columns: view(drawColumns, "columns"), bars: view(drawBars, "bars") } satisfies ChartSwitchViews;
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

/** Each element with its attributes in order of name, an empty style left out: two switches that drew the same picture by different paths write the same. */
function canonical(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  const attributes = Array.from(element.attributes, (each) => `${each.name}="${each.value}"`).filter((each) => each !== 'style=""');
  return `<${[element.localName, ...attributes.sort()].join(" ")}>${Array.from(element.childNodes, canonical).join("")}</${element.localName}>`;
}

// ── A staged jump ───────────────────────────────────────────────────────────

const COLORS = { Goal: 1, Saved: 2, "Off target": 3, Blocked: 4 };

interface SetupOptions {
  /** Host views (a pie, columns and bars), or our charts (a donut, its columns and its bars). */
  readonly hosts?: boolean;
  /** A fourth of our views: the donut, largest first. */
  readonly fourth?: boolean;
  readonly mode?: MotionMode;
  readonly reduced?: boolean;
  /** The view shown first. Default: the first. */
  readonly initial?: string;
  /** A ResizeObserver stand-in, the cell 600 px wide at first. */
  readonly resizable?: boolean;
}

function setup(options: SetupOptions = {}) {
  const e = env(options.mode, options.reduced);
  const resize = options.resizable ? stubResize() : undefined;
  const target = document.body.appendChild(document.createElement("div"));
  const hosts: Record<string, Host> = {};
  const views: ChartSwitchViews = options.hosts ? hostViews(e, hosts) : ourViews(e, options.fourth);
  const names = Object.keys(views);
  const switcher = chartSwitch(target, { views, initial: options.initial ?? names[0]!, transition: morph(), colors: colorAssignment(COLORS), announce: true }, e);
  const wrapper = target.firstElementChild as HTMLDivElement;
  const said = announcements(wrapper.querySelector('[role="status"]')!);
  resize?.(wrapper, 600);
  const chart = (view: string): ChartSwitchView => switcher.chart(view);
  return {
    switcher,
    e,
    clock: e.clock,
    names,
    hosts,
    target,
    wrapper,
    overlay: wrapper.querySelector(":scope > .ec-switch-overlay") as SVGSVGElement,
    container: (view: string) => wrapper.querySelector(`:scope > [data-view="${view}"]`) as HTMLDivElement,
    said,
    chart,
    label: (view: string) => chart(view).element.getAttribute("aria-label")!,
    resize: (width: number) => resize?.(wrapper, width),
    focused: () => stopOf(switcher, names, document.activeElement),
    tabStop: (view: string) => stopOf(switcher, names, chart(view).element.querySelector('[tabindex="0"]')),
    async advance(ms: number) {
      e.clock.advance(ms);
      await flush();
    }
  };
}

type Setup = ReturnType<typeof setup>;

/** What to do at a frame: a show(), whose promise is followed, or anything else. */
type Act = (s: Setup) => unknown;

/**
 * A switch filmed: every 16 ms frame from 0 to `ms`, each act run at its frame first. `frames` has
 * each frame's markup, its attributes in order and its numbers and ids as normal() makes them, and
 * `focus` where focus is then. `promises` says when each show() was called and whether it returned
 * the last one's promise, and when each resolved.
 */
async function film(options: SetupOptions, acts: Readonly<Record<number, Act>>, ms: number) {
  const s = setup(options);
  const frames: string[] = [];
  const focus: string[] = [];
  const promises: string[] = [];
  let last: unknown;
  let calls = 0;
  await flush();
  for (let t = 0; t <= ms; t += 16) {
    const result = acts[t]?.(s);
    if (result instanceof Promise) {
      const call = ++calls;
      promises.push(`#${call} at ${t}${result === last ? ", the same" : ""}`);
      last = result;
      void result.then(() => promises.push(`#${call} resolved at ${s.clock.now()}`));
    }
    frames.push(normal(canonical(s.wrapper)));
    focus.push(s.focused());
    s.clock.advance(16);
    await flush();
  }
  return { s, frames, focus, promises };
}

/** Moves each time in a promises log on by `ms`: a switch begun that much later. */
const later = (log: readonly string[], ms: number): string[] => log.map((line) => line.replace(/at (\d+)/, (_, at: string) => `at ${Number(at) + ms}`));

/** What the overlay draws now: each pair's path data by key, and the label copies that can be seen, sorted; and how much each view's other parts show. */
function scene(s: Setup) {
  const visible = (text: Element): boolean => text.getAttribute("visibility") !== "hidden" && text.getAttribute("opacity") !== "0";
  return {
    runs: Object.fromEntries(Array.from(s.overlay.querySelectorAll(".ec-switch-runs > .ec-run"), (group) => [group.getAttribute("data-key"), group.querySelector("path")!.getAttribute("d")])),
    labels: Array.from(s.overlay.querySelectorAll(".ec-switch-labels > text"))
      .filter(visible)
      .map((text) => `${text.textContent} at ${round(Number(text.getAttribute("x")))},${round(Number(text.getAttribute("y")))}`)
      .sort(),
    shown: Object.fromEntries(s.names.map((name) => [name, s.container(name).classList.contains("ec-switch-inactive") ? 0 : Number(s.container(name).style.opacity || 1)]))
  };
}

/** Whether the switch is playing. */
const playing = (s: Setup): boolean => s.names.some((name) => s.container(name).classList.contains("ec-switching"));

/** The views whose containers are active: the one on show, at rest. */
const active = (s: Setup): string[] => s.names.filter((name) => !s.container(name).classList.contains("ec-switch-inactive"));

const KINDS = [
  { kind: "our charts", hosts: false, from: "donut", via: "columns", to: "bars", margin: [0, 0] },
  { kind: "host views", hosts: true, from: "pie", via: "columns", to: "bars", margin: [40, 20] }
] as const;

for (const { kind, hosts, from, via, to } of KINDS) {
  describe(`show(view, { via }) in Presentation: a staged jump (${kind})`, () => {
    it("plays in two legs, each the switch show() plays alone: from the view on show to via, then from via to the view, landing once", async () => {
      const jump = await film({ hosts }, { 0: (s) => s.switcher.show(to, { via }) }, 1920);
      const first = await film({ hosts }, { 0: (s) => s.switcher.show(via) }, 944);
      const second = await film({ hosts, initial: via }, { 0: (s) => s.switcher.show(to) }, 960);
      expect(jump.frames).toHaveLength(121);
      expect(jump.frames.slice(0, 60)).toEqual(first.frames);
      expect(jump.frames.slice(60)).toEqual(second.frames);
      expect(jump.promises).toEqual(["#1 at 0", "#1 resolved at 1920"]);
    });

    it("ends the first leg on the via view's own picture and begins the second with it, each a full switch: 950 ms, 1.9 s in all", async () => {
      const s = setup({ hosts });
      const landed = vi.fn();
      void s.switcher.show(to, { via }).then(landed);
      await s.advance(949);
      expect(active(s)).toEqual([from, via]);
      // The first leg's last frame, before it lands.
      s.clock.advance(1);
      const end = scene(s);
      await flush();
      const begin = scene(s);
      expect(begin).toEqual(end);
      expect(active(s)).toEqual([via, to]);
      expect(end.shown).toEqual({ [from]: 0, [via]: 1, [to]: 0 });
      // The via view's own marks and labels, where its chart draws them.
      const own = s.chart(via).marks().map((mark) => [mark.key, mark.outline.d] as const);
      const [dx, dy] = KINDS.find((each) => each.kind === kind)!.margin;
      for (const [key, d] of own) expect(end.runs[key]).toBe(dx === 0 ? d : formatPath(transformPath(parsePath(d), [1, 0, 0, 1, dx, dy])));
      expect(end.labels.map((label) => label.split(" at ")[0]).sort()).toEqual(s.chart(via).labels().map((label) => label.text).sort());
      await s.advance(949);
      expect(landed).not.toHaveBeenCalled();
      await s.advance(1);
      expect(landed).toHaveBeenCalledTimes(1);
      expect(active(s)).toEqual([to]);
      expect(playing(s)).toBe(false);
      expect(s.clock.idle).toBe(true);
    });

    it("makes the view current from the start and gives its marks, and announces it alone, once, when it lands", async () => {
      const s = setup({ hosts });
      void s.switcher.show(to, { via });
      for (let t = 0; t <= 1920; t += 16) {
        expect(s.switcher.current).toBe(to);
        expect(s.switcher.marks()).toEqual(s.chart(to).marks());
        if (t === 960) expect(s.said()).toEqual([]);
        await s.advance(16);
      }
      expect(s.said()).toEqual([s.label(to)]);
    });

    it("moves focus by its key through the via view into the view, and after a jump focus wasn't in, the tab stop", async () => {
      const s = setup({ hosts });
      s.chart(from).focus("Saved");
      void s.switcher.show(to, { via });
      await s.advance(960);
      // The first leg hands its focus on: nothing moves into the via view.
      expect(s.focused()).toBe(`${from}:Saved`);
      expect(s.tabStop(via)).toBe(`${via}:Goal`);
      await s.advance(960);
      expect(s.focused()).toBe(`${to}:Saved`);

      const out = setup({ hosts });
      out.chart(from).focus("Blocked");
      const button = document.body.appendChild(document.createElement("button"));
      button.focus();
      void out.switcher.show(to, { via });
      await out.advance(960);
      expect(out.tabStop(via)).toBe(`${via}:Goal`);
      await out.advance(960);
      expect(document.activeElement).toBe(button);
      expect(out.tabStop(to)).toBe(`${to}:Blocked`);
    });
  });

  describe(`show(view, { via }) interrupted (${kind})`, () => {
    const jump: Act = (s) => s.switcher.show(to, { via });

    it("reverses when a show() goes back to the start in the first leg, the leg to come dropped, as show() does", async () => {
      const a = await film({ hosts }, { 0: jump, 304: (s) => s.switcher.show(from) }, 960);
      const b = await film({ hosts }, { 0: (s) => s.switcher.show(via), 304: (s) => s.switcher.show(from) }, 960);
      expect(a.frames).toEqual(b.frames);
      expect(a.promises).toEqual(b.promises);
      expect(a.promises).toEqual(["#1 at 0", "#2 at 304", "#1 resolved at 320", "#2 resolved at 608"]);
      expect(a.s.switcher.current).toBe(from);
      expect(a.s.said()).toEqual([a.s.label(from)]);
    });

    it("plays on to via and stops there when a show() asks for it in the first leg, the jump's promise resolving at once", async () => {
      const a = await film({ hosts }, { 0: jump, 304: (s) => s.switcher.show(via) }, 1920);
      const b = await film({ hosts }, { 0: (s) => s.switcher.show(via), 304: (s) => s.switcher.show(via) }, 1920);
      expect(a.frames).toEqual(b.frames);
      expect(a.promises).toEqual(["#1 at 0", "#2 at 304", "#1 resolved at 320", "#2 resolved at 960"]);
      expect(a.s.switcher.current).toBe(via);
      expect(a.s.said()).toEqual([a.s.label(via)]);
    });

    it("plays on as it is when a show() asks for its view, with or without via, returning the same promise", async () => {
      const a = await film({ hosts }, { 0: jump, 304: (s) => s.switcher.show(to), 1264: jump }, 1920);
      const b = await film({ hosts }, { 0: jump }, 1920);
      expect(a.frames).toEqual(b.frames);
      expect(a.promises).toEqual(["#1 at 0", "#2 at 304, the same", "#3 at 1264, the same", "#1 resolved at 1920", "#2 resolved at 1920", "#3 resolved at 1920"]);
    });

    it("reverses when a show() goes back to via in the second leg, as show() does", async () => {
      const a = await film({ hosts }, { 0: jump, 1264: (s) => s.switcher.show(via) }, 1920);
      const b = await film({ hosts, initial: via }, { 0: (s) => s.switcher.show(to), 304: (s) => s.switcher.show(via) }, 960);
      expect(a.frames.slice(60)).toEqual(b.frames);
      expect(a.promises.slice(1)).toEqual(later(b.promises.slice(1), 960));
      expect(a.s.said()).toEqual([a.s.label(via)]);
    });

    it("lands the second leg on the view and switches on from there, focus carried, when a show() asks for another view", async () => {
      const a = await film({ hosts }, { 0: jump, 1264: (s) => s.switcher.show(from) }, 2240);
      const b = await film({ hosts, initial: via }, { 0: (s) => s.switcher.show(to), 304: (s) => s.switcher.show(from) }, 1280);
      expect(a.frames.slice(60)).toEqual(b.frames);
      expect(a.promises.slice(1)).toEqual(later(b.promises.slice(1), 960));
      expect(a.s.said()).toEqual([a.s.label(from)]);
      // Focus goes on with it, from the view the jump began in.
      const s = setup({ hosts });
      s.chart(from).focus("Off target");
      void s.switcher.show(to, { via });
      await s.advance(1264);
      void s.switcher.show(from);
      await s.advance(960);
      expect(s.focused()).toBe(`${from}:Off target`);
      expect(s.said()).toEqual([s.label(from)]);
    });

    for (const [leg, at] of [
      ["the first leg", 304],
      ["the second leg", 1264]
    ] as const) {
      it(`lands on the view at once when motion turns off in ${leg}, with focus and one announcement`, async () => {
        const s = setup({ hosts });
        s.chart(from).focus("Off target");
        const landed = vi.fn();
        void s.switcher.show(to, { via }).then(landed);
        await s.advance(at);
        s.e.motion.setMode("off");
        expect(active(s)).toEqual([to]);
        expect(playing(s)).toBe(false);
        expect(s.overlay.querySelectorAll(".ec-run, .ec-switch-fade, .ec-switch-labels > text")).toHaveLength(0);
        expect(s.focused()).toBe(`${to}:Off target`);
        expect(s.said()).toEqual([s.label(to)]);
        await flush();
        expect(landed).toHaveBeenCalledTimes(1);
        expect(s.clock.idle).toBe(true);
      });

      it(`lands on the view at once when the cell is resized in ${leg}`, async () => {
        const s = setup({ hosts, resizable: true });
        s.chart(from).focus("Saved");
        const landed = vi.fn();
        void s.switcher.show(to, { via }).then(landed);
        await s.advance(at);
        s.resize(600.2);
        expect(playing(s)).toBe(true);
        s.resize(480);
        expect(active(s)).toEqual([to]);
        expect(playing(s)).toBe(false);
        expect(s.focused()).toBe(`${to}:Saved`);
        expect(s.said()).toEqual([s.label(to)]);
        await flush();
        expect(landed).toHaveBeenCalledTimes(1);
        await s.advance(1920);
        expect(active(s)).toEqual([to]);
        expect(s.said()).toEqual([s.label(to)]);
      });

      it(`stops both legs when the switch is destroyed in ${leg}`, async () => {
        const s = setup({ hosts });
        const landed = vi.fn();
        void s.switcher.show(to, { via }).then(landed);
        await s.advance(at);
        s.switcher.destroy();
        expect(s.target.children).toHaveLength(0);
        await flush();
        expect(landed).toHaveBeenCalledTimes(1);
        expect(s.clock.idle).toBe(true);
        await s.advance(1920);
        expect(s.target.children).toHaveLength(0);
        expect(s.said()).toEqual([]);
        // A host <svg> leaves as it was drawn: nothing hidden or added.
        for (const host of Object.values(s.hosts)) {
          expect(host.svg.hasAttribute("class")).toBe(false);
          for (const element of [...host.marks, ...host.names, ...host.values]) expect((element as SVGElement).style.visibility).toBe("");
        }
      });
    }
  });
}

describe("show(view, { via }) interrupted, to a view that's neither end of the first leg", () => {
  it("lands the first leg on via and switches on from there, focus carried, as show() does", async () => {
    const focusing = (act: Act): Act => (s) => {
      s.chart("donut").focus("Off target");
      return act(s);
    };
    const a = await film({ fourth: true }, { 0: focusing((s) => s.switcher.show("bars", { via: "columns" })), 304: (s) => s.switcher.show("ranked") }, 1280);
    const b = await film({ fourth: true }, { 0: focusing((s) => s.switcher.show("columns")), 304: (s) => s.switcher.show("ranked") }, 1280);
    expect(a.frames).toEqual(b.frames);
    expect(a.focus).toEqual(b.focus);
    expect(a.promises).toEqual(b.promises);
    expect(a.focus[a.focus.length - 1]).toBe("ranked:Off target");
    expect(a.s.said()).toEqual(["Shot outcomes, largest first"]);
  });

  it("stages the switch on from there through its own via", async () => {
    const s = setup({ fourth: true });
    void s.switcher.show("bars", { via: "columns" });
    await s.advance(304);
    const landed = vi.fn();
    void s.switcher.show("ranked", { via: "donut" }).then(landed);
    // Landed on columns, and on to the donut first.
    expect(active(s)).toEqual(["donut", "columns"]);
    expect(s.switcher.current).toBe("ranked");
    await s.advance(960);
    expect(active(s)).toEqual(["donut", "ranked"]);
    await s.advance(960);
    expect(landed).toHaveBeenCalledTimes(1);
    expect(s.said()).toEqual(["Shot outcomes, largest first"]);
  });
});

describe("show(view, { via }): more of it", () => {
  it("runs a show() a leave listener calls as a jump begins once its first leg has begun: one to via plays on to it and stops there", async () => {
    const s = setup();
    const donut = s.switcher.chart("donut") as ReturnType<ReturnType<typeof ourViews>["donut"]>;
    donut.element.querySelector('.ec-mark[data-key="Saved"] .ec-hit')!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    let again: Promise<void> | undefined;
    donut.on("leave", () => {
      expect(s.switcher.current).toBe("donut");
      again ??= s.switcher.show("columns");
    });
    const jumped = vi.fn();
    const landed = vi.fn();
    void s.switcher.show("bars", { via: "columns" }).then(jumped);
    void again!.then(landed);
    await flush();
    expect(jumped).toHaveBeenCalledTimes(1);
    expect(s.switcher.current).toBe("columns");
    await s.advance(960);
    expect(landed).toHaveBeenCalledTimes(1);
    expect(active(s)).toEqual(["columns"]);
    expect(s.said()).toEqual(["Shot outcomes, counts"]);
  });

  it("plays the second leg in Analysis's time when the viewer picks Analysis in the first", async () => {
    const s = setup();
    const landed = vi.fn();
    void s.switcher.show("bars", { via: "columns" }).then(landed);
    await s.advance(304);
    s.e.motion.chooseMode("analysis");
    await s.advance(656);
    expect(active(s)).toEqual(["columns", "bars"]);
    await s.advance(192);
    expect(landed).not.toHaveBeenCalled();
    await s.advance(16);
    expect(landed).toHaveBeenCalledTimes(1);
    expect(s.said()).toEqual(["Shot outcomes, bars"]);
  });

  it("stages a jump with reduced motion when the viewer has picked Presentation", async () => {
    const s = setup({ reduced: true });
    expect(s.e.motion.mode).toBe("off");
    s.e.motion.chooseMode("presentation");
    void s.switcher.show("bars", { via: "columns" });
    expect(active(s)).toEqual(["donut", "columns"]);
    await s.advance(960);
    expect(active(s)).toEqual(["columns", "bars"]);
    await s.advance(960);
    expect(active(s)).toEqual(["bars"]);
  });

  it("does nothing for the view on show, whatever via is", async () => {
    const s = setup();
    await expect(s.switcher.show("donut", { via: "columns" })).resolves.toBeUndefined();
    expect(playing(s)).toBe(false);
    expect(s.clock.idle).toBe(true);
    expect(s.said()).toEqual([]);
  });
});

/** The view a staged jump would go through: the one that's neither the view on show nor `view`. */
const third = (switcher: ChartSwitch<ChartSwitchViews>, view: string): string | undefined =>
  ["donut", "pie", "columns", "bars"].find((name) => {
    if (name === switcher.current || name === view) return false;
    try {
      switcher.chart(name);
      return true;
    } catch {
      return false;
    }
  });

/** The cases with no staging: Analysis, reduced motion and motion off. */
const UNSTAGED = ["three host views in Analysis", "our three views in Analysis", "reduced motion", "host views with motion off"];
const pick = (from: Readonly<Record<string, string | Case>>, names: readonly string[]) => Object.fromEntries(names.map((name) => [name, from[name]!]));

describe("show(view, { via }) straight there", () => {
  it("in Analysis, with reduced motion and with motion off, as show(view) switches, byte for byte", async () => {
    expect(await digests(pick(CASES, UNSTAGED) as Record<string, Case>, (switcher, view) => switcher.show(view, { via: third(switcher, view) }))).toEqual(pick(MAIN, UNSTAGED));
  });

  for (const [name, show] of [
    ["via the view on show", (switcher, view) => switcher.show(view, { via: switcher.current })],
    ["via the view itself", (switcher, view) => switcher.show(view, { via: view })],
    ["with no via", (switcher, view) => switcher.show(view, { via: undefined })],
    ["with no options' via", (switcher, view) => switcher.show(view, {})]
  ] as const satisfies readonly (readonly [string, Show])[]) {
    it(`${name}, as show(view) switches, byte for byte`, async () => {
      expect(await digests(CASES, show)).toEqual(MAIN);
    });
  }
});

describe("show(view, { via }): checks", () => {
  it("rejects an unknown via as it does an unknown view, in every mode, and starts nothing", async () => {
    for (const mode of ["presentation", "analysis", "off"] as const) {
      const s = setup({ mode });
      for (const via of ["pie", 3, null]) {
        await expect(s.switcher.show("bars", { via: via as never })).rejects.toThrow(new TypeError(`chartSwitch: there's no view ${JSON.stringify(via)} to go via. The views are "donut", "columns", "bars".`));
      }
      await expect(s.switcher.show("pie", { via: "nope" })).rejects.toThrow(new TypeError(`chartSwitch: there's no view "pie". The views are "donut", "columns", "bars".`));
      expect(s.switcher.current).toBe("donut");
      expect(active(s)).toEqual(["donut"]);
      expect(playing(s)).toBe(false);
      expect(s.clock.idle).toBe(true);
    }
    // Mid-way, the switch plays on.
    const s = setup();
    const landed = vi.fn();
    void s.switcher.show("columns").then(landed);
    await s.advance(304);
    await expect(s.switcher.show("bars", { via: "pie" })).rejects.toThrow(TypeError);
    expect(s.switcher.current).toBe("columns");
    await s.advance(656);
    expect(landed).toHaveBeenCalledTimes(1);
  });

  it("names via with the views' names, as show()'s view, in a type the package exports", async () => {
    const e = env("off");
    const views = ourViews(e);
    const switcher = chartSwitch(document.body.appendChild(document.createElement("div")), { views, initial: "donut", transition: morph() }, e);
    const options: ChartSwitchShowOptions<typeof views> = { via: "columns" };
    await switcher.show("bars", options);
    expect(switcher.current).toBe("bars");
    // @ts-expect-error: "pie" is no view of this switch.
    await expect(switcher.show("donut", { via: "pie" })).rejects.toThrow(TypeError);
    expectTypeOf(switcher.show).parameter(1).toEqualTypeOf<ChartSwitchShowOptions<typeof views> | undefined>();
  });
});

// ── Reference switches as on main ───────────────────────────────────────────

/**
 * What each reference switch is shown, in turn, and for how long. A view's name shows it: "!" first
 * focuses "Off target" in the view on show, and "^" a button outside the switch. "off" turns motion off and
 * "on" back to the case's mode; "resize" makes the cell 100 px narrower; "destroy" destroys the switch.
 */
type Steps = readonly (readonly [step: string, ms: number])[];

interface Case {
  /** Host views (a pie, columns and bars), or our charts (a donut, its columns and its bars). */
  readonly hosts?: boolean;
  readonly mode?: MotionMode;
  readonly reduced?: boolean;
  readonly initial: string;
  readonly steps: Steps;
}

/** The cases main's show() is pinned on, besides host-switch.test.ts's: what those don't cover. */
const CASES: Readonly<Record<string, Case>> = {
  "three host views": {
    hosts: true,
    initial: "pie",
    steps: [
      ["!columns", 960],
      ["pie", 400],
      ["columns", 300],
      ["columns", 200],
      ["bars", 960],
      ["^pie", 960],
      ["columns", 500],
      ["bars", 960]
    ]
  },
  "three host views in Analysis": {
    hosts: true,
    mode: "analysis",
    initial: "pie",
    steps: [
      ["!columns", 208],
      ["pie", 96],
      ["bars", 112],
      ["columns", 208]
    ]
  },
  "our three views in Analysis": {
    mode: "analysis",
    initial: "donut",
    steps: [
      ["!columns", 208],
      ["donut", 96],
      ["columns", 64],
      ["bars", 208],
      ["^donut", 208]
    ]
  },
  "landed early": {
    initial: "donut",
    steps: [
      ["!columns", 304],
      ["off", 32],
      ["on", 0],
      ["bars", 304],
      ["resize", 32],
      ["^donut", 304],
      ["destroy", 32]
    ]
  },
  "host views landed early": {
    hosts: true,
    initial: "pie",
    steps: [
      ["!bars", 304],
      ["off", 32],
      ["on", 0],
      ["columns", 304],
      ["resize", 32],
      ["pie", 304],
      ["destroy", 32]
    ]
  },
  "reduced motion": {
    reduced: true,
    initial: "donut",
    steps: [
      ["!columns", 32],
      ["bars", 32],
      ["^donut", 32]
    ]
  },
  "host views with motion off": {
    hosts: true,
    mode: "off",
    initial: "pie",
    steps: [
      ["!columns", 32],
      ["bars", 32],
      ["^pie", 32]
    ]
  }
};

/** Shows a view: show(view) itself, or a call that should switch as it does. */
type Show = (switcher: ChartSwitch<ChartSwitchViews>, view: string) => Promise<void>;

/**
 * Each case's digest: every 16 ms frame of its markup (views, overlay and live region), with numbers
 * rounded and ids' counters gone; and, apart, what it says in words: each show()'s promise (new, or
 * the same as the last) and when it resolved, `current` after each call, where focus and each view's
 * tab stop are after each step, and what was announced. A browser runs promise callbacks between
 * frames, so these do too.
 */
async function digests(cases: Readonly<Record<string, Case>>, show: Show = (switcher, view) => switcher.show(view)): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, { hosts, mode, reduced, initial, steps }] of Object.entries(cases)) {
    const e = env(mode, reduced);
    const resize = stubResize();
    const target = document.body.appendChild(document.createElement("div"));
    const views: ChartSwitchViews = hosts ? hostViews(e) : ourViews(e);
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
        const view = step.replace(/^[!^]/, "");
        if (step.startsWith("!")) switcher.chart(switcher.current).focus("Off target");
        if (step.startsWith("^")) button.focus();
        const call = ++calls;
        const promise = show(switcher, view);
        words.push(`#${call} ${view}: ${promise === last ? "same" : "new"}, current ${switcher.current}`);
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

/**
 * The digests main (f5900e9, 0.9.0's code) gave, with this file's digests() run there before via came
 * in: each frames' then words'. The host views' frames pinned again on jsdom 31 (M16 step 1), which
 * writes a host mark's `outline: none` back as `outline: medium`: nothing else moved.
 */
const MAIN: Readonly<Record<string, string>> = {
  "three host views": "c7d779187a75a696 74eeca67c13a42b2",
  "three host views in Analysis": "876a74ad741e63f5 b206231ec6befb76",
  "our three views in Analysis": "859dcaf886db4caa 9a7e552a647982bb",
  "landed early": "9e08c9cea62f7c40 8fa1c616ec387582",
  "host views landed early": "138c976b8a2d93cf c5470a1232900b4d",
  "reduced motion": "dda2885bd4b8c4a9 623cdf406011c06f",
  "host views with motion off": "3c217827683b66d3 606d6337625b0e21"
};

describe("every show() without via, as on main", () => {
  it("draws every frame as on main, byte for byte, and says the same in words: host views and ours, in Presentation and Analysis, landed early, with reduced motion and motion off", async () => {
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
