// Screenshots of demo/map.html on a stopped clock: the page as it loads in light and dark and at 320 px,
// a country hovered, a route's arrow half way and at rest, the focus ring on a country and on a route,
// and reduced motion. Beside them, DOM checks: nothing moving at load, only the rows' countries and
// routes named, the outline drawn at once and gone on leave, the link both ways, the keyboard in name
// order, the tables' rows, the credit, a resize, nothing zooming or panning, and what can be read. Names
// start with "map-", since screenshot names are shared across files.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { hoverShape, mapDemo, openDemo, pickMode, pointerAway, REST, tabInto } from "./demo";

/** The squad's countries and their players, in name order, as the page names them. */
const COUNTRIES: readonly (readonly [string, number])[] = [
  ["Argentina", 1],
  ["Czechia", 1],
  ["France", 2],
  ["Ireland", 2],
  ["Japan", 1],
  ["Mexico", 1],
  ["Morocco", 1],
  ["Nigeria", 3],
  ["Poland", 1],
  ["Portugal", 1],
  ["Spain", 2],
  ["Sweden", 1],
  ["United Kingdom", 8]
];
/** The signings, in the rows' order: the player, the city and the country. */
const SIGNINGS: readonly (readonly [string, string, string])[] = [
  ["Adeyemi", "Lagos", "Nigeria"],
  ["Tanaka", "Osaka", "Japan"],
  ["Castillo", "Buenos Aires", "Argentina"],
  ["Reyes", "Guadalajara", "Mexico"]
];
const countryName = ([name, players]: readonly [string, number]): string => `${name}: ${players} ${players === 1 ? "player" : "players"}`;
const routeName = ([player, , from]: readonly [string, string, string]): string => `${player}, from ${from}`;
const MAP_NAME = "Where Harbor City FC's 25 players come from, and the summer's four signings, on a D3 map";

const map = (page: Page): Locator => page.locator("#map");
const card = (page: Page): Locator => page.locator('section[aria-labelledby="map-title"]');
const country = (page: Page, name: string): Locator => page.locator(`#map path.country[aria-label^="${name}:"]`);
const route = (page: Page, player: string): Locator => page.locator(`#map path.route[aria-label^="${player},"]`);
/** The outlines the page's effect has drawn, and the arrows on show. */
const outlines = (page: Page): Locator => page.locator('#map .ec-overlay .ec-run[data-slot="hover"] path.ec-path');
const arrows = (page: Page): Locator => page.locator('#map .ec-overlay .ec-icon[data-icon="arrow"]');

/** The countries that aren't dimmed, as a viewer sees them: by their computed opacity once the fade is done. */
const lit = (page: Page): Promise<string[]> =>
  page.locator("#map path.country").evaluateAll((paths) => paths.filter((path) => !path.classList.contains("ec-dimmed")).map((path) => path.getAttribute("aria-label")!.split(":")[0]!));

/** The keys of the runs that drew an outline or an arrow. */
const keysOf = (drawn: Locator): Promise<string[]> => drawn.evaluateAll((parts) => parts.map((part) => part.closest(".ec-run")!.getAttribute("data-key")!));

/** Moves the pointer onto a route, half way along it. */
async function hoverRoute(page: Page, player: string): Promise<void> {
  const point = await route(page, player).evaluate((element) => {
    const path = element as SVGPathElement;
    const at = path.getPointAtLength(path.getTotalLength() / 2);
    const screen = new DOMPoint(at.x, at.y).matrixTransform(path.getScreenCTM() ?? undefined);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.move(point.x, point.y);
}

/** How far along its route an arrow is, 0 at the city and 1 at the club, from where it's drawn. */
async function along(page: Page, player: string): Promise<number> {
  const at = await arrows(page).evaluate((icon) => {
    const box = icon.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  return route(page, player).evaluate((element, point) => {
    const path = element as SVGPathElement;
    const matrix = path.getScreenCTM()!;
    const length = path.getTotalLength();
    let best = { t: 0, gap: Infinity };
    for (let i = 0; i <= 200; i++) {
      const p = new DOMPoint(path.getPointAtLength((i / 200) * length).x, path.getPointAtLength((i / 200) * length).y).matrixTransform(matrix);
      const gap = Math.hypot(p.x - point.x, p.y - point.y);
      if (gap < best.gap) best = { t: i / 200, gap };
    }
    return best.t;
  }, at);
}

/** Whether the map shows a focus ring: one of its rings, drawn. */
async function ringShown(page: Page): Promise<boolean> {
  return map(page).evaluate((root) =>
    [...root.querySelectorAll(".ec-focus-ring")].some((ring) => {
      const box = ring.getBoundingClientRect();
      return getComputedStyle(ring).visibility === "visible" && (box.width > 0 || box.height > 0);
    })
  );
}

/**
 * Opens the page and loads it again once openDemo has stopped the clock, as bars.spec.ts does: the
 * page as it loads, with no frame run.
 */
async function openLoading(page: Page): Promise<void> {
  await openDemo(page, mapDemo);
  await page.reload();
  await mapDemo.ready(page);
}

test.describe("at load", () => {
  test("the map loads at rest, only the rows' countries and routes named, and nothing moves", async ({ page }) => {
    await openLoading(page);
    await expect(page.locator("#map path.land")).toHaveCount(177);
    await expect(page.locator('#map [role="img"]')).toHaveCount(17);
    expect(await page.locator("#map path.country").evaluateAll((paths) => paths.map((path) => path.getAttribute("aria-label")))).toEqual(COUNTRIES.map(countryName));
    expect(await page.locator("#map path.route").evaluateAll((paths) => paths.map((path) => path.getAttribute("aria-label")))).toEqual(SIGNINGS.map(routeName));
    await expect(outlines(page)).toHaveCount(0);
    await expect(arrows(page)).toHaveCount(0);
    expect(await lit(page)).toHaveLength(13);
    await expect(page).toHaveScreenshot("map-load.png", { fullPage: true });
    const atLoad = await page.locator("main").innerHTML();
    await page.clock.runFor(REST);
    expect(await page.locator("main").innerHTML()).toBe(atLoad);
  });

  test("in dark, the shades follow the theme, the more players the further from the card", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openDemo(page, mapDemo);
    // Each step's lightness, from the fill a browser computes: in dark the scale runs the other way.
    const lightness = (name: string): Promise<number> =>
      country(page, name).evaluate((path) => {
        const canvas = document.createElement("canvas").getContext("2d")!;
        canvas.fillStyle = getComputedStyle(path).fill;
        canvas.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0] = canvas.getImageData(0, 0, 1, 1).data;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      });
    const [one, two, many] = [await lightness("Japan"), await lightness("Nigeria"), await lightness("United Kingdom")];
    expect(two).toBeGreaterThan(one);
    expect(many).toBeGreaterThan(two);
    await expect(page).toHaveScreenshot("map-load-dark.png", { fullPage: true });
  });

  test("at 320 px the map fits its card, and every count is in the table", async ({ page }) => {
    // Tall enough for the page in one column, about 4,200 px.
    await page.setViewportSize({ width: 320, height: 4400 });
    await openDemo(page, mapDemo);
    const sizes = await map(page).evaluate((svg) => ({ svg: svg.getBoundingClientRect().width, card: svg.closest(".card")!.getBoundingClientRect().width }));
    expect(sizes.svg).toBeLessThanOrEqual(sizes.card - 40);
    await expect(page.locator("#countries-table tbody tr")).toHaveCount(13);
    await expect(page.locator("#countries-table")).toBeVisible();
    await expect(page).toHaveScreenshot("map-load-320.png", { fullPage: true });
  });
});

test.describe("the tables and the credit", () => {
  test("the tables have the map's rows, and the credit names Natural Earth and says the borders are de facto", async ({ page }) => {
    await openDemo(page, mapDemo);
    const rows = (id: string): Promise<string[][]> => page.locator(`#${id} tbody tr`).evaluateAll((trs) => trs.map((tr) => [...tr.children].map((cell) => cell.textContent ?? "")));
    // Most players first, as the rows have them.
    const countries = await rows("countries-table");
    expect([...countries].sort((a, b) => a[0]!.localeCompare(b[0]!))).toEqual(COUNTRIES.map(([name, players]) => [name, String(players)]));
    expect(countries[0]).toEqual(["United Kingdom", "8"]);
    await expect(page.locator("#countries-table tfoot td")).toHaveText("25");
    expect(await rows("signings-table")).toEqual(SIGNINGS.map((signing) => [...signing]));
    // Each row's first cell is its header.
    await expect(page.locator('#countries-table tbody th[scope="row"]')).toHaveCount(13);
    await expect(page.locator('#signings-table tbody th[scope="row"]')).toHaveCount(4);
    const credit = page.locator("#credit");
    await expect(credit).toContainText("Natural Earth");
    await expect(credit).toContainText("world-atlas");
    await expect(credit).toContainText("de facto");
    for (const place of ["Kosovo", "Northern Cyprus", "Somaliland", "Western Sahara", "Taiwan"]) await expect(credit).toContainText(place);
  });
});

test.describe("a hover", () => {
  test("a country is outlined at once in the text colour, the rest dim, its route's arrow travels, and it all goes on leave", async ({ page }) => {
    await openDemo(page, mapDemo);
    const d = await country(page, "Nigeria").getAttribute("d");
    await hoverShape(page, country(page, "Nigeria"));
    // No time passes: the outline is there with the hover.
    await expect(outlines(page)).toHaveCount(1);
    expect(await keysOf(outlines(page))).toEqual(["Nigeria"]);
    expect(await lit(page)).toEqual(["Nigeria"]);
    // The country's own shape, stroked and not filled, in the theme's text colour.
    const stroke = await outlines(page).evaluate((path) => ({ stroke: getComputedStyle(path).stroke, fill: getComputedStyle(path).fill, text: getComputedStyle(path).getPropertyValue("--ec-text").trim() }));
    expect(stroke.fill).toBe("none");
    expect(stroke.stroke).not.toBe("none");
    const box = async (shape: Locator): Promise<number[]> => Object.values((await shape.boundingBox())!).map((value) => Math.round(value));
    const [x, y, width, height] = await box(country(page, "Nigeria"));
    const outlined = await box(outlines(page));
    // The outline's stroke is 1.5 px, half of it outside the shape.
    for (const [i, value] of [x!, y!, width!, height!].entries()) expect(Math.abs(outlined[i]! - value), `the outline's box, ${i}`).toBeLessThanOrEqual(3);
    // The mark itself doesn't move or change shape under the pointer.
    expect(await country(page, "Nigeria").getAttribute("d")).toBe(d);
    expect(await country(page, "Nigeria").evaluate((path) => getComputedStyle(path).transform)).toBe("none");
    // Through the link, the arrow travels Adeyemi's route and rests at the club.
    await page.clock.runFor(REST);
    expect(await keysOf(arrows(page))).toEqual(["Adeyemi"]);
    expect(await along(page, "Adeyemi")).toBeGreaterThan(0.8);
    await expect(map(page)).toHaveScreenshot("map-hover-country.png");
    await pointerAway(page);
    await page.clock.runFor(REST);
    await expect(outlines(page)).toHaveCount(0);
    await expect(arrows(page)).toHaveCount(0);
    expect(await lit(page)).toHaveLength(13);
  });

  test("the land and the sea never react", async ({ page }) => {
    await openDemo(page, mapDemo);
    const before = await map(page).innerHTML();
    // Brazil, plain land; then the sea, the map's top left corner.
    const brazil = await page.locator("#map path.land").evaluateAll((paths) => paths.findIndex((path) => (path as unknown as { __data__: { properties: { name: string } } }).__data__.properties.name === "Brazil"));
    expect(brazil).toBeGreaterThanOrEqual(0);
    await hoverShape(page, page.locator("#map path.land").nth(brazil));
    await page.clock.runFor(REST);
    expect(await map(page).innerHTML()).toBe(before);
    const corner = (await map(page).boundingBox())!;
    await page.mouse.move(corner.x + 4, corner.y + 4);
    await page.clock.runFor(REST);
    expect(await map(page).innerHTML()).toBe(before);
  });

  test("a route's arrow travels from its city to the club and rests there, and its country lights up", async ({ page }) => {
    await openDemo(page, mapDemo);
    await hoverRoute(page, "Tanaka");
    await expect(outlines(page)).toHaveCount(1);
    expect(await keysOf(outlines(page))).toEqual(["Japan"]);
    expect(await lit(page)).toEqual(["Japan"]);
    // About half way through its trip.
    await page.clock.runFor(256);
    expect(await keysOf(arrows(page))).toEqual(["Tanaka"]);
    const half = await along(page, "Tanaka");
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
    await expect(map(page)).toHaveScreenshot("map-route-half.png");
    await page.clock.runFor(REST);
    const rest = await along(page, "Tanaka");
    expect(rest).toBeGreaterThan(0.9);
    await expect(map(page)).toHaveScreenshot("map-route-rest.png");
    // It stays there while the hover lasts.
    await page.clock.runFor(REST);
    expect(await along(page, "Tanaka")).toBe(rest);
    await pointerAway(page);
    await page.clock.runFor(REST);
    await expect(arrows(page)).toHaveCount(0);
    await expect(outlines(page)).toHaveCount(0);
  });
});

test.describe("the keyboard", () => {
  test("Tab reaches the countries, then the routes; the arrow keys go through the countries by name, each with a ring", async ({ page }) => {
    await openDemo(page, mapDemo);
    await tabInto(page, map(page));
    await expect(country(page, "Argentina")).toBeFocused();
    await page.clock.runFor(REST);
    expect(await ringShown(page)).toBe(true);
    expect(await keysOf(outlines(page))).toEqual(["Argentina"]);
    expect(await lit(page)).toEqual(["Argentina"]);
    // Argentina has a signing, so its arrow has travelled.
    expect(await keysOf(arrows(page))).toEqual(["Castillo"]);
    await expect(map(page)).toHaveScreenshot("map-focus-country.png");
    const seen = ["Argentina"];
    for (let i = 1; i < COUNTRIES.length; i++) {
      await page.keyboard.press("ArrowRight");
      seen.push((await page.evaluate(() => document.activeElement!.getAttribute("aria-label")!)).split(":")[0]!);
    }
    expect(seen).toEqual(COUNTRIES.map(([name]) => name));
    await page.keyboard.press("Home");
    await expect(country(page, "Argentina")).toBeFocused();
    await page.keyboard.press("PageDown");
    await expect(country(page, "France")).toBeFocused();
    // The routes are the next tab stop.
    await page.keyboard.press("Tab");
    await expect(route(page, "Adeyemi")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(route(page, "Tanaka")).toBeFocused();
    await page.clock.runFor(REST);
    expect(await ringShown(page)).toBe(true);
    expect(await keysOf(arrows(page))).toEqual(["Tanaka"]);
    expect(await along(page, "Tanaka")).toBeGreaterThan(0.9);
    expect(await lit(page)).toEqual(["Japan"]);
    await expect(map(page)).toHaveScreenshot("map-focus-route.png");
    // Escape ends the hover and keeps focus; Shift+Tab goes back to the country focus left.
    await page.keyboard.press("Escape");
    await page.clock.runFor(REST);
    await expect(arrows(page)).toHaveCount(0);
    expect(await lit(page)).toHaveLength(13);
    await expect(route(page, "Tanaka")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(country(page, "France")).toBeFocused();
  });
});

test.describe("a resize", () => {
  test("draws the map again at the new width, its marks the same elements, and an outline on show follows its country", async ({ page }) => {
    await openDemo(page, mapDemo);
    const width = (): Promise<number> => map(page).evaluate((svg) => Number(svg.getAttribute("width")));
    const before = await width();
    await page.locator("#map path.country").evaluateAll((paths) => paths.forEach((path, i) => ((path as unknown as { tagged: number }).tagged = i)));
    await tabInto(page, map(page));
    await page.clock.runFor(REST);
    await page.setViewportSize({ width: 600, height: 4400 });
    await expect.poll(width).toBeLessThan(before);
    await page.clock.runFor(REST);
    expect(await page.locator("#map path.country").evaluateAll((paths) => paths.map((path) => (path as unknown as { tagged?: number }).tagged))).toEqual(COUNTRIES.map((_, i) => i));
    await expect(country(page, "Argentina")).toBeFocused();
    // The outline is Argentina's shape, where it is now.
    const boxes = async (): Promise<number[][]> => Promise.all([country(page, "Argentina"), outlines(page)].map(async (shape) => Object.values((await shape.boundingBox())!).map((value) => Math.round(value))));
    const [mark, outlined] = await boxes();
    for (const [i, value] of mark!.entries()) expect(Math.abs(outlined![i]! - value)).toBeLessThanOrEqual(3);
    expect(await along(page, "Castillo")).toBeGreaterThan(0.8);
    expect(await ringShown(page)).toBe(true);
    await expect(page.locator('#map [role="img"]')).toHaveCount(17);
  });

  test("the map never zooms or pans: a wheel, a drag and a double click leave it as it was", async ({ page }) => {
    await openDemo(page, mapDemo);
    const drawn = (): Promise<{ viewBox: string | null; land: string }> => map(page).evaluate((svg) => ({ viewBox: svg.getAttribute("viewBox"), land: svg.querySelector("g.map-land")!.outerHTML }));
    const before = await drawn();
    const box = (await map(page).boundingBox())!;
    // The sea west of Africa, where nothing is hovered.
    const sea = { x: box.x + box.width * 0.42, y: box.y + box.height * 0.5 };
    await page.mouse.move(sea.x, sea.y);
    await page.mouse.wheel(0, -400);
    await page.mouse.down();
    await page.mouse.move(sea.x + 80, sea.y + 40);
    await page.mouse.up();
    await page.mouse.dblclick(sea.x, sea.y);
    await page.clock.runFor(REST);
    expect(await drawn()).toEqual(before);
    expect(await map(page).evaluate((svg) => getComputedStyle(svg).transform)).toBe("none");
  });
});

test.describe("reduced motion and Off", () => {
  test("with reduced motion, a hover shows its end state at once, until the viewer picks a mode", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, mapDemo);
    await hoverRoute(page, "Castillo");
    // No time passes: the arrow is at the club's end, and Argentina is outlined.
    await expect(arrows(page)).toHaveCount(1);
    expect(await along(page, "Castillo")).toBeGreaterThan(0.9);
    expect(await keysOf(outlines(page))).toEqual(["Argentina"]);
    expect(await lit(page)).toEqual(["Argentina"]);
    await expect(map(page)).toHaveScreenshot("map-reduced-motion.png");
    const rest = await along(page, "Castillo");
    await page.clock.runFor(REST);
    expect(await along(page, "Castillo")).toBe(rest);
    // The viewer's own pick overrides the device's setting.
    await pickMode(page, "Presentation");
    await hoverRoute(page, "Castillo");
    await page.clock.runFor(200);
    expect(await along(page, "Castillo")).toBeLessThan(0.6);
    await page.clock.runFor(REST);
    expect(await along(page, "Castillo")).toBeGreaterThan(0.9);
  });

  test("in Off, an arrow is at its end at once, and the outline is the same", async ({ page }) => {
    await openDemo(page, mapDemo);
    await pickMode(page, "Off");
    await hoverShape(page, country(page, "Mexico"));
    await expect(arrows(page)).toHaveCount(1);
    expect(await keysOf(arrows(page))).toEqual(["Reyes"]);
    expect(await along(page, "Reyes")).toBeGreaterThan(0.9);
    expect(await keysOf(outlines(page))).toEqual(["Mexico"]);
  });

  test("reduced motion turned on part way lands the arrow at the club's end, the outline kept", async ({ page }) => {
    await openDemo(page, mapDemo);
    await hoverRoute(page, "Tanaka");
    await page.clock.runFor(200);
    expect(await along(page, "Tanaka")).toBeLessThan(0.6);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => along(page, "Tanaka")).toBeGreaterThan(0.9);
    expect(await keysOf(outlines(page))).toEqual(["Japan"]);
    expect(await lit(page)).toEqual(["Japan"]);
  });
});

/**
 * What Chrome's accessibility tree exposes inside `#map`, each node as "role: name", for the roles the
 * map uses, as layouts.spec.ts reads it.
 */
async function readable(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'section[aria-labelledby="map-title"] .box' });
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
  test("the map is a named group of 13 countries and 4 routes, each named once, and the land, the club's marker and the legend are never read", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "It reads Chrome's accessibility tree, over CDP.");
    await openDemo(page, mapDemo);
    const expected = [`group: ${MAP_NAME}`, ...COUNTRIES.map((row) => `image: ${countryName(row)}`), ...SIGNINGS.map((row) => `image: ${routeName(row)}`)].sort();
    expect((await readable(page)).sort()).toEqual(expected);
    // The same with a country hovered: the outline and the arrow, in the overlay, aren't read.
    await hoverShape(page, country(page, "Nigeria"));
    await page.clock.runFor(REST);
    await expect(arrows(page)).toHaveCount(1);
    expect((await readable(page)).sort()).toEqual(expected);
  });
});
