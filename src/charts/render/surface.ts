// The runner's surface in SVG: one overlay group per run, above the marks, and the marks' style handles.

import type { MarkHandle } from "../../core";
import type { RunnerSurface } from "../../core/runner";
import { svgLayer } from "./layer";
import { setStyles, svgElement } from "./svg";
import { markColorStyles, type SeriesColors } from "./theme";

export interface SvgSurfaceOptions {
  /** Where runs draw: a group above the marks, in chart coordinates. */
  readonly overlay: SVGGElement;
  /** The mark's own style handle. */
  mark(key: string): MarkHandle;
  /** The colours the "mark" token means in this mark's groups. */
  colors(key: string): SeriesColors | undefined;
}

export function svgSurface(options: SvgSurfaceOptions): RunnerSurface {
  const { overlay } = options;
  const orders = new WeakMap<Element, number>();
  return {
    group(key, slot, order) {
      const group = svgElement("g", { class: "ec-run", "data-key": key, "data-slot": slot }, overlay);
      setStyles(group, markColorStyles(options.colors(key)));
      orders.set(group, order);
      // Stacked by start order, not by when the group was asked for: a decoration may first draw late.
      const above = Array.from(overlay.children).find((child) => (orders.get(child) ?? -Infinity) > order);
      overlay.insertBefore(group, above ?? null);
      return { ...svgLayer(group), clear: () => group.remove() };
    },
    mark: (key) => options.mark(key)
  };
}
