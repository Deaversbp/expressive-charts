// barChart: the thin reference bar chart (M1 step 5). Horizontal bars or vertical columns, plain or
// stacked; keyed marks described with describe.bar; a measured layout; axis, grid and labels in theme
// colours; built-in hover dimming; pointer and touch hover. update() jumps to the new state: staged
// transitions come in step 8, keyboard support in step 9.
//
// The chart never names an effect: it resolves `on` through the presets it's handed and plays them
// through the runner, which draws on the SVG surface.

import type { Clock, IconSource, MarkGeometry, Motion } from "../core";
import { defaultClock } from "../core";
import { resolveEffects, type PresetFactory, type Registry } from "../core/registry";
import { report } from "../core/report";
import { createRunner, type RunInput } from "../core/runner";
import { barEncoding, layoutBars, type BarLayout, type BarRow, type TextPlacement } from "./bar-layout";
import { toColorAssignment } from "./colors";
import { pointerHover, type HoverTarget } from "./interaction";
import { chartMotion } from "./motion";
import { svgMarkHandle, type StyledPart, type SvgMarkHandle } from "./render/mark-style";
import { svgSurface } from "./render/surface";
import { setAttributes, setStyles, svgElement } from "./render/svg";
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

interface MarkRecord<D> {
  readonly key: string;
  row: BarRow<D>;
  readonly group: SVGGElement;
  readonly hit: SVGRectElement;
  readonly label: SVGTextElement;
  /** Holds the segments; effects' transform and opacity go here. */
  readonly body: SVGGElement;
  readonly value: SVGTextElement;
  readonly paths: Map<string, SVGPathElement>;
  parts: StyledPart[];
  readonly handle: SvgMarkHandle;
}

interface Diff<D> {
  readonly entering: MarkRecord<D>[];
  readonly exiting: MarkRecord<D>[];
  /** Values changed: update effects run. */
  readonly changed: { readonly record: MarkRecord<D>; readonly from: BarRow<D> }[];
  /** Only the geometry changed: a re-sort, a new scale, a resize. */
  readonly moved: MarkRecord<D>[];
}

type Listeners<D> = { [K in keyof MarkEvents<D>]: Set<(event: MarkEvents<D>[K]) => void> };

/** Used when the container has no width yet (hidden, or no layout as in jsdom); the prototype's width. */
const FALLBACK_WIDTH = 640;
const ONE = { index: 0, count: 1 } as const;

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
  const marksLayer = svgElement("g", { class: "ec-marks" }, svg);
  const overlay = svgElement("g", { class: "ec-overlay", "aria-hidden": "true" }, svg);
  const measure = textMeasure(svg);

  /** Marks on screen, in visual order. */
  let order: MarkRecord<D>[] = [];
  const records = new Map<string, MarkRecord<D>>();
  /** Marks whose exit effects are still running. */
  const leaving = new Map<string, MarkRecord<D>>();
  const byGroup = new WeakMap<Element, MarkRecord<D>>();
  const listeners: Listeners<D> = { enter: new Set(), update: new Set(), exit: new Set(), hover: new Set(), leave: new Set() };
  let hovered: string | undefined;
  let measuredWidth = containerWidth(container);
  let destroyed = false;

  const find = (key: string): MarkRecord<D> | undefined => records.get(key) ?? leaving.get(key);
  const runner = createRunner<D>({
    effects,
    motion,
    icons: env.icons,
    clock,
    surface: svgSurface({
      overlay,
      // Looked up on each call, so the handle follows the mark's record.
      mark: (key) => ({
        set: (style) => find(key)?.handle.set(style),
        reset: () => find(key)?.handle.reset()
      }),
      colors: (key) => find(key)?.parts[0]?.colors
    })
  });

  // ── Drawing ────────────────────────────────────────────────────────────────

  function layout(opts: BarChartOptions<D>): BarLayout<D> {
    return layoutBars({
      data: opts.data,
      encoding: barEncoding(opts),
      sort: opts.sort,
      width: opts.width ?? measuredWidth,
      height: opts.height,
      format: opts.format ?? defaultFormat,
      measure
    });
  }

  function createRecord(row: BarRow<D>): MarkRecord<D> {
    const group = svgElement("g", { class: "ec-mark", "data-key": row.key }, marksLayer);
    const record: MarkRecord<D> = {
      key: row.key,
      row,
      group,
      hit: svgElement("rect", { class: "ec-hit" }, group),
      label: svgElement("text", { class: "ec-label" }, group),
      body: svgElement("g", { class: "ec-body" }, group),
      value: svgElement("text", { class: "ec-value" }, group),
      paths: new Map(),
      parts: [],
      handle: svgMarkHandle(() => record)
    };
    byGroup.set(group, record);
    return record;
  }

  function drawMark(record: MarkRecord<D>, row: BarRow<D>): void {
    record.row = row;
    setAttributes(record.hit, { ...row.hit });
    placeText(record.label, row.label);
    placeText(record.value, row.value);
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
  }

  function drawAxis(next: BarLayout<D>): void {
    setAttributes(svg, { width: next.width, height: next.height, viewBox: `0 0 ${round(next.width)} ${round(next.height)}` });
    grid.textContent = "";
    axis.textContent = "";
    for (const tick of next.ticks) {
      svgElement("line", { class: tick.value === 0 ? "ec-baseline" : "ec-gridline", ...tick.line }, grid);
      placeText(svgElement("text", { class: "ec-tick" }, axis), tick.label);
    }
  }

  /** Brings the DOM to `next` at once and says what changed. Leaving marks stay until their exit is done. */
  function render(next: BarLayout<D>): Diff<D> {
    const keys = new Set(next.rows.map((row) => row.key));
    const diff: Diff<D> = { entering: [], exiting: [], changed: [], moved: [] };
    for (const record of order) {
      if (keys.has(record.key)) continue;
      records.delete(record.key);
      leaving.set(record.key, record);
      record.group.classList.add("ec-leaving");
      diff.exiting.push(record);
    }
    const previous = order;
    order = next.rows.map((row) => {
      let record = records.get(row.key);
      if (record) {
        const from = record.row;
        if (valuesChanged(from, row)) diff.changed.push({ record, from });
        else if (geometryChanged(from.geometry, row.geometry)) diff.moved.push(record);
      } else {
        // A mark that comes back mid-exit keeps its element; the runner cancels its exit.
        record = leaving.get(row.key);
        if (record) {
          leaving.delete(row.key);
          record.group.classList.remove("ec-leaving");
        } else {
          record = createRecord(row);
        }
        records.set(row.key, record);
        diff.entering.push(record);
      }
      drawMark(record, row);
      return record;
    });
    // DOM order follows visual order (the keyboard and screen readers will rely on it).
    if (order.some((record, i) => previous[i] !== record)) for (const record of order) marksLayer.appendChild(record.group);
    drawAxis(next);
    return diff;
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  const input = (record: MarkRecord<D>): RunInput<D> => ({ mark: record.row.geometry, data: record.row.data });

  const interaction = pointerHover(svg, {
    find(eventTarget) {
      const element = eventTarget as Element | null;
      const group = typeof element?.closest === "function" ? element.closest(".ec-mark") : null;
      const record = group ? byGroup.get(group) : undefined;
      if (!record || records.get(record.key) !== record) return undefined;
      const segment = element?.closest(".ec-segment")?.getAttribute("data-series") ?? undefined;
      return segment === undefined ? { key: record.key } : { key: record.key, segment };
    },
    hover(target: HoverTarget, source) {
      const record = records.get(target.key);
      if (!record) return;
      hovered = target.key;
      record.group.classList.add("ec-hot");
      if (current.dim !== false) svg.classList.add("ec-hovering");
      runner.hover([input(record)]);
      emit("hover", { ...input(record), batch: ONE, source, ...(target.segment === undefined ? {} : { segment: target.segment }) });
    },
    leave() {
      const key = hovered;
      hovered = undefined;
      svg.classList.remove("ec-hovering");
      const record = key === undefined ? undefined : find(key);
      if (key === undefined || !record) return;
      record.group.classList.remove("ec-hot");
      runner.leave([key]);
      emit("leave", { ...input(record), batch: ONE });
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
    marks.forEach((record, index) => emit(type, { ...input(record), batch: { index, count: marks.length } }));
  }

  // ── Motion, size and fonts ─────────────────────────────────────────────────

  // CSS hover transitions read their duration from motion, like everything else.
  const syncMotion = (): void => svg.style.setProperty("--ec-hover-duration", `${motion.duration(100, "feedback")}ms`);
  syncMotion();
  const unsubscribeMotion = motion.subscribe(syncMotion);

  /** Re-lays out without animating: a resize or fonts loading. Effects follow through change(). */
  function relayout(): void {
    if (destroyed) return;
    const diff = render(layout(current));
    for (const record of [...diff.changed.map((c) => c.record), ...diff.moved]) runner.change(record.row.geometry, record.row.data);
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
  runner.enter(render(layout(current)).entering.map(input));

  return {
    element: svg,

    async update(next) {
      if (destroyed) return;
      if (next.on !== undefined && next.on !== current.on) throw new TypeError("barChart: `on` can't be changed by update() yet.");
      if (next.motion !== undefined && next.motion !== current.motion) throw new TypeError("barChart: `motion` can't be changed by update() yet.");
      const merged: BarChartOptions<D> = { ...current, ...next };
      checkOptions(merged);
      // Throws on data it can't draw, before anything changes.
      const target = layout(merged);
      if ("colors" in next) colors = toColorAssignment(merged.colors);
      current = merged;
      describeChart(svg, current);
      if (current.dim === false) svg.classList.remove("ec-hovering");
      else if (hovered !== undefined) svg.classList.add("ec-hovering");

      // The order the runner expects: interrupt, then exit / update / enter, then change, then settle.
      runner.interrupt();
      const diff = render(target);
      if (hovered !== undefined && !records.has(hovered)) interaction.clear();
      const exited = runner.exit(diff.exiting.map(input));
      emitEach("exit", diff.exiting);
      runner.update(diff.changed.map(({ record, from }) => ({ ...input(record), from: from.geometry })));
      diff.changed.forEach(({ record, from }, index) =>
        emit("update", { ...input(record), from: from.geometry, batch: { index, count: diff.changed.length } })
      );
      runner.enter(diff.entering.map(input));
      emitEach("enter", diff.entering);
      // A jump is a transition of one frame.
      for (const record of [...diff.changed.map((c) => c.record), ...diff.moved]) runner.change(record.row.geometry, record.row.data);
      runner.settle();

      await exited;
      for (const record of diff.exiting) {
        // Unless it came back meanwhile.
        if (leaving.get(record.key) !== record) continue;
        leaving.delete(record.key);
        record.group.remove();
      }
    },

    on(type, listener) {
      const set = listeners[type] as Set<typeof listener> | undefined;
      if (!set) throw new TypeError(`barChart: unknown event "${String(type)}". Use one of: ${Object.keys(listeners).join(", ")}.`);
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },

    marks: () => order.map((record) => record.row.geometry),

    destroy() {
      if (destroyed) return;
      destroyed = true;
      interaction.destroy();
      runner.destroy();
      unsubscribeMotion();
      observer?.disconnect();
      stopFrame?.();
      fonts?.removeEventListener?.("loadingdone", onFonts);
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

function placeText(element: SVGTextElement, placement: TextPlacement): void {
  setAttributes(element, { x: placement.x, y: placement.y, "text-anchor": placement.anchor });
  if (element.textContent !== placement.text) element.textContent = placement.text;
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

let numberFormat: Intl.NumberFormat | undefined;
function defaultFormat(value: number): string {
  numberFormat ??= new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  return numberFormat.format(value);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

