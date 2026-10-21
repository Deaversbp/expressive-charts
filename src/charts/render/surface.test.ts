import { matrix, type Icon, type MarkHandle } from "../../core";
import { svgSurface } from "./surface";
import { svgElement } from "./svg";
import { seriesColors } from "./theme";

const ball: Icon = {
  name: "ball",
  shapes: [
    { d: "M-8,0A8,8 0 1 1 8,0A8,8 0 1 1 -8,0Z", fill: "#ffffff" },
    { d: "M0,-3L3,0L0,3L-3,0Z", fill: "#1d1c1a", clip: "M-8,0A8,8 0 1 1 8,0A8,8 0 1 1 -8,0Z" },
    { d: "M-7,0L7,0", fill: "none", stroke: "text", width: 1.5 }
  ],
  box: { x: -8, y: -8, width: 16, height: 16 },
  size: 16,
  anchor: { x: 0, y: 0 },
  pivot: { x: 0, y: 0 },
  footprint: [8, 8]
};

const boot: Icon = { ...ball, name: "boot", shapes: [{ d: "M0,0L26,0L26,-14Z" }], size: 26, anchor: { x: 0, y: -6 } };

function setup() {
  const svg = svgElement("svg", {}, document.body);
  const overlay = svgElement("g", { class: "ec-overlay" }, svg);
  const marks = new Map<string, MarkHandle>();
  const slots = new Map([["a", 4]]);
  const surface = svgSurface({
    overlay,
    mark: (key) => marks.get(key) ?? { set() {}, reset() {} },
    colors: (key) => (slots.has(key) ? seriesColors(slots.get(key)!) : undefined)
  });
  return { svg, overlay, surface, slots };
}

afterEach(() => {
  document.body.textContent = "";
});

describe("svgSurface groups", () => {
  it("stacks run groups by start order, not by when they were asked for", () => {
    const { overlay, surface } = setup();
    surface.group("a", "hover", 5);
    surface.group("a", "decorate", 2);
    surface.group("b", "enter", 9);
    surface.group("b", "hover", 3);
    expect(Array.from(overlay.children, (g) => `${g.getAttribute("data-key")}:${g.getAttribute("data-slot")}`)).toEqual([
      "a:decorate",
      "b:hover",
      "a:hover",
      "b:enter"
    ]);
  });

  it("sets the mark's colours for the mark token, and clear() removes the group", () => {
    const { overlay, surface } = setup();
    const group = surface.group("a", "hover", 1);
    const element = overlay.firstElementChild as SVGGElement;
    expect(element.style.getPropertyValue("--ec-mark")).toBe("var(--ec-series-4, #eda100)");
    expect(element.style.getPropertyValue("--ec-mark-strong")).toBe("var(--ec-series-4-strong, #c98500)");
    group.path("M0,0L10,0", { stroke: "mark", width: 2 });
    expect((element.querySelector("path") as SVGPathElement).style.getPropertyValue("stroke")).toBe("var(--ec-mark, var(--ec-series-1, #2a78d6))");
    group.clear();
    expect(overlay.childElementCount).toBe(0);
    // Handles from a cleared group keep working on the detached elements.
    expect(() => group.path("M0,0", { fill: "text" }).update("M1,1")).not.toThrow();
  });

  it("recolours a key's live groups when its colours change", () => {
    const { overlay, surface, slots } = setup();
    slots.set("b", 3);
    const cleared = surface.group("a", "decorate", 1);
    const clearedGroup = overlay.lastElementChild as SVGGElement;
    surface.group("a", "hover", 2);
    surface.group("b", "hover", 3);
    cleared.clear();
    slots.set("a", 2);
    surface.recolor("a");
    const mark = (g: Element) => (g as SVGGElement).style.getPropertyValue("--ec-mark");
    expect(Array.from(overlay.children, mark)).toEqual(["var(--ec-series-2, #eb6834)", "var(--ec-series-3, #1baf7a)"]);
    expect(mark(clearedGroup)).toBe("var(--ec-series-4, #eda100)");
    expect(() => surface.recolor("missing")).not.toThrow();
  });
});

describe("svgLayer icons", () => {
  it("hides an icon until it's placed, then applies the transform", () => {
    const { overlay, surface } = setup();
    const icon = surface.group("a", "hover", 1).icon(ball);
    const placed = overlay.querySelector(".ec-icon") as SVGGElement;
    expect(placed.getAttribute("visibility")).toBe("hidden");
    expect(placed.getAttribute("data-icon")).toBe("ball");
    icon.place(matrix.translate(40.5, 12));
    expect(placed.getAttribute("visibility")).toBeNull();
    expect(placed.getAttribute("transform")).toBe("matrix(1 0 0 1 40.5 12)");
    icon.remove();
    expect(overlay.querySelector(".ec-icon")).toBeNull();
  });

  it("scales by size / icon.size about the anchor, in icon space, before place()", () => {
    const { overlay, surface } = setup();
    surface.group("a", "hover", 1).icon(boot, { size: 13 }).place(matrix.translate(100, 50));
    const placed = overlay.querySelector(".ec-icon") as SVGGElement;
    const scaled = placed.firstElementChild as SVGGElement;
    // scale(0.5) about the anchor (0, -6) keeps the anchor fixed, so it lands where place() alone puts it.
    expect(scaled.getAttribute("transform")).toBe("matrix(0.5 0 0 0.5 0 -3)");
    expect(placed.getAttribute("transform")).toBe("matrix(1 0 0 1 100 50)");
    const drawn = matrix.multiply(matrix.translate(100, 50), matrix.scale(0.5, 0.5, boot.anchor));
    expect(matrix.apply(drawn, boot.anchor)).toEqual(matrix.apply(matrix.translate(100, 50), boot.anchor));
  });

  it("draws an icon at its natural size without an extra group", () => {
    const { overlay, surface } = setup();
    surface.group("a", "hover", 1).icon(boot, { size: 26 });
    const placed = overlay.querySelector(".ec-icon") as SVGGElement;
    expect(placed.firstElementChild?.tagName).toBe("path");
  });

  it("rejects a negative size", () => {
    const { surface } = setup();
    expect(() => surface.group("a", "hover", 1).icon(ball, { size: -1 })).toThrow(RangeError);
  });

  it("draws one path per shape with its paint, clipped in icon space", () => {
    const { overlay, surface } = setup();
    surface.group("a", "hover", 1).icon(ball).place(matrix.translate(0, 0));
    surface.group("a", "enter", 2).icon(ball);
    const [disc, pattern, seam] = Array.from(overlay.querySelectorAll(".ec-icon")[0]!.querySelectorAll(":scope > path")) as SVGPathElement[];
    // jsdom normalises hex colours.
    expect(disc!.style.getPropertyValue("fill")).toBe("rgb(255, 255, 255)");
    expect(disc!.style.getPropertyValue("stroke")).toBe("");
    expect(seam!.style.getPropertyValue("fill")).toBe("none");
    expect(seam!.style.getPropertyValue("stroke")).toBe("var(--ec-text, #0b0b0b)");
    expect(seam!.getAttribute("stroke-width")).toBe("1.5");
    // SVG's own caps and joins unless the shape asks.
    expect(seam!.getAttribute("stroke-linecap")).toBeNull();
    expect(seam!.getAttribute("stroke-linejoin")).toBeNull();
    const clipId = /^url\(#(.+)\)$/.exec(pattern!.getAttribute("clip-path") ?? "")?.[1];
    const clipPath = overlay.querySelector(`clipPath[id="${clipId}"]`);
    expect(clipPath?.querySelector("path")?.getAttribute("d")).toBe(ball.shapes[1]!.clip);
    // Every drawing gets its own clip id.
    const ids = Array.from(overlay.querySelectorAll("clipPath"), (c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("draws no fill or stroke where a shape sets none", () => {
    const { overlay, surface } = setup();
    surface.group("a", "hover", 1).icon(boot);
    const path = overlay.querySelector(".ec-icon path") as SVGPathElement;
    // Explicitly, since SVG's default fill is black.
    expect(path.style.getPropertyValue("fill")).toBe("none");
    expect(path.style.getPropertyValue("stroke")).toBe("");
    expect(path.getAttribute("stroke-width")).toBeNull();
  });

  it("passes a shape's linecap and linejoin through", () => {
    const { overlay, surface } = setup();
    const laces = { d: "M7,-3L12,-9.5", stroke: "#ffffff", width: 1.4, linecap: "round", linejoin: "round" };
    surface.group("a", "hover", 1).icon({ ...boot, shapes: [laces] });
    const path = overlay.querySelector(".ec-icon path") as SVGPathElement;
    expect(path.getAttribute("stroke-linecap")).toBe("round");
    expect(path.getAttribute("stroke-linejoin")).toBe("round");
  });
});

describe("svgLayer paths and text", () => {
  it("draws unfilled paths and merges paint on update", () => {
    const { overlay, surface } = setup();
    const path = surface.group("a", "decorate", 1).path("M0,0L10,0", { stroke: "negative", width: 3, linecap: "round" });
    const element = overlay.querySelector("path") as SVGPathElement;
    expect(element.style.getPropertyValue("fill")).toBe("none");
    expect(element.style.getPropertyValue("stroke")).toBe("var(--ec-negative, #d03b3b)");
    expect(element.getAttribute("stroke-width")).toBe("3");
    expect(element.getAttribute("stroke-linecap")).toBe("round");
    path.update("M0,0L20,0", { opacity: 0.5 });
    expect(element.getAttribute("d")).toBe("M0,0L20,0");
    expect(element.getAttribute("opacity")).toBe("0.5");
    expect(element.getAttribute("stroke-width")).toBe("3");
    path.update("M0,0L5,0", { stroke: "series-3-strong" });
    expect(element.style.getPropertyValue("stroke")).toBe("var(--ec-series-3-strong, #138a5f)");
    path.remove();
    expect(overlay.querySelector("path")).toBeNull();
  });

  it("draws text in the theme text colour by default", () => {
    const { overlay, surface } = setup();
    const text = surface.group("a", "update", 1).text("+2", { at: { x: 30, y: 12 }, anchor: "middle" });
    const element = overlay.querySelector("text") as SVGTextElement;
    expect(element.textContent).toBe("+2");
    expect(element.getAttribute("class")).toBe("ec-text");
    expect(element.getAttribute("x")).toBe("30");
    expect(element.getAttribute("text-anchor")).toBe("middle");
    expect(element.style.getPropertyValue("fill")).toBe("var(--ec-text, #0b0b0b)");
    text.update({ opacity: 0.4, color: "text-muted" }, "+3");
    expect(element.textContent).toBe("+3");
    expect(element.getAttribute("opacity")).toBe("0.4");
    expect(element.getAttribute("x")).toBe("30");
    expect(element.style.getPropertyValue("fill")).toBe("var(--ec-text-muted, #7d7b75)");
  });
});
