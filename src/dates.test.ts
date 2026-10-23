// Effects on a line chart with Dates on x: threshold matches the reference series by Date, and the
// built-in effects pass the conformance checks on a dated line's marks. This test brings charts and
// effects together, so it lives beside src/index.ts, as conformance.test.ts does.

import { flash, lineChart, only, pulse, threshold, travel, wiggle, type AnyMarkEffect, type MarkData, type MarkGeometry } from "./index";
import { soccerBall } from "./icons/sport";
import { checkEffect, testContext } from "./testing";

interface Day {
  date: Date;
  goals: number;
  xg: number;
}

/** Midnight UTC on the nth of March 2026. */
const day = (n: number): Date => new Date(Date.UTC(2026, 2, n));

/** Days unevenly apart: goals below xG, above it, below and above again. */
const days: Day[] = [
  { date: day(1), goals: 0, xg: 1 },
  { date: day(2), goals: 3, xg: 2 },
  { date: day(4), goals: 4, xg: 6 },
  { date: day(8), goals: 9, xg: 7 }
];

/**
 * A dated line chart's marks (the lines, then the points by day), each with the data its enter event
 * gave it: drawn from no data and updated to the days, with motion off so it lands at once. Narrower
 * and shorter when moved, so every point moves too.
 */
function daySource(moved = false, on: { decorate?: AnyMarkEffect } = {}) {
  const container = document.body.appendChild(document.createElement("div"));
  const chart = lineChart<Day>(container, { label: "Goals vs xG by day", data: [], x: "date", series: ["goals", "xg"], width: moved ? 480 : 640, height: moved ? 240 : 300, motion: "off", on });
  const data = new Map<MarkGeometry, MarkData<Day>>();
  chart.on("enter", (event) => data.set(event.mark, event.data));
  void chart.update({ data: days });
  return { chart, marks: chart.marks(), data };
}

/** The first and last x of an SVG path's points. */
function ends(d: string): [number, number] {
  const xs = (d.match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((pair) => Number(pair.split(",")[0]));
  return [xs[0]!, xs[xs.length - 1]!];
}

/** The data without any `at`, its related series' too: what threshold would have to match by `t`. */
function withoutAt(data: MarkData<Day>): MarkData<Day> {
  const related = (series: string): MarkData<Day> | undefined => {
    const other = data.related(series);
    return other && withoutAt(other);
  };
  return { ...data, samples: data.samples.map(({ t, value }) => ({ t, value })), related };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("threshold on a dated line", () => {
  it("matches the reference series by Date, crossing exactly where the data does", () => {
    const { chart, marks, data } = daySource(false, { decorate: only("goals", threshold({ compareTo: "xg" })) });
    const goals = marks[0]!;
    // Each sample's at is the row's Date, on the goals line and on xG.
    expect(data.get(goals)!.samples.map((s) => (s.at as Date).toISOString())).toEqual(days.map((d) => d.date.toISOString()));
    expect(data.get(goals)!.related("xg")!.samples.every((s) => s.at instanceof Date)).toBe(true);

    // px along x for a day of March, from the points' centres: linear in time.
    const first = marks.find((mark) => mark.key === `goals@${day(1).toISOString()}`)!.center.x;
    const last = marks.find((mark) => mark.key === `goals@${day(8).toISOString()}`)!.center.x;
    const px = (n: number) => first + ((n - 1) / 7) * (last - first);
    // Below from the 1st to halfway to the 2nd, then from two thirds of the way from the 2nd to the
    // 4th until halfway to the 8th.
    const runs = Array.from(chart.element.querySelectorAll('.ec-overlay > .ec-run[data-key="goals"] > path.ec-path'), (path) => ends(path.getAttribute("d")!));
    expect(runs).toHaveLength(2);
    const expected = [
      [px(1), px(1.5)],
      [px(2 + 2 / 3), px(6)]
    ];
    runs.forEach(([from, to], i) => {
      expect(from).toBeCloseTo(expected[i]![0]!, 1);
      expect(to).toBeCloseTo(expected[i]![1]!, 1);
    });

    // Not vacuously: by t, along two walks of different lengths, the first crossing would be elsewhere.
    const ctx = testContext();
    threshold({ compareTo: "xg" }).end(goals, withoutAt(data.get(goals)!), ctx);
    const [byT] = ctx.layer.drawn.flatMap((drawn) => (drawn.kind === "path" ? [ends(drawn.d)] : []));
    expect(Math.abs(byT![1] - px(1.5))).toBeGreaterThan(2);
  });
});

describe("effects on a dated line's marks", () => {
  const effects: Record<string, AnyMarkEffect> = { "ball rolling": travel(soccerBall), flash: flash(), wiggle: wiggle(), pulse: pulse() };

  it("finds a line per series, then each series' point at each day, keyed by ISO string", () => {
    const { marks, data } = daySource();
    expect(marks.map((mark) => mark.key)).toEqual(["goals", "xg", ...days.flatMap((d) => [`goals@${d.date.toISOString()}`, `xg@${d.date.toISOString()}`])]);
    for (const mark of marks) expect(data.has(mark), mark.key).toBe(true);
  });

  it("threshold below xG passes the conformance checks on every line and point, with the chart's data", async () => {
    const { marks, data } = daySource();
    const twins = daySource(true);
    const all = new Map([...data, ...twins.data]);
    const moved = (mark: MarkGeometry) => twins.marks.find((twin) => twin.key === mark.key);
    await checkEffect(threshold({ compareTo: "xg" }), { name: "threshold below xG", marks, moved, data: (mark) => all.get(mark)! });
  });

  it.each(Object.keys(effects))("%s passes the conformance checks on every mark", async (name) => {
    const twins = daySource(true).marks;
    const moved = (mark: MarkGeometry) => twins.find((twin) => twin.key === mark.key);
    await checkEffect(effects[name]!, { name, marks: daySource().marks, moved });
  });
});
