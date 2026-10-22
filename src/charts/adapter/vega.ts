// Vega and Vega-Lite views through expressive(): the marks Vega's SVG renderer draws, described from
// its scenegraph rather than from the DOM. Each item Vega renders is bound to its element as
// `__data__` (an internal the adapter spike found, so the tests pin Vega's version), the row is
// `item.datum`, and the item's numbers give the geometry: rects become bars, arcs slices, symbols
// points and lines lines, whose items give each vertex with its row, so samples come with them.
// Duck-typed on the View: nothing here imports Vega, so it stays a dev dependency.

import type { Baseline, MarkGeometry, Matrix, Point, Rect, Sample } from "../../core";
import { defaultClock, describe, matrix, samplesAlong } from "../../core";
import { report } from "../../core/report";
import type { ChartEnv } from "../shell/setup";
import { baselines, describeRects, union, visualOrder, type RectPart } from "./bars";
import { expressive } from "./expressive";
import { commonAncestor, rootOf } from "./source";
import { between, boxIn, screenMatrices } from "./space";
import type { Attachment, ExpressiveOptions } from "./types";

/**
 * What fromVegaView() uses of a Vega View: its renderer, its scenegraph and the element it renders
 * into. The scenegraph is read as `{ root }` (what Vega returns) or as the root mark itself (what
 * vega-typings declare), so a View fits whichever the types say.
 */
export interface VegaViewLike {
  renderer(): string;
  scenegraph(): object;
  container(): Element | null;
}

/** A mark in Vega's scenegraph: its type, its name, and its items. */
export interface VegaMark {
  readonly marktype?: string;
  readonly name?: string;
  readonly items?: readonly VegaItem[];
}

/** An item of a Vega mark, as its encoders left it. A group's items hold the marks inside it. */
export interface VegaItem {
  readonly mark?: VegaMark;
  readonly datum?: unknown;
  readonly items?: readonly VegaMark[];
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly startAngle?: number;
  readonly endAngle?: number;
  readonly innerRadius?: number;
  readonly outerRadius?: number;
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly cornerRadius?: number;
  readonly defined?: boolean;
  /** How a line is drawn between its points: only "linear" (or unset) can be read. */
  readonly interpolate?: string;
}

/** A value for data effects: alone, or with where it is along x (`at`), which threshold matches series by. */
export type VegaSample = number | { readonly value: number; readonly at?: string | number | Date };

export interface VegaOptions<D> extends Omit<ExpressiveOptions<D>, "datum" | "geometry" | "watch"> {
  /** The Vega mark to read, by name. Default "marks", the name Vega-Lite gives a chart's data mark. */
  readonly mark?: string;
  /**
   * For data effects: the value an item's row shows, and optionally where it is along x. A line gets a
   * sample at each of its points, a bar from 0 at its baseline to its value (a stack's segments each over
   * their own range), a slice from 0 to its value, and a point its value. `samples` replaces this.
   * Unless `value` is given, it's also what each element shows (a line: every point's), so a re-render
   * that only moves marks, such as a resize, isn't an update.
   */
  readonly sample?: (row: D) => VegaSample;
}

/** fromVegaView()'s attachment: refresh() reads the View again (it refreshes itself after each render too). */
export interface VegaAttachment<D> extends Omit<Attachment<D>, "refresh"> {
  refresh(): void;
}

const MARK_TYPES = ["line", "rect", "arc", "symbol"] as const;
type MarkType = (typeof MARK_TYPES)[number];

/**
 * Attributes Vega writes when it draws marks somewhere new (a data change, a resize, a signal), and
 * `stroke-width`, which a line's thickness, and so its decorations and focus ring, are read from.
 */
const DRAWN = ["d", "transform", "x", "y", "width", "height", "stroke-width"];

/** One read of the View: the elements to attach, in visual order, and each mark's geometry and samples. */
interface ViewRead {
  readonly root: SVGSVGElement | undefined;
  readonly elements: readonly Element[];
  readonly items: ReadonlyMap<Element, VegaItem>;
  readonly geometry: ReadonlyMap<string, MarkGeometry>;
  readonly samples: ReadonlyMap<MarkGeometry, readonly Sample[]>;
  /** What each element shows, from `sample`: a line's every point, so a resize isn't an update. */
  readonly values: ReadonlyMap<Element, string>;
}

/** A read being made. */
interface Reading {
  readonly root: SVGSVGElement;
  readonly elements: Element[];
  readonly items: Map<Element, VegaItem>;
  readonly geometry: Map<string, MarkGeometry>;
  readonly samples: Map<MarkGeometry, readonly Sample[]>;
  readonly values: Map<Element, string>;
}

/**
 * Effects on a Vega or Vega-Lite chart rendered as SVG: reads the named mark's items from the View's
 * scenegraph and attaches to the elements Vega drew for them, as expressive() would with `datum` and
 * `geometry` written for Vega. It reads the View again after every render that moves or replaces
 * those elements (a data change, a resize), so the page never calls refresh().
 */
export function fromVegaView<D = Record<string, unknown>>(view: VegaViewLike, options: VegaOptions<D>, env: ChartEnv): VegaAttachment<D> {
  checkView(view);
  if (typeof options !== "object" || options === null || typeof options.key !== "function") {
    throw new TypeError("fromVegaView needs options with a key: { key: (d) => d.series }. Marks are matched by key.");
  }
  const name = options.mark ?? "marks";
  if (typeof name !== "string" || name === "") throw new TypeError(`fromVegaView: mark must be a mark's name, got ${String(name)}.`);
  if (options.sample !== undefined && typeof options.sample !== "function") throw new TypeError("fromVegaView: sample must be a function.");

  let current = readView();
  const { mark: _mark, sample: _sample, ...rest } = options;
  const attachment = expressive<D>(
    current.elements,
    {
      ...rest,
      datum: (element) => itemOf(element).datum as D,
      geometry: (_element, _datum, key) => {
        const geometry = current.geometry.get(key);
        if (!geometry) throw new TypeError(`fromVegaView: no geometry for "${key}". Its key must be the same for every item of a mark.`);
        return geometry;
      },
      ...(options.samples || !options.sample ? {} : { samples: (_datum: D, mark: MarkGeometry) => current.samples.get(mark) ?? [] }),
      ...(options.value || !options.sample ? {} : { value: (_datum: D, element: Element) => current.values.get(element) })
    },
    env
  );

  // Vega's data and resize listeners run before it renders, so the elements they'd read are the old
  // ones. What Vega draws is watched instead, and read again on the next frame.
  const clock = env.clock ?? defaultClock;
  let observed: SVGSVGElement | undefined;
  let stopFrame: (() => void) | undefined;
  let destroyed = false;
  const observer = typeof MutationObserver === "function" ? new MutationObserver((records) => records.some(drawn) && schedule()) : undefined;
  observe(current.root);

  function itemOf(element: Element): VegaItem {
    const item = current.items.get(element);
    if (!item) throw new TypeError("fromVegaView: an element that isn't one of the View's items.");
    return item;
  }

  function readView(): ViewRead {
    const marks = findMarks(sceneRoot(view), name);
    const type = markType(marks, name, view);
    const host = view.container();
    const root = (host?.localName === "svg" ? host : host?.querySelector("svg")) as SVGSVGElement | null | undefined;
    const empty: ViewRead = { root: root ?? undefined, elements: [], items: new Map(), geometry: new Map(), samples: new Map(), values: new Map() };
    if (!type || !root) return empty;

    // The element Vega drew for each item: a line's one path is bound to its first item.
    const wanted = new Set<unknown>(type === "line" ? marks.flatMap((mark) => (mark.items?.length ? [mark.items[0]] : [])) : marks.flatMap((mark) => mark.items ?? []));
    const items = new Map<Element, VegaItem>();
    for (const element of Array.from(root.querySelectorAll("*"))) {
      const bound = (element as Element & { __data__?: unknown }).__data__;
      if (wanted.has(bound)) items.set(element, bound as VegaItem);
    }
    const elements = [...items.keys()];
    if (elements.length === 0) return empty;

    const svg = rootOf(elements);
    const common = commonAncestor(elements, svg);
    const screen = screenMatrices();
    const toCommon = (element: Element): Matrix => between(common, element.parentElement ?? svg, svg, screen);
    const keyOf = (element: Element): string => String(options.key(items.get(element)!.datum as D, element));
    const seriesOf = (element: Element): string | undefined => (options.segment ? String(options.segment(items.get(element)!.datum as D, element)) : undefined);

    const read: Reading = { root: svg, items, elements, geometry: new Map(), samples: new Map(), values: new Map() };
    if (options.sample) {
      for (const [element, item] of items) {
        const points = type === "line" ? pointsOf(item).map((p) => p.item) : [item];
        read.values.set(element, points.map((point) => valueOf(point).value).join(","));
      }
    }
    if (type === "rect") return readBars(read, toCommon, keyOf, seriesOf);
    for (const element of elements) {
      const item = items.get(element)!;
      const key = keyOf(element);
      if (read.geometry.has(key)) continue; // a second part of a mark: expressive() says whether that's allowed
      const m = toCommon(element);
      const geometry = type === "line" ? lineOf(key, element, item, m) : type === "arc" ? sliceOf(key, item, m) : pointOf(key, item, m);
      read.geometry.set(key, geometry);
      if (options.sample) read.samples.set(geometry, type === "line" ? lineSamples(geometry, item, m) : oneSample(geometry, item, type));
    }
    return read;
  }

  /** Bars from rect items, grouped by key into stacks (named by `segment`), in visual order. */
  function readBars(read: Reading, toCommon: (element: Element) => Matrix, keyOf: (element: Element) => string, seriesOf: (element: Element) => string | undefined): ViewRead {
    const groups = new Map<string, { element: Element; part: RectPart }[]>();
    for (const element of read.elements) {
      const item = read.items.get(element)!;
      const key = keyOf(element);
      const part: RectPart = { box: boxIn(toCommon(element), boxOf(item)), series: seriesOf(element), radius: Math.max(0, item.cornerRadius ?? 0) };
      const group = groups.get(key);
      if (group) group.push({ element, part });
      else groups.set(key, [{ element, part }]);
    }
    const keys = [...groups.keys()];
    const boxes = keys.map((key) => union(groups.get(key)!.map((p) => p.part.box)));
    const edges: Baseline[] = baselines(boxes, options.baseline ?? "auto");
    const elements: Element[] = [];
    for (const i of visualOrder(boxes, edges)) {
      const key = keys[i]!;
      const parts = groups.get(key)!;
      const { geometry, order } = describeRects(key, parts.map((p) => p.part), edges[i]!);
      read.geometry.set(key, geometry);
      // From the baseline, so the mark's first part (its row, its focus) is the one at the baseline.
      elements.push(...order.map((j) => parts[j]!.element));
      if (options.sample) {
        const values = order.map((j) => valueOf(read.items.get(parts[j]!.element)!).value);
        const total = values.reduce((sum, v) => sum + v, 0);
        read.samples.set(geometry, [{ t: 0, value: 0 }, { t: 1, value: total }]);
        let reached = 0;
        (geometry.segments ?? []).forEach((segment, n) => {
          const from = reached;
          reached += values[n] ?? 0;
          read.samples.set(segment, [{ t: 0, value: from }, { t: 1, value: reached }]);
        });
      }
    }
    return { ...read, elements };
  }

  function valueOf(item: VegaItem): { value: number; at?: string | number | Date } {
    const given = options.sample!(item.datum as D);
    const sample = typeof given === "number" ? { value: given } : given;
    if (typeof sample !== "object" || sample === null || !Number.isFinite(sample.value)) {
      throw new RangeError(`fromVegaView: sample must give a finite number, or { value, at }, got ${JSON.stringify(given)}.`);
    }
    return sample.at === undefined ? { value: sample.value } : { value: sample.value, at: sample.at };
  }

  /** A line's samples, one per point, where each point is along the walk its points drew. */
  function lineSamples(geometry: MarkGeometry, first: VegaItem, m: Matrix): Sample[] {
    return samplesAlong(
      geometry,
      pointsOf(first).map(({ item, point }) => ({ ...matrix.apply(m, point), ...valueOf(item) }))
    );
  }

  function oneSample(geometry: MarkGeometry, item: VegaItem, type: MarkType): Sample[] {
    const { value, at } = valueOf(item);
    const end = at === undefined ? { t: 1, value } : { t: 1, value, at };
    return type === "symbol" ? [{ ...end, t: 0 }] : geometry.length > 0 ? [{ t: 0, value: 0 }, end] : [{ ...end, t: 0 }];
  }

  // ── Following the View ─────────────────────────────────────────────────────

  /** A change Vega made to its marks: not one the adapter made in its overlay, nor its own attributes. */
  function drawn(record: MutationRecord): boolean {
    const overlay = observed?.querySelector(":scope > .ec-overlay");
    const ours = (node: Node): boolean => node === overlay || (overlay?.contains(node) ?? false);
    if (ours(record.target)) return false;
    if (record.type === "childList") return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) => !ours(node));
    return true;
  }

  function schedule(): void {
    if (stopFrame || destroyed) return;
    const stop = clock.onFrame(() => {
      stop();
      stopFrame = undefined;
      try {
        refresh();
      } catch (error) {
        report(error);
      }
    });
    stopFrame = stop;
  }

  function observe(root: SVGSVGElement | undefined): void {
    if (!observer || root === observed) return;
    observer.disconnect();
    observed = root;
    if (root) observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: DRAWN });
  }

  function refresh(): void {
    if (destroyed) return;
    const next = readView();
    const previous = current;
    current = next;
    try {
      attachment.refresh(next.elements);
    } catch (error) {
      current = previous;
      throw error;
    }
    observe(next.root);
  }

  return {
    refresh,
    on: attachment.on,
    marks: attachment.marks,
    focus: attachment.focus,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      stopFrame?.();
      stopFrame = undefined;
      attachment.destroy();
    }
  };
}

function checkView(view: VegaViewLike): void {
  if (typeof view !== "object" || view === null || typeof view.renderer !== "function" || typeof view.scenegraph !== "function" || typeof view.container !== "function") {
    throw new TypeError("fromVegaView needs a Vega View: new vega.View(runtime, { renderer: \"svg\", container }), or vega-embed's result.view.");
  }
  const renderer = view.renderer();
  if (renderer !== "svg") {
    throw new TypeError(
      `fromVegaView: the View renders with "${renderer}", which draws no SVG elements to attach to. Use renderer: "svg" (vega-embed's default; a bare vega.View uses canvas).`
    );
  }
}

function sceneRoot(view: VegaViewLike): VegaMark {
  const graph = view.scenegraph() as { readonly root?: VegaMark } & VegaMark;
  return graph.root ?? graph;
}

/** Every mark of that name in the scenegraph: Vega-Lite draws one per series for a line with a colour field. */
function findMarks(root: VegaMark, name: string): VegaMark[] {
  const found: VegaMark[] = [];
  const visit = (mark: VegaMark): void => {
    if (mark.name === name && mark.marktype !== "group") found.push(mark);
    if (mark.marktype !== "group") return;
    for (const item of mark.items ?? []) for (const inner of item.items ?? []) visit(inner);
  };
  visit(root);
  return found;
}

function markType(marks: readonly VegaMark[], name: string, view: VegaViewLike): MarkType | undefined {
  if (marks.length === 0) {
    const names = namesIn(sceneRoot(view));
    // Before the View first runs there are no marks yet; it's read again once Vega draws them.
    if (names.length === 0) return undefined;
    throw new RangeError(`fromVegaView: the View has no mark named "${name}". Its named marks: ${names.map((n) => `"${n}"`).join(", ")}.`);
  }
  const type = marks[0]!.marktype;
  if (!marks.every((mark) => mark.marktype === type) || !MARK_TYPES.includes(type as MarkType)) {
    throw new TypeError(`fromVegaView: "${name}" is a ${String(type)} mark. Rects, arcs, symbols and lines can be read; describe others with expressive()'s geometry option.`);
  }
  return type as MarkType;
}

function namesIn(root: VegaMark): string[] {
  const names = new Set<string>();
  const visit = (mark: VegaMark): void => {
    if (mark.name && mark.marktype !== "group") names.add(mark.name);
    for (const item of mark.items ?? []) for (const inner of item.items ?? []) visit(inner);
  };
  visit(root);
  return [...names];
}

/**
 * A line's points, from its mark's items. Lines are straight between their points (M4 decision 5),
 * so a curve Vega interpolates (monotone, basis, step and the rest; it reads the first item's) would
 * be described as a different path from the one drawn, and throws instead. So does a point Vega
 * leaves out (`defined: false`), which would be a gap, which lines can't have yet.
 */
function pointsOf(first: VegaItem): { item: VegaItem; point: Point }[] {
  const items = first.mark?.items ?? [first];
  const interpolate = items[0]?.interpolate;
  if (interpolate !== undefined && interpolate !== "linear") {
    throw new TypeError(
      `fromVegaView: a line is drawn with interpolate "${interpolate}", but only straight lines can be read. Use interpolate "linear" (the default), or describe the curve with expressive()'s geometry option.`
    );
  }
  if (items.some((item) => item.defined === false)) {
    throw new TypeError("fromVegaView: a line has a gap (a point with defined: false). Lines with gaps can't be read yet.");
  }
  return items.map((item) => ({ item, point: { x: number(item.x), y: number(item.y) } }));
}

function lineOf(key: string, element: Element, first: VegaItem, m: Matrix): MarkGeometry {
  const width = first.strokeWidth ?? Number.parseFloat(element.getAttribute("stroke-width") ?? "1");
  return describe.line({
    key,
    series: key,
    points: pointsOf(first).map(({ point }) => matrix.apply(m, point)),
    width: (Number.isFinite(width) ? width : 1) * scaleOf(m)
  });
}

/** A slice: Vega-Lite's arcs can run anticlockwise (start > end), so the angles are put in order. */
function sliceOf(key: string, item: VegaItem, m: Matrix): MarkGeometry {
  const center = matrix.apply(m, { x: number(item.x), y: number(item.y) });
  const s = scaleOf(m);
  const [start, end] = [number(item.startAngle), number(item.endAngle)].sort((a, b) => a - b) as [number, number];
  return describe.arc({ key, cx: center.x, cy: center.y, inner: number(item.innerRadius) * s, outer: number(item.outerRadius) * s, start, end });
}

/** A point: Vega's symbol `size` is its area in px², 64 by default. */
function pointOf(key: string, item: VegaItem, m: Matrix): MarkGeometry {
  const center = matrix.apply(m, { x: number(item.x), y: number(item.y) });
  return describe.point({ key, x: center.x, y: center.y, r: Math.sqrt(Math.max(0, item.size ?? 64) / Math.PI) * scaleOf(m) });
}

/** A rect item's box in its group's coordinates, with a negative width or height turned round. */
function boxOf(item: VegaItem): Rect {
  const x = number(item.x);
  const y = number(item.y);
  const width = number(item.width);
  const height = number(item.height);
  return { x: Math.min(x, x + width), y: Math.min(y, y + height), width: Math.abs(width), height: Math.abs(height) };
}

function scaleOf(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

function number(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
