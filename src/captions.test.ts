// delta and label on real marks: our charts' bars, columns, slices and lines, whose text goes past
// the marks' own labels (labelBounds), and host marks, which have none, so it goes 10 px past the end.
// And how far past the chart's edge the text reaches on a chart 320 px wide. This test brings charts
// and effects together, so it lives beside src/index.ts, the only module allowed to.

import { estimatedBox } from "./core/text-box";
import { captionPlace } from "./effects/caption";
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

  it("puts a line's label past its end label, its change past that label's text, and a label meant for the line in only()", async () => {
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
    // The decoration started first, so it keeps its place: the change goes 6 px past its text's box, as the chart measures it.
    expect(caption().x).toBeCloseTo(end().x + end().width + 6, 2);
    expect(drawn(svg, "goals")[1]!.x).toBeCloseTo(caption().x + 7 * CHARACTER + 0.16 * 12.5 + 6, 2);
    // Nothing on the points.
    expect(svg.querySelectorAll(`.ec-run[data-key^="goals@"] text`)).toHaveLength(0);
  });
});

describe("delta and label clear of other marks' labels", () => {
  interface Match {
    week: number;
    goals: number;
    xg: number;
  }
  // Goals and xG end 3 px apart, so their end labels are pushed apart, xG's above, and each line's last leg crosses the other's.
  const matches: Match[] = [
    { week: 1, goals: 1, xg: 1.4 },
    { week: 2, goals: 2, xg: 2.3 },
    { week: 3, goals: 4, xg: 4.1 },
    { week: 4, goals: 5, xg: 5.2 }
  ];
  /** Past `box` from a line heading up and right: wholly to its right, or wholly above it. */
  const past = (text: Rect, box: Rect): boolean => text.x >= box.x + box.width || text.y + text.height <= box.y;

  it.each([320, 600])("puts each of two lines' changes past the other's end label as well as its own, at %i px", async (width) => {
    const chart = lineChart<Match>(container(), {
      label: "Goals vs xG",
      data: matches,
      x: "week",
      series: ["goals", "xg"],
      width,
      motion: "off",
      on: { update: only((mark) => mark.length > 0, delta()) }
    });
    await chart.update({ data: matches.map((m) => (m.week === 4 ? { ...m, goals: 6, xg: 6.1 } : m)) });
    const goals = byKey(chart.marks(), "goals");
    const xg = byKey(chart.marks(), "xg");
    expect(goals.nearbyLabels).toEqual(xg.labelBounds);
    expect(xg.nearbyLabels).toEqual(goals.labelBounds);
    const [goalsText] = drawn(chart.element, "goals");
    const [xgText] = drawn(chart.element, "xg");
    expect([goalsText!.text, xgText!.text]).toEqual(["+1", `+${(0.9).toLocaleString()}`]);
    // Goals' heading climbs through xG's end label, above its own: its change goes past both.
    for (const box of [...goals.labelBounds!, ...xg.labelBounds!]) expect(past(goalsText!.box, box)).toBe(true);
    for (const box of [...xg.labelBounds!, ...goals.labelBounds!]) expect(past(xgText!.box, box)).toBe(true);
    clearOfLabels(chart.element, chart.marks());
  });

  it("keeps a slice's change clear of the other slices' labels, and one whose label is dropped past the labels its text meets along the ring", async () => {
    // Woodwork is too narrow for a label: its way runs along the ring at 12 o'clock, rightwards, into Goal's share, under Goal's name.
    const shots = [
      { outcome: "Goal", shots: 35 },
      { outcome: "Saved", shots: 20 },
      { outcome: "Off target", shots: 25 },
      { outcome: "Blocked", shots: 55 },
      { outcome: "Woodwork", shots: 5 }
    ];
    for (const width of [320, 640]) {
      const chart = donutChart(container(), { label: "Shots", data: shots, category: "outcome", value: "shots", width, motion: "off", on: { decorate: label(() => "+12.5%") } });
      const marks = chart.marks();
      expect(marks.map((mark) => mark.labelBounds!.length)).toEqual([2, 2, 2, 2, 0]);
      expect(byKey(marks, "Woodwork").nearbyLabels).toEqual(marks.flatMap((mark) => mark.labelBounds!));
      clearOfLabels(chart.element, marks);
    }
    const narrow = donutChart(container(), { label: "Shots", data: shots, category: "outcome", value: "shots", width: 320, motion: "off", on: { decorate: label(() => "+12.5%") } });
    const [woodwork] = drawn(narrow.element, "Woodwork");
    const [name, share] = byKey(narrow.marks(), "Goal").labelBounds!;
    expect(woodwork!.anchor).toBe("start");
    // Its way passes through Goal's share and more than 6 px under Goal's name, but its text would come within 6 px of the name:
    // so its box, as the chart measures it, goes 6 px past the name's right side, past the share too.
    expect(woodwork!.x).toBeCloseTo(name!.x + name!.width + 6 + 0.16 * 12.5, 2);
    expect(woodwork!.x).toBeGreaterThan(share!.x + share!.width + 6);
  });

  it("puts a negative column's change past its value label and its name, which no longer meet, with room too", async () => {
    const negative = players.map((p) => ({ ...p, goals: -p.goals }));
    for (const room of [0, 28]) {
      const chart = barChart<Player>(container(), { label: "Goals", data: negative, x: "name", y: "goals", width: 600, motion: "off", room, on: { update: delta() } });
      await chart.update({ data: negative.map((p) => (p.name === "Okafor" ? { ...p, goals: p.goals - 4 } : p)) });
      // Okafor's column, at -20, reaches the plot's bottom: its value label hangs into the room kept for it, above its name.
      const okafor = byKey(chart.marks(), "Okafor");
      expect(okafor.end.y).toBeCloseTo(Number(chart.element.getAttribute("height")) - 26 - 12.5 - 6 - room, 6);
      const [name, value] = okafor.labelBounds!;
      expect(overlaps(name!, value!)).toBe(false);
      expect(value!.y + value!.height).toBeLessThan(name!.y);
      const [text] = drawn(chart.element, "Okafor");
      expect(text!.y).toBeCloseTo(name!.y + name!.height + 6 + 12.5 * 0.8, 2);
      clearOfLabels(chart.element, chart.marks());
      for (const mark of chart.marks()) expect(mark.nearbyLabels).toBeUndefined();
    }
  });

  it("leaves a chart with no negative column as it was: its names 18 px below the plot", async () => {
    const chart = barChart<Player>(container(), { label: "Goals", data: players, x: "name", y: "goals", width: 600, motion: "off", on: { update: delta() } });
    // The axis's 26 px below the plot, and the names 18 px down it.
    expect(chart.labels().filter((l) => l.role === "category").map((l) => l.y)).toEqual([300 - 26 + 18, 300 - 26 + 18, 300 - 26 + 18]);
    await chart.update({ data: players.map((p) => (p.name === "Tanaka" ? { ...p, goals: p.goals + 2 } : p)) });
    const [, value] = byKey(chart.marks(), "Tanaka").labelBounds!;
    expect(drawn(chart.element, "Tanaka")[0]!.y).toBeCloseTo(value!.y - 6, 2);
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

describe("delta and label clear of other effects' text (texts)", () => {
  interface Match {
    week: number;
    goals: number;
    xg: number;
  }
  // Goals and xG end 3 px apart and climb the same way, so their changes would meet past the end labels.
  const matches: Match[] = [
    { week: 1, goals: 1, xg: 1.4 },
    { week: 2, goals: 2, xg: 2.3 },
    { week: 3, goals: 4, xg: 4.1 },
    { week: 4, goals: 5, xg: 5.2 }
  ];
  const lineOnly = (mark: MarkGeometry): boolean => mark.length > 0;
  /** The caption's place alone, with nothing held before it: its text's own box, as jsdom estimates it. */
  const alone = (mark: MarkGeometry, content: string) => captionPlace(mark, { held: [], box: (style) => estimatedBox(content, style) });

  it.each([320, 1000])("puts the second of two lines' changes past the first's, and both past both end labels, at %i px, through a change and a resize", async (width) => {
    const chart = lineChart<Match>(container(), { label: "Goals vs xG", data: matches, x: "week", series: ["goals", "xg"], width, motion: "off", on: { update: only(lineOnly, delta()) } });
    const check = (): void => {
      const [goalsText] = drawn(chart.element, "goals");
      const [xgText] = drawn(chart.element, "xg");
      const [goals, xg] = [byKey(chart.marks(), "goals"), byKey(chart.marks(), "xg")];
      // Goals started first: it keeps the place it has alone. xG's would be on it, and goes past it.
      expect(goalsText!.x).toBeCloseTo(alone(goals, goalsText!.text).at.x, 2);
      expect(goalsText!.y).toBeCloseTo(alone(goals, goalsText!.text).at.y, 2);
      const place = alone(xg, xgText!.text);
      expect(overlaps(drawn(chart.element, "goals")[0]!.box, { ...xgText!.box, x: xgText!.box.x - xgText!.x + place.at.x, y: xgText!.box.y - xgText!.y + place.at.y })).toBe(true);
      expect(overlaps(goalsText!.box, xgText!.box)).toBe(false);
      clearOfLabels(chart.element, chart.marks());
    };
    await chart.update({ data: matches.map((m) => (m.week === 4 ? { ...m, goals: 6, xg: 6.1 } : m)) });
    expect(drawn(chart.element, "xg").map((text) => text.text)).toEqual([`+${(0.9).toLocaleString()}`]);
    check();
    // A resize moves both lines: each change is placed again, goals' first.
    await chart.update({ width: width + 80 });
    check();
    await chart.update({ data: matches.map((m) => (m.week === 4 ? { ...m, goals: 7, xg: 7.2 } : m)) });
    check();
  });

  /** The season page's matchweeks: demo/season.ts's seeded season, its goals and xG so far. */
  function season(): { week: number; totalGoals: number; totalXg: number }[] {
    let seed = 670;
    const random = (): number => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const weeks: { week: number; totalGoals: number; totalXg: number }[] = [];
    let totalGoals = 0;
    let totalXg = 0;
    for (let i = 0; i < 38; i++) {
      const xg = Math.round((0.6 + random() * 1.9) * 10) / 10;
      const lambda = xg * (i < 12 ? 0.8 : i < 26 ? 1.25 : 0.8);
      let goals = -1;
      for (let p = 1; p > Math.exp(-lambda); goals++) p *= random();
      // Each goal's scorer, and the shots: draws the page makes that this test doesn't need.
      for (let draw = 0; draw <= goals; draw++) random();
      totalGoals += goals;
      totalXg = Math.round((totalXg + xg) * 10) / 10;
      weeks.push({ week: i + 1, totalGoals, totalXg });
    }
    return weeks;
  }

  it.each([
    [320, 31],
    [1000, 17]
  ])("keeps the season page's goals and xG changes inside the chart's width, clear of each other and of both end labels, with room: 60, at %i px", async (width, rise) => {
    const weeks = season();
    // The page's own example: "Season to date: 43 goals +2, 39.7 xG +1.8."
    expect(weeks[24]).toEqual({ week: 25, totalGoals: 43, totalXg: 39.7 });
    const height = 270;
    const chart = lineChart(container(), {
      label: "Goals vs expected goals, season to date",
      data: weeks.slice(0, 24),
      x: "week",
      series: ["totalGoals", "totalXg"],
      labels: (value, series) => (series === "totalXg" ? `${value.toFixed(1)} xG` : `${Math.round(value)} goals`),
      width,
      height,
      room: 60,
      motion: "off",
      on: { update: only(lineOnly, delta()) }
    });
    let both = 0;
    let above = 0;
    for (let now = 25; now <= 38; now++) {
      await chart.update({ data: weeks.slice(0, now) });
      const changes = [...drawn(chart.element, "totalGoals"), ...drawn(chart.element, "totalXg")];
      if (changes.length === 2) {
        both++;
        expect(overlaps(changes[0]!.box, changes[1]!.box), `matchweek ${now}`).toBe(false);
      }
      for (const { box, text } of changes) {
        expect(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= height, `matchweek ${now} "${text}"`).toBe(true);
        above = Math.max(above, -box.y);
      }
      clearOfLabels(chart.element, chart.marks());
    }
    // The matchweeks where both change: on main their changes met in 5 of them at 1,000 px and 8 at 320 (M10 step 6).
    expect(both).toBe(9);
    // Where a line ends at the top of the plot heading up, its text rises past the end labels above the chart's top, into the
    // page above it: a number of room keeps space only to the right (the next test keeps it above too). On main the goals line's
    // change alone rose 11.7 px at 320 and 5.4 at 1,000; xG's, past it, rises further.
    expect(above).toBeGreaterThan(0);
    expect(above).toBeLessThan(rise);
  });

  it.each([
    [320, 40],
    [320, 60],
    [1000, 60]
  ])("keeps the season page's goals and xG changes inside the chart at every matchweek at %i px, with room: { right: %i, top: 40 }", async (width, right) => {
    const weeks = season();
    const height = 270;
    const top = 40;
    const chart = lineChart(container(), {
      label: "Goals vs expected goals, season to date",
      data: weeks.slice(0, 24),
      x: "week",
      series: ["totalGoals", "totalXg"],
      labels: (value, series) => (series === "totalXg" ? `${value.toFixed(1)} xG` : `${Math.round(value)} goals`),
      width,
      height,
      room: { right, top },
      motion: "off",
      on: { update: only(lineOnly, delta()) }
    });
    let both = 0;
    let highest = Infinity;
    for (let now = 25; now <= 38; now++) {
      await chart.update({ data: weeks.slice(0, now) });
      const changes = [...drawn(chart.element, "totalGoals"), ...drawn(chart.element, "totalXg")];
      if (changes.length === 2) {
        both++;
        expect(overlaps(changes[0]!.box, changes[1]!.box), `matchweek ${now}`).toBe(false);
      }
      for (const { box, text } of changes) {
        expect(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height, `matchweek ${now} "${text}"`).toBe(true);
        highest = Math.min(highest, box.y);
      }
      clearOfLabels(chart.element, chart.marks());
    }
    expect(both).toBe(9);
    // The text still rises above the plot, whose top is 12 + 40 px down: into the room kept for it, not past the chart's top.
    expect(highest).toBeLessThan(12 + top);
  });

  describe("a slice whose label is dropped, on 1,500 random donuts", () => {
    // As M10 step 3's probe: 2 to 9 slices of 1 to 100, 240 to 800 px wide, each with a 6-character change. Main's code put 61
    // of the 963 slices whose label was dropped on another slice's label (M10 step 3's own probe: 63 of 592), and 275 changes on
    // another's change.
    let seed = 7;
    const random = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const donuts = Array.from({ length: 1500 }, () => {
      const count = 2 + Math.floor(random() * 8);
      const data = Array.from({ length: count }, (_, i) => ({ outcome: `Cat ${i}`, shots: 1 + Math.floor(random() * 100) }));
      return { data, width: 240 + Math.floor(random() * 560) };
    });

    it.each([0, 1, 2])("puts its text on no other slice's label, nor any change on another: donuts %i of 3", (third) => {
      let dropped = 0;
      for (const { data, width } of donuts.slice(third * 500, third * 500 + 500)) {
        const chart = donutChart(container(), { label: "Shots", data, category: "outcome", value: "shots", width, motion: "off", on: { decorate: label(() => "+12.5%") } });
        const marks = chart.marks();
        const texts = marks.map((mark) => drawn(chart.element, mark.key)[0]!.box);
        marks.forEach((mark, i) => {
          if (mark.labelBounds!.length === 0) dropped++;
          const others = marks.filter((other) => other !== mark);
          for (const box of others.flatMap((other) => other.labelBounds!)) expect(overlaps(texts[i]!, box), `${width} px, ${mark.key}`).toBe(false);
          for (const other of others) expect(overlaps(texts[i]!, texts[marks.indexOf(other)]!), `${width} px, ${mark.key} on ${other.key}`).toBe(false);
        });
        chart.destroy();
      }
      expect(dropped).toBe([299, 330, 334][third]);
    });
  });
});

describe("how far past the chart's edge the text reaches at 320 px", () => {
  // jsdom's estimate of the text's width, with a bar or a column at the end of its scale. Chrome's
  // own measure is in architecture.md (delta and label): 19.7, 20 and 17.6 px. The layouts leave room
  // for their own labels, not for these, unless barChart's `room` keeps it.
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

  it("columns: above the top edge; negative columns, past their names, below the bottom edge", async () => {
    expect((await bars({ x: "name", y: "goals" }, goals, 2)).top).toBeCloseTo(14, 1);
    // The names are below the room kept for the value labels, so the change hanging past them reaches past the bottom.
    expect((await bars({ x: "name", y: "goals" }, negative, -2)).bottom).toBeCloseTo(13.6, 1);
  });

  it("with room: 28, bars, negative bars, columns and negative columns all stay inside", async () => {
    for (const [options, data, by] of [
      [{ y: "name", x: "goals" }, goals, 2],
      [{ y: "name", x: "goals" }, negative, -2],
      [{ x: "name", y: "goals" }, goals, 2],
      [{ x: "name", y: "goals" }, negative, -2]
    ] as const) {
      const edges = await bars({ ...options, room: 28 }, data, by);
      expect(Math.max(edges.left, edges.right, edges.top, edges.bottom), `${options.x} ${by}`).toBeLessThan(0);
    }
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
