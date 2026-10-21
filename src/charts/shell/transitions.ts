// A chart's transitions: one in flight at a time, drawn every frame until its tweens settle, then landed
// exactly on the layout. And an update's change, played through the runner in the order it expects.

import type { Clock, MarkGeometry } from "../../core";
import type { RunInput, Runner } from "../../core/runner";
import type { ChartEvents } from "./events";
import type { ChartHover } from "./hover";
import type { Leave, LeavingMark, LeavingMarks } from "./leaving";

export interface ChartTransitionsOptions {
  readonly clock: Clock;
  readonly runner: Pick<Runner, "settle">;
  readonly leaving: Pick<LeavingMarks<LeavingMark>, "sweep">;
  /** Draws what moved since the last frame. */
  draw(): void;
  /** Draws exactly the layout once a transition settles: the frames in between are computed, this is laid out. */
  land(): void;
}

export interface ChartTransitions {
  /**
   * Draws the first frame of a transition whose tweens, `running`, have just started, then every frame
   * until they've all settled. Resolves when it settles. One still in flight is taken over: its waiters
   * wait for this one instead.
   */
  run(running: readonly Promise<unknown>[]): Promise<void>;
  /** Resolves the latest update()'s promise early: another update() supersedes it. */
  supersede(): void;
  /**
   * The promise update() returns: it resolves once `settled` has and the marks the update removed are
   * gone (their exit effects done), or as soon as another update() supersedes it.
   */
  wait(settled: Promise<void>, leaves: readonly Leave[]): Promise<void>;
  destroy(): void;
}

export function chartTransitions(options: ChartTransitionsOptions): ChartTransitions {
  const { clock } = options;
  /** The transition in flight: resolved when it settles. */
  let transition: { readonly id: number; readonly waiters: readonly (() => void)[] } | undefined;
  let transitions = 0;
  let unfollow: (() => void) | undefined;
  /** Resolves the latest update()'s promise early, when another update() supersedes it. */
  let supersede: (() => void) | undefined;
  let destroyed = false;

  function settle(id: number): void {
    if (destroyed || transition?.id !== id) return;
    const { waiters } = transition;
    transition = undefined;
    unfollow?.();
    unfollow = undefined;
    options.land();
    options.runner.settle();
    options.leaving.sweep();
    for (const resolve of waiters) resolve();
  }

  return {
    run(running) {
      options.draw();
      const id = ++transitions;
      return new Promise<void>((resolve) => {
        transition = { id, waiters: [...(transition?.waiters ?? []), resolve] };
        if (running.length === 0) {
          settle(id);
          return;
        }
        // Subscribed after the tweens just started, so each frame draws once they've all moved.
        unfollow?.();
        unfollow = clock.onFrame(() => options.draw());
        void Promise.all(running).then(() => settle(id));
      });
    },
    supersede: () => supersede?.(),
    wait(settled, leaves) {
      return new Promise<void>((resolve) => {
        supersede = resolve;
        void settled.then(() => Promise.all(leaves.map((leave) => leave.gone))).then(() => resolve());
      });
    },
    destroy() {
      destroyed = true;
      transition = undefined;
      unfollow?.();
      supersede?.();
    }
  };
}

/** What an update changed, in the chart's own mark records. */
export interface ChartDiff<R> {
  readonly entering: R[];
  readonly exiting: R[];
  /** Values changed: update effects run. A move alone (a re-sort, a new scale) isn't a change. */
  readonly changed: { readonly record: R; readonly from: MarkGeometry }[];
}

export interface PlayUpdateOptions<D, R extends LeavingMark> {
  readonly runner: Runner<D>;
  readonly events: ChartEvents<D>;
  readonly hover: Pick<ChartHover, "dropGone" | "sync">;
  readonly leaving: Pick<LeavingMarks<R>, "sweep">;
  /** Where a mark is heading: what enter and update report as a change starts. */
  input(record: R): RunInput<D>;
  /** The mark as it is on screen: what exit reports, so it matches what's on its way out. */
  onScreen(record: R): RunInput<D>;
}

/**
 * Plays an update's change through the runner, in the order it expects: interrupt; `arrange` matches
 * the new layout to the marks; a hover whose mark has left ends; then exit, update and enter, each
 * followed by its events; `announce`; and the tab stop follows its key. The runner then hears change()
 * on every frame, and settle() once the transition settles. Returns the leaves to wait for.
 */
export function playUpdate<D, R extends LeavingMark>(
  options: PlayUpdateOptions<D, R>,
  arrange: () => ChartDiff<R>,
  announce: (diff: ChartDiff<R>) => void
): Leave[] {
  const { runner, events, input, onScreen } = options;
  runner.interrupt();
  const diff = arrange();
  options.hover.dropGone();
  const leaves = diff.exiting.map((record) => record.leave!);
  const exited = runner.exit(diff.exiting.map(onScreen));
  void exited.then(() => {
    for (const leave of leaves) leave.exited = true;
    options.leaving.sweep();
  });
  events.emitEach("exit", diff.exiting, onScreen);
  runner.update(diff.changed.map(({ record, from }) => ({ ...input(record), from })));
  events.emitEach("update", diff.changed, ({ record, from }) => ({ ...input(record), from }));
  runner.enter(diff.entering.map(input));
  events.emitEach("enter", diff.entering, input);
  announce(diff);
  // Focus stayed with its key. If that mark is leaving, focus moves to its nearest neighbour, whose
  // hover the runner holds until the change settles.
  options.hover.sync();
  return leaves;
}
