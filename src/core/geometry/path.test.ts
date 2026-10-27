import { matrix } from "./matrix";
import { formatPath, parsePath, shapeOutline, transformPath } from "./path";

const round = (d: string): string => formatPath(parsePath(d));

describe("path data for icons", () => {
  it("makes every command absolute: H, V, S and T become L, C and Q", () => {
    expect(round("m1 2 3 4h5v-6z")).toBe("M1,2L4,6L9,6L9,0Z");
    expect(round("M0,0C1,1 2,1 3,0S5,-1 6,0")).toBe("M0,0C1,1 2,1 3,0C4,-1 5,-1 6,0");
    expect(round("M0,0Q1,1 2,0T4,0")).toBe("M0,0Q1,1 2,0Q3,-1 4,0");
    expect(round("M0,0q1,1 2,0t2,0")).toBe("M0,0Q1,1 2,0Q3,-1 4,0");
    expect(round("M0,0L1,1S3,1 4,0")).toBe("M0,0L1,1C1,1 3,1 4,0");
    expect(round("M0 0a5 5 0 1 0 10 0")).toBe("M0,0A5,5 0 1 0 10,0");
  });

  it("reads arc flags written without separators, and compact numbers", () => {
    expect(round("M0,0a1 1 0 0110 10")).toBe("M0,0A1,1 0 0 1 10,10");
    // Minifiers attach a flag to a fractional coordinate.
    expect(round("M0,0A5 5 0 01.5 .5")).toBe("M0,0A5,5 0 0 1 0.5,0.5");
    expect(round("M0,0A5 5 0 0 1.5 .5")).toBe("M0,0A5,5 0 0 1 0.5,0.5");
    expect(round("M0,0A5 5 0 1 0-2 3")).toBe("M0,0A5,5 0 1 0 -2,3");
    expect(round("M.5-.5L1e1,2E-1")).toBe("M0.5,-0.5L10,0.2");
  });

  it("stops at the first error, as SVG does", () => {
    expect(round("M0,0L10,10L20")).toBe("M0,0L10,10");
    expect(round("10,10L5,5")).toBe("");
    expect(round("M0,0Z10,10")).toBe("M0,0Z");
    expect(round("M0,0X10,10")).toBe("M0,0");
    expect(round("M0,0L1e999,0")).toBe("M0,0");
    // A flag is 0 or 1, nothing else.
    expect(round("M0,0A5 5 0 2 1 3 3")).toBe("M0,0");
    expect(round("M0,0A5 5 0 0 1e5 3 3")).toBe("M0,0");
  });

  it("moves points and arcs through a transform", () => {
    const circle = parsePath("M5,0A5,5 0 0 1 -5,0A5,5 0 0 1 5,0Z");
    expect(formatPath(transformPath(circle, matrix.multiply(matrix.translate(10, 0), matrix.scale(2))))).toBe(
      "M20,0A10,10 0 0 1 0,0A10,10 0 0 1 20,0Z"
    );
    // A mirror flips the sweep, so the arc still bulges the same way on screen.
    expect(formatPath(transformPath(parsePath("M0,0A5,5 0 0 1 10,0"), matrix.scale(-1, 1)))).toBe("M0,0A5,5 0 0 0 -10,0");
    // An uneven scale turns a circle into an axis-aligned ellipse, and a rotation turns the ellipse.
    expect(formatPath(transformPath(parsePath("M0,0A5,5 0 0 1 10,0"), matrix.scale(1, 3)))).toBe("M0,0A15,5 90 0 1 10,0");
    expect(formatPath(transformPath(parsePath("M0,0A4,2 0 0 1 10,0"), matrix.rotate(Math.PI / 2)))).toBe("M0,0A4,2 90 0 1 0,10");
  });
});

describe("shapeOutline", () => {
  it("writes each shape element as path commands, from an element's attributes or a map's", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = '<ellipse cx="10" cy="5" rx="4" ry="2"/><line x1="1" y1="2" x2="3" y2="4"/><polygon points="0,0 4,0 4,3"/><rect x="1" y="1" width="4" height="2" rx="1"/>';
    const outlines = Array.from(svg.children, (element) => formatPath(shapeOutline(element.localName, (name) => element.getAttribute(name))));
    expect(outlines).toEqual([
      "M14,5A4,2 0 0 1 6,5A4,2 0 0 1 14,5Z",
      "M1,2L3,4",
      "M0,0L4,0L4,3Z",
      "M2,1L4,1A1,1 0 0 1 5,2L5,2A1,1 0 0 1 4,3L2,3A1,1 0 0 1 1,2L1,2A1,1 0 0 1 2,1Z"
    ]);
    const attributes = new Map([["cx", "1"], ["cy", "1"], ["r", "1"], ["points", "0 0 2 2 4 0"], ["d", "m0 0h5"]]);
    expect(["circle", "polyline", "path"].map((tag) => formatPath(shapeOutline(tag, (name) => attributes.get(name))))).toEqual([
      "M2,1A1,1 0 0 1 0,1A1,1 0 0 1 2,1Z",
      "M0,0L2,2L4,0",
      "M0,0L5,0"
    ]);
  });

  it("has nothing for a shape SVG wouldn't draw, or another tag", () => {
    const none = (tag: string, attributes: Record<string, string>): number => shapeOutline(tag, (name) => attributes[name]).length;
    expect(none("circle", { r: "0" })).toBe(0);
    expect(none("ellipse", { rx: "3" })).toBe(0);
    expect(none("polyline", { points: "1,1" })).toBe(0);
    expect(none("rect", { width: "-1", height: "4" })).toBe(0);
    expect(none("text", { x: "1" })).toBe(0);
    expect(none("path", {})).toBe(0);
  });
});
