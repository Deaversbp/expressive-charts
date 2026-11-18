// expressive()'s `labelBounds` (M18 step 4): a page says where the host's own text for a mark is, and the
// effects that write text, `label` and `delta`, keep clear of it, on a bar, a closed shape and a line the adapter
// reads by their tags, as they do on our charts' own labels. Without the option the same text lands on the host's.
// Beside src/index.ts because it brings an adapter and effects together, as only the composition root may.

import { expressive, type Attachment, type ChartEnv, type ExpressiveOptions } from "./charts";
import { createMotion, manualClock, type MotionMode, type Rect } from "./core";
import { estimatedBox } from "./core/text-box";
import { delta, label } from "./effects";
import { iconRegistry, presetRegistry } from "./registries";

type Env = ChartEnv & { readonly clock: ReturnType<typeof manualClock> };

function env(mode: MotionMode = "presentation"): Env {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

afterEach(() => document.body.replaceChildren());

const SVG = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  parent.appendChild(element);
  return element;
}

/** Runs the clock on, a frame at a time, letting each frame's promises settle, as a browser's would. */
async function run(e: Env, ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 16) {
    e.clock.advance(16);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
}

const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The box each effect's text takes, by its mark's key, as the overlay boxes text where there's no layout. */
function texts(svg: SVGSVGElement): Map<string, { readonly words: string; readonly box: Rect }> {
  return new Map(
    Array.from(svg.querySelectorAll<SVGTextElement>(".ec-overlay .ec-runs text"), (text) => {
      const words = text.textContent ?? "";
      const at = { x: Number(text.getAttribute("x")), y: Number(text.getAttribute("y")) };
      const anchor = (text.getAttribute("text-anchor") ?? "start") as "start" | "middle" | "end";
      return [text.closest(".ec-run")!.getAttribute("data-key")!, { words, box: estimatedBox(words, { at, anchor }) }] as const;
    })
  );
}

/** Revenue by region, in $k, and what each grew to a quarter on. */
interface Region {
  readonly name: string;
  readonly revenue: number;
}
const regions: readonly Region[] = [
  { name: "North", revenue: 120 },
  { name: "South", revenue: 80 },
  { name: "West", revenue: 150 }
];
const nextQuarter: readonly Region[] = [
  { name: "North", revenue: 135 },
  { name: "South", revenue: 80 },
  { name: "West", revenue: 140 }
];

/**
 * What a D3 page draws for the bars: a rect a region, 1 px a $k, and the page's own value label just past
 * each bar's end, 40 px wide. `boxOf` is where the page says that label is.
 */
function bars(rows: readonly Region[] = regions) {
  const svg = el("svg", { width: 400, height: 120 }, document.body);
  const plot = el("g", { transform: "translate(60,10)" }, svg);
  const rects = rows.map((row, i) => Object.assign(el("rect", { x: 0, y: i * 30, width: row.revenue, height: 20, fill: "#2a78d6" }, plot), { __data__: row }));
  const draw = (next: readonly Region[]): void =>
    next.forEach((row, i) => {
      rects[i]!.setAttribute("width", String(row.revenue));
      Object.assign(rects[i]!, { __data__: row });
    });
  const boxOf = (row: Region, element: Element): Rect => ({ x: row.revenue + 4, y: Number(element.getAttribute("y")) + 2, width: 40, height: 16 });
  return { svg, rects, draw, boxOf };
}

const byRegion: ExpressiveOptions<Region> = { key: (d) => d.name, value: (d) => d.revenue };

describe("a host bar's own value label", () => {
  it("without labelBounds, label writes over it", async () => {
    const e = env();
    const host = bars();
    expressive<Region>(host.rects, { ...byRegion, on: { decorate: label((data) => `${data.datum.revenue}k`) } }, e);
    await run(e, 1000);
    for (const [i, row] of regions.entries()) expect(overlap(texts(host.svg).get(row.name)!.box, host.boxOf(row, host.rects[i]!)), row.name).toBe(true);
  });

  it("with it, label goes past the page's text: 6 px clear, on the bar's own row", async () => {
    const e = env();
    const host = bars();
    const fx = expressive<Region>(host.rects, { ...byRegion, labelBounds: (d, element) => [host.boxOf(d, element)], on: { decorate: label((data) => `${data.datum.revenue}k`) } }, e);
    await run(e, 1000);
    for (const [i, row] of regions.entries()) {
      const own = host.boxOf(row, host.rects[i]!);
      const { box, words } = texts(host.svg).get(row.name)!;
      expect(words).toBe(`${row.revenue}k`);
      expect(overlap(box, own), row.name).toBe(false);
      // Past the page's label, the way the bar is heading, and level with it.
      expect(box.x).toBeGreaterThanOrEqual(own.x + own.width + 6 - 2.01);
      expect(Math.abs(box.y + box.height / 2 - fx.marks()[i]!.center.y)).toBeLessThan(1);
    }
  });

  it("delta keeps clear of it too, after the page moves its text with the bar", async () => {
    const e = env();
    const host = bars();
    const fx = expressive<Region>(host.rects, { ...byRegion, labelBounds: (d, element) => [host.boxOf(d, element)], on: { update: delta() } }, e);
    host.draw(nextQuarter);
    fx.refresh();
    await run(e, 2000);
    const drawn = texts(host.svg);
    // Only the regions whose revenue changed have a change to show.
    expect([...drawn.keys()].sort()).toEqual(["North", "West"]);
    expect(drawn.get("North")!.words).toBe("+15");
    for (const [i, row] of nextQuarter.entries()) {
      const text = drawn.get(row.name);
      if (text) expect(overlap(text.box, host.boxOf(row, host.rects[i]!)), row.name).toBe(false);
      expect(fx.marks()[i]!.labelBounds).toEqual([host.boxOf(row, host.rects[i]!)]);
    }
  });

  it("with Off, the label is in its place at once, clear of the page's text", () => {
    const e = env("off");
    const host = bars();
    expressive<Region>(host.rects, { ...byRegion, labelBounds: (d, element) => [host.boxOf(d, element)], on: { decorate: label((data) => `${data.datum.revenue}k`) } }, e);
    expect(e.clock.idle).toBe(true);
    for (const [i, row] of regions.entries()) expect(overlap(texts(host.svg).get(row.name)!.box, host.boxOf(row, host.rects[i]!)), row.name).toBe(false);
  });
});

describe("a host shape's and a host line's own text", () => {
  /** Sessions by channel, as tiles: each a closed path with its channel's name written in its middle. */
  interface Channel {
    readonly name: string;
    readonly sessions: number;
    readonly x: number;
  }
  const channels: readonly Channel[] = [
    { name: "Search", sessions: 5400, x: 0 },
    { name: "Social", sessions: 2100, x: 130 }
  ];

  it("a closed shape's label keeps clear of the name the page wrote inside it", async () => {
    const svg = el("svg", { width: 400, height: 120 }, document.body);
    const tiles = channels.map((row) => Object.assign(el("path", { d: `M${row.x},0h120v80h-120Z`, fill: "#2a78d6" }, svg), { __data__: row }));
    /** The name, centred in its tile. */
    const nameBox = (row: Channel): Rect => ({ x: row.x + 30, y: 32, width: 60, height: 16 });
    const options: ExpressiveOptions<Channel> = { key: (d) => d.name, on: { decorate: label((data) => String(data.datum.sessions)) } };

    const e = env();
    const plain: Attachment<Channel> = expressive<Channel>(tiles, options, e);
    await run(e, 1000);
    // A closed shape's label starts from its centre, where the page's name is.
    for (const row of channels) expect(overlap(texts(svg).get(row.name)!.box, nameBox(row)), row.name).toBe(true);
    plain.destroy();

    const fx = expressive<Channel>(tiles, { ...options, labelBounds: (d) => [nameBox(d)] }, e);
    await run(e, 1000);
    for (const [i, row] of channels.entries()) {
      expect(fx.marks()[i]!.outline.closed).toBe(true);
      expect(fx.marks()[i]!.labelBounds).toEqual([nameBox(row)]);
      expect(overlap(texts(svg).get(row.name)!.box, nameBox(row)), row.name).toBe(false);
    }
  });

  it("a line's label goes past the end label the page drew for it", async () => {
    // An absorbance reading every ten minutes, drawn as one stroked path, with the sample's name at its end.
    const readings = [0.12, 0.18, 0.31, 0.44, 0.52];
    const points = readings.map((value, i) => ({ x: i * 50, y: 100 - value * 150 }));
    const svg = el("svg", { width: 400, height: 140 }, document.body);
    const path = Object.assign(el("path", { d: points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(""), fill: "none", stroke: "#2a78d6", "stroke-width": 2 }, svg), {
      __data__: { name: "Sample A" }
    });
    const end = points[points.length - 1]!;
    const endLabel: Rect = { x: end.x + 6, y: end.y - 8, width: 56, height: 16 };
    const options: ExpressiveOptions<{ name: string }> = { key: (d) => d.name, on: { decorate: label(() => "0.52 AU") } };
    const e = env();
    const plain = expressive<{ name: string }>([path], options, e);
    await run(e, 1000);
    const over = texts(svg).get("Sample A")!.box;
    expect(overlap(over, endLabel)).toBe(true);
    plain.destroy();

    const fx = expressive<{ name: string }>([path], { ...options, labelBounds: () => [endLabel] }, e);
    await run(e, 1000);
    expect(fx.marks()[0]!.outline.closed).toBe(false);
    expect(fx.marks()[0]!.labelBounds).toEqual([endLabel]);
    const { box } = texts(svg).get("Sample A")!;
    expect(overlap(box, endLabel)).toBe(false);
    // The way the line is heading, up and to the right: on past where it was, over its end label.
    expect(box.x).toBeGreaterThan(over.x);
    expect(box.y).toBeLessThan(over.y);
  });
});
