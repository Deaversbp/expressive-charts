// The layouts page's data, and what each of its views gives expressive() and hostView(). demo/layouts.ts
// puts each card's views in a chart switch and wires the page; src/layouts.test.ts builds the same
// views with the same functions, on a clock it controls, so the page and its test can't drift apart.
// Each chart is drawn by its own module, which knows nothing about expressive-charts; everything the
// adapter can't read from an element by its tag is said here (CLAUDE.md rule 3: no effect knows a chart).

import { expressive, hostView, link, travel, type ChartSwitchViewFactory, type ExpressiveOptions, type HostGuide, type HostLabel, type HostView, type MarkSource } from "../src/index";
import { count, players as halves, ordinal, profiles, radarAxes, type Attach } from "./charts-effects";
import { drawDumbbell, type Dot, type Row } from "./d3-dumbbell";
import { drawDumbbellBars } from "./d3-dumbbell-bars";
import { drawLayoutAreas, type AreaLayout } from "./d3-layout-areas";
import { drawLayoutBars, type BarLayout, type BarPlayer, type BarSegment } from "./d3-layout-bars";
import { drawRadar, type DrawnRadar, type Value } from "./d3-radar";
import { drawRadarBars } from "./d3-radar-bars";
import { drawScorerBars } from "./d3-scorer-bars";
import type { Band, ShotSeries, ShotWeek } from "./d3-shapes";
import { drawTreemap, type Scorer, type Tile } from "./d3-treemap";

export { halves, profiles, radarAxes, type Attach };

// ── The data ─────────────────────────────────────────────────────────────────

/** A player as the bars page has them: a position, goals and assists. */
export interface Player extends BarPlayer {
  readonly pos: string;
}

/** The bars page's eight players, after matchweek 24, as it has them. */
export const players: readonly Player[] = [
  { name: "Okafor", pos: "Forward", goals: 16, assists: 4 },
  { name: "Lindqvist", pos: "Forward", goals: 10, assists: 7 },
  { name: "Moreau", pos: "Winger", goals: 8, assists: 3 },
  { name: "Tanaka", pos: "Midfielder", goals: 6, assists: 10 },
  { name: "Reyes", pos: "Winger", goals: 5, assists: 4 },
  { name: "Adeyemi", pos: "Midfielder", goals: 4, assists: 6 },
  { name: "Novak", pos: "Defender", goals: 3, assists: 1 },
  { name: "Castillo", pos: "Midfielder", goals: 1, assists: 5 }
];

/**
 * Everyone who scored this season: the eight players, whose goals come to 53, and the others who scored
 * the rest, 58 in all, the season the charts page's butterfly has.
 */
export const scorers: readonly Scorer[] = [
  ...players.map(({ name, pos, goals }): Scorer => ({ name, pos, goals })),
  { name: "Haddad", pos: "Defender", goals: 2 },
  { name: "Brennan", pos: "Winger", goals: 1 },
  { name: "Sousa", pos: "Midfielder", goals: 1 },
  { name: "Kowalski", pos: "Defender", goals: 1 }
];
/** The season's goals: 58. */
export const seasonGoals: number = scorers.reduce((sum, s) => sum + s.goals, 0);

/** A seeded random source, so every visit draws the same season. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
}

/** The line page's season, seed 42: each matchweek's expected goals, as the shapes page draws its shots from them. */
function season(): { week: number; xg: number }[] {
  const random = seeded(42);
  const poisson = (lambda: number): number => {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= random();
    } while (p > limit);
    return k - 1;
  };
  return Array.from({ length: 38 }, (_, i) => {
    const chance = 0.6 + random() * 1.9;
    const form = i < 12 ? 0.72 : i < 26 ? 1.32 : 0.7;
    // Drawn, as the shapes page does, so the random source is where it is there.
    poisson(chance * form);
    return { week: i + 1, xg: chance };
  });
}

/** A value's average over the last five matches up to the i-th, or as many as there have been. */
function lastFive<T>(rows: readonly T[], i: number, value: (row: T) => number): number {
  const window = rows.slice(Math.max(0, i - 4), i + 1);
  return window.reduce((sum, row) => sum + value(row), 0) / window.length;
}

// Shots follow the chances: more xG, more shots, and about a third of them on target. The shapes page's.
const shotRandom = seeded(7);
/** Each match's shots on target and off it, as the shapes page has them. */
export const shots: readonly ShotWeek[] = season().map((m) => {
  const all = Math.round(6 + m.xg * 4 + shotRandom() * 4);
  const onTarget = Math.round(all * (0.28 + shotRandom() * 0.14));
  return { week: m.week, onTarget, offTarget: all - onTarget };
});
/** Each matchweek's shots on target and off it, each a five-match average: the shapes page's area. */
export const shotForm: readonly ShotWeek[] = shots.map((m, i) => ({ week: m.week, onTarget: lastFive(shots, i, (w) => w.onTarget), offTarget: lastFive(shots, i, (w) => w.offTarget) }));
/** Each series' shots over the season, from the matches themselves. */
export const shotTotal = (series: ShotSeries): number => shots.reduce((sum, w) => sum + w[series], 0);

// ── Words ────────────────────────────────────────────────────────────────────

/** "1 goal", "16 goals"; "1 assist", "4 assists". */
const segmentWords = (d: BarSegment): string => count(d.value, d.series === "goals" ? "goal" : "assist");
/** "Shots on target", "Shots off target". */
const SHOT_NAMES: Readonly<Record<ShotSeries, string>> = { onTarget: "Shots on target", offTarget: "Shots off target" };
/** "Okafor, goals: 0.50 per 90, 96th percentile", as the charts page names the radar's values. */
const valueWords = (d: Value): string => `${d.name}, ${d.label.toLowerCase()}: ${d.per90.toFixed(2)} per 90, ${ordinal(d.percentile)} percentile`;

// ── Views ────────────────────────────────────────────────────────────────────

/** A card's views by name, for chartSwitch(), and its charts drawn again. */
export interface LayoutCard<V extends string> {
  readonly views: { readonly [K in V]: ChartSwitchViewFactory };
  /** Draws each view's chart again at its container's width, and refreshes its attachment: the page's resize. */
  redraw(): void;
}

/**
 * A view's <svg>, in the container the switch gives it: a group, not an image, since screen readers
 * skip what's inside an image and its marks take focus, named for the switch to announce when it lands.
 */
export function hostSvg(container: HTMLElement, name: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", name);
  svg.setAttribute("class", "chart");
  container.appendChild(svg);
  return svg;
}

/** Where a chart's labels are, by selector, with each one's role and its mark's key from its D3 row. */
type LabelReading = readonly [selector: string, role: HostLabel["role"], key: (datum: never) => string];

/**
 * The labels a D3 chart draws that move with their marks, each keyed to its mark, read from the chart
 * as it is now. Read as each switch starts, so they follow a redraw.
 */
function namedLabels(svg: SVGSVGElement, readings: readonly LabelReading[]): () => HostLabel[] {
  return () =>
    readings.flatMap(([selector, role, key]) =>
      [...svg.querySelectorAll<SVGTextElement>(selector)].map((element): HostLabel => ({ element, key: (key as (datum: unknown) => string)((element as unknown as { __data__: unknown }).__data__), role }))
    );
}

/** Where a chart's guides are, by selector, with each one's key from its D3 row. */
type GuideReading = readonly [selector: string, key: (datum: never) => string];

/**
 * The parts of a D3 chart that another view of the card draws the same (an axis, a tick), each keyed,
 * read from the chart as it is now. A guide whose key the next view has too, drawn the same, stays where
 * it is through the switch; every other fades with its view.
 */
function namedGuides(svg: SVGSVGElement, readings: readonly GuideReading[]): () => HostGuide[] {
  return () =>
    readings.flatMap(([selector, key]) =>
      [...svg.querySelectorAll(selector)].map((element): HostGuide => ({ element, key: (key as (datum: unknown) => string)((element as unknown as { __data__: unknown }).__data__) }))
    );
}

/** What a view is made of: its name, its chart, how it's attached, its labels and its guides. */
interface ViewParts<D> {
  /** The <svg>'s aria-label, which the switch announces. */
  readonly name: string;
  /** Draws the chart in its <svg> and returns its marks. */
  readonly draw: (svg: SVGSVGElement) => MarkSource<D>;
  /** Draws it again at its container's width and returns its marks: `draw` again, unless the chart has its own. */
  readonly again?: () => MarkSource<D>;
  readonly options: ExpressiveOptions<D>;
  readonly labels: readonly LabelReading[];
  readonly guides?: readonly GuideReading[];
}

/**
 * One view in `container`: its <svg>, its chart drawn and attached, its redraw kept for the card's,
 * and the attachment made a view with its labels and guides.
 */
function view<D>(container: HTMLElement, attach: Attach, redraws: (() => void)[], parts: ViewParts<D>): HostView<D> {
  const svg = hostSvg(container, parts.name);
  const fx = attach(parts.draw(svg), parts.options);
  redraws.push(() => fx.refresh(parts.again ? parts.again() : parts.draw(svg)));
  return hostView(fx, { labels: namedLabels(svg, parts.labels), ...(parts.guides && { guides: namedGuides(svg, parts.guides) }) });
}

/** The bars' names: "Goals and assists by player on D3 bars, side by side". */
const BAR_NAMES: Readonly<Record<BarLayout, string>> = {
  side: "Goals and assists by player on D3 bars, side by side",
  stacked: "Goals and assists by player on D3 bars, stacked",
  share: "Goals and assists by player on D3 bars, as shares of 100%"
};

/**
 * The bars card: the eight players' goals and assists side by side, stacked and at 100%, each segment a
 * <rect> keyed `series@player`, so it pairs with itself in every view. A segment floats in a stack, so
 * `baseline` is "left" (auto looks for an edge every rect has). Each is named with its player, its
 * series, its value and at 100% its share. The players' names are labels keyed to their goals, and each
 * segment's number to its segment, so a count swaps to its share at 100%. The axis is a guide keyed by
 * its scale: side by side and stacked share 0 to 20, so it stays put between them, and 100%'s fades.
 */
export function barsCard(attach: Attach = expressive): LayoutCard<BarLayout> {
  const redraws: (() => void)[] = [];
  const make =
    (layout: BarLayout): ChartSwitchViewFactory =>
    (container) =>
      view<BarSegment>(container, attach, redraws, {
        name: BAR_NAMES[layout],
        draw: (svg) => drawLayoutBars(svg, players, layout).segments,
        options: {
          key: (d) => `${d.series}@${d.player}`,
          value: (d) => d.value,
          baseline: "left",
          keyboard: true,
          markLabel: (d) => (layout === "share" ? `${d.player}: ${segmentWords(d)}, ${d.percent}% of ${d.total} goals and assists` : `${d.player}: ${segmentWords(d)}`),
          dim: true
        },
        labels: [
          ["text.host-label", "category", (d: BarPlayer) => `goals@${d.name}`],
          ["text.host-value", "value", (d: BarSegment) => `${d.series}@${d.player}`]
        ],
        guides: [["g.bars-axis", () => (layout === "share" ? "axis@share" : "axis@count")]]
      });
  return { views: { side: make("side"), stacked: make("stacked"), share: make("share") }, redraw: () => redraws.forEach((redraw) => redraw()) };
}

const AREA_NAMES: Readonly<Record<AreaLayout, string>> = {
  stacked: "Shots on and off target per match on a D3 area, stacked",
  share: "Shots on and off target per match on a D3 area, as shares of 100%"
};

/**
 * The areas card: shots on and off target per match, five-match averages, as two d3.area() bands,
 * stacked and at 100%. Each path is read by its tag as a closed shape, keyed by series, and the two
 * layouts span the same x's, so morph() pairs each week with itself. Each is named with its season
 * total or its share. The names at the bands' right ends are labels keyed by series. Each week under
 * the plot is a guide keyed by its week, so both layouts keep it; the counts and shares fade.
 */
export function areasCard(attach: Attach = expressive): LayoutCard<AreaLayout> {
  const redraws: (() => void)[] = [];
  const all = shotTotal("onTarget") + shotTotal("offTarget");
  const make =
    (layout: AreaLayout): ChartSwitchViewFactory =>
    (container) =>
      view<Band>(container, attach, redraws, {
        name: AREA_NAMES[layout],
        draw: (svg) => drawLayoutAreas(svg, shotForm, layout).bands,
        options: {
          key: (d) => d.series,
          value: (d) => shotTotal(d.series),
          keyboard: true,
          markLabel: (d) =>
            layout === "share"
              ? `${SHOT_NAMES[d.series]}: ${Math.round((shotTotal(d.series) / all) * 100)}% of ${all} shots in ${shots.length} matches`
              : `${SHOT_NAMES[d.series]}: ${shotTotal(d.series)} in ${shots.length} matches`,
          dim: true
        },
        labels: [["text.host-label", "category", (series: ShotSeries) => series]],
        guides: [["text.x-tick", (week: number) => `week@${week}`]]
      });
  return { views: { stacked: make("stacked"), share: make("share") }, redraw: () => redraws.forEach((redraw) => redraw()) };
}

export type RadarView = "radar" | "bars";

/** A value's key: its series and its axis, "player@Goals". */
const valueKey = (d: Value): string => `${d.series}@${d.label}`;

/**
 * The radar card: Okafor's six numbers per 90 and the league average's, as percentiles, on the charts
 * page's radar, drawn with drawRadar() unchanged, and as bars. The radar's circles are one attachment,
 * both series' together, each keyed `series@axis` and read by its tag as a point; its outlines, rings
 * and spokes aren't marks, so they fade with their view. Each bar has its circle's key. The axis names
 * are labels keyed to the player's circles, so they move to the bars' names; the bars' percentiles
 * have no partner, so they fade in.
 */
export function radarCard(attach: Attach = expressive): LayoutCard<RadarView> {
  const redraws: (() => void)[] = [];
  const options: ExpressiveOptions<Value> = { key: valueKey, value: (d) => d.percentile, keyboard: true, markLabel: valueWords, dim: true };
  const radar: ChartSwitchViewFactory = (container) => {
    let chart: DrawnRadar | undefined;
    const circles = (): SVGCircleElement[] => [...chart!.values.player.nodes(), ...chart!.values.average.nodes()];
    return view<Value>(container, attach, redraws, {
      name: "Okafor against the league average per 90 minutes on a D3 radar",
      draw: (svg) => {
        chart = drawRadar(svg, radarAxes, profiles);
        return circles();
      },
      // drawRadar() draws once; its resize() draws it again at the new width.
      again: () => {
        chart!.resize();
        return circles();
      },
      options,
      labels: [["text.axis-name", "category", (label: string) => `player@${label}`]]
    });
  };
  const bars: ChartSwitchViewFactory = (container) =>
    view<Value>(container, attach, redraws, {
      name: "Okafor against the league average per 90 minutes on D3 bars, as percentiles",
      draw: (svg) => drawRadarBars(svg, radarAxes, profiles).bars,
      options: { ...options, baseline: "left" },
      labels: [
        ["text.host-label", "category", (label: string) => `player@${label}`],
        ["text.host-value", "value", valueKey]
      ]
    });
  return { views: { radar, bars }, redraw: () => redraws.forEach((redraw) => redraw()) };
}

export type TreemapView = "treemap" | "bars";

/** "Okafor, forward: 16 goals". */
const scorerWords = (s: Scorer): string => `${s.name}, ${s.pos.toLowerCase()}: ${count(s.goals, "goal")}`;

/**
 * The treemap card: every scorer's goals, the season's 58, as a d3-hierarchy treemap grouped by
 * position, and as bars sorted by goals, both coloured by position. Each tile and each bar is keyed by
 * scorer. A tile shares no edge with every other, so `baseline` is "left", and so is the bars': each
 * tile's sides pair with its bar's. The names and goals are labels keyed by scorer; a tile too small for
 * them has none, so its bar's fade in.
 */
export function treemapCard(attach: Attach = expressive): LayoutCard<TreemapView> {
  const redraws: (() => void)[] = [];
  const treemap: ChartSwitchViewFactory = (container) =>
    view<Tile>(container, attach, redraws, {
      name: `The season's ${seasonGoals} goals by scorer and position on a D3 treemap`,
      draw: (svg) => drawTreemap(svg, scorers).tiles,
      options: {
        key: (d) => d.data.name,
        value: (d) => d.data.goals,
        baseline: "left",
        keyboard: true,
        markLabel: (d) => `${scorerWords(d.data)}, ${Math.round((d.data.goals / seasonGoals) * 100)}% of ${seasonGoals}`,
        dim: true
      },
      labels: [
        ["text.host-label", "category", (d: Tile) => d.data.name],
        ["text.host-value", "value", (d: Tile) => d.data.name]
      ]
    });
  const bars: ChartSwitchViewFactory = (container) =>
    view<Scorer>(container, attach, redraws, {
      name: `The season's ${seasonGoals} goals by scorer on D3 bars, most first`,
      draw: (svg) => drawScorerBars(svg, scorers).bars,
      options: { key: (d) => d.name, value: (d) => d.goals, baseline: "left", keyboard: true, markLabel: scorerWords, dim: true },
      labels: [
        ["text.host-label", "category", (d: Scorer) => d.name],
        ["text.host-value", "value", (d: Scorer) => d.name]
      ]
    });
  return { views: { treemap, bars }, redraw: () => redraws.forEach((redraw) => redraw()) };
}

export type DumbbellView = "dumbbell" | "bars";

/** "Okafor: 10 goals in the first half"; "Okafor: 6 goals in the second half, down 4", its change from the first. */
function halfWords(d: Dot): string {
  const words = `${d.name}: ${count(d.value, d.metric === "goals" ? "goal" : "assist")} in the ${d.half} half`;
  if (d.half === "first") return words;
  const first = halves.find((player) => player.name === d.name)![d.metric].first;
  return `${words}, ${d.value > first ? `up ${d.value - first}` : d.value < first ? `down ${first - d.value}` : "no change"}`;
}

const DUMBBELL_NAMES: Readonly<Record<DumbbellView, string>> = {
  dumbbell: "Goals in each half by player on a D3 dumbbell",
  bars: "Goals in each half by player on D3 bars, side by side"
};

/**
 * The dumbbell card: the charts page's eight players and their goals in each half, on its dumbbell,
 * drawn with drawDumbbell() unchanged, and as bars side by side. The dumbbell is three attachments, as
 * the charts page has it, each half's dots and the lines between them, linked by player, so any part
 * of a row lights the row and its line's hover shows the way it goes. Here they're keyed apart, the
 * dots by half and player (`first@Okafor`) and the lines by player, so hostView() can make them one
 * view. The dots take the keyboard and the names, not the lines: each dot grows into its half's bar,
 * which has its key, and focus goes with it; the lines have no partner, so they fade. The players'
 * names are labels keyed to their first half, as the bars' are, and the bars' numbers fade in. Both
 * views draw the same axis, a guide, so it stays put.
 */
export function dumbbellCard(attach: Attach = expressive): LayoutCard<DumbbellView> {
  const redraws: (() => void)[] = [];
  const dotKey = (d: Dot): string => `${d.half}@${d.name}`;
  const options: ExpressiveOptions<Dot> = { key: dotKey, value: (d) => d.value, keyboard: true, markLabel: halfWords, dim: true };
  const names: LabelReading = ["text.name", "category", (d: Row) => `first@${d.name}`];
  const axis: GuideReading = ["g.axes", () => "axis"];
  const dumbbell: ChartSwitchViewFactory = (container) => {
    const svg = hostSvg(container, DUMBBELL_NAMES.dumbbell);
    const chart = drawDumbbell(svg, halves, "goals");
    const first = attach(chart.dots.first, options);
    const second = attach(chart.dots.second, options);
    const lines = attach(chart.connectors, { key: (d) => d.name, dim: true, on: { hover: travel("arrow", { ride: "on" }) } });
    // A destroyed attachment drops out of its link.
    link([first, second, lines], { by: ({ data }) => data.datum.name });
    // drawDumbbell() draws once; its resize() draws it again at the new width.
    redraws.push(() => {
      chart.resize();
      first.refresh(chart.dots.first);
      second.refresh(chart.dots.second);
      lines.refresh(chart.connectors);
    });
    const view = hostView([first, second, lines], { labels: namedLabels(svg, [names]), guides: namedGuides(svg, [axis]) });
    // Each half's dots keep a tab stop of their own, and a row's two dots are side by side in the
    // document, so a stop follows the other half's focus to its row: Tab from a first half lands on its
    // second half, and Shift+Tab back, wherever the arrow keys have gone.
    for (const [half, other] of [
      [first, "second"],
      [second, "first"]
    ] as const) {
      half.on("hover", ({ mark, source }) => {
        if (source === "keyboard") view.moveTabStop(`${other}@${mark.key.slice(mark.key.indexOf("@") + 1)}`);
      });
    }
    return view;
  };
  const bars: ChartSwitchViewFactory = (container) =>
    view<Dot>(container, attach, redraws, {
      name: DUMBBELL_NAMES.bars,
      draw: (svg) => drawDumbbellBars(svg, halves, "goals").bars,
      options: { ...options, baseline: "left" },
      labels: [names, ["text.value", "value", dotKey]],
      guides: [axis]
    });
  return { views: { dumbbell, bars }, redraw: () => redraws.forEach((redraw) => redraw()) };
}
