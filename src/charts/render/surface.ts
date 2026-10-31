// The runner's surface in SVG: one overlay group per run, above the marks, the marks' style handles,
// and the box a run's text takes. A run's paths and icons follow its mark: they take the transform an
// effect gives the mark's body, and dim with it while another mark is hovered. Its text stays put, as
// the mark's labels do.

import type { MarkHandle, Matrix } from "../../core";
import type { RunnerSurface } from "../../core/runner";
import { TEXT_SIZE } from "../../core/text-box";
import { FOLLOW, svgLayer } from "./layer";
import { setAttributes, setStyles, svgElement, transformAttribute } from "./svg";
import { textBox, textMeasure, type TextMeasure } from "./text";
import { markColorStyles, type SeriesColors } from "./theme";

export interface SvgSurfaceOptions {
  /** Where runs draw: a group above the marks, in chart coordinates. */
  readonly overlay: SVGGElement;
  /** The mark's own style handle. */
  mark(key: string): MarkHandle;
  /**
   * The colours the "mark" token means in this mark's groups, or with `part`, in a paint naming that
   * segment: undefined for a key the mark hasn't, which then means the mark's own.
   */
  colors(key: string, part?: string): SeriesColors | undefined;
  /** Measures runs' text: the chart's own measure, so a font load clears both. Default: one measuring in the overlay. */
  readonly measure?: TextMeasure;
}

export interface SvgSurface extends RunnerSurface {
  /** Sets the "mark" colours again on the key's live groups and their parts' paths, after the mark's colours changed (a new palette, a different first series). */
  recolor(key: string): void;
  /** Hides the key's groups, and any it gets later, or shows them again: a line chart's points past its reveal. */
  hide(key: string, hidden: boolean): void;
  /**
   * Gives the key's groups, and any it gets later, the hover's emphasis (`ec-hot`), or takes it away:
   * inside `.ec-hovering`, the paths and icons of the groups without it dim, as their marks do.
   */
  hot(key: string, on: boolean): void;
}

export function svgSurface(options: SvgSurfaceOptions): SvgSurface {
  const { overlay } = options;
  const measure = options.measure ?? textMeasure(overlay);
  const orders = new WeakMap<Element, number>();
  /** Live groups by mark key. */
  const groups = new Map<string, Set<SVGGElement>>();
  const hidden = new Set<string>();
  const hotKeys = new Set<string>();
  /** Each mark's transform, as an effect set it on its body. */
  const transforms = new Map<string, Matrix>();
  const follow = (key: string, transform: Matrix | undefined): void => {
    if (transform) transforms.set(key, transform);
    else if (!transforms.delete(key)) return;
    for (const group of groups.get(key) ?? []) {
      for (const child of Array.from(group.children)) if (child.getAttribute("class") === FOLLOW) setAttributes(child, { transform: transform && transformAttribute(transform) });
    }
  };
  return {
    group(key, slot, order) {
      const group = svgElement("g", { class: hotKeys.has(key) ? "ec-run ec-hot" : "ec-run", "data-key": key, "data-slot": slot, visibility: hidden.has(key) ? "hidden" : undefined }, overlay);
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
        ...svgLayer(group, () => transforms.get(key), (part) => options.colors(key, part)),
        clear() {
          group.remove();
          owner.delete(group);
          if (owner.size === 0 && groups.get(key) === owner) groups.delete(key);
        }
      };
    },
    box: (text, { at, anchor = "start" }) => textBox({ x: at.x, y: at.y, anchor, text }, measure, "ec-text", TEXT_SIZE),
    mark(key) {
      const handle = options.mark(key);
      return {
        set(style) {
          handle.set(style);
          if ("transform" in style) follow(key, style.transform);
        },
        reset() {
          handle.reset();
          follow(key, undefined);
        }
      };
    },
    recolor(key) {
      const live = groups.get(key);
      if (!live) return;
      const styles = markColorStyles(options.colors(key));
      for (const group of live) {
        setStyles(group, styles);
        for (const path of group.querySelectorAll<SVGElement>("[data-part]")) setStyles(path, markColorStyles(options.colors(key, path.getAttribute("data-part")!)));
      }
    },
    hide(key, hide) {
      if (hide) hidden.add(key);
      else hidden.delete(key);
      for (const group of groups.get(key) ?? []) setAttributes(group, { visibility: hide ? "hidden" : undefined });
    },
    hot(key, on) {
      if (on) hotKeys.add(key);
      else hotKeys.delete(key);
      for (const group of groups.get(key) ?? []) group.classList.toggle("ec-hot", on);
    }
  };
}
