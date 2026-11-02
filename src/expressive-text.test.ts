// An attachment measures its overlay's text again when it changes size after it drew (M14 step 2), as
// our charts do (src/charts/text-size.test.ts): spacing added by a viewer's stylesheet, say, or web
// fonts loading. jsdom has no layout, so text widths come from a stand-in for getComputedTextLength,
// and the probe's width from a stand-in ResizeObserver. The host draws three columns 60 px apart,
// each named by `label` above it, so names that grow wide enough meet, and the last goes up past the
// one before, taking its `delta` with it. This test brings charts and effects together, so it lives
// beside src/index.ts, the only module allowed to.

import { View, parse } from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import { expressive, fromVegaView, type Attachment, type ChartEnv, type ExpressiveOptions } from "./charts";
import { createMotion, manualClock, type GeometryEffect } from "./core";
import { createRegistry, type PresetFactory } from "./core/registry";
import { delta, label, parallel } from "./effects";

interface Player {
  name: string;
  goals: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 10 },
  { name: "Tanaka", goals: 10 },
  { name: "Lindqvist", goals: 10 }
];

const SVG = "http://www.w3.org/2000/svg";

/** How much of WCAG 1.4.12's spacing is on, 0 to 1: at 1, 0.12 em more after each character, and 0.16 em more after each word. */
let spacing = 0;

/** A text's width as a browser would give it: half an em a character, and the spacing, at the overlay's 12.5 px. */
function textLength(this: SVGElement): number {
  const text = this.textContent ?? "";
  const spaces = text.split(" ").length - 1;
  return 12.5 * (text.length * (0.5 + 0.12 * spacing) + spaces * 0.16 * spacing);
}

/** A ResizeObserver that reports only when told: `tell` gives each connected observer's text its width. */
function stubResizeObserver() {
  const observers: { callback: ResizeObserverCallback; targets: Element[]; disconnected: boolean }[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private readonly entry: (typeof observers)[number];
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, targets: [], disconnected: false };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.targets.push(target);
      }
      unobserve() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    }
  );
  const tell = (width: number) => {
    for (const { callback, targets, disconnected } of observers) {
      if (disconnected) continue;
      for (const target of targets.filter((element) => element.localName === "text")) callback([{ target, contentRect: { width } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    }
  };
  return { observers, tell };
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  parent.appendChild(element);
  return element;
}

/** What a D3 page draws: a margin group and a 30 px column per player, 60 px apart and all 100 px tall, each bound to its row. */
function host() {
  const svg = el("svg", { width: 220, height: 180, viewBox: "0 0 220 180" }, document.body);
  const plot = el("g", { transform: "translate(20,60)" }, svg);
  const rects = players.map((player, i) => {
    const rect = el("rect", { x: i * 60, y: 0, width: 30, height: 100, fill: "#2a78d6" }, plot);
    Object.assign(rect, { __data__: player });
    return rect;
  });
  return { svg, rects };
}

/** Each mark's name above it, and Lindqvist's change above that, with a log of each time a mark's name is told it moved. */
function effects() {
  const log: string[] = [];
  const told: GeometryEffect = {
    kind: "geometry",
    run(_mark, ctx) {
      ctx.onChange((moved) => log.push(moved.key));
      return Promise.resolve();
    },
    end() {},
    clear() {}
  };
  const on = { decorate: parallel(label<Player>((data) => data.datum.name), told), update: delta<Player>({ value: (data) => data.datum.goals }) };
  return { log, on };
}

function env() {
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const clock = manualClock();
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  return { env, clock };
}

/**
 * Attaches to a fresh host and draws at rest, then Lindqvist scores twice, at rest too unless `scored`
 * is "playing". `original` is the host's markup before it was attached to.
 */
function setup(more: Partial<ExpressiveOptions<Player>> = {}, scored: "rest" | "playing" = "rest") {
  const { svg, rects } = host();
  const original = svg.outerHTML;
  const { env: chartEnv, clock } = env();
  const { log, on } = effects();
  const fx = expressive<Player>(rects, { key: (d) => d.name, value: (d) => d.goals, on, ...more }, chartEnv);
  rest(clock);
  Object.assign(rects[2]!, { __data__: { ...players[2]!, goals: 12 } });
  fx.refresh();
  if (scored === "rest") rest(clock);
  log.length = 0;
  return { svg, rects, original, clock, fx, log };
}

/** Plays the clock until nothing waits for a frame. */
function rest(clock: ReturnType<typeof manualClock>): void {
  for (let i = 0; i < 1000 && !clock.idle; i++) clock.advance(16);
}

/** The probe: the only text in the <svg> with no class, its own child. */
const probeOf = (svg: SVGSVGElement): Element | null => svg.querySelector(":scope > text:not([class])");

/** What the <svg> shows, without its probe, and with the focus ring's mask named as one attachment alone would name it. */
function drawn(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  probeOf(copy)?.remove();
  return copy.outerHTML.replace(/ec-focus-mask-\d+/g, "ec-focus-mask");
}

/** Each run's text, by its mark: where it is and how strong. */
function texts(svg: Element): Record<string, { text: string; x: number; y: number; opacity: string | null }[]> {
  const out: Record<string, { text: string; x: number; y: number; opacity: string | null }[]> = {};
  for (const text of Array.from(svg.querySelectorAll(".ec-overlay .ec-run text"))) {
    const key = text.closest(".ec-run")!.getAttribute("data-key")!;
    (out[key] ??= []).push({ text: text.textContent ?? "", x: Number(text.getAttribute("x")), y: Number(text.getAttribute("y")), opacity: text.getAttribute("opacity") });
  }
  return out;
}

/** Spies on every event the attachment has. */
function events(fx: Attachment<Player>) {
  const heard = vi.fn();
  for (const type of ["enter", "update", "exit", "hover", "leave"] as const) fx.on(type, () => heard(type));
  return heard;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  spacing = 0;
  Object.defineProperty(SVGElement.prototype, "getComputedTextLength", { configurable: true, value: textLength });
});

afterEach(() => {
  delete (SVGElement.prototype as { getComputedTextLength?: unknown }).getComputedTextLength;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("an attachment's text that changes size", () => {
  it("places its labels and deltas again on the next frame, as the same text draws from the start, with no event", async () => {
    const { tell } = stubResizeObserver();
    const { clock, svg, fx, log } = setup();
    const heard = events(fx);
    tell(150);
    clock.advance(16);
    const before = drawn(svg);
    const was = texts(svg);
    expect(was.Lindqvist!.map((t) => t.text)).toEqual(["Lindqvist", "+2"]);
    // At rest, Lindqvist's name stands as high as Tanaka's.
    expect(was.Lindqvist![0]!.y).toBe(was.Tanaka![0]!.y);
    spacing = 1;
    tell(180);
    expect(drawn(svg)).toBe(before);
    clock.advance(16);
    await settle();
    expect(drawn(svg)).not.toBe(before);
    expect(log).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
    // The names grew until Lindqvist's meets Tanaka's, so it goes up past it, and its change with it.
    const now = texts(svg);
    expect(now.Tanaka).toEqual(was.Tanaka);
    expect(now.Lindqvist![0]!.y).toBeLessThan(was.Lindqvist![0]!.y);
    expect(now.Lindqvist![1]!.y).toBeLessThan(was.Lindqvist![1]!.y);
    expect(heard).not.toHaveBeenCalled();
    expect(drawn(svg)).toBe(drawn(setup().svg));
  });

  it("does nothing for a change of less than half a px", async () => {
    const { tell } = stubResizeObserver();
    const { clock, svg, log } = setup();
    expect(probeOf(svg)).not.toBeNull();
    tell(150);
    const before = drawn(svg);
    spacing = 1;
    tell(150.4);
    rest(clock);
    await settle();
    expect(drawn(svg)).toBe(before);
    expect(log).toEqual([]);
  });

  it("places its text once for two changes in a frame, as the second left it", async () => {
    const { tell } = stubResizeObserver();
    const { clock, svg, log } = setup();
    tell(150);
    spacing = 0.5;
    tell(165);
    spacing = 1;
    tell(180);
    clock.advance(16);
    rest(clock);
    await settle();
    expect(log).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
    expect(drawn(svg)).toBe(drawn(setup().svg));
  });

  it("ignores its probe with no width, as in display: none", async () => {
    const { tell } = stubResizeObserver();
    const { clock, svg, log } = setup();
    expect(probeOf(svg)).not.toBeNull();
    tell(150);
    const before = drawn(svg);
    spacing = 1;
    tell(0);
    tell(150);
    rest(clock);
    await settle();
    expect(drawn(svg)).toBe(before);
    expect(log).toEqual([]);
  });

  it("places its text again at once when web fonts load, and stops listening on destroy()", async () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
    try {
      stubResizeObserver();
      const { svg, fx, log } = setup();
      const heard = events(fx);
      const before = drawn(svg);
      spacing = 1;
      fonts.dispatchEvent(new Event("loadingdone"));
      expect(drawn(svg)).not.toBe(before);
      expect(log).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
      await settle();
      expect(heard).not.toHaveBeenCalled();
      expect(drawn(svg)).toBe(drawn(setup().svg));
      const removed = vi.spyOn(fonts, "removeEventListener");
      fx.destroy();
      expect(removed).toHaveBeenCalledWith("loadingdone", expect.any(Function));
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });

  it("goes on with a run in flight from where it is, placed again", async () => {
    // Without a probe, the same steps and no change of size.
    const twin = setup({}, "playing");
    const { tell } = stubResizeObserver();
    const { clock, svg, fx } = setup({}, "playing");
    const heard = events(fx);
    tell(150);
    clock.advance(100);
    twin.clock.advance(100);
    const was = texts(svg).Lindqvist![1]!;
    expect(Number(was.opacity)).toBeGreaterThan(0);
    expect(Number(was.opacity)).toBeLessThan(1);
    spacing = 1;
    tell(180);
    clock.advance(16);
    twin.clock.advance(16);
    await settle();
    const now = texts(svg).Lindqvist![1]!;
    const unmoved = texts(twin.svg).Lindqvist![1]!;
    // As far through its rise as without the change, and higher: placed again, not started again.
    expect(now.opacity).toBe(unmoved.opacity);
    expect(Number(now.opacity)).toBeGreaterThan(Number(was.opacity));
    expect(now.y).toBeLessThan(unmoved.y);
    rest(clock);
    await settle();
    expect(clock.idle).toBe(true);
    expect(heard).not.toHaveBeenCalled();
    expect(drawn(svg)).toBe(drawn(setup().svg));
  });

  it("draws byte for byte as main did without ResizeObserver, and as that with one until its text changes size", async () => {
    const frames = (fx: Attachment<Player>, svg: SVGSVGElement, clock: ReturnType<typeof manualClock>, rects: readonly SVGRectElement[]): string[] => {
      const out = [rounded(svg.outerHTML)];
      Object.assign(rects[0]!, { __data__: { ...players[0]!, goals: 11 } });
      fx.refresh();
      for (let ms = 0; ms < 1200; ms += 50) {
        clock.advance(50);
        out.push(rounded(svg.outerHTML));
      }
      return out;
    };
    const without = setup();
    expect(probeOf(without.svg)).toBeNull();
    const before = frames(without.fx, without.svg, without.clock, without.rects);
    expect(hash(before.join("\n"))).toBe(MAIN);

    const { tell } = stubResizeObserver();
    const { svg, clock, fx, rects } = setup();
    tell(150);
    tell(150.4);
    rest(clock);
    await settle();
    expect(drawn(svg)).toBe(drawn(setup().svg));
    probeOf(svg)?.remove();
    expect(frames(fx, svg, clock, rects)).toEqual(before);
  });

  it("keeps a probe beside its overlay, hidden from sight, the pointer, focus and assistive tech, which leaves its size as it was", () => {
    const without = setup({ keyboard: true });
    stubResizeObserver();
    const { svg } = setup({ keyboard: true });
    const probe = probeOf(svg) as SVGTextElement;
    expect(probe.outerHTML).toBe('<text font-size="11" visibility="hidden" pointer-events="none" aria-hidden="true">Hamburgefonstiv 0123456789</text>');
    probe.focus();
    expect(document.activeElement).not.toBe(probe);
    // The root's child, just before the overlay, which stays its last: what finds the overlay's text doesn't find it.
    const overlay = svg.querySelector(":scope > .ec-overlay");
    expect(svg.lastElementChild).toBe(overlay);
    expect(probe.nextElementSibling).toBe(overlay);
    expect(Array.from(svg.querySelectorAll(".ec-overlay text"))).not.toContain(probe);
    expect(svg.querySelectorAll("text:not([class])")).toHaveLength(1);
    expect(svg.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    for (const name of ["width", "height", "viewBox"]) expect(svg.getAttribute(name)).toBe(without.svg.getAttribute(name));
  });

  it("moves its probe to the new <svg> when refresh() reads marks in one, leaving the old one as it was", async () => {
    const { observers, tell } = stubResizeObserver();
    const { svg, original, clock, fx } = setup();
    const next = host();
    fx.refresh(next.rects);
    rest(clock);
    expect(probeOf(svg)).toBeNull();
    expect(svg.outerHTML).toBe(original);
    expect(observers.map((observer) => observer.disconnected)).toEqual([true, false]);
    const probe = probeOf(next.svg)!;
    expect(probe.nextElementSibling).toBe(next.svg.lastElementChild);
    tell(150);
    const was = texts(next.svg);
    spacing = 1;
    tell(180);
    clock.advance(16);
    await settle();
    expect(texts(next.svg).Lindqvist![0]!.y).toBeLessThan(was.Lindqvist![0]!.y);
  });

  it("takes its probe out on destroy(), leaving the host's <svg> as it found it, with no frame on its way", () => {
    const { observers, tell } = stubResizeObserver();
    const { svg, original, clock, fx } = setup();
    expect(probeOf(svg)).not.toBeNull();
    tell(150);
    spacing = 1;
    tell(180);
    fx.destroy();
    expect(probeOf(svg)).toBeNull();
    expect(svg.outerHTML).toBe(original);
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
    expect(clock.idle).toBe(true);
  });

  it("does the same on a fromVegaView() attachment", async () => {
    // Three bands 60 px apart.
    const spec: TopLevelSpec = {
      width: 180,
      height: 100,
      data: { values: players },
      mark: "bar",
      encoding: {
        x: { field: "name", type: "nominal", sort: null, axis: null },
        y: { field: "goals", type: "quantitative", axis: null, scale: { domain: [0, 12] } }
      }
    };
    const attach = async () => {
      const container = document.body.appendChild(document.createElement("div"));
      const view = new View(parse(compile(spec).spec), { renderer: "svg", container });
      await view.runAsync();
      const svg = container.querySelector("svg")!;
      const { env: chartEnv, clock } = env();
      const { log, on } = effects();
      const fx = fromVegaView<Player>(view, { key: (d) => d.name, on: { decorate: on.decorate } }, chartEnv);
      rest(clock);
      log.length = 0;
      return { view, svg, clock, fx, log };
    };
    const overlay = (svg: SVGSVGElement): string => svg.querySelector(":scope > .ec-overlay")!.outerHTML.replace(/ec-focus-mask-\d+/g, "ec-focus-mask");
    const { observers, tell } = stubResizeObserver();
    const { view, svg, clock, fx, log } = await attach();
    const heard = vi.fn();
    for (const type of ["enter", "update", "exit", "hover", "leave"] as const) fx.on(type, () => heard(type));
    const probe = probeOf(svg)!;
    expect(probe.nextElementSibling).toBe(svg.lastElementChild);
    tell(150);
    clock.advance(16);
    const before = overlay(svg);
    spacing = 1;
    tell(180);
    clock.advance(16);
    await settle();
    expect(overlay(svg)).not.toBe(before);
    expect(log).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
    expect(heard).not.toHaveBeenCalled();
    expect(overlay(svg)).toBe(overlay((await attach()).svg));
    // Vega's renders keep it, as they keep the overlay.
    await view.width(200).runAsync();
    rest(clock);
    expect(probeOf(svg)).toBe(probe);
    expect(probe.nextElementSibling).toBe(svg.lastElementChild);
    fx.destroy();
    expect(probeOf(svg)).toBeNull();
    expect(observers[0]!.disconnected).toBe(true);
    view.finalize();
  });
});

/** Markup with its numbers to 0.001, so the last bits Node versions differ in don't count. */
function rounded(markup: string): string {
  return markup.replace(/ec-focus-mask-\d+/g, "ec-focus-mask").replace(/-?\d+\.\d+(e-?\d+)?/g, (n) => String(Math.round(Number(n) * 1000) / 1000));
}

/** The digest main (72efd8d) gave, with this file's frames() run there. */
const MAIN = "b423c442e8ece0b8";

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
