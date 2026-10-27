// Icons are path data plus paint, never raw SVG markup, so any renderer can draw them.

import type { Color } from "./drawing";
import type { Point, Rect } from "./geometry";

/** One path of an icon, drawn in order (the first is at the bottom). */
export interface IconShape {
  /** Path data in icon units. */
  readonly d: string;
  /** Unset draws no fill (unlike SVG, where it's black). */
  readonly fill?: Color;
  /** Unset draws no stroke. */
  readonly stroke?: Color;
  /** Stroke width in icon units, so it scales with the icon. Default 1. */
  readonly width?: number;
  /** Default "butt". */
  readonly linecap?: "butt" | "round";
  /** Default "miter". */
  readonly linejoin?: "miter" | "round";
  /** Path data, in icon units, that clips this shape (the ball's panel pattern). */
  readonly clip?: string;
  /** Default "nonzero". "evenodd" leaves a hole where the path's parts overlap, as solid icon sets draw them. */
  readonly fillRule?: "nonzero" | "evenodd";
  /** From 0 to 1, for the whole shape, fill and stroke together (a duotone set's lighter part). Default 1. */
  readonly opacity?: number;
  /** From 0 to 1, the fill's own, inside `opacity` (a set that fades only a part's fill). Default 1. */
  readonly fillOpacity?: number;
  /** From 0 to 1, the stroke's own, inside `opacity`. Default 1. */
  readonly strokeOpacity?: number;
}

/**
 * Build one with defineIcon() or iconFromSvg(), which fill the defaults and check it. Icon units
 * are px at the icon's natural size: `layer.icon(icon, { size })` scales it by size / icon.size
 * about its anchor before `place()`.
 */
export interface Icon {
  readonly name: string;
  /** Drawn facing +x, with its up side towards −y, in icon units. */
  readonly shapes: readonly IconShape[];
  /** Icon-space bounds. */
  readonly box: Rect;
  /** The natural length along the walk, in px (and icon units). */
  readonly size: number;
  /** The icon-space point that sits on the walk. */
  readonly anchor: Point;
  /** What it spins or tilts around. */
  readonly pivot: Point;
  /** Extent along +x from the anchor, which travel keeps inside the mark. */
  readonly footprint: readonly [behind: number, ahead: number];
  /** The gait travel uses unless it's given one. */
  readonly gait?: "roll" | "step" | "slide";
  /** Rolling radius; default box height / 2. */
  readonly radius?: number;
  /** Mirror instead of turning upside down (a boot keeps its sole down). */
  readonly upright?: boolean;
}

/** Resolves icon names; the composition root fills it from the icon registry. */
export interface IconSource {
  get(name: string): Icon | undefined;
}
