// Test helpers for effects and the runner: the drawing API in memory, a ready-made EffectContext and a
// recording surface.
// Internal for now; the conformance suite built on these is exported after M3.

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
