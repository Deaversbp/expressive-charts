// A <line>'s colour (M17 step 2): the adapter reads it from the line's stroke, whatever its fill, since
// a line has no inside and its fill draws nothing. These pin what a page sees of that: dim's strong
// colour, what an effect draws in the mark's colour, the run travel's icon is in, and a fade in a chart switch, each
// in the stroke's colour and not jsdom's (and a browser's) black; a line with no stroke having no
// colour; and every other element reading as before. Last, host views with no <line> in them, and lines
// whose fill is none, byte for byte as on main. Beside src/index.ts because it brings charts and effects
// together, as only the composition root may.

import { chartSwitch, expressive, hostView, type Attachment, type ChartEnv, type ChartSwitchViews, type ExpressiveOptions, type HostView } from "./charts";
import { createMotion, manualClock, type EffectContext, type GeometryEffect, type MarkGeometry, type MotionMode } from "./core";
import { flush } from "./core/testing";
import { morph, parallel, travel } from "./effects";
import { iconRegistry, presetRegistry } from "./registries";

type Env = ChartEnv & { readonly clock: ReturnType<typeof manualClock> };

function env(mode: MotionMode = "presentation", reduced = false): Env {
  const motion = createMotion({ mode, reducedMotion: { matches: reduced, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

// The page's CSS, as a D3 page styles its marks by class: jsdom computes it, as a browser would.
const css = document.head.appendChild(document.createElement("style"));
css.textContent = [
  ".hl-green { fill: #02a471; }",
  ".hl-rule { stroke: #7a4fd0; }",
  ".hl-open { fill: none; stroke: #7a4fd0; }",
  ".hl-unpainted { stroke: none; }",
  ".hl-rows .hl-inherits { stroke-width: 2px; }"
].join("\n");
// Taken out once the file is done: the files a worker runs share its document.
afterAll(() => css.remove());

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const SVG = "http://www.w3.org/2000/svg";
const BLUE = "#2a78d6";
const ORANGE = "#eb6834";
const AMBER = "#c28409";
const GREY = "#8a8a8a";
const VIOLET = "#7a4fd0";

type Attributes = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Attributes, parent: Element): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  parent.appendChild(element);
  return element;
}

/** What each mark carries on __data__, as D3 binds a row. */
interface Row {
  readonly name: string;
}

/** One mark a host draws: its key, its tag, its attributes, and attributes for a <g> of its own round it. */
type Shape = readonly [name: string, tag: keyof SVGElementTagNameMap, attributes: Attributes, group?: Attributes];

/** A 400 px <svg role="group"> with a plot <g>, and each shape in it, its row on __data__, a D3 page's way. */
function hostOf(parent: Element, label: string, shapes: readonly Shape[]) {
  const svg = el("svg", { width: 400, height: 300, viewBox: "0 0 400 300", role: "group", "aria-label": label }, parent);
  const plot = el("g", { class: "hl-rows", transform: "translate(20,10)" }, svg);
  const marks = shapes.map(([name, tag, attributes, group]) => Object.assign(el(tag, attributes, group ? el("g", group, plot) : plot), { __data__: { name } satisfies Row }));
  const byName = new Map(marks.map((mark) => [mark.__data__.name, mark as SVGElement]));
  return { svg, plot, marks: marks as readonly SVGElement[], mark: (name: string): SVGElement => byName.get(name)! };
}

type Host = ReturnType<typeof hostOf>;

/** A line across row `i`, 24 px a row, from 10 to 210. */
const across = (i: number): Attributes => ({ x1: 10, x2: 210, y1: i * 24 + 12, y2: i * 24 + 12, "stroke-width": 3 });

/**
 * Lines as pages draw them. The first four have no `fill: none`: no fill at all, as D3's append("line")
 * leaves it; a fill attribute, which draws nothing on a line; the stroke from a class; and from an
 * ancestor. The next four say fill none, by attribute, inline style, class and ancestor.
 */
const LINES: readonly Shape[] = [
  ["bare", "line", { ...across(0), stroke: GREY }],
  ["filled", "line", { ...across(1), fill: ORANGE, stroke: BLUE }],
  ["classed", "line", { ...across(2), class: "hl-rule" }],
  ["inherits", "line", { ...across(3), class: "hl-inherits" }, { stroke: AMBER }],
  ["none", "line", { ...across(4), fill: "none", stroke: GREY }],
  ["none-style", "line", { ...across(5), style: `fill: none; stroke: ${BLUE}` }],
  ["none-class", "line", { ...across(6), class: "hl-open" }],
  ["none-inherits", "line", { ...across(7) }, { fill: "none", stroke: AMBER }]
];

/** Each of LINES' colours: its stroke. */
const LINE_COLORS: Readonly<Record<string, string>> = { bare: GREY, filled: BLUE, classed: VIOLET, inherits: AMBER, none: GREY, "none-style": BLUE, "none-class": VIOLET, "none-inherits": AMBER };

/** Lines with nothing to draw them: no stroke, and stroke none by attribute, style, class and ancestor, with a fill or without. */
const UNPAINTED: readonly Shape[] = [
  ["no-stroke", "line", across(0)],
  ["fill-alone", "line", { ...across(1), fill: ORANGE }],
  ["stroke-none", "line", { ...across(2), stroke: "none" }],
  ["stroke-none-filled", "line", { ...across(3), fill: ORANGE, stroke: "none" }],
  ["stroke-none-style", "line", { ...across(4), style: "stroke: none" }],
  ["stroke-none-class", "line", { ...across(5), class: "hl-unpainted" }],
  ["stroke-none-inherits", "line", across(6), { stroke: "none" }],
  ["transparent", "line", { ...across(7), stroke: "transparent" }],
  ["gradient", "line", { ...across(8), stroke: "url(#fade)" }]
];

/**
 * Every other element the adapter reads, painted each way: none is a <line>. An open <path> or
 * <polyline> with no fill is filled, black, by a browser, so its colour is its fill, as before.
 */
const OTHERS: readonly Shape[] = [
  ["rect", "rect", { x: 0, y: 0, width: 120, height: 16 }, { fill: BLUE }],
  ["rect-classed", "rect", { x: 0, y: 24, width: 90, height: 16, class: "hl-green" }],
  ["rect-bare", "rect", { x: 0, y: 48, width: 60, height: 16 }],
  ["rect-stroked", "rect", { x: 0, y: 72, width: 60, height: 16, stroke: ORANGE }],
  ["rect-hollow", "rect", { x: 0, y: 96, width: 60, height: 16, fill: "none", stroke: ORANGE, "stroke-width": 2 }],
  ["rect-gradient", "rect", { x: 0, y: 120, width: 60, height: 16, fill: "url(#fade)" }],
  ["circle", "circle", { cx: 160, cy: 8, r: 6, fill: ORANGE }],
  ["circle-hollow", "circle", { cx: 160, cy: 32, r: 6, fill: "none", stroke: ORANGE, "stroke-width": 2 }],
  ["circle-bare", "circle", { cx: 160, cy: 56, r: 6, stroke: ORANGE }],
  ["ellipse", "ellipse", { cx: 160, cy: 80, rx: 12, ry: 6, style: `fill: ${AMBER}` }],
  ["path-open", "path", { d: "M200,10L260,40L320,20", fill: "none", stroke: AMBER, "stroke-width": 3 }],
  ["path-bare", "path", { d: "M200,60L260,90L320,70", stroke: AMBER, "stroke-width": 3 }],
  ["path-filled", "path", { d: "M200,110L260,140L320,120", fill: BLUE, stroke: AMBER, "stroke-width": 3 }],
  ["path-closed", "path", { d: "M200,160L260,190L320,170Z", fill: GREY }],
  ["path-classed", "path", { d: "M200,210L260,240L320,220", class: "hl-open", "stroke-width": 2 }],
  ["polyline-open", "polyline", { points: "0,150 40,180 80,160", fill: "none", stroke: BLUE, "stroke-width": 2 }],
  ["polyline-bare", "polyline", { points: "0,190 40,220 80,200", stroke: BLUE, "stroke-width": 2 }],
  ["polyline-filled", "polyline", { points: "0,230 40,260 80,240", fill: ORANGE, stroke: BLUE, "stroke-width": 2 }],
  ["polygon", "polygon", { points: "100,150 140,180 120,200", fill: AMBER }],
  ["polygon-hollow", "polygon", { points: "100,210 140,240 120,260", fill: "none", stroke: GREY }]
];

/** OTHERS' colours on main: its fill, black where nothing sets it, or its stroke when the fill is none; a gradient has none. */
const OTHER_COLORS: Readonly<Record<string, string | undefined>> = {
  rect: BLUE,
  "rect-classed": "rgb(2, 164, 113)",
  "rect-bare": "rgb(0, 0, 0)",
  "rect-stroked": "rgb(0, 0, 0)",
  "rect-hollow": ORANGE,
  "rect-gradient": undefined,
  circle: ORANGE,
  "circle-hollow": ORANGE,
  "circle-bare": "rgb(0, 0, 0)",
  ellipse: "rgb(194, 132, 9)",
  "path-open": AMBER,
  "path-bare": "rgb(0, 0, 0)",
  "path-filled": BLUE,
  "path-closed": GREY,
  "path-classed": "rgb(122, 79, 208)",
  "polyline-open": BLUE,
  "polyline-bare": "rgb(0, 0, 0)",
  "polyline-filled": ORANGE,
  polygon: AMBER,
  "polygon-hollow": GREY
};

/** Bars of some of a host's keys, a second view: every other mark has a bar to turn into, and the rest fade. */
function barsOf(parent: Element, shapes: readonly Shape[]): Host {
  return hostOf(
    parent,
    "Bars",
    shapes.filter((_, i) => i % 2 === 0).map(([name], i): Shape => [name, "rect", { x: 0, y: i * 20, width: 60 + i * 12, height: 14, fill: i % 2 ? ORANGE : BLUE }])
  );
}

/** Full emphasis and a halo while it runs, and a trace of the walk in the mark's colour. */
const glowAt = (mark: MarkGeometry, ctx: EffectContext): void => {
  ctx.mark.set({ emphasis: 0.5, halo: { width: 6, opacity: 0.4 } });
  ctx.layer.path(mark.slice(0, 1), { stroke: "mark", width: 1 });
};
const glow: GeometryEffect = { kind: "geometry", run: async (mark, ctx) => glowAt(mark, ctx), end: glowAt, clear: () => {} };

function attach(host: Host, e: ChartEnv, more: Partial<ExpressiveOptions<Row>> = {}): Attachment<Row> {
  return expressive<Row>(host.marks, { key: (d) => d.name, keyboard: true, markLabel: (d) => d.name, ...more }, e);
}

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
}

const overlayOf = (svg: Element): SVGGElement => svg.querySelector<SVGGElement>(".ec-overlay")!;
/** A colour as jsdom writes an inline style: a hex colour as rgb(). */
const rgb = (color: string): string => (color.startsWith("#") ? `rgb(${[1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16)).join(", ")})` : color);
/** Either way of writing a colour. */
const same = (color: string): RegExp => new RegExp(`^(${color}|${rgb(color).replace(/[()]/g, "\\$&")})$`, "i");
/** A mark's strong colour: its colour stepped toward the text colour. */
const strong = (color: string): string => `color-mix(in oklab, ${color}, var(--ec-text, #0b0b0b) 25%)`;
const BLACK = /^(black|#000|#000000|rgb\(0, 0, 0\))$/;

/**
 * Computed styles as a browser gives them, which jsdom's aren't: presentation attributes are read,
 * after inline styles, inherited from the element's ancestors, and a fill nothing sets is black and a
 * stroke none. `css` is what the page's style sheets give an element.
 */
function browserStyles(css: ReadonlyMap<Element, Readonly<Record<string, string>>> = new Map()): void {
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = computed(element, pseudo);
    const own = (node: Element, name: string): string | undefined => css.get(node)?.[name] ?? ((node as SVGElement).style?.getPropertyValue(name) || node.getAttribute(name) || undefined);
    const value = (name: string): string => {
      if (name !== "fill" && name !== "stroke") return own(element, name) ?? style.getPropertyValue(name);
      for (let node: Element | null = element; node; node = node.parentElement) {
        const set = own(node, name);
        if (set !== undefined) return set;
      }
      return name === "fill" ? "rgb(0, 0, 0)" : "none";
    };
    return Object.assign(Object.create(style) as CSSStyleDeclaration, { getPropertyValue: value });
  });
}

/** A host's marks attached with dim, and on hover a glow in the mark's colour beside travel's arrow. */
function hovering(shapes: readonly Shape[], mode: MotionMode = "presentation") {
  const e = env(mode);
  const host = hostOf(document.body, "Marks", shapes);
  const fx = attach(host, e, { dim: true, on: { hover: parallel(glow, travel("arrow", { ride: "on" })) } });
  /** The hover's run for a mark, which carries the mark's colour for what effects draw. */
  const run = (name: string): SVGGElement | null => overlayOf(host.svg).querySelector<SVGGElement>(`.ec-run[data-slot="hover"][data-key="${name}"]`);
  return { e, host, fx, run, view: hostView(fx) };
}

/** The paint a mark's inline style holds now: what dim's strong colour or an effect's emphasis wrote. */
const inline = (element: SVGElement): Record<"fill" | "stroke", string> => ({ fill: element.style.getPropertyValue("fill"), stroke: element.style.getPropertyValue("stroke") });

describe("a <line>'s colour is its stroke, whatever its fill", () => {
  it("reads the stroke of a line with no fill, with a fill attribute and with fill none, set on the line, by a class or on an ancestor", () => {
    const { view } = hovering(LINES);
    for (const [name] of LINES) {
      const paint = view.paintOf(name)!;
      expect({ ...paint, cssColor: undefined }, name).toEqual({ color: name, drawn: true, cssColor: undefined });
      expect(paint.cssColor, name).toMatch(same(LINE_COLORS[name]!));
      expect(paint.cssColor, name).not.toMatch(BLACK);
    }
  });

  it("reads the same where computed styles read attributes, as a browser's do: a line's black fill never its colour", () => {
    // A browser computes a line with no fill as black, and that drew a hovered connector black.
    const sheets = new Map<Element, Record<string, string>>();
    browserStyles(sheets);
    const host = hostOf(document.body, "Marks", LINES);
    for (const [name, color] of [
      ["classed", "rgb(122, 79, 208)"],
      ["none-class", "rgb(122, 79, 208)"]
    ] as const)
      sheets.set(host.mark(name), { stroke: color, ...(name === "none-class" ? { fill: "none" } : {}) });
    const view = hostView(attach(host, env(), { dim: true }));
    for (const [name] of LINES) expect(view.paintOf(name)!.cssColor, name).toMatch(same(LINE_COLORS[name]!));
    // And the hover colour goes to the stroke.
    pointer("pointerover", host.mark("bare"));
    expect(inline(host.mark("bare"))).toEqual({ fill: "", stroke: strong(GREY) });
  });

  it("gives a hovered line its stroke's strong colour under dim, on its stroke, and leaves its fill alone", () => {
    const { host } = hovering(LINES);
    /** Each line's inline paint as the page wrote it: one says fill none and its stroke there. */
    const drawn = host.marks.map(inline);
    for (const [i, [name]] of LINES.entries()) {
      pointer("pointerover", host.mark(name));
      const { fill, stroke } = inline(host.mark(name));
      expect(fill, name).toBe(drawn[i]!.fill);
      // Half way to strong: the glow's emphasis, mixed from the stroke's colour and its strong colour.
      expect([`color-mix(in oklab, ${LINE_COLORS[name]},`, `color-mix(in oklab, ${rgb(LINE_COLORS[name]!)},`].some((mixed) => stroke.includes(mixed)), `${name}: ${stroke}`).toBe(true);
      expect(stroke, name).not.toMatch(/\b(black|#000000|rgb\(0, 0, 0\))/);
      expect(host.marks.filter((mark) => mark.classList.contains("ec-dimmed"))).toHaveLength(LINES.length - 1);
    }
    pointer("pointerleave", host.svg);
    expect(host.marks.map(inline)).toEqual(drawn);
  });

  it("gives it the strong colour itself with no effect setting emphasis, for keyboard focus too", () => {
    const host = hostOf(document.body, "Marks", LINES);
    const fx = attach(host, env(), { dim: true });
    pointer("pointerover", host.mark("bare"));
    expect(inline(host.mark("bare"))).toEqual({ fill: "", stroke: strong(GREY) });
    pointer("pointerleave", host.svg);
    fx.focus("filled");
    expect(inline(host.mark("filled"))).toEqual({ fill: "", stroke: strong(BLUE) });
    expect(inline(host.mark("bare"))).toEqual({ fill: "", stroke: "" });
    fx.destroy();
    // Given back as drawn: the fill attribute, which draws nothing, is the page's still.
    expect(host.mark("filled").getAttribute("fill")).toBe(ORANGE);
    expect(host.mark("filled").getAttribute("style")).toBeNull();
  });

  it("gives what effects draw for it its stroke's colour: the mark colour of the run that carries the glow's trace and travel's arrow, and the halo", async () => {
    const { e, host, run } = hovering(LINES);
    for (const [name] of LINES) {
      pointer("pointerover", host.mark(name));
      e.clock.advance(160);
      await flush();
      // The run's colour is what "mark" paints with: the glow's trace, and any icon drawn in it. The core arrow is in the text colour.
      expect(run(name)!.style.getPropertyValue("--ec-mark"), name).toMatch(same(LINE_COLORS[name]!));
      expect(run(name)!.querySelector('.ec-icon[data-icon="arrow"]'), name).not.toBeNull();
      const halo = overlayOf(host.svg).querySelector<SVGPathElement>(".ec-halos > .ec-halo > path")!;
      expect(halo.style.getPropertyValue("stroke"), name).toMatch(same(LINE_COLORS[name]!));
    }
  });

  it("leaves the arrow at the line's end, in a run of its stroke's colour, with motion off", () => {
    const { host, run } = hovering(LINES, "off");
    pointer("pointerover", host.mark("bare"));
    expect(run("bare")!.style.getPropertyValue("--ec-mark")).toMatch(same(GREY));
    expect(run("bare")!.querySelector('.ec-icon[data-icon="arrow"]')).not.toBeNull();
  });

  it("fades a line out of a chart switch, and back in, in its stroke's colour", async () => {
    const e = env();
    stubResize();
    const target = document.body.appendChild(document.createElement("div"));
    const views = {
      lines: (container: HTMLElement) => hostView(attach(hostOf(container, "Lines", LINES), e)),
      // Bars of other keys, so every line fades where it stands.
      bars: (container: HTMLElement) => hostView(attach(hostOf(container, "Bars", [["Okafor", "rect", { x: 0, y: 0, width: 80, height: 14, fill: BLUE }]]), e))
    } satisfies ChartSwitchViews;
    const switcher = chartSwitch(target, { views, initial: "lines", transition: morph() }, e);
    const fades = (): Map<string, string> =>
      new Map(Array.from(target.querySelectorAll<SVGGElement>(".ec-switch-fades > .ec-switch-fade"), (group) => [group.getAttribute("data-key")!, group.style.getPropertyValue("--ec-mark")]));
    void switcher.show("bars");
    for (const [name] of LINES) expect(fades().get(name), name).toMatch(same(LINE_COLORS[name]!));
    e.clock.advance(960);
    await flush();
    void switcher.show("lines");
    for (const [name] of LINES) expect(fades().get(name), name).toMatch(same(LINE_COLORS[name]!));
    switcher.destroy();
  });

  it("finds no colour in a line with no stroke, a stroke of none or a gradient, whatever its fill: nothing to start a hover colour from", () => {
    for (const browser of [false, true]) {
      const sheets = new Map<Element, Record<string, string>>();
      if (browser) browserStyles(sheets);
      const { host, view, run } = hovering(UNPAINTED);
      sheets.set(host.mark("stroke-none-class"), { stroke: "none" });
      for (const [name] of UNPAINTED) {
        // No paint: a switch draws it in its key's colour, as any mark with no colour to read.
        expect(view.paintOf(name), `${name}, browser ${browser}`).toBeUndefined();
        // Its inline style is the page's own, as it was.
        const before = inline(host.mark(name));
        pointer("pointerover", host.mark(name));
        expect(inline(host.mark(name)), `${name}, browser ${browser}`).toEqual(before);
        expect(run(name)!.style.getPropertyValue("--ec-mark"), `${name}, browser ${browser}`).toBe("");
      }
      vi.restoreAllMocks();
      document.body.replaceChildren();
    }
  });
});

describe("every other element's colour, as before", () => {
  it("is its fill, black where nothing sets it, or its stroke when the fill is none: a <rect>, a <circle>, an <ellipse>, a <polygon>, and an open <path> or <polyline>, which a browser fills", () => {
    const { host, view } = hovering(OTHERS);
    for (const [name, , attributes, group] of OTHERS) {
      const color = OTHER_COLORS[name];
      const cssColor = view.paintOf(name)?.cssColor;
      if (color === undefined) expect(cssColor, name).toBeUndefined();
      else expect(cssColor, name).toMatch(same(color));
      // The property a hover writes: the stroke only when the fill is none.
      pointer("pointerover", host.mark(name));
      const { fill, stroke } = inline(host.mark(name));
      const hollow = (attributes.fill ?? group?.fill) === "none" || attributes.class === "hl-open";
      expect([fill !== "", stroke !== ""], name).toEqual(color === undefined ? [false, false] : hollow ? [false, true] : [true, false]);
    }
  });

  it("is the same where computed styles read attributes: an open <path> or <polyline> with no fill is black, as a browser fills it", () => {
    const sheets = new Map<Element, Record<string, string>>();
    browserStyles(sheets);
    const host = hostOf(document.body, "Marks", OTHERS);
    sheets.set(host.mark("rect-classed"), { fill: "rgb(2, 164, 113)" });
    sheets.set(host.mark("path-classed"), { fill: "none", stroke: "rgb(122, 79, 208)" });
    const view = hostView(attach(host, env(), { dim: true }));
    for (const [name] of OTHERS) {
      const color = OTHER_COLORS[name];
      if (color === undefined) expect(view.paintOf(name), name).toBeUndefined();
      else expect(view.paintOf(name)!.cssColor, name).toMatch(same(color));
    }
    for (const name of ["path-bare", "polyline-bare"]) {
      pointer("pointerover", host.mark(name));
      expect(inline(host.mark(name)), name).toEqual({ fill: strong("rgb(0, 0, 0)"), stroke: "" });
    }
  });
});

// ── Byte for byte ───────────────────────────────────────────────────────────

/** Markup with its numbers rounded to 1e-6 and the ids counted from the document's start without their number. */
const normal = (markup: string): string =>
  markup.replace(/-?\d+\.\d+(?:e-?\d+)?/g, (n) => String(Math.round(Number(n) * 1e6) / 1e6)).replace(/\b(ec-description|ec-focus-mask|ec-halo-mask|ec-clip)-\d+/g, "$1-#");

/** A ResizeObserver that never fires: jsdom has none. */
function stubResize(): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
}

interface DigestCase {
  readonly shapes: readonly Shape[];
  readonly mode?: MotionMode;
  readonly reduced?: boolean;
}

/**
 * Each case's digest: every 16 ms frame of its markup (views, overlay and live region), with numbers
 * rounded and ids' counters gone, and, apart, each mark's paint in words. The host's marks are one
 * view, with dim, the keyboard, and on hover a glow in the mark's colour beside travel's arrow, in a
 * switch with bars of every other key. Each mark is hovered in turn for three frames, one is focused,
 * and the switch goes to the bars, a third of the way back, and to the bars again. A browser runs
 * promise callbacks between frames, so these do too.
 */
async function digests(cases: Readonly<Record<string, DigestCase>>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, { shapes, mode, reduced }] of Object.entries(cases)) {
    const e = env(mode, reduced);
    stubResize();
    const target = document.body.appendChild(document.createElement("div"));
    let host!: Host;
    const views = {
      marks: (container: HTMLElement) => {
        host = hostOf(container, "Marks", shapes);
        return hostView(attach(host, e, { dim: true, on: { hover: parallel(glow, travel("arrow", { ride: "on" })) } }));
      },
      bars: (container: HTMLElement) => hostView(attach(barsOf(container, shapes), e, { dim: true }))
    } satisfies ChartSwitchViews;
    const switcher = chartSwitch(target, { views, initial: "marks", transition: morph(), announce: true }, e);
    const view = switcher.chart("marks") as HostView<Row>;
    let frames = "";
    const play = async (ms: number): Promise<void> => {
      for (let t = 0; t < ms; t += 16) {
        frames += `${normal(target.innerHTML)}\n`;
        e.clock.advance(16);
        await flush();
      }
      await flush();
    };
    const words = [`paints ${view.marks().map((mark) => `${mark.key} ${JSON.stringify(view.paintOf(mark.key) ?? null)}`).join("; ")}`];
    for (const mark of host.marks) {
      pointer("pointerover", mark);
      await play(48);
    }
    pointer("pointerleave", host.svg);
    await play(32);
    view.focus(shapes[1]![0]);
    await play(32);
    for (const [to, ms] of [
      ["bars", 960],
      ["marks", 320],
      ["bars", 960],
      ["marks", 960]
    ] as const) {
      void switcher.show(to);
      await play(ms);
      words.push(`after ${to}: ${switcher.current}`);
    }
    switcher.destroy();
    words.push(`given back: ${normal(host.svg.outerHTML)}`);
    out[name] = `${hash(frames)} ${hash(words.join("\n"))}`;
    target.remove();
    vi.unstubAllGlobals();
  }
  return out;
}

/** Lines whose fill is none, each way a page says it. */
const NONE_LINES = LINES.filter(([name]) => name.startsWith("none"));

const CASES: Readonly<Record<string, DigestCase>> = {
  "no line": { shapes: OTHERS },
  "no line, analysis": { shapes: OTHERS, mode: "analysis" },
  "no line, motion off": { shapes: OTHERS, mode: "off" },
  "no line, reduced motion": { shapes: OTHERS, reduced: true },
  "lines whose fill is none": { shapes: NONE_LINES },
  "lines whose fill is none, motion off": { shapes: NONE_LINES, mode: "off" }
};

/** The digests main (2540c96, 0.11.0's library code) gave, with this file's digests() run there, before a line read its stroke: each frames' then words'. */
const MAIN: Readonly<Record<string, string>> = {
  "no line": "aa77d3946b34b872 4787a0b9ed64dd5a",
  "no line, analysis": "93619c0241599884 4787a0b9ed64dd5a",
  "no line, motion off": "09ee294d15c4bf6a 4787a0b9ed64dd5a",
  "no line, reduced motion": "09ee294d15c4bf6a 4787a0b9ed64dd5a",
  "lines whose fill is none": "c692876fb16b4876 89c7bd426fa6dfc5",
  "lines whose fill is none, motion off": "f581f1be93fa6f75 89c7bd426fa6dfc5"
};

describe("every mark that isn't a <line>, and every <line> whose fill is none, as on main", () => {
  it("draws every frame as on main, byte for byte, and gives the same paints: hovered under dim with a glow and travel's arrow, focused, and through a switch to bars and back, in Presentation, Analysis, Off and reduced motion", async () => {
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
