import {
  DOT_RADIUS,
  layoutLines,
  LINE_WIDTH,
  lineEncoding,
  loneValues,
  placeColumns,
  placeEndLabels,
  placeLines,
  placePoints,
  positions,
  spread,
  xTickValues,
  type LineFrame,
  type LineLayoutInput,
  type RowState
} from "./line-layout";
import type { LineChartOptions } from "./types";

interface Week {
  week: number;
  goals: number;
  xg: number;
}

const weeks: Week[] = [
  { week: 1, goals: 0, xg: 1.2 },
  { week: 2, goals: 2, xg: 2.1 },
  { week: 3, goals: 3, xg: 3.6 }
];

/** 7 px per character, so margins are predictable. */
const measure = (text: string): number => text.length * 7;

function layout<D>(options: Omit<LineChartOptions<D>, "label">, more: Partial<LineLayoutInput<D>> = {}) {
  const full = { label: "Test", ...options } as LineChartOptions<D>;
  return layoutLines<D>({ data: full.data, encoding: lineEncoding(full), width: 640, height: full.height, format: String, measure, label: undefined, ...more });
}

/** Each row as it rests in a layout. */
const states = <D>(rows: readonly { key: string; datum: D; x: number; values: readonly { series: string; value: number }[] }[]): RowState<D>[] =>
  rows.map((row) => ({ key: row.key, datum: row.datum, x: row.x, values: Object.fromEntries(row.values.map((v) => [v.series, v.value])) }));

/** A plot from 40 to 540 px across x 0–10, and from 288 to 12 px up the values 0–100. */
const frame: LineFrame = {
  scale: { lo: 0, hi: 100 },
  box: { xLo: 0, xHi: 10, left: 40, right: 540, top: 12, bottom: 288, width: 640, height: 320 }
};

describe("lineEncoding", () => {
  it("reads x, the key and the series", () => {
    const encoding = lineEncoding<Week>({ label: "", data: weeks, x: "week", series: ["goals", "xg"] });
    expect(encoding.series.map((s) => s.series)).toEqual(["goals", "xg"]);
    expect(encoding.x(weeks[1]!, 1)).toBe(2);
    expect(encoding.key).toBeUndefined();
  });

  it("throws on options it can't draw", () => {
    const base = { label: "", data: weeks } as const;
    expect(() => lineEncoding<Week>({ ...base, series: ["goals"] } as unknown as LineChartOptions<Week>)).toThrow(/needs x/);
    expect(() => lineEncoding<Week>({ ...base, x: "week", series: [] })).toThrow(/needs series/);
    expect(() => lineEncoding<Week>({ ...base, x: "week", series: ["goals", "goals"] })).toThrow(/"goals" appears twice/);
    expect(() => lineEncoding<Week>({ ...base, x: "week", series: [(() => 1) as unknown as "goals"] })).toThrow(/each series must be a field name/);
    expect(() => lineEncoding<Week>({ ...base, x: "week", series: ["goals"], labels: true as unknown as false })).toThrow(/labels must be false or a function/);
  });
});

describe("layoutLines", () => {
  it("draws the rows in ascending x, whatever their order in data", () => {
    const { rows } = layout<Week>({ data: [weeks[2]!, weeks[0]!, weeks[1]!], x: "week", series: ["goals"] });
    expect(rows.map((row) => row.key)).toEqual(["1", "2", "3"]);
    expect(rows.map((row) => row.index)).toEqual([1, 2, 0]);
    expect(rows[0]!.label).toBe("1");
  });

  it("keys rows by x, converted with String(), or by the page's key", () => {
    expect(layout<Week>({ data: weeks, x: "week", series: ["goals"] }).rows.map((row) => row.key)).toEqual(["1", "2", "3"]);
    expect(layout<Week>({ data: weeks, x: "week", key: (d) => `w${d.week}`, series: ["goals"] }).rows.map((row) => row.key)).toEqual(["w1", "w2", "w3"]);
  });

  it("throws on a duplicate x whatever the keys, and on a duplicate key", () => {
    const twice = [...weeks, { week: 2, goals: 5, xg: 4 }];
    expect(() => layout<Week>({ data: twice, x: "week", series: ["goals"] })).toThrow(/two rows have the key "2"/);
    expect(() => layout<Week>({ data: twice, x: "week", key: (_d, i) => i, series: ["goals"] })).toThrow(/the rows "1" and "3" have the same x, 2/);
    expect(() => layout<Week>({ data: weeks, x: "week", key: () => "same", series: ["goals"] })).toThrow(/two rows have the key "same"/);
  });

  it("throws on an x or a value that isn't a finite number, but takes a missing value", () => {
    expect(() => layout<Week>({ data: [{ week: Number.NaN, goals: 1, xg: 1 }], x: "week", series: ["goals"] })).toThrow(/x must be a finite number, got NaN in row 0/);
    expect(() => layout({ data: [{ week: "1", goals: 1 }] as unknown as Week[], x: "week", series: ["goals"] })).toThrow(/x must be a finite number, got "1"/);
    expect(() => layout({ data: [{ week: 1, xg: 1 }] as unknown as Week[], x: "week", series: ["goals"] })).not.toThrow();
    expect(() => layout({ data: [{ week: 1, goals: "2" }] as unknown as Week[], x: "week", series: ["goals"] })).toThrow(
      /"goals" for "1" must be a finite number, or null or undefined where it has no value, got "2"/
    );
    expect(() => layout<Week>({ data: [{ week: 1, goals: Number.NaN, xg: 1 }], x: "week", series: ["goals"] })).toThrow(/got NaN/);
    expect(() => layout<Week>({ data: [{ week: 1, goals: Infinity, xg: 1 }], x: "week", series: ["goals"] })).toThrow(/got Infinity/);
  });

  it("is 300 px high by default, with values from 0 to a nice maximum of all the data", () => {
    const { frame, height, yTicks } = layout<Week>({ data: weeks, x: "week", series: ["goals", "xg"] });
    expect(height).toBe(300);
    expect(frame.scale).toEqual({ lo: 0, hi: 4 });
    expect(yTicks.map((tick) => tick.value)).toEqual([0, 1, 2, 3, 4]);
    expect(frame.box).toMatchObject({ top: 12, bottom: 268, height: 300, xLo: 1, xHi: 3 });
  });

  it("starts the values at the lowest one when it's negative", () => {
    const { frame } = layout({ data: [{ x: 0, v: -3 }, { x: 1, v: 7 }], x: "x", series: ["v"] });
    expect(frame.scale.lo).toBeLessThan(0);
    expect(frame.scale.hi).toBe(10);
  });

  it("fits the value labels on the left and each line's end label on the right", () => {
    const plain = layout<Week>({ data: weeks, x: "week", series: ["goals", "xg"] });
    // "4" is 7 px wide: 7 + 8 + 2.
    expect(plain.frame.box.left).toBe(17);
    // Without end labels, the right margin leaves room for the gridlines past the last x.
    expect(plain.frame.box.right).toBe(630);
    const labelled = layout<Week>({ data: weeks, x: "week", series: ["goals", "xg"] }, { label: (series, value) => `${value} ${series}` });
    // The widest is "0 goals", "2 goals" or "3 goals": 7 characters, 49 px, after a 10 px gap, plus 4.
    expect(labelled.frame.box.right).toBe(640 - (10 + 49 + 4));
  });

  it("measures one end label of each shape, its digits aside, so a long series isn't measured row by row", () => {
    const season = Array.from({ length: 500 }, (_, i) => ({ week: i + 1, goals: i, xg: i / 10 }));
    const measured: string[] = [];
    const spy = (text: string) => {
      measured.push(text);
      return text.length * 7;
    };
    const { frame } = layout({ data: season, x: "week", series: ["goals", "xg"] }, { measure: spy, label: (series, value) => `${value} ${series}` });
    // Chart text has tabular digits, so "1 xg" is as wide as "0 xg", and "499 goals" as "100 goals".
    const labels = measured.filter((text) => / (goals|xg)$/.test(text)).sort();
    expect(labels).toEqual(["0 goals", "0 xg", "0.1 xg", "10 goals", "10 xg", "10.1 xg", "100 goals"]);
    expect(frame.box.right).toBe(640 - (10 + 9 * 7 + 4));
  });

  it("keeps `room` clear to the right of the end labels, or of the lines' ends without them, and lays out as before with none", () => {
    const options = { data: weeks, x: "week", series: ["goals", "xg"] } as const;
    const label = (series: string, value: number) => `${value} ${series}`;
    const labelled = layout<Week>(options, { label });
    const roomy = layout<Week>(options, { label, room: 30 });
    // The plot is 30 px narrower, so the end labels beside it are 30 px further from the chart's right edge.
    expect(roomy.frame.box.right).toBe(labelled.frame.box.right - 30);
    expect(roomy.frame.box.left).toBe(labelled.frame.box.left);
    // Without end labels, past the lines' ends: the gridlines' 10 px is inside it.
    expect(layout<Week>(options, { room: 30 }).frame.box.right).toBe(640 - 30);
    expect(layout<Week>(options, { room: 4 }).frame.box.right).toBe(630);
    // 0, as unset, lays out as before.
    expect(layout<Week>(options, { label, room: 0 })).toEqual(labelled);
    expect(layout<Week>(options, { room: 0 })).toEqual(layout<Week>(options));
  });

  it("gives each series the decimals its values have", () => {
    expect(layout<Week>({ data: weeks, x: "week", series: ["goals", "xg"] }).decimals).toEqual({ goals: 0, xg: 1 });
  });

  it("labels x at both ends and round steps between, dropping steps too close to an end", () => {
    const season = Array.from({ length: 38 }, (_, i) => ({ week: i + 1, goals: i, xg: i }));
    const { xTicks } = layout({ data: season, x: "week", series: ["goals"] });
    expect(xTicks.map((tick) => tick.value)).toEqual([1, 10, 20, 30, 38]);
    expect(xTicks[0]!.label).toMatchObject({ anchor: "middle", text: "1", y: 268 + 18 });
    const narrow = layout({ data: season, x: "week", series: ["goals"] }, { width: 60 });
    expect(narrow.xTicks.map((tick) => tick.value)).toEqual([1, 38]);
  });

  it("has no rows, no ticks on x and a plot from 0 to 1 with no data", () => {
    const empty = layout<Week>({ data: [], x: "week", series: ["goals"] });
    expect(empty.rows).toEqual([]);
    expect(empty.xTicks).toEqual([]);
    expect(empty.frame.scale).toEqual({ lo: 0, hi: 1 });
  });
});

describe("xTickValues", () => {
  it("gives both ends and the round steps strictly between them", () => {
    expect(xTickValues(1, 38)).toEqual([1, 10, 20, 30, 38]);
    expect(xTickValues(0, 1)).toEqual([0, 0.5, 1]);
    expect(xTickValues(2020, 2024)).toEqual([2020, 2021, 2022, 2023, 2024]);
    expect(xTickValues(5, 5)).toEqual([5]);
  });
});

describe("positions", () => {
  it("maps data to px, a single x to the plot's middle", () => {
    const at = positions(frame);
    expect(at.x(0)).toBe(40);
    expect(at.x(10)).toBe(540);
    expect(at.y(0)).toBe(288);
    expect(at.y(100)).toBe(12);
    expect(positions({ ...frame, box: { ...frame.box, xLo: 3, xHi: 3 } }).x(3)).toBe(290);
  });
});

describe("placeLines", () => {
  const rows = states([
    { key: "a", datum: "A", x: 0, values: [{ series: "goals", value: 0 }, { series: "xg", value: 50 }] },
    { key: "b", datum: "B", x: 4, values: [{ series: "goals", value: 50 }, { series: "xg", value: 50 }] },
    { key: "c", datum: "C", x: 10, values: [{ series: "goals", value: 100 }, { series: "xg", value: 0 }] }
  ]);

  it("draws each series through every row, 2.25 px wide, keyed by its series", () => {
    const [goals, xg] = placeLines(frame, rows, ["goals", "xg"], Infinity);
    expect(goals!.geometry).toMatchObject({ key: "goals", series: "goals", thickness: LINE_WIDTH });
    expect(goals!.geometry.outline.d).toBe("M40,288L240,150L540,12");
    expect(xg!.geometry.outline.d).toBe("M40,150L240,150L540,288");
    expect(goals!.end).toEqual({ x: 540, y: 12, value: 100 });
  });

  it("gives a line the row at its end, a sample per vertex by distance with its x, and the other line as related", () => {
    const [goals, xg] = placeLines(frame, rows, ["goals", "xg"], Infinity);
    const { data, geometry } = goals!;
    expect(data.datum).toBe("C");
    expect(data.samples.map((s) => [s.value, s.at])).toEqual([
      [0, 0],
      [50, 4],
      [100, 10]
    ]);
    expect(data.samples[0]!.t).toBe(0);
    expect(data.samples[1]!.t).toBeCloseTo(Math.hypot(200, 138) / geometry.length, 12);
    expect(data.samples[2]!.t).toBe(1);
    expect(data.related("xg")).toBe(xg!.data);
    expect(xg!.data.related("goals")).toBe(data);
    expect(data.related("goals")).toBeUndefined();
    expect(data.related("assists")).toBeUndefined();
  });

  it("ends at a reveal between rows, part way to the next, with that point as its last sample", () => {
    const [goals] = placeLines(frame, rows, ["goals"], 7);
    expect(goals!.geometry.outline.d).toBe("M40,288L240,150L390,81");
    expect(goals!.end).toEqual({ x: 390, y: 81, value: 75 });
    expect(goals!.data.datum).toBe("B");
    expect(goals!.data.samples.map((s) => [s.value, s.at])).toEqual([
      [0, 0],
      [50, 4],
      [75, 7]
    ]);
    expect(goals!.data.samples[2]!.t).toBe(1);
  });

  it("ends on a row when the reveal is exactly there, and is the first point alone before it", () => {
    expect(placeLines(frame, rows, ["goals"], 4)[0]!.geometry.outline.d).toBe("M40,288L240,150");
    const first = placeLines(frame, rows, ["goals"], -1)[0]!;
    expect(first.geometry.length).toBe(0);
    expect(first.data.samples).toEqual([{ t: 0, value: 0, at: 0 }]);
    expect(first.data.datum).toBe("A");
  });

  it("draws nothing without rows", () => {
    expect(placeLines(frame, [], ["goals"], Infinity)).toEqual([]);
  });
});

describe("placePoints", () => {
  it("gives each series a dot at the row, keyed <series>@<row>, with its value and the other point as related", () => {
    const row: RowState<string> = { key: "12", datum: "W12", x: 4, values: { goals: 50, xg: 25 } };
    const [goals, xg] = placePoints(frame, row, ["goals", "xg"]);
    expect(goals!.key).toBe("goals@12");
    expect(goals!.geometry).toMatchObject({ key: "goals@12", series: "goals", length: 0, thickness: 2 * DOT_RADIUS, center: { x: 240, y: 150 } });
    expect(goals!.data.datum).toBe("W12");
    expect(goals!.data.samples).toEqual([{ t: 0, value: 50, at: 4 }]);
    expect(goals!.data.related("xg")).toBe(xg!.data);
    expect(goals!.data.related("goals")).toBeUndefined();
  });
});

describe("placeColumns", () => {
  it("reaches halfway to each neighbour, the ends to the chart's edges", () => {
    expect(placeColumns(frame, [40, 240, 540])).toEqual([
      { x: 0, y: 0, width: 140, height: 320 },
      { x: 140, y: 0, width: 250, height: 320 },
      { x: 390, y: 0, width: 250, height: 320 }
    ]);
    expect(placeColumns(frame, [40])).toEqual([{ x: 0, y: 0, width: 640, height: 320 }]);
  });
});

describe("end labels", () => {
  it("spreads values closer than the gap equally around their middle, keeping the order", () => {
    expect(spread([100, 110], 16, 0, 300)).toEqual([97, 113]);
    expect(spread([110, 100], 16, 0, 300)).toEqual([113, 97]);
    expect(spread([50, 200], 16, 0, 300)).toEqual([50, 200]);
    // Three in a cluster, then a fourth pulled in once the cluster grows.
    expect(spread([100, 100, 100, 120], 16, 0, 300)).toEqual([81, 97, 113, 129]);
  });

  it("keeps them inside the bounds where there's room", () => {
    expect(spread([2, 4], 16, 6, 300)).toEqual([6, 22]);
    expect(spread([299, 295], 16, 0, 300)).toEqual([300, 284]);
  });

  it("puts each label 10 px past its end, centred on its line", () => {
    const [a, b] = placeEndLabels(frame, [
      { x: 540, y: 100, text: "52 goals" },
      { x: 540, y: 200, text: "48 xG" }
    ]);
    expect(a).toEqual({ x: 550, y: 100 + 12.5 * 0.36, anchor: "start", text: "52 goals" });
    expect(b!.y).toBeCloseTo(200 + 12.5 * 0.36, 9);
  });
});

describe("a time axis", () => {
  interface Day {
    date: Date;
    goals: number;
    xg: number;
  }

  /** Midnight UTC on the nth day from 5 January 2026, or another hour. */
  const day = (n: number, hour = 0): Date => new Date(Date.UTC(2026, 0, 5 + n, hour));
  const days: Day[] = [2, 0, 4, 1, 3].map((n) => ({ date: day(n), goals: n, xg: n + 0.5 }));
  const RealDateTimeFormat = Intl.DateTimeFormat;

  beforeEach(() => {
    // The page's locale is en-US.
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
      return new RealDateTimeFormat(locales ?? "en-US", options);
    } as unknown as typeof Intl.DateTimeFormat);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("comes from Dates: rows in ascending time, keyed by ISO string, each x its time in ms", () => {
    const { rows, time } = layout<Day>({ data: days, x: "date", series: ["goals"] });
    expect(time).toBe(true);
    expect(rows.map((row) => row.key)).toEqual([0, 1, 2, 3, 4].map((n) => day(n).toISOString()));
    expect(rows[0]!.key).toBe("2026-01-05T00:00:00.000Z");
    expect(rows.map((row) => row.x)).toEqual([0, 1, 2, 3, 4].map((n) => day(n).getTime()));
    expect(rows.map((row) => row.index)).toEqual([1, 3, 0, 4, 2]);
    // The page's key still wins, and numbers stay a number axis.
    expect(layout<Day>({ data: days, x: "date", key: (d) => `d${d.goals}`, series: ["goals"] }).rows.map((row) => row.key)).toEqual(["d0", "d1", "d2", "d3", "d4"]);
    expect(layout<Week>({ data: weeks, x: "week", series: ["goals"] }).time).toBe(false);
  });

  it("says each x as a medium date, with the time when any has one, and labels the days on the axis", () => {
    const { rows, xTicks } = layout<Day>({ data: days, x: "date", series: ["goals"] });
    expect(rows.map((row) => row.label)).toEqual(["Jan 5, 2026", "Jan 6, 2026", "Jan 7, 2026", "Jan 8, 2026", "Jan 9, 2026"]);
    expect(xTicks.map((tick) => [tick.value, tick.label.text])).toEqual([0, 1, 2, 3, 4].map((n) => [day(n).getTime(), `Jan ${5 + n}`]));
    const timed = layout<Day>({ data: [...days, { date: day(4, 13), goals: 5, xg: 5 }], x: "date", series: ["goals"] });
    expect(timed.rows.map((row) => row.label.replace(/\u202f/g, " ")).slice(-2)).toEqual(["Jan 9, 2026, 12:00 AM", "Jan 9, 2026, 1:00 PM"]);
  });

  it("words x with xFormat, given a Date or a number, and leaves the ticks alone", () => {
    const dated = layout<Day>({ data: days, x: "date", series: ["goals"], xFormat: (x) => `Day ${(x as Date).getUTCDate()}` });
    expect(dated.rows.map((row) => row.label)).toEqual(["Day 5", "Day 6", "Day 7", "Day 8", "Day 9"]);
    expect(dated.xTicks[0]!.label.text).toBe("Jan 5");
    const numbered = layout<Week>({ data: weeks, x: "week", series: ["goals"], xFormat: (x) => `Week ${String(x)}` });
    expect(numbered.rows.map((row) => row.label)).toEqual(["Week 1", "Week 2", "Week 3"]);
    expect(numbered.xTicks.map((tick) => tick.label.text)).toEqual(["1", "1.5", "2", "2.5", "3"]);
  });

  it("throws on numbers mixed with Dates, an invalid Date, two rows at one time, or options it can't take", () => {
    const at = (...xs: unknown[]) => () => layout({ data: xs.map((date, i) => ({ date, goals: i })) as unknown as Day[], x: "date", series: ["goals"] });
    expect(at(day(0), 3)).toThrow(new TypeError("lineChart: x must be all numbers or all Dates, but row 0's is a Date and row 1's a number."));
    expect(at(3, day(0))).toThrow(new TypeError("lineChart: x must be all numbers or all Dates, but row 0's is a number and row 1's a Date."));
    expect(at(day(0), new Date("not a date"))).toThrow(new TypeError("lineChart: x must be a valid Date, got an invalid Date in row 1."));
    expect(at(new Date(Number.NaN))).toThrow(/x must be a valid Date, got an invalid Date in row 0/);
    expect(at(day(0), "2026-01-06")).toThrow(new TypeError('lineChart: x must be a valid Date, got "2026-01-06" in row 1.'));
    const twice = () => layout<Day>({ data: [days[0]!, { ...days[0]!, date: new Date(days[0]!.date) }], x: "date", key: (_d, i) => i, series: ["goals"] });
    expect(twice).toThrow(/the rows "0" and "1" have the same x, 2026-01-07T00:00:00.000Z/);
    const options = { label: "", data: days, x: "date", series: ["goals"] } as const;
    expect(() => lineEncoding<Day>({ ...options, timeZone: "Europe/London" as "UTC" })).toThrow(new TypeError('lineChart: timeZone must be "UTC" or "local", got "Europe/London".'));
    expect(() => lineEncoding<Day>({ ...options, xFormat: "short" as unknown as () => string })).toThrow(/xFormat must be a function/);
    expect(lineEncoding<Day>(options).timeZone).toBe("UTC");
  });

  it("gives each sample its own Date on a time axis", () => {
    const rows = states([
      { key: "a", datum: "A", x: day(0).getTime(), values: [{ series: "goals", value: 0 }] },
      { key: "b", datum: "B", x: day(2).getTime(), values: [{ series: "goals", value: 50 }] }
    ]);
    const box = { ...frame.box, xLo: day(0).getTime(), xHi: day(2).getTime() };
    const [goals] = placeLines({ ...frame, box }, rows, ["goals"], day(1).getTime(), true);
    const ats = goals!.data.samples.map((s) => s.at);
    expect(ats.every((at) => at instanceof Date)).toBe(true);
    expect(ats.map((at) => (at as Date).toISOString())).toEqual([day(0).toISOString(), day(1).toISOString()]);
    const [point] = placePoints({ ...frame, box }, rows[1]!, ["goals"], true);
    expect(point!.data.samples[0]!.at).toEqual(day(2));
    expect(placePoints({ ...frame, box }, rows[1]!, ["goals"], true)[0]!.data.samples[0]!.at).not.toBe(point!.data.samples[0]!.at);
  });
});

describe("missing values", () => {
  interface Gappy {
    week: number;
    goals: number | null;
  }
  /** At x 0, 4, 6 and 10: goals 0, missing, 60 and 100. */
  const gappy: Gappy[] = [
    { week: 0, goals: 0 },
    { week: 4, goals: null },
    { week: 6, goals: 60 },
    { week: 10, goals: 100 }
  ];
  const rest = <D>(rows: readonly { key: string; datum: D; x: number; levels: Readonly<Record<string, number>>; missing: ReadonlySet<string> }[]): RowState<D>[] =>
    rows.map((row) => ({ key: row.key, datum: row.datum, x: row.x, values: row.levels, missing: row.missing }));

  it("lays a missing value out as undefined, with its level where its line runs past, and leaves it out of the scale", () => {
    const { rows, frame: laid, decimals } = layout<Gappy>({ data: gappy, x: "week", series: ["goals"] });
    expect(rows.map((row) => row.values[0]!.value)).toEqual([0, undefined, 60, 100]);
    expect(rows.map((row) => [...row.missing])).toEqual([[], ["goals"], [], []]);
    // Across the gap from x 0 to 6, in proportion to x.
    expect(rows[1]!.levels).toEqual({ goals: 40 });
    expect(laid.scale).toEqual({ lo: 0, hi: 100 });
    expect(decimals).toEqual({ goals: 0 });
    // Before a line's first value and after its last, level with it; with no values, 0.
    const ends = layout<Gappy>({ data: [{ week: 0, goals: null }, { week: 1, goals: 5 }, { week: 2, goals: null }], x: "week", series: ["goals"] }).rows;
    expect(ends.map((row) => row.levels.goals)).toEqual([5, 5, 5]);
    const none = layout<Gappy>({ data: [{ week: 0, goals: null }, { week: 1, goals: null }], x: "week", series: ["goals"] });
    expect(none.rows.map((row) => row.levels.goals)).toEqual([0, 0]);
    expect(none.frame.scale).toEqual({ lo: 0, hi: 1 });
  });

  it("finds the levels of a long run of missing values in one pass", () => {
    // 50,000 weeks: no goals at all, and xG only at the first and last, with one gap between.
    const long = Array.from({ length: 50_000 }, (_, week) => ({ week, goals: null, xg: week === 0 ? 0 : week === 49_999 ? 49_999 : null }));
    const started = performance.now();
    const { rows } = layout<{ week: number; goals: null; xg: number | null }>({ data: long, x: "week", series: ["goals", "xg"] });
    // Scanning each run again for every row in it took seconds here.
    expect(performance.now() - started).toBeLessThan(1000);
    expect(rows[25_000]!.levels).toEqual({ goals: 0, xg: 25_000 });
    expect(rows[49_999]!.levels).toEqual({ goals: 0, xg: 49_999 });
  });

  it("breaks a line at a missing value: a gap from the value before to the value after, gapBefore on the sample after it", () => {
    const { rows } = layout<Gappy>({ data: gappy, x: "week", series: ["goals"] });
    const [goals] = placeLines(frame, rest(rows), ["goals"], Infinity);
    // The first value is alone, so it has no stroke: the stroke starts where the gap ends.
    expect(goals!.geometry.outline.d).toBe("M340,122.4L540,12");
    expect(goals!.geometry.gaps).toEqual([[0, expect.closeTo(Math.hypot(300, 165.6) / goals!.geometry.length, 12)]]);
    expect(goals!.data.samples.map((s) => [s.at, s.value, s.gapBefore === true])).toEqual([
      [0, 0, false],
      [6, 60, true],
      [10, 100, false]
    ]);
    expect(goals!.data.samples[1]!.t).toBe(goals!.geometry.gaps![0]![1]);
  });

  it("ends a line revealed into a gap at its last value, and goes on part way past it", () => {
    const { rows } = layout<Gappy>({ data: gappy, x: "week", series: ["goals"] });
    const into = placeLines(frame, rest(rows), ["goals"], 5)[0]!;
    expect(into.geometry.length).toBe(0);
    expect(into.end).toEqual({ x: 40, y: 288, value: 0 });
    expect(into.data.datum).toBe(gappy[0]);
    const past = placeLines(frame, rest(rows), ["goals"], 8)[0]!;
    expect(past.data.samples.map((s) => s.at)).toEqual([0, 6, 8]);
    expect(past.end.value).toBe(80);
    expect(past.data.datum).toBe(gappy[2]);
  });

  it("is empty with no value up to the reveal: no samples, at its level, the row at the reveal its datum, and its label empty", () => {
    const missingFirst = layout<Gappy>({ data: [{ week: 0, goals: null }, ...gappy.slice(2)], x: "week", series: ["goals"] }).rows;
    const labels = { text: (series: string, value: number) => `${value} ${series}`, measure };
    const [empty] = placeLines(frame, rest(missingFirst), ["goals"], 0, false, labels);
    expect(empty!.data.samples).toEqual([]);
    expect(empty!.geometry.length).toBe(0);
    expect(empty!.geometry.start).toEqual({ x: 40, y: positions(frame).y(60) });
    expect(empty!.label?.text).toBe("");
    expect(empty!.geometry.labelBounds).toEqual([]);
  });

  it("places an empty line's label nowhere, so the others' aren't pushed aside", () => {
    const rows = [
      { key: "a", datum: "A", x: 0, values: { goals: 50, xg: 50 }, missing: new Set(["xg"]) },
      { key: "b", datum: "B", x: 10, values: { goals: 50, xg: 50 }, missing: new Set(["xg"]) }
    ];
    const labels = { text: (series: string) => series, measure };
    const [goals] = placeLines(frame, rows, ["goals", "xg"], Infinity, false, labels);
    const [alone] = placeLines(frame, rows, ["goals"], Infinity, false, labels);
    expect(goals!.label).toEqual(alone!.label);
  });

  it("gives no point for a missing value", () => {
    const row: RowState<string> = { key: "4", datum: "W4", x: 4, values: { goals: 40, xg: 25 }, missing: new Set(["goals"]) };
    expect(placePoints(frame, row, ["goals", "xg"]).map((point) => point.key)).toEqual(["xg@4"]);
    expect(placePoints(frame, row, ["goals", "xg"])[0]!.data.related("goals")).toBeUndefined();
  });

  it("finds the values alone: next to a gap with no other value beside them", () => {
    const row = (key: string, missing: string[]): RowState<string> => ({ key, datum: key, x: Number(key), values: { goals: 1, xg: 1 }, missing: new Set(missing) });
    const rows = [row("1", []), row("2", ["goals"]), row("3", []), row("4", ["goals", "xg"]), row("5", ["xg"])];
    expect([...loneValues(rows, ["goals", "xg"])].sort()).toEqual(["goals@1", "goals@3", "goals@5"]);
    // No gap, no value alone: not even a line of one value.
    expect(loneValues([row("1", [])], ["goals"]).size).toBe(0);
    expect(loneValues(states([{ key: "a", datum: "A", x: 0, values: [{ series: "goals", value: 1 }] }, { key: "b", datum: "B", x: 1, values: [{ series: "goals", value: 2 }] }]), ["goals"]).size).toBe(0);
  });
});
