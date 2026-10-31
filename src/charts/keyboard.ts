// Keyboard focus for a chart's marks, delegated from the root <svg> like pointer hover. The chart is
// one tab stop (a roving tabindex): arrow keys move between marks in visual order, Page Up and Page
// Down by a page, Home and End jump to the ends, and Escape leaves. Focus that follows a key press
// shows the ring and plays the hover story; focus from a click or tap does neither (the pointer's own
// hover is playing), as with :focus-visible. The charts (through shell/hover.ts) and expressive()
// share it.

export interface KeyboardFocusOptions {
  /** The mark an event target belongs to, if any (leaving marks don't count). */
  find(target: EventTarget | null): string | undefined;
  /** The marks that can take focus, in visual order. */
  order(): readonly string[];
  /** The element that takes a mark's focus. Leaving marks' too, unless `tabIndex` is given. */
  element(key: string): SVGElement | undefined;
  /**
   * Sets a mark's tabindex: "0" for the tab stop, "-1" for the others, and undefined once the mark
   * has left. By default it's set on `element(key)`; the adapter sets it on the host's elements itself,
   * so it can put back what they had.
   */
  tabIndex?(key: string, value: "0" | "-1" | undefined): void;
  /** A mark took focus. `visible`: it followed a key press, so it shows the ring. */
  focus(key: string, visible: boolean): void;
  /** Focus left the chart's marks. */
  blur(key: string): void;
  /** Escape on a focused mark. Returns whether it did anything. */
  escape(key: string): boolean;
  /**
   * Where a page goes from `key`: on (`by` 1, Page Down) or back (-1, Page Up), for an axis whose page
   * isn't a count of marks. A line chart's time axis gives the first x a calendar month or more away.
   * Undefined, or a key not in the order, keeps the default: a tenth of the marks, rounded up.
   */
  page?(key: string, by: 1 | -1): string | undefined;
  /**
   * Where an arrow key, Home or End goes from `key`, for marks that aren't in one row: a line chart's
   * points go along their line, and Up and Down between lines. `key` itself stays put. Undefined, or
   * a key not in the order, keeps the default: the next or previous mark in the order, or its ends.
   */
  move?(key: string, press: MoveKey): string | undefined;
}

/** The keys a chart can say where they go. */
export type MoveKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

export interface KeyboardFocus {
  /** The element with focus in the chart's document or shadow root, even while the window is in the background. */
  active(): Element | null;
  /** Moves the tab stop and focus to a mark as a key press would, whatever the last input was: it shows the ring and plays the hover. */
  focus(key: string): void;
  /**
   * After the marks changed: keeps the tab stop on its key, or, when that mark left, moves it to its
   * nearest neighbour; then sets every mark's tabindex. Focus follows the tab stop if its mark left,
   * and goes to the mark's new element if the host replaced the focused one. It also listens on the
   * <svg> as it is now: a host may draw a new one, or move it into or out of a shadow root.
   */
  sync(): void;
  /**
   * After the marks changed kind (a line chart's `hover`): the tab stop goes to `to` of its key, or
   * else the first mark, and focus on a mark goes with it, without `focus` being told, so nothing
   * hovers. Gives the key with focus now, if a mark has it.
   */
  retarget(to: (key: string) => string | undefined): string | undefined;
  /**
   * Moves the tab stop to a mark without focus, so `focus` isn't told and nothing hovers: Tab lands
   * on it next. Returns whether it did: not for a key that isn't in the order, or while a mark has
   * focus, which keeps the tab stop with it.
   */
  moveTabStop(key: string): boolean;
  destroy(): void;
}

export function keyboardFocus(svg: () => SVGSVGElement | undefined, options: KeyboardFocusOptions): KeyboardFocus {
  /** What the listeners are on. Focus is heard on the document or shadow root, not on the <svg>. */
  let on: { readonly svg: SVGSVGElement; readonly doc: Document; readonly scope: Document | ShadowRoot } | undefined;
  /** The mark with focus, as focusin and focusout tell it. */
  let current: string | undefined;
  /** The element that last took a mark's focus, and its mark. */
  let focused: { readonly key: string; readonly element: SVGElement } | undefined;
  /** A mark's element that focus left for nowhere in this task: maybe the host removing it. */
  let dropped: SVGElement | undefined;
  let tabStop: string | undefined;
  /** The order sync() last saw, to find a leaving mark's neighbours. */
  let last: readonly string[] = [];
  /** Whether the last input was a key (or there's been none), as :focus-visible decides. */
  let keyboardInput = true;

  const setTabIndex =
    options.tabIndex ??
    ((key: string, value: "0" | "-1" | undefined): void => {
      const element = options.element(key);
      if (value === undefined) element?.removeAttribute("tabindex");
      else element?.setAttribute("tabindex", value);
    });

  /** One mark is in the tab order; the others take focus from the arrow keys. */
  const applyTabIndex = (keys: readonly string[]): void => {
    for (const key of keys) setTabIndex(key, key === tabStop ? "0" : "-1");
  };

  const focusKey = (key: string): void => {
    tabStop = key;
    applyTabIndex(options.order());
    options.element(key)?.focus();
  };

  const leave = (): void => {
    const key = current;
    current = undefined;
    if (key !== undefined) options.blur(key);
  };

  // On the whole document: a Tab from outside the chart has to count, and so does a click anywhere.
  const anyKey = (event: KeyboardEvent): void => {
    if (!event.metaKey && !event.altKey && !event.ctrlKey) keyboardInput = true;
  };
  const anyPointer = (): void => {
    keyboardInput = false;
    dropped = undefined;
  };

  const focusIn = (event: FocusEvent): void => {
    dropped = undefined;
    const key = options.find(event.target);
    if (key === undefined) {
      // Focus moved on from an element the host removed, which brings no focusout.
      leave();
      return;
    }
    // Focus on a mark's element that screen readers can't see (a click on a stack's other segment,
    // which the adapter's markLabel hides) goes on to the element that carries the mark's name.
    const own = options.element(key);
    if (own && own !== event.target && (event.target as Element).getAttribute("aria-hidden") === "true") {
      own.focus();
      if (on?.scope.activeElement === own) return;
    }
    focused = { key, element: event.target as SVGElement };
    if (key === current) return;
    current = key;
    tabStop = key;
    applyTabIndex(options.order());
    options.focus(key, keyboardInput);
  };

  const focusOut = (event: FocusEvent): void => {
    const element = focused?.element;
    if (current === undefined || !element || event.target !== element) return;
    // Moving to another mark: its focusin takes over.
    if (options.find(event.relatedTarget) !== undefined) return;
    leave();
    if (event.relatedTarget !== null) return;
    // Focus going nowhere may be the host removing the element: Chrome tells that as a blur while the
    // element is still in the page. If it's gone once this task is done, sync() brings focus back.
    dropped = element;
    queueMicrotask(() => {
      if (dropped === element && element.isConnected) dropped = undefined;
    });
  };

  const keyDown = (event: KeyboardEvent): void => {
    const key = options.find(event.target);
    if (key === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    const keys = options.order();
    const index = keys.indexOf(key);
    /** Where the chart says `press` goes, or else `fallback`. */
    const moved = (press: MoveKey, fallback: string | undefined): string | undefined => {
      const to = options.move?.(key, press);
      return to !== undefined && keys.includes(to) ? to : fallback;
    };
    let next: string | undefined;
    switch (event.key) {
      // Down or right is next whatever the orientation: rows run top to bottom, columns left to right.
      case "ArrowDown":
      case "ArrowRight":
        next = moved(event.key, keys[Math.min(keys.length - 1, index + 1)]);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = moved(event.key, keys[Math.max(0, index - 1)]);
        break;
      case "PageDown":
      case "PageUp": {
        const by = event.key === "PageDown" ? 1 : -1;
        const paged = options.page?.(key, by);
        next = paged !== undefined && keys.includes(paged) ? paged : keys[Math.min(keys.length - 1, Math.max(0, index + by * Math.ceil(keys.length / 10)))];
        break;
      }
      case "Home":
        next = moved(event.key, keys[0]);
        break;
      case "End":
        next = moved(event.key, keys[keys.length - 1]);
        break;
      case "Escape":
        if (options.escape(key)) event.preventDefault();
        return;
      default:
        return;
    }
    // Arrows and pages at either end stay put, without scrolling the page.
    event.preventDefault();
    if (next !== undefined && next !== key) focusKey(next);
  };

  const unlisten = (): void => {
    if (!on) return;
    on.doc.removeEventListener("keydown", anyKey, true);
    on.doc.removeEventListener("pointerdown", anyPointer, true);
    on.scope.removeEventListener("focusin", focusIn as EventListener, true);
    on.scope.removeEventListener("focusout", focusOut as EventListener, true);
    on.svg.removeEventListener("keydown", keyDown);
    on = undefined;
  };

  /** Listens on the <svg> as it is now, if it or its document or shadow root changed. */
  const listen = (): void => {
    const next = svg();
    const node = next?.getRootNode();
    // Not on the <svg>: Chrome makes an SVG element with focus listeners of its own a tab stop.
    const scope = node && "host" in node ? (node as ShadowRoot) : next?.ownerDocument;
    if (next === on?.svg && scope === on?.scope) return;
    unlisten();
    if (!next || !scope) return;
    on = { svg: next, doc: next.ownerDocument, scope };
    on.doc.addEventListener("keydown", anyKey, true);
    on.doc.addEventListener("pointerdown", anyPointer, true);
    on.scope.addEventListener("focusin", focusIn as EventListener, true);
    on.scope.addEventListener("focusout", focusOut as EventListener, true);
    on.svg.addEventListener("keydown", keyDown);
  };

  listen();

  return {
    active: () => on?.scope.activeElement ?? null,
    focus(key) {
      keyboardInput = true;
      // Already focused (from a click, say): no focusin comes, so it's told here.
      if (key === current && focused?.element === on?.scope.activeElement) options.focus(key, true);
      else focusKey(key);
    },
    sync() {
      listen();
      const keys = options.order();
      const live = new Set(keys);
      const gone = last.filter((key) => !live.has(key));
      if (tabStop === undefined || !live.has(tabStop)) tabStop = neighbour(last, tabStop, live) ?? keys[0];
      // The mark with focus: its element is active (even while the window is in the background, when
      // no focus events come), or the host removed its element while it had focus. Browsers tell that
      // differently: Chrome with a blur just before, which left focus nowhere; others not at all.
      const nowhere = !on?.doc.activeElement || on.doc.activeElement === on.doc.body;
      const removed = focused !== undefined && !focused.element.isConnected && (current !== undefined || (focused.element === dropped && nowhere));
      const had = focused && (focused.element === on?.scope.activeElement || removed) ? focused : undefined;
      dropped = undefined;
      if (had && !live.has(had.key)) {
        // It left: focus goes to its neighbour, or, with no marks left, out of the chart.
        if (tabStop !== undefined) focusKey(tabStop);
        else if (had.element.isConnected) had.element.blur();
        else leave();
      } else if (had && options.find(had.element) !== had.key) {
        // The host replaced its element (Vega does), even if the old one is still in the page, as in a
        // D3 exit transition: focus the new one.
        focusKey(had.key);
      }
      applyTabIndex(keys);
      for (const key of gone) setTabIndex(key, undefined);
      last = keys;
    },
    retarget(to) {
      listen();
      const keys = options.order();
      const live = new Set(keys);
      // The mark with focus: the one focus events told of or, while the window is in the background and
      // none come, the one whose element is active.
      const active = on?.scope.activeElement ?? null;
      const had = focused?.element === active ? focused.key : last.find((key) => options.element(key) === active);
      const from = had ?? tabStop;
      const moved = from === undefined ? undefined : to(from);
      tabStop = moved !== undefined && live.has(moved) ? moved : keys[0];
      // The new marks take focus before the old ones lose their tabindex. Focus moves as if it had been
      // there: its focusout finds the new mark, and its focusin the key it has already.
      applyTabIndex(keys);
      if (had !== undefined) {
        current = tabStop;
        if (tabStop !== undefined) options.element(tabStop)?.focus();
        else {
          (active as SVGElement).blur();
          focused = undefined;
        }
      }
      for (const key of last) if (!live.has(key)) setTabIndex(key, undefined);
      last = keys;
      return had === undefined ? undefined : current;
    },
    moveTabStop(key) {
      listen();
      const keys = options.order();
      if (!keys.includes(key) || options.find(on?.scope.activeElement ?? null) !== undefined) return false;
      tabStop = key;
      applyTabIndex(keys);
      return true;
    },
    destroy() {
      current = undefined;
      focused = undefined;
      dropped = undefined;
      unlisten();
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
