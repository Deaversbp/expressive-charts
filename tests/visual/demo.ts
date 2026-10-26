// Shared steps for the visual suite: open a demo page with time stopped, and operate its controls.
//
// Time is Playwright's fake clock (page.clock). The library's page-wide clock looks up
// performance.now() and requestAnimationFrame each time it needs a frame, and the fake clock replaces
// both before any page script runs, so the tests drive the real clock with no hook in the library:
// nothing moves until a test calls page.clock.runFor(ms), and frames fall every 16 ms of fake time.

import { expect, type Locator, type Page } from "@playwright/test";

/** The fake clock's reading when a test starts acting. */
const START = 1000;

/** Long enough for any story, staged change or flash to finish. */
export const REST = 5000;

/** The fake clock's frame interval. An animation that ends at t shows its end on the first frame at or after t. */
export const FRAME = 16;

export type Mode = "Presentation" | "Analysis" | "Off";
export type Metric = "Goals" | "Assists" | "Goals + assists";

/** A demo page, and how to tell that its charts are drawn. */
export interface Demo {
  readonly path: string;
  ready(page: Page): Promise<void>;
}

/** demo/bars.html: eight players on the library's chart and on the hand-written one. */
export const barsDemo: Demo = {
  path: "/bars.html",
  async ready(page) {
    await expect(page.locator("#chart .ec-mark")).toHaveCount(8);
    await expect(page.locator("#host-chart .host-goals rect")).toHaveCount(8);
  }
};

/** demo/donut.html: the library's donut and columns, and the D3 pie that expressive() drives. */
export const donutDemo: Demo = {
  path: "/donut.html",
  async ready(page) {
    await expect(page.locator("#donut .ec-mark")).toHaveCount(4);
    await expect(page.locator("#columns .ec-mark")).toHaveCount(4);
    // expressive() has named the pie's slices, so it's attached.
    await expect(page.locator('#d3-pie path.slice[role="img"]')).toHaveCount(4);
  }
};

/** demo/line.html: the library's line chart, the D3 line and the Vega-Lite line. */
export const lineDemo: Demo = {
  path: "/line.html",
  async ready(page) {
    await expect(page.locator("#line .ec-line")).toHaveCount(2);
    await expect(page.locator("#line .ec-column")).toHaveCount(38);
    // expressive() has named the D3 line's paths, so it's attached.
    await expect(page.locator('#d3-line path.line[role="img"]')).toHaveCount(2);
    // And fromVegaView() the Vega-Lite line's, once Vega has drawn it.
    await expect(page.locator('#vega-line .mark-line path[role="img"]')).toHaveCount(2);
  }
};

/** demo/morph.html: the donut and the columns in one chartSwitch. */
export const morphDemo: Demo = {
  path: "/morph.html",
  async ready(page) {
    await expect(page.locator('#shots .ec-switch-view[data-view="donut"] .ec-mark')).toHaveCount(4);
    await expect(page.locator('#shots .ec-switch-view[data-view="columns"] .ec-mark')).toHaveCount(4);
  }
};

/** demo/season.html: the three linked charts, the players' bars and the D3 slope chart, after matchweek 24. */
export const seasonDemo: Demo = {
  path: "/season.html",
  async ready(page) {
    await expect(page.locator("#goals .ec-mark")).toHaveCount(24);
    await expect(page.locator("#line .ec-column")).toHaveCount(24);
    await expect(page.locator("#players .ec-mark")).toHaveCount(8);
    // expressive() has named the D3 columns and the slope chart's lines, so both are attached.
    await expect(page.locator('#shots rect.column[role="img"]')).toHaveCount(24);
    await expect(page.locator('#slope path.slope[role="img"]')).toHaveCount(8);
  }
};

/** demo/stress.html: every case drawn at its smallest size. */
export const stressDemo: Demo = {
  path: "/stress.html",
  async ready(page) {
    await expect(page.locator("#update-chart .ec-mark")).toHaveCount(100);
    await expect(page.locator("#hover-chart .ec-mark")).toHaveCount(100);
    await expect(page.locator("#line-chart .ec-column")).toHaveCount(365);
    // expressive() has named the D3 columns, so it's attached.
    await expect(page.locator('#host-chart rect[role="img"]')).toHaveCount(20);
    // Both of the switch's views are drawn, one of them hidden.
    await expect(page.locator("#switch-chart .ec-mark")).toHaveCount(40);
    await expect(page.locator("#draw-chart .ec-mark")).toHaveCount(1000);
  }
};

/** Opens a demo, bars.html unless another is given, with time stopped at START. */
export async function openDemo(page: Page, demo: Demo = barsDemo): Promise<void> {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(START);
  await page.goto(demo.path);
  await demo.ready(page);
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  if (scrollHeight > (page.viewportSize()?.height ?? 0)) {
    throw new Error(`The page (${scrollHeight} px) is taller than the viewport; raise its height in playwright.config.ts.`);
  }
  // The page's clock starts at the real time that passed between install() and pauseAt(), a few ms
  // that vary with the machine. Moving it to START puts every test's frames at the same times, so a
  // screenshot after runFor(ms) shows the same in-between frame on every run.
  const ticks = await page.evaluate(() => performance.now());
  if (ticks > START) throw new Error(`The fake clock read ${ticks} ms before the test started; raise START.`);
  await page.clock.runFor(START - ticks);
  // The page uses system fonts, but wait anyway, so a late font swap can't change the layout mid-test.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/** The library's barChart, and the hand-written chart that expressive() drives. */
export const chart = (page: Page): Locator => page.locator("#chart");
export const hostChart = (page: Page): Locator => page.locator("#host-chart");

/** A player's bar on the library's chart. */
export const bar = (page: Page, player: string): Locator => page.locator(`#chart .ec-mark[data-key="${player}"]`);

/** A player's goals rect on the hand-written chart, by position: rows are drawn top to bottom. */
export const hostBar = (page: Page, row: number): Locator => page.locator("#host-chart .host-goals rect").nth(row);

export const motionSwitch = (page: Page): Locator => page.getByRole("group", { name: "Motion" });
export const modeButton = (page: Page, mode: Mode): Locator => motionSwitch(page).getByRole("button", { name: mode });
export const motionHint = (page: Page): Locator => page.locator("#motion .ec-motion-hint");

/** The viewer picks a motion mode on the page. */
export async function pickMode(page: Page, mode: Mode): Promise<void> {
  await modeButton(page, mode).click();
  await expect(modeButton(page, mode)).toHaveAttribute("aria-pressed", "true");
}

/** Switches both charts' metric and lets the change finish. */
export async function pickMetric(page: Page, metric: Metric, { settle = true } = {}): Promise<void> {
  await page.getByRole("group", { name: "Metric" }).getByRole("button", { name: metric, exact: true }).click();
  if (settle) await page.clock.runFor(REST);
}

/** Moves the pointer off both charts and the controls, so nothing is hovered. */
export async function pointerAway(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
}

/**
 * Moves the pointer into an SVG shape (a path, a rect), at the point inside it farthest from its edge,
 * and says where that is. hover() aims at the middle of the bounding box, which for a large slice is in
 * the hole.
 */
export async function hoverShape(page: Page, shape: Locator): Promise<{ x: number; y: number }> {
  const point = await shape.evaluate((element) => {
    const geometry = element as SVGGeometryElement;
    const box = geometry.getBBox();
    const length = geometry.getTotalLength();
    const edge = Array.from({ length: 128 }, (_, i) => geometry.getPointAtLength((i / 128) * length));
    let best = { x: box.x + box.width / 2, y: box.y + box.height / 2, room: -1 };
    for (let i = 1; i < 32; i++) {
      for (let j = 1; j < 32; j++) {
        const x = box.x + (box.width * i) / 32;
        const y = box.y + (box.height * j) / 32;
        if (!geometry.isPointInFill(new DOMPoint(x, y))) continue;
        const room = Math.min(...edge.map((p) => Math.hypot(p.x - x, p.y - y)));
        if (room > best.room) best = { x, y, room };
      }
    }
    const screen = new DOMPoint(best.x, best.y).matrixTransform(geometry.getScreenCTM() ?? undefined);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.move(point.x, point.y);
  return point;
}

/** Presses Tab, as a keyboard user would, until focus is inside `container`. */
export async function tabInto(page: Page, container: Locator): Promise<void> {
  for (let presses = 0; presses < 60; presses++) {
    await page.keyboard.press("Tab");
    if (await container.evaluate((element) => element.contains(document.activeElement))) return;
  }
  throw new Error("Tab never reached the chart.");
}

/** Every icon's transform in `container`, in DOM order: where the effects have put them. */
export async function iconTransforms(container: Locator): Promise<(string | null)[]> {
  return container.locator(".ec-icon").evaluateAll((icons) => icons.map((icon) => icon.getAttribute("transform")));
}
