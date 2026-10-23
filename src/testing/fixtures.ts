// The marks checkEffect runs an effect on by default: one of each kind the geometry builders
// describe, plus the awkward cases (a bar growing the other way, a stack with a gap, a bar shorter
// than most icons, a point whose walk has no length). Each has a moved twin: the same mark somewhere
// else, as a resize or a transition's next frame leaves it, for the check that effects follow onChange.
// checkTransition's pairs are made of the same marks.

import { describe as build, type MarkGeometry } from "../core";

export type FixtureName = "bar" | "negative bar" | "column" | "stacked" | "short bar" | "slice" | "line" | "point";

/** Every kind of mark an effect meets: bars (plain, negative, a column, stacked, too short), a donut slice, a line and a point. */
export const fixtures: Readonly<Record<FixtureName, MarkGeometry>> = /* @__PURE__ */ makeFixtures(false);

/**
 * Each fixture moved: the same key and series, somewhere else and another size. The bars are a row
 * lower and shorter (the stack's segments in another ratio), the slice turned and the ring smaller,
 * the line further revealed and rescaled, and the point moved.
 */
export const movedFixtures: Readonly<Record<FixtureName, MarkGeometry>> = /* @__PURE__ */ makeFixtures(true);

export type FixturePairName = "slice and column" | "bar and column" | "two slices" | "two lines" | "two points";

/**
 * The pairs checkTransition runs a transition effect between by default, each both ways: a slice and
 * a column (a mark that goes round its pivot and one that doesn't), a bar and a column, two slices,
 * two lines and two points. The second of two alike is the first's moved twin.
 */
export const fixturePairs: Readonly<Record<FixturePairName, readonly [MarkGeometry, MarkGeometry]>> = /* @__PURE__ */ Object.freeze({
  "slice and column": [fixtures.slice, fixtures.column],
  "bar and column": [fixtures.bar, fixtures.column],
  "two slices": [fixtures.slice, movedFixtures.slice],
  "two lines": [fixtures.line, movedFixtures.line],
  "two points": [fixtures.point, movedFixtures.point]
} as const);

function makeFixtures(moved: boolean): Readonly<Record<FixtureName, MarkGeometry>> {
  const y = moved ? 30 : 0;
  const bar = (width: number, more: Partial<Parameters<typeof build.bar>[0]> = {}): MarkGeometry =>
    build.bar({ key: "Okafor", series: "goals", x: 0, y, width, height: 20, baseline: "left", ...more });
  const [goals, assists] = moved ? [120, 82] : [160, 62];
  return Object.freeze({
    bar: bar(moved ? 160 : 200, { radius: 4 }),
    "negative bar": build.bar({ key: "n", series: "goals", x: moved ? 30 : 0, y, width: moved ? 90 : 120, height: 20, baseline: "right" }),
    column: build.bar({ key: "c", series: "goals", x: moved ? 30 : 0, y: moved ? 40 : 0, width: 20, height: moved ? 110 : 150, baseline: "bottom" }),
    stacked: bar(goals + assists, { series: undefined, gap: 2, segments: [{ series: "goals", size: goals }, { series: "assists", size: assists }] }),
    "short bar": bar(moved ? 4 : 6),
    slice: moved
      ? build.arc({ key: "Saved", cx: 140, cy: 130, inner: 60, outer: 100, start: 0.5, end: 2 })
      : build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0.3, end: 2.4 }),
    line: build.line({
      key: "goals",
      series: "goals",
      points: moved
        ? [{ x: 0, y: 90 }, { x: 64, y: 58 }, { x: 128, y: 82 }, { x: 192, y: 26 }, { x: 256, y: 40 }]
        : [{ x: 0, y: 100 }, { x: 80, y: 60 }, { x: 160, y: 90 }, { x: 240, y: 20 }],
      width: 2
    }),
    point: build.point({ key: "p", x: moved ? 40 : 10, y: moved ? 25 : 10, r: 3 })
  });
}
