import type { MarkGeometry, Rect } from "../core";
import { describe as build } from "../core";
import { fixtures } from "../testing/fixtures";
import { captionPlace } from "./caption";

/** The overlay's text size, and how far its baseline drops below the placed point read sideways (0.36 em) and downwards (0.8 em). */
const SIDEWAYS = 12.5 * 0.36;
const DOWNWARDS = 12.5 * 0.8;

const bar = (labelBounds?: Rect[]): MarkGeometry =>
  build.bar({ key: "Okafor", series: "goals", x: 60, y: 10, width: 200, height: 20, baseline: "left", ...(labelBounds ? { labelBounds } : {}) });

describe("captionPlace", () => {
  it("puts text 10 px past the end of a walk with no labels, read away from the mark", () => {
    // A bar growing right: centred on its line, from its start.
    expect(captionPlace(bar())).toEqual({ at: { x: 270, y: 20 + SIDEWAYS }, anchor: "start", toward: 0 });
    // A negative bar reads leftwards, from its end.
    const negative = fixtures["negative bar"];
    const back = captionPlace(negative);
    expect(back.anchor).toBe("end");
    expect(back.at.x).toBeCloseTo(negative.end.x - 10, 9);
    expect(back.at.y).toBeCloseTo(negative.end.y + SIDEWAYS, 9);
    // A column: centred, standing 10 px above its tip.
    const column = fixtures.column;
    const placed = captionPlace(column);
    expect(placed.anchor).toBe("middle");
    expect(placed.at.x).toBeCloseTo(column.end.x, 9);
    expect(placed.at.y).toBeCloseTo(column.end.y - 10, 9);
    // Hanging below a column that grows down.
    const hanging = build.bar({ key: "h", x: 0, y: 0, width: 20, height: 50, baseline: "top" });
    expect(captionPlace(hanging).at.y).toBeCloseTo(60 + DOWNWARDS, 9);
    // Unset and empty labelBounds are the same: nothing in the way.
    expect(captionPlace(bar([]))).toEqual(captionPlace(bar()));
  });

  it("goes 6 px past the farthest label the heading meets, when that's further than 10 px", () => {
    const value = { x: 266, y: 12, width: 24, height: 14 };
    expect(captionPlace(bar([value])).at.x).toBe(296);
    // A label behind the end, or beside the heading, isn't in the way.
    const category = { x: 0, y: 12, width: 54, height: 14 };
    const above = { x: 262, y: -10, width: 80, height: 14 };
    expect(captionPlace(bar([category, value, above])).at.x).toBe(296);
    // Two in a row: past the farther one.
    expect(captionPlace(bar([value, { x: 300, y: 18, width: 40, height: 14 }])).at.x).toBe(346);
    // One that ends within 4 px of the end leaves the 10 px.
    expect(captionPlace(bar([{ x: 250, y: 12, width: 14, height: 14 }])).at.x).toBe(270);
  });

  it("measures along the heading, on a slanted walk too", () => {
    // Up and to the right at 45°: it leaves the box, grown by 6 px, through its top, 31 px up.
    const line = build.line({ key: "goals", points: [{ x: 0, y: 100 }, { x: 100, y: 0 }], labelBounds: [{ x: 95, y: -25, width: 30, height: 30 }] });
    const { at, anchor } = captionPlace(line);
    const along = 31 * Math.SQRT2;
    expect(at.x).toBeCloseTo(100 + along * Math.SQRT1_2, 9);
    // Read upwards at 45°, its baseline is a little below the point: 0.36 em times 1 − sin 45°.
    expect(at.y).toBeCloseTo(-along * Math.SQRT1_2 + SIDEWAYS * (1 - Math.SQRT1_2), 9);
    // 45° from vertical counts as within it.
    expect(anchor).toBe("middle");
  });

  it("anchors by the heading: start rightwards, end leftwards, middle within 45° of vertical", () => {
    const heading = (degrees: number) => {
      const radians = (degrees * Math.PI) / 180;
      return captionPlace(build.line({ key: "l", points: [{ x: 0, y: 0 }, { x: Math.cos(radians) * 50, y: Math.sin(radians) * 50 }] })).anchor;
    };
    expect([0, 30, 44, 46, 90, 134, 136, 180, -136, -134, -90, -46, -44].map(heading)).toEqual([
      "start",
      "start",
      "start",
      "middle",
      "middle",
      "middle",
      "end",
      "end",
      "end",
      "middle",
      "middle",
      "middle",
      "start"
    ]);
  });

  it("follows a slice's walk along the ring at its end when it has no labels", () => {
    // d3.pie()'s angles: from 12 o'clock to 3, so the walk ends heading down at 3 o'clock.
    const slice = build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2 });
    const { at, anchor } = captionPlace(slice);
    expect(anchor).toBe("middle");
    expect(at.x).toBeCloseTo(150 + 93, 9);
    expect(at.y).toBeCloseTo(160 + DOWNWARDS, 9);
  });

  it("goes up from the centre, past the labels there, when the heading meets none of them", () => {
    // A slice from 12 o'clock to 3: its middle at half past one, its label outside the ring there.
    const middle = { x: 150 + 93 * Math.SQRT1_2, y: 150 - 93 * Math.SQRT1_2 };
    const label: Rect = { x: middle.x + 20, y: middle.y - 50, width: 40, height: 34 };
    const slice = build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2, labelBounds: [label] });
    const { at, anchor, toward } = captionPlace(slice);
    // Outward, at half past one: up and to the right.
    expect(toward).toBeCloseTo(-Math.PI / 4, 9);
    expect(anchor).toBe("middle");
    // The ray leaves the box, grown by 6 px, through its top: 56 px up, and so 56√2 along it.
    const along = 56 * Math.SQRT2;
    expect(at.x).toBeCloseTo(middle.x + along * Math.SQRT1_2, 9);
    expect(at.y).toBeCloseTo(middle.y - along * Math.SQRT1_2 + SIDEWAYS * (1 - Math.SQRT1_2), 9);
    // A label neither way meets leaves it 10 px past the end, along the ring.
    const elsewhere = build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2, labelBounds: [{ x: 0, y: 0, width: 10, height: 10 }] });
    expect(captionPlace(elsewhere)).toEqual(captionPlace(build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0, end: Math.PI / 2 })));
  });

  it("counts a label the heading passes within 6 px of as in the way", () => {
    // 5 px above the bar's line: the text, centred on the line, would reach it.
    const near = { x: 266, y: -1, width: 24, height: 16 };
    expect(captionPlace(bar([near])).at.x).toBe(296);
    // 7 px above: clear.
    const clear = { x: 266, y: -3, width: 24, height: 16 };
    expect(captionPlace(bar([clear])).at.x).toBe(270);
  });

  it("keeps to the heading when it meets a label, whatever the up side meets", () => {
    const value = { x: 266, y: 12, width: 24, height: 14 };
    const overhead = { x: 140, y: -40, width: 40, height: 14 };
    expect(captionPlace(bar([value, overhead]))).toMatchObject({ toward: 0, at: { x: 296 } });
    // A bar whose value label is empty: its name is behind it, and nothing is above it.
    expect(captionPlace(bar([{ x: 0, y: 12, width: 54, height: 14 }]))).toEqual(captionPlace(bar()));
  });
});
