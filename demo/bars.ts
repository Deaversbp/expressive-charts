// M1: the prototype's ball-and-cleat card on the real library (steps 7 and 8), and the same story on a
// hand-written SVG chart through expressive() (step 11).
import { barChart, expressive, motion, sequence, travel, type MotionMode } from "../src/index";
import { cleat, soccerBall } from "../src/icons/sport/index";
import { drawHostChart, type DrawOptions, type Segment } from "./host-chart";

interface Player {
  name: string;
  pos: string;
  goals: number;
  assists: number;
}

// The prototype's sample data for a fictional club.
const players: Player[] = [
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

const chart = barChart<Player>("#chart", {
  label: titles.goals,
  data: players,
  y: "name",
  stack: stacks.goals,
  sort: "value",
  colors: { goals: 1, assists: 4 },
  on: { hover: ballThenCleat }
});

// The hand-written chart redraws itself from scratch; refresh() tells the effects about the new marks.
const hostSvg = document.querySelector<SVGSVGElement>("#host-chart");
let hostState: DrawOptions = { series: stacks.goals, sort: "value" };
const drawHost = (): SVGRectElement[] => (hostSvg ? drawHostChart(hostSvg, players, hostState) : []);
const host = expressive<Segment>(drawHost(), {
  key: (d) => d.row.name, // a player's goals rect and assists rect share a key...
  segment: (d) => d.series, // ...and become that player's two segments, ordered from the baseline
  keyboard: true,
  dim: true,
  on: { hover: ballThenCleat }
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

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
const hints: Record<MotionMode, string> = {
  presentation: "Staged, unhurried motion. Best for walking someone through the chart.",
  analysis: "Quick, unstaged motion. Best for exploring.",
  off: "No motion: effects jump to their end state."
};
const showMode = segmented("motion", (value) => motion.chooseMode(value as MotionMode));
const hint = document.getElementById("motion-hint");

function renderMotion(): void {
  showMode(motion.mode);
  if (!hint) return;
  hint.textContent =
    motion.prefersReduced && motion.viewerChoice === undefined
      ? "Your device asks for reduced motion, so motion is off. Picking a mode here overrides it."
      : hints[motion.mode];
}

motion.subscribe(renderMotion);
renderMotion();
