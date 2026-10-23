import { createMotion, describe as build, manualClock, type GeometryEffect, type MarkGeometry } from "../../core";
import { createRunner, type Runner } from "../../core/runner";
import { recordingSurface } from "../../core/testing";
import { svgElement } from "../render/svg";
import { chartEvents } from "./events";
import { chartHover } from "./hover";

/** Three marks, each a group with one segment, with hover wired up as a chart would. */
function setup({ dim = true } = {}) {
  const svg = svgElement("svg", {}, document.body);
  const layer = svgElement("g", {}, svg);
  const live = new Map<string, SVGGElement>();
  for (const key of ["a", "b", "c"]) {
    const group = svgElement("g", { class: "ec-mark", "data-key": key }, layer);
    svgElement("path", { class: "ec-segment", "data-series": "goals" }, group);
    live.set(key, group);
  }
  const runner = { hover: vi.fn(), leave: vi.fn() };
  const events = chartEvents<object>("chart");
  const heard: string[] = [];
  events.on("hover", (event) => heard.push(`hover ${event.source} ${event.segment ?? ""}`.trim()));
  events.on("leave", () => heard.push("leave"));
  const rings: (string | undefined)[] = [];
  const tips: string[] = [];
  const options = { dim };
  const hover = chartHover<object>({
    svg,
    runner,
    events,
    dim: () => options.dim,
    find(target) {
      const group = (target as Element | null)?.closest?.(".ec-mark");
      const key = group?.getAttribute("data-key") ?? undefined;
      if (key === undefined || !live.has(key)) return undefined;
      const segment = (target as Element).closest(".ec-segment")?.getAttribute("data-series") ?? undefined;
      return segment === undefined ? { key } : { key, segment };
    },
    live: (key) => live.has(key),
    order: () => [...live.keys()],
    element: (key) => layer.querySelector<SVGGElement>(`[data-key="${key}"]`) ?? undefined,
    onScreen: (key) => ({ mark: { key } as unknown as MarkGeometry, data: { datum: {}, samples: [], related: () => undefined } }),
    ring: (key) => rings.push(key),
    tooltip: { show: (key) => tips.push(key), hide: () => tips.push("hidden") }
  });
  hover.sync();
  const mark = (key: string) => layer.querySelector<SVGGElement>(`[data-key="${key}"]`)!;
  return { svg, live, runner, events, heard, rings, tips, hover, mark, options };
}

/**
 * Two targets, x 1 and x 2, as a line chart's hit columns: each stands for two series' points, which
 * take the emphasis. `series` is the series at each x, and can change.
 */
function columns(options: { readonly runner?: Pick<Runner<object>, "hover" | "leave"> } = {}) {
  const svg = svgElement("svg", {}, document.body);
  const layer = svgElement("g", {}, svg);
  const series = { now: ["a", "b"] };
  const xs = new Set(["1", "2"]);
  const targets = new Map<string, SVGRectElement>();
  for (const x of xs) targets.set(x, svgElement("rect", { class: "ec-mark ec-hit", "data-key": x }, layer));
  const points = new Map<string, SVGCircleElement>();
  const point = (key: string) => {
    let element = points.get(key);
    if (!element) points.set(key, (element = svgElement("circle", { class: "ec-point", "data-key": key }, layer)));
    return element;
  };
  const mock = { hover: vi.fn(), leave: vi.fn() };
  const runner = options.runner ?? mock;
  const events = chartEvents<object>("chart");
  const heard: string[] = [];
  events.on("hover", (event) => heard.push(`hover ${event.mark.key} ${event.batch.index}/${event.batch.count} ${event.source}`));
  events.on("leave", (event) => heard.push(`leave ${event.mark.key} ${event.batch.index}/${event.batch.count}`));
  const rings: (string | undefined)[] = [];
  const tips: string[] = [];
  const hover = chartHover<object>({
    svg,
    runner,
    events,
    dim: () => false,
    find(target) {
      const key = (target as Element | null)?.closest?.(".ec-hit")?.getAttribute("data-key") ?? undefined;
      return key !== undefined && xs.has(key) ? { key } : undefined;
    },
    live: (key) => xs.has(key),
    order: () => [...xs],
    marks: (key) => series.now.map((name) => `${name}@${key}`),
    element: (key) => targets.get(key),
    markElement: point,
    onScreen: (key) => (key.includes("@") ? { mark: build.point({ key, x: 10, y: 10, r: 4.5 }), data: { datum: {}, samples: [], related: () => undefined } } : undefined),
    ring: (key) => rings.push(key),
    tooltip: { show: (key) => tips.push(key), hide: () => tips.push("hidden") }
  });
  hover.sync();
  const hot = () => [...points].filter(([, element]) => element.classList.contains("ec-hot")).map(([key]) => key);
  const hovers = () => mock.hover.mock.calls.map(([marks]) => (marks as { mark: MarkGeometry }[]).map((input) => input.mark.key));
  return { svg, targets, series, xs, runner: mock, heard, rings, tips, hover, hot, hovers };
}

function pointer(type: string, target: Element): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "mouse" }));
}

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("chartHover", () => {
  afterEach(() => {
    document.body.textContent = "";
  });

  it("emphasises the mark under the pointer and dims the others", () => {
    const { svg, runner, heard, tips, hover, mark } = setup();
    pointer("pointerover", mark("b").firstElementChild!);
    expect(mark("b").classList.contains("ec-hot")).toBe(true);
    expect(svg.classList.contains("ec-hovering")).toBe(true);
    expect(tips).toEqual(["hidden", "b"]);
    expect(runner.hover).toHaveBeenCalledTimes(1);
    expect(heard).toEqual(["hover pointer goals"]);
    expect(hover.key).toBe("b");

    pointer("pointerleave", svg);
    expect(mark("b").classList.contains("ec-hot")).toBe(false);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    expect(runner.leave).toHaveBeenCalledWith(["b"]);
    expect(heard).toEqual(["hover pointer goals", "leave"]);
    expect(hover.key).toBeUndefined();
  });

  it("doesn't dim with `dim: false`, and syncs the dimming when it changes", () => {
    const { svg, hover, mark, options } = setup({ dim: false });
    pointer("pointerover", mark("a"));
    expect(mark("a").classList.contains("ec-hot")).toBe(true);
    expect(svg.classList.contains("ec-hovering")).toBe(false);
    options.dim = true;
    hover.syncDim();
    expect(svg.classList.contains("ec-hovering")).toBe(true);
    options.dim = false;
    hover.syncDim();
    expect(svg.classList.contains("ec-hovering")).toBe(false);
  });

  it("holds a keyboard hover, with the ring, until Escape", () => {
    const { svg, heard, rings, hover, mark } = setup();
    press(document.body, "Tab");
    mark("a").focus();
    expect(rings).toEqual(["a"]);
    expect(hover.ringKey).toBe("a");
    expect(heard).toEqual(["hover keyboard"]);
    pointer("pointerleave", svg);
    expect(hover.key).toBe("a");
    press(mark("a"), "Escape");
    expect(hover.key).toBeUndefined();
    expect(heard).toEqual(["hover keyboard", "leave"]);
    expect(document.activeElement).toBe(mark("a"));
  });

  it("hands the hover back to the pointer on blur while it's still over the mark", () => {
    const { heard, hover, mark } = setup();
    pointer("pointerover", mark("a"));
    press(document.body, "Tab");
    mark("a").focus();
    expect(heard).toEqual(["hover pointer"]);
    mark("a").blur();
    expect(hover.key).toBe("a");
    expect(hover.ringKey).toBeUndefined();
    expect(heard).toEqual(["hover pointer"]);
  });

  it("leaves the hover to the pointer when focus comes from a click", () => {
    const { heard, rings, hover, mark } = setup();
    pointer("pointerover", mark("b"));
    mark("b").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
    mark("b").focus();
    expect(rings).toEqual([undefined]);
    expect(hover.ringKey).toBeUndefined();
    expect(heard).toEqual(["hover pointer"]);
  });

  it("moves focus with focus(key) as a key press would, after a click too, and only to a live target", () => {
    const { heard, rings, hover, mark, live } = setup();
    mark("b").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
    hover.focus("b");
    expect(document.activeElement).toBe(mark("b"));
    expect(hover.ringKey).toBe("b");
    expect(hover.key).toBe("b");
    expect(heard).toEqual(["hover keyboard"]);
    live.delete("c");
    hover.focus("c");
    hover.focus("z");
    expect(document.activeElement).toBe(mark("b"));
    expect(rings).toEqual(["b"]);
  });

  it("ends a hover whose mark has left", () => {
    const { live, heard, hover, mark } = setup();
    pointer("pointerover", mark("c"));
    live.delete("c");
    hover.dropGone();
    expect(hover.key).toBeUndefined();
    expect(heard).toEqual(["hover pointer", "leave"]);
    expect(mark("c").classList.contains("ec-hot")).toBe(false);
  });

  it("moves the ring and the tooltip with a restyled mark", () => {
    const { rings, tips, hover, mark } = setup();
    press(document.body, "Tab");
    mark("a").focus();
    rings.length = 0;
    tips.length = 0;
    hover.restyled("a");
    hover.restyled("b");
    expect(rings).toEqual(["a"]);
    expect(tips).toEqual(["a"]);
  });

  it("gives a target that is its own mark a batch of one", () => {
    const { svg, mark, runner, events } = setup();
    const batches: string[] = [];
    events.on("hover", (event) => batches.push(`hover ${event.mark.key} ${event.batch.index}/${event.batch.count}`));
    events.on("leave", (event) => batches.push(`leave ${event.mark.key} ${event.batch.index}/${event.batch.count}`));
    pointer("pointerover", mark("b"));
    expect(runner.hover.mock.calls[0]![0]).toHaveLength(1);
    pointer("pointerleave", svg);
    expect(runner.leave).toHaveBeenCalledWith(["b"]);
    expect(batches).toEqual(["hover b 0/1", "leave b 0/1"]);
  });
});

describe("chartHover: a target that stands for several marks", () => {
  afterEach(() => {
    document.body.textContent = "";
  });

  it("hovers every mark of the target in one batch, and leaving ends them all", () => {
    const { svg, targets, runner, heard, tips, hover, hot, hovers } = columns();
    pointer("pointerover", targets.get("2")!);
    expect(hover.key).toBe("2");
    expect(hot()).toEqual(["a@2", "b@2"]);
    // The target's own element isn't a mark here: it takes focus, not the emphasis.
    expect(targets.get("2")!.classList.contains("ec-hot")).toBe(false);
    expect(hovers()).toEqual([["a@2", "b@2"]]);
    expect(heard).toEqual(["hover a@2 0/2 pointer", "hover b@2 1/2 pointer"]);
    expect(tips).toEqual(["hidden", "2"]);

    pointer("pointerover", targets.get("1")!);
    expect(hot()).toEqual(["a@1", "b@1"]);
    expect(runner.leave).toHaveBeenCalledWith(["a@2", "b@2"]);
    expect(heard.slice(2)).toEqual(["leave a@2 0/2", "leave b@2 1/2", "hover a@1 0/2 pointer", "hover b@1 1/2 pointer"]);

    pointer("pointerleave", svg);
    expect(hot()).toEqual([]);
    expect(runner.leave).toHaveBeenLastCalledWith(["a@1", "b@1"]);
    expect(heard.slice(6)).toEqual(["leave a@1 0/2", "leave b@1 1/2"]);
    expect(hover.key).toBeUndefined();
  });

  it("keeps the keyboard a flat list of targets, each hovering its marks", () => {
    const { targets, heard, rings, hover, hot } = columns();
    expect(targets.get("1")!.getAttribute("tabindex")).toBe("0");
    expect(targets.get("2")!.getAttribute("tabindex")).toBe("-1");
    press(document.body, "Tab");
    targets.get("1")!.focus();
    expect(hot()).toEqual(["a@1", "b@1"]);
    expect(rings).toEqual(["1"]);
    press(targets.get("1")!, "ArrowRight");
    expect(document.activeElement).toBe(targets.get("2"));
    expect(hover.key).toBe("2");
    expect(hot()).toEqual(["a@2", "b@2"]);
    expect(heard).toEqual(["hover a@1 0/2 keyboard", "hover b@1 1/2 keyboard", "leave a@1 0/2", "leave b@1 1/2", "hover a@2 0/2 keyboard", "hover b@2 1/2 keyboard"]);
    press(targets.get("2")!, "Escape");
    expect(hot()).toEqual([]);
    expect(hover.key).toBeUndefined();
  });

  it("moves the ring and the tooltip when one of the target's marks is restyled", () => {
    const { targets, rings, tips, hover } = columns();
    press(document.body, "Tab");
    targets.get("1")!.focus();
    rings.length = 0;
    tips.length = 0;
    hover.restyled("b@1");
    hover.restyled("a@2");
    expect(rings).toEqual(["1"]);
    expect(tips).toEqual(["1"]);
  });

  it("follows the marks the target stands for after they change", () => {
    const { targets, series, runner, heard, hover, hot, hovers } = columns();
    pointer("pointerover", targets.get("1")!);
    heard.length = 0;
    // A series joins and another leaves: the hover goes on, on the marks there now.
    series.now = ["b", "c"];
    hover.dropGone();
    expect(hover.key).toBe("1");
    expect(hot()).toEqual(["b@1", "c@1"]);
    // The runner hears the whole new batch; the new mark's event has its place in it.
    expect(runner.leave).toHaveBeenLastCalledWith(["a@1", "b@1"]);
    expect(hovers()).toEqual([
      ["a@1", "b@1"],
      ["b@1", "c@1"]
    ]);
    expect(heard).toEqual(["leave a@1 0/1", "hover c@1 1/2 pointer"]);
    // Nothing changed: nothing is heard.
    hover.dropGone();
    expect(heard).toHaveLength(2);
    expect(hovers()).toHaveLength(2);
    // The same marks in another order: the runner hears it, and nobody joined or left.
    series.now = ["c", "b"];
    hover.dropGone();
    expect(hovers()[2]).toEqual(["c@1", "b@1"]);
    expect(heard).toHaveLength(2);
  });

  it("places a mark that joins mid-change where the runner's settled batch puts it", () => {
    const clock = manualClock();
    const motion = createMotion({ mode: "presentation", reducedMotion: { matches: false, subscribe: () => () => {} } });
    const ran: string[] = [];
    const record: GeometryEffect = {
      kind: "geometry",
      run(mark, ctx) {
        ran.push(`${mark.key} ${ctx.batch.index}/${ctx.batch.count}`);
        return new Promise<void>((resolve) => ctx.signal.addEventListener("abort", () => resolve()));
      },
      end() {},
      clear() {}
    };
    const runner = createRunner<object>({ effects: { hover: record }, surface: recordingSurface(), motion, clock, icons: { get: () => undefined } });
    const { targets, series, heard, hover } = columns({ runner });
    pointer("pointerover", targets.get("1")!);
    expect(ran).toEqual(["a@1 0/2", "b@1 1/2"]);
    // An update, as playUpdate plays it: interrupt, the marks change, the hover follows, and it settles.
    ran.length = 0;
    heard.length = 0;
    runner.interrupt();
    series.now = ["b", "c"];
    hover.dropGone();
    expect(ran).toEqual([]);
    runner.settle();
    expect(ran).toEqual(["b@1 0/2", "c@1 1/2"]);
    expect(heard).toEqual(["leave a@1 0/1", "hover c@1 1/2 pointer"]);
    runner.destroy();
  });

  it("ends the hover when its target leaves", () => {
    const { targets, xs, heard, hover, hot } = columns();
    pointer("pointerover", targets.get("2")!);
    xs.delete("2");
    hover.dropGone();
    expect(hover.key).toBeUndefined();
    expect(hot()).toEqual([]);
    expect(heard.slice(2)).toEqual(["leave a@2 0/2", "leave b@2 1/2"]);
  });
});
