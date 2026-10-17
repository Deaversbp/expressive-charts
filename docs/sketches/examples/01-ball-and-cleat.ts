// Prototype card 1 on the reference bar chart: ball and cleat hover, metric switch,
// staged sorting, "Play next matchweek" with a flash on changed bars.
import { barChart, morph, motionSwitch, registerIcons, sequence, threshold, travel } from "expressive-charts";
import { sport } from "expressive-charts/icons/sport";

interface Player {
  name: string;
  pos: string;
  goals: number;
  assists: number;
}
declare const players: Player[];

registerIcons(sport); // "soccer-ball" and "cleat" by name

// One story covers all three views: a segment that isn't in the stack makes its step a no-op.
const ballThenCleat = sequence(travel("soccer-ball", { along: "goals" }), travel("cleat", { along: "assists" }));

const chart = barChart("#goals", {
  label: "Harbor City FC: goals by player",
  data: players,
  y: "name",
  stack: ["goals"],
  sort: "value",
  colors: { goals: 1, assists: 4 }, // fixed palette slots; colours follow the series, never the rank
  on: {
    hover: ballThenCleat,
    update: "flash" // only bars whose values changed; a re-sort alone doesn't count
  }
});

motionSwitch("#motion"); // Presentation / Analysis / Off; the viewer's pick beats reduced motion

// Colour the part of each bar past a 10-goal target (threshold colours below a reference by default).
export const pastTarget = threshold({ compareTo: 10, when: "above", color: "series-1-strong" });

const stacks = {
  goals: ["goals"],
  assists: ["assists"],
  ga: ["goals", "assists"]
} as const;

export function showMetric(metric: keyof typeof stacks): Promise<void> {
  return chart.update({ stack: stacks[metric] }); // presentation: lengths first, then rows move
}

export function sortBy(order: "value" | "key"): Promise<void> {
  return chart.update({ sort: order });
}

export function playNextMatchweek(result: ReadonlyMap<string, Partial<Pick<Player, "goals" | "assists">>>): Promise<void> {
  const next = players.map((p) => ({ ...p, ...result.get(p.name) }));
  return chart.update({ data: next });
}

chart.on("hover", (event) => {
  // Events are typed by the data: event.data.datum is a Player.
  console.debug(`${event.data.datum.name} via ${event.source}`);
});

// Misuse the types catch:

// @ts-expect-error "name" is not a numeric field, so it can't be stacked.
barChart("#bad", { label: "Bad", data: players, y: "name", stack: ["name"] });

// @ts-expect-error morph is a transition effect; it can't run on hover.
barChart("#bad", { label: "Bad", data: players, y: "name", x: "goals", on: { hover: morph() } });

// @ts-expect-error charts need an accessible name.
barChart("#bad", { data: players, y: "name", x: "goals" });
