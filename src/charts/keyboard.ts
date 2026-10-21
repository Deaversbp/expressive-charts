// Keyboard focus for a chart's marks, delegated from the root <svg> like pointer hover. The chart is
// one tab stop (a roving tabindex): arrow keys move between marks in visual order, Home and End jump
// to the ends, and Escape leaves. Focus that follows a key press shows the ring and plays the hover
// story; focus from a click or tap does neither (the pointer's own hover is playing), as with
// :focus-visible.

export interface KeyboardFocusOptions {
  /** The mark an event target belongs to, if any (leaving marks don't count). */
  find(target: EventTarget | null): string | undefined;
  /** The marks that can take focus, in visual order. */
  order(): readonly string[];
  /** The element that takes a mark's focus, leaving marks included. */
  element(key: string): SVGElement | undefined;
  /** A mark took focus. `visible`: it followed a key press, so it shows the ring. */
  focus(key: string, visible: boolean): void;
  /** Focus left the chart's marks. */
  blur(key: string): void;
  /** Escape on a focused mark. Returns whether it did anything. */
  escape(key: string): boolean;
}

export interface KeyboardFocus {
  /** The element with focus in the chart's document or shadow root, even while the window is in the background. */
  active(): Element | null;
  /**
   * After the marks changed: keeps the tab stop on its key, or, when that mark left, moves it (and
   * focus, if the mark had it) to its nearest neighbour; then sets every mark's tabindex.
   */
  sync(): void;
  destroy(): void;
}

export function keyboardFocus(svg: SVGSVGElement, options: KeyboardFocusOptions): KeyboardFocus {
  const doc = svg.ownerDocument;
  // Focus events are heard on the document or shadow root the chart is in, not on the <svg>: Chrome
  // makes an SVG element with focus listeners of its own a tab stop.
  const root = svg.getRootNode();
  const scope: Document | ShadowRoot = "host" in root ? (root as ShadowRoot) : doc;
  /** The focused mark, as focusin and focusout tell it. */
  let current: string | undefined;
  let tabStop: string | undefined;
  /** The order sync() last saw, to find a leaving mark's neighbours. */
  let last: readonly string[] = [];
  /** Whether the last input was a key (or there's been none), as :focus-visible decides. */
  let keyboardInput = true;

  /** One mark is in the tab order; the others take focus from the arrow keys. */
  const applyTabIndex = (keys: readonly string[]): void => {
    for (const key of keys) options.element(key)?.setAttribute("tabindex", key === tabStop ? "0" : "-1");
  };

  const focusKey = (key: string): void => {
    tabStop = key;
    applyTabIndex(options.order());
    options.element(key)?.focus();
  };

  // On the whole document: a Tab from outside the chart has to count, and so does a click anywhere.
  const anyKey = (event: KeyboardEvent): void => {
    if (!event.metaKey && !event.altKey && !event.ctrlKey) keyboardInput = true;
  };
  const anyPointer = (): void => {
    keyboardInput = false;
  };

  const focusIn = (event: FocusEvent): void => {
    const key = options.find(event.target);
    if (key === undefined || key === current) return;
    current = key;
    tabStop = key;
    applyTabIndex(options.order());
    options.focus(key, keyboardInput);
  };

  const focusOut = (event: FocusEvent): void => {
    const key = current;
    if (key === undefined || event.target !== options.element(key)) return;
    // Moving to another mark: its focusin takes over.
    if (options.find(event.relatedTarget) !== undefined) return;
    current = undefined;
    options.blur(key);
  };

  const keyDown = (event: KeyboardEvent): void => {
    const key = options.find(event.target);
    if (key === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    const keys = options.order();
    const index = keys.indexOf(key);
    let next: string | undefined;
    switch (event.key) {
      // Down or right is next whatever the orientation: rows run top to bottom, columns left to right.
      case "ArrowDown":
      case "ArrowRight":
        next = keys[Math.min(keys.length - 1, index + 1)];
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = keys[Math.max(0, index - 1)];
        break;
      case "Home":
        next = keys[0];
        break;
      case "End":
        next = keys[keys.length - 1];
        break;
      case "Escape":
        if (options.escape(key)) event.preventDefault();
        return;
      default:
        return;
    }
    // Arrows at either end stay put, without scrolling the page.
    event.preventDefault();
    if (next !== undefined && next !== key) focusKey(next);
  };

  doc.addEventListener("keydown", anyKey, true);
  doc.addEventListener("pointerdown", anyPointer, true);
  scope.addEventListener("focusin", focusIn as EventListener, true);
  scope.addEventListener("focusout", focusOut as EventListener, true);
  svg.addEventListener("keydown", keyDown);

  return {
    active: () => scope.activeElement,
    sync() {
      const keys = options.order();
      const live = new Set(keys);
      const gone = last.filter((key) => !live.has(key));
      if (tabStop === undefined || !live.has(tabStop)) tabStop = neighbour(last, tabStop, live) ?? keys[0];
      // The focused mark left: focus goes to its neighbour, or, with no marks left, out of the chart.
      const active = scope.activeElement;
      const lost = active ? gone.map((key) => options.element(key)).find((element) => element === active) : undefined;
      if (lost && tabStop !== undefined) focusKey(tabStop);
      else if (lost) lost.blur();
      applyTabIndex(keys);
      for (const key of gone) options.element(key)?.removeAttribute("tabindex");
      last = keys;
    },
    destroy() {
      current = undefined;
      doc.removeEventListener("keydown", anyKey, true);
      doc.removeEventListener("pointerdown", anyPointer, true);
      scope.removeEventListener("focusin", focusIn as EventListener, true);
      scope.removeEventListener("focusout", focusOut as EventListener, true);
      svg.removeEventListener("keydown", keyDown);
    }
  };
}

/** The nearest key to `key` in `order` that's still live: the one after it first, then the one before, and outwards. */
function neighbour(order: readonly string[], key: string | undefined, live: ReadonlySet<string>): string | undefined {
  const index = key === undefined ? -1 : order.indexOf(key);
  if (index < 0) return undefined;
  for (let step = 1; step < order.length; step++) {
    for (const at of [index + step, index - step]) {
      const candidate = order[at];
      if (candidate !== undefined && live.has(candidate)) return candidate;
    }
  }
  return undefined;
}
