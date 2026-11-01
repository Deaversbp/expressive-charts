// link(): hover across charts and attachments by a shared value. Bars of goals per matchweek, the
// goals vs xG line, D3 columns of shots through expressive() and Vega bars through fromVegaView(),
// with real D3 and Vega (pinned dev dependencies).

import { select } from "d3-selection";
import { View, parse } from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import { createMotion, manualClock, type GeometryEffect } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { flush, play } from "../core/testing";
import { expressive, fromVegaView } from "./adapter";
import { barChart } from "./bar";
import { donutChart } from "./donut";
import { lineChart } from "./line";
import { link, type LinkOptions } from "./link";
import type { ChartEnv } from "./shell/setup";
import { chartSwitch } from "./switch";
import type { Chart, LineChartOptions, MarkEvent, MarkEvents } from "./types";

interface Week {
  week: number;
  goals: number;
  xg: number;
  shots: number;
}

const weeks: Week[] = [
  { week: 1, goals: 0, xg: 1.2, shots: 9 },
  { week: 2, goals: 2, xg: 2.1, shots: 14 },
  { week: 3, goals: 1, xg: 1.5, shots: 11 },
  { week: 4, goals: 3, xg: 2.4, shots: 16 }
];

function environment(): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock: manualClock() };
}

function container(): HTMLDivElement {
  return document.body.appendChild(document.createElement("div"));
}

/** An effect that logs its runs and ends. */
function recorder() {
  const log: string[] = [];
  const effect: GeometryEffect = {
    kind: "geometry",
    run(mark) {
      log.push(`run ${mark.key}`);
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

/** Records hover and leave as "hover goals@2 linked 1/2" and "leave goals@2". */
function listen<D = Week>(source: { on<K extends keyof MarkEvents<D>>(type: K, listener: (event: MarkEvents<D>[K]) => void): () => void }): string[] {
  const events: string[] = [];
  source.on("hover", (e) => events.push(`hover ${e.mark.key} ${e.source} ${e.batch.index + 1}/${e.batch.count}`));
  source.on("leave", (e) => events.push(`leave ${e.mark.key}`));
  return events;
}

/** Goals per matchweek as columns, keyed by matchweek ("2"), and the goals vs xG line on the same env. */
function season(more: { bars?: Parameters<typeof barChart<Week>>[1]["on"]; line?: Parameters<typeof lineChart<Week>>[1]["on"]; announce?: boolean } = {}) {
  const env = environment();
  const barHover = recorder();
  const lineHover = recorder();
  const barHost = container();
  const lineHost = container();
  const bars = barChart<Week>(
    barHost,
    { label: "Goals per matchweek", data: weeks, x: (d) => String(d.week), y: "goals", orientation: "vertical", width: 400, announce: more.announce ?? false, on: more.bars ?? { hover: barHover.effect } },
    env
  );
  const line = lineChart<Week>(lineHost, { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 400, announce: more.announce ?? false, on: more.line ?? { hover: lineHover.effect } }, env);
  const bar = (key: string) => bars.element.querySelector(`.ec-mark[data-key="${key}"]`) as SVGGElement;
  const column = (key: string) => line.element.querySelector(`.ec-column[data-key="${key}"]`) as SVGGElement;
  const point = (key: string) => line.element.querySelector(`.ec-point[data-key="${key}"]`) as SVGGElement;
  const hot = (chart: Chart<Week, unknown>) => Array.from(chart.element.querySelectorAll(".ec-hot"), (element) => element.getAttribute("data-key"));
  const tip = (host: HTMLElement) => host.querySelector(".ec-tooltip")?.classList.contains("ec-tooltip-shown") === true;
  return { env, bars, line, bar, column, point, hot, tip, barHost, lineHost, barHover, lineHover };
}

/** D3 columns of shots per matchweek, joined with d3-selection: 50 px a column, 5 px a shot. */
function d3Shots(rows: readonly Week[] = weeks) {
  const svg = select(document.body).append("svg").attr("width", 200).attr("height", 100).attr("viewBox", "0 0 200 100");
  const plot = svg.append("g").attr("class", "shots");
  plot
    .selectAll("rect")
    .data(rows)
    .join("rect")
    .attr("x", (_d, i) => i * 50)
    .attr("y", (d) => 100 - d.shots * 5)
    .attr("width", 40)
    .attr("height", (d) => d.shots * 5);
  // The attachment's overlay draws rects of its own, outside the plot.
  const selection = () => plot.selectAll<SVGRectElement, Week>("rect");
  const rect = (week: number) => selection().filter((d) => d.week === week).node()!;
  return { svg: svg.node()!, selection, rect };
}

/** Vega-Lite bars of shots per matchweek, rendered as SVG. */
async function vegaShots(): Promise<{ view: View; svg: SVGSVGElement; rect: (week: number) => Element }> {
  const spec: TopLevelSpec = {
    width: 200,
    height: 100,
    data: { values: weeks },
    mark: "bar",
    encoding: { x: { field: "week", type: "ordinal" }, y: { field: "shots", type: "quantitative" } }
  };
  const host = container();
  const view = new View(parse(compile(spec).spec), { renderer: "svg", container: host });
  await view.runAsync();
  const svg = host.querySelector("svg")!;
  const rect = (week: number) =>
    Array.from(svg.querySelectorAll(".mark-rect.role-mark path")).find((path) => (path as unknown as { __data__: { datum: Week } }).__data__.datum.week === week)!;
  return { view, svg, rect };
}

/**
 * Shots per matchweek as a donut and as columns in a chart switch, keyed by matchweek ("2"), on the
 * env given, so its clock plays the switch. The transition ends at once: the switch's own 950 ms decide when it lands.
 */
function shotsSwitch(env: ReturnType<typeof environment>) {
  const donutHover = recorder();
  const columnHover = recorder();
  const switcher = chartSwitch(
    container(),
    {
      views: {
        donut: (host, colors) => donutChart<Week>(host, { label: "Shots", data: weeks, category: (d) => String(d.week), value: "shots", colors, width: 300, on: { hover: donutHover.effect } }, env),
        columns: (host, colors) => barChart<Week>(host, { label: "Shots", data: weeks, x: (d) => String(d.week), y: "shots", orientation: "vertical", colors, width: 400, on: { hover: columnHover.effect } }, env)
      },
      initial: "donut",
      transition: { kind: "transition", run: () => Promise.resolve(), end() {}, clear() {} }
    },
    env
  );
  const donut = switcher.chart("donut");
  const columns = switcher.chart("columns");
  const slice = (key: string) => donut.element.querySelector(`.ec-mark[data-key="${key}"]`) as SVGGElement;
  const column = (key: string) => columns.element.querySelector(`.ec-mark[data-key="${key}"]`) as SVGGElement;
  /** Lets the switch play to its end and land. */
  const land = async () => {
    env.clock.advance(950);
    await flush();
  };
  return { switcher, donut, columns, slice, column, land, donutHover, columnHover };
}

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
}

/** A key press on `target`. The document hears it first, as it would in a browser. */
function press(target: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** Tab into a chart: a key press, then focus lands on the element Tab reaches. */
function tabTo(target: SVGElement): void {
  press(document.body, "Tab");
  target.focus();
}

afterEach(() => {
  document.body.textContent = "";
});

describe("link: charts", () => {
  it("links columns and a line by matchweek, both ways, with the linked charts' hover effects", () => {
    const { bars, line, bar, column, hot, barHover, lineHover } = season();
    link([bars, line]);
    const barEvents = listen(bars);
    const lineEvents = listen(line);

    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    expect(barEvents).toEqual(["hover 2 pointer 1/1"]);
    // The line's x is the bar's matchweek: each series' point there, in one batch.
    expect(lineEvents).toEqual(["hover goals@2 linked 1/2", "hover xg@2 linked 2/2"]);
    expect(hot(line)).toEqual(["goals@2", "xg@2"]);
    expect(lineHover.log).toEqual(["run goals@2", "run xg@2"]);
    pointer("pointerleave", bars.element);
    expect(lineEvents.slice(2)).toEqual(["leave goals@2", "leave xg@2"]);
    expect(hot(line)).toEqual([]);

    pointer("pointerover", column("3").querySelector(".ec-hit")!);
    expect(barEvents.slice(2)).toEqual(["hover 3 linked 1/1"]);
    expect(hot(bars)).toEqual(["3"]);
    // The linked chart dims its other bars, as for any hover.
    expect(bars.element.classList.contains("ec-hovering")).toBe(true);
    expect(barHover.log).toEqual(["run 2", "clear", "run 3"]);
    pointer("pointerleave", line.element);
    expect(barEvents.slice(3)).toEqual(["leave 3"]);
    expect(bars.element.classList.contains("ec-hovering")).toBe(false);
  });

  it("gives a linked chart no tooltip, focus ring or focus, and announces nothing", () => {
    const { bars, line, bar, column, tip, barHost, lineHost } = season({ announce: true });
    link([bars, line]);
    const button = document.body.appendChild(document.createElement("button"));
    button.focus();
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    expect(tip(barHost)).toBe(true);
    expect(tip(lineHost)).toBe(false);
    expect(line.element.querySelector(".ec-crosshair")!.getAttribute("visibility")).toBe("hidden");
    expect(line.element.querySelector(".ec-focus")!.getAttribute("visibility")).toBe("hidden");
    expect(document.activeElement).toBe(button);
    pointer("pointerleave", bars.element);
    pointer("pointerover", column("3").querySelector(".ec-hit")!);
    expect(tip(barHost)).toBe(false);
    expect(bars.element.querySelector(".ec-focus")!.getAttribute("visibility")).toBe("hidden");
    expect(document.activeElement).toBe(button);
    for (const host of [barHost, lineHost]) expect(host.querySelector(".ec-announcer")?.textContent ?? "").toBe("");
  });

  it("follows the keyboard, and ends every linked hover on Escape or the origin's leave()", () => {
    const { bars, line, bar, point, hot } = season();
    link([bars, line]);
    const lineEvents = listen(line);
    tabTo(bar("1"));
    expect(hot(line)).toEqual(["goals@1", "xg@1"]);
    press(bar("1"), "ArrowRight");
    expect(hot(line)).toEqual(["goals@2", "xg@2"]);
    expect(press(bar("2"), "Escape").defaultPrevented).toBe(true);
    expect(hot(line)).toEqual([]);
    expect(document.activeElement).toBe(bar("2"));

    // Escape anywhere ends a pointer hover, and the link's with it.
    (document.activeElement as HTMLElement).blur();
    pointer("pointerover", bar("4").querySelector(".ec-segment")!);
    expect(point("goals@4").classList.contains("ec-hot")).toBe(true);
    press(document.body, "Escape");
    expect(hot(line)).toEqual([]);

    pointer("pointerleave", bars.element);
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    expect(hot(line)).toEqual(["goals@3", "xg@3"]);
    bars.leave();
    expect(hot(line)).toEqual([]);
    expect(lineEvents.filter((event) => event.startsWith("hover")).every((event) => event.includes(" linked "))).toBe(true);
  });

  it("shows the newest hover in the link, and Escape on a linked chart ends it where it started", () => {
    const { bars, line, bar, column, hot, tip, barHost } = season();
    link([bars, line]);
    const lineEvents = listen(line);
    tabTo(column("1"));
    expect(hot(bars)).toEqual(["1"]);
    // The pointer on a bar is newer: the line shows the link's hover instead of its focus's.
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    expect(lineEvents).toEqual(["hover goals@1 keyboard 1/2", "hover xg@1 keyboard 2/2", "leave goals@1", "leave xg@1", "hover goals@3 linked 1/2", "hover xg@3 linked 2/2"]);
    expect(hot(bars)).toEqual(["3"]);
    expect(tip(barHost)).toBe(true);
    // Escape where focus is ends the bar's hover too, and its tooltip.
    expect(press(column("1"), "Escape").defaultPrevented).toBe(true);
    expect(hot(bars)).toEqual([]);
    expect(hot(line)).toEqual([]);
    expect(tip(barHost)).toBe(false);
    expect(document.activeElement).toBe(column("1"));
  });

  it("links nothing when a hover listener ends the hover it hears", () => {
    const { bars, line, bar, hot } = season();
    link([bars, line]);
    let cancel = true;
    bars.on("hover", (event) => {
      if (event.source === "pointer" && cancel) bars.leave();
    });
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    expect(hot(bars)).toEqual([]);
    expect(hot(line)).toEqual([]);
    // The link has no origin left over: the next hover links as usual, and its leave ends it.
    cancel = false;
    pointer("pointerleave", bars.element);
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    expect(hot(line)).toEqual(["goals@3", "xg@3"]);
    bars.leave();
    expect(hot(line)).toEqual([]);
  });

  it("leaves a linked chart's hover with its leave(), the origin's going on", () => {
    const { bars, line, bar, hot } = season();
    link([bars, line]);
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    line.leave();
    expect(hot(line)).toEqual([]);
    expect(hot(bars)).toEqual(["2"]);
  });

  it("hovers nothing where no target has the value: past a line's reveal, or a value it doesn't have", () => {
    const { bars, line, bar, hot } = season();
    link([bars, line]);
    line.reveal(2);
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    expect(hot(line)).toEqual([]);
    pointer("pointerleave", bars.element);
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    expect(hot(line)).toEqual(["goals@2", "xg@2"]);
  });

  it("links by `by`, typed by the rows, and hovers every target a value is shared by in one batch", () => {
    const env = environment();
    const named = barChart<Week>(container(), { label: "Goals", data: weeks, x: (d) => `Matchweek ${d.week}`, y: "goals", orientation: "vertical", width: 400 }, env);
    const line = lineChart<Week>(container(), { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 400 }, env);
    const bar = (key: string) => named.element.querySelector(`.ec-mark[data-key="${key}"] .ec-segment`)!;
    const lineEvents = listen(line);
    // Keys don't match: "Matchweek 2" and x 2.
    const byKey = link([named, line]);
    pointer("pointerover", bar("Matchweek 2"));
    expect(lineEvents).toEqual([]);
    pointer("pointerleave", named.element);
    byKey.destroy();

    const half = link([named, line], { by: (event) => (event.data.datum.week <= 2 ? "first half" : "second half") });
    pointer("pointerover", bar("Matchweek 1"));
    expect(lineEvents).toEqual(["hover goals@1 linked 1/4", "hover xg@1 linked 2/4", "hover goals@2 linked 3/4", "hover xg@2 linked 4/4"]);
    pointer("pointerleave", named.element);
    half.destroy();

    link([named, line], { by: (event) => event.data.datum.week });
    lineEvents.length = 0;
    pointer("pointerover", bar("Matchweek 4"));
    expect(lineEvents).toEqual(["hover goals@4 linked 1/2", "hover xg@4 linked 2/2"]);

    // `by` reads the sources' rows.
    // @ts-expect-error: a Week has no `player`.
    const typed = () => link([named, line], { by: (event) => event.data.datum.player });
    expect(typed).toBeTypeOf("function");
  });

  it("links a time axis by each x's ISO string, as keys are", () => {
    const env = environment();
    const dated = weeks.map((row) => ({ ...row, date: new Date(Date.UTC(2026, 7, 7 * row.week)) }));
    const bars = barChart(container(), { label: "Goals", data: dated, x: (d) => d.date.toISOString().slice(0, 10), key: (d) => d.date.toISOString(), y: "goals", orientation: "vertical", width: 400 }, env);
    const line = lineChart(container(), { label: "Goals", data: dated, x: "date", series: ["goals"], width: 400 }, env);
    link([bars, line]);
    pointer("pointerover", bars.element.querySelector(`.ec-mark[data-key="${dated[2]!.date.toISOString()}"] .ec-segment`)!);
    expect(Array.from(line.element.querySelectorAll(".ec-hot"), (element) => element.getAttribute("data-key"))).toEqual([`goals@${dated[2]!.date.toISOString()}`]);
  });

  it("keeps linked marks to emphasis and dimming with effects: false, and still fires their events", () => {
    const { bars, line, bar, column, hot, barHover, lineHover } = season();
    link([bars, line], { effects: false });
    const barEvents = listen(bars);
    pointer("pointerover", column("2").querySelector(".ec-hit")!);
    expect(hot(bars)).toEqual(["2"]);
    expect(bars.element.classList.contains("ec-hovering")).toBe(true);
    expect(barEvents).toEqual(["hover 2 linked 1/1"]);
    expect(barHover.log).toEqual([]);
    // The origin's own hover plays its effects.
    expect(lineHover.log).toEqual(["run goals@2", "run xg@2"]);
    pointer("pointerleave", line.element);
    const runs = lineHover.log.length;
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    expect(hot(line)).toEqual(["goals@3", "xg@3"]);
    expect(lineHover.log.slice(runs)).toEqual([]);
    expect(barHover.log).toEqual(["run 3"]);
  });

  it("holds a linked hover while its chart is mid-change and replays it when the change settles", async () => {
    const { env, bars, line, column, hot, barHover } = season();
    link([bars, line]);
    const updating = bars.update({ data: weeks.map((row) => ({ ...row, goals: row.goals + 1 })) });
    pointer("pointerover", column("2").querySelector(".ec-hit")!);
    expect(hot(bars)).toEqual(["2"]);
    expect(barHover.log).toEqual([]);
    await play(env.clock, updating);
    expect(barHover.log).toEqual(["run 2"]);
    expect(hot(bars)).toEqual(["2"]);
  });

  it("drops a destroyed source, and ends the link's hover when the origin is destroyed", () => {
    const { bars, line, bar } = season();
    const shots = d3Shots();
    const fx = expressive(shots.selection(), { key: (d) => String(d.week), dim: true }, environment());
    const fxEvents = listen(fx);
    link([bars, line, fx]);
    line.destroy();
    expect(() => pointer("pointerover", bar("2").querySelector(".ec-segment")!)).not.toThrow();
    expect(shots.rect(2).classList.contains("ec-dimmed")).toBe(false);
    expect(shots.rect(1).classList.contains("ec-dimmed")).toBe(true);
    bars.destroy();
    expect(fxEvents).toEqual(["hover 2 linked 1/1", "leave 2"]);
    expect(shots.rect(1).classList.contains("ec-dimmed")).toBe(false);
    // A destroyed source left its link, and drops out of a new one.
    expect(() => link([line, bars]).destroy()).not.toThrow();
    expect(() => link([fx])).toThrow(/one link at a time/);
  });

  it("can't put a source in two links, or link what isn't a chart or attachment", () => {
    const { bars, line } = season();
    const first = link([bars, line]);
    expect(() => link([line])).toThrow(TypeError);
    expect(() => link([line])).toThrow(/one link at a time/);
    first.destroy();
    expect(() => link([line, line])).toThrow(/one link at a time/);
    // Nothing was linked by the throw: a link of its own works.
    const again = link([bars, line]);
    again.destroy();
    const env = environment();
    const switcher = chartSwitch(
      container(),
      {
        views: { columns: (host, colors) => barChart<Week>(host, { label: "Goals", data: weeks, x: (d) => String(d.week), y: "goals", orientation: "vertical", colors, width: 400 }, env) },
        initial: "columns",
        transition: { kind: "transition", run: () => Promise.resolve(), end() {}, clear() {} }
      },
      env
    );
    // A chart switch is a source since M9 step 2 ("link: a chart switch" below).
    link([bars, switcher]).destroy();
    expect(() => link([bars, {} as never])).toThrow(/must be a chart/);
    expect(() => link("bars" as never)).toThrow(/needs an array/);
    expect(() => link([bars], { by: "week" as never })).toThrow(/by must be a function/);
    expect(() => link([bars], { effects: "no" as never })).toThrow(/effects must be true or false/);
    // A source that threw stays free.
    link([bars]).destroy();
  });

  it("stops linking on destroy(), ending linked hovers while the origin's own goes on", () => {
    const { bars, line, bar, hot } = season();
    const linked = link([bars, line]);
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    expect(hot(line)).toEqual(["goals@2", "xg@2"]);
    linked.destroy();
    expect(hot(line)).toEqual([]);
    expect(hot(bars)).toEqual(["2"]);
    pointer("pointerleave", bars.element);
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    expect(hot(line)).toEqual([]);
  });

  it("reports a throwing `by` and links nothing by it", () => {
    const { bars, line, bar, hot } = season();
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    link([bars, line], {
      by: () => {
        throw new Error("no week");
      }
    });
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    expect(hot(line)).toEqual([]);
    expect(reportError).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("links a donut's slices by key", () => {
    const env = environment();
    const slices = donutChart<Week>(container(), { label: "Shots", data: weeks, category: (d) => String(d.week), value: "shots", width: 300 }, env);
    const { bars, bar, hot } = season();
    link([bars, slices]);
    pointer("pointerover", bar("4").querySelector(".ec-segment")!);
    expect(hot(slices as unknown as Chart<Week, unknown>)).toEqual(["4"]);
    expect(slices.element.classList.contains("ec-hovering")).toBe(true);
  });
});

interface Counted {
  week: number;
  goals: number | null;
  xg: number | null;
  shots: number;
}

/** The season with nothing counted in week 3: no goals or xG, though the shots were. */
const counted: Counted[] = weeks.map((w) => (w.week === 3 ? { ...w, goals: null, xg: null } : w));

/**
 * Shots per matchweek as columns, keyed by matchweek, and the goals vs xG line with nothing counted in
 * week 3, linked by matchweek or by `link`'s options. Each logs its hover effect's runs.
 */
function blankWeek(more: { data?: readonly Counted[]; line?: Partial<LineChartOptions<Counted>>; link?: LinkOptions<Counted> } = {}) {
  const env = environment();
  const barHover = recorder();
  const lineHover = recorder();
  const lineHost = container();
  const data = more.data ?? counted;
  const bars = barChart<Counted>(container(), { label: "Shots per matchweek", data, x: (d) => String(d.week), y: "shots", orientation: "vertical", width: 400, on: { hover: barHover.effect } }, env);
  const line = lineChart<Counted>(lineHost, { label: "Goals vs xG", data, x: "week", series: ["goals", "xg"], width: 400, on: { hover: lineHover.effect }, ...more.line }, env);
  link([bars, line], more.link);
  const bar = (key: string) => bars.element.querySelector(`.ec-mark[data-key="${key}"]`) as SVGGElement;
  const column = (key: string) => line.element.querySelector(`.ec-column[data-key="${key}"]`) as SVGGElement;
  const hot = (chart: { readonly element: SVGSVGElement }) => Array.from(chart.element.querySelectorAll(".ec-hot"), (element) => element.getAttribute("data-key"));
  const crosshair = () => line.element.querySelector(".ec-crosshair")!;
  /** The line's tooltip, line by line, while it shows. */
  const tip = (): (string | null)[] | undefined => {
    const box = lineHost.querySelector(".ec-tooltip");
    return box?.classList.contains("ec-tooltip-shown") ? Array.from(box.children, (part) => part.textContent) : undefined;
  };
  return { env, bars, line, bar, column, hot, crosshair, tip, barHover, lineHover };
}

describe("link: an x with every value missing", () => {
  const blank = ["3", "goals missing · xg missing"];

  it("hovers its column, and the column's hover shows the line's crosshair and tooltip there, with no effect or event on the line", () => {
    const { bars, line, bar, column, hot, crosshair, tip, barHover, lineHover } = blankWeek();
    const barEvents = listen<Counted>(bars);
    const lineEvents = listen<Counted>(line);
    pointer("pointerover", column("3").querySelector(".ec-hit")!);
    expect(barEvents).toEqual(["hover 3 linked 1/1"]);
    expect(hot(bars)).toEqual(["3"]);
    expect(bars.element.classList.contains("ec-hovering")).toBe(true);
    expect(barHover.log).toEqual(["run 3"]);
    expect(tip()).toEqual(blank);
    const own = crosshair().getAttribute("x1");
    pointer("pointerleave", line.element);
    expect(barEvents.slice(1)).toEqual(["leave 3"]);
    expect(hot(bars)).toEqual([]);

    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    // Nothing at week 3 to emphasise: the crosshair and tooltip show where it is, as focus on it does.
    expect(crosshair().getAttribute("visibility")).toBeNull();
    expect(crosshair().getAttribute("x1")).toBe(own);
    expect(tip()).toEqual(blank);
    expect(hot(line)).toEqual([]);
    expect(line.element.classList.contains("ec-hovering")).toBe(false);
    expect(line.element.querySelector(".ec-focus")!.getAttribute("visibility")).toBe("hidden");
    expect(document.activeElement).toBe(document.body);
    expect(lineEvents).toEqual([]);
    expect(lineHover.log).toEqual([]);
    pointer("pointerleave", bars.element);
    expect(crosshair().getAttribute("visibility")).toBe("hidden");
    expect(tip()).toBeUndefined();
  });

  it("follows focus onto that x and off it, both ways, and Escape ends the link's hover", () => {
    const { bars, line, bar, column, hot, crosshair, tip } = blankWeek();
    tabTo(column("2"));
    expect(hot(bars)).toEqual(["2"]);
    press(column("2"), "ArrowRight");
    expect(hot(bars)).toEqual(["3"]);
    press(column("3"), "ArrowRight");
    expect(hot(bars)).toEqual(["4"]);
    press(column("4"), "ArrowLeft");
    expect(hot(bars)).toEqual(["3"]);
    press(column("3"), "Escape");
    expect(hot(bars)).toEqual([]);
    column("3").blur();

    tabTo(bar("2"));
    expect(hot(line)).toEqual(["goals@2", "xg@2"]);
    expect(tip()).toBeUndefined();
    press(bar("2"), "ArrowRight");
    expect(hot(line)).toEqual([]);
    expect(tip()).toEqual(blank);
    press(bar("3"), "ArrowRight");
    expect(hot(line)).toEqual(["goals@4", "xg@4"]);
    expect(tip()).toBeUndefined();
    expect(crosshair().getAttribute("visibility")).toBe("hidden");
    press(bar("4"), "ArrowLeft");
    expect(tip()).toEqual(blank);
    expect(press(bar("3"), "Escape").defaultPrevented).toBe(true);
    expect(tip()).toBeUndefined();
    expect(crosshair().getAttribute("visibility")).toBe("hidden");
    expect(hot(bars)).toEqual([]);
    expect(document.activeElement).toBe(bar("3"));
    expect(line.element.querySelector(".ec-focus")!.getAttribute("visibility")).toBe("hidden");
  });

  it("links it by a `by` that reads the row: its stand-in is keyed by the x, with its row and a sample at its x of no value", () => {
    const seen: Pick<MarkEvent<Counted>, "mark" | "data">[] = [];
    const { bars, line, bar, column, hot, crosshair, tip } = blankWeek({
      link: {
        by: (event) => {
          seen.push(event);
          return `week ${event.data.datum.week}`;
        }
      }
    });
    pointer("pointerover", column("3").querySelector(".ec-hit")!);
    expect(hot(bars)).toEqual(["3"]);
    const standIn = seen[0]!;
    expect(standIn.mark.key).toBe("3");
    expect(standIn.mark.center.x).toBeCloseTo(Number(crosshair().getAttribute("x1")), 2);
    expect(standIn.data.datum).toBe(counted[2]);
    expect(standIn.data.samples).toEqual([{ t: 0, value: NaN, at: 3 }]);
    expect(standIn.data.related("goals")).toBeUndefined();
    pointer("pointerleave", line.element);
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    expect(tip()).toEqual(blank);
  });

  it("links it on a time axis by the x's ISO string", () => {
    const env = environment();
    const dated = counted.map((row) => ({ ...row, date: new Date(Date.UTC(2026, 7, 7 * row.week)) }));
    const bars = barChart(container(), { label: "Shots", data: dated, x: (d) => d.date.toISOString().slice(0, 10), key: (d) => d.date.toISOString(), y: "shots", orientation: "vertical", width: 400 }, env);
    const line = lineChart(container(), { label: "Goals", data: dated, x: "date", series: ["goals", "xg"], width: 400 }, env);
    link([bars, line]);
    const key = dated[2]!.date.toISOString();
    pointer("pointerover", line.element.querySelector(`.ec-column[data-key="${key}"] .ec-hit`)!);
    expect(Array.from(bars.element.querySelectorAll(".ec-hot"), (element) => element.getAttribute("data-key"))).toEqual([key]);
    pointer("pointerleave", line.element);
    pointer("pointerover", bars.element.querySelector(`.ec-mark[data-key="${key}"] .ec-segment`)!);
    expect(line.element.querySelector(".ec-crosshair")!.getAttribute("visibility")).toBeNull();
  });

  it("keeps the columns to emphasis and dimming with effects: false, and the line still shows its crosshair and tooltip", () => {
    const { bars, line, bar, column, hot, tip, barHover, lineHover } = blankWeek({ link: { effects: false } });
    const barEvents = listen<Counted>(bars);
    const lineEvents = listen<Counted>(line);
    pointer("pointerover", column("3").querySelector(".ec-hit")!);
    expect(hot(bars)).toEqual(["3"]);
    expect(bars.element.classList.contains("ec-hovering")).toBe(true);
    expect(barEvents).toEqual(["hover 3 linked 1/1"]);
    expect(barHover.log).toEqual([]);
    pointer("pointerleave", line.element);
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    expect(tip()).toEqual(blank);
    expect(barHover.log).toEqual(["run 3"]);
    expect(lineHover.log).toEqual([]);
    expect(lineEvents).toEqual([]);
  });

  it("links an x with some values as before: by its points, with no crosshair or tooltip on the line", () => {
    const { bars, line, bar, column, hot, crosshair, tip } = blankWeek({ data: counted.map((w) => (w.week === 2 ? { ...w, goals: null } : w)) });
    const lineEvents = listen<Counted>(line);
    pointer("pointerover", column("2").querySelector(".ec-hit")!);
    expect(hot(bars)).toEqual(["2"]);
    pointer("pointerleave", line.element);
    lineEvents.length = 0;
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    expect(hot(line)).toEqual(["xg@2"]);
    expect(lineEvents).toEqual(["hover xg@2 linked 1/1"]);
    expect(tip()).toBeUndefined();
    expect(crosshair().getAttribute("visibility")).toBe("hidden");
  });

  it('shows nothing at that x with hover: "point", which has no stop there', () => {
    const { line, bar, hot, crosshair, tip } = blankWeek({ line: { hover: "point" } });
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    expect(hot(line)).toEqual([]);
    expect(tip()).toBeUndefined();
    expect(crosshair().getAttribute("visibility")).toBe("hidden");
  });

  it("follows a change: the line's tooltip goes when the x gains values, its points hovered instead, and comes back when they go", async () => {
    const { env, line, bar, hot, crosshair, tip } = blankWeek();
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    expect(tip()).toEqual(blank);
    await play(env.clock, line.update({ data: weeks }));
    expect(hot(line)).toEqual(["goals@3", "xg@3"]);
    expect(tip()).toBeUndefined();
    expect(crosshair().getAttribute("visibility")).toBe("hidden");
    await play(env.clock, line.update({ data: counted }));
    expect(hot(line)).toEqual([]);
    expect(tip()).toEqual(blank);
    expect(crosshair().getAttribute("visibility")).toBeNull();
  });
});

describe("link: attachments", () => {
  it("links D3 columns through expressive() both ways, dimming its other marks with `dim`", () => {
    const { bars, line, bar, hot } = season();
    const shots = d3Shots();
    const hover = recorder();
    const fx = expressive(shots.selection(), { key: (d) => String(d.week), dim: true, keyboard: true, on: { hover: hover.effect } }, environment());
    link([bars, line, fx]);
    const fxEvents = listen(fx);

    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    expect(fxEvents).toEqual(["hover 3 linked 1/1"]);
    expect(hover.log).toEqual(["run 3"]);
    expect([1, 2, 4].every((week) => shots.rect(week).classList.contains("ec-dimmed"))).toBe(true);
    expect(shots.rect(3).classList.contains("ec-dimmed")).toBe(false);
    pointer("pointerleave", bars.element);
    expect(fxEvents).toEqual(["hover 3 linked 1/1", "leave 3"]);
    expect(shots.rect(1).classList.contains("ec-dimmed")).toBe(false);

    pointer("pointerover", shots.rect(2));
    expect(hot(bars)).toEqual(["2"]);
    expect(hot(line)).toEqual(["goals@2", "xg@2"]);
    pointer("pointerleave", shots.svg);
    expect(hot(bars)).toEqual([]);

    // The keyboard on the attachment, and Escape.
    tabTo(shots.rect(1));
    expect(hot(line)).toEqual(["goals@1", "xg@1"]);
    expect(press(shots.rect(1), "Escape").defaultPrevented).toBe(true);
    expect(hot(line)).toEqual([]);
    // Escape with focus on the attachment while it shows the link's hover ends it at the bars.
    pointer("pointerover", bar("4").querySelector(".ec-segment")!);
    expect(press(shots.rect(1), "Escape").defaultPrevented).toBe(true);
    expect(hot(bars)).toEqual([]);
    expect(shots.rect(1).classList.contains("ec-dimmed")).toBe(false);
  });

  it("links the attachment's newer hover when a hover listener starts one", () => {
    const { bars, hot } = season();
    const shots = d3Shots();
    const fx = expressive(shots.selection(), { key: (d) => String(d.week), keyboard: true }, environment());
    link([bars, fx]);
    fx.on("hover", (event) => {
      if (event.source === "pointer") fx.focus("1");
    });
    pointer("pointerover", shots.rect(3));
    // Focus on week 1 is the newest hover: the bars show it, not week 3.
    expect(hot(bars)).toEqual(["1"]);
    expect(press(shots.rect(1), "Escape").defaultPrevented).toBe(true);
    expect(hot(bars)).toEqual([]);
  });

  it("follows an attachment's refresh: a linked mark that left is left", () => {
    const { bars, bar } = season();
    const shots = d3Shots();
    const fx = expressive(shots.selection(), { key: (d) => String(d.week), dim: true }, environment());
    link([bars, fx], { by: (event) => (event.data.datum.week >= 3 ? "late" : "early") });
    const fxEvents = listen(fx);
    pointer("pointerover", bar("4").querySelector(".ec-segment")!);
    expect(fxEvents).toEqual(["hover 3 linked 1/2", "hover 4 linked 2/2"]);
    shots.rect(4).remove();
    fx.refresh(shots.selection());
    expect(fxEvents.slice(2)).toEqual(["leave 4"]);
    expect(shots.rect(1).classList.contains("ec-dimmed")).toBe(true);
    pointer("pointerleave", bars.element);
    expect(fxEvents.slice(3)).toEqual(["leave 3"]);
  });

  it("links a Vega chart through fromVegaView() both ways", async () => {
    const { bars, line, bar, hot } = season();
    const { view, svg, rect } = await vegaShots();
    const hover = recorder();
    const fx = fromVegaView<Week>(view, { key: (d) => String(d.week), on: { hover: hover.effect } }, environment());
    link([bars, line, fx]);
    const fxEvents = listen(fx);
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    expect(fxEvents).toEqual(["hover 2 linked 1/1"]);
    expect(hover.log).toEqual(["run 2"]);
    pointer("pointerleave", bars.element);
    pointer("pointerover", rect(4));
    expect(hot(bars)).toEqual(["4"]);
    expect(hot(line)).toEqual(["goals@4", "xg@4"]);
    pointer("pointerleave", svg);
    expect(hot(line)).toEqual([]);
    fx.destroy();
    view.finalize();
  });
});

/** The keys of the marks a chart or view shows hovered. */
const hotIn = (chart: { readonly element: Element }) => Array.from(chart.element.querySelectorAll(".ec-hot"), (element) => element.getAttribute("data-key"));

describe("link: a chart switch", () => {
  it("links the view on show with a bar chart both ways, by the pointer and the keyboard, and never the hidden view", () => {
    const { env, bars, bar, hot } = season();
    const shots = shotsSwitch(env);
    link([bars, shots.switcher]);
    const switchEvents = listen(shots.switcher);

    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    expect(hotIn(shots.donut)).toEqual(["2"]);
    expect(shots.donutHover.log).toEqual(["run 2"]);
    expect(switchEvents).toEqual(["hover 2 linked 1/1"]);
    expect(hotIn(shots.columns)).toEqual([]);
    expect(shots.columnHover.log).toEqual([]);
    pointer("pointerleave", bars.element);
    expect(hotIn(shots.donut)).toEqual([]);

    pointer("pointerover", shots.slice("3").querySelector(".ec-hit")!);
    expect(hot(bars)).toEqual(["3"]);
    pointer("pointerleave", shots.donut.element);
    expect(hot(bars)).toEqual([]);

    tabTo(shots.slice("1"));
    expect(hot(bars)).toEqual(["1"]);
    press(shots.slice("1"), "ArrowRight");
    expect(hot(bars)).toEqual(["2"]);
    expect(press(shots.slice("2"), "Escape").defaultPrevented).toBe(true);
    expect(hot(bars)).toEqual([]);

    // The hidden view's own hover isn't linked (jsdom doesn't make it inert, as a browser does).
    (document.activeElement as HTMLElement).blur();
    pointer("pointerover", shots.column("4").querySelector(".ec-segment")!);
    expect(hotIn(shots.columns)).toEqual(["4"]);
    expect(hot(bars)).toEqual([]);
    expect(switchEvents.some((event) => event.includes(" 4 "))).toBe(false);
  });

  it("links the new view once a switch lands, both ways", async () => {
    const { env, bars, bar, hot } = season();
    const shots = shotsSwitch(env);
    link([bars, shots.switcher]);
    await Promise.all([shots.switcher.show("columns"), shots.land()]);
    pointer("pointerover", bar("4").querySelector(".ec-segment")!);
    expect(hotIn(shots.columns)).toEqual(["4"]);
    expect(shots.columnHover.log).toEqual(["run 4"]);
    expect(hotIn(shots.donut)).toEqual([]);
    pointer("pointerleave", bars.element);
    pointer("pointerover", shots.column("1").querySelector(".ec-segment")!);
    expect(hot(bars)).toEqual(["1"]);
    pointer("pointerleave", shots.columns.element);
    tabTo(shots.column("3"));
    expect(hot(bars)).toEqual(["3"]);
  });

  it("links an attachment with the view on show, both ways, before and after a switch", async () => {
    const { env } = season();
    const shots = shotsSwitch(env);
    const d3 = d3Shots();
    const fx = expressive(d3.selection(), { key: (d) => String(d.week), dim: true, keyboard: true }, environment());
    link([shots.switcher, fx]);
    const fxEvents = listen(fx);

    pointer("pointerover", shots.slice("2").querySelector(".ec-hit")!);
    expect(fxEvents).toEqual(["hover 2 linked 1/1"]);
    expect(d3.rect(1).classList.contains("ec-dimmed")).toBe(true);
    pointer("pointerleave", shots.donut.element);
    expect(fxEvents.slice(1)).toEqual(["leave 2"]);

    pointer("pointerover", d3.rect(3));
    expect(hotIn(shots.donut)).toEqual(["3"]);
    pointer("pointerleave", d3.svg);
    expect(hotIn(shots.donut)).toEqual([]);

    await Promise.all([shots.switcher.show("columns"), shots.land()]);
    tabTo(d3.rect(4));
    expect(hotIn(shots.columns)).toEqual(["4"]);
    expect(hotIn(shots.donut)).toEqual([]);
    expect(press(d3.rect(4), "Escape").defaultPrevented).toBe(true);
    expect(hotIn(shots.columns)).toEqual([]);
  });

  it("ends the view's own hover as a switch starts, and the link hears it end", async () => {
    const { env, bars, line, hot } = season();
    const shots = shotsSwitch(env);
    link([bars, line, shots.switcher]);
    const switchEvents = listen(shots.switcher);
    pointer("pointerover", shots.slice("2").querySelector(".ec-hit")!);
    expect(hot(bars)).toEqual(["2"]);
    expect(hot(line)).toEqual(["goals@2", "xg@2"]);
    void shots.switcher.show("columns");
    expect(hot(bars)).toEqual([]);
    expect(hot(line)).toEqual([]);
    // The switch's on() hears the leave: the donut was the view on show until then.
    expect(switchEvents).toEqual(["hover 2 pointer 1/1", "leave 2"]);
    await shots.land();
    expect(hotIn(shots.columns)).toEqual([]);
    expect(hot(bars)).toEqual([]);
  });

  it("hides a link's hover as a switch starts, and shows it in the new view when it lands", async () => {
    const { env, bars, bar, hot } = season();
    const shots = shotsSwitch(env);
    link([bars, shots.switcher]);
    const switchEvents = listen(shots.switcher);
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    expect(hotIn(shots.donut)).toEqual(["2"]);
    void shots.switcher.show("columns");
    expect(hotIn(shots.donut)).toEqual([]);
    expect(shots.donut.element.classList.contains("ec-hovering")).toBe(false);
    env.clock.advance(500);
    expect(hotIn(shots.columns)).toEqual([]);
    expect(shots.columnHover.log).toEqual([]);
    // The bar's own hover goes on.
    expect(hot(bars)).toEqual(["2"]);
    await shots.land();
    expect(hotIn(shots.columns)).toEqual(["2"]);
    expect(shots.columns.element.classList.contains("ec-hovering")).toBe(true);
    expect(shots.columnHover.log).toEqual(["run 2"]);
    expect(switchEvents).toEqual(["hover 2 linked 1/1", "leave 2", "hover 2 linked 1/1"]);
    pointer("pointerleave", bars.element);
    expect(hotIn(shots.columns)).toEqual([]);
  });

  it("holds a link's hover that comes mid-switch, and shows the latest when it lands", async () => {
    const { env, bars, bar } = season();
    const shots = shotsSwitch(env);
    link([bars, shots.switcher]);
    const switchEvents = listen(shots.switcher);
    void shots.switcher.show("columns");
    env.clock.advance(300);
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    pointer("pointerover", bar("4").querySelector(".ec-segment")!);
    expect(hotIn(shots.columns)).toEqual([]);
    expect(hotIn(shots.donut)).toEqual([]);
    expect(switchEvents).toEqual([]);
    await shots.land();
    expect(hotIn(shots.columns)).toEqual(["4"]);
    expect(switchEvents).toEqual(["hover 4 linked 1/1"]);

    // One that ends mid-switch shows nothing.
    pointer("pointerleave", bars.element);
    void shots.switcher.show("donut");
    env.clock.advance(300);
    pointer("pointerover", bar("1").querySelector(".ec-segment")!);
    pointer("pointerleave", bars.element);
    await shots.land();
    expect(hotIn(shots.donut)).toEqual([]);
  });

  it("shows a link's hover in the view a switch back lands in", async () => {
    const { env, bars, bar } = season();
    const shots = shotsSwitch(env);
    link([bars, shots.switcher]);
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    void shots.switcher.show("columns");
    env.clock.advance(300);
    void shots.switcher.show("donut");
    await shots.land();
    expect(shots.switcher.current).toBe("donut");
    expect(hotIn(shots.donut)).toEqual(["2"]);
    expect(hotIn(shots.columns)).toEqual([]);
    expect(shots.donutHover.log).toEqual(["run 2", "clear", "run 2"]);
  });

  it("shows a link's hover in the new view at once with motion off", () => {
    const { env, bars, bar } = season();
    const shots = shotsSwitch(env);
    link([bars, shots.switcher]);
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    env.motion.setMode("off");
    void shots.switcher.show("columns");
    expect(hotIn(shots.donut)).toEqual([]);
    expect(hotIn(shots.columns)).toEqual(["3"]);
  });

  it("hovers the partner again when focus moves into the new view", async () => {
    const { env, bars, hot } = season();
    const shots = shotsSwitch(env);
    link([bars, shots.switcher]);
    shots.donut.focus("3");
    expect(hot(bars)).toEqual(["3"]);
    void shots.switcher.show("columns");
    expect(hot(bars)).toEqual([]);
    await shots.land();
    // Focus lands on column 3 as a key press would, and its hover is linked.
    expect(document.activeElement).toBe(shots.column("3"));
    expect(hot(bars)).toEqual(["3"]);
  });

  it("keeps the view on show to emphasis and dimming with effects: false", async () => {
    const { env, bars, bar } = season();
    const shots = shotsSwitch(env);
    link([bars, shots.switcher], { effects: false });
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    expect(hotIn(shots.donut)).toEqual(["2"]);
    expect(shots.donut.element.classList.contains("ec-hovering")).toBe(true);
    void shots.switcher.show("columns");
    await shots.land();
    expect(hotIn(shots.columns)).toEqual(["2"]);
    expect(shots.donutHover.log).toEqual([]);
    expect(shots.columnHover.log).toEqual([]);
  });

  it("ends the link's hover in it with leave(), mid-switch too, until the link's next hover", async () => {
    const { env, bars, bar, hot } = season();
    const shots = shotsSwitch(env);
    link([bars, shots.switcher]);
    pointer("pointerover", bar("2").querySelector(".ec-segment")!);
    shots.switcher.leave();
    expect(hotIn(shots.donut)).toEqual([]);
    expect(hot(bars)).toEqual(["2"]);
    void shots.switcher.show("columns");
    await shots.land();
    expect(hotIn(shots.columns)).toEqual([]);

    void shots.switcher.show("donut");
    env.clock.advance(300);
    pointer("pointerover", bar("3").querySelector(".ec-segment")!);
    shots.switcher.leave();
    await shots.land();
    expect(hotIn(shots.donut)).toEqual([]);
    pointer("pointerover", bar("4").querySelector(".ec-segment")!);
    expect(hotIn(shots.donut)).toEqual(["4"]);
  });

  it("can't be in a link while its views' charts are in another, or theirs while it is", () => {
    const { env, bars, line } = season();
    const shots = shotsSwitch(env);
    const first = link([bars, shots.switcher]);
    expect(() => link([shots.donut])).toThrow(/one link at a time/);
    expect(() => link([line, shots.columns])).toThrow(/one link at a time/);
    first.destroy();
    const byView = link([line, shots.columns]);
    expect(() => link([bars, shots.switcher])).toThrow(/one link at a time/);
    byView.destroy();
    expect(() => link([shots.switcher, shots.donut])).toThrow(/one link at a time/);
    expect(() => link([shots.columns, shots.switcher])).toThrow(/one link at a time/);
    // Nothing was linked by the throws.
    link([bars, shots.switcher]).destroy();
    link([line, shots.donut, shots.columns]).destroy();
  });

  it("drops out when it's destroyed, ending the link's hover if it was the one hovered, and frees its views' charts", async () => {
    const { env, bars, bar, hot } = season();
    const shots = shotsSwitch(env);
    link([bars, shots.switcher]);
    pointer("pointerover", shots.slice("2").querySelector(".ec-hit")!);
    expect(hot(bars)).toEqual(["2"]);
    shots.switcher.destroy();
    expect(hot(bars)).toEqual([]);
    expect(() => pointer("pointerover", bar("3").querySelector(".ec-segment")!)).not.toThrow();
    // It left its link, and its views' charts with it: they drop out of a new one.
    expect(() => link([shots.switcher]).destroy()).not.toThrow();
    expect(() => link([shots.donut, shots.columns]).destroy()).not.toThrow();

    // Destroyed mid-switch with a link's hover held: nothing lands.
    const again = shotsSwitch(env);
    const { bars: others, bar: other } = season();
    link([others, again.switcher]);
    pointer("pointerover", other("1").querySelector(".ec-segment")!);
    void again.switcher.show("columns");
    env.clock.advance(300);
    again.switcher.destroy();
    await expect(again.land()).resolves.toBeUndefined();
    expect(hotIn(others)).toEqual(["1"]);
  });

  it("reads `by`'s rows from the views' charts", () => {
    const { env, bars, line, hot } = season();
    const shots = shotsSwitch(env);
    const half = link([bars, shots.switcher], { by: (event) => (event.data.datum.week <= 2 ? "first half" : "second half") });
    pointer("pointerover", shots.slice("1").querySelector(".ec-hit")!);
    expect(hot(bars)).toEqual(["1", "2"]);
    half.destroy();
    // @ts-expect-error: a Week has no `player`.
    const typed = () => link([line, shots.switcher], { by: (event) => event.data.datum.player });
    expect(typed).toBeTypeOf("function");
    shots.switcher.on("hover", (event) => {
      const week: number = event.data.datum.week;
      expect(week).toBeTypeOf("number");
    });
  });
});
