// The prototype's season, goals against expected goals over 38 matchweeks, on the library's
// lineChart, on a line drawn with D3 through expressive(), and on a Vega-Lite line through
// fromVegaView(); and the same season as a weekly data feed recorded it, with weeks missing, on
// lineChart and on a D3 line drawn with .defined(). All five carry the same decoration: the goals line
// red wherever it's below xG, and a ball riding its leading edge. One playback() drives the four that
// play, with its playButton(), the page's scrubber and the motion switch.
import {
  describe,
  expressive,
  fromVegaView,
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
import { drawGaps, type FeedWeek, type Trace as FeedTrace } from "./d3-gaps";
import { drawLine, type Week } from "./d3-line";
import { drawVegaLine, type Row, type VegaLine } from "./vega-line";

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
/** "+0.4", "-2.6": to a tenth, signed, as the prototype's Difference column has it. */
function signed(value: number): string {
  const tenths = Math.round(value * 10) / 10;
  return `${tenths >= 0 ? "+" : ""}${tenths.toFixed(1)}`;
}
/** The prototype's "+0.4 vs expected": goals less xG. */
const versus = (d: Week): string => `${signed(d.goals - d.xg)} vs expected`;

/** The ball's width in px: smaller than its own 17 px, so it doesn't hide the lines' last weeks. */
const BALL = 11;

/** The goals line red wherever it's below xG, and a ball riding its leading edge. One each, per chart. */
const story = () => only("goals", parallel(threshold({ compareTo: "xg" }), travel("soccer-ball", { ride: "on", size: BALL })));

const chart = lineChart<Week>("#line", {
  label: "Goals vs expected goals, season to date",
  description: "Cumulative goals scored and expected goals over 38 matchweeks. The goals line is red wherever goals are below xG.",
  data: weeks,
  x: "week",
  series: ["goals", "xg"],
  // xG takes slot 2, which the page's CSS makes a dashed grey, so the red below it stands out.
  colors: { goals: 1, xg: 2 },
  seriesLabels: { goals: "Goals scored", xg: "Expected goals (xG)" },
  // The prototype's end labels: "28 goals", "27.6 xG".
  labels: (value, series) => (series === "xg" ? `${value.toFixed(1)} xG` : goals(Math.round(value))),
  legend: { entries: [{ label: "Goals below xG", color: "negative" }] },
  // The prototype's tooltip: the week, both values, and the gap. The page's CSS makes the first line bold.
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

// ── With missing weeks ───────────────────────────────────────────────────────

/** The weeks the feed missed altogether, and the weeks it has goals but no xG for. */
const NO_FEED = [9, 10];
const NO_XG = [4, 5];
/** The same season as the feed recorded it: null where it has no value, which is a gap, not a zero. */
const feed: FeedWeek[] = weeks.map((w) => ({
  week: w.week,
  goals: NO_FEED.includes(w.week) ? null : w.goals,
  xg: NO_FEED.includes(w.week) || NO_XG.includes(w.week) ? null : w.xg
}));
/** "18 goals", "goals missing". */
const feedGoals = (d: FeedWeek): string => (d.goals === null ? "goals missing" : goals(d.goals));
/** "19.0 xG", "xG missing". */
const feedXg = (d: FeedWeek): string => (d.xg === null ? "xG missing" : `${d.xg.toFixed(1)} xG`);
/** The gap, or nothing where the feed has no goals or no xG to compare. */
const feedVersus = (d: FeedWeek): string => (d.goals === null || d.xg === null ? "" : versus({ week: d.week, goals: d.goals, xg: d.xg }));

const gapsChart = lineChart<FeedWeek>("#gaps", {
  label: "Goals vs expected goals, with missing weeks",
  description: "Cumulative goals scored and expected goals over 38 matchweeks, from a weekly feed. It has no values for matchweeks 9 and 10, and no xG for matchweeks 4 and 5. The goals line is red wherever goals are below xG.",
  data: feed,
  x: "week",
  series: ["goals", "xg"],
  colors: { goals: 1, xg: 2 },
  seriesLabels: { goals: "Goals scored", xg: "Expected goals (xG)" },
  labels: (value, series) => (series === "xg" ? `${value.toFixed(1)} xG` : goals(Math.round(value))),
  legend: { entries: [{ label: "Goals below xG", color: "negative" }] },
  // As the first chart's, with what's missing said where a value would be, and no gap without both.
  tooltip: (d) => [`Matchweek ${d.week}`, `${feedGoals(d)} · ${feedXg(d)}`, feedVersus(d)].filter(Boolean).join("\n"),
  markLabel: (d) => `Matchweek ${d.week}: ${feedGoals(d)}, ${feedXg(d)}`,
  markDescription: feedVersus,
  table: {
    category: "Matchweek",
    columns: [
      {
        label: "Difference",
        field: (d) => (d.goals === null || d.xg === null ? null : d.goals - d.xg),
        // As the chart's own cells say a missing value.
        format: (value) => (value === null ? "missing" : signed(value as number)),
        after: "values"
      }
    ]
  },
  on: { decorate: story() }
});

// The D3 line skips the missing weeks with .defined(); expressive() describes each path by the weeks
// it has, and the indices among them where a run starts after a missing week, its `breaks`.
const gapsSvg = document.querySelector<SVGSVGElement>("#d3-gaps");
if (!gapsSvg) throw new Error("demo/line.html has no #d3-gaps.");
const gapsHost = drawGaps(gapsSvg, feed);
/** A path's weeks with a value, as points for describe.line(), and where they break. */
function runsOf(d: FeedTrace): { points: { x: number; y: number; value: number; at: number }[]; breaks: number[] } {
  const points: { x: number; y: number; value: number; at: number }[] = [];
  const breaks: number[] = [];
  d.rows.forEach((w, i) => {
    const value = w[d.series];
    if (value === null) return;
    if (points.length > 0 && d.rows[i - 1]?.[d.series] === null) breaks.push(points.length);
    points.push({ x: gapsHost.x(w.week), y: gapsHost.y(value), value, at: w.week });
  });
  return { points, breaks };
}
/** "matchweeks 4, 5, 9 and 10". */
function weeksList(list: readonly number[]): string {
  return `matchweek${list.length === 1 ? "" : "s"} ${list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`}`;
}
const missingFrom = (series: "goals" | "xg"): number[] => feed.filter((w) => w[series] === null).map((w) => w.week);
const feedEnd = feed[feed.length - 1]!;
const gapsEffects = expressive(gapsHost.paths, {
  key: (d) => d.series,
  // The last value the line shows, so a refresh() after a resize isn't taken for a change.
  value: (d) => {
    const { points } = runsOf(d);
    return points[points.length - 1]!.value;
  },
  geometry: (_element, d, key) => {
    const { points, breaks } = runsOf(d);
    return describe.line({ key, series: d.series, points, breaks, width: gapsHost.width });
  },
  // Sampled at the weeks it has, so threshold matches xG by week and joins nothing across a gap.
  samples: (d, mark) => samplesAlong(mark, runsOf(d).points),
  keyboard: true,
  // Named for the whole season, with the weeks it's missing.
  markLabel: (d) =>
    d.series === "goals"
      ? `Goals scored: ${goals(feedEnd.goals!)} by matchweek ${feedEnd.week}, ${weeksList(missingFrom("goals"))} missing`
      : `Expected goals (xG): ${feedEnd.xg!.toFixed(1)} by matchweek ${feedEnd.week}, ${weeksList(missingFrom("xg"))} missing`,
  dim: true,
  watch: true,
  on: { decorate: story() }
});

// The Vega-Lite line shows the whole season. Vega draws new elements on every data change, so
// playing it frame by frame would replace a focused line 60 times a second and fire an update each
// frame. fromVegaView() reads the View's line mark, "marks", from its scenegraph, and follows the
// View's own renders, a resize included.
async function attachVega(box: HTMLElement): Promise<VegaLine> {
  const vegaLine = await drawVegaLine(box, weeks);
  const svg = box.querySelector("svg");
  // A group, not an image: its lines take focus, and screen readers skip what's inside an image.
  svg?.setAttribute("role", "group");
  svg?.setAttribute("aria-label", "Goals and expected goals on a Vega-Lite line");
  fromVegaView<Row>(vegaLine.view, {
    key: (d) => d.series,
    // Each point's value at its week, so threshold matches xG by week, as on the other two charts.
    sample: (d) => ({ value: d.value, at: d.week }),
    keyboard: true,
    markLabel: (d) =>
      d.series === "goals" ? `Goals scored: ${goals(end.goals)} by matchweek ${end.week}` : `Expected goals (xG): ${end.xg.toFixed(1)} by matchweek ${end.week}`,
    dim: true,
    on: { decorate: story() }
  });
  return vegaLine;
}
const vegaBox = document.querySelector<HTMLElement>("#vega-line");
if (!vegaBox) throw new Error("demo/line.html has no #vega-line.");
const vegaReady = attachVega(vegaBox);

window.addEventListener("resize", () => {
  host.resize();
  d3Effects.refresh(host.paths);
  gapsHost.resize();
  gapsEffects.refresh(gapsHost.paths);
  void vegaReady.then((vegaLine) => vegaLine.resize());
});

// One playback drives the four charts that play: the prototype's 6.5 s season in Presentation, about
// 2 s in Analysis, and at once in Off. It rests at the end, so the whole season shows until something
// reveals less.
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
    gapsChart.reveal(x);
    gapsHost.reveal(x);
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
