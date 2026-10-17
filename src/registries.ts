// The page-wide registries. The composition root (src/index.ts) hands them to every chart and
// adapter, which resolve preset and icon names through them. The built-in presets (wiggle, pulse,
// flash) are registered here as their effects land (M3).

import type { Icon, MarkEffect } from "./core";
import { createRegistry, type PresetFactory } from "./core/registry";

export const presetRegistry = /* @__PURE__ */ createRegistry<PresetFactory>({
  kind: "preset",
  hint: "Register custom presets with registerPreset(name, factory)."
});

export const iconRegistry = /* @__PURE__ */ createRegistry<Icon>({
  kind: "icon",
  hint: "Register icons with registerIcon(icon) or registerIcons(icons)."
});

/** Makes `name` usable in any chart's `on` slots, e.g. `on: { hover: "nudge" }`. A later registration replaces an earlier one. */
export function registerPreset(name: string, factory: () => MarkEffect): void {
  if (typeof factory !== "function") throw new TypeError(`registerPreset("${name}") needs a function that returns an effect.`);
  presetRegistry.register(name, factory);
}

/** Makes an icon usable by name, e.g. `travel("cleat")`. A later icon with the same name replaces an earlier one. */
export function registerIcon(icon: Icon): void {
  if (typeof icon !== "object" || icon === null || typeof icon.name !== "string") {
    throw new TypeError("registerIcon needs an icon with a name.");
  }
  iconRegistry.register(icon.name, icon);
}

export function registerIcons(icons: readonly Icon[]): void {
  for (const icon of icons) registerIcon(icon);
}
