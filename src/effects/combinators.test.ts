import type { Combined, DataEffect, EffectContext, GeometryEffect, MarkData, MarkGeometry, TransitionEffect } from "../core";
import { describe as build, linear } from "../core";
import { play, testContext } from "../core/testing";
import { only, parallel, sequence } from "./combinators";

interface Region {
  region: string;
  revenue: number;
}
interface Team {
  team: string;
}

const mark = build.bar({ key: "North", series: "revenue", x: 0, y: 0, width: 100, height: 20, baseline: "left" });
const data: MarkData<Region> = { datum: { region: "North", revenue: 4 }, samples: [], related: () => undefined };

/** A geometry effect that logs what happens to it and takes `ms` to run. */
function step(name: string, log: string[], ms = 100): GeometryEffect {
  return {
    kind: "geometry",
    async run(_mark, ctx) {
      log.push(`${name} start`);
      const result = await ctx.tween({ duration: ms, ease: linear, update: () => {} }).finished;
      log.push(`${name} ${result}`);
    },
    end: () => void log.push(`${name} end`),
    clear: () => void log.push(`${name} clear`)
  };
}

function reader(name: string, log: string[], related?: string[]): DataEffect<Region> {
  return {
    kind: "data",
    ...(related ? { needs: { related } } : {}),
    run: async (_mark, d) => void log.push(`${name} run ${d.datum.region}`),
    end: (_mark, d) => void log.push(`${name} end ${d.datum.region}`),
    clear: () => void log.push(`${name} clear`)
  };
}

const runOn = (effect: GeometryEffect | DataEffect<Region>, ctx: EffectContext): Promise<void> =>
  effect.kind === "data" ? effect.run(mark, data, ctx) : effect.run(mark, ctx);

describe("combinator kinds", () => {
  it("is a data effect when any part is one, needing every part's related series", () => {
    const log: string[] = [];
    expect(sequence(step("a", log), step("b", log)).kind).toBe("geometry");
    const mixed = sequence(step("a", log), reader("r", log, ["xg"]), reader("s", log, ["xg", "target"]));
    expect(mixed.kind).toBe("data");
    expect(mixed.needs).toEqual({ related: ["xg", "target"] });
    expect(parallel(reader("r", log)).needs).toBeUndefined();
    expect(only("North", reader("r", log, ["xg"])).needs).toEqual({ related: ["xg"] });
  });

  it("carries kinds and row types through the types", () => {
    const log: string[] = [];
    expectTypeOf(sequence(step("a", log), step("b", log))).toEqualTypeOf<GeometryEffect>();
    expectTypeOf(parallel(step("a", log), reader("r", log))).toEqualTypeOf<DataEffect<Region>>();
    const team: DataEffect<Team> = { kind: "data", run: async () => {}, end: () => {}, clear: () => {} };
    expectTypeOf(sequence(reader("r", log), team)).toEqualTypeOf<Combined<[DataEffect<Region>, DataEffect<Team>]>>();
    expectTypeOf(only("North", reader("r", log))).toEqualTypeOf<DataEffect<Region>>();
    const morph = { kind: "transition" } as TransitionEffect;
    // Type-only: never called.
    const misuse = (): unknown =>
      // @ts-expect-error transition effects can't be combined with mark effects
      sequence(step("a", log), morph);
    expect(misuse).toBeTypeOf("function");
  });

  it("rejects parts that aren't mark effects", () => {
    const morph = { kind: "transition", run: async () => {}, end: () => {}, clear: () => {} } as unknown as GeometryEffect;
    expect(() => sequence(morph)).toThrow(/sequence: part 1 needs to be a mark effect .* a transition effect/);
    expect(() => parallel(step("a", []), {} as GeometryEffect)).toThrow(/parallel: part 2/);
    expect(() => only("North", null as unknown as GeometryEffect)).toThrow(TypeError);
    expect(() => only(3 as unknown as string, step("a", []))).toThrow(/key, a series name or a predicate/);
  });
});

describe("sequence", () => {
  it("runs the parts in order, giving data parts the data", async () => {
    const log: string[] = [];
    const ctx = testContext();
    const elapsed = await play(ctx.clock, runOn(sequence(step("a", log), reader("r", log), step("b", log, 50)), ctx), { frame: 10 });
    expect(log).toEqual(["a start", "a done", "r run North", "b start", "b done"]);
    expect(elapsed).toBe(150);
  });

  it("stops the chain on abort", async () => {
    const log: string[] = [];
    const ctx = testContext();
    const running = sequence(step("a", log), step("b", log)).run(mark, ctx);
    ctx.clock.advance(50);
    ctx.abort();
    await running;
    expect(log).toEqual(["a start", "a cancelled"]);
  });

  it("ends and clears every part, in order", () => {
    const log: string[] = [];
    const effect = sequence(step("a", log), reader("r", log), step("b", log));
    const ctx = testContext({ mode: "off" });
    effect.end(mark, data, ctx);
    effect.clear(ctx);
    expect(log).toEqual(["a end", "r end North", "b end", "a clear", "r clear", "b clear"]);
  });

  it("lets every part clean up when one throws, then passes the first error on", () => {
    const log: string[] = [];
    const broken: GeometryEffect = { ...step("x", log), clear: () => { throw new Error("x broke"); } };
    expect(() => sequence(broken, step("b", log)).clear(testContext())).toThrow("x broke");
    expect(log).toEqual(["b clear"]);
  });

  it("finishes at once with no parts", async () => {
    const ctx = testContext();
    await sequence().run(mark, ctx);
    expect(ctx.clock.idle).toBe(true);
  });
});

describe("parallel", () => {
  it("runs the parts together and finishes with the last", async () => {
    const log: string[] = [];
    const ctx = testContext();
    const elapsed = await play(ctx.clock, runOn(parallel(step("a", log, 100), step("b", log, 50), reader("r", log)), ctx), { frame: 10 });
    expect(log).toEqual(["a start", "b start", "r run North", "b done", "a done"]);
    expect(elapsed).toBe(100);
  });

  it("ends every part in order", () => {
    const log: string[] = [];
    parallel(step("a", log), step("b", log)).end(mark, testContext());
    expect(log).toEqual(["a end", "b end"]);
  });

  it("rejects when a part does", async () => {
    const failing: GeometryEffect = { ...step("x", []), run: async () => Promise.reject(new Error("no")) };
    const ctx = testContext();
    await expect(parallel(step("a", []), failing).run(mark, ctx)).rejects.toThrow("no");
  });
});

describe("only", () => {
  const other: MarkGeometry = build.bar({ key: "South", series: "costs", x: 0, y: 0, width: 100, height: 20, baseline: "left" });

  it("runs on marks matching a key, a series or a predicate, and does nothing elsewhere", async () => {
    for (const filter of ["North", "revenue", (m: MarkGeometry) => m.bounds.width > 50 && m.key.startsWith("N")]) {
      const log: string[] = [];
      const effect = only(filter, step("a", log, 0));
      await effect.run(mark, testContext());
      await effect.run(other, testContext());
      effect.end(mark, testContext());
      effect.end(other, testContext());
      expect(log).toEqual(["a start", "a done", "a end"]);
    }
  });

  it("keeps a data effect a data effect", async () => {
    const log: string[] = [];
    const effect = only("revenue", reader("r", log));
    expect(effect.kind).toBe("data");
    await effect.run(mark, data, testContext());
    await effect.run(other, data, testContext());
    effect.clear(testContext());
    expect(log).toEqual(["r run North", "r clear"]);
  });
});
