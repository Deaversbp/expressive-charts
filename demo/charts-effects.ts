// The charts page's data, and what it gives expressive() for each of its four D3 charts. demo/charts.ts
// draws the charts and wires the page; src/host-charts.test.ts runs these same descriptions on the
// same marks, so the page and its test can't drift apart. Each chart is drawn by its own module, which
// knows nothing about expressive-charts; everything the adapter can't read from an element by its tag
// is described here, from the points each module drew (CLAUDE.md rule 3: no effect knows a chart).

import { describe, drawIn, expressive, label, link, only, samplesAlong, threshold, travel, type Attachment, type ExpressiveOptions, type Link, type MarkSource } from "../src/index";
import { soccerBall } from "../src/icons/sport/index";
import type { Band, DrawnButterfly, Half } from "./d3-butterfly";
import type { Dot, DrawnDumbbell, Player, Row } from "./d3-dumbbell";
import type { DrawnRadar, Profile, Value } from "./d3-radar";
import type { Connector, DrawnWaterfall, Month, Step } from "./d3-waterfall";

// ── The data ─────────────────────────────────────────────────────────────────

/** Harbor City FC's goal difference each month: a slow start, a winter run and a late slump, +12 in all. */
export const months: readonly Month[] = [
  { month: "August", change: -1 },
  { month: "September", change: -2 },
  { month: "October", change: 2 },
  { month: "November", change: 3 },
  { month: "December", change: 5 },
  { month: "January", change: 4 },
  { month: "February", change: 3 },
  { month: "March", change: 2 },
  { month: "April", change: -1 },
  { month: "May", change: -3 }
];

/** The demos' eight players, their goals and assists split at the turn of the year. */
export const players: readonly Player[] = [
  { name: "Okafor", goals: { first: 10, second: 6 }, assists: { first: 1, second: 3 } },
  { name: "Lindqvist", goals: { first: 3, second: 7 }, assists: { first: 5, second: 2 } },
  { name: "Moreau", goals: { first: 5, second: 3 }, assists: { first: 2, second: 1 } },
  { name: "Tanaka", goals: { first: 2, second: 4 }, assists: { first: 3, second: 7 } },
  { name: "Reyes", goals: { first: 1, second: 4 }, assists: { first: 3, second: 1 } },
  { name: "Adeyemi", goals: { first: 3, second: 1 }, assists: { first: 1, second: 5 } },
  { name: "Novak", goals: { first: 2, second: 1 }, assists: { first: 0, second: 1 } },
  { name: "Castillo", goals: { first: 0, second: 1 }, assists: { first: 4, second: 1 } }
];

/** The radar's axes, clockwise from the top. */
export const radarAxes: readonly string[] = ["Goals", "Assists", "Shots", "Key passes", "Tackles", "Dribbles"];

/** Okafor and the league's average outfield player, per 90 minutes, each number's percentile in the league beside it. */
export const profiles: readonly Profile[] = [
  { series: "player", name: "Okafor", per90: [0.5, 0.13, 2.0, 0.9, 0.6, 1.4], percentiles: [96, 52, 91, 47, 18, 74] },
  { series: "average", name: "League average", per90: [0.18, 0.12, 1.3, 1.0, 1.4, 1.0], percentiles: [63, 58, 57, 56, 54, 60] }
];

/** The season's goals in each 15-minute band, stoppage time with the band before it: 58 scored and 46 conceded, +12. */
export const bands: readonly Band[] = [
  { band: "0–15", conceded: 6, scored: 7 },
  { band: "16–30", conceded: 5, scored: 8 },
  { band: "31–45+", conceded: 8, scored: 10 },
  { band: "46–60", conceded: 7, scored: 9 },
  { band: "61–75", conceded: 9, scored: 11 },
  { band: "76–90+", conceded: 11, scored: 13 }
];

// ── Words ────────────────────────────────────────────────────────────────────

/** "+2", "−3" with a true minus sign, "0". */
export const signed = (value: number): string => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0");
/** "1 goal", "6 goals"; "1 assist", "3 assists". */
export const count = (value: number, word: string): string => `${value} ${value === 1 ? word : `${word}s`}`;
/** "1st", "52nd", "63rd", "96th". */
export function ordinal(value: number): string {
  const tens = value % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][value % 10] ?? "th");
  return `${value}${suffix}`;
}
/** "goals, shots and dribbles". */
function list(words: readonly string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** How a page attaches marks: expressive(), or a test's own, with a clock it controls. */
export type Attach = <D>(source: MarkSource<D>, options: ExpressiveOptions<D>) => Attachment<D>;

/** Reads a number attribute an element was drawn with. */
const attr = (element: Element, name: string): number => Number(element.getAttribute(name));

// ── The waterfall ────────────────────────────────────────────────────────────

export interface WaterfallEffects {
  readonly steps: Attachment<Step>;
  readonly connectors: Attachment<Connector>;
  readonly staircase: Attachment<Step[]>;
  destroy(): void;
}

/**
 * The steps, each described from its rect: a rise grows up from its bottom, a fall down from its top,
 * and the total up from the axis, so baseline "auto", which looks for one edge every rect has, isn't
 * used. Each keeps its signed value past its end (`label`). The connectors draw in at load, and the
 * staircase, an attachment of its own with no keyboard or names, carries the ball to rest on the total.
 */
export function attachWaterfall(chart: DrawnWaterfall, attach: Attach = expressive): WaterfallEffects {
  // Where the ball rests on the total, so the total's label goes above it: the staircase ends at the
  // total's right end, and travel keeps the ball inside it, sitting on its top.
  const ball = soccerBall.box.width;
  const steps = attach(chart.steps, {
    key: (d) => d.name,
    value: (d) => d.value,
    geometry: (element, d, key) => {
      const x = attr(element, "x");
      const y = attr(element, "y");
      const width = attr(element, "width");
      return describe.bar({
        key,
        x,
        y,
        width,
        height: attr(element, "height"),
        baseline: d.kind === "fall" ? "top" : "bottom",
        labelBounds: d.kind === "total" ? [{ x: x + width - ball, y: y - ball, width: ball, height: ball }] : undefined
      });
    },
    keyboard: true,
    markLabel: (d) => (d.kind === "total" ? `Season: ${signed(d.value)} goal difference` : `${d.name}: ${signed(d.value)}, ${signed(d.to)} so far`),
    dim: true,
    on: { decorate: label((data) => signed(data.datum.value)) }
  });
  const connectors = attach(chart.connectors, {
    key: (d) => d.from,
    on: { enter: drawIn() }
  });
  const staircase = attach(chart.staircase, {
    key: () => "staircase",
    on: { enter: travel(soccerBall, { ride: "on" }) }
  });
  return {
    steps,
    connectors,
    staircase,
    destroy() {
      staircase.destroy();
      connectors.destroy();
      steps.destroy();
    }
  };
}

// ── The dumbbell ─────────────────────────────────────────────────────────────

export interface DumbbellEffects {
  readonly dots: { readonly first: Attachment<Dot>; readonly second: Attachment<Dot> };
  readonly connectors: Attachment<Row>;
  readonly link: Link;
  /** Reads the chart's marks again, in their order now: after it joins new rows, or draws again. */
  refresh(): void;
  destroy(): void;
}

/** "up 4", "down 2": a row's change, which its name says as well as its colour (WCAG 1.4.1). */
const change = (row: Row): string => (row.second > row.first ? `up ${row.second - row.first}` : row.second < row.first ? `down ${row.first - row.second}` : "no change");
const metricWord = (row: { readonly metric: string }): string => (row.metric === "goals" ? "goal" : "assist");

/**
 * The connectors and each half's dots, read by their tags, are three attachments linked by player: a
 * link lights the marks in its other attachments, so hovering any part of a row lights the whole row
 * and runs the connector's hover, an arrow from the first half to the second, so the way it goes is
 * the change. Only the connectors take the keyboard and names, each saying both halves and the change,
 * so a row is read once; the dots are for the pointer. All three follow the chart's own transition
 * (`watch`).
 */
export function attachDumbbell(chart: DrawnDumbbell, attach: Attach = expressive): DumbbellEffects {
  const half = (source: DrawnDumbbell["dots"]["first"]): Attachment<Dot> =>
    attach(source, {
      key: (d) => d.name,
      value: (d) => `${d.metric} ${d.value}`,
      dim: true,
      watch: true
    });
  const dots = { first: half(chart.dots.first), second: half(chart.dots.second) };
  const connectors = attach(chart.connectors, {
    key: (d) => d.name,
    value: (d) => `${d.metric} ${d.first} ${d.second}`,
    keyboard: true,
    markLabel: (d) => `${d.name}: ${count(d.first, metricWord(d))} in the first half, ${d.second} in the second, ${change(d)}`,
    dim: true,
    watch: true,
    on: { hover: travel("arrow", { ride: "on" }) }
  });
  const linked = link([dots.first, dots.second, connectors], { by: ({ data }) => data.datum.name });
  return {
    dots,
    connectors,
    link: linked,
    refresh() {
      // The chart's selections now, since a selection keeps the order it was made in.
      dots.first.refresh(chart.dots.first);
      dots.second.refresh(chart.dots.second);
      connectors.refresh(chart.connectors);
    },
    destroy() {
      linked.destroy();
      connectors.destroy();
      dots.second.destroy();
      dots.first.destroy();
    }
  };
}

// ── The radar ────────────────────────────────────────────────────────────────

export interface RadarEffects {
  readonly outlines: Attachment<Profile>;
  readonly values: { readonly player: Attachment<Value>; readonly average: Attachment<Value> };
  readonly link: Link;
  destroy(): void;
}

/** Samples a radar edge into this many parts, so threshold's crossings land where the outlines cross. */
const PER_EDGE = 12;

/**
 * Each outline is a closed polygon, which has no direction, so it's described as a line from its first
 * corner round to the first again, and named by its series (`segment`), so the player's takes threshold
 * against the average's. Its samples are its distance from the centre, as a percentile, on rays shared
 * by both outlines: at each corner (`at` the axis's index) and at evenly spaced rays between, where a
 * straight edge's distance isn't a straight line, so the colour ends where the outlines cross.
 *
 * Each value is a circle described as its spoke, from the centre out to the circle's far edge, as wide
 * as the circle, so a dot travels out along it on hover and the focus ring follows the spoke. The two
 * series' values are two attachments linked by axis.
 */
export function attachRadar(chart: DrawnRadar, attach: Attach = expressive): RadarEffects {
  const rays = Array.from({ length: radarAxes.length * PER_EDGE + 1 }, (_, i) => i / PER_EDGE);
  /** How far the outline is from the centre at a point, as a percentile. */
  const reach = (p: { x: number; y: number }): number => (Math.hypot(p.x - chart.center.x, p.y - chart.center.y) / chart.radius) * 100;
  const outlines = attach(chart.outlines, {
    key: (d) => d.series,
    segment: (d) => d.series,
    value: (d) => d.percentiles.join(" "),
    geometry: (_element, d, key) => {
      const corners = chart.corners(d.series);
      return describe.line({ key, series: d.series, points: [...corners, corners[0]!], width: chart.widths.outline });
    },
    samples: (d, mark) => {
      const points = rays.map((at) => {
        const p = chart.along(d.series, at);
        return { x: p.x, y: p.y, value: reach(p), at };
      });
      // The last ray is the first corner again, where the walk both starts and ends: samplesAlong would
      // put it at the start, the nearest point, so it's placed at the end by hand.
      const last = points.pop()!;
      return [...samplesAlong(mark, points), { t: 1, value: last.value, at: last.at }];
    },
    keyboard: true,
    markLabel: (d) => {
      if (d.series === "average") return `${d.name}: ${radarAxes.map((axis, i) => `${axis.toLowerCase()} ${ordinal(d.percentiles[i]!)}`).join(", ")} percentile`;
      const average = profiles.find((p) => p.series === "average")!;
      const above = radarAxes.filter((_, i) => d.percentiles[i]! > average.percentiles[i]!).map((axis) => axis.toLowerCase());
      return `${d.name}: above the league average in ${list(above)}`;
    },
    dim: true,
    on: { decorate: only("player", threshold({ compareTo: "average", when: "above", color: "series-2" })) }
  });
  const spoke = (element: Element, key: string): ReturnType<typeof describe.line> => {
    const cx = attr(element, "cx");
    const cy = attr(element, "cy");
    const r = attr(element, "r");
    const out = Math.hypot(cx - chart.center.x, cy - chart.center.y) || 1;
    const end = { x: cx + ((cx - chart.center.x) / out) * r, y: cy + ((cy - chart.center.y) / out) * r };
    return describe.line({ key, points: [chart.center, end], width: 2 * r });
  };
  const valueOptions = (words: (d: Value) => string): ExpressiveOptions<Value> => ({
    key: (d) => d.label,
    value: (d) => d.percentile,
    geometry: (element, _d, key) => spoke(element, key),
    keyboard: true,
    markLabel: words,
    dim: true,
    on: { hover: travel("dot") }
  });
  const player = attach(chart.values.player, valueOptions((d) => `${d.name}, ${d.label.toLowerCase()}: ${d.per90.toFixed(2)} per 90, ${ordinal(d.percentile)} percentile`));
  const average = attach(chart.values.average, valueOptions((d) => `${d.name}, ${d.label.toLowerCase()}: ${d.per90.toFixed(2)} per 90, ${ordinal(d.percentile)} percentile`));
  const linked = link([player, average], { by: ({ data }) => data.datum.axis });
  return {
    outlines,
    values: { player, average },
    link: linked,
    destroy() {
      linked.destroy();
      average.destroy();
      player.destroy();
      outlines.destroy();
    }
  };
}

// ── The butterfly ────────────────────────────────────────────────────────────

export interface ButterflyEffects {
  readonly halves: { readonly conceded: Attachment<Half>; readonly scored: Attachment<Half> };
  readonly link: Link;
  destroy(): void;
}

/**
 * Each half is an attachment of its own on the one <svg>, so baseline "auto" finds the edge each
 * half's rects share: the conceded bars grow left from their right edges and the scored bars right
 * from their left. Both draw in at load, and they're linked by band, so a bar lights its mirror.
 */
export function attachButterfly(chart: DrawnButterfly, attach: Attach = expressive): ButterflyEffects {
  const half = (source: DrawnButterfly["halves"]["scored"], word: string): Attachment<Half> =>
    attach(source, {
      key: (d) => d.band,
      value: (d) => d.goals,
      keyboard: true,
      markLabel: (d) => `${d.band} minutes: ${d.goals} ${word}`,
      dim: true,
      on: { enter: drawIn() }
    });
  const conceded = half(chart.halves.conceded, "conceded");
  const scored = half(chart.halves.scored, "scored");
  const linked = link([conceded, scored], { by: ({ data }) => data.datum.band });
  return {
    halves: { conceded, scored },
    link: linked,
    destroy() {
      linked.destroy();
      scored.destroy();
      conceded.destroy();
    }
  };
}
