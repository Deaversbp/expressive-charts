// labelBounds and a refresh that keeps a hover (M18 step 4) change nothing a host view shows at rest: the charts
// page's six D3 charts and the map, each drawn by the page's own module and attached with the page's own
// descriptions, are byte for byte what main drew, and so is the map after a resize. The digests were pinned on main
// (535d98f) with this file's own functions, before the adapter changed and before the pages took up outline(),
// wait() and labelBounds. The funnel's is its markup alone, its labels among it: its stages are read by the adapter
// now, so their geometry is the adapter's and not the page's.

import { describe, expect, it } from "vitest";
import {
  attachBullet,
  attachButterfly,
  attachDumbbell,
  attachFunnel,
  attachRadar,
  attachWaterfall,
  bands,
  bulletRanges,
  bulletRows,
  bulletTicks,
  funnelStages,
  months,
  players,
  profiles,
  radarAxes,
  type Attach
} from "../demo/charts-effects";
import { drawBullet } from "../demo/d3-bullet";
import { drawButterfly } from "../demo/d3-butterfly";
import { drawDumbbell } from "../demo/d3-dumbbell";
import { drawFunnel } from "../demo/d3-funnel";
import { drawMap } from "../demo/d3-map";
import { drawRadar } from "../demo/d3-radar";
import { drawWaterfall } from "../demo/d3-waterfall";
import { attachMap, mapRows } from "../demo/map-effects";
import { expressive, type ChartEnv } from "./charts";
import { createMotion, manualClock, type MarkGeometry } from "./core";
import { iconRegistry, presetRegistry } from "./registries";

type Env = ChartEnv & { readonly clock: ReturnType<typeof manualClock> };

function env(): Env {
  const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

/** A 64-bit hash of the text (cyrb53's mixing, both halves kept), as 16 hex digits: enough to tell two drawings apart. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/** Numbers rounded to 1e-6 px, in markup and in geometry alike, since an eased value's last bits differ between Node's versions. */
const rounded = (text: string): string => text.replace(/-?\d+\.\d{7,}(?:e-?\d+)?/g, (n) => String(Math.round(Number(n) * 1e6) / 1e6));
/** A mark's geometry as data: its functions (`slice`, `pointAt`) left out. */
const serial = (marks: readonly MarkGeometry[]): string => rounded(JSON.stringify(marks));
/** The view's markup, with the counters in its ids taken out. */
const markup = (svg: SVGSVGElement): string => rounded(svg.outerHTML.replace(/\bec-([a-z-]+?)-\d+\b/g, "ec-$1"));

/** Runs the clock on, a frame at a time, letting each frame's promises settle, as a browser's would. */
async function run(e: Env, ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 16) {
    e.clock.advance(16);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
}

interface View {
  readonly svg: SVGSVGElement;
  /** Every attachment's marks. */
  readonly marks: readonly MarkGeometry[];
  /** Something the page does next, with no hover: a resize, a change of measure. */
  readonly then?: () => void;
}

/** Each view in a card, as the pages' are: jsdom has no layout, so the modules draw at their least, as a 320 px screen gets. */
const views: Readonly<Record<string, (svg: SVGSVGElement, attach: Attach, card: HTMLElement) => View>> = {
  waterfall(svg, attach) {
    const fx = attachWaterfall(drawWaterfall(svg, months), attach);
    return { svg, marks: [...fx.steps.marks(), ...fx.staircase.marks()] };
  },
  dumbbell(svg, attach) {
    const fx = attachDumbbell(drawDumbbell(svg, players, "goals"), attach);
    return { svg, marks: [...fx.connectors.marks(), ...fx.dots.first.marks(), ...fx.dots.second.marks()] };
  },
  radar(svg, attach) {
    const fx = attachRadar(drawRadar(svg, radarAxes, profiles), attach);
    return { svg, marks: [...fx.outlines.marks(), ...fx.values.player.marks(), ...fx.values.average.marks()] };
  },
  butterfly(svg, attach) {
    const fx = attachButterfly(drawButterfly(svg, bands), attach);
    return { svg, marks: [...fx.halves.conceded.marks(), ...fx.halves.scored.marks()] };
  },
  bullet(svg, attach) {
    const chart = drawBullet(svg, bulletRows("goals"), bulletRanges, bulletTicks);
    const fx = attachBullet(chart, attach);
    return { svg, marks: [...fx.bars.marks(), ...fx.markers.marks()] };
  },
  "bullet, after a change of measure"(svg, attach) {
    const chart = drawBullet(svg, bulletRows("goals"), bulletRanges, bulletTicks);
    const fx = attachBullet(chart, attach);
    return {
      svg,
      get marks() {
        return [...fx.bars.marks(), ...fx.markers.marks()];
      },
      then() {
        chart.set(bulletRows("assists"));
        fx.refresh();
      }
    };
  },
  funnel(svg, attach) {
    attachFunnel(drawFunnel(svg, funnelStages), attach);
    return { svg, marks: [] };
  },
  map(svg, attach, card) {
    Object.defineProperty(card, "clientWidth", { configurable: true, get: () => 640 });
    const fx = attachMap(drawMap(svg, mapRows), attach);
    return { svg, marks: [...fx.countries.marks(), ...fx.routes.marks()] };
  },
  "map, after a resize"(svg, attach, card) {
    let room = 640;
    Object.defineProperty(card, "clientWidth", { configurable: true, get: () => room });
    const chart = drawMap(svg, mapRows);
    const fx = attachMap(chart, attach);
    return {
      svg,
      get marks() {
        return [...fx.countries.marks(), ...fx.routes.marks()];
      },
      then() {
        room = 320;
        chart.resize();
        fx.refresh();
      }
    };
  }
};

/** Pinned on main, 535d98f. */
const PINNED: Readonly<Record<string, string>> = {
  waterfall: "1d552afbec5ef107",
  dumbbell: "24e4db00f582a524",
  radar: "1a125d687bfac451",
  butterfly: "2000746c7e47c12b",
  bullet: "3fe9b5560b7af883",
  "bullet, after a change of measure": "281d531e62051ad6",
  funnel: "bbb5cc66af1723ba",
  map: "8809aca066e8b087",
  "map, after a resize": "02dcb3280d9960e8"
};

afterEach(() => document.body.replaceChildren());

describe("host views with no hover", () => {
  it.each(Object.keys(views))("%s: byte for byte what main drew, at rest", async (name) => {
    const e = env();
    const card = document.body.appendChild(document.createElement("div"));
    const svg = card.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    const view = views[name]!(svg, (source, options) => expressive(source, options, e), card);
    // Every enter effect done: the bullet's bars filled and its markers' flash over.
    await run(e, 4000);
    view.then?.();
    await run(e, 4000);
    expect(e.clock.idle).toBe(true);
    expect(hash(markup(view.svg) + serial(view.marks))).toBe(PINNED[name]);
  });
});
