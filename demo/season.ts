// The season so far, after matchweek 24: goals per matchweek on barChart, goals vs xG on lineChart and
// shots per matchweek on columns drawn with D3, in one link(), so hovering a matchweek in any of them
// shows it in the others; the players' goals on barChart, each change since the last matchweek rising
// past its bar with delta(); and a D3 slope chart of each player's goals at matchweek 1 and now, its
// change written past each name with label(). "Play next matchweek" moves the whole page on a week,
// and nothing plays by itself.
import {
  barChart,
  delta,
  describe,
  expressive,
  flash,
  label,
  lineChart,
  link,
  motionSwitch,
  parallel,
  trace,
  travel,
  type Link
} from "../src/index";
import { soccerBall } from "../src/icons/sport/index";
import { drawColumns } from "./d3-columns";
import { drawSlopes, type Slope } from "./d3-slope";

/** Harbor City FC's scorers, with how often each scores, relative to the others. */
const squad = [
  { name: "Okafor", pos: "Forward", share: 4.2 },
  { name: "Lindqvist", pos: "Forward", share: 3.0 },
  { name: "Moreau", pos: "Winger", share: 2.2 },
  { name: "Tanaka", pos: "Midfielder", share: 1.6 },
  { name: "Reyes", pos: "Winger", share: 1.5 },
  { name: "Adeyemi", pos: "Midfielder", share: 1.1 },
  { name: "Novak", pos: "Defender", share: 0.6 },
  { name: "Castillo", pos: "Midfielder", share: 0.5 }
] as const;

interface Week {
  readonly week: number;
  readonly goals: number;
  readonly xg: number;
  readonly shots: number;
  /** Goals and xG so far, for the line. */
  readonly totalGoals: number;
  readonly totalXg: number;
  /** Who scored this week, and how many. */
  readonly scorers: Readonly<Record<string, number>>;
}

interface Player {
  readonly name: string;
  readonly pos: string;
  /** Goals so far. */
  readonly goals: number;
  /** Goals in the last matchweek. */
  readonly change: number;
  /** Goals at matchweek 1. */
  readonly first: number;
}

/** A seeded season of 38 matchweeks, so every visit plays the same one: a slow start, a hot streak, a late slump. */
function season(): Week[] {
  let seed = 670;
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
  const shares = squad.reduce((sum, player) => sum + player.share, 0);
  const weeks: Week[] = [];
  let totalGoals = 0;
  let totalXg = 0;
  for (let i = 0; i < 38; i++) {
    const xg = Math.round((0.6 + random() * 1.9) * 10) / 10;
    const form = i < 12 ? 0.8 : i < 26 ? 1.25 : 0.8;
    const goals = poisson(xg * form);
    const scorers: Record<string, number> = Object.fromEntries(squad.map((player) => [player.name, 0]));
    for (let goal = 0; goal < goals; goal++) {
      let pick = random() * shares;
      const scorer = squad.find((player) => (pick -= player.share) <= 0) ?? squad[0];
      scorers[scorer.name]!++;
    }
    const shots = Math.round(xg * 5 + 4 + random() * 5);
    totalGoals += goals;
    totalXg = Math.round((totalXg + xg) * 10) / 10;
    weeks.push({ week: i + 1, goals, xg, shots, totalGoals, totalXg, scorers });
  }
  return weeks;
}

const weeks = season();
const LAST = weeks.length;
/** The matchweek the page is at. */
let now = 24;

const weeksSoFar = (): Week[] => weeks.slice(0, now);
function players(): Player[] {
  const played = weeksSoFar();
  return squad.map(({ name, pos }) => ({
    name,
    pos,
    goals: played.reduce((sum, week) => sum + week.scorers[name]!, 0),
    change: played[played.length - 1]!.scorers[name]!,
    first: played[0]!.scorers[name]!
  }));
}
const slopes = (rows: readonly Player[]): Slope[] => rows.map(({ name, first, goals }) => ({ name, first, now: goals }));

/** "1 goal", "14 goals". */
const goals = (value: number): string => `${value} ${value === 1 ? "goal" : "goals"}`;
/** "1 shot", "16 shots". */
const shots = (value: number): string => `${value} ${value === 1 ? "shot" : "shots"}`;
/** "+1", "0", "-2": signed, as delta words a change. */
const signed = (value: number): string => (value > 0 ? `+${value}` : String(value));
/** "+0.4", "-2.6": to a tenth, signed, as the line page's Difference column has it. */
function tenths(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

// ── Linked by matchweek ──────────────────────────────────────────────────────

// The weeks' columns: the ball rolls up a column, on its own hover and on a linked one.
const goalsChart = barChart<Week>("#goals", {
  label: "Goals per matchweek",
  data: weeksSoFar(),
  x: "week",
  y: "goals",
  orientation: "vertical",
  height: 180,
  colors: { goals: 1 },
  seriesLabels: { goals: "Goals" },
  tooltip: (d) => `Matchweek ${d.week}\n${goals(d.goals)} · ${d.xg.toFixed(1)} xG\n${shots(d.shots)}`,
  // Each week's name has its goals; its description adds what the name doesn't say.
  markLabel: (d) => `Matchweek ${d.week}: ${goals(d.goals)}`,
  markDescription: (d) => `${d.xg.toFixed(1)} xG, ${shots(d.shots)}`,
  // The D3 columns have no table of their own, so this one has their shots too.
  table: {
    category: "Matchweek",
    columns: [
      { label: "xG", field: "xg", format: (value) => (value as number).toFixed(1), after: "values" },
      { label: "Shots", field: "shots", after: "values" }
    ]
  },
  on: { hover: travel(soccerBall) }
});

// The season to date, as on line.html: each week's points pulse when it's hovered, or linked.
const line = lineChart<Week>("#line", {
  label: "Goals vs expected goals, season to date",
  description: "Goals scored and expected goals so far, week by week.",
  data: weeksSoFar(),
  x: "week",
  series: ["totalGoals", "totalXg"],
  // xG takes slot 2, which the page's CSS makes a dashed grey.
  colors: { totalGoals: 1, totalXg: 2 },
  seriesLabels: { totalGoals: "Goals scored", totalXg: "Expected goals (xG)" },
  labels: (value, series) => (series === "totalXg" ? `${value.toFixed(1)} xG` : goals(Math.round(value))),
  tooltip: (d) => `Matchweek ${d.week}\n${goals(d.totalGoals)} · ${d.totalXg.toFixed(1)} xG\n${tenths(d.totalGoals - d.totalXg)} vs expected`,
  markLabel: (d) => `Matchweek ${d.week}: ${goals(d.totalGoals)}, ${d.totalXg.toFixed(1)} xG`,
  markDescription: (d) => `${tenths(d.totalGoals - d.totalXg)} vs expected`,
  table: { category: "Matchweek" },
  height: 270,
  on: { hover: "pulse" }
});

// The D3 columns draw themselves; expressive() reads each rect as a column, keyed by its week as the
// others are, so the link needs no `by`.
const shotsSvg = document.querySelector<SVGSVGElement>("#shots");
if (!shotsSvg) throw new Error("demo/season.html has no #shots.");
const shotColumns = drawColumns(shotsSvg, weeksSoFar());
const shotEffects = expressive(shotColumns.columns, {
  key: (d) => d.week,
  // What each column shows, so a resize isn't taken for a change.
  value: (d) => d.shots,
  keyboard: true,
  markLabel: (d) => `Matchweek ${d.week}: ${shots(d.shots)}`,
  dim: true,
  on: { hover: "pulse" }
});

// One link: a matchweek hovered in any of the three, by the pointer or the keyboard, is hovered in the
// others too. Linked marks get no tooltip or focus, and nothing is announced. A link's options are
// fixed, so the toggle links them again.
const linkedCharts = [goalsChart, line, shotEffects];
let linked: Link = link(linkedCharts);

// ── Since the last matchweek ─────────────────────────────────────────────────

/**
 * Each player who scored flashes, and their change rises past their bar and stays. The change is read
 * from the rows, not the bar: a matchweek played while the last is still moving would otherwise count
 * from the bar part way there ("+1.88").
 */
const changes = parallel(flash(), delta<Player>({ value: (data) => data.datum.goals }));
/** Set while a matchweek updates the players' chart, so its announcement can say what changed. */
let announcing: string | undefined;

const playersChart = barChart<Player>("#players", {
  label: "Goals by player",
  data: players(),
  y: "name",
  x: "goals",
  sort: "value",
  colors: { goals: 1 },
  seriesLabels: { goals: "Goals" },
  markLabel: (d) => `${d.name}: ${goals(d.goals)}`,
  tooltip: (d) => `${d.name} · ${d.pos}\n${goals(d.goals)}`,
  markDescription: (d) => d.pos,
  // The changes delta() and label() write over the charts aren't read by screen readers: the table
  // says them too.
  table: {
    category: "Player",
    columns: [
      { label: "Position", field: "pos" },
      { label: "Change", field: "change", format: (value) => signed(value as number), after: "values" },
      { label: "Since matchweek 1", field: (d) => d.goals - d.first, format: (value) => signed(value as number), after: "values" }
    ]
  },
  // The page says each change, as delta() shows it ("Okafor +1"), with the total it makes.
  announce: () => announcing,
  on: { update: changes }
});

// ── The season so far ────────────────────────────────────────────────────────

// The D3 slope chart draws itself; expressive() describes each line from the same points, with the
// box of the player's name as its own label, so label() writes past the name rather than on it.
const slopeSvg = document.querySelector<SVGSVGElement>("#slope");
if (!slopeSvg) throw new Error("demo/season.html has no #slope.");
const slopeChart = drawSlopes(slopeSvg, slopes(players()), now);
/** "+14": the change since matchweek 1, or nothing for none. */
const sinceFirst = (d: Slope): string => (d.now === d.first ? "" : signed(d.now - d.first));
const slopeEffects = expressive(slopeChart.paths, {
  key: (d) => d.name,
  value: (d) => d.now,
  geometry: (_element, d, key) =>
    describe.line({ key, points: slopeChart.points(d.name), width: slopeChart.width, labelBounds: [slopeChart.nameBox(d.name)] }),
  keyboard: true,
  // Each line read once, with both ends and the change label() writes past its name.
  markLabel: (d) => `${d.name}: ${goals(d.first)} at matchweek 1, ${goals(d.now)} after matchweek ${now}, ${sinceFirst(d) || "no change"}`,
  dim: true,
  // The trace is wider than its default 3 px, so it shows as a highlighter over a 2.25 px line.
  on: { decorate: label((data) => sinceFirst(data.datum)), hover: trace({ width: 8 }) }
});

/** Draws the slope chart again, with the rows it shows now, and tells its effects. */
function redrawSlopes(): void {
  slopeChart.draw(slopes(players()), now);
  slopeEffects.refresh(slopeChart.paths);
}
// The plot leaves room for the longest name, and label() writes past each name: when the names change
// size, as a viewer's own text spacing makes them (WCAG 1.4.12), the chart is drawn again to fit.
new ResizeObserver(redrawSlopes).observe(slopeChart.names);

/** Draws the D3 charts again, with the rows they show now, and tells their effects. */
function redraw(): void {
  shotColumns.draw(weeksSoFar());
  shotEffects.refresh(shotColumns.columns);
  redrawSlopes();
}
window.addEventListener("resize", redraw);

// ── Controls ─────────────────────────────────────────────────────────────────

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

// Full hover plays each linked mark's hover effect; Emphasis only keeps them to emphasis and dimming.
segmented("linked-marks", (value) => {
  linked.destroy();
  linked = link(linkedCharts, { effects: value === "full" });
});

const nextButton = document.querySelector<HTMLButtonElement>("#next-matchweek");
const status = document.getElementById("matchweek-status");

/** "Matchweek 25: Okafor +1, 15 goals; Lindqvist +1, 7 goals." */
function said(rows: readonly Player[]): string {
  const scored = rows.filter((row) => row.change > 0).sort((a, b) => b.goals - a.goals);
  if (scored.length === 0) return `Matchweek ${now}: no goals.`;
  return `Matchweek ${now}: ${scored.map((row) => `${row.name} ${signed(row.change)}, ${goals(row.goals)}`).join("; ")}.`;
}

function playMatchweek(): void {
  if (now >= LAST) return;
  now++;
  if (status) status.textContent = `After matchweek ${now}`;
  if (nextButton && now >= LAST) nextButton.disabled = true;
  const rows = players();
  // A change delta() draws stays until its bar's next update, so a player who didn't score this
  // matchweek would keep the last one's. Emptying the slot first clears them all: each matchweek
  // shows only its own changes, as the table's Change column does.
  void playersChart.update({ on: {} });
  // update() announces as the change starts, before it returns.
  announcing = said(rows);
  void playersChart.update({ data: rows, on: { update: changes } });
  announcing = undefined;
  void goalsChart.update({ data: weeksSoFar() });
  void line.update({ data: weeksSoFar() });
  redraw();
}
nextButton?.addEventListener("click", playMatchweek);

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
motionSwitch("#motion");
