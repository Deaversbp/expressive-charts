// Screenshots of demo/bars.html on a stopped clock: the theme, the ball-and-cleat story mid-travel and
// at rest, each motion mode, keyboard focus, the tooltip and legend, and a staged metric switch.
// Baselines are Linux-only (CONTRIBUTING.md says how to update them).

import { expect, test, type Page } from "@playwright/test";
import {
  bar,
  chart,
  FRAME,
  hostBar,
  hostChart,
  iconTransforms,
  modeButton,
  motionSwitch,
  openDemo,
  pickMetric,
  pickMode,
  pointerAway,
  REST,
  tabInto,
  type Mode
} from "./demo";

test.describe("theme", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the page at rest, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openDemo(page);
      await expect(page).toHaveScreenshot(`page-${colorScheme}.png`, { fullPage: true });
    });
  }
});

test.describe("ball and cleat", () => {
  // Tanaka (6 goals, 10 assists) in Goals + assists: the ball rolls along the goals for about 450 ms,
  // then the boot walks the assists until about 1.4 s.
  const charts = [
    { name: "chart", container: chart, target: (page: Page) => bar(page, "Tanaka") },
    { name: "host", container: hostChart, target: (page: Page) => hostBar(page, 2) }
  ];

  for (const { name, container, target } of charts) {
    test(`rolling, walking and at rest on the ${name === "chart" ? "library's chart" : "hand-written chart"}`, async ({ page }) => {
      await openDemo(page);
      await pickMetric(page, "Goals + assists");
      await target(page).hover();

      await page.clock.runFor(150);
      await expect(container(page)).toHaveScreenshot(`story-${name}-rolling.png`);
      await page.clock.runFor(700);
      await expect(container(page)).toHaveScreenshot(`story-${name}-walking.png`);
      await page.clock.runFor(REST);
      await expect(container(page)).toHaveScreenshot(`story-${name}-rest.png`);
    });
  }
});

test.describe("motion modes", () => {
  // 150 ms into a hover on Okafor's goals: early in Presentation, further in Analysis (effects
  // ×0.35, 140–300 ms), and already at the end in Off.
  const modes: { mode: Mode; doneBy: number }[] = [
    { mode: "Presentation", doneBy: 2000 },
    { mode: "Analysis", doneBy: 300 },
    { mode: "Off", doneBy: 0 }
  ];

  for (const { mode, doneBy } of modes) {
    test(`${mode}: the switch, and 150 ms into a hover`, async ({ page }) => {
      await openDemo(page);
      await pickMode(page, mode);
      for (const other of modes.filter((m) => m.mode !== mode)) {
        await expect(modeButton(page, other.mode)).toHaveAttribute("aria-pressed", "false");
      }
      await bar(page, "Okafor").hover();

      await page.clock.runFor(150);
      await expect(motionSwitch(page)).toHaveScreenshot(`mode-${mode.toLowerCase()}-switch.png`);
      await expect(chart(page)).toHaveScreenshot(`mode-${mode.toLowerCase()}-chart.png`);

      // The ball reaches the end within this mode's travel time, and not before.
      const at150 = await iconTransforms(chart(page));
      await page.clock.runFor(Math.max(0, doneBy - 150 + FRAME));
      const atDone = await iconTransforms(chart(page));
      await page.clock.runFor(REST);
      const atRest = await iconTransforms(chart(page));
      expect(atDone).toEqual(atRest);
      if (doneBy > 150) expect(at150).not.toEqual(atRest);
      else expect(at150).toEqual(atRest);
    });
  }
});

test.describe("keyboard focus", () => {
  // Lindqvist's goals bar is in --ec-series-1, the same blue as --ec-focus: the ring must still show.
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the focus ring on both charts, from Tab and the arrow keys, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openDemo(page);

      await tabInto(page, chart(page));
      await expect(bar(page, "Okafor")).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(bar(page, "Lindqvist")).toBeFocused();
      await page.clock.runFor(REST);
      await expect(chart(page).locator(".ec-focus")).not.toHaveAttribute("visibility", "hidden");
      await expect(chart(page)).toHaveScreenshot(`focus-chart-${colorScheme}.png`);

      await tabInto(page, hostChart(page));
      await page.keyboard.press("ArrowDown");
      await expect(hostBar(page, 1)).toBeFocused();
      await page.clock.runFor(REST);
      await expect(hostChart(page).locator(".ec-focus-ring")).not.toHaveAttribute("visibility", "hidden");
      await expect(hostChart(page)).toHaveScreenshot(`focus-host-${colorScheme}.png`);
    });
  }
});

test.describe("tooltip and legend", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the tooltip on the top bar and the legend for a stack, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openDemo(page);
      await pickMetric(page, "Goals + assists");
      await expect(chart(page).locator(".ec-legend-item")).toHaveText(["goals", "assists"]);

      await bar(page, "Okafor").hover();
      await page.clock.runFor(REST);
      const tooltip = chart(page).locator(".ec-tooltip");
      await expect(tooltip).toHaveClass(/ec-tooltip-shown/);
      await expect(tooltip).toContainText("Okafor");
      await expect(chart(page)).toHaveScreenshot(`tooltip-legend-${colorScheme}.png`);
    });
  }
});

test.describe("staged metric switch", () => {
  test("values change first, then the rows move", async ({ page }) => {
    await openDemo(page);
    const tanaka = bar(page, "Tanaka");
    const top = async (): Promise<number> => (await tanaka.boundingBox())?.y ?? NaN;
    // The bar's length: its segments (goals shrinking out, assists growing in), not the whole body,
    // where the flash draws its halo.
    const width = (): Promise<number> =>
      tanaka.locator(".ec-segment").evaluateAll((segments) => {
        const boxes = segments.map((segment) => segment.getBoundingClientRect());
        return Math.max(...boxes.map((box) => box.right)) - Math.min(...boxes.map((box) => box.left));
      });
    const before = { top: await top(), width: await width() };

    // Goals → Assists: Tanaka goes from 6 to 10 and from fourth to first.
    await pickMetric(page, "Assists", { settle: false });
    await pointerAway(page);

    await page.clock.runFor(250);
    await expect(chart(page)).toHaveScreenshot("switch-values.png");
    const stage1 = { top: await top(), width: await width() };

    await page.clock.runFor(500);
    await expect(chart(page)).toHaveScreenshot("switch-positions.png");
    const stage2 = { top: await top(), width: await width() };

    await page.clock.runFor(REST);
    await expect(chart(page)).toHaveScreenshot("switch-rest.png");
    const after = { top: await top(), width: await width() };

    // Stage 1 grows the bar where it is; stage 2 moves it with its new value.
    expect(stage1.top).toBe(before.top);
    expect(stage1.width).toBeGreaterThan(before.width);
    expect(stage1.width).toBeLessThan(after.width);
    expect(stage2.width).toBe(after.width);
    expect(stage2.top).toBeLessThan(before.top);
    expect(stage2.top).toBeGreaterThan(after.top);
  });
});
