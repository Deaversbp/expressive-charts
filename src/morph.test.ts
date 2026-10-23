// A chart switch with the real morph(): a donut and its category columns, as the lab's card 3, both
// ways and with each align. Beside src/index.ts because it brings charts and an effect together, as
// only the composition root may.

import { createMotion, manualClock, type MarkGeometry, type Point } from "./core";
import { createRegistry, type PresetFactory } from "./core/registry";
import { flush } from "./core/testing";
import { barChart, chartSwitch as buildChartSwitch, colorAssignment, donutChart, type ChartEnv, type ChartLabel } from "./charts";
import { morph, type MorphAlign } from "./effects";
import { chartSwitch as publicChartSwitch, colorAssignment as publicColors, barChart as publicBar, donutChart as publicDonut } from "./index";

const outcomes = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];
const KEYS = outcomes.map((row) => row.outcome);
const POINTS = 160;
const QUARTER = POINTS / 4;

function setup(align?: MorphAlign) {
  const clock = manualClock();
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const target = document.body.appendChild(document.createElement("div"));
  const switcher = buildChartSwitch(
    target,
    {
      views: {
        donut: (el, colors) => donutChart(el, { label: "Shot outcomes, share of total", data: outcomes, category: "outcome", value: "shots", colors, width: 600 }, env),
        columns: (el, colors) => barChart(el, { label: "Shot outcomes, counts", data: outcomes, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors, width: 600 }, env)
      },
      initial: "donut",
      transition: morph(align === undefined ? {} : { align }),
      colors: colorAssignment()
    },
    env
  );
  const overlay = target.querySelector(".ec-switch-overlay") as SVGSVGElement;
  const donut = switcher.chart("donut");
  const columns = switcher.chart("columns");
  return { switcher, overlay, donut, columns, clock };
}

/** Each pair's morph as drawn now, by key. */
function shapes(overlay: SVGSVGElement): Map<string, string> {
  return new Map(Array.from(overlay.querySelectorAll(".ec-switch-runs > .ec-run"), (group) => [group.getAttribute("data-key")!, group.querySelector("path")!.getAttribute("d")!]));
}

/** The points of a sampled polygon's path data. */
function points(d: string): Point[] {
  return Array.from(d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g), ([, x, y]) => ({ x: Number(x), y: Number(y) }));
}

const byKey = (marks: readonly MarkGeometry[]) => new Map(marks.map((mark) => [mark.key, mark]));
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const near = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) <= 0.0011 && Math.abs(a.y - b.y) <= 0.0011;
const round = (value: number): number => Math.round(value * 1000) / 1000;

/** The overlay's label copies that show now, by text. */
function labelsShown(overlay: SVGSVGElement): Map<string, Point> {
  const shown = Array.from(overlay.querySelectorAll(".ec-switch-labels > text")).filter((text) => text.getAttribute("visibility") !== "hidden");
  return new Map(shown.map((text) => [text.textContent!, { x: Number(text.getAttribute("x")), y: Number(text.getAttribute("y")) }]));
}

afterEach(() => {
  document.body.textContent = "";
});

describe("chartSwitch with morph(): a donut and its columns", () => {
  for (const align of ["unroll", "drop"] as const) {
    it(`morphs each slice into its column and back, half way between the two at half way (align: "${align}")`, async () => {
      const { switcher, overlay, donut, columns, clock } = setup(align);
      const slices = byKey(donut.marks());
      const bars = byKey(columns.marks());
      // The slice's point i meets the column's point i ("unroll"), or i + a quarter ("drop": the outer arc meets the top).
      const turn = align === "drop" ? QUARTER : 0;
      const halfway = (key: string): Point[] => {
        const a = slices.get(key)!.outline.sample(POINTS);
        const b = bars.get(key)!.outline.sample(POINTS);
        return a.map((p, i) => mid(p, b[(i + turn) % POINTS]!));
      };

      void switcher.show("columns");
      // At the start, the slices themselves.
      for (const [key, d] of shapes(overlay)) expect(d).toBe(slices.get(key)!.outline.d);
      clock.advance(475);
      const forward = shapes(overlay);
      expect([...forward.keys()]).toEqual(KEYS);
      for (const [key, d] of forward) {
        const drawn = points(d);
        expect(drawn).toHaveLength(POINTS);
        const expected = halfway(key);
        expect(drawn.every((p, i) => near(p, expected[i]!))).toBe(true);
      }
      // The labels half way too, showing the columns' text.
      const shownForward = labelsShown(overlay);
      const placed = (list: readonly ChartLabel[], key: string, role: ChartLabel["role"]) => list.find((label) => label.key === key && label.role === role)!;
      for (const key of KEYS) {
        for (const role of ["category", "value"] as const) {
          const from = placed(donut.labels(), key, role);
          const to = placed(columns.labels(), key, role);
          expect(shownForward.get(to.text)).toEqual({ x: round((from.x + to.x) / 2), y: round((from.y + to.y) / 2) });
        }
      }
      clock.advance(475);
      await flush();
      expect(overlay.querySelectorAll("path")).toHaveLength(0);
      expect(columns.element.classList.contains("ec-morphing")).toBe(false);

      // Back: the same picture at half way, so a switch back retraces the way it came.
      void switcher.show("donut");
      for (const [key, d] of shapes(overlay)) expect(d).toBe(bars.get(key)!.outline.d);
      clock.advance(475);
      expect(shapes(overlay)).toEqual(forward);
      clock.advance(475);
      await flush();
      expect(switcher.current).toBe("donut");
      expect(overlay.querySelectorAll("path")).toHaveLength(0);
    });
  }

  it('with align "drop", puts each slice\'s outer arc on its column\'s top, whichever way it goes', async () => {
    const { switcher, overlay, donut, columns, clock } = setup("drop");
    const slices = byKey(donut.marks());
    const bars = byKey(columns.marks());
    for (const key of KEYS) {
      const slice = slices.get(key)!;
      const bar = bars.get(key)!;
      const arc = slice.outline.sample(POINTS).slice(0, QUARTER);
      const top = bar.outline.sample(POINTS).slice(QUARTER, 2 * QUARTER);
      // The slice's first side is its outer arc; the column's second is its top, rounded corners and
      // all, from left to right.
      const radius = Math.max(...slice.outline.sample(POINTS).map((p) => Math.hypot(p.x - slice.pivot.x, p.y - slice.pivot.y)));
      for (const p of arc) expect(Math.hypot(p.x - slice.pivot.x, p.y - slice.pivot.y)).toBeCloseTo(radius, 6);
      for (const p of top) expect(p.y - bar.bounds.y).toBeLessThanOrEqual(4.001);
      expect(top.every((p, i) => i === 0 || p.x > top[i - 1]!.x)).toBe(true);
      expect(top[0]!.x).toBeCloseTo(bar.bounds.x, 6);
    }
    // Almost there each way: the arc's points lie by the top's, the top's by the arc's.
    const almost = (from: Map<string, MarkGeometry>, to: Map<string, MarkGeometry>, fromSide: number, toSide: number) => {
      for (const [key, d] of shapes(overlay)) {
        const drawn = points(d);
        const target = to.get(key)!.outline.sample(POINTS);
        const start = from.get(key)!.outline.sample(POINTS);
        for (let i = 0; i < QUARTER; i++) {
          // Point i of the path is the slice's arc point i heading for the column's top point i, wherever it began.
          const p = drawn[i]!;
          const goal = target[(toSide * QUARTER + i) % POINTS]!;
          const began = start[(fromSide * QUARTER + i) % POINTS]!;
          expect(Math.hypot(p.x - goal.x, p.y - goal.y)).toBeLessThan(Math.hypot(began.x - goal.x, began.y - goal.y) * 0.02 + 0.01);
        }
      }
    };
    void switcher.show("columns");
    clock.advance(900);
    almost(slices, bars, 0, 1);
    clock.advance(50);
    await flush();
    void switcher.show("donut");
    clock.advance(900);
    almost(bars, slices, 1, 0);
  });

  it("reverses a switch back mid-way from the shapes as drawn, with no jump", () => {
    for (const align of ["unroll", "drop"] as const) {
      const { switcher, overlay, clock } = setup(align);
      void switcher.show("columns");
      clock.advance(300);
      const before = shapes(overlay);
      const labels = labelsShown(overlay);
      void switcher.show("donut");
      // The clear and the reverse's first draw happen together: the same picture, to the last digit.
      expect(shapes(overlay)).toEqual(before);
      expect(labelsShown(overlay)).toEqual(labels);
      clock.advance(100);
      expect(shapes(overlay)).not.toEqual(before);
      document.body.textContent = "";
    }
  });
});

describe("chartSwitch from the package", () => {
  it("morphs with morph() when no transition is given", () => {
    const target = document.body.appendChild(document.createElement("div"));
    const colors = publicColors();
    const switcher = publicChartSwitch(target, {
      views: {
        donut: (el, shared) => publicDonut(el, { label: "Shot outcomes", data: outcomes, category: "outcome", value: "shots", colors: shared, width: 600 }),
        columns: (el, shared) => publicBar(el, { label: "Shot outcomes", data: outcomes, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors: shared, width: 600 })
      },
      initial: "donut",
      colors
    });
    void switcher.show("columns");
    // morph draws each slice's own outline on its first frame, in the slice's colour.
    const overlay = target.querySelector(".ec-switch-overlay") as SVGSVGElement;
    const slices = byKey(switcher.chart("donut").marks());
    const drawn = shapes(overlay);
    expect([...drawn.keys()]).toEqual(KEYS);
    for (const [key, d] of drawn) expect(d).toBe(slices.get(key)!.outline.d);
    switcher.destroy();
    expect(target.children).toHaveLength(0);
  });
});
