// Letter and word spacing in a chart's text measure (M18 step 5). A browser whose getComputedTextLength() counts
// a viewer's spacing, as Chromium's and Firefox's do, lays a chart out byte for byte as main did, with spacing and
// with none: the digests were pinned on main (535d98f) with this file's own functions, before the measure changed.
// One whose length leaves spacing out, as WebKit's does, lays the chart out with it all the same. jsdom has no
// layout, so each browser is a stand-in for the three calls the measure makes. Which kind a browser is is found
// once a document, and a file's tests share one, so each stand-in browser gets the library loaded anew.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChartEnv } from "./shell/setup";

/** How much of WCAG 1.4.12's spacing is on: at 1, 0.12 em between characters and 0.16 em more a space. */
let spacing = 0;
/** Whether the stand-in browser's getComputedTextLength() counts spacing. */
let counts = true;

/** The theme's size for each class the charts measure: 12.5 px for the rest. */
const SIZES: Readonly<Record<string, number>> = { "ec-tick": 11, "ec-center-value": 26 };
/** The detection probe's own letter spacing, px, which it sets inline. */
const PROBE = 8;

const sizeOf = (element: Element): number => SIZES[element.getAttribute("class") ?? ""] ?? 12.5;
/** An element's letter spacing, px: the probe's own, or the viewer's. */
const letter = (element: SVGElement): number => (element.style.getPropertyValue("letter-spacing") ? PROBE : 0.12 * spacing * sizeOf(element));
const word = (element: SVGElement): number => 0.16 * spacing * sizeOf(element);
/** The glyphs alone: half an em a character. */
const glyphs = (element: Element): number => sizeOf(element) * (element.textContent ?? "").length * 0.5;
/** The spacing a browser draws the text with: after every character where the length counts it, as Chromium does, and between them where it doesn't, as WebKit does. */
function spaced(element: SVGElement): number {
  const text = element.textContent ?? "";
  return letter(element) * (counts ? text.length : text.length - 1) + word(element) * (text.split(" ").length - 1);
}

/** The library, loaded anew, so it finds out again what kind of browser it's in. */
async function load() {
  vi.resetModules();
  const [core, registry, bar, donut, line] = await Promise.all([import("../core"), import("../core/registry"), import("./bar"), import("./donut"), import("./line")]);
  return { ...core, ...registry, ...bar, ...donut, ...line };
}
type Library = Awaited<ReturnType<typeof load>>;

/** A browser: one whose text length counts spacing, or one whose length leaves it out. */
async function browser(counting: boolean): Promise<Library> {
  counts = counting;
  standIn();
  return load();
}

function standIn(): void {
  vi.restoreAllMocks();
  Object.defineProperties(SVGElement.prototype, {
    getComputedTextLength: { configurable: true, value(this: SVGElement) { return glyphs(this) + (counts ? spaced(this) : 0); } },
    getStartPositionOfChar: { configurable: true, value: () => ({ x: 0, y: 0 }) },
    getEndPositionOfChar: { configurable: true, value(this: SVGElement) { return { x: glyphs(this) + spaced(this), y: 0 }; } }
  });
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = computed(element, pseudo);
    if (element.localName !== "text") return style;
    const own: Record<string | symbol, string> = { letterSpacing: `${letter(element as SVGElement)}px`, wordSpacing: `${word(element as SVGElement)}px` };
    return new Proxy(style, {
      get(target, property) {
        if (property in own) return own[property];
        const value: unknown = Reflect.get(target, property);
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      }
    });
  });
}

afterEach(() => {
  for (const name of ["getComputedTextLength", "getStartPositionOfChar", "getEndPositionOfChar"]) delete (SVGElement.prototype as unknown as Record<string, unknown>)[name];
  vi.restoreAllMocks();
  document.body.replaceChildren();
  spacing = 0;
  counts = true;
});

const regions = Array.from({ length: 12 }, (_, i) => ({ region: `Region ${i + 1} North`, revenue: ((i * 37) % 90) + 20 }));
const sources = [
  { source: "Organic search", visits: 5400 },
  { source: "Direct", visits: 3100 },
  { source: "Social media", visits: 2100 },
  { source: "Email", visits: 900 }
];
const readings = [1, 2, 3, 4, 5, 6].map((hour) => ({ hour, sample: hour * 0.12, control: hour * 0.1 + 0.05 }));

const charts: Readonly<Record<string, (lib: Library, container: HTMLElement, env: ChartEnv) => { readonly element: SVGSVGElement }>> = {
  "a bar chart's bars": (lib, container, env) => lib.barChart(container, { label: "Revenue by region", data: regions.slice(0, 4), y: "region", x: "revenue", width: 600 }, env),
  "a bar chart's columns": (lib, container, env) => lib.barChart(container, { label: "Revenue by region", data: regions, x: "region", y: "revenue", width: 600 }, env),
  "a donut chart": (lib, container, env) => lib.donutChart(container, { label: "Visits by source", data: sources, category: "source", value: "visits", width: 400 }, env),
  "a line chart": (lib, container, env) => lib.lineChart(container, { label: "Absorbance, sample and control", data: readings, x: "hour", series: ["sample", "control"], width: 600 }, env)
};

/** A 64-bit hash of the text (cyrb53's mixing, both halves kept), as 16 hex digits. */
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

/** The chart at rest: its markup, numbers rounded to 1e-6 and the counters in its ids taken out. */
function drawn(lib: Library, name: string): string {
  const container = document.body.appendChild(document.createElement("div"));
  const clock = lib.manualClock();
  const motion = lib.createMotion({ mode: "off", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: lib.createRegistry({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const svg = charts[name]!(lib, container, env).element;
  for (let i = 0; i < 100 && !clock.idle; i++) clock.advance(16);
  return svg.outerHTML.replace(/\bec-([a-z-]+?)-\d+\b/g, "ec-$1").replace(/-?\d+\.\d{7,}(?:e-?\d+)?/g, (n) => String(Math.round(Number(n) * 1e6) / 1e6));
}

/** Pinned on main, 535d98f: each chart with no spacing, and with WCAG 1.4.12's in a browser that counts it. */
const PINNED: Readonly<Record<string, readonly [none: string, counted: string]>> = {
  "a bar chart's bars": ["bf84a44ce494fbe4", "a7b22b4e16421b2b"],
  "a bar chart's columns": ["7abb7b95d6d172a1", "6522b4533cd6e2e0"],
  "a donut chart": ["fba49ebc9cad6090", "779c912ca853bba7"],
  "a line chart": ["cee8c4bc89c99803", "090adce48514f5fa"]
};

describe.each(Object.keys(charts))("%s", (name) => {
  it("lays out byte for byte as main did where there's no spacing, and where the browser counts it", async () => {
    const lib = await browser(true);
    const none = hash(drawn(lib, name));
    spacing = 1;
    const counted = hash(drawn(lib, name));
    expect([none, counted]).toEqual(PINNED[name]);
    expect(counted).not.toBe(none);
  });

  it("where the browser's length leaves spacing out, lays out as main did with none, and with spacing makes room for it", async () => {
    const lib = await browser(false);
    // No spacing: the same lengths, so the same chart.
    expect(hash(drawn(lib, name))).toBe(PINNED[name]![0]);
    spacing = 1;
    const spacedOut = drawn(lib, name);
    expect(hash(spacedOut)).not.toBe(PINNED[name]![0]);
    // Not the counting browser's layout to the byte: this one draws no spacing after a text's last character.
    expect(hash(spacedOut)).not.toBe(PINNED[name]![1]);
  });
});

describe("a bar chart's room for its names", () => {
  /** Where the names end, anchored by their ends: the right edge of their column, which is as wide as the longest of them. */
  const plotLeft = (markup: string): number => Number(/class="ec-label"[^>]*? x="(-?[\d.]+)"/.exec(markup)?.[1]);
  const name = "a bar chart's bars";
  /** The longest name, "Region 1 North": 14 characters, 2 spaces, at 12.5 px. */
  const between = 13 * 0.12 * 12.5 + 2 * 0.16 * 12.5;

  it("grows by the spacing between the longest name's characters, in either browser", async () => {
    const counting = await browser(true);
    const none = plotLeft(drawn(counting, name));
    expect(none).toBeGreaterThan(0);
    spacing = 1;
    const counted = plotLeft(drawn(counting, name));
    const leaving = await browser(false);
    const added = plotLeft(drawn(leaving, name));
    spacing = 0;
    // With no spacing the two browsers agree.
    expect(plotLeft(drawn(leaving, name))).toBe(none);
    // Where the length leaves spacing out, the measure adds what the browser draws: between the characters.
    expect(added - none).toBeCloseTo(between, 6);
    // Where it counts it, the length has the spacing after the last character too.
    expect(counted - none).toBeCloseTo(between + 0.12 * 12.5, 6);
  });
});

describe("textMeasure", () => {
  const SVG = "http://www.w3.org/2000/svg";
  /** A fresh measure in an <svg> on the page, in a browser of one kind, and how many times it was asked what kind. */
  async function measureIn(counting: boolean) {
    counts = counting;
    standIn();
    vi.resetModules();
    const { textMeasure } = await import("./render/text");
    const svg = document.body.appendChild(document.createElementNS(SVG, "svg"));
    const ends = vi.spyOn(SVGElement.prototype as unknown as { getEndPositionOfChar(index: number): unknown }, "getEndPositionOfChar");
    return { measure: textMeasure(svg), svg, asked: () => ends.mock.calls.length, textMeasure };
  }

  it("adds nothing where there's no spacing, in either browser", async () => {
    for (const counting of [true, false]) {
      const { measure } = await measureIn(counting);
      expect(measure("Ag 0", "ec-label", 12.5)).toBe(4 * 0.5 * 12.5);
    }
  });

  it("adds nothing where the browser's length counts spacing", async () => {
    const { measure } = await measureIn(true);
    spacing = 1;
    // Chromium's and Firefox's: four characters' spacing and a space's, already in the length.
    expect(measure("Ag 0", "ec-label", 12.5)).toBeCloseTo(25 + 4 * 1.5 + 2, 9);
  });

  it("adds the spacing between characters, and a space's, where the length leaves them out: the text's own box", async () => {
    const { measure } = await measureIn(false);
    spacing = 1;
    // WebKit's box for "Ag 0" at 12.5 px: 24.5 px of glyphs there, 31 px with spacing; here 25 and 31.5.
    expect(measure("Ag 0", "ec-label", 12.5)).toBeCloseTo(25 + 3 * 1.5 + 2, 9);
    // One character has none between, and a no-break space is a space.
    expect(measure("8", "ec-label", 12.5)).toBe(6.25);
    expect(measure("12 km", "ec-label", 12.5)).toBeCloseTo(5 * 6.25 + 4 * 1.5 + 2, 9);
    // At the class's own size: a tick's 11 px.
    expect(measure("10 %", "ec-tick", 11)).toBeCloseTo(4 * 5.5 + 3 * 0.12 * 11 + 0.16 * 11, 9);
    expect(measure("", "ec-label", 12.5)).toBe(0);
  });

  it("finds out what the browser does once a document, however many texts and measures there are", async () => {
    const { measure, svg, asked, textMeasure } = await measureIn(false);
    spacing = 1;
    measure("North", "ec-label", 12.5);
    expect(asked()).toBe(1);
    measure("South", "ec-label", 12.5);
    measure.clear();
    measure("North", "ec-label", 12.5);
    textMeasure(svg)("West", "ec-label", 12.5);
    expect(asked()).toBe(1);
    // And it leaves nothing behind in the <svg>.
    expect(svg.childElementCount).toBe(0);
  });

  it("goes by the spacing the browser computes for its test text, if a viewer's stylesheet overrides the test's own", async () => {
    const { measure } = await measureIn(false);
    spacing = 1;
    // The viewer's rule wins over the inline one: the test text has their 1.5 px, not its 8.
    vi.spyOn(CSSStyleDeclaration.prototype, "setProperty").mockImplementation(() => {});
    expect(measure("Ag 0", "ec-label", 12.5)).toBeCloseTo(25 + 3 * 1.5 + 2, 9);
  });

  it("estimates as before where there's no layout, and asks nothing", async () => {
    const { textMeasure, asked } = await measureIn(false);
    const loose = document.createElementNS(SVG, "svg");
    expect(textMeasure(loose)("Ag 0", "ec-label", 12.5)).toBe(4 * 12.5 * 0.6);
    expect(asked()).toBe(0);
  });

  it("measures as before in a browser with no getEndPositionOfChar", async () => {
    const { measure } = await measureIn(false);
    delete (SVGElement.prototype as unknown as Record<string, unknown>).getEndPositionOfChar;
    spacing = 1;
    expect(measure("Ag 0", "ec-label", 12.5)).toBe(25);
  });
});
