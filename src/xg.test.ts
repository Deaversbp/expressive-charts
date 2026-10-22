// The prototype's card 2, end to end on lineChart: goals against expected goals over a season, with
// one decoration, `only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball",
// { ride: "on" })))`, followed through a reveal from week 1 to week 38 as playback would drive it. The
// goals line is red wherever it's below xG, and the ball rides its leading edge, with no change to
// travel. With motion off, both show at once.

import { lineChart, type ChartEnv } from "./charts";
import { transformAttribute } from "./charts/render/svg";
import { createMotion, manualClock, type MarkGeometry, type MotionMode } from "./core";
import { flush, testContext } from "./core/testing";
import { only, parallel, threshold, travel } from "./effects";
import { soccerBall } from "./icons/sport";
import { presetRegistry } from "./registries";

interface Week {
  week: number;
  goals: number;
  xg: number;
}

/** The prototype's season: seed 42, 38 matchweeks, cumulative goals and xG (a slow start, a hot streak, a late slump). */
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

function setup(mode: MotionMode = "presentation") {
  const container = document.body.appendChild(document.createElement("div"));
  const clock = manualClock();
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  const env: ChartEnv = { presets: presetRegistry, icons: { get: (name) => (name === soccerBall.name ? soccerBall : undefined) }, motion, clock };
  const chart = lineChart<Week>(container, { label: "Goals vs expected goals, season to date", data: weeks, x: "week", series: ["goals", "xg"], width: 640, on: { decorate: story() } }, env);
  const run = () => chart.element.querySelector('.ec-overlay > .ec-run[data-key="goals"]');
  /** The red runs drawn on the goals line, each as its first and last x. */
  const runs = (): [number, number][] =>
    Array.from(run()?.querySelectorAll(":scope > path.ec-path") ?? [], (path) => {
      const xs = (path.getAttribute("d")!.match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((pair) => Number(pair.split(",")[0]));
      return [xs[0]!, xs[xs.length - 1]!];
    });
  const ball = () => run()?.querySelector('.ec-icon[data-icon="soccer-ball"]')?.getAttribute("transform") ?? undefined;
  const line = () => chart.marks()[0]!;
  // Each week's px, read while every week shows, to place the expected crossings.
  const xs = weeks.map((w) => chart.marks().find((mark) => mark.key === `goals@${w.week}`)!.center.x);
  const px = (week: number) => {
    const i = Math.min(weeks.length - 2, Math.floor(week) - 1);
    return xs[i]! + (week - (i + 1)) * (xs[i + 1]! - xs[i]!);
  };
  return { chart, clock, runs, ball, line, xs, px };
}

/**
 * Where goals are below xG up to `through`, as [from, to] weeks: worked out from the data alone,
 * crossing where the difference reaches 0 between two weeks (both lines are straight there).
 */
function below(through: number): [number, number][] {
  const points = weeks.filter((w) => w.week <= through).map((w) => ({ at: w.week, gap: w.xg - w.goals }));
  const last = points[points.length - 1]!;
  const next = weeks.find((w) => w.week > through);
  if (next && through > last.at) {
    const share = (through - last.at) / (next.week - last.at);
    points.push({ at: through, gap: last.gap + share * (next.xg - next.goals - last.gap) });
  }
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

describe("goals vs xG on lineChart", () => {
  it("is the prototype's season: goals behind xG early, ahead in the hot streak", () => {
    expect(weeks).toHaveLength(38);
    expect(below(38).length).toBeGreaterThan(1);
    expect(below(12)[0]![0]).toBe(1);
  });

  it("colours the goals line red below xG and rides the ball on its leading edge, through every step of a reveal", async () => {
    const { chart, clock, runs, ball, line, px } = setup();
    // The page loads with the season drawn and the ball rolling out along it, to the end.
    const full = line();
    expect(ball()).not.toBe(restingBall(full));
    for (let t = 0; t < 4000; t += 16) clock.advance(16);
    await flush();
    expect(ball()).toBe(restingBall(full));
    expect(runs()).toHaveLength(below(38).length);
    const expected = (through: number) => below(through).map(([from, to]) => [px(from), px(to)]);

    let events = 0;
    for (const type of ["enter", "update", "exit", "hover", "leave"] as const) chart.on(type, () => events++);
    for (let week = 1; week <= 38; week += 0.5) {
      chart.reveal(week);
      const drawn = runs();
      const wanted = expected(week);
      expect(drawn.length, `week ${week}`).toBe(wanted.length);
      drawn.forEach(([from, to], i) => {
        expect(from, `week ${week}, run ${i}`).toBeCloseTo(wanted[i]![0]!, 2);
        expect(to, `week ${week}, run ${i}`).toBeCloseTo(wanted[i]![1]!, 2);
      });
      // A line too short to carry the ball (week 1 is a single point) shows none.
      expect(ball(), `week ${week}`).toBe(restingBall(line()));
    }
    expect(ball()).toBeDefined();
    expect(line().end.x).toBeCloseTo(full.end.x, 6);
    // A view, not a data change: no events.
    expect(events).toBe(0);
  });

  it("follows a reveal back down the season, as a scrubber would", () => {
    const { chart, runs, ball, line, px } = setup("off");
    chart.reveal(30);
    chart.reveal(10.25);
    expect(runs().map(([from, to]) => [Math.round(from), Math.round(to)])).toEqual(below(10.25).map(([from, to]) => [Math.round(px(from)), Math.round(px(to))]));
    expect(line().end.x).toBeCloseTo(px(10.25), 6);
    expect(ball()).toBe(restingBall(line()));
  });

  it("shows the red runs and the ball at once with motion off", () => {
    const { chart, clock, runs, ball, line } = setup("off");
    chart.reveal(20);
    expect(clock.idle).toBe(true);
    expect(runs().length).toBe(below(20).length);
    expect(ball()).toBeDefined();
    expect(ball()).toBe(restingBall(line()));
  });
});
