// The effect runner: connects a chart's mark events to its effects and owns every run's lifecycle,
// so effects stay small and stateless. Each chart or adapter creates one. Internal: charts and
// adapters use it; it isn't part of the public API. See docs/architecture.md#runner.

import { defaultClock, type Clock } from "./clock";
import type { MarkData } from "./contracts/data";
import type { Layer, MarkHandle, MarkStyle, TextStyle } from "./contracts/drawing";
import type { AnyMarkEffect, EffectContext, MarkEffect, TextSpace } from "./contracts/effect";
import type { MarkGeometry, Rect } from "./contracts/geometry";
import type { IconSource } from "./contracts/icon";
import type { EffectSlot } from "./contracts/slots";
import { mergeFields } from "./merge";
import { motion as pageMotion, type Motion, type MotionView } from "./motion";
import { report } from "./report";
import { estimatedBox } from "./text-box";
import { tween } from "./tween";

type Batch = { readonly index: number; readonly count: number };

// ── One run's context ────────────────────────────────────────────────────────

export interface RunScopeOptions {
  readonly clock: Clock;
  readonly motion: MotionView;
  readonly icons: IconSource;
  readonly layer: Layer & { clear(): void };
  readonly mark: MarkHandle;
  readonly batch: Batch;
  readonly previous?: MarkGeometry | undefined;
  /** The run's view of where effects' text sits. The caller lets go of its box when it's cleared. */
  readonly texts?: TextSpace;
}

/** An EffectContext plus the controls the runner keeps for itself. testContext() is built on it too. */
export interface RunScope {
  readonly context: EffectContext;
  abort(): void;
  /** Calls the run's onChange listeners. */
  change(mark: MarkGeometry, data?: MarkData): void;
  /** The runner's cleanup after effect.clear(ctx): abort, empty the layer, reset the mark, drop onChange listeners. */
  clear(): void;
}

export function runScope(options: RunScopeOptions): RunScope {
  const { clock, motion, layer, mark } = options;
  const controller = new AbortController();
  let listeners: ((mark: MarkGeometry, data?: MarkData) => void)[] = [];

  const context: EffectContext = {
    signal: controller.signal,
    motion,
    mark,
    layer,
    icons: options.icons,
    batch: options.batch,
    ...(options.previous ? { previous: options.previous } : {}),
    ...(options.texts ? { texts: options.texts } : {}),
    tween(tweenOptions) {
      const own = tweenOptions.signal;
      const running = tween({ ...tweenOptions, signal: own ?? controller.signal }, { clock, motion });
      // An effect's own signal doesn't stop the run's signal from cancelling it too.
      if (own && own !== controller.signal) {
        if (controller.signal.aborted) running.cancel();
        else controller.signal.addEventListener("abort", () => running.cancel(), { once: true });
      }
      return running;
    },
    onChange(listener) {
      listeners.push(listener);
    }
  };

  return {
    context,
    abort() {
      controller.abort();
    },
    change(geometry, data) {
      for (const listener of [...listeners]) listener(geometry, data);
    },
    clear() {
      controller.abort();
      layer.clear();
      mark.reset();
      listeners = [];
    }
  };
}

// ── The runner ───────────────────────────────────────────────────────────────

/** The effects a runner plays, at most one per slot, with preset names already resolved (resolveEffects). */
export type SlotEffects<D = unknown> = { readonly [S in EffectSlot]?: MarkEffect<D> };

/** A mark as the runner sees it. Chart events (MarkEvent) fit as they are. */
export interface RunInput<D = unknown> {
  readonly mark: MarkGeometry;
  readonly data: MarkData<D>;
}

export interface UpdateInput<D = unknown> extends RunInput<D> {
  /** The geometry before this update. Default: the last geometry the runner saw for the key. */
  readonly from?: MarkGeometry;
}

/** One run's overlay group. */
export interface SurfaceGroup extends Layer {
  /**
   * Removes everything drawn in the group. Called once, when the run is cleared; nothing is drawn in
   * the group after that, so it can remove itself. Handles from a cleared group must ignore calls.
   */
  clear(): void;
}

/** What the runner draws on: a chart's or adapter's renderer (SVG today) implements it. */
export interface RunnerSurface {
  /**
   * A new, empty overlay group for one run, above the marks, in chart coordinates. Asked for on the
   * run's first draw, which can come late (a decoration that draws on its first change). Stack groups
   * by `order`, the run's start order, lower below higher, not by when they were asked for.
   */
  group(key: string, slot: EffectSlot, order: number): SurfaceGroup;
  /** The mark's own style handle. The runner merges every live run's style into it. */
  mark(key: string): MarkHandle;
  /**
   * The box `content` takes drawn with `style` in a run's group, for `EffectContext.texts`: measured
   * as the chart measures its own text. Default: estimated from its length.
   */
  box?(content: string, style: TextStyle): Rect;
}

export interface RunnerOptions<D = unknown> {
  readonly effects: SlotEffects<D>;
  readonly surface: RunnerSurface;
  /** Default: the page-wide motion. The runner subscribes, so turning motion off mid-run jumps to end states. */
  readonly motion?: MotionView & Pick<Motion, "subscribe">;
  /** Default: the page-wide clock. */
  readonly clock?: Clock;
  /** Default: no icons. */
  readonly icons?: IconSource;
}

/**
 * Charts call these as things happen; the runner starts, clears and replays runs. A run is one
 * effect playing on one mark for one slot. Every method takes marks by key, as given in their
 * geometry, and is a no-op after destroy().
 */
export interface Runner<D = unknown> {
  /** Marks appeared: starts `decorate` (it stays until the mark exits), then `enter`. */
  enter(marks: readonly RunInput<D>[]): void;
  /**
   * An update started, as its transition starts (docs/architecture.md#events-and-effect-slots says
   * what counts as one). First it ends the `update` runs of the marks not in `marks`, as a re-trigger
   * would, so what the last update explained goes with it. Then it runs `update` on `marks`, the marks
   * whose values changed, with the geometry on screen and the values before: the data each key last
   * rested at, not values part way through a change.
   */
  update(marks: readonly UpdateInput<D>[]): void;
  /**
   * Marks are leaving: clears their other runs and runs `exit`. Resolves when every exit run has
   * finished, been cleared by a re-enter, or the runner is destroyed; then the chart removes them.
   */
  exit(marks: readonly RunInput<D>[]): Promise<void>;
  /** Pointer or focus arrived: runs `hover`. While a transition is in flight it waits until settle(). */
  hover(marks: readonly RunInput<D>[]): void;
  /** Pointer or focus left these marks (default: every hovered mark): clears their hover runs. */
  leave(keys?: readonly string[]): void;
  /**
   * A mark's geometry (or data) changed on screen: every frame of a transition, a resize, a line
   * reveal. Its runs hear it in start order. Charts tell marks in the order they give them to enter()
   * and update(), so text placed again goes past the text before it; text that another mark's text
   * moved past after it was placed is placed again once the chart is done (a microtask).
   */
  change(mark: MarkGeometry, data?: MarkData<D>): void;
  /** A data transition starts: clears hover runs, and holds new hovers until settle(). */
  interrupt(): void;
  /** The last transition settled: replays hover on the marks still hovered or focused. */
  settle(): void;
  /**
   * New effects, as a chart's update({ on }) gives them. A slot whose effect is the same object keeps
   * its runs. A changed slot's runs are cleared and the new effect starts where they were: `decorate`
   * on every mark in `marks`, and `hover` on the marks still hovered (from settle() while a transition
   * is in flight). `enter`, `update` and `exit` draw the new effect's end state on the marks whose runs
   * they replace, in their place, so nothing enters again, an update keeps showing what it explains,
   * and an exit still ends. A slot left empty clears its runs.
   *
   * `marks` are the marks staying through the chart's update, as they're heading, in visual order:
   * the marks entering start theirs with enter(). Their geometry and data start the new runs but
   * aren't taken as the marks' own, so an update() that follows still gets the values before it.
   */
  swap(effects: SlotEffects<D>, marks: readonly RunInput<D>[]): void;
  /** Clears every run and stops following the motion mode. */
  destroy(): void;
}

interface Entry<D> {
  readonly key: string;
  /** The latest geometry and data seen for the key. */
  mark: MarkGeometry;
  data: MarkData<D>;
  /**
   * The data the key last rested at: its last enter() or update() (where it was heading), a change()
   * outside a transition (a resize, a line's reveal), or settle(). An update run's `previous` values,
   * so an update that replaces one still moving counts from the values the last one gave.
   */
  resting: MarkData<D>;
  readonly runs: Map<EffectSlot, Run<D>>;
  /** The merged style last written to the mark's handle. */
  applied: MarkStyle;
  handle: MarkHandle | undefined;
  /** Resolves the exit() promise while the mark is leaving. */
  exiting: (() => void) | undefined;
}

interface Run<D> {
  readonly entry: Entry<D>;
  readonly slot: EffectSlot;
  /**
   * Start order: when two runs set the same style field the later one wins, and later runs' overlay
   * groups stack above. A run replaced by end() when the mode turns off keeps its order.
   */
  readonly order: number;
  readonly effect: AnyMarkEffect;
  readonly data: MarkData<D>;
  readonly batch: Batch;
  readonly previous: MarkGeometry | undefined;
  readonly scope: RunScope;
  /** This run's own style fields. */
  style: MarkStyle;
  /** "ended": run() resolved or end() drew; the run stays live (layer, style, onChange) until cleared. */
  state: "running" | "ended" | "cleared";
  /** Called once, when the run finishes or is cleared (exit() waits on it). */
  done: (() => void) | undefined;
}

interface StartOptions {
  readonly previous?: MarkGeometry | undefined;
  readonly done?: (() => void) | undefined;
  /** Default: the next start order. */
  readonly order?: number | undefined;
  /** Draws the effect's end state, whatever the motion mode. */
  readonly end?: boolean;
  /** The geometry to start on. Default: the latest the runner saw for the key. */
  readonly mark?: MarkGeometry;
}

/** A run's text, as it holds it through `texts`. */
interface Held {
  box: Rect | undefined;
  /** When the run last held a box, and when its box last moved, counted in holds. */
  placed: number;
  moved: number;
}

const SLOTS: readonly EffectSlot[] = ["decorate", "enter", "update", "exit", "hover"];

const byOrder = <D>(a: Run<D>, b: Run<D>): number => a.order - b.order;
const sameBox = (a: Rect | undefined, b: Rect | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

const NO_ICONS: IconSource = { get: () => undefined };
/** Handed out for draws after a run is cleared, so an effect that ignores its signal draws nothing. */
const INERT = { place() {}, update() {}, remove() {} };

export function createRunner<D = unknown>(options: RunnerOptions<D>): Runner<D> {
  const { surface } = options;
  let effects = options.effects;
  const motion = options.motion ?? pageMotion;
  const clock = options.clock ?? defaultClock;
  const icons = options.icons ?? NO_ICONS;
  const entries = new Map<string, Entry<D>>();
  /** Hovered or focused keys, in the order they arrived. */
  const hovered = new Set<string>();
  let transitioning = false;
  let destroyed = false;
  let order = 0;
  const box = (content: string, style: TextStyle): Rect => (surface.box ? surface.box(content, style) : estimatedBox(content, style));
  /**
   * Every run's text, as `texts` holds it. A run that let go stays until the next flush, so the runs
   * after it that were placed against it are placed again.
   */
  const texts = new Map<Run<D>, Held>();
  let holds = 0;
  let flushing = false;

  // The effective mode can turn off mid-run (the device asks for reduced motion, or the viewer picks
  // Off). Runs still going are replaced by end() on a fresh context, so they never finish half-drawn.
  const unsubscribe = motion.subscribe(() => {
    if (motion.mode === "off") endRunning();
  });

  function track(input: RunInput<D>): Entry<D> {
    const key = input.mark.key;
    const entry = entries.get(key);
    if (entry) {
      entry.mark = input.mark;
      entry.data = input.data;
      return entry;
    }
    const created: Entry<D> = { key, mark: input.mark, data: input.data, resting: input.data, runs: new Map(), applied: {}, handle: undefined, exiting: undefined };
    entries.set(key, created);
    return created;
  }

  /** Starts `slot`'s effect on the entry, clearing the slot's current run first. */
  function start(entry: Entry<D>, slot: EffectSlot, data: MarkData<D>, batch: Batch, more: StartOptions = {}): void {
    const { previous, done } = more;
    const effect = effects[slot] as AnyMarkEffect | undefined;
    if (!effect) {
      done?.();
      return;
    }
    const current = entry.runs.get(slot);
    if (current) clearRun(current);

    const run: Run<D> = {
      entry,
      slot,
      order: more.order ?? ++order,
      effect,
      data,
      batch,
      previous,
      style: {},
      state: "running",
      done,
      scope: runScope({
        clock,
        motion,
        icons,
        batch,
        previous,
        layer: runLayer(entry.key, slot, () => run.order, () => run.state !== "cleared"),
        mark: runMark(() => run),
        texts: {
          box,
          held: () => [...texts].flatMap(([other, held]) => (held.box && other.order < run.order ? [held.box] : [])),
          hold(next) {
            if (run.state !== "cleared") hold(run, next);
          }
        }
      })
    };
    entry.runs.set(slot, run);

    const mark = more.mark ?? entry.mark;
    const ctx = run.scope.context;
    try {
      if (more.end || motion.mode === "off") {
        if (effect.kind === "data") effect.end(mark, data, ctx);
        else effect.end(mark, ctx);
        finish(run);
      } else {
        const running = effect.kind === "data" ? effect.run(mark, data, ctx) : effect.run(mark, ctx);
        Promise.resolve(running).then(
          () => finish(run),
          (error: unknown) => fail(run, error)
        );
      }
    } catch (error) {
      fail(run, error);
    }
  }

  function finish(run: Run<D>): void {
    if (run.state !== "running") return;
    run.state = "ended";
    release(run);
  }

  function fail(run: Run<D>, error: unknown): void {
    const { signal } = run.scope.context;
    // A run that rejects because it was aborted isn't broken.
    if (signal.aborted && (error === signal.reason || (error as { name?: unknown } | null)?.name === "AbortError")) return;
    report(error);
    clearRun(run);
  }

  function release(run: Run<D>): void {
    const done = run.done;
    run.done = undefined;
    done?.();
  }

  /** Abort, effect.clear(ctx), then the runner's own cleanup: so it happens even if the effect forgets. */
  function clearRun(run: Run<D>): void {
    if (run.state === "cleared") return;
    run.state = "cleared";
    const { entry } = run;
    if (entry.runs.get(run.slot) === run) entry.runs.delete(run.slot);
    run.scope.abort();
    try {
      run.effect.clear(run.scope.context);
    } catch (error) {
      report(error);
    }
    run.scope.clear();
    hold(run, undefined);
    release(run);
  }

  /** Tells the run its mark moved, with its latest data; a run that throws is reported and cleared. */
  function tell(run: Run<D>, mark: MarkGeometry): void {
    try {
      // An update run keeps the previous values it was given, as when it's replaced by end().
      run.scope.change(mark, latestData(run.entry, run));
    } catch (error) {
      report(error);
      clearRun(run);
    }
  }

  /** The run's text is at `next` now. When it moved, the runs after it placed before it moved are placed again, once the chart has told every mark it's moving. */
  function hold(run: Run<D>, next: Rect | undefined): void {
    let held = texts.get(run);
    if (!held) {
      if (!next) return;
      texts.set(run, (held = { box: undefined, placed: 0, moved: 0 }));
    }
    held.placed = ++holds;
    if (sameBox(held.box, next)) return;
    held.box = next;
    held.moved = holds;
    if (flushing) return;
    flushing = true;
    queueMicrotask(flush);
  }

  /**
   * Places text again where text held before it moved after it was placed: each such run hears
   * onChange, in start order, so it goes past the text before it as that is now. The chart tells marks
   * in its order, which runs on several slots, or on a mark that didn't move, needn't keep.
   */
  function flush(): void {
    let moved = 0;
    for (const [run, held] of [...texts].sort(([a], [b]) => byOrder(a, b))) {
      if (held.box && held.placed < moved) tell(run, run.entry.mark);
      if (!held.box) texts.delete(run);
      moved = Math.max(moved, held.moved);
    }
    flushing = false;
  }

  /** A run's overlay group, created on its first draw. Draws after the run is cleared do nothing. */
  function runLayer(key: string, slot: EffectSlot, order: () => number, live: () => boolean): Layer & { clear(): void } {
    let group: SurfaceGroup | undefined;
    const target = (): Layer | undefined => (live() ? (group ??= surface.group(key, slot, order())) : undefined);
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

  /** A run's view of the mark's style: its own fields, merged with the other live runs' into the real handle. */
  function runMark(own: () => Run<D>): MarkHandle {
    return {
      set(style) {
        const run = own();
        if (run.state === "cleared") return;
        run.style = mergeFields(run.style, style);
        applyStyle(run.entry);
      },
      reset() {
        const run = own();
        if (Object.keys(run.style).length === 0) return;
        run.style = {};
        applyStyle(run.entry);
      }
    };
  }

  /** Writes what changed in the merged style of the entry's live runs (later runs win a field). */
  function applyStyle(entry: Entry<D>): void {
    const runs = [...entry.runs.values()].sort((a, b) => a.order - b.order);
    const next: Record<string, unknown> = Object.assign({}, ...runs.map((run) => run.style));
    const applied = entry.applied as Record<string, unknown>;
    entry.applied = next as MarkStyle;
    if (Object.keys(next).length === 0) {
      if (Object.keys(applied).length > 0) handle(entry).reset();
      return;
    }
    const changes: Record<string, unknown> = {};
    let changed = false;
    for (const field of new Set([...Object.keys(applied), ...Object.keys(next)])) {
      if (applied[field] === next[field]) continue;
      // A field no run sets any more is given as undefined, which resets it.
      changes[field] = next[field];
      changed = true;
    }
    if (changed) handle(entry).set(changes as MarkStyle);
  }

  function handle(entry: Entry<D>): MarkHandle {
    return (entry.handle ??= surface.mark(entry.key));
  }

  /** Clears every run on the entry and drops it; resolves its exit() promise if it was leaving. */
  function forget(entry: Entry<D>): void {
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
    hovered.delete(entry.key);
    const exited = entry.exiting;
    entry.exiting = undefined;
    for (const run of [...entry.runs.values()]) clearRun(run);
    entry.handle = undefined;
    exited?.();
  }

  /** Stops a pending exit (a re-enter, or exit() again) without forgetting the mark. */
  function cancelExit(entry: Entry<D>): void {
    const exited = entry.exiting;
    if (!exited) return;
    entry.exiting = undefined;
    const run = entry.runs.get("exit");
    if (run) clearRun(run);
    exited();
  }

  function endRunning(): void {
    for (const entry of [...entries.values()]) {
      for (const run of [...entry.runs.values()]) {
        if (run.state !== "running" || entry.runs.get(run.slot) !== run) continue;
        // The replacement takes the run's place: its order (style precedence and stacking) and the
        // exit() promise waiting on it.
        const done = run.done;
        run.done = undefined;
        start(entry, run.slot, latestData(entry, run), run.batch, { previous: run.previous, done, order: run.order });
      }
    }
  }

  /** Clears the slot's run on each entry, and returns each order, to start the slot's next run in its place. */
  function clearSlot(slot: EffectSlot): Map<Entry<D>, number> {
    const orders = new Map<Entry<D>, number>();
    for (const entry of [...entries.values()]) {
      const run = entry.runs.get(slot);
      if (!run) continue;
      orders.set(entry, run.order);
      clearRun(run);
    }
    return orders;
  }

  /** The entry's latest data, keeping the previous values the run was given. */
  function latestData(entry: Entry<D>, run: Run<D>): MarkData<D> {
    const previous = run.data.previous;
    return previous && !entry.data.previous ? withPrevious(entry.data, previous) : entry.data;
  }

  return {
    enter(marks) {
      if (destroyed) return;
      marks.forEach((input, index) => {
        const entry = track(input);
        entry.resting = input.data;
        cancelExit(entry);
        const batch = { index, count: marks.length };
        start(entry, "decorate", input.data, batch);
        start(entry, "enter", input.data, batch);
      });
    },

    update(marks) {
      if (destroyed) return;
      // What the last update explained goes with it, on the marks this one leaves alone: a flash
      // still playing stops, and a delta that stayed is cleared, as a re-trigger clears them.
      const changing = new Set(marks.map((input) => input.mark.key));
      for (const entry of [...entries.values()]) {
        const run = entry.runs.get("update");
        if (run && !changing.has(entry.key)) clearRun(run);
      }
      marks.forEach((input, index) => {
        const known = entries.get(input.mark.key);
        const previous = input.from ?? known?.mark;
        const data = known && !input.data.previous ? withPrevious(input.data, known.resting) : input.data;
        const entry = track(input);
        entry.resting = input.data;
        start(entry, "update", data, { index, count: marks.length }, { previous });
      });
    },

    exit(marks) {
      if (destroyed) return Promise.resolve();
      const exits = marks.map((input, index) => {
        const entry = track(input);
        cancelExit(entry);
        hovered.delete(entry.key);
        for (const run of [...entry.runs.values()]) clearRun(run);
        return new Promise<void>((resolve) => {
          entry.exiting = resolve;
          if (!effects.exit) {
            forget(entry);
            return;
          }
          start(entry, "exit", input.data, { index, count: marks.length }, {
            done: () => {
              if (entry.exiting && entries.get(entry.key) === entry) forget(entry);
            }
          });
        });
      });
      return Promise.all(exits).then(() => undefined);
    },

    hover(marks) {
      if (destroyed) return;
      marks.forEach((input, index) => {
        const entry = track(input);
        if (entry.exiting) return;
        hovered.add(entry.key);
        if (!transitioning) start(entry, "hover", input.data, { index, count: marks.length });
      });
    },

    leave(keys = [...hovered]) {
      for (const key of keys) {
        hovered.delete(key);
        const run = entries.get(key)?.runs.get("hover");
        if (run) clearRun(run);
      }
    },

    change(mark, data) {
      const entry = entries.get(mark.key);
      if (!entry) return;
      entry.mark = mark;
      if (data) {
        entry.data = data;
        // Outside a transition the values aren't on their way anywhere: a resize, a line's reveal.
        if (!transitioning) entry.resting = data;
      }
      // In start order, as they started, so text placed again goes past the text before it, as that is now.
      for (const run of [...entry.runs.values()].sort(byOrder)) if (run.state !== "cleared") tell(run, mark);
    },

    interrupt() {
      if (destroyed) return;
      transitioning = true;
      for (const entry of [...entries.values()]) {
        const run = entry.runs.get("hover");
        if (run) clearRun(run);
      }
    },

    settle() {
      if (!transitioning) return;
      transitioning = false;
      // Landed: each mark rests at the data its last frame gave.
      for (const entry of entries.values()) if (!entry.exiting) entry.resting = entry.data;
      const keys = [...hovered];
      keys.forEach((key, index) => {
        const entry = entries.get(key);
        if (entry) start(entry, "hover", entry.data, { index, count: keys.length });
      });
    },

    swap(next, marks) {
      if (destroyed) return;
      const changed = SLOTS.filter((slot) => next[slot] !== effects[slot]);
      effects = next;
      for (const slot of changed) {
        if (slot === "decorate") {
          const orders = clearSlot(slot);
          marks.forEach((input, index) => {
            const entry = entries.get(input.mark.key) ?? track(input);
            if (!entry.exiting) start(entry, slot, input.data, { index, count: marks.length }, { mark: input.mark, order: orders.get(entry) });
          });
        } else if (slot === "hover") {
          clearSlot(slot);
          // Mid-transition, settle() replays them with the new effect.
          if (transitioning) continue;
          const keys = [...hovered];
          keys.forEach((key, index) => {
            const entry = entries.get(key);
            if (entry) start(entry, slot, entry.data, { index, count: keys.length });
          });
        } else {
          for (const entry of [...entries.values()]) {
            const run = entry.runs.get(slot);
            if (!run) continue;
            // The new run takes the old one's place: its order, and the exit() promise waiting on it.
            const done = run.done;
            run.done = undefined;
            const data = latestData(entry, run);
            clearRun(run);
            start(entry, slot, data, run.batch, { previous: run.previous, done, order: run.order, end: true });
          }
        }
      }
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      transitioning = false;
      unsubscribe();
      for (const entry of [...entries.values()]) forget(entry);
      hovered.clear();
    }
  };
}

function withPrevious<D>(data: MarkData<D>, previous: MarkData<D>): MarkData<D> {
  return { datum: data.datum, samples: data.samples, related: (series) => data.related(series), previous };
}
