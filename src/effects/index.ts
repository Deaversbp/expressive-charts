// Effects: they read only MarkGeometry (and MarkData, for data effects), draw only through the
// context, and never know chart types. Icons are resolved by name through ctx.icons.

export { travel, type TravelOptions } from "./travel";
export { flash, type FlashOptions } from "./flash";
export { wiggle, type WiggleOptions } from "./wiggle";
export { pulse, type PulseOptions } from "./pulse";
export { trace, type TraceOptions } from "./trace";
export { drawIn, type DrawInOptions } from "./draw-in";
export { delta, type DeltaOptions } from "./delta";
export { label, type LabelOptions } from "./label";
export { threshold, type ThresholdOptions } from "./threshold";
export { morph, type MorphAlign, type MorphOptions } from "./morph";
export { gaits, type Gait, type GaitName, type GaitPose, type GaitState, type StepOptions } from "./gaits";
export { only, parallel, sequence, stagger, type StaggerOptions } from "./combinators";
export { defineDataEffect, defineEffect, type DataEffectSpec, type GeometryEffectSpec } from "./define";
