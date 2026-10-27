// The drawing API's Layer in SVG: one run's overlay group. See src/core/contracts/drawing.ts.

import { matrix, type Icon, type IconHandle, type IconShape, type Layer, type Paint, type PathHandle, type TextHandle, type TextStyle } from "../../core";
import { mergeFields } from "../../core/merge";
import { setAttributes, setStyles, svgElement, transformAttribute } from "./svg";
import { cssColor } from "./theme";

let clipIds = 0;

/** Draws into `group`. Handles keep working on removed elements, so calls after a clear are harmless. */
export function svgLayer(group: SVGGElement): Layer {
  return {
    icon(icon, options) {
      const size = options?.size;
      if (size !== undefined && !(size >= 0)) throw new RangeError(`layer.icon: size must be a non-negative number, got ${String(size)}.`);
      // Hidden until the first place().
      const placed = svgElement("g", { class: "ec-icon", "data-icon": icon.name, visibility: "hidden" }, group);
      // The size rule: scale by size / icon.size about the anchor, in icon space, before place().
      const k = size === undefined || !(icon.size > 0) ? 1 : size / icon.size;
      const body = k === 1 ? placed : svgElement("g", { transform: transformAttribute(matrix.scale(k, k, icon.anchor)) }, placed);
      for (const shape of icon.shapes) drawShape(shape, body);
      const handle: IconHandle = {
        place(transform) {
          setAttributes(placed, { transform: transformAttribute(transform), visibility: undefined });
        },
        remove: () => placed.remove()
      };
      return handle;
    },

    path(d, paint) {
      const element = svgElement("path", { class: "ec-path", d }, group);
      let current: Paint = { ...paint };
      paintPath(element, current);
      const handle: PathHandle = {
        update(next, nextPaint) {
          element.setAttribute("d", next);
          if (nextPaint) {
            current = mergeFields(current, nextPaint);
            paintPath(element, current);
          }
        },
        remove: () => element.remove()
      };
      return handle;
    },

    text(content, style) {
      const element = svgElement("text", { class: "ec-text" }, group);
      element.textContent = content;
      let current: TextStyle = { ...style };
      styleText(element, current);
      const handle: TextHandle = {
        update(nextStyle, nextContent) {
          current = mergeFields(current, nextStyle);
          styleText(element, current);
          if (nextContent !== undefined) element.textContent = nextContent;
        },
        remove: () => element.remove()
      };
      return handle;
    }
  };
}

/**
 * One path per shape. Unset fill or stroke draws none; the width is in icon units, so it scales with the icon.
 * The fill rule and opacity are SVG's own, so unset ones are left to SVG's defaults: nonzero, and 1.
 */
function drawShape(shape: IconShape, parent: SVGGElement): void {
  let clip: string | undefined;
  if (shape.clip !== undefined) {
    // userSpaceOnUse (the default) puts the clip path in the shape's own space: icon space.
    clip = `ec-clip-${++clipIds}`;
    const clipPath = svgElement("clipPath", { id: clip }, parent);
    svgElement("path", { d: shape.clip }, clipPath);
  }
  const element = svgElement(
    "path",
    {
      d: shape.d,
      "clip-path": clip && `url(#${clip})`,
      "stroke-width": shape.stroke === undefined ? undefined : (shape.width ?? 1),
      "stroke-linecap": shape.linecap,
      "stroke-linejoin": shape.linejoin,
      "fill-rule": shape.fillRule,
      opacity: shape.opacity
    },
    parent
  );
  setStyles(element, {
    // SVG's default fill is black, so "none" is set explicitly.
    fill: shape.fill === undefined ? "none" : cssColor(shape.fill),
    stroke: shape.stroke === undefined ? undefined : cssColor(shape.stroke)
  });
}

/** Overlay paths are unfilled unless a fill is given. */
function paintPath(element: SVGPathElement, paint: Paint): void {
  setAttributes(element, {
    "stroke-width": paint.stroke === undefined ? undefined : (paint.width ?? 1),
    opacity: paint.opacity,
    "stroke-linecap": paint.linecap,
    "stroke-linejoin": "round"
  });
  setStyles(element, {
    fill: paint.fill === undefined ? "none" : cssColor(paint.fill),
    stroke: paint.stroke === undefined ? undefined : cssColor(paint.stroke)
  });
}

function styleText(element: SVGTextElement, style: TextStyle): void {
  setAttributes(element, { x: style.at.x, y: style.at.y, "text-anchor": style.anchor ?? "start", opacity: style.opacity });
  setStyles(element, { fill: cssColor(style.color ?? "text") });
}
