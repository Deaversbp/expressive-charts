// The effect interfaces. Effects are stateless objects; per-run state lives on the context.

import type { MotionView } from "../motion";
import type { Tween, TweenOptions } from "../tween";
import type { MarkData } from "./data";
import type { Layer, MarkHandle } from "./drawing";
import type { MarkGeometry } from "./geometry";
import type { IconSource } from "./icon";

export interface EffectContext {
  /** Aborted on leave, re-trigger, data update or destroy. */
  readonly signal: AbortSignal;
  readonly motion: MotionView;
  /** A tween with the clock, motion and signal already bound. */
  tween(options: TweenOptions): Tween;
  /** Restyles the mark itself; reset by the runner on clear. */
  readonly mark: MarkHandle;
  /** This run's own overlay group, above the marks; emptied on clear. */
  readonly layer: Layer;
  readonly icons: IconSource;
  /** Position in a multi-mark event, for stagger. */
  readonly batch: { readonly index: number; readonly count: number };
  /** Called when the geometry moves (transitions, resizes, line reveals); unsubscribed on clear. */
  onChange(listener: (mark: MarkGeometry, data?: MarkData) => void): void;
  /** The mark's geometry before this update, on update events. */
  readonly previous?: MarkGeometry;
}

export interface GeometryEffect {
  readonly kind: "geometry";
  /** Resolves when done or cancelled. */
  run(mark: MarkGeometry, ctx: EffectContext): Promise<void>;
  /** Draws the final state immediately, on a fresh context. Used when the effective mode is off. */
  end(mark: MarkGeometry, ctx: EffectContext): void;
  /** Extra cleanup beyond what the runner does. */
  clear(ctx: EffectContext): void;
}

/**
 * `run` and `end` are function-typed properties, not methods, on purpose: TypeScript checks method
 * parameters loosely in both directions, which would let an effect that needs more fields than a
 * chart's rows have (DataEffect<Row & { target: number }> on a chart of Row) slip through.
 */
export interface DataEffect<D = unknown> {
  readonly kind: "data";
  /** Checked when the chart is created, so a missing series throws instead of drawing nothing. */
  readonly needs?: { readonly related?: readonly string[] };
  readonly run: (mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext) => Promise<void>;
  readonly end: (mark: MarkGeometry, data: MarkData<D>, ctx: EffectContext) => void;
  readonly clear: (ctx: EffectContext) => void;
}

/** Morph and future chart-to-chart transitions: from one geometry to another. */
export interface TransitionEffect {
  readonly kind: "transition";
  run(from: MarkGeometry, to: MarkGeometry, ctx: EffectContext): Promise<void>;
  end(from: MarkGeometry, to: MarkGeometry, ctx: EffectContext): void;
  clear(ctx: EffectContext): void;
}

/** What combinators accept: any mark effect, whatever rows it reads. */
export type AnyMarkEffect = GeometryEffect | DataEffect<any>;
export type MarkEffect<D = unknown> = GeometryEffect | DataEffect<D>;

/** The row type a single effect needs; geometry effects need nothing (unknown). */
type RowNeeds<E> = E extends DataEffect<infer D> ? D : unknown;
/**
 * The rows a combination needs: every part's needs at once (an intersection, not a union, so a
 * generic part such as threshold() can't widen a typed part's needs back to unknown).
 */
type AllRowNeeds<E extends readonly unknown[]> = E extends readonly []
  ? unknown
  : E extends readonly [infer First, ...infer Rest]
    ? RowNeeds<First> & AllRowNeeds<Rest>
    : E extends readonly (infer Item)[]
      ? RowNeeds<Item>
      : unknown;

/** What `sequence` and `parallel` return: a data effect if any part is one. */
export type Combined<E extends readonly AnyMarkEffect[]> = [Extract<E[number], { kind: "data" }>] extends [never]
  ? GeometryEffect
  : DataEffect<AllRowNeeds<E>>;
