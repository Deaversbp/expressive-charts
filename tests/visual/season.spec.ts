// Screenshots of demo/season.html on a stopped clock: the page at rest in light and dark, a linked
// hover, the players' bars after a matchweek, and the slope chart mid-trace. Beside them, DOM checks:
// what a linked chart shows and doesn't (no tooltip, crosshair, focus or announcement), Emphasis only,
// the keyboard, each matchweek's changes in the overlay, the table and the announcement, reduced motion
// and Off, and the room for the changes at 320 px. Names start with "season-", since screenshot names
// are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { FRAME, hoverShape, iconTransforms, openDemo, pickMode, REST, seasonDemo, tabInto } from "./demo";

const goals = (page: Page): Locator => page.locator("#goals");
const line = (page: Page): Locator => page.locator("#line");
const shots = (page: Page): Locator => page.locator("#shots");
const players = (page: Page): Locator => page.locator("#players");
const slope = (page: Page): Locator => page.locator("#slope");
/** The cards: the linked charts, the players' bars and the slope chart. */
const linkedCard = (page: Page): Locator => page.locator('section[aria-labelledby="linked-title"]');
const playersCard = (page: Page): Locator => page.locator('section[aria-labelledby="players-title"]');
const slopeCard = (page: Page): Locator => page.locator('section[aria-labelledby="slope-title"]');

const nextButton = (page: Page): Locator => page.getByRole("button", { name: "Play next matchweek" });
const status = (page: Page): Locator => page.locator("#matchweek-status");
const announcement = (page: Page): Locator => players(page).locator('[role="status"]');

/** A week's column on the goals chart, its focus stop on the line, and its D3 column (rows are in week order). */
const goalsWeek = (page: Page, week: number): Locator => goals(page).locator(`.ec-mark[data-key="${week}"]`);
const lineWeek = (page: Page, week: number): Locator => line(page).locator(`.ec-column[data-key="${week}"]`);
const shotsWeek = (page: Page, week: number): Locator => shots(page).locator("rect.column").nth(week - 1);
/** A player's line on the slope chart, by name. */
const slopeLine = (page: Page, name: string): Locator => slope(page).locator(`path.slope[aria-label^="${name}:"]`);

/** Opens the page and lets anything that plays at load (the slope chart's labels rising) finish. */
async function openAtRest(page: Page): Promise<void> {
  await openDemo(page, seasonDemo);
  await page.clock.runFor(REST);
}

/** The text each chart's overlay draws, with the key of the mark it's on: "Okafor +1". */
async function captions(chart: Locator): Promise<string[]> {
  return chart.locator(".ec-overlay text").evaluateAll((texts) =>
    texts.map((text) => `${text.closest("[data-key]")?.getAttribute("data-key") ?? ""} ${text.textContent ?? ""}`.trim())
  );
}

/** Each text in the chart's overlay with the opacity it's drawn at, its own and its ancestors'. */
async function captionOpacities(chart: Locator): Promise<number[]> {
  return chart.locator(".ec-overlay text").evaluateAll((texts) =>
    texts.map((text) => {
      let product = 1;
      for (let at: Element | null = text; at; at = at.parentElement) product *= Number(getComputedStyle(at).opacity);
      return Math.round(product * 100) / 100;
    })
  );
}

/** The keys of the line chart's points emphasised now. */
async function hotPoints(page: Page): Promise<(string | null)[]> {
  return line(page).locator(".ec-point.ec-hot").evaluateAll((points) => points.map((point) => point.getAttribute("data-key")));
}

/** The weeks of the D3 columns that aren't dimmed (all of them when nothing is hovered). */
async function brightShots(page: Page): Promise<number[]> {
  return shots(page)
    .locator("rect.column")
    .evaluateAll((rects) => rects.flatMap((rect, i) => (rect.classList.contains("ec-dimmed") ? [] : [i + 1])));
}

/**
 * Moves the pointer onto a line's stroke, `share` of the way along it, at a whole pixel on it: hover()
 * would aim at its box's middle, off the stroke, and Firefox's pointer lands on whole pixels.
 */
async function hoverStroke(page: Page, path: Locator, share = 0.5): Promise<void> {
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

/** The trace's stroke on the slope chart, and how much of its line it covers (1 for all of it). */
async function traced(page: Page, name: string): Promise<number | undefined> {
  return slope(page).evaluate((svg, name) => {
    const line = svg.querySelector<SVGPathElement>(`path.slope[aria-label^="${name}:"]`)!;
    const stroke = [...svg.querySelectorAll<SVGPathElement>(".ec-overlay path")].find((path) => path.closest(".ec-run, [data-key]") && !path.closest(".ec-halos") && !path.closest("mask"));
    return stroke ? Math.round((stroke.getTotalLength() / line.getTotalLength()) * 100) / 100 : undefined;
  }, name);
}

test.describe("theme", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the page at rest, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);
      await expect(status(page)).toHaveText("After matchweek 24");
      // label() has written each player's change since matchweek 1 past their name, Castillo's none.
      expect(await captions(slope(page))).toHaveLength(7);
      await expect(page).toHaveScreenshot(`season-page-${colorScheme}.png`, { fullPage: true });
    });
  }
});

test.describe("linked by matchweek", () => {
  test("hovering a week on the line lights it up on both column charts, with their hover effects and no tooltip", async ({ page }) => {
    await openAtRest(page);
    await hoverShape(page, lineWeek(page, 13).locator(".ec-hit"));
    await page.clock.runFor(REST);
    // The line's own hover: its points, crosshair and tooltip.
    expect(await hotPoints(page)).toEqual(["totalGoals@13", "totalXg@13"]);
    await expect(line(page).locator(".ec-tooltip")).toHaveClass(/ec-tooltip-shown/);
    await expect(line(page).locator(".ec-crosshair")).not.toHaveAttribute("visibility", "hidden");
    // The goals chart: week 13 emphasised, the others' bodies dimmed, and the ball at the top of its column.
    await expect(goals(page).locator(".ec-mark.ec-hot")).toHaveAttribute("data-key", "13");
    expect(await iconTransforms(goals(page))).toHaveLength(1);
    // The D3 columns: week 13 bright and in its strong colour, the others dimmed.
    expect(await brightShots(page)).toEqual([13]);
    await expect(shotsWeek(page, 13)).toHaveAttribute("style", /fill: color-mix/);
    // Neither linked chart shows a tooltip or a focus ring, and focus hasn't moved.
    await expect(goals(page).locator(".ec-tooltip-shown")).toHaveCount(0);
    await expect(goals(page).locator(".ec-focus")).toHaveAttribute("visibility", "hidden");
    await expect(shots(page).locator(".ec-focus-ring")).not.toHaveAttribute("visibility", "visible");
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await expect(linkedCard(page)).toHaveScreenshot("season-linked-hover.png");

    // The linked chart's labels keep their strength: only the columns' bodies dim.
    const dimmed = await goals(page).evaluate((root) => {
      const opacity = (element: Element): number => {
        let product = 1;
        for (let at: Element | null = element; at; at = at.parentElement) product *= Number(getComputedStyle(at).opacity);
        return product;
      };
      for (const animation of document.getAnimations()) animation.finish();
      const others = [...root.querySelectorAll(".ec-mark:not(.ec-hot)")];
      return {
        bodies: others.flatMap((mark) => [...mark.querySelectorAll(".ec-body > *")]).every((part) => opacity(part) < 0.5),
        labels: others.flatMap((mark) => [...mark.querySelectorAll(".ec-label, .ec-value")]).every((text) => opacity(text) === 1)
      };
    });
    expect(dimmed).toEqual({ bodies: true, labels: true });

    // Moving off ends all three.
    await page.mouse.move(2, 2);
    await page.clock.runFor(REST);
    expect(await hotPoints(page)).toEqual([]);
    await expect(goals(page).locator(".ec-mark.ec-hot")).toHaveCount(0);
    expect(await iconTransforms(goals(page))).toEqual([]);
    expect(await brightShots(page)).toHaveLength(24);
  });

  test("hovering a D3 column lights up its week on the goals chart and the line", async ({ page }) => {
    await openAtRest(page);
    await hoverShape(page, shotsWeek(page, 7));
    await page.clock.runFor(REST);
    expect(await brightShots(page)).toEqual([7]);
    await expect(goals(page).locator(".ec-mark.ec-hot")).toHaveAttribute("data-key", "7");
    expect(await hotPoints(page)).toEqual(["totalGoals@7", "totalXg@7"]);
    // A linked line chart draws no crosshair and no tooltip.
    await expect(line(page).locator(".ec-crosshair")).toHaveAttribute("visibility", "hidden");
    await expect(line(page).locator(".ec-tooltip-shown")).toHaveCount(0);
  });

  test("Emphasis only keeps the linked weeks to their emphasis and dimming", async ({ page }) => {
    await openAtRest(page);
    const full = page.getByRole("button", { name: "Full hover" });
    const emphasis = page.getByRole("button", { name: "Emphasis only" });
    await expect(full).toHaveAttribute("aria-pressed", "true");
    await emphasis.click();
    await expect(emphasis).toHaveAttribute("aria-pressed", "true");
    await expect(full).toHaveAttribute("aria-pressed", "false");

    await hoverShape(page, lineWeek(page, 13).locator(".ec-hit"));
    // A pulse is still ringing at 300 ms, and the ball still rolling, when they play.
    await page.clock.runFor(300);
    await expect(goals(page).locator(".ec-mark.ec-hot")).toHaveAttribute("data-key", "13");
    expect(await brightShots(page)).toEqual([13]);
    expect(await iconTransforms(goals(page))).toEqual([]);
    await expect(shots(page).locator(".ec-halos path")).toHaveCount(0);
    // The line's own hover still plays its pulse.
    expect(await hotPoints(page)).toEqual(["totalGoals@13", "totalXg@13"]);

    // Back to Full hover: the linked weeks play their effects again.
    await page.mouse.move(2, 2);
    await page.clock.runFor(REST);
    await full.click();
    await hoverShape(page, lineWeek(page, 13).locator(".ec-hit"));
    await page.clock.runFor(300);
    expect(await iconTransforms(goals(page))).toHaveLength(1);
    await expect(shots(page).locator(".ec-halos path").first()).toBeAttached();
  });

  test("the keyboard: focus stays on the chart it's in, the others follow the week, and Escape ends all three", async ({ page }) => {
    await openAtRest(page);
    await tabInto(page, goals(page));
    await expect(goalsWeek(page, 1)).toBeFocused();
    for (let i = 1; i < 13; i++) await page.keyboard.press("ArrowRight");
    await expect(goalsWeek(page, 13)).toBeFocused();
    await page.clock.runFor(REST);
    expect(await hotPoints(page)).toEqual(["totalGoals@13", "totalXg@13"]);
    expect(await brightShots(page)).toEqual([13]);
    // Only the goals chart shows its ring and tooltip; nothing is announced.
    await expect(goals(page).locator(".ec-tooltip")).toHaveClass(/ec-tooltip-shown/);
    await expect(line(page).locator(".ec-focus")).toHaveAttribute("visibility", "hidden");
    await expect(line(page).locator(".ec-tooltip-shown")).toHaveCount(0);
    await expect(announcement(page)).toHaveText("");

    await page.keyboard.press("Escape");
    await page.clock.runFor(REST);
    await expect(goalsWeek(page, 13)).toBeFocused();
    expect(await hotPoints(page)).toEqual([]);
    expect(await brightShots(page)).toHaveLength(24);
  });
});

test.describe("Play next matchweek", () => {
  test("adds a week to every chart, and says each change past the bar, in the table and in the announcement", async ({ page }) => {
    await openAtRest(page);
    await nextButton(page).click();
    await expect(status(page)).toHaveText("After matchweek 25");
    await expect(announcement(page)).toHaveText("Matchweek 25: Okafor +1, 15 goals; Lindqvist +1, 7 goals.");
    await page.clock.runFor(REST);
    await expect(goals(page).locator(".ec-mark")).toHaveCount(25);
    await expect(line(page).locator(".ec-column")).toHaveCount(25);
    await expect(shots(page).locator('rect.column[role="img"]')).toHaveCount(25);
    expect(await captions(players(page))).toEqual(["Okafor +1", "Lindqvist +1"]);
    expect(await captionOpacities(players(page))).toEqual([1, 1]);
    // The slope chart's labels follow: Okafor's since matchweek 1 is now 14, and its axis says matchweek 25.
    expect(await captions(slope(page))).toContain("Okafor +14");
    await expect(slopeLine(page, "Okafor")).toHaveAttribute("aria-label", "Okafor: 1 goal at matchweek 1, 15 goals after matchweek 25, +14");
    // The table says the same as the overlay.
    const table = players(page).locator("table");
    await expect(table.locator("thead th")).toHaveText(["Player", "Position", "Goals", "Change", "Since matchweek 1"]);
    await expect(table.locator("tbody tr").first().locator("th, td")).toHaveText(["Okafor", "Forward", "15", "+1", "+14"]);
    await expect(table.locator("tbody tr").nth(1).locator("th, td")).toHaveText(["Moreau", "Winger", "8", "0", "+7"]);
    // The changes keep clear of every other text in the chart.
    const overlaps = await players(page).evaluate((root) => {
      const boxes = [...root.querySelectorAll("svg text")]
        .filter((text) => text.textContent?.trim() && getComputedStyle(text).visibility === "visible")
        .map((text) => ({ text: text.textContent!.trim(), box: text.getBoundingClientRect(), caption: text.closest(".ec-overlay") !== null }));
      return boxes.flatMap((a) =>
        a.caption
          ? boxes.filter((b) => b !== a && Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 1 && Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 1).map((b) => `"${a.text}" on "${b.text}"`)
          : []
      );
    });
    expect(overlaps).toEqual([]);
    await expect(playersCard(page)).toHaveScreenshot("season-bars-matchweek.png");

    // The next matchweek shows only its own changes: Okafor didn't score, so his +1 goes.
    await nextButton(page).click();
    await expect(announcement(page)).toHaveText(/^Matchweek 26: Lindqvist \+1, 8 goals\.\s*$/);
    await page.clock.runFor(REST);
    expect(await captions(players(page))).toEqual(["Lindqvist +1"]);
    await expect(players(page).locator("table tbody tr").first().locator("td").nth(2)).toHaveText("0");

    // And a matchweek with no goals shows none.
    await nextButton(page).click();
    await expect(announcement(page)).toHaveText("Matchweek 27: no goals.");
    await page.clock.runFor(REST);
    expect(await captions(players(page))).toEqual([]);
  });

  test("a matchweek played while the last is still moving says the change in whole goals", async ({ page }) => {
    await openAtRest(page);
    await nextButton(page).click();
    await page.clock.runFor(100);
    await nextButton(page).click();
    await page.clock.runFor(REST);
    expect(await captions(players(page))).toEqual(["Lindqvist +1"]);
  });

  test("stops at matchweek 38", async ({ page }) => {
    await openAtRest(page);
    await pickMode(page, "Off");
    for (let week = 25; week <= 38; week++) await nextButton(page).click();
    await expect(status(page)).toHaveText("After matchweek 38");
    await expect(nextButton(page)).toBeDisabled();
    await expect(goals(page).locator(".ec-mark")).toHaveCount(38);
  });
});

test("the slope chart mid-trace, with the other lines dimmed", async ({ page }) => {
  await openAtRest(page);
  await hoverStroke(page, slopeLine(page, "Okafor"), 0.3);
  // The trace takes 500 ms in Presentation.
  await page.clock.runFor(250);
  const part = await traced(page, "Okafor");
  expect(part).toBeGreaterThan(0.2);
  expect(part).toBeLessThan(0.8);
  await expect(slope(page).locator("path.slope.ec-dimmed")).toHaveCount(7);
  await expect(slopeCard(page)).toHaveScreenshot("season-slope-trace.png");
  await page.clock.runFor(REST);
  expect(await traced(page, "Okafor")).toBe(1);
});

test.describe("without motion", () => {
  for (const how of ["reduced motion", "Off"] as const) {
    test(`${how}: the changes and labels show at once, and a trace is whole`, async ({ page }) => {
      if (how === "reduced motion") await page.emulateMedia({ reducedMotion: "reduce" });
      await openDemo(page, seasonDemo);
      if (how === "Off") {
        await pickMode(page, "Off");
        // The labels drawn at load rose in Presentation: picking Off draws them where they end.
      }
      // One frame, for the page's first redraw.
      await page.clock.runFor(FRAME);
      expect(await captions(slope(page))).toHaveLength(7);
      expect(new Set(await captionOpacities(slope(page)))).toEqual(new Set([1]));

      await nextButton(page).click();
      // No time passes: the changes are already in place.
      expect(await captions(players(page))).toEqual(["Okafor +1", "Lindqvist +1"]);
      expect(await captionOpacities(players(page))).toEqual([1, 1]);

      await hoverStroke(page, slopeLine(page, "Okafor"), 0.3);
      expect(await traced(page, "Okafor")).toBe(1);
    });
  }
});

test("at 320 px, the changes fit beside their bars, with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 6000 });
  await openAtRest(page);
  // Okafor scores: his bar is at the end of its scale, so his change is past the chart's edge.
  await nextButton(page).click();
  await page.clock.runFor(REST);
  expect(await captions(players(page))).toEqual(["Okafor +1", "Lindqvist +1"]);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  // Every change and label stays inside its card's padding, clear of its border.
  const outside = await page.evaluate(() =>
    [...document.querySelectorAll(".ec-overlay text")].flatMap((text) => {
      const card = text.closest(".card")!;
      const box = text.getBoundingClientRect();
      const inner = card.getBoundingClientRect();
      const padding = parseFloat(getComputedStyle(card).paddingRight);
      return box.left < inner.left + padding || box.right > inner.right - padding ? [`"${text.textContent}" at ${box.left}–${box.right}`] : [];
    })
  );
  expect(outside).toEqual([]);
});
