// The chart's tooltip: an HTML box beside the hovered or focused mark, placed from the mark's bounds
// and centre. The box is aria-hidden, so it isn't read twice: each mark's aria-label has the values,
// and a tooltip function's text is also the mark's accessible description. Its text is only ever set
// as text, never parsed as HTML, so a tooltip function can't inject markup.

import { matrix, type Matrix, type MarkGeometry, type MotionView } from "../core";
import { report } from "../core/report";
import { svgElement } from "./render/svg";

/** The `tooltip` option: on (the default text), off, or a function giving a row's text. */
export type TooltipOption<D> = boolean | ((d: D) => string);

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
  show(mark: MarkGeometry, row: { readonly datum: unknown }, summary: () => TooltipContent, transform?: Matrix): void;
  /**
   * Makes a tooltip function's text for `row` the accessible description of the mark's `element`
   * (aria-describedby, to a <desc> inside it), so what it adds beyond the values reaches screen
   * readers too. The default text says nothing the mark's aria-label doesn't, so it describes nothing.
   */
  describe(element: SVGElement, row: { readonly datum: unknown }): void;
  hide(): void;
  destroy(): void;
}

/** Px between the mark and the box, as in the prototype. */
const GAP = 12;
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
 */
export function summaryContent(category: string, values: readonly { readonly series: string; readonly label?: string; readonly value: number }[], format: (value: number) => string): TooltipContent {
  const lone = values.length === 1 && values[0]!.series === "value" && (values[0]!.label ?? "value") === "value";
  const lines = [values.map((v) => (lone ? format(v.value) : `${format(v.value)} ${v.label ?? v.series}`)).join(" · ")];
  if (values.length > 1) lines.push(`${format(values.reduce((sum, v) => sum + v.value, 0))} total`);
  return { title: category, lines };
}

/**
 * The tooltip for a chart's <svg>. The box is made the first time it shows, in a positioned layer
 * just after the <svg>, and placed in px from both elements' boxes, so it lands right whatever the
 * page's layout. Showing and hiding fade over `feedback` timing, so they're instant with motion off.
 */
export function chartTooltip<D>(svg: SVGSVGElement, options: { readonly motion: Pick<MotionView, "duration">; readonly option: () => TooltipOption<D> | undefined }): Tooltip {
  let layer: HTMLDivElement | undefined;
  let box: HTMLDivElement | undefined;
  /** Each row's text, and the option it was worked out with: a function is called once per row. */
  let texts = new WeakMap<object, { readonly option: TooltipOption<D> | undefined; readonly content: TooltipContent | undefined }>();
  /** The text the box shows. */
  let rendered: string | undefined;

  const timing = (element: HTMLElement): void => element.style.setProperty("--ec-hover-duration", `${options.motion.duration(FADE, "feedback")}ms`);

  function element(): HTMLDivElement {
    if (!layer || !box) {
      const doc = svg.ownerDocument;
      layer = doc.createElement("div");
      layer.className = "ec-tooltip-layer";
      box = doc.createElement("div");
      box.className = "ec-tooltip";
      box.setAttribute("aria-hidden", "true");
      layer.appendChild(box);
    }
    if (layer.previousSibling !== svg) svg.after(layer);
    return box;
  }

  function contentFor(row: { readonly datum: unknown }, summary: () => TooltipContent): TooltipContent | undefined {
    const option = options.option();
    const known = texts.get(row);
    if (known && known.option === option) return known.content;
    const content = text(option, row.datum as D, summary);
    texts.set(row, { option, content });
    return content;
  }

  function hide(): void {
    if (!box) return;
    timing(box);
    box.classList.remove("ec-tooltip-shown");
  }

  return {
    show(mark, row, summary, transform) {
      const content = contentFor(row, summary);
      if (content === undefined) {
        hide();
        return;
      }
      const tip = element();
      const key = typeof content === "string" ? `text:${content}` : JSON.stringify(content);
      if (key !== rendered) {
        render(tip, content);
        rendered = key;
      }
      // The <svg> may be scaled to fit its container: its viewBox units become px by its width.
      const view = viewBox(svg);
      const chart = svg.getBoundingClientRect();
      const k = chart.width > 0 && view.width > 0 ? chart.width / view.width : 1;
      const area = chart.width > 0 ? { width: chart.width, height: chart.height } : { width: view.width, height: view.height };
      const anchor = (m: Matrix | undefined): TooltipAnchor => {
        const { x, y, width, height } = mark.bounds;
        const ys = [{ x, y }, { x: x + width, y }, { x, y: y + height }, { x: x + width, y: y + height }].map((corner) => (m ? matrix.apply(m, corner).y : corner.y));
        const center = m ? matrix.apply(m, mark.center) : mark.center;
        return { x: (center.x - view.x) * k, top: (Math.min(...ys) - view.y) * k, bottom: (Math.max(...ys) - view.y) * k };
      };
      const size = { width: tip.offsetWidth, height: tip.offsetHeight };
      // The side is the mark's at rest, so an effect moving it (a wiggle) can't flip the box back and forth.
      const placed = placeTooltip(anchor(transform), size, area, transform && placeTooltip(anchor(undefined), size, area).side);
      const origin = layer!.getBoundingClientRect();
      tip.style.left = `${Math.round(chart.left - origin.left + placed.x)}px`;
      tip.style.top = `${Math.round(chart.top - origin.top + placed.y)}px`;
      tip.setAttribute("data-side", placed.side);
      timing(tip);
      tip.classList.add("ec-tooltip-shown");
    },
    describe(element, row) {
      const content = typeof options.option() === "function" ? contentFor(row, () => "") : undefined;
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
    hide,
    destroy() {
      layer?.remove();
      layer = undefined;
      box = undefined;
      texts = new WeakMap();
      rendered = undefined;
    }
  };
}

/** None with `false`; a function's text, where an empty string or a throw shows none; otherwise the default. */
function text<D>(option: TooltipOption<D> | undefined, datum: D, summary: () => TooltipContent): TooltipContent | undefined {
  if (option === false) return undefined;
  if (typeof option !== "function") return summary();
  try {
    const result = option(datum);
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

/** The <svg>'s viewBox, or its size from 0, 0 when it has none. */
function viewBox(svg: SVGSVGElement): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const parts = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite)) return { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! };
  return { x: 0, y: 0, width: Number(svg.getAttribute("width")) || 0, height: Number(svg.getAttribute("height")) || 0 };
}
