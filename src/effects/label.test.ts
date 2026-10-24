import type { DataEffect, MarkData, MarkGeometry } from "../core";
import { describe as build, easeInOutCubic } from "../core";
import { play, testContext, type DrawnText, type TestContext } from "../core/testing";
import { checkEffect } from "../testing";
import { captionPlace } from "./caption";
import { label } from "./label";

interface Slope {
  readonly name: string;
  readonly first: number;
  readonly last: number;
}

interface Shot {
  readonly outcome: string;
  readonly shots: number;
}

const line: MarkGeometry = build.line({ key: "Okafor", series: "Okafor", points: [{ x: 40, y: 200 }, { x: 260, y: 80 }], width: 2 });

/** A slope's data: its row, and its two values along the walk. */
function slope(first: number, last: number, name = "Okafor"): MarkData<Slope> {
  return {
    datum: { name, first, last },
    samples: [
      { t: 0, value: first },
      { t: 1, value: last }
    ],
    related: () => undefined
  };
}

/** Last value minus first, signed; none when they're equal. */
const change = (data: MarkData<Slope>): string | undefined => {
  const difference = data.datum.last - data.datum.first;
  return difference === 0 ? undefined : `${difference > 0 ? "+" : ""}${difference}`;
};

const texts = (ctx: TestContext): DrawnText[] => ctx.layer.drawn.filter((d): d is DrawnText => d.kind === "text");
const only = (ctx: TestContext): DrawnText => {
  const drawn = texts(ctx);
  expect(drawn).toHaveLength(1);
  return drawn[0]!;
};

describe("label", () => {
  it("draws text worked out from the mark's data past its end, rising into place as delta does", async () => {
    const ctx = testContext();
    const running = label(change).run(line, slope(3, 11), ctx);
    expect(only(ctx)).toMatchObject({ content: "+8", style: { anchor: captionPlace(line).anchor, color: "text", opacity: 0 } });
    ctx.clock.advance(200);
    expect(only(ctx).style.opacity).toBeCloseTo(easeInOutCubic(0.5), 9);
    expect(await play(ctx.clock, running, { frame: 100 })).toBe(200);
    expect(only(ctx)).toMatchObject({ content: "+8", style: { at: captionPlace(line).at, opacity: 1 } });
    expect(ctx.mark.calls).toEqual([]);
  });

  it("ends with the picture end() draws, and draws it at once with motion off", async () => {
    const ran = testContext();
    await play(ran.clock, label(change).run(line, slope(3, 11), ran));
    const ended = testContext();
    label(change).end(line, slope(3, 11), ended);
    expect(ran.layer.picture()).toEqual(ended.layer.picture());

    const off = testContext({ mode: "off" });
    const running = label(change).run(line, slope(3, 11), off);
    expect(off.clock.idle).toBe(true);
    await running;
    expect(off.layer.picture()).toEqual(ended.layer.picture());
  });

  it("gives text(data, mark) the mark too, and draws nothing for undefined or an empty text", async () => {
    const seen: string[] = [];
    const ctx = testContext({ mode: "off" });
    await label<Slope>((data, mark) => {
      seen.push(`${data.datum.name} ${mark.key}`);
      return "";
    }).run(line, slope(3, 11), ctx);
    await label(change).run(line, slope(4, 4), ctx);
    expect(seen).toEqual(["Okafor Okafor"]);
    expect(ctx.layer.calls).toEqual([]);
  });

  it("follows every change, its text worked out again from the new data", async () => {
    const ctx = testContext();
    const running = label(change).run(line, slope(3, 11), ctx);
    ctx.clock.advance(200);
    const moved = build.line({ key: "Okafor", series: "Okafor", points: [{ x: 40, y: 200 }, { x: 260, y: 140 }], width: 2 });
    ctx.change(moved, slope(3, 6));
    expect(only(ctx)).toMatchObject({ content: "+3", style: { opacity: easeInOutCubic(0.5) } });
    await play(ctx.clock, running);
    expect(only(ctx)).toMatchObject({ content: "+3", style: { at: captionPlace(moved).at, opacity: 1 } });
    // No change: the text goes. A change with no data keeps the words it had.
    ctx.change(line, slope(5, 5));
    expect(texts(ctx)).toEqual([]);
    ctx.change(line, slope(5, 2));
    expect(only(ctx)).toMatchObject({ content: "-3", style: { at: captionPlace(line).at, opacity: 1 } });
    ctx.change(moved);
    expect(only(ctx)).toMatchObject({ content: "-3", style: { at: captionPlace(moved).at } });
    // Still one text, made again only after it went.
    expect(ctx.layer.calls.filter((call) => call.op === "text")).toHaveLength(2);
  });

  it("takes its colour from its options", async () => {
    const ctx = testContext({ mode: "off" });
    await label(change, { color: "series-2" }).run(line, slope(1, 2), ctx);
    expect(only(ctx).style.color).toBe("series-2");
  });

  it("is typed by the rows it reads", () => {
    const slopes: DataEffect<Slope> = label(change);
    // Inferred from the function's own parameter.
    const shots = label((data: MarkData<Shot>) => `${data.datum.shots}`);
    // @ts-expect-error A label for shots is a type error where slopes are drawn.
    const wrong: DataEffect<Slope> = shots;
    // One that reads nothing of the row fits any chart.
    const any: DataEffect<Shot> = label((data) => `${data.samples.length}`);
    expect([slopes, wrong, any].every((effect) => effect.kind === "data")).toBe(true);
  });

  it("passes the conformance checks", async () => {
    await checkEffect(label((data) => `${data.samples[data.samples.length - 1]?.value ?? ""}`), { name: "label" });
    await checkEffect(label(change), { name: "label on slopes", data: () => slope(3, 11) });
    await checkEffect(label(() => undefined), { name: "label with no text" });
  });

  it("throws for arguments it can't use", () => {
    expect(() => label("+2" as never)).toThrow(new TypeError("label needs a function that returns the text from the mark's data, got string."));
    expect(() => label(change, { color: 3 as never })).toThrow(RangeError);
  });
});
