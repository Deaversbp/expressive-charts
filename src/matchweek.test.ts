// "Play next matchweek", end to end: `on: { update: "flash" }`, resolved through the page-wide preset
// registry, blinks a halo on the bars whose values changed, on the reference barChart and on bars drawn
// by other code through expressive(). A re-sort alone flashes nothing.

import { barChart, expressive, type ChartEnv } from "./charts";
import { createMotion, manualClock, type MotionMode } from "./core";
import { play } from "./core/testing";
import { iconRegistry, presetRegistry } from "./registries";

interface Player {
  name: string;
  goals: number;
}

const players: Player[] = [
  { name: "Okafor", goals: 16 },
  { name: "Tanaka", goals: 6 },
  { name: "Castillo", goals: 1 }
];

function env(mode: MotionMode = "presentation"): ChartEnv & { clock: ReturnType<typeof manualClock> } {
  const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
  return { presets: presetRegistry, icons: iconRegistry, motion, clock: manualClock() };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("update: \"flash\" on barChart", () => {
  function setup(mode?: MotionMode) {
    const container = document.body.appendChild(document.createElement("div"));
    const e = env(mode);
    const chart = barChart<Player>(container, { label: "Goals", data: players, y: "name", x: "goals", width: 600, on: { update: "flash" } }, e);
    /** The halo widths drawn now, by mark key. */
    const flashing = (): Record<string, (string | null)[]> =>
      Object.fromEntries(
        Array.from(chart.element.querySelectorAll(".ec-halo"), (halo) => [
          halo.closest(".ec-mark")!.getAttribute("data-key"),
          Array.from(halo.querySelectorAll(":scope > path"), (path) => path.getAttribute("stroke-width"))
        ])
      );
    return { chart, clock: e.clock, flashing };
  }

  it("flashes only the bars whose values changed, at the prototype's 8 px and 35% opacity", async () => {
    const { chart, clock, flashing } = setup();
    // Tanaka scores. The leader is unchanged, so only Tanaka's value moves.
    const running = chart.update({ data: players.map((p) => (p.name === "Tanaka" ? { ...p, goals: 7 } : p)) });
    expect(flashing()).toEqual({});
    clock.advance(225);
    expect(flashing()).toEqual({ Tanaka: ["8"] });
    expect(chart.element.querySelector(".ec-halo path")?.getAttribute("stroke-opacity")).toBe("0.35");
    // The values stage settles at 500 ms; the blink carries on to 900 ms and leaves nothing.
    expect(await play(clock, running, { frame: 25 })).toBe(275);
    expect(flashing()).toEqual({ Tanaka: [expect.any(String)] });
    clock.advance(400);
    expect(flashing()).toEqual({});
  });

  it("flashes nothing on a re-sort, or when motion is off", async () => {
    const sorted = setup();
    const running = sorted.chart.update({ sort: "key" });
    sorted.clock.advance(225);
    expect(sorted.flashing()).toEqual({});
    await play(sorted.clock, running);

    const off = setup("off");
    void off.chart.update({ data: players.map((p) => ({ ...p, goals: p.goals + 1 })) });
    expect(off.clock.idle).toBe(true);
    expect(off.flashing()).toEqual({});
  });
});

describe("update: \"flash\" on expressive()", () => {
  const NS = "http://www.w3.org/2000/svg";

  /** Bars drawn by hand at 20 px a goal, each rect's row on __data__, as D3 would bind it. */
  function draw(svg: SVGSVGElement, rows: readonly Player[]): SVGRectElement[] {
    svg.replaceChildren();
    const plot = svg.appendChild(document.createElementNS(NS, "g"));
    plot.setAttribute("transform", "translate(90,4)");
    return rows.map((row, i) => {
      const rect = plot.appendChild(document.createElementNS(NS, "rect"));
      for (const [name, value] of Object.entries({ x: 0, y: i * 34 + 7, width: row.goals * 20, height: 20 })) rect.setAttribute(name, String(value));
      (rect as unknown as { __data__: Player }).__data__ = row;
      return rect;
    });
  }

  it("flashes the bars whose length changed after refresh(), and nothing on a re-sort", () => {
    const svg = document.body.appendChild(document.createElementNS(NS, "svg"));
    const e = env();
    const fx = expressive<Player>(draw(svg, players), { key: (d) => d.name, on: { update: "flash" } }, e);
    const outlineOf = (key: string): string => fx.marks().find((mark) => mark.key === key)!.outline.d;
    // The adapter draws halos in its overlay, so each is told apart by the outline it strokes.
    const flashing = (): { d: string | null; width: string | null }[] =>
      Array.from(svg.querySelectorAll(".ec-halo > path"), (path) => ({ d: path.getAttribute("d"), width: path.getAttribute("stroke-width") }));

    const scored = players.map((p) => (p.name === "Tanaka" ? { ...p, goals: 7 } : p));
    fx.refresh(draw(svg, scored));
    e.clock.advance(225);
    expect(flashing()).toEqual([{ d: outlineOf("Tanaka"), width: "8" }]);
    e.clock.advance(675);
    expect(flashing()).toEqual([]);

    // The same rows in another order: the bars only move.
    fx.refresh(draw(svg, [...scored].reverse()));
    e.clock.advance(225);
    expect(flashing()).toEqual([]);
    fx.destroy();
  });
});
