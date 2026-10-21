import { svgElement } from "../render/svg";
import { orderElements } from "./order";

function setup(keys: readonly string[]) {
  const svg = svgElement("svg", {}, document.body);
  const layer = svgElement("g", {}, svg);
  const marks = new Map(keys.map((key) => [key, svgElement("g", { "data-key": key, tabindex: "-1" }, layer)]));
  const keysInDom = () => Array.from(layer.children, (child) => child.getAttribute("data-key"));
  const elements = (order: readonly string[]) => order.map((key) => marks.get(key)!);
  return { svg, layer, marks, keysInDom, elements };
}

describe("orderElements", () => {
  afterEach(() => {
    document.body.textContent = "";
  });

  it("moves the elements into the new order", () => {
    const { layer, keysInDom, elements } = setup(["a", "b", "c"]);
    orderElements(layer, elements(["a", "b", "c"]), elements(["c", "a", "b"]), () => null);
    expect(keysInDom()).toEqual(["c", "a", "b"]);
  });

  it("leaves the focused element where it is, moving the others around it", () => {
    const { layer, marks, keysInDom, elements } = setup(["a", "b", "c"]);
    const focused = marks.get("b")!;
    focused.focus();
    const moved = vi.spyOn(layer, "insertBefore");
    const appended = vi.spyOn(layer, "appendChild");
    orderElements(layer, elements(["a", "b", "c"]), elements(["c", "b", "a"]), () => document.activeElement);
    expect(keysInDom()).toEqual(["c", "b", "a"]);
    expect([...moved.mock.calls, ...appended.mock.calls].map(([element]) => element)).not.toContain(focused);
    expect(document.activeElement).toBe(focused);
  });

  it("does nothing when the order is the same, without asking for focus", () => {
    const { layer, elements } = setup(["a", "b"]);
    const active = vi.fn(() => null);
    const appended = vi.spyOn(layer, "appendChild");
    orderElements(layer, elements(["a", "b"]), elements(["a", "b"]), active);
    expect(active).not.toHaveBeenCalled();
    expect(appended).not.toHaveBeenCalled();
  });
});
