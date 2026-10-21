import { easeInOutCubic } from "../core";
import { gaits, type GaitState } from "./gaits";

const at = (distance: number, length: number, radius = 8.5): GaitState => ({ distance, length, progress: length > 0 ? distance / length : 1, radius });
const degrees = (radians: number): number => (radians * 180) / Math.PI;

describe("gaits", () => {
  it("roll spins by the distance over the radius, and nothing else", () => {
    const roll = gaits.roll();
    expect(roll(at(17, 100))).toEqual({ lift: 0, spin: 2, tilt: 0 });
    expect(roll(at(0, 100))).toEqual({ lift: 0, spin: 0, tilt: 0 });
    expect(roll.ease).toBeUndefined();
    expect(roll.pace).toBeUndefined();
  });

  it("step lifts and tilts the front up once per stride, landing flat", () => {
    const step = gaits.step();
    expect(step.ease).toBe(easeInOutCubic);
    expect(step.pace).toBe(1.15);
    // 126 units at a 42-unit stride is three steps; the middle of the first is the highest point.
    const top = step(at(21, 126));
    expect(top.lift).toBeCloseTo(3.2, 9);
    expect(degrees(top.tilt)).toBeCloseTo(9 * (1 - 0.3 / 6), 9);
    expect(top.spin).toBe(0);
    for (const landing of [0, 42, 84, 126]) {
      const pose = step(at(landing, 126));
      expect(pose.lift).toBeCloseTo(0, 9);
      expect(pose.tilt).toBeCloseTo(0, 9);
    }
    // The tilt eases off as the trip goes on.
    expect(degrees(step(at(105, 126)).tilt)).toBeCloseTo(9 * (1 - 0.3 * (105 / 126)), 9);
  });

  it("takes at least one step, however short the trip", () => {
    const step = gaits.step();
    expect(step(at(5, 10)).lift).toBeCloseTo(3.2, 9);
    expect(step(at(0, 0))).toEqual({ lift: 0, spin: 0, tilt: 0 });
  });

  it("step takes its stride, lift and tilt", () => {
    const step = gaits.step({ stride: 10, lift: 2, tilt: 20 });
    expect(step(at(5, 20)).lift).toBeCloseTo(2, 9);
    expect(degrees(step(at(5, 20)).tilt)).toBeCloseTo(20 * (1 - 0.3 / 4), 9);
    expect(step(at(10, 20)).lift).toBeCloseTo(0, 9);
    expect(() => gaits.step({ stride: 0 })).toThrow(/stride/);
    expect(() => gaits.step({ lift: -1 })).toThrow(/lift/);
    expect(() => gaits.step({ tilt: Number.NaN })).toThrow(/tilt/);
  });

  it("slide holds still", () => {
    expect(gaits.slide()(at(50, 100))).toEqual({ lift: 0, spin: 0, tilt: 0 });
  });
});
