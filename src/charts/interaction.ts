// Pointer hover for a chart's marks, delegated from the root <svg>. A mouse or pen hovers; a touch tap
// acts as hover until a tap somewhere else.

export interface HoverTarget {
  readonly key: string;
  /** The segment's series under the pointer, if it's over one. */
  readonly segment?: string;
}

export interface PointerHoverOptions {
  /** The mark an event target belongs to, if any (leaving marks don't count). */
  find(target: EventTarget | null): HoverTarget | undefined;
  hover(target: HoverTarget, source: "pointer" | "touch"): void;
  leave(): void;
}

export interface PointerHover {
  /** The hovered key, if any. */
  readonly current: string | undefined;
  /** Leaves the hovered mark, for example because it's being removed. */
  clear(): void;
  destroy(): void;
}

export function pointerHover(svg: SVGSVGElement, options: PointerHoverOptions): PointerHover {
  const doc = svg.ownerDocument;
  let current: string | undefined;
  let lastPointer = "mouse";

  const enter = (target: HoverTarget | undefined, source: "pointer" | "touch"): void => {
    if (target?.key === current) return;
    leave();
    if (!target) return;
    current = target.key;
    options.hover(target, source);
  };

  const leave = (): void => {
    if (current === undefined) return;
    current = undefined;
    options.leave();
  };

  // Touch fires pointerover and pointerleave around every tap; taps are handled on click instead.
  const over = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") enter(options.find(event.target), "pointer");
  };
  const out = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") leave();
  };
  const down = (event: PointerEvent): void => {
    lastPointer = event.pointerType;
  };
  // A click follows a tap but not a scroll, so scrolling past the chart doesn't hover anything.
  const click = (event: MouseEvent): void => {
    if (lastPointer === "touch") enter(options.find(event.target), "touch");
  };
  const elsewhere = (event: PointerEvent): void => {
    if (current !== undefined && event.pointerType === "touch" && !svg.contains(event.target as Node | null)) leave();
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
      current = undefined;
      svg.removeEventListener("pointerover", over);
      svg.removeEventListener("pointerleave", out);
      svg.removeEventListener("pointerdown", down);
      svg.removeEventListener("click", click);
      doc.removeEventListener("pointerdown", elsewhere, true);
    }
  };
}
