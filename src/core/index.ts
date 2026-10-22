// The motion core, the shared contracts and the geometry: everything here is independent of charts and effects.

export { createClock, defaultClock, manualClock } from "./clock";
export type { Clock, FrameSource, ManualClock } from "./clock";

export { easeInOutCubic, easeOutCubic, linear } from "./easing";
export type { Easing } from "./easing";

export { createMotion, defaultScaling, mediaReducedMotion, motion, scaleDuration } from "./motion";
export type {
  Motion,
  MotionMode,
  MotionOptions,
  MotionView,
  ReducedMotionSource,
  ScalingOverrides,
  ScalingRule,
  ScalingTable,
  Timing
} from "./motion";

export { tween } from "./tween";
export type { MotionEnv, Tween, TweenOptions, TweenResult } from "./tween";

export { animated, interpolateNumber, interpolatePoint, interpolateRecord } from "./animated";
export type { Animated, AnimatedOptions, AnimateOptions, Interpolator } from "./animated";

export { playback } from "./playback";
export type { Playback, PlaybackEvent, PlaybackOptions, SeekOptions } from "./playback";

export type {
  AnyMarkEffect,
  Color,
  Combined,
  DataEffect,
  EffectContext,
  EffectOption,
  EffectSlot,
  EffectSlots,
  GeometryEffect,
  Icon,
  IconHandle,
  IconShape,
  IconSource,
  Layer,
  MarkData,
  MarkEffect,
  MarkGeometry,
  MarkHandle,
  MarkStyle,
  Matrix,
  Outline,
  Paint,
  PathHandle,
  Point,
  PresetName,
  Rect,
  Sample,
  TextHandle,
  TextStyle,
  TransitionEffect
} from "./contracts";

export { describe, matrix, offset } from "./geometry";
export type { ArcSpec, BarSegmentSpec, BarSpec, Baseline, LineSpec, PointSpec } from "./geometry";
