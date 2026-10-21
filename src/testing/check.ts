// checkEffect: the conformance checks from plan §8 for one effect, on many marks. It imports no test
// runner: it runs every check on every mark, then throws one Error that lists each failure, so
// `await checkEffect(effect)` works in Vitest, Jest, node:test or Mocha.

import type { AnyMarkEffect, DataEffect, GeometryEffect, Icon, MarkData, MarkGeometry } from "../core";
import { describeValue, isMarkEffect } from "../core/registry";
import { flush, play, testContext, type TestContext, type TestContextOptions } from "../core/testing";
import { fixtures } from "./fixtures";

export interface CheckEffectOptions<D = unknown> {
  /**
   * The marks to check on: named, or a list such as a chart's `marks()` (each named by its key in the
   * report). Default: `fixtures`, every kind of mark.
   */
  readonly marks?: Readonly<Record<string, MarkGeometry>> | readonly MarkGeometry[];
  /** The icons the effect looks up by name, through `ctx.icons`. Default: none. */
  readonly icons?: readonly Icon[];
  /**
   * For a data effect, each mark's data. Default: no datum, values from 0 to 1 along the walk, and no
   * related series, so an effect that reads its rows or `needs` related series has to pass this.
   */
  readonly data?: (mark: MarkGeometry) => MarkData<D>;
  /** The mark's place among the marks of its event, for effects that read `ctx.batch` (stagger). Default: the only one. */
  readonly batch?: { readonly index: number; readonly count: number };
  /** What the report calls the effect. Default: "the effect". */
  readonly name?: string;
}

/** A data effect typed for its own rows: data(mark) has to give them. */
type WithData<D> = CheckEffectOptions<D> & { readonly data: (mark: MarkGeometry) => MarkData<D> };

/**
 * Runs the conformance checks on every mark (`options.marks`, or the fixtures):
 * 1. a full run ends with the same picture and mark style as `end()`;
 * 2. clearing leaves nothing drawn, the mark's own style, and no frames running;
 * 3. an abort mid-run settles the run (it resolves, without more frames) and clears to nothing;
 * 4. with motion off, no frames run and the run draws what `end()` draws.
 *
 * Resolves when every check passes. Otherwise it rejects with one Error that lists every failure:
 * the mark, the check and what differed. A data effect typed for its own rows needs `data`, and so
 * does one that `needs` related series.
 */
export function checkEffect(effect: GeometryEffect | DataEffect<unknown>, options?: CheckEffectOptions<unknown>): Promise<void>;
export function checkEffect<D>(effect: GeometryEffect | DataEffect<D>, options: WithData<D>): Promise<void>;
export async function checkEffect(effect: AnyMarkEffect, options: CheckEffectOptions<any> = {}): Promise<void> {
  if (!isMarkEffect(effect)) throw new TypeError(`checkEffect needs a mark effect (kind "geometry" or "data"), got ${describeValue(effect)}.`);
  const name = options.name ?? "the effect";
  const related = effect.kind === "data" ? (effect.needs?.related ?? []) : [];
  if (related.length > 0 && !options.data) {
    throw new TypeError(
      `checkEffect: ${name} needs the related series ${related.map((s) => `"${s}"`).join(", ")}, so pass data(mark) with them: the default data has no related series.`
    );
  }
  const marks = named(options.marks ?? fixtures);
  if (marks.length === 0) throw new TypeError("checkEffect: there are no marks to check on.");

  const failures: string[] = [];
  for (const [markName, mark] of marks) {
    let data: MarkData<unknown> | undefined;
    try {
      data = effect.kind === "data" ? (options.data ?? defaultData)(mark) : undefined;
    } catch (error) {
      failures.push(`on ${markName}: data(mark) threw ${describeError(error)}`);
      continue;
    }
    const subject: Subject = {
      effect,
      context: (more = {}) => testContext({ icons: options.icons, batch: options.batch, ...more }),
      run: (ctx) => {
        const running: unknown = effect.kind === "data" ? effect.run(mark, data!, ctx) : effect.run(mark, ctx);
        if (typeof (running as Promise<void> | undefined)?.then !== "function") throw new TypeError(`run() must return a promise, got ${describeValue(running)}.`);
        return running as Promise<void>;
      },
      end: (ctx) => (effect.kind === "data" ? effect.end(mark, data!, ctx) : effect.end(mark, ctx))
    };
    for (const check of CHECKS) {
      let problem: string | undefined;
      try {
        problem = await check.test(subject);
      } catch (error) {
        problem = `it threw ${describeError(error)}`;
      }
      if (problem) failures.push(`on ${markName}, ${check.title}: ${problem}`);
    }
  }

  if (failures.length > 0) {
    const count = failures.length === 1 ? "1 problem" : `${failures.length} problems`;
    throw new Error(`checkEffect found ${count} with ${name}:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  }
}

/** One effect on one mark, ready to run on fresh contexts. */
interface Subject {
  readonly effect: AnyMarkEffect;
  context(options?: TestContextOptions): TestContext;
  /** Starts a run; throws if run() doesn't return a promise. */
  run(ctx: TestContext): Promise<void>;
  end(ctx: TestContext): void;
}

interface Check {
  readonly title: string;
  /** What went wrong, or undefined. Throwing counts as a failure too. */
  test(subject: Subject): Promise<string | undefined>;
}

const CHECKS: readonly Check[] = [
  {
    title: "a full run should end with the same picture and mark style as end()",
    async test(subject) {
      const ran = subject.context();
      const run = track(subject.run(ran));
      await play(ran.clock, run.done);
      if (run.failed) return `run() rejected with ${describeError(run.error)}`;
      const ended = subject.context();
      subject.end(ended);
      return compare(ran, ended, "after the run");
    }
  },
  {
    title: "clearing should leave nothing behind",
    async test(subject) {
      const ctx = subject.context();
      const run = track(subject.run(ctx));
      await play(ctx.clock, run.done);
      subject.effect.clear(ctx);
      ctx.clear();
      // Nothing may come back afterwards, from a listener or a tween that outlived the run.
      ctx.clock.advance(48);
      await flush();
      return leftovers(ctx);
    }
  },
  {
    title: "an abort mid-run should settle the run and clear to nothing",
    async test(subject) {
      const ctx = subject.context();
      const run = track(subject.run(ctx));
      ctx.clock.advance(16);
      ctx.clock.advance(16);
      ctx.abort();
      await settle(run);
      if (!run.settled) return "run() was still running after the abort; it should resolve once ctx.signal aborts, without more frames";
      if (run.failed) return `run() rejected with ${describeError(run.error)} (it should resolve, aborted or not)`;
      subject.effect.clear(ctx);
      ctx.clear();
      return leftovers(ctx);
    }
  },
  {
    title: "with motion off, no frames should run and the end state should be drawn",
    async test(subject) {
      const ctx = subject.context({ mode: "off" });
      const run = track(subject.run(ctx));
      const framesAtStart = !ctx.clock.idle;
      await settle(run);
      if (!run.settled) return "run() didn't finish; with motion off ctx.tween() ends at once, so wait only through it, never on a timer";
      if (run.failed) return `run() rejected with ${describeError(run.error)}`;
      if (framesAtStart || !ctx.clock.idle) return "it asked for animation frames";
      const ended = subject.context({ mode: "off" });
      subject.end(ended);
      return compare(ctx, ended, "after the run with motion off");
    }
  }
];

/** No datum, values 0 to 1 along the walk, no related series. */
const defaultData = (): MarkData<unknown> => ({
  datum: undefined,
  samples: [
    { t: 0, value: 0 },
    { t: 1, value: 1 }
  ],
  related: () => undefined
});

function named(marks: Readonly<Record<string, MarkGeometry>> | readonly MarkGeometry[]): [string, MarkGeometry][] {
  if (!Array.isArray(marks)) return Object.entries(marks as Readonly<Record<string, MarkGeometry>>).map(([name, mark]) => [`the ${name}`, mark]);
  const seen = new Map<string, number>();
  return (marks as readonly MarkGeometry[]).map((mark) => {
    const count = (seen.get(mark.key) ?? 0) + 1;
    seen.set(mark.key, count);
    return [`mark "${mark.key}"${count > 1 ? ` (${count})` : ""}`, mark];
  });
}

interface Tracked {
  /** Resolves when the run settles, either way. */
  readonly done: Promise<void>;
  readonly settled: boolean;
  readonly failed: boolean;
  readonly error: unknown;
}

function track(running: Promise<void>): Tracked {
  const state = { settled: false, failed: false, error: undefined as unknown };
  const done = running.then(
    () => {
      state.settled = true;
    },
    (error: unknown) => {
      Object.assign(state, { settled: true, failed: true, error });
    }
  );
  return Object.assign(state, { done });
}

/** Lets promise callbacks run, with no frames, until the run settles or plainly won't. */
async function settle(run: Tracked): Promise<void> {
  for (let i = 0; i < 10 && !run.settled; i++) await flush();
}

/** What differs between two contexts' pictures and mark styles, or undefined. */
function compare(actual: TestContext, expected: TestContext, when: string): string | undefined {
  const problems: string[] = [];
  const drawn = actual.layer.picture();
  const wanted = expected.layer.picture();
  if (!same(drawn, wanted)) {
    const index = drawn.findIndex((item, i) => !same(item, wanted[i]));
    problems.push(
      drawn.length !== wanted.length
        ? `${drawn.length} ${drawn.length === 1 ? "item is" : "items are"} drawn ${when} but end() draws ${wanted.length} (${show(drawn)} vs ${show(wanted)})`
        : `item ${index + 1} drawn ${when} is ${show(drawn[index])} but end() draws ${show(wanted[index])}`
    );
  }
  const style = rounded(actual.mark.style);
  const wantedStyle = rounded(expected.mark.style);
  if (!same(style, wantedStyle)) problems.push(`the mark's style ${when} is ${show(style)} but end() leaves ${show(wantedStyle)}`);
  return problems.length > 0 ? problems.join("; ") : undefined;
}

/** What a cleared context still has: drawings, a mark style, running frames. */
function leftovers(ctx: TestContext): string | undefined {
  const problems: string[] = [];
  if (ctx.layer.drawn.length > 0) problems.push(`${show(ctx.layer.picture())} is still drawn`);
  if (Object.keys(ctx.mark.style).length > 0) problems.push(`the mark's style is still ${show(ctx.mark.style)}`);
  if (!ctx.clock.idle) problems.push("animation frames are still running");
  return problems.length > 0 ? problems.join("; ") : undefined;
}

/** Deep equality for plain data, ignoring key order. */
function same(a: unknown, b: unknown): boolean {
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a).filter((key) => (a as Record<string, unknown>)[key] !== undefined);
  const keysB = Object.keys(b).filter((key) => (b as Record<string, unknown>)[key] !== undefined);
  return keysA.length === keysB.length && keysA.every((key) => same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Numbers rounded to 0.001, as pictures are, so float noise in a style isn't a difference. */
function rounded(value: unknown): unknown {
  if (typeof value === "number") {
    const round = Math.round(value * 1000) / 1000;
    return round === 0 ? 0 : round;
  }
  if (Array.isArray(value)) return value.map(rounded);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, rounded(field)]));
  return value;
}

const LONGEST = 240;

function show(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > LONGEST ? `${text.slice(0, LONGEST - 1)}…` : text;
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : show(error);
}
