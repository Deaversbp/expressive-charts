// Icons are path data plus paint, never raw SVG markup, so any renderer can draw them.

import type { Color } from "./drawing";
import type { Point, Rect } from "./geometry";

export interface IconShape {
  readonly d: string;
  readonly fill?: Color;
  readonly stroke?: Color;
  readonly width?: number;
  /** Path data that clips this shape (the ball's panel pattern). */
  readonly clip?: string;
}

export interface Icon {
  readonly name: string;
  /** Drawn facing +x, in icon units. */
  readonly shapes: readonly IconShape[];
  /** Icon-space bounds. */
  readonly box: Rect;
  /** Default rendered length along the walk, in px. */
  readonly size: number;
  /** The icon-space point that sits on the walk. */
  readonly anchor: Point;
  /** What it spins or tilts around. */
  readonly pivot: Point;
  /** Extent along +x from the anchor. */
  readonly footprint: readonly [behind: number, ahead: number];
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
