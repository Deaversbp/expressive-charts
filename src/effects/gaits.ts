// Gaits: how an icon moves while travel carries it along a walk. A gait is a small function from how
// far the icon has gone to its pose. Gaits never name icons, and icons only name a gait.

import { easeInOutCubic, type Easing } from "../core";

/** Where the icon is on its trip. Distances are in the icon's own units (px at its natural size), so a gait looks the same at any size. */
export interface GaitState {
  /** How far the icon has gone. */
  readonly distance: number;
  /** The whole trip; 0 when the icon doesn't move. */
  readonly length: number;
  /** distance ÷ length, 0 to 1 (1 for a trip of length 0). */
  readonly progress: number;
  /** The icon's rolling radius. */
  readonly radius: number;
}

/** How the icon is held, relative to its place on the walk. */
export interface GaitPose {
  /** Raised this far towards the icon's up side, in icon units. */
  readonly lift: number;
  /** Rolling rotation about the icon's pivot, in radians; positive rolls forward (clockwise when facing +x). */
  readonly spin: number;
  /** Rocking rotation about the icon's pivot, in radians; positive raises the front. */
  readonly tilt: number;
}

export interface Gait {
  (state: GaitState): GaitPose;
  /** The trip's easing. Default easeOutCubic. */
  readonly ease?: Easing;
  /** Multiplies the trip's duration. Default 1. */
  readonly pace?: number;
}

export interface StepOptions {
  /** Distance per step, in icon units. Default 42. */
  readonly stride?: number;
  /** Height of each step, in icon units. Default 3.2. */
  readonly lift?: number;
  /** Most the front is raised during a step, in degrees. Default 9. */
  readonly tilt?: number;
}

const STILL: GaitPose = Object.freeze({ lift: 0, spin: 0, tilt: 0 });

/** Rolls without slipping: the spin is the distance over the radius. */
function roll(): Gait {
  return (state) => ({ lift: 0, spin: state.distance / state.radius, tilt: 0 });
}

/**
 * Steps along, the prototype's cleat: a whole number of steps (at least one), each lifting and
 * tilting the front up and setting it down again, a little less as the trip goes on. A step takes 15%
 * longer than a roll over the same distance and eases in and out.
 */
function step(options: StepOptions = {}): Gait {
  const stride = options.stride ?? 42;
  const lift = options.lift ?? 3.2;
  const tilt = options.tilt ?? 9;
  if (!(stride > 0) || !Number.isFinite(stride)) throw new RangeError(`gaits.step: stride must be more than 0, got ${stride}.`);
  if (!(lift >= 0) || !Number.isFinite(lift)) throw new RangeError(`gaits.step: lift can't be negative, got ${lift}.`);
  if (!Number.isFinite(tilt)) throw new RangeError(`gaits.step: tilt must be a finite number of degrees, got ${tilt}.`);
  const peak = (tilt * Math.PI) / 180;
  const gait = (state: GaitState): GaitPose => {
    const steps = Math.max(1, Math.round(state.length / stride));
    // Exactly 0 at the start and end of every step, so the boot rests flat when it arrives.
    const phase = Math.abs(Math.sin(Math.PI * ((state.progress * steps) % 1)));
    return { lift: phase * lift, spin: 0, tilt: phase * peak * (1 - 0.3 * state.progress) };
  };
  return Object.assign(gait, { ease: easeInOutCubic, pace: 1.15 });
}

/** Slides along without turning. */
function slide(): Gait {
  return () => STILL;
}

export const gaits: { roll: typeof roll; step: typeof step; slide: typeof slide } = { roll, step, slide };

/** The gaits icons and options name. */
export type GaitName = keyof typeof gaits;
