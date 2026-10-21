import { manualClock } from "../../core";
import { flush } from "../../core/testing";
import { chartTransitions } from "./transitions";

/** A tween stand-in: resolves when `finish` is called. */
function tween() {
  let finish!: () => void;
  const done = new Promise<void>((resolve) => (finish = resolve));
  return { done, finish };
}

function setup() {
  const clock = manualClock();
  const calls: string[] = [];
  const transitions = chartTransitions({
    clock,
    runner: { settle: () => calls.push("settle") },
    leaving: { sweep: () => calls.push("sweep") },
    draw: () => calls.push("draw"),
    land: () => calls.push("land")
  });
  return { clock, calls, transitions };
}

describe("chartTransitions", () => {
  it("draws, then lands, settles the runner and sweeps, at once with nothing running", async () => {
    const { calls, transitions } = setup();
    await transitions.run([]);
    expect(calls).toEqual(["draw", "land", "settle", "sweep"]);
  });

  it("draws every frame until its tweens settle", async () => {
    const { clock, calls, transitions } = setup();
    const t = tween();
    let settled = false;
    void transitions.run([t.done]).then(() => (settled = true));
    clock.advance(16);
    clock.advance(16);
    expect(calls).toEqual(["draw", "draw", "draw"]);
    t.finish();
    await flush();
    expect(settled).toBe(true);
    expect(calls.slice(3)).toEqual(["land", "settle", "sweep"]);
    clock.advance(16);
    expect(calls).toHaveLength(6);
  });

  it("hands an earlier transition's waiters to the one that takes it over", async () => {
    const { calls, transitions } = setup();
    const first = tween();
    const second = tween();
    const settled: string[] = [];
    void transitions.run([first.done]).then(() => settled.push("first"));
    void transitions.run([second.done]).then(() => settled.push("second"));
    first.finish();
    await flush();
    expect(settled).toEqual([]);
    expect(calls).not.toContain("land");
    second.finish();
    await flush();
    expect(settled).toEqual(["first", "second"]);
    expect(calls.filter((call) => call === "land")).toHaveLength(1);
  });

  it("waits for the leaves to be gone, unless another update supersedes it", async () => {
    const { transitions } = setup();
    let gone!: () => void;
    const leave = { exited: false, gone: new Promise<void>((resolve) => (gone = resolve)), resolve: () => gone() };
    let done = false;
    void transitions.wait(Promise.resolve(), [leave]).then(() => (done = true));
    await flush();
    expect(done).toBe(false);
    leave.resolve();
    await flush();
    expect(done).toBe(true);

    let superseded = false;
    void transitions.wait(new Promise<void>(() => {}), []).then(() => (superseded = true));
    transitions.supersede();
    await flush();
    expect(superseded).toBe(true);
  });

  it("stops drawing once destroyed, and never lands", async () => {
    const { clock, calls, transitions } = setup();
    const t = tween();
    let resolved = false;
    void transitions.wait(transitions.run([t.done]), []).then(() => (resolved = true));
    transitions.destroy();
    clock.advance(16);
    t.finish();
    await flush();
    expect(calls).toEqual(["draw"]);
    expect(resolved).toBe(true);
  });
});
