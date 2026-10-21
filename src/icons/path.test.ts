import { matrix } from "../core";
import { formatPath, parsePath, transformPath } from "./path";

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
    expect(round("M.5-.5L1e1,2E-1")).toBe("M0.5,-0.5L10,0.2");
  });

  it("stops at the first error, as SVG does", () => {
    expect(round("M0,0L10,10L20")).toBe("M0,0L10,10");
    expect(round("10,10L5,5")).toBe("");
    expect(round("M0,0Z10,10")).toBe("M0,0Z");
    expect(round("M0,0X10,10")).toBe("M0,0");
    expect(round("M0,0L1e999,0")).toBe("M0,0");
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
