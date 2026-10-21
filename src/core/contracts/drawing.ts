// The drawing API: the only way effects touch the screen. Renderer-neutral, so SVG implements it now
// and Canvas can later without changing any effect. src/core/testing has a recording version.

import type { Point } from "./geometry";
import type { Icon } from "./icon";

/**
 * A theme token or any CSS colour. Tokens: "text", "text-muted", "surface", "grid", "axis", "focus",
 * "negative", "series-N" and "series-N-strong" (palette slots 1–8), and "mark" / "mark-strong", the
 * colours of the mark a run belongs to (its first segment's, for a stack).
 */
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
  /** In chart space. Moves the mark's body; its labels and pointer target stay put. */
  readonly transform?: Matrix;
  readonly opacity?: number;
  /** 0–1 toward the series' strong colour. */
  readonly emphasis?: number;
  /**
   * A stroke along the outline, behind the mark. `width` is the stroke width, so half of it shows
   * outside the mark (the prototype's flash peaks at 8). Default colour: the mark's own.
   */
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
  /** The anchor point, on the text's baseline. */
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
  /**
   * Draws an icon, hidden until its first `place()`.
   *
   * Size rule: with `size`, the icon is scaled by `size / icon.size` about its anchor, in icon space,
   * before the `place()` transform. So effects build the transform as if the icon were its natural
   * size, and the anchor still lands where the transform puts it. Icon-space lengths (footprint,
   * radius, the pivot's offset from the anchor) scale by the same factor. A negative size throws.
   *
   * Each shape is one path, in order (the first at the bottom). An unset `fill` or `stroke` draws
   * none; `width` is in icon units (default 1), so it scales with the icon. `clip` is path data in
   * icon space.
   */
  icon(icon: Icon, options?: { readonly size?: number }): IconHandle;
  /** Draws an overlay path, unfilled unless `paint.fill` is given. */
  path(d: string, paint: Paint): PathHandle;
  text(content: string, style: TextStyle): TextHandle;
}
