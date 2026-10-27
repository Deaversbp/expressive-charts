import { describe as build } from "./describe";
import { samplesAlong } from "./samples";

// Cumulative goals over five weeks, as a D3 line draws them: x 40 px a week, y 4 px a goal up from 200.
const weeks = [
  { week: 1, goals: 0 },
  { week: 2, goals: 3 },
  { week: 3, goals: 3 },
  { week: 4, goals: 10 },
  { week: 5, goals: 12 }
];
const x = (week: number): number => 40 * week;
const y = (goals: number): number => 200 - 4 * goals;
const vertices = weeks.map((d) => ({ x: x(d.week), y: y(d.goals) }));
const line = build.line({ key: "goals", series: "goals", points: vertices, width: 2 });
/** Distance along the line to each vertex. */
const along = vertices.map((_, i) => vertices.slice(1, i + 1).reduce((sum, p, j) => sum + Math.hypot(p.x - vertices[j]!.x, p.y - vertices[j]!.y), 0));

describe("samplesAlong", () => {
  it("puts the points that drew a line at its vertices, exactly, with their values and x", () => {
    const samples = samplesAlong(
      line,
      weeks.map((d) => ({ x: x(d.week), y: y(d.goals), value: d.goals, at: d.week }))
    );
    expect(samples.map((s) => [s.value, s.at])).toEqual(weeks.map((d) => [d.goals, d.week]));
    samples.forEach((sample, i) => expect(sample.t).toBeCloseTo(along[i]! / line.length, 12));
    // The ends land on exactly 0 and 1.
    expect(samples[0]!.t).toBe(0);
    expect(samples[4]!.t).toBe(1);
  });

  it("puts a point between vertices, or off the line, at the walk's nearest point", () => {
    // Half-way along week 3 to 4 (on the line), and 5 px off it, square to that leg.
    const leg = { from: vertices[2]!, to: vertices[3]! };
    const mid = { x: (leg.from.x + leg.to.x) / 2, y: (leg.from.y + leg.to.y) / 2 };
    const length = Math.hypot(leg.to.x - leg.from.x, leg.to.y - leg.from.y);
    const normal = { x: (leg.to.y - leg.from.y) / length, y: -(leg.to.x - leg.from.x) / length };
    const expected = (along[2]! + length / 2) / line.length;
    const [on, off] = [
      samplesAlong(line, [{ ...mid, value: 6.5 }]),
      samplesAlong(line, [{ x: mid.x + 5 * normal.x, y: mid.y + 5 * normal.y, value: 6.5 }])
    ];
    // On the line it's exact; off it, the nearest point is a flat minimum, found to well under 1e-6 px.
    expect(on[0]!.t * line.length).toBeCloseTo(expected * line.length, 9);
    expect(off[0]!.t * line.length).toBeCloseTo(expected * line.length, 6);
    expect(on[0]).not.toHaveProperty("at");
  });

  it("returns samples in t order, whatever order the points come in, and clamps past the ends", () => {
    const samples = samplesAlong(line, [
      { x: x(4), y: y(10), value: 10, at: "w4" },
      { x: -50, y: 200, value: -1, at: "before" },
      { x: x(2), y: y(3), value: 3, at: "w2" },
      { x: 400, y: 0, value: 99, at: "after" },
      { x: x(2), y: y(3), value: 3.5, at: "w2 again" }
    ]);
    expect(samples.map((s) => s.at)).toEqual(["before", "w2", "w2 again", "w4", "after"]);
    expect(samples[0]!.t).toBe(0);
    expect(samples[4]!.t).toBe(1);
  });

  it("finds the nearer arm of a walk that comes back on itself", () => {
    // Out 100 px along y = 0, down 10 px, and back along y = 10.
    const hairpin = build.line({ key: "u", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 0, y: 10 }] });
    const [out, back] = samplesAlong(hairpin, [
      { x: 30, y: 4, value: 1 },
      { x: 30, y: 6, value: 2 }
    ]);
    expect(out!.t * 210).toBeCloseTo(30, 6);
    expect(back!.t * 210).toBeCloseTo(180, 6);
  });

  it("works on any walk: around a slice's mid-radius arc", () => {
    // A quarter turn from 12 o'clock to 3 o'clock, mid-radius 100.
    const slice = build.arc({ key: "Saved", cx: 0, cy: 0, inner: 80, outer: 120, start: 0, end: Math.PI / 2 });
    const at = (angle: number, radius: number) => ({ x: radius * Math.sin(angle), y: -radius * Math.cos(angle) });
    const samples = samplesAlong(slice, [
      { ...at(Math.PI / 6, 100), value: 1 },
      { ...at(Math.PI / 3, 115), value: 2 }
    ]);
    expect(samples[0]!.t * slice.length).toBeCloseTo(slice.length / 3, 9);
    expect(samples[1]!.t * slice.length).toBeCloseTo((2 * slice.length) / 3, 6);
  });

  it("gives every point t = 0 on a mark with no length (a dot)", () => {
    const dot = build.point({ key: "goals@3", x: 120, y: 188, r: 4.5 });
    expect(samplesAlong(dot, [{ x: 0, y: 0, value: 3 }, { x: 120, y: 188, value: 4 }]).map((s) => s.t)).toEqual([0, 0]);
    expect(samplesAlong(line, [])).toEqual([]);
  });

  it("throws on points that aren't finite, and on a mark that isn't a geometry", () => {
    expect(() => samplesAlong(line, [{ x: 0, y: Number.NaN, value: 1 }])).toThrow(/points\[0\]\.y must be a finite number, got NaN/);
    expect(() => samplesAlong(line, [{ x: 0, y: 0, value: 1 }, { x: 0, y: 0, value: Infinity }])).toThrow(RangeError);
    expect(() => samplesAlong(line, [{ x: 0, y: 0 } as never])).toThrow(/points\[0\]\.value/);
    expect(() => samplesAlong(line, "points" as never)).toThrow(TypeError);
    expect(() => samplesAlong({} as never, [])).toThrow(/needs a MarkGeometry/);
  });
});

describe("samplesAlong on a line with gaps", () => {
  // Weeks 1 to 7 with no goals counted in week 3 or week 6: a D3 line drawn with .defined(), described by its defined points.
  const season = [
    { week: 1, goals: 0 },
    { week: 2, goals: 3 },
    { week: 4, goals: 10 },
    { week: 5, goals: 12 },
    { week: 7, goals: 15 }
  ];
  const points = season.map((d) => ({ x: x(d.week), y: y(d.goals), value: d.goals, at: d.week }));
  const gapped = build.line({ key: "goals", series: "goals", points, breaks: [2, 4], width: 2 });

  it("sets gapBefore on the first sample after each gap, and on no other", () => {
    const samples = samplesAlong(gapped, points);
    expect(samples.map((s) => s.at)).toEqual([1, 2, 4, 5, 7]);
    expect(samples.map((s) => s.gapBefore === true)).toEqual([false, false, true, false, true]);
    // Only where it's true, so a mark with no gaps gives the samples it always did.
    expect(samples.filter((s) => "gapBefore" in s)).toHaveLength(2);
    expect(samplesAlong(line, weeks.map((d) => ({ x: x(d.week), y: y(d.goals), value: d.goals }))).some((s) => "gapBefore" in s)).toBe(false);
  });

  it("puts each sample where it is on the walk, which runs straight across the gaps", () => {
    const samples = samplesAlong(gapped, points);
    expect(samples[1]!.t).toBeCloseTo(gapped.gaps![0]![0], 12);
    expect(samples[2]!.t).toBeCloseTo(gapped.gaps![0]![1], 12);
    expect(samples[4]!.t).toBe(1);
  });

  it("finds the first sample past a gap's middle whatever order the points come in, and with points between", () => {
    const shuffled = [points[4]!, points[2]!, points[0]!, points[3]!, points[1]!];
    expect(samplesAlong(gapped, shuffled).map((s) => s.gapBefore === true)).toEqual([false, false, true, false, true]);
    // A point a host put inside the first gap, past its middle: it's the first sample after the gap.
    const [from, to] = gapped.gaps![0]!;
    const late = gapped.path(from + 0.8 * (to - from));
    expect(samplesAlong(gapped, [...points, { ...late, value: 7, at: 3 }]).map((s) => [s.at, s.gapBefore === true])).toEqual([
      [1, false],
      [2, false],
      [3, true],
      [4, false],
      [5, false],
      [7, true]
    ]);
  });

  it("marks one gap once, when two gaps lie between neighbouring samples", () => {
    const sparse = samplesAlong(gapped, [points[0]!, points[4]!]);
    expect(sparse.map((s) => s.gapBefore === true)).toEqual([false, true]);
  });

  it("never marks the first sample, even after a value alone at the start", () => {
    const lone = build.line({ key: "goals", points, breaks: [1] });
    expect(samplesAlong(lone, points.slice(1)).map((s) => s.gapBefore === true)).toEqual([false, false, false, false]);
    expect(samplesAlong(lone, points).map((s) => s.gapBefore === true)).toEqual([false, true, false, false, false]);
  });
});
