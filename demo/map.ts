// A map from docs/ideas/effects-by-chart.md, drawn with D3 by a module that knows nothing about
// expressive-charts (demo/d3-map.ts), and given its effects through expressive() by demo/map-effects.ts:
// the countries a squad comes from, shaded by how many players come from each, a hover that outlines one
// and dims the rest, and a route for each of the summer's signings that an arrow travels. The page loads
// at rest: nothing plays by itself, and the map never zooms or pans.
import { motionSwitch } from "../src/index";
import { drawMap } from "./d3-map";
import { attachMap, mapRows, signings, squad, squadSize } from "./map-effects";

const svg = document.querySelector<SVGSVGElement>("#map");
if (!svg) throw new Error("demo/map.html has no #map.");

const map = drawMap(svg, mapRows);
const effects = attachMap(map);

// ── The tables ───────────────────────────────────────────────────────────────

/** A table's body by the table's id. */
function bodyOf(id: string): HTMLTableSectionElement {
  const body = document.querySelector<HTMLTableSectionElement>(`#${id} tbody`);
  if (!body) throw new Error(`demo/map.html has no #${id}.`);
  return body;
}

/** A row of cells: the first is the row's header, and a number is set to the right. */
function row(cells: readonly (string | number)[]): HTMLTableRowElement {
  const tr = document.createElement("tr");
  cells.forEach((value, i) => {
    const cell = tr.appendChild(document.createElement(i === 0 ? "th" : "td"));
    if (i === 0) cell.scope = "row";
    if (typeof value === "number") cell.className = "number";
    cell.textContent = String(value);
  });
  return tr;
}

// The map's own rows, so the tables can't drift from it: the countries most players first, as the rows
// have them, and the signings with the city each came from.
bodyOf("countries-table").replaceChildren(...squad.map((country) => row([country.name, country.players])));
document.querySelector("#countries-table tfoot td")!.textContent = String(squadSize);
bodyOf("signings-table").replaceChildren(...signings.map((signing) => row([signing.player, signing.city.name, signing.from])));

// ── The page ─────────────────────────────────────────────────────────────────

// The map draws itself again at the new width, and refresh() reads its marks again: an outline or an
// arrow on show follows its mark.
window.addEventListener("resize", () => {
  map.resize();
  effects.refresh();
});

// The motion switch is the viewer's own choice, so it overrides the device's reduced-motion setting.
motionSwitch("#motion");
