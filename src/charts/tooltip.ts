// The chart's tooltip: an HTML box beside the hovered or focused mark, placed from the mark's bounds
// and centre, or at a point, such as a crosshair over the points it crosses. The box is aria-hidden, so it isn't read twice: each mark's aria-label has the values,
// and its accessible description is `markDescription`'s text or, by default, a tooltip function's.
// Its text is only ever set as text, never parsed as HTML, so a tooltip function can't inject markup.
// While it shows it takes the pointer, so it can be hovered (WCAG 1.4.13): beside a mark, a clear
// bridge spans the gap to the mark, so the pointer can cross from one to the other. One that comes up
// under a pointer that didn't move onto it lets the pointer through until the pointer is off it.

import { matrix, type Matrix, type MarkGeometry, type MotionView } from "../core";
import { report } from "../core/report";
import { svgElement } from "./render/svg";

/** The `tooltip` option: on (the default text), off, or a function giving a row's text, given a line chart's point's series too. */
export type TooltipOption<D> = boolean | ((d: D, point?: { readonly series: string }) => string);

/** What a tooltip's text is for: a row and, for one series' point at it, that series. Its text is kept by this object. */
export interface TooltipRow {
  readonly datum: unknown;
  readonly series?: string;
}

/** Plain text (a function's, with "\n" for line breaks), or a bold title over lines. */
export type TooltipContent = string | { readonly title: string; readonly lines: readonly string[] };

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** What the box is placed against, in the chart box's px: the x to centre on, and the mark's top and bottom edges. */
export interface TooltipAnchor {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

/** A point the box is placed at instead of a mark, in the <svg>'s viewBox units: the x to centre on, and the top and bottom to keep clear. */
export interface TooltipPoint {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

export interface TooltipPlacement {
  /** The box's top-left corner, in the chart box's px. */
  readonly x: number;
  readonly y: number;
  readonly side: "above" | "below";
}

export interface Tooltip {
  /**
   * Shows the tooltip beside `mark` (in the <svg>'s viewBox units), or moves it there. `transform` is
   * an effect's transform on the mark, which the tooltip follows. Its text is worked out again only
   * when `row` or the option changes: the default `summary`, a function's result, or nothing with
   * `tooltip: false`.
   */
  show(mark: MarkGeometry, row: TooltipRow, summary: () => TooltipContent, transform?: Matrix): void;
  /**
   * Shows the tooltip at `point` instead of beside a mark, or moves it there: centred on its x, above
   * its top or, without room there, below its bottom. A line chart's crosshair gives its x and the
   * highest and lowest points it crosses. The text is worked out as show()'s is.
   */
  showAt(point: TooltipPoint, row: TooltipRow, summary: () => TooltipContent): void;
  /**
   * Gives the mark's `element` its accessible description for `row` (aria-describedby, to a <desc>
   * inside it): `markDescription`'s text when it's a function, nothing when it's false, and otherwise
   * a tooltip function's text, so what a custom tooltip adds beyond the values reaches screen readers.
   * The default tooltip text says nothing the mark's aria-label doesn't, so it describes nothing.
   */
  describe(element: SVGElement, row: TooltipRow): void;
  /**
   * The tooltip while it shows, or undefined: its layer, holding the box and, beside a mark, the
   * bridge to it. Both take the pointer.
   */
  element(): HTMLElement | undefined;
  hide(): void;
  destroy(): void;
}

/** Px between the mark and the box, as in the prototype. */
const GAP = 12;
/** Px the bridge reaches into the mark, so no sliver is left between them. */
const OVERLAP = 1;
/** Base ms for showing and hiding: hover feedback. */
const FADE = 100;
/** For description ids, unique in the page. */
let described = 0;

/**
 * Where the box goes: centred on the mark, above it, or below it when there isn't room above. When
 * neither side has room it takes the side with more. `side` picks it instead. It's clamped to the
 * box's left and right edges (to the left edge when it's wider), but never moved over the mark it
 * describes.
 */
export function placeTooltip(anchor: TooltipAnchor, size: Size, box: Size, side?: TooltipPlacement["side"]): TooltipPlacement {
  const above = anchor.top - GAP;
  const below = box.height - anchor.bottom - GAP;
  side ??= size.height <= above || above >= below ? "above" : "below";
  return {
    x: Math.max(0, Math.min(box.width - size.width, anchor.x - size.width / 2)),
    y: side === "above" ? above - size.height : anchor.bottom + GAP,
    side
  };
}

/**
 * The default text: the category, then each series' value in `format` with its label, or its name
 * when it has none ("16 goals · 4 assists"), then the total when there's more than one. A lone value
 * read by a function (its series is "value") goes unnamed unless it's labelled, as in the marks' names.
 * `total: false` leaves the total out, for series that don't add up (goals and xG at one x).
 */
export function summaryContent(
  category: string,
  values: readonly { readonly series: string; readonly label?: string; readonly value: number }[],
  format: (value: number) => string,
  options: { readonly total?: boolean } = {}
): TooltipContent {
  const lone = values.length === 1 && values[0]!.series === "value" && (values[0]!.label ?? "value") === "value";
  const lines = [values.map((v) => (lone ? format(v.value) : `${format(v.value)} ${v.label ?? v.series}`)).join(" · ")];
  if (values.length > 1 && options.total !== false) lines.push(`${format(values.reduce((sum, v) => sum + v.value, 0))} total`);
  return { title: category, lines };
}

/**
 * The tooltip for a chart's <svg>. The box is made the first time it shows, in a positioned layer
 * just after the <svg>, and placed in px from both elements' boxes, so it lands right whatever the
 * page's layout. Showing and hiding fade over `feedback` timing, so they're instant with motion off.
 */
export function chartTooltip<D>(
  svg: SVGSVGElement,
  options: {
    readonly motion: Pick<MotionView, "duration">;
    readonly option: () => TooltipOption<D> | undefined;
    /** The `markDescription` option: a function, false, or unset (a tooltip function's text). */
    readonly description?: () => false | ((d: D) => string) | undefined;
  }
): Tooltip {
  let layer: HTMLDivElement | undefined;
  let box: HTMLDivElement | undefined;
  let bridge: HTMLDivElement | undefined;
  /** Each row's text, and the option it was worked out with: a function is called once per row. */
  let texts = new WeakMap<object, { readonly option: TooltipOption<D> | undefined; readonly content: TooltipContent | undefined }>();
  /** The text the box shows. */
  let rendered: string | undefined;
  /** Where a mouse or pen last was, in client px. */
  let pointer: { readonly x: number; readonly y: number } | undefined;
  /**
   * Whether it came up, or moved, under a pointer that hadn't moved onto it: a crosshair's column
   * reaches it, so it can. Then it lets the pointer through, so it doesn't catch a pointer running
   * along the chart, until the pointer is off it.
   */
  let through = false;
  /** The bridge's trapezoid in the layer's px, while there's one. */
  let shape: Trapezoid | undefined;

  const timing = (element: HTMLElement): void => element.style.setProperty("--ec-hover-duration", `${options.motion.duration(FADE, "feedback")}ms`);

  const shown = (): boolean => box?.classList.contains("ec-tooltip-shown") ?? false;
  /** Whether the pointer is over the box or the bridge. */
  const under = (): boolean => {
    if (!pointer || !box || !layer) return false;
    const { x, y } = pointer;
    const { left, right, top, bottom } = box.getBoundingClientRect();
    if (x > left && x < right && y > top && y < bottom) return true;
    if (!shape) return false;
    const origin = layer.getBoundingClientRect();
    return inside(shape, x - origin.left, y - origin.top);
  };
  const letThrough = (on: boolean): void => {
    through = on;
    layer?.classList.toggle("ec-tooltip-through", on);
  };
  /** The document's pointer, heard before the chart hears it. */
  const track = (event: PointerEvent): void => {
    pointer = event.pointerType === "touch" ? undefined : { x: event.clientX, y: event.clientY };
    if (through && !under()) letThrough(false);
  };

  svg.ownerDocument.addEventListener("pointerover", track, true);
  svg.ownerDocument.addEventListener("pointermove", track, true);

  /** The box, in its layer just after the <svg>, with the bridge after it. */
  function made(): HTMLDivElement {
    if (!layer || !box || !bridge) {
      const doc = svg.ownerDocument;
      layer = doc.createElement("div");
      layer.className = "ec-tooltip-layer";
      box = doc.createElement("div");
      box.className = "ec-tooltip";
      box.setAttribute("aria-hidden", "true");
      bridge = doc.createElement("div");
      bridge.className = "ec-tooltip-bridge";
      bridge.setAttribute("aria-hidden", "true");
      layer.append(box, bridge);
    }
    if (layer.previousSibling !== svg) svg.after(layer);
    return box;
  }

  function contentFor(row: TooltipRow, summary: () => TooltipContent): TooltipContent | undefined {
    const option = options.option();
    const known = texts.get(row);
    if (known && known.option === option) return known.content;
    const content = text(option, row.datum as D, summary, row.series);
    texts.set(row, { option, content });
    return content;
  }

  function hide(): void {
    if (!box) return;
    timing(box);
    box.classList.remove("ec-tooltip-shown");
    letThrough(false);
  }

  /**
   * Shows the box with `row`'s text, placed against `anchor`: it turns viewBox units into the chart
   * box's px with `toPx`, at rest or, with `moved`, as an effect has moved the mark. An anchor with a
   * left and right edge is a mark, and gets a bridge.
   */
  function place(row: TooltipRow, summary: () => TooltipContent, anchor: (toPx: ToPx, moved: boolean) => Anchored, moved: boolean): void {
    const content = contentFor(row, summary);
    if (content === undefined) {
      hide();
      return;
    }
    const tip = made();
    // The pointer on it, having moved onto it, stays on it wherever it goes.
    const held = shown() && !through && under();
    const key = typeof content === "string" ? `text:${content}` : JSON.stringify(content);
    if (key !== rendered) {
      render(tip, content);
      rendered = key;
    }
    // The <svg> may be scaled to fit its container: its viewBox units become px by its width.
    const view = viewBox(svg);
    const chart = svg.getBoundingClientRect();
    const k = chart.width > 0 && view.width > 0 ? chart.width / view.width : 1;
    const toPx: ToPx = { x: (x) => (x - view.x) * k, y: (y) => (y - view.y) * k };
    const area = chart.width > 0 ? { width: chart.width, height: chart.height } : { width: view.width, height: view.height };
    const size = { width: tip.offsetWidth, height: tip.offsetHeight };
    const near = anchor(toPx, moved);
    // The side is the mark's at rest, so an effect moving it (a wiggle) can't flip the box back and forth.
    const placed = placeTooltip(near, size, area, moved ? placeTooltip(anchor(toPx, false), size, area).side : undefined);
    const origin = layer!.getBoundingClientRect();
    // From the chart box's px to the layer's.
    const dx = chart.left - origin.left;
    const dy = chart.top - origin.top;
    const left = Math.round(dx + placed.x);
    const top = Math.round(dy + placed.y);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.setAttribute("data-side", placed.side);
    const mark = near.left === undefined || near.right === undefined ? undefined : { left: dx + near.left, right: dx + near.right, top: dy + near.top, bottom: dy + near.bottom };
    shape = span(bridge!, { left, top, ...size }, mark, placed.side);
    timing(tip);
    tip.classList.add("ec-tooltip-shown");
    letThrough(!held && under());
  }

  return {
    show(mark, row, summary, transform) {
      const anchor = (toPx: ToPx, moved: boolean): Anchored => {
        const m = moved ? transform : undefined;
        const { x, y, width, height } = mark.bounds;
        const corners = [{ x, y }, { x: x + width, y }, { x, y: y + height }, { x: x + width, y: y + height }].map((corner) => (m ? matrix.apply(m, corner) : corner));
        const xs = corners.map((corner) => corner.x);
        const ys = corners.map((corner) => corner.y);
        const center = m ? matrix.apply(m, mark.center) : mark.center;
        return { x: toPx.x(center.x), top: toPx.y(Math.min(...ys)), bottom: toPx.y(Math.max(...ys)), left: toPx.x(Math.min(...xs)), right: toPx.x(Math.max(...xs)) };
      };
      place(row, summary, anchor, transform !== undefined);
    },
    showAt(point, row, summary) {
      place(row, summary, (toPx) => ({ x: toPx.x(point.x), top: toPx.y(point.top), bottom: toPx.y(point.bottom) }), false);
    },
    describe(element, row) {
      const own = options.description?.();
      let content: TooltipContent | undefined;
      if (own === false) content = undefined;
      else if (typeof own === "function") {
        try {
          const text: unknown = own(row.datum as D);
          content = typeof text === "string" && text !== "" ? text : undefined;
        } catch (error) {
          report(error);
          content = undefined;
        }
      } else content = typeof options.option() === "function" ? contentFor(row, () => "") : undefined;
      let desc = element.querySelector<SVGDescElement>(":scope > desc.ec-description");
      if (typeof content !== "string") {
        if (!desc) return;
        if (element.getAttribute("aria-describedby") === desc.id) element.removeAttribute("aria-describedby");
        desc.remove();
        return;
      }
      desc ??= svgElement("desc", { class: "ec-description", id: `ec-description-${++described}` }, element);
      if (desc.textContent !== content) desc.textContent = content;
      element.setAttribute("aria-describedby", desc.id);
    },
    element: () => (shown() ? layer : undefined),
    hide,
    destroy() {
      svg.ownerDocument.removeEventListener("pointerover", track, true);
      svg.ownerDocument.removeEventListener("pointermove", track, true);
      layer?.remove();
      layer = undefined;
      box = undefined;
      bridge = undefined;
      shape = undefined;
      through = false;
      texts = new WeakMap();
      rendered = undefined;
    }
  };
}

/** A mark's edges in px. */
interface Edges {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** What the box is placed against in the chart box's px and, for a mark, its left and right edges. */
interface Anchored extends TooltipAnchor {
  readonly left?: number;
  readonly right?: number;
}

/** A trapezoid with level top and bottom edges: their y's, and each edge's left and right. */
interface Trapezoid {
  readonly top: number;
  readonly bottom: number;
  readonly upper: { readonly left: number; readonly right: number };
  readonly lower: { readonly left: number; readonly right: number };
}

/** Whether a point is inside a trapezoid, off its edges. */
function inside({ top, bottom, upper, lower }: Trapezoid, x: number, y: number): boolean {
  if (y <= top || y >= bottom) return false;
  const t = (y - top) / (bottom - top);
  return x > upper.left + (lower.left - upper.left) * t && x < upper.right + (lower.right - upper.right) * t;
}

/**
 * Spans the bridge across the gap between the box and `mark`, in the layer's px: a trapezoid from the
 * box's edge to the mark's, a px into it, so the pointer can go straight from one to the other without
 * leaving the hover. It's clear, and takes only the pointer. At a point there's none: a crosshair's
 * target is its whole column, which reaches the box. Gives the trapezoid, if there's one.
 */
function span(bridge: HTMLElement, box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }, mark: Edges | undefined, side: TooltipPlacement["side"]): Trapezoid | undefined {
  bridge.hidden = mark === undefined;
  if (!mark) return undefined;
  const edge = { left: box.left, right: box.left + box.width };
  // The upper edge and the lower one, with their y's.
  const [upper, lower, top, bottom] =
    side === "above" ? [edge, mark, box.top + box.height, Math.round(mark.top + OVERLAP)] : [mark, edge, Math.round(mark.bottom - OVERLAP), box.top];
  const left = Math.round(Math.min(upper.left, lower.left));
  const width = Math.round(Math.max(upper.right, lower.right)) - left;
  const height = Math.max(0, bottom - top);
  const x = (value: number): string => `${Math.round(value) - left}px`;
  bridge.style.left = `${left}px`;
  bridge.style.top = `${top}px`;
  bridge.style.width = `${width}px`;
  bridge.style.height = `${height}px`;
  bridge.style.setProperty("clip-path", `polygon(${x(upper.left)} 0px, ${x(upper.right)} 0px, ${x(lower.right)} ${height}px, ${x(lower.left)} ${height}px)`);
  const round = (edge: { readonly left: number; readonly right: number }) => ({ left: Math.round(edge.left), right: Math.round(edge.right) });
  return { top, bottom: top + height, upper: round(upper), lower: round(lower) };
}

/** None with `false`; a function's text, where an empty string or a throw shows none; otherwise the default. */
function text<D>(option: TooltipOption<D> | undefined, datum: D, summary: () => TooltipContent, series: string | undefined): TooltipContent | undefined {
  if (option === false) return undefined;
  if (typeof option !== "function") return summary();
  try {
    // A line chart's point gives its series too; anything else, the row alone.
    const result = series === undefined ? option(datum) : option(datum, { series });
    return result === undefined || result === null || result === "" ? undefined : String(result);
  } catch (error) {
    report(error);
    return undefined;
  }
}

function render(box: HTMLDivElement, content: TooltipContent): void {
  if (typeof content === "string") {
    box.textContent = content;
    return;
  }
  const doc = box.ownerDocument;
  const line = (value: string, className?: string): HTMLDivElement => {
    const div = doc.createElement("div");
    if (className) div.className = className;
    div.textContent = value;
    return div;
  };
  box.replaceChildren(line(content.title, "ec-tooltip-title"), ...content.lines.map((value) => line(value)));
}

/** Turns viewBox units into px in the chart's box. */
interface ToPx {
  x(x: number): number;
  y(y: number): number;
}

/** The <svg>'s viewBox, or its size from 0, 0 when it has none. */
function viewBox(svg: SVGSVGElement): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const parts = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite)) return { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! };
  return { x: 0, y: 0, width: Number(svg.getAttribute("width")) || 0, height: Number(svg.getAttribute("height")) || 0 };
}
