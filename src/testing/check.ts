// checkEffect and checkTransition: the conformance checks from plan §8 for one effect, on many marks
// or pairs of marks. They import no test runner: each runs every check on every mark, then throws one
// Error that lists each failure, so `await checkEffect(effect)` works in Vitest, Jest, node:test or Mocha.

import type { AnyMarkEffect, DataEffect, GeometryEffect, Icon, MarkData, MarkGeometry, TransitionContext, TransitionEffect } from "../core";
import { describeValue, isMarkEffect } from "../core/registry";
import { flush, play, testContext, type Picture, type TestContext, type TestContextOptions } from "../core/testing";
import { isTransitionEffect } from "../core/transition";
import { fixturePairs, fixtures, movedFixtures, type FixtureName } from "./fixtures";

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
  /**
   * The same mark moved (a resize, a transition's next frame): another geometry with the same key, for
   * the check that the effect follows `onChange`. Undefined skips that check on the mark. Default:
   * each fixture's moved twin, and nothing for other marks, so a page's own marks pass this or skip it.
   */
  readonly moved?: (mark: MarkGeometry) => MarkGeometry | undefined;
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
 * 4. with motion off, no frames run and the run draws what `end()` draws;
 * 5. after a full run, and after `end()`, a `change()` to the moved mark (`options.moved`) leaves the
 *    picture and mark style `end()` draws on it, so an effect that should stay attached follows `onChange`.
 *
 * Resolves when every check passes. Otherwise it rejects with one Error that lists every failure:
 * the mark, the check and what differed. A data effect typed for its own rows needs `data`, and so
 * does one that `needs` related series.
 */
export function checkEffect(effect: GeometryEffect | DataEffect<unknown>, options?: CheckEffectOptions<unknown>): Promise<void>;
export function checkEffect<D>(effect: GeometryEffect | DataEffect<D>, options: WithData<D>): Promise<void>;
export async function checkEffect(effect: AnyMarkEffect, options: CheckEffectOptions<any> = {}): Promise<void> {
  if (!isMarkEffect(effect)) {
    const hint = isTransitionEffect(effect) ? "; check it with checkTransition" : "";
    throw new TypeError(`checkEffect needs a mark effect (kind "geometry" or "data"), got ${describeValue(effect)}${hint}.`);
  }
  const name = options.name ?? "the effect";
  const related = effect.kind === "data" ? (effect.needs?.related ?? []) : [];
  if (related.length > 0 && !options.data) {
    throw new TypeError(
      `checkEffect: ${name} needs the related series ${related.map((s) => `"${s}"`).join(", ")}, so pass data(mark) with them: the default data has no related series.`
    );
  }
  const marks = named(options.marks ?? fixtures);
  if (marks.length === 0) throw new TypeError("checkEffect: there are no marks to check on.");

  const dataOf = (mark: MarkGeometry): MarkData<unknown> | undefined => (effect.kind === "data" ? (options.data ?? defaultData)(mark) : undefined);
  const failures: string[] = [];
  for (const [markName, mark] of marks) {
    let data: MarkData<unknown> | undefined;
    try {
      data = dataOf(mark);
    } catch (error) {
      failures.push(`on ${markName}: data(mark) threw ${describeError(error)}`);
      continue;
    }
    let moved: Moved | undefined;
    try {
      moved = movedSubject(effect, (options.moved ?? movedFixture)(mark), dataOf);
    } catch (error) {
      failures.push(`on ${markName}: the moved mark, or its data, threw ${describeError(error)}`);
    }
    const subject: Subject = {
      context: (more = {}) => testContext({ icons: options.icons, batch: options.batch, ...more }),
      run: (ctx) => promised(effect.kind === "data" ? effect.run(mark, data!, ctx) : effect.run(mark, ctx)),
      end: (ctx) => (effect.kind === "data" ? effect.end(mark, data!, ctx) : effect.end(mark, ctx)),
      clear: (ctx) => effect.clear(ctx),
      moved
    };
    for (const check of CHECKS) {
      const problem = await attempt(check, subject);
      if (problem) failures.push(`on ${markName}, ${check.title}: ${problem}`);
    }
  }

  if (failures.length > 0) throw new Error(`checkEffect found ${problems(failures)} with ${name}:\n${list(failures)}`);
}

export interface CheckTransitionOptions {
  /**
   * The pairs to check on, each as [a, b] and run both ways: named, or a list (each named by its
   * marks' keys in the report). Default: `fixturePairs`, a slice and a column, a bar and a column,
   * two slices, two lines and two points.
   */
  readonly pairs?: Readonly<Record<string, readonly [MarkGeometry, MarkGeometry]>> | readonly (readonly [MarkGeometry, MarkGeometry])[];
  /** The icons the effect looks up by name, through `ctx.icons`. Default: none. */
  readonly icons?: readonly Icon[];
  /** What the report calls the effect. Default: "the effect". */
  readonly name?: string;
}

/** Where the retrace check compares a run forward with a run back. */
const RETRACE_AT: readonly number[] = [0.25, 0.5, 0.75];

/**
 * Runs the conformance checks for a transition effect on every pair (`options.pairs`, or the fixture
 * pairs), from a to b and from b to a:
 * 1. a full run ends with the same picture as `end()`;
 * 2. clearing leaves nothing drawn and no frames running;
 * 3. an abort mid-run settles the run (it resolves, without more frames) and clears to nothing;
 * 4. with motion off, no frames run and the run draws what `end()` draws;
 * 5. a run from `start: 0.5` ends with the same picture as `end()`;
 * 6. it retraces: at p = 0.25, 0.5 and 0.75, a run from b to a from `start: 1 - p` begins with the
 *    picture a run from a to b begins with from `start: p`, the picture a full run draws at p. So a
 *    switch back mid-way doesn't jump, and a pairing that depends on which mark is `from` fails.
 *
 * Resolves when every check passes. Otherwise it rejects with one Error that lists every failure:
 * the pair, which way, the check and what differed.
 */
export async function checkTransition(effect: TransitionEffect, options: CheckTransitionOptions = {}): Promise<void> {
  if (!isTransitionEffect(effect)) {
    const hint = isMarkEffect(effect) ? "; check it with checkEffect" : "";
    throw new TypeError(`checkTransition needs a transition effect (kind "transition" with run, end and clear), got ${describeTransition(effect)}${hint}.`);
  }
  const name = options.name ?? "the effect";
  const pairs = namedPairs(options.pairs ?? fixturePairs);
  if (pairs.length === 0) throw new TypeError("checkTransition: there are no pairs to check on.");

  const failures: string[] = [];
  for (const [pairName, [a, b]] of pairs) {
    for (const [way, from, to] of [["a to b", a, b], ["b to a", b, a]] as const) {
      for (const check of COMMON) {
        const problem = await attempt(check, transitionSubject(effect, from, to, 0, options.icons));
        if (problem) failures.push(`on ${pairName}, ${way}, ${check.title}: ${problem}`);
      }
      const problem = await attempt(FULL_RUN, transitionSubject(effect, from, to, 0.5, options.icons));
      if (problem) failures.push(`on ${pairName}, ${way}, a run from start: 0.5 should end with the same picture as end(): ${problem}`);
    }
    let problem: string | undefined;
    try {
      problem = await retraces(effect, a, b, options.icons);
    } catch (error) {
      problem = `it threw ${describeError(error)}`;
    }
    if (problem) failures.push(`on ${pairName}, a run back should retrace the run forward: ${problem}`);
  }

  if (failures.length > 0) throw new Error(`checkTransition found ${problems(failures)} with ${name}:\n${list(failures)}`);
}

/** A test context that is also a transition's, starting at `start`. */
type TransitionTestContext = TestContext & TransitionContext;

function transitionContext(start: number, options: TestContextOptions): TransitionTestContext {
  return { ...testContext(options), start };
}

/** One transition effect on one pair, one way, from `start`, as a Subject. Its contexts carry `start`. */
function transitionSubject(effect: TransitionEffect, from: MarkGeometry, to: MarkGeometry, start: number, icons: readonly Icon[] | undefined): Subject {
  return {
    context: (more = {}) => transitionContext(start, { icons, ...more }),
    run: (ctx) => promised(effect.run(from, to, ctx as TransitionTestContext)),
    end: (ctx) => effect.end(from, to, ctx as TransitionTestContext),
    clear: (ctx) => effect.clear(ctx as TransitionTestContext),
    moved: undefined
  };
}

/** What a run from `start` draws before its first frame, after which it's aborted and cleared. */
async function opening(effect: TransitionEffect, from: MarkGeometry, to: MarkGeometry, start: number, icons: readonly Icon[] | undefined): Promise<Picture[]> {
  const ctx = transitionContext(start, { icons });
  const run = track(promised(effect.run(from, to, ctx)));
  await flush();
  const picture = ctx.layer.picture();
  ctx.abort();
  await settle(run);
  effect.clear(ctx);
  ctx.clear();
  if (run.failed) throw run.error;
  return picture;
}

/** The retrace check (6): what differs between a run back from 1 - p and a run forward from p, or undefined. */
async function retraces(effect: TransitionEffect, a: MarkGeometry, b: MarkGeometry, icons: readonly Icon[] | undefined): Promise<string | undefined> {
  for (const p of RETRACE_AT) {
    const forward = await opening(effect, a, b, p, icons);
    const back = await opening(effect, b, a, 1 - p, icons);
    if (same(back, forward)) continue;
    const index = back.findIndex((item, i) => !same(item, forward[i]));
    const what =
      back.length !== forward.length
        ? `${back.length} ${back.length === 1 ? "item" : "items"} (${show(back)}) where the run from a to b from start: ${p} begins with ${forward.length} (${show(forward)})`
        : `item ${index + 1} unlike the run from a to b from start: ${p}: ${difference(back[index], forward[index])}`;
    return `the run from b to a from start: ${1 - p} begins with ${what}`;
  }
  return undefined;
}

/** How a drawn item differs from another: its first differing field, and for long text the part where they part. */
function difference(actual: unknown, expected: unknown): string {
  if (typeof actual !== "object" || typeof expected !== "object" || actual === null || expected === null) return `${show(actual)}, not ${show(expected)}`;
  const a = actual as Record<string, unknown>;
  const b = expected as Record<string, unknown>;
  for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[field];
    const y = b[field];
    if (same(x, y)) continue;
    if (typeof x !== "string" || typeof y !== "string") return `its ${field} is ${show(x)}, not ${show(y)}`;
    let at = 0;
    while (at < x.length && x[at] === y[at]) at++;
    const from = Math.max(0, at - 24);
    const part = (text: string): string => `${from > 0 ? "…" : ""}${text.slice(from, at + 24)}${at + 24 < text.length ? "…" : ""}`;
    return `its ${field} parts at character ${at + 1}: ${JSON.stringify(part(x))}, not ${JSON.stringify(part(y))}`;
  }
  return `${show(actual)}, not ${show(expected)}`;
}

function namedPairs(
  pairs: Readonly<Record<string, readonly [MarkGeometry, MarkGeometry]>> | readonly (readonly [MarkGeometry, MarkGeometry])[]
): [string, readonly [MarkGeometry, MarkGeometry]][] {
  if (!Array.isArray(pairs)) return Object.entries(pairs as Readonly<Record<string, readonly [MarkGeometry, MarkGeometry]>>).map(([name, pair]) => [`the ${name}`, pair]);
  return (pairs as readonly (readonly [MarkGeometry, MarkGeometry])[]).map((pair, i) => {
    const [a, b] = pair;
    const keys = a?.key === b?.key ? `"${String(a?.key)}"` : `"${String(a?.key)}" and "${String(b?.key)}"`;
    return [`pair ${i + 1} (${keys})`, pair];
  });
}

function describeTransition(value: unknown): string {
  if (typeof value !== "object" || value === null) return value === null ? "null" : typeof value;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "geometry" || kind === "data") return `a ${kind} effect, which plays on one mark`;
  if (kind === "transition") return "a transition effect without run(), end() and clear()";
  return kind === undefined ? "an object with no kind" : `an effect of kind ${JSON.stringify(kind)}`;
}

/** One effect on one mark (or one pair), ready to run on fresh contexts. */
interface Subject {
  context(options?: TestContextOptions): TestContext;
  /** Starts a run; throws if run() doesn't return a promise. */
  run(ctx: TestContext): Promise<void>;
  end(ctx: TestContext): void;
  /** The effect's own clear(). */
  clear(ctx: TestContext): void;
  /** The mark moved, for the onChange check; undefined skips it. */
  readonly moved: Moved | undefined;
}

/** A check's problem on the subject, or undefined; throwing counts as one. */
async function attempt(check: Check, subject: Subject): Promise<string | undefined> {
  try {
    return await check.test(subject);
  } catch (error) {
    return `it threw ${describeError(error)}`;
  }
}

/** run()'s result, which must be a promise. */
function promised(running: unknown): Promise<void> {
  if (typeof (running as Promise<void> | undefined)?.then !== "function") throw new TypeError(`run() must return a promise, got ${describeValue(running)}.`);
  return running as Promise<void>;
}

const problems = (failures: readonly string[]): string => (failures.length === 1 ? "1 problem" : `${failures.length} problems`);
const list = (failures: readonly string[]): string => failures.map((failure) => `- ${failure}`).join("\n");

/** The moved mark, with its data. */
interface Moved {
  /** Tells the run's onChange listeners the mark moved, with its data there, as the runner does. */
  change(ctx: TestContext): void;
  /** end() on the moved mark. */
  end(ctx: TestContext): void;
}

/** The moved twin of a fixture (the same object, whatever it is named); nothing for other marks. */
function movedFixture(mark: MarkGeometry): MarkGeometry | undefined {
  const name = (Object.keys(fixtures) as FixtureName[]).find((fixture) => fixtures[fixture] === mark);
  return name === undefined ? undefined : movedFixtures[name];
}

function movedSubject(effect: AnyMarkEffect, mark: MarkGeometry | undefined, dataOf: (mark: MarkGeometry) => MarkData<unknown> | undefined): Moved | undefined {
  if (mark === undefined) return undefined;
  const data = dataOf(mark);
  return {
    change: (ctx) => ctx.change(mark, data),
    end: (ctx) => (effect.kind === "data" ? effect.end(mark, data!, ctx) : effect.end(mark, ctx))
  };
}

interface Check {
  readonly title: string;
  /** What went wrong, or undefined. Throwing counts as a failure too. */
  test(subject: Subject): Promise<string | undefined>;
}

const FULL_RUN: Check = {
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
};

/** The checks for every kind of effect: checkEffect's first four, which checkTransition runs too. */
const COMMON: readonly Check[] = [
  FULL_RUN,
  {
    title: "clearing should leave nothing behind",
    async test(subject) {
      const ctx = subject.context();
      const run = track(subject.run(ctx));
      await play(ctx.clock, run.done);
      subject.clear(ctx);
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
      subject.clear(ctx);
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

const CHECKS: readonly Check[] = [
  ...COMMON,
  {
    title: "a change() to the moved mark should leave what end() draws on it",
    async test(subject) {
      const { moved } = subject;
      if (!moved) return undefined;
      const problems: string[] = [];

      const ran = subject.context();
      const run = track(subject.run(ran));
      await play(ran.clock, run.done);
      if (run.failed) return `run() rejected with ${describeError(run.error)}`;
      moved.change(ran);
      if (!(await finish(ran))) return "it was still animating 10 s after the change()";
      const ended = subject.context();
      moved.end(ended);
      const afterRun = compare(ran, ended, "after a full run and a change()");
      if (afterRun) problems.push(afterRun);

      // With motion off the runner draws end() instead of running, and changes still come.
      const still = subject.context({ mode: "off" });
      subject.end(still);
      moved.change(still);
      await flush();
      const endedOff = subject.context({ mode: "off" });
      moved.end(endedOff);
      const afterEnd = compare(still, endedOff, "after end() and a change()");
      if (afterEnd) problems.push(afterEnd);
      return problems.length > 0 ? problems.join("; ") : undefined;
    }
  }
];

/** Runs frames until nothing animates (an effect may ease to the new geometry); false if it's still going after 10 s. */
async function finish(ctx: TestContext): Promise<boolean> {
  await flush();
  for (let elapsed = 0; !ctx.clock.idle; elapsed += 16) {
    if (elapsed >= 10_000) return false;
    ctx.clock.advance(16);
    await flush();
  }
  return true;
}

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
