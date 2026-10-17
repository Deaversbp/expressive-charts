import type { DataEffect, GeometryEffect, MarkEffect, TransitionEffect } from "./contracts/effect";
import type { EffectSlots } from "./contracts/slots";
import { createRegistry, resolveEffects, type PresetFactory } from "./registry";
import type { SlotEffects } from "./runner";

const effect = (): GeometryEffect => ({ kind: "geometry", run: async () => {}, end: () => {}, clear: () => {} });

describe("createRegistry", () => {
  it("gets, registers and lists entries", () => {
    const registry = createRegistry<number>({ kind: "size", entries: { small: 1, large: 3 } });
    expect(registry.get("small")).toBe(1);
    expect(registry.get("medium")).toBeUndefined();
    registry.register("medium", 2);
    expect(registry.resolve("medium")).toBe(2);
    expect(registry.names()).toEqual(["small", "large", "medium"]);
  });

  it("replaces an entry registered under the same name, keeping its place", () => {
    const registry = createRegistry<number>({ kind: "size", entries: { small: 1, large: 3 } });
    registry.register("small", 0);
    expect(registry.get("small")).toBe(0);
    expect(registry.names()).toEqual(["small", "large"]);
  });

  it("throws a clear error for an unknown name, listing what's registered", () => {
    const presets = createRegistry<PresetFactory>({ kind: "preset", entries: { wiggle: effect, pulse: effect }, hint: "Register one with registerPreset()." });
    expect(() => presets.resolve("wigle")).toThrow(new RangeError('Unknown preset "wigle". Registered presets: wiggle, pulse. Register one with registerPreset().'));
    expect(() => createRegistry({ kind: "icon" }).resolve("cleat")).toThrow(new RangeError('Unknown icon "cleat". Registered icons: none.'));
  });

  it("rejects names that aren't non-empty strings, and missing values", () => {
    const registry = createRegistry<number>({ kind: "size" });
    expect(() => registry.register("", 1)).toThrow(TypeError);
    expect(() => registry.register(4 as unknown as string, 1)).toThrow(/size needs a non-empty string name, got 4/);
    expect(() => registry.register("tiny", undefined as unknown as number)).toThrow(/needs a value/);
    expect(() => createRegistry({ kind: "size", entries: { "": 1 } })).toThrow(TypeError);
  });

  it("is an IconSource when it holds icons", () => {
    const icons = createRegistry<{ name: string }>({ kind: "icon" });
    const source: { get(name: string): { name: string } | undefined } = icons;
    expect(source.get("dot")).toBeUndefined();
  });
});

describe("resolveEffects", () => {
  const presets = createRegistry<PresetFactory>({ kind: "preset", entries: { flash: effect } });

  it("passes effects through and makes a fresh effect for each preset name", () => {
    const hover = effect();
    const resolved = resolveEffects({ hover, update: "flash", exit: "flash" }, presets);
    expect(resolved.hover).toBe(hover);
    expect(resolved.update).toMatchObject({ kind: "geometry" });
    expect(resolved.update).not.toBe(resolved.exit);
    expect(Object.keys(resolved)).toEqual(["hover", "update", "exit"]);
    expect(resolveEffects(undefined, presets)).toEqual({});
  });

  it("throws on an unknown preset name", () => {
    expect(() => resolveEffects({ hover: "wigle" }, presets)).toThrow(/Unknown preset "wigle". Registered presets: flash./);
  });

  it("rejects transition effects and other things that aren't mark effects, naming the slot", () => {
    const morph: TransitionEffect = { kind: "transition", run: async () => {}, end: () => {}, clear: () => {} };
    expect(() => resolveEffects({ hover: morph } as unknown as EffectSlots<unknown>, presets)).toThrow(
      'on.hover needs a mark effect (kind "geometry" or "data") or a preset name, got a transition effect, which runs between two charts rather than on one mark.'
    );
    const bad = (value: unknown) => () => resolveEffects({ enter: value } as EffectSlots<unknown>, presets);
    expect(bad(null)).toThrow(/on.enter .* got null/);
    expect(bad(42)).toThrow(/got number/);
    expect(bad({ run() {} })).toThrow(/got an object with no kind/);
    expect(bad({ kind: "geometry", run() {} })).toThrow(/got a geometry effect without run\(\), end\(\) and clear\(\)/);
    expect(bad({ kind: "sparkle" })).toThrow(/got an effect of kind "sparkle"/);
  });

  it("rejects a preset whose factory doesn't return a mark effect", () => {
    const broken = createRegistry<PresetFactory>({ kind: "preset", entries: { oops: () => undefined as unknown as MarkEffect } });
    expect(() => resolveEffects({ decorate: "oops" }, broken)).toThrow('Preset "oops" for on.decorate didn\'t return a mark effect; it returned undefined.');
  });

  it("rejects slots that don't exist", () => {
    expect(() => resolveEffects({ hovr: effect() } as unknown as EffectSlots<unknown>, presets)).toThrow(
      "on.hovr isn't an effect slot. Use one of: hover, enter, update, exit, decorate."
    );
  });

  it("keeps the row type", () => {
    interface Region {
      region: string;
      revenue: number;
    }
    expectTypeOf(resolveEffects<Region>({}, presets)).toEqualTypeOf<SlotEffects<Region>>();
    expectTypeOf<DataEffect<Region>>().toExtend<NonNullable<SlotEffects<Region>["hover"]>>();
    // A preset works on any rows, so a factory for one kind of row isn't one.
    expectTypeOf<() => DataEffect<Region>>().not.toExtend<PresetFactory>();
  });
});
