// Prototype card 2 on the reference line chart: goals turn red below xG,
// a season playback with a pause control, and a scrubber.
import { lineChart, only, playButton, playback, sequence, threshold, travel, type DataEffect, type GeometryEffect } from "expressive-charts";

interface Week {
  week: number;
  goals: number;
  xg: number;
}
declare const weeks: Week[];

const chart = lineChart("#xg", {
  label: "Goals vs expected goals, season to date",
  data: weeks,
  x: "week",
  series: ["goals", "xg"],
  pointer: "x", // crosshair: hover fires for both series at the nearest week
  on: {
    // A decoration: starts on enter, stays until exit, and redraws whenever the line moves.
    decorate: only("goals", threshold({ compareTo: "xg", color: "negative" }))
  }
});

const season = playback({
  from: 1,
  to: weeks.length,
  duration: 6500, // presentation 6.5 s, analysis ~2 s, off jumps to the end
  onFrame: (week) => chart.reveal(week)
});
playButton("#play", season); // WCAG 2.2.2: anything that plays for more than 5 s can be paused

document.querySelector<HTMLInputElement>("#week")?.addEventListener("input", (event) => {
  season.pause();
  season.seek(Number((event.target as HTMLInputElement).value));
});

// Kinds carry through combinators: mixing in a data effect makes the whole thing a data effect.
export const story: DataEffect = sequence(travel("soccer-ball", { ride: "on" }), threshold({ compareTo: "xg" }));

// @ts-expect-error threshold reads data, so it isn't a geometry effect.
export const wrong: GeometryEffect = threshold({ compareTo: "xg" });

// @ts-expect-error "week" is fine as x, but series must be numeric fields that exist.
lineChart("#bad", { label: "Bad", data: weeks, x: "week", series: ["goals", "points"] });
