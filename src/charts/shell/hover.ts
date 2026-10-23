// Hover for a reference chart's marks. Pointer, touch and keyboard focus share one hover: the marks'
// emphasis (`ec-hot`), the others' dimming (`ec-hovering` on the <svg>), the tooltip, the runner's
// hover and leave, and the events. Focus from a key press, or from the chart's focus(key), shows the
// focus ring and plays the hover; focus from a click or tap moves the tab stop but leaves the hover to
// the pointer.
//
// What's hovered is a target: what the pointer is over and what takes focus. A target stands for one
// mark or several, hovered together in one batch: a bar or a slice is its own mark, while a line
// chart's x stands for every series' point there. The keyboard moves between targets.
//
// The chart says which targets and marks there are and draws them: it finds a live target from an
// event target, gives a target's marks, their elements and how they are on screen, draws the ring
// and shows the tooltip.

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
  /** The live target an event target belongs to, with the segment under the pointer; leaving ones don't count. */
  find(target: EventTarget | null): HoverTarget | undefined;
  /** Whether the target `key` is live: on screen and not leaving. */
  live(key: string): boolean;
  /** The live targets' keys, in visual order: the keyboard's order. */
  order(): readonly string[];
  /**
   * The keys of the marks a live target stands for, in the batch's order: a line chart's x gives each
   * series' point there. Default: the target alone, as a bar or a slice is its own mark.
   */
  marks?(key: string): readonly string[];
  /** A target's element, live or leaving: it takes focus and, for a target that is its own mark, the hover's emphasis. */
  element(key: string): SVGElement | undefined;
  /** A mark's element, live or leaving: it takes the hover's emphasis (`ec-hot`). Default: `element`, for targets that are their own marks. */
  markElement?(key: string): SVGElement | undefined;
  /** A mark as it is on screen, live or leaving: what hover and leave report, so mid-change they match what's under the pointer. */
  onScreen(key: string): RunInput<D> | undefined;
  /** Draws the focus ring around the live target `key` as it is on screen, or hides it. */
  ring(key: string | undefined): void;
  readonly tooltip: {
    /** Shows the tooltip for the live target `key` as it is on screen, or moves it there. */
    show(key: string): void;
    hide(): void;
  };
}

export interface ChartHover {
  /** The hovered target's key. */
  readonly key: string | undefined;
  /** The target showing the focus ring: focused from the keyboard. */
  readonly ringKey: string | undefined;
  /** The element with focus in the chart's document or shadow root. */
  active(): Element | null;
  /** An effect restyled a mark: the focus ring and the tooltip of the target it belongs to follow its transform. */
  restyled(key: string): void;
  /** After `dim` changed: the others dim, or stop dimming, now. */
  syncDim(): void;
  /**
   * After the marks changed: ends the hover if its target has left. Otherwise the hover follows the
   * marks the target stands for now: those it no longer has are left, and new ones are hovered, their
   * events placed in the target's whole batch, as the runner's runs are.
   */
  dropGone(): void;
  /** After the marks changed: the tab stop stays on its key, or moves to its nearest neighbour, and focus follows. */
  sync(): void;
  /** Moves focus to the live target `key` as a key press would: the ring shows and its hover plays. Does nothing for a key that isn't live. */
  focus(key: string): void;
  /**
   * Ends the hover, the pointer's or focus's, as the viewer moving away would: the emphasis, the
   * dimming, the tooltip and the hover runs end, with their leave events. Focus stays where it is,
   * with its ring, as after Escape; the pointer hovers again when it next moves onto a mark.
   */
  leave(): void;
  destroy(): void;
}

interface Hovered {
  /** The target's key. */
  readonly key: string;
  readonly source: HoverSource;
  /** The marks hovered for it, in the batch's order. */
  readonly marks: readonly string[];
}

export function chartHover<D>(options: ChartHoverOptions<D>): ChartHover {
  const { svg, runner, events } = options;
  const marksOf = (key: string): readonly string[] => options.marks?.(key) ?? [key];
  const markElement = (key: string): SVGElement | undefined => (options.markElement ?? options.element)(key);
  let hovered: Hovered | undefined;
  let ringKey: string | undefined;

  /** The marks among `keys` that are on screen, with how they are there. */
  const onScreen = (keys: readonly string[]): { readonly key: string; readonly input: RunInput<D> }[] =>
    keys.flatMap((key) => {
      const input = options.onScreen(key);
      return input ? [{ key, input }] : [];
    });

  /** The marks' hover runs, in one batch, and an event for each with its place in it. */
  function hoverMarks(marks: ReturnType<typeof onScreen>, source: HoverSource, segment?: string): void {
    if (marks.length === 0) return;
    runner.hover(marks.map(({ input }) => input));
    const count = marks.length;
    marks.forEach(({ input }, index) => events.emit("hover", { ...input, batch: { index, count }, source, ...(segment === undefined ? {} : { segment }) }));
  }

  /** The marks lose their emphasis, their hover runs end in one batch, and each gets a leave event. */
  function leaveMarks(keys: readonly string[]): void {
    const marks = onScreen(keys);
    if (marks.length === 0) return;
    for (const { key } of marks) markElement(key)?.classList.remove("ec-hot");
    runner.leave(marks.map(({ key }) => key));
    const count = marks.length;
    marks.forEach(({ input }, index) => events.emit("leave", { ...input, batch: { index, count } }));
  }

  /** Pointer and keyboard hover share this: the marks' emphasis, the others' dimming, the tooltip, the hover runs and the events. */
  function startHover(key: string, source: HoverSource, segment?: string): void {
    const marks = onScreen(marksOf(key));
    hovered = { key, source, marks: marks.map((mark) => mark.key) };
    for (const { key: mark } of marks) markElement(mark)?.classList.add("ec-hot");
    if (options.dim()) svg.classList.add("ec-hovering");
    options.tooltip.show(key);
    hoverMarks(marks, source, segment);
  }

  function endHover(): void {
    const marks = hovered?.marks ?? [];
    hovered = undefined;
    svg.classList.remove("ec-hovering");
    options.tooltip.hide();
    leaveMarks(marks);
  }

  /** Whether the mark `key` is, or belongs to, the target `target`. */
  const within = (target: string, key: string): boolean => key === target || (options.live(target) && marksOf(target).includes(key));

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
        hovered = { ...hovered, source: "keyboard" };
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
      if (interaction.current === hovered.key) hovered = { ...hovered, source: "pointer" };
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
      if (ringKey !== undefined && within(ringKey, key)) options.ring(ringKey);
      if (hovered !== undefined && (hovered.marks.includes(key) || key === hovered.key) && options.live(hovered.key)) options.tooltip.show(hovered.key);
    },
    syncDim() {
      if (!options.dim()) svg.classList.remove("ec-hovering");
      else if (hovered !== undefined) svg.classList.add("ec-hovering");
    },
    dropGone() {
      if (hovered === undefined) return;
      if (!options.live(hovered.key)) {
        interaction.clear();
        endHover();
        return;
      }
      const { source, marks: before } = hovered;
      const now = onScreen(marksOf(hovered.key));
      if (now.length === before.length && now.every((mark, i) => mark.key === before[i])) return;
      const had = new Set(before);
      const keys = new Set(now.map((mark) => mark.key));
      const gone = onScreen(before.filter((key) => !keys.has(key)));
      hovered = { ...hovered, marks: now.map((mark) => mark.key) };
      for (const { key } of gone) markElement(key)?.classList.remove("ec-hot");
      for (const { key } of now) if (!had.has(key)) markElement(key)?.classList.add("ec-hot");
      // The runner hears the target's whole new batch, in order. Mid-change (playUpdate interrupts
      // first), it holds hovers and replays every hovered mark as one batch when the change settles, so
      // a joined mark's run gets the place its event gives; at rest, the marks that stayed start again
      // with their new places.
      runner.leave(before);
      runner.hover(now.map(({ input }) => input));
      gone.forEach(({ input }, index) => events.emit("leave", { ...input, batch: { index, count: gone.length } }));
      const count = now.length;
      now.forEach(({ key, input }, index) => {
        if (!had.has(key)) events.emit("hover", { ...input, batch: { index, count }, source });
      });
    },
    sync: () => keyboard.sync(),
    focus(key) {
      if (options.live(key)) keyboard.focus(key);
    },
    leave() {
      // The pointer lets go first, so it hovers again when it next moves onto a mark.
      interaction.clear();
      if (hovered !== undefined) endHover();
    },
    destroy() {
      interaction.destroy();
      keyboard.destroy();
    }
  };
}
