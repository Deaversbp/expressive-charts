// Prototype card 3: a donut that morphs into bars and back.
// Marks match by key ("outcome") in both charts, so each slice becomes its own bar.
import { barChart, chartSwitch, colorAssignment, donutChart, morph, travel } from "expressive-charts";
import { soccerBall } from "expressive-charts/icons/sport";

interface Outcome {
  outcome: string;
  shots: number;
}
declare const outcomes: Outcome[];

const colors = colorAssignment(); // shared, so "Goal" is the same colour in both views

const shots = chartSwitch("#shots", {
  views: {
    donut: (el) =>
      donutChart(el, {
        label: "Shot outcomes, share of total",
        data: outcomes,
        key: "outcome",
        value: "shots",
        colors,
        center: (total) => `${total} shots`,
        on: { hover: travel(soccerBall) } // the same effect rolls around a slice...
      }),
    bars: (el) =>
      barChart(el, {
        label: "Shot outcomes, counts",
        data: outcomes,
        x: "outcome",
        y: "shots",
        orientation: "vertical",
        colors,
        on: { hover: travel(soccerBall) } // ...and up a column, with no special case
      })
  },
  transition: morph(),
  initial: "donut"
});

document.querySelector("#morph")?.addEventListener("click", () => {
  void shots.show(shots.current === "donut" ? "bars" : "donut");
});

// @ts-expect-error the initial view must be one of the views.
chartSwitch("#bad", { views: { a: (el) => donutChart(el, { label: "A", data: outcomes, value: "shots" }) }, transition: morph(), initial: "b" });
