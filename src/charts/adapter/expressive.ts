// expressive(): effects on SVG marks drawn by other code (M1 step 10, for rects). It reads keys, rows
// and geometry from the host's elements, plays the effect slots through the runner on an overlay at
// the end of the root <svg>, and listens for pointer events once, on that <svg>. Keyboard focus is
// barChart's (../keyboard.ts), on the host's elements. Like the charts it never names an effect, and
// destroy() leaves the host's DOM as it found it.
//
// Geometry is in the marks' nearest common ancestor's coordinates. The overlay carries that
// ancestor's transform but sits on the root, because some hosts (Vega) remove foreign children from
// their own groups when they redraw. See docs/ideas/adapter-spike.md.
//
// With `watch`, the host's own transitions are followed frame by frame (./watch.ts): the marks that
// changed are read again and the runner hears change(), as on our charts' frames, with no events.
//
// A link (../link.ts) hovers marks too, as "linked": the dimming and emphasis with `dim`, and their
// hover runs, with no focus ring or focus. It hears the attachment's own hovers.

import type { Baseline, MarkData, MarkGeometry, Matrix, Point, Rect, Sample } from "../../core";
import { defaultClock, matrix } from "../../core";
import { invert } from "../../core/geometry";
import { goesRound } from "../../core/geometry/ring";
import { EFFECT_SLOTS, resolveEffects } from "../../core/registry";
import { report } from "../../core/report";
import { createRunner, type RunInput } from "../../core/runner";
import type { ChartEnv } from "../bar";
import { pointerHover, type PointerHover } from "../interaction";
import { keyboardFocus } from "../keyboard";
import { linkable, own, type LinkListener, type LinkPort } from "../link";
import { chartMotion } from "../motion";
import { maskedRing } from "../render/outside";
import { svgSurface } from "../render/surface";
import { setAttributes, setStyles, transformAttribute } from "../render/svg";
import { injectStyles } from "../render/theme";
import { labelsMoved } from "../shell/transitions";
import type { MarkEvents } from "../types";
import { baselines, describeRects, isBaseline, union, visualOrder, type RectPart } from "./bars";
import { hostEdits } from "./edits";
import { hostColors, hostMarkHandle, type HostMarkHandle, type HostPart } from "./host-style";
import { boundRows, commonAncestor, readSource, rootOf } from "./source";
import { axisAligned, between, boxIn, ownTransform, rectOf, screenMatrices, type ScreenMatrix } from "./space";
import type { Attachment, ExpressiveOptions, MarkSource } from "./types";
import { watchHost, type WatchedChanges } from "./watch";

interface Part<D> extends HostPart {
  readonly datum: D;
  readonly series: string | undefined;
  /** What `value` returned for it; undefined without `value`. */
  readonly value: unknown;
}

/** A mark as read from the host's elements. */
interface ReadMark<D> {
  readonly key: string;
  readonly geometry: MarkGeometry;
  readonly data: MarkData<D>;
  /** From the baseline for bars; in source order for marks described with `geometry`. */
  readonly parts: readonly Part<D>[];
  /** `markLabel`'s name for it; undefined leaves its ARIA as the host drew it. */
  readonly label: string | undefined;
  /** Its place in the source, by its first element: document order, for marks described with `geometry`. */
  readonly index: number;
  /** A rect mark's baseline and the box its rects cover, which watch keeps and orders by. */
  readonly rect?: { readonly edge: Baseline; readonly box: Rect };
}

/** A mark before its data. */
type Drawn<D> = Omit<ReadMark<D>, "data">;
/** A mark before its name: watch keeps the one the last full read gave it. */
type Unnamed<D> = Omit<Drawn<D>, "label">;

/** Where marks are read: the root and the marks' common ancestor, with the elements' screen CTMs and colours. */
interface ReadContext {
  readonly svg: SVGSVGElement;
  readonly common: Element;
  /** Screen CTMs, each read once. */
  readonly screen: ScreenMatrix;
  /** Computed on a full read; watch keeps the last ones, since it doesn't watch colours. */
  readonly colors: (element: Element) => HostPart["colors"];
}

/** An element of a mark as read from the source, before its geometry. */
interface Piece<D> {
  readonly element: Element;
  readonly datum: D;
  readonly series: string | undefined;
  readonly value: unknown;
}

interface Reading<D> {
  readonly root: SVGSVGElement | undefined;
  readonly ancestor: Element | undefined;
  /** In visual order. */
  readonly marks: readonly ReadMark<D>[];
}

interface MarkRecord<D> {
  readonly key: string;
  mark: ReadMark<D>;
  readonly handle: HostMarkHandle;
}

interface Owner<D> {
  readonly record: MarkRecord<D>;
  readonly part: Part<D>;
}

interface Diff<D> {
  readonly entering: MarkRecord<D>[];
  readonly exiting: MarkRecord<D>[];
  /** Values changed: a part's `value`, or without `value` the length, or the segments. */
  readonly changed: { readonly record: MarkRecord<D>; readonly from: MarkGeometry }[];
  /** Only moved, or got a new row: the runner follows without an update. */
  readonly moved: MarkRecord<D>[];
}

type HoverSource = MarkEvents<unknown>["hover"]["source"];
type Listeners<D> = { [K in keyof MarkEvents<D>]: Set<(event: MarkEvents<D>[K]) => void> };

interface Hovered {
  /** The marks' keys: one for the attachment's own hover, any number for a link's. */
  readonly keys: readonly string[];
  readonly source: HoverSource;
  /** Whether their hover runs play: a link with `effects: false` keeps its marks to emphasis and dimming. */
  readonly effects: boolean;
}

const SVG_NS = "http://www.w3.org/2000/svg";
/**
 * Host roles around named marks that unwrapNames takes off when they have no name: images, read as
 * one picture whose children screen readers may skip (`image` is ARIA 1.3's name for `img`), and
 * `graphics-object`, which takes its name from its contents, so the marks' names would be read twice.
 */
const WRAPPING_ROLES = new Set(["img", "image", "graphics-symbol", "graphics-object"]);

export function expressive<D>(target: MarkSource<D>, options: ExpressiveOptions<D>, env: ChartEnv): Attachment<D> {
  checkOptions(options);
  const motion = chartMotion(options.motion, env.motion);
  const effects = resolveEffects(options.on, env.presets);
  const clock = env.clock ?? defaultClock;
  const dim = options.dim === true;
  const edits = hostEdits();
  /** The host's colours per element, kept while an effect or the hover colour overrides them. */
  const colorCache = new WeakMap<Element, ReturnType<typeof hostColors>>();
  let source = target;
  let warnedIndex = false;
  let warnedImage = false;

  // ── Reading the host's marks ───────────────────────────────────────────────

  /** Reads every mark from `from`, changing nothing: it throws on marks it can't read. */
  function read(from: MarkSource<D>): Reading<D> {
    const { elements, data } = readSource(from);
    if (elements.length === 0) return { root: undefined, ancestor: undefined, marks: [] };
    const svg = rootOf(elements);
    const common = commonAncestor(elements, svg);

    const groups = new Map<string, Piece<D>[]>();
    elements.forEach((element, index) => {
      const datum = datumOf(element, index, data);
      const raw: unknown = options.key(datum, element);
      if (raw === undefined || raw === null || raw === "") {
        throw new TypeError(`expressive: key returned ${JSON.stringify(raw) ?? String(raw)} for a <${element.localName}>. Every mark needs a key.`);
      }
      const key = String(raw);
      const series = segmentOf(datum, element, key);
      let group = groups.get(key);
      if (!group) groups.set(key, (group = []));
      else if (series === undefined) throw new RangeError(`expressive: two elements have the key "${key}". Keys must be unique, or name each part with segment.`);
      else if (group.some((part) => part.series === series)) throw new RangeError(`expressive: the mark "${key}" has two "${series}" segments.`);
      group.push({ element, datum, series, value: options.value?.(datum, element) });
    });

    const at: ReadContext = { svg, common, screen: screenMatrices(), colors: (element) => colorsOf(element, svg) };
    const named = (mark: Unnamed<D>): Drawn<D> => ({ ...mark, label: labelOf(mark.key, mark.parts) });
    const keys = [...groups.keys()];

    if (options.geometry) {
      const marks = keys.map((key, index) => named(shapeMark(key, groups.get(key)!, index, at)));
      return { root: svg, ancestor: common, marks: checkNeeds(withData(ringOrder(marks, (mark) => mark.geometry))) };
    }

    const rects = keys.map((key) => groups.get(key)!.map((piece) => rectPiece(key, piece, at)));
    const boxes = rects.map((pieces) => union(pieces.map((p) => p.rect.box)));
    const edges = baselines(boxes, options.baseline ?? "auto");
    const marks = visualOrder(boxes, edges).map((i) => named(rectMark(keys[i]!, rects[i]!, edges[i]!, i, at)));
    return { root: svg, ancestor: common, marks: checkNeeds(withData(marks)) };
  }

  /** A mark described with `geometry`, from its elements in source order. */
  function shapeMark(key: string, pieces: readonly Piece<D>[], index: number, at: ReadContext): Unnamed<D> {
    const first = pieces[0]!;
    const geometry = options.geometry!(first.element, first.datum, key);
    if (typeof geometry !== "object" || geometry === null || geometry.key !== key) {
      throw new TypeError(`expressive: geometry for "${key}" must be a MarkGeometry with the key "${key}". Build it with describe and the key passed in.`);
    }
    const parts = pieces.map((p) => part(p, outlineOf(geometry, p.series, pieces.length), at));
    return { key, geometry, parts, index };
  }

  /**
   * A <rect>'s box in the marks' common coordinates, through its parent's coordinates and its own
   * transform attribute. Its own CSS transform is the adapter's (an effect's), so it isn't read back.
   * Other elements, and rects that aren't upright, throw.
   */
  function rectPiece(key: string, piece: Piece<D>, at: ReadContext): Piece<D> & { readonly rect: RectPart } {
    if (piece.element.localName !== "rect") {
      throw new TypeError(`expressive: can't read the geometry of a <${piece.element.localName}> (mark "${key}"). Only <rect> marks are read; describe others with the geometry option.`);
    }
    const m = matrix.multiply(between(at.common, piece.element.parentElement ?? at.svg, at.svg, at.screen), ownTransform(piece.element));
    if (!axisAligned(m)) {
      throw new TypeError(`expressive: the <rect> of "${key}" is rotated or skewed, so it isn't an upright bar. Describe it with the geometry option.`);
    }
    return { ...piece, rect: { box: boxIn(m, rectOf(piece.element)), series: piece.series, radius: radiusOf(piece.element) } };
  }

  /** A bar from its rects, growing from `edge`: its parts go from the baseline. */
  function rectMark(key: string, pieces: readonly (Piece<D> & { readonly rect: RectPart })[], edge: Baseline, index: number, at: ReadContext): Unnamed<D> {
    const { geometry, order } = describeRects(key, pieces.map((p) => p.rect), edge);
    const segments = geometry.segments ?? [];
    const parts = order.map((j, n) => {
      const segment = segments[n];
      return part(pieces[j]!, segment && segment.length >= 0.5 ? { d: segment.outline.d } : undefined, at);
    });
    return { key, geometry, parts, index, rect: { edge, box: union(pieces.map((p) => p.rect.box)) } };
  }

  function part(piece: Piece<D>, outline: Part<D>["outline"], at: ReadContext): Part<D> {
    const parent = between(at.common, piece.element.parentElement ?? at.svg, at.svg, at.screen);
    return { element: piece.element, datum: piece.datum, series: piece.series, value: piece.value, parent, parentInverse: tryInvert(parent), colors: at.colors(piece.element), outline };
  }

  /**
   * Each mark's data, in the order given: its first part's row and its samples. `related(series)` is
   * the mark's own segment of that series, or else the first other live mark, in visual order, whose
   * series has that name, such as another of a D3 chart's line paths. It's looked up when called, so
   * it sees that mark as last read, by refresh() or by watch. Samples are read and checked here, so
   * bad ones throw before anything changes.
   */
  function withData(marks: readonly Drawn<D>[]): ReadMark<D>[] {
    return marks.map((mark): ReadMark<D> => {
      const { key, geometry, parts } = mark;
      const total = mark.rect ? totalOf(parts) : undefined;
      const samplesOf = (datum: D, of: MarkGeometry, series?: string): readonly Sample[] => {
        if (options.samples) return checkSamples(options.samples(datum, of), series === undefined ? `"${key}"` : `"${key}" (${series})`);
        return total === undefined ? [] : barSamples(geometry, of, total);
      };
      const own = new Map<string, MarkData<D>>();
      const related = (series: string): MarkData<D> | undefined => own.get(series) ?? relatedOf(series, key);
      for (const series of ownSeries(mark)) {
        const datum = (parts.find((p) => p.series === series) ?? parts[0]!).datum;
        own.set(series, { datum, samples: samplesOf(datum, geometry.segments?.find((s) => s.series === series) ?? geometry, series), related });
      }
      return { ...mark, data: { datum: parts[0]!.datum, samples: samplesOf(parts[0]!.datum, geometry), related } };
    });
  }

  /**
   * Data effects name the series they read through `needs.related`, and the marks must have them, so
   * a missing series throws instead of the effect drawing nothing. With no marks yet, there's nothing to check.
   */
  function checkNeeds(marks: ReadMark<D>[]): ReadMark<D>[] {
    if (marks.length === 0) return marks;
    const series = new Set(marks.flatMap((mark) => [...(mark.geometry.series === undefined ? [] : [mark.geometry.series]), ...ownSeries(mark)]));
    for (const slot of EFFECT_SLOTS) {
      const effect = effects[slot];
      if (effect?.kind !== "data") continue;
      for (const name of effect.needs?.related ?? []) {
        if (series.has(name)) continue;
        const known = series.size > 0 ? `the marks' series are ${[...series].map((s) => `"${s}"`).join(", ")}` : "the marks have no series";
        throw new RangeError(
          `expressive: on.${slot} needs the series "${name}", but ${known}. Name each mark's series in its geometry (describe.line({ key, series, … })), or a stack's parts with segment.`
        );
      }
    }
    return marks;
  }

  function datumOf(element: Element, index: number, data: readonly D[] | undefined): D {
    if (options.datum) return options.datum(element);
    if (data) return data[index]!;
    const bound = (element as Element & { __data__?: unknown }).__data__;
    if (typeof bound === "number" && !warnedIndex) {
      warnedIndex = true;
      console.warn("expressive: element.__data__ is a number, which looks like Observable Plot's row index. Pass datum: (el) => rows[el.__data__].");
    }
    return bound as D;
  }

  function segmentOf(datum: D, element: Element, key: string): string | undefined {
    if (!options.segment) return undefined;
    const series: unknown = options.segment(datum, element);
    if (series === undefined || series === null || series === "") throw new TypeError(`expressive: segment returned ${String(series)} for a part of "${key}".`);
    return String(series);
  }

  /** `markLabel`'s name for a mark. Empty, or a throw (reported), is undefined: the host's own ARIA stays. */
  function labelOf(key: string, parts: readonly Part<D>[]): string | undefined {
    if (!options.markLabel) return undefined;
    try {
      const text = String(options.markLabel(parts[0]!.datum, { key, parts: parts.map(({ series, datum }) => ({ series, datum })) }) ?? "");
      return text.trim() === "" ? undefined : text;
    } catch (error) {
      report(error);
      return undefined;
    }
  }

  function colorsOf(element: Element, svg: Element): HostPart["colors"] {
    // While an effect or the hover colour sets it, the computed one is ours: keep the host's from before.
    if ((edits.styled(element, "fill") || edits.styled(element, "stroke")) && colorCache.has(element)) return colorCache.get(element);
    const colors = hostColors(element, svg);
    colorCache.set(element, colors);
    return colors;
  }

  // ── State and the overlay ──────────────────────────────────────────────────

  const first = read(source);
  const doc = first.root?.ownerDocument ?? (typeof document === "undefined" ? undefined : document);
  if (!doc) throw new TypeError("expressive needs a DOM.");
  // The theme tokens the overlay and the focus ring draw in, and the dimming rules: shared, so it stays.
  injectStyles(doc);

  let root: SVGSVGElement | undefined;
  let ancestor: Element | undefined;
  /** Live marks by key, and in visual order. */
  const records = new Map<string, MarkRecord<D>>();
  let order: MarkRecord<D>[] = [];
  /** Marks whose exit effects are still running. */
  const leaving = new Map<string, MarkRecord<D>>();
  /** Every live mark's elements. Events find their mark through it. */
  let owners = new Map<Element, Owner<D>>();
  /** The host's elements around named marks whose role we took off (unwrapNames). */
  let unwrapped = new Set<Element>();
  const listeners: Listeners<D> = { enter: new Set(), update: new Set(), exit: new Set(), hover: new Set(), leave: new Set() };
  let hovered: Hovered | undefined;
  /** The mark showing the focus ring. */
  let ringKey: string | undefined;
  let interaction: PointerHover | undefined;
  /** The link the attachment is in, which hears its own hovers. */
  let linked: LinkListener | undefined;
  let destroyed = false;

  const make = <K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string>, parent?: Element): SVGElementTagNameMap[K] => {
    const created = doc.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
    setAttributes(created, attributes);
    parent?.appendChild(created);
    return created;
  };
  const overlay = make("g", { class: "ec-overlay", "aria-hidden": "true" });
  setStyles(overlay, { "pointer-events": "none" });
  const halos = make("g", { class: "ec-halos" }, overlay);
  const runs = make("g", { class: "ec-runs" }, overlay);
  // The overlay is above the marks, so the ring is masked to outside the mark and its gap: it can't
  // cover data or merge with a bar in the focus colour. The gap is left clear rather than painted in
  // --ec-surface as on barChart, since a host's background may be another colour.
  const ring = maskedRing(overlay);

  const find = (key: string): MarkRecord<D> | undefined => records.get(key) ?? leaving.get(key);
  const surface = svgSurface({
    overlay: runs,
    // Looked up on each call, so the handle follows the mark's record.
    mark: (key) => ({
      set: (style) => find(key)?.handle.set(style),
      reset: () => find(key)?.handle.reset()
    }),
    colors: (key) => find(key)?.mark.parts[0]?.colors
  });
  const runner = createRunner<D>({ effects, motion, icons: env.icons, clock, surface });
  const input = (record: MarkRecord<D>): RunInput<D> => ({ mark: record.mark.geometry, data: record.mark.data });

  function createRecord(mark: ReadMark<D>): MarkRecord<D> {
    const record: MarkRecord<D> = {
      key: mark.key,
      mark,
      // A leaving mark's elements may already belong to another mark (a join by index): leave those alone.
      handle: hostMarkHandle(() => record.mark.parts.filter((p) => (owners.get(p.element)?.record ?? record) === record), edits, () => halos)
    };
    return record;
  }

  // ── Applying a reading ─────────────────────────────────────────────────────

  /** Brings the attachment to `reading` and says what changed. Leaving marks stay until their exit is done. */
  function apply(reading: Reading<D>): Diff<D> {
    if (reading.root && reading.root !== root) moveTo(reading.root);
    ancestor = reading.ancestor ?? ancestor;
    const keys = new Set(reading.marks.map((mark) => mark.key));
    const diff: Diff<D> = { entering: [], exiting: [], changed: [], moved: [] };
    const recolor: string[] = [];
    for (const record of order) {
      if (keys.has(record.key)) continue;
      records.delete(record.key);
      leaving.set(record.key, record);
      diff.exiting.push(record);
    }
    const before = owners;
    owners = new Map();
    order = reading.marks.map((mark) => {
      let record = records.get(mark.key);
      if (record) {
        const from = record.mark;
        // With `value`, a resize or a new axis maximum only moves marks, as on our charts.
        const changed = options.value ? valuesChanged(from.parts, mark.parts) : lengthsChanged(from.geometry, mark.geometry);
        if (changed) diff.changed.push({ record, from: from.geometry });
        else if (geometryChanged(from.geometry, mark.geometry) || from.data.datum !== mark.data.datum || samplesChanged(from.data.samples, mark.data.samples)) {
          diff.moved.push(record);
        }
        if (from.parts[0]?.colors?.color !== mark.parts[0]?.colors?.color) recolor.push(mark.key);
        record.mark = mark;
      } else {
        // A mark that comes back mid-exit keeps its record; the runner cancels its exit.
        record = leaving.get(mark.key);
        if (record) {
          leaving.delete(mark.key);
          record.mark = mark;
        } else {
          record = createRecord(mark);
        }
        records.set(mark.key, record);
        diff.entering.push(record);
      }
      for (const part of mark.parts) owners.set(part.element, { record, part });
      return record;
    });
    // Elements that left their mark, or moved to another one, get back what the host had.
    for (const [el, owner] of before) if (owners.get(el)?.record !== owner.record) edits.restore(el);
    for (const record of order) nameMark(record);
    unwrapNames();

    placeOverlay();
    applyDim();
    for (const record of order) record.handle.repaint();
    for (const key of recolor) surface.recolor(key);
    drawRing();
    return diff;
  }

  /**
   * With `markLabel`, a mark is read as one item: the element that takes its focus is an image named
   * by it (and shown, even if the host hid it), and its other parts are hidden. Each is written again
   * on every read, since a part can become the first (a stack gains a segment) or stop being it.
   */
  function nameMark(record: MarkRecord<D>): void {
    if (!options.markLabel) return;
    const { label, parts } = record.mark;
    parts.forEach((part, index) => {
      const named = label !== undefined && index === 0;
      edits.attribute(part.element, "role", named ? "img" : null);
      edits.attribute(part.element, "aria-label", named ? label : null);
      if (named) edits.remove(part.element, "aria-hidden");
      else edits.attribute(part.element, "aria-hidden", label === undefined ? null : "true");
    });
  }

  /**
   * With `markLabel`, the host's unnamed elements around a named mark's parts lose a wrapping role
   * (WRAPPING_ROLES) and its `aria-roledescription`, so the marks are read as the host's own `<g>`s
   * would leave them: once each, by name. Vega gives the group around each line `graphics-symbol`, an
   * image with no name (which fails WCAG 1.1.1), and the groups above it `graphics-object`. It writes
   * them again when it redraws, so they're taken off on every read, and an element with no named mark
   * inside any more gets its role back.
   */
  function unwrapNames(): void {
    const svg = root;
    const next = new Set<Element>();
    for (const record of options.markLabel && svg ? order : []) {
      if (record.mark.label === undefined) continue;
      for (const part of record.mark.parts) {
        for (let element: Element | null = part.element.parentElement; element && element !== svg && svg?.contains(element); element = element.parentElement) {
          if (next.has(element) || element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby")) continue;
          const role = element.getAttribute("role")?.trim().split(/\s+/)[0];
          if ((role !== undefined && WRAPPING_ROLES.has(role)) || (role === undefined && unwrapped.has(element))) next.add(element);
        }
      }
    }
    for (const element of unwrapped) {
      if (next.has(element)) continue;
      edits.attribute(element, "role", null);
      edits.attribute(element, "aria-roledescription", null);
    }
    for (const element of next) {
      edits.remove(element, "role");
      edits.remove(element, "aria-roledescription");
    }
    unwrapped = next;
  }

  /** The overlay is the root's last child, in the common ancestor's coordinates. */
  function placeOverlay(): void {
    if (!root || !ancestor) return;
    if (root.lastElementChild !== overlay) root.appendChild(overlay);
    overlay.removeAttribute("transform");
    const m = between(overlay, ancestor, root);
    if (!isIdentity(m)) overlay.setAttribute("transform", transformAttribute(m));
  }

  /** Listens on a new root <svg> (Plot draws a new one each time) and moves the overlay there. */
  function moveTo(next: SVGSVGElement): void {
    detach();
    root = next;
    root.appendChild(overlay);
    if ((options.keyboard === true || options.markLabel) && root.getAttribute("role") === "img" && !warnedImage) {
      warnedImage = true;
      console.warn('expressive: the <svg> is role="img", so screen readers read it as one picture and skip the marks inside, with their names and keyboard focus. Make it role="group"; its aria-label can stay.');
    }
    interaction = pointerHover(root, {
      find(eventTarget) {
        const owner = ownerOf(eventTarget);
        if (!owner) return undefined;
        const { key } = owner.record;
        return owner.part.series === undefined ? { key } : { key, segment: owner.part.series };
      },
      hover(hoverTarget, from) {
        const record = records.get(hoverTarget.key);
        // Already playing for keyboard focus: let it go on.
        if (!record || (own(hovered) && hovered.keys[0] === hoverTarget.key)) return;
        endHover();
        startHover([record], from, hoverTarget.segment);
      },
      leave() {
        // Focus holds a keyboard hover until blur or Escape, and a link holds its own.
        if (hovered?.source === "pointer" || hovered?.source === "touch") endHover();
      }
    });
  }

  /** Stops listening on the current root. */
  function detach(): void {
    if (!root) return;
    endHover();
    interaction?.destroy();
    interaction = undefined;
  }

  function ownerOf(eventTarget: EventTarget | null): Owner<D> | undefined {
    for (let node = eventTarget as Element | null; node && node !== root; node = node.parentElement) {
      const owner = owners.get(node);
      if (owner) return owner;
    }
    return undefined;
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  /** Pointer, keyboard and link hover share this; the attachment's own tells its link. */
  function startHover(marks: readonly MarkRecord<D>[], from: HoverSource, segment?: string, effects = true): void {
    const started: Hovered = { keys: marks.map((record) => record.key), source: from, effects };
    hovered = started;
    applyDim();
    if (effects) runner.hover(marks.map(input));
    marks.forEach((record, index) => emit("hover", { ...input(record), batch: { index, count: marks.length }, source: from, ...(segment === undefined ? {} : { segment }) }));
    // A listener may have ended it (a refresh() that removed the mark) or started another (focus()), which told the link itself.
    if (from !== "linked" && hovered === started) linked?.hover(marks.map(input));
  }

  function endHover(): void {
    const current = hovered;
    if (!current) return;
    hovered = undefined;
    applyDim();
    leaveMarks(current.keys);
    if (own(current)) linked?.leave();
  }

  /** The marks' hover runs end in one batch, and each gets a leave event. */
  function leaveMarks(keys: readonly string[]): void {
    const marks = keys.flatMap((key) => find(key) ?? []);
    runner.leave(keys);
    marks.forEach((record, index) => emit("leave", { ...input(record), batch: { index, count: marks.length } }));
  }

  /** After a read: a hover whose marks have all left ends, and a link's goes on with those still here. */
  function dropGone(): void {
    if (hovered === undefined) return;
    const keys = hovered.keys.filter((key) => records.has(key));
    if (keys.length === hovered.keys.length) return;
    if (keys.length === 0) {
      interaction?.clear();
      endHover();
      return;
    }
    const gone = hovered.keys.filter((key) => !records.has(key));
    hovered = { ...hovered, keys };
    leaveMarks(gone);
  }

  /**
   * With `dim`, this attachment's other marks fade while one is hovered, and the hovered one takes its
   * strong colour (its fill, or its stroke on a line), as on our charts. The fade is classes, so host
   * CSS can override it, and only on its own marks, so attachments sharing an <svg> leave each other alone.
   * Both are CSS transitions timed by motion, like the charts'.
   */
  function applyDim(): void {
    if (!dim) return;
    const duration = `${motion.duration(100, "feedback")}ms`;
    for (const record of order) {
      const hot = hovered?.keys.includes(record.key) === true;
      for (const part of record.mark.parts) {
        edits.toggleClass(part.element, "ec-attached", true);
        edits.toggleClass(part.element, "ec-dimmed", hovered !== undefined && !hot);
        edits.style(part.element, "--ec-hover-duration", duration);
      }
      record.handle.hot(hot);
    }
    for (const record of leaving.values()) record.handle.hot(false);
  }

  const unsubscribeMotion = dim ? motion.subscribe(applyDim) : undefined;

  /** The series data effects read through `related`, maybe from other marks. */
  const needed = new Set(
    EFFECT_SLOTS.flatMap((slot) => {
      const effect = effects[slot];
      return effect?.kind === "data" ? (effect.needs?.related ?? []) : [];
    })
  );

  // ── Keyboard ───────────────────────────────────────────────────────────────

  /** The focus ring follows the mark's outline, drawn in the overlay. An open outline (a line from `geometry`) is ringed outside its stroke. */
  function drawRing(): void {
    const record = ringKey === undefined ? undefined : records.get(ringKey);
    ring.draw(record?.mark.geometry);
  }

  // barChart's keyboard focus, with the same hover rules: on the host's elements, written through
  // the edits so destroy() puts back what they had.
  const keyboard =
    options.keyboard === true
      ? keyboardFocus(() => root, {
          find: (eventTarget) => ownerOf(eventTarget)?.record.key,
          order: () => order.map((record) => record.key),
          element: (key) => records.get(key)?.mark.parts[0]?.element as SVGElement | undefined,
          tabIndex(key, value) {
            // A mark that left: apply() already gave its elements back what the host had.
            const record = records.get(key);
            if (!record || value === undefined) return;
            // The first element takes the mark's focus; a click can focus the others. The ring stands in for their own outline.
            record.mark.parts.forEach((part, index) => {
              edits.attribute(part.element, "tabindex", index === 0 ? value : "-1");
              edits.style(part.element, "outline", "none");
            });
          },
          focus(key, visible) {
            ringKey = visible ? key : undefined;
            drawRing();
            const record = records.get(key);
            if (!record) return;
            if (!visible) {
              // Focus from a click or tap: the pointer's own hover plays.
              if (hovered?.source === "keyboard" && hovered.keys[0] !== key) endHover();
              return;
            }
            if (own(hovered) && hovered.keys[0] === key) {
              // Already playing for the pointer: it goes on, held by focus now.
              hovered = { ...hovered, source: "keyboard" };
              return;
            }
            endHover();
            startHover([record], "keyboard");
          },
          blur() {
            ringKey = undefined;
            drawRing();
            if (hovered?.source !== "keyboard") return;
            // The pointer is still over it: the hover goes on, held by the pointer now.
            if (interaction?.current === hovered.keys[0]) hovered = { ...hovered, source: "pointer" };
            else endHover();
          },
          escape() {
            if (!hovered) return false;
            // A link's hover ends where it started, and with it every chart's in the link.
            if (hovered.source === "linked" && linked) linked.dismiss();
            else endHover();
            return true;
          }
        })
      : undefined;

  // ── Watching the host ──────────────────────────────────────────────────────

  const watching = options.watch === true ? watchHost(doc, clock, follow) : undefined;

  /** Watches the live marks' elements from now on, and drops changes not followed yet: the caller has just read them all. */
  function watchMarks(): void {
    watching?.observe(
      order.flatMap((record) => record.mark.parts.map((part) => part.element)),
      root
    );
  }

  /**
   * A frame's changes, with `watch`. The marks whose geometry attributes changed, and every mark inside
   * an ancestor that moved below the marks' common ancestor, are read again, put in visual order again
   * and followed through change(), with no events and no interrupt, as on our charts' frames. An
   * ancestor at or above the common ancestor moves the overlay: the marks' geometry is in that
   * ancestor's coordinates, so it hasn't changed.
   */
  function follow(changes: WatchedChanges): void {
    if (destroyed || !ancestor) return;
    const changed = new Set<MarkRecord<D>>();
    for (const element of changes.marks) {
      const record = owners.get(element)?.record;
      if (record) changed.add(record);
    }
    let overlayMoved = false;
    for (const element of changes.ancestors) {
      if (element.contains(ancestor)) overlayMoved = true;
      else for (const record of order) if (record.mark.parts.some((part) => element.contains(part.element))) changed.add(record);
    }
    if (overlayMoved) placeOverlay();
    if (changed.size === 0) return;

    // Throws (reported by the clock) on marks it can't read, before anything changes.
    const { records, marks } = reread([...changed]);
    records.forEach((record, i) => {
      const mark = marks[i]!;
      record.mark = mark;
      for (const part of mark.parts) owners.set(part.element, { record, part });
      record.handle.repaint();
    });
    order = visual(order);
    if (records.some((record) => record.key === ringKey)) drawRing();
    // As in refresh(): when a mark of a series a data effect needs moves, every other live mark follows too.
    const following = new Set(records);
    if (records.some((record) => needed.has(record.mark.geometry.series ?? ""))) for (const record of order) following.add(record);
    for (const record of following) runner.change(record.mark.geometry, record.mark.data);
  }

  /**
   * The marks that changed again, as the host draws them now: their rows, geometry and samples, in the
   * coordinates of the last full read. Their values, colours and names stay as that read found them,
   * and so do their elements. Bars whose baseline changed come too, though they didn't move. Throws,
   * changing nothing, on marks it can't read.
   */
  function reread(changed: readonly MarkRecord<D>[]): { readonly records: MarkRecord<D>[]; readonly marks: ReadMark<D>[] } {
    const at: ReadContext = { svg: root!, common: ancestor!, screen: screenMatrices(), colors: (element) => owners.get(element)?.part.colors };
    const rowOf = rowsNow();
    const piecesOf = ({ parts }: ReadMark<D>): Piece<D>[] => parts.map((part) => ({ element: part.element, datum: rowOf(part.element), series: part.series, value: part.value }));
    if (options.geometry) {
      const marks = changed.map(({ mark }): Drawn<D> => ({ ...shapeMark(mark.key, piecesOf(mark), mark.index, at), label: mark.label }));
      return { records: [...changed], marks: withData(marks) };
    }
    const rects = new Map(changed.map((record) => [record, piecesOf(record.mark).map((piece) => rectPiece(record.key, piece, at))]));
    const edges = edgesNow(rects);
    for (const record of order) {
      if (!rects.has(record) && edges.get(record) !== record.mark.rect!.edge) rects.set(record, piecesOf(record.mark).map((piece) => rectPiece(record.key, piece, at)));
    }
    const records = [...rects.keys()];
    const marks = records.map((record): Drawn<D> => ({ ...rectMark(record.key, rects.get(record)!, edges.get(record)!, record.mark.index, at), label: record.mark.label }));
    return { records, marks: withData(marks) };
  }

  /**
   * Each live bar's baseline now. With "auto", the edge every bar shares is found again from their
   * boxes (the new ones of the bars read this frame), as a full read would, so a bar that ends a
   * transition on the other side of the line grows from it the other way. In a frame where no edge is
   * shared (a bar crossing the line), each keeps the one it had.
   */
  function edgesNow(rects: ReadonlyMap<MarkRecord<D>, readonly (Piece<D> & { readonly rect: RectPart })[]>): Map<MarkRecord<D>, Baseline> {
    const kept = new Map(order.map((record) => [record, record.mark.rect!.edge]));
    if (options.baseline !== undefined && options.baseline !== "auto") return kept;
    const boxes = order.map((record) => {
      const pieces = rects.get(record);
      return pieces ? union(pieces.map((p) => p.rect.box)) : record.mark.rect!.box;
    });
    try {
      const found = baselines(boxes, "auto");
      return new Map(order.map((record, i) => [record, found[i]!]));
    } catch {
      return kept;
    }
  }

  /** Each element's row now: `datum`'s, a selection's data(), or the element's own `__data__`. */
  function rowsNow(): (element: Element) => D {
    if (options.datum) return options.datum;
    const bound = boundRows(source);
    return (element) => (bound?.has(element) ? bound.get(element)! : datumOf(element, 0, undefined));
  }

  /** The records in visual order, as read() orders marks: by their place in the source and, for bars, their boxes. */
  function visual(records: readonly MarkRecord<D>[]): MarkRecord<D>[] {
    const bySource = [...records].sort((a, b) => a.mark.index - b.mark.index);
    if (options.geometry) return [...ringOrder(bySource, (record) => record.mark.geometry)];
    const boxes = bySource.map((record) => record.mark.rect!.box);
    const edges = bySource.map((record) => record.mark.rect!.edge);
    return visualOrder(boxes, edges).map((i) => bySource[i]!);
  }

  /** The first other live mark of that series, in visual order: another of a D3 chart's line paths. */
  function relatedOf(series: string, key: string): MarkData<D> | undefined {
    return order.find((record) => record.key !== key && record.mark.geometry.series === series)?.mark.data;
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  function emit<K extends keyof MarkEvents<D>>(type: K, event: MarkEvents<D>[K]): void {
    for (const listener of [...listeners[type]]) {
      try {
        listener(event);
      } catch (error) {
        report(error);
      }
    }
  }

  function emitEach(type: "enter" | "exit", marks: readonly MarkRecord<D>[]): void {
    marks.forEach((record, index) => emit(type, { ...input(record), batch: { index, count: marks.length } }));
  }

  // ── First read ─────────────────────────────────────────────────────────────

  runner.enter(apply(first).entering.map(input));
  keyboard?.sync();
  watchMarks();

  const link: LinkPort = {
    targets: () => order.map((record) => ({ key: record.key, marks: [input(record)] })),
    hover(keys, effects) {
      endHover();
      const marks = keys.flatMap((key) => records.get(key) ?? []);
      if (marks.length > 0) startHover(marks, "linked", undefined, effects);
    },
    unlink() {
      if (hovered?.source === "linked") endHover();
    },
    leave() {
      interaction?.clear();
      endHover();
    },
    listen(listener) {
      if (destroyed) return false;
      linked = listener;
      return true;
    }
  };

  return linkable(link, {
    refresh(next) {
      if (destroyed) return;
      // Throws on marks it can't read, before anything changes.
      const reading = read(next ?? source);
      if (next !== undefined) source = next;

      // The order the runner expects: interrupt, then exit / update / enter, then change, then settle.
      runner.interrupt();
      const diff = apply(reading);
      watchMarks();
      dropGone();
      const exited = runner.exit(diff.exiting.map(input));
      emitEach("exit", diff.exiting);
      runner.update(diff.changed.map(({ record, from }) => ({ ...input(record), from })));
      diff.changed.forEach(({ record, from }, index) => emit("update", { ...input(record), from, batch: { index, count: diff.changed.length } }));
      runner.enter(diff.entering.map(input));
      emitEach("enter", diff.entering);
      // A data effect can read another mark through related(series): when a mark of a series one needs
      // changes, moves, comes or goes, every other live mark follows too, with data that sees it.
      const following = new Set([...diff.changed.map((c) => c.record), ...diff.moved]);
      if ([...following, ...diff.entering, ...diff.exiting].some((record) => needed.has(record.mark.geometry.series ?? ""))) {
        const entering = new Set(diff.entering);
        for (const record of order) if (!entering.has(record)) following.add(record);
      }
      for (const record of following) runner.change(record.mark.geometry, record.mark.data);
      runner.settle();
      // Focus stays with its key, on the mark's new element if the host replaced it (Vega does). If the
      // mark left, focus moves to its nearest neighbour. Every mark's tabindex is set again.
      keyboard?.sync();

      void exited.then(() => {
        for (const record of diff.exiting) if (leaving.get(record.key) === record) leaving.delete(record.key);
      });
    },

    on(type, listener) {
      const set = listeners[type] as Set<typeof listener> | undefined;
      if (!set) throw new TypeError(`expressive: unknown event "${String(type)}". Use one of: ${Object.keys(listeners).join(", ")}.`);
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },

    marks: () => order.map((record) => record.mark.geometry),

    focus(key) {
      if (records.has(key) && !destroyed) keyboard?.focus(key);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      hovered = undefined;
      linked?.gone();
      linked = undefined;
      watching?.destroy();
      // The runner resets every mark it styled, through the records, so it goes first.
      runner.destroy();
      unsubscribeMotion?.();
      keyboard?.destroy();
      detach();
      overlay.remove();
      edits.restoreAll();
      for (const set of Object.values(listeners)) set.clear();
      records.clear();
      leaving.clear();
      order = [];
      owners = new Map();
    }
  });
}

function checkOptions<D>(options: ExpressiveOptions<D>): void {
  if (typeof options !== "object" || options === null) throw new TypeError("expressive needs options, with at least a key: { key: (d) => d.name }.");
  if (typeof options.key !== "function") throw new TypeError("expressive needs a key function, for example key: (d) => d.name. Marks are matched by key.");
  for (const name of ["datum", "segment", "value", "geometry", "markLabel"] as const) {
    if (options[name] !== undefined && typeof options[name] !== "function") throw new TypeError(`expressive: ${name} must be a function.`);
  }
  if (options.baseline !== undefined && options.baseline !== "auto" && !isBaseline(options.baseline)) {
    throw new RangeError(`expressive: baseline must be "left", "right", "top", "bottom" or "auto", got ${String(options.baseline)}.`);
  }
}

/** The series a mark has of its own: its segments' and its parts'. */
function ownSeries<D>(mark: Drawn<D>): string[] {
  const names = [...(mark.geometry.segments ?? []).map((s) => s.series), ...mark.parts.map((p) => p.series)];
  return [...new Set(names.filter((name): name is string => name !== undefined))];
}

/** A rect mark's total: the sum of its parts' values when every one is a finite number (from `value`), else undefined. */
function totalOf<D>(parts: readonly Part<D>[]): number | undefined {
  let total = 0;
  for (const { value } of parts) {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    total += value;
  }
  return total;
}

/**
 * The bar chart's samples: from 0 at the baseline to the total at the tip, values in proportion to
 * distance along the bar. A segment's run over its own span of it.
 */
function barSamples(bar: MarkGeometry, of: MarkGeometry, total: number): Sample[] {
  const valueAt = (along: number): number => (bar.length > 0 ? (total * along) / bar.length : 0);
  if (of === bar) {
    return [
      { t: 0, value: 0 },
      { t: 1, value: total }
    ];
  }
  const from = distance(bar.start, of.start);
  return [
    { t: 0, value: valueAt(from) },
    { t: 1, value: valueAt(from + of.length) }
  ];
}

/** A copy of the page's samples, checked: t in [0, 1] and never decreasing, and finite values. */
function checkSamples(samples: unknown, mark: string): Sample[] {
  if (!Array.isArray(samples)) throw new TypeError(`expressive: samples for ${mark} must return an array of { t, value }, got ${describeValue(samples)}.`);
  let last = 0;
  return samples.map((sample: unknown, i): Sample => {
    const { t, value, at } = (typeof sample === "object" && sample !== null ? sample : {}) as Partial<Sample>;
    if (typeof t !== "number" || !(t >= 0 && t <= 1)) throw new RangeError(`expressive: samples for ${mark}: samples[${i}].t must be in [0, 1], got ${describeValue(t)}.`);
    if (t < last) throw new RangeError(`expressive: samples for ${mark} must be in t order: samples[${i}].t is ${t}, after ${last}.`);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new RangeError(`expressive: samples for ${mark}: samples[${i}].value must be a finite number, got ${describeValue(value)}.`);
    }
    last = t;
    return at === undefined ? { t, value } : { t, value, at };
  });
}

function describeValue(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/**
 * The visual order of marks described with `geometry`. Marks that go round one pivot (a pie's
 * slices) are ordered clockwise from 12 o'clock, by the angle of each mark's centre about the pivot,
 * as a ring is read: d3.pie() sorts slices by value but returns them in data order, so document
 * order jumps around the ring. Otherwise it's document order.
 */
function ringOrder<T>(marks: readonly T[], geometryOf: (mark: T) => MarkGeometry): readonly T[] {
  const pivot = marks[0] && geometryOf(marks[0]).pivot;
  if (!pivot || !marks.every((mark) => distance(geometryOf(mark).pivot, pivot) <= 0.5 && goesRound(geometryOf(mark)))) return marks;
  const TURN = 2 * Math.PI;
  const clockwise = (mark: T): number => {
    const { center } = geometryOf(mark);
    // In [0, 2π): 0 straight up (y points down), turning towards +x.
    const angle = Math.atan2(center.x - pivot.x, pivot.y - center.y);
    const turned = angle < 0 ? angle + TURN : angle;
    return turned >= TURN ? 0 : turned;
  };
  // A stable sort: marks at one angle (dots on the pivot) keep document order.
  return marks
    .map((mark) => ({ mark, angle: clockwise(mark) }))
    .sort((a, b) => a.angle - b.angle)
    .map(({ mark }) => mark);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * For a mark described with `geometry`: the part's own segment, or the whole mark for a lone part,
 * with the stroke's width when the outline is open (a line).
 */
function outlineOf(geometry: MarkGeometry, series: string | undefined, parts: number): HostPart["outline"] {
  const segment = series === undefined ? undefined : geometry.segments?.find((s) => s.series === series);
  const shape = segment ?? (parts === 1 ? geometry : undefined);
  if (!shape || (segment && segment.length < 0.5)) return undefined;
  return shape.outline.closed ? { d: shape.outline.d } : { d: shape.outline.d, stroke: shape.thickness };
}

/** The rect's corner radius: rx, or ry when only that is given. */
function radiusOf(element: Element): number {
  const rx = Number.parseFloat(element.getAttribute("rx") ?? "");
  const ry = Number.parseFloat(element.getAttribute("ry") ?? "");
  const radius = Number.isFinite(rx) ? rx : ry;
  return Number.isFinite(radius) && radius > 0 ? radius : 0;
}

function tryInvert(m: Matrix): Matrix | undefined {
  try {
    return invert(m);
  } catch {
    return undefined;
  }
}

function isIdentity(m: Matrix): boolean {
  return Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[4]) < 1e-6 && Math.abs(m[5]) < 1e-6;
}

/** A part's value changed, or the mark gained or lost a segment. Values compare like ===, but NaN equals NaN. */
function valuesChanged<D>(from: readonly Part<D>[], to: readonly Part<D>[]): boolean {
  if (from.length !== to.length) return true;
  const before = new Map(from.map((part) => [part.series, part.value]));
  return to.some((part) => {
    const was = before.get(part.series);
    return !before.has(part.series) || !(was === part.value || Object.is(was, part.value));
  });
}

/** What the adapter can see of a change in values without `value`: a mark's length, or its segments' lengths. */
function lengthsChanged(from: MarkGeometry, to: MarkGeometry): boolean {
  const a = from.segments ?? [];
  const b = to.segments ?? [];
  if (Math.abs(from.length - to.length) > 0.01 || a.length !== b.length) return true;
  return a.some((segment, i) => segment.key !== b[i]!.key || Math.abs(segment.length - b[i]!.length) > 0.01);
}

/** The page's samples changed, though the geometry and the row may not have. */
function samplesChanged(from: readonly Sample[], to: readonly Sample[]): boolean {
  const sameAt = (a: Sample["at"], b: Sample["at"]): boolean => a === b || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime());
  return from.length !== to.length || from.some((a, i) => a.t !== to[i]!.t || a.value !== to[i]!.value || !sameAt(a.at, to[i]!.at));
}

/** Whether a mark moved: its outline, its segments, its thickness (which a line's stroke width changes alone), or its labels' boxes. */
function geometryChanged(from: MarkGeometry, to: MarkGeometry): boolean {
  if (from.outline.d !== to.outline.d || from.thickness !== to.thickness || labelsMoved(from, to)) return true;
  const a = from.segments ?? [];
  const b = to.segments ?? [];
  return a.length !== b.length || a.some((segment, i) => segment.key !== b[i]!.key || segment.outline.d !== b[i]!.outline.d);
}
