// What expressive() takes and returns: effects on SVG marks drawn by other code.

import type { Baseline, EffectSlots, MarkGeometry, Motion, MotionMode } from "../../core";
import type { MarkEvents } from "../types";

/**
 * A CSS selector, an element, a list of elements (a NodeList, an array), or anything shaped like a D3
 * selection, whose `data()` types the callbacks.
 */
export type MarkSource<D> = string | Element | ArrayLike<Element> | { nodes(): Element[]; data(): D[] };

export interface ExpressiveOptions<D> {
  /**
   * The mark's identity, which effects and refresh() follow. Numbers are converted with String().
   * Elements that share a key are one mark; name each part with `segment`.
   */
  readonly key: (datum: D, element: Element) => string | number;
  /**
   * The element's row. Default: the source's `data()` for a selection, otherwise `element.__data__`
   * (the D3 convention). Observable Plot binds the row's index instead: `(el) => rows[el.__data__]`.
   */
  readonly datum?: (element: Element) => D;
  /** Names the parts of a mark that share a key: a stack's series. Segments are ordered from the baseline. */
  readonly segment?: (datum: D, element: Element) => string;
  /**
   * Describes a mark yourself, for shapes the adapter can't read (anything but a `<rect>`). Called once
   * per mark, with its first element in document order, in the coordinates of the marks' nearest
   * common ancestor. Build it with `describe` and give it the key passed in.
   */
  readonly geometry?: (element: Element, datum: D, key: string) => MarkGeometry;
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
   * move between them, and focus plays the hover effects. Escape or leaving the chart stops them.
   */
  readonly keyboard?: boolean;
  /** Dim the other marks while one is hovered (to --ec-dim-opacity). Default false: the host owns its styling. */
  readonly dim?: boolean;
}

export interface Attachment<D> {
  /**
   * Call after the host re-renders: re-reads the marks (from `source` if given, and from then on) and
   * fires enter, update and exit by key. An update means the mark's length or segments changed; a mark
   * that only moved follows without one. Throws, changing nothing, on marks it can't read.
   */
  refresh(source?: MarkSource<D>): void;
  /** Listens for mark events; returns the unsubscribe. */
  on<K extends keyof MarkEvents<D>>(type: K, listener: (event: MarkEvents<D>[K]) => void): () => void;
  /** The marks now attached, in visual order (leaving marks excluded). */
  marks(): readonly MarkGeometry[];
  /** With `keyboard: true`, moves focus to the mark, which plays its hover effects. Does nothing for an unknown key. */
  focus(key: string): void;
  /** Clears every effect and removes everything the adapter added, leaving the host's DOM as it was. */
  destroy(): void;
}
