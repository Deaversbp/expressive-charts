// Public entry point and composition root: the only file that brings charts and effects together.
// Exports are added here as each layer is built. See docs/architecture.md for the design.

export const VERSION = "0.0.0";

export * from "./core";
export * from "./effects";
export * from "./icons";
export { registerIcon, registerIcons, registerPreset } from "./registries";
