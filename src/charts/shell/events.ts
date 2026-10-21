// A chart's mark events: the listeners `on()` adds, and emitting to them. A listener that throws is
// reported, and the others still hear the event.

import { report } from "../../core/report";
import type { Chart, MarkEvents } from "../types";

type Listeners<D> = { [K in keyof MarkEvents<D>]: Set<(event: MarkEvents<D>[K]) => void> };

export interface ChartEvents<D> {
  emit<K extends keyof MarkEvents<D>>(type: K, event: MarkEvents<D>[K]): void;
  /** One event per mark, each given its place in the batch. `read` makes each one as it's emitted. */
  emitEach<K extends keyof MarkEvents<D>, T>(type: K, marks: readonly T[], read: (mark: T) => Omit<MarkEvents<D>[K], "batch">): void;
  /** The chart's `on()`: throws on an event it doesn't have. */
  readonly on: Chart<D, unknown>["on"];
  /** Drops every listener. */
  clear(): void;
}

/** `chart` names the chart in errors. */
export function chartEvents<D>(chart: string): ChartEvents<D> {
  const listeners: Listeners<D> = { enter: new Set(), update: new Set(), exit: new Set(), hover: new Set(), leave: new Set() };

  function emit<K extends keyof MarkEvents<D>>(type: K, event: MarkEvents<D>[K]): void {
    for (const listener of [...listeners[type]]) {
      try {
        listener(event);
      } catch (error) {
        report(error);
      }
    }
  }

  return {
    emit,
    emitEach(type, marks, read) {
      marks.forEach((mark, index) => emit(type, { ...read(mark), batch: { index, count: marks.length } } as MarkEvents<D>[typeof type]));
    },
    on(type, listener) {
      const set = listeners[type] as Set<typeof listener> | undefined;
      if (!set) throw new TypeError(`${chart}: unknown event "${String(type)}". Use one of: ${Object.keys(listeners).join(", ")}.`);
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    clear() {
      for (const set of Object.values(listeners)) set.clear();
    }
  };
}
