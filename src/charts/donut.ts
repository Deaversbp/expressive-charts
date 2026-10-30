// donutChart: the reference donut. Keyed slices described with describe.arc, from 12 o'clock and
// clockwise, separated by strokes in the surface colour; labels outside the ring and the total in its
// hole; a legend per category; built-in hover dimming; pointer, touch and keyboard hover with a
// tooltip; a data table with each share and the total and, with `announce`, a live region for screen
// readers. update() animates the values in data units, so every frame's angles are true shares:
// staged in presentation (values, then slices turning to their new places), in one short stage in
// analysis, at once when motion is off.
//
// The chart never names an effect: it resolves `on` through the presets it's handed and plays them
// through the runner, which draws on the SVG surface. What doesn't depend on slices (events, hover and
// focus, transitions and leaving marks, DOM order, size and fonts) is in shell/. The focus ring and
// halos are drawn above the slices, masked to outside them (render/outside.ts), since slices touch.

import type { AnimateOptions, Animated, TweenResult } from "../core";
import { animated, defaultClock, interpolateNumber, interpolateRecord } from "../core";
import { resolveEffects } from "../core/registry";
import { report } from "../core/report";
import { createRunner, type RunInput } from "../core/runner";
import { chartAnnouncer, changeText, type Announcer } from "./announce";
import { toColorAssignment } from "./colors";
import { CENTER_SIZE, donutEncoding, layoutDonut, placeCenter, placeLabels, placeSlices, type CenterLine, type DonutFrame, type DonutLayout, type DonutSlice, type SliceLabel, type SliceState } from "./donut-layout";
import { chartLegend } from "./legend";
import { linkable } from "./link";
import { chartMotion } from "./motion";
import { svgMarkHandle, type StyledPart, type SvgMarkHandle } from "./render/mark-style";
import { maskedRing } from "./render/outside";
import { svgSurface } from "./render/surface";
import { setAttributes, setStyles, sizeAttributes, svgElement } from "./render/svg";
import { placeText, textMeasure } from "./render/text";
import { injectStyles, markColorStyles, seriesColors } from "./render/theme";
import { seriesLabel } from "./series";
import { chartEvents } from "./shell/events";
import { decimals, format, percent, round } from "./shell/format";
import { chartHover } from "./shell/hover";
import { chartLabel } from "./shell/labels";
import { leavingMarks, type Leave } from "./shell/leaving";
import { orderElements } from "./shell/order";
import { checkChartOptions, checkNeeds, containerWidth, describeChart, nextEffects, resolveTarget, type ChartEnv } from "./shell/setup";
import { busy, chartTransitions, geometryChanged, playUpdate, same, sameFields, type ChartDiff } from "./shell/transitions";
import { watchFonts, watchHoverDuration, watchWidth } from "./shell/watch";
import type { ChartSwitchPaint } from "./switch";
import { chartTable, tableModel, type TableModel } from "./table";
import { chartTooltip } from "./tooltip";
import type { Chart, DonutChartOptions } from "./types";

export type DonutChart<D> = Chart<D, DonutChartOptions<D>>;

interface SliceRecord<D> {
  readonly key: string;
  /** Where the slice is heading, or rests: its slice in the latest layout (its last one while it leaves). */
  row: DonutSlice<D>;
  /** What's on screen now. */
  shown: DonutSlice<D>;
  readonly group: SVGGElement;
  /** The pointer target, which stays put while an effect moves the slice. */
  readonly hit: SVGPathElement;
  /** Holds the slice; effects' transform and opacity go here. */
  readonly body: SVGGElement;
  readonly path: SVGPathElement;
  /** The label outside the ring: the category over the share. */
  readonly label: SVGTextElement;
  readonly share: SVGTextElement;
  /** Where the label is drawn now; undefined while it's dropped for room. */
  drawnLabel: SliceLabel | undefined;
  parts: StyledPart[];
  readonly handle: SvgMarkHandle;
  /** In data units, so every frame's angles are true shares. */
  readonly value: Animated<number>;
  /** 0 to 1: how far the slice has turned from where it was to its place in the ring. */
  readonly turn: Animated<number>;
  /** Where it turns from, in turns: its start in the order it turns from, plus this. */
  offset: number;
  /** How far it turns, in turns, at the targets: the shorter way, chosen once so it can't flip mid-turn. */
  planned: number;
  /** 0 to 1. A slice entering or leaving fades its label in or out. */
  readonly presence: Animated<number>;
  /** Set while the slice leaves. */
  leave: Leave | undefined;
}

/** What an update changed. A re-sort only turns a slice, and a new total only resizes it: its value didn't change. */
type Diff<D> = ChartDiff<SliceRecord<D>>;

/** Base ms for each stage of a data change: values, then the turn to new places. Unstaged, a change takes as long as its stages together, which analysis scales down. */
const STAGE = 500;
const TAU = 2 * Math.PI;
/** A walk shorter than this draws nothing, as effects treat it. */
const VISIBLE = 0.5;

export function donutChart<D>(target: string | Element, options: DonutChartOptions<D>, env: ChartEnv): DonutChart<D> {
  const container = resolveTarget(target, "donutChart");
  checkOptions(options);
  let current = options;
  const motion = chartMotion(options.motion, env.motion);
  let effects = resolveEffects(options.on, env.presets);
  let colors = toColorAssignment(options.colors);
  const clock = env.clock ?? defaultClock;
  const doc = container.ownerDocument;
  injectStyles(doc);

  // A named group of slices, each an image with its own name: see "ARIA structure" in docs/architecture.md.
  const svg = svgElement("svg", { class: "ec-chart ec-donut-chart", role: "group" }, container);
  // Read through the chart's description instead.
  const center = svgElement("g", { class: "ec-center", "aria-hidden": "true" }, svg);
  const marksLayer = svgElement("g", { class: "ec-marks" }, svg);
  const overlay = svgElement("g", { class: "ec-overlay", "aria-hidden": "true" }, svg);
  // Above the slices, masked to outside the slice: slices touch, so anything behind one would hide
  // under its neighbour on one side.
  const halos = svgElement("g", { class: "ec-halos" }, overlay);
  const focusRing = maskedRing(overlay);
  const runs = svgElement("g", { class: "ec-runs" }, overlay);
  const measure = textMeasure(svg);

  /** Live slices, in the layout's order: clockwise from 12 o'clock. */
  let order: SliceRecord<D>[] = [];
  const records = new Map<string, SliceRecord<D>>();
  /** Slices on their way out: shrinking, or waiting for their exit effects. */
  const leaving = leavingMarks<SliceRecord<D>>((record) => record.value.animating || record.presence.animating);
  const byGroup = new WeakMap<Element, SliceRecord<D>>();
  const events = chartEvents<D>("donutChart");
  let measuredWidth = containerWidth(container);
  let destroyed = false;

  let laidOut: DonutLayout<D>;
  let firstTable: TableModel | undefined;
  /** Each slice's accessible name, by key, for the latest layout. */
  let names: ReadonlyMap<string, string>;
  try {
    // Throws on data it can't draw, a table column it can't read, or a `format` that throws. Nothing
    // but the <svg> is in place yet (no listeners, observers or elements beside it), so that's all to undo.
    laidOut = layout(current);
    firstTable = tableFor(current, laidOut);
    // Last, so a markLabel that throws is reported only for a layout the chart draws.
    names = namesFor(current, laidOut);
  } catch (error) {
    svg.remove();
    throw error;
  }

  const find = (key: string): SliceRecord<D> | undefined => records.get(key) ?? leaving.get(key);
  const surface = svgSurface({
    overlay: runs,
    // Looked up on each call, so the handle follows the slice's record.
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
  // Each slice has its value, how far it has turned and its presence, and the chart has the frame, so
  // a new update() mid-flight retargets each from where it is and nothing jumps. Where a slice is comes
  // from them: the slices in `ring` are laid end to end from their values, and a slice still turning
  // is part way from its start in `from` (plus its offset) to its start in `ring`.

  /** Every slice drawn, live and leaving, in the order they're joined in: the layout's, with leaving slices kept where they were. */
  let ring: SliceRecord<D>[] = [];
  /** The order slices turn from: where they were joined before the latest change. */
  let from: SliceRecord<D>[] = [];
  /** Something moved since the last frame was drawn. Every slice's angles depend on every value, so a frame draws them all. */
  let dirty = false;
  const frame = animated(laidOut.frame, interpolateRecord, { clock, motion, onChange: () => (dirty = true) });
  /** The centre's total counts between totals, rounded to this many decimals; undefined shows the layout's text. */
  let count: number | undefined;
  /** The centre's text for the total last shown while counting. */
  let counted: { readonly total: number; readonly text: string } | undefined;

  const transitions = chartTransitions({ clock, runner, leaving, draw, land });

  // ── Drawing ────────────────────────────────────────────────────────────────

  function layout(opts: DonutChartOptions<D>, using = effects): DonutLayout<D> {
    const encoding = donutEncoding(opts);
    checkNeeds(using, [encoding.series], "donutChart");
    return layoutDonut({
      data: opts.data,
      encoding,
      sort: opts.sort,
      width: opts.width ?? measuredWidth,
      height: opts.height,
      center: (total) => centerText(opts, encoding.series, total),
      measure
    });
  }

  /** A new slice, drawn when it's first shown. One that enters grows from nothing. */
  function createRecord(row: DonutSlice<D>, entering: boolean): SliceRecord<D> {
    // An image: its aria-label says it all, and its text and shapes aren't read on their own.
    const group = svgElement("g", { class: "ec-mark", "data-key": row.key, role: "img" }, marksLayer);
    const env = { clock, motion, onChange: () => (dirty = true) };
    const body = svgElement("g", { class: "ec-body" }, group);
    const record: SliceRecord<D> = {
      key: row.key,
      row,
      shown: row,
      group,
      hit: svgElement("path", { class: "ec-hit" }, group),
      body,
      path: svgElement("path", { class: "ec-slice", "data-series": row.series }, body),
      label: svgElement("text", { class: "ec-label", "aria-hidden": "true" }, group),
      share: svgElement("text", { class: "ec-value", "aria-hidden": "true" }, group),
      drawnLabel: undefined,
      parts: [],
      handle: svgMarkHandle(() => record, { halos: () => halos }),
      value: animated(entering ? 0 : row.value, interpolateNumber, env),
      turn: animated(1, interpolateNumber, env),
      offset: 0,
      planned: 0,
      presence: animated(entering ? 0 : 1, interpolateNumber, env),
      leave: undefined
    };
    // The pointer target first, under the slice.
    group.insertBefore(record.hit, body);
    byGroup.set(group, record);
    return record;
  }

  /** Draws the slice as `slice`, with its label outside the ring or none. */
  function drawMark(record: SliceRecord<D>, slice: DonutSlice<D>, label: SliceLabel | undefined): void {
    const before = record.parts[0]?.colors.color;
    record.shown = slice;
    const { outline } = slice.geometry;
    // A slice with no angle draws nothing: not even its separator.
    const visible = slice.geometry.length >= VISIBLE;
    const hidden = visible ? undefined : "hidden";
    setAttributes(record.path, { d: outline.d, visibility: hidden });
    setAttributes(record.hit, { d: outline.d, visibility: hidden });
    const sliceColors = seriesColors(colors.slot(record.key));
    setStyles(record.path, markColorStyles(sliceColors));
    record.parts = [{ element: record.path, d: outline.d, colors: sliceColors, visible }];
    const presence = record.presence.value;
    const opacity = presence < 1 ? presence : undefined;
    record.drawnLabel = label;
    for (const [text, placement] of [
      [record.label, label?.category],
      [record.share, label?.share]
    ] as const) {
      if (placement) placeText(text, placement);
      setAttributes(text, { visibility: placement ? undefined : "hidden", opacity });
    }
    record.handle.repaint();
    // A new palette: overlays already drawn in "mark" follow.
    if (sliceColors.color !== before) surface.recolor(record.key);
    if (record.key === hover.ringKey) drawRing(record.key);
  }

  /** The focus ring follows the slice's outline as it is on screen, moved with its body when an effect moves it. */
  function drawRing(key: string | undefined): void {
    const record = key === undefined ? undefined : records.get(key);
    focusRing.draw(record && { outline: record.shown.geometry.outline, thickness: record.shown.geometry.thickness, transform: record.handle.style.transform });
  }

  /**
   * Draws the slice as `slice`. Its runs hear about it when its geometry or its row changed, so
   * decorations follow: a label from a field the slice doesn't plot too.
   */
  function show(record: SliceRecord<D>, slice: DonutSlice<D>, label: SliceLabel | undefined): void {
    const moved = geometryChanged(record.shown.geometry, slice.geometry) || record.shown.datum !== slice.datum;
    drawMark(record, slice, label);
    if (moved) runner.change(slice.geometry, slice.data);
    if (record.key === hover.key) showTooltip(record);
  }

  /** The tooltip beside the hovered slice as it is on screen, moved with its effects, with the text for where it's heading. */
  function showTooltip(record: SliceRecord<D>): void {
    const { row } = record;
    tooltip.show(record.shown.geometry, row, () => ({ title: row.category, lines: [`${valueText(row, current)} · ${percent(row.share)}`] }), record.handle.style.transform);
  }

  /** The text in the hole, a line per <text>: the first large. */
  function drawCenter(lines: readonly CenterLine[]): void {
    while (center.childElementCount > lines.length) center.lastElementChild!.remove();
    lines.forEach((line, i) => {
      const text = (center.children[i] as SVGTextElement | undefined) ?? svgElement("text", {}, center);
      setAttributes(text, { class: i === 0 ? "ec-center-value" : "ec-center-label" });
      placeText(text, line);
      // Shrunk to fit the hole; otherwise the stylesheet's size.
      setStyles(text, { "font-size": i === 0 && line.size !== CENTER_SIZE ? `${line.size}px` : undefined });
    });
  }

  const syncLegend = (): void =>
    legend.categories(
      laidOut.slices.map((slice) => ({ key: slice.key, label: slice.category })),
      colors,
      current.legend
    );

  /** The data table for `opts`, laid out as `next`: its rows in the slices' order, each share, and the total. Throws on a column it can't read. */
  function tableFor(opts: DonutChartOptions<D>, next: DonutLayout<D>): TableModel | undefined {
    const { series } = donutEncoding(opts);
    return tableModel({
      option: opts.table,
      caption: opts.label,
      category: typeof opts.category === "string" ? opts.category : undefined,
      series: [series],
      label: (name) => seriesLabel(opts.seriesLabels, name),
      rows: next.slices.map((slice) => ({ key: slice.key, category: slice.category, datum: slice.datum, index: slice.index, values: [{ series, value: slice.value }], total: slice.value })),
      format: format(opts),
      shares: true
    });
  }

  /** The chart's description: its own, then the centre's text, so the total is heard on entering the chart. */
  function describeDonut(): void {
    describeChart(svg, { label: current.label, description: description(current.description, laidOut.centerText) });
  }

  /** Says what an update changed, in the live region: the chart's summary, or the page's text from it. */
  function announceChange(previous: DonutChartOptions<D>, diff: Diff<D>): void {
    const option = current.announce;
    if (!announcer || !option) return;
    const series = donutEncoding(current).series;
    const before = donutEncoding(previous).series;
    const sort = current.sort ?? "none";
    const name = (record: SliceRecord<D>): string => record.row.category;
    const changed = diff.changed.map(({ record }) => record);
    const text = changeText({
      ...(current.label !== previous.label ? { label: current.label } : {}),
      // A new series is said by its label; a new label alone shows the same view, so say nothing.
      ...(series !== before ? { series: [seriesLabel(current.seriesLabels, series)] } : {}),
      ...(sort !== (previous.sort ?? "none") ? { sort } : {}),
      changed: changed.map(name),
      added: diff.entering.map(name),
      removed: diff.exiting.map(name),
      count: order.length
    });
    if (typeof option !== "function") {
      announcer.say(text);
      return;
    }
    const key = (record: SliceRecord<D>): string => record.key;
    try {
      const said = option({ text, changed: changed.map(key), added: diff.entering.map(key), removed: diff.exiting.map(key) });
      if (said !== undefined && said !== null) announcer.say(String(said));
    } catch (error) {
      report(error);
    }
  }

  /** On screen: live, or leaving and not yet gone. */
  const drawn = (record: SliceRecord<D>): boolean => records.get(record.key) === record || leaving.get(record.key) === record;
  const valueOf = (record: SliceRecord<D>): number => Math.max(0, record.value.value);

  /** Each slice's start, in turns, laid end to end from 12 o'clock in the order given, as shares of `total`. */
  function startsIn(slices: readonly SliceRecord<D>[], total: number, value = valueOf): Map<SliceRecord<D>, number> {
    const starts = new Map<SliceRecord<D>, number>();
    let before = 0;
    for (const record of slices) {
      starts.set(record, total > 0 ? before / total : 0);
      before += value(record);
    }
    return starts;
  }

  /** Where every slice drawn is now, in turns: its start, and its span (its true share). */
  function angles(): Map<SliceRecord<D>, { readonly start: number; readonly span: number }> {
    ring = ring.filter(drawn);
    from = from.filter(drawn);
    const total = ring.reduce((sum, record) => sum + valueOf(record), 0);
    const to = startsIn(ring, total);
    const was = startsIn(from, total);
    const out = new Map<SliceRecord<D>, { readonly start: number; readonly span: number }>();
    for (const record of ring) {
      const start = to.get(record)!;
      const turned = record.turn.value;
      const origin = was.get(record);
      let at = start;
      if (origin !== undefined && turned < 1) {
        // The way it has to go now, kept to the side it set off on.
        const raw = origin + record.offset - start;
        at = start + (1 - turned) * (raw - Math.round(raw - record.planned));
      }
      out.set(record, { start: at, span: total > 0 ? valueOf(record) / total : 0 });
    }
    return out;
  }

  /** Every slice as it is now, part way through a transition, in the ring's order, with its label or none. */
  function currentSlices(f: DonutFrame): { readonly record: SliceRecord<D>; readonly slice: DonutSlice<D>; readonly label: SliceLabel | undefined }[] {
    const now = [...angles()].map(([record, { start, span }]) => {
      const { row } = record;
      const state: SliceState<D> = {
        key: row.key,
        datum: row.datum,
        index: row.index,
        category: row.category,
        series: row.series,
        value: valueOf(record),
        share: span,
        start: start * TAU,
        end: (start + span) * TAU
      };
      return { record, state };
    });
    const labels = placeLabels(
      f,
      now.map(({ state }) => state),
      measure
    );
    const slices = placeSlices(
      f,
      now.map(({ state }) => state),
      labels,
      measure
    );
    return now.map(({ record }, i) => ({ record, slice: slices[i]!, label: labels[i] }));
  }

  /** Draws every slice as it is now, its label, and the total counting in the hole. */
  function draw(): void {
    if (!dirty) return;
    dirty = false;
    const f = frame.value;
    setAttributes(svg, sizeAttributes(f));
    const slices = currentSlices(f);
    for (const { record, slice, label } of slices) show(record, slice, label);
    const total = slices.reduce((sum, { slice }) => sum + slice.value, 0);
    drawCenter(placeCenter(f, count === undefined ? laidOut.centerText : counting(round(total, count)), measure));
  }

  /** The centre's text for a total on its way to the layout's, worked out once per total shown. */
  function counting(total: number): string {
    if (counted?.total !== total) counted = { total, text: centerText(current, donutEncoding(current).series, total) };
    return counted.text;
  }

  /** Draws exactly the layout once a transition settles: the frames in between are computed, this is laid out. */
  function land(): void {
    ring = ring.filter(drawn);
    from = ring;
    for (const record of ring) {
      record.turn.set(1);
      record.offset = 0;
      record.planned = 0;
    }
    count = undefined;
    counted = undefined;
    setAttributes(svg, sizeAttributes(laidOut.frame));
    laidOut.slices.forEach((slice, i) => show(records.get(slice.key)!, slice, laidOut.labels[i]));
    drawCenter(laidOut.center);
    dirty = false;
  }

  /** Matches the layout's slices to records by key. New slices start with nothing showing; slices without one start to leave. */
  function arrange(next: DonutLayout<D>): Diff<D> {
    const keys = new Set(next.slices.map((slice) => slice.key));
    const diff: Diff<D> = { entering: [], exiting: [], changed: [] };
    for (const record of order) {
      if (keys.has(record.key)) continue;
      records.delete(record.key);
      leaving.start(record);
      diff.exiting.push(record);
    }
    const previous = order;
    order = next.slices.map((slice) => {
      let record = records.get(slice.key);
      if (record) {
        // Its own value: a share that moved because others changed isn't an update.
        if (record.row.value !== slice.value || record.row.series !== slice.series) diff.changed.push({ record, from: record.shown.geometry });
      } else {
        // A slice that comes back mid-exit keeps its element; the runner cancels its exit.
        record = leaving.recall(slice.key) ?? createRecord(slice, true);
        records.set(slice.key, record);
        diff.entering.push(record);
      }
      record.row = slice;
      record.path.setAttribute("data-series", slice.series);
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

  /** The slice's accessible name, from where it's heading, and its description (`markDescription`, or a tooltip function's text). */
  function labelMark(record: SliceRecord<D>): void {
    record.group.setAttribute("aria-label", names.get(record.key)!);
    tooltip.describe(record.group, record.row);
  }

  /**
   * Sends every animated value toward `next`, and returns the animations started. Presentation stages
   * the change: values first (slices resize, staying joined in the order they're in, and leaving slices
   * shrink to nothing), then the turn (slices turn the shorter way to their places in the new order,
   * the ring resizes, and new slices grow in at their places in the second half). A stage with nothing
   * to do is skipped. Analysis runs it all as one stage, which its scaling keeps short. A jump (motion
   * off, a resize) lands at once.
   */
  function retarget(next: DonutLayout<D>, jump: boolean): Promise<TweenResult>[] {
    dirty = true;
    // Where every slice is now, before the orders change, so nothing jumps.
    const now = angles();
    // New slices, and ones back after fading out completely, grow in at their places.
    const arriving = new Set(order.filter((record) => record.presence.value === 0));
    const staying = order.filter((record) => !arriving.has(record));
    const gone = [...leaving.values()];

    // Still joined in `from` and not turning yet (stopped in the values stage): they go on from there.
    // Otherwise they turn from the ring they're in, each from where it is now.
    const waiting = from.length > 0 && from.every((record) => record.turn.value === 0);
    const before = ring;
    ring = mergeRing(before, order);
    if (!waiting) {
      from = before;
      const total = before.reduce((sum, record) => sum + valueOf(record), 0);
      const joined = startsIn(before, total);
      for (const record of before) record.offset = now.get(record)!.start - joined.get(record)!;
    }
    from = from.filter((record) => !arriving.has(record));

    // The shorter way round, at the targets: where it's heading in the ring against where it turns from.
    const target = (record: SliceRecord<D>): number => (records.get(record.key) === record ? record.row.value : 0);
    const total = ring.reduce((sum, record) => sum + target(record), 0);
    const ends = startsIn(ring, total, target);
    const starts = startsIn(from, total, target);
    let turns = false;
    for (const record of from) {
      const raw = starts.get(record)! + record.offset - ends.get(record)!;
      record.planned = raw - Math.round(raw);
      if (Math.abs(record.planned) > 1e-9) turns = true;
    }

    const values =
      staying.some((record) => busy(record.value, record.row.value, same) || busy(record.presence, 1, same)) ||
      gone.some((record) => busy(record.value, 0, same) || busy(record.presence, 0, same));
    const positions = turns || arriving.size > 0 || busy(frame, next.frame, sameFields);

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
    move(frame, next.frame, sameFields, second);
    for (const record of staying) {
      move(record.value, record.row.value, same, first);
      move(record.presence, 1, same, first);
    }
    for (const record of arriving) {
      move(record.value, record.row.value, same, grow);
      move(record.presence, 1, same, grow);
    }
    for (const record of gone) {
      move(record.value, 0, same, first);
      move(record.presence, 0, same, first);
    }
    if (jump) {
      from = ring;
      for (const record of ring) {
        record.turn.set(1);
        record.offset = 0;
        record.planned = 0;
      }
      return running;
    }
    // Joined where they were until their turn starts.
    const turning = new Set(from);
    for (const record of ring) record.turn.set(turning.has(record) ? 0 : 1);
    if (turns) for (const record of from) move(record.turn, 1, same, second);
    return running;
  }

  /**
   * Moves to `next`, animated or at once, drawing every frame. Resolves when the transition settles.
   * One still in flight is taken over: its waiters wait for this one instead.
   */
  function transitionTo(next: DonutLayout<D>, jump: boolean): Promise<void> {
    laidOut = next;
    return transitions.run(retarget(next, jump));
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  /** Where a slice is heading: what enter and update report as a change starts. */
  const input = (record: SliceRecord<D>): RunInput<D> => ({ mark: record.row.geometry, data: record.row.data });
  /** The slice as it is on screen: what hover, leave and exit report, so mid-change they match what's under the pointer or on its way out. */
  const onScreen = (record: SliceRecord<D>): RunInput<D> => ({ mark: record.shown.geometry, data: record.shown.data });

  /** The slice an event target belongs to (its label too); leaving slices don't count. */
  function liveRecordOf(eventTarget: EventTarget | null): SliceRecord<D> | undefined {
    const element = eventTarget as Element | null;
    const group = typeof element?.closest === "function" ? element.closest(".ec-mark") : null;
    const record = group ? byGroup.get(group) : undefined;
    return record && records.get(record.key) === record ? record : undefined;
  }

  // Pointer, touch and keyboard focus share one hover: see shell/hover.ts. A slice is its own target,
  // so a hover event has no segment.
  const hover = chartHover<D>({
    svg,
    runner,
    events,
    dim: () => current.dim !== false,
    find(eventTarget) {
      const record = liveRecordOf(eventTarget);
      return record && { key: record.key };
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
    // The same slices as now: only the sizes changed.
    const slices = new Map(next.slices.map((slice) => [slice.key, slice]));
    for (const record of order) record.row = slices.get(record.key) ?? record.row;
    void transitionTo(next, true);
  }

  const unwatchWidth = watchWidth(container, clock, measuredWidth, (width) => {
    measuredWidth = width;
    // A fixed `width` ignores the container.
    if (current.width === undefined) relayout();
  });

  // Labels' room is measured; measure again once web fonts arrive.
  const unwatchFonts = watchFonts(doc, () => {
    measure.clear();
    relayout();
  });

  // ── First render ───────────────────────────────────────────────────────────

  describeDonut();
  syncLegend();
  table.render(firstTable);
  setAttributes(svg, sizeAttributes(laidOut.frame));
  order = laidOut.slices.map((slice) => {
    const record = createRecord(slice, false);
    records.set(slice.key, record);
    labelMark(record);
    return record;
  });
  ring = from = order;
  laidOut.slices.forEach((slice, i) => drawMark(order[i]!, slice, laidOut.labels[i]));
  drawCenter(laidOut.center);
  hover.sync();
  runner.enter(order.map(input));

  return linkable(hover.link, {
    element: svg,

    async update(next) {
      if (destroyed) return;
      if (next.motion !== undefined && next.motion !== current.motion) throw new TypeError("donutChart: `motion` can't be changed by update() yet.");
      const merged: DonutChartOptions<D> = { ...current, ...next };
      checkOptions(merged);
      // Throws on an effect it can't resolve, data it can't draw, a table column it can't read, or a
      // `format` that throws, before anything changes.
      const swapped = "on" in next ? nextEffects(effects, current.on, merged.on, env.presets) : effects;
      const nextLayout = layout(merged, swapped);
      const nextTable = tableFor(merged, nextLayout);
      const nextNames = namesFor(merged, nextLayout);
      if ("colors" in next) colors = toColorAssignment(merged.colors);
      const previous = current;
      const totalBefore = laidOut.total;
      current = merged;
      laidOut = nextLayout;
      names = nextNames;
      describeDonut();
      syncLegend();
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
      // effects start where the old ones were, on the slices staying, as this update leaves them; a
      // held hover replays with them once the change settles.
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
      count = nextLayout.total === totalBefore ? undefined : Math.max(decimals(totalBefore), decimals(nextLayout.total));
      const settled = transitionTo(nextLayout, motion.mode === "off");
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

    // Outside the ring, the category over the share; the centre's text isn't a slice's.
    labels: () =>
      order.flatMap((record) => [
        ...chartLabel(record.key, "category", record.drawnLabel?.category, record.label),
        ...chartLabel(record.key, "value", record.drawnLabel?.share, record.share)
      ]),

    // For a chart switch: a slice takes its own key's colour.
    paintOf: (key: string): ChartSwitchPaint | undefined => (records.has(key) ? { color: key, drawn: true } : undefined),

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
        for (const value of [record.value, record.turn, record.presence]) value.stop();
        record.leave?.resolve();
      }
      frame.stop();
      events.clear();
      records.clear();
      leaving.clear();
      order = ring = from = [];
      svg.remove();
    }
  });
}

function checkOptions<D>(options: DonutChartOptions<D>): void {
  checkChartOptions(options, "donutChart");
  const { center, sort } = options;
  if (center !== undefined && center !== false && typeof center !== "function") throw new TypeError("donutChart: center must be false or a function that returns the text for the total.");
  if (sort !== undefined && sort !== "none" && sort !== "value") throw new TypeError(`donutChart: sort must be "value" or "none", got ${String(sort)}.`);
}

/** The value in `format` with its series' label: "112 shots". A lone value read by a function goes unnamed unless it's labelled: "112". */
function valueText<D>(slice: DonutSlice<D>, options: DonutChartOptions<D>): string {
  const formatted = format(options)(slice.value);
  const label = seriesLabel(options.seriesLabels, slice.series);
  return slice.series === "value" && label === "value" ? formatted : `${formatted} ${label}`;
}

/**
 * Every slice's name in `layout`, by key. Worked out before anything changes, since `format` may
 * first run here: with no table and no centre text, nothing else calls it.
 */
function namesFor<D>(options: DonutChartOptions<D>, layout: DonutLayout<D>): ReadonlyMap<string, string> {
  return new Map(layout.slices.map((slice) => [slice.key, markLabel(slice, options)]));
}

/**
 * "Saved: 112 shots, 28%", the value said with its series' label, or the page's wording from
 * `markLabel`. An empty name, or a throw (reported), keeps the default, so a focusable slice is never
 * left unnamed.
 */
function markLabel<D>(slice: DonutSlice<D>, options: DonutChartOptions<D>): string {
  const text = `${slice.category}: ${valueText(slice, options)}, ${percent(slice.share)}`;
  if (!options.markLabel) return text;
  try {
    const value = { series: slice.series, label: seriesLabel(options.seriesLabels, slice.series), value: slice.value };
    const named: unknown = options.markLabel(slice.datum, {
      key: slice.key,
      category: slice.category,
      values: [value],
      total: slice.value,
      share: slice.share,
      format: format(options),
      text
    });
    if (named !== undefined && named !== null && String(named).trim() !== "") return String(named);
  } catch (error) {
    report(error);
  }
  return text;
}

/**
 * The text in the hole for a total: `center`'s, or by default the total in `format` over the value's
 * series label ("406" over "shots"; the total alone for an unlabelled value read by a function). ""
 * for none, with `center: false`, and when the function throws (reported).
 */
function centerText<D>(options: DonutChartOptions<D>, series: string, total: number): string {
  const { center } = options;
  const formatted = format(options);
  if (center === false) return "";
  if (center === undefined) {
    const label = seriesLabel(options.seriesLabels, series);
    return series === "value" && label === "value" ? formatted(total) : `${formatted(total)}\n${label}`;
  }
  try {
    const text: unknown = center(total, formatted);
    return text === undefined || text === null ? "" : String(text);
  } catch (error) {
    report(error);
    return "";
  }
}

/** The chart's own description, then the centre's text on one line. */
function description(own: string | undefined, center: string): string | undefined {
  const text = center.split("\n").join(" ").trim();
  const mine = own?.trim();
  if (text === "") return own;
  if (!mine) return text;
  return /[.!?:;]$/.test(mine) ? `${mine} ${text}` : `${mine}. ${text}`;
}

/**
 * The ring's order: the layout's, with slices on their way out kept where they were, just after the
 * slice they followed, or first. So a leaving slice shrinks in place.
 */
function mergeRing<R>(shown: readonly R[], next: readonly R[]): R[] {
  const out = [...next];
  shown.forEach((record, i) => {
    if (out.includes(record)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const found = out.indexOf(shown[j]!);
      if (found >= 0) {
        at = found + 1;
        break;
      }
    }
    out.splice(at, 0, record);
  });
  return out;
}
