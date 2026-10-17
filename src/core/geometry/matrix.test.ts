import type { Matrix } from "../contracts/drawing";
import type { Point } from "../contracts/geometry";
import { matrix, offset } from "./matrix";

const expectPoint = (actual: Point, expected: Point): void => {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
};
const expectMatrix = (actual: Matrix, expected: Matrix): void => {
  expect(actual).toHaveLength(6);
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 9));
};
const p = { x: 3, y: -2 };

describe("matrix", () => {
  it("translates", () => {
    expect(matrix.translate(5, 7)).toEqual([1, 0, 0, 1, 5, 7]);
    expect(matrix.apply(matrix.translate(5, 7), p)).toEqual({ x: 8, y: 5 });
  });

  it("rotates clockwise on screen for positive radians, like SVG rotate()", () => {
    // +x turns toward +y, which is down on screen.
    expectPoint(matrix.apply(matrix.rotate(Math.PI / 2), { x: 1, y: 0 }), { x: 0, y: 1 });
    expectMatrix(matrix.rotate(Math.PI / 2), [0, 1, -1, 0, 0, 0]);
  });

  it("rotates about a point, which stays fixed", () => {
    const about = { x: 10, y: 20 };
    const m = matrix.rotate(1.1, about);
    expectPoint(matrix.apply(m, about), about);
    expectPoint(matrix.apply(matrix.rotate(Math.PI, about), { x: 12, y: 20 }), { x: 8, y: 20 });
    expectMatrix(m, matrix.multiply(matrix.translate(10, 20), matrix.rotate(1.1), matrix.translate(-10, -20)));
  });

  it("scales, uniformly by default, optionally about a point", () => {
    expect(matrix.scale(2)).toEqual([2, 0, 0, 2, 0, 0]);
    expect(matrix.apply(matrix.scale(2, 3), p)).toEqual({ x: 6, y: -6 });
    const about = { x: 1, y: 1 };
    expect(matrix.apply(matrix.scale(4, 4, about), about)).toEqual(about);
    expect(matrix.apply(matrix.scale(2, 2, about), { x: 2, y: 3 })).toEqual({ x: 3, y: 5 });
  });

  it("multiplies in SVG transform-list order: the last matrix applies first", () => {
    const m = matrix.multiply(matrix.translate(10, 0), matrix.rotate(Math.PI / 2));
    // Rotate (1, 0) to (0, 1), then move right by 10.
    expectPoint(matrix.apply(m, { x: 1, y: 0 }), { x: 10, y: 1 });
    const reversed = matrix.multiply(matrix.rotate(Math.PI / 2), matrix.translate(10, 0));
    expectPoint(matrix.apply(reversed, { x: 1, y: 0 }), { x: 0, y: 11 });
  });

  it("composes associatively, and multiply() is the identity", () => {
    const a = matrix.rotate(0.4, { x: 2, y: 1 });
    const b = matrix.scale(1.5, 0.5);
    const c = matrix.translate(-3, 8);
    expectMatrix(matrix.multiply(a, b, c), matrix.multiply(matrix.multiply(a, b), c));
    expectMatrix(matrix.multiply(a, b, c), matrix.multiply(a, matrix.multiply(b, c)));
    expect(matrix.multiply()).toEqual([1, 0, 0, 1, 0, 0]);
    expect(matrix.multiply(c)).toEqual(c);
    expectPoint(matrix.apply(matrix.multiply(a, b, c), p), matrix.apply(a, matrix.apply(b, matrix.apply(c, p))));
  });
});

describe("offset", () => {
  it("moves a distance in a direction", () => {
    expectPoint(offset({ x: 1, y: 1 }, 0, 5), { x: 6, y: 1 });
    expectPoint(offset({ x: 1, y: 1 }, Math.PI / 2, 5), { x: 1, y: 6 });
    // The up side of a walk heading right is angle - PI/2: screen up.
    expectPoint(offset({ x: 1, y: 1 }, 0 - Math.PI / 2, 5), { x: 1, y: -4 });
    expectPoint(offset({ x: 1, y: 1 }, Math.PI, -2), { x: 3, y: 1 });
  });
});
