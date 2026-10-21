import { percent } from "./shell/format";
import { donutEncoding, joinedStarts, layoutDonut, placeCenter, placeLabels, placeSlice, type DonutFrame, type DonutLayoutInput, type SliceState } from "./donut-layout";
import type { DonutChartOptions } from "./types";

interface Shot {
  outcome: string;
  shots: number | null;
}

const shots: Shot[] = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];

/** jsdom's estimate: 0.6 em a character. */
const measure = (text: string, _className: string, size: number): number => text.length * size * 0.6;

const TAU = 2 * Math.PI;

function layout(options: Partial<DonutChartOptions<Shot>> = {}, input: Partial<DonutLayoutInput<Shot>> = {}) {
  const merged: DonutChartOptions<Shot> = { label: "Shot outcomes", data: shots, category: "outcome", value: "shots", ...options };
  return layoutDonut<Shot>({
    data: merged.data,
    encoding: donutEncoding(merged),
    sort: merged.sort,
    width: 640,
    height: undefined,
    center: (total) => `${total}\nshots`,
    measure,
    ...input
  });
}

describe("donutEncoding", () => {
  it("names slices by category, keys them by it unless key is given, and names the series after the value field", () => {
    const encoding = donutEncoding<Shot>({ label: "x", data: shots, category: "outcome", value: "shots" });
    expect(encoding.series).toBe("shots");
    expect(encoding.category(shots[0]!, 0)).toBe("Goal");
    expect(encoding.key(shots[0]!, 0)).toBe("Goal");
    expect(encoding.value(shots[1]!, 1)).toBe(112);
    const read = donutEncoding<Shot>({ label: "x", data: shots, category: (d) => d.outcome.toUpperCase(), value: (d) => d.shots, key: (_d, i) => i });
    expect(read.series).toBe("value");
    expect(read.category(shots[0]!, 0)).toBe("GOAL");
    expect(read.key(shots[2]!, 2)).toBe(2);
  });

  it("needs a category and a value", () => {
    expect(() => donutEncoding({ label: "x", data: shots, value: "shots" } as unknown as DonutChartOptions<Shot>)).toThrow(/needs a category/);
    expect(() => donutEncoding({ label: "x", data: shots, category: "outcome" } as unknown as DonutChartOptions<Shot>)).toThrow(/needs a value/);
  });
});

describe("layoutDonut: slices", () => {
  it("lays slices end to end from 12 o'clock, clockwise in data order, each angle its true share", () => {
    const { slices, total } = layout();
    expect(total).toBe(406);
    expect(slices.map((slice) => slice.key)).toEqual(["Goal", "Saved", "Off target", "Blocked"]);
    let before = 0;
    for (const slice of slices) {
      expect(slice.start).toBeCloseTo((before / 406) * TAU, 12);
      before += slice.value;
      expect(slice.end).toBeCloseTo((before / 406) * TAU, 12);
      expect(slice.share).toBeCloseTo(slice.value / 406, 12);
    }
    expect(slices[0]!.start).toBe(0);
    expect(slices[slices.length - 1]!.end).toBe(TAU);
  });

  it("sorts by value, largest first, or keeps data order", () => {
    expect(layout({ sort: "value" }).slices.map((slice) => slice.key)).toEqual(["Off target", "Saved", "Blocked", "Goal"]);
    expect(layout({ sort: "none" }).slices.map((slice) => slice.key)).toEqual(["Goal", "Saved", "Off target", "Blocked"]);
    expect(() => layout({ sort: "key" as "value" })).toThrow(/sort must be "value" or "none"/);
  });

  it("describes each slice with describe.arc, in the slice's series, about the ring's centre", () => {
    const { slices, frame } = layout();
    const saved = slices[1]!;
    expect(saved.geometry.key).toBe("Saved");
    expect(saved.geometry.series).toBe("shots");
    expect(saved.geometry.pivot).toEqual({ x: frame.cx, y: frame.cy });
    expect(saved.geometry.thickness).toBeCloseTo(frame.outer - frame.inner, 9);
    // The walk is the mid-radius arc, clockwise.
    expect(saved.geometry.length).toBeCloseTo(((frame.inner + frame.outer) / 2) * (saved.end - saved.start), 6);
  });

  it("gives data effects the row, and samples from 0 to the slice's share", () => {
    const saved = layout().slices[1]!;
    expect(saved.data.datum).toBe(shots[1]);
    expect(saved.data.samples).toEqual([
      { t: 0, value: 0 },
      { t: 1, value: saved.share }
    ]);
    expect(saved.data.related("shots")).toBe(saved.data);
    expect(saved.data.related("xg")).toBeUndefined();
  });

  it("counts a missing value as 0 and throws on a negative or non-finite one", () => {
    const { slices } = layout({ data: [...shots, { outcome: "Unknown", shots: null }] });
    expect(slices[4]!.value).toBe(0);
    expect(slices[4]!.start).toBe(TAU);
    expect(slices[4]!.end).toBe(TAU);
    expect(() => layout({ data: [{ outcome: "Goal", shots: -1 }] })).toThrow(/"shots" for "Goal" must be a finite number of 0 or more, got -1/);
    expect(() => layout({ data: [{ outcome: "Goal", shots: Number.NaN }] })).toThrow(/got NaN/);
    expect(() => layout({ data: [{ outcome: "Goal", shots: "7" as unknown as number }] })).toThrow(/got "7"/);
  });

  it("throws on keys that repeat", () => {
    expect(() => layout({ data: [shots[0]!, shots[0]!] })).toThrow(/two rows have the key "Goal"/);
  });

  it("draws no slices when the total is 0: every slice has no angle", () => {
    const { slices, labels, total } = layout({ data: shots.map((shot) => ({ ...shot, shots: 0 })) });
    expect(total).toBe(0);
    for (const slice of slices) {
      expect([slice.start, slice.end, slice.share]).toEqual([0, 0, 0]);
      expect(slice.geometry.length).toBe(0);
    }
    expect(labels.every((label) => label === undefined)).toBe(true);
    expect(layout({ data: [] }).slices).toEqual([]);
  });
});

describe("layoutDonut: size", () => {
  it("is 300 px high by default, with the ring as large as the room left for labels allows", () => {
    const { frame } = layout();
    expect([frame.width, frame.height, frame.cx, frame.cy]).toEqual([640, 300, 320, 150]);
    // Above and below: 4 px of edge, a 28 px label block and a 10 px gap.
    expect(frame.outer).toBe(150 - 4 - 28 - 10);
    expect(frame.inner).toBeCloseTo(0.6 * frame.outer, 12);
  });

  it("leaves room beside the ring for the widest category", () => {
    const { frame } = layout({}, { width: 380, height: 400 });
    // "Off target" is 75 px wide.
    expect(frame.outer).toBe(190 - 4 - 10 - 75);
  });

  it("keeps half the radius it could have when the labels leave less, and drops labels that don't fit", () => {
    const long = [
      { outcome: "A category with a very long name", shots: 50 },
      { outcome: "Another long one", shots: 50 }
    ];
    const { frame, labels } = layout({ data: long }, { width: 300, height: 300 });
    expect(frame.outer).toBe((150 - 4) / 2);
    expect(labels.every((label) => label === undefined)).toBe(true);
  });
});

describe("placeLabels", () => {
  const frame: DonutFrame = { width: 640, height: 300, cx: 320, cy: 150, outer: 108, inner: 64.8 };
  const state = (key: string, start: number, end: number): SliceState<null> => ({
    key,
    datum: null,
    index: 0,
    category: key,
    series: "value",
    value: end - start,
    share: (end - start) / TAU,
    start,
    end
  });

  it("puts the category over the share outside the ring, beside it at 3 o'clock and above it at 12", () => {
    const right = placeLabels(frame, [state("Right", TAU / 4 - 0.5, TAU / 4 + 0.5)], measure)[0]!;
    // Starts 10 px out from the ring, centred on the ring's middle across.
    const x = 320 + 118;
    expect(right.category.x).toBeCloseTo(x + measure("Right", "", 12.5) / 2, 6);
    expect(right.share.x).toBeCloseTo(x + measure("16%", "", 12.5) / 2, 6);
    expect(right.category.anchor).toBe("middle");
    expect(right.share.text).toBe("16%");
    expect(right.box.y + right.box.height / 2).toBeCloseTo(150, 6);

    const top = placeLabels(frame, [state("Top", -0.5, 0.5)], measure)[0]!;
    expect(top.category.x).toBeCloseTo(320, 6);
    // The block ends where the label starts: 10 px above the ring.
    expect(top.box.y + top.box.height).toBeCloseTo(150 - 118, 6);
    expect(top.share.y - top.category.y).toBe(15);
  });

  it("labels only slices of 15° or more", () => {
    const fifteen = Math.PI / 12;
    const labels = placeLabels(frame, [state("Wide", 0, fifteen), state("Narrow", fifteen, fifteen + fifteen * 0.99)], measure);
    expect(labels.map((label) => label?.category.text)).toEqual(["Wide", undefined]);
  });

  it("drops a label that would overlap the one before it, and the last one that would overlap the first", () => {
    const step = Math.PI / 10; // 18°: wide enough for a label, too close for two
    const slices = Array.from({ length: 20 }, (_, i) => state(`Slice ${i}`, i * step, (i + 1) * step));
    const labels = placeLabels(frame, slices, measure);
    const shown = labels.flatMap((label) => (label ? [label] : []));
    expect(labels[0]).toBeDefined();
    expect(labels[1]).toBeUndefined();
    expect(shown.length).toBeGreaterThan(2);
    const apart = (a: (typeof shown)[number], b: (typeof shown)[number]): boolean =>
      a.box.x >= b.box.x + b.box.width || b.box.x >= a.box.x + a.box.width || a.box.y >= b.box.y + b.box.height || b.box.y >= a.box.y + a.box.height;
    for (let i = 1; i < shown.length; i++) expect(apart(shown[i - 1]!, shown[i]!)).toBe(true);
    expect(apart(shown[shown.length - 1]!, shown[0]!)).toBe(true);
  });
});

describe("placeCenter", () => {
  const frame: DonutFrame = { width: 640, height: 300, cx: 320, cy: 150, outer: 108, inner: 64.8 };

  it("draws the first line large and the next 20 px below, centred on the ring together", () => {
    const [total, unit] = placeCenter(frame, "406\nshots", measure);
    expect(total).toMatchObject({ x: 320, anchor: "middle", text: "406", size: 26 });
    expect(unit).toMatchObject({ x: 320, anchor: "middle", text: "shots", size: 12.5 });
    expect(unit!.y - total!.y).toBe(20);
    // From the big line's cap height (0.72 em) to the last baseline, centred on 150.
    expect((total!.y - 0.72 * 26 + unit!.y) / 2).toBeCloseTo(150, 9);
    expect(placeCenter(frame, "", measure)).toEqual([]);
  });

  it("centres a lone line on its cap height, and shrinks a first line too wide for the hole", () => {
    const [only] = placeCenter(frame, "406", measure);
    expect(only!.y).toBeCloseTo(150 + 0.36 * 26, 9);
    const [wide] = placeCenter(frame, "1,234,567,890", measure);
    expect(wide!.size).toBeLessThan(26);
    expect(measure(wide!.text, "", wide!.size)).toBeCloseTo(2 * 64.8 * 0.85, 6);
  });
});

describe("helpers", () => {
  it("joinedStarts lays values end to end in turns; all 0 when the total is", () => {
    expect(joinedStarts([1, 1, 2])).toEqual([0, 0.25, 0.5]);
    expect(joinedStarts([0, 0])).toEqual([0, 0]);
  });

  it("percent rounds a share to a whole percent", () => {
    expect([percent(0.2758), percent(0), percent(1), percent(0.004)]).toEqual(["28%", "0%", "100%", "0%"]);
  });

  it("placeSlice draws any angles, for the frames in between", () => {
    const frame: DonutFrame = { width: 200, height: 200, cx: 100, cy: 100, outer: 80, inner: 48 };
    const slice = placeSlice(frame, { key: "A", datum: null, index: 0, category: "A", series: "value", value: 1, share: 0.25, start: 0.1, end: 0.1 + TAU / 4 });
    expect(slice.geometry.start.x).toBeCloseTo(100 + 64 * Math.sin(0.1), 6);
    expect(slice.geometry.start.y).toBeCloseTo(100 - 64 * Math.cos(0.1), 6);
  });
});
