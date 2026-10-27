// chartSwitch on a donut and category columns sharing one colour assignment, with a recording
// transition effect: src/morph.test.ts switches the same charts with the real morph().

import { createMotion, easeInOutCubic, manualClock, type MarkGeometry, type MotionMode, type TransitionEffect } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { flush } from "../core/testing";
import { barChart } from "./bar";
import { colorAssignment, type ColorAssignment } from "./colors";
import { donutChart } from "./donut";
import { seriesColors, stylesheet } from "./render/theme";
import type { ChartEnv } from "./shell/setup";
import { chartSwitch, type ChartSwitchViews } from "./switch";

interface Outcome {
  readonly outcome: string;
  readonly shots: number;
}

/** The lab's card 3. */
const outcomes: Outcome[] = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];

interface Run {
  readonly from: MarkGeometry;
  readonly to: MarkGeometry;
  readonly start: number;
}

/** A transition that draws `from`'s outline and ends at once, so the switch's own timing decides when it lands; `end` draws `to`'s. */
function recorder() {
  const runs: Run[] = [];
  const ends: Run[] = [];
  let clears = 0;
  const effect: TransitionEffect = {
    kind: "transition",
    async run(from, to, ctx) {
      runs.push({ from, to, start: ctx.start });
      ctx.layer.path(from.outline.d, { fill: "mark" });
    },
    end(from, to, ctx) {
      ends.push({ from, to, start: ctx.start });
      ctx.layer.path(to.outline.d, { fill: "mark" });
    },
    clear() {
      clears++;
    }
  };
  return {
    effect,
    runs,
    ends,
    get clears() {
      return clears;
    }
  };
}

interface SetupOptions {
  readonly mode?: MotionMode;
  readonly announce?: boolean;
  /** The columns' rows. Default: the donut's. */
  readonly columns?: readonly Outcome[];
  /** A third view: horizontal bars. */
  readonly bars?: boolean;
}

function setup(options: SetupOptions = {}) {
  const clock = manualClock();
  const motion = createMotion({ mode: options.mode ?? "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const target = document.body.appendChild(document.createElement("div"));
  const transition = recorder();
  const colors = colorAssignment();
  const given: { readonly container: HTMLElement; readonly colors: ColorAssignment }[] = [];
  const views = {
    donut: (container: HTMLElement, shared: ColorAssignment) => {
      given.push({ container, colors: shared });
      return donutChart(container, { label: "Shot outcomes, share of total", data: outcomes, category: "outcome", value: "shots", colors: shared, width: 600 }, env);
    },
    columns: (container: HTMLElement, shared: ColorAssignment) => {
      given.push({ container, colors: shared });
      const data = options.columns ?? outcomes;
      return barChart(container, { label: "Shot outcomes, counts", data, x: "outcome", y: "shots", orientation: "vertical", colorBy: "category", colors: shared, width: 600 }, env);
    },
    ...(options.bars
      ? { bars: (container: HTMLElement, shared: ColorAssignment) => barChart(container, { label: "Shot outcomes, bars", data: outcomes, y: "outcome", x: "shots", colorBy: "category", colors: shared, width: 600 }, env) }
      : {})
  } satisfies ChartSwitchViews;
  const switcher = chartSwitch(target, { views, initial: "donut", transition: transition.effect, colors, announce: options.announce }, env);
  const wrapper = target.querySelector(":scope > .ec-switch") as HTMLDivElement;
  const container = (view: string) => wrapper.querySelector(`:scope > .ec-switch-view[data-view="${view}"]`) as HTMLDivElement;
  const overlay = wrapper.querySelector(":scope > .ec-switch-overlay") as SVGSVGElement;
  const donut = switcher.chart("donut");
  const columns = switcher.chart("columns");
  return { switcher, target, wrapper, container, overlay, donut, columns, clock, motion, env, transition, colors, given };
}

/** The switch's progress after `ms` of a switch from the start: morph's eased shape progress. */
const at = (ms: number): number => easeInOutCubic(ms / 950);
const mix = (x: number, y: number, s: number): number => x * (1 - s) + y * s;
const round = (value: number): number => Math.round(value * 1000) / 1000;
const number = (element: Element, name: string): number => Number(element.getAttribute(name));

/** The overlay's label copies by their text. */
function overlayLabels(overlay: SVGSVGElement): { readonly text: string; readonly x: number; readonly y: number; readonly shown: boolean; readonly opacity: string | null }[] {
  return Array.from(overlay.querySelectorAll(".ec-switch-labels > text"), (text) => ({
    text: text.textContent ?? "",
    x: number(text, "x"),
    y: number(text, "y"),
    shown: text.getAttribute("visibility") !== "hidden",
    opacity: text.getAttribute("opacity")
  }));
}

const shown = (element: Element) => getComputedStyle(element).visibility === "visible";

function pointer(type: string, target: Element, pointerType = "mouse"): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType }));
}

afterEach(() => {
  document.body.textContent = "";
  vi.unstubAllGlobals();
});

describe("chartSwitch: layout", () => {
  it("draws every view once, in its own container in one grid cell, with an aria-hidden overlay above them", () => {
    const { target, wrapper, container, overlay, donut, columns, given, colors } = setup();
    expect(Array.from(target.children)).toEqual([wrapper]);
    expect(Array.from(wrapper.children)).toEqual([container("donut"), container("columns"), overlay]);
    expect(given).toEqual([
      { container: container("donut"), colors },
      { container: container("columns"), colors }
    ]);
    expect(container("donut").contains(donut.element)).toBe(true);
    expect(container("columns").contains(columns.element)).toBe(true);
    expect(overlay.getAttribute("class")).toBe("ec-chart ec-switch-overlay");
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.children).toHaveLength(3);
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    // The stylesheet stacks the views in one cell and puts the overlay over them, taking no pointer events.
    expect(stylesheet).toContain(":where(.ec-switch) { display: grid; grid-template-columns: minmax(0, 1fr); position: relative; }");
    expect(stylesheet).toContain(":where(.ec-switch-view) { grid-area: 1 / 1; min-width: 0; }");
    expect(stylesheet).toContain(":where(.ec-switch-overlay) { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }");
  });

  it("keeps the inactive view laid out but hidden, inert and out of the accessibility tree", () => {
    const { switcher, container, donut, columns } = setup();
    expect(switcher.current).toBe("donut");
    const off = container("columns");
    expect(off.classList.contains("ec-switch-inactive")).toBe(true);
    expect(off.hasAttribute("inert")).toBe(true);
    expect(off.getAttribute("aria-hidden")).toBe("true");
    expect(Array.from(off.querySelectorAll("*")).filter(shown)).toEqual([]);
    // Laid out as if it were shown: its marks are ready for a switch.
    expect(columns.marks()).toHaveLength(4);
    expect(columns.element.getAttribute("viewBox")).toMatch(/^0 0 600 /);
    const on = container("donut");
    expect(on.hasAttribute("inert")).toBe(false);
    expect(on.hasAttribute("aria-hidden")).toBe(false);
    expect(shown(donut.element.querySelector(".ec-mark")!)).toBe(true);
  });

  it("colours each key the same in every view, through the one assignment", () => {
    const { donut, columns, colors } = setup();
    for (const key of ["Goal", "Saved", "Off target", "Blocked"]) {
      const slice = donut.element.querySelector(`.ec-mark[data-key="${key}"] .ec-slice`) as SVGElement;
      const column = columns.element.querySelector(`.ec-mark[data-key="${key}"] .ec-segment`) as SVGElement;
      expect(slice.style.getPropertyValue("--ec-mark")).toBe(seriesColors(colors.slot(key)).color);
      expect(column.style.getPropertyValue("--ec-mark")).toBe(slice.style.getPropertyValue("--ec-mark"));
    }
  });

  it("makes a new assignment when none is given, and hands it to every view", () => {
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: createMotion({ mode: "off" }), clock: manualClock() };
    const given: ColorAssignment[] = [];
    const draw = (container: HTMLElement, colors: ColorAssignment) => {
      given.push(colors);
      return donutChart(container, { label: "Shots", data: outcomes, category: "outcome", value: "shots", colors }, env);
    };
    chartSwitch(document.body.appendChild(document.createElement("div")), { views: { a: draw, b: draw }, initial: "a", transition: recorder().effect, colors: { Saved: 7 } }, env);
    expect(given).toHaveLength(2);
    expect(given[0]).toBe(given[1]);
    expect(given[0]!.slot("Saved")).toBe(7);
  });
});

describe("chartSwitch: a switch", () => {
  it("hides both views' marks and morphs each pair, matched by key, in the overlay in its key's colour", async () => {
    const { switcher, container, overlay, donut, columns, clock, transition, colors } = setup();
    const landed = vi.fn();
    void switcher.show("columns").then(landed);
    expect(switcher.current).toBe("columns");
    for (const view of ["donut", "columns"]) {
      expect(container(view).classList.contains("ec-switching")).toBe(true);
      expect(container(view).hasAttribute("inert")).toBe(true);
    }
    expect(donut.element.classList.contains("ec-morphing")).toBe(true);
    expect(columns.element.classList.contains("ec-morphing")).toBe(true);
    // The new view is shown, its marks hidden.
    expect(container("columns").classList.contains("ec-switch-inactive")).toBe(false);
    expect(shown(columns.element.querySelector(".ec-axis")!)).toBe(true);
    expect(shown(columns.element.querySelector(".ec-marks")!)).toBe(false);
    // Every pair, by key, from the slice to its column, in the columns' order, from the start.
    expect(transition.runs.map((run) => [run.from.key, run.to.key, run.start])).toEqual([
      ["Goal", "Goal", 0],
      ["Saved", "Saved", 0],
      ["Off target", "Off target", 0],
      ["Blocked", "Blocked", 0]
    ]);
    const marksOf = (chart: { marks(): readonly MarkGeometry[] }) => new Map(chart.marks().map((mark) => [mark.key, mark]));
    const slices = marksOf(donut);
    const bars = marksOf(columns);
    for (const run of transition.runs) {
      expect(run.from.outline.d).toBe(slices.get(run.from.key)!.outline.d);
      expect(run.to.outline.d).toBe(bars.get(run.to.key)!.outline.d);
    }
    const groups = Array.from(overlay.querySelectorAll(".ec-switch-runs > .ec-run"));
    expect(groups.map((group) => group.getAttribute("data-key"))).toEqual(["Goal", "Saved", "Off target", "Blocked"]);
    for (const group of groups) expect((group as SVGGElement).style.getPropertyValue("--ec-mark")).toBe(seriesColors(colors.slot(group.getAttribute("data-key")!)).color);

    clock.advance(500);
    await flush();
    expect(landed).not.toHaveBeenCalled();
    clock.advance(450);
    await flush();
    expect(landed).toHaveBeenCalledTimes(1);
    // Landed: the overlay is empty, the columns' marks show, and the donut is the inactive view.
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    expect(transition.clears).toBe(4);
    expect(columns.element.classList.contains("ec-morphing")).toBe(false);
    expect(donut.element.classList.contains("ec-morphing")).toBe(false);
    expect(shown(columns.element.querySelector(".ec-marks")!)).toBe(true);
    const off = container("donut");
    expect([off.classList.contains("ec-switch-inactive"), off.hasAttribute("inert"), off.getAttribute("aria-hidden")]).toEqual([true, true, "true"]);
    const on = container("columns");
    expect([on.className, on.hasAttribute("inert"), on.hasAttribute("aria-hidden"), on.style.opacity]).toEqual(["ec-switch-view", false, false, ""]);
    expect(off.style.opacity).toBe("");
    expect(clock.idle).toBe(true);
  });

  it("switches back the same way, from the columns to the slices", async () => {
    const { switcher, container, clock, transition } = setup();
    void switcher.show("columns");
    clock.advance(950);
    await flush();
    transition.runs.length = 0;
    const landed = vi.fn();
    void switcher.show("donut").then(landed);
    expect(switcher.current).toBe("donut");
    expect(transition.runs.map((run) => [run.from.key, run.to.key, run.start])).toEqual([
      ["Goal", "Goal", 0],
      ["Saved", "Saved", 0],
      ["Off target", "Off target", 0],
      ["Blocked", "Blocked", 0]
    ]);
    // From a column (no pivot to go round) to a slice.
    expect(transition.runs[0]!.from.bounds.width).toBeLessThan(transition.runs[0]!.to.bounds.width + 200);
    clock.advance(950);
    await flush();
    expect(landed).toHaveBeenCalledTimes(1);
    expect(container("donut").classList.contains("ec-switch-inactive")).toBe(false);
    expect(container("columns").classList.contains("ec-switch-inactive")).toBe(true);
  });

  it("takes 950 ms in Presentation and 200 ms in Analysis, in one stage", async () => {
    for (const [mode, ms] of [
      ["presentation", 950],
      ["analysis", 200]
    ] as const) {
      const { switcher, clock } = setup({ mode });
      const landed = vi.fn();
      void switcher.show("columns").then(landed);
      clock.advance(ms - 1);
      await flush();
      expect(landed).not.toHaveBeenCalled();
      clock.advance(1);
      await flush();
      expect(landed).toHaveBeenCalledTimes(1);
      document.body.textContent = "";
    }
  });

  it("keeps its own schedule with a transition that takes longer, and lands once that has ended too", async () => {
    const clock = manualClock();
    const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
    const starts: number[] = [];
    // 1500 ms, linear: not the switch's schedule, which an effect can't tell it about.
    const slow: TransitionEffect = {
      kind: "transition",
      async run(from, _to, ctx) {
        starts.push(ctx.start);
        ctx.layer.path(from.outline.d, { fill: "mark" });
        await ctx.tween({ duration: 1500, ease: (k) => k, update: () => {} }).finished;
      },
      end() {},
      clear() {}
    };
    const draw = (container: HTMLElement, colors: ColorAssignment) => donutChart(container, { label: "Shots", data: outcomes, category: "outcome", value: "shots", colors, width: 600 }, env);
    const target = document.body.appendChild(document.createElement("div"));
    const switcher = chartSwitch(target, { views: { a: draw, b: draw }, initial: "a", transition: slow }, env);
    const landed = vi.fn();
    void switcher.show("b").then(landed);
    clock.advance(950);
    await flush();
    // The labels and fades are done; the pairs still play.
    expect(landed).not.toHaveBeenCalled();
    expect(target.querySelectorAll(".ec-switch-runs > .ec-run")).toHaveLength(4);
    clock.advance(550);
    await flush();
    expect(landed).toHaveBeenCalledTimes(1);
    expect(target.querySelectorAll(".ec-switch-runs > .ec-run")).toHaveLength(0);
    // A switch back starts the effect from the switch's own progress, not the effect's.
    void switcher.show("a");
    clock.advance(300);
    starts.length = 0;
    void switcher.show("b");
    expect(starts).toEqual([1, 1, 1, 1].map(() => expect.closeTo(1 - at(300), 9)));
  });

  it("does nothing for the view already shown, and returns the same promise for the view a switch is heading for", async () => {
    const { switcher, clock, transition } = setup();
    await expect(switcher.show("donut")).resolves.toBeUndefined();
    expect(transition.runs).toHaveLength(0);
    const first = switcher.show("columns");
    expect(switcher.show("columns")).toBe(first);
    expect(transition.runs).toHaveLength(4);
    clock.advance(950);
    await flush();
    await expect(first).resolves.toBeUndefined();
  });

  it("moves each label from its place to its partner's, matched by key and role, and swaps its text half way", () => {
    const { switcher, overlay, donut, columns, clock } = setup();
    const from = donut.labels();
    const to = columns.labels();
    void switcher.show("columns");
    // One copy of each label in each view; before half way the slice's text shows, where the slice's label is.
    const labels = overlayLabels(overlay);
    expect(labels).toHaveLength(from.length + to.length);
    const goal = (role: string, list: typeof from) => list.find((label) => label.key === "Goal" && label.role === role)!;
    const share = goal("value", from);
    const count = goal("value", to);
    expect(share.text).toBe("14%");
    expect(count.text).toBe("58");
    const copy = (text: string) => overlayLabels(overlay).find((label) => label.text === text)!;
    expect(copy("14%")).toMatchObject({ x: round(share.x), y: round(share.y), shown: true });
    expect(copy("58")).toMatchObject({ x: round(share.x), y: round(share.y), shown: false });

    // A third of the way: still the share, part way to the count's place.
    clock.advance(300);
    let s = at(300);
    expect(s).toBeLessThan(0.5);
    expect(copy("14%")).toMatchObject({ x: round(mix(share.x, count.x, s)), y: round(mix(share.y, count.y, s)), shown: true });
    expect(copy("58").shown).toBe(false);
    // Past half way: the count, in the same place.
    clock.advance(300);
    s = at(600);
    expect(copy("58")).toMatchObject({ x: round(mix(share.x, count.x, s)), y: round(mix(share.y, count.y, s)), shown: true });
    expect(copy("14%").shown).toBe(false);
    // The category label moves with its slice too, the column's copy anchored as the column's is.
    const name = overlay.querySelectorAll(".ec-switch-labels > text.ec-label");
    expect(Array.from(name, (text) => text.textContent)).toEqual(expect.arrayContaining(["Goal", "Blocked"]));
    const columnName = Array.from(name).find((text) => text.textContent === "Goal" && text.getAttribute("visibility") !== "hidden")!;
    expect(columnName.getAttribute("text-anchor")).toBe(goal("category", to).anchor);
  });

  it("fades the old view's other parts out by 40% of the way and the new one's in from half way", () => {
    const { switcher, container, clock } = setup();
    void switcher.show("columns");
    const opacities = () => [container("donut").style.opacity, container("columns").style.opacity].map(Number);
    expect(opacities()).toEqual([1, 0]);
    clock.advance(300);
    expect(opacities()).toEqual([round(1 - at(300) / 0.4), 0]);
    clock.advance(160);
    expect(at(460)).toBeGreaterThan(0.4);
    expect(at(460)).toBeLessThan(0.5);
    expect(opacities()).toEqual([0, 0]);
    clock.advance(240);
    expect(opacities()).toEqual([0, round((at(700) - 0.5) / 0.5)]);
  });
});

describe("chartSwitch: unmatched keys", () => {
  it("fades a key in only one view where it stands: out over the first half, in over the second", () => {
    const columns = [...outcomes.slice(0, 3), { outcome: "Woodwork", shots: 9 }];
    const { switcher, overlay, donut, clock, transition, colors } = setup({ columns });
    void switcher.show("columns");
    expect(transition.runs.map((run) => run.to.key)).toEqual(["Goal", "Saved", "Off target"]);
    const fade = (key: string) => overlay.querySelector(`.ec-switch-fades > .ec-switch-fade[data-key="${key}"]`) as SVGGElement;
    const blocked = donut.marks().find((mark) => mark.key === "Blocked")!;
    expect(fade("Blocked").querySelector("path")!.getAttribute("d")).toBe(blocked.outline.d);
    expect(fade("Blocked").style.getPropertyValue("--ec-mark")).toBe(seriesColors(colors.slot("Blocked")).color);
    const opacity = (key: string) => Number(fade(key).getAttribute("opacity"));
    expect([opacity("Blocked"), opacity("Woodwork")]).toEqual([1, 0]);
    clock.advance(300);
    expect([opacity("Blocked"), opacity("Woodwork")]).toEqual([round(1 - at(300) / 0.5), 0]);
    clock.advance(400);
    expect([opacity("Blocked"), opacity("Woodwork")]).toEqual([0, round((at(700) - 0.5) / 0.5)]);
    // Their labels fade with them.
    const label = (text: string) => overlayLabels(overlay).find((each) => each.text === text)!;
    expect(label("Blocked").opacity).toBe("0");
    expect(label("Woodwork").opacity).toBe(String(round((at(700) - 0.5) / 0.5)));
  });
});

describe("chartSwitch: interrupting", () => {
  it("reverses a switch back mid-way from the progress the shapes reached, with no jump, and takes the rest of the time", async () => {
    const { switcher, container, overlay, clock, transition } = setup();
    const first = vi.fn();
    void switcher.show("columns").then(first);
    clock.advance(300);
    const p = at(300);
    const before = { labels: overlayLabels(overlay), opacity: [container("donut").style.opacity, container("columns").style.opacity] };
    transition.runs.length = 0;
    const back = vi.fn();
    void switcher.show("donut").then(back);
    expect(switcher.current).toBe("donut");
    await flush();
    // The first show() was replaced.
    expect(first).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    // The pairs play back from the columns to the slices, from where they had got to.
    expect(transition.clears).toBe(4);
    expect(transition.runs.map((run) => [run.from.key, run.to.key])).toEqual([
      ["Goal", "Goal"],
      ["Saved", "Saved"],
      ["Off target", "Off target"],
      ["Blocked", "Blocked"]
    ]);
    for (const run of transition.runs) expect(run.start).toBeCloseTo(1 - p, 12);
    // Everything drawn with them is where it was.
    expect(overlayLabels(overlay)).toEqual(before.labels);
    expect([container("donut").style.opacity, container("columns").style.opacity]).toEqual(before.opacity);
    // Back the way it came: 300 ms to the donut (on the frame that reaches it: the progress adds up to a hair under 1).
    clock.advance(150);
    expect(Number(container("donut").style.opacity)).toBeGreaterThan(Number(before.opacity[0]));
    clock.advance(149);
    await flush();
    expect(back).not.toHaveBeenCalled();
    clock.advance(16);
    await flush();
    expect(back).toHaveBeenCalledTimes(1);
    expect(container("donut").classList.contains("ec-switch-inactive")).toBe(false);
    expect(container("columns").classList.contains("ec-switch-inactive")).toBe(true);
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
  });

  it("reverses a reverse too, from where it has got to", async () => {
    const { switcher, clock, transition } = setup();
    void switcher.show("columns");
    clock.advance(400);
    void switcher.show("donut");
    // Back from 1 - at(400); after 100 ms more the shapes are at easeInOutCubic(unease(1 - at(400)) + 100 / 950).
    clock.advance(100);
    const reached = easeInOutCubic(1 - 400 / 950 + 100 / 950);
    transition.runs.length = 0;
    const landed = vi.fn();
    void switcher.show("columns").then(landed);
    expect(switcher.current).toBe("columns");
    for (const run of transition.runs) expect([run.from.key === run.to.key, run.start]).toEqual([true, expect.closeTo(1 - reached, 9)]);
    // The shapes are 300 ms of 950 from the donut: the rest of the way to the columns takes 650 ms.
    clock.advance(649);
    await flush();
    expect(landed).not.toHaveBeenCalled();
    clock.advance(16);
    await flush();
    expect(landed).toHaveBeenCalledTimes(1);
  });

  it("lands at once on a switch back before the shapes have moved", async () => {
    const { switcher, container, overlay, transition } = setup();
    const first = vi.fn();
    void switcher.show("columns").then(first);
    transition.runs.length = 0;
    const back = switcher.show("donut");
    expect(transition.runs).toHaveLength(0);
    expect(container("donut").classList.contains("ec-switch-inactive")).toBe(false);
    expect(container("columns").classList.contains("ec-switch-inactive")).toBe(true);
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    await back;
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("lands a switch first when show() asks for a third view, then switches from there", async () => {
    const { switcher, container, clock, transition } = setup({ bars: true });
    const first = vi.fn();
    void switcher.show("columns").then(first);
    clock.advance(300);
    transition.runs.length = 0;
    const third = vi.fn();
    void switcher.show("bars").then(third);
    expect(switcher.current).toBe("bars");
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    // From the columns, landed, to the bars, from the start.
    expect(transition.runs.map((run) => [run.from.key, run.start])).toEqual([
      ["Goal", 0],
      ["Saved", 0],
      ["Off target", 0],
      ["Blocked", 0]
    ]);
    const columns = switcher.chart("columns").marks();
    expect(transition.runs[0]!.from.outline.d).toBe(columns[0]!.outline.d);
    expect(container("donut").classList.contains("ec-switch-inactive")).toBe(true);
    expect(container("columns").classList.contains("ec-switching")).toBe(true);
    expect(container("bars").classList.contains("ec-switching")).toBe(true);
    clock.advance(950);
    await flush();
    expect(third).toHaveBeenCalledTimes(1);
    expect(["donut", "columns", "bars"].map((view) => container(view).classList.contains("ec-switch-inactive"))).toEqual([true, true, false]);
  });

  it("lands a switch when the cell is resized", async () => {
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
    const { switcher, wrapper, container, overlay, clock } = setup();
    const watcher = observers.find((observer) => observer.target === wrapper)!;
    const resize = (width: number) => watcher.callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    // The first observation is the width to compare with.
    resize(600);
    const landed = vi.fn();
    void switcher.show("columns").then(landed);
    clock.advance(300);
    resize(600.2);
    expect(container("columns").classList.contains("ec-switching")).toBe(true);
    resize(480);
    expect(container("columns").classList.contains("ec-switching")).toBe(false);
    expect(container("donut").classList.contains("ec-switch-inactive")).toBe(true);
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    await flush();
    expect(landed).toHaveBeenCalledTimes(1);
    expect(clock.idle).toBe(true);
    // Resizes at rest do nothing.
    resize(400);
    expect(container("columns").classList.contains("ec-switch-inactive")).toBe(false);
  });
});

describe("chartSwitch: motion off", () => {
  it("lands before show() returns, without playing the transition", async () => {
    const { switcher, container, overlay, clock, transition } = setup({ mode: "off" });
    const shown = switcher.show("columns");
    expect(switcher.current).toBe("columns");
    expect(container("donut").classList.contains("ec-switch-inactive")).toBe(true);
    expect(container("columns").classList.contains("ec-switch-inactive")).toBe(false);
    expect(container("columns").hasAttribute("inert")).toBe(false);
    expect(switcher.chart("columns").element.classList.contains("ec-morphing")).toBe(false);
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    expect(transition.runs).toHaveLength(0);
    expect(clock.idle).toBe(true);
    await expect(shown).resolves.toBeUndefined();
  });

  it("lands a switch at once when motion turns off mid-way", async () => {
    const { switcher, container, overlay, clock, motion } = setup();
    const landed = vi.fn();
    void switcher.show("columns").then(landed);
    clock.advance(300);
    motion.setMode("off");
    expect(container("columns").classList.contains("ec-switching")).toBe(false);
    expect(container("donut").classList.contains("ec-switch-inactive")).toBe(true);
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    await flush();
    expect(landed).toHaveBeenCalledTimes(1);
  });
});

describe("chartSwitch: hover and focus", () => {
  it("ends the old view's hover before the switch", () => {
    const { switcher, donut } = setup();
    const leave = vi.fn();
    donut.on("leave", leave);
    pointer("pointerover", donut.element.querySelector('.ec-mark[data-key="Saved"] .ec-hit')!);
    expect(donut.element.classList.contains("ec-hovering")).toBe(true);
    void switcher.show("columns");
    expect(leave).toHaveBeenCalledTimes(1);
    expect(leave.mock.calls[0]![0].mark.key).toBe("Saved");
    expect(donut.element.classList.contains("ec-hovering")).toBe(false);
  });

  it("ends the old view's hover with its leave(), and only the old view's", () => {
    const { switcher, donut, columns, clock } = setup();
    const leaveDonut = vi.spyOn(donut, "leave");
    const leaveColumns = vi.spyOn(columns, "leave");
    void switcher.show("columns");
    expect(leaveDonut).toHaveBeenCalledTimes(1);
    expect(leaveColumns).not.toHaveBeenCalled();
    // Back mid-way: a reverse plays on, with no hover to end.
    clock.advance(300);
    void switcher.show("donut");
    expect(leaveDonut).toHaveBeenCalledTimes(1);
    expect(leaveColumns).not.toHaveBeenCalled();
  });

  it("moves focus on a mark to the same key in the new view once the switch lands", async () => {
    const { switcher, donut, columns, clock } = setup();
    donut.focus("Saved");
    expect(document.activeElement?.getAttribute("data-key")).toBe("Saved");
    const leave = vi.fn();
    donut.on("leave", leave);
    void switcher.show("columns");
    // Read before anything was hidden, then the keyboard hover ended. Focus stays put: a browser takes
    // it off the view once it's inert (jsdom doesn't).
    expect(leave).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.getAttribute("data-key")).toBe("Saved");
    clock.advance(950);
    await flush();
    expect(columns.element.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("data-key")).toBe("Saved");
    // As a key press would: the ring shows.
    expect(columns.element.querySelector(".ec-focus")!.getAttribute("visibility")).toBeNull();
  });

  it("moves focus to the new view's first mark when it doesn't have the key", async () => {
    const { switcher, donut, columns, clock } = setup({ columns: outcomes.slice(0, 3) });
    donut.focus("Blocked");
    void switcher.show("columns");
    clock.advance(950);
    await flush();
    expect(columns.element.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("data-key")).toBe("Goal");
  });

  it("brings focus back to its key when a switch is reversed, and leaves focus that moved on outside the switch", async () => {
    const { switcher, donut, clock } = setup();
    donut.focus("Off target");
    void switcher.show("columns");
    clock.advance(200);
    void switcher.show("donut");
    clock.advance(200);
    await flush();
    expect(document.activeElement?.getAttribute("data-key")).toBe("Off target");
    expect(donut.element.contains(document.activeElement)).toBe(true);

    void switcher.show("columns");
    const button = document.body.appendChild(document.createElement("button"));
    button.focus();
    clock.advance(950);
    await flush();
    expect(document.activeElement).toBe(button);
  });

  it("leaves focus alone when it wasn't in the old view", async () => {
    const { switcher, clock } = setup();
    const button = document.body.appendChild(document.createElement("button"));
    button.focus();
    void switcher.show("columns");
    expect(document.activeElement).toBe(button);
    clock.advance(950);
    await flush();
    expect(document.activeElement).toBe(button);
  });

  it("moves focus with motion off too", () => {
    const { switcher, donut, columns } = setup({ mode: "off" });
    donut.focus("Goal");
    void switcher.show("columns");
    expect(columns.element.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("data-key")).toBe("Goal");
  });
});

describe("chartSwitch: the view on show", () => {
  const hover = (chart: { readonly element: Element }, key: string) => pointer("pointerover", chart.element.querySelector(`.ec-mark[data-key="${key}"] :is(.ec-hit, .ec-segment)`)!);

  it("gives the view on show's marks, and while a switch plays the marks of the view it's heading for", async () => {
    const { switcher, donut, columns, clock } = setup();
    expect(switcher.marks()).toEqual(donut.marks());
    void switcher.show("columns");
    clock.advance(300);
    expect(switcher.marks()).toEqual(columns.marks());
    clock.advance(650);
    await flush();
    expect(switcher.marks()).toEqual(columns.marks());
  });

  it("hears the view on show's events with on(), and only its", async () => {
    const { switcher, donut, columns, clock } = setup();
    const heard: string[] = [];
    const stop = switcher.on("hover", (event) => heard.push(`hover ${event.mark.key} ${event.data.datum.outcome}`));
    switcher.on("leave", (event) => heard.push(`leave ${event.mark.key}`));
    hover(donut, "Saved");
    // The hidden view's (jsdom doesn't make it inert, as a browser does).
    hover(columns, "Goal");
    expect(heard).toEqual(["hover Saved Saved"]);
    pointer("pointerleave", columns.element);
    // The donut's hover ends as the switch starts, while it's still the view on show.
    void switcher.show("columns");
    expect(heard).toEqual(["hover Saved Saved", "leave Saved"]);
    clock.advance(950);
    await flush();
    hover(columns, "Blocked");
    hover(donut, "Goal");
    expect(heard.slice(2)).toEqual(["hover Blocked Blocked"]);
    stop();
    pointer("pointerleave", donut.element);
    hover(columns, "Saved");
    expect(heard.slice(3)).toEqual(["leave Blocked"]);
  });

  it("ends the view on show's hover with leave(), and only its", async () => {
    const { switcher, donut, columns, clock } = setup();
    const leaveDonut = vi.spyOn(donut, "leave");
    const leaveColumns = vi.spyOn(columns, "leave");
    hover(donut, "Goal");
    switcher.leave();
    expect(donut.element.querySelector(".ec-hot")).toBeNull();
    expect(donut.element.classList.contains("ec-hovering")).toBe(false);
    expect(leaveDonut).toHaveBeenCalledTimes(1);
    expect(() => switcher.leave()).not.toThrow();
    void switcher.show("columns");
    clock.advance(950);
    await flush();
    leaveDonut.mockClear();
    switcher.leave();
    expect(leaveColumns).toHaveBeenCalledTimes(1);
    expect(leaveDonut).not.toHaveBeenCalled();
  });
});

describe("chartSwitch: announce", () => {
  it("says the new view's label in a polite live region after each switch", async () => {
    const { switcher, wrapper, clock } = setup({ announce: true });
    const region = wrapper.querySelector(':scope > [role="status"]')!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
    void switcher.show("columns");
    clock.advance(500);
    expect(region.textContent).toBe("");
    clock.advance(450);
    await flush();
    expect(region.textContent?.trim()).toBe("Shot outcomes, counts");
    void switcher.show("donut");
    clock.advance(950);
    await flush();
    expect(region.textContent?.trim()).toBe("Shot outcomes, share of total");
  });

  it("announces nothing by default", async () => {
    const { switcher, wrapper, clock } = setup();
    expect(wrapper.querySelector('[role="status"]:not(.ec-chart *)')).toBeNull();
    void switcher.show("columns");
    clock.advance(950);
    await flush();
    expect(wrapper.querySelector(".ec-switch > .ec-announcer")).toBeNull();
  });
});

describe("chartSwitch: coordinates", () => {
  it("maps each view's marks and labels into the overlay's px from where its <svg> sits", () => {
    // Where layout puts them: the overlay at the cell's corner, the donut 40 px down, the columns drawn at half size.
    const ctm = new Map<string, DOMMatrix2DInit>([
      ["ec-switch-overlay", { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 }],
      ["ec-donut-chart", { a: 1, b: 0, c: 0, d: 1, e: 10, f: 60 }],
      ["ec-bar-chart", { a: 0.5, b: 0, c: 0, d: 0.5, e: 10, f: 50 }]
    ]);
    const proto = SVGElement.prototype as unknown as { getScreenCTM?: () => unknown };
    proto.getScreenCTM = function (this: SVGElement) {
      const found = Array.from(ctm).find(([name]) => this.classList.contains(name));
      return found ? found[1] : null;
    };
    try {
      const { switcher, overlay, donut, columns, transition } = setup();
      const slice = donut.marks()[0]!;
      const column = columns.marks()[0]!;
      const share = donut.labels().find((label) => label.role === "value")!;
      void switcher.show("columns");
      const { from, to } = transition.runs[0]!;
      expect(from.center).toEqual({ x: slice.center.x, y: slice.center.y + 40 });
      expect(to.center).toEqual({ x: column.center.x / 2, y: column.center.y / 2 + 30 });
      expect(to.thickness).toBe(column.thickness / 2);
      expect(to.bounds).toEqual({ x: round(column.bounds.x / 2), y: round(column.bounds.y / 2 + 30), width: round(column.bounds.width / 2), height: round(column.bounds.height / 2) });
      expect(to.outline.sample(8)).toEqual(column.outline.sample(8).map((p) => ({ x: p.x / 2, y: p.y / 2 + 30 })));
      // Path data moves too, arcs and all.
      expect(from.outline.d).toMatch(/A/);
      expect(from.outline.sample(4)[0]).toEqual({ x: slice.outline.sample(4)[0]!.x, y: slice.outline.sample(4)[0]!.y + 40 });
      expect(from.path(0.5)).toEqual({ x: slice.path(0.5).x, y: slice.path(0.5).y + 40 });
      expect(from.angle(0.5)).toBeCloseTo(slice.angle(0.5), 12);
      expect(from.length).toBe(slice.length);
      const copy = overlayLabels(overlay).find((label) => label.text === share.text)!;
      expect(copy).toMatchObject({ x: round(share.x), y: round(share.y + 40) });
    } finally {
      delete proto.getScreenCTM;
    }
  });
});

describe("chartSwitch: destroy", () => {
  it("ends a switch, destroys every view's chart and removes everything it added", async () => {
    const { switcher, target, donut, columns, clock, transition, motion } = setup({ announce: true });
    const landed = vi.fn();
    void switcher.show("columns").then(landed);
    clock.advance(300);
    switcher.destroy();
    expect(target.children).toHaveLength(0);
    expect(donut.element.isConnected).toBe(false);
    expect(columns.element.isConnected).toBe(false);
    expect(transition.clears).toBe(4);
    await flush();
    expect(landed).toHaveBeenCalledTimes(1);
    expect(clock.idle).toBe(true);
    // Nothing listens any more.
    expect(() => motion.setMode("off")).not.toThrow();
    await expect(switcher.show("donut")).resolves.toBeUndefined();
    expect(target.children).toHaveLength(0);
    expect(() => switcher.destroy()).not.toThrow();
  });
});

describe("chartSwitch: checks", () => {
  const env = (): ChartEnv => ({ presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: createMotion({ mode: "off" }), clock: manualClock() });
  const draw = (container: HTMLElement) => donutChart(container, { label: "Shots", data: outcomes, category: "outcome", value: "shots" }, env());
  const place = () => document.body.appendChild(document.createElement("div"));

  it("throws on options that aren't a switch's, leaving nothing behind", () => {
    const transition = recorder().effect;
    const target = place();
    const make = (options: unknown) => () => chartSwitch(target, options as never, env());
    expect(make(undefined)).toThrow(new TypeError("chartSwitch needs options."));
    expect(make({ initial: "a", transition })).toThrow(/needs views/);
    expect(make({ views: {}, initial: "a", transition })).toThrow(/at least one view/);
    expect(make({ views: { a: "donut" }, initial: "a", transition })).toThrow(/views\.a must be a function/);
    expect(make({ views: { a: draw }, initial: "b", transition })).toThrow(new TypeError('chartSwitch: initial must be one of the views ("a"), got "b".'));
    expect(make({ views: { a: draw }, initial: "a" })).toThrow(new TypeError("chartSwitch: transition must be a transition effect, such as morph()."));
    expect(make({ views: { a: draw }, initial: "a", transition: { kind: "geometry", run() {}, end() {}, clear() {} } })).toThrow(/transition effect/);
    expect(make({ views: { a: draw }, initial: "a", transition, announce: "yes" })).toThrow(/announce must be true or false/);
    expect(() => chartSwitch("#nowhere", { views: { a: draw }, initial: "a", transition }, env())).toThrow(/no element matches/);
    expect(target.children).toHaveLength(0);
  });

  it("throws when a view's function doesn't return its chart, destroying the views it drew", () => {
    const target = place();
    let drawn: ReturnType<typeof draw> | undefined;
    const first = (container: HTMLElement) => (drawn = draw(container));
    const make = (other: unknown) => () => chartSwitch(target, { views: { a: first, b: other as typeof first }, initial: "a", transition: recorder().effect }, env());
    expect(make(() => ({}))).toThrow(/views\.b must return the chart it draws in the container it's given \(with element, marks\(\), labels\(\), focus\(\), leave\(\) and destroy\(\)\)/);
    expect(drawn!.element.isConnected).toBe(false);
    // A view needs leave(), to end its hover.
    expect(make((container: HTMLElement) => ({ ...draw(container), leave: undefined }))).toThrow(/views\.b must return/);
    expect(target.children).toHaveLength(0);
    // A chart drawn somewhere else isn't the view's.
    expect(make(() => draw(place()))).toThrow(/views\.b must return/);
    expect(target.children).toHaveLength(0);
    expect(make(() => {
      throw new RangeError("broken");
    })).toThrow(new RangeError("broken"));
    expect(target.children).toHaveLength(0);
  });

  it("rejects show() for a view it doesn't have, and chart() throws", async () => {
    const switcher = chartSwitch(place(), { views: { a: draw, b: draw }, initial: "a", transition: recorder().effect }, env());
    await expect(switcher.show("c" as "a")).rejects.toThrow(new TypeError('chartSwitch: there\'s no view "c". The views are "a", "b".'));
    expect(() => switcher.chart("c" as "a")).toThrow(/there's no view "c"/);
    expect(switcher.current).toBe("a");
  });
});
