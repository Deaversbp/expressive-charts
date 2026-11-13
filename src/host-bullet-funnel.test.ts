// The charts page's bullet chart and funnel (demo/charts.html, M17 step 5): each drawn by the page's
// own module and attached with the page's own descriptions from demo/charts-effects.ts, on a clock the
// test controls, as src/host-charts.test.ts does for the page's other four. These pin the bullet's
// bars read as bars and filled as they're attached, its bands never a mark, its markers flashing once
// their bars have filled and only where a bar passes one, and the toggle flashing only the markers
// newly passed; and the funnel's stages read as closed shapes, top to bottom, each with its drop in
// the gap above it, clear of every stage and its text. It brings charts and effects together, so it
// lives beside src/index.ts, the only module allowed to.

import { attachBullet, attachFunnel, bulletRanges, bulletRows, bulletTicks, funnelStages, met, type Attach } from "../demo/charts-effects";
import { drawBullet, type BulletRow } from "../demo/d3-bullet";
import { drawFunnel, type Box } from "../demo/d3-funnel";
import { expressive, type ChartEnv } from "./charts";
import { createMotion, manualClock, type MotionMode } from "./core";
import { iconRegistry, presetRegistry } from "./registries";

type Env = ChartEnv & { clock: ReturnType<typeof manualClock> };

function env(mode: MotionMode = "presentation"): Env {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

/** expressive() as the page calls it, on the test's clock. */
const attachOn =
  (e: ChartEnv): Attach =>
  (source, options) =>
    expressive(source, options, e);

/** An <svg> in a card, as the page's are: jsdom has no layout, so the modules draw at their least, 280 px, as a 320 px screen gets. */
function svgIn(): SVGSVGElement {
  const card = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  card.append(svg);
  document.body.append(card);
  return svg;
}

/** Runs the clock on, a frame at a time, letting each frame's promises settle, as a browser's would. */
async function run(e: Env, ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 16) {
    e.clock.advance(16);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
}

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
}

const key = (name: string): void => void document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

const number = (element: Element, name: string): number => Number(element.getAttribute(name));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("the bullet chart", () => {
  /** The markers' stroke, as the page's CSS gives it. */
  const INK = "rgb(18, 52, 86)";

  function bullet(mode: MotionMode = "presentation") {
    const e = env(mode);
    const svg = svgIn();
    const chart = drawBullet(svg, bulletRows("goals"), bulletRanges, bulletTicks);
    // The page's stylesheet colours them; here, attributes do.
    chart.bars.attr("fill", "#2a78d6");
    chart.markers.attr("stroke", INK).attr("stroke-width", 3);
    const attach = attachOn(e);
    const fx = attachBullet(chart, attach);
    return { e, svg, chart, fx, attach };
  }

  /** The paths drawIn draws over the bars as it plays. */
  const filling = (svg: SVGSVGElement): Element[] => [...svg.querySelectorAll('.ec-overlay .ec-run[data-slot="enter"] path')];

  /** The halos flash draws, each as the x of the marker it's round, in the plot's px, as the marks are. */
  const halos = (svg: SVGSVGElement): { x: number; stroke: string }[] =>
    [...svg.querySelectorAll<SVGPathElement>(".ec-overlay .ec-halo > path")].map((path) => ({
      x: Number(/^M(-?[\d.]+)/.exec(path.getAttribute("d") ?? "")?.[1]),
      stroke: path.style.stroke
    }));

  /** The names of the rows whose markers have a halo now. */
  function flashing(svg: SVGSVGElement, rows: readonly BulletRow[]): string[] {
    const lines = [...svg.querySelectorAll("line.target")];
    // A halo's path is its marker's, in the plot's px: its row is the one whose marker starts where it does, 8 px above its middle.
    const tops = [...svg.querySelectorAll<SVGPathElement>(".ec-overlay .ec-halo > path")].map((path) => Number(/^M-?[\d.]+,(-?[\d.]+)/.exec(path.getAttribute("d") ?? "")?.[1]));
    return tops.map((top) => rows[Math.round((top - 16 + 8) / 32)]!.name).filter((name) => lines.length > 0 && name !== undefined);
  }

  /** The bands as they're drawn: nothing about them may ever change. */
  const bandsOf = (svg: SVGSVGElement): string => svg.querySelector("g.bands")!.outerHTML;

  it("reads each bar as a bar from the axis to its value, in the players' order, each named with its value, its target and whether it's met", () => {
    const { svg, chart, fx } = bullet();
    const rows = bulletRows("goals");
    const marks = fx.bars.marks();
    expect(marks.map((mark) => mark.key)).toEqual(rows.map((row) => row.name));
    chart.bars.each(function (_row, i) {
      const mark = marks[i]!;
      // In the plot's own px, as the rects are.
      expect(mark.start.x).toBeCloseTo(number(this, "x"), 6);
      expect(mark.end.x).toBeCloseTo(number(this, "x") + number(this, "width"), 6);
      expect(mark.thickness).toBe(8);
      expect(mark.outline.closed).toBe(true);
    });
    expect([...svg.querySelectorAll("rect.value")].map((rect) => rect.getAttribute("aria-label"))).toEqual([
      "Okafor: 16 goals, target 12, met",
      "Lindqvist: 10 goals, target 8, met",
      "Moreau: 8 goals, target 10, not met",
      "Tanaka: 6 goals, target 5, met",
      "Reyes: 5 goals, target 6, not met",
      "Adeyemi: 4 goals, target 6, not met",
      "Novak: 3 goals, target 2, met",
      "Castillo: 1 goal, target 3, not met"
    ]);
    // One tab stop, on the first bar. The markers are for the eye: hidden, unnamed and out of reach.
    expect(svg.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(svg.querySelector('[tabindex="0"]')).toBe(chart.bars.nodes()[0]);
    for (const marker of svg.querySelectorAll("line.target")) {
      expect(marker.hasAttribute("tabindex") || marker.hasAttribute("aria-label") || marker.hasAttribute("role")).toBe(false);
      expect(marker.getAttribute("aria-hidden")).toBe("true");
    }
    // The markers are keyed apart from the bars, in an attachment of their own, each an open line down its row.
    expect(fx.markers.marks().map((mark) => mark.key)).toEqual(rows.map((row) => row.name));
    for (const mark of fx.markers.marks()) {
      expect(mark.outline.closed).toBe(false);
      expect(mark.length).toBe(16);
    }
  });

  it("fills the bars as they're attached, each drawn in along its length over itself made faint, and leaves them full", async () => {
    const { e, svg, chart } = bullet();
    await run(e, 304);
    expect(filling(svg)).toHaveLength(8);
    for (const bar of chart.bars.nodes()) expect(bar.getAttribute("style")).toMatch(/opacity: 0.3/);
    // Part way: Okafor's is drawn from the axis, not yet to its end.
    const [first] = filling(svg);
    const xs = (first!.getAttribute("d")!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const okafor = chart.bars.nodes()[0]!;
    expect(xs[0]).toBeCloseTo(0, 6);
    expect(xs[xs.length - 2]).toBeGreaterThan(0);
    expect(xs[xs.length - 2]).toBeLessThan(number(okafor, "width"));
    await run(e, 608);
    expect(filling(svg)).toHaveLength(0);
    for (const bar of chart.bars.nodes()) expect(bar.getAttribute("style") ?? "").not.toMatch(/opacity/);
  });

  it("flashes a marker once, after its bar has filled, in its stroke's colour, only where the bar passes it, and ends with nothing drawn", async () => {
    const { e, svg, chart } = bullet();
    const rows = bulletRows("goals");
    // While the bars fill, nothing flashes.
    for (let t = 0; t < 736; t += 16) {
      await run(e, 16);
      expect(halos(svg), `at ${t + 16} ms`).toHaveLength(0);
    }
    // Then the four whose bars reach their targets, each round its own marker.
    await run(e, 240);
    expect(flashing(svg, rows)).toEqual(["Okafor", "Lindqvist", "Tanaka", "Novak"]);
    expect(rows.filter(met).map((row) => row.name)).toEqual(["Okafor", "Lindqvist", "Tanaka", "Novak"]);
    const markers = chart.markers.nodes();
    const passed = markers.filter((_, i) => met(rows[i]!));
    expect(halos(svg).map((halo) => halo.x)).toEqual(passed.map((marker) => number(marker, "x1")));
    for (const halo of halos(svg)) expect(halo.stroke).toBe(INK);
    // One blink of 900 ms, and then nothing: no halo, and nothing left in the markers' runs.
    await run(e, 900);
    expect(halos(svg)).toHaveLength(0);
    expect(e.clock.idle).toBe(true);
    await run(e, 3000);
    expect(halos(svg)).toHaveLength(0);
    for (const marker of markers) expect(marker.getAttribute("style") ?? "").not.toMatch(/opacity/);
  });

  it("flashes only the markers newly passed when the measure changes, and names each bar again", async () => {
    const { e, svg, chart, fx } = bullet();
    await run(e, 3000);
    chart.set(bulletRows("assists"));
    fx.refresh();
    await run(e, 224);
    // Lindqvist's and Tanaka's were passed before and still are; Okafor's and Novak's no longer are.
    expect(flashing(svg, bulletRows("assists"))).toEqual(["Reyes", "Adeyemi", "Castillo"]);
    expect(chart.bars.nodes()[0]!.getAttribute("aria-label")).toBe("Okafor: 4 assists, target 5, not met");
    expect(chart.bars.nodes()[7]!.getAttribute("aria-label")).toBe("Castillo: 5 assists, target 4, met");
    await run(e, 1000);
    expect(halos(svg)).toHaveLength(0);
    // And back: the four goals pass, less the two that were passed for assists too.
    chart.set(bulletRows("goals"));
    fx.refresh();
    await run(e, 224);
    expect(flashing(svg, bulletRows("goals"))).toEqual(["Okafor", "Novak"]);
    await run(e, 1000);
    expect(halos(svg)).toHaveLength(0);
    expect(e.clock.idle).toBe(true);
  });

  it("waits for the bars when the measure changes while they fill: nothing flashes until they have, then the markers passed by then, once", async () => {
    const { e, svg, chart, fx } = bullet();
    await run(e, 304);
    chart.set(bulletRows("assists"));
    fx.refresh();
    for (let t = 304; t < 736; t += 16) {
      await run(e, 16);
      expect(halos(svg), `at ${t + 16} ms`).toHaveLength(0);
    }
    // The bars went on filling, to their new lengths.
    expect(filling(svg)).toHaveLength(8);
    await run(e, 240);
    expect(filling(svg)).toHaveLength(0);
    expect(flashing(svg, bulletRows("assists"))).toEqual(["Lindqvist", "Tanaka", "Reyes", "Adeyemi", "Castillo"]);
    await run(e, 900);
    expect(halos(svg)).toHaveLength(0);
    await run(e, 2000);
    expect(halos(svg)).toHaveLength(0);
  });

  it("never reads, dims or moves the bands, through a hover, a change of measure and a Replay", async () => {
    const { e, svg, chart, fx, attach } = bullet();
    const before = bandsOf(svg);
    const bands = [...svg.querySelectorAll("rect.band")];
    // Three a row, hidden, and none of them a mark.
    expect(bands).toHaveLength(24);
    expect(svg.querySelector("g.bands")!.getAttribute("aria-hidden")).toBe("true");
    const keys = new Set([...fx.bars.marks(), ...fx.markers.marks()].map((mark) => mark.key));
    expect(keys.size).toBe(8);
    await run(e, 3000);
    const tanaka = chart.bars.nodes()[3]!;
    pointer("pointerover", tanaka);
    pointer("pointermove", tanaka);
    await run(e, 200);
    // The other seven rows dim, bar and marker; Tanaka's marker stays lit with its bar.
    expect(svg.querySelectorAll("rect.value.ec-dimmed")).toHaveLength(7);
    expect(svg.querySelectorAll("line.target.ec-dimmed")).toHaveLength(7);
    expect(chart.markers.nodes()[3]!.classList.contains("ec-dimmed")).toBe(false);
    expect(bandsOf(svg)).toBe(before);
    pointer("pointerout", tanaka);
    await run(e, 200);
    chart.set(bulletRows("assists"));
    fx.refresh();
    await run(e, 300);
    expect(bandsOf(svg)).toBe(before);
    // Replay, as the page's button does it.
    fx.destroy();
    const again = attachBullet(chart, attach);
    await run(e, 300);
    expect(bandsOf(svg)).toBe(before);
    await run(e, 3000);
    expect(bandsOf(svg)).toBe(before);
    for (const band of bands) expect(band.isConnected).toBe(true);
    again.destroy();
    // And the chart is as D3 drew it.
    expect(bandsOf(svg)).toBe(before);
  });

  it("plays again on Replay: the bars fill and the markers they pass flash once more, for the measure shown, with one tab stop", async () => {
    const { e, svg, chart, fx, attach } = bullet();
    await run(e, 3000);
    chart.set(bulletRows("assists"));
    fx.refresh();
    await run(e, 3000);
    fx.destroy();
    expect(svg.querySelectorAll("[tabindex]")).toHaveLength(0);
    attachBullet(chart, attach);
    await run(e, 304);
    expect(filling(svg)).toHaveLength(8);
    expect(halos(svg)).toHaveLength(0);
    await run(e, 672);
    expect(flashing(svg, bulletRows("assists"))).toEqual(["Lindqvist", "Tanaka", "Reyes", "Adeyemi", "Castillo"]);
    await run(e, 2000);
    expect(halos(svg)).toHaveLength(0);
    expect(svg.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("with motion off shows the bars full and flashes nothing, at load, on a change of measure and on Replay; a bar past its marker says met", async () => {
    const { e, svg, chart, fx, attach } = bullet("off");
    const still = (): void => {
      expect(filling(svg)).toHaveLength(0);
      expect(halos(svg)).toHaveLength(0);
      for (const bar of chart.bars.nodes()) expect(bar.getAttribute("style") ?? "").not.toMatch(/opacity/);
      expect(e.clock.idle).toBe(true);
    };
    still();
    // Okafor's bar ends past his marker, and his name says so.
    const [bar, marker] = [chart.bars.nodes()[0]!, chart.markers.nodes()[0]!];
    expect(number(bar, "width")).toBeGreaterThan(number(marker, "x1"));
    expect(bar.getAttribute("aria-label")).toBe("Okafor: 16 goals, target 12, met");
    chart.set(bulletRows("assists"));
    fx.refresh();
    still();
    await run(e, 1000);
    still();
    expect(chart.bars.nodes()[4]!.getAttribute("aria-label")).toBe("Reyes: 4 assists, target 3, met");
    fx.destroy();
    attachBullet(chart, attach);
    still();
    await run(e, 2000);
    still();
  });

  it("lands at once when Off is picked while the bars fill: the bars full, and no flash to come", async () => {
    const { e, svg, chart } = bullet();
    await run(e, 304);
    e.motion.setMode("off");
    await run(e, 16);
    expect(filling(svg)).toHaveLength(0);
    for (const bar of chart.bars.nodes()) expect(bar.getAttribute("style") ?? "").not.toMatch(/opacity/);
    await run(e, 3000);
    expect(halos(svg)).toHaveLength(0);
  });
});

describe("the funnel", () => {
  function funnel(mode: MotionMode = "presentation") {
    const e = env(mode);
    const svg = svgIn();
    const chart = drawFunnel(svg, funnelStages);
    chart.stages.attr("fill", "#2a78d6");
    const attach = attachOn(e);
    const fx = attachFunnel(chart, attach);
    return { e, svg, chart, fx, attach };
  }

  const labels = (svg: SVGSVGElement): SVGTextElement[] => [...svg.querySelectorAll<SVGTextElement>(".ec-overlay .ec-runs text")];

  /** A stage's corners, from its path: top left, top right, bottom right, bottom left. */
  const corners = (path: Element): { x: number; y: number }[] => {
    const values = (path.getAttribute("d")!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    return Array.from({ length: 4 }, (_, i) => ({ x: values[2 * i]!, y: values[2 * i + 1]! }));
  };

  /** About the box a label's text takes: 12.5 px text, centred on its x, standing on its baseline. */
  const boxOf = (text: SVGTextElement): Box => {
    const width = (text.textContent ?? "").length * 12.5 * 0.6;
    return { x: number(text, "x") - width / 2, y: number(text, "y") - 12.5, width, height: 16 };
  };

  const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it("works each stage's drop from the stage before into its row, ending at the season's 58 goals", () => {
    expect(funnelStages).toEqual([
      { name: "Shots", count: 408 },
      { name: "On target", count: 163, unit: "shot", from: "Shots", drop: 60 },
      { name: "Goals", count: 58, from: "On target", drop: 64 }
    ]);
  });

  it("reads each stage as a closed shape, top to bottom, each narrowing into the next, and names each with its count and its drop", () => {
    const { svg, chart, fx } = funnel();
    const marks = fx.stages.marks();
    expect(marks.map((mark) => mark.key)).toEqual(["Shots", "On target", "Goals"]);
    const shapes = chart.stages.nodes().map(corners);
    marks.forEach((mark, i) => {
      expect(mark.outline.closed).toBe(true);
      expect(mark.length).toBe(0);
      const [topLeft, topRight, bottomRight, bottomLeft] = shapes[i]!;
      expect(mark.bounds).toEqual({ x: topLeft!.x, y: topLeft!.y, width: topRight!.x - topLeft!.x, height: bottomLeft!.y - topLeft!.y });
      // Centred, and as wide at its bottom as the next is at its top, after a gap.
      expect((topLeft!.x + topRight!.x) / 2).toBeCloseTo((bottomLeft!.x + bottomRight!.x) / 2, 6);
      const next = shapes[i + 1];
      if (next) {
        expect(bottomRight!.x - bottomLeft!.x).toBeCloseTo(next[1]!.x - next[0]!.x, 6);
        expect(next[0]!.y - bottomLeft!.y).toBe(32);
      }
      if (i > 0) expect(mark.bounds.y).toBeGreaterThan(marks[i - 1]!.bounds.y + marks[i - 1]!.bounds.height);
    });
    // As wide as its count: 163 of 408, and 58.
    const width = (i: number): number => shapes[i]![1]!.x - shapes[i]![0]!.x;
    expect(width(1) / width(0)).toBeCloseTo(163 / 408, 6);
    expect(width(2) / width(0)).toBeCloseTo(58 / 408, 6);
    expect(chart.stages.nodes().map((path) => path.getAttribute("aria-label"))).toEqual(["Shots: 408", "On target: 163 shots, down 60% from Shots", "Goals: 58, down 64% from On target"]);
    for (const path of chart.stages.nodes()) expect(path.getAttribute("role")).toBe("img");
    // The names and counts beside them are hidden: each stage's name says both.
    for (const text of svg.querySelectorAll("text.name, text.count")) expect(text.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("goes through the stages top to bottom by the arrow keys, from one tab stop", () => {
    const { svg, chart, fx } = funnel();
    const [shots, onTarget, goals] = chart.stages.nodes();
    expect([...svg.querySelectorAll('[tabindex="0"]')]).toEqual([shots]);
    fx.stages.focus("Shots");
    expect(document.activeElement).toBe(shots);
    key("ArrowDown");
    expect(document.activeElement).toBe(onTarget);
    key("ArrowDown");
    expect(document.activeElement).toBe(goals);
    key("Home");
    expect(document.activeElement).toBe(shots);
    key("End");
    expect(document.activeElement).toBe(goals);
  });

  it("puts each drop in the gap above its stage, centred, clear of every stage and its text, with none on the first", async () => {
    const { e, svg, chart, fx } = funnel();
    await run(e, 1000);
    const texts = labels(svg);
    expect(texts.map((text) => text.textContent)).toEqual(["−60%", "−64%"]);
    expect(svg.querySelector('.ec-overlay .ec-run[data-key="Shots"] text')).toBeNull();
    const marks = fx.stages.marks();
    const names = funnelStages.map((stage) => chart.place(stage.name));
    texts.forEach((text, i) => {
      const above = marks[i]!.bounds;
      const own = marks[i + 1]!.bounds;
      expect(text.getAttribute("text-anchor")).toBe("middle");
      expect(number(text, "x")).toBeCloseTo(own.x + own.width / 2, 6);
      // Standing 6 px above its own stage, its whole box in the gap.
      expect(number(text, "y")).toBeLessThanOrEqual(own.y - 6);
      const box = boxOf(text);
      expect(box.y).toBeGreaterThan(above.y + above.height);
      expect(box.y + box.height).toBeLessThanOrEqual(own.y);
      for (const mark of marks) expect(overlap(box, mark.bounds), mark.key).toBe(false);
      for (const place of names) {
        expect(overlap(box, place.name)).toBe(false);
        expect(overlap(box, place.count)).toBe(false);
      }
      expect(text.getAttribute("opacity")).toBe("1");
    });
    // The page describes each stage with its top edge and its name's box.
    for (const [i, mark] of marks.entries()) expect(mark.labelBounds).toEqual([names[i]!.top, names[i]!.name]);
  });

  it("rises the labels once at load, and Replay plays them again", async () => {
    const { e, svg, chart, fx, attach } = funnel();
    await run(e, 96);
    const rising = labels(svg).map((text) => Number(text.getAttribute("opacity")));
    for (const opacity of rising) {
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);
    }
    await run(e, 1000);
    const rest = labels(svg).map((text) => [text.getAttribute("x"), text.getAttribute("y"), text.getAttribute("opacity")]);
    expect(rest.map((at) => at[2])).toEqual(["1", "1"]);
    expect(e.clock.idle).toBe(true);
    fx.destroy();
    expect(labels(svg)).toHaveLength(0);
    expect(svg.querySelectorAll("[tabindex]")).toHaveLength(0);
    attachFunnel(chart, attach);
    await run(e, 96);
    for (const text of labels(svg)) expect(Number(text.getAttribute("opacity"))).toBeLessThan(1);
    await run(e, 1000);
    expect(labels(svg).map((text) => [text.getAttribute("x"), text.getAttribute("y"), text.getAttribute("opacity")])).toEqual(rest);
    expect(svg.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("has the labels in place at once with motion off", () => {
    const moving = funnel();
    const still = funnel("off");
    expect(labels(still.svg).map((text) => text.textContent)).toEqual(["−60%", "−64%"]);
    for (const text of labels(still.svg)) expect(text.getAttribute("opacity")).toBe("1");
    expect(still.e.clock.idle).toBe(true);
    // Where a full run ends.
    return run(moving.e, 1000).then(() => {
      expect(labels(still.svg).map((text) => [text.getAttribute("x"), text.getAttribute("y")])).toEqual(labels(moving.svg).map((text) => [text.getAttribute("x"), text.getAttribute("y")]));
    });
  });

  it("dims the other stages on hover, and keeps the labels where they are", async () => {
    const { e, svg, chart } = funnel();
    await run(e, 1000);
    const before = labels(svg).map((text) => text.outerHTML);
    const onTarget = chart.stages.nodes()[1]!;
    pointer("pointerover", onTarget);
    pointer("pointermove", onTarget);
    await run(e, 200);
    expect([...svg.querySelectorAll("path.stage.ec-dimmed")]).toEqual([chart.stages.nodes()[0], chart.stages.nodes()[2]]);
    expect(labels(svg).map((text) => text.outerHTML)).toEqual(before);
    expect(document.querySelector(".ec-tooltip")).toBeNull();
  });

  it("follows a resize: each label stays above its stage, with no event", async () => {
    const { e, svg, chart, fx } = funnel();
    await run(e, 1000);
    const events: string[] = [];
    for (const type of ["enter", "update", "exit"] as const) fx.stages.on(type, () => events.push(type));
    Object.defineProperty(svg.parentElement!, "clientWidth", { value: 480, configurable: true });
    chart.resize();
    fx.stages.refresh();
    await run(e, 100);
    expect(events).toEqual([]);
    const marks = fx.stages.marks();
    expect(marks[0]!.bounds.width).toBe(480 - 110);
    labels(svg).forEach((text, i) => {
      const own = marks[i + 1]!.bounds;
      expect(number(text, "x")).toBeCloseTo(own.x + own.width / 2, 6);
      expect(number(text, "y")).toBeLessThanOrEqual(own.y - 6);
    });
  });
});
