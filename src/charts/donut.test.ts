import { createMotion, manualClock, type DataEffect, type EffectContext, type GeometryEffect, type MarkGeometry, type MotionMode } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { colorAssignment } from "./colors";
import { donutChart } from "./donut";
import { seriesColors } from "./render/theme";
import type { ChartEnv } from "./shell/setup";
import type { DonutChartOptions, SliceSummary } from "./types";

interface Shot {
  outcome: string;
  shots: number;
}

/** The prototype's card 3. */
const shots: Shot[] = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];

const TAU = 2 * Math.PI;

/** A motion whose device never asks for reduced motion. */
function quietMotion(mode: MotionMode = "presentation") {
  return createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
}

function setup(options: Partial<DonutChartOptions<Shot>> = {}, more: Partial<ChartEnv> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const clock = manualClock();
  const presets = createRegistry<PresetFactory>({ kind: "preset" });
  const env: ChartEnv = { presets, icons: { get: () => undefined }, motion: quietMotion(), clock, ...more };
  const chart = donutChart<Shot>(container, { label: "Shot outcomes", data: shots, category: "outcome", value: "shots", width: 640, ...options }, env);
  const svg = chart.element;
  const mark = (key: string) => svg.querySelector(`.ec-mark[data-key="${key}"]`) as SVGGElement;
  const slice = (key: string) => mark(key).querySelector(".ec-slice") as SVGPathElement;
  const keys = () => Array.from(svg.querySelectorAll(".ec-marks > .ec-mark"), (g) => g.getAttribute("data-key"));
  const settle = (running: Promise<unknown>) => play(clock, running);
  return { container, chart, svg, clock, env, presets, mark, slice, keys, settle };
}

/** A slice's start and span in turns, read from its walk: clockwise from 12 o'clock about its pivot. */
function turns(mark: MarkGeometry): { readonly start: number; readonly span: number } {
  const { start, pivot } = mark;
  const radius = Math.hypot(start.x - pivot.x, start.y - pivot.y);
  const angle = Math.atan2(start.x - pivot.x, pivot.y - start.y);
  const at = (angle < -1e-9 ? angle + TAU : Math.max(0, angle)) / TAU;
  return { start: at > 1 - 1e-9 ? 0 : at, span: radius > 0 ? mark.length / radius / TAU : 0 };
}

const byKey = (marks: readonly MarkGeometry[]): Record<string, { readonly start: number; readonly span: number }> =>
  Object.fromEntries(marks.map((mark) => [mark.key, turns(mark)]));

function pointer(type: string, target: Element, pointerType = "mouse"): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType }));
}

/** A key press on `target`. The document hears it first, as it would in a browser. */
function press(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/** Tab into the chart: a key press, then focus lands on the mark Tab reaches. */
function tabTo(target: SVGElement): void {
  press(document.body, "Tab");
  target.focus();
}

/** An effect that logs what the runner does with it. */
function recorder(draw?: (mark: MarkGeometry, ctx: EffectContext) => void) {
  const log: string[] = [];
  const effect: GeometryEffect = {
    kind: "geometry",
    run(mark, ctx) {
      log.push(ctx.previous ? `run ${mark.key} from ${ctx.previous.key}` : `run ${mark.key}`);
      ctx.onChange((moved) => log.push(`change ${moved.key}`));
      draw?.(mark, ctx);
      return Promise.resolve();
    },
    end(mark) {
      log.push(`end ${mark.key}`);
    },
    clear() {
      log.push("clear");
    }
  };
  return { effect, log };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.textContent = "";
  vi.unstubAllGlobals();
});

describe("donutChart: drawing", () => {
  it("draws keyed slices from describe.arc, clockwise from 12 o'clock in data order, each its true share", () => {
    const { svg, chart, keys, slice } = setup();
    expect(svg.getAttribute("class")).toBe("ec-chart ec-donut-chart");
    expect(svg.getAttribute("viewBox")).toBe("0 0 640 300");
    expect(keys()).toEqual(["Goal", "Saved", "Off target", "Blocked"]);
    const marks = chart.marks();
    let before = 0;
    for (const mark of marks) {
      const value = shots.find((shot) => shot.outcome === mark.key)!.shots;
      expect(turns(mark).start).toBeCloseTo(before / 406, 9);
      expect(turns(mark).span).toBeCloseTo(value / 406, 9);
      before += value;
      expect(mark.pivot).toEqual({ x: 320, y: 150 });
      expect(mark.series).toBe("shots");
      expect(slice(mark.key).getAttribute("d")).toBe(mark.outline.d);
      expect(slice(mark.key).getAttribute("data-series")).toBe("shots");
    }
    // The ring as large as the labels' room allows, its hole 0.6 of it.
    expect(marks[0]!.thickness).toBeCloseTo(108 * 0.4, 9);
  });

  it("puts each slice's pointer target, body and label in its mark, the target under the slice", () => {
    const { mark } = setup();
    expect(Array.from(mark("Saved").children, (child) => child.getAttribute("class"))).toEqual(["ec-hit", "ec-body", "ec-label", "ec-value"]);
    expect(mark("Saved").querySelector(".ec-hit")!.getAttribute("d")).toBe(mark("Saved").querySelector(".ec-slice")!.getAttribute("d"));
  });

  it("sorts by value, largest first, and keeps data order by default", async () => {
    const { chart, keys } = setup({ sort: "value", motion: "off" });
    expect(keys()).toEqual(["Off target", "Saved", "Blocked", "Goal"]);
    expect(turns(chart.marks()[0]!).start).toBe(0);
    await chart.update({ sort: "none" });
    expect(keys()).toEqual(["Goal", "Saved", "Off target", "Blocked"]);
  });

  it("colours slices by category, through pinned slots or a shared assignment, never by rank", async () => {
    const { chart, slice, container } = setup({ colors: { Saved: 5 }, motion: "off" });
    expect(slice("Saved").style.getPropertyValue("--ec-mark")).toBe(seriesColors(5).color);
    expect(slice("Goal").style.getPropertyValue("--ec-mark")).toBe(seriesColors(1).color);
    const goal = slice("Goal").style.getPropertyValue("--ec-mark");
    await chart.update({ sort: "value" });
    expect(slice("Goal").style.getPropertyValue("--ec-mark")).toBe(goal);
    const shared = colorAssignment({ Blocked: 7 });
    const other = donutChart<Shot>(container, { label: "Again", data: shots, category: "outcome", value: "shots", width: 640, colors: shared }, setup().env);
    expect(other.element.querySelector<SVGPathElement>('[data-key="Blocked"] .ec-slice')!.style.getPropertyValue("--ec-mark")).toBe(seriesColors(7).color);
  });

  it("labels slices of 15° or more outside the ring, with the category over the share, in theme text colours", () => {
    const { mark } = setup({ data: [...shots, { outcome: "Own goal", shots: 4 }] });
    const label = (key: string) => [mark(key).querySelector(".ec-label")!, mark(key).querySelector(".ec-value")!] as const;
    const [category, share] = label("Saved");
    expect([category.textContent, share.textContent]).toEqual(["Saved", "27%"]);
    expect(category.getAttribute("visibility")).toBeNull();
    expect(Number(share.getAttribute("y")) - Number(category.getAttribute("y"))).toBe(15);
    for (const text of label("Saved")) expect(text.getAttribute("aria-hidden")).toBe("true");
    // 4 of 410 is under 15°: no label.
    expect(label("Own goal").map((text) => text.getAttribute("visibility"))).toEqual(["hidden", "hidden"]);
  });

  it("draws the total over the series' label in the hole, hidden from screen readers but in the chart's description", () => {
    const { svg } = setup({ description: "Every shot of the season." });
    const center = svg.querySelector(".ec-center")!;
    expect(center.getAttribute("aria-hidden")).toBe("true");
    expect(Array.from(center.children, (text) => [text.getAttribute("class"), text.textContent])).toEqual([
      ["ec-center-value", "406"],
      ["ec-center-label", "shots"]
    ]);
    expect(svg.querySelector(":scope > desc")!.textContent).toBe("Every shot of the season. 406 shots");
  });

  it("takes its own centre text, in the chart's format, or none", async () => {
    const { svg, chart } = setup({ format: (v) => `${v}.0`, center: (total, format) => `${format(total)}\nshots\nthis season`, motion: "off" });
    expect(Array.from(svg.querySelectorAll(".ec-center text"), (text) => text.textContent)).toEqual(["406.0", "shots", "this season"]);
    expect(svg.querySelector(":scope > desc")!.textContent).toBe("406.0 shots this season");
    await chart.update({ center: false });
    expect(svg.querySelectorAll(".ec-center text")).toHaveLength(0);
    expect(svg.querySelector(":scope > desc")).toBeNull();
  });

  it("shows the total alone for an unlabelled value read by a function", () => {
    const { svg } = setup({ value: (d) => d.shots });
    expect(Array.from(svg.querySelectorAll(".ec-center text"), (text) => text.textContent)).toEqual(["406"]);
  });

  it("draws no slices when the total is 0", () => {
    const { svg, chart } = setup({ data: shots.map((shot) => ({ ...shot, shots: 0 })) });
    expect(chart.marks()).toHaveLength(4);
    for (const path of svg.querySelectorAll(".ec-slice, .ec-hit")) expect(path.getAttribute("visibility")).toBe("hidden");
    expect(svg.querySelector('[data-key="Goal"]')!.getAttribute("aria-label")).toBe("Goal: 0 shots, 0%");
  });

  it("checks its options, and leaves nothing behind when its first layout throws", () => {
    const { container, env } = setup();
    const make = (options: Partial<DonutChartOptions<Shot>>) => () =>
      donutChart<Shot>(container, { label: "x", data: shots, category: "outcome", value: "shots", ...options } as DonutChartOptions<Shot>, env);
    expect(make({ category: undefined })).toThrow(/needs a category/);
    expect(make({ value: undefined })).toThrow(/needs a value/);
    expect(make({ data: [{ outcome: "Goal", shots: -2 }] })).toThrow(/finite number of 0 or more/);
    expect(make({ center: "406" as unknown as false })).toThrow(/center must be false or a function/);
    expect(make({ sort: "key" as "value" })).toThrow(/sort must be "value" or "none"/);
    expect(make({ label: " " })).toThrow(/donutChart needs a label/);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(() => donutChart("#nowhere", { label: "x", data: shots, category: "outcome", value: "shots" }, env)).toThrow(/donutChart: no element matches "#nowhere"/);
  });

  it("leaves nothing behind when format throws, even when only the slices' names use it", () => {
    const { env } = setup();
    const container = document.body.appendChild(document.createElement("div"));
    const broken = (): string => {
      throw new Error("no format");
    };
    expect(() => donutChart<Shot>(container, { label: "x", data: shots, category: "outcome", value: "shots", table: false, center: false, format: broken }, env)).toThrow("no format");
    expect(container.childElementCount).toBe(0);
    expect(() => donutChart<Shot>(container, { label: "x", data: shots, category: "outcome", value: "shots", format: "0.0" as unknown as () => string }, env)).toThrow(
      /donutChart: format must be a function/
    );
    expect(container.childElementCount).toBe(0);
  });
});

describe("donutChart: legend and data table", () => {
  it("lists every category in the slices' order, coloured as its slice, unless legend is false", async () => {
    const { container, chart, slice } = setup({ sort: "value", motion: "off" });
    const items = () => Array.from(container.querySelectorAll<HTMLElement>(".ec-legend-item"));
    expect(container.querySelector(".ec-legend")!.nextElementSibling).toBe(chart.element);
    expect(items().map((item) => [item.getAttribute("data-key"), item.textContent])).toEqual([
      ["Off target", "Off target"],
      ["Saved", "Saved"],
      ["Blocked", "Blocked"],
      ["Goal", "Goal"]
    ]);
    expect(items()[1]!.style.getPropertyValue("--ec-mark")).toBe(slice("Saved").style.getPropertyValue("--ec-mark"));
    await chart.update({ legend: false });
    expect(container.querySelector(".ec-legend")).toBeNull();
  });

  it("lists the category, the value and its share, then a total row, in the slices' order", async () => {
    const { container, chart } = setup({ table: { columns: [{ label: "Kind", field: () => "shot" }] }, motion: "off" });
    const cells = (row: Element) => Array.from(row.children, (cell) => cell.textContent);
    expect(cells(container.querySelector("thead tr")!)).toEqual(["outcome", "Kind", "shots", "Share"]);
    expect(Array.from(container.querySelectorAll("tbody tr"), cells)).toEqual([
      ["Goal", "shot", "58", "14%"],
      ["Saved", "shot", "112", "28%"],
      ["Off target", "shot", "149", "37%"],
      ["Blocked", "shot", "87", "21%"]
    ]);
    const total = container.querySelector("tfoot tr")!;
    expect(cells(total)).toEqual(["Total", "", "406", "100%"]);
    expect(total.firstElementChild!.tagName).toBe("TH");
    expect(total.firstElementChild!.getAttribute("scope")).toBe("row");
    await chart.update({ data: shots.slice(0, 2), table: { total: "All shots", share: "Of all" } });
    expect(cells(container.querySelector("thead tr")!)).toEqual(["outcome", "shots", "Of all"]);
    expect(cells(container.querySelector("tfoot tr")!)).toEqual(["All shots", "170", "100%"]);
  });
});

describe("donutChart: accessibility", () => {
  it("is a group named by its label, its slices images named by category, value and share", () => {
    const { svg, mark } = setup();
    expect(svg.getAttribute("role")).toBe("group");
    expect(svg.getAttribute("aria-label")).toBe("Shot outcomes");
    expect(mark("Saved").getAttribute("role")).toBe("img");
    expect(mark("Saved").getAttribute("aria-label")).toBe("Saved: 112 shots, 28%");
    expect(svg.querySelector(".ec-overlay")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("names a function's value only when it's labelled, and follows seriesLabels", () => {
    expect(setup({ value: (d) => d.shots }).mark("Saved").getAttribute("aria-label")).toBe("Saved: 112, 28%");
    expect(setup({ seriesLabels: { shots: "attempts" } }).mark("Saved").getAttribute("aria-label")).toBe("Saved: 112 attempts, 28%");
  });

  it("words each name with markLabel, given the row and the slice with its share", () => {
    const seen: SliceSummary[] = [];
    const { mark } = setup({
      markLabel: (d, slice) => {
        seen.push(slice);
        return `${d.outcome}, ${slice.format(slice.share * 100)} percent`;
      }
    });
    expect(mark("Goal").getAttribute("aria-label")).toBe("Goal, 14.29 percent");
    const goal = seen.find((slice) => slice.key === "Goal")!;
    expect(goal).toMatchObject({ category: "Goal", total: 58, text: "Goal: 58 shots, 14%", values: [{ series: "shots", label: "shots", value: 58 }] });
    expect(goal.share).toBeCloseTo(58 / 406, 12);
  });

  it("moves clockwise with the arrow keys, Home and End, following the sort, without wrapping", async () => {
    const { mark, chart } = setup({ motion: "off" });
    expect(mark("Goal").getAttribute("tabindex")).toBe("0");
    expect(mark("Saved").getAttribute("tabindex")).toBe("-1");
    tabTo(mark("Goal"));
    press(mark("Goal"), "ArrowRight");
    expect(document.activeElement).toBe(mark("Saved"));
    press(mark("Saved"), "ArrowDown");
    expect(document.activeElement).toBe(mark("Off target"));
    press(mark("Off target"), "End");
    expect(document.activeElement).toBe(mark("Blocked"));
    press(mark("Blocked"), "ArrowRight");
    expect(document.activeElement).toBe(mark("Blocked"));
    press(mark("Blocked"), "Home");
    press(mark("Goal"), "ArrowLeft");
    expect(document.activeElement).toBe(mark("Goal"));
    await chart.update({ sort: "value" });
    press(mark("Goal"), "Home");
    expect(document.activeElement).toBe(mark("Off target"));
    press(mark("Off target"), "ArrowRight");
    expect(document.activeElement).toBe(mark("Saved"));
  });

  it("rings the focused slice above the slices, masked to outside it, following an effect's transform", () => {
    const nudge: GeometryEffect = { kind: "geometry", run: async (_m, ctx) => ctx.mark.set({ transform: [1, 0, 0, 1, 3, 0] }), end: () => {}, clear: () => {} };
    const { svg, mark, chart } = setup({ on: { hover: nudge } });
    const overlay = svg.querySelector(".ec-overlay")!;
    const ring = overlay.querySelector(".ec-focus-ring")!;
    expect(ring.getAttribute("visibility")).toBe("hidden");
    tabTo(mark("Goal"));
    press(mark("Goal"), "ArrowRight");
    const outline = chart.marks()[1]!.outline.d;
    expect(ring.getAttribute("d")).toBe(outline);
    expect(ring.getAttribute("visibility")).toBeNull();
    expect(ring.getAttribute("stroke-width")).toBe("8");
    expect(ring.getAttribute("transform")).toBe("matrix(1 0 0 1 3 0)");
    const hole = overlay.querySelector(`${ring.getAttribute("mask")!.slice(4, -1)} path`)!;
    expect(["d", "fill", "stroke-width"].map((name) => hole.getAttribute(name))).toEqual([outline, "black", "4"]);
    (document.activeElement as SVGElement).blur();
    expect(ring.getAttribute("visibility")).toBe("hidden");
  });

  it("moves focus to a slice with focus(key) as a key press would, whatever the last input was", async () => {
    const { svg, mark, chart, clock } = setup();
    const events: string[] = [];
    chart.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source}`));
    const ring = svg.querySelector(".ec-overlay .ec-focus-ring")!;
    pointer("pointerdown", document.body);
    chart.focus("Off target");
    expect(document.activeElement).toBe(mark("Off target"));
    expect(mark("Off target").getAttribute("tabindex")).toBe("0");
    expect(ring.getAttribute("visibility")).toBeNull();
    expect(ring.getAttribute("d")).toBe(chart.marks()[2]!.outline.d);
    expect(events).toEqual(["hover Off target keyboard"]);
    // Unknown, or on its way out: nothing.
    chart.focus("Penalty");
    void chart.update({ data: shots.filter((shot) => shot.outcome !== "Goal") });
    chart.focus("Goal");
    expect(document.activeElement).toBe(mark("Off target"));
    expect(events).toEqual(["hover Off target keyboard"]);
    clock.advance(1000);
  });
});

describe("donutChart: labels()", () => {
  it("gives each slice's category and share outside the ring by key, as drawn, leaving out the centre and dropped labels", () => {
    const { chart, mark, svg } = setup({ data: [...shots, { outcome: "Own goal", shots: 4 }] });
    const labels = chart.labels();
    expect(labels.map((label) => `${label.key} ${label.role} ${label.text}`)).toEqual([
      "Goal category Goal",
      "Goal value 14%",
      "Saved category Saved",
      "Saved value 27%",
      "Off target category Off target",
      "Off target value 36%",
      "Blocked category Blocked",
      "Blocked value 21%"
    ]);
    for (const label of labels) {
      expect(label.element).toBe(mark(label.key).querySelector(label.role === "category" ? ".ec-label" : ".ec-value"));
      expect([label.element.textContent, label.element.getAttribute("text-anchor")]).toEqual([label.text, label.anchor]);
      expect(label.x).toBeCloseTo(Number(label.element.getAttribute("x")), 2);
      expect(label.y).toBeCloseTo(Number(label.element.getAttribute("y")), 2);
    }
    // The share sits under its category.
    expect(labels[1]!.y - labels[0]!.y).toBeCloseTo(15, 9);
    // "Own goal" is under 15°, so its label isn't shown; the centre's text is no slice's.
    expect(mark("Own goal").querySelector(".ec-label")!.getAttribute("visibility")).toBe("hidden");
    const texts = new Set(labels.map((label) => label.element));
    for (const center of Array.from(svg.querySelectorAll(".ec-center text"))) expect(texts.has(center as SVGTextElement)).toBe(false);
  });

  it("follows the slices as they're drawn, in their order, and has none for a total of 0", async () => {
    const { chart, settle } = setup();
    await settle(chart.update({ sort: "value" }));
    expect(chart.labels().filter((label) => label.role === "category").map((label) => label.text)).toEqual(["Off target", "Saved", "Blocked", "Goal"]);
    expect(chart.labels()[0]!.x).toBeGreaterThan(320);
    expect(setup({ data: shots.map((shot) => ({ ...shot, shots: 0 })) }).chart.labels()).toEqual([]);
  });
});

describe("donutChart: hover", () => {
  it("emphasises the hovered slice and dims the others, with no segment in the event", () => {
    const { svg, mark, chart } = setup();
    const events: string[] = [];
    chart.on("hover", (e) => events.push(`${e.mark.key} ${e.source} ${String(e.segment)}`));
    pointer("pointerover", mark("Saved").querySelector(".ec-slice")!);
    expect(mark("Saved").classList.contains("ec-hot")).toBe(true);
    expect(svg.classList.contains("ec-hovering")).toBe(true);
    expect(events).toEqual(["Saved pointer undefined"]);
    pointer("pointerleave", svg);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
  });

  it("hovers a slice from its label too", () => {
    const { mark, chart } = setup();
    const events: string[] = [];
    chart.on("hover", (e) => events.push(e.mark.key));
    pointer("pointerover", mark("Blocked").querySelector(".ec-label")!);
    expect(events).toEqual(["Blocked"]);
  });

  it("shows the category, then the value with its label and the share, in the tooltip", () => {
    const { container, mark } = setup();
    pointer("pointerover", mark("Saved").querySelector(".ec-hit")!);
    const tip = container.querySelector(".ec-tooltip")!;
    expect(Array.from(tip.children, (line) => line.textContent)).toEqual(["Saved", "112 shots · 28%"]);
    expect(tip.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("donutChart: effects", () => {
  it("resolves preset names and plays hover on the slice, in the overlay above the slices", () => {
    const { presets, container, env } = setup();
    const story = recorder((mark, ctx) => ctx.layer.path(mark.slice(0, 1), { stroke: "mark", width: 2 }));
    presets.register("test-story", () => story.effect);
    const chart = donutChart<Shot>(container, { label: "x", data: shots, category: "outcome", value: "shots", width: 640, on: { hover: "test-story" } }, env);
    pointer("pointerover", chart.element.querySelector('[data-key="Saved"] .ec-slice')!);
    expect(story.log).toEqual(["run Saved"]);
    const run = chart.element.querySelector('.ec-overlay .ec-runs .ec-run[data-key="Saved"]')!;
    expect(run.querySelector("path")!.getAttribute("d")).toBe(chart.marks()[1]!.slice(0, 1));
    expect((run as SVGElement).style.getPropertyValue("--ec-mark")).toBe(seriesColors(2).color);
  });

  it("draws a halo above the slices, masked to outside the slice, and moves the body with a transform", () => {
    const glow: GeometryEffect = {
      kind: "geometry",
      run: async (_m, ctx) => ctx.mark.set({ halo: { width: 8, opacity: 0.4 }, transform: [1, 0, 0, 1, 2, 0] }),
      end: () => {},
      clear: () => {}
    };
    const { svg, mark, chart } = setup({ on: { hover: glow } });
    pointer("pointerover", mark("Saved").querySelector(".ec-slice")!);
    expect(mark("Saved").querySelector(".ec-halo")).toBeNull();
    const halo = svg.querySelector(".ec-overlay .ec-halos > .ec-halo")!;
    const paths = halo.querySelectorAll(":scope > path");
    expect(Array.from(paths, (path) => path.getAttribute("d"))).toEqual([chart.marks()[1]!.outline.d]);
    expect((paths[0] as SVGElement).style.getPropertyValue("stroke")).toBe(seriesColors(2).color);
    expect(halo.querySelector("mask path")!.getAttribute("fill")).toBe("black");
    expect(halo.getAttribute("transform")).toBe("matrix(1 0 0 1 2 0)");
    expect(mark("Saved").querySelector(".ec-body")!.getAttribute("transform")).toBe("matrix(1 0 0 1 2 0)");
    // The pointer target and the label stay put.
    expect(mark("Saved").querySelector(".ec-hit")!.getAttribute("transform")).toBeNull();
    pointer("pointerleave", svg);
    expect(svg.querySelector(".ec-halo")).toBeNull();
  });

  it("gives data effects the row and samples from 0 to the slice's share, and checks the series they need", async () => {
    const seen: { datum: Shot; samples: readonly { t: number; value: number }[] }[] = [];
    const read: DataEffect<Shot> = {
      kind: "data",
      run: async (_mark, data) => {
        seen.push({ datum: data.datum, samples: data.samples });
      },
      end: () => {},
      clear: () => {}
    };
    setup({ on: { enter: read } });
    expect(seen.map(({ datum }) => datum.outcome)).toEqual(["Goal", "Saved", "Off target", "Blocked"]);
    expect(seen[1]!.samples[0]).toEqual({ t: 0, value: 0 });
    expect(seen[1]!.samples[1]!.t).toBe(1);
    expect(seen[1]!.samples[1]!.value).toBeCloseTo(112 / 406, 12);
    const needy: DataEffect<Shot> = { ...read, needs: { related: ["xg"] } };
    expect(() => setup({ on: { enter: needy } })).toThrow(/donutChart: on.enter needs the series "xg", but the chart's series are "shots"/);
  });
});

describe("donutChart: updates", () => {
  it("jumps to the new state before update() returns when motion is off", () => {
    const { chart, mark } = setup({ motion: "off" });
    void chart.update({ data: [{ outcome: "Goal", shots: 100 }, ...shots.slice(1)] });
    expect(turns(chart.marks()[0]!).span).toBeCloseTo(100 / 448, 9);
    expect(mark("Goal").getAttribute("aria-label")).toBe("Goal: 100 shots, 22%");
  });

  it("fires update only for slices whose own value changed, not those whose share moved", async () => {
    const story = recorder();
    const { chart, settle } = setup({ on: { update: story.effect } });
    const updates: string[] = [];
    chart.on("update", (e) => updates.push(`${e.mark.key} ${e.batch.index}/${e.batch.count}`));
    await settle(chart.update({ data: [{ outcome: "Goal", shots: 100 }, ...shots.slice(1)] }));
    expect(updates).toEqual(["Goal 0/1"]);
    expect(story.log.filter((line) => line.startsWith("run"))).toEqual(["run Goal from Goal"]);
    updates.length = 0;
    await settle(chart.update({ sort: "value" }));
    expect(updates).toEqual([]);
  });

  it("stages a change in presentation: values for 500 ms, joined in the old order, then the turn for 500 ms", async () => {
    const { chart, clock, settle } = setup({ data: [{ outcome: "A", shots: 1 }, { outcome: "B", shots: 1 }, { outcome: "C", shots: 2 }] });
    const running = chart.update({ data: [{ outcome: "A", shots: 3 }, { outcome: "B", shots: 1 }, { outcome: "C", shots: 2 }], sort: "value" });
    // Values: the slices stay joined in the order they were in, every angle a true share.
    clock.advance(250);
    let at = byKey(chart.marks());
    expect(at.A!.start).toBeCloseTo(0, 9);
    expect(at.B!.start).toBeCloseTo(at.A!.span, 9);
    expect(at.C!.start).toBeCloseTo(at.A!.span + at.B!.span, 9);
    expect(at.A!.span + at.B!.span + at.C!.span).toBeCloseTo(1, 9);
    expect(at.A!.span).toBeGreaterThan(0.25);
    expect(at.A!.span).toBeLessThan(0.5);
    clock.advance(250);
    at = byKey(chart.marks());
    expect([at.A!.span, at.B!.span, at.C!.span].map((v) => Math.round(v * 1000) / 1000)).toEqual([0.5, 0.167, 0.333]);
    expect(at.C!.start).toBeCloseTo(0.5 + 1 / 6, 2);
    // The turn: C and B swap places, each turning to its own.
    clock.advance(250);
    at = byKey(chart.marks());
    expect(at.C!.start).toBeGreaterThan(0.5);
    expect(at.C!.start).toBeLessThan(0.5 + 1 / 6);
    expect(at.B!.start).toBeGreaterThan(0.5);
    expect(at.B!.start).toBeLessThan(0.5 + 2 / 6);
    const ms = await settle(running);
    expect(250 * 3 + ms).toBeLessThanOrEqual(1000 + 32);
    at = byKey(chart.marks());
    expect(at.C!.start).toBeCloseTo(0.5, 9);
    expect(at.B!.start).toBeCloseTo(0.5 + 2 / 6, 9);
  });

  it("turns each slice the shorter way round", async () => {
    const quarters = ["A", "B", "C", "D"].map((outcome) => ({ outcome, shots: 1 }));
    const { chart, clock, settle } = setup({ data: quarters });
    const running = chart.update({ data: [quarters[3]!, ...quarters.slice(0, 3)] });
    // A re-sort alone: one 500 ms stage. D goes from 9 o'clock to 12 through 10 and 11, not back round.
    clock.advance(250);
    const d = byKey(chart.marks()).D!.start;
    expect(d).toBeGreaterThan(0.75);
    expect(d).toBeLessThan(1);
    expect(byKey(chart.marks()).A!.start).toBeGreaterThan(0);
    expect(byKey(chart.marks()).A!.start).toBeLessThan(0.25);
    await settle(running);
    expect(byKey(chart.marks()).D!.start).toBeCloseTo(0, 9);
    expect(clock.idle).toBe(true);
  });

  it("shrinks a leaving slice in place first, then grows an entering one at its place in the second half of the turn", async () => {
    const { chart, clock, settle, mark, svg } = setup();
    const running = chart.update({ data: [shots[0]!, shots[1]!, { outcome: "Own goal", shots: 30 }, shots[3]!] });
    const leavingSlice = mark("Off target");
    expect(leavingSlice.classList.contains("ec-leaving")).toBe(true);
    expect(leavingSlice.getAttribute("aria-hidden")).toBe("true");
    clock.advance(250);
    // Still where it was: after Saved, shrinking, and the slices after it close up behind.
    const saved = byKey(chart.marks()).Saved!;
    const pathOf = (key: string) => svg.querySelector(`[data-key="${key}"] .ec-slice`)!.getAttribute("d");
    expect(pathOf("Off target")).not.toBeNull();
    expect(byKey(chart.marks())["Own goal"]!.span).toBe(0);
    expect(byKey(chart.marks()).Blocked!.start).toBeGreaterThan(saved.start + saved.span);
    clock.advance(500);
    // Half way through the turn: the new slice hasn't started growing.
    expect(byKey(chart.marks())["Own goal"]!.span).toBe(0);
    clock.advance(150);
    expect(byKey(chart.marks())["Own goal"]!.span).toBeGreaterThan(0);
    await settle(running);
    expect(byKey(chart.marks())["Own goal"]!.span).toBeCloseTo(30 / 287, 9);
    await flush();
    expect(svg.querySelector('[data-key="Off target"]')).toBeNull();
  });

  it("runs the whole change as one short stage in analysis", async () => {
    const { chart, settle } = setup({}, { motion: quietMotion("analysis") });
    const ms = await settle(chart.update({ data: [shots[2]!, { outcome: "Goal", shots: 80 }, shots[1]!] }));
    expect(ms).toBeLessThanOrEqual(200 + 16);
    expect(chart.marks().map((mark) => mark.key)).toEqual(["Off target", "Goal", "Saved"]);
  });

  it("retargets from where every slice is when another update arrives mid-change, so nothing jumps", async () => {
    const { chart, clock, settle } = setup();
    void chart.update({ data: [{ outcome: "Goal", shots: 200 }, ...shots.slice(1)], sort: "value" });
    for (const ms of [200, 400, 300]) {
      clock.advance(ms);
      const before = byKey(chart.marks());
      void chart.update({ data: shots.map((shot) => ({ ...shot, shots: shot.shots + ms })), sort: ms === 400 ? "none" : "value" });
      const after = byKey(chart.marks());
      for (const key of Object.keys(before)) {
        expect(after[key]!.start).toBeCloseTo(before[key]!.start, 6);
        expect(after[key]!.span).toBeCloseTo(before[key]!.span, 6);
      }
    }
    await settle(chart.update({ data: shots, sort: "none" }));
    const landed = byKey(chart.marks());
    expect(landed.Goal!.start).toBeCloseTo(0, 9);
    expect(landed.Blocked!.span).toBeCloseTo(87 / 406, 9);
  });

  it("counts the total in the hole between totals, and renames slices as the change starts", async () => {
    const { chart, svg, clock, settle, mark } = setup();
    const running = chart.update({ data: [{ outcome: "Goal", shots: 158 }, ...shots.slice(1)] });
    expect(mark("Goal").getAttribute("aria-label")).toBe("Goal: 158 shots, 31%");
    expect(svg.querySelector(":scope > desc")!.textContent).toBe("506 shots");
    clock.advance(250);
    const shown = Number(svg.querySelector(".ec-center-value")!.textContent);
    expect(shown).toBeGreaterThan(406);
    expect(shown).toBeLessThan(506);
    expect(Number.isInteger(shown)).toBe(true);
    await settle(running);
    expect(svg.querySelector(".ec-center-value")!.textContent).toBe("506");
  });

  it("announces what changed", async () => {
    const { chart, container, settle } = setup({ announce: true });
    await settle(chart.update({ data: [{ outcome: "Goal", shots: 70 }, ...shots.slice(1, 3)], sort: "value" }));
    expect(container.querySelector(".ec-announcer")!.textContent?.trim()).toBe("Sorted highest first. Goal changed. Removed Blocked");
  });

  it("rejects what it can't take, leaving the chart as it was", async () => {
    const { chart, keys } = setup();
    await expect(chart.update({ data: [{ outcome: "Goal", shots: Number.POSITIVE_INFINITY }] })).rejects.toThrow(/finite number/);
    await expect(chart.update({ on: { hover: "no-such-preset" } })).rejects.toThrow(/Unknown preset "no-such-preset"/);
    expect(keys()).toEqual(["Goal", "Saved", "Off target", "Blocked"]);
  });

  it("rejects a format that throws, even when only the slices' names use it, changing nothing", async () => {
    const { chart, container, mark, settle } = setup({ table: false, center: false });
    const before = container.innerHTML;
    let settled = false;
    const running = chart.update({ data: [{ outcome: "Goal", shots: 70 }, ...shots.slice(1)] }).then(() => (settled = true));
    const broken = (): string => {
      throw new Error("no format");
    };
    await expect(chart.update({ data: shots.slice(0, 2), format: broken })).rejects.toThrow("no format");
    // The update in flight goes on, untouched.
    expect(mark("Goal").getAttribute("aria-label")).toBe("Goal: 70 shots, 17%");
    expect(mark("Blocked").getAttribute("aria-label")).toBe("Blocked: 87 shots, 21%");
    expect(mark("Blocked").classList.contains("ec-leaving")).toBe(false);
    await settle(running);
    expect(settled).toBe(true);
    expect(container.innerHTML).not.toBe(before);
    expect(chart.marks().map((m) => m.key)).toEqual(["Goal", "Saved", "Off target", "Blocked"]);
  });

  it("re-lays out without animating when the container's width changes", () => {
    const observers: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          observers.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const decorate = recorder();
    const { chart, svg, clock } = setup({ width: undefined, on: { decorate: decorate.effect } });
    const updates = vi.fn();
    chart.on("update", updates);
    decorate.log.length = 0;
    for (const callback of observers) callback([{ contentRect: { width: 400 } } as ResizeObserverEntry], {} as ResizeObserver);
    clock.advance(16);
    expect(svg.getAttribute("viewBox")).toBe("0 0 400 300");
    expect(chart.marks()[0]!.pivot).toEqual({ x: 200, y: 150 });
    expect(decorate.log).toEqual(["change Goal", "change Saved", "change Off target", "change Blocked"]);
    expect(updates).not.toHaveBeenCalled();
    expect(clock.idle).toBe(true);
  });
});

describe("donutChart: destroy", () => {
  it("clears every effect, stops listening and removes the chart, its legend and its table", () => {
    const hover = recorder();
    const { chart, svg, container, mark } = setup({ on: { hover: hover.effect } });
    const target = mark("Goal").querySelector(".ec-hit")!;
    pointer("pointerover", target);
    chart.destroy();
    expect(hover.log).toEqual(["run Goal", "clear"]);
    expect(container.contains(svg)).toBe(false);
    expect(container.children).toHaveLength(0);
    pointer("pointerover", target);
    expect(hover.log).toEqual(["run Goal", "clear"]);
    return expect(chart.update({ sort: "value" })).resolves.toBeUndefined();
  });
});

describe("donutChart: update({ on })", () => {
  const runs = (log: readonly string[]) => log.filter((entry) => !entry.startsWith("change"));

  it("swaps the effects: decorate starts again on every slice, a held hover replays with the new effect, focus stays and nothing enters", async () => {
    const decorate = recorder();
    const hover = recorder();
    const enter = recorder();
    const { chart, svg, settle } = setup({ on: { decorate: decorate.effect, hover: hover.effect, enter: enter.effect } });
    chart.focus("Saved");
    const events: string[] = [];
    for (const type of ["enter", "update", "exit", "hover", "leave"] as const) chart.on(type, (event) => events.push(`${type} ${event.mark.key}`));
    for (const each of [decorate, hover, enter]) each.log.length = 0;
    const nextDecorate = recorder();
    const nextHover = recorder();
    const nextEnter = recorder();
    await settle(chart.update({ on: { decorate: nextDecorate.effect, hover: nextHover.effect, enter: nextEnter.effect } }));
    expect(runs(decorate.log)).toEqual(["clear", "clear", "clear", "clear"]);
    expect(runs(nextDecorate.log)).toEqual(["run Goal", "run Saved", "run Off target", "run Blocked"]);
    expect(runs(hover.log)).toEqual(["clear"]);
    expect(runs(nextHover.log)).toEqual(["run Saved"]);
    // Nothing enters again: the new enter effect only draws its end state.
    expect(runs(nextEnter.log)).toEqual(["end Goal", "end Saved", "end Off target", "end Blocked"]);
    expect(events).toEqual([]);
    expect(document.activeElement?.getAttribute("data-key")).toBe("Saved");
    expect(svg.querySelector(".ec-overlay .ec-focus-ring")!.getAttribute("visibility")).toBeNull();
  });

  it("rejects an unknown preset name before anything changes", async () => {
    const decorate = recorder();
    const { chart } = setup({ on: { decorate: decorate.effect } });
    await expect(chart.update({ on: { decorate: "nope" }, label: "Other" })).rejects.toThrow(/Unknown preset "nope"/);
    expect(chart.element.getAttribute("aria-label")).toBe("Shot outcomes");
    expect(runs(decorate.log)).toEqual(["run Goal", "run Saved", "run Off target", "run Blocked"]);
  });
});

describe("donutChart: leave()", () => {
  it("ends the hover, pointer or keyboard, and leaves focus where it is", () => {
    const hover = recorder();
    const { chart, svg, mark } = setup({ on: { hover: hover.effect } });
    const events: string[] = [];
    chart.on("leave", (event) => events.push(`leave ${event.mark.key}`));
    pointer("pointerover", mark("Saved").querySelector(".ec-slice")!);
    chart.leave();
    expect(events).toEqual(["leave Saved"]);
    expect(svg.classList.contains("ec-hovering")).toBe(false);

    chart.focus("Blocked");
    chart.leave();
    expect(events).toEqual(["leave Saved", "leave Blocked"]);
    expect(hover.log).toEqual(["run Saved", "clear", "run Blocked", "clear"]);
    expect(document.activeElement?.getAttribute("data-key")).toBe("Blocked");
    expect(svg.querySelector(".ec-overlay .ec-focus-ring")!.getAttribute("visibility")).toBeNull();
    chart.leave();
    expect(events).toHaveLength(2);
  });
});

describe("donutChart: table.series", () => {
  const headers = (container: Element) => Array.from(container.querySelectorAll(".ec-table thead th"), (th) => th.textContent);

  it("names the value column, which seriesLabels alone would rename everywhere", async () => {
    const { container, chart, mark, settle } = setup({ table: { series: { shots: "Shots" } } });
    expect(headers(container)).toEqual(["outcome", "Shots", "Share"]);
    // The slices' names and the centre keep the series' own name.
    expect(mark("Saved").getAttribute("aria-label")).toBe("Saved: 112 shots, 28%");
    expect(container.querySelector(".ec-center")!.textContent).toContain("shots");
    await settle(chart.update({ seriesLabels: { shots: "attempts" }, table: true }));
    expect(headers(container)).toEqual(["outcome", "attempts", "Share"]);
  });
});
