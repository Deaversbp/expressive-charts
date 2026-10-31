// A chart switch with the real morph() and line charts (M11 step 1): a season's goals and xG per match
// with missing weeks, as a line chart, as season-to-date lines, and as goals' columns keyed as the
// points are. Beside src/index.ts because it brings charts and an effect together, as only the
// composition root may. src/charts/switch.test.ts checks the same switches with a recording effect.

import { createMotion, describe as geometry, easeInOutCubic, manualClock, type MarkGeometry, type Point } from "./core";
import { createRegistry, type PresetFactory } from "./core/registry";
import { drawnInGaps, flush } from "./core/testing";
import { barChart, chartSwitch, colorAssignment, donutChart, lineChart, type ChartEnv } from "./charts";
import { seriesColors } from "./charts/render/theme";
import { morph } from "./effects";

interface Week {
  readonly week: number;
  readonly goals: number | null;
  readonly xg: number | null;
}

/** Per match, with missing weeks: goals in weeks 4 and 6 are each alone between gaps, so their points are drawn at rest. */
const perMatch: Week[] = [
  { week: 1, goals: 1, xg: 0.8 },
  { week: 2, goals: 2, xg: 1.4 },
  { week: 3, goals: null, xg: 1.1 },
  { week: 4, goals: 1, xg: null },
  { week: 5, goals: null, xg: 2 },
  { week: 6, goals: 3, xg: 1.7 }
];

/** Season to date, with the same gaps. */
const toDate: Week[] = [
  { week: 1, goals: 1, xg: 0.8 },
  { week: 2, goals: 3, xg: 2.2 },
  { week: 3, goals: null, xg: 3.3 },
  { week: 4, goals: 4, xg: null },
  { week: 5, goals: null, xg: 5.3 },
  { week: 6, goals: 7, xg: 7 }
];

/** Goals per match as columns, for the weeks with a value, keyed as the points are. */
const played = perMatch.flatMap((d) => (d.goals === null ? [] : [{ week: d.week, goals: d.goals }]));
const PLAYED = played.map((d) => `goals@${d.week}`);
/** Alone between gaps: drawn at rest. */
const ALONE = new Set(["goals@4", "goals@6"]);
const POINTS = 160;

function setup() {
  const clock = manualClock();
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const target = document.body.appendChild(document.createElement("div"));
  const colors = colorAssignment();
  const switcher = chartSwitch(
    target,
    {
      views: {
        perMatch: (el, shared) => lineChart<Week>(el, { label: "Per match", data: perMatch, x: "week", series: ["goals", "xg"], colors: shared, width: 600 }, env),
        toDate: (el, shared) => lineChart<Week>(el, { label: "Season to date", data: toDate, x: "week", series: ["goals", "xg"], colors: shared, width: 600 }, env),
        columns: (el, shared) =>
          barChart(el, { label: "Goals per match", data: played, x: (d) => String(d.week), y: "goals", key: (d) => `goals@${d.week}`, orientation: "vertical", colors: shared, width: 600 }, env)
      },
      initial: "perMatch",
      transition: morph(),
      colors
    },
    env
  );
  const overlay = target.querySelector(".ec-switch-overlay") as SVGSVGElement;
  const land = async () => {
    clock.advance(950);
    await flush();
  };
  return { switcher, overlay, clock, colors, land, line: switcher.chart("perMatch"), season: switcher.chart("toDate"), columns: switcher.chart("columns") };
}

/** Each pair's morph as drawn now, by key. */
function shapes(overlay: SVGSVGElement): Map<string, SVGPathElement> {
  return new Map(Array.from(overlay.querySelectorAll(".ec-switch-runs > .ec-run"), (group) => [group.getAttribute("data-key")!, group.querySelector("path")!]));
}

/** The points of a sampled polygon's path data. */
function points(d: string): Point[] {
  return Array.from(d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g), ([, x, y]) => ({ x: Number(x), y: Number(y) }));
}

/** The furthest any point of the pairs' shapes moved between two pictures, px. */
function jump(before: Map<string, string>, after: Map<string, string>): number {
  expect([...after.keys()]).toEqual([...before.keys()]);
  let most = 0;
  for (const [key, d] of before) {
    const a = points(d);
    const b = points(after.get(key)!);
    expect(b).toHaveLength(a.length);
    a.forEach((p, i) => (most = Math.max(most, Math.hypot(p.x - b[i]!.x, p.y - b[i]!.y))));
  }
  return most;
}

const drawn = (overlay: SVGSVGElement): Map<string, string> => new Map(Array.from(shapes(overlay), ([key, path]) => [key, path.getAttribute("d")!]));
const byKey = (marks: readonly MarkGeometry[]) => new Map(marks.map((mark) => [mark.key, mark]));
const mix = (a: Point, b: Point, p: number): Point => ({ x: a.x * (1 - p) + b.x * p, y: a.y * (1 - p) + b.y * p });
const near = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) <= 0.0011 && Math.abs(a.y - b.y) <= 0.0011;
const markColor = (element: Element): string => (element as SVGElement).style.getPropertyValue("--ec-mark");

/** Where both marks have a gap, as [from, to] values of t. */
const sharedGaps = (a: MarkGeometry, b: MarkGeometry): [number, number][] =>
  (a.gaps ?? []).flatMap(([a0, a1]) => (b.gaps ?? []).flatMap(([b0, b1]): [number, number][] => (Math.min(a1, b1) > Math.max(a0, b0) ? [[Math.max(a0, b0), Math.min(a1, b1)]] : [])));

/**
 * The line part way, as far as drawnInGaps reads it: each t's point moved from `from`'s toward
 * `to`'s by p, with the gaps both have. Both walks run straight across those, so it does too.
 */
const partWay = (from: MarkGeometry, to: MarkGeometry, p: number): MarkGeometry =>
  ({ key: from.key, gaps: sharedGaps(from, to), path: (t: number) => mix(from.path(t), to.path(t), p) }) as unknown as MarkGeometry;

afterEach(() => {
  document.body.textContent = "";
});

describe("chartSwitch with morph(): a line chart and its points' columns", () => {
  it("grows each column out of its point, from a dot of no size at its centre, while the lines fade out over the first half, all in their series' colours", async () => {
    const { switcher, overlay, line, columns, clock, colors, land } = setup();
    const points0 = byKey(line.marks());
    const bars = byKey(columns.marks());
    void switcher.show("columns");
    // The first frame: a hidden point is a dot of no size, a point alone between gaps its own dot.
    const first = shapes(overlay);
    expect([...first.keys()]).toEqual(PLAYED);
    for (const [key, path] of first) {
      const point = points0.get(key)!;
      expect(path.getAttribute("d")).toBe((ALONE.has(key) ? point : geometry.point({ key, x: point.center.x, y: point.center.y, r: 0 })).outline.d);
      expect(markColor(path.parentElement!)).toBe(seriesColors(colors.slot("goals")).color);
      expect(path.style.fill.startsWith("var(--ec-mark,")).toBe(true);
    }
    // Half way: each sample half way from its point to the column.
    clock.advance(475);
    for (const [key, path] of shapes(overlay)) {
      const point = points0.get(key)!;
      const from = ALONE.has(key) ? point.outline.sample(POINTS) : Array.from({ length: POINTS }, () => point.center);
      const to = bars.get(key)!.outline.sample(POINTS);
      const at = points(path.getAttribute("d")!);
      expect(at).toHaveLength(POINTS);
      expect(at.every((p, i) => near(p, mix(from[i]!, to[i]!, 0.5)))).toBe(true);
    }
    // The lines are gone by half way.
    const fades = Array.from(overlay.querySelectorAll(".ec-switch-fades > .ec-switch-fade"));
    expect(fades.map((fade) => [fade.getAttribute("data-key"), fade.getAttribute("opacity"), markColor(fade)])).toEqual([
      ["goals", "0", seriesColors(colors.slot("goals")).color],
      ["xg", "0", seriesColors(colors.slot("xg")).color]
    ]);
    await land();
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    expect(columns.element.classList.contains("ec-morphing")).toBe(false);
  });

  it("shrinks each column back into its point, ends on the line as it's drawn, and doesn't jump on a switch back mid-way", async () => {
    const { switcher, overlay, line, columns, clock, land } = setup();
    const points0 = byKey(line.marks());
    const bars = byKey(columns.marks());
    void switcher.show("columns");
    await land();
    void switcher.show("perMatch");
    clock.advance(475);
    for (const [key, path] of shapes(overlay)) {
      const point = points0.get(key)!;
      const to = ALONE.has(key) ? point.outline.sample(POINTS) : Array.from({ length: POINTS }, () => point.center);
      const from = bars.get(key)!.outline.sample(POINTS);
      expect(points(path.getAttribute("d")!).every((p, i) => near(p, mix(from[i]!, to[i]!, 0.5)))).toBe(true);
    }
    // Just before it lands: the hidden points' columns all but gone into their centres, the lines all but in, as drawn.
    clock.advance(474);
    const s = easeInOutCubic(949 / 950);
    for (const [key, path] of shapes(overlay)) {
      if (ALONE.has(key)) continue;
      const centre = points0.get(key)!.center;
      for (const p of points(path.getAttribute("d")!)) expect(Math.hypot(p.x - centre.x, p.y - centre.y)).toBeLessThan(0.01);
    }
    for (const fade of Array.from(overlay.querySelectorAll(".ec-switch-fades > .ec-switch-fade"))) {
      expect(fade.querySelector("path")!.getAttribute("d")).toBe(points0.get(fade.getAttribute("data-key")!)!.outline.d);
      expect(Number(fade.getAttribute("opacity"))).toBeCloseTo((s - 0.5) / 0.5, 3);
    }
    await land();

    // A switch back mid-way plays the same picture backwards from where it is.
    void switcher.show("columns");
    clock.advance(300);
    const before = drawn(overlay);
    void switcher.show("perMatch");
    expect(jump(before, drawn(overlay))).toBe(0);
    clock.advance(200);
    const again = drawn(overlay);
    void switcher.show("columns");
    expect(jump(again, drawn(overlay))).toBe(0);
  });
});

describe("chartSwitch with morph(): two line charts", () => {
  it("morphs each line into its own along its stroke, from its own outline to the other's, and plays only a value alone between gaps among the points, dot to dot", async () => {
    const { switcher, overlay, line, season, clock, colors, land } = setup();
    const from = byKey(line.marks());
    const to = byKey(season.marks());
    void switcher.show("toDate");
    const first = shapes(overlay);
    expect([...first.keys()]).toEqual(["goals", "xg", "goals@4", "goals@6"]);
    for (const [key, path] of first) {
      expect(path.getAttribute("d")).toBe(from.get(key)!.outline.d);
      const series = key.split("@")[0]!;
      expect(markColor(path.parentElement!)).toBe(seriesColors(colors.slot(series)).color);
      // A line is a stroke; a point a fill, with its ring in the surface's colour (M12 step 1).
      if (key.includes("@")) {
        expect([path.style.fill.startsWith("var(--ec-mark,"), path.style.stroke.startsWith("var(--ec-surface,"), path.getAttribute("stroke-width")]).toEqual([true, true, "2"]);
      } else {
        expect([path.style.stroke.startsWith("var(--ec-mark,"), path.style.fill]).toEqual([true, "none"]);
      }
    }
    clock.advance(475);
    for (const key of ["goals@4", "goals@6"]) {
      const a = from.get(key)!.outline.sample(POINTS);
      const b = to.get(key)!.outline.sample(POINTS);
      expect(points(shapes(overlay).get(key)!.getAttribute("d")!).every((p, i) => near(p, mix(a[i]!, b[i]!, 0.5)))).toBe(true);
    }
    // Nothing fades: every mark has its partner, and the hidden points aren't drawn.
    expect(overlay.querySelectorAll(".ec-switch-fades > *")).toHaveLength(0);
    // The last frame: each the other chart's own.
    clock.advance(474);
    await flush();
    clock.advance(1);
    for (const [key, path] of shapes(overlay)) expect(path.getAttribute("d")).toBe(to.get(key)!.outline.d);
    await land();
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
  });
});

describe("chartSwitch with morph(): two line charts with missing weeks (M11 step 2)", () => {
  it("draws nothing inside a gap both lines have, on any frame, both ways, and fades the rest of each line's gaps", async () => {
    const { switcher, overlay, line, season, clock, land } = setup();
    for (const [view, fromChart, toChart] of [
      ["toDate", line, season],
      ["perMatch", season, line]
    ] as const) {
      const from = byKey(fromChart.marks());
      const to = byKey(toChart.marks());
      void switcher.show(view);
      let fading = 0;
      for (let ms = 0; ms < 950; ms += 16) {
        const p = easeInOutCubic(ms / 950);
        for (const key of ["goals", "xg"]) {
          const [a, b] = [from.get(key)!, to.get(key)!];
          // Both miss the same weeks, at about the same t, so their gaps overlap.
          expect(sharedGaps(a, b).length, key).toBeGreaterThan(0);
          const paths = Array.from(overlay.querySelectorAll(`.ec-switch-runs > .ec-run[data-key="${key}"] path`));
          expect(paths.length, key).toBeGreaterThan(0);
          const mark = p <= 0 ? a : partWay(a, b, p);
          const drawn = paths.map((path, id) => ({ kind: "path" as const, id, d: path.getAttribute("d")!, paint: {} }));
          expect(drawnInGaps(mark, drawn), `${key} to ${view} at ${p}`).toEqual([]);
          fading += paths.filter((path) => path.hasAttribute("opacity")).length;
        }
        clock.advance(16);
      }
      // The parts of a gap that only one line has fade in or out.
      expect(fading).toBeGreaterThan(0);
      await land();
      for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    }
  });
});

// ── End dots and rings (M12 step 1) ──────────────────────────────────────────

/** Every point a group's paths draw, from their path data. */
const drawnPoints = (group: Element): Point[] => Array.from(group.querySelectorAll("path"), (path) => points(path.getAttribute("d")!)).flat();
/** The end dot drawn in a group: where, its radius and its ring. */
function endDotIn(group: Element): { readonly x: number; readonly y: number; readonly r: number; readonly ring: number } {
  const circle = group.querySelector(":scope > circle.ec-switch-end")!;
  const read = (name: string): number => Number(circle.getAttribute(name));
  return { x: read("cx"), y: read("cy"), r: read("r"), ring: read("stroke-width") };
}
/** The lines run left to right, so the end of the stroke a line's paths draw is the point furthest right. */
const strokeEnd = (group: Element): Point => drawnPoints(group).reduce((best, p) => (p.x >= best.x ? p : best));
/** The centre of a point's dot part way: the mean of the polygon morph draws, sampled evenly round both dots. */
function dotCentre(path: Element): Point {
  const at = points(path.getAttribute("d")!);
  return { x: at.reduce((sum, p) => sum + p.x, 0) / at.length, y: at.reduce((sum, p) => sum + p.y, 0) / at.length };
}
const lineRun = (overlay: SVGSVGElement, key: string): Element => overlay.querySelector(`.ec-switch-runs > .ec-run[data-key="${key}"]`)!;

describe("chartSwitch with morph(): a line's end dot and a point's ring (M12 step 1)", () => {
  it("keeps each end dot on its drawn line's end, with its ring, on every frame, both ways, and doesn't jump on a switch back mid-way", async () => {
    const { switcher, overlay, line, season, clock, land } = setup();
    for (const [view, fromChart] of [
      ["toDate", line],
      ["perMatch", season]
    ] as const) {
      void switcher.show(view);
      const from = byKey(fromChart.marks());
      // Where each line ends as drawn: xG's last week is joined to the one before, so its stroke ends
      // there; goals' is alone between gaps, so the line ends on that point's dot, which plays too.
      const ends: Readonly<Record<string, (ms: number) => Point>> = {
        goals: (ms) => (ms === 0 ? from.get("goals@6")!.center : dotCentre(shapes(overlay).get("goals@6")!)),
        xg: () => strokeEnd(lineRun(overlay, "xg"))
      };
      for (let ms = 0; ms < 950; ms += 16) {
        for (const key of ["goals", "xg"]) {
          const group = lineRun(overlay, key);
          const dot = endDotIn(group);
          expect(near(dot, ends[key]!(ms)), `${key} to ${view} at ${ms} ms`).toBe(true);
          expect([dot.r, dot.ring]).toEqual([4.5, 2]);
          // Above its line.
          expect(group.lastElementChild?.tagName).toBe("circle");
          if (ms === 0) expect(near(dot, from.get(key)!.end)).toBe(true);
        }
        // The points alone between gaps keep their rings.
        for (const key of ALONE) expect(shapes(overlay).get(key)!.getAttribute("stroke-width")).toBe("2");
        clock.advance(16);
      }
      await land();
    }
    const dots = () => ["goals", "xg"].map((key) => endDotIn(lineRun(overlay, key)));
    void switcher.show("toDate");
    clock.advance(400);
    const before = dots();
    void switcher.show("perMatch");
    expect(dots()).toEqual(before);
    clock.advance(200);
    const back = dots();
    void switcher.show("toDate");
    expect(dots()).toEqual(back);
  });

  it("fades each line's end dot with its line, where it ends, and the points alone lose their rings as they grow into their columns", async () => {
    const { switcher, overlay, line, clock } = setup();
    void switcher.show("columns");
    const ring = (key: string): number => Number(shapes(overlay).get(key)!.getAttribute("stroke-width"));
    for (let ms = 0; ms < 950; ms += 16) {
      for (const fade of Array.from(overlay.querySelectorAll(".ec-switch-fades > .ec-switch-fade"))) {
        const key = fade.getAttribute("data-key")!;
        const dot = endDotIn(fade);
        expect(near(dot, byKey(line.marks()).get(key)!.end)).toBe(true);
        if (key === "xg") expect(near(dot, strokeEnd(fade))).toBe(true);
      }
      const p = easeInOutCubic(ms / 950);
      for (const key of ALONE) expect(Math.abs(ring(key) - 2 * (1 - p))).toBeLessThanOrEqual(0.0006);
      clock.advance(16);
    }
  });
});

// ── Views without end dots or rings, byte for byte (M12 step 1) ──────────────

/** The lab's card 3, as the morph page draws its first card. */
const outcomes = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];

/** A 64-bit hash of the text (cyrb53's mixing, both halves kept), as 16 hex digits, as src/effects/morph.test.ts has it. */
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

/**
 * The overlay's markup on every 16 ms frame of the morph page's donut and columns, with each align:
 * to the columns, back part way, and on again. A digest an align. Its numbers are rounded to 1e-9,
 * as morph.test.ts's digests round theirs: they're the 0.001s the overlay writes, so it changes none.
 */
async function overlayDigests(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const align of ["unroll", "drop"] as const) {
    const clock = manualClock();
    const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
    const target = document.body.appendChild(document.createElement("div"));
    const switcher = chartSwitch(
      target,
      {
        views: {
          donut: (el, colors) => donutChart(el, { label: "Shot outcomes, share of total", data: outcomes, category: "outcome", value: "shots", colors, width: 600 }, env),
          columns: (el, colors) => barChart(el, { label: "Shot outcomes, counts", data: outcomes, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors, width: 600 }, env)
        },
        initial: "donut",
        transition: morph({ align }),
        colors: colorAssignment({ Goal: 1, Saved: 2, "Off target": 3, Blocked: 4 })
      },
      env
    );
    const overlay = target.querySelector(".ec-switch-overlay") as SVGSVGElement;
    let log = "";
    const frames = (ms: number): void => {
      for (let t = 0; t < ms; t += 16) {
        log += overlay.innerHTML.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 1e9) / 1e9));
        clock.advance(16);
      }
    };
    for (const [view, ms] of [
      ["columns", 960],
      ["donut", 400],
      ["columns", 960]
    ] as const) {
      void switcher.show(view);
      frames(ms);
      await flush();
    }
    out[align] = hash(log);
    switcher.destroy();
  }
  return out;
}

/** The digests main (3547035) gave, with this file's overlayDigests() run there, before the switch drew end dots and rings. */
const MAIN_OVERLAY: Readonly<Record<string, string>> = {
  unroll: "c04c52f338c664bc",
  drop: "941f7237123e78c6"
};

describe("chartSwitch with morph(): views without end dots or rings (M12 step 1)", () => {
  it("draws the morph page's donut and columns as on main, byte for byte: every frame, with each align, there, back part way and on again", async () => {
    expect(await overlayDigests()).toEqual(MAIN_OVERLAY);
  });
});
