// Effects on D3 shapes the adapter can't read on its own: arcs from d3.arc() and a line from d3.line().
// The page describes the geometry with the same builders our reference charts use. The arcs are a
// site's sessions by source, and the line a seedling's height under drought against a watered control.
import { describe, expressive, flash, icons, only, samplesAlong, stagger, threshold, travel } from "expressive-charts";
import type { PieArc, Selection } from "./d3-shim";

interface Source {
  source: string;
  sessions: number;
}

// d3.arc() paths drawn inside <g transform="translate(320,150)">, so their centre is (0, 0)
// in their own coordinate space, which is also where the adapter draws its overlay.
declare const slices: Selection<SVGPathElement, PieArc<Source>>;

expressive(slices, {
  key: (d) => d.data.source,
  geometry: (d, _el, key) => describe.arc({ key, cx: 0, cy: 0, inner: 70, outer: 116, start: d.startAngle, end: d.endAngle }),
  on: {
    hover: travel(icons.arrow),
    enter: stagger(flash(), { delay: 60 }) // opt-in stagger; it collapses to 0 in analysis and off
  }
});

interface Reading {
  day: number;
  drought: number;
  control: number;
}

// Two d3.line() paths, one per group; each path's datum is the whole experiment.
declare const lines: Selection<SVGPathElement, Reading[]>;
declare const x: (day: number) => number;
declare const y: (value: number) => number;

expressive(lines, {
  key: (_readings, el) => el.getAttribute("data-series") ?? "", // "drought" or "control"
  geometry: (readings, _el, key) =>
    describe.line({ key, series: key, points: readings.map((r) => ({ x: x(r.day), y: y(r[key as "drought" | "control"]) })) }),
  // Data effects need values along the walk. samplesAlong projects each data point onto it.
  samples: (readings, mark) =>
    samplesAlong(
      mark,
      readings.map((r) => {
        const value = r[mark.key as "drought" | "control"];
        return { x: x(r.day), y: y(value), value, at: r.day };
      })
    ),
  on: { decorate: only("drought", threshold({ compareTo: "control", color: "negative" })) }
});
