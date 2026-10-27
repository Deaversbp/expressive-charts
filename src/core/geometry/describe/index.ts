// The public geometry builders. Reference charts and adapters share these, so a bar is described
// the same way whoever drew it.

import { describeArc } from "./arc";
import { describeBar } from "./bar";
import { describeLine } from "./line";
import { describePoint } from "./point";
import { describeShape } from "./shape";

export const describe = {
  bar: describeBar,
  arc: describeArc,
  line: describeLine,
  point: describePoint,
  shape: describeShape
};

export type { ArcSpec } from "./arc";
export type { BarSegmentSpec, BarSpec, Baseline } from "./bar";
export type { LineSpec } from "./line";
export type { PointSpec } from "./point";
export type { ShapeSpec } from "./shape";
