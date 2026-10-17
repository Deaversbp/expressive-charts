// Measures the path data the geometry module writes (absolute M, L, A and Z), with no DOM.

import type { Point } from "../contracts/geometry";

export interface PathCommand {
  readonly op: "M" | "L" | "A" | "Z";
  readonly args: readonly number[];
}

export interface MeasuredPath {
  readonly commands: readonly PathCommand[];
  /** Total drawn length, closing lines included. */
  readonly length: number;
  readonly start: Point | undefined;
  /** Where the pen ends up. */
  readonly end: Point | undefined;
  /** Every point the pen moves to, in order. */
  readonly points: readonly Point[];
}

const ARITY = { M: 2, L: 2, A: 7, Z: 0 } as const;

export function measurePath(d: string): MeasuredPath {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const commands: PathCommand[] = [];
  for (let i = 0; i < tokens.length; ) {
    const op = tokens[i++]!;
    if (!(op in ARITY)) throw new SyntaxError(`measurePath: unsupported command "${op}" in "${d}".`);
    const arity = ARITY[op as keyof typeof ARITY];
    const args = tokens.slice(i, i + arity).map(Number);
    if (args.length !== arity || args.some(Number.isNaN)) throw new SyntaxError(`measurePath: bad arguments for ${op} in "${d}".`);
    i += arity;
    commands.push({ op: op as PathCommand["op"], args });
  }

  let length = 0;
  let pen: Point | undefined;
  let subpathStart: Point | undefined;
  const points: Point[] = [];
  for (const { op, args } of commands) {
    if (op === "Z") {
      if (pen && subpathStart) length += distance(pen, subpathStart);
      pen = subpathStart;
      if (pen) points.push(pen);
      continue;
    }
    const to = { x: args[args.length - 2]!, y: args[args.length - 1]! };
    if (op === "M") {
      subpathStart = to;
    } else if (!pen) {
      throw new SyntaxError(`measurePath: "${d}" draws before moving.`);
    } else if (op === "L") {
      length += distance(pen, to);
    } else {
      length += arcLength(pen, to, args[0]!, args[3]! === 1);
    }
    pen = to;
    points.push(to);
  }
  return { commands, length, start: points[0], end: pen, points };
}

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Length of a circular arc between two points (radius scaled up if too small, as SVG does). */
function arcLength(from: Point, to: Point, radius: number, large: boolean): number {
  const chord = distance(from, to);
  if (chord === 0) return 0;
  const r = Math.max(radius, chord / 2);
  const small = 2 * Math.asin(Math.min(1, chord / (2 * r)));
  return r * (large ? 2 * Math.PI - small : small);
}
