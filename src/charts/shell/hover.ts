// Hover for a reference chart's marks. Pointer, touch and keyboard focus share one hover: the mark's
// emphasis (`ec-hot`), the others' dimming (`ec-hovering` on the <svg>), the tooltip, the runner's
// hover and leave, and the events. Focus from a key press shows the focus ring and plays the hover;
// focus from a click or tap moves the tab stop but leaves the hover to the pointer.
//
// The chart says which marks there are and draws them: it finds a live mark from an event target,
// gives a mark's element and how it is on screen, draws the ring and shows the tooltip.

import type { RunInput, Runner } from "../../core/runner";
import { pointerHover, type HoverTarget } from "../interaction";
import { keyboardFocus } from "../keyboard";
import type { MarkEvents } from "../types";
import type { ChartEvents } from "./events";

type HoverSource = MarkEvents<unknown>["hover"]["source"];

export interface ChartHoverOptions<D> {
  readonly svg: SVGSVGElement;
  readonly runner: Pick<Runner<D>, "hover" | "leave">;
  readonly events: Pick<ChartEvents<D>, "emit">;
  /** Whether the other marks dim while one is hovered: the `dim` option as it is now. */
  dim(): boolean;
  /** The live mark an event target belongs to, with the segment under the pointer; leaving marks don't count. */
  find(target: EventTarget | null): HoverTarget | undefined;
  /** Whether `key`'s mark is live: on screen and not leaving. */
  live(key: string): boolean;
  /** The live marks' keys, in visual order. */
  order(): readonly string[];
  /** A mark's element, live or leaving: it takes focus, and the hover's emphasis. */
  element(key: string): SVGElement | undefined;
  /** A mark as it is on screen, live or leaving: what hover and leave report, so mid-change they match what's under the pointer. */
  onScreen(key: string): RunInput<D> | undefined;
  /** Draws the focus ring around the live mark `key` as it is on screen, or hides it. */
  ring(key: string | undefined): void;
  readonly tooltip: {
    /** Shows the tooltip beside the live mark `key` as it is on screen, or moves it there. */
    show(key: string): void;
    hide(): void;
  };
}

export interface ChartHover {
  /** The hovered mark's key. */
  readonly key: string | undefined;
  /** The mark showing the focus ring: focused from the keyboard. */
  readonly ringKey: string | undefined;
  /** The element with focus in the chart's document or shadow root. */
  active(): Element | null;
  /** An effect restyled a mark: the focus ring and the tooltip follow its transform. */
  restyled(key: string): void;
  /** After `dim` changed: the others dim, or stop dimming, now. */
  syncDim(): void;
  /** After the marks changed: ends the hover if its mark has left. */
  dropGone(): void;
  /** After the marks changed: the tab stop stays on its key, or moves to its nearest neighbour, and focus follows. */
  sync(): void;
  destroy(): void;
}

const ONE = { index: 0, count: 1 } as const;

export function chartHover<D>(options: ChartHoverOptions<D>): ChartHover {
  const { svg, runner, events } = options;
  let hovered: { readonly key: string; readonly source: HoverSource } | undefined;
  let ringKey: string | undefined;

  /** Pointer and keyboard hover share this: the mark's emphasis, the others' dimming, the hover runs and the event. */
  function startHover(key: string, source: HoverSource, segment?: string): void {
    hovered = { key, source };
    options.element(key)!.classList.add("ec-hot");
    if (options.dim()) svg.classList.add("ec-hovering");
    options.tooltip.show(key);
    runner.hover([options.onScreen(key)!]);
    events.emit("hover", { ...options.onScreen(key)!, batch: ONE, source, ...(segment === undefined ? {} : { segment }) });
  }

  function endHover(): void {
    const key = hovered?.key;
    hovered = undefined;
    svg.classList.remove("ec-hovering");
    options.tooltip.hide();
    const mark = key === undefined ? undefined : options.onScreen(key);
    if (key === undefined || !mark) return;
    options.element(key)?.classList.remove("ec-hot");
    runner.leave([key]);
    events.emit("leave", { ...mark, batch: ONE });
  }

  const interaction = pointerHover(svg, {
    find: options.find,
    hover(target: HoverTarget, source) {
      // Already playing for keyboard focus: it goes on.
      if (!options.live(target.key) || hovered?.key === target.key) return;
      endHover();
      startHover(target.key, source, target.segment);
    },
    leave() {
      // Focus holds a keyboard hover until blur or Escape.
      if (hovered?.source !== "keyboard") endHover();
    }
  });

  const keyboard = keyboardFocus(() => svg, {
    find: (eventTarget) => options.find(eventTarget)?.key,
    order: options.order,
    element: options.element,
    focus(key, visible) {
      ringKey = visible ? key : undefined;
      options.ring(ringKey);
      if (!options.live(key)) return;
      if (!visible) {
        // Focus from a click or tap: the pointer's own hover plays.
        if (hovered?.source === "keyboard" && hovered.key !== key) endHover();
        return;
      }
      if (hovered?.key === key) {
        // Already playing for the pointer: it goes on, held by focus now.
        hovered = { key, source: "keyboard" };
        return;
      }
      endHover();
      startHover(key, "keyboard");
    },
    blur() {
      ringKey = undefined;
      options.ring(ringKey);
      if (hovered?.source !== "keyboard") return;
      // The pointer is still over it: the hover goes on, held by the pointer now.
      if (interaction.current === hovered.key) hovered = { key: hovered.key, source: "pointer" };
      else endHover();
    },
    escape() {
      if (!hovered) return false;
      endHover();
      return true;
    }
  });

  return {
    get key() {
      return hovered?.key;
    },
    get ringKey() {
      return ringKey;
    },
    active: () => keyboard.active(),
    restyled(key) {
      if (key === ringKey) options.ring(ringKey);
      if (key === hovered?.key && options.live(key)) options.tooltip.show(key);
    },
    syncDim() {
      if (!options.dim()) svg.classList.remove("ec-hovering");
      else if (hovered !== undefined) svg.classList.add("ec-hovering");
    },
    dropGone() {
      if (hovered === undefined || options.live(hovered.key)) return;
      interaction.clear();
      endHover();
    },
    sync: () => keyboard.sync(),
    destroy() {
      interaction.destroy();
      keyboard.destroy();
    }
  };
}
