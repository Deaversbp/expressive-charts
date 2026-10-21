import { defineIcon, type IconSpec } from "./define";
import { icons } from "./core";

const spec: IconSpec = {
  name: "flag",
  shapes: [{ d: "M0,0L10,-5L0,-10Z", fill: "text" }],
  box: { x: -2, y: -10, width: 12, height: 10 },
  anchor: { x: 0, y: -5 }
};

describe("defineIcon", () => {
  it("fills the defaults from the anchor and the box", () => {
    expect(defineIcon(spec)).toEqual({
      ...spec,
      pivot: { x: 0, y: -5 },
      footprint: [2, 10],
      size: 12,
      radius: 5
    });
  });

  it("keeps what it's given, copying only known fields", () => {
    const icon = defineIcon({
      ...spec,
      shapes: [{ d: "M0,0L1,1", stroke: "#fff", width: 0.5, linecap: "round", linejoin: "round", clip: "M0,0L1,0L1,1Z", extra: true } as never],
      pivot: { x: 5, y: -5 },
      footprint: [0, 8],
      size: 8,
      gait: "step",
      radius: 3,
      upright: true
    });
    expect(icon).toMatchObject({ pivot: { x: 5, y: -5 }, footprint: [0, 8], size: 8, gait: "step", radius: 3, upright: true });
    expect(icon.shapes[0]).toEqual({ d: "M0,0L1,1", stroke: "#fff", width: 0.5, linecap: "round", linejoin: "round", clip: "M0,0L1,0L1,1Z" });
  });

  it("freezes the icon, since every run shares it", () => {
    const icon = defineIcon(spec);
    expect(Object.isFrozen(icon)).toBe(true);
    expect(Object.isFrozen(icon.shapes)).toBe(true);
    expect(Object.isFrozen(icon.shapes[0])).toBe(true);
    expect(Object.isFrozen(icon.footprint)).toBe(true);
    expect(Object.isFrozen(icon.anchor)).toBe(true);
  });

  it("names the field when the input is bad", () => {
    expect(() => defineIcon({ ...spec, name: "" })).toThrow(TypeError);
    const bad: [Partial<IconSpec>, RegExp][] = [
      [{ shapes: [] }, /"flag" shapes must be a non-empty array/],
      [{ shapes: [{ d: "<script>" }] }, /shapes\[0\]\.d must be path data/],
      [{ shapes: [{ d: "L1,1" }] }, /shapes\[0\]\.d must be path data starting with a move/],
      [{ shapes: [{ d: "M0,0", clip: "url(#x)" }] }, /shapes\[0\]\.clip/],
      [{ shapes: [{ d: "M0,0", fill: "" }] }, /shapes\[0\]\.fill must be a colour/],
      [{ shapes: [{ d: "M0,0", width: -1 }] }, /shapes\[0\]\.width can't be negative/],
      [{ shapes: [{ d: "M0,0", linecap: "square" as "round" }] }, /linecap/],
      [{ box: { x: 0, y: 0, width: 0, height: 4 } }, /box\.width must be more than 0/],
      [{ anchor: { x: Number.NaN, y: 0 } }, /anchor\.x must be a finite number/],
      [{ footprint: [-1, 4] }, /footprint\[0\] can't be negative/],
      [{ size: 0 }, /size must be more than 0/],
      [{ radius: -2 }, /radius/],
      [{ gait: "hop" as "roll" }, /gait must be roll, step or slide/],
      [{ upright: "yes" as unknown as boolean }, /upright/]
    ];
    for (const [change, message] of bad) expect(() => defineIcon({ ...spec, ...change })).toThrow(message);
  });
});

describe("core icons", () => {
  it("are neutral, drawn in theme colours, and anchored at their centre", () => {
    expect(Object.keys(icons)).toEqual(["dot", "arrow", "chevron"]);
    for (const [name, icon] of Object.entries(icons)) {
      expect(icon.name).toBe(name);
      expect(icon.anchor).toEqual({ x: 0, y: 0 });
      expect(icon.footprint[0]).toBe(icon.footprint[1]);
      for (const shape of icon.shapes) {
        for (const color of [shape.fill, shape.stroke]) if (color !== undefined) expect(["surface", "text"]).toContain(color);
      }
    }
  });
});
