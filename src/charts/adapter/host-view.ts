// hostView(): an attachment as a chart switch's view (M14 step 1), so a switch takes host charts and a
// D3 pie morphs into D3 columns as our donut morphs into our columns. The view is the attachment's own
// handle with what a switch reads of a chart: the host's <svg>; its marks, in their common ancestor's
// space (`space`); the labels the page names, in its font; each mark's key from its elements; the
// host's colour for each mark; and its keyboard's tab stop. While a switch plays, it hides the host's
// marks and those labels inline through the attachment's edits, so what the host had comes back when
// the switch lands, and the attachment's destroy() puts everything back. Like the adapter, it never
// names an effect, and nothing is written into the host's DOM but while a switch plays.

import { matrix } from "../../core";
import { report } from "../../core/report";
import { linkable, portOf } from "../link";
import { setStyles, SVG_NS } from "../render/svg";
import type { ChartSwitchPaint, ChartSwitchView } from "../switch";
import type { ChartLabel } from "../types";
import { insidesOf } from "./expressive";
import { drawnStyle } from "./host-style";
import { between, scaleOf } from "./space";
import type { Attachment } from "./types";

/** A host's `<text>` that names a mark or gives its value, which a chart switch moves and swaps as a chart's labels. */
export interface HostLabel {
  readonly element: SVGTextElement;
  /** The mark's key. */
  readonly key: string;
  /** "category": the mark's name (a slice's outside label, a column's name). "value": its value. */
  readonly role: "category" | "value";
}

export interface HostViewOptions {
  /**
   * The host's labels, each a `<text>` in its `<svg>` with its mark's key and its role, read as each
   * switch starts. Each moves to the label with its key and role in the next view, as a chart's labels
   * do, and swaps its text half way; one with no partner fades. A label whose key is no mark's is left
   * out, and so is everything if it throws (reported). The host's other text fades with its view.
   * Default: none.
   */
  readonly labels?: () => Iterable<HostLabel>;
}

/** An attachment as a chart switch's view: the attachment's own methods, with the view's. */
export interface HostView<D> extends Attachment<D>, ChartSwitchView {
  /** The host's root `<svg>`. Its `aria-label` is what a switch's `announce` says. */
  readonly element: SVGSVGElement;
  /** The marks' nearest common ancestor, whose space marks() and labels() are in. */
  readonly space: Element;
  /** The labels `labels` gives, as a switch draws them: at their anchor, in the host text's computed font and fill. */
  labels(): readonly ChartLabel[];
  /** The host's colour for the mark, its fill or its stroke on a line, as its first part draws it. */
  paintOf(key: string): ChartSwitchPaint | undefined;
  keyOf(element: Element): string | undefined;
  moveTabStop(key: string): boolean;
  morphing(on: boolean): void;
}

/** What a label's copy takes from the host's text, written inline, since the host's CSS may not reach a switch's overlay. */
const FONT = ["font-family", "font-size", "font-style", "font-weight", "font-variant-numeric", "letter-spacing", "word-spacing", "dominant-baseline", "fill"];
/** Those that are lengths, which a transform's scale changes as drawn. */
const LENGTHS = new Set(["font-size", "letter-spacing", "word-spacing"]);

/**
 * The first of a <text>'s `x` or `y` positions, in its user units: as the browser resolves it (a
 * percentage of the viewport, an em), or where there's no layout, as jsdom has none, the number
 * written, a length in user units.
 */
function first(element: SVGTextElement, name: "x" | "y"): number {
  const list = (element as unknown as Partial<Record<"x" | "y", { readonly baseVal?: SVGLengthList }>>)[name]?.baseVal;
  if (list && list.numberOfItems > 0) return list.getItem(0).value;
  return Number.parseFloat(element.getAttribute(name) ?? "") || 0;
}

/** Lengths scaled by `scale`: numbers in px, or with no unit, as SVG's user units; ems, percentages and keywords as they are. */
function scaled(value: string, scale: number): string {
  if (scale === 1) return value;
  return value.replace(/(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px)?(?![\w.%])/gi, (_, n: string, px: string | undefined) => `${Math.round(Number(n) * scale * 1000) / 1000}${px ?? ""}`);
}

/**
 * Makes an attachment that expressive() or fromVegaView() returned a view for chartSwitch: a view's
 * function attaches to the chart it draws in its container and returns hostView(attachment). The
 * host's marks hide while a switch plays and morph in its colours, the labels it's given move and
 * swap, its other parts fade, and with `keyboard: true` focus follows its key. Throws a TypeError on
 * anything else, or on an attachment with no marks yet, which has no `<svg>`.
 */
export function hostView<D>(attachment: Attachment<D>, options: HostViewOptions = {}): HostView<D> {
  const port = typeof attachment === "object" && attachment !== null ? portOf(attachment) : undefined;
  const inside = insidesOf(port);
  if (!port || !inside?.root()) throw new TypeError("hostView needs an attachment that expressive() or fromVegaView() returned, with marks in an <svg>.");
  if (typeof options !== "object" || options === null || (options.labels !== undefined && typeof options.labels !== "function")) {
    throw new TypeError("hostView: labels must be a function that returns the host's labels, such as () => names.map((element) => ({ element, key: element.textContent, role: \"category\" })).");
  }
  const { edits } = inside;
  const svg = (): SVGSVGElement => inside.root()!;
  /** The labels a switch started with, which it draws, and the elements hidden while it plays. */
  let given: readonly HostLabel[] | undefined;
  let hidden: readonly Element[] = [];

  /** The page's labels now: those of a mark's key, in the host's <svg>. */
  function read(): HostLabel[] {
    if (!options.labels) return [];
    const keys = new Set(attachment.marks().map((mark) => mark.key));
    try {
      return Array.from(options.labels()).filter((label) => label?.element?.localName === "text" && svg().contains(label.element) && keys.has(label.key) && (label.role === "category" || label.role === "value"));
    } catch (error) {
      report(error);
      return [];
    }
  }

  /**
   * A label as a switch draws it: its anchor through its transforms in the marks' space, and a <text>
   * in the host's font, sized in that space too, so its transforms' scale is in its lengths: the switch
   * scales it into its overlay with the marks. A rotated label is drawn upright at its anchor while a
   * switch plays.
   */
  function chartLabel({ element, key, role }: HostLabel): ChartLabel {
    const root = svg();
    const m = between(view.space, element, root);
    const at = matrix.apply(m, { x: first(element, "x"), y: first(element, "y") });
    const scale = scaleOf(m);
    const text = element.ownerDocument.createElementNS(SVG_NS, "text");
    text.textContent = element.textContent;
    for (const name of ["dx", "dy"]) {
      const value = element.getAttribute(name);
      if (value !== null) text.setAttribute(name, scaled(value, scale));
    }
    setStyles(text, Object.fromEntries(FONT.map((property) => {
      const value = drawnStyle(element, root, property);
      return [property, (LENGTHS.has(property) ? scaled(value, scale) : value) || undefined];
    })));
    const anchor = drawnStyle(element, root, "text-anchor");
    return { key, role, text: element.textContent ?? "", x: at.x, y: at.y, anchor: anchor === "middle" || anchor === "end" ? anchor : "start", element: text };
  }

  const view: HostView<D> = {
    get element() {
      return svg();
    },
    get space() {
      return inside.ancestor() ?? svg();
    },
    refresh: (source) => attachment.refresh(source),
    update: (next) => attachment.update(next),
    on: (type, listener) => attachment.on(type, listener),
    marks: () => attachment.marks(),
    focus: (key) => attachment.focus(key),
    leave: () => attachment.leave(),
    destroy() {
      given = undefined;
      hidden = [];
      attachment.destroy();
    },
    labels: () => (given ?? read()).map(chartLabel),
    paintOf(key) {
      const color = inside.colorOf(key);
      return color === undefined ? undefined : { color: key, drawn: true, cssColor: color };
    },
    keyOf: (element) => inside.keyOf(element),
    moveTabStop: (key) => inside.moveTabStop(key),
    morphing(on) {
      for (const element of hidden) edits.style(element, "visibility", undefined);
      given = on ? read() : undefined;
      hidden = given ? [...inside.elements(), ...given.map((label) => label.element)] : [];
      for (const element of hidden) edits.style(element, "visibility", "hidden");
      // Through the edits, before the switch adds it, so the class attribute comes back as it was.
      edits.toggleClass(svg(), "ec-morphing", on);
    }
  };
  // A link takes the view, and a switch of host views, through the attachment's hover.
  return linkable(port, view);
}
