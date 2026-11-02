// A chart switch of host charts (M14 step 1): attachments wrapped as views by hostView(), switched with
// the real morph(), on hand-written hosts that copy D3's conventions (a pie's slices in a centred <g>
// and columns in a margin <g>, each row on __data__, an axis drawn with its own <text>), as the
// adapter's tests do. Beside src/index.ts because it brings charts and an effect together, as only the
// composition root may. Last, every reference switch as on main, byte for byte.

import { View, parse } from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import { createMotion, describe as build, easeInOutCubic, manualClock, type MarkGeometry, type MotionMode } from "./core";
import { formatPath, parsePath, transformPath } from "./core/geometry/path";
import { createRegistry, type PresetFactory } from "./core/registry";
import { flush } from "./core/testing";
import {
  barChart,
  chartSwitch,
  colorAssignment,
  donutChart,
  expressive,
  fromVegaView,
  hostView,
  lineChart,
  link,
  type Attachment,
  type ChartEnv,
  type ChartLabel,
  type ChartSwitchViews,
  type ColorAssignment,
  type ExpressiveOptions,
  type HostLabel
} from "./charts";
import { cssColor, seriesColors } from "./charts/render/theme";
import { flash, morph } from "./effects";
import { hostView as publicHostView } from "./index";

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
const KEYS = outcomes.map((row) => row.outcome);

function env(mode: MotionMode = "presentation", reduced = false): ChartEnv & { readonly clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode, reducedMotion: { matches: reduced, subscribe: () => () => {} } });
  return { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock: manualClock() };
}

// The page's CSS for its hosts' labels, as a D3 page styles its text: jsdom computes it, as a browser would.
document.head.appendChild(document.createElement("style")).textContent = [
  ".labels text, .names text { font-family: Inter; font-size: 12px; font-weight: 600; letter-spacing: 0.2px; fill: #333333; }",
  ".values text { font-family: Inter; font-size: 11px; font-weight: 400; fill: #555555; }"
].join("\n");

afterEach(() => {
  document.body.textContent = "";
  vi.restoreAllMocks();
});

// ── Hosts ───────────────────────────────────────────────────────────────────

const SVG = "http://www.w3.org/2000/svg";
const TURN = 2 * Math.PI;
const INNER = 70;
const OUTER = 116;
/** Each host draws in a palette of its own, so a pair's colour says which view it came from. */
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
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (text !== undefined) element.textContent = text;
  parent.appendChild(element);
  return element;
}

/** Binds a row to its element as D3 does. */
const bind = <E extends Element>(element: E, row: unknown): E => Object.assign(element, { __data__: row });
const rowOf = <T>(element: Element): T => (element as unknown as { __data__: T }).__data__;
const round = (value: number): number => Math.round(value * 1000) / 1000;
const arcOf = (key: string, slice: Slice): MarkGeometry => build.arc({ key, cx: 0, cy: 0, inner: INNER, outer: OUTER, start: slice.startAngle, end: slice.endAngle });

/**
 * What a D3 page draws for a donut of shots, as d3.pie() and d3.arc() would: a 640 × 300 <svg
 * role="group"> with its name and a title, a <g> centred at (320, 150) with a <path> per outcome, its
 * pie datum on __data__ and filled by outcome, and each slice's name outside it, placed by a
 * transform as arc.centroid() would place it, anchored by the <g> around the names.
 */
function drawPie(parent: Element, rows: readonly Outcome[] = outcomes) {
  const svg = el("svg", { width: 640, height: 300, viewBox: "0 0 640 300", role: "group", "aria-label": "Shot outcomes, a pie" }, parent);
  const title = el("text", { class: "title", x: 12, y: 20 }, svg, "Shots by outcome");
  const plot = el("g", { transform: "translate(320,150)" }, svg);
  const total = rows.reduce((sum, row) => sum + row.shots, 0);
  let angle = 0;
  const slices = rows.map((row) => {
    const slice: Slice = { data: row, value: row.shots, startAngle: angle, endAngle: (angle += (row.shots / total) * TURN) };
    return bind(el("path", { d: arcOf(row.outcome, slice).outline.d, fill: PIE[row.outcome]! }, plot), slice);
  });
  const labels = el("g", { class: "labels", "text-anchor": "middle" }, plot);
  const names = slices.map((path) => {
    const { data, startAngle, endAngle } = rowOf<Slice>(path);
    const mid = (startAngle + endAngle) / 2;
    return el("text", { transform: `translate(${round(140 * Math.sin(mid))},${round(-140 * Math.cos(mid))})`, dy: "0.35em" }, labels, data.outcome);
  });
  return { svg, plot, slices, names, title };
}

/**
 * What a D3 page draws for columns: a 640 × 300 <svg role="group"> with its name, a margin <g> at
 * (40, 20), a y axis as d3.axisLeft() draws one (its font and anchor on its <g>, and a tick <g> each
 * with a <line> and a <text>), a <rect> per outcome with its row on __data__, 1 px a shot, and each
 * column's name under it and its count above it.
 */
function drawColumns(parent: Element, rows: readonly Outcome[] = outcomes) {
  const svg = el("svg", { width: 640, height: 300, viewBox: "0 0 640 300", role: "group", "aria-label": "Shot outcomes, columns" }, parent);
  const plot = el("g", { transform: "translate(40,20)" }, svg);
  const axis = el("g", { class: "axis", fill: "none", "font-size": 10, "font-family": "sans-serif", "text-anchor": "end", "aria-hidden": "true" }, plot);
  const ticks = [0, 50, 100, 150].map((value) => {
    const tick = el("g", { class: "tick", transform: `translate(0,${240 - value})` }, axis);
    el("line", { stroke: "currentColor", x2: -6 }, tick);
    return el("text", { fill: "currentColor", x: -9, dy: "0.32em" }, tick, String(value));
  });
  const columns = rows.map((row, i) => bind(el("rect", { x: i * 140 + 20, y: 240 - row.shots, width: 100, height: row.shots, fill: COLUMNS[row.outcome]! }, plot), row));
  const names = el("g", { class: "names", "text-anchor": "middle" }, plot);
  const values = el("g", { class: "values", "text-anchor": "middle" }, plot);
  return {
    svg,
    plot,
    columns,
    ticks,
    names: rows.map((row, i) => el("text", { x: i * 140 + 70, y: 258 }, names, row.outcome)),
    values: rows.map((row, i) => el("text", { x: i * 140 + 70, y: 234 - row.shots }, values, String(row.shots)))
  };
}

type Pie = ReturnType<typeof drawPie>;
type Columns = ReturnType<typeof drawColumns>;

/** The README's attachment for a D3 pie: by outcome, each slice described with describe.arc, with keyboard and a name per slice. */
function attachPie(pie: Pie, e: ChartEnv, more: Partial<ExpressiveOptions<Slice>> = {}): Attachment<Slice> {
  return expressive<Slice>(pie.slices, { key: (d) => d.data.outcome, geometry: (_el, d, key) => arcOf(key, d), keyboard: true, markLabel: (d) => `${d.data.outcome}: ${d.value} shots`, ...more }, e);
}

function attachColumns(columns: Columns, e: ChartEnv, more: Partial<ExpressiveOptions<Outcome>> = {}): Attachment<Outcome> {
  return expressive<Outcome>(columns.columns, { key: (d) => d.outcome, value: (d) => d.shots, keyboard: true, markLabel: (d) => `${d.outcome}: ${d.shots} shots`, ...more }, e);
}

/** The page's labels: the pie's names, and the columns' names and counts, each by its outcome. */
const pieLabels = (pie: Pie) => (): HostLabel[] => pie.names.map((element) => ({ element, key: element.textContent!, role: "category" }));
const columnLabels = (columns: Columns) => (): HostLabel[] => [
  ...columns.names.map((element): HostLabel => ({ element, key: element.textContent!, role: "category" })),
  ...columns.values.map((element, i): HostLabel => ({ element, key: columns.names[i]!.textContent!, role: "value" }))
];

interface SetupOptions {
  readonly mode?: MotionMode;
  readonly reduced?: boolean;
  /** The attachments' `keyboard`. Default true. */
  readonly keyboard?: boolean;
  /** The columns' rows. Default: the pie's. */
  readonly columns?: readonly Outcome[];
  /** A third view: our own bars. */
  readonly bars?: boolean;
}

/** A D3 pie and D3 columns in one switch, each attached and given to hostView() with its labels. */
function setup(options: SetupOptions = {}) {
  const e = env(options.mode, options.reduced);
  const target = document.body.appendChild(document.createElement("div"));
  const keyboard = options.keyboard ?? true;
  let pie!: Pie;
  let columns!: Columns;
  /** Each host's <svg> as it drew it, before it was attached. */
  const drawn = { pie: "", columns: "" };
  const views = {
    pie: (container: HTMLElement) => {
      pie = drawPie(container);
      drawn.pie = pie.svg.outerHTML;
      return hostView(attachPie(pie, e, { keyboard }), { labels: pieLabels(pie) });
    },
    columns: (container: HTMLElement) => {
      columns = drawColumns(container, options.columns);
      drawn.columns = columns.svg.outerHTML;
      return hostView(attachColumns(columns, e, { keyboard }), { labels: columnLabels(columns) });
    },
    ...(options.bars
      ? { bars: (container: HTMLElement, colors: ColorAssignment) => barChart(container, { label: "Shot outcomes, bars", data: outcomes, y: "outcome", x: "shots", colorBy: "category", colors, width: 600 }, e) }
      : {})
  } satisfies ChartSwitchViews;
  const switcher = chartSwitch(target, { views, initial: "pie", transition: morph(), announce: true }, e);
  const wrapper = target.querySelector(":scope > .ec-switch") as HTMLDivElement;
  const container = (view: string) => wrapper.querySelector(`:scope > .ec-switch-view[data-view="${view}"]`) as HTMLDivElement;
  const overlay = wrapper.querySelector(":scope > .ec-switch-overlay") as SVGSVGElement;
  /** Each host's <svg> at rest, attached. */
  const rest = { pie: pie.svg.outerHTML, columns: columns.svg.outerHTML };
  const land = async (ms = 950): Promise<void> => {
    e.clock.advance(ms);
    await flush();
  };
  return { switcher, e, clock: e.clock, wrapper, container, overlay, pie, columns, drawn, rest, land, pieView: switcher.chart("pie"), columnsView: switcher.chart("columns") };
}

/** Each pair's run as drawn now, by key: its path data and the colours it's drawn in. */
function runs(overlay: SVGSVGElement): Map<string, { readonly d: string; readonly color: string; readonly strong: string }> {
  return new Map(
    Array.from(overlay.querySelectorAll<SVGGElement>(".ec-switch-runs > .ec-run"), (group) => [
      group.getAttribute("data-key")!,
      { d: group.querySelector("path")!.getAttribute("d")!, color: group.style.getPropertyValue("--ec-mark"), strong: group.style.getPropertyValue("--ec-mark-strong") }
    ])
  );
}

/** The overlay's copies of the labels. */
function copies(overlay: SVGSVGElement): { readonly text: string; readonly x: number; readonly y: number; readonly shown: boolean; readonly opacity: string | null; readonly element: SVGTextElement }[] {
  return Array.from(overlay.querySelectorAll<SVGTextElement>(".ec-switch-labels > text"), (element) => ({
    text: element.textContent ?? "",
    x: round(Number(element.getAttribute("x"))),
    y: round(Number(element.getAttribute("y"))),
    shown: element.getAttribute("visibility") !== "hidden",
    opacity: element.getAttribute("opacity"),
    element
  }));
}

/** A mark's outline moved by its host's <g>, as jsdom, with no layout, puts the <svg> at the overlay's origin. */
const moved = (mark: MarkGeometry, x: number, y: number): string => formatPath(transformPath(parsePath(mark.outline.d), [1, 0, 0, 1, x, y]));
const byKey = (marks: readonly MarkGeometry[]) => new Map(marks.map((mark) => [mark.key, mark]));
const hidden = (element: Element): boolean => (element as SVGElement).style.getPropertyValue("visibility") === "hidden";
/** The switch's progress after `ms` of a switch from the start, and each view's other parts' opacity there, as the switch writes it. */
const at = (ms: number): number => easeInOutCubic(ms / 950);
const opacity = (value: number): string => String(Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000);
/** Each host's marks' elements and the labels the page names. */
const named = (host: Pie | Columns): Element[] => ("slices" in host ? [...host.slices, ...host.names] : [...host.columns, ...host.names, ...host.values]);

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
}

describe("hostView: a D3 pie and D3 columns in a chart switch", () => {
  it("is the view a switch reads: the host's <svg>, its marks in their <g>'s space, each mark's key from its elements, and its colour", () => {
    const { pie, columns, pieView, columnsView } = setup();
    expect(pieView.element).toBe(pie.svg);
    expect(pieView.space).toBe(pie.plot);
    expect(columnsView.space).toBe(columns.plot);
    // In the attachment's own space and order: round the pie from 12 o'clock.
    expect(pieView.marks().map((mark) => mark.key)).toEqual(KEYS);
    expect(pieView.marks()[0]!.pivot).toEqual({ x: 0, y: 0 });
    expect(pieView.keyOf(pie.slices[1]!)).toBe("Saved");
    expect(pieView.keyOf(pie.title)).toBeUndefined();
    expect(columnsView.keyOf(columns.columns[2]!)).toBe("Off target");
    expect(pieView.paintOf("Goal")).toEqual({ color: "Goal", drawn: true, cssColor: PIE.Goal });
    expect(columnsView.paintOf("Goal")).toEqual({ color: "Goal", drawn: true, cssColor: COLUMNS.Goal });
    expect(pieView.paintOf("Woodwork")).toBeUndefined();
    expect(publicHostView).toBe(hostView);
  });

  it("pairs each host mark by key and morphs it from its slice to its column in the overlay, each pair in the new view's own colour", async () => {
    const { switcher, overlay, pieView, columnsView, land } = setup();
    const slices = byKey(pieView.marks());
    const bars = byKey(columnsView.marks());
    void switcher.show("columns");
    // At the start, each slice where the pie draws it, through its centred <g>, in its column's colour.
    const first = runs(overlay);
    expect([...first.keys()]).toEqual(columnsView.marks().map((mark) => mark.key));
    for (const [key, run] of first) {
      expect(run.d).toBe(moved(slices.get(key)!, 320, 150));
      expect(run.color).toBe(COLUMNS[key]);
      expect(run.strong).toBe(`color-mix(in oklab, ${COLUMNS[key]}, ${cssColor("text")} 25%)`);
    }
    await land();
    expect(switcher.current).toBe("columns");
    expect(overlay.querySelectorAll("path")).toHaveLength(0);
    // Back: each column where the columns draw it, through their margin <g>, in its slice's colour now.
    void switcher.show("pie");
    const back = runs(overlay);
    expect([...back.keys()].sort()).toEqual([...KEYS].sort());
    for (const [key, run] of back) {
      expect(run.d).toBe(moved(bars.get(key)!, 40, 20));
      expect(run.color).toBe(PIE[key]);
    }
    await land();
    expect(switcher.current).toBe("pie");
  });

  it("hides each host mark's elements and each named label inline while it plays, fades the rest with its view, and gives back what the host had once it lands", async () => {
    const { switcher, pie, columns, container, rest, clock, land } = setup();
    void switcher.show("columns");
    for (const host of [pie, columns]) {
      expect(host.svg.classList.contains("ec-morphing")).toBe(true);
      for (const element of named(host)) expect(hidden(element)).toBe(true);
    }
    // The text the page didn't name stays as the host drew it, and fades with its view.
    for (const element of [pie.title, ...columns.ticks]) expect(element.hasAttribute("style")).toBe(false);
    clock.advance(190);
    expect(container("pie").style.opacity).toBe(opacity(1 - at(190) / 0.4));
    expect(container("columns").style.opacity).toBe("0");
    clock.advance(523);
    expect(container("pie").style.opacity).toBe("0");
    expect(container("columns").style.opacity).toBe(opacity((at(713) - 0.5) / 0.5));
    await land(237);
    expect(switcher.current).toBe("columns");
    expect(pie.svg.outerHTML).toBe(rest.pie);
    expect(columns.svg.outerHTML).toBe(rest.columns);
    expect(columns.svg.hasAttribute("class")).toBe(false);
  });

  it("keeps them hidden through a switch back, and gives them back once that lands", async () => {
    const { switcher, pie, columns, rest, clock, land } = setup();
    void switcher.show("columns");
    clock.advance(300);
    void switcher.show("pie");
    clock.advance(100);
    for (const host of [pie, columns]) for (const element of named(host)) expect(hidden(element)).toBe(true);
    await land();
    expect(switcher.current).toBe("pie");
    expect(pie.svg.outerHTML).toBe(rest.pie);
    expect(columns.svg.outerHTML).toBe(rest.columns);
  });

  it("gives them back when a third view lands the switch, and hides the columns' again for the switch from there", async () => {
    const { switcher, pie, columns, rest, clock, land } = setup({ bars: true });
    void switcher.show("columns");
    clock.advance(300);
    void switcher.show("bars");
    expect(pie.svg.outerHTML).toBe(rest.pie);
    for (const element of named(columns)) expect(hidden(element)).toBe(true);
    expect(columns.svg.classList.contains("ec-morphing")).toBe(true);
    await land();
    expect(switcher.current).toBe("bars");
    expect(columns.svg.outerHTML).toBe(rest.columns);
  });

  it("leaves each host's <svg> as it drew it when the switch is destroyed mid-way, or after a switch, and when a view is destroyed alone", async () => {
    const mid = setup();
    void mid.switcher.show("columns");
    mid.clock.advance(300);
    mid.switcher.destroy();
    expect(mid.wrapper.isConnected).toBe(false);
    expect(mid.pie.svg.outerHTML).toBe(mid.drawn.pie);
    expect(mid.columns.svg.outerHTML).toBe(mid.drawn.columns);

    const after = setup();
    after.pieView.focus("Saved");
    void after.switcher.show("columns");
    await after.land();
    after.switcher.destroy();
    expect(after.pie.svg.outerHTML).toBe(after.drawn.pie);
    expect(after.columns.svg.outerHTML).toBe(after.drawn.columns);

    // A view on its own, destroyed while it hides its marks.
    const e = env();
    const pie = drawPie(document.body);
    const before = pie.svg.outerHTML;
    const view = hostView(attachPie(pie, e), { labels: pieLabels(pie) });
    view.morphing(true);
    expect(pie.svg.getAttribute("class")).toBe("ec-morphing");
    for (const element of named(pie)) expect(hidden(element)).toBe(true);
    view.destroy();
    expect(pie.svg.outerHTML).toBe(before);
  });
});

describe("hostView: labels", () => {
  it("gives each named label at its anchor through its transforms, in the marks' space, with the host's anchor", () => {
    const { pie, columns, pieView, columnsView } = setup();
    const anchor = (text: SVGTextElement) => /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(text.getAttribute("transform")!)!.slice(1).map(Number);
    expect(pieView.labels().map(({ key, role, text, x, y, anchor: a }) => ({ key, role, text, x: round(x), y: round(y), anchor: a }))).toEqual(
      pie.names.map((name) => ({ key: name.textContent, role: "category", text: name.textContent, x: anchor(name)[0], y: anchor(name)[1], anchor: "middle" }))
    );
    expect(columnsView.labels().map(({ key, role, text, x, y }) => ({ key, role, text, x, y }))).toEqual([
      ...KEYS.map((key, i) => ({ key, role: "category", text: key, x: i * 140 + 70, y: 258 })),
      ...outcomes.map((row, i) => ({ key: row.outcome, role: "value", text: String(row.shots), x: i * 140 + 70, y: 234 - row.shots }))
    ]);
  });

  it("moves each label to its partner's place and swaps its text half way, in the host text's computed font and fill, and fades one with no partner", () => {
    const { switcher, overlay, pieView, columnsView, clock } = setup();
    const from = new Map(pieView.labels().map((label) => [label.key, label]));
    const to = (key: string, role: ChartLabel["role"]) => columnsView.labels().find((label) => label.key === key && label.role === role)!;
    void switcher.show("columns");
    const start = copies(overlay);
    // The pie's names, through its <g>, and the columns' counts, which the pie hasn't, faded out.
    for (const key of KEYS) {
      const name = start.find((copy) => copy.text === key && copy.shown)!;
      expect({ x: name.x, y: name.y }).toEqual({ x: round(from.get(key)!.x + 320), y: round(from.get(key)!.y + 150) });
      const count = start.find((copy) => copy.text === to(key, "value").text)!;
      expect(count.opacity).toBe("0");
    }
    // In the host's font and fill, written inline; the pie's names keep their dy.
    const style = (copy: { readonly element: SVGTextElement }) => ["font-family", "font-size", "font-weight", "letter-spacing", "fill"].map((name) => copy.element.style.getPropertyValue(name));
    const name = start.find((copy) => copy.text === "Goal" && copy.element.getAttribute("dy") === "0.35em")!;
    expect(style(name)).toEqual(["Inter", "12px", "600", "0.2px", "rgb(51, 51, 51)"]);
    expect(name.element.getAttribute("text-anchor")).toBe("middle");
    expect(name.element.hasAttribute("transform")).toBe(false);
    expect(name.element.hasAttribute("class")).toBe(false);
    expect(style(start.find((copy) => copy.text === "58")!)).toEqual(["Inter", "11px", "400", "normal", "rgb(85, 85, 85)"]);
    // Half way: the columns' names, half way between.
    clock.advance(475);
    const half = copies(overlay).filter((copy) => copy.shown && copy.opacity !== "0");
    for (const key of KEYS) {
      const a = from.get(key)!;
      const b = to(key, "category");
      const shown = half.filter((copy) => copy.text === key);
      expect(shown).toHaveLength(1);
      expect({ x: shown[0]!.x, y: shown[0]!.y }).toEqual({ x: round((a.x + 320 + b.x + 40) / 2), y: round((a.y + 150 + b.y + 20) / 2) });
    }
    // Text the page didn't name isn't copied: it fades with its view.
    expect(copies(overlay).map((copy) => copy.text)).not.toContain("Shots by outcome");
    expect(copies(overlay).map((copy) => copy.text)).not.toContain("150");
  });

  it("leaves out a label whose key is no mark's, a label that isn't a <text> in the host's <svg>, and every label when labels() throws (reported)", () => {
    const e = env();
    const pie = drawPie(document.body);
    const stray = el("text", { x: 4, y: 290 }, pie.svg, "Woodwork");
    const outside = el("text", { x: 0, y: 0 }, drawPie(document.body).svg, "Goal");
    const given: HostLabel[] = [{ element: stray, key: "Woodwork", role: "category" }, { element: outside, key: "Goal", role: "category" }, ...pieLabels(pie)()];
    const view = hostView(attachPie(pie, e), { labels: () => given });
    expect(view.labels().map((label) => label.element.textContent)).toEqual(KEYS);
    view.morphing(true);
    expect(hidden(stray)).toBe(false);
    expect(hidden(outside)).toBe(false);
    view.morphing(false);

    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    const failing = hostView(attachPie(drawPie(document.body), e), {
      labels: () => {
        throw new Error("no labels");
      }
    });
    expect(failing.labels()).toEqual([]);
    expect(reported).toHaveBeenCalledWith(new Error("no labels"));
    vi.unstubAllGlobals();
  });

  it("draws a rotated label upright at its anchor", () => {
    const e = env();
    const pie = drawPie(document.body);
    pie.names[0]!.setAttribute("transform", "translate(100,50) rotate(-90)");
    pie.names[0]!.setAttribute("x", "10");
    const view = hostView(attachPie(pie, e), { labels: pieLabels(pie) });
    const label = view.labels()[0]!;
    expect({ x: round(label.x), y: round(label.y) }).toEqual({ x: 100, y: 40 });
    expect(label.element.hasAttribute("transform")).toBe(false);
  });
});

describe("hostView: unmatched keys", () => {
  it("fades a host mark only one view has where it stands, in its own host's colour", () => {
    const { switcher, overlay, clock } = setup({ columns: [...outcomes.slice(1), { outcome: "Woodwork", shots: 9 }] });
    void switcher.show("columns");
    clock.advance(200);
    const fades = new Map(Array.from(overlay.querySelectorAll<SVGGElement>(".ec-switch-fades > .ec-switch-fade"), (group) => [group.getAttribute("data-key"), group.style.getPropertyValue("--ec-mark")]));
    expect(fades).toEqual(new Map([["Goal", PIE.Goal], ["Woodwork", COLUMNS.Woodwork]]));
  });
});

describe("hostView: focus", () => {
  it("moves focus on a host mark to its key in the next view once the switch lands, with the ring, and back", async () => {
    const { switcher, pie, columns, pieView, land } = setup();
    pieView.focus("Saved");
    expect(document.activeElement).toBe(pie.slices[1]);
    void switcher.show("columns");
    await land();
    expect(document.activeElement).toBe(columns.columns[1]);
    // As a key press would: the ring shows.
    expect(columns.svg.querySelector(".ec-overlay .ec-focus-ring")!.getAttribute("visibility")).toBeNull();
    void switcher.show("pie");
    await land();
    expect(document.activeElement).toBe(pie.slices[1]);
    expect(pie.svg.querySelector(".ec-overlay .ec-focus-ring")!.getAttribute("visibility")).toBeNull();
    // Nothing new in the host's DOM: no key on any element.
    expect(pie.svg.querySelector("[data-key]")).toBeNull();
    expect(columns.svg.querySelector("[data-key]")).toBeNull();
  });

  it("after a switch focus wasn't in, moves the next view's tab stop to the key, with no focus or ring, so Tab lands there", async () => {
    const { switcher, columns, pieView, land } = setup();
    pieView.focus("Blocked");
    const button = document.body.appendChild(document.createElement("button"));
    button.focus();
    void switcher.show("columns");
    await land();
    expect(document.activeElement).toBe(button);
    expect(columns.columns.map((rect) => rect.getAttribute("tabindex"))).toEqual(["-1", "-1", "-1", "0"]);
    expect(columns.svg.querySelector(".ec-overlay .ec-focus-ring")!.getAttribute("visibility")).toBe("hidden");
  });

  it("without keyboard, gives no mark a tab stop and remembers nothing", async () => {
    const { switcher, pie, columns, pieView, land } = setup({ keyboard: false });
    pieView.focus("Saved");
    expect(document.activeElement).toBe(document.body);
    expect(pieView.moveTabStop("Saved")).toBe(false);
    void switcher.show("columns");
    await land();
    expect(document.activeElement).toBe(document.body);
    expect(pie.svg.querySelector("[tabindex]")).toBeNull();
    expect(columns.svg.querySelector("[tabindex]")).toBeNull();
  });
});

describe("hostView: the view on show", () => {
  it("is heard through the switch's on(), the view on show alone, before and after a switch", async () => {
    const { switcher, pie, columns, land } = setup();
    const heard: string[] = [];
    switcher.on("hover", (event) => heard.push(`${event.mark.key} ${event.source}`));
    pointer("pointerover", pie.slices[0]!);
    pointer("pointerover", columns.columns[1]!);
    pointer("pointerleave", pie.svg);
    expect(heard).toEqual(["Goal pointer"]);
    void switcher.show("columns");
    await land();
    pointer("pointerover", columns.columns[2]!);
    expect(heard).toEqual(["Goal pointer", "Off target pointer"]);
  });

  it("takes part in a link through the view on show: another chart's hover lights the host's marks, and the host's lights the other's", async () => {
    const { switcher, pie, columns, e, land } = setup();
    const other = barChart(document.body.appendChild(document.createElement("div")), { label: "Shots", data: outcomes, x: "outcome", y: "shots", orientation: "vertical", width: 600 }, e);
    link([switcher, other]);
    const heard: string[] = [];
    switcher.on("hover", (event) => heard.push(`switch ${event.mark.key} ${event.source}`));
    other.on("hover", (event) => heard.push(`other ${event.mark.key} ${event.source}`));
    other.focus("Saved");
    pointer("pointerover", pie.slices[3]!);
    expect(heard).toEqual(["other Saved keyboard", "switch Saved linked", "switch Blocked pointer", "other Blocked linked"]);
    pointer("pointerleave", pie.svg);
    heard.length = 0;
    void switcher.show("columns");
    await land();
    pointer("pointerover", columns.columns[0]!);
    expect(heard).toEqual(["switch Goal pointer", "other Goal linked"]);
  });

  it("gives the page the attachment's own methods through chart(view): refresh() after the host redraws, and update({ on })", async () => {
    const { switcher, pie } = setup();
    const view = switcher.chart("pie");
    const exits: string[] = [];
    view.on("exit", (event) => exits.push(event.mark.key));
    pie.slices[3]!.remove();
    view.refresh(pie.slices.slice(0, 3));
    expect(exits).toEqual(["Blocked"]);
    expect(view.marks().map((mark) => mark.key).sort()).toEqual(["Goal", "Off target", "Saved"]);
    await expect(view.update({ on: { hover: flash() } })).resolves.toBeUndefined();
  });

  it("announces the host <svg>'s aria-label after each switch", async () => {
    const { switcher, wrapper, land } = setup();
    const region = wrapper.querySelector(':scope > [role="status"]')!;
    void switcher.show("columns");
    await land();
    expect(region.textContent?.trim()).toBe("Shot outcomes, columns");
    void switcher.show("pie");
    await land();
    expect(region.textContent?.trim()).toBe("Shot outcomes, a pie");
  });
});

describe("hostView: a host view and a chart in one switch", () => {
  function mixed() {
    const e = env();
    let pie!: Pie;
    const colors = colorAssignment({ Goal: 1, Saved: 2, "Off target": 3, Blocked: 4 });
    const switcher = chartSwitch(
      document.body.appendChild(document.createElement("div")),
      {
        views: {
          pie: (container: HTMLElement) => hostView(attachPie((pie = drawPie(container)), e), { labels: pieLabels(pie) }),
          columns: (container: HTMLElement, shared: ColorAssignment) =>
            barChart(container, { label: "Shot outcomes, our columns", data: outcomes, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors: shared, width: 600 }, e)
        },
        initial: "pie",
        transition: morph(),
        colors
      },
      e
    );
    const overlay = document.querySelector(".ec-switch-overlay") as SVGSVGElement;
    const rest = pie.svg.outerHTML;
    return { switcher, pie, rest, overlay, colors, clock: e.clock, columns: switcher.chart("columns"), pieView: switcher.chart("pie") };
  }

  it("morphs the host's slices into our columns and back, each pair in its new view's colours, each view's marks hidden its own way", async () => {
    const { switcher, pie, rest, overlay, colors, clock, columns, pieView } = mixed();
    void switcher.show("columns");
    for (const [key, run] of runs(overlay)) expect(run.color).toBe(seriesColors(colors.slot(key)).color);
    for (const element of named(pie)) expect(hidden(element)).toBe(true);
    expect(columns.element.classList.contains("ec-morphing")).toBe(true);
    // The pie's names move to our columns' names.
    clock.advance(475);
    const half = copies(overlay).filter((copy) => copy.shown && copy.opacity !== "0" && KEYS.includes(copy.text));
    expect(half.map((copy) => copy.text).sort()).toEqual([...KEYS].sort());
    clock.advance(475);
    await flush();
    expect(pie.svg.outerHTML).toBe(rest);
    expect(columns.element.classList.contains("ec-morphing")).toBe(false);
    void switcher.show("pie");
    for (const [key, run] of runs(overlay)) expect(run.color).toBe(PIE[key]);
    clock.advance(950);
    await flush();
    expect(switcher.current).toBe("pie");
    expect(pieView.marks()).toHaveLength(4);
  });

  it("moves focus by key both ways", async () => {
    const { switcher, pie, clock, columns, pieView } = mixed();
    pieView.focus("Off target");
    void switcher.show("columns");
    clock.advance(950);
    await flush();
    expect(columns.element.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("data-key")).toBe("Off target");
    void switcher.show("pie");
    clock.advance(950);
    await flush();
    expect(document.activeElement).toBe(pie.slices[2]);
  });
});

describe("hostView: motion", () => {
  for (const [name, options] of [
    ["motion off", { mode: "off" }],
    ["reduced motion", { reduced: true }]
  ] as const) {
    it(`lands at once with ${name}: nothing hidden or drawn in the overlay, and focus by key`, async () => {
      const { switcher, pie, columns, pieView, overlay, rest, e } = setup(options);
      expect(e.motion.mode).toBe("off");
      pieView.focus("Off target");
      const shown = switcher.show("columns");
      expect(switcher.current).toBe("columns");
      expect(overlay.querySelectorAll(".ec-run, .ec-switch-fade, .ec-switch-labels > text")).toHaveLength(0);
      for (const element of [...named(pie), ...named(columns)]) expect(hidden(element)).toBe(false);
      expect(pie.svg.hasAttribute("class")).toBe(false);
      expect(columns.svg.outerHTML).not.toBe(rest.columns);
      expect(document.activeElement).toBe(columns.columns[2]);
      await shown;
    });
  }
});

describe("hostView: a Vega-Lite chart", () => {
  const VEGA: Readonly<Record<string, string>> = { Goal: "#4c78a8", Saved: "#f58518", "Off target": "#54a24b", Blocked: "#b279a2" };
  const spec: TopLevelSpec = {
    width: 400,
    height: 200,
    data: { values: outcomes },
    mark: "bar",
    encoding: {
      x: { field: "outcome", type: "nominal", sort: KEYS },
      y: { field: "shots", type: "quantitative" },
      color: { field: "outcome", type: "nominal", scale: { domain: KEYS, range: KEYS.map((key) => VEGA[key]!) }, legend: null }
    }
  };

  it("takes a fromVegaView() attachment as a view: its bars morph into a D3 pie's slices and back in their own colours, hidden while it plays", async () => {
    const host = document.createElement("div");
    const vega = new View(parse(compile(spec).spec), { renderer: "svg", container: host });
    await vega.runAsync();
    const svg = host.querySelector("svg")!;
    const drawn = svg.outerHTML;
    const e = env();
    const switcher = chartSwitch(
      document.body.appendChild(document.createElement("div")),
      {
        views: {
          bars: (container: HTMLElement) => {
            container.appendChild(host);
            return hostView(fromVegaView<Outcome>(vega, { key: (d) => d.outcome, keyboard: true }, e));
          },
          pie: (container: HTMLElement) => hostView(attachPie(drawPie(container), e))
        },
        initial: "bars",
        transition: morph()
      },
      e
    );
    const overlay = document.querySelector(".ec-switch-overlay") as SVGSVGElement;
    const bars = switcher.chart("bars");
    expect(bars.element).toBe(svg);
    const paths = Array.from(svg.querySelectorAll(".mark-rect path"));
    expect(paths).toHaveLength(4);
    const rest = svg.outerHTML;
    void switcher.show("pie");
    for (const path of paths) expect(hidden(path)).toBe(true);
    e.clock.advance(950);
    await flush();
    expect(svg.outerHTML).toBe(rest);
    void switcher.show("bars");
    for (const [key, run] of runs(overlay)) expect(run.color).toBe(VEGA[key]);
    e.clock.advance(950);
    await flush();
    expect(svg.outerHTML).toBe(rest);
    switcher.destroy();
    vega.finalize();
    expect(svg.outerHTML).toBe(drawn);
  });
});

describe("hostView: checks", () => {
  it("throws a TypeError on anything but an attachment that expressive() or fromVegaView() returned with marks, and on labels that aren't a function", () => {
    const e = env();
    const chart = barChart(document.body.appendChild(document.createElement("div")), { label: "Shots", data: outcomes, x: "outcome", y: "shots", width: 600 }, e);
    const empty = expressive<Outcome>([], { key: (d) => d.outcome }, e);
    for (const value of [undefined, null, {}, chart, empty, { marks: () => [] }]) {
      expect(() => hostView(value as unknown as Attachment<unknown>)).toThrow(new TypeError("hostView needs an attachment that expressive() or fromVegaView() returned, with marks in an <svg>."));
    }
    const fx = attachPie(drawPie(document.body), e);
    expect(() => hostView(fx, { labels: 3 as never })).toThrow(TypeError);
    expect(() => hostView(fx, null as never)).toThrow(TypeError);
  });
});

// ── Reference switches as on main ───────────────────────────────────────────

interface Week {
  readonly week: number;
  readonly goals: number | null;
  readonly xg: number | null;
}

const perMatch: Week[] = [
  { week: 1, goals: 1, xg: 0.8 },
  { week: 2, goals: 2, xg: 1.4 },
  { week: 3, goals: null, xg: 1.1 },
  { week: 4, goals: 1, xg: null },
  { week: 5, goals: null, xg: 2 },
  { week: 6, goals: 3, xg: 1.7 }
];
const toDate: Week[] = [
  { week: 1, goals: 1, xg: 0.8 },
  { week: 2, goals: 3, xg: 2.2 },
  { week: 3, goals: null, xg: 3.3 },
  { week: 4, goals: 4, xg: null },
  { week: 5, goals: null, xg: 5.3 },
  { week: 6, goals: 7, xg: 7 }
];
const played = perMatch.flatMap((d) => (d.goals === null ? [] : [{ week: d.week, goals: d.goals }]));

/** What each reference switch is shown, in turn, and for how long: "!" before a view focuses the old view's first mark first. */
type Steps = readonly (readonly [view: string, ms: number])[];

/**
 * Every reference switch's markup, its views and its overlay, on every 16 ms frame: a donut and its
 * columns, with a third view and with keys only one view has; line charts and columns keyed as their
 * points, with end dots and rings; there, back part way, on again, to a third view mid-way, with focus
 * in the old view and out of it; and with motion off. With the focused mark's key, a digest a switch.
 * Numbers are rounded to 1e-6, so the last bits of Math.pow and Math.cbrt, which differ between
 * Node 22's V8 and Node 24's, don't count, and the ids numbered by how many came before in the
 * document lose their number, so the tests before these don't count either.
 */
async function referenceDigests(): Promise<Record<string, string>> {
  const cases: Record<string, { readonly mode?: MotionMode; readonly views: (e: ChartEnv) => ChartSwitchViews; readonly initial: string; readonly steps: Steps }> = {
    "a donut and its columns": {
      views: (e) => ({
        donut: (el, colors) => donutChart(el, { label: "Shot outcomes, share of total", data: outcomes, category: "outcome", value: "shots", colors, width: 600 }, e),
        columns: (el, colors) => barChart(el, { label: "Shot outcomes, counts", data: outcomes, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors, width: 600 }, e),
        bars: (el, colors) => barChart(el, { label: "Shot outcomes, bars", data: outcomes, y: "outcome", x: "shots", colorBy: "category", colors, width: 600 }, e)
      }),
      initial: "donut",
      steps: [
        ["!columns", 960],
        ["donut", 400],
        ["columns", 300],
        ["bars", 960],
        ["donut", 960]
      ]
    },
    "keys in one view": {
      views: (e) => ({
        donut: (el, colors) => donutChart(el, { label: "Shots", data: outcomes, category: "outcome", value: "shots", colors, width: 600 }, e),
        columns: (el, colors) =>
          barChart(el, { label: "Shots", data: [...outcomes.slice(1), { outcome: "Woodwork", shots: 9 }], x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors, width: 600 }, e)
      }),
      initial: "donut",
      steps: [
        ["columns", 960],
        ["donut", 960]
      ]
    },
    "lines and columns": {
      views: (e) => ({
        perMatch: (el, colors) => lineChart<Week>(el, { label: "Per match", data: perMatch, x: "week", series: ["goals", "xg"], colors, width: 600 }, e),
        toDate: (el, colors) => lineChart<Week>(el, { label: "Season to date", data: toDate, x: "week", series: ["goals", "xg"], colors, width: 600 }, e),
        columns: (el, colors) =>
          barChart(el, { label: "Goals per match", data: played, x: (d) => String(d.week), y: "goals", key: (d) => `goals@${d.week}`, orientation: "vertical", colors, width: 600 }, e)
      }),
      initial: "perMatch",
      steps: [
        ["!columns", 960],
        ["perMatch", 500],
        ["toDate", 960],
        ["columns", 960],
        ["toDate", 960]
      ]
    },
    "motion off": {
      mode: "off",
      views: (e) => ({
        donut: (el, colors) => donutChart(el, { label: "Shots", data: outcomes, category: "outcome", value: "shots", colors, width: 600 }, e),
        columns: (el, colors) => barChart(el, { label: "Shots", data: outcomes, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors, width: 600 }, e)
      }),
      initial: "donut",
      steps: [
        ["!columns", 16],
        ["donut", 16]
      ]
    }
  };
  const out: Record<string, string> = {};
  for (const [name, { mode, views, initial, steps }] of Object.entries(cases)) {
    const e = env(mode);
    const target = document.body.appendChild(document.createElement("div"));
    const switcher = chartSwitch(target, { views: views(e), initial, transition: morph(), colors: colorAssignment({ Goal: 1, Saved: 2, "Off target": 3, Blocked: 4 }), announce: true }, e);
    let log = "";
    const frames = (ms: number): void => {
      for (let t = 0; t < ms; t += 16) {
        const focused = document.activeElement?.closest("[data-key]")?.getAttribute("data-key") ?? "";
        const markup = target.innerHTML.replace(/-?\d+\.\d+(?:e-?\d+)?/g, (n) => String(Math.round(Number(n) * 1e6) / 1e6));
        log += `${focused}\n${markup.replace(/\b(ec-description|ec-focus-mask)-\d+/g, "$1-#")}\n`;
        e.clock.advance(16);
      }
    };
    for (const [step, ms] of steps) {
      const view = step.replace("!", "");
      if (step.startsWith("!")) (switcher.chart(switcher.current).element.querySelector('[tabindex="0"]') as SVGElement).focus();
      void switcher.show(view);
      frames(ms);
      await flush();
    }
    out[name] = hash(log);
    switcher.destroy();
    target.remove();
  }
  return out;
}

/** The digests main (72efd8d) gave, with this file's referenceDigests() run there, before host views came in. */
const MAIN: Readonly<Record<string, string>> = {
  "a donut and its columns": "bcef9d93f55dbaf5",
  "keys in one view": "f1063e36d3804277",
  "lines and columns": "e3e8e0dc5bf928aa",
  "motion off": "e70a8f546f9bddd1"
};

describe("reference switches", () => {
  it("draw every frame as on main, byte for byte: their views and overlay, there, back part way, on again and to a third view, with focus, and with motion off", async () => {
    expect(await referenceDigests()).toEqual(MAIN);
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
