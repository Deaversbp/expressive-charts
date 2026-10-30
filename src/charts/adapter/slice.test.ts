import { arc, pie } from "d3-shape";
import { parsePath } from "../../core/geometry/path";
import { sliceOf } from "./slice";

const TURN = 2 * Math.PI;
const IDENTITY = [1, 0, 0, 1, 0, 0] as const;
const read = (d: string, m: readonly [number, number, number, number, number, number] = IDENTITY) => sliceOf(parsePath(d), [...m]);

describe("sliceOf", () => {
  it("reads a thin slice's centre from its sides, which hold however narrow it is", () => {
    // One shot in ten thousand: its arcs are 0.07 px long, too short to say where their own centres are.
    const slices = pie<number>()([1, 9_999]);
    for (const inner of [0, 70]) {
      const spec = read(arc<{ startAngle: number; endAngle: number }>().innerRadius(inner).outerRadius(116)(slices[0]!)!);
      expect(spec).toBeDefined();
      expect(Math.hypot(spec!.cx, spec!.cy)).toBeLessThan(0.01);
      expect([spec!.inner, spec!.outer]).toEqual([inner, 116]);
      expect(spec!.end - spec!.start).toBeCloseTo(slices[0]!.endAngle - slices[0]!.startAngle, 4);
    }
  });

  it("reads a slice whose arc is split, or whose path starts part way along it, as one arc", () => {
    const whole = { cx: 0, cy: 0, inner: 50, outer: 80, start: 0, end: Math.PI };
    expect(read("M0,-80A80,80 0 0 1 80,0A80,80 0 0 1 0,80L0,50A50,50 0 0 0 0,-50Z")).toEqual(whole);
    // From 3 o'clock: the outer arc runs on across the path's start.
    const from3 = read("M80,0A80,80 0 0 1 0,80L0,50A50,50 0 0 0 0,-50L0,-80A80,80 0 0 1 80,0Z")!;
    expect([from3.cx, from3.cy, from3.inner, from3.outer]).toEqual([0, 0, 50, 80]);
    expect(from3.start).toBeCloseTo(0, 12);
    expect(from3.end).toBeCloseTo(Math.PI, 12);
  });

  it("reads a donut's padded slices as slices while their sides are within 0.5 px of radii, and as nothing past that", () => {
    const shape = arc<{ startAngle: number; endAngle: number; padAngle: number }>().innerRadius(70).outerRadius(116);
    const padded = (pad: number) => pie<number>().padAngle(pad)([58, 112, 149, 87]).map((slice) => read(shape(slice)!));
    // 0.01 rad leaves a gap of 1.2 px at the outer edge, its sides within 0.5 px of radii; 0.04, 4.6 px.
    expect(padded(0.01).every((spec) => spec !== undefined)).toBe(true);
    expect(padded(0.04).every((spec) => spec === undefined)).toBe(true);
  });

  it("reads a donut's slice so thin that its inner arc rounds away to a point about the donut's centre", () => {
    // d3.arc() writes 3 decimals, so the inner arc of a slice one millionth of the ring starts and ends at one point.
    const [sliver] = pie<number>().sort(null)([1, 300_000, 700_000]);
    const d = arc<{ startAngle: number; endAngle: number }>().innerRadius(70).outerRadius(116)(sliver!)!;
    expect(d).toMatch(/A70,70,0,0,0,0,-70Z$/);
    const spec = read(d)!;
    expect(Math.hypot(spec.cx, spec.cy)).toBeLessThan(0.01);
    expect([spec.inner, spec.outer]).toEqual([70, 116]);
    // A pie's sliver has its sides meet at the centre.
    expect(read(arc<{ startAngle: number; endAngle: number }>().innerRadius(0).outerRadius(116)(sliver!)!)).toMatchObject({ cx: 0, cy: 0, inner: 0, outer: 116 });
  });

  it("reads a whole ring whose circles are each written in two unequal arcs, or in three", () => {
    const whole = { cx: 0, cy: 0, inner: 50, outer: 80, start: 0, end: TURN };
    // A quarter turn, then three quarters.
    expect(read("M0,-80A80,80 0 0 1 80,0A80,80 0 1 1 0,-80Z M0,-50A50,50 0 0 0 -50,0A50,50 0 1 0 0,-50Z")).toEqual(whole);
    // Three thirds round, each way.
    const third = (r: number, deg: number) => `${(r * Math.sin((deg * Math.PI) / 180)).toFixed(3)},${(-r * Math.cos((deg * Math.PI) / 180)).toFixed(3)}`;
    const thirds = `M${third(80, 0)}A80,80 0 0 1 ${third(80, 120)}A80,80 0 0 1 ${third(80, 240)}A80,80 0 0 1 ${third(80, 0)}M${third(50, 0)}A50,50 0 0 0 ${third(50, 240)}A50,50 0 0 0 ${third(50, 120)}A50,50 0 0 0 ${third(50, 0)}Z`;
    const spec = read(thirds)!;
    expect(Math.hypot(spec.cx, spec.cy)).toBeLessThan(0.01);
    expect([spec.inner, spec.outer, spec.start, spec.end]).toEqual([50, 80, 0, TURN]);
  });

  it("reads whole rings and half-turn slices whatever their start, though a half turn's own centre is unsure by d3's rounding", () => {
    const shape = arc<{ startAngle: number; endAngle: number }>().outerRadius(116);
    for (let degrees = 0; degrees < 360; degrees += 1.7) {
      const start = (degrees * Math.PI) / 180;
      for (const [inner, turn] of [
        [70, TURN],
        [70, Math.PI],
        [0, Math.PI]
      ] as const) {
        const spec = read(shape.innerRadius(inner)({ startAngle: start, endAngle: start + turn })!);
        expect(spec, `${inner} ${turn} from ${degrees}°`).toBeDefined();
        expect(Math.hypot(spec!.cx, spec!.cy)).toBeLessThan(0.01);
        expect(Math.abs(spec!.inner - inner) + Math.abs(spec!.outer - 116)).toBeLessThan(0.01);
        expect(Math.abs(spec!.start - start) * 116).toBeLessThan(0.01);
        expect(Math.abs(spec!.end - spec!.start - turn) * 116).toBeLessThan(0.01);
      }
    }
  });

  it("moves the slice through its matrix: turned, scaled and flipped, and nothing through one that stretches or skews", () => {
    const d = "M0,-80A80,80 0 0 1 80,0L50,0A50,50 0 0 0 0,-50Z";
    const turned = read(d, [0, 1, -1, 0, 10, 20])!;
    expect([turned.cx, turned.cy, turned.inner, turned.outer]).toEqual([10, 20, 50, 80]);
    expect([turned.start, turned.end - turned.start]).toEqual([Math.PI / 2, Math.PI / 2]);
    const flipped = read(d, [-2, 0, 0, 2, 0, 0])!;
    expect([flipped.inner, flipped.outer, flipped.start, flipped.end]).toEqual([100, 160, 0, -Math.PI / 2]);
    expect(read(d, [2, 0, 0, 1, 0, 0])).toBeUndefined();
    expect(read(d, [1, 0, 0.2, 1, 0, 0])).toBeUndefined();
  });

  it("reads nothing from paths that aren't a ring's slice", () => {
    for (const d of [
      // A slice of no angle, which d3.arc() draws as a line there and back.
      "M0,-116L0,0Z",
      "M0,-116L0,-70Z",
      // A disc, a circular segment, a triangle, an open slice, and a ring with a gap.
      "M0,-80A80,80 0 1 1 0,80A80,80 0 1 1 0,-80Z",
      "M0,-80A80,80 0 0 1 80,0Z",
      "M0,-80L80,0L0,0Z",
      "M0,-80A80,80 0 0 1 80,0L0,0",
      "M0,-80A80,80 0 1 1 0,80A80,80 0 0 1 -80,0M0,-50A50,50 0 1 0 0,50A50,50 0 1 0 0,-50Z",
      // Arcs about two centres, and three subpaths.
      "M0,-80A80,80 0 0 1 80,0L60,0A50,50 0 0 0 10,-50Z",
      "M0,-80A80,80 0 1 1 0,80A80,80 0 1 1 0,-80M0,-50A50,50 0 1 0 0,50A50,50 0 1 0 0,-50ZM0,-20A20,20 0 1 1 0,20A20,20 0 1 1 0,-20Z"
    ]) {
      expect(read(d), d).toBeUndefined();
    }
  });

  it("gives d3.pie()'s angles: from 0 at 12 o'clock to a whole turn", () => {
    const [first, second] = pie<number>().sort(null)([1, 3]);
    const shape = arc<{ startAngle: number; endAngle: number }>().innerRadius(40).outerRadius(80);
    const a = read(shape(first!)!)!;
    const b = read(shape(second!)!)!;
    expect(a.start).toBe(0);
    expect(a.end).toBeCloseTo(TURN / 4, 4);
    expect(b.start).toBeCloseTo(TURN / 4, 4);
    expect(b.end).toBeCloseTo(TURN, 4);
  });
});
