// Reduced motion in a real browser, which M1 could only check through Off: the device setting turns
// motion off until the viewer picks a mode on the page, and every animation shows its end state.
//
// Where icons end up is compared in the DOM against the same story animated. Pictures are compared
// only where the page above the chart is the same: the reduced-motion note is a line longer than
// the others, which moves the charts by half a pixel and changes every anti-aliased edge.

import { expect, test, type Page } from "@playwright/test";
import {
  bar,
  chart,
  hostBar,
  hostChart,
  iconTransforms,
  modeButton,
  motionHint,
  motionSwitch,
  openDemo,
  pickMetric,
  pickMode,
  pointerAway,
  REST
} from "./demo";

const REDUCED_HINT = "Your device asks for reduced motion, so motion is off. Picking a mode here overrides it.";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDemo(page);
});

test("the motion switch shows Off and says why", async ({ page }) => {
  await expect(modeButton(page, "Off")).toHaveAttribute("aria-pressed", "true");
  await expect(modeButton(page, "Presentation")).toHaveAttribute("aria-pressed", "false");
  await expect(modeButton(page, "Analysis")).toHaveAttribute("aria-pressed", "false");
  await expect(motionHint(page)).toHaveText(REDUCED_HINT);
  await expect(motionSwitch(page)).toHaveScreenshot("reduced-switch.png");
});

test("the switch follows the device setting live", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(modeButton(page, "Presentation")).toHaveAttribute("aria-pressed", "true");
  await expect(motionHint(page)).toHaveText(/^Staged, unhurried motion/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(modeButton(page, "Off")).toHaveAttribute("aria-pressed", "true");
  await expect(motionHint(page)).toHaveText(REDUCED_HINT);
});

for (const { name, container, target } of [
  { name: "chart", container: chart, target: (page: Page) => bar(page, "Tanaka") },
  { name: "host", container: hostChart, target: (page: Page) => hostBar(page, 2) }
]) {
  const where = name === "chart" ? "the library's chart" : "the hand-written chart";

  test(`hovering ${where} shows the icons at their end positions at once`, async ({ page }) => {
    await pickMetric(page, "Goals + assists");
    await target(page).hover();
    // No time passes: the ball and the boot are already where the story ends.
    const jumped = await iconTransforms(container(page));
    expect(jumped).toHaveLength(2);
    await expect(container(page)).toHaveScreenshot(`reduced-story-${name}.png`);
    // Nothing is left running.
    await page.clock.runFor(REST);
    expect(await iconTransforms(container(page))).toEqual(jumped);

    // The same story, animated after the viewer picks Presentation, ends in the same place.
    await pointerAway(page);
    await pickMode(page, "Presentation");
    await target(page).hover();
    expect(await iconTransforms(container(page))).not.toEqual(jumped);
    await page.clock.runFor(REST);
    expect(await iconTransforms(container(page))).toEqual(jumped);
  });
}

test("picking a mode on the page overrides the device setting", async ({ page }) => {
  await pickMode(page, "Presentation");
  await expect(modeButton(page, "Off")).toHaveAttribute("aria-pressed", "false");
  await expect(motionHint(page)).toHaveText(/^Staged, unhurried motion/);
  await bar(page, "Okafor").hover();
  // The same pictures as the motion-mode suite's Presentation run, where the device asks for nothing.
  await page.clock.runFor(150);
  await expect(motionSwitch(page)).toHaveScreenshot("mode-presentation-switch.png");
  await expect(chart(page)).toHaveScreenshot("mode-presentation-chart.png");

  // Picking Off is a choice too: it stays Off, with the Off note, not the device's.
  await pickMode(page, "Off");
  await expect(motionHint(page)).toHaveText(/^No motion/);
});

test("a metric switch jumps straight to the new order", async ({ page }) => {
  await pickMetric(page, "Assists", { settle: false });
  await pointerAway(page);
  const order = await chart(page).locator(".ec-mark").evaluateAll((marks) => marks.map((mark) => mark.getAttribute("data-key")));
  expect(order.slice(0, 2)).toEqual(["Tanaka", "Lindqvist"]);
  const tanaka = await bar(page, "Tanaka").boundingBox();
  await page.clock.runFor(REST);
  expect(await bar(page, "Tanaka").boundingBox()).toEqual(tanaka);
  await expect(chart(page)).toHaveScreenshot("reduced-metric-switch.png");
});
