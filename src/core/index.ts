// The motion core: everything here is independent of charts and effects.

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

export type { Point, Rect } from "./contracts/geometry";
