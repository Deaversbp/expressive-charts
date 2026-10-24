// The prototype's shot outcomes as a donutChart, as columns on barChart, and as a pie drawn with D3
// through expressive(). One picker sets the hover effect on all three; "Next match" adds a seeded
// match's shots and flashes, one after another, the slices and columns whose counts changed; the order
// control shows the donut's staged turn.
import {
  barChart,
  describe,
  donutChart,
  expressive,
  flash,
  motionSwitch,
  stagger,
  travel,
  type Attachment,
  type BarChart,
  type DonutChart,
  type GeometryEffect
} from "../src/index";
import { soccerBall } from "../src/icons/sport/index";
import { drawPie, type DrawnPie, type Outcome, type Slice } from "./d3-pie";

// The prototype's shot outcomes for the season so far.
let outcomes: Outcome[] = [
  { outcome: "Goal", shots: 58 },
  { outcome: "Saved", shots: 112 },
  { outcome: "Off target", shots: 149 },
  { outcome: "Blocked", shots: 87 }
];

type HoverEffect = "ball" | "wiggle" | "pulse";
type Order = "none" | "value";

// The picker's choices for the hover slot: an effect, or a built-in preset by name.
const hoverEffects: Record<HoverEffect, GeometryEffect | "wiggle" | "pulse"> = {
  ball: travel(soccerBall),
  wiggle: "wiggle",
  pulse: "pulse"
};
// Slices and columns whose counts changed flash, one after another.
const flashChanged = stagger(flash());

// Palette slots by outcome, so each keeps its colour whichever chart draws it. The page's CSS gives
// the D3 pie's slices the same slots.
const colors = { Goal: 1, Saved: 2, "Off target": 3, Blocked: 4 };

/** "1 shot", "112 shots". */
const shots = (value: number): string => `${value} ${value === 1 ? "shot" : "shots"}`;

let effect: HoverEffect = "ball";
let order: Order = "none";
/** Set while a match updates the donut, so its announcement can say which one. */
let announcing: string | undefined;

let donut: DonutChart<Outcome> | undefined;
let columns: BarChart<Outcome> | undefined;

// The D3 pie redraws itself; refresh() tells the effects about the new arcs.
const pieSvg = document.querySelector<SVGSVGElement>("#d3-pie");
let pie: DrawnPie | undefined;
let pieEffects: Attachment<Slice> | undefined;
const drawD3Pie = (): void => {
  if (pieSvg) pie = drawPie(pieSvg, outcomes, { sort: order });
};

/** What every chart plays: the picked hover effect, and the flash after a match. */
const effectsFor = (pick: HoverEffect) => ({ hover: hoverEffects[pick], update: flashChanged });

/** Draws the donut and the columns, and attaches the effects to the D3 pie. */
function build(): void {
  const on = effectsFor(effect);

  donut = donutChart<Outcome>("#donut", {
    label: "Shot outcomes",
    data: outcomes,
    category: "outcome",
    value: "shots",
    sort: order,
    colors,
    table: { category: "Outcome" },
    // The chart says what changed ("Goal and Saved changed"); the page adds the match.
    announce: (change) => (announcing ? `${announcing}: ${change.text || "no change"}` : change.text),
    on
  });

  // One colour: a bar chart colours by series, and this one has one, shots. morph.ts colours its
  // columns by category instead (colorBy: "category"), to match the donut.
  columns = barChart<Outcome>("#columns", {
    label: "Shot outcomes as columns",
    data: outcomes,
    x: "outcome",
    y: "shots",
    orientation: "vertical",
    sort: order,
    table: { category: "Outcome" },
    on
  });

  attachPie();
}

/**
 * Attaches the picked effects to the D3 pie. An attachment's effects can't change, so a new pick
 * attaches them again: the pie's tab stop goes back to its first slice.
 */
function attachPie(): void {
  pieEffects?.destroy();
  pieEffects = undefined;
  const on = effectsFor(effect);
  drawD3Pie();
  if (pie) {
    pieEffects = expressive(pie.slices, {
      key: (d) => d.data.outcome,
      // What each slice shows, so a new match flashes the slices whose counts changed, not every arc
      // that moved round because the total grew.
      value: (d) => d.value,
      // d3.pie() gives the angles; the radii are the arc generator's, read at each refresh.
      geometry: (_element, d, key) =>
        describe.arc({ key, cx: 0, cy: 0, inner: pie?.inner ?? 0, outer: pie?.outer ?? 0, start: d.startAngle, end: d.endAngle }),
      // Tab reaches the pie; the arrow keys go clockwise from 12 o'clock, though d3.pie() returns the
      // arcs in data order.
      keyboard: true,
      // Named as the donut names its slices: "Saved: 112 shots, 28%".
      markLabel: (d) => `${d.data.outcome}: ${shots(d.value)}, ${Math.round(((d.endAngle - d.startAngle) / (2 * Math.PI)) * 100)}%`,
      dim: true,
      on
    });
  }
}
build();

function refreshPie(): void {
  drawD3Pie();
  if (pie) pieEffects?.refresh(pie.slices);
}
window.addEventListener("resize", refreshPie);

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

// update({ on }) swaps the hover effect in place: the donut and the columns keep their marks, their
// tab stops and a hover that's held, and nothing enters again. The flash is the same effect, so it's
// kept. Focus stays on the picker.
segmented("effect", (value) => {
  if (value === effect) return;
  effect = value as HoverEffect;
  const on = effectsFor(effect);
  void donut?.update({ on });
  void columns?.update({ on });
  attachPie();
});

// The order drives all three. In Presentation the donut resizes its slices first, then turns them to
// their new places, as bars pass each other when sorted.
segmented("order", (value) => {
  if (value === order) return;
  order = value as Order;
  void donut?.update({ sort: order });
  void columns?.update({ sort: order });
  refreshPie();
});

// "Next match": seeded, so every visit plays the same matches.
let seed = 11;
const random = (): number => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
/** Each outcome's shots in a match, on average: a match adds from none to twice this. */
const perMatch: Record<string, number> = { Goal: 1.5, Saved: 3.5, "Off target": 4.5, Blocked: 2.5 };
const MATCHES = 10;
let played = 0;
const nextButton = document.querySelector<HTMLButtonElement>("#next-match");
const status = document.getElementById("match-status");

function playMatch(): void {
  if (played >= MATCHES) return;
  outcomes = outcomes.map((row) => ({ ...row, shots: row.shots + Math.floor(random() * (2 * (perMatch[row.outcome] ?? 0) + 1)) }));
  played++;
  if (status) status.textContent = `After match ${played} of ${MATCHES}`;
  if (nextButton && played >= MATCHES) nextButton.disabled = true;
  // update() announces as the change starts, before it returns. Only the donut announces, so a screen
  // reader hears each match once.
  announcing = `Match ${played}`;
  void donut?.update({ data: outcomes });
  announcing = undefined;
  void columns?.update({ data: outcomes });
  refreshPie();
}
nextButton?.addEventListener("click", playMatch);

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
motionSwitch("#motion");
