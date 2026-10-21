// Marks on their way out. A leaving mark stays, unhoverable and no longer read, until it has faded out
// and its exit effects are done; one that comes back meanwhile keeps its element and grows back from
// where it is.

/** One departure: a fresh one each time, so a mark that comes back and leaves again starts over. */
export interface Leave {
  /** Its exit effects are done. */
  exited: boolean;
  /** Resolves when its element is removed, or the mark comes back. */
  readonly gone: Promise<void>;
  readonly resolve: () => void;
}

/** What a chart's mark record needs for leaving. */
export interface LeavingMark {
  readonly key: string;
  /** The mark's element: hidden from screen readers while it leaves, and removed once it's gone. */
  readonly group: SVGElement;
  /** Set while the mark leaves. */
  leave: Leave | undefined;
}

export interface LeavingMarks<R extends LeavingMark> {
  get(key: string): R | undefined;
  /** In the order they started leaving. */
  values(): Iterable<R>;
  /** Starts a mark leaving, once the chart has taken it out of its live marks. */
  start(record: R): void;
  /** Brings back the mark leaving under `key`, if there is one: it keeps its element, and the runner cancels its exit. */
  recall(key: string): R | undefined;
  /** Removes the marks whose exit effects are done and which have stopped `fading`. */
  sweep(): void;
  clear(): void;
}

/** `fading(record)`: the mark is still animating its way out. */
export function leavingMarks<R extends LeavingMark>(fading: (record: R) => boolean): LeavingMarks<R> {
  const marks = new Map<string, R>();
  return {
    get: (key) => marks.get(key),
    values: () => marks.values(),
    start(record) {
      marks.set(record.key, record);
      record.group.classList.add("ec-leaving");
      // On its way out: no longer read.
      record.group.setAttribute("aria-hidden", "true");
      record.leave = leave();
    },
    recall(key) {
      const record = marks.get(key);
      if (!record) return undefined;
      marks.delete(key);
      record.group.classList.remove("ec-leaving");
      record.group.removeAttribute("aria-hidden");
      record.leave?.resolve();
      record.leave = undefined;
      return record;
    },
    sweep() {
      for (const record of [...marks.values()]) {
        const { leave } = record;
        if (!leave?.exited || fading(record)) continue;
        marks.delete(record.key);
        record.leave = undefined;
        record.group.remove();
        leave.resolve();
      }
    },
    clear: () => marks.clear()
  };
}

function leave(): Leave {
  let resolve!: () => void;
  const gone = new Promise<void>((r) => {
    resolve = r;
  });
  return { exited: false, gone, resolve };
}
