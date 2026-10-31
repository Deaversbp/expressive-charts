// Screenshots of demo/stress.html on a stopped clock: the page at its smallest sizes in light and dark,
// and the date line at rest, part way through its play, and with its tooltip. Beside them, DOM checks:
// nothing plays by itself; each start button runs its case and its readout reports the run; with
// reduced motion, or Off picked, every case jumps to its end; the date line's names, arrow keys and
// table, which listening script G hears; and Page Up and Page Down on the date line and the bars, with
// the bars' names thinned, which script I hears. The readouts are masked in pictures, since they measure the
// machine. Names start with "stress-", since screenshot names are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { FRAME, iconTransforms, modeButton, openDemo, pickMode, REST, stressDemo, tabInto } from "./demo";

// The page draws six charts and about 22,500 elements, and WebKit plays its frames slowly in Docker.
test.describe.configure({ timeout: 90_000 });

type Case = "update" | "hover" | "line" | "host" | "switch" | "draw";
const CASES: readonly Case[] = ["update", "hover", "line", "host", "switch", "draw"];

const card = (page: Page, name: Case): Locator => page.locator(`#${name}-case`);
const readout = (page: Page, name: Case): Locator => card(page, name).locator("[data-readout]");
/** A case's start button; the date line's is playButton()'s. */
const start = (page: Page, name: Case): Locator => (name === "line" ? playButton(page) : card(page, name).locator("[data-start]"));
const readouts = (page: Page): Locator => page.locator("[data-readout]");

const lineChart = (page: Page): Locator => page.locator("#line-chart");
const playButton = (page: Page): Locator => page.locator("#line-play button");
const lineStatus = (page: Page): Locator => page.locator("#line-status");
/** A day's focus stop on the date line, which holds its hit column: "2025-06-16". */
const day = (page: Page, date: string): Locator => lineChart(page).locator(`.ec-column[data-key="${date}T00:00:00.000Z"]`);

/** A play's base duration on the page. */
const PLAY = 8000;

/**
 * How long a case's readout is waited for. The date line's play is the slowest: in WebKit in Docker, under 4
 * workers, its readout once took more than 30 s. So it's waited for up to 60 s, and a test that plays it has 30 s
 * more than the others ({@link LINE_TEST}), as have the tests that run every case with reduced motion and Off.
 */
const wait = (name: Case): number => (name === "line" ? 60_000 : 30_000);
const LINE_TEST = 120_000;

/** Runs the clock a little at a time until the case's readout reports its next run. */
async function reported(page: Page, name: Case, runs = 1): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.clock.runFor(250);
        return readout(page, name).getAttribute("data-run");
      },
      { timeout: wait(name), intervals: [0] }
    )
    .toBe(String(runs));
}

/** The red runs threshold draws on the visits line (the arrow's own paths are inside its icon). */
async function redRuns(chart: Locator): Promise<number> {
  return chart.locator('.ec-overlay .ec-run[data-key="visits"] path').evaluateAll((paths) => paths.filter((path) => !path.closest(".ec-icon")).length);
}

/** Everything the cases draw, as markup, but the readouts. */
const drawn = (page: Page): Promise<string> =>
  page.locator(".cases").evaluate((cases) => {
    const copy = cases.cloneNode(true) as Element;
    for (const element of Array.from(copy.querySelectorAll("[data-readout]"))) element.remove();
    return copy.innerHTML;
  });

test.describe("theme", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the page at its smallest sizes, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openDemo(page, stressDemo);
      await page.clock.runFor(REST);
      await expect(page).toHaveScreenshot(`stress-page-${colorScheme}.png`, { fullPage: true, mask: [readouts(page)] });
    });
  }
});

test("nothing plays by itself", async ({ page }) => {
  await openDemo(page, stressDemo);
  await page.clock.runFor(FRAME);
  const before = await drawn(page);
  await page.clock.runFor(REST);
  expect(await drawn(page)).toBe(before);
  await expect(playButton(page)).toHaveText("Play");
  await expect(lineStatus(page)).toHaveText("Through Dec 31, 2025");
  for (const name of CASES.filter((name) => name !== "line")) await expect(readout(page, name)).toHaveText("Not run yet.");
  // The date line's readout says how long it took to draw, and counts its runs.
  await expect(readout(page, "line")).toHaveText(/^Drawn in [\d.]+ ms: 1 year of days, 2 series\. Runs: 732 started, 366 of them on visits, 1 drawn\./);
});

test.describe("each start button runs its case, and the readout reports it", () => {
  for (const name of CASES) {
    test(name, async ({ page }) => {
      if (name === "line") test.setTimeout(LINE_TEST);
      await openDemo(page, stressDemo);
      await start(page, name).click();
      // The date line plays for 8 s; the other cases end within 3.
      if (name === "line") await page.clock.runFor(PLAY);
      await reported(page, name);
      await expect(readout(page, name)).toHaveText(/^(Smooth|Not smooth)\. .* in Presentation: [\d,]+ frames, 95th percentile [\d.]+ ms, longest [\d.]+ ms, /);
      await expect(readout(page, name)).toHaveAttribute("data-mode", "presentation");
    });
  }
});

test.describe("the date line", () => {
  test("at rest", async ({ page }) => {
    await openDemo(page, stressDemo);
    expect(await redRuns(lineChart(page))).toBeGreaterThan(0);
    // The arrow rides the tip from the start: no trip along the year.
    expect(await iconTransforms(lineChart(page))).toHaveLength(1);
    await expect(lineChart(page)).toHaveScreenshot("stress-line-rest.png");
  });

  test("part way through its play: the red so far, and the arrow at the tip", async ({ page }) => {
    test.setTimeout(LINE_TEST);
    await openDemo(page, stressDemo);
    const atRest = await iconTransforms(lineChart(page));
    await playButton(page).click();
    await expect(playButton(page)).toHaveText("Pause");
    await page.clock.runFor(PLAY * 0.45);
    await expect(lineStatus(page)).toHaveText("Through Jun 13, 2025");
    await expect(day(page, "2025-06-13")).not.toHaveAttribute("visibility", "hidden");
    await expect(day(page, "2025-06-14")).toHaveAttribute("visibility", "hidden");
    expect(await redRuns(lineChart(page))).toBeGreaterThan(0);
    const midway = await iconTransforms(lineChart(page));
    expect(midway).toHaveLength(1);
    expect(midway).not.toEqual(atRest);
    await expect(lineChart(page)).toHaveScreenshot("stress-line-play.png");

    // It plays on to the end, where the arrow is back where it rested, and the readout reports the play.
    await reported(page, "line");
    await expect(playButton(page)).toHaveText("Play");
    await expect(lineStatus(page)).toHaveText("Through Dec 31, 2025");
    expect(await iconTransforms(lineChart(page))).toEqual(atRest);
    await expect(readout(page, "line")).toHaveText(/^Smooth\. Played 1 year of days, 2 series in Presentation: .* Runs: 732 started, 366 of them on visits, 1 drawn\.$/);
  });

  test("its tooltip", async ({ page }) => {
    await openDemo(page, stressDemo);
    await day(page, "2025-06-16").locator(".ec-hit").hover();
    await page.clock.runFor(REST);
    const tooltip = lineChart(page).locator(".ec-tooltip");
    await expect(tooltip).toHaveClass(/ec-tooltip-shown/);
    await expect(tooltip).toHaveText(/^Jun 16, 2025/);
    await expect(lineChart(page)).toHaveScreenshot("stress-line-tooltip.png");
  });

  test("a name per day, the arrow keys a day at a time, and the table's rows by date", async ({ page }) => {
    await openDemo(page, stressDemo);
    await expect(day(page, "2025-01-01")).toHaveAttribute("aria-label", "Jan 1, 2025: 959 Visits, 936 28-day average");
    // From Play, the control before it: the cards above have many tab stops of their own.
    await playButton(page).focus();
    await tabInto(page, lineChart(page));
    await expect(day(page, "2025-01-01")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(day(page, "2025-01-02")).toBeFocused();
    await expect(day(page, "2025-01-02")).toHaveAttribute("aria-label", "Jan 2, 2025: 1,164 Visits, 941 28-day average");
    await page.keyboard.press("End");
    await expect(day(page, "2025-12-31")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(day(page, "2025-12-30")).toBeFocused();
    await expect(day(page, "2025-12-30")).toHaveAttribute("aria-label", "Dec 30, 2025: 1,117 Visits, 842 28-day average");

    await expect(lineChart(page).locator(".ec-legend-item")).toHaveText(["Visits", "28-day average", "Below the 28-day average"]);
    const table = lineChart(page).locator("table");
    await expect(table.locator("thead th")).toHaveText(["Date", "Visits", "28-day average"]);
    await expect(table.locator("tbody tr")).toHaveCount(365);
    await expect(table.locator("tbody tr").first().locator("th")).toHaveText("Jan 1, 2025");
    await expect(table.locator("tbody tr").last().locator("th")).toHaveText("Dec 31, 2025");
  });

  test("Page Up and Page Down go a month at a time, and stop at the ends", async ({ page }) => {
    await openDemo(page, stressDemo);
    await playButton(page).focus();
    await tabInto(page, lineChart(page));
    await expect(day(page, "2025-01-01")).toBeFocused();
    await page.keyboard.press("PageDown");
    await expect(day(page, "2025-02-01")).toBeFocused();
    await page.keyboard.press("PageDown");
    await expect(day(page, "2025-03-01")).toBeFocused();
    await page.keyboard.press("PageUp");
    await expect(day(page, "2025-02-01")).toBeFocused();
    await page.keyboard.press("PageUp");
    await page.keyboard.press("PageUp");
    await expect(day(page, "2025-01-01")).toBeFocused();
    // From the last day, a month back is the last day of November, and Page Down stays.
    await page.keyboard.press("End");
    await page.keyboard.press("PageDown");
    await expect(day(page, "2025-12-31")).toBeFocused();
    await page.keyboard.press("PageUp");
    await expect(day(page, "2025-11-30")).toBeFocused();
  });
});

test("on the bars, Page Up and Page Down go a tenth of the bars at a time, and every name and value stays in the names", async ({ page }) => {
  await openDemo(page, stressDemo);
  const hoverChart = page.locator("#hover-chart");
  const barMark = (n: number): Locator => hoverChart.locator(`.ec-mark[data-key="Bar ${n}"]`);
  // Every nth name is drawn under the 100 bars, from the first (n depends on the fonts: 20 in Docker),
  // and no values; each bar's name has both.
  const drawn = await hoverChart.locator(".ec-label").evaluateAll((labels) => labels.flatMap((label, i) => (/\S/.test(label.textContent ?? "") ? [i] : [])));
  const every = drawn[1]! - drawn[0]!;
  expect(every).toBeGreaterThan(1);
  expect(drawn).toEqual(drawn.map((_, k) => k * every));
  await expect(hoverChart.locator(".ec-value").filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(barMark(37)).toHaveAttribute("aria-label", /^Bar 37: \d+ points$/);

  await card(page, "hover").locator("[data-start]").focus();
  await tabInto(page, hoverChart);
  await expect(barMark(1)).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect(barMark(11)).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect(barMark(21)).toBeFocused();
  await page.keyboard.press("PageUp");
  await expect(barMark(11)).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("PageDown");
  await expect(barMark(100)).toBeFocused();
  await page.keyboard.press("PageUp");
  await expect(barMark(90)).toBeFocused();
});

/** Attributes that say where every mark of a case is drawn, to compare a case's state at two times. */
const where = (page: Page, name: Case): Promise<string[]> =>
  card(page, name)
    .locator(".ec-segment, .ec-stroke, rect.host-column, .ec-switch-view")
    .evaluateAll((elements) => elements.map((element) => [element.getAttribute("d"), element.getAttribute("y"), element.getAttribute("height"), element.getAttribute("class")].join(" ")));

for (const how of ["reduced motion", "Off"] as const) {
  test(`with ${how}, every case jumps to its end`, async ({ page }) => {
    // Four cases one after another: in WebKit in Docker, under 4 workers, they once took 56 s of 90.
    test.setTimeout(LINE_TEST);
    if (how === "reduced motion") await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, stressDemo);
    if (how === "Off") await pickMode(page, "Off");
    await expect(modeButton(page, "Off")).toHaveAttribute("aria-pressed", "true");

    for (const name of ["update", "host", "switch"] as const) {
      const before = await where(page, name);
      await start(page, name).click();
      // No time passes: the case is already where it ends.
      const jumped = await where(page, name);
      expect(jumped).not.toEqual(before);
      await reported(page, name);
      expect(await where(page, name)).toEqual(jumped);
      await expect(readout(page, name)).toHaveAttribute("data-mode", "off");
    }
    await expect(card(page, "switch").locator("[data-start]")).toHaveText("Show as bars");

    // Play jumps to the end at once: it's heard, then the end.
    await playButton(page).click();
    await expect(playButton(page)).toHaveText("Play");
    await expect(lineStatus(page)).toHaveText("Through Dec 31, 2025");
    await reported(page, "line");
    await expect(readout(page, "line")).toHaveText(/ in Off: /);
  });
}
