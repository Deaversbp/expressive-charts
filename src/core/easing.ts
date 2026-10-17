/** Maps linear progress (0–1) to eased progress. Any function of this shape works. */
export type Easing = (t: number) => number;

/** For playback, where speed should stay constant. */
export const linear: Easing = (t) => t;

/** For data transitions: starts and ends gently. */
export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** For travel, and for animations retargeted mid-flight: starts at speed, settles gently. */
export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);
