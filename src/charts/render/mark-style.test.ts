import { matrix } from "../../core";
import { svgMarkHandle, type StyledPart, type StyleTarget } from "./mark-style";
import { svgElement } from "./svg";
import { seriesColors, stylesheet } from "./theme";

function setup() {
  const body = svgElement("g", { class: "ec-body" }, svgElement("svg", {}, document.body));
  const part = (d: string, slot: number, visible = true): StyledPart => ({
    element: svgElement("path", { class: "ec-segment", d }, body),
    d,
    colors: seriesColors(slot),
    visible
  });
  const target: { current: StyleTarget } = { current: { body, parts: [part("M0,0L10,0L10,20Z", 1), part("M12,0L20,0L20,20Z", 4)] } };
  return { body, part, target, handle: svgMarkHandle(() => target.current) };
}

afterEach(() => {
  document.body.textContent = "";
});

describe("svgMarkHandle", () => {
  it("moves and fades the body, not the labels", () => {
    const { body, handle } = setup();
    handle.set({ transform: matrix.rotate(Math.PI / 180, { x: 0, y: 10 }), opacity: 0.5 });
    expect(body.getAttribute("transform")).toBe("matrix(0.999848 0.017452 -0.017452 0.999848 0.175 0.002)");
    expect(body.getAttribute("opacity")).toBe("0.5");
    handle.set({ transform: undefined });
    expect(body.getAttribute("transform")).toBeNull();
    expect(body.getAttribute("opacity")).toBe("0.5");
  });

  it("mixes each part toward its strong colour, without the CSS hover transition", () => {
    const { target, handle } = setup();
    const [goals, assists] = target.current.parts;
    handle.set({ emphasis: 1 });
    expect(goals!.element.style.getPropertyValue("fill")).toBe("var(--ec-series-1-strong, #1c5cab)");
    expect(goals!.element.style.getPropertyValue("transition")).toBe("none");
    handle.set({ emphasis: 0.25 });
    expect(assists!.element.style.getPropertyValue("fill")).toBe(
      "color-mix(in srgb, var(--ec-series-4-strong, #9d6a07) 25%, var(--ec-series-4, #c28409))"
    );
    handle.set({ emphasis: undefined });
    expect(goals!.element.style.getPropertyValue("fill")).toBe("");
    expect(goals!.element.style.getPropertyValue("transition")).toBe("");
  });

  it("draws a halo behind the visible parts, in each part's colour unless given one", () => {
    const { body, part, target, handle } = setup();
    target.current = { body, parts: [...target.current.parts, part("M20,0L20,20Z", 2, false)] };
    handle.set({ halo: { width: 8, opacity: 0.35 } });
    const halo = body.firstElementChild as SVGGElement;
    expect(halo.getAttribute("class")).toBe("ec-halo");
    const paths = Array.from(halo.children) as SVGPathElement[];
    expect(paths.map((p) => p.getAttribute("d"))).toEqual(["M0,0L10,0L10,20Z", "M12,0L20,0L20,20Z"]);
    expect(paths[0]!.getAttribute("stroke-width")).toBe("8");
    expect(paths[0]!.getAttribute("stroke-opacity")).toBe("0.35");
    expect(paths[0]!.style.getPropertyValue("fill")).toBe("none");
    expect(paths[1]!.style.getPropertyValue("stroke")).toBe("var(--ec-series-4, #c28409)");
    handle.set({ halo: { width: 4, opacity: 1, color: "negative" } });
    expect(halo.children).toHaveLength(2);
    expect((halo.children[0] as SVGPathElement).style.getPropertyValue("stroke")).toBe("var(--ec-negative, #d03b3b)");
    handle.set({ halo: undefined });
    expect(body.querySelector(".ec-halo")).toBeNull();
  });

  it("mixes an open part's stroke, not its fill", () => {
    const { body, target, handle } = setup();
    const line: StyledPart = { element: svgElement("path", { class: "ec-stroke", d: "M0,20L10,5L20,12" }, body), d: "M0,20L10,5L20,12", colors: seriesColors(2), visible: true, open: { width: 2.25 } };
    target.current = { body, parts: [line] };
    handle.set({ emphasis: 1 });
    expect(line.element.style.getPropertyValue("stroke")).toBe(seriesColors(2).strong);
    expect(line.element.style.getPropertyValue("fill")).toBe("");
    expect(line.element.style.getPropertyValue("transition")).toBe("none");
    handle.set({ emphasis: 0.5 });
    expect(line.element.style.getPropertyValue("stroke")).toBe(`color-mix(in srgb, ${seriesColors(2).strong} 50%, ${seriesColors(2).color})`);
    handle.set({ emphasis: undefined });
    expect(line.element.style.getPropertyValue("stroke")).toBe("");
    expect(line.element.style.getPropertyValue("transition")).toBe("");
  });

  it("has stylesheet rules for a stroked part: its mark's colour, and the strong one while hovered", () => {
    expect(stylesheet).toMatch(/:where\(\.ec-chart \.ec-stroke\) \{ fill: none; stroke: var\(--ec-mark\);[^}]*transition: stroke var\(--ec-hover-duration, 100ms\)/);
    expect(stylesheet).toContain(":where(.ec-chart .ec-hot .ec-stroke) { stroke: var(--ec-mark-strong); }");
    // No stroke width: the chart's own attribute sets it, as its geometry's thickness says.
    expect(stylesheet).not.toMatch(/\.ec-stroke\) \{[^}]*stroke-width/);
    // Dimming is the other marks' opacity, so it fades a stroked mark as it does a filled one.
    expect(stylesheet).toContain(":where(.ec-chart.ec-hovering .ec-mark:not(.ec-hot)) { opacity: var(--ec-dim-opacity, 0.3); }");
  });

  it("strokes an open part's halo behind it at the line's width plus the halo's, round its ends", () => {
    const { body, part, target, handle } = setup();
    const line: StyledPart = { element: svgElement("path", { class: "ec-stroke", d: "M0,20L10,5L20,12" }, body), d: "M0,20L10,5L20,12", colors: seriesColors(2), visible: true, open: { width: 2.25 } };
    target.current = { body, parts: [part("M0,0L10,0L10,20Z", 1), line] };
    handle.set({ halo: { width: 8, opacity: 0.35 } });
    const [bar, stroke] = Array.from(body.querySelectorAll<SVGPathElement>(".ec-halo path"));
    expect(body.firstElementChild!.getAttribute("class")).toBe("ec-halo");
    expect(stroke!.getAttribute("d")).toBe("M0,20L10,5L20,12");
    expect(stroke!.getAttribute("stroke-width")).toBe("10.25");
    expect(stroke!.getAttribute("stroke-linecap")).toBe("round");
    expect(stroke!.getAttribute("stroke-linejoin")).toBe("round");
    expect(stroke!.style.getPropertyValue("fill")).toBe("none");
    expect(stroke!.style.getPropertyValue("stroke")).toBe(seriesColors(2).color);
    // A closed part's halo is as it was.
    expect(bar!.getAttribute("stroke-width")).toBe("8");
    expect(bar!.hasAttribute("stroke-linecap")).toBe(false);
  });

  it("repaints onto redrawn parts, and reset() restores the mark's own style", () => {
    const { body, part, target, handle } = setup();
    handle.set({ emphasis: 1, halo: { width: 6, opacity: 0.3 }, opacity: 0.8 });
    const fresh = part("M0,0L30,0L30,20Z", 3);
    target.current = { body, parts: [fresh] };
    handle.repaint();
    expect(fresh.element.style.getPropertyValue("fill")).toBe("var(--ec-series-3-strong, #07835a)");
    expect(body.querySelectorAll(".ec-halo path")).toHaveLength(1);
    expect(handle.style).toEqual({ emphasis: 1, halo: { width: 6, opacity: 0.3 }, opacity: 0.8 });
    handle.reset();
    expect(handle.style).toEqual({});
    expect(fresh.element.style.getPropertyValue("fill")).toBe("");
    expect(body.getAttribute("opacity")).toBeNull();
    expect(body.querySelector(".ec-halo")).toBeNull();
  });
});
