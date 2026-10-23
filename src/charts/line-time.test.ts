// The line chart on a time axis: Dates on x, keyed by ISO string, with time ticks, and each x said
// as a medium date in the page's locale, in UTC or the viewer's zone. A number axis is in line.test.ts.

import { createMotion, manualClock, type DataEffect, type MarkData, type MotionMode } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { lineChart } from "./line";
import type { ChartEnv } from "./shell/setup";
import type { LineChart, LineChartOptions } from "./types";

interface Day {
  date: Date;
  goals: number;
  xg: number;
}

/** Midnight UTC on the nth day from 5 January 2026, or another hour. */
const day = (n: number, hour = 0): Date => new Date(Date.UTC(2026, 0, 5 + n, hour));
const iso = (n: number, hour = 0): string => day(n, hour).toISOString();

const days: Day[] = [
  { date: day(0), goals: 0, xg: 1.2 },
  { date: day(1), goals: 2, xg: 2.1 },
  { date: day(2), goals: 3, xg: 3.6 },
  { date: day(3), goals: 5, xg: 4.4 }
];

/** Node's environment: the library has no Node types. */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const RealDateTimeFormat = Intl.DateTimeFormat;

/** Makes `locale` the page's: Intl.DateTimeFormat given no locale uses it. */
function useLocale(locale: string): void {
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
    return new RealDateTimeFormat(locales ?? locale, options);
  } as unknown as typeof Intl.DateTimeFormat);
}

/** Spaces as spaces: some ICU versions put a narrow no-break space before "PM". */
const plain = (text: string | null | undefined): string => (text ?? "").replace(/[  ]/g, " ");

function quietMotion(mode: MotionMode = "presentation") {
  return createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
}

function setup(options: Partial<LineChartOptions<Day>> = {}, more: Partial<ChartEnv> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const clock = manualClock();
  const presets = createRegistry<PresetFactory>({ kind: "preset" });
  const chartEnv: ChartEnv = { presets, icons: { get: () => undefined }, motion: quietMotion(), clock, ...more };
  const chart = lineChart<Day>(container, { label: "Goals vs xG", data: days, x: "date", series: ["goals", "xg"], width: 600, ...options }, chartEnv);
  const svg = chart.element;
  const column = (key: string) => svg.querySelector(`.ec-column[data-key="${key}"]`) as SVGGElement;
  const keys = () => chart.marks().map((mark) => mark.key);
  /** The x ticks' text, in order. */
  const xTicks = () => Array.from(svg.querySelectorAll(".ec-axis .ec-tick"), (tick) => plain(tick.textContent)).slice(-chartTickCount(svg));
  const tableRows = () => Array.from(container.querySelectorAll(".ec-table tbody tr"), (row) => Array.from(row.children, (cell) => plain(cell.textContent)));
  const tooltip = () => Array.from(document.querySelector(".ec-tooltip")?.children ?? [], (line) => plain(line.textContent));
  const region = () => plain(container.querySelector(".ec-announcer")?.textContent).trim();
  const settle = (running: Promise<unknown>) => play(clock, running);
  return { container, chart, svg, clock, column, keys, xTicks, tableRows, tooltip, region, settle };
}

/** The x ticks are drawn after the values' ticks, which each have a gridline. */
function chartTickCount(svg: SVGSVGElement): number {
  return svg.querySelectorAll(".ec-axis .ec-tick").length - svg.querySelectorAll(".ec-grid line").length;
}

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
}

/** Records every mark event as "enter goals@…", "update xg" and so on. */
function listen(chart: LineChart<Day>) {
  const events: string[] = [];
  chart.on("enter", (e) => events.push(`enter ${e.mark.key}`));
  chart.on("update", (e) => events.push(`update ${e.mark.key}`));
  chart.on("exit", (e) => events.push(`exit ${e.mark.key}`));
  return events;
}

/** A data effect that keeps the data each mark was last given, by key. */
function dataRecorder() {
  const latest = new Map<string, MarkData<Day>>();
  const effect: DataEffect<Day> = {
    kind: "data",
    run(mark, data, ctx) {
      latest.set(mark.key, data);
      ctx.onChange((moved, next) => {
        if (next) latest.set(moved.key, next as MarkData<Day>);
      });
      return Promise.resolve();
    },
    end(mark, data) {
      latest.set(mark.key, data);
    },
    clear() {}
  };
  return { effect, latest };
}

beforeEach(() => useLocale("en-US"));

afterEach(() => {
  document.body.textContent = "";
  vi.restoreAllMocks();
});

describe("lineChart on a time axis: drawing", () => {
  it("keys each x by its ISO string and each point <series>@<ISO string>", () => {
    const { keys, column } = setup();
    expect(keys()).toEqual(["goals", "xg", ...[0, 1, 2, 3].flatMap((n) => [`goals@${iso(n)}`, `xg@${iso(n)}`])]);
    expect(keys()[2]).toBe("goals@2026-01-05T00:00:00.000Z");
    expect(column(iso(2)).getAttribute("role")).toBe("img");
  });

  it("labels the days on the axis, and a longer range at its own level", async () => {
    const { xTicks, chart, settle } = setup();
    expect(xTicks()).toEqual(["Jan 5", "Jan 6", "Jan 7", "Jan 8"]);
    // A year of weeks: in quarters, the first a year.
    const year = Array.from({ length: 53 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + 7 * i)), goals: i, xg: i }));
    await settle(chart.update({ data: year }));
    expect(xTicks()).toEqual(["2026", "Apr", "Jul", "Oct", "Dec 31"]);
  });

  it("drops the steps that would come within 8 px of a neighbour, keeping both ends, which say their years", () => {
    const year = Array.from({ length: 365 }, (_, i) => ({ date: day(i), goals: i, xg: i }));
    const { xTicks } = setup({ data: year, width: 260, labels: false });
    // Apr, Oct and 2027 don't fit.
    expect(xTicks()).toEqual(["Jan 5, 2026", "Jul", "Jan 4, 2027"]);
  });

  it("draws nothing for no data, and takes Dates once they come", async () => {
    const { chart, keys, settle } = setup({ data: [] });
    expect(keys()).toEqual([]);
    await settle(chart.update({ data: days }));
    expect(keys()).toHaveLength(10);
  });
});

describe("lineChart on a time axis: words for people", () => {
  /** Week 2's xG changes, the last day goes and a fifth comes. */
  const next: Day[] = [days[0]!, { ...days[1]!, xg: 2.5 }, days[2]!, { date: day(4), goals: 6, xg: 5.2 }];

  it("says each x as a medium date in en-US: names, the tooltip, the table and announcements", async () => {
    const { column, tooltip, tableRows, region, chart, settle } = setup({ announce: true });
    expect(column(iso(2)).getAttribute("aria-label")).toBe("Jan 7, 2026: 3 goals, 3.6 xg");
    pointer("pointerover", column(iso(2)));
    expect(tooltip()).toEqual(["Jan 7, 2026", "3 goals · 3.6 xg"]);
    expect(tableRows()[0]).toEqual(["Jan 5, 2026", "0", "1.2"]);
    await settle(chart.update({ data: next }));
    expect(region()).toBe("Jan 6, 2026 changed. Added Jan 9, 2026. Removed Jan 8, 2026");
  });

  it("says them in en-GB", async () => {
    useLocale("en-GB");
    const { column, tooltip, tableRows, region, chart, xTicks, settle } = setup({ announce: true });
    expect(column(iso(2)).getAttribute("aria-label")).toBe("7 Jan 2026: 3 goals, 3.6 xg");
    pointer("pointerover", column(iso(2)));
    expect(tooltip()).toEqual(["7 Jan 2026", "3 goals · 3.6 xg"]);
    expect(tableRows().map((row) => row[0])).toEqual(["5 Jan 2026", "6 Jan 2026", "7 Jan 2026", "8 Jan 2026"]);
    expect(xTicks()).toEqual(["5 Jan", "6 Jan", "7 Jan", "8 Jan"]);
    await settle(chart.update({ data: next }));
    expect(region()).toBe("6 Jan 2026 changed. Added 9 Jan 2026. Removed 8 Jan 2026");
  });

  it("says the time when any x has one", () => {
    const hourly = [0, 6, 12, 18].map((hour, i) => ({ date: day(0, hour), goals: i, xg: i }));
    const { column, tableRows, xTicks } = setup({ data: hourly });
    expect(plain(column(iso(0, 12)).getAttribute("aria-label"))).toBe("Jan 5, 2026, 12:00 PM: 2 goals, 2 xg");
    expect(tableRows()[0]![0]).toBe("Jan 5, 2026, 12:00 AM");
    expect(xTicks()).toEqual(["Jan 5", "6:00 AM", "12:00 PM", "6:00 PM"]);
  });

  it("gives markLabel the date as its category, and words x with xFormat, given the Date", async () => {
    const categories: string[] = [];
    const given: unknown[] = [];
    const { column, tooltip, tableRows, region, chart, xTicks, settle } = setup({
      announce: true,
      markLabel: (d, mark) => {
        categories.push(mark.category);
        return mark.text;
      },
      xFormat: (x) => {
        given.push(x);
        return `Matchday ${(x as Date).getUTCDate() - 4}`;
      }
    });
    expect(given[0]).toBeInstanceOf(Date);
    expect(categories).toEqual(["Matchday 1", "Matchday 2", "Matchday 3", "Matchday 4"]);
    expect(column(iso(2)).getAttribute("aria-label")).toBe("Matchday 3: 3 goals, 3.6 xg");
    pointer("pointerover", column(iso(2)));
    expect(tooltip()[0]).toBe("Matchday 3");
    expect(tableRows()[3]![0]).toBe("Matchday 4");
    // The ticks keep their own wording.
    expect(xTicks()).toEqual(["Jan 5", "Jan 6", "Jan 7", "Jan 8"]);
    await settle(chart.update({ data: next }));
    expect(region()).toBe("Matchday 2 changed. Added Matchday 5. Removed Matchday 4");
  });

  it("throws, or rejects, when xFormat throws, as format does", async () => {
    const fails = () => {
      throw new Error("no words");
    };
    expect(() => setup({ xFormat: fails })).toThrow(/no words/);
    const { chart, keys } = setup();
    const before = keys();
    await expect(chart.update({ xFormat: fails })).rejects.toThrow(/no words/);
    await expect(chart.update({ timeZone: "Europe/London" as "UTC" })).rejects.toThrow(/timeZone must be "UTC" or "local"/);
    expect(keys()).toEqual(before);
  });
});

describe("lineChart on a time axis: zones", () => {
  const before = env.TZ;
  beforeAll(() => {
    env.TZ = "America/New_York";
  });
  afterAll(() => {
    if (before === undefined) delete env.TZ;
    else env.TZ = before;
  });

  it("is in UTC by default, so a date-only value is its own day everywhere", () => {
    const { column, xTicks } = setup({ data: [{ date: new Date("2026-01-05"), goals: 1, xg: 1 }, ...days.slice(1)] });
    expect(column(iso(0)).getAttribute("aria-label")).toBe("Jan 5, 2026: 1 goals, 1 xg");
    expect(xTicks()[0]).toBe("Jan 5");
  });

  it("follows the viewer's clock with timeZone: local, its ticks on local midnights", () => {
    const { column, xTicks, chart } = setup({ timeZone: "local" });
    // UTC midnight is 7 PM the day before in New York.
    expect(plain(column(iso(0)).getAttribute("aria-label"))).toBe("Jan 4, 2026, 7:00 PM: 0 goals, 1.2 xg");
    // Midnight on 5 January is 5 hours after the first x: too close to its label to keep.
    expect(xTicks()).toEqual(["Jan 4, 7:00 PM", "Jan 6", "Jan 7", "Jan 7, 7:00 PM"]);
    // The keys are instants, whatever the zone.
    expect(chart.marks()[2]!.key).toBe(`goals@${iso(0)}`);
  });

  it("keeps a day's tick at local midnight across the clocks going back", () => {
    const autumn = [30, 31, 32, 33].map((d, i) => ({ date: new Date(2026, 9, d), goals: i, xg: i }));
    const { xTicks, keys } = setup({ data: autumn, timeZone: "local" });
    expect(xTicks()).toEqual(["Oct 30", "Oct 31", "Nov", "Nov 2"]);
    // Midnight on 2 November is 5 AM in UTC, a day of 25 hours after midnight on 1 November at 4 AM.
    expect(keys().slice(-4)).toEqual(["goals@2026-11-01T04:00:00.000Z", "xg@2026-11-01T04:00:00.000Z", "goals@2026-11-02T05:00:00.000Z", "xg@2026-11-02T05:00:00.000Z"]);
  });
});

describe("lineChart on a time axis: reveal", () => {
  it("takes a Date, or its time in ms, as playback plays", () => {
    const data = dataRecorder();
    const { chart, keys, column } = setup({ on: { decorate: data.effect } });
    const halfway = new Date((day(1).getTime() + day(2).getTime()) / 2);
    chart.reveal(halfway);
    const byDate = chart.marks()[0]!.outline.d;
    expect(keys()).toEqual(["goals", "xg", `goals@${iso(0)}`, `xg@${iso(0)}`, `goals@${iso(1)}`, `xg@${iso(1)}`]);
    expect(column(iso(2)).getAttribute("visibility")).toBe("hidden");
    // Each sample's at is a Date, the last at the reveal.
    const ats = data.latest.get("goals")!.samples.map((s) => s.at);
    expect(ats.every((at) => at instanceof Date)).toBe(true);
    expect((ats[ats.length - 1] as Date).getTime()).toBe(halfway.getTime());
    chart.reveal(Infinity);
    chart.reveal(halfway.getTime());
    expect(chart.marks()[0]!.outline.d).toBe(byDate);
    expect(chart.element.querySelector('.ec-line[data-key="goals"] .ec-end-label')!.textContent).toBe("3 goals");
    expect(() => chart.reveal(new Date("never"))).toThrow(new RangeError("lineChart: reveal(x) needs a valid Date, got an invalid Date."));
    expect(() => chart.reveal(Number.NaN)).toThrow(/reveal\(x\) needs a number, got NaN/);
  });
});

describe("lineChart on a time axis: update", () => {
  it("grows a new day out of the last, its tick fading in", async () => {
    const { chart, clock, svg, settle, xTicks } = setup();
    const events = listen(chart);
    const at = (key: string) => chart.marks().find((m) => m.key === key)!;
    const before = chart.marks()[0]!.end;
    const added = chart.update({ data: [...days, { date: day(4), goals: 6, xg: 5 }] });
    expect(events).toEqual(["update goals", "update xg", `enter goals@${iso(4)}`, `enter xg@${iso(4)}`]);
    // It starts on the last day's point, so the line doesn't jump.
    expect(at(`goals@${iso(4)}`).center.x).toBeCloseTo(before.x, 6);
    expect(at(`goals@${iso(4)}`).center.y).toBeCloseTo(before.y, 6);
    clock.advance(250);
    expect(at(`goals@${iso(4)}`).center.x).toBeGreaterThan(at(`goals@${iso(3)}`).center.x + 1);
    const fading = Array.from(svg.querySelectorAll(".ec-axis .ec-tick[opacity]"), (tick) => tick.textContent);
    expect(fading).toContain("Jan 9");
    await settle(added);
    expect(xTicks()).toEqual(["Jan 5", "Jan 6", "Jan 7", "Jan 8", "Jan 9"]);
    expect(chart.marks()[0]!.end.x).toBeCloseTo(at(`goals@${iso(4)}`).center.x, 6);
  });

  it("matches points by key, not by place, and hears no change when only the Dates are new", async () => {
    const data = dataRecorder();
    const { chart, settle } = setup({ on: { decorate: data.effect } });
    const events = listen(chart);
    const line = data.latest.get("goals");
    // The same instants in new Date objects: nothing changed.
    await settle(chart.update({ data: days.map((d) => ({ ...d, date: new Date(d.date) })) }));
    expect(events).toEqual([]);
    expect(data.latest.get("goals")!.samples).toEqual(line!.samples);
  });
});
