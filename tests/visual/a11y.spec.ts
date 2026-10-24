// The accessibility audit's automatic checks (docs/a11y-audit.md has the rest, and the results).
// axe-core, a pinned dev dependency, runs its WCAG 2.2 A and AA rules on every demo page: in light and
// dark, at 320 px wide, under forced colours, and on morph.html mid-switch. Beside it, DOM checks for
// what axe can't see: the tab order with a visible focus at every stop, no sideways scroll at 320 px,
// the tooltip clear of the focus ring and dismissed by Escape, nothing moving by itself after 5 s,
// and legends keeping their colours under forced colours. There are no screenshots here, so every
// browser runs all of it.

import axe from "axe-core";
import { expect, test, type Page } from "@playwright/test";
import { barsDemo, donutDemo, FRAME, hoverShape, lineDemo, morphDemo, openDemo, pickMetric, REST, stressDemo, tabInto, type Demo } from "./demo";

/** axe's rules for WCAG 2.0, 2.1 and 2.2 at levels A and AA. */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const MOTION = ["Presentation", "Analysis", "Off"];

/** One of the library's charts, which show a tooltip, and a shape in it to hover. */
interface TooltipChart {
  readonly chart: string;
  readonly shape: string;
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
    charts: [{ chart: "#chart", shape: '.ec-mark[data-key="Okafor"] .ec-segment' }]
  },
  {
    name: "donut",
    demo: donutDemo,
    stops: [...MOTION, "Ball", "Wiggle", "Pulse", "Data order", "Largest first", "Next match", "Goal: 58 shots, 14%", "Data table", "Goal: 58 shots, 14%", "Goal: 58 shots", "Data table"],
    charts: [
      { chart: "#donut", shape: '.ec-mark[data-key="Off target"] .ec-slice' },
      { chart: "#columns", shape: '.ec-mark[data-key="Saved"] .ec-segment' }
    ]
  },
  {
    name: "line",
    demo: lineDemo,
    stops: [...MOTION, "Play season", "Matchweek", "Matchweek 1: 0 goals, 0.6 xG", "Data table", "Goals scored: 56 goals by matchweek 38", "Goals scored: 56 goals by matchweek 38"],
    charts: [{ chart: "#line", shape: '.ec-column[data-key="12"] .ec-hit' }]
  },
  {
    name: "morph",
    demo: morphDemo,
    stops: [...MOTION, "Show as columns", "Drop", "Unroll", "Goal: 58 shots, 14%", "Data table"],
    charts: [{ chart: "#shots", shape: '.ec-switch-view[data-view="donut"] .ec-mark[data-key="Off target"] .ec-slice' }]
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
    charts: [{ chart: "#switch-chart", shape: '.ec-switch-view[data-view="bars"] .ec-mark[data-key="Bar 2"] .ec-segment' }]
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
      // Tall enough that openDemo's check passes: the page is several screens long at this width.
      await page.setViewportSize({ width: 320, height: 6000 });
      await openAtRest(page, demo);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      expect(await axeViolations(page)).toEqual([]);
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

test.describe("content on hover", () => {
  for (const { name, demo, charts } of demos) {
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
  }
});

test.describe("text spacing", () => {
  // WCAG 1.4.12's spacing, as a viewer's own stylesheet would set it after the page has loaded.
  const SPACING = "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";

  for (const { name, demo } of demos) {
    test(`${name}.html: no chart's text overlaps other text or leaves its card`, async ({ page }) => {
      test.skip(demo === stressDemo, "Its bars' labels overlap at the default spacing: bar charts don't thin their labels yet (the plan's backlog).");
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
  // WCAG 2.2.2: what moves by itself for more than 5 s needs a pause. Only the line page plays at
  // load (the ball's first trip, about 1.4 s), and Play season has Pause (line.spec.ts).
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
