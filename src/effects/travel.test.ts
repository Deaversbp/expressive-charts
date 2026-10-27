import type { GeometryEffect, Icon, MarkGeometry, Matrix, Point } from "../core";
import { describe as build, matrix } from "../core";
import { normalizeAngle } from "../core/geometry";
import { play, testContext, type DrawnIcon, type TestContext } from "../core/testing";
import { stagger } from "./combinators";
import type { Gait, GaitState } from "./gaits";
import { travel, type TravelOptions } from "./travel";

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

  describe("on a long trip", () => {
    /** A bar whose trip, inset by the icon's footprint, is `distance` px. */
    const across = (icon: Icon, distance: number): MarkGeometry => bar(distance + icon.footprint[0] + icon.footprint[1]);
    const paced = (pace: number): Gait => Object.assign((): ReturnType<Gait> => ({ lift: 0, spin: 0, tilt: 0 }), { pace });

    it.each([
      // 1,000 px ÷ 360 px/s is 2,778 ms; 1,440 px is 4 s.
      ["rolls", ball, {}, 1000, 2780],
      ["rolls", ball, {}, 1440, 4000],
      ["rolls", ball, {}, 10_000, 4000],
      ["slides", flag, {}, 1000, 2780],
      ["slides", flag, {}, 10_000, 4000],
      // A step's pace is 1.15: 3,194 ms, then 4,600 ms capped.
      ["steps", boot, {}, 1000, 3200],
      ["steps", boot, {}, 1440, 4000],
      ["steps", boot, {}, 10_000, 4000],
      // The cap comes after the pace: 13,889 ms at pace 0.5 is 6,944 ms, capped too.
      ["moves at pace 0.5", flag, { gait: paced(0.5) }, 1440, 2000],
      ["moves at pace 0.5", flag, { gait: paced(0.5) }, 10_000, 4000],
      ["moves at pace 2", flag, { gait: paced(2) }, 1000, 4000]
    ] as const)("lasts at most 4 s base when it %s %i px", async (_gait, icon, options: TravelOptions, distance, ms) => {
      const mark = across(icon, distance);
      const ctx = testContext();
      expect(await runToEnd(travel(icon, options), mark, ctx)).toBe(ms);
      // Faster, not shorter: it still ends at the end of the walk.
      const end = icon.footprint[0] + distance;
      expect(anchorOf(icon, only(ctx).transform).x).toBeCloseTo(end, 6);
    });

    it("is scaled by the motion mode as before", async () => {
      // Analysis: 4,000 × 0.35 = 1,400 ms, held to its 300 ms ceiling.
      expect(await runToEnd(travel(ball), across(ball, 10_000), testContext({ mode: "analysis" }))).toBe(300);
      const off = testContext({ mode: "off" });
      const running = travel(ball).run(across(ball, 10_000), off);
      expect(off.clock.idle).toBe(true);
      await running;
      expect(anchorOf(ball, only(off).transform).x).toBeCloseTo(10_005, 6);
    });

    it("ends within 5 s behind stagger's longest spread", async () => {
      const ctx = testContext({ batch: { index: 1, count: 2 } });
      expect(await runToEnd(stagger(travel(ball), { delay: 500 }), across(ball, 10_000), ctx)).toBe(4500);
    });
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

  describe("across a gap", () => {
    /** A level line at y = 50 through these x's, broken at these indices. */
    const level = (xs: readonly number[], breaks: readonly number[] = []): MarkGeometry =>
      build.line({ key: "goals", series: "goals", points: xs.map((x) => ({ x, y: 50 })), breaks, width: 2 });
    // Two runs of 100 px with 100 px of gap between: a slide of 90 px along each.
    const gapped = level([0, 100, 200, 300], [2]);
    const xs = (ctx: TestContext): number[] => placements(ctx).map((m) => anchorOf(flag, m).x);

    it("jumps: it's never drawn over the gap, and goes from its start to its end at once", async () => {
      const ctx = testContext();
      await play(ctx.clock, travel(flag).run(gapped, ctx), { frame: 1 });
      const along = xs(ctx);
      expect(along[0]).toBe(5);
      expect(along[along.length - 1]).toBeCloseTo(295, 9);
      for (const x of along) expect(x <= 95 + 1e-9 || x >= 205 - 1e-9, `x = ${x}`).toBe(true);
      // Inset by its footprint from each run's ends, as from the walk's: it leaves the first at 95 and lands on the second at 205.
      const jump = along.findIndex((x) => x >= 205 - 1e-9);
      expect(along[jump - 1]).toBeGreaterThan(94);
      expect(along[jump]).toBeLessThan(206);
      for (let i = 1; i < along.length; i++) expect(along[i]! - along[i - 1]!).toBeLessThan(i === jump ? 112 : 2);
    });

    it("takes the time of the walk it's drawn on, not of the gap", async () => {
      // 180 px of slide: 500 ms, as on a bar whose trip is 180 px; without the gap it would be 290 px.
      expect(await runToEnd(travel(flag), gapped, testContext())).toBe(500);
      expect(await runToEnd(travel(flag), bar(190), testContext())).toBe(500);
      expect(await runToEnd(travel(flag), level([0, 100, 200, 300]), testContext())).toBe(810);
    });

    it("rolls without slipping on the walk it's drawn on, and doesn't turn across the gap", async () => {
      const ctx = testContext();
      await runToEnd(travel(ball), gapped, ctx);
      // 180 px on a radius of 5 is 36 radians.
      expect(turnOf(only(ctx).transform!)).toBeCloseTo(normalizeAngle(36), 9);
    });

    it("heads along the run it's on, never smoothed across a gap that turns", async () => {
      // Level runs either side of a gap that drops 100 px. Heel first, so it lands right at the second run's start.
      const heel: Icon = { ...flag, name: "heel", footprint: [0, 20] };
      const drop = build.line({ key: "goals", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 100 }, { x: 300, y: 100 }], breaks: [2] });
      const ctx = testContext();
      await play(ctx.clock, travel(heel, { orient: "follow" }).run(drop, ctx), { frame: 1 });
      const landed = anchorOf(heel, placements(ctx).find((m) => anchorOf(heel, m).x >= 200));
      expect(landed.x).toBeLessThan(201);
      expect(landed.y).toBe(100);
      for (const m of placements(ctx)) expect(turnOf(m)).toBeCloseTo(0, 12);
    });

    it("passes a run shorter than the icon at once, and a value alone between gaps", async () => {
      for (const line of [level([0, 100, 150, 155, 200, 300], [2, 4]), level([0, 100, 150, 200, 300], [2, 3])]) {
        const ctx = testContext();
        await play(ctx.clock, travel(flag).run(line, ctx), { frame: 1 });
        for (const x of xs(ctx)) expect(x <= 95 + 1e-9 || x >= 205 - 1e-9, `x = ${x}`).toBe(true);
        expect(await runToEnd(travel(flag), line, testContext())).toBe(500);
      }
    });

    it("rests at the last value when the last run is shorter than the icon, as on a walk that short", async () => {
      // A value alone at the end, and a run of 4 px: the icon's back at the run's start, hanging past its end.
      for (const line of [level([0, 100, 200], [2]), level([0, 100, 200, 204], [2])]) {
        const ctx = testContext();
        travel(flag).end(line, ctx);
        expect(anchorOf(flag, only(ctx).transform)).toEqual({ x: 205, y: 50 });
      }
    });

    it("rides a revealed tip: it rests at the last value while the line is revealed into a gap, and moves on when the next comes", async () => {
      const ctx = testContext();
      await runToEnd(travel(flag, { ride: "on" }), level([0, 60]), ctx);
      const at = (): Point => anchorOf(flag, only(ctx).transform);
      expect(at()).toEqual({ x: 55, y: 44 });
      // Revealed to its last value before the gap, and on into the gap, where a line ends at its last value.
      ctx.change(level([0, 60, 100]));
      expect(at()).toEqual({ x: 95, y: 44 });
      // The next value comes: the icon rests there, then rides the next run's tip.
      ctx.change(level([0, 60, 100, 200], [3]));
      expect(at().x).toBeCloseTo(205, 9);
      ctx.change(level([0, 60, 100, 200, 250], [3]));
      expect(at().x).toBeCloseTo(245, 9);
      expect(at().y).toBeCloseTo(44, 9);
    });

    it("draws nothing on a line whose values are all alone, and hides when a change leaves it one", async () => {
      const alone = level([0, 100, 200], [1, 2]);
      expect(alone.gaps).toHaveLength(2);
      const ctx = testContext();
      await runToEnd(travel(flag), alone, ctx);
      expect(ctx.layer.drawn).toEqual([]);
      const moving = testContext();
      await runToEnd(travel(flag), gapped, moving);
      moving.change(alone);
      expect(moving.layer.drawn).toEqual([]);
      moving.change(gapped);
      expect(anchorOf(flag, only(moving).transform).x).toBeCloseTo(295, 9);
    });
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
