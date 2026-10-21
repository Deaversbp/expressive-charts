// Geometry: pure math, no DOM. Charts and adapters use it to build mark geometry, effects to draw.
// Only `describe`, `matrix` and `offset` are public; the rest is for charts and effects inside the library.

export { describe } from "./describe";
export type { ArcSpec, BarSegmentSpec, BarSpec, Baseline, LineSpec, PointSpec } from "./describe";
export { invert, matrix, offset, parseTransform } from "./matrix";
export { closedOutline, openOutline, type Sides } from "./outline";
export { drawTo, formatNumber, moveTo, pathData } from "./path-data";
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
export { createWalk, type Walk } from "./walk";
