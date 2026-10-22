import {
  DOT_RADIUS,
  layoutLines,
  LINE_WIDTH,
  lineEncoding,
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

  it("throws on an x or a value that isn't a finite number, a missing one included", () => {
    expect(() => layout<Week>({ data: [{ week: Number.NaN, goals: 1, xg: 1 }], x: "week", series: ["goals"] })).toThrow(/x must be a finite number, got NaN in row 0/);
    expect(() => layout({ data: [{ week: "1", goals: 1 }] as unknown as Week[], x: "week", series: ["goals"] })).toThrow(/x must be a finite number, got "1"/);
    expect(() => layout({ data: [{ week: 1, xg: 1 }] as unknown as Week[], x: "week", series: ["goals"] })).toThrow(/"goals" for "1" must be a finite number, got undefined/);
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
