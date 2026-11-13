// "Someone else's chart", as a map: where a squad comes from, drawn the way D3 code would draw one.
// world-atlas's 110m countries (Natural Earth's borders, public domain) are read with topojson-client and
// drawn with d3-geo on an equal-area projection, geoEqualEarth(), fitted to the container's width. Every
// country is plain land, hidden from screen readers; the countries the rows name are drawn again on top,
// a <path> each, joined by name and in name order, shaded by how many players come from each; and each
// signing is a route, a <path> from a LineString, from the city he came from to the club. Like
// d3-treemap.ts it knows nothing about expressive-charts; demo/map-effects.ts attaches the effects with
// expressive().
//
// A country is keyed by its name: three in the file have no id. The map never zooms or pans.
//
// Its ARIA is a careful D3 author's: the land, the club's marker and the legend are hidden, and the page
// gives the <svg> role="group" and its name.

import { geoEqualEarth, geoPath, type ExtendedFeature, type GeoGeometryObjects } from "d3-geo";
import { select, type Selection } from "d3-selection";
import { feature } from "topojson-client";
import topology from "world-atlas/countries-110m.json";

/** A country as the file has it: its shape and its name ("United States of America", "Dem. Rep. Congo"). */
export type Land = ExtendedFeature<GeoGeometryObjects, { readonly name: string }>;

/** The file's 177 countries, in its order. */
export const world: readonly Land[] = (feature(topology, topology.objects.countries) as unknown as { readonly features: readonly Land[] }).features;

/** A country of the squad's: its name as the file has it, and how many players come from it. */
export interface CountryRow {
  readonly name: string;
  readonly players: number;
}

/** A place on the map: a city, or the club. */
export interface Place {
  readonly name: string;
  readonly lon: number;
  readonly lat: number;
}

/** A signing: the player, the country he came from, as the file names it, and the city there his route starts at. */
export interface Signing {
  readonly player: string;
  readonly from: string;
  readonly city: Place;
}

/** A step of the page's colour scale: the fewest players it's for, and its words in the legend. */
export interface Shade {
  readonly from: number;
  readonly label: string;
}

/** What the map draws. */
export interface MapRows {
  readonly countries: readonly CountryRow[];
  readonly signings: readonly Signing[];
  /** Where every route ends. */
  readonly club: Place;
  /** The colour scale's steps, fewest first. */
  readonly shades: readonly Shade[];
  /** The legend's title: what a shade counts. */
  readonly legend: string;
}

/** A country's mark: its row, its shape from the file, and its step of the scale, from 1. */
export interface Country extends CountryRow {
  readonly shape: Land;
  readonly shade: number;
}

/** A signing's route: its row and where it ends. */
export interface Route extends Signing {
  readonly to: Place;
}

export interface DrawnMap {
  /** Every country in the file as plain land, in the file's order: context, not marks. */
  readonly land: Selection<SVGPathElement, Land, SVGGElement, null>;
  /** The countries the rows name, in name order. */
  readonly countries: Selection<SVGPathElement, Country, SVGGElement, null>;
  /** A route a signing, in the rows' order, each from its city to the club. */
  readonly routes: Selection<SVGPathElement, Route, SVGGElement, null>;
  /** Draws the map again at its container's width: each mark is joined by name, so it keeps its element. */
  resize(): void;
}

/** The legend's row under the map, its swatches' size, its text's, and how much of a size each character may take with WCAG's text spacing on top (0.12 em a letter). */
const LEGEND = 30;
const SWATCH = 12;
const TEXT = 11;
const CHAR = 0.76;
/** The width the routes and the club's marker are drawn full size at; narrower, they shrink with the map, down to half. */
const FULL = 640;
/** A route's stroke width and the club's marker's radius, at full size. */
const ROUTE = 2;
const CLUB = 3.5;

const SPHERE = { type: "Sphere" } as const;

/** The width inside the parent's padding. */
function roomFor(svg: SVGSVGElement): number {
  const parent = svg.parentElement;
  if (!parent) return 640;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** Draws the map, and returns its marks. A row that names a country the file hasn't throws. */
export function drawMap(svgElement: SVGSVGElement, rows: MapRows): DrawnMap {
  const shapes = new Map(world.map((land) => [land.properties.name, land]));
  const countries = rows.countries
    .map((row): Country => {
      const shape = shapes.get(row.name);
      if (!shape) throw new RangeError(`drawMap: world-atlas has no country named "${row.name}".`);
      return { ...row, shape, shade: Math.max(1, rows.shades.filter((shade) => row.players >= shade.from).length) };
    })
    // Name order: the order a keyboard goes through them, since the arrow keys follow the document's.
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  const routes = rows.signings.map((signing): Route => ({ ...signing, to: rows.club }));

  const svg = select(svgElement);
  const layer = (name: string, hidden: boolean): Selection<SVGGElement, null, SVGSVGElement, unknown> =>
    svg
      .selectAll<SVGGElement, null>(`g.${name}`)
      .data([null])
      .join("g")
      .attr("class", name)
      .attr("aria-hidden", hidden ? "true" : null);
  // In drawing order: the land, the squad's countries, the routes over them, the club, and the legend.
  const landLayer = layer("map-land", true);
  const countryLayer = layer("map-countries", false);
  const routeLayer = layer("map-routes", false);
  const clubLayer = layer("map-club", true);
  const legendLayer = layer("map-legend", true);

  let drawn: Pick<DrawnMap, "land" | "countries" | "routes">;
  const draw = (): void => {
    const width = Math.max(280, Math.floor(roomFor(svgElement)));
    const projection = geoEqualEarth().fitWidth(width, SPHERE);
    const path = geoPath(projection);
    const mapHeight = Math.ceil(path.bounds(SPHERE)[1][1]);
    const height = mapHeight + LEGEND;
    // At a phone's width the routes and the club's marker would cover the countries under them.
    const scale = Math.max(0.5, Math.min(1, width / FULL));
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);

    landLayer
      .selectAll<SVGPathElement, typeof SPHERE>("path.sphere")
      .data([SPHERE])
      .join("path")
      .attr("class", "sphere")
      .attr("d", (d) => path(d));
    const land = landLayer
      .selectAll<SVGPathElement, Land>("path.land")
      .data(world, (d) => d.properties.name)
      .join("path")
      .attr("class", "land")
      .attr("d", (d) => path(d));

    const marks = countryLayer
      .selectAll<SVGPathElement, Country>("path.country")
      .data(countries, (d) => d.name)
      .join("path")
      .attr("class", (d) => `country shade-${d.shade}`)
      .attr("d", (d) => path(d.shape));

    // geoPath() draws a LineString as the great circle between its ends, cut where it would cross the
    // 180° meridian; the rows keep every route clear of it.
    const lines = routeLayer
      .selectAll<SVGPathElement, Route>("path.route")
      .data(routes, (d) => d.player)
      .join("path")
      .attr("class", "route")
      .attr("fill", "none")
      .attr("stroke-width", ROUTE * scale)
      .attr("d", (d) =>
        path({
          type: "LineString",
          coordinates: [
            [d.city.lon, d.city.lat],
            [d.to.lon, d.to.lat]
          ]
        })
      );

    const [clubX = 0, clubY = 0] = projection([rows.club.lon, rows.club.lat]) ?? [];
    clubLayer.selectAll<SVGCircleElement, Place>("circle.club").data([rows.club]).join("circle").attr("class", "club").attr("cx", clubX).attr("cy", clubY).attr("r", CLUB * scale);

    // The legend: its title, then a swatch and its words a step, left to right under the map.
    const y = mapHeight + LEGEND / 2;
    const wide = (text: string): number => text.length * TEXT * CHAR;
    let x = 0;
    const title = { text: rows.legend, x };
    x += wide(rows.legend) + SWATCH;
    const steps = rows.shades.map((shade, i) => {
      const step = { ...shade, shade: i + 1, x };
      x += SWATCH + 5 + wide(shade.label) + SWATCH;
      return step;
    });
    legendLayer
      .selectAll<SVGTextElement, typeof title>("text.legend-title")
      .data([title])
      .join("text")
      .attr("class", "legend-title")
      .attr("x", (d) => d.x)
      .attr("y", y)
      .attr("dy", "0.35em")
      .text((d) => d.text);
    legendLayer
      .selectAll<SVGRectElement, (typeof steps)[number]>("rect.legend-swatch")
      .data(steps)
      .join("rect")
      .attr("class", (d) => `legend-swatch shade-${d.shade}`)
      .attr("x", (d) => d.x)
      .attr("y", y - SWATCH / 2)
      .attr("width", SWATCH)
      .attr("height", SWATCH)
      .attr("rx", 3);
    legendLayer
      .selectAll<SVGTextElement, (typeof steps)[number]>("text.legend-label")
      .data(steps)
      .join("text")
      .attr("class", "legend-label")
      .attr("x", (d) => d.x + SWATCH + 5)
      .attr("y", y)
      .attr("dy", "0.35em")
      .text((d) => d.label);

    drawn = { land, countries: marks, routes: lines };
  };
  draw();

  return {
    get land() {
      return drawn.land;
    },
    get countries() {
      return drawn.countries;
    },
    get routes() {
      return drawn.routes;
    },
    resize: draw
  };
}
