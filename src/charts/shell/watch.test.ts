import { afterEach, describe, expect, it, vi } from "vitest";
import { manualClock } from "../../core";
import { svgElement } from "../render/svg";
import { watchText } from "./watch";

/** A ResizeObserver that reports only when told: `tell` gives each observer an entry for what it observes, another element, or (null) none. */
function stubResizeObserver() {
  const observers: { callback: ResizeObserverCallback; targets: Element[]; disconnected: boolean }[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private readonly entry: (typeof observers)[number];
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, targets: [], disconnected: false };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.targets.push(target);
      }
      unobserve() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    }
  );
  const tell = (width: number, target?: Element | null) =>
    observers.forEach(({ callback, targets }) => {
      const entry = target === null ? { contentRect: { width } } : { target: target ?? targets[0], contentRect: { width } };
      callback([entry as unknown as ResizeObserverEntry], {} as ResizeObserver);
    });
  return { observers, tell };
}

function setup() {
  const svg = svgElement("svg", {}, document.body);
  const clock = manualClock();
  const changed = vi.fn();
  const stop = watchText(svg, clock, changed);
  return { svg, clock, changed, stop };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("watchText", () => {
  it("without ResizeObserver, adds nothing and watches nothing", () => {
    const { svg, stop } = setup();
    expect(svg.childElementCount).toBe(0);
    expect(() => stop()).not.toThrow();
  });

  it("adds one line of text with no class, hidden from sight, the pointer and assistive tech, and watches it", () => {
    const { observers } = stubResizeObserver();
    const { svg } = setup();
    expect(svg.innerHTML).toBe('<text font-size="11" visibility="hidden" pointer-events="none" aria-hidden="true">Hamburgefonstiv 0123456789</text>');
    expect(observers).toHaveLength(1);
    expect(observers[0]!.targets).toEqual([svg.firstElementChild]);
    const probe = svg.firstElementChild as SVGTextElement;
    probe.focus();
    expect(document.activeElement).not.toBe(probe);
  });

  it("compares with the first width it has, hearing of a change of half a px or more on the next frame", () => {
    const { tell } = stubResizeObserver();
    const { clock, changed } = setup();
    tell(150);
    clock.advance(16);
    expect(changed).not.toHaveBeenCalled();
    tell(150.5);
    expect(changed).not.toHaveBeenCalled();
    clock.advance(16);
    expect(changed).toHaveBeenCalledTimes(1);
    // From the width it last heard of.
    tell(150.9);
    clock.advance(16);
    expect(changed).toHaveBeenCalledTimes(1);
    tell(149.9);
    clock.advance(16);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("does nothing for a change of less than half a px, however many", () => {
    const { tell } = stubResizeObserver();
    const { clock, changed } = setup();
    tell(150);
    for (const width of [150.4, 150.2, 149.6]) {
      tell(width);
      clock.advance(16);
    }
    expect(changed).not.toHaveBeenCalled();
    expect(clock.idle).toBe(true);
  });

  it("hears of two changes in a frame once, and of a change and back not at all", () => {
    const { tell } = stubResizeObserver();
    const { clock, changed } = setup();
    tell(150);
    tell(160);
    tell(170);
    clock.advance(16);
    expect(changed).toHaveBeenCalledTimes(1);
    tell(180);
    tell(170.2);
    clock.advance(16);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("ignores no width, as in display: none, and compares with the width it had when there's one again", () => {
    const { tell } = stubResizeObserver();
    const { clock, changed } = setup();
    tell(0);
    tell(150);
    tell(0);
    tell(150);
    clock.advance(16);
    expect(changed).not.toHaveBeenCalled();
    tell(0);
    tell(165);
    clock.advance(16);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("ignores entries for other elements, as a stand-in that tells every observer may give", () => {
    const { tell } = stubResizeObserver();
    const { clock, changed } = setup();
    tell(150);
    tell(400, document.body);
    tell(420, null);
    clock.advance(16);
    expect(changed).not.toHaveBeenCalled();
  });

  it("stops: no observer, and no frame on its way", () => {
    const { observers, tell } = stubResizeObserver();
    const { clock, changed, stop } = setup();
    tell(150);
    tell(160);
    stop();
    expect(observers[0]!.disconnected).toBe(true);
    expect(clock.idle).toBe(true);
    clock.advance(16);
    expect(changed).not.toHaveBeenCalled();
  });
});
