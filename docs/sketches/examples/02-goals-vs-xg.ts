// Prototype card 2 on the reference line chart: goals turn red below xG and a ball rides the goals
// line's leading edge, with a season playback, a pause control, and a scrubber.
import { lineChart, only, parallel, playButton, playback, sequence, threshold, travel, type DataEffect, type GeometryEffect } from "expressive-charts";

interface Week {
  week: number;
  goals: number;
  xg: number;
}
declare const weeks: Week[];

// The crosshair is the line chart's hover: the pointer or focus on a week hovers both series' points there.
const chart = lineChart("#xg", {
  label: "Goals vs expected goals, season to date",
  data: weeks,
  x: "week",
  series: ["goals", "xg"],
  seriesLabels: { goals: "Goals scored", xg: "Expected goals (xG)" },
  legend: { entries: [{ label: "Goals below xG", color: "negative" }] },
  table: { category: "Matchweek", columns: [{ label: "Difference", field: (d) => d.goals - d.xg, after: "values" }] },
  on: {
    // A decoration: starts on enter, stays until exit, and redraws whenever the line moves or is revealed.
    decorate: only("goals", parallel(threshold({ compareTo: "xg", color: "negative" }), travel("soccer-ball", { ride: "on" })))
  }
});

const season = playback({
  from: 1,
  to: weeks.length,
  duration: 6500, // presentation 6.5 s, analysis ~2 s, off jumps to the end
  onFrame: (week) => chart.reveal(week) // a view: no events, and the decoration follows every frame
});
playButton("#play", season, { labels: { play: "Play season" } }); // WCAG 2.2.2: anything that plays for more than 5 s can be paused

document.querySelector<HTMLInputElement>("#week")?.addEventListener("input", (event) => {
  season.seek(Number((event.target as HTMLInputElement).value)); // seek pauses a play
});

// Kinds carry through combinators: mixing in a data effect makes the whole thing a data effect.
export const story: DataEffect = sequence(travel("soccer-ball", { ride: "on" }), threshold({ compareTo: "xg" }));

// @ts-expect-error threshold reads data, so it isn't a geometry effect.
export const wrong: GeometryEffect = threshold({ compareTo: "xg" });

// @ts-expect-error "week" is fine as x, but series must be numeric fields that exist.
lineChart("#bad", { label: "Bad", data: weeks, x: "week", series: ["goals", "points"] });

interface LabelledWeek extends Week {
  label: string;
}
declare const labelled: LabelledWeek[];
// @ts-expect-error x must be a field of numbers or Dates; "label" holds strings.
lineChart("#bad", { label: "Bad", data: labelled, x: "label", series: ["goals"] });

// @ts-expect-error there's no pointer option: the crosshair is the line chart's hover.
lineChart("#bad", { label: "Bad", data: weeks, x: "week", series: ["goals"], pointer: "x" });
