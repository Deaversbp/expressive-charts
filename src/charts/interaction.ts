// Pointer hover for a chart's marks, delegated from the root <svg>. A mouse or pen hovers; a touch tap
// acts as hover until a tap somewhere else. While a tooltip shows, the pointer on it is on the target
// it's for, so it can be read, selected and magnified without the hover ending (WCAG 1.4.13).

export interface HoverTarget {
  readonly key: string;
  /** The segment's series under the pointer, if it's over one. */
  readonly segment?: string;
}

/** The chart's own hovered target, and its tooltip's element while that shows. */
export interface HoverTooltip {
  readonly key: string;
  readonly element: HTMLElement | undefined;
}

export interface PointerHoverOptions {
  /** The mark an event target belongs to, if any (leaving marks don't count). */
  find(target: EventTarget | null): HoverTarget | undefined;
  hover(target: HoverTarget, source: "pointer" | "touch"): void;
  leave(): void;
  /**
   * The chart's own hover, if any, and its tooltip while that shows: the pointer on the tooltip is on
   * the hovered target. Undefined with no hover, or a link's.
   */
  tooltip?(): HoverTooltip | undefined;
}

export interface PointerHover {
  /** The hovered key, if any: the target the pointer is on, or whose tooltip it's on. */
  readonly current: string | undefined;
  /** Leaves the hovered mark, for example because it's being removed. */
  clear(): void;
  destroy(): void;
}

export function pointerHover(svg: SVGSVGElement, options: PointerHoverOptions): PointerHover {
  const doc = svg.ownerDocument;
  let current: string | undefined;
  let lastPointer = "mouse";
  /** The tooltip the pointer is on, and where the pointer is there, in client px. */
  let held: { readonly element: HTMLElement; x: number; y: number } | undefined;
  /** Watches the held tooltip for a change that moves it, or hides it, from under the pointer. */
  let watcher: MutationObserver | undefined;

  const enter = (target: HoverTarget | undefined, source: "pointer" | "touch"): void => {
    if (target?.key === current) return;
    leave();
    if (!target) return;
    current = target.key;
    options.hover(target, source);
  };

  const leave = (): void => {
    letGo();
    if (current === undefined) return;
    current = undefined;
    options.leave();
  };

  /** The tooltip's element while it shows, if it holds `node`. */
  const tooltipHolding = (node: Node | null): HoverTooltip | undefined => {
    const tip = options.tooltip?.();
    return tip?.element && node && tip.element.contains(node) ? tip : undefined;
  };

  /** The element at a point in client px, in the chart's document or shadow root; undefined where that can't be found. */
  const elementAt = (x: number, y: number): Element | null | undefined => {
    const root = svg.getRootNode() as Document | ShadowRoot;
    return typeof root.elementFromPoint === "function" ? root.elementFromPoint(x, y) : undefined;
  };

  /** Where the pointer went from an element it left: the event's related target or, without one, what's under it. */
  const landing = (event: PointerEvent): Element | null => (event.relatedTarget as Element | null) ?? elementAt(event.clientX, event.clientY) ?? null;

  /** The pointer is now over `element`: the tooltip, whose target it holds; a mark, which it hovers; or anything else, which ends the hover. */
  const arrive = (element: Element | null, x: number, y: number): void => {
    const tip = tooltipHolding(element);
    if (tip) hold(tip, x, y);
    else enter(element && svg.contains(element) ? options.find(element) : undefined, "pointer");
  };

  /** The pointer is on the tooltip, on its target: keyboard focus may have put it there. */
  const hold = (tip: HoverTooltip, x: number, y: number): void => {
    enter({ key: tip.key }, "pointer");
    const element = tip.element!;
    if (held?.element === element) {
      held.x = x;
      held.y = y;
      return;
    }
    letGo();
    held = { element, x, y };
    element.addEventListener("pointermove", track);
    element.addEventListener("pointerleave", off);
    watcher = new MutationObserver(recheck);
    watcher.observe(element, { attributes: true, childList: true, characterData: true, subtree: true });
  };

  const letGo = (): void => {
    if (!held) return;
    held.element.removeEventListener("pointermove", track);
    held.element.removeEventListener("pointerleave", off);
    watcher?.disconnect();
    watcher = undefined;
    held = undefined;
  };

  const track = (event: PointerEvent): void => {
    if (!held || event.pointerType === "touch") return;
    held.x = event.clientX;
    held.y = event.clientY;
  };

  /** Off the tooltip: onto a mark, which it hovers, or anywhere else, which ends the hover. */
  const off = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    letGo();
    arrive(landing(event), event.clientX, event.clientY);
  };

  /**
   * The held tooltip changed. If it has moved from under the pointer, the pointer is on whatever it's
   * over now. If it shows another target now (focus moved the hover), the pointer isn't on the
   * hovered target any more, and hovers again when it next moves onto a mark.
   */
  const recheck = (): void => {
    if (!held) return;
    const { x, y } = held;
    const under = elementAt(x, y);
    if (under === undefined) return;
    const tip = options.tooltip?.();
    const onTip = tip?.element !== undefined && under !== null && tip.element.contains(under);
    if (onTip && tip.key === current) return;
    letGo();
    if (!onTip && tip?.key !== current) {
      leave();
      return;
    }
    arrive(under, x, y);
  };

  // Touch fires pointerover and pointerleave around every tap; taps are handled on click instead.
  const over = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    letGo();
    enter(options.find(event.target), "pointer");
  };
  // Off the <svg>, onto the tooltip the pointer stays on the hovered target; anywhere else it leaves.
  const out = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") arrive(landing(event), event.clientX, event.clientY);
  };
  const down = (event: PointerEvent): void => {
    lastPointer = event.pointerType;
  };
  // A click follows a tap but not a scroll, so scrolling past the chart doesn't hover anything.
  const click = (event: MouseEvent): void => {
    if (lastPointer === "touch") enter(options.find(event.target), "touch");
  };
  // A tap on the tooltip isn't a tap elsewhere: the hover stays. The document hears a chart in a
  // shadow root's events from its host, so the target is the first in the event's path.
  const elsewhere = (event: PointerEvent): void => {
    if (current === undefined || event.pointerType !== "touch") return;
    const target = (event.composedPath()[0] ?? event.target) as Node | null;
    if (!svg.contains(target) && !tooltipHolding(target)) leave();
  };

  svg.addEventListener("pointerover", over);
  svg.addEventListener("pointerleave", out);
  svg.addEventListener("pointerdown", down);
  svg.addEventListener("click", click);
  doc.addEventListener("pointerdown", elsewhere, true);

  return {
    get current() {
      return current;
    },
    clear: leave,
    destroy() {
      letGo();
      current = undefined;
      svg.removeEventListener("pointerover", over);
      svg.removeEventListener("pointerleave", out);
      svg.removeEventListener("pointerdown", down);
      svg.removeEventListener("click", click);
      doc.removeEventListener("pointerdown", elsewhere, true);
    }
  };
}
