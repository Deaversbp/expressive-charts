import { arc, area, curveMonotoneX, line } from "d3-shape";
import type { Matrix } from "../../contracts/drawing";
import type { Point } from "../../contracts/geometry";
import { measurePath } from "../../testing";
import { flattenPath } from "../flatten";
import { matrix } from "../matrix";
import { parsePath } from "../path";
import { pointOn } from "../segment";
import { describe as build } from "./index";

const expectPoint = (actual: Point | undefined, expected: Point, digits = 9): void => {
  expect(actual).toBeDefined();
  expect(actual!.x).toBeCloseTo(expected.x, digits);
  expect(actual!.y).toBeCloseTo(expected.y, digits);
};

/** Goals by week, with weeks 3, 7 and 9 missing, so week 8 is alone between gaps. */
const weeks = [3, 5, null, 9, 8, 12, null, 14, null, 11, 15].map((value, i) => ({ x: 40 * i, value }));
type Week = (typeof weeks)[number];
const x = (w: Week): number => w.x;
const y = (w: Week): number => 200 - 10 * w.value!;
const curve = (): string => line<Week>().x(x).y(y).curve(curveMonotoneX)(weeks.filter((w) => w.value !== null))!;
const gappedCurve = (): string => line<Week>().defined((w) => w.value !== null).x(x).y(y).curve(curveMonotoneX)(weeks)!;
const filled = (): string => area<Week>().defined((w) => w.value !== null).x(x).y0(200).y1(y).curve(curveMonotoneX)(weeks.slice(3, 6))!;

/** The signed area of a polygon: more than 0 when it runs clockwise on screen. */
const signedArea = (points: readonly Point[]): number =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + (p.x * q.y - q.x * p.y) / 2;
  }, 0);

/** The signed area of each subpath of path data, from 16 points on each of its pieces. */
const subpathAreas = (d: string): number[] =>
  flattenPath(parsePath(d)).map((subpath) => signedArea(subpath.segments.flatMap((segment) => Array.from({ length: 16 }, (_, k) => pointOn(segment, k / 16)))));

describe("describe.shape on an open path", () => {
  it("walks the path from its first point to its last, through every point it drew", () => {
    const m = build.shape({ key: "goals", series: "goals", d: curve(), width: 2 });
    const values = weeks.filter((w) => w.value !== null);
    expect(m.key).toBe("goals");
    expect(m.series).toBe("goals");
    expect(m.start).toEqual({ x: 0, y: 170 });
    expect(m.end).toEqual({ x: 400, y: 50 });
    expect(m.gaps).toBeUndefined();
    // curveMonotoneX passes through each point, and the flattening keeps the ends of each curve.
    const walked = measurePath(m.slice(0, 1)).points;
    for (const w of values) expect(walked).toContainEqual({ x: x(w), y: y(w) });
    expect(m.length).toBeGreaterThan(400);
  });

  it("has an open outline, the stroke, and thickness, bounds, centre and pivot as describe.line's", () => {
    const m = build.shape({ key: "goals", d: curve(), width: 2 });
    expect(m.outline.closed).toBe(false);
    expect(m.outline.d).toBe(m.slice(0, 1));
    expect(m.outline.sample(10)[0]).toEqual(m.start);
    expect(m.thickness).toBe(2);
    expect(m.pivot).toEqual(m.start);
    expect(m.center).toEqual(m.path(0.5));
    const box = m.bounds;
    expect(box.x).toBe(-1);
    expect(box.width).toBe(402);
    for (let t = 0; t <= 1; t += 0.01) {
      const p = m.path(t);
      expect(p.y).toBeGreaterThanOrEqual(box.y + 1);
      expect(p.y).toBeLessThanOrEqual(box.y + box.height - 1);
    }
    expect(build.shape({ key: "goals", d: curve() }).thickness).toBe(1);
  });

  it("describes a straight line as describe.line does, value alone and all", () => {
    const linear = line<Week>()
      .defined((w) => w.value !== null)
      .x(x)
      .y(y)(weeks)!;
    const values = weeks.filter((w) => w.value !== null);
    const breaks = values.flatMap((w, i) => (i > 0 && weeks.indexOf(w) !== weeks.indexOf(values[i - 1]!) + 1 ? [i] : []));
    const shape = build.shape({ key: "goals", d: linear, width: 2 });
    const polyline = build.line({ key: "goals", points: values.map((w) => ({ x: x(w), y: y(w) })), breaks, width: 2 });
    for (const field of ["start", "end", "length", "gaps", "thickness", "bounds", "center", "pivot"] as const) expect(shape[field], field).toEqual(polyline[field]);
    expect(shape.slice(0, 1)).toBe(polyline.slice(0, 1));
    expect(shape.slice(0.2, 0.7)).toBe(polyline.slice(0.2, 0.7));
    expect(shape.outline.sample(24)).toEqual(polyline.outline.sample(24));
  });

  it("gives a line drawn with d3's .defined() a gap at each later move", () => {
    const m = build.shape({ key: "goals", d: gappedCurve(), width: 2 });
    // Weeks 2 to 4, 6 to 8, and 8 to 10, with week 8 alone between the last two.
    expect(m.gaps).toHaveLength(3);
    expectPoint(m.path(m.gaps![0]![0]), { x: 40, y: 150 });
    expectPoint(m.path(m.gaps![0]![1]), { x: 120, y: 110 });
    expectPoint(m.path(m.gaps![1]![1]), { x: 280, y: 60 });
    expect(m.gaps![2]![0]).toBe(m.gaps![1]![1]);
    expectPoint(m.path(m.gaps![2]![1]), { x: 360, y: 90 });
    // The stroke leaves the gaps out: a run from each gap's end, and nothing for week 8 alone.
    const moves = measurePath(m.outline.d).commands.filter((command) => command.op === "M");
    expect(moves.map((move) => move.args)).toEqual([
      [0, 170],
      [120, 110],
      [360, 90]
    ]);
    expect(measurePath(m.slice(0, 1)).length).toBeCloseTo(m.length - m.gaps!.reduce((sum, [from, to]) => sum + (to - from) * m.length, 0), 2);
  });

  it("reads every path command, relative or absolute, the same", () => {
    const absolute = build.shape({ key: "a", d: "M10,10 L20,10 H30 V20 C40,20 40,30 30,30 S20,40 10,40 Q0,40 0,30 T10,10 A5,5 0 0 1 20,10 M40,40 L50,50" });
    const relative = build.shape({ key: "a", d: "m10,10 l10,0 h10 v10 c10,0 10,10 0,10 s-10,10 -20,10 q-10,0 -10,-10 t10,-20 a5,5 0 0 1 10,0 m20,30 l10,10" });
    expect(relative.slice(0, 1)).toBe(absolute.slice(0, 1));
    expect(relative.gaps).toEqual(absolute.gaps);
    expect(relative.length).toBeCloseTo(absolute.length, 9);
    // The circular arc stays an arc; the Béziers are straight pieces.
    expect(absolute.slice(0, 1)).toMatch(/A5,5 0 0 1 20,10/);
    expect(absolute.slice(0, 1)).not.toMatch(/[CQST]/);
  });

  it("moves the path through its matrix, keeping a circular arc an arc while the scale is even", () => {
    const d = "M0,0L10,0A5,5 0 0 1 20,0";
    const moved = matrix.multiply(matrix.translate(100, 50), matrix.scale(2));
    const m = build.shape({ key: "a", d, matrix: moved });
    expect(m.start).toEqual({ x: 100, y: 50 });
    expect(m.end).toEqual({ x: 140, y: 50 });
    expect(m.slice(0, 1)).toBe("M100,50L120,50A10,10 0 0 1 140,50");
    expect(m.length).toBeCloseTo(20 + 10 * Math.PI, 9);
    // An uneven scale makes the arc half an ellipse, so it's straight pieces within 0.1 px of it.
    const stretched = build.shape({ key: "a", d, matrix: matrix.scale(2, 1) });
    expect(stretched.slice(0, 1)).not.toMatch(/A/);
    for (let k = 0; k <= 20; k++) {
      const p = stretched.path(20 / stretched.length + (k / 20) * (1 - 20 / stretched.length));
      expect(Math.abs(Math.hypot((p.x - 30) / 10, p.y / 5) - 1) * 5).toBeLessThan(0.1);
    }
    expect(build.shape({ key: "a", d, matrix: [1, 0, 0, 1, 0, 0] }).slice(0, 1)).toBe(build.shape({ key: "a", d }).slice(0, 1));
  });

  it("is a line with nothing to stroke when every subpath is a point alone", () => {
    const alone = build.shape({ key: "a", d: "M5,5Z", width: 4 });
    expect(alone.outline.closed).toBe(false);
    expect(alone.length).toBe(0);
    expect(alone.start).toEqual({ x: 5, y: 5 });
    expect(alone.thickness).toBe(4);
    expect(alone.bounds).toEqual({ x: 3, y: 3, width: 4, height: 4 });
    const scattered = build.shape({ key: "b", d: "M0,0ZM20,0ZM40,0Z" });
    expect(scattered.outline.closed).toBe(false);
    expect(scattered.length).toBe(40);
    expect(scattered.gaps).toEqual([
      [0, 0.5],
      [0.5, 1]
    ]);
    expect(scattered.slice(0, 1)).toBe("M0,0");
  });

  it("is open when one subpath doesn't end with Z, its closed ones walked round", () => {
    const m = build.shape({ key: "a", d: "M0,0H10V10ZM20,20H30" });
    expect(m.outline.closed).toBe(false);
    expect(m.length).toBeCloseTo(10 + 10 + Math.SQRT2 * 10 + 10 + Math.SQRT2 * 20, 9);
    expect(m.gaps).toHaveLength(1);
    expect(m.slice(0, 1)).toBe("M0,0L10,0L10,10L0,0M20,20L30,20");
  });

  it("draws a long curve in good time", () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ({ x: i / 10, value: 10 + 5 * Math.sin(i / 50) }));
    const d = line<Week>().x(x).y(y).curve(curveMonotoneX)(many)!;
    const holes = line<Week>()
      .defined((_, i) => i % 100 !== 50)
      .x(x)
      .y(y)
      .curve(curveMonotoneX)(many)!;
    const under = area<Week>().x(x).y0(200).y1(y).curve(curveMonotoneX)(many)!;
    const started = performance.now();
    const marks = [build.shape({ key: "a", d }), build.shape({ key: "b", d: holes }), build.shape({ key: "c", d: under })];
    for (const m of marks) {
      m.slice(0, 1);
      m.outline.sample(160);
      for (let t = 0; t <= 1; t += 0.001) m.path(t);
    }
    expect(performance.now() - started).toBeLessThan(2000);
    // d3 writes 3 decimals.
    expectPoint(marks[0]!.end, { x: 999.9, y: 200 - 10 * many[9999]!.value }, 3);
    expect(marks[1]!.gaps).toHaveLength(100);
    expect(marks[2]!.outline.closed).toBe(true);
  });
});

describe("describe.shape on a closed path", () => {
  it("has no direction: length 0 at its bounds' centre, where its pivot is too", () => {
    const m = build.shape({ key: "a", series: "goals", d: "M10,20H110V60H10Z", width: 3 });
    expect(m.series).toBe("goals");
    expect(m.length).toBe(0);
    for (const p of [m.start, m.end, m.center, m.pivot, m.path(0.5)]) expect(p).toEqual({ x: 60, y: 40 });
    expect(m.angle(0.5)).toBe(0);
    expect(m.slice(0, 1)).toBe("M60,40");
    expect(m.gaps).toBeUndefined();
    expect(m.segments).toBeUndefined();
  });

  it("bounds the path, its width aside, and is as thick as the smaller of its width and height", () => {
    const m = build.shape({ key: "a", d: "M10,20H110V60H10Z", width: 3 });
    expect(m.bounds).toEqual({ x: 10, y: 20, width: 100, height: 40 });
    expect(m.thickness).toBe(40);
  });

  it("samples round the path clockwise from its upper left, in four quarters of equal length, however it's written", () => {
    const clockwise = build.shape({ key: "a", d: "M10,20H110V60H10Z" });
    // 280 px round, 70 to a quarter.
    expect(clockwise.outline.closed).toBe(true);
    [
      { x: 10, y: 20 },
      { x: 80, y: 20 },
      { x: 110, y: 60 },
      { x: 40, y: 60 }
    ].forEach((corner, i) => expectPoint(clockwise.outline.sample(4)[i], corner));
    expectPoint(clockwise.outline.sample(8)[1], { x: 45, y: 20 });
    expect(clockwise.outline.d).toBe("M10,20L110,20L110,60L10,60Z");
    for (const d of ["M10,20V60H110V20Z", "M110,60H10V20H110Z", "m110,20v40h-100v-40z"]) {
      const m = build.shape({ key: "a", d });
      m.outline.sample(4).forEach((p, i) => expectPoint(p, clockwise.outline.sample(4)[i]!));
      expect(m.outline.d, d).toBe(clockwise.outline.d);
    }
    // From the middle of an edge, the outline keeps a corner there.
    const middle = build.shape({ key: "a", d: "m60,60h-50v-40h100v40z" });
    middle.outline.sample(4).forEach((p, i) => expectPoint(p, clockwise.outline.sample(4)[i]!));
    expect(middle.outline.d).toBe("M10,20L110,20L110,60L60,60L10,60Z");
    expect(() => clockwise.outline.sample(10)).toThrow(RangeError);
  });

  it("samples a circle as describe.point's outline does, whichever way it's drawn", () => {
    const dot = build.point({ key: "a", x: 40, y: 40, r: 30 });
    for (const d of ["M10,40A30,30 0 1 1 70,40A30,30 0 1 1 10,40Z", "M40,10A30,30 0 0 0 40,70A30,30 0 0 0 40,10Z"]) {
      const m = build.shape({ key: "a", d });
      for (const n of [4, 16, 160]) m.outline.sample(n).forEach((p, i) => expectPoint(p, dot.outline.sample(n)[i]!));
      expect(m.bounds).toEqual(dot.bounds);
      expect(m.thickness).toBe(60);
      expectPoint(m.center, { x: 40, y: 40 });
      expect(m.outline.d).toMatch(/^M18\.787,18\.787A30,30 0 0 1 /);
    }
  });

  it("keeps a hole in its outline, winding against the rest, and samples round the outside", () => {
    for (const d of ["M0,0H100V100H0ZM30,30V70H70V30Z", "M0,0V100H100V0ZM30,30H70V70H30Z"]) {
      const m = build.shape({ key: "a", d });
      expect(m.outline.closed).toBe(true);
      expect(m.outline.d).toBe("M0,0L100,0L100,100L0,100ZM30,30L30,70L70,70L70,30Z");
      const [outside, hole] = subpathAreas(m.outline.d);
      expect(outside).toBe(10_000);
      expect(hole).toBe(-1600);
      expect(m.outline.sample(4)).toEqual([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ]);
      expect(m.bounds).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    }
  });

  it("describes a d3 area, its curve flattened, clockwise from its upper left", () => {
    const m = build.shape({ key: "a", d: filled() });
    expect(m.outline.closed).toBe(true);
    expect(m.length).toBe(0);
    expect(m.bounds).toMatchObject({ x: 120, width: 80, height: 200 - 80 });
    expect(m.thickness).toBe(80);
    const points = m.outline.sample(400);
    expect(signedArea(points)).toBeGreaterThan(0);
    expect(points[0]).toEqual({ x: 120, y: 110 });
    expect(measurePath(m.outline.d).start).toEqual({ x: 120, y: 110 });
    expect(m.outline.d).not.toMatch(/[CQST]/);
  });

  it("counts a subpath that ends where it started as closed, as d3.arc() draws a full ring", () => {
    const ring = build.shape({ key: "a", d: arc()({ innerRadius: 70, outerRadius: 116, startAngle: 0, endAngle: 2 * Math.PI })! });
    expect(ring.outline.closed).toBe(true);
    expect(ring.length).toBe(0);
    expect(ring.bounds).toEqual({ x: -116, y: -116, width: 232, height: 232 });
    const [outside, hole] = subpathAreas(ring.outline.d);
    expect(outside).toBeGreaterThan(0);
    expect(hole).toBeLessThan(0);
    const k = 116 * Math.SQRT1_2;
    expectPoint(ring.outline.sample(4)[0], { x: -k, y: -k });
    // A polyline back to its start, with no Z, is closed too; one that stops short isn't.
    expect(build.shape({ key: "b", d: "M0,0L10,0L10,10L0,0" }).outline.closed).toBe(true);
    expect(build.shape({ key: "b", d: "M0,0L10,0L10,10L0,1" }).outline.closed).toBe(false);
  });

  it("leaves a point alone out of its outline, but not out of its bounds", () => {
    const m = build.shape({ key: "a", d: "M0,0H10V10H0ZM50,50Z" });
    expect(m.outline.closed).toBe(true);
    expect(m.outline.d).toBe("M0,0L10,0L10,10L0,10Z");
    expect(m.bounds).toEqual({ x: 0, y: 0, width: 50, height: 50 });
  });
});

describe("describe.shape's input", () => {
  it("passes series and labelBounds through, checked", () => {
    const labelBounds = [{ x: 0, y: 0, width: 20, height: 10 }];
    expect(build.shape({ key: "a", d: "M0,0L10,0", labelBounds }).labelBounds).toBe(labelBounds);
    expect(build.shape({ key: "a", d: "M0,0L10,0" }).labelBounds).toBeUndefined();
    expect(build.shape({ key: "a", d: "M0,0L10,0" }).series).toBeUndefined();
    expect(() => build.shape({ key: "a", d: "M0,0L10,0", labelBounds: [{ x: Number.NaN, y: 0, width: 1, height: 1 }] })).toThrow(/describe\.shape: labelBounds\[0\]\.x must be/);
  });

  it("throws a RangeError naming d when the path data has nothing to draw", () => {
    for (const d of ["", "   ", "junk", "L10,10", "Z", "10,10", "M0,0", "M0,0M10,10", "M0,0 M10,10 m5,5"]) {
      expect(() => build.shape({ key: "a", d }), d).toThrow(RangeError);
      expect(() => build.shape({ key: "a", d }), d).toThrow(/describe\.shape: d must start with a move and draw something after it/);
    }
    for (const d of [undefined, 42, null]) expect(() => build.shape({ key: "a", d: d as unknown as string })).toThrow(/describe\.shape: d must be path data, a string, got/);
    // Up to the first error, as SVG reads it.
    expect(build.shape({ key: "a", d: "M0,0L10,0L20" }).end).toEqual({ x: 10, y: 0 });
  });

  it("cuts long path data short in its message", () => {
    expect(() => build.shape({ key: "a", d: `M0,0${"X".repeat(100)}` })).toThrow(/got "M0,0X{36}…"\.$/);
  });

  it("throws a RangeError naming matrix unless it's six finite numbers", () => {
    for (const bad of [[1, 0, 0, 1, 0], [1, 0, 0, 1, 0, Number.NaN], [1, 0, 0, 1, 0, Infinity], "matrix(1,0,0,1,0,0)", { a: 1 }]) {
      expect(() => build.shape({ key: "a", d: "M0,0L1,1", matrix: bad as unknown as Matrix })).toThrow(/describe\.shape: matrix must be six finite numbers \[a, b, c, d, e, f\], got /);
    }
  });

  it("throws a RangeError naming width unless it's a number of px more than 0", () => {
    for (const width of [0, -1, Number.NaN, Infinity]) {
      expect(() => build.shape({ key: "a", d: "M0,0L1,1", width })).toThrow(new RangeError(`describe.shape: width must be a finite number more than 0, got ${width}.`));
    }
  });

  it("throws a RangeError naming d when its matrix takes it past the largest number", () => {
    expect(() => build.shape({ key: "a", d: "M0,0L1e300,0", matrix: matrix.scale(1e10) })).toThrow(/describe\.shape: d must stay finite once moved by matrix, got "M0,0L1e300,0"\./);
    expect(() => build.shape({ key: "a", d: "M0,0A1e300,1e300 0 0 1 1e300,1e300" })).toThrow(/describe\.shape: d must stay finite, got/);
  });
});
