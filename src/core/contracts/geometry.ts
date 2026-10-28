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
  /** SVG path data for the part of the walk between t0 and t1, in either order. It leaves out the gaps. */
  slice(t0: number, t1: number): string;
  /**
   * The stretches of the walk with no data, as [from, to] values of t, in order and apart: each with
   * 0 ≤ from < to ≤ 1, ending at or before the next starts. A line that skips a value has one, from
   * the value before to the value after. The walk runs straight across a gap, so `path` and `angle`
   * work as on any walk, and `outline.sample(n)` runs along it all; `slice()` and an open outline's
   * `d` leave the gaps out, with a moveto across each. Unset means none.
   */
  readonly gaps?: readonly (readonly [from: number, to: number])[];

  // The body: what the mark looks like.

  /** Px across the walk: bar height, ring width, stroke width, marker diameter. */
  readonly thickness: number;
  readonly outline: Outline;
  readonly bounds: Rect;
  /** Visual centre: tooltips, focus rings, labels. */
  readonly center: Point;
  /** Where the mark is attached to the chart: a bar's baseline, a donut's centre. */
  readonly pivot: Point;
  /**
   * The boxes of the text the chart draws for this mark, so an effect's text can keep clear of
   * them: a bar's category and value labels, a slice's label outside the ring, a line's end label.
   * Unset when nothing says where they are (segments, points, and marks the library didn't draw).
   */
  readonly labelBounds?: readonly Rect[];
  /**
   * The boxes of other marks' text near this one, which an effect's text should keep clear of too:
   * a line's are the other lines' end labels, a slice's its neighbours' labels either side. Unset
   * when none is known (bars, segments, points, and marks the library didn't draw).
   */
  readonly nearbyLabels?: readonly Rect[];

  /** Ordered parts, from the baseline (goals, then assists). Every bar has at least one. */
  readonly segments?: readonly MarkGeometry[];
}
