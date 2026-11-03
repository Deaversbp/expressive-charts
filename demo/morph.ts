// The prototype's shot outcomes as a donutChart and as category columns on barChart, in one
// chartSwitch: each slice morphs into its own column and back (morph()), its labels moving with it. A
// toggle button switches, and a click mid-way reverses; the align control rebuilds the switch with the
// other mapping, so the two can be compared. Beside it, the same outcomes as bars, largest first, in
// one link() with the switch: hovering a bar hovers its slice or column, and the other way round.
// Below, the line page's season with missing weeks in a second chartSwitch of three views: goals and xG
// per match and season to date, each a lineChart, and goals per match as columns keyed as the lines'
// points, so each point grows into its column. Last, the shot outcomes again on a pie and on columns
// drawn with D3, each attached with expressive() and made a view with hostView(), in a third
// chartSwitch: the same morph on someone else's charts.
import { select } from "d3-selection";
import {
  barChart,
  chartSwitch,
  colorAssignment,
  donutChart,
  expressive,
  hostView,
  lineChart,
  link,
  morph,
  motionSwitch,
  type ChartSwitch,
  type ColorAssignment,
  type HostLabel,
  type Link,
  type MorphAlign
} from "../src/index";
import { drawOutcomeColumns } from "./d3-outcome-columns";
import { drawPie, type Slice } from "./d3-pie";

interface Outcome {
  readonly outcome: string;
  readonly shots: number;
}

// The prototype's shot outcomes for the season so far.
const outcomes: readonly Outcome[] = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];

/**
 * The two views. Each draws its chart with the switch's colours, so an outcome keeps its colour from
 * slice to column, and the columns colour by category to take them. Each chart's label is what the
 * switch announces when it lands there.
 */
const views = {
  donut: (container: HTMLElement, colors: ColorAssignment) =>
    donutChart<Outcome>(container, {
      label: "Shot outcomes, share of total",
      data: outcomes,
      category: "outcome",
      value: "shots",
      colors,
      table: { category: "Outcome" }
    }),
  columns: (container: HTMLElement, colors: ColorAssignment) =>
    barChart<Outcome>(container, {
      label: "Shot outcomes, counts",
      data: outcomes,
      x: "outcome",
      y: "shots",
      orientation: "vertical",
      colorBy: "category",
      colors,
      table: { category: "Outcome" }
    })
};
type View = keyof typeof views;

/** Each outcome's palette slot, pinned, and shared by the switch's views and the bars beside it, so an outcome has one colour in all three. */
const colors = colorAssignment({ Goal: 1, Saved: 2, "Off target": 3, Blocked: 4 });

/** Beside the switch: the same outcomes as bars, largest first, coloured by category as the columns are. */
const ranked = barChart<Outcome>("#ranked", {
  label: "Shot outcomes, largest first",
  data: outcomes,
  // Bars, not columns, so they can't be taken for the switch's other view: the outcome down the side.
  y: "outcome",
  x: "shots",
  sort: "value",
  colorBy: "category",
  colors,
  table: { category: "Outcome" }
});

/** morph()'s default mapping. The control picks either; the page starts on the library's default. */
let align: MorphAlign = "unroll";
let shots: ChartSwitch<typeof views> | undefined;
let linked: Link | undefined;

const toggleButton = document.querySelector<HTMLButtonElement>("#toggle");

/** The button names the view a click goes to. `current` is the view a switch is heading for. */
function showToggle(): void {
  if (toggleButton) toggleButton.textContent = shots?.current === "columns" ? "Show as donut" : "Show as columns";
}

/**
 * Builds the switch with the picked mapping, in `initial`, and links it with the bars. A switch's
 * transition can't change while it lives, so a new pick destroys it and builds it again, landed on the
 * view it was showing or heading for, and links the new one. Focus stays on the picker, which isn't
 * rebuilt.
 */
function build(initial: View): void {
  linked?.destroy();
  shots?.destroy();
  shots = chartSwitch("#shots", { views, initial, transition: morph({ align }), colors, announce: true });
  // Linked by outcome, each mark's key. The switch takes part through its view on show, so the link
  // holds across a switch: a hover held in the bars shows in the view that lands.
  linked = link([shots, ranked]);
  showToggle();
}
build("donut");

/** Switches to the other view. A second switch mid-way goes back from where the shapes are. */
function toggle(): void {
  if (!shots) return;
  void shots.show(shots.current === "donut" ? "columns" : "donut");
  showToggle();
}
toggleButton?.addEventListener("click", toggle);

// With a slice or column focused, V switches too, and focus follows its outcome into the other view.
// The button can't do that: a click moves focus to it, and focus that has left the switch stays put.
document.querySelector("#shots")?.addEventListener("keydown", (event) => {
  const key = (event as KeyboardEvent).key;
  if ((key !== "v" && key !== "V") || (event as KeyboardEvent).altKey || (event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey) return;
  if (!(event.target instanceof Element) || !event.target.closest(".ec-mark")) return;
  event.preventDefault();
  toggle();
});

/** Wires a row of toggle buttons; returns a function that shows a value as selected. */
function segmented(id: string, onPick: (value: string) => void): (value: string) => void {
  const group = document.getElementById(id);
  const buttons = Array.from(group?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  const show = (value: string): void => {
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.value === value));
  };
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const value = button.dataset.value ?? "";
      show(value);
      onPick(value);
    });
  }
  return show;
}

segmented("align", (value) => {
  if (value === align || !shots) return;
  align = value as MorphAlign;
  build(shots.current);
})(align);

// ── Goals and xG, with missing weeks ─────────────────────────────────────────

/** A matchweek as the feed recorded it: null where it has no value, which is a gap, not a zero. */
interface Week {
  readonly week: number;
  readonly goals: number | null;
  readonly xg: number | null;
}

/** The line page's season: seed 42, 38 matchweeks, cumulative goals and xG (a slow start, a hot streak, a late slump). */
function season(): { week: number; goals: number; xg: number }[] {
  let seed = 42;
  const random = (): number => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
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
  const weeks: { week: number; goals: number; xg: number }[] = [];
  let goals = 0;
  let xg = 0;
  for (let i = 0; i < 38; i++) {
    const chance = 0.6 + random() * 1.9;
    const form = i < 12 ? 0.72 : i < 26 ? 1.32 : 0.7;
    xg += chance;
    goals += poisson(chance * form);
    weeks.push({ week: i + 1, goals, xg: Math.round(xg * 10) / 10 });
  }
  return weeks;
}

/** The weeks the feed missed altogether, and the weeks it has goals but no xG for, as on the line page. */
const NO_FEED = [9, 10];
const NO_XG = [4, 5];
const full = season();
/** Season to date as the feed recorded it: the line page's chart with missing weeks. */
const toDate: Week[] = full.map((w) => ({
  week: w.week,
  goals: NO_FEED.includes(w.week) ? null : w.goals,
  xg: NO_FEED.includes(w.week) || NO_XG.includes(w.week) ? null : w.xg
}));
/** Each match's own goals and xG, with the same weeks missing. */
const perMatch: Week[] = full.map((w, i) => {
  const before = full[i - 1] ?? { goals: 0, xg: 0 };
  return {
    week: w.week,
    goals: NO_FEED.includes(w.week) ? null : w.goals - before.goals,
    xg: NO_FEED.includes(w.week) || NO_XG.includes(w.week) ? null : Math.round((w.xg - before.xg) * 10) / 10
  };
});
/** A match with goals, as a column. */
interface Played {
  readonly week: number;
  readonly goals: number;
  readonly xg: number | null;
}
/**
 * Goals per match as columns, for the weeks the feed has: a bar chart draws a missing value as 0, which
 * would say no goals were scored.
 */
const played: Played[] = perMatch.flatMap((d) => (d.goals === null ? [] : [{ week: d.week, goals: d.goals, xg: d.xg }]));

/** "1 goal", "18 goals". */
const goals = (value: number): string => `${value} ${value === 1 ? "goal" : "goals"}`;
/** "18 goals", "goals missing". */
const feedGoals = (d: Week): string => (d.goals === null ? "goals missing" : goals(d.goals));
/** "19.0 xG", "xG missing". */
const feedXg = (d: { readonly xg: number | null }): string => (d.xg === null ? "xG missing" : `${d.xg.toFixed(1)} xG`);
/** "+0.4 vs expected", to a tenth and signed, as the line page has it; nothing where either value is missing. */
function feedVersus(d: Week): string {
  if (d.goals === null || d.xg === null) return "";
  const tenths = Math.round((d.goals - d.xg) * 10) / 10;
  return `${tenths >= 0 ? "+" : ""}${tenths.toFixed(1)} vs expected`;
}

/** Every view is this tall, so the three share their grid cell without moving the card. */
const HEIGHT = 300;

/** One of the two line views: goals and xG, with what's missing said where a value would be, as on the line page. */
const lines = (container: HTMLElement, colors: ColorAssignment, data: readonly Week[], label: string, description: string) =>
  lineChart<Week>(container, {
    label,
    description,
    data,
    x: "week",
    series: ["goals", "xg"],
    colors,
    seriesLabels: { goals: "Goals scored", xg: "Expected goals (xG)" },
    labels: (value, series) => (series === "xg" ? `${value.toFixed(1)} xG` : goals(Math.round(value))),
    tooltip: (d) => [`Matchweek ${d.week}`, `${feedGoals(d)} · ${feedXg(d)}`, feedVersus(d)].filter(Boolean).join("\n"),
    // Each week's name has both its values, and says what's missing; the description adds only the gap.
    markLabel: (d) => `Matchweek ${d.week}: ${feedGoals(d)}, ${feedXg(d)}`,
    markDescription: feedVersus,
    table: { category: "Matchweek" },
    height: HEIGHT
  });

/**
 * The three views. The lines' points and the columns share their keys, `goals@12`, so each point grows
 * into its column; the two line charts' lines share theirs, `goals` and `xg`, so each morphs into the
 * other. Each chart's label is what the switch announces when it lands there.
 */
const seasonViews = {
  perMatch: (container: HTMLElement, colors: ColorAssignment) =>
    lines(container, colors, perMatch, "Goals and xG per match", "Goals scored and expected goals in each of 38 matchweeks, from a weekly feed. It has no values for matchweeks 9 and 10, and no xG for matchweeks 4 and 5."),
  toDate: (container: HTMLElement, colors: ColorAssignment) =>
    lines(container, colors, toDate, "Goals and xG, season to date", "Cumulative goals scored and expected goals over 38 matchweeks, from a weekly feed. It has no values for matchweeks 9 and 10, and no xG for matchweeks 4 and 5."),
  columns: (container: HTMLElement, colors: ColorAssignment) =>
    barChart<Played>(container, {
      label: "Goals per match, as columns",
      description: "Goals scored in each matchweek the feed has: it has no values for matchweeks 9 and 10.",
      data: played,
      x: "week",
      y: "goals",
      // Keyed as the line charts key their goals points, so each column pairs with its point.
      key: (d) => `goals@${d.week}`,
      orientation: "vertical",
      colors,
      seriesLabels: { goals: "Goals scored" },
      tooltip: (d) => `Matchweek ${d.week}\n${goals(d.goals)} · ${feedXg(d)}`,
      markLabel: (d) => `Matchweek ${d.week}: ${goals(d.goals)}`,
      markDescription: feedXg,
      table: { category: "Matchweek" },
      height: HEIGHT
    })
};
type SeasonView = keyof typeof seasonViews;
/** The views in the toggles' order, which V steps through. */
const seasonOrder: readonly SeasonView[] = ["perMatch", "toDate", "columns"];

// Goals take the first palette slot, as on the line page, and xG the second, which the page's CSS makes
// a dashed grey. Shared by the three views, so goals' points and columns have one colour.
const seasonSwitch = chartSwitch("#season", {
  views: seasonViews,
  initial: "perMatch",
  // morph() pairs the two charts' lines by week, so each week moves straight up or down, the corners
  // are each line's own as a switch starts and lands, and nothing is drawn in the weeks both miss.
  transition: morph(),
  colors: colorAssignment({ goals: 1, xg: 2 }),
  announce: true
});

/** Switches to `view`, and shows it picked. A pick mid-way reverses, or lands and goes on, as the switch decides. */
function showSeason(view: SeasonView): void {
  void seasonSwitch.show(view);
  pickSeason(view);
}

// Focus stays on the toggle.
const pickSeason = segmented("season-view", (value) => showSeason(value as SeasonView));
pickSeason(seasonSwitch.current);

// With a week or a column focused, V goes to the next view, and focus follows the week: from a week on
// a line to its goals' column, and back. The toggles can't do that: focus that has left the switch
// stays put, though the new view's tab stop goes to the same week, so Tab from them lands there.
document.querySelector("#season")?.addEventListener("keydown", (event) => {
  const { key, altKey, ctrlKey, metaKey, target } = event as KeyboardEvent;
  if ((key !== "v" && key !== "V") || altKey || ctrlKey || metaKey) return;
  if (!(target instanceof Element) || !target.closest(".ec-chart [data-key]")) return;
  event.preventDefault();
  showSeason(seasonOrder[(seasonOrder.indexOf(seasonSwitch.current) + 1) % seasonOrder.length]!);
});

// ── The same morph on D3 ─────────────────────────────────────────────────────

/** "1 shot", "112 shots". */
const shotCount = (value: number): string => `${value} ${value === 1 ? "shot" : "shots"}`;

/**
 * A view's <svg>, in the container the switch gives it: a group, not an image, since screen readers
 * skip what's inside an image and its marks take focus, named for the switch to announce when it lands.
 */
function hostSvg(container: HTMLElement, name: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", name);
  container.appendChild(svg);
  return svg;
}

/**
 * The labels a D3 chart draws that move with their marks: each outcome's name and its count, keyed
 * by outcome, read from the chart as it is now. Read as each switch starts, so they follow a redraw.
 */
function namedLabels<D>(svg: SVGSVGElement, outcome: (datum: D) => string): HostLabel[] {
  const labels: HostLabel[] = [];
  for (const [selector, role] of [["text.host-label", "category"], ["text.host-value", "value"]] as const) {
    select(svg)
      .selectAll<SVGTextElement, D>(selector)
      .each(function (datum) {
        labels.push({ element: this, key: outcome(datum), role });
      });
  }
  return labels;
}

/** Each view's redraw at the card's width: its D3 code draws again, and refresh() reads its marks. */
const d3Redraws: (() => void)[] = [];

/**
 * The two views, each a D3 chart drawn in its container and attached with expressive(), keyed by
 * outcome, so each slice pairs with its column. The page's CSS colours both by outcome, in the slots
 * the first switch gives them, so nothing changes colour as it morphs. Each <svg>'s aria-label is
 * what the switch announces when it lands there.
 */
const d3Views = {
  pie: (container: HTMLElement) => {
    const svg = hostSvg(container, "Shot outcomes on a D3 pie, share of total");
    // Data order from 12 o'clock, as the donut above: d3.pie() would sort largest first.
    const draw = () => drawPie(svg, outcomes, { sort: "none" }).slices;
    const effects = expressive(draw(), {
      key: (d) => d.data.outcome,
      // What each slice shows, so a redraw at a new width isn't taken for a change.
      value: (d) => d.value,
      keyboard: true,
      // Named as the donut above names its slices: "Saved: 112 shots, 28%".
      markLabel: (d) => `${d.data.outcome}: ${shotCount(d.value)}, ${Math.round(((d.endAngle - d.startAngle) / (2 * Math.PI)) * 100)}%`,
      dim: true
    });
    d3Redraws.push(() => effects.refresh(draw()));
    return hostView(effects, { labels: () => namedLabels<Slice>(svg, (d) => d.data.outcome) });
  },
  columns: (container: HTMLElement) => {
    const svg = hostSvg(container, "Shot outcomes on D3 columns, counts");
    const draw = () => drawOutcomeColumns(svg, outcomes).columns;
    const effects = expressive(draw(), {
      key: (d) => d.outcome,
      value: (d) => d.shots,
      keyboard: true,
      // Named as the columns above name theirs: "Saved: 112 shots".
      markLabel: (d) => `${d.outcome}: ${shotCount(d.shots)}`,
      dim: true
    });
    d3Redraws.push(() => effects.refresh(draw()));
    return hostView(effects, { labels: () => namedLabels<Outcome>(svg, (d) => d.outcome) });
  }
};
type D3View = keyof typeof d3Views;

// morph()'s default mapping, unroll: the first card's Morph control is that card's own.
const d3Shots = chartSwitch("#d3-shots", { views: d3Views, initial: "pie", transition: morph(), announce: true });

const d3Toggle = document.querySelector<HTMLButtonElement>("#d3-toggle");

/** The button names the view a click goes to, as the first card's does. */
function showD3Toggle(): void {
  if (d3Toggle) d3Toggle.textContent = d3Shots.current === "columns" ? "Show as pie" : "Show as columns";
}

/** Switches playing: the D3 charts aren't drawn again under one, since the switch has hidden the marks they had. */
let d3Playing = 0;
/** A resize came while a switch played, so the charts draw again once it lands. */
let d3RedrawLater = false;

function redrawD3(): void {
  if (d3Playing > 0) d3RedrawLater = true;
  else for (const redraw of d3Redraws) redraw();
}

/** Switches to the other view. A second switch mid-way goes back from where the shapes are. */
function toggleD3(): void {
  const next: D3View = d3Shots.current === "pie" ? "columns" : "pie";
  d3Playing++;
  const settled = (): void => {
    d3Playing--;
    if (d3Playing === 0 && d3RedrawLater) {
      d3RedrawLater = false;
      redrawD3();
    }
  };
  void d3Shots.show(next).then(settled, settled);
  showD3Toggle();
}
d3Toggle?.addEventListener("click", toggleD3);

// With a slice or column focused, V switches too, and focus follows its outcome into the other view,
// as on the first card. The D3 charts' own classes say which elements are marks.
document.querySelector("#d3-shots")?.addEventListener("keydown", (event) => {
  const { key, altKey, ctrlKey, metaKey, target } = event as KeyboardEvent;
  if ((key !== "v" && key !== "V") || altKey || ctrlKey || metaKey) return;
  if (!(target instanceof Element) || !target.matches("path.slice, rect.column")) return;
  event.preventDefault();
  toggleD3();
});

// The D3 charts draw at their container's width, so they draw again when it changes.
window.addEventListener("resize", redrawD3);

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
motionSwitch("#motion");
