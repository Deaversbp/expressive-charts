// Combinators: small effects put together. Every part shares the run's context (its layer, mark
// handle and signal), and a combination is a data effect when any part is one.

import type { AnyMarkEffect, Combined, DataEffect, EffectContext, GeometryEffect, MarkData, MarkGeometry } from "../core";
import { describeValue, isMarkEffect } from "../core/registry";

/**
 * Runs the parts one after another, each on the geometry and data as they are when it starts, since
 * the mark may move while an earlier part runs (a transition, a line being revealed). An abort stops
 * the chain, and `end()` draws every part's end state in order. A part with nothing to do (a travel
 * along a missing segment) finishes at once, so one sequence tells the whole story whatever the chart
 * shows.
 */
export function sequence<E extends readonly AnyMarkEffect[]>(...effects: E): Combined<E> {
  const parts = check("sequence", effects);
  return combine<E>(parts, async (start, ctx) => {
    for (const part of parts) {
      if (ctx.signal.aborted) return;
      await start(part);
    }
  });
}

/** Runs the parts together and finishes when they all have. `end()` draws every part's end state, in order. */
export function parallel<E extends readonly AnyMarkEffect[]>(...effects: E): Combined<E> {
  const parts = check("parallel", effects);
  return combine<E>(parts, async (start) => {
    await Promise.all(parts.map(start));
  });
}

/**
 * What `only` and `stagger` return: a new effect of the same kind, needing the same rows. Only the
 * effect interface is kept, not any other members the effect has.
 */
type Filtered<E extends AnyMarkEffect> = E extends DataEffect<infer D> ? DataEffect<D> : GeometryEffect;

/** Runs the effect only on matching marks: a key, a series name, or a predicate. Elsewhere it does nothing. */
export function only<E extends AnyMarkEffect>(filter: string | ((mark: MarkGeometry) => boolean), effect: E): Filtered<E> {
  if (typeof filter !== "string" && typeof filter !== "function") throw new TypeError(`only needs a key, a series name or a predicate, got ${describeValue(filter)}.`);
  const [part] = check("only", [effect]);
  const matches = typeof filter === "string" ? (mark: MarkGeometry) => mark.key === filter || mark.series === filter : filter;
  if (part!.kind === "data") {
    const inner = part as DataEffect<unknown>;
    const filtered: DataEffect<unknown> = {
      kind: "data",
      ...(inner.needs ? { needs: inner.needs } : {}),
      run: (mark, data, ctx) => (matches(mark) ? inner.run(mark, data, ctx) : Promise.resolve()),
      end: (mark, data, ctx) => {
        if (matches(mark)) inner.end(mark, data, ctx);
      },
      clear: (ctx) => inner.clear(ctx)
    };
    return filtered as Filtered<E>;
  }
  const inner = part as GeometryEffect;
  const filtered: GeometryEffect = {
    kind: "geometry",
    run: (mark, ctx) => (matches(mark) ? inner.run(mark, ctx) : Promise.resolve()),
    end(mark, ctx) {
      if (matches(mark)) inner.end(mark, ctx);
    },
    clear: (ctx) => inner.clear(ctx)
  };
  return filtered as Filtered<E>;
}

export interface StaggerOptions {
  /** Base ms between one mark's start and the next's, 0 or more. Default 50. */
  readonly delay?: number;
}

/** Default base delay between marks, ms. */
const STAGGER_DELAY = 50;
/** The last mark of a batch starts at most this long (base ms) after the first. */
const STAGGER_SPREAD = 500;

/**
 * Starts each mark of a batch a little after the one before: mark i waits `i × delay` (base ms,
 * with "stagger" timing, so none at all in analysis or off), then runs the effect. The whole spread
 * is capped at 500 ms base, so a big batch's delay shrinks. A batch of one (a hover) never waits.
 *
 * Never a default: research finds little benefit in staggering, and it can hurt. It keeps the
 * effect's kind and `needs`, and `end()` draws the effect's end state at once.
 */
export function stagger<E extends AnyMarkEffect>(effect: E, options: StaggerOptions = {}): Filtered<E> {
  const [part] = check("stagger", [effect]);
  const delay = options.delay ?? STAGGER_DELAY;
  if (!(typeof delay === "number" && delay >= 0 && Number.isFinite(delay))) {
    throw new RangeError(`stagger: delay must be 0 ms or more, got ${String(delay)}.`);
  }

  /**
   * Waits this mark's turn. The geometry and data may move meanwhile (marks growing in on enter), so
   * it resolves with the latest of each; undefined if the run was aborted while it waited.
   */
  const wait = async <M>(mark: MarkGeometry, data: M, ctx: EffectContext): Promise<Latest<M> | undefined> => {
    if (ctx.signal.aborted) return undefined;
    const { index, count } = ctx.batch;
    const step = count > 1 ? Math.min(delay, STAGGER_SPREAD / (count - 1)) : 0;
    const base = index > 0 ? index * step : 0;
    if (!(base > 0)) return { mark, data };
    const now = follow(mark, data, ctx);
    await ctx.tween({ duration: base, timing: "stagger", update: () => {} }).finished;
    return ctx.signal.aborted ? undefined : now();
  };

  if (part!.kind === "data") {
    const inner = part as DataEffect<unknown>;
    const staggered: DataEffect<unknown> = {
      kind: "data",
      ...(inner.needs ? { needs: inner.needs } : {}),
      run: async (mark, data, ctx) => {
        const turn = await wait(mark, data, ctx);
        if (turn) await inner.run(turn.mark, turn.data, ctx);
      },
      end: (mark, data, ctx) => inner.end(mark, data, ctx),
      clear: (ctx) => inner.clear(ctx)
    };
    return staggered as Filtered<E>;
  }
  const inner = part as GeometryEffect;
  const staggered: GeometryEffect = {
    kind: "geometry",
    async run(mark, ctx) {
      const turn = await wait(mark, undefined, ctx);
      if (turn) await inner.run(turn.mark, ctx);
    },
    end: (mark, ctx) => inner.end(mark, ctx),
    clear: (ctx) => inner.clear(ctx)
  };
  return staggered as Filtered<E>;
}

/** A mark's geometry and data as they are now. */
interface Latest<M> {
  readonly mark: MarkGeometry;
  readonly data: M;
}

/** The geometry and data as they are now: those given, until onChange brings newer ones. */
function follow<M>(mark: MarkGeometry, data: M, ctx: EffectContext): () => Latest<M> {
  let latest: Latest<M> = { mark, data };
  ctx.onChange((next, nextData) => {
    latest = { mark: next, data: (nextData as M | undefined) ?? latest.data };
  });
  return () => latest;
}

type Start = (part: AnyMarkEffect) => Promise<void>;

/** Builds the combination's effect object, of the kind its parts make it. */
function combine<E extends readonly AnyMarkEffect[]>(parts: readonly AnyMarkEffect[], play: (start: Start, ctx: EffectContext) => Promise<void>): Combined<E> {
  // Each part starts on the latest geometry and data, so a sequence's later parts don't start where the mark was.
  const starter = (mark: MarkGeometry, data: MarkData<unknown> | undefined, ctx: EffectContext): Start => {
    const now = follow(mark, data, ctx);
    return (part) => {
      const { mark: latest, data: values } = now();
      return part.kind === "data" ? part.run(latest, values!, ctx) : part.run(latest, ctx);
    };
  };
  const end = (mark: MarkGeometry, data: MarkData<unknown> | undefined, ctx: EffectContext): void => {
    for (const part of parts) {
      if (part.kind === "data") part.end(mark, data!, ctx);
      else part.end(mark, ctx);
    }
  };
  // Every part gets to clean up, even if one throws; the first error is passed on.
  const clear = (ctx: EffectContext): void => {
    let failure: { error: unknown } | undefined;
    for (const part of parts) {
      try {
        part.clear(ctx);
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure) throw failure.error;
  };

  if (parts.some((part) => part.kind === "data")) {
    const related = [...new Set(parts.flatMap((part) => (part.kind === "data" ? (part.needs?.related ?? []) : [])))];
    const effect: DataEffect<unknown> = {
      kind: "data",
      ...(related.length > 0 ? { needs: { related } } : {}),
      run: (mark, data, ctx) => play(starter(mark, data, ctx), ctx),
      end: (mark, data, ctx) => end(mark, data, ctx),
      clear
    };
    return effect as unknown as Combined<E>;
  }
  const effect: GeometryEffect = {
    kind: "geometry",
    run: (mark, ctx) => play(starter(mark, undefined, ctx), ctx),
    end: (mark, ctx) => end(mark, undefined, ctx),
    clear
  };
  return effect as unknown as Combined<E>;
}

function check(name: string, effects: readonly unknown[]): readonly AnyMarkEffect[] {
  effects.forEach((effect, index) => {
    if (!isMarkEffect(effect)) throw new TypeError(`${name}: part ${index + 1} needs to be a mark effect (kind "geometry" or "data"), got ${describeValue(effect)}.`);
  });
  return [...(effects as readonly AnyMarkEffect[])];
}
