import type { DataEffect, GeometryEffect, Icon, MarkData, MarkGeometry } from "../core";
import { describe as build, linear } from "../core";
import { checkEffect, fixtures } from "./index";

/** A stroke along the walk that stays: a well-behaved effect. */
const trace: GeometryEffect = {
  kind: "geometry",
  async run(mark, ctx) {
    const stroke = ctx.layer.path(mark.slice(0, 0), { stroke: "mark", width: 3 });
    await ctx.tween({ duration: 300, timing: "effect", ease: linear, update: (p) => stroke.update(mark.slice(0, p)) }).finished;
  },
  end(mark, ctx) {
    ctx.layer.path(mark.slice(0, 1), { stroke: "mark", width: 3 });
  },
  clear() {}
};

/** The reason checkEffect rejected, or "passed". */
const outcome = (checking: Promise<void>): Promise<string> =>
  checking.then(
    () => "passed",
    (error: unknown) => (error instanceof Error ? error.message : String(error))
  );

const bar = build.bar({ key: "North", series: "revenue", x: 0, y: 0, width: 100, height: 20, baseline: "left" });

describe("checkEffect", () => {
  it("passes a well-behaved effect on every fixture", async () => {
    await expect(checkEffect(trace)).resolves.toBeUndefined();
  });

  it("lists every failure in one error: the effect, the mark, the check and the difference", async () => {
    // Ends at 0.5 opacity, but end() draws the stroke at full opacity.
    const fading: GeometryEffect = {
      ...trace,
      async run(mark, ctx) {
        const stroke = ctx.layer.path(mark.slice(0, 1), { stroke: "mark", opacity: 1 });
        await ctx.tween({ duration: 200, timing: "effect", update: (p) => stroke.update(mark.slice(0, 1), { opacity: 1 - p / 2 }) }).finished;
      },
      end(mark, ctx) {
        ctx.layer.path(mark.slice(0, 1), { stroke: "mark", opacity: 1 });
      }
    };
    const message = await outcome(checkEffect(fading, { name: "fade" }));
    const lines = message.split("\n");
    expect(lines[0]).toBe("checkEffect found 16 problems with fade:");
    expect(lines).toHaveLength(17);
    expect(lines[1]).toBe(
      `- on the bar, a full run should end with the same picture and mark style as end(): item 1 drawn after the run is ` +
        `{"kind":"path","d":"${fixtures.bar.slice(0, 1)}","paint":{"stroke":"mark","opacity":0.5}} but end() draws {"kind":"path","d":"${fixtures.bar.slice(0, 1)}","paint":{"stroke":"mark","opacity":1}}`
    );
    expect(lines[2]).toMatch(/^- on the bar, with motion off, no frames should run and the end state should be drawn: item 1 drawn after the run with motion off is .*"opacity":0\.5/);
    expect(lines.filter((line) => line.includes("on the point,"))).toHaveLength(2);
  });

  it("compares the mark's style too, ignoring float noise", async () => {
    const leaning: GeometryEffect = {
      kind: "geometry",
      run: async (_mark, ctx) => void (await ctx.tween({ duration: 100, update: (p) => ctx.mark.set({ opacity: 1 - p * 0.3000000001 }) }).finished),
      end: (_mark, ctx) => ctx.mark.set({ opacity: 0.7 }),
      clear() {}
    };
    await expect(checkEffect(leaning)).resolves.toBeUndefined();
    const short: GeometryEffect = { ...leaning, end: (_mark, ctx) => ctx.mark.set({ opacity: 0.6 }) };
    const message = await outcome(checkEffect(short, { marks: { bar } }));
    expect(message).toContain(`the mark's style after the run is {"opacity":0.7} but end() leaves {"opacity":0.6}`);
  });

  it("reports a run that never settles, and one that rejects when aborted", async () => {
    const stuck: GeometryEffect = { kind: "geometry", run: () => new Promise(() => {}), end() {}, clear() {} };
    const message = await outcome(checkEffect(stuck, { marks: { bar } }));
    expect(message).toContain("on the bar, a full run should end with the same picture and mark style as end(): it threw Error: play: still running after 10000 ms.");
    expect(message).toContain("on the bar, an abort mid-run should settle the run and clear to nothing: run() was still running after the abort");
    expect(message).toContain("on the bar, with motion off, no frames should run and the end state should be drawn: run() didn't finish");

    const rejecting: GeometryEffect = {
      ...trace,
      async run(_mark, ctx) {
        await ctx.tween({ duration: 300, update: () => {} }).finished;
        if (ctx.signal.aborted) throw new Error("aborted");
      }
    };
    expect(await outcome(checkEffect({ ...rejecting, end() {} }, { marks: { bar } }))).toBe(
      "checkEffect found 1 problem with the effect:\n- on the bar, an abort mid-run should settle the run and clear to nothing: run() rejected with Error: aborted (it should resolve, aborted or not)"
    );
  });

  it("reports drawing that comes back after clearing", async () => {
    // Draws once its tween ends, even when that's because the run was cleared.
    const late: GeometryEffect = {
      kind: "geometry",
      async run(mark, ctx) {
        void ctx.tween({ duration: 100, update: () => {} }).finished.then(() => ctx.layer.path(mark.slice(0, 1), {}));
      },
      end() {},
      clear() {}
    };
    const message = await outcome(checkEffect(late, { marks: { bar } }));
    expect(message).toContain(`on the bar, clearing should leave nothing behind: [{"kind":"path","d":"${bar.slice(0, 1)}","paint":{}}] is still drawn`);
  });

  it("reports a run() that doesn't return a promise, and an effect that throws", async () => {
    const sync = { ...trace, run: () => undefined } as unknown as GeometryEffect;
    expect(await outcome(checkEffect(sync, { marks: { bar } }))).toContain("on the bar, a full run should end with the same picture and mark style as end(): it threw TypeError: run() must return a promise, got undefined.");
    const throwing: GeometryEffect = { ...trace, end: () => {
      throw new RangeError("no end");
    } };
    expect(await outcome(checkEffect(throwing, { marks: { bar } }))).toContain("it threw RangeError: no end");
  });

  it("names marks given as a list by their keys", async () => {
    const twin = build.bar({ key: "North", series: "revenue", x: 0, y: 30, width: 50, height: 20, baseline: "left" });
    const broken: GeometryEffect = { ...trace, end() {} };
    const message = await outcome(checkEffect(broken, { marks: [bar, twin] }));
    expect(message).toContain('- on mark "North", a full run');
    expect(message).toContain('- on mark "North" (2), a full run');
  });

  it("gives the effect the icons and batch it's told to", async () => {
    const dot: Icon = { name: "dot", shapes: [], box: { x: -2, y: -2, width: 4, height: 4 }, size: 4, anchor: { x: 0, y: 0 }, pivot: { x: 0, y: 0 }, footprint: [2, 2] };
    const seen: string[] = [];
    const looking: GeometryEffect = {
      kind: "geometry",
      run: async (_mark, ctx) => void seen.push(`${ctx.icons.get("dot")?.name} ${ctx.batch.index}/${ctx.batch.count}`),
      end() {},
      clear() {}
    };
    await checkEffect(looking, { marks: { bar }, icons: [dot], batch: { index: 2, count: 5 } });
    expect(seen).toEqual(["dot 2/5", "dot 2/5", "dot 2/5", "dot 2/5"]);
    await checkEffect(looking, { marks: { bar } });
    expect(seen.slice(4)).toEqual(["undefined 0/1", "undefined 0/1", "undefined 0/1", "undefined 0/1"]);
  });

  it("rejects what isn't a mark effect, and an empty list of marks", async () => {
    await expect(checkEffect({ kind: "transition" } as never)).rejects.toThrow(/checkEffect needs a mark effect.*transition effect/);
    await expect(checkEffect(trace, { marks: [] })).rejects.toThrow("checkEffect: there are no marks to check on.");
  });

  it("needs no test runner: it works with the runner's globals gone", async () => {
    const globals = ["expect", "vi", "vitest", "it", "test", "describe", "suite", "assert", "chai", "expectTypeOf", "assertType", "beforeEach", "afterEach", "beforeAll", "afterAll"];
    const saved = globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const name of globals) Reflect.deleteProperty(globalThis, name);
    const left = globals.filter((name) => name in globalThis);
    let passed: string;
    let failed: string;
    try {
      passed = await outcome(checkEffect(trace));
      failed = await outcome(checkEffect({ ...trace, end() {} }, { marks: { bar } }));
    } finally {
      for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    }
    expect(left).toEqual([]);
    expect(passed).toBe("passed");
    expect(failed).toMatch(/^checkEffect found 2 problems with the effect:/);
  });
});

describe("checkEffect on data effects", () => {
  interface Region {
    region: string;
    revenue: number;
  }

  /** A label with the mark's last value, beside its end. */
  const label: DataEffect = {
    kind: "data",
    async run(mark, data, ctx) {
      const value = data.samples[data.samples.length - 1]?.value ?? 0;
      const text = ctx.layer.text(String(value), { at: mark.end, opacity: 0 });
      await ctx.tween({ duration: 200, update: (p) => text.update({ opacity: p }) }).finished;
    },
    end(mark, data, ctx) {
      ctx.layer.text(String(data.samples[data.samples.length - 1]?.value ?? 0), { at: mark.end, opacity: 1 });
    },
    clear() {}
  };

  it("makes each mark's data when none is given: no datum, values from 0 to 1, no related series", async () => {
    const seen: MarkData[] = [];
    const recording: DataEffect = { ...label, run: async (_mark, data) => void seen.push(data), end: (_mark, data) => void seen.push(data) };
    await checkEffect(recording, { marks: { bar } });
    expect(seen).toHaveLength(6);
    expect(seen[0]).toMatchObject({ datum: undefined, samples: [{ t: 0, value: 0 }, { t: 1, value: 1 }] });
    expect(seen[0]!.related("goals")).toBeUndefined();
    await expect(checkEffect(label)).resolves.toBeUndefined();
  });

  it("takes each mark's data from data(mark)", async () => {
    const rows: Record<string, Region> = { North: { region: "North", revenue: 12 } };
    const regional: DataEffect<Region> = {
      ...label,
      run: async (mark, data, ctx) => void ctx.layer.text(data.datum.region, { at: mark.end }),
      end: (mark, data, ctx) => void ctx.layer.text(data.datum.region, { at: mark.end })
    };
    const data = (mark: MarkGeometry): MarkData<Region> => ({ datum: rows[mark.key]!, samples: [], related: () => undefined });
    await expect(checkEffect(regional, { marks: [bar], data })).resolves.toBeUndefined();
    expect(await outcome(checkEffect(regional, { marks: [bar, fixtures.slice], data }))).toContain(`- on mark "Saved", a full run should end with the same picture and mark style as end(): run() rejected with TypeError`);
    // @ts-expect-error an effect typed for Region rows needs data(mark) to give them.
    void checkEffect(regional).catch(() => {});
  });

  it("asks for data(mark) when the effect needs related series", async () => {
    const reader: DataEffect = { ...label, needs: { related: ["xg", "target"] } };
    await expect(checkEffect(reader, { name: "reader" })).rejects.toThrow(
      'checkEffect: reader needs the related series "xg", "target", so pass data(mark) with them: the default data has no related series.'
    );
    const related = (series: string): MarkData | undefined => ({ datum: undefined, samples: [{ t: 1, value: series.length }], related: () => undefined });
    await expect(checkEffect(reader, { data: () => ({ datum: undefined, samples: [], related }) })).resolves.toBeUndefined();
  });

  it("reports data(mark) throwing as a failure for that mark", async () => {
    const message = await outcome(
      checkEffect(label, {
        marks: { bar },
        data: () => {
          throw new Error("no row");
        }
      })
    );
    expect(message).toBe("checkEffect found 1 problem with the effect:\n- on the bar: data(mark) threw Error: no row");
  });
});

describe("fixtures", () => {
  it("has one of each kind of mark, frozen", () => {
    expect(Object.keys(fixtures)).toEqual(["bar", "negative bar", "column", "stacked", "short bar", "slice", "line", "point"]);
    expect(Object.isFrozen(fixtures)).toBe(true);
    expect(fixtures.stacked.segments?.map((segment) => segment.series)).toEqual(["goals", "assists"]);
    expect(fixtures.point.length).toBe(0);
  });
});
