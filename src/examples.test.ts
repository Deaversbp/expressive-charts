// The examples page (demo/examples.html, M18 step 6): its three cards, built by demo/examples-cards.ts
// as the page builds them, on a clock the test controls. These pin what the page promises: each card's
// marks, names and table; the quarter's play, with its change labels and its announcement; the drought
// line coloured only where it's below its control; the donut's switch to bars and back, focus following
// its source; and every card in its end state with Off and with reduced motion. It brings charts and
// effects together, so it lives beside src/index.ts, the only module allowed to.

import {
  BELOW_CONTROL,
  HEIGHT_LABEL,
  NARROW,
  REVENUE_ROOM,
  SESSIONS_LABELS,
  dollarChange,
  heightCard,
  quarterWords,
  quarters,
  readings,
  regionWords,
  revenueCard,
  revenueLabel,
  sessionsCard,
  shortChange,
  sources,
  targetWords,
  type Charts,
  type Quarter
} from "../demo/examples-cards";
import { barChart, chartSwitch, donutChart, lineChart, type ChartEnv } from "./charts";
import { createMotion, manualClock, type MotionMode } from "./core";
import { morph } from "./effects";
import { iconRegistry, presetRegistry } from "./registries";

type Env = ChartEnv & { readonly clock: ReturnType<typeof manualClock> };

function env(mode: MotionMode = "presentation", reduced = false): Env {
  const motion = createMotion({ mode, reducedMotion: { matches: reduced, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

/** jsdom has no layout, so each chart is given a width, as a card would give it. */
const WIDTH = 600;

/** The library's charts as the page calls them, on the test's clock, with the root's default transition. */
const chartsOn = (e: ChartEnv, width = WIDTH): Charts => ({
  barChart: (target, options) => barChart(target, { width, ...options }, e),
  donutChart: (target, options) => donutChart(target, { width, ...options }, e),
  lineChart: (target, options) => lineChart(target, { width, ...options }, e),
  chartSwitch: (target, options) => chartSwitch(target, { transition: morph(), ...options }, e)
});

afterEach(() => document.body.replaceChildren());

const host = (): HTMLElement => document.body.appendChild(document.createElement("div"));

/** Runs the clock on, a frame at a time, letting each frame's promises settle, as a browser's would. */
async function run(e: Env, ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 16) {
    e.clock.advance(16);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
}
/** Lets promises settle with no time passing. */
const settle = (e: Env): Promise<void> => run(e, 0).then(() => Promise.resolve());

const pointer = (type: string, target: Element): boolean => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
const press = (name: string): void => void document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

/** Each mark's accessible name, in document order. */
const names = (root: Element): string[] => Array.from(root.querySelectorAll('[role="img"][aria-label]'), (mark) => mark.getAttribute("aria-label") ?? "");
/** The data table's cells, a row each, headers first. */
const table = (root: Element): string[][] => Array.from(root.querySelectorAll(".ec-table tr"), (row) => Array.from(row.children, (cell) => cell.textContent ?? ""));
/** What effects in a slot have written, by mark: each text and its opacity (1 when it has none set). */
function texts(root: Element, slot: string): Record<string, { readonly text: string; readonly opacity: number }> {
  return Object.fromEntries(
    Array.from(root.querySelectorAll<SVGGElement>(`.ec-overlay .ec-run[data-slot="${slot}"]`), (group) => [group, group.querySelector<SVGTextElement>("text.ec-text")] as const)
      .filter((entry): entry is readonly [SVGGElement, SVGTextElement] => entry[1] !== null)
      .map(([group, text]) => [group.getAttribute("data-key")!, { text: text.textContent ?? "", opacity: Number(text.getAttribute("opacity") ?? text.style.opacity ?? 1) || (text.getAttribute("opacity") === "0" ? 0 : 1) }])
  );
}
const words = (root: Element, slot: string): Record<string, string> => Object.fromEntries(Object.entries(texts(root, slot)).map(([key, value]) => [key, value.text]));
const announced = (root: Element): string => root.querySelector(".ec-announcer")?.textContent ?? "";

// ── Business ─────────────────────────────────────────────────────────────────

describe("revenue by region", () => {
  const Q3: Quarter = "Q3 2026";
  const Q4: Quarter = "Q4 2026";

  function setup(mode: MotionMode = "presentation", reduced = false) {
    const e = env(mode, reduced);
    const root = host();
    const card = revenueCard(root, chartsOn(e));
    return { e, root, card };
  }

  it("draws a bar a region, largest first, each named with its revenue and its target", async () => {
    const { e, root, card } = setup();
    await settle(e);
    expect(card.chart.marks().map((mark) => mark.key)).toEqual(["North", "East", "South", "West", "Central"]);
    expect(root.querySelector("svg")?.getAttribute("aria-label")).toBe("Revenue by region, Q3 2026, against target");
    expect(names(root).sort()).toEqual(quarters[Q3].map(regionWords).sort());
    expect(names(root)).toContain("North: $4.2M revenue, 105% of its $4.0M target");
    expect(names(root)).toContain("South: $3.1M revenue, 89% of its $3.5M target");
  });

  it("has a table with each region's revenue, its target and its share of it", async () => {
    const { e, root } = setup();
    await settle(e);
    expect(table(root)).toEqual([
      ["Region", "Revenue", "Target", "Of target"],
      ["North", "$4.2M", "$4.0M", "105%"],
      ["East", "$3.8M", "$3.6M", "106%"],
      ["South", "$3.1M", "$3.5M", "89%"],
      ["West", "$2.6M", "$3.0M", "87%"],
      ["Central", "$1.9M", "$2.0M", "95%"]
    ]);
  });

  it("labels every bar with its share of its target at rest, and nothing has changed yet", async () => {
    const { e, root } = setup();
    await run(e, 2000);
    expect(words(root, "decorate")).toEqual({ North: "105% of target", East: "106% of target", South: "89% of target", West: "87% of target", Central: "95% of target" });
    expect(words(root, "update")).toEqual({});
    expect(announced(root)).toBe("");
  });

  it("plays the next quarter: the bars that changed get their change, and Central none", async () => {
    const { e, root, card } = setup();
    await run(e, 2000);
    const done = card.show(Q4);
    expect(card.quarter).toBe(Q4);
    await run(e, 4000);
    await done;
    expect(card.chart.marks().map((mark) => mark.key)).toEqual(["North", "East", "West", "South", "Central"]);
    expect(texts(root, "update")).toEqual({
      North: { text: "+$0.4M", opacity: 1 },
      East: { text: "−$0.1M", opacity: 1 },
      South: { text: "+$0.3M", opacity: 1 },
      West: { text: "+$0.9M", opacity: 1 }
    });
    expect(words(root, "decorate")).toEqual({ North: "105% of target", East: "97% of target", South: "94% of target", West: "113% of target", Central: "90% of target" });
    expect(root.querySelector("svg")?.getAttribute("aria-label")).toBe(revenueLabel(Q4));
    expect(names(root)).toContain("West: $3.5M revenue, 113% of its $3.1M target");
  });

  it("announces the quarter once, with the regions that changed, in the chart's new order", async () => {
    const { e, root, card } = setup();
    await run(e, 2000);
    const said: string[] = [];
    const announcer = root.querySelector(".ec-announcer")!;
    new MutationObserver(() => said.push(announcer.textContent ?? "")).observe(announcer, { childList: true, characterData: true, subtree: true });
    void card.show(Q4);
    await run(e, 4000);
    expect(announced(root)).toBe("Q4 2026: North, East, West and South changed");
    expect(said.filter((text) => text !== "")).toEqual(["Q4 2026: North, East, West and South changed"]);
    expect(quarterWords(Q3, [])).toBe("Q3 2026: no change");
    expect(quarterWords(Q3, ["North"])).toBe("Q3 2026: North changed");
    expect(quarterWords(Q3, ["North", "East"])).toBe("Q3 2026: North and East changed");
  });

  it("goes back to Q3 from part way through Q4, and ends on Q3's bars with no change from where it began", async () => {
    const { e, root, card } = setup();
    await run(e, 2000);
    void card.show(Q4);
    await run(e, 300);
    void card.show(Q3);
    await run(e, 4000);
    expect(card.quarter).toBe(Q3);
    expect(card.chart.marks().map((mark) => mark.key)).toEqual(["North", "East", "South", "West", "Central"]);
    expect(words(root, "decorate")).toEqual({ North: "105% of target", East: "106% of target", South: "89% of target", West: "87% of target", Central: "95% of target" });
    // The change is from the values the last update gave, Q4's, not from part way.
    expect(words(root, "update")).toEqual({ North: "−$0.4M", East: "+$0.1M", South: "−$0.3M", West: "−$0.9M" });
  });

  it.each([
    ["Off", "off", false],
    ["reduced motion", "presentation", true]
  ] as const)("with %s the quarter is in its end state at once, its labels in place", async (_name, mode, reduced) => {
    const { e, root, card } = setup(mode, reduced);
    await settle(e);
    expect(words(root, "decorate")).toEqual({ North: "105% of target", East: "106% of target", South: "89% of target", West: "87% of target", Central: "95% of target" });
    void card.show(Q4);
    await settle(e);
    expect(card.chart.marks().map((mark) => mark.key)).toEqual(["North", "East", "West", "South", "Central"]);
    expect(texts(root, "update")).toEqual({
      North: { text: "+$0.4M", opacity: 1 },
      East: { text: "−$0.1M", opacity: 1 },
      South: { text: "+$0.3M", opacity: 1 },
      West: { text: "+$0.9M", opacity: 1 }
    });
    expect(texts(root, "decorate")["West"]).toEqual({ text: "113% of target", opacity: 1 });
    expect(announced(root)).toBe("Q4 2026: North, East, West and South changed");
  });

  it("words its labels short where the card is narrow, and keeps less room for them", async () => {
    const e = env();
    const root = host();
    Object.defineProperty(root, "clientWidth", { configurable: true, value: 246 });
    const card = revenueCard(root, chartsOn(e, 246));
    await run(e, 2000);
    expect(card.narrow).toBe(true);
    expect(words(root, "decorate")["North"]).toBe("105%");
    void card.show(Q4);
    await run(e, 4000);
    expect(words(root, "update")).toEqual({ North: "+0.4", East: "−0.1", South: "+0.3", West: "+0.9" });
    card.fit(NARROW);
    await run(e, 2000);
    expect(card.narrow).toBe(false);
    expect(words(root, "decorate")["North"]).toBe("105% of target");
    expect(REVENUE_ROOM.narrow).toBeLessThan(REVENUE_ROOM.wide);
    expect([targetWords(quarters[Q3][0]!, true), shortChange(-0.1), dollarChange(0.4)]).toEqual(["105%", "−0.1", "+$0.4M"]);
  });
});

// ── Science ──────────────────────────────────────────────────────────────────

describe("seedling height under drought", () => {
  function setup(mode: MotionMode = "presentation", reduced = false) {
    const e = env(mode, reduced);
    const root = host();
    const chart = heightCard(root, chartsOn(e));
    return { e, root, chart };
  }
  /** The runs threshold has drawn on the drought line: each path's data. */
  const runs = (root: Element): string[] => Array.from(root.querySelectorAll<SVGPathElement>('.ec-overlay .ec-run[data-slot="decorate"] path'), (path) => path.getAttribute("d") ?? "");
  const xs = (d: string): number[] => (d.match(/[ML]\s*(-?\d+(?:\.\d+)?)/g) ?? []).map((part) => Number(part.slice(1)));

  it("draws two lines and a point a day and group, each point named by its day, its height and its group", async () => {
    const { e, root, chart } = setup();
    await settle(e);
    const keys = chart.marks().map((mark) => mark.key);
    expect(keys.slice(0, 2)).toEqual(["drought", "control"]);
    expect(keys).toHaveLength(2 + 2 * readings.length);
    expect(root.querySelector("svg")?.getAttribute("aria-label")).toBe(HEIGHT_LABEL);
    const said = names(root);
    expect(said).toHaveLength(2 * readings.length);
    expect(said).toContain("Day 9: 8.3 cm, Drought");
    expect(said).toContain("Day 12: 13.9 cm, Control (watered)");
    expect(new Set(said).size).toBe(said.length);
  });

  it("has a table by day with both groups and their difference, and a legend entry for the colour", async () => {
    const { e, root } = setup();
    await settle(e);
    const rows = table(root);
    expect(rows[0]).toEqual(["Day", "Drought (cm)", "Control (cm)", "Difference (cm)"]);
    expect(rows[1]).toEqual(["Day 0", "2.0", "2.0", "0.0"]);
    expect(rows[10]).toEqual(["Day 9", "8.3", "10.5", "−2.2"]);
    expect(rows).toHaveLength(1 + readings.length);
    expect(Array.from(root.querySelectorAll(".ec-legend-item"), (item) => item.textContent)).toEqual(["Drought", "Control (watered)", BELOW_CONTROL]);
  });

  it("colours the drought line from where it crosses below the control to its end, and nowhere before", async () => {
    const { e, root, chart } = setup();
    await run(e, 2000);
    const drawn = runs(root);
    expect(drawn).toHaveLength(1);
    const line = chart.marks().find((mark) => mark.key === "drought")!;
    // The x axis is linear in the day, from the line's start to its end.
    const at = (day: number): number => line.start.x + ((line.end.x - line.start.x) * day) / 12;
    const run0 = xs(drawn[0]!);
    // The lines cross between day 5, where drought is 0.1 above, and day 6, where it's 0.1 below: half way.
    expect(run0[0]!).toBeGreaterThan(at(5));
    expect(run0[0]!).toBeLessThan(at(6));
    expect(run0[0]!).toBeCloseTo((at(5) + at(6)) / 2, 0);
    expect(run0[run0.length - 1]!).toBeCloseTo(line.end.x, 1);
    // The control line has no runs: the effect is on the drought line alone, and never on a point.
    expect(Array.from(root.querySelectorAll('.ec-overlay .ec-run[data-slot="decorate"]'), (group) => group.getAttribute("data-key")).filter((key) => key !== "drought" && root.querySelector(`.ec-overlay .ec-run[data-key="${key}"] path`))).toEqual([]);
  });

  it("hovers one point by the keys, with its tooltip, and leaves on Escape", async () => {
    const { e, root, chart } = setup();
    await settle(e);
    chart.focus("drought@9");
    await run(e, 400);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Day 9: 8.3 cm, Drought");
    expect(root.querySelector(".ec-tooltip-shown")?.textContent).toBe("Day 9\n8.3 cm, Drought");
    press("ArrowUp");
    await run(e, 400);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Day 9: 10.5 cm, Control (watered)");
    press("ArrowRight");
    await run(e, 400);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Day 10: 11.7 cm, Control (watered)");
    press("Escape");
    await run(e, 400);
    expect(root.querySelector(".ec-tooltip-shown")).toBeNull();
    // Focus stays, as after Escape on any chart.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Day 10: 11.7 cm, Control (watered)");
  });

  it.each([
    ["Off", "off", false],
    ["reduced motion", "presentation", true]
  ] as const)("with %s the colour is there at once", async (_name, mode, reduced) => {
    const { e, root } = setup(mode, reduced);
    await settle(e);
    expect(runs(root)).toHaveLength(1);
  });
});

// ── Web analytics ────────────────────────────────────────────────────────────

describe("sessions by source", () => {
  function setup(mode: MotionMode = "presentation", reduced = false) {
    const e = env(mode, reduced);
    const root = host();
    const switcher = sessionsCard(root, chartsOn(e));
    return { e, root, switcher };
  }
  const SOURCES = sources.map((row) => row.source);
  /** The view on show's root: the other is hidden. */
  const shown = (root: Element): Element => Array.from(root.querySelectorAll<SVGSVGElement>("svg.ec-chart")).find((svg) => svg.getAttribute("aria-label") !== null && !svg.closest("[hidden], [inert]"))!.parentElement!;

  it("starts as a donut: a slice a source, named with its sessions and its share, and the total in the hole", async () => {
    const { e, root, switcher } = setup();
    await settle(e);
    expect(switcher.current).toBe("donut");
    expect(switcher.marks().map((mark) => mark.key)).toEqual(SOURCES);
    const view = shown(root);
    expect(view.querySelector("svg")?.getAttribute("aria-label")).toBe(SESSIONS_LABELS.donut);
    expect(names(view)).toEqual(["Search: 18,400 sessions, 45%", "Direct: 9,200 sessions, 22%", "Social: 6,100 sessions, 15%", "Referral: 4,300 sessions, 10%", "Email: 3,000 sessions, 7%"]);
    expect(view.querySelector(".ec-center")?.textContent).toBe("41,000sessions");
    expect(table(view)[0]).toEqual(["Source", "Sessions", "Share"]);
    expect(table(view)[1]).toEqual(["Search", "18,400", "45%"]);
  });

  it("switches to bars and back, announcing each view once, every source keeping its colour", async () => {
    const { e, root, switcher } = setup();
    await settle(e);
    const colours = (view: Element): string[] => Array.from(view.querySelectorAll<SVGGElement>(".ec-mark"), (mark) => `${mark.getAttribute("data-key")}:${mark.style.getPropertyValue("--ec-mark")}`).sort();
    const asDonut = colours(shown(root));
    const said: string[] = [];
    const announcer = root.querySelector('[aria-live="polite"]')!;
    new MutationObserver(() => said.push(announcer.textContent ?? "")).observe(announcer, { childList: true, characterData: true, subtree: true });

    const there = switcher.show("bars");
    expect(switcher.current).toBe("bars");
    await run(e, 2000);
    await there;
    const bars = shown(root);
    expect(bars.querySelector("svg")?.getAttribute("aria-label")).toBe(SESSIONS_LABELS.bars);
    expect(switcher.marks().map((mark) => mark.key)).toEqual(SOURCES);
    expect(names(bars)).toEqual(["Search: 18,400 sessions", "Direct: 9,200 sessions", "Social: 6,100 sessions", "Referral: 4,300 sessions", "Email: 3,000 sessions"]);
    expect(colours(bars)).toEqual(asDonut);

    const back = switcher.show("donut");
    await run(e, 2000);
    await back;
    expect(shown(root).querySelector("svg")?.getAttribute("aria-label")).toBe(SESSIONS_LABELS.donut);
    // A live region says a text again only when it changes, so the library may pad one with a space.
    expect(said.map((text) => text.trim()).filter((text) => text !== "")).toEqual([SESSIONS_LABELS.bars, SESSIONS_LABELS.donut]);
  });

  it("goes back from part way, landing on the donut", async () => {
    const { e, root, switcher } = setup();
    await settle(e);
    void switcher.show("bars");
    await run(e, 400);
    void switcher.show("donut");
    expect(switcher.current).toBe("donut");
    await run(e, 2000);
    expect(shown(root).querySelector("svg")?.getAttribute("aria-label")).toBe(SESSIONS_LABELS.donut);
  });

  it("keeps focus on its source through a switch and back", async () => {
    const { e, root, switcher } = setup();
    await settle(e);
    switcher.chart("donut").focus("Social");
    await run(e, 400);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Social: 6,100 sessions, 15%");
    void switcher.show("bars");
    await run(e, 2000);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Social: 6,100 sessions");
    expect(shown(root).contains(document.activeElement)).toBe(true);
    void switcher.show("donut");
    await run(e, 2000);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Social: 6,100 sessions, 15%");
  });

  it("plays an arrow round the hovered slice, and it's gone on leave", async () => {
    const { e, root, switcher } = setup();
    await settle(e);
    const slice = shown(root).querySelector('.ec-mark[data-key="Direct"] .ec-hit, .ec-mark[data-key="Direct"]')!;
    pointer("pointerover", slice);
    pointer("pointermove", slice);
    await run(e, 400);
    expect(root.querySelectorAll('.ec-overlay .ec-icon[data-icon="arrow"]')).toHaveLength(1);
    switcher.leave();
    await run(e, 400);
    expect(root.querySelectorAll('.ec-overlay .ec-icon[data-icon="arrow"]')).toHaveLength(0);
  });

  it.each([
    ["Off", "off", false],
    ["reduced motion", "presentation", true]
  ] as const)("with %s a switch lands at once", async (_name, mode, reduced) => {
    const { e, root, switcher } = setup(mode, reduced);
    await settle(e);
    void switcher.show("bars");
    await settle(e);
    expect(shown(root).querySelector("svg")?.getAttribute("aria-label")).toBe(SESSIONS_LABELS.bars);
    expect(switcher.marks().map((mark) => mark.key)).toEqual(SOURCES);
  });
});
