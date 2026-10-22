// M4: the prototype's second card (step 7). The lab's season, goals against expected goals over 38
// matchweeks, on the library's lineChart and on a line drawn with D3 through expressive(). Both carry
// the same decoration: the goals line red wherever it's below xG, and a ball riding its leading edge.
// One playback() drives both, with its playButton(), the page's scrubber and the motion switch.
import {
  describe,
  expressive,
  lineChart,
  motionSwitch,
  only,
  parallel,
  playback,
  playButton,
  registerIcons,
  samplesAlong,
  threshold,
  travel
} from "../src/index";
import { sport } from "../src/icons/sport/index";
import { drawLine, type Week } from "./d3-line";

// The ball goes by its name, "soccer-ball", so the decoration reads the same on both charts.
registerIcons(sport);

/** The prototype's season: seed 42, 38 matchweeks, cumulative goals and xG (a slow start, a hot streak, a late slump). */
function season(): Week[] {
  let seed = 42;
  const random = (): number => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
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
  const weeks: Week[] = [];
  let goals = 0;
  let xg = 0;
  for (let i = 0; i < 38; i++) {
    const chance = 0.6 + random() * 1.9;
    const form = i < 12 ? 0.72 : i < 26 ? 1.32 : 0.7;
    xg += chance;
    goals += poisson(chance * form);
    weeks.push({ week: i + 1, goals, xg: Math.round(xg * 10) / 10 });
  }
  return weeks;
}

const weeks = season();
const FIRST = weeks[0]!.week;
const LAST = weeks[weeks.length - 1]!.week;
const end = weeks[weeks.length - 1]!;

/** "1 goal", "28 goals". */
const goals = (value: number): string => `${value} ${value === 1 ? "goal" : "goals"}`;
/** "+0.4", "-2.6": to a tenth, signed, as the lab's Difference column has it. */
function signed(value: number): string {
  const tenths = Math.round(value * 10) / 10;
  return `${tenths >= 0 ? "+" : ""}${tenths.toFixed(1)}`;
}
/** The lab's "+0.4 vs expected": goals less xG. */
const versus = (d: Week): string => `${signed(d.goals - d.xg)} vs expected`;

/** The goals line red wherever it's below xG, and a ball riding its leading edge. One each, per chart. */
const story = () => only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on" })));

const chart = lineChart<Week>("#line", {
  label: "Goals vs expected goals, season to date",
  description: "Cumulative goals scored and expected goals over 38 matchweeks. The goals line is red wherever goals are below xG.",
  data: weeks,
  x: "week",
  series: ["goals", "xg"],
  colors: { goals: 1, xg: 2 },
  seriesLabels: { goals: "Goals scored", xg: "Expected goals (xG)" },
  // The lab's end labels: "28 goals", "27.6 xG".
  labels: (value, series) => (series === "xg" ? `${value.toFixed(1)} xG` : goals(Math.round(value))),
  legend: { entries: [{ label: "Goals below xG", color: "negative" }] },
  // The lab's tooltip: the week, both values, and the gap. The page's CSS makes the first line bold.
  tooltip: (d) => `Matchweek ${d.week}\n${goals(d.goals)} · ${d.xg.toFixed(1)} xG\n${versus(d)}`,
  // Each week's name has its values; its description adds only the gap, so nothing is read twice.
  markLabel: (d) => `Matchweek ${d.week}: ${goals(d.goals)}, ${d.xg.toFixed(1)} xG`,
  markDescription: versus,
  table: {
    category: "Matchweek",
    columns: [
      { label: "Difference", field: (d) => d.goals - d.xg, format: (value) => signed(value as number), after: "values" }
    ]
  },
  on: { decorate: story() }
});

// The D3 line draws and reveals itself; expressive() describes each path from the same points and
// scales, and watch follows every frame of a reveal without refresh().
const d3Svg = document.querySelector<SVGSVGElement>("#d3-line");
if (!d3Svg) throw new Error("demo/line.html has no #d3-line.");
const host = drawLine(d3Svg, weeks);
const d3Effects = expressive(host.paths, {
  key: (d) => d.series,
  // What the line shows at its revealed end, so a refresh() after a resize isn't taken for a change.
  value: (d) => d.rows[d.rows.length - 1]![d.series],
  // The rows on __data__ are the ones drawn this frame, so the geometry follows the reveal.
  geometry: (_element, d, key) =>
    describe.line({ key, series: d.series, points: d.rows.map((w) => ({ x: host.x(w.week), y: host.y(w[d.series]) })), width: host.width }),
  // Sampled at the points that drew the line, with each week as `at`, so threshold matches xG by week.
  samples: (d, mark) =>
    samplesAlong(
      mark,
      d.rows.map((w) => ({ x: host.x(w.week), y: host.y(w[d.series]), value: w[d.series], at: w.week }))
    ),
  // Tab reaches the lines, goals first; the arrow keys go between them.
  keyboard: true,
  // Named for the whole season, as the line chart's names are, whatever is revealed.
  markLabel: (d) =>
    d.series === "goals" ? `Goals scored: ${goals(end.goals)} by matchweek ${end.week}` : `Expected goals (xG): ${end.xg.toFixed(1)} by matchweek ${end.week}`,
  dim: true,
  watch: true,
  on: { decorate: story() }
});

window.addEventListener("resize", () => {
  host.resize();
  d3Effects.refresh(host.paths);
});

// One playback drives both charts: the lab's 6.5 s season in Presentation, about 2 s in Analysis, and
// at once in Off. It rests at the end, so the whole season shows until something reveals less.
const slider = document.querySelector<HTMLInputElement>("#week");
const status = document.getElementById("week-status");
/** The last whole matchweek drawn. */
const weekAt = (x: number): number => Math.floor(x + 1e-9);
function showSlider(week: number): void {
  if (!slider) return;
  slider.value = String(week);
  slider.setAttribute("aria-valuetext", `Through matchweek ${week}`);
}

const seasonPlayback = playback({
  from: FIRST,
  to: LAST,
  duration: 6500,
  onFrame(x) {
    chart.reveal(x);
    host.reveal(x);
    const week = weekAt(x);
    if (status) status.textContent = `Through matchweek ${week}`;
    // Only while it plays: a seek's frames would pull the thumb back while the viewer drags it.
    if (seasonPlayback.playing) showSlider(week);
  }
});

playButton("#play", seasonPlayback, { labels: { play: "Play season", pause: "Pause" } });

// The scrubber seeks, which pauses: the reveal glides to the week over 350 ms in Presentation.
slider?.addEventListener("input", () => {
  const week = Number(slider.value);
  slider.setAttribute("aria-valuetext", `Through matchweek ${week}`);
  seasonPlayback.seek(week);
});

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
motionSwitch("#motion");
