import { measurePath } from "../testing";
import { drawTo, formatNumber, pathData } from "./path-data";
import { arc, line } from "./segment";

describe("formatNumber", () => {
  it("rounds to 0.001 px and never writes -0", () => {
    expect(formatNumber(100)).toBe("100");
    expect(formatNumber(1.23456)).toBe("1.235");
    expect(formatNumber(-2.5)).toBe("-2.5");
    expect(formatNumber(-0.0001)).toBe("0");
    expect(formatNumber(1e-12)).toBe("0");
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
  });
});

describe("drawTo", () => {
  it("draws part of a line", () => {
    expect(drawTo(line({ x: 0, y: 0 }, { x: 10, y: 0 }), 0, 0.5)).toBe("L5,0");
  });

  it("splits arcs into pieces of at most half a turn, all with the small-arc flag", () => {
    const quarter = drawTo(arc({ x: 0, y: 0 }, 10, 0, Math.PI / 2));
    expect(quarter).toBe("A10,10 0 0 1 0,10");
    const threeQuarters = drawTo(arc({ x: 0, y: 0 }, 10, 0, 1.5 * Math.PI));
    expect(threeQuarters.match(/A/g)).toHaveLength(2);
    const full = drawTo(arc({ x: 0, y: 0 }, 10, 0, 2 * Math.PI));
    expect(full).toBe("A10,10 0 0 1 -10,0A10,10 0 0 1 10,0");
  });

  it("sets the sweep flag from the direction of travel", () => {
    expect(drawTo(arc({ x: 0, y: 0 }, 10, 0, -Math.PI / 2))).toBe("A10,10 0 0 0 0,-10");
  });

  it("draws the part of an arc between two fractions", () => {
    const s = arc({ x: 0, y: 0 }, 10, 0, Math.PI);
    expect(drawTo(s, 0.5, 1)).toBe("A10,10 0 0 1 -10,0");
  });
});

describe("pathData", () => {
  const square = [
    line({ x: 0, y: 0 }, { x: 10, y: 0 }),
    line({ x: 10, y: 0 }, { x: 10, y: 10 }),
    line({ x: 10, y: 10 }, { x: 0, y: 10 }),
    line({ x: 0, y: 10 }, { x: 0, y: 0 })
  ];

  it("lets Z draw a closing straight segment", () => {
    expect(pathData(square, true)).toBe("M0,0L10,0L10,10L0,10Z");
    expect(pathData(square)).toBe("M0,0L10,0L10,10L0,10L0,0");
  });

  it("keeps a closing arc and skips zero-length segments", () => {
    const d = pathData(
      [line({ x: 10, y: 0 }, { x: 10, y: 0 }), line({ x: 10, y: 0 }, { x: -10, y: 0 }), arc({ x: 0, y: 0 }, 10, Math.PI, Math.PI), line({ x: 10, y: 0 }, { x: 10, y: 0 })],
      true
    );
    expect(d).toBe("M10,0L-10,0A10,10 0 0 1 10,0Z");
    expect(measurePath(d).length).toBeCloseTo(20 + 10 * Math.PI, 2);
  });

  it("writes nothing for no segments", () => {
    expect(pathData([])).toBe("");
  });
});
