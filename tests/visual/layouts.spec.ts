// Screenshots of demo/layouts.html on a stopped clock: the page as it loads, each card's views at rest in
// light and dark and at 320 px, each morph half way, the bars' jump of two at the end of its first leg
// and part way through its second, and a mark focused after V. Beside them, DOM checks: nothing moving
// at load, no D3 mark or named label drawn in either view while the overlay draws them, each pair in its
// colour, the areas' weeks on their x's, the guides the page names drawn as at rest on every frame where
// both views draw them the same (pixel for pixel, in every browser), the dumbbell's link and its lines'
// colour, one announcement for a jump, the toggle buttons and focus, V with focus and the ring following
// its key, a resize mid-switch, reduced motion and Off (part way through a jump too), and what can be
// read. And the treemap's drill-down: a position's view at rest, the jump in each leg, its two rows of
// buttons, a click, Enter and Escape on a tile, a position from the bars and from another position.
// Names start with "layouts-", since screenshot names are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { FRAME, layoutsDemo, openDemo, pickMode, pointerAway, REST, tabInto } from "./demo";

type CardId = "bars" | "areas" | "radar" | "treemap" | "dumbbell";

interface Card {
  /** The views, the first the one it loads in, each with its button's name and its <svg>'s, which the switch announces. */
  readonly views: readonly { readonly view: string; readonly button: string; readonly name: string }[];
  /** Its marks in each view. */
  readonly marks: number;
}

const CARDS: Readonly<Record<CardId, Card>> = {
  bars: {
    views: [
      { view: "side", button: "Side by side", name: "Goals and assists by player on D3 bars, side by side" },
      { view: "stacked", button: "Stacked", name: "Goals and assists by player on D3 bars, stacked" },
      { view: "share", button: "100%", name: "Goals and assists by player on D3 bars, as shares of 100%" }
    ],
    marks: 16
  },
  areas: {
    views: [
      { view: "stacked", button: "Stacked", name: "Shots on and off target per match on a D3 area, stacked" },
      { view: "share", button: "100%", name: "Shots on and off target per match on a D3 area, as shares of 100%" }
    ],
    marks: 2
  },
  radar: {
    views: [
      { view: "radar", button: "Radar", name: "Okafor against the league average per 90 minutes on a D3 radar" },
      { view: "bars", button: "Bars", name: "Okafor against the league average per 90 minutes on D3 bars, as percentiles" }
    ],
    marks: 12
  },
  treemap: {
    views: [
      { view: "treemap", button: "Treemap", name: "The season's 58 goals by scorer and position on a D3 treemap" },
      { view: "bars", button: "Bars", name: "The season's 58 goals by scorer on D3 bars, most first" }
    ],
    marks: 12
  },
  dumbbell: {
    views: [
      { view: "dumbbell", button: "Dumbbell", name: "Goals in each half by player on a D3 dumbbell" },
      { view: "bars", button: "Bars", name: "Goals in each half by player on D3 bars, side by side" }
    ],
    // Each half's dots, which take the keyboard; the lines between them aren't named.
    marks: 16
  }
};
const IDS = Object.keys(CARDS) as CardId[];
/** A viewport tall enough for the page in one column at 320 px: about 7,000 px. */
const NARROW_HEIGHT = 7600;

const card = (page: Page, id: CardId): Locator => page.locator(`section[aria-labelledby="${id}-title"]`);
const chart = (page: Page, id: CardId): Locator => page.locator(`#${id}`);
const view = (page: Page, id: CardId, name: string): Locator => chart(page, id).locator(`.ec-switch-view[data-view="${name}"]`);
/** Each pair's morph in the switch's overlay. */
const runs = (page: Page, id: CardId): Locator => chart(page, id).locator(".ec-switch-overlay .ec-switch-runs > .ec-run");
const button = (page: Page, id: CardId, name: string): Locator => card(page, id).getByRole("button", { name, exact: true });
const announcer = (page: Page, id: CardId): Locator => chart(page, id).getByRole("status");
/** The D3 charts' marks and the labels the page names, as the D3 code drew them: the dumbbell's lines too, which fade. */
const HOST_PARTS = "svg :is(rect.segment, rect.bar, rect.tile, path.band, circle.value, circle.dot, line.connector, text.axis-name, text.host-label, text.host-value, text.name, text.value)";
/** A view's marks: the elements expressive() names. */
const marks = (page: Page, id: CardId, name: string): Locator => view(page, id, name).locator('svg [role="img"]');
/** The last button before a card's chart, where Tab goes into it: the treemap's positions come after its Treemap and Bars. */
const lastButton = (page: Page, id: CardId): Locator => button(page, id, id === "treemap" ? "Defenders" : CARDS[id].views[CARDS[id].views.length - 1]!.button);

/** The announcer's words, as a regular expression: it adds a no-break space every other time, so the same text twice is still a change. */
const said = (name: string): RegExp => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\%]/g, "\\$&")}\\s?$`);

/** Each of a card's views' marks and named labels, each as whether it's drawn now. */
async function drawn(page: Page, id: CardId): Promise<Record<string, boolean[]>> {
  return chart(page, id).evaluate(
    (root, selector) =>
      Object.fromEntries(
        [...root.querySelectorAll<HTMLElement>(":scope .ec-switch-view")].map((container) => [
          container.dataset.view!,
          [...container.querySelectorAll(selector)].map((part) => getComputedStyle(part).visibility === "visible")
        ])
      ),
    HOST_PARTS
  );
}

/** The view shown, the others inactive, its marks and labels drawn, its button pressed, and nothing in the overlay: the switch has landed there. */
async function expectLanded(page: Page, id: CardId, name: string): Promise<void> {
  for (const { view: each, button: label } of CARDS[id].views) {
    if (each === name) {
      await expect(view(page, id, each)).not.toHaveClass(/ec-switch-inactive|ec-switching/);
      await expect(view(page, id, each)).not.toHaveAttribute("inert");
      await expect(view(page, id, each)).not.toHaveAttribute("aria-hidden");
      await expect(button(page, id, label)).toHaveAttribute("aria-pressed", "true");
    } else {
      await expect(view(page, id, each)).toHaveClass(/ec-switch-inactive/);
      await expect(view(page, id, each)).toHaveAttribute("inert", "");
      await expect(view(page, id, each)).toHaveAttribute("aria-hidden", "true");
      await expect(button(page, id, label)).toHaveAttribute("aria-pressed", "false");
    }
  }
  await expect(runs(page, id)).toHaveCount(0);
  const parts = (await drawn(page, id))[name]!;
  expect(parts.length).toBeGreaterThan(0);
  expect(parts.every(Boolean), `${id}: ${name}'s marks and labels drawn`).toBe(true);
}

/** Each of a view's marks' fill by key, as the page's CSS colours it, the key read from its D3 row. */
async function hostColours(page: Page, id: CardId, name: string): Promise<Record<string, string>> {
  return marks(page, id, name).evaluateAll((elements) =>
    Object.fromEntries(
      elements.map((element) => {
        const d = (element as unknown as { __data__: Record<string, unknown> & { data?: { name: string } } }).__data__;
        const key = element.matches("rect.segment")
          ? `${d.series}@${d.player}`
          : element.matches("path.band")
            ? String(d.series)
            : element.matches("rect.tile")
              ? d.data!.name
              : d.half !== undefined
                ? `${d.half}@${d.name}`
                : d.label !== undefined
                  ? `${d.series}@${d.label}`
                  : String(d.name);
        return [key, getComputedStyle(element).fill];
      })
    )
  );
}

/** Each pair's morph's fill in the overlay, by key. */
async function runColours(page: Page, id: CardId): Promise<Record<string, string>> {
  return runs(page, id).evaluateAll((groups) => Object.fromEntries(groups.map((group) => [group.getAttribute("data-key") ?? "", getComputedStyle(group.querySelector("path")!).fill])));
}

/** Whether a view shows a focus ring: one of its <svg>'s rings, drawn. */
async function ringShown(container: Locator): Promise<boolean> {
  return container.evaluate((root) =>
    [...root.querySelectorAll(".ec-focus-ring")].some((ring) => {
      const box = ring.getBoundingClientRect();
      return getComputedStyle(ring).visibility === "visible" && (box.width > 0 || box.height > 0);
    })
  );
}

/** The focused element's key, read from its D3 row as hostColours reads it, and the view it's in. */
async function focusedKey(page: Page): Promise<{ readonly view: string | undefined; readonly key: string; readonly label: string | null }> {
  return page.evaluate(() => {
    const element = document.activeElement!;
    const d = (element as unknown as { __data__?: Record<string, unknown> & { data?: { name: string } } }).__data__ ?? {};
    const key = element.matches("rect.segment")
      ? `${d.series}@${d.player}`
      : element.matches("path.band")
        ? String(d.series)
        : element.matches("rect.tile")
          ? d.data!.name
          : d.half !== undefined
            ? `${d.half}@${d.name}`
            : d.label !== undefined
              ? `${d.series}@${d.label}`
              : String(d.name);
    return { view: element.closest<HTMLElement>(".ec-switch-view")?.dataset.view, key, label: element.getAttribute("aria-label") };
  });
}

/** Records every change to a card's live region from now on, in the page. */
async function listen(page: Page, id: CardId): Promise<void> {
  await announcer(page, id).evaluate((region) => {
    const heard: string[] = [];
    (window as unknown as { heard: Record<string, string[]> }).heard = { ...(window as unknown as { heard?: Record<string, string[]> }).heard, [region.closest(".switch")!.id]: heard };
    new MutationObserver(() => {
      const text = region.textContent?.trim() ?? "";
      if (text) heard.push(text);
    }).observe(region, { childList: true, characterData: true, subtree: true });
  });
}
const heard = (page: Page, id: CardId): Promise<string[]> => page.evaluate((key) => (window as unknown as { heard: Record<string, string[]> }).heard[key] ?? [], id);

/** Presses a card's button, moves the pointer off it, and lets the switch land. */
async function show(page: Page, id: CardId, label: string): Promise<void> {
  await button(page, id, label).click();
  await pointerAway(page);
  await page.clock.runFor(REST);
}

/**
 * Opens the page and loads it again once openDemo has stopped the clock, as bars.spec.ts does: the
 * page as it loads, with no frame run.
 */
async function openLoading(page: Page): Promise<void> {
  await openDemo(page, layoutsDemo);
  await page.reload();
  await layoutsDemo.ready(page);
}

test.describe("at load", () => {
  test("each card loads at rest in its first view, nothing announced, and nothing moves", async ({ page }) => {
    await openLoading(page);
    for (const id of IDS) {
      await expectLanded(page, id, CARDS[id].views[0]!.view);
      await expect(announcer(page, id)).toHaveText("");
    }
    await expect(page).toHaveScreenshot("layouts-load.png", { fullPage: true });
    const atLoad = await page.locator("main").innerHTML();
    await page.clock.runFor(REST);
    expect(await page.locator("main").innerHTML()).toBe(atLoad);
  });
});

test.describe("each view at rest", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const id of IDS) {
      test(`the ${id} card's views, each announced, ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await openDemo(page, layoutsDemo);
        const views = CARDS[id].views;
        await expectLanded(page, id, views[0]!.view);
        await expect(card(page, id)).toHaveScreenshot(`layouts-${id}-${views[0]!.view}-${colorScheme}.png`);
        for (const { view: name, button: label, name: words } of [...views.slice(1), views[0]!]) {
          await show(page, id, label);
          await expectLanded(page, id, name);
          await expect(announcer(page, id)).toHaveText(said(words));
          if (name !== views[0]!.view) await expect(card(page, id)).toHaveScreenshot(`layouts-${id}-${name}-${colorScheme}.png`);
        }
      });
    }
  }

  for (const id of IDS) {
    test(`at 320 px, the ${id} card's views each fit their card`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: NARROW_HEIGHT });
      await openDemo(page, layoutsDemo);
      for (const [i, { view: name, button: label }] of CARDS[id].views.entries()) {
        if (i > 0) await show(page, id, label);
        await expectLanded(page, id, name);
        const sizes = await view(page, id, name).evaluate((container) => ({ svg: container.querySelector("svg")!.getBoundingClientRect().width, card: container.closest(".card")!.getBoundingClientRect().width }));
        expect(sizes.svg).toBeLessThanOrEqual(sizes.card - 40);
        await expect(card(page, id)).toHaveScreenshot(`layouts-${id}-${name}-320.png`);
      }
    });
  }
});

test.describe("half way", () => {
  const morphs: readonly { readonly id: CardId; readonly from: string; readonly to: string; readonly picture: string }[] = [
    { id: "bars", from: "side", to: "stacked", picture: "layouts-bars-stacked-half.png" },
    { id: "bars", from: "stacked", to: "share", picture: "layouts-bars-share-half.png" },
    { id: "areas", from: "stacked", to: "share", picture: "layouts-areas-half.png" },
    { id: "radar", from: "radar", to: "bars", picture: "layouts-radar-half.png" },
    { id: "treemap", from: "treemap", to: "bars", picture: "layouts-treemap-half.png" },
    { id: "dumbbell", from: "dumbbell", to: "bars", picture: "layouts-dumbbell-half.png" }
  ];
  for (const { id, from, to, picture } of morphs) {
    test(`the ${id} from ${from} to ${to}: no D3 mark or named label drawn in either view, each pair in its own colour`, async ({ page }) => {
      await openDemo(page, layoutsDemo);
      const label = (name: string): string => CARDS[id].views.find((v) => v.view === name)!.button;
      if (from !== CARDS[id].views[0]!.view) await show(page, id, label(from));
      // One palette by series or position: each mark has its partner's colour.
      const colours = await hostColours(page, id, from);
      expect(Object.keys(colours)).toHaveLength(CARDS[id].marks);
      expect(await hostColours(page, id, to)).toEqual(colours);

      await button(page, id, label(to)).click();
      await pointerAway(page);
      // 472 ms in, the last frame before half way.
      await page.clock.runFor(475);
      await expect(view(page, id, from)).toHaveClass(/ec-switching/);
      await expect(view(page, id, to)).toHaveClass(/ec-switching/);
      await expect(runs(page, id)).toHaveCount(CARDS[id].marks);
      expect(await runColours(page, id)).toEqual(colours);
      const parts = await drawn(page, id);
      for (const name of [from, to]) expect(parts[name]!.some(Boolean), `${name}: a D3 part drawn`).toBe(false);
      await expect(chart(page, id)).toHaveScreenshot(picture);
      await page.clock.runFor(REST);
      await expectLanded(page, id, to);
    });
  }

  test("the areas: each week's top and bottom stay on the week's x on every frame", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    // Each week's x on screen, from the stacked band's path: d3.area()'s points along its top, where each
    // curve piece ends, before the line down to its bottom.
    const weeks = await view(page, "areas", "stacked")
      .locator("path.band-offTarget")
      .evaluate((path) => {
        const numbers = (path.getAttribute("d")!.split("L")[0]!.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
        const matrix = (path as SVGGraphicsElement).getScreenCTM()!;
        const xs = new Set<number>();
        // M x,y, then each C's three points: its end is a week's.
        for (let i = 0; i + 1 < numbers.length; i += 2) {
          const point = new DOMPoint(numbers[i], numbers[i + 1]).matrixTransform(matrix);
          if (i === 0 || (i / 2) % 3 === 0) xs.add(Math.round(point.x * 100) / 100);
        }
        return [...xs].sort((a, b) => a - b);
      });
    expect(weeks).toHaveLength(38);
    await button(page, "areas", "100%").click();
    await pointerAway(page);
    /** Each run's points' x's on screen, in order. */
    const frame = (): Promise<Record<string, number[]>> =>
      runs(page, "areas").evaluateAll((groups) =>
        Object.fromEntries(
          groups.map((group) => {
            const path = group.querySelector("path")!;
            const numbers = (path.getAttribute("d")!.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
            const matrix = path.getScreenCTM()!;
            const xs: number[] = [];
            for (let i = 0; i + 1 < numbers.length; i += 2) xs.push(new DOMPoint(numbers[i], numbers[i + 1]).matrixTransform(matrix).x);
            return [group.getAttribute("data-key")!, xs];
          })
        )
      );
    await page.clock.runFor(FRAME);
    const first = await frame();
    expect(Object.keys(first).sort()).toEqual(["offTarget", "onTarget"]);
    for (const [key, xs] of Object.entries(first)) {
      for (const x of weeks) expect(xs.filter((each) => Math.abs(each - x) < 0.02).length, `${key}: the week at ${x}`).toBeGreaterThanOrEqual(2);
    }
    for (const ms of [300, 300]) {
      await page.clock.runFor(ms);
      const now = await frame();
      for (const [key, xs] of Object.entries(now)) {
        expect(xs.length).toBe(first[key]!.length);
        expect(Math.max(...xs.map((x, i) => Math.abs(x - first[key]![i]!))), `${key}: how far a point moved across`).toBeLessThan(0.02);
      }
    }
    await page.clock.runFor(REST);
    await expectLanded(page, "areas", "share");
  });

  /**
   * Each switch whose two views draw a guide the same, and the parts of the views to hide so the
   * guides are all that's left: the plots, with their marks and labels, and the areas' counts and grid,
   * which fade. The overlay's pairs, fades and labels are hidden too.
   */
  const kept: readonly { readonly id: CardId; readonly from: string; readonly to: string; readonly others: string }[] = [
    { id: "bars", from: "side", to: "stacked", others: ".bars-plot" },
    { id: "bars", from: "stacked", to: "side", others: ".bars-plot" },
    { id: "areas", from: "stacked", to: "share", others: ".areas-plot, .y-tick, .grid" },
    { id: "dumbbell", from: "dumbbell", to: "bars", others: ".plot" },
    { id: "dumbbell", from: "bars", to: "dumbbell", others: ".plot" }
  ];
  for (const { id, from, to, others } of kept) {
    test(`the ${id} from ${from} to ${to}: the guides both draw the same, on every frame as at rest, pixel for pixel`, async ({ page }) => {
      await openDemo(page, layoutsDemo);
      const label = (name: string): string => CARDS[id].views.find((v) => v.view === name)!.button;
      if (from !== CARDS[id].views[0]!.view) await show(page, id, label(from));
      const style = await page.addStyleTag({ content: `#${id} :is(${others}, .ec-switch-runs, .ec-switch-fades, .ec-switch-labels) { display: none !important; }` });
      const clip = (await view(page, id, from).locator("svg").boundingBox())!;
      const rest = await page.screenshot({ clip });
      await button(page, id, label(to)).click();
      await pointerAway(page);
      // Each copy is in the overlay, and the host's own guides hidden in both views.
      await expect(chart(page, id).locator(".ec-switch-guides > .ec-switch-guide").first()).toBeAttached();
      const moved: number[] = [];
      let at = 0;
      // From the click to 939 ms, before it lands at 950, through half way, where the copies swap.
      for (const step of [0, FRAME, 144, 160, 155, 16, 16, 160, 160, 112]) {
        await page.clock.runFor(step);
        at += step;
        if (!(await page.screenshot({ clip })).equals(rest)) moved.push(at);
      }
      expect(moved, "the frames where the guides weren't drawn as at rest").toEqual([]);
      await expect(view(page, id, to)).toHaveClass(/ec-switching/);
      await style.evaluate((element) => (element as Element).remove());
      await page.clock.runFor(REST);
      await expectLanded(page, id, to);
    });
  }

  test("the bars from stacked to 100%: the axis, on another scale, fades with each view, gone by half way", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await show(page, "bars", "Stacked");
    await button(page, "bars", "100%").click();
    await pointerAway(page);
    /** Each guide's copy, the old view's then the new view's, with its opacity, and each view's container's. */
    const now = async (): Promise<{ copies: string[]; views: string[] }> => ({
      copies: await chart(page, "bars")
        .locator(".ec-switch-guides > .ec-switch-guide")
        .evaluateAll((groups) => groups.map((group) => `${group.getAttribute("data-key")} ${group.getAttribute("opacity")}`)),
      views: await Promise.all(["stacked", "share"].map((name) => view(page, "bars", name).evaluate((container, key) => `axis@${key} ${container.style.opacity}`, name === "share" ? "share" : "count")))
    });
    await page.clock.runFor(160);
    const part = await now();
    expect(part.copies).toEqual(part.views);
    expect(part.copies[0]).not.toMatch(/ (0|1)$/);
    await page.clock.runFor(315);
    expect((await now()).copies).toEqual(["axis@count 0", "axis@share 0"]);
    await page.clock.runFor(REST);
    await expectLanded(page, "bars", "share");
  });
});

test.describe("the dumbbell's link", () => {
  /** The players whose dots and lines aren't dimmed. */
  const lit = (page: Page): Promise<string[]> =>
    view(page, "dumbbell", "dumbbell")
      .locator("circle.dot, line.connector")
      .evaluateAll((parts) => [...new Set(parts.filter((part) => !part.classList.contains("ec-dimmed")).map((part) => (part as unknown as { __data__: { name: string } }).__data__.name))].sort());
  /** The lines whose hover arrow is drawn, each with its run's colour. */
  const arrows = (page: Page): Promise<{ readonly key: string; readonly colour: string }[]> =>
    view(page, "dumbbell", "dumbbell")
      .locator('.ec-run.ec-hot[data-slot="hover"]')
      .evaluateAll((runs) =>
        runs.filter((run) => run.querySelector('.ec-icon[data-icon="arrow"]')).map((run) => ({ key: run.getAttribute("data-key") ?? "", colour: getComputedStyle(run).getPropertyValue("--ec-mark").trim() }))
      );

  test("a dot lights its row and its line shows its arrow in the line's colour, before a switch and after one there and back", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    const dumbbell = view(page, "dumbbell", "dumbbell");
    // Each line's colour at rest: hovered, it takes its strong colour.
    const strokes = await dumbbell.locator("line.connector").evaluateAll((lines) => Object.fromEntries(lines.map((line) => [(line as unknown as { __data__: { name: string } }).__data__.name, getComputedStyle(line).stroke])));
    // Okafor's first half, in the last row; then Tanaka's second, in the third.
    for (const [dot, name] of [
      [dumbbell.locator("circle.dot-first").nth(7), "Okafor"],
      [dumbbell.locator("circle.dot-second").nth(2), "Tanaka"]
    ] as const) {
      if (name === "Tanaka") {
        await show(page, "dumbbell", "Bars");
        await show(page, "dumbbell", "Dumbbell");
        expect(await lit(page)).toHaveLength(8);
      }
      await dot.hover();
      await page.clock.runFor(400);
      expect(await lit(page)).toEqual([name]);
      expect(await arrows(page)).toEqual([{ key: name, colour: strokes[name] }]);
      expect(strokes[name]).not.toBe("rgb(0, 0, 0)");
      await pointerAway(page);
      await page.clock.runFor(REST);
    }
  });

  test("its lines fade in their own colour as it turns into bars, not in black", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    const strokes = await view(page, "dumbbell", "dumbbell")
      .locator("line.connector")
      .evaluateAll((lines) => Object.fromEntries(lines.map((line) => [(line as unknown as { __data__: { name: string } }).__data__.name, getComputedStyle(line).stroke])));
    await button(page, "dumbbell", "Bars").click();
    await pointerAway(page);
    await page.clock.runFor(160);
    const fades = await chart(page, "dumbbell")
      .locator(".ec-switch-fades > .ec-switch-fade")
      .evaluateAll((groups) =>
        Object.fromEntries(
          groups.map((group) => {
            const path = getComputedStyle(group.querySelector("path")!);
            return [group.getAttribute("data-key") ?? "", { stroke: path.stroke, fill: path.fill, opacity: Number(group.getAttribute("opacity")) }];
          })
        )
      );
    expect(Object.keys(fades).sort()).toEqual(Object.keys(strokes).sort());
    for (const [key, fade] of Object.entries(fades)) {
      expect(fade, key).toMatchObject({ stroke: strokes[key], fill: "none" });
      expect(fade.opacity, key).toBeGreaterThan(0);
    }
    await page.clock.runFor(REST);
    await expectLanded(page, "dumbbell", "bars");
  });
});

test.describe("the bars' jump of two", () => {
  test("100% from side by side goes through Stacked, two switches of 950 ms, and is announced once", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await listen(page, "bars");
    await button(page, "bars", "100%").click();
    await pointerAway(page);
    // The view it's heading for is pressed from the start.
    await expect(button(page, "bars", "100%")).toHaveAttribute("aria-pressed", "true");
    await expect(button(page, "bars", "Stacked")).toHaveAttribute("aria-pressed", "false");
    // 944 ms: the last frame of the first leg, the segments all but stacked.
    await page.clock.runFor(944);
    await expect(view(page, "bars", "side")).toHaveClass(/ec-switching/);
    await expect(view(page, "bars", "stacked")).toHaveClass(/ec-switching/);
    await expect(runs(page, "bars")).toHaveCount(16);
    await expect(chart(page, "bars")).toHaveScreenshot("layouts-bars-jump-first.png");
    // The first lands on Stacked unannounced, and the second plays from there to 100%.
    await page.clock.runFor(FRAME + 475);
    await expect(view(page, "bars", "side")).toHaveClass(/ec-switch-inactive/);
    await expect(view(page, "bars", "stacked")).toHaveClass(/ec-switching/);
    await expect(view(page, "bars", "share")).toHaveClass(/ec-switching/);
    await expect(runs(page, "bars")).toHaveCount(16);
    expect((await drawn(page, "bars")).share!.some(Boolean)).toBe(false);
    await expect(chart(page, "bars")).toHaveScreenshot("layouts-bars-jump-second.png");
    expect(await heard(page, "bars")).toEqual([]);
    await page.clock.runFor(REST);
    await expectLanded(page, "bars", "share");
    expect(await heard(page, "bars")).toEqual([CARDS.bars.views[2]!.name]);

    // And back through Stacked, announced once more: 1.9 s in all.
    await button(page, "bars", "Side by side").click();
    await pointerAway(page);
    await page.clock.runFor(1904);
    await expect(runs(page, "bars")).toHaveCount(16);
    await page.clock.runFor(2 * FRAME);
    await expectLanded(page, "bars", "side");
    expect(await heard(page, "bars")).toEqual([CARDS.bars.views[2]!.name, CARDS.bars.views[0]!.name]);
  });

  test("in Analysis, a jump of two goes straight there in a fifth of a second", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await pickMode(page, "Analysis");
    await listen(page, "bars");
    await button(page, "bars", "100%").click();
    await pointerAway(page);
    await expect(view(page, "bars", "stacked")).toHaveClass(/ec-switch-inactive/);
    await expect(view(page, "bars", "share")).toHaveClass(/ec-switching/);
    await page.clock.runFor(208);
    await expectLanded(page, "bars", "share");
    expect(await heard(page, "bars")).toEqual([CARDS.bars.views[2]!.name]);
  });
});

test.describe("the buttons and V", () => {
  test("each card's buttons are toggle buttons in a named group, pressed for the view the switch is heading for, and keep focus", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    for (const id of IDS) {
      const group = card(page, id).getByRole("group", { name: "Show" });
      await expect(group.getByRole("button")).toHaveText(CARDS[id].views.map((v) => v.button));
      const [first, second] = CARDS[id].views;
      await button(page, id, first!.button).focus();
      await page.keyboard.press("Tab");
      await expect(button(page, id, second!.button)).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(button(page, id, second!.button)).toHaveAttribute("aria-pressed", "true");
      await expect(button(page, id, first!.button)).toHaveAttribute("aria-pressed", "false");
      // Back part way: the switch reverses, and the first is pressed again.
      await page.clock.runFor(300);
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Space");
      await expect(button(page, id, first!.button)).toHaveAttribute("aria-pressed", "true");
      await expect(button(page, id, first!.button)).toBeFocused();
      await page.clock.runFor(REST);
      await expectLanded(page, id, first!.view);
      // V does nothing on a button.
      await page.keyboard.press("v");
      await expectLanded(page, id, first!.view);
    }
  });

  test("V on a focused segment goes side by side → stacked → 100% → side by side, the last through Stacked, focus and the ring following its key", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await button(page, "bars", "100%").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const start = await focusedKey(page);
    expect(start).toMatchObject({ view: "side", key: "assists@Lindqvist", label: "Lindqvist: 7 assists" });
    await listen(page, "bars");
    for (const [name, label] of [
      ["stacked", "Lindqvist: 7 assists"],
      ["share", "Lindqvist: 7 assists, 41% of 17 goals and assists"],
      ["side", "Lindqvist: 7 assists"]
    ] as const) {
      await page.keyboard.press("v");
      await page.clock.runFor(REST);
      await expectLanded(page, "bars", name);
      expect(await focusedKey(page)).toEqual({ view: name, key: "assists@Lindqvist", label });
      expect(await ringShown(view(page, "bars", name))).toBe(true);
      if (name === "share") await expect(card(page, "bars")).toHaveScreenshot("layouts-bars-focus-share.png");
    }
    expect(await heard(page, "bars")).toEqual(["stacked", "share", "side"].map((name) => CARDS.bars.views.find((v) => v.view === name)!.name));
  });

  for (const id of ["areas", "radar", "treemap", "dumbbell"] as const) {
    test(`V on a focused mark of the ${id} switches, and focus and the ring follow its key, both ways`, async ({ page }) => {
      await openDemo(page, layoutsDemo);
      const [first, second] = CARDS[id].views;
      await lastButton(page, id).focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("ArrowRight");
      const start = await focusedKey(page);
      expect(start.view).toBe(first!.view);
      for (const name of [second!.view, first!.view]) {
        await page.keyboard.press("V");
        await page.clock.runFor(REST);
        await expectLanded(page, id, name);
        expect((await focusedKey(page)).key).toBe(start.key);
        expect((await focusedKey(page)).view).toBe(name);
        expect(await ringShown(view(page, id, name))).toBe(true);
        if (id === "radar" && name === "bars") await expect(card(page, id)).toHaveScreenshot("layouts-radar-focus-bars.png");
        if (id === "dumbbell" && name === "bars") await expect(card(page, id)).toHaveScreenshot("layouts-dumbbell-focus-bars.png");
      }
    });
  }

  test("the dumbbell's two tab stops, each half's dots, stay on one row: Tab from a first half lands on its second half, and Shift+Tab back", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await button(page, "dumbbell", "Bars").focus();
    await page.keyboard.press("Tab");
    expect(await focusedKey(page)).toMatchObject({ view: "dumbbell", key: "first@Lindqvist", label: "Lindqvist: 3 goals in the first half" });
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    expect((await focusedKey(page)).key).toBe("first@Castillo");
    await page.keyboard.press("Tab");
    expect(await focusedKey(page)).toMatchObject({ view: "dumbbell", key: "second@Castillo", label: "Castillo: 1 goal in the second half, up 1" });
    await page.keyboard.press("ArrowRight");
    expect((await focusedKey(page)).key).toBe("second@Novak");
    await page.keyboard.press("Shift+Tab");
    expect((await focusedKey(page)).key).toBe("first@Novak");
    await page.keyboard.press("Shift+Tab");
    await expect(button(page, "dumbbell", "Bars")).toBeFocused();
  });

  test("after a button's switch, Tab from the buttons lands on the same key in the new view", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    // The treemap's positions come between its Treemap and Bars and its chart.
    await lastButton(page, "treemap").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("End");
    const last = await focusedKey(page);
    expect(last.view).toBe("treemap");
    await page.keyboard.press("Shift+Tab");
    await expect(lastButton(page, "treemap")).toBeFocused();
    await button(page, "treemap", "Bars").focus();
    await page.keyboard.press("Enter");
    await page.clock.runFor(REST);
    await expectLanded(page, "treemap", "bars");
    await expect(button(page, "treemap", "Bars")).toBeFocused();
    await lastButton(page, "treemap").focus();
    await page.keyboard.press("Tab");
    expect(await focusedKey(page)).toMatchObject({ view: "bars", key: last.key });
  });
});

/** The treemap card's positions: each one's view, its button, its view's name, which the switch announces, and its scorers. */
const POSITIONS = [
  { view: "forward", button: "Forwards", name: "The forwards' 26 goals by scorer on a D3 treemap", scorers: ["Okafor", "Lindqvist"] },
  { view: "winger", button: "Wingers", name: "The wingers' 14 goals by scorer on a D3 treemap", scorers: ["Moreau", "Reyes", "Brennan"] },
  { view: "midfielder", button: "Midfielders", name: "The midfielders' 12 goals by scorer on a D3 treemap", scorers: ["Tanaka", "Adeyemi", "Castillo", "Sousa"] },
  { view: "defender", button: "Defenders", name: "The defenders' 6 goals by scorer on a D3 treemap", scorers: ["Novak", "Haddad", "Kowalski"] }
] as const;
const MIDFIELDERS = POSITIONS[2];
/** The marks a switch on the treemap card fades because they have no partner. */
const fading = (page: Page): Locator => chart(page, "treemap").locator(".ec-switch-overlay .ec-switch-fades > .ec-switch-fade");

/**
 * The treemap card at rest on `name`, the whole treemap, the bars or a position's view: that view alone
 * shown of its ten, its marks and labels drawn, nothing in the overlay, and both rows of buttons pressed
 * for it. A position is a treemap, and the bars are every position's.
 */
async function expectOn(page: Page, name: string): Promise<void> {
  const containers = chart(page, "treemap").locator(".ec-switch-view");
  await expect(containers).toHaveCount(10);
  expect(await containers.evaluateAll((all) => all.filter((each) => !each.classList.contains("ec-switch-inactive")).map((each) => (each as HTMLElement).dataset.view))).toEqual([name]);
  await expect(view(page, "treemap", name)).not.toHaveClass(/ec-switching/);
  await expect(view(page, "treemap", name)).not.toHaveAttribute("inert");
  await expect(runs(page, "treemap")).toHaveCount(0);
  await expect(fading(page)).toHaveCount(0);
  const parts = (await drawn(page, "treemap"))[name]!;
  expect(parts.length).toBeGreaterThan(0);
  expect(parts.every(Boolean), `${name}'s marks and labels drawn`).toBe(true);
  await expectPressed(page, name);
}

/** Both rows of the treemap card's buttons, pressed for the view its switch is heading for. */
async function expectPressed(page: Page, name: string): Promise<void> {
  // By attribute: getByRole("button", { pressed: true }) after a role query has run crashes the page in
  // Playwright 1.65.0's Firefox, on any card.
  const pressed = (row: string): Promise<string[]> => page.locator(`#treemap-${row} button[aria-pressed="true"]`).allTextContents();
  expect(await pressed("layout")).toEqual([name === "bars" ? "Bars" : "Treemap"]);
  expect(await pressed("position")).toEqual([POSITIONS.find((position) => position.view === name)?.button ?? "All"]);
}

/** Each drawn box in the treemap's chart by scorer, to the pixel: a view's own tiles, or the overlay's runs. */
async function boxes(page: Page, where: "runs" | string): Promise<Record<string, number[]>> {
  const target = where === "runs" ? runs(page, "treemap").locator("path") : view(page, "treemap", where).locator("rect.tile");
  return target.evaluateAll((elements) =>
    Object.fromEntries(
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        const key = element.closest(".ec-run")?.getAttribute("data-key") ?? (element as unknown as { __data__: { data: { name: string } } }).__data__.data.name;
        return [key, [box.x, box.y, box.width, box.height].map(Math.round)];
      })
    )
  );
}

test.describe("the treemap's drill-down", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`a position's view at rest, its tiles filling the chart, announced, and back, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openDemo(page, layoutsDemo);
      await expectOn(page, "treemap");
      await show(page, "treemap", MIDFIELDERS.button);
      await expectOn(page, MIDFIELDERS.view);
      await expect(announcer(page, "treemap")).toHaveText(said(MIDFIELDERS.name));
      // In the whole treemap only Tanaka's tile has room for his name; with the whole chart to share, more do.
      await expect(view(page, "treemap", "midfielder-chosen").locator("text.host-label")).toHaveText(["Tanaka"]);
      const named = await view(page, "treemap", MIDFIELDERS.view).locator("text.host-label").allTextContents();
      expect(named).toEqual(expect.arrayContaining(["Tanaka", "Adeyemi"]));
      expect(MIDFIELDERS.scorers).toEqual(expect.arrayContaining(named));
      await expect(card(page, "treemap")).toHaveScreenshot(`layouts-treemap-midfielder-${colorScheme}.png`);
      await show(page, "treemap", "All");
      await expectOn(page, "treemap");
      await expect(announcer(page, "treemap")).toHaveText(said(CARDS.treemap.views[0]!.name));
    });
  }

  test("at 320 px, the positions' buttons wrap inside the card, and a position's view fits it", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: NARROW_HEIGHT });
    await openDemo(page, layoutsDemo);
    await show(page, "treemap", MIDFIELDERS.button);
    await expectOn(page, MIDFIELDERS.view);
    const sizes = await card(page, "treemap").evaluate((section) => {
      const right = (element: Element): number => element.getBoundingClientRect().right;
      return { card: right(section), buttons: [...section.querySelectorAll("button")].map(right), svg: right(section.querySelector('.ec-switch-view[data-view="midfielder"] svg')!) };
    });
    for (const right of [...sizes.buttons, sizes.svg]) expect(right).toBeLessThanOrEqual(sizes.card - 20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await expect(card(page, "treemap")).toHaveScreenshot("layouts-treemap-midfielder-320.png");
  });

  test("a drill in is two legs of 950 ms: the others fade while the chosen stay where they were, then the chosen grow alone; announced once; and back the same way", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await listen(page, "treemap");
    const atRest = await boxes(page, "treemap");
    const filled = await boxes(page, MIDFIELDERS.view);
    await button(page, "treemap", MIDFIELDERS.button).click();
    await pointerAway(page);
    // The position is pressed from the start.
    await expectPressed(page, MIDFIELDERS.view);
    // 304 ms: the eight others part faded, and the four where the treemap has them.
    await page.clock.runFor(304);
    await expect(view(page, "treemap", "treemap")).toHaveClass(/ec-switching/);
    await expect(view(page, "treemap", "midfielder-chosen")).toHaveClass(/ec-switching/);
    await expect(view(page, "treemap", MIDFIELDERS.view)).toHaveClass(/ec-switch-inactive/);
    await expect(runs(page, "treemap")).toHaveCount(4);
    await expect(fading(page)).toHaveCount(8);
    const opacities = await fading(page).evaluateAll((groups) => groups.map((group) => Number(group.getAttribute("opacity"))));
    expect(new Set(opacities).size).toBe(1);
    expect(opacities[0]!).toBeGreaterThan(0);
    expect(opacities[0]!).toBeLessThan(1);
    const chosen = Object.fromEntries(MIDFIELDERS.scorers.map((name) => [name, atRest[name]!]));
    expect(await boxes(page, "runs")).toEqual(chosen);
    const parts = await drawn(page, "treemap");
    for (const name of ["treemap", "midfielder-chosen"]) expect(parts[name]!.some(Boolean), `${name}: a D3 part drawn`).toBe(false);
    // 496 ms, just past a quarter of the way: the others gone, the four still in place.
    await page.clock.runFor(192);
    expect(await fading(page).evaluateAll((groups) => groups.map((group) => group.getAttribute("opacity")))).toEqual(Array(8).fill("0"));
    expect(await boxes(page, "runs")).toEqual(chosen);
    await expect(chart(page, "treemap")).toHaveScreenshot("layouts-treemap-drill-first.png");
    // 1,440 ms, three quarters: the second leg half way, the four growing and nothing else drawn.
    await page.clock.runFor(944);
    await expect(view(page, "treemap", "treemap")).toHaveClass(/ec-switch-inactive/);
    await expect(view(page, "treemap", "midfielder-chosen")).toHaveClass(/ec-switching/);
    await expect(view(page, "treemap", MIDFIELDERS.view)).toHaveClass(/ec-switching/);
    await expect(runs(page, "treemap")).toHaveCount(4);
    await expect(fading(page)).toHaveCount(0);
    const growing = await boxes(page, "runs");
    for (const name of MIDFIELDERS.scorers) {
      const area = (box: readonly number[]): number => box[2]! * box[3]!;
      expect(area(growing[name]!), name).toBeGreaterThan(area(atRest[name]!));
      expect(area(growing[name]!), name).toBeLessThan(area(filled[name]!));
    }
    await expect(chart(page, "treemap")).toHaveScreenshot("layouts-treemap-drill-second.png");
    expect(await heard(page, "treemap")).toEqual([]);
    await page.clock.runFor(REST);
    await expectOn(page, MIDFIELDERS.view);
    expect(await heard(page, "treemap")).toEqual([MIDFIELDERS.name]);

    // Back: 1.9 s in all, announced once more.
    await button(page, "treemap", "All").click();
    await pointerAway(page);
    await expectPressed(page, "treemap");
    await page.clock.runFor(1904);
    await expect(runs(page, "treemap")).toHaveCount(4);
    await expect(fading(page)).toHaveCount(8);
    await page.clock.runFor(2 * FRAME);
    await expectOn(page, "treemap");
    expect(await heard(page, "treemap")).toEqual([MIDFIELDERS.name, CARDS.treemap.views[0]!.name]);
  });

  test("the positions are toggle buttons in a named group; Bars from a position goes to every scorer's bars, and a position from the bars or from another goes straight there", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await listen(page, "treemap");
    await expect(card(page, "treemap").getByRole("group", { name: "Position" }).getByRole("button")).toHaveText(["All", ...POSITIONS.map((position) => position.button)]);
    await show(page, "treemap", MIDFIELDERS.button);
    await expectOn(page, MIDFIELDERS.view);
    // Treemap on a position is already pressed, and does nothing.
    await show(page, "treemap", "Treemap");
    await expectOn(page, MIDFIELDERS.view);
    // Bars: the four grow into their bars as the other eight fade in, and the positions go back to All.
    await button(page, "treemap", "Bars").click();
    await pointerAway(page);
    await expectPressed(page, "bars");
    await page.clock.runFor(475);
    await expect(runs(page, "treemap")).toHaveCount(4);
    await expect(fading(page)).toHaveCount(8);
    await page.clock.runFor(REST);
    await expectOn(page, "bars");
    // All on the bars is already pressed, and does nothing.
    await show(page, "treemap", "All");
    await expectOn(page, "bars");
    // A position from the bars: one switch, and Treemap is pressed again.
    await button(page, "treemap", "Wingers").click();
    await pointerAway(page);
    await expectPressed(page, "winger");
    await page.clock.runFor(475);
    await expect(view(page, "treemap", "bars")).toHaveClass(/ec-switching/);
    await expect(view(page, "treemap", "winger")).toHaveClass(/ec-switching/);
    await expect(runs(page, "treemap")).toHaveCount(3);
    await expect(fading(page)).toHaveCount(9);
    await page.clock.runFor(REST);
    await expectOn(page, "winger");
    // One position to another: they share no scorer, so nothing morphs. The wingers fade out, then the forwards fade in.
    await button(page, "treemap", "Forwards").click();
    await pointerAway(page);
    await expectPressed(page, "forward");
    const opacities = (): Promise<Record<string, number>> => fading(page).evaluateAll((groups) => Object.fromEntries(groups.map((group) => [group.getAttribute("data-key")!, Number(group.getAttribute("opacity"))])));
    await page.clock.runFor(304);
    await expect(runs(page, "treemap")).toHaveCount(0);
    let now = await opacities();
    expect(Object.keys(now).sort()).toEqual(["Brennan", "Lindqvist", "Moreau", "Okafor", "Reyes"]);
    expect(now.Moreau!).toBeGreaterThan(0);
    expect(now.Moreau!).toBeLessThan(1);
    expect(now.Okafor).toBe(0);
    await page.clock.runFor(400);
    now = await opacities();
    expect(now.Moreau).toBe(0);
    expect(now.Okafor!).toBeGreaterThan(0);
    await page.clock.runFor(REST);
    await expectOn(page, "forward");
    expect(await heard(page, "treemap")).toEqual([MIDFIELDERS.name, CARDS.treemap.views[1]!.name, POSITIONS[1].name, POSITIONS[0].name]);
  });

  test("a click on a tile drills into its position, and a position's own tile goes no further", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await expect(view(page, "treemap", "treemap").locator("rect.tile").first()).toHaveCSS("cursor", "pointer");
    // On its name, which is drawn above the tile and lets the pointer through: the hover and the click are the tile's.
    const name = (await view(page, "treemap", "treemap").locator("text.host-label", { hasText: "Novak" }).boundingBox())!;
    await page.mouse.move(name.x + name.width / 2, name.y + name.height / 2);
    await page.clock.runFor(200);
    await expect(view(page, "treemap", "treemap").locator("rect.tile.ec-dimmed")).toHaveCount(11);
    await page.mouse.click(name.x + name.width / 2, name.y + name.height / 2);
    await expectPressed(page, "defender");
    await expect(runs(page, "treemap")).toHaveCount(3);
    await pointerAway(page);
    await page.clock.runFor(REST);
    await expectOn(page, "defender");
    // Focus went to the tile with the click, and followed it in.
    expect(await focusedKey(page)).toMatchObject({ view: "defender", key: "Novak", label: "Novak, defender: 3 goals, 50% of the defenders' 6" });
    await expect(view(page, "treemap", "defender").locator("rect.tile").first()).not.toHaveCSS("cursor", "pointer");
    await view(page, "treemap", "defender").locator("rect.tile").nth(1).click();
    await pointerAway(page);
    await page.clock.runFor(REST);
    await expectOn(page, "defender");
  });

  test("Enter on a focused tile drills into its position and Escape goes back, focus and the ring following the tile both ways", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await listen(page, "treemap");
    await lastButton(page, "treemap").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("End");
    const start = await focusedKey(page);
    // The last tile in the order the arrow keys go.
    expect(start).toMatchObject({ view: "treemap", key: "Haddad", label: "Haddad, defender: 2 goals, 3% of 58" });
    await page.keyboard.press("Enter");
    await expectPressed(page, "defender");
    await page.clock.runFor(REST);
    await expectOn(page, "defender");
    expect(await focusedKey(page)).toEqual({ view: "defender", key: "Haddad", label: "Haddad, defender: 2 goals, 33% of the defenders' 6" });
    expect(await ringShown(view(page, "treemap", "defender"))).toBe(true);
    await expect(card(page, "treemap")).toHaveScreenshot("layouts-treemap-focus-defender.png");
    // Enter again goes no further.
    await page.keyboard.press("Enter");
    await page.clock.runFor(REST);
    await expectOn(page, "defender");
    // Escape: one press ends the tile's hover and goes back.
    await page.keyboard.press("Escape");
    await expectPressed(page, "treemap");
    await expect(runs(page, "treemap")).toHaveCount(3);
    await page.clock.runFor(REST);
    await expectOn(page, "treemap");
    expect(await focusedKey(page)).toMatchObject({ view: "treemap", key: "Haddad" });
    expect(await ringShown(view(page, "treemap", "treemap"))).toBe(true);
    // On the whole treemap, Escape is the hover's alone.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.clock.runFor(REST);
    await expectOn(page, "treemap");
    expect(await heard(page, "treemap")).toEqual([POSITIONS[3].name, CARDS.treemap.views[0]!.name]);
  });

  test("V on a focused tile of a position goes to its bar, and V again to the whole treemap", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await show(page, "treemap", "Forwards");
    await lastButton(page, "treemap").focus();
    await page.keyboard.press("Tab");
    const { key } = await focusedKey(page);
    for (const name of ["bars", "treemap"]) {
      await page.keyboard.press("v");
      await page.clock.runFor(REST);
      await expectOn(page, name);
      expect(await focusedKey(page)).toMatchObject({ view: name, key });
    }
  });

  test("with reduced motion, a drill in, a drill back and a jump between positions each land at once, focus following", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, layoutsDemo);
    await listen(page, "treemap");
    await lastButton(page, "treemap").focus();
    await page.keyboard.press("Tab");
    const { key } = await focusedKey(page);
    await page.keyboard.press("Enter");
    // No time passes.
    await expectOn(page, "forward");
    expect(await focusedKey(page)).toMatchObject({ view: "forward", key });
    await page.keyboard.press("Escape");
    await expectOn(page, "treemap");
    expect(await focusedKey(page)).toMatchObject({ view: "treemap", key });
    await button(page, "treemap", MIDFIELDERS.button).click();
    await expectOn(page, MIDFIELDERS.view);
    await button(page, "treemap", "Defenders").click();
    await expectOn(page, "defender");
    await button(page, "treemap", "Bars").click();
    await expectOn(page, "bars");
    expect(await heard(page, "treemap")).toEqual([POSITIONS[0].name, CARDS.treemap.views[0]!.name, MIDFIELDERS.name, POSITIONS[3].name, CARDS.treemap.views[1]!.name]);
  });

  test("Off picked in either leg of a drill lands it on its position at once, announced once, and a drill back part way through each leg ends on the whole treemap", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await listen(page, "treemap");
    for (const at of [300, 960 + 300]) {
      await button(page, "treemap", MIDFIELDERS.button).click();
      await page.clock.runFor(at);
      await expect(runs(page, "treemap")).toHaveCount(4);
      await pickMode(page, "Off");
      await expectOn(page, MIDFIELDERS.view);
      await button(page, "treemap", "All").click();
      await expectOn(page, "treemap");
      await pickMode(page, "Presentation");
    }
    expect(await heard(page, "treemap")).toEqual([MIDFIELDERS.name, CARDS.treemap.views[0]!.name, MIDFIELDERS.name, CARDS.treemap.views[0]!.name]);
    // All in the first leg plays it back from where it is: as long back as it had gone.
    await button(page, "treemap", MIDFIELDERS.button).click();
    await page.clock.runFor(304);
    await button(page, "treemap", "All").click();
    await pointerAway(page);
    await expectPressed(page, "treemap");
    await page.clock.runFor(288);
    await expect(runs(page, "treemap")).toHaveCount(4);
    await page.clock.runFor(2 * FRAME);
    await expectOn(page, "treemap");
    // All in the second leg: the switch lands on the position, then plays the whole jump back.
    await button(page, "treemap", MIDFIELDERS.button).click();
    await page.clock.runFor(960 + 304);
    await button(page, "treemap", "All").click();
    await pointerAway(page);
    await expect(view(page, "treemap", MIDFIELDERS.view)).toHaveClass(/ec-switching/);
    await expect(view(page, "treemap", "midfielder-chosen")).toHaveClass(/ec-switching/);
    await page.clock.runFor(1904);
    await expect(runs(page, "treemap")).toHaveCount(4);
    await page.clock.runFor(2 * FRAME);
    await expectOn(page, "treemap");
  });

  test("a resize in either leg of a drill draws every view again at the new width and lands on the position", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    const widths = (): Promise<string[]> => chart(page, "treemap").locator(".ec-switch-view > svg").evaluateAll((svgs) => svgs.map((svg) => svg.getAttribute("width") ?? ""));
    for (const [at, width] of [
      [300, 700],
      [960 + 300, 1000]
    ] as const) {
      const before = await widths();
      await button(page, "treemap", MIDFIELDERS.button).click();
      await pointerAway(page);
      await page.clock.runFor(at);
      await expect(runs(page, "treemap")).toHaveCount(4);
      await page.setViewportSize({ width, height: 6000 });
      await expect.poll(widths).not.toEqual(before);
      await expect(runs(page, "treemap")).toHaveCount(0);
      await page.clock.runFor(REST);
      await expectOn(page, MIDFIELDERS.view);
      expect(new Set(await widths()).size).toBe(1);
      // In place, each tile is where the whole treemap has it at the new width.
      const whole = await boxes(page, "treemap");
      expect(await boxes(page, "midfielder-chosen")).toEqual(Object.fromEntries(MIDFIELDERS.scorers.map((name) => [name, whole[name]!])));
      expect(await chart(page, "treemap").locator(HOST_PARTS).evaluateAll((parts) => parts.filter((part) => (part as SVGElement).style.visibility !== "").length)).toBe(0);
      await show(page, "treemap", "All");
      await expectOn(page, "treemap");
    }
  });

  test("only the view shown can be read: a position's tiles, each named with its share of the position's goals, and nothing part way through a drill", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "It reads Chrome's accessibility tree, over CDP.");
    const sorted = (lines: readonly string[]): string[] => [...lines].sort();
    const goals: Readonly<Record<string, number>> = { Tanaka: 6, Adeyemi: 4, Castillo: 1, Sousa: 1 };
    const position = sorted([`group: ${MIDFIELDERS.name}`, ...MIDFIELDERS.scorers.map((name) => `image: ${name}, midfielder: ${plural(goals[name]!, "goal")}, ${Math.round((goals[name]! / 12) * 100)}% of the midfielders' 12`)]);
    await openDemo(page, layoutsDemo);
    await button(page, "treemap", MIDFIELDERS.button).click();
    for (let ms = 0; ms < 2000; ms += 250) {
      await page.clock.runFor(250);
      const now = await readable(page, ["#treemap"]);
      // Never the view it's staged through, nor the whole treemap on the way.
      if (now.length > 0) expect(sorted(now)).toEqual(position);
      else expect(ms).toBeLessThan(1750);
    }
    expect(sorted(await readable(page, ["#treemap"]))).toEqual(position);
    await button(page, "treemap", "All").click();
    await page.clock.runFor(REST);
    expect(sorted(await readable(page, ["#treemap"]))).toEqual(sorted([`group: ${CARDS.treemap.views[0]!.name}`, ...READ.treemap.treemap!]));
  });
});

test.describe("a resize mid-switch", () => {
  test("draws each card's charts again at the new width, lands every switch, and every mark is drawn as its D3 code drew it", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    const widths = (): Promise<string[]> => page.locator(".switch .ec-switch-view > svg").evaluateAll((svgs) => svgs.map((svg) => svg.getAttribute("width") ?? ""));
    const before = await widths();
    await button(page, "bars", "100%").click();
    await button(page, "areas", "100%").click();
    await button(page, "radar", "Bars").click();
    await button(page, "treemap", "Bars").click();
    await button(page, "dumbbell", "Bars").click();
    await pointerAway(page);
    await page.clock.runFor(300);
    for (const id of IDS) await expect(runs(page, id)).toHaveCount(CARDS[id].marks);
    // One column: each card is wider, so each chart draws again, and the switches land.
    await page.setViewportSize({ width: 700, height: 6000 });
    await expect.poll(widths).not.toEqual(before);
    for (const id of IDS) await expect(runs(page, id)).toHaveCount(0);
    await page.clock.runFor(REST);
    // The bars landed on 100%: a resize lands a jump on its view.
    await expectLanded(page, "bars", "share");
    await expectLanded(page, "areas", "share");
    await expectLanded(page, "radar", "bars");
    await expectLanded(page, "treemap", "bars");
    await expectLanded(page, "dumbbell", "bars");
    const after = await widths();
    expect(new Set(after).size).toBe(1);
    expect(Number(after[0])).toBeGreaterThan(Number(before[0]));
    // Nothing left hidden inline in any view.
    const hiddenInline = await page.locator(`.switch ${HOST_PARTS}`).evaluateAll((parts) => parts.filter((part) => (part as SVGElement).style.visibility !== "").length);
    expect(hiddenInline).toBe(0);
  });
});

test.describe("reduced motion and Off", () => {
  test("with reduced motion, every switch lands at once, focus following, until the viewer picks a mode", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, layoutsDemo);
    await listen(page, "bars");
    await button(page, "bars", "100%").click();
    // No time passes.
    await expectLanded(page, "bars", "share");
    expect(await heard(page, "bars")).toEqual([CARDS.bars.views[2]!.name]);
    await page.keyboard.press("Tab");
    expect((await focusedKey(page)).view).toBe("share");
    const key = (await focusedKey(page)).key;
    await page.keyboard.press("v");
    await expectLanded(page, "bars", "side");
    expect(await focusedKey(page)).toMatchObject({ view: "side", key });
    for (const id of ["areas", "radar", "treemap", "dumbbell"] as const) {
      await button(page, id, CARDS[id].views[1]!.button).click();
      await expectLanded(page, id, CARDS[id].views[1]!.view);
    }
    // The viewer's own pick overrides the device's setting.
    await pickMode(page, "Presentation");
    await button(page, "radar", "Radar").click();
    await expect(runs(page, "radar")).toHaveCount(12);
    await page.clock.runFor(REST);
    await expectLanded(page, "radar", "radar");
  });

  test("Off picked part way through a jump lands it on its view at once, announced once, in either leg", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await listen(page, "bars");
    await button(page, "bars", "100%").click();
    await page.clock.runFor(500);
    await expect(runs(page, "bars")).toHaveCount(16);
    await pickMode(page, "Off");
    await expectLanded(page, "bars", "share");
    await page.clock.runFor(REST);
    expect(await heard(page, "bars")).toEqual([CARDS.bars.views[2]!.name]);
    // In the second leg.
    await pickMode(page, "Presentation");
    await button(page, "bars", "Side by side").click();
    await page.clock.runFor(960 + 300);
    await expect(view(page, "bars", "stacked")).toHaveClass(/ec-switching/);
    await expect(view(page, "bars", "side")).toHaveClass(/ec-switching/);
    await pickMode(page, "Off");
    await expectLanded(page, "bars", "side");
    await page.clock.runFor(REST);
    expect(await heard(page, "bars")).toEqual([CARDS.bars.views[2]!.name, CARDS.bars.views[0]!.name]);
  });

  test("reduced motion turned on part way through a jump lands it on its view, focus following its key", async ({ page }) => {
    await openDemo(page, layoutsDemo);
    await show(page, "bars", "100%");
    await button(page, "bars", "100%").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowRight");
    const { key } = await focusedKey(page);
    // V from 100% goes to side by side, through Stacked.
    await page.keyboard.press("v");
    await page.clock.runFor(400);
    await expect(view(page, "bars", "stacked")).toHaveClass(/ec-switching/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expectLanded(page, "bars", "side");
    expect(await focusedKey(page)).toMatchObject({ view: "side", key });
    expect(await ringShown(view(page, "bars", "side"))).toBe(true);
  });
});

/**
 * What Chrome's accessibility tree exposes inside `roots`, each node as "role: name", for the roles
 * the cards use, as morph.spec.ts reads it.
 */
async function readable(page: Page, roots: readonly string[]): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const lines: string[] = [];
    for (const selector of roots) {
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
      for (const role of ["group", "image"]) {
        const { nodes } = await cdp.send("Accessibility.queryAXTree", { nodeId, role });
        lines.push(...nodes.filter((node) => !node.ignored && node.name?.value).map((node) => `${String(node.role?.value)}: ${String(node.name?.value)}`));
      }
    }
    return lines;
  } finally {
    await cdp.detach();
  }
}

/** The players' goals and assists, the scorers, and the radar's values, as the page names them. */
const PLAYERS: readonly (readonly [string, number, number])[] = [
  ["Okafor", 16, 4],
  ["Lindqvist", 10, 7],
  ["Moreau", 8, 3],
  ["Tanaka", 6, 10],
  ["Reyes", 5, 4],
  ["Adeyemi", 4, 6],
  ["Novak", 3, 1],
  ["Castillo", 1, 5]
];
const plural = (n: number, word: string): string => `${n} ${n === 1 ? word : `${word}s`}`;
const SCORERS: readonly (readonly [string, string, number])[] = [
  ["Okafor", "forward", 16],
  ["Lindqvist", "forward", 10],
  ["Moreau", "winger", 8],
  ["Tanaka", "midfielder", 6],
  ["Reyes", "winger", 5],
  ["Adeyemi", "midfielder", 4],
  ["Novak", "defender", 3],
  ["Haddad", "defender", 2],
  ["Castillo", "midfielder", 1],
  ["Brennan", "winger", 1],
  ["Sousa", "midfielder", 1],
  ["Kowalski", "defender", 1]
];
/** The charts page's players, their goals in the first half and the second. */
const HALVES: readonly (readonly [string, number, number])[] = [
  ["Okafor", 10, 6],
  ["Lindqvist", 3, 7],
  ["Moreau", 5, 3],
  ["Tanaka", 2, 4],
  ["Reyes", 1, 4],
  ["Adeyemi", 3, 1],
  ["Novak", 2, 1],
  ["Castillo", 0, 1]
];
const RADAR: readonly (readonly [string, string, string, string])[] = [
  ["goals", "0.50", "96th", "0.18|63rd"],
  ["assists", "0.13", "52nd", "0.12|58th"],
  ["shots", "2.00", "91st", "1.30|57th"],
  ["key passes", "0.90", "47th", "1.00|56th"],
  ["tackles", "0.60", "18th", "1.40|54th"],
  ["dribbles", "1.40", "74th", "1.00|60th"]
];
const READ: Readonly<Record<CardId, Readonly<Record<string, readonly string[]>>>> = {
  bars: {
    side: PLAYERS.flatMap(([name, goals, assists]) => [`image: ${name}: ${plural(goals, "goal")}`, `image: ${name}: ${plural(assists, "assist")}`]),
    share: PLAYERS.flatMap(([name, goals, assists]) => {
      const total = goals + assists;
      const share = Math.round((goals / total) * 100);
      return [`image: ${name}: ${plural(goals, "goal")}, ${share}% of ${total} goals and assists`, `image: ${name}: ${plural(assists, "assist")}, ${100 - share}% of ${total} goals and assists`];
    })
  },
  areas: {
    stacked: ["image: Shots on target: 177 in 38 matches", "image: Shots off target: 333 in 38 matches"],
    share: ["image: Shots on target: 35% of 510 shots in 38 matches", "image: Shots off target: 65% of 510 shots in 38 matches"]
  },
  radar: {
    radar: RADAR.flatMap(([axis, per90, rank, average]) => [`image: Okafor, ${axis}: ${per90} per 90, ${rank} percentile`, `image: League average, ${axis}: ${average.split("|")[0]} per 90, ${average.split("|")[1]} percentile`])
  },
  treemap: {
    treemap: SCORERS.map(([name, pos, goals]) => `image: ${name}, ${pos}: ${plural(goals, "goal")}, ${Math.round((goals / 58) * 100)}% of 58`),
    bars: SCORERS.map(([name, pos, goals]) => `image: ${name}, ${pos}: ${plural(goals, "goal")}`)
  },
  // Each half's dot, and its bar, the same: the lines between the dots aren't read.
  dumbbell: {
    dumbbell: HALVES.flatMap(([name, first, second]) => [
      `image: ${name}: ${plural(first, "goal")} in the first half`,
      `image: ${name}: ${plural(second, "goal")} in the second half, ${second > first ? `up ${second - first}` : `down ${first - second}`}`
    ])
  }
};

test.describe("the screen reader", () => {
  test("only each card's view shown can be read, each mark named once, and each switch announces the new view", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "It reads Chrome's accessibility tree, over CDP.");
    /** What can be read, in any order: Chrome lists nodes by when they were made. */
    const sorted = (lines: readonly string[]): string[] => [...lines].sort();
    const expected = (id: CardId, name: string): string[] => {
      const v = CARDS[id].views.find((each) => each.view === name)!;
      const images = READ[id][name] ?? READ[id][CARDS[id].views[0]!.view]!;
      return sorted([`group: ${v.name}`, ...images]);
    };
    await openDemo(page, layoutsDemo);
    for (const id of IDS) {
      const [first, second] = CARDS[id].views;
      expect(sorted(await readable(page, [`#${id}`])), `${id} at load`).toEqual(expected(id, first!.view));
      await button(page, id, second!.button).click();
      // Mid-switch, no view can be read: each is inert, and the new one is hidden until it lands.
      await page.clock.runFor(300);
      expect(await readable(page, [`#${id}`])).toEqual([]);
      await page.clock.runFor(REST);
      await expect(announcer(page, id)).toHaveText(said(second!.name));
      expect(sorted(await readable(page, [`#${id}`])), `${id} on ${second!.view}`).toEqual(expected(id, second!.view));
    }
    // The bars at 100%, through Stacked, which is never readable on the way.
    await button(page, "bars", "100%").click();
    for (let ms = 0; ms < 2000; ms += 250) {
      await page.clock.runFor(250);
      const now = await readable(page, ["#bars"]);
      if (now.length > 0) expect(sorted(now)).toEqual(expected("bars", "share"));
    }
    await expect(announcer(page, "bars")).toHaveText(said(CARDS.bars.views[2]!.name));
    expect(sorted(await readable(page, ["#bars"]))).toEqual(expected("bars", "share"));
  });
});
