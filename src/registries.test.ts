import type { GeometryEffect, Icon } from "./core";
import { icons, registerIcon, registerIcons, registerPreset } from "./index";
import { iconRegistry, presetRegistry } from "./registries";

const icon = (name: string): Icon => ({
  name,
  shapes: [],
  box: { x: 0, y: 0, width: 8, height: 8 },
  size: 8,
  anchor: { x: 0, y: 4 },
  pivot: { x: 4, y: 4 },
  footprint: [0, 8]
});

describe("page-wide registries", () => {
  it("start with the neutral core icons, and no sport icons", () => {
    expect(iconRegistry.names().slice(0, 3)).toEqual(["dot", "arrow", "chevron"]);
    expect(iconRegistry.get("arrow")).toBe(icons.arrow);
    expect(iconRegistry.get("soccer-ball")).toBeUndefined();
    expect(iconRegistry.get("cleat")).toBeUndefined();
  });

  it("registers presets by name", () => {
    const nudge = (): GeometryEffect => ({ kind: "geometry", run: async () => {}, end: () => {}, clear: () => {} });
    registerPreset("test-nudge", nudge);
    expect(presetRegistry.resolve("test-nudge")).toBe(nudge);
    expect(() => presetRegistry.resolve("test-missing")).toThrow(/Unknown preset "test-missing". Registered presets: .*test-nudge.* Register custom presets with registerPreset\(name, factory\)./);
    expect(() => registerPreset("test-bad", {} as unknown as () => GeometryEffect)).toThrow(TypeError);
  });

  it("registers icons by their own name, one or many", () => {
    const ball = icon("test-ball");
    registerIcon(ball);
    registerIcons([icon("test-boot"), icon("test-flag")]);
    expect(iconRegistry.get("test-ball")).toBe(ball);
    expect(iconRegistry.names()).toEqual(expect.arrayContaining(["test-ball", "test-boot", "test-flag"]));
    expect(() => registerIcon({} as Icon)).toThrow(/needs an icon with a name/);
    expect(() => iconRegistry.resolve("test-cleat")).toThrow(/registerIcon\(icon\) or registerIcons\(icons\)/);
  });
});
