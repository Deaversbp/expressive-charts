// What a chart follows on the page besides its options: its container's width, web fonts arriving,
// the size of its text, and the motion that times its CSS hover transitions. Each returns its stop.

import type { Clock } from "../../core";
import type { ChartMotion } from "../motion";
import { svgElement } from "../render/svg";

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

/** The text probe's line: letters, a space and digits, so their spacing, size and font all show in its width. */
const PROBE_TEXT = "Hamburgefonstiv 0123456789";

/**
 * Follows the size of the chart's text with a ResizeObserver on a hidden line of it in `svg`, at 11 px,
 * the smallest text a chart draws (its ticks). It has no class, so nothing that finds the chart's text by
 * class finds it: it follows what reaches all of it, such as spacing, a font or a size set on the page
 * after the chart drew, or a browser's minimum font size. `changed` hears of a change of half a px or
 * more from the first width it has, at most once a frame. A width of 0 (a chart in `display: none`) is
 * ignored.
 */
export function watchText(svg: SVGSVGElement, clock: Clock, changed: () => void): () => void {
  if (typeof ResizeObserver !== "function") return () => {};
  // SVG text adds nothing to the page's scroll width, and hidden, it's neither drawn nor hit.
  const probe = svgElement("text", { "font-size": 11, visibility: "hidden", "pointer-events": "none", "aria-hidden": "true" }, svg);
  probe.textContent = PROBE_TEXT;
  let measured = 0;
  let pending = 0;
  let stopFrame: (() => void) | undefined;
  const observer = new ResizeObserver((entries) => {
    const next = entries.find((entry) => entry.target === probe)?.contentRect.width ?? 0;
    if (!(next > 0) || Math.abs(next - pending) < 0.5) return;
    pending = next;
    // The first width seen is the one to compare with: the chart measured its text as it drew.
    if (!measured) {
      measured = next;
      return;
    }
    // Once per frame, as for a resize.
    stopFrame ??= clock.onFrame(() => {
      stopFrame?.();
      stopFrame = undefined;
      if (Math.abs(pending - measured) < 0.5) return;
      measured = pending;
      changed();
    });
  });
  observer.observe(probe);
  return () => {
    observer.disconnect();
    stopFrame?.();
  };
}

/** CSS hover transitions read their duration, `--ec-hover-duration`, from motion, like everything else. */
export function watchHoverDuration(svg: SVGSVGElement, motion: ChartMotion): () => void {
  const sync = (): void => svg.style.setProperty("--ec-hover-duration", `${motion.duration(100, "feedback")}ms`);
  sync();
  return motion.subscribe(sync);
}
