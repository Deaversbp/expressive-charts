import type { DataEffect, EffectContext, GeometryEffect, Icon, MarkData, MarkGeometry, Point, TransitionContext, TransitionEffect } from "../core";
import { describe as build, linear } from "../core";
import { movedFixtures } from "./fixtures";
import { checkEffect, checkTransition, fixturePairs, fixtures } from "./index";

/** Draws a stroke along the walk up to progress p, following the mark when it moves. */
function stroke(mark: MarkGeometry, ctx: EffectContext): (p: number) => void {
  let current = mark;
  let progress = 0;
  const path = ctx.layer.path(mark.slice(0, 0), { stroke: "mark", width: 3 });
  ctx.onChange((next) => {
    current = next;
    path.update(current.slice(0, progress));
  });
  return (p) => {
    progress = p;
    path.update(current.slice(0, p));
  };
}

/** A stroke along the walk that stays and follows the mark: a well-behaved effect. */
const trace: GeometryEffect = {
  kind: "geometry",
  async run(mark, ctx) {
    await ctx.tween({ duration: 300, timing: "effect", ease: linear, update: stroke(mark, ctx) }).finished;
  },
  end(mark, ctx) {
    stroke(mark, ctx)(1);
  },
  clear() {}
};

/** The same stroke drawn once, ignoring onChange: it stays where the mark was. */
const stuck: GeometryEffect = {
  kind: "geometry",
  async run(mark, ctx) {
    const path = ctx.layer.path(mark.slice(0, 0), { stroke: "mark", width: 3 });
    await ctx.tween({ duration: 300, timing: "effect", ease: linear, update: (p) => path.update(mark.slice(0, p)) }).finished;
  },
  end(mark, ctx) {
    ctx.layer.path(mark.slice(0, 1), { stroke: "mark", width: 3 });
  },
  clear() {}
};

/** Where a dot is p of the way from one point to another, weighted on both sides so a run back lands on the same numbers. */
const between = (a: Point, b: Point, p: number): Point => ({ x: a.x * (1 - p) + b.x * p, y: a.y * (1 - p) + b.y * p });

/** A dot sliding from `from` to `to` along `route`, from ctx.start. */
function sliding(route: (from: MarkGeometry, to: MarkGeometry) => [Point, Point]): TransitionEffect {
  return {
    kind: "transition",
    async run(from, to, ctx) {
      const [a, b] = route(from, to);
      const dot = ctx.layer.text("•", { at: between(a, b, ctx.start) });
      await ctx.tween({ duration: 300, ease: linear, update: (k) => dot.update({ at: between(a, b, ctx.start + (1 - ctx.start) * k) }) }).finished;
    },
    end(from, to, ctx) {
      ctx.layer.text("•", { at: route(from, to)[1] });
    },
    clear() {}
  };
}

/** A dot from one mark's centre to the other's: a well-behaved transition. */
const slide = sliding((from, to) => [from.center, to.center]);

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
    // Three checks fail on each of the nine fixtures: the full run, motion off, and the change() after them.
    expect(lines[0]).toBe("checkEffect found 27 problems with fade:");
    expect(lines).toHaveLength(28);
    expect(lines[1]).toBe(
      `- on the bar, a full run should end with the same picture and mark style as end(): item 1 drawn after the run is ` +
        `{"kind":"path","d":"${fixtures.bar.slice(0, 1)}","paint":{"stroke":"mark","opacity":0.5}} but end() draws {"kind":"path","d":"${fixtures.bar.slice(0, 1)}","paint":{"stroke":"mark","opacity":1}}`
    );
    expect(lines[2]).toMatch(/^- on the bar, with motion off, no frames should run and the end state should be drawn: item 1 drawn after the run with motion off is .*"opacity":0\.5/);
    expect(lines[3]).toMatch(/^- on the bar, a change\(\) to the moved mark should leave what end\(\) draws on it: item 1 drawn after a full run and a change\(\) is /);
    expect(lines.filter((line) => line.includes("on the point,"))).toHaveLength(3);
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

  it("checks that a full run, and end(), follow a change() to the moved mark", async () => {
    const message = await outcome(checkEffect(stuck, { name: "stuck" }));
    const lines = message.split("\n");
    expect(lines[0]).toBe("checkEffect found 9 problems with stuck:");
    const was = `{"kind":"path","d":"${fixtures.bar.slice(0, 1)}","paint":{"stroke":"mark","width":3}}`;
    const now = `{"kind":"path","d":"${movedFixtures.bar.slice(0, 1)}","paint":{"stroke":"mark","width":3}}`;
    expect(lines[1]).toBe(
      `- on the bar, a change() to the moved mark should leave what end() draws on it: ` +
        `item 1 drawn after a full run and a change() is ${was} but end() draws ${now}; item 1 drawn after end() and a change() is ${was} but end() draws ${now}`
    );

    // Following onChange in run() alone isn't enough: with motion off the runner draws end() instead, and the mark still moves.
    const runOnly: GeometryEffect = { ...trace, end: stuck.end };
    const reasons = (await outcome(checkEffect(runOnly, { marks: { line: fixtures.line } }))).split("\n");
    expect(reasons).toHaveLength(2);
    expect(reasons[1]).toMatch(/^- on the line, a change\(\) to the moved mark should leave what end\(\) draws on it: item 1 drawn after end\(\) and a change\(\) is /);
  });

  it("waits for an effect that eases to the moved mark", async () => {
    // Moves the stroke to the moved mark 200 ms after the change, then rests there.
    const gliding: GeometryEffect = {
      ...trace,
      async run(mark, ctx) {
        const path = ctx.layer.path(mark.slice(0, 1), { stroke: "mark", width: 3 });
        ctx.onChange((next) => {
          void ctx.tween({ duration: 200, update: (p) => path.update((p < 1 ? mark : next).slice(0, 1)) });
        });
      },
      end(mark, ctx) {
        const path = ctx.layer.path(mark.slice(0, 1), { stroke: "mark", width: 3 });
        ctx.onChange((next) => path.update(next.slice(0, 1)));
      }
    };
    await expect(checkEffect(gliding)).resolves.toBeUndefined();
    const endless: GeometryEffect = {
      ...gliding,
      async run(mark, ctx) {
        ctx.layer.path(mark.slice(0, 1), { stroke: "mark", width: 3 });
        ctx.onChange(() => void ctx.tween({ duration: 20_000, update: () => {} }));
      }
    };
    expect(await outcome(checkEffect(endless, { marks: { bar: fixtures.bar } }))).toBe(
      "checkEffect found 1 problem with the effect:\n- on the bar, a change() to the moved mark should leave what end() draws on it: it was still animating 10 s after the change()"
    );
  });

  it("skips the change() check on a page's own marks unless moved(mark) gives them moved", async () => {
    expect(await outcome(checkEffect(stuck, { marks: [bar] }))).toBe("passed");
    const resized = build.bar({ key: "North", series: "revenue", x: 0, y: 0, width: 80, height: 16, baseline: "left" });
    const moved = vi.fn((mark: MarkGeometry) => (mark.key === "North" ? resized : undefined));
    const was = `{"kind":"path","d":"${bar.slice(0, 1)}","paint":{"stroke":"mark","width":3}}`;
    const now = `{"kind":"path","d":"${resized.slice(0, 1)}","paint":{"stroke":"mark","width":3}}`;
    expect(await outcome(checkEffect(stuck, { marks: [bar, fixtures.point], moved }))).toBe(
      "checkEffect found 1 problem with the effect:\n" +
        `- on mark "North", a change() to the moved mark should leave what end() draws on it: ` +
        `item 1 drawn after a full run and a change() is ${was} but end() draws ${now}; item 1 drawn after end() and a change() is ${was} but end() draws ${now}`
    );
    // moved(mark) replaces the fixtures' twins: the point gets none, so it's skipped.
    expect(moved.mock.calls.map(([mark]) => mark.key)).toEqual(["North", "p"]);
    // A fixture keeps its twin whatever it's named.
    expect(await outcome(checkEffect(stuck, { marks: { mine: fixtures.point } }))).toMatch(/^checkEffect found 1 problem with the effect:\n- on the mine, a change\(\) to the moved mark/);
    const broken = () => {
      throw new Error("no twin");
    };
    expect(await outcome(checkEffect(stuck, { marks: [bar], moved: broken }))).toBe(
      'checkEffect found 1 problem with the effect:\n- on mark "North": the moved mark, or its data, threw Error: no twin'
    );
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
    await expect(checkEffect(slide as never)).rejects.toThrow(/transition effect, .*; check it with checkTransition\.$/);
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

  const last = (data: MarkData): string => String(data.samples[data.samples.length - 1]?.value ?? 0);

  /** A label with the mark's last value, beside its end, following the mark and its data. */
  const label: DataEffect = {
    kind: "data",
    async run(mark, data, ctx) {
      const text = ctx.layer.text(last(data), { at: mark.end, opacity: 0 });
      ctx.onChange((next, nextData) => text.update({ at: next.end }, last(nextData ?? data)));
      await ctx.tween({ duration: 200, update: (p) => text.update({ opacity: p }) }).finished;
    },
    end(mark, data, ctx) {
      const text = ctx.layer.text(last(data), { at: mark.end, opacity: 1 });
      ctx.onChange((next, nextData) => text.update({ at: next.end }, last(nextData ?? data)));
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

  it("gives change() and end() the moved mark's data", async () => {
    const values = new Map([
      [fixtures.line, 4],
      [movedFixtures.line, 9]
    ]);
    const data = (mark: MarkGeometry): MarkData => ({ datum: undefined, samples: [{ t: 1, value: values.get(mark)! }], related: () => undefined });
    await expect(checkEffect(label, { marks: { line: fixtures.line }, data })).resolves.toBeUndefined();
    // Reading the data only once keeps the 4 where the moved mark has 9.
    const once: DataEffect = {
      ...label,
      run: async (mark, data, ctx) => {
        const text = ctx.layer.text(last(data), { at: mark.end, opacity: 1 });
        ctx.onChange((next) => text.update({ at: next.end }));
      }
    };
    expect(await outcome(checkEffect(once, { marks: { line: fixtures.line }, data }))).toContain(
      `item 1 drawn after a full run and a change() is {"kind":"text","content":"4","style":{"at":{"x":256,"y":40},"opacity":1}} but end() draws {"kind":"text","content":"9"`
    );
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

describe("checkTransition", () => {
  const column = fixtures.column;
  const dot: Icon = { name: "dot", shapes: [], box: { x: -2, y: -2, width: 4, height: 4 }, size: 4, anchor: { x: 0, y: 0 }, pivot: { x: 0, y: 0 }, footprint: [2, 2] };
  /** As pictures round. */
  const round = (value: number): number => Math.round(value * 1000) / 1000;

  it("passes a well-behaved transition on every fixture pair, both ways", async () => {
    await expect(checkTransition(slide)).resolves.toBeUndefined();
  });

  it("gives runs start: 0, start: 0.5 and the retrace check's starts, with icons", async () => {
    const starts = new Set<number>();
    const seen = new Set<string>();
    const looking: TransitionEffect = {
      ...slide,
      run: (from, to, ctx) => {
        starts.add(ctx.start);
        seen.add(`${ctx.icons.get("dot")?.name} ${ctx.batch.index}/${ctx.batch.count}`);
        return slide.run(from, to, ctx);
      }
    };
    await checkTransition(looking, { pairs: { mine: [fixtures.bar, column] }, icons: [dot] });
    expect([...starts].sort()).toEqual([0, 0.25, 0.5, 0.75]);
    expect([...seen]).toEqual(["dot 0/1"]);
  });

  it("fails a transition that ignores start: a switch back would jump", async () => {
    const replaying: TransitionEffect = { ...slide, run: (from, to, ctx) => slide.run(from, to, { ...ctx, start: 0 } as TransitionContext) };
    const message = await outcome(checkTransition(replaying, { name: "replay" }));
    const lines = message.split("\n");
    expect(lines[0]).toBe("checkTransition found 5 problems with replay:");
    expect(lines[1]).toBe(
      `- on the slice and column, a run back should retrace the run forward: the run from b to a from start: 0.75 begins with item 1 unlike the run from a to b ` +
        `from start: 0.25: its style is {"at":{"x":10,"y":75}}, not {"at":{"x":${round(fixtures.slice.center.x)},"y":${round(fixtures.slice.center.y)}}}`
    );
  });

  it("fails a pairing that depends on which mark is from", async () => {
    // From's start to to's end: the run back pairs the other ends, so it twists.
    const crossed = sliding((from, to) => [from.start, to.end]);
    const message = await outcome(checkTransition(crossed));
    // Every pair but the two points, whose walks start where they end.
    expect(message.split("\n")[0]).toBe("checkTransition found 4 problems with the effect:");
    expect(message).not.toContain("the two points");
    expect(message).toContain("- on the two lines, a run back should retrace the run forward: the run from b to a from start: 0.75 begins with item 1 unlike");
  });

  it("runs checkEffect's four checks each way, and a run from start: 0.5", async () => {
    // Stops short of the end, from wherever it starts.
    const short: TransitionEffect = {
      ...slide,
      async run(from, to, ctx) {
        const dot = ctx.layer.text("•", { at: between(from.center, to.center, ctx.start) });
        await ctx.tween({ duration: 300, ease: linear, update: (k) => dot.update({ at: between(from.center, to.center, ctx.start + (0.9 - ctx.start) * k) }) }).finished;
      }
    };
    const message = await outcome(checkTransition(short, { pairs: [[fixtures.bar, column]] }));
    expect(message.split("\n").map((line) => line.replace(/: item 1 .*$/, ""))).toEqual([
      "checkTransition found 6 problems with the effect:",
      `- on pair 1 ("Okafor" and "c"), a to b, a full run should end with the same picture and mark style as end()`,
      `- on pair 1 ("Okafor" and "c"), a to b, with motion off, no frames should run and the end state should be drawn`,
      `- on pair 1 ("Okafor" and "c"), a to b, a run from start: 0.5 should end with the same picture as end()`,
      `- on pair 1 ("Okafor" and "c"), b to a, a full run should end with the same picture and mark style as end()`,
      `- on pair 1 ("Okafor" and "c"), b to a, with motion off, no frames should run and the end state should be drawn`,
      `- on pair 1 ("Okafor" and "c"), b to a, a run from start: 0.5 should end with the same picture as end()`
    ]);
    // A pair of one mark is named once.
    expect(await outcome(checkTransition(short, { pairs: [[column, movedFixtures.column]] }))).toContain(`- on pair 1 ("c"), a to b, a full run`);
  });

  it("reports a run that throws, and a run that doesn't return a promise", async () => {
    const throwing: TransitionEffect = {
      ...slide,
      run() {
        throw new Error("no shape");
      }
    };
    const message = await outcome(checkTransition(throwing, { pairs: { mine: [fixtures.bar, column] } }));
    expect(message.split("\n")).toHaveLength(12);
    expect(message).toContain("- on the mine, a to b, clearing should leave nothing behind: it threw Error: no shape");
    expect(message).toContain("- on the mine, a run back should retrace the run forward: it threw Error: no shape");
    const sync = { ...slide, run: () => undefined } as unknown as TransitionEffect;
    expect(await outcome(checkTransition(sync, { pairs: { mine: [fixtures.bar, column] } }))).toContain("it threw TypeError: run() must return a promise, got undefined.");
  });

  it("rejects what isn't a transition effect, and an empty list of pairs", async () => {
    await expect(checkTransition(trace as never)).rejects.toThrow(
      'checkTransition needs a transition effect (kind "transition" with run, end and clear), got a geometry effect, which plays on one mark; check it with checkEffect.'
    );
    await expect(checkTransition({ kind: "transition" } as never)).rejects.toThrow(/got a transition effect without run\(\), end\(\) and clear\(\)\.$/);
    await expect(checkTransition(slide, { pairs: [] })).rejects.toThrow("checkTransition: there are no pairs to check on.");
    await expect(checkTransition(slide, { pairs: {} })).rejects.toThrow("checkTransition: there are no pairs to check on.");
  });
});

describe("fixtures", () => {
  it("has the pairs checkTransition runs on, made of fixtures and their moved twins, frozen", () => {
    expect(Object.keys(fixturePairs)).toEqual(["slice and column", "bar and column", "two slices", "two lines", "two points"]);
    expect(Object.isFrozen(fixturePairs)).toBe(true);
    expect(fixturePairs["slice and column"]).toEqual([fixtures.slice, fixtures.column]);
    expect(fixturePairs["two slices"]).toEqual([fixtures.slice, movedFixtures.slice]);
    expect(fixturePairs["two points"][1]).toBe(movedFixtures.point);
  });

  it("has one of each kind of mark, frozen", () => {
    expect(Object.keys(fixtures)).toEqual(["bar", "negative bar", "column", "stacked", "short bar", "slice", "line", "gapped line", "point"]);
    expect(Object.isFrozen(fixtures)).toBe(true);
    expect(fixtures.stacked.segments?.map((segment) => segment.series)).toEqual(["goals", "assists"]);
    expect(fixtures.point.length).toBe(0);
    expect(fixtures.line.gaps).toBeUndefined();
    expect(fixtures["gapped line"].gaps).toHaveLength(1);
    expect(movedFixtures["gapped line"].gaps).toHaveLength(1);
  });

  it("has a moved twin of each: the same key and series, somewhere else", () => {
    expect(Object.keys(movedFixtures)).toEqual(Object.keys(fixtures));
    expect(Object.isFrozen(movedFixtures)).toBe(true);
    for (const [name, mark] of Object.entries(fixtures)) {
      const twin = movedFixtures[name as keyof typeof fixtures];
      expect(twin.key, name).toBe(mark.key);
      expect(twin.series, name).toBe(mark.series);
      expect(twin.segments?.map((segment) => segment.series), name).toEqual(mark.segments?.map((segment) => segment.series));
      expect(twin.slice(0, 1), name).not.toBe(mark.slice(0, 1));
      expect(twin.thickness > 0, name).toBe(true);
    }
    expect(movedFixtures.point.length).toBe(0);
  });
});
