// Screenshots of demo/donut.html on a stopped clock: the theme, the ball rolling round a slice on the
// library's donut and on the D3 pie, a wiggle at its peak and a pulse half-way, keyboard focus and the
// tooltip. Beside them, DOM checks: reduced motion, the effect picker and "Next match".
// Names start with "donut-", since screenshot names are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { iconTransforms, openDemo, pickMode, pointerAway, REST, tabInto, type Demo } from "./demo";

type Outcome = "Goal" | "Saved" | "Off target" | "Blocked";
type HoverEffect = "Ball" | "Wiggle" | "Pulse";

/** The library's donut and columns, and the D3 pie that expressive() drives. */
const donut = (page: Page): Locator => page.locator("#donut");
const columns = (page: Page): Locator => page.locator("#columns");
const pie = (page: Page): Locator => page.locator("#d3-pie");

/** An outcome's slice on the library's donut: the focusable mark. */
const slice = (page: Page, outcome: Outcome): Locator => donut(page).locator(`.ec-mark[data-key="${outcome}"]`);
/** An outcome's slice on the D3 pie, by the class the page's D3 code gives it. */
const pieSlice = (page: Page, outcome: Outcome): Locator => pie(page).locator(`path.slice-${outcome.toLowerCase().replace(" ", "-")}`);

/**
 * Moves the pointer into a slice's path, at the point inside it farthest from its edge. hover() aims
 * at the middle of the bounding box, which for a large slice is in the hole.
 */
async function hoverPath(page: Page, path: Locator): Promise<void> {
  const point = await path.evaluate((element) => {
    const shape = element as SVGPathElement;
    const box = shape.getBBox();
    const length = shape.getTotalLength();
    const edge = Array.from({ length: 128 }, (_, i) => shape.getPointAtLength((i / 128) * length));
    let best = { x: box.x + box.width / 2, y: box.y + box.height / 2, room: -1 };
    for (let i = 1; i < 32; i++) {
      for (let j = 1; j < 32; j++) {
        const x = box.x + (box.width * i) / 32;
        const y = box.y + (box.height * j) / 32;
        if (!shape.isPointInFill(new DOMPoint(x, y))) continue;
        const room = Math.min(...edge.map((p) => Math.hypot(p.x - x, p.y - y)));
        if (room > best.room) best = { x, y, room };
      }
    }
    const screen = new DOMPoint(best.x, best.y).matrixTransform(shape.getScreenCTM() ?? undefined);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.move(point.x, point.y);
}

const hoverSlice = (page: Page, outcome: Outcome): Promise<void> => hoverPath(page, slice(page, outcome).locator(".ec-slice"));
const hoverPieSlice = (page: Page, outcome: Outcome): Promise<void> => hoverPath(page, pieSlice(page, outcome));

const donutDemo: Demo = {
  path: "/donut.html",
  async ready(page) {
    await expect(donut(page).locator(".ec-mark")).toHaveCount(4);
    await expect(columns(page).locator(".ec-mark")).toHaveCount(4);
    // expressive() has named the pie's slices, so it's attached.
    await expect(pie(page).locator('path.slice[role="img"]')).toHaveCount(4);
  }
};

const effectButton = (page: Page, effect: HoverEffect): Locator =>
  page.getByRole("group", { name: "Hover effect" }).getByRole("button", { name: effect, exact: true });

/** Picks the hover effect for all three charts; the page builds them again. */
async function pickEffect(page: Page, effect: HoverEffect): Promise<void> {
  await effectButton(page, effect).click();
  await expect(effectButton(page, effect)).toHaveAttribute("aria-pressed", "true");
  await donutDemo.ready(page);
}

test.describe("theme", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the page at rest, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openDemo(page, donutDemo);
      await expect(page).toHaveScreenshot(`donut-page-${colorScheme}.png`, { fullPage: true });
    });
  }
});

test.describe("the ball", () => {
  // Saved, about 28% of the ring: the ball rolls round its middle for about 400 ms, easing out, so
  // 80 ms in it's about half-way.
  const charts = [
    { name: "donut", container: donut, hover: (page: Page) => hoverSlice(page, "Saved") },
    { name: "pie", container: pie, hover: (page: Page) => hoverPieSlice(page, "Saved") }
  ];

  for (const { name, container, hover } of charts) {
    test(`rolling round a slice and at rest on the ${name === "donut" ? "library's donut" : "D3 pie"}`, async ({ page }) => {
      await openDemo(page, donutDemo);
      await hover(page);

      await page.clock.runFor(80);
      await expect(container(page)).toHaveScreenshot(`donut-ball-${name}-rolling.png`);
      const rolling = await iconTransforms(container(page));
      await page.clock.runFor(REST);
      await expect(container(page)).toHaveScreenshot(`donut-ball-${name}-rest.png`);
      const rest = await iconTransforms(container(page));
      expect(rest).toHaveLength(1);
      expect(rolling).not.toEqual(rest);
    });
  }
});

test.describe("wiggle and pulse", () => {
  test("a wiggle at its peak, and back where it started", async ({ page }) => {
    await openDemo(page, donutDemo);
    await pickEffect(page, "Wiggle");
    const body = slice(page, "Off target").locator(".ec-body");
    await hoverSlice(page, "Off target");

    // The first half-swing peaks a sixth of the way through 450 ms.
    await page.clock.runFor(75);
    await expect(body).toHaveAttribute("transform", /^matrix\(/);
    await expect(donut(page)).toHaveScreenshot("donut-wiggle-peak.png");
    await page.clock.runFor(REST);
    await expect(body).not.toHaveAttribute("transform");
  });

  test("a pulse half-way through its first ring", async ({ page }) => {
    await openDemo(page, donutDemo);
    await pickEffect(page, "Pulse");
    await hoverSlice(page, "Saved");

    // 300 ms into the first of two 600 ms pulses: the halo is most of its width out, half faded.
    await page.clock.runFor(300);
    const halo = donut(page).locator(".ec-halos .ec-halo > path");
    await expect(halo).toHaveCount(1);
    await expect(donut(page)).toHaveScreenshot("donut-pulse-half.png");
    // Its end state is nothing.
    await page.clock.runFor(REST);
    await expect(halo).toHaveCount(0);
  });
});

test.describe("keyboard focus", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the focus ring on a slice of both donuts, from Tab and the arrow keys, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openDemo(page, donutDemo);

      // Clockwise from 12 o'clock, in data order: Goal, then Saved.
      await tabInto(page, donut(page));
      await expect(slice(page, "Goal")).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(slice(page, "Saved")).toBeFocused();
      await page.clock.runFor(REST);
      await expect(donut(page).locator(".ec-focus-ring")).not.toHaveAttribute("visibility", "hidden");
      await expect(donut(page)).toHaveScreenshot(`donut-focus-donut-${colorScheme}.png`);

      await tabInto(page, pie(page));
      await expect(pieSlice(page, "Goal")).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(pieSlice(page, "Saved")).toBeFocused();
      await page.clock.runFor(REST);
      await expect(pie(page).locator(".ec-focus-ring")).not.toHaveAttribute("visibility", "hidden");
      await expect(pie(page)).toHaveScreenshot(`donut-focus-pie-${colorScheme}.png`);
    });
  }
});

test("the tooltip on a slice", async ({ page }) => {
  // With a pulse, whose end state is nothing, the slice rests with only the tooltip and the dimming.
  await openDemo(page, donutDemo);
  await pickEffect(page, "Pulse");
  await hoverSlice(page, "Off target");
  await page.clock.runFor(REST);
  const tooltip = donut(page).locator(".ec-tooltip");
  await expect(tooltip).toHaveClass(/ec-tooltip-shown/);
  await expect(tooltip).toHaveText(/^Off target\s*149 shots · 37%$/);
  await expect(donut(page)).toHaveScreenshot("donut-tooltip.png");
});

test.describe("the effect picker", () => {
  test("builds the charts again with the new effect, keeping focus, the data and the colours", async ({ page }) => {
    await openDemo(page, donutDemo);
    const colours = (): Promise<string[]> =>
      donut(page).locator(".ec-slice").evaluateAll((slices) => slices.map((path) => getComputedStyle(path).fill));
    const before = await colours();
    await page.getByRole("button", { name: "Next match" }).click();
    await page.clock.runFor(REST);

    await effectButton(page, "Wiggle").focus();
    await page.keyboard.press("Space");
    await expect(effectButton(page, "Wiggle")).toHaveAttribute("aria-pressed", "true");
    await expect(effectButton(page, "Wiggle")).toBeFocused();
    await donutDemo.ready(page);
    expect(await colours()).toEqual(before);
    // The rebuilt charts show the match that was added, not the data they started with.
    await expect(slice(page, "Saved")).toHaveAttribute("aria-label", "Saved: 115 shots, 28%");
    await expect(columns(page).locator('.ec-mark[data-key="Saved"]')).toHaveAttribute("aria-label", "Saved: 115 shots");
    await expect(pieSlice(page, "Saved")).toHaveAttribute("aria-label", "Saved: 115 shots, 28%");

    // The new effect plays, on all three: a wiggle, and no ball.
    const column = columns(page).locator('.ec-mark[data-key="Saved"]');
    for (const { chart, body, hover } of [
      { chart: donut, body: slice(page, "Saved").locator(".ec-body"), hover: () => hoverSlice(page, "Saved") },
      { chart: columns, body: column.locator(".ec-body"), hover: () => column.hover() }
    ]) {
      await hover();
      await page.clock.runFor(75);
      await expect(body).toHaveAttribute("transform", /^matrix\(/);
      expect(await iconTransforms(chart(page))).toEqual([]);
      await pointerAway(page);
      await page.clock.runFor(REST);
    }
    await hoverPieSlice(page, "Saved");
    await page.clock.runFor(75);
    await expect(pieSlice(page, "Saved")).toHaveCSS("transform", /^matrix\(/);
    expect(await iconTransforms(pie(page))).toEqual([]);
  });
});

test.describe("next match", () => {
  test("announces each match, updates all three charts, and stops after ten", async ({ page }) => {
    await openDemo(page, donutDemo);
    const next = page.getByRole("button", { name: "Next match" });
    const announcer = donut(page).getByRole("status");

    await next.click();
    // The seeded first match adds 3 saved and 3 off target.
    // The announcer adds a no-break space every other time, so the same text twice is still a change.
    await expect(announcer).toHaveText(/^Match 1: Saved and Off target changed\s?$/);
    await expect(page.locator("#match-status")).toHaveText("After match 1 of 10");
    await page.clock.runFor(REST);
    await expect(slice(page, "Off target")).toHaveAttribute("aria-label", "Off target: 152 shots, 37%");
    await expect(pieSlice(page, "Off target")).toHaveAttribute("aria-label", "Off target: 152 shots, 37%");
    await expect(columns(page).locator('.ec-mark[data-key="Off target"]')).toHaveAttribute("aria-label", "Off target: 152 shots");

    await next.click();
    await expect(announcer).toHaveText(/^Match 2: 4 of 4 changed\s?$/);
    for (let match = 3; match <= 10; match++) {
      await next.click();
      await page.clock.runFor(REST);
    }
    await expect(next).toBeDisabled();
    await expect(page.locator("#match-status")).toHaveText("After match 10 of 10");
    await expect(donut(page).locator(".ec-center-value")).toHaveText("505");
  });
});

test.describe("reduced motion", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, donutDemo);
  });

  for (const { name, container, hover } of [
    { name: "donut", container: donut, hover: (page: Page) => hoverSlice(page, "Saved") },
    { name: "pie", container: pie, hover: (page: Page) => hoverPieSlice(page, "Saved") }
  ]) {
    const where = name === "donut" ? "the library's donut" : "the D3 pie";

    test(`hovering ${where} shows the ball at its end at once`, async ({ page }) => {
      await hover(page);
      // No time passes: the ball is already where the story ends.
      const jumped = await iconTransforms(container(page));
      expect(jumped).toHaveLength(1);
      // Nothing is left running.
      await page.clock.runFor(REST);
      expect(await iconTransforms(container(page))).toEqual(jumped);

      // The same story, animated after the viewer picks Presentation, ends in the same place.
      await pointerAway(page);
      await pickMode(page, "Presentation");
      await hover(page);
      expect(await iconTransforms(container(page))).not.toEqual(jumped);
      await page.clock.runFor(REST);
      expect(await iconTransforms(container(page))).toEqual(jumped);
    });
  }

  test("a match and a new order jump straight to the end, with no flash", async ({ page }) => {
    const angles = (): Promise<(string | null)[]> =>
      donut(page).locator(".ec-slice").evaluateAll((slices) => slices.map((path) => path.getAttribute("d")));
    const halos = donut(page).locator(".ec-halos .ec-halo");

    await page.getByRole("button", { name: "Next match" }).click();
    await page.getByRole("group", { name: "Order" }).getByRole("button", { name: "Largest first" }).click();
    const order = await donut(page).locator(".ec-mark").evaluateAll((marks) => marks.map((mark) => mark.getAttribute("data-key")));
    expect(order).toEqual(["Off target", "Saved", "Blocked", "Goal"]);
    const jumped = await angles();
    await expect(halos).toHaveCount(0);
    await page.clock.runFor(REST);
    expect(await angles()).toEqual(jumped);
    await expect(halos).toHaveCount(0);
  });
});
