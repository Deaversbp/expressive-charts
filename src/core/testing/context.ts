// An EffectContext for effect tests: a manual clock, its own motion, and recording drawing handles.

import { manualClock, type ManualClock } from "../clock";
import type { MarkData } from "../contracts/data";
import type { EffectContext } from "../contracts/effect";
import type { MarkGeometry } from "../contracts/geometry";
import type { Icon } from "../contracts/icon";
import { createMotion, type Motion, type MotionMode } from "../motion";
import { runScope } from "../runner";
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
  const layer = recordingLayer();
  const mark = recordingMark();
  const icons = new Map((options.icons ?? []).map((icon) => [icon.name, icon]));
  // The same run scope the runner gives every run, so clear() here is the runner's cleanup.
  const scope = runScope({
    clock,
    motion,
    layer,
    mark,
    icons: { get: (name) => icons.get(name) },
    batch: options.batch ?? { index: 0, count: 1 },
    previous: options.previous
  });

  return {
    ...scope.context,
    motion,
    clock,
    layer,
    mark,
    abort: scope.abort,
    clear: scope.clear,
    change: scope.change
  };
}
