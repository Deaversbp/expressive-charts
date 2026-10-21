// expressive(): effects on SVG marks drawn by other code (M1 step 10, for rects). It reads keys, rows
// and geometry from the host's elements, plays the effect slots through the runner on an overlay at
// the end of the root <svg>, and listens for pointer events once, on that <svg>. Keyboard focus is
// barChart's (../keyboard.ts), on the host's elements. Like the charts it never names an effect, and
// destroy() leaves the host's DOM as it found it.
//
// Geometry is in the marks' nearest common ancestor's coordinates. The overlay carries that
// ancestor's transform but sits on the root, because some hosts (Vega) remove foreign children from
// their own groups when they redraw. See docs/ideas/adapter-spike.md.

import type { MarkData, MarkGeometry, Matrix } from "../../core";
import { defaultClock } from "../../core";
import { invert } from "../../core/geometry";
import { resolveEffects } from "../../core/registry";
import { report } from "../../core/report";
import { createRunner, type RunInput } from "../../core/runner";
import type { ChartEnv } from "../bar";
import { pointerHover, type PointerHover } from "../interaction";
import { keyboardFocus } from "../keyboard";
import { chartMotion } from "../motion";
import { svgSurface } from "../render/surface";
import { setAttributes, setStyles, transformAttribute } from "../render/svg";
import { cssColor, injectStyles } from "../render/theme";
import type { MarkEvents } from "../types";
import { baselines, describeRects, isBaseline, union, visualOrder, type RectPart } from "./bars";
import { hostEdits } from "./edits";
import { hostColors, hostMarkHandle, type HostMarkHandle, type HostPart } from "./host-style";
import { commonAncestor, readSource, rootOf } from "./source";
import { axisAligned, between, boxIn, rectOf } from "./space";
import type { Attachment, ExpressiveOptions, MarkSource } from "./types";

interface Part<D> extends HostPart {
  readonly datum: D;
  readonly series: string | undefined;
}

/** A mark as read from the host's elements. */
interface ReadMark<D> {
  readonly key: string;
  readonly geometry: MarkGeometry;
  readonly data: MarkData<D>;
  /** From the baseline for bars; in source order for marks described with `geometry`. */
  readonly parts: readonly Part<D>[];
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
  /** The length or segments changed, which is what the adapter can see of a change in values. */
  readonly changed: { readonly record: MarkRecord<D>; readonly from: MarkGeometry }[];
  /** Only moved, or got a new row: the runner follows without an update. */
  readonly moved: MarkRecord<D>[];
}

type HoverSource = "pointer" | "touch" | "keyboard";
type Listeners<D> = { [K in keyof MarkEvents<D>]: Set<(event: MarkEvents<D>[K]) => void> };

const SVG_NS = "http://www.w3.org/2000/svg";
const ONE = { index: 0, count: 1 } as const;

export function expressive<D>(target: MarkSource<D>, options: ExpressiveOptions<D>, env: ChartEnv): Attachment<D> {
  checkOptions(options);
  const motion = chartMotion(options.motion, env.motion);
  const effects = resolveEffects(options.on, env.presets);
  const clock = env.clock ?? defaultClock;
  const dim = options.dim === true;
  const edits = hostEdits();
  /** The host's colours per element, kept while an effect overrides the fill. */
  const colorCache = new WeakMap<Element, ReturnType<typeof hostColors>>();
  let source = target;
  let warnedIndex = false;

  // ── Reading the host's marks ───────────────────────────────────────────────

  /** Reads every mark from `from`, changing nothing: it throws on marks it can't read. */
  function read(from: MarkSource<D>): Reading<D> {
    const { elements, data } = readSource(from);
    if (elements.length === 0) return { root: undefined, ancestor: undefined, marks: [] };
    const svg = rootOf(elements);
    const common = commonAncestor(elements, svg);

    const groups = new Map<string, { element: Element; datum: D; series: string | undefined }[]>();
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
      group.push({ element, datum, series });
    });

    const part = (p: { element: Element; datum: D; series: string | undefined }, outline: string | undefined): Part<D> => {
      const parent = between(common, p.element.parentElement ?? svg, svg);
      return { element: p.element, datum: p.datum, series: p.series, parent, parentInverse: tryInvert(parent), colors: colorsOf(p.element, svg), outline };
    };
    const keys = [...groups.keys()];

    if (options.geometry) {
      const describeMark = options.geometry;
      const marks = keys.map((key): ReadMark<D> => {
        const group = groups.get(key)!;
        const first = group[0]!;
        const geometry = describeMark(first.element, first.datum, key);
        if (typeof geometry !== "object" || geometry === null || geometry.key !== key) {
          throw new TypeError(`expressive: geometry for "${key}" must be a MarkGeometry with the key "${key}". Build it with describe and the key passed in.`);
        }
        const parts = group.map((p) => part(p, outlineOf(geometry, p.series, group.length)));
        return { key, geometry, data: markData(parts), parts };
      });
      return { root: svg, ancestor: common, marks };
    }

    const rects = keys.map((key) =>
      groups.get(key)!.map((p) => {
        if (p.element.localName !== "rect") {
          throw new TypeError(`expressive: can't read the geometry of a <${p.element.localName}> (mark "${key}"). Only <rect> marks are read; describe others with the geometry option.`);
        }
        const m = between(common, p.element, svg);
        if (!axisAligned(m)) {
          throw new TypeError(`expressive: the <rect> of "${key}" is rotated or skewed, so it isn't an upright bar. Describe it with the geometry option.`);
        }
        const rect: RectPart = { box: boxIn(m, rectOf(p.element)), series: p.series, radius: radiusOf(p.element) };
        return { ...p, rect };
      })
    );
    const boxes = rects.map((parts) => union(parts.map((p) => p.rect.box)));
    const edges = baselines(boxes, options.baseline ?? "auto");
    const marks = visualOrder(boxes, edges).map((i): ReadMark<D> => {
      const key = keys[i]!;
      const { geometry, order } = describeRects(key, rects[i]!.map((p) => p.rect), edges[i]!);
      const segments = geometry.segments ?? [];
      const parts = order.map((j, n) => {
        const segment = segments[n];
        return part(rects[i]![j]!, segment && segment.length >= 0.5 ? segment.outline.d : undefined);
      });
      return { key, geometry, data: markData(parts), parts };
    });
    return { root: svg, ancestor: common, marks };
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

  function colorsOf(element: Element, svg: Element): HostPart["colors"] {
    // While an effect sets the fill, the computed fill is ours: keep the host's from before.
    if (edits.styled(element, "fill") && colorCache.has(element)) return colorCache.get(element);
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
  const listeners: Listeners<D> = { enter: new Set(), update: new Set(), exit: new Set(), hover: new Set(), leave: new Set() };
  let hovered: { readonly key: string; readonly source: HoverSource } | undefined;
  /** The mark showing the focus ring. */
  let ringKey: string | undefined;
  let interaction: PointerHover | undefined;
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
  const ring = make("path", { class: "ec-focus-ring", visibility: "hidden", "stroke-width": "2", "stroke-linejoin": "round" }, overlay);
  setStyles(ring, { fill: "none", stroke: cssColor("focus") });

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
        if (lengthsChanged(from.geometry, mark.geometry)) diff.changed.push({ record, from: from.geometry });
        else if (geometryChanged(from.geometry, mark.geometry) || from.data.datum !== mark.data.datum) diff.moved.push(record);
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

    placeOverlay();
    applyDim();
    for (const record of order) record.handle.repaint();
    for (const key of recolor) surface.recolor(key);
    drawRing();
    return diff;
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
        if (!record || hovered?.key === hoverTarget.key) return;
        endHover();
        startHover(record, from, hoverTarget.segment);
      },
      leave() {
        // Focus holds a keyboard hover until blur or Escape.
        if (hovered?.source !== "keyboard") endHover();
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

  function startHover(record: MarkRecord<D>, from: HoverSource, segment?: string): void {
    hovered = { key: record.key, source: from };
    applyDim();
    runner.hover([input(record)]);
    emit("hover", { ...input(record), batch: ONE, source: from, ...(segment === undefined ? {} : { segment }) });
  }

  function endHover(): void {
    const current = hovered;
    if (!current) return;
    hovered = undefined;
    const record = find(current.key);
    applyDim();
    runner.leave([current.key]);
    if (record) emit("leave", { ...input(record), batch: ONE });
  }

  /**
   * With `dim`, this attachment's other marks fade while one is hovered: classes, so host CSS can
   * override them, and only on its own marks, so attachments sharing an <svg> leave each other alone.
   * The fade is a CSS transition timed by motion, like the charts'.
   */
  function applyDim(): void {
    if (!dim) return;
    const duration = `${motion.duration(100, "feedback")}ms`;
    for (const record of order) {
      const dimmed = hovered !== undefined && hovered.key !== record.key;
      for (const part of record.mark.parts) {
        edits.toggleClass(part.element, "ec-attached", true);
        edits.toggleClass(part.element, "ec-dimmed", dimmed);
        edits.style(part.element, "--ec-hover-duration", duration);
      }
    }
  }

  const unsubscribeMotion = dim ? motion.subscribe(applyDim) : undefined;

  // ── Keyboard ───────────────────────────────────────────────────────────────

  /** The focus ring follows the mark's outline, drawn in the overlay. */
  function drawRing(): void {
    const record = ringKey === undefined ? undefined : records.get(ringKey);
    if (record) setAttributes(ring, { d: record.mark.geometry.outline.d, visibility: undefined });
    else setAttributes(ring, { visibility: "hidden" });
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
              if (hovered?.source === "keyboard" && hovered.key !== key) endHover();
              return;
            }
            if (hovered?.key === key) {
              // Already playing for the pointer: it goes on, held by focus now.
              hovered = { key, source: "keyboard" };
              return;
            }
            endHover();
            startHover(record, "keyboard");
          },
          blur() {
            ringKey = undefined;
            drawRing();
            if (hovered?.source !== "keyboard") return;
            // The pointer is still over it: the hover goes on, held by the pointer now.
            if (interaction?.current === hovered.key) hovered = { key: hovered.key, source: "pointer" };
            else endHover();
          },
          escape() {
            if (!hovered) return false;
            endHover();
            return true;
          }
        })
      : undefined;

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

  return {
    refresh(next) {
      if (destroyed) return;
      // Throws on marks it can't read, before anything changes.
      const reading = read(next ?? source);
      if (next !== undefined) source = next;

      // The order the runner expects: interrupt, then exit / update / enter, then change, then settle.
      runner.interrupt();
      const diff = apply(reading);
      if (hovered !== undefined && !records.has(hovered.key)) {
        interaction?.clear();
        endHover();
      }
      const exited = runner.exit(diff.exiting.map(input));
      emitEach("exit", diff.exiting);
      runner.update(diff.changed.map(({ record, from }) => ({ ...input(record), from })));
      diff.changed.forEach(({ record, from }, index) => emit("update", { ...input(record), from, batch: { index, count: diff.changed.length } }));
      runner.enter(diff.entering.map(input));
      emitEach("enter", diff.entering);
      for (const record of [...diff.changed.map((c) => c.record), ...diff.moved]) runner.change(record.mark.geometry, record.mark.data);
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
  };
}

function checkOptions<D>(options: ExpressiveOptions<D>): void {
  if (typeof options !== "object" || options === null) throw new TypeError("expressive needs options, with at least a key: { key: (d) => d.name }.");
  if (typeof options.key !== "function") throw new TypeError("expressive needs a key function, for example key: (d) => d.name. Marks are matched by key.");
  for (const name of ["datum", "segment", "geometry"] as const) {
    if (options[name] !== undefined && typeof options[name] !== "function") throw new TypeError(`expressive: ${name} must be a function.`);
  }
  if (options.baseline !== undefined && options.baseline !== "auto" && !isBaseline(options.baseline)) {
    throw new RangeError(`expressive: baseline must be "left", "right", "top", "bottom" or "auto", got ${String(options.baseline)}.`);
  }
}

/** A mark's data: its first part's row, with the other parts as related series. Values come with `samples` (M4). */
function markData<D>(parts: readonly Part<D>[]): MarkData<D> {
  const of = (part: Part<D>): MarkData<D> => ({ datum: part.datum, samples: [], related });
  const related = (series: string): MarkData<D> | undefined => {
    const found = parts.find((part) => part.series === series);
    return found && of(found);
  };
  return of(parts[0]!);
}

/** For a mark described with `geometry`: the part's own segment, or the whole mark for a lone part. */
function outlineOf(geometry: MarkGeometry, series: string | undefined, parts: number): string | undefined {
  const segment = series === undefined ? undefined : geometry.segments?.find((s) => s.series === series);
  if (segment) return segment.length >= 0.5 ? segment.outline.d : undefined;
  return parts === 1 ? geometry.outline.d : undefined;
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

/** What the adapter can see of a change in values: a mark's length, or its segments' lengths. */
function lengthsChanged(from: MarkGeometry, to: MarkGeometry): boolean {
  const a = from.segments ?? [];
  const b = to.segments ?? [];
  if (Math.abs(from.length - to.length) > 0.01 || a.length !== b.length) return true;
  return a.some((segment, i) => segment.key !== b[i]!.key || Math.abs(segment.length - b[i]!.length) > 0.01);
}

function geometryChanged(from: MarkGeometry, to: MarkGeometry): boolean {
  if (from.outline.d !== to.outline.d) return true;
  const a = from.segments ?? [];
  const b = to.segments ?? [];
  return a.length !== b.length || a.some((segment, i) => segment.key !== b[i]!.key || segment.outline.d !== b[i]!.outline.d);
}
