// Prototype card 3: a donut that morphs into columns and back.
// Marks match by key ("outcome") in both charts, so each slice becomes its own column, and the
// columns colour by category, so each outcome keeps its colour from slice to column.
import { barChart, chartSwitch, colorAssignment, donutChart, morph, travel } from "expressive-charts";
import { soccerBall } from "expressive-charts/icons/sport";

interface Outcome {
  outcome: string;
  shots: number;
}
declare const outcomes: Outcome[];

const shots = chartSwitch("#shots", {
  views: {
    // Each view's function draws its chart in the container it's given, with the switch's colours.
    donut: (el, colors) =>
      donutChart(el, {
        label: "Shot outcomes, share of total",
        data: outcomes,
        category: "outcome",
        value: "shots",
        colors,
        center: (total) => `${total} shots`,
        on: { hover: travel(soccerBall) } // the same effect rolls around a slice...
      }),
    columns: (el, colors) =>
      barChart(el, {
        label: "Shot outcomes, counts",
        data: outcomes,
        x: "outcome",
        y: "shots",
        orientation: "vertical",
        colorBy: "category", // a colour per outcome, as the donut's slices have
        colors,
        on: { hover: travel(soccerBall) } // ...and up a column, with no special case
      })
  },
  initial: "donut",
  transition: morph({ align: "drop" }), // optional: morph() is the default
  colors: colorAssignment({ Goal: 3 }), // optional: pins "Goal" to slot 3 in both views
  announce: true // says "Shot outcomes, counts" after a switch
});

const button = document.querySelector<HTMLButtonElement>("#morph");
button?.addEventListener("click", () => {
  const next = shots.current === "donut" ? "columns" : "donut";
  // A click mid-way switches back from where the shapes are.
  void shots.show(next);
  button.textContent = next === "donut" ? "Show as columns" : "Show as donut";
});

// Each view's chart, typed as its function returns it.
void shots.chart("columns").update({ sort: "value" });

// @ts-expect-error the initial view must be one of the views.
chartSwitch("#bad", { views: { a: (el) => donutChart(el, { label: "A", data: outcomes, category: "outcome", value: "shots" }) }, initial: "b" });

// @ts-expect-error show() takes the views' names.
void shots.show("bars");

// @ts-expect-error a view's function returns a chart.
chartSwitch("#bad", { views: { a: () => "donut" }, initial: "a" });
