// Screenshots of demo/charts.html on a stopped clock: the page at rest in light and dark at 1,000 and
// 320 px, the waterfall at load with its ball part way down, each Replay part way through, the
// dumbbell's arrow part way along a line and its toggle part way through each stage, the radar's dot
// part way out a spoke with the league average's lit, the butterfly's linked halves, and the focus ring
// on each chart; and the bullet chart and the funnel, each at rest in light and dark and at 320 px,
// the bullet's bars half filled and its markers mid-flash, the funnel's labels half risen and a stage
// hovered. Beside them, DOM checks: each chart's named marks and tab stops, the waterfall's labels and
// its ball resting on the total, the dumbbell and the radar loading at rest, the toggle's stages in
// each motion mode, threshold's runs, the links, the bullet's markers flashing only once passed and
// its bands never read, the funnel's labels in their gaps, Replay, reduced motion and Off, and the
// keys through each chart. Names start with "charts-", since screenshot names are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { chartsDemo, FRAME, hoverShape, openDemo, pickMode, pointerAway, REST, tabInto } from "./demo";

const card = (page: Page, chart: string): Locator => page.locator(`section[aria-labelledby="${chart}-title"]`);
const svg = (page: Page, chart: string): Locator => page.locator(`#${chart}`);
const named = (page: Page, selector: string): Locator => page.locator(`${selector}[role="img"]`);

/** The waterfall's ball, as the overlay places it: the translation of its transform, in the steps' own units. */
async function ballAt(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const icon = document.querySelector<SVGGElement>('#waterfall .ec-overlay .ec-icon[data-icon="soccer-ball"]')!;
    const { e, f } = icon.transform.baseVal.consolidate()!.matrix;
    return { x: e, y: f };
  });
}

/** The total's top right corner, in the steps' units. */
async function totalCorner(page: Page): Promise<{ x: number; y: number }> {
  return page.locator("#waterfall rect.step-total").evaluate((rect) => ({ x: Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")), y: Number(rect.getAttribute("y")) }));
}

/** A viewport 320 px wide and tall enough for the page in one column, about 6,800 px. */
const NARROW = 7400;

/** The soccer ball is 17 px across, and rides on the staircase's 1 px. */
const BALL = 17;

/** The paths drawIn draws as it plays, in a chart's overlays, not counting the icons' shapes. */
async function drawing(page: Page, chart: string): Promise<number> {
  return page.locator(`#${chart} .ec-overlay .ec-run[data-slot="enter"] path`).evaluateAll((paths) => paths.filter((path) => !path.closest(".ec-icon")).length);
}

/**
 * Moves the pointer onto a <line>, at its middle, or the first whole pixel past it that's on it, since
 * Firefox's pointer lands on whole pixels. hoverShape() looks for a point in the fill, which a line has none of.
 */
async function hoverLine(page: Page, line: Locator): Promise<void> {
  const point = await line.evaluate((element) => {
    const geometry = element as SVGGeometryElement;
    const length = geometry.getTotalLength();
    for (let step = 0; step < 100; step++) {
      const at = geometry.getPointAtLength(Math.min(length, length * 0.5 + step * 0.5));
      const screen = new DOMPoint(at.x, at.y).matrixTransform(geometry.getScreenCTM() ?? undefined);
      const x = Math.round(screen.x);
      const y = Math.round(screen.y);
      if (document.elementFromPoint(x, y) === element) return { x, y };
    }
    throw new Error("No whole pixel on the line.");
  });
  await page.mouse.move(point.x, point.y);
}

/** The dumbbell's rows as drawn: each player's place down and the x of each end of their line. */
async function rows(page: Page): Promise<{ name: string; y: number; first: number; second: number }[]> {
  return page.locator("#dumbbell g.row").evaluateAll((groups) =>
    groups.map((group) => {
      const line = group.querySelector("line")!;
      const y = Number(/translate\(0,([-\d.e]+)\)/.exec(group.getAttribute("transform") ?? "")?.[1]);
      return { name: group.querySelector("text")!.textContent!, y, first: Number(line.getAttribute("x1")), second: Number(line.getAttribute("x2")) };
    })
  );
}

const metric = (page: Page, name: "Goals" | "Assists"): Locator => page.getByRole("group", { name: "Show" }).getByRole("button", { name, exact: true });

/**
 * Opens the page and loads it again once openDemo has stopped the clock, as bars.spec.ts does, so the
 * load effects start at the same time on every run and a picture part way through them is the same frame.
 */
async function openLoading(page: Page): Promise<void> {
  await openDemo(page, chartsDemo);
  await page.reload();
  await chartsDemo.ready(page);
}

/** Part way through the load: the ball about half way down, the connectors and the halves drawing in. */
const LOADING = 400;

/** Each bullet bar's name for goals, top to bottom. */
const BULLET_GOALS = [
  "Okafor: 16 goals, target 12, met",
  "Lindqvist: 10 goals, target 8, met",
  "Moreau: 8 goals, target 10, not met",
  "Tanaka: 6 goals, target 5, met",
  "Reyes: 5 goals, target 6, not met",
  "Adeyemi: 4 goals, target 6, not met",
  "Novak: 3 goals, target 2, met",
  "Castillo: 1 goal, target 3, not met"
];

/** A bar takes 750 ms to fill, and a marker's flash 900 ms after that, widest a quarter of the way through. */
const FILL = 750;
const MID_FLASH = FILL + 225;

const measure = (page: Page, name: "Goals" | "Assists"): Locator => page.getByRole("group", { name: "Measure" }).getByRole("button", { name, exact: true });

/** The players whose markers have a halo now, top to bottom: a halo's path starts where its marker does, 8 px above its row's middle, 32 px a row. */
async function flashing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const names = [...document.querySelectorAll("#bullet g.row text.name")].map((text) => text.textContent ?? "");
    return [...document.querySelectorAll("#bullet .ec-overlay .ec-halo > path")].map((path) => names[Math.round((Number(/^M-?[\d.]+,(-?[\d.]+)/.exec(path.getAttribute("d") ?? "")?.[1]) - 8) / 32)] ?? "?");
  });
}

/** The bullet's bands as drawn: they never change. */
const bandsOf = (page: Page): Promise<string> => page.locator("#bullet g.bands").evaluate((group) => group.outerHTML);

/** The funnel's labels as the overlay draws them: their words, how far they've risen, and each one's box against the stages either side of it, in the chart's px. */
async function drops(page: Page): Promise<{ text: string; opacity: number; top: number; bottom: number; left: number; right: number; above: number; own: number; middle: number }[]> {
  return page.evaluate(() => {
    const stages = [...document.querySelectorAll<SVGPathElement>("#funnel path.stage")].map((path) => path.getBBox());
    return [...document.querySelectorAll<SVGTextElement>("#funnel .ec-overlay .ec-runs text")].map((text, i) => {
      const box = text.getBBox();
      const above = stages[i]!;
      const own = stages[i + 1]!;
      return { text: text.textContent ?? "", opacity: Number(text.getAttribute("opacity")), top: box.y, bottom: box.y + box.height, left: box.x, right: box.x + box.width, above: above.y + above.height, own: own.y, middle: own.x + own.width / 2 };
    });
  });
}

/** Opens the page and lets the waterfall's ball and labels, the butterfly's halves, the bullet's bars and flashes and the funnel's labels finish. */
async function openAtRest(page: Page): Promise<void> {
  await openDemo(page, chartsDemo);
  await page.clock.runFor(REST);
}

test.describe("theme", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the page at rest, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);
      await expect(page).toHaveScreenshot(`charts-page-${colorScheme}.png`, { fullPage: true });
    });

    test(`the page at rest at 320 px, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 320, height: NARROW });
      await openAtRest(page);
      await expect(page).toHaveScreenshot(`charts-page-320-${colorScheme}.png`, { fullPage: true });
    });

    test(`the waterfall at load, its ball part way down the staircase, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openLoading(page);
      await page.clock.runFor(LOADING);
      await expect(card(page, "waterfall")).toHaveScreenshot(`charts-waterfall-load-${colorScheme}.png`);
    });
  }

  for (const chart of ["bullet", "funnel"] as const) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`the ${chart}'s card at rest, ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await openAtRest(page);
        await expect(card(page, chart)).toHaveScreenshot(`charts-${chart}-${colorScheme}.png`);
      });
    }

    test(`the ${chart}'s card at rest at 320 px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: NARROW });
      await openAtRest(page);
      await expect(card(page, chart)).toHaveScreenshot(`charts-${chart}-320.png`);
    });
  }

  test("the waterfall at load at 320 px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: NARROW });
    await openLoading(page);
    await page.clock.runFor(LOADING);
    await expect(card(page, "waterfall")).toHaveScreenshot("charts-waterfall-load-320.png");
  });
});

test.describe("named marks", () => {
  test("each chart is a named group, its marks named, one tab stop for each attachment that takes the keyboard", async ({ page }) => {
    await openAtRest(page);
    const groups = {
      waterfall: "Goal difference by month on a D3 waterfall",
      dumbbell: "Each player's first half against their second on a D3 dumbbell",
      radar: "Okafor against the league average per 90 minutes on a D3 radar",
      butterfly: "Goals conceded and scored by 15-minute band on a D3 butterfly",
      bullet: "Each player's season against their target on a D3 bullet chart",
      funnel: "The season's shots, shots on target and goals on a D3 funnel"
    };
    for (const [chart, name] of Object.entries(groups)) {
      await expect(svg(page, chart)).toHaveAttribute("role", "group");
      await expect(svg(page, chart)).toHaveAttribute("aria-label", name);
    }
    const names = (selector: string): Promise<(string | null)[]> => named(page, selector).evaluateAll((found) => found.map((mark) => mark.getAttribute("aria-label")));
    expect(await names("#waterfall rect.step")).toEqual([
      "August: −1, −1 so far",
      "September: −2, −3 so far",
      "October: +2, −1 so far",
      "November: +3, +2 so far",
      "December: +5, +7 so far",
      "January: +4, +11 so far",
      "February: +3, +14 so far",
      "March: +2, +16 so far",
      "April: −1, +15 so far",
      "May: −3, +12 so far",
      "Season: +12 goal difference"
    ]);
    expect(await names("#dumbbell line.connector")).toEqual([
      "Lindqvist: 3 goals in the first half, 7 in the second, up 4",
      "Reyes: 1 goal in the first half, 4 in the second, up 3",
      "Tanaka: 2 goals in the first half, 4 in the second, up 2",
      "Castillo: 0 goals in the first half, 1 in the second, up 1",
      "Novak: 2 goals in the first half, 1 in the second, down 1",
      "Adeyemi: 3 goals in the first half, 1 in the second, down 2",
      "Moreau: 5 goals in the first half, 3 in the second, down 2",
      "Okafor: 10 goals in the first half, 6 in the second, down 4"
    ]);
    expect(await names("#radar polygon.outline")).toEqual([
      "Okafor: above the league average in goals, shots and dribbles",
      "League average: goals 63rd, assists 58th, shots 57th, key passes 56th, tackles 54th, dribbles 60th percentile"
    ]);
    expect(await names("#radar circle.value-player")).toEqual([
      "Okafor, goals: 0.50 per 90, 96th percentile",
      "Okafor, assists: 0.13 per 90, 52nd percentile",
      "Okafor, shots: 2.00 per 90, 91st percentile",
      "Okafor, key passes: 0.90 per 90, 47th percentile",
      "Okafor, tackles: 0.60 per 90, 18th percentile",
      "Okafor, dribbles: 1.40 per 90, 74th percentile"
    ]);
    expect(await names("#butterfly rect.bar-conceded")).toEqual(["0–15 minutes: 6 conceded", "16–30 minutes: 5 conceded", "31–45+ minutes: 8 conceded", "46–60 minutes: 7 conceded", "61–75 minutes: 9 conceded", "76–90+ minutes: 11 conceded"]);
    expect(await names("#butterfly rect.bar-scored")).toEqual(["0–15 minutes: 7 scored", "16–30 minutes: 8 scored", "31–45+ minutes: 10 scored", "46–60 minutes: 9 scored", "61–75 minutes: 11 scored", "76–90+ minutes: 13 scored"]);
    expect(await names("#bullet rect.value")).toEqual(BULLET_GOALS);
    expect(await names("#funnel path.stage")).toEqual(["Shots: 408", "On target: 163 shots, down 60% from Shots", "Goals: 58, down 64% from On target"]);
    // The steps; the dumbbell's lines; the radar's outlines and each series' values; the butterfly's halves; the bullet's bars; the funnel's stages.
    const stops = await page.locator('svg [tabindex="0"]').evaluateAll((found) => found.map((mark) => mark.closest("svg")!.id));
    expect(stops).toEqual(["waterfall", "dumbbell", "radar", "radar", "radar", "butterfly", "butterfly", "bullet", "funnel"]);
    // The connectors, the staircase, the dumbbell's dots, and the bullet's markers and bands are for the eye: hidden, unnamed and out of reach.
    for (const selector of ["#waterfall line.connector", "#waterfall .staircase path", "#dumbbell circle.dot", "#bullet line.target", "#bullet rect.band"]) {
      const marks = await page.locator(selector).evaluateAll((found) => found.map((mark) => ({ named: mark.hasAttribute("aria-label") || mark.hasAttribute("tabindex"), hidden: mark.closest('[aria-hidden="true"]') !== null })));
      expect(marks.length, selector).toBeGreaterThan(0);
      for (const mark of marks) expect(mark, selector).toEqual({ named: false, hidden: true });
    }
  });
});

test.describe("at load", () => {
  test("the waterfall's ball travels down the staircase and rests on the total, its labels shown, the butterfly grows out, and nothing else moves", async ({ page }) => {
    await openLoading(page);
    const still = {
      dumbbell: await svg(page, "dumbbell").innerHTML(),
      radar: await svg(page, "radar").innerHTML()
    };
    await page.clock.runFor(LOADING);
    const travelling = await ballAt(page);
    // The connectors and both halves part way through drawing in, which takes 750 ms.
    expect(await drawing(page, "waterfall")).toBe(10);
    expect(await drawing(page, "butterfly")).toBe(12);
    await page.clock.runFor(REST);
    expect(await drawing(page, "butterfly")).toBe(0);
    const resting = await ballAt(page);
    const corner = await totalCorner(page);
    expect(Math.hypot(travelling.x - resting.x, travelling.y - resting.y)).toBeGreaterThan(20);
    // On the total's top at its end, as far in as half the ball.
    expect(resting.x).toBeCloseTo(corner.x - BALL / 2, 0);
    expect(resting.y).toBeCloseTo(corner.y - 0.5 - BALL / 2, 0);
    await expect(page.locator("#waterfall .ec-overlay .ec-runs text")).toHaveText(["−1", "−2", "+2", "+3", "+5", "+4", "+3", "+2", "−1", "−3", "+12"]);
    // The dumbbell and the radar loaded at rest.
    expect(await svg(page, "dumbbell").innerHTML()).toBe(still.dumbbell);
    expect(await svg(page, "radar").innerHTML()).toBe(still.radar);
  });
});

test.describe("the dumbbell", () => {
  test("hovering a dot lights its row and runs the line's arrow from the first half to the second", async ({ page }) => {
    await openAtRest(page);
    const okafor = page.locator("#dumbbell line.connector").nth(7);
    const ends = await okafor.evaluate((line) => ({ first: Number(line.getAttribute("x1")), second: Number(line.getAttribute("x2")) }));
    // Okafor's first-half dot, at 10.
    await hoverShape(page, page.locator("#dumbbell circle.dot-first").nth(7));
    await page.clock.runFor(150);
    const arrow = page.locator('#dumbbell .ec-overlay .ec-icon[data-icon="arrow"]');
    await expect(arrow).toHaveCount(1);
    const at = await arrow.evaluate((icon) => (icon as SVGGElement).transform.baseVal.consolidate()!.matrix.e);
    // Part way along, going left: he scored fewer in the second half.
    expect(at).toBeLessThan(ends.first);
    expect(at).toBeGreaterThan(ends.second + 8);
    // His row is lit: both dots and the line; every other row is dimmed.
    expect(await page.locator("#dumbbell circle.dot.ec-dimmed").count()).toBe(14);
    expect(await page.locator("#dumbbell line.connector.ec-dimmed").count()).toBe(7);
    await expect(page.locator(".ec-tooltip")).toHaveCount(0);
    await pointerAway(page);
    await hoverLine(page, okafor);
    await page.clock.runFor(150);
    await expect(card(page, "dumbbell")).toHaveScreenshot("charts-dumbbell-hover.png");
  });

  test("Assists moves the dots to their new values, then re-sorts the rows by the new gap, in Presentation", async ({ page }) => {
    await openAtRest(page);
    const before = await rows(page);
    await metric(page, "Assists").click();
    await expect(metric(page, "Assists")).toHaveAttribute("aria-pressed", "true");
    // Half way through the values: the rows haven't moved.
    await page.clock.runFor(250);
    const values = await rows(page);
    for (const row of values) {
      const was = before.find((r) => r.name === row.name)!;
      expect(row.y, row.name).toBe(was.y);
    }
    expect(values.some((row) => row.first !== before.find((r) => r.name === row.name)!.first)).toBe(true);
    await expect(card(page, "dumbbell")).toHaveScreenshot("charts-dumbbell-values.png");
    // Half way through the places: the values are there, and the rows are moving.
    await page.clock.runFor(500);
    const moving = await rows(page);
    // Rows rest 32 px apart, from 16.
    expect(moving.some((row) => (row.y - 16) % 32 !== 0)).toBe(true);
    await expect(card(page, "dumbbell")).toHaveScreenshot("charts-dumbbell-positions.png");
    await page.clock.runFor(REST);
    const after = await rows(page);
    expect([...after].sort((a, b) => a.y - b.y).map((row) => row.name)).toEqual(["Adeyemi", "Tanaka", "Okafor", "Novak", "Moreau", "Reyes", "Castillo", "Lindqvist"]);
    await expect(named(page, "#dumbbell line.connector").first()).toHaveAttribute("aria-label", "Adeyemi: 1 assist in the first half, 5 in the second, up 4");
    await expect(card(page, "dumbbell")).toHaveScreenshot("charts-dumbbell-assists.png");
  });

  test("in Analysis the values and the places move together within 200 ms, and in Off at once", async ({ page }) => {
    await openAtRest(page);
    await pickMode(page, "Analysis");
    const before = await rows(page);
    await metric(page, "Assists").click();
    await page.clock.runFor(96);
    const midway = await rows(page);
    const okafor = { before: before.find((r) => r.name === "Okafor")!, now: midway.find((r) => r.name === "Okafor")! };
    // Both at once: his values and his place are each part way.
    expect(okafor.now.y).not.toBe(okafor.before.y);
    expect(okafor.now.first).not.toBe(okafor.before.first);
    await page.clock.runFor(112);
    const done = await rows(page);
    await page.clock.runFor(REST);
    expect(await rows(page)).toEqual(done);

    await pickMode(page, "Off");
    await metric(page, "Goals").click();
    await page.clock.runFor(FRAME);
    const off = await rows(page);
    await page.clock.runFor(REST);
    expect(await rows(page)).toEqual(off);
    expect([...off].sort((a, b) => a.y - b.y).map((row) => row.name)).toEqual(["Lindqvist", "Reyes", "Tanaka", "Castillo", "Novak", "Adeyemi", "Moreau", "Okafor"]);
  });

  test("picking Off part way through lands the change at once", async ({ page }) => {
    await openAtRest(page);
    await metric(page, "Assists").click();
    // Part way through the values, and the rows not yet moving.
    await page.clock.runFor(250);
    await pickMode(page, "Off");
    const landed = await rows(page);
    expect([...landed].sort((a, b) => a.y - b.y).map((row) => row.name)).toEqual(["Adeyemi", "Tanaka", "Okafor", "Novak", "Moreau", "Reyes", "Castillo", "Lindqvist"]);
    for (const row of landed) expect((row.y - 16) % 32, row.name).toBe(0);
    await page.clock.runFor(REST);
    expect(await rows(page)).toEqual(landed);
  });

  test("the arrow keys go through the rows top to bottom, and after a re-sort in their new order", async ({ page }) => {
    await openAtRest(page);
    await tabInto(page, svg(page, "dumbbell"));
    const lines = named(page, "#dumbbell line.connector");
    await expect(lines.first()).toBeFocused();
    await expect(lines.first()).toHaveAttribute("aria-label", /^Lindqvist/);
    await page.keyboard.press("ArrowDown");
    await expect(lines.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(lines.last()).toBeFocused();
    await expect(lines.last()).toHaveAttribute("aria-label", /^Okafor/);
    // Focus plays the line's hover: the arrow, at rest at its end.
    await page.clock.runFor(REST);
    await expect(svg(page, "dumbbell").locator('.ec-focus-ring:not([visibility="hidden"])')).toHaveCount(1);
    await expect(card(page, "dumbbell")).toHaveScreenshot("charts-focus-dumbbell.png");
    await page.keyboard.press("Home");
    await expect(lines.first()).toBeFocused();
    await metric(page, "Assists").click();
    await page.clock.runFor(REST);
    await tabInto(page, svg(page, "dumbbell"));
    await page.keyboard.press("Home");
    await expect(page.locator("#dumbbell :focus")).toHaveAttribute("aria-label", /^Adeyemi/);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#dumbbell :focus")).toHaveAttribute("aria-label", /^Tanaka/);
  });
});

test.describe("the radar", () => {
  test("the player's outline is coloured where it's past the league average", async ({ page }) => {
    await openAtRest(page);
    const runs = page.locator('#radar .ec-overlay .ec-run[data-key="player"][data-slot="decorate"] path');
    // Round goals, from the outline's start and back to it, and round shots.
    await expect(runs).toHaveCount(3);
    await expect(page.locator('#radar .ec-overlay .ec-run[data-key="average"] path')).toHaveCount(0);
  });

  test("hovering a value sends a dot out its spoke and lights the league average on the same axis", async ({ page }) => {
    await openAtRest(page);
    // Okafor's shots.
    await hoverShape(page, page.locator("#radar circle.value-player").nth(2));
    await page.clock.runFor(150);
    await expect(page.locator('#radar .ec-overlay .ec-icon[data-icon="dot"]')).toHaveCount(2);
    await expect(card(page, "radar")).toHaveScreenshot("charts-radar-hover.png");
    expect(await page.locator("#radar circle.value.ec-dimmed").count()).toBe(10);
    await expect(page.locator(".ec-tooltip")).toHaveCount(0);
    // At rest, each dot is on its value.
    await page.clock.runFor(REST);
    const apart = await page.evaluate(() =>
      [...document.querySelectorAll<SVGGElement>('#radar .ec-overlay .ec-icon[data-icon="dot"]')].map((icon) => {
        const { e, f } = icon.transform.baseVal.consolidate()!.matrix;
        const values = [...document.querySelectorAll("#radar circle.value")].filter((circle) => circle.getAttribute("cx") !== null);
        return Math.min(...values.map((circle) => Math.hypot(Number(circle.getAttribute("cx")) - e, Number(circle.getAttribute("cy")) - f)));
      })
    );
    for (const distance of apart) expect(distance).toBeLessThan(1.5);
  });

  test("three tab stops: the outlines, then each series' values, each by the arrow keys clockwise from goals", async ({ page }) => {
    await openAtRest(page);
    await tabInto(page, svg(page, "radar"));
    await expect(page.locator("#radar :focus")).toHaveAttribute("aria-label", /^Okafor: above/);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#radar :focus")).toHaveAttribute("aria-label", /^League average: goals/);
    await page.keyboard.press("Tab");
    await expect(page.locator("#radar :focus")).toHaveAttribute("aria-label", "Okafor, goals: 0.50 per 90, 96th percentile");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#radar :focus")).toHaveAttribute("aria-label", "Okafor, shots: 2.00 per 90, 91st percentile");
    await page.clock.runFor(REST);
    await expect(card(page, "radar")).toHaveScreenshot("charts-focus-radar.png");
    await page.keyboard.press("Tab");
    await expect(page.locator("#radar :focus")).toHaveAttribute("aria-label", "League average, goals: 0.18 per 90, 63rd percentile");
    await page.keyboard.press("End");
    await expect(page.locator("#radar :focus")).toHaveAttribute("aria-label", "League average, dribbles: 1.00 per 90, 60th percentile");
  });
});

test.describe("the butterfly", () => {
  test("hovering a bar lights its mirror, with no tooltip", async ({ page }) => {
    await openAtRest(page);
    await hoverShape(page, page.locator("#butterfly rect.bar-conceded").nth(4));
    await page.clock.runFor(REST);
    const lit = await page.locator("#butterfly rect.bar:not(.ec-dimmed)").evaluateAll((bars) => bars.map((bar) => bar.getAttribute("aria-label")));
    expect(lit).toEqual(["61–75 minutes: 9 conceded", "61–75 minutes: 11 scored"]);
    await expect(page.locator(".ec-tooltip")).toHaveCount(0);
    await expect(card(page, "butterfly")).toHaveScreenshot("charts-butterfly-hover.png");
  });

  test("each half by the keys, the mirror lit as each bar is focused", async ({ page }) => {
    await openAtRest(page);
    await tabInto(page, svg(page, "butterfly"));
    await expect(page.locator("#butterfly :focus")).toHaveAttribute("aria-label", "0–15 minutes: 6 conceded");
    await page.keyboard.press("End");
    await expect(page.locator("#butterfly :focus")).toHaveAttribute("aria-label", "76–90+ minutes: 11 conceded");
    await page.clock.runFor(REST);
    expect(await page.locator("#butterfly rect.bar:not(.ec-dimmed)").evaluateAll((bars) => bars.map((bar) => bar.getAttribute("aria-label")))).toEqual(["76–90+ minutes: 11 conceded", "76–90+ minutes: 13 scored"]);
    await expect(card(page, "butterfly")).toHaveScreenshot("charts-focus-butterfly.png");
    await page.keyboard.press("Tab");
    await expect(page.locator("#butterfly :focus")).toHaveAttribute("aria-label", "0–15 minutes: 7 scored");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#butterfly :focus")).toHaveAttribute("aria-label", "16–30 minutes: 8 scored");
  });
});

test.describe("the bullet chart", () => {
  test("its bars fill at load, then the markers they pass flash once, and nothing else of it moves", async ({ page }) => {
    await openLoading(page);
    const bands = await bandsOf(page);
    await page.clock.runFor(LOADING);
    // Each bar part way along, over itself made faint; no marker flashes yet.
    expect(await drawing(page, "bullet")).toBe(8);
    expect(await flashing(page)).toEqual([]);
    await expect(card(page, "bullet")).toHaveScreenshot("charts-bullet-fill.png");
    await page.clock.runFor(FILL - LOADING - 2 * FRAME);
    expect(await flashing(page)).toEqual([]);
    await page.clock.runFor(MID_FLASH - FILL + 2 * FRAME);
    expect(await drawing(page, "bullet")).toBe(0);
    expect(await flashing(page)).toEqual(["Okafor", "Lindqvist", "Tanaka", "Novak"]);
    await expect(card(page, "bullet")).toHaveScreenshot("charts-bullet-flash.png");
    await page.clock.runFor(REST);
    expect(await flashing(page)).toEqual([]);
    expect(await bandsOf(page)).toBe(bands);
  });

  test("Assists draws the other measure at once and flashes only the markers newly passed, the bands as they were", async ({ page }) => {
    await openAtRest(page);
    const bands = await bandsOf(page);
    await measure(page, "Assists").click();
    await expect(measure(page, "Assists")).toHaveAttribute("aria-pressed", "true");
    await expect(measure(page, "Goals")).toHaveAttribute("aria-pressed", "false");
    await page.clock.runFor(225);
    expect(await flashing(page)).toEqual(["Reyes", "Adeyemi", "Castillo"]);
    await expect(named(page, "#bullet rect.value").first()).toHaveAttribute("aria-label", "Okafor: 4 assists, target 5, not met");
    await expect(named(page, "#bullet rect.value").last()).toHaveAttribute("aria-label", "Castillo: 5 assists, target 4, met");
    await expect(page.locator("#bullet text.axis-title")).toHaveText("Assists this season");
    await page.clock.runFor(REST);
    expect(await flashing(page)).toEqual([]);
    expect(await bandsOf(page)).toBe(bands);
    // The dumbbell's own toggle is another group, and didn't move.
    await expect(metric(page, "Goals")).toHaveAttribute("aria-pressed", "true");
    await measure(page, "Goals").click();
    await page.clock.runFor(225);
    expect(await flashing(page)).toEqual(["Okafor", "Novak"]);
  });

  test("Assists while the bars fill flashes nothing until they have, then the markers passed by then", async ({ page }) => {
    await openLoading(page);
    await page.clock.runFor(LOADING);
    await measure(page, "Assists").click();
    await page.clock.runFor(FILL - LOADING - 2 * FRAME);
    expect(await flashing(page)).toEqual([]);
    await page.clock.runFor(MID_FLASH - FILL + 2 * FRAME);
    expect(await flashing(page)).toEqual(["Lindqvist", "Tanaka", "Reyes", "Adeyemi", "Castillo"]);
    await page.clock.runFor(REST);
    expect(await flashing(page)).toEqual([]);
  });

  test("hovering a bar dims the other rows, bar and marker, and never the bands; a marker lets the pointer through to its bar", async ({ page }) => {
    await openAtRest(page);
    const bands = await bandsOf(page);
    // Tanaka's bar ends past his marker: the pointer on the marker is on the bar.
    const marker = await page.locator("#bullet line.target").nth(3).boundingBox();
    await page.mouse.move(marker!.x + marker!.width / 2, marker!.y + marker!.height / 2);
    await page.clock.runFor(REST);
    expect(await page.locator("#bullet rect.value.ec-dimmed").count()).toBe(7);
    expect(await page.locator("#bullet line.target.ec-dimmed").count()).toBe(7);
    await expect(page.locator("#bullet rect.value").nth(3)).not.toHaveClass(/ec-dimmed/);
    await expect(page.locator("#bullet line.target").nth(3)).not.toHaveClass(/ec-dimmed/);
    expect(await bandsOf(page)).toBe(bands);
    await expect(page.locator(".ec-tooltip")).toHaveCount(0);
    // A band alone takes no pointer: past the end of Castillo's bar, nothing is hovered.
    const band = await page.locator("#bullet g.band-row").nth(7).locator("rect.band-3").boundingBox();
    await page.mouse.move(band!.x + band!.width / 2, band!.y + band!.height / 2);
    await page.clock.runFor(REST);
    expect(await page.locator("#bullet .ec-dimmed").count()).toBe(0);
  });

  test("Tab reaches Okafor's bar, the arrows go down the rows, and the ring shows", async ({ page }) => {
    await openAtRest(page);
    await tabInto(page, svg(page, "bullet"));
    const bars = named(page, "#bullet rect.value");
    await expect(bars.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(bars.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(bars.last()).toBeFocused();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#bullet :focus")).toHaveAttribute("aria-label", "Moreau: 8 goals, target 10, not met");
    await page.clock.runFor(REST);
    await expect(svg(page, "bullet").locator('.ec-focus-ring:not([visibility="hidden"])')).toHaveCount(1);
    await expect(card(page, "bullet")).toHaveScreenshot("charts-focus-bullet.png");
  });
});

test.describe("the funnel", () => {
  test("its labels rise once at load, each the drop from the stage before, in the gap above its stage and clear of both", async ({ page }) => {
    await openLoading(page);
    await page.clock.runFor(200);
    const rising = await drops(page);
    expect(rising.map((drop) => drop.text)).toEqual(["−60%", "−64%"]);
    for (const drop of rising) {
      expect(drop.opacity).toBeGreaterThan(0);
      expect(drop.opacity).toBeLessThan(1);
    }
    await expect(card(page, "funnel")).toHaveScreenshot("charts-funnel-rise.png");
    await page.clock.runFor(REST);
    for (const drop of await drops(page)) {
      expect(drop.opacity).toBe(1);
      // The text's whole box is in the gap, and centred on its stage.
      expect(drop.top, drop.text).toBeGreaterThan(drop.above);
      expect(drop.bottom, drop.text).toBeLessThan(drop.own);
      expect((drop.left + drop.right) / 2).toBeCloseTo(drop.middle, 0);
    }
    // None on the first stage.
    await expect(page.locator('#funnel .ec-overlay .ec-run[data-key="Shots"] text')).toHaveCount(0);
  });

  test("at 320 px each label still sits in its gap, clear of both stages and of every name and count", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: NARROW });
    await openAtRest(page);
    const labels = await drops(page);
    expect(labels).toHaveLength(2);
    for (const drop of labels) {
      expect(drop.top, drop.text).toBeGreaterThan(drop.above);
      expect(drop.bottom, drop.text).toBeLessThan(drop.own);
    }
    const clear = await page.evaluate(() => {
      const box = (element: SVGGraphicsElement): DOMRect => element.getBoundingClientRect();
      const labels = [...document.querySelectorAll<SVGTextElement>("#funnel .ec-overlay .ec-runs text")].map(box);
      const others = [...document.querySelectorAll<SVGGraphicsElement>("#funnel path.stage, #funnel text.name, #funnel text.count")].map(box);
      return labels.every((a) => others.every((b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
    });
    expect(clear).toBe(true);
  });

  test("hovering a stage dims the others, with no tooltip, and the labels stay", async ({ page }) => {
    await openAtRest(page);
    const before = await drops(page);
    await hoverShape(page, page.locator("#funnel path.stage").nth(1));
    await page.clock.runFor(REST);
    const dimmed = await page.locator("#funnel path.stage.ec-dimmed").evaluateAll((stages) => stages.map((stage) => stage.getAttribute("aria-label")));
    expect(dimmed).toEqual(["Shots: 408", "Goals: 58, down 64% from On target"]);
    await expect(page.locator(".ec-tooltip")).toHaveCount(0);
    expect(await drops(page)).toEqual(before);
    await expect(card(page, "funnel")).toHaveScreenshot("charts-funnel-hover.png");
  });

  test("Tab reaches Shots, the arrows go down the stages, and the ring shows", async ({ page }) => {
    await openAtRest(page);
    await tabInto(page, svg(page, "funnel"));
    const stages = named(page, "#funnel path.stage");
    await expect(stages.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(stages.nth(1)).toBeFocused();
    await expect(stages.nth(1)).toHaveAttribute("aria-label", "On target: 163 shots, down 60% from Shots");
    await page.keyboard.press("End");
    await expect(stages.last()).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(stages.nth(1)).toBeFocused();
    await page.clock.runFor(REST);
    await expect(svg(page, "funnel").locator('.ec-focus-ring:not([visibility="hidden"])')).toHaveCount(1);
    await expect(card(page, "funnel")).toHaveScreenshot("charts-focus-funnel.png");
  });
});

/** What Chrome's accessibility tree exposes inside a card's chart box, each node as "role: name", as map.spec.ts reads it. */
async function readable(page: Page, chart: string): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `section[aria-labelledby="${chart}-title"] .box` });
    const lines: string[] = [];
    for (const role of ["group", "image", "StaticText", "graphics-symbol", "graphics-document"]) {
      const { nodes } = await cdp.send("Accessibility.queryAXTree", { nodeId, role });
      lines.push(...nodes.filter((node) => !node.ignored && node.name?.value).map((node) => `${String(node.role?.value)}: ${String(node.name?.value)}`));
    }
    return lines;
  } finally {
    await cdp.detach();
  }
}

test.describe("the screen reader", () => {
  test("the bullet chart is a named group of eight bars, and its bands, markers, names and axis are never read; the funnel is one of three stages, and its labels aren't", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "It reads Chrome's accessibility tree, over CDP.");
    await openAtRest(page);
    // The legend is the page's own text, which is on show.
    const legend = ["This season", "Target", "Under 5", "5 to 9", "10 or more"].map((words) => `StaticText: ${words}`);
    const bullet = ["group: Each player's season against their target on a D3 bullet chart", ...BULLET_GOALS.map((name) => `image: ${name}`), ...legend].sort();
    expect((await readable(page, "bullet")).sort()).toEqual(bullet);
    const funnel = ["group: The season's shots, shots on target and goals on a D3 funnel", "image: Shots: 408", "image: On target: 163 shots, down 60% from Shots", "image: Goals: 58, down 64% from On target"].sort();
    expect((await readable(page, "funnel")).sort()).toEqual(funnel);
    // The same mid-flash, and with a stage hovered: what the effects draw is in the overlay, which isn't read.
    await page.getByRole("button", { name: "Replay the bullet chart" }).click();
    await page.clock.runFor(MID_FLASH);
    expect(await flashing(page)).toHaveLength(4);
    expect((await readable(page, "bullet")).sort()).toEqual(bullet);
    await hoverShape(page, page.locator("#funnel path.stage").nth(1));
    await page.clock.runFor(REST);
    expect((await readable(page, "funnel")).sort()).toEqual(funnel);
  });
});

test.describe("the waterfall's keys", () => {
  test("Tab reaches August, the arrows go month by month to the total, and the ring shows", async ({ page }) => {
    await openAtRest(page);
    await tabInto(page, svg(page, "waterfall"));
    const steps = named(page, "#waterfall rect.step");
    await expect(steps.first()).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(steps.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(steps.last()).toBeFocused();
    await page.clock.runFor(REST);
    await expect(svg(page, "waterfall").locator('.ec-focus-ring:not([visibility="hidden"])')).toHaveCount(1);
    await expect(card(page, "waterfall")).toHaveScreenshot("charts-focus-waterfall.png");
    await page.keyboard.press("Home");
    await expect(steps.first()).toBeFocused();
  });
});

test.describe("Replay", () => {
  test("the waterfall's plays its load again: the connectors draw in, the ball travels and the labels rise, with focus kept on the button", async ({ page }) => {
    await openAtRest(page);
    const resting = await ballAt(page);
    const replay = page.getByRole("button", { name: "Replay the waterfall" });
    await replay.click();
    await page.clock.runFor(300);
    await expect(replay).toBeFocused();
    expect(await drawing(page, "waterfall")).toBe(10);
    const early = await ballAt(page);
    expect(Math.hypot(early.x - resting.x, early.y - resting.y)).toBeGreaterThan(20);
    await expect(card(page, "waterfall")).toHaveScreenshot("charts-waterfall-replay.png");
    await page.clock.runFor(REST);
    expect(await ballAt(page)).toEqual(resting);
    expect(await drawing(page, "waterfall")).toBe(0);
    await expect(page.locator("#waterfall .ec-overlay .ec-runs text")).toHaveCount(11);
    // Attached again: still one tab stop, on August.
    await expect(page.locator('#waterfall [tabindex="0"]')).toHaveCount(1);
  });

  test("the butterfly's grows both halves out again", async ({ page }) => {
    await openAtRest(page);
    const replay = page.getByRole("button", { name: "Replay the butterfly" });
    await replay.click();
    await page.clock.runFor(300);
    expect(await drawing(page, "butterfly")).toBe(12);
    await expect(card(page, "butterfly")).toHaveScreenshot("charts-butterfly-replay.png");
    await page.clock.runFor(REST);
    expect(await drawing(page, "butterfly")).toBe(0);
    // Linked again: a bar still lights its mirror.
    await hoverShape(page, page.locator("#butterfly rect.bar-scored").first());
    await page.clock.runFor(REST);
    expect(await page.locator("#butterfly rect.bar:not(.ec-dimmed)").count()).toBe(2);
  });
});

test.describe("Replay, the bullet chart and the funnel", () => {
  test("the bullet chart's fills the bars and flashes the markers they pass again, for the measure shown, with focus kept on the button", async ({ page }) => {
    await openAtRest(page);
    await measure(page, "Assists").click();
    await page.clock.runFor(REST);
    const replay = page.getByRole("button", { name: "Replay the bullet chart" });
    await replay.click();
    await page.clock.runFor(300);
    await expect(replay).toBeFocused();
    expect(await drawing(page, "bullet")).toBe(8);
    expect(await flashing(page)).toEqual([]);
    await page.clock.runFor(MID_FLASH - 300);
    expect(await flashing(page)).toEqual(["Lindqvist", "Tanaka", "Reyes", "Adeyemi", "Castillo"]);
    await page.clock.runFor(REST);
    expect(await flashing(page)).toEqual([]);
    expect(await drawing(page, "bullet")).toBe(0);
    // Attached again: still one tab stop, and Assists still shown.
    await expect(page.locator('#bullet [tabindex="0"]')).toHaveCount(1);
    await expect(measure(page, "Assists")).toHaveAttribute("aria-pressed", "true");
    // A second Replay part way through the first starts over: no flash from the first.
    await replay.click();
    await page.clock.runFor(600);
    await replay.click();
    await page.clock.runFor(FILL - 2 * FRAME);
    expect(await flashing(page)).toEqual([]);
    await page.clock.runFor(REST);
    expect(await drawing(page, "bullet")).toBe(0);
  });

  test("the funnel's rises its labels again, to where they were", async ({ page }) => {
    await openAtRest(page);
    const rest = await drops(page);
    const replay = page.getByRole("button", { name: "Replay the funnel" });
    await replay.click();
    await page.clock.runFor(200);
    await expect(replay).toBeFocused();
    for (const drop of await drops(page)) expect(drop.opacity).toBeLessThan(1);
    await page.clock.runFor(REST);
    expect(await drops(page)).toEqual(rest);
    await expect(page.locator('#funnel [tabindex="0"]')).toHaveCount(1);
  });
});

test.describe("reduced motion and Off", () => {
  test("with reduced motion the bullet chart and the funnel load in their end states: the bars full, nothing flashing, the labels in place", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, chartsDemo);
    expect(await drawing(page, "bullet")).toBe(0);
    expect(await flashing(page)).toEqual([]);
    for (const drop of await drops(page)) expect(drop.opacity).toBe(1);
    // As the cards are at rest, to the pixel, with no time passed.
    await expect(card(page, "bullet")).toHaveScreenshot("charts-bullet-light.png");
    await expect(card(page, "funnel")).toHaveScreenshot("charts-funnel-light.png");
    // A bar past its marker says so in its name.
    await expect(named(page, "#bullet rect.value").first()).toHaveAttribute("aria-label", "Okafor: 16 goals, target 12, met");
    // Neither Replay nor the other measure moves or flashes anything.
    await page.getByRole("button", { name: "Replay the bullet chart" }).click();
    await measure(page, "Assists").click();
    await page.getByRole("button", { name: "Replay the funnel" }).click();
    expect(await drawing(page, "bullet")).toBe(0);
    expect(await flashing(page)).toEqual([]);
    for (const drop of await drops(page)) expect(drop.opacity).toBe(1);
    await page.clock.runFor(REST);
    expect(await flashing(page)).toEqual([]);
    await expect(named(page, "#bullet rect.value").nth(4)).toHaveAttribute("aria-label", "Reyes: 4 assists, target 3, met");
  });

  test("picking Off while the bullet's bars fill lands them full at once, with no flash to come", async ({ page }) => {
    await openLoading(page);
    await page.clock.runFor(LOADING);
    expect(await drawing(page, "bullet")).toBe(8);
    await pickMode(page, "Off");
    expect(await drawing(page, "bullet")).toBe(0);
    for (const drop of await drops(page)) expect(drop.opacity).toBe(1);
    await page.clock.runFor(REST);
    expect(await flashing(page)).toEqual([]);
  });

  test("with reduced motion only end states show at load: the ball on the total, the labels, the halves, the colour past the average", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, chartsDemo);
    const corner = await totalCorner(page);
    const ball = await ballAt(page);
    expect(ball.x).toBeCloseTo(corner.x - BALL / 2, 0);
    expect(ball.y).toBeCloseTo(corner.y - 0.5 - BALL / 2, 0);
    await expect(page.locator("#waterfall .ec-overlay .ec-runs text")).toHaveCount(11);
    expect(await drawing(page, "waterfall")).toBe(0);
    expect(await drawing(page, "butterfly")).toBe(0);
    await expect(page.locator('#radar .ec-overlay .ec-run[data-key="player"][data-slot="decorate"] path')).toHaveCount(3);
    // Replay shows the end at once.
    await page.getByRole("button", { name: "Replay the butterfly" }).click();
    expect(await drawing(page, "butterfly")).toBe(0);

    // The viewer's own pick overrides the device's setting.
    await pickMode(page, "Presentation");
    await page.getByRole("button", { name: "Replay the waterfall" }).click();
    await page.clock.runFor(300);
    expect(await drawing(page, "waterfall")).toBe(10);
  });

  test("in Off, Replay and a hover show their end states at once", async ({ page }) => {
    await openAtRest(page);
    const resting = await ballAt(page);
    await pickMode(page, "Off");
    await page.getByRole("button", { name: "Replay the waterfall" }).click();
    expect(await ballAt(page)).toEqual(resting);
    expect(await drawing(page, "waterfall")).toBe(0);
    await hoverLine(page, page.locator("#dumbbell line.connector").nth(7));
    const arrow = page.locator('#dumbbell .ec-overlay .ec-icon[data-icon="arrow"]');
    await expect(arrow).toHaveCount(1);
    const at = await arrow.getAttribute("transform");
    await page.clock.runFor(REST);
    await expect(arrow).toHaveAttribute("transform", at!);
  });
});
