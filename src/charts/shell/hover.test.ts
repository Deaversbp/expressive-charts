import type { MarkGeometry } from "../../core";
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
  return { svg, live, runner, heard, rings, tips, hover, mark, options };
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
});
