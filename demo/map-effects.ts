// The map page's rows, and what it gives expressive() for its D3 map. demo/map.ts draws the map and
// wires the page; src/map.test.ts runs these same descriptions on the same marks, on a clock it
// controls, so the page and its test can't drift apart. The map is drawn by demo/d3-map.ts, which knows
// nothing about expressive-charts; everything the adapter can't read from an element by its tag is said
// here (CLAUDE.md rule 3: no effect knows a chart).

import { defineEffect, expressive, link, travel, type Attachment, type GeometryEffect, type Link } from "../src/index";
import { count, type Attach } from "./charts-effects";
import type { Country, CountryRow, DrawnMap, MapRows, Place, Route, Shade, Signing } from "./d3-map";

export type { Attach };

// ── The rows ─────────────────────────────────────────────────────────────────

/**
 * Where Harbor City FC's 25 players come from, made up as the other pages' numbers are, each country
 * named as world-atlas names it. None is cut by the 180° meridian (Russia and Fiji are), so nothing is
 * placed from bounds as wide as the map.
 */
export const squad: readonly CountryRow[] = [
  { name: "United Kingdom", players: 8 },
  { name: "Nigeria", players: 3 },
  { name: "France", players: 2 },
  { name: "Ireland", players: 2 },
  { name: "Spain", players: 2 },
  { name: "Argentina", players: 1 },
  { name: "Czechia", players: 1 },
  { name: "Japan", players: 1 },
  { name: "Mexico", players: 1 },
  { name: "Morocco", players: 1 },
  { name: "Poland", players: 1 },
  { name: "Portugal", players: 1 },
  { name: "Sweden", players: 1 }
];

/** The squad: 25. */
export const squadSize: number = squad.reduce((sum, row) => sum + row.players, 0);

/** The club's place: a port on England's north-west coast. Every route ends here. */
export const club: Place = { name: "Harbor City", lon: -3.0, lat: 53.4 };

/**
 * The summer's signings, each with the city he came from. From the club, Japan is to the east across
 * Asia, Nigeria south, and Argentina and Mexico west across the Atlantic, so no route crosses the 180°
 * meridian, where the projection would cut it in two.
 */
export const signings: readonly Signing[] = [
  { player: "Adeyemi", from: "Nigeria", city: { name: "Lagos", lon: 3.4, lat: 6.5 } },
  { player: "Tanaka", from: "Japan", city: { name: "Osaka", lon: 135.5, lat: 34.7 } },
  { player: "Castillo", from: "Argentina", city: { name: "Buenos Aires", lon: -58.4, lat: -34.6 } },
  { player: "Reyes", from: "Mexico", city: { name: "Guadalajara", lon: -103.35, lat: 20.67 } }
];

/** The page's colour scale: three steps, each drawn from the theme's first colour by the page's CSS. */
export const shades: readonly Shade[] = [
  { from: 1, label: "1" },
  { from: 2, label: "2–3" },
  { from: 4, label: "4 or more" }
];

/** Everything the map draws. */
export const mapRows: MapRows = { countries: squad, signings, club, shades, legend: "Players" };

// ── Words ────────────────────────────────────────────────────────────────────

/** "Nigeria: 3 players", "Japan: 1 player": the count is in the name, so nothing is told by shade alone (WCAG 1.4.1). */
export const countryWords = (row: CountryRow): string => `${row.name}: ${count(row.players, "player")}`;
/** "Adeyemi, from Nigeria". */
export const routeWords = (signing: Signing): string => `${signing.player}, from ${signing.from}`;

// ── Effects ──────────────────────────────────────────────────────────────────

/** The outline's width, px. */
const OUTLINE = 1.5;

/**
 * The page's own hover effect: the mark's outline, drawn in the overlay in the text colour, at once.
 * Nothing moves or fades under the pointer, and the runner takes it away on leave. Its end state is
 * the outline, so reduced motion and Off show the same thing. It reads only the mark's outline, so it
 * works on any mark; the library's effects that draw along a mark do nothing on a closed shape, which
 * has no direction.
 */
export const outline = (): GeometryEffect => {
  const draw: GeometryEffect["end"] = (mark, ctx) => {
    const path = ctx.layer.path(mark.outline.d, { stroke: "text", width: OUTLINE });
    // A resize draws the map again: the outline follows its mark.
    ctx.onChange((next) => path.update(next.outline.d));
  };
  return defineEffect({
    run: async (mark, ctx) => draw(mark, ctx),
    end: draw
  });
};

export interface MapEffects {
  readonly countries: Attachment<Country>;
  readonly routes: Attachment<Route>;
  readonly link: Link;
  /** Reads the map's marks again, after it draws again at a new width. */
  refresh(): void;
  destroy(): void;
}

/**
 * The squad's countries, read by their tags as closed shapes and keyed by name, are one attachment: the
 * keyboard goes through them in name order, a hover outlines one and dims the rest, and each is named
 * with its count. The land under them isn't attached, so it never reacts.
 *
 * The routes, open paths, are a second: each is named with its player and the country he came from,
 * and on hover or focus an arrow travels it, from the city to the club, and rests there.
 *
 * The two are linked by country, so a route lights the country it comes from, and a country its route.
 */
export function attachMap(chart: DrawnMap, attach: Attach = expressive): MapEffects {
  const countries = attach(chart.countries, {
    key: (d) => d.name,
    value: (d) => d.players,
    keyboard: true,
    markLabel: countryWords,
    dim: true,
    on: { hover: outline() }
  });
  const routes = attach(chart.routes, {
    key: (d) => d.player,
    // Where it's from: without a value, a resize, which changes every route's length, would read as an update.
    value: (d) => d.city.name,
    keyboard: true,
    markLabel: routeWords,
    on: { hover: travel("arrow") }
  });
  // A country's row has no `from`; a route's names its country.
  const linked = link([countries, routes], { by: ({ data }) => ("from" in data.datum ? data.datum.from : data.datum.name) });
  return {
    countries,
    routes,
    link: linked,
    refresh() {
      countries.refresh(chart.countries);
      routes.refresh(chart.routes);
    },
    destroy() {
      linked.destroy();
      routes.destroy();
      countries.destroy();
    }
  };
}
