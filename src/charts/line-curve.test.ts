// lineChart with `curve`. "monotone" draws each line as d3's curveMonotoneX through its rows, each run
// between gaps on its own, with a sample at each row and at each bend between them, its `at` and
// `value` on the curve; a reveal ends it on the curve; a change and update({ curve }) ease it. "linear",
// and no curve, draw main's marks byte for byte. The effects that read a curved line (threshold,
// travel, delta and label) are checked in src/curved-lines.test.ts, beside src/index.ts.

import { curveMonotoneX, line } from "d3-shape";
import { createMotion, manualClock, type DataEffect, type MarkData, type MarkGeometry, type MotionMode, type Point } from "../core";
import { createRegistry, type PresetFactory } from "../core/registry";
import { flush, play } from "../core/testing";
import { lineChart } from "./line";
import { bendOf } from "./curve";
import { layoutLines, lineEncoding, placeLines, type LineFrame, type RowState } from "./line-layout";
import type { ChartEnv } from "./shell/setup";
import type { LineChart, LineChartOptions } from "./types";

interface Week {
  week: number;
  goals: number | null;
  xg: number | null;
}

/** The prototype's season: seed 42, 38 matchweeks, cumulative goals and xG (a slow start, a hot streak, a late slump). */
function season(seed = 42): Week[] {
  const random = (): number => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const poisson = (lambda: number): number => {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= random();
    } while (p > limit);
    return k - 1;
  };
  const weeks: Week[] = [];
  let goals = 0;
  let xg = 0;
  for (let i = 0; i < 38; i++) {
    const chance = 0.6 + random() * 1.9;
    const form = i < 12 ? 0.72 : i < 26 ? 1.32 : 0.7;
    xg += chance;
    goals += poisson(chance * form);
    weeks.push({ week: i + 1, goals, xg: Math.round(xg * 10) / 10 });
  }
  return weeks;
}

/** The season with goals missing in weeks 5, 6 and 12, and xG in weeks 20 and 21. */
function patchySeason(): Week[] {
  return season().map((w) => ({ ...w, goals: [5, 6, 12].includes(w.week) ? null : w.goals, xg: [20, 21].includes(w.week) ? null : w.xg }));
}

const weeks = season();
const SERIES = ["goals", "xg"] as const;

/** A data effect that keeps the data each mark was last given, by key. */
function dataRecorder(): { effect: DataEffect<Week>; latest: Map<string, MarkData<Week>> } {
  const latest = new Map<string, MarkData<Week>>();
  const effect: DataEffect<Week> = {
    kind: "data",
    run(mark, data, ctx) {
      latest.set(mark.key, data);
      ctx.onChange((moved, next) => {
        if (next) latest.set(moved.key, next as MarkData<Week>);
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

function setup(options: Partial<LineChartOptions<Week>> = {}, mode: MotionMode = "presentation") {
  const container = document.body.appendChild(document.createElement("div"));
  const clock = manualClock();
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: { get: () => undefined }, motion, clock };
  const recorder = dataRecorder();
  const chart = lineChart<Week>(container, { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 640, on: { decorate: recorder.effect }, ...options }, env);
  const mark = (key: string): MarkGeometry => chart.marks().find((m) => m.key === key)!;
  const samples = (key: string) => recorder.latest.get(key)!.samples;
  const column = (key: string) => chart.element.querySelector(`.ec-column[data-key="${key}"]`) as SVGGElement;
  return { container, chart, clock, mark, samples, column, latest: recorder.latest, settle: (running: Promise<unknown>) => play(clock, running) };
}

/** Records the data events: "enter goals", "update xg@3" and so on. */
function listen(chart: LineChart<Week>): string[] {
  const events: string[] = [];
  chart.on("enter", (e) => events.push(`enter ${e.mark.key}`));
  chart.on("update", (e) => events.push(`update ${e.mark.key}`));
  chart.on("exit", (e) => events.push(`exit ${e.mark.key}`));
  return events;
}

/**
 * d3's curveMonotoneX through (x, value) points in data units, which any scale with x increasing maps
 * to the curve d3 draws in px: the value at x, read off its pieces, recorded from the calls it makes
 * on a canvas context. Undefined between runs, or outside them.
 */
function d3Monotone(points: readonly (readonly [number, number | null])[]): (x: number) => number | undefined {
  const pieces: Point[][] = [];
  let pen: Point = { x: 0, y: 0 };
  const to = (piece: Point[]): void => {
    pieces.push(piece);
    pen = piece[piece.length - 1]!;
  };
  const context = {
    moveTo(x: number, y: number) {
      pen = { x, y };
    },
    lineTo: (x: number, y: number) => to([pen, { x, y }]),
    bezierCurveTo: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => to([pen, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y }]),
    closePath() {}
  };
  line<readonly [number, number | null]>()
    .defined((p) => p[1] !== null)
    .x((p) => p[0])
    .y((p) => p[1]!)
    .curve(curveMonotoneX)
    .context(context as unknown as CanvasRenderingContext2D)(points);
  return (x) => {
    const piece = pieces.find((p) => p[0]!.x <= x && x <= p[p.length - 1]!.x);
    if (!piece) return points.find((p) => p[0] === x)?.[1] ?? undefined;
    // d3's control points are a third of the way apart in x, so x runs evenly with the parameter.
    const u = (x - piece[0]!.x) / (piece[piece.length - 1]!.x - piece[0]!.x);
    const s = 1 - u;
    if (piece.length === 2) return s * piece[0]!.y + u * piece[1]!.y;
    return s * s * s * piece[0]!.y + 3 * s * s * u * piece[1]!.y + 3 * s * u * u * piece[2]!.y + u * u * u * piece[3]!.y;
  };
}

/** The chart's scales, from two of its points: data to px. */
function scalesOf(mark: (key: string) => MarkGeometry): { x: (at: number) => number; y: (value: number) => number } {
  const [a, b] = [mark("goals@1").center, mark("goals@38").center];
  const [va, vb] = [weeks[0]!.goals!, weeks[37]!.goals!];
  return { x: (at) => a.x + ((at - 1) / 37) * (b.x - a.x), y: (value) => a.y + ((value - va) / (vb - va)) * (b.y - a.y) };
}

/** How far p is from the nearest point of a polyline. */
function distanceTo(p: Point, polyline: readonly Point[]): number {
  let best = Infinity;
  for (let i = 1; i < polyline.length; i++) {
    const from = polyline[i - 1]!;
    const to = polyline[i]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = dx * dx + dy * dy;
    const u = length > 0 ? Math.max(0, Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(from.x + u * dx - p.x, from.y + u * dy - p.y));
  }
  return best;
}

/** The vertices of a line as drawn: its walk at each sample's t. */
const vertices = (geometry: MarkGeometry, data: MarkData<Week>): Point[] => data.samples.map((s) => geometry.path(s.t));

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

/** Each sample as [t, value, at, gapBefore], a Date's at as its time. */
const samplesOf = (data: MarkData<unknown>): string =>
  JSON.stringify(data.samples.map((s) => [s.t, s.value, s.at instanceof Date ? s.at.getTime() : s.at, s.gapBefore === true]));

/**
 * What line charts draw, as digests, each chart given `more` options as well: its <svg>'s markup, then
 * every mark's samples as its effects last had them, at rest, revealed part way, and on every frame of
 * a change; and a time axis laid out.
 */
async function digests(more: Partial<LineChartOptions<Week>>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const drawn = (data: Week[]) => {
    const made = setup({ data, ...more });
    const keys = () => [...made.latest.keys()].sort();
    return { ...made, drawn: () => `${made.chart.element.outerHTML}\n${keys().map((key) => `${key} ${samplesOf(made.latest.get(key)!)}`).join("\n")}` };
  };

  const full = drawn(season());
  out.season = hash(full.drawn());
  full.chart.reveal(12.4);
  out["revealed to 12.4"] = hash(full.drawn());
  full.chart.reveal(20);
  out["revealed to 20"] = hash(full.drawn());

  const patchy = drawn(patchySeason());
  out["missing weeks"] = hash(patchy.drawn());
  patchy.chart.reveal(5.5);
  out["missing weeks, revealed to 5.5"] = hash(patchy.drawn());

  // Two weeks added and an earlier one changed: every frame of the change.
  const changing = drawn(season().slice(0, 30));
  const next = season().slice(0, 32);
  next[10] = { ...next[10]!, goals: next[10]!.goals! + 3 };
  const frames: string[] = [];
  const running = changing.chart.update({ data: next });
  for (let ms = 0; ms < 1200; ms += 50) {
    changing.clock.advance(50);
    frames.push(changing.drawn());
  }
  await play(changing.clock, running);
  frames.push(changing.drawn());
  out["a change, frame by frame"] = hash(frames.join("\n"));

  // A time axis laid out: three series over 1,000 days, revealed part way, with end labels.
  const start = Date.UTC(2024, 0, 1);
  const rows: RowState<number>[] = Array.from({ length: 1000 }, (_, i) => ({
    key: String(i),
    datum: i,
    x: start + i * 86_400_000,
    values: { a: Math.sin(i / 40) * 50 + 60, b: (i * 7919) % 97, c: i / 10 },
    ...(i % 97 === 5 ? { missing: new Set(["b"]) } : {})
  }));
  const frame: LineFrame = { scale: { lo: 0, hi: 120 }, box: { xLo: rows[0]!.x, xHi: rows[999]!.x, left: 40, right: 900, top: 12, bottom: 268, width: 960, height: 300 } };
  const labels = { text: (series: string, value: number) => `${value.toFixed(1)} ${series}`, measure: (text: string) => text.length * 7 };
  const lines = placeLines(frame, rows, ["a", "b", "c"], start + 612.5 * 86_400_000, true, labels, ...((more.curve === undefined ? [] : [0]) as [] | [number]));
  out["a time axis laid out"] = hash(lines.map((placed) => `${placed.series} ${placed.geometry.outline.d} ${samplesOf(placed.data)} ${JSON.stringify(placed.label)}`).join("\n"));
  return out;
}

/** The digests main (819d714) gave, with this file's digests() run there, before `curve` came in. */
const MAIN: Readonly<Record<string, string>> = {
  season: "09226562e3206ceb",
  "revealed to 12.4": "377d5f81cadf6617",
  "revealed to 20": "aea0c2558267c007",
  "missing weeks": "95b99a70c0750602",
  "missing weeks, revealed to 5.5": "d51c66f904294911",
  "a change, frame by frame": "144a9aeb7c35848d",
  "a time axis laid out": "982a8378b8bdfac4"
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('lineChart: curve "linear"', () => {
  it("draws main's marks byte for byte, as no curve does: at rest, revealed, with missing weeks, through a change, and on a time axis", async () => {
    expect(await digests({})).toEqual(MAIN);
    expect(await digests({ curve: "linear" })).toEqual(MAIN);
  });
});

describe('lineChart: curve "monotone"', () => {
  it("draws each line on d3's curveMonotoneX through its points, with a sample at each row and each bend, on the curve and in order", () => {
    const { mark, samples, latest } = setup({ curve: "monotone" });
    const px = scalesOf(mark);
    for (const series of SERIES) {
      const curve = d3Monotone(weeks.map((w) => [w.week, w[series]]));
      const line = mark(series);
      const all = samples(series);
      // Every row's sample, in order, and more between them: a bend's x is never a whole week.
      expect(all.filter((s) => Number.isInteger(s.at)).map((s) => s.at)).toEqual(weeks.map((w) => w.week));
      expect(all.length).toBeGreaterThan(2 * weeks.length);
      expect(all[0]!.t).toBe(0);
      expect(all[all.length - 1]!.t).toBe(1);
      all.forEach((s, i) => {
        if (i > 0) expect(s.t).toBeGreaterThan(all[i - 1]!.t);
        if (i > 0) expect(s.at as number).toBeGreaterThan(all[i - 1]!.at as number);
        expect(s.value).toBeCloseTo(curve(s.at as number)!, 9);
        const drawn = line.path(s.t);
        expect(drawn.x).toBeCloseTo(px.x(s.at as number), 6);
        expect(drawn.y).toBeCloseTo(px.y(s.value), 6);
      });
      // Each point is on its line: a vertex, where its row's sample is.
      const drawn = vertices(line, latest.get(series)!);
      for (const w of weeks) {
        const { center } = mark(`${series}@${w.week}`);
        const at = drawn[all.findIndex((s) => s.at === w.week)]!;
        expect(at.x).toBeCloseTo(center.x, 6);
        expect(at.y).toBeCloseTo(center.y, 6);
      }
    }
  });

  it("curves each run between gaps on its own: a run of two straight, and a value alone its point", () => {
    // Goals missing in weeks 5, 6 and 9, so weeks 7 and 8 are a run of two; xG in weeks 20 and 22, so week 21 is alone.
    const data = weeks.map((w) => ({ ...w, goals: [5, 6, 9].includes(w.week) ? null : w.goals, xg: [20, 22].includes(w.week) ? null : w.xg }));
    const { chart, mark, samples } = setup({ curve: "monotone", data });
    for (const series of SERIES) {
      const curve = d3Monotone(data.map((w) => [w.week, w[series]]));
      for (const s of samples(series)) expect(s.value).toBeCloseTo(curve(s.at as number)!, 9);
      expect(mark(series).gaps).toHaveLength(2);
    }
    const goals = samples("goals");
    // Nothing between weeks 7 and 8, nor in a gap; each run starts with gapBefore.
    expect(goals.filter((s) => (s.at as number) > 7 && (s.at as number) < 8)).toEqual([]);
    expect(goals.filter((s) => (s.at as number) > 4 && (s.at as number) < 7)).toEqual([]);
    expect(goals.filter((s) => s.gapBefore).map((s) => s.at)).toEqual([7, 10]);
    expect(samples("xg").filter((s) => s.gapBefore).map((s) => s.at)).toEqual([21, 23]);
    expect(chart.element.querySelector('.ec-point[data-key="xg@21"]')!.classList.contains("ec-alone")).toBe(true);
  });

  it("ends a line revealed part way on the curve, which the reveal doesn't change before it", () => {
    const { chart, mark, samples } = setup({ curve: "monotone" });
    const full = samples("goals").map((s) => [s.at, s.value]);
    const curve = d3Monotone(weeks.map((w) => [w.week, w.goals]));
    const px = scalesOf(mark);
    for (const through of [12.4, 12, 30.75]) {
      chart.reveal(through);
      const revealed = samples("goals");
      const last = revealed[revealed.length - 1]!;
      expect(last.at).toBe(through);
      expect(last.value).toBeCloseTo(curve(through)!, 9);
      expect(last.t).toBe(1);
      expect(revealed.slice(0, -1).map((s) => [s.at, s.value])).toEqual(full.filter(([at]) => (at as number) < through));
      // The line's end, its dot and its label are there too.
      expect(mark("goals").end.x).toBeCloseTo(px.x(through), 6);
      expect(mark("goals").end.y).toBeCloseTo(px.y(last.value), 6);
      const label = chart.labels().find((l) => l.key === "goals")!;
      expect(label.text).toBe(`${Math.round(last.value)} goals`);
    }
  });

  it("follows the rows through a change, through every point on every frame, and lands as a chart drawn with the new data", async () => {
    const { chart, clock, mark, latest, settle } = setup({ curve: "monotone", data: weeks.slice(0, 30) });
    const next = season(7).slice(0, 32);
    const running = chart.update({ data: next });
    for (let frame = 0; frame < 70; frame++) {
      clock.advance(16);
      await flush();
      for (const series of SERIES) {
        const drawn = vertices(mark(series), latest.get(series)!);
        for (const point of chart.marks().filter((m) => m.key.startsWith(`${series}@`))) {
          const near = Math.min(...drawn.map((v) => Math.hypot(v.x - point.center.x, v.y - point.center.y)));
          expect(near, `${point.key} on frame ${frame}`).toBeLessThan(1e-6);
        }
      }
    }
    await settle(running);
    const fresh = setup({ curve: "monotone", data: next });
    expect(chart.marks().map((m) => m.outline.d)).toEqual(fresh.chart.marks().map((m) => m.outline.d));
  });

  it("grows a new week out of the last without a jump: the weeks before it move no more on any frame than a straight line's do", async () => {
    /** The farthest any vertex up to week 14 is, on any frame, from the line as it was in the frame before. */
    const most = async (curve: "linear" | "monotone"): Promise<number> => {
      const { chart, clock, mark, latest, settle } = setup({ curve, data: weeks.slice(0, 15) });
      const drawn = () => ({ points: vertices(mark("goals"), latest.get("goals")!), samples: latest.get("goals")!.samples });
      const running = chart.update({ data: weeks.slice(0, 16) });
      let previous = drawn().points;
      let largest = 0;
      for (let frame = 0; frame < 80; frame++) {
        clock.advance(16);
        await flush();
        const now = drawn();
        now.points.forEach((p, i) => {
          if ((now.samples[i]!.at as number) <= 14) largest = Math.max(largest, distanceTo(p, previous));
        });
        previous = now.points;
      }
      await settle(running);
      return largest;
    };
    const straight = await most("linear");
    const curved = await most("monotone");
    expect(curved).toBeLessThan(straight + 0.25);
  });

  it.each(["presentation", "off"] as const)("changes with update({ curve }) both ways in %s, with nothing entering and focus kept", async (mode) => {
    const { chart, clock, mark, samples, column, settle } = setup({}, mode);
    const straight = chart.marks().map((m) => m.outline.d);
    const curved = setup({ curve: "monotone" }).chart.marks().map((m) => m.outline.d);
    chart.focus("12");
    expect(document.activeElement).toBe(column("12"));
    const events = listen(chart);

    const running = chart.update({ curve: "monotone" });
    if (mode === "presentation") {
      clock.advance(200);
      await flush();
      // Part way: neither straight nor curved, and between each two weeks' values all the way.
      const middle = mark("goals").outline.d;
      expect(middle).not.toBe(straight[0]);
      expect(middle).not.toBe(curved[0]);
      for (const s of samples("goals")) {
        const at = s.at as number;
        const [a, b] = [weeks[Math.floor(at) - 1]!.goals!, weeks[Math.min(37, Math.ceil(at) - 1)]!.goals!];
        expect(s.value).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-9);
        expect(s.value).toBeLessThanOrEqual(Math.max(a, b) + 1e-9);
      }
    } else {
      // Off jumps.
      await flush();
      expect(chart.marks().map((m) => m.outline.d)).toEqual(curved);
    }
    await settle(running);
    expect(chart.marks().map((m) => m.outline.d)).toEqual(curved);

    await settle(chart.update({ curve: "linear" }));
    expect(chart.marks().map((m) => m.outline.d)).toEqual(straight);
    expect(samples("goals").map((s) => s.at)).toEqual(weeks.map((w) => w.week));
    expect(events).toEqual([]);
    expect(document.activeElement).toBe(column("12"));
  });

  it("throws a TypeError naming a curve it doesn't know, and update() rejects one, changing nothing", async () => {
    for (const curve of ["basis", "step", 2, ""]) {
      expect(() => setup({ curve: curve as never })).toThrow(new TypeError(`lineChart: curve must be "linear" or "monotone", got ${typeof curve === "string" ? JSON.stringify(curve) : curve}.`));
    }
    // Nothing is left behind.
    expect(document.body.querySelectorAll("svg")).toHaveLength(0);
    const { chart, settle } = setup({ curve: "monotone" });
    const before = chart.element.outerHTML;
    await expect(chart.update({ curve: "natural" as never })).rejects.toThrow(new TypeError('lineChart: curve must be "linear" or "monotone", got "natural".'));
    expect(chart.element.outerHTML).toBe(before);
    // Still curved: an update of something else keeps the curve.
    const curved = chart.marks()[0]!.outline.d;
    await settle(chart.update({ label: "Goals and xG" }));
    expect(chart.marks()[0]!.outline.d).toBe(curved);
  });

  it("lays out ten years of days in four series, curved, in good time, with no more vertices than 0.1 px needs", () => {
    interface Day {
      day: Date;
      a: number;
      b: number;
      c: number;
      d: number;
    }
    let seed = 5;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    const walk = [50, 50, 50, 50];
    const days: Day[] = Array.from({ length: 3653 }, (_, i) => {
      for (let s = 0; s < 4; s++) walk[s] = walk[s]! + (random() - 0.5) * 4;
      return { day: new Date(Date.UTC(2016, 0, 1 + i)), a: walk[0]!, b: walk[1]!, c: walk[2]!, d: walk[3]! };
    });
    const laidOut = (width: number, curve: "linear" | "monotone") => {
      const options: LineChartOptions<Day> = { label: "Ten years", data: days, x: "day", series: ["a", "b", "c", "d"], curve };
      const layout = layoutLines({ data: days, encoding: lineEncoding(options), width, height: undefined, format: String, measure: (text) => text.length * 7, label: undefined });
      const states = layout.rows.map((row) => ({ key: row.key, datum: row.datum, x: row.x, values: row.levels, missing: row.missing }));
      const started = performance.now();
      const lines = placeLines(layout.frame, states, layout.series, Infinity, true, undefined, bendOf(layout.curve));
      // Revealed part way, as playback draws a frame.
      placeLines(layout.frame, states, layout.series, layout.rows[1800]!.x + 3_600_000, true, undefined, bendOf(layout.curve));
      return { lines, ms: performance.now() - started };
    };
    const straight = laidOut(960, "linear");
    const curved = laidOut(960, "monotone");
    // About 25 ms straight and 55 curved here on a quiet run, the curve's share in proportion to its vertices.
    expect(curved.ms).toBeLessThan(1000);
    for (const line of curved.lines) {
      expect(line.data.samples.length).toBeGreaterThan(days.length);
      expect(line.data.samples.length).toBeLessThan(3 * days.length);
    }
    expect(straight.lines.every((line) => line.data.samples.length === days.length)).toBe(true);
    // At 320 px a day is under 0.1 px wide, and its curve can't stray further than that from straight.
    for (const line of laidOut(320, "monotone").lines) expect(line.data.samples.length).toBe(days.length);
  });
});
