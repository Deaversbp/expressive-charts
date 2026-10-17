// The drawing API: the only way effects touch the screen. Renderer-neutral, so SVG implements it now
// and Canvas can later without changing any effect. src/core/testing has a recording version.

import type { Point } from "./geometry";
import type { Icon } from "./icon";

/** A theme token ("text", "text-muted", "negative", "series-3", "mark" = this mark's colour) or any CSS colour. */
export type Color = string;

/**
 * A 2D affine transform in SVG order: x' = a·x + c·y + e, y' = b·x + d·y + f.
 * Build one with the `matrix` helpers.
 */
export type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export interface Paint {
  readonly fill?: Color;
  readonly stroke?: Color;
  readonly width?: number;
  readonly opacity?: number;
  readonly linecap?: "butt" | "round";
}

export interface MarkStyle {
  readonly transform?: Matrix;
  readonly opacity?: number;
  /** 0–1 toward the series' strong colour. */
  readonly emphasis?: number;
  readonly halo?: { readonly width: number; readonly opacity: number; readonly color?: Color };
}

/** Restyles the mark itself. The runner resets it when the run is cleared. */
export interface MarkHandle {
  /** Changes only the fields given, so parallel effects don't undo each other. A field given as undefined goes back to its default. */
  set(style: MarkStyle): void;
  /** Back to the mark's own style. */
  reset(): void;
}

export interface IconHandle {
  /** Moves the icon: a transform from icon space into chart space. The icon is hidden until first placed. */
  place(transform: Matrix): void;
  remove(): void;
}

export interface PathHandle {
  /** Replaces the path data; paint fields given are merged into the current paint. */
  update(d: string, paint?: Partial<Paint>): void;
  remove(): void;
}

/** Effects that label a change ("+2") need text, drawn in theme text colours by default. */
export interface TextStyle {
  readonly at: Point;
  readonly anchor?: "start" | "middle" | "end";
  /** Default "text". Series colours are allowed only for swatches, never for words. */
  readonly color?: Color;
  readonly opacity?: number;
}

export interface TextHandle {
  /** Style fields given are merged into the current style; content is replaced if given. */
  update(style: Partial<TextStyle>, content?: string): void;
  remove(): void;
}

/** One run's own overlay group, above the marks, in chart coordinates. The runner empties it when the run is cleared. */
export interface Layer {
  icon(icon: Icon, options?: { readonly size?: number }): IconHandle;
  path(d: string, paint: Paint): PathHandle;
  text(content: string, style: TextStyle): TextHandle;
}
