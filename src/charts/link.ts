// Linked hover (M7 step 4): hovering a mark in one chart or attachment hovers the marks that share its
// linking value in the others, with `source: "linked"`. It isn't an effect, since it hovers other
// marks: it lives with the charts, as hover dimming does. Each chart and attachment registers its hover
// here when it's made, keyed by its handle, so a link can hover given marks without focus. Nothing
// new is public on the handles.

import type { MarkGeometry } from "../core";
import { report } from "../core/report";
import type { RunInput } from "../core/runner";
import type { MarkEvent, MarkEvents } from "./types";

/** What a link takes: a chart (barChart, donutChart, lineChart) or an attachment (expressive, fromVegaView), with rows D. */
export interface LinkSource<D> {
  on(type: "hover", listener: (event: MarkEvents<D>["hover"]) => void): () => void;
  marks(): readonly MarkGeometry[];
}

/** The rows of the sources in S: each chart's and attachment's, as a union. */
type RowsOf<S> = S extends LinkSource<infer D> ? D : never;

export interface LinkOptions<D> {
  /**
   * A mark's linking value, given the mark and its data as a hover event has them. Default: its last
   * sample's `at` if it has one (a line point's x), else its key (a bar's or a slice's category).
   * Values are compared as strings, a Date by its ISO string, as keys are. Undefined or null links
   * nothing, and so does a throw (reported).
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
  /** The live targets, in visual order, each with its marks as on screen: what their linking values are read from. */
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
}

/** What a source tells its link. */
export interface LinkListener {
  /** Its own hover started, from the pointer, touch or the keyboard, on these marks. */
  hover(marks: readonly RunInput[]): void;
  /** Its own hover ended. */
  leave(): void;
  /** Escape, with focus on it while it shows a link's hover: the link's hover ends, where it started. */
  dismiss(): void;
  /** It was destroyed. */
  gone(): void;
}

/** Whether a hover is the source's own, from the pointer, touch or the keyboard: not a link's. */
export const own = <H extends { readonly source: string }>(hovered: H | undefined): hovered is H => hovered !== undefined && hovered.source !== "linked";

const ports = new WeakMap<object, LinkPort>();
/** Ports in a link now: a source can be in one at a time. */
const linked = new WeakSet<LinkPort>();

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
 * Throws a TypeError, linking nothing, on a source that isn't a chart or an attachment, or one that's
 * in a link already. A destroyed source drops out.
 */
export function link<S extends LinkSource<unknown>>(sources: readonly S[], options: LinkOptions<RowsOf<S>> = {}): Link {
  if (!Array.isArray(sources)) throw new TypeError("link needs an array of charts and attachments: link([columns, line]).");
  if (typeof options !== "object" || options === null) throw new TypeError("link: options must be an object, such as { by: (event) => event.data.datum.week }.");
  const { by, effects = true } = options;
  if (by !== undefined && typeof by !== "function") throw new TypeError("link: by must be a function, such as (event) => event.data.datum.week.");
  if (typeof effects !== "boolean") throw new TypeError(`link: effects must be true or false, got ${String(effects)}.`);
  const members: LinkPort[] = [];
  for (const source of sources) {
    const port = typeof source === "object" && source !== null ? ports.get(source) : undefined;
    if (!port) {
      throw new TypeError("link: each source must be a chart (barChart, donutChart or lineChart) or an attachment (expressive or fromVegaView). A chartSwitch can't be linked yet.");
    }
    if (linked.has(port) || members.includes(port)) throw new TypeError("link: a chart or attachment can be in one link at a time. Destroy the link it's in first.");
    members.push(port);
  }

  /** The sources still in the link. */
  const live = new Set<LinkPort>();
  /** The source whose own hover the link shows. */
  let origin: LinkPort | undefined;

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

  function hovered(from: LinkPort, marks: readonly RunInput[]): void {
    origin = from;
    const values = new Set(marks.map(valueOf));
    values.delete(undefined);
    /** Whether a target has a mark with one of the hovered marks' values. */
    const matches = (target: readonly RunInput[]): boolean => target.some((mark) => {
      const value = valueOf(mark);
      return value !== undefined && values.has(value);
    });
    for (const port of live) {
      if (port === from) continue;
      const keys = values.size === 0 ? [] : port.targets().flatMap((target) => (matches(target.marks) ? [target.key] : []));
      port.hover(keys, effects);
      // A listener started another hover meanwhile: that one is shown.
      if (origin !== from) return;
    }
  }

  function left(from: LinkPort): void {
    if (origin !== from) return;
    origin = undefined;
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
      gone() {
        live.delete(port);
        linked.delete(port);
        left(port);
      }
    });
    if (!listening) continue;
    live.add(port);
    linked.add(port);
  }

  return {
    destroy() {
      for (const port of live) {
        port.listen(undefined);
        port.unlink();
        linked.delete(port);
      }
      live.clear();
      origin = undefined;
    }
  };
}
