// README's pictures, docs/media/*.gif: the effects on the demo pages, and README's first example on
// quick-start.html beside this file, drawn frame by frame on Playwright's fake clock
// (tests/visual/demo.ts), so every run draws the same frames. `npm run media` runs it in the visual
// suite's Docker image, whose fonts the screenshot baselines have too.
//
// Each GIF plays once and stops on the effect's end state, within 5 s (WCAG 2.2.2): npm can't pause
// a picture, and GitHub only pauses one for a viewer who asks for reduced motion. A drawn pointer
// shows where the real one is, since screenshots leave it out.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { bar, barsDemo, lineDemo, morphDemo, openDemo, pickMetric, REST, type Demo } from "../../tests/visual/demo";
import { writeGif, type Frame } from "./gif";
import { readPng } from "./png";

/** Time between frames: 25 a second, and a whole number of GIF's hundredths. */
const STEP = 40;
/** WCAG 2.2.2: anything that plays by itself stops within 5 s. */
const LIMIT = 5000;
/** How long the first frame holds, so the chart is seen before anything moves. */
const HOLD = 600;
/** The page shown round a picture's card. */
const MARGIN = 12;
const OUT = new URL("../../docs/media/", import.meta.url);

/** A demo page, served from the repository's root here, so quick-start.html can be too. */
const fromRoot = (demo: Demo): Demo => ({ ...demo, path: `/demo${demo.path}` });

const quickStart: Demo = {
  path: "/scripts/media/quick-start.html",
  async ready(page) {
    await expect(page.locator("#sales .ec-mark")).toHaveCount(5);
  }
};

/** The cards' long notes hidden: a picture shows a chart, and its heading says what it is. */
async function hideNotes(page: Page): Promise<void> {
  await page.addStyleTag({ content: ".note { display: none !important; }" });
  await page.clock.runFor(REST);
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box round some elements, with MARGIN of the page round it, in whole pixels. */
async function around(...elements: Locator[]): Promise<Box> {
  const boxes = await Promise.all(elements.map(async (element) => (await element.boundingBox()) ?? Promise.reject(new Error(`${element} isn't shown.`))));
  const left = Math.floor(Math.min(...boxes.map((b) => b.x))) - MARGIN;
  const top = Math.floor(Math.min(...boxes.map((b) => b.y))) - MARGIN;
  const right = Math.ceil(Math.max(...boxes.map((b) => b.x + b.width))) + MARGIN;
  const bottom = Math.ceil(Math.max(...boxes.map((b) => b.y + b.height))) + MARGIN;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

interface Point {
  x: number;
  y: number;
}

/** A point some way into the box round the elements: (0, 0) is its top left, (1, 1) its bottom right. */
async function at(elements: Locator, x: number, y: number): Promise<Point> {
  const box = await elements.evaluateAll((found) => {
    const boxes = found.map((element) => element.getBoundingClientRect());
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    return { left, top, width: Math.max(...boxes.map((b) => b.right)) - left, height: Math.max(...boxes.map((b) => b.bottom)) - top };
  });
  if (!Number.isFinite(box.width)) throw new Error(`${elements} isn't shown.`);
  return { x: Math.round(box.left + box.width * x), y: Math.round(box.top + box.height * y) };
}

/** A bar's drawn segments: its mark is the whole row, which the pointer hovers anywhere along. */
const segments = (mark: Locator): Locator => mark.locator(".ec-segment");

/** Where the pointer starts on a bar chart: off the chart's right edge, level with the bar it goes to. */
async function besideChart(chart: Locator, mark: Locator): Promise<Point> {
  const [right, level] = await Promise.all([at(chart.locator("svg.ec-chart"), 1, 0), at(segments(mark), 0, 0.5)]);
  return { x: right.x + 10, y: level.y };
}

/** An arrow pointer, black with a white edge, its tip at (4, 2). */
const POINTER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">' +
  '<path d="M4 2v15.5l4-3.6 2.9 6.4 2.6-1.2-2.8-6.2h5.4z" fill="#0b0b0b" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';

/** The frames of one picture, drawn from `clip`. */
class Recording {
  private readonly frames: Frame[] = [];
  private pointer: Point = { x: 0, y: 0 };

  constructor(
    private readonly page: Page,
    private readonly clip: Box
  ) {}

  /** Draws the pointer at (x, y), where the real one is moved to. */
  async point({ x, y }: Point): Promise<void> {
    this.pointer = { x, y };
    await this.page.mouse.move(x, y);
    await this.page.evaluate(
      ({ x, y, svg }) => {
        let pointer = document.getElementById("capture-pointer");
        if (!pointer) {
          pointer = document.createElement("div");
          pointer.id = "capture-pointer";
          pointer.innerHTML = svg;
          Object.assign(pointer.style, { position: "fixed", left: "0", top: "0", pointerEvents: "none", zIndex: "2147483647" });
          document.body.append(pointer);
        }
        pointer.style.transform = `translate(${x - 4}px, ${y - 2}px)`;
      },
      { x, y, svg: POINTER }
    );
  }

  /** Adds the page as it is now, shown for `delay` ms. */
  async frame(delay = STEP): Promise<void> {
    const png: Uint8Array = await this.page.screenshot({ clip: this.clip, animations: "disabled", caret: "hide" });
    this.frames.push({ ...readPng(png), delay });
  }

  /** Lets `ms` of the page's time pass, a frame every STEP; `speed` times as fast plays it in less. */
  async run(ms: number, speed = 1): Promise<void> {
    for (let t = 0; t < ms; t += STEP * speed) {
      await this.page.clock.runFor(STEP * speed);
      await this.frame();
    }
  }

  /** Moves the pointer to `to` over `ms`, easing in and out, a frame every STEP. */
  async glide(to: Point, ms: number): Promise<void> {
    const from = this.pointer;
    const steps = Math.round(ms / STEP);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await this.point({ x: Math.round(from.x + (to.x - from.x) * eased), y: Math.round(from.y + (to.y - from.y) * eased) });
      await this.page.clock.runFor(STEP);
      await this.frame();
    }
  }

  async click(): Promise<void> {
    await this.page.mouse.down();
    await this.page.mouse.up();
  }

  /** Writes docs/media/`name`.gif, once it's checked to stop within LIMIT. */
  save(name: string): void {
    const { bytes, playsFor } = writeGif(this.frames);
    expect(playsFor, `${name}.gif plays for ${playsFor} ms`).toBeLessThanOrEqual(LIMIT);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(new URL(`${name}.gif`, OUT), bytes);
    const [{ width, height }] = this.frames as [Frame];
    console.log(`docs/media/${name}.gif: ${width}×${height}, ${this.frames.length} frames, ${(playsFor / 1000).toFixed(2)} s, ${(bytes.length / 1024).toFixed(0)} KB`);
  }
}

test("an arrow runs out a bar on hover: README's first example", async ({ page }) => {
  await openDemo(page, quickStart);
  const chart = page.locator("#sales");
  const mark = (region: string): Locator => chart.locator(`.ec-mark[data-key="${region}"]`);
  const recording = new Recording(page, await around(page.locator(".card")));
  await recording.point(await besideChart(chart, mark("North")));
  await recording.frame(HOLD);
  await recording.glide(await at(segments(mark("North")), 0.6, 0.5), 400);
  await recording.run(700);
  await recording.glide(await at(segments(mark("East")), 0.75, 0.5), 240);
  await recording.run(1000);
  recording.save("arrow-on-hover");
});

test("a ball rolls along the goals and a boot steps along the assists", async ({ page }) => {
  await openDemo(page, fromRoot(barsDemo));
  await pickMetric(page, "Goals + assists");
  await hideNotes(page);
  const recording = new Recording(page, await around(page.locator('section[aria-labelledby="chart-title"]')));
  await recording.point(await besideChart(page.locator("#chart"), bar(page, "Tanaka")));
  await recording.frame(HOLD);
  await recording.glide(await at(segments(bar(page, "Tanaka")), 0.8, 0.5), 400);
  await recording.run(1000);
  await recording.glide(await at(segments(bar(page, "Lindqvist")), 0.8, 0.5), 240);
  await recording.run(1200);
  recording.save("ball-and-boot");
});

test("a season plays: the goals line red below xG, with a ball riding its tip", async ({ page }) => {
  await openDemo(page, fromRoot(lineDemo));
  await hideNotes(page);
  // From the first week: the scrubber seeks there, and the reveal glides back.
  await page.getByRole("slider", { name: "Matchweek" }).evaluate((slider: HTMLInputElement) => {
    slider.value = "1";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.clock.runFor(REST);
  const play = page.locator("#play button");
  const recording = new Recording(page, await around(page.locator("#season > .bar"), page.locator('section[aria-labelledby="line-title"]')));
  // Below the scrubber, between it and the card.
  await recording.point(await at(page.locator("#week"), 0.3, 2.6));
  await recording.frame(HOLD);
  await recording.glide(await at(play, 0.8, 0.6), 400);
  await recording.click();
  // The page's 6.5 s season, played at twice its speed to stay well within LIMIT.
  await recording.run(6500 + 200, 2);
  await expect(play).toHaveText("Play season");
  recording.save("threshold-line");
});

test("a donut morphs into columns", async ({ page }) => {
  await openDemo(page, fromRoot(morphDemo));
  await hideNotes(page);
  const toggle = page.locator("#toggle");
  const recording = new Recording(page, await around(page.locator('section[aria-labelledby="shots-title"]')));
  // In the card's empty corner, left of the donut.
  await recording.point(await at(toggle, 0.4, 5));
  await recording.frame(HOLD);
  await recording.glide(await at(toggle, 0.85, 0.6), 400);
  await recording.click();
  await recording.run(950 + 400);
  await expect(toggle).toHaveText("Show as donut");
  recording.save("donut-to-columns");
});
