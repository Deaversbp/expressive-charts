// Geometry: pure math, no DOM. Charts and adapters use it to build mark geometry, effects to draw.
// Only `describe`, `matrix`, `offset` and `samplesAlong` are public; the rest is for charts and effects inside the library.
// Reading and transforming any path data (`./path`), which describe.shape uses, and `goesRound` (`./ring`) are imported
// from their own files. An entry that needs only a helper imports it from its own file too, as the sport pack takes
// `formatNumber` from `./path-data`, so it doesn't carry the builders.

export { describe } from "./describe";
export type { ArcSpec, BarSegmentSpec, BarSpec, Baseline, LineSpec, PointSpec, ShapeSpec } from "./describe";
export { invert, matrix, offset, parseTransform } from "./matrix";
export { closedOutline, openOutline, type Sides } from "./outline";
export { drawTo, formatNumber, moveTo, pathData } from "./path-data";
export { samplesAlong, type SamplePoint } from "./samples";
export {
  angleOn,
  arc,
  boundsOf,
  extremes,
  line,
  normalizeAngle,
  pointOn,
  polar,
  TAU,
  type ArcSegment,
  type LineSegment,
  type PathSegment
} from "./segment";
export { createWalk, type Gaps, type Walk } from "./walk";
