// The project's signature hover, end to end: the ball rolls along the goals, then the cleat steps
// along the assists. One sequence covers all three views of the prototype's bar chart, with icons
// resolved by name, as a chart would.

import type { Icon, MarkData, MarkGeometry, Matrix, MotionMode, Point } from "./core";
import { createMotion, describe as build, manualClock, matrix } from "./core";
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
});
