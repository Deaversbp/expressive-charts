// Effects on circles and shapes other libraries draw: a D3 scatter and an Observable Plot dot chart,
// whose dots are <circle>s, and a D3 curved line and a D3 area, whose marks are <path>s of Béziers.
// expressive() reads each element by its tag, a circle as a point and a path as a shape, so each is
// attached with a key and only what it needs: no geometry. One picker swaps the four charts' hover
// effect in place with update({ on }); the curved line also has the line page's decoration, goals red
// below xG and a ball riding its tip.
import { dot, plot, text } from "@observablehq/plot";
import { expressive, motionSwitch, only, parallel, registerIcons, samplesAlong, threshold, travel } from "../src/index";
import { sport } from "../src/icons/sport/index";
import { drawAreas, drawCurves, drawScatter, type Band, type Form, type FormWeek, type ShotWeek } from "./d3-shapes";

// The ball goes by its name, "soccer-ball".
registerIcons(sport);

interface Player {
  readonly name: string;
  readonly shots: number;
  readonly goals: number;
  readonly assists: number;
}

// The bar page's squad, with their shots.
const players: readonly Player[] = [
  { name: "Okafor", shots: 64, goals: 16, assists: 4 },
  { name: "Lindqvist", shots: 41, goals: 10, assists: 7 },
  { name: "Moreau", shots: 46, goals: 8, assists: 3 },
  { name: "Tanaka", shots: 35, goals: 6, assists: 10 },
  { name: "Reyes", shots: 20, goals: 5, assists: 4 },
  { name: "Adeyemi", shots: 30, goals: 4, assists: 6 },
  { name: "Novak", shots: 12, goals: 3, assists: 1 },
  { name: "Castillo", shots: 18, goals: 1, assists: 5 }
];

/** A seeded random source, so every visit draws the same season. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
}

/** The line page's season, seed 42: each matchweek's goals and expected goals (a slow start, a hot streak, a late slump). */
function season(): { week: number; goals: number; xg: number }[] {
  const random = seeded(42);
  const poisson = (lambda: number): number => {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= random();
    } while (p > limit);
    return k - 1;
  };
  return Array.from({ length: 38 }, (_, i) => {
    const chance = 0.6 + random() * 1.9;
    const form = i < 12 ? 0.72 : i < 26 ? 1.32 : 0.7;
    return { week: i + 1, goals: poisson(chance * form), xg: chance };
  });
}

/** A value's average over the last five matches up to the i-th, or as many as there have been. */
function lastFive<T>(rows: readonly T[], i: number, value: (row: T) => number): number {
  const window = rows.slice(Math.max(0, i - 4), i + 1);
  return window.reduce((sum, row) => sum + value(row), 0) / window.length;
}

const matches = season();
const form: FormWeek[] = matches.map((m, i) => ({ week: m.week, goals: lastFive(matches, i, (w) => w.goals), xg: lastFive(matches, i, (w) => w.xg) }));
// Shots follow the chances: more xG, more shots, and about a third of them on target.
const shotRandom = seeded(7);
const shots = matches.map((m) => {
  const all = Math.round(6 + m.xg * 4 + shotRandom() * 4);
  const onTarget = Math.round(all * (0.28 + shotRandom() * 0.14));
  return { week: m.week, onTarget, offTarget: all - onTarget };
});
const shotForm: ShotWeek[] = shots.map((m, i) => ({ week: m.week, onTarget: lastFive(shots, i, (w) => w.onTarget), offTarget: lastFive(shots, i, (w) => w.offTarget) }));
const LAST = form[form.length - 1]!;

/** "1 goal", "16 goals". */
const goals = (value: number): string => `${value} ${value === 1 ? "goal" : "goals"}`;
/** To a tenth, as the line page writes xG. */
const tenth = (value: number): string => value.toFixed(1);

/** "matchweeks 1 to 12, 20 and 30 to 38": the weeks where goals are below xG, which the red shows, in words. */
function belowXg(): string {
  const runs: [number, number][] = [];
  for (const w of form) {
    if (w.goals >= w.xg) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] === w.week - 1) last[1] = w.week;
    else runs.push([w.week, w.week]);
  }
  const words = runs.map(([from, to]) => (from === to ? `${from}` : `${from} to ${to}`));
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return `${runs.length === 1 && runs[0]![0] === runs[0]![1] ? "matchweek" : "matchweeks"} ${list}`;
}

// ── The hover effect picker ──────────────────────────────────────────────────

type HoverEffect = "pulse" | "flash" | "wiggle";
let effect: HoverEffect = "pulse";

/** The goals curve red wherever it's below xG, and a ball riding its tip: the same object every time, so a new pick keeps it running. */
const story = only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on", size: 11 })));

/** What each chart plays: the picked hover effect, a built-in preset by its name, and on the curves the story too. */
const effectsFor = (pick: HoverEffect) => ({ hover: pick });
const curveEffectsFor = (pick: HoverEffect) => ({ hover: pick, decorate: story });

// ── A D3 scatter ─────────────────────────────────────────────────────────────

/** The page's svg by its id. */
function svgById(id: string): SVGSVGElement {
  const svg = document.querySelector<SVGSVGElement>(`#${id}`);
  if (!svg) throw new Error(`demo/shapes.html has no #${id}.`);
  return svg;
}

const scatter = drawScatter(svgById("d3-scatter"), players);
// Circles read as points: a key, the value each dot shows, and its name. The dots' groups move them
// into place, which expressive() reads through.
const scatterEffects = expressive(scatter.dots, {
  key: (d) => d.name,
  value: (d) => d.goals,
  markLabel: (d) => `${d.name}: ${goals(d.goals)} from ${d.shots} shots`,
  keyboard: true,
  dim: true,
  on: effectsFor(effect)
});

// ── An Observable Plot dot chart ─────────────────────────────────────────────

const plotBox = document.querySelector<HTMLElement>("#plot-dots");
if (!plotBox) throw new Error("demo/shapes.html has no #plot-dots.");

/** Plot's dots, its circles, in its svg: each circle's __data__ is its row's index. */
const plotCircles = (svg: SVGSVGElement): SVGCircleElement[] => Array.from(svg.querySelectorAll<SVGCircleElement>(".plot-dots circle"));

/** Draws Plot's chart at the box's width, in place of the last one. Plot draws a new <svg> each time. */
function drawPlot(): SVGSVGElement {
  const style = getComputedStyle(plotBox!);
  const width = Math.max(280, Math.floor(plotBox!.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
  const svg = plot({
    width,
    height: 300,
    marginRight: 76,
    ariaLabel: "Goals and assists by player on an Observable Plot dot chart",
    x: { domain: [0, 12], label: "Assists", labelAnchor: "right", labelArrow: "none", grid: true },
    y: { domain: [0, 20], label: "Goals", labelArrow: "none", grid: true },
    marks: [
      dot(players, { x: "assists", y: "goals", r: 6, fill: "#2a78d6", className: "plot-dots" }),
      text(players, { x: "assists", y: "goals", text: "name", dx: 11, textAnchor: "start", className: "plot-names" })
    ]
  }) as SVGSVGElement;
  // A group, not an image: screen readers skip what's inside an image, and its dots take focus. Its
  // axes and names are hidden, since the dots' names say the same, and the dots' own group loses the
  // name Plot gives it ("dot"), which a screen reader would read on the way in.
  svg.setAttribute("role", "group");
  for (const group of svg.querySelectorAll(":scope > g:not(.plot-dots)")) group.setAttribute("aria-hidden", "true");
  svg.querySelector(".plot-dots")?.removeAttribute("aria-label");
  plotBox!.replaceChildren(svg);
  return svg;
}
const plotSvg = drawPlot();
// Plot binds each circle to its row's index, so the page gives expressive() the row.
const plotRow = (element: Element): Player => players[(element as Element & { __data__: number }).__data__]!;
const plotEffects = expressive(plotCircles(plotSvg), {
  datum: plotRow,
  key: (d) => d.name,
  value: (d) => d.goals,
  markLabel: (d) => `${d.name}: ${goals(d.goals)}, ${d.assists} ${d.assists === 1 ? "assist" : "assists"}`,
  keyboard: true,
  dim: true,
  on: effectsFor(effect)
});

// ── A D3 curved line ─────────────────────────────────────────────────────────

const curves = drawCurves(svgById("d3-curve"), form);
// Paths read as shapes: open, so each is a line walked along its own Béziers. `segment` names each
// curve's series, so threshold finds xG; `samples` puts each week's value where the curve passes it,
// with the week as `at`, so threshold compares the curves week by week.
const curveEffects = expressive(curves.paths, {
  key: (d) => d.series,
  segment: (d) => d.series,
  value: (d) => d.rows[d.rows.length - 1]![d.series],
  samples: (d: Form, mark) => samplesAlong(mark, d.rows.map((w) => ({ x: curves.x(w.week), y: curves.y(w[d.series]), value: w[d.series], at: w.week }))),
  // Named for the season, the goals curve with where it's red.
  markLabel: (d) =>
    d.series === "goals"
      ? `Goals per match, five-match average: ${tenth(LAST.goals)} at matchweek ${LAST.week}, below xG in ${belowXg()}`
      : `Expected goals (xG) per match, five-match average: ${tenth(LAST.xg)} at matchweek ${LAST.week}`,
  keyboard: true,
  dim: true,
  on: curveEffectsFor(effect)
});

// ── A D3 area ────────────────────────────────────────────────────────────────

const areas = drawAreas(svgById("d3-area"), shotForm);
/** Each area's shots over the season, from the matches themselves. */
const total = (series: Band["series"]): number => shots.reduce((sum, w) => sum + w[series], 0);
// Paths read as shapes: closed, so each is an area with no direction.
const areaEffects = expressive(areas.paths, {
  key: (d) => d.series,
  value: (d) => total(d.series),
  markLabel: (d) => (d.series === "onTarget" ? `Shots on target: ${total("onTarget")} in ${shots.length} matches` : `Shots off target: ${total("offTarget")} in ${shots.length} matches`),
  keyboard: true,
  dim: true,
  on: effectsFor(effect)
});

// ── The page ─────────────────────────────────────────────────────────────────

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

// update({ on }) swaps the hover effect in place: each attachment keeps its marks, its tab stop and a
// hover that's held, which replays with the new effect. The curves' story is the same object, so it's
// kept, and the ball stays at the tip. Focus stays on the picker.
segmented("effect", (value) => {
  if (value === effect) return;
  effect = value as HoverEffect;
  void scatterEffects.update({ on: effectsFor(effect) });
  void plotEffects.update({ on: effectsFor(effect) });
  void curveEffects.update({ on: curveEffectsFor(effect) });
  void areaEffects.update({ on: effectsFor(effect) });
});

// Each chart draws itself again at the new width, and refresh() reads its marks again. Plot draws a
// new <svg>, which refresh() follows.
window.addEventListener("resize", () => {
  scatter.resize();
  scatterEffects.refresh(scatter.dots);
  plotEffects.refresh(plotCircles(drawPlot()));
  curves.resize();
  curveEffects.refresh(curves.paths);
  areas.resize();
  areaEffects.refresh(areas.paths);
});

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
motionSwitch("#motion");
