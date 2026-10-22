// Test helpers for effects and the runner: the drawing API in memory, a ready-made EffectContext and a
// recording surface. The public ones (testContext, play and the recording types) are re-exported with
// the conformance suite from "expressive-charts/testing" (src/testing); recordingSurface, measurePath
// and flush stay internal.

export { testContext, type TestContext, type TestContextOptions } from "./context";
export { measurePath, type MeasuredPath, type PathCommand } from "./path";
export { flush, play, type PlayOptions } from "./play";
export {
  recordingLayer,
  recordingMark,
  recordingSurface,
  type Drawn,
  type DrawnIcon,
  type DrawnPath,
  type DrawnText,
  type LayerCall,
  type MarkCall,
  type Picture,
  type RecordedGroup,
  type RecordingLayer,
  type RecordingMark,
  type RecordingSurface
} from "./recording";
