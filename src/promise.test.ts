// @vitest-environment node
// The promise (CHANGELOG.md): from 1.0, every name the package's entries export, values and types. Each is named here,
// so a rename or a removal fails `npm run typecheck`: the types by the imports below, the values by the lists after
// them. So are the members of the objects api.md documents member by member. src/api-docs.test.ts checks that the
// type imports are every type each entry exports, read with TypeScript's compiler API; the tests below check the
// values against what each entry exports when it runs, and CHANGELOG's promise against the entries.

import type {
  Accessor, AnimateOptions, Animated, AnimatedOptions, AnyMarkEffect, ArcSpec, Attachment, BarChart,
  BarChartOptions, BarSegmentSpec, BarSpec, Baseline, Chart, ChartChange, ChartLabel, ChartOptions, ChartSwitch,
  ChartSwitchGuide, ChartSwitchOptions, ChartSwitchPaint, ChartSwitchShowOptions, ChartSwitchView,
  ChartSwitchViewFactory, ChartSwitchViewName, ChartSwitchViews, Clock, Color, ColorAssignment, Combined,
  DataEffect, DataEffectSpec, DeltaOptions, DonutChart, DonutChartOptions, DrawInOptions, Easing, EffectContext,
  EffectOption, EffectSlot, EffectSlots, ExpressiveOptions, FlashOptions, FrameSource, Gait, GaitName, GaitPose,
  GaitState, GeometryEffect, GeometryEffectSpec, HostGuide, HostLabel, HostMark, HostView, HostViewOptions, Icon,
  IconHandle, IconShape, IconSource, IconSpec, Interpolator, KeyOfType, LabelOptions, Layer, LegendEntry,
  LegendOptions, LineChart, LineChartOptions, LineSpec, Link, LinkOptions, LinkSource, ManualClock, MarkData,
  MarkEffect, MarkEvent, MarkEvents, MarkGeometry, MarkHandle, MarkSource, MarkStyle, MarkSummary, Matrix,
  MorphAlign, MorphOptions, Motion, MotionEnv, MotionMode, MotionOptions, MotionSwitch, MotionSwitchOptions,
  MotionView, NumericKey, Outline, OutlineOptions, Paint, PathHandle, PlayButton, PlayButtonOptions, Playback,
  PlaybackEvent, PlaybackOptions, Point, PointSpec, PresetName, PulseOptions, Rect, ReducedMotionSource, Sample,
  SamplePoint, ScalingOverrides, ScalingRule, ScalingTable, SeekOptions, ShapeSpec, SliceSummary, StaggerOptions,
  StepOptions, StyleOptions, SvgIconSpec, TableColumn, TableOptions, TextHandle, TextSpace, TextStyle,
  ThresholdOptions, Timing, TraceOptions, TransitionContext, TransitionEffect, TravelOptions, Tween, TweenOptions,
  TweenResult, VegaAttachment, VegaItem, VegaMark, VegaOptions, VegaSample, VegaViewLike, WiggleOptions
} from "./index";
import type {
  CheckEffectOptions, CheckTransitionOptions, Drawn, DrawnIcon, DrawnPath, DrawnText, FixtureName, FixturePairName,
  LayerCall, MarkCall, Picture, PlayOptions, RecordingLayer, RecordingMark, TestContext, TestContextOptions
} from "./testing";

import * as lib from "./index";
import * as sport from "./icons/sport";
import * as testing from "./testing";

/** Every value each entry exports, by the name a page imports it from. */
const values: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  "expressive-charts": {
    VERSION: lib.VERSION,
    animated: lib.animated,
    barChart: lib.barChart,
    chartSwitch: lib.chartSwitch,
    colorAssignment: lib.colorAssignment,
    configure: lib.configure,
    createClock: lib.createClock,
    createMotion: lib.createMotion,
    defaultClock: lib.defaultClock,
    defaultScaling: lib.defaultScaling,
    defineDataEffect: lib.defineDataEffect,
    defineEffect: lib.defineEffect,
    defineIcon: lib.defineIcon,
    delta: lib.delta,
    describe: lib.describe,
    donutChart: lib.donutChart,
    drawIn: lib.drawIn,
    easeInOutCubic: lib.easeInOutCubic,
    easeOutCubic: lib.easeOutCubic,
    expressive: lib.expressive,
    flash: lib.flash,
    fromVegaView: lib.fromVegaView,
    gaits: lib.gaits,
    hostView: lib.hostView,
    iconFromSvg: lib.iconFromSvg,
    icons: lib.icons,
    interpolateNumber: lib.interpolateNumber,
    interpolatePoint: lib.interpolatePoint,
    interpolateRecord: lib.interpolateRecord,
    label: lib.label,
    lineChart: lib.lineChart,
    linear: lib.linear,
    link: lib.link,
    manualClock: lib.manualClock,
    matrix: lib.matrix,
    mediaReducedMotion: lib.mediaReducedMotion,
    morph: lib.morph,
    motion: lib.motion,
    motionSwitch: lib.motionSwitch,
    offset: lib.offset,
    only: lib.only,
    outline: lib.outline,
    parallel: lib.parallel,
    playButton: lib.playButton,
    playback: lib.playback,
    pulse: lib.pulse,
    registerIcon: lib.registerIcon,
    registerIcons: lib.registerIcons,
    registerPreset: lib.registerPreset,
    samplesAlong: lib.samplesAlong,
    scaleDuration: lib.scaleDuration,
    sequence: lib.sequence,
    stagger: lib.stagger,
    threshold: lib.threshold,
    trace: lib.trace,
    travel: lib.travel,
    tween: lib.tween,
    wait: lib.wait,
    wiggle: lib.wiggle
  },
  "expressive-charts/icons/sport": {
    cleat: sport.cleat,
    soccerBall: sport.soccerBall,
    sport: sport.sport
  },
  "expressive-charts/testing": {
    checkEffect: testing.checkEffect,
    checkTransition: testing.checkTransition,
    fixturePairs: testing.fixturePairs,
    fixtures: testing.fixtures,
    play: testing.play,
    testContext: testing.testContext
  }
};

/** The modules themselves, as a page loads them. */
const modules: Readonly<Record<string, object>> = { "expressive-charts": lib, "expressive-charts/icons/sport": sport, "expressive-charts/testing": testing };

/** The members api.md documents one by one, each a name a page writes (`describe.bar`). */
const members = {
  describe: [lib.describe.bar, lib.describe.arc, lib.describe.line, lib.describe.point, lib.describe.shape],
  matrix: [lib.matrix.translate, lib.matrix.rotate, lib.matrix.scale, lib.matrix.multiply, lib.matrix.apply],
  gaits: [lib.gaits.roll, lib.gaits.step, lib.gaits.slide],
  icons: [lib.icons.dot, lib.icons.arrow, lib.icons.chevron]
};

async function read(path: string): Promise<string> {
  // Node APIs aren't typed in this repo (the library never runs Node code), so the one used is typed here.
  const fs = (await import("node:fs/promises" as string)) as { readFile(path: URL, encoding: "utf8"): Promise<string> };
  return (await fs.readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
}

describe("the promise", () => {
  it("names every value each entry exports, and nothing else", () => {
    for (const [entry, module] of Object.entries(modules)) {
      expect(Object.keys(values[entry]!).sort(), entry).toEqual(Object.keys(module).filter((name) => name !== "default").sort());
      for (const [name, value] of Object.entries(values[entry]!)) expect(value, `${entry}: ${name}`).toBe((module as Record<string, unknown>)[name]);
    }
  });

  it("names every member api.md documents one by one, and they're all there", () => {
    for (const [name, list] of Object.entries(members)) {
      for (const member of list) expect(["function", "object"], name).toContain(typeof member);
      expect(list, name).toHaveLength(Object.keys(lib[name as keyof typeof members]).length);
    }
  });

  it("is CHANGELOG's: the whole package, its three entries and the stylesheet's", async () => {
    const changelog = await read("../CHANGELOG.md");
    const start = changelog.indexOf("\n## The promise\n");
    const end = changelog.indexOf("\n## ", start + 1);
    expect(start, 'CHANGELOG.md has a "## The promise" section').toBeGreaterThan(0);
    const promise = changelog.slice(start, end);
    for (const entry of [...Object.keys(modules), "expressive-charts/style.css"]) expect(promise).toContain(`\`${entry}\``);
    expect(promise).toMatch(/A breaking change to anything promised below comes only in a major release, with a migration note/);
    expect(changelog).not.toMatch(/## The 0\.x promise|### What 1\.0 will promise/);
  });
});
