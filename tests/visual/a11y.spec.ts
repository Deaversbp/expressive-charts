// The accessibility audit's automatic checks (docs/a11y-audit.md has the rest, and the results).
// axe-core, a pinned dev dependency, runs its WCAG 2.2 A and AA rules on every demo page: in light and
// dark, at 320 px wide, under forced colours, on morph.html mid-switch and with its season's other views
// shown, and on line.html with Curved and Nearest point picked. Beside it, DOM checks for
// what axe can't see: the tab order with a visible focus at every stop, no sideways scroll at 320 px,
// the tooltip clear of the focus ring, dismissed by Escape and hoverable, every label at 4.5:1 while
// another mark is hovered, nothing moving by itself after 5 s, and legends keeping their colours under
// forced colours. There are no screenshots here, so every browser runs all of it.

import axe from "axe-core";
import { expect, test, type Page } from "@playwright/test";
import { barsDemo, donutDemo, FRAME, hoverShape, lineDemo, morphDemo, openDemo, pickMetric, REST, seasonDemo, shapesDemo, stressDemo, tabInto, type Demo } from "./demo";

/** axe's rules for WCAG 2.0, 2.1 and 2.2 at levels A and AA. */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const MOTION = ["Presentation", "Analysis", "Off"];

/** One of the library's charts, which show a tooltip, a shape in it to hover, and another mark's, clear of that one's tooltip. */
interface TooltipChart {
  readonly chart: string;
  readonly shape: string;
  readonly other: string;
}

/**
 * Each page, its tab stops in order (a chart's is its first mark, named; a11y-check.md's scripts count
 * on them), and the library's charts on it.
 */
const demos: { readonly name: string; readonly demo: Demo; readonly stops: readonly string[]; readonly charts: readonly TooltipChart[] }[] = [
  {
    name: "bars",
    demo: barsDemo,
    stops: [...MOTION, "Goals", "Assists", "Goals + assists", "Highest first", "A–Z", "Play next matchweek", "Okafor: 16 goals", "Data table", "Okafor: 16 goals"],
    charts: [{ chart: "#chart", shape: '.ec-mark[data-key="Okafor"] .ec-segment', other: '.ec-mark[data-key="Castillo"] .ec-segment' }]
  },
  {
    name: "donut",
    demo: donutDemo,
    stops: [...MOTION, "Ball", "Wiggle", "Pulse", "Data order", "Largest first", "Next match", "Goal: 58 shots, 14%", "Data table", "Goal: 58 shots, 14%", "Goal: 58 shots", "Data table"],
    charts: [
      { chart: "#donut", shape: '.ec-mark[data-key="Off target"] .ec-slice', other: '.ec-mark[data-key="Goal"] .ec-slice' },
      { chart: "#columns", shape: '.ec-mark[data-key="Saved"] .ec-segment', other: '.ec-mark[data-key="Blocked"] .ec-segment' }
    ]
  },
  {
    name: "line",
    demo: lineDemo,
    stops: [
      ...MOTION,
      ...["Play season", "Matchweek", "Straight", "Curved", "Each week", "Nearest point"],
      ...["Matchweek 1: 0 goals, 0.6 xG", "Data table", "Goals scored: 56 goals by matchweek 38"],
      ...["Matchweek 1: 0 goals, 0.6 xG", "Data table", "Goals scored: 56 goals by matchweek 38, matchweeks 9 and 10 missing"],
      "Goals scored: 56 goals by matchweek 38"
    ],
    // Not #gaps, the same line chart with missing weeks: at a week with no values its focus is a line
    // where the crosshair is, and the tooltip at the crosshair's top covers the line's top, so the
    // ring test would fail there. line.spec.ts checks that focus.
    charts: [{ chart: "#line", shape: '.ec-column[data-key="12"] .ec-hit', other: '.ec-column[data-key="30"] .ec-hit' }]
  },
  {
    name: "morph",
    demo: morphDemo,
    stops: [
      ...MOTION,
      ...["Show as columns", "Drop", "Unroll", "Goal: 58 shots, 14%", "Data table", "Off target: 149 shots", "Data table"],
      ...["Per match", "Season to date", "Columns", "Matchweek 1: 0 goals, 0.6 xG", "Data table"]
    ],
    // A linked hover hovers the other chart too: "contrast on hover" measures the chart hovered. Not
    // #season, whose line charts have weeks with no values, as line.html's chart with missing weeks has:
    // see line.html's entry below. morph.spec.ts checks that switch.
    charts: [
      {
        chart: "#shots",
        shape: '.ec-switch-view[data-view="donut"] .ec-mark[data-key="Off target"] .ec-slice',
        other: '.ec-switch-view[data-view="donut"] .ec-mark[data-key="Goal"] .ec-slice'
      },
      { chart: "#ranked", shape: '.ec-mark[data-key="Saved"] .ec-segment', other: '.ec-mark[data-key="Goal"] .ec-segment' }
    ]
  },
  {
    name: "season",
    demo: seasonDemo,
    stops: [
      ...MOTION,
      ...["Play next matchweek", "Full hover", "Emphasis only", "Matchweek 1: 2 goals", "Data table", "Matchweek 1: 7 shots", "Matchweek 1: 2 goals, 0.6 xG", "Data table"],
      ...["Okafor: 14 goals", "Data table", "Okafor: 1 goal at matchweek 1, 14 goals after matchweek 24, +13"]
    ],
    // A linked hover dims the other charts too: "contrast on hover" measures the chart hovered, and
    // season.spec.ts the two linked to it.
    charts: [
      { chart: "#goals", shape: '.ec-mark[data-key="13"] .ec-segment', other: '.ec-mark[data-key="3"] .ec-segment' },
      { chart: "#line", shape: '.ec-column[data-key="13"] .ec-hit', other: '.ec-column[data-key="3"] .ec-hit' },
      { chart: "#players", shape: '.ec-mark[data-key="Okafor"] .ec-segment', other: '.ec-mark[data-key="Castillo"] .ec-segment' }
    ]
  },
  {
    name: "shapes",
    demo: shapesDemo,
    stops: [
      ...MOTION,
      ...["Pulse", "Flash", "Wiggle", "Okafor: 16 goals from 64 shots", "Okafor: 16 goals, 4 assists"],
      ...["Goals per match, five-match average: 1.0 at matchweek 38, below xG in matchweeks 1 to 6, 9 to 12, 20 to 23, 31 and 33 to 38", "Shots on target: 177 in 38 matches"]
    ],
    // None: its four charts are attachments, which draw no tooltip, so the tooltip checks below have
    // nothing to check there. shapes.spec.ts checks their hover and focus.
    charts: []
  },
  {
    name: "stress",
    demo: stressDemo,
    stops: [
      ...MOTION,
      ...["100", "500", "1,000", "2,000", "5,000", "None", "flash", "Change every bar", "Bar 36: 98 points", "Data table"],
      ...["100", "500", "1,000", "2,000", "5,000", "Sweep across", "Bar 1: 10 points", "Data table"],
      ...["1", "2", "5", "10", "1", "2", "3", "4", "Play", "Jan 1, 2025: 959 Visits, 936 28-day average", "Data table"],
      ...["20", "100", "200", "500", "1,000", "2,000", "watch", "refresh() at the end", "Change every column", "Column 1: 0"],
      ...["20", "100", "200", "500", "1,000", "Show as columns", "Bar 1: 10 points", "Data table"],
      ...["1,000", "2,000", "5,000", "10,000", "Draw again", "Bar 1: 12 points", "Data table"]
    ],
    // The switch's 20 bars: the tooltip test walks every mark of a chart, and the other charts here
    // have 100 or more (stress.spec.ts shows the date line's tooltip).
    charts: [
      {
        chart: "#switch-chart",
        shape: '.ec-switch-view[data-view="bars"] .ec-mark[data-key="Bar 2"] .ec-segment',
        other: '.ec-switch-view[data-view="bars"] .ec-mark[data-key="Bar 15"] .ec-segment'
      }
    ]
  }
];

/** Firefox and WebKit only match the media query when forced colours are emulated: none are forced. */
const FORCED_IN_CHROMIUM = "Only Chromium forces colours when they're emulated.";

/** What axe finds on the page as it is now: one line per rule and element, so a failure says where. */
async function axeViolations(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ content: axe.source });
  // axe waits on timers, and the page's clock is stopped, so the clock moves a millisecond at a time
  // until axe is done: 40 ms or so, which changes nothing on a page at rest.
  let done = false;
  const run = page
    .evaluate(async (tags) => {
      const { violations } = await (window as unknown as { axe: typeof axe }).axe.run(document, { runOnly: { type: "tag", values: tags } });
      return violations.flatMap((rule) => rule.nodes.map((node) => `${rule.id}: ${node.target.join(" ")}`));
    }, WCAG)
    .finally(() => {
      done = true;
    });
  while (!done) await page.clock.runFor(1);
  return run;
}

/** Opens a demo and lets whatever plays at load finish. */
async function openAtRest(page: Page, demo: Demo): Promise<void> {
  await openDemo(page, demo);
  await page.clock.runFor(REST);
}

test.describe("axe", () => {
  for (const { name, demo } of demos) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${name}.html at rest, ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await openAtRest(page, demo);
        expect(await axeViolations(page)).toEqual([]);
      });

      test(`${name}.html under forced colours, ${colorScheme}`, async ({ page, browserName }) => {
        test.skip(browserName !== "chromium", FORCED_IN_CHROMIUM);
        await page.emulateMedia({ colorScheme, forcedColors: "active" });
        await openAtRest(page, demo);
        expect(await axeViolations(page)).toEqual([]);
      });
    }

    test(`${name}.html at 320 px, with no sideways scroll`, async ({ page }) => {
      // Tall enough that openDemo's check passes: the page is several screens long at this width, the
      // line page about 6,200 px.
      await page.setViewportSize({ width: 320, height: 7000 });
      await openAtRest(page, demo);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  for (const colorScheme of ["light", "dark"] as const) {
    test(`line.html with Curved and Nearest point picked, a point focused, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page, lineDemo);
      for (const name of ["Curved", "Nearest point"]) await page.getByRole("button", { name, exact: true }).click();
      await page.clock.runFor(REST);
      await tabInto(page, page.locator("#line"));
      await page.clock.runFor(REST);
      await expect(page.locator('#line .ec-stop[data-key="goals@1"]')).toBeFocused();
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  for (const colorScheme of ["light", "dark"] as const) {
    test(`morph.html with the season's other views shown, a column focused, and mid-switch, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page, morphDemo);
      const view = (name: string) => page.getByRole("group", { name: "View" }).getByRole("button", { name, exact: true });
      await view("Season to date").click();
      await page.clock.runFor(REST);
      expect(await axeViolations(page)).toEqual([]);
      await view("Columns").click();
      await page.clock.runFor(REST);
      await tabInto(page, page.locator("#season"));
      await expect(page.locator('#season .ec-mark[data-key="goals@1"]')).toBeFocused();
      expect(await axeViolations(page)).toEqual([]);
      await view("Per match").click();
      await page.clock.runFor(300);
      const views = page.locator("#season .ec-switch-view.ec-switching");
      await expect(views).toHaveCount(2);
      expect(await axeViolations(page)).toEqual([]);
      await expect(views).toHaveCount(2);
    });
  }

  test("morph.html mid-switch, with both views out of reach", async ({ page }) => {
    await openAtRest(page, morphDemo);
    await page.locator("#toggle").click();
    await page.clock.runFor(300);
    const views = page.locator("#shots .ec-switch-view");
    await expect(views).toHaveClass([/ec-switching/, /ec-switching/]);
    expect(await axeViolations(page)).toEqual([]);
    // axe moved the clock a little, and the switch is still under way.
    await expect(views).toHaveClass([/ec-switching/, /ec-switching/]);
  });
});

test.describe("forced colours", () => {
  // Windows contrast themes replace a page's colours with the viewer's, but not SVG fills and strokes,
  // so the marks keep their colours and each legend must too: its swatches opt out.
  test.skip(({ browserName }) => browserName !== "chromium", FORCED_IN_CHROMIUM);

  for (const { name, demo } of demos) {
    test(`${name}.html: each legend's swatches keep their own colours`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: "active" });
      await openAtRest(page, demo);
      // The bar chart has a legend only for a stack.
      if (demo === barsDemo) await pickMetric(page, "Goals + assists");
      const legends = await page.evaluate(() =>
        [...document.querySelectorAll(".ec-legend, .legend")]
          .filter((legend) => legend.getBoundingClientRect().width > 0)
          .map((legend) =>
            [...legend.querySelectorAll(".ec-legend-swatch, i")].map((swatch) => {
              const style = getComputedStyle(swatch);
              return style.borderTopWidth === "0px" ? style.backgroundColor : style.borderTopColor;
            })
          )
      );
      expect(legends.length).toBeGreaterThan(0);
      for (const colors of legends) expect(new Set(colors).size, colors.join(", ")).toBe(colors.length);
    });

    test(`${name}.html: a pressed toggle shows in the viewer's selection colours, not only in bold`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: "active" });
      await openAtRest(page, demo);
      const toggles = await page.evaluate(() => {
        const probe = document.body.appendChild(document.createElement("div"));
        probe.style.background = "Highlight";
        const highlight = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return [...document.querySelectorAll("button[aria-pressed]")].map(
          (button) => `${button.textContent} ${button.getAttribute("aria-pressed")} ${getComputedStyle(button).backgroundColor === highlight}`
        );
      });
      expect(toggles.length).toBeGreaterThan(0);
      for (const toggle of toggles) expect(toggle).toMatch(/ (true true|false false)$/);
    });
  }
});

/**
 * The element with focus, as its accessible name, whether something shows where it is, and whether
 * this pass has been there before (`fresh` starts a pass).
 */
async function focusStop(page: Page, fresh = false): Promise<{ readonly name: string; readonly visible: boolean; readonly again: boolean } | undefined> {
  return page.evaluate((fresh) => {
    const pass = window as unknown as { visited?: WeakSet<Element> };
    if (fresh || !pass.visited) pass.visited = new WeakSet();
    const element = document.activeElement;
    if (!element || element === document.body) return undefined;
    const again = pass.visited.has(element);
    pass.visited.add(element);
    const name = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().replace(/\s+/g, " ");
    // A chart's mark shows the ring the chart draws; everything else, its outline.
    const svg = element.closest("svg");
    if (svg && element !== svg) {
      const ring = svg.querySelector(".ec-focus-ring");
      return { name, again, visible: ring !== null && getComputedStyle(ring).visibility === "visible" && ring.getBoundingClientRect().width > 0 };
    }
    const style = getComputedStyle(element);
    return { name, again, visible: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 };
  }, fresh);
}

test.describe("keyboard", () => {
  for (const { name, demo, stops } of demos) {
    test(`${name}.html: every tab stop in order, each with a visible focus, and Shift+Tab back`, async ({ page }) => {
      // 57 stops each way on a large page, and WebKit in Docker takes most of a second over each.
      if (demo === stressDemo) test.setTimeout(300_000);
      await openAtRest(page, demo);
      // Past the last stop, Chromium moves focus off the page, and Firefox and WebKit keep it there.
      const forward: string[] = [];
      for (let presses = 0; presses < 60; presses++) {
        await page.keyboard.press("Tab");
        await page.clock.runFor(FRAME);
        const stop = await focusStop(page, presses === 0);
        if (!stop || stop.again) break;
        expect(stop.visible, `focus on "${stop.name}" shows nothing`).toBe(true);
        forward.push(stop.name);
      }
      expect(forward).toEqual(stops);
      // And back, from where that left focus, through every stop: none holds focus.
      const back: string[] = [];
      const last = await focusStop(page, true);
      if (last) back.push(last.name);
      for (let presses = 0; presses < 60; presses++) {
        await page.keyboard.press("Shift+Tab");
        await page.clock.runFor(FRAME);
        const stop = await focusStop(page);
        if (!stop || stop.again) break;
        back.push(stop.name);
      }
      expect(back.reverse()).toEqual(stops);
    });

    for (const { chart } of demos.find((d) => d.demo === demo)!.charts) {
      test(`${name}.html, ${chart}: the tooltip never covers the focus ring, at any mark`, async ({ page }) => {
        // About 50 stops before the chart and 20 marks in it, on a large page: minutes in WebKit in Docker.
        if (demo === stressDemo) test.setTimeout(300_000);
        await openAtRest(page, demo);
        await tabInto(page, page.locator(chart));
        const seen = new Set<string>();
        for (;;) {
          await page.clock.runFor(REST);
          const { label, overlap } = await page.evaluate((selector) => {
            const root = document.querySelector(selector)!;
            const tooltip = root.querySelector(".ec-tooltip.ec-tooltip-shown")?.getBoundingClientRect();
            const rings = [...root.querySelectorAll<SVGGraphicsElement>(".ec-focus-ring")].filter((ring) => getComputedStyle(ring).visibility === "visible");
            // The ring as drawn: a stroke along the mark's outline, half of it outside. Browsers
            // disagree on getBoundingClientRect() for a stroke, so it's the fill box plus half the stroke.
            const drawn = (ring: SVGGraphicsElement): DOMRect => {
              const box = ring.getBBox();
              const half = parseFloat(getComputedStyle(ring).strokeWidth) / 2 || 0;
              const screen = ring.getScreenCTM()!;
              const a = new DOMPoint(box.x - half, box.y - half).matrixTransform(screen);
              const b = new DOMPoint(box.x + box.width + half, box.y + box.height + half).matrixTransform(screen);
              return new DOMRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
            };
            const area = (box: DOMRect): number =>
              tooltip
                ? Math.max(0, Math.min(box.right, tooltip.right) - Math.max(box.left, tooltip.left)) *
                  Math.max(0, Math.min(box.bottom, tooltip.bottom) - Math.max(box.top, tooltip.top))
                : NaN;
            return { label: document.activeElement?.getAttribute("aria-label") ?? "", overlap: rings.map((ring) => area(drawn(ring))) };
          }, chart);
          if (seen.has(label)) break;
          seen.add(label);
          expect(overlap.length, `${label}: a ring`).toBeGreaterThan(0);
          expect(overlap, `${label}: the tooltip, clear of the ring`).toEqual(overlap.map(() => 0));
          await page.keyboard.press("ArrowRight");
        }
        expect(seen.size).toBeGreaterThan(1);
      });
    }
  }
});

/** The pages with a library chart, which draws a tooltip and dims as these checks expect. */
const withTooltips = demos.filter(({ charts }) => charts.length > 0);

test.describe("content on hover", () => {
  for (const { name, demo, charts } of withTooltips) {
    test(`${name}.html: the tooltip stays while the pointer does, and Escape hides it without the pointer moving`, async ({ page }) => {
      await openAtRest(page, demo);
      for (const { chart, shape } of charts) {
        const tooltip = page.locator(`${chart} .ec-tooltip`);
        const at = await hoverShape(page, page.locator(`${chart} ${shape}`));
        await page.clock.runFor(REST * 2);
        await expect(tooltip, `${chart}: persistent`).toHaveClass(/ec-tooltip-shown/);
        await page.keyboard.press("Escape");
        await page.clock.runFor(REST);
        await expect(tooltip, `${chart}: dismissible`).not.toHaveClass(/ec-tooltip-shown/);
        // It stays dismissed while the pointer stays on the mark, and comes back once the pointer
        // moves off and onto a mark again.
        await page.mouse.move(at.x + 1, at.y);
        await page.clock.runFor(REST);
        await expect(tooltip).not.toHaveClass(/ec-tooltip-shown/);
        await page.mouse.move(2, 2);
        await page.mouse.move(at.x, at.y);
        await page.clock.runFor(REST);
        await expect(tooltip).toHaveClass(/ec-tooltip-shown/);
        await page.mouse.move(2, 2);
        await page.clock.runFor(REST);
      }
    });

    test(`${name}.html: the pointer goes from a mark onto its tooltip and across it, then off it onto another mark or away`, async ({ page }) => {
      // A large page, where WebKit in Docker takes a while over each move.
      if (demo === stressDemo) test.setTimeout(300_000);
      await openAtRest(page, demo);
      for (const { chart, shape, other } of charts) {
        for (const away of ["away", "another mark"] as const) {
          const at = await hoverShape(page, page.locator(`${chart} ${shape}`));
          await page.clock.runFor(REST);
          const start = await hovered(page, chart);
          expect(start.text, `${chart}: a tooltip`).toBeTruthy();
          const { path, bridge } = await pathOntoTooltip(page, chart, at);
          // Where the bridge's trapezoid leaves its box out, the pointer goes through to the chart.
          expect(bridge.mismatched, `${chart}: points the bridge takes, or doesn't, against its shape`).toEqual([]);
          // A pointer that lands on whole pixels, as Firefox's does: every move keeps the hover.
          for (const point of path) {
            await page.mouse.move(point.x, point.y);
            expect(await hovered(page, chart), `${chart}: at ${point.x}, ${point.y}`).toEqual(start);
          }
          if (away === "away") {
            await page.mouse.move(2, 2);
            expect(await hovered(page, chart), `${chart}: off the tooltip, away`).toEqual({ text: undefined, hot: [] });
          } else {
            await hoverShape(page, page.locator(`${chart} ${other}`));
            const next = await hovered(page, chart);
            expect(next.text, `${chart}: off the tooltip, another mark's`).toBeTruthy();
            expect(next.text).not.toBe(start.text);
            expect(next.hot).not.toEqual(start.hot);
            await page.mouse.move(2, 2);
          }
          await page.clock.runFor(REST);
        }
      }
    });

    test(`${name}.html: Escape with the pointer on the tooltip hides it until the pointer moves`, async ({ page }) => {
      if (demo === stressDemo) test.setTimeout(300_000);
      await openAtRest(page, demo);
      for (const { chart, shape } of charts) {
        const at = await hoverShape(page, page.locator(`${chart} ${shape}`));
        await page.clock.runFor(REST);
        const { path } = await pathOntoTooltip(page, chart, at);
        for (const point of path) await page.mouse.move(point.x, point.y);
        const on = path[path.length - 1]!;
        expect((await hovered(page, chart)).text, `${chart}: on the tooltip`).toBeTruthy();
        await page.keyboard.press("Escape");
        await page.clock.runFor(REST);
        // The browser may hit-test again under a still pointer, now the tooltip has gone: give it time.
        await page.waitForTimeout(250);
        await page.clock.runFor(REST);
        expect(await hovered(page, chart), `${chart}: dismissed`).toEqual({ text: undefined, hot: [] });
        // As after Escape on a mark, it hovers again once the pointer moves off and onto a mark: here,
        // whatever was under the tooltip, if anything was.
        const under = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest(".ec-mark, .ec-column")), on);
        await page.mouse.move(2, 2);
        await page.mouse.move(on.x, on.y);
        expect((await hovered(page, chart)).text !== undefined, `${chart}: moved off and back, hovering what's under it`).toBe(under);
        await page.mouse.move(2, 2);
        await page.clock.runFor(REST);
      }
    });
  }
});

test.describe("content on hover, under the pointer", () => {
  test("line.html: a tooltip that comes up under the pointer lets it through, until the pointer has been off it", async ({ page }) => {
    await openAtRest(page, lineDemo);
    // Week 12's column, half way down: its tooltip, above its highest point, comes up over the pointer.
    const column = (await page.locator('#line .ec-column[data-key="12"] .ec-hit').boundingBox())!;
    const start = { x: Math.round(column.x + column.width / 2), y: Math.round(column.y + column.height / 2) };
    await page.mouse.move(start.x, start.y);
    /** The x hovered, by its points, and the x under the pointer with the tooltip left out. */
    const state = (x: number, y: number) =>
      page.evaluate(
        ({ x, y }) => {
          const root = document.querySelector("#line")!;
          const box = root.querySelector(".ec-tooltip.ec-tooltip-shown")?.getBoundingClientRect();
          const under = document
            .elementsFromPoint(x, y)
            .find((element) => !element.closest(".ec-tooltip-layer"))
            ?.closest(".ec-column")
            ?.getAttribute("data-key");
          const hot = root.querySelector(".ec-point.ec-hot")?.getAttribute("data-key")?.split("@")[1];
          return { hot, under, covered: box !== undefined && x > box.left && x < box.right && y > box.top && y < box.bottom };
        },
        { x, y }
      );
    expect(await state(start.x, start.y)).toEqual({ hot: "12", under: "12", covered: true });
    // Along the chart through the tooltip, 2 px a move: the crosshair follows the pointer.
    const seen = new Set<string>();
    for (let x = start.x + 2; x <= start.x + 40; x += 2) {
      await page.mouse.move(x, start.y);
      const now = await state(x, start.y);
      expect(now.hot, `at ${x}`).toBe(now.under);
      seen.add(now.hot!);
    }
    expect(seen.size, "the x's it went through").toBeGreaterThan(2);
    // Off it, below, and back onto it: now it holds, and moving across it keeps the x.
    const box = (await page.locator("#line .ec-tooltip").boundingBox())!;
    const middle = Math.round(box.x + box.width / 2);
    await page.mouse.move(middle, Math.round(box.y + box.height + 6));
    const held = await state(middle, Math.round(box.y + box.height + 6));
    await page.mouse.move(middle, Math.round(box.y + box.height - 4));
    for (const x of [middle - 20, middle + 20]) {
      await page.mouse.move(x, Math.round(box.y + box.height - 4));
      expect((await state(x, Math.round(box.y + box.height - 4))).hot, `on the tooltip at ${x}`).toBe(held.hot);
    }
  });
});

/** What a chart shows as hovered: its tooltip's text, if it shows, and the keys of the marks and points emphasised. */
function hovered(page: Page, chart: string): Promise<{ text: string | undefined; hot: (string | null)[] }> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector)!;
    return {
      text: root.querySelector(".ec-tooltip.ec-tooltip-shown")?.textContent ?? undefined,
      hot: [...root.querySelectorAll(".ec-hot")].map((element) => element.getAttribute("data-key"))
    };
  }, chart);
}

/**
 * A pointer's path from the hovered mark onto its tooltip, in whole pixels: from the mark's pixel
 * nearest the box under it, straight across the gap and into the box's middle, 2 px a move, then across
 * it to each side, 8 px a move. And a check of the bridge over the gap against its clip-path: points inside
 * its trapezoid take the pointer and points outside don't, so it doesn't block more than it should.
 */
async function pathOntoTooltip(
  page: Page,
  chart: string,
  at: { x: number; y: number }
): Promise<{ path: { x: number; y: number }[]; bridge: { mismatched: string[] } }> {
  return page.evaluate(
    ({ selector, at }) => {
      const root = document.querySelector(selector)!;
      const tip = root.querySelector<HTMLElement>(".ec-tooltip.ec-tooltip-shown")!;
      const box = tip.getBoundingClientRect();
      const above = tip.getAttribute("data-side") === "above";
      /** What the pointer would hit at a point without the tooltip there, and the mark or x it belongs to. */
      const target = (x: number, y: number): Element | null | undefined =>
        document
          .elementsFromPoint(x, y)
          .find((element) => !element.closest(".ec-tooltip-layer"))
          ?.closest(".ec-mark, .ec-column");
      const mine = target(at.x, at.y)!;
      // The mark's pixel nearest the box's edge, under it, nearest its middle when several are as near.
      const edge = Math.round(above ? box.bottom : box.top);
      const middle = box.left + box.width / 2;
      let best = { x: Math.round(at.x), y: Math.round(at.y), d: Infinity };
      for (let x = Math.ceil(box.left + 6); x <= box.right - 6; x += 2) {
        for (let d = 1; d <= Math.min(best.d, 200); d++) {
          const y = above ? edge + d : edge - d;
          if (target(x, y) !== mine) continue;
          if (d < best.d || Math.abs(x - middle) < Math.abs(best.x - middle)) best = { x, y, d };
          break;
        }
      }
      const corner = { x: best.x, y: above ? edge + 1 : edge - 1 };
      const centre = { x: Math.round(middle), y: Math.round(box.top + box.height / 2) };
      const stops = [best, corner, centre, { x: Math.round(box.left + 4), y: centre.y }, { x: Math.round(box.right - 4), y: centre.y }];
      const path: { x: number; y: number }[] = [{ x: best.x, y: best.y }];
      for (let i = 1; i < stops.length; i++) {
        const from = stops[i - 1]!;
        const to = stops[i]!;
        const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (i < 3 ? 2 : 8)));
        for (let step = 1; step <= steps; step++) path.push({ x: Math.round(from.x + ((to.x - from.x) * step) / steps), y: Math.round(from.y + ((to.y - from.y) * step) / steps) });
      }
      // The bridge, where there's one: every 3 px over its box, more than 1.5 px from its trapezoid's edges.
      const mismatched: string[] = [];
      const bridge = root.querySelector<HTMLElement>(".ec-tooltip-bridge");
      if (bridge && !bridge.hidden) {
        const rect = bridge.getBoundingClientRect();
        const numbers = (getComputedStyle(bridge).clipPath.match(/-?[\d.]+(?=px)/g) ?? []).map(Number);
        const corners = [0, 2, 4, 6].map((i) => ({ x: rect.left + numbers[i]!, y: rect.top + numbers[i + 1]! }));
        // Signed distance inside each edge of the convex, clockwise trapezoid: the least is how far in the point is.
        const inside = (x: number, y: number): number =>
          Math.min(
            ...corners.map((a, i) => {
              const b = corners[(i + 1) % corners.length]!;
              const length = Math.hypot(b.x - a.x, b.y - a.y);
              return length === 0 ? Infinity : ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) / length;
            })
          );
        for (let y = rect.top + 1.5; y < rect.bottom - 1; y += 3) {
          for (let x = rect.left + 1.5; x < rect.right - 1; x += 3) {
            const depth = inside(x, y);
            if (Math.abs(depth) < 1.5) continue;
            const taken = document.elementsFromPoint(x, y).includes(bridge);
            if (taken !== depth > 0) mismatched.push(`${Math.round(x)}, ${Math.round(y)}: ${taken ? "taken" : "not taken"}`);
          }
        }
      }
      return { path, bridge: { mismatched } };
    },
    { selector: chart, at }
  );
}

test.describe("contrast on hover", () => {
  // WCAG 1.4.3 while a mark is hovered, which axe never sees: the other marks dim, and every text in
  // the chart keeps 4.5:1 against the card behind it. A text's colour is its fill at the opacity it's
  // drawn with (its own and every ancestor's), over that card.
  for (const { name, demo, charts } of withTooltips) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${name}.html, ${colorScheme}: every label keeps 4.5:1 while another mark is hovered`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await openAtRest(page, demo);
        for (const { chart, shape } of charts) {
          await hoverShape(page, page.locator(`${chart} ${shape}`));
          await page.clock.runFor(REST);
          const { dimmed, texts } = await page.evaluate((selector) => {
            // The hover's CSS transitions run on the browser's own time, not the fake clock: to their end.
            for (const animation of document.getAnimations()) animation.finish();
            const root = document.querySelector(selector)!;
            const rgb = (color: string): number[] | undefined => {
              const match = /^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?\)$/.exec(color);
              return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : undefined;
            };
            const opacity = (element: Element): number => {
              let product = 1;
              for (let at: Element | null = element; at; at = at.parentElement) product *= Number(getComputedStyle(at).opacity);
              return product;
            };
            const luminance = ([r, g, b]: number[]): number => {
              const linear = (c: number): number => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
              return 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
            };
            let card: number[] = [255, 255, 255];
            for (let at: Element | null = root; at; at = at.parentElement) {
              const background = rgb(getComputedStyle(at).backgroundColor);
              if (background && background[3]! > 0) {
                card = background;
                break;
              }
            }
            const hovering = root.querySelector(".ec-chart.ec-hovering");
            const parts = hovering ? [...hovering.querySelectorAll(".ec-mark:not(.ec-hot) > .ec-body > *")] : [];
            return {
              dimmed: parts.length > 0 && parts.every((part) => opacity(part) < 0.5),
              texts: [...root.querySelectorAll("svg text")]
                .filter((text) => text.textContent?.trim() && !text.closest(".ec-icon") && getComputedStyle(text).visibility === "visible" && text.getBoundingClientRect().width > 0)
                .map((text) => {
                  const style = getComputedStyle(text);
                  const fill = rgb(style.fill) ?? [0, 0, 0, 0];
                  const alpha = fill[3]! * Number(style.fillOpacity) * opacity(text);
                  const drawn = card.map((c, i) => alpha * fill[i]! + (1 - alpha) * c);
                  const [light, dark] = [luminance(drawn), luminance(card)].sort((a, b) => b - a);
                  return { text: text.textContent!.trim(), ratio: Math.round(((light! + 0.05) / (dark! + 0.05)) * 100) / 100 };
                })
            };
          }, chart);
          // The line chart doesn't dim; the others do, or this checks nothing.
          if ((await page.locator(`${chart} .ec-mark`).count()) > 0) expect(dimmed, `${chart}: the other marks dimmed`).toBe(true);
          expect(texts.length, `${chart}: text to check`).toBeGreaterThan(0);
          expect(texts.filter(({ ratio }) => ratio < 4.5), `${chart}: text under 4.5:1`).toEqual([]);
          await page.mouse.move(2, 2);
          await page.clock.runFor(REST);
        }
      });
    }
  }
});

test.describe("text spacing", () => {
  // WCAG 1.4.12's spacing, as a viewer's own stylesheet would set it after the page has loaded.
  const SPACING = "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";

  for (const { name, demo } of demos) {
    test(`${name}.html: no chart's text overlaps other text or leaves its card`, async ({ page }) => {
      await openAtRest(page, demo);
      await page.addStyleTag({ content: SPACING });
      await page.clock.runFor(REST);
      const problems = await page.evaluate(() => {
        const found: string[] = [];
        for (const svg of document.querySelectorAll("svg")) {
          const card = svg.closest(".card")?.getBoundingClientRect();
          const texts = [...svg.querySelectorAll("text")]
            .filter((text) => text.textContent?.trim() && !text.closest(".ec-icon") && getComputedStyle(text).visibility === "visible")
            .map((text) => ({ text: text.textContent!.trim(), box: text.getBoundingClientRect() }))
            .filter(({ box }) => box.width > 0);
          // A text's box is its line box, which Firefox and WebKit draw a little taller than the
          // glyphs: two stacked lines' boxes touch. Its middle 60% is where glyphs collide.
          const core = (box: DOMRect): { top: number; bottom: number } => ({ top: box.top + box.height * 0.2, bottom: box.bottom - box.height * 0.2 });
          texts.forEach(({ text, box }, i) => {
            if (card && (box.left < card.left || box.right > card.right)) found.push(`"${text}" leaves its card`);
            for (const other of texts.slice(i + 1)) {
              const width = Math.min(box.right, other.box.right) - Math.max(box.left, other.box.left);
              const height = Math.min(core(box).bottom, core(other.box).bottom) - Math.max(core(box).top, core(other.box).top);
              if (width > 1 && height > 1) found.push(`"${text}" overlaps "${other.text}"`);
            }
          });
        }
        return found;
      });
      expect(problems).toEqual([]);
    });
  }
});

test.describe("pause, stop, hide", () => {
  // WCAG 2.2.2: what moves by itself for more than 5 s needs a pause. Only the bars page, the line page
  // and the shapes page play at load (the bars drawing in, about 750 ms, and each ball's first trip,
  // about 1.4 s and 3 s), and Play season has Pause (line.spec.ts).
  for (const { name, demo } of demos) {
    test(`${name}.html: nothing moves by itself 5 s after load`, async ({ page }) => {
      await openDemo(page, demo);
      await page.clock.runFor(4000);
      const at5 = await page.evaluate(() => document.body.innerHTML);
      await page.clock.runFor(REST);
      expect(await page.evaluate(() => document.body.innerHTML)).toBe(at5);
    });
  }
});
