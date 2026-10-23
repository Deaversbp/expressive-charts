// M6: the stress page (step 6). Six cases, each a card with a size picker, a start button and a frame
// readout: bars that update, hover on a large chart, a line on dates playing, D3 columns followed with
// watch, a switch with many pairs, and the first draw. Every chart keeps the library's defaults (its
// legend, data table and a name for every mark), since that's what pages get. Nothing plays until a
// button is pressed. scripts/bench.mjs presses the same buttons in headless Chromium and reads the
// numbers from each readout's data attributes.
import { select, type Selection } from "d3-selection";
import {
  barChart,
  chartSwitch,
  expressive,
  lineChart,
  motion,
  motionSwitch,
  only,
  parallel,
  playback,
  playButton,
  threshold,
  travel,
  type Attachment,
  type BarChart,
  type ChartSwitch,
  type ColorAssignment,
  type DataEffect,
  type EffectContext,
  type GeometryEffect,
  type Layer,
  type LineChart,
  type Playback,
  type PlayButton
} from "../src/index";

const NUMBER = new Intl.NumberFormat("en-US");
/** "1,000". */
const count = (n: number): string => NUMBER.format(n);
const MODES = { presentation: "Presentation", analysis: "Analysis", off: "Off" } as const;

/** A seeded random number generator, so every visit draws the same values. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

// ── Frames ───────────────────────────────────────────────────────────────────

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

/** Resolves once the next frame has been drawn: a task posted from its animation frame runs after its paint. */
function afterPaint(): Promise<number> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve(performance.now());
      };
      channel.port2.postMessage(undefined);
    })
  );
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** What a run measured: its frames, the time between them, and the long tasks (over 50 ms) while it ran. */
interface FrameStats {
  readonly frames: number;
  /** The 95th percentile of the time between frames, ms. */
  readonly p95: number;
  /** The longest time between frames, ms, counting from the press that started the run. */
  readonly longest: number;
  readonly longTasks: number;
  /** The long tasks' time added up, ms. */
  readonly longTaskMs: number;
}

const LONG_TASKS = typeof PerformanceObserver !== "undefined" && (PerformanceObserver.supportedEntryTypes ?? []).includes("longtask");

/**
 * Records every frame from now until stop(), which waits for one more frame, so the frame that shows
 * the run's end is counted. The first interval is from now, the press, to the first frame: work the
 * press does before anything is drawn shows as a long first frame.
 */
function recordFrames(): { stop(): Promise<FrameStats> } {
  const start = performance.now();
  const stamps: number[] = [];
  let live = true;
  const loop = (time: number): void => {
    if (!live) return;
    stamps.push(time);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const tasks: PerformanceEntry[] = [];
  const observer = LONG_TASKS ? new PerformanceObserver((list) => tasks.push(...list.getEntries())) : undefined;
  observer?.observe({ type: "longtask" });
  return {
    async stop() {
      await nextFrame();
      live = false;
      const end = performance.now();
      // A long task is reported a little after it ends.
      await sleep(60);
      tasks.push(...(observer?.takeRecords() ?? []));
      observer?.disconnect();
      const times = [start, ...stamps];
      const intervals = times.slice(1).map((time, i) => Math.max(0, time - times[i]!));
      const sorted = [...intervals].sort((a, b) => a - b);
      const long = tasks.filter((task) => task.startTime + task.duration > start && task.startTime < end);
      return {
        frames: stamps.length,
        p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
        longest: sorted[sorted.length - 1] ?? 0,
        longTasks: long.length,
        longTaskMs: long.reduce((sum, task) => sum + task.duration, 0)
      };
    }
  };
}

/** Smooth: a 95th percentile of 20 ms or less, and no frame over 50 ms. */
const isSmooth = (stats: FrameStats): boolean => stats.p95 <= 20 && stats.longest <= 50;

const ms = (value: number): string => `${value.toFixed(1)} ms`;

// ── Cards ────────────────────────────────────────────────────────────────────

/** A case's card: its pickers, its start button and its readout. */
function card(id: string): { start: HTMLButtonElement; readout: HTMLElement; group(name: string): HTMLElement } {
  const element = document.getElementById(id);
  const start = element?.querySelector<HTMLButtonElement>("[data-start]");
  const readout = element?.querySelector<HTMLElement>("[data-readout]");
  if (!element || !readout) throw new Error(`demo/stress.html has no #${id} with a readout.`);
  return {
    start: start ?? document.createElement("button"),
    readout,
    group(name) {
      const group = element.querySelector<HTMLElement>(`[data-${name}]`);
      if (!group) throw new Error(`#${id} has no [data-${name}] picker.`);
      return group;
    }
  };
}

/** Wires a row of toggle buttons, shows `initial` as picked, and calls `onPick` with each new pick. */
function segmented(group: HTMLElement, initial: string, onPick: (value: string) => void): void {
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button"));
  const show = (value: string): void => {
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.value === value));
  };
  show(initial);
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const value = button.dataset.value ?? "";
      if (button.getAttribute("aria-pressed") === "true") return;
      show(value);
      onPick(value);
    });
  }
}

/** Writes a run's numbers as text, and as data attributes for scripts/bench.mjs. */
function report(
  readout: HTMLElement,
  what: string,
  stats: FrameStats,
  more: { readonly smooth?: boolean; readonly text?: string; readonly data?: Readonly<Record<string, number>> } = {}
): void {
  const smooth = (more.smooth ?? true) && isSmooth(stats);
  const tasks =
    stats.longTasks === 0 ? "no long tasks" : `${stats.longTasks} long ${stats.longTasks === 1 ? "task" : "tasks"} (${ms(stats.longTaskMs)} in all)`;
  readout.textContent =
    `${smooth ? "Smooth" : "Not smooth"}. ${what} in ${MODES[motion.mode]}: ${count(stats.frames)} frames, ` +
    `95th percentile ${ms(stats.p95)}, longest ${ms(stats.longest)}, ${tasks}.${more.text ? ` ${more.text}` : ""}`;
  const data: Record<string, string> = {
    run: String(Number(readout.dataset.run ?? 0) + 1),
    smooth: String(smooth),
    mode: motion.mode,
    frames: String(stats.frames),
    p95: stats.p95.toFixed(2),
    longest: stats.longest.toFixed(2),
    longTasks: String(stats.longTasks),
    longTaskMs: stats.longTaskMs.toFixed(2)
  };
  for (const [name, value] of Object.entries(more.data ?? {})) data[name] = String(Math.round(value * 100) / 100);
  Object.assign(readout.dataset, data);
}

/**
 * One run at a time per case. Drawing the case again (a new size) ends the run under way: its
 * `cancelled` resolves, `live` turns false, and nothing is reported for it.
 */
function runs(): { readonly busy: boolean; begin(): Run; end(run: Run): void; cancel(): void } {
  let current: (Run & { stop(): void }) | undefined;
  return {
    get busy() {
      return current !== undefined;
    },
    begin() {
      let stop = (): void => {};
      const cancelled = new Promise<"cancelled">((resolve) => {
        stop = () => resolve("cancelled");
      });
      const run = {
        live: true,
        cancelled,
        stop() {
          run.live = false;
          stop();
        }
      };
      current = run;
      return run;
    },
    end(run) {
      if (current === run) current = undefined;
    },
    cancel() {
      current?.stop();
      current = undefined;
    }
  };
}

interface Run {
  live: boolean;
  readonly cancelled: Promise<"cancelled">;
}

/**
 * `stress.html?case=host` draws that case alone, its card the only one shown, so scripts/bench.mjs
 * measures each case without the others' marks and tables on the page. Without it, all six are drawn.
 */
const alone = new URLSearchParams(location.search).get("case");

/** Whether to draw a case; one left out has its card hidden. */
function drawn(name: string): boolean {
  if (alone === null || alone === name) return true;
  document.getElementById(`${name}-case`)?.setAttribute("hidden", "");
  return false;
}

// ── Bars ─────────────────────────────────────────────────────────────────────

interface Bar {
  readonly name: string;
  readonly value: number;
}

/** n bars, "Bar 1" to "Bar n", valued 10 to 100. */
function barsOf(n: number, random: () => number): Bar[] {
  return Array.from({ length: n }, (_, i) => ({ name: `Bar ${i + 1}`, value: 10 + Math.round(random() * 90) }));
}

/** The same bars, every one with a new value. */
function changed(rows: readonly Bar[], random: () => number): Bar[] {
  return rows.map((row) => {
    let value = row.value;
    while (value === row.value) value = 10 + Math.round(random() * 90);
    return { ...row, value };
  });
}

/** Each bar's name reads "Bar 12: 52 points". */
const BAR_LABELS = { value: "points" };
/** Short enough for the page to fit a 1000 × 2000 screenshot; the bars thin out instead. */
const BAR_HEIGHT = 150;

// ── Case 1: bars that update ─────────────────────────────────────────────────

const updateCard = card("update-case");
const updateRuns = runs();
let updateSize = 100;
let updateFlash = false;
let updateRows: Bar[] = [];
let updateChart: BarChart<Bar> | undefined;
const updateRandom = seeded(11);

function buildUpdate(): void {
  updateRuns.cancel();
  updateChart?.destroy();
  updateRows = barsOf(updateSize, seeded(updateSize));
  updateChart = barChart<Bar>("#update-chart", {
    label: `${count(updateSize)} bars, largest first`,
    data: updateRows,
    x: "name",
    y: "value",
    orientation: "vertical",
    sort: "value",
    seriesLabels: BAR_LABELS,
    height: BAR_HEIGHT,
    on: updateFlash ? { update: "flash" } : {}
  });
}

segmented(updateCard.group("size"), String(updateSize), (value) => {
  updateSize = Number(value);
  buildUpdate();
});
// The effect changes with update({ on }), without drawing the chart again.
segmented(updateCard.group("effect"), "none", (value) => {
  updateFlash = value === "flash";
  void updateChart?.update({ on: updateFlash ? { update: "flash" } : {} });
});

updateCard.start.addEventListener("click", async () => {
  const chart = updateChart;
  if (updateRuns.busy || !chart) return;
  const run = updateRuns.begin();
  const frames = recordFrames();
  updateRows = changed(updateRows, updateRandom);
  await Promise.race([chart.update({ data: updateRows }), run.cancelled]);
  const stats = await frames.stop();
  if (!run.live) return;
  updateRuns.end(run);
  report(updateCard.readout, `${count(updateSize)} bars${updateFlash ? " with flash" : ""}`, stats, { data: { size: updateSize } });
});

if (drawn("update")) buildUpdate();

// ── Case 2: hover on a large chart ───────────────────────────────────────────

const hoverCard = card("hover-case");
const hoverRuns = runs();
let hoverSize = 100;
let hoverChart: BarChart<Bar> | undefined;
/** How many bars a sweep hovers, and how often. */
const HOVERS = 60;
const HOVER_EVERY = 50;
/** A hover must show within this. */
const HOVER_LIMIT = 100;

function buildHover(): void {
  hoverRuns.cancel();
  hoverChart?.destroy();
  hoverChart = barChart<Bar>("#hover-chart", {
    label: `${count(hoverSize)} bars`,
    data: barsOf(hoverSize, seeded(hoverSize + 1)),
    x: "name",
    y: "value",
    orientation: "vertical",
    seriesLabels: BAR_LABELS,
    height: BAR_HEIGHT
  });
}

segmented(hoverCard.group("size"), String(hoverSize), (value) => {
  hoverSize = Number(value);
  buildHover();
});

const SWEEP = "Sweep across";
hoverCard.start.textContent = SWEEP;

/**
 * Hovers HOVERS bars spread across the chart, one every HOVER_EVERY ms, as the pointer would: a
 * pointerover on each, then a pointerleave off the chart. Returns how long each hover took to show:
 * from its pointerover to the end of the first frame drawn after it.
 */
async function sweep(svg: SVGSVGElement, run: Run): Promise<number[]> {
  const marks = Array.from(svg.querySelectorAll<SVGGElement>(".ec-mark"));
  const shown: number[] = [];
  for (let i = 0; i < HOVERS && run.live; i++) {
    const mark = marks[Math.min(marks.length - 1, Math.floor(((i + 0.5) / HOVERS) * marks.length))];
    if (!mark) break;
    const began = performance.now();
    mark.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    shown.push((await afterPaint()) - began);
    const rest = HOVER_EVERY - (performance.now() - began);
    if (rest > 0) await sleep(rest);
  }
  svg.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
  return shown;
}

hoverCard.start.addEventListener("click", async () => {
  const chart = hoverChart;
  // Pressed again while it sweeps: Stop.
  if (hoverRuns.busy) {
    hoverRuns.cancel();
    hoverCard.start.textContent = SWEEP;
    return;
  }
  if (!chart) return;
  const run = hoverRuns.begin();
  hoverCard.start.textContent = "Stop";
  const frames = recordFrames();
  const shown = await sweep(chart.element, run);
  const stats = await frames.stop();
  hoverCard.start.textContent = SWEEP;
  if (!run.live) return;
  hoverRuns.end(run);
  const sorted = [...shown].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const slowest = sorted[sorted.length - 1] ?? 0;
  report(hoverCard.readout, `${count(shown.length)} hovers on ${count(hoverSize)} bars`, stats, {
    smooth: slowest <= HOVER_LIMIT,
    text: `Each hover showed within ${ms(median)} (the median), ${ms(slowest)} at most.`,
    data: { size: hoverSize, hoverMedian: median, hoverMax: slowest }
  });
});

if (drawn("hover")) buildHover();

// ── Case 3: a line on dates, playing ─────────────────────────────────────────

interface Day {
  readonly date: Date;
  readonly visits: number;
  /** The 28 days to this one. */
  readonly average: number;
  /** The same day a year (365 days) earlier, and its average. */
  readonly earlier: number;
  readonly earlierAverage: number;
}

type DaySeries = "visits" | "average" | "earlier" | "earlierAverage";
const DAY_SERIES: readonly DaySeries[] = ["visits", "average", "earlier", "earlierAverage"];
const DAY = 86_400_000;
/** The last day shown: the data end on 31 December 2025, whatever the number of years. */
const LAST_DAY = Date.UTC(2025, 11, 31);
/** Days of a year: a "year earlier" is 365 days before. */
const YEAR = 365;
const WINDOW = 28;

/**
 * Daily visits over `years` calendar years to the end of 2025: a slow random walk, a yearly season, a
 * quieter weekend and noise, seeded. Each day has its 28-day average, and the same two a year earlier.
 */
function daysOf(years: number): Day[] {
  const first = Date.UTC(2025 - years + 1, 0, 1);
  const n = Math.round((LAST_DAY - first) / DAY) + 1;
  // The year before the first day, and the days its first average needs.
  const before = YEAR + WINDOW - 1;
  const random = seeded(2026);
  const visits: number[] = [];
  let level = 1200;
  for (let i = 0; i < before + n; i++) {
    const date = new Date(first + (i - before) * DAY);
    level = Math.min(2400, Math.max(400, level + (random() - 0.5) * 30));
    const season = 1 + 0.2 * Math.sin((2 * Math.PI * (date.getUTCMonth() * 30.4 + date.getUTCDate())) / 365.25);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 0.72 : 1;
    visits.push(Math.round(level * season * weekend * (0.85 + random() * 0.3)));
  }
  // Each day's average over the 28 days to it.
  const averages: number[] = [];
  let sum = 0;
  visits.forEach((value, i) => {
    sum += value - (i >= WINDOW ? visits[i - WINDOW]! : 0);
    averages.push(i >= WINDOW - 1 ? Math.round(sum / WINDOW) : value);
  });
  return Array.from({ length: n }, (_, j) => {
    const i = before + j;
    return { date: new Date(first + j * DAY), visits: visits[i]!, average: averages[i]!, earlier: visits[i - YEAR]!, earlierAverage: averages[i - YEAR]! };
  });
}

/** How many runs the decoration's runs started, and how many of those have drawn anything. */
interface RunCount {
  started: number;
  drawn: number;
}

/**
 * The effect, counting its runs: each `run()` or `end()` call starts one. With `drawn`, a run that
 * draws on its layer is counted once, when it first draws. The runner gives every run its own
 * context, and the effect's `clear()` gets the one it ran with.
 */
function counted<D>(effect: DataEffect<D>, runsOf: RunCount, drawn = false): DataEffect<D> {
  const contexts = new WeakMap<EffectContext, EffectContext>();
  const watched = (ctx: EffectContext): EffectContext => {
    if (!drawn) return ctx;
    let drew = false;
    const first = (): void => {
      if (drew) return;
      drew = true;
      runsOf.drawn++;
    };
    const layer: Layer = {
      icon: (icon, options) => (first(), ctx.layer.icon(icon, options)),
      path: (d, paint) => (first(), ctx.layer.path(d, paint)),
      text: (content, style) => (first(), ctx.layer.text(content, style))
    };
    const own = { ...ctx, layer };
    contexts.set(ctx, own);
    return own;
  };
  return {
    kind: "data",
    ...(effect.needs ? { needs: effect.needs } : {}),
    run: (mark, data, ctx) => {
      runsOf.started++;
      return effect.run(mark, data, watched(ctx));
    },
    end: (mark, data, ctx) => {
      runsOf.started++;
      effect.end(mark, data, watched(ctx));
    },
    clear: (ctx) => effect.clear(contexts.get(ctx) ?? ctx)
  };
}

/**
 * The effect's end state from the start, following the mark: the arrow rides the line's tip at once.
 * travel() would first carry it along the whole line at 360 px/s, and a year of days is a walk of
 * about 9,400 px (26 s), ten years about 60,000 (167 s): far past the 5 s that WCAG 2.2.2 allows
 * motion to start by itself. The plan's backlog has it.
 */
function riding(effect: GeometryEffect): GeometryEffect {
  return {
    kind: "geometry",
    run: async (mark, ctx) => effect.end(mark, ctx),
    end: (mark, ctx) => effect.end(mark, ctx),
    clear: (ctx) => effect.clear(ctx)
  };
}

const lineCard = card("line-case");
const lineRuns = runs();
let lineYears = 1;
let lineSeries = 2;
let lineChartNow: LineChart<Day> | undefined;
let linePlayback: Playback | undefined;
let linePlayButton: PlayButton | undefined;
let unsubscribeLine: (() => void) | undefined;
/** Every run the decoration starts (one per line and per point), and those on the visits line and its points. */
let lineCounts = { all: { started: 0, drawn: 0 }, visits: { started: 0, drawn: 0 } };
/** A play's base duration, whatever the years: 8 s in Presentation, 2.4 s in Analysis. */
const PLAY_MS = 8000;
const lineStatus = document.getElementById("line-status");
const DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

const LINE_HEIGHT = 200;

const LINE_LABELS: Readonly<Record<DaySeries, string>> = {
  visits: "Visits",
  average: "28-day average",
  earlier: "Visits a year earlier",
  earlierAverage: "28-day average a year earlier"
};

/** "Runs: 1,462 started, 731 on visits, 1 drawn." */
function runsText(): string {
  const { all, visits } = lineCounts;
  return `Runs: ${count(all.started)} started, ${count(visits.started)} of them on visits, ${count(visits.drawn)} drawn.`;
}

function buildLine(): void {
  lineRuns.cancel();
  unsubscribeLine?.();
  linePlayButton?.destroy();
  linePlayback?.destroy();
  lineChartNow?.destroy();
  const data = daysOf(lineYears);
  const series = DAY_SERIES.slice(0, lineSeries);
  // With one series, the red is below the period's average; otherwise below each day's 28-day average.
  const mean = Math.round(data.reduce((sum, day) => sum + day.visits, 0) / data.length);
  const compareTo = lineSeries === 1 ? mean : "average";
  lineCounts = { all: { started: 0, drawn: 0 }, visits: { started: 0, drawn: 0 } };
  const decorate = counted(
    only("visits", counted(parallel(threshold({ compareTo }), riding(travel("arrow", { ride: "on" }))), lineCounts.visits, true)),
    lineCounts.all
  );
  const years = lineYears === 1 ? "2025" : `${2026 - lineYears} to 2025`;
  const began = performance.now();
  const chart = lineChart<Day>("#line-chart", {
    label: `Daily visits, ${years}`,
    description:
      lineSeries === 1
        ? `Visits each day, ${years}. The line is red wherever a day's visits are below the period's average of ${count(mean)}.`
        : `Visits each day and their 28-day average, ${years}. The visits line is red wherever a day is below its 28-day average.`,
    data,
    x: "date",
    series,
    colors: { visits: 1, average: 2, earlier: 3, earlierAverage: 4 },
    seriesLabels: LINE_LABELS,
    legend: { entries: [{ label: lineSeries === 1 ? "Below the average" : "Below the 28-day average", color: "negative" }] },
    table: { category: "Date" },
    height: LINE_HEIGHT,
    on: { decorate }
  });
  lineChartNow = chart;

  const first = +data[0]!.date;
  const last = +data[data.length - 1]!.date;
  let shownDay = -1;
  const showDay = (x: number): void => {
    const day = Math.floor(x / DAY);
    if (day === shownDay || !lineStatus) return;
    shownDay = day;
    lineStatus.textContent = `Through ${DATE.format(day * DAY)}`;
  };
  showDay(last);
  linePlayback = playback({
    from: first,
    to: last,
    duration: PLAY_MS,
    onFrame(x) {
      chart.reveal(x);
      showDay(x);
    }
  });
  linePlayButton = playButton("#line-play", linePlayback, { labels: { play: "Play", pause: "Pause" } });
  // A play is measured from Play to its end, or to Pause.
  const what = `${lineYears} ${lineYears === 1 ? "year" : "years"} of days, ${lineSeries} ${lineSeries === 1 ? "series" : "series"}`;
  let frames: ReturnType<typeof recordFrames> | undefined;
  let run: Run | undefined;
  unsubscribeLine = linePlayback.subscribe((event) => {
    if (event === "play") {
      run = lineRuns.begin();
      frames = recordFrames();
    } else if ((event === "end" || event === "pause") && frames && run) {
      const ending = { frames, run };
      frames = undefined;
      run = undefined;
      void ending.frames.stop().then((stats) => {
        if (!ending.run.live) return;
        lineRuns.end(ending.run);
        report(lineCard.readout, `Played ${what}${event === "pause" ? " until paused" : ""}`, stats, {
          text: runsText(),
          data: { years: lineYears, series: lineSeries, runsStarted: lineCounts.all.started, runsOnVisits: lineCounts.visits.started, runsDrawn: lineCounts.visits.drawn }
        });
      });
    }
  });

  // How long the chart took to draw, as a page would see it: to the end of its first frame.
  void afterPaint().then((painted) => {
    if (lineChartNow !== chart) return;
    lineCard.readout.textContent = `Drawn in ${ms(painted - began)}: ${what}. ${runsText()} Press Play to measure a play.`;
    Object.assign(lineCard.readout.dataset, {
      years: String(lineYears),
      series: String(lineSeries),
      drawn: (painted - began).toFixed(2),
      runsStarted: String(lineCounts.all.started),
      runsOnVisits: String(lineCounts.visits.started),
      runsDrawn: String(lineCounts.visits.drawn)
    });
  });
}

segmented(lineCard.group("size"), String(lineYears), (value) => {
  lineYears = Number(value);
  buildLine();
});
segmented(lineCard.group("series"), String(lineSeries), (value) => {
  lineSeries = Number(value);
  buildLine();
});

if (drawn("line")) buildLine();

// ── Case 4: host columns with watch ──────────────────────────────────────────

// "Someone else's chart": columns drawn with d3-selection, each rect's row on __data__, moved by a
// transition the page writes itself, as d3-transition would: every column's y and height once a
// frame, eased in and out. It scales its duration with the library's motion, as architecture.md
// suggests for host transitions, so it jumps when motion is off.

interface Column {
  readonly id: string;
  readonly value: number;
}

const hostCard = card("host-case");
const hostRuns = runs();
let hostSize = 20;
let hostWatch = true;
let hostColumns: Column[] = [];
let hostAttachment: Attachment<Column> | undefined;
const hostRandom = seeded(13);
const HOST_HEIGHT = 160;
const HOST_MARGIN = { top: 8, right: 4, bottom: 8, left: 28 };
/** d3-transition's default duration, in base ms. */
const HOST_MS = 750;
/** The value above which a column is red. */
const TARGET = 50;
const cubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const hostElement = document.querySelector<SVGSVGElement>("#host-chart");
if (!hostElement) throw new Error("demo/stress.html has no #host-chart.");
const hostSvg = select<SVGSVGElement, unknown>(hostElement);
const hostAxes = hostSvg.append("g").attr("class", "axes").attr("aria-hidden", "true");
const hostPlot = hostSvg.append("g").attr("class", "plot");
let hostWidth = 0;
const plotHeight = HOST_HEIGHT - HOST_MARGIN.top - HOST_MARGIN.bottom;
const hostY = (value: number): number => plotHeight - (value / 100) * plotHeight;

/** The columns' rects, in data order. */
const hostRects = (): Selection<SVGRectElement, Column, SVGGElement, unknown> => hostPlot.selectAll<SVGRectElement, Column>("rect.host-column");

/** Lays the chart out at its parent's width: the axes, and every column where its value puts it. */
function layoutHost(): void {
  const parent = hostElement!.parentElement;
  hostWidth = Math.max(280, Math.floor(parent?.clientWidth ?? 480));
  const plotWidth = hostWidth - HOST_MARGIN.left - HOST_MARGIN.right;
  hostSvg.attr("viewBox", `0 0 ${hostWidth} ${HOST_HEIGHT}`).attr("width", hostWidth).attr("height", HOST_HEIGHT);
  hostAxes.attr("transform", `translate(${HOST_MARGIN.left},${HOST_MARGIN.top})`);
  hostPlot.attr("transform", `translate(${HOST_MARGIN.left},${HOST_MARGIN.top})`);
  hostAxes
    .selectAll<SVGLineElement, number>("line")
    .data([0, TARGET])
    .join("line")
    .attr("class", (v) => (v === 0 ? "host-baseline" : "host-target"))
    .attr("x1", 0)
    .attr("x2", plotWidth)
    .attr("y1", hostY)
    .attr("y2", hostY);
  hostAxes
    .selectAll<SVGTextElement, number>("text")
    .data([0, TARGET, 100])
    .join("text")
    .attr("class", "tick")
    .attr("x", -6)
    .attr("y", (v) => hostY(v) + 4)
    .attr("text-anchor", "end")
    .text((v) => v);
  const band = plotWidth / Math.max(1, hostColumns.length);
  hostRects()
    .attr("x", (_, i) => i * band + band * 0.1)
    .attr("width", Math.max(0.5, band * 0.8))
    .attr("y", (d) => hostY(d.value))
    .attr("height", (d) => plotHeight - hostY(d.value));
}

function buildHost(): void {
  hostRuns.cancel();
  hostAttachment?.destroy();
  const random = seeded(hostSize + 2);
  hostColumns = Array.from({ length: hostSize }, (_, i) => ({ id: `Column ${i + 1}`, value: Math.round(random() * 100) }));
  hostRects()
    .data(hostColumns, (d) => d.id)
    .join("rect")
    .attr("class", "host-column");
  layoutHost();
  hostAttachment = expressive(hostRects(), {
    key: (d) => d.id,
    // What each column shows, so refresh() hears every column change.
    value: (d) => d.value,
    keyboard: true,
    markLabel: (d) => `${d.id}: ${d.value}`,
    dim: true,
    watch: hostWatch,
    on: { decorate: threshold({ compareTo: TARGET, when: "above" }) }
  });
}

segmented(hostCard.group("size"), String(hostSize), (value) => {
  hostSize = Number(value);
  buildHost();
});
// An attachment's options are fixed, so following the other way attaches again.
segmented(hostCard.group("follow"), "watch", (value) => {
  hostWatch = value === "watch";
  buildHost();
});
window.addEventListener("resize", () => {
  layoutHost();
  hostAttachment?.refresh();
});

/** Moves every column to its new value over the transition's duration; resolves when it's there. */
function transition(run: Run): Promise<void> {
  const rects = hostRects();
  const from = rects.nodes().map((rect) => Number(rect.getAttribute("y")));
  const draw = (k: number): void => {
    rects.attr("y", (d, i) => from[i]! + k * (hostY(d.value) - from[i]!)).attr("height", (d, i) => plotHeight - (from[i]! + k * (hostY(d.value) - from[i]!)));
  };
  const duration = motion.duration(HOST_MS);
  if (duration <= 0) {
    draw(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let start: number | undefined;
    const frame = (time: number): void => {
      if (!run.live) return resolve();
      start ??= time;
      const t = Math.min(1, (time - start) / duration);
      draw(cubic(t));
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

hostCard.start.addEventListener("click", async () => {
  const attachment = hostAttachment;
  if (hostRuns.busy || !attachment) return;
  const run = hostRuns.begin();
  const frames = recordFrames();
  hostColumns = hostColumns.map((column) => {
    let value = column.value;
    while (value === column.value) value = Math.round(hostRandom() * 100);
    return { ...column, value };
  });
  // The join, then refresh(): the new values, with the columns where they are. Then the transition,
  // which watch follows frame by frame; without it, refresh() again once it's done.
  hostRects().data(hostColumns, (d) => d.id);
  attachment.refresh();
  await transition(run);
  if (run.live && !hostWatch) attachment.refresh();
  const stats = await frames.stop();
  if (!run.live) return;
  hostRuns.end(run);
  report(hostCard.readout, `${count(hostSize)} columns, ${hostWatch ? "with watch" : "refresh() at the end"}`, stats, {
    data: { size: hostSize, watch: hostWatch ? 1 : 0 }
  });
});

if (drawn("host")) buildHost();

// ── Case 5: a switch with many pairs ─────────────────────────────────────────

type SwitchViews = {
  readonly bars: (container: HTMLElement, colors: ColorAssignment) => BarChart<Bar>;
  readonly columns: (container: HTMLElement, colors: ColorAssignment) => BarChart<Bar>;
};

const switchCard = card("switch-case");
const switchRuns = runs();
let switchSize = 20;
let switcher: ChartSwitch<SwitchViews> | undefined;
/** The same height for both views, so the bars of a large switch fit. */
const SWITCH_HEIGHT = 180;

function buildSwitch(): void {
  switchRuns.cancel();
  switcher?.destroy();
  const rows = barsOf(switchSize, seeded(switchSize + 3));
  const n = count(switchSize);
  const views: SwitchViews = {
    bars: (container, colors) =>
      barChart<Bar>(container, { label: `${n} bars`, data: rows, x: "value", y: "name", orientation: "horizontal", seriesLabels: BAR_LABELS, colors, height: SWITCH_HEIGHT }),
    columns: (container, colors) =>
      barChart<Bar>(container, { label: `${n} columns`, data: rows, x: "name", y: "value", orientation: "vertical", seriesLabels: BAR_LABELS, colors, height: SWITCH_HEIGHT })
  };
  switcher = chartSwitch("#switch-chart", { views, initial: "bars", announce: true });
  showSwitchButton();
}

/** The button names the view a press goes to. */
function showSwitchButton(): void {
  switchCard.start.textContent = switcher?.current === "columns" ? "Show as bars" : "Show as columns";
}

segmented(switchCard.group("size"), String(switchSize), (value) => {
  switchSize = Number(value);
  buildSwitch();
});

/** The run under way, measured from the first press to the switch that lands; a press mid-way goes back. */
let switching: { run: Run; frames: ReturnType<typeof recordFrames>; presses: number; to: string } | undefined;

switchCard.start.addEventListener("click", async () => {
  const view = switcher;
  if (!view) return;
  const to = view.current === "bars" ? "columns" : "bars";
  const shown = view.show(to);
  showSwitchButton();
  switching ??= { run: switchRuns.begin(), frames: recordFrames(), presses: 0, to };
  const current = switching;
  current.presses++;
  current.to = to;
  await Promise.race([shown, current.run.cancelled]);
  // A later press is still under way: it reports.
  if (--current.presses > 0) return;
  switching = undefined;
  const stats = await current.frames.stop();
  if (!current.run.live) return;
  switchRuns.end(current.run);
  report(switchCard.readout, `${count(switchSize)} ${current.to === "columns" ? "bars to columns" : "columns to bars"}`, stats, { data: { size: switchSize } });
});

if (drawn("switch")) buildSwitch();

// ── Case 6: the first draw ───────────────────────────────────────────────────

const drawCard = card("draw-case");
const drawRuns = runs();
let drawSize = 1000;
let drawChart: BarChart<Bar> | undefined;

function buildDraw(): void {
  drawChart?.destroy();
  drawChart = barChart<Bar>("#draw-chart", {
    label: `${count(drawSize)} columns`,
    data: barsOf(drawSize, seeded(drawSize + 4)),
    x: "name",
    y: "value",
    orientation: "vertical",
    seriesLabels: BAR_LABELS,
    height: BAR_HEIGHT
  });
}

segmented(drawCard.group("size"), String(drawSize), (value) => {
  drawSize = Number(value);
  drawRuns.cancel();
  buildDraw();
});

drawCard.start.addEventListener("click", async () => {
  if (drawRuns.busy) return;
  const run = drawRuns.begin();
  drawChart?.destroy();
  drawChart = undefined;
  // Measured from here: the chart drawn from nothing, to the end of the frame that shows it.
  const frames = recordFrames();
  const began = performance.now();
  buildDraw();
  const painted = await afterPaint();
  const stats = await frames.stop();
  if (!run.live) return;
  drawRuns.end(run);
  report(drawCard.readout, `${count(drawSize)} columns drawn`, stats, {
    text: `Shown ${ms(painted - began)} after the press.`,
    data: { size: drawSize, drawn: painted - began }
  });
});

if (drawn("draw")) buildDraw();

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
motionSwitch("#motion");
