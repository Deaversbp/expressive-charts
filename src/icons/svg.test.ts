import { iconFromSvg } from "./svg";

const spec = { name: "test", anchor: { x: 12, y: 12 } };
const svg = (body: string, root = 'viewBox="0 0 24 24"'): string => `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${body}</svg>`;

describe("iconFromSvg", () => {
  it("converts path, circle, rect, ellipse, line, polyline and polygon into absolute path data", () => {
    const icon = iconFromSvg(
      svg(`
        <path d="m2 2h4v4z"/>
        <circle cx="12" cy="12" r="3"/>
        <rect x="1" y="2" width="4" height="3"/>
        <rect x="0" y="0" width="10" height="6" rx="2"/>
        <ellipse cx="5" cy="5" rx="4" ry="2"/>
        <line x1="0" y1="0" x2="4" y2="3" stroke="red"/>
        <polygon points="0,0 4,0 2 3"/>
        <polyline points="0,0 4,0 2 3"/>`),
      spec
    );
    expect(icon.shapes.map((shape) => shape.d)).toEqual([
      "M2,2L6,2L6,6Z",
      "M15,12A3,3 0 0 1 9,12A3,3 0 0 1 15,12Z",
      "M1,2L5,2L5,5L1,5Z",
      "M2,0L8,0A2,2 0 0 1 10,2L10,4A2,2 0 0 1 8,6L2,6A2,2 0 0 1 0,4L0,2A2,2 0 0 1 2,0Z",
      "M9,5A4,2 0 0 1 1,5A4,2 0 0 1 9,5Z",
      "M0,0L4,3",
      "M0,0L4,0L2,3Z",
      // A polyline is a polygon left open.
      "M0,0L4,0L2,3"
    ]);
    // SVG's default fill is black; here it's explicit, since an unset fill draws none.
    expect(icon.shapes[0]).toEqual({ d: "M2,2L6,2L6,6Z", fill: "#000000" });
    expect(icon.shapes[5]).toMatchObject({ stroke: "red", width: 1 });
    expect(icon.box).toEqual({ x: 0, y: 0, width: 24, height: 24 });
    expect(icon.size).toBe(24);
  });

  it("drops everything else: scripts, handlers, <use>, text, images, and what's inside defs and clip paths", () => {
    const icon = iconFromSvg(
      svg(`
        <script>alert(1)</script>
        <style>path { fill: red }</style>
        <!-- <path d="M0,0L1,1"/> -->
        <defs><path id="p" d="M0,0L9,9"/></defs>
        <clipPath id="c"><circle r="4"/></clipPath>
        <use href="#p"/>
        <text x="0" y="10">Hi</text>
        <image href="x.png" width="4" height="4"/>
        <foreignObject><div><svg><path d="M1,1L2,2"/></svg></div></foreignObject>
        <path d="M0,0L4,4" onclick="alert(1)" stroke="blue" fill="url(#gradient)" clip-path="url(#c)"/>
        <path d="M0,0L4,4" display="none"/>
        <g style="display: none"><circle r="2"/></g>`),
      spec
    );
    // The only shape left: its url() fill falls back to the inherited black.
    expect(icon.shapes).toEqual([{ d: "M0,0L4,4", fill: "#000000", stroke: "blue", width: 1 }]);
  });

  it("never passes input through: path data is rewritten from numbers, and unsafe colours are dropped", () => {
    const icon = iconFromSvg(
      svg(`
        <path d="M0,0 L4,4 &quot;/&gt;&lt;script&gt;" fill="red;background:url(x)" stroke="expression(x)"/>
        <polyline points="0,0 4,4 &quot;/&gt;&lt;script&gt; 9,9" fill="none" stroke="blue"/>`),
      spec
    );
    expect(icon.shapes).toEqual([
      { d: "M0,0L4,4", fill: "#000000" },
      { d: "M0,0L4,4", stroke: "blue", width: 1 }
    ]);
  });

  it("reads a polyline as an open path: filled as one, and drawn only with two points or more", () => {
    const icon = iconFromSvg(svg(`<polyline points="0 0 4 0 2 3" fill="red"/><polyline points="0,0 4,0 2" stroke="red"/><polyline points="5,5" stroke="red"/>`), spec);
    expect(icon.shapes).toEqual([
      { d: "M0,0L4,0L2,3", fill: "red" },
      // An odd number left over is dropped, as SVG draws up to the error.
      { d: "M0,0L4,0", fill: "#000000", stroke: "red", width: 1 }
    ]);
  });

  it("reads a stroked 24×24 icon in the style of Lucide, Heroicons and Tabler, in the theme's text colour", () => {
    // Drawn for this test in those sets' style: a rising line with an arrowhead, the stroke set on the root.
    const icon = iconFromSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-rising" aria-hidden="true">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <polyline points="3 18 9 12 13 15 20 7"/>
        <polyline points="15 7 20 7 20 12"/>
      </svg>`,
      { name: "rising", size: 18, anchor: { x: 12, y: 12 } }
    );
    const stroke = { stroke: "text", width: 1.5, linecap: "round", linejoin: "round" };
    expect(icon.shapes).toEqual([
      { d: "M2.25,13.5L6.75,9L9.75,11.25L15,5.25", ...stroke },
      { d: "M11.25,5.25L15,5.25L15,9", ...stroke }
    ]);
    expect(icon.size).toBe(18);
  });

  it("makes currentColor the text token in any case, set on the root, a group or the shape, as an attribute or in style", () => {
    const icon = iconFromSvg(
      svg(
        `<path d="M0,0L4,4"/>
        <g stroke="currentcolor"><path d="M0,0L4,4"/></g>
        <path d="M0,0L4,4" style="fill: CURRENTCOLOR; stroke: currentColor"/>
        <g fill="red"><path d="M0,0L4,4" fill="INHERIT"/><path d="M0,0L4,4" fill="None" stroke="#00f"/></g>
        <path d="M0,0L4,4" fill="none" stroke="surface" stroke-width="4"/>`,
        'viewBox="0 0 24 24" fill="CurrentColor"'
      ),
      spec
    );
    expect(icon.shapes).toEqual([
      { d: "M0,0L4,4", fill: "text" },
      { d: "M0,0L4,4", fill: "text", stroke: "text", width: 1 },
      { d: "M0,0L4,4", fill: "text", stroke: "text", width: 1 },
      { d: "M0,0L4,4", fill: "red" },
      { d: "M0,0L4,4", stroke: "#00f", width: 1 },
      // Theme tokens pass through, so a halo can be drawn in the surface colour.
      { d: "M0,0L4,4", stroke: "surface", width: 4 }
    ]);
  });

  it("inherits paint from groups and the root, with style beating attributes", () => {
    const icon = iconFromSvg(
      svg(
        `<g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M0,0L4,4"/>
          <path d="M0,0L4,4" style="stroke: #00ff00 !important; stroke-width: 3" stroke="red"/>
          <path d="M0,0L4,4" stroke="none"/>
        </g>`,
        'viewBox="0 0 24 24" fill="none"'
      ),
      spec
    );
    expect(icon.shapes).toEqual([
      { d: "M0,0L4,4", stroke: "text", width: 2, linecap: "round", linejoin: "round" },
      { d: "M0,0L4,4", stroke: "#00ff00", width: 3, linecap: "round", linejoin: "round" }
    ]);
  });

  it("keeps an even-odd fill rule, so a hole in a solid icon stays a hole", () => {
    // Drawn for this test in the style of Heroicons' solid set: a square frame filled in currentColor,
    // its hole a second square wound the same way, so only even-odd leaves it open.
    const icon = iconFromSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M3 3h18v18H3zM8 8h8v8H8z" clip-rule="evenodd"/>
      </svg>`,
      { name: "frame", anchor: { x: 12, y: 12 } }
    );
    expect(icon.shapes).toEqual([{ d: "M3,3L21,3L21,21L3,21ZM8,8L16,8L16,16L8,16Z", fill: "text", fillRule: "evenodd" }]);
    // defineIcon has checked and frozen it.
    expect(Object.isFrozen(icon.shapes[0])).toBe(true);
  });

  it("reads the fill rule from attributes and style, in any case, inherited through groups", () => {
    const icon = iconFromSvg(
      svg(`
        <g fill-rule="evenodd">
          <path d="M0,0L4,4"/>
          <path d="M0,0L4,4" style="fill-rule: nonzero" fill-rule="evenodd"/>
          <g><path d="M0,0L4,4" fill-rule="inherit"/></g>
          <path d="M0,0L4,4" fill-rule="sideways"/>
          <path d="M0,0L4,4" fill="none" stroke="red"/>
        </g>
        <path d="M0,0L4,4" style="fill-rule: EvenOdd"/>
        <path d="M0,0L4,4"/>`),
      spec
    );
    expect(icon.shapes).toEqual([
      { d: "M0,0L4,4", fill: "#000000", fillRule: "evenodd" },
      // Nonzero is the default, so it isn't written.
      { d: "M0,0L4,4", fill: "#000000" },
      // A keyword or a value it doesn't know keeps the group's.
      { d: "M0,0L4,4", fill: "#000000", fillRule: "evenodd" },
      { d: "M0,0L4,4", fill: "#000000", fillRule: "evenodd" },
      // A fill rule is only a fill's.
      { d: "M0,0L4,4", stroke: "red", width: 1 },
      { d: "M0,0L4,4", fill: "#000000", fillRule: "evenodd" },
      { d: "M0,0L4,4", fill: "#000000" }
    ]);
  });

  it("keeps a shape's opacity: a duotone pair", () => {
    // Drawn for this test in a duotone style: a faded disc behind a ring and a tick, stroked in currentColor.
    const icon = iconFromSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" opacity="0.2"/>
        <circle cx="12" cy="12" r="9"/>
        <polyline points="8 12 11 15 16 9"/>
      </svg>`,
      { name: "done", anchor: { x: 12, y: 12 } }
    );
    expect(icon.shapes).toEqual([
      { d: "M21,12A9,9 0 0 1 3,12A9,9 0 0 1 21,12Z", fill: "text", opacity: 0.2 },
      { d: "M21,12A9,9 0 0 1 3,12A9,9 0 0 1 21,12Z", stroke: "text", width: 2 },
      { d: "M8,12L11,15L16,9", stroke: "text", width: 2 }
    ]);
  });

  it("multiplies groups' opacities into their shapes, from attributes and style, as numbers or percentages", () => {
    const icon = iconFromSvg(
      svg(`
        <g opacity="0.5">
          <path d="M0,0L4,4"/>
          <g style="opacity: 50%">
            <path d="M0,0L4,4" opacity=".4"/>
            <path d="M0,0L4,4" opacity="2"/>
          </g>
          <path d="M0,0L4,4" opacity="half"/>
        </g>
        <g opacity="0.3"><path d="M0,0L4,4" opacity="0.1"/></g>
        <path d="M0,0L4,4" opacity="1"/>
        <path d="M0,0L4,4" style="opacity: 0.35 !important" opacity="0.9"/>
        <path d="M0,0L4,4" opacity="3e-1"/>`),
      spec
    );
    expect(icon.shapes.map((shape) => shape.opacity)).toEqual([
      0.5,
      0.1,
      // 2 counts as 1, as in CSS, so 0.5 × 0.5.
      0.25,
      // One it can't read counts as 1.
      0.5,
      // Rounded to 0.001.
      0.03,
      // 1 is the default, so it isn't written.
      undefined,
      0.35,
      0.3
    ]);
  });

  it("drops shapes with an opacity of 0, and fill-opacity and stroke-opacity", () => {
    const icon = iconFromSvg(
      svg(`
        <path d="M0,0L4,4" opacity="0"/>
        <path d="M0,0L4,4" opacity="-1"/>
        <g opacity="0%"><circle r="2"/></g>
        <path d="M0,0L4,4" fill-opacity="0.5" stroke-opacity="0.5" stroke="red"/>`),
      spec
    );
    expect(icon.shapes).toEqual([{ d: "M0,0L4,4", fill: "#000000", stroke: "red", width: 1 }]);
    expect(() => iconFromSvg(svg(`<path d="M0,0L4,4" opacity="0"/>`), spec)).toThrow(/has nothing to draw/);
  });

  it("reads a long opacity quickly", () => {
    const started = performance.now();
    const icon = iconFromSvg(svg(`<path d="M0,0L4,4" opacity="${"1".repeat(100_000)}x"/><path d="M0,0L4,4" opacity="${" ".repeat(100_000)}x"/>`), spec);
    expect(icon.shapes.map((shape) => shape.opacity)).toEqual([undefined, undefined]);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("applies transforms on groups and shapes, scaling strokes with them", () => {
    const icon = iconFromSvg(
      svg(`<g transform="translate(10 0) scale(2)"><path d="M0,0L1,0" stroke="red" transform="rotate(90)"/><circle r="1" transform="matrix(1 0 0 1 1 1)"/></g>`),
      spec
    );
    expect(icon.shapes).toEqual([
      { d: "M10,0L10,2", fill: "#000000", stroke: "red", width: 2 },
      { d: "M14,2A2,2 0 0 1 10,2A2,2 0 0 1 14,2Z", fill: "#000000" }
    ]);
  });

  it("scales the whole icon to `size`, with the spec in the SVG's own units", () => {
    const icon = iconFromSvg(svg(`<circle cx="256" cy="256" r="200" stroke="red" stroke-width="16"/>`, 'viewBox="0 0 512 512"'), {
      name: "big",
      size: 24,
      anchor: { x: 256, y: 256 },
      pivot: { x: 0, y: 256 },
      footprint: [256, 256],
      radius: 200,
      gait: "roll"
    });
    const k = 24 / 512;
    expect(icon.box).toEqual({ x: 0, y: 0, width: 24, height: 24 });
    expect(icon.size).toBe(24);
    expect(icon.anchor).toEqual({ x: 12, y: 12 });
    expect(icon.pivot).toEqual({ x: 0, y: 12 });
    expect(icon.footprint).toEqual([12, 12]);
    expect(icon.radius).toBeCloseTo(200 * k, 12);
    expect(icon.gait).toBe("roll");
    expect(icon.shapes[0]).toEqual({ d: "M21.375,12A9.375,9.375 0 0 1 2.625,12A9.375,9.375 0 0 1 21.375,12Z", fill: "#000000", stroke: "red", width: 0.75 });
  });

  it("reads the box from width and height when there's no viewBox", () => {
    expect(iconFromSvg(svg(`<path d="M0,0L4,4"/>`, 'width="32px" height="16"'), spec).box).toEqual({ x: 0, y: 0, width: 32, height: 16 });
  });

  it("says what's wrong", () => {
    expect(() => iconFromSvg(`<path d="M0,0L1,1"/>`, spec)).toThrow(/"test" needs an <svg> element/);
    expect(() => iconFromSvg(svg(`<path d="M0,0L1,1"/>`, 'width="50%"'), spec)).toThrow(/needs a viewBox/);
    expect(() => iconFromSvg(svg(`<path d="M0,0L1,1" fill="none"/><text>x</text>`), spec)).toThrow(/has nothing to draw: no path, .*polyline/);
    expect(() => iconFromSvg(svg(`<path d="M0,0"/>`), { ...spec, size: -1 })).toThrow(/size must be more than 0/);
    expect(() => iconFromSvg(42 as unknown as string, spec)).toThrow(TypeError);
  });

  it("stays fast on hostile markup", () => {
    const started = performance.now();
    const unclosed = "<svg viewBox='0 0 1 1'>" + '<a x="'.repeat(20_000) + "<!--".repeat(20_000) + "<path d='M0,0L1,1'/>";
    expect(() => iconFromSvg(unclosed, spec)).toThrow(/nothing to draw/);
    const comments = "<svg viewBox='0 0 1 1'>" + "<!---->".repeat(50_000) + "<path d='M0,0L1,1'/></svg>";
    expect(iconFromSvg(comments, spec).shapes).toHaveLength(1);
    const commands = "<svg viewBox='0 0 1 1'><path d='M0,0" + "L1,1".repeat(50_000) + "'/></svg>";
    expect(iconFromSvg(commands, spec).shapes).toHaveLength(1);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("removes comments, CDATA and processing instructions wherever they are", () => {
    const icon = iconFromSvg(
      `<?xml version="1.0"?><!DOCTYPE svg><svg viewBox="0 0 4 4"><![CDATA[ <path d="M9,9L9,9"/> ]]><!-- <path d="M8,8L8,8"/> --><path d="M0,0L4,4"/></svg>`,
      spec
    );
    expect(icon.shapes.map((shape) => shape.d)).toEqual(["M0,0L4,4"]);
  });
});
