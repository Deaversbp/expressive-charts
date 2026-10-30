// barChart: the thin reference bar chart. Horizontal bars or vertical columns, plain or stacked; keyed
// marks described with describe.bar; a measured layout; axis, grid and labels in theme colours;
// colours by series or, with one series, by category; built-in hover dimming; pointer, touch and
// keyboard hover with a tooltip; a legend for stacks or categories; a data table and, with `announce`, a
// live region for screen readers. update() animates the change: staged in presentation (values, then positions), in one short stage
// in analysis, at once when motion is off.
//
// The chart never names an effect: it resolves `on` through the presets it's handed and plays them
// through the runner, which draws on the SVG surface. What doesn't depend on bars (events, hover and
// focus, transitions and leaving marks, DOM order, size and fonts) is in shell/.

import type { AnimateOptions, Animated, TweenResult } from "../core";
import { animated, defaultClock, interpolateNumber, interpolateRecord } from "../core";
import { resolveEffects } from "../core/registry";
import { report } from "../core/report";
import { createRunner, type RunInput } from "../core/runner";
import { chartAnnouncer, changeText, type Announcer, type SortName } from "./announce";
import { barEncoding, layoutBars, placeRow, placeTick, type BarFrame, type BarLayout, type BarRow, type BarValue } from "./bar-layout";
import { toColorAssignment } from "./colors";
import { chartLegend } from "./legend";
import { linkable } from "./link";
import { chartMotion } from "./motion";
import { svgMarkHandle, type StyledPart, type SvgMarkHandle } from "./render/mark-style";
import { svgSurface } from "./render/surface";
import { setAttributes, setStyles, sizeAttributes, svgElement, transformAttribute } from "./render/svg";
import { placeText, textMeasure } from "./render/text";
import { injectStyles, markColorStyles, seriesColors } from "./render/theme";
import { seriesLabel } from "./series";
import { chartEvents } from "./shell/events";
import { decimals, format, round } from "./shell/format";
import { chartHover } from "./shell/hover";
import { chartLabel } from "./shell/labels";
import { leavingMarks, type Leave } from "./shell/leaving";
import { orderElements } from "./shell/order";
import { checkChartOptions, checkNeeds, containerWidth, describeChart, nextEffects, resolveTarget, type ChartEnv } from "./shell/setup";
import { busy, chartTransitions, geometryChanged, playUpdate, same, sameFields, type ChartDiff } from "./shell/transitions";
import { watchFonts, watchHoverDuration, watchWidth } from "./shell/watch";
import { chartTable, tableModel, type TableModel } from "./table";
import { chartTooltip, summaryContent } from "./tooltip";
import type { BarChartOptions, Chart } from "./types";

export type { ChartEnv } from "./shell/setup";

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

interface TickRecord {
  readonly value: number;
  readonly line: SVGLineElement;
  readonly label: SVGTextElement;
  /** Ticks the scale gains fade in, and ones it loses fade out. */
  readonly opacity: Animated<number>;
  /** In the latest layout. */
  wanted: boolean;
}

/** What an update changed. A re-sort or a new scale only moves a mark: its values didn't change. */
type Diff<D> = ChartDiff<MarkRecord<D>>;

/** Base ms for each stage of a data change: values, then positions. Unstaged, a change takes as long as its stages together, which analysis scales down. */
const STAGE = 500;
/** The focus ring's px: a gap in the surface colour around the mark, then the ring. */
const RING_GAP = 2;
const RING = 2;

export function barChart<D>(target: string | Element, options: BarChartOptions<D>, env: ChartEnv): BarChart<D> {
  const container = resolveTarget(target, "barChart");
  checkOptions(options);
  let current = options;
  const motion = chartMotion(options.motion, env.motion);
  let effects = resolveEffects(options.on, env.presets);
  let colors = toColorAssignment(options.colors);
  const clock = env.clock ?? defaultClock;
  const doc = container.ownerDocument;
  injectStyles(doc);

  // A named group of marks, each an image with its own name: see "ARIA structure" in docs/architecture.md.
  const svg = svgElement("svg", { class: "ec-chart ec-bar-chart", role: "group" }, container);
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
  const leaving = leavingMarks<MarkRecord<D>>((record) => record.values.animating || record.presence.animating);
  const byGroup = new WeakMap<Element, MarkRecord<D>>();
  const events = chartEvents<D>("barChart");
  let measuredWidth = containerWidth(container);
  let destroyed = false;

  let laidOut: BarLayout<D>;
  let firstTable: TableModel | undefined;
  try {
    // Throws on data it can't draw, or a table column it can't read. Nothing but the <svg> is in
    // place yet (no listeners, observers or elements beside it), so that's all to undo.
    laidOut = layout(current);
    firstTable = tableFor(current, laidOut);
  } catch (error) {
    svg.remove();
    throw error;
  }

  const find = (key: string): MarkRecord<D> | undefined => records.get(key) ?? leaving.get(key);
  const surface = svgSurface({
    overlay,
    measure,
    // Looked up on each call, so the handle follows the mark's record.
    mark: (key) => ({
      set: (style) => {
        find(key)?.handle.set(style);
        hover.restyled(key);
      },
      reset: () => {
        find(key)?.handle.reset();
        hover.restyled(key);
      }
    }),
    colors: (key) => find(key)?.parts[0]?.colors
  });
  const runner = createRunner<D>({ effects, motion, icons: env.icons, clock, surface });
  const tooltip = chartTooltip<D>(svg, { motion, option: () => current.tooltip, description: () => current.markDescription });
  const legend = chartLegend(svg);
  const table = chartTable(svg);
  let announcer: Announcer | undefined = current.announce ? chartAnnouncer(svg) : undefined;

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

  const transitions = chartTransitions({ clock, runner, leaving, draw, land });

  // ── Drawing ────────────────────────────────────────────────────────────────

  function layout(opts: BarChartOptions<D>, using = effects): BarLayout<D> {
    const encoding = barEncoding(opts);
    checkNeeds(using, encoding.series.map((s) => s.series), "barChart");
    return layoutBars({
      data: opts.data,
      encoding,
      sort: opts.sort,
      width: opts.width ?? measuredWidth,
      height: opts.height,
      format: format(opts),
      measure,
      room: opts.room ?? 0
    });
  }

  /** A new mark: drawn as laid out, or, when it enters, at its slot with nothing showing yet. */
  function createRecord(row: BarRow<D>, entering: boolean): MarkRecord<D> {
    // An image: its aria-label says it all, and its text and shapes aren't read on their own.
    const group = svgElement("g", { class: "ec-mark", "data-key": row.key, role: "img" }, marksLayer);
    const env = { clock, motion, onChange: () => dirty.add(record) };
    const values = valuesOf(row);
    const record: MarkRecord<D> = {
      key: row.key,
      row,
      shown: row,
      group,
      hit: svgElement("rect", { class: "ec-hit" }, group),
      label: svgElement("text", { class: "ec-label", "aria-hidden": "true" }, group),
      body: svgElement("g", { class: "ec-body" }, group),
      value: svgElement("text", { class: "ec-value", "aria-hidden": "true" }, group),
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
    // By category, the bar's own slot: the assignment never hears the series' name, so a shared one
    // keeps every slot for the categories.
    const ownColors = byCategory(current) ? seriesColors(colors.slot(record.key)) : undefined;
    record.parts = segments.map((segment) => {
      const series = segment.series ?? segment.key;
      keep.add(series);
      let element = record.paths.get(series);
      if (!element) {
        element = svgElement("path", { class: "ec-segment", "data-series": series }, record.body);
        record.paths.set(series, element);
      }
      const partColors = ownColors ?? seriesColors(colors.slot(series));
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
    if (record.key === hover.ringKey) drawRing(record.key);
  }

  /** The focus ring follows the outline of the mark as it is on screen, moved with its body when an effect moves it. */
  function drawRing(key: string | undefined): void {
    const record = key === undefined ? undefined : records.get(key);
    if (!record) {
      ring.setAttribute("visibility", "hidden");
      return;
    }
    for (const path of ringPaths) path.setAttribute("d", record.shown.geometry.outline.d);
    const { transform } = record.handle.style;
    setAttributes(ring, { transform: transform && transformAttribute(transform), visibility: undefined });
  }

  /**
   * Draws the mark as `row`. Its runs hear about it when its geometry or its row changed, so
   * decorations follow: a label from a field the bar doesn't plot too.
   */
  function show(record: MarkRecord<D>, row: BarRow<D>): void {
    const moved = geometryChanged(record.shown.geometry, row.geometry) || record.shown.datum !== row.datum;
    drawMark(record, row);
    if (moved) runner.change(row.geometry, row.data);
    if (record.key === hover.key) showTooltip(record);
  }

  /** The tooltip beside the hovered mark as it is on screen, moved with its effects, with the text for where it's heading. */
  function showTooltip(record: MarkRecord<D>): void {
    const { row } = record;
    tooltip.show(record.shown.geometry, row, () => summaryContent(row.category, labelled(row.values, current), format(current)), record.handle.style.transform);
  }

  /** The legend for `next`: the series or, coloured by category, each bar's category in visual order. */
  function syncLegend(next: BarLayout<D>): void {
    if (byCategory(current)) {
      legend.categories(
        next.rows.map((row) => ({ key: row.key, label: row.category })),
        colors,
        current.legend
      );
      return;
    }
    legend.update(
      barEncoding(current).series.map((s) => ({ series: s.series, label: seriesLabel(current.seriesLabels, s.series) })),
      colors,
      current.legend
    );
  }

  /** The data table for `opts`, laid out as `next`: its rows in visual order. Throws on a column it can't read. */
  function tableFor(opts: BarChartOptions<D>, next: BarLayout<D>): TableModel | undefined {
    const encoding = barEncoding(opts);
    const field = encoding.orientation === "horizontal" ? opts.y : opts.x;
    return tableModel({
      option: opts.table,
      caption: opts.label,
      category: typeof field === "string" ? field : undefined,
      series: encoding.series.map((s) => s.series),
      label: (series) => seriesLabel(opts.seriesLabels, series),
      rows: next.rows.map((row) => ({ key: row.key, category: row.category, datum: row.datum, index: row.index, values: row.values, total: row.total })),
      format: format(opts)
    });
  }

  /** Says what an update changed, in the live region: the chart's summary, or the page's text from it. */
  function announceChange(previous: BarChartOptions<D>, diff: Diff<D>): void {
    const option = current.announce;
    if (!announcer || !option) return;
    const series = barEncoding(current).series.map((s) => s.series);
    const before = barEncoding(previous).series.map((s) => s.series);
    const sort = sortName(current.sort);
    const name = (record: MarkRecord<D>): string => record.row.category;
    const changed = diff.changed.map(({ record }) => record);
    const text = changeText({
      ...(current.label !== previous.label ? { label: current.label } : {}),
      // New series are said by their labels; new labels alone show the same view, so say nothing.
      ...(series.join("\n") !== before.join("\n") ? { series: series.map((s) => seriesLabel(current.seriesLabels, s)) } : {}),
      ...(sort !== sortName(previous.sort) || (sort === "custom" && current.sort !== previous.sort) ? { sort } : {}),
      changed: changed.map(name),
      added: diff.entering.map(name),
      removed: diff.exiting.map(name),
      count: order.length
    });
    if (typeof option !== "function") {
      announcer.say(text);
      return;
    }
    const key = (record: MarkRecord<D>): string => record.key;
    try {
      const said = option({ text, changed: changed.map(key), added: diff.entering.map(key), removed: diff.exiting.map(key) });
      if (said !== undefined && said !== null) announcer.say(String(said));
    } catch (error) {
      report(error);
    }
  }

  const currentFrame = (): BarFrame => ({ orientation, scale: scale.value, bands: bands.value });

  /** The mark as it is now, part way through a transition. */
  function currentRow(record: MarkRecord<D>, frame: BarFrame): BarRow<D> {
    const { row } = record;
    const now = record.values.value;
    const values = record.series.map((series) => ({ series, value: now[series] ?? 0 }));
    const total = values.reduce((sum, v) => sum + v.value, 0);
    const text = record.count === undefined ? row.value.text : format(current)(round(total, record.count));
    return placeRow(frame, { key: row.key, datum: row.datum, index: row.index, category: row.category, values, slot: record.slot.value, text, drawn: row.drawn }, measure);
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
      leaving.start(record);
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
        record = leaving.recall(row.key) ?? createRecord(row, true);
        record.count = undefined;
        records.set(row.key, record);
        diff.entering.push(record);
      }
      record.row = row;
      record.series = mergeSeries(record.series, row.values.map((v) => v.series));
      labelMark(record);
      return record;
    });
    // DOM order follows visual order, for screen readers.
    orderElements(
      marksLayer,
      previous.map((record) => record.group),
      order.map((record) => record.group),
      hover.active
    );
    return diff;
  }

  /** The mark's accessible name, from where it's heading, and its description (`markDescription`, or a tooltip function's text). */
  function labelMark(record: MarkRecord<D>): void {
    record.group.setAttribute("aria-label", markLabel(record.row, current));
    tooltip.describe(record.group, record.row);
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
    return transitions.run(retarget(next, jump));
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

  // Pointer, touch and keyboard focus share one hover: see shell/hover.ts.
  const hover = chartHover<D>({
    svg,
    runner,
    events,
    dim: () => current.dim !== false,
    find(eventTarget) {
      const record = liveRecordOf(eventTarget);
      if (!record) return undefined;
      const segment = (eventTarget as Element).closest(".ec-segment")?.getAttribute("data-series") ?? undefined;
      return segment === undefined ? { key: record.key } : { key: record.key, segment };
    },
    live: (key) => records.has(key),
    order: () => order.map((record) => record.key),
    element: (key) => find(key)?.group,
    hot: surface.hot,
    onScreen(key) {
      const record = find(key);
      return record && onScreen(record);
    },
    ring: drawRing,
    tooltip: {
      show(key) {
        const record = records.get(key);
        if (record) showTooltip(record);
      },
      hide: () => tooltip.hide(),
      element: () => tooltip.element()
    }
  });

  // ── Motion, size and fonts ─────────────────────────────────────────────────

  const unwatchHoverDuration = watchHoverDuration(svg, motion);

  /** Re-lays out without animating: a resize or fonts loading. A transition in flight lands at once. Effects follow through change(). */
  function relayout(): void {
    if (destroyed) return;
    const next = layout(current);
    // The same rows as now: only the sizes changed.
    const rows = new Map(next.rows.map((row) => [row.key, row]));
    for (const record of order) record.row = rows.get(record.key) ?? record.row;
    void transitionTo(next, true);
  }

  const unwatchWidth = watchWidth(container, clock, measuredWidth, (width) => {
    measuredWidth = width;
    // A fixed `width` ignores the container.
    if (current.width === undefined) relayout();
  });

  // Label margins are measured; measure again once web fonts arrive.
  const unwatchFonts = watchFonts(doc, () => {
    measure.clear();
    relayout();
  });

  // ── First render ───────────────────────────────────────────────────────────

  describeChart(svg, current);
  syncLegend(laidOut);
  table.render(firstTable);
  setAttributes(svg, sizeAttributes(laidOut.frame.bands));
  for (const tick of laidOut.ticks) addTick(tick.value, 1);
  for (const tick of ticks.values()) drawTick(tick, laidOut.frame);
  order = laidOut.rows.map((row) => {
    const record = createRecord(row, false);
    records.set(row.key, record);
    labelMark(record);
    return record;
  });
  hover.sync();
  runner.enter(order.map(input));

  return linkable(hover.link, {
    element: svg,

    async update(next) {
      if (destroyed) return;
      if (next.motion !== undefined && next.motion !== current.motion) throw new TypeError("barChart: `motion` can't be changed by update() yet.");
      const merged: BarChartOptions<D> = { ...current, ...next };
      checkOptions(merged);
      // Throws on an effect it can't resolve, data it can't draw, or a table column it can't read,
      // before anything changes.
      const swapped = "on" in next ? nextEffects(effects, current.on, merged.on, env.presets) : effects;
      const nextLayout = layout(merged, swapped);
      const nextTable = tableFor(merged, nextLayout);
      if ("colors" in next) colors = toColorAssignment(merged.colors);
      const previous = current;
      current = merged;
      describeChart(svg, current);
      syncLegend(nextLayout);
      table.render(nextTable);
      // A region that appears with its first text is often missed: it announces from the next update.
      const announcing = announcer !== undefined;
      if (current.announce && !announcer) announcer = chartAnnouncer(svg);
      else if (!current.announce && announcer) {
        announcer.destroy();
        announcer = undefined;
      }
      hover.syncDim();
      transitions.supersede();
      const swapping = swapped !== effects;
      effects = swapped;

      // The runner hears exit / update / enter now, then change() on every frame, then settle(). New
      // effects start where the old ones were, on the bars staying, as this update leaves them; a held
      // hover replays with them once the change settles.
      const leaves = playUpdate(
        {
          runner,
          events,
          hover,
          leaving,
          input,
          onScreen,
          data: "data" in next,
          ...(swapping
            ? {
                swap: (diff: Diff<D>) => {
                  const entering = new Set(diff.entering);
                  runner.swap(swapped, order.filter((record) => !entering.has(record)).map(input));
                }
              }
            : {})
        },
        () => arrange(nextLayout),
        (diff) => {
          if (announcing) announceChange(previous, diff);
        }
      );
      // Coloured the other way now: every bar takes its new colour on the change's first frame.
      if (byCategory(current) !== byCategory(previous)) for (const record of [...order, ...leaving.values()]) dirty.add(record);
      const settled = transitionTo(nextLayout, motion.mode === "off" || nextLayout.orientation !== orientation);
      await transitions.wait(settled, leaves);
    },

    on: events.on,

    marks: () => order.map((record) => record.shown.geometry),

    focus(key) {
      if (!destroyed) hover.focus(key);
    },

    leave() {
      if (!destroyed) hover.leave();
    },

    labels: () =>
      order.flatMap((record) => [
        ...chartLabel(record.key, "category", record.shown.label, record.label),
        ...chartLabel(record.key, "value", record.shown.value, record.value)
      ]),

    destroy() {
      if (destroyed) return;
      destroyed = true;
      // Ends the transition in flight, and resolves the latest update()'s promise.
      transitions.destroy();
      hover.destroy();
      runner.destroy();
      tooltip.destroy();
      legend.destroy();
      table.destroy();
      announcer?.destroy();
      unwatchHoverDuration();
      unwatchWidth();
      unwatchFonts();
      for (const record of [...order, ...leaving.values()]) {
        for (const value of [record.values, record.slot, record.presence]) value.stop();
        record.leave?.resolve();
      }
      scale.stop();
      bands.stop();
      for (const tick of ticks.values()) tick.opacity.stop();
      events.clear();
      records.clear();
      leaving.clear();
      order = [];
      svg.remove();
    }
  });
}

/** The options every chart shares, then `room`, and `colorBy`: "category" needs one series, so a stack throws. */
function checkOptions<D>(options: BarChartOptions<D>): void {
  checkChartOptions(options, "barChart");
  const { colorBy, room } = options;
  if (room !== undefined && !(typeof room === "number" && Number.isFinite(room) && room >= 0)) throw new RangeError(`barChart: room must be a number of px, 0 or more, got ${String(room)}.`);
  if (colorBy !== undefined && colorBy !== "series" && colorBy !== "category") throw new TypeError(`barChart: colorBy must be "series" or "category", got ${String(colorBy)}.`);
  if (colorBy === "category" && options.stack !== undefined) {
    throw new TypeError('barChart: colorBy: "category" gives each bar one colour, so it needs one series, not a stack. A stack colours its segments by series.');
  }
}

/** Each bar takes its own slot, by key, rather than each segment its series'. */
function byCategory<D>(options: BarChartOptions<D>): boolean {
  return options.colorBy === "category";
}

/**
 * "Okafor: 16 goals, 4 assists", each series said by its label, or the page's wording from `markLabel`.
 * A lone value read by a function (its series is "value") goes unnamed unless it's labelled: "Okafor:
 * 16". An empty name, or a throw (reported), keeps the default, so a focusable mark is never left unnamed.
 */
function markLabel<D>(row: BarRow<D>, options: BarChartOptions<D>): string {
  const formatted = format(options);
  const values = labelled(row.values, options);
  const lone = values.length === 1 && values[0]!.series === "value" && values[0]!.label === "value";
  const text = `${row.category}: ${values.map((v) => (lone ? formatted(v.value) : `${formatted(v.value)} ${v.label}`)).join(", ")}`;
  if (!options.markLabel) return text;
  try {
    const named: unknown = options.markLabel(row.datum, { key: row.key, category: row.category, values, total: row.total, format: formatted, text });
    if (named !== undefined && named !== null && String(named).trim() !== "") return String(named);
  } catch (error) {
    report(error);
  }
  return text;
}

/** The row's values, each with its series' label: what the tooltip and the mark's name say. Copies, so a page can't change the layout's. */
function labelled<D>(values: readonly BarValue[], options: BarChartOptions<D>): { series: string; label: string; value: number }[] {
  return values.map((v) => ({ series: v.series, label: seriesLabel(options.seriesLabels, v.series), value: v.value }));
}

function valuesChanged<D>(from: BarRow<D>, to: BarRow<D>): boolean {
  return from.values.length !== to.values.length || from.values.some((v, i) => v.series !== to.values[i]!.series || v.value !== to.values[i]!.value);
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

function sortName<D>(sort: BarChartOptions<D>["sort"]): SortName {
  return typeof sort === "function" ? "custom" : (sort ?? "none");
}
