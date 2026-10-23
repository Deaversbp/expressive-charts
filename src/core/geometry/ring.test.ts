import { describe as geometry } from "./describe";
import { goesRound } from "./ring";

describe("goesRound", () => {
  it("is true for a slice and a pie slice, walked either way", () => {
    expect(goesRound(geometry.arc({ key: "a", cx: 100, cy: 100, inner: 40, outer: 80, start: 0, end: 1 }))).toBe(true);
    expect(goesRound(geometry.arc({ key: "b", cx: 100, cy: 100, inner: 0, outer: 80, start: 2, end: 0.5 }))).toBe(true);
  });

  it("is false for a bar, a point and a line, whose pivots are on their own walks", () => {
    expect(goesRound(geometry.bar({ key: "a", x: 0, y: 10, width: 120, height: 20, baseline: "left" }))).toBe(false);
    expect(goesRound(geometry.point({ key: "b", x: 50, y: 50, r: 4 }))).toBe(false);
    expect(goesRound(geometry.line({ key: "c", points: [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }] }))).toBe(false);
  });

  it("allows half a px either way, and needs the walk more than half a px from the pivot", () => {
    const pivot = { x: 0, y: 0 };
    expect(goesRound({ pivot, start: { x: 10, y: 0 }, center: { x: 0, y: 10.5 }, end: { x: -9.5, y: 0 } })).toBe(true);
    expect(goesRound({ pivot, start: { x: 10, y: 0 }, center: { x: 0, y: 10.6 }, end: { x: -10, y: 0 } })).toBe(false);
    expect(goesRound({ pivot, start: { x: 0.5, y: 0 }, center: { x: 0, y: 0.5 }, end: { x: -0.5, y: 0 } })).toBe(false);
  });
});
