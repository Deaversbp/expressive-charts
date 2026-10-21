// expressive-charts/testing: the conformance suite for effects, with the helpers it's built on, for
// effects written inside the library or outside it. It imports no test runner, and it's a separate
// entry, so nothing here reaches the main bundle or the script-tag build.

export { checkEffect, type CheckEffectOptions } from "./check";
export { fixtures, type FixtureName } from "./fixtures";
export { play, testContext, type PlayOptions, type TestContext, type TestContextOptions } from "../core/testing";
export type { Drawn, DrawnIcon, DrawnPath, DrawnText, LayerCall, MarkCall, Picture, RecordingLayer, RecordingMark } from "../core/testing";
