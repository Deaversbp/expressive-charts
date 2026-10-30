// An EffectContext for effect tests: a manual clock, its own motion, and recording drawing handles.

import { manualClock, type ManualClock } from "../clock";
import type { MarkData } from "../contracts/data";
import type { EffectContext, TextSpace } from "../contracts/effect";
import type { MarkGeometry, Rect } from "../contracts/geometry";
import type { Icon } from "../contracts/icon";
import { createMotion, type Motion, type MotionMode, type ScalingOverrides } from "../motion";
import { runScope } from "../runner";
import { estimatedBox } from "../text-box";
import { recordingLayer, recordingMark, type RecordingLayer, type RecordingMark } from "./recording";

export interface TestContextOptions {
  /** The author's mode. Default "presentation". The device never asks for reduced motion here. */
  readonly mode?: MotionMode;
  /** Overrides for the duration scaling, as a page's createMotion({ scaling }) gives. */
  readonly scaling?: ScalingOverrides;
  readonly icons?: readonly Icon[];
  readonly batch?: { readonly index: number; readonly count: number };
  readonly previous?: MarkGeometry;
  /** The boxes other effects' text holds, as `texts.held()` gives them: the runs that started before this one. Default none. */
  readonly held?: readonly Rect[];
}

export interface TestContext extends EffectContext {
  readonly motion: Motion;
  readonly clock: ManualClock;
  readonly layer: RecordingLayer;
  readonly mark: RecordingMark;
  /**
   * Where effects' text sits, as a chart's runner gives it, with text boxes estimated as in jsdom: 0.6
   * em a character. `holding` is the box the run holds now, undefined once it lets go or is cleared.
   */
  readonly texts: TextSpace & { readonly holding: Rect | undefined };
  /** Abort the run, as the runner does on leave or re-trigger. */
  abort(): void;
  /** The runner's cleanup after effect.clear(ctx): abort, empty the layer, reset the mark, drop onChange listeners, let go of its text. */
  clear(): void;
  /** Tell onChange listeners the geometry moved, as the runner does on every frame of a transition. */
  change(mark: MarkGeometry, data?: MarkData): void;
}

export function testContext(options: TestContextOptions = {}): TestContext {
  const clock = manualClock();
  const motion = createMotion({
    mode: options.mode ?? "presentation",
    ...(options.scaling ? { scaling: options.scaling } : {}),
    reducedMotion: { matches: false, subscribe: () => () => {} }
  });
  const layer = recordingLayer();
  const mark = recordingMark();
  const icons = new Map((options.icons ?? []).map((icon) => [icon.name, icon]));
  const held = [...(options.held ?? [])];
  let holding: Rect | undefined;
  const texts = {
    box: estimatedBox,
    held: () => held,
    hold(box: Rect | undefined) {
      holding = box;
    },
    get holding() {
      return holding;
    }
  };
  // The same run scope the runner gives every run, so clear() here is the runner's cleanup.
  const scope = runScope({
    clock,
    motion,
    layer,
    mark,
    icons: { get: (name) => icons.get(name) },
    batch: options.batch ?? { index: 0, count: 1 },
    previous: options.previous,
    texts
  });

  return {
    ...scope.context,
    motion,
    clock,
    layer,
    mark,
    texts,
    abort: scope.abort,
    clear() {
      scope.clear();
      holding = undefined;
    },
    change: scope.change
  };
}
