// The runner's surface in SVG: one overlay group per run, above the marks, and the marks' style handles.

import type { MarkHandle } from "../../core";
import type { RunnerSurface } from "../../core/runner";
import { svgLayer } from "./layer";
import { setAttributes, setStyles, svgElement } from "./svg";
import { markColorStyles, type SeriesColors } from "./theme";

export interface SvgSurfaceOptions {
  /** Where runs draw: a group above the marks, in chart coordinates. */
  readonly overlay: SVGGElement;
  /** The mark's own style handle. */
  mark(key: string): MarkHandle;
  /** The colours the "mark" token means in this mark's groups. */
  colors(key: string): SeriesColors | undefined;
}

export interface SvgSurface extends RunnerSurface {
  /** Sets the "mark" colours again on the key's live groups, after the mark's colours changed (a new palette, a different first series). */
  recolor(key: string): void;
  /** Hides the key's groups, and any it gets later, or shows them again: a line chart's points past its reveal. */
  hide(key: string, hidden: boolean): void;
}

export function svgSurface(options: SvgSurfaceOptions): SvgSurface {
  const { overlay } = options;
  const orders = new WeakMap<Element, number>();
  /** Live groups by mark key. */
  const groups = new Map<string, Set<SVGGElement>>();
  const hidden = new Set<string>();
  return {
    group(key, slot, order) {
      const group = svgElement("g", { class: "ec-run", "data-key": key, "data-slot": slot, visibility: hidden.has(key) ? "hidden" : undefined }, overlay);
      setStyles(group, markColorStyles(options.colors(key)));
      orders.set(group, order);
      // Stacked by start order, not by when the group was asked for: a decoration may first draw late.
      const above = Array.from(overlay.children).find((child) => (orders.get(child) ?? -Infinity) > order);
      overlay.insertBefore(group, above ?? null);
      let live = groups.get(key);
      if (!live) groups.set(key, (live = new Set()));
      live.add(group);
      const owner = live;
      return {
        ...svgLayer(group),
        clear() {
          group.remove();
          owner.delete(group);
          if (owner.size === 0 && groups.get(key) === owner) groups.delete(key);
        }
      };
    },
    mark: (key) => options.mark(key),
    recolor(key) {
      const live = groups.get(key);
      if (!live) return;
      const styles = markColorStyles(options.colors(key));
      for (const group of live) setStyles(group, styles);
    },
    hide(key, hide) {
      if (hide) hidden.add(key);
      else hidden.delete(key);
      for (const group of groups.get(key) ?? []) setAttributes(group, { visibility: hide ? "hidden" : undefined });
    }
  };
}
