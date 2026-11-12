// hostView(): an attachment as a chart switch's view (M14 step 1), so a switch takes host charts and a
// D3 pie morphs into D3 columns as our donut morphs into our columns. The view is the attachment's own
// handle with what a switch reads of a chart: the host's <svg>; its marks, in their common ancestor's
// space (`space`); the labels the page names, in its font; each mark's key from its elements; the
// host's colour for each mark; its keyboard's tab stop; and the guides the page names, which stay put
// when the next view draws them the same. While a switch plays, it hides the host's marks, those
// labels and those guides inline through the attachment's edits, so what the host had comes back when
// the switch lands, and the attachment's destroy() puts everything back. A host drawn again mid-switch
// is hidden again as it is then, after each refresh, so its new marks, labels and guides stay hidden
// too. Like the adapter, it never names an effect, and nothing is written into the host's DOM but
// while a switch plays.
//
// Several attachments on one <svg> make one view (M16 step 3), as a dumbbell's dots and connectors
// are one chart: its marks are all of theirs, in their ancestors' nearest common ancestor's space, and
// a mark's focus, tab stop, colour and hiding go to the attachment it's from. Each key is one mark's:
// a key two of them have stays the first's. Its labels and guides are the whole <svg>'s. It has no one
// hover for a link, so it takes no part in a link of its switch, and a link between the attachments
// goes on as it was.

import { matrix } from "../../core";
import { report } from "../../core/report";
import { linkable, portOf, type LinkPort, type RowsOf } from "../link";
import { setStyles, SVG_NS } from "../render/svg";
import type { ChartSwitchGuide, ChartSwitchPaint, ChartSwitchView } from "../switch";
import type { ChartLabel } from "../types";
import { insidesOf, type Insides } from "./expressive";
import { drawnStyle } from "./host-style";
import { between, mapMark, scaleOf } from "./space";
import type { Attachment } from "./types";

/** A host's `<text>` that names a mark or gives its value, which a chart switch moves and swaps as a chart's labels. */
export interface HostLabel {
  readonly element: SVGTextElement;
  /** The mark's key. */
  readonly key: string;
  /** "category": the mark's name (a slice's outside label, a column's name). "value": its value. */
  readonly role: "category" | "value";
}

/** A part of the host's drawing that a chart switch keeps where it is when the next view draws it the same: an axis, a grid, a tick. */
export interface HostGuide {
  /** An element in the host's `<svg>`, drawn as it is, with everything in it. */
  readonly element: Element;
  /** Its own key: it pairs with the next view's guide with this key, never with a mark or a label. */
  readonly key: string;
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
  /**
   * The host's guides (an axis, a grid, a tick), each an element in its `<svg>` with a key of its
   * own, read as each switch starts. One whose key the next view's guides have too stays on screen at
   * full strength, where it is, while the switch plays, when the two are drawn the same; every other
   * fades with its view. One that isn't in the `<svg>`, or has no key, is left out, and so is
   * everything if it throws (reported). Default: none.
   */
  readonly guides?: () => Iterable<HostGuide>;
}

/**
 * An attachment, or several on one `<svg>`, as a chart switch's view: the attachment's own methods, or
 * each of theirs, with the view's.
 */
export interface HostView<D> extends Attachment<D>, ChartSwitchView {
  /** The host's root `<svg>`, which its attachments share. Its `aria-label` is what a switch's `announce` says. */
  readonly element: SVGSVGElement;
  /** The marks' nearest common ancestor, whose space marks() and labels() are in: every attachment's marks'. */
  readonly space: Element;
  /** The labels `labels` gives, as a switch draws them: at their anchor, in the host text's computed font and fill. */
  labels(): readonly ChartLabel[];
  /** The guides `guides` gives: each the host's own element, with its key. */
  guides(): readonly ChartSwitchGuide[];
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

/** One of a view's attachments: its port and insides, and what the view hid of its elements through its edits. */
interface Part<D> {
  readonly attachment: Attachment<D>;
  readonly port: LinkPort;
  readonly inside: Insides;
  hidden: readonly Element[];
}

/**
 * Makes an attachment that expressive() or fromVegaView() returned a view for chartSwitch: a view's
 * function attaches to the chart it draws in its container and returns hostView(attachment). The
 * host's marks hide while a switch plays and morph in its colours, the labels it's given move and
 * swap, its other parts fade, and with `keyboard: true` focus follows its key. Throws a TypeError on
 * anything else, or on an attachment with no marks yet, which has no `<svg>`.
 */
export function hostView<D>(attachment: Attachment<D>, options?: HostViewOptions): HostView<D>;
/**
 * Makes several attachments on one `<svg>` one view for chartSwitch, as a chart drawn with several
 * (a dumbbell's dots and its connectors) is one chart: its marks are all of theirs, and each mark's
 * focus, tab stop, colour and hiding go to the attachment it's from. Its rows are theirs, as a union.
 * Throws a TypeError, naming it, on anything but attachments with marks, on two in different `<svg>`s,
 * and on a key two of them give a mark: key each one's marks apart (`first@Okafor`). An array of one
 * makes that attachment's view.
 */
export function hostView<A extends Attachment<unknown>>(attachments: readonly A[], options?: HostViewOptions): HostView<RowsOf<A>>;
export function hostView<D>(attachments: Attachment<D> | readonly Attachment<D>[], options: HostViewOptions = {}): HostView<D> {
  const list: readonly Attachment<D>[] = Array.isArray(attachments) ? attachments : [attachments as Attachment<D>];
  if (list.length === 0) throw new TypeError("hostView needs an attachment, or an array of attachments on one <svg>: hostView([dots, connectors]).");
  const parts = list.map((attachment, i): Part<D> => {
    const port = typeof attachment === "object" && attachment !== null ? portOf(attachment) : undefined;
    const inside = insidesOf(port);
    if (!port || !inside?.root()) {
      throw new TypeError(list === attachments ? `hostView needs attachments that expressive() or fromVegaView() returned, each with marks in an <svg>: attachments[${i}] isn't one.` : "hostView needs an attachment that expressive() or fromVegaView() returned, with marks in an <svg>.");
    }
    if (list.indexOf(attachment) !== i) throw new TypeError(`hostView: attachments[${i}] is attachments[${list.indexOf(attachment)}] again. Each attachment is in a view once.`);
    return { attachment, port, inside, hidden: [] };
  });
  if (typeof options !== "object" || options === null || (options.labels !== undefined && typeof options.labels !== "function")) {
    throw new TypeError("hostView: labels must be a function that returns the host's labels, such as () => names.map((element) => ({ element, key: element.textContent, role: \"category\" })).");
  }
  if (options.guides !== undefined && typeof options.guides !== "function") {
    throw new TypeError("hostView: guides must be a function that returns the host's guides, such as () => [{ element: svg.querySelector(\"g.axis\"), key: \"y\" }].");
  }
  const lead = parts[0]!;
  /** Several attachments: one view of them, with no one hover for a link. */
  const several = parts.length > 1;
  // The labels and guides (the page's, of the whole <svg>) and the class through the first's edits.
  const { edits } = lead.inside;
  const svg = (): SVGSVGElement => lead.inside.root()!;
  /** While a switch plays: the labels and guides last read, and the <svg> that took `ec-morphing`. Each part keeps the elements it hid. */
  let given: readonly HostLabel[] | undefined;
  let guided: readonly HostGuide[] | undefined;
  let classed: SVGSVGElement | undefined;
  const clash = several ? clashOf(parts, svg()) : undefined;
  if (clash) throw new TypeError(`hostView: ${clash.problem}.`);

  /** The attachments whose marks are in the first's <svg>: all of them, unless a host drew one of them in another. */
  const drawn = (): Part<D>[] => parts.filter((part) => part.inside.root() === svg());
  /** The attachment with the mark `key`: the first that has it. */
  const ownerOf = (key: string): Part<D> | undefined => drawn().find((part) => part.attachment.marks().some((mark) => mark.key === key));

  /** The page's labels now: those of a mark's key, in the host's <svg>. */
  function read(): HostLabel[] {
    if (!options.labels) return [];
    const keys = new Set(drawn().flatMap((part) => part.attachment.marks().map((mark) => mark.key)));
    try {
      return Array.from(options.labels()).filter((label) => label?.element?.localName === "text" && svg().contains(label.element) && keys.has(label.key) && (label.role === "category" || label.role === "value"));
    } catch (error) {
      report(error);
      return [];
    }
  }

  /** The page's guides now: elements in the host's <svg>, each with a key. */
  function guides(): HostGuide[] {
    if (!options.guides) return [];
    const root = svg();
    try {
      return Array.from(options.guides()).filter((guide) => (guide?.element as Node | undefined)?.nodeType === 1 && guide.element !== root && root.contains(guide.element) && typeof guide.key === "string");
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

  /**
   * While a switch plays (`on`): hides the live marks' elements and the page's labels and guides, read
   * again, as they are now, and gives their <svg> `ec-morphing`. What it hid that the host still draws
   * stays hidden (a mark the host takes away in a transition of its own, which the switch draws
   * still), and the rest is given back. Not `on`: everything is given back. Each attachment's elements
   * through its own edits, and the labels, the guides and the class through the first's; an element two
   * of them have, through the first's. Everything goes back before anything is hidden again, so an
   * element that moved from one to another is given back by the one and hidden by the other. As a
   * switch starts, the attachments of several that a refresh has left in two <svg>s, or with a key two
   * of them have, are reported.
   */
  const hide = (on: boolean): void => {
    if (on && given === undefined && several) {
      const found = clashOf(parts, svg());
      if (found) report(new TypeError(`hostView: ${found.problem}. The switch plays on, and ${found.left}.`));
    }
    const root = on ? svg() : undefined;
    given = on ? read() : undefined;
    guided = on ? guides() : undefined;
    const named = [...(given ?? []).map((label) => label.element), ...(guided ?? []).map((guide) => guide.element)];
    const now = parts.map(({ inside, hidden }, i) => new Set(given ? [...inside.elements(), ...(i === 0 ? named : []), ...hidden.filter((element) => root?.contains(element))] : []));
    for (let i = 1; i < now.length; i++) for (const element of now[i]!) if (now.some((earlier, j) => j < i && earlier.has(element))) now[i]!.delete(element);
    parts.forEach((part, i) => {
      for (const element of part.hidden) if (!now[i]!.has(element)) part.inside.edits.style(element, "visibility", undefined);
    });
    parts.forEach((part, i) => {
      part.hidden = [...now[i]!];
      for (const element of part.hidden) part.inside.edits.style(element, "visibility", "hidden");
    });
    // Through the edits, before the switch adds it, so the class attribute comes back as it was; on
    // the <svg> the marks are in now, if the host drew a new one.
    if (classed !== root) {
      if (classed) edits.toggleClass(classed, "ec-morphing", false);
      if (root) edits.toggleClass(root, "ec-morphing", true);
      classed = root;
    }
  };

  const view: HostView<D> = {
    get element() {
      return svg();
    },
    get space() {
      // The nearest element that holds every attachment's marks' ancestor.
      const root = svg();
      const [space, ...others] = drawn().map((part) => part.inside.ancestor() ?? root);
      let common = space!;
      for (const other of others) while (common !== root && !common.contains(other)) common = common.parentElement ?? root;
      return common;
    },
    refresh(source) {
      if (several && source !== undefined) throw new TypeError("hostView: a view of several attachments refreshes each from what it last read, with refresh(). To read new sources, refresh each attachment with its own.");
      for (const { attachment } of parts) attachment.refresh(source);
    },
    update: (next) => (several ? Promise.all(parts.map(({ attachment }) => attachment.update(next))).then(() => {}) : lead.attachment.update(next)),
    on(type, listener) {
      const stops = parts.map(({ attachment }) => attachment.on(type, listener));
      return several ? () => stops.forEach((stop) => stop()) : stops[0]!;
    },
    marks() {
      // Each attachment's in the view's space, mapped there from its own marks' ancestor's; a key two
      // of them have stays the first's.
      const root = svg();
      const space = view.space;
      const keys = new Set<string>();
      return drawn().flatMap(({ attachment, inside }) => {
        const ancestor = inside.ancestor() ?? root;
        const m = ancestor === space ? undefined : between(space, ancestor, root);
        return attachment.marks().flatMap((mark) => (keys.has(mark.key) ? [] : (keys.add(mark.key), [m ? mapMark(mark, m) : mark])));
      });
    },
    focus: (key) => ownerOf(key)?.attachment.focus(key),
    leave() {
      for (const { attachment } of parts) attachment.leave();
    },
    destroy() {
      given = guided = classed = undefined;
      for (const part of parts) part.hidden = [];
      for (const { attachment } of [...parts].reverse()) attachment.destroy();
    },
    labels: () => (given ?? read()).map(chartLabel),
    guides: () => guided ?? guides(),
    paintOf(key) {
      for (const { inside } of drawn()) {
        const color = inside.colorOf(key);
        if (color !== undefined) return { color: key, drawn: true, cssColor: color };
      }
      return undefined;
    },
    keyOf(element) {
      for (const { inside } of parts) {
        const key = inside.keyOf(element);
        if (key !== undefined) return key;
      }
      return undefined;
    },
    moveTabStop: (key) => drawn().some(({ inside }) => inside.moveTabStop(key)),
    morphing: hide
  };
  // After every refresh while a switch plays, however it came (the page's, or fromVegaView()'s after
  // a Vega render), of any of its attachments: the switch plays on with the pairs it began with, over
  // the host's new drawing.
  for (const { inside } of parts) {
    inside.refreshed.add(() => {
      if (given) hide(true);
    });
  }
  // A link takes the view, and a switch of host views, through the attachment's hover. A view of
  // several has no one hover, so it takes no part: its attachments' own link goes on.
  return several ? view : linkable(lead.port, view);
}

/**
 * What keeps several attachments from being one view, as words for a TypeError, with what the view
 * leaves out while it lasts: one whose marks are in another <svg> than the first's, or a key two of
 * them give a mark. Undefined when there's nothing.
 */
function clashOf<D>(parts: readonly Part<D>[], root: SVGSVGElement): { readonly problem: string; readonly left: string } | undefined {
  const owners = new Map<string, number>();
  for (const [i, { attachment, inside }] of parts.entries()) {
    if (inside.root() !== root) return { problem: `attachments[${i}]'s marks are in another <svg> than attachments[0]'s, and a view's attachments share one`, left: `attachments[${i}]'s marks are left out` };
    for (const { key } of attachment.marks()) {
      const owner = owners.get(key);
      if (owner !== undefined && owner !== i) {
        return {
          problem: `attachments[${owner}] and attachments[${i}] both have a mark with the key ${JSON.stringify(key)}, and each key must be one mark's. Key each one's marks apart, such as (d) => \`first@\${d.name}\``,
          left: `the key stays attachments[${owner}]'s: attachments[${i}]'s mark is left out`
        };
      }
      owners.set(key, i);
    }
  }
  return undefined;
}
