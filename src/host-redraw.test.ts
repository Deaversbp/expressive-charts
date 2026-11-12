// A host chart drawn again while a chart switch plays (M15 step 2): hostView() hides the host's new
// marks and the labels the page names, read again, until the switch lands, gives back what it hid of
// the elements the host took away, and the switch plays on with the pairs it began with. On
// hand-written hosts that copy D3's conventions (each row on __data__, joined by key and put in order
// as selection.join() does), with the real morph(), and on a Vega-Lite chart that Vega renders again.
// Beside src/index.ts because it brings charts and an effect together, as only the composition root
// may. Last, host switches with no redraw mid-switch, as on main, byte for byte.

import { View, parse } from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import { createMotion, describe as build, manualClock, type MotionMode } from "./core";
import { createRegistry, type PresetFactory } from "./core/registry";
import { flush } from "./core/testing";
import { barChart, chartSwitch, colorAssignment, expressive, fromVegaView, hostView, type Attachment, type ChartEnv, type ChartSwitchViews, type ColorAssignment, type ExpressiveOptions, type HostLabel, type HostView } from "./charts";
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
/** What a host draws again with: Saved's count changes, Blocked goes and Woodwork comes. */
const next: Outcome[] = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 120 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Woodwork", shots: 9 }
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Hosts ───────────────────────────────────────────────────────────────────

const SVG = "http://www.w3.org/2000/svg";
const TURN = 2 * Math.PI;
const PIE: Readonly<Record<string, string>> = { Goal: "#2a78d6", Saved: "#eb6834", "Off target": "#1baa7c", Blocked: "#9a6bd6", Woodwork: "#888888" };
const COLUMNS: Readonly<Record<string, string>> = { Goal: "#1f5fa8", Saved: "#b8501f", "Off target": "#137a59", Blocked: "#6e48a3", Woodwork: "#555555" };

/** d3.pie()'s datum for a slice: its row, its value and its angles, clockwise from 12 o'clock. */
interface Slice {
  readonly data: Outcome;
  readonly value: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

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

const rowOf = <T>(element: Element): T => (element as unknown as { __data__: T }).__data__;
const round = (value: number): number => Math.round(value * 1000) / 1000;
const arcOf = (key: string, slice: Slice): ReturnType<typeof build.arc> => build.arc({ key, cx: 0, cy: 0, inner: 70, outer: 116, start: slice.startAngle, end: slice.endAngle });

/** Elements a join left drawn with no row, as D3 leaves them while their exit transition runs. */
const exiting = new WeakSet<Element>();

/**
 * selection.data(rows, key).join(tag).order(), as D3 does it: the element already there for each
 * row's key is kept and the others are made, each with its row on __data__ and written by `write`;
 * those with no row are removed, or with `linger` left as they are, as in an exit transition; and
 * each is put after the one before, if it isn't there already.
 */
function join<R>(parent: Element, tag: "path" | "rect" | "text", rows: readonly R[], key: (row: R) => string, write: (element: SVGElement, row: R, index: number) => void, linger = false): void {
  const old = new Map(Array.from(parent.children, (child) => [key(rowOf<R>(child)), child]));
  const elements = rows.map((row, index) => {
    const element = (old.get(key(row)) ?? document.createElementNS(SVG, tag)) as SVGElement;
    old.delete(key(row));
    Object.assign(element, { __data__: row });
    write(element, row, index);
    return element;
  });
  for (const gone of old.values()) {
    if (linger) exiting.add(gone);
    else gone.remove();
  }
  let before: Element | null = null;
  for (const element of elements) {
    if (element.parentNode !== parent || element.previousElementSibling !== before) parent.insertBefore(element, before ? before.nextSibling : parent.firstChild);
    before = element;
  }
}

/** Each element of a host's <svg> and the <svg> itself as the host drew them first, before an attachment. */
function drawing(svg: SVGSVGElement): Map<Element, string> {
  return new Map([svg, ...Array.from(svg.querySelectorAll("*"))].map((element) => [element, element.outerHTML]));
}

/**
 * What a D3 page draws for a pie of shots, as d3.pie() and d3.arc() would: a 640 × 300 <svg
 * role="group"> with its name and a title, a <g> centred at (320, 150) with a <g> of slices, a <path>
 * an outcome with its pie datum on __data__ and filled by outcome, and a <g> of names outside them,
 * each placed by a transform as arc.centroid() would place it. draw() draws it again with new rows.
 */
function pieHost(parent: Element, rows: readonly Outcome[] = outcomes) {
  const svg = el("svg", { width: 640, height: 300, viewBox: "0 0 640 300", role: "group", "aria-label": "Shot outcomes, a pie" }, parent);
  const title = el("text", { class: "title", x: 12, y: 20 }, svg, "Shots by outcome");
  const plot = el("g", { transform: "translate(320,150)" }, svg);
  const slices = el("g", { class: "slices" }, plot);
  const names = el("g", { class: "labels", "text-anchor": "middle" }, plot);
  const key = (slice: Slice): string => slice.data.outcome;
  const draw = (rows: readonly Outcome[]): void => {
    const total = rows.reduce((sum, row) => sum + row.shots, 0);
    let angle = 0;
    const pie = rows.map((row): Slice => ({ data: row, value: row.shots, startAngle: angle, endAngle: (angle += (row.shots / total) * TURN) }));
    join(slices, "path", pie, key, (path, slice) => set(path, { d: arcOf(key(slice), slice).outline.d, fill: PIE[key(slice)]! }));
    join(names, "text", pie, key, (text, slice) => {
      const mid = (slice.startAngle + slice.endAngle) / 2;
      set(text, { transform: `translate(${round(140 * Math.sin(mid))},${round(-140 * Math.cos(mid))})`, dy: "0.35em" });
      text.textContent = key(slice);
    });
  };
  draw(rows);
  return {
    svg,
    title,
    draw,
    drawn: drawing(svg),
    marks: (): Element[] => Array.from(slices.children),
    /** The page's labels, read from what the host drew: each name by its slice's outcome. */
    labels: (): HostLabel[] => Array.from(names.children as HTMLCollectionOf<SVGTextElement>, (element) => ({ element, key: key(rowOf<Slice>(element)), role: "category" }))
  };
}

/**
 * What a D3 page draws for columns: a 640 × 300 <svg role="group"> with its name, a margin <g> at
 * (40, 20), a y axis as d3.axisLeft() draws one, a <g> of columns, a <rect> an outcome with its row on
 * __data__, 1 px a shot, and a <g> of names under them and one of counts above. draw() draws it again
 * with new rows, in place, from nothing with `fresh`, or with `linger` leaving what has no row drawn,
 * as an exit transition does, out of the marks and labels the page reads.
 */
function columnsHost(parent: Element, rows: readonly Outcome[] = outcomes) {
  const svg = el("svg", { width: 640, height: 300, viewBox: "0 0 640 300", role: "group", "aria-label": "Shot outcomes, columns" }, parent);
  const plot = el("g", { transform: "translate(40,20)" }, svg);
  const axis = el("g", { class: "axis", fill: "none", "font-size": 10, "font-family": "sans-serif", "text-anchor": "end", "aria-hidden": "true" }, plot);
  const ticks = [0, 50, 100, 150].map((value) => {
    const tick = el("g", { class: "tick", transform: `translate(0,${240 - value})` }, axis);
    el("line", { stroke: "currentColor", x2: -6 }, tick);
    return el("text", { fill: "currentColor", x: -9, dy: "0.32em" }, tick, String(value));
  });
  const columns = el("g", { class: "columns" }, plot);
  const names = el("g", { class: "names", "text-anchor": "middle" }, plot);
  const values = el("g", { class: "values", "text-anchor": "middle" }, plot);
  const key = (row: Outcome): string => row.outcome;
  const draw = (rows: readonly Outcome[], fresh = false, linger = false): void => {
    if (fresh) for (const group of [columns, names, values]) group.replaceChildren();
    join(columns, "rect", rows, key, (rect, row, i) => set(rect, { x: i * 140 + 20, y: 240 - row.shots, width: 100, height: row.shots, fill: COLUMNS[row.outcome]! }), linger);
    join(
      names,
      "text",
      rows,
      key,
      (text, row, i) => {
        set(text, { x: i * 140 + 70, y: 258 });
        text.textContent = row.outcome;
      },
      linger
    );
    join(
      values,
      "text",
      rows,
      key,
      (text, row, i) => {
        set(text, { x: i * 140 + 70, y: 234 - row.shots });
        text.textContent = String(row.shots);
      },
      linger
    );
  };
  draw(rows);
  const texts = (group: SVGGElement) => Array.from(group.children as HTMLCollectionOf<SVGTextElement>).filter((text) => !exiting.has(text));
  return {
    svg,
    ticks,
    draw,
    drawn: drawing(svg),
    marks: (): Element[] => Array.from(columns.children).filter((rect) => !exiting.has(rect)),
    /** The page's labels, read from what the host drew: each name and count by its column's outcome. */
    labels: (): HostLabel[] => [
      ...texts(names).map((element): HostLabel => ({ element, key: key(rowOf<Outcome>(element)), role: "category" })),
      ...texts(values).map((element): HostLabel => ({ element, key: key(rowOf<Outcome>(element)), role: "value" }))
    ]
  };
}

type PieHost = ReturnType<typeof pieHost>;
type ColumnsHost = ReturnType<typeof columnsHost>;
type Host = PieHost | ColumnsHost;

/** The README's attachment for a D3 pie: by outcome, each slice described with describe.arc, with keyboard and a name per slice. */
function attachPie(host: PieHost, e: ChartEnv, more: Partial<ExpressiveOptions<Slice>> = {}): Attachment<Slice> {
  return expressive<Slice>(host.marks(), { key: (d) => d.data.outcome, geometry: (_el, d, key) => arcOf(key, d), keyboard: true, markLabel: (d) => `${d.data.outcome}: ${d.value} shots`, ...more }, e);
}

function attachColumns(host: ColumnsHost, e: ChartEnv, more: Partial<ExpressiveOptions<Outcome>> = {}): Attachment<Outcome> {
  return expressive<Outcome>(host.marks(), { key: (d) => d.outcome, value: (d) => d.shots, keyboard: true, markLabel: (d) => `${d.outcome}: ${d.shots} shots`, ...more }, e);
}

interface SetupOptions {
  readonly mode?: MotionMode;
  readonly reduced?: boolean;
  /** A third view: our own bars. */
  readonly bars?: boolean;
}

/** A D3 pie and D3 columns in one switch, each attached and given to hostView() with the page's labels, read from the host each time. */
function setup(options: SetupOptions = {}) {
  const e = env(options.mode, options.reduced);
  const target = document.body.appendChild(document.createElement("div"));
  const hosts = {} as { pie: PieHost; columns: ColumnsHost };
  const views = {
    pie: (container: HTMLElement) => hostView(attachPie((hosts.pie = pieHost(container)), e), { labels: () => hosts.pie.labels() }),
    columns: (container: HTMLElement) => hostView(attachColumns((hosts.columns = columnsHost(container)), e), { labels: () => hosts.columns.labels() }),
    ...(options.bars
      ? { bars: (container: HTMLElement, colors: ColorAssignment) => barChart(container, { label: "Shot outcomes, bars", data: outcomes, y: "outcome", x: "shots", colorBy: "category", colors, width: 600 }, e) }
      : {})
  } satisfies ChartSwitchViews;
  const switcher = chartSwitch(target, { views, initial: "pie", transition: morph(), announce: true }, e);
  const wrapper = target.querySelector(":scope > .ec-switch") as HTMLDivElement;
  const container = (view: string) => wrapper.querySelector(`:scope > .ec-switch-view[data-view="${view}"]`) as HTMLDivElement;
  const overlay = wrapper.querySelector(":scope > .ec-switch-overlay") as SVGSVGElement;
  /** The host draws again with `rows`, and the page refreshes its attachment with the marks it drew, as a D3 page does. */
  const redraw = (view: "pie" | "columns", rows: readonly Outcome[] = next, fresh = false): void => {
    if (view === "pie") hosts.pie.draw(rows);
    else hosts.columns.draw(rows, fresh);
    switcher.chart(view).refresh(hosts[view].marks());
  };
  const land = async (ms = 950): Promise<void> => {
    e.clock.advance(ms);
    await flush();
  };
  return { switcher, e, clock: e.clock, target, wrapper, container, overlay, hosts, redraw, land, pieView: switcher.chart("pie"), columnsView: switcher.chart("columns") };
}

type Setup = ReturnType<typeof setup>;

const hidden = (element: Element): boolean => (element as SVGElement).style.getPropertyValue("visibility") === "hidden";
/** What a host view hides while a switch plays: the host's marks' elements and the labels the page names, as the host has them now. */
const named = (host: Host): Element[] => [...host.marks(), ...host.labels().map((label) => label.element)];
/** Every element of a host's <svg> hidden inline. */
const hiddenIn = (svg: SVGSVGElement): Element[] => Array.from(svg.querySelectorAll("*")).filter(hidden);
/** A host's <svg> as its markup, the ids numbered by how many came before in the document without their number. */
const markup = (svg: Element): string => svg.outerHTML.replace(/\b(ec-description|ec-focus-mask)-\d+/g, "$1-#");

// ── Drawn again mid-switch ──────────────────────────────────────────────────

describe("hostView: a host drawn again mid-switch", () => {
  it("hides the host's new marks and the labels the page names, read again, once the page refreshes, and gives back what it hid of the elements the host took away", async () => {
    const { switcher, hosts, redraw, clock, pieView, columnsView, land } = setup();
    void switcher.show("columns");
    clock.advance(300);
    const columns = hosts.columns;
    const gone = [columns.marks()[3]!, ...columns.labels().filter((label) => label.key === "Blocked").map((label) => label.element)];
    expect(gone.map((element) => element.textContent)).toEqual(["", "Blocked", "87"]);
    // Drawn again: Woodwork's column, name and count are new, and show until the page refreshes.
    columns.draw(next);
    const woodwork = [columns.marks()[3]!, ...columns.labels().filter((label) => label.key === "Woodwork").map((label) => label.element)];
    for (const element of woodwork) expect(hidden(element)).toBe(false);
    columnsView.refresh(columns.marks());
    for (const element of named(columns)) expect(hidden(element)).toBe(true);
    expect(named(columns)).toEqual(expect.arrayContaining(woodwork));
    // Read again: Saved's new count, and Woodwork's name and count.
    expect(columnsView.labels().map((label) => label.text)).toEqual(["Goal", "Saved", "Off target", "Woodwork", "58", "120", "149", "9"]);
    expect(columns.svg.classList.contains("ec-morphing")).toBe(true);
    // The elements the host took away are as it drew them, with nothing of ours: no style, no tab stop, no name.
    for (const element of gone) {
      expect(element.isConnected).toBe(false);
      expect(element.outerHTML).toBe(columns.drawn.get(element));
    }
    // The host's other text stays as it drew it, and fades with its view.
    for (const tick of columns.ticks) expect(tick.hasAttribute("style")).toBe(false);

    // The old view drawn again too: its new slices, and its names.
    redraw("pie");
    expect(pieView.marks().map((mark) => mark.key)).toEqual(["Goal", "Saved", "Off target", "Woodwork"]);
    for (const element of named(hosts.pie)) expect(hidden(element)).toBe(true);
    expect(hosts.pie.title.hasAttribute("style")).toBe(false);

    await land(650);
    expect(switcher.current).toBe("columns");
    for (const host of [hosts.pie, hosts.columns]) {
      expect(hiddenIn(host.svg)).toEqual([]);
      expect(host.svg.hasAttribute("class")).toBe(false);
    }
  });

  it("hides them again on every refresh while the switch plays: a host drawn twice, from nothing the second time", async () => {
    const { switcher, hosts, redraw, clock, land } = setup();
    void switcher.show("columns");
    clock.advance(200);
    redraw("columns");
    const first = named(hosts.columns);
    clock.advance(200);
    // From nothing: every element is new, and the last drawing's elements leave as the host drew them.
    redraw("columns", outcomes, true);
    for (const element of named(hosts.columns)) {
      expect(first).not.toContain(element);
      expect(hidden(element)).toBe(true);
    }
    for (const element of first) {
      expect(element.isConnected).toBe(false);
      expect(element.hasAttribute("style")).toBe(false);
      expect(element.hasAttribute("tabindex")).toBe(false);
    }
    await land(550);
    expect(hiddenIn(hosts.columns.svg)).toEqual([]);
  });

  it("keeps hidden what the host still draws of a mark it takes away, as D3 does through an exit transition, which the switch draws still, until it lands", async () => {
    const { switcher, hosts, columnsView, clock, overlay, land } = setup();
    void switcher.show("columns");
    clock.advance(300);
    const columns = hosts.columns;
    const blocked = [columns.marks()[3]!, ...columns.labels().filter((label) => label.key === "Blocked").map((label) => label.element)];
    // Blocked's column, name and count stay drawn while they leave, no longer a mark or named.
    columns.draw(next, false, true);
    columnsView.refresh(columns.marks());
    expect(columnsView.marks().map((mark) => mark.key)).toEqual(["Goal", "Saved", "Off target", "Woodwork"]);
    expect(columnsView.labels().map((label) => label.key)).not.toContain("Blocked");
    expect(overlay.querySelector('.ec-switch-runs > .ec-run[data-key="Blocked"]')).not.toBeNull();
    for (const element of [...blocked, ...named(columns)]) expect(hidden(element)).toBe(true);
    await land(650);
    // Landed: what the host still draws of Blocked is as it drew it, with nothing of ours.
    for (const element of blocked) {
      expect(element.isConnected).toBe(true);
      expect(element.outerHTML).toBe(columns.drawn.get(element));
    }
    expect(hiddenIn(columns.svg)).toEqual([]);
  });

  it("plays on with the pairs it began with: its overlay draws every frame as a switch whose hosts weren't drawn again, and each view fades as it would", async () => {
    const plain = setup();
    const drawn = setup();
    void plain.switcher.show("columns");
    void drawn.switcher.show("columns");
    for (let t = 0; t < 960; t += 16) {
      if (t === 304) {
        drawn.redraw("columns");
        drawn.redraw("pie");
      }
      expect(drawn.overlay.innerHTML).toBe(plain.overlay.innerHTML);
      for (const view of ["pie", "columns"]) expect(drawn.container(view).getAttribute("style")).toBe(plain.container(view).getAttribute("style"));
      plain.clock.advance(16);
      drawn.clock.advance(16);
    }
    await flush();
    expect(drawn.switcher.current).toBe("columns");
    expect(drawn.overlay.querySelectorAll("path")).toHaveLength(0);
  });

  /** How a switch ends, after `drawAgain` part way: each host's <svg> is then compared with one whose host was drawn again before the switch. */
  const endings: Record<string, (s: Setup, drawAgain: () => void) => Promise<void>> = {
    "once it lands": async (s, drawAgain) => {
      void s.switcher.show("columns");
      s.clock.advance(300);
      drawAgain();
      for (const host of [s.hosts.pie, s.hosts.columns]) for (const element of named(host)) expect(hidden(element)).toBe(true);
      await s.land(650);
      expect(s.switcher.current).toBe("columns");
    },
    "once a switch back lands": async (s, drawAgain) => {
      void s.switcher.show("columns");
      s.clock.advance(300);
      drawAgain();
      void s.switcher.show("pie");
      s.clock.advance(100);
      for (const host of [s.hosts.pie, s.hosts.columns]) for (const element of named(host)) expect(hidden(element)).toBe(true);
      await s.land();
      expect(s.switcher.current).toBe("pie");
    },
    "when a third view lands it, and once the switch from there lands": async (s, drawAgain) => {
      void s.switcher.show("columns");
      s.clock.advance(300);
      drawAgain();
      void s.switcher.show("bars");
      // The pie is out of the switch, as its host drew it; the columns hide again, as they are now, for the switch to the bars.
      expect(hiddenIn(s.hosts.pie.svg)).toEqual([]);
      expect(s.hosts.pie.svg.hasAttribute("class")).toBe(false);
      for (const element of named(s.hosts.columns)) expect(hidden(element)).toBe(true);
      await s.land();
      expect(s.switcher.current).toBe("bars");
    },
    "when the switch is destroyed mid-way": async (s, drawAgain) => {
      void s.switcher.show("columns");
      s.clock.advance(300);
      drawAgain();
      s.switcher.destroy();
    }
  };

  for (const [name, end] of Object.entries(endings)) {
    it(`gives each host's <svg> back as the host drew it ${name}: as if it had been drawn again before the switch`, async () => {
      const before = setup({ bars: true });
      before.redraw("pie");
      before.redraw("columns");
      await end(before, () => {});
      const mid = setup({ bars: true });
      await end(mid, () => {
        mid.redraw("pie");
        mid.redraw("columns");
      });
      for (const view of ["pie", "columns"] as const) {
        expect(hiddenIn(mid.hosts[view].svg)).toEqual([]);
        expect(markup(mid.hosts[view].svg)).toBe(markup(before.hosts[view].svg));
      }
    });
  }

  it("leaves each host's <svg> as the host drew it again, with nothing of ours, when the switch is destroyed mid-way", () => {
    const { switcher, hosts, redraw, clock } = setup();
    void switcher.show("columns");
    clock.advance(300);
    redraw("pie");
    redraw("columns");
    switcher.destroy();
    const parent = document.createElement("div");
    expect(hosts.pie.svg.outerHTML).toBe(pieHost(parent, next).svg.outerHTML);
    expect(hosts.columns.svg.outerHTML).toBe(columnsHost(parent, next).svg.outerHTML);
  });

  it("follows a host that draws a new <svg>: the old one gets back its class, and the new one hides its marks and names until the switch lands", async () => {
    const run = async (when: "before" | "mid"): Promise<{ readonly old: ColumnsHost; readonly s: Setup }> => {
      const s = setup();
      const old = s.hosts.columns;
      const replace = (): void => {
        s.hosts.columns = columnsHost(s.container("columns"), next);
        old.svg.remove();
        s.columnsView.refresh(s.hosts.columns.marks());
      };
      if (when === "before") replace();
      void s.switcher.show("columns");
      s.clock.advance(300);
      if (when === "mid") {
        replace();
        expect(s.columnsView.element).toBe(s.hosts.columns.svg);
        expect(s.hosts.columns.svg.getAttribute("class")).toBe("ec-morphing");
        for (const element of named(s.hosts.columns)) expect(hidden(element)).toBe(true);
        expect(old.svg.hasAttribute("class")).toBe(false);
        expect(hiddenIn(old.svg)).toEqual([]);
      }
      await s.land(650);
      return { old, s };
    };
    const before = await run("before");
    const mid = await run("mid");
    expect(mid.s.hosts.columns.svg.hasAttribute("class")).toBe(false);
    expect(hiddenIn(mid.s.hosts.columns.svg)).toEqual([]);
    expect(markup(mid.s.hosts.columns.svg)).toBe(markup(before.s.hosts.columns.svg));
    expect(markup(mid.old.svg)).toBe(markup(before.old.svg));
  });

  it("hides nothing for a refresh while no switch plays its view: at rest, after a switch, and while the switch plays between two others", async () => {
    const { switcher, hosts, redraw, land } = setup({ bars: true });
    redraw("columns");
    expect(hiddenIn(hosts.columns.svg)).toEqual([]);
    void switcher.show("columns");
    await land();
    redraw("columns", outcomes);
    expect(hiddenIn(hosts.columns.svg)).toEqual([]);
    expect(hosts.columns.svg.hasAttribute("class")).toBe(false);
    void switcher.show("bars");
    await land();
    void switcher.show("pie");
    redraw("columns");
    expect(hiddenIn(hosts.columns.svg)).toEqual([]);
    expect(hosts.columns.svg.hasAttribute("class")).toBe(false);
    for (const element of named(hosts.pie)) expect(hidden(element)).toBe(true);
    await land();
  });

  it("takes a labels() that throws mid-switch as no labels (reported): the marks hide again, and the names it hid stay hidden, as the switch draws them still, until it lands", async () => {
    const e = env();
    let pie!: PieHost;
    let failing = false;
    const switcher = chartSwitch(
      document.body.appendChild(document.createElement("div")),
      {
        views: {
          pie: (container: HTMLElement) =>
            hostView(attachPie((pie = pieHost(container)), e), {
              labels: () => {
                if (failing) throw new Error("no labels");
                return pie.labels();
              }
            }),
          columns: (container: HTMLElement) => hostView(attachColumns(columnsHost(container), e))
        },
        initial: "pie",
        transition: morph()
      },
      e
    );
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    void switcher.show("columns");
    e.clock.advance(300);
    failing = true;
    pie.draw(next);
    switcher.chart("pie").refresh(pie.marks());
    expect(reported).toHaveBeenCalledWith(new Error("no labels"));
    expect(switcher.chart("pie").labels()).toEqual([]);
    for (const element of pie.marks()) expect(hidden(element)).toBe(true);
    // Goal's, Saved's and Off target's names, which it hid as the switch began; Woodwork's is new, and named by no one.
    expect(pie.labels().map((label) => [label.key, hidden(label.element)])).toEqual([
      ["Goal", true],
      ["Saved", true],
      ["Off target", true],
      ["Woodwork", false]
    ]);
    e.clock.advance(650);
    await flush();
    expect(hiddenIn(pie.svg)).toEqual([]);
  });
});

describe("hostView: drawn again mid-switch, and motion", () => {
  it("lands at once on a resize, with each host as it drew it, whether the page draws again before the switch hears the resize or after", async () => {
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
        disconnect() {}
      }
    );
    const play = async (order: "page first" | "switch first" | "before") => {
      const s = setup();
      const watcher = observers.find((observer) => observer.target === s.wrapper)!;
      const resize = (width: number) => watcher.callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
      const drawAgain = (): void => {
        s.redraw("pie");
        s.redraw("columns");
      };
      resize(600);
      if (order === "before") drawAgain();
      const landed = vi.fn();
      void s.switcher.show("columns").then(landed);
      s.clock.advance(300);
      if (order === "page first") {
        drawAgain();
        for (const element of named(s.hosts.columns)) expect(hidden(element)).toBe(true);
      }
      resize(480);
      expect(s.container("columns").classList.contains("ec-switching")).toBe(false);
      if (order === "switch first") drawAgain();
      await flush();
      expect(landed).toHaveBeenCalledTimes(1);
      expect(s.switcher.current).toBe("columns");
      return s;
    };
    const before = await play("before");
    for (const order of ["page first", "switch first"] as const) {
      const s = await play(order);
      for (const view of ["pie", "columns"] as const) {
        expect(hiddenIn(s.hosts[view].svg)).toEqual([]);
        expect(markup(s.hosts[view].svg)).toBe(markup(before.hosts[view].svg));
      }
    }
  });

  it("lands at once when motion turns off mid-switch, with each host as it drew it", async () => {
    const before = setup();
    before.redraw("pie");
    before.redraw("columns");
    void before.switcher.show("columns");
    before.clock.advance(300);
    before.e.motion.setMode("off");
    const mid = setup();
    void mid.switcher.show("columns");
    mid.clock.advance(300);
    mid.redraw("pie");
    mid.redraw("columns");
    mid.e.motion.setMode("off");
    await flush();
    expect(mid.switcher.current).toBe("columns");
    for (const view of ["pie", "columns"] as const) {
      expect(hiddenIn(mid.hosts[view].svg)).toEqual([]);
      expect(markup(mid.hosts[view].svg)).toBe(markup(before.hosts[view].svg));
    }
  });

  it("hides them in Analysis's shorter switch too, until it lands", async () => {
    const { switcher, hosts, redraw, clock, land } = setup({ mode: "analysis" });
    void switcher.show("columns");
    clock.advance(100);
    redraw("columns");
    for (const element of named(hosts.columns)) expect(hidden(element)).toBe(true);
    await land(100);
    expect(switcher.current).toBe("columns");
    expect(hiddenIn(hosts.columns.svg)).toEqual([]);
  });

  for (const [name, options] of [
    ["motion off", { mode: "off" }],
    ["reduced motion", { reduced: true }]
  ] as const) {
    it(`with ${name}, lands at once and hides nothing of a host drawn again right after`, async () => {
      const { switcher, hosts, redraw, overlay, e } = setup(options);
      expect(e.motion.mode).toBe("off");
      const shown = switcher.show("columns");
      redraw("pie");
      redraw("columns");
      expect(switcher.current).toBe("columns");
      expect(overlay.querySelectorAll(".ec-run, .ec-switch-fade, .ec-switch-labels > text")).toHaveLength(0);
      for (const host of [hosts.pie, hosts.columns]) {
        expect(hiddenIn(host.svg)).toEqual([]);
        expect(host.svg.hasAttribute("class")).toBe(false);
      }
      await shown;
    });
  }
});

// ── A Vega-Lite chart that Vega renders again ───────────────────────────────

const VEGA: Readonly<Record<string, string>> = { Goal: "#4c78a8", Saved: "#f58518", "Off target": "#54a24b", Blocked: "#b279a2", Woodwork: "#9d755d" };
const vegaSpec: TopLevelSpec = {
  width: 400,
  height: 200,
  data: { name: "shots", values: outcomes },
  mark: "bar",
  encoding: {
    x: { field: "outcome", type: "nominal", sort: [...outcomes.map((row) => row.outcome), "Woodwork"] },
    y: { field: "shots", type: "quantitative", scale: { domain: [0, 160] } },
    color: { field: "outcome", type: "nominal", scale: { domain: Object.keys(VEGA), range: Object.values(VEGA) }, legend: null }
  }
};
/** Vega's data again: Saved's count changes, and Woodwork comes, so Vega draws a bar more. */
const more: Outcome[] = [...outcomes.slice(0, 1), { outcome: "Saved", shots: 120 }, ...outcomes.slice(2), { outcome: "Woodwork", shots: 9 }];

/** The MutationObserver hands over what Vega drew in a microtask: this waits for it. */
const delivered = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function vegaSetup() {
  const host = document.createElement("div");
  const vega = new View(parse(compile(vegaSpec).spec), { renderer: "svg", container: host });
  await vega.runAsync();
  const svg = host.querySelector("svg")!;
  const e = env();
  const target = document.body.appendChild(document.createElement("div"));
  const switcher = chartSwitch(
    target,
    {
      views: {
        bars: (container: HTMLElement) => {
          container.appendChild(host);
          return hostView(fromVegaView<Outcome>(vega, { key: (d) => d.outcome, keyboard: true }, e));
        },
        pie: (container: HTMLElement) => hostView(attachPie(pieHost(container), e))
      },
      initial: "bars",
      transition: morph()
    },
    e
  );
  const overlay = target.querySelector(".ec-switch-overlay") as SVGSVGElement;
  const paths = (): Element[] => Array.from(svg.querySelectorAll(".mark-rect path"));
  /** Vega draws again with `rows`, and the attachment reads what it drew on the next frame. */
  const render = async (rows: readonly Outcome[]): Promise<void> => {
    await vega.data("shots", rows).runAsync();
    await delivered();
  };
  return { vega, svg, e, switcher, overlay, paths, render, bars: switcher.chart("bars") };
}

describe("hostView: a fromVegaView() attachment that Vega renders again mid-switch", () => {
  it("hides the bars Vega draws, the new one too, once the attachment reads them, and gives Vega's <svg> back as Vega drew it once the switch lands", async () => {
    const before = await vegaSetup();
    await before.render(more);
    before.e.clock.advance(16);
    void before.switcher.show("pie");
    before.e.clock.advance(950);
    await flush();

    const mid = await vegaSetup();
    const drawn = mid.overlay.innerHTML;
    void mid.switcher.show("pie");
    mid.e.clock.advance(304);
    const playing = mid.overlay.innerHTML;
    expect(playing).not.toBe(drawn);
    await mid.render(more);
    expect(mid.paths()).toHaveLength(5);
    // Vega's new bars, Saved's with its new row and Woodwork's, show until the attachment reads what Vega drew, on the next frame.
    const outcomeOf = (path: Element): string => (path as unknown as { __data__: { datum: Outcome } }).__data__.datum.outcome;
    expect(mid.paths().filter((path) => !hidden(path)).map(outcomeOf)).toEqual(["Saved", "Woodwork"]);
    mid.e.clock.advance(16);
    expect(mid.bars.marks().map((mark) => mark.key)).toEqual([...outcomes.map((row) => row.outcome), "Woodwork"]);
    for (const path of mid.paths()) expect(hidden(path)).toBe(true);
    expect(mid.svg.classList.contains("ec-morphing")).toBe(true);
    mid.e.clock.advance(630);
    await flush();
    expect(mid.switcher.current).toBe("pie");
    expect(hiddenIn(mid.svg)).toEqual([]);
    expect(mid.svg.getAttribute("class")).toBe("marks");
    expect(markup(mid.svg)).toBe(markup(before.svg));
    for (const s of [before, mid]) {
      s.switcher.destroy();
      s.vega.finalize();
    }
    expect(mid.svg.outerHTML).toBe(before.svg.outerHTML);
  });

  it("plays on with the pairs it began with, and keeps Vega's bars hidden through a switch back", async () => {
    const plain = await vegaSetup();
    const drawn = await vegaSetup();
    void plain.switcher.show("pie");
    void drawn.switcher.show("pie");
    plain.e.clock.advance(304);
    drawn.e.clock.advance(304);
    await drawn.render(more);
    for (const s of [plain, drawn]) s.e.clock.advance(16);
    expect(drawn.overlay.innerHTML).toBe(plain.overlay.innerHTML);
    for (const s of [plain, drawn]) void s.switcher.show("bars");
    for (let t = 0; t < 400; t += 16) {
      expect(drawn.overlay.innerHTML).toBe(plain.overlay.innerHTML);
      for (const path of drawn.paths()) expect(hidden(path)).toBe(true);
      for (const s of [plain, drawn]) s.e.clock.advance(16);
    }
    await flush();
    expect(drawn.switcher.current).toBe("bars");
    expect(hiddenIn(drawn.svg)).toEqual([]);
    for (const s of [plain, drawn]) {
      s.switcher.destroy();
      s.vega.finalize();
    }
  });
});

// ── Host switches with no redraw mid-switch, as on main ─────────────────────

/** What each case is shown in turn, and for how long: "!" before a view focuses the old view's tab stop first; "draw:" draws a host again at rest. */
type Steps = readonly (readonly [step: string, ms: number])[];

interface DigestCase {
  readonly mode?: MotionMode;
  readonly reduced?: boolean;
  readonly views: (e: Env, hosts: Partial<Record<"pie" | "columns", Host>>) => Promise<ChartSwitchViews>;
  readonly initial: string;
  readonly steps: Steps;
}

const d3Views = (e: Env, hosts: Partial<Record<"pie" | "columns", Host>>): ChartSwitchViews => ({
  pie: (container) => {
    const pie = (hosts.pie = pieHost(container));
    return hostView(attachPie(pie, e), { labels: () => pie.labels() });
  },
  columns: (container) => {
    const columns = (hosts.columns = columnsHost(container));
    return hostView(attachColumns(columns, e), { labels: () => columns.labels() });
  }
});

const DIGESTS: Record<string, DigestCase> = {
  "a D3 pie and D3 columns": {
    views: async (e, hosts) => ({
      ...d3Views(e, hosts),
      bars: (container, colors) => barChart(container, { label: "Shot outcomes, bars", data: outcomes, y: "outcome", x: "shots", colorBy: "category", colors, width: 600 }, e)
    }),
    initial: "pie",
    steps: [
      ["!columns", 960],
      ["pie", 400],
      ["columns", 300],
      ["bars", 960],
      ["pie", 960]
    ]
  },
  "hosts drawn again at rest": {
    views: async (e, hosts) => d3Views(e, hosts),
    initial: "pie",
    steps: [
      ["draw:columns", 0],
      ["!columns", 960],
      ["draw:pie", 0],
      ["pie", 960]
    ]
  },
  "a Vega-Lite chart and a D3 pie": {
    views: async (e, hosts) => {
      const host = document.createElement("div");
      const vega = new View(parse(compile(vegaSpec).spec), { renderer: "svg", container: host });
      await vega.runAsync();
      return {
        bars: (container: HTMLElement) => {
          container.appendChild(host);
          return hostView(fromVegaView<Outcome>(vega, { key: (d) => d.outcome, keyboard: true }, e));
        },
        pie: d3Views(e, hosts).pie!
      };
    },
    initial: "bars",
    steps: [
      ["!pie", 960],
      ["bars", 500],
      ["pie", 960]
    ]
  },
  "a D3 pie and our columns": {
    views: async (e, hosts) => ({
      pie: d3Views(e, hosts).pie!,
      columns: (container, colors) => barChart(container, { label: "Shot outcomes, our columns", data: outcomes, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors, width: 600 }, e)
    }),
    initial: "pie",
    steps: [
      ["!columns", 960],
      ["pie", 960]
    ]
  },
  analysis: {
    mode: "analysis",
    views: async (e, hosts) => d3Views(e, hosts),
    initial: "pie",
    steps: [
      ["!columns", 208],
      ["pie", 96],
      ["columns", 208]
    ]
  },
  "motion off": {
    mode: "off",
    views: async (e, hosts) => d3Views(e, hosts),
    initial: "pie",
    steps: [
      ["!columns", 16],
      ["draw:columns", 0],
      ["pie", 16]
    ]
  },
  "reduced motion": {
    reduced: true,
    views: async (e, hosts) => d3Views(e, hosts),
    initial: "pie",
    steps: [
      ["!columns", 16],
      ["draw:pie", 0],
      ["pie", 16]
    ]
  }
};

/**
 * A case's markup, its views and its overlay, on every 16 ms frame, with the focused element's name,
 * as a digest. Numbers are rounded to 1e-6, so the last bits of Math.pow and Math.cbrt, which differ
 * between Node 22's V8 and Node 24's, don't count, and the ids numbered by how many came before in the
 * document lose their number, so the tests before these don't count either.
 */
async function digestOf({ mode, reduced, views, initial, steps }: DigestCase): Promise<string> {
  const e = env(mode, reduced);
  const hosts: Partial<Record<"pie" | "columns", Host>> = {};
  const target = document.body.appendChild(document.createElement("div"));
  const switcher = chartSwitch(target, { views: await views(e, hosts), initial, transition: morph(), colors: colorAssignment({ Goal: 1, Saved: 2, "Off target": 3, Blocked: 4 }), announce: true }, e);
  let log = "";
  const frames = (ms: number): void => {
    for (let t = 0; t < ms; t += 16) {
      const active = document.activeElement;
      const focused = `${active?.localName} ${active?.getAttribute("aria-label") ?? ""} ${active?.closest("[data-key]")?.getAttribute("data-key") ?? ""}`;
      const text = target.innerHTML.replace(/-?\d+\.\d+(?:e-?\d+)?/g, (n) => String(Math.round(Number(n) * 1e6) / 1e6));
      log += `${focused}\n${text.replace(/\b(ec-description|ec-focus-mask)-\d+/g, "$1-#")}\n`;
      e.clock.advance(16);
    }
  };
  for (const [step, ms] of steps) {
    if (step.startsWith("draw:")) {
      const name = step.slice(5) as "pie" | "columns";
      const host = hosts[name]!;
      host.draw(next);
      (switcher.chart(name) as HostView<unknown>).refresh(host.marks());
    } else {
      if (step.startsWith("!")) (switcher.chart(switcher.current).element.querySelector('[tabindex="0"]') as SVGElement).focus();
      void switcher.show(step.replace("!", ""));
    }
    frames(ms);
    await flush();
  }
  switcher.destroy();
  target.remove();
  return hash(log);
}

/**
 * The digests main (f5900e9, 0.9.0's library code) gave, with this file's digestOf() run there, before a
 * host drawn again mid-switch was hidden. Pinned again on jsdom 31 (M16 step 1), which writes a host
 * mark's `outline: none` back as `outline: medium`: nothing else in the frames moved.
 */
const MAIN: Readonly<Record<string, string>> = {
  "a D3 pie and D3 columns": "a24826b8a1f49133",
  "hosts drawn again at rest": "dcca27196c87572d",
  "a Vega-Lite chart and a D3 pie": "9e823fce92b9a423",
  "a D3 pie and our columns": "35a11d8c950706ce",
  analysis: "7e80f88c6f4a7021",
  "motion off": "1617f180a2af2690",
  "reduced motion": "1bc28c9287b457d5"
};

describe("host switches with no redraw mid-switch", () => {
  for (const [name, digest] of Object.entries(DIGESTS)) {
    it(`draw every frame as on main, byte for byte: ${name}`, async () => {
      expect(await digestOf(digest)).toBe(MAIN[name]);
    });
  }
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
