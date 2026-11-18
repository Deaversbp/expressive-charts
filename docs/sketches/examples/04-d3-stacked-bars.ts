// A story on someone else's chart: a lab's water samples, passed and failed, by site, on a plain D3
// stacked bar chart. An arrow runs along the samples that passed, then a chevron along those that failed.
// The page's D3 code stays as it is; expressive() adds effects on top.
import { expressive, icons, motion, sequence, travel } from "expressive-charts";
import type { SeriesPoint, Selection } from "./d3-shim";

interface Site {
  site: string;
  passed: number;
  failed: number;
}

/** d3.stack() rects, with the series key copied onto each point (a common D3 idiom). */
type Segment = SeriesPoint<Site> & { key: "passed" | "failed" };

// Built by the page's existing D3 code (omitted): one <g> per series, one <rect> per site.
declare const rects: Selection<SVGRectElement, Segment>;
declare function drawWithD3(data: Site[], options: { duration: number }): Selection<SVGRectElement, Segment>;

const fx = expressive(rects, {
  key: (d) => d.data.site, // a site's passed rect and failed rect share a key...
  segment: (d) => d.key, // ...and become that site's two segments, ordered from the baseline
  baseline: "left",
  on: {
    hover: sequence(travel(icons.arrow, { along: "passed" }), travel(icons.chevron, { along: "failed" }))
  },
  keyboard: true // makes bars focusable; focus plays the same story
});

export function render(next: Site[]): void {
  // The host's own transition, scaled by our motion mode (0 when the viewer wants no motion).
  const updated = drawWithD3(next, { duration: motion.duration(600) });
  fx.refresh(updated); // enter / update / exit by key, so effects stay in step
}

// Alternative: follow the host's transition frame by frame. refresh() still says what the data did
// (enter, update, exit), called right after the join, before the transition starts; watch then moves
// the effects with every frame the transition draws, so the flash's halo grows with its bar.
export const live = expressive(rects, {
  key: (d) => d.data.site,
  segment: (d) => d.key,
  value: (d) => d[1] - d[0], // an update is a change in values since the last refresh()
  baseline: "auto", // all rects share their left edge, so the baseline is "left"
  watch: true,
  on: { update: "flash" }
});

export function renderLive(next: Site[]): void {
  live.refresh(drawWithD3(next, { duration: motion.duration(600) }));
}
