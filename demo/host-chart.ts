// "Someone else's chart": a plain stacked bar chart drawn by hand, the way D3 code would draw it.
// One <g> per series inside a translated plot group, each rect carrying its row on __data__.
// It knows nothing about expressive-charts; demo/bars.ts attaches effects to it with expressive().
//
// Its ARIA is a careful D3 author's: each rect is an image named by what it shows ("Okafor: 4
// assists"), and the name and value texts are hidden, since the rects' names already say them. The
// page gives the <svg> role="group" and its name.

export interface Row {
  readonly name: string;
  readonly goals: number;
  readonly assists: number;
}

export type Series = "goals" | "assists";

/** What each rect carries on __data__, as D3 would bind it. */
export interface Segment {
  readonly row: Row;
  readonly series: Series;
  readonly value: number;
}

export interface DrawOptions {
  readonly series: readonly Series[];
  readonly sort: "value" | "key";
}

const NS = "http://www.w3.org/2000/svg";
const ROW = 34;
const BAR = 20;
const LEFT = 92;
const RIGHT = 44;
const TOP = 4;

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  parent.appendChild(node);
  return node;
}

/** "1 goal", "16 goals": the words a rect's name and the page's labels use. */
export function amount(value: number, series: Series): string {
  const word = series === "goals" ? "goal" : "assist";
  return `${value} ${value === 1 ? word : `${word}s`}`;
}

/** A round axis maximum, as the prototype rounds it (and as D3's scale.nice() would). */
function niceMax(value: number): number {
  const rough = value / 4;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const fraction = rough / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  return Math.ceil(value / step) * step;
}

/** Redraws the whole chart from scratch, as a simple host would, and returns the bars it drew. */
export function drawHostChart(svg: SVGSVGElement, rows: readonly Row[], options: DrawOptions): SVGRectElement[] {
  const width = Math.max(320, svg.parentElement?.clientWidth ?? 640);
  const total = (row: Row): number => options.series.reduce((sum, series) => sum + row[series], 0);
  const order = [...rows].sort((a, b) =>
    options.sort === "key" ? a.name.localeCompare(b.name) : total(b) - total(a) || a.name.localeCompare(b.name)
  );
  const max = niceMax(Math.max(1, ...order.map(total)));
  const plotWidth = width - LEFT - RIGHT;
  const x = (value: number): number => (value / max) * plotWidth;
  const height = TOP + order.length * ROW + 8;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.replaceChildren();

  const plot = el("g", { transform: `translate(${LEFT},${TOP})` }, svg);
  order.forEach((row, i) => {
    const y = i * ROW + ROW / 2 + 4;
    // Hidden from screen readers: the rects' names say the same.
    el("text", { class: "host-label", x: -10, y, "text-anchor": "end", "aria-hidden": "true" }, plot).textContent = row.name;
    el("text", { class: "host-value", x: x(total(row)) + 6, y, "aria-hidden": "true" }, plot).textContent = String(total(row));
  });

  const rects: SVGRectElement[] = [];
  options.series.forEach((series, s) => {
    const group = el("g", { class: `host-${series}` }, plot);
    order.forEach((row, i) => {
      const before = options.series.slice(0, s).reduce((sum, earlier) => sum + row[earlier], 0);
      const rect = el(
        "rect",
        {
          x: x(before),
          y: i * ROW + (ROW - BAR) / 2,
          width: x(row[series]),
          height: BAR,
          role: "img",
          "aria-label": `${row.name}: ${amount(row[series], series)}`
        },
        group
      ) as SVGRectElement;
      (rect as unknown as { __data__: Segment }).__data__ = { row, series, value: row[series] };
      rects.push(rect);
    });
  });
  return rects;
}
