// lineChart: the reference line chart. A line per series through one row per x (described with
// describe.line), with a dot at its end and a label in the right margin, and a point per row and series
// (describe.point), shown where its x is hovered or focused; a measured layout with gridlines and ticks
// in theme colours; a crosshair that hovers every series at the nearest x, from the pointer, touch or
// keyboard, with a tooltip; a legend, a data table and, with `announce`, a live region for screen
// readers. A missing value (null or undefined) is a gap in its line, with no point; the x is still a
// stop. reveal(x) shows the data up to x, as playback drives it. update() animates the change:
// staged in presentation (values, then positions), in one short stage in analysis, at once when
// motion is off. x is numbers or Dates: a time axis has its own ticks and wording (time.ts), and is
// otherwise drawn in ms like any number. With `curve: "monotone"` the lines bend between their rows
// (curve.ts), and a change of curve eases them from straight to curved or back.
//
// The chart never names an effect: it resolves `on` through the presets it's handed and plays them
// through the runner, which draws on the SVG surface. What doesn't depend on lines (events, hover and
// focus, transitions and leaving marks, DOM order, size and fonts) is in shell/. Each x is a hover
// target standing for every series' point there; the lines themselves are never hovered. With
// `hover: "point"`, each point is a target instead: the pointer hovers the nearest (of points drawn
// on each other, the one whose line passes nearest), the others dim, and the keys go along its line
// and between lines.

import type { AnimateOptions, Animated, MarkData, MarkGeometry, Point, Sample, TweenResult } from "../core";
import { animated, defaultClock, interpolateNumber, interpolateRecord, matrix } from "../core";
import { invert } from "../core/geometry";
import { describePoint } from "../core/geometry/describe/point";
import { resolveEffects } from "../core/registry";
import { report } from "../core/report";
import { createRunner, type RunInput } from "../core/runner";
import { chartAnnouncer, changeText, type Announcer } from "./announce";
import { toColorAssignment } from "./colors";
import { bendOf } from "./curve";
import { chartLegend } from "./legend";
import {
  checkRoom,
  DOT_RADIUS,
  LINE_WIDTH,
  layoutLines,
  lineEncoding,
  loneValues,
  placeColumns,
  placeCrosshair,
  placeLines,
  placePoints,
  placeXTick,
  placeYTick,
  pointKey,
  positions,
  type EndLabels,
  type LineFrame,
  type LineLayout,
  type LineRow,
  type LineValue,
  type PlacedLine,
  type PlacedPoint,
  type RowState
} from "./line-layout";
import { linkable } from "./link";
import { chartMotion } from "./motion";
import { svgMarkHandle, type StyledPart, type SvgMarkHandle } from "./render/mark-style";
import { svgSurface } from "./render/surface";
import { setAttributes, setStyles, sizeAttributes, svgElement, transformAttribute } from "./render/svg";
import { placeText, textMeasure, type TextPlacement } from "./render/text";
import { injectStyles, markColorStyles, seriesColors, type SeriesColors } from "./render/theme";
import { seriesLabel } from "./series";
import { chartEvents } from "./shell/events";
import { decimals, format, round } from "./shell/format";
import { chartHover, type ChartHover } from "./shell/hover";
import { chartLabel } from "./shell/labels";
import { leavingMarks, type Leave } from "./shell/leaving";
import { orderElements } from "./shell/order";
import { checkChartOptions, checkNeeds, containerWidth, describeChart, nextEffects, resolveTarget, type ChartEnv } from "./shell/setup";
import { busy, chartTransitions, geometryChanged, playUpdate, same, sameFields, type ChartDiff } from "./shell/transitions";
import { watchFonts, watchHoverDuration, watchText, watchWidth } from "./shell/watch";
import type { ChartSwitchPaint } from "./switch";
import { chartTable, MISSING, tableModel, type TableModel } from "./table";
import { monthsOn } from "./time";
import { chartTooltip, summaryContent, type TooltipContent, type TooltipRow } from "./tooltip";
import type { LineChart, LineChartOptions, MarkSummary } from "./types";

export type { LineChart } from "./types";

/** Values by series, in data units. */
type Values = Readonly<Record<string, number>>;

/** A mark as it's laid out or drawn: its geometry, and the data effects get with it. */
interface Placed<D> {
  readonly geometry: MarkGeometry;
  readonly data: MarkData<D>;
}

/** One x: a focus stop with its hit column, and a point per series. A row isn't a mark itself. */
interface RowRecord<D> {
  readonly key: string;
  /** Where the row is heading, or rests: its row in the latest layout (its last one while it folds away). */
  row: LineRow<D>;
  /** In data units, so every frame reads true against the axes. */
  readonly x: Animated<number>;
  readonly values: Animated<Values>;
  /** 0 to 1: how far it has grown out of its anchor, or is left before it has folded into it. */
  readonly presence: Animated<number>;
  /** The row it grows out of or folds into: the nearest row that stays, before it or else after it. */
  anchor: RowRecord<D> | undefined;
  /** The focus stop: an image named for the x, holding the hit column. */
  readonly column: SVGGElement;
  readonly hit: SVGRectElement;
  /** Its points, live or leaving, live ones in series order first. */
  points: PointRecord<D>[];
  /** Set while it folds away. */
  leaving: boolean;
  /** Whether its column is shown: live and revealed. */
  shown: boolean;
  /** Where its x is drawn now, px: the crosshair's place when it has no point. */
  px: number;
}

interface MarkBase<D> {
  readonly key: string;
  readonly series: string;
  readonly group: SVGGElement;
  /** Holds the stroke or the dot; effects' transform and opacity go here. */
  readonly body: SVGGElement;
  readonly path: SVGPathElement;
  parts: StyledPart[];
  readonly handle: SvgMarkHandle;
  /** Where it's heading, as laid out at the reveal: what enter and update report as a change starts. */
  target: Placed<D>;
  /** What's on screen now. */
  shown: Placed<D>;
  /** Set while it leaves. */
  leave: Leave | undefined;
}

interface LineRecord<D> extends MarkBase<D> {
  readonly kind: "line";
  /** The dot at its revealed end. */
  readonly end: SVGCircleElement;
  readonly label: SVGTextElement;
  /** Where the end label is drawn now; undefined while it shows none. */
  drawnLabel: TextPlacement | undefined;
  /** 0 to 1: a series entering or leaving fades its line in or out. */
  readonly presence: Animated<number>;
}

interface PointRecord<D> extends MarkBase<D> {
  readonly kind: "point";
  row: RowRecord<D>;
  /**
   * Past the reveal: hidden, overlays and all. Undefined until it's first drawn, so a new point sets
   * its overlays' visibility whatever a gone point with its key left there.
   */
  hidden: boolean | undefined;
}

type MarkRecord<D> = LineRecord<D> | PointRecord<D>;

interface TickRecord {
  readonly value: number;
  /** A value's gridline; x ticks have none. */
  readonly line: SVGLineElement | undefined;
  readonly label: SVGTextElement;
  /** An x tick's text in its latest layout: a time's depends on the step. A value's is worded by `format` as it's drawn. */
  text: string;
  /** Ticks a scale gains fade in, and ones it loses fade out. */
  readonly opacity: Animated<number>;
  /** In the latest layout. */
  wanted: boolean;
}

/** With `hover: "point"`, a point's focus stop: an image named for its x and value, round the point. */
interface StopRecord {
  readonly element: SVGGElement;
  /** A circle round the point, the size of its focus ring: the stop's bounds. */
  readonly bounds: SVGCircleElement;
  /** Where the point was drawn when the stop was last painted. */
  x: number;
  y: number;
  hidden: boolean | undefined;
}

/** What the pointer, touch and the keys hover: an x, standing for every series' point there, or a point alone. */
type HoverKind = "x" | "point";

/** What an update changed, by mark. */
type Diff<D> = ChartDiff<MarkRecord<D>>;

/** What an update changed, by x: what the announcement says. */
interface RowChanges<D> {
  readonly changed: RowRecord<D>[];
  readonly added: RowRecord<D>[];
  readonly removed: RowRecord<D>[];
}

/** Base ms for each stage of a data change: values, then positions. Unstaged, a change takes as long as its stages together, which analysis scales down. */
const STAGE = 500;
/** The focus ring's px: a gap in the surface colour around the point, then the ring. */
const RING_GAP = 2;
const RING = 2;
/** The ring in the surface colour round a point's dot and a line's end dot (render/theme.ts). */
const DOT_RING = 2;
/** A walk shorter than this draws nothing, as effects treat it. */
const VISIBLE = 0.5;

export function lineChart<D>(target: string | Element, options: LineChartOptions<D>, env: ChartEnv): LineChart<D> {
  const container = resolveTarget(target, "lineChart");
  checkChartOptions(options, "lineChart");
  let hoverKind = hoverOf(options);
  missingOf(options);
  let current = options;
  const motion = chartMotion(options.motion, env.motion);
  let effects = resolveEffects(options.on, env.presets);
  let colors = toColorAssignment(options.colors);
  const clock = env.clock ?? defaultClock;
  const doc = container.ownerDocument;
  injectStyles(doc);

  // A named group of x's (or, with `hover: "point"`, of points' stops), each an image with its own
  // name; the lines and points are aria-hidden: see "ARIA structure" in docs/architecture.md.
  const svg = svgElement("svg", { class: "ec-chart ec-line-chart", role: "group" }, container);
  const grid = svgElement("g", { class: "ec-grid", "aria-hidden": "true" }, svg);
  const axis = svgElement("g", { class: "ec-axis", "aria-hidden": "true" }, svg);
  const crosshair = svgElement("line", { class: "ec-crosshair", "aria-hidden": "true", visibility: "hidden" }, svg);
  // Behind the marks, so it can't cover them; the gap keeps it apart from a point in the same colour.
  const ring = svgElement("g", { class: "ec-focus", "aria-hidden": "true", visibility: "hidden" }, svg);
  // Runs draw above the lines, their end dots and labels, and below the points, so a decoration never
  // covers a point being read. The points are marks of their own, so `.ec-morphing` hides them too.
  const linesLayer = svgElement("g", { class: "ec-lines" }, svgElement("g", { class: "ec-marks", "aria-hidden": "true" }, svg));
  const overlay = svgElement("g", { class: "ec-overlay", "aria-hidden": "true" }, svg);
  const pointsLayer = svgElement("g", { class: "ec-points" }, svgElement("g", { class: "ec-marks", "aria-hidden": "true" }, svg));
  // Above the marks: the pointer's targets and the focus stops.
  const columnsLayer = svgElement("g", { class: "ec-columns" }, svg);
  const measure = textMeasure(svg);

  /** Live rows, in ascending x. */
  let rowOrder: RowRecord<D>[] = [];
  const rows = new Map<string, RowRecord<D>>();
  /** Rows folding away: drawn until the change lands. */
  const leavingRows = new Map<string, RowRecord<D>>();
  const byColumn = new WeakMap<Element, RowRecord<D>>();
  /** Live lines, in series order. */
  let lineOrder: LineRecord<D>[] = [];
  const lines = new Map<string, LineRecord<D>>();
  const points = new Map<string, PointRecord<D>>();
  /** Lines and points on their way out: fading, or waiting for their exit effects. */
  const leaving = leavingMarks<MarkRecord<D>>((record) =>
    record.kind === "line" ? record.presence.animating : record.row.presence.animating || record.row.values.animating || record.row.x.animating
  );
  const events = chartEvents<D>("lineChart");
  let measuredWidth = containerWidth(container);
  let destroyed = false;
  /** The x the page last revealed to, unclamped: Infinity shows every row, rows added later too. */
  let through = Infinity;
  /** Labels whose function threw, reported once: they're worded on every frame. */
  const labelFailures = new WeakSet<object>();

  let laidOut: LineLayout<D>;
  let firstTable: TableModel | undefined;
  /** With `hover: "x"`, each x's accessible name, by row key, for the latest layout. With "point" the x's are hidden, and unnamed. */
  let names: ReadonlyMap<string, string> | undefined;
  /** With `hover: "point"`, each point's, by its key. */
  let pointNames: ReadonlyMap<string, string> | undefined;
  try {
    // Throws on data it can't draw, a table column it can't read, or a `format` that throws. Nothing
    // but the <svg> is in place yet (no listeners, observers or elements beside it), so that's all to undo.
    laidOut = layout(current);
    firstTable = tableFor(current, laidOut);
    names = hoverKind === "x" ? namesFor(current, laidOut) : undefined;
    pointNames = hoverKind === "point" ? pointNamesFor(current, laidOut) : undefined;
  } catch (error) {
    svg.remove();
    throw error;
  }

  const findMark = (key: string): MarkRecord<D> | undefined => points.get(key) ?? lines.get(key) ?? leaving.get(key);
  const surface = svgSurface({
    overlay,
    measure,
    // Looked up on each call, so the handle follows the mark's record.
    mark: (key) => ({
      set: (style) => {
        findMark(key)?.handle.set(style);
        hover.restyled(key);
      },
      reset: () => {
        findMark(key)?.handle.reset();
        hover.restyled(key);
      }
    }),
    colors: (key) => findMark(key)?.parts[0]?.colors
  });
  const runner = createRunner<D>({ effects, motion, icons: env.icons, clock, surface });
  const tooltip = chartTooltip<D>(svg, { motion, option: () => current.tooltip, description: () => current.markDescription });
  const legend = chartLegend(svg);
  const table = chartTable(svg);
  let announcer: Announcer | undefined = current.announce ? chartAnnouncer(svg) : undefined;

  // ── Animated state ─────────────────────────────────────────────────────────
  // Each row has its x, its values and its presence, and the chart has the scale, the box and how far
  // its lines are curved, so a new update() mid-flight retargets each from where it is and nothing
  // jumps. Where a line is comes from them: through every row as it is now, up to the reveal.

  /** Something moved since the last frame was drawn. A line depends on every row, so a frame draws everything. */
  let dirty = false;
  const changed = (): void => {
    dirty = true;
  };
  const scale = animated(laidOut.frame.scale, interpolateRecord, { clock, motion, onChange: changed });
  const box = animated(laidOut.frame.box, interpolateRecord, { clock, motion, onChange: changed });
  /** How far the lines are curved: 0 straight, 1 the monotone curve. */
  const curved = animated(bendOf(laidOut.curve), interpolateNumber, { clock, motion, onChange: changed });
  const yTicks = new Map<number, TickRecord>();
  const xTicks = new Map<number, TickRecord>();
  /** Per series, the decimals an end label counts in: the values' own, or both sides' while a change plays. */
  let counting: Readonly<Record<string, number>> = laidOut.decimals;
  /** What the latest update changed, by x, for its announcement. */
  let rowChanges: RowChanges<D> = { changed: [], added: [], removed: [] };
  /** The frame last drawn, for the crosshair. */
  let drawnFrame: LineFrame = laidOut.frame;

  const transitions = chartTransitions({ clock, runner, leaving, draw, land });

  // ── Layout ─────────────────────────────────────────────────────────────────

  function layout(opts: LineChartOptions<D>, using = effects): LineLayout<D> {
    const encoding = lineEncoding(opts);
    const series = encoding.series.map((s) => s.series);
    checkNeeds(using, series, "lineChart");
    const { room } = opts;
    checkRoom(room);
    const next = layoutLines({ data: opts.data, encoding, width: opts.width ?? measuredWidth, height: opts.height, format: format(opts), measure, label: labeler(opts, true), room });
    // A series named "a@b" and a key "c" make the same point key as "a" and "b@c".
    const keys = new Set(next.series);
    for (const row of next.rows) {
      for (const name of next.series) {
        const key = pointKey(name, row.key);
        if (keys.has(key)) throw new RangeError(`lineChart: two marks would have the key "${key}". Series and keys joined with "@" must be unique.`);
        keys.add(key);
      }
    }
    // focus(key) takes an x's key or a point's: a row keyed "goals@2" beside a row "2" would make the point ambiguous.
    for (const row of next.rows) {
      if (keys.has(row.key)) throw new RangeError(`lineChart: the key "${row.key}" would name both an x and a line or point. A row's key can't be a series, or a series and a key joined with "@".`);
    }
    return next;
  }

  /**
   * A line's end label for a value: `labels`' text, or by default the value in `format` with its
   * series' label ("52 goals"). Undefined with `labels: false`. A function that throws keeps the
   * default, and is reported once, unless `quiet` (the layout measuring).
   */
  function labeler(opts: LineChartOptions<D>, quiet = false): ((series: string, value: number) => string) | undefined {
    const { labels } = opts;
    if (labels === false) return undefined;
    const formatted = format(opts);
    return (series, value) => {
      const text = `${formatted(value)} ${seriesLabel(opts.seriesLabels, series)}`;
      if (typeof labels !== "function") return text;
      try {
        const own: unknown = labels(value, series, formatted);
        return own === undefined || own === null ? "" : String(own);
      } catch (error) {
        if (!quiet && !labelFailures.has(labels)) {
          labelFailures.add(labels);
          report(error);
        }
        return text;
      }
    };
  }

  /**
   * The end labels' wording for placeLines, each value rounded to its series' decimals in `given`:
   * `counting` while a change plays, or a layout's own at rest, which `counting` becomes when it
   * lands. So a line revealed part way between rows says the same at rest as in the frame before.
   * Undefined with `labels: false`.
   */
  function endLabels(given: Readonly<Record<string, number>>): EndLabels | undefined {
    const label = labeler(current);
    if (!label) return undefined;
    return { text: (series, value) => label(series, round(value, given[series] ?? decimals(value))), measure };
  }

  /** Each line and point as laid out in `next`, at the reveal, the lines with their end labels. */
  function placedFor(next: LineLayout<D>): { readonly lines: Map<string, PlacedLine<D>>; readonly points: Map<string, PlacedPoint<D>> } {
    const states = next.rows.map(restState);
    return {
      lines: new Map(placeLines(next.frame, states, next.series, drawnThrough(next), next.time, endLabels(next.decimals), bendOf(next.curve)).map((line) => [line.series, line])),
      points: new Map(states.flatMap((state) => placePoints(next.frame, state, next.series, next.time)).map((point) => [point.key, point]))
    };
  }

  /** The reveal in `next`: clamped to its rows' range. */
  function revealedIn(next: LineLayout<D>): number {
    const first = next.rows[0];
    const last = next.rows[next.rows.length - 1];
    return first && last ? Math.min(Math.max(through, first.x), last.x) : through;
  }

  /**
   * Where lines end: at the reveal, or with every row drawn when it's at the end of `next`'s rows,
   * so rows that fold away past the new last one stay drawn while they fold.
   */
  function drawnThrough(next: LineLayout<D>): number {
    const last = next.rows[next.rows.length - 1];
    return last && through < last.x ? revealedIn(next) : Infinity;
  }

  /** Live, and at or before the reveal. */
  const revealed = (record: RowRecord<D>): boolean => !record.leaving && record.row.x <= revealedIn(laidOut);

  // ── Records ────────────────────────────────────────────────────────────────

  /** A new row: at its place or, when it enters, waiting to grow out of its anchor. */
  function createRow(row: LineRow<D>, entering: boolean): RowRecord<D> {
    const column = svgElement("g", { class: "ec-column", "data-key": row.key, role: "img" }, columnsLayer);
    const env = { clock, motion, onChange: changed };
    const record: RowRecord<D> = {
      key: row.key,
      row,
      column,
      hit: svgElement("rect", { class: "ec-hit" }, column),
      x: animated(row.x, interpolateNumber, env),
      values: animated(row.levels, interpolateRecord, env),
      presence: animated(entering ? 0 : 1, interpolateNumber, env),
      anchor: undefined,
      points: [],
      leaving: false,
      shown: true,
      px: 0
    };
    byColumn.set(column, record);
    return record;
  }

  function createLine(series: string, placed: PlacedLine<D>, entering: boolean): LineRecord<D> {
    const group = svgElement("g", { class: "ec-line", "data-key": series, "data-series": series }, linesLayer);
    const body = svgElement("g", { class: "ec-body" }, group);
    const record: LineRecord<D> = {
      kind: "line",
      key: series,
      series,
      group,
      body,
      path: svgElement("path", { class: "ec-stroke", "stroke-width": LINE_WIDTH }, body),
      end: svgElement("circle", { class: "ec-end", r: DOT_RADIUS }, body),
      label: svgElement("text", { class: "ec-value ec-end-label" }, group),
      drawnLabel: undefined,
      parts: [],
      handle: svgMarkHandle(() => record),
      target: placed,
      shown: placed,
      presence: animated(entering ? 0 : 1, interpolateNumber, { clock, motion, onChange: changed }),
      leave: undefined
    };
    return record;
  }

  function createPoint(row: RowRecord<D>, placed: PlacedPoint<D>): PointRecord<D> {
    const group = svgElement("g", { class: "ec-point", "data-key": placed.key, "data-series": placed.series }, pointsLayer);
    const body = svgElement("g", { class: "ec-body" }, group);
    const record: PointRecord<D> = {
      kind: "point",
      key: placed.key,
      series: placed.series,
      row,
      group,
      body,
      path: svgElement("path", { class: "ec-dot" }, body),
      parts: [],
      handle: svgMarkHandle(() => record),
      target: placed,
      shown: placed,
      hidden: undefined,
      leave: undefined
    };
    return record;
  }

  /** On screen: live, or leaving and not yet gone. */
  const drawn = (record: MarkRecord<D>): boolean => findMark(record.key) === record;
  /** The row's live points, in series order. */
  const livePoints = (record: RowRecord<D>): PointRecord<D>[] => record.points.filter((point) => points.get(point.key) === point);
  const leavingLines = (): LineRecord<D>[] => [...leaving.values()].filter((record): record is LineRecord<D> => record.kind === "line");

  // ── Drawing ────────────────────────────────────────────────────────────────

  const currentFrame = (): LineFrame => ({ scale: scale.value, box: box.value });

  /**
   * Every row drawn, as it is now, in ascending x: a row growing in or folding away is part way
   * between its anchor and its own place. A row that has folded away, or leaves with nothing to fold
   * into, isn't drawn.
   */
  function currentRows(): { readonly record: RowRecord<D>; readonly state: RowState<D> }[] {
    const own = (record: RowRecord<D>): { x: number; values: Values } => ({ x: record.x.value, values: record.values.value });
    const states = new Map<RowRecord<D>, { x: number; values: Values }>();
    const visiting = new Set<RowRecord<D>>();
    const stateOf = (record: RowRecord<D>): { x: number; values: Values } => {
      const known = states.get(record);
      if (known) return known;
      const p = record.presence.value;
      let state = own(record);
      // An anchor chain can loop back (a row folding into one that grew out of it): the loop's start is drawn at its own place.
      if (record.anchor && p < 1 && !visiting.has(record)) {
        visiting.add(record);
        const from = stateOf(record.anchor);
        visiting.delete(record);
        state = { x: from.x + p * (state.x - from.x), values: interpolateRecord(from.values, state.values)(p) };
      }
      states.set(record, state);
      return state;
    };
    const drawnRows = [...rowOrder, ...[...leavingRows.values()].filter((record) => record.presence.value > 0 && record.anchor)];
    // A gap opens or closes as the change starts: the rows' missing values are where they're heading.
    return drawnRows
      .map((record) => {
        const { x, values } = stateOf(record);
        const presence = record.anchor && record.presence.value < 1 ? { presence: record.presence.value } : {};
        return { record, state: { key: record.key, datum: record.row.datum, x, values, missing: record.row.missing, ...presence } };
      })
      .sort((a, b) => a.state.x - b.state.x);
  }

  /** Draws a frame of the change in flight. */
  function draw(): void {
    if (!dirty) return;
    dirty = false;
    const frame = currentFrame();
    const states = currentRows();
    paintFrame(frame);
    paintLines(frame, states.map((s) => s.state));
    for (const { record, state } of states) {
      const placed = new Map(placePoints(frame, state, record.points.map((point) => point.series), laidOut.time).map((point) => [point.key, point]));
      // A point whose value went missing stays where it was while it leaves.
      showAll(record.points.filter(drawn).flatMap((point) => (placed.has(point.key) ? [{ record: point, placed: placed.get(point.key)! }] : [])));
    }
    paintAlone(states.map((s) => s.state));
    paintColumns(frame, states);
    followHover();
  }

  /** Draws a new reveal: the lines and their labels end at it, and the x's past it are hidden. Nothing else moves. */
  function drawReveal(): void {
    const frame = currentFrame();
    const states = currentRows();
    paintLines(frame, states.map((s) => s.state));
    paintColumns(frame, states);
    followHover();
  }

  /** Draws exactly the layout once a change settles: the frames in between are computed, this is laid out. */
  function land(): void {
    for (const record of leavingRows.values()) {
      for (const value of [record.x, record.values, record.presence]) value.stop();
      record.column.remove();
    }
    leavingRows.clear();
    for (const record of rowOrder) {
      record.anchor = undefined;
      record.points = record.points.filter(drawn);
    }
    for (const [ticks, placedTicks] of [
      [yTicks, laidOut.yTicks],
      [xTicks, laidOut.xTicks]
    ] as const) {
      for (const tick of [...ticks.values()]) {
        if (tick.wanted) continue;
        tick.line?.remove();
        tick.label.remove();
        ticks.delete(tick.value);
      }
      for (const placed of placedTicks) {
        const tick = ticks.get(placed.value);
        if (!tick) continue;
        if (tick.line && "line" in placed) setAttributes(tick.line, { ...placed.line, opacity: undefined });
        placeText(tick.label, placed.label);
        tick.label.removeAttribute("opacity");
      }
    }
    counting = laidOut.decimals;
    const { frame } = laidOut;
    setAttributes(svg, sizeAttributes(frame.box));
    drawnFrame = frame;
    // As laid out, keeping the objects enter and update reported while they're the same. Marks whose
    // data link to each other through `related` (the lines; a row's points) are kept or replaced together.
    const placed = placedFor(laidOut);
    const settle = <R extends MarkRecord<D>>(records: readonly R[], next: (record: R) => Placed<D> | undefined): void => {
      const pairs = records.flatMap((record) => {
        const to = next(record);
        return to ? [{ record, to }] : [];
      });
      const kept = pairs.every(({ record, to }) => sameGeometry(record.target.geometry, to.geometry) && sameData(record.target.data, to.data));
      if (!kept) for (const { record, to } of pairs) record.target = to;
      showAll(pairs.map(({ record }) => ({ record, placed: record.target })));
    };
    settle(lineOrder, (line) => placed.lines.get(line.series));
    paintLabels(new Map(lineOrder.flatMap((line) => (placed.lines.has(line.series) ? [[line, placed.lines.get(line.series)!] as const] : []))));
    const states = rowOrder.map((record) => ({ record, state: restState(record.row) }));
    for (const { record } of states) settle(livePoints(record), (point) => placed.points.get(point.key));
    paintAlone(states.map((s) => s.state));
    paintColumns(frame, states);
    followHover();
    dirty = false;
  }

  /** The <svg>'s size and the ticks, as the frame has them. */
  function paintFrame(frame: LineFrame): void {
    drawnFrame = frame;
    setAttributes(svg, sizeAttributes(frame.box));
    const formatted = format(current);
    for (const tick of yTicks.values()) {
      const placed = placeYTick(frame, tick.value, formatted(tick.value));
      const opacity = tick.opacity.value < 1 ? tick.opacity.value : undefined;
      setAttributes(tick.line!, { ...placed.line, opacity });
      placeText(tick.label, placed.label);
      setAttributes(tick.label, { opacity });
    }
    for (const tick of xTicks.values()) {
      placeText(tick.label, placeXTick(frame, tick.value, tick.text).label);
      setAttributes(tick.label, { opacity: tick.opacity.value < 1 ? tick.opacity.value : undefined });
    }
  }

  /** Draws the lines (live and leaving) through the rows as they are, up to the reveal, and their end labels. */
  function paintLines(frame: LineFrame, states: readonly RowState<D>[]): void {
    const drawnLines = [...lineOrder, ...leavingLines()];
    if (states.length === 0 || drawnLines.length === 0) return;
    const placed = placeLines(frame, states, drawnLines.map((line) => line.series), drawnThrough(laidOut), laidOut.time, endLabels(counting), curved.value);
    showAll(drawnLines.map((line, i) => ({ record: line, placed: placed[i]! })));
    paintLabels(new Map(drawnLines.map((line, i) => [line, placed[i]!])));
  }

  /** Each line's end label as placeLines placed it, counting between values, kept 16 px apart; or none with `labels: false`. */
  function paintLabels(ends: ReadonlyMap<LineRecord<D>, PlacedLine<D>>): void {
    for (const [line, { label: text }] of ends) {
      if (text) placeText(line.label, text);
      line.drawnLabel = text && text.text !== "" ? text : undefined;
      setAttributes(line.label, { visibility: line.drawnLabel ? undefined : "hidden" });
    }
  }

  /**
   * Draws each mark as placed. Their data link to each other through `related` (the lines; a row's
   * points), so when any one's data changed, every one's runs hear about it with the new data: a
   * threshold on the goals line follows a change to xG alone.
   */
  function showAll(marks: readonly { readonly record: MarkRecord<D>; readonly placed: Placed<D> }[]): void {
    const related = marks.some(({ record, placed }) => !sameData(record.shown.data, placed.data));
    for (const { record, placed } of marks) {
      if (record.kind === "line") showLine(record, placed, related);
      else showPoint(record, placed, related);
    }
  }

  /** Draws the line as `placed`, with its end dot. Its runs hear about it when it moved or `related` data changed, so decorations follow. */
  function showLine(record: LineRecord<D>, placed: Placed<D>, related: boolean): void {
    const moved = related || geometryChanged(record.shown.geometry, placed.geometry);
    record.shown = placed;
    const { geometry } = placed;
    paint(record, seriesColors(colors.slot(record.series)), { visible: geometry.length >= VISIBLE, open: { width: geometry.thickness } });
    // A line with no value up to the reveal is empty: no end dot.
    setAttributes(record.end, { cx: geometry.end.x, cy: geometry.end.y, visibility: placed.data.samples.length === 0 ? "hidden" : undefined });
    const presence = record.presence.value;
    setAttributes(record.group, { opacity: presence < 1 ? presence : undefined });
    if (moved) runner.change(geometry, placed.data);
  }

  /** Draws the point as `placed`. Its runs hear about it when it moved or `related` data changed. */
  function showPoint(record: PointRecord<D>, placed: Placed<D>, related: boolean): void {
    const moved = related || geometryChanged(record.shown.geometry, placed.geometry);
    record.shown = placed;
    paint(record, seriesColors(colors.slot(record.series)), { visible: true });
    if (moved) runner.change(placed.geometry, placed.data);
  }

  /** Writes the mark's outline and colours, and applies its style again, when either changed. */
  function paint(record: MarkRecord<D>, markColors: SeriesColors, part: Pick<StyledPart, "visible" | "open">): void {
    const before = record.parts[0];
    const { d } = record.shown.geometry.outline;
    const recolored = before?.colors.color !== markColors.color;
    if (!recolored && before?.d === d && before.visible === part.visible && before.open?.width === part.open?.width) return;
    if (record.path.getAttribute("d") !== d) record.path.setAttribute("d", d);
    if (recolored) setStyles(record.group, markColorStyles(markColors));
    record.parts = [{ element: record.path, d, colors: markColors, ...part }];
    record.handle.repaint();
    // A new palette: overlays already drawn in "mark" follow.
    if (before && recolored) surface.recolor(record.key);
  }

  /** Whether a point showed at rest in the frame before: a chart with no gaps skips the points. */
  let anyAlone = false;

  /** A value with a gap on either side and no other value beside it has no stroke, so its point shows at rest. */
  function paintAlone(states: readonly RowState<D>[]): void {
    const lone = loneValues(states, laidOut.series);
    if (lone.size === 0 && !anyAlone) return;
    for (const point of points.values()) point.group.classList.toggle("ec-alone", lone.has(point.key));
    anyAlone = lone.size > 0;
  }

  /**
   * Each revealed x's hit column, halfway to its neighbours, at the rows as they are; and the points
   * past the reveal hidden, their overlays too. A column that isn't live or revealed is hidden, so it
   * can't be hovered or focused. With `hover: "point"`, the points' stops and the plot's hit area too.
   */
  function paintColumns(frame: LineFrame, states: readonly { readonly record: RowRecord<D>; readonly state: RowState<D> }[]): void {
    const { x } = positions(frame);
    const shown = states.filter(({ record }) => revealed(record));
    const columns = placeColumns(frame, shown.map(({ state }) => x(state.x)));
    shown.forEach(({ record, state }, i) => {
      setAttributes(record.hit, { ...columns[i]! });
      record.px = x(state.x);
    });
    const visible = new Set(shown.map(({ record }) => record));
    for (const record of [...rowOrder, ...leavingRows.values()]) {
      const show = visible.has(record);
      if (record.shown !== show) {
        record.shown = show;
        setAttributes(record.column, { visibility: show ? undefined : "hidden", "aria-hidden": record.leaving ? "true" : undefined });
      }
      const hidden = !revealed(record);
      for (const point of record.points) {
        if (point.hidden === hidden) continue;
        point.hidden = hidden;
        setAttributes(point.group, { visibility: hidden ? "hidden" : undefined });
        surface.hide(point.key, hidden);
      }
    }
    if (stopsLayer) paintStops(frame);
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  /**
   * The hovered target as it is on screen. An x: the crosshair, and the tooltip above its highest
   * point (at the crosshair's top for an x with every value missing). A point: the tooltip above it, or
   * below without room, moved with its effects as a bar's is, and no crosshair.
   */
  function showHover(key: string): void {
    const point = points.get(key);
    if (point) {
      if (!revealed(point.row)) return;
      const { row } = point.row;
      tooltip.show(point.shown.geometry, about(row, point.series), () => pointSummary(row, point.series, current), point.handle.style.transform);
      return;
    }
    const record = rows.get(key);
    if (!record || !revealed(record)) return;
    const marks = livePoints(record);
    const x = marks[0]?.shown.geometry.center.x ?? record.px;
    setAttributes(crosshair, { ...placeCrosshair(drawnFrame, x), visibility: undefined });
    // Moved with each point's effects, as the focus ring is.
    const ys = marks.map((point) => {
      const { transform } = point.handle.style;
      const { center } = point.shown.geometry;
      return (transform ? matrix.apply(transform, center) : center).y;
    });
    const { row } = record;
    const at = ys.length > 0 ? { top: Math.min(...ys) - DOT_RADIUS, bottom: Math.max(...ys) + DOT_RADIUS } : { top: drawnFrame.box.top, bottom: drawnFrame.box.top };
    tooltip.showAt({ x, ...at }, row, () => summary(row, current));
  }

  function hideHover(): void {
    crosshair.setAttribute("visibility", "hidden");
    tooltip.hide();
  }

  /** The focus at an x with every value missing, in `ring` while it shows there. */
  let ringLine: SVGLineElement | undefined;

  /**
   * A ring round each point at the focused x, or round the focused point, as it is on screen, moved
   * with its body when an effect moves it. An x with every value missing has no point to ring: a
   * line in the ring's colour shows its focus where the crosshair is, and stays when Escape hides
   * the crosshair.
   */
  function drawRing(key: string | undefined): void {
    const point = key === undefined ? undefined : points.get(key);
    const record = key === undefined ? undefined : (point?.row ?? rows.get(key));
    const live = record !== undefined && revealed(record);
    const marks = live ? (point ? [point] : livePoints(record)) : [];
    if (live && marks.length === 0) {
      ringLine ??= svgElement("line", { class: "ec-focus-ring", "stroke-width": RING }, ring);
      if (ring.childElementCount > 1 || ring.firstElementChild !== ringLine) ring.replaceChildren(ringLine);
      setAttributes(ringLine, placeCrosshair(drawnFrame, record.px));
      ring.removeAttribute("visibility");
      return;
    }
    ringLine?.remove();
    while (ring.childElementCount > marks.length) ring.lastElementChild!.remove();
    marks.forEach((point, i) => {
      let group = ring.children[i] as SVGGElement | undefined;
      if (!group) {
        group = svgElement("g", {}, ring);
        svgElement("path", { class: "ec-focus-ring", "stroke-width": 2 * (RING_GAP + RING) }, group);
        svgElement("path", { class: "ec-focus-gap", "stroke-width": 2 * RING_GAP }, group);
      }
      for (const path of Array.from(group.children)) path.setAttribute("d", point.shown.geometry.outline.d);
      const { transform } = point.handle.style;
      setAttributes(group, { transform: transform && transformAttribute(transform) });
    });
    setAttributes(ring, { visibility: marks.length > 0 ? undefined : "hidden" });
  }

  /** The tooltip, crosshair and ring follow the hovered and focused x or point as it moves. */
  function followHover(): void {
    if (hover.key !== undefined) showHover(hover.key);
    if (hover.ringKey !== undefined) drawRing(hover.ringKey);
  }

  /** Where a mark is heading: what enter and update report as a change starts. */
  const input = (record: MarkRecord<D>): RunInput<D> => ({ mark: record.target.geometry, data: record.target.data });
  /** The mark as it is on screen: what hover, leave and exit report, so mid-change they match what's under the pointer or on its way out. */
  const onScreen = (record: MarkRecord<D>): RunInput<D> => ({ mark: record.shown.geometry, data: record.shown.data });

  /**
   * What a revealed x with no point, every value missing, stands for in a link: a point keyed by the
   * x where the crosshair meets the plot's top, with its row and one sample, at its x as a point's
   * is, and no value (NaN). So the default linking value and a `by` that reads the row find it. It's
   * never drawn, and no effect or event hears of it.
   */
  function standIn(key: string): RunInput<D> | undefined {
    const record = rows.get(key);
    if (!record || !revealed(record)) return undefined;
    const { row } = record;
    return {
      mark: describePoint({ key, x: record.px, y: drawnFrame.box.top, r: DOT_RADIUS }),
      data: { datum: row.datum, samples: [{ t: 0, value: NaN, at: laidOut.time ? new Date(row.x) : row.x }], related: () => undefined }
    };
  }

  /** The row a column belongs to; leaving and hidden rows don't count. */
  function liveRowOf(eventTarget: EventTarget | null): RowRecord<D> | undefined {
    const element = eventTarget as Element | null;
    const column = typeof element?.closest === "function" ? element.closest(".ec-column") : null;
    const record = column ? byColumn.get(column) : undefined;
    return record && rows.get(record.key) === record && revealed(record) ? record : undefined;
  }

  // With `hover: "point"`, the points are the targets and the focus stops. Each has a stop of its own,
  // an image above the hidden x's, and the pointer anywhere over the plot hovers the nearest, or keeps
  // the hovered one while it's on its dot.

  /** The points' stops, with the plot's hit area under them; made when the hover is first "point". */
  let stopsLayer: SVGGElement | undefined;
  let plotHit: SVGRectElement | undefined;
  const stops = new Map<string, StopRecord>();
  /** The stops' elements in DOM order: the keyboard's. */
  let stopOrder: SVGGElement[] = [];
  const byStop = new WeakMap<Element, string>();

  /** The live points line by line, each in ascending x: the stops' order. */
  function pointOrder(): PointRecord<D>[] {
    const bySeries = new Map(laidOut.series.map((series) => [series, [] as PointRecord<D>[]]));
    for (const record of rowOrder) for (const point of livePoints(record)) bySeries.get(point.series)?.push(point);
    return [...bySeries.values()].flat();
  }

  /** A line's revealed points, in ascending x: where Left, Right, Home, End and the pages go. */
  const along = (series: string): PointRecord<D>[] => rowOrder.filter(revealed).flatMap((record) => livePoints(record).filter((point) => point.series === series));

  /**
   * The revealed point nearest `at`, in the <svg>'s units, by distance: of two as near, the series
   * first in `series`, then the first x. A missing value has no point. Of points drawn on each other,
   * within a px of the nearest, it's the one whose line passes nearest `at`: of two as near, the
   * series first.
   */
  function nearestPoint(at: Point): PointRecord<D> | undefined {
    const shown = rowOrder.filter(revealed).flatMap(livePoints);
    let best: PointRecord<D> | undefined;
    let far = Infinity;
    let rank = Infinity;
    for (const point of shown) {
      const d = apart(point.shown.geometry.center, at);
      const r = laidOut.series.indexOf(point.series);
      if (d < far || (d === far && r < rank)) [best, far, rank] = [point, d, r];
    }
    if (!best) return undefined;
    // The points drawn on it: each line's nearest within a px.
    const center = best.shown.geometry.center;
    const on = new Map<string, PointRecord<D>>();
    for (const point of shown) {
      const { center: c } = point.shown.geometry;
      const known = on.get(point.series);
      if (apart(c, center) <= 1 && (!known || apart(c, at) < apart(known.shown.geometry.center, at))) on.set(point.series, point);
    }
    if (on.size < 2) return best;
    let pick = best;
    let near = Infinity;
    for (const series of laidOut.series) {
      const point = on.get(series);
      if (!point) continue;
      const d = passing(point, at);
      if (d < near) [pick, near] = [point, d];
    }
    return pick;
  }

  /**
   * How near `at` a point's line passes: its stroke as drawn, curved and with its gaps, within two
   * dots' radii along it of the point, so past a dot drawn on the point. A point with no stroke
   * there, a value alone between gaps, counts as its dot.
   */
  function passing(point: PointRecord<D>, at: Point): number {
    const { geometry, data } = point.shown;
    const line = lines.get(point.series);
    const stroke = line && strokeNear(line.shown, data.samples[0]!.at, geometry.center, at, 2 * DOT_RADIUS);
    return stroke ?? Math.max(0, Math.hypot(at.x - geometry.center.x, at.y - geometry.center.y) - DOT_RADIUS);
  }

  /**
   * The hovered point, while its tooltip shows and `at` is on its dot as drawn, moved by its effects:
   * there the pointer stays on it, though another point is nearer, so it can go straight from the dot
   * onto the tooltip's bridge, which starts a px inside the dot (WCAG 1.4.13).
   */
  function heldPoint(at: { readonly x: number; readonly y: number }): PointRecord<D> | undefined {
    const point = hover.key === undefined || !tooltip.element() ? undefined : points.get(hover.key);
    if (!point || !revealed(point.row)) return undefined;
    const { transform } = point.handle.style;
    let on = at;
    if (transform) {
      try {
        on = matrix.apply(invert(transform), at);
      } catch {
        // A transform with no area leaves no dot to be on.
        return undefined;
      }
    }
    const { center } = point.shown.geometry;
    return (on.x - center.x) ** 2 + (on.y - center.y) ** 2 <= DOT_RADIUS ** 2 ? point : undefined;
  }

  /** The point the pointer at client px is on: the hovered one on its dot, otherwise the nearest. */
  function pointAt(clientX: number, clientY: number): PointRecord<D> | undefined {
    const at = fromClient(clientX, clientY);
    return heldPoint(at) ?? nearestPoint(at);
  }

  /** Client px in the <svg>'s units: it may be scaled to fit its container. */
  function fromClient(x: number, y: number): { x: number; y: number } {
    const box = svg.getBoundingClientRect();
    const k = box.width > 0 && drawnFrame.box.width > 0 ? box.width / drawnFrame.box.width : 1;
    return { x: (x - box.left) / k, y: (y - box.top) / k };
  }

  /** One object per row and series: what a point's tooltip words, and keeps its text by. */
  const abouts = new WeakMap<LineRow<D>, Map<string, TooltipRow>>();
  function about(row: LineRow<D>, series: string): TooltipRow {
    let bySeries = abouts.get(row);
    if (!bySeries) abouts.set(row, (bySeries = new Map()));
    let known = bySeries.get(series);
    if (!known) bySeries.set(series, (known = { datum: row.datum, series }));
    return known;
  }

  /**
   * With `hover: "point"`, a stop for each live point, in the keyboard's order, named by its x and its
   * value and described by a tooltip function given its series; the stops of points that went go.
   */
  function syncStops(): void {
    if (hoverKind !== "point") return;
    if (!stopsLayer) {
      stopsLayer = svgElement("g", { class: "ec-stops" }, svg);
      svg.insertBefore(stopsLayer, columnsLayer.nextSibling);
      plotHit = svgElement("rect", { class: "ec-hit" }, stopsLayer);
      // A click or tap on the plot takes focus to the point it hovers, as one on an x's column does.
      stopsLayer.addEventListener("click", (event) => {
        const point = pointAt(event.clientX, event.clientY);
        if (point) stops.get(point.key)?.element.focus();
      });
    }
    const live = pointOrder();
    const keep = new Set(live.map((point) => point.key));
    for (const [key, stop] of stops) {
      if (keep.has(key)) continue;
      stop.element.remove();
      stops.delete(key);
    }
    const order = live.map((point) => {
      let stop = stops.get(point.key);
      if (!stop) {
        const element = svgElement("g", { class: "ec-stop", "data-key": point.key, role: "img" }, stopsLayer);
        // Its bounds, for a screen reader's highlight and a magnifier: the ring's.
        stop = { element, bounds: svgElement("circle", { r: DOT_RADIUS + RING_GAP + RING, fill: "none" }, element), x: NaN, y: NaN, hidden: undefined };
        stops.set(point.key, stop);
        byStop.set(element, point.key);
      }
      const name = pointNames?.get(point.key) ?? point.key;
      if (stop.element.getAttribute("aria-label") !== name) stop.element.setAttribute("aria-label", name);
      tooltip.describe(stop.element, about(point.row.row, point.series));
      return stop.element;
    });
    orderElements(stopsLayer, stopOrder, order, hover.active);
    stopOrder = order;
  }

  /** The plot's hit area, reaching a dot's radius past the plot, and each stop round its point, hidden past the reveal. */
  function paintStops(frame: LineFrame): void {
    const { left, right, top, bottom } = frame.box;
    setAttributes(plotHit!, { x: left - DOT_RADIUS, y: top - DOT_RADIUS, width: right - left + 2 * DOT_RADIUS, height: bottom - top + 2 * DOT_RADIUS });
    for (const [key, stop] of stops) {
      const point = points.get(key);
      if (!point) continue;
      const hidden = !revealed(point.row);
      if (stop.hidden !== hidden) {
        stop.hidden = hidden;
        setAttributes(stop.element, { visibility: hidden ? "hidden" : undefined });
      }
      const { x, y } = point.shown.geometry.center;
      if (stop.x === x && stop.y === y) continue;
      stop.x = x;
      stop.y = y;
      setAttributes(stop.bounds, { cx: x, cy: y });
    }
  }

  /** The stop of the other kind nearest a key's: a point's x, or an x's first series' point, or else the nearest x's with one. */
  function counterpart(key: string): string | undefined {
    const point = points.get(key);
    if (point) return point.row.key;
    const shown = rowOrder.filter(revealed);
    const i = shown.findIndex((record) => record.key === key);
    for (let step = 0; i >= 0 && step < shown.length; step++) {
      for (const at of [i + step, i - step]) {
        const first = shown[at] && livePoints(shown[at])[0];
        if (first) return first.key;
      }
    }
    return undefined;
  }

  /**
   * Changes what's hovered, at once: the hover held ends, and the tab stop and focus go to the nearest
   * stop of the new kind, the ring with them. The new stops show before focus moves, the old go after.
   */
  function rehover(kind: HoverKind): void {
    if (kind === hoverKind) return;
    hover.leave();
    hoverKind = kind;
    if (kind === "point") {
      syncStops();
      paintStops(drawnFrame);
    } else columnsLayer.removeAttribute("display");
    hover.retarget(counterpart);
    if (kind === "point") columnsLayer.setAttribute("display", "none");
    else {
      stopsLayer?.remove();
      stopsLayer = plotHit = undefined;
      stops.clear();
      stopOrder = [];
    }
  }

  /** With `hover: "point"`, each hot point's line, by the point's key: it stays at full strength, with its decorations, while the rest dims. */
  const hotLines = new Map<string, string>();
  function heat(key: string, on: boolean): void {
    const series = on ? (hoverKind === "point" ? findMark(key)?.series : undefined) : hotLines.get(key);
    if (series === undefined) return;
    if (on) hotLines.set(key, series);
    else hotLines.delete(key);
    surface.hot(key, on);
    // A line stays hot while any of its points is.
    if (!on && [...hotLines.values()].includes(series)) return;
    findMark(series)?.group.classList.toggle("ec-hot-line", on);
    surface.hot(series, on);
  }

  /** Whether `key` is a live target: a revealed x, or with `hover: "point"` a revealed point. */
  function live(key: string): boolean {
    const point = hoverKind === "point" ? points.get(key) : undefined;
    const record = hoverKind === "point" ? point?.row : rows.get(key);
    return record !== undefined && revealed(record);
  }

  // Pointer, touch and keyboard focus share one hover: see shell/hover.ts. An x is the target, and
  // stands for each series' point there, so nothing dims: every series is read at once. With
  // `hover: "point"` the point is, alone, and the rest dims.
  const hover: ChartHover = chartHover<D>({
    svg,
    runner,
    events,
    // A link's hover shows as an x's does: nothing dims.
    dim: () => hoverKind === "point" && current.dim !== false && hover.key !== undefined,
    hot: heat,
    find(eventTarget, pointer) {
      if (hoverKind === "x") {
        const record = liveRowOf(eventTarget);
        return record && { key: record.key };
      }
      const element = eventTarget as Element | null;
      if (!stopsLayer || typeof element?.closest !== "function" || !stopsLayer.contains(element)) return undefined;
      if (pointer) {
        const point = pointAt(pointer.x, pointer.y);
        return point && { key: point.key };
      }
      const stop = element.closest(".ec-stop");
      const key = stop ? byStop.get(stop) : undefined;
      return key !== undefined && live(key) ? { key } : undefined;
    },
    moves: () => hoverKind === "point",
    live,
    order: () => (hoverKind === "point" ? pointOrder().filter((point) => revealed(point.row)) : rowOrder.filter(revealed)).map((record) => record.key),
    // On a time axis a page is a calendar month in its zone: the first x a month or more on, or back,
    // or the last one that way. On numbers it's the keyboard's own, or along a point's line a tenth of
    // its points.
    page(key, by) {
      const point = hoverKind === "point" ? points.get(key) : undefined;
      const stops = point ? along(point.series).map((p) => ({ key: p.key, x: p.row.row.x })) : rowOrder.filter(revealed).map((record) => ({ key: record.key, x: record.row.x }));
      const i = stops.findIndex((stop) => stop.key === key);
      if (i < 0) return undefined;
      if (!laidOut.time) return point ? stops[Math.min(stops.length - 1, Math.max(0, i + by * Math.ceil(stops.length / 10)))]!.key : undefined;
      const to = monthsOn(stops[i]!.x, by, lineEncoding(current).timeZone);
      if (by > 0) return (stops.find((stop) => stop.x >= to) ?? stops[stops.length - 1])?.key;
      for (let j = stops.length - 1; j >= 0; j--) if (stops[j]!.x <= to) return stops[j]!.key;
      return stops[0]?.key;
    },
    // With `hover: "point"`, Left, Right, Home and End go along the point's line, passing over its
    // missing values, and Up and Down to the point above or below at its x, by where they're drawn.
    move(key, press) {
      const point = hoverKind === "point" ? points.get(key) : undefined;
      if (!point) return undefined;
      // Top to bottom, in series order where two are drawn at one height: the sort is stable.
      const stops = press === "ArrowUp" || press === "ArrowDown" ? livePoints(point.row).sort((a, b) => a.shown.geometry.center.y - b.shown.geometry.center.y) : along(point.series);
      const i = stops.indexOf(point);
      const to = press === "Home" ? 0 : press === "End" ? stops.length - 1 : i + (press === "ArrowDown" || press === "ArrowRight" ? 1 : -1);
      return stops[Math.max(0, Math.min(stops.length - 1, to))]?.key;
    },
    marks: (key) => {
      const record = rows.get(key);
      if (record) return livePoints(record).map((point) => point.key);
      return points.has(key) ? [key] : [];
    },
    element: (key) => (rows.get(key) ?? leavingRows.get(key))?.column ?? stops.get(key)?.element,
    markElement: (key) => findMark(key)?.group,
    onScreen(key) {
      const record = findMark(key);
      return record && onScreen(record);
    },
    standIn,
    ring: drawRing,
    tooltip: { show: showHover, hide: hideHover, element: () => tooltip.element() }
  });

  // ── Changes ────────────────────────────────────────────────────────────────

  const syncLegend = (): void =>
    legend.update(
      laidOut.series.map((series) => ({ series, label: seriesLabel(current.seriesLabels, series) })),
      colors,
      current.legend
    );

  /** The data table for `opts`, laid out as `next`: a row per x, the x, each series and no total. Throws on a column it can't read. */
  function tableFor(opts: LineChartOptions<D>, next: LineLayout<D>): TableModel | undefined {
    return tableModel({
      option: opts.table,
      caption: opts.label,
      category: typeof opts.x === "string" ? opts.x : undefined,
      series: next.series,
      label: (series) => seriesLabel(opts.seriesLabels, series),
      rows: next.rows.map((row) => ({ key: row.key, category: row.label, datum: row.datum, index: row.index, values: present(row.values), missing: row.missing, total: total(row.values) })),
      format: format(opts),
      total: false,
      missing: missingOf(opts)
    });
  }

  /**
   * The x's accessible name, from where it's heading, and its description (`markDescription`, or a
   * tooltip function's text). With `hover: "point"` its column is hidden, and is neither named nor
   * described: `markLabel` is called for the stops shown, and a tooltip function written for points,
   * `(d, { series })`, would be given the row alone. update() names them again with "x".
   */
  function labelColumn(record: RowRecord<D>): void {
    if (hoverKind !== "x") return;
    record.column.setAttribute("aria-label", names!.get(record.key)!);
    tooltip.describe(record.column, record.row);
  }

  /** Says what an update changed, in the live region: the chart's summary, or the page's text from it. */
  function announceChange(previous: LineChartOptions<D>, before: readonly string[]): void {
    const option = current.announce;
    if (!announcer || !option) return;
    const series = laidOut.series;
    const name = (record: RowRecord<D>): string => record.row.label;
    const { changed: values, added, removed } = rowChanges;
    const text = changeText({
      ...(current.label !== previous.label ? { label: current.label } : {}),
      // New series are said by their labels; new labels alone show the same view, so say nothing.
      ...(series.join("\n") !== before.join("\n") ? { series: series.map((s) => seriesLabel(current.seriesLabels, s)) } : {}),
      changed: values.map(name),
      added: added.map(name),
      removed: removed.map(name),
      count: rowOrder.length
    });
    if (typeof option !== "function") {
      announcer.say(text);
      return;
    }
    const key = (record: RowRecord<D>): string => record.key;
    try {
      const said = option({ text, changed: values.map(key), added: added.map(key), removed: removed.map(key) });
      if (said !== undefined && said !== null) announcer.say(String(said));
    } catch (error) {
      report(error);
    }
  }

  /**
   * Matches the layout's rows, series and points to records by key. New rows grow out of the nearest
   * row that stays (before them, or else after), and rows that go fold into theirs. A line gets
   * `update` when any of its values or rows changed, a point when its own value did; a new row's
   * points enter, a removed row's exit, and so do a series' line and points.
   */
  function arrange(next: LineLayout<D>): Diff<D> {
    laidOut = next;
    const placed = placedFor(next);
    const diff: Diff<D> = { entering: [], exiting: [], changed: [] };
    const keys = new Set(next.rows.map((row) => row.key));
    const series = next.rows.length > 0 ? next.series : [];
    const changes: RowChanges<D> = { changed: [], added: [], removed: [] };

    // What goes: lines first, then points by x.
    const before = rowOrder;
    const was = new Map(before.map((record) => [record, record.row]));
    const nextRows = new Map(next.rows.map((row) => [row.key, row]));
    const exitingLines = lineOrder.filter((line) => !series.includes(line.series));
    const exitingPoints: PointRecord<D>[] = [];
    for (const record of before) {
      const goes = !keys.has(record.key);
      const missing = nextRows.get(record.key)?.missing;
      if (goes) {
        rows.delete(record.key);
        record.leaving = true;
        leavingRows.set(record.key, record);
        changes.removed.push(record);
      }
      // A point goes with its row, its series, or its value.
      for (const point of livePoints(record)) if (goes || !series.includes(point.series) || missing?.has(point.series)) exitingPoints.push(point);
    }
    for (const line of exitingLines) lines.delete(line.series);
    for (const point of exitingPoints) points.delete(point.key);
    for (const record of [...exitingLines, ...exitingPoints]) leaving.start(record);
    diff.exiting.push(...exitingLines, ...exitingPoints);

    // The rows, matched by key.
    const stayed = new Set<RowRecord<D>>();
    let rowsMoved = changes.removed.length > 0;
    rowOrder = next.rows.map((row) => {
      let record = rows.get(row.key);
      if (record) {
        stayed.add(record);
        if (record.row.x !== row.x) rowsMoved = true;
        if (row.values.some((v, i) => record!.row.values[i]?.series !== v.series || record!.row.values[i]?.value !== v.value)) changes.changed.push(record);
      } else {
        // A row that comes back mid-fold keeps its record, and grows back from where it is.
        record = leavingRows.get(row.key) ?? createRow(row, true);
        leavingRows.delete(row.key);
        record.leaving = false;
        record.x.set(row.x);
        record.values.set(row.levels);
        rows.set(row.key, record);
        changes.added.push(record);
        rowsMoved = true;
      }
      record.row = row;
      return record;
    });
    rowOrder.forEach((record, i) => {
      if (!stayed.has(record)) record.anchor = nearest(rowOrder, i, stayed);
      else if (record.presence.value === 1) record.anchor = undefined;
    });
    for (const record of changes.removed) record.anchor ??= nearest(before, before.indexOf(record), stayed);

    // The lines: a line changed when its rows did, or any of its values.
    const previousLines = lineOrder;
    lineOrder = series.map((name) => {
      let line = lines.get(name);
      const target = placed.lines.get(name)!;
      if (line) {
        const values = [...stayed].some((record) => valueIn(was.get(record)!, name) !== valueIn(record.row, name));
        if (rowsMoved || values) diff.changed.push({ record: line, from: line.shown.geometry });
      } else {
        line = recall<LineRecord<D>>(name, "line") ?? createLine(name, target, true);
        lines.set(name, line);
        diff.entering.push(line);
      }
      line.target = target;
      return line;
    });

    // The points, by x: a point changed when its own value did. A missing value has none.
    for (const record of rowOrder) {
      const old = stayed.has(record) ? was.get(record) : undefined;
      const live = series.filter((name) => !record.row.missing.has(name)).map((name) => {
        const key = pointKey(name, record.key);
        const target = placed.points.get(key)!;
        let point = points.get(key);
        if (point) {
          if (old && valueIn(old, name) !== valueIn(record.row, name)) diff.changed.push({ record: point, from: point.shown.geometry });
        } else {
          point = recall<PointRecord<D>>(key, "point") ?? createPoint(record, target);
          point.row = record;
          points.set(key, point);
          diff.entering.push(point);
        }
        point.target = target;
        return point;
      });
      const kept = new Set(live);
      record.points = [...live, ...record.points.filter((point) => !kept.has(point) && drawn(point))];
    }

    for (const record of rowOrder) labelColumn(record);
    syncStops();
    // DOM order follows visual order, for screen readers.
    orderElements(
      columnsLayer,
      before.filter((record) => !record.leaving).map((record) => record.column),
      rowOrder.map((record) => record.column),
      hover.active
    );
    orderElements(linesLayer, previousLines.map((line) => line.group), lineOrder.map((line) => line.group), () => null);
    rowChanges = changes;
    // New marks are drawn where they start, so hover and exit report them as they are on screen.
    dirty = true;
    draw();
    return diff;
  }

  /** Brings back the mark leaving under `key`, if there is one and it's the kind wanted: it keeps its element, and the runner cancels its exit. */
  function recall<R extends MarkRecord<D>>(key: string, kind: R["kind"]): R | undefined {
    return leaving.get(key)?.kind === kind ? (leaving.recall(key) as R) : undefined;
  }

  /**
   * Sends every animated value toward `next`, and returns the animations started. Presentation stages
   * the change: values first (the rows' values and the value scale, ticks fading, series' lines fading
   * in or out, the lines' curve), then positions (rows move along x, new rows grow out of their anchors
   * and leaving rows fold into theirs, the x range and the box follow). A stage with nothing to do is skipped. Analysis
   * runs it all as one stage, which its scaling keeps short. A jump (motion off, a resize) lands at once.
   */
  function retarget(next: LineLayout<D>, jump: boolean): Promise<TweenResult>[] {
    dirty = true;
    const { frame } = next;
    for (const [ticks, placed, lined] of [
      [yTicks, next.yTicks, true],
      [xTicks, next.xTicks, false]
    ] as const) {
      const wanted = new Set(placed.map((tick) => tick.value));
      for (const value of wanted) if (!ticks.has(value)) addTick(ticks, value, 0, lined);
      for (const tick of ticks.values()) tick.wanted = wanted.has(tick.value);
    }
    for (const tick of next.xTicks) xTicks.get(tick.value)!.text = tick.label.text;
    const goingLines = leavingLines();
    const folding = [...leavingRows.values()];

    const values =
      busy(scale, frame.scale, sameFields) ||
      [...yTicks.values()].some((tick) => busy(tick.opacity, tick.wanted ? 1 : 0, same)) ||
      rowOrder.some((record) => busy(record.values, record.row.levels, sameFields)) ||
      lineOrder.some((line) => busy(line.presence, 1, same)) ||
      goingLines.some((line) => busy(line.presence, 0, same)) ||
      busy(curved, bendOf(next.curve), same);
    const positions =
      busy(box, frame.box, sameFields) ||
      [...xTicks.values()].some((tick) => busy(tick.opacity, tick.wanted ? 1 : 0, same)) ||
      rowOrder.some((record) => busy(record.x, record.row.x, same) || (record.anchor !== undefined && busy(record.presence, 1, same))) ||
      folding.some((record) => record.anchor !== undefined && busy(record.presence, 0, same));

    let first: AnimateOptions | undefined;
    let second: AnimateOptions | undefined;
    if (!jump && motion.staged) {
      first = { duration: STAGE };
      second = { duration: STAGE, delay: values ? STAGE : 0 };
    } else if (!jump) {
      first = second = { duration: (values && positions ? 2 : 1) * STAGE };
    }

    const running: Promise<TweenResult>[] = [];
    const move = <T>(value: Animated<T>, to: T, equal: (a: T, b: T) => boolean, timing: AnimateOptions | undefined): void => {
      if (!busy(value, to, equal)) return;
      if (timing) running.push(value.to(to, timing));
      else value.set(to);
    };
    move(scale, frame.scale, sameFields, first);
    move(curved, bendOf(next.curve), same, first);
    move(box, frame.box, sameFields, second);
    for (const tick of yTicks.values()) move(tick.opacity, tick.wanted ? 1 : 0, same, first);
    for (const tick of xTicks.values()) move(tick.opacity, tick.wanted ? 1 : 0, same, second);
    for (const record of rowOrder) {
      move(record.values, record.row.levels, sameFields, first);
      move(record.x, record.row.x, same, second);
      // With nothing to grow out of, a row is in place at once.
      move(record.presence, 1, same, record.anchor ? second : undefined);
    }
    for (const record of folding) move(record.presence, 0, same, record.anchor ? second : undefined);
    for (const line of lineOrder) move(line.presence, 1, same, first);
    for (const line of goingLines) move(line.presence, 0, same, first);
    return running;
  }

  function addTick(ticks: Map<number, TickRecord>, value: number, opacity: number, lined: boolean, text = ""): void {
    const tick: TickRecord = {
      value,
      line: lined ? svgElement("line", { class: value === 0 ? "ec-baseline" : "ec-gridline" }, grid) : undefined,
      label: svgElement("text", { class: "ec-tick" }, axis),
      text,
      opacity: animated(opacity, interpolateNumber, { clock, motion, onChange: changed }),
      wanted: true
    };
    ticks.set(value, tick);
    // In value order, as the layout lists them.
    for (const t of [...ticks.values()].sort((a, b) => a.value - b.value)) {
      if (t.line) grid.appendChild(t.line);
      axis.appendChild(t.label);
    }
  }

  /**
   * Moves to `next`, animated or at once, drawing every frame. Resolves when the change settles.
   * One still in flight is taken over: its waiters wait for this one instead.
   */
  function transitionTo(next: LineLayout<D>, jump: boolean): Promise<void> {
    laidOut = next;
    counting = Object.fromEntries(next.series.map((name) => [name, Math.max(counting[name] ?? 0, next.decimals[name] ?? 0)]));
    return transitions.run(retarget(next, jump));
  }

  // ── Motion, size and fonts ─────────────────────────────────────────────────

  const unwatchHoverDuration = watchHoverDuration(svg, motion);

  /** Re-lays out without animating: a resize, fonts loading or the text changing size. A change in flight lands at once. Effects follow through change(). */
  function relayout(): void {
    if (destroyed) return;
    const next = layout(current);
    // The same rows as now: only the sizes changed.
    const byKey = new Map(next.rows.map((row) => [row.key, row]));
    for (const record of rowOrder) record.row = byKey.get(record.key) ?? record.row;
    const placed = placedFor(next);
    for (const line of lineOrder) line.target = placed.lines.get(line.series) ?? line.target;
    for (const point of points.values()) point.target = placed.points.get(point.key) ?? point.target;
    void transitionTo(next, true);
  }

  // Margins are measured; measure again when the text changes size, such as spacing added after the
  // chart drew, and once web fonts arrive.
  const remeasure = (): void => {
    measure.clear();
    relayout();
  };
  const unwatchText = watchText(svg, clock, remeasure);

  const unwatchWidth = watchWidth(container, clock, measuredWidth, (width) => {
    measuredWidth = width;
    // A fixed `width` ignores the container.
    if (current.width === undefined) relayout();
  });

  const unwatchFonts = watchFonts(doc, remeasure);

  // ── First render ───────────────────────────────────────────────────────────

  describeChart(svg, current);
  syncLegend();
  table.render(firstTable);
  {
    const placed = placedFor(laidOut);
    for (const tick of laidOut.yTicks) addTick(yTicks, tick.value, 1, true);
    for (const tick of laidOut.xTicks) addTick(xTicks, tick.value, 1, false, tick.label.text);
    rowOrder = laidOut.rows.map((row) => {
      const record = createRow(row, false);
      rows.set(row.key, record);
      record.points = laidOut.series.filter((name) => !row.missing.has(name)).map((name) => {
        const point = createPoint(record, placed.points.get(pointKey(name, row.key))!);
        points.set(point.key, point);
        return point;
      });
      labelColumn(record);
      return record;
    });
    lineOrder = laidOut.rows.length > 0 ? laidOut.series.map((name) => createLine(name, placed.lines.get(name)!, false)) : [];
    for (const line of lineOrder) lines.set(line.series, line);
    // With `hover: "point"`, the points' stops in place of the x's.
    syncStops();
    if (hoverKind === "point") columnsLayer.setAttribute("display", "none");
    land();
  }
  /** The live marks as they're heading, in the runner's order: the lines, then each x's points. */
  const liveMarks = (): MarkRecord<D>[] => [...lineOrder, ...rowOrder.flatMap(livePoints)];
  hover.sync();
  runner.enter(liveMarks().map(input));

  /**
   * The stop that takes focus for `key`: an x, for its own key or one of its points'; with `hover:
   * "point"`, a point, for its own key or its x's, whose first series' point it is.
   */
  function stopFor(key: string): string | undefined {
    const row = rows.get(key);
    if (hoverKind === "x") return (row ?? points.get(key)?.row)?.key;
    return (points.get(key) ?? (row && livePoints(row)[0]))?.key;
  }

  return linkable(hover.link, {
    element: svg,

    async update(next) {
      if (destroyed) return;
      if (next.motion !== undefined && next.motion !== current.motion) throw new TypeError("lineChart: `motion` can't be changed by update() yet.");
      const merged: LineChartOptions<D> = { ...current, ...next };
      checkChartOptions(merged, "lineChart");
      const kind = hoverOf(merged);
      missingOf(merged);
      // Throws on an effect it can't resolve, data it can't draw, a table column it can't read, or a
      // `format` that throws, before anything changes.
      const swapped = "on" in next ? nextEffects(effects, current.on, merged.on, env.presets) : effects;
      const nextLayout = layout(merged, swapped);
      const nextTable = tableFor(merged, nextLayout);
      const nextNames = kind === "x" ? namesFor(merged, nextLayout) : undefined;
      const nextPointNames = kind === "point" ? pointNamesFor(merged, nextLayout) : undefined;
      if ("colors" in next) colors = toColorAssignment(merged.colors);
      const previous = current;
      const seriesBefore = laidOut.series;
      current = merged;
      names = nextNames;
      pointNames = nextPointNames;
      describeChart(svg, current);
      table.render(nextTable);
      // A region that appears with its first text is often missed: it announces from the next update.
      const announcing = announcer !== undefined;
      if (current.announce && !announcer) announcer = chartAnnouncer(svg);
      else if (!current.announce && announcer) {
        announcer.destroy();
        announcer = undefined;
      }
      // A new kind of hover takes over at once, on the marks as they are; this update's change then plays with it.
      rehover(kind);
      hover.syncDim();
      transitions.supersede();
      const swapping = swapped !== effects;
      effects = swapped;

      // The runner hears exit / update / enter now, then change() on every frame, then settle(). New
      // effects start where the old ones were, on the marks staying, as this update leaves them; a
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
                  runner.swap(swapped, liveMarks().filter((record) => !entering.has(record)).map(input));
                }
              }
            : {})
        },
        () => arrange(nextLayout),
        () => {
          if (announcing) announceChange(previous, seriesBefore);
        }
      );
      syncLegend();
      const settled = transitionTo(nextLayout, motion.mode === "off");
      await transitions.wait(settled, leaves);
    },

    reveal(x) {
      if (destroyed) return;
      // A Date is its time in ms, which is how a time axis has its x's.
      if (x instanceof Date && Number.isNaN(x.getTime())) throw new RangeError("lineChart: reveal(x) needs a valid Date, got an invalid Date.");
      const at: unknown = x instanceof Date ? x.getTime() : x;
      if (typeof at !== "number" || Number.isNaN(at)) throw new RangeError(`lineChart: reveal(x) needs a number, got ${typeof at === "string" ? JSON.stringify(at) : String(at)}.`);
      const before = revealedIn(laidOut);
      through = at;
      if (revealedIn(laidOut) === before) return;
      // A view, not a data change: no events. The lines (and their decorations, through change())
      // end at x, and the x's past it are hidden.
      drawReveal();
      hover.dropGone();
      hover.sync();
    },

    on: events.on,

    marks: () => [...lineOrder.map((line) => line.shown.geometry), ...rowOrder.filter(revealed).flatMap((record) => livePoints(record).map((point) => point.shown.geometry))],

    focus(key) {
      const stop = destroyed ? undefined : stopFor(key);
      if (stop !== undefined) hover.focus(stop);
    },

    leave() {
      if (!destroyed) hover.leave();
    },

    // A line's end label is its value; points have none.
    labels: () => lineOrder.flatMap((line) => chartLabel(line.key, "value", line.drawnLabel, line.label)),

    // For a chart switch: a line and its points take their series' colour, and of the points only a
    // value alone between gaps is drawn at rest, with its ring; a line has its end dot, unless it
    // has no values, with its ring. An x stands for each series' point there, in series order (a
    // missing value's key too, which another view may have), then itself. Tab from outside lands on
    // the stop focus(key) would focus.
    paintOf(key: string): ChartSwitchPaint | undefined {
      const line = lines.get(key);
      if (line) return { color: line.series, drawn: true, ...(line.end.getAttribute("visibility") === "hidden" ? {} : { end: DOT_RADIUS, ring: DOT_RING }) };
      const point = points.get(key);
      return point && (point.group.classList.contains("ec-alone") ? { color: point.series, drawn: true, ring: DOT_RING } : { color: point.series, drawn: false });
    },

    standsFor(key: string): string[] {
      return rows.has(key) ? [...laidOut.series.map((series) => pointKey(series, key)), key] : [key];
    },

    moveTabStop(key: string): boolean {
      const stop = destroyed ? undefined : stopFor(key);
      return stop !== undefined && hover.moveTabStop(stop);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      // Ends the change in flight, and resolves the latest update()'s promise.
      transitions.destroy();
      hover.destroy();
      runner.destroy();
      tooltip.destroy();
      legend.destroy();
      table.destroy();
      announcer?.destroy();
      unwatchHoverDuration();
      unwatchText();
      unwatchWidth();
      unwatchFonts();
      for (const record of [...rowOrder, ...leavingRows.values()]) for (const value of [record.x, record.values, record.presence]) value.stop();
      for (const line of [...lineOrder, ...leavingLines()]) line.presence.stop();
      for (const record of leaving.values()) record.leave?.resolve();
      scale.stop();
      box.stop();
      curved.stop();
      for (const tick of [...yTicks.values(), ...xTicks.values()]) tick.opacity.stop();
      events.clear();
      rows.clear();
      leavingRows.clear();
      lines.clear();
      points.clear();
      leaving.clear();
      rowOrder = [];
      lineOrder = [];
      svg.remove();
    }
  });
}

/** A row at rest, as laid out: its values, and its levels where it has none. */
function restState<D>(row: LineRow<D>): RowState<D> {
  return { key: row.key, datum: row.datum, x: row.x, values: row.levels, missing: row.missing };
}

/** The values a row has, leaving out the missing ones. */
function present(values: readonly LineValue[]): { series: string; value: number }[] {
  return values.flatMap((v) => (v.value === undefined ? [] : [{ series: v.series, value: v.value }]));
}

function valueIn<D>(row: LineRow<D>, series: string): number | undefined {
  return row.values.find((v) => v.series === series)?.value;
}

function total(values: readonly LineValue[]): number {
  return values.reduce((sum, v) => sum + (v.value ?? 0), 0);
}

/** The nearest record to index `i` in `order` that's in `among`: before it first, then after it. */
function nearest<R>(order: readonly R[], i: number, among: ReadonlySet<R>): R | undefined {
  for (let j = i - 1; j >= 0; j--) if (among.has(order[j]!)) return order[j];
  for (let j = i + 1; j < order.length; j++) if (among.has(order[j]!)) return order[j];
  return undefined;
}

/** The same walk and outline. */
function sameGeometry(a: MarkGeometry, b: MarkGeometry): boolean {
  return a.key === b.key && !geometryChanged(a, b) && a.start.x === b.start.x && a.start.y === b.start.y && a.end.x === b.end.x && a.end.y === b.end.y;
}

/** The same row and samples. */
function sameData<D>(a: MarkData<D>, b: MarkData<D>): boolean {
  if (a.datum !== b.datum || a.samples.length !== b.samples.length) return false;
  return a.samples.every((s, i) => {
    const o = b.samples[i]!;
    return s.t === o.t && s.value === o.value && sameAt(s.at, o.at) && s.gapBefore === o.gapBefore;
  });
}

/** The same x: Dates by their time, since each placing makes its own. */
function sameAt(a: Sample["at"], b: Sample["at"]): boolean {
  return a === b || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime());
}

/** The squared distance between two points. */
function apart(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

/**
 * How near `at` a line's stroke passes within `reach` px along it, either way, of its vertex at x
 * `x`, drawn at `from`, up to a gap; undefined where none is drawn there (a gap either side) or the
 * line has no vertex at `x`.
 */
function strokeNear<D>({ geometry, data: { samples } }: Placed<D>, x: Sample["at"], from: Point, at: Point, reach: number): number | undefined {
  const i = samples.findIndex((sample) => sameAt(sample.at, x));
  if (i < 0 || !(geometry.length > 0)) return undefined;
  const t = samples[i]!.t;
  const span = reach / geometry.length;
  let near: number | undefined;
  for (const way of [-1, 1]) {
    let a = from;
    for (let j = i; ; j += way) {
      const next = samples[j + way];
      // A gap is before the later of the two.
      if (!next || (way > 0 ? next : samples[j]!).gapBefore) break;
      const to = way > 0 ? Math.min(next.t, t + span) : Math.max(next.t, t - span);
      const b = geometry.path(to);
      near = Math.min(near ?? Infinity, toSegment(at, a, b));
      if (to !== next.t) break;
      a = b;
    }
  }
  return near;
}

/** The distance from `p` to the segment from `a` to `b`. */
function toSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const u = length > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
}

/** Each series' value with its label, leaving out the missing ones: what `markLabel` is given. Copies, so a page can't change the layout's. */
function labelled<D>(values: readonly LineValue[], options: LineChartOptions<D>): { series: string; label: string; value: number }[] {
  return present(values).map((v) => ({ series: v.series, label: seriesLabel(options.seriesLabels, v.series), value: v.value }));
}

/** Each series at the row, as the x's name and the tooltip say it: its value with its label ("15 goals"), or its label and `missing`'s word ("xg missing"). */
function said<D>(values: readonly LineValue[], options: LineChartOptions<D>): string[] {
  const formatted = format(options);
  const missing = missingOf(options);
  return values.map((v) => {
    const label = seriesLabel(options.seriesLabels, v.series);
    return v.value === undefined ? `${label} ${missing}` : `${formatted(v.value)} ${label}`;
  });
}

/** The default tooltip: the x, then each series' value or that it's missing. */
function summary<D>(row: LineRow<D>, options: LineChartOptions<D>): TooltipContent {
  if (row.missing.size === 0) return summaryContent(row.label, labelled(row.values, options), format(options), { total: false });
  return { title: row.label, lines: [said(row.values, options).join(" · ")] };
}

/** A point's default tooltip: the x, then its series' value with its label. */
function pointSummary<D>(row: LineRow<D>, series: string, options: LineChartOptions<D>): TooltipContent {
  return summaryContent(row.label, labelled(row.values, options).filter((v) => v.series === series), format(options), { total: false });
}

/** The page's wording for a focus stop from `markLabel`, given `mark`; or, without one, or for an empty name or a throw (reported), `mark.text`. */
function worded<D>(options: LineChartOptions<D>, datum: D, mark: MarkSummary): string {
  if (!options.markLabel) return mark.text;
  try {
    const named: unknown = options.markLabel(datum, mark);
    if (named !== undefined && named !== null && String(named).trim() !== "") return String(named);
  } catch (error) {
    report(error);
  }
  return mark.text;
}

/**
 * With `hover: "x"`, every x's name in `layout`, by key, worked out before anything changes: "12: 15
 * goals, 14.2 xg", each series' value with its label, or the page's wording from `markLabel`. An empty
 * name, or a throw (reported), keeps the default, so a focus stop is never left unnamed.
 */
function namesFor<D>(options: LineChartOptions<D>, layout: LineLayout<D>): ReadonlyMap<string, string> {
  const formatted = format(options);
  return new Map(
    layout.rows.map((row) => {
      const text = `${row.label}: ${said(row.values, options).join(", ")}`;
      return [row.key, worded(options, row.datum, { key: row.key, category: row.label, values: labelled(row.values, options), total: total(row.values), format: formatted, text })];
    })
  );
}

/**
 * With `hover: "point"`, every point's name in `layout`, by its key: its x and its value with its
 * label, "12: 15 goals", or the page's wording from `markLabel`, given that series alone in `values`.
 */
function pointNamesFor<D>(options: LineChartOptions<D>, layout: LineLayout<D>): ReadonlyMap<string, string> {
  const formatted = format(options);
  return new Map(
    layout.rows.flatMap((row) =>
      labelled(row.values, options).map((value) => {
        const key = pointKey(value.series, row.key);
        const text = `${row.label}: ${formatted(value.value)} ${value.label}`;
        return [key, worded(options, row.datum, { key, category: row.label, values: [value], total: value.value, format: formatted, text })] as const;
      })
    )
  );
}

/** The `hover` option: "x" by default, or "point". Anything else throws a TypeError. */
function hoverOf<D>(options: LineChartOptions<D>): HoverKind {
  const { hover = "x" } = options;
  if (hover !== "x" && hover !== "point") throw new TypeError(`lineChart: hover must be "x" or "point", got ${typeof hover === "string" ? JSON.stringify(hover) : String(hover)}.`);
  return hover;
}

/** The `missing` option: the word for a missing value, "missing" by default. Anything but a string with a word in it throws a TypeError. */
function missingOf<D>(options: LineChartOptions<D>): string {
  const { missing = MISSING } = options;
  if (typeof missing !== "string" || missing.trim() === "") {
    throw new TypeError(`lineChart: missing must be a word for a missing value, such as "no data", got ${typeof missing === "string" ? JSON.stringify(missing) : String(missing)}.`);
  }
  return missing;
}
