// expressive-charts/testing: the conformance suite for effects, with the helpers it's built on, for
// effects written inside the library or outside it. It imports no test runner, and it's a separate
// entry, so nothing here reaches the main bundle or the script-tag build.

export { checkEffect, checkTransition, type CheckEffectOptions, type CheckTransitionOptions } from "./check";
export { fixturePairs, fixtures, type FixtureName, type FixturePairName } from "./fixtures";
export { play, testContext, type PlayOptions, type TestContext, type TestContextOptions } from "../core/testing";
export type { Drawn, DrawnIcon, DrawnPath, DrawnText, LayerCall, MarkCall, Picture, RecordingLayer, RecordingMark } from "../core/testing";
