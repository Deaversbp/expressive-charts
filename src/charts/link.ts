// Linked hover (M7 step 4): hovering a mark in one chart or attachment hovers the marks that share its
// linking value in the others, with `source: "linked"`. It isn't an effect, since it hovers other
// marks: it lives with the charts, as hover dimming does. Each chart and attachment registers its hover
// here when it's made, keyed by its handle, so a link can hover given marks without focus. A chart
// switch (M9 step 2) registers one made of its views' charts' hovers: the view on show's, while it
// rests. Nothing link-specific is public on the handles.

import type { MarkGeometry } from "../core";
import { report } from "../core/report";
import type { RunInput } from "../core/runner";
import type { MarkEvent, MarkEvents } from "./types";

/** What a link takes: a chart (barChart, donutChart, lineChart), a chartSwitch or an attachment (expressive, fromVegaView), with rows D. */
export interface LinkSource<D> {
  on(type: "hover", listener: (event: MarkEvents<D>["hover"]) => void): () => void;
  marks(): readonly MarkGeometry[];
}

/** The rows of the sources in S: each chart's, switch's and attachment's, as a union. */
export type RowsOf<S> = S extends LinkSource<infer D> ? D : never;

export interface LinkOptions<D> {
  /**
   * A mark's linking value, given the mark and its data as a hover event has them. Default: its last
   * sample's `at` if it has one (a line point's x), else its key (a bar's or a slice's category).
   * Values are compared as strings, a Date by its ISO string, as keys are. Undefined or null links
   * nothing, and so does a throw (reported). A line chart's x with every value missing has no point,
   * so it's given a stand-in for one, keyed by the x, with the row and a sample at the x, whose value
   * is NaN.
   */
  readonly by?: (event: Pick<MarkEvent<D>, "mark" | "data">) => unknown;
  /** Whether linked marks play their chart's hover effect. Default true; false keeps them to emphasis and dimming. */
  readonly effects?: boolean;
}

export interface Link {
  /** Ends the link: linked hovers end, and each source can be linked again. The sources' own hovers go on. */
  destroy(): void;
}

/** A source's hover as a link drives it: what chartHover and expressive() register for their handle. */
export interface LinkPort {
  /**
   * The live targets, in visual order, each with its marks as on screen, or a stand-in for one with
   * none (a line chart's x with every value missing): what their linking values are read from.
   */
  targets(): readonly { readonly key: string; readonly marks: readonly RunInput[] }[];
  /**
   * Ends the hover there was, then hovers the live targets `keys` for a link: their marks' emphasis,
   * the others' dimming and, with `effects`, their hover effects, with "linked" events. No tooltip,
   * focus ring or focus, and nothing is announced. With no keys it only ends the hover.
   */
  hover(keys: readonly string[], effects: boolean): void;
  /** Ends a link's hover. The source's own goes on. */
  unlink(): void;
  /** Ends the hover, its own or a link's, as the source's leave() does. */
  leave(): void;
  /** Sets the link that hears its own hovers, or none. False, setting nothing, once the source is destroyed. */
  listen(listener: LinkListener | undefined): boolean;
  /** The hovers it drives, a chart switch's views' charts': while it's in a link, none of them can be in another. */
  readonly parts?: readonly LinkPort[];
}

/** What a source tells its link. */
export interface LinkListener {
  /** Its own hover started, from the pointer, touch or the keyboard, on these marks, or on a target's stand-in where it has none. */
  hover(marks: readonly RunInput[]): void;
  /** Its own hover ended. */
  leave(): void;
  /** Escape, with focus on it while it shows a link's hover: the link's hover ends, where it started. */
  dismiss(): void;
  /** Its marks can be reached again, in other targets (a chart switch landed): the link's hover from another source, if there is one, shows in them. */
  shown(): void;
  /** It was destroyed. */
  gone(): void;
}

/** Whether a hover is the source's own, from the pointer, touch or the keyboard: not a link's. */
export const own = <H extends { readonly source: string }>(hovered: H | undefined): hovered is H => hovered !== undefined && hovered.source !== "linked";

const ports = new WeakMap<object, LinkPort>();
/** Ports in a link now, with their parts: a source can be in one at a time. */
const linked = new WeakSet<LinkPort>();

/** A port and the ports it drives, which go into a link with it. */
const partsOf = (port: LinkPort): readonly LinkPort[] => (port.parts ? [port, ...port.parts] : [port]);

/** Registers a chart's or attachment's hover for its handle, and returns the handle. */
export function linkable<T extends object>(port: LinkPort, handle: T): T {
  ports.set(handle, port);
  return handle;
}

/** The hover registered for a handle: for a handle that wraps another, as fromVegaView's wraps expressive()'s. */
export const portOf = (handle: object): LinkPort | undefined => ports.get(handle);

/**
 * Links hover across `sources`: when one is hovered by the pointer, touch or the keyboard, every other
 * hovers its targets with that linking value (a line chart its x, a bar chart its bar), as `source:
 * "linked"`, and leaves them when it leaves. The newest hover anywhere in the link is the one shown.
 * A chart switch takes part through its view on show. Throws a TypeError, linking nothing, on a source
 * that isn't a chart, a chart switch or an attachment, or one that's in a link already, a switch's
 * views' charts going with it. A destroyed source drops out.
 */
export function link<S extends LinkSource<unknown>>(sources: readonly S[], options: LinkOptions<RowsOf<S>> = {}): Link {
  if (!Array.isArray(sources)) throw new TypeError("link needs an array of charts, chart switches and attachments: link([columns, line]).");
  if (typeof options !== "object" || options === null) throw new TypeError("link: options must be an object, such as { by: (event) => event.data.datum.week }.");
  const { by, effects = true } = options;
  if (by !== undefined && typeof by !== "function") throw new TypeError("link: by must be a function, such as (event) => event.data.datum.week.");
  if (typeof effects !== "boolean") throw new TypeError(`link: effects must be true or false, got ${String(effects)}.`);
  const members: LinkPort[] = [];
  const taken = new Set<LinkPort>();
  for (const source of sources) {
    const port = typeof source === "object" && source !== null ? ports.get(source) : undefined;
    if (!port) {
      throw new TypeError("link: each source must be a chart (barChart, donutChart or lineChart), a chartSwitch or an attachment (expressive or fromVegaView).");
    }
    const parts = partsOf(port);
    if (parts.some((part) => linked.has(part) || taken.has(part))) {
      throw new TypeError("link: a chart, chart switch or attachment can be in one link at a time, and a chart switch's views' charts go with it. Destroy the link it's in first.");
    }
    for (const part of parts) taken.add(part);
    members.push(port);
  }

  /** The sources still in the link. */
  const live = new Set<LinkPort>();
  /** The source whose own hover the link shows. */
  let origin: LinkPort | undefined;
  /** The linking values of its hovered marks. */
  let values: ReadonlySet<string | undefined> = new Set();

  /** A mark's linking value as a string, or undefined for none. */
  function valueOf(input: RunInput): string | undefined {
    let value: unknown;
    if (by) {
      try {
        value = by(input as RunInput<RowsOf<S>>);
      } catch (error) {
        report(error);
        return undefined;
      }
    } else {
      const { samples } = input.data;
      value = samples[samples.length - 1]?.at ?? input.mark.key;
    }
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
    return value === undefined || value === null ? undefined : String(value);
  }

  /** The keys of the port's targets that have a mark with one of `shown`'s values. */
  function keysIn(port: LinkPort, shown: ReadonlySet<string | undefined>): string[] {
    if (shown.size === 0) return [];
    /** Whether a target has a mark with one of the hovered marks' values. */
    const matches = (target: readonly RunInput[]): boolean => target.some((mark) => {
      const value = valueOf(mark);
      return value !== undefined && shown.has(value);
    });
    return port.targets().flatMap((target) => (matches(target.marks) ? [target.key] : []));
  }

  function hovered(from: LinkPort, marks: readonly RunInput[]): void {
    origin = from;
    const shown = new Set(marks.map(valueOf));
    shown.delete(undefined);
    values = shown;
    for (const port of live) {
      if (port === from) continue;
      port.hover(keysIn(port, shown), effects);
      // A listener started another hover meanwhile: that one is shown.
      if (origin !== from) return;
    }
  }

  function left(from: LinkPort): void {
    if (origin !== from) return;
    origin = undefined;
    values = new Set();
    for (const port of live) port.unlink();
  }

  for (const port of members) {
    const listening = port.listen({
      hover: (marks) => hovered(port, marks),
      leave: () => left(port),
      dismiss() {
        const from = origin;
        from?.leave();
        if (from) left(from);
      },
      shown() {
        if (origin !== undefined && origin !== port && live.has(port)) port.hover(keysIn(port, values), effects);
      },
      gone() {
        live.delete(port);
        for (const part of partsOf(port)) linked.delete(part);
        left(port);
      }
    });
    if (!listening) continue;
    live.add(port);
    for (const part of partsOf(port)) linked.add(part);
  }

  return {
    destroy() {
      for (const port of live) {
        port.listen(undefined);
        port.unlink();
        for (const part of partsOf(port)) linked.delete(part);
      }
      live.clear();
      origin = undefined;
      values = new Set();
    }
  };
}
