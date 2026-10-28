// The prototype's card 2 on a curved lineChart (`curve: "monotone"`): goals against xG over the line
// page's season, with `threshold` changing colour exactly where the drawn lines cross, the ball riding
// the curve, through a reveal and with motion off; and `delta` and `label` on curved lines, which read
// rows at their ends. This test brings charts and effects together, so it lives beside src/index.ts,
// the only module allowed to.

import { lineChart, type ChartEnv } from "./charts";
import { transformAttribute } from "./charts/render/svg";
import { createMotion, manualClock, type MarkData, type MarkGeometry, type MotionMode, type Sample } from "./core";
import { flush, play, testContext } from "./core/testing";
import { delta, label, only, parallel, threshold, travel } from "./effects";
import { soccerBall } from "./icons/sport";
import { presetRegistry } from "./registries";

interface Week {
  week: number;
  goals: number;
  xg: number;
}

/** The prototype's season, as the line page draws it: seed 42, 38 matchweeks, cumulative goals and xG. */
function season(): Week[] {
  let seed = 42;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const poisson = (lambda: number) => {
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

const weeks = season();
const story = () => only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on" })));

function env(mode: MotionMode): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: { get: (name) => (name === soccerBall.name ? soccerBall : undefined) }, motion, clock: manualClock() };
}

function setup(mode: MotionMode = "presentation") {
  const container = document.body.appendChild(document.createElement("div"));
  const environment = env(mode);
  // The lines' samples, as a decoration gets them.
  const latest = new Map<string, MarkData<Week>>();
  const recorder = {
    kind: "data" as const,
    run(mark: MarkGeometry, data: MarkData<Week>, ctx: { onChange(listener: (mark: MarkGeometry, data?: MarkData) => void): void }) {
      latest.set(mark.key, data);
      ctx.onChange((moved, next) => {
        if (next) latest.set(moved.key, next as MarkData<Week>);
      });
      return Promise.resolve();
    },
    end(mark: MarkGeometry, data: MarkData<Week>, ctx: { onChange(listener: (mark: MarkGeometry, data?: MarkData) => void): void }) {
      latest.set(mark.key, data);
      ctx.onChange((moved, next) => {
        if (next) latest.set(moved.key, next as MarkData<Week>);
      });
    },
    clear() {}
  };
  const chart = lineChart<Week>(
    container,
    { label: "Goals vs expected goals, season to date", data: weeks, x: "week", series: ["goals", "xg"], width: 640, curve: "monotone", on: { decorate: parallel(story(), recorder) } },
    environment
  );
  const run = () => chart.element.querySelector('.ec-overlay > .ec-run[data-key="goals"]');
  /** The red runs drawn on the goals line, each as its first and last x. */
  const runs = (): [number, number][] =>
    Array.from(run()?.querySelectorAll(":scope > .ec-follow > path.ec-path") ?? [], (path) => {
      const xs = (path.getAttribute("d")!.match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((pair) => Number(pair.split(",")[0]));
      return [xs[0]!, xs[xs.length - 1]!];
    });
  const ball = () => run()?.querySelector('.ec-icon[data-icon="soccer-ball"]')?.getAttribute("transform") ?? undefined;
  const mark = (key: string) => chart.marks().find((m) => m.key === key)!;
  // Week 1's and week 38's px, read while every week shows, for the x scale.
  const [first, last] = [mark("goals@1").center.x, mark("goals@38").center.x];
  const px = (at: number) => first + ((at - 1) / 37) * (last - first);
  return { chart, clock: environment.clock, runs, ball, mark, latest, px };
}

/** A line's value at `at`, straight between its samples: the line as drawn, in data units. */
function along(samples: readonly Sample[], at: number): number {
  const i = samples.findIndex((s) => (s.at as number) >= at);
  const b = samples[i]!;
  if ((b.at as number) === at || i === 0) return b.value;
  const a = samples[i - 1]!;
  return a.value + ((at - (a.at as number)) / ((b.at as number) - (a.at as number))) * (b.value - a.value);
}

/**
 * Where the drawn goals line is below the drawn xG line, as [from, to] in weeks: both are straight
 * between their vertices, so the difference is straight between each vertex of either, and each
 * crossing is where it reaches 0.
 */
function below(goals: readonly Sample[], xg: readonly Sample[]): [number, number][] {
  const end = Math.min(goals[goals.length - 1]!.at as number, xg[xg.length - 1]!.at as number);
  const ats = [...new Set([...goals, ...xg].map((s) => s.at as number))].filter((at) => at <= end).sort((a, b) => a - b);
  const points = ats.map((at) => ({ at, gap: along(xg, at) - along(goals, at) }));
  const parts: [number, number][] = [];
  const add = (from: number, to: number) => {
    const previous = parts[parts.length - 1];
    if (!(to > from)) return;
    if (previous && previous[1] >= from) previous[1] = to;
    else parts.push([from, to]);
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const crossing = a.at + (b.at - a.at) * (a.gap / (a.gap - b.gap));
    if (a.gap > 0 && b.gap > 0) add(a.at, b.at);
    else if (a.gap > 0) add(a.at, crossing);
    else if (b.gap > 0) add(crossing, b.at);
  }
  return parts;
}

/** Where the ball rests on a line: travel's own end state, as the chart writes it. */
function restingBall(line: MarkGeometry): string | undefined {
  const ctx = testContext({ icons: [soccerBall] });
  travel("soccer-ball", { ride: "on" }).end(line, ctx);
  const [icon] = ctx.layer.drawn.filter((drawn) => drawn.kind === "icon");
  return icon?.kind === "icon" && icon.transform ? transformAttribute(icon.transform) : undefined;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("goals vs xG on a curved lineChart", () => {
  it("colours the goals line red exactly where it's drawn below xG, and rides the ball on the curve, through every step of a reveal", async () => {
    const { chart, clock, runs, ball, mark, latest, px } = setup();
    for (let t = 0; t < 4000; t += 16) clock.advance(16);
    await flush();
    const full = mark("goals");
    expect(ball()).toBe(restingBall(full));
    // Not vacuously: the lines cross more than once, between rows.
    const crossings = below(latest.get("goals")!.samples, latest.get("xg")!.samples);
    expect(crossings.length).toBeGreaterThan(1);
    expect(crossings.some(([from, to]) => !Number.isInteger(from) || !Number.isInteger(to))).toBe(true);

    for (let week = 1; week <= 38; week += 0.5) {
      chart.reveal(week);
      const wanted = below(latest.get("goals")!.samples, latest.get("xg")!.samples).map(([from, to]) => [px(from), px(to)]);
      const drawn = runs();
      expect(drawn.length, `week ${week}`).toBe(wanted.length);
      // To the 3 decimals path data has.
      drawn.forEach(([from, to], i) => {
        expect(Math.abs(from - wanted[i]![0]!), `week ${week}, run ${i}`).toBeLessThan(0.002);
        expect(Math.abs(to - wanted[i]![1]!), `week ${week}, run ${i}`).toBeLessThan(0.002);
      });
      expect(ball(), `week ${week}`).toBe(restingBall(mark("goals")));
    }
    expect(mark("goals").end).toEqual(full.end);
  });

  it("shows the red runs and the ball at once with motion off, revealed part way", () => {
    const { chart, clock, runs, ball, mark, latest } = setup("off");
    chart.reveal(20.4);
    expect(clock.idle).toBe(true);
    expect(runs()).toHaveLength(below(latest.get("goals")!.samples, latest.get("xg")!.samples).length);
    expect(ball()).toBe(restingBall(mark("goals")));
  });
});

describe("delta and label on curved lines", () => {
  it("say a line's change and its own text from its rows, which are its ends", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const environment = env("off");
    const chart = lineChart<Week>(
      container,
      {
        label: "Goals vs xG",
        data: weeks.slice(0, 24),
        x: "week",
        series: ["goals", "xg"],
        width: 640,
        curve: "monotone",
        on: {
          update: only("goals", delta()),
          decorate: only("xg", label<Week>((data) => `${(data.samples[data.samples.length - 1]!.value - data.samples[0]!.value).toFixed(1)} xG since week 1`))
        }
      },
      environment
    );
    const text = (key: string) => chart.element.querySelector(`.ec-run[data-key="${key}"] text.ec-text`);
    // The label reads its first and last samples: rows, though the line has bends between them.
    expect(text("xg")!.textContent).toBe(`${(weeks[23]!.xg - weeks[0]!.xg).toFixed(1)} xG since week 1`);
    await play(environment.clock, chart.update({ data: weeks.slice(0, 25) }));
    expect(text("goals")!.textContent).toBe(`+${weeks[24]!.goals - weeks[23]!.goals}`);
    // Revealed part way, a line ends on the curve: delta still says the change from the last update.
    chart.reveal(24.5);
    expect(text("goals")!.textContent).toBe(`+${weeks[24]!.goals - weeks[23]!.goals}`);
  });
});
