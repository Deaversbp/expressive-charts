// M1: the prototype's ball-and-cleat card on the real library (steps 7 and 8), and the same story on a
// hand-written SVG chart through expressive() (step 11). M2: "Play next matchweek" flashes the bars
// that changed (step 2), the motion switch is the library's own (step 4), and the chart has a data
// table with the players' positions and announces its updates to screen readers (step 5).
import { barChart, expressive, motionSwitch, sequence, travel } from "../src/index";
import { cleat, soccerBall } from "../src/icons/sport/index";
import { amount, drawHostChart, type DrawOptions, type Segment } from "./host-chart";

interface Player {
  name: string;
  pos: string;
  goals: number;
  assists: number;
}

// The prototype's sample data for a fictional club, after matchweek 24.
let players: Player[] = [
  { name: "Okafor", pos: "Forward", goals: 16, assists: 4 },
  { name: "Lindqvist", pos: "Forward", goals: 10, assists: 7 },
  { name: "Moreau", pos: "Winger", goals: 8, assists: 3 },
  { name: "Tanaka", pos: "Midfielder", goals: 6, assists: 10 },
  { name: "Reyes", pos: "Winger", goals: 5, assists: 4 },
  { name: "Adeyemi", pos: "Midfielder", goals: 4, assists: 6 },
  { name: "Novak", pos: "Defender", goals: 3, assists: 1 },
  { name: "Castillo", pos: "Midfielder", goals: 1, assists: 5 }
];

const stacks = {
  goals: ["goals"],
  assists: ["assists"],
  ga: ["goals", "assists"]
} as const;
type Metric = keyof typeof stacks;

// The chart's accessible name and the visible heading follow the metric, so neither says "goals" while showing assists.
const titles: Record<Metric, string> = {
  goals: "Harbor City FC: goals by player",
  assists: "Harbor City FC: assists by player",
  ga: "Harbor City FC: goals and assists by player"
};

// One story for all three views and both charts: a segment that isn't in the stack makes its step a no-op.
const ballThenCleat = sequence(travel(soccerBall, { along: "goals" }), travel(cleat, { along: "assists" }));

/** Set while a matchweek updates the chart, so its announcement can say which one. */
let announcing: string | undefined;

const chart = barChart<Player>("#chart", {
  label: titles.goals,
  data: players,
  y: "name",
  stack: stacks.goals,
  sort: "value",
  colors: { goals: 1, assists: 4 },
  // As in the prototype, the table also lists each player's position.
  table: { category: "Player", columns: [{ label: "Position", field: "pos" }] },
  // The chart says what changed ("Sorted A to Z", "Okafor and Tanaka changed"); the page adds the matchweek.
  announce: (change) => (announcing ? `${announcing}: ${change.text || "no change"}` : change.text),
  // Only bars whose values changed flash: a re-sort or a new scale only moves them.
  on: { hover: ballThenCleat, update: "flash" }
});

// The hand-written chart redraws itself from scratch; refresh() tells the effects about the new marks.
const hostSvg = document.querySelector<SVGSVGElement>("#host-chart");
let hostState: DrawOptions = { series: stacks.goals, sort: "value" };
const drawHost = (): SVGRectElement[] => (hostSvg ? drawHostChart(hostSvg, players, hostState) : []);
const host = expressive<Segment>(drawHost(), {
  key: (d) => d.row.name, // a player's goals rect and assists rect share a key...
  segment: (d) => d.series, // ...and become that player's two segments, ordered from the baseline
  // What each rect shows, so refresh() flashes the players who scored, not every bar on a resize or a new axis maximum.
  value: (d) => d.value,
  keyboard: true,
  // The host names each rect by what it shows ("Okafor: 4 assists"), but focus moves by player, so
  // each player is read as one item: the rect that takes focus names all their values, and the other is hidden.
  markLabel: (d, mark) => `${d.row.name}: ${mark.parts.map((part) => amount(part.datum.value, part.datum.series)).join(", ")}`,
  dim: true,
  on: { hover: ballThenCleat, update: "flash" }
});
function updateHost(next: Partial<DrawOptions>): void {
  hostState = { ...hostState, ...next };
  host.refresh(drawHost());
}
window.addEventListener("resize", () => updateHost({}));

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

// The metric and sort controls drive both charts.
const heading = document.getElementById("chart-title");
segmented("metric", (value) => {
  const metric = value as Metric;
  if (heading) heading.textContent = titles[metric];
  void chart.update({ stack: stacks[metric], label: titles[metric] });
  hostSvg?.setAttribute("aria-label", titles[metric]);
  updateHost({ series: stacks[metric] });
});
segmented("sort", (value) => {
  const sort = value as "value" | "key";
  void chart.update({ sort });
  updateHost({ sort });
});

// "Play next matchweek": the prototype's seeded results, so every visit plays the same season.
let seed = 7;
const random = (): number => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const scoring: Record<string, number> = { Forward: 0.45, Winger: 0.3, Midfielder: 0.2, Defender: 0.08 };
const LAST_MATCHWEEK = 38;
let matchweek = 24;
const nextButton = document.querySelector<HTMLButtonElement>("#next-matchweek");
const status = document.getElementById("matchweek-status");

function playMatchweek(): void {
  if (matchweek >= LAST_MATCHWEEK) return;
  let changed = false;
  players = players.map((player) => {
    const goals = player.goals + (random() < (scoring[player.pos] ?? 0) ? 1 : 0);
    const assists = player.assists + (random() < 0.22 ? 1 : 0);
    changed ||= goals !== player.goals || assists !== player.assists;
    return { ...player, goals, assists };
  });
  // As in the prototype, a matchweek always changes something: the first player scores.
  if (!changed) players = players.map((player, i) => (i === 0 ? { ...player, goals: player.goals + 1 } : player));
  matchweek++;
  if (status) status.textContent = `After matchweek ${matchweek}`;
  if (nextButton && matchweek >= LAST_MATCHWEEK) nextButton.disabled = true;
  // update() announces as the change starts, before it returns.
  announcing = `Matchweek ${matchweek}`;
  void chart.update({ data: players });
  announcing = undefined;
  updateHost({});
}
nextButton?.addEventListener("click", playMatchweek);

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
motionSwitch("#motion");
