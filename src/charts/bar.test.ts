import { createMotion, manualClock, type DataEffect, type EffectContext, type GeometryEffect, type MarkGeometry, type MotionMode } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { barChart, type ChartEnv } from "./bar";
import type { BarChartOptions } from "./types";

interface Player {
  name: string;
  goals: number;
  assists: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 16, assists: 4 },
  { name: "Tanaka", goals: 6, assists: 10 },
  { name: "Lindqvist", goals: 10, assists: 7 }
];

/** A motion whose device never asks for reduced motion. */
function quietMotion(mode: MotionMode = "presentation") {
  return createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
}

function setup(options: Partial<BarChartOptions<Player>> = {}, more: Partial<ChartEnv> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const clock = manualClock();
  const presets = createRegistry<PresetFactory>({ kind: "preset" });
  const env: ChartEnv = { presets, icons: { get: () => undefined }, motion: quietMotion(), clock, ...more };
  const chart = barChart<Player>(container, { label: "Goals by player", data: players, y: "name", x: "goals", width: 600, ...options }, env);
  const svg = chart.element;
  const mark = (key: string) => svg.querySelector(`.ec-mark[data-key="${key}"]`) as SVGGElement;
  const keys = () => Array.from(svg.querySelectorAll(".ec-marks > .ec-mark"), (g) => g.getAttribute("data-key"));
  return { container, chart, svg, clock, env, presets, mark, keys };
}

function pointer(type: string, target: Element, pointerType = "mouse"): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType }));
}

function tap(target: Element): void {
  pointer("pointerdown", target, "touch");
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

/** An effect that logs what the runner does with it. `hold` keeps run() pending until released or aborted. */
function recorder(options: { hold?: boolean; draw?: (mark: MarkGeometry, ctx: EffectContext) => void } = {}) {
  const log: string[] = [];
  const releases: (() => void)[] = [];
  const effect: GeometryEffect = {
    kind: "geometry",
    run(mark, ctx) {
      log.push(ctx.previous ? `run ${mark.key} from ${Math.round(ctx.previous.bounds.width)}` : `run ${mark.key}`);
      ctx.onChange((moved) => log.push(`change ${moved.key}`));
      options.draw?.(mark, ctx);
      if (!options.hold) return Promise.resolve();
      return new Promise<void>((resolve) => {
        releases.push(resolve);
        ctx.signal.addEventListener("abort", () => resolve());
      });
    },
    end(mark) {
      log.push(`end ${mark.key}`);
    },
    clear() {
      log.push("clear");
    }
  };
  return { effect, log, release: () => releases.splice(0).forEach((resolve) => resolve()) };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.textContent = "";
  vi.unstubAllGlobals();
});

describe("barChart: drawing", () => {
  it("draws keyed marks from describe.bar, with labels and values", () => {
    const { svg, chart, mark, keys } = setup();
    expect(svg.getAttribute("class")).toBe("ec-chart ec-bar-chart");
    expect(svg.getAttribute("aria-label")).toBe("Goals by player");
    expect(svg.getAttribute("viewBox")).toBe(`0 0 600 ${4 + 3 * 34 + 26}`);
    expect(keys()).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
    const okafor = mark("Okafor");
    expect(Array.from(okafor.children, (child) => child.getAttribute("class"))).toEqual(["ec-hit", "ec-label", "ec-body", "ec-value"]);
    expect(okafor.querySelector(".ec-label")?.textContent).toBe("Okafor");
    expect(okafor.querySelector(".ec-value")?.textContent).toBe("16");
    const segments = okafor.querySelectorAll(".ec-body > .ec-segment");
    expect(segments).toHaveLength(1);
    expect(segments[0]!.getAttribute("data-series")).toBe("goals");
    const geometry = chart.marks()[0]!;
    expect(geometry.key).toBe("Okafor");
    expect(segments[0]!.getAttribute("d")).toBe(geometry.segments![0]!.outline.d);
  });

  it("draws gridlines, the baseline and ticks with theme classes, below the marks", () => {
    const { svg } = setup();
    expect(Array.from(svg.children, (child) => child.getAttribute("class"))).toEqual(["ec-grid", "ec-axis", "ec-marks", "ec-overlay"]);
    const lines = Array.from(svg.querySelectorAll(".ec-grid line"), (line) => line.getAttribute("class"));
    expect(lines).toEqual(["ec-baseline", "ec-gridline", "ec-gridline", "ec-gridline", "ec-gridline"]);
    expect(Array.from(svg.querySelectorAll(".ec-axis .ec-tick"), (t) => t.textContent)).toEqual(["0", "5", "10", "15", "20"]);
  });

  it("draws one path per stacked series, from the baseline", () => {
    const { mark, chart } = setup({ stack: ["goals", "assists"] });
    const paths = Array.from(mark("Tanaka").querySelectorAll(".ec-segment"));
    expect(paths.map((p) => p.getAttribute("data-series"))).toEqual(["goals", "assists"]);
    expect(paths[1]!.getAttribute("d")).toBe(chart.marks()[1]!.segments![1]!.outline.d);
    expect(mark("Tanaka").querySelector(".ec-value")?.textContent).toBe("16");
  });

  it("draws columns when the category is on x", () => {
    const { svg, chart } = setup({ x: "name", y: "goals" });
    expect(svg.getAttribute("viewBox")).toBe("0 0 600 300");
    expect(chart.marks()[0]!.angle(0)).toBeCloseTo(-Math.PI / 2);
  });

  it("formats values and ticks, and describes the chart", () => {
    const { svg, mark } = setup({ format: (v) => `${v} g`, description: "Season to date" });
    expect(mark("Okafor").querySelector(".ec-value")?.textContent).toBe("16 g");
    expect(svg.querySelector(".ec-tick")?.textContent).toBe("0 g");
    expect(svg.firstElementChild?.tagName).toBe("desc");
    expect(svg.querySelector("desc")?.textContent).toBe("Season to date");
  });

  it("injects the shared stylesheet once", () => {
    setup();
    setup();
    expect(document.querySelectorAll("style[data-expressive-charts]")).toHaveLength(1);
  });

  it("takes a selector, and checks its options", () => {
    const host = document.createElement("section");
    host.id = "goals";
    document.body.appendChild(host);
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion: quietMotion() };
    const chart = barChart("#goals", { label: "Goals", data: players, y: "name", x: "goals", width: 400 }, env);
    expect(host.querySelector("svg")).toBe(chart.element);
    expect(() => barChart("#nothing", { label: "Goals", data: players, y: "name", x: "goals" }, env)).toThrow(/no element matches/);
    expect(() => barChart(host, { label: " ", data: players, y: "name", x: "goals" }, env)).toThrow(/needs a label/);
    expect(() => barChart(host, { label: "Goals", data: players, y: "name", x: "goals", width: -5 }, env)).toThrow(/width must be/);
  });

  it("leaves nothing behind when its first layout throws", () => {
    const observe = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe;
        unobserve() {}
        disconnect() {}
      }
    );
    const motion = quietMotion();
    const subscribe = vi.spyOn(motion, "subscribe");
    const container = document.body.appendChild(document.createElement("div"));
    const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion };
    expect(() => barChart(container, { label: "Goals", data: [...players, players[0]!], y: "name", x: "goals" }, env)).toThrow(/two rows have the key/);
    expect(container.childElementCount).toBe(0);
    expect(observe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("falls back to 640 px when the container has no width", () => {
    const { svg } = setup({ width: undefined });
    expect(svg.getAttribute("width")).toBe("640");
  });
});

describe("barChart: keys and colours", () => {
  it("keeps each mark's element and key across sorts", async () => {
    const { chart, mark, keys } = setup();
    const okafor = mark("Okafor");
    await chart.update({ sort: "value" });
    expect(keys()).toEqual(["Okafor", "Lindqvist", "Tanaka"]);
    await chart.update({ sort: "key" });
    expect(keys()).toEqual(["Lindqvist", "Okafor", "Tanaka"]);
    expect(chart.marks().map((m) => m.key)).toEqual(["Lindqvist", "Okafor", "Tanaka"]);
    expect(mark("Okafor")).toBe(okafor);
  });

  it("colours follow the series, never the rank or the view", async () => {
    const { chart, mark } = setup({ stack: ["goals", "assists"] });
    const color = (key: string, series: string) =>
      (mark(key).querySelector(`.ec-segment[data-series="${series}"]`) as SVGPathElement | null)?.style.getPropertyValue("--ec-mark");
    expect(color("Okafor", "goals")).toBe("var(--ec-series-1, #2a78d6)");
    expect(color("Okafor", "assists")).toBe("var(--ec-series-2, #eb6834)");
    await chart.update({ sort: "value" });
    expect(color("Tanaka", "assists")).toBe("var(--ec-series-2, #eb6834)");
    await chart.update({ stack: ["assists"] });
    expect(color("Tanaka", "goals")).toBeUndefined();
    expect(color("Tanaka", "assists")).toBe("var(--ec-series-2, #eb6834)");
  });

  it("uses pinned palette slots", () => {
    const { mark } = setup({ stack: ["goals", "assists"], colors: { goals: 1, assists: 4 } });
    const assists = mark("Okafor").querySelector('[data-series="assists"]') as SVGPathElement;
    expect(assists.style.getPropertyValue("--ec-mark")).toBe("var(--ec-series-4, #eda100)");
    expect(assists.style.getPropertyValue("--ec-mark-strong")).toBe("var(--ec-series-4-strong, #c98500)");
  });
});

describe("barChart: hover", () => {
  it("emphasises the hovered mark and dims the others", () => {
    const { chart, svg, mark } = setup({ stack: ["goals", "assists"] });
    const events: string[] = [];
    chart.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source} ${e.segment ?? "-"}`));
    chart.on("leave", (e) => events.push(`leave ${e.mark.key}`));
    pointer("pointerover", mark("Okafor").querySelector('[data-series="assists"]')!);
    expect(svg.classList.contains("ec-hovering")).toBe(true);
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(true);
    expect(mark("Tanaka").classList.contains("ec-hot")).toBe(false);
    pointer("pointerover", mark("Okafor").querySelector(".ec-label")!);
    pointer("pointerover", mark("Tanaka").querySelector(".ec-hit")!);
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(false);
    expect(mark("Tanaka").classList.contains("ec-hot")).toBe(true);
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    expect(mark("Tanaka").classList.contains("ec-hot")).toBe(false);
    expect(events).toEqual(["hover Okafor pointer assists", "leave Okafor", "hover Tanaka pointer -", "leave Tanaka"]);
  });

  it("leaves when the pointer moves off the marks", () => {
    const { svg, mark } = setup();
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    pointer("pointerover", svg.querySelector(".ec-tick")!);
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(false);
  });

  it("keeps the others at full opacity with dim: false", async () => {
    const { chart, svg, mark } = setup({ dim: false });
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(true);
    await chart.update({ dim: true });
    expect(svg.classList.contains("ec-hovering")).toBe(true);
  });

  it("times the CSS feedback with motion", () => {
    const motion = quietMotion();
    const { svg } = setup({}, { motion });
    expect(svg.style.getPropertyValue("--ec-hover-duration")).toBe("100ms");
    motion.chooseMode("off");
    expect(svg.style.getPropertyValue("--ec-hover-duration")).toBe("0ms");
  });

  it("treats a mode as the author's default: the viewer's choice and reduced motion still win", () => {
    const page = quietMotion();
    const { svg } = setup({ motion: "off" }, { motion: page });
    expect(svg.style.getPropertyValue("--ec-hover-duration")).toBe("0ms");
    page.chooseMode("presentation");
    expect(svg.style.getPropertyValue("--ec-hover-duration")).toBe("100ms");
    const reduced = createMotion({ reducedMotion: { matches: true, subscribe: () => () => {} } });
    expect(setup({ motion: "presentation" }, { motion: reduced }).svg.style.getPropertyValue("--ec-hover-duration")).toBe("0ms");
  });

  it("treats a tap as hover until a tap elsewhere", () => {
    const { chart, svg, mark } = setup();
    const events: string[] = [];
    chart.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source}`));
    chart.on("leave", (e) => events.push(`leave ${e.mark.key}`));
    // Touch fires pointerover and pointerleave around a tap; they don't count.
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!, "touch");
    expect(events).toEqual([]);
    tap(mark("Okafor").querySelector(".ec-hit")!);
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "touch" }));
    expect(mark("Okafor").classList.contains("ec-hot")).toBe(true);
    tap(mark("Okafor").querySelector(".ec-segment")!);
    tap(mark("Tanaka").querySelector(".ec-label")!);
    pointer("pointerdown", document.body, "touch");
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    expect(events).toEqual(["hover Okafor touch", "leave Okafor", "hover Tanaka touch", "leave Tanaka"]);
  });
});

describe("barChart: effects", () => {
  it("starts decorate and enter on every mark, in order", () => {
    const enter = recorder();
    const decorate = recorder();
    setup({ on: { enter: enter.effect, decorate: decorate.effect } });
    expect(enter.log).toEqual(["run Okafor", "run Tanaka", "run Lindqvist"]);
    expect(decorate.log).toEqual(["run Okafor", "run Tanaka", "run Lindqvist"]);
  });

  it("plays hover on the hovered mark and clears it on leave", () => {
    const hover = recorder();
    const { mark, svg } = setup({ on: { hover: hover.effect } });
    pointer("pointerover", mark("Tanaka").querySelector(".ec-hit")!);
    expect(hover.log).toEqual(["run Tanaka"]);
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(hover.log).toEqual(["run Tanaka", "clear"]);
  });

  it("resolves preset names through the presets it's handed", () => {
    const hover = recorder();
    const presets = createRegistry<PresetFactory>({ kind: "preset" });
    presets.register("nudge", () => hover.effect);
    const { mark } = setup({ on: { hover: "nudge" } }, { presets });
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    expect(hover.log).toEqual(["run Okafor"]);
    expect(() => setup({ on: { hover: "wigle" } })).toThrow(/Unknown preset "wigle"/);
  });

  it("draws runs in the overlay, above the marks, in the mark's colour", () => {
    const hover = recorder({ draw: (mark, ctx) => ctx.layer.path(mark.outline.d, { stroke: "mark", width: 2 }) });
    const { svg, mark } = setup({ on: { hover: hover.effect }, colors: { goals: 3 } });
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    const run = svg.querySelector(".ec-overlay > .ec-run") as SVGGElement;
    expect(run.getAttribute("data-key")).toBe("Okafor");
    expect(run.getAttribute("data-slot")).toBe("hover");
    expect(run.style.getPropertyValue("--ec-mark")).toBe("var(--ec-series-3, #1baf7a)");
    expect(run.querySelector("path")?.getAttribute("d")).toBe(mark("Okafor").querySelector(".ec-segment")?.getAttribute("d"));
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(svg.querySelector(".ec-overlay")?.childElementCount).toBe(0);
  });

  it("restyles the mark's body through ctx.mark, and resets it when the run is cleared", () => {
    const hover = recorder({ draw: (_mark, ctx) => ctx.mark.set({ opacity: 0.5, halo: { width: 8, opacity: 0.35 } }) });
    const { svg, mark } = setup({ on: { hover: hover.effect } });
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    const body = mark("Okafor").querySelector(".ec-body")!;
    expect(body.getAttribute("opacity")).toBe("0.5");
    expect(body.querySelectorAll(".ec-halo path")).toHaveLength(1);
    svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    expect(body.getAttribute("opacity")).toBeNull();
    expect(body.querySelector(".ec-halo")).toBeNull();
  });

  it("runs update effects only where values changed, with the previous geometry; moved marks get change()", async () => {
    const update = recorder();
    const decorate = recorder();
    const { chart } = setup({ on: { update: update.effect, decorate: decorate.effect } });
    const events: string[] = [];
    chart.on("update", (e) => events.push(`update ${e.mark.key} ${e.batch.index}/${e.batch.count} from ${Math.round(e.from.bounds.width)}`));
    const before = Math.round(chart.marks()[1]!.bounds.width);
    decorate.log.length = 0;
    await chart.update({ data: players.map((p) => (p.name === "Tanaka" ? { ...p, goals: 7 } : p)) });
    // The runner's order is update, then change(): a jump is a transition of one frame.
    expect(update.log).toEqual([`run Tanaka from ${before}`, "change Tanaka"]);
    expect(events).toEqual([`update Tanaka 0/1 from ${before}`]);
    // Nothing else changed value or place, so only Tanaka's decoration hears about it.
    expect(decorate.log).toEqual(["change Tanaka"]);
    decorate.log.length = 0;
    await chart.update({ sort: "value" });
    expect(update.log.filter((entry) => entry.startsWith("run"))).toHaveLength(1);
    expect(decorate.log.sort()).toEqual(["change Lindqvist", "change Tanaka"]);
  });

  it("replays hover after an update", async () => {
    const hover = recorder();
    const { chart, mark } = setup({ on: { hover: hover.effect } });
    pointer("pointerover", mark("Tanaka").querySelector(".ec-hit")!);
    await chart.update({ sort: "key" });
    expect(hover.log).toEqual(["run Tanaka", "clear", "run Tanaka"]);
    expect(mark("Tanaka").classList.contains("ec-hot")).toBe(true);
  });

  it("removes a mark once its exit effect is done", async () => {
    const exit = recorder({ hold: true });
    const { chart, mark, keys } = setup({ on: { exit: exit.effect } });
    const events: string[] = [];
    chart.on("exit", (e) => events.push(`exit ${e.mark.key}`));
    const updated = chart.update({ data: players.filter((p) => p.name !== "Tanaka") });
    expect(exit.log).toEqual(["run Tanaka"]);
    expect(events).toEqual(["exit Tanaka"]);
    expect(mark("Tanaka").classList.contains("ec-leaving")).toBe(true);
    expect(chart.marks().map((m) => m.key)).toEqual(["Okafor", "Lindqvist"]);
    await flush();
    expect(keys()).toContain("Tanaka");
    exit.release();
    await updated;
    expect(keys()).toEqual(["Okafor", "Lindqvist"]);
  });

  it("keeps the element of a mark that comes back mid-exit", async () => {
    const exit = recorder({ hold: true });
    const enter = recorder();
    const { chart, mark } = setup({ on: { exit: exit.effect, enter: enter.effect } });
    const tanaka = mark("Tanaka");
    const leaving = chart.update({ data: players.filter((p) => p.name !== "Tanaka") });
    const back = chart.update({ data: players });
    await Promise.all([leaving, back]);
    expect(mark("Tanaka")).toBe(tanaka);
    expect(tanaka.classList.contains("ec-leaving")).toBe(false);
    expect(enter.log.filter((entry) => entry.startsWith("run"))).toEqual(["run Okafor", "run Tanaka", "run Lindqvist", "run Tanaka"]);
  });

  it("emits enter events with their batch", async () => {
    const { chart } = setup();
    const events: string[] = [];
    chart.on("enter", (e) => events.push(`${e.mark.key} ${e.batch.index}/${e.batch.count} ${e.data.datum.name}`));
    await chart.update({ data: [...players, { name: "Moreau", goals: 8, assists: 3 }, { name: "Reyes", goals: 5, assists: 4 }] });
    expect(events).toEqual(["Moreau 0/2 Moreau", "Reyes 1/2 Reyes"]);
  });

  it("leaves a hovered mark that exits", async () => {
    const { chart, svg, mark } = setup();
    const events: string[] = [];
    chart.on("leave", (e) => events.push(`leave ${e.mark.key}`));
    pointer("pointerover", mark("Tanaka").querySelector(".ec-hit")!);
    await chart.update({ data: players.filter((p) => p.name !== "Tanaka") });
    expect(events).toEqual(["leave Tanaka"]);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
  });

  it("contains a listener that throws", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const { chart, mark } = setup();
    const after = vi.fn();
    chart.on("hover", () => {
      throw new Error("listener");
    });
    chart.on("hover", after);
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "listener" }));
    expect(after).toHaveBeenCalledOnce();
  });

  it("checks the series data effects need, when created and on update", async () => {
    const seen: (number | undefined)[] = [];
    const needsAssists: DataEffect<Player> = {
      kind: "data",
      needs: { related: ["assists"] },
      run: async (_mark, data) => {
        seen.push(data.related("assists")?.samples[1]?.value);
      },
      end: () => {},
      clear: () => {}
    };
    expect(() => setup({ on: { decorate: needsAssists } })).toThrow(/on\.decorate needs the series "assists", but the chart's series are "goals"/);
    const { chart, mark } = setup({ stack: ["goals", "assists"], on: { decorate: needsAssists } });
    expect(seen[0]).toBeCloseTo(20);
    await expect(chart.update({ stack: ["goals"] })).rejects.toThrow(/needs the series "assists"/);
    expect(mark("Okafor").querySelectorAll(".ec-segment")).toHaveLength(2);
  });

  it("recolours overlays drawn in the mark's colour when that colour changes", async () => {
    const decorate = recorder({ draw: (mark, ctx) => ctx.layer.path(mark.outline.d, { stroke: "mark" }) });
    const { chart, svg } = setup({ on: { decorate: decorate.effect } });
    const run = () => (svg.querySelector('.ec-run[data-key="Okafor"]') as SVGGElement).style.getPropertyValue("--ec-mark");
    expect(run()).toBe("var(--ec-series-1, #2a78d6)");
    await chart.update({ colors: { goals: 3 } });
    expect(run()).toBe("var(--ec-series-3, #1baf7a)");
    // A different first series: assists takes the first free slot.
    await chart.update({ stack: ["assists"] });
    expect(run()).toBe("var(--ec-series-1, #2a78d6)");
  });
});

describe("barChart: update", () => {
  it("jumps to the new state at once", () => {
    const { chart, mark } = setup();
    void chart.update({ stack: ["goals", "assists"], label: "Goals and assists" });
    expect(mark("Okafor").querySelectorAll(".ec-segment")).toHaveLength(2);
    expect(mark("Okafor").querySelector(".ec-value")?.textContent).toBe("20");
    expect(chart.element.getAttribute("aria-label")).toBe("Goals and assists");
  });

  it("rejects what it can't take, leaving the chart as it was", async () => {
    const { chart, keys } = setup();
    await expect(chart.update({ data: [...players, players[0]!] })).rejects.toThrow(/two rows have the key "Okafor"/);
    await expect(chart.update({ on: { hover: "wiggle" } })).rejects.toThrow(/`on` can't be changed/);
    await expect(chart.update({ motion: "off" })).rejects.toThrow(/`motion` can't be changed/);
    expect(keys()).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
  });

  it("unsubscribes listeners and rejects unknown events", () => {
    const { chart, mark } = setup();
    const listener = vi.fn();
    const off = chart.on("hover", listener);
    off();
    pointer("pointerover", mark("Okafor").querySelector(".ec-hit")!);
    expect(listener).not.toHaveBeenCalled();
    expect(() => chart.on("click" as never, () => {})).toThrow(/unknown event "click"/);
  });
});

describe("barChart: size", () => {
  function stubResizeObserver() {
    const observers: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];
    class FakeResizeObserver {
      readonly disconnect = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        observers.push({ callback, disconnect: this.disconnect });
      }
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const resize = (width: number) =>
      observers.forEach(({ callback }) => callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver));
    return { observers, resize };
  }

  it("follows the container's width on the next frame, without data events", () => {
    const { resize } = stubResizeObserver();
    const decorate = recorder();
    const { chart, svg, clock } = setup({ width: undefined, on: { decorate: decorate.effect } });
    const updates = vi.fn();
    chart.on("update", updates);
    decorate.log.length = 0;
    resize(400);
    resize(420);
    expect(svg.getAttribute("width")).toBe("640");
    clock.advance(16);
    expect(svg.getAttribute("width")).toBe("420");
    expect(svg.getAttribute("viewBox")).toMatch(/^0 0 420 /);
    expect(decorate.log).toEqual(["change Okafor", "change Tanaka", "change Lindqvist"]);
    expect(updates).not.toHaveBeenCalled();
  });

  it("keeps a fixed width", () => {
    const { resize } = stubResizeObserver();
    const { svg, clock } = setup({ width: 500 });
    resize(300);
    clock.advance(16);
    expect(svg.getAttribute("width")).toBe("500");
  });

  it("stops observing on destroy", () => {
    const { observers } = stubResizeObserver();
    setup({ width: undefined }).chart.destroy();
    expect(observers[0]!.disconnect).toHaveBeenCalled();
  });
});

describe("barChart: destroy", () => {
  it("clears every effect, stops listening and removes the chart", () => {
    const hover = recorder();
    const decorate = recorder();
    const motion = quietMotion();
    const { chart, svg, container, mark } = setup({ on: { hover: hover.effect, decorate: decorate.effect } }, { motion });
    const target = mark("Okafor").querySelector(".ec-hit")!;
    pointer("pointerover", target);
    const listener = vi.fn();
    chart.on("leave", listener);
    chart.destroy();
    expect(hover.log).toEqual(["run Okafor", "clear"]);
    expect(decorate.log.filter((entry) => entry === "clear")).toHaveLength(3);
    expect(container.contains(svg)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    pointer("pointerover", target);
    motion.chooseMode("off");
    expect(hover.log).toEqual(["run Okafor", "clear"]);
    expect(() => chart.destroy()).not.toThrow();
    return expect(chart.update({ sort: "key" })).resolves.toBeUndefined();
  });
});
