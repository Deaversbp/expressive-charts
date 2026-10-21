// Icons: defineIcon and iconFromSvg build them, and the neutral core set ships here. Effects never
// import this folder; they resolve icon names through ctx.icons, which the composition root fills.
// The sport pack is a separate entry point (./sport), so the core build doesn't carry it.

export { defineIcon, type IconSpec } from "./define";
export { iconFromSvg, type SvgIconSpec } from "./svg";
export { icons } from "./core";
