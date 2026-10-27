// pointerHover on its own: an <svg> with three marks, and a tooltip beside it that the pointer can move
// onto. jsdom fires no boundary events of its own and can't hit-test, so each test dispatches what a
// browser would and stubs elementFromPoint where it's read.
import { svgElement } from "./render/svg";
import { pointerHover, type HoverTooltip } from "./interaction";

function setup({ tooltip = true } = {}) {
  const container = document.body.appendChild(document.createElement("div"));
  const svg = svgElement("svg", {}, container);
  const marks = new Map<string, SVGRectElement>();
  for (const key of ["a", "b", "c"]) marks.set(key, svgElement("rect", { class: "ec-mark", "data-key": key }, svg));
  const blank = svgElement("rect", { class: "ec-background" }, svg);
  // The tooltip's layer after the <svg>, with its box and its bridge, as tooltip.ts makes it.
  const layer = container.appendChild(document.createElement("div"));
  const box = layer.appendChild(document.createElement("div"));
  const bridge = layer.appendChild(document.createElement("div"));
  const outside = document.body.appendChild(document.createElement("p"));
  const heard: string[] = [];
  /** The chart's own hover, as the shell gives it: the hovered key, and whether its tooltip shows. */
  const shown = { key: undefined as string | undefined, tooltip: true };
  const interaction = pointerHover(svg, {
    find(target) {
      const key = (target as Element | null)?.getAttribute?.("data-key") ?? undefined;
      return key === undefined ? undefined : { key };
    },
    hover(target, source) {
      heard.push(`hover ${target.key} ${source}`);
      shown.key = target.key;
    },
    leave() {
      heard.push("leave");
      shown.key = undefined;
    },
    ...(tooltip ? { tooltip: (): HoverTooltip | undefined => (shown.key === undefined ? undefined : { key: shown.key, element: shown.tooltip ? layer : undefined }) } : {})
  });
  const mark = (key: string) => marks.get(key)!;
  return { container, svg, mark, blank, layer, box, bridge, outside, heard, shown, interaction };
}

/** A pointer event as a browser fires it, at a point, from or to `related`. */
function pointer(type: string, target: Element, init: { related?: Element | null; x?: number; y?: number; pointerType?: string } = {}): void {
  const bubbles = type !== "pointerleave" && type !== "pointerenter";
  target.dispatchEvent(new PointerEvent(type, { bubbles, pointerType: init.pointerType ?? "mouse", relatedTarget: init.related ?? null, clientX: init.x ?? 0, clientY: init.y ?? 0 }));
}

/** The pointer moves from an element in the <svg> onto `onto`, outside it: the <svg>'s pointerleave. */
function offSvg(svg: SVGSVGElement, onto: Element | null, x = 10, y = 10): void {
  pointer("pointerleave", svg, { related: onto, x, y });
}

/** The pointer moves from the tooltip's layer onto `onto`, and over it if that's in the <svg>. */
function offTooltip(layer: Element, svg: SVGSVGElement, onto: Element | null, x = 10, y = 10): void {
  pointer("pointerleave", layer, { related: onto, x, y });
  if (onto && svg.contains(onto)) pointer("pointerover", onto, { x, y });
}

/** Lets a MutationObserver's callback run. */
const mutations = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** elementFromPoint, which jsdom lacks, giving `at()`'s element. */
function stubPoint(at: () => Element | null): void {
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => at()) });
}

afterEach(() => {
  document.body.textContent = "";
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
});

describe("pointerHover: the pointer on the tooltip", () => {
  it("keeps the hover when the pointer leaves the <svg> for the tooltip, and as it moves across it", () => {
    const { svg, mark, box, bridge, heard, interaction } = setup();
    pointer("pointerover", mark("a"));
    offSvg(svg, bridge);
    pointer("pointermove", bridge, { x: 12, y: 30 });
    // From the bridge to the box: both are inside the layer, which the pointer doesn't leave.
    pointer("pointerleave", bridge, { related: box });
    pointer("pointermove", box, { x: 40, y: 50 });
    expect(heard).toEqual(["hover a pointer"]);
    expect(interaction.current).toBe("a");
  });

  it("hovers the mark the pointer leaves the tooltip for", () => {
    const { svg, mark, layer, box, heard, interaction } = setup();
    pointer("pointerover", mark("a"));
    offSvg(svg, box);
    offTooltip(layer, svg, mark("b"));
    expect(heard).toEqual(["hover a pointer", "leave", "hover b pointer"]);
    expect(interaction.current).toBe("b");
    // Back onto its own mark from the tooltip: the hover goes on.
    offSvg(svg, box);
    offTooltip(layer, svg, mark("b"));
    expect(heard).toHaveLength(3);
  });

  it("ends the hover when the pointer leaves the tooltip for anything else: off the chart, or nothing in it", () => {
    const { svg, mark, blank, layer, box, outside, heard, interaction } = setup();
    pointer("pointerover", mark("a"));
    offSvg(svg, box);
    offTooltip(layer, svg, outside);
    expect(heard).toEqual(["hover a pointer", "leave"]);
    expect(interaction.current).toBeUndefined();
    pointer("pointerover", mark("a"));
    offSvg(svg, box);
    offTooltip(layer, svg, blank);
    expect(heard).toEqual(["hover a pointer", "leave", "hover a pointer", "leave"]);
    // And off the window, where nothing is related.
    pointer("pointerover", mark("a"));
    offSvg(svg, box);
    offTooltip(layer, svg, null);
    expect(heard.slice(-1)).toEqual(["leave"]);
  });

  it("finds where the pointer went from its place when the event doesn't say", () => {
    const { svg, mark, layer, box, heard } = setup();
    let under: Element | null = box;
    stubPoint(() => under);
    pointer("pointerover", mark("a"));
    offSvg(svg, null, 30, 40);
    expect(document.elementFromPoint).toHaveBeenCalledWith(30, 40);
    expect(heard).toEqual(["hover a pointer"]);
    under = mark("c");
    pointer("pointerleave", layer, { x: 30, y: 60 });
    expect(heard).toEqual(["hover a pointer", "leave", "hover c pointer"]);
  });

  it("leaves as before without a tooltip: none given, none showing, or a pointer leaving for a hidden one", () => {
    for (const given of [false, true]) {
      const { svg, mark, box, heard, shown } = setup({ tooltip: given });
      shown.tooltip = false;
      pointer("pointerover", mark("a"));
      offSvg(svg, box);
      expect(heard).toEqual(["hover a pointer", "leave"]);
      document.body.textContent = "";
    }
  });

  it("holds the target whose tooltip it is: one keyboard focus moved the hover to", () => {
    const { svg, mark, layer, box, heard, shown, interaction } = setup();
    pointer("pointerover", mark("a"));
    // Focus moves the hover to c, and its tooltip, while the pointer stays on a.
    shown.key = "c";
    offSvg(svg, box);
    expect(interaction.current).toBe("c");
    expect(heard).toEqual(["hover a pointer", "leave", "hover c pointer"]);
    offTooltip(layer, svg, mark("b"));
    expect(interaction.current).toBe("b");
  });

  it("ignores touch's boundary events on the tooltip, and a tap on it isn't a tap elsewhere", () => {
    const { svg, mark, layer, box, outside, heard, interaction } = setup();
    pointer("pointerdown", mark("a"), { pointerType: "touch" });
    mark("a").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(heard).toEqual(["hover a touch"]);
    pointer("pointerleave", svg, { related: box, pointerType: "touch" });
    pointer("pointerdown", box, { pointerType: "touch" });
    pointer("pointerleave", layer, { related: outside, pointerType: "touch" });
    expect(heard).toEqual(["hover a touch"]);
    expect(interaction.current).toBe("a");
    pointer("pointerdown", outside, { pointerType: "touch" });
    expect(heard).toEqual(["hover a touch", "leave"]);
  });

  it("lets go of the tooltip when the hover is cleared, and when it's destroyed", async () => {
    const { svg, mark, layer, box, outside, heard, interaction, shown } = setup();
    stubPoint(() => outside);
    pointer("pointerover", mark("a"));
    offSvg(svg, box);
    interaction.clear();
    shown.key = undefined;
    expect(heard).toEqual(["hover a pointer", "leave"]);
    box.style.top = "40px";
    await mutations();
    offTooltip(layer, svg, outside);
    expect(heard).toEqual(["hover a pointer", "leave"]);
    pointer("pointerover", mark("b"));
    offSvg(svg, box);
    interaction.destroy();
    box.style.top = "80px";
    await mutations();
    offTooltip(layer, svg, outside);
    pointer("pointerover", mark("c"));
    expect(heard).toEqual(["hover a pointer", "leave", "hover b pointer"]);
  });
});

describe("pointerHover: a tooltip that moves from under the pointer", () => {
  it("does nothing while the tooltip is still under the pointer", async () => {
    const { svg, mark, box, heard } = setup();
    stubPoint(() => box);
    pointer("pointerover", mark("a"));
    offSvg(svg, box, 30, 40);
    box.style.top = "12px";
    await mutations();
    expect(heard).toEqual(["hover a pointer"]);
  });

  it("hovers the mark the pointer is over once it's gone, or ends the hover over nothing", async () => {
    const { svg, mark, blank, layer, box, heard, interaction } = setup();
    let under: Element | null = box;
    stubPoint(() => under);
    pointer("pointerover", mark("a"));
    offSvg(svg, box, 30, 40);
    pointer("pointermove", box, { x: 32, y: 44 });
    under = mark("b");
    box.style.top = "80px";
    await mutations();
    expect(document.elementFromPoint).toHaveBeenLastCalledWith(32, 44);
    expect(heard).toEqual(["hover a pointer", "leave", "hover b pointer"]);
    // It let go: the layer's leave events are no longer its.
    pointer("pointerleave", layer, { related: blank });
    expect(heard).toHaveLength(3);
    pointer("pointerover", mark("a"));
    under = box;
    offSvg(svg, box, 30, 40);
    under = blank;
    box.textContent = "Shorter";
    await mutations();
    expect(heard.slice(3)).toEqual(["leave", "hover a pointer", "leave"]);
    expect(interaction.current).toBeUndefined();
  });

  it("hovers what's under the pointer when its tooltip hides with the hover going on", async () => {
    const { svg, mark, box, heard, shown } = setup();
    let under: Element | null = box;
    stubPoint(() => under);
    pointer("pointerover", mark("a"));
    offSvg(svg, box);
    // A tooltip function gives no text for the row an update brought: the box hides.
    shown.tooltip = false;
    under = mark("c");
    box.className = "ec-tooltip";
    await mutations();
    expect(heard).toEqual(["hover a pointer", "leave", "hover c pointer"]);
  });

  it("lets go without hovering when focus moved the hover and its tooltip away", async () => {
    const { svg, mark, box, heard, shown, interaction } = setup();
    let under: Element | null = box;
    stubPoint(() => under);
    pointer("pointerover", mark("a"));
    offSvg(svg, box);
    shown.key = "c";
    under = mark("b");
    box.style.left = "200px";
    await mutations();
    // A leave the chart ignores, since focus holds c: the pointer hovers again when it next moves onto a mark.
    expect(heard).toEqual(["hover a pointer", "leave"]);
    expect(interaction.current).toBeUndefined();
  });

  it("holds the new target when focus moves the hover and its tooltip stays under the pointer", async () => {
    const { svg, mark, box, heard, shown, interaction } = setup();
    stubPoint(() => box);
    pointer("pointerover", mark("a"));
    offSvg(svg, box);
    shown.key = "c";
    box.textContent = "c";
    await mutations();
    expect(interaction.current).toBe("c");
    expect(heard).toEqual(["hover a pointer", "leave", "hover c pointer"]);
  });
});
