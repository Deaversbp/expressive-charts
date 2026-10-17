// In-memory versions of the drawing API, so effects can be tested with no DOM at all.

import type { IconHandle, Layer, MarkHandle, MarkStyle, Matrix, Paint, PathHandle, TextHandle, TextStyle } from "../contracts/drawing";
import type { Icon } from "../contracts/icon";

export interface DrawnIcon {
  readonly kind: "icon";
  readonly id: number;
  readonly icon: Icon;
  readonly size: number | undefined;
  /** Undefined until first placed, while the icon is hidden. */
  readonly transform: Matrix | undefined;
}

export interface DrawnPath {
  readonly kind: "path";
  readonly id: number;
  readonly d: string;
  readonly paint: Paint;
}

export interface DrawnText {
  readonly kind: "text";
  readonly id: number;
  readonly content: string;
  readonly style: TextStyle;
}

export type Drawn = DrawnIcon | DrawnPath | DrawnText;

/** Every call made on a layer or its handles, in order. Calls on removed handles are logged and ignored. */
export type LayerCall =
  | { readonly op: "icon"; readonly id: number; readonly icon: string; readonly size: number | undefined }
  | { readonly op: "place"; readonly id: number; readonly transform: Matrix }
  | { readonly op: "path"; readonly id: number; readonly d: string; readonly paint: Paint }
  | { readonly op: "update-path"; readonly id: number; readonly d: string; readonly paint: Partial<Paint> | undefined }
  | { readonly op: "text"; readonly id: number; readonly content: string; readonly style: TextStyle }
  | { readonly op: "update-text"; readonly id: number; readonly style: Partial<TextStyle>; readonly content: string | undefined }
  | { readonly op: "remove"; readonly id: number }
  | { readonly op: "clear" };

/** What's on screen, without ids and with numbers rounded, so a full run can be compared with end(). */
export type Picture =
  | { readonly kind: "icon"; readonly icon: string; readonly size: number | undefined; readonly transform: readonly number[] | undefined }
  | { readonly kind: "path"; readonly d: string; readonly paint: Paint }
  | { readonly kind: "text"; readonly content: string; readonly style: TextStyle };

export interface RecordingLayer extends Layer {
  /** What's drawn now, in creation order (which is also stacking order). */
  readonly drawn: readonly Drawn[];
  readonly calls: readonly LayerCall[];
  /** `drawn` as plain data, numbers rounded to `decimals` (default 3). */
  picture(decimals?: number): Picture[];
  /** Remove everything, as the runner does when a run is cleared. */
  clear(): void;
}

export function recordingLayer(): RecordingLayer {
  const drawn = new Map<number, Drawn>();
  const calls: LayerCall[] = [];
  let nextId = 1;

  // Replaces a live item; calls on removed handles change nothing.
  const replace = (id: number, next: (current: Drawn) => Drawn): void => {
    const current = drawn.get(id);
    if (current) drawn.set(id, next(current));
  };
  const remove = (id: number): void => {
    calls.push({ op: "remove", id });
    drawn.delete(id);
  };

  return {
    get drawn() {
      return [...drawn.values()];
    },
    get calls() {
      return calls;
    },
    icon(icon, options) {
      const id = nextId++;
      const size = options?.size;
      calls.push({ op: "icon", id, icon: icon.name, size });
      drawn.set(id, { kind: "icon", id, icon, size, transform: undefined });
      const handle: IconHandle = {
        place(transform) {
          calls.push({ op: "place", id, transform });
          replace(id, (current) => ({ ...current, transform }) as DrawnIcon);
        },
        remove: () => remove(id)
      };
      return handle;
    },
    path(d, paint) {
      const id = nextId++;
      calls.push({ op: "path", id, d, paint });
      drawn.set(id, { kind: "path", id, d, paint: { ...paint } });
      const handle: PathHandle = {
        update(nextD, nextPaint) {
          calls.push({ op: "update-path", id, d: nextD, paint: nextPaint });
          replace(id, (current) => {
            const path = current as DrawnPath;
            return { ...path, d: nextD, paint: merge(path.paint, nextPaint) };
          });
        },
        remove: () => remove(id)
      };
      return handle;
    },
    text(content, style) {
      const id = nextId++;
      calls.push({ op: "text", id, content, style });
      drawn.set(id, { kind: "text", id, content, style: { ...style } });
      const handle: TextHandle = {
        update(nextStyle, nextContent) {
          calls.push({ op: "update-text", id, style: nextStyle, content: nextContent });
          replace(id, (current) => {
            const text = current as DrawnText;
            return { ...text, style: merge(text.style, nextStyle), content: nextContent ?? text.content };
          });
        },
        remove: () => remove(id)
      };
      return handle;
    },
    picture(decimals = 3) {
      const round = rounder(decimals);
      return [...drawn.values()].map((item): Picture => {
        switch (item.kind) {
          case "icon":
            return { kind: "icon", icon: item.icon.name, size: item.size, transform: item.transform?.map(round) };
          case "path":
            return { kind: "path", d: item.d, paint: roundFields(item.paint, round) };
          case "text":
            return { kind: "text", content: item.content, style: { ...roundFields(item.style, round), at: { x: round(item.style.at.x), y: round(item.style.at.y) } } };
        }
      });
    },
    clear() {
      calls.push({ op: "clear" });
      drawn.clear();
    }
  };
}

export type MarkCall = { readonly op: "set"; readonly style: MarkStyle } | { readonly op: "reset" };

export interface RecordingMark extends MarkHandle {
  /** The style now, after every set() and reset(). Empty means the mark's own style. */
  readonly style: MarkStyle;
  readonly calls: readonly MarkCall[];
}

export function recordingMark(): RecordingMark {
  let style: MarkStyle = {};
  const calls: MarkCall[] = [];
  return {
    get style() {
      return style;
    },
    get calls() {
      return calls;
    },
    set(next) {
      calls.push({ op: "set", style: next });
      style = merge(style, next);
    },
    reset() {
      calls.push({ op: "reset" });
      style = {};
    }
  };
}

/** Fields given replace the current ones; a field given as undefined is removed. */
function merge<T extends object>(current: T, next: Partial<T> | undefined): T {
  const result: Record<string, unknown> = { ...(current as Record<string, unknown>) };
  for (const [field, value] of Object.entries(next ?? {})) {
    if (value === undefined) delete result[field];
    else result[field] = value;
  }
  return result as T;
}

function rounder(decimals: number): (value: number) => number {
  const factor = 10 ** decimals;
  return (value) => {
    const rounded = Math.round(value * factor) / factor;
    return rounded === 0 ? 0 : rounded;
  };
}

function roundFields<T extends object>(fields: T, round: (value: number) => number): T {
  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(fields)) result[field] = typeof value === "number" ? round(value) : value;
  return result as T;
}
