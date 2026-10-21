// barChart: the thin reference bar chart. Horizontal bars or vertical columns, plain or stacked; keyed
// marks described with describe.bar; a measured layout; axis, grid and labels in theme colours;
// built-in hover dimming; pointer, touch and keyboard hover. update() animates the change: staged in
// presentation (values, then positions), in one short stage in analysis, at once when motion is off.
//
// The chart never names an effect: it resolves `on` through the presets it's handed and plays them
// through the runner, which draws on the SVG surface.

import type { AnimateOptions, Animated, Clock, IconSource, MarkGeometry, Motion, TweenResult } from "../core";
import { animated, defaultClock, interpolateNumber, interpolateRecord } from "../core";
import { EFFECT_SLOTS, resolveEffects, type PresetFactory, type Registry } from "../core/registry";
import { report } from "../core/report";
import { createRunner, type RunInput, type SlotEffects } from "../core/runner";
import { barEncoding, layoutBars, placeRow, placeTick, type BarFrame, type BarLayout, type BarRow, type TextPlacement } from "./bar-layout";
import { toColorAssignment } from "./colors";
import { pointerHover, type HoverTarget } from "./interaction";
import { keyboardFocus } from "./keyboard";
import { chartMotion } from "./motion";
import { svgMarkHandle, type StyledPart, type SvgMarkHandle } from "./render/mark-style";
import { svgSurface } from "./render/surface";
import { setAttributes, setStyles, svgElement, transformAttribute } from "./render/svg";
import { textMeasure } from "./render/text";
import { injectStyles, markColorStyles, seriesColors } from "./render/theme";
import type { BarChartOptions, Chart, MarkEvents } from "./types";

/** What the composition root hands every chart, so charts never import the registries or effects. */
export interface ChartEnv {
  /** Resolves preset names in `on`. */
  readonly presets: Pick<Registry<PresetFactory>, "resolve">;
  /** Resolves icon names for effects. */
  readonly icons: IconSource;
  /** The page-wide motion: the default, and what a mode given as a string follows. */
  readonly motion: Motion;
  /** Default: the page-wide clock. */
  readonly clock?: Clock;
}

export type BarChart<D> = Chart<D, BarChartOptions<D>>;

/** Signed values by series, in data units. */
type Values = Readonly<Record<string, number>>;

interface MarkRecord<D> {
  readonly key: string;
  /** Where the mark is heading, or rests: its row in the latest layout (its last one while it leaves). */
  row: BarRow<D>;
  /** What's on screen now. */
  shown: BarRow<D>;
  readonly group: SVGGElement;
  readonly hit: SVGRectElement;
  readonly label: SVGTextElement;
  /** Holds the segments; effects' transform and opacity go here. */
  readonly body: SVGGElement;
  readonly value: SVGTextElement;
  readonly paths: Map<string, SVGPathElement>;
  parts: StyledPart[];
  readonly handle: SvgMarkHandle;
  /** In data units, so the bar's length follows the animated scale and always reads true against the axis. */
  readonly values: Animated<Values>;
  /** The order segments are drawn in: the layout's, with series on their way out kept where they were. */
  series: readonly string[];
  /** Position along the category axis, in bands. */
  readonly slot: Animated<number>;
  /** 0 to 1. A mark entering or leaving fades its labels; its bar grows or shrinks. */
  readonly presence: Animated<number>;
  /** The value label counts between totals, rounded to this many decimals; undefined shows the row's own text. */
  count: number | undefined;
  /** Set while the mark leaves. */
  leave: Leave | undefined;
}

interface Leave {
  /** Its exit effects are done. */
  exited: boolean;
  /** Resolves when its element is removed, or the mark comes back. */
  readonly gone: Promise<void>;
  readonly resolve: () => void;
}

interface TickRecord {
  readonly value: number;
  readonly line: SVGLineElement;
  readonly label: SVGTextElement;
  /** Ticks the scale gains fade in, and ones it loses fade out. */
  readonly opacity: Animated<number>;
  /** In the latest layout. */
  wanted: boolean;
}

interface Diff<D> {
  readonly entering: MarkRecord<D>[];
  readonly exiting: MarkRecord<D>[];
  /** Values changed: update effects run. A re-sort or a new scale only moves a mark. */
  readonly changed: { readonly record: MarkRecord<D>; readonly from: MarkGeometry }[];
}

type Listeners<D> = { [K in keyof MarkEvents<D>]: Set<(event: MarkEvents<D>[K]) => void> };
type HoverSource = MarkEvents<unknown>["hover"]["source"];

/** Used when the container has no width yet (hidden, or no layout as in jsdom); the prototype's width. */
const FALLBACK_WIDTH = 640;
const ONE = { index: 0, count: 1 } as const;
/** Base ms for each stage of a data change: values, then positions. Unstaged, a change takes as long as its stages together, which analysis scales down. */
const STAGE = 500;
/** The focus ring's px: a gap in the surface colour around the mark, then the ring. */
const RING_GAP = 2;
const RING = 2;

export function barChart<D>(target: string | Element, options: BarChartOptions<D>, env: ChartEnv): BarChart<D> {
  const container = resolveTarget(target);
  checkOptions(options);
  let current = options;
  const motion = chartMotion(options.motion, env.motion);
  const effects = resolveEffects(options.on, env.presets);
  let colors = toColorAssignment(options.colors);
  const clock = env.clock ?? defaultClock;
  const doc = container.ownerDocument;
  injectStyles(doc);

  const svg = svgElement("svg", { class: "ec-chart ec-bar-chart" }, container);
  const grid = svgElement("g", { class: "ec-grid", "aria-hidden": "true" }, svg);
  const axis = svgElement("g", { class: "ec-axis", "aria-hidden": "true" }, svg);
  // Behind the marks, so it can't cover them; the gap keeps it apart from a bar in the same colour.
  const ring = svgElement("g", { class: "ec-focus", "aria-hidden": "true", visibility: "hidden" }, svg);
  const ringPaths = [
    svgElement("path", { class: "ec-focus-ring", "stroke-width": 2 * (RING_GAP + RING), "stroke-linejoin": "round" }, ring),
    svgElement("path", { class: "ec-focus-gap", "stroke-width": 2 * RING_GAP, "stroke-linejoin": "round" }, ring)
  ];
  const marksLayer = svgElement("g", { class: "ec-marks" }, svg);
  const overlay = svgElement("g", { class: "ec-overlay", "aria-hidden": "true" }, svg);
  const measure = textMeasure(svg);

  /** Marks on screen, in visual order. */
  let order: MarkRecord<D>[] = [];
  const records = new Map<string, MarkRecord<D>>();
  /** Marks on their way out: fading, or waiting for their exit effects. */
  const leaving = new Map<string, MarkRecord<D>>();
  const byGroup = new WeakMap<Element, MarkRecord<D>>();
  const listeners: Listeners<D> = { enter: new Set(), update: new Set(), exit: new Set(), hover: new Set(), leave: new Set() };
  let hovered: { readonly key: string; readonly source: HoverSource } | undefined;
  /** The mark showing the focus ring: focused from the keyboard. */
  let ringKey: string | undefined;
  let measuredWidth = containerWidth(container);
  let destroyed = false;

  let laidOut: BarLayout<D>;
  try {
    // Throws on data it can't draw. Nothing but the <svg> is in place yet, so that's all to undo.
    laidOut = layout(current);
  } catch (error) {
    svg.remove();
    throw error;
  }

  const find = (key: string): MarkRecord<D> | undefined => records.get(key) ?? leaving.get(key);
  const surface = svgSurface({
    overlay,
    // Looked up on each call, so the handle follows the mark's record.
    mark: (key) => ({
      set: (style) => {
        find(key)?.handle.set(style);
        if (key === ringKey) drawRing();
      },
      reset: () => {
        find(key)?.handle.reset();
        if (key === ringKey) drawRing();
      }
    }),
    colors: (key) => find(key)?.parts[0]?.colors
  });
  const runner = createRunner<D>({ effects, motion, icons: env.icons, clock, surface });

  // ── Animated state ─────────────────────────────────────────────────────────
  // One animated value per mark property (values, slot, presence) plus the scale and the bands, so a
  // new update() mid-flight retargets each from where it is and nothing jumps.

  let orientation = laidOut.orientation;
  const ticks = new Map<number, TickRecord>();
  /** What changed since the last frame was drawn. */
  const dirty = new Set<MarkRecord<D>>();
  let frameMoved = false;
  let ticksFaded = false;
  const scale = animated(laidOut.frame.scale, interpolateRecord, { clock, motion, onChange: () => (frameMoved = true) });
  const bands = animated(laidOut.frame.bands, interpolateRecord, { clock, motion, onChange: () => (frameMoved = true) });

  /** The transition in flight: resolved when it settles. */
  let transition: { readonly id: number; readonly waiters: readonly (() => void)[] } | undefined;
  let transitions = 0;
  let unfollow: (() => void) | undefined;
  /** Resolves the latest update()'s promise early, when another update() supersedes it. */
  let supersede: (() => void) | undefined;

  // ── Drawing ────────────────────────────────────────────────────────────────

  function layout(opts: BarChartOptions<D>): BarLayout<D> {
    const encoding = barEncoding(opts);
    checkNeeds(effects, encoding.series.map((s) => s.series));
    return layoutBars({
      data: opts.data,
      encoding,
      sort: opts.sort,
      width: opts.width ?? measuredWidth,
      height: opts.height,
      format: format(opts),
      measure
    });
  }

  /** A new mark: drawn as laid out, or, when it enters, at its slot with nothing showing yet. */
  function createRecord(row: BarRow<D>, entering: boolean): MarkRecord<D> {
    const group = svgElement("g", { class: "ec-mark", "data-key": row.key }, marksLayer);
    const env = { clock, motion, onChange: () => dirty.add(record) };
    const values = valuesOf(row);
    const record: MarkRecord<D> = {
      key: row.key,
      row,
      shown: row,
      group,
      hit: svgElement("rect", { class: "ec-hit" }, group),
      label: svgElement("text", { class: "ec-label" }, group),
      body: svgElement("g", { class: "ec-body" }, group),
      value: svgElement("text", { class: "ec-value" }, group),
      paths: new Map(),
      parts: [],
      handle: svgMarkHandle(() => record),
      values: animated(entering ? zeros(values) : values, interpolateRecord, env),
      series: row.values.map((v) => v.series),
      slot: animated(row.slot, interpolateNumber, env),
      presence: animated(entering ? 0 : 1, interpolateNumber, env),
      count: undefined,
      leave: undefined
    };
    byGroup.set(group, record);
    drawMark(record, entering ? currentRow(record, currentFrame()) : row);
    return record;
  }

  function drawMark(record: MarkRecord<D>, row: BarRow<D>): void {
    const before = record.parts[0]?.colors.color;
    record.shown = row;
    setAttributes(record.hit, { ...row.hit });
    placeText(record.label, row.label);
    placeText(record.value, row.value);
    const presence = record.presence.value;
    const opacity = presence < 1 ? presence : undefined;
    setAttributes(record.label, { opacity });
    setAttributes(record.value, { opacity });
    const segments = row.geometry.segments ?? [];
    const keep = new Set<string>();
    record.parts = segments.map((segment) => {
      const series = segment.series ?? segment.key;
      keep.add(series);
      let element = record.paths.get(series);
      if (!element) {
        element = svgElement("path", { class: "ec-segment", "data-series": series }, record.body);
        record.paths.set(series, element);
      }
      const partColors = seriesColors(colors.slot(series));
      element.setAttribute("d", segment.outline.d);
      setStyles(element, markColorStyles(partColors));
      return { element, d: segment.outline.d, colors: partColors, visible: segment.length >= 0.5 };
    });
    for (const [series, element] of record.paths) {
      if (keep.has(series)) continue;
      element.remove();
      record.paths.delete(series);
    }
    // Stack order, from the baseline, after the halo.
    const drawn = Array.from(record.body.children).filter((child) => child.classList.contains("ec-segment"));
    if (record.parts.some((part, i) => drawn[i] !== part.element)) for (const part of record.parts) record.body.appendChild(part.element);
    record.handle.repaint();
    // A new palette or a different first series: overlays already drawn in "mark" follow.
    if (record.parts[0]?.colors.color !== before) surface.recolor(record.key);
    if (record.key === ringKey) drawRing();
  }

  /** The focus ring follows the outline of the mark as it is on screen, moved with its body when an effect moves it. */
  function drawRing(): void {
    const record = ringKey === undefined ? undefined : records.get(ringKey);
    if (!record) {
      ring.setAttribute("visibility", "hidden");
      return;
    }
    for (const path of ringPaths) path.setAttribute("d", record.shown.geometry.outline.d);
    const { transform } = record.handle.style;
    setAttributes(ring, { transform: transform && transformAttribute(transform), visibility: undefined });
  }

  /** Draws the mark as `row`. Its runs hear about it when its geometry changed, so decorations follow. */
  function show(record: MarkRecord<D>, row: BarRow<D>): void {
    const moved = geometryChanged(record.shown.geometry, row.geometry);
    drawMark(record, row);
    if (moved) runner.change(row.geometry, row.data);
  }

  const currentFrame = (): BarFrame => ({ orientation, scale: scale.value, bands: bands.value });

  /** The mark as it is now, part way through a transition. */
  function currentRow(record: MarkRecord<D>, frame: BarFrame): BarRow<D> {
    const { row } = record;
    const now = record.values.value;
    const values = record.series.map((series) => ({ series, value: now[series] ?? 0 }));
    const total = values.reduce((sum, v) => sum + v.value, 0);
    const text = record.count === undefined ? row.value.text : format(current)(round(total, record.count));
    return placeRow(frame, { key: row.key, datum: row.datum, index: row.index, category: row.label.text, values, slot: record.slot.value, text });
  }

  function addTick(value: number, opacity: number): void {
    const tick: TickRecord = {
      value,
      line: svgElement("line", { class: value === 0 ? "ec-baseline" : "ec-gridline" }, grid),
      label: svgElement("text", { class: "ec-tick" }, axis),
      opacity: animated(opacity, interpolateNumber, { clock, motion, onChange: () => (ticksFaded = true) }),
      wanted: true
    };
    ticks.set(value, tick);
    // In value order, as the layout lists them.
    for (const t of [...ticks.values()].sort((a, b) => a.value - b.value)) {
      grid.appendChild(t.line);
      axis.appendChild(t.label);
    }
  }

  function drawTick(tick: TickRecord, frame: BarFrame): void {
    const placed = placeTick(frame, tick.value, format(current)(tick.value));
    const opacity = tick.opacity.value < 1 ? tick.opacity.value : undefined;
    setAttributes(tick.line, { ...placed.line, opacity });
    placeText(tick.label, placed.label);
    setAttributes(tick.label, { opacity });
  }

  /** Draws what moved since the last frame. */
  function draw(): void {
    const frame = currentFrame();
    if (frameMoved) setAttributes(svg, sizeAttributes(frame.bands));
    if (frameMoved || ticksFaded) for (const tick of ticks.values()) drawTick(tick, frame);
    for (const record of [...order, ...leaving.values()]) {
      if (frameMoved || dirty.has(record)) show(record, currentRow(record, frame));
    }
    frameMoved = false;
    ticksFaded = false;
    dirty.clear();
  }

  /** Draws exactly the layout once a transition settles: the frames in between are computed, this is laid out. */
  function land(): void {
    setAttributes(svg, sizeAttributes(laidOut.frame.bands));
    for (const tick of [...ticks.values()]) {
      if (tick.wanted) continue;
      tick.line.remove();
      tick.label.remove();
      ticks.delete(tick.value);
    }
    for (const placed of laidOut.ticks) {
      const tick = ticks.get(placed.value);
      if (!tick) continue;
      setAttributes(tick.line, { ...placed.line, opacity: undefined });
      placeText(tick.label, placed.label);
      tick.label.removeAttribute("opacity");
    }
    for (const record of order) {
      record.series = record.row.values.map((v) => v.series);
      record.count = undefined;
      show(record, record.row);
    }
    frameMoved = false;
    ticksFaded = false;
    dirty.clear();
  }

  /** Matches the layout's rows to marks by key. New marks start at their slot with nothing showing; marks without a row start to leave. */
  function arrange(next: BarLayout<D>): Diff<D> {
    const keys = new Set(next.rows.map((row) => row.key));
    const diff: Diff<D> = { entering: [], exiting: [], changed: [] };
    for (const record of order) {
      if (keys.has(record.key)) continue;
      records.delete(record.key);
      leaving.set(record.key, record);
      record.group.classList.add("ec-leaving");
      record.leave = leave();
      record.count = undefined;
      diff.exiting.push(record);
    }
    const previous = order;
    order = next.rows.map((row) => {
      let record = records.get(row.key);
      if (record) {
        if (valuesChanged(record.row, row)) diff.changed.push({ record, from: record.shown.geometry });
        record.count = Math.max(decimals(record.row.total), decimals(row.total));
      } else {
        // A mark that comes back mid-exit keeps its element; the runner cancels its exit.
        record = leaving.get(row.key);
        if (record) {
          leaving.delete(row.key);
          record.group.classList.remove("ec-leaving");
          record.leave?.resolve();
          record.leave = undefined;
        } else {
          record = createRecord(row, true);
        }
        record.count = undefined;
        records.set(row.key, record);
        diff.entering.push(record);
      }
      record.row = row;
      record.series = mergeSeries(record.series, row.values.map((v) => v.series));
      labelMark(record);
      return record;
    });
    // DOM order follows visual order, for screen readers. The focused mark stays put and the others
    // move around it, because moving a focused element blurs it.
    if (order.some((record, i) => previous[i] !== record)) {
      const active = keyboard.active();
      const pivot = order.findIndex((record) => record.group === active);
      const anchor = order[pivot]?.group ?? null;
      order.forEach((record, i) => {
        if (i < pivot) marksLayer.insertBefore(record.group, anchor);
        else if (i > pivot) marksLayer.appendChild(record.group);
      });
    }
    return diff;
  }

  /** The mark's accessible name, from where it's heading. */
  function labelMark(record: MarkRecord<D>): void {
    record.group.setAttribute("aria-label", markLabel(record.row, format(current)));
  }

  /**
   * Sends every animated value toward `next`, and returns the animations started. Presentation stages
   * the change: values first (bars resize, leaving bars shrink, the scale and ticks retarget), then
   * positions (rows move to their slots; new bars grow in during the second half). A stage with
   * nothing to do is skipped. Analysis runs it all as one stage, which its scaling keeps short. A
   * jump (motion off, a new orientation, a resize) lands at once.
   */
  function retarget(next: BarLayout<D>, jump: boolean): Promise<TweenResult>[] {
    const { frame } = next;
    if (jump) orientation = next.orientation;
    const wanted = new Set(next.ticks.map((tick) => tick.value));
    for (const value of wanted) if (!ticks.has(value)) addTick(value, 0);
    for (const tick of ticks.values()) tick.wanted = wanted.has(tick.value);

    // New marks, and ones back after fading out completely, grow in at their slot.
    const arriving = new Set(order.filter((record) => record.presence.value === 0));
    const staying = order.filter((record) => !arriving.has(record));
    const gone = [...leaving.values()];

    const values =
      busy(scale, frame.scale, sameFields) ||
      [...ticks.values()].some((tick) => busy(tick.opacity, tick.wanted ? 1 : 0, same)) ||
      staying.some((record) => busy(record.values, valuesOf(record.row), sameFields) || busy(record.presence, 1, same)) ||
      gone.some((record) => busy(record.values, zeros(record.values.value), sameFields) || busy(record.presence, 0, same));
    const positions = arriving.size > 0 || busy(bands, frame.bands, sameFields) || staying.some((record) => busy(record.slot, record.row.slot, same));

    let first: AnimateOptions | undefined;
    let second: AnimateOptions | undefined;
    let grow: AnimateOptions | undefined;
    if (!jump && motion.staged) {
      const wait = values ? STAGE : 0;
      first = { duration: STAGE };
      second = { duration: STAGE, delay: wait };
      grow = { duration: STAGE / 2, delay: wait + STAGE / 2 };
    } else if (!jump) {
      first = second = grow = { duration: (values && positions ? 2 : 1) * STAGE };
    }

    const running: Promise<TweenResult>[] = [];
    const move = <T>(value: Animated<T>, to: T, equal: (a: T, b: T) => boolean, timing: AnimateOptions | undefined): void => {
      if (!busy(value, to, equal)) return;
      if (timing) running.push(value.to(to, timing));
      else value.set(to);
    };
    move(scale, frame.scale, sameFields, first);
    move(bands, frame.bands, sameFields, second);
    for (const tick of ticks.values()) move(tick.opacity, tick.wanted ? 1 : 0, same, first);
    for (const record of staying) {
      move(record.values, valuesOf(record.row), sameFields, first);
      move(record.presence, 1, same, first);
      move(record.slot, record.row.slot, same, second);
    }
    for (const record of arriving) {
      record.slot.set(record.row.slot);
      move(record.values, valuesOf(record.row), sameFields, grow);
      move(record.presence, 1, same, grow);
    }
    for (const record of gone) {
      move(record.values, zeros(record.values.value), sameFields, first);
      move(record.presence, 0, same, first);
    }
    return running;
  }

  /**
   * Moves to `next`, animated or at once, drawing every frame. Resolves when the transition settles.
   * One still in flight is taken over: its waiters wait for this one instead.
   */
  function transitionTo(next: BarLayout<D>, jump: boolean): Promise<void> {
    laidOut = next;
    const running = retarget(next, jump);
    draw();
    const id = ++transitions;
    return new Promise<void>((resolve) => {
      transition = { id, waiters: [...(transition?.waiters ?? []), resolve] };
      if (running.length === 0) {
        settle(id);
        return;
      }
      // Subscribed after the tweens just started, so each frame draws once they've all moved.
      unfollow?.();
      unfollow = clock.onFrame(() => draw());
      void Promise.all(running).then(() => settle(id));
    });
  }

  function settle(id: number): void {
    if (destroyed || transition?.id !== id) return;
    const { waiters } = transition;
    transition = undefined;
    unfollow?.();
    unfollow = undefined;
    land();
    runner.settle();
    sweep();
    for (const resolve of waiters) resolve();
  }

  /** Removes leaving marks once they've faded out and their exit effects are done. */
  function sweep(): void {
    for (const record of [...leaving.values()]) {
      const { leave } = record;
      if (!leave?.exited || record.values.animating || record.presence.animating) continue;
      leaving.delete(record.key);
      record.leave = undefined;
      record.group.remove();
      leave.resolve();
    }
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  /** Where a mark is heading: what enter and update report as a change starts. */
  const input = (record: MarkRecord<D>): RunInput<D> => ({ mark: record.row.geometry, data: record.row.data });
  /** The mark as it is on screen: what hover, leave and exit report, so mid-change they match what's under the pointer or on its way out. */
  const onScreen = (record: MarkRecord<D>): RunInput<D> => ({ mark: record.shown.geometry, data: record.shown.data });

  /** The mark an event target belongs to; leaving marks don't count. */
  function liveRecordOf(eventTarget: EventTarget | null): MarkRecord<D> | undefined {
    const element = eventTarget as Element | null;
    const group = typeof element?.closest === "function" ? element.closest(".ec-mark") : null;
    const record = group ? byGroup.get(group) : undefined;
    return record && records.get(record.key) === record ? record : undefined;
  }

  /** Pointer and keyboard hover share this: the mark's emphasis, the others' dimming, the hover runs and the event. */
  function startHover(record: MarkRecord<D>, source: HoverSource, segment?: string): void {
    hovered = { key: record.key, source };
    record.group.classList.add("ec-hot");
    if (current.dim !== false) svg.classList.add("ec-hovering");
    runner.hover([onScreen(record)]);
    emit("hover", { ...onScreen(record), batch: ONE, source, ...(segment === undefined ? {} : { segment }) });
  }

  function endHover(): void {
    const key = hovered?.key;
    hovered = undefined;
    svg.classList.remove("ec-hovering");
    const record = key === undefined ? undefined : find(key);
    if (key === undefined || !record) return;
    record.group.classList.remove("ec-hot");
    runner.leave([key]);
    emit("leave", { ...onScreen(record), batch: ONE });
  }

  const interaction = pointerHover(svg, {
    find(eventTarget) {
      const record = liveRecordOf(eventTarget);
      if (!record) return undefined;
      const segment = (eventTarget as Element).closest(".ec-segment")?.getAttribute("data-series") ?? undefined;
      return segment === undefined ? { key: record.key } : { key: record.key, segment };
    },
    hover(target: HoverTarget, source) {
      const record = records.get(target.key);
      // Already playing for keyboard focus: it goes on.
      if (!record || hovered?.key === target.key) return;
      endHover();
      startHover(record, source, target.segment);
    },
    leave() {
      // Focus holds a keyboard hover until blur or Escape.
      if (hovered?.source !== "keyboard") endHover();
    }
  });

  const keyboard = keyboardFocus(svg, {
    find: (eventTarget) => liveRecordOf(eventTarget)?.key,
    order: () => order.map((record) => record.key),
    element: (key) => find(key)?.group,
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
      if (interaction.current === hovered.key) hovered = { key: hovered.key, source: "pointer" };
      else endHover();
    },
    escape() {
      if (!hovered) return false;
      endHover();
      return true;
    }
  });

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
    const read = type === "exit" ? onScreen : input;
    marks.forEach((record, index) => emit(type, { ...read(record), batch: { index, count: marks.length } }));
  }

  // ── Motion, size and fonts ─────────────────────────────────────────────────

  // CSS hover transitions read their duration from motion, like everything else.
  const syncMotion = (): void => svg.style.setProperty("--ec-hover-duration", `${motion.duration(100, "feedback")}ms`);
  syncMotion();
  const unsubscribeMotion = motion.subscribe(syncMotion);

  /** Re-lays out without animating: a resize or fonts loading. A transition in flight lands at once. Effects follow through change(). */
  function relayout(): void {
    if (destroyed) return;
    const next = layout(current);
    // The same rows as now: only the sizes changed.
    const rows = new Map(next.rows.map((row) => [row.key, row]));
    for (const record of order) record.row = rows.get(record.key) ?? record.row;
    void transitionTo(next, true);
  }

  let pendingWidth = measuredWidth;
  let stopFrame: (() => void) | undefined;
  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver((entries) => {
        const width = entries[entries.length - 1]?.contentRect.width ?? 0;
        if (!(width > 0) || Math.abs(width - pendingWidth) < 0.5) return;
        pendingWidth = width;
        // Once per frame, outside the observer callback, so the new height can't loop back into it.
        stopFrame ??= clock.onFrame(() => {
          stopFrame?.();
          stopFrame = undefined;
          if (Math.abs(pendingWidth - measuredWidth) < 0.5) return;
          measuredWidth = pendingWidth;
          if (current.width === undefined) relayout();
        });
      })
    : undefined;
  observer?.observe(container);

  // Label margins are measured; measure again once web fonts arrive.
  const fonts = (doc as Document & { fonts?: EventTarget }).fonts;
  const onFonts = (): void => {
    measure.clear();
    relayout();
  };
  fonts?.addEventListener?.("loadingdone", onFonts);

  // ── First render ───────────────────────────────────────────────────────────

  describeChart(svg, current);
  setAttributes(svg, sizeAttributes(laidOut.frame.bands));
  for (const tick of laidOut.ticks) addTick(tick.value, 1);
  for (const tick of ticks.values()) drawTick(tick, laidOut.frame);
  order = laidOut.rows.map((row) => {
    const record = createRecord(row, false);
    records.set(row.key, record);
    labelMark(record);
    return record;
  });
  keyboard.sync();
  runner.enter(order.map(input));

  return {
    element: svg,

    async update(next) {
      if (destroyed) return;
      if (next.on !== undefined && next.on !== current.on) throw new TypeError("barChart: `on` can't be changed by update() yet.");
      if (next.motion !== undefined && next.motion !== current.motion) throw new TypeError("barChart: `motion` can't be changed by update() yet.");
      const merged: BarChartOptions<D> = { ...current, ...next };
      checkOptions(merged);
      // Throws on data it can't draw, before anything changes.
      const nextLayout = layout(merged);
      if ("colors" in next) colors = toColorAssignment(merged.colors);
      current = merged;
      describeChart(svg, current);
      if (current.dim === false) svg.classList.remove("ec-hovering");
      else if (hovered !== undefined) svg.classList.add("ec-hovering");
      supersede?.();

      // The order the runner expects: interrupt, then exit / update / enter, then change() on every
      // frame, then settle() once the transition has settled.
      runner.interrupt();
      const diff = arrange(nextLayout);
      if (hovered !== undefined && !records.has(hovered.key)) {
        interaction.clear();
        endHover();
      }
      const leaves = diff.exiting.map((record) => record.leave!);
      const exited = runner.exit(diff.exiting.map(onScreen));
      void exited.then(() => {
        for (const leave of leaves) leave.exited = true;
        sweep();
      });
      emitEach("exit", diff.exiting);
      runner.update(diff.changed.map(({ record, from }) => ({ ...input(record), from })));
      diff.changed.forEach(({ record, from }, index) => emit("update", { ...input(record), from, batch: { index, count: diff.changed.length } }));
      runner.enter(diff.entering.map(input));
      emitEach("enter", diff.entering);
      // Focus stayed with its key. If that mark is leaving, focus moves to its nearest neighbour, whose
      // hover the runner holds until the change settles.
      keyboard.sync();

      const settled = transitionTo(nextLayout, motion.mode === "off" || nextLayout.orientation !== orientation);
      await new Promise<void>((resolve) => {
        supersede = resolve;
        void settled.then(() => Promise.all(leaves.map((leave) => leave.gone))).then(() => resolve());
      });
    },

    on(type, listener) {
      const set = listeners[type] as Set<typeof listener> | undefined;
      if (!set) throw new TypeError(`barChart: unknown event "${String(type)}". Use one of: ${Object.keys(listeners).join(", ")}.`);
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },

    marks: () => order.map((record) => record.shown.geometry),

    destroy() {
      if (destroyed) return;
      destroyed = true;
      transition = undefined;
      unfollow?.();
      interaction.destroy();
      keyboard.destroy();
      runner.destroy();
      unsubscribeMotion();
      observer?.disconnect();
      stopFrame?.();
      fonts?.removeEventListener?.("loadingdone", onFonts);
      for (const record of [...order, ...leaving.values()]) {
        for (const value of [record.values, record.slot, record.presence]) value.stop();
        record.leave?.resolve();
      }
      scale.stop();
      bands.stop();
      for (const tick of ticks.values()) tick.opacity.stop();
      supersede?.();
      for (const set of Object.values(listeners)) set.clear();
      records.clear();
      leaving.clear();
      order = [];
      svg.remove();
    }
  };
}

function resolveTarget(target: string | Element): Element {
  if (typeof target === "string") {
    const found = typeof document === "undefined" ? null : document.querySelector(target);
    if (!found) throw new TypeError(`barChart: no element matches "${target}".`);
    return found;
  }
  if (!target || typeof (target as Element).appendChild !== "function") throw new TypeError("barChart needs a container element or a selector.");
  return target;
}

function checkOptions<D>(options: BarChartOptions<D>): void {
  if (typeof options !== "object" || options === null) throw new TypeError("barChart needs options.");
  if (typeof options.label !== "string" || options.label.trim() === "") throw new TypeError("barChart needs a label: the chart's accessible name.");
  if (!Array.isArray(options.data)) throw new TypeError("barChart: data must be an array of rows.");
  for (const field of ["width", "height"] as const) {
    const value = options[field];
    if (value !== undefined && !(Number.isFinite(value) && value > 0)) throw new RangeError(`barChart: ${field} must be a positive number of px, got ${String(value)}.`);
  }
}

/**
 * Data effects name the series they read through `needs.related`. A chart without one of them
 * throws when it's created or updated, rather than the effect finding nothing when it runs.
 */
function checkNeeds<D>(effects: SlotEffects<D>, series: readonly string[]): void {
  for (const slot of EFFECT_SLOTS) {
    const effect = effects[slot];
    if (effect?.kind !== "data") continue;
    for (const name of effect.needs?.related ?? []) {
      if (series.includes(name)) continue;
      throw new RangeError(`barChart: on.${slot} needs the series "${name}", but the chart's series are ${series.map((s) => `"${s}"`).join(", ")}.`);
    }
  }
}

function describeChart<D>(svg: SVGSVGElement, options: BarChartOptions<D>): void {
  svg.setAttribute("aria-label", options.label);
  let desc = svg.querySelector(":scope > desc");
  if (options.description) {
    desc ??= svg.insertBefore(svgElement("desc", {}, svg), svg.firstChild);
    desc.textContent = options.description;
  } else {
    desc?.remove();
  }
}

/** The container's content width in px; a fallback when it has none (hidden, or no layout). */
function containerWidth(container: Element): number {
  const style = container.ownerDocument.defaultView?.getComputedStyle(container);
  const padding = (parseFloat(style?.paddingLeft ?? "") || 0) + (parseFloat(style?.paddingRight ?? "") || 0);
  const width = container.clientWidth - padding;
  return width > 0 ? width : FALLBACK_WIDTH;
}

function sizeAttributes({ width, height }: { readonly width: number; readonly height: number }): Record<string, string | number> {
  return { width, height, viewBox: `0 0 ${round(width, 3)} ${round(height, 3)}` };
}

function placeText(element: SVGTextElement, placement: TextPlacement): void {
  setAttributes(element, { x: placement.x, y: placement.y, "text-anchor": placement.anchor });
  if (element.textContent !== placement.text) element.textContent = placement.text;
}

/** "Okafor: 16 goals, 4 assists". A lone value read by a function (its series is "value") goes unnamed: "Okafor: 16". */
function markLabel<D>(row: BarRow<D>, format: (value: number) => string): string {
  const lone = row.values.length === 1 && row.values[0]!.series === "value";
  const values = row.values.map((v) => (lone ? format(v.value) : `${format(v.value)} ${v.series}`));
  return `${row.label.text}: ${values.join(", ")}`;
}

function valuesChanged<D>(from: BarRow<D>, to: BarRow<D>): boolean {
  return from.values.length !== to.values.length || from.values.some((v, i) => v.series !== to.values[i]!.series || v.value !== to.values[i]!.value);
}

function geometryChanged(from: MarkGeometry, to: MarkGeometry): boolean {
  if (from.outline.d !== to.outline.d) return true;
  const a = from.segments ?? [];
  const b = to.segments ?? [];
  return a.length !== b.length || a.some((segment, i) => segment.key !== b[i]!.key || segment.outline.d !== b[i]!.outline.d);
}

function valuesOf<D>(row: BarRow<D>): Values {
  return Object.fromEntries(row.values.map((v) => [v.series, v.value]));
}

function zeros(values: Values): Values {
  return Object.fromEntries(Object.keys(values).map((series) => [series, 0]));
}

/**
 * The layout's series order, with series on their way out kept where they were: just after the
 * series they followed, or first. So a stack that loses its base shrinks it in place.
 */
function mergeSeries(shown: readonly string[], next: readonly string[]): string[] {
  const out = [...next];
  shown.forEach((series, i) => {
    if (out.includes(series)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const found = out.indexOf(shown[j]!);
      if (found >= 0) {
        at = found + 1;
        break;
      }
    }
    out.splice(at, 0, series);
  });
  return out;
}

/** Still animating, or resting somewhere else than `to`. */
function busy<T>(value: Animated<T>, to: T, equal: (a: T, b: T) => boolean): boolean {
  return value.animating || !equal(value.value, to);
}

const same = (a: number, b: number): boolean => a === b;

function sameFields<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** Leaves to settle: a fresh token per departure, so a mark that comes back and leaves again starts over. */
function leave(): Leave {
  let resolve!: () => void;
  const gone = new Promise<void>((r) => {
    resolve = r;
  });
  return { exited: false, gone, resolve };
}

/** Decimal places a value is given to, up to 6: a counting label shows whole numbers between whole totals. */
function decimals(value: number): number {
  const text = String(Number(value.toPrecision(12)));
  if (/e/i.test(text)) return 6;
  const point = text.indexOf(".");
  return point < 0 ? 0 : Math.min(6, text.length - point - 1);
}

function format<D>(options: BarChartOptions<D>): (value: number) => string {
  return options.format ?? defaultFormat;
}

let numberFormat: Intl.NumberFormat | undefined;
function defaultFormat(value: number): string {
  numberFormat ??= new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  return numberFormat.format(value);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  // No "-0" on a label counting down to zero.
  return rounded === 0 ? 0 : rounded;
}
