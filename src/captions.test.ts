// delta and label on real marks: our charts' bars, columns, slices and lines, whose text goes past
// the marks' own labels (labelBounds), and host marks, which have none, so it goes 10 px past the end.
// And how far past the chart's edge the text reaches on a chart 320 px wide. This test brings charts
// and effects together, so it lives beside src/index.ts, the only module allowed to.

import { barChart, delta, describe as build, donutChart, expressive, label, lineChart, only, type MarkData, type MarkGeometry, type Rect } from "./index";

interface Player {
  name: string;
  goals: number;
}

interface Week {
  week: number;
  goals: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 16 },
  { name: "Tanaka", goals: 6 },
  { name: "Lindqvist", goals: 10 }
];

const SVG = "http://www.w3.org/2000/svg";
/** Overlay text, as jsdom estimates chart text: 0.6 em a character at 12.5 px. */
const CHARACTER = 12.5 * 0.6;

function container(): HTMLDivElement {
  return document.body.appendChild(document.createElement("div"));
}

/** The text a run drew for the mark `key`, and where: its anchor point, anchor and the box it covers by jsdom's estimate. */
function drawn(svg: SVGSVGElement, key: string): { readonly text: string; readonly x: number; readonly y: number; readonly anchor: string; readonly box: Rect }[] {
  return Array.from(svg.querySelectorAll<SVGTextElement>(`.ec-run[data-key="${key}"] text.ec-text`), (element) => {
    const x = Number(element.getAttribute("x"));
    const y = Number(element.getAttribute("y"));
    const anchor = element.getAttribute("text-anchor") ?? "start";
    const text = element.textContent ?? "";
    const width = text.length * CHARACTER;
    const left = anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
    return { text, x, y, anchor, box: { x: left, y: y - 0.75 * 12.5, width, height: 0.95 * 12.5 } };
  });
}

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** No caption covers any mark's own labels. */
function clearOfLabels(svg: SVGSVGElement, marks: readonly MarkGeometry[]): void {
  const boxes = marks.flatMap((mark) => mark.labelBounds ?? []);
  for (const mark of marks) for (const caption of drawn(svg, mark.key)) for (const box of boxes) expect(overlaps(caption.box, box), `${mark.key} "${caption.text}"`).toBe(false);
}

const byKey = (marks: readonly MarkGeometry[], key: string): MarkGeometry => marks.find((mark) => mark.key === key)!;

describe("delta and label on our charts", () => {
  function bars(options: Partial<Parameters<typeof barChart<Player>>[1]> = {}) {
    const chart = barChart<Player>(container(), { label: "Goals", data: players, y: "name", x: "goals", width: 600, motion: "off", on: { update: delta() }, ...options });
    return { chart, svg: chart.element };
  }
  const plusTwo = (key: string, sign = 1) => players.map((p) => (p.name === key ? { ...p, goals: p.goals + 2 * sign } : p));

  it("puts a bar's change 6 px past its value label, on the label's line", async () => {
    const { chart, svg } = bars();
    await chart.update({ data: plusTwo("Okafor") });
    const [value] = byKey(chart.marks(), "Okafor").labelBounds!.slice(1);
    const label = chart.labels().find((l) => l.key === "Okafor" && l.role === "value")!;
    expect(drawn(svg, "Okafor")).toMatchObject([{ text: "+2", anchor: "start", y: label.y }]);
    expect(drawn(svg, "Okafor")[0]!.x).toBeCloseTo(value!.x + value!.width + 6, 2);
    // Only the bar that changed.
    expect(drawn(svg, "Tanaka")).toEqual([]);
    clearOfLabels(svg, chart.marks());
  });

  it("puts a negative bar's change past its name, the farthest label its heading meets", async () => {
    const negative = players.map((p) => ({ ...p, goals: -p.goals }));
    const { chart, svg } = bars({ data: negative });
    await chart.update({ data: negative.map((p) => (p.name === "Tanaka" ? { ...p, goals: p.goals - 2 } : p)) });
    const [category] = byKey(chart.marks(), "Tanaka").labelBounds!;
    expect(drawn(svg, "Tanaka")).toMatchObject([{ text: new Intl.NumberFormat(undefined, { signDisplay: "always" }).format(-2), anchor: "end" }]);
    expect(drawn(svg, "Tanaka")[0]!.x).toBeCloseTo(category!.x - 6, 2);
    clearOfLabels(svg, chart.marks());
  });

  it("centres a column's change above its value label, and hangs a negative column's below its name", async () => {
    const { chart, svg } = bars({ x: "name", y: "goals" });
    await chart.update({ data: plusTwo("Tanaka") });
    const column = byKey(chart.marks(), "Tanaka");
    const [, value] = column.labelBounds!;
    expect(drawn(svg, "Tanaka")).toMatchObject([{ text: "+2", anchor: "middle" }]);
    expect(drawn(svg, "Tanaka")[0]!.x).toBeCloseTo(column.end.x, 2);
    expect(drawn(svg, "Tanaka")[0]!.y).toBeCloseTo(value!.y - 6, 2);
    clearOfLabels(svg, chart.marks());

    const negative = players.map((p) => ({ ...p, goals: -p.goals }));
    const hanging = bars({ x: "name", y: "goals", data: negative });
    await hanging.chart.update({ data: negative.map((p) => (p.name === "Tanaka" ? { ...p, goals: p.goals - 2 } : p)) });
    const [name] = byKey(hanging.chart.marks(), "Tanaka").labelBounds!;
    // Its top 6 px under the name: the baseline a 0.8 em hang below that.
    expect(drawn(hanging.svg, "Tanaka")[0]!.y).toBeCloseTo(name!.y + name!.height + 6 + 12.5 * 0.8, 2);
    clearOfLabels(hanging.svg, hanging.chart.marks());
  });

  it("puts a slice's change outside the ring, past its label", async () => {
    const shots = [
      { outcome: "Goal", shots: 58 },
      { outcome: "Saved", shots: 112 },
      { outcome: "Off target", shots: 149 },
      { outcome: "Blocked", shots: 87 }
    ];
    const share = (change: number) => `${change > 0 ? "+" : ""}${(change * 100).toFixed(1)}%`;
    const chart = donutChart(container(), { label: "Shots", data: shots, category: "outcome", value: "shots", width: 640, motion: "off", on: { update: delta({ format: share }) } });
    const svg = chart.element;
    await chart.update({ data: shots.map((shot, i) => ({ ...shot, shots: shot.shots + [40, 0, -20, 10][i]! })) });
    // Saved's own value didn't change, so it has no update and no text.
    expect(["Goal", "Saved", "Off target", "Blocked"].map((key) => drawn(svg, key).map((text) => text.text))).toEqual([["+8.2%"], [], ["-7.1%"], ["+0.8%"]]);
    for (const key of ["Goal", "Off target", "Blocked"]) {
      const slice = byKey(chart.marks(), key);
      const [text] = drawn(svg, key);
      // Out from the slice's middle, past the farther of its label's two lines.
      const out = slice.angle(0.5) - Math.PI / 2;
      const along = (point: { x: number; y: number }) => (point.x - slice.center.x) * Math.cos(out) + (point.y - slice.center.y) * Math.sin(out);
      const corners = (box: Rect) => [box.x, box.x + box.width].flatMap((x) => [box.y, box.y + box.height].map((y) => along({ x, y })));
      const label = Math.max(...slice.labelBounds!.flatMap(corners));
      expect(Math.max(...corners(text!.box))).toBeGreaterThan(label);
      // Clear of the ring.
      const ring = Math.max(...[slice.start, slice.end].map((p) => Math.hypot(p.x - slice.pivot.x, p.y - slice.pivot.y))) + slice.thickness / 2;
      expect(Math.hypot(text!.x - slice.pivot.x, text!.y - slice.pivot.y)).toBeGreaterThan(ring);
    }
    clearOfLabels(svg, chart.marks());
  });

  it("puts a line's change past its end label, and a label meant for the line in only()", async () => {
    // The last leg is flat, so the line heads straight at its end label.
    const weeks: Week[] = [
      { week: 1, goals: 1 },
      { week: 2, goals: 3 },
      { week: 3, goals: 5 },
      { week: 4, goals: 5 }
    ];
    const lineOnly = (mark: MarkGeometry): boolean => mark.length > 0;
    const chart = lineChart<Week>(container(), {
      label: "Goals",
      data: weeks,
      x: "week",
      series: ["goals"],
      width: 600,
      motion: "off",
      on: { update: only(lineOnly, delta()), decorate: only(lineOnly, label((data) => `${data.samples.length} weeks`)) }
    });
    const svg = chart.element;
    const end = () => byKey(chart.marks(), "goals").labelBounds![0]!;
    const caption = () => drawn(svg, "goals").find((text) => text.text.endsWith("weeks"))!;
    expect(caption()).toMatchObject({ text: "4 weeks", anchor: "start" });
    expect(caption().x).toBeCloseTo(end().x + end().width + 6, 2);
    await chart.update({ data: weeks.map((w) => (w.week >= 3 ? { ...w, goals: 7 } : w)) });
    expect(drawn(svg, "goals").map((text) => text.text)).toEqual(["4 weeks", "+2"]);
    expect(drawn(svg, "goals")[1]!.x).toBeCloseTo(end().x + end().width + 6, 2);
    // Nothing on the points.
    expect(svg.querySelectorAll(`.ec-run[data-key^="goals@"] text`)).toHaveLength(0);
  });
});

describe("label from a field the chart doesn't plot", () => {
  interface Form {
    name: string;
    goals: number;
    vsLastMonth: string;
  }
  const form: Form[] = [
    { name: "Okafor", goals: 16, vsLastMonth: "+3" },
    { name: "Tanaka", goals: 6, vsLastMonth: "-1" }
  ];
  const vs = label<Form>((data) => data.datum.vsLastMonth);
  const texts = (svg: SVGSVGElement) => ["Okafor", "Tanaka"].map((key) => drawn(svg, key).map((text) => text.text));

  it("words a bar's label again when only its row changed, with no update event", async () => {
    const chart = barChart<Form>(container(), { label: "Form", data: form, y: "name", x: "goals", width: 600, motion: "off", on: { decorate: vs } });
    const updates = vi.fn();
    chart.on("update", updates);
    expect(texts(chart.element)).toEqual([["+3"], ["-1"]]);
    await chart.update({ data: form.map((row) => (row.name === "Tanaka" ? { ...row, vsLastMonth: "+2" } : row)) });
    expect(texts(chart.element)).toEqual([["+3"], ["+2"]]);
    expect(updates).not.toHaveBeenCalled();
  });

  it("words a slice's label again when only its row changed", async () => {
    const chart = donutChart<Form>(container(), { label: "Form", data: form, category: "name", value: "goals", width: 640, motion: "off", on: { decorate: vs } });
    expect(texts(chart.element)).toEqual([["+3"], ["-1"]]);
    await chart.update({ data: form.map((row) => ({ ...row, vsLastMonth: row.name === "Okafor" ? "+5" : row.vsLastMonth })) });
    expect(texts(chart.element)).toEqual([["+5"], ["-1"]]);
  });
});

describe("how far past the chart's edge the text reaches at 320 px", () => {
  // jsdom's estimate of the text's width, with a bar or a column at the end of its scale. Chrome's
  // own measure is in architecture.md (delta and label): 19.7, 20 and 17.6 px. The layouts leave room
  // for their own labels, not for these, so a page leaves this much beside the chart.
  function reach(svg: SVGSVGElement): { left: number; right: number; top: number; bottom: number } {
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    const keys = new Set(Array.from(svg.querySelectorAll(".ec-run[data-key]"), (run) => run.getAttribute("data-key")!));
    const boxes = [...keys].flatMap((key) => drawn(svg, key));
    expect(boxes.length).toBeGreaterThan(0);
    const most = (f: (box: Rect) => number) => Math.round(Math.max(...boxes.map((text) => f(text.box))) * 10) / 10;
    return { left: most((b) => -b.x), right: most((b) => b.x + b.width - width), top: most((b) => -b.y), bottom: most((b) => b.y + b.height - height) };
  }
  const goals = [
    { name: "Okafor", goals: 18 },
    { name: "Tanaka", goals: 6 },
    { name: "Lindqvist", goals: 10 }
  ];
  const changed = (rows: Player[], by: number) => rows.map((p) => ({ ...p, goals: p.goals + by }));
  async function bars(options: Partial<Parameters<typeof barChart<Player>>[1]>, data: Player[], by: number) {
    const chart = barChart<Player>(container(), { label: "Goals", data, width: 320, motion: "off", legend: false, on: { update: delta() }, ...options });
    await chart.update({ data: changed(data, by) });
    return reach(chart.element);
  }
  const negative = goals.map((p) => ({ ...p, goals: -p.goals }));

  it("bars: past the right edge; negative bars, past their names, past the left", async () => {
    expect((await bars({ y: "name", x: "goals" }, goals, 2)).right).toBeCloseTo(19, 1);
    expect((await bars({ y: "name", x: "goals" }, negative, -2)).left).toBeCloseTo(23, 1);
  });

  it("columns: above the top edge; negative columns stay inside", async () => {
    expect((await bars({ x: "name", y: "goals" }, goals, 2)).top).toBeCloseTo(14, 1);
    const hanging = await bars({ x: "name", y: "goals" }, negative, -2);
    expect(Math.max(hanging.left, hanging.right, hanging.top, hanging.bottom)).toBeLessThan(0);
  });

  it("slices and lines: inside", async () => {
    const shots = [
      { outcome: "Goal", shots: 58 },
      { outcome: "Saved", shots: 112 },
      { outcome: "Off target", shots: 149 },
      { outcome: "Blocked", shots: 87 }
    ];
    const donut = donutChart(container(), { label: "Shots", data: shots, category: "outcome", value: "shots", width: 320, motion: "off", legend: false, on: { update: delta({ format: (c) => `${(c * 100).toFixed(1)}%` }) } });
    await donut.update({ data: shots.map((shot, i) => ({ ...shot, shots: shot.shots + [40, 0, -20, 10][i]! })) });
    const ring = reach(donut.element);
    expect(Math.max(ring.left, ring.right, ring.top, ring.bottom)).toBeLessThan(0);

    const weeks: Week[] = [1, 2, 3, 4].map((week) => ({ week, goals: [0, 2, 3, 5][week - 1]! }));
    const line = lineChart<Week>(container(), { label: "Goals", data: weeks, x: "week", series: ["goals"], width: 320, motion: "off", legend: false, on: { update: only((mark) => mark.length > 0, delta()) } });
    await line.update({ data: weeks.map((w) => (w.week === 4 ? { ...w, goals: 7 } : w)) });
    const end = reach(line.element);
    expect(Math.max(end.left, end.right, end.top, end.bottom)).toBeLessThan(0);
  });
});

describe("delta and label on host marks", () => {
  it("put the text 10 px past the end of a mark with no labelBounds", async () => {
    const svg = document.body.appendChild(document.createElementNS(SVG, "svg"));
    const rects = players.map((p, i) => {
      const rect = svg.appendChild(document.createElementNS(SVG, "rect"));
      Object.assign(rect, { __data__: p });
      for (const [name, value] of Object.entries({ x: 0, y: i * 30, width: p.goals * 10, height: 20 })) rect.setAttribute(name, String(value));
      return rect;
    });
    const fx = expressive<Player>(rects, { key: (d) => d.name, value: (d) => d.goals, motion: "off", on: { update: delta({ value: (data) => data.datum.goals }) } });
    const okafor = { ...players[0]!, goals: 19 };
    Object.assign(rects[0]!, { __data__: okafor });
    rects[0]!.setAttribute("width", "190");
    fx.refresh();
    const mark = byKey(fx.marks(), "Okafor");
    expect(mark.labelBounds).toBeUndefined();
    expect(drawn(svg, "Okafor")).toMatchObject([{ text: "+3", x: 200, anchor: "start", y: 10 + 12.5 * 0.36 }]);

    // A slope drawn by the page, labelled with its change from first to last.
    const path = svg.appendChild(document.createElementNS(SVG, "path"));
    Object.assign(path, { __data__: { name: "Okafor", first: 3, last: 11 } });
    type Slope = { name: string; first: number; last: number };
    const change = (data: MarkData<Slope>) => `+${data.datum.last - data.datum.first}`;
    const slope = expressive<Slope>([path], {
      key: (d) => d.name,
      geometry: (_el, _d, key) => build.line({ key, points: [{ x: 20, y: 200 }, { x: 220, y: 200 }] }),
      motion: "off",
      on: { decorate: label(change) }
    });
    expect(slope.marks()[0]!.labelBounds).toBeUndefined();
    expect(drawn(svg, "Okafor").map((text) => [text.text, text.x])).toContainEqual(["+8", 230]);
  });
});
