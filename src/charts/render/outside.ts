// The focus ring and halos drawn above the marks, masked to outside the mark: they show evenly on every
// side of marks that touch (a donut's slices), and never cover the mark itself. expressive() draws its
// ring and halos this way, since its overlay is above the host's marks, and so does donutChart.

import type { MarkStyle, Matrix, Outline } from "../../core";
import { setAttributes, setStyles, svgElement, transformAttribute } from "./svg";
import { cssColor } from "./theme";

/** The focus ring's px: a gap around the mark, then the ring, as on barChart. */
export const RING_GAP = 2;
export const RING = 2;

/** What the focus ring goes round: the mark's outline as it is on screen, and an effect's transform on it. */
export interface RingTarget {
  readonly outline: Outline;
  /** An open outline (a line) is its stroke's centre: the gap starts at the stroke's edge. */
  readonly thickness: number;
  readonly transform?: Matrix | undefined;
}

export interface MaskedRing {
  /** Draws the ring round `target`, or hides it. */
  draw(target: RingTarget | undefined): void;
}

/** Focus-ring masks made in each document, for their ids: a page's markup doesn't depend on other pages. */
const ringMasks = new WeakMap<Document, number>();
/** Halo masks, for their ids. */
let haloMasks = 0;

/**
 * The focus ring, appended to `parent`: a 2 px ring in --ec-focus, 2 px out from the mark. It's a
 * stroke on the outline, masked to outside the mark and its gap, so it can't cover data or merge with
 * a mark in the focus colour. The gap is left clear rather than painted, since what's behind may be
 * any colour. The mask is in the ring's own user space, so the ring takes an effect's transform whole.
 */
export function maskedRing(parent: SVGGElement): MaskedRing {
  const doc = parent.ownerDocument;
  const number = (ringMasks.get(doc) ?? 0) + 1;
  ringMasks.set(doc, number);
  const mask = svgElement("mask", { id: `ec-focus-mask-${number}`, maskUnits: "userSpaceOnUse", x: -1e5, y: -1e5, width: 2e5, height: 2e5 }, parent);
  svgElement("rect", { x: -1e5, y: -1e5, width: 2e5, height: 2e5, fill: "white" }, mask);
  const hole = svgElement("path", { stroke: "black", "stroke-linejoin": "round" }, mask);
  const ring = svgElement("path", { class: "ec-focus-ring", visibility: "hidden", "stroke-linejoin": "round", mask: `url(#${mask.id})` }, parent);
  setStyles(ring, { fill: "none", stroke: cssColor("focus") });
  return {
    draw(target) {
      if (!target) {
        setAttributes(ring, { visibility: "hidden" });
        return;
      }
      const { outline, thickness, transform } = target;
      // The hole isn't filled for an open outline: a fill would close the line into a polygon and hide
      // the ring along its inside.
      const stroke = outline.closed ? 0 : thickness;
      setAttributes(hole, { d: outline.d, fill: outline.closed ? "black" : "none", "stroke-width": stroke + 2 * RING_GAP });
      setAttributes(ring, {
        d: outline.d,
        "stroke-width": stroke + 2 * (RING_GAP + RING),
        transform: transform && transformAttribute(transform),
        visibility: undefined
      });
    }
  };
}

/** One part of a mark the halo goes round: its outline, and its own colour (what the halo is drawn in by default). */
export interface HaloPart {
  readonly d: string;
  readonly color: string | undefined;
  /** An open outline (a line) is its stroke's centre: the stroke's width. Undefined for a closed outline. */
  readonly stroke?: number | undefined;
}

export interface MaskedHalo {
  /**
   * Strokes each part's outline in a group of its own in `container`, at `width` (half of it outside
   * the mark), masked to outside the mark, so it shows only where it would behind the mark. Around an
   * open outline, the mask cuts out the stroke, as the ring's does, and the halo is stroked at the
   * stroke's width plus its own with round caps, so as much of it shows as round a closed mark, ends
   * included, as svgMarkHandle's halo behind a line does. Moved with the mark's `transform`. No halo,
   * no container or no parts removes it.
   */
  paint(container: SVGGElement | undefined, parts: readonly HaloPart[], halo: MarkStyle["halo"], transform: Matrix | undefined): void;
  remove(): void;
}

export function maskedHalo(): MaskedHalo {
  let group: SVGGElement | undefined;
  const remove = (): void => {
    group?.remove();
    group = undefined;
  };
  return {
    paint(container, parts, halo, transform) {
      if (!halo || !container || parts.length === 0) {
        remove();
        return;
      }
      if (!group || group.parentNode !== container) {
        group?.remove();
        group = svgElement("g", { class: "ec-halo" }, container);
      }
      group.textContent = "";
      const id = `ec-halo-mask-${++haloMasks}`;
      const mask = svgElement("mask", { id, maskUnits: "userSpaceOnUse", x: -1e5, y: -1e5, width: 2e5, height: 2e5 }, group);
      svgElement("rect", { x: -1e5, y: -1e5, width: 2e5, height: 2e5, fill: "white" }, mask);
      for (const part of parts) {
        // Not filled for an open outline: a fill would close the line into a polygon and mask the halo along its inside.
        const cut = part.stroke === undefined ? { fill: "black" } : { fill: "none", stroke: "black", "stroke-width": part.stroke, "stroke-linejoin": "round" };
        svgElement("path", { d: part.d, ...cut }, mask);
      }
      setAttributes(group, { transform: transform && transformAttribute(transform) });
      for (const part of parts) {
        const open = part.stroke !== undefined;
        const path = svgElement(
          "path",
          { d: part.d, "stroke-width": halo.width + (part.stroke ?? 0), "stroke-opacity": halo.opacity, "stroke-linejoin": "round", "stroke-linecap": open ? "round" : undefined, mask: `url(#${id})` },
          group
        );
        setStyles(path, { fill: "none", stroke: halo.color === undefined ? (part.color ?? cssColor("mark")) : cssColor(halo.color) });
      }
    },
    remove
  };
}
