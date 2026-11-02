// A bar chart's labels as thinning hides and shows them (M13 step 5). A change fades out the labels
// it hides over its first half and fades in those it shows over its second, as a chart switch fades
// its unmatched marks, so labels don't stand on each other while the bars pass. With motion off, in
// analysis and on a jump (a resize, fonts loading), they switch at once. And when no value label is
// drawn, the bars take their room.

import { createMotion, manualClock, type MotionMode } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { play } from "../core/testing";
import { barChart, type ChartEnv } from "./bar";
import type { BarChartOptions } from "./types";

interface Bar {
  name: string;
  goals: number;
}

/** "Bar 1" to "Bar n", the same goals every 4th. */
const bars = (n: number, by = 0): Bar[] => Array.from({ length: n }, (_, i) => ({ name: `Bar ${i + 1}`, goals: 1 + ((i + by) % 4) }));

/** 100 bars 2.7 px apart: every 10th name, and no values, since the same value comes every 4th row. */
const LONG: Partial<BarChartOptions<Bar>> = { data: bars(100), y: "name", x: "goals", width: 600, height: 300 };

function setup(options: Partial<BarChartOptions<Bar>> = {}, mode: MotionMode = "presentation") {
  const container = document.body.appendChild(document.createElement("div"));
  const clock = manualClock();
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const chart = barChart<Bar>(container, { label: "Goals", data: bars(10), y: "name", x: "goals", ...LONG, ...options }, env);
  return { container, chart, clock, motion, svg: chart.element };
}

interface Drawn {
  readonly text: string;
  /** 1 without the attribute. */
  readonly opacity: number;
}

/** Each mark's category or value label, by key, as drawn now. */
function drawn(svg: SVGSVGElement, part: "label" | "value"): Map<string, Drawn> {
  return new Map(
    Array.from(svg.querySelectorAll(".ec-marks > .ec-mark"), (g) => {
      const text = g.querySelector(`.ec-${part}`)!;
      const opacity = text.getAttribute("opacity");
      return [g.getAttribute("data-key")!, { text: text.textContent ?? "", opacity: opacity === null ? 1 : Number(opacity) }] as const;
    })
  );
}

/** The keys whose label of `part` has text. */
const showing = (svg: SVGSVGElement, part: "label" | "value"): Set<string> => new Set([...drawn(svg, part)].filter(([, label]) => label.text !== "").map(([key]) => key));

/** Every label, category and value, with an opacity attribute. */
const faded = (svg: SVGSVGElement): Element[] => Array.from(svg.querySelectorAll(".ec-marks .ec-label[opacity], .ec-marks .ec-value[opacity]"));

/** The names a sorted layout of `data` draws: every `every`th in value order. */
function heading(data: readonly Bar[], every: number): Set<string> {
  return new Set([...data].sort((a, b) => b.goals - a.goals).flatMap((row, i) => (i % every === 0 ? [row.name] : [])));
}

const minus = <T>(a: Set<T>, b: Set<T>): Set<T> => new Set([...a].filter((item) => !b.has(item)));

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("barChart: labels thinning hides and shows, through a change", () => {
  it("fade out over the change's first half, and in over its second; a label that stays is drawn as it was", async () => {
    const { chart, clock, svg } = setup();
    const before = showing(svg, "label");
    const next = bars(100, 1);
    // Values and places both change: a 1,000 ms change, in two stages.
    const update = chart.update({ data: next, sort: "value" });
    const after = heading(next, 10);
    const going = minus(before, after);
    const coming = minus(after, before);
    const staying = new Set([...before].filter((key) => after.has(key)));
    expect([going.size, coming.size, staying.size].every((size) => size > 0)).toBe(true);

    const seen = { going: [] as number[], coming: [] as number[] };
    const [goer] = going;
    const [comer] = coming;
    for (let ms = 0; ms <= 1000; ms += 50) {
      if (ms > 0) clock.advance(50);
      const labels = drawn(svg, "label");
      for (const [key, label] of labels) {
        const where = `${key} at ${ms} ms`;
        // Those going fade together, and so do those coming.
        if (staying.has(key)) expect(label, where).toEqual({ text: key, opacity: 1 });
        else if (going.has(key)) expect(label, where).toEqual(ms < 500 ? { text: key, opacity: labels.get(goer!)!.opacity } : { text: "", opacity: 1 });
        else if (coming.has(key)) expect(label, where).toEqual(ms > 500 ? { text: key, opacity: labels.get(comer!)!.opacity } : { text: "", opacity: 1 });
        else expect(label.text, where).toBe("");
      }
      seen.going.push(labels.get(goer!)!.text === "" ? 0 : labels.get(goer!)!.opacity);
      seen.coming.push(labels.get(comer!)!.text === "" ? 0 : labels.get(comer!)!.opacity);
      // No value is drawn on either side, not even while they count.
      expect(showing(svg, "value").size).toBe(0);
    }
    // Out from full, down to nothing by half way; in from nothing at half way, to full.
    const rounded = (values: number[]) => values.map((value) => Math.round(value * 1000) / 1000);
    expect(rounded(seen.going.slice(0, 11))).toEqual(rounded(seen.going.slice(0, 11)).sort((a, b) => b - a));
    expect(seen.going[0]).toBe(1);
    expect(seen.going.slice(10).every((value) => value === 0)).toBe(true);
    expect(seen.going.slice(1, 10).every((value) => value > 0 && value < 1)).toBe(true);
    expect(seen.coming.slice(0, 11).every((value) => value === 0)).toBe(true);
    expect(seen.coming.slice(11, 20).every((value) => value > 0 && value < 1)).toBe(true);
    expect(rounded(seen.coming.slice(10))).toEqual(rounded(seen.coming.slice(10)).sort((a, b) => a - b));
    expect(seen.coming[20]).toBe(1);

    await play(clock, update);
    expect(showing(svg, "label")).toEqual(after);
    expect(faded(svg)).toEqual([]);
    chart.destroy();
  });

  it("take each half of a shorter change: a re-sort alone is 500 ms, so they're out by 250 and in from there", async () => {
    const { chart, clock, svg } = setup();
    const before = showing(svg, "label");
    const update = chart.update({ sort: "value" });
    const after = heading(bars(100), 10);
    const [goer] = minus(before, after);
    const [comer] = minus(after, before);
    const at = (key: string) => drawn(svg, "label").get(key)!;
    clock.advance(125);
    expect(at(goer!).text).toBe(goer);
    expect(at(goer!).opacity).toBeGreaterThan(0);
    expect(at(goer!).opacity).toBeLessThan(1);
    expect(at(comer!).text).toBe("");
    clock.advance(125);
    expect([at(goer!).text, at(comer!).text]).toEqual(["", ""]);
    clock.advance(125);
    expect(at(comer!).text).toBe(comer);
    expect(at(comer!).opacity).toBeGreaterThan(0);
    expect(at(comer!).opacity).toBeLessThan(1);
    clock.advance(125);
    await play(clock, update);
    expect(at(comer!)).toEqual({ text: comer, opacity: 1 });
    expect(faded(svg)).toEqual([]);
    chart.destroy();
  });

  it("fade the value labels all together, out as the bars take their room, and in again as they give it back", async () => {
    // Ten bars of 5: 27 px apart at 300 px high, so every name and value; 12 px apart at 150, so every
    // other name and no values. "5" is 7.5 px in jsdom, so the values kept 7.5 + 6 + 4 px past the tips.
    const data = bars(10).map((row) => ({ ...row, goals: 5 }));
    const { chart, clock, svg } = setup({ data, height: 300 });
    const length = () => chart.marks()[0]!.bounds.width;
    const values = () => [...drawn(svg, "value").values()];
    const shown = length();
    expect(values().every((label) => label.text === "5" && label.opacity === 1)).toBe(true);

    const hiding = chart.update({ height: 150 });
    clock.advance(250);
    const opacity = values()[0]!.opacity;
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    expect(values()).toEqual(data.map(() => ({ text: "5", opacity })));
    // The frame moves as any change moves it.
    expect(length()).toBeGreaterThan(shown);
    clock.advance(250);
    expect(values().every((label) => label.text === "")).toBe(true);
    await play(clock, hiding);
    // The ticks' half width is past the tips now ("6" is 6.6 px at 11 px, so 5.3), and the bar of 5,
    // of 6, takes 5 / 6 of the room.
    expect(length()).toBeCloseTo(shown + (17.5 - 5.3) * (5 / 6), 9);
    expect(showing(svg, "label").size).toBe(5);
    expect(values().every((label) => label.text === "")).toBe(true);

    const showingAgain = chart.update({ height: 300 });
    clock.advance(250);
    expect(values().every((label) => label.text === "")).toBe(true);
    clock.advance(500);
    const back = values()[0]!.opacity;
    expect(back).toBeGreaterThan(0);
    expect(back).toBeLessThan(1);
    expect(values()).toEqual(data.map(() => ({ text: "5", opacity: back })));
    await play(clock, showingAgain);
    expect(length()).toBeCloseTo(shown, 9);
    expect(values()).toEqual(data.map(() => ({ text: "5", opacity: 1 })));
    expect(faded(svg)).toEqual([]);
    chart.destroy();
  });

  it("go on from where they are when an update takes over mid-fade, so none jumps", async () => {
    const { chart, clock, svg } = setup();
    const before = showing(svg, "label");
    const first = chart.update({ data: bars(100, 1), sort: "value" });
    const [goer] = minus(before, heading(bars(100, 1), 10));
    clock.advance(250);
    const mid = drawn(svg, "label");
    expect(mid.get(goer!)!.opacity).toBeGreaterThan(0);
    // Back to the first layout: the name going is wanted again, and waits out the first half where it is.
    const second = chart.update({ data: bars(100), sort: "none" });
    expect(drawn(svg, "label")).toEqual(mid);
    clock.advance(250);
    expect(drawn(svg, "label").get(goer!)).toEqual(mid.get(goer!));
    clock.advance(500);
    expect(drawn(svg, "label").get(goer!)!.opacity).toBeGreaterThan(mid.get(goer!)!.opacity);
    await play(clock, second);
    await first;
    expect(showing(svg, "label")).toEqual(before);
    expect(faded(svg)).toEqual([]);
    chart.destroy();
  });

  it("switch at once with motion off, and in analysis, which has no stages", async () => {
    for (const mode of ["off", "analysis"] as const) {
      const { chart, clock, svg } = setup({}, mode);
      const next = bars(100, 1);
      const update = chart.update({ data: next, sort: "value" });
      // The first frame draws the names the change heads to, and no label fades.
      expect(showing(svg, "label"), mode).toEqual(heading(next, 10));
      expect(faded(svg), mode).toEqual([]);
      expect(clock.idle, mode).toBe(mode === "off");
      clock.advance(50);
      expect(showing(svg, "label"), mode).toEqual(heading(next, 10));
      expect(faded(svg), mode).toEqual([]);
      await play(clock, update);
      chart.destroy();
    }
  });

  it("switch at once when a resize lands a change mid-fade, thinned for the new width", async () => {
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
    // 40 columns, as wide as the container: jsdom gives it no width, so 640 px.
    const columns: Partial<BarChartOptions<Bar>> = { data: bars(40), x: "name", y: "goals", width: undefined, height: undefined };
    const { chart, clock, svg } = setup(columns);
    expect(svg.getAttribute("width")).toBe("640");
    let settled = false;
    void chart.update({ data: bars(40, 1), sort: "value" }).then(() => (settled = true));
    clock.advance(250);
    expect(faded(svg).length).toBeGreaterThan(0);
    for (const callback of observers) callback([{ contentRect: { width: 320 } } as ResizeObserverEntry], {} as ResizeObserver);
    clock.advance(16);
    await play(clock, Promise.resolve());
    expect(settled).toBe(true);
    expect(clock.idle).toBe(true);
    expect(faded(svg)).toEqual([]);
    // As a chart drawn at 320 px with that data draws them.
    const fresh = setup({ ...columns, data: bars(40, 1), sort: "value", width: 320 });
    expect(drawn(svg, "label")).toEqual(drawn(fresh.svg, "label"));
    expect(drawn(svg, "label")).not.toEqual(drawn(setup({ ...columns, data: bars(40, 1), sort: "value", width: 640 }).svg, "label"));
    chart.destroy();
  });

  it("switch at once when web fonts load mid-fade", async () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
    try {
      const { chart, clock, svg } = setup();
      const next = bars(100, 1);
      let settled = false;
      void chart.update({ data: next, sort: "value" }).then(() => (settled = true));
      clock.advance(250);
      expect(faded(svg).length).toBeGreaterThan(0);
      fonts.dispatchEvent(new Event("loadingdone"));
      expect(showing(svg, "label")).toEqual(heading(next, 10));
      expect(faded(svg)).toEqual([]);
      await play(clock, Promise.resolve());
      expect(settled).toBe(true);
      expect(clock.idle).toBe(true);
      chart.destroy();
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });
});

describe("barChart: labels that thinning leaves as they were", () => {
  it("draw every frame of a change as main did, byte for byte, thinned or not", async () => {
    expect(await frameDigests()).toEqual(MAIN);
  });
});

/**
 * Charts whose thinning a change leaves as it was, as digests of their <svg>'s markup on every frame:
 * a chart that draws every label, and one that thins its names and draws every value, as bars and as
 * columns, through a change of values or order.
 */
async function frameDigests(): Promise<Record<string, string>> {
  // Every other row 1 or 20, so the values stay apart while the names meet.
  const apart = (n: number, by: number) => bars(n).map((row, i) => ({ ...row, goals: i % 2 === 0 ? 1 + by : 20 - by }));
  const cases: Record<string, readonly [Partial<BarChartOptions<Bar>>, Partial<BarChartOptions<Bar>>]> = {
    "every label": [{ data: bars(4), height: undefined }, { data: bars(4, 1), sort: "value" }],
    "every label, columns": [{ data: bars(4), x: "name", y: "goals", height: undefined }, { data: bars(4, 2), sort: "key" }],
    "thinned names": [{ data: apart(12, 0), height: 160 }, { data: apart(12, 3), sort: "key" }],
    "thinned names, columns": [{ data: apart(40, 0), x: "name", y: "goals", height: undefined, width: 900 }, { data: apart(40, 2) }]
  };
  const out: Record<string, string> = {};
  for (const [name, [options, next]] of Object.entries(cases)) {
    const { chart, clock, svg } = setup(options);
    const thinned = name.startsWith("thinned");
    const labels = () => {
      const n = drawn(svg, "label").size;
      expect(showing(svg, "value").size, name).toBe(n);
      expect(showing(svg, "label").size < n, name).toBe(thinned);
      return [...showing(svg, "label")];
    };
    const names = labels();
    const frames = [svg.outerHTML];
    const update = chart.update(next);
    frames.push(svg.outerHTML);
    for (let ms = 0; ms < 1200; ms += 50) {
      clock.advance(50);
      frames.push(svg.outerHTML);
    }
    await play(clock, update);
    frames.push(svg.outerHTML);
    // The same names, the bars sorted by key or not, so the thinning is as it was.
    expect(labels().sort(), name).toEqual(names.sort());
    out[name] = hash(frames.join("\n"));
    chart.destroy();
  }
  return out;
}

/** The digests main gave (2d84d47, and 2bab95f after M13 steps 1 to 4), with this file's frameDigests() run there, before labels faded as they thinned. */
const MAIN: Readonly<Record<string, string>> = {
  "every label": "bee8bd60acdebab1",
  "every label, columns": "cf56f808a40051a7",
  "thinned names": "828d0a7d075b7082",
  "thinned names, columns": "193a970a605e66fc"
};

/** A 64-bit hash of the text (cyrb53's mixing, both halves kept), as 16 hex digits: enough to tell two drawings apart. */
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
