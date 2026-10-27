// Screenshots of demo/line.html on a stopped clock: the theme at rest, both charts mid-play at week 20,
// the crosshair with its tooltip, keyboard focus, the D3 line hovered, the Vega-Lite line at rest,
// hovered and focused, and the charts with missing weeks mid-play in a gap and at a missing week.
// Beside them, DOM checks: how long Play takes in each mode, reduced motion, the scrubber, the names,
// legend and table, the Vega-Lite line following a resize, and the gaps: no red in them, the ball
// waiting and jumping, and a gap staying a gap without motion. Names start with "line-", since
// screenshot names are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { FRAME, iconTransforms, lineDemo, openDemo, pickMode, REST, tabInto } from "./demo";

/** The library's line chart, the D3 line that expressive() drives, and the scrubber with both charts. */
const line = (page: Page): Locator => page.locator("#line");
const d3Line = (page: Page): Locator => page.locator("#d3-line");
const d3Box = (page: Page): Locator => page.locator(".d3-box");
const season = (page: Page): Locator => page.locator("#season");
/** The Vega-Lite line that fromVegaView() reads, and its card's box with the page's legend. */
const vegaLine = (page: Page): Locator => page.locator("#vega-line");
const vegaBox = (page: Page): Locator => page.locator(".vega-box");
/** A series' path on the Vega-Lite line, by the stroke the page gives Vega for it (vega-line.ts). */
const vegaPath = (page: Page, series: "goals" | "xg"): Locator =>
  vegaLine(page).locator(`.mark-line path[stroke="${series === "goals" ? "#2a78d6" : "#75736d"}"]`);

const playButton = (page: Page): Locator => page.locator("#play button");
const slider = (page: Page): Locator => page.getByRole("slider", { name: "Matchweek" });
const status = (page: Page): Locator => page.locator("#week-status");

/** A matchweek's focus stop on the line chart, which holds its hit column. */
const week = (page: Page, n: number): Locator => line(page).locator(`.ec-column[data-key="${n}"]`);
/** A series' path on the D3 line, by the class the page's D3 code gives it. */
const d3Path = (page: Page, series: "goals" | "xg"): Locator => d3Line(page).locator(`path.line-${series}`);

/** The library's line chart with missing weeks, the D3 line drawn with .defined(), and their two cards. */
const gaps = (page: Page): Locator => page.locator("#gaps");
const d3Gaps = (page: Page): Locator => page.locator("#d3-gaps");
const gapsPair = (page: Page): Locator => season(page).locator(".pair").nth(1);
const gapsWeek = (page: Page, n: number): Locator => gaps(page).locator(`.ec-column[data-key="${n}"]`);
/** Each chart's strokes by series: the line chart's, and the D3 code's paths. */
const STROKES = {
  "#gaps": { goals: '.ec-line[data-key="goals"] .ec-stroke', xg: '.ec-line[data-key="xg"] .ec-stroke' },
  "#d3-gaps": { goals: "path.line-goals", xg: "path.line-xg" }
} as const;

interface Gaps {
  /** Where each line has no value: from the last x of one subpath of its stroke to the first of the next, on screen. */
  readonly goals: [number, number][];
  readonly xg: [number, number][];
  /** Where the goals line ends, on screen. */
  readonly end: number;
  /** The screen x of every point of the red runs threshold draws on the goals line. */
  readonly reds: number[];
  /** The middle of the ball, on screen, if one is drawn. */
  readonly ball?: number;
}

/** The gaps in a chart's lines, the red runs and the ball, as drawn. */
async function drawnGaps(page: Page, chart: keyof typeof STROKES): Promise<Gaps> {
  return page.locator(chart).evaluate((root, strokes) => {
    /** A path's points on screen, by subpath: each "M" starts one. */
    const subpaths = (path: SVGGraphicsElement): number[][] => {
      const ctm = path.getScreenCTM()!;
      return (path.getAttribute("d") ?? "")
        .split("M")
        .filter((part) => part.trim())
        .map((part) => {
          const numbers = (part.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
          return numbers.flatMap((x, i) => (i % 2 === 0 ? [new DOMPoint(x, numbers[i + 1]).matrixTransform(ctm).x] : []));
        });
    };
    const gapsOf = (selector: string): [number, number][] => {
      const runs = subpaths(root.querySelector<SVGGraphicsElement>(selector)!);
      return runs.slice(1).map((run, i) => [Math.max(...runs[i]!), Math.min(...run)]);
    };
    const run = root.querySelector('.ec-overlay .ec-run[data-key="goals"]');
    const reds = [...(run?.querySelectorAll<SVGGraphicsElement>("path") ?? [])].filter((path) => !path.closest(".ec-icon")).flatMap((path) => subpaths(path).flat());
    const icon = run?.querySelector(".ec-icon")?.getBoundingClientRect();
    const end = Math.max(...subpaths(root.querySelector<SVGGraphicsElement>(strokes.goals)!).flat());
    return { goals: gapsOf(strokes.goals), xg: gapsOf(strokes.xg), end, reds, ball: icon ? icon.x + icon.width / 2 : undefined };
  }, STROKES[chart]);
}

/** The red points inside a gap of either line, half a pixel in from its ends: none, if threshold leaves the gaps alone. */
const redInGaps = ({ goals, xg, reds }: Gaps): number[] => reds.filter((x) => [...goals, ...xg].some(([from, to]) => x > from + 0.5 && x < to - 0.5));

/** The red runs threshold draws on each chart's goals line (the ball's own paths are inside its icon). */
async function redRuns(chart: Locator): Promise<number> {
  return chart.locator('.ec-overlay .ec-run[data-key="goals"] path').evaluateAll((paths) => paths.filter((path) => !path.closest(".ec-icon")).length);
}

/** Opens the page and lets the decoration's first trip, the ball rolling the whole season, finish. */
async function openAtRest(page: Page): Promise<void> {
  await openDemo(page, lineDemo);
  await page.clock.runFor(REST);
}

/**
 * Moves the pointer onto a goals line, about `share` of the way along it: hover() would aim at its
 * box's middle, off the stroke. Firefox's pointer lands on whole pixels, so it aims at the first whole
 * pixel on or after that point that's on the stroke.
 */
async function hoverD3Goals(page: Page, share = 0.3, path: Locator = d3Path(page, "goals")): Promise<void> {
  const point = await path.evaluate((element, along) => {
    const path = element as SVGPathElement;
    const length = path.getTotalLength();
    for (let step = 0; step < 200; step++) {
      const at = path.getPointAtLength(Math.min(length, length * along + step * 0.5));
      const screen = new DOMPoint(at.x, at.y).matrixTransform(path.getScreenCTM() ?? undefined);
      const x = Math.round(screen.x);
      const y = Math.round(screen.y);
      if (document.elementFromPoint(x, y) === path) return { x, y };
    }
    throw new Error("No whole pixel on the line's stroke.");
  }, share);
  await page.mouse.move(point.x, point.y);
}

/** The base duration of a whole season's play, and the share of it from week 1 to week 20. */
const SEASON = 6500;
const TO_WEEK_20 = (SEASON * 19) / 37;

test.describe("theme", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the page at rest, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);
      await expect(status(page)).toHaveText("Through matchweek 38");
      await expect(page).toHaveScreenshot(`line-page-${colorScheme}.png`, { fullPage: true });
    });
  }
});

test.describe("Play season", () => {
  test("both charts mid-play at week 20: the red runs so far, and the ball at the tip", async ({ page }) => {
    await openAtRest(page);
    await playButton(page).click();
    await expect(playButton(page)).toHaveText("Pause");
    // Up to the first frame at or past week 20, a frame's width (under a tenth of a week) at most.
    await page.clock.runFor(Math.ceil(TO_WEEK_20) + FRAME);
    await expect(status(page)).toHaveText("Through matchweek 20");
    await expect(slider(page)).toHaveValue("20");
    await expect(slider(page)).toHaveAttribute("aria-valuetext", "Through matchweek 20");
    // Weeks 21 on are hidden and out of reach.
    await expect(week(page, 20)).not.toHaveAttribute("visibility", "hidden");
    await expect(week(page, 21)).toHaveAttribute("visibility", "hidden");
    // One red run so far on each (weeks 1 to 14, touching xG at weeks 7 and 13), and a ball on each.
    expect(await redRuns(line(page))).toBe(1);
    expect(await redRuns(d3Line(page))).toBe(1);
    expect(await iconTransforms(line(page))).toHaveLength(1);
    expect(await iconTransforms(d3Line(page))).toHaveLength(1);
    // The scrubber and the first two charts; the charts with missing weeks have pictures of their own.
    const [bar, pair] = await Promise.all([season(page).locator(".bar").boundingBox(), season(page).locator(".pair").first().boundingBox()]);
    if (!bar || !pair) throw new Error("The scrubber or the first two charts aren't shown.");
    // In whole pixels, outward, as an element's picture is.
    const [left, top] = [Math.floor(bar.x), Math.floor(bar.y)];
    const clip = { x: left, y: top, width: Math.ceil(bar.x + bar.width) - left, height: Math.ceil(pair.y + pair.height) - top };
    await expect(page).toHaveScreenshot("line-play-week-20.png", { clip });

    // It plays on to the end, and the button goes back to Play.
    await page.clock.runFor(REST);
    await expect(playButton(page)).toHaveText("Play season");
    await expect(status(page)).toHaveText("Through matchweek 38");
    await expect(slider(page)).toHaveValue("38");
    expect(await redRuns(line(page))).toBe(3);
    expect(await redRuns(d3Line(page))).toBe(3);
  });

  for (const { mode, ms } of [
    { mode: "Presentation", ms: SEASON },
    { mode: "Analysis", ms: SEASON * 0.3 }
  ] as const) {
    test(`takes about ${ms / 1000} s in ${mode}, and Pause stops it`, async ({ page }) => {
      await openAtRest(page);
      await pickMode(page, mode);
      await playButton(page).click();
      await page.clock.runFor(ms - 50);
      await expect(playButton(page)).toHaveText("Pause");
      await page.clock.runFor(100);
      await expect(playButton(page)).toHaveText("Play season");
      await expect(status(page)).toHaveText("Through matchweek 38");

      // Played again from week 1 and paused part way, both charts stay where it stopped.
      await playButton(page).click();
      await page.clock.runFor(ms / 2);
      await playButton(page).click();
      await expect(playButton(page)).toHaveText("Play season");
      const paused = await status(page).textContent();
      expect(paused).not.toBe("Through matchweek 38");
      const drawn = (): Promise<(string | null)[]> =>
        Promise.all([line(page).locator('.ec-line[data-key="goals"] .ec-stroke'), d3Path(page, "goals")].map((path) => path.getAttribute("d")));
      const lines = await drawn();
      await page.clock.runFor(REST);
      await expect(status(page)).toHaveText(paused ?? "");
      expect(await drawn()).toEqual(lines);
    });
  }
});

test.describe("the scrubber", () => {
  test("seeks both charts, gliding there, and says the week", async ({ page }) => {
    await openAtRest(page);
    await slider(page).focus();
    await page.keyboard.press("Home");
    await expect(slider(page)).toHaveAttribute("aria-valuetext", "Through matchweek 1");
    // A seek glides over 350 ms in Presentation.
    await page.clock.runFor(100);
    await expect(status(page)).not.toHaveText("Through matchweek 1");
    await page.clock.runFor(REST);
    await expect(status(page)).toHaveText("Through matchweek 1");
    // Week 1 alone is a point: no red, and no ball on either line.
    expect(await redRuns(line(page))).toBe(0);
    expect(await iconTransforms(line(page))).toEqual([]);
    expect(await iconTransforms(d3Line(page))).toEqual([]);

    await slider(page).fill("20");
    await page.clock.runFor(REST);
    await expect(status(page)).toHaveText("Through matchweek 20");
    await expect(slider(page)).toHaveAttribute("aria-valuetext", "Through matchweek 20");
    await expect(week(page, 21)).toHaveAttribute("visibility", "hidden");
    expect(await redRuns(line(page))).toBe(1);
    expect(await redRuns(d3Line(page))).toBe(1);
    // Seeking pauses nothing that wasn't playing, and the button still offers Play.
    await expect(playButton(page)).toHaveText("Play season");
  });
});

test("the crosshair and its tooltip", async ({ page }) => {
  await openAtRest(page);
  await week(page, 12).locator(".ec-hit").hover();
  await page.clock.runFor(REST);
  const tooltip = line(page).locator(".ec-tooltip");
  await expect(tooltip).toHaveClass(/ec-tooltip-shown/);
  await expect(tooltip).toHaveText(/^Matchweek 12\s*18 goals · 19\.0 xG\s*-1\.0 vs expected$/);
  await expect(line(page).locator(".ec-crosshair")).not.toHaveAttribute("visibility", "hidden");
  await expect(line(page)).toHaveScreenshot("line-tooltip.png");
});

test.describe("keyboard focus", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the focus ring on a week of the line chart and on the D3 goals line, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);

      // One tab stop, at the first week; the arrow keys go week by week.
      await tabInto(page, line(page));
      await expect(week(page, 1)).toBeFocused();
      for (let i = 1; i < 12; i++) await page.keyboard.press("ArrowRight");
      await expect(week(page, 12)).toBeFocused();
      await page.clock.runFor(REST);
      await expect(line(page).locator(".ec-focus")).not.toHaveAttribute("visibility", "hidden");
      await expect(line(page)).toHaveScreenshot(`line-focus-chart-${colorScheme}.png`);

      // The D3 line: goals first, as the page draws it.
      await tabInto(page, d3Line(page));
      await expect(d3Path(page, "goals")).toBeFocused();
      await page.clock.runFor(REST);
      await expect(d3Line(page).locator(".ec-focus-ring")).not.toHaveAttribute("visibility", "hidden");
      await expect(d3Box(page)).toHaveScreenshot(`line-focus-d3-${colorScheme}.png`);
    });
  }
});

test("the D3 line hovered: the goals line in its strong colour, xG dimmed", async ({ page }) => {
  await openAtRest(page);
  await hoverD3Goals(page);
  await page.clock.runFor(REST);
  await expect(d3Path(page, "xg")).toHaveCSS("opacity", "0.3");
  await expect(d3Box(page)).toHaveScreenshot("line-d3-hover.png");
});

test.describe("the Vega-Lite line", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`at rest, ${colorScheme}: three red runs, the ball at the tip, xG dashed in the theme's grey`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);
      expect(await redRuns(vegaLine(page))).toBe(3);
      expect(await iconTransforms(vegaLine(page))).toHaveLength(1);
      await expect(vegaPath(page, "xg")).toHaveAttribute("stroke-dasharray", "6,4");
      await expect(vegaBox(page)).toHaveScreenshot(`line-vega-${colorScheme}.png`);
    });

    test(`the focus ring on its goals line, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);
      // One tab stop after the D3 line, goals first.
      await tabInto(page, vegaLine(page));
      await expect(vegaPath(page, "goals")).toBeFocused();
      await page.clock.runFor(REST);
      await expect(vegaLine(page).locator(".ec-focus-ring")).not.toHaveAttribute("visibility", "hidden");
      await expect(vegaBox(page)).toHaveScreenshot(`line-vega-focus-${colorScheme}.png`);
    });
  }

  test("hovered: the goals line in its strong colour, xG dimmed", async ({ page }) => {
    await openAtRest(page);
    await hoverD3Goals(page, 0.3, vegaPath(page, "goals"));
    await page.clock.runFor(REST);
    await expect(vegaPath(page, "xg")).toHaveCSS("opacity", "0.3");
    await expect(vegaBox(page)).toHaveScreenshot("line-vega-hover.png");
  });

  test("names its lines, and follows a resize Vega draws, with no refresh() from the page", async ({ page }) => {
    await openAtRest(page);
    await tabInto(page, vegaLine(page));
    await expect(vegaPath(page, "goals")).toHaveAttribute("aria-label", "Goals scored: 56 goals by matchweek 38");
    await page.keyboard.press("ArrowRight");
    await expect(vegaPath(page, "xg")).toBeFocused();
    await expect(vegaPath(page, "xg")).toHaveAttribute("aria-label", "Expected goals (xG): 56.5 by matchweek 38");

    // One column: Vega draws the line wider, and the colour and the ball follow on the next frame.
    const before = await vegaLine(page).locator("svg").getAttribute("width");
    await page.setViewportSize({ width: 700, height: 2000 });
    await expect(vegaLine(page).locator("svg")).not.toHaveAttribute("width", before ?? "");
    await page.clock.runFor(REST);
    expect(await redRuns(vegaLine(page))).toBe(3);
    const ends = await page.evaluate(() => {
      const end = (path: SVGGeometryElement): number => path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM()!).x;
      const goals = document.querySelector<SVGGeometryElement>('#vega-line .mark-line path[stroke="#2a78d6"]')!;
      const icon = document.querySelector<SVGGraphicsElement>('#vega-line .ec-overlay .ec-run[data-key="goals"] .ec-icon')!;
      const box = icon.getBoundingClientRect();
      return { line: end(goals), ball: box.x + box.width / 2 };
    });
    // The ball rests just behind the tip of the redrawn line.
    expect(ends.line - ends.ball).toBeGreaterThan(0);
    expect(ends.line - ends.ball).toBeLessThan(20);
  });
});

test.describe("names, legend and table", () => {
  test("each week's name and gap, the D3 lines' names, the legend's three entries and the Difference column", async ({ page }) => {
    await openDemo(page, lineDemo);
    const description = (element: Locator): Promise<string | null | undefined> =>
      element.evaluate((node) => node.ownerDocument.getElementById(node.getAttribute("aria-describedby") ?? "")?.textContent);

    await expect(week(page, 1)).toHaveAttribute("aria-label", "Matchweek 1: 0 goals, 0.6 xG");
    expect(await description(week(page, 1))).toBe("-0.6 vs expected");
    await expect(week(page, 20)).toHaveAttribute("aria-label", "Matchweek 20: 28 goals, 27.6 xG");
    expect(await description(week(page, 20))).toBe("+0.4 vs expected");

    await tabInto(page, line(page));
    await page.keyboard.press("End");
    await expect(week(page, 38)).toBeFocused();
    await expect(week(page, 38)).toHaveAttribute("aria-label", "Matchweek 38: 56 goals, 56.5 xG");

    await tabInto(page, d3Line(page));
    await expect(d3Path(page, "goals")).toHaveAttribute("aria-label", "Goals scored: 56 goals by matchweek 38");
    await page.keyboard.press("ArrowRight");
    await expect(d3Path(page, "xg")).toBeFocused();
    await expect(d3Path(page, "xg")).toHaveAttribute("aria-label", "Expected goals (xG): 56.5 by matchweek 38");

    await expect(line(page).locator(".ec-legend-item")).toHaveText(["Goals scored", "Expected goals (xG)", "Goals below xG"]);
    const table = line(page).locator("table");
    await expect(table.locator("thead th")).toHaveText(["Matchweek", "Goals scored", "Expected goals (xG)", "Difference"]);
    await expect(table.locator("tbody tr").nth(19).locator("th, td")).toHaveText(["20", "28", "27.6", "+0.4"]);
  });
});

test.describe("reduced motion", () => {
  test("Play ends at once, with the colour and the ball drawn on both charts", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, lineDemo);
    // The decoration's end state at load, with no time passing on the line chart and one frame for
    // watch to read the D3 line.
    await page.clock.runFor(FRAME);
    const atEnd = [await iconTransforms(line(page)), await iconTransforms(d3Line(page))];
    expect(atEnd.map((icons) => icons.length)).toEqual([1, 1]);

    await slider(page).fill("10");
    await expect(status(page)).toHaveText("Through matchweek 10");
    await page.clock.runFor(FRAME);
    expect(await redRuns(line(page))).toBe(1);

    await playButton(page).click();
    // No time passes: Play is heard, then the end.
    await expect(playButton(page)).toHaveText("Play season");
    await expect(status(page)).toHaveText("Through matchweek 38");
    await expect(slider(page)).toHaveValue("38");
    expect(await redRuns(line(page))).toBe(3);
    expect(await iconTransforms(line(page))).toEqual(atEnd[0]);
    await page.clock.runFor(FRAME);
    expect(await redRuns(d3Line(page))).toBe(3);
    expect(await iconTransforms(d3Line(page))).toEqual(atEnd[1]);
    // The Vega-Lite line, which doesn't play, shows the decoration's end state too.
    expect(await redRuns(vegaLine(page))).toBe(3);
    expect(await iconTransforms(vegaLine(page))).toHaveLength(1);
  });
});

test.describe("with missing weeks", () => {
  test("at rest: each gap left out of its line, and no red in any", async ({ page }) => {
    await openAtRest(page);
    for (const chart of ["#gaps", "#d3-gaps"] as const) {
      const drawn = await drawnGaps(page, chart);
      // Goals miss matchweeks 9 and 10; xG misses 4 and 5 as well.
      expect(drawn.goals, chart).toHaveLength(1);
      expect(drawn.xg, chart).toHaveLength(2);
      expect(drawn.reds.length, chart).toBeGreaterThan(0);
      expect(redInGaps(drawn), chart).toEqual([]);
      // The gap the two lines share is in the same place on both.
      expect(drawn.goals[0]![0], chart).toBeCloseTo(drawn.xg[1]![0], 0);
      expect(drawn.goals[0]![1], chart).toBeCloseTo(drawn.xg[1]![1], 0);
    }
    expect(await redRuns(gaps(page))).toBe(await redRuns(d3Gaps(page)));
  });

  test("mid-play: the ball waits at matchweek 8 while the gap is revealed, then jumps across it", async ({ page }) => {
    await openAtRest(page);
    await playButton(page).click();
    // Past matchweek 10, inside the gap: each line ends at matchweek 8, and its ball rests there.
    await page.clock.runFor(Math.ceil((SEASON * 9) / 37) + FRAME);
    await expect(status(page)).toHaveText("Through matchweek 10");
    for (const chart of ["#gaps", "#d3-gaps"] as const) {
      const drawn = await drawnGaps(page, chart);
      expect(drawn.goals, chart).toEqual([]);
      expect(drawn.ball, chart).toBeDefined();
      expect(drawn.end - drawn.ball!, chart).toBeGreaterThanOrEqual(0);
      expect(drawn.end - drawn.ball!, chart).toBeLessThan(20);
    }
    await expect(gapsPair(page)).toHaveScreenshot("line-gaps-wait.png");

    // Past matchweek 11, the line goes on from there, and the ball is past the gap.
    await page.clock.runFor(Math.ceil((SEASON * 2) / 37));
    await expect(status(page)).toHaveText("Through matchweek 12");
    for (const chart of ["#gaps", "#d3-gaps"] as const) {
      const drawn = await drawnGaps(page, chart);
      expect(drawn.goals, chart).toHaveLength(1);
      expect(drawn.ball, chart).toBeGreaterThan(drawn.goals[0]![1]);
      expect(redInGaps(drawn), chart).toEqual([]);
    }
  });

  test("the crosshair and its tooltip at a missing week", async ({ page }) => {
    await openAtRest(page);
    await gapsWeek(page, 9).locator(".ec-hit").hover();
    await page.clock.runFor(REST);
    const tooltip = gaps(page).locator(".ec-tooltip");
    await expect(tooltip).toHaveClass(/ec-tooltip-shown/);
    await expect(tooltip).toHaveText(/^Matchweek 9\s*goals missing · xG missing$/);
    await expect(gaps(page).locator(".ec-crosshair")).not.toHaveAttribute("visibility", "hidden");
    // No point to emphasise at a week with no values.
    await expect(gaps(page).locator(".ec-point.ec-hot")).toHaveCount(0);
    await expect(gaps(page)).toHaveScreenshot("line-gaps-tooltip.png");

    // Where only xG is missing, the goals point is hot, and the tooltip has no gap to give.
    await gapsWeek(page, 4).locator(".ec-hit").hover();
    await page.clock.runFor(REST);
    await expect(tooltip).toHaveText(/^Matchweek 4\s*4 goals · xG missing$/);
    await expect(gaps(page).locator(".ec-point.ec-hot")).toHaveCount(1);
  });

  test("names, the keyboard and the table say what's missing", async ({ page }) => {
    await openDemo(page, lineDemo);
    const description = (element: Locator): Promise<string | null | undefined> =>
      element.evaluate((node) => node.ownerDocument.getElementById(node.getAttribute("aria-describedby") ?? "")?.textContent);

    await expect(gapsWeek(page, 3)).toHaveAttribute("aria-label", "Matchweek 3: 3 goals, 3.5 xG");
    expect(await description(gapsWeek(page, 3))).toBe("-0.5 vs expected");
    await expect(gapsWeek(page, 4)).toHaveAttribute("aria-label", "Matchweek 4: 4 goals, xG missing");
    await expect(gapsWeek(page, 4)).not.toHaveAttribute("aria-describedby");
    await expect(gapsWeek(page, 9)).toHaveAttribute("aria-label", "Matchweek 9: goals missing, xG missing");

    // The arrow keys, and Page Up and Page Down, a tenth of the 38 weeks rounded up, stop at every week,
    // the missing ones too, where the crosshair shows the focus: there's no point to ring.
    await tabInto(page, gaps(page));
    await expect(gapsWeek(page, 1)).toBeFocused();
    for (let i = 1; i < 4; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("PageDown");
    await expect(gapsWeek(page, 8)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(gapsWeek(page, 9)).toBeFocused();
    await page.clock.runFor(REST);
    await expect(gaps(page).locator(".ec-crosshair")).not.toHaveAttribute("visibility", "hidden");
    await expect(gaps(page).locator(".ec-focus")).toHaveAttribute("visibility", "hidden");
    await expect(gaps(page).locator(".ec-tooltip")).toHaveText(/^Matchweek 9\s*goals missing · xG missing$/);
    await page.keyboard.press("PageDown");
    await expect(gapsWeek(page, 13)).toBeFocused();
    await page.keyboard.press("PageUp");
    await page.keyboard.press("PageUp");
    await expect(gapsWeek(page, 5)).toBeFocused();

    // The D3 lines are named for the whole season, with the weeks each is missing.
    await tabInto(page, d3Gaps(page));
    await expect(d3Gaps(page).locator("path.line-goals")).toBeFocused();
    await expect(d3Gaps(page).locator("path.line-goals")).toHaveAttribute("aria-label", "Goals scored: 56 goals by matchweek 38, matchweeks 9 and 10 missing");
    await page.keyboard.press("ArrowRight");
    await expect(d3Gaps(page).locator("path.line-xg")).toHaveAttribute("aria-label", "Expected goals (xG): 56.5 by matchweek 38, matchweeks 4, 5, 9 and 10 missing");

    const table = gaps(page).locator("table");
    await expect(table.locator("thead th")).toHaveText(["Matchweek", "Goals scored", "Expected goals (xG)", "Difference"]);
    await expect(table.locator("tbody tr").nth(3).locator("th, td")).toHaveText(["4", "4", "missing", "missing"]);
    await expect(table.locator("tbody tr").nth(8).locator("th, td")).toHaveText(["9", "missing", "missing", "missing"]);
    await expect(table.locator("tbody tr").nth(10).locator("th, td")).toHaveText(["11", "14", "16.6", "-2.6"]);
  });

  for (const how of ["reduced motion", "Off"] as const) {
    test(`${how}: a gap stays a gap, the ball waits at its start and is at the tip after Play`, async ({ page }) => {
      if (how === "reduced motion") await page.emulateMedia({ reducedMotion: "reduce" });
      await openDemo(page, lineDemo);
      if (how === "Off") await pickMode(page, "Off");

      // Revealed into the gap: the lines end at matchweek 8, with the ball there and nothing in the gap.
      await slider(page).fill("10");
      await expect(status(page)).toHaveText("Through matchweek 10");
      // One frame, for watch to read the D3 line.
      await page.clock.runFor(FRAME);
      for (const chart of ["#gaps", "#d3-gaps"] as const) {
        const drawn = await drawnGaps(page, chart);
        expect(drawn.goals, chart).toEqual([]);
        expect(drawn.end - drawn.ball!, chart).toBeGreaterThanOrEqual(0);
        expect(drawn.end - drawn.ball!, chart).toBeLessThan(20);
      }

      await playButton(page).click();
      // No time passes on the line chart: Play is heard, then the end.
      await expect(status(page)).toHaveText("Through matchweek 38");
      await page.clock.runFor(FRAME);
      for (const chart of ["#gaps", "#d3-gaps"] as const) {
        const drawn = await drawnGaps(page, chart);
        expect(drawn.goals, chart).toHaveLength(1);
        expect(drawn.xg, chart).toHaveLength(2);
        expect(redInGaps(drawn), chart).toEqual([]);
        expect(drawn.ball, chart).toBeGreaterThan(drawn.goals[0]![1]);
      }
    });
  }
});
