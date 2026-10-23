import { easeInOutCubic, easeOutCubic, linear, unease, type Easing } from "./easing";

describe.each([
  ["linear", linear],
  ["easeInOutCubic", easeInOutCubic],
  ["easeOutCubic", easeOutCubic]
] as Array<[string, Easing]>)("%s", (_name, ease) => {
  it("starts at 0 and ends at 1", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it("never moves backwards", () => {
    let previous = ease(0);
    for (let i = 1; i <= 100; i++) {
      const next = ease(i / 100);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });
});

describe("easing shapes", () => {
  it("easeInOutCubic is symmetric around the middle", () => {
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.75)).toBeCloseTo(0.9375);
  });

  it("easeOutCubic covers most of the distance early", () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });
});

describe("unease", () => {
  it("is easeInOutCubic's inverse", () => {
    expect(unease(0)).toBe(0);
    expect(unease(0.5)).toBe(0.5);
    expect(unease(1)).toBe(1);
    for (let i = 0; i <= 100; i++) expect(easeInOutCubic(unease(i / 100))).toBeCloseTo(i / 100, 12);
  });
});
