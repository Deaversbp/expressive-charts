import { describe as geometry, type Rect } from "../core";
import { barEncoding, layoutBars, niceDomain, placeRow, type BarLayout, type BarLayoutInput, type BarRow } from "./bar-layout";
import { textBox } from "./render/text";
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

  it("keeps it with the labels thinned and the value labels all hidden, where their room was, the ticks' half widths too", () => {
    // Every bar the same, so their value labels meet. Each name is at most 21 px ("r99"), and the
    // widest tick 7 px ("6") with positive bars only, or 14 px ("-6", "-5") with negative ones.
    const many = (sign: number) => Array.from({ length: 100 }, (_, i) => ({ k: `r${i}`, v: sign * 5 }));
    for (const data of [many(1), many(-1), [...many(1).slice(0, 50), ...many(-1).slice(50)]]) {
      const bars = { data, y: "k", x: "v", height: 300 } as const;
      const columns = { data, x: "k", y: "v" } as const;
      const positive = data.some((row) => row.v > 0);
      const negative = data.some((row) => row.v < 0);
      const tick = (negative ? 14 : 7) / 2 + 2;
      for (const room of [0, 28]) {
        for (const options of [bars, columns]) {
          const { labels } = layout(options, { room });
          expect(labels.every).toBeGreaterThan(1);
          expect(labels.values).toBe(false);
        }
        const at = (end: boolean) => (end ? room : 0);
        // The names 10 px from the bars' start, with `room` past them on a negative bar's side, and 4 px past a tip.
        expect(margins(bars, room)).toEqual({ start: Math.max(21 + 10 + at(negative), tick), end: Math.max(4 + at(positive), tick), label: 21 + at(negative) });
        // The axis' 26 px under the columns, then `room`; 4 px above them, then `room`.
        const { start, end, label } = margins(columns, room);
        const { frame, height } = layout(columns, { room });
        expect({ start, end, label }).toEqual({ start: 26 + at(negative), end: 4 + at(positive), label: frame.scale.from + 18 });
        expect(height - label).toBe(8 + at(negative));
      }
    }
  });
});

describe("layoutBars, the room hidden value labels leave", () => {
  type Row = { k: string; v: number };
  const rows = (...values: number[]): Row[] => values.map((v, i) => ({ k: `r${i}`, v }));
  /** Rows 15 px apart, so value labels' boxes, 16.25 px high, meet where the bars end together. */
  const tight = (data: Row[]) => ({ data, y: "k", x: "v", height: 4 + 26 + 15 * data.length }) as const;
  const intersect = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const anyOverlap = (boxes: readonly Rect[]): boolean => boxes.some((a, i) => boxes.slice(i + 1).some((b) => intersect(a, b)));
  /** The boxes of the labels the layout would draw on its own frame, every name and value drawn. */
  const unthinned = (result: BarLayout<Row>, part: "label" | "value") =>
    result.rows.map((row) => {
      const placed = placeRow(result.frame, { ...row, text: String(row.total), drawn: { label: true, value: true } }, measure);
      return textBox(placed[part], measure, `ec-${part}`, 12.5);
    });

  it("gives the bars the room past their tips, and on the left with negative bars", () => {
    // Value labels 7 px wide ("5"), so they kept 7 + 6 + 4 px past a tip; now 4 px, or the ticks' half width.
    const shown = layout(tight(rows(5, 3)));
    expect(shown.labels.values).toBe(true);
    expect(shown.width - shown.frame.scale.from - shown.frame.scale.extent).toBe(17);
    const hidden = layout(tight(rows(5, 5, 3)));
    expect(hidden.labels).toEqual({ every: 2, values: false });
    expect(hidden.width - hidden.frame.scale.from - hidden.frame.scale.extent).toBe(5.5);
    expect([hidden.frame.scale.from, hidden.frame.scale.label]).toEqual([24, 14]);
    // Negative bars: their value labels ("-5", 14 px) kept 20 px on the left, between the names and the bars.
    const negative = layout(tight(rows(-5, -5, 3)));
    expect(negative.labels.values).toBe(false);
    expect([negative.frame.scale.from, negative.frame.scale.label]).toEqual([24, 14]);
    expect(layout(tight(rows(-5, 3))).frame.scale.from).toBe(24 + 20);
  });

  it("gives the columns the room above them, and below the negative ones, the names 18 px under the axis", () => {
    // 600 px for 100 columns: 5.2 px apart, so their value labels meet.
    const columns = (...values: number[]) => layout({ data: Array.from({ length: 100 }, (_, i) => ({ k: `r${i}`, v: values[i % values.length]! })), x: "k", y: "v" });
    for (const result of [columns(5), columns(-5), columns(5, -5)]) {
      const { frame, height, labels } = result;
      expect(labels.values).toBe(false);
      // The plot's top 4 px down, as with no positive column, and its bottom over the axis' 26 px.
      expect(frame.scale.from + frame.scale.extent).toBe(4);
      expect(height - frame.scale.from).toBe(26);
      expect(frame.scale.label).toBe(frame.scale.from + 18);
    }
  });

  it("keeps `room` and the ticks' half widths", () => {
    const hidden = tight(rows(5, 5, 3, -1));
    // "-2" is the widest tick: 14 px, so 9 px for its half.
    expect(margins(layout(hidden))).toEqual({ left: 24, right: 9 });
    expect(margins(layout(hidden, { room: 28 }))).toEqual({ left: 24 + 28, right: 4 + 28 });
    function margins(result: BarLayout<Row>) {
      const { from, extent } = result.frame.scale;
      return { left: from, right: result.width - from - extent };
    }
  });

  it("thins the names again on the new frame, and keeps the value labels hidden where they'd fit on the longer bars", () => {
    // 100 and 97, 15 px apart: past the tips the 97's box, 18 px across, reaches the 100's at 640 px with
    // the value labels' room (3 / 100 of 585 px is 17.55), and not without it (of 603.5, 18.105).
    const result = layout(tight(rows(100, 97)), { width: 640 });
    expect(result.labels).toEqual({ every: 2, values: false });
    expect(result.frame.scale.extent).toBe(603.5);
    expect(anyOverlap(unthinned(result, "value"))).toBe(false);
    expect(result.rows.map((row) => [row.label.text, row.value.text, row.drawn])).toEqual([
      ["r0", "", { label: true, value: false }],
      ["", "", { label: false, value: false }]
    ]);
    // The names on the new frame: every nth, n as small as it can be, none overlapping.
    const data = Array.from({ length: 100 }, (_, i) => ({ k: `Bar ${i}`, v: 5 }));
    const steps = [1, 2, 5, 10, 20, 50, 100];
    for (const options of [
      { data, y: "k", x: "v", height: 300 },
      { data, x: "k", y: "v" }
    ] as const) {
      const thinned = layout(options);
      expect(thinned.labels.values).toBe(false);
      const names = unthinned(thinned, "label");
      const { every } = thinned.labels;
      const previous = steps[steps.indexOf(every) - 1]!;
      expect(anyOverlap(names.filter((_, slot) => slot % every === 0))).toBe(false);
      expect(anyOverlap(names.filter((_, slot) => slot % previous === 0))).toBe(true);
    }
  });

  it("lays out a chart whose value labels show byte for byte as main did", () => {
    expect(layoutDigests()).toEqual(SHOWN);
  });
});

/**
 * Layouts whose value labels show, as digests: bars and columns, plain and stacked, with negative
 * values, `room`, `height`, and thinned names. Numbers are rounded to 1e-9, so Node 22's and 24's last
 * bits agree.
 */
function layoutDigests(): Record<string, string> {
  const serial = (value: unknown): string => JSON.stringify(value, (_, v: unknown) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v));
  const signed = players.map((p, i) => ({ ...p, goals: i === 1 ? -p.goals : p.goals }));
  const named = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Bar ${i + 1}`, goals: 1 + ((i * 7) % 23), assists: i % 5 }));
  const cases: Record<string, readonly [Omit<BarChartOptions<Player>, "label">, Partial<BarLayoutInput<Player>>]> = {
    bars: [{ data: players, y: "name", x: "goals" }, {}],
    columns: [{ data: players, x: "name", y: "goals" }, {}],
    "a stack": [{ data: players, y: "name", stack: ["goals", "assists"], sort: "value" }, {}],
    "negative bars": [{ data: signed, y: "name", x: "goals" }, { room: 28 }],
    "negative columns": [{ data: signed, x: "name", y: "goals" }, { room: 28 }],
    "room and height": [{ data: players, y: "name", x: "goals", height: 200 }, { room: 12, width: 320 }],
    "thinned names": [{ data: named(12), y: "name", x: "goals", height: 160 }, {}],
    "thinned columns": [{ data: named(40), x: "name", stack: ["goals", "assists"] }, { width: 320 }]
  };
  const out: Record<string, string> = {};
  for (const [name, [options, more]] of Object.entries(cases)) {
    const result = layout(options, more);
    expect(result.labels.values, name).toBe(true);
    out[name] = hash(serial({ ...result, rows: result.rows.map(({ data, ...row }) => ({ ...row, samples: data.samples })) }));
  }
  return out;
}

/** The digests main (2d84d47) gave, with this file's layoutDigests() run there, before the bars took hidden value labels' room. */
const SHOWN: Readonly<Record<string, string>> = {
  bars: "a011ba0b886d5be4",
  columns: "4364478d2e42a7f3",
  "a stack": "c2a4ffbc9e32b355",
  "negative bars": "8d200dfab4a649a0",
  "negative columns": "49e6304d6716a195",
  "room and height": "5bebb892b9d05f94",
  "thinned names": "cc09a2f0858626ef",
  "thinned columns": "ac5a6e0d9395866c"
};

/** A 64-bit hash of the text (cyrb53's mixing, both halves kept), as 16 hex digits: enough to tell two layouts apart. */
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

describe("layoutBars, a negative column's labels", () => {
  type Row = { k: string; v: number };
  const rows = (...values: number[]): Row[] => values.map((v, i) => ({ k: `r${i}`, v }));
  const meet = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  /** A row's name and value boxes, as its labelBounds give them. */
  const boxes = (row: BarRow<Row>) => ({ name: textBox(row.label, measure, "ec-label", 12.5), value: textBox(row.value, measure, "ec-value", 12.5) });

  it("puts the names below the room kept for the value labels, so a column reaching the bottom has its value off its name", () => {
    for (const room of [0, 28]) {
      for (const data of [rows(6, -3), rows(-6, -3), rows(-10, -9.5, 4), rows(-0.5, 20)]) {
        const result = layout({ data, x: "k", y: "v" }, { room });
        const base = result.frame.scale.from;
        // 12.5 + 6 px of room for the value labels, then the names 18 px below it, as they'd be below the plot.
        expect(result.frame.scale.label, `${room} ${data.map((row) => row.v)}`).toBeCloseTo(base + 12.5 + 6 + 18, 9);
        for (const row of result.rows) {
          const { name, value } = boxes(row);
          expect(meet(name, value), `${room} ${row.key}`).toBe(false);
          expect(name.y + name.height).toBeLessThanOrEqual(result.height - room);
          expect(row.geometry.labelBounds).toEqual([name, value]);
        }
      }
    }
    // The most negative column reaches the plot's bottom, and its value label hangs into the room, above its name.
    const [lowest] = layout({ data: rows(-6, -3), x: "k", y: "v" }).rows;
    const { name, value } = boxes(lowest!);
    expect(lowest!.geometry.end.y).toBeCloseTo(lowest!.geometry.start.y + (300 - 4 - 44.5), 9);
    expect(value.y + value.height).toBeLessThan(name.y);
  });

  it("keeps the plot's height, and draws a chart with no negative column as before", () => {
    // Positive and negative: 12.5 + 6 + 2 px above the plot, and the axis's 26 px and the value labels' room below it.
    const mixed = layout({ data: rows(6, -3), x: "k", y: "v" });
    expect(-mixed.frame.scale.extent).toBeCloseTo(300 - 20.5 - 44.5, 9);
    // No negative column: the names 18 px below the plot, which reaches the axis's 26 px.
    const positive = layout({ data: rows(16, 6, 10), x: "k", y: "v" });
    expect(positive.frame.scale).toMatchObject({ from: 300 - 26, extent: -(300 - 20.5 - 26), label: 300 - 26 + 18 });
    expect(positive.rows.map((row) => row.label.y)).toEqual([292, 292, 292]);
  });
});

describe("layoutBars, thinning", () => {
  type Row = { name: string; value: number };
  /** "Bar 1" to "Bar n", their values from `lo` up to 100 and round again. */
  const bars = (n: number, lo = 1): Row[] => Array.from({ length: n }, (_, i) => ({ name: `Bar ${i + 1}`, value: lo + ((i * 37) % (101 - lo)) }));
  const intersect = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  /** Every pair, the slow way, so it doesn't share the layout's sweep. */
  function anyOverlap(boxes: readonly Rect[]): boolean {
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (intersect(boxes[i]!, boxes[j]!)) return true;
    return false;
  }
  /** Each row's labels as they'd be drawn without thinning: its category's box, then its value's. */
  const unthinned = (result: BarLayout<Row>) =>
    result.rows.map((row) => {
      const [category, value] = placeRow(result.frame, { ...row, text: String(row.total), drawn: { label: true, value: true } }, measure).geometry.labelBounds!;
      return { category: category!, value: value! };
    });
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

  /** Thinning as the plan says it: none overlapping, the first kept, every nth with n as small as it can be, values all or none. */
  function check(result: BarLayout<Row>): void {
    const { rows, labels } = result;
    const drawn = rows.flatMap((row) => row.geometry.labelBounds ?? []);
    expect(anyOverlap(drawn)).toBe(false);
    expect(steps).toContain(labels.every);
    expect(rows[0]!.label.text).toBe(rows[0]!.category);
    rows.forEach((row, slot) => {
      expect(row.drawn).toEqual({ label: slot % labels.every === 0, value: labels.values });
      expect(row.label.text).toBe(row.drawn.label ? row.category : "");
      expect(row.value.text).toBe(row.drawn.value ? String(row.total) : "");
      // labelBounds has the labels drawn, and only those.
      expect(row.geometry.labelBounds).toHaveLength(Number(row.drawn.label) + Number(row.drawn.value));
    });
    const full = unthinned(result);
    const previous = steps[steps.indexOf(labels.every) - 1];
    if (previous !== undefined) expect(anyOverlap(full.filter((_, slot) => slot % previous === 0).map((row) => row.category))).toBe(true);
    expect(anyOverlap(full.map((row) => row.value))).toBe(!labels.values);
  }

  it("leaves none overlapping, from 10 to 1,000 bars and columns, at 320 px and wide", () => {
    const seen = new Set<string>();
    for (const n of [10, 20, 40, 50, 100, 200, 500, 1000]) {
      for (const width of [320, 1200]) {
        const options = [
          { data: bars(n), y: "name", x: "value" },
          { data: bars(n), y: "name", x: "value", height: 300 },
          { data: bars(n, -50), y: "name", x: "value", height: 300 },
          { data: bars(n), x: "name", y: "value" },
          { data: bars(n), x: "name", y: "value", height: 150 },
          // The same value every 5th, so value labels meet sooner.
          { data: bars(n).map((row, i) => ({ ...row, value: 10 * (1 + (i % 5)) })), x: "name", y: "value" }
        ] as const;
        for (const option of options) {
          const result = layout<Row>(option, { width });
          check(result);
          seen.add(`${result.labels.every > 1 ? "thinned" : "every"} ${result.labels.values ? "values" : "no values"}`);
        }
      }
    }
    expect([...seen].sort()).toEqual(["every values", "thinned no values", "thinned values"]);
  });

  it("draws every nth category label from the first, n the smallest of 1, 2, 5, 10, 20, 50 and so on that fits", () => {
    // Columns all named "AAAA", 28 px at 7 px a character, so their boxes are 32 px across (2 px
    // either side). Every value is 1, so the widest tick is "0.5", 21 px, and the plot starts at 31.
    const every = (n: number, plot = 600): number => {
      const data = Array.from({ length: n }, (_, id) => ({ id, name: "AAAA", value: 1 }));
      const result = layout({ data, x: "name", y: "value", key: "id" }, { width: 31 + plot + 8 });
      expect(result.frame.bands.span).toBe(plot);
      return result.labels.every;
    };
    // n columns in 600 px are 600 / n px apart, and every nth label n times that.
    expect([10, 18, 19, 37, 38, 93, 94, 100, 300, 600, 1000].map((n) => every(n))).toEqual([1, 1, 2, 2, 5, 5, 10, 10, 20, 50, 100]);
    // Boxes that touch don't overlap: 40 columns in 640 px are 16 px apart, so every 2nd is 32 px.
    expect([every(40, 640), every(41, 640)]).toEqual([2, 5]);
  });

  it("draws every value label or none: none when any two would overlap, wherever they are", () => {
    const rows = (...values: number[]): Row[] => values.map((value, i) => ({ name: `r${i}`, value }));
    // Bars 15 px apart, so value labels' boxes, 16.25 px high, overlap where the bars end together.
    const tight = (...values: number[]) => layout<Row>({ data: rows(...values), y: "name", x: "value", height: 4 + 26 + 15 * values.length });
    expect(tight(10, 100, 10, 100).labels).toEqual({ every: 2, values: true });
    expect(tight(10, 100, 10, 100, 100).labels).toEqual({ every: 2, values: false });
    // Columns 12 px apart: a "100" two along is 24 px away and 25 px across. A short column between
    // keeps each pair beside each other apart, but not the two tall ones.
    const columns = (...values: number[]) => layout<Row>({ data: rows(...values), x: "name", y: "value" }, { width: 31 + 12 * values.length + 8 });
    expect(columns(100, 1, 1, 100).labels).toEqual({ every: 2, values: true });
    expect(columns(100, 1, 100).labels).toEqual({ every: 2, values: false });
    for (const result of [tight(10, 100, 10, 100), tight(10, 100, 10, 100, 100), columns(100, 1, 1, 100), columns(100, 1, 100)]) check(result);
  });

  it("keeps every name, value and datum on the rows, with only the drawn labels' boxes in labelBounds", () => {
    // Rows 2.7 px apart, the same value every 4th.
    const data = bars(100).map((row, i) => ({ ...row, value: 1 + (i % 4) }));
    const result = layout<Row>({ data, y: "name", x: "value", height: 300 });
    expect(result.labels).toEqual({ every: 10, values: false });
    expect(result.rows.map((row) => [row.category, row.total, row.datum])).toEqual(data.map((row) => [row.name, row.value, row]));
    const [first, second] = result.rows;
    expect(first!.geometry.labelBounds).toEqual([textBox(first!.label, measure, "ec-label", 12.5)]);
    expect(second!.geometry.labelBounds).toEqual([]);
    expect([second!.label.text, second!.value.text]).toEqual(["", ""]);
  });

  it("draws every label where none overlap, and lets placeRow draw a state as its layout thinned it", () => {
    const result = layout({ data: players, y: "name", x: "goals" });
    expect(result.labels).toEqual({ every: 1, values: true });
    expect(result.rows.map((row) => [row.label.text, row.value.text])).toEqual(players.map((p) => [p.name, String(p.goals)]));
    const row = result.rows[1]!;
    const state = { ...row, text: "6" };
    const drawn = (placed: BarRow<unknown>) => [placed.category, placed.drawn, placed.label, placed.value, placed.geometry.labelBounds];
    expect(drawn(placeRow(result.frame, state, measure))).toEqual(drawn(row));
    expect(placeRow(result.frame, { ...state, drawn: { label: false, value: true } }, measure).label.text).toBe("");
    expect(placeRow(result.frame, { ...state, drawn: { label: true, value: false } }, measure).geometry.labelBounds).toEqual([textBox(row.label, measure, "ec-label", 12.5)]);
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
