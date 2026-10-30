// The effect interfaces. Effects are stateless objects; per-run state lives on the context.

import type { MotionView } from "../motion";
import type { Tween, TweenOptions } from "../tween";
import type { MarkData } from "./data";
import type { Layer, MarkHandle, TextStyle } from "./drawing";
import type { MarkGeometry, Rect } from "./geometry";
import type { IconSource } from "./icon";

/**
 * Where effects' text sits on one chart or attachment: one space for every run on its runner, so an
 * effect's text can keep clear of other effects' text. Runs start in the chart's mark order, so text
 * goes past the text of the runs before it, and never moves for the runs after it.
 */
export interface TextSpace {
  /**
   * The box `content` takes drawn with `style`, at the overlay's text size, measured as the chart
   * measures its own text (estimated where there's no layout). Its digits are measured as 0s.
   */
  box(content: string, style: TextStyle): Rect;
  /** The boxes the runs on this runner that started before this one hold now. */
  held(): readonly Rect[];
  /**
   * This run's text is at `box` from now on, until it holds another, holds undefined, or the run is
   * cleared. When it moves, the runs after it that are placed against it hear `onChange` again.
   */
  hold(box: Rect | undefined): void;
}

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
  /**
   * Called when the geometry moves (transitions, resizes, line reveals), and when text held before
   * this run's moved after it was placed (`texts`); unsubscribed on clear.
   */
  onChange(listener: (mark: MarkGeometry, data?: MarkData) => void): void;
  /** The mark's geometry before this update, on update events. */
  readonly previous?: MarkGeometry;
  /** Where effects' text sits on this chart or attachment. Unset means no other text is known. */
  readonly texts?: TextSpace;
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

/**
 * A transition run's context. While a transition plays, both views' marks are hidden, so `mark` does
 * nothing and `onChange` never fires: a resize lands the transition instead.
 */
export interface TransitionContext extends EffectContext {
  /**
   * Where the run begins, from 0 to 1, in the effect's own progress (morph's is the shapes' eased
   * progress). 0 plays it all. A switch back mid-way plays the reverse pair from 1 minus the progress
   * the first had reached, so an effect that honours it retraces; one that ignores it replays from its
   * beginning.
   */
  readonly start: number;
}

/** Morph and future chart-to-chart transitions: from one geometry to another. */
export interface TransitionEffect {
  readonly kind: "transition";
  /** Resolves when done or cancelled, leaving `to`'s end state drawn until cleared. */
  run(from: MarkGeometry, to: MarkGeometry, ctx: TransitionContext): Promise<void>;
  /** Draws the final state immediately, on a fresh context. Used when the effective mode is off. */
  end(from: MarkGeometry, to: MarkGeometry, ctx: TransitionContext): void;
  /** Extra cleanup beyond what the player does. */
  clear(ctx: TransitionContext): void;
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
