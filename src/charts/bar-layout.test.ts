import { describe as geometry } from "../core";
import { barEncoding, layoutBars, niceDomain, type BarLayoutInput } from "./bar-layout";
import type { BarChartOptions } from "./types";

interface Player {
  name: string;
  goals: number;
  assists: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 16, assists: 4 },
  { name: "Tanaka", goals: 6, assists: 10 },
  { name: "Lindqvist", goals: 10, assists: 7 }
];

/** 7 px per character, so margins are predictable. */
const measure = (text: string): number => text.length * 7;

function layout<D>(options: Omit<BarChartOptions<D>, "label">, more: Partial<BarLayoutInput<D>> = {}) {
  const full = { label: "Test", ...options } as BarChartOptions<D>;
  return layoutBars<D>({
    data: full.data,
    encoding: barEncoding(full),
    sort: full.sort,
    width: 600,
    height: full.height,
    format: String,
    measure,
    ...more
  });
}

describe("barEncoding", () => {
  it("takes the axis whose values aren't numbers as the category", () => {
    expect(barEncoding({ label: "", data: players, y: "name", x: "goals" }).orientation).toBe("horizontal");
    expect(barEncoding({ label: "", data: players, x: "name", y: "goals" }).orientation).toBe("vertical");
  });

  it("uses the one axis given alongside stack as the category", () => {
    const horizontal = barEncoding({ label: "", data: players, y: "name", stack: ["goals", "assists"] });
    expect(horizontal.orientation).toBe("horizontal");
    expect(horizontal.series.map((s) => s.series)).toEqual(["goals", "assists"]);
    expect(barEncoding({ label: "", data: players, x: "name", stack: ["goals"] }).orientation).toBe("vertical");
  });

  it("lets orientation force the category", () => {
    const years = [{ year: 2024, sales: 3 }];
    expect(() => barEncoding({ label: "", data: years, x: "year", y: "sales" })).toThrow(/both hold numbers.*orientation/);
    const columns = barEncoding({ label: "", data: years, x: "year", y: "sales", orientation: "vertical" });
    expect(columns.category(years[0]!, 0)).toBe(2024);
    expect(columns.series).toEqual([expect.objectContaining({ series: "sales" })]);
  });

  it("explains what's missing", () => {
    expect(() => barEncoding({ label: "", data: players, x: "goals" })).toThrow(/needs x and y/);
    expect(() => barEncoding({ label: "", data: players, y: "name", x: "name" })).toThrow(/neither x nor y holds numbers/);
    expect(() => barEncoding({ label: "", data: players, y: "name", orientation: "horizontal" })).toThrow(/needs values: x/);
    expect(() => barEncoding({ label: "", data: players, x: "goals", orientation: "horizontal" })).toThrow(/categories from y/);
    expect(() => barEncoding({ label: "", data: players, y: "name", stack: [] })).toThrow(/at least one/);
    expect(() => barEncoding({ label: "", data: players, y: "name", stack: ["goals", "goals"] })).toThrow(/twice/);
  });

  it("names a function's values \"value\" and keys by the category unless told otherwise", () => {
    const encoding = barEncoding<Player>({ label: "", data: players, y: "name", x: (d) => d.goals + d.assists, key: (d) => d.name.toUpperCase() });
    expect(encoding.series[0]!.series).toBe("value");
    expect(encoding.key(players[0]!, 0)).toBe("OKAFOR");
  });
});

describe("niceDomain", () => {
  it("rounds out to a 1, 2 or 5 step, about four ticks apart, always including zero", () => {
    expect(niceDomain([16, 6, 10])).toEqual({ lo: 0, hi: 20, ticks: [0, 5, 10, 15, 20] });
    expect(niceDomain([-3, 7])).toEqual({ lo: -5, hi: 10, ticks: [-5, 0, 5, 10] });
    expect(niceDomain([-3, 5])).toEqual({ lo: -4, hi: 6, ticks: [-4, -2, 0, 2, 4, 6] });
    expect(niceDomain([0.3, 0.1])).toEqual({ lo: 0, hi: 0.3, ticks: [0, 0.1, 0.2, 0.3] });
    expect(niceDomain([])).toEqual({ lo: 0, hi: 1, ticks: [0, 0.5, 1] });
  });
});

describe("layoutBars, horizontal", () => {
  it("lays rows out top to bottom with their height from the content", () => {
    const result = layout({ data: players, y: "name", x: "goals" });
    expect(result.orientation).toBe("horizontal");
    expect(result.height).toBe(4 + 3 * 34 + 26);
    expect(result.rows.map((row) => row.key)).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
    // Left margin: the widest label (9 chars) + 10. Right: the widest value (2 chars) + 10.
    const okafor = result.rows[0]!;
    expect(okafor.geometry.bounds).toMatchObject({ x: 73, y: 11, height: 20 });
    expect(okafor.geometry.bounds.width).toBeCloseTo((600 - 73 - 24) * (16 / 20));
    expect(okafor.label).toEqual({ x: 63, y: 4 + 17 + 4.5, anchor: "end", text: "Okafor" });
    expect(okafor.value).toMatchObject({ x: 73 + okafor.geometry.bounds.width + 6, anchor: "start", text: "16" });
    expect(okafor.hit).toEqual({ x: 0, y: 4, width: 600, height: 34 });
  });

  it("describes each bar with describe.bar: a plain bar is one segment named after its field", () => {
    const okafor = layout({ data: players, y: "name", x: "goals" }).rows[0]!;
    const { bounds } = okafor.geometry;
    const expected = geometry.bar({ key: "Okafor", series: "goals", ...bounds, baseline: "left", radius: 4, gap: 2, segments: [{ series: "goals", size: bounds.width }] });
    expect(okafor.geometry.outline.d).toBe(expected.outline.d);
    expect(okafor.geometry.series).toBe("goals");
    expect(okafor.geometry.segments?.map((s) => s.key)).toEqual(["Okafor/goals"]);
  });

  it("stacks segments from the baseline with a 2 px gap", () => {
    const okafor = layout({ data: players, y: "name", stack: ["goals", "assists"] }).rows[0]!;
    const [goals, assists] = okafor.geometry.segments!;
    expect(okafor.geometry.series).toBeUndefined();
    expect(goals!.key).toBe("Okafor/goals");
    expect(assists!.start.x - goals!.end.x).toBeCloseTo(2);
    expect(okafor.total).toBe(20);
    expect(okafor.data.samples).toEqual([
      { t: 0, value: 0 },
      { t: 1, value: 20 }
    ]);
    const related = okafor.data.related("assists")!;
    expect(related.samples[1]!.value).toBeCloseTo(20);
    expect(related.samples[0]!.value).toBeGreaterThan(16);
    expect(okafor.data.related("xg")).toBeUndefined();
  });

  it("grows negative bars to the left of zero, from a right baseline", () => {
    const result = layout({ data: [{ k: "a", v: 6 }, { k: "b", v: -3 }], y: "k", x: "v" });
    const [a, b] = result.rows;
    expect(a!.geometry.angle(0)).toBe(0);
    expect(b!.geometry.angle(0)).toBeCloseTo(Math.PI);
    expect(b!.geometry.start.x).toBeCloseTo(a!.geometry.start.x);
    expect(b!.value.anchor).toBe("end");
    expect(result.ticks.find((tick) => tick.value === 0)!.line.x1).toBeCloseTo(a!.geometry.start.x);
  });

  it("fits rows into a fixed height", () => {
    const result = layout({ data: players, y: "name", x: "goals", height: 200 });
    expect(result.height).toBe(200);
    expect(result.rows[2]!.hit).toMatchObject({ y: 4 + 2 * ((200 - 30) / 3), height: (200 - 30) / 3 });
  });

  it("puts gridlines and ticks along the value axis", () => {
    const result = layout({ data: players, y: "name", x: "goals" });
    expect(result.ticks.map((tick) => tick.label.text)).toEqual(["0", "5", "10", "15", "20"]);
    const last = result.ticks[4]!;
    expect(last.line).toEqual({ x1: 600 - 24, y1: 4, x2: 600 - 24, y2: 4 + 3 * 34 });
    expect(last.label).toMatchObject({ y: 4 + 3 * 34 + 16, anchor: "middle" });
  });
});

describe("layoutBars, vertical", () => {
  it("lays columns out left to right, growing up from the baseline", () => {
    const result = layout({ data: players, x: "name", y: "goals" });
    expect(result.orientation).toBe("vertical");
    expect(result.height).toBe(300);
    const [okafor, tanaka] = result.rows;
    expect(okafor!.geometry.angle(0)).toBeCloseTo(-Math.PI / 2);
    expect(tanaka!.geometry.center.x).toBeGreaterThan(okafor!.geometry.center.x);
    expect(okafor!.geometry.start.y).toBeCloseTo(tanaka!.geometry.start.y);
    expect(okafor!.label).toMatchObject({ x: okafor!.geometry.center.x, anchor: "middle", text: "Okafor" });
    expect(okafor!.value.y).toBeLessThan(okafor!.geometry.end.y);
    expect(result.ticks[0]!.label.anchor).toBe("end");
  });

  it("caps column width at 72 px", () => {
    const result = layout({ data: players.slice(0, 1), x: "name", y: "goals" });
    expect(result.rows[0]!.geometry.thickness).toBe(72);
  });
});

describe("layoutBars, room", () => {
  type Row = { k: string; v: number };
  const rows = (...values: number[]): Row[] => values.map((v, i) => ({ k: `r${i}`, v }));
  /** The px outside the value axis on each side, and where the category labels sit. */
  function margins(options: Omit<BarChartOptions<Row>, "label">, room?: number) {
    const { frame, width, height } = layout(options, room === undefined ? {} : { room });
    const { from, extent, label } = frame.scale;
    if (frame.orientation === "horizontal") return { start: from, end: width - (from + extent), label };
    // Columns: lo sits at the bottom, `from`, and the axis runs up.
    return { start: height - from, end: from + extent, label };
  }
  /** What `room` adds on each side, and how far it moves the category labels. */
  function added(options: Omit<BarChartOptions<Row>, "label">) {
    const without = margins(options);
    const with28 = margins(options, 28);
    return { start: with28.start - without.start, end: with28.end - without.end, label: with28.label - without.label };
  }

  it("is 0 by default, so nothing moves", () => {
    for (const options of [{ data: rows(6, -3), y: "k", x: "v" }, { data: rows(6, -3), x: "k", y: "v" }] as const) {
      expect(layout(options, { room: 0 }).frame).toEqual(layout(options).frame);
    }
  });

  it("keeps it past the value labels at a bar's tip, and not at the other end when no bar is negative", () => {
    expect(added({ data: rows(16, 6, 10), y: "k", x: "v" })).toEqual({ start: 0, end: 28, label: 0 });
    // The labels the bars had stay where they were against the tip.
    const okafor = layout({ data: players, y: "name", x: "goals" }, { room: 28 }).rows[0]!;
    expect(okafor.value.x).toBeCloseTo(okafor.geometry.end.x + 6, 6);
    expect(600 - okafor.geometry.end.x).toBeGreaterThanOrEqual(6 + 14 + 4 + 28);
  });

  it("keeps it past the names on a negative bar's side, where its text goes past them too", () => {
    expect(added({ data: rows(6, -3), y: "k", x: "v" })).toEqual({ start: 28, end: 28, label: 28 });
    // Only negative bars: the positive end, which no bar reaches, gets none.
    expect(added({ data: rows(-6, -3), y: "k", x: "v" })).toEqual({ start: 28, end: 0, label: 28 });
    const [b] = layout({ data: rows(-6, -3), y: "k", x: "v" }, { room: 28 }).rows;
    // The name's left edge 28 px in from the chart's.
    expect(b!.label.x - 2 * 7).toBe(28);
  });

  it("keeps it above columns, and below negative columns, past the names under them", () => {
    expect(added({ data: rows(16, 6, 10), x: "k", y: "v" })).toEqual({ start: 0, end: 28, label: 0 });
    // The names hang from the axis, so they rise with it, and the room is under them.
    expect(added({ data: rows(6, -3), x: "k", y: "v" })).toEqual({ start: 28, end: 28, label: -28 });
    expect(added({ data: rows(-6, -3), x: "k", y: "v" })).toEqual({ start: 28, end: 0, label: -28 });
    const negative = layout({ data: rows(-6, -3), x: "k", y: "v" }, { room: 28 });
    expect(negative.height - negative.rows[0]!.label.y).toBeGreaterThanOrEqual(28);
  });
});

describe("layoutBars, data", () => {
  it("sorts by value, by key, by a comparator or not at all, keeping keys", () => {
    const keys = (sort: BarChartOptions<Player>["sort"]) => layout({ data: players, y: "name", x: "goals", sort }).rows.map((r) => r.key);
    expect(keys(undefined)).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
    expect(keys("none")).toEqual(["Okafor", "Tanaka", "Lindqvist"]);
    expect(keys("value")).toEqual(["Okafor", "Lindqvist", "Tanaka"]);
    expect(keys("key")).toEqual(["Lindqvist", "Okafor", "Tanaka"]);
    expect(keys((a, b) => a.assists - b.assists)).toEqual(["Okafor", "Lindqvist", "Tanaka"]);
    expect(() => keys("loud" as never)).toThrow(/sort must be/);
  });

  it("sorts keys with numbers in numeric order", () => {
    const weeks = [{ week: "Week 10", n: 1 }, { week: "Week 2", n: 2 }];
    expect(layout({ data: weeks, y: "week", x: "n", sort: "key" }).rows.map((r) => r.key)).toEqual(["Week 2", "Week 10"]);
  });

  it("converts numeric keys with String() and rejects duplicates", () => {
    const rows = [{ id: 7, name: "A", v: 1 }, { id: 8, name: "A", v: 2 }];
    expect(layout({ data: rows, y: "name", x: "v", key: "id" }).rows.map((r) => r.key)).toEqual(["7", "8"]);
    expect(() => layout({ data: rows, y: "name", x: "v" })).toThrow(/two rows have the key "A"/);
  });

  it("counts missing values as zero and rejects values that aren't numbers", () => {
    const rows = [{ name: "A", goals: 3, assists: null as number | null }];
    expect(layout({ data: rows, y: "name", stack: ["goals", "assists"] as never }).rows[0]!.total).toBe(3);
    expect(() => layout({ data: [{ name: "A", goals: Number.NaN }], y: "name", x: "goals", orientation: "horizontal" })).toThrow(/"goals" for "A" must be a finite number/);
  });

  it("rejects a stack that mixes signs", () => {
    expect(() => layout({ data: [{ name: "A", up: 3, down: -1 }], y: "name", stack: ["up", "down"] })).toThrow(/mixes positive and negative/);
  });
});
