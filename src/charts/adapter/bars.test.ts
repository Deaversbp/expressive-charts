import type { Rect } from "../../core";
import { baselines, describeRects, visualOrder, type RectPart } from "./bars";

const box = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const part = (b: Rect, series?: string, radius = 0): RectPart => ({ box: b, series, radius });

describe("baselines: auto", () => {
  it("bars sharing their left edge grow right", () => {
    expect(baselines([box(0, 0, 160, 20), box(0, 34, 60, 20), box(0, 68, 100, 20)], "auto")).toEqual(["left", "left", "left"]);
  });

  it("bars sharing their right edge grow left", () => {
    expect(baselines([box(40, 0, 160, 20), box(140, 34, 60, 20)], "auto")).toEqual(["right", "right"]);
  });

  it("columns sharing their bottom edge grow up, and sharing their top edge grow down", () => {
    expect(baselines([box(0, 40, 20, 160), box(34, 140, 20, 60)], "auto")).toEqual(["bottom", "bottom"]);
    expect(baselines([box(0, 0, 20, 160), box(34, 0, 20, 60)], "auto")).toEqual(["top", "top"]);
  });

  it("diverging bars grow both ways from the line they share, like negative bars", () => {
    // Zero is at x = 100: positive bars start there, negative bars end there.
    expect(baselines([box(100, 0, 60, 20), box(70, 34, 30, 20), box(100, 68, 0, 20)], "auto")).toEqual(["left", "right", "left"]);
    expect(baselines([box(0, 50, 20, 30), box(34, 80, 20, 40)], "auto")).toEqual(["bottom", "top"]);
  });

  it("tells bars from columns when both would fit", () => {
    // Bars of one length, one under the other: rows.
    expect(baselines([box(0, 0, 100, 20), box(0, 34, 100, 20)], "auto")).toEqual(["left", "left"]);
    // Columns of one height, side by side.
    expect(baselines([box(0, 0, 20, 100), box(34, 0, 20, 100)], "auto")).toEqual(["bottom", "bottom"]);
    // A lone mark: its longer side is its length.
    expect(baselines([box(0, 0, 100, 20)], "auto")).toEqual(["left"]);
    expect(baselines([box(0, 0, 20, 100)], "auto")).toEqual(["bottom"]);
  });

  it("tolerates edges within half a pixel", () => {
    expect(baselines([box(0.2, 0, 100, 20), box(0, 34, 60, 20)], "auto")).toEqual(["left", "left"]);
  });

  it("throws when no edge is shared, and takes an explicit baseline as given", () => {
    expect(() => baselines([box(0, 0, 100, 20), box(30, 34, 100, 20)], "auto")).toThrow(/found no edge/);
    expect(baselines([box(0, 0, 100, 20), box(30, 34, 100, 20)], "right")).toEqual(["right", "right"]);
    expect(baselines([], "auto")).toEqual([]);
  });
});

describe("describeRects", () => {
  it("orders segments from the baseline, whatever order the rects come in", () => {
    // Vega-Lite stacks alphabetically, so the assists rect can come first.
    const { geometry, order } = describeRects("Okafor", [part(box(160, 0, 40, 20), "assists"), part(box(0, 0, 160, 20), "goals")], "left");
    expect(order).toEqual([1, 0]);
    expect(geometry.bounds).toEqual(box(0, 0, 200, 20));
    expect(geometry.segments!.map((s) => [s.key, s.series, s.length])).toEqual([
      ["Okafor/goals", "goals", 160],
      ["Okafor/assists", "assists", 40]
    ]);
  });

  it("measures from the baseline for every direction", () => {
    const right = describeRects("a", [part(box(40, 0, 60, 20), "x"), part(box(100, 0, 100, 20), "y")], "right");
    expect(right.geometry.segments!.map((s) => [s.series, s.length])).toEqual([
      ["y", 100],
      ["x", 60]
    ]);
    expect(right.geometry.start).toEqual({ x: 200, y: 10 });
    const bottom = describeRects("b", [part(box(0, 0, 20, 30), "top"), part(box(0, 30, 20, 70), "base")], "bottom");
    expect(bottom.geometry.segments!.map((s) => s.series)).toEqual(["base", "top"]);
    expect(bottom.geometry.end).toEqual({ x: 10, y: 0 });
    const top = describeRects("c", [part(box(0, 0, 20, 30), "first"), part(box(0, 30, 20, 70), "second")], "top");
    expect(top.geometry.segments!.map((s) => [s.series, s.length])).toEqual([
      ["first", 30],
      ["second", 70]
    ]);
  });

  it("turns a gap between the host's segments into describe.bar's gap", () => {
    const { geometry } = describeRects("a", [part(box(0, 0, 160, 20), "goals"), part(box(162, 0, 60, 20), "assists")], "left");
    const [goals, assists] = geometry.segments!;
    expect(goals!.length).toBe(160);
    // The gap comes out of the start of the later segment, so it starts where the rect does.
    expect(assists!.start).toEqual({ x: 162, y: 10 });
    expect(assists!.end).toEqual({ x: 222, y: 10 });
  });

  it("keeps a zero-length segment where the one before ends, without losing the gap", () => {
    const { geometry } = describeRects(
      "a",
      [part(box(0, 0, 100, 20), "goals"), part(box(100, 0, 0, 20), "own goals"), part(box(102, 0, 50, 20), "assists")],
      "left"
    );
    expect(geometry.segments!.map((s) => [s.series, s.length])).toEqual([
      ["goals", 100],
      ["own goals", 0],
      ["assists", 50]
    ]);
  });

  it("a lone rect without a series is one default segment; with one it's named", () => {
    const plain = describeRects("a", [part(box(0, 0, 100, 20))], "left").geometry;
    expect(plain.series).toBeUndefined();
    expect(plain.segments!.map((s) => s.key)).toEqual(["a/0"]);
    const named = describeRects("a", [part(box(0, 0, 100, 20), "goals")], "left").geometry;
    expect(named.series).toBe("goals");
    expect(named.segments!.map((s) => s.key)).toEqual(["a/goals"]);
  });

  it("rounds the tip with the tip rect's radius", () => {
    const square = describeRects("a", [part(box(0, 0, 100, 20), "x")], "left").geometry;
    const round = describeRects("a", [part(box(0, 0, 60, 20), "x", 0), part(box(60, 0, 40, 20), "y", 4)], "left").geometry;
    expect(square.outline.d).not.toContain("A");
    expect(round.outline.d).toContain("A");
  });
});

describe("visualOrder", () => {
  it("puts bars top to bottom and columns left to right", () => {
    expect(visualOrder([box(0, 68, 10, 20), box(0, 0, 10, 20), box(0, 34, 10, 20)], ["left", "left", "left"])).toEqual([1, 2, 0]);
    expect(visualOrder([box(68, 0, 20, 10), box(0, 50, 20, 60), box(34, 20, 20, 90)], ["bottom", "bottom", "bottom"])).toEqual([1, 2, 0]);
  });
});
