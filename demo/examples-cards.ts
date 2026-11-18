// The examples page's rows and words, and its three cards on the library's own charts: revenue by
// region against its target on barChart, seedling height under drought against a watered control on
// lineChart, and sessions by source on a donutChart that switches to bars. Every number is made up.
// demo/examples.ts wires the page's buttons; src/examples.test.ts builds these same cards on a clock it
// controls, so the page and its test can't drift apart.

import {
  barChart,
  chartSwitch,
  colorAssignment,
  delta,
  donutChart,
  icons,
  label,
  lineChart,
  only,
  threshold,
  trace,
  travel,
  type BarChart,
  type ChartSwitch,
  type ColorAssignment,
  type DonutChart,
  type LineChart
} from "../src/index";

/** The charts a card is built with: the library's own, or a test's on its own clock. */
export interface Charts {
  readonly barChart: typeof barChart;
  readonly donutChart: typeof donutChart;
  readonly lineChart: typeof lineChart;
  readonly chartSwitch: typeof chartSwitch;
}
const library: Charts = { barChart, donutChart, lineChart, chartSwitch };

// ── Business: revenue by region against its target ───────────────────────────

/** A region's quarter, in millions of dollars. */
export interface Region {
  readonly region: string;
  readonly revenue: number;
  readonly target: number;
}
export type Quarter = "Q3 2026" | "Q4 2026";

/** West passes South in Q4, so the rows move; Central's revenue stays, so it gets no change label. */
export const quarters: Readonly<Record<Quarter, readonly Region[]>> = {
  "Q3 2026": [
    { region: "North", revenue: 4.2, target: 4.0 },
    { region: "East", revenue: 3.8, target: 3.6 },
    { region: "South", revenue: 3.1, target: 3.5 },
    { region: "West", revenue: 2.6, target: 3.0 },
    { region: "Central", revenue: 1.9, target: 2.0 }
  ],
  "Q4 2026": [
    { region: "North", revenue: 4.6, target: 4.4 },
    { region: "East", revenue: 3.7, target: 3.8 },
    { region: "South", revenue: 3.4, target: 3.6 },
    { region: "West", revenue: 3.5, target: 3.1 },
    { region: "Central", revenue: 1.9, target: 2.1 }
  ]
};

/** "$4.2M". */
export const dollars = (millions: number): string => `$${millions.toFixed(1)}M`;
/** A change in revenue: "+$0.4M", "−$0.1M". */
export const dollarChange = (change: number): string => `${change < 0 ? "−" : "+"}${dollars(Math.abs(change))}`;
/** Revenue as a share of its target, in whole per cent. */
export const ofTarget = (row: Region): number => Math.round((row.revenue / row.target) * 100);
/** What each bar's label says: "105% of target", or "105%" where the card is narrow. */
export const targetWords = (row: Region, narrow = false): string => `${ofTarget(row)}%${narrow ? "" : " of target"}`;
/** A change where the card is narrow: "+0.4", "−0.1". */
export const shortChange = (change: number): string => `${change < 0 ? "−" : "+"}${Math.abs(change).toFixed(1)}`;
/** A bar's name: "North: $4.2M revenue, 105% of its $4.0M target". */
export const regionWords = (row: Region): string => `${row.region}: ${dollars(row.revenue)} revenue, ${ofTarget(row)}% of its ${dollars(row.target)} target`;
/** The chart's name for a quarter. */
export const revenueLabel = (quarter: Quarter): string => `Revenue by region, ${quarter}, against target`;

/** What an update announces: the quarter, and the regions whose revenue changed. */
export const quarterWords = (quarter: Quarter, changed: readonly string[]): string =>
  `${quarter}: ${changed.length > 0 ? `${listed(changed)} changed` : "no change"}`;
/** "North", "North and East", "North, East and South". */
const listed = (names: readonly string[]): string => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

export interface RevenueCard {
  readonly chart: BarChart<Region>;
  /** The quarter shown, or the one an update is heading for. */
  readonly quarter: Quarter;
  /** Whether the labels are in their short words. */
  readonly narrow: boolean;
  /** Plays a quarter: values first, then rows, by the motion mode, each change labelled. */
  show(quarter: Quarter): Promise<void>;
  /** Tells the card its width in px, so its labels' words and the room kept for them fit it. */
  fit(width: number): void;
}

/** Below this many px the labels are short, "105%" and "+0.4", so the bars keep some length. */
export const NARROW = 480;
/** Px past the value labels for "105% of target" and a change beside it, and for their short forms. */
export const REVENUE_ROOM: Readonly<Record<"wide" | "narrow", number>> = { wide: 150, narrow: 76 };

export function revenueCard(target: string | Element, charts: Charts = library): RevenueCard {
  let quarter: Quarter = "Q3 2026";
  const host = typeof target === "string" ? document.querySelector(target) : target;
  // A width of 0 is no layout yet (or a test's jsdom): wide.
  const isNarrow = (width: number): boolean => width > 0 && width < NARROW;
  let narrow = isNarrow(host?.clientWidth ?? 0);
  const chart = charts.barChart<Region>(target, {
    label: revenueLabel(quarter),
    data: quarters[quarter],
    y: "region",
    x: "revenue",
    sort: "value",
    // One decimal everywhere, so a value counting past $3.0M reads as its neighbours do, and the table agrees with the names.
    format: dollars,
    seriesLabels: { revenue: "Revenue" },
    room: REVENUE_ROOM[narrow ? "narrow" : "wide"],
    tooltip: (d) => `${d.region}\n${dollars(d.revenue)} revenue\n${dollars(d.target)} target (${ofTarget(d)}%)`,
    markLabel: regionWords,
    // The name says the target already.
    markDescription: false,
    table: {
      category: "Region",
      columns: [
        { label: "Target", field: "target", after: "values" },
        { label: "Of target", field: ofTarget, format: (value) => `${String(value)}%`, after: "values" }
      ]
    },
    // The page says the quarter and the regions whose revenue changed: "Q4 2026: North, East, South and West changed".
    announce: (change) => quarterWords(quarter, change.changed),
    on: {
      hover: trace(),
      // The target is text, which stays in the end state: reduced motion shows it too.
      decorate: label<Region>((data) => targetWords(data.datum, narrow), { color: "text-muted" }),
      update: delta({ format: (change) => (narrow ? shortChange(change) : dollarChange(change)) })
    }
  });
  return {
    chart,
    get quarter() {
      return quarter;
    },
    get narrow() {
      return narrow;
    },
    show(next) {
      quarter = next;
      return chart.update({ data: quarters[next], label: revenueLabel(next) });
    },
    fit(width) {
      if (isNarrow(width) === narrow) return;
      narrow = !narrow;
      // The labels word themselves again as the chart lays out with the new room.
      void chart.update({ room: REVENUE_ROOM[narrow ? "narrow" : "wide"] });
    }
  };
}

// ── Science: seedling height under drought ───────────────────────────────────

/** A day's mean seedling height in each group, in cm. Watering of the drought group stops on day 5. */
export interface Reading {
  readonly day: number;
  readonly drought: number;
  readonly control: number;
}

export const readings: readonly Reading[] = [
  { day: 0, drought: 2.0, control: 2.0 },
  { day: 1, drought: 2.7, control: 2.6 },
  { day: 2, drought: 3.5, control: 3.3 },
  { day: 3, drought: 4.2, control: 4.1 },
  { day: 4, drought: 5.2, control: 5.0 },
  { day: 5, drought: 6.1, control: 6.0 },
  { day: 6, drought: 7.0, control: 7.1 },
  { day: 7, drought: 7.6, control: 8.2 },
  { day: 8, drought: 8.0, control: 9.4 },
  { day: 9, drought: 8.3, control: 10.5 },
  { day: 10, drought: 8.5, control: 11.7 },
  { day: 11, drought: 8.6, control: 12.8 },
  { day: 12, drought: 8.6, control: 13.9 }
];

/** "8.6 cm". */
export const cm = (value: number): string => `${value.toFixed(1)} cm`;
export const groupLabels: Readonly<Record<"drought" | "control", string>> = { drought: "Drought", control: "Control (watered)" };
/** A point's name: "Day 9: 8.3 cm, Drought". */
export const readingWords = (day: number, value: number, group: string): string => `Day ${day}: ${cm(value)}, ${group}`;
export const HEIGHT_LABEL = "Seedling height by day, drought against control";
/** The legend's entry for the colour `threshold` draws. */
export const BELOW_CONTROL = "Drought below control";

export function heightCard(target: string | Element, charts: Charts = library): LineChart<Reading> {
  return charts.lineChart<Reading>(target, {
    label: HEIGHT_LABEL,
    data: readings,
    x: "day",
    series: ["drought", "control"],
    seriesLabels: groupLabels,
    format: (value) => value.toFixed(1),
    labels: (value) => cm(value),
    xFormat: (x) => `Day ${String(x)}`,
    hover: "point",
    legend: { entries: [{ label: BELOW_CONTROL, color: "negative" }] },
    markLabel: (d, mark) => {
      const shown = mark.values[0];
      return shown ? readingWords(d.day, shown.value, shown.label) : mark.text;
    },
    tooltip: (d, point) => {
      const group = point?.series === "control" ? "control" : "drought";
      return `Day ${d.day}\n${cm(d[group])}, ${groupLabels[group]}`;
    },
    // The name says the same.
    markDescription: false,
    table: {
      category: "Day",
      series: { drought: "Drought (cm)", control: "Control (cm)" },
      columns: [{ label: "Difference (cm)", field: (d) => d.drought - d.control, format: (value) => (value as number).toFixed(1).replace("-", "−"), after: "values" }]
    },
    // Red wherever the drought group is below the control, on the line and not its points.
    on: { hover: "pulse", decorate: only("drought", threshold({ compareTo: "control" })) }
  });
}

// ── Web analytics: sessions by source ────────────────────────────────────────

/** A traffic source's sessions over the last 30 days. */
export interface Source {
  readonly source: string;
  readonly sessions: number;
}

export const sources: readonly Source[] = [
  { source: "Search", sessions: 18400 },
  { source: "Direct", sessions: 9200 },
  { source: "Social", sessions: 6100 },
  { source: "Referral", sessions: 4300 },
  { source: "Email", sessions: 3000 }
];

/** Each view's name, which the switch announces when it lands there. */
export const SESSIONS_LABELS: Readonly<Record<"donut" | "bars", string>> = {
  donut: "Sessions by source, share of total",
  bars: "Sessions by source, counts"
};

/** The two views, in the switch's colours, so a source keeps its colour from slice to bar. */
const sessionViews = (charts: Charts) => ({
  donut: (container: HTMLElement, colors: ColorAssignment): DonutChart<Source> =>
    charts.donutChart<Source>(container, {
      label: SESSIONS_LABELS.donut,
      data: sources,
      category: "source",
      value: "sessions",
      colors,
      center: (total, format) => `${format(total)}\nsessions`,
      table: { category: "Source", series: { sessions: "Sessions" } },
      on: { hover: travel(icons.arrow) }
    }),
  bars: (container: HTMLElement, colors: ColorAssignment): BarChart<Source> =>
    charts.barChart<Source>(container, {
      label: SESSIONS_LABELS.bars,
      data: sources,
      y: "source",
      x: "sessions",
      colorBy: "category",
      colors,
      seriesLabels: { sessions: "sessions" },
      table: { category: "Source", series: { sessions: "Sessions" } },
      on: { hover: travel(icons.arrow) }
    })
});
export type SessionViews = ReturnType<typeof sessionViews>;
export type SessionView = keyof SessionViews;

export function sessionsCard(target: string | Element, charts: Charts = library): ChartSwitch<SessionViews> {
  // Pinned in the rows' order, so a source's colour never depends on which view drew first.
  const colors = colorAssignment(Object.fromEntries(sources.map((row, i) => [row.source, i + 1])));
  return charts.chartSwitch(target, { views: sessionViews(charts), initial: "donut", colors, announce: true });
}
