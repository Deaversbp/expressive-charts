// The layouts page's five cards (demo/layouts.html, M15 step 5 and M16 step 5): each card's views built
// with the page's own D3 modules and demo/layouts-effects.ts, in a chart switch with the real morph(), on
// a clock the test controls. These pin what the page promises: the bars' segments paired by
// `series@player` in every layout, and a jump of two staged through Stacked with one announcement; the
// areas' bands keeping each week's x on every frame; the radar's circles paired with their bars while the
// outlines fade with their view; the treemap's tiles paired with their bars side for side; the guides
// the page names kept on every frame where both views draw them the same (the bars' axis, the areas'
// weeks, the dumbbell's axis), and the bars' 100% axis fading; the dumbbell's three attachments, one
// view, their dots paired with their bars and their lines fading, and their link kept; each card's
// labels moving and swapping; focus following its key; and a redraw mid-switch kept hidden. It brings
// charts and an effect together, so it lives beside src/index.ts, the only module allowed to.

import type { Dot, Row } from "../demo/d3-dumbbell";
import { areasCard, barsCard, dumbbellCard, halves, players, radarCard, scorers, shotForm, treemapCard, type Attach, type LayoutCard } from "../demo/layouts-effects";
import { chartSwitch, expressive, type ChartEnv, type ChartSwitch, type HostView } from "./charts";
import { createMotion, manualClock, type MotionMode } from "./core";
import { formatPath, parsePath, transformPath } from "./core/geometry/path";
import { flush } from "./core/testing";
import { morph } from "./effects";
import { iconRegistry, presetRegistry } from "./registries";

type Env = ChartEnv & { readonly clock: ReturnType<typeof manualClock> };

function env(mode: MotionMode = "presentation", reduced = false): Env {
  const motion = createMotion({ mode, reducedMotion: { matches: reduced, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

/** expressive() as the page calls it, on the test's clock. */
const attachOn =
  (e: ChartEnv): Attach =>
  (source, options) =>
    expressive(source, options, e);

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A card's views in a switch, as the page builds it, in `initial`. jsdom has no layout, so each D3
 * module draws at its least, 280 px, and each view's <svg> is at the overlay's origin.
 */
function setup<V extends string>(make: (attach: Attach) => LayoutCard<V>, initial: NoInfer<V>, mode: MotionMode = "presentation", reduced = false) {
  const e = env(mode, reduced);
  const target = document.body.appendChild(document.createElement("div"));
  const card = make(attachOn(e));
  const switcher: ChartSwitch<LayoutCard<V>["views"]> = chartSwitch(target, { views: card.views, initial, transition: morph(), announce: true }, e);
  const wrapper = target.querySelector(":scope > .ec-switch") as HTMLDivElement;
  const container = (view: V): HTMLDivElement => wrapper.querySelector(`:scope > .ec-switch-view[data-view="${view}"]`) as HTMLDivElement;
  const svg = (view: V): SVGSVGElement => container(view).querySelector("svg")!;
  const overlay = wrapper.querySelector(":scope > .ec-switch-overlay") as SVGSVGElement;
  /** Every live region's words as the clock runs, each time they change. */
  const said: string[] = [];
  const regions = (): Element[] => [...target.querySelectorAll('[role="status"]')];
  const listen = (): void => {
    const now = regions()
      .map((region) => region.textContent?.trim() ?? "")
      .join("|");
    if (now !== said[said.length - 1]) said.push(now);
  };
  /** Runs the clock on a frame at a time, letting each frame's promises settle, and calls `each` after every frame. */
  const run = async (ms: number, each?: () => void): Promise<void> => {
    for (let t = 0; t < ms; t += 16) {
      e.clock.advance(16);
      await flush();
      listen();
      each?.();
    }
  };
  listen();
  return { e, card, switcher, container, svg, overlay, run, said: () => said.filter(Boolean) };
}

/** Each pair's run as drawn now, by key: its path data. */
function runs(overlay: SVGSVGElement): Map<string, string> {
  return new Map(Array.from(overlay.querySelectorAll<SVGGElement>(".ec-switch-runs > .ec-run"), (group) => [group.getAttribute("data-key")!, group.querySelector("path")!.getAttribute("d")!]));
}

/** The marks the overlay fades because they have no partner. */
const fades = (overlay: SVGSVGElement): string[] => Array.from(overlay.querySelectorAll(".ec-switch-fades > .ec-switch-fade"), (group) => group.getAttribute("data-key")!);

/** The overlay's label copies: each one's text, place, whether it's drawn and its opacity. */
function copies(overlay: SVGSVGElement): { readonly text: string; readonly x: number; readonly y: number; readonly shown: boolean; readonly opacity: number }[] {
  return Array.from(overlay.querySelectorAll<SVGTextElement>(".ec-switch-labels > text"), (element) => ({
    text: element.textContent ?? "",
    x: round(Number(element.getAttribute("x"))),
    y: round(Number(element.getAttribute("y"))),
    shown: element.getAttribute("visibility") !== "hidden",
    opacity: element.getAttribute("opacity") === null ? 1 : Number(element.getAttribute("opacity"))
  }));
}
/** The copies a viewer sees now: drawn, and not faded all the way. */
const seen = (overlay: SVGSVGElement): string[] =>
  copies(overlay)
    .filter((copy) => copy.shown && copy.opacity > 0)
    .map((copy) => copy.text)
    .sort();

const round = (value: number): number => Math.round(value * 1000) / 1000;
const pointer = (type: string, target: Element): boolean => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
const hidden = (element: Element): boolean => (element as SVGElement).style.getPropertyValue("visibility") === "hidden";
/** A D3 element's row. */
const rowOf = <T>(element: Element): T => (element as unknown as { __data__: T }).__data__;

/** The x, y pairs of a path's data, in order. */
function points(d: string): Point[] {
  const values = (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
  return Array.from({ length: values.length / 2 }, (_, i) => ({ x: values[2 * i]!, y: values[2 * i + 1]! }));
}

/** The translation of a <g>'s transform: where its marks sit in their <svg>. */
function offset(element: Element): Point {
  const [x = 0, y = 0] = (/translate\(([-\d.e]+),\s*([-\d.e]+)\)/.exec(element.getAttribute("transform") ?? "") ?? []).slice(1).map(Number);
  return { x, y };
}

/** A mark's outline as the overlay draws it at rest: in its <svg>, which jsdom puts at the overlay's origin. */
const placed = (d: string, by: Point): string => formatPath(transformPath(parsePath(d), [1, 0, 0, 1, by.x, by.y]));

/** Each guide's copies in the switch's overlay, by key: the old view's, then the new view's, each with its opacity and its drawing. */
function guides(overlay: SVGSVGElement): Map<string, { readonly opacity: string; readonly drawing: string; readonly transform: string | null }[]> {
  const byKey = new Map<string, { readonly opacity: string; readonly drawing: string; readonly transform: string | null }[]>();
  for (const group of overlay.querySelectorAll<SVGGElement>(":scope > .ec-switch-guides > .ec-switch-guide")) {
    const key = group.getAttribute("data-key")!;
    byKey.set(key, [...(byKey.get(key) ?? []), { opacity: group.getAttribute("opacity") ?? "", drawing: group.innerHTML, transform: group.getAttribute("transform") }]);
  }
  return byKey;
}

/**
 * Checks that each of `keys` is kept on this frame: its two copies, the old view's and the new view's,
 * drawn the same in the same place, one at full strength and the other not drawn.
 */
function expectKept(overlay: SVGSVGElement, keys: readonly string[], when: string): void {
  const now = guides(overlay);
  expect([...now.keys()].sort(), when).toEqual([...keys].sort());
  for (const key of keys) {
    const [a, b] = now.get(key)!;
    expect([a!.opacity, b!.opacity].sort(), `${key}, ${when}`).toEqual(["0", "1"]);
    expect(b!.drawing, `${key}, ${when}`).toBe(a!.drawing);
    expect(b!.transform, `${key}, ${when}`).toBe(a!.transform);
  }
}

/** The keys of a view's marks, sorted. */
const keysOf = <V extends string>(switcher: ChartSwitch<LayoutCard<V>["views"]>, view: NoInfer<V>): string[] =>
  switcher
    .chart(view)
    .marks()
    .map((mark) => mark.key)
    .sort();

// ── The bars ─────────────────────────────────────────────────────────────────

const SEGMENTS = players.flatMap((p) => [`goals@${p.name}`, `assists@${p.name}`]).sort();

describe("the bars: side by side, stacked and at 100%", () => {
  it("pairs each segment with itself by series and player, from every layout to every other, with nothing left to fade", async () => {
    const { switcher, overlay, run } = setup(barsCard, "side");
    for (const view of ["side", "stacked", "share"] as const) expect(keysOf(switcher, view)).toEqual(SEGMENTS);
    for (const to of ["stacked", "share", "side", "share", "stacked", "side"] as const) {
      void switcher.show(to);
      expect([...runs(overlay).keys()].sort(), `to ${to}`).toEqual(SEGMENTS);
      expect(fades(overlay), `to ${to}`).toEqual([]);
      await run(1000);
      expect(switcher.current).toBe(to);
      expect(runs(overlay).size).toBe(0);
    }
  });

  it("stages a jump of two through Stacked in Presentation: two switches of 950 ms, the first ending on Stacked's own bars, announced once", async () => {
    const { switcher, overlay, svg, run, said } = setup(barsCard, "side");
    const stacked = switcher.chart("stacked");
    const at = offset(stacked.space!);
    const own = new Map(stacked.marks().map((mark) => [mark.key, placed(mark.outline.d, at)]));
    void switcher.show("share", { via: "stacked" });
    expect(switcher.current).toBe("share");
    // 944 ms: the last frame of the first leg, nearly Stacked's bars.
    await run(944);
    expect(runs(overlay).size).toBe(16);
    // 960 ms: the first has landed, and the second starts from Stacked's own bars.
    await run(16);
    expect(runs(overlay)).toEqual(own);
    expect(svg("stacked").classList.contains("ec-morphing")).toBe(true);
    expect(said()).toEqual([]);
    await run(944);
    expect(runs(overlay).size).toBe(16);
    await run(16);
    expect(runs(overlay).size).toBe(0);
    expect(said()).toEqual(["Goals and assists by player on D3 bars, as shares of 100%"]);
    // And back the same way, through Stacked again, announced once more.
    void switcher.show("side", { via: "stacked" });
    await run(1920);
    expect(switcher.current).toBe("side");
    expect(said()).toEqual(["Goals and assists by player on D3 bars, as shares of 100%", "Goals and assists by player on D3 bars, side by side"]);
  });

  it("goes straight there in Analysis and Off, announced once", async () => {
    for (const mode of ["analysis", "off"] as const) {
      const { switcher, overlay, run, said } = setup(barsCard, "side", mode);
      void switcher.show("share", { via: "stacked" });
      if (mode === "analysis") {
        // One switch of 200 ms, from side by side straight to 100%: no stop at Stacked.
        expect(runs(overlay).size).toBe(16);
        await run(192);
        expect(runs(overlay).size).toBe(16);
        await run(16);
      }
      expect(runs(overlay).size).toBe(0);
      expect(switcher.current).toBe("share");
      await run(32);
      expect(said()).toEqual(["Goals and assists by player on D3 bars, as shares of 100%"]);
      document.body.replaceChildren();
    }
  });

  it("keeps each player's name in place and moves each number with its segment, a count swapping to its share half way", async () => {
    const { switcher, overlay, run } = setup(barsCard, "stacked");
    void switcher.show("share");
    const names = players.map((p) => p.name);
    // At the start: each name, and each count stacked draws: at 280 px a segment of 1 has no room for its number.
    const counts = players.flatMap((p) => [p.goals, p.assists]).filter((value) => value > 1);
    expect(seen(overlay)).toEqual([...names, ...counts.map(String)].sort());
    const start = new Map(copies(overlay).filter((copy) => copy.shown).map((copy) => [copy.text, copy]));
    await run(400);
    // Before half way: the counts on their way, the names where they were.
    for (const name of names) expect(copies(overlay).find((copy) => copy.text === name && copy.shown)).toMatchObject({ x: start.get(name)!.x, y: start.get(name)!.y });
    await run(160);
    // After it: the shares, "80%" and "20%" for Okafor's 16 and 4.
    expect(seen(overlay)).toEqual(expect.arrayContaining(["80%", "20%", "Okafor"]));
    expect(seen(overlay)).not.toContain("16");
    await run(500);
    expect(switcher.current).toBe("share");
  });

  it("follows focus on a segment by its key, through Stacked to 100% and back", async () => {
    const { switcher, svg, run } = setup(barsCard, "side");
    const segment = (view: "side" | "stacked" | "share", key: string): SVGRectElement =>
      [...svg(view).querySelectorAll<SVGRectElement>("rect.segment")].find((rect) => {
        const d = rowOf<{ series: string; player: string }>(rect);
        return `${d.series}@${d.player}` === key;
      })!;
    switcher.chart("side").focus("assists@Tanaka");
    expect(document.activeElement).toBe(segment("side", "assists@Tanaka"));
    void switcher.show("share", { via: "stacked" });
    await run(2000);
    expect(document.activeElement).toBe(segment("share", "assists@Tanaka"));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Tanaka: 10 assists, 62% of 16 goals and assists");
    void switcher.show("side", { via: "stacked" });
    await run(2000);
    expect(document.activeElement).toBe(segment("side", "assists@Tanaka"));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Tanaka: 10 assists");
  });

  it("lands at once in Off and with reduced motion, focus following", async () => {
    for (const [mode, reduced] of [
      ["off", false],
      ["presentation", true]
    ] as const) {
      const { switcher, svg, overlay, run, said } = setup(barsCard, "side", mode, reduced);
      switcher.chart("side").focus("goals@Novak");
      void switcher.show("share", { via: "stacked" });
      expect(runs(overlay).size).toBe(0);
      await run(16);
      expect(rowOf<{ player: string; series: string }>(document.activeElement!)).toMatchObject({ player: "Novak", series: "goals" });
      expect(svg("share").contains(document.activeElement)).toBe(true);
      expect(said()).toEqual(["Goals and assists by player on D3 bars, as shares of 100%"]);
      document.body.replaceChildren();
    }
  });

  it("keeps a redraw mid-switch hidden until the switch lands, and the switch plays on", async () => {
    const { switcher, card, svg, overlay, run } = setup(barsCard, "side");
    void switcher.show("stacked");
    await run(304);
    const before = runs(overlay);
    card.redraw();
    for (const view of ["side", "stacked"] as const) {
      for (const element of svg(view).querySelectorAll("rect.segment, text.host-label, text.host-value")) expect(hidden(element), `${view}: ${element.outerHTML}`).toBe(true);
    }
    await run(16);
    expect([...runs(overlay).keys()]).toEqual([...before.keys()]);
    await run(700);
    expect(switcher.current).toBe("stacked");
    for (const element of svg("stacked").querySelectorAll("rect.segment, text.host-label, text.host-value")) expect(hidden(element)).toBe(false);
  });

  it("keeps the axis, a guide keyed by its scale, at full strength where it is on every frame between side by side and stacked, both ways", async () => {
    const { switcher, svg, overlay, run } = setup(barsCard, "side");
    for (const [from, to] of [
      ["side", "stacked"],
      ["stacked", "side"]
    ] as const) {
      void switcher.show(to);
      // Its grid and ticks, 0 to 20 in both: copied into the overlay, and the host's own hidden.
      expect([...overlay.querySelectorAll(".ec-switch-guide text.tick")].map((tick) => tick.textContent)).toEqual(["0", "5", "10", "15", "20", "0", "5", "10", "15", "20"]);
      for (const view of [from, to]) expect(hidden(svg(view).querySelector("g.bars-axis")!), view).toBe(true);
      expectKept(overlay, ["axis@count"], `${from} to ${to} at the start`);
      let frame = 0;
      await run(944, () => expectKept(overlay, ["axis@count"], `${from} to ${to}, frame ${++frame}`));
      await run(16);
      expect(switcher.current).toBe(to);
      expect(overlay.querySelector(".ec-switch-guides")).toBeNull();
      for (const view of [from, to]) expect(hidden(svg(view).querySelector("g.bars-axis")!), view).toBe(false);
    }
  });

  it("fades the axis at 100%, on another scale, as each view's other parts fade: neither drawn between 40% and half way", async () => {
    const { switcher, container, overlay, run } = setup(barsCard, "stacked");
    void switcher.show("share");
    let gap = 0;
    await run(944, () => {
      const now = guides(overlay);
      expect([...now.keys()].sort()).toEqual(["axis@count", "axis@share"]);
      const [from, to] = [now.get("axis@count")![0]!.opacity, now.get("axis@share")![0]!.opacity];
      expect(from).toBe(container("stacked").style.opacity);
      expect(to).toBe(container("share").style.opacity);
      if (from === "0" && to === "0") gap++;
    });
    expect(gap).toBeGreaterThan(0);
    await run(16);
    expect(switcher.current).toBe("share");
  });
});

// ── The areas ────────────────────────────────────────────────────────────────

describe("the areas: stacked and at 100%", () => {
  /** Each week's x in the overlay: the plot's 160 px (280 less its 40 and 80 px margins) from its left margin. */
  const weekX = shotForm.map((w) => round(40 + ((w.week - 1) / (shotForm.length - 1)) * 160));

  it("pairs each band with itself and keeps every point on its x on every frame, both ways, so each week's top and bottom stay on the week", async () => {
    const { switcher, overlay, run } = setup(areasCard, "stacked");
    expect(keysOf(switcher, "stacked")).toEqual(["offTarget", "onTarget"]);
    for (const to of ["share", "stacked"] as const) {
      void switcher.show(to);
      const xs = (d: string): number[] => points(d).map((p) => Math.round(p.x * 100) / 100);
      // The first frame draws each band's own outline; from the next, each pair's stops.
      expect([...runs(overlay).keys()].sort()).toEqual(["offTarget", "onTarget"]);
      let first: Map<string, number[]> | undefined;
      let frames = 0;
      await run(1000, () => {
        const now = runs(overlay);
        if (now.size === 0) return;
        frames++;
        if (!first) {
          first = new Map([...now].map(([key, d]) => [key, xs(d)]));
          // Every week's x is a stop of each band, on its top and on its bottom.
          for (const [key, list] of first) {
            for (const x of weekX) expect(list.filter((each) => Math.abs(each - x) < 0.01).length, `${key} at ${x}`).toBeGreaterThanOrEqual(2);
          }
          return;
        }
        for (const [key, d] of now) {
          const list = xs(d);
          expect(list.length).toBe(first.get(key)!.length);
          list.forEach((x, i) => expect(Math.abs(x - first!.get(key)![i]!), `${key}'s point ${i}`).toBeLessThan(0.011));
        }
      });
      expect(frames).toBeGreaterThan(50);
      expect(switcher.current).toBe(to);
    }
  });

  it("moves each band's name with it, at the band's right end", async () => {
    const { switcher, svg, overlay, run } = setup(areasCard, "stacked");
    const names = (view: "stacked" | "share"): Map<string, number> =>
      new Map([...svg(view).querySelectorAll("text.host-label")].map((text) => [text.textContent!, Number(text.getAttribute("y")) + offset(text.closest(".areas-plot")!).y]));
    const from = names("stacked");
    const to = names("share");
    void switcher.show("share");
    expect(seen(overlay)).toEqual(["Off target", "On target"]);
    for (const copy of copies(overlay).filter((c) => c.shown)) expect(copy.y).toBeCloseTo(from.get(copy.text)!, 3);
    await run(400);
    for (const copy of copies(overlay).filter((c) => c.shown)) {
      const [a, b] = [from.get(copy.text)!, to.get(copy.text)!];
      if (Math.abs(a - b) > 2) expect(Math.min(Math.abs(copy.y - a), Math.abs(copy.y - b)), copy.text).toBeGreaterThan(0.5);
    }
    await run(600);
    expect(switcher.current).toBe("share");
  });

  it("follows focus on a band by its key", async () => {
    const { switcher, svg, run } = setup(areasCard, "stacked");
    switcher.chart("stacked").focus("offTarget");
    void switcher.show("share");
    await run(1000);
    expect(document.activeElement).toBe(svg("share").querySelector("path.band-offTarget"));
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Shots off target: \d+% of \d+ shots in 38 matches$/);
  });

  it("keeps each week under the plot, a guide keyed by its week, at full strength on every frame, both ways, while the counts, the shares and the grid fade with their views", async () => {
    const { switcher, svg, overlay, run } = setup(areasCard, "stacked");
    const weeks = ["week@1", "week@10", "week@20", "week@30", "week@38"];
    for (const [from, to] of [
      ["stacked", "share"],
      ["share", "stacked"]
    ] as const) {
      void switcher.show(to);
      expectKept(overlay, weeks, `${from} to ${to} at the start`);
      expect([...overlay.querySelectorAll(".ec-switch-guide text")].map((tick) => tick.textContent)).toEqual(["MW 1", "10", "20", "30", "38", "MW 1", "10", "20", "30", "38"]);
      for (const view of [from, to]) {
        for (const tick of svg(view).querySelectorAll("text.x-tick")) expect(hidden(tick), `${view}: ${tick.textContent}`).toBe(true);
        // Not guides: left as drawn, in their view's container, which fades.
        for (const part of svg(view).querySelectorAll("text.y-tick, line.grid")) expect(hidden(part), `${view}: ${part.outerHTML}`).toBe(false);
      }
      let frame = 0;
      await run(944, () => expectKept(overlay, weeks, `${from} to ${to}, frame ${++frame}`));
      await run(16);
      expect(switcher.current).toBe(to);
    }
  });
});

// ── The radar ────────────────────────────────────────────────────────────────

describe("the radar into bars", () => {
  const VALUES = ["player", "average"].flatMap((series) => ["Goals", "Assists", "Shots", "Key passes", "Tackles", "Dribbles"].map((axis) => `${series}@${axis}`)).sort();

  it("pairs each circle with its bar by series and axis, and fades the outlines, rings and spokes with the radar", async () => {
    const { switcher, svg, container, overlay, run } = setup(radarCard, "radar");
    expect(keysOf(switcher, "radar")).toEqual(VALUES);
    expect(keysOf(switcher, "bars")).toEqual(VALUES);
    // Each circle is a point, its own mark, with no direction.
    expect(switcher.chart("radar").marks().every((mark) => mark.length === 0)).toBe(true);
    void switcher.show("bars");
    expect([...runs(overlay).keys()].sort()).toEqual(VALUES);
    expect(fades(overlay)).toEqual([]);
    // The circles are hidden while the overlay draws them; the outlines, rings and spokes aren't marks,
    // so they stay as drawn and fade out with the radar's container.
    for (const circle of svg("radar").querySelectorAll("circle.value")) expect(hidden(circle)).toBe(true);
    for (const part of svg("radar").querySelectorAll("polygon.outline, polygon.ring, line.spoke")) expect(hidden(part)).toBe(false);
    await run(160);
    const fading = Number(container("radar").style.opacity);
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(1);
    await run(320);
    expect(container("radar").style.opacity).toBe("0");
    await run(500);
    expect(switcher.current).toBe("bars");
  });

  it("moves each axis's name to its bars' name, and fades the percentiles in", async () => {
    const { switcher, overlay, run } = setup(radarCard, "radar");
    void switcher.show("bars");
    const axes = ["Assists", "Dribbles", "Goals", "Key passes", "Shots", "Tackles"];
    // At the start, the six names, where the radar has them; the percentiles there to fade in.
    expect(seen(overlay)).toEqual(axes);
    const percentiles = copies(overlay).filter((copy) => /^\d+$/.test(copy.text));
    expect(percentiles.map((copy) => copy.text).sort()).toEqual(["18", "47", "52", "54", "56", "57", "58", "60", "63", "74", "91", "96"]);
    expect(percentiles.every((copy) => copy.opacity === 0)).toBe(true);
    await run(960);
    expect(switcher.current).toBe("bars");
  });

  it("follows focus on a circle into its bar, and back", async () => {
    const { switcher, svg, run } = setup(radarCard, "radar");
    switcher.chart("radar").focus("average@Tackles");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("League average, tackles: 1.40 per 90, 54th percentile");
    void switcher.show("bars");
    await run(1000);
    expect(svg("bars").contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("League average, tackles: 1.40 per 90, 54th percentile");
    void switcher.show("radar");
    await run(1000);
    expect(document.activeElement?.localName).toBe("circle");
    expect(rowOf<{ series: string; label: string }>(document.activeElement!)).toMatchObject({ series: "average", label: "Tackles" });
  });
});

// ── The treemap ──────────────────────────────────────────────────────────────

describe("the treemap into bars", () => {
  const NAMES = scorers.map((s) => s.name).sort();

  /** Whether every point of a path lies on the edges of its box: an upright rectangle, however many points it has. */
  function upright(d: string): boolean {
    const list = points(d);
    const xs = list.map((p) => p.x);
    const ys = list.map((p) => p.y);
    const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const on = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;
    return list.every((p) => on(p.x, left) || on(p.x, right) || on(p.y, top) || on(p.y, bottom));
  }

  it("pairs each tile with its scorer's bar, side for side: an upright rectangle on every frame, both ways", async () => {
    const { switcher, overlay, svg, run } = setup(treemapCard, "treemap");
    expect(keysOf(switcher, "treemap")).toEqual(NAMES);
    expect(keysOf(switcher, "bars")).toEqual(NAMES);
    // Each tile is a bar growing from its left edge, as each scorer's bar is.
    for (const view of ["treemap", "bars"] as const) {
      for (const mark of switcher.chart(view).marks()) expect(mark.start.x, `${view}: ${mark.key}`).toBeCloseTo(mark.bounds.x, 6);
    }
    for (const to of ["bars", "treemap"] as const) {
      void switcher.show(to);
      expect([...runs(overlay).keys()].sort()).toEqual(NAMES);
      expect(fades(overlay)).toEqual([]);
      let frames = 0;
      await run(1000, () => {
        for (const [key, d] of runs(overlay)) {
          frames++;
          expect(upright(d), `${key}: ${d}`).toBe(true);
        }
      });
      expect(frames).toBeGreaterThan(50 * NAMES.length);
      expect(switcher.current).toBe(to);
    }
    // The tiles are coloured by position, as their bars are.
    expect(svg("treemap").querySelector("rect.tile-forward")).not.toBeNull();
    expect(svg("bars").querySelector("rect.bar-forward")).not.toBeNull();
  });

  it("moves the names and goals a tile has to its bar, swapping its goals' words half way, and fades in a small tile's bar's", async () => {
    const { switcher, svg, overlay, run } = setup(treemapCard, "treemap");
    const inTiles = [...svg("treemap").querySelectorAll("text.host-label")].map((text) => text.textContent!);
    // Room for the biggest tiles' names, not for the smallest.
    expect(inTiles).toContain("Okafor");
    expect(inTiles).not.toContain("Kowalski");
    void switcher.show("bars");
    const words = [...svg("treemap").querySelectorAll("text.host-value")].map((text) => text.textContent!);
    expect(seen(overlay)).toEqual([...inTiles, ...words].sort());
    // Kowalski's tile has no name, so his bar's name fades in.
    expect(copies(overlay).find((copy) => copy.text === "Kowalski")).toMatchObject({ opacity: 0 });
    await run(560);
    expect(seen(overlay)).toEqual(expect.arrayContaining(["Okafor", "16", "Kowalski"]));
    expect(seen(overlay)).not.toContain("16 goals");
    await run(500);
    expect(switcher.current).toBe("bars");
  });

  it("follows focus on a tile into its bar", async () => {
    const { switcher, svg, run } = setup(treemapCard, "treemap");
    switcher.chart("treemap").focus("Haddad");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Haddad, defender: 2 goals, 3% of 58");
    void switcher.show("bars");
    await run(1000);
    expect(svg("bars").contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Haddad, defender: 2 goals");
  });
});

// ── The dumbbell ─────────────────────────────────────────────────────────────

describe("the dumbbell into bars", () => {
  const NAMES = halves.map((p) => p.name);
  const DOTS = NAMES.flatMap((name) => [`first@${name}`, `second@${name}`]).sort();
  /** A view's dot or bar for a key, found by its D3 row. */
  const markOf = (svg: SVGSVGElement, key: string): SVGElement =>
    [...svg.querySelectorAll<SVGElement>("circle.dot, rect.bar")].find((element) => {
      const d = rowOf<Dot>(element);
      return `${d.half}@${d.name}` === key;
    })!;
  /** Every part of either view the switch draws in its overlay: the marks, the names, the numbers and the axis. */
  const PARTS = "circle.dot, line.connector, rect.bar, text.name, text.value, g.axes";

  it("makes its three attachments one view, keyed apart, and pairs each dot with its half's bar, the lines fading with the dumbbell, both ways", async () => {
    const { switcher, svg, overlay, run } = setup(dumbbellCard, "dumbbell");
    expect(keysOf(switcher, "dumbbell")).toEqual([...DOTS, ...NAMES].sort());
    expect(keysOf(switcher, "bars")).toEqual(DOTS);
    // The dots are named and take the keyboard, and the lines aren't, so each half is read once.
    expect(svg("dumbbell").querySelectorAll('circle.dot[role="img"]:not([aria-hidden])')).toHaveLength(16);
    for (const line of svg("dumbbell").querySelectorAll("line.connector")) expect([line.getAttribute("role"), line.getAttribute("aria-label")]).toEqual([null, null]);
    for (const to of ["bars", "dumbbell"] as const) {
      void switcher.show(to);
      expect([...runs(overlay).keys()].sort(), `to ${to}`).toEqual(DOTS);
      expect(fades(overlay).sort(), `to ${to}`).toEqual([...NAMES].sort());
      // Every part of both views hidden while the overlay draws it, each attachment's through its own edits.
      for (const view of ["dumbbell", "bars"] as const) for (const part of svg(view).querySelectorAll(PARTS)) expect(hidden(part), `${view}: ${part.outerHTML}`).toBe(true);
      await run(960);
      expect(switcher.current).toBe(to);
      expect(runs(overlay).size).toBe(0);
      for (const part of svg(to).querySelectorAll(PARTS)) expect(hidden(part), `${to}: ${part.outerHTML}`).toBe(false);
    }
  });

  it("keeps each player's name where it is, from the dumbbell's to the bars', and the axis on every frame, and fades the bars' numbers in", async () => {
    const { switcher, overlay, run } = setup(dumbbellCard, "dumbbell");
    void switcher.show("bars");
    // At the start, the names the dumbbell draws, and the bars' numbers there to fade in.
    expect(seen(overlay)).toEqual([...NAMES].sort());
    const numbers = copies(overlay).filter((copy) => /^\d+$/.test(copy.text));
    expect(numbers.map((copy) => copy.text).sort()).toEqual(halves.flatMap((p) => [String(p.goals.first), String(p.goals.second)]).sort());
    expect(numbers.every((copy) => copy.opacity === 0)).toBe(true);
    const start = new Map(copies(overlay).filter((copy) => copy.shown && NAMES.includes(copy.text)).map((copy) => [copy.text, copy]));
    expect(start.size).toBe(NAMES.length);
    expectKept(overlay, ["axis"], "at the start");
    let frame = 0;
    await run(944, () => {
      expectKept(overlay, ["axis"], `frame ${++frame}`);
      // The bars name each row where the dumbbell does, so each name stays put as it swaps.
      for (const copy of copies(overlay).filter((c) => c.shown && c.opacity > 0 && NAMES.includes(c.text))) expect(copy, copy.text).toMatchObject({ x: start.get(copy.text)!.x, y: start.get(copy.text)!.y });
    });
    expect(seen(overlay)).toEqual(expect.arrayContaining(["Okafor", "10", "6", "0"]));
    await run(16);
    expect(switcher.current).toBe("bars");
  });

  it("follows focus on a dot into its half's bar and back, each named the same", async () => {
    const { switcher, svg, run } = setup(dumbbellCard, "dumbbell");
    const name = "Okafor: 6 goals in the second half, down 4";
    switcher.chart("dumbbell").focus("second@Okafor");
    expect(document.activeElement).toBe(markOf(svg("dumbbell"), "second@Okafor"));
    expect(document.activeElement?.getAttribute("aria-label")).toBe(name);
    void switcher.show("bars");
    await run(1000);
    expect(document.activeElement).toBe(markOf(svg("bars"), "second@Okafor"));
    expect(document.activeElement?.getAttribute("aria-label")).toBe(name);
    void switcher.show("dumbbell");
    await run(1000);
    expect(document.activeElement).toBe(markOf(svg("dumbbell"), "second@Okafor"));
    switcher.chart("dumbbell").focus("first@Castillo");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Castillo: 0 goals in the first half");
  });

  it("keeps each half's tab stop on the row focus is on, so Tab from a dot goes to the other half of its row", async () => {
    const { switcher, svg, run } = setup(dumbbellCard, "dumbbell");
    /** Each half's tab stop: the dot with tabindex 0. */
    const stops = (): string[] => [...svg("dumbbell").querySelectorAll('circle.dot[tabindex="0"]')].map((dot) => `${rowOf<Dot>(dot).half}@${rowOf<Dot>(dot).name}`);
    // At load, both in the first row.
    expect(stops()).toEqual(["first@Lindqvist", "second@Lindqvist"]);
    switcher.chart("dumbbell").focus("first@Castillo");
    expect(stops()).toEqual(["first@Castillo", "second@Castillo"]);
    switcher.chart("dumbbell").focus("second@Okafor");
    expect(stops()).toEqual(["first@Okafor", "second@Okafor"]);
    // And after a switch there and back, focus following its key.
    void switcher.show("bars");
    await run(1000);
    void switcher.show("dumbbell");
    await run(1000);
    expect(document.activeElement).toBe(markOf(svg("dumbbell"), "second@Okafor"));
    expect(stops()).toEqual(["first@Okafor", "second@Okafor"]);
  });

  it("keeps the link between its attachments: a dot lights its row and its line shows its arrow, before a switch and after one there and back", async () => {
    const { switcher, svg, run } = setup(dumbbellCard, "dumbbell");
    const view = switcher.chart("dumbbell") as unknown as HostView<Dot | Row>;
    const heard: string[] = [];
    view.on("hover", (event) => heard.push(`${event.mark.key} ${event.source}`));
    /** The players whose marks aren't dimmed. */
    const lit = (): string[] => [...new Set([...svg("dumbbell").querySelectorAll("circle.dot, line.connector")].filter((part) => !part.classList.contains("ec-dimmed")).map((part) => rowOf<Row>(part).name))];
    /** The key of the line whose hover arrow is drawn. */
    const arrow = (): string | null | undefined => svg("dumbbell").querySelector('.ec-run.ec-hot[data-slot="hover"] .ec-icon[data-icon="arrow"]')?.closest(".ec-run")?.getAttribute("data-key");
    pointer("pointerover", markOf(svg("dumbbell"), "first@Okafor"));
    expect(heard.splice(0)).toEqual(["first@Okafor pointer", "second@Okafor linked", "Okafor linked"]);
    await run(320);
    expect(lit()).toEqual(["Okafor"]);
    expect(arrow()).toBe("Okafor");
    void switcher.show("bars");
    await run(1000);
    void switcher.show("dumbbell");
    await run(1000);
    // Nothing lit once the switch has ended the hover.
    expect(lit().sort()).toEqual([...NAMES].sort());
    heard.length = 0;
    pointer("pointerover", markOf(svg("dumbbell"), "second@Tanaka"));
    expect(heard).toEqual(["second@Tanaka pointer", "first@Tanaka linked", "Tanaka linked"]);
    await run(320);
    expect(lit()).toEqual(["Tanaka"]);
    expect(arrow()).toBe("Tanaka");
  });

  it("keeps a redraw mid-switch hidden until the switch lands, every attachment's marks, the names and the axis, and the switch plays on", async () => {
    const { switcher, card, svg, overlay, run } = setup(dumbbellCard, "dumbbell");
    void switcher.show("bars");
    await run(304);
    const before = [...runs(overlay).keys()];
    card.redraw();
    for (const view of ["dumbbell", "bars"] as const) for (const part of svg(view).querySelectorAll(PARTS)) expect(hidden(part), `${view}: ${part.outerHTML}`).toBe(true);
    await run(16);
    expect([...runs(overlay).keys()]).toEqual(before);
    await run(700);
    expect(switcher.current).toBe("bars");
    for (const view of ["dumbbell", "bars"] as const) for (const part of svg(view).querySelectorAll(PARTS)) expect(hidden(part), `${view}: ${part.outerHTML}`).toBe(false);
  });

  it("lands at once in Off and with reduced motion, announced once, focus following its key", async () => {
    for (const [mode, reduced] of [
      ["off", false],
      ["presentation", true]
    ] as const) {
      const { switcher, svg, overlay, run, said } = setup(dumbbellCard, "dumbbell", mode, reduced);
      switcher.chart("dumbbell").focus("first@Lindqvist");
      void switcher.show("bars");
      expect(runs(overlay).size).toBe(0);
      expect(overlay.querySelector(".ec-switch-guides")).toBeNull();
      await run(16);
      expect(document.activeElement).toBe(markOf(svg("bars"), "first@Lindqvist"));
      expect(said()).toEqual(["Goals in each half by player on D3 bars, side by side"]);
      document.body.replaceChildren();
    }
  });
});
