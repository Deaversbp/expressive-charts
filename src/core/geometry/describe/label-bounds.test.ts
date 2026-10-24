// labelBounds: every builder takes the boxes of the mark's own labels and passes them through.

import type { Rect } from "../../contracts/geometry";
import { describe as build } from "./index";

const boxes: Rect[] = [
  { x: 4, y: 10, width: 40, height: 14 },
  { x: 230, y: 10, width: 18, height: 14 }
];

describe("labelBounds", () => {
  it("passes the boxes through on every builder, as given", () => {
    const marks = [
      build.bar({ key: "a", x: 50, y: 6, width: 170, height: 20, baseline: "left", labelBounds: boxes }),
      build.arc({ key: "b", cx: 0, cy: 0, inner: 70, outer: 116, start: 0, end: 1, labelBounds: boxes }),
      build.line({ key: "c", points: [{ x: 0, y: 0 }, { x: 10, y: 5 }], labelBounds: boxes }),
      build.point({ key: "d", x: 3, y: 4, r: 4.5, labelBounds: boxes })
    ];
    for (const mark of marks) expect(mark.labelBounds).toBe(boxes);
  });

  it("leaves the field unset when none are given, and gives a stack's segments none", () => {
    const marks = [
      build.bar({ key: "a", x: 0, y: 0, width: 10, height: 20, baseline: "left" }),
      build.arc({ key: "b", cx: 0, cy: 0, inner: 70, outer: 116, start: 0, end: 1 }),
      build.line({ key: "c", points: [{ x: 0, y: 0 }] }),
      build.point({ key: "d", x: 0, y: 0, r: 2 })
    ];
    for (const mark of marks) expect("labelBounds" in mark).toBe(false);
    const stack = build.bar({
      key: "e",
      x: 0,
      y: 0,
      width: 120,
      height: 20,
      baseline: "left",
      segments: [
        { series: "goals", size: 70 },
        { series: "assists", size: 50 }
      ],
      labelBounds: boxes
    });
    expect(stack.labelBounds).toBe(boxes);
    expect(stack.segments!.map((segment) => "labelBounds" in segment)).toEqual([false, false]);
    // An empty list says the mark has no labels, which isn't the same as not saying.
    expect(build.point({ key: "f", x: 0, y: 0, r: 2, labelBounds: [] }).labelBounds).toEqual([]);
  });

  it("throws a RangeError that names the builder and the field for a box it can't use", () => {
    const bad = (box: Partial<Rect>) => [{ x: 0, y: 0, width: 1, height: 1, ...box }];
    expect(() => build.bar({ key: "a", x: 0, y: 0, width: 1, height: 1, baseline: "left", labelBounds: bad({ x: NaN }) })).toThrow(
      new RangeError("describe.bar: labelBounds[0].x must be a finite number, got NaN.")
    );
    expect(() => build.arc({ key: "b", cx: 0, cy: 0, inner: 1, outer: 2, start: 0, end: 1, labelBounds: [boxes[0]!, ...bad({ width: -1 })] })).toThrow(
      new RangeError("describe.arc: labelBounds[1].width must be a finite number ≥ 0, got -1.")
    );
    expect(() => build.line({ key: "c", points: [{ x: 0, y: 0 }], labelBounds: bad({ y: Infinity }) })).toThrow(/describe\.line: labelBounds\[0\]\.y/);
    expect(() => build.point({ key: "d", x: 0, y: 0, r: 1, labelBounds: bad({ height: NaN }) })).toThrow(/describe\.point: labelBounds\[0\]\.height/);
  });
});
