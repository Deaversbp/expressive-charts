// link(): hover across charts and attachments by a shared value. Bars of goals per matchweek, the
// goals vs xG line, D3 columns of shots through expressive() and Vega bars through fromVegaView(),
// with real D3 and Vega (pinned dev dependencies).

import { select } from "d3-selection";
import { View, parse } from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import { createMotion, manualClock, type GeometryEffect } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { expressive, fromVegaView } from "./adapter";
import { barChart } from "./bar";
import { donutChart } from "./donut";
import { lineChart } from "./line";
import { link } from "./link";
import type { ChartEnv } from "./shell/setup";
import { chartSwitch } from "./switch";
import type { Chart, MarkEvents } from "./types";

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
function listen(source: { on<K extends keyof MarkEvents<Week>>(type: K, listener: (event: MarkEvents<Week>[K]) => void): () => void }): string[] {
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
    // @ts-expect-error: a chart switch isn't a source yet.
    expect(() => link([bars, switcher])).toThrow(/chartSwitch can't be linked yet/);
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
