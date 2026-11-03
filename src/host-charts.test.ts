// The charts page's four D3 charts (demo/charts.html, M14 step 4): each drawn by the page's own module,
// and attached with the page's own descriptions from demo/charts-effects.ts, on a clock the test
// controls. These pin what the page describes because the adapter can't read it from a tag: the
// waterfall's floating steps, each growing from its own edge, with its signed label, and its staircase
// carrying the ball to rest on the total; the dumbbell's connectors walking from the first half to the
// second, and a dot's hover running its connector's; the radar's outlines walking round, threshold's
// colour ending where the outlines cross, and each value's spoke walking out from the centre; and the
// butterfly's halves growing outward. It brings charts and effects together, so it lives beside
// src/index.ts, the only module allowed to.

import { attachButterfly, attachDumbbell, attachRadar, attachWaterfall, bands, months, players, profiles, radarAxes, type Attach } from "../demo/charts-effects";
import { drawButterfly } from "../demo/d3-butterfly";
import { drawDumbbell, rowsFor } from "../demo/d3-dumbbell";
import { drawRadar, type Point } from "../demo/d3-radar";
import { drawWaterfall, stepsOf } from "../demo/d3-waterfall";
import { expressive, type ChartEnv } from "./charts";
import { createMotion, manualClock, type MarkGeometry } from "./core";
import { soccerBall } from "./icons/sport";
import { iconRegistry, presetRegistry } from "./registries";

type Env = ChartEnv & { clock: ReturnType<typeof manualClock> };

function env(mode: "presentation" | "off" = "presentation"): Env {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

/** expressive() as the page calls it, on the test's clock. */
const attachOn =
  (e: ChartEnv): Attach =>
  (source, options) =>
    expressive(source, options, e);

/** An <svg> in a card, as the page's are: jsdom has no layout, so the modules draw at their least, 280 px. */
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

const overlays = (svg: SVGSVGElement): SVGGElement[] => [...svg.querySelectorAll<SVGGElement>(":scope > .ec-overlay")];

/** The overlay that holds what `selector` finds. */
const overlayWith = (svg: SVGSVGElement, selector: string): SVGGElement => overlays(svg).find((overlay) => overlay.querySelector(selector))!;

/** The paths an effect draws as it runs, not counting the icons' own shapes. */
const drawn = (overlay: Element): Element[] => [...overlay.querySelectorAll(".ec-runs path")].filter((path) => !path.closest(".ec-icon"));

/** The numbers in a transform or path. */
const numbers = (text: string | null | undefined): number[] => (text?.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);

/** An icon's place: its transform's translation, the last two numbers of its matrix. */
function iconAt(icon: Element): Point {
  const values = numbers(icon.getAttribute("transform"));
  return { x: values[values.length - 2]!, y: values[values.length - 1]! };
}

/** The x, y pairs of a path's data, in order. */
function pathPoints(d: string | null): Point[] {
  const values = numbers(d);
  return Array.from({ length: values.length / 2 }, (_, i) => ({ x: values[2 * i]!, y: values[2 * i + 1]! }));
}

function expectPoint(actual: Point, expected: Point, digits = 6): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

const near = (a: Point, b: Point, within = 0.01): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= within;

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
}

/** A rect's box as drawn. */
const box = (rect: Element) => ({ x: Number(rect.getAttribute("x")), y: Number(rect.getAttribute("y")), width: Number(rect.getAttribute("width")), height: Number(rect.getAttribute("height")) });

const BALL = soccerBall.box.width;

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("the waterfall", () => {
  function waterfall(mode: "presentation" | "off" = "presentation") {
    const e = env(mode);
    const svg = svgIn();
    const chart = drawWaterfall(svg, months);
    const fx = attachWaterfall(chart, attachOn(e));
    return { e, svg, chart, fx };
  }

  const ball = (svg: SVGSVGElement): Element => svg.querySelector('.ec-overlay .ec-icon[data-icon="soccer-ball"]')!;

  it("describes each step from its rect, a rise growing up from its bottom, a fall down from its top, and the total up from the axis", () => {
    const { chart, fx } = waterfall();
    const steps = stepsOf(months);
    const marks = fx.steps.marks();
    expect(marks.map((mark) => mark.key)).toEqual(steps.map((step) => step.name));
    chart.steps.each(function (step, i) {
      const { x, y, width, height } = box(this);
      const mark = marks[i]!;
      expect(mark.bounds).toEqual({ x, y, width, height });
      const middle = x + width / 2;
      if (step.kind === "fall") {
        expectPoint(mark.start, { x: middle, y });
        expectPoint(mark.end, { x: middle, y: y + height });
      } else {
        expectPoint(mark.start, { x: middle, y: y + height });
        expectPoint(mark.end, { x: middle, y });
      }
    });
    // The total stands on the axis: its walk starts where August's does, at 0.
    expect(steps[steps.length - 1]).toMatchObject({ kind: "total", value: 12 });
    expect(marks[marks.length - 1]!.start.y).toBeCloseTo(marks[0]!.start.y, 6);
  });

  it("keeps each step's signed value past its end, with a true minus sign, the total's above the ball", async () => {
    const { e, svg, chart, fx } = waterfall();
    await run(e, 1000);
    const texts = [...svg.querySelectorAll(".ec-overlay .ec-runs text")];
    expect(texts.map((text) => text.textContent)).toEqual(["−1", "−2", "+2", "+3", "+5", "+4", "+3", "+2", "−1", "−3", "+12"]);
    const steps = stepsOf(months);
    const rects = chart.steps.nodes();
    texts.forEach((text, i) => {
      const { y, height } = box(rects[i]!);
      const baseline = Number(text.getAttribute("y"));
      // Past the tip: above a rise and the total, below a fall.
      if (steps[i]!.kind === "fall") expect(baseline).toBeGreaterThan(y + height);
      else expect(baseline).toBeLessThan(y);
    });
    // The total's is above where the ball rests, a ball's height over the total's top.
    const total = box(rects[rects.length - 1]!);
    expect(fx.steps.marks()[rects.length - 1]!.labelBounds).toEqual([{ x: total.x + total.width - BALL, y: total.y - BALL, width: BALL, height: BALL }]);
    expect(Number(texts[texts.length - 1]!.getAttribute("y"))).toBeLessThan(total.y - BALL);
  });

  it("names each step with its change and the running total, and leaves the connectors and the staircase unnamed and out of reach", () => {
    const { svg } = waterfall();
    expect([...svg.querySelectorAll("rect.step")].map((rect) => rect.getAttribute("aria-label"))).toEqual([
      "August: −1, −1 so far",
      "September: −2, −3 so far",
      "October: +2, −1 so far",
      "November: +3, +2 so far",
      "December: +5, +7 so far",
      "January: +4, +11 so far",
      "February: +3, +14 so far",
      "March: +2, +16 so far",
      "April: −1, +15 so far",
      "May: −3, +12 so far",
      "Season: +12 goal difference"
    ]);
    expect(svg.querySelectorAll('rect.step[tabindex="0"]')).toHaveLength(1);
    for (const element of svg.querySelectorAll("line.connector, .staircase path")) {
      expect(element.hasAttribute("tabindex")).toBe(false);
      expect(element.hasAttribute("role")).toBe(false);
      expect(element.hasAttribute("aria-label")).toBe(false);
      expect(element.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("walks the staircase over the steps' tops from August's start to the total's end, and the ball comes to rest on the total", async () => {
    const { e, svg, chart, fx } = waterfall();
    const [stairs] = fx.staircase.marks();
    const rects = chart.steps.nodes().map(box);
    const total = rects[rects.length - 1]!;
    expectPoint(stairs!.start, { x: rects[0]!.x, y: rects[0]!.y });
    expectPoint(stairs!.end, { x: total.x + total.width, y: total.y });
    // Every corner is on a step's edge or a connector: never inside a step.
    for (const p of pathPoints(chart.staircase.attr("d"))) {
      for (const r of rects) expect(p.x > r.x + 1e-6 && p.x < r.x + r.width - 1e-6 && p.y > r.y + 1e-6 && p.y < r.y + r.height - 1e-6).toBe(false);
    }
    await run(e, 400);
    const travelling = iconAt(ball(svg));
    await run(e, 5000);
    const resting = iconAt(ball(svg));
    expect(near(travelling, resting, 1)).toBe(false);
    // On the total's top, at its end, as far in as half the ball, riding on the staircase's 1 px.
    expect(stairs!.thickness).toBe(1);
    expect(resting.x).toBeCloseTo(total.x + total.width - BALL / 2, 1);
    expect(resting.y).toBeCloseTo(total.y - 0.5 - BALL / 2, 1);
    expect(e.clock.idle).toBe(true);
  });

  it("draws the connectors in at load, and with motion off shows only end states: the ball on the total, the labels, the connectors drawn", async () => {
    const moving = waterfall();
    const connectors = (svg: SVGSVGElement): SVGGElement => overlayWith(svg, '.ec-run[data-slot="enter"][data-key="August"]');
    await run(moving.e, 300);
    // Each connector part way along, over itself made faint.
    expect(drawn(connectors(moving.svg))).toHaveLength(10);
    expect(moving.svg.querySelector("line.connector")!.getAttribute("style")).toMatch(/opacity: 0.3/);
    await run(moving.e, 1000);
    expect(drawn(connectors(moving.svg))).toHaveLength(0);
    expect(moving.svg.querySelector("line.connector")!.getAttribute("style") ?? "").not.toMatch(/opacity/);

    const still = waterfall("off");
    const total = box(still.chart.steps.nodes()[10]!);
    const resting = iconAt(ball(still.svg));
    expect(resting.x).toBeCloseTo(total.x + total.width - BALL / 2, 1);
    expect(resting.y).toBeCloseTo(total.y - 0.5 - BALL / 2, 1);
    expect(still.svg.querySelectorAll(".ec-overlay .ec-runs text")).toHaveLength(11);
    expect(overlays(still.svg).flatMap(drawn)).toHaveLength(0);
    expect(still.e.clock.idle).toBe(true);
  });
});

describe("the dumbbell", () => {
  function dumbbell() {
    const e = env();
    const svg = svgIn();
    const chart = drawDumbbell(svg, players, "goals");
    const fx = attachDumbbell(chart, attachOn(e));
    return { e, svg, chart, fx };
  }

  /** A player's dot for one half. */
  const dotOf = (chart: ReturnType<typeof dumbbell>["chart"], name: string, half: "first" | "second"): SVGCircleElement =>
    chart.dots[half].filter((d) => d.name === name).node()!;

  it("walks each connector from the first half's dot to the second's, edge to edge, sorted by the change, and names the change in words", () => {
    const { svg, chart, fx } = dumbbell();
    const rows = rowsFor(players, "goals");
    expect(fx.connectors.marks().map((mark) => mark.key)).toEqual(rows.map((row) => row.name));
    fx.connectors.marks().forEach((mark, i) => {
      const [first, second] = (["first", "second"] as const).map((half) => Number(dotOf(chart, mark.key, half).getAttribute("cx")));
      expect(mark.start.y).toBeCloseTo(i * 32 + 16, 6);
      expect(mark.end.y).toBeCloseTo(mark.start.y, 6);
      // From the first dot's edge to the second's, 6 px in from each centre.
      const way = Math.sign(second! - first!);
      expect(mark.start.x).toBeCloseTo(first! + 6 * way, 6);
      expect(mark.end.x).toBeCloseTo(second! - 6 * way, 6);
    });
    const names = [...svg.querySelectorAll("line.connector")].map((line) => line.getAttribute("aria-label"));
    expect(names[0]).toBe("Lindqvist: 3 goals in the first half, 7 in the second, up 4");
    expect(names[1]).toBe("Reyes: 1 goal in the first half, 4 in the second, up 3");
    expect(names[7]).toBe("Okafor: 10 goals in the first half, 6 in the second, down 4");
    // The dots are for the pointer: the connectors take the keyboard, and each row is read once.
    expect(svg.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(svg.querySelector('[tabindex="0"]')!.getAttribute("aria-label")).toBe(names[0]);
    for (const dot of svg.querySelectorAll("circle.dot")) {
      expect(dot.hasAttribute("tabindex") || dot.hasAttribute("aria-label")).toBe(false);
      expect(dot.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("runs a connector's arrow from the first half to the second when its dot is hovered, through the link", async () => {
    const { e, svg, chart, fx } = dumbbell();
    const okafor = fx.connectors.marks().find((mark) => mark.key === "Okafor")!;
    const arrows = (): Element[] => [...svg.querySelectorAll('.ec-overlay .ec-icon[data-icon="arrow"]')];
    expect(arrows()).toHaveLength(0);
    const dot = dotOf(chart, "Okafor", "second");
    pointer("pointerover", dot);
    pointer("pointermove", dot);
    await run(e, 120);
    const [arrow] = arrows();
    expect(arrow).toBeDefined();
    const early = iconAt(arrow!);
    await run(e, 2000);
    const resting = iconAt(arrow!);
    // From 10 goals to 6: the arrow goes left, and rests at the line's end, by the second half's dot, as far in as half its length.
    expect(resting.x).toBeLessThan(early.x);
    expect(resting.x).toBeCloseTo(okafor.end.x + 8, 0);
    // The link lit Okafor's other dot and his line: the rest are dimmed.
    expect(svg.querySelectorAll("circle.dot.ec-dimmed")).toHaveLength(14);
    expect(svg.querySelectorAll("line.connector.ec-dimmed")).toHaveLength(7);
  });

  it("joins assists, re-sorts by the new gap and moves there, the effects following", async () => {
    const { e, chart, fx } = dumbbell();
    const updates: string[] = [];
    fx.connectors.on("update", (event) => updates.push(event.mark.key));
    chart.set("assists");
    fx.refresh();
    const rows = rowsFor(players, "assists");
    expect(fx.connectors.marks().map((mark) => mark.key)).toEqual(rows.map((row) => row.name));
    expect(rows[0]!.name).toBe("Adeyemi");
    expect(updates).toHaveLength(8);
    await chart.move({ values: 0, positions: 0, staged: true });
    await run(e, 32);
    fx.connectors.marks().forEach((mark, i) => expect(mark.start.y).toBeCloseTo(i * 32 + 16, 6));
    expect(chart.connectors.nodes()[0]!.getAttribute("aria-label")).toBe("Adeyemi: 1 assist in the first half, 5 in the second, up 4");
  });
});

describe("the radar", () => {
  function radar() {
    const e = env();
    const svg = svgIn();
    const chart = drawRadar(svg, radarAxes, profiles);
    const fx = attachRadar(chart, attachOn(e));
    return { e, svg, chart, fx };
  }

  /** The distance from a point to a closed polygon's edges. */
  function toOutline(p: Point, corners: readonly Point[]): number {
    return Math.min(
      ...corners.map((a, i) => {
        const b = corners[(i + 1) % corners.length]!;
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey)));
        return Math.hypot(p.x - (a.x + t * ex), p.y - (a.y + t * ey));
      })
    );
  }

  it("walks each outline from its first corner round to the first again, through every corner", () => {
    const { chart, fx } = radar();
    const marks = fx.outlines.marks();
    expect(marks.map((mark) => mark.key)).toEqual(["player", "average"]);
    for (const mark of marks) {
      const corners = chart.corners(mark.key as "player" | "average");
      expectPoint(mark.start, corners[0]!);
      expectPoint(mark.end, corners[0]!);
      pathPoints(mark.slice(0, 1)).forEach((p, i) => expectPoint(p, corners[i % corners.length]!, 2));
      expect(mark.outline.closed).toBe(false);
    }
  });

  it("colours the player's outline where it's past the league average, each run ending where the outlines cross", () => {
    const { svg, chart } = radar();
    const runs = drawn(overlayWith(svg, '.ec-run[data-key="player"][data-slot="decorate"]'));
    // Round goals, from the start and back to it at the end, and round shots.
    expect(runs).toHaveLength(3);
    const player = chart.corners("player");
    const average = chart.corners("average");
    const ends = runs.flatMap((path) => {
      const points = pathPoints(path.getAttribute("d"));
      return [points[0]!, points[points.length - 1]!];
    });
    // Each end is the goals corner, where the walk starts and ends, or a crossing on the average's outline.
    // Within a quarter of a pixel: between two rays the colour's end is interpolated.
    for (const end of ends) expect(near(end, player[0]!) || toOutline(end, average) < 0.25, `${end.x},${end.y}`).toBe(true);
    expect(ends.filter((end) => !near(end, player[0]!))).toHaveLength(4);
    // And the corners coloured are those past the average: goals, shots and dribbles.
    const reach = (p: Point): number => Math.hypot(p.x - chart.center.x, p.y - chart.center.y);
    const coloured = player.map((corner, i) => (runs.some((path) => pathPoints(path.getAttribute("d")).some((p) => near(p, corner))) ? i : -1)).filter((i) => i >= 0);
    expect(coloured).toEqual([0, 2, 5]);
    player.forEach((corner, i) => expect(reach(corner) > reach(average[i]!)).toBe(coloured.includes(i)));
  });

  it("names the outlines and the values, and walks each value out its spoke, so a dot travels from the centre to it on hover and lights the same axis on the other shape", async () => {
    const { e, svg, chart, fx } = radar();
    expect([...svg.querySelectorAll("polygon.outline")].map((polygon) => polygon.getAttribute("aria-label"))).toEqual([
      "Okafor: above the league average in goals, shots and dribbles",
      "League average: goals 63rd, assists 58th, shots 57th, key passes 56th, tackles 54th, dribbles 60th percentile"
    ]);
    expect(chart.values.player.nodes()[0]!.getAttribute("aria-label")).toBe("Okafor, goals: 0.50 per 90, 96th percentile");
    expect(chart.values.average.nodes()[4]!.getAttribute("aria-label")).toBe("League average, tackles: 1.40 per 90, 54th percentile");
    for (const mark of [...fx.values.player.marks(), ...fx.values.average.marks()]) {
      expectPoint(mark.start, chart.center);
      expect(mark.thickness).toBe(8);
    }
    const shots = chart.values.player.nodes()[2]!;
    const spoke: MarkGeometry = fx.values.player.marks()[2]!;
    const at = { x: Number(shots.getAttribute("cx")), y: Number(shots.getAttribute("cy")) };
    // Out to the circle's far edge, so the dot comes to rest on the value.
    expect(Math.hypot(spoke.end.x - at.x, spoke.end.y - at.y)).toBeCloseTo(4, 6);
    pointer("pointerover", shots);
    pointer("pointermove", shots);
    await run(e, 2000);
    // Its own dot, and the average's on the same axis.
    const icons = [...svg.querySelectorAll('.ec-overlay .ec-icon[data-icon="dot"]')].map(iconAt);
    expect(icons).toHaveLength(2);
    const averageShots = chart.values.average.nodes()[2]!;
    const linked = { x: Number(averageShots.getAttribute("cx")), y: Number(averageShots.getAttribute("cy")) };
    expect(icons.some((icon) => near(icon, at, 1.5))).toBe(true);
    expect(icons.some((icon) => near(icon, linked, 1.5))).toBe(true);
    expect(svg.querySelectorAll("circle.value.ec-dimmed")).toHaveLength(10);
  });
});

describe("the butterfly", () => {
  function butterfly() {
    const e = env();
    const svg = svgIn();
    const chart = drawButterfly(svg, bands);
    const fx = attachButterfly(chart, attachOn(e));
    return { e, svg, chart, fx };
  }

  it("reads each half's rects as bars growing outward from the middle, conceded left and scored right", () => {
    const { chart, fx } = butterfly();
    const conceded = fx.halves.conceded.marks();
    const scored = fx.halves.scored.marks();
    expect(conceded.map((mark) => mark.key)).toEqual(bands.map((band) => band.band));
    expect(scored.map((mark) => mark.key)).toEqual(bands.map((band) => band.band));
    conceded.forEach((mark, i) => {
      const rect = box(chart.halves.conceded.nodes()[i]!);
      expect(mark.start.x).toBeCloseTo(rect.x + rect.width, 6);
      expect(mark.end.x).toBeCloseTo(rect.x, 6);
    });
    scored.forEach((mark, i) => {
      const rect = box(chart.halves.scored.nodes()[i]!);
      expect(mark.start.x).toBeCloseTo(rect.x, 6);
      expect(mark.end.x).toBeCloseTo(rect.x + rect.width, 6);
    });
  });

  it("draws both halves in together at load, and a bar lights its mirror with no tooltip", async () => {
    const { e, svg, chart } = butterfly();
    await run(e, 300);
    expect(overlays(svg).map((overlay) => drawn(overlay).length)).toEqual([bands.length, bands.length]);
    await run(e, 1000);
    expect(overlays(svg).map((overlay) => drawn(overlay).length)).toEqual([0, 0]);
    const rect = chart.halves.conceded.nodes()[4]!;
    pointer("pointerover", rect);
    pointer("pointermove", rect);
    await run(e, 200);
    const lit = [...svg.querySelectorAll("rect.bar:not(.ec-dimmed)")].map((bar) => (bar as unknown as { __data__: unknown }).__data__);
    expect(lit).toEqual([
      { band: "61–75", side: "conceded", goals: 9 },
      { band: "61–75", side: "scored", goals: 11 }
    ]);
    expect(document.querySelector(".ec-tooltip")).toBeNull();
  });
});
