import type { GeometryEffect, Icon, MarkGeometry, Matrix, Point } from "../core";
import { describe as build, matrix } from "../core";
import { normalizeAngle } from "../core/geometry";
import { play, testContext, type DrawnIcon, type TestContext } from "../core/testing";
import { sequence } from "./combinators";
import type { Gait, GaitState } from "./gaits";
import { travel } from "./travel";

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

const icons = (ctx: TestContext): DrawnIcon[] => ctx.layer.drawn.filter((d): d is DrawnIcon => d.kind === "icon");
const only = (ctx: TestContext): DrawnIcon => {
  const drawn = icons(ctx);
  expect(drawn).toHaveLength(1);
  return drawn[0]!;
};
/** Where the transform puts the icon's anchor (the drawing layer's scale keeps the anchor fixed). */
const anchorOf = (icon: Icon, transform: Matrix | undefined): Point => matrix.apply(transform!, icon.anchor);
const placements = (ctx: TestContext): Matrix[] => ctx.layer.calls.flatMap((call) => (call.op === "place" ? [call.transform] : []));
const turnOf = (m: Matrix): number => Math.atan2(m[1], m[0]);
/** Where the icon's up side (−y) points on screen, from the anchor. */
const upOf = (icon: Icon, m: Matrix): Point => {
  const a = matrix.apply(m, icon.anchor);
  const b = matrix.apply(m, { x: icon.anchor.x, y: icon.anchor.y - 1 });
  return { x: b.x - a.x, y: b.y - a.y };
};
const det = (m: Matrix): number => m[0] * m[3] - m[1] * m[2];

async function runToEnd(effect: GeometryEffect, mark: MarkGeometry, ctx: TestContext, frame = 10): Promise<number> {
  return play(ctx.clock, effect.run(mark, ctx), { frame });
}

describe("travel", () => {
  it("rolls an icon out the bar, inset by its footprint", async () => {
    const ctx = testContext();
    const elapsed = await runToEnd(travel(ball), bar(200), ctx);
    const [first] = placements(ctx);
    expect(anchorOf(ball, first)).toEqual({ x: 5, y: 10 });
    const drawn = only(ctx);
    expect(drawn.size).toBe(10);
    expect(anchorOf(ball, drawn.transform).x).toBeCloseTo(195, 9);
    expect(anchorOf(ball, drawn.transform).y).toBeCloseTo(10, 9);
    // Rolling without slipping: 190 px on a radius of 5 is 38 radians.
    expect(turnOf(drawn.transform!)).toBeCloseTo(normalizeAngle(38), 9);
    // max(260 ms, 190 px ÷ 360 px/s) = 528 ms, in 10 ms frames.
    expect(elapsed).toBe(530);
  });

  it("takes at least 260 ms, scaled by the motion mode with effect timing", async () => {
    expect(await runToEnd(travel(ball), bar(50), testContext())).toBe(260);
    // Analysis: 260 × 0.35, raised to its 140 ms floor.
    expect(await runToEnd(travel(ball), bar(50), testContext({ mode: "analysis" }))).toBe(140);
    // A step takes 15% longer: 180 px is 500 ms, so 575 ms.
    expect(await runToEnd(travel(boot), bar(200), testContext())).toBe(580);
  });

  it("does nothing on a missing segment, a walk under 0.5 px, or a mark with no walk", async () => {
    const cases: [MarkGeometry, string | undefined][] = [
      [bar(200), "assists"],
      [bar(200, { segments: [{ series: "goals", size: 200 }, { series: "assists", size: 0.4 }] }), "assists"],
      [build.point({ key: "p", x: 10, y: 10, r: 4 }), undefined]
    ];
    for (const [mark, along] of cases) {
      const ctx = testContext();
      const running = travel(ball, along === undefined ? {} : { along }).run(mark, ctx);
      expect(ctx.clock.idle).toBe(true);
      await running;
      expect(ctx.layer.drawn).toEqual([]);
    }
  });

  it("travels along a named segment, or a mark of that series with no segments", async () => {
    const stacked = bar(222, { series: undefined, gap: 2, segments: [{ series: "goals", size: 160 }, { series: "assists", size: 62 }] });
    const ctx = testContext();
    await runToEnd(travel(boot, { along: "assists" }), stacked, ctx);
    // The assists segment runs from 162 (after the gap) to 222; the heel stops 20 px short of the tip.
    expect(anchorOf(boot, placements(ctx)[0])).toEqual({ x: 162, y: 10 });
    expect(anchorOf(boot, only(ctx).transform).x).toBeCloseTo(202, 9);

    const line = build.line({ key: "goals", series: "goals", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
    const onLine = testContext();
    await runToEnd(travel(ball, { along: "goals" }), line, onLine);
    expect(anchorOf(ball, only(onLine).transform).x).toBeCloseTo(95, 9);
  });

  it("rests at the start without moving when the walk is shorter than the icon", async () => {
    const ctx = testContext();
    const running = travel(ball).run(bar(8), ctx);
    expect(ctx.clock.idle).toBe(true);
    await running;
    expect(anchorOf(ball, only(ctx).transform)).toEqual({ x: 5, y: 10 });

    // Shorter than the inset itself: it carries on past the end, so the ball doesn't cover the baseline.
    const column = build.bar({ key: "c", series: "goals", x: 0, y: 0, width: 20, height: 3, baseline: "bottom" });
    const short = testContext();
    await travel(ball).run(column, short);
    const at = anchorOf(ball, only(short).transform);
    expect(at.x).toBeCloseTo(10, 9);
    expect(at.y).toBeCloseTo(-2, 9);
  });

  it("uses the gait it's given, then the icon's own, then slide", async () => {
    const plain = testContext();
    await runToEnd(travel(flag), bar(100), plain);
    expect(placements(plain).every((m) => Math.abs(m[1]) < 1e-12 && m[0] === 1)).toBe(true);

    const slid = testContext();
    await runToEnd(travel(ball, { gait: "slide" }), bar(100), slid);
    expect(only(slid).transform![0]).toBe(1);

    const states: GaitState[] = [];
    const custom: Gait = (state) => {
      states.push(state);
      return { lift: 1, spin: 0, tilt: 0 };
    };
    const lifted = testContext();
    await runToEnd(travel(ball, { gait: custom, size: 20 }), bar(100), lifted);
    // The gait works in the icon's own units: the ball is drawn twice its size, so 80 px is 40 units.
    expect(states[states.length - 1]).toEqual({ distance: 40, length: 40, progress: 1, radius: 5 });
    // A lift of 1 unit is 2 px at that size.
    expect(anchorOf(ball, only(lifted).transform).y).toBeCloseTo(8, 9);
  });

  it("sizes the icon by px or to fit the mark, insetting by its scaled footprint", async () => {
    const sized = testContext();
    await travel(ball, { size: 20 }).end(bar(100), sized);
    expect(only(sized).size).toBe(20);
    expect(anchorOf(ball, only(sized).transform).x).toBeCloseTo(90, 9);

    // "fit": the ball's box is 85% of the bar's 20 px.
    const fit = testContext();
    travel(ball, { size: "fit" }).end(bar(100), fit);
    expect(only(fit).size).toBeCloseTo(17, 9);
    expect(anchorOf(ball, only(fit).transform).x).toBeCloseTo(91.5, 9);
  });

  it("scales the pivot with the icon, since the layer scales about the anchor", () => {
    const tilted: Gait = () => ({ lift: 0, spin: 0, tilt: Math.PI / 2 });
    const ctx = testContext();
    travel(boot, { gait: tilted, size: 40 }).end(bar(100), ctx);
    const m = only(ctx).transform!;
    // The layer scales by 2 about the anchor (0, −4): the pivot (10, −3) is drawn at (20, −2), and the
    // tilt turns about that point, so it stays put.
    const layer = matrix.scale(2, 2, boot.anchor);
    const drawnPivot = matrix.apply(matrix.multiply(m, layer), boot.pivot);
    const restingPivot = matrix.apply(matrix.multiply(matrix.translate(60, 10), matrix.translate(0, 4), layer), boot.pivot);
    expect(drawnPivot.x).toBeCloseTo(restingPivot.x, 9);
    expect(drawnPivot.y).toBeCloseTo(restingPivot.y, 9);
  });

  it("orients: follows the walk, mirrors upright icons instead of turning them over, or stays level", () => {
    const negative = build.bar({ key: "n", series: "goals", x: 0, y: 0, width: 120, height: 20, baseline: "right" });

    const follow = testContext();
    travel(flag).end(negative, follow);
    expect(turnOf(only(follow).transform!)).toBeCloseTo(Math.PI, 9);

    // The boot heads left: mirrored, its toe leads and its top stays up.
    const mirrored = testContext();
    travel(boot).end(negative, mirrored);
    const m = only(mirrored).transform!;
    expect(det(m)).toBeLessThan(0);
    expect(upOf(boot, m).y).toBeCloseTo(-1, 9);
    expect(matrix.apply(m, { x: 20, y: -4 }).x).toBeLessThan(matrix.apply(m, boot.anchor).x);
    expect(anchorOf(boot, m).x).toBeCloseTo(20, 9);

    const upsideDown = testContext();
    travel(boot, { orient: "follow" }).end(negative, upsideDown);
    expect(det(only(upsideDown).transform!)).toBeGreaterThan(0);
    expect(upOf(boot, only(upsideDown).transform!).y).toBeCloseTo(1, 9);

    const column = build.bar({ key: "c", series: "goals", x: 0, y: 0, width: 20, height: 150, baseline: "bottom" });
    const level = testContext();
    travel(flag, { orient: "level" }).end(column, level);
    expect(only(level).transform!.slice(0, 4).map((v) => v + 0)).toEqual([1, 0, 0, 1]);
    const upright = testContext();
    travel(flag).end(column, upright);
    expect(turnOf(only(upright).transform!)).toBeCloseTo(-Math.PI / 2, 9);
  });

  it("rides on top of the walk: half the stroke plus the anchor's height above the icon's bottom", () => {
    const line = build.line({ key: "goals", points: [{ x: 0, y: 50 }, { x: 200, y: 50 }], width: 2 });
    const ctx = testContext();
    travel(flag, { ride: "on" }).end(line, ctx);
    expect(anchorOf(flag, only(ctx).transform).y).toBeCloseTo(44, 9);
  });

  it("rolls around a slice on the mid-radius arc, facing along it", async () => {
    const slice = build.arc({ key: "Saved", cx: 0, cy: 0, inner: 70, outer: 116, start: 0, end: Math.PI / 2 });
    const ctx = testContext();
    await runToEnd(travel(flag), slice, ctx);
    for (const m of placements(ctx)) expect(Math.hypot(m[4], m[5])).toBeCloseTo(93, 9);
    // It stops 5 px (its footprint) short of the end; d3 angles equal the heading.
    const angle = Math.PI / 2 - 5 / 93;
    const m = only(ctx).transform!;
    expect(m[4]).toBeCloseTo(93 * Math.sin(angle), 9);
    expect(m[5]).toBeCloseTo(-93 * Math.cos(angle), 9);
    expect(turnOf(m)).toBeCloseTo(angle, 9);
  });

  it("smooths the heading at polyline corners instead of snapping", async () => {
    const corner = build.line({ key: "l", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] });
    const ctx = testContext();
    await play(ctx.clock, travel(flag).run(corner, ctx), { frame: 1 });
    const turns = placements(ctx).map(turnOf);
    expect(turns[0]).toBeCloseTo(0, 9);
    expect(turns[turns.length - 1]).toBeCloseTo(Math.PI / 2, 9);
    for (let i = 1; i < turns.length; i++) expect(Math.abs(turns[i]! - turns[i - 1]!)).toBeLessThan(0.25);
    expect(turns.some((turn) => Math.abs(turn - Math.PI / 4) < 0.1)).toBe(true);
  });

  it("follows the geometry when it moves, and hides while there's nothing to travel along", async () => {
    const ctx = testContext();
    await runToEnd(travel(ball, { along: "goals" }), bar(200), ctx);
    ctx.change(bar(300));
    expect(anchorOf(ball, only(ctx).transform).x).toBeCloseTo(295, 9);
    ctx.change(bar(300, { series: undefined, segments: [{ series: "assists", size: 300 }] }));
    expect(ctx.layer.drawn).toEqual([]);
    ctx.change(bar(100));
    expect(anchorOf(ball, only(ctx).transform).x).toBeCloseTo(95, 9);
    // "fit" redraws the icon at its new size when the mark gets thicker.
    const fit = testContext();
    travel(ball, { size: "fit" }).end(bar(100), fit);
    fit.change(bar(100, { height: 40 }));
    expect(only(fit).size).toBeCloseTo(34, 9);
  });

  it("resolves names through ctx.icons, and throws on an unknown one", async () => {
    const ctx = testContext({ icons: [ball] });
    await runToEnd(travel("ball"), bar(100), ctx);
    expect(only(ctx).icon).toBe(ball);
    await expect(travel("nope").run(bar(100), testContext())).rejects.toThrow(/unknown icon "nope"/);
    expect(() => travel("nope").end(bar(100), testContext())).toThrow(RangeError);
  });

  it("checks its options when it's made", () => {
    expect(() => travel(42 as unknown as string)).toThrow(TypeError);
    expect(() => travel("")).toThrow(TypeError);
    expect(() => travel(ball, { size: 0 })).toThrow(/size must be more than 0/);
    expect(() => travel(ball, { size: "big" as "fit" })).toThrow(RangeError);
    expect(() => travel(ball, { gait: "hop" as "roll" })).toThrow(/gait must be/);
    expect(() => travel(ball, { orient: "up" as "auto" })).toThrow(/orient/);
    expect(() => travel(ball, { ride: "under" as "on" })).toThrow(/ride/);
    expect(() => travel(ball, { along: 3 as unknown as string })).toThrow(/along/);
  });
});

// The conformance checks from plan §8, for travel on every kind of mark.
describe("travel conformance", () => {
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
    "ball then boot": sequence(travel(ball, { along: "goals" }), travel(boot, { along: "assists" }))
  };

  for (const [effectName, effect] of Object.entries(effects)) {
    for (const [markName, mark] of Object.entries(marks)) {
      describe(`${effectName} on a ${markName}`, () => {
        it("ends a full run with the same picture as end()", async () => {
          const ran = testContext();
          await runToEnd(effect, mark, ran, 16);
          const ended = testContext();
          effect.end(mark, ended);
          expect(ran.layer.picture()).toEqual(ended.layer.picture());
        });

        it("leaves nothing behind once cleared", async () => {
          const ctx = testContext();
          await runToEnd(effect, mark, ctx, 16);
          effect.clear(ctx);
          ctx.clear();
          expect(ctx.layer.drawn).toEqual([]);
          expect(ctx.mark.style).toEqual({});
        });

        it("settles when aborted mid-run, and clears to nothing", async () => {
          const ctx = testContext();
          const running = effect.run(mark, ctx);
          ctx.clock.advance(16);
          ctx.clock.advance(16);
          ctx.abort();
          await expect(running).resolves.toBeUndefined();
          effect.clear(ctx);
          ctx.clear();
          expect(ctx.layer.drawn).toEqual([]);
          expect(ctx.clock.idle).toBe(true);
        });

        it("runs no frames when motion is off, and draws the end state", async () => {
          const ctx = testContext({ mode: "off" });
          const running = effect.run(mark, ctx);
          expect(ctx.clock.idle).toBe(true);
          await running;
          expect(ctx.clock.idle).toBe(true);
          const ended = testContext({ mode: "off" });
          effect.end(mark, ended);
          expect(ctx.layer.picture()).toEqual(ended.layer.picture());
        });
      });
    }
  }
});
