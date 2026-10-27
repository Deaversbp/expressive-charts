import type { Point } from "../contracts/geometry";
import { FLAT, flattenPath } from "./flatten";
import { matrix } from "./matrix";
import { parsePath, transformPath } from "./path";
import { pointOn, type PathSegment } from "./segment";

const flatten = (d: string) => flattenPath(parsePath(d));
const segmentsOf = (d: string): PathSegment[] => flatten(d).flatMap((subpath) => subpath.segments);

/** The distance from p to the nearest point of the segments, each arc taken at 1,000 points. */
function distanceTo(p: Point, segments: readonly PathSegment[]): number {
  let best = Infinity;
  for (const segment of segments) {
    if (segment.kind === "arc") {
      for (let k = 0; k <= 1000; k++) {
        const q = pointOn(segment, k / 1000);
        best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
      }
      continue;
    }
    const { from, to } = segment;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const u = Math.max(0, Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(from.x + u * dx - p.x, from.y + u * dy - p.y));
  }
  return best;
}

/** Points of a curve at 2,000 steps of its parameter. */
const along = (curve: (t: number) => Point): Point[] => Array.from({ length: 2001 }, (_, k) => curve(k / 2000));

function cubic(p0: Point, p1: Point, p2: Point, p3: Point): (t: number) => Point {
  return (t) => {
    const s = 1 - t;
    return {
      x: s * s * s * p0.x + 3 * s * s * t * p1.x + 3 * s * t * t * p2.x + t * t * t * p3.x,
      y: s * s * s * p0.y + 3 * s * s * t * p1.y + 3 * s * t * t * p2.y + t * t * t * p3.y
    };
  };
}

function quadratic(p0: Point, p1: Point, p2: Point): (t: number) => Point {
  return (t) => {
    const s = 1 - t;
    return { x: s * s * p0.x + 2 * s * t * p1.x + t * t * p2.x, y: s * s * p0.y + 2 * s * t * p1.y + t * t * p2.y };
  };
}

/** An ellipse round (cx, cy), turned `rotation` radians, from angle a0 to a1 of its own parameter. */
function ellipse(cx: number, cy: number, rx: number, ry: number, rotation: number, a0: number, a1: number): (t: number) => Point {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return (t) => {
    const a = a0 + (a1 - a0) * t;
    const ex = rx * Math.cos(a);
    const ey = ry * Math.sin(a);
    return { x: cx + cos * ex - sin * ey, y: cy + sin * ex + cos * ey };
  };
}

/** Whether the straight pieces stay within FLAT of the curve, both ways, and start and end where it does. */
function expectWithin(segments: readonly PathSegment[], curve: (t: number) => Point): void {
  const points = along(curve);
  expect(segments.every((segment) => segment.kind === "line")).toBe(true);
  for (const p of points) expect(distanceTo(p, segments)).toBeLessThanOrEqual(FLAT);
  for (const segment of segments) {
    if (segment.kind !== "line") continue;
    for (const end of [segment.from, segment.to]) expect(Math.min(...points.map((q) => Math.hypot(q.x - end.x, q.y - end.y)))).toBeLessThanOrEqual(FLAT);
  }
  const ends = [pointOn(segments[0]!, 0), pointOn(segments[segments.length - 1]!, 1)];
  [points[0]!, points[points.length - 1]!].forEach((end, i) => {
    expect(ends[i]!.x).toBeCloseTo(end.x, 9);
    expect(ends[i]!.y).toBeCloseTo(end.y, 9);
  });
}

describe("flattenPath", () => {
  it("keeps straight pieces straight, for every straight command, relative or absolute", () => {
    for (const d of ["M10,10L40,10L40,30H10V10", "m10,10l30,0l0,20h-30v-20", "M10 10 40 10 40 30 10 30 10 10"]) {
      const [subpath] = flatten(d);
      expect(subpath!.segments.map((segment) => segment.kind === "line" && [segment.from, segment.to])).toEqual([
        [{ x: 10, y: 10 }, { x: 40, y: 10 }],
        [{ x: 40, y: 10 }, { x: 40, y: 30 }],
        [{ x: 40, y: 30 }, { x: 10, y: 30 }],
        [{ x: 10, y: 30 }, { x: 10, y: 10 }]
      ]);
      expect(subpath).toMatchObject({ start: { x: 10, y: 10 }, end: { x: 10, y: 10 }, closed: false });
    }
  });

  it("flattens cubic Béziers within 0.1 px, for C and S, relative or absolute", () => {
    const [p0, p1, p2, p3] = [
      { x: 0, y: 100 },
      { x: 30, y: -40 },
      { x: 90, y: 160 },
      { x: 140, y: 20 }
    ];
    expectWithin(segmentsOf("M0,100C30,-40 90,160 140,20"), cubic(p0, p1, p2, p3));
    expectWithin(segmentsOf("m0,100c30,-140 90,60 140,-80"), cubic(p0, p1, p2, p3));
    // S reflects the last control point about the pen, so it's C140,20 190,-120 250,60 280,100.
    const first = segmentsOf("M0,100C30,-40 90,160 140,20").length;
    const smooth = cubic(p3, { x: 190, y: -120 }, { x: 250, y: 60 }, { x: 280, y: 100 });
    expectWithin(segmentsOf("M0,100C30,-40 90,160 140,20S250,60 280,100").slice(first), smooth);
    expectWithin(segmentsOf("m0,100c30,-140 90,60 140,-80s110,40 140,80").slice(first), smooth);
  });

  it("flattens quadratic Béziers within 0.1 px, for Q and T, relative or absolute", () => {
    const curve = quadratic({ x: 0, y: 0 }, { x: 60, y: 120 }, { x: 120, y: 0 });
    expectWithin(segmentsOf("M0,0Q60,120 120,0"), curve);
    expectWithin(segmentsOf("M0,0q60,120 120,0"), curve);
    const first = segmentsOf("M0,0Q60,120 120,0").length;
    expectWithin(segmentsOf("M0,0Q60,120 120,0T240,0").slice(first), quadratic({ x: 120, y: 0 }, { x: 180, y: -120 }, { x: 240, y: 0 }));
    expectWithin(segmentsOf("M0,0q60,120 120,0t120,0").slice(first), quadratic({ x: 120, y: 0 }, { x: 180, y: -120 }, { x: 240, y: 0 }));
  });

  it("uses no more pieces than it needs: a straight Bézier is one, and a tight one more", () => {
    expect(segmentsOf("M0,0C10,0 20,0 30,0")).toHaveLength(1);
    expect(segmentsOf("M0,0Q15,0 30,0")).toHaveLength(1);
    const gentle = segmentsOf("M0,0C10,2 20,2 30,0").length;
    const tight = segmentsOf("M0,0C10,200 20,200 30,0").length;
    expect(gentle).toBeLessThan(tight);
    expect(tight).toBeLessThan(100);
  });

  it("keeps circular arcs as arcs, for A and a, with each flag", () => {
    const [half] = segmentsOf("M0,0A50,50 0 0 1 100,0");
    expect(half).toMatchObject({ kind: "arc", center: { x: 50, y: 0 }, radius: 50, start: Math.PI });
    expect(half!.kind === "arc" && half!.sweep).toBeCloseTo(Math.PI, 12);
    expect(segmentsOf("m0,0a50,50 0 0 1 100,0")).toEqual(segmentsOf("M0,0A50,50 0 0 1 100,0"));
    // From the top of a circle round (0, 0) to its right: the four arcs the flags pick, round (0, 0)
    // or round (50, -50), and positive turning clockwise on screen.
    const arcOf = (large: number, sweep: number): { sweep: number; center: Point } => {
      const arc = segmentsOf(`M0,-50A50,50 0 ${large} ${sweep} 50,0`)[0];
      if (arc?.kind !== "arc") throw new Error("not an arc");
      return { sweep: arc.sweep, center: { x: Math.round(arc.center.x * 1e9) / 1e9 + 0, y: Math.round(arc.center.y * 1e9) / 1e9 + 0 } };
    };
    expect(arcOf(0, 1).center).toEqual({ x: 0, y: 0 });
    expect(arcOf(0, 1).sweep).toBeCloseTo(Math.PI / 2, 12);
    expect(arcOf(1, 0).center).toEqual({ x: 0, y: 0 });
    expect(arcOf(1, 0).sweep).toBeCloseTo((-3 * Math.PI) / 2, 12);
    expect(arcOf(0, 0).center).toEqual({ x: 50, y: -50 });
    expect(arcOf(0, 0).sweep).toBeCloseTo(-Math.PI / 2, 12);
    expect(arcOf(1, 1).center).toEqual({ x: 50, y: -50 });
    expect(arcOf(1, 1).sweep).toBeCloseTo((3 * Math.PI) / 2, 12);
  });

  it("scales up radii too small to reach, as SVG does", () => {
    const [arc] = segmentsOf("M0,0A1,1 0 0 1 100,0");
    expect(arc).toMatchObject({ kind: "arc", radius: 50, center: { x: 50, y: 0 } });
  });

  it("draws an arc with a radius of 0 straight, and leaves out one that ends where it starts", () => {
    expect(segmentsOf("M0,0A0,20 0 0 1 100,0")).toEqual(segmentsOf("M0,0L100,0"));
    expect(segmentsOf("M0,0A20,20 0 1 1 0,0")).toEqual([]);
  });

  it("flattens elliptical arcs within 0.1 px, rotated too", () => {
    // From angle 0 to a quarter turn of an ellipse round (100, 50), 80 by 30.
    expectWithin(segmentsOf("M180,50A80,30 0 0 1 100,80"), ellipse(100, 50, 80, 30, 0, 0, Math.PI / 2));
    // The same ellipse turned 30°, the long way round from angle 0 to a quarter turn back.
    const r = Math.PI / 6;
    const at = ellipse(100, 50, 80, 30, r, 0, (3 * Math.PI) / 2);
    const [from, to] = [at(0), at(1)];
    expectWithin(segmentsOf(`M${from.x},${from.y}A80,30 30 1 1 ${to.x},${to.y}`), at);
  });

  it("keeps a circle an arc through a turn and an even scale, and flattens it once a matrix stretches or skews it", () => {
    const circle = parsePath("M0,-50A50,50 0 0 1 50,0");
    const turned = flattenPath(transformPath(circle, matrix.multiply(matrix.rotate(0.4), matrix.scale(2)))).flatMap((subpath) => subpath.segments);
    expect(turned).toHaveLength(1);
    expect(turned[0]).toMatchObject({ kind: "arc" });
    expect(turned[0]!.kind === "arc" && turned[0]!.radius).toBeCloseTo(100, 9);
    const stretched = flattenPath(transformPath(circle, matrix.scale(2, 1))).flatMap((subpath) => subpath.segments);
    expectWithin(stretched, ellipse(0, 0, 100, 50, 0, -Math.PI / 2, 0));
    const skewed = flattenPath(transformPath(circle, [1, 0, 0.5, 1, 0, 0])).flatMap((subpath) => subpath.segments);
    expectWithin(skewed, (t) => {
      const a = -Math.PI / 2 + (Math.PI / 2) * t;
      const p = { x: 50 * Math.cos(a), y: 50 * Math.sin(a) };
      return { x: p.x + 0.5 * p.y, y: p.y };
    });
  });

  it("splits at each move, closes at Z, and starts a subpath after Z where it closed", () => {
    const subpaths = flatten("M0,0L10,0L10,10ZM20,20L30,20L20,30L40,40ZL0,40");
    expect(subpaths.map(({ start, end, closed, segments }) => ({ start, end, closed, pieces: segments.length }))).toEqual([
      { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, closed: true, pieces: 3 },
      { start: { x: 20, y: 20 }, end: { x: 20, y: 20 }, closed: true, pieces: 4 },
      { start: { x: 20, y: 20 }, end: { x: 0, y: 40 }, closed: false, pieces: 1 }
    ]);
  });

  it("leaves out a move with nothing after it, and keeps a lone point closed with Z", () => {
    expect(flatten("M0,0M5,5L10,5M20,20")).toEqual([{ start: { x: 5, y: 5 }, end: { x: 10, y: 5 }, segments: segmentsOf("M5,5L10,5"), closed: false }]);
    expect(flatten("M5,5Z")).toEqual([{ start: { x: 5, y: 5 }, end: { x: 5, y: 5 }, segments: [], closed: true }]);
    expect(flatten("M0,0")).toEqual([]);
  });

  it("leaves out pieces with no length", () => {
    expect(segmentsOf("M0,0L0,0L10,0L10,0Z")).toHaveLength(2);
  });
});
