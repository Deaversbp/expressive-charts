// What expressive() takes and returns: effects on SVG marks drawn by other code.

import type { Baseline, EffectSlots, MarkGeometry, Motion, MotionMode, Sample } from "../../core";
import type { MarkEvents } from "../types";

/**
 * A CSS selector, an element, a list of elements (a NodeList, an array), or anything shaped like a D3
 * selection, whose `data()` types the callbacks. `each` is only there for the types: a D3
 * selection's `data()` is overloaded, and TypeScript infers from the last overload, which takes new
 * data, so the row type is found through `each` instead. The adapter never calls it.
 */
export type MarkSource<D> = string | Element | ArrayLike<Element> | { nodes(): Element[]; data(): D[]; each?(callback: (datum: D) => void): unknown };

export interface ExpressiveOptions<D> {
  /**
   * The mark's identity, which effects and refresh() follow. Numbers are converted with String().
   * Rects that share a key are one mark; name each part with `segment`. A circle or another shape is
   * a mark of its own, so its key is its alone: one it shares with another element throws.
   */
  readonly key: (datum: D, element: Element) => string | number;
  /**
   * The element's row. Default: the source's `data()` for a selection, otherwise `element.__data__`
   * (the D3 convention). Observable Plot binds the row's index instead: `(el) => rows[el.__data__]`.
   */
  readonly datum?: (element: Element) => D;
  /**
   * Names the parts of a mark that share a key: a stack's series. Segments are ordered from the
   * baseline. On a circle or another shape, a mark of its own, it names the mark's series, as
   * `describe`'s `series` does, so a data effect can read that mark through `related`.
   */
  readonly segment?: (datum: D, element: Element) => string;
  /**
   * The value an element shows, so refresh() can tell a change in values from a re-layout. Given, an
   * update means a part's value changed or the mark gained or lost a segment, as on our charts: a resize
   * or a new axis maximum only moves marks. Without it, an update means a length changed. Called for
   * every element, like `key`. Return a number or a string (a date's getTime(), or several values
   * joined), since objects would compare by identity.
   */
  readonly value?: (datum: D, element: Element) => number | string | boolean | null | undefined;
  /**
   * Describes every mark yourself, instead of the adapter reading them. Without it, a `<rect>` is a
   * bar (rects that share a key are its segments; one of its own turned or skewed is a shape), a
   * `<circle>` a point (an ellipse under a transform that stretches it unevenly or skews it), a
   * `<path>` that draws a ring's slice that slice, read with `describe.arc`, and any other `<path>`, a
   * `<line>`, `<polyline>`, `<polygon>` or `<ellipse>` a shape, read with `describe.shape` from its
   * outline, an open one with its stroke width as drawn. Each is read through its transforms, and a
   * shape SVG wouldn't draw (a path with no path data) isn't a mark until it draws something. Any
   * other element (`<text>`, `<g>`, `<use>`, `<image>`) throws, naming its tag. Use this for those,
   * or to say more or other than an element shows: a padded donut's slice as `describe.arc`, which
   * goes round the donut's centre, or a line by its points.
   * Called once per mark, with its first element in document order, in the coordinates of the marks'
   * nearest common ancestor. Build it with `describe` and give it the key passed in.
   */
  readonly geometry?: (element: Element, datum: D, key: string) => MarkGeometry;
  /**
   * Data effects' samples: values along the mark's walk, `{ t, value, at? }`, with `t` in [0, 1] and
   * never decreasing, and finite values. Called on every read for each mark, with its row (its first
   * part's) and its geometry, and for each of its named segments, with that part's row and the
   * segment's geometry. They're checked when read: bad samples throw, changing nothing.
   * `samplesAlong(mark, points)` gives a line its samples from the points that drew it. Default: rects
   * with a numeric `value` get the bar chart's samples (from 0 at the baseline to their total, each
   * segment over its own range), and circles with one get it as their one sample, `{ t: 0, value }`;
   * other marks get none.
   */
  readonly samples?: (datum: D, mark: MarkGeometry) => readonly Sample[];
  /**
   * The edge rects grow from. Default "auto": the line every mark has an edge on, so bars sharing
   * their left edge grow right; a bar whose other edge is on the line grows the other way, like a
   * negative bar.
   */
  readonly baseline?: Baseline | "auto";
  /**
   * Default: the page-wide `motion`. A mode is this attachment's author default: the viewer's choice
   * on the page-wide motion and the device's reduced-motion setting still win.
   */
  readonly motion?: Motion | MotionMode;
  /** NoInfer: a generic data effect such as threshold() must not widen D to unknown. */
  readonly on?: EffectSlots<NoInfer<D>>;
  /**
   * Makes marks focusable with a roving tabindex: Tab reaches one mark, the arrow keys, Home and End
   * move between them in the order `marks()` gives (around a pie, clockwise from 12 o'clock), and
   * focus plays the hover effects. Escape or leaving the chart stops them.
   */
  readonly keyboard?: boolean;
  /**
   * Dim the other marks while one is hovered (to --ec-dim-opacity), and give the hovered one its strong
   * colour, as our charts do: its fill, or its stroke when the fill is none (a line), stepped toward the
   * text colour, so darker in the light theme and lighter in the dark. Default false: the host owns its styling.
   */
  readonly dim?: boolean;
  /**
   * Names each mark for screen readers, as one item: "Okafor: 16 goals, 4 assists". The element that
   * takes the mark's focus (its first part) becomes `role="img"` with this as its aria-label, and the
   * mark's other parts are hidden (`aria-hidden`), so a stack isn't read in pieces. Unnamed host groups
   * around them lose a role that would be read in their place (`img`, `graphics-symbol` or
   * `graphics-object`, as Vega gives them). Given the mark's row (its first part's) and the mark.
   * Called for every mark on each read, never per frame. An empty result, or a throw (reported), leaves
   * that mark's ARIA as the host drew it. Default: the adapter writes no ARIA, and the host names its
   * own marks.
   */
  readonly markLabel?: (datum: D, mark: HostMark<D>) => string;
  /**
   * Follows the host's own transitions, frame by frame, without refresh(): a MutationObserver notes
   * changes to the marks' geometry attributes (d, x, y, width, height, cx, cy, r, rx, ry, x1, y1, x2,
   * y2, points, transform), and to transform and style on their ancestors up to the root <svg>. Once a
   * frame, on the clock, the marks that changed are read again (their rows, geometry and samples) and
   * their effects follow, with no events. Values, colours, stroke widths, names and the elements
   * themselves stay as the last refresh() read them: call refresh() when the host joins new data. `geometry` should read the element, or a row the
   * host updates each frame; one that reads a transition's target row sees only the end. Default false.
   */
  readonly watch?: boolean;
}

/** What `markLabel` is given beside the row: the mark's key and its parts. */
export interface HostMark<D> {
  readonly key: string;
  /** From the baseline, or in document order for marks described with `geometry`. `series` is the part's `segment`. */
  readonly parts: readonly { readonly series: string | undefined; readonly datum: D }[];
}

export interface Attachment<D> {
  /**
   * Call after the host re-renders: re-reads the marks (from `source` if given, and from then on) and
   * fires enter, update and exit by key. An update means a part's `value` changed, or without `value`
   * the mark's length; either way, gaining or losing a segment. A mark that only moved follows without
   * one. Throws, changing nothing, on marks it can't read.
   */
  refresh(source?: MarkSource<D>): void;
  /**
   * Swaps the effects for a new `on`, as a chart's update({ on }) does, and resolves once that's done:
   * at once, since an attachment has no change to settle. A slot given the same effect or preset name
   * keeps its runs, and a slot left out is cleared. A changed slot's runs are cleared and the new effect
   * starts where they were: `decorate` again on every mark, and a held hover replays with the new hover
   * effect. `enter`, `update` and `exit` draw the new effect's end state where theirs were, so nothing
   * enters again. Focus stays on its mark, and the tab stop where it was. A data effect finds the series
   * it reads (`needs`), so it follows a mark of that series as before. Rejects, changing nothing, on an
   * `on` it can't resolve (an unknown preset name), a series a data effect needs that the marks don't
   * have, or any other option, which can't change yet.
   */
  update(next: { readonly on?: EffectSlots<D> }): Promise<void>;
  /** Listens for mark events; returns the unsubscribe. */
  on<K extends keyof MarkEvents<D>>(type: K, listener: (event: MarkEvents<D>[K]) => void): () => void;
  /**
   * The marks now attached, in visual order (leaving marks excluded): bars top to bottom and columns
   * left to right. Other marks (circles, shapes, marks described with `geometry`, and bars among
   * circles or shapes) keep document order, but marks that go round one pivot (a pie's slices: each
   * pivot within 0.5 px of the first, and each mark's `start`, `center` and `end` the same distance
   * from it, more than 0.5 px away) go clockwise from 12 o'clock, by the angle of each mark's
   * `center` about it. Lines that start at one point keep document order.
   */
  marks(): readonly MarkGeometry[];
  /** With `keyboard: true`, moves focus to the mark, which plays its hover effects. Does nothing for an unknown key. */
  focus(key: string): void;
  /**
   * Ends the hover, pointer or keyboard, as the viewer moving away would: the emphasis, the dimming and
   * the hover effects end, and `leave` fires for each mark that was hovered. A link's hover shown here
   * ends too. Focus stays where it is, with its ring, as after Escape; the pointer hovers again when it
   * next moves onto a mark. Does nothing when nothing is hovered.
   */
  leave(): void;
  /** Clears every effect and removes everything the adapter added, leaving the host's DOM as it was. */
  destroy(): void;
}
