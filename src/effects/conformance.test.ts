// The conformance checks from plan §8, for every built-in effect on every kind of mark: a full run
// ends with the same picture and mark style as end(), clearing leaves nothing, an abort mid-run
// settles, and with motion off no frames run.

import type { GeometryEffect, Icon, MarkGeometry } from "../core";
import { describe as build } from "../core";
import { play, testContext, type TestContextOptions } from "../core/testing";
import { parallel, sequence, stagger } from "./combinators";
import { flash } from "./flash";
import { pulse } from "./pulse";
import { travel } from "./travel";
import { wiggle } from "./wiggle";

// Test icons, written out so the effect tests don't depend on src/icons.
const ball: Icon = {
  name: "ball",
  shapes: [{ d: "M5,0A5,5 0 0 1 -5,0A5,5 0 0 1 5,0Z", fill: "#ffffff" }],
  box: { x: -5, y: -5, width: 10, height: 10 },
  size: 10,
  anchor: { x: 0, y: 0 },
  pivot: { x: 0, y: 0 },
  footprint: [5, 5],
  gait: "roll",
  radius: 5
};
const boot: Icon = {
  name: "boot",
  shapes: [{ d: "M0,0L20,0L20,-10L0,-10Z", fill: "#222222" }],
  box: { x: 0, y: -10, width: 20, height: 12 },
  size: 20,
  anchor: { x: 0, y: -4 },
  pivot: { x: 10, y: -3 },
  footprint: [0, 20],
  gait: "step",
  upright: true
};
/** No gait of its own, so it slides. */
const flag: Icon = { ...ball, name: "flag", gait: undefined, radius: undefined };

const bar = (width: number, more: Partial<Parameters<typeof build.bar>[0]> = {}): MarkGeometry =>
  build.bar({ key: "Okafor", series: "goals", x: 0, y: 0, width, height: 20, baseline: "left", ...more });

const marks: Record<string, MarkGeometry> = {
  bar: bar(200, { radius: 4 }),
  "negative bar": build.bar({ key: "n", series: "goals", x: 0, y: 0, width: 120, height: 20, baseline: "right" }),
  column: build.bar({ key: "c", series: "goals", x: 0, y: 0, width: 20, height: 150, baseline: "bottom" }),
  stacked: bar(222, { series: undefined, gap: 2, segments: [{ series: "goals", size: 160 }, { series: "assists", size: 62 }] }),
  "short bar": bar(6),
  slice: build.arc({ key: "Saved", cx: 150, cy: 150, inner: 70, outer: 116, start: 0.3, end: 2.4 }),
  line: build.line({ key: "goals", series: "goals", points: [{ x: 0, y: 100 }, { x: 80, y: 60 }, { x: 160, y: 90 }, { x: 240, y: 20 }], width: 2 }),
  point: build.point({ key: "p", x: 10, y: 10, r: 3 })
};

const effects: Record<string, GeometryEffect> = {
  roll: travel(ball),
  step: travel(boot),
  "level slide": travel(flag, { orient: "level" }),
  "fit, riding on": travel(ball, { size: "fit", ride: "on" }),
  "along assists": travel(boot, { along: "assists" }),
  "ball then boot": sequence(travel(ball, { along: "goals" }), travel(boot, { along: "assists" })),
  flash: flash(),
  "flash in a colour": flash({ width: 12, opacity: 0.5, color: "series-3" }),
  "flash while the ball rolls": parallel(flash(), travel(ball, { along: "goals" })),
  wiggle: wiggle(),
  "wiggle by 1 px": wiggle({ swing: 1 }),
  pulse: pulse(),
  "pulse once in a colour": pulse({ times: 1, color: "series-3" }),
  "staggered flash, third of five": stagger(flash())
};

/** The batch an effect runs in, where it matters: a staggered mark waits its turn first. */
const batches: Record<string, TestContextOptions["batch"]> = { "staggered flash, third of five": { index: 2, count: 5 } };

const runToEnd = (effect: GeometryEffect, mark: MarkGeometry, ctx: ReturnType<typeof testContext>): Promise<number> =>
  play(ctx.clock, effect.run(mark, ctx), { frame: 16 });

for (const [effectName, effect] of Object.entries(effects)) {
  for (const [markName, mark] of Object.entries(marks)) {
    describe(`${effectName} on a ${markName}`, () => {
      const context = (options: TestContextOptions = {}): ReturnType<typeof testContext> => testContext({ batch: batches[effectName], ...options });

      it("ends a full run with the same picture and mark style as end()", async () => {
        const ran = context();
        await runToEnd(effect, mark, ran);
        const ended = context();
        effect.end(mark, ended);
        expect(ran.layer.picture()).toEqual(ended.layer.picture());
        expect(ran.mark.style).toEqual(ended.mark.style);
      });

      it("leaves nothing behind once cleared", async () => {
        const ctx = context();
        await runToEnd(effect, mark, ctx);
        effect.clear(ctx);
        ctx.clear();
        expect(ctx.layer.drawn).toEqual([]);
        expect(ctx.mark.style).toEqual({});
      });

      it("settles when aborted mid-run, and clears to nothing", async () => {
        const ctx = context();
        const running = effect.run(mark, ctx);
        ctx.clock.advance(16);
        ctx.clock.advance(16);
        ctx.abort();
        await expect(running).resolves.toBeUndefined();
        effect.clear(ctx);
        ctx.clear();
        expect(ctx.layer.drawn).toEqual([]);
        expect(ctx.mark.style).toEqual({});
        expect(ctx.clock.idle).toBe(true);
      });

      it("runs no frames when motion is off, and draws the end state", async () => {
        const ctx = context({ mode: "off" });
        const running = effect.run(mark, ctx);
        expect(ctx.clock.idle).toBe(true);
        await running;
        expect(ctx.clock.idle).toBe(true);
        const ended = context({ mode: "off" });
        effect.end(mark, ended);
        expect(ctx.layer.picture()).toEqual(ended.layer.picture());
        expect(ctx.mark.style).toEqual(ended.mark.style);
      });
    });
  }
}
