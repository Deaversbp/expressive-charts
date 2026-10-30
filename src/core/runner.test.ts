import { manualClock } from "./clock";
import type { MarkData } from "./contracts/data";
import type { MarkStyle } from "./contracts/drawing";
import type { DataEffect, EffectContext, GeometryEffect } from "./contracts/effect";
import type { MarkGeometry, Rect } from "./contracts/geometry";
import type { Icon } from "./contracts/icon";
import { linear } from "./easing";
import { describe as build } from "./geometry";
import { createMotion, type MotionMode, type ReducedMotionSource } from "./motion";
import { report } from "./report";
import { createRunner, type SlotEffects } from "./runner";
import { estimatedBox } from "./text-box";
import { recordingSurface } from "./testing";

vi.mock("./report", () => ({ report: vi.fn() }));

beforeEach(() => {
  vi.mocked(report).mockClear();
});

interface Row {
  readonly value: number;
}

const dot: Icon = {
  name: "dot",
  shapes: [{ d: "M0,-4A4,4 0 0 1 0,4A4,4 0 0 1 0,-4Z" }],
  box: { x: -4, y: -4, width: 8, height: 8 },
  size: 8,
  anchor: { x: 0, y: 0 },
  pivot: { x: 0, y: 0 },
  footprint: [4, 4]
};

const bar = (key: string, width = 100): MarkGeometry => build.bar({ key, series: "goals", x: 0, y: 0, width, height: 20, baseline: "left" });

const dataOf = (value: number, previous?: MarkData<Row>): MarkData<Row> => ({
  datum: { value },
  samples: [{ t: 1, value }],
  related: () => undefined,
  ...(previous ? { previous } : {})
});

const input = (key: string, width = 100) => ({ mark: bar(key, width), data: dataOf(width) });

/** Lets pending promise callbacks run: effects resolving, and the runner noticing. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A reduced-motion setting the test can flip. */
function reducedMotion(): ReducedMotionSource & { set(matches: boolean): void; readonly listening: number } {
  let matches = false;
  const listeners = new Set<() => void>();
  return {
    get matches() {
      return matches;
    },
    get listening() {
      return listeners.size;
    },
    subscribe(listener) {
      const entry = (): void => listener();
      listeners.add(entry);
      return () => listeners.delete(entry);
    },
    set(next) {
      matches = next;
      for (const listener of [...listeners]) listener();
    }
  };
}

function setup<D = unknown>(effects: SlotEffects<D>, mode: MotionMode = "presentation") {
  const clock = manualClock();
  const reduced = reducedMotion();
  const motion = createMotion({ mode, reducedMotion: reduced });
  const surface = recordingSurface();
  const runner = createRunner<D>({ effects, surface, motion, clock, icons: { get: (name) => (name === "dot" ? dot : undefined) } });
  return { clock, reduced, motion, surface, runner };
}

interface Probe extends GeometryEffect {
  /** Every call, tagged with the run it belongs to: "run a #0", "cancelled a #0", "clear #0", "end a #1". */
  readonly log: string[];
  readonly contexts: EffectContext[];
  readonly marks: MarkGeometry[];
}

/**
 * Draws the walk over `duration` ms and sets `style`, logging every call. Its end state is the same
 * picture: the whole walk drawn, `style` set. Listens for changes in both run() and end().
 */
function probe(style: MarkStyle = { emphasis: 1 }, duration = 100): Probe {
  const log: string[] = [];
  const contexts: EffectContext[] = [];
  const marks: MarkGeometry[] = [];
  const begin = (mark: MarkGeometry, ctx: EffectContext): string => {
    const tag = `#${contexts.length}`;
    contexts.push(ctx);
    marks.push(mark);
    ctx.onChange((moved) => log.push(`change ${moved.key} ${moved.length} ${tag}`));
    ctx.mark.set(style);
    return tag;
  };
  return {
    kind: "geometry",
    log,
    contexts,
    marks,
    async run(mark, ctx) {
      const tag = begin(mark, ctx);
      log.push(`run ${mark.key} ${tag}`);
      const stroke = ctx.layer.path(mark.slice(0, 0), { stroke: "mark" });
      const result = await ctx.tween({ duration, timing: "effect", ease: linear, update: (p) => stroke.update(mark.slice(0, p)) }).finished;
      log.push(`${result} ${mark.key} ${tag}`);
    },
    end(mark, ctx) {
      const tag = begin(mark, ctx);
      log.push(`end ${mark.key} ${tag}`);
      ctx.layer.path(mark.slice(0, 1), { stroke: "mark" });
    },
    clear(ctx) {
      log.push(`clear #${contexts.indexOf(ctx)}`);
    }
  };
}

/** The picture a probe leaves on a mark, finished or ended. */
const walked = (mark: MarkGeometry) => ({ kind: "path", d: mark.slice(0, 1), paint: { stroke: "mark" } });

/** Sets a style and does nothing else. */
const styler = (style: MarkStyle): GeometryEffect => ({
  kind: "geometry",
  async run(_mark, ctx) {
    ctx.mark.set(style);
  },
  end(_mark, ctx) {
    ctx.mark.set(style);
  },
  clear() {}
});

describe("createRunner", () => {
  describe("contexts", () => {
    it("gives each run its own context", async () => {
      const hover = probe();
      const { runner, clock, surface } = setup({ hover });
      runner.hover([input("a"), input("b")]);

      const [a, b] = hover.contexts;
      expect(a).not.toBe(b);
      expect(a!.signal).not.toBe(b!.signal);
      expect(a!.signal.aborted).toBe(false);
      expect(a!.motion.mode).toBe("presentation");
      expect(a!.batch).toEqual({ index: 0, count: 2 });
      expect(b!.batch).toEqual({ index: 1, count: 2 });
      expect(a!.icons.get("dot")).toBe(dot);
      expect(a).not.toHaveProperty("previous");
      expect(surface.groups.map((group) => [group.key, group.slot])).toEqual([
        ["a", "hover"],
        ["b", "hover"]
      ]);

      clock.advance(50);
      expect(surface.picture("a")).toEqual([{ kind: "path", d: bar("a").slice(0, 0.5), paint: { stroke: "mark" } }]);
      clock.advance(50);
      await flush();
      expect(hover.log).toEqual(["run a #0", "run b #1", "done a #0", "done b #1"]);
      expect(clock.idle).toBe(true);
      // A finished run stays drawn until it's cleared.
      expect(surface.picture("a")).toEqual([walked(bar("a"))]);
      expect(surface.mark("a").style).toEqual({ emphasis: 1 });
    });

    it("binds tweens to the run, including ones given their own signal", async () => {
      const results: Promise<string>[] = [];
      const hover: GeometryEffect = {
        kind: "geometry",
        async run(_mark, ctx) {
          results.push(ctx.tween({ duration: 100, update: () => {} }).finished);
          results.push(ctx.tween({ duration: 100, signal: new AbortController().signal, update: () => {} }).finished);
        },
        end() {},
        clear() {}
      };
      const { runner } = setup({ hover });
      runner.hover([input("a")]);
      runner.leave();
      await expect(Promise.all(results)).resolves.toEqual(["cancelled", "cancelled"]);
    });

    it("stacks overlay groups in run order, however late a run first draws", () => {
      const decorate: GeometryEffect = {
        kind: "geometry",
        async run(_mark, ctx) {
          ctx.onChange((moved) => ctx.layer.path(moved.slice(0, 1), { stroke: "negative" }));
        },
        end() {},
        clear() {}
      };
      const hover: GeometryEffect = {
        kind: "geometry",
        async run(mark, ctx) {
          ctx.layer.path(mark.slice(0, 1), { stroke: "mark" });
        },
        end() {},
        clear() {}
      };
      const { runner, surface } = setup({ decorate, hover });
      runner.enter([input("a")]);
      runner.hover([input("a")]);
      runner.change(bar("a", 80));
      expect(surface.groups.map((group) => `${group.slot} ${group.order}`)).toEqual(["hover 2", "decorate 1"]);
      expect(surface.picture("a").map((drawn) => ("paint" in drawn ? drawn.paint.stroke : undefined))).toEqual(["negative", "mark"]);
    });

    it("asks for a run's overlay group only when the run draws", () => {
      const { runner, surface } = setup({ hover: styler({ opacity: 0.5 }) });
      runner.hover([input("a")]);
      expect(surface.groups).toEqual([]);
      expect(surface.mark("a").style).toEqual({ opacity: 0.5 });
    });

    it("gives data effects the mark's data, and geometry effects only the geometry", async () => {
      const xg = dataOf(3);
      const data: MarkData<Row> = { ...dataOf(5), related: (series) => (series === "xg" ? xg : undefined) };
      const seen: unknown[] = [];
      const decorate: DataEffect<Row> = {
        kind: "data",
        run: async (_mark, given, ctx) => {
          seen.push(given.datum.value, given.related("xg"));
          ctx.onChange((_moved, changed) => seen.push(changed));
        },
        end: () => {},
        clear: () => {}
      };
      const hover = { kind: "geometry" as const, run: vi.fn(async (_mark: MarkGeometry, _ctx: EffectContext) => {}), end: vi.fn(), clear: vi.fn() };
      const { runner } = setup<Row>({ decorate, hover });
      const mark = bar("a");
      runner.enter([{ mark, data }]);
      runner.hover([{ mark, data }]);
      expect(seen).toEqual([5, xg]);
      expect(hover.run.mock.calls[0]).toHaveLength(2);
      expect(hover.run.mock.calls[0]![0]).toBe(mark);

      // onChange listeners get the data given with the change, or else the latest data seen.
      const revealed = dataOf(6);
      runner.change(bar("a", 90), revealed);
      runner.change(bar("a", 80));
      expect(seen.slice(2)).toEqual([revealed, revealed]);
    });
  });

  describe("one run per mark and slot", () => {
    it("clears the previous run before re-triggering: abort, clear(), layer, mark style, listeners", async () => {
      const hover = probe();
      const { runner, clock, surface } = setup({ hover });
      runner.hover([input("a")]);
      clock.advance(50);
      runner.hover([input("a")]);

      expect(hover.contexts[0]!.signal.aborted).toBe(true);
      expect(hover.log).toEqual(["run a #0", "clear #0", "run a #1"]);
      expect(surface.groups.map((group) => group.cleared)).toEqual([true, false]);
      expect(surface.picture()).toEqual([{ kind: "path", d: bar("a").slice(0, 0), paint: { stroke: "mark" } }]);
      expect(surface.mark("a").calls).toEqual([{ op: "set", style: { emphasis: 1 } }, { op: "reset" }, { op: "set", style: { emphasis: 1 } }]);

      runner.change(bar("a", 80));
      expect(hover.log.slice(3)).toEqual(["change a 80 #1"]);
      await flush();
      expect(hover.log).toContain("cancelled a #0");
    });

    it("runs other slots and other marks independently", () => {
      const hover = probe();
      const decorate = probe({ halo: { width: 4, opacity: 0.5 } });
      const { runner, surface } = setup({ hover, decorate });
      runner.enter([input("a"), input("b")]);
      runner.hover([input("a"), input("b")]);
      runner.leave(["a"]);
      expect(hover.log).toEqual(["run a #0", "run b #1", "clear #0"]);
      expect(decorate.log).toEqual(["run a #0", "run b #1"]);
      expect(surface.groups.filter((group) => !group.cleared).map((group) => `${group.slot} ${group.key}`)).toEqual([
        "decorate a",
        "decorate b",
        "hover b"
      ]);
    });

    it("ignores the completion of a run that was replaced (race: re-hover mid-run)", async () => {
      const hover = probe();
      const { runner, clock, motion } = setup({ hover });
      runner.hover([input("a")]);
      clock.advance(10);
      runner.hover([input("a")]);
      await flush(); // run #0 resolves now, after it was replaced
      // Run #1 is still going, so turning motion off replaces it with end().
      motion.chooseMode("off");
      expect(hover.log).toEqual(["run a #0", "clear #0", "run a #1", "cancelled a #0", "clear #1", "end a #2"]);
    });
  });

  describe("reduced motion", () => {
    it("calls end() instead of run() when the effective mode is off, with no frames", async () => {
      const hover = probe();
      const { runner, clock, surface } = setup({ hover }, "off");
      runner.hover([input("a")]);
      expect(hover.log).toEqual(["end a #0"]);
      expect(clock.idle).toBe(true);
      expect(surface.picture()).toEqual([walked(bar("a"))]);
      await flush();
      expect(hover.log).toEqual(["end a #0"]);

      // The end state stays, and follows changes, until the run is cleared.
      runner.change(bar("a", 80));
      runner.leave();
      expect(hover.log).toEqual(["end a #0", "change a 80 #0", "clear #0"]);
      expect(surface.picture()).toEqual([]);
      expect(surface.mark("a").style).toEqual({});
    });

    it("follows the device setting: reduced motion turns every run off", () => {
      const hover = probe();
      const { runner, reduced } = setup({ hover });
      reduced.set(true);
      runner.hover([input("a")]);
      expect(hover.log).toEqual(["end a #0"]);
    });

    it("replaces runs still going with end() on a fresh context when the mode turns off mid-run", async () => {
      const hover = probe();
      const decorate = probe({ halo: { width: 4, opacity: 0.5 } });
      const { runner, clock, reduced, surface } = setup({ hover, decorate });
      runner.enter([input("a")]);
      clock.advance(100);
      await flush();
      runner.hover([input("a")]);
      clock.advance(30);
      const moved = bar("a", 70);
      runner.change(moved);

      reduced.set(true);
      expect(hover.log).toEqual(["run a #0", "change a 70 #0", "clear #0", "end a #1"]);
      expect(hover.contexts[0]!.signal.aborted).toBe(true);
      expect(hover.contexts[1]!.signal.aborted).toBe(false);
      // end() gets the latest geometry and the run's batch.
      expect(hover.marks[1]).toBe(moved);
      expect(hover.contexts[1]!.batch).toEqual({ index: 0, count: 1 });
      // A run that already finished keeps its end state.
      expect(decorate.log).toEqual(["run a #0", "done a #0", "change a 70 #0"]);
      expect(clock.idle).toBe(true);
      expect(surface.picture("a")).toEqual([walked(bar("a")), walked(moved)]);
      expect(surface.mark("a").style).toEqual({ halo: { width: 4, opacity: 0.5 }, emphasis: 1 });

      await flush();
      expect(hover.log).toContain("cancelled a #0");
      expect(report).not.toHaveBeenCalled();
    });

    it("keeps a replaced run's place, so a later run still wins its style and stacks above it", async () => {
      const decorate = probe({ emphasis: 0.5 }, 1000);
      const hover = probe({ emphasis: 1 });
      const { runner, clock, motion, surface } = setup({ decorate, hover });
      runner.enter([input("a")]);
      runner.hover([input("a")]);
      clock.advance(100);
      await flush();
      expect(hover.log).toEqual(["run a #0", "done a #0"]);

      // The decoration is still going, so it's replaced by end(); the finished hover started later.
      motion.chooseMode("off");
      expect(decorate.log).toEqual(["run a #0", "clear #0", "end a #1"]);
      expect(surface.mark("a").style).toEqual({ emphasis: 1 });
      expect(surface.groups.map((group) => `${group.slot} ${group.order}${group.cleared ? " cleared" : ""}`)).toEqual([
        "decorate 1 cleared",
        "hover 2",
        "decorate 1"
      ]);
    });

    it("does the same for the viewer's choice, and leaves runs alone when motion comes back", () => {
      const hover = probe();
      const { runner, motion } = setup({ hover });
      runner.hover([input("a")]);
      motion.chooseMode("off");
      motion.chooseMode("presentation");
      expect(hover.log).toEqual(["run a #0", "clear #0", "end a #1"]);
      runner.hover([input("b")]);
      expect(hover.log.slice(3)).toEqual(["run b #2"]);
    });
  });

  describe("leave and destroy", () => {
    it("leave clears hover runs: the keys given, or every hovered mark", () => {
      const hover = probe();
      const { runner, surface } = setup({ hover });
      runner.hover([input("a"), input("b"), input("c")]);
      runner.leave(["b", "unknown"]);
      expect(hover.log.slice(3)).toEqual(["clear #1"]);
      runner.leave();
      expect(hover.log.slice(4)).toEqual(["clear #0", "clear #2"]);
      expect(surface.picture()).toEqual([]);
      expect([..."abc"].map((key) => surface.mark(key).style)).toEqual([{}, {}, {}]);
    });

    it("destroy clears every run, stops following the motion mode, and ignores later calls", async () => {
      const hover = probe();
      const decorate = probe();
      const exit = probe();
      const { runner, surface, reduced, motion } = setup({ hover, decorate, exit });
      expect(reduced.listening).toBe(1);
      runner.enter([input("a"), input("b")]);
      runner.hover([input("a")]);
      const leaving = runner.exit([input("b")]);

      runner.destroy();
      expect(hover.log).toEqual(["run a #0", "clear #0"]);
      expect(decorate.log).toEqual(["run a #0", "run b #1", "clear #1", "clear #0"]);
      expect(exit.log).toEqual(["run b #0", "clear #0"]);
      await expect(leaving).resolves.toBeUndefined();
      expect(surface.picture()).toEqual([]);
      expect(surface.mark("a").style).toEqual({});
      expect(reduced.listening).toBe(0);

      await flush();
      const logged = [hover.log.length, decorate.log.length, exit.log.length];
      runner.enter([input("c")]);
      runner.hover([input("c")]);
      runner.update([input("c")]);
      runner.interrupt();
      runner.settle();
      runner.change(bar("a"));
      motion.chooseMode("off");
      await expect(runner.exit([input("c")])).resolves.toBeUndefined();
      runner.destroy();
      await flush();
      expect([hover.log.length, decorate.log.length, exit.log.length]).toEqual(logged);
      expect(surface.groups.every((group) => group.cleared)).toBe(true);
    });
  });

  describe("data transitions", () => {
    it("interrupt clears hover runs; settle replays them on marks still hovered, with the latest geometry", () => {
      const hover = probe();
      const { runner } = setup({ hover });
      runner.hover([input("a"), input("b"), input("c")]);
      runner.leave(["b"]);
      runner.interrupt();
      expect(hover.log).toEqual(["run a #0", "run b #1", "run c #2", "clear #1", "clear #0", "clear #2"]);

      runner.update([input("a", 60)]);
      const settled = bar("a", 60);
      runner.change(bar("a", 80));
      runner.change(settled);
      runner.settle();
      expect(hover.log.slice(6)).toEqual(["run a #3", "run c #4"]);
      expect(hover.marks[3]).toBe(settled);
      expect(hover.contexts[3]!.batch).toEqual({ index: 0, count: 2 });
      expect(hover.contexts[4]!.batch).toEqual({ index: 1, count: 2 });
    });

    it("holds a hover that arrives mid-transition until it settles (race: hover during an update)", () => {
      const hover = probe();
      const { runner, surface } = setup({ hover });
      runner.interrupt();
      runner.hover([input("a")]);
      expect(hover.log).toEqual([]);
      expect(surface.groups).toEqual([]);
      runner.settle();
      expect(hover.log).toEqual(["run a #0"]);
    });

    it("doesn't replay a mark the pointer left during the transition", () => {
      const hover = probe();
      const { runner } = setup({ hover });
      runner.hover([input("a")]);
      runner.interrupt();
      runner.leave();
      runner.hover([input("b")]);
      runner.leave(["b"]);
      runner.settle();
      expect(hover.log).toEqual(["run a #0", "clear #0"]);
    });

    it("replays once however many transitions interrupted it, and only after one", () => {
      const hover = probe();
      const { runner } = setup({ hover });
      runner.hover([input("a")]);
      runner.settle();
      expect(hover.log).toEqual(["run a #0"]);
      runner.interrupt();
      runner.interrupt();
      runner.settle();
      runner.settle();
      expect(hover.log).toEqual(["run a #0", "clear #0", "run a #1"]);
    });

    it("keeps decorations running and tells them every change", async () => {
      const decorate = probe();
      const update = probe();
      const { runner, clock } = setup({ decorate, update });
      runner.enter([input("a")]);
      clock.advance(100);
      await flush();
      runner.interrupt();
      runner.update([input("a", 60)]);
      runner.change(bar("a", 80));
      runner.change(bar("a", 60));
      runner.settle();
      expect(decorate.log).toEqual(["run a #0", "done a #0", "change a 80 #0", "change a 60 #0"]);
      expect(update.log).toEqual(["run a #0", "change a 80 #0", "change a 60 #0"]);
    });

    it("gives update runs the previous geometry and data", () => {
      const calls: { readonly ctx: EffectContext; readonly data: MarkData<Row> }[] = [];
      const update: DataEffect<Row> = {
        kind: "data",
        run: async (_mark, data, ctx) => {
          calls.push({ ctx, data });
        },
        end: () => {},
        clear: () => {}
      };
      const { runner } = setup<Row>({ update });
      const first = { mark: bar("a"), data: dataOf(100) };
      runner.enter([first]);

      const from = bar("a", 90);
      runner.update([{ mark: bar("a", 60), data: dataOf(60), from }]);
      expect(calls[0]!.ctx.previous).toBe(from);
      expect(calls[0]!.data.previous).toBe(first.data);
      expect(calls[0]!.data.datum).toEqual({ value: 60 });

      // Without `from`, the previous geometry is the last one seen: here, a frame of the transition.
      const frame = bar("a", 70);
      runner.change(frame);
      runner.update([{ mark: bar("a", 40), data: dataOf(40) }]);
      expect(calls[1]!.ctx.previous).toBe(frame);
      expect(calls[1]!.data.previous?.datum).toEqual({ value: 60 });
      expect(calls[1]!.data.previous?.previous).toBeUndefined();

      // Previous values the chart gives are kept.
      const given = dataOf(10, dataOf(99));
      runner.update([{ mark: bar("a", 10), data: given }]);
      expect(calls[2]!.data).toBe(given);

      // A mark seen for the first time has nothing before it.
      runner.update([input("new"), input("newer")]);
      expect(calls[3]!.ctx).not.toHaveProperty("previous");
      expect(calls[3]!.data.previous).toBeUndefined();
      expect(calls[4]!.ctx.batch).toEqual({ index: 1, count: 2 });
    });

    it("keeps an update run's previous values in the data its changes bring", () => {
      const seen: { slot: string; value?: number; previous?: number }[] = [];
      const listen = (slot: string): DataEffect<Row> => ({
        kind: "data",
        run: async (_mark, _data, ctx) => {
          ctx.onChange((_next, data) => void seen.push({ slot, value: (data as MarkData<Row> | undefined)?.datum.value, previous: (data as MarkData<Row> | undefined)?.previous?.datum.value }));
        },
        end: () => {},
        clear: () => {}
      });
      const { runner } = setup<Row>({ decorate: listen("decorate"), update: listen("update") });
      runner.enter([{ mark: bar("a"), data: dataOf(100) }]);
      runner.update([{ mark: bar("a", 60), data: dataOf(60) }]);
      runner.change(bar("a", 80));
      runner.change(bar("a", 61), dataOf(61));
      expect(seen).toEqual([
        { slot: "decorate", value: 60, previous: undefined },
        { slot: "update", value: 60, previous: 100 },
        { slot: "decorate", value: 61, previous: undefined },
        { slot: "update", value: 61, previous: 100 }
      ]);
    });

    it("keeps an update's previous values when the mode turns off mid-run", () => {
      const ended: MarkData<Row>[] = [];
      const update: DataEffect<Row> = {
        kind: "data",
        run: () => new Promise(() => {}),
        end: (_mark, data) => {
          ended.push(data);
        },
        clear: () => {}
      };
      const { runner, motion } = setup<Row>({ update });
      runner.enter([{ mark: bar("a"), data: dataOf(100) }]);
      runner.update([{ mark: bar("a", 60), data: dataOf(60) }]);
      const revealed = dataOf(61);
      runner.change(bar("a", 61), revealed);
      motion.chooseMode("off");
      expect(ended[0]!.datum).toBe(revealed.datum);
      expect(ended[0]!.previous?.datum).toEqual({ value: 100 });
    });
  });

  describe("an update ends the last one's update runs", () => {
    it("on the marks it leaves alone, as a re-trigger would: abort, clear(), layer, mark style, listeners", async () => {
      const update = probe();
      const { runner, clock, surface } = setup({ update });
      runner.enter([input("a"), input("b")]);
      runner.update([input("a", 60)]);
      clock.advance(50);
      // A run still playing on a mark this update leaves alone stops there.
      runner.update([input("b", 80)]);
      expect(update.contexts[0]!.signal.aborted).toBe(true);
      expect(update.log).toEqual(["run a #0", "clear #0", "run b #1"]);
      expect(surface.groups.map((group) => `${group.key} ${group.cleared}`)).toEqual(["a true", "b false"]);
      expect(surface.mark("a").calls).toEqual([{ op: "set", style: { emphasis: 1 } }, { op: "reset" }]);
      runner.change(bar("a", 50));
      expect(update.log).not.toContain("change a 50 #0");
      await flush();
      expect(update.log).toContain("cancelled a #0");
    });

    it("on every mark when it changes none (new data, the same values), and one that finished goes too", async () => {
      const update = probe();
      const { runner, clock, surface } = setup({ update });
      runner.enter([input("a"), input("b")]);
      runner.update([input("a", 60), input("b", 80)]);
      clock.advance(100);
      await flush();
      expect(update.log).toEqual(["run a #0", "run b #1", "done a #0", "done b #1"]);
      expect(surface.picture()).toHaveLength(2);
      runner.update([]);
      expect(update.log.slice(4)).toEqual(["clear #0", "clear #1"]);
      expect(surface.picture()).toEqual([]);
    });

    it("leaves the other slots' runs alone", () => {
      const decorate = probe();
      const enter = probe();
      const hover = probe();
      const update = probe();
      const { runner } = setup({ decorate, enter, hover, update });
      runner.enter([input("a"), input("b")]);
      runner.hover([input("a")]);
      runner.update([input("a", 60)]);
      runner.update([input("b", 80)]);
      for (const effect of [decorate, enter, hover]) expect(effect.log.filter((line) => line.startsWith("clear"))).toEqual([]);
      expect(update.log).toEqual(["run a #0", "clear #0", "run b #1"]);
    });

    it("with motion off: the end state drawn, then cleared at the next update", () => {
      const update = probe();
      const { runner, surface } = setup({ update }, "off");
      runner.enter([input("a"), input("b")]);
      runner.update([input("a", 60)]);
      expect(update.log).toEqual(["end a #0"]);
      expect(surface.picture()).toEqual([walked(bar("a", 60))]);
      runner.update([input("b", 80)]);
      expect(update.log).toEqual(["end a #0", "clear #0", "end b #1"]);
      expect(surface.picture()).toEqual([walked(bar("b", 80))]);
    });

    it("gives the values the last update gave, not the values part way through its change", () => {
      const previous: (number | undefined)[] = [];
      const update: DataEffect<Row> = {
        kind: "data",
        run: async (_mark, data) => void previous.push(data.previous?.datum.value),
        end: () => {},
        clear: () => {}
      };
      const { runner } = setup<Row>({ update });
      runner.enter([{ mark: bar("a"), data: dataOf(100) }]);
      runner.interrupt();
      runner.update([{ mark: bar("a", 60), data: dataOf(60) }]);
      // A frame of the change, which the latest data follows.
      runner.change(bar("a", 80), dataOf(80));
      // Another update replaces the one still moving.
      runner.interrupt();
      runner.update([{ mark: bar("a", 40), data: dataOf(40) }]);
      expect(previous).toEqual([100, 60]);
    });

    it("counts from where a mark rested since: a change outside a transition, or the frame it settled on", () => {
      const previous: (number | undefined)[] = [];
      const update: DataEffect<Row> = {
        kind: "data",
        run: async (_mark, data) => void previous.push(data.previous?.datum.value),
        end: () => {},
        clear: () => {}
      };
      const { runner } = setup<Row>({ update });
      runner.enter([{ mark: bar("a"), data: dataOf(100) }]);
      // A line revealed further, or a resize: no transition, so the values rest there.
      runner.change(bar("a", 90), dataOf(90));
      runner.interrupt();
      runner.update([{ mark: bar("a", 60), data: dataOf(60) }]);
      // The change lands, and settles on its last frame's data: a new row with the same values.
      const landed = dataOf(60);
      runner.change(bar("a", 60), landed);
      runner.settle();
      runner.interrupt();
      runner.update([{ mark: bar("a", 40), data: dataOf(40) }]);
      expect(previous).toEqual([90, 60]);

      // The geometry before is still the one on screen.
      const from = bar("a", 45);
      const seen: (MarkGeometry | undefined)[] = [];
      const geometry = setup<Row>({ update: { kind: "data", run: async (_mark, _data, ctx) => void seen.push(ctx.previous), end: () => {}, clear: () => {} } });
      geometry.runner.enter([{ mark: bar("b"), data: dataOf(100) }]);
      geometry.runner.interrupt();
      geometry.runner.update([{ mark: bar("b", 60), data: dataOf(60) }]);
      const frame = bar("b", 75);
      geometry.runner.change(frame, dataOf(75));
      geometry.runner.update([{ mark: bar("b", 40), data: dataOf(40) }]);
      geometry.runner.update([{ mark: bar("b", 30), data: dataOf(30), from }]);
      expect(seen.slice(1)).toEqual([frame, from]);
    });
  });

  describe("enter and exit", () => {
    it("enter starts decorate, then enter, with batch positions", () => {
      const decorate = probe();
      const enter = probe();
      const { runner, surface } = setup({ decorate, enter });
      runner.enter([input("a"), input("b")]);
      expect(decorate.log).toEqual(["run a #0", "run b #1"]);
      expect(enter.log).toEqual(["run a #0", "run b #1"]);
      expect(surface.groups.map((group) => `${group.slot} ${group.key}`)).toEqual(["decorate a", "enter a", "decorate b", "enter b"]);
      expect(enter.contexts[1]!.batch).toEqual({ index: 1, count: 2 });
      expect(decorate.contexts[1]!.batch).toEqual({ index: 1, count: 2 });
    });

    it("exit clears the mark's other runs, runs exit and resolves when it finishes", async () => {
      const decorate = probe();
      const enter = probe();
      const hover = probe();
      const exit = probe();
      const { runner, clock, surface } = setup({ decorate, enter, hover, exit });
      runner.enter([input("a"), input("b")]);
      runner.hover([input("a")]);
      let exited = false;
      const leaving = runner.exit([input("a")]).then(() => {
        exited = true;
      });
      expect(decorate.log).toEqual(["run a #0", "run b #1", "clear #0"]);
      expect(enter.log).toEqual(["run a #0", "run b #1", "clear #0"]);
      expect(hover.log).toEqual(["run a #0", "clear #0"]);
      expect(exit.log).toEqual(["run a #0"]);

      // A leaving mark can't be hovered, but it does follow changes (it may shrink as it goes).
      runner.hover([input("a")]);
      runner.change(bar("a", 50));
      clock.advance(50);
      await flush();
      expect(exited).toBe(false);
      clock.advance(50);
      await leaving;
      expect(exit.log).toEqual(["run a #0", "change a 50 #0", "done a #0", "clear #0"]);
      expect(hover.log).not.toContain("run a #1");
      expect(surface.picture("a")).toEqual([]);

      // The mark is forgotten: nothing follows its changes, and it can come back as new.
      runner.change(bar("a", 40));
      expect(exit.log).toHaveLength(4);
      runner.enter([input("a")]);
      expect(decorate.log[decorate.log.length - 1]).toBe("run a #2");
      expect(surface.picture("b")).toHaveLength(2);
    });

    it("resolves at once when there's no exit effect", async () => {
      const decorate = probe();
      const { runner } = setup({ decorate });
      runner.enter([input("a")]);
      const leaving = runner.exit([input("a")]);
      expect(decorate.log).toEqual(["run a #0", "clear #0"]);
      await leaving;
      await expect(runner.exit([])).resolves.toBeUndefined();
    });

    it("draws the end state and resolves at once when the mode is off", async () => {
      const exit = probe();
      const { runner } = setup({ exit }, "off");
      await runner.exit([input("a"), input("b")]);
      expect(exit.log).toEqual(["end a #0", "clear #0", "end b #1", "clear #1"]);
    });

    it("resolves when the mode turns off mid-exit", async () => {
      const exit = probe();
      const { runner, motion, surface } = setup({ exit });
      const leaving = runner.exit([input("a")]);
      motion.chooseMode("off");
      expect(exit.log).toEqual(["run a #0", "clear #0", "end a #1", "clear #1"]);
      expect(surface.picture()).toEqual([]);
      await leaving;
    });

    it("cancels the exit when the mark comes back mid-exit", async () => {
      const decorate = probe();
      const exit = probe();
      const { runner, clock } = setup({ decorate, exit });
      runner.enter([input("a")]);
      const leaving = runner.exit([input("a")]);
      clock.advance(50);
      runner.enter([input("a", 80)]);
      expect(exit.log).toEqual(["run a #0", "clear #0"]);
      expect(decorate.log).toEqual(["run a #0", "clear #0", "run a #1"]);
      await leaving;

      // Still a live mark.
      runner.change(bar("a", 70));
      expect(decorate.log[decorate.log.length - 1]).toBe("change a 70 #1");
    });

    it("starts over when a mark is told to exit twice", async () => {
      const exit = probe();
      const { runner, clock } = setup({ exit });
      const first = runner.exit([input("a")]);
      clock.advance(50);
      const second = runner.exit([input("a")]);
      await first;
      clock.advance(100);
      await second;
      expect(exit.log).toEqual(["run a #0", "clear #0", "run a #1", "cancelled a #0", "done a #1", "clear #1"]);
    });
  });

  describe("swap", () => {
    it("keeps a slot's runs when its effect is the same, and starts a new decorate on every live mark, in its place", () => {
      const decorate = probe();
      const hover = probe();
      const next = probe();
      const { runner, surface } = setup({ decorate, hover });
      runner.enter([input("a"), input("b"), input("c")]);
      runner.hover([input("b")]);
      void runner.exit([input("c")]);
      runner.swap({ decorate: next, hover }, [input("a"), input("b")]);
      expect(hover.log).toEqual(["run b #0"]);
      expect(decorate.log).toEqual(["run a #0", "run b #1", "run c #2", "clear #2", "clear #0", "clear #1"]);
      expect(next.log).toEqual(["run a #0", "run b #1"]);
      expect(next.contexts[1]!.batch).toEqual({ index: 1, count: 2 });
      // Where the old runs were: their order, so the hover's style still wins and its group stacks above.
      expect(surface.groups.filter((group) => !group.cleared).map((group) => `${group.slot} ${group.key} ${group.order}`)).toEqual(["hover b 4", "decorate a 1", "decorate b 2"]);
      expect(surface.picture("b").length).toBe(2);
    });

    it("replays a held hover with the new hover effect, or once a transition settles", () => {
      const hover = probe();
      const next = probe();
      const later = probe();
      const { runner } = setup({ hover });
      runner.enter([input("a"), input("b")]);
      runner.hover([input("a"), input("b")]);
      runner.leave(["b"]);
      runner.swap({ hover: next }, [input("a"), input("b")]);
      expect(hover.log).toEqual(["run a #0", "run b #1", "clear #1", "clear #0"]);
      expect(next.log).toEqual(["run a #0"]);
      expect(next.contexts[0]!.batch).toEqual({ index: 0, count: 1 });

      runner.interrupt();
      runner.swap({ hover: later }, [input("a"), input("b")]);
      expect(later.log).toEqual([]);
      runner.settle();
      expect(later.log).toEqual(["run a #0"]);
    });

    it("draws a new enter and update effect's end state where their runs were, so nothing enters again", async () => {
      const enter = probe();
      const update = probe();
      const nextEnter = probe();
      const nextUpdate = probe();
      const { runner, clock } = setup({ enter, update });
      runner.enter([input("a"), input("b")]);
      clock.advance(100);
      await flush();
      const from = bar("a", 90);
      runner.update([{ ...input("a", 60), from }]);
      runner.swap({ enter: nextEnter, update: nextUpdate }, [input("a", 60), input("b")]);
      expect(enter.log).toEqual(["run a #0", "run b #1", "done a #0", "done b #1", "clear #0", "clear #1"]);
      expect(nextEnter.log).toEqual(["end a #0", "end b #1"]);
      expect(nextEnter.contexts[1]!.batch).toEqual({ index: 1, count: 2 });
      expect(nextUpdate.log).toEqual(["end a #0"]);
      expect(nextUpdate.contexts[0]!.previous).toBe(from);
      expect(clock.idle).toBe(true);
      await flush();
      expect(update.log).toEqual(["run a #0", "clear #0", "cancelled a #0"]);
    });

    it("replaces an exit in its place, so the mark still leaves, and clears a slot left empty", async () => {
      const exit = probe();
      const nextExit = probe();
      const decorate = probe();
      const { runner } = setup({ decorate, exit });
      runner.enter([input("a"), input("b"), input("c")]);
      const gone: string[] = [];
      void runner.exit([input("a")]).then(() => gone.push("a"));
      void runner.exit([input("b")]).then(() => gone.push("b"));
      await flush();
      expect(gone).toEqual([]);

      runner.swap({ exit: nextExit }, [input("c")]);
      expect(nextExit.log).toEqual(["end a #0", "clear #0", "end b #1", "clear #1"]);
      expect(decorate.log.filter((entry) => entry.startsWith("clear"))).toEqual(["clear #0", "clear #1", "clear #2"]);
      await flush();
      expect(gone).toEqual(["a", "b"]);

      void runner.exit([input("c")]).then(() => gone.push("c"));
      runner.swap({}, []);
      await flush();
      expect(gone).toEqual(["a", "b", "c"]);
    });

    it("starts decorate on the geometry and data it's given, leaving the marks' own to the update that follows", () => {
      const seen: string[] = [];
      const previous: (number | undefined)[] = [];
      const decorate: DataEffect<Row> = {
        kind: "data",
        run: async (mark, data) => {
          seen.push(`${mark.key} ${mark.bounds.width} ${data.datum.value}`);
        },
        end: () => {},
        clear: () => {}
      };
      const update: DataEffect<Row> = {
        kind: "data",
        run: async (_mark, data) => {
          previous.push(data.previous?.datum.value);
        },
        end: () => {},
        clear: () => {}
      };
      const { runner } = setup<Row>({ update });
      runner.enter([{ mark: bar("a"), data: dataOf(100) }]);
      runner.swap({ decorate, update }, [{ mark: bar("a", 60), data: dataOf(60) }]);
      expect(seen).toEqual(["a 60 60"]);
      runner.update([{ mark: bar("a", 60), data: dataOf(60) }]);
      expect(previous).toEqual([100]);
    });

    it("draws end states with motion off, and does nothing for the same effects or after destroy", () => {
      const decorate = probe();
      const next = probe();
      const { runner } = setup({ decorate }, "off");
      runner.enter([input("a")]);
      runner.swap({ decorate }, [input("a")]);
      expect(decorate.log).toEqual(["end a #0"]);
      runner.swap({ decorate: next }, [input("a")]);
      expect(next.log).toEqual(["end a #0"]);
      runner.destroy();
      runner.swap({ decorate }, [input("a")]);
      expect(decorate.log).toEqual(["end a #0", "clear #0"]);
    });
  });

  describe("errors", () => {
    it("reports and clears an effect that throws, without touching other marks", () => {
      const boom = new Error("boom");
      const clear = vi.fn();
      const hover: GeometryEffect = {
        kind: "geometry",
        run(mark, ctx) {
          ctx.layer.path(mark.slice(0, 1), {});
          ctx.mark.set({ opacity: 0.2 });
          if (mark.key === "bad") throw boom;
          return Promise.resolve();
        },
        end() {},
        clear
      };
      const { runner, surface } = setup({ hover });
      runner.hover([input("bad"), input("good")]);
      expect(report).toHaveBeenCalledExactlyOnceWith(boom);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(surface.picture("bad")).toEqual([]);
      expect(surface.mark("bad").style).toEqual({});
      expect(surface.picture("good")).toHaveLength(1);
      expect(surface.mark("good").style).toEqual({ opacity: 0.2 });
    });

    it("reports and clears a run that rejects", async () => {
      const boom = new Error("boom");
      const hover: GeometryEffect = {
        kind: "geometry",
        async run(mark, ctx) {
          ctx.layer.path(mark.slice(0, 1), {});
          await ctx.tween({ duration: 100, update: () => {} }).finished;
          throw boom;
        },
        end() {},
        clear() {}
      };
      const { runner, clock, surface } = setup({ hover });
      runner.hover([input("a")]);
      clock.advance(100);
      await flush();
      expect(report).toHaveBeenCalledExactlyOnceWith(boom);
      expect(surface.picture()).toEqual([]);
    });

    it("contains errors in end(), clear() and onChange listeners", () => {
      const errors = { end: new Error("end"), clear: new Error("clear"), change: new Error("change") };
      const hover: GeometryEffect = {
        kind: "geometry",
        async run(mark, ctx) {
          ctx.layer.path(mark.slice(0, 1), {});
          ctx.onChange(() => {
            throw errors.change;
          });
        },
        end() {
          throw errors.end;
        },
        clear() {
          throw errors.clear;
        }
      };
      const decorate = probe();
      const { runner, surface, motion } = setup({ hover, decorate });
      runner.enter([input("a")]);
      runner.hover([input("a")]);
      runner.change(bar("a", 80));
      expect(vi.mocked(report).mock.calls).toEqual([[errors.change], [errors.clear]]);
      expect(surface.picture("a")).toEqual([{ kind: "path", d: bar("a").slice(0, 0), paint: { stroke: "mark" } }]);
      // Other runs on the mark still get the change.
      expect(decorate.log).toEqual(["run a #0", "change a 80 #0"]);

      motion.chooseMode("off");
      runner.hover([input("a")]);
      expect(vi.mocked(report).mock.calls.slice(2)).toEqual([[errors.end], [errors.clear]]);
    });

    it("doesn't report a run that rejects because it was aborted, but does report real errors", async () => {
      const boom = new Error("boom");
      const hover: GeometryEffect = {
        kind: "geometry",
        async run(mark, ctx) {
          await ctx.tween({ duration: 100, update: () => {} }).finished;
          if (mark.key === "reason") throw ctx.signal.reason;
          if (mark.key === "named") throw Object.assign(new Error("aborted"), { name: "AbortError" });
          throw boom;
        },
        end() {},
        clear() {}
      };
      const { runner } = setup({ hover });
      runner.hover([input("reason"), input("named"), input("real")]);
      runner.leave();
      await flush();
      expect(report).toHaveBeenCalledExactlyOnceWith(boom);
    });

    it("ignores what an effect draws or styles after its run is cleared", async () => {
      const handles: unknown[] = [];
      const hover: GeometryEffect = {
        kind: "geometry",
        async run(mark, ctx) {
          await ctx.tween({ duration: 100, update: () => {} }).finished;
          ctx.layer.path(mark.slice(0, 1), {}).update("M0,0");
          ctx.layer.text("late", { at: mark.end }).update({ opacity: 1 });
          const icon = ctx.layer.icon(dot);
          icon.place([1, 0, 0, 1, 0, 0]);
          handles.push(icon);
          ctx.mark.set({ opacity: 0.1 });
          ctx.mark.reset();
        },
        end() {},
        clear() {}
      };
      const { runner, surface } = setup({ hover });
      runner.hover([input("a")]);
      runner.leave();
      await flush();
      expect(handles).toHaveLength(1);
      expect(surface.groups).toEqual([]);
      expect(surface.mark("a").calls).toEqual([]);
      expect(report).not.toHaveBeenCalled();
    });
  });

  describe("mark style", () => {
    it("merges every live run's style into the mark; the later run wins a shared field", () => {
      const halo = { width: 4, opacity: 0.5 };
      const transform = [1, 0, 0, 1, 0, -2] as const;
      const { runner, surface } = setup({ decorate: styler({ halo, emphasis: 0.5 }), hover: styler({ transform, emphasis: 1 }) });
      const mark = surface.mark("a");
      runner.enter([input("a")]);
      expect(mark.style).toEqual({ halo, emphasis: 0.5 });
      runner.hover([input("a")]);
      expect(mark.style).toEqual({ halo, emphasis: 1, transform });
      expect(mark.calls[1]).toEqual({ op: "set", style: { emphasis: 1, transform } });

      runner.leave();
      expect(mark.style).toEqual({ halo, emphasis: 0.5 });
      expect(mark.calls[2]).toStrictEqual({ op: "set", style: { emphasis: 0.5, transform: undefined } });
      runner.destroy();
      expect(mark.calls[3]).toEqual({ op: "reset" });
    });

    it("resets only a run's own fields when its effect calls mark.reset()", async () => {
      const hover: GeometryEffect = {
        kind: "geometry",
        async run(_mark, ctx) {
          ctx.mark.set({ opacity: 0.3 });
          ctx.mark.set({ opacity: undefined, emphasis: 1 });
          ctx.mark.reset();
        },
        end() {},
        clear() {}
      };
      const { runner, surface } = setup({ decorate: styler({ emphasis: 0.5 }), hover });
      runner.enter([input("a")]);
      runner.hover([input("a")]);
      expect(surface.mark("a").style).toEqual({ emphasis: 0.5 });
      expect(surface.mark("a").calls).toEqual([
        { op: "set", style: { emphasis: 0.5 } },
        { op: "set", style: { opacity: 0.3 } },
        { op: "set", style: { opacity: undefined, emphasis: 1 } },
        { op: "set", style: { emphasis: 0.5 } }
      ]);
    });
  });

  describe("where effects' text sits (texts)", () => {
    /** A box `width` wide at `x`, 10 px high, as a run's text might be. */
    const at = (x: number, width = 10): Rect => ({ x, y: 0, width, height: 10 });

    /**
     * Holds a box at its mark's width (so a mark that changes width moves its text) on its first draw
     * and on every change, and logs what it sees held before it each time: "a [10]" is mark a, placed
     * past one box at x 10. It stays until cleared, as delta's text does.
     */
    function holder(duration = 100): GeometryEffect & { readonly log: string[]; readonly contexts: EffectContext[] } {
      const log: string[] = [];
      const contexts: EffectContext[] = [];
      const place = (mark: MarkGeometry, ctx: EffectContext): void => {
        log.push(`${mark.key} [${ctx.texts!.held().map((box) => box.x)}]`);
        ctx.texts!.hold(at(mark.length));
      };
      const begin = (mark: MarkGeometry, ctx: EffectContext): void => {
        contexts.push(ctx);
        place(mark, ctx);
        ctx.onChange((moved) => place(moved, ctx));
      };
      return {
        kind: "geometry",
        log,
        contexts,
        async run(mark, ctx) {
          begin(mark, ctx);
          await ctx.tween({ duration, timing: "effect", update() {} }).finished;
        },
        end: begin,
        clear() {}
      };
    }

    it("gives every run one space on its runner, with text boxed as its surface measures it, or estimated", () => {
      const decorate = holder();
      const { runner } = setup({ decorate });
      runner.enter([input("a"), input("b")]);
      const [a, b] = decorate.contexts;
      // jsdom's estimate, at the overlay's 12.5 px: 0.6 em a character, and past the text at either side and above and below its baseline.
      expect(a!.texts!.box("+2", { at: { x: 10, y: 20 }, anchor: "end" })).toEqual({ x: 10 - 15 - 2, y: 20 - 1.05 * 12.5, width: 15 + 4, height: 1.3 * 12.5 });
      expect(b!.texts!.box("+2", { at: { x: 10, y: 20 } })).toEqual(estimatedBox("+2", { at: { x: 10, y: 20 } }));

      // A surface that measures text: the runner asks it, with the content and the style.
      const box = vi.fn((content: string) => at(content.length));
      const measured = holder();
      createRunner({ effects: { decorate: measured }, surface: { ...recordingSurface(), box } }).enter([input("a")]);
      const style = { at: { x: 1, y: 2 }, anchor: "middle" } as const;
      expect(measured.contexts[0]!.texts!.box("+12", style)).toEqual(at(3));
      expect(box).toHaveBeenLastCalledWith("+12", style);
    });

    it("gives each run the boxes held by the runs that started before it, not after", () => {
      const decorate = holder();
      const { runner } = setup({ decorate });
      runner.enter([input("a", 10), input("b", 20), input("c", 30)]);
      expect(decorate.log).toEqual(["a []", "b [10]", "c [10,20]"]);
      const [a, b, c] = decorate.contexts;
      expect(a!.texts!.held()).toEqual([]);
      expect(b!.texts!.held()).toEqual([at(10)]);
      expect(c!.texts!.held()).toEqual([at(10), at(20)]);
    });

    it("keeps the box a run holds until it holds another or undefined", () => {
      const decorate = holder();
      const { runner } = setup({ decorate });
      runner.enter([input("a", 10), input("b", 20)]);
      const [a, b] = decorate.contexts;
      a!.texts!.hold(at(40, 5));
      expect(b!.texts!.held()).toEqual([at(40, 5)]);
      a!.texts!.hold(undefined);
      expect(b!.texts!.held()).toEqual([]);
      a!.texts!.hold(at(50));
      expect(b!.texts!.held()).toEqual([at(50)]);
    });

    it("lets go of a run's box when it's cleared, ended or swapped, and keeps it while its run has finished", async () => {
      const update = holder(1000);
      const hover = holder();
      const { runner, reduced, clock } = setup({ update, hover });
      runner.enter([input("a", 10), input("b", 20)]);
      /** What a hover on c, starting last, sees held before it. */
      const held = (): number[] => {
        runner.hover([input("c", 99)]);
        const seen = hover.contexts[hover.contexts.length - 1]!.texts!.held().map((box) => box.x);
        runner.leave(["c"]);
        return seen;
      };
      // Cleared: a leave, a re-trigger, and an update that leaves the mark alone.
      runner.hover([input("a", 10)]);
      runner.leave(["a"]);
      expect(held()).toEqual([]);
      runner.update([input("a", 11)]);
      runner.update([input("a", 12)]);
      expect(held()).toEqual([12]);
      // A run that has finished keeps its text, as delta's stays.
      clock.advance(2000);
      await flush();
      expect(held()).toEqual([12]);
      runner.update([input("b", 21)]);
      expect(held()).toEqual([21]);
      // Ended: motion turns off mid-run, and the run's end state, in its place, holds its own.
      reduced.set(true);
      expect(update.log[update.log.length - 1]).toBe("b []");
      expect(held()).toEqual([21]);
      // Swapped: the new effect's end state, in the old run's place, holds its own.
      const next = holder();
      runner.swap({ update: next, hover }, [input("a", 12), input("b", 21)]);
      expect(next.log).toEqual(["b []"]);
      expect(held()).toEqual([21]);
      runner.destroy();
      expect(next.contexts[0]!.texts!.held()).toEqual([]);
      expect(hover.contexts[0]!.texts!.held()).toEqual([]);
    });

    it("keeps each runner's text apart, so two charts' text doesn't count against each other", () => {
      const decorate = holder();
      const one = setup({ decorate });
      const two = setup({ decorate });
      one.runner.enter([input("a", 10)]);
      two.runner.enter([input("a", 20)]);
      one.runner.enter([input("b", 30)]);
      expect(decorate.log).toEqual(["a []", "a []", "b [10]"]);
    });

    it("tells a mark's runs it moved in the order they started, though one took another's place", () => {
      const enter = holder();
      const update = holder();
      const { runner } = setup({ enter, update }, "off");
      runner.enter([input("a", 10)]);
      runner.update([input("a", 20)]);
      // The new enter run takes the old one's place, before the update run.
      const again = holder();
      runner.swap({ enter: again, update }, [input("a", 20)]);
      runner.change(bar("a", 30));
      expect([again.log[again.log.length - 1], update.log[update.log.length - 1]]).toEqual(["a []", "a [30]"]);
    });

    it("tells a run again once the chart is done when text before it moved after it was placed, in the order they started", async () => {
      const decorate = holder();
      const { runner } = setup({ decorate });
      runner.enter([input("a", 10), input("b", 20), input("c", 30)]);
      decorate.log.length = 0;
      // The chart tells b, then a: b was placed past a's old box.
      runner.change(bar("b", 21));
      runner.change(bar("a", 11));
      expect(decorate.log).toEqual(["b [10]", "a []"]);
      await Promise.resolve();
      // b goes past a's text as it is now, and c, whose mark didn't move, past both.
      expect(decorate.log).toEqual(["b [10]", "a []", "b [11]", "c [11,21]"]);

      // Text that didn't move tells nothing, and a later run's text never moves an earlier one's.
      decorate.log.length = 0;
      runner.change(bar("a", 11));
      runner.change(bar("c", 31));
      await Promise.resolve();
      expect(decorate.log).toEqual(["a []", "c [11,21]"]);

      // Letting go is moving too: the runs after it are placed again without it.
      decorate.log.length = 0;
      runner.leave();
      void runner.exit([input("a", 11)]);
      await Promise.resolve();
      expect(decorate.log).toEqual(["b []", "c [21]"]);
    });
  });

  it("ignores changes and leaves for marks it hasn't seen", () => {
    const hover = probe();
    const { runner } = setup({ hover });
    runner.change(bar("ghost"));
    runner.leave(["ghost"]);
    expect(hover.log).toEqual([]);
  });

  it("follows the page-wide motion and clock by default", async () => {
    const hover = probe();
    const runner = createRunner({ effects: { hover }, surface: recordingSurface() });
    runner.hover([input("a")]);
    expect(hover.contexts[0]!.motion.mode).toBe("presentation");
    expect(hover.contexts[0]!.icons.get("dot")).toBeUndefined();
    runner.destroy();
    await flush();
    expect(hover.log).toEqual(["run a #0", "clear #0", "cancelled a #0"]);
  });
});
