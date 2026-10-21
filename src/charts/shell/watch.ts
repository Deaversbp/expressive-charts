// What a chart follows on the page besides its options: its container's width, web fonts arriving,
// and the motion that times its CSS hover transitions. Each returns its stop.

import type { Clock } from "../../core";
import type { ChartMotion } from "../motion";

/**
 * Follows the container's width with a ResizeObserver, from `width`, the one laid out at. `resize`
 * hears of a change of half a px or more, at most once a frame.
 */
export function watchWidth(container: Element, clock: Clock, width: number, resize: (width: number) => void): () => void {
  if (typeof ResizeObserver !== "function") return () => {};
  let measured = width;
  let pending = width;
  let stopFrame: (() => void) | undefined;
  const observer = new ResizeObserver((entries) => {
    const next = entries[entries.length - 1]?.contentRect.width ?? 0;
    if (!(next > 0) || Math.abs(next - pending) < 0.5) return;
    pending = next;
    // Once per frame, outside the observer callback, so the new height can't loop back into it.
    stopFrame ??= clock.onFrame(() => {
      stopFrame?.();
      stopFrame = undefined;
      if (Math.abs(pending - measured) < 0.5) return;
      measured = pending;
      resize(measured);
    });
  });
  observer.observe(container);
  return () => {
    observer.disconnect();
    stopFrame?.();
  };
}

/** Calls `loaded` each time web fonts finish loading: text measured before then was measured in a fallback font. */
export function watchFonts(doc: Document, loaded: () => void): () => void {
  const fonts = (doc as Document & { fonts?: EventTarget }).fonts;
  fonts?.addEventListener?.("loadingdone", loaded);
  return () => fonts?.removeEventListener?.("loadingdone", loaded);
}

/** CSS hover transitions read their duration, `--ec-hover-duration`, from motion, like everything else. */
export function watchHoverDuration(svg: SVGSVGElement, motion: ChartMotion): () => void {
  const sync = (): void => svg.style.setProperty("--ec-hover-duration", `${motion.duration(100, "feedback")}ms`);
  sync();
  return motion.subscribe(sync);
}
