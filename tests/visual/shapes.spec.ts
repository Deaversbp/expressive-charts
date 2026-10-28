// Screenshots of demo/shapes.html on a stopped clock: the page in light and dark, each chart with a
// mark hovered half-way through its pulse, and each with keyboard focus. Beside them, DOM checks: the
// circles and paths read by tag and named, the arrow keys in document order, the curve's red and its
// riding ball, the hover effect picker swapping every chart's effect in place with focus and the tab
// stops kept, and reduced motion and Off. Names start with "shapes-", since screenshot names are
// shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { FRAME, hoverShape, iconTransforms, openDemo, pickMode, pointerAway, REST, shapesDemo, tabInto } from "./demo";

type HoverEffect = "Pulse" | "Flash" | "Wiggle";

/**
 * The four charts: where each is, a mark to hover, and its marks' names in document order, which is
 * the arrow keys' order.
 */
const charts = [
  {
    name: "scatter",
    selector: "#d3-scatter",
    group: "Goals and shots by player on a D3 scatter",
    // Moreau's dot.
    mark: (page: Page) => page.locator("#d3-scatter circle").nth(2),
    names: [
      "Okafor: 16 goals from 64 shots",
      "Lindqvist: 10 goals from 41 shots",
      "Moreau: 8 goals from 46 shots",
      "Tanaka: 6 goals from 35 shots",
      "Reyes: 5 goals from 20 shots",
      "Adeyemi: 4 goals from 30 shots",
      "Novak: 3 goals from 12 shots",
      "Castillo: 1 goal from 18 shots"
    ]
  },
  {
    name: "plot",
    selector: "#plot-dots",
    group: "Goals and assists by player on an Observable Plot dot chart",
    mark: (page: Page) => page.locator("#plot-dots circle").nth(2),
    names: [
      "Okafor: 16 goals, 4 assists",
      "Lindqvist: 10 goals, 7 assists",
      "Moreau: 8 goals, 3 assists",
      "Tanaka: 6 goals, 10 assists",
      "Reyes: 5 goals, 4 assists",
      "Adeyemi: 4 goals, 6 assists",
      "Novak: 3 goals, 1 assist",
      "Castillo: 1 goal, 5 assists"
    ]
  },
  {
    name: "curve",
    selector: "#d3-curve",
    group: "Goals and expected goals per match on a D3 curved line",
    mark: (page: Page) => page.locator("#d3-curve path.line-xg"),
    names: ["Goals per match, five-match average: 1.0 at matchweek 38, below xG in matchweeks 1 to 6, 9 to 12, 20 to 23, 31 and 33 to 38", "Expected goals (xG) per match, five-match average: 1.7 at matchweek 38"]
  },
  {
    name: "area",
    selector: "#d3-area",
    group: "Shots on and off target per match on a D3 area",
    mark: (page: Page) => page.locator("#d3-area path.area-offTarget"),
    names: ["Shots on target: 177 in 38 matches", "Shots off target: 333 in 38 matches"]
  }
] as const;

type Chart = (typeof charts)[number];

const svgOf = (page: Page, chart: Chart): Locator => page.locator(chart.selector === "#plot-dots" ? "#plot-dots svg" : chart.selector);
/** The marks expressive() named, in document order. */
const marks = (page: Page, chart: Chart): Locator => svgOf(page, chart).locator('[role="img"]');
const curve = (page: Page): Locator => page.locator("#d3-curve");
const halos = (page: Page, chart: Chart): Locator => svgOf(page, chart).locator(".ec-overlay .ec-halos .ec-halo");

const effectButton = (page: Page, effect: HoverEffect): Locator =>
  page.getByRole("group", { name: "Hover effect" }).getByRole("button", { name: effect, exact: true });

/** The goals curve's red runs, drawn by threshold in the overlay. */
async function redRuns(page: Page): Promise<number> {
  return curve(page).locator('.ec-overlay .ec-run[data-key="goals"] path').evaluateAll((paths) => paths.filter((path) => !path.closest(".ec-icon")).length);
}

/** Opens the page and lets the curve's decoration, the ball's first trip, finish. */
async function openAtRest(page: Page): Promise<void> {
  await openDemo(page, shapesDemo);
  await page.clock.runFor(REST);
}

/**
 * Moves the pointer onto a mark: into a dot or an area well inside it, or onto a curve's stroke about
 * a third of the way along, at the first whole pixel there that's on it, since Firefox's pointer lands
 * on whole pixels. hover() would aim at a curve's box's middle, off the stroke.
 */
async function hoverMark(page: Page, chart: Chart): Promise<void> {
  const mark = chart.mark(page);
  if (chart.name !== "curve") {
    await hoverShape(page, mark);
    return;
  }
  const point = await mark.evaluate((element) => {
    const path = element as SVGPathElement;
    const length = path.getTotalLength();
    for (let step = 0; step < 200; step++) {
      const at = path.getPointAtLength(Math.min(length, length * 0.3 + step * 0.5));
      const screen = new DOMPoint(at.x, at.y).matrixTransform(path.getScreenCTM() ?? undefined);
      const x = Math.round(screen.x);
      const y = Math.round(screen.y);
      if (document.elementFromPoint(x, y) === path) return { x, y };
    }
    throw new Error("No whole pixel on the curve's stroke.");
  });
  await page.mouse.move(point.x, point.y);
}

/** Picks the hover effect for all four charts, from the keyboard, and checks focus stays on the picker. */
async function pickEffect(page: Page, effect: HoverEffect): Promise<void> {
  await effectButton(page, effect).focus();
  await page.keyboard.press("Space");
  await expect(effectButton(page, effect)).toHaveAttribute("aria-pressed", "true");
  await expect(effectButton(page, effect)).toBeFocused();
}

test.describe("theme", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the page at rest, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);
      await expect(page).toHaveScreenshot(`shapes-page-${colorScheme}.png`, { fullPage: true });
    });
  }
});

test.describe("read by tag", () => {
  test("each chart is a named group of named dots, curves or areas, in the order they were drawn", async ({ page }) => {
    await openAtRest(page);
    for (const chart of charts) {
      await expect(svgOf(page, chart)).toHaveAttribute("role", "group");
      await expect(svgOf(page, chart)).toHaveAttribute("aria-label", chart.group);
      expect(await marks(page, chart).evaluateAll((found) => found.map((mark) => mark.getAttribute("aria-label"))), chart.name).toEqual(chart.names);
      // One tab stop a chart: its first mark.
      expect(await marks(page, chart).evaluateAll((found) => found.map((mark) => mark.getAttribute("tabindex"))), chart.name).toEqual(chart.names.map((_, i) => (i === 0 ? "0" : "-1")));
    }
    // Circles on the dot charts, paths on the others: no geometry was given.
    await expect(page.locator('#d3-scatter circle[role="img"], #plot-dots circle[role="img"]')).toHaveCount(16);
    await expect(page.locator('#d3-curve path[role="img"], #d3-area path[role="img"]')).toHaveCount(4);
    // Plot's own name for its dots' group is gone, and its axes and names are hidden.
    await expect(page.locator('#plot-dots svg > g[aria-label="dot"]')).toHaveCount(0);
    await expect(page.locator("#plot-dots svg > g:not(.plot-dots):not([aria-hidden])")).toHaveCount(0);
  });

  test("the curve: the goals line red below xG, and the ball resting at its tip", async ({ page }) => {
    await openAtRest(page);
    expect(await redRuns(page)).toBeGreaterThan(0);
    const icons = curve(page).locator(".ec-overlay .ec-icon");
    await expect(icons).toHaveCount(1);
    // The ball's place, in the overlay's units, which are the curves' own, against the goals curve's end.
    const { ball, end } = await page.evaluate(() => {
      const icon = document.querySelector<SVGGElement>("#d3-curve .ec-overlay .ec-icon")!;
      const matrix = icon.transform.baseVal.consolidate()!.matrix;
      const path = document.querySelector<SVGPathElement>("#d3-curve path.line-goals")!;
      const tip = path.getPointAtLength(path.getTotalLength());
      return { ball: { x: matrix.e, y: matrix.f }, end: { x: tip.x, y: tip.y } };
    });
    expect(Math.hypot(ball.x - end.x, ball.y - end.y)).toBeLessThan(12);
  });
});

test.describe("hovered", () => {
  for (const chart of charts) {
    test(`a pulse half-way round a mark of the ${chart.name}, the others dimmed`, async ({ page }) => {
      await openAtRest(page);
      await hoverMark(page, chart);
      // 300 ms into the first of two 600 ms pulses: the halo is most of its width out, half faded.
      await page.clock.runFor(300);
      await expect(halos(page, chart)).toHaveCount(1);
      const dimmed = await marks(page, chart).evaluateAll((found) => found.map((mark) => mark.classList.contains("ec-dimmed")));
      expect(dimmed.filter(Boolean)).toHaveLength(chart.names.length - 1);
      // Only the marks dim: every text in the chart, the names beside the dots among them, keeps its
      // full strength, so it keeps its contrast.
      const faded = await svgOf(page, chart)
        .locator("text")
        .evaluateAll((texts) =>
          texts
            .filter((text) => !text.closest(".ec-icon"))
            .filter((text) => {
              let opacity = 1;
              for (let at: Element | null = text; at; at = at.parentElement) opacity *= Number(getComputedStyle(at).opacity);
              return opacity < 1;
            })
            .map((text) => text.textContent)
        );
      expect(faded).toEqual([]);
      await expect(page.locator(chart.selector)).toHaveScreenshot(`shapes-hover-${chart.name}.png`);
      // Its end state is nothing, and the hover holds.
      await page.clock.runFor(REST);
      await expect(halos(page, chart)).toHaveCount(0);
      expect(await marks(page, chart).evaluateAll((found) => found.filter((mark) => mark.classList.contains("ec-dimmed")).length)).toBe(chart.names.length - 1);
    });
  }
});

test.describe("keyboard focus", () => {
  for (const chart of charts) {
    test(`the ${chart.name}: Tab reaches its first mark, the arrows go in document order, and the ring shows`, async ({ page }) => {
      await openAtRest(page);
      await tabInto(page, page.locator(chart.selector));
      await expect(marks(page, chart).first()).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(marks(page, chart).nth(1)).toBeFocused();
      await expect(marks(page, chart).nth(1)).toHaveAttribute("aria-label", chart.names[1]);
      await page.clock.runFor(REST);
      await expect(svgOf(page, chart).locator(".ec-focus-ring")).not.toHaveAttribute("visibility", "hidden");
      await expect(page.locator(chart.selector)).toHaveScreenshot(`shapes-focus-${chart.name}.png`);
      // End and Home go to the last and the first, with no wrap-around.
      await page.keyboard.press("End");
      await expect(marks(page, chart).last()).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(marks(page, chart).last()).toBeFocused();
      await page.keyboard.press("Home");
      await expect(marks(page, chart).first()).toBeFocused();
    });
  }
});

test.describe("the effect picker", () => {
  test("swaps every chart's hover effect in place: the same charts, each tab stop where it was, focus on the picker", async ({ page }) => {
    await openAtRest(page);
    // Marks each chart's overlay, to tell whether it's the same one after the pick: attaching again
    // would make a new one.
    await page.locator(".ec-overlay").evaluateAll((overlays) => overlays.forEach((overlay) => overlay.setAttribute("data-probe", "")));
    // Each chart's tab stop moves to its second mark.
    for (const chart of charts) {
      await tabInto(page, page.locator(chart.selector));
      await page.keyboard.press("ArrowRight");
      await expect(marks(page, chart).nth(1)).toBeFocused();
    }
    await page.keyboard.press("Escape");
    await page.clock.runFor(REST);
    const ball = await iconTransforms(curve(page));
    const reds = await redRuns(page);

    await pickEffect(page, "Flash");
    await expect(page.locator(".ec-overlay[data-probe]")).toHaveCount(4);
    for (const chart of charts) {
      expect(await marks(page, chart).evaluateAll((found) => found.map((mark) => mark.getAttribute("tabindex"))), chart.name).toEqual(chart.names.map((_, i) => (i === 1 ? "0" : "-1")));
    }
    // The curve's story is the same effect, so it kept running: the ball at the tip, the red as it was.
    expect(await iconTransforms(curve(page))).toEqual(ball);
    expect(await redRuns(page)).toBe(reds);

    // The new effect plays on all four: one 900 ms flash, over before a pulse's second ring would be.
    for (const chart of charts) {
      await hoverMark(page, chart);
      await page.clock.runFor(200);
      await expect(halos(page, chart), chart.name).toHaveCount(1);
      await page.clock.runFor(800);
      await expect(halos(page, chart), chart.name).toHaveCount(0);
      await pointerAway(page);
      await page.clock.runFor(REST);
    }
  });

  test("a hover held by the pointer replays with each new effect", async ({ page }) => {
    await openAtRest(page);
    // The pointer rests on the area that's off target, while the picker is used from the keyboard.
    const area = charts[3];
    await hoverMark(page, area);
    await page.clock.runFor(REST);
    await expect(halos(page, area)).toHaveCount(0);

    await pickEffect(page, "Wiggle");
    // The area rocks about its middle: a wiggle's first half-swing peaks a sixth of the way through 450 ms.
    await page.clock.runFor(75);
    await expect(area.mark(page)).toHaveCSS("transform", /^matrix\(/);
    await page.clock.runFor(REST);
    await expect(area.mark(page)).toHaveCSS("transform", "none");

    await pickEffect(page, "Pulse");
    await page.clock.runFor(300);
    await expect(halos(page, area)).toHaveCount(1);
    await expect(area.mark(page)).toHaveCSS("transform", "none");
    // Still hovered: the other area stays dimmed.
    await expect(page.locator("#d3-area path.area-onTarget")).toHaveClass(/ec-dimmed/);
  });
});

test.describe("reduced motion and Off", () => {
  test("with reduced motion, the ball is at the tip at load, the red is drawn, and a hover shows its end at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, shapesDemo);
    // No time passes: the decoration is at its end state.
    const atLoad = await iconTransforms(curve(page));
    expect(atLoad).toHaveLength(1);
    const reds = await redRuns(page);
    expect(reds).toBeGreaterThan(0);
    await page.clock.runFor(REST);
    expect(await iconTransforms(curve(page))).toEqual(atLoad);
    expect(await redRuns(page)).toBe(reds);

    // A pulse's end state is nothing: the hover shows only the emphasis and the dimming, at once.
    for (const chart of charts) {
      await hoverMark(page, chart);
      await expect(halos(page, chart), chart.name).toHaveCount(0);
      expect(await marks(page, chart).evaluateAll((found) => found.filter((mark) => mark.classList.contains("ec-dimmed")).length), chart.name).toBe(chart.names.length - 1);
      await pointerAway(page);
    }

    // The viewer's own pick overrides the device's setting.
    await pickMode(page, "Presentation");
    await hoverMark(page, charts[0]);
    await page.clock.runFor(300);
    await expect(halos(page, charts[0])).toHaveCount(1);
  });

  test("in Off, the ball is where it rests, and a wiggle and a pulse show nothing", async ({ page }) => {
    await openAtRest(page);
    const rested = await iconTransforms(curve(page));
    await pickMode(page, "Off");
    expect(await iconTransforms(curve(page))).toEqual(rested);
    expect(await redRuns(page)).toBeGreaterThan(0);

    await pickEffect(page, "Wiggle");
    await hoverMark(page, charts[3]);
    await page.clock.runFor(FRAME);
    await expect(charts[3].mark(page)).toHaveCSS("transform", "none");
    await pointerAway(page);

    await pickEffect(page, "Pulse");
    await hoverMark(page, charts[1]);
    await expect(halos(page, charts[1])).toHaveCount(0);
    await page.clock.runFor(REST);
    await expect(halos(page, charts[1])).toHaveCount(0);
  });
});
