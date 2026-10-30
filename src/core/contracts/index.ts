// Types shared by charts, adapters and effects. Types only: nothing here runs.

export type { MarkGeometry, Outline, Point, Rect } from "./geometry";
export type { MarkData, Sample } from "./data";
export type {
  Color,
  IconHandle,
  Layer,
  MarkHandle,
  MarkStyle,
  Matrix,
  Paint,
  PathHandle,
  TextHandle,
  TextStyle
} from "./drawing";
export type { Icon, IconShape, IconSource } from "./icon";
export type {
  AnyMarkEffect,
  Combined,
  DataEffect,
  EffectContext,
  GeometryEffect,
  MarkEffect,
  TextSpace,
  TransitionContext,
  TransitionEffect
} from "./effect";
export type { EffectOption, EffectSlot, EffectSlots, PresetName } from "./slots";
