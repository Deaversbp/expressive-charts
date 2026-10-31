// chartSwitch on a donut and category columns sharing one colour assignment, with a recording
// transition effect: src/morph.test.ts switches the same charts with the real morph(). Below them,
// line charts and columns keyed as their points (M11 step 1): src/line-switch.test.ts switches
// those with morph(). Last, a line's end dot and a point's ring, and the tab stop following when
// focus is outside the switch (M12 step 1).

import { createMotion, easeInOutCubic, manualClock, type MarkGeometry, type MotionMode, type TransitionEffect } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { flush } from "../core/testing";
import { barChart } from "./bar";
import { colorAssignment, type ColorAssignment } from "./colors";
import { donutChart } from "./donut";
import { lineChart } from "./line";
import { link } from "./link";
import { seriesColors, stylesheet } from "./render/theme";
import type { ChartEnv } from "./shell/setup";
import { chartSwitch, type ChartSwitchView, type ChartSwitchViews } from "./switch";

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

  it("runs a show() a leave listener calls as a switch starts once the switch has begun, as one switch", async () => {
    const { switcher, donut, container, clock, transition } = setup();
    pointer("pointerover", donut.element.querySelector('.ec-mark[data-key="Saved"] .ec-hit')!);
    let again: Promise<void> | undefined;
    donut.on("leave", () => {
      // The old view is still the view on show here.
      expect(switcher.current).toBe("donut");
      again ??= switcher.show("columns");
    });
    const landed = vi.fn();
    const landedAgain = vi.fn();
    void switcher.show("columns").then(landed);
    void again!.then(landedAgain);
    expect(transition.runs).toHaveLength(4);
    clock.advance(950);
    await flush();
    expect(landed).toHaveBeenCalledTimes(1);
    expect(landedAgain).toHaveBeenCalledTimes(1);
    expect(transition.runs).toHaveLength(4);
    expect(clock.idle).toBe(true);
    expect(container("columns").classList.contains("ec-switch-inactive")).toBe(false);
    expect(container("donut").classList.contains("ec-switch-inactive")).toBe(true);
  });

  it("switches back when a leave listener asks for the view a switch is leaving, and stops when one destroys the switch", async () => {
    const { switcher, donut, container, clock } = setup();
    pointer("pointerover", donut.element.querySelector('.ec-mark[data-key="Goal"] .ec-hit')!);
    const stop = donut.on("leave", () => void switcher.show("donut"));
    void switcher.show("columns");
    await flush();
    // Back before the shapes have moved: it lands where it began at once.
    expect(switcher.current).toBe("donut");
    expect(container("donut").classList.contains("ec-switch-inactive")).toBe(false);
    expect(container("columns").classList.contains("ec-switch-inactive")).toBe(true);
    expect(clock.idle).toBe(true);
    stop();

    const destroyed = setup();
    pointer("pointerover", destroyed.donut.element.querySelector('.ec-mark[data-key="Goal"] .ec-hit')!);
    destroyed.donut.on("leave", () => destroyed.switcher.destroy());
    await expect(destroyed.switcher.show("columns")).resolves.toBeUndefined();
    expect(destroyed.target.children).toHaveLength(0);
    expect(destroyed.transition.runs).toHaveLength(0);
    expect(destroyed.clock.idle).toBe(true);
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

// ── Line charts in a switch (M11 step 1) ─────────────────────────────────────

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

interface Played {
  readonly week: number;
  readonly goals: number;
}

/** Goals per match as columns: the weeks with a value. */
const played: Played[] = perMatch.flatMap((d) => (d.goals === null ? [] : [{ week: d.week, goals: d.goals }]));

interface LineSetupOptions {
  readonly mode?: MotionMode;
  readonly hover?: "x" | "point";
  /** The columns' rows. Default: the weeks played. */
  readonly columns?: readonly Played[];
  /** What the switch is given of a view's chart in its place, as a view drawn otherwise would be. Typed as the chart, for tests that use only what a view has. */
  readonly wrap?: { readonly [view in "perMatch" | "toDate" | "columns"]?: (chart: ChartSwitchView) => ChartSwitchView };
}

/**
 * Goals and xG per match and season to date as line charts, and goals per match as columns keyed as
 * the points are ("goals@2"), on one colour assignment that records the names it's asked for.
 */
function lineSetup(options: LineSetupOptions = {}) {
  const clock = manualClock();
  const motion = createMotion({ mode: options.mode ?? "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const target = document.body.appendChild(document.createElement("div"));
  const transition = recorder();
  const assignment = colorAssignment();
  const asked: string[] = [];
  const colors: ColorAssignment = {
    slot(key) {
      asked.push(key);
      return assignment.slot(key);
    }
  };
  const wrapped = <C extends ChartSwitchView>(view: "perMatch" | "toDate" | "columns", chart: C): C => (options.wrap?.[view]?.(chart) as C | undefined) ?? chart;
  const lineOf = (view: "perMatch" | "toDate", label: string, data: readonly Week[]) => (container: HTMLElement, shared: ColorAssignment) =>
    wrapped(view, lineChart<Week>(container, { label, data, x: "week", series: ["goals", "xg"], hover: options.hover ?? "x", colors: shared, width: 600 }, env));
  const views = {
    perMatch: lineOf("perMatch", "Per match", perMatch),
    toDate: lineOf("toDate", "Season to date", toDate),
    columns: (container: HTMLElement, shared: ColorAssignment) =>
      wrapped(
        "columns",
        barChart<Played>(
          container,
          { label: "Goals per match", data: options.columns ?? played, x: (d) => String(d.week), y: "goals", key: (d) => `goals@${d.week}`, orientation: "vertical", colors: shared, width: 600 },
          env
        )
      )
  } satisfies ChartSwitchViews;
  const switcher = chartSwitch(target, { views, initial: "perMatch", transition: transition.effect, colors }, env);
  const wrapper = target.querySelector(":scope > .ec-switch") as HTMLDivElement;
  const overlay = wrapper.querySelector(":scope > .ec-switch-overlay") as SVGSVGElement;
  const container = (view: string) => wrapper.querySelector(`:scope > .ec-switch-view[data-view="${view}"]`) as HTMLDivElement;
  const land = async () => {
    clock.advance(950);
    await flush();
  };
  return { switcher, target, wrapper, overlay, container, clock, motion, env, transition, colors, asked, land, line: switcher.chart("perMatch"), toDate: switcher.chart("toDate"), columns: switcher.chart("columns") };
}

const color = (colors: ColorAssignment, name: string): string => seriesColors(colors.slot(name)).color;
const markColor = (element: Element): string => (element as SVGElement).style.getPropertyValue("--ec-mark");
const runsIn = (overlay: SVGSVGElement): SVGGElement[] => Array.from(overlay.querySelectorAll(".ec-switch-runs > .ec-run"));
const fadesIn = (overlay: SVGSVGElement): SVGGElement[] => Array.from(overlay.querySelectorAll(".ec-switch-fades > .ec-switch-fade"));
const markOf = (chart: { marks(): readonly MarkGeometry[] }, key: string): MarkGeometry => chart.marks().find((mark) => mark.key === key)!;

/** The view as a switch uses it, without paintOf() or standsFor(): as a view drawn by another library would be. */
function bare(chart: ChartSwitchView): ChartSwitchView {
  return {
    element: chart.element,
    marks: () => chart.marks(),
    labels: () => chart.labels(),
    focus: (key) => chart.focus(key),
    leave: () => chart.leave(),
    destroy: () => chart.destroy()
  };
}

describe("chartSwitch: a line chart and columns keyed as its points", () => {
  it("grows each column out of its point, from a dot of no size at its centre, and fades the lines out over the first half, each in its series' colour", () => {
    const { switcher, overlay, line, columns, clock, transition, colors, asked } = lineSetup();
    void switcher.show("columns");
    // Each column with its point, by key, in the columns' order; xG's points have no partner.
    expect(transition.runs.map((run) => [run.from.key, run.to.key, run.start])).toEqual([
      ["goals@1", "goals@1", 0],
      ["goals@2", "goals@2", 0],
      ["goals@4", "goals@4", 0],
      ["goals@6", "goals@6", 0]
    ]);
    for (const run of transition.runs) {
      const point = markOf(line, run.from.key);
      expect(run.to.outline.d).toBe(markOf(columns, run.to.key).outline.d);
      if (run.from.key === "goals@4" || run.from.key === "goals@6") {
        // Alone between gaps: drawn at rest, so its own dot.
        expect(run.from.outline.d).toBe(point.outline.d);
        continue;
      }
      // Hidden at rest: a dot of no size at its centre.
      expect(run.from.bounds).toEqual({ x: point.center.x, y: point.center.y, width: 0, height: 0 });
      expect(run.from.center).toEqual(point.center);
      expect(run.from.outline.closed).toBe(true);
      expect(run.from.outline.sample(8).every((p) => p.x === point.center.x && p.y === point.center.y)).toBe(true);
    }
    // Every pair in goals' colour, as the points and the columns are drawn.
    for (const group of runsIn(overlay)) expect(markColor(group)).toBe(color(colors, "goals"));
    // The lines fade out where they stand, in their colours; the hidden points don't fade at all.
    const fades = fadesIn(overlay);
    expect(fades.map((fade) => fade.getAttribute("data-key"))).toEqual(["goals", "xg"]);
    for (const fade of fades) {
      const key = fade.getAttribute("data-key")!;
      expect(markColor(fade)).toBe(color(colors, key));
      expect(fade.querySelector("path")!.getAttribute("d")).toBe(markOf(line, key).outline.d);
    }
    const opacity = () => fades.map((fade) => Number(fade.getAttribute("opacity")));
    expect(opacity()).toEqual([1, 1]);
    clock.advance(300);
    expect(opacity()).toEqual([1, 1].map(() => round(1 - at(300) / 0.5)));
    clock.advance(200);
    expect(opacity()).toEqual([0, 0]);
    // The assignment is asked for series' names only, never a point's key.
    expect(asked.filter((name) => name.includes("@"))).toEqual([]);
  });

  it("shrinks each column back into its point, and fades the lines in over the second half", async () => {
    const { switcher, overlay, line, columns, clock, transition, colors, land } = lineSetup();
    void switcher.show("columns");
    await land();
    transition.runs.length = 0;
    void switcher.show("perMatch");
    // In the line chart's order: its points, row by row.
    expect(transition.runs.map((run) => run.to.key)).toEqual(["goals@1", "goals@2", "goals@4", "goals@6"]);
    for (const run of transition.runs) {
      const point = markOf(line, run.to.key);
      expect(run.from.outline.d).toBe(markOf(columns, run.from.key).outline.d);
      if (run.to.key === "goals@4" || run.to.key === "goals@6") expect(run.to.outline.d).toBe(point.outline.d);
      else expect(run.to.bounds).toEqual({ x: point.center.x, y: point.center.y, width: 0, height: 0 });
    }
    for (const group of runsIn(overlay)) expect(markColor(group)).toBe(color(colors, "goals"));
    const fades = fadesIn(overlay);
    expect(fades.map((fade) => fade.getAttribute("data-key"))).toEqual(["goals", "xg"]);
    const opacity = () => fades.map((fade) => Number(fade.getAttribute("opacity")));
    expect(opacity()).toEqual([0, 0]);
    clock.advance(700);
    expect(opacity()).toEqual([1, 1].map(() => round((at(700) - 0.5) / 0.5)));
    clock.advance(249);
    expect(opacity()).toEqual([1, 1].map(() => round((at(949) - 0.5) / 0.5)));
  });

  it("fades the columns' labels in and the lines' end labels out, matched by key and role as now", () => {
    const { switcher, overlay, line, columns } = lineSetup();
    void switcher.show("columns");
    const copies = Array.from(overlay.querySelectorAll(".ec-switch-labels > text"));
    expect(copies).toHaveLength(line.labels().length + columns.labels().length);
    // None moves: each has no partner, so each fades.
    for (const copy of copies) expect(copy.getAttribute("visibility")).toBeNull();
    expect(copies.map((copy) => copy.getAttribute("opacity"))).toEqual([...line.labels().map(() => "1"), ...columns.labels().map(() => "0")]);
  });
});

describe("chartSwitch: two line charts", () => {
  it("morphs their lines by series and moves their end labels; their points stay hidden, but for a value alone between gaps, played as its dot", () => {
    const { switcher, overlay, line, toDate, clock, transition, colors } = lineSetup();
    void switcher.show("toDate");
    expect(transition.runs.map((run) => run.to.key)).toEqual(["goals", "xg", "goals@4", "goals@6"]);
    for (const run of transition.runs) {
      expect(run.from.outline.d).toBe(markOf(line, run.from.key).outline.d);
      expect(run.to.outline.d).toBe(markOf(toDate, run.to.key).outline.d);
    }
    expect(runsIn(overlay).map((group) => markColor(group))).toEqual(["goals", "xg", "goals", "goals"].map((name) => color(colors, name)));
    // Every mark has a partner: nothing fades.
    expect(fadesIn(overlay)).toEqual([]);
    // Each end label moves from its place to its partner's.
    const label = (chart: typeof line, key: string) => chart.labels().find((each) => each.key === key && each.role === "value")!;
    clock.advance(300);
    const s = at(300);
    for (const key of ["goals", "xg"]) {
      const from = label(line, key);
      const to = label(toDate, key);
      const copy = overlayLabels(overlay).find((each) => each.text === from.text)!;
      expect(copy).toMatchObject({ x: round(mix(from.x, to.x, s)), y: round(mix(from.y, to.y, s)), shown: true });
    }
  });
});

describe("chartSwitch: a line's gaps in the overlay", () => {
  it("keeps each line's gaps when its view is mapped into the overlay's px", () => {
    // The season to date drawn at half size, 30 px down: its marks are mapped, the per-match ones aren't.
    const proto = SVGElement.prototype as unknown as { getScreenCTM?: () => unknown };
    proto.getScreenCTM = function (this: SVGElement) {
      if (this.classList.contains("ec-switch-overlay")) return { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 };
      return this.closest('[data-view="toDate"]') ? { a: 0.5, b: 0, c: 0, d: 0.5, e: 10, f: 50 } : { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 };
    };
    try {
      const { switcher, line, toDate, transition } = lineSetup();
      void switcher.show("toDate");
      for (const key of ["goals", "xg"]) {
        const run = transition.runs.find((each) => each.to.key === key)!;
        const own = markOf(toDate, key);
        expect(own.gaps?.length).toBeGreaterThan(0);
        expect(run.to.center).toEqual({ x: own.center.x / 2, y: own.center.y / 2 + 30 });
        expect(run.to.gaps).toEqual(own.gaps);
        expect(run.from.gaps).toEqual(markOf(line, key).gaps);
      }
    } finally {
      delete proto.getScreenCTM;
    }
  });
});

describe("chartSwitch: each mark in its view's colour", () => {
  /** A donut by outcome and columns of the same outcomes coloured by series ("shots"), each optionally without paintOf(). */
  function shots(options: { readonly bare?: boolean } = {}) {
    const clock = manualClock();
    const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
    const transition = recorder();
    const colors = colorAssignment();
    const wrap = (chart: ChartSwitchView) => (options.bare ? bare(chart) : chart);
    const switcher = chartSwitch(
      document.body.appendChild(document.createElement("div")),
      {
        views: {
          donut: (container, shared) => wrap(donutChart(container, { label: "Shots", data: outcomes, category: "outcome", value: "shots", colors: shared, width: 600 }, env)),
          columns: (container, shared) => wrap(barChart(container, { label: "Shots", data: outcomes.slice(0, 3), x: "outcome", y: "shots", orientation: "vertical", colors: shared, width: 600 }, env))
        },
        initial: "donut",
        transition: transition.effect,
        colors
      },
      env
    );
    const overlay = document.querySelector(".ec-switch-overlay") as SVGSVGElement;
    return { switcher, overlay, clock, colors };
  }

  it("draws a pair whose views colour it differently in the new view's colour, and each mark that fades in its own view's", async () => {
    const { switcher, overlay, clock, colors } = shots();
    void switcher.show("columns");
    // The columns are coloured by their series, the slices by outcome.
    expect(runsIn(overlay).map((group) => [group.getAttribute("data-key"), markColor(group)])).toEqual(["Goal", "Saved", "Off target"].map((key) => [key, color(colors, "shots")]));
    expect(fadesIn(overlay).map((fade) => [fade.getAttribute("data-key"), markColor(fade)])).toEqual([["Blocked", color(colors, "Blocked")]]);
    // A switch back mid-way plays the same picture backwards, in the same colours.
    clock.advance(300);
    void switcher.show("donut");
    expect(runsIn(overlay).map((group) => markColor(group))).toEqual([1, 2, 3].map(() => color(colors, "shots")));
    clock.advance(950);
    await flush();
    // Landed on the donut: a new switch to it draws in the slices' colours, by outcome.
    void switcher.show("columns");
    clock.advance(950);
    await flush();
    void switcher.show("donut");
    expect(runsIn(overlay).map((group) => [group.getAttribute("data-key"), markColor(group)])).toEqual(["Goal", "Saved", "Off target"].map((key) => [key, color(colors, key)]));
    expect(fadesIn(overlay).map((fade) => [fade.getAttribute("data-key"), markColor(fade)])).toEqual([["Blocked", color(colors, "Blocked")]]);
  });

  it("draws a view without paintOf() by key, as before", () => {
    const { switcher, overlay, colors } = shots({ bare: true });
    void switcher.show("columns");
    expect(runsIn(overlay).map((group) => [group.getAttribute("data-key"), markColor(group)])).toEqual(["Goal", "Saved", "Off target"].map((key) => [key, color(colors, key)]));
    expect(fadesIn(overlay).map((fade) => [fade.getAttribute("data-key"), markColor(fade)])).toEqual([["Blocked", color(colors, "Blocked")]]);
  });

  it("gives each chart's paint: a slice by key, a bar by key or by its first series, a line and its points by series", () => {
    const { switcher } = shots();
    const donut = switcher.chart("donut") as ChartSwitchView;
    expect(donut.paintOf!("Saved")).toEqual({ color: "Saved", drawn: true });
    expect(donut.paintOf!("Woodwork")).toBeUndefined();
    const columns = switcher.chart("columns") as ChartSwitchView;
    expect(columns.paintOf!("Saved")).toEqual({ color: "shots", drawn: true });
    expect(columns.paintOf!("Blocked")).toBeUndefined();
    const { line, columns: byPoint } = lineSetup();
    const view = line as ChartSwitchView;
    // A line with its end dot and the dot's ring, and a point drawn at rest with its ring (M12 step 1).
    expect(view.paintOf!("goals")).toEqual({ color: "goals", drawn: true, end: 4.5, ring: 2 });
    expect(view.paintOf!("xg@2")).toEqual({ color: "xg", drawn: false });
    expect(view.paintOf!("goals@4")).toEqual({ color: "goals", drawn: true, ring: 2 });
    // An x isn't a mark.
    expect(view.paintOf!("2")).toBeUndefined();
    expect((byPoint as ChartSwitchView).paintOf!("goals@2")).toEqual({ color: "goals", drawn: true });
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: createMotion({ mode: "off" }), clock: manualClock() };
    const byCategory = barChart(document.body.appendChild(document.createElement("div")), { label: "Shots", data: outcomes, x: "outcome", y: "shots", colorBy: "category", width: 600 }, env) as ChartSwitchView;
    expect(byCategory.paintOf!("Saved")).toEqual({ color: "Saved", drawn: true });
    const stack = barChart(document.body.appendChild(document.createElement("div")), { label: "Weeks", data: played.map((d) => ({ ...d, assists: 1 })), x: (d) => String(d.week), stack: ["assists", "goals"], width: 600 }, env) as ChartSwitchView;
    expect(stack.paintOf!("2")).toEqual({ color: "assists", drawn: true });
  });
});

describe("chartSwitch: focus across line charts", () => {
  const focused = () => document.activeElement?.getAttribute("data-key");

  it("moves focus from an x to its first series' point's column, and back to the x", async () => {
    const { switcher, line, columns, land } = lineSetup();
    line.focus("2");
    expect(focused()).toBe("2");
    expect((line as ChartSwitchView).standsFor!("2")).toEqual(["goals@2", "xg@2", "2"]);
    void switcher.show("columns");
    await land();
    expect(columns.element.contains(document.activeElement)).toBe(true);
    expect(focused()).toBe("goals@2");
    void switcher.show("perMatch");
    await land();
    expect(line.element.contains(document.activeElement)).toBe(true);
    expect(focused()).toBe("2");
  });

  it("moves focus from an x whose first series is missing there to that series' column, when the columns have it", async () => {
    // Every week a column, a missing value as 0.
    const { switcher, line, columns, land } = lineSetup({ columns: perMatch.map((d) => ({ week: d.week, goals: d.goals ?? 0 })) });
    line.focus("3");
    expect((line as ChartSwitchView).standsFor!("3")).toEqual(["goals@3", "xg@3", "3"]);
    void switcher.show("columns");
    await land();
    expect(columns.element.contains(document.activeElement)).toBe(true);
    expect(focused()).toBe("goals@3");
  });

  it("moves focus from a point to its column and back, with hover: \"point\"", async () => {
    const { switcher, line, columns, land } = lineSetup({ hover: "point" });
    line.focus("goals@2");
    expect(focused()).toBe("goals@2");
    expect((line as ChartSwitchView).standsFor!("goals@2")).toEqual(["goals@2"]);
    void switcher.show("columns");
    await land();
    expect(columns.element.contains(document.activeElement)).toBe(true);
    expect(focused()).toBe("goals@2");
    void switcher.show("perMatch");
    await land();
    expect(line.element.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.classList.contains("ec-stop")).toBe(true);
    expect(focused()).toBe("goals@2");
  });

  it("moves focus to the new view's first mark when it has none of the keys", async () => {
    const { switcher, line, columns, land } = lineSetup();
    line.focus("5");
    void switcher.show("columns");
    await land();
    expect(columns.element.contains(document.activeElement)).toBe(true);
    expect(focused()).toBe("goals@1");
  });

  it("moves focus from an x to the same x in another line chart, and with motion off too", async () => {
    const { switcher, line, toDate, land } = lineSetup();
    line.focus("3");
    void switcher.show("toDate");
    await land();
    expect(toDate.element.contains(document.activeElement)).toBe(true);
    expect(focused()).toBe("3");

    const off = lineSetup({ mode: "off" });
    off.line.focus("2");
    void off.switcher.show("columns");
    expect(off.columns.element.contains(document.activeElement)).toBe(true);
    expect(focused()).toBe("goals@2");
  });
});

describe("chartSwitch: a line view", () => {
  it("takes part in a link through the line view on show, by x, before and after a switch", async () => {
    const { switcher, line, env, land } = lineSetup();
    const bars = barChart<Played>(document.body.appendChild(document.createElement("div")), { label: "Goals", data: played, x: (d) => String(d.week), y: "goals", orientation: "vertical", width: 400 }, env);
    link([bars, switcher]);
    const hot = (chart: { readonly element: Element }) => Array.from(chart.element.querySelectorAll(".ec-hot"), (element) => element.getAttribute("data-key"));
    const bar = (key: string) => bars.element.querySelector(`.ec-mark[data-key="${key}"] .ec-segment`)!;
    const x = (key: string) => line.element.querySelector(`.ec-column[data-key="${key}"] .ec-hit`)!;
    pointer("pointerover", bar("2"));
    expect(hot(line)).toEqual(["goals@2", "xg@2"]);
    pointer("pointerleave", bars.element);
    expect(hot(line)).toEqual([]);
    pointer("pointerover", x("4"));
    expect(hot(bars)).toEqual(["4"]);
    pointer("pointerleave", line.element);
    expect(hot(bars)).toEqual([]);

    void switcher.show("columns");
    await land();
    void switcher.show("perMatch");
    await land();
    pointer("pointerover", bar("6"));
    expect(hot(line)).toEqual(["goals@6", "xg@6"]);
    pointer("pointerleave", bars.element);
    pointer("pointerover", x("1"));
    expect(hot(bars)).toEqual(["1"]);
  });

  it("lands at once with motion off, without playing the pairs", async () => {
    const { switcher, overlay, container, transition, clock } = lineSetup({ mode: "off" });
    await switcher.show("columns");
    expect(transition.runs).toEqual([]);
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    expect(container("columns").classList.contains("ec-switch-inactive")).toBe(false);
    expect(container("perMatch").classList.contains("ec-switch-inactive")).toBe(true);
    expect(clock.idle).toBe(true);
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
        disconnect() {}
      }
    );
    const { switcher, wrapper, overlay, container, clock } = lineSetup();
    const watcher = observers.find((observer) => observer.target === wrapper)!;
    const resize = (width: number) => watcher.callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    resize(600);
    const landed = vi.fn();
    void switcher.show("columns").then(landed);
    clock.advance(300);
    resize(480);
    expect(container("columns").classList.contains("ec-switching")).toBe(false);
    expect(container("perMatch").classList.contains("ec-switch-inactive")).toBe(true);
    for (const layer of Array.from(overlay.children)) expect(layer.children).toHaveLength(0);
    await flush();
    expect(landed).toHaveBeenCalledTimes(1);
  });

  it("lands a switch first when show() asks for a third view, then switches from there", async () => {
    const { switcher, line, columns, toDate, container, clock, transition } = lineSetup();
    line.focus("2");
    const first = vi.fn();
    void switcher.show("columns").then(first);
    clock.advance(300);
    transition.runs.length = 0;
    const third = vi.fn();
    void switcher.show("toDate").then(third);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    // From the columns, landed, to the points they grew from: hidden in the season to date, but where goals are alone.
    expect(transition.runs.map((run) => [run.from.key, run.start])).toEqual([
      ["goals@1", 0],
      ["goals@2", 0],
      ["goals@4", 0],
      ["goals@6", 0]
    ]);
    expect(transition.runs[0]!.from.outline.d).toBe(markOf(columns, "goals@1").outline.d);
    const point = markOf(toDate, "goals@1");
    expect(transition.runs[0]!.to.bounds).toEqual({ x: point.center.x, y: point.center.y, width: 0, height: 0 });
    expect(transition.runs[2]!.to.outline.d).toBe(markOf(toDate, "goals@4").outline.d);
    clock.advance(950);
    await flush();
    expect(third).toHaveBeenCalledTimes(1);
    expect(["perMatch", "columns", "toDate"].map((view) => container(view).classList.contains("ec-switch-inactive"))).toEqual([true, true, false]);
    // Focus went on with the week.
    expect(toDate.element.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("data-key")).toBe("2");
  });
});

// ── End dots, rings and the tab stop (M12 step 1) ────────────────────────────

/** The end dots drawn in a group, as its own children. */
const endsIn = (group: Element): SVGCircleElement[] => Array.from(group.querySelectorAll(":scope > circle.ec-switch-end"));
const dotOf = (circle: Element) => ({ x: number(circle, "cx"), y: number(circle, "cy"), r: number(circle, "r"), ring: number(circle, "stroke-width") });
/** The ring round a filled path: its width, or undefined for none. */
const ringOf = (path: Element): number | undefined => ((path as SVGElement).style.stroke ? number(path, "stroke-width") : undefined);
/** What the line chart draws at the end of the line `key`: its own `.ec-end`, whose 2 px ring is the stylesheet's. */
const ownEnd = (chart: { readonly element: Element }, key: string) => ({ ...dotOf(chart.element.querySelector(`.ec-line[data-key="${key}"] .ec-end`)!), ring: 2 });
const endAt = (at: { readonly x: number; readonly y: number }, r = 4.5, ring = 2) => ({ x: round(at.x), y: round(at.y), r, ring });
/** The key of the chart's tab stop: its element with tabindex 0. */
const stopIn = (chart: { readonly element: Element }): string | null | undefined => chart.element.querySelector('[tabindex="0"]')?.closest("[data-key]")?.getAttribute("data-key");
const ringShown = (chart: { readonly element: Element }): boolean => Array.from(chart.element.querySelectorAll(".ec-focus-ring")).some((ring) => !ring.closest('[visibility="hidden"]'));

/** The view as a switch uses it, its marks painted as its chart paints them but with no end dots or rings: as a view drawn by another library might be. */
function withoutEnds(chart: ChartSwitchView): ChartSwitchView {
  return {
    ...bare(chart),
    paintOf(key) {
      const paint = chart.paintOf!(key);
      return paint && { color: paint.color, drawn: paint.drawn };
    }
  };
}

describe("chartSwitch: a line's end dot and a point's ring (M12 step 1)", () => {
  it("fades each line out with its end dot, where its chart draws it, in its colour and with its ring, as a switch to the columns starts", () => {
    expect(stylesheet).toContain(":where(.ec-chart .ec-end) { fill: var(--ec-mark); stroke: var(--ec-surface, #fcfcfb); stroke-width: 2;");
    const { switcher, overlay, line, clock, colors } = lineSetup();
    void switcher.show("columns");
    const fades = fadesIn(overlay);
    expect(fades.map((fade) => fade.getAttribute("data-key"))).toEqual(["goals", "xg"]);
    for (const fade of fades) {
      const key = fade.getAttribute("data-key")!;
      // The line, then its dot above it, both in the fade's group, so they fade together.
      const [path, end, ...rest] = Array.from(fade.children);
      expect([path!.tagName, rest]).toEqual(["path", []]);
      expect(endsIn(fade)).toEqual([end]);
      expect(dotOf(end!)).toEqual(ownEnd(line, key));
      expect(dotOf(end!)).toEqual(endAt(markOf(line, key).end));
      // Filled in its line's colour, the fade's, its ring in the surface's; the line has none.
      expect(markColor(fade)).toBe(color(colors, key));
      expect(markColor(end!)).toBe("");
      expect((end as SVGElement).style.fill.startsWith("var(--ec-mark,")).toBe(true);
      expect((end as SVGElement).style.stroke.startsWith("var(--ec-surface,")).toBe(true);
      expect((path as SVGElement).style.fill).toBe("none");
      expect((path as SVGElement).style.stroke.startsWith("var(--ec-mark,")).toBe(true);
    }
    clock.advance(300);
    expect(fades.map((fade) => Number(fade.getAttribute("opacity")))).toEqual([1, 1].map(() => round(1 - at(300) / 0.5)));
    for (const fade of fades) expect(dotOf(endsIn(fade)[0]!)).toEqual(ownEnd(line, fade.getAttribute("data-key")!));
  });

  it("fades each line in with its end dot on the way back from the columns", async () => {
    const { switcher, overlay, line, clock, land } = lineSetup();
    void switcher.show("columns");
    await land();
    void switcher.show("perMatch");
    const fades = fadesIn(overlay);
    expect(fades.map((fade) => [fade.getAttribute("data-key"), fade.getAttribute("opacity"), endsIn(fade).length])).toEqual([
      ["goals", "0", 1],
      ["xg", "0", 1]
    ]);
    clock.advance(700);
    for (const fade of fades) {
      expect(Number(fade.getAttribute("opacity"))).toBe(round((at(700) - 0.5) / 0.5));
      expect(dotOf(endsIn(fade)[0]!)).toEqual(ownEnd(line, fade.getAttribute("data-key")!));
    }
  });

  it("keeps a value alone between gaps' ring as a switch to its column starts, and takes it off as the point grows, and back", async () => {
    const { switcher, overlay, clock, land } = lineSetup();
    const rings = () => runsIn(overlay).map((group) => [group.getAttribute("data-key"), ringOf(group.querySelector("path")!)]);
    void switcher.show("columns");
    // The hidden points start as dots of no size, with no ring; the points alone keep theirs.
    expect(rings()).toEqual([
      ["goals@1", undefined],
      ["goals@2", undefined],
      ["goals@4", 2],
      ["goals@6", 2]
    ]);
    for (const group of runsIn(overlay)) expect(endsIn(group)).toEqual([]);
    const path = runsIn(overlay)[2]!.querySelector("path")!;
    expect(path.style.stroke.startsWith("var(--ec-surface,")).toBe(true);
    expect(path.style.fill.startsWith("var(--ec-mark,")).toBe(true);
    // Mixed from 2 to the column's 0 by the shapes' progress.
    clock.advance(300);
    expect(rings().slice(2)).toEqual([2, 2].map((ring, i) => [`goals@${4 + 2 * i}`, round(mix(ring, 0, at(300)))]));
    clock.advance(649);
    expect(rings()[2]![1]).toBeLessThan(0.001);
    await land();
    // Back, from 0 to 2.
    void switcher.show("perMatch");
    expect(rings().slice(2)).toEqual([
      ["goals@4", 0],
      ["goals@6", 0]
    ]);
    clock.advance(300);
    expect(rings().slice(2)).toEqual([2, 2].map((ring, i) => [`goals@${4 + 2 * i}`, round(mix(0, ring, at(300)))]));
  });

  it("moves each end dot straight from its line's end to the other line's, by the shapes' progress, above its line in its colour, and back with no jump", async () => {
    const { switcher, overlay, line, toDate, clock, land } = lineSetup();
    const dots = () => runsIn(overlay).flatMap((group) => endsIn(group).map((end) => [group.getAttribute("data-key"), dotOf(end)]));
    const expected = (s: number) =>
      ["goals", "xg"].map((key) => {
        const [a, b] = [markOf(line, key).end, markOf(toDate, key).end];
        return [key, endAt({ x: mix(a.x, b.x, s), y: mix(a.y, b.y, s) })];
      });
    void switcher.show("toDate");
    expect(dots()).toEqual(expected(0));
    expect(dots().map(([, end]) => end)).toEqual(["goals", "xg"].map((key) => ownEnd(line, key)));
    // The last thing in its line's group, inheriting the group's colour.
    for (const group of runsIn(overlay).slice(0, 2)) {
      expect(group.lastElementChild).toBe(endsIn(group)[0]);
      expect(markColor(endsIn(group)[0]!)).toBe("");
    }
    // The points alone between gaps keep their rings, 2 in both views.
    const rings = () => runsIn(overlay).slice(2).map((group) => ringOf(group.querySelector("path")!));
    expect(rings()).toEqual([2, 2]);
    clock.advance(300);
    expect(dots()).toEqual(expected(at(300)));
    expect(rings()).toEqual([2, 2]);
    // A switch back mid-way plays the same picture backwards from where it is.
    const before = dots();
    void switcher.show("perMatch");
    expect(dots()).toEqual(before);
    clock.advance(200);
    const back = dots();
    void switcher.show("toDate");
    expect(dots()).toEqual(back);
    await land();
    expect(dots()).toEqual([]);
  });

  it("fades an end dot whose partner has none where it stands, in its own view's colour, as a mark with no partner does", async () => {
    const { switcher, overlay, line, clock, colors, land } = lineSetup({ wrap: { toDate: withoutEnds } });
    void switcher.show("toDate");
    const dots = () => runsIn(overlay).flatMap((group) => endsIn(group).map((end) => [group.getAttribute("data-key"), dotOf(end), end.getAttribute("opacity"), markColor(end)]));
    // Its own colour, set on the dot: the pair's group has the new view's.
    expect(dots()).toEqual(["goals", "xg"].map((key) => [key, ownEnd(line, key), "1", color(colors, key)]));
    clock.advance(300);
    expect(dots().map(([, end, opacity]) => [end, Number(opacity)])).toEqual(["goals", "xg"].map((key) => [ownEnd(line, key), round(1 - at(300) / 0.5)]));
    await land();
    // Back: the dot fades in over the second half, where its chart draws it.
    void switcher.show("perMatch");
    expect(dots().map(([key, end, opacity]) => [key, end, opacity])).toEqual(["goals", "xg"].map((key) => [key, ownEnd(line, key), "0"]));
    clock.advance(700);
    expect(dots().map(([, , opacity]) => Number(opacity))).toEqual([1, 1].map(() => round((at(700) - 0.5) / 0.5)));
  });

  it("scales each end dot and ring as its view's <svg> is scaled into the overlay", () => {
    // The season to date drawn at half size, 30 px down, as in the gaps' test above.
    const proto = SVGElement.prototype as unknown as { getScreenCTM?: () => unknown };
    proto.getScreenCTM = function (this: SVGElement) {
      if (this.classList.contains("ec-switch-overlay")) return { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 };
      return this.closest('[data-view="toDate"]') ? { a: 0.5, b: 0, c: 0, d: 0.5, e: 10, f: 50 } : { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 };
    };
    try {
      const { switcher, overlay, line, toDate, clock } = lineSetup();
      void switcher.show("toDate");
      clock.advance(300);
      const s = at(300);
      for (const group of runsIn(overlay).slice(0, 2)) {
        const key = group.getAttribute("data-key")!;
        const [a, b] = [markOf(line, key).end, markOf(toDate, key).end];
        expect(dotOf(endsIn(group)[0]!)).toEqual(endAt({ x: mix(a.x, b.x / 2, s), y: mix(a.y, b.y / 2 + 30, s) }, round(mix(4.5, 2.25, s)), round(mix(2, 1, s))));
      }
      expect(runsIn(overlay).slice(2).map((group) => ringOf(group.querySelector("path")!))).toEqual([2, 2].map(() => round(mix(2, 1, s))));
    } finally {
      delete proto.getScreenCTM;
    }
  });

  it("draws no end dots or rings for views without them: the donut and its columns, and a line chart without them", () => {
    const { switcher, overlay } = setup();
    void switcher.show("columns");
    expect(overlay.querySelectorAll("circle")).toHaveLength(0);
    for (const path of Array.from(overlay.querySelectorAll("path"))) expect([path.style.stroke, path.getAttribute("stroke-width")]).toEqual(["", null]);

    // Line charts whose paints have neither, as a view drawn otherwise might: to each other, and to the columns.
    const lines = lineSetup({ wrap: { perMatch: withoutEnds, toDate: withoutEnds } });
    void lines.switcher.show("toDate");
    expect(lines.overlay.querySelectorAll("circle")).toHaveLength(0);
    for (const path of Array.from(lines.overlay.querySelectorAll(".ec-switch-runs path"))) expect(ringOf(path)).toBeUndefined();
    const other = lineSetup({ wrap: { perMatch: withoutEnds } });
    void other.switcher.show("columns");
    expect(other.overlay.querySelectorAll("circle")).toHaveLength(0);
    expect(runsIn(other.overlay).map((group) => ringOf(group.querySelector("path")!))).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe("chartSwitch: the tab stop follows when focus is outside (M12 step 1)", () => {
  /** A button outside the switch, with focus, as a toggle has after a press. */
  const toggle = (): HTMLButtonElement => {
    const button = document.body.appendChild(document.createElement("button"));
    button.focus();
    return button;
  };

  it("moves the new view's tab stop to the first key the old one's stood for, with nothing focused, no ring and no hover, and Tab lands there", async () => {
    const { switcher, line, columns, land } = lineSetup();
    line.focus("4");
    const button = toggle();
    expect(stopIn(line)).toBe("4");
    expect(stopIn(columns)).toBe("goals@1");
    const events: string[] = [];
    columns.on("hover", (event) => events.push(`hover ${event.mark.key}`));
    columns.on("leave", (event) => events.push(`leave ${event.mark.key}`));
    void switcher.show("columns");
    await land();
    expect(document.activeElement).toBe(button);
    expect(stopIn(columns)).toBe("goals@4");
    expect(ringShown(columns)).toBe(false);
    expect(columns.element.classList.contains("ec-hovering")).toBe(false);
    expect(events).toEqual([]);
    // Tab from the toggle: focus goes to the tab stop, which shows its ring and plays its hover.
    (columns.element.querySelector('[tabindex="0"]') as SVGElement).focus();
    expect(document.activeElement?.getAttribute("data-key")).toBe("goals@4");
    expect(ringShown(columns)).toBe(true);
    expect(events).toEqual(["hover goals@4"]);
  });

  it("moves it from a column to its x, and from an x to the same x in another line chart", async () => {
    const { switcher, line, toDate, columns, land } = lineSetup();
    void switcher.show("columns");
    await land();
    columns.focus("goals@6");
    toggle();
    void switcher.show("perMatch");
    await land();
    expect(stopIn(line)).toBe("6");
    void switcher.show("toDate");
    await land();
    expect(stopIn(toDate)).toBe("6");
    expect(ringShown(line) || ringShown(toDate)).toBe(false);
    expect(document.activeElement?.tagName).toBe("BUTTON");
  });

  it("moves it to a point with hover: \"point\", and from a point to its column", async () => {
    const { switcher, line, columns, land } = lineSetup({ hover: "point" });
    line.focus("goals@2");
    toggle();
    void switcher.show("columns");
    await land();
    expect(stopIn(columns)).toBe("goals@2");
    columns.focus("goals@4");
    toggle();
    void switcher.show("perMatch");
    await land();
    expect(stopIn(line)).toBe("goals@4");
  });

  it("keeps the new view's own tab stop when it takes none of the keys", async () => {
    const { switcher, line, columns, land } = lineSetup();
    void switcher.show("columns");
    await land();
    columns.focus("goals@6");
    toggle();
    void switcher.show("perMatch");
    await land();
    // Week 5's goals are missing, so the columns have no goals@5.
    line.focus("5");
    toggle();
    void switcher.show("columns");
    await land();
    expect(stopIn(columns)).toBe("goals@6");
  });

  it("with focus in the old view, moves focus as before, and the tab stop with it", async () => {
    const { switcher, line, columns, land } = lineSetup();
    line.focus("2");
    void switcher.show("columns");
    await land();
    expect(document.activeElement?.getAttribute("data-key")).toBe("goals@2");
    expect(stopIn(columns)).toBe("goals@2");
    expect(ringShown(columns)).toBe(true);
  });

  it("moves the tab stop, not focus, when focus has moved on outside the switch meanwhile", async () => {
    const { switcher, line, columns, clock, land } = lineSetup();
    line.focus("2");
    void switcher.show("columns");
    clock.advance(300);
    const button = toggle();
    await land();
    expect(document.activeElement).toBe(button);
    expect(stopIn(columns)).toBe("goals@2");
    expect(ringShown(columns)).toBe(false);
  });

  it("moves it with motion off too, before show() returns", () => {
    const { switcher, line, columns } = lineSetup({ mode: "off" });
    line.focus("6");
    const button = toggle();
    void switcher.show("columns");
    expect(document.activeElement).toBe(button);
    expect(stopIn(columns)).toBe("goals@6");
  });

  it("carries it on to a third view, when a switch to it lands the one before", async () => {
    const { switcher, line, columns, toDate, clock, land } = lineSetup();
    line.focus("2");
    toggle();
    void switcher.show("columns");
    clock.advance(300);
    void switcher.show("toDate");
    await land();
    expect(stopIn(toDate)).toBe("2");
    // The columns were landed on the way, not shown: their stop stays their own.
    expect(stopIn(columns)).toBe("goals@1");
  });

  it("reads the old view's tab stop with nothing focused at all", async () => {
    const { switcher, line, columns, land } = lineSetup();
    line.focus("4");
    (document.activeElement as SVGElement).blur();
    expect(document.activeElement).toBe(document.body);
    void switcher.show("columns");
    await land();
    expect(document.activeElement).toBe(document.body);
    expect(stopIn(columns)).toBe("goals@4");
  });

  it("leaves a view without moveTabStop() with its own tab stop", async () => {
    const { switcher, line, columns, land } = lineSetup({ wrap: { columns: bare } });
    line.focus("4");
    toggle();
    void switcher.show("columns");
    await land();
    expect(stopIn(columns)).toBe("goals@1");
  });
});

describe("each chart's moveTabStop() (M12 step 1)", () => {
  function charts(hover: "x" | "point" = "x") {
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } }), clock: manualClock() };
    const place = () => document.body.appendChild(document.createElement("div"));
    const donut = donutChart(place(), { label: "Shots", data: outcomes, category: "outcome", value: "shots", width: 600 }, env);
    const bars = barChart(place(), { label: "Shots", data: outcomes, x: "outcome", y: "shots", width: 600 }, env);
    const line = lineChart<Week>(place(), { label: "Per match", data: perMatch, x: "week", series: ["goals", "xg"], hover, width: 600 }, env);
    const events = vi.fn();
    for (const chart of [donut, bars, line] as const) {
      chart.on("hover", events);
      chart.on("leave", events);
    }
    return { donut: donut as typeof donut & ChartSwitchView, bars: bars as typeof bars & ChartSwitchView, line: line as typeof line & ChartSwitchView, events };
  }

  it("moves the tab stop of a donut, a bar chart and a line chart without focus: nothing fires, and no ring shows", () => {
    const { donut, bars, line, events } = charts();
    expect([donut.moveTabStop!("Saved"), bars.moveTabStop!("Blocked"), line.moveTabStop!("goals@4")]).toEqual([true, true, true]);
    expect([stopIn(donut), stopIn(bars), stopIn(line)]).toEqual(["Saved", "Blocked", "4"]);
    // An x for its own key too.
    expect(line.moveTabStop!("3")).toBe(true);
    expect(stopIn(line)).toBe("3");
    expect(document.activeElement).toBe(document.body);
    expect([donut, bars, line].map(ringShown)).toEqual([false, false, false]);
    expect([donut, bars, line].map((chart) => chart.element.classList.contains("ec-hovering"))).toEqual([false, false, false]);
    expect(events).not.toHaveBeenCalled();
    // Only one stop each.
    for (const chart of [donut, bars, line]) expect(chart.element.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("moves a line chart's to a point with hover: \"point\", for its own key or its x's first series' point", () => {
    const { line } = charts("point");
    expect(line.moveTabStop!("xg@5")).toBe(true);
    expect(stopIn(line)).toBe("xg@5");
    expect(line.moveTabStop!("4")).toBe(true);
    expect(stopIn(line)).toBe("goals@4");
  });

  it("does nothing for a key the chart doesn't take, while one of its marks has focus, or once it's destroyed", () => {
    const { donut, bars, line } = charts();
    expect([donut.moveTabStop!("Woodwork"), bars.moveTabStop!("Woodwork"), line.moveTabStop!("goals@9"), line.moveTabStop!("9")]).toEqual([false, false, false, false]);
    expect([stopIn(donut), stopIn(bars), stopIn(line)]).toEqual(["Goal", "Goal", "1"]);
    // Focus keeps the stop with it.
    line.focus("2");
    expect(line.moveTabStop!("4")).toBe(false);
    expect(stopIn(line)).toBe("2");
    expect(document.activeElement?.getAttribute("data-key")).toBe("2");
    donut.destroy();
    expect(donut.moveTabStop!("Saved")).toBe(false);
  });
});
