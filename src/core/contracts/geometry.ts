// The mark contract: how charts and adapters describe a mark, and the only thing geometry effects read.
// See docs/architecture.md#mark-geometry for the conventions.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Outline {
  /** SVG path data in the mark's coordinate space. */
  readonly d: string;
  /** True for areas (bars, slices, markers), false for strokes (lines). */
  readonly closed: boolean;
  /**
   * Closed outlines: n points (n a multiple of 4), walking clockwise on screen from the start-left
   * corner, n/4 per side in the order left, end, right, start, evenly spaced along each side. The
   * corners are at indices 0, n/4, n/2 and 3n/4. Open outlines: n points along the stroke, from
   * start to end inclusive. Morph depends on this.
   */
  sample(n: number): readonly Point[];
}

export interface MarkGeometry {
  /** Stable identity across updates. Segments are keyed "<mark key>/<series>". */
  readonly key: string;
  /** The series this mark or segment belongs to, if any ("goals", "xg"). */
  readonly series?: string;

  // The walk: the route from where the data starts to where it ends.

  /** Equals path(0). */
  readonly start: Point;
  /** Equals path(1). */
  readonly end: Point;
  /** Length of the walk in px; 0 for marks with no direction (a scatter dot). */
  readonly length: number;
  /** t in [0, 1], proportional to distance along the walk. Values outside are clamped. */
  path(t: number): Point;
  /** Direction of travel in radians, in (-PI, PI]; the mark's "up" side is angle - PI/2. */
  angle(t: number): number;
  /** SVG path data for the part of the walk between t0 and t1, in either order. */
  slice(t0: number, t1: number): string;

  // The body: what the mark looks like.

  /** Px across the walk: bar height, ring width, stroke width, marker diameter. */
  readonly thickness: number;
  readonly outline: Outline;
  readonly bounds: Rect;
  /** Visual centre: tooltips, focus rings, labels. */
  readonly center: Point;
  /** Where the mark is attached to the chart: a bar's baseline, a donut's centre. */
  readonly pivot: Point;

  /** Ordered parts, from the baseline (goals, then assists). Every bar has at least one. */
  readonly segments?: readonly MarkGeometry[];
}
