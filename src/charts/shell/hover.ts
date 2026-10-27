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
// and shows the tooltip. The pointer on the tooltip stays on the hovered target (../interaction.ts).
//
// A link (../link.ts) hovers targets too, as "linked": their marks' emphasis, the dimming and their
// hover runs, with no tooltip, ring or focus. It hears the chart's own hovers, and Escape on a linked
// hover ends the link's, where it started.

import type { RunInput, Runner } from "../../core/runner";
import { pointerHover, type HoverTarget } from "../interaction";
import { keyboardFocus } from "../keyboard";
import { own, type LinkListener, type LinkPort } from "../link";
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
  /** Where Page Down (`by` 1) or Page Up (-1) goes from the target `key`. Default, or undefined: a tenth of the targets on or back (../keyboard.ts). */
  page?(key: string, by: 1 | -1): string | undefined;
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
    /** The tooltip's element while it shows: the pointer on it stays on the hovered target. */
    element?(): HTMLElement | undefined;
  };
}

export interface ChartHover {
  /** The hovered target's key, when the hover is the chart's own: a link's shows no tooltip. */
  readonly key: string | undefined;
  /** The target showing the focus ring: focused from the keyboard. */
  readonly ringKey: string | undefined;
  /** The chart's hover as a link drives it, for the chart to register with its handle. */
  readonly link: LinkPort;
  /** The element with focus in the chart's document or shadow root. */
  active(): Element | null;
  /** An effect restyled a mark: the focus ring and the tooltip of the target it belongs to follow its transform. */
  restyled(key: string): void;
  /** After `dim` changed: the others dim, or stop dimming, now. */
  syncDim(): void;
  /**
   * After the marks changed: ends the hover if its targets have left. Otherwise the hover follows the
   * marks its targets stand for now: those it no longer has are left, and new ones are hovered, their
   * events placed in the whole batch, as the runner's runs are.
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
  /** The targets' keys: one for the chart's own hover, any number for a link's. */
  readonly keys: readonly string[];
  readonly source: HoverSource;
  /** The marks hovered for them, in the batch's order. */
  readonly marks: readonly string[];
  /** Whether their hover runs play: a link with `effects: false` keeps its marks to emphasis and dimming. */
  readonly effects: boolean;
}

export function chartHover<D>(options: ChartHoverOptions<D>): ChartHover {
  const { svg, runner, events } = options;
  const marksOf = (key: string): readonly string[] => options.marks?.(key) ?? [key];
  const markElement = (key: string): SVGElement | undefined => (options.markElement ?? options.element)(key);
  let hovered: Hovered | undefined;
  let ringKey: string | undefined;
  /** The link the chart is in, which hears its own hovers. */
  let linked: LinkListener | undefined;
  let destroyed = false;

  /** The marks among `keys` that are on screen, with how they are there. */
  const onScreen = (keys: readonly string[]): { readonly key: string; readonly input: RunInput<D> }[] =>
    keys.flatMap((key) => {
      const input = options.onScreen(key);
      return input ? [{ key, input }] : [];
    });
  /** The marks the targets `keys` stand for, each once. */
  const marksFor = (keys: readonly string[]): readonly string[] => (keys.length === 1 ? marksOf(keys[0]!) : [...new Set(keys.flatMap(marksOf))]);

  /** The marks' hover runs, in one batch, and an event for each with its place in it. */
  function hoverMarks(marks: ReturnType<typeof onScreen>, source: HoverSource, effects: boolean, segment?: string): void {
    if (marks.length === 0) return;
    if (effects) runner.hover(marks.map(({ input }) => input));
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

  /**
   * Pointer, keyboard and link hover share this: the marks' emphasis, the others' dimming, the hover
   * runs and the events. The chart's own adds the tooltip and Escape, and tells its link.
   */
  function startHover(keys: readonly string[], source: HoverSource, segment?: string, effects = true): void {
    const marks = onScreen(marksFor(keys));
    const started: Hovered = { keys, source, marks: marks.map((mark) => mark.key), effects };
    hovered = started;
    for (const { key: mark } of marks) markElement(mark)?.classList.add("ec-hot");
    if (options.dim()) svg.classList.add("ec-hovering");
    if (source !== "linked") {
      options.tooltip.show(keys[0]!);
      listenForEscape(true);
    }
    hoverMarks(marks, source, effects, segment);
    // A listener may have ended it (leave()) or started another, which told the link itself.
    if (source !== "linked" && hovered === started) linked?.hover(marks.map(({ input }) => input));
  }

  function endHover(): void {
    const ended = hovered;
    hovered = undefined;
    listenForEscape(false);
    svg.classList.remove("ec-hovering");
    options.tooltip.hide();
    leaveMarks(ended?.marks ?? []);
    if (own(ended)) linked?.leave();
  }

  /** The document listening for Escape while something is hovered. */
  let escapeDoc: Document | undefined;
  /**
   * Escape anywhere ends the hover, the pointer's too, as leave() does: its tooltip covers other marks,
   * so it can be dismissed without moving the pointer (WCAG 1.4.13). With focus on a mark, the
   * keyboard's own Escape has ended it first.
   */
  const dismiss = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !event.defaultPrevented && hovered !== undefined) leave();
  };
  function listenForEscape(on: boolean): void {
    escapeDoc?.removeEventListener("keydown", dismiss);
    escapeDoc = on ? svg.ownerDocument : undefined;
    escapeDoc?.addEventListener("keydown", dismiss);
  }

  function leave(): void {
    // The pointer lets go first, so it hovers again when it next moves onto a mark.
    interaction.clear();
    if (hovered !== undefined) endHover();
  }

  /** Whether the mark `key` is, or belongs to, the target `target`. */
  const within = (target: string, key: string): boolean => key === target || (options.live(target) && marksOf(target).includes(key));

  const interaction = pointerHover(svg, {
    find: options.find,
    hover(target: HoverTarget, source) {
      // Already playing for keyboard focus: it goes on.
      if (!options.live(target.key) || (own(hovered) && hovered.keys[0] === target.key)) return;
      endHover();
      startHover([target.key], source, target.segment);
    },
    leave() {
      // Focus holds a keyboard hover until blur or Escape, and a link holds its own.
      if (hovered?.source === "pointer" || hovered?.source === "touch") endHover();
    },
    // The pointer can move onto the tooltip of the chart's own hover. A link's has none.
    tooltip: () => (own(hovered) ? { key: hovered.keys[0]!, element: options.tooltip.element?.() } : undefined)
  });

  const keyboard = keyboardFocus(() => svg, {
    find: (eventTarget) => options.find(eventTarget)?.key,
    order: options.order,
    page: (key, by) => options.page?.(key, by),
    element: options.element,
    focus(key, visible) {
      ringKey = visible ? key : undefined;
      options.ring(ringKey);
      if (!options.live(key)) return;
      if (!visible) {
        // Focus from a click or tap: the pointer's own hover plays.
        if (hovered?.source === "keyboard" && hovered.keys[0] !== key) endHover();
        return;
      }
      if (own(hovered) && hovered.keys[0] === key) {
        // Already playing for the pointer: it goes on, held by focus now.
        hovered = { ...hovered, source: "keyboard" };
        return;
      }
      endHover();
      startHover([key], "keyboard");
    },
    blur() {
      ringKey = undefined;
      options.ring(ringKey);
      if (hovered?.source !== "keyboard") return;
      // The pointer is still over it: the hover goes on, held by the pointer now.
      if (interaction.current === hovered.keys[0]) hovered = { ...hovered, source: "pointer" };
      else endHover();
    },
    escape() {
      if (!hovered) return false;
      // A link's hover ends where it started, and with it every chart's in the link.
      if (hovered.source === "linked" && linked) linked.dismiss();
      else endHover();
      return true;
    }
  });

  const link: LinkPort = {
    targets: () => options.order().map((key) => ({ key, marks: onScreen(marksOf(key)).map(({ input }) => input) })),
    hover(keys, effects) {
      if (hovered !== undefined) endHover();
      const live = keys.filter(options.live);
      if (live.length > 0) startHover(live, "linked", undefined, effects);
    },
    unlink() {
      if (hovered?.source === "linked") endHover();
    },
    leave,
    listen(listener) {
      if (destroyed) return false;
      linked = listener;
      return true;
    }
  };

  return {
    get key() {
      return own(hovered) ? hovered.keys[0] : undefined;
    },
    get ringKey() {
      return ringKey;
    },
    link,
    active: () => keyboard.active(),
    restyled(key) {
      if (ringKey !== undefined && within(ringKey, key)) options.ring(ringKey);
      // A link's hover has no tooltip.
      const target = own(hovered) ? hovered.keys[0]! : undefined;
      if (target !== undefined && (hovered?.marks.includes(key) || key === target) && options.live(target)) options.tooltip.show(target);
    },
    syncDim() {
      if (!options.dim()) svg.classList.remove("ec-hovering");
      else if (hovered !== undefined) svg.classList.add("ec-hovering");
    },
    dropGone() {
      if (hovered === undefined) return;
      const keys = hovered.keys.filter(options.live);
      if (keys.length === 0) {
        interaction.clear();
        endHover();
        return;
      }
      const { source, marks: before, effects } = hovered;
      const now = onScreen(marksFor(keys));
      hovered = { ...hovered, keys };
      if (now.length === before.length && now.every((mark, i) => mark.key === before[i])) return;
      const had = new Set(before);
      const kept = new Set(now.map((mark) => mark.key));
      const gone = onScreen(before.filter((key) => !kept.has(key)));
      hovered = { ...hovered, marks: now.map((mark) => mark.key) };
      for (const { key } of gone) markElement(key)?.classList.remove("ec-hot");
      for (const { key } of now) if (!had.has(key)) markElement(key)?.classList.add("ec-hot");
      // The runner hears the targets' whole new batch, in order. Mid-change (playUpdate interrupts
      // first), it holds hovers and replays every hovered mark as one batch when the change settles, so
      // a joined mark's run gets the place its event gives; at rest, the marks that stayed start again
      // with their new places.
      runner.leave(before);
      if (effects) runner.hover(now.map(({ input }) => input));
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
    leave,
    destroy() {
      destroyed = true;
      linked?.gone();
      linked = undefined;
      listenForEscape(false);
      interaction.destroy();
      keyboard.destroy();
    }
  };
}
