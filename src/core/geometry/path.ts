// Any SVG path data: read it, move it through a transform, and write it back out, and the outline of
// any shape element as path commands. iconFromSvg reads icons' markup with it, expressive() reads the
// circles and shapes other libraries draw, and a chart switch moves marks' outlines between
// coordinate spaces. What's written is built from numbers only, so nothing from the input passes through.

import type { Matrix } from "../contracts/drawing";
import type { Point } from "../contracts/geometry";
import { formatNumber } from "./path-data";

/** Absolute commands only: H and V become L, S becomes C, T becomes Q. */
export type PathCommand =
  | { readonly op: "M" | "L" | "Z"; readonly to: Point }
  | { readonly op: "C"; readonly c1: Point; readonly c2: Point; readonly to: Point }
  | { readonly op: "Q"; readonly c: Point; readonly to: Point }
  | {
      readonly op: "A";
      readonly rx: number;
      readonly ry: number;
      /** Degrees, as in path data. */
      readonly rotation: number;
      readonly large: boolean;
      readonly sweep: boolean;
      readonly to: Point;
    };

const ARITY: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
/** Separators, then a command letter or a number. Reading stops at anything else. */
const TOKEN = /[\s,]*([A-Za-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
const LETTER = /^[A-Za-z]$/;

/** Reads path data as SVG does: up to the first error, which ends the path. */
export function parsePath(d: string): PathCommand[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(d); match; match = TOKEN.exec(d)) tokens.push(match[1]!);
  const out: PathCommand[] = [];
  let pen: Point = { x: 0, y: 0 };
  let start = pen;
  /** The last command's second control point, which S and T reflect. */
  let control: Point | undefined;
  let command = "";
  let i = 0;

  while (i < tokens.length) {
    if (LETTER.test(tokens[i]!)) command = tokens[i++]!;
    else if (command === "" || command === "Z" || command === "z") break; // numbers with no command
    const upper = command.toUpperCase();
    if (upper === "Z") {
      out.push({ op: "Z", to: start });
      pen = start;
      control = undefined;
      continue;
    }
    const arity = ARITY[upper];
    if (arity === undefined) break;
    const args: number[] = [];
    let flagError = false;
    while (args.length < arity && i < tokens.length && !LETTER.test(tokens[i]!)) {
      const token = tokens[i]!;
      // An arc's flags are one character each, and can run into each other and into the next
      // number: "a1 1 0 0110 10", "A5 5 0 01.5 .5". Anything but 0 or 1 there is an error.
      if (upper === "A" && (args.length === 3 || args.length === 4)) {
        const flag = token[0];
        if (flag !== "0" && flag !== "1") {
          flagError = true;
          break;
        }
        args.push(Number(flag));
        if (token.length > 1) tokens[i] = token.slice(1);
        else i++;
        continue;
      }
      args.push(Number(token));
      i++;
    }
    if (flagError || args.length < arity || !args.every(Number.isFinite)) break;

    const relative = command !== upper;
    const at = (x: number, y: number): Point => (relative ? { x: pen.x + x, y: pen.y + y } : { x, y });
    const [a = 0, b = 0, c = 0, e = 0, f = 0, g = 0, h = 0] = args;
    let next: Point | undefined;
    switch (upper) {
      case "M":
        pen = start = at(a, b);
        out.push({ op: "M", to: pen });
        // Further pairs after a move are lines.
        command = relative ? "l" : "L";
        break;
      case "L":
        out.push({ op: "L", to: (pen = at(a, b)) });
        break;
      case "H":
        out.push({ op: "L", to: (pen = { x: relative ? pen.x + a : a, y: pen.y }) });
        break;
      case "V":
        out.push({ op: "L", to: (pen = { x: pen.x, y: relative ? pen.y + a : a }) });
        break;
      case "C":
      case "S": {
        const smooth = upper === "S";
        const c1 = smooth ? (control && lastIs(out, "C") ? reflect(control, pen) : pen) : at(a, b);
        next = smooth ? at(a, b) : at(c, e);
        out.push({ op: "C", c1, c2: next, to: (pen = smooth ? at(c, e) : at(f, g)) });
        break;
      }
      case "Q":
      case "T": {
        const smooth = upper === "T";
        next = smooth ? (control && lastIs(out, "Q") ? reflect(control, pen) : pen) : at(a, b);
        out.push({ op: "Q", c: next, to: (pen = smooth ? at(a, b) : at(c, e)) });
        break;
      }
      case "A":
        out.push({ op: "A", rx: Math.abs(a), ry: Math.abs(b), rotation: c, large: e !== 0, sweep: f !== 0, to: (pen = at(g, h)) });
        break;
    }
    control = next;
  }
  return out;
}

const lastIs = (commands: readonly PathCommand[], op: PathCommand["op"]): boolean => commands[commands.length - 1]?.op === op;
const reflect = (control: Point, about: Point): Point => ({ x: 2 * about.x - control.x, y: 2 * about.y - control.y });

/** A shape element's attribute by name, as written: an element's getAttribute, or a map's get. */
export type ShapeAttribute = (name: string) => string | null | undefined;

/**
 * A shape element's outline as path commands, in its own coordinates: `<path>`, `<circle>`,
 * `<ellipse>`, `<line>`, `<polyline>`, `<polygon>` or `<rect>`, from its attributes. A shape SVG
 * wouldn't draw (a radius of 0, a polyline of one point) has none, and so does any other tag.
 */
export function shapeOutline(tag: string, attribute: ShapeAttribute): PathCommand[] {
  const num = (name: string): number => {
    const value = Number.parseFloat(attribute(name) ?? "");
    return Number.isFinite(value) ? value : 0;
  };
  switch (tag) {
    case "path":
      return parsePath(attribute("d") ?? "");
    case "circle":
      return ellipse(num("cx"), num("cy"), num("r"), num("r"));
    case "ellipse":
      return ellipse(num("cx"), num("cy"), num("rx"), num("ry"));
    case "line":
      return [
        { op: "M", to: { x: num("x1"), y: num("y1") } },
        { op: "L", to: { x: num("x2"), y: num("y2") } }
      ];
    case "polyline":
    case "polygon": {
      const values = (attribute("points") ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
      const points: Point[] = [];
      for (let i = 0; i + 1 < values.length && Number.isFinite(values[i]) && Number.isFinite(values[i + 1]); i += 2) {
        points.push({ x: values[i]!, y: values[i + 1]! });
      }
      if (points.length < 2) return [];
      const lines = points.map((to, i): PathCommand => ({ op: i === 0 ? "M" : "L", to }));
      // A polyline is a polygon left open: no closing segment, and filled as any open path is.
      return tag === "polygon" ? [...lines, { op: "Z", to: points[0]! }] : lines;
    }
    case "rect":
      return rect(num("x"), num("y"), num("width"), num("height"), attribute);
    default:
      return [];
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number): PathCommand[] {
  if (!(rx > 0 && ry > 0)) return [];
  const arc = (x: number): PathCommand => ({ op: "A", rx, ry, rotation: 0, large: false, sweep: true, to: { x, y: cy } });
  return [{ op: "M", to: { x: cx + rx, y: cy } }, arc(cx - rx), arc(cx + rx), { op: "Z", to: { x: cx + rx, y: cy } }];
}

function rect(x: number, y: number, w: number, h: number, attribute: ShapeAttribute): PathCommand[] {
  if (!(w > 0 && h > 0)) return [];
  const corner = (name: string): number | undefined => {
    const value = Number.parseFloat(attribute(name) ?? "");
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

/** Moves path commands through an affine transform. Arcs stay arcs: their ellipse is transformed too. */
export function transformPath(commands: readonly PathCommand[], m: Matrix): PathCommand[] {
  const p = (point: Point): Point => ({ x: m[0] * point.x + m[2] * point.y + m[4], y: m[1] * point.x + m[3] * point.y + m[5] });
  const mirrored = m[0] * m[3] - m[1] * m[2] < 0;
  return commands.map((command): PathCommand => {
    switch (command.op) {
      case "M":
      case "L":
      case "Z":
        return { op: command.op, to: p(command.to) };
      case "C":
        return { op: "C", c1: p(command.c1), c2: p(command.c2), to: p(command.to) };
      case "Q":
        return { op: "Q", c: p(command.c), to: p(command.to) };
      case "A":
        return { ...command, ...transformEllipse(command, m), sweep: mirrored !== command.sweep, to: p(command.to) };
    }
  });
}

/**
 * The arc's ellipse after the linear part of `m`. With E = M · R(rotation) · diag(rx, ry), the new
 * radii are E's singular values (the square roots of the eigenvalues of E·Eᵀ) and the new rotation
 * is the direction of the larger one's eigenvector.
 */
function transformEllipse({ rx, ry, rotation }: { rx: number; ry: number; rotation: number }, m: Matrix): { rx: number; ry: number; rotation: number } {
  const r = (rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const e11 = (m[0] * cos + m[2] * sin) * rx;
  const e12 = (m[2] * cos - m[0] * sin) * ry;
  const e21 = (m[1] * cos + m[3] * sin) * rx;
  const e22 = (m[3] * cos - m[1] * sin) * ry;
  // E·Eᵀ = [[a, b], [b, c]].
  const a = e11 * e11 + e12 * e12;
  const b = e11 * e21 + e12 * e22;
  const c = e21 * e21 + e22 * e22;
  const mean = (a + c) / 2;
  const spread = Math.hypot((a - c) / 2, b);
  const major = mean + spread;
  const angle = Math.abs(b) < 1e-12 ? (a >= c ? 0 : Math.PI / 2) : Math.atan2(major - a, b);
  return { rx: Math.sqrt(major), ry: Math.sqrt(Math.max(0, mean - spread)), rotation: (angle * 180) / Math.PI };
}

/** Absolute path data with numbers rounded to 0.001 px. */
export function formatPath(commands: readonly PathCommand[]): string {
  const n = formatNumber;
  const pt = (point: Point): string => `${n(point.x)},${n(point.y)}`;
  return commands
    .map((command) => {
      switch (command.op) {
        case "M":
        case "L":
          return `${command.op}${pt(command.to)}`;
        case "C":
          return `C${pt(command.c1)} ${pt(command.c2)} ${pt(command.to)}`;
        case "Q":
          return `Q${pt(command.c)} ${pt(command.to)}`;
        case "A":
          return `A${n(command.rx)},${n(command.ry)} ${n(command.rotation)} ${command.large ? 1 : 0} ${command.sweep ? 1 : 0} ${pt(command.to)}`;
        case "Z":
          return "Z";
      }
    })
    .join("");
}
