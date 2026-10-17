// An EffectContext for effect tests: a manual clock, its own motion, and recording drawing handles.

import { manualClock, type ManualClock } from "../clock";
import type { MarkData } from "../contracts/data";
import type { EffectContext } from "../contracts/effect";
import type { MarkGeometry } from "../contracts/geometry";
import type { Icon } from "../contracts/icon";
import { createMotion, type Motion, type MotionMode } from "../motion";
import { tween } from "../tween";
import { recordingLayer, recordingMark, type RecordingLayer, type RecordingMark } from "./recording";

export interface TestContextOptions {
  /** The author's mode. Default "presentation". The device never asks for reduced motion here. */
  readonly mode?: MotionMode;
  readonly icons?: readonly Icon[];
  readonly batch?: { readonly index: number; readonly count: number };
  readonly previous?: MarkGeometry;
}

export interface TestContext extends EffectContext {
  readonly motion: Motion;
  readonly clock: ManualClock;
  readonly layer: RecordingLayer;
  readonly mark: RecordingMark;
  /** Abort the run, as the runner does on leave or re-trigger. */
  abort(): void;
  /** The runner's cleanup after effect.clear(ctx): abort, empty the layer, reset the mark, drop onChange listeners. */
  clear(): void;
  /** Tell onChange listeners the geometry moved, as the runner does on every frame of a transition. */
  change(mark: MarkGeometry, data?: MarkData): void;
}

export function testContext(options: TestContextOptions = {}): TestContext {
  const clock = manualClock();
  const motion = createMotion({ mode: options.mode ?? "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  const controller = new AbortController();
  const layer = recordingLayer();
  const mark = recordingMark();
  const icons = new Map((options.icons ?? []).map((icon) => [icon.name, icon]));
  let listeners: ((mark: MarkGeometry, data?: MarkData) => void)[] = [];

  return {
    signal: controller.signal,
    motion,
    clock,
    layer,
    mark,
    icons: { get: (name) => icons.get(name) },
    batch: options.batch ?? { index: 0, count: 1 },
    ...(options.previous ? { previous: options.previous } : {}),
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
    },
    abort() {
      controller.abort();
    },
    clear() {
      controller.abort();
      layer.clear();
      mark.reset();
      listeners = [];
    },
    change(geometry, data) {
      for (const listener of [...listeners]) listener(geometry, data);
    }
  };
}
