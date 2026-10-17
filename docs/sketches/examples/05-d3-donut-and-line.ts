// Effects on D3 shapes the adapter can't read on its own: arcs from d3.arc() and a line from d3.line().
// The page describes the geometry with the same builders our reference charts use.
import { describe, expressive, flash, only, samplesAlong, stagger, threshold, travel } from "expressive-charts";
import { soccerBall } from "expressive-charts/icons/sport";
import type { PieArc, Selection } from "./d3-shim";

interface Outcome {
  outcome: string;
  shots: number;
}

// d3.arc() paths drawn inside <g transform="translate(320,150)">, so their centre is (0, 0)
// in their own coordinate space, which is also where the adapter draws its overlay.
declare const slices: Selection<SVGPathElement, PieArc<Outcome>>;

expressive(slices, {
  key: (d) => d.data.outcome,
  geometry: (_el, d, key) => describe.arc({ key, cx: 0, cy: 0, inner: 70, outer: 116, start: d.startAngle, end: d.endAngle }),
  on: {
    hover: travel(soccerBall),
    enter: stagger(flash(), { delay: 60 }) // opt-in stagger; it collapses to 0 in analysis and off
  }
});

interface Week {
  week: number;
  goals: number;
  xg: number;
}

// Two d3.line() paths, one per series; each path's datum is the whole season.
declare const lines: Selection<SVGPathElement, Week[]>;
declare const x: (week: number) => number;
declare const y: (value: number) => number;

expressive(lines, {
  key: (_weeks, el) => el.getAttribute("data-series") ?? "", // "goals" or "xg"
  geometry: (el, weeks, key) =>
    describe.line({ key, series: key, points: weeks.map((w) => ({ x: x(w.week), y: y(w[key as "goals" | "xg"]) })) }),
  // Data effects need values along the walk. samplesAlong projects each data point onto it.
  samples: (weeks, mark) =>
    samplesAlong(
      mark,
      weeks.map((w) => {
        const value = w[mark.key as "goals" | "xg"];
        return { x: x(w.week), y: y(value), value, at: w.week };
      })
    ),
  on: { decorate: only("goals", threshold({ compareTo: "xg", color: "negative" })) }
});
