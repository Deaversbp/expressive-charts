// Test helpers for effects: the drawing API in memory and a ready-made EffectContext.
// Internal for now; the conformance suite built on these is exported after M3.

export { testContext, type TestContext, type TestContextOptions } from "./context";
export { measurePath, type MeasuredPath, type PathCommand } from "./path";
export {
  recordingLayer,
  recordingMark,
  type Drawn,
  type DrawnIcon,
  type DrawnPath,
  type DrawnText,
  type LayerCall,
  type MarkCall,
  type Picture,
  type RecordingLayer,
  type RecordingMark
} from "./recording";
