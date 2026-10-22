// Screenshots of demo/line.html on a stopped clock: the theme at rest, both charts mid-play at week 20,
// the crosshair with its tooltip, keyboard focus, and the D3 line hovered. Beside them, DOM checks:
// how long Play takes in each mode, reduced motion, the scrubber, and the names, legend and table.
// Names start with "line-", since screenshot names are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { FRAME, iconTransforms, openDemo, pickMode, REST, tabInto, type Demo } from "./demo";

/** The library's line chart, the D3 line that expressive() drives, and the scrubber with both charts. */
const line = (page: Page): Locator => page.locator("#line");
const d3Line = (page: Page): Locator => page.locator("#d3-line");
const d3Box = (page: Page): Locator => page.locator(".d3-box");
const season = (page: Page): Locator => page.locator("#season");

const playButton = (page: Page): Locator => page.locator("#play button");
const slider = (page: Page): Locator => page.getByRole("slider", { name: "Matchweek" });
const status = (page: Page): Locator => page.locator("#week-status");

/** A matchweek's focus stop on the line chart, which holds its hit column. */
const week = (page: Page, n: number): Locator => line(page).locator(`.ec-column[data-key="${n}"]`);
/** A series' path on the D3 line, by the class the page's D3 code gives it. */
const d3Path = (page: Page, series: "goals" | "xg"): Locator => d3Line(page).locator(`path.line-${series}`);

/** The red runs threshold draws on each chart's goals line (the ball's own paths are inside its icon). */
async function redRuns(chart: Locator): Promise<number> {
  return chart.locator('.ec-overlay .ec-run[data-key="goals"] path').evaluateAll((paths) => paths.filter((path) => !path.closest(".ec-icon")).length);
}

const lineDemo: Demo = {
  path: "/line.html",
  async ready(page) {
    await expect(line(page).locator(".ec-line")).toHaveCount(2);
    await expect(line(page).locator(".ec-column")).toHaveCount(38);
    // expressive() has named the D3 line's paths, so it's attached.
    await expect(d3Line(page).locator('path.line[role="img"]')).toHaveCount(2);
  }
};

/** Opens the page and lets the decoration's first trip, the ball rolling the whole season, finish. */
async function openAtRest(page: Page): Promise<void> {
  await openDemo(page, lineDemo);
  await page.clock.runFor(REST);
}

/** Moves the pointer onto the D3 goals line, `share` of the way along it: hover() would aim at its box's middle, off the stroke. */
async function hoverD3Goals(page: Page, share = 0.3): Promise<void> {
  const point = await d3Path(page, "goals").evaluate((element, along) => {
    const path = element as SVGPathElement;
    const at = path.getPointAtLength(path.getTotalLength() * along);
    const screen = new DOMPoint(at.x, at.y).matrixTransform(path.getScreenCTM() ?? undefined);
    return { x: screen.x, y: screen.y };
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
    await expect(season(page)).toHaveScreenshot("line-play-week-20.png");

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
  });
});
