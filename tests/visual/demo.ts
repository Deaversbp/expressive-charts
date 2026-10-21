// Shared steps for the visual suite: open demo/bars.html with time stopped, and operate its controls.
//
// Time is Playwright's fake clock (page.clock). The library's page-wide clock looks up
// performance.now() and requestAnimationFrame each time it needs a frame, and the fake clock replaces
// both before any page script runs, so the tests drive the real clock with no hook in the library:
// nothing moves until a test calls page.clock.runFor(ms), and frames fall every 16 ms of fake time.

import { expect, type Locator, type Page } from "@playwright/test";

/** The fake clock's reading when a test starts acting. */
const START = 1000;

/** Long enough for any story, staged change or flash to finish. */
export const REST = 5000;

/** The fake clock's frame interval. An animation that ends at t shows its end on the first frame at or after t. */
export const FRAME = 16;

export type Mode = "Presentation" | "Analysis" | "Off";
export type Metric = "Goals" | "Assists" | "Goals + assists";

/** Opens the demo with time stopped at START. */
export async function openDemo(page: Page): Promise<void> {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(START);
  await page.goto("/bars.html");
  await expect(page.locator("#chart .ec-mark")).toHaveCount(8);
  await expect(page.locator("#host-chart .host-goals rect")).toHaveCount(8);
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  if (scrollHeight > (page.viewportSize()?.height ?? 0)) {
    throw new Error(`The page (${scrollHeight} px) is taller than the viewport; raise its height in playwright.config.ts.`);
  }
  // The page's clock starts at the real time that passed between install() and pauseAt(), a few ms
  // that vary with the machine. Moving it to START puts every test's frames at the same times, so a
  // screenshot after runFor(ms) shows the same in-between frame on every run.
  const ticks = await page.evaluate(() => performance.now());
  if (ticks > START) throw new Error(`The fake clock read ${ticks} ms before the test started; raise START.`);
  await page.clock.runFor(START - ticks);
  // The page uses system fonts, but wait anyway, so a late font swap can't change the layout mid-test.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** The library's barChart, and the hand-written chart that expressive() drives. */
export const chart = (page: Page): Locator => page.locator("#chart");
export const hostChart = (page: Page): Locator => page.locator("#host-chart");

/** A player's bar on the library's chart. */
export const bar = (page: Page, player: string): Locator => page.locator(`#chart .ec-mark[data-key="${player}"]`);

/** A player's goals rect on the hand-written chart, by position: rows are drawn top to bottom. */
export const hostBar = (page: Page, row: number): Locator => page.locator("#host-chart .host-goals rect").nth(row);

export const motionSwitch = (page: Page): Locator => page.getByRole("group", { name: "Motion" });
export const modeButton = (page: Page, mode: Mode): Locator => motionSwitch(page).getByRole("button", { name: mode });
export const motionHint = (page: Page): Locator => page.locator("#motion .ec-motion-hint");

/** The viewer picks a motion mode on the page. */
export async function pickMode(page: Page, mode: Mode): Promise<void> {
  await modeButton(page, mode).click();
  await expect(modeButton(page, mode)).toHaveAttribute("aria-pressed", "true");
}

/** Switches both charts' metric and lets the change finish. */
export async function pickMetric(page: Page, metric: Metric, { settle = true } = {}): Promise<void> {
  await page.getByRole("group", { name: "Metric" }).getByRole("button", { name: metric, exact: true }).click();
  if (settle) await page.clock.runFor(REST);
}

/** Moves the pointer off both charts and the controls, so nothing is hovered. */
export async function pointerAway(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
}

/** Presses Tab, as a keyboard user would, until focus is inside `container`. */
export async function tabInto(page: Page, container: Locator): Promise<void> {
  for (let presses = 0; presses < 30; presses++) {
    await page.keyboard.press("Tab");
    if (await container.evaluate((element) => element.contains(document.activeElement))) return;
  }
  throw new Error("Tab never reached the chart.");
}

/** Every icon's transform in `container`, in DOM order: where the effects have put them. */
export async function iconTransforms(container: Locator): Promise<(string | null)[]> {
  return container.locator(".ec-icon").evaluateAll((icons) => icons.map((icon) => icon.getAttribute("transform")));
}
