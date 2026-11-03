// Four charts from docs/ideas/effects-by-chart.md, each drawn with D3 by a module that knows nothing
// about expressive-charts, and given its effects through expressive() by demo/charts-effects.ts: a
// waterfall whose ball travels down the staircase to rest on the season's total, a dumbbell whose arrow
// shows each player's change on hover, a radar coloured where the player passes the league average,
// and a butterfly whose halves grow out together. The waterfall and the butterfly play at load, and
// their Replay buttons play it again; the dumbbell and the radar load at rest. Nothing plays by itself
// after that.
import { motion, motionSwitch } from "../src/index";
import { attachButterfly, attachDumbbell, attachRadar, attachWaterfall, bands, months, players, profiles, radarAxes, type ButterflyEffects, type WaterfallEffects } from "./charts-effects";
import { drawButterfly } from "./d3-butterfly";
import { drawDumbbell, type Metric } from "./d3-dumbbell";
import { drawRadar } from "./d3-radar";
import { drawWaterfall } from "./d3-waterfall";

/** The page's svg by its id. */
function svgById(id: string): SVGSVGElement {
  const svg = document.querySelector<SVGSVGElement>(`#${id}`);
  if (!svg) throw new Error(`demo/charts.html has no #${id}.`);
  return svg;
}

/** A card's button by its id. */
function buttonById(id: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`#${id}`);
  if (!button) throw new Error(`demo/charts.html has no #${id}.`);
  return button;
}

// ── The charts ───────────────────────────────────────────────────────────────

const waterfall = drawWaterfall(svgById("waterfall"), months);
let waterfallEffects: WaterfallEffects = attachWaterfall(waterfall);

const dumbbell = drawDumbbell(svgById("dumbbell"), players, "goals");
const dumbbellEffects = attachDumbbell(dumbbell);

const radar = drawRadar(svgById("radar"), radarAxes, profiles);
const radarEffects = attachRadar(radar);

const butterfly = drawButterfly(svgById("butterfly"), bands);
let butterflyEffects: ButterflyEffects = attachButterfly(butterfly);

// ── Replay ───────────────────────────────────────────────────────────────────

// An attachment plays `enter` once, as it attaches, so Replay attaches the card's marks again: the
// connectors draw in, the ball travels and the labels rise, or the halves grow out. Focus stays on the
// button, so nothing a viewer was reading is lost.
buttonById("waterfall-replay").addEventListener("click", () => {
  waterfallEffects.destroy();
  waterfallEffects = attachWaterfall(waterfall);
});
buttonById("butterfly-replay").addEventListener("click", () => {
  butterflyEffects.destroy();
  butterflyEffects = attachButterfly(butterfly);
});

// ── Goals or assists ─────────────────────────────────────────────────────────

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

/** A stage of the dumbbell's change, in base ms: half a bar chart's staged update each, as barChart's stages are. */
const STAGE = 500;

// The dumbbell's own transition, timed by the motion mode: in Presentation the dots move to their new
// values, then the rows to their new places, half a second each; in Analysis both at once, within
// 200 ms; in Off at once. The chart joins its new rows first, as D3 would, so refresh() reads the new
// values and names where the marks are now, and watch follows them as they move. Nothing is announced:
// the pressed button says what's shown.
segmented("metric", (value) => {
  const metric = value as Metric;
  if (metric === dumbbell.metric) return;
  dumbbell.set(metric);
  dumbbellEffects.refresh();
  void dumbbell.move({ values: motion.duration(STAGE), positions: motion.duration(STAGE), staged: motion.staged });
});

// ── The page ─────────────────────────────────────────────────────────────────

// Each chart draws itself again at the new width, and refresh() reads its marks again.
window.addEventListener("resize", () => {
  waterfall.resize();
  waterfallEffects.steps.refresh();
  waterfallEffects.connectors.refresh();
  waterfallEffects.staircase.refresh();
  dumbbell.resize();
  dumbbellEffects.refresh();
  radar.resize();
  radarEffects.outlines.refresh();
  radarEffects.values.player.refresh();
  radarEffects.values.average.refresh();
  butterfly.resize();
  butterflyEffects.halves.conceded.refresh();
  butterflyEffects.halves.scored.refresh();
});

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
motionSwitch("#motion");
