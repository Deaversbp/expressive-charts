import type { DataEffect, GeometryEffect, MarkData, MarkGeometry, Sample } from "../core";
import { describe as build } from "../core";
import { flush, play, testContext } from "../core/testing";
import { fixtures, movedFixtures } from "../testing/fixtures";
import { threshold } from "./threshold";

const { line, bar, point } = fixtures;

/** Where each of the line fixture's vertices is along its walk, by distance. */
const legs = [Math.hypot(80, 40), Math.hypot(80, 30), Math.hypot(80, 70)];
const total = legs[0]! + legs[1]! + legs[2]!;
const [tA, tB] = [legs[0]! / total, (legs[0]! + legs[1]!) / total];
const vertices = [0, tA, tB, 1];

/** A mark's data: these samples, and related series by name. */
const dataOf = (samples: readonly Sample[], related: Record<string, readonly Sample[]> = {}): MarkData => ({
  datum: undefined,
  samples,
  related: (series) => (related[series] ? dataOf(related[series]!) : undefined)
});
/** One sample per value at these t's, with these ats if given. */
const samples = (ts: readonly number[], values: readonly number[], at?: readonly (number | Date)[]): Sample[] =>
  values.map((value, i) => ({ t: ts[i]!, value, ...(at ? { at: at[i]! } : {}) }));

/** What threshold draws on the mark, with its default paint at the mark's thickness. */
const runs = (mark: MarkGeometry, parts: readonly [number, number][], color = "negative") =>
  parts.map(([t0, t1]) => ({ kind: "path", d: mark.slice(t0, t1), paint: { stroke: color, width: mark.thickness, linecap: "butt" } }));

/** Runs the effect on the mark to the end and gives the picture. */
async function drawn(effect: DataEffect, mark: MarkGeometry, data: MarkData) {
  const ctx = testContext();
  await play(ctx.clock, effect.run(mark, data, ctx));
  return ctx.layer.picture();
}

/** Cuts the line fixture's goals: 2, 6, 3, 7 at its four vertices. */
const goals = samples(vertices, [2, 6, 3, 7], [1, 2, 3, 4]);

describe("threshold", () => {
  it("colours the walk where the values are below a constant, crossing exactly between samples", async () => {
    // 2 → 6 crosses 4.5 at 62.5% of the first leg, 6 → 3 at half the second, 3 → 7 at 37.5% of the third.
    expect(await drawn(threshold({ compareTo: 4.5 }), line, dataOf(goals))).toEqual(
      runs(line, [
        [0, 0.625 * tA],
        [tA + 0.5 * (tB - tA), tB + 0.375 * (1 - tB)]
      ])
    );
  });

  it("compares a related series by at, interpolating it between its samples", async () => {
    // xG walks its own line, so its t's differ from the goals line's; its at's are the same weeks.
    const xg = samples([0, 0.2, 0.7, 1], [4, 4, 5, 5], [1, 2, 3, 4]);
    // Goals minus xG: −2, 2, −2, 2, so every leg crosses halfway.
    expect(await drawn(threshold({ compareTo: "xg" }), line, dataOf(goals, { xg }))).toEqual(
      runs(line, [
        [0, 0.5 * tA],
        [tA + 0.5 * (tB - tA), tB + 0.5 * (1 - tB)]
      ])
    );
  });

  it("compares by at with Dates too, and colours nothing outside the reference's range", async () => {
    const week = (n: number): Date => new Date(Date.UTC(2026, 7, 1 + 7 * n));
    const dated = samples(vertices, [2, 6, 3, 7], [week(1), week(2), week(3), week(4)]);
    // Two samples, from halfway through week 1's leg to halfway through week 3's, always above the goals.
    const xg = samples([0, 1], [10, 10], [new Date((+week(1) + +week(2)) / 2), new Date((+week(3) + +week(4)) / 2)]);
    expect(await drawn(threshold({ compareTo: "xg" }), line, dataOf(dated, { xg }))).toEqual(runs(line, [[0.5 * tA, tB + 0.5 * (1 - tB)]]));
  });

  it("compares by t when the samples have no at, following the reference where it bends", async () => {
    // A bar from 0 to 10 against a reference that dips from 6 to 2 halfway: the bar is below it until 10t = 6 − 8t, t = 1/3.
    const reference = samples([0, 0.5, 1], [6, 2, 8]);
    const values = samples([0, 1], [0, 10]);
    expect(await drawn(threshold({ compareTo: "target" }), bar, dataOf(values, { target: reference }))).toEqual(runs(bar, [[0, 1 / 3]]));
    // One side with at and the other without: by t as well.
    const dated = samples([0, 1], [0, 10], [1, 2]);
    expect(await drawn(threshold({ compareTo: "target" }), bar, dataOf(dated, { target: reference }))).toEqual(runs(bar, [[0, 1 / 3]]));
  });

  it("follows a reference with fewer samples than the mark", async () => {
    // xG from 4 at week 1 to 7 at week 4: 4, 5, 6, 7 at the goals' weeks, so goals minus xG is −2, 1, −3, 0.
    const xg = samples([0, 1], [4, 7], [1, 4]);
    expect(await drawn(threshold({ compareTo: "xg" }), line, dataOf(goals, { xg }))).toEqual(
      runs(line, [
        [0, (2 / 3) * tA],
        [tA + 0.25 * (tB - tA), 1]
      ])
    );
  });

  it("colours above the reference with when: above, across a bar's full thickness", async () => {
    // A bar of 16 past a target of 10: the last 6/16 of its walk, square over its rounded tip.
    const effect = threshold({ compareTo: 10, when: "above", color: "series-1-strong" });
    expect(await drawn(effect, bar, dataOf(samples([0, 1], [0, 16])))).toEqual(runs(bar, [[10 / 16, 1]], "series-1-strong"));
    expect(await drawn(effect, bar, dataOf(samples([0, 1], [0, 8])))).toEqual([]);
  });

  it("doesn't colour equal values, even with float noise", async () => {
    // Level at 4 for the first leg, then below it.
    expect(await drawn(threshold({ compareTo: 4 }), line, dataOf(samples(vertices, [4, 4, 2, 4])))).toEqual(runs(line, [[tA, 1]]));
    const sum = 0.1 + 0.2; // 0.30000000000000004
    expect(await drawn(threshold({ compareTo: 0.3, when: "above" }), line, dataOf(samples([0, 1], [sum, sum])))).toEqual([]);
    expect(await drawn(threshold({ compareTo: 0.3 }), line, dataOf(samples([0, 1], [0.3, 0.3])))).toEqual([]);
  });

  it("draws nothing on a point, on a walk under 0.5 px, or without the related series", async () => {
    const values = dataOf(samples([0, 1], [0, 1]));
    expect(await drawn(threshold({ compareTo: 5 }), point, values)).toEqual([]);
    const tiny = build.line({ key: "goals", points: [{ x: 0, y: 0 }, { x: 0.4, y: 0 }], width: 2 });
    expect(await drawn(threshold({ compareTo: 5 }), tiny, values)).toEqual([]);
    expect(await drawn(threshold({ compareTo: "xg" }), line, values)).toEqual([]);
    expect(await drawn(threshold({ compareTo: 5 }), line, dataOf([]))).toEqual([]);
  });

  it("skips values that aren't finite", async () => {
    expect(await drawn(threshold({ compareTo: 4.5 }), line, dataOf(samples(vertices, [2, Number.NaN, 3, 7])))).toEqual(
      runs(line, [[tB, tB + 0.375 * (1 - tB)]])
    );
  });

  it("draws at once, with no frames, and end() draws the same picture", async () => {
    const effect = threshold({ compareTo: 4.5 });
    const ctx = testContext();
    const running = effect.run(line, dataOf(goals), ctx);
    expect(ctx.clock.idle).toBe(true);
    expect(ctx.layer.picture()).toHaveLength(2);
    await running;
    const ended = testContext({ mode: "off" });
    effect.end(line, dataOf(goals), ended);
    expect(ended.layer.picture()).toEqual(ctx.layer.picture());

    const aborted = testContext();
    aborted.abort();
    await effect.run(line, dataOf(goals), aborted);
    expect(aborted.layer.drawn).toEqual([]);
  });

  it("redraws on every change(), with the new geometry and data, reusing its paths", async () => {
    const moved = movedFixtures.line;
    const fifths = [0, 0.25, 0.5, 0.75, 1];
    for (const draw of ["run", "end"] as const) {
      const effect = threshold({ compareTo: 4.5 });
      const ctx = testContext();
      if (draw === "run") await play(ctx.clock, effect.run(line, dataOf(goals), ctx));
      else effect.end(line, dataOf(goals), ctx);

      // The line moves (a resize): the same runs on the new geometry.
      ctx.change(moved);
      const twoRuns = runs(moved, [
        [0, 0.625 * tA],
        [tA + 0.5 * (tB - tA), tB + 0.375 * (1 - tB)]
      ]);
      expect(ctx.layer.picture(), draw).toEqual(twoRuns);
      // New data with three runs below 4.5, then one, then none.
      ctx.change(moved, dataOf(samples(fifths, [3, 6, 3, 6, 3])));
      expect(ctx.layer.picture(), draw).toEqual(
        runs(moved, [
          [0, 0.125],
          [0.375, 0.625],
          [0.875, 1]
        ])
      );
      ctx.change(moved, dataOf(samples([0, 1], [0, 9])));
      expect(ctx.layer.picture(), draw).toEqual(runs(moved, [[0, 0.5]]));
      // Data given once stays until new data comes.
      ctx.change(line);
      expect(ctx.layer.picture(), draw).toEqual(runs(line, [[0, 0.5]]));
      ctx.change(line, dataOf(samples([0, 1], [5, 9])));
      expect(ctx.layer.picture(), draw).toEqual([]);
      expect(ctx.layer.calls.filter((call) => call.op === "path"), draw).toHaveLength(3);

      ctx.clear();
      ctx.change(line, dataOf(goals));
      await flush();
      expect(ctx.layer.drawn, draw).toEqual([]);
    }
  });

  it("checks its options when it's made", () => {
    expect(() => threshold({ compareTo: Number.NaN })).toThrow(new RangeError("threshold: compareTo must be a finite number or a series name, got NaN."));
    expect(() => threshold({ compareTo: "" })).toThrow(new RangeError('threshold: compareTo must be a finite number or a series name, got "".'));
    expect(() => threshold({ compareTo: Infinity })).toThrow(RangeError);
    expect(() => threshold(undefined as never)).toThrow(new RangeError("threshold: compareTo must be a finite number or a series name, got undefined."));
    expect(() => threshold({ compareTo: 1, when: "under" as never })).toThrow(new RangeError('threshold: when must be "below" or "above", got "under".'));
    expect(() => threshold({ compareTo: 1, color: "" })).toThrow(new RangeError('threshold: color must be a theme token or a CSS colour, got "".'));
    expect(() => threshold({ compareTo: 1, color: 3 as never })).toThrow(new RangeError("threshold: color must be a theme token or a CSS colour, got 3."));
    expect(() => threshold({ compareTo: -2, when: "above", color: "#c00" })).not.toThrow();
  });

  it("is a data effect that needs a series it's compared with", () => {
    const series = threshold({ compareTo: "xg" });
    expect(series.kind).toBe("data");
    expect(series.needs).toEqual({ related: ["xg"] });
    expect(Object.isFrozen(series.needs)).toBe(true);
    expect(Object.isFrozen(series.needs?.related)).toBe(true);
    expect(threshold({ compareTo: 10 })).not.toHaveProperty("needs");

    expectTypeOf(series).toEqualTypeOf<DataEffect>();
    expectTypeOf(series.kind).toEqualTypeOf<"data">();
    expectTypeOf(series.needs).toEqualTypeOf<{ readonly related?: readonly string[] } | undefined>();
    expectTypeOf(series).not.toExtend<GeometryEffect>();
    // It reads no row fields, so it fits a chart of any rows.
    expectTypeOf(series).toExtend<DataEffect<{ name: string; goals: number }>>();
  });
});

describe("threshold on gaps", () => {
  /** The samples with gapBefore on the ones at these indices. */
  const gapped = (values: readonly Sample[], ...after: number[]): Sample[] => values.map((sample, i) => (after.includes(i) ? { ...sample, gapBefore: true } : sample));
  // The line fixture's goals, with no value between the second vertex and the third.
  const broken = gapped(goals, 2);

  it("doesn't join the mark's samples across a gapBefore: nothing is coloured there", async () => {
    // As the first test, less the part of the second leg between its crossing and the third vertex, which the gap leaves without values.
    expect(await drawn(threshold({ compareTo: 4.5 }), line, dataOf(broken))).toEqual(
      runs(line, [
        [0, 0.625 * tA],
        [tB, tB + 0.375 * (1 - tB)]
      ])
    );
  });

  it("draws with slice() on a line with a gap, so the stroke's gap stays a gap", async () => {
    const mark = fixtures["gapped line"];
    expect(mark.gaps).toEqual([[tA, tB]]);
    const picture = await drawn(threshold({ compareTo: 4.5 }), mark, dataOf(broken));
    expect(picture).toEqual(runs(mark, [[0, 0.625 * tA], [tB, tB + 0.375 * (1 - tB)]]));
    // Without gapBefore, the samples would join across it, but slice() still leaves it out.
    expect(await drawn(threshold({ compareTo: 4.5 }), mark, dataOf(goals))).toEqual(runs(mark, [[0, 0.625 * tA], [tA + 0.5 * (tB - tA), tB + 0.375 * (1 - tB)]]));
    expect(mark.slice(tA + 0.5 * (tB - tA), tB + 0.375 * (1 - tB))).toBe(mark.slice(tB, tB + 0.375 * (1 - tB)));
  });

  it("puts no stations in a gap in the mark's samples, where the reference bends", async () => {
    // The reference peaks at 100 halfway through the gap: joined, the goals would be below it there.
    const reference = samples([0, tA, (tA + tB) / 2, tB, 1], [0, 0, 100, 0, 0]);
    const values = samples(vertices, [2, 6, 3, 7]);
    expect(await drawn(threshold({ compareTo: "target" }), line, dataOf(values, { target: reference }))).not.toEqual([]);
    expect(await drawn(threshold({ compareTo: "target" }), line, dataOf(gapped(values, 2), { target: reference }))).toEqual([]);
  });

  it("doesn't interpolate a related series across its own gapBefore: where it has no value, nothing is coloured", async () => {
    // As "compares a related series by at", with no xG between weeks 2 and 3: the second leg goes uncoloured.
    const xg = gapped(samples([0, 0.2, 0.7, 1], [4, 4, 5, 5], [1, 2, 3, 4]), 2);
    expect(await drawn(threshold({ compareTo: "xg" }), line, dataOf(goals, { xg }))).toEqual(
      runs(line, [
        [0, 0.5 * tA],
        [tB, tB + 0.5 * (1 - tB)]
      ])
    );
  });

  it("stops at a gap in the reference inside one of the mark's legs, and starts again after it", async () => {
    // A bar from 0 to 10, below a flat 6 until t = 0.6, with no reference from t = 0.2 to 0.4.
    const reference = gapped(samples([0, 0.2, 0.4, 1], [6, 6, 6, 6]), 2);
    const values = samples([0, 1], [0, 10]);
    expect(await drawn(threshold({ compareTo: "target" }), bar, dataOf(values, { target: reference }))).toEqual(
      runs(bar, [
        [0, 0.2],
        [0.4, 0.6]
      ])
    );
  });

  it("colours nothing where either has no value, with gaps in both", async () => {
    // Goals below a flat 10 everywhere, but no goals over the second leg and no reference over the third.
    const reference = gapped(samples(vertices, [10, 10, 10, 10], [1, 2, 3, 4]), 3);
    expect(await drawn(threshold({ compareTo: "xg" }), line, dataOf(broken, { xg: reference }))).toEqual(runs(line, [[0, tA]]));
  });

  it("follows a change() from a line without gaps to one with them", async () => {
    const ctx = testContext();
    const effect = threshold({ compareTo: 4.5 });
    await play(ctx.clock, effect.run(line, dataOf(goals), ctx));
    expect(ctx.layer.picture()).toEqual(runs(line, [[0, 0.625 * tA], [tA + 0.5 * (tB - tA), tB + 0.375 * (1 - tB)]]));
    ctx.change(fixtures["gapped line"], dataOf(broken));
    await flush();
    expect(ctx.layer.picture()).toEqual(runs(fixtures["gapped line"], [[0, 0.625 * tA], [tB, tB + 0.375 * (1 - tB)]]));
    expect(movedFixtures["gapped line"].gaps).toHaveLength(1);
  });
});
