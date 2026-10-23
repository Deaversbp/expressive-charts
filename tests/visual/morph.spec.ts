// Screenshots of demo/morph.html on a stopped clock: each view in light and dark, a switch half way
// with each mapping, and the focus ring after a switch. Beside them, DOM checks: how long a switch
// takes in each mode, reduced motion, a switch back mid-way, the labels swapping their text, the
// announcement, the mapping control, and only the view shown being readable. Names start with
// "morph-", since screenshot names are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { FRAME, morphDemo, openDemo, pickMode, pointerAway, REST, tabInto } from "./demo";

type View = "donut" | "columns";
type Align = "Drop" | "Unroll";

/** The switch's card: the toggle, the mapping control and both views. */
const card = (page: Page): Locator => page.locator('section[aria-labelledby="shots-title"]');
const shots = (page: Page): Locator => page.locator("#shots");
const view = (page: Page, name: View): Locator => shots(page).locator(`.ec-switch-view[data-view="${name}"]`);
/** Each pair's morph in the switch's overlay. */
const runs = (page: Page): Locator => shots(page).locator(".ec-switch-overlay .ec-switch-runs > .ec-run");
const toggle = (page: Page): Locator => page.locator("#toggle");
const announcer = (page: Page): Locator => shots(page).getByRole("status");
const alignButton = (page: Page, align: Align): Locator => page.getByRole("group", { name: "Morph" }).getByRole("button", { name: align, exact: true });
/** An outcome's mark in a view: the focusable element. */
const mark = (page: Page, name: View, outcome: string): Locator => view(page, name).locator(`.ec-mark[data-key="${outcome}"]`);

/** A switch at 950 ms base: 950 in Presentation, 200 in Analysis. */
const SWITCH = { Presentation: 950, Analysis: 200 } as const;

/** The view shown, with the other inactive and nothing in the overlay: the switch has landed there. */
async function expectLanded(page: Page, name: View): Promise<void> {
  const other: View = name === "donut" ? "columns" : "donut";
  await expect(view(page, name)).not.toHaveClass(/ec-switch-inactive|ec-switching/);
  await expect(view(page, name)).not.toHaveAttribute("inert");
  await expect(view(page, name)).not.toHaveAttribute("aria-hidden");
  await expect(view(page, other)).toHaveClass(/ec-switch-inactive/);
  await expect(view(page, other)).toHaveAttribute("inert", "");
  await expect(view(page, other)).toHaveAttribute("aria-hidden", "true");
  await expect(runs(page)).toHaveCount(0);
}

/** Mid-switch: both views' marks hidden, each pair morphing in the overlay. */
async function expectSwitching(page: Page): Promise<void> {
  await expect(view(page, "donut")).toHaveClass(/ec-switching/);
  await expect(view(page, "columns")).toHaveClass(/ec-switching/);
  await expect(runs(page)).toHaveCount(4);
}

/** The overlay's label copies that show now, as text. */
async function labelsShown(page: Page): Promise<string[]> {
  return shots(page)
    .locator(".ec-switch-overlay .ec-switch-labels > text")
    .evaluateAll((texts) => texts.filter((text) => text.getAttribute("visibility") !== "hidden").map((text) => text.textContent ?? ""));
}

/** Each pair's morph as drawn now, by key. */
async function shapes(page: Page): Promise<Record<string, string | null>> {
  return runs(page).evaluateAll((groups) =>
    Object.fromEntries(groups.map((group) => [group.getAttribute("data-key") ?? "", group.querySelector("path")?.getAttribute("d") ?? null]))
  );
}

test.describe("theme", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the donut and the columns at rest, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openDemo(page, morphDemo);
      await expectLanded(page, "donut");
      await expect(page).toHaveScreenshot(`morph-page-${colorScheme}.png`, { fullPage: true });

      await toggle(page).click();
      // Off the button, so it isn't drawn hovered.
      await pointerAway(page);
      await page.clock.runFor(REST);
      await expectLanded(page, "columns");
      await expect(toggle(page)).toHaveText("Show as donut");
      await expect(card(page)).toHaveScreenshot(`morph-columns-${colorScheme}.png`);
    });
  }
});

test.describe("half way", () => {
  for (const align of ["Drop", "Unroll"] as const) {
    test(`each slice half way to its column, ${align.toLowerCase()}`, async ({ page }) => {
      await openDemo(page, morphDemo);
      await alignButton(page, align).click();
      await expect(alignButton(page, align)).toHaveAttribute("aria-pressed", "true");
      await morphDemo.ready(page);

      await toggle(page).click();
      await expect(toggle(page)).toHaveText("Show as donut");
      // The last frame at or before 475 ms is 472 ms in: the shapes and labels just short of half
      // way, the labels still with the donut's shares, and neither view's legend, centre or axes
      // showing (the donut's are gone by 40% of the way, the columns' start at 50%).
      await page.clock.runFor(475);
      await expectSwitching(page);
      expect((await labelsShown(page)).sort()).toEqual(["14%", "21%", "28%", "37%", "Blocked", "Goal", "Off target", "Saved"]);
      await expect(view(page, "donut")).toHaveCSS("opacity", "0");
      await expect(view(page, "columns")).toHaveCSS("opacity", "0");
      await expect(shots(page)).toHaveScreenshot(`morph-half-${align.toLowerCase()}.png`);

      // A frame later the labels have swapped to the columns' counts.
      await page.clock.runFor(FRAME);
      expect((await labelsShown(page)).sort()).toEqual(["112", "149", "58", "87", "Blocked", "Goal", "Off target", "Saved"]);
      await page.clock.runFor(REST);
      await expectLanded(page, "columns");
    });
  }
});

test.describe("timing", () => {
  for (const mode of ["Presentation", "Analysis"] as const) {
    const ms = SWITCH[mode];
    test(`a switch takes about ${ms} ms in ${mode}, each way`, async ({ page }) => {
      await openDemo(page, morphDemo);
      await pickMode(page, mode);
      for (const to of ["columns", "donut"] as const) {
        await toggle(page).click();
        await page.clock.runFor(ms - 50);
        await expectSwitching(page);
        await page.clock.runFor(100);
        await expectLanded(page, to);
      }
    });
  }

  test("in Off, a switch lands at once", async ({ page }) => {
    await openDemo(page, morphDemo);
    await pickMode(page, "Off");
    await toggle(page).click();
    // No time passes.
    await expectLanded(page, "columns");
    await expect(toggle(page)).toHaveText("Show as donut");
  });
});

test.describe("a switch back mid-way", () => {
  test("reverses from where the shapes are, and takes the rest of the time", async ({ page }) => {
    await openDemo(page, morphDemo);
    await toggle(page).click();
    await page.clock.runFor(300);
    await expectSwitching(page);
    const forward = await shapes(page);

    // The second click goes back to the donut: the shapes begin where they were, not at either end.
    await toggle(page).click();
    await expect(toggle(page)).toHaveText("Show as columns");
    expect(await shapes(page)).toEqual(forward);
    // 300 ms reached (288 drawn), so the way back takes about 288 ms.
    await page.clock.runFor(250);
    await expectSwitching(page);
    await page.clock.runFor(60);
    await expectLanded(page, "donut");
  });
});

test.describe("reduced motion", () => {
  test("a switch lands at once, both ways, until the viewer picks a mode", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, morphDemo);
    await toggle(page).click();
    await expectLanded(page, "columns");
    await toggle(page).click();
    await expectLanded(page, "donut");

    // The viewer's own pick overrides the device's setting.
    await pickMode(page, "Presentation");
    await toggle(page).click();
    await expectSwitching(page);
    await page.clock.runFor(REST);
    await expectLanded(page, "columns");
  });
});

test.describe("keyboard focus", () => {
  test("V on a slice switches, and focus follows its outcome into the columns with the ring", async ({ page }) => {
    await openDemo(page, morphDemo);
    await tabInto(page, view(page, "donut"));
    await expect(mark(page, "donut", "Goal")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(mark(page, "donut", "Saved")).toBeFocused();

    await page.keyboard.press("v");
    await expect(toggle(page)).toHaveText("Show as donut");
    await page.clock.runFor(REST);
    await expectLanded(page, "columns");
    await expect(mark(page, "columns", "Saved")).toBeFocused();
    await expect(view(page, "columns").locator(".ec-focus")).not.toHaveAttribute("visibility", "hidden");
    await expect(card(page)).toHaveScreenshot("morph-focus-columns.png");

    // And back: focus on the column follows it into the donut.
    await page.keyboard.press("ArrowRight");
    await expect(mark(page, "columns", "Off target")).toBeFocused();
    await page.keyboard.press("V");
    await page.clock.runFor(REST);
    await expectLanded(page, "donut");
    await expect(mark(page, "donut", "Off target")).toBeFocused();
  });

  test("the toggle keeps focus, and V does nothing off a mark", async ({ page }) => {
    await openDemo(page, morphDemo);
    await toggle(page).focus();
    await page.keyboard.press("Enter");
    await page.clock.runFor(REST);
    await expectLanded(page, "columns");
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press("v");
    await expectLanded(page, "columns");
  });
});

/**
 * The switch's part of Chrome's own accessibility tree, as "role: name": what a screen reader can
 * reach in it. Playwright's getByRole doesn't model `inert`, which takes both views out mid-switch,
 * so this reads the tree Chrome builds.
 */
async function readable(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const roles = new Set(["group", "image", "DisclosureTriangle", "table"]);
    return nodes
      .filter((node) => !node.ignored && roles.has(String(node.role?.value)) && node.name?.value)
      .map((node) => `${String(node.role?.value)}: ${String(node.name?.value)}`)
      .filter((line) => !/^group: (Motion|Morph)$/.test(line));
  } finally {
    await cdp.detach();
  }
}

test.describe("the screen reader", () => {
  const donutView = ["group: Shot outcomes, share of total", "image: Goal: 58 shots, 14%", "image: Saved: 112 shots, 28%", "image: Off target: 149 shots, 37%", "image: Blocked: 87 shots, 21%", "DisclosureTriangle: Data table"];
  const columnsView = ["group: Shot outcomes, counts", "image: Goal: 58 shots", "image: Saved: 112 shots", "image: Off target: 149 shots", "image: Blocked: 87 shots", "DisclosureTriangle: Data table"];

  test("only the view shown can be read, and the switch announces the new one", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "It reads Chrome's accessibility tree, over CDP.");
    await openDemo(page, morphDemo);
    expect(await readable(page)).toEqual(donutView);

    await toggle(page).click();
    // Mid-switch, neither view can be read: both are inert, and the new one is hidden until it lands.
    await page.clock.runFor(300);
    expect(await readable(page)).toEqual([]);
    await page.clock.runFor(REST);
    // The announcer adds a no-break space every other time, so the same text twice is still a change.
    await expect(announcer(page)).toHaveText(/^Shot outcomes, counts\s?$/);
    expect(await readable(page)).toEqual(columnsView);

    await toggle(page).click();
    await page.clock.runFor(REST);
    await expect(announcer(page)).toHaveText(/^Shot outcomes, share of total\s?$/);
    expect(await readable(page)).toEqual(donutView);
  });
});

test.describe("the mapping control", () => {
  test("starts on morph()'s default, and a new pick rebuilds the switch in the view it was showing", async ({ page }) => {
    await openDemo(page, morphDemo);
    await expect(alignButton(page, "Unroll")).toHaveAttribute("aria-pressed", "true");
    await expect(alignButton(page, "Drop")).toHaveAttribute("aria-pressed", "false");
    await toggle(page).click();
    await page.clock.runFor(REST);

    await alignButton(page, "Drop").focus();
    await page.keyboard.press("Space");
    await expect(alignButton(page, "Drop")).toHaveAttribute("aria-pressed", "true");
    await expect(alignButton(page, "Drop")).toBeFocused();
    await morphDemo.ready(page);
    await expectLanded(page, "columns");
    await expect(toggle(page)).toHaveText("Show as donut");
    await expect(shots(page).locator(".ec-switch")).toHaveCount(1);

    // A pick mid-switch lands it where it was heading.
    await toggle(page).click();
    await page.clock.runFor(300);
    await alignButton(page, "Unroll").click();
    await morphDemo.ready(page);
    await expectLanded(page, "donut");
    await expect(toggle(page)).toHaveText("Show as columns");
  });
});
