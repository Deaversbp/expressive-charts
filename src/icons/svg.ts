// iconFromSvg: turns SVG markup into an icon's shapes, keeping only plain drawing. It reads the
// markup as text (no DOM, no parser that could load anything), so it's safe for untrusted input.

import type { Icon, IconShape, Matrix, Point, Rect } from "../core";
import { matrix } from "../core";
import { parseTransform } from "../core/geometry";
import { defineIcon, type IconSpec } from "./define";
import { formatPath, parsePath, transformPath, type PathCommand } from "./path";

/**
 * What iconFromSvg takes besides the markup. `anchor`, `pivot`, `footprint` and `radius` are in the
 * SVG's own units (its viewBox). `size` is the natural length in px: the whole icon is scaled so its
 * box is that wide. Default: the viewBox's width, unscaled.
 */
export type SvgIconSpec = Omit<IconSpec, "shapes" | "box">;

/** Elements whose children are drawn. Every other element that isn't a shape is dropped with its children. */
const CONTAINERS = new Set(["svg", "g", "a"]);
const SHAPES = new Set(["path", "circle", "rect", "ellipse", "line", "polygon"]);
// No part of a tag can contain "<" (XML doesn't allow it in attribute values), so a scan never runs
// past the next tag and unclosed tags can't make matching slow.
const TAG = /<![^<>]*>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/<>]+(?:\s*=\s*(?:"[^"<]*"|'[^'<]*'|[^\s"'<>]+))?)*)\s*(\/?)>/g;
const ATTRIBUTE = /([^\s=/<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g;
/** Plain colours and theme tokens. url() paint servers and anything with quotes or brackets are not kept. */
const COLOR = /^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z][a-zA-Z0-9-]*|(?:rgba?|hsla?)\([\d\s.,%+\-/]*\))$/;

interface Inherited {
  readonly fill: string;
  readonly stroke: string;
  readonly width: number;
  readonly linecap: IconShape["linecap"];
  readonly linejoin: IconShape["linejoin"];
  readonly transform: Matrix;
}

/**
 * Converts `path`, `circle`, `rect`, `ellipse`, `line` and `polygon` elements into shapes, with their
 * fill, stroke, stroke width, line caps and joins (as attributes or in `style`, inherited from `<g>`)
 * and transforms applied. Everything else is dropped: scripts, event handlers, `<use>`, text, images,
 * and what's inside `<defs>`, `<clipPath>` and the like. Gradients, patterns, opacity and CSS classes
 * aren't kept; a shape painted with one falls back to its inherited colour.
 */
export function iconFromSvg(markup: string, spec: SvgIconSpec): Icon {
  if (typeof markup !== "string") throw new TypeError("iconFromSvg needs SVG markup as a string.");
  const label = typeof spec?.name === "string" ? `"${spec.name}"` : "an icon";
  const fail = (problem: string): never => {
    throw new RangeError(`iconFromSvg: ${label} ${problem}.`);
  };

  let box: Rect | undefined;
  let scale = 1;
  const shapes: IconShape[] = [];
  // One entry per open element; undefined while inside something dropped.
  const stack: { readonly tag: string; readonly state: Inherited | undefined }[] = [];
  let root: Inherited | undefined;

  for (const match of withoutComments(markup).matchAll(TAG)) {
    const [, closing, rawTag, rawAttributes = "", selfClosing] = match;
    if (rawTag === undefined) continue; // a doctype
    const tag = rawTag.toLowerCase();
    if (closing) {
      const index = findLast(stack, tag);
      if (index >= 0) stack.length = index;
      continue;
    }
    const attributes = readAttributes(rawAttributes);
    const first = !box && tag === "svg";
    if (first) {
      box = viewBox(attributes) ?? fail("needs a viewBox, or a width and height in px, on its <svg>");
      if (spec.size !== undefined) {
        if (typeof spec.size !== "number" || !(spec.size > 0) || !Number.isFinite(spec.size)) fail(`size must be more than 0, got ${String(spec.size)}`);
        scale = spec.size / box.width;
      }
      root = { fill: "#000000", stroke: "none", width: 1, linecap: undefined, linejoin: undefined, transform: matrix.scale(scale) };
    }
    // Only what's inside the first <svg> is drawn.
    const parent = stack.length > 0 ? stack[stack.length - 1]!.state : first ? root : undefined;
    const state = parent && !hidden(attributes) ? inherit(parent, attributes) : undefined;
    if (state && SHAPES.has(tag)) {
      const shape = toShape(tag, attributes, state);
      if (shape) shapes.push(shape);
    }
    if (!selfClosing) stack.push({ tag, state: CONTAINERS.has(tag) ? state : undefined });
  }

  if (!box) fail("needs an <svg> element");
  if (shapes.length === 0) fail("has nothing to draw: no path, circle, rect, ellipse, line or polygon with a fill or stroke");
  const sized: Rect = { x: box!.x * scale, y: box!.y * scale, width: box!.width * scale, height: box!.height * scale };
  const at = (point: Point): Point => (point && typeof point === "object" ? { x: point.x * scale, y: point.y * scale } : point);
  return defineIcon({
    ...spec,
    shapes,
    box: sized,
    anchor: at(spec.anchor),
    ...(spec.pivot ? { pivot: at(spec.pivot) } : {}),
    ...(Array.isArray(spec.footprint) ? { footprint: [spec.footprint[0] * scale, spec.footprint[1] * scale] as const } : {}),
    ...(typeof spec.radius === "number" ? { radius: spec.radius * scale } : {})
  });
}

/** Removes comments, CDATA sections and processing instructions in one pass; an unclosed one runs to the end. */
function withoutComments(markup: string): string {
  const pairs: readonly (readonly [open: string, close: string])[] = [["<!--", "-->"], ["<![CDATA[", "]]>"], ["<?", "?>"]];
  // Where each kind next opens; found again only once the reading has passed it, so this stays linear.
  const opens = pairs.map(([open]) => markup.indexOf(open));
  let out = "";
  let i = 0;
  for (;;) {
    let kind = -1;
    opens.forEach((at, k) => {
      if (at >= 0 && (kind < 0 || at < opens[kind]!)) kind = k;
    });
    if (kind < 0) return out + markup.slice(i);
    const at = opens[kind]!;
    const close = pairs[kind]![1];
    out += markup.slice(i, at);
    const end = markup.indexOf(close, at + pairs[kind]![0].length);
    if (end < 0) return out;
    i = end + close.length;
    opens.forEach((open, k) => {
      if (open >= 0 && open < i) opens[k] = markup.indexOf(pairs[k]![0], i);
    });
  }
}

function readAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const [, name, double, single, bare] of source.matchAll(ATTRIBUTE)) {
    if (name !== undefined) attributes.set(name, double ?? single ?? bare ?? "");
  }
  // Declarations in `style` win over attributes, as in CSS.
  for (const declaration of (attributes.get("style") ?? "").split(";")) {
    const colon = declaration.indexOf(":");
    if (colon > 0) attributes.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).replace(/!important/i, "").trim());
  }
  return attributes;
}

function viewBox(attributes: Map<string, string>): Rect | undefined {
  const values = (attributes.get("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (values.length === 4 && values.every(Number.isFinite) && values[2]! > 0 && values[3]! > 0) {
    return { x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! };
  }
  const width = pixels(attributes.get("width"));
  const height = pixels(attributes.get("height"));
  return width !== undefined && height !== undefined ? { x: 0, y: 0, width, height } : undefined;
}

function pixels(value: string | undefined): number | undefined {
  const match = /^\s*(\d*\.?\d+(?:e[+-]?\d+)?)\s*(px)?\s*$/i.exec(value ?? "");
  const number = match ? Number(match[1]) : NaN;
  return number > 0 && Number.isFinite(number) ? number : undefined;
}

function hidden(attributes: Map<string, string>): boolean {
  return attributes.get("display")?.trim() === "none" || attributes.get("visibility")?.trim() === "hidden";
}

function inherit(parent: Inherited, attributes: Map<string, string>): Inherited {
  const paint = (name: string, current: string): string => {
    const value = attributes.get(name)?.trim();
    return value !== undefined && COLOR.test(value) && value !== "inherit" ? value : current;
  };
  const width = Number.parseFloat(attributes.get("stroke-width") ?? "");
  const linecap = attributes.get("stroke-linecap")?.trim();
  const linejoin = attributes.get("stroke-linejoin")?.trim();
  const transform = attributes.get("transform");
  return {
    fill: paint("fill", parent.fill),
    stroke: paint("stroke", parent.stroke),
    width: width >= 0 ? width : parent.width,
    linecap: linecap === "butt" || linecap === "round" ? linecap : parent.linecap,
    linejoin: linejoin === "miter" || linejoin === "round" ? linejoin : parent.linejoin,
    transform: transform ? matrix.multiply(parent.transform, parseTransform(transform)) : parent.transform
  };
}

function toShape(tag: string, attributes: Map<string, string>, state: Inherited): IconShape | undefined {
  const fill = state.fill === "none" ? undefined : state.fill;
  const stroke = state.stroke === "none" || !(state.width > 0) ? undefined : state.stroke;
  if (fill === undefined && stroke === undefined) return undefined;
  const commands = outline(tag, attributes);
  if (!commands.some((command) => command.op !== "M")) return undefined;
  const m = state.transform;
  return {
    d: formatPath(transformPath(commands, m)),
    ...(fill !== undefined ? { fill } : {}),
    ...(stroke !== undefined
      ? {
          stroke,
          // A stroke scales with the transform; for an uneven scale this is the average.
          width: round(state.width * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))),
          ...(state.linecap ? { linecap: state.linecap } : {}),
          ...(state.linejoin ? { linejoin: state.linejoin } : {})
        }
      : {})
  };
}

/** The element's outline as path commands, in its own coordinates. */
function outline(tag: string, attributes: Map<string, string>): PathCommand[] {
  const num = (name: string): number => {
    const value = Number.parseFloat(attributes.get(name) ?? "");
    return Number.isFinite(value) ? value : 0;
  };
  switch (tag) {
    case "path":
      return parsePath(attributes.get("d") ?? "");
    case "circle":
      return ellipse(num("cx"), num("cy"), num("r"), num("r"));
    case "ellipse":
      return ellipse(num("cx"), num("cy"), num("rx"), num("ry"));
    case "line":
      return [
        { op: "M", to: { x: num("x1"), y: num("y1") } },
        { op: "L", to: { x: num("x2"), y: num("y2") } }
      ];
    case "polygon": {
      const values = (attributes.get("points") ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
      const points: Point[] = [];
      for (let i = 0; i + 1 < values.length && Number.isFinite(values[i]) && Number.isFinite(values[i + 1]); i += 2) {
        points.push({ x: values[i]!, y: values[i + 1]! });
      }
      if (points.length < 2) return [];
      return [...points.map((to, i): PathCommand => ({ op: i === 0 ? "M" : "L", to })), { op: "Z", to: points[0]! }];
    }
    case "rect":
      return rect(num("x"), num("y"), num("width"), num("height"), attributes);
    default:
      return [];
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number): PathCommand[] {
  if (!(rx > 0 && ry > 0)) return [];
  const arc = (x: number): PathCommand => ({ op: "A", rx, ry, rotation: 0, large: false, sweep: true, to: { x, y: cy } });
  return [{ op: "M", to: { x: cx + rx, y: cy } }, arc(cx - rx), arc(cx + rx), { op: "Z", to: { x: cx + rx, y: cy } }];
}

function rect(x: number, y: number, w: number, h: number, attributes: Map<string, string>): PathCommand[] {
  if (!(w > 0 && h > 0)) return [];
  const corner = (name: string): number | undefined => {
    const value = Number.parseFloat(attributes.get(name) ?? "");
    return value >= 0 ? value : undefined;
  };
  // A missing rx or ry takes the other's value, and both are capped at half the side.
  const rx = Math.min(corner("rx") ?? corner("ry") ?? 0, w / 2);
  const ry = Math.min(corner("ry") ?? corner("rx") ?? 0, h / 2);
  const line = (px: number, py: number): PathCommand => ({ op: "L", to: { x: px, y: py } });
  if (!(rx > 0 && ry > 0)) return [{ op: "M", to: { x, y } }, line(x + w, y), line(x + w, y + h), line(x, y + h), { op: "Z", to: { x, y } }];
  const arc = (px: number, py: number): PathCommand => ({ op: "A", rx, ry, rotation: 0, large: false, sweep: true, to: { x: px, y: py } });
  return [
    { op: "M", to: { x: x + rx, y } },
    line(x + w - rx, y),
    arc(x + w, y + ry),
    line(x + w, y + h - ry),
    arc(x + w - rx, y + h),
    line(x + rx, y + h),
    arc(x, y + h - ry),
    line(x, y + ry),
    arc(x + rx, y),
    { op: "Z", to: { x: x + rx, y } }
  ];
}

function findLast(stack: readonly { readonly tag: string }[], tag: string): number {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.tag === tag) return i;
  return -1;
}

const round = (value: number): number => Math.round(value * 1000) / 1000;
