// defineIcon: fills an icon's defaults and checks every field, so effects can rely on all of them.

import type { Icon, IconShape, Point, Rect } from "../core";

/** What defineIcon takes: an Icon whose pivot, footprint and size are optional. */
export type IconSpec = Omit<Icon, "footprint" | "pivot" | "size"> & Partial<Pick<Icon, "footprint" | "pivot" | "size">>;

const GAITS: readonly string[] = ["roll", "step", "slide"];
const LINECAPS: readonly string[] = ["butt", "round"];
const LINEJOINS: readonly string[] = ["miter", "round"];
/** Path data: commands, numbers, separators. Anything else (markup, url(), quotes) is a mistake. */
const PATH_DATA = /^\s*[Mm][MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/;

/**
 * Makes an icon from its parts. Shapes are drawn facing +x, up towards −y, in px at the icon's
 * natural size. Defaults: `pivot` is the anchor, `footprint` reaches from the anchor to the box's
 * edges, `size` is the box's width and `radius` half its height. Bad input throws a RangeError
 * naming the field. The icon and its parts are frozen, since one icon is shared by every run.
 */
export function defineIcon(spec: IconSpec): Icon {
  const name = spec?.name;
  if (typeof name !== "string" || name === "") throw new TypeError(`defineIcon needs a non-empty string name, got ${JSON.stringify(name)}.`);
  const fail = (field: string, problem: string): never => {
    throw new RangeError(`defineIcon: "${name}" ${field} ${problem}.`);
  };
  const finite = (field: string, value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fail(field, `must be a finite number, got ${String(value)}`);
  const positive = (field: string, value: unknown): number => (finite(field, value) > 0 ? (value as number) : fail(field, `must be more than 0, got ${String(value)}`));
  const point = (field: string, value: Point | undefined): Point =>
    value && typeof value === "object" ? freeze({ x: finite(`${field}.x`, value.x), y: finite(`${field}.y`, value.y) }) : fail(field, "must be a point { x, y }");

  if (!Array.isArray(spec.shapes) || spec.shapes.length === 0) fail("shapes", "must be a non-empty array");
  const shapes = spec.shapes.map((shape, i) => checkShape(shape, `shapes[${i}]`, fail, finite));

  const b = spec.box;
  if (!b || typeof b !== "object") fail("box", "must be a rectangle { x, y, width, height }");
  const box: Rect = freeze({ x: finite("box.x", b.x), y: finite("box.y", b.y), width: positive("box.width", b.width), height: positive("box.height", b.height) });

  const anchor = point("anchor", spec.anchor);
  const pivot = spec.pivot === undefined ? anchor : point("pivot", spec.pivot);
  const footprint = spec.footprint ?? [Math.max(0, anchor.x - box.x), Math.max(0, box.x + box.width - anchor.x)];
  if (!Array.isArray(footprint) || footprint.length !== 2) fail("footprint", "must be [behind, ahead]");
  footprint.forEach((reach, i) => {
    if (finite(`footprint[${i}]`, reach) < 0) fail(`footprint[${i}]`, `can't be negative, got ${reach}`);
  });
  const size = spec.size === undefined ? box.width : positive("size", spec.size);
  const radius = spec.radius === undefined ? box.height / 2 : positive("radius", spec.radius);
  if (spec.gait !== undefined && !GAITS.includes(spec.gait)) fail("gait", `must be roll, step or slide, got ${String(spec.gait)}`);
  if (spec.upright !== undefined && typeof spec.upright !== "boolean") fail("upright", `must be true or false, got ${String(spec.upright)}`);

  return freeze({
    name,
    shapes: freeze(shapes),
    box,
    size,
    anchor,
    pivot,
    footprint: freeze([footprint[0], footprint[1]] as const),
    ...(spec.gait !== undefined ? { gait: spec.gait } : {}),
    radius,
    ...(spec.upright !== undefined ? { upright: spec.upright } : {})
  });
}

function checkShape(
  shape: IconShape,
  field: string,
  fail: (field: string, problem: string) => never,
  finite: (field: string, value: unknown) => number
): IconShape {
  if (!shape || typeof shape !== "object") fail(field, "must be a shape { d, fill?, stroke?, … }");
  if (typeof shape.d !== "string" || !PATH_DATA.test(shape.d)) fail(`${field}.d`, "must be path data starting with a move");
  if (shape.clip !== undefined && (typeof shape.clip !== "string" || !PATH_DATA.test(shape.clip))) fail(`${field}.clip`, "must be path data starting with a move");
  for (const paint of ["fill", "stroke"] as const) {
    const value = shape[paint];
    if (value !== undefined && (typeof value !== "string" || value === "")) fail(`${field}.${paint}`, `must be a colour, got ${String(value)}`);
  }
  if (shape.width !== undefined && finite(`${field}.width`, shape.width) < 0) fail(`${field}.width`, `can't be negative, got ${shape.width}`);
  if (shape.linecap !== undefined && !LINECAPS.includes(shape.linecap)) fail(`${field}.linecap`, `must be butt or round, got ${String(shape.linecap)}`);
  if (shape.linejoin !== undefined && !LINEJOINS.includes(shape.linejoin)) fail(`${field}.linejoin`, `must be miter or round, got ${String(shape.linejoin)}`);
  const copy: { -readonly [K in keyof IconShape]: IconShape[K] } = { d: shape.d };
  for (const key of ["fill", "stroke", "width", "linecap", "linejoin", "clip"] as const) {
    if (shape[key] !== undefined) (copy as Record<string, unknown>)[key] = shape[key];
  }
  return freeze(copy);
}

const freeze = <T>(value: T): T => Object.freeze(value);
