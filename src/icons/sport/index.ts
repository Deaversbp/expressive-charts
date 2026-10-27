// The sport icon pack, an optional entry point: import { sport } from "expressive-charts/icons/sport",
// then registerIcons(sport), or pass soccerBall and cleat to travel() directly. Both are converted
// from the prototype in demo/lab.html and drawn in fixed colours (a white ball is white in any theme).

import type { Icon } from "../../core";
// From its own file, not the geometry's index, so this entry doesn't carry the builders.
import { formatNumber as n } from "../../core/geometry/path-data";
import { defineIcon } from "../define";

const BALL_R = 8.5;
const INK = "#1d1c1a";

const circle = (r: number): string => `M${r},0A${r},${r} 0 0 1 ${-r},0A${r},${r} 0 0 1 ${r},0Z`;
const polar = (r: number, a: number): string => `${n(r * Math.sin(a))},${n(-r * Math.cos(a))}`;

/** A regular pentagon around (cx, cy), its first corner `rotation` radians clockwise from 12 o'clock. */
function pentagon(cx: number, cy: number, r: number, rotation: number): string {
  let d = "";
  for (let i = 0; i < 5; i++) {
    const a = rotation + (i * 2 * Math.PI) / 5;
    d += `${i ? "L" : "M"}${n(cx + r * Math.sin(a))},${n(cy - r * Math.cos(a))}`;
  }
  return `${d}Z`;
}

/** The five seams and five outer panels, one per spoke. */
function panels(): { seams: string; patches: string } {
  let seams = "";
  let patches = pentagon(0, 0, 3.3, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    seams += `M${polar(3.3, a)}L${polar(8.8 * 0.78, a)}`;
    patches += pentagon(8.8 * 1.08 * Math.sin(a), -8.8 * 1.08 * Math.cos(a), 3.1, a + Math.PI);
  }
  return { seams, patches };
}

/** Centred on the walk; rolls about its centre. */
export const soccerBall: Icon = /* @__PURE__ */ (() => {
  const { seams, patches } = panels();
  return defineIcon({
    name: "soccer-ball",
    shapes: [
      { d: circle(BALL_R), fill: "#ffffff" },
      // The outer panels hang over the edge, so they're clipped to the ball.
      { d: patches, fill: INK, clip: circle(BALL_R) },
      { d: seams, stroke: INK, width: 1 },
      { d: circle(BALL_R - 0.5), stroke: INK, width: 1 }
    ],
    box: { x: -BALL_R, y: -BALL_R, width: 2 * BALL_R, height: 2 * BALL_R },
    anchor: { x: 0, y: 0 },
    pivot: { x: 0, y: 0 },
    footprint: [BALL_R, BALL_R],
    gait: "roll",
    radius: BALL_R
  });
})();

const STUDS = [4, 9, 16.5, 21.5]
  .map((x) => `M${n(x + 0.6)},0L${n(x + 1.6)},0A0.6,0.6 0 0 1 ${n(x + 2.2)},0.6L${n(x + 2.2)},2A0.6,0.6 0 0 1 ${n(x + 1.6)},2.6L${n(x + 0.6)},2.6A0.6,0.6 0 0 1 ${x},2L${x},0.6A0.6,0.6 0 0 1 ${n(x + 0.6)},0Z`)
  .join("");

/**
 * A boot with its toe pointing +x. Its heel sits at the start of the walk, raised 6 px so the boot is
 * centred in a bar; it tilts about the ball of the foot. Upright: on a walk heading left it's
 * mirrored, so the sole stays down.
 */
export const cleat: Icon = /* @__PURE__ */ defineIcon({
  name: "cleat",
  shapes: [
    {
      d: "M1.5,-1.5L1.5,-11Q1.5,-14 4.5,-14L9.5,-14Q11.5,-14 12.5,-11.5L14.5,-8Q21.5,-7.2 24.5,-4.4Q26.6,-2.2 24.6,0L3,0Q1.5,0 1.5,-1.5Z",
      fill: "#24221f",
      stroke: "#ffffff",
      width: 0.9,
      linejoin: "round"
    },
    { d: "M7,-3L12,-9.5M10,-3L15,-8.3", stroke: "#ffffff", width: 1.4, linecap: "round" },
    { d: "M12.3,-11L14.7,-11.6M13.3,-9.6L15.7,-10.1", stroke: "#bdbab2", width: 0.8, linecap: "round" },
    { d: STUDS, fill: "#24221f", stroke: "#ffffff", width: 0.6 }
  ],
  box: { x: 0, y: -14.5, width: 26, height: 17.5 },
  size: 26,
  anchor: { x: 0, y: -6 },
  pivot: { x: 13, y: -4 },
  footprint: [0, 26],
  gait: "step",
  upright: true
});

/** Both icons, for registerIcons(sport). */
export const sport: readonly Icon[] = /* @__PURE__ */ Object.freeze([soccerBall, cleat]);
