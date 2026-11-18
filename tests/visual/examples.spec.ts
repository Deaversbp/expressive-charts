// Screenshots of demo/examples.html on a stopped clock: the page at load in light and dark and at
// 320 px, a bar hovered, the quarter half way and at rest with its labels in place, at 1,000 px and at
// 320, the line's point hovered, the switch half way and at rest, a focus ring on each card, and
// reduced motion. Beside them, DOM checks, which Firefox and WebKit run too: nothing has played at load,
// the quarter's play and its announcement, a click part way, the labels' short words at 320 px, the
// point's tooltip and name, the switch and back with each view announced once, V and focus following
// the source, and Off. Names start with "examples-", since screenshot names are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { examplesDemo, FRAME, hoverShape, openDemo, pickMode, pointerAway, REST, tabInto } from "./demo";

/** The three cards, each with its heading, its note and its chart. */
const card = (page: Page, name: "revenue" | "height" | "sessions"): Locator => page.locator(`section[aria-labelledby="${name}-title"]`);

const revenue = (page: Page): Locator => page.locator("#revenue");
const quarterButton = (page: Page): Locator => page.locator("#quarter");
const quarterStatus = (page: Page): Locator => page.locator("#quarter-status");
const bar = (page: Page, region: string): Locator => revenue(page).locator(`.ec-mark[data-key="${region}"]`);
/** What the effects in a slot have written on the revenue chart, by region. */
const written = (page: Page, slot: "decorate" | "update"): Promise<Record<string, string>> =>
  revenue(page)
    .locator(`.ec-overlay .ec-run[data-slot="${slot}"]`)
    .evaluateAll((groups) => Object.fromEntries(groups.flatMap((group) => (group.querySelector("text") ? [[group.getAttribute("data-key") ?? "", group.querySelector("text")!.textContent ?? ""]] : []))));
/** The regions down the chart, by where each bar's name is drawn. */
const order = (page: Page): Promise<string[]> =>
  revenue(page)
    .locator(".ec-mark")
    .evaluateAll((marks) =>
      marks
        .map((mark) => ({ key: mark.getAttribute("data-key") ?? "", y: mark.querySelector(".ec-label")!.getBoundingClientRect().y }))
        .sort((a, b) => a.y - b.y)
        .map((mark) => mark.key)
    );

const Q3_TARGETS = { North: "105% of target", East: "106% of target", South: "89% of target", West: "87% of target", Central: "95% of target" };
const Q4_TARGETS = { North: "105% of target", East: "97% of target", South: "94% of target", West: "113% of target", Central: "90% of target" };
const Q4_CHANGES = { North: "+$0.4M", East: "−$0.1M", South: "+$0.3M", West: "+$0.9M" };
const Q4_SAID = "Q4 2026: North, East, West and South changed";

const height = (page: Page): Locator => page.locator("#height");
/** A point's focus stop, by its key: "drought@9". */
const pointStop = (page: Page, key: string): Locator => height(page).locator(`.ec-stop[data-key="${key}"]`);
/** How strongly each group's line is drawn: its stroke's opacity, through its ancestors', 1 at full strength. */
async function strengths(page: Page): Promise<Record<string, number>> {
  return height(page).evaluate((root) => {
    for (const animation of document.getAnimations()) animation.finish();
    const opacity = (element: Element): number => {
      let product = 1;
      for (let at: Element | null = element; at; at = at.parentElement) product *= Number(getComputedStyle(at).opacity);
      return Math.round(product * 100) / 100;
    };
    return Object.fromEntries(["drought", "control"].map((series) => [series, opacity(root.querySelector(`.ec-line[data-key="${series}"] .ec-stroke`)!)]));
  });
}
/** Moves the pointer onto a point's dot, which hovers that point. */
async function hoverPoint(page: Page, key: string): Promise<void> {
  const box = (await height(page).locator(`.ec-point[data-key="${key}"] .ec-dot`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

type View = "donut" | "bars";
const sessions = (page: Page): Locator => page.locator("#sessions");
const view = (page: Page, name: View): Locator => sessions(page).locator(`.ec-switch-view[data-view="${name}"]`);
const viewButton = (page: Page): Locator => page.locator("#view");
const sourceMark = (page: Page, name: View, source: string): Locator => view(page, name).locator(`.ec-mark[data-key="${source}"]`);
/** Each pair's morph in the switch's overlay. */
const runs = (page: Page): Locator => sessions(page).locator(".ec-switch-overlay .ec-switch-runs > .ec-run");
const LABELS = { donut: "Sessions by source, share of total", bars: "Sessions by source, counts" } as const;

/** The view shown, with the other inactive and nothing in the overlay: the switch has landed there. */
async function expectLanded(page: Page, name: View): Promise<void> {
  const other: View = name === "donut" ? "bars" : "donut";
  await expect(view(page, name)).not.toHaveClass(/ec-switch-inactive|ec-switching/);
  await expect(view(page, name)).not.toHaveAttribute("inert");
  await expect(view(page, other)).toHaveClass(/ec-switch-inactive/);
  await expect(view(page, other)).toHaveAttribute("inert", "");
  await expect(runs(page)).toHaveCount(0);
}

/** Records every text a live region is given from now on, trimmed, without the empty ones. */
async function listen(region: Locator): Promise<() => Promise<string[]>> {
  await region.evaluate((element) => {
    const said: string[] = [];
    (element as unknown as { said: string[] }).said = said;
    new MutationObserver(() => {
      const text = (element.textContent ?? "").trim();
      if (text && said[said.length - 1] !== text) said.push(text);
    }).observe(element, { childList: true, characterData: true, subtree: true });
  });
  return () => region.evaluate((element) => (element as unknown as { said: string[] }).said);
}

test.describe("at load", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the three cards at rest, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openDemo(page, examplesDemo);
      await page.clock.runFor(REST);
      await expect(page).toHaveScreenshot(`examples-page-${colorScheme}.png`, { fullPage: true });
    });
  }

  test("nothing has played: Q3's bars with their targets and no change, the donut, and nothing announced", async ({ page }) => {
    await openDemo(page, examplesDemo);
    await page.clock.runFor(REST);
    await expect(quarterButton(page)).toHaveText("Play Q4");
    await expect(quarterStatus(page)).toHaveText("Q3 2026");
    expect(await order(page)).toEqual(["North", "East", "South", "West", "Central"]);
    expect(await written(page, "decorate")).toEqual(Q3_TARGETS);
    expect(await written(page, "update")).toEqual({});
    await expect(revenue(page).getByRole("status")).toHaveText("");
    await expect(viewButton(page)).toHaveText("Show as bars");
    await expectLanded(page, "donut");
    await expect(sessions(page).getByRole("status")).toHaveText("");
    // One run on the drought line, from where it goes below the control; none on the control.
    await expect(height(page).locator('.ec-overlay .ec-run[data-slot="decorate"][data-key="drought"] path')).toHaveCount(1);
    await expect(height(page).locator('.ec-overlay .ec-run[data-slot="decorate"][data-key="control"] path')).toHaveCount(0);
  });

  test("at 320 px: the cards one above another, the revenue labels in their short words", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 2600 });
    await openDemo(page, examplesDemo);
    await page.clock.runFor(REST);
    expect(await written(page, "decorate")).toEqual({ North: "105%", East: "106%", South: "89%", West: "87%", Central: "95%" });
    await expect(page).toHaveScreenshot("examples-page-320.png", { fullPage: true });

    await quarterButton(page).click();
    await pointerAway(page);
    await page.clock.runFor(REST);
    expect(await written(page, "update")).toEqual({ North: "+0.4", East: "−0.1", South: "+0.3", West: "+0.9" });
    // Every label is inside the chart.
    const inside = await revenue(page).evaluate((root) => {
      const chart = root.querySelector("svg")!.getBoundingClientRect();
      return [...root.querySelectorAll(".ec-overlay text")].every((text) => {
        const box = text.getBoundingClientRect();
        return box.left >= chart.left && box.right <= chart.right;
      });
    });
    expect(inside).toBe(true);
    await expect(card(page, "revenue")).toHaveScreenshot("examples-quarter-320.png");
  });
});

test.describe("revenue by region", () => {
  test("a bar hovered: its highlighter, its tooltip, and the others dimmed", async ({ page }) => {
    await openDemo(page, examplesDemo);
    await page.clock.runFor(REST);
    await hoverShape(page, bar(page, "South").locator(".ec-segment"));
    await page.clock.runFor(REST);
    await expect(revenue(page).locator(".ec-tooltip-shown")).toHaveText("South $3.1M revenue $3.5M target (89%)");
    await expect(revenue(page).locator('.ec-overlay .ec-run[data-slot="hover"][data-key="South"] path')).toHaveCount(1);
    // The targets keep their place and their contrast while the other bars dim.
    expect(await written(page, "decorate")).toEqual(Q3_TARGETS);
    await expect(card(page, "revenue")).toHaveScreenshot("examples-bar-hover.png");
  });

  test("the quarter plays: half way, then at rest with each change labelled, announced once", async ({ page }) => {
    await openDemo(page, examplesDemo);
    await page.clock.runFor(REST);
    const said = await listen(revenue(page).getByRole("status"));
    await quarterButton(page).click();
    await pointerAway(page);
    await expect(quarterButton(page)).toHaveText("Back to Q3");
    await expect(quarterStatus(page)).toHaveText("Q4 2026");
    // Presentation stages it: the values move first, with the rows still in Q3's order. 250 ms in,
    // the bars are part way to Q4's lengths.
    await page.clock.runFor(250);
    expect(await order(page)).toEqual(["North", "East", "South", "West", "Central"]);
    await expect(revenue(page)).toHaveScreenshot("examples-quarter-half.png");

    await page.clock.runFor(REST);
    expect(await order(page)).toEqual(["North", "East", "West", "South", "Central"]);
    expect(await written(page, "decorate")).toEqual(Q4_TARGETS);
    // Central's revenue didn't change, so it has no label.
    expect(await written(page, "update")).toEqual(Q4_CHANGES);
    await expect(revenue(page).locator("svg.ec-chart")).toHaveAttribute("aria-label", "Revenue by region, Q4 2026, against target");
    await expect(bar(page, "West")).toHaveAttribute("aria-label", "West: $3.5M revenue, 113% of its $3.1M target");
    expect(await said()).toEqual([Q4_SAID]);
    await expect(card(page, "revenue")).toHaveScreenshot("examples-quarter-rest.png");
  });

  test("a click part way goes back to Q3 from where the bars are", async ({ page }) => {
    await openDemo(page, examplesDemo);
    await page.clock.runFor(REST);
    await quarterButton(page).click();
    await page.clock.runFor(300);
    await quarterButton(page).click();
    await expect(quarterButton(page)).toHaveText("Play Q4");
    await expect(quarterStatus(page)).toHaveText("Q3 2026");
    await page.clock.runFor(REST);
    expect(await order(page)).toEqual(["North", "East", "South", "West", "Central"]);
    expect(await written(page, "decorate")).toEqual(Q3_TARGETS);
  });

  for (const mode of ["Analysis", "Off"] as const) {
    test(`in ${mode} the quarter ${mode === "Off" ? "is in its end state at once" : "lands within 200 ms"}, its labels in place`, async ({ page }) => {
      await openDemo(page, examplesDemo);
      await pickMode(page, mode);
      await page.clock.runFor(REST);
      await quarterButton(page).click();
      await page.clock.runFor(mode === "Off" ? FRAME : 200 + FRAME);
      expect(await order(page)).toEqual(["North", "East", "West", "South", "Central"]);
      // The change labels rise on effect timing, which Analysis shortens and Off skips.
      await page.clock.runFor(mode === "Off" ? 0 : REST);
      expect(await written(page, "update")).toEqual(Q4_CHANGES);
      expect(await written(page, "decorate")).toEqual(Q4_TARGETS);
      const opacities = await revenue(page)
        .locator(".ec-overlay text")
        .evaluateAll((texts) => texts.map((text) => getComputedStyle(text).opacity));
      expect(opacities).toEqual(opacities.map(() => "1"));
    });
  }
});

test.describe("seedling height", () => {
  test("a point hovered: its tooltip above it, and the control dimmed", async ({ page }) => {
    await openDemo(page, examplesDemo);
    await page.clock.runFor(REST);
    await hoverPoint(page, "drought@9");
    await page.clock.runFor(REST);
    await expect(height(page).locator(".ec-tooltip-shown")).toHaveText("Day 9 8.3 cm, Drought");
    await expect(height(page).locator(".ec-point.ec-hot")).toHaveAttribute("data-key", "drought@9");
    expect(await strengths(page)).toEqual({ drought: 1, control: 0.3 });
    await expect(card(page, "height")).toHaveScreenshot("examples-point-hover.png");

    // Off the chart first: the drought point's tooltip sits above it, over the control's point, and a
    // pointer that lands on a tooltip keeps its hover.
    await pointerAway(page);
    await page.clock.runFor(REST);
    await expect(height(page).locator(".ec-tooltip-shown")).toHaveCount(0);
    await hoverPoint(page, "control@9");
    await page.clock.runFor(REST);
    await expect(height(page).locator(".ec-tooltip-shown")).toHaveText("Day 9 10.5 cm, Control (watered)");
    expect(await strengths(page)).toEqual({ drought: 0.3, control: 1 });
  });

  test("the keys go along a line and across to the other, each point named by its day, height and group", async ({ page }) => {
    await openDemo(page, examplesDemo);
    await page.clock.runFor(REST);
    await tabInto(page, height(page));
    await expect(pointStop(page, "drought@0")).toBeFocused();
    await expect(pointStop(page, "drought@0")).toHaveAttribute("aria-label", "Day 0: 2.0 cm, Drought");
    await page.keyboard.press("End");
    await expect(pointStop(page, "drought@12")).toBeFocused();
    await expect(pointStop(page, "drought@12")).toHaveAttribute("aria-label", "Day 12: 8.6 cm, Drought");
    await page.keyboard.press("ArrowUp");
    await expect(pointStop(page, "control@12")).toBeFocused();
    await expect(pointStop(page, "control@12")).toHaveAttribute("aria-label", "Day 12: 13.9 cm, Control (watered)");
    await page.keyboard.press("ArrowLeft");
    await expect(pointStop(page, "control@11")).toBeFocused();
  });
});

test.describe("sessions by source", () => {
  test("the switch: half way to bars, then at rest, and back, each view announced once", async ({ page }) => {
    await openDemo(page, examplesDemo);
    await page.clock.runFor(REST);
    const said = await listen(sessions(page).getByRole("status"));
    await viewButton(page).click();
    await pointerAway(page);
    await expect(viewButton(page)).toHaveText("Show as donut");
    await page.clock.runFor(475);
    await expect(view(page, "donut")).toHaveClass(/ec-switching/);
    await expect(view(page, "bars")).toHaveClass(/ec-switching/);
    await expect(runs(page)).toHaveCount(5);
    await expect(sessions(page)).toHaveScreenshot("examples-switch-half.png");

    await page.clock.runFor(REST);
    await expectLanded(page, "bars");
    await expect(sourceMark(page, "bars", "Search")).toHaveAttribute("aria-label", "Search: 18,400 sessions");
    await expect(card(page, "sessions")).toHaveScreenshot("examples-bars.png");

    await viewButton(page).click();
    await expect(viewButton(page)).toHaveText("Show as bars");
    await page.clock.runFor(REST);
    await expectLanded(page, "donut");
    expect(await said()).toEqual([LABELS.bars, LABELS.donut]);
  });

  test("a second click part way goes back to the donut", async ({ page }) => {
    await openDemo(page, examplesDemo);
    await page.clock.runFor(REST);
    await viewButton(page).click();
    await page.clock.runFor(400);
    await viewButton(page).click();
    await expect(viewButton(page)).toHaveText("Show as bars");
    await page.clock.runFor(REST);
    await expectLanded(page, "donut");
  });

  test("V on a focused slice switches, and focus follows its source there and back", async ({ page }) => {
    await openDemo(page, examplesDemo);
    await page.clock.runFor(REST);
    await tabInto(page, sessions(page));
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(sourceMark(page, "donut", "Social")).toBeFocused();
    await page.keyboard.press("v");
    await expect(viewButton(page)).toHaveText("Show as donut");
    await page.clock.runFor(REST);
    await expectLanded(page, "bars");
    await expect(sourceMark(page, "bars", "Social")).toBeFocused();
    await page.keyboard.press("v");
    await page.clock.runFor(REST);
    await expectLanded(page, "donut");
    await expect(sourceMark(page, "donut", "Social")).toBeFocused();
  });

  test("in Off a switch lands at once", async ({ page }) => {
    await openDemo(page, examplesDemo);
    await pickMode(page, "Off");
    await viewButton(page).click();
    await page.clock.runFor(FRAME);
    await expectLanded(page, "bars");
  });
});

test.describe("focus", () => {
  test("a ring on each card: a bar, a point and a slice", async ({ page }) => {
    await openDemo(page, examplesDemo);
    await page.clock.runFor(REST);
    await tabInto(page, revenue(page));
    await page.keyboard.press("ArrowDown");
    await page.clock.runFor(REST);
    await expect(bar(page, "East")).toBeFocused();
    await expect(card(page, "revenue")).toHaveScreenshot("examples-focus-bar.png");

    await tabInto(page, height(page));
    for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowRight");
    await page.clock.runFor(REST);
    await expect(pointStop(page, "drought@9")).toBeFocused();
    await expect(card(page, "height")).toHaveScreenshot("examples-focus-point.png");

    await tabInto(page, sessions(page));
    await page.keyboard.press("ArrowRight");
    await page.clock.runFor(REST);
    await expect(sourceMark(page, "donut", "Direct")).toBeFocused();
    await expect(card(page, "sessions")).toHaveScreenshot("examples-focus-slice.png");
  });
});

test.describe("reduced motion", () => {
  test("every card is in its end state: the quarter and the switch land at once, the labels in place", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, examplesDemo);
    // No time passes: what's drawn is where each effect ends.
    expect(await written(page, "decorate")).toEqual(Q3_TARGETS);
    await expect(height(page).locator('.ec-overlay .ec-run[data-slot="decorate"][data-key="drought"] path')).toHaveCount(1);

    const said = await listen(revenue(page).getByRole("status"));
    await quarterButton(page).click();
    await viewButton(page).click();
    await pointerAway(page);
    await page.clock.runFor(FRAME);
    expect(await order(page)).toEqual(["North", "East", "West", "South", "Central"]);
    expect(await written(page, "update")).toEqual(Q4_CHANGES);
    expect(await written(page, "decorate")).toEqual(Q4_TARGETS);
    expect(await said()).toEqual([Q4_SAID]);
    await expectLanded(page, "bars");
    await expect(page).toHaveScreenshot("examples-reduced.png", { fullPage: true });
  });
});
