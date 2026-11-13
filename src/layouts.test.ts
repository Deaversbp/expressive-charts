// The layouts page's five cards (demo/layouts.html, M15 step 5 and M16 step 5): each card's views built
// with the page's own D3 modules and demo/layouts-effects.ts, in a chart switch with the real morph(), on
// a clock the test controls. These pin what the page promises: the bars' segments paired by
// `series@player` in every layout, and a jump of two staged through Stacked with one announcement; the
// areas' bands keeping each week's x on every frame; the radar's circles paired with their bars while the
// outlines fade with their view; the treemap's tiles paired with their bars side for side; the guides
// the page names kept on every frame where both views draw them the same (the bars' axis, the areas'
// weeks, the dumbbell's axis), and the bars' 100% axis fading; the dumbbell's three attachments, one
// view, their dots paired with their bars and their lines fading, and their link kept; each card's
// labels moving and swapping; focus following its key; a redraw mid-switch kept hidden; and the treemap's
// drill-down (M17 step 4), a staged jump through a position's tiles alone, with its buttons and keys. It brings
// charts and an effect together, so it lives beside src/index.ts, the only module allowed to.

import type { Dot, Row } from "../demo/d3-dumbbell";
import type { Tile } from "../demo/d3-treemap";
import { areasCard, barsCard, dumbbellCard, halves, players, positions, radarCard, scorers, shotForm, treemapCard, treemapDrill, treemapVia, type Attach, type LayoutCard, type TreemapView } from "../demo/layouts-effects";
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

/** Whether every point of a path lies on the edges of its box: an upright rectangle, however many points it has. */
function upright(d: string): boolean {
  const list = points(d);
  const xs = list.map((p) => p.x);
  const ys = list.map((p) => p.y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const on = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;
  return list.every((p) => on(p.x, left) || on(p.x, right) || on(p.y, top) || on(p.y, bottom));
}

describe("the treemap into bars", () => {
  const NAMES = scorers.map((s) => s.name).sort();

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

// ── The treemap's drill-down ─────────────────────────────────────────────────

describe("the treemap's drill-down", () => {
  const MIDFIELDERS = ["Adeyemi", "Castillo", "Sousa", "Tanaka"];
  const FORWARDS = ["Lindqvist", "Okafor"];
  const OTHERS = scorers
    .filter((s) => s.pos !== "Midfielder")
    .map((s) => s.name)
    .sort();
  const TREEMAP = "The season's 58 goals by scorer and position on a D3 treemap";
  const BARS = "The season's 58 goals by scorer on D3 bars, most first";
  const MIDFIELD = "The midfielders' 12 goals by scorer on a D3 treemap";

  /** The card's switch with its drill wired on the switch's target, as the page wires it. */
  function drillSetup(mode: MotionMode = "presentation", reduced = false) {
    const made = setup(treemapCard, "treemap", mode, reduced);
    const host = made.container("treemap").closest(".ec-switch")!.parentElement as HTMLElement;
    let changes = 0;
    const drill = treemapDrill(host, made.switcher, () => changes++);
    /** A view's tile or bar for a scorer, found by its D3 row. */
    const markOf = (view: TreemapView, name: string): SVGRectElement =>
      [...made.svg(view).querySelectorAll<SVGRectElement>("rect.tile, rect.bar")].find((rect) => {
        const d = rowOf<Tile | Tile["data"]>(rect);
        return ("data" in d ? d.data.name : d.name) === name;
      })!;
    return { ...made, host, drill, markOf, changes: () => changes };
  }

  type Box = readonly [x: number, y: number, width: number, height: number];
  /** The box round a path's points, to a hundredth of a pixel. */
  function box(d: string): Box {
    const list = points(d);
    const xs = list.map((p) => p.x);
    const ys = list.map((p) => p.y);
    const hundredth = (value: number): number => Math.round(value * 100) / 100;
    return [hundredth(Math.min(...xs)), hundredth(Math.min(...ys)), hundredth(Math.max(...xs) - Math.min(...xs)), hundredth(Math.max(...ys) - Math.min(...ys))];
  }
  /** Each run's box as the overlay draws it now, by key. */
  const boxes = (overlay: SVGSVGElement): Map<string, Box> => new Map([...runs(overlay)].map(([key, d]) => [key, box(d)]));
  /** Each tile's box as a view draws it at rest, by key: the tiles sit in their <svg> untransformed, at the overlay's origin. */
  const own = (switcher: ChartSwitch<LayoutCard<TreemapView>["views"]>, view: TreemapView): Map<string, Box> =>
    new Map(
      switcher
        .chart(view)
        .marks()
        .map((mark) => [mark.key, box(mark.outline.d)])
    );
  /** Each fading mark's opacity as the overlay draws it now, by key. */
  const fading = (overlay: SVGSVGElement): Map<string, number> =>
    new Map(Array.from(overlay.querySelectorAll(".ec-switch-fades > .ec-switch-fade"), (group) => [group.getAttribute("data-key")!, group.getAttribute("opacity") === null ? 1 : Number(group.getAttribute("opacity"))]));
  const area = ([, , width, height]: Box): number => width * height;
  const key = (target: Element, name: string, init: KeyboardEventInit = {}): boolean => target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }));
  /** Focus as a key press gives it, so the tile's hover plays: a Tab, then focus on the tile. */
  const tabTo = (tile: SVGElement): void => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    tile.focus();
  };

  it("has a position's two views for each of the four, each drawn once: its tiles where the treemap has them, and laid out to fill the chart", () => {
    const { switcher, svg } = drillSetup();
    expect(positions.map(({ view, plural, goals }) => [view, plural, goals])).toEqual([
      ["forward", "Forwards", 26],
      ["winger", "Wingers", 14],
      ["midfielder", "Midfielders", 12],
      ["defender", "Defenders", 6]
    ]);
    const whole = own(switcher, "treemap");
    for (const { view, scorers: theirs, plural, goals } of positions) {
      const names = theirs.map((s) => s.name).sort();
      expect(keysOf(switcher, view)).toEqual(names);
      expect(keysOf(switcher, `${view}-chosen`)).toEqual(names);
      // In place: each tile's box is the whole treemap's.
      for (const [name, at] of own(switcher, `${view}-chosen`)) expect(at, name).toEqual(whole.get(name));
      // To fill: together they cover the chart, 280 by 300 here, less the 2 px between tiles.
      const filled = [...own(switcher, view).values()];
      expect(Math.min(...filled.map(([x]) => x))).toBe(0);
      expect(Math.max(...filled.map(([x, , width]) => x + width))).toBe(280);
      expect(Math.max(...filled.map(([, y, , height]) => y + height))).toBe(300);
      expect(filled.reduce((sum, each) => sum + area(each), 0)).toBeGreaterThan(280 * 300 * 0.95);
      expect(svg(view).getAttribute("aria-label")).toBe(`The ${plural.toLowerCase()}' ${goals} goals by scorer on a D3 treemap`);
      // With more room: every name its tiles have in the whole treemap, they have here.
      const named = (name: TreemapView): string[] => [...svg(name).querySelectorAll("text.host-label")].map((text) => text.textContent!);
      expect(named(view)).toEqual(expect.arrayContaining(named(`${view}-chosen`)));
    }
    // Sousa's tile, too small for his name in the whole treemap at 280 px, has it among the midfielders.
    expect([...svg("midfielder-chosen").querySelectorAll("text.host-label")].map((text) => text.textContent)).not.toContain("Sousa");
    expect([...svg("midfielder").querySelectorAll("text.host-label")].map((text) => text.textContent)).toContain("Sousa");
    // A position's tile is named with its share of the position's goals, and in place as the treemap names it.
    expect(switcher.chart("midfielder").element.querySelector('[aria-label^="Tanaka"]')?.getAttribute("aria-label")).toBe("Tanaka, midfielder: 6 goals, 50% of the midfielders' 12");
    expect(switcher.chart("midfielder-chosen").element.querySelector('[aria-label^="Tanaka"]')?.getAttribute("aria-label")).toBe("Tanaka, midfielder: 6 goals, 10% of 58");
  });

  it("stages a jump between the treemap and a position through that position's tiles in place, and every other jump goes straight there", () => {
    expect(treemapVia("treemap", "midfielder")).toBe("midfielder-chosen");
    expect(treemapVia("defender", "treemap")).toBe("defender-chosen");
    for (const [from, to] of [
      ["treemap", "bars"],
      ["bars", "treemap"],
      ["bars", "forward"],
      ["winger", "bars"],
      ["winger", "forward"],
      ["treemap", "treemap"]
    ] as const)
      expect(treemapVia(from, to), `${from} to ${to}`).toBeUndefined();
  });

  it("drills in in two legs: the other positions' tiles fade while the chosen stay where they were on every frame, then the chosen grow and nothing else is drawn; announced once, with the position's name", async () => {
    const { switcher, overlay, drill, run, said } = drillSetup();
    const before = own(switcher, "treemap");
    const after = own(switcher, "midfielder");
    drill.position("midfielder");
    expect(switcher.current).toBe("midfielder");
    expect(drill.pressed()).toEqual({ layout: "treemap", position: "midfielder" });
    // The first leg, to 944 ms: four runs that don't move, and eight tiles fading, gone by 40% of the way.
    let frames = 0;
    let last = 1;
    await run(944, () => {
      frames++;
      const now = boxes(overlay);
      expect([...now.keys()].sort(), `frame ${frames}`).toEqual(MIDFIELDERS);
      for (const [name, at] of now) expect(at, `${name}, frame ${frames}`).toEqual(before.get(name));
      const others = fading(overlay);
      expect([...others.keys()].sort(), `frame ${frames}`).toEqual(OTHERS);
      const [opacity, ...rest] = [...others.values()];
      expect(rest.every((each) => each === opacity)).toBe(true);
      expect(opacity!).toBeLessThanOrEqual(last);
      last = opacity!;
      if (frames === 30) expect(opacity!).toBe(0);
    });
    expect(frames).toBe(59);
    expect(last).toBe(0);
    expect(said()).toEqual([]);
    // The second leg, from 960 ms: the four alone, growing from where they were to fill the chart.
    await run(16);
    expect(boxes(overlay)).toEqual(new Map(MIDFIELDERS.map((name) => [name, before.get(name)!])));
    frames = 0;
    await run(944, () => {
      frames++;
      const now = boxes(overlay);
      expect([...now.keys()].sort(), `frame ${frames}`).toEqual(MIDFIELDERS);
      expect(fades(overlay), `frame ${frames}`).toEqual([]);
      for (const [name, d] of runs(overlay)) expect(upright(d), `${name}, frame ${frames}`).toBe(true);
      for (const [name, at] of now) {
        expect(area(at), `${name}, frame ${frames}`).toBeGreaterThanOrEqual(area(before.get(name)!) - 0.5);
        expect(area(at), `${name}, frame ${frames}`).toBeLessThanOrEqual(area(after.get(name)!) + 0.5);
      }
    });
    // Its last frame is nearly the position's own tiles.
    for (const [name, at] of boxes(overlay)) at.forEach((value, i) => expect(Math.abs(value - after.get(name)![i]!), name).toBeLessThan(1));
    await run(16);
    expect(runs(overlay).size).toBe(0);
    expect(switcher.current).toBe("midfielder");
    expect(said()).toEqual([MIDFIELD]);
  });

  it("drills back the same way, reversed: the chosen shrink to their places with nothing else drawn, then stay put while the others fade in", async () => {
    const { switcher, overlay, drill, run, said } = drillSetup();
    const whole = own(switcher, "treemap");
    const filled = own(switcher, "midfielder");
    drill.position("midfielder");
    await run(1920);
    drill.position("all");
    expect(switcher.current).toBe("treemap");
    expect(drill.pressed()).toEqual({ layout: "treemap", position: "all" });
    let frames = 0;
    await run(944, () => {
      frames++;
      expect([...runs(overlay).keys()].sort(), `frame ${frames}`).toEqual(MIDFIELDERS);
      expect(fades(overlay), `frame ${frames}`).toEqual([]);
      for (const [name, at] of boxes(overlay)) expect(area(at), `${name}, frame ${frames}`).toBeLessThanOrEqual(area(filled.get(name)!) + 0.5);
    });
    await run(16);
    let last = 0;
    frames = 0;
    await run(944, () => {
      frames++;
      for (const [name, at] of boxes(overlay)) expect(at, `${name}, frame ${frames}`).toEqual(whole.get(name));
      const others = fading(overlay);
      expect([...others.keys()].sort(), `frame ${frames}`).toEqual(OTHERS);
      const opacity = others.get("Okafor")!;
      expect(opacity).toBeGreaterThanOrEqual(last);
      last = opacity;
      // In from half way.
      if (frames === 28) expect(opacity).toBe(0);
    });
    expect(last).toBe(1);
    await run(16);
    expect(runs(overlay).size).toBe(0);
    expect(switcher.current).toBe("treemap");
    expect(said()).toEqual([MIDFIELD, TREEMAP]);
  });

  it("moves each chosen tile's name and goals with it, fades the others' out, and fades in the names its small tiles had no room for", async () => {
    const { switcher, svg, overlay, drill, run } = drillSetup();
    const inTiles = (view: TreemapView): string[] => [...svg(view).querySelectorAll("text.host-label")].map((text) => text.textContent!).sort();
    // At 280 px the whole treemap has room for Tanaka's name among the midfielders, and not for Sousa's.
    expect(inTiles("midfielder-chosen")).toEqual(inTiles("treemap").filter((name) => MIDFIELDERS.includes(name)));
    expect(inTiles("midfielder-chosen")).toContain("Tanaka");
    expect(inTiles("midfielder-chosen")).not.toContain("Sousa");
    drill.position("midfielder");
    const start = copies(overlay).find((copy) => copy.text === "Tanaka")!;
    await run(480);
    // Half way through the first leg: the others' names are gone, and Tanaka's is where it was.
    expect(seen(overlay)).not.toContain("Okafor");
    expect(copies(overlay).find((copy) => copy.text === "Tanaka" && copy.shown)).toMatchObject({ x: start.x, y: start.y, opacity: 1 });
    await run(480);
    // The second leg: Sousa's name is there to fade in.
    expect(copies(overlay).find((copy) => copy.text === "Sousa")).toMatchObject({ opacity: 0 });
    await run(960);
    expect(switcher.current).toBe("midfielder");
    expect(overlay.querySelector(".ec-switch-labels")!.childElementCount).toBe(0);
  });

  it("follows focus on a tile by its key, in and out, each named for its view", async () => {
    const { switcher, drill, markOf, run } = drillSetup();
    switcher.chart("treemap").focus("Tanaka");
    drill.position("midfielder");
    await run(1920);
    expect(document.activeElement).toBe(markOf("midfielder", "Tanaka"));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Tanaka, midfielder: 6 goals, 50% of the midfielders' 12");
    drill.position("all");
    await run(1920);
    expect(document.activeElement).toBe(markOf("treemap", "Tanaka"));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Tanaka, midfielder: 6 goals, 10% of 58");
  });

  it("with focus on a button, moves the new view's tab stop to the old one's key, and leaves focus on the button", async () => {
    const { switcher, svg, drill, run } = drillSetup();
    const button = document.body.appendChild(document.createElement("button"));
    /** A view's tab stop: the scorer whose mark has tabindex 0. */
    const stop = (view: TreemapView): string => {
      const d = rowOf<Tile | Tile["data"]>(svg(view).querySelector('[tabindex="0"]')!);
      return "data" in d ? d.data.name : d.name;
    };
    switcher.chart("treemap").focus("Adeyemi");
    button.focus();
    drill.position("midfielder");
    await run(1920);
    expect(document.activeElement).toBe(button);
    expect(stop("midfielder")).toBe("Adeyemi");
    drill.layout("bars");
    await run(960);
    expect(document.activeElement).toBe(button);
    expect(stop("bars")).toBe("Adeyemi");
  });

  it("drills back from the first leg by playing it back from where it is: the chosen never move, and the others fade back in", async () => {
    const { switcher, overlay, drill, run, said } = drillSetup();
    const whole = own(switcher, "treemap");
    drill.position("midfielder");
    await run(320);
    const faded = fading(overlay).get("Okafor")!;
    expect(faded).toBeLessThan(1);
    drill.position("all");
    expect(switcher.current).toBe("treemap");
    let last = faded;
    await run(304, () => {
      for (const [name, at] of boxes(overlay)) expect(at, name).toEqual(whole.get(name));
      const opacity = fading(overlay).get("Okafor")!;
      expect(opacity).toBeGreaterThanOrEqual(last);
      last = opacity;
    });
    // As long back as it had gone.
    await run(16);
    expect(runs(overlay).size).toBe(0);
    expect(switcher.current).toBe("treemap");
    expect(said()).toEqual([TREEMAP]);
  });

  it("drills back from the second leg as the switch goes to any third view: it lands on the position first, then plays the whole jump back", async () => {
    const { switcher, overlay, drill, run, said } = drillSetup();
    const filled = own(switcher, "midfielder");
    drill.position("midfielder");
    await run(1280);
    expect(area(boxes(overlay).get("Tanaka")!)).toBeLessThan(area(filled.get("Tanaka")!));
    drill.position("all");
    expect(switcher.current).toBe("treemap");
    // From the position's own tiles, at full size.
    expect(boxes(overlay)).toEqual(filled);
    expect(fades(overlay)).toEqual([]);
    await run(1904);
    expect(runs(overlay).size).toBe(4);
    await run(16);
    expect(runs(overlay).size).toBe(0);
    expect(switcher.current).toBe("treemap");
    expect(said()).toEqual([TREEMAP]);
  });

  it("goes from a position to the bars in one switch, its tiles growing into their bars as the other bars fade in, and from the bars into a position the same way back", async () => {
    const { switcher, overlay, drill, run, said } = drillSetup();
    drill.position("midfielder");
    await run(1920);
    drill.layout("bars");
    expect(switcher.current).toBe("bars");
    expect(drill.pressed()).toEqual({ layout: "bars", position: "all" });
    expect([...runs(overlay).keys()].sort()).toEqual(MIDFIELDERS);
    expect([...fading(overlay).keys()].sort()).toEqual(OTHERS);
    expect([...new Set(fading(overlay).values())]).toEqual([0]);
    await run(944, () => {
      for (const [name, d] of runs(overlay)) expect(upright(d), name).toBe(true);
    });
    expect([...new Set(fading(overlay).values())]).toEqual([1]);
    await run(16);
    expect(switcher.current).toBe("bars");
    expect(runs(overlay).size).toBe(0);
    // All on the bars is already every position: nothing moves.
    drill.position("all");
    expect(switcher.current).toBe("bars");
    expect(runs(overlay).size).toBe(0);
    // A position from the bars.
    drill.position("midfielder");
    expect(switcher.current).toBe("midfielder");
    expect(drill.pressed()).toEqual({ layout: "treemap", position: "midfielder" });
    expect([...runs(overlay).keys()].sort()).toEqual(MIDFIELDERS);
    expect([...fading(overlay).keys()].sort()).toEqual(OTHERS);
    await run(960);
    expect(runs(overlay).size).toBe(0);
    expect(switcher.current).toBe("midfielder");
    // Treemap on a position is already a treemap: nothing moves.
    drill.layout("treemap");
    expect(switcher.current).toBe("midfielder");
    expect(runs(overlay).size).toBe(0);
    expect(said()).toEqual([MIDFIELD, BARS, MIDFIELD]);
  });

  it("goes from one position straight to another in one switch with nothing to morph: the old tiles fade out, then the new fade in, and focus goes to the new one's first tile", async () => {
    const { switcher, overlay, drill, markOf, run, said } = drillSetup();
    drill.position("midfielder");
    await run(1920);
    switcher.chart("midfielder").focus("Tanaka");
    drill.position("forward");
    expect(switcher.current).toBe("forward");
    expect(drill.pressed()).toEqual({ layout: "treemap", position: "forward" });
    let both = 0;
    let frames = 0;
    await run(944, () => {
      frames++;
      expect(runs(overlay).size, `frame ${frames}`).toBe(0);
      const now = fading(overlay);
      expect([...now.keys()].sort(), `frame ${frames}`).toEqual([...MIDFIELDERS, ...FORWARDS].sort());
      // Never both drawn at once.
      if (now.get("Tanaka")! > 0 && now.get("Okafor")! > 0) both++;
    });
    expect(both).toBe(0);
    expect(fading(overlay).get("Okafor")).toBe(1);
    await run(16);
    expect(switcher.current).toBe("forward");
    expect(document.activeElement).toBe(markOf("forward", "Okafor"));
    expect(said()).toEqual([MIDFIELD, "The forwards' 26 goals by scorer on a D3 treemap"]);
  });

  it("drills into a tile's position on a click, read from its D3 row, on the whole treemap alone", async () => {
    const { switcher, overlay, drill, markOf, run, changes } = drillSetup();
    markOf("treemap", "Novak").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(switcher.current).toBe("defender");
    expect(drill.pressed()).toEqual({ layout: "treemap", position: "defender" });
    expect(changes()).toBe(1);
    expect([...runs(overlay).keys()].sort()).toEqual(["Haddad", "Kowalski", "Novak"]);
    await run(1920);
    // A position's own tile isn't a way further in, and a bar isn't a tile.
    markOf("defender", "Novak").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(switcher.current).toBe("defender");
    drill.layout("bars");
    await run(960);
    markOf("bars", "Okafor").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(switcher.current).toBe("bars");
    expect(changes()).toBe(2);
  });

  it("drills in on Enter on a focused tile and back on Escape, focus following its tile, and leaves both keys alone anywhere else", async () => {
    const { switcher, drill, markOf, run, changes } = drillSetup();
    switcher.chart("treemap").focus("Reyes");
    // Escape on the whole treemap is the library's alone: the first ends the tile's hover, and the next
    // does nothing. So is Enter with a modifier.
    expect(key(document.activeElement!, "Escape")).toBe(false);
    expect(key(document.activeElement!, "Escape")).toBe(true);
    expect(key(document.activeElement!, "Enter", { ctrlKey: true })).toBe(true);
    expect(switcher.current).toBe("treemap");
    // Enter: taken, so it does nothing else.
    expect(key(document.activeElement!, "Enter")).toBe(false);
    expect(switcher.current).toBe("winger");
    expect(drill.pressed()).toEqual({ layout: "treemap", position: "winger" });
    await run(1920);
    expect(document.activeElement).toBe(markOf("winger", "Reyes"));
    // Enter on a position's tile goes no further.
    expect(key(document.activeElement!, "Enter")).toBe(true);
    expect(switcher.current).toBe("winger");
    expect(key(document.activeElement!, "Escape")).toBe(false);
    expect(switcher.current).toBe("treemap");
    await run(1920);
    expect(document.activeElement).toBe(markOf("treemap", "Reyes"));
    expect(changes()).toBe(2);
    // On the bars, neither key is the card's.
    drill.layout("bars");
    await run(960);
    expect(key(document.activeElement!, "Enter")).toBe(true);
    key(document.activeElement!, "Escape");
    expect(switcher.current).toBe("bars");
  });

  it("goes back on one Escape from a tile whose hover is playing: the library ends the hover, and the card drills back", async () => {
    const { switcher, svg, drill, markOf, run } = drillSetup();
    drill.position("midfielder");
    await run(1920);
    tabTo(markOf("midfielder", "Adeyemi"));
    await run(160);
    const dimmed = (): number => svg("midfielder").querySelectorAll("rect.tile.ec-dimmed").length;
    expect(dimmed()).toBe(3);
    expect(key(document.activeElement!, "Escape")).toBe(false);
    expect(switcher.current).toBe("treemap");
    await run(1920);
    expect(dimmed()).toBe(0);
    expect(document.activeElement).toBe(markOf("treemap", "Adeyemi"));
  });

  it("goes between a treemap and the bars on V on a focused mark: from a position to the bars, and from the bars to the whole treemap", async () => {
    const { switcher, drill, markOf, run } = drillSetup();
    switcher.chart("treemap").focus("Okafor");
    key(document.activeElement!, "v");
    expect(switcher.current).toBe("bars");
    await run(960);
    expect(document.activeElement).toBe(markOf("bars", "Okafor"));
    key(document.activeElement!, "V");
    expect(switcher.current).toBe("treemap");
    await run(960);
    drill.position("forward");
    await run(1920);
    expect(document.activeElement).toBe(markOf("forward", "Okafor"));
    expect(key(document.activeElement!, "v")).toBe(false);
    expect(switcher.current).toBe("bars");
    await run(960);
    expect(document.activeElement).toBe(markOf("bars", "Okafor"));
    // Not with a modifier, and not from anything but a mark.
    expect(key(document.activeElement!, "v", { ctrlKey: true })).toBe(true);
    expect(switcher.current).toBe("bars");
  });

  it("keeps a redraw mid-jump hidden in each leg, as a resize redraws every view, and the jump plays on to its position", async () => {
    for (const at of [304, 1264]) {
      const { switcher, card, svg, overlay, drill, run } = drillSetup();
      const PARTS = "rect.tile, text.host-label, text.host-value";
      drill.position("midfielder");
      await run(at);
      const before = [...runs(overlay).keys()];
      card.redraw();
      const playing = at < 950 ? (["treemap", "midfielder-chosen"] as const) : (["midfielder-chosen", "midfielder"] as const);
      for (const view of playing) for (const part of svg(view).querySelectorAll(PARTS)) expect(hidden(part), `${view} at ${at}: ${part.outerHTML}`).toBe(true);
      await run(16);
      expect([...runs(overlay).keys()]).toEqual(before);
      await run(1920 - at);
      expect(switcher.current).toBe("midfielder");
      expect(runs(overlay).size).toBe(0);
      for (const view of ["treemap", "midfielder-chosen", "midfielder"] as const) for (const part of svg(view).querySelectorAll(PARTS)) expect(hidden(part), `${view}: ${part.outerHTML}`).toBe(false);
      // And the next jump reads the views as redrawn.
      drill.position("all");
      await run(1920);
      expect(switcher.current).toBe("treemap");
      document.body.replaceChildren();
    }
  });

  it("goes straight to a position in Analysis in a fifth of a second, the others fading as the chosen grow, and back", async () => {
    const { switcher, overlay, drill, run, said } = drillSetup("analysis");
    for (const [position, view] of [
      ["midfielder", "midfielder"],
      ["all", "treemap"]
    ] as const) {
      drill.position(position);
      expect([...runs(overlay).keys()].sort()).toEqual(MIDFIELDERS);
      expect([...fading(overlay).keys()].sort()).toEqual(OTHERS);
      await run(192);
      expect(runs(overlay).size).toBe(4);
      await run(16);
      expect(runs(overlay).size).toBe(0);
      expect(switcher.current).toBe(view);
    }
    expect(said()).toEqual([MIDFIELD, TREEMAP]);
  });

  it("lands at once in Off and with reduced motion, in and out, announced once each, focus following its tile", async () => {
    for (const [mode, reduced] of [
      ["off", false],
      ["presentation", true]
    ] as const) {
      const { switcher, overlay, drill, markOf, run, said } = drillSetup(mode, reduced);
      switcher.chart("treemap").focus("Sousa");
      key(document.activeElement!, "Enter");
      expect(runs(overlay).size).toBe(0);
      expect(fades(overlay)).toEqual([]);
      expect(switcher.current).toBe("midfielder");
      await run(16);
      expect(document.activeElement).toBe(markOf("midfielder", "Sousa"));
      expect(said()).toEqual([MIDFIELD]);
      key(document.activeElement!, "Escape");
      expect(runs(overlay).size).toBe(0);
      await run(16);
      expect(document.activeElement).toBe(markOf("treemap", "Sousa"));
      expect(said()).toEqual([MIDFIELD, TREEMAP]);
      drill.position("forward");
      await run(16);
      drill.position("defender");
      await run(16);
      expect(switcher.current).toBe("defender");
      expect(overlay.querySelector(".ec-switch-fades")!.childElementCount).toBe(0);
      document.body.replaceChildren();
    }
  });

  it("stops listening when its drill is destroyed", () => {
    const { switcher, drill, markOf } = drillSetup();
    drill.destroy();
    markOf("treemap", "Novak").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    switcher.chart("treemap").focus("Novak");
    expect(key(document.activeElement!, "Enter")).toBe(true);
    expect(switcher.current).toBe("treemap");
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
