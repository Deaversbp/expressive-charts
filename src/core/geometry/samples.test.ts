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
