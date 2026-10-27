// Long axes (M8 step 6), on real charts and an attachment. A bar chart thins labels that would
// overlap, and its marks' names, its tooltip and its table keep every name and value. Page Up and
// Page Down move focus by a page and stop at the ends: on a line's time axis a calendar month in its
// zone, elsewhere a tenth of the marks. This test brings the charts and an attachment together, so it
// lives beside src/index.ts.

import { barChart, expressive, lineChart, type ChartEnv } from "./charts";
import { createRegistry, type PresetFactory } from "./core/registry";
import { createMotion, manualClock, type MotionMode } from "./core";
import { play } from "./core/testing";

interface Bar {
  name: string;
  goals: number;
}

interface Day {
  day: Date;
  goals: number | null;
}

const SVG = "http://www.w3.org/2000/svg";

/** "Bar 1" to "Bar n", the same goals every 4th. */
const bars = (n: number, by = 0): Bar[] => Array.from({ length: n }, (_, i) => ({ name: `Bar ${i + 1}`, goals: 1 + ((i + by) % 4) }));

/** Node's environment: the library has no Node types. */
const nodeEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

/** Pins the viewer's clock to an IANA zone for the tests in the describe block it's called in. */
function inZone(zone: string): void {
  const before = nodeEnv.TZ;
  beforeAll(() => {
    nodeEnv.TZ = zone;
  });
  afterAll(() => {
    if (before === undefined) delete nodeEnv.TZ;
    else nodeEnv.TZ = before;
  });
}

function env(mode: MotionMode = "off"): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock: manualClock() };
}

function container(): HTMLDivElement {
  return document.body.appendChild(document.createElement("div"));
}

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * Presses each key on whatever has focus, in turn: "<key> <where focus is then> <whether the press
 * was taken>". Where focus is comes from `at`, by default the focused element's data-key.
 */
function walk(keys: readonly string[], at: () => string | null | undefined = () => document.activeElement?.getAttribute("data-key")): string[] {
  return keys.map((key) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    return `${key} ${at()} ${event.defaultPrevented}`;
  });
}

/** A line of daily goals in UTC, from `from` to `to`, at `hour` o'clock. */
function days(from: string, to: string, hour = 0): Day[] {
  const out: Day[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`) + hour * 3_600_000; t <= Date.parse(`${to}T23:59:59Z`); t += 86_400_000) out.push({ day: new Date(t), goals: out.length % 5 });
  return out;
}

/** A row's key on a time axis: its x's ISO time. */
const at = (iso: string): string => new Date(iso).toISOString();

describe("a bar chart's thinned labels", () => {
  const texts = (svg: Element, selector: string) => Array.from(svg.querySelectorAll(`.ec-marks > .ec-mark ${selector}`), (text) => text.textContent);

  it("leave every name and value in the marks' names, the tooltip and the table, and only the drawn labels in labels() and labelBounds", () => {
    const data = bars(100);
    const holder = container();
    const chart = barChart<Bar>(holder, { label: "Bars", data, y: "name", x: "goals", width: 600, height: 300, table: true }, env());
    const svg = chart.element;
    // Rows 2.7 px apart: every 10th name, and no values, since the same value comes every 4th row.
    expect(texts(svg, ".ec-label")).toEqual(data.map((row, i) => (i % 10 === 0 ? row.name : "")));
    expect(texts(svg, ".ec-value").every((text) => text === "")).toBe(true);
    expect(Array.from(svg.querySelectorAll(".ec-marks > .ec-mark"), (g) => g.getAttribute("aria-label"))).toEqual(data.map((row) => `${row.name}: ${row.goals} goals`));
    const table = Array.from(holder.querySelectorAll(".ec-table tbody tr"), (tr) => Array.from(tr.children, (cell) => cell.textContent));
    expect(table).toEqual(data.map((row) => [row.name, String(row.goals)]));
    expect(chart.labels().map((label) => `${label.key} ${label.role} ${label.text}`)).toEqual(data.filter((_, i) => i % 10 === 0).map((row) => `${row.name} category ${row.name}`));
    expect(chart.marks().map((mark) => mark.labelBounds?.length)).toEqual(data.map((_, i) => (i % 10 === 0 ? 1 : 0)));

    // A bar whose name isn't drawn: its tooltip says it.
    svg.querySelector('.ec-mark[data-key="Bar 2"] .ec-hit')!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(Array.from(document.querySelector(".ec-tooltip")?.children ?? [], (line) => line.textContent)).toEqual(["Bar 2", "2 goals"]);
    chart.destroy();
  });

  it("are thinned again by each update, from the layout it heads to, the values hidden while they count", async () => {
    const motion = env("presentation");
    const chart = barChart<Bar>(container(), { label: "Bars", data: bars(10), y: "name", x: "goals", width: 600, height: 300 }, motion);
    const svg = chart.element;
    expect(texts(svg, ".ec-label")).toEqual(bars(10).map((row) => row.name));
    expect(texts(svg, ".ec-value")).toEqual(bars(10).map((row) => String(row.goals)));

    await play(motion.clock, chart.update({ data: bars(100) }));
    expect(texts(svg, ".ec-label")).toEqual(bars(100).map((row, i) => (i % 10 === 0 ? row.name : "")));

    // A re-sort: the names drawn are those heading for every 10th place, as the bars move.
    const update = chart.update({ data: bars(100, 1), sort: "value" });
    motion.clock.advance(750);
    const sorted = [...bars(100, 1)].sort((a, b) => b.goals - a.goals);
    const heading = new Set(sorted.filter((_, i) => i % 10 === 0).map((row) => row.name));
    expect(new Set(texts(svg, ".ec-label").filter((text) => text !== ""))).toEqual(heading);
    // The values change as well, and count while the bars grow, but none is drawn.
    expect(texts(svg, ".ec-value").every((text) => text === "")).toBe(true);
    await play(motion.clock, update);
    expect(texts(svg, ".ec-label")).toEqual(sorted.map((row, i) => (i % 10 === 0 ? row.name : "")));

    await play(motion.clock, chart.update({ data: bars(10) }));
    expect(texts(svg, ".ec-label").filter((text) => text !== "")).toHaveLength(10);
    expect(texts(svg, ".ec-value").filter((text) => text !== "")).toHaveLength(10);
    chart.destroy();
  });
});

describe("Page Up and Page Down", () => {
  it("move a tenth of a bar chart's marks, rounded up, and stop at the ends", () => {
    const chart = barChart<Bar>(container(), { label: "Bars", data: bars(25), y: "name", x: "goals", width: 600 }, env());
    chart.focus("Bar 1");
    // 25 bars: a page is 3.
    expect(walk(["PageDown", "PageDown", "PageUp", "End", "PageUp", "ArrowDown", "PageDown", "PageDown", "Home", "PageUp"])).toEqual([
      "PageDown Bar 4 true",
      "PageDown Bar 7 true",
      "PageUp Bar 4 true",
      "End Bar 25 true",
      "PageUp Bar 22 true",
      "ArrowDown Bar 23 true",
      "PageDown Bar 25 true",
      "PageDown Bar 25 true",
      "Home Bar 1 true",
      "PageUp Bar 1 true"
    ]);
    // A page of one with fewer than 11 marks; with a modifier, the browser's.
    void chart.update({ data: bars(4) });
    expect(walk(["PageDown", "PageDown"])).toEqual(["PageDown Bar 2 true", "PageDown Bar 3 true"]);
    const event = new KeyboardEvent("keydown", { key: "PageDown", ctrlKey: true, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    expect([document.activeElement?.getAttribute("data-key"), event.defaultPrevented]).toEqual(["Bar 3", false]);
    chart.destroy();
  });

  it("move a tenth of a line's x's on numbers, among those revealed", () => {
    const data = Array.from({ length: 25 }, (_, i) => ({ week: i + 1, goals: i % 3 }));
    const chart = lineChart(container(), { label: "Goals", data, x: "week", series: ["goals"], width: 600 }, env());
    chart.focus("1");
    expect(walk(["PageDown", "PageDown", "End", "PageUp", "PageDown", "PageDown"])).toEqual([
      "PageDown 4 true",
      "PageDown 7 true",
      "End 25 true",
      "PageUp 22 true",
      "PageDown 25 true",
      "PageDown 25 true"
    ]);
    // Revealed to week 12: twelve stops, so a page is 2, and the last is week 12.
    chart.reveal(12);
    chart.focus("1");
    expect(walk(["PageDown", "End", "PageDown", "PageUp"])).toEqual(["PageDown 3 true", "End 12 true", "PageDown 12 true", "PageUp 10 true"]);
    chart.destroy();
  });

  describe("on a line's time axis", () => {
    it("go a calendar month on or back, to the first x that far, ending a shorter month on its last day", () => {
      const chart = lineChart<Day>(container(), { label: "Goals", data: days("2026-01-01", "2026-04-30"), x: "day", series: ["goals"], width: 600 }, env());
      chart.focus(at("2026-01-31"));
      expect(walk(["PageDown", "PageDown", "PageUp", "PageUp"])).toEqual([
        `PageDown ${at("2026-02-28")} true`,
        `PageDown ${at("2026-03-28")} true`,
        `PageUp ${at("2026-02-28")} true`,
        `PageUp ${at("2026-01-28")} true`
      ]);
      chart.focus(at("2026-03-31"));
      expect(walk(["PageUp"])).toEqual([`PageUp ${at("2026-02-28")} true`]);
      chart.destroy();

      const leap = lineChart<Day>(container(), { label: "Goals", data: days("2028-01-01", "2028-03-31"), x: "day", series: ["goals"], width: 600 }, env());
      leap.focus(at("2028-01-31"));
      expect(walk(["PageDown", "PageDown"])).toEqual([`PageDown ${at("2028-02-29")} true`, `PageDown ${at("2028-03-29")} true`]);
      leap.destroy();
    });

    it("stop at the ends: a page with no x a month away goes to the last, or the first", () => {
      const chart = lineChart<Day>(container(), { label: "Goals", data: days("2026-01-01", "2026-04-30"), x: "day", series: ["goals"], width: 600 }, env());
      chart.focus(at("2026-04-10"));
      expect(walk(["PageDown", "PageDown"])).toEqual([`PageDown ${at("2026-04-30")} true`, `PageDown ${at("2026-04-30")} true`]);
      chart.focus(at("2026-01-20"));
      expect(walk(["PageUp", "PageUp"])).toEqual([`PageUp ${at("2026-01-01")} true`, `PageUp ${at("2026-01-01")} true`]);
      // Revealed to 15 February: the last stop is there.
      chart.reveal(new Date("2026-02-15T00:00:00Z"));
      chart.focus(at("2026-01-31"));
      expect(walk(["PageDown"])).toEqual([`PageDown ${at("2026-02-15")} true`]);
      chart.destroy();
    });

    it("go to the first x a month or more away when the x's are further apart, and land on a missing value as on any x", () => {
      // Mondays, with no goals recorded on 9 February.
      const mondays = Array.from({ length: 12 }, (_, i) => ({ day: new Date(Date.UTC(2026, 0, 5 + 7 * i)), goals: i === 5 ? null : i }));
      const chart = lineChart<Day>(container(), { label: "Goals", data: mondays, x: "day", series: ["goals"], width: 600 }, env());
      chart.focus(at("2026-01-05"));
      // 5 February is a Thursday: the first Monday after is the 9th, and a month back from it is 9 January, after the 5th.
      expect(walk(["PageDown", "PageUp", "PageDown", "PageDown"])).toEqual([
        `PageDown ${at("2026-02-09")} true`,
        `PageUp ${at("2026-01-05")} true`,
        `PageDown ${at("2026-02-09")} true`,
        `PageDown ${at("2026-03-09")} true`
      ]);
      chart.focus(at("2026-02-09"));
      expect(document.activeElement?.getAttribute("aria-label")).toMatch(/goals missing/);
      chart.destroy();
    });

    describe("in local time in New York", () => {
      inZone("America/New_York");

      it("count the month in the axis's zone: 10 PM on 30 March a month back is 28 February there", () => {
        // Each day at 02:00 UTC: the evening before in New York.
        const data = days("2026-01-01", "2026-04-30", 2);
        const local = lineChart<Day>(container(), { label: "Goals", data, x: "day", series: ["goals"], width: 600, timeZone: "local" }, env());
        local.focus(at("2026-03-31T02:00:00Z"));
        expect(walk(["PageUp"])).toEqual([`PageUp ${at("2026-03-01T02:00:00Z")} true`]);
        local.destroy();
        const utc = lineChart<Day>(container(), { label: "Goals", data, x: "day", series: ["goals"], width: 600 }, env());
        utc.focus(at("2026-03-31T02:00:00Z"));
        expect(walk(["PageUp"])).toEqual([`PageUp ${at("2026-02-28T02:00:00Z")} true`]);
        utc.destroy();
      });
    });

    describe("in local time in Auckland", () => {
      inZone("Pacific/Auckland");

      it("count the month in the axis's zone: 1 AM on 31 January a month on is 28 February there", () => {
        // Each day at 12:00 UTC: 1 AM the day after in Auckland.
        const data = days("2026-01-01", "2026-04-30", 12);
        const local = lineChart<Day>(container(), { label: "Goals", data, x: "day", series: ["goals"], width: 600, timeZone: "local" }, env());
        local.focus(at("2026-01-30T12:00:00Z"));
        expect(walk(["PageDown"])).toEqual([`PageDown ${at("2026-02-27T12:00:00Z")} true`]);
        local.destroy();
        const utc = lineChart<Day>(container(), { label: "Goals", data, x: "day", series: ["goals"], width: 600 }, env());
        utc.focus(at("2026-01-30T12:00:00Z"));
        expect(walk(["PageDown"])).toEqual([`PageDown ${at("2026-02-28T12:00:00Z")} true`]);
        utc.destroy();
      });
    });
  });

  it("move a tenth of an attachment's marks", () => {
    const svg = document.body.appendChild(document.createElementNS(SVG, "svg"));
    const rects = bars(25).map((row, i) => {
      const rect = svg.appendChild(document.createElementNS(SVG, "rect"));
      Object.assign(rect, { __data__: row });
      for (const [name, value] of Object.entries({ x: 0, y: i * 10, width: row.goals * 10, height: 8 })) rect.setAttribute(name, String(value));
      return rect;
    });
    const fx = expressive<Bar>(rects, { key: (d) => d.name, value: (d) => d.goals, keyboard: true }, env());
    const name = () => bars(25)[rects.indexOf(document.activeElement as SVGRectElement)]?.name;
    fx.focus("Bar 1");
    expect(walk(["PageDown", "PageDown", "End", "PageUp", "PageDown", "PageDown", "Home", "PageUp"], name)).toEqual([
      "PageDown Bar 4 true",
      "PageDown Bar 7 true",
      "End Bar 25 true",
      "PageUp Bar 22 true",
      "PageDown Bar 25 true",
      "PageDown Bar 25 true",
      "Home Bar 1 true",
      "PageUp Bar 1 true"
    ]);
    fx.destroy();
  });
});
