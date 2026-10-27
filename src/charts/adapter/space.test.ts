import { invert, parseTransform } from "../../core/geometry";
import { matrix } from "../../core";
import { attributesOf, axisAligned, between, boxIn, keepsCircles, rectOf, scaleOf, screenMatrices } from "./space";

const SVG = "http://www.w3.org/2000/svg";

function svgTree(markup: string): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  document.body.appendChild(host);
  return host.querySelector("svg")!;
}

const close = (m: readonly number[], expected: readonly number[]): void => m.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));

afterEach(() => {
  document.body.textContent = "";
});

describe("parseTransform and invert", () => {
  it("reads transform lists in SVG order, the first applying last", () => {
    close(parseTransform("translate(60,10)"), [1, 0, 0, 1, 60, 10]);
    close(parseTransform("translate(60 10) scale(2)"), [2, 0, 0, 2, 60, 10]);
    close(parseTransform("rotate(90, 10, 10)"), [0, 1, -1, 0, 20, 0]);
    close(parseTransform("matrix(1,0,0,1,5,6) bogus(3)"), [1, 0, 0, 1, 5, 6]);
    close(parseTransform(""), [1, 0, 0, 1, 0, 0]);
  });

  it("inverts, and refuses a transform with no area", () => {
    const m = parseTransform("translate(60,10) rotate(30) scale(2,3)");
    close(matrix.multiply(m, invert(m)), [1, 0, 0, 1, 0, 0]);
    expect(() => invert([0, 0, 0, 0, 1, 1])).toThrow(RangeError);
  });
});

describe("between", () => {
  it("composes transform attributes from the ancestor down, without CTMs (jsdom)", () => {
    const svg = svgTree(`<svg xmlns="${SVG}" transform="scale(9)"><g id="plot" transform="translate(60,10)"><g id="series" transform="translate(0,5) scale(2)"><rect id="r" transform="translate(1,1)"/></g></g></svg>`);
    const plot = svg.querySelector("#plot")!;
    const rect = svg.querySelector("#r")!;
    // Inner's own transform counts; the outer's own transform and anything above it cancel out.
    close(between(plot, rect, svg), [2, 0, 0, 2, 2, 7]);
    close(between(svg, plot, svg), [1, 0, 0, 1, 60, 10]);
    // A sibling of the ancestor at the root, like the overlay: its user space is the root's.
    const overlay = svg.appendChild(document.createElementNS(SVG, "g"));
    close(between(overlay, plot, svg), [1, 0, 0, 1, 60, 10]);
  });

  it("uses the browser's CTMs when there's layout", () => {
    const svg = svgTree(`<svg xmlns="${SVG}"><g id="plot"><rect id="r"/></g></svg>`);
    const plot = svg.querySelector("#plot")!;
    const rect = svg.querySelector("#r")!;
    // A CSS transform the attributes don't show, plus the page's own offset, which cancels out.
    const ctm = (a: number, d: number, e: number, f: number) => () => ({ a, b: 0, c: 0, d, e, f });
    Object.assign(plot, { getScreenCTM: ctm(1, 1, 100, 50) });
    Object.assign(rect, { getScreenCTM: ctm(2, 2, 110, 70) });
    close(between(plot, rect, svg), [2, 0, 0, 2, 10, 20]);
  });

  it("reads each element's CTM once through screenMatrices(), for one read of many marks", () => {
    const svg = svgTree(`<svg xmlns="${SVG}"><g id="plot"><rect id="a"/><rect id="b"/></g></svg>`);
    const plot = svg.querySelector("#plot")!;
    const calls: string[] = [];
    const ctm = (id: string, e: number) => () => (calls.push(id), { a: 1, b: 0, c: 0, d: 1, e, f: 0 });
    Object.assign(plot, { getScreenCTM: ctm("plot", 100) });
    for (const [id, e] of [["a", 110], ["b", 120]] as const) Object.assign(svg.querySelector(`#${id}`)!, { getScreenCTM: ctm(id, e) });
    const screen = screenMatrices();
    close(between(plot, svg.querySelector("#a")!, svg, screen), [1, 0, 0, 1, 10, 0]);
    close(between(plot, svg.querySelector("#b")!, svg, screen), [1, 0, 0, 1, 20, 0]);
    close(between(plot, svg.querySelector("#a")!, svg, screen), [1, 0, 0, 1, 10, 0]);
    expect(calls).toEqual(["plot", "a", "b"]);
  });
});

describe("axisAligned", () => {
  it("accepts scales, flips and quarter turns, and refuses rotations and skews", () => {
    expect(axisAligned(parseTransform("translate(60,10) scale(2,-1)"))).toBe(true);
    expect(axisAligned(parseTransform("rotate(90) scale(3)"))).toBe(true);
    expect(axisAligned(parseTransform("rotate(-90)"))).toBe(true);
    expect(axisAligned(parseTransform("rotate(30)"))).toBe(false);
    expect(axisAligned(parseTransform("skewX(10)"))).toBe(false);
  });
});

describe("keepsCircles and scaleOf", () => {
  it("accepts even scales, turns and flips, and refuses uneven scales and skews, past a browser's rounding", () => {
    expect(keepsCircles(parseTransform("translate(60,10) rotate(30) scale(2)"))).toBe(true);
    expect(keepsCircles(parseTransform("scale(-2,2) rotate(-75)"))).toBe(true);
    expect(keepsCircles([1.0000001, 0, 0, 0.9999999, 0, 0])).toBe(true);
    expect(keepsCircles([0, 0, 0, 0, 5, 5])).toBe(true);
    expect(keepsCircles(parseTransform("scale(2,1)"))).toBe(false);
    expect(keepsCircles(parseTransform("rotate(30) scale(1,1.01)"))).toBe(false);
    expect(keepsCircles(parseTransform("skewX(1)"))).toBe(false);
  });

  it("scales lengths exactly by an even scale, and on average by an uneven one", () => {
    expect(scaleOf(parseTransform("translate(5,5) rotate(40) scale(3)"))).toBeCloseTo(3, 12);
    expect(scaleOf(parseTransform("scale(4,1)"))).toBe(2);
    expect(scaleOf(parseTransform("scale(-2,2)"))).toBe(2);
  });
});

describe("attributesOf", () => {
  it("reads lengths as the browser resolves them where it can, and everything else as written", () => {
    const svg = svgTree(`<svg xmlns="${SVG}"><circle cx="5" r="10%"/><polyline points="1,2 3,4"/></svg>`);
    const [circle, polyline] = [svg.querySelector("circle")!, svg.querySelector("polyline")!];
    Object.assign(circle, { r: { baseVal: { value: 12.5 } } });
    expect(["cx", "r", "cy"].map(attributesOf(circle))).toEqual(["5", "12.5", null]);
    expect(attributesOf(polyline)("points")).toBe("1,2 3,4");
  });
});

describe("boxIn and rectOf", () => {
  it("covers a transformed rectangle with an upright box, rounded to 0.001 px", () => {
    expect(boxIn([1, 0, 0, 1, 60, 10], { x: 0, y: 7, width: 160, height: 20 })).toEqual({ x: 60, y: 17, width: 160, height: 20 });
    expect(boxIn(matrix.rotate(Math.PI / 2), { x: 0, y: 0, width: 10, height: 20 })).toEqual({ x: -20, y: 0, width: 20, height: 10 });
    expect(boxIn(matrix.scale(1 / 3), { x: 0, y: 0, width: 1, height: 1 })).toEqual({ x: 0, y: 0, width: 0.333, height: 0.333 });
  });

  it("reads a rect's attributes; missing ones are 0 and a negative size draws nothing", () => {
    const svg = svgTree(`<svg xmlns="${SVG}"><rect x="5" y="6.5" width="10" height="-4"/><rect/></svg>`);
    const [a, b] = Array.from(svg.querySelectorAll("rect"));
    expect(rectOf(a!)).toEqual({ x: 5, y: 6.5, width: 10, height: 0 });
    expect(rectOf(b!)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
