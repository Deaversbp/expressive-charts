// Square caps and bevel joins (M18 step 2) change nothing drawn before them: every core and sport icon, and each
// built-in effect's drawing on the testing entry's fixtures, is byte for byte what main drew. The digests were pinned
// on main (3720f29) with this file's own functions, before the unions widened.

import { describe, expect, it } from "vitest";
import { svgLayer } from "./charts/render/layer";
import type { AnyMarkEffect, Icon, MarkData, MarkGeometry, Sample } from "./core";
import { play, testContext } from "./core/testing";
import { delta, drawIn, flash, label, pulse, threshold, trace, travel, wiggle } from "./effects";
import { defineIcon, iconFromSvg, icons } from "./icons";
import { cleat, soccerBall } from "./icons/sport";
import { fixtures } from "./testing/fixtures";

const SVG = "http://www.w3.org/2000/svg";

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

/** Numbers rounded to 1e-9, since an eased value's last bits differ between Node's versions. */
const serial = (value: unknown): string => JSON.stringify(value, (_, v: unknown) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v));

/** A group in an SVG, and its markup with the counters in its ids taken out. */
function stage(): { group: SVGGElement; markup: () => string } {
  const svg = document.createElementNS(SVG, "svg");
  const group = svg.appendChild(document.createElementNS(SVG, "g"));
  return { group, markup: () => group.innerHTML.replace(/ec-clip-\d+/g, "ec-clip") };
}

const allIcons: Readonly<Record<string, Icon>> = { ...icons, soccerBall, cleat };

/** The icon as it's defined, and the elements the SVG layer draws for it, placed. */
function iconDigest(icon: Icon): string {
  const { group, markup } = stage();
  svgLayer(group).icon(icon, { size: 20 }).place([1, 0, 0, 1, 30, 40]);
  return hash(serial(icon) + markup());
}

const at = (ts: readonly number[], values: readonly number[]): Sample[] => values.map((value, i) => ({ t: ts[i]!, value, at: i + 1 }));
/** Values that cross a related series, with the values before an update, so threshold, delta and label each draw. */
const data = (): MarkData => ({
  datum: undefined,
  samples: at([0, 0.25, 0.5, 0.75, 1], [0, 3, 2, 6, 5]),
  related: (series) => (series === "xg" ? { datum: undefined, samples: at([0, 0.5, 1], [1, 3, 5]), related: () => undefined } : undefined),
  previous: { datum: undefined, samples: at([0, 0.25, 0.5, 0.75, 1], [0, 3, 2, 6, 3]), related: () => undefined }
});

const effects: Readonly<Record<string, AnyMarkEffect>> = {
  "travel, dot": travel(icons.dot),
  "travel, arrow": travel(icons.arrow),
  "travel, chevron": travel(icons.chevron),
  "travel, soccerBall": travel(soccerBall),
  "travel, cleat": travel(cleat),
  flash: flash(),
  wiggle: wiggle(),
  pulse: pulse(),
  trace: trace(),
  drawIn: drawIn(),
  delta: delta(),
  label: label((d) => `${d.samples.length} samples`),
  threshold: threshold({ compareTo: "xg" })
};

/**
 * On every fixture: each call a full run makes on its layer and its mark, the calls end() makes, and the elements the
 * SVG layer draws for every path either one painted.
 */
async function effectDigest(effect: AnyMarkEffect): Promise<string> {
  let log = "";
  for (const [name, mark] of Object.entries(fixtures) as [string, MarkGeometry][]) {
    const ran = testContext();
    await play(ran.clock, effect.kind === "data" ? effect.run(mark, data(), ran) : effect.run(mark, ran));
    const ended = testContext();
    if (effect.kind === "data") effect.end(mark, data(), ended);
    else effect.end(mark, ended);
    const { group, markup } = stage();
    const layer = svgLayer(group);
    for (const ctx of [ran, ended]) {
      for (const call of ctx.layer.calls) if (call.op === "path") layer.path(call.d, call.paint);
    }
    log += name + serial([ran.layer.calls, ran.mark.calls, ended.layer.calls, ended.mark.calls]) + markup();
  }
  return hash(log);
}

/** What main (3720f29) gave, with the functions above run there. */
const MAIN_ICONS: Readonly<Record<string, string>> = {
  dot: "d052ae72b9d9b71f",
  arrow: "e5d3670581173309",
  chevron: "28d0f7792dba949c",
  soccerBall: "4ee99110bc49f191",
  cleat: "c1575d084078e807"
};
const MAIN_EFFECTS: Readonly<Record<string, string>> = {
  "travel, dot": "06f6a4c6d5e77264",
  "travel, arrow": "6705c11d704edc2f",
  "travel, chevron": "bb6efe4aabafb5dd",
  "travel, soccerBall": "14ad9cef426a0fb0",
  "travel, cleat": "03eda2c8d1003883",
  flash: "57a64240f746f624",
  wiggle: "1131c6e50a67161b",
  pulse: "08cb2f4c78d7c4d6",
  trace: "287e51c1fe9e8a12",
  drawIn: "c63e93c79ffb9a60",
  delta: "47eecb9a4be77246",
  label: "7443cc31fbc2fb88",
  threshold: "7ea1d82adace9e99"
};

describe("icons and effects drawn before square caps and bevel joins", () => {
  it("every core and sport icon, as on main, byte for byte", () => {
    expect(Object.fromEntries(Object.entries(allIcons).map(([name, icon]) => [name, iconDigest(icon)]))).toEqual(MAIN_ICONS);
  });

  it("each built-in effect's drawing on the fixtures, as on main, byte for byte", async () => {
    const out: Record<string, string> = {};
    for (const [name, effect] of Object.entries(effects)) out[name] = await effectDigest(effect);
    expect(out).toEqual(MAIN_EFFECTS);
  });
});

describe("an icon with square caps and bevel joins", () => {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="bevel"><path d="M4 12L10 18L20 6"/></svg>`;
  const read = iconFromSvg(markup, { name: "tick", anchor: { x: 12, y: 12 } });
  const defined = defineIcon({ name: "tick", shapes: [{ d: "M4,12L10,18L20,6", stroke: "text", width: 2, linecap: "square", linejoin: "bevel" }], box: { x: 0, y: 0, width: 24, height: 24 }, anchor: { x: 12, y: 12 } });

  it("is the same icon read from SVG and defined by hand, and the SVG layer draws its cap and join", () => {
    expect(read).toEqual(defined);
    const { group } = stage();
    svgLayer(group).icon(read).place([1, 0, 0, 1, 0, 0]);
    const path = group.querySelector("path")!;
    expect([path.getAttribute("stroke-linecap"), path.getAttribute("stroke-linejoin")]).toEqual(["square", "bevel"]);
  });

  it("travels a mark as any icon does, the recording layer carrying it whole", async () => {
    const ctx = testContext();
    await play(ctx.clock, travel(read).run(fixtures.bar, ctx));
    const drawn = ctx.layer.drawn.find((item) => item.kind === "icon");
    expect(drawn?.kind === "icon" && drawn.icon.shapes[0]).toMatchObject({ linecap: "square", linejoin: "bevel" });
  });
});
