import { report } from "./report";

export type MotionMode = "presentation" | "analysis" | "off";

/** What a duration is for. Each kind scales differently by mode. */
export type Timing = "feedback" | "transition" | "effect" | "playback";

/** Base ms × factor, clamped to [min(base, min), max]. A floor never makes an animation longer than its base. */
export interface ScalingRule {
  readonly factor: number;
  readonly min?: number;
  readonly max?: number;
}

type ScaledMode = Exclude<MotionMode, "off">;

export type ScalingTable = { readonly [M in ScaledMode]: { readonly [T in Timing]: ScalingRule } };
export type ScalingOverrides = { readonly [M in ScaledMode]?: { readonly [T in Timing]?: ScalingRule } };

/** Starting values from the prototype; tuned in the demos. Off is always 0. */
export const defaultScaling: ScalingTable = {
  presentation: {
    feedback: { factor: 1 },
    transition: { factor: 1 },
    effect: { factor: 1 },
    playback: { factor: 1 }
  },
  analysis: {
    feedback: { factor: 1 },
    transition: { factor: 0.35, max: 200 },
    effect: { factor: 0.35, min: 140, max: 300 },
    playback: { factor: 0.3 }
  }
};

/** What charts and effects need from the motion system. */
export interface MotionView {
  /** The effective mode, after the reduced-motion rule. */
  readonly mode: MotionMode;
  /** True only in presentation: split data changes into stages. */
  readonly staged: boolean;
  /** Scale a base duration (ms) for the current mode. 0 means "jump to the end". */
  duration(base: number, timing?: Timing): number;
}

export interface Motion extends MotionView {
  /** The mode the page author asked for. */
  readonly requested: MotionMode;
  /** The mode the viewer picked in an on-page control, if any. */
  readonly viewerChoice: MotionMode | undefined;
  /** Live value of `prefers-reduced-motion: reduce`. */
  readonly prefersReduced: boolean;
  /** The author's default. Never overrides reduced motion. */
  setMode(mode: MotionMode): void;
  /** The viewer's explicit choice from an on-page control. Overrides reduced motion. */
  chooseMode(mode: MotionMode): void;
  /** Forget the viewer's choice and follow the author's mode and the device setting again. */
  clearChoice(): void;
  /** Called whenever the mode, the viewer's choice or the device setting changes. */
  subscribe(listener: () => void): () => void;
}

/** A live reduced-motion preference. */
export interface ReducedMotionSource {
  readonly matches: boolean;
  subscribe(listener: () => void): () => void;
}

export interface MotionOptions {
  /** The author's mode. Default "presentation". */
  readonly mode?: MotionMode;
  readonly scaling?: ScalingOverrides;
  /** Default: the `prefers-reduced-motion` media query. */
  readonly reducedMotion?: ReducedMotionSource;
}

const MODES: readonly MotionMode[] = ["presentation", "analysis", "off"];
const TIMINGS: readonly Timing[] = ["feedback", "transition", "effect", "playback"];

export function createMotion(options: MotionOptions = {}): Motion {
  let requested = checkMode(options.mode ?? "presentation");
  let viewerChoice: MotionMode | undefined;
  const scaling = mergeScaling(options.scaling);
  const reduced = options.reducedMotion ?? mediaReducedMotion();
  const listeners = new Set<() => void>();
  let stopWatching: (() => void) | undefined;

  const effective = (): MotionMode => viewerChoice ?? (reduced.matches ? "off" : requested);

  const notify = (): void => {
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try {
        listener();
      } catch (error) {
        report(error);
      }
    }
  };

  return {
    get mode() {
      return effective();
    },
    get staged() {
      return effective() === "presentation";
    },
    get requested() {
      return requested;
    },
    get viewerChoice() {
      return viewerChoice;
    },
    get prefersReduced() {
      return reduced.matches;
    },
    duration(base, timing = "transition") {
      const mode = effective();
      return mode === "off" ? 0 : scaleDuration(base, scaling[mode][timing]);
    },
    setMode(mode) {
      checkMode(mode);
      if (mode === requested) return;
      requested = mode;
      notify();
    },
    chooseMode(mode) {
      checkMode(mode);
      if (mode === viewerChoice) return;
      viewerChoice = mode;
      notify();
    },
    clearChoice() {
      if (viewerChoice === undefined) return;
      viewerChoice = undefined;
      notify();
    },
    subscribe(listener) {
      const entry = (): void => listener();
      listeners.add(entry);
      // Only watch the media query while someone is listening.
      stopWatching ??= reduced.subscribe(notify);
      return () => {
        if (!listeners.delete(entry) || listeners.size > 0) return;
        stopWatching?.();
        stopWatching = undefined;
      };
    }
  };
}

export function scaleDuration(base: number, rule: ScalingRule): number {
  if (!(base > 0)) return 0;
  const floor = Math.min(base, rule.min ?? 0);
  const ceiling = rule.max ?? Infinity;
  return Math.min(Math.max(base * rule.factor, floor), ceiling);
}

/** Reads `prefers-reduced-motion` lazily: nothing touches the DOM until `matches` is read or someone subscribes. */
export function mediaReducedMotion(query = "(prefers-reduced-motion: reduce)"): ReducedMotionSource {
  let list: MediaQueryList | null | undefined;
  const lookup = (): MediaQueryList | null => {
    if (list === undefined) {
      try {
        list = typeof matchMedia === "function" ? matchMedia(query) : null;
      } catch {
        list = null;
      }
    }
    return list;
  };

  return {
    get matches() {
      return lookup()?.matches ?? false;
    },
    subscribe(listener) {
      const media = lookup();
      if (!media) return () => {};
      const onChange = (): void => listener();
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
      }
      // Safari before 14.
      media.addListener(onChange);
      return () => media.removeListener(onChange);
    }
  };
}

function checkMode(mode: MotionMode): MotionMode {
  if (!MODES.includes(mode)) {
    throw new TypeError(`Unknown motion mode "${String(mode)}". Use one of: ${MODES.join(", ")}.`);
  }
  return mode;
}

function mergeScaling(overrides: ScalingOverrides = {}): ScalingTable {
  const merge = (mode: ScaledMode): Record<Timing, ScalingRule> => {
    const table: Record<Timing, ScalingRule> = { ...defaultScaling[mode] };
    for (const timing of TIMINGS) {
      const rule = overrides[mode]?.[timing];
      if (rule) table[timing] = rule;
    }
    return table;
  };
  return { presentation: merge("presentation"), analysis: merge("analysis") };
}

/** The page-wide motion every chart follows unless given its own. */
export const motion: Motion = /* @__PURE__ */ createMotion();
