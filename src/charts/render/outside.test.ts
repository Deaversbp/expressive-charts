import { describe as build } from "../../core";
import { svgMarkHandle } from "./mark-style";
import { maskedHalo, maskedRing } from "./outside";
import { svgElement } from "./svg";
import { seriesColors } from "./theme";

function overlay(): SVGGElement {
  return svgElement("g", { class: "ec-overlay" }, svgElement("svg", {}, document.body));
}

const slice = build.arc({ key: "Saved", cx: 100, cy: 100, inner: 48, outer: 80, start: 0, end: Math.PI / 2 });

afterEach(() => {
  document.body.textContent = "";
});

describe("maskedRing", () => {
  it("is hidden until drawn, then strokes the outline 2 px out past a 2 px gap, masked to outside the mark", () => {
    const parent = overlay();
    const ring = maskedRing(parent);
    const path = parent.querySelector(".ec-focus-ring")!;
    expect(path.getAttribute("visibility")).toBe("hidden");
    ring.draw({ outline: slice.outline, thickness: slice.thickness });
    expect(path.getAttribute("visibility")).toBeNull();
    expect(path.getAttribute("d")).toBe(slice.outline.d);
    expect(path.getAttribute("stroke-width")).toBe("8");
    const mask = parent.querySelector(`mask${path.getAttribute("mask")!.slice(4, -1)}`)!;
    expect(mask.querySelector("rect")!.getAttribute("fill")).toBe("white");
    const hole = mask.querySelector("path")!;
    expect(["d", "fill", "stroke", "stroke-width"].map((name) => hole.getAttribute(name))).toEqual([slice.outline.d, "black", "black", "4"]);
    ring.draw(undefined);
    expect(path.getAttribute("visibility")).toBe("hidden");
  });

  it("takes an effect's transform, mask and all, since the mask is in the ring's own user space", () => {
    const parent = overlay();
    const ring = maskedRing(parent);
    ring.draw({ outline: slice.outline, thickness: slice.thickness, transform: [1, 0, 0, 1, 3, 0] });
    expect(parent.querySelector(".ec-focus-ring")!.getAttribute("transform")).toBe("matrix(1 0 0 1 3 0)");
    ring.draw({ outline: slice.outline, thickness: slice.thickness });
    expect(parent.querySelector(".ec-focus-ring")!.getAttribute("transform")).toBeNull();
  });

  it("rings an open outline outside its stroke, on both sides", () => {
    const line = build.line({ key: "xg", points: [{ x: 0, y: 0 }, { x: 50, y: 20 }], width: 3 });
    const parent = overlay();
    maskedRing(parent).draw(line);
    const hole = parent.querySelector("mask path")!;
    expect(["fill", "stroke-width"].map((name) => hole.getAttribute(name))).toEqual(["none", "7"]);
    expect(parent.querySelector(".ec-focus-ring")!.getAttribute("stroke-width")).toBe("11");
  });

  it("gives each ring in a document its own mask", () => {
    const parent = overlay();
    maskedRing(parent);
    maskedRing(parent);
    const ids = Array.from(parent.querySelectorAll("mask"), (mask) => mask.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("maskedHalo", () => {
  it("strokes each part in its own colour, masked to outside the parts, moved with the mark", () => {
    const container = overlay();
    const halo = maskedHalo();
    halo.paint(container, [{ d: slice.outline.d, color: seriesColors(2).color }], { width: 8, opacity: 0.4 }, [1, 0, 0, 1, 2, 0]);
    const group = container.querySelector(":scope > .ec-halo")!;
    expect(group.getAttribute("transform")).toBe("matrix(1 0 0 1 2 0)");
    const [path] = group.querySelectorAll<SVGPathElement>(":scope > path");
    expect(["d", "stroke-width", "stroke-opacity"].map((name) => path!.getAttribute(name))).toEqual([slice.outline.d, "8", "0.4"]);
    expect(path!.style.getPropertyValue("stroke")).toBe(seriesColors(2).color);
    expect(path!.getAttribute("mask")).toBe(`url(#${group.querySelector("mask")!.id})`);
    expect(group.querySelector("mask path")!.getAttribute("fill")).toBe("black");
  });

  it("takes the halo's own colour, or the mark token when the part has none, and goes with no halo", () => {
    const container = overlay();
    const halo = maskedHalo();
    halo.paint(container, [{ d: slice.outline.d, color: undefined }], { width: 6, opacity: 0.3 }, undefined);
    expect(container.querySelector<SVGPathElement>(".ec-halo > path")!.style.getPropertyValue("stroke")).toMatch(/^var\(--ec-mark,/);
    halo.paint(container, [{ d: slice.outline.d, color: "red" }], { width: 6, opacity: 0.3, color: "negative" }, undefined);
    expect(container.querySelector<SVGPathElement>(".ec-halo > path")!.style.getPropertyValue("stroke")).toMatch(/^var\(--ec-negative,/);
    halo.paint(container, [{ d: slice.outline.d, color: "red" }], undefined, undefined);
    expect(container.querySelector(".ec-halo")).toBeNull();
  });

  it("goes round an open outline outside its stroke, on both sides, as wide as round a closed mark", () => {
    const line = build.line({ key: "xg", points: [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }], width: 3 });
    const container = overlay();
    maskedHalo().paint(container, [{ d: line.outline.d, color: "red", stroke: line.thickness }], { width: 8, opacity: 0.4 }, undefined);
    // The mask cuts out the 3 px stroke without filling it, which would close the line into a
    // triangle; the halo is 3 + 8 px wide, so 4 px of it shows either side, and its round caps take
    // it round the ends, as round a closed mark.
    const cut = container.querySelector(".ec-halo mask path")!;
    expect(["d", "fill", "stroke", "stroke-width", "stroke-linejoin"].map((name) => cut.getAttribute(name))).toEqual([line.outline.d, "none", "black", "3", "round"]);
    const path = container.querySelector<SVGPathElement>(".ec-halo > path")!;
    expect(["d", "stroke-width", "stroke-linecap"].map((name) => path.getAttribute(name))).toEqual([line.outline.d, "11", "round"]);
    expect(path.style.getPropertyValue("fill")).toBe("none");
    // A closed outline's halo keeps SVG's default caps.
    maskedHalo().paint(container, [{ d: slice.outline.d, color: "red" }], { width: 8, opacity: 0.4 }, undefined);
    expect(container.querySelectorAll<SVGPathElement>(".ec-halo > path")[1]!.getAttribute("stroke-linecap")).toBeNull();
  });
});

describe("svgMarkHandle with halos above", () => {
  it("draws the halo in the given group, masked, instead of behind the body", () => {
    const container = overlay();
    const body = svgElement("g", { class: "ec-body" }, container.ownerSVGElement!);
    const element = svgElement("path", { class: "ec-slice", d: slice.outline.d }, body);
    const parts = [{ element, d: slice.outline.d, colors: seriesColors(3), visible: true }];
    const handle = svgMarkHandle(() => ({ body, parts }), { halos: () => container });
    handle.set({ halo: { width: 8, opacity: 0.35 } });
    expect(body.querySelector(".ec-halo")).toBeNull();
    expect(container.querySelector(".ec-halo > path")!.getAttribute("d")).toBe(slice.outline.d);
    handle.reset();
    expect(container.querySelector(".ec-halo")).toBeNull();
  });

  it("goes round an open part's stroke, with the part's width", () => {
    const line = build.line({ key: "xg", points: [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }], width: 2.25 });
    const container = overlay();
    const body = svgElement("g", { class: "ec-body" }, container.ownerSVGElement!);
    const element = svgElement("path", { class: "ec-stroke", d: line.outline.d }, body);
    const parts = [{ element, d: line.outline.d, colors: seriesColors(2), visible: true, open: { width: 2.25 } }];
    svgMarkHandle(() => ({ body, parts }), { halos: () => container }).set({ halo: { width: 6, opacity: 0.35 } });
    expect(["fill", "stroke-width"].map((name) => container.querySelector(".ec-halo mask path")!.getAttribute(name))).toEqual(["none", "2.25"]);
    expect(container.querySelector(".ec-halo > path")!.getAttribute("stroke-width")).toBe("8.25");
  });
});
