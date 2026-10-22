// The drawing API's MarkHandle in SVG: effects restyle a mark through it (transform, opacity, emphasis,
// halo). The runner merges every live run's style before calling it.

import type { MarkHandle, MarkStyle } from "../../core";
import { mergeFields } from "../../core/merge";
import { maskedHalo } from "./outside";
import { setAttributes, setStyles, svgElement, transformAttribute } from "./svg";
import { cssColor, type SeriesColors } from "./theme";

/** One part of a mark: a filled bar segment or slice, or a stroked line. */
export interface StyledPart {
  readonly element: SVGPathElement;
  /** The part's outline, which the halo follows. */
  readonly d: string;
  readonly colors: SeriesColors;
  /** False for parts too short to see (a zero value): they get no halo. */
  readonly visible: boolean;
  /**
   * For an open outline (a line), which is stroked rather than filled: the stroke's width. Emphasis
   * then mixes the stroke's colour, and the halo is stroked behind it this much wider than its own
   * width, so as much of it shows on each side as round a closed mark.
   */
  readonly open?: { readonly width: number };
}

/** What a style applies to: the mark's body group (it moves with `transform`) and its parts. */
export interface StyleTarget {
  readonly body: SVGGElement;
  readonly parts: readonly StyledPart[];
}

export interface SvgMarkHandleOptions {
  /**
   * Where halos go instead of behind the mark: a group above the marks, where each is masked to
   * outside its mark (render/outside.ts). For marks that touch, such as slices, so a halo shows evenly
   * on every side instead of under the neighbour drawn after it.
   */
  readonly halos?: () => SVGGElement | undefined;
}

export interface SvgMarkHandle extends MarkHandle {
  readonly style: MarkStyle;
  /** Applies the current style again, after the mark was redrawn (new parts or outlines). */
  repaint(): void;
}

/**
 * - `transform` is in chart space, on the body, so labels and the hit area stay put.
 * - `opacity` is on the body; it multiplies with the built-in hover dimming.
 * - `emphasis` mixes each part's colour toward its strong colour, without the CSS hover transition
 *   (effects animate it themselves): its fill, or an open part's stroke.
 * - `halo` strokes each visible part's outline behind the mark: `width` is the stroke width, so half
 *   of it shows outside the mark. An open part's halo is its own width wider, with round caps, so it
 *   goes round the line's ends too. With `halos`, it's drawn there instead, masked to outside the mark
 *   (outside an open part's stroke).
 */
export function svgMarkHandle(target: () => StyleTarget | undefined, options: SvgMarkHandleOptions = {}): SvgMarkHandle {
  let style: MarkStyle = {};
  let halo: SVGGElement | undefined;
  const above = options.halos && maskedHalo();

  const repaint = (): void => {
    const current = target();
    if (!current) return;
    const { body, parts } = current;
    setAttributes(body, {
      transform: style.transform && transformAttribute(style.transform),
      opacity: style.opacity
    });
    const emphasis = style.emphasis;
    for (const part of parts) {
      setStyles(part.element, {
        [part.open ? "stroke" : "fill"]: emphasis === undefined ? undefined : mix(part.colors, emphasis),
        transition: emphasis === undefined ? undefined : "none"
      });
    }
    paintHalo(body, parts);
  };

  const paintHalo = (body: SVGGElement, parts: readonly StyledPart[]): void => {
    const spec = style.halo;
    if (above) {
      const visible = parts.flatMap((part) => (part.visible ? [{ d: part.d, color: part.colors.color, ...(part.open ? { stroke: part.open.width } : {}) }] : []));
      above.paint(options.halos?.(), visible, spec, style.transform);
      return;
    }
    if (!spec) {
      halo?.remove();
      halo = undefined;
      return;
    }
    if (!halo || halo.parentNode !== body) {
      halo?.remove();
      halo = svgElement("g", { class: "ec-halo" }, body);
      body.insertBefore(halo, body.firstChild);
    }
    const visible = parts.filter((part) => part.visible);
    while (halo.childElementCount > visible.length) halo.lastElementChild?.remove();
    visible.forEach((part, index) => {
      const path = (halo!.children[index] as SVGPathElement | undefined) ?? svgElement("path", { "stroke-linejoin": "round" }, halo);
      setAttributes(path, {
        d: part.d,
        "stroke-width": spec.width + (part.open?.width ?? 0),
        "stroke-opacity": spec.opacity,
        "stroke-linecap": part.open ? "round" : undefined
      });
      setStyles(path, { fill: "none", stroke: spec.color === undefined ? part.colors.color : cssColor(spec.color) });
    });
  };

  return {
    get style() {
      return style;
    },
    set(next) {
      style = mergeFields(style, next);
      repaint();
    },
    reset() {
      style = {};
      repaint();
    },
    repaint
  };
}

function mix(colors: SeriesColors, emphasis: number): string {
  const amount = Math.min(1, Math.max(0, emphasis));
  if (amount === 0) return colors.color;
  if (amount === 1) return colors.strong;
  return `color-mix(in srgb, ${colors.strong} ${Math.round(amount * 1000) / 10}%, ${colors.color})`;
}
