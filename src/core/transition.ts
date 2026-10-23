// The transition player: plays a TransitionEffect on pairs of marks, one run per pair, with the
// runner's rules, so transition effects stay small and stateless too. Internal: chartSwitch uses it;
// it isn't part of the public API. Each pair's context is the runner's run scope plus `start`.

import { defaultClock, type Clock } from "./clock";
import type { Layer, MarkHandle } from "./contracts/drawing";
import type { TransitionContext, TransitionEffect } from "./contracts/effect";
import type { MarkGeometry } from "./contracts/geometry";
import type { IconSource } from "./contracts/icon";
import { motion as pageMotion, type Motion, type MotionView } from "./motion";
import { report } from "./report";
import { runScope, type RunScope, type SurfaceGroup } from "./runner";

/** One mark in two views: where it is now and where it goes. Pairs are matched by key, so both have the same one. */
export interface TransitionPair {
  readonly from: MarkGeometry;
  readonly to: MarkGeometry;
}

/** What the player draws on: an overlay above both views. */
export interface TransitionSurface {
  /**
   * A new, empty group for one pair's run, in overlay coordinates. Asked for on the run's first draw,
   * for the pair's key (`to.key`), so "mark" is that key's colour. Stack groups by `order`, the pair's
   * place in the list, lower below higher.
   */
  group(key: string, order: number): SurfaceGroup;
}

export interface TransitionOptions {
  readonly effect: TransitionEffect;
  readonly surface: TransitionSurface;
  /** Where every pair's run begins, from 0 to 1 (`TransitionContext.start`). Default 0. */
  readonly start?: number;
  /** Default: the page-wide motion. The player subscribes, so turning motion off mid-run jumps to end states. */
  readonly motion?: MotionView & Pick<Motion, "subscribe">;
  /** Default: the page-wide clock. */
  readonly clock?: Clock;
  /** Default: no icons. */
  readonly icons?: IconSource;
}

/** A transition playing on its pairs. */
export interface Transition {
  /**
   * Resolves once every pair's run has finished or been cleared. A finished run's end state stays
   * drawn until clear(). Never rejects.
   */
  readonly finished: Promise<void>;
  /** Aborts every run, calls the effect's clear() and empties each group. Later calls do nothing. */
  clear(): void;
}

interface Run {
  readonly pair: TransitionPair;
  readonly index: number;
  readonly scope: RunScope;
  readonly context: TransitionContext;
  /** "ended": run() resolved or end() drew; the drawing stays until cleared. */
  state: "running" | "ended" | "cleared";
  /** Called once, when the run finishes or is cleared. A run replaced by end() hands it on. */
  done: (() => void) | undefined;
}

const NO_ICONS: IconSource = { get: () => undefined };
/** Both views' marks are hidden while a transition plays, so a run's mark handle does nothing. */
const NO_MARK: MarkHandle = { set() {}, reset() {} };
/** Handed out for draws after a run is cleared, so an effect that ignores its signal draws nothing. */
const INERT = { place() {}, update() {}, remove() {} };

/**
 * Plays `effect` from each pair's `from` to its `to`, every run on a context of its own: `signal`,
 * `motion`, `tween()`, a `layer` group, `icons`, `batch` (the pair's place among the pairs) and
 * `start`. Its `mark` does nothing and `onChange` never fires: a resize lands the transition instead.
 *
 * With motion off, `end()` draws on the context instead of `run()`, and motion turning off mid-run
 * replaces each run still going with `end()` on a fresh context. An effect that throws (or whose run
 * rejects) on one pair is reported and that pair is cleared; the others carry on.
 */
export function playTransition(pairs: readonly TransitionPair[], options: TransitionOptions): Transition {
  const { effect, surface } = options;
  if (!isTransitionEffect(effect)) throw new TypeError(`playTransition needs a transition effect (kind "transition" with run, end and clear), got ${describeEffect(effect)}.`);
  const start = options.start ?? 0;
  if (!(typeof start === "number" && start >= 0 && start <= 1)) throw new RangeError(`playTransition: start must be a number from 0 to 1, got ${String(start)}.`);
  const motion = options.motion ?? pageMotion;
  const clock = options.clock ?? defaultClock;
  const icons = options.icons ?? NO_ICONS;
  const count = pairs.length;
  const runs: Run[] = [];
  let cleared = false;
  let waiting = count;
  let resolve!: () => void;
  const finished = new Promise<void>((r) => {
    resolve = r;
  });

  // Runs still going when the effective mode turns off are replaced by end(), as the runner does.
  let unsubscribe: (() => void) | undefined = count > 0 ? motion.subscribe(() => {
    if (motion.mode === "off") endRunning();
  }) : undefined;

  const settled = (): void => {
    if (--waiting > 0) return;
    unsubscribe?.();
    unsubscribe = undefined;
    resolve();
  };

  function begin(pair: TransitionPair, index: number, done: (() => void) | undefined): void {
    const scope: RunScope = runScope({
      clock,
      motion,
      icons,
      batch: { index, count },
      layer: pairLayer(pair.to.key, index, () => run.state !== "cleared"),
      mark: NO_MARK
    });
    const run: Run = { pair, index, scope, context: { ...scope.context, start }, state: "running", done };
    runs[index] = run;

    const { from, to } = pair;
    try {
      if (motion.mode === "off") {
        effect.end(from, to, run.context);
        finish(run);
      } else {
        Promise.resolve(effect.run(from, to, run.context)).then(
          () => finish(run),
          (error: unknown) => fail(run, error)
        );
      }
    } catch (error) {
      fail(run, error);
    }
  }

  function finish(run: Run): void {
    if (run.state !== "running") return;
    run.state = "ended";
    release(run);
  }

  function fail(run: Run, error: unknown): void {
    const { signal } = run.context;
    // A run that rejects because it was aborted isn't broken.
    if (signal.aborted && (error === signal.reason || (error as { name?: unknown } | null)?.name === "AbortError")) return;
    report(error);
    clearRun(run);
  }

  function release(run: Run): void {
    const done = run.done;
    run.done = undefined;
    done?.();
  }

  /** Abort, effect.clear(ctx), then the player's own cleanup: so it happens even if the effect forgets. */
  function clearRun(run: Run): void {
    if (run.state === "cleared") return;
    run.state = "cleared";
    run.scope.abort();
    try {
      effect.clear(run.context);
    } catch (error) {
      report(error);
    }
    run.scope.clear();
    release(run);
  }

  function endRunning(): void {
    for (const run of [...runs]) {
      if (run.state !== "running") continue;
      // The replacement takes the run's place: its group's order and the wait on it.
      const done = run.done;
      run.done = undefined;
      clearRun(run);
      begin(run.pair, run.index, done);
    }
  }

  /** A run's overlay group, made on its first draw. Draws after the run is cleared do nothing. */
  function pairLayer(key: string, order: number, live: () => boolean): Layer & { clear(): void } {
    let group: SurfaceGroup | undefined;
    const target = (): Layer | undefined => (live() ? (group ??= surface.group(key, order)) : undefined);
    return {
      icon: (icon, iconOptions) => target()?.icon(icon, iconOptions) ?? INERT,
      path: (d, paint) => target()?.path(d, paint) ?? INERT,
      text: (content, style) => target()?.text(content, style) ?? INERT,
      clear() {
        const drawn = group;
        group = undefined;
        drawn?.clear();
      }
    };
  }

  pairs.forEach((pair, index) => begin(pair, index, settled));
  if (count === 0) resolve();

  return {
    finished,
    clear() {
      if (cleared) return;
      cleared = true;
      for (const run of [...runs]) clearRun(run);
    }
  };
}

/** True for a transition effect with run, end and clear. */
export function isTransitionEffect(value: unknown): value is TransitionEffect {
  if (typeof value !== "object" || value === null) return false;
  const effect = value as Partial<Record<"kind" | "run" | "end" | "clear", unknown>>;
  return effect.kind === "transition" && typeof effect.run === "function" && typeof effect.end === "function" && typeof effect.clear === "function";
}

function describeEffect(value: unknown): string {
  if (typeof value !== "object" || value === null) return value === null ? "null" : typeof value;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "geometry" || kind === "data") return `a ${kind} effect, which plays on one mark: put it in a chart's \`on\` option`;
  if (kind === "transition") return "a transition effect without run(), end() and clear()";
  return kind === undefined ? "an object with no kind" : `an effect of kind ${JSON.stringify(kind)}`;
}
