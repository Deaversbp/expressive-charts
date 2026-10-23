// M5: the prototype's third card with its morph (step 4). The lab's shot outcomes as a donutChart and
// as category columns on barChart, in one chartSwitch: each slice morphs into its own column and back
// (morph()), its labels moving with it. A toggle button switches, and a click mid-way reverses; the
// align control rebuilds the switch with the other mapping, so the two can be compared.
import { barChart, chartSwitch, donutChart, morph, motionSwitch, type ChartSwitch, type ColorAssignment, type MorphAlign } from "../src/index";

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

/** morph()'s default mapping. The control picks either; the page starts on the library's default. */
let align: MorphAlign = "unroll";
let shots: ChartSwitch<typeof views> | undefined;

const toggleButton = document.querySelector<HTMLButtonElement>("#toggle");

/** The button names the view a click goes to. `current` is the view a switch is heading for. */
function showToggle(): void {
  if (toggleButton) toggleButton.textContent = shots?.current === "columns" ? "Show as donut" : "Show as columns";
}

/**
 * Builds the switch with the picked mapping, in `initial`. A switch's transition can't change while
 * it lives, so a new pick destroys it and builds it again, landed on the view it was showing or
 * heading for. Focus stays on the picker, which isn't rebuilt.
 */
function build(initial: View): void {
  shots?.destroy();
  shots = chartSwitch("#shots", { views, initial, transition: morph({ align }), announce: true });
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

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
motionSwitch("#motion");
