// The ball-and-cleat story on someone else's chart: a plain D3 stacked bar chart.
// The page's D3 code stays as it is; expressive() adds effects on top.
import { expressive, motion, sequence, travel } from "expressive-charts";
import { cleat, soccerBall } from "expressive-charts/icons/sport";
import type { SeriesPoint, Selection } from "./d3-shim";

interface Player {
  name: string;
  goals: number;
  assists: number;
}

/** d3.stack() rects, with the series key copied onto each point (a common D3 idiom). */
type Segment = SeriesPoint<Player> & { key: "goals" | "assists" };

// Built by the page's existing D3 code (omitted): one <g> per series, one <rect> per player.
declare const rects: Selection<SVGRectElement, Segment>;
declare function drawWithD3(data: Player[], options: { duration: number }): Selection<SVGRectElement, Segment>;

const fx = expressive(rects, {
  key: (d) => d.data.name, // a player's goals rect and assists rect share a key...
  segment: (d) => d.key, // ...and become that player's two segments, ordered from the baseline
  baseline: "left",
  on: {
    hover: sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" }))
  },
  keyboard: true // makes bars focusable; focus plays the same story
});

export function render(next: Player[]): void {
  // The host's own transition, scaled by our motion mode (0 when the viewer wants no motion).
  const updated = drawWithD3(next, { duration: motion.duration(600) });
  fx.refresh(updated); // enter / update / exit by key, so effects stay in step
}

// Alternative: follow the host's transition frame by frame. refresh() still says what the data did
// (enter, update, exit), called right after the join, before the transition starts; watch then moves
// the effects with every frame the transition draws, so the flash's halo grows with its bar.
export const live = expressive(rects, {
  key: (d) => d.data.name,
  segment: (d) => d.key,
  value: (d) => d[1] - d[0], // an update is a change in values since the last refresh()
  baseline: "auto", // all rects share their left edge, so the baseline is "left"
  watch: true,
  on: { update: "flash" }
});

export function renderLive(next: Player[]): void {
  live.refresh(drawWithD3(next, { duration: motion.duration(600) }));
}
