// The marks checkEffect runs an effect on by default: one of each kind the geometry builders
// describe, plus the awkward cases (a bar growing the other way, a stack with a gap, a bar shorter
// than most icons, a point whose walk has no length).

import { describe as build, type MarkGeometry } from "../core";

export type FixtureName = "bar" | "negative bar" | "column" | "stacked" | "short bar" | "slice" | "line" | "point";

/** Every kind of mark an effect meets: bars (plain, negative, a column, stacked, too short), a donut slice, a line and a point. */
export const fixtures: Readonly<Record<FixtureName, MarkGeometry>> = /* @__PURE__ */ makeFixtures();

function makeFixtures(): Readonly<Record<FixtureName, MarkGeometry>> {
  const bar = (width: number, more: Partial<Parameters<typeof build.bar>[0]> = {}): MarkGeometry =>
    build.bar({ key: "Okafor", series: "goals", x: 0, y: 0, width, height: 20, baseline: "left", ...more });
  return Object.freeze({
    bar: bar(200, { radius: 4 }),
    "negative bar": build.bar({ key: "n", series: "goals", x: 0, y: 0, width: 120, height: 20, baseline: "right" }),
    column: build.bar({ key: "c", series: "goals", x: 0, y: 0, width: 20, height: 150, baseline: "bottom" }),
    stacked: bar(222, { series: undefined, gap: 2, segments: [{ series: "goals", size: 160 }, { series: "assists", size: 62 }] }),
    "short bar": bar(6),
    slice: build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0.3, end: 2.4 }),
    line: build.line({ key: "goals", series: "goals", points: [{ x: 0, y: 100 }, { x: 80, y: 60 }, { x: 160, y: 90 }, { x: 240, y: 20 }], width: 2 }),
    point: build.point({ key: "p", x: 10, y: 10, r: 3 })
  });
}
