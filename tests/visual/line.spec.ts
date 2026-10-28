// Screenshots of demo/line.html on a stopped clock: the theme at rest, both charts mid-play at week 20,
// the crosshair with its tooltip, keyboard focus, the D3 line hovered, the Vega-Lite line at rest,
// hovered and focused, the first chart's lines curved and the Vega-Lite line with them, a point hovered
// and focused with Nearest point, and the charts with missing weeks mid-play in a gap, and at a missing
// week hovered and focused.
// Beside them, DOM checks: how long Play takes in each mode, reduced motion, the scrubber, the names,
// legend and table, the Vega-Lite line following a resize, the toggles (each pick pressed, focus kept
// on it, the chart's tab stop kept), the curve (through every week's value, never past the values
// either side, eased, the red and the ball following, and at once without motion), Nearest point (the
// other line and its decorations dimmed, no text, the tooltip's point and words, the keys, Escape, and
// at once without motion), and the gaps: no red in them, the ball waiting and jumping, and a gap
// staying a gap without motion. Names start with "line-", since screenshot names are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { FRAME, iconTransforms, lineDemo, openDemo, pickMode, REST, tabInto } from "./demo";

/** The library's line chart, the D3 line that expressive() drives, and the scrubber with both charts. */
const line = (page: Page): Locator => page.locator("#line");
const d3Line = (page: Page): Locator => page.locator("#d3-line");
const d3Box = (page: Page): Locator => page.locator(".d3-box");
const season = (page: Page): Locator => page.locator("#season");
/** The Vega-Lite line that fromVegaView() reads, and its card's box with the page's legend. */
const vegaLine = (page: Page): Locator => page.locator("#vega-line");
const vegaBox = (page: Page): Locator => page.locator(".vega-box");
/** A series' path on the Vega-Lite line, by the stroke the page gives Vega for it (vega-line.ts). */
const vegaPath = (page: Page, series: "goals" | "xg"): Locator =>
  vegaLine(page).locator(`.mark-line path[stroke="${series === "goals" ? "#2a78d6" : "#75736d"}"]`);

const playButton = (page: Page): Locator => page.locator("#play button");
const slider = (page: Page): Locator => page.getByRole("slider", { name: "Matchweek" });
const status = (page: Page): Locator => page.locator("#week-status");

/** A matchweek's focus stop on the line chart, which holds its hit column. */
const week = (page: Page, n: number): Locator => line(page).locator(`.ec-column[data-key="${n}"]`);
/** A series' path on the D3 line, by the class the page's D3 code gives it. */
const d3Path = (page: Page, series: "goals" | "xg"): Locator => d3Line(page).locator(`path.line-${series}`);

/** The library's line chart with missing weeks, the D3 line drawn with .defined(), and their two cards. */
const gaps = (page: Page): Locator => page.locator("#gaps");
const d3Gaps = (page: Page): Locator => page.locator("#d3-gaps");
const gapsPair = (page: Page): Locator => season(page).locator(".pair").nth(1);
const gapsWeek = (page: Page, n: number): Locator => gaps(page).locator(`.ec-column[data-key="${n}"]`);
/** Each chart's strokes by series: the line chart's, and the D3 code's paths. */
const STROKES = {
  "#gaps": { goals: '.ec-line[data-key="goals"] .ec-stroke', xg: '.ec-line[data-key="xg"] .ec-stroke' },
  "#d3-gaps": { goals: "path.line-goals", xg: "path.line-xg" }
} as const;

interface Gaps {
  /** Where each line has no value: from the last x of one subpath of its stroke to the first of the next, on screen. */
  readonly goals: [number, number][];
  readonly xg: [number, number][];
  /** Where the goals line ends, on screen. */
  readonly end: number;
  /** The screen x of every point of the red runs threshold draws on the goals line. */
  readonly reds: number[];
  /** The middle of the ball, on screen, if one is drawn. */
  readonly ball?: number;
}

/** The gaps in a chart's lines, the red runs and the ball, as drawn. */
async function drawnGaps(page: Page, chart: keyof typeof STROKES): Promise<Gaps> {
  return page.locator(chart).evaluate((root, strokes) => {
    /** A path's points on screen, by subpath: each "M" starts one. */
    const subpaths = (path: SVGGraphicsElement): number[][] => {
      const ctm = path.getScreenCTM()!;
      return (path.getAttribute("d") ?? "")
        .split("M")
        .filter((part) => part.trim())
        .map((part) => {
          const numbers = (part.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
          return numbers.flatMap((x, i) => (i % 2 === 0 ? [new DOMPoint(x, numbers[i + 1]).matrixTransform(ctm).x] : []));
        });
    };
    const gapsOf = (selector: string): [number, number][] => {
      const runs = subpaths(root.querySelector<SVGGraphicsElement>(selector)!);
      return runs.slice(1).map((run, i) => [Math.max(...runs[i]!), Math.min(...run)]);
    };
    const run = root.querySelector('.ec-overlay .ec-run[data-key="goals"]');
    const reds = [...(run?.querySelectorAll<SVGGraphicsElement>("path") ?? [])].filter((path) => !path.closest(".ec-icon")).flatMap((path) => subpaths(path).flat());
    const icon = run?.querySelector(".ec-icon")?.getBoundingClientRect();
    const end = Math.max(...subpaths(root.querySelector<SVGGraphicsElement>(strokes.goals)!).flat());
    return { goals: gapsOf(strokes.goals), xg: gapsOf(strokes.xg), end, reds, ball: icon ? icon.x + icon.width / 2 : undefined };
  }, STROKES[chart]);
}

/** The red points inside a gap of either line, half a pixel in from its ends: none, if threshold leaves the gaps alone. */
const redInGaps = ({ goals, xg, reds }: Gaps): number[] => reds.filter((x) => [...goals, ...xg].some(([from, to]) => x > from + 0.5 && x < to - 0.5));

/** The focus at a week with no values, as drawn: how many lines, their stroke's width and contrast against `--ec-surface`, and whether they stand where the crosshair is. */
async function focusLines(chart: Locator): Promise<{ readonly count: number; readonly width: string; readonly contrast: number; readonly onCrosshair: boolean }> {
  return chart.evaluate((root) => {
    const lines = [...root.querySelectorAll<SVGLineElement>(".ec-focus line.ec-focus-ring")];
    const line = lines[0];
    if (!line) return { count: 0, width: "", contrast: 0, onCrosshair: false };
    const crosshair = root.querySelector(".ec-crosshair")!;
    /** A CSS colour's WCAG 2 luminance, as the browser resolves it on a probe. */
    const luminance = (color: string): number => {
      const probe = root.appendChild(document.createElement("i"));
      probe.style.color = color;
      const [r, g, b] = getComputedStyle(probe)
        .color.match(/[\d.]+/g)!
        .map((value) => {
          const c = Number(value) / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      probe.remove();
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const style = getComputedStyle(line);
    const [hi, lo] = [luminance(style.stroke), luminance(style.getPropertyValue("--ec-surface"))].sort((a, b) => b - a) as [number, number];
    const x = crosshair.getAttribute("x1");
    return { count: lines.length, width: style.strokeWidth, contrast: (hi + 0.05) / (lo + 0.05), onCrosshair: line.getAttribute("x1") === x && line.getAttribute("x2") === x };
  });
}

/** The red runs threshold draws on each chart's goals line (the ball's own paths are inside its icon). */
async function redRuns(chart: Locator): Promise<number> {
  return chart.locator('.ec-overlay .ec-run[data-key="goals"] path').evaluateAll((paths) => paths.filter((path) => !path.closest(".ec-icon")).length);
}

/** Opens the page and lets the decoration's first trip, the ball rolling the whole season, finish. */
async function openAtRest(page: Page): Promise<void> {
  await openDemo(page, lineDemo);
  await page.clock.runFor(REST);
}

/**
 * Moves the pointer onto a goals line, about `share` of the way along it: hover() would aim at its
 * box's middle, off the stroke. Firefox's pointer lands on whole pixels, so it aims at the first whole
 * pixel on or after that point that's on the stroke.
 */
async function hoverD3Goals(page: Page, share = 0.3, path: Locator = d3Path(page, "goals")): Promise<void> {
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

/** A toggle above the first chart, by its text. */
const toggle = (page: Page, name: "Straight" | "Curved" | "Each week" | "Nearest point"): Locator => page.getByRole("button", { name, exact: true });
/** A line's stroke on the first chart. */
const stroke = (page: Page, series: "goals" | "xg"): Locator => line(page).locator(`.ec-line[data-key="${series}"] .ec-stroke`);
/** A point's focus stop with Nearest point, by its key: "goals@12". */
const pointStop = (page: Page, key: string): Locator => line(page).locator(`.ec-stop[data-key="${key}"]`);

/**
 * How a line on the first chart runs: its vertices, the weeks whose point the stroke misses (no vertex
 * within 0.05 px of the point's dot), and the weeks after which it goes above or below both weeks'
 * values on the way to the next (more than 0.05 px past either).
 */
async function runOf(page: Page, series: "goals" | "xg"): Promise<{ readonly vertices: number; readonly missed: string[]; readonly overshoots: string[] }> {
  return line(page).evaluate((root, series) => {
    const d = root.querySelector(`.ec-line[data-key="${series}"] .ec-stroke`)?.getAttribute("d") ?? "";
    const numbers = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    const vertices = numbers.flatMap((x, i) => (i % 2 === 0 ? [{ x, y: numbers[i + 1]! }] : []));
    const points = [...root.querySelectorAll<SVGGraphicsElement>(`.ec-point[data-series="${series}"] .ec-dot`)].map((dot) => {
      const box = dot.getBBox();
      return { week: dot.closest("[data-key]")!.getAttribute("data-key")!, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    const missed = points.filter((p) => !vertices.some((v) => Math.hypot(v.x - p.x, v.y - p.y) < 0.05)).map((p) => p.week);
    const overshoots = points.slice(1).flatMap((to, i) => {
      const from = points[i]!;
      const [lo, hi] = [Math.min(from.y, to.y), Math.max(from.y, to.y)];
      return vertices.some((v) => v.x > from.x && v.x < to.x && (v.y < lo - 0.05 || v.y > hi + 0.05)) ? [from.week] : [];
    });
    return { vertices: vertices.length, missed, overshoots };
  }, series);
}

/** Moves the pointer onto a point's dot on the first chart, by its key: with Nearest point, it hovers that point. */
async function hoverPoint(page: Page, key: string): Promise<{ x: number; y: number }> {
  const box = (await line(page).locator(`.ec-point[data-key="${key}"] .ec-dot`).boundingBox())!;
  const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  await page.mouse.move(at.x, at.y);
  return at;
}

/**
 * The first chart as a point hover leaves it: the opacity each line's stroke and end dot, and each line's
 * decoration (threshold's red and the ball), are drawn at, and the texts drawn at less than full strength.
 * The hover's CSS transitions run on the browser's own time, so they're finished first.
 */
async function strengths(page: Page): Promise<{ readonly lines: Record<string, number[]>; readonly decoration: number; readonly faded: string[] }> {
  return line(page).evaluate((root) => {
    for (const animation of document.getAnimations()) animation.finish();
    const opacity = (element: Element): number => {
      let product = 1;
      for (let at: Element | null = element; at; at = at.parentElement) product *= Number(getComputedStyle(at).opacity);
      return Math.round(product * 100) / 100;
    };
    const lines = Object.fromEntries(
      ["goals", "xg"].map((series) => [series, [".ec-stroke", ".ec-end"].map((part) => opacity(root.querySelector(`.ec-line[data-key="${series}"] ${part}`)!))])
    );
    const decoration = opacity(root.querySelector('.ec-overlay .ec-run[data-key="goals"] .ec-follow')!);
    const faded = [...root.querySelectorAll("svg text")]
      .filter((text) => text.textContent?.trim() && !text.closest(".ec-icon") && getComputedStyle(text).visibility === "visible" && opacity(text) < 1)
      .map((text) => text.textContent!.trim());
    return { lines, decoration, faded };
  });
}

/** The base duration of a whole season's play, and the share of it from week 1 to week 20. */
const SEASON = 6500;
const TO_WEEK_20 = (SEASON * 19) / 37;

test.describe("theme", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the page at rest, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);
      await expect(status(page)).toHaveText("Through matchweek 38");
      await expect(page).toHaveScreenshot(`line-page-${colorScheme}.png`, { fullPage: true });
    });
  }
});

test.describe("Play season", () => {
  test("both charts mid-play at week 20: the red runs so far, and the ball at the tip", async ({ page }) => {
    await openAtRest(page);
    await playButton(page).click();
    await expect(playButton(page)).toHaveText("Pause");
    // Up to the first frame at or past week 20, a frame's width (under a tenth of a week) at most.
    await page.clock.runFor(Math.ceil(TO_WEEK_20) + FRAME);
    await expect(status(page)).toHaveText("Through matchweek 20");
    await expect(slider(page)).toHaveValue("20");
    await expect(slider(page)).toHaveAttribute("aria-valuetext", "Through matchweek 20");
    // Weeks 21 on are hidden and out of reach.
    await expect(week(page, 20)).not.toHaveAttribute("visibility", "hidden");
    await expect(week(page, 21)).toHaveAttribute("visibility", "hidden");
    // One red run so far on each (weeks 1 to 14, touching xG at weeks 7 and 13), and a ball on each.
    expect(await redRuns(line(page))).toBe(1);
    expect(await redRuns(d3Line(page))).toBe(1);
    expect(await iconTransforms(line(page))).toHaveLength(1);
    expect(await iconTransforms(d3Line(page))).toHaveLength(1);
    // The scrubber and the first two charts; the charts with missing weeks have pictures of their own.
    const [bar, pair] = await Promise.all([season(page).locator(".bar").boundingBox(), season(page).locator(".pair").first().boundingBox()]);
    if (!bar || !pair) throw new Error("The scrubber or the first two charts aren't shown.");
    // In whole pixels, outward, as an element's picture is.
    const [left, top] = [Math.floor(bar.x), Math.floor(bar.y)];
    const clip = { x: left, y: top, width: Math.ceil(bar.x + bar.width) - left, height: Math.ceil(pair.y + pair.height) - top };
    await expect(page).toHaveScreenshot("line-play-week-20.png", { clip });

    // It plays on to the end, and the button goes back to Play.
    await page.clock.runFor(REST);
    await expect(playButton(page)).toHaveText("Play season");
    await expect(status(page)).toHaveText("Through matchweek 38");
    await expect(slider(page)).toHaveValue("38");
    expect(await redRuns(line(page))).toBe(3);
    expect(await redRuns(d3Line(page))).toBe(3);
  });

  for (const { mode, ms } of [
    { mode: "Presentation", ms: SEASON },
    { mode: "Analysis", ms: SEASON * 0.3 }
  ] as const) {
    test(`takes about ${ms / 1000} s in ${mode}, and Pause stops it`, async ({ page }) => {
      await openAtRest(page);
      await pickMode(page, mode);
      await playButton(page).click();
      await page.clock.runFor(ms - 50);
      await expect(playButton(page)).toHaveText("Pause");
      await page.clock.runFor(100);
      await expect(playButton(page)).toHaveText("Play season");
      await expect(status(page)).toHaveText("Through matchweek 38");

      // Played again from week 1 and paused part way, both charts stay where it stopped.
      await playButton(page).click();
      await page.clock.runFor(ms / 2);
      await playButton(page).click();
      await expect(playButton(page)).toHaveText("Play season");
      const paused = await status(page).textContent();
      expect(paused).not.toBe("Through matchweek 38");
      const drawn = (): Promise<(string | null)[]> =>
        Promise.all([line(page).locator('.ec-line[data-key="goals"] .ec-stroke'), d3Path(page, "goals")].map((path) => path.getAttribute("d")));
      const lines = await drawn();
      await page.clock.runFor(REST);
      await expect(status(page)).toHaveText(paused ?? "");
      expect(await drawn()).toEqual(lines);
    });
  }
});

test.describe("the scrubber", () => {
  test("seeks both charts, gliding there, and says the week", async ({ page }) => {
    await openAtRest(page);
    await slider(page).focus();
    await page.keyboard.press("Home");
    await expect(slider(page)).toHaveAttribute("aria-valuetext", "Through matchweek 1");
    // A seek glides over 350 ms in Presentation.
    await page.clock.runFor(100);
    await expect(status(page)).not.toHaveText("Through matchweek 1");
    await page.clock.runFor(REST);
    await expect(status(page)).toHaveText("Through matchweek 1");
    // Week 1 alone is a point: no red, and no ball on either line.
    expect(await redRuns(line(page))).toBe(0);
    expect(await iconTransforms(line(page))).toEqual([]);
    expect(await iconTransforms(d3Line(page))).toEqual([]);

    await slider(page).fill("20");
    await page.clock.runFor(REST);
    await expect(status(page)).toHaveText("Through matchweek 20");
    await expect(slider(page)).toHaveAttribute("aria-valuetext", "Through matchweek 20");
    await expect(week(page, 21)).toHaveAttribute("visibility", "hidden");
    expect(await redRuns(line(page))).toBe(1);
    expect(await redRuns(d3Line(page))).toBe(1);
    // Seeking pauses nothing that wasn't playing, and the button still offers Play.
    await expect(playButton(page)).toHaveText("Play season");
  });
});

test("the crosshair and its tooltip", async ({ page }) => {
  await openAtRest(page);
  await week(page, 12).locator(".ec-hit").hover();
  await page.clock.runFor(REST);
  const tooltip = line(page).locator(".ec-tooltip");
  await expect(tooltip).toHaveClass(/ec-tooltip-shown/);
  await expect(tooltip).toHaveText(/^Matchweek 12\s*18 goals · 19\.0 xG\s*-1\.0 vs expected$/);
  await expect(line(page).locator(".ec-crosshair")).not.toHaveAttribute("visibility", "hidden");
  await expect(line(page)).toHaveScreenshot("line-tooltip.png");
});

test.describe("keyboard focus", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the focus ring on a week of the line chart and on the D3 goals line, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);

      // One tab stop, at the first week; the arrow keys go week by week.
      await tabInto(page, line(page));
      await expect(week(page, 1)).toBeFocused();
      for (let i = 1; i < 12; i++) await page.keyboard.press("ArrowRight");
      await expect(week(page, 12)).toBeFocused();
      await page.clock.runFor(REST);
      await expect(line(page).locator(".ec-focus")).not.toHaveAttribute("visibility", "hidden");
      await expect(line(page)).toHaveScreenshot(`line-focus-chart-${colorScheme}.png`);

      // The D3 line: goals first, as the page draws it.
      await tabInto(page, d3Line(page));
      await expect(d3Path(page, "goals")).toBeFocused();
      await page.clock.runFor(REST);
      await expect(d3Line(page).locator(".ec-focus-ring")).not.toHaveAttribute("visibility", "hidden");
      await expect(d3Box(page)).toHaveScreenshot(`line-focus-d3-${colorScheme}.png`);
    });
  }
});

test("the D3 line hovered: the goals line in its strong colour, xG dimmed", async ({ page }) => {
  await openAtRest(page);
  await hoverD3Goals(page);
  await page.clock.runFor(REST);
  await expect(d3Path(page, "xg")).toHaveCSS("opacity", "0.3");
  await expect(d3Box(page)).toHaveScreenshot("line-d3-hover.png");
});

test.describe("the Vega-Lite line", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`at rest, ${colorScheme}: three red runs, the ball at the tip, xG dashed in the theme's grey`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);
      expect(await redRuns(vegaLine(page))).toBe(3);
      expect(await iconTransforms(vegaLine(page))).toHaveLength(1);
      await expect(vegaPath(page, "xg")).toHaveAttribute("stroke-dasharray", "6,4");
      await expect(vegaBox(page)).toHaveScreenshot(`line-vega-${colorScheme}.png`);
    });

    test(`the focus ring on its goals line, ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);
      // One tab stop after the D3 line, goals first.
      await tabInto(page, vegaLine(page));
      await expect(vegaPath(page, "goals")).toBeFocused();
      await page.clock.runFor(REST);
      await expect(vegaLine(page).locator(".ec-focus-ring")).not.toHaveAttribute("visibility", "hidden");
      await expect(vegaBox(page)).toHaveScreenshot(`line-vega-focus-${colorScheme}.png`);
    });
  }

  test("hovered: the goals line in its strong colour, xG dimmed", async ({ page }) => {
    await openAtRest(page);
    await hoverD3Goals(page, 0.3, vegaPath(page, "goals"));
    await page.clock.runFor(REST);
    await expect(vegaPath(page, "xg")).toHaveCSS("opacity", "0.3");
    await expect(vegaBox(page)).toHaveScreenshot("line-vega-hover.png");
  });

  test("names its lines, and follows a resize Vega draws, with no refresh() from the page", async ({ page }) => {
    await openAtRest(page);
    await tabInto(page, vegaLine(page));
    await expect(vegaPath(page, "goals")).toHaveAttribute("aria-label", "Goals scored: 56 goals by matchweek 38");
    await page.keyboard.press("ArrowRight");
    await expect(vegaPath(page, "xg")).toBeFocused();
    await expect(vegaPath(page, "xg")).toHaveAttribute("aria-label", "Expected goals (xG): 56.5 by matchweek 38");

    // One column: Vega draws the line wider, and the colour and the ball follow on the next frame.
    const before = await vegaLine(page).locator("svg").getAttribute("width");
    await page.setViewportSize({ width: 700, height: 2000 });
    await expect(vegaLine(page).locator("svg")).not.toHaveAttribute("width", before ?? "");
    await page.clock.runFor(REST);
    expect(await redRuns(vegaLine(page))).toBe(3);
    const ends = await page.evaluate(() => {
      const end = (path: SVGGeometryElement): number => path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM()!).x;
      const goals = document.querySelector<SVGGeometryElement>('#vega-line .mark-line path[stroke="#2a78d6"]')!;
      const icon = document.querySelector<SVGGraphicsElement>('#vega-line .ec-overlay .ec-run[data-key="goals"] .ec-icon')!;
      const box = icon.getBoundingClientRect();
      return { line: end(goals), ball: box.x + box.width / 2 };
    });
    // The ball rests just behind the tip of the redrawn line.
    expect(ends.line - ends.ball).toBeGreaterThan(0);
    expect(ends.line - ends.ball).toBeLessThan(20);
  });
});

test.describe("the toggles", () => {
  test("each in a named group, a pick pressed with focus kept on it, and the chart's tab stop kept", async ({ page }) => {
    await openAtRest(page);
    await expect(page.getByRole("group", { name: "Line" }).getByRole("button")).toHaveText(["Straight", "Curved"]);
    await expect(page.getByRole("group", { name: "Hover" }).getByRole("button")).toHaveText(["Each week", "Nearest point"]);
    await expect(toggle(page, "Straight")).toHaveAttribute("aria-pressed", "true");
    await expect(toggle(page, "Each week")).toHaveAttribute("aria-pressed", "true");

    // Focus on a week, then back to the toggles with Shift+Tab: Curved, by the keyboard.
    await tabInto(page, line(page));
    for (let i = 1; i < 12; i++) await page.keyboard.press("ArrowRight");
    await expect(week(page, 12)).toBeFocused();
    for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+Tab");
    await expect(toggle(page, "Curved")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(toggle(page, "Curved")).toHaveAttribute("aria-pressed", "true");
    await expect(toggle(page, "Straight")).toHaveAttribute("aria-pressed", "false");
    await page.clock.runFor(REST);
    await expect(toggle(page, "Curved")).toBeFocused();
    // The chart is still one tab stop, at the week focus left.
    await expect(line(page).locator('[tabindex="0"]')).toHaveCount(1);
    for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
    await expect(week(page, 12)).toBeFocused();

    // Nearest point: focus stays on it, and the tab stop moves to a point at that week.
    await page.keyboard.press("Shift+Tab");
    await expect(toggle(page, "Nearest point")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(toggle(page, "Nearest point")).toHaveAttribute("aria-pressed", "true");
    await expect(toggle(page, "Each week")).toHaveAttribute("aria-pressed", "false");
    await page.clock.runFor(REST);
    await expect(toggle(page, "Nearest point")).toBeFocused();
    await expect(line(page).locator('[tabindex="0"]')).toHaveCount(1);
    await expect(line(page).locator(".ec-column")).toHaveCount(38);
    await expect(line(page).locator(".ec-columns")).toHaveAttribute("display", "none");
    await page.keyboard.press("Tab");
    await expect(pointStop(page, "goals@12")).toBeFocused();

    // And back to Each week: focus stays on the toggle, and the tab stop is week 12's again.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(toggle(page, "Each week")).toBeFocused();
    await page.keyboard.press("Space");
    await page.clock.runFor(REST);
    await expect(toggle(page, "Each week")).toBeFocused();
    await expect(line(page).locator(".ec-stop")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(week(page, 12)).toBeFocused();
  });
});

test.describe("Straight or Curved", () => {
  test("Curved: the lines ease into curves through every week's value, never past the values either side, with the red and the ball", async ({ page }) => {
    await openAtRest(page);
    const straight = await stroke(page, "goals").getAttribute("d");
    expect(await runOf(page, "goals")).toEqual({ vertices: 38, missed: [], overshoots: [] });
    await toggle(page, "Curved").click();
    // Part way, it's neither straight nor curved yet: it eases, as a change does.
    await page.clock.runFor(300);
    const between = await stroke(page, "goals").getAttribute("d");
    expect(between).not.toBe(straight);
    await page.clock.runFor(REST);
    const curved = await stroke(page, "goals").getAttribute("d");
    expect(curved).not.toBe(between);
    for (const series of ["goals", "xg"] as const) {
      const run = await runOf(page, series);
      // A vertex at each week and at each bend between.
      expect(run.vertices, series).toBeGreaterThan(38 * 2);
      expect(run.missed, series).toEqual([]);
      expect(run.overshoots, series).toEqual([]);
    }
    // threshold's red runs, where the drawn lines cross: five, not three. Goals equal xG at weeks 7 and
    // 13, where the straight lines touch, and the curves part there: goals' runs above xG's from week 7
    // to 7.8, and from 12.7 to 13. And the ball at the tip.
    expect(await redRuns(line(page))).toBe(5);
    expect(await iconTransforms(line(page))).toHaveLength(1);
    await expect(line(page)).toHaveScreenshot("line-curved.png");

    // Back to Straight: the lines it drew before, exactly.
    await toggle(page, "Straight").click();
    await page.clock.runFor(REST);
    await expect(stroke(page, "goals")).toHaveAttribute("d", straight ?? "");
    expect(await redRuns(line(page))).toBe(3);
  });

  test("the Vega-Lite line follows: drawn as a monotone curve, with its red and the ball, and its names and tab stop kept", async ({ page }) => {
    await openAtRest(page);
    const straight = await vegaPath(page, "goals").getAttribute("d");
    expect(straight).not.toMatch(/C/);
    // Focus on the Vega-Lite line's xG, then Curved from the keyboard.
    await tabInto(page, vegaLine(page));
    await page.keyboard.press("ArrowRight");
    await expect(vegaPath(page, "xg")).toBeFocused();
    await toggle(page, "Curved").focus();
    await page.keyboard.press("Space");
    // Vega draws it again with Béziers, in the same element, and fromVegaView() follows on the next frame.
    await expect(vegaPath(page, "goals")).toHaveAttribute("d", /C/);
    await page.clock.runFor(REST);
    expect(await redRuns(vegaLine(page))).toBe(3);
    expect(await iconTransforms(vegaLine(page))).toHaveLength(1);
    await expect(vegaPath(page, "goals")).toHaveAttribute("aria-label", "Goals scored: 56 goals by matchweek 38");
    await expect(vegaLine(page).locator('.mark-line path[tabindex="0"]')).toHaveCount(1);
    await expect(vegaPath(page, "xg")).toHaveAttribute("tabindex", "0");
    // The ball rests just behind the tip of the curve.
    const ends = await page.evaluate(() => {
      const goals = document.querySelector<SVGGeometryElement>('#vega-line .mark-line path[stroke="#2a78d6"]')!;
      const tip = goals.getPointAtLength(goals.getTotalLength()).matrixTransform(goals.getScreenCTM()!);
      const box = document.querySelector('#vega-line .ec-overlay .ec-run[data-key="goals"] .ec-icon')!.getBoundingClientRect();
      return { line: tip.x, ball: box.x + box.width / 2 };
    });
    expect(ends.line - ends.ball).toBeGreaterThan(0);
    expect(ends.line - ends.ball).toBeLessThan(20);
    await expect(vegaBox(page)).toHaveScreenshot("line-vega-curved.png");

    // And straight again: the path Vega drew before.
    await toggle(page, "Straight").focus();
    await page.keyboard.press("Space");
    await expect(vegaPath(page, "goals")).toHaveAttribute("d", straight ?? "");
    await page.clock.runFor(REST);
    expect(await redRuns(vegaLine(page))).toBe(3);
  });
});

test.describe("Nearest point", () => {
  test("hovered: its line, red and ball at full strength, the other line dimmed, no text, and a tooltip with its one value", async ({ page }) => {
    await openAtRest(page);
    await toggle(page, "Nearest point").click();
    await hoverPoint(page, "goals@12");
    await page.clock.runFor(REST);
    const tooltip = line(page).locator(".ec-tooltip");
    await expect(tooltip).toHaveClass(/ec-tooltip-shown/);
    await expect(tooltip).toHaveText(/^Matchweek 12\s*18 goals\s*-1\.0 vs expected$/);
    await expect(line(page).locator(".ec-point.ec-hot")).toHaveAttribute("data-key", "goals@12");
    await expect(line(page).locator(".ec-crosshair")).toHaveAttribute("visibility", "hidden");
    // Above the point.
    const [tip, dot] = await Promise.all([tooltip.boundingBox(), line(page).locator('.ec-point[data-key="goals@12"] .ec-dot').boundingBox()]);
    expect(tip!.y + tip!.height).toBeLessThan(dot!.y);
    expect(await strengths(page)).toEqual({ lines: { goals: [1, 1], xg: [0.3, 0.3] }, decoration: 1, faded: [] });
    await expect(line(page)).toHaveScreenshot("line-point-hover.png");

    // An xG point: the goals line dims, its red and its ball with it, and still no text.
    await hoverPoint(page, "xg@30");
    await page.clock.runFor(REST);
    await expect(tooltip).toHaveText(/^Matchweek 30\s*\d+\.\d xG\s*[+-]\d+\.\d vs expected$/);
    expect(await strengths(page)).toEqual({ lines: { goals: [0.3, 0.3], xg: [1, 1] }, decoration: 0.3, faded: [] });

    // Off the plot, nothing is hovered or dimmed.
    await page.mouse.move(2, 2);
    await page.clock.runFor(REST);
    await expect(tooltip).not.toHaveClass(/ec-tooltip-shown/);
    expect(await strengths(page)).toEqual({ lines: { goals: [1, 1], xg: [1, 1] }, decoration: 1, faded: [] });
  });

  test("the pointer goes from a point onto its tooltip, keeping the hover; Escape hides it until the pointer finds another point", async ({ page }) => {
    await openAtRest(page);
    await toggle(page, "Nearest point").click();
    // Week 20's goals, 28, the higher of its two points (xG is 27.6).
    const at = await hoverPoint(page, "goals@20");
    await page.clock.runFor(REST);
    const tooltip = line(page).locator(".ec-tooltip");
    const text = await tooltip.textContent();
    const box = (await tooltip.boundingBox())!;
    // Straight up from the point into the tooltip's middle, 2 px a move, over the bridge between them.
    const middle = Math.round(box.y + box.height / 2);
    for (let y = at.y - 2; y >= middle; y -= 2) {
      await page.mouse.move(at.x, y);
      await expect(tooltip, `at ${at.x}, ${y}`).toHaveText(text ?? "");
      await expect(line(page).locator(".ec-point.ec-hot"), `at ${at.x}, ${y}`).toHaveAttribute("data-key", "goals@20");
    }
    await page.keyboard.press("Escape");
    await page.clock.runFor(REST);
    await expect(tooltip).not.toHaveClass(/ec-tooltip-shown/);
    await expect(line(page).locator(".ec-point.ec-hot")).toHaveCount(0);
    await hoverPoint(page, "goals@30");
    await page.clock.runFor(REST);
    await expect(tooltip).toHaveClass(/ec-tooltip-shown/);
    await expect(tooltip).toHaveText(/^Matchweek 30\s*\d+ goals/);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`by the keyboard, ${colorScheme}: one tab stop, each point by name, along a line and between lines, the ends, and Escape`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);
      await toggle(page, "Nearest point").click();
      await tabInto(page, line(page));
      await expect(pointStop(page, "goals@1")).toBeFocused();
      await expect(line(page).locator('[tabindex="0"]')).toHaveCount(1);
      await expect(pointStop(page, "goals@1")).toHaveAttribute("aria-label", "Matchweek 1: 0 goals");
      for (let i = 1; i < 12; i++) await page.keyboard.press("ArrowRight");
      await expect(pointStop(page, "goals@12")).toBeFocused();
      await expect(pointStop(page, "goals@12")).toHaveAttribute("aria-label", "Matchweek 12: 18 goals");
      // xG, 19.0, is drawn above goals, 18, at week 12: Up goes to it, and Down comes back.
      await page.keyboard.press("ArrowUp");
      await expect(pointStop(page, "xg@12")).toBeFocused();
      await expect(pointStop(page, "xg@12")).toHaveAttribute("aria-label", "Matchweek 12: 19.0 xG");
      await page.keyboard.press("ArrowUp");
      await expect(pointStop(page, "xg@12")).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(pointStop(page, "goals@12")).toBeFocused();
      await page.clock.runFor(REST);
      await expect(line(page).locator(".ec-tooltip")).toHaveText(/^Matchweek 12\s*18 goals\s*-1\.0 vs expected$/);
      await expect(line(page).locator(".ec-focus")).not.toHaveAttribute("visibility", "hidden");
      expect(await strengths(page)).toEqual({ lines: { goals: [1, 1], xg: [0.3, 0.3] }, decoration: 1, faded: [] });
      await expect(line(page)).toHaveScreenshot(`line-point-focus-${colorScheme}.png`);

      // End and Home go to the line's ends, and Page Down a tenth of its points on, rounded up.
      await page.keyboard.press("End");
      await expect(pointStop(page, "goals@38")).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(pointStop(page, "goals@38")).toBeFocused();
      await page.keyboard.press("Home");
      await expect(pointStop(page, "goals@1")).toBeFocused();
      await page.keyboard.press("PageDown");
      await expect(pointStop(page, "goals@5")).toBeFocused();
      // Escape ends the hover and the dimming, and focus stays.
      await page.keyboard.press("Escape");
      await page.clock.runFor(REST);
      await expect(line(page).locator(".ec-tooltip")).not.toHaveClass(/ec-tooltip-shown/);
      await expect(pointStop(page, "goals@5")).toBeFocused();
      expect((await strengths(page)).lines).toEqual({ goals: [1, 1], xg: [1, 1] });
    });
  }

  test("the tooltip never covers the focus ring, at any point of either line", async ({ page }) => {
    await openAtRest(page);
    await toggle(page, "Nearest point").click();
    await tabInto(page, line(page));
    for (const series of ["goals", "xg"] as const) {
      // At week 1, xG (0.6) is drawn above goals (0): Up reaches it.
      if (series === "xg") {
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
      }
      for (let n = 1; n <= 38; n++) {
        await expect(pointStop(page, `${series}@${n}`)).toBeFocused();
        await page.clock.runFor(FRAME * 2);
        const overlap = await line(page).evaluate((root) => {
          const tip = root.querySelector(".ec-tooltip.ec-tooltip-shown")!.getBoundingClientRect();
          const ring = [...root.querySelectorAll<SVGGraphicsElement>(".ec-focus-ring")].find((r) => getComputedStyle(r).visibility === "visible")!;
          const box = ring.getBBox();
          const half = parseFloat(getComputedStyle(ring).strokeWidth) / 2 || 0;
          const screen = ring.getScreenCTM()!;
          const a = new DOMPoint(box.x - half, box.y - half).matrixTransform(screen);
          const b = new DOMPoint(box.x + box.width + half, box.y + box.height + half).matrixTransform(screen);
          return Math.max(0, Math.min(b.x, tip.right) - Math.max(a.x, tip.left)) * Math.max(0, Math.min(b.y, tip.bottom) - Math.max(a.y, tip.top));
        });
        expect(overlap, `${series}@${n}`).toBe(0);
        await page.keyboard.press("ArrowRight");
      }
    }
  });
});

test.describe("names, legend and table", () => {
  test("each week's name and gap, the D3 lines' names, the legend's three entries and the Difference column", async ({ page }) => {
    await openDemo(page, lineDemo);
    const description = (element: Locator): Promise<string | null | undefined> =>
      element.evaluate((node) => node.ownerDocument.getElementById(node.getAttribute("aria-describedby") ?? "")?.textContent);

    await expect(week(page, 1)).toHaveAttribute("aria-label", "Matchweek 1: 0 goals, 0.6 xG");
    expect(await description(week(page, 1))).toBe("-0.6 vs expected");
    await expect(week(page, 20)).toHaveAttribute("aria-label", "Matchweek 20: 28 goals, 27.6 xG");
    expect(await description(week(page, 20))).toBe("+0.4 vs expected");

    await tabInto(page, line(page));
    await page.keyboard.press("End");
    await expect(week(page, 38)).toBeFocused();
    await expect(week(page, 38)).toHaveAttribute("aria-label", "Matchweek 38: 56 goals, 56.5 xG");

    await tabInto(page, d3Line(page));
    await expect(d3Path(page, "goals")).toHaveAttribute("aria-label", "Goals scored: 56 goals by matchweek 38");
    await page.keyboard.press("ArrowRight");
    await expect(d3Path(page, "xg")).toBeFocused();
    await expect(d3Path(page, "xg")).toHaveAttribute("aria-label", "Expected goals (xG): 56.5 by matchweek 38");

    await expect(line(page).locator(".ec-legend-item")).toHaveText(["Goals scored", "Expected goals (xG)", "Goals below xG"]);
    const table = line(page).locator("table");
    await expect(table.locator("thead th")).toHaveText(["Matchweek", "Goals scored", "Expected goals (xG)", "Difference"]);
    await expect(table.locator("tbody tr").nth(19).locator("th, td")).toHaveText(["20", "28", "27.6", "+0.4"]);
  });
});

test.describe("reduced motion", () => {
  test("Play ends at once, with the colour and the ball drawn on both charts", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, lineDemo);
    // The decoration's end state at load, with no time passing on the line chart and one frame for
    // watch to read the D3 line.
    await page.clock.runFor(FRAME);
    const atEnd = [await iconTransforms(line(page)), await iconTransforms(d3Line(page))];
    expect(atEnd.map((icons) => icons.length)).toEqual([1, 1]);

    await slider(page).fill("10");
    await expect(status(page)).toHaveText("Through matchweek 10");
    await page.clock.runFor(FRAME);
    expect(await redRuns(line(page))).toBe(1);

    await playButton(page).click();
    // No time passes: Play is heard, then the end.
    await expect(playButton(page)).toHaveText("Play season");
    await expect(status(page)).toHaveText("Through matchweek 38");
    await expect(slider(page)).toHaveValue("38");
    expect(await redRuns(line(page))).toBe(3);
    expect(await iconTransforms(line(page))).toEqual(atEnd[0]);
    await page.clock.runFor(FRAME);
    expect(await redRuns(d3Line(page))).toBe(3);
    expect(await iconTransforms(d3Line(page))).toEqual(atEnd[1]);
    // The Vega-Lite line, which doesn't play, shows the decoration's end state too.
    expect(await redRuns(vegaLine(page))).toBe(3);
    expect(await iconTransforms(vegaLine(page))).toHaveLength(1);
  });

  for (const how of ["reduced motion", "Off"] as const) {
    test(`${how}: Curved draws the curve at once, and a point's hover shows its end at once`, async ({ page }) => {
      if (how === "reduced motion") await page.emulateMedia({ reducedMotion: "reduce" });
      await openDemo(page, lineDemo);
      if (how === "Off") await pickMode(page, "Off");
      await page.clock.runFor(FRAME);
      const straight = await stroke(page, "goals").getAttribute("d");
      await toggle(page, "Curved").focus();
      await page.keyboard.press("Space");
      // No time passes: the curve is drawn whole, with the red and the ball where they end.
      const curved = await stroke(page, "goals").getAttribute("d");
      expect(curved).not.toBe(straight);
      const run = await runOf(page, "goals");
      expect(run.vertices).toBeGreaterThan(38 * 2);
      expect(run).toMatchObject({ missed: [], overshoots: [] });
      expect(await redRuns(line(page))).toBe(5);
      const icons = await iconTransforms(line(page));
      expect(icons).toHaveLength(1);
      await page.clock.runFor(REST);
      await expect(stroke(page, "goals")).toHaveAttribute("d", curved ?? "");
      expect(await iconTransforms(line(page))).toEqual(icons);

      // Nearest point: the hover's end at once, with the other line dimmed and no fade.
      await toggle(page, "Nearest point").focus();
      await page.keyboard.press("Space");
      await hoverPoint(page, "goals@12");
      await expect(line(page).locator(".ec-tooltip")).toHaveClass(/ec-tooltip-shown/);
      const drawn = await line(page).evaluate((root) => ({
        duration: root.querySelector("svg")!.style.getPropertyValue("--ec-hover-duration"),
        xg: getComputedStyle(root.querySelector('.ec-line[data-key="xg"] .ec-stroke')!).opacity,
        goals: getComputedStyle(root.querySelector('.ec-line[data-key="goals"] .ec-stroke')!).opacity
      }));
      expect(drawn).toEqual({ duration: "0ms", xg: "0.3", goals: "1" });
    });
  }
});

test.describe("with missing weeks", () => {
  test("at rest: each gap left out of its line, and no red in any", async ({ page }) => {
    await openAtRest(page);
    for (const chart of ["#gaps", "#d3-gaps"] as const) {
      const drawn = await drawnGaps(page, chart);
      // Goals miss matchweeks 9 and 10; xG misses 4 and 5 as well.
      expect(drawn.goals, chart).toHaveLength(1);
      expect(drawn.xg, chart).toHaveLength(2);
      expect(drawn.reds.length, chart).toBeGreaterThan(0);
      expect(redInGaps(drawn), chart).toEqual([]);
      // The gap the two lines share is in the same place on both.
      expect(drawn.goals[0]![0], chart).toBeCloseTo(drawn.xg[1]![0], 0);
      expect(drawn.goals[0]![1], chart).toBeCloseTo(drawn.xg[1]![1], 0);
    }
    expect(await redRuns(gaps(page))).toBe(await redRuns(d3Gaps(page)));
  });

  test("mid-play: the ball waits at matchweek 8 while the gap is revealed, then jumps across it", async ({ page }) => {
    await openAtRest(page);
    await playButton(page).click();
    // Past matchweek 10, inside the gap: each line ends at matchweek 8, and its ball rests there.
    await page.clock.runFor(Math.ceil((SEASON * 9) / 37) + FRAME);
    await expect(status(page)).toHaveText("Through matchweek 10");
    for (const chart of ["#gaps", "#d3-gaps"] as const) {
      const drawn = await drawnGaps(page, chart);
      expect(drawn.goals, chart).toEqual([]);
      expect(drawn.ball, chart).toBeDefined();
      expect(drawn.end - drawn.ball!, chart).toBeGreaterThanOrEqual(0);
      expect(drawn.end - drawn.ball!, chart).toBeLessThan(20);
    }
    await expect(gapsPair(page)).toHaveScreenshot("line-gaps-wait.png");

    // Past matchweek 11, the line goes on from there, and the ball is past the gap.
    await page.clock.runFor(Math.ceil((SEASON * 2) / 37));
    await expect(status(page)).toHaveText("Through matchweek 12");
    for (const chart of ["#gaps", "#d3-gaps"] as const) {
      const drawn = await drawnGaps(page, chart);
      expect(drawn.goals, chart).toHaveLength(1);
      expect(drawn.ball, chart).toBeGreaterThan(drawn.goals[0]![1]);
      expect(redInGaps(drawn), chart).toEqual([]);
    }
  });

  test("the crosshair and its tooltip at a missing week", async ({ page }) => {
    await openAtRest(page);
    await gapsWeek(page, 9).locator(".ec-hit").hover();
    await page.clock.runFor(REST);
    const tooltip = gaps(page).locator(".ec-tooltip");
    await expect(tooltip).toHaveClass(/ec-tooltip-shown/);
    await expect(tooltip).toHaveText(/^Matchweek 9\s*goals missing · xG missing$/);
    await expect(gaps(page).locator(".ec-crosshair")).not.toHaveAttribute("visibility", "hidden");
    // No point to emphasise at a week with no values.
    await expect(gaps(page).locator(".ec-point.ec-hot")).toHaveCount(0);
    await expect(gaps(page)).toHaveScreenshot("line-gaps-tooltip.png");

    // Where only xG is missing, the goals point is hot, and the tooltip has no gap to give.
    await gapsWeek(page, 4).locator(".ec-hit").hover();
    await page.clock.runFor(REST);
    await expect(tooltip).toHaveText(/^Matchweek 4\s*4 goals · xG missing$/);
    await expect(gaps(page).locator(".ec-point.ec-hot")).toHaveCount(1);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`keyboard focus at a missing week, ${colorScheme}: a 2 px line in the focus colour at 3:1, which stays after Escape`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openAtRest(page);
      // Page Down twice: a page is a tenth of the 38 weeks, rounded up.
      await tabInto(page, gaps(page));
      await page.keyboard.press("PageDown");
      await page.keyboard.press("PageDown");
      await expect(gapsWeek(page, 9)).toBeFocused();
      await page.clock.runFor(REST);
      const focus = gaps(page).locator(".ec-focus");
      await expect(focus).not.toHaveAttribute("visibility", "hidden");
      const drawn = await focusLines(gaps(page));
      expect(drawn).toMatchObject({ count: 1, width: "2px", onCrosshair: true });
      expect(drawn.contrast).toBeGreaterThanOrEqual(3);
      await expect(gaps(page).locator(".ec-tooltip")).toHaveText(/^Matchweek 9\s*goals missing · xG missing$/);
      await expect(gaps(page)).toHaveScreenshot(`line-gaps-focus-${colorScheme}.png`);

      // Escape hides the crosshair and the tooltip, and the line still shows where focus is.
      await page.keyboard.press("Escape");
      await page.clock.runFor(REST);
      await expect(gaps(page).locator(".ec-crosshair")).toHaveAttribute("visibility", "hidden");
      await expect(gaps(page).locator(".ec-tooltip")).not.toHaveClass(/ec-tooltip-shown/);
      await expect(gapsWeek(page, 9)).toBeFocused();
      await expect(focus).not.toHaveAttribute("visibility", "hidden");
      expect(await focusLines(gaps(page))).toMatchObject({ count: 1, width: "2px" });
    });
  }

  test("names, the keyboard and the table say what's missing", async ({ page }) => {
    await openDemo(page, lineDemo);
    const description = (element: Locator): Promise<string | null | undefined> =>
      element.evaluate((node) => node.ownerDocument.getElementById(node.getAttribute("aria-describedby") ?? "")?.textContent);

    await expect(gapsWeek(page, 3)).toHaveAttribute("aria-label", "Matchweek 3: 3 goals, 3.5 xG");
    expect(await description(gapsWeek(page, 3))).toBe("-0.5 vs expected");
    await expect(gapsWeek(page, 4)).toHaveAttribute("aria-label", "Matchweek 4: 4 goals, xG missing");
    await expect(gapsWeek(page, 4)).not.toHaveAttribute("aria-describedby");
    await expect(gapsWeek(page, 9)).toHaveAttribute("aria-label", "Matchweek 9: goals missing, xG missing");

    // The arrow keys, and Page Up and Page Down, a tenth of the 38 weeks rounded up, stop at every week,
    // the missing ones too, where a line in the focus colour shows it: there's no point to ring.
    await tabInto(page, gaps(page));
    await expect(gapsWeek(page, 1)).toBeFocused();
    for (let i = 1; i < 4; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("PageDown");
    await expect(gapsWeek(page, 8)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(gapsWeek(page, 9)).toBeFocused();
    await page.clock.runFor(REST);
    await expect(gaps(page).locator(".ec-crosshair")).not.toHaveAttribute("visibility", "hidden");
    await expect(gaps(page).locator(".ec-focus")).not.toHaveAttribute("visibility", "hidden");
    await expect(gaps(page).locator(".ec-tooltip")).toHaveText(/^Matchweek 9\s*goals missing · xG missing$/);
    await page.keyboard.press("PageDown");
    await expect(gapsWeek(page, 13)).toBeFocused();
    await page.keyboard.press("PageUp");
    await page.keyboard.press("PageUp");
    await expect(gapsWeek(page, 5)).toBeFocused();

    // The D3 lines are named for the whole season, with the weeks each is missing.
    await tabInto(page, d3Gaps(page));
    await expect(d3Gaps(page).locator("path.line-goals")).toBeFocused();
    await expect(d3Gaps(page).locator("path.line-goals")).toHaveAttribute("aria-label", "Goals scored: 56 goals by matchweek 38, matchweeks 9 and 10 missing");
    await page.keyboard.press("ArrowRight");
    await expect(d3Gaps(page).locator("path.line-xg")).toHaveAttribute("aria-label", "Expected goals (xG): 56.5 by matchweek 38, matchweeks 4, 5, 9 and 10 missing");

    const table = gaps(page).locator("table");
    await expect(table.locator("thead th")).toHaveText(["Matchweek", "Goals scored", "Expected goals (xG)", "Difference"]);
    await expect(table.locator("tbody tr").nth(3).locator("th, td")).toHaveText(["4", "4", "missing", "missing"]);
    await expect(table.locator("tbody tr").nth(8).locator("th, td")).toHaveText(["9", "missing", "missing", "missing"]);
    await expect(table.locator("tbody tr").nth(10).locator("th, td")).toHaveText(["11", "14", "16.6", "-2.6"]);
  });

  test("Curved: each run between gaps curves on its own, a gap stays a gap where it was, and no red in it", async ({ page }) => {
    await openAtRest(page);
    const goalsStroke = gaps(page).locator('.ec-line[data-key="goals"] .ec-stroke');
    const [straightD, straight] = [await goalsStroke.getAttribute("d"), await drawnGaps(page, "#gaps")];
    await toggle(page, "Curved").click();
    await page.clock.runFor(REST);
    await expect(goalsStroke).not.toHaveAttribute("d", straightD ?? "");
    const curved = await drawnGaps(page, "#gaps");
    expect(curved.goals).toHaveLength(1);
    expect(curved.xg).toHaveLength(2);
    expect(redInGaps(curved)).toEqual([]);
    // Each run ends at its last week and starts again at its next, as when straight: the points are at the rows.
    for (const series of ["goals", "xg"] as const) {
      curved[series].forEach(([from, to], i) => {
        expect(from, series).toBeCloseTo(straight[series][i]![0], 1);
        expect(to, series).toBeCloseTo(straight[series][i]![1], 1);
      });
    }
  });

  test("Nearest point: Left and Right pass over the missing weeks, Up and Down do nothing where the other line is missing", async ({ page }) => {
    await openAtRest(page);
    await toggle(page, "Nearest point").click();
    const stop = (key: string): Locator => gaps(page).locator(`.ec-stop[data-key="${key}"]`);
    // A missing value has no point, so no stop.
    for (const key of ["goals@9", "goals@10", "xg@4", "xg@5", "xg@9", "xg@10"]) await expect(stop(key), key).toHaveCount(0);
    await tabInto(page, gaps(page));
    await expect(stop("goals@1")).toBeFocused();
    for (let i = 1; i < 8; i++) await page.keyboard.press("ArrowRight");
    await expect(stop("goals@8")).toBeFocused();
    await expect(stop("goals@8")).toHaveAttribute("aria-label", "Matchweek 8: 12 goals");
    // Over matchweeks 9 and 10, which the goals line hasn't.
    await page.keyboard.press("ArrowRight");
    await expect(stop("goals@11")).toBeFocused();
    await expect(stop("goals@11")).toHaveAttribute("aria-label", "Matchweek 11: 14 goals");
    await page.keyboard.press("ArrowLeft");
    await expect(stop("goals@8")).toBeFocused();

    // xG, drawn above goals at week 3, from week 3 to 6, over 4 and 5.
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await expect(stop("xg@3")).toBeFocused();
    await expect(stop("xg@3")).toHaveAttribute("aria-label", "Matchweek 3: 3.5 xG");
    await page.keyboard.press("ArrowRight");
    await expect(stop("xg@6")).toBeFocused();
    await expect(stop("xg@6")).toHaveAttribute("aria-label", "Matchweek 6: 8.3 xG");

    // At week 4 only goals has a value: Up and Down stay on it, and its tooltip has no gap to give.
    await page.keyboard.press("ArrowDown");
    await expect(stop("goals@6")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(stop("goals@4")).toBeFocused();
    await expect(stop("goals@4")).toHaveAttribute("aria-label", "Matchweek 4: 4 goals");
    await page.keyboard.press("ArrowUp");
    await expect(stop("goals@4")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(stop("goals@4")).toBeFocused();
    await page.clock.runFor(REST);
    await expect(gaps(page).locator(".ec-tooltip")).toHaveText(/^Matchweek 4\s*4 goals$/);
  });

  for (const how of ["reduced motion", "Off"] as const) {
    test(`${how}: a gap stays a gap, the ball waits at its start and is at the tip after Play`, async ({ page }) => {
      if (how === "reduced motion") await page.emulateMedia({ reducedMotion: "reduce" });
      await openDemo(page, lineDemo);
      if (how === "Off") await pickMode(page, "Off");

      // Revealed into the gap: the lines end at matchweek 8, with the ball there and nothing in the gap.
      await slider(page).fill("10");
      await expect(status(page)).toHaveText("Through matchweek 10");
      // One frame, for watch to read the D3 line.
      await page.clock.runFor(FRAME);
      for (const chart of ["#gaps", "#d3-gaps"] as const) {
        const drawn = await drawnGaps(page, chart);
        expect(drawn.goals, chart).toEqual([]);
        expect(drawn.end - drawn.ball!, chart).toBeGreaterThanOrEqual(0);
        expect(drawn.end - drawn.ball!, chart).toBeLessThan(20);
      }

      await playButton(page).click();
      // No time passes on the line chart: Play is heard, then the end.
      await expect(status(page)).toHaveText("Through matchweek 38");
      await page.clock.runFor(FRAME);
      for (const chart of ["#gaps", "#d3-gaps"] as const) {
        const drawn = await drawnGaps(page, chart);
        expect(drawn.goals, chart).toHaveLength(1);
        expect(drawn.xg, chart).toHaveLength(2);
        expect(redInGaps(drawn), chart).toEqual([]);
        expect(drawn.ball, chart).toBeGreaterThan(drawn.goals[0]![1]);
      }
    });
  }
});
