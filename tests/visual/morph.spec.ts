// Screenshots of demo/morph.html on a stopped clock: each view in light and dark, a switch half way
// with each mapping, and the focus ring after a switch. Beside them, DOM checks: how long a switch
// takes in each mode, reduced motion, a switch back mid-way, the labels swapping their text, the
// announcement, the mapping control, only the view shown being readable, and the bars linked with the
// switch, across a switch. Then the season's switch of two line charts and columns: its views, half way
// from a line to its columns and between the two lines, and a column focused, with DOM checks for its
// toggles, V and focus following the week, Tab after a toggle landing on the week, the weeks both lines
// miss and the end dots on every frame of a switch, reduced motion and Off, and what can be read. Names start with "morph-", since screenshot names are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { FRAME, hoverShape, morphDemo, openDemo, pickMode, pointerAway, REST, tabInto } from "./demo";

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

/** The bars beside the switch, in one link() with it, and an outcome's bar there. */
const ranked = (page: Page): Locator => page.locator("#ranked");
const rankedBar = (page: Page, outcome: string): Locator => ranked(page).locator(`.ec-mark[data-key="${outcome}"]`);

/** The season's card below: its view picker and its switch of two line charts and columns. */
type SeasonView = "perMatch" | "toDate" | "columns";
const SEASON_VIEWS: readonly SeasonView[] = ["perMatch", "toDate", "columns"];
const seasonCard = (page: Page): Locator => page.locator('section[aria-labelledby="season-title"]');
const season = (page: Page): Locator => page.locator("#season");
const seasonView = (page: Page, name: SeasonView): Locator => season(page).locator(`.ec-switch-view[data-view="${name}"]`);
const seasonRuns = (page: Page): Locator => season(page).locator(".ec-switch-overlay .ec-switch-runs > .ec-run");
const seasonFades = (page: Page): Locator => season(page).locator(".ec-switch-overlay .ec-switch-fades > .ec-switch-fade");
const seasonAnnouncer = (page: Page): Locator => season(page).getByRole("status");
const seasonButton = (page: Page, name: "Per match" | "Season to date" | "Columns"): Locator => page.getByRole("group", { name: "View" }).getByRole("button", { name, exact: true });
/** A week's focus stop on a line view, and a week's column, keyed as the lines' goals points are. */
const weekStop = (page: Page, name: "perMatch" | "toDate", week: number): Locator => seasonView(page, name).locator(`.ec-column[data-key="${week}"]`);
const goalsColumn = (page: Page, week: number): Locator => seasonView(page, "columns").locator(`.ec-mark[data-key="goals@${week}"]`);

/** The season's view shown, the others inactive, and nothing in its overlay: its switch has landed there. */
async function expectSeasonLanded(page: Page, name: SeasonView): Promise<void> {
  for (const each of SEASON_VIEWS) {
    if (each === name) {
      await expect(seasonView(page, each)).not.toHaveClass(/ec-switch-inactive|ec-switching/);
      await expect(seasonView(page, each)).not.toHaveAttribute("inert");
    } else {
      await expect(seasonView(page, each)).toHaveClass(/ec-switch-inactive/);
      await expect(seasonView(page, each)).toHaveAttribute("inert", "");
    }
  }
  await expect(seasonRuns(page)).toHaveCount(0);
  await expect(seasonFades(page)).toHaveCount(0);
}

/** The keys a chart shows hovered, its own hover or a link's. */
const hot = (chart: Locator): Promise<(string | null)[]> => chart.locator(".ec-hot").evaluateAll((marks) => marks.map((mark) => mark.getAttribute("data-key")));

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
 * The groups, images, disclosures and tables Chrome's own accessibility tree has inside the elements
 * `roots` select, as "role: name": what a screen reader can reach there. Playwright's getByRole doesn't
 * model `inert`, which takes both views out mid-switch, so this reads the tree Chrome builds.
 */
async function readable(page: Page, roots: readonly string[]): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const lines: string[] = [];
    for (const selector of roots) {
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
      for (const role of ["group", "image", "DisclosureTriangle", "table"]) {
        const { nodes } = await cdp.send("Accessibility.queryAXTree", { nodeId, role });
        lines.push(...nodes.filter((node) => !node.ignored && node.name?.value).map((node) => `${String(node.role?.value)}: ${String(node.name?.value)}`));
      }
    }
    return lines;
  } finally {
    await cdp.detach();
  }
}

test.describe("the screen reader", () => {
  const donutView = ["group: Shot outcomes, share of total", "image: Goal: 58 shots, 14%", "image: Saved: 112 shots, 28%", "image: Off target: 149 shots, 37%", "image: Blocked: 87 shots, 21%", "DisclosureTriangle: Data table"];
  const columnsView = ["group: Shot outcomes, counts", "image: Goal: 58 shots", "image: Saved: 112 shots", "image: Off target: 149 shots", "image: Blocked: 87 shots", "DisclosureTriangle: Data table"];
  // The bars beside the switch, largest first, which can always be read.
  const bars = ["group: Shot outcomes, largest first", "image: Off target: 149 shots", "image: Saved: 112 shots", "image: Blocked: 87 shots", "image: Goal: 58 shots", "DisclosureTriangle: Data table"];
  /**
   * What can be read, in any order: Chrome lists the two charts' nodes interleaved, by when they were
   * made, not in the document's order. Each list says how many of each there are.
   */
  const sorted = (lines: readonly string[]): string[] => [...lines].sort();

  test("only the view shown can be read, and the switch announces the new one", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "It reads Chrome's accessibility tree, over CDP.");
    const charts = ["#shots", "#ranked"];
    await openDemo(page, morphDemo);
    expect(sorted(await readable(page, charts))).toEqual(sorted([...donutView, ...bars]));

    await toggle(page).click();
    // Mid-switch, neither view can be read: both are inert, and the new one is hidden until it lands.
    await page.clock.runFor(300);
    expect(sorted(await readable(page, charts))).toEqual(sorted(bars));
    await page.clock.runFor(REST);
    // The announcer adds a no-break space every other time, so the same text twice is still a change.
    await expect(announcer(page)).toHaveText(/^Shot outcomes, counts\s?$/);
    expect(sorted(await readable(page, charts))).toEqual(sorted([...columnsView, ...bars]));

    await toggle(page).click();
    await page.clock.runFor(REST);
    await expect(announcer(page)).toHaveText(/^Shot outcomes, share of total\s?$/);
    expect(sorted(await readable(page, charts))).toEqual(sorted([...donutView, ...bars]));
  });

  test("the season's switch: only its view shown can be read, each week named, and each view announced", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "It reads Chrome's accessibility tree, over CDP.");
    await openDemo(page, morphDemo);
    const perMatch = await readable(page, ["#season"]);
    // Its chart, each of the 38 weeks with both values or what's missing, and its table.
    expect(perMatch.filter((line) => !line.startsWith("image: "))).toEqual(["group: Goals and xG per match", "DisclosureTriangle: Data table"]);
    expect(perMatch.filter((line) => line.startsWith("image: "))).toHaveLength(38);
    expect(perMatch).toEqual(
      expect.arrayContaining(["image: Matchweek 1: 0 goals, 0.6 xG", "image: Matchweek 4: 1 goal, xG missing", "image: Matchweek 9: goals missing, xG missing", "image: Matchweek 12: 4 goals, 2.4 xG"])
    );

    await seasonButton(page, "Columns").click();
    await page.clock.runFor(300);
    expect(await readable(page, ["#season"])).toEqual([]);
    await page.clock.runFor(REST);
    await expect(seasonAnnouncer(page)).toHaveText(/^Goals per match, as columns\s?$/);
    const columns = await readable(page, ["#season"]);
    // A column for each week with goals: none for matchweeks 9 and 10.
    expect(columns.filter((line) => !line.startsWith("image: "))).toEqual(["group: Goals per match, as columns", "DisclosureTriangle: Data table"]);
    expect(columns.filter((line) => line.startsWith("image: "))).toHaveLength(36);
    expect(columns).toEqual(expect.arrayContaining(["image: Matchweek 8: 2 goals", "image: Matchweek 11: 2 goals", "image: Matchweek 12: 4 goals"]));
    expect(columns.filter((line) => /Matchweek (9|10):/.test(line))).toEqual([]);

    await seasonButton(page, "Season to date").click();
    await page.clock.runFor(REST);
    await expect(seasonAnnouncer(page)).toHaveText(/^Goals and xG, season to date\s?$/);
    expect(await readable(page, ["#season"])).toEqual(expect.arrayContaining(["group: Goals and xG, season to date", "image: Matchweek 12: 18 goals, 19.0 xG", "image: Matchweek 9: goals missing, xG missing"]));
  });
});

test.describe("the link", () => {
  test("hovering a slice hovers its bar, and a bar its slice, by the pointer and the keyboard", async ({ page }) => {
    await openDemo(page, morphDemo);
    await hoverShape(page, mark(page, "donut", "Saved").locator(".ec-slice"));
    expect(await hot(ranked(page))).toEqual(["Saved"]);
    // A linked mark shows no tooltip: the chart under the pointer has it.
    await expect(ranked(page).locator(".ec-tooltip-shown")).toHaveCount(0);
    await pointerAway(page);
    expect(await hot(ranked(page))).toEqual([]);

    await rankedBar(page, "Goal").locator(".ec-segment").hover();
    expect(await hot(view(page, "donut"))).toEqual(["Goal"]);
    // The view that isn't shown is never hovered.
    expect(await hot(view(page, "columns"))).toEqual([]);
    await pointerAway(page);
    expect(await hot(view(page, "donut"))).toEqual([]);

    // The bars are largest first, and the keys follow them.
    await tabInto(page, ranked(page));
    await expect(rankedBar(page, "Off target")).toBeFocused();
    expect(await hot(view(page, "donut"))).toEqual(["Off target"]);
    await page.keyboard.press("ArrowRight");
    await expect(rankedBar(page, "Saved")).toBeFocused();
    expect(await hot(view(page, "donut"))).toEqual(["Saved"]);
    await page.keyboard.press("Escape");
    expect(await hot(view(page, "donut"))).toEqual([]);
  });

  test("follows the switch: a held hover shows in the view that lands, the columns link back, and so does a rebuilt switch", async ({ page }) => {
    await openDemo(page, morphDemo);
    // The pointer rests on a bar while the switch is pressed from the keyboard.
    await rankedBar(page, "Blocked").locator(".ec-segment").hover();
    expect(await hot(view(page, "donut"))).toEqual(["Blocked"]);
    await toggle(page).focus();
    await page.keyboard.press("Enter");
    // Mid-switch, neither view can be reached, so neither shows it.
    await page.clock.runFor(300);
    await expectSwitching(page);
    expect([...(await hot(view(page, "donut"))), ...(await hot(view(page, "columns")))]).toEqual([]);
    await page.clock.runFor(REST);
    await expectLanded(page, "columns");
    expect(await hot(view(page, "columns"))).toEqual(["Blocked"]);
    await pointerAway(page);
    expect(await hot(view(page, "columns"))).toEqual([]);

    await mark(page, "columns", "Saved").locator(".ec-segment").hover();
    expect(await hot(ranked(page))).toEqual(["Saved"]);
    await pointerAway(page);

    // A new mapping builds the switch again, and links the new one.
    await alignButton(page, "Drop").focus();
    await page.keyboard.press("Space");
    await morphDemo.ready(page);
    await expectLanded(page, "columns");
    await mark(page, "columns", "Goal").locator(".ec-segment").hover();
    expect(await hot(ranked(page))).toEqual(["Goal"]);
    await rankedBar(page, "Off target").locator(".ec-segment").hover();
    expect(await hot(view(page, "columns"))).toEqual(["Off target"]);
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

/**
 * The most opaque any part of a line's stroke in the season's overlay is drawn now, within the weeks
 * both line views miss: goals' 9 and 10, and xG's 4, 5, 9 and 10. Each span runs between the weeks
 * either side, as far in as both views have them, less 3 px each end; a piece counts by its middle.
 */
async function inMissingWeeks(page: Page): Promise<number> {
  return season(page).evaluate((root) => {
    const x = (view: string, week: number): number => {
      const box = root.querySelector(`.ec-switch-view[data-view="${view}"] .ec-column[data-key="${week}"] .ec-hit`)!.getBoundingClientRect();
      return box.left + box.width / 2;
    };
    const span = (before: number, after: number): [number, number] => [Math.max(x("perMatch", before), x("toDate", before)) + 3, Math.min(x("perMatch", after), x("toDate", after)) - 3];
    const spans: Record<string, [number, number][]> = { goals: [span(8, 11)], xg: [span(3, 6), span(8, 11)] };
    let most = 0;
    for (const [key, ranges] of Object.entries(spans)) {
      for (const path of root.querySelectorAll<SVGPathElement>(`.ec-switch-overlay [data-key="${key}"] path`)) {
        let opacity = 1;
        for (let at: Element | null = path; at && at !== root; at = at.parentElement) opacity *= Number(at.getAttribute("opacity") ?? 1);
        const m = path.getScreenCTM()!;
        let last: DOMPoint | undefined;
        for (const [, command, px, py] of path.getAttribute("d")!.matchAll(/([ML])\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)) {
          const point = new DOMPoint(Number(px), Number(py)).matrixTransform(m);
          const middle = last ? (last.x + point.x) / 2 : point.x;
          if (command === "L" && ranges.some(([from, to]) => middle > from && middle < to)) most = Math.max(most, opacity);
          last = point;
        }
      }
    }
    return most;
  });
}

test.describe("the season's switch", () => {
  test("the views at rest, each picked with focus kept on its toggle, and announced", async ({ page }) => {
    await openDemo(page, morphDemo);
    await expect(page.getByRole("group", { name: "View" }).getByRole("button")).toHaveText(["Per match", "Season to date", "Columns"]);
    await expect(seasonButton(page, "Per match")).toHaveAttribute("aria-pressed", "true");
    await expectSeasonLanded(page, "perMatch");

    for (const [name, view, label, picture] of [
      ["Season to date", "toDate", "Goals and xG, season to date", "morph-season-to-date.png"],
      ["Columns", "columns", "Goals per match, as columns", "morph-season-columns.png"],
      ["Per match", "perMatch", "Goals and xG per match", undefined]
    ] as const) {
      await seasonButton(page, name).focus();
      await page.keyboard.press("Space");
      await expect(seasonButton(page, name)).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("group", { name: "View" }).locator('button[aria-pressed="true"]')).toHaveCount(1);
      await page.clock.runFor(REST);
      await expectSeasonLanded(page, view);
      await expect(seasonButton(page, name)).toBeFocused();
      // The announcer adds a no-break space every other time, so the same text twice is still a change.
      await expect(seasonAnnouncer(page)).toHaveText(new RegExp(`^${label}\\s?$`));
      if (picture) await expect(season(page)).toHaveScreenshot(picture);
    }
    // Tab from the toggles goes into the view on show, and only that one.
    await tabInto(page, season(page));
    await expect(weekStop(page, "perMatch", 1)).toBeFocused();
  });

  test("half way from a line to its columns, and between the two lines", async ({ page }) => {
    await openDemo(page, morphDemo);
    await seasonButton(page, "Columns").click();
    await pointerAway(page);
    // 472 ms in: each column half grown out of its point, and the lines faded out.
    await page.clock.runFor(475);
    await expect(seasonView(page, "perMatch")).toHaveClass(/ec-switching/);
    await expect(seasonView(page, "columns")).toHaveClass(/ec-switching/);
    // A pair for each column and its point, and the two lines fading, with no partner; xG's points
    // aren't drawn, so nothing of them fades.
    await expect(seasonRuns(page)).toHaveCount(36);
    await expect(seasonFades(page)).toHaveCount(2);
    await expect(seasonFades(page).nth(0)).toHaveAttribute("data-key", "goals");
    await expect(seasonFades(page).nth(1)).toHaveAttribute("data-key", "xg");
    await expect(season(page)).toHaveScreenshot("morph-season-half-columns.png");
    await page.clock.runFor(REST);
    await expectSeasonLanded(page, "columns");

    await seasonButton(page, "Per match").click();
    await page.clock.runFor(REST);
    await seasonButton(page, "Season to date").click();
    await pointerAway(page);
    await page.clock.runFor(475);
    // Only the lines morph: the two charts' points aren't drawn, so they aren't played.
    await expect(seasonRuns(page)).toHaveCount(2);
    await expect(seasonFades(page)).toHaveCount(0);
    await expect(season(page)).toHaveScreenshot("morph-season-half-lines.png");
    await page.clock.runFor(REST);
    await expectSeasonLanded(page, "toDate");
  });

  test("a switch between the two lines draws nothing in the weeks both miss, on any frame, and each line keeps its end dot", async ({ page }) => {
    await openDemo(page, morphDemo);
    for (const [to, view] of [["Season to date", "toDate"], ["Per match", "perMatch"]] as const) {
      await seasonButton(page, to).click();
      await pointerAway(page);
      const frames: number[] = [];
      const dots: number[] = [];
      // 950 ms: the last frame drawn is 944 ms in, the 59th.
      for (let frame = 1; frame <= 59; frame++) {
        await page.clock.runFor(FRAME);
        frames.push(await inMissingWeeks(page));
        dots.push(await season(page).locator(".ec-switch-overlay circle.ec-switch-end").count());
      }
      // The two lines pair by week, so their gaps meet: nothing crosses the weeks both miss, not even fading.
      expect(Math.max(...frames)).toBeLessThan(0.05);
      // Each line's end dot moves with it.
      expect(dots).toEqual(frames.map(() => 2));
      await page.clock.runFor(REST);
      await expectSeasonLanded(page, view);
    }
  });

  test("after a pick on the toggles, Tab lands on the same week in the new view, or its column", async ({ page }) => {
    await openDemo(page, morphDemo);
    await tabInto(page, season(page));
    for (let i = 1; i < 12; i++) await page.keyboard.press("ArrowRight");
    await expect(weekStop(page, "perMatch", 12)).toBeFocused();

    // Back to the toggles, Season to date, and Tab past Columns into the view: the same week, read with its values.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(seasonButton(page, "Season to date")).toBeFocused();
    await page.keyboard.press("Space");
    await page.clock.runFor(REST);
    await expectSeasonLanded(page, "toDate");
    await expect(seasonButton(page, "Season to date")).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(weekStop(page, "toDate", 12)).toBeFocused();
    await expect(weekStop(page, "toDate", 12)).toHaveAttribute("aria-label", "Matchweek 12: 18 goals, 19.0 xG");

    // To the columns: its goals' column.
    await page.keyboard.press("Shift+Tab");
    await expect(seasonButton(page, "Columns")).toBeFocused();
    await page.keyboard.press("Space");
    await page.clock.runFor(REST);
    await expectSeasonLanded(page, "columns");
    await page.keyboard.press("Tab");
    await expect(goalsColumn(page, 12)).toBeFocused();
    await expect(goalsColumn(page, 12)).toHaveAttribute("aria-label", "Matchweek 12: 4 goals");
    await expect(seasonView(page, "columns").locator(".ec-focus")).not.toHaveAttribute("visibility", "hidden");

    // And back to Per match, from the column: its week.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(seasonButton(page, "Per match")).toBeFocused();
    await page.keyboard.press("Enter");
    await page.clock.runFor(REST);
    await expectSeasonLanded(page, "perMatch");
    for (let presses = 0; presses < 3; presses++) await page.keyboard.press("Tab");
    await expect(weekStop(page, "perMatch", 12)).toBeFocused();
    await expect(weekStop(page, "perMatch", 12)).toHaveAttribute("aria-label", "Matchweek 12: 4 goals, 2.4 xG");

    // With motion off the stop moves at once.
    await pickMode(page, "Off");
    await seasonButton(page, "Season to date").click();
    await expectSeasonLanded(page, "toDate");
    await expect(weekStop(page, "toDate", 12)).toHaveAttribute("tabindex", "0");
  });

  test("V on a week or a column goes to the next view, and focus follows the week", async ({ page }) => {
    await openDemo(page, morphDemo);
    await tabInto(page, season(page));
    await expect(weekStop(page, "perMatch", 1)).toBeFocused();
    for (let i = 1; i < 12; i++) await page.keyboard.press("ArrowRight");
    await expect(weekStop(page, "perMatch", 12)).toBeFocused();

    // A week on one line to the same week on the other.
    await page.keyboard.press("v");
    await expect(seasonButton(page, "Season to date")).toHaveAttribute("aria-pressed", "true");
    await page.clock.runFor(REST);
    await expectSeasonLanded(page, "toDate");
    await expect(weekStop(page, "toDate", 12)).toBeFocused();

    // A week to its goals' column, with the focus ring.
    await page.keyboard.press("V");
    await page.clock.runFor(REST);
    await expectSeasonLanded(page, "columns");
    await expect(goalsColumn(page, 12)).toBeFocused();
    await expect(seasonView(page, "columns").locator(".ec-focus")).not.toHaveAttribute("visibility", "hidden");
    await expect(season(page)).toHaveScreenshot("morph-season-focus-column.png");

    // And the column back to its week.
    await page.keyboard.press("v");
    await page.clock.runFor(REST);
    await expectSeasonLanded(page, "perMatch");
    await expect(weekStop(page, "perMatch", 12)).toBeFocused();

    // A week the feed missed has no column: focus goes to the first.
    for (let i = 12; i > 9; i--) await page.keyboard.press("ArrowLeft");
    await expect(weekStop(page, "perMatch", 9)).toBeFocused();
    await page.keyboard.press("v");
    await page.clock.runFor(REST);
    await expect(weekStop(page, "toDate", 9)).toBeFocused();
    await page.keyboard.press("v");
    await page.clock.runFor(REST);
    await expect(goalsColumn(page, 1)).toBeFocused();

    // V on a toggle does nothing.
    await seasonButton(page, "Columns").focus();
    await page.keyboard.press("v");
    await expectSeasonLanded(page, "columns");
  });

  test("reduced motion: a switch lands at once, focus following the week, until the viewer picks a mode", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, morphDemo);
    await seasonButton(page, "Columns").click();
    // No time passes.
    await expectSeasonLanded(page, "columns");
    await seasonButton(page, "Season to date").click();
    await expectSeasonLanded(page, "toDate");
    await tabInto(page, season(page));
    for (let i = 1; i < 12; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("v");
    await expectSeasonLanded(page, "columns");
    await expect(goalsColumn(page, 12)).toBeFocused();

    // The viewer's own pick overrides the device's setting.
    await pickMode(page, "Presentation");
    await seasonButton(page, "Per match").click();
    await expect(seasonRuns(page)).toHaveCount(36);
    await page.clock.runFor(REST);
    await expectSeasonLanded(page, "perMatch");
  });

  test("Off: a switch lands at once, each way", async ({ page }) => {
    await openDemo(page, morphDemo);
    await pickMode(page, "Off");
    for (const [name, view] of [["Columns", "columns"], ["Per match", "perMatch"], ["Season to date", "toDate"], ["Per match", "perMatch"]] as const) {
      await seasonButton(page, name).click();
      await expectSeasonLanded(page, view);
    }
  });
});
