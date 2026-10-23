import { manualClock } from "./clock";
import type { TransitionContext, TransitionEffect } from "./contracts/effect";
import type { MarkGeometry } from "./contracts/geometry";
import type { Icon } from "./contracts/icon";
import { linear } from "./easing";
import { describe as build } from "./geometry";
import { createMotion, type MotionMode, type ReducedMotionSource } from "./motion";
import { report } from "./report";
import { recordingLayer, type RecordingLayer } from "./testing";
import { isTransitionEffect, playTransition, type TransitionPair, type TransitionSurface } from "./transition";

vi.mock("./report", () => ({ report: vi.fn() }));

beforeEach(() => {
  vi.mocked(report).mockClear();
});

const dot: Icon = {
  name: "dot",
  shapes: [{ d: "M0,-4A4,4 0 0 1 0,4A4,4 0 0 1 0,-4Z" }],
  box: { x: -4, y: -4, width: 8, height: 8 },
  size: 8,
  anchor: { x: 0, y: 0 },
  pivot: { x: 0, y: 0 },
  footprint: [4, 4]
};

const slice = (key: string, start: number, end: number): MarkGeometry => build.arc({ key, cx: 150, cy: 150, inner: 70, outer: 116, start, end });
const column = (key: string, x: number, height: number): MarkGeometry => build.bar({ key, x, y: 200 - height, width: 40, height, baseline: "bottom" });

const pairs: TransitionPair[] = [
  { from: slice("Goal", 0, 1), to: column("Goal", 0, 80) },
  { from: slice("Saved", 1, 3), to: column("Saved", 60, 160) }
];

/** Lets pending promise callbacks run: effects resolving, and the player noticing. */
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

interface Group {
  readonly key: string;
  readonly order: number;
  readonly layer: RecordingLayer;
  cleared: boolean;
}

/** A TransitionSurface in memory: every group a recording layer. */
function surface(): TransitionSurface & { readonly groups: Group[]; picture(key?: string): ReturnType<RecordingLayer["picture"]> } {
  const groups: Group[] = [];
  return {
    groups,
    group(key, order) {
      const record: Group = { key, order, layer: recordingLayer(), cleared: false };
      groups.push(record);
      return {
        icon: (icon, options) => record.layer.icon(icon, options),
        path: (d, paint) => record.layer.path(d, paint),
        text: (content, style) => record.layer.text(content, style),
        clear() {
          record.cleared = true;
          record.layer.clear();
        }
      };
    },
    picture(key) {
      return groups
        .filter((group) => !group.cleared && (key === undefined || group.key === key))
        .sort((a, b) => a.order - b.order)
        .flatMap((group) => group.layer.picture());
    }
  };
}

function setup(mode: MotionMode = "presentation") {
  const clock = manualClock();
  const reduced = reducedMotion();
  const motion = createMotion({ mode, reducedMotion: reduced });
  return { clock, reduced, motion, surface: surface(), icons: { get: (name: string) => (name === "dot" ? dot : undefined) } };
}

interface Probe extends TransitionEffect {
  /** Every call, tagged with the run it belongs to: "run Goal #0", "done Goal #0", "clear #0", "end Goal #2". */
  readonly log: string[];
  readonly contexts: TransitionContext[];
}

/** A line from `from`'s centre, p of the way to `to`'s. */
const line = (from: MarkGeometry, to: MarkGeometry, p: number): string => {
  const x = from.center.x + (to.center.x - from.center.x) * p;
  const y = from.center.y + (to.center.y - from.center.y) * p;
  return `M${from.center.x},${from.center.y}L${x},${y}`;
};

/** Draws a line from `from`'s centre toward `to`'s over `duration` ms; its end state is the whole line. */
function probe(duration = 100): Probe {
  const log: string[] = [];
  const contexts: TransitionContext[] = [];
  const begin = (ctx: TransitionContext): string => {
    contexts.push(ctx);
    return `#${contexts.length - 1}`;
  };
  return {
    kind: "transition",
    log,
    contexts,
    async run(from, to, ctx) {
      const tag = begin(ctx);
      log.push(`run ${to.key} ${tag}`);
      const path = ctx.layer.path(line(from, to, ctx.start), { stroke: "mark" });
      const result = await ctx.tween({ duration, ease: linear, update: (p) => path.update(line(from, to, ctx.start + (1 - ctx.start) * p)) }).finished;
      log.push(`${result} ${to.key} ${tag}`);
    },
    end(from, to, ctx) {
      const tag = begin(ctx);
      log.push(`end ${to.key} ${tag}`);
      ctx.layer.path(line(from, to, 1), { stroke: "mark" });
    },
    clear(ctx) {
      log.push(`clear #${contexts.indexOf(ctx)}`);
    }
  };
}

/** What a probe leaves for a pair, finished or ended. */
const drawn = ({ from, to }: TransitionPair) => ({ kind: "path", d: line(from, to, 1), paint: { stroke: "mark" } });

describe("playTransition", () => {
  describe("contexts", () => {
    it("gives each pair its own context, with start", async () => {
      const effect = probe();
      const { clock, motion, surface: overlay, icons } = setup();
      playTransition(pairs, { effect, surface: overlay, motion, clock, icons, start: 0.25 });

      const [a, b] = effect.contexts;
      expect(a).not.toBe(b);
      expect(a!.signal).not.toBe(b!.signal);
      expect(a!.signal.aborted).toBe(false);
      expect(a!.motion.mode).toBe("presentation");
      expect([a!.start, b!.start]).toEqual([0.25, 0.25]);
      expect(a!.batch).toEqual({ index: 0, count: 2 });
      expect(b!.batch).toEqual({ index: 1, count: 2 });
      expect(a!.icons.get("dot")).toBe(dot);
      expect(a).not.toHaveProperty("previous");
      // Each pair's group is asked for on its first draw, for its key, stacked in the pairs' order.
      expect(overlay.groups.map((group) => [group.key, group.order])).toEqual([
        ["Goal", 0],
        ["Saved", 1]
      ]);
    });

    it("starts at 0 by default", () => {
      const effect = probe();
      const { clock, motion, surface: overlay } = setup();
      playTransition(pairs, { effect, surface: overlay, motion, clock });
      expect(effect.contexts.map((ctx) => ctx.start)).toEqual([0, 0]);
    });

    it("hands out a mark that does nothing and changes that never come", async () => {
      const heard: string[] = [];
      const effect: TransitionEffect = {
        kind: "transition",
        async run(_from, _to, ctx) {
          ctx.mark.set({ emphasis: 1, opacity: 0.2 });
          ctx.mark.reset();
          ctx.onChange((mark) => heard.push(mark.key));
          await ctx.tween({ duration: 100, update: () => {} }).finished;
        },
        end() {},
        clear() {}
      };
      const { clock, motion, surface: overlay } = setup();
      const transition = playTransition(pairs, { effect, surface: overlay, motion, clock });
      for (let i = 0; i < 8; i++) clock.advance(16);
      await transition.finished;
      expect(heard).toEqual([]);
      expect(overlay.groups).toEqual([]);
    });

    it("binds tweens to the run", async () => {
      const results: Promise<string>[] = [];
      const effect: TransitionEffect = {
        kind: "transition",
        async run(_from, _to, ctx) {
          results.push(ctx.tween({ duration: 100, update: () => {} }).finished);
        },
        end() {},
        clear() {}
      };
      const { clock, motion, surface: overlay } = setup();
      const transition = playTransition(pairs, { effect, surface: overlay, motion, clock });
      clock.advance(16);
      transition.clear();
      expect(await Promise.all(results)).toEqual(["cancelled", "cancelled"]);
    });
  });

  describe("playing", () => {
    it("resolves when every pair has finished, and keeps their end states drawn until cleared", async () => {
      const effect = probe();
      const { clock, motion, surface: overlay } = setup();
      const transition = playTransition(pairs, { effect, surface: overlay, motion, clock });
      let finished = false;
      void transition.finished.then(() => (finished = true));

      clock.advance(50);
      expect(overlay.picture("Goal")).toEqual([{ kind: "path", d: line(pairs[0]!.from, pairs[0]!.to, 0.5), paint: { stroke: "mark" } }]);
      await flush();
      expect(finished).toBe(false);
      clock.advance(50);
      await flush();
      expect(finished).toBe(true);
      expect(clock.idle).toBe(true);
      expect(effect.log).toEqual(["run Goal #0", "run Saved #1", "done Goal #0", "done Saved #1"]);
      expect(overlay.picture()).toEqual(pairs.map(drawn));

      transition.clear();
      expect(overlay.picture()).toEqual([]);
      expect(overlay.groups.every((group) => group.cleared)).toBe(true);
      expect(effect.log.slice(4)).toEqual(["clear #0", "clear #1"]);
    });

    it("resolves at once with no pairs, and never subscribes", async () => {
      const { clock, motion, surface: overlay, reduced } = setup();
      const transition = playTransition([], { effect: probe(), surface: overlay, motion, clock });
      await transition.finished;
      expect(reduced.listening).toBe(0);
    });

    it("stops following the motion mode once every pair has finished", async () => {
      const { clock, motion, surface: overlay, reduced } = setup();
      const transition = playTransition(pairs, { effect: probe(), surface: overlay, motion, clock });
      expect(reduced.listening).toBe(1);
      for (let i = 0; i < 7; i++) clock.advance(16);
      await transition.finished;
      expect(reduced.listening).toBe(0);
    });
  });

  describe("motion off", () => {
    it("draws end() instead of run(), with no frames", async () => {
      const effect = probe();
      const { clock, motion, surface: overlay } = setup("off");
      const transition = playTransition(pairs, { effect, surface: overlay, motion, clock, start: 0.5 });
      expect(effect.log).toEqual(["end Goal #0", "end Saved #1"]);
      expect(effect.contexts.map((ctx) => ctx.start)).toEqual([0.5, 0.5]);
      expect(clock.idle).toBe(true);
      await transition.finished;
      expect(overlay.picture()).toEqual(pairs.map(drawn));
    });

    it("draws end() under reduced motion, unless the viewer chose a mode", async () => {
      const effect = probe();
      const { clock, motion, surface: overlay, reduced } = setup();
      reduced.set(true);
      playTransition(pairs.slice(0, 1), { effect, surface: overlay, motion, clock });
      motion.chooseMode("analysis");
      playTransition(pairs.slice(1), { effect, surface: overlay, motion, clock });
      expect(effect.log).toEqual(["end Goal #0", "run Saved #1"]);
    });

    it("replaces runs still going with end() on a fresh context when motion turns off mid-run", async () => {
      const effect = probe();
      const { clock, motion, surface: overlay } = setup();
      const transition = playTransition(pairs, { effect, surface: overlay, motion, clock, start: 0.25 });
      clock.advance(50);
      const [first] = effect.contexts;
      motion.setMode("off");
      await flush();

      expect(first!.signal.aborted).toBe(true);
      expect(effect.log).toEqual(["run Goal #0", "run Saved #1", "clear #0", "end Goal #2", "clear #1", "end Saved #3", "cancelled Goal #0", "cancelled Saved #1"]);
      // The replacement is a fresh context in the run's place: its start, its batch and its order.
      expect(effect.contexts[2]).not.toBe(first);
      expect(effect.contexts[2]!.start).toBe(0.25);
      expect(effect.contexts[3]!.batch).toEqual({ index: 1, count: 2 });
      expect(overlay.groups.map((group) => [group.key, group.order, group.cleared])).toEqual([
        ["Goal", 0, true],
        ["Saved", 1, true],
        ["Goal", 0, false],
        ["Saved", 1, false]
      ]);
      expect(overlay.picture()).toEqual(pairs.map(drawn));
      await transition.finished;
    });
  });

  describe("clearing", () => {
    it("aborts every run, calls clear() and empties the groups", async () => {
      const effect = probe();
      const { clock, motion, surface: overlay } = setup();
      const transition = playTransition(pairs, { effect, surface: overlay, motion, clock });
      clock.advance(50);
      transition.clear();
      await transition.finished;
      expect(effect.contexts.every((ctx) => ctx.signal.aborted)).toBe(true);
      expect(effect.log).toEqual(["run Goal #0", "run Saved #1", "clear #0", "clear #1", "cancelled Goal #0", "cancelled Saved #1"]);
      expect(overlay.picture()).toEqual([]);
      expect(clock.idle).toBe(true);

      transition.clear();
      expect(effect.log).toHaveLength(6);
    });

    it("ignores draws after the clear, from an effect that ignores its signal", async () => {
      let late: (() => void) | undefined;
      const effect: TransitionEffect = {
        kind: "transition",
        run: (_from, _to, ctx) =>
          new Promise<void>((resolve) => {
            late = () => {
              ctx.layer.path("M0,0L1,1", { stroke: "mark" }).update("M0,0L2,2");
              ctx.layer.text("late", { at: { x: 0, y: 0 } });
              resolve();
            };
          }),
        end() {},
        clear() {}
      };
      const { clock, motion, surface: overlay } = setup();
      const transition = playTransition(pairs.slice(0, 1), { effect, surface: overlay, motion, clock });
      transition.clear();
      late!();
      await transition.finished;
      expect(overlay.groups).toEqual([]);
    });
  });

  describe("errors", () => {
    it("reports a throwing or rejecting effect and clears that pair, while the others carry on", async () => {
      const effect = probe();
      const broken: TransitionEffect = {
        ...effect,
        run(from, to, ctx) {
          if (to.key === "Goal") throw new Error("Goal broke");
          if (to.key === "Saved") return Promise.reject(new Error("Saved broke"));
          return effect.run(from, to, ctx);
        }
      };
      const { clock, motion, surface: overlay } = setup();
      const three = [...pairs, { from: slice("Off target", 3, 5), to: column("Off target", 120, 190) }];
      const transition = playTransition(three, { effect: broken, surface: overlay, motion, clock });
      await flush();
      expect(vi.mocked(report).mock.calls.map(([error]) => (error as Error).message)).toEqual(["Goal broke", "Saved broke"]);
      for (let i = 0; i < 7; i++) clock.advance(16);
      await transition.finished;
      expect(overlay.picture()).toEqual([drawn(three[2]!)]);
    });

    it("reports a throwing end() and a throwing clear()", async () => {
      const effect: TransitionEffect = {
        kind: "transition",
        run: async () => {},
        end() {
          throw new Error("end broke");
        },
        clear() {
          throw new Error("clear broke");
        }
      };
      const { clock, motion, surface: overlay } = setup("off");
      const transition = playTransition(pairs.slice(0, 1), { effect, surface: overlay, motion, clock });
      await transition.finished;
      expect(vi.mocked(report).mock.calls.map(([error]) => (error as Error).message)).toEqual(["end broke", "clear broke"]);
    });

    it("doesn't report a run that rejects because it was aborted", async () => {
      const effect: TransitionEffect = {
        kind: "transition",
        run: (_from, _to, ctx) => new Promise((_resolve, reject) => ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason))),
        end() {},
        clear() {}
      };
      const { clock, motion, surface: overlay } = setup();
      const transition = playTransition(pairs, { effect, surface: overlay, motion, clock });
      transition.clear();
      await transition.finished;
      await flush();
      expect(report).not.toHaveBeenCalled();
    });

    it("throws on an effect that isn't a transition, and on a start outside 0–1", () => {
      const { clock, motion, surface: overlay } = setup();
      const geometry = { kind: "geometry", run: async () => {}, end() {}, clear() {} };
      expect(() => playTransition(pairs, { effect: geometry as never, surface: overlay, motion, clock })).toThrow(
        /playTransition needs a transition effect .* got a geometry effect, which plays on one mark/
      );
      expect(() => playTransition(pairs, { effect: { kind: "transition" } as never, surface: overlay, motion, clock })).toThrow(/a transition effect without run\(\)/);
      for (const start of [-0.1, 1.5, Number.NaN, "0.5"]) {
        expect(() => playTransition(pairs, { effect: probe(), surface: overlay, motion, clock, start: start as number })).toThrow(RangeError);
      }
      expect(overlay.groups).toEqual([]);
    });
  });

  it("tells transition effects from others", () => {
    expect(isTransitionEffect(probe())).toBe(true);
    expect(isTransitionEffect({ kind: "transition", run: () => {} })).toBe(false);
    expect(isTransitionEffect({ kind: "geometry", run: () => {}, end: () => {}, clear: () => {} })).toBe(false);
    expect(isTransitionEffect(null)).toBe(false);
  });
});
