import { measurePath } from "./path";

describe("measurePath", () => {
  it("measures lines, arcs and closing segments", () => {
    const square = measurePath("M0,0L10,0L10,10L0,10Z");
    expect(square.length).toBe(40);
    expect(square.start).toEqual({ x: 0, y: 0 });
    expect(square.end).toEqual({ x: 0, y: 0 });
    expect(measurePath("M10,0A10,10 0 0 1 -10,0").length).toBeCloseTo(10 * Math.PI, 9);
    expect(measurePath("M10,0A10,10 0 1 1 0,-10").length).toBeCloseTo(15 * Math.PI, 9);
    expect(measurePath("M0,0L3,4M10,10L10,20").length).toBe(15);
  });

  it("lists commands and the points the pen visits", () => {
    const path = measurePath("M1,2L3,4A5,5 0 0 1 6,7");
    expect(path.commands).toEqual([
      { op: "M", args: [1, 2] },
      { op: "L", args: [3, 4] },
      { op: "A", args: [5, 5, 0, 0, 1, 6, 7] }
    ]);
    expect(path.points).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 6, y: 7 }
    ]);
  });

  it("rejects what the geometry module never writes", () => {
    expect(() => measurePath("M0,0l10,0")).toThrow(SyntaxError);
    expect(() => measurePath("M0,0C1,1 2,2 3,3")).toThrow(SyntaxError);
    expect(() => measurePath("L1,1")).toThrow(SyntaxError);
    expect(() => measurePath("M0")).toThrow(SyntaxError);
  });

  it("measures an empty path as nothing", () => {
    expect(measurePath("")).toMatchObject({ length: 0, start: undefined, end: undefined });
  });
});
