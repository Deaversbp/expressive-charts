// defineEffect and defineDataEffect: how effects written outside the library are made. They fill in
// the kind and a no-op clear(), check that the effect can run and has an end state, and freeze it,
// since one effect object runs on many marks at once (effects are stateless).

import type { DataEffect, EffectContext, GeometryEffect, MarkData, MarkGeometry } from "../core";

/** What defineEffect takes: a geometry effect without its `kind`, `clear()` optional. */
export interface GeometryEffectSpec {
  /** Animates the mark; resolves when done or cancelled (ctx.signal aborted). */
  run(mark: MarkGeometry, ctx: EffectContext): Promise<void>;
  /** Draws the state a full run ends in, at once. Reduced motion shows only this. */
  end(mark: MarkGeometry, ctx: EffectContext): void;
  /** Cleanup beyond the runner's own (it empties the layer and resets the mark anyway). */
  clear?(ctx: EffectContext): void;
}

/**
 * What defineDataEffect takes: a data effect without its `kind`, `clear()` optional. As on
 * DataEffect, the functions are properties rather than methods, so the row type is checked strictly:
 * methods would let a spec that reads fields `D` doesn't have through.
 */
export interface DataEffectSpec<D> {
  /** Series the effect reads through data.related(), checked when a chart is created. */
  readonly needs?: { readonly related?: readonly string[] };
  readonly run: (mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext) => Promise<void>;
  readonly end: (mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext) => void;
  readonly clear?: (ctx: EffectContext) => void;
}

const nothing = (): void => {};

/**
 * A geometry effect from its `run` and `end`: `kind` is filled in and `clear` defaults to doing
 * nothing. Only `run`, `end` and `clear` are kept, and the effect is frozen. A spec without `run` or
 * `end` functions throws a TypeError: every effect needs an end state, since reduced motion shows
 * only that.
 */
export function defineEffect(spec: GeometryEffectSpec): GeometryEffect {
  check("defineEffect", spec);
  const effect: GeometryEffect = { kind: "geometry", run: spec.run, end: spec.end, clear: spec.clear ?? nothing };
  return Object.freeze(effect);
}

/**
 * A data effect from its `run` and `end`, which also get the mark's data (`MarkData<D>`): its row,
 * values along the walk, related series and the values before an update. `needs.related` lists the
 * series it reads through `data.related()`, so a chart without them throws when it's created.
 * Otherwise as defineEffect.
 */
export function defineDataEffect<D = unknown>(spec: DataEffectSpec<D>): DataEffect<D> {
  check("defineDataEffect", spec);
  const needs = checkNeeds(spec.needs);
  const effect: DataEffect<D> = { kind: "data", ...(needs ? { needs } : {}), run: spec.run, end: spec.end, clear: spec.clear ?? nothing };
  return Object.freeze(effect);
}

function check(name: string, spec: unknown): void {
  if (typeof spec !== "object" || spec === null) throw new TypeError(`${name} needs a spec object { run, end }, got ${spec === null ? "null" : typeof spec}.`);
  const { run, end, clear } = spec as Record<string, unknown>;
  if (typeof run !== "function") throw new TypeError(`${name}: run must be a function that animates the mark, got ${typeof run}.`);
  if (typeof end !== "function") {
    throw new TypeError(`${name}: end must be a function that draws the final state, got ${typeof end}. Every effect needs one: reduced motion shows only end states.`);
  }
  if (clear !== undefined && typeof clear !== "function") throw new TypeError(`${name}: clear must be a function if it's given, got ${typeof clear}.`);
}

/** A copy of `needs`, frozen, or undefined when it names no series. */
function checkNeeds(needs: unknown): DataEffect["needs"] {
  if (needs === undefined) return undefined;
  const related = typeof needs === "object" && needs !== null ? (needs as { related?: unknown }).related : undefined;
  const valid = typeof needs === "object" && needs !== null && (related === undefined || (Array.isArray(related) && related.every((s) => typeof s === "string" && s !== "")));
  if (!valid) throw new TypeError(`defineDataEffect: needs must be { related: [series names] }, got ${JSON.stringify(needs) ?? String(needs)}.`);
  return related === undefined ? undefined : Object.freeze({ related: Object.freeze([...(related as string[])]) });
}
