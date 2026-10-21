// Combinators: small effects put together. Every part shares the run's context (its layer, mark
// handle and signal), and a combination is a data effect when any part is one.

import type { AnyMarkEffect, Combined, DataEffect, EffectContext, GeometryEffect, MarkData, MarkGeometry } from "../core";
import { describeValue, isMarkEffect } from "../core/registry";

/**
 * Runs the parts one after another. An abort stops the chain, and `end()` draws every part's end
 * state in order. A part with nothing to do (a travel along a missing segment) finishes at once, so
 * one sequence tells the whole story whatever the chart shows.
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

/** Runs the effect only on matching marks: a key, a series name, or a predicate. Elsewhere it does nothing. */
export function only<E extends AnyMarkEffect>(filter: string | ((mark: MarkGeometry) => boolean), effect: E): E {
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
    return filtered as unknown as E;
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
  return filtered as E;
}

type Start = (part: AnyMarkEffect) => Promise<void>;

/** Builds the combination's effect object, of the kind its parts make it. */
function combine<E extends readonly AnyMarkEffect[]>(parts: readonly AnyMarkEffect[], play: (start: Start, ctx: EffectContext) => Promise<void>): Combined<E> {
  const starter = (mark: MarkGeometry, data: MarkData<unknown> | undefined, ctx: EffectContext): Start => (part) =>
    part.kind === "data" ? part.run(mark, data!, ctx) : part.run(mark, ctx);
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
