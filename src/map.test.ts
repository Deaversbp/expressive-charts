// The map page (demo/map.html, M17 step 3): the map drawn by the page's own D3 module and attached with
// demo/map-effects.ts, on a clock the test controls. These pin what the page promises: only the
// countries the rows name are marks, each a closed shape keyed by its name, in name order, and the land
// under them never one; every country in the file can attach, as a check of scale; each route is an open
// shape of one subpath, clear of the 180° meridian, that an arrow travels on hover; the page's own
// outline is drawn at once and gone on leave, with the other countries dimmed; a route lights its
// country through the link, and a country its route; a resize draws the map again and each mark follows
// with no event; each mark's name; and reduced motion and Off. It brings a chart and effects together,
// so it lives beside src/index.ts, the only module allowed to.

import { drawMap, world, type Country, type DrawnMap, type Route } from "../demo/d3-map";
import { attachMap, club, mapRows, outline, shades, signings, squad, squadSize, type Attach, type MapEffects } from "../demo/map-effects";
import { expressive, type ChartEnv } from "./charts";
import { createMotion, manualClock, type MarkGeometry, type MotionMode } from "./core";
import { iconRegistry, presetRegistry } from "./registries";

type Env = ChartEnv & { readonly clock: ReturnType<typeof manualClock> };

function env(mode: MotionMode = "presentation", reduced = false): Env {
  const motion = createMotion({ mode, reducedMotion: { matches: reduced, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

/** expressive() as the page calls it, on the test's clock. */
const attachOn =
  (e: ChartEnv): Attach =>
  (source, options) =>
    expressive(source, options, e);

afterEach(() => document.body.replaceChildren());

interface Point {
  readonly x: number;
  readonly y: number;
}

/** The squad's countries in name order, as the module draws them. */
const NAMES: readonly string[] = squad.map((row) => row.name).sort((a, b) => a.localeCompare(b, "en"));

/**
 * The page's map in a card, attached as the page attaches it. jsdom has no layout, so the card's width
 * is the test's to set: `resize(width)` gives it one and draws again, as the page's resize does.
 */
function setup(mode: MotionMode = "presentation", reduced = false, width = 640) {
  const e = env(mode, reduced);
  const card = document.body.appendChild(document.createElement("div"));
  let room = width;
  Object.defineProperty(card, "clientWidth", { configurable: true, get: () => room });
  const svg = card.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
  const chart: DrawnMap = drawMap(svg, mapRows);
  const fx: MapEffects = attachMap(chart, attachOn(e));
  const resize = (to: number): void => {
    room = to;
    chart.resize();
    fx.refresh();
  };
  return { e, svg, chart, fx, resize };
}

/** Runs the clock on, a frame at a time, letting each frame's promises settle, as a browser's would. */
async function run(e: Env, ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 16) {
    e.clock.advance(16);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
}
/** Lets promises settle with no time passing. */
const settle = (e: Env): Promise<void> => run(e, 0).then(() => Promise.resolve());

const pointer = (type: string, target: Element): boolean => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
/** The pointer moves onto a mark. */
function hover(target: Element): void {
  pointer("pointerover", target);
  pointer("pointermove", target);
}
const press = (name: string): void => void document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

const country = (chart: DrawnMap, name: string): SVGPathElement => chart.countries.nodes().find((node) => (node as unknown as { __data__: Country }).__data__.name === name)!;
const route = (chart: DrawnMap, player: string): SVGPathElement => chart.routes.nodes().find((node) => (node as unknown as { __data__: Route }).__data__.player === player)!;
const markOf = (marks: readonly MarkGeometry[], key: string): MarkGeometry => marks.find((mark) => mark.key === key)!;

/** The countries that aren't dimmed. */
const lit = (chart: DrawnMap): string[] =>
  chart.countries
    .nodes()
    .filter((node) => !node.classList.contains("ec-dimmed"))
    .map((node) => (node as unknown as { __data__: Country }).__data__.name);

/** The outlines the page's effect has drawn, by country: each one's path data and its stroke. */
function outlines(svg: SVGSVGElement): Map<string, { readonly d: string; readonly stroke: string; readonly width: string | null }> {
  return new Map(
    Array.from(svg.querySelectorAll<SVGGElement>('.ec-overlay .ec-run[data-slot="hover"]'), (group) => [group, group.querySelector<SVGPathElement>("path.ec-path")] as const)
      .filter((entry): entry is readonly [SVGGElement, SVGPathElement] => entry[1] !== null)
      .map(([group, path]) => [group.getAttribute("data-key")!, { d: path.getAttribute("d")!, stroke: path.style.stroke, width: path.getAttribute("stroke-width") }])
  );
}

/** The arrows on show, by route: each one's place, its transform's translation. */
function arrows(svg: SVGSVGElement): Map<string, Point> {
  return new Map(
    Array.from(svg.querySelectorAll<SVGGElement>('.ec-overlay .ec-icon[data-icon="arrow"]'), (icon) => {
      const values = (icon.getAttribute("transform")?.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
      return [icon.closest(".ec-run")!.getAttribute("data-key")!, { x: values[values.length - 2]!, y: values[values.length - 1]! }] as const;
    })
  );
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
/** How many subpaths a path's data has. */
const subpaths = (d: string | null): number => (d?.match(/M/g) ?? []).length;

describe("the rows", () => {
  it("name 13 countries the file has, 25 players in all, and a scale step for each", () => {
    expect(squad).toHaveLength(13);
    expect(squadSize).toBe(25);
    const names = new Set(world.map((land) => land.properties.name));
    expect(squad.filter((row) => !names.has(row.name))).toEqual([]);
    expect(signings.filter((signing) => !squad.some((row) => row.name === signing.from))).toEqual([]);
    const { chart } = setup();
    expect(Object.fromEntries(chart.countries.data().map((d) => [d.name, d.shade]))).toEqual(Object.fromEntries(squad.map((row) => [row.name, row.players >= 4 ? 3 : row.players >= 2 ? 2 : 1])));
    expect(shades.map((shade) => shade.label)).toEqual(["1", "2–3", "4 or more"]);
  });

  it("a row that names a country the file hasn't throws", () => {
    const svg = document.body.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    expect(() => drawMap(svg, { ...mapRows, countries: [{ name: "England", players: 8 }] })).toThrow('world-atlas has no country named "England"');
  });
});

describe("the countries", () => {
  it("are the rows' 13, each a closed shape keyed by its name, in name order, with its count in its name", () => {
    const { chart, fx } = setup();
    const marks = fx.countries.marks();
    expect(marks.map((mark) => mark.key)).toEqual(NAMES);
    for (const mark of marks) {
      expect(mark.outline.closed, mark.key).toBe(true);
      // A closed shape has no direction.
      expect(mark.length, mark.key).toBe(0);
      expect(mark.bounds.width, mark.key).toBeGreaterThan(0);
    }
    expect(chart.countries.nodes().map((node) => node.getAttribute("aria-label"))).toEqual(
      NAMES.map((name) => {
        const players = squad.find((row) => row.name === name)!.players;
        return `${name}: ${players} ${players === 1 ? "player" : "players"}`;
      })
    );
    for (const node of chart.countries.nodes()) expect(node.getAttribute("role")).toBe("img");
  });

  it("none is cut by the 180° meridian: each is narrower than a third of the map", () => {
    const { fx } = setup();
    for (const mark of fx.countries.marks()) expect(mark.bounds.width, mark.key).toBeLessThan(640 / 3);
  });

  it("the land under them is never a mark: 177 plain paths in a hidden group, unnamed, out of the tab order, and unmoved by a hover", async () => {
    const { e, svg, chart } = setup();
    const land = chart.land.nodes();
    expect(land).toHaveLength(177);
    expect(svg.querySelector("g.map-land")!.getAttribute("aria-hidden")).toBe("true");
    const before = svg.querySelector("g.map-land")!.outerHTML;
    for (const node of land) {
      expect(node.hasAttribute("role")).toBe(false);
      expect(node.hasAttribute("aria-label")).toBe(false);
      expect(node.hasAttribute("tabindex")).toBe(false);
      expect(node.classList.contains("ec-attached")).toBe(false);
    }
    // A hover on the land does nothing; one on a country leaves the land as it was.
    hover(land[0]!);
    await run(e, 120);
    expect(lit(chart)).toEqual(NAMES);
    expect(outlines(svg).size).toBe(0);
    hover(country(chart, "Nigeria"));
    await run(e, 120);
    expect(svg.querySelector("g.map-land")!.outerHTML).toBe(before);
    // The club's marker and the legend are hidden too: the marks' names say what they show.
    expect(svg.querySelector("g.map-club")!.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("g.map-legend")!.getAttribute("aria-hidden")).toBe("true");
    expect([...svg.querySelectorAll("g.map-legend text")].map((text) => text.textContent)).toEqual(["Players", "1", "2–3", "4 or more"]);
  });

  it("all 177 countries in the file attach as closed shapes keyed by name, as a check of scale", () => {
    const { e, chart } = setup();
    const all = expressive(chart.land, { key: (d) => d.properties.name, keyboard: true, markLabel: (d) => d.properties.name, dim: true }, e);
    const marks = all.marks();
    expect(marks).toHaveLength(177);
    expect(new Set(marks.map((mark) => mark.key)).size).toBe(177);
    expect(marks.every((mark) => mark.outline.closed)).toBe(true);
    // Three have no id in the file, which is why a country is keyed by its name.
    expect(world.filter((land) => land.id === undefined)).toHaveLength(3);
    all.destroy();
  });
});

describe("the hover outline", () => {
  it("is a geometry effect of the page's own, frozen, with an end state", () => {
    const effect = outline();
    expect(effect.kind).toBe("geometry");
    expect(Object.isFrozen(effect)).toBe(true);
    expect(typeof effect.end).toBe("function");
  });

  it("is drawn at once, the mark's own outline in the text colour, with the others dimmed, and gone on leave", async () => {
    const { e, svg, chart, fx } = setup();
    expect(outlines(svg).size).toBe(0);
    hover(country(chart, "Nigeria"));
    // No time passes.
    await settle(e);
    const nigeria = markOf(fx.countries.marks(), "Nigeria");
    expect([...outlines(svg).keys()]).toEqual(["Nigeria"]);
    expect(outlines(svg).get("Nigeria")).toEqual({ d: nigeria.outline.d, stroke: "var(--ec-text, #0b0b0b)", width: "1.5" });
    expect(lit(chart)).toEqual(["Nigeria"]);
    // It stays as it is while the hover lasts: nothing moves under the pointer.
    const drawn = outlines(svg).get("Nigeria");
    await run(e, 2000);
    expect(outlines(svg).get("Nigeria")).toEqual(drawn);
    // The mark itself isn't moved or resized.
    expect(country(chart, "Nigeria").style.transform).toBe("");
    pointer("pointerleave", svg);
    await run(e, 120);
    expect(outlines(svg).size).toBe(0);
    expect(lit(chart)).toEqual(NAMES);
  });

  it("moves to the next country hovered, one outline at a time", async () => {
    const { e, svg, chart } = setup();
    hover(country(chart, "Nigeria"));
    await settle(e);
    hover(country(chart, "France"));
    await settle(e);
    expect([...outlines(svg).keys()]).toEqual(["France"]);
    // France's shape in the file is several: the mainland, Corsica and French Guiana, all outlined.
    expect(subpaths(outlines(svg).get("France")!.d)).toBe(3);
    expect(lit(chart)).toEqual(["France"]);
  });
});

describe("the routes", () => {
  it("are the four signings, each an open shape of one subpath from its city to the club, clear of the 180° meridian", () => {
    const { chart, fx } = setup();
    const marks = fx.routes.marks();
    expect(marks.map((mark) => mark.key)).toEqual(signings.map((signing) => signing.player));
    const clubs = marks.map((mark) => mark.end);
    for (const mark of marks) {
      expect(mark.outline.closed, mark.key).toBe(false);
      expect(subpaths(route(chart, mark.key).getAttribute("d")), mark.key).toBe(1);
      expect(mark.gaps ?? [], mark.key).toEqual([]);
      expect(mark.length, mark.key).toBeGreaterThan(60);
      // A route cut by the meridian would run the width of the map.
      expect(mark.length, mark.key).toBeLessThan(400);
      // Every route ends at the club.
      expect(distance(mark.end, clubs[0]!), mark.key).toBeLessThan(0.01);
      expect(route(chart, mark.key).getAttribute("fill")).toBe("none");
    }
    // Each starts inside the country it's from.
    const countries = fx.countries.marks();
    for (const signing of signings) {
      const { bounds } = markOf(countries, signing.from);
      const { start } = markOf(marks, signing.player);
      expect(start.x, signing.player).toBeGreaterThanOrEqual(bounds.x - 1);
      expect(start.x, signing.player).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      expect(start.y, signing.player).toBeGreaterThanOrEqual(bounds.y - 1);
      expect(start.y, signing.player).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
    }
    // And the club is in the United Kingdom.
    const uk = markOf(countries, "United Kingdom").bounds;
    expect(clubs[0]!.x).toBeGreaterThan(uk.x);
    expect(clubs[0]!.x).toBeLessThan(uk.x + uk.width);
    expect(club.name).toBe("Harbor City");
    expect(chart.routes.nodes().map((node) => node.getAttribute("aria-label"))).toEqual(["Adeyemi, from Nigeria", "Tanaka, from Japan", "Castillo, from Argentina", "Reyes, from Mexico"]);
  });

  it("an arrow travels a hovered route from its city to the club and rests there, and is gone on leave", async () => {
    const { e, svg, chart, fx } = setup();
    const tanaka = markOf(fx.routes.marks(), "Tanaka");
    expect(arrows(svg).size).toBe(0);
    hover(route(chart, "Tanaka"));
    await run(e, 120);
    const early = arrows(svg).get("Tanaka")!;
    expect([...arrows(svg).keys()]).toEqual(["Tanaka"]);
    await run(e, 300);
    const later = arrows(svg).get("Tanaka")!;
    // On its way: further from the city, nearer the club.
    expect(distance(later, tanaka.start)).toBeGreaterThan(distance(early, tanaka.start));
    expect(distance(later, tanaka.end)).toBeLessThan(distance(early, tanaka.end));
    await run(e, 4000);
    // At rest by the club, as far in as half its length.
    const resting = arrows(svg).get("Tanaka")!;
    expect(distance(resting, tanaka.end)).toBeGreaterThan(6);
    expect(distance(resting, tanaka.end)).toBeLessThan(10);
    await run(e, 2000);
    expect(arrows(svg).get("Tanaka")).toEqual(resting);
    pointer("pointerleave", svg);
    await run(e, 120);
    expect(arrows(svg).size).toBe(0);
  });

  it("with motion Off, the arrow is at the club's end at once", async () => {
    const { e, svg, chart, fx } = setup("off");
    hover(route(chart, "Castillo"));
    await settle(e);
    const castillo = markOf(fx.routes.marks(), "Castillo");
    expect(distance(arrows(svg).get("Castillo")!, castillo.end)).toBeLessThan(10);
  });

  it("Off picked part way lands the arrow at the club's end, and keeps the country's outline", async () => {
    const { e, svg, chart, fx } = setup();
    hover(route(chart, "Reyes"));
    await run(e, 120);
    const reyes = markOf(fx.routes.marks(), "Reyes");
    expect(distance(arrows(svg).get("Reyes")!, reyes.end)).toBeGreaterThan(40);
    e.motion.setMode("off");
    await settle(e);
    expect(distance(arrows(svg).get("Reyes")!, reyes.end)).toBeLessThan(10);
    expect([...outlines(svg).keys()]).toEqual(["Mexico"]);
    expect(lit(chart)).toEqual(["Mexico"]);
  });
});

describe("the link", () => {
  it("a hovered route lights the country it comes from, outlined, and dims the rest", async () => {
    const { e, svg, chart, fx } = setup();
    hover(route(chart, "Tanaka"));
    await settle(e);
    expect(lit(chart)).toEqual(["Japan"]);
    expect(outlines(svg).get("Japan")!.d).toBe(markOf(fx.countries.marks(), "Japan").outline.d);
    pointer("pointerleave", svg);
    await run(e, 120);
    expect(lit(chart)).toEqual(NAMES);
    expect(outlines(svg).size).toBe(0);
  });

  it("a hovered country sends the arrow along its route, and one with no signing sends none", async () => {
    const { e, svg, chart } = setup();
    hover(country(chart, "Nigeria"));
    await run(e, 120);
    expect([...arrows(svg).keys()]).toEqual(["Adeyemi"]);
    hover(country(chart, "Sweden"));
    await run(e, 120);
    expect(arrows(svg).size).toBe(0);
    expect(lit(chart)).toEqual(["Sweden"]);
  });

  it("drops both attachments when the page's effects are destroyed", async () => {
    const { e, svg, chart, fx } = setup();
    fx.destroy();
    hover(country(chart, "Nigeria"));
    await run(e, 120);
    expect(svg.querySelectorAll(".ec-overlay")).toHaveLength(0);
    expect(chart.countries.nodes().every((node) => !node.hasAttribute("role") && !node.classList.contains("ec-dimmed"))).toBe(true);
  });
});

describe("the keyboard", () => {
  it("the countries are one tab stop and the routes another; the arrow keys go through the countries in name order", async () => {
    const { e, svg, chart, fx } = setup();
    expect([...svg.querySelectorAll('[tabindex="0"]')].map((node) => node.getAttribute("aria-label"))).toEqual(["Argentina: 1 player", "Adeyemi, from Nigeria"]);
    fx.countries.focus("Argentina");
    const at = (): string => (document.activeElement as unknown as { __data__: Country }).__data__.name;
    const seen = [at()];
    for (let i = 1; i < NAMES.length; i++) {
      press(i % 2 ? "ArrowRight" : "ArrowDown");
      seen.push(at());
    }
    expect(seen).toEqual(NAMES);
    // The last stays the last.
    press("ArrowRight");
    expect(at()).toBe("United Kingdom");
    press("ArrowLeft");
    expect(at()).toBe("Sweden");
    press("Home");
    expect(at()).toBe("Argentina");
    // Page Down goes a tenth of the marks on, rounded up: two of 13.
    press("PageDown");
    expect(at()).toBe(NAMES[2]);
    press("PageUp");
    expect(at()).toBe("Argentina");
    press("End");
    expect(at()).toBe("United Kingdom");
    // Focus is a hover from the keyboard: the country is outlined and the others dim.
    await settle(e);
    expect([...outlines(svg).keys()]).toEqual(["United Kingdom"]);
    expect(lit(chart)).toEqual(["United Kingdom"]);
    expect(svg.querySelectorAll('[tabindex="0"]')).toHaveLength(2);
  });

  it("the arrow keys go through the routes in the rows' order, and a focused route's arrow travels and its country lights", async () => {
    const { e, svg, chart, fx } = setup();
    fx.routes.focus("Adeyemi");
    const at = (): string => (document.activeElement as unknown as { __data__: Route }).__data__.player;
    const seen = [at()];
    for (let i = 1; i < signings.length; i++) {
      press("ArrowRight");
      seen.push(at());
    }
    expect(seen).toEqual(["Adeyemi", "Tanaka", "Castillo", "Reyes"]);
    await run(e, 4000);
    const reyes = markOf(fx.routes.marks(), "Reyes");
    expect([...arrows(svg).keys()]).toEqual(["Reyes"]);
    expect(distance(arrows(svg).get("Reyes")!, reyes.end)).toBeLessThan(10);
    expect(lit(chart)).toEqual(["Mexico"]);
    // Escape ends the hover and keeps focus.
    press("Escape");
    await run(e, 120);
    expect(arrows(svg).size).toBe(0);
    expect(lit(chart)).toEqual(NAMES);
    expect(at()).toBe("Reyes");
  });
});

describe("a resize", () => {
  it("draws the map again at the new width, and each mark follows with no event, keeping its element", async () => {
    const { chart, fx, resize, svg } = setup();
    const events: string[] = [];
    for (const type of ["enter", "update", "exit"] as const) {
      fx.countries.on(type, (event) => events.push(`${type} ${event.mark.key}`));
      fx.routes.on(type, (event) => events.push(`${type} ${event.mark.key}`));
    }
    const elements = [...chart.countries.nodes(), ...chart.routes.nodes()];
    const before = new Map([...fx.countries.marks(), ...fx.routes.marks()].map((mark) => [mark.key, mark]));
    expect(svg.getAttribute("width")).toBe("640");
    resize(320);
    expect(svg.getAttribute("width")).toBe("320");
    expect([...chart.countries.nodes(), ...chart.routes.nodes()]).toEqual(elements);
    const after = [...fx.countries.marks(), ...fx.routes.marks()];
    expect(after.map((mark) => mark.key)).toEqual([...before.keys()]);
    for (const mark of after) {
      const was = before.get(mark.key)!;
      // Half the width: each mark is half as wide, half as far across.
      expect(mark.bounds.width / was.bounds.width, mark.key).toBeCloseTo(0.5, 1);
      expect(mark.center.x / was.center.x, mark.key).toBeCloseTo(0.5, 1);
    }
    expect(events).toEqual([]);
    // The routes and the club's marker shrink with the map, down to half.
    expect(chart.routes.nodes().map((node) => node.getAttribute("stroke-width"))).toEqual(["1", "1", "1", "1"]);
    resize(1006);
    expect(chart.routes.nodes().map((node) => node.getAttribute("stroke-width"))).toEqual(["2", "2", "2", "2"]);
    expect(events).toEqual([]);
  });

  it("an outline and an arrow on show follow their marks", async () => {
    const { e, svg, chart, fx, resize } = setup();
    hover(route(chart, "Adeyemi"));
    await run(e, 4000);
    const wide = arrows(svg).get("Adeyemi")!;
    expect(distance(wide, markOf(fx.routes.marks(), "Adeyemi").end)).toBeLessThan(10);
    resize(320);
    await settle(e);
    // The outline is its country's, where the country is now.
    expect([...outlines(svg).keys()]).toEqual(["Nigeria"]);
    expect(outlines(svg).get("Nigeria")!.d).toBe(markOf(fx.countries.marks(), "Nigeria").outline.d);
    expect(lit(chart)).toEqual(["Nigeria"]);
    // refresh() starts a hover's effects again on the marks as they are now, as on every attachment:
    // the arrow is on the route at its new place, and travels it again to the club.
    const adeyemi = markOf(fx.routes.marks(), "Adeyemi");
    expect([...arrows(svg).keys()]).toEqual(["Adeyemi"]);
    expect(distance(arrows(svg).get("Adeyemi")!, adeyemi.start)).toBeLessThan(10);
    await run(e, 4000);
    const narrow = arrows(svg).get("Adeyemi")!;
    expect(narrow.x / wide.x).toBeCloseTo(0.5, 1);
    expect(distance(narrow, adeyemi.end)).toBeLessThan(10);
    expect(lit(chart)).toEqual(["Nigeria"]);
  });
});

describe("reduced motion", () => {
  it("shows each effect's end state at once: the outline, the others dimmed, and the arrow at the club's end", async () => {
    const { e, svg, chart, fx } = setup("presentation", true);
    hover(country(chart, "Argentina"));
    await settle(e);
    expect(outlines(svg).get("Argentina")!.d).toBe(markOf(fx.countries.marks(), "Argentina").outline.d);
    expect(lit(chart)).toEqual(["Argentina"]);
    const castillo = markOf(fx.routes.marks(), "Castillo");
    const resting = arrows(svg).get("Castillo")!;
    expect(distance(resting, castillo.end)).toBeLessThan(10);
    // Nothing moves afterwards.
    await run(e, 2000);
    expect(arrows(svg).get("Castillo")).toEqual(resting);
    pointer("pointerleave", svg);
    await settle(e);
    expect(outlines(svg).size).toBe(0);
    expect(arrows(svg).size).toBe(0);
    expect(lit(chart)).toEqual(NAMES);
  });
});
