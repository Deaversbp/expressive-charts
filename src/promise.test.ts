// @vitest-environment node
// The 0.x promise (CHANGELOG.md): every name it covers is named here, values and types, so a rename or
// a removal fails `npm run typecheck`. The test below keeps this list and CHANGELOG's the same.

import * as lib from "./index";
import * as testing from "./testing";

/** Stands for a type in the lists below: its type argument has to exist, or typecheck fails. */
const type = <T>(): T | undefined => undefined;

/**
 * The promised values, by the names CHANGELOG gives them: `describe`'s members one by one, `matrix`
 * as a whole. So `matrix` stands for all of its members, which are each named here.
 */
const values = {
  defineEffect: lib.defineEffect,
  defineDataEffect: lib.defineDataEffect,
  matrix: [lib.matrix.translate, lib.matrix.rotate, lib.matrix.scale, lib.matrix.multiply, lib.matrix.apply],
  offset: lib.offset,
  "describe.bar": lib.describe.bar,
  "describe.arc": lib.describe.arc,
  "describe.line": lib.describe.line,
  "describe.point": lib.describe.point,
  "describe.shape": lib.describe.shape,
  checkEffect: testing.checkEffect,
  checkTransition: testing.checkTransition,
  fixtures: testing.fixtures,
  fixturePairs: testing.fixturePairs,
  testContext: testing.testContext,
  play: testing.play
};

/** The promised types, in CHANGELOG's order. */
const types = {
  GeometryEffectSpec: type<lib.GeometryEffectSpec>(),
  DataEffectSpec: type<lib.DataEffectSpec<unknown>>(),
  BarSpec: type<lib.BarSpec>(),
  BarSegmentSpec: type<lib.BarSegmentSpec>(),
  Baseline: type<lib.Baseline>(),
  ArcSpec: type<lib.ArcSpec>(),
  LineSpec: type<lib.LineSpec>(),
  PointSpec: type<lib.PointSpec>(),
  ShapeSpec: type<lib.ShapeSpec>(),

  GeometryEffect: type<lib.GeometryEffect>(),
  DataEffect: type<lib.DataEffect>(),
  TransitionEffect: type<lib.TransitionEffect>(),
  MarkEffect: type<lib.MarkEffect>(),
  AnyMarkEffect: type<lib.AnyMarkEffect>(),
  Combined: type<lib.Combined<[lib.GeometryEffect]>>(),
  EffectContext: type<lib.EffectContext>(),
  TransitionContext: type<lib.TransitionContext>(),
  TextSpace: type<lib.TextSpace>(),
  MarkGeometry: type<lib.MarkGeometry>(),
  Outline: type<lib.Outline>(),
  Point: type<lib.Point>(),
  Rect: type<lib.Rect>(),
  MarkData: type<lib.MarkData>(),
  Sample: type<lib.Sample>(),
  Layer: type<lib.Layer>(),
  MarkHandle: type<lib.MarkHandle>(),
  MarkStyle: type<lib.MarkStyle>(),
  Matrix: type<lib.Matrix>(),
  Paint: type<lib.Paint>(),
  TextStyle: type<lib.TextStyle>(),
  Color: type<lib.Color>(),
  IconHandle: type<lib.IconHandle>(),
  PathHandle: type<lib.PathHandle>(),
  TextHandle: type<lib.TextHandle>(),
  Icon: type<lib.Icon>(),
  IconShape: type<lib.IconShape>(),
  IconSource: type<lib.IconSource>(),

  MotionView: type<lib.MotionView>(),
  MotionMode: type<lib.MotionMode>(),
  Timing: type<lib.Timing>(),
  Tween: type<lib.Tween>(),
  TweenOptions: type<lib.TweenOptions>(),
  TweenResult: type<lib.TweenResult>(),
  Easing: type<lib.Easing>(),

  CheckEffectOptions: type<testing.CheckEffectOptions>(),
  CheckTransitionOptions: type<testing.CheckTransitionOptions>(),
  TestContextOptions: type<testing.TestContextOptions>(),
  PlayOptions: type<testing.PlayOptions>(),
  FixtureName: type<testing.FixtureName>(),
  FixturePairName: type<testing.FixturePairName>(),
  TestContext: type<testing.TestContext>(),
  RecordingLayer: type<testing.RecordingLayer>(),
  RecordingMark: type<testing.RecordingMark>(),
  Drawn: type<testing.Drawn>(),
  DrawnIcon: type<testing.DrawnIcon>(),
  DrawnPath: type<testing.DrawnPath>(),
  DrawnText: type<testing.DrawnText>(),
  LayerCall: type<testing.LayerCall>(),
  MarkCall: type<testing.MarkCall>(),
  Picture: type<testing.Picture>(),
  Motion: type<lib.Motion>(),
  Clock: type<lib.Clock>(),
  ManualClock: type<lib.ManualClock>(),
  ScalingOverrides: type<lib.ScalingOverrides>(),
  ScalingRule: type<lib.ScalingRule>()
};

async function readChangelog(): Promise<string> {
  // Node APIs aren't typed in this repo (the library never runs Node code), so the one used is typed here.
  const fs = (await import("node:fs/promises" as string)) as { readFile(path: URL, encoding: "utf8"): Promise<string> };
  return fs.readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
}

/** The names in the promise's lists, as written: each `code` span that's a name (`describe.bar` too), up to "From 0.1.0:". */
function promisedNames(changelog: string): string[] {
  const start = changelog.indexOf("## The 0.x promise");
  const end = changelog.indexOf("From 0.1.0:", start);
  if (start < 0 || end < 0) throw new Error('CHANGELOG.md has no "## The 0.x promise" section ending at "From 0.1.0:".');
  const spans = [...changelog.slice(start, end).matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
  return unique(spans.filter((span) => /^[A-Za-z]\w*(\.\w+)?$/.test(span)));
}

const unique = (names: readonly string[]): string[] => [...new Set(names)].sort();

describe("the 0.x promise", () => {
  it("exports every promised value", () => {
    for (const [name, value] of Object.entries(values)) {
      for (const part of [value].flat()) expect(["function", "object"], name).toContain(typeof part);
    }
  });

  it("names the same values and types as CHANGELOG.md", async () => {
    const names = promisedNames(await readChangelog());
    expect(names).toEqual(unique([...Object.keys(values), ...Object.keys(types)]));
  });
});
