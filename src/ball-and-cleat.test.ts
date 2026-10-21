// The project's signature hover, end to end: the ball rolls along the goals, then the cleat steps
// along the assists. One sequence covers all three views of the prototype's bar chart, with icons
// resolved by name, as a chart would.

import { expressive } from "./charts";
import type { Icon, MarkData, MarkGeometry, Matrix, MotionMode, Point } from "./core";
import { createMotion, describe as build, manualClock, matrix } from "./core";
import { parseTransform } from "./core/geometry";
import { createRegistry, type PresetFactory } from "./core/registry";
import { createRunner } from "./core/runner";
import { flush, play, recordingSurface, testContext, type DrawnIcon, type Picture } from "./core/testing";
import { sequence, travel } from "./effects";
import { cleat, soccerBall, sport } from "./icons/sport";
import { iconRegistry, registerIcons } from "./registries";

const views: Record<string, MarkGeometry> = {
  goals: build.bar({ key: "Okafor", x: 0, y: 0, width: 160, height: 20, baseline: "left", radius: 4, segments: [{ series: "goals", size: 160 }] }),
  assists: build.bar({ key: "Okafor", x: 0, y: 0, width: 60, height: 20, baseline: "left", radius: 4, segments: [{ series: "assists", size: 60 }] }),
  // The 2 px gap comes out of the assists segment, which runs from 162 to 222.
  both: build.bar({
    key: "Okafor",
    x: 0,
    y: 0,
    width: 222,
    height: 20,
    baseline: "left",
    radius: 4,
    gap: 2,
    segments: [
      { series: "goals", size: 160 },
      { series: "assists", size: 62 }
    ]
  })
};
const data: MarkData = { datum: { name: "Okafor" }, samples: [], related: () => undefined };

const story = sequence(travel("soccer-ball", { along: "goals" }), travel("cleat", { along: "assists" }));

const drawn = (items: readonly { kind: string }[]): DrawnIcon[] => items.filter((d): d is DrawnIcon => d.kind === "icon");
const anchorOf = (icon: Icon, transform: Matrix | readonly number[] | undefined): Point => matrix.apply(transform as Matrix, icon.anchor);
const near = (point: Point, x: number, y: number): void => {
  expect(point.x).toBeCloseTo(x, 9);
  expect(point.y).toBeCloseTo(y, 9);
};

describe("ball then cleat on a bar", () => {
  it("Goals: the ball rolls to the end of the bar and stays; the cleat has nothing to do", async () => {
    const ctx = testContext({ icons: sport });
    const elapsed = await play(ctx.clock, story.run(views.goals!, ctx), { frame: 10 });
    const [ball, ...rest] = drawn(ctx.layer.drawn);
    expect(rest).toEqual([]);
    expect(ball!.icon).toBe(soccerBall);
    near(anchorOf(soccerBall, ball!.transform), 160 - 8.5, 10);
    // 143 px at 360 px/s.
    expect(elapsed).toBe(400);
  });

  it("Assists: the cleat steps from the baseline until its toe reaches the tip", async () => {
    const ctx = testContext({ icons: sport });
    const elapsed = await play(ctx.clock, story.run(views.assists!, ctx), { frame: 10 });
    const [boot, ...rest] = drawn(ctx.layer.drawn);
    expect(rest).toEqual([]);
    expect(boot!.icon).toBe(cleat);
    near(anchorOf(cleat, boot!.transform), 60 - 26, 10);
    // 34 px is under the 260 ms floor, and a step takes 15% longer: 299 ms.
    expect(elapsed).toBe(300);
  });

  it("Goals + assists: the ball rolls, stops and stays, then the cleat walks on", async () => {
    const ctx = testContext({ icons: sport });
    const running = story.run(views.both!, ctx);
    for (let t = 0; t < 200; t += 10) ctx.clock.advance(10);
    await flush();
    expect(drawn(ctx.layer.drawn).map((d) => d.icon.name)).toEqual(["soccer-ball"]);

    const rest = await play(ctx.clock, running, { frame: 10 });
    expect(200 + rest).toBe(700);
    const [ball, boot] = drawn(ctx.layer.drawn);
    near(anchorOf(soccerBall, ball!.transform), 151.5, 10);
    near(anchorOf(cleat, boot!.transform), 222 - 26, 10);
    const placed = ctx.layer.calls.filter((call) => call.op === "place" && call.id === 2);
    near(anchorOf(cleat, (placed[0] as { transform: Matrix }).transform), 162, 10);
  });

  describe("through the runner, with icons by name", () => {
    registerIcons(sport);

    function hover(mode: MotionMode, mark: MarkGeometry): { surface: ReturnType<typeof recordingSurface>; clock: ReturnType<typeof manualClock> } {
      const clock = manualClock();
      const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
      const surface = recordingSurface();
      const runner = createRunner({ effects: { hover: story }, surface, motion, clock, icons: iconRegistry });
      runner.hover([{ mark, data }]);
      return { surface, clock };
    }

    for (const [view, mark] of Object.entries(views)) {
      it(`${view}: plays in presentation and lands where Off starts`, async () => {
        const off = hover("off", mark);
        expect(off.clock.idle).toBe(true);
        await flush();
        const end: Picture[] = off.surface.picture("Okafor");
        expect(end.length).toBe(view === "both" ? 2 : 1);

        const played = hover("presentation", mark);
        for (let i = 0; i < 100 && !(played.clock.idle && i > 0); i++) {
          played.clock.advance(16);
          await flush();
        }
        expect(played.surface.picture("Okafor")).toEqual(end);
      });
    }
  });

  describe("on bars someone else drew, through expressive()", () => {
    registerIcons(sport);
    const SVG = "http://www.w3.org/2000/svg";

    /** A D3-style stacked bar for one player: a margin group, one <g> per series, 2 px between segments. */
    function host(view: keyof typeof views): { svg: SVGSVGElement; rects: SVGRectElement[] } {
      const svg = document.body.appendChild(document.createElementNS(SVG, "svg"));
      const plot = svg.appendChild(document.createElementNS(SVG, "g"));
      plot.setAttribute("transform", "translate(60,10)");
      const sizes = { goals: view === "assists" ? 0 : 160, assists: view === "goals" ? 0 : 60 };
      const rects = (["goals", "assists"] as const)
        .filter((series) => sizes[series] > 0)
        .map((series) => {
          const group = plot.appendChild(document.createElementNS(SVG, "g"));
          Object.assign(group, { __data__: { key: series } });
          const rect = group.appendChild(document.createElementNS(SVG, "rect"));
          const x = series === "goals" ? 0 : sizes.goals > 0 ? 162 : 0;
          for (const [name, value] of Object.entries({ x, y: 0, width: sizes[series], height: 20 })) rect.setAttribute(name, String(value));
          Object.assign(rect, { __data__: { data: { name: "Okafor" } } });
          return rect;
        });
      return { svg, rects };
    }

    async function hoverOn(view: keyof typeof views, mode: MotionMode): Promise<{ svg: SVGSVGElement; clock: ReturnType<typeof manualClock> }> {
      const { svg, rects } = host(view);
      const clock = manualClock();
      const motion = createMotion({ mode, reducedMotion: { matches: false, subscribe: () => () => {} } });
      expressive<{ data: { name: string } }>(rects, {
        key: (d) => d.data.name,
        segment: (_d, el) => (el.parentElement as unknown as { __data__: { key: string } }).__data__.key,
        on: { hover: story }
      }, { presets: createRegistry<PresetFactory>({ kind: "preset" }), icons: iconRegistry, motion, clock });
      rects[0]!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
      for (let i = 0; i < 100 && !(clock.idle && i > 0); i++) {
        clock.advance(16);
        await flush();
      }
      return { svg, clock };
    }

    const placed = (svg: SVGSVGElement, icon: Icon): Point | undefined => {
      const g = svg.querySelector(`.ec-overlay .ec-icon[data-icon="${icon.name}"]`);
      return g ? anchorOf(icon, parseTransform(g.getAttribute("transform") ?? "")) : undefined;
    };

    afterEach(() => {
      document.body.textContent = "";
    });

    const expected: Record<string, { ball?: number; cleat?: number }> = {
      goals: { ball: 151.5 },
      assists: { cleat: 34 },
      both: { ball: 151.5, cleat: 196 }
    };

    for (const view of Object.keys(views) as (keyof typeof views)[]) {
      it(`${view}: the same story as on our chart, in the plot's coordinates`, async () => {
        const off = await hoverOn(view, "off");
        const played = await hoverOn(view, "presentation");
        for (const [name, icon] of [["ball", soccerBall], ["cleat", cleat]] as const) {
          const x = expected[view]![name];
          for (const { svg } of [off, played]) {
            const at = placed(svg, icon);
            if (x === undefined) expect(at).toBeUndefined();
            else near(at!, x, 10);
          }
        }
        // Presentation lands exactly where Off starts.
        const runs = (svg: SVGSVGElement) => svg.querySelector(".ec-overlay .ec-runs")!.innerHTML.replace(/ec-clip-\d+/g, "clip");
        expect(runs(played.svg)).toBe(runs(off.svg));
      });
    }
  });
});
