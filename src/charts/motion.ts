// A chart's motion: the page-wide one, the author's own Motion, or a mode string. A mode is a per-chart
// author default, like setMode(): the viewer's choice and the device's reduced-motion setting still win.

import { defaultScaling, scaleDuration, type Motion, type MotionMode, type MotionView } from "../core";

export type ChartMotion = MotionView & Pick<Motion, "subscribe">;

const MODES: readonly MotionMode[] = ["presentation", "analysis", "off"];

export function chartMotion(option: Motion | MotionMode | undefined, page: Motion): ChartMotion {
  if (option === undefined) return page;
  if (typeof option !== "string") return option;
  if (!MODES.includes(option)) throw new TypeError(`Unknown motion mode "${String(option)}". Use one of: ${MODES.join(", ")}.`);
  const effective = (): MotionMode => page.viewerChoice ?? (page.prefersReduced ? "off" : option);
  return {
    get mode() {
      return effective();
    },
    get staged() {
      return effective() === "presentation";
    },
    duration(base, timing = "transition") {
      const mode = effective();
      return mode === "off" ? 0 : scaleDuration(base, defaultScaling[mode][timing]);
    },
    subscribe: (listener) => page.subscribe(listener)
  };
}
