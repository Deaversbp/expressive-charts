// threshold: colours the parts of a mark's walk where its values are below a reference (or above it),
// as the lab's goals line turns red wherever it's under xG. A data effect: it reads the mark's samples
// and, for a series, the related series' samples, and draws along the walk, so it runs on any mark
// that has samples. It's an encoding, not motion: it draws at once and redraws on every change.

import type { Color, DataEffect, EffectContext, MarkData, MarkGeometry, Paint, PathHandle, Sample } from "../core";

export interface ThresholdOptions {
  /**
   * The reference: a constant, or the name of a related series ("xg"), which goes in `needs.related`
   * so a chart without that series throws when it's created.
   */
  readonly compareTo: number | string;
  /** Colour where the mark's values are "below" the reference (default) or "above" it. Equal values aren't coloured. */
  readonly when?: "below" | "above";
  /** A theme token or any CSS colour. Default "negative". */
  readonly color?: Color;
}

/** A walk shorter than this draws nothing. */
const MIN_WALK = 0.5;
/** Values this close, relative to their size, count as equal, so float noise in a sum colours nothing. */
const TIE = 1e-9;
const WHENS: readonly string[] = ["below", "above"];

/**
 * Colours the parts of the walk where the mark's values are below `compareTo` (or above it, with
 * `when: "above"`): one overlay path per run, `mark.slice(t0, t1)` stroked in `color` at the mark's
 * thickness with butt caps, so a coloured part ends exactly at its crossing.
 *
 * - **A constant** is compared with every sample as it is.
 * - **A series** is compared by `at` when every sample of both has a number or a Date there, the
 *   reference interpolated between its samples and nothing coloured outside its range. Otherwise by `t`.
 * - **Crossings** are interpolated linearly in `t` between samples (and between the reference's
 *   samples, where it bends), so they're exact where the walk is straight between samples: our lines,
 *   and a host polyline sampled at its vertices. Along a curve they're approximate; denser samples
 *   narrow the error.
 *
 * It draws at once, with no animation, and redraws on every `onChange`, so it follows a line as it's
 * revealed. Its end state is the same picture, so the colour shows with motion off.
 */
export function threshold(options: ThresholdOptions): DataEffect {
  checkOptions(options);
  const { compareTo } = options;
  const when = options.when ?? "below";
  const color = options.color ?? "negative";

  /** Draws the runs on the mark, and again whenever it or its data change. */
  const follow = (mark: MarkGeometry, data: MarkData, ctx: EffectContext): void => {
    const paths: PathHandle[] = [];
    let latest = data;
    const draw = (current: MarkGeometry): void => {
      const parts = current.length >= MIN_WALK ? runs(latest.samples, reference(compareTo, latest), when) : [];
      const paint: Paint = { stroke: color, width: current.thickness, linecap: "butt" };
      parts.forEach(([t0, t1], i) => {
        const d = current.slice(t0, t1);
        const path = paths[i];
        if (path) path.update(d, paint);
        else paths.push(ctx.layer.path(d, paint));
      });
      for (const path of paths.splice(parts.length)) path.remove();
    };
    ctx.onChange((next, nextData) => {
      latest = nextData ?? latest;
      draw(next);
    });
    draw(mark);
  };

  return {
    kind: "data",
    ...(typeof compareTo === "string" ? { needs: Object.freeze({ related: Object.freeze([compareTo]) }) } : {}),
    run: async (mark, data, ctx) => {
      if (!ctx.signal.aborted) follow(mark, data, ctx);
    },
    end: (mark, data, ctx) => follow(mark, data, ctx),
    clear() {}
  };
}

/** What the mark's values are compared with, along some axis `u`: the samples' `at`, or their `t`. */
interface Reference {
  /** Where a mark's sample sits on the reference's axis. */
  place(sample: Sample): number;
  /** The reference at u, or undefined outside its range. */
  valueAt(u: number): number | undefined;
  /** Where the reference bends, in u: its samples' places. */
  readonly bends: readonly number[];
}

/** The reference for the mark's data, or undefined when the related series is missing. */
function reference(compareTo: number | string, data: MarkData): Reference | undefined {
  if (typeof compareTo === "number") return { place: (sample) => sample.t, valueAt: () => compareTo, bends: [] };
  const related = data.related(compareTo);
  if (!related) return undefined;
  const byAt = data.samples.every((sample) => numeric(sample.at) !== undefined) && related.samples.every((sample) => numeric(sample.at) !== undefined);
  const place = byAt ? (sample: Sample) => numeric(sample.at)! : (sample: Sample) => sample.t;
  const points = related.samples
    .map((sample) => ({ u: place(sample), value: sample.value }))
    .filter((point) => Number.isFinite(point.u))
    .sort((a, b) => a.u - b.u);
  return { place, valueAt: (u) => interpolate(points, u), bends: points.map((point) => point.u) };
}

/** A sample's `at` as a number: a finite number, or a valid Date's time. Labels have none. */
function numeric(at: Sample["at"]): number | undefined {
  const value = typeof at === "number" ? at : at instanceof Date ? at.getTime() : undefined;
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

/** The value at u, linear between the points around it (sorted by u); undefined outside them. */
function interpolate(points: readonly { readonly u: number; readonly value: number }[], u: number): number | undefined {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || u < first.u || u > last.u) return undefined;
  // The first point at u or past it.
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.u < u) lo = mid + 1;
    else hi = mid;
  }
  const b = points[lo]!;
  if (lo === 0 || b.u === u) return b.value;
  const a = points[lo - 1]!;
  return a.value + ((u - a.u) / (b.u - a.u)) * (b.value - a.value);
}

/** A place along the walk, with how far past the reference the mark is there: more than 0 is coloured. */
interface Station {
  readonly t: number;
  /** Undefined where there's no reference or no finite value. */
  readonly past: number | undefined;
}

/**
 * The parts of the walk, as [t0, t1] in order, where the mark's values are past the reference on the
 * `when` side. Between neighbouring stations (the samples, plus the places where the reference bends
 * between them) both are linear in t, so each crossing is where that difference reaches 0.
 */
function runs(samples: readonly Sample[], ref: Reference | undefined, when: "below" | "above"): [number, number][] {
  if (!ref) return [];
  const sign = when === "below" ? 1 : -1;
  const station = (t: number, u: number, value: number): Station => {
    const level = ref.valueAt(u);
    if (level === undefined || !Number.isFinite(level) || !Number.isFinite(value) || !Number.isFinite(t)) return { t, past: undefined };
    const past = sign * (level - value);
    return { t, past: Math.abs(past) <= TIE * Math.max(Math.abs(level), Math.abs(value)) ? 0 : past };
  };

  const stations: Station[] = [];
  samples.forEach((sample, i) => {
    const u = ref.place(sample);
    stations.push(station(sample.t, u, sample.value));
    const next = samples[i + 1];
    if (!next) return;
    // Where the reference bends between this sample and the next, in the order the walk meets them.
    const v = ref.place(next);
    if (u === v || !Number.isFinite(u) || !Number.isFinite(v)) return;
    const shares: number[] = [];
    const { bends } = ref;
    for (let j = firstAbove(bends, Math.min(u, v)); j < bends.length && bends[j]! < Math.max(u, v); j++) shares.push((bends[j]! - u) / (v - u));
    if (v < u) shares.reverse();
    for (const share of shares) {
      stations.push(station(sample.t + share * (next.t - sample.t), u + share * (v - u), sample.value + share * (next.value - sample.value)));
    }
  });

  const parts: [number, number][] = [];
  const add = (t0: number, t1: number): void => {
    const from = clamp(t0);
    const to = clamp(t1);
    if (!(to > from)) return;
    const last = parts[parts.length - 1];
    if (last && last[1] >= from) last[1] = Math.max(last[1], to);
    else parts.push([from, to]);
  };
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1]!;
    const b = stations[i]!;
    if (a.past === undefined || b.past === undefined || !(b.t > a.t)) continue;
    if (a.past > 0 && b.past > 0) add(a.t, b.t);
    else if (a.past > 0) add(a.t, a.t + (b.t - a.t) * (a.past / (a.past - b.past)));
    else if (b.past > 0) add(a.t + (b.t - a.t) * (a.past / (a.past - b.past)), b.t);
  }
  return parts;
}

const clamp = (t: number): number => Math.min(1, Math.max(0, t));

/** The index of the first value more than x, in ascending values. */
function firstAbove(values: readonly number[], x: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function checkOptions(options: ThresholdOptions): void {
  const { compareTo, when, color } = (options ?? {}) as Partial<ThresholdOptions>;
  if (!(typeof compareTo === "string" ? compareTo !== "" : typeof compareTo === "number" && Number.isFinite(compareTo))) {
    throw new RangeError(`threshold: compareTo must be a finite number or a series name, got ${show(compareTo)}.`);
  }
  if (when !== undefined && !WHENS.includes(when)) throw new RangeError(`threshold: when must be "below" or "above", got ${show(when)}.`);
  if (color !== undefined && (typeof color !== "string" || color === "")) {
    throw new RangeError(`threshold: color must be a theme token or a CSS colour, got ${show(color)}.`);
  }
}

const show = (value: unknown): string => (typeof value === "string" ? JSON.stringify(value) : String(value));
