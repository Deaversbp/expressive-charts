// A season with weeks nobody recorded, on lineChart, with the built-in effects that meet its gaps:
// threshold colours nothing where goals or xG are missing, a riding ball rests at the last value while
// the line is revealed into a gap and jumps on when the next comes, and delta labels the change at
// the line's last value. On a time axis too, and linked to bars at a missing week. This brings charts
// and effects together, so it lives beside src/index.ts, as src/xg.test.ts does.

import { barChart, lineChart, link, type ChartEnv } from "./charts";
import { transformAttribute } from "./charts/render/svg";
import { createMotion, manualClock, type MarkGeometry, type MotionMode } from "./core";
import { drawnInGaps, flush, play, testContext, type Drawn } from "./core/testing";
import { delta, only, parallel, threshold, travel } from "./effects";
import { soccerBall } from "./icons/sport";
import { presetRegistry } from "./registries";

interface Week {
  week: number;
  goals: number | null;
  xg: number | null;
}

/**
 * Goals behind xG in weeks 1 and 2, nobody counted goals in week 3, ahead in week 4; then behind
 * again from part way to week 5 until week 7, but nobody recorded xG in week 6.
 */
const weeks: Week[] = [
  { week: 1, goals: 0, xg: 1.2 },
  { week: 2, goals: 2, xg: 2.1 },
  { week: 3, goals: null, xg: 3.6 },
  { week: 4, goals: 5, xg: 4.4 },
  { week: 5, goals: 5, xg: 5.5 },
  { week: 6, goals: 6, xg: null },
  { week: 7, goals: 7, xg: 7.5 }
];

function environment(mode: MotionMode = "presentation"): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: { get: (name) => (name === soccerBall.name ? soccerBall : undefined) }, motion, clock: manualClock() };
}

const story = () => only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on" })));

function setup(mode: MotionMode = "presentation", data: readonly Week[] = weeks) {
  const env = environment(mode);
  const container = document.body.appendChild(document.createElement("div"));
  const chart = lineChart<Week>(container, { label: "Goals vs xG", data, x: "week", series: ["goals", "xg"], width: 640, on: { decorate: story() } }, env);
  const run = () => chart.element.querySelector('.ec-overlay > .ec-run[data-key="goals"]');
  /** The red parts threshold draws on the goals line. */
  const reds = (): string[] => Array.from(run()?.querySelectorAll(":scope > path.ec-path") ?? [], (path) => path.getAttribute("d")!);
  const ball = () => run()?.querySelector('.ec-icon[data-icon="soccer-ball"]')?.getAttribute("transform") ?? undefined;
  const line = (): MarkGeometry => chart.marks()[0]!;
  /**
   * What threshold should colour, worked out from the data: weeks 1 to 2, up to the gap; and from
   * where goals cross below xG between weeks 4 and 5 (5 − 4.4 = 0.6 ahead, 5.5 − 5 = 0.5 behind)
   * to week 5, since xG is missing in week 6. Weeks 4 to 5 are level on the walk, so t is in proportion to x there.
   */
  const expected = (): string[] => {
    const goals = line();
    const [from, to] = goals.gaps![0]!;
    const x = (week: number) => chart.marks().find((mark) => mark.key === `goals@${week}`)!.center.x;
    const t5 = to + (x(5) - x(4)) / goals.length;
    return [goals.slice(0, from), goals.slice(to + (0.6 / 1.1) * (t5 - to), t5)];
  };
  return { env, chart, reds, ball, line, expected };
}

/** Where the ball rests on a line: travel's own end state, as the chart writes it. */
function restingBall(line: MarkGeometry): string | undefined {
  const ctx = testContext({ icons: [soccerBall] });
  travel("soccer-ball", { ride: "on" }).end(line, ctx);
  const [icon] = ctx.layer.drawn.filter((drawn) => drawn.kind === "icon");
  return icon?.kind === "icon" && icon.transform ? transformAttribute(icon.transform) : undefined;
}

/** The paths as drawnInGaps reads them. */
const asDrawn = (paths: readonly string[]): Drawn[] => paths.map((d, id) => ({ kind: "path", id, d, paint: {} }));

afterEach(() => {
  document.body.replaceChildren();
});

describe("a season with missing weeks on lineChart", () => {
  it("colours goals red below xG only where both have a value, and never inside a gap", async () => {
    const { env, reds, line, expected } = setup();
    for (let t = 0; t < 5000; t += 16) env.clock.advance(16);
    await flush();
    const goals = line();
    expect(goals.gaps).toHaveLength(1);
    // Joined across week 6, goals would be red on to week 7.
    expect(reds()).toEqual(expected());
    expect(drawnInGaps(goals, asDrawn(reds()))).toEqual([]);
  });

  it("colours the same with motion off, at once", () => {
    const { reds, expected } = setup("off");
    expect(reds()).toEqual(expected());
  });

  it("rides the ball on the line's tip, resting at its last value while it's revealed into the gap and jumping on when the next comes", async () => {
    const { env, chart, ball, line } = setup();
    for (let t = 0; t < 5000; t += 16) env.clock.advance(16);
    await flush();
    expect(ball()).toBe(restingBall(line()));
    chart.reveal(2);
    await flush();
    const atWeek2 = ball();
    expect(atWeek2).toBe(restingBall(line()));
    // Into the gap: the line ends at week 2, so the ball stays.
    for (const week of [2.25, 2.5, 3, 3.75]) {
      chart.reveal(week);
      await flush();
      expect(ball(), `week ${week}`).toBe(atWeek2);
    }
    // Week 4 comes: the ball rests there, at the last value, past the gap.
    chart.reveal(4);
    await flush();
    expect(ball()).not.toBe(atWeek2);
    expect(ball()).toBe(restingBall(line()));
    chart.reveal(4.5);
    await flush();
    expect(ball()).toBe(restingBall(line()));
  });

  it("labels the change at the line's last value with delta, past its end label", async () => {
    const env = environment();
    const container = document.body.appendChild(document.createElement("div"));
    const chart = lineChart<Week>(container, { label: "Goals vs xG", data: weeks, x: "week", series: ["goals", "xg"], width: 640, on: { update: only("goals", delta()) } }, env);
    await play(env.clock, chart.update({ data: weeks.map((w) => (w.week === 7 ? { ...w, goals: 9 } : w)) }));
    const texts = Array.from(chart.element.querySelectorAll('.ec-overlay > .ec-run[data-key="goals"] text'), (text) => text.textContent);
    expect(texts).toEqual(["+2"]);
    const goals = chart.marks()[0]!;
    expect(goals.gaps).toHaveLength(1);
    const at = Number(chart.element.querySelector('.ec-overlay > .ec-run[data-key="goals"] text')!.getAttribute("x"));
    expect(at).toBeGreaterThan(goals.end.x);
  });

  it("works on a time axis: a gap where a day is missing, samples with Dates and gapBefore", () => {
    interface Day {
      date: Date;
      visits: number | null;
      average: number | null;
    }
    const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));
    const days: Day[] = [0, 1, 2, 3, 4].map((n) => ({ date: day(n), visits: n === 2 ? null : 10 + n, average: 11 }));
    const env = environment("off");
    const container = document.body.appendChild(document.createElement("div"));
    const seen: { at?: unknown; gapBefore?: boolean }[][] = [];
    const recorder = { kind: "data" as const, run: async () => {}, end: (_mark: MarkGeometry, data: { samples: readonly { at?: unknown; gapBefore?: boolean }[] }) => void seen.push([...data.samples]), clear: () => {} };
    const chart = lineChart<Day>(container, { label: "Visits", data: days, x: "date", series: ["visits", "average"], width: 640, on: { decorate: only("visits", parallel(recorder, threshold({ compareTo: "average" }))) } }, env);
    const visits = chart.marks()[0]!;
    expect(visits.gaps).toHaveLength(1);
    const samples = seen[0]!;
    expect(samples.map((s) => (s.at as Date).toISOString())).toEqual([0, 1, 3, 4].map((n) => day(n).toISOString()));
    expect(samples.map((s) => s.gapBefore === true)).toEqual([false, false, true, false]);
    // Visits are below the 11 average only on day 0, and day 1 is level: no red past day 1.
    const reds = Array.from(chart.element.querySelectorAll('.ec-overlay > .ec-run[data-key="visits"] path.ec-path'), (path) => path.getAttribute("d")!);
    expect(reds).toHaveLength(1);
    expect(drawnInGaps(visits, asDrawn(reds))).toEqual([]);
    expect(chart.element.querySelector('.ec-column[data-key="2026-01-03T00:00:00.000Z"]')!.getAttribute("aria-label")).toMatch(/: visits missing, 11 average$/);
  });

  it("links a missing week with the bars: by the values the week has, and nothing where it has none", () => {
    const env = environment();
    const bars = barChart<Week>(document.body.appendChild(document.createElement("div")), { label: "xG per matchweek", data: weeks, x: (d) => String(d.week), y: (d) => d.xg ?? 0, orientation: "vertical", width: 400 }, env);
    const patchy = weeks.map((w) => (w.week === 6 ? { ...w, goals: null } : w));
    const line = lineChart<Week>(document.body.appendChild(document.createElement("div")), { label: "Goals vs xG", data: patchy, x: "week", series: ["goals", "xg"], width: 400 }, env);
    link([bars, line]);
    const hot = (element: Element) => Array.from(element.querySelectorAll(".ec-hot"), (el) => el.getAttribute("data-key"));
    const pointer = (type: string, target: Element) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
    // Week 3 has xG but no goals: the line hovers it, and the bars hover week 3 by xG's x.
    pointer("pointerover", line.element.querySelector('.ec-column[data-key="3"]')!);
    expect(hot(line.element)).toEqual(["xg@3"]);
    expect(hot(bars.element)).toEqual(["3"]);
    // From the bars, the line hovers the week's one point.
    pointer("pointerleave", line.element);
    pointer("pointerover", bars.element.querySelector('.ec-mark[data-key="3"] .ec-segment')!);
    expect(hot(line.element)).toEqual(["xg@3"]);
    pointer("pointerleave", bars.element);
    // Week 6 has neither: the line's crosshair stops there, but it has no mark to link by.
    pointer("pointerover", line.element.querySelector('.ec-column[data-key="6"]')!);
    expect(line.element.querySelector(".ec-crosshair")!.getAttribute("visibility")).toBeNull();
    expect(hot(bars.element)).toEqual([]);
  });
});
