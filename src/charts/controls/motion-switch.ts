// motionSwitch: the viewer's own motion control, the prototype's Presentation / Analysis / Off
// segmented buttons. The viewer operates it, so it calls motion.chooseMode(), the one call that
// overrides the device's reduced-motion setting. It imports only core (and the shared stylesheet).

import type { Motion, MotionMode } from "../../core";
import { injectStyles } from "../render/theme";

export interface MotionSwitchOptions {
  /** The group's visible label, which is also its accessible name. Default "Motion". */
  readonly label?: string;
  /** Button text by mode. Default "Presentation", "Analysis", "Off". */
  readonly labels?: Partial<Readonly<Record<MotionMode, string>>>;
  /**
   * The note beside the buttons, by effective mode, and `reduced` for while the device asks for
   * reduced motion and the viewer hasn't picked a mode.
   */
  readonly hints?: Partial<Readonly<Record<MotionMode | "reduced", string>>>;
  /**
   * A localStorage key. Opt-in: the viewer's choice is saved under it, and restored when the switch
   * is made, so it carries across pages and visits. Storage that's blocked or full is ignored.
   */
  readonly persist?: string;
}

export interface MotionSwitch {
  /** The switch's root, a `role="group"` element appended to the target. */
  readonly element: HTMLElement;
  /** Removes the switch and stops following the motion. The viewer's choice stays. */
  destroy(): void;
}

const MODES: readonly MotionMode[] = ["presentation", "analysis", "off"];

const LABELS: Readonly<Record<MotionMode, string>> = {
  presentation: "Presentation",
  analysis: "Analysis",
  off: "Off"
};

const HINTS: Readonly<Record<MotionMode | "reduced", string>> = {
  presentation: "Staged, unhurried motion. Best for walking someone through a change.",
  analysis: "Quick, unstaged motion. Best for exploring.",
  off: "No motion: charts jump straight to their end state.",
  reduced: "Your device asks for reduced motion, so motion is off. Picking a mode here overrides it."
};

let switches = 0;

/**
 * Builds the motion switch in `target` (an element or a selector): a group of real buttons with
 * `aria-pressed`, one per mode, and a note on what the mode does. The pressed button is the effective
 * mode, so while the device asks for reduced motion and the viewer hasn't picked, Off is pressed and
 * the note says why. It follows `motion.subscribe`, so it stays right whoever changes the mode.
 */
export function motionSwitch(target: string | Element, motion: Motion, options: MotionSwitchOptions = {}): MotionSwitch {
  const parent = resolveTarget(target);
  checkMotion(motion);
  checkOptions(options);
  const labels = { ...LABELS, ...options.labels };
  const hints = { ...HINTS, ...options.hints };
  const { persist } = options;
  const doc = parent.ownerDocument;
  injectStyles(doc);

  const id = `ec-motion-${++switches}`;
  const root = doc.createElement("div");
  root.className = "ec-motion-switch";
  root.setAttribute("role", "group");
  root.setAttribute("aria-labelledby", `${id}-label`);
  root.setAttribute("aria-describedby", `${id}-hint`);

  const label = root.appendChild(doc.createElement("span"));
  label.className = "ec-motion-label";
  label.id = `${id}-label`;
  label.textContent = options.label ?? "Motion";

  const modes = root.appendChild(doc.createElement("span"));
  modes.className = "ec-motion-modes";
  const buttons = MODES.map((mode) => {
    const button = modes.appendChild(doc.createElement("button"));
    button.type = "button";
    button.dataset.mode = mode;
    button.textContent = labels[mode];
    button.addEventListener("click", () => motion.chooseMode(mode));
    return button;
  });

  // Polite: the note changes when the viewer picks a mode, or when the device setting changes.
  const hint = root.appendChild(doc.createElement("span"));
  hint.className = "ec-motion-hint";
  hint.id = `${id}-hint`;
  hint.setAttribute("aria-live", "polite");

  const render = (): void => {
    const mode = motion.mode;
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    hint.textContent = motion.prefersReduced && motion.viewerChoice === undefined ? hints.reduced : hints[mode];
  };

  if (persist !== undefined) {
    const saved = storage(doc, (store) => store.getItem(persist));
    if (MODES.includes(saved as MotionMode)) motion.chooseMode(saved as MotionMode);
  }
  // Drawn before it's in the page, so the live region doesn't announce the first note.
  render();
  parent.appendChild(root);

  const unsubscribe = motion.subscribe(() => {
    render();
    if (persist === undefined) return;
    const choice = motion.viewerChoice;
    storage(doc, (store) => (choice === undefined ? store.removeItem(persist) : store.setItem(persist, choice)));
  });

  let destroyed = false;
  return {
    element: root,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      root.remove();
    }
  };
}

/** Runs `use` on the document's localStorage; anything that throws (blocked, full, sandboxed) is ignored. */
function storage<T>(doc: Document, use: (store: Storage) => T): T | undefined {
  try {
    const store = doc.defaultView?.localStorage;
    return store ? use(store) : undefined;
  } catch {
    return undefined;
  }
}

function resolveTarget(target: string | Element): Element {
  if (typeof target === "string") {
    const found = typeof document === "undefined" ? null : document.querySelector(target);
    if (!found) throw new TypeError(`motionSwitch: no element matches "${target}".`);
    return found;
  }
  if (typeof target !== "object" || target === null || typeof (target as Element).appendChild !== "function") {
    throw new TypeError("motionSwitch needs an element or a selector to build the switch in.");
  }
  return target;
}

function checkMotion(motion: Motion): void {
  if (typeof motion !== "object" || motion === null || typeof motion.chooseMode !== "function" || typeof motion.subscribe !== "function") {
    throw new TypeError("motionSwitch needs a Motion, such as the page-wide `motion` or one from createMotion().");
  }
}

function checkOptions(options: MotionSwitchOptions): void {
  const { label, labels, hints, persist } = options;
  if (label !== undefined && typeof label !== "string") throw new TypeError(`motionSwitch: label must be a string, got ${typeof label}.`);
  for (const [name, texts] of [["labels", labels], ["hints", hints]] as const) {
    if (texts === undefined) continue;
    for (const [key, text] of Object.entries(texts)) {
      if (typeof text !== "string") throw new TypeError(`motionSwitch: ${name}.${key} must be a string, got ${typeof text}.`);
    }
  }
  if (persist !== undefined && (typeof persist !== "string" || persist === "")) {
    throw new TypeError(`motionSwitch: persist must be a localStorage key, got ${JSON.stringify(persist) ?? String(persist)}.`);
  }
}
