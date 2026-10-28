import { matrix, type Icon, type IconShape, type MarkHandle } from "../../core";
import { svgSurface } from "./surface";
import { svgElement, transformAttribute } from "./svg";
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
  return { svg, overlay, surface, slots, marks };
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
    expect(element.style.getPropertyValue("--ec-mark")).toBe("var(--ec-series-4, #c28409)");
    expect(element.style.getPropertyValue("--ec-mark-strong")).toBe("var(--ec-series-4-strong, #9d6a07)");
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
    expect(Array.from(overlay.children, mark)).toEqual(["var(--ec-series-2, #eb6834)", "var(--ec-series-3, #02a471)"]);
    expect(mark(clearedGroup)).toBe("var(--ec-series-4, #c28409)");
    expect(() => surface.recolor("missing")).not.toThrow();
  });

  it("hides a key's groups, and the ones it gets later, until it's shown again", () => {
    const { overlay, surface } = setup();
    surface.group("a", "decorate", 1);
    surface.group("b", "decorate", 2);
    surface.hide("a", true);
    surface.group("a", "hover", 3);
    const visibility = () => Array.from(overlay.children, (g) => `${g.getAttribute("data-key")}:${g.getAttribute("visibility")}`);
    expect(visibility()).toEqual(["a:hidden", "b:null", "a:hidden"]);
    surface.hide("a", false);
    expect(visibility()).toEqual(["a:null", "b:null", "a:null"]);
    surface.group("a", "enter", 4);
    expect(overlay.lastElementChild!.getAttribute("visibility")).toBeNull();
  });
});

describe("svgSurface groups follow their mark", () => {
  it("gives a run's paths and icons the transform the mark's body has, and not its text", () => {
    const { overlay, surface, marks } = setup();
    const seen: unknown[] = [];
    marks.set("a", { set: (style) => seen.push(style), reset: () => seen.push("reset") });
    const run = surface.group("a", "decorate", 1);
    run.path("M0,0L40,0", { stroke: "negative", width: 3 });
    run.icon(ball).place(matrix.translate(40, 0));
    run.text("+1", { at: { x: 40, y: -8 } });
    surface.group("b", "decorate", 2).path("M0,10L40,10", { stroke: "negative" });
    const turn = matrix.rotate(0.05, { x: 0, y: 0 });
    const mark = surface.mark("a");
    mark.set({ transform: turn });
    const group = overlay.firstElementChild!;
    expect(Array.from(group.children, (child) => child.getAttribute("class"))).toEqual(["ec-follow", "ec-text"]);
    const follow = group.firstElementChild!;
    expect(follow.getAttribute("transform")).toBe(transformAttribute(turn));
    expect(Array.from(follow.children, (child) => child.getAttribute("class"))).toEqual(["ec-path", "ec-icon"]);
    // The icon keeps its own place inside it; the text and the other mark's run stay put.
    expect(follow.querySelector(".ec-icon")!.getAttribute("transform")).toBe("matrix(1 0 0 1 40 0)");
    expect(group.querySelector("text")!.hasAttribute("transform")).toBe(false);
    expect(overlay.querySelector('[data-key="b"] .ec-follow')!.hasAttribute("transform")).toBe(false);
    // The mark's own handle gets the style as given.
    expect(seen).toEqual([{ transform: turn }]);
    // A group asked for later takes it at once.
    surface.group("a", "hover", 3).icon(ball);
    expect(overlay.querySelector('[data-slot="hover"] .ec-follow')!.getAttribute("transform")).toBe(transformAttribute(turn));
    // Other fields leave it alone; undefined, or a reset, takes it away.
    mark.set({ emphasis: 1 });
    expect(follow.getAttribute("transform")).toBe(transformAttribute(turn));
    mark.set({ transform: undefined });
    expect(follow.hasAttribute("transform")).toBe(false);
    mark.set({ transform: turn });
    mark.reset();
    expect(Array.from(overlay.querySelectorAll(".ec-follow"), (g) => g.getAttribute("transform"))).toEqual([null, null, null]);
    expect(seen[seen.length - 1]).toBe("reset");
  });

  it("keeps what a run draws in the order it was drawn: text between paths starts another group", () => {
    const { overlay, surface } = setup();
    const run = surface.group("a", "decorate", 1);
    run.path("M0,0L10,0", { fill: "surface" });
    run.icon(ball);
    const name = run.text("Okafor", { at: { x: 2, y: 4 } });
    run.path("M0,0L10,0", { stroke: "mark" });
    const group = overlay.firstElementChild!;
    const drawn = () => Array.from(group.children, (child) => `${child.getAttribute("class")}:${Array.from(child.children, (c) => c.getAttribute("class")).join(" ")}`);
    expect(drawn()).toEqual(["ec-follow:ec-path ec-icon", "ec-text:", "ec-follow:ec-path"]);
    // Once the text has gone, the next path joins the group before it.
    name.remove();
    run.path("M0,0L5,0", { stroke: "mark" });
    expect(drawn()).toEqual(["ec-follow:ec-path ec-icon", "ec-follow:ec-path ec-path"]);
    // A transform reaches each of them.
    surface.mark("a").set({ transform: matrix.translate(0, 2) });
    expect(Array.from(group.children, (g) => g.getAttribute("transform"))).toEqual(["matrix(1 0 0 1 0 2)", "matrix(1 0 0 1 0 2)"]);
  });

  it("gives a key's groups the hover's emphasis, and the ones it gets later, until it's taken away", () => {
    const { overlay, surface } = setup();
    surface.group("a", "decorate", 1);
    surface.group("b", "decorate", 2);
    surface.hot("a", true);
    surface.group("a", "hover", 3);
    const hot = () => Array.from(overlay.children, (g) => `${g.getAttribute("data-key")}:${g.classList.contains("ec-hot")}`);
    expect(hot()).toEqual(["a:true", "b:false", "a:true"]);
    surface.hot("a", false);
    surface.group("a", "enter", 4);
    expect(hot()).toEqual(["a:false", "b:false", "a:false", "a:false"]);
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
    const laces: IconShape = { d: "M7,-3L12,-9.5", stroke: "#ffffff", width: 1.4, linecap: "round", linejoin: "round" };
    surface.group("a", "hover", 1).icon({ ...boot, shapes: [laces] });
    const path = overlay.querySelector(".ec-icon path") as SVGPathElement;
    expect(path.getAttribute("stroke-linecap")).toBe("round");
    expect(path.getAttribute("stroke-linejoin")).toBe("round");
  });

  it("draws a shape's fill rule and opacity, and leaves SVG's defaults where it has none", () => {
    const { overlay, surface } = setup();
    // An even-odd frame, and a duotone pair: a faded disc under a tick.
    const frame: IconShape = { d: "M-6,-6L6,-6L6,6L-6,6ZM-3,-3L3,-3L3,3L-3,3Z", fill: "text", fillRule: "evenodd" };
    const disc: IconShape = { d: "M6,0A6,6 0 0 1 -6,0A6,6 0 0 1 6,0Z", fill: "text", stroke: "surface", opacity: 0.3 };
    const tick: IconShape = { d: "M-3,0L-1,2L3,-2", stroke: "text", width: 1.5, fillRule: "nonzero", opacity: 1 };
    surface.group("a", "hover", 1).icon({ ...boot, shapes: [frame, disc, tick] }, { size: 13 });
    const [hole, faded, front] = Array.from(overlay.querySelectorAll(".ec-icon path")) as SVGPathElement[];
    expect(hole!.getAttribute("fill-rule")).toBe("evenodd");
    expect(hole!.getAttribute("opacity")).toBeNull();
    expect(faded!.getAttribute("fill-rule")).toBeNull();
    // On the path, so its fill and stroke fade together, and its paint stays the theme's.
    expect(faded!.getAttribute("opacity")).toBe("0.3");
    expect(faded!.style.getPropertyValue("fill")).toBe("var(--ec-text, #0b0b0b)");
    expect(faded!.style.getPropertyValue("stroke")).toBe("var(--ec-surface, #fcfcfb)");
    // Given as SVG's defaults, they're written as given.
    expect(front!.getAttribute("fill-rule")).toBe("nonzero");
    expect(front!.getAttribute("opacity")).toBe("1");
  });

  it("draws no fill rule or opacity for shapes without them", () => {
    const { overlay, surface } = setup();
    surface.group("a", "hover", 1).icon(ball);
    for (const path of Array.from(overlay.querySelectorAll(".ec-icon path"))) {
      expect(path.getAttribute("fill-rule")).toBeNull();
      expect(path.getAttribute("opacity")).toBeNull();
    }
  });

  it("draws a shape's fill and stroke opacity on its path, and leaves SVG's defaults where it has none", () => {
    const { overlay, surface } = setup();
    // A tag filled faintly inside its full outline, a hole outlined faintly in a faded shape, and a string given the defaults.
    const tag: IconShape = { d: "M-8,-4L4,-4L8,0L4,4L-8,4Z", fill: "text", stroke: "text", width: 1.5, fillOpacity: 0.25 };
    const hole: IconShape = { d: "M3,0A1,1 0 0 1 1,0A1,1 0 0 1 3,0Z", stroke: "text", strokeOpacity: 0.5, opacity: 0.8 };
    const string: IconShape = { d: "M-6,0L-2,0", stroke: "text", fillOpacity: 1, strokeOpacity: 1 };
    surface.group("a", "hover", 1).icon({ ...boot, shapes: [tag, hole, string] }, { size: 13 });
    const paths = Array.from(overlay.querySelectorAll(".ec-icon path")) as SVGPathElement[];
    expect(paths.map((path) => ["opacity", "fill-opacity", "stroke-opacity"].map((name) => path.getAttribute(name)))).toEqual([
      [null, "0.25", null],
      // Each is its own attribute, so SVG multiplies them as it draws.
      ["0.8", null, "0.5"],
      // Given as SVG's defaults, they're written as given.
      [null, "1", "1"]
    ]);
    // The paint stays the theme's.
    expect(paths[0]!.style.getPropertyValue("fill")).toBe("var(--ec-text, #0b0b0b)");
    expect(paths[0]!.style.getPropertyValue("stroke")).toBe("var(--ec-text, #0b0b0b)");
    surface.group("a", "hover", 2).icon(ball);
    for (const path of Array.from(overlay.querySelectorAll('.ec-icon[data-icon="ball"] path'))) {
      expect(path.getAttribute("fill-opacity")).toBeNull();
      expect(path.getAttribute("stroke-opacity")).toBeNull();
    }
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
    expect(element.style.getPropertyValue("stroke")).toBe("var(--ec-series-3-strong, #07835a)");
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
    expect(element.style.getPropertyValue("fill")).toBe("var(--ec-text-muted, #75736d)");
  });
});
