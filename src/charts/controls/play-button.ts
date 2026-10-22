// playButton: Play and Pause for a playback() (WCAG 2.2.2: anything that plays for more than 5 s can be
// paused). One real button whose text, and so its name, says what a click does. It has no aria-pressed:
// a toggle button keeps one name, and this one's name changes. It imports only core (and the shared
// stylesheet).

import type { Playback } from "../../core";
import { injectStyles } from "../render/theme";

export interface PlayButtonOptions {
  /** The button's text, which is its accessible name, by what a click does. Default "Play" and "Pause". */
  readonly labels?: Partial<Readonly<Record<"play" | "pause", string>>>;
}

export interface PlayButton {
  /** The `<button type="button">` appended to the target. */
  readonly element: HTMLButtonElement;
  /** Removes the button and stops following the playback, which carries on as it is. */
  destroy(): void;
}

const LABELS: Readonly<Record<"play" | "pause", string>> = { play: "Play", pause: "Pause" };

/**
 * Builds a Play/Pause button in `target` (an element or a selector) for `playback`. A click plays or
 * pauses; the text says Pause while it plays and goes back to Play when it pauses, seeks or ends. It
 * follows `playback.subscribe`, so it stays right whoever drives the playback, and it's the same
 * element throughout, so focus stays on it.
 */
export function playButton(target: string | Element, playback: Playback, options: PlayButtonOptions = {}): PlayButton {
  const parent = resolveTarget(target);
  checkPlayback(playback);
  checkOptions(options);
  const labels = { ...LABELS, ...options.labels };
  const doc = parent.ownerDocument;
  injectStyles(doc);

  const button = doc.createElement("button");
  button.type = "button";
  button.className = "ec-play";
  button.addEventListener("click", () => (playback.playing ? playback.pause() : playback.play()));

  const render = (): void => {
    const text = playback.playing ? labels.pause : labels.play;
    // Only when it changes, so assistive technology doesn't hear the same name again.
    if (button.textContent !== text) button.textContent = text;
  };
  render();
  parent.appendChild(button);
  const unsubscribe = playback.subscribe(render);

  let destroyed = false;
  return {
    element: button,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      button.remove();
    }
  };
}

function resolveTarget(target: string | Element): Element {
  if (typeof target === "string") {
    const found = typeof document === "undefined" ? null : document.querySelector(target);
    if (!found) throw new TypeError(`playButton: no element matches "${target}".`);
    return found;
  }
  if (typeof target !== "object" || target === null || typeof (target as Element).appendChild !== "function") {
    throw new TypeError("playButton needs an element or a selector to build the button in.");
  }
  return target;
}

function checkPlayback(playback: Playback): void {
  if (
    typeof playback !== "object" ||
    playback === null ||
    typeof playback.play !== "function" ||
    typeof playback.pause !== "function" ||
    typeof playback.subscribe !== "function"
  ) {
    throw new TypeError("playButton needs a Playback, from playback().");
  }
}

function checkOptions(options: PlayButtonOptions): void {
  const { labels } = options;
  if (labels === undefined) return;
  for (const [key, text] of Object.entries(labels)) {
    // Only spaces would collapse to a blank button with no accessible name.
    if (typeof text !== "string" || text.trim() === "") {
      throw new TypeError(`playButton: labels.${key} must be a string with some text, got ${JSON.stringify(text) ?? String(text)}.`);
    }
  }
}
