// Following the host's own changes (`watch`, M4 decision 14). A MutationObserver notes changes to
// the marks' geometry attributes, and to transform and style on every ancestor from the marks up to
// the root <svg>: a host that animates a parent <g transform> changes none of the marks' own
// attributes. What changed is handed on once a frame, on the chart's clock, however many
// attributes the host wrote in between.
//
// The marks' own style isn't watched: the adapter writes it (effects' transforms, emphasis, hover
// darkening), so it would hear itself.

import type { Clock } from "../../core";

/** Attributes that move or reshape a mark. */
const GEOMETRY = ["d", "x", "y", "width", "height", "cx", "cy", "r", "points", "transform"];
/** Attributes that move everything inside an ancestor. */
const ANCESTOR = ["transform", "style"];

/** What changed since the last frame. */
export interface WatchedChanges {
  /** Mark elements whose geometry attributes changed. */
  readonly marks: ReadonlySet<Element>;
  /** Ancestors of the marks whose transform or style changed. */
  readonly ancestors: ReadonlySet<Element>;
}

export interface HostWatch {
  /**
   * Watches these mark elements, and their ancestors up to `root`, instead of what it watched
   * before. Changes not handed on yet are dropped: the caller has just read everything.
   */
  observe(elements: readonly Element[], root: Element | undefined): void;
  /** Stops watching; nothing more is handed on. */
  destroy(): void;
}

export function watchHost(doc: Document, clock: Clock, onChanges: (changes: WatchedChanges) => void): HostWatch {
  const Observer = doc.defaultView?.MutationObserver ?? (typeof MutationObserver === "undefined" ? undefined : MutationObserver);
  if (!Observer) throw new TypeError("expressive: watch needs MutationObserver, which this DOM doesn't have.");

  let marks = new Set<Element>();
  let ancestors = new Set<Element>();
  /** The elements watched now: the marks', and their ancestors'. */
  let watchedMarks = new Set<Element>();
  let watchedAncestors = new Set<Element>();
  let cancelFrame: (() => void) | undefined;

  const collect = (records: readonly MutationRecord[]): void => {
    for (const { target, attributeName } of records) {
      const element = target as Element;
      if (watchedMarks.has(element)) marks.add(element);
      if (watchedAncestors.has(element) && (attributeName === "transform" || attributeName === "style")) ancestors.add(element);
    }
  };

  const observer = new Observer((records) => {
    collect(records);
    if ((marks.size > 0 || ancestors.size > 0) && !cancelFrame) cancelFrame = clock.onFrame(frame);
  });

  /**
   * Hands on what changed, and stays on the clock until a frame with no changes. A host that draws in
   * its own frame callback asks for its next frame there, and the clock, still on, asks after it at
   * the end of its own, so each of the host's frames is read in the frame it's drawn. Leaving after
   * every frame, the clock would ask again only on hearing the next changes, too late for that frame,
   * and the effects would trail the marks every other frame.
   */
  function frame(): void {
    // Changes the observer hasn't handed over yet, made earlier in this frame.
    collect(observer.takeRecords());
    if (marks.size === 0 && ancestors.size === 0) {
      cancelFrame?.();
      cancelFrame = undefined;
      return;
    }
    const changes: WatchedChanges = { marks, ancestors };
    marks = new Set();
    ancestors = new Set();
    onChanges(changes);
  }

  function drop(): void {
    observer.takeRecords();
    cancelFrame?.();
    cancelFrame = undefined;
    marks = new Set();
    ancestors = new Set();
  }

  return {
    observe(elements, root) {
      drop();
      observer.disconnect();
      watchedMarks = new Set(elements);
      watchedAncestors = new Set();
      for (const element of elements) {
        // Ancestors are shared: stop at one already seen, since everything above it is too.
        for (let node = element.parentElement; node && !watchedAncestors.has(node); node = node === root ? null : node.parentElement) {
          watchedAncestors.add(node);
        }
      }
      // An element that is a mark and also holds marks keeps the mark's list, which has transform but
      // not style: the adapter writes its style.
      for (const element of watchedAncestors) if (!watchedMarks.has(element)) observer.observe(element, { attributes: true, attributeFilter: ANCESTOR });
      for (const element of watchedMarks) observer.observe(element, { attributes: true, attributeFilter: GEOMETRY });
    },

    destroy() {
      drop();
      observer.disconnect();
      watchedMarks = new Set();
      watchedAncestors = new Set();
    }
  };
}
