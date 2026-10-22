import type { DataEffect, EffectSlots, GeometryEffect, MarkData } from "../core";
import { describe as build, linear } from "../core";
import { play, testContext } from "../core/testing";
import { sequence } from "./combinators";
import { defineDataEffect, defineEffect } from "./define";

interface Region {
  region: string;
  revenue: number;
}
interface Team {
  team: string;
  points: number;
}

const mark = build.bar({ key: "North", series: "revenue", x: 0, y: 0, width: 100, height: 20, baseline: "left" });
const data: MarkData<Region> = { datum: { region: "North", revenue: 4 }, samples: [], related: () => undefined };

/** A highlighter stroke along the walk, as sketch 06's trace. */
const trace = defineEffect({
  async run(m, ctx) {
    const stroke = ctx.layer.path(m.slice(0, 0), { stroke: "mark", width: 3 });
    await ctx.tween({ duration: 200, timing: "effect", ease: linear, update: (p) => stroke.update(m.slice(0, p)) }).finished;
  },
  end(m, ctx) {
    ctx.layer.path(m.slice(0, 1), { stroke: "mark", width: 3 });
  }
});

describe("defineEffect", () => {
  it("fills in the kind and a clear() that does nothing", async () => {
    expect(trace.kind).toBe("geometry");
    expect(typeof trace.clear).toBe("function");
    const ctx = testContext();
    await play(ctx.clock, trace.run(mark, ctx));
    expect(() => trace.clear(ctx)).not.toThrow();
    expect(ctx.layer.picture()).toEqual([{ kind: "path", d: mark.slice(0, 1), paint: { stroke: "mark", width: 3 } }]);
  });

  it("keeps the spec's clear(), and only run, end and clear", () => {
    const clear = vi.fn();
    const spec = { run: async () => {}, end: () => {}, clear, extra: 1 };
    const effect = defineEffect(spec);
    expect(Object.keys(effect).sort()).toEqual(["clear", "end", "kind", "run"]);
    expect(effect.run).toBe(spec.run);
    effect.clear(testContext());
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("freezes the effect, since one effect runs on many marks", () => {
    expect(Object.isFrozen(trace)).toBe(true);
    expect(() => {
      (trace as { run: unknown }).run = null;
    }).toThrow(TypeError);
  });

  it("throws a TypeError without run or an end state", () => {
    const run = async (): Promise<void> => {};
    expect(() => defineEffect({ run } as never)).toThrow(/end must be a function.*reduced motion shows only end states/);
    expect(() => defineEffect({ end() {} } as never)).toThrow(/run must be a function/);
    expect(() => defineEffect({ run, end() {}, clear: 1 } as never)).toThrow(/clear must be a function/);
    expect(() => defineEffect(undefined as never)).toThrow(/needs a spec object/);
    for (const spec of [{ run }, null, { run, end: "end" }]) expect(() => defineEffect(spec as never)).toThrow(TypeError);
  });

  it("is a geometry effect", () => {
    expectTypeOf(trace).toEqualTypeOf<GeometryEffect>();
    expectTypeOf(trace).toExtend<EffectSlots<Team>["hover"]>();
  });
});

describe("defineDataEffect", () => {
  it("fills in the kind and clear(), and passes the mark's data", async () => {
    const seen: string[] = [];
    const effect = defineDataEffect<Region>({
      run: async (_m, d) => void seen.push(`run ${d.datum.region}`),
      end: (_m, d) => void seen.push(`end ${d.datum.region}`)
    });
    expect(effect.kind).toBe("data");
    expect(effect).not.toHaveProperty("needs");
    await effect.run(mark, data, testContext());
    effect.end(mark, data, testContext());
    expect(() => effect.clear(testContext())).not.toThrow();
    expect(seen).toEqual(["run North", "end North"]);
    expect(Object.isFrozen(effect)).toBe(true);
  });

  it("copies and freezes needs", () => {
    const related = ["xg"];
    const effect = defineDataEffect({ needs: { related }, run: async () => {}, end: () => {} });
    related.push("target");
    expect(effect.needs).toEqual({ related: ["xg"] });
    expect(Object.isFrozen(effect.needs)).toBe(true);
    expect(Object.isFrozen(effect.needs?.related)).toBe(true);
    expect(defineDataEffect({ needs: {}, run: async () => {}, end: () => {} })).not.toHaveProperty("needs");
  });

  it("throws a TypeError for a missing run or end, or needs that aren't series names", () => {
    const run = async (): Promise<void> => {};
    const end = (): void => {};
    expect(() => defineDataEffect({ run } as never)).toThrow(/defineDataEffect: end must be a function/);
    expect(() => defineDataEffect({ end } as never)).toThrow(/defineDataEffect: run must be a function/);
    for (const needs of [null, "xg", { related: "xg" }, { related: [""] }, { related: [1] }]) {
      expect(() => defineDataEffect({ needs, run, end } as never)).toThrow(TypeError);
    }
  });

  it("works in combinators beside geometry effects", async () => {
    const seen: string[] = [];
    const reader = defineDataEffect<Region>({ needs: { related: ["xg"] }, run: async (_m, d) => void seen.push(d.datum.region), end: () => {} });
    const story = sequence(trace, reader);
    expect(story.needs).toEqual({ related: ["xg"] });
    const ctx = testContext();
    await play(ctx.clock, story.run(mark, data, ctx));
    expect(seen).toEqual(["North"]);
    expect(ctx.layer.drawn).toHaveLength(1);
  });

  it("keeps the row type, as sketch 06 relies on", () => {
    const revenueOnly = defineDataEffect<Region>({ run: async (_m, d) => void d.datum.revenue, end: () => {} });
    expectTypeOf(revenueOnly).toEqualTypeOf<DataEffect<Region>>();
    // Inferred from the data parameter, too.
    expectTypeOf(defineDataEffect({ run: async (_m, _d: MarkData<Team>) => {}, end: () => {} })).toEqualTypeOf<DataEffect<Team>>();
    expectTypeOf(defineDataEffect({ run: async () => {}, end: () => {} })).toEqualTypeOf<DataEffect>();

    // A Region effect can't go on a chart of Team rows...
    expectTypeOf(revenueOnly).toExtend<EffectSlots<Region>["update"]>();
    expectTypeOf(revenueOnly).not.toExtend<EffectSlots<Team>["update"]>();
    // ...and combining it with a generic data effect doesn't launder that.
    expectTypeOf(sequence(revenueOnly, defineDataEffect({ run: async () => {}, end: () => {} }))).not.toExtend<EffectSlots<Team>["update"]>();
    // An effect that needs more fields than the rows have is rejected too.
    const needsMore = defineDataEffect<Region & { target: number }>({ run: async (_m, d) => void d.datum.target, end: () => {} });
    expectTypeOf(needsMore).not.toExtend<EffectSlots<Region>["update"]>();
  });

  it("checks the spec's functions against the row type strictly", () => {
    defineDataEffect<Region>({
      // @ts-expect-error Region rows have no target field, so a run that reads one is rejected.
      run: async (_m, _d: MarkData<Region & { target: number }>) => {},
      end: () => {}
    });
    defineDataEffect<Region>({
      run: async () => {},
      // @ts-expect-error the same for end().
      end: (_m, _d: MarkData<Team>) => {}
    });
  });
});
